import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ECF, DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { reportServiceError } from '../../common/observability/sentry';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { DevolucionesService } from '../../devoluciones/devoluciones.service';

/**
 * Aplica los efectos financieros de una Nota de Crédito sobre su factura
 * original según el estado definitivo de DGII.
 *
 * ═══ INVARIANTE DE ARQUITECTURA ═══
 * Los efectos (cancelar factura, ajustar CxC) se aplican ÚNICAMENTE cuando
 * DGII confirma ACEPTADO u OBSERVADO. Nunca al emitir, nunca provisionalmente.
 * Si DGII rechaza, nada financiero fue tocado — no hay nada que revertir.
 *
 * ┌──────────────┬────────────────────────────────────────────────────────────┐
 * │ Estado DGII  │ Efecto                                                      │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ ACEPTADO /   │ codigoMod=1 → cancela factura definitivamente               │
 * │ OBSERVADO    │ codigoMod=3 → aplica ajuste de CxC                          │
 * │              │ marca efectosAplicados=true (idempotencia)                  │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ RECHAZADO    │ Limpia anulacionPendiente=false                             │
 * │              │ secuenciaUtilizada=false/null → NC vuelve a BORRADOR        │
 * │              │ secuenciaUtilizada=true       → NC queda en RECHAZADA       │
 * │              │ Sin efectos financieros (nada fue aplicado)                 │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ CONTINGENCIA │ Libera anulacionPendiente sin efectos financieros           │
 * └──────────────┴────────────────────────────────────────────────────────────┘
 *
 * Usa transacción con pessimistic_write sobre la NC para garantizar idempotencia
 * bajo concurrencia entre webhook y cron.
 */
@Injectable()
export class EcfEfectosNcService {
  private readonly logger = new Logger(EcfEfectosNcService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(NotaCredito)
    private readonly ncRepo: Repository<NotaCredito>,

    private readonly dataSource: DataSource,
    private readonly asientosService: AsientosAutomaticosService,
    private readonly devolucionesService: DevolucionesService,
  ) {}

  /**
   * @param secuenciaUtilizada  Extraída de la respuesta DGII por el caller antes
   *        de que se almacene en la columna dedicada. El parámetro llega antes de
   *        que el ecfRepo.update (que sella la columna) se ejecute, porque los
   *        efectos se aplican ANTES de sellar el estado definitivo.
   */
  async aplicarEfectosPorEstado(
    ecf: ECF,
    nuevoEstado: EstadoDGII,
    secuenciaUtilizada?: boolean | null,
  ): Promise<void> {
    if (ecf.documentoOrigenTipo !== DocumentoOrigenTipo.NOTA_CREDITO) return;
    // Solo codigoMod 1 (anulación total) y 3 (ajuste parcial) tienen efectos.
    if (ecf.codigoModificacion !== 1 && ecf.codigoModificacion !== 3) return;

    const estadosAccionables = [
      EstadoDGII.ACEPTADO,
      EstadoDGII.RECHAZADO,
      EstadoDGII.OBSERVADO,
      EstadoDGII.CONTINGENCIA,
    ];
    if (!estadosAccionables.includes(nuevoEstado)) return;

    // Poblado dentro de la transacción cuando corresponde generar el asiento
    // propio de la NC; se dispara DESPUÉS de que la transacción confirme (el
    // motor de asientos es fire-and-forget por convención en todo el
    // proyecto — nunca dentro de la transacción de negocio).
    let asientoNcAGenerar: {
      ncId: number; total: number; subtotal: number; iva: number;
      numero: string; usuarioId: number;
    } | null = null;

    // Poblado dentro de la transacción cuando esta NC (código 1 o 3, la
    // única familia con efecto financiero) no nació de una devolución —
    // mismo guard que decide el asiento propio, ver más abajo. Se dispara
    // DESPUÉS de confirmar, fire-and-forget: crear la devolución nunca debe
    // romper el procesamiento de efectos de la NC ya aplicados.
    let devolucionAGenerar: {
      empresaId: number; ncId: number; ncNumero: string;
      facturaOriginalId: number; clienteId: number; usuarioId: number;
      codigoModificacion: 1 | 3;
    } | null = null;

    try {
      await this.dataSource.transaction(async (em) => {
        // Lock pesimista: webhook y cron pueden llegar simultáneamente.
        // loadEagerRelations:false evita LEFT JOINs que rompen FOR UPDATE.
        const nc = await em.getRepository(NotaCredito).findOne({
          where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!nc) return;

        // ── CONTINGENCIA ────────────────────────────────────────────────────
        if (nuevoEstado === EstadoDGII.CONTINGENCIA) {
          // Liberar indicador visual; sin efectos financieros.
          if (nc.facturaOriginalId && ecf.codigoModificacion === 1) {
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { anulacionPendiente: false },
            );
          }
          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} → CONTINGENCIA — ` +
            `anulacionPendiente liberado${nc.facturaOriginalId ? ` en Factura #${nc.facturaOriginalId}` : ''}. ` +
            `Verificar portal DGII.`,
          );
          return;
        }

        // ── ACEPTADO / OBSERVADO ─────────────────────────────────────────────
        if (nuevoEstado === EstadoDGII.ACEPTADO || nuevoEstado === EstadoDGII.OBSERVADO) {
          if (nc.efectosAplicados) return; // idempotencia — lock garantiza que solo uno procede

          if (ecf.codigoModificacion === 1 && nc.facturaOriginalId) {
            // Anulación total: cancelar la factura definitivamente.
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { estado: FacturaEstado.CANCELADA, anulacionPendiente: false },
            );
            this.logger.log(
              `[EcfEfectosNc] ${ecf.numero} ${nuevoEstado} → Factura #${nc.facturaOriginalId} CANCELADA definitivamente`,
            );
          }

          if (ecf.codigoModificacion === 3 && nc.facturaOriginalId) {
            // Ajuste parcial: aplicar descuento en CxC ahora que DGII confirmó.
            const [cxcRow] = await em.query<any[]>(
              `SELECT id, "montoPendiente", "montoOriginal", "montoPagado"
               FROM cuentas_por_cobrar
               WHERE "facturaId" = $1 AND "empresaId" = $2
                 AND "isActive" = true AND estado NOT IN ('anulada', 'pagada')
               LIMIT 1`,
              [nc.facturaOriginalId, ecf.empresaId],
            );
            if (cxcRow) {
              const nuevoPendiente = +Math.max(0, Number(cxcRow.montoPendiente) - Number(nc.total)).toFixed(2);
              const nuevoPagado    = +Math.max(0, Number(cxcRow.montoOriginal)  - nuevoPendiente).toFixed(2);
              const nuevoEstadoCxc = nuevoPendiente <= 0 ? 'pagada' : 'pagada_parcial';
              await em.query(
                `UPDATE cuentas_por_cobrar
                 SET "montoPendiente" = $1, "montoPagado" = $2, estado = $3
                 WHERE id = $4`,
                [nuevoPendiente, nuevoPagado, nuevoEstadoCxc, cxcRow.id],
              );
              this.logger.log(
                `[EcfEfectosNc] ${ecf.numero} ${nuevoEstado} → CxC Factura #${nc.facturaOriginalId} ` +
                `reducida ${nc.total} (pendiente=${nuevoPendiente})`,
              );
            }
          }

          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { efectosAplicados: true },
          );

          // Asiento propio de la NC — SALVO que ya nace reversada: cuando la
          // NC viene de una devolución (devoluciones.service.ts:procesar),
          // esa ya generó su propio asientoDevolucionVenta en el momento de
          // procesar la devolución, referenciando el id de la DEVOLUCIÓN, no
          // el de la NC. Generar otro aquí duplicaría la reversa contable.
          const [devRow] = await em.query<{ id: number }[]>(
            `SELECT id FROM devoluciones WHERE "notaCreditoId" = $1 AND "isActive" = true LIMIT 1`,
            [nc.id],
          );
          if (!devRow) {
            asientoNcAGenerar = {
              ncId:      nc.id,
              total:     Number(nc.total),
              subtotal:  Number(nc.subtotal),
              iva:       Number(nc.iva),
              numero:    nc.numero,
              usuarioId: nc.usuarioId,
            };

            // Devoluciones ← NC: la misma condición que exime el asiento
            // (!devRow, esta NC no nació de una devolución) es la que evita
            // el ciclo en el sentido contrario — generar una devolución para
            // una NC que YA vino de una devolución la duplicaría sin fin.
            // Solo código 1 (anulación total) y 3 (ajuste/devolución) —
            // decisión de negocio, los únicos con retorno físico posible.
            if (
              (ecf.codigoModificacion === 1 || ecf.codigoModificacion === 3) &&
              nc.facturaOriginalId
            ) {
              devolucionAGenerar = {
                empresaId:          ecf.empresaId!,
                ncId:               nc.id,
                ncNumero:           nc.numero,
                facturaOriginalId:  nc.facturaOriginalId,
                clienteId:          nc.clienteId,
                usuarioId:          nc.usuarioId,
                codigoModificacion: ecf.codigoModificacion as 1 | 3,
              };
            }
          }

          if (nuevoEstado === EstadoDGII.OBSERVADO) {
            this.logger.warn(`[EcfEfectosNc] NC ${ecf.numero} OBSERVADA — revisar observaciones en portal DGII`);
          }
          return;
        }

        // ── RECHAZADO ────────────────────────────────────────────────────────
        // La arquitectura garantiza que nada financiero fue aplicado al emitir.
        // Solo limpiar el indicador visual y marcar el estado de la NC.
        if (nuevoEstado === EstadoDGII.RECHAZADO) {
          if (nc.facturaOriginalId && ecf.codigoModificacion === 1) {
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { anulacionPendiente: false },
            );
          }

          // secuenciaUtilizada: preferir el parámetro (viene de la respuesta actual);
          // como fallback leer la columna dedicada ya almacenada (reintento del cron).
          const seqUsed = secuenciaUtilizada ?? ecf.secuenciaUtilizada;

          // secuencia quemada (true)  → NC pasa a RECHAZADA (nueva NC requerida)
          // secuencia libre (false)   → NC vuelve a BORRADOR (puede corregir y reenviar)
          // sin información (null)    → BORRADOR (rechazos XML sin dgiiResponse[] no queman)
          const ncEstado = seqUsed === true
            ? EstadoNotaCredito.RECHAZADA
            : EstadoNotaCredito.BORRADOR;

          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { estado: ncEstado, efectosAplicados: false },
          );

          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} RECHAZADA → NC #${nc.id} → ${ncEstado} ` +
            `(secuenciaUtilizada=${seqUsed})`,
          );
        }
      });
    } catch (err) {
      // TIPO A (efecto de dinero): reportar a Sentry y PROPAGAR. El caller NO sella
      // estadoDGII cuando el efecto falla — el cron reintenta en la próxima pasada.
      reportServiceError(err, 'ecf_efectos_nc_aplicar', {
        ecfId:             ecf.id,
        numero:            ecf.numero,
        empresaId:         String(ecf.empresaId ?? ''),
        documentoOrigenId: String(ecf.documentoOrigenId ?? ''),
        estadoIntentado:   nuevoEstado,
      });
      throw err;
    }

    // Asiento contable de la NC — fuera de la transacción de negocio (fire-and-
    // forget, mismo patrón que el resto del proyecto): la transacción de
    // arriba ya confirmó (cancelación de factura o ajuste de CxC), así que un
    // fallo aquí no debe hacer rollback de un efecto financiero ya aplicado.
    // TS estrecha `asientoNcAGenerar` a `null` fuera de la función anidada que
    // lo reasigna (no analiza el cuerpo de closures pasadas a funciones
    // opacas como dataSource.transaction) — se re-tipa explícitamente para
    // leer el valor real que sí quedó asignado en tiempo de ejecución.
    const pendiente = asientoNcAGenerar as {
      ncId: number; total: number; subtotal: number; iva: number;
      numero: string; usuarioId: number;
    } | null;
    if (pendiente) {
      await this.asientosService.asientoNotaCredito(
        pendiente.ncId,
        pendiente.total,
        pendiente.subtotal,
        pendiente.iva,
        pendiente.numero,
        pendiente.usuarioId,
      );
    }

    // Devolución generada desde la NC — TIPO B: nunca debe romper el
    // procesamiento de efectos ya confirmado (misma razón que el bloque de
    // arriba: fuera de la transacción de negocio, que ya confirmó).
    const devPendiente = devolucionAGenerar as {
      empresaId: number; ncId: number; ncNumero: string;
      facturaOriginalId: number; clienteId: number; usuarioId: number;
      codigoModificacion: 1 | 3;
    } | null;
    if (devPendiente) {
      await this.devolucionesService.crearDesdeNotaCredito(devPendiente).catch((err: unknown) => {
        this.logger.warn(
          `[EcfEfectosNc] crear devolución desde NC ${devPendiente.ncNumero} falló (no bloquea el procesamiento): ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
        reportServiceError(err, 'ecf_efectos_nc_crear_devolucion', {
          ncId:      String(devPendiente.ncId),
          empresaId: String(devPendiente.empresaId),
          numero:    devPendiente.ncNumero,
        });
      });
    }
  }
}
