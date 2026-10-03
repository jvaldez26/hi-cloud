import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CajaService } from '../../caja/caja.service';
import { CategoriaRetiro } from '../../caja/entities/retiro-caja.entity';
import { RegistrarPagoLavadorDto } from '../dto/liquidacion.dto';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CwLiquidacionesService {
  private readonly logger = new Logger(CwLiquidacionesService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly cajaService: CajaService,
  ) {}

  /**
   * Fila por lavador para la pantalla "Pagos a lavadores" — vehículos
   * lavados, ingreso que generaron (revenue del turno, sin importar su modo
   * de pago), comisión pendiente, adelantos pendientes de descontar, y lo
   * que ya se le pagó dentro de este rango (histórico de cw_liquidaciones,
   * puramente informativo). Solo lectura, no bloquea nada.
   */
  async reportePorLavador(empresaId: number, desde: string, hasta: string) {
    return this.ds.query(
      `WITH turnos_lavador AS (
         SELECT DISTINCT c."lavadorId", c."turnoId"
           FROM cw_comisiones c
          WHERE c."empresaId" = $1 AND c.estado = 'activa' AND c."liquidacionId" IS NULL
            AND c.fecha >= $2 AND c.fecha <= $3
       ),
       revenue AS (
         SELECT tl."lavadorId", COUNT(*)::int AS vehiculos, COALESCE(SUM(ts.subtotal), 0) AS "montoGenerado"
           FROM turnos_lavador tl
           JOIN (SELECT "turnoId", SUM(precio) AS subtotal FROM cw_turno_servicios GROUP BY "turnoId") ts
             ON ts."turnoId" = tl."turnoId"
          GROUP BY tl."lavadorId"
       ),
       comision_pend AS (
         SELECT "lavadorId", SUM(monto) AS "comisionGanada"
           FROM cw_comisiones
          WHERE "empresaId" = $1 AND estado = 'activa' AND "liquidacionId" IS NULL
            AND fecha >= $2 AND fecha <= $3
          GROUP BY "lavadorId"
       ),
       adelanto_pend AS (
         SELECT "lavadorId", SUM(monto) AS adelantos
           FROM cw_adelantos
          WHERE "empresaId" = $1 AND liquidado = false AND fecha >= $2 AND fecha <= $3
          GROUP BY "lavadorId"
       ),
       pagado_hist AS (
         SELECT "lavadorId", SUM("totalPagado") AS pagado
           FROM cw_liquidaciones
          WHERE "empresaId" = $1 AND desde >= $2 AND hasta <= $3
          GROUP BY "lavadorId"
       )
       SELECT l.id AS "lavadorId", l.nombre,
              COALESCE(r.vehiculos, 0) AS vehiculos,
              COALESCE(r."montoGenerado", 0) AS "montoGenerado",
              COALESCE(cp."comisionGanada", 0) AS "comisionGanada",
              COALESCE(ap.adelantos, 0) AS adelantos,
              COALESCE(ph.pagado, 0) AS pagado
         FROM cw_lavadores l
         LEFT JOIN revenue r        ON r."lavadorId" = l.id
         LEFT JOIN comision_pend cp ON cp."lavadorId" = l.id
         LEFT JOIN adelanto_pend ap ON ap."lavadorId" = l.id
         LEFT JOIN pagado_hist ph   ON ph."lavadorId" = l.id
        WHERE l."empresaId" = $1
          AND (r.vehiculos IS NOT NULL OR cp."comisionGanada" IS NOT NULL OR ap.adelantos IS NOT NULL OR ph.pagado IS NOT NULL)
        ORDER BY l.nombre`,
      [empresaId, desde, hasta],
    );
  }

  /** Vista previa, SIN bloquear nada — lo que se vería en pantalla antes de pagar. */
  async resumen(empresaId: number, lavadorId: number, desde: string, hasta: string) {
    const comisiones = await this.ds.query(
      `SELECT c.*, t.codigo AS "turnoCodigo", t.placa
         FROM cw_comisiones c
         JOIN cw_turnos t ON t.id = c."turnoId"
        WHERE c."empresaId" = $1 AND c."lavadorId" = $2 AND c.estado = 'activa'
          AND c."liquidacionId" IS NULL AND c.fecha >= $3 AND c.fecha <= $4
        ORDER BY c.fecha ASC`,
      [empresaId, lavadorId, desde, hasta],
    );
    const adelantos = await this.ds.query(
      `SELECT * FROM cw_adelantos
        WHERE "empresaId" = $1 AND "lavadorId" = $2 AND liquidado = false
          AND fecha >= $3 AND fecha <= $4
        ORDER BY fecha ASC`,
      [empresaId, lavadorId, desde, hasta],
    );
    const totalComisiones = r2(comisiones.reduce((s: number, c: any) => s + Number(c.monto), 0));
    const totalAdelantos = r2(adelantos.reduce((s: number, a: any) => s + Number(a.monto), 0));
    return {
      comisiones, adelantos, totalComisiones, totalAdelantos,
      totalPendiente: Math.max(0, r2(totalComisiones - totalAdelantos)),
    };
  }

  /**
   * Registra el pago. Dos pasos deliberadamente NO atómicos entre sí:
   *
   * 1) UNA transacción propia que bloquea (FOR UPDATE) las comisiones y
   *    adelantos elegibles (liquidacionId/liquidado aún sin marcar), crea
   *    cw_liquidaciones y marca esas líneas como liquidadas. Esto es lo que
   *    garantiza "no se liquida dos veces": una segunda llamada concurrente
   *    para el mismo lavador no encuentra nada que bloquear una vez esta
   *    transacción confirma (el filtro WHERE liquidacionId IS NULL ya no
   *    las incluye), sin importar que los rangos de fecha se solapen.
   * 2) DESPUÉS de confirmar lo anterior, se llama a CajaService.registrarRetiro
   *    — que abre SU PROPIA transacción (no acepta un EntityManager externo,
   *    es un servicio compartido y no se tocó para no arriesgar el resto de
   *    los flujos de caja). Si este paso falla (p. ej. caja ya cerrada), la
   *    liquidación YA QUEDÓ REGISTRADA (retiroCajaId queda NULL) — se
   *    devuelve con retiroRegistrado:false para que el admin registre esa
   *    salida de caja a mano; NO se revierte el marcado de líneas, porque
   *    deshacerlo sin otra carrera posible requeriría una tercera
   *    transacción igual de arriesgada.
   */
  async registrarPago(empresaId: number, dto: RegistrarPagoLavadorDto, usuarioId: number) {
    const metodoPago = dto.metodoPago ?? 'efectivo';
    // Resuelto ANTES de tocar comisiones/adelantos: si no hay caja abierta,
    // falla rápido sin dejar una liquidación varada a medio marcar.
    const cajaIdResuelta = metodoPago === 'efectivo' ? (dto.cajaId ?? await this.resolverCajaAbierta(usuarioId)) : undefined;

    const resultado = await this.ds.transaction(async em => {
      const comisiones = await em.query(
        `SELECT id, monto FROM cw_comisiones
          WHERE "empresaId" = $1 AND "lavadorId" = $2 AND estado = 'activa'
            AND "liquidacionId" IS NULL AND fecha >= $3 AND fecha <= $4
          FOR UPDATE`,
        [empresaId, dto.lavadorId, dto.desde, dto.hasta],
      );
      const adelantos = await em.query(
        `SELECT id, monto FROM cw_adelantos
          WHERE "empresaId" = $1 AND "lavadorId" = $2 AND liquidado = false
            AND fecha >= $3 AND fecha <= $4
          FOR UPDATE`,
        [empresaId, dto.lavadorId, dto.desde, dto.hasta],
      );

      if (comisiones.length === 0 && adelantos.length === 0) {
        throw new ConflictException('No hay comisiones ni adelantos pendientes de pagar en ese rango para este lavador');
      }

      const totalComisiones = r2(comisiones.reduce((s: number, c: any) => s + Number(c.monto), 0));
      const totalAdelantos = r2(adelantos.reduce((s: number, a: any) => s + Number(a.monto), 0));
      const totalPagado = Math.max(0, r2(totalComisiones - totalAdelantos));

      const [liquidacion] = await em.query(
        `INSERT INTO cw_liquidaciones
           ("empresaId", "lavadorId", desde, hasta, "totalComisiones", "totalAdelantos", "totalPagado", "usuarioId",
            "metodoPago", referencia, "cuentaBancariaId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          empresaId, dto.lavadorId, dto.desde, dto.hasta, totalComisiones, totalAdelantos, totalPagado, usuarioId,
          metodoPago, metodoPago === 'transferencia' ? (dto.referencia ?? null) : null,
          metodoPago === 'transferencia' ? (dto.cuentaBancariaId ?? null) : null,
        ],
      );
      const liquidacionId = liquidacion.id;

      if (comisiones.length) {
        await em.query(`UPDATE cw_comisiones SET "liquidacionId" = $1 WHERE id = ANY($2)`, [liquidacionId, comisiones.map((c: any) => c.id)]);
      }
      if (adelantos.length) {
        await em.query(`UPDATE cw_adelantos SET "liquidacionId" = $1, liquidado = true WHERE id = ANY($2)`, [liquidacionId, adelantos.map((a: any) => a.id)]);
      }

      return { liquidacionId, totalComisiones, totalAdelantos, totalPagado };
    });

    if (resultado.totalPagado <= 0 || metodoPago === 'transferencia') {
      return { ...resultado, retiroCajaId: null, retiroRegistrado: true };
    }

    try {
      const lavador = await this.ds.getRepository(CwLavador).findOne({ where: { id: dto.lavadorId, empresaId } });
      const retiro = await this.cajaService.registrarRetiro(
        cajaIdResuelta!,
        resultado.totalPagado,
        `Pago a lavador: ${lavador?.nombre ?? dto.lavadorId} (${dto.desde} a ${dto.hasta})`,
        usuarioId,
        undefined,
        CategoriaRetiro.PAGO_LAVADOR,
      );
      await this.ds.query(`UPDATE cw_liquidaciones SET "retiroCajaId" = $1 WHERE id = $2`, [retiro.id, resultado.liquidacionId]);
      return { ...resultado, retiroCajaId: retiro.id, retiroRegistrado: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Liquidación #${resultado.liquidacionId} registrada pero el retiro de caja falló — ` +
        `RD$${resultado.totalPagado} de lavador #${dto.lavadorId} quedó SIN salida de caja: ${msg}`,
      );
      return { ...resultado, retiroCajaId: null, retiroRegistrado: false, errorRetiro: msg };
    }
  }

  /** 400 explícito en vez de dejar que registrarRetiro reviente con "Caja #undefined no encontrada". */
  private async resolverCajaAbierta(usuarioId: number): Promise<number> {
    const caja = await this.cajaService.getCajaHoyByUserId(usuarioId);
    if (!caja || !('id' in caja) || (caja as any).estado !== 'abierta') {
      throw new BadRequestException('Abra la caja para pagar en efectivo');
    }
    return (caja as any).id;
  }
}
