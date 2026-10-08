import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import type { RealtimeService } from '../../realtime/realtime.service';

/**
 * Sella una factura CONTADO como PAGADA cuando su e-CF se confirma ACEPTADO
 * por una vía ASÍNCRONA (ReintentoECFJob, ConsultarEstadoECFJob — cron o
 * botón "Consultar estado").
 *
 * Por qué existe: el camino SÍNCRONO del POS (facturas.service.ts) ya sella
 * PAGADA, pero solo si el ENVÍO inmediato tuvo éxito. Si ese envío falló o
 * dio timeout (429/403/5xx) la factura queda EMITIDA — por diseño, nunca
 * PAGADA sin e-CF confirmado — y cuando el e-CF SÍ se confirma después
 * (reintento o reconciliación), nada volvía a revisar la factura: se
 * quedaba en EMITIDA para siempre aunque DGII ya hubiera aceptado el
 * comprobante y el dinero (formasPago) ya estuviera registrado desde la
 * creación. Caso real: empresa 73, FAC-1705/1708-1714 (2026-10-07).
 *
 * Deliberadamente NO está en FacturasModule/FacturasService: ECFModule no
 * importa FacturasModule (evita el ciclo FacturasModule→ECFModule→
 * FacturasModule, que ya existe en sentido contrario) — mismo patrón que el
 * resto de este archivo hermano (reconciliacion-ecf.helper.ts) y que
 * ReintentoECFJob/ConsultarEstadoECFJob, que acceden a Factura vía
 * @InjectRepository directo en vez de vía FacturasService.
 *
 * Idempotente: no hace nada si la factura ya no está EMITIDA (ya PAGADA,
 * CANCELADA, o incluso BORRADOR) — seguro de llamar desde cualquier punto
 * que confirme un ACEPTADO, cuantas veces haga falta.
 *
 * "Rastro de cobro" usa el MISMO criterio que facturas.service.ts
 * (verificarRastroCobro), duplicado aquí a propósito en vez de importarlo
 * (es privado, y moverlo público solo para esto acoplaría los módulos sin
 * necesidad): formasPago, recibo de cobro activo, pago sobre su CxC, o NC
 * con efectosAplicados=true.
 */
export async function sellarFacturaPagadaSiCorresponde(
  facturaRepo:     Repository<Factura>,
  facturaId:       number,
  logger:          Logger,
  realtimeService?: Pick<RealtimeService, 'notify'>,
): Promise<boolean> {
  const factura = await facturaRepo.findOne({ where: { id: facturaId } });
  if (!factura) return false;
  if (factura.estado !== FacturaEstado.EMITIDA) return false; // idempotente

  // A crédito: el sellado PAGADA viene del flujo de cobro (CxC/recibo-cobro),
  // no de que DGII haya confirmado el e-CF — no tocar.
  if ((factura as any).tipoPago === 'CREDITO') return false;

  const { formasPago } = factura as any;
  let tieneRastro = Array.isArray(formasPago) && formasPago.length > 0;

  if (!tieneRastro) {
    const [{ existe }] = await facturaRepo.manager.query<{ existe: boolean }[]>(
      `SELECT (
          EXISTS (SELECT 1 FROM recibos_cobro WHERE "facturaId" = $1 AND "isActive" = true)
          OR EXISTS (
            SELECT 1 FROM cuentas_por_cobrar cxc
            JOIN pagos_cobrados pc ON pc."cuentaPorCobrarId" = cxc.id
            WHERE cxc."facturaId" = $1
          )
          OR EXISTS (
            SELECT 1 FROM notas_credito
            WHERE "facturaOriginalId" = $1 AND estado = 'emitida' AND "efectosAplicados" = true
          )
       ) AS existe`,
      [facturaId],
    );
    tieneRastro = existe;
  }

  if (!tieneRastro) {
    logger.warn(
      `[SellarPagada] Factura #${facturaId} (${factura.folio}): e-CF ACEPTADO pero sin rastro de cobro — se queda EMITIDA.`,
    );
    return false;
  }

  await facturaRepo.update(facturaId, { estado: FacturaEstado.PAGADA });
  logger.log(`[SellarPagada] Factura #${facturaId} (${factura.folio}): e-CF ACEPTADO confirmado async → EMITIDA→PAGADA.`);
  return true;
}
