import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, Between, EntityManager } from 'typeorm';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { RetiroCaja, CategoriaRetiro, EstadoRetiro } from './entities/retiro-caja.entity';
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
          sucursalId:     this.tenantService.getSucursalId() ?? undefined,
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
  ) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    if (caja.estado !== EstadoCierre.ABIERTA) {
      throw new BadRequestException('La caja ya está cerrada');
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

    await this.repo.update(id, {
      estado:           EstadoCierre.CERRADA,
      saldoCierre:      Number(saldoCierre.toFixed(2)),
      saldoFisico:      Number(saldoFisico.toFixed(2)),
      diferencia:       Number(diferencia.toFixed(2)),
      // Deja constancia de con qué fórmula salieron estos números. Un recierre
      // de un cierre viejo pasa a 2 aquí, y su versión 1 queda preservada en
      // formulaVersionOriginal.
      formulaVersion:   FORMULA_EFECTIVO_VERSION,
      notas:            notas ?? caja.notas,
      ...(desgloseBilletes ? { desgloseBilletes } : {}),
      ...(desglosePago     ? { desglosePago }     : {}),
    });

    const quien = caja.vendedorNombre ? ` [${caja.vendedorNombre}]` : '';
    this.logger.log(`Caja #${id}${quien} cerrada. Diferencia: ${diferencia.toFixed(2)}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);

    const saved = await this.repo.findOne({ where: { id } });
    const { cierreCajaCiego, umbralDescuadreCaja } = await this.getEmpresaCfg(empresaId);

    if (cierreCajaCiego && Math.abs(diferencia) > umbralDescuadreCaja) {
      this.logger.warn(
        `[CIERRE CIEGO] Descuadre en caja #${id}${quien}: ` +
        `diferencia=${diferencia.toFixed(2)} (umbral=${umbralDescuadreCaja})`,
      );
    }

    // Caja ya cerrada — siempre retornar datos completos para que la impresión sea íntegra
    return saved;
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

  // ── Helpers: configuración ciego ─────────────────────────────────────────

  private async getEmpresaCfg(empresaId: number): Promise<{
    cierreCajaCiego: boolean;
    umbralDescuadreCaja: number;
    montoMaxRetiroSinAutorizacion: number;
  }> {
    const rows = await this.dataSource.query<{ configuracion: Record<string, unknown> }[]>(
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
  private conEfectivoEsperado(caja: CierreCaja | null): any {
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

    return {
      ...caja,
      efectivoEsperado:      esperado,
      esperadoInconsistente: esperadoEsInconsistente(esperado),
      excesoRetiros:         excesoDeRetiros(esperado),
    };
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
      return this.conEfectivoEsperado(fresh);
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
      cajas: frescas.map(c => this.conEfectivoEsperado(c)),
      totalCajas: frescas.length,
    };
  }

  // A-1: scoped para VENDEDOR — usa userId del JWT, no acepta vendedorId del cliente
  async getCajaHoyByUserId(userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    const caja = await this.repo.findOne({
      where: { fecha: new Date(hoy) as any, empresaId, userId } as any,
    });
    if (!caja) return { estado: 'sin_apertura', mensaje: 'La caja no ha sido abierta hoy' };

    if (caja.estado === EstadoCierre.ABIERTA) {
      await this.recalcularDesdeBD(caja.id, hoy, caja.vendedorId, empresaId);
    }
    const fresh = await this.repo.findOne({ where: { id: caja.id } });
    const { cierreCajaCiego } = await this.getEmpresaCfg(empresaId);
    // Ciego solo mientras la caja está abierta; al cerrar el vendedor recibe datos completos para imprimir
    return (cierreCajaCiego && fresh?.estado === EstadoCierre.ABIERTA)
      ? this.ocultarCamposCiego(fresh)
      : this.conEfectivoEsperado(fresh);
  }

  // ── Historial (filtrado por empresa) ─────────────────────────────────────

  async getHistorial(page = 1, limit = 20, vendedorId?: number, mes?: number, anio?: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    // Incluimos todas las cajas (incluso las ABIERTA de días anteriores)
    // para que los admin puedan verlas y cerrarlas desde la UI.
    const where: any = { empresaId };
    if (sucursalId) where.sucursalId = sucursalId;
    if (vendedorId !== undefined) {
      where.vendedorId = vendedorId === 0 ? IsNull() : vendedorId;
    }
    if (mes && anio) {
      const inicio    = new Date(anio, mes - 1, 1);
      const fin       = new Date(anio, mes, 0);
      where.fecha     = Between(inicio, fin);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fecha: 'DESC', vendedorNombre: 'ASC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
      const cfg = await this.getEmpresaCfg(empresaId);
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
  async getFacturasDetalle(cajaId: number) {
    const empresaId = this.tenantService.getEmpresaId();

    const caja = await this.repo.findOne({ where: { id: cajaId, empresaId } as any });
    if (!caja) throw new NotFoundException('Cierre de caja no encontrado');

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
