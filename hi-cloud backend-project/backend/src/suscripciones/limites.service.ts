import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Suscripcion, PlanTipo, SuscripcionEstado, PLANES, planTieneModulo,
} from './entities/suscripcion.entity';

export interface UsoLimite {
  usado:      number;
  limite:     number;
  ilimitado:  boolean;
  porcentaje: number;
  alerta:     boolean;  // >80%
  alertaRoja: boolean;  // >95%
  bloqueado:  boolean;  // >=100%
}

export interface UsoIngresos {
  ingresosMes:     number;
  limite:          number;
  ilimitado:       boolean;
  porcentaje:      number;
  alerta80:        boolean;
  alerta95:        boolean;
  bloqueado:       boolean;
  enPeriodoGracia: boolean;
  planNombre:      string;
  planCodigo:      PlanTipo;
}

export interface LimitesActuales {
  plan:        PlanTipo;
  planNombre:  string;
  ingresos:    UsoIngresos;
  facturas:    UsoLimite;
  usuarios:    UsoLimite;
  productos:   UsoLimite;
  clientes:    UsoLimite;
  sucursales:  UsoLimite;
  modulos:     string[];
}

@Injectable()
export class LimitesService {
  private readonly logger = new Logger(LimitesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private repo: Repository<Suscripcion>,
    private ds:   DataSource,
  ) {}

  // ── Obtener suscripción activa ────────────────────────────────────────────

  async getSuscripcion(empresaId: number): Promise<Suscripcion> {
    let s = await this.repo.findOne({ where: { empresaId } });
    if (!s) {
      const hoy = new Date();
      const fin = new Date(); fin.setDate(fin.getDate() + 15);
      const entity = this.repo.create({
        empresaId, plan: PlanTipo.EMPRENDEDOR,
        estado: SuscripcionEstado.PRUEBA,
        fechaInicio: hoy, fechaVencimiento: fin,
        mesPeriodo: this.mesActual(),
      });
      (entity as any).fechaFinPrueba = fin;
      s = await this.repo.save(entity);
    }

    // Reset automático si cambió de mes
    await this.resetMensualSiNecesario(s);
    return (await this.repo.findOne({ where: { empresaId } })) ?? s;
  }

  private mesActual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private async resetMensualSiNecesario(s: Suscripcion): Promise<void> {
    const mes = this.mesActual();
    if (s.mesPeriodo !== mes) {
      await this.repo.update(s.id, {
        ingresosMesActualDop: 0,
        mesPeriodo:           mes,
        facturasMesUsadas:    0,
      } as any);
      this.logger.log(`Reset mensual empresa #${s.empresaId} → ${mes}`);
    }
  }

  // ── Cálculo de ingresos del mes ───────────────────────────────────────────

  async calcularIngresosMes(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ total: string }[]>(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM facturas
      WHERE "empresaId" = $1
        AND "isActive" = true
        AND estado IN ('emitida','pagada')
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
    `, [empresaId]);

    // Restar notas de crédito del mes (reducen los ingresos reales)
    const [nc] = await this.ds.query<{ total: string }[]>(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM notas_credito
      WHERE "empresaId" = $1
        AND "isActive" = true
        AND estado NOT IN ('borrador','anulada')
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
    `, [empresaId]).catch(() => [{ total: '0' }]);

    return Math.max(0, Number(r?.total ?? 0) - Number(nc?.total ?? 0));
  }

  /** Actualiza el cache de ingresos del mes — llamar al confirmar/anular facturas */
  async actualizarCacheIngresos(empresaId: number): Promise<void> {
    const ingresos = await this.calcularIngresosMes(empresaId);
    const s = await this.getSuscripcion(empresaId);
    await this.repo.update(s.id, {
      ingresosMesActualDop: ingresos,
      mesPeriodo:           this.mesActual(),
    } as any);
  }

  // ── Verificar límite de ingresos (enforcement principal) ──────────────────

  /**
   * Verifica si una nueva factura de `montoFactura` DOP puede emitirse
   * según el plan de la empresa. Lanza PaymentRequiredException (402) si supera.
   * También devuelve avisos preventivos al 80% y 95%.
   */
  async verificarLimiteIngresos(
    empresaId: number,
    montoFactura: number,
  ): Promise<{ aviso?: string; porcentaje: number }> {
    const s   = await this.getSuscripcion(empresaId);
    const cfg = PLANES[s.plan];
    const limite = cfg.limiteIngresosMensualesDop;

    // Sin límite — Enterprise/Plus con ilimitado
    if (limite === -1) return { porcentaje: 0 };

    // Período de gracia — avisar pero no bloquear
    const enGracia = s.enPeriodoGracia &&
      s.fechaFinGracia && new Date(s.fechaFinGracia) > new Date();

    const ingresoActual = Number(s.ingresosMesActualDop ?? 0);
    const ingresoFuturo = ingresoActual + montoFactura;
    const pct = Math.round((ingresoFuturo / limite) * 100);

    if (ingresoFuturo > limite && !enGracia) {
      const disponible = Math.max(0, limite - ingresoActual);
      throw new ForbiddenException({
        code:        'LIMITE_INGRESOS',
        statusCode:  402,
        mensaje:     `Has alcanzado el límite de tu plan ${cfg.nombre} (RD$${limite.toLocaleString('es-DO')}/mes). ` +
                     `Esta factura por RD$${montoFactura.toLocaleString('es-DO')} superaría el límite. ` +
                     `Actualiza tu plan para continuar facturando.`,
        ingresosMes:  ingresoActual,
        montoFactura,
        ingresoFuturo,
        limite,
        disponible,
        planActual:  s.plan,
        planNombre:  cfg.nombre,
        upgrade:     true,
      });
    }

    const pctActual = Math.round((ingresoActual / limite) * 100);

    if (pct >= 95) {
      return {
        aviso: `Te queda menos del ${100 - pctActual}% de tu cupo mensual (RD$${(limite - ingresoActual).toLocaleString('es-DO')} restantes). Considera actualizar tu plan.`,
        porcentaje: pctActual,
      };
    }

    if (pct >= 80) {
      return {
        aviso: `Has usado el ${pctActual}% de tu cupo mensual. Te quedan RD$${(limite - ingresoActual).toLocaleString('es-DO')}.`,
        porcentaje: pctActual,
      };
    }

    return { porcentaje: pctActual };
  }

  async getUsoIngresos(empresaId: number): Promise<UsoIngresos> {
    const s   = await this.getSuscripcion(empresaId);
    const cfg = PLANES[s.plan];
    const ingresos = Number(s.ingresosMesActualDop ?? 0);
    const limite   = cfg.limiteIngresosMensualesDop;
    const ilimitado = limite === -1;
    const pct = ilimitado ? 0 : Math.round((ingresos / Math.max(1, limite)) * 100);

    return {
      ingresosMes:     ingresos,
      limite,
      ilimitado,
      porcentaje:      pct,
      alerta80:        !ilimitado && pct >= 80,
      alerta95:        !ilimitado && pct >= 95,
      bloqueado:       !ilimitado && ingresos >= limite,
      enPeriodoGracia: s.enPeriodoGracia && !!s.fechaFinGracia && new Date(s.fechaFinGracia) > new Date(),
      planNombre:      cfg.nombre,
      planCodigo:      s.plan,
    };
  }

  // ── Conteos (legado + usuarios) ───────────────────────────────────────────

  private async contarFacturasMes(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`
      SELECT COUNT(*)::int AS cnt FROM facturas
      WHERE "empresaId" = $1
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
        AND "isActive" = true AND estado != 'cancelada'
    `, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarUsuarios(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`
      SELECT COUNT(DISTINCT ue."userId")::int AS cnt
      FROM usuario_empresa ue
      WHERE ue."empresaId" = $1 AND ue."isActive" = true
    `, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarProductos(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`SELECT COUNT(*)::int AS cnt FROM productos WHERE "empresaId" = $1 AND "isActive" = true`, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarClientes(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`SELECT COUNT(*)::int AS cnt FROM clientes WHERE "empresaId" = $1 AND "isActive" = true`, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarSucursales(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`SELECT COUNT(*)::int AS cnt FROM sucursales WHERE "empresaId" = $1 AND "isActive" = true`, [empresaId]).catch(() => [{ cnt: '1' }]);
    return Number(r?.cnt ?? 1);
  }

  private calcUso(usado: number, limite: number): UsoLimite {
    const ilimitado  = limite === -1;
    const porcentaje = ilimitado ? 0 : Math.min(100, Math.round((usado / Math.max(1, limite)) * 100));
    return {
      usado, limite, ilimitado, porcentaje,
      alerta:    !ilimitado && porcentaje >= 80,
      alertaRoja: !ilimitado && porcentaje >= 95,
      bloqueado: !ilimitado && usado >= limite,
    };
  }

  async getLimitesActuales(empresaId: number): Promise<LimitesActuales> {
    const sus   = await this.getSuscripcion(empresaId);
    const cfg   = PLANES[sus.plan];
    const [facturas, usuarios, productos, clientes, sucursales, ingresos] = await Promise.all([
      this.contarFacturasMes(empresaId),
      this.contarUsuarios(empresaId),
      this.contarProductos(empresaId),
      this.contarClientes(empresaId),
      this.contarSucursales(empresaId),
      this.getUsoIngresos(empresaId),
    ]);
    return {
      plan: sus.plan,
      planNombre: cfg.nombre,
      ingresos,
      facturas:   this.calcUso(facturas,   cfg.maxFacturasMes),
      usuarios:   this.calcUso(usuarios,   cfg.limiteUsuarios === -1 ? -1 : cfg.limiteUsuarios),
      productos:  this.calcUso(productos,  cfg.maxProductos),
      clientes:   this.calcUso(clientes,   cfg.maxClientes),
      sucursales: this.calcUso(sucursales, cfg.maxSucursales),
      modulos:    cfg.modulos,
    };
  }

  // ── Verificaciones legacy (mantenidas para no romper código existente) ─────

  async verificarLimiteFacturas(empresaId: number): Promise<void> {
    // Redirigir al check de ingresos — pasar monto 0 solo verifica el estado actual
    const s = await this.getSuscripcion(empresaId);
    const cfg = PLANES[s.plan];
    if (cfg.limiteIngresosMensualesDop === -1) return;
    // Solo verifica estado (sin monto específico) — el check real se hace en facturas.service con el monto
  }

  async verificarLimiteUsuarios(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.limiteUsuarios === -1) return;
    const usado = await this.contarUsuarios(empresaId);
    if (usado >= cfg.limiteUsuarios) {
      const planesStr = { emprendedor: 'PYME', pyme: 'PRO', pro: 'PLUS', plus: 'PLUS' };
      const siguiente = planesStr[sus.plan as keyof typeof planesStr] ?? 'un plan superior';
      throw new ForbiddenException({
        code: 'LIMITE_USUARIOS',
        mensaje: `Has alcanzado el límite de ${cfg.limiteUsuarios} usuario(s) de tu plan ${cfg.nombre}. Para añadir más usuarios, actualiza al plan ${siguiente}.`,
        usado, limite: cfg.limiteUsuarios, planActual: sus.plan, upgrade: true,
      });
    }
  }

  async verificarLimiteProductos(_empresaId: number): Promise<void> { return; }
  async verificarLimiteClientes(_empresaId: number): Promise<void>  { return; }
  async verificarLimiteSucursales(_empresaId: number): Promise<void> { return; }

  async verificarModulo(_empresaId: number, _modulo: string): Promise<void> {
    return; // todos los módulos disponibles en todos los planes
  }
}
