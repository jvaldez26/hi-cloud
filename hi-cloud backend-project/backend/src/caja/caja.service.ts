import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
  HttpException, HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, In, EntityManager } from 'typeorm';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { AjusteCierreCaja } from './entities/ajuste-cierre-caja.entity';
import { RetiroCaja, CategoriaRetiro, EstadoRetiro } from './entities/retiro-caja.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { fechaHoyRD, fechaHoraRD } from '../common/utils/fecha-local.util';
// Fórmula única del efectivo esperado — ver efectivo-esperado.util.ts.
// Nadie debe volver a escribirla a mano, ni aquí ni en el frontend.
import {
  calcularEfectivoEsperado,
  calcularDiferencia,
  calcularDisponibleParaRetiro,
  disponibleParaAutorizar,
  esperadoEsInconsistente,
  excesoDeRetiros,
  FORMULA_EFECTIVO_VERSION,
} from './efectivo-esperado.util';
import {
  construirCuadrePorForma,
  detectarPosibleFormaMalRegistrada,
  derivarCuadreLegacy,
  aplicarAjustesAlCuadre,
  fueraDeUmbral,
  TIPOS_DGII_POR_FORMA,
  FilaCuadre,
  SospechaFormaPago,
} from './cuadre-por-forma-pago.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

/** Mismas 4 etiquetas que usa el frontend para el cuadre — para el mensaje de la validación de abajo. */
const LABEL_FORMA_CUADRE: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otros: 'Otros',
};

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);

  constructor(
    @InjectRepository(CierreCaja)
    private repo:            Repository<CierreCaja>,
    @InjectRepository(RetiroCaja)
    private retiroRepo:      Repository<RetiroCaja>,
    private dataSource:      DataSource,
    private tenantService:   TenantService,
    private realtimeService: RealtimeService,
    private notificacionesService: NotificacionesService,
  ) {}

  // ── Migración defensiva ───────────────────────────────────────────────────
  private async eliminarConstraintAntigua() {
    try {
      await this.dataSource.query(
        `ALTER TABLE cierres_caja DROP CONSTRAINT IF EXISTS "cierres_caja_fecha_key"`,
      );
      await this.dataSource.query(
        `DO $$ BEGIN
           IF EXISTS (
             SELECT 1 FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             WHERE t.relname = 'cierres_caja' AND c.contype = 'u'
               AND c.conname NOT LIKE 'UQ_caja_fecha_vendedor'
               AND array_length(c.conkey, 1) = 1
           ) THEN
             EXECUTE (
               SELECT 'ALTER TABLE cierres_caja DROP CONSTRAINT "' || c.conname || '"'
               FROM pg_constraint c
               JOIN pg_class t ON t.oid = c.conrelid
               WHERE t.relname = 'cierres_caja' AND c.contype = 'u'
                 AND c.conname NOT LIKE 'UQ_caja_fecha_vendedor'
                 AND array_length(c.conkey, 1) = 1
               LIMIT 1
             );
           END IF;
         END $$`,
      );
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_caja_fecha_vendedor"
         ON cierres_caja(fecha, "vendedorId")
         WHERE "vendedorId" IS NOT NULL`,
      );
    } catch (e) {
      this.logger.warn('eliminarConstraintAntigua (ignorado): ' + e);
    }
  }

  // ── Usuarios operativos de la empresa (para vincular a perfil vendedor) ────

  async listarUsuarios(): Promise<{ id: number; nombre: string; email: string; role: string }[]> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.dataSource.query(`
      SELECT u.id, u.nombre, u.email, u.role
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      WHERE ue."empresaId" = $1
        AND ue."isActive"  = true
        AND u."isActive"   = true
        AND u.role NOT IN ('super_admin', 'viewer')
      ORDER BY u.nombre
    `, [empresaId]);
  }

  // ── Cajeros activos de la empresa ─────────────────────────────────────────

  async listarCajeros(): Promise<{
    id: number; nombre: string; codigo: string; email: string | null;
  }[]> {
    const empresaId = this.tenantService.getEmpresaId();
    // Devuelve vendedores — mismo origen que el POS (GET /vendedores).
    // Así vendedorId en cierres_caja siempre es un vendedor.id consistente.
    // Si el vendedor tiene usuarioId, trae el email del usuario para mostrarlo.
    return this.dataSource.query(`
      SELECT
        v.id,
        v.nombre,
        v.codigo,
        COALESCE(u.email, v.email) AS email
      FROM vendedores v
      LEFT JOIN users u ON u.id = v."usuarioId" AND u."isActive" = true
      WHERE v."empresaId" = $1
        AND v."isActive"  = true
        AND v.activo      = true
      ORDER BY v.nombre
    `, [empresaId]);
  }

  // ── Abrir caja por vendedor ────────────────────────────────────────────────

  async abrirCaja(
    userId: number,
    saldoApertura = 0,
    notas?: string,
    vendedorId?: number,
    vendedorNombre?: string,
  ) {
    const empresaId = this.tenantService.getEmpresaId();

    // Causa real (caja #714, empresa 44, 2026-10-03): un JWT emitido por
    // POST /auth/refresh nunca llevaba sucursalId (ver AuthService.
    // buildAccessTokenForUser, ahora corregido) — el CLS quedaba sin
    // sucursal para toda petición hecha con ese token, y abrirCaja() lo
    // escribía en silencio como NULL. Cortamos aquí: sin sucursal válida
    // en el token, no se abre caja — el usuario debe re-loguearse.
    const sucursalId = this.tenantService.getSucursalId();
    if (!sucursalId) {
      throw new BadRequestException(
        'No se pudo determinar tu sucursal activa. Cierra sesión y vuelve a entrar para continuar.',
      );
    }

    // Resolver nombre del cajero.
    // vendedorId es siempre un vendedor.id (tabla vendedores) — el POS
    // usa GET /vendedores y envía ese ID. Buscamos el nombre ahí primero.
    if (vendedorId && !vendedorNombre) {
      const rows = await this.dataSource.query(
        `SELECT nombre FROM vendedores WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [vendedorId, empresaId],
      );
      if (rows[0]?.nombre) {
        vendedorNombre = rows[0].nombre;
      } else {
        // Fallback: compatibilidad con cajas antiguas que guardaban user.id
        const userRows = await this.dataSource.query(
          `SELECT nombre FROM users WHERE id = $1`, [vendedorId],
        );
        vendedorNombre = userRows[0]?.nombre ?? String(vendedorId);
      }
    }
    const hoy = fechaHoyRD();

    // ── Bloquear si hay una caja huérfana (abierta de un día anterior) ────────
    // Un cajero que no cerró su turno ayer no puede abrir uno nuevo hasta cerrar
    // el pendiente. Sin este check acumularía cajas abiertas indefinidamente.
    // PREREQUISITO: correr el script de depuración masiva antes de desplegar este
    // bloque, o empresas con cajas acumuladas quedarán sin poder abrir turno.
    //
    // Si el control de caja está desactivado para esta empresa, el check se omite:
    // la apertura de turno no es un requisito y no debe bloquear a nadie.
    const controlActivo = await this.controlCajaActivoParaEmpresa(empresaId);
    if (!controlActivo) {
      // Sin control de caja la apertura de turno es un no-op: devolvemos ok sin crear registro.
      // Si el frontend llamó por error, no fallamos — simplemente retornamos una caja ficticia vacía.
      this.logger.debug(`abrirCaja ignorada — controlCajaActivo=false para empresaId=${empresaId}`);
      return { id: 0, empresaId, estado: EstadoCierre.ABIERTA } as any;
    }

    const where_huerfana: any[] = vendedorId
      ? [
          { empresaId, vendedorId,       estado: EstadoCierre.ABIERTA } as any,
          { empresaId, vendedorId: IsNull(), estado: EstadoCierre.ABIERTA } as any,
        ]
      : [{ empresaId, vendedorId: IsNull(), estado: EstadoCierre.ABIERTA } as any];

    const cajaHuerfana = await this.repo.findOne({
      where: where_huerfana,
      order: { fecha: 'ASC' }, // la más antigua primero: es la que hay que cerrar
    });

    if (cajaHuerfana) {
      const fechaCaja = (cajaHuerfana.fecha instanceof Date
        ? cajaHuerfana.fecha
        : new Date(cajaHuerfana.fecha as any))
        .toISOString().substring(0, 10);

      if (fechaCaja < hoy) {
        const [anio, mes, dia] = fechaCaja.split('-');
        const fechaFmt = `${dia}/${mes}/${anio}`;
        throw new BadRequestException(
          `CAJA_HUERFANA:${cajaHuerfana.id}:` +
          `Tienes una caja abierta desde el ${fechaFmt}. Ciérrala antes de abrir un nuevo turno.`,
        );
      }
    }

    // Buscar caja existente para este vendedor HOY dentro de la misma empresa
    const where: any = { fecha: new Date(hoy) as any, empresaId };
    where.vendedorId = vendedorId ? vendedorId : IsNull();

    const existe = await this.repo.findOne({ where });
    if (existe) {
      if (existe.estado === EstadoCierre.ABIERTA) return existe;
      const quien = vendedorNombre ? ` (${vendedorNombre})` : '';
      throw new BadRequestException(`La caja del ${hoy}${quien} ya fue cerrada`);
    }

    try {
      const nueva = await this.repo.save(
        this.repo.create({
          fecha: new Date(hoy),
          saldoApertura,
          notas,
          userId,
          empresaId,
          vendedorId:     vendedorId    ?? undefined,
          vendedorNombre: vendedorNombre ?? undefined,
          sucursalId,
        }),
      );
      this.realtimeService.notify(empresaId, 'caja', 'created', nueva.id);
      return nueva;
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate key')) {
        this.logger.warn(`Constraint única antigua detectada. Migrando…`);
        await this.eliminarConstraintAntigua();

        const existeGlobal = await this.repo.findOne({
          where: { fecha: new Date(hoy) as any, empresaId } as any,
        });
        if (existeGlobal && existeGlobal.estado === EstadoCierre.ABIERTA && !existeGlobal.vendedorId) {
          await this.repo.update(existeGlobal.id, { vendedorId, vendedorNombre });
          this.realtimeService.notify(empresaId, 'caja', 'updated', existeGlobal.id);
          return this.repo.findOne({ where: { id: existeGlobal.id } });
        }

        const reintento = await this.repo.save(
          this.repo.create({ fecha: new Date(hoy), saldoApertura, notas, userId, empresaId, vendedorId, vendedorNombre }),
        );
        this.realtimeService.notify(empresaId, 'caja', 'created', reintento.id);
        return reintento;
      }
      throw err;
    }
  }

  // ── Cerrar caja ───────────────────────────────────────────────────────────

  async cerrarCaja(
    id: number,
    saldoFisico: number,
    notas?: string,
    desgloseBilletes?: Record<string, number>,
    desglosePago?: Record<string, string>,
    usuario?: { id: number; nombre?: string },
    motivo?: string,
    declaradoPorForma?: { forma: string; monto: number; confirmado?: boolean }[],
    /** Header x-supervisor-token — ver la política 'cierre_caja_descuadre'. */
    supervisorToken?: string,
    /** Motivo obligatorio que escribe el SUPERVISOR (no la cajera) tras ver
     *  la tabla por forma de pago — ver el flujo de abajo. */
    motivoDescuadre?: string,
  ) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    if (caja.estado !== EstadoCierre.ABIERTA) {
      throw new BadRequestException('La caja ya está cerrada');
    }

    // Pertenencia: un VENDEDOR solo puede cerrar SU PROPIA caja (quien la
    // abrió, o la de su propio perfil de vendedor) — nunca la de otro cajero.
    // ADMIN/CONTADOR SÍ pueden cerrar cualquiera de la empresa (ya lo exige
    // @Roles en el controller), pero si NO es la suya exigen un motivo
    // explícito — antes ni se verificaba pertenencia (cualquier vendedor
    // cerraba la de otro con solo mandar su id) ni quedaba constancia de por
    // qué un admin cerró la caja de alguien más.
    //
    // El rol que decide es el de la empresa ACTIVA (TenantService,
    // usuario_empresa) — nunca uno que llegue de afuera: `users.role` solo
    // se sincroniza con la empresa PRINCIPAL del usuario, así que un
    // VENDEDOR aquí pero admin/contador en su empresa principal pasaba
    // este chequeo sin restricción (bug real, 2026-10-09 — ver el mismo
    // comentario en requiere-supervisor.guard.ts).
    let notasFinal = notas ?? caja.notas;
    if (usuario) {
      const esSuya = await this.esCajaDelUsuario(caja, usuario, empresaId);
      if (!esSuya) {
        if (this.tenantService.getRolEmpresa() === UserRole.VENDEDOR) {
          throw new ForbiddenException('No puedes cerrar la caja de otro cajero');
        }
        if (!motivo?.trim()) {
          throw new BadRequestException('Debes indicar un motivo para cerrar la caja de otro cajero');
        }
        // El motivo no tiene columna propia — se deja en notas, que ya es lo
        // que se ve en el detalle del cierre, en el PDF, y en la auditoría
        // (valorNuevo guarda la fila completa de la respuesta).
        const marca = `[Cerrada por ${usuario.nombre ?? `usuario #${usuario.id}`} a nombre de ${caja.vendedorNombre ?? 'el cajero'} — motivo: ${motivo.trim()}]`;
        notasFinal = notasFinal ? `${marca} ${notasFinal}` : marca;
      }
    }

    // La columna fecha es tipo DATE almacenada como UTC midnight (new Date('YYYY-MM-DD')).
    // NO convertir con toLocaleDateString + zona horaria: eso da el día anterior (UTC-4 convierte
    // 2026-05-26T00:00:00Z → 2026-05-25 20:00 RD → fecha '2026-05-25', off-by-one).
    // toISOString() recupera exactamente la fecha UTC original que se guardó.
    const fechaDate = caja.fecha instanceof Date ? caja.fecha : new Date(caja.fecha as any);
    const fechaStr  = fechaDate.toISOString().substring(0, 10);
    await this.recalcularDesdeBD(id, fechaStr, caja.vendedorId, empresaId);

    const fresh = await this.repo.findOne({ where: { id } }) as CierreCaja;

    // Fórmula única (efectivo-esperado.util). Antes se calculaba aquí a mano y
    // sumaba `cobrosRecibidos` entero — con transferencias y cheques dentro —
    // y no contaba los anticipos en efectivo.
    const saldoCierre = calcularEfectivoEsperado({
      saldoApertura:     fresh.saldoApertura,
      ventasEfectivo:    fresh.ventasEfectivo,
      cobrosEfectivo:    fresh.cobrosEfectivo,
      anticiposEfectivo: fresh.anticiposEfectivo,
      gastosEfectivo:    fresh.gastosEfectivo,
      retiros:           fresh.retiros,
    });

    const diferencia = calcularDiferencia(saldoFisico, saldoCierre);

    // Cuadre por forma de pago (ver cuadre-por-forma-pago.util.ts) — el efectivo
    // usa la MISMA fórmula única de arriba, nunca se recalcula distinto.
    // facturasSinFormaPago se calcula PRIMERO: su total se resta del bucket
    // "otros" dentro de calcularEsperadoPorForma — están fuera del cuadre,
    // nunca deben inflar el esperado de ninguna forma.
    const facturasSinFormaPago = await this.getFacturasSinFormaPago(fechaStr, caja.vendedorId, empresaId);
    const totalSinFormaPago = facturasSinFormaPago.reduce((s, f) => s + Number(f.total || 0), 0);
    const esperadoPorForma = await this.calcularEsperadoPorForma(id, fechaStr, caja.vendedorId, empresaId, fresh, undefined, totalSinFormaPago);

    const declaradoRecibido = declaradoPorForma ?? [];
    const declaradoMap: Record<string, number> = declaradoRecibido.reduce(
      (acc, d) => { acc[d.forma] = (acc[d.forma] ?? 0) + Number(d.monto || 0); return acc; },
      {} as Record<string, number>,
    );
    declaradoMap.efectivo = saldoFisico; // el efectivo siempre viene de saldoFisico, declaradoPorForma lo ignora si lo trae

    // El endpoint EXIGE la declaración por cada forma con ventas en el turno
    // — sin esto, un formulario que solo pide efectivo (como el de Caja
    // Diaria, antes de unificarse con el del POS) podía cerrar silenciando
    // tarjeta/transferencia en 0. `confirmado: true` es la salida explícita
    // para cuando genuinamente no se cobró nada por esa forma a pesar de las
    // ventas (caso real, bug de origen: FAC-1803 con tarjeta/efectivo
    // invertidos — una forma que SÍ tuvo ventas pero el cajero no declaró).
    const confirmadosEnCero = new Set(declaradoRecibido.filter(d => d.confirmado).map(d => d.forma));
    const formasSinDeclarar = Object.keys(esperadoPorForma).filter(forma => {
      if (forma === 'efectivo') return false; // siempre viene por saldoFisico
      const esperado = Number(esperadoPorForma[forma] ?? 0);
      if (esperado <= 0.01) return false; // sin ventas en esta forma, no hay nada que declarar
      const declarado = Number(declaradoMap[forma] ?? 0);
      if (declarado > 0.01) return false; // sí se declaró algo
      return !confirmadosEnCero.has(forma);
    });
    if (formasSinDeclarar.length) {
      const detalle = formasSinDeclarar
        .map(f => `${LABEL_FORMA_CUADRE[f] ?? f} (${Number(esperadoPorForma[f] ?? 0).toFixed(2)} esperado)`)
        .join(', ');
      throw new BadRequestException(
        `Declara cuánto se cobró por ${detalle} antes de cerrar, o confirma explícitamente que no se cobró nada por esa forma.`,
      );
    }

    const cuadrePorFormaPago = construirCuadrePorForma(esperadoPorForma, declaradoMap);
    const sospechas = detectarPosibleFormaMalRegistrada(cuadrePorFormaPago);

    const sospechasConCandidatas = await Promise.all(sospechas.map(async s => ({
      ...s,
      facturasCandidatas: await this.buscarFacturasCandidatasSospecha(s, fechaStr, caja.vendedorId, empresaId),
    })));

    // Umbral de alerta por descuadre — decisión explícita 2026-10-10: se
    // evalúa por CADA forma de pago Y por el neto, SIEMPRE al cerrar (el
    // cierre ciego decide qué ve la cajera, no si el sistema vigila el
    // descuadre — antes este chequeo solo corría con cierreCajaCiego activo
    // y solo miraba el efectivo, así que un faltante de tarjeta con el
    // efectivo cuadrado nunca se detectaba). Ver fueraDeUmbral().
    const { umbralDescuadreCaja } = await this.getEmpresaCfg(empresaId);
    const descuadre = fueraDeUmbral(cuadrePorFormaPago, umbralDescuadreCaja);

    // Política "Cierre de caja con descuadre" (desactivada por defecto,
    // decisión explícita 2026-10-10) — si está activa y el cierre quedó
    // fuera de umbral, un supervisor (nunca la propia cajera, ni siquiera un
    // ADMIN/CONTADOR cerrando su propia caja) tiene que autorizarlo ANTES de
    // guardar, ver la tabla por forma de pago, y escribir un motivo. La
    // cajera nunca ve el monto de la diferencia: el 403 es genérico y la
    // tabla solo viaja en la respuesta 428, después de que el supervisor ya
    // probó su identidad con su propia clave/tarjeta.
    let estadoFinal: EstadoCierre = EstadoCierre.CERRADA;
    let autorizacionPrevia: { motivo: string; supervisorId: number; supervisorNombre: string } | null = null;

    if (descuadre) {
      const { requerido, modo } = await this.politicaCierreDescuadre(empresaId);
      if (requerido) {
        const cajeroId = usuario?.id;
        const pedirAutorizacion = (mensaje: string) => {
          throw new ForbiddenException({
            message: mensaje,
            supervisorClaveRequerida: 'cierre_caja_descuadre',
            supervisorModo: modo,
          });
        };
        if (!cajeroId || !supervisorToken) {
          pedirAutorizacion('Este cierre requiere autorización de un supervisor.');
        } else if (!motivoDescuadre?.trim()) {
          // El token ya es válido (el supervisor probó su identidad) pero
          // todavía no se consume: hace falta que vea la tabla y escriba el
          // motivo antes de gastarlo.
          const peek = await this.peekTokenDescuadre(empresaId, cajeroId, supervisorToken);
          if (!peek.ok) pedirAutorizacion(peek.mensaje!);
          throw new HttpException({
            requiereMotivoDescuadre: true,
            mensaje: 'Autorización válida — revisa la tabla y escribe el motivo para confirmar el cierre.',
            cuadrePorFormaPago,
            neto: Number(diferencia.toFixed(2)),
            supervisorToken,
          }, HttpStatus.PRECONDITION_REQUIRED);
        } else {
          const consumo = await this.consumirTokenDescuadre(empresaId, cajeroId, supervisorToken);
          if (!consumo.ok) pedirAutorizacion(consumo.mensaje!);
          else {
            estadoFinal = EstadoCierre.REVISADA;
            autorizacionPrevia = {
              motivo: motivoDescuadre.trim(),
              supervisorId: consumo.supervisorId!,
              supervisorNombre: consumo.supervisorNombre!,
            };
          }
        }
      }
    }

    await this.repo.update(id, {
      estado:           estadoFinal,
      saldoCierre:      Number(saldoCierre.toFixed(2)),
      saldoFisico:      Number(saldoFisico.toFixed(2)),
      diferencia:       Number(diferencia.toFixed(2)),
      // Deja constancia de con qué fórmula salieron estos números. Un recierre
      // de un cierre viejo pasa a 2 aquí, y su versión 1 queda preservada en
      // formulaVersionOriginal.
      formulaVersion:   FORMULA_EFECTIVO_VERSION,
      notas:            notasFinal,
      cuadrePorFormaPago:   cuadrePorFormaPago,
      facturasSinFormaPago: facturasSinFormaPago,
      sospechasFormaPago:   sospechasConCandidatas,
      fueraDeUmbral:        descuadre,
      ...(autorizacionPrevia ? {
        motivoAprobacionDescuadre: autorizacionPrevia.motivo,
        aprobadoPorUsuarioId:      autorizacionPrevia.supervisorId,
        aprobadoPorNombre:         autorizacionPrevia.supervisorNombre,
        aprobadoEn:                new Date(),
      } : {}),
      ...(desgloseBilletes ? { desgloseBilletes } : {}),
      ...(desglosePago     ? { desglosePago }     : {}),
    });

    const quien = caja.vendedorNombre ? ` [${caja.vendedorNombre}]` : '';
    this.logger.log(`Caja #${id}${quien} cerrada. Diferencia: ${diferencia.toFixed(2)}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);

    const saved = await this.repo.findOne({ where: { id } });

    if (descuadre) {
      this.logger.warn(
        `[DESCUADRE] Caja #${id}${quien}: fuera de umbral (umbral=${umbralDescuadreCaja}).` +
        (autorizacionPrevia ? ` Autorizado por ${autorizacionPrevia.supervisorNombre}.` : '') + ' ' +
        cuadrePorFormaPago.map(f => `${f.forma}=${f.diferencia.toFixed(2)}`).join(', '),
      );
      // Nunca bloquea el cierre — si la notificación falla (SMTP caído,
      // etc.) la caja ya está cerrada y guardada; solo se pierde el aviso.
      // Se notifica igual aunque ya haya autorización previa del supervisor
      // (requisito explícito: "se sigue notificando a ADMIN y CONTADOR").
      this.notificacionesService.notificarDescuadreCierre(empresaId, {
        cajero: caja.vendedorNombre ?? 'Administrador',
        caja: `Caja #${id}`,
        fecha: fechaStr,
        filas: cuadrePorFormaPago,
        neto: Number(diferencia.toFixed(2)),
      }).catch((e: Error) => this.logger.error(`Error notificando descuadre caja #${id}: ${e.message}`));
    }

    // Caja ya cerrada — siempre retornar datos completos para que la impresión sea íntegra
    return saved;
  }

  /** Política de la empresa para la clave 'cierre_caja_descuadre' — fila propia o el default del catálogo. */
  private async politicaCierreDescuadre(empresaId: number): Promise<{ requerido: boolean; modo: 'sesion' | 'cada_vez' }> {
    const DEFAULT = { requerido: false, modo: 'cada_vez' as const };
    const [row] = await this.dataSource.query<{ requerido: boolean; modo: string }[]>(
      `SELECT requerido, modo FROM supervisor_politicas WHERE "empresaId" = $1 AND clave = $2`,
      [empresaId, 'cierre_caja_descuadre'],
    ).catch(() => [] as { requerido: boolean; modo: string }[]);
    if (!row) return DEFAULT;
    return { requerido: row.requerido, modo: row.modo === 'sesion' ? 'sesion' : 'cada_vez' };
  }

  /** Valida el token de 'cierre_caja_descuadre' SIN consumirlo — para mostrar la tabla antes de pedir el motivo. */
  private async peekTokenDescuadre(empresaId: number, cajeroId: number, token: string): Promise<{ ok: boolean; mensaje?: string }> {
    const [valido] = await this.dataSource.query<{ id: number }[]>(`
      SELECT id FROM supervisor_autorizaciones
      WHERE "empresaId" = $1 AND "cajeroId" = $2 AND clave = 'cierre_caja_descuadre'
        AND token = $3 AND usado = false AND "expiraEn" > NOW() AND "supervisorId" <> $2
    `, [empresaId, cajeroId, token]);
    if (valido) return { ok: true };
    const [autoasignado] = await this.dataSource.query<{ id: number }[]>(`
      SELECT id FROM supervisor_autorizaciones
      WHERE "empresaId" = $1 AND "cajeroId" = $2 AND clave = 'cierre_caja_descuadre'
        AND token = $3 AND usado = false AND "expiraEn" > NOW() AND "supervisorId" = $2
    `, [empresaId, cajeroId, token]);
    if (autoasignado) return { ok: false, mensaje: 'Quien autoriza no puede ser la misma cajera.' };
    return { ok: false, mensaje: 'Esta acción requiere una autorización de supervisor nueva.' };
  }

  /** Consume (un solo uso) el token de 'cierre_caja_descuadre' — mismo chequeo de auto-asignación que peekTokenDescuadre. */
  private async consumirTokenDescuadre(empresaId: number, cajeroId: number, token: string): Promise<
    { ok: true; supervisorId: number; supervisorNombre: string } | { ok: false; mensaje: string }
  > {
    const [fila] = await this.dataSource.query<{ id: number; supervisorId: number }[]>(`
      WITH f AS (
        UPDATE supervisor_autorizaciones SET usado = true
        WHERE "empresaId" = $1 AND "cajeroId" = $2 AND clave = 'cierre_caja_descuadre'
          AND token = $3 AND usado = false AND "expiraEn" > NOW() AND "supervisorId" <> $2
        RETURNING id, "supervisorId"
      ) SELECT * FROM f
    `, [empresaId, cajeroId, token]);
    if (fila) {
      const [sup] = await this.dataSource.query<{ nombre: string }[]>(`SELECT nombre FROM users WHERE id = $1`, [fila.supervisorId]);
      return { ok: true, supervisorId: fila.supervisorId, supervisorNombre: sup?.nombre ?? `Usuario #${fila.supervisorId}` };
    }
    const [autoasignado] = await this.dataSource.query<{ id: number }[]>(`
      SELECT id FROM supervisor_autorizaciones
      WHERE "empresaId" = $1 AND "cajeroId" = $2 AND clave = 'cierre_caja_descuadre'
        AND token = $3 AND usado = false AND "expiraEn" > NOW() AND "supervisorId" = $2
    `, [empresaId, cajeroId, token]);
    if (autoasignado) return { ok: false, mensaje: 'Quien autoriza no puede ser la misma cajera.' };
    return { ok: false, mensaje: 'Esta acción requiere una autorización de supervisor nueva.' };
  }

  /**
   * Aprobar un cierre fuera de umbral — ADMIN/CONTADOR revisa, registra un
   * motivo obligatorio y el cierre pasa a REVISADA (decisión explícita
   * 2026-10-10). Queda en auditoría: quién, cuándo y por qué. REVISADA ya
   * bloquea anularCierre() — aprobar un descuadre es la última palabra, no
   * un paso intermedio que alguien pueda deshacer reabriendo la caja.
   */
  async aprobarDescuadre(id: number, motivo: string, usuarioId: number, usuarioNombre?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    if (!caja.fueraDeUmbral) {
      throw new BadRequestException('Este cierre no tiene un descuadre pendiente de aprobación');
    }
    if (caja.estado === EstadoCierre.REVISADA) {
      throw new BadRequestException('Este descuadre ya fue aprobado');
    }
    if (caja.estado !== EstadoCierre.CERRADA) {
      throw new BadRequestException('Solo se puede aprobar un cierre que ya está cerrado');
    }
    if (!motivo?.trim()) {
      throw new BadRequestException('El motivo es obligatorio');
    }

    await this.repo.update(id, {
      estado: EstadoCierre.REVISADA,
      motivoAprobacionDescuadre: motivo.trim(),
      aprobadoPorUsuarioId: usuarioId,
      aprobadoPorNombre: usuarioNombre ?? `Usuario #${usuarioId}`,
      aprobadoEn: new Date(),
    });
    this.logger.log(`Descuadre de caja #${id} aprobado por ${usuarioNombre ?? usuarioId}. Motivo: ${motivo.trim()}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Corrección de forma de pago de una factura (ver corregirFormaPago en
   * facturas.service.ts) — si el turno de esa factura YA CERRÓ, deja un
   * ajuste aparte en `ajustes_cierre_caja` sin reescribir el cierre
   * original (el cuadre con el que la cajera cerró de verdad no cambia).
   * Si la caja sigue ABIERTA no hace falta nada: el esperado se recalcula
   * en vivo la próxima vez que se consulte o se cierre.
   */
  async registrarAjusteSiCierreCerrado(
    factura: { id: number; folio: string; fecha: Date | string; vendedorId?: number | null },
    formasPagoAnterior: { tipo: number; monto: number }[],
    formasPagoNuevo: { tipo: number; monto: number }[],
    motivo: string,
    usuario: { id: number; nombre?: string },
  ): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    const fechaDate = factura.fecha instanceof Date ? factura.fecha : new Date(factura.fecha);
    const fechaStr  = fechaDate.toISOString().substring(0, 10);

    const cierre = await this.repo.findOne({
      where: {
        empresaId,
        fecha:      new Date(`${fechaStr}T00:00:00.000Z`) as any,
        vendedorId: factura.vendedorId ?? IsNull() as any,
        estado:     EstadoCierre.CERRADA,
      },
      order: { id: 'DESC' },
    });
    if (!cierre) return; // caja todavía abierta (o sin cierre para ese turno) — nada que ajustar

    const ajusteRepo = this.dataSource.manager.getRepository(AjusteCierreCaja);
    await ajusteRepo.save(ajusteRepo.create({
      empresaId,
      cierreCajaId:       cierre.id,
      facturaId:          factura.id,
      facturaFolio:       factura.folio,
      formasPagoAnterior,
      formasPagoNuevo,
      motivo,
      corregidoPor:       usuario.id,
      corregidoPorNombre: usuario.nombre,
    }));
    this.realtimeService.notify(empresaId, 'caja', 'updated', cierre.id);
  }

  /** Correcciones de forma de pago registradas sobre este cierre (ver registrarAjusteSiCierreCerrado). */
  async listarAjustes(cierreCajaId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const ajusteRepo = this.dataSource.manager.getRepository(AjusteCierreCaja);
    return ajusteRepo.find({
      where: { cierreCajaId, empresaId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Anular cierre de caja ─────────────────────────────────────────────────

  async anularCierre(id: number, motivo: string, userId: number, userNombre?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);

    if (caja.estado === EstadoCierre.ABIERTA) {
      throw new BadRequestException('Esta caja ya está abierta, no hay cierre que anular');
    }
    if (caja.estado === EstadoCierre.REVISADA) {
      throw new BadRequestException('No se puede anular un cierre revisado. Contacta al administrador.');
    }

    // fechaHoraRD, no toLocaleString a secas: 'es-DO' elige el formato, no la
    // zona. El servidor corre en UTC, así que un cierre anulado a las 9:14 a.m.
    // se escribía "1:14:00 p. m.". Y aquí el texto se GUARDA en notas: el error
    // quedaba grabado, sin nada que el cliente pudiera convertir después.
    const notaAnulacion = `[CIERRE ANULADO por usuario #${userId} — ${fechaHoraRD()}] Motivo: ${motivo}`;
    const notasActualizadas = caja.notas
      ? `${caja.notas}\n${notaAnulacion}`
      : notaAnulacion;

    // Conservar los números del PRIMER cierre antes de borrarlos.
    //
    // Reabrir es un flujo legítimo, pero ponía saldoCierre/saldoFisico/
    // diferencia a 0 sin dejar rastro: se perdían los valores con los que
    // alguien cuadró dinero real.
    //
    // Solo se escriben si están vacíos. En un segundo recierre NO se
    // sobrescriben: el original es el PRIMERO, no el anterior.
    const conservarOriginal = caja.esperadoOriginal == null
      ? {
          esperadoOriginal:       caja.saldoCierre,
          contadoOriginal:        caja.saldoFisico,
          diferenciaOriginal:     caja.diferencia,
          formulaVersionOriginal: caja.formulaVersion,
          // Mismo criterio — el cuadre por forma de pago del PRIMER cierre
          // también se pierde si no se preserva aquí: cerrarCaja() lo
          // sobrescribe sin piedad en el recierre (ver más abajo).
          cuadrePorFormaPagoOriginal:   caja.cuadrePorFormaPago ?? null,
          facturasSinFormaPagoOriginal: caja.facturasSinFormaPago ?? null,
          sospechasFormaPagoOriginal:   caja.sospechasFormaPago ?? null,
        }
      : {};

    await this.repo.update(id, {
      estado:      EstadoCierre.ABIERTA,
      saldoCierre: 0,
      saldoFisico: 0,
      diferencia:  0,
      notas:       notasActualizadas,
      ...conservarOriginal,
      // Del usuario autenticado, nunca del body.
      reabiertoPorUsuarioId: userId,
      reabiertoPorNombre:    userNombre ?? null,
      reabiertoEn:           new Date(),
    });

    const quien = caja.vendedorNombre ? ` [${caja.vendedorNombre}]` : '';
    this.logger.warn(`Cierre de caja #${id}${quien} ANULADO por usuario #${userId}. Motivo: ${motivo}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);
    return this.repo.findOne({ where: { id } });
  }

  // ── Recalcular ventas del día por vendedor ────────────────────────────────

  private async recalcularDesdeBD(
    cajaId: number, fecha: string, vendedorId?: number, empresaId?: number,
    manager?: EntityManager,
  ) {
    // Acepta un EntityManager para poder correr DENTRO de la transacción que
    // bloquea la caja al registrar un retiro: allí hay que refrescar los
    // importes antes de decidir si hay efectivo suficiente, y leer fuera de la
    // transacción dejaría escapar lo que otra transacción esté escribiendo.
    const db = manager ?? this.dataSource.manager;

    const vendedorFilter  = vendedorId
      ? `AND f."vendedorId" = ${Number(vendedorId)}`
      : `AND f."vendedorId" IS NULL`;

    const empresaFilter   = empresaId ? `AND f."empresaId" = ${Number(empresaId)}` : '';
    const ncEmpresaFilter = empresaId ? `AND nc."empresaId" = ${Number(empresaId)}` : '';

    // Las NC emitidas reducen el valor neto de cada factura del día.
    // formasPago (JSONB) se usa cuando existe; si es null/vacío el fallback clasifica por notas
    // (mantiene comportamiento previo para ventas históricas sin formasPago).
    // Mapeo tipo DGII → bucket: 1=Efectivo 2=Transfer/Cheque 3=Tarjeta 4=Crédito 5=Permuta→Transfer
    const [ventas] = await db.query<{
      efectivo: string; tarjeta: string; transferencia: string; credito: string; cantidad: string;
    }[]>(
      `WITH nc_totales AS (
         SELECT nc."facturaOriginalId",
                COALESCE(SUM(nc.total), 0) AS total_nc
         FROM notas_credito nc
         WHERE nc."isActive" = true AND nc.estado = 'emitida'
           ${ncEmpresaFilter}
         GROUP BY nc."facturaOriginalId"
       ),
       facturas_base AS (
         SELECT f.id,
                f.total,
                f.notas,
                f."formasPago",
                GREATEST(0, f.total - COALESCE(ntc.total_nc, 0)) AS monto_neto
         FROM facturas f
         LEFT JOIN nc_totales ntc ON ntc."facturaOriginalId" = f.id
         WHERE DATE(f.fecha) = $1
           AND f.estado IN ('emitida', 'pagada')
           AND f."isActive" = true
           -- Las recurrentes no entran en el arqueo. Las genera un cron de
           -- madrugada, con la forma de pago que dice la plantilla y con el
           -- vendedor del contrato: contarlas aquí metería en el cuadre de un
           -- turno un efectivo que nadie recibió por caja, y el cajero saldría
           -- corto por dinero que nunca tocó. Es la misma excepción por ORIGEN
           -- que se aplica al exigir caja abierta en facturas.cambiarEstado().
           AND f."facturaRecurrenteId" IS NULL
           ${vendedorFilter}
           ${empresaFilter}
       ),
       fp_lineas AS (
         SELECT
           fb.id,
           fb.total,
           fb.monto_neto,
           (fp->>'tipo')::int      AS tipo,
           (fp->>'monto')::numeric AS fp_monto
         FROM facturas_base fb,
              jsonb_array_elements(fb."formasPago") AS fp
         WHERE fb."formasPago" IS NOT NULL
           AND fb."formasPago" != 'null'::jsonb
           AND jsonb_array_length(fb."formasPago") > 0
       ),
       ids_con_fp AS (SELECT DISTINCT id FROM fp_lineas),
       resultado AS (
         -- Facturas CON formasPago: distribuir monto_neto proporcionalmente por tipo DGII
         SELECT
           CASE WHEN tipo = 1     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS efectivo,
           CASE WHEN tipo = 3     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS tarjeta,
           CASE WHEN tipo IN (2,5) AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS transferencia,
           CASE WHEN tipo = 4     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS credito
         FROM fp_lineas

         UNION ALL

         -- Facturas SIN formasPago: fallback exacto al LIKE sobre notas (comportamiento anterior)
         SELECT
           CASE WHEN LOWER(fb.notas) LIKE '%efectivo%' THEN fb.monto_neto ELSE 0 END AS efectivo,
           CASE WHEN LOWER(fb.notas) LIKE '%tarjeta%'  THEN fb.monto_neto ELSE 0 END AS tarjeta,
           CASE WHEN LOWER(fb.notas) LIKE '%transferencia%' THEN fb.monto_neto ELSE 0 END AS transferencia,
           CASE WHEN (LOWER(fb.notas) LIKE '%cr_dito%' OR LOWER(fb.notas) LIKE '%credito%')
             AND LOWER(fb.notas) NOT LIKE '%efectivo%'
             AND LOWER(fb.notas) NOT LIKE '%tarjeta%'
             AND LOWER(fb.notas) NOT LIKE '%transferencia%'
           THEN fb.monto_neto ELSE 0 END AS credito
         FROM facturas_base fb
         WHERE NOT EXISTS (SELECT 1 FROM ids_con_fp WHERE id = fb.id)
       )
       SELECT
         COALESCE(SUM(efectivo),      0)::text AS efectivo,
         COALESCE(SUM(tarjeta),       0)::text AS tarjeta,
         COALESCE(SUM(transferencia), 0)::text AS transferencia,
         COALESCE(SUM(credito),       0)::text AS credito,
         (SELECT COUNT(*) FROM facturas_base)::text AS cantidad
       FROM resultado`,
      [fecha],
    );

    // Cobros del día — filtrados por cajaDiariaId para imputar al cajero correcto
    // Cobros del día, SEPARADOS POR MÉTODO.
    //
    // Antes se sumaba el total de todos los métodos y ese total entraba en el
    // efectivo esperado: un cobro por transferencia inflaba el esperado y le
    // creaba al cajero un faltante imposible de cuadrar. Solo la parte en
    // efectivo está en el cajón; el resto se guarda aparte para que el cierre
    // sea auditable.
    const [cobros] = await db.query<{
      total: string; efectivo: string; otros: string; cantidad: string;
    }[]>(
      `SELECT
         COALESCE(SUM(r.monto), 0)::text                                          AS total,
         COALESCE(SUM(r.monto) FILTER (WHERE r."metodoPago" = 'efectivo'), 0)::text AS efectivo,
         COALESCE(SUM(r.monto) FILTER (WHERE r."metodoPago" <> 'efectivo'), 0)::text AS otros,
         COUNT(r.id)::text                                                        AS cantidad
       FROM recibos_cobro r
       WHERE DATE(r.fecha) = $1
         AND r."isActive" = true
         AND r."cajaDiariaId" = $2`,
      [fecha, cajaId],
    );

    // Anticipos del día — también separados por método.
    // `tipoPago` se guarda normalizado sin acentos y en minúsculas
    // (anticipos-cliente.service), por eso basta comparar con 'efectivo'.
    const [anticipos] = await db.query<{
      total: string; efectivo: string; otros: string;
    }[]>(
      `SELECT
         COALESCE(SUM(a.monto), 0)::text                                        AS total,
         COALESCE(SUM(a.monto) FILTER (WHERE LOWER(a."tipoPago") = 'efectivo'), 0)::text AS efectivo,
         COALESCE(SUM(a.monto) FILTER (WHERE LOWER(a."tipoPago") <> 'efectivo'), 0)::text AS otros
       FROM anticipo_cliente a
       WHERE DATE(a."fechaRegistro") = $1
         AND a."isActive" = true
         AND a.estado != 'anulado'
         AND a."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ total: '0', efectivo: '0', otros: '0' }]);

    const [retiros] = await db.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(monto), 0)::text AS total
       FROM retiros_caja
       WHERE "cajaDiariaId" = $1
         AND estado != 'anulado'`,
      [cajaId],
    ).catch(() => [{ total: '0' }]);

    // Gastos de efectivo imputados directamente a esta caja mediante cajaDiariaId.
    // El campo cajaDiariaId se llena solo cuando formaPago='01' y el usuario selecciona
    // la caja en el formulario de gastos — funciona para todas las empresas sin importar
    // si tienen uno o varios cajeros activos al mismo tiempo.
    const [gastos] = await db.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(g.total), 0)::text AS total
       FROM gastos g
       WHERE g."cajaDiariaId" = $1
         AND g."isActive" = true`,
      [cajaId],
    ).catch(() => [{ total: '0' }]);
    const gastosTotal = Number(gastos?.total ?? 0);

    await db.update(CierreCaja, cajaId, {
      ventasEfectivo:        Number(ventas?.efectivo      ?? 0),
      ventasTarjeta:         Number(ventas?.tarjeta       ?? 0),
      ventasTransferencia:   Number(ventas?.transferencia ?? 0),
      ventasCredito:         Number(ventas?.credito       ?? 0),
      cobrosRecibidos:       Number(cobros?.total         ?? 0),
      cobrosEfectivo:        Number(cobros?.efectivo      ?? 0),
      cobrosOtrosMedios:     Number(cobros?.otros         ?? 0),
      totalAnticipos:        Number(anticipos?.total      ?? 0),
      anticiposEfectivo:     Number(anticipos?.efectivo   ?? 0),
      anticiposOtrosMedios:  Number(anticipos?.otros      ?? 0),
      cantidadTransacciones: Number(ventas?.cantidad      ?? 0),
      retiros:               Number(retiros?.total        ?? 0),
      gastosEfectivo:        gastosTotal,
    });
  }

  // ── Cuadre por forma de pago (ver cuadre-por-forma-pago.util.ts) ─────────

  /**
   * Esperado por forma de pago — efectivo (fórmula única, sin tocar),
   * tarjeta, transferencia (incluye cheque/depósito, igual que ventas por
   * DGII), y otros. Cobros y anticipos se desglosan por método igual que
   * ventas, para que una tarjeta/transferencia cobrada por CxC o un
   * anticipo también entre al cuadre de su forma.
   */
  private async calcularEsperadoPorForma(
    cajaId: number, fecha: string, vendedorId: number | undefined, empresaId: number,
    fresh: CierreCaja, manager?: EntityManager, totalSinFormaPago = 0,
  ): Promise<Record<string, number>> {
    const db = manager ?? this.dataSource.manager;

    const efectivo = calcularEfectivoEsperado({
      saldoApertura:     fresh.saldoApertura,
      ventasEfectivo:    fresh.ventasEfectivo,
      cobrosEfectivo:    fresh.cobrosEfectivo,
      anticiposEfectivo: fresh.anticiposEfectivo,
      gastosEfectivo:    fresh.gastosEfectivo,
      retiros:           fresh.retiros,
    });

    const [cobrosPorForma] = await db.query<{ tarjeta: string; transferencia: string }[]>(
      `SELECT
         COALESCE(SUM(r.monto) FILTER (WHERE r."metodoPago" = 'tarjeta'), 0)::text AS tarjeta,
         COALESCE(SUM(r.monto) FILTER (WHERE r."metodoPago" IN ('transferencia','cheque','deposito')), 0)::text AS transferencia
       FROM recibos_cobro r
       WHERE DATE(r.fecha) = $1 AND r."isActive" = true AND r."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ tarjeta: '0', transferencia: '0' }]);

    const [anticiposPorForma] = await db.query<{ tarjeta: string; transferencia: string }[]>(
      `SELECT
         COALESCE(SUM(a.monto) FILTER (WHERE LOWER(a."tipoPago") = 'tarjeta'), 0)::text AS tarjeta,
         COALESCE(SUM(a.monto) FILTER (WHERE LOWER(a."tipoPago") IN ('transferencia','cheque','deposito')), 0)::text AS transferencia
       FROM anticipo_cliente a
       WHERE DATE(a."fechaRegistro") = $1 AND a."isActive" = true AND a.estado != 'anulado' AND a."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ tarjeta: '0', transferencia: '0' }]);

    const tarjeta = Number(fresh.ventasTarjeta ?? 0)
      + Number(cobrosPorForma?.tarjeta ?? 0)
      + Number(anticiposPorForma?.tarjeta ?? 0);
    const transferencia = Number(fresh.ventasTransferencia ?? 0)
      + Number(cobrosPorForma?.transferencia ?? 0)
      + Number(anticiposPorForma?.transferencia ?? 0);

    // "otros" (depósito/otro de cobros y anticipos que no caen en tarjeta/transferencia)
    const [otrosCobros] = await db.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(r.monto) FILTER (WHERE r."metodoPago" = 'otro'), 0)::text AS total
       FROM recibos_cobro r WHERE DATE(r.fecha) = $1 AND r."isActive" = true AND r."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ total: '0' }]);
    const [otrosAnticipos] = await db.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(a.monto) FILTER (WHERE LOWER(a."tipoPago") NOT IN ('efectivo','tarjeta','transferencia','cheque','deposito')), 0)::text AS total
       FROM anticipo_cliente a WHERE DATE(a."fechaRegistro") = $1 AND a."isActive" = true AND a.estado != 'anulado' AND a."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ total: '0' }]);
    // Las facturas CONTADO sin forma de pago (getFacturasSinFormaPago) están
    // FUERA del cuadre por diseño — pero el fallback histórico de
    // clasificación por notas (recalcularDesdeBD) puede haberlas contado
    // igual dentro de ventasCredito si sus notas mencionan "crédito". Sin
    // restarlas aquí, inflan "otros" con dinero que nadie declaró ni se
    // espera cuadrar (caso real: FAC-1807, RD$295.00).
    const otros = Math.max(0,
      Number(otrosCobros?.total ?? 0) + Number(otrosAnticipos?.total ?? 0)
        + Number(fresh.ventasCredito ?? 0) - totalSinFormaPago,
    );

    return { efectivo, tarjeta, transferencia, otros };
  }

  /**
   * Facturas CONTADO del turno sin forma de pago que cubra el total —
   * mismo criterio que validarContadoTieneCobro() en facturas.service.ts.
   * Fuera del cuadre a propósito: no hay con qué compararlas, se muestran
   * aparte para que alguien las revise, nunca se cuentan como sobrante o
   * faltante de ninguna forma.
   */
  private async getFacturasSinFormaPago(
    fecha: string, vendedorId: number | undefined, empresaId: number, manager?: EntityManager,
  ): Promise<{ id: number; folio: string; total: number; clienteNombre?: string }[]> {
    const db = manager ?? this.dataSource.manager;
    const vendedorFilter = vendedorId ? `AND f."vendedorId" = ${Number(vendedorId)}` : `AND f."vendedorId" IS NULL`;

    return db.query(
      `SELECT f.id, f.folio, f.total::numeric AS total, c.nombre AS "clienteNombre"
       FROM facturas f
       LEFT JOIN clientes c ON c.id = f."clienteId"
       WHERE DATE(f.fecha) = $1
         AND f."empresaId" = $2
         AND f.estado IN ('emitida', 'pagada')
         AND f."isActive" = true
         AND f."facturaRecurrenteId" IS NULL
         AND f."tipoPago" = 'CONTADO'
         AND (
           f."formasPago" IS NULL
           OR f."formasPago" = 'null'::jsonb
           OR jsonb_array_length(f."formasPago") = 0
           OR (SELECT COALESCE(SUM((fp->>'monto')::numeric), 0) FROM jsonb_array_elements(f."formasPago") fp) < f.total - 0.01
         )
         ${vendedorFilter}
       ORDER BY f.id`,
      [fecha, empresaId],
    );
  }

  /**
   * Facturas del turno que podrían explicar una sospecha de forma mal
   * registrada: pagos mixtos que incluyen AMBAS formas en juego (el caso
   * exacto de FAC-1803: Tarjeta 955 + Efectivo 125 en vez de al revés), o
   * una línea de la forma sobrante con monto cercano a la diferencia.
   */
  private async buscarFacturasCandidatasSospecha(
    sospecha: { formaSobrante: string; formaFaltante: string; monto: number },
    fecha: string, vendedorId: number | undefined, empresaId: number, manager?: EntityManager,
  ): Promise<{ id: number; folio: string; total: number; formasPago: { tipo: number; monto: number }[] }[]> {
    const db = manager ?? this.dataSource.manager;
    const vendedorFilter = vendedorId ? `AND f."vendedorId" = ${Number(vendedorId)}` : `AND f."vendedorId" IS NULL`;
    const tiposSobrante = TIPOS_DGII_POR_FORMA[sospecha.formaSobrante] ?? [];
    const tiposFaltante = TIPOS_DGII_POR_FORMA[sospecha.formaFaltante] ?? [];
    if (!tiposSobrante.length || !tiposFaltante.length) return [];

    return db.query(
      `SELECT f.id, f.folio, f.total::numeric AS total, f."formasPago"
       FROM facturas f
       WHERE DATE(f.fecha) = $1
         AND f."empresaId" = $2
         AND f."isActive" = true
         AND f.estado IN ('emitida', 'pagada')
         AND f."formasPago" IS NOT NULL
         AND f."formasPago" != 'null'::jsonb
         AND jsonb_array_length(f."formasPago") > 1
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(f."formasPago") fp WHERE (fp->>'tipo')::int = ANY($3))
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(f."formasPago") fp WHERE (fp->>'tipo')::int = ANY($4))
         ${vendedorFilter}
       ORDER BY f.id`,
      [fecha, empresaId, tiposSobrante, tiposFaltante],
    );
  }

  // ── Helpers: configuración ciego ─────────────────────────────────────────

  private async getEmpresaCfg(empresaId: number, manager?: EntityManager): Promise<{
    cierreCajaCiego: boolean;
    umbralDescuadreCaja: number;
    montoMaxRetiroSinAutorizacion: number;
  }> {
    // Acepta un EntityManager para poder correr DENTRO de la transacción de
    // registrarRetiro (que ya reservó una conexión y sostiene un lock
    // pessimistic_write sobre la caja): sin esto, con concurrencia ≥
    // pool.max cada transacción pide una SEGUNDA conexión del pool desde
    // adentro — deadlock por agotamiento, mismo patrón que
    // encf-generator.service.ts.
    const db = manager ?? this.dataSource.manager;
    const rows = await db.query<{ configuracion: Record<string, unknown> }[]>(
      'SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1',
      [empresaId],
    );
    const cfg = (rows[0]?.configuracion ?? {}) as Record<string, unknown>;
    return {
      cierreCajaCiego:               cfg.cierreCajaCiego === true,
      umbralDescuadreCaja:           Number(cfg.umbralDescuadreCaja ?? 100),
      /** 0 = sin restricción (cualquier monto es válido sin autorización) */
      montoMaxRetiroSinAutorizacion: Number(cfg.montoMaxRetiroSinAutorizacion ?? 0),
    };
  }

  private ocultarCamposCiego(caja: CierreCaja | null): any {
    if (!caja) return null;
    const result: any = { ...caja };
    for (const k of ['ventasEfectivo','ventasTarjeta','ventasTransferencia','ventasCredito',
      'cobrosRecibidos','cobrosEfectivo','cobrosOtrosMedios',
      'totalAnticipos','anticiposEfectivo','anticiposOtrosMedios','gastosEfectivo','retiros',
      'saldoCierre','diferencia','cantidadTransacciones',
      // El esperado es EL dato que el cierre ciego oculta: si se filtrara, el
      // cajero podría cuadrar hacia atrás en vez de contar el dinero.
      'efectivoEsperado','esperadoInconsistente','excesoRetiros']) {
      delete result[k];
    }
    result.ciegoCajaActivo = true;
    return result;
  }

  /**
   * VENDEDOR nunca ve el balance/monto de una caja ABIERTA — en NINGUNA
   * pantalla (Cierre Actual, Historial, caja por id), sea la suya propia o
   * la de otro cajero (decisión 2026-10-09). Reutiliza exactamente
   * ocultarCamposCiego (el mismo recorte que ya usaba el modo ciego
   * opcional) pero como regla FIJA del rol: no depende del toggle
   * `cierreCajaCiego` de la empresa, que sigue existiendo solo para decidir
   * qué ve la cajera al declarar. El umbral de descuadre (ver getEmpresaCfg)
   * ya NO depende de este toggle — se evalúa siempre al cerrar (decisión
   * 2026-10-10). Una caja CERRADA/REVISADA/CERRADA_SISTEMA nunca se toca aquí.
   *
   * Siempre corre DESPUÉS de conEfectivoEsperado (nunca antes): ese método
   * necesita los campos crudos (ventasEfectivo, etc.) para calcular
   * efectivoEsperado — recortarlos primero lo dejaría calculando sobre
   * ceros.
   */
  private ocultarSiVendedorYAbierta(caja: any, role?: string | null): any {
    if (!caja || role !== UserRole.VENDEDOR || caja.estado !== EstadoCierre.ABIERTA) return caja;
    return this.ocultarCamposCiego(caja);
  }

  /**
   * Añade el efectivo esperado a una caja ABIERTA.
   *
   * `saldoCierre` solo se rellena al cerrar, así que para una caja abierta la
   * API no devolvía ningún esperado — y por eso el frontend se lo calculaba por
   * su cuenta, con una fórmula que había divergido (sumaba tarjeta y
   * transferencia, omitía los cobros).
   *
   * Con esto el cliente no calcula dinero: muestra lo que llega. Se incluyen
   * también las banderas de inconsistencia para que la UI no tenga que deducir
   * nada del signo.
   */
  private async conEfectivoEsperado(caja: CierreCaja | null): Promise<any> {
    if (!caja) return caja;
    const esperado = caja.estado === EstadoCierre.ABIERTA
      ? calcularEfectivoEsperado({
          saldoApertura:     caja.saldoApertura,
          ventasEfectivo:    caja.ventasEfectivo,
          cobrosEfectivo:    caja.cobrosEfectivo,
          anticiposEfectivo: caja.anticiposEfectivo,
          gastosEfectivo:    caja.gastosEfectivo,
          retiros:           caja.retiros,
        })
      : Number(caja.saldoCierre ?? 0);   // ya cerrada: el valor guardado manda

    // Un cierre CERRADA sin cuadrePorFormaPago guardado es un cierre de antes
    // de que este cuadre existiera — se deriva "mejor esfuerzo" a partir de
    // las columnas que YA se guardaban (ver cuadre-por-forma-pago.util.ts).
    // Nunca se persiste (no reescribe el cierre), y sin esto, reimprimir o
    // reabrir el detalle de un cierre viejo vuelve siempre al formato de
    // solo-efectivo — exactamente el bug real de reimpresión post-deploy.
    let cuadreLegacy: ReturnType<typeof derivarCuadreLegacy> | null = null;
    let facturasSinFormaPago: any[] = [];
    let sospechasLegacy: SospechaFormaPago[] | null = null;

    if (caja.estado !== EstadoCierre.ABIERTA && !caja.cuadrePorFormaPago) {
      const empresaId = this.tenantService.getEmpresaId();
      const fechaDate = caja.fecha instanceof Date ? caja.fecha : new Date(caja.fecha as any);
      const fechaStr  = fechaDate.toISOString().substring(0, 10);

      // Facturas CONTADO sin forma de pago — fuera del cuadre por diseño.
      // Sin restar su monto, el bucket donde cayeron por el fallback
      // histórico de clasificación (ventasCredito, ver recalcularDesdeBD)
      // infla el esperado con dinero que nadie declaró ni se espera cuadrar
      // (caso real: FAC-1807, RD$295.00, inflaba "otros" exactamente ese
      // monto y rompía el neto del cierre).
      facturasSinFormaPago = await this.getFacturasSinFormaPago(fechaStr, caja.vendedorId, empresaId);
      const totalSinForma = facturasSinFormaPago.reduce((s, f) => s + Number(f.total || 0), 0);

      cuadreLegacy = derivarCuadreLegacy({
        saldoCierre:        Number(caja.saldoCierre ?? 0),
        saldoFisico:        Number(caja.saldoFisico ?? 0),
        ventasTarjeta:      Number(caja.ventasTarjeta ?? 0),
        ventasTransferencia: Number(caja.ventasTransferencia ?? 0),
        ventasCredito:      Math.max(0, Number((caja as any).ventasCredito ?? 0) - totalSinForma),
        desglosePago:       caja.desglosePago as any,
      });

      const sospechas = detectarPosibleFormaMalRegistrada(cuadreLegacy);
      sospechasLegacy = sospechas.length
        ? await Promise.all(sospechas.map(async s => ({
            ...s,
            facturasCandidatas: await this.buscarFacturasCandidatasSospecha(s, fechaStr, caja.vendedorId, empresaId),
          })))
        : [];
    }

    return {
      ...caja,
      ...(cuadreLegacy ? { cuadrePorFormaPago: cuadreLegacy, cuadreEstimado: true, facturasSinFormaPago } : {}),
      ...(sospechasLegacy?.length ? { sospechasFormaPago: sospechasLegacy } : {}),
      efectivoEsperado:      esperado,
      esperadoInconsistente: esperadoEsInconsistente(esperado),
      excesoRetiros:         excesoDeRetiros(esperado),
    };
  }

  /**
   * Agrega `cuadreCorregido` a las filas que tengan ajustes posteriores
   * (ver registrarAjusteSiCierreCerrado) — una sola query por lote
   * (WHERE cierreCajaId IN (...)), nunca N+1 por fila. El cierre original
   * (`cuadrePorFormaPago`) nunca se toca; esto es un cálculo aparte para
   * que el reporte pueda mostrar "cuadre original" y "cuadre corregido"
   * uno junto al otro.
   */
  private async conCuadreCorregido(cajas: any[]): Promise<any[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const ids = cajas.filter(c => Array.isArray(c?.cuadrePorFormaPago)).map(c => c.id);
    if (!ids.length) return cajas;

    const ajusteRepo = this.dataSource.manager.getRepository(AjusteCierreCaja);
    const ajustes = await ajusteRepo.find({ where: { cierreCajaId: In(ids), empresaId } });
    if (!ajustes.length) return cajas;

    const porCierre = new Map<number, typeof ajustes>();
    for (const a of ajustes) {
      const lista = porCierre.get(a.cierreCajaId) ?? [];
      lista.push(a);
      porCierre.set(a.cierreCajaId, lista);
    }

    return cajas.map(c => {
      const ajustesDeEsta = porCierre.get(c.id);
      if (!ajustesDeEsta?.length) return c;
      return { ...c, cuadreCorregido: aplicarAjustesAlCuadre(c.cuadrePorFormaPago, ajustesDeEsta) };
    });
  }

  // ── Cajas del día (filtradas por empresa) ─────────────────────────────────

  async getCajaHoy(vendedorId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    if (vendedorId !== undefined) {
      const where: any = { fecha: new Date(hoy) as any, empresaId };
      where.vendedorId = vendedorId === 0 ? IsNull() : vendedorId;

      const caja = await this.repo.findOne({ where });
      if (!caja) return { estado: 'sin_apertura', mensaje: 'La caja no ha sido abierta hoy' };

      if (caja.estado === EstadoCierre.ABIERTA) {
        await this.recalcularDesdeBD(caja.id, hoy, caja.vendedorId, empresaId);
      }
      const fresh = await this.repo.findOne({ where: { id: caja.id } });
      // getCajaHoy() solo la llaman admin/contador — nunca aplica ciego
      return await this.conEfectivoEsperado(fresh);
    }

    // Sin filtro de vendedor → todas las cajas del día de ESTA empresa
    const cajas = await this.repo.find({
      where: { fecha: new Date(hoy) as any, empresaId } as any,
      order: { vendedorNombre: 'ASC' },
    });

    if (!cajas.length) {
      return { estado: 'sin_apertura', mensaje: 'No hay cajas abiertas hoy' };
    }

    await Promise.all(
      cajas
        .filter(c => c.estado === EstadoCierre.ABIERTA)
        .map(c => this.recalcularDesdeBD(c.id, hoy, c.vendedorId, empresaId)),
    );

    const frescas = await this.repo.find({
      where: { fecha: new Date(hoy) as any, empresaId } as any,
      order: { vendedorNombre: 'ASC' },
    });

    // Cada caja lleva su efectivoEsperado: es la lista que pinta las tarjetas
    // del panel, donde el frontend recalculaba la fórmula por su cuenta.
    return {
      cajas: await Promise.all(frescas.map(c => this.conEfectivoEsperado(c))),
      totalCajas: frescas.length,
    };
  }

  /**
   * TODAS las cajas ABIERTA de la empresa, sin importar la fecha — a
   * diferencia de getCajaHoy(), que solo mira fecha = hoy y por eso una caja
   * abierta de un día anterior (nunca cerrada) queda invisible ahí. Cada fila
   * trae `diasAbierta` (0 = de hoy, >0 = huérfana) para que el frontend
   * decida cómo destacarla sin recalcular fechas por su cuenta.
   */
  async getCajasAbiertas() {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    const cajas = await this.repo.find({
      where: { empresaId, estado: EstadoCierre.ABIERTA } as any,
      order: { fecha: 'ASC', vendedorNombre: 'ASC' },
    });

    const fechaDe = (c: CierreCaja) =>
      (c.fecha instanceof Date ? c.fecha : new Date(c.fecha as any)).toISOString().substring(0, 10);

    // Mismo recálculo que getCajaHoy() — sin esto, efectivoEsperado saldría
    // desactualizado y el modal de cierre que se abre desde este aviso
    // arrancaría con números viejos.
    await Promise.all(cajas.map(c => this.recalcularDesdeBD(c.id, fechaDe(c), c.vendedorId, empresaId)));
    const frescas = await this.repo.find({
      where: { empresaId, estado: EstadoCierre.ABIERTA } as any,
      order: { fecha: 'ASC', vendedorNombre: 'ASC' },
    });

    return Promise.all(frescas.map(async c => {
      const fechaStr = fechaDe(c);
      const diasAbierta = Math.round(
        (new Date(hoy).getTime() - new Date(fechaStr).getTime()) / 86_400_000,
      );
      return { ...(await this.conEfectivoEsperado(c)), fecha: fechaStr, diasAbierta };
    }));
  }

  /**
   * La caja de HOY del usuario autenticado.
   *
   * A-1: scoped para VENDEDOR — todo se deriva del JWT, nunca de un parámetro
   * del cliente, así que un vendedor sigue sin poder mirar la caja de otro.
   *
   * ── Por qué no basta con userId ──────────────────────────────────────────
   * `cierres_caja` guarda DOS personas y no son la misma cosa:
   *
   *     userId      quién PULSÓ abrir
   *     vendedorId  para QUIÉN es el turno
   *
   * abrirCaja() recibe `usuario.id` del que abre y el `vendedorId` del cajero
   * elegido (caja.controller.ts:141). Cuando un encargado le abre la caja al
   * cajero —que es lo normal a primera hora— las dos columnas salen distintas.
   *
   * Buscando solo por userId, ese cajero entraba al POS y le decía «la caja no
   * ha sido abierta hoy» mientras Caja Diaria la enseñaba ABIERTA con su nombre,
   * porque el historial la identifica por vendedorNombre. Le pasó a Adalberta
   * Reyes en Ferretería Pavel.
   *
   * La pregunta correcta no es «¿abrí yo una caja?» sino «¿hay una caja PARA MÍ
   * abierta?», y eso son las dos columnas.
   *
   * OJO: la segunda vía depende de que `vendedores.usuarioId` esté poblado. Hoy
   * solo lo está en la empresa 61 (ver docs/estado-actual.md §1), así que en el
   * resto esto se comporta igual que antes — ahí el arreglo de fondo sigue
   * siendo poblar esa columna, la misma que arrastra el bug del vendedorId.
   */
  /** El perfil de vendedor (si existe) del usuario autenticado. Derivado del JWT, no del cliente. */
  private async resolverMiVendedorId(userId: number, empresaId: number): Promise<number | undefined> {
    const perfilRows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM vendedores
        WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true
        LIMIT 1`,
      [userId, empresaId],
    ).catch(() => []);
    return perfilRows[0]?.id;
  }

  /** ¿Esta caja es de este usuario — la abrió él (userId), o es su propio perfil de vendedor (vendedorId)? */
  private async esCajaDelUsuario(caja: CierreCaja, usuario: { id: number }, empresaId: number): Promise<boolean> {
    if (caja.userId === usuario.id) return true;
    const miVendedorId = await this.resolverMiVendedorId(usuario.id, empresaId);
    return miVendedorId != null && caja.vendedorId === miVendedorId;
  }

  async getCajaHoyByUserId(userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    const miVendedorId = await this.resolverMiVendedorId(userId, empresaId);

    const qb = this.repo.createQueryBuilder('c')
      .where('c.fecha = :hoy', { hoy })
      .andWhere('c.empresaId = :empresaId', { empresaId });

    if (miVendedorId) {
      qb.andWhere('(c.userId = :userId OR c.vendedorId = :miVendedorId)', { userId, miVendedorId });
    } else {
      qb.andWhere('c.userId = :userId', { userId });
    }

    // Si por lo que sea hubiera dos —una abierta por él y otra a su nombre—
    // manda la ABIERTA: es la que puede usar para vender.
    const caja = await qb
      .orderBy(`CASE WHEN c.estado = 'abierta' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('c.id', 'DESC')
      .getOne();

    if (!caja) return { estado: 'sin_apertura', mensaje: 'La caja no ha sido abierta hoy' };

    if (caja.estado === EstadoCierre.ABIERTA) {
      await this.recalcularDesdeBD(caja.id, hoy, caja.vendedorId, empresaId);
    }
    const fresh = await this.repo.findOne({ where: { id: caja.id } });
    const { cierreCajaCiego } = await this.getEmpresaCfg(empresaId);
    // Ciego mientras la caja está abierta — SIEMPRE para VENDEDOR (regla fija
    // del rol, ver ocultarSiVendedorYAbierta), y ADEMÁS si la empresa activó
    // el toggle opcional cierreCajaCiego (ese sigue aplicando igual que
    // antes, por si algún día este método deja de ser exclusivo de VENDEDOR).
    // Al cerrar, el vendedor recibe datos completos para imprimir.
    const conEsperado = await this.conEfectivoEsperado(fresh);
    return (cierreCajaCiego && fresh?.estado === EstadoCierre.ABIERTA)
      ? this.ocultarCamposCiego(fresh)
      : this.ocultarSiVendedorYAbierta(conEsperado, UserRole.VENDEDOR);
  }

  // ── Historial (filtrado por empresa) ─────────────────────────────────────

  async getHistorial(page = 1, limit = 20, vendedorId?: number, mes?: number, anio?: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    // Rol de la empresa ACTIVA (usuario_empresa), nunca el global de `users`
    // — ver el porqué en ocultarSiVendedorYAbierta/requiere-supervisor.guard.ts.
    const role = this.tenantService.getRolEmpresa();

    // Incluimos todas las cajas (incluso las ABIERTA de días anteriores)
    // para que los admin puedan verlas y cerrarlas desde la UI — y las
    // ABIERTA van primero (sea cual sea su fecha): son las que necesitan
    // acción, no hay que bajar la lista para notarlas.
    const qb = this.repo.createQueryBuilder('c').where('c.empresaId = :empresaId', { empresaId });
    // Caso real (caja #714, empresa 44, 2026-10-03): este filtro excluía en
    // silencio cualquier caja con sucursalId NULL cuando el que mira el
    // historial tenía una sucursal activa en su sesión — la caja de Maximo
    // nunca apareció. Las sucursalId NULL son un dato roto que hay que VER
    // (el frontend las marca "Sin sucursal"), nunca filtrarlas sin aviso.
    if (sucursalId) qb.andWhere('(c.sucursalId = :sucursalId OR c.sucursalId IS NULL)', { sucursalId });
    if (vendedorId !== undefined) {
      if (vendedorId === 0) qb.andWhere('c.vendedorId IS NULL');
      else                  qb.andWhere('c.vendedorId = :vendedorId', { vendedorId });
    }
    if (mes && anio) {
      const inicio = new Date(anio, mes - 1, 1);
      const fin    = new Date(anio, mes, 0);
      qb.andWhere('c.fecha BETWEEN :inicio AND :fin', { inicio, fin });
    }

    const [data, total] = await qb
      .orderBy(`CASE WHEN c.estado = 'abierta' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('c.fecha', 'DESC')
      .addOrderBy('c.vendedorNombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // conEfectivoEsperado() es gratis para las CERRADA (usa el saldoCierre ya
    // guardado, sin query) — solo importa para las ABIERTA que aparezcan
    // mezcladas aquí, que si no saldrían con efectivoEsperado undefined y el
    // modal de "Cerrar caja" desde este listado arrancaría mostrando 0.
    const conEsperado = await this.conCuadreCorregido(
      await Promise.all(data.map(async c => this.ocultarSiVendedorYAbierta(await this.conEfectivoEsperado(c), role))),
    );
    return {
      data: conEsperado,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Una caja por id, sin importar el mes del historial que esté filtrado en
   *  pantalla — para el enlace directo del aviso "caja abierta de un día
   *  anterior" (?cajaId=...), que puede apuntar a cualquier fecha. */
  async obtenerUnaPorId(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    const conEsperado = this.ocultarSiVendedorYAbierta(await this.conEfectivoEsperado(caja), this.tenantService.getRolEmpresa());
    const [conCorregido] = await this.conCuadreCorregido([conEsperado]);
    return conCorregido;
  }

  /**
   * Datos COMPLETOS (nunca recortados por rol) de una caja, para imprimir su
   * cierre — incluye el detalle de facturas del turno. El controller exige
   * la política 'imprimir_cierre_caja_abierta' en esta ruta
   * (RequiereSupervisor, guard declarativo) — se activa para CUALQUIER caja
   * que llegue aquí, pero el frontend solo llama esta ruta cuando la caja
   * está ABIERTA (una CERRADA se imprime con los datos ya en caché, sin
   * pasar por aquí — "sin cambios"). getFacturasDetalle() ya exige, aparte,
   * que un VENDEDOR solo pida el detalle de SU PROPIA caja — esa regla de
   * dueño sigue aplicando tal cual, independiente de la autorización de
   * supervisor (son dos controles distintos).
   */
  async getDatosParaImprimir(id: number, usuario?: { id: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    const facturasDetalle = await this.getFacturasDetalle(id, usuario);
    return { ...(await this.conEfectivoEsperado(caja)), facturasDetalle };
  }

  // ── Resumen mensual (filtrado por empresa) ────────────────────────────────

  async getResumenMes(mes: number, anio: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.dataSource.query<{
      totalVentas: string; totalCobros: string;
      diferenciaTotal: string; diasConDiferencia: string;
    }[]>(
      `SELECT
         COALESCE(SUM(c."ventasEfectivo" + c."ventasTarjeta" + c."ventasTransferencia"), 0)::text AS "totalVentas",
         COALESCE(SUM(c."cobrosRecibidos"), 0)::text AS "totalCobros",
         COALESCE(SUM(c.diferencia), 0)::text AS "diferenciaTotal",
         COUNT(CASE WHEN ABS(c.diferencia) > 0 THEN 1 END)::text AS "diasConDiferencia"
       FROM cierres_caja c
       WHERE EXTRACT(MONTH FROM c.fecha) = $1
         AND EXTRACT(YEAR  FROM c.fecha) = $2
         AND c.estado NOT IN ('abierta', 'cerrada_por_sistema')
         AND c."empresaId" = $3`,
      [mes, anio, empresaId],
    );

    return {
      mes, anio,
      totalVentas:       Number(rows[0]?.totalVentas       ?? 0),
      totalCobros:       Number(rows[0]?.totalCobros       ?? 0),
      diferenciaTotal:   Number(rows[0]?.diferenciaTotal   ?? 0),
      diasConDiferencia: Number(rows[0]?.diasConDiferencia ?? 0),
    };
  }

  // ── Fuente única para verificar si hay caja abierta para un vendedor ──
  // Sin restricción de fecha: una caja abierta de días anteriores no cerrada
  // sigue siendo válida para emitir. Usa TypeORM como getCajaHoy.
  // ── Retiros de caja ───────────────────────────────────────────────────────

  async registrarRetiro(
    cajaId: number,
    monto: number,
    descripcion: string,
    usuarioId: number,
    usuarioNombre?: string,
    categoria: CategoriaRetiro = CategoriaRetiro.OTRO,
    cuentaBancariaId?: number,
  ) {
    const empresaId = this.tenantService.getEmpresaId();

    // TODO el alta va en UNA transacción con bloqueo pesimista sobre la caja.
    //
    // Antes no había validación de disponible en ningún sitio —ni backend ni
    // frontend— así que se podía retirar más efectivo del que había entrado, y
    // el esperado quedaba negativo. Además el save del retiro y la
    // actualización del total eran dos operaciones sueltas: si la segunda
    // fallaba, el retiro existía sin estar sumado.
    //
    // El bloqueo es imprescindible: sin él, dos retiros simultáneos leen el
    // mismo disponible, ambos lo consideran suficiente y ambos pasan.
    return this.dataSource.transaction(async (manager) => {
      // SELECT ... FOR UPDATE sobre la caja: cualquier otro retiro sobre la
      // misma caja espera aquí hasta que esta transacción termine.
      const caja = await manager.findOne(CierreCaja, {
        where: { id: cajaId, empresaId } as any,
        lock: { mode: 'pessimistic_write' },
      });
      if (!caja) throw new BadRequestException(`Caja #${cajaId} no encontrada`);

      if (caja.estado !== EstadoCierre.ABIERTA) {
        const quien = caja.vendedorNombre ? ` de ${caja.vendedorNombre}` : '';
        throw new BadRequestException(
          `La caja${quien} ya está cerrada. No se puede registrar un retiro sin autorización de un supervisor.`,
        );
      }

      // Un retiro no puede sacar más efectivo del que hay en el cajón.
      const disponible = await this.disponibleEnCaja(caja.id, manager);
      if (monto > disponible) {
        throw this.errorRetiroExcedeDisponible(monto, disponible);
      }

      // Comprobar si el monto supera el umbral configurado por la empresa.
      // 0 o ausente = sin restricción (no requiere autorización).
      const cfg = await this.getEmpresaCfg(empresaId, manager);
      const requiereAuth = cfg.montoMaxRetiroSinAutorizacion > 0 && monto > cfg.montoMaxRetiroSinAutorizacion;
      const estado = requiereAuth ? EstadoRetiro.PENDIENTE : EstadoRetiro.ACTIVO;

      // Número secuencial por empresa — atómico vía siguiente_numero_secuencia
      const [{ n }] = await manager.query<{ n: number }[]>(
        `SELECT siguiente_numero_secuencia($1, 'RET') AS n`, [empresaId],
      );
      const numero = `RET-${String(n).padStart(5, '0')}`;

      const retiro = manager.create(RetiroCaja, {
        empresaId,
        cajaDiariaId: caja.id,
        usuarioId,
        usuarioNombre,
        monto,
        descripcion: descripcion.trim(),
        categoria,
        estado,
        numero,
        ...(cuentaBancariaId ? { cuentaBancariaId } : {}),
      });
      await manager.save(RetiroCaja, retiro);

      // Dentro de la MISMA transacción: o quedan las dos escrituras, o ninguna.
      await this.actualizarTotalRetiros(caja.id, manager);
      this.realtimeService.notify(empresaId, 'caja', 'updated', caja.id);

      return { ...retiro, requiereAuth };
    });
  }

  /** Autoriza un retiro pendiente. Solo ADMIN/CONTADOR. */
  async autorizarRetiro(id: number, autorizadorId: number, autorizadorNombre: string) {
    const empresaId = this.tenantService.getEmpresaId();

    // Misma transacción con bloqueo que el alta: entre crear y autorizar pueden
    // haber pasado horas, y en ese tiempo la caja puede haberse vaciado con
    // otros retiros o gastos. Un retiro creado cuando había fondos no puede
    // autorizarse si ya no los hay.
    return this.dataSource.transaction(async (manager) => {
      const retiro = await manager.findOne(RetiroCaja, { where: { id, empresaId } });
      if (!retiro) throw new NotFoundException(`Retiro #${id} no encontrado`);
      if (retiro.estado === EstadoRetiro.ANULADO)   throw new BadRequestException('El retiro ya está anulado');
      if (retiro.estado === EstadoRetiro.RECHAZADO) throw new BadRequestException('El retiro fue rechazado y no puede autorizarse');
      if (retiro.estado === EstadoRetiro.ACTIVO)     throw new BadRequestException('El retiro ya fue autorizado');

      await manager.findOne(CierreCaja, {
        where: { id: retiro.cajaDiariaId } as any,
        lock: { mode: 'pessimistic_write' },
      });

      // OJO: este retiro YA está restando del disponible (cuenta desde su
      // creación, con estado != 'anulado'). Se le suma de vuelta para preguntar
      // "¿había efectivo suficiente para este retiro?" y no compararlo contra
      // un disponible del que él mismo ya se descontó.
      const disponibleSinEste = disponibleParaAutorizar(
        await this.disponibleEnCaja(retiro.cajaDiariaId, manager),
        Number(retiro.monto),
      );
      if (Number(retiro.monto) > disponibleSinEste) {
        throw this.errorRetiroExcedeDisponible(Number(retiro.monto), disponibleSinEste);
      }

      await manager.update(RetiroCaja, id, {
        estado:           EstadoRetiro.ACTIVO,
        autorizadorId,
        autorizadorNombre,
        autorizadoEn:     new Date(),
      });

      // No cambia el total — el retiro ya contaba como no-anulado desde el momento de creación
      this.realtimeService.notify(empresaId, 'caja', 'updated', retiro.cajaDiariaId);
      return manager.findOne(RetiroCaja, { where: { id } });
    });
  }

  /** Anula un retiro con traza. Solo ADMIN/CONTADOR. Solo mientras la caja siga abierta. */
  async anularRetiro(id: number, motivo: string, anuladoPorId: number, anuladoPorNombre: string) {
    const empresaId = this.tenantService.getEmpresaId();

    const retiro = await this.retiroRepo.findOne({ where: { id, empresaId } });
    if (!retiro) throw new NotFoundException(`Retiro #${id} no encontrado`);
    if (retiro.estado === EstadoRetiro.ANULADO)   throw new BadRequestException('El retiro ya está anulado');
    if (retiro.estado === EstadoRetiro.RECHAZADO) throw new BadRequestException(
      'El retiro fue rechazado. Para revertir el monto, anula el cierre primero.',
    );

    // Verificar estado de la caja — no se puede anular en una caja cerrada
    const caja = await this.repo.findOne({ where: { id: retiro.cajaDiariaId } });
    if (caja && caja.estado !== EstadoCierre.ABIERTA) {
      throw new ForbiddenException(
        'No se puede anular un retiro de un cierre ya cerrado. ' +
        'Anular el cierre primero y luego el retiro.',
      );
    }

    await this.retiroRepo.update(id, {
      estado:           EstadoRetiro.ANULADO,
      motivoAnulacion:  motivo.trim(),
      anuladoPorId,
      anuladoPorNombre,
      anuladoEn:        new Date(),
    });

    // Recalcular — el anulado ya no suma
    if (caja) {
      await this.actualizarTotalRetiros(caja.id);
      this.realtimeService.notify(empresaId, 'caja', 'updated', caja.id);
    }

    return this.retiroRepo.findOne({ where: { id } });
  }

  /**
   * Rechaza un retiro pendiente. Solo ADMIN/CONTADOR.
   *
   * A diferencia de la anulación:
   * - Funciona aunque la caja ya esté CERRADA.
   * - El monto NO se devuelve a la caja (el dinero ya salió físicamente).
   * - El estado queda como "rechazado" para distinguirlo del "anulado".
   * - La diferencia queda documentada en el cuadre del cierre para resolución externa.
   */
  async rechazarRetiro(id: number, motivo: string, rechazadoPorId: number, rechazadoPorNombre: string) {
    const empresaId = this.tenantService.getEmpresaId();

    const retiro = await this.retiroRepo.findOne({ where: { id, empresaId } });
    if (!retiro) throw new NotFoundException(`Retiro #${id} no encontrado`);
    if (retiro.estado !== EstadoRetiro.PENDIENTE) {
      const estados: Record<string, string> = {
        activo:    'El retiro ya fue autorizado',
        anulado:   'El retiro ya está anulado',
        rechazado: 'El retiro ya fue rechazado',
      };
      throw new BadRequestException(estados[retiro.estado] ?? 'Solo se pueden rechazar retiros pendientes');
    }

    await this.retiroRepo.update(id, {
      estado:              EstadoRetiro.RECHAZADO,
      motivoRechazo:       motivo.trim(),
      rechazadoPorId,
      rechazadoPorNombre,
      rechazadoEn:         new Date(),
    });

    // El rechazo NO cambia el total de retiros de la caja:
    // rechazado cuenta igual que activo (dinero físicamente fuera de la gaveta).
    // actualizarTotalRetiros usa estado != 'anulado' — rechazado se incluye. ✓
    this.realtimeService.notify(empresaId, 'caja', 'updated', retiro.cajaDiariaId);
    return this.retiroRepo.findOne({ where: { id } });
  }

  /** Reporte completo de retiros — retorna TODOS los registros (sin paginar) para export.
   *  Filtrable por período, cajero, categoría y estado. */
  async reporteRetiros(params: {
    desde:      string;
    hasta:      string;
    vendedorId?: number;
    categoria?:  string;
    estado?:     string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const conds: string[] = [
      `r."empresaId" = ${empresaId}`,
      `cc.fecha BETWEEN $1 AND $2`,
    ];
    const args: any[] = [params.desde, params.hasta];

    if (params.vendedorId !== undefined) {
      args.push(params.vendedorId);
      conds.push(`cc."vendedorId" = $${args.length}`);
    }
    if (params.categoria) {
      args.push(params.categoria);
      conds.push(`r.categoria = $${args.length}`);
    }
    if (params.estado) {
      args.push(params.estado);
      conds.push(`r.estado = $${args.length}`);
    }

    return this.dataSource.query<any[]>(
      `SELECT
         r.id,
         r."createdAt",
         r.monto,
         r.descripcion,
         r.categoria,
         r.estado,
         r."usuarioNombre",
         r."autorizadorNombre",
         r."autorizadoEn",
         r."motivoAnulacion",
         r."anuladoPorNombre",
         r."anuladoEn",
         r."motivoRechazo",
         r."rechazadoPorNombre",
         r."rechazadoEn",
         r."cuentaBancariaId",
         cc.fecha                AS "cajaFecha",
         cc."vendedorNombre"     AS "cajeroNombre",
         cc.id                   AS "cajaDiariaId"
       FROM retiros_caja r
       JOIN cierres_caja cc ON cc.id = r."cajaDiariaId"
       WHERE ${conds.join(' AND ')}
       ORDER BY r."createdAt" DESC`,
      args,
    );
  }

  /** Suma retiros vigentes (no anulados) de una caja y actualiza la columna. */
  private async actualizarTotalRetiros(cajaDiariaId: number, manager?: EntityManager) {
    const db = manager ?? this.dataSource.manager;
    const [{ total }] = await db.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(monto), 0)::text AS total
         FROM retiros_caja
        WHERE "cajaDiariaId" = $1
          AND estado != 'anulado'`,
      [cajaDiariaId],
    );
    await db.update(CierreCaja, cajaDiariaId, { retiros: Number(total) });
  }

  /**
   * Efectivo disponible en una caja AHORA mismo.
   *
   * REFRESCA la fila antes de leerla. Los importes de la caja solo se
   * recalculan en los GET del panel, así que la fila puede estar vieja: un
   * cajero que vende RD$10.000 en efectivo y acto seguido registra un retiro
   * tendría `ventasEfectivo` desactualizado y se le rechazaría un retiro
   * perfectamente válido. Validar dinero contra un número viejo es peor que no
   * validar: bloquea al honesto y no explica por qué.
   *
   * Se ejecuta dentro de la transacción que bloquea la caja (el mismo manager),
   * para que entre el refresco, la lectura y la escritura no se cuele otro
   * retiro.
   */
  private async disponibleEnCaja(cajaId: number, manager: EntityManager): Promise<number> {
    const caja = await manager.findOne(CierreCaja, { where: { id: cajaId } });
    if (!caja) throw new BadRequestException(`Caja #${cajaId} no encontrada`);

    // Misma conversión que cerrarCaja: la columna es DATE guardada como UTC
    // midnight y toLocaleDateString daría el día anterior.
    const fechaDate = caja.fecha instanceof Date ? caja.fecha : new Date(caja.fecha as any);
    await this.recalcularDesdeBD(
      caja.id, fechaDate.toISOString().substring(0, 10),
      caja.vendedorId, caja.empresaId, manager,
    );

    const fresh = await manager.findOne(CierreCaja, { where: { id: cajaId } }) as CierreCaja;
    return calcularDisponibleParaRetiro({
      saldoApertura:     fresh.saldoApertura,
      ventasEfectivo:    fresh.ventasEfectivo,
      cobrosEfectivo:    fresh.cobrosEfectivo,
      anticiposEfectivo: fresh.anticiposEfectivo,
      gastosEfectivo:    fresh.gastosEfectivo,
      retiros:           fresh.retiros,
    });
  }

  /** Mensaje único para los dos puntos que validan disponible. */
  private errorRetiroExcedeDisponible(monto: number, disponible: number): BadRequestException {
    const f = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    return new BadRequestException(
      `El retiro de ${f(monto)} excede el efectivo disponible en caja (${f(disponible)}). ` +
      `Diferencia: ${f(monto - disponible)}.`,
    );
  }

  async listarRetiros(cajaId?: number) {
    const empresaId = this.tenantService.getEmpresaId();

    let cajaDiariaId = cajaId;
    if (!cajaDiariaId) {
      // Buscar la caja más reciente del día (abierta O cerrada) para que los
      // retiros sean visibles después del cierre — fines de consulta histórica.
      const hoy = fechaHoyRD();
      const caja = await this.repo.findOne({
        where: { empresaId, fecha: new Date(hoy) as any } as any,
        order: { id: 'DESC' },
      });
      cajaDiariaId = caja?.id;
    }
    if (!cajaDiariaId) return [];

    return this.retiroRepo.find({
      where: { empresaId, cajaDiariaId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Detalle de facturas del turno para impresión ──────────────────────────
  /**
   * `usuario` solo se exige para VENDEDOR: mismo criterio que
   * getCajaHoyByUserId — un cajero solo puede pedir el detalle de SU PROPIA
   * caja, derivado del JWT y nunca del cajaId que mande el cliente. ADMIN y
   * CONTADOR no tienen esta restricción, igual que en el resto del módulo.
   *
   * El rol se resuelve por la empresa ACTIVA (TenantService), nunca por un
   * `usuario.role` que venga de afuera — mismo motivo que cerrarCaja/
   * requiere-supervisor.guard.ts: `users.role` no sigue a la empresa activa.
   */
  async getFacturasDetalle(cajaId: number, usuario?: { id: number }) {
    const empresaId = this.tenantService.getEmpresaId();

    const caja = await this.repo.findOne({ where: { id: cajaId, empresaId } as any });
    if (!caja) throw new NotFoundException('Cierre de caja no encontrado');

    if (usuario && this.tenantService.getRolEmpresa() === UserRole.VENDEDOR) {
      const perfilRows = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM vendedores
          WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true
          LIMIT 1`,
        [usuario.id, empresaId],
      ).catch(() => []);
      const miVendedorId = perfilRows[0]?.id;
      const esPropia = caja.userId === usuario.id
        || (miVendedorId != null && caja.vendedorId === miVendedorId);
      if (!esPropia) {
        throw new ForbiddenException('Solo puedes ver el detalle de facturas de tu propia caja');
      }
    }

    const fechaStr = (caja.fecha instanceof Date
      ? caja.fecha.toISOString()
      : String(caja.fecha)
    ).split('T')[0];

    const vendedorFilter = caja.vendedorId
      ? `AND f."vendedorId" = ${Number(caja.vendedorId)}`
      : `AND f."vendedorId" IS NULL`;

    const PAGO_LABELS: Record<number, string> = {
      1: 'Efectivo', 2: 'Transferencia', 3: 'Tarjeta',
      4: 'Crédito', 5: 'Permuta', 6: 'Nota Crédito',
    };

    const rows = await this.dataSource.query<{
      id: number; folio: string; encf: string | null;
      hora: string; clienteNombre: string;
      formasPago: { tipo: number; monto: number }[] | null;
      subtotal: string; iva: string; total: string; estado: string;
    }[]>(
      `SELECT
         f.id,
         f.folio,
         e.numero    AS encf,
         f."createdAt" AS hora,
         COALESCE(c.nombre, 'Consumidor Final') AS "clienteNombre",
         f."formasPago",
         f.subtotal,
         f.iva,
         f.total,
         f.estado
       FROM facturas f
       LEFT JOIN ecf e ON e.id = f."ecfId" AND e."isActive" = true
       LEFT JOIN clientes c ON c.id = f."clienteId" AND c."isActive" = true
       WHERE DATE(f.fecha) = $1::date
         AND f."empresaId" = $2
         AND f."isActive" = true
         AND f.estado IN ('emitida', 'pagada', 'cancelada')
         -- Fuera del detalle del arqueo por lo mismo que del recálculo: una
         -- recurrente no pertenece a ningún turno. Ver recalcularDesdeBD().
         AND f."facturaRecurrenteId" IS NULL
         ${vendedorFilter}
       ORDER BY f."createdAt" ASC`,
      [fechaStr, empresaId],
    );

    // Totales por forma de pago (solo facturas no canceladas)
    const totalesPago: Record<string, number> = {};
    for (const f of rows) {
      if (f.estado === 'cancelada') continue;
      const fps = Array.isArray(f.formasPago) ? f.formasPago : [];
      if (fps.length > 0) {
        for (const fp of fps) {
          const lbl = PAGO_LABELS[fp.tipo] ?? `Tipo ${fp.tipo}`;
          totalesPago[lbl] = (totalesPago[lbl] ?? 0) + Number(fp.monto);
        }
      } else {
        totalesPago['Otro'] = (totalesPago['Otro'] ?? 0) + Number(f.total);
      }
    }

    const facturas = rows.map(f => ({
      id:            f.id,
      folio:         f.folio,
      encf:          f.encf ?? null,
      hora:          f.hora,
      clienteNombre: f.clienteNombre,
      formasPago:    Array.isArray(f.formasPago) ? f.formasPago : [],
      subtotal:      Number(f.subtotal),
      iva:           Number(f.iva),
      total:         Number(f.total),
      estado:        f.estado,
      cancelada:     f.estado === 'cancelada',
    }));

    const activas = facturas.filter(f => !f.cancelada);
    return {
      cajaId,
      fecha:          fechaStr,
      vendedorNombre: caja.vendedorNombre ?? 'Administrador',
      facturas,
      totalesPago,
      resumen: {
        totalFacturas:   activas.length,
        totalCanceladas: facturas.length - activas.length,
        subtotal: activas.reduce((s, f) => s + f.subtotal, 0),
        iva:      activas.reduce((s, f) => s + f.iva, 0),
        total:    activas.reduce((s, f) => s + f.total, 0),
      },
    };
  }

  // ── Control de caja por empresa ──────────────────────────────────────────
  /**
   * Lee directamente desde la DB si esta empresa exige control de caja.
   * No usa caché del ORM para garantizar la lectura correcta incluso si
   * la entity no está cargada (p.ej. invocaciones desde otros módulos).
   */
  private async controlCajaActivoParaEmpresa(empresaId: number): Promise<boolean> {
    const [row] = await this.dataSource.query<{ controlCajaActivo: boolean }[]>(
      `SELECT "controlCajaActivo" FROM empresa WHERE id = $1 LIMIT 1`,
      [empresaId],
    );
    return row?.controlCajaActivo === true;
  }

  async esCajaAbiertaVendedor(
    vendedorId: number | null | undefined,
    empresaId:  number,
  ): Promise<{ ok: boolean; mensaje?: string }> {
    // Si la empresa no requiere control de caja, cualquier venta está permitida.
    const controlActivo = await this.controlCajaActivoParaEmpresa(empresaId);
    if (!controlActivo) return { ok: true };

    // Sin vendedor no hay turno contra el que comprobar: la venta no se imputará
    // a ninguna caja, la haya abierta o no. Se responde explícitamente en vez de
    // dejar que TypeORM ignore el undefined y devuelva la primera caja abierta
    // que encuentre, que sería un "ok" falso. Quien llama decide qué hacer;
    // facturas.cambiarEstado() lo documenta y no bloquea.
    if (vendedorId == null) return { ok: false, mensaje: 'sin_vendedor' };

    // Buscar caja propia del vendedor O caja global (sin vendedorId asignado).
    // La caja global cubre empresas que no asocian caja por vendedor.
    const caja = await this.repo.findOne({
      where: [
        { empresaId, vendedorId,       estado: EstadoCierre.ABIERTA } as any,
        { empresaId, vendedorId: IsNull(), estado: EstadoCierre.ABIERTA } as any,
      ],
      order: { fecha: 'DESC' },
    });

    if (!caja) return { ok: false, mensaje: 'no_caja' };

    // Detectar caja huérfana: abierta pero de un día anterior.
    // No se filtra por fecha desde el inicio para soportar turnos que cruzan la medianoche,
    // pero si la diferencia supera las 24 horas es una caja olvidada abierta desde días atrás.
    const fechaCaja = (caja.fecha instanceof Date ? caja.fecha : new Date(caja.fecha as any))
      .toISOString().substring(0, 10);
    const hoy = fechaHoyRD();

    if (fechaCaja < hoy) {
      const [anio, mes, dia] = fechaCaja.split('-');
      const fechaFormateada  = `${dia}/${mes}/${anio}`;
      return {
        ok:     false,
        mensaje: `CAJA_HUERFANA:${caja.id}:Tienes una caja abierta desde el ${fechaFormateada}. ` +
                 `Ciérrala antes de facturar.`,
      };
    }

    return { ok: true };
  }
}
