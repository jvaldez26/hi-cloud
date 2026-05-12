import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Suscripcion, PlanTipo, SuscripcionEstado, PLANES, planTieneModulo } from './entities/suscripcion.entity';

export interface UsoLimite {
  usado:      number;
  limite:     number;   // -1 = ilimitado
  ilimitado:  boolean;
  porcentaje: number;   // 0-100 (0 si ilimitado)
  alerta:     boolean;  // >80%
  bloqueado:  boolean;  // >=100%
}

export interface LimitesActuales {
  plan:        PlanTipo;
  planNombre:  string;
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
    const s = await this.repo.findOne({ where: { empresaId } });
    if (!s) {
      const hoy = new Date();
      const fin = new Date(); fin.setDate(fin.getDate() + 30);
      return this.repo.save(this.repo.create({
        empresaId, plan: PlanTipo.TRIAL,
        estado: SuscripcionEstado.ACTIVA,
        fechaInicio: hoy, fechaVencimiento: fin,
      }));
    }
    return s;
  }

  // ── Conteos actuales ──────────────────────────────────────────────────────

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
    const [r] = await this.ds.query<{ cnt: string }[]>(`
      SELECT COUNT(*)::int AS cnt FROM productos
      WHERE "empresaId" = $1 AND "isActive" = true
    `, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarClientes(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`
      SELECT COUNT(*)::int AS cnt FROM clientes
      WHERE "empresaId" = $1 AND "isActive" = true
    `, [empresaId]);
    return Number(r?.cnt ?? 0);
  }

  private async contarSucursales(empresaId: number): Promise<number> {
    const [r] = await this.ds.query<{ cnt: string }[]>(`
      SELECT COUNT(*)::int AS cnt FROM sucursales
      WHERE "empresaId" = $1 AND "isActive" = true
    `, [empresaId]).catch(() => [{ cnt: '1' }]);
    return Number(r?.cnt ?? 1);
  }

  // ── Calcular uso/límite ───────────────────────────────────────────────────

  private calcUso(usado: number, limite: number): UsoLimite {
    const ilimitado  = limite === -1;
    const porcentaje = ilimitado ? 0 : Math.min(100, Math.round((usado / Math.max(1, limite)) * 100));
    return {
      usado, limite, ilimitado,
      porcentaje,
      alerta:    !ilimitado && porcentaje >= 80,
      bloqueado: !ilimitado && usado >= limite,
    };
  }

  // ── API principal ─────────────────────────────────────────────────────────

  async getLimitesActuales(empresaId: number): Promise<LimitesActuales> {
    const sus   = await this.getSuscripcion(empresaId);
    const plan  = sus.plan;
    const cfg   = PLANES[plan];

    const [facturas, usuarios, productos, clientes, sucursales] = await Promise.all([
      this.contarFacturasMes(empresaId),
      this.contarUsuarios(empresaId),
      this.contarProductos(empresaId),
      this.contarClientes(empresaId),
      this.contarSucursales(empresaId),
    ]);

    return {
      plan,
      planNombre: cfg.nombre,
      facturas:   this.calcUso(facturas,   cfg.maxFacturasMes),
      usuarios:   this.calcUso(usuarios,   cfg.maxUsuarios),
      productos:  this.calcUso(productos,  cfg.maxProductos),
      clientes:   this.calcUso(clientes,   cfg.maxClientes),
      sucursales: this.calcUso(sucursales, cfg.maxSucursales),
      modulos:    cfg.modulos,
    };
  }

  // ── Verificaciones individuales ───────────────────────────────────────────

  async verificarLimiteFacturas(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.maxFacturasMes === -1) return;

    const usado = await this.contarFacturasMes(empresaId);
    if (usado >= cfg.maxFacturasMes) {
      throw new ForbiddenException({
        code:       'LIMITE_FACTURAS',
        mensaje:    `Has alcanzado el límite de ${cfg.maxFacturasMes} facturas/mes del plan ${cfg.nombre}.`,
        usado,
        limite:     cfg.maxFacturasMes,
        planActual: sus.plan,
        upgrade:    true,
      });
    }
  }

  async verificarLimiteUsuarios(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.maxUsuarios === -1) return;

    const usado = await this.contarUsuarios(empresaId);
    if (usado >= cfg.maxUsuarios) {
      throw new ForbiddenException({
        code:       'LIMITE_USUARIOS',
        mensaje:    `Has alcanzado el límite de ${cfg.maxUsuarios} usuarios del plan ${cfg.nombre}.`,
        usado,
        limite:     cfg.maxUsuarios,
        planActual: sus.plan,
        upgrade:    true,
      });
    }
  }

  async verificarLimiteProductos(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.maxProductos === -1) return;

    const usado = await this.contarProductos(empresaId);
    if (usado >= cfg.maxProductos) {
      throw new ForbiddenException({
        code:       'LIMITE_PRODUCTOS',
        mensaje:    `Has alcanzado el límite de ${cfg.maxProductos} productos del plan ${cfg.nombre}.`,
        usado,
        limite:     cfg.maxProductos,
        planActual: sus.plan,
        upgrade:    true,
      });
    }
  }

  async verificarLimiteClientes(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.maxClientes === -1) return;

    const usado = await this.contarClientes(empresaId);
    if (usado >= cfg.maxClientes) {
      throw new ForbiddenException({
        code:       'LIMITE_CLIENTES',
        mensaje:    `Has alcanzado el límite de ${cfg.maxClientes} clientes del plan ${cfg.nombre}.`,
        usado,
        limite:     cfg.maxClientes,
        planActual: sus.plan,
        upgrade:    true,
      });
    }
  }

  async verificarLimiteSucursales(empresaId: number): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    const cfg = PLANES[sus.plan];
    if (cfg.maxSucursales === -1) return;

    const usado = await this.contarSucursales(empresaId);
    if (usado >= cfg.maxSucursales) {
      throw new ForbiddenException({
        code:       'LIMITE_SUCURSALES',
        mensaje:    `Has alcanzado el límite de ${cfg.maxSucursales} sucursal(es) del plan ${cfg.nombre}.`,
        usado,
        limite:     cfg.maxSucursales,
        planActual: sus.plan,
        upgrade:    true,
      });
    }
  }

  async verificarModulo(empresaId: number, modulo: string): Promise<void> {
    const sus = await this.getSuscripcion(empresaId);
    if (!planTieneModulo(sus.plan, modulo)) {
      const cfg = PLANES[sus.plan];
      throw new ForbiddenException({
        code:       'MODULO_NO_INCLUIDO',
        mensaje:    `El módulo "${modulo}" no está incluido en el plan ${cfg.nombre}.`,
        planActual: sus.plan,
        modulo,
        upgrade:    true,
      });
    }
  }
}
