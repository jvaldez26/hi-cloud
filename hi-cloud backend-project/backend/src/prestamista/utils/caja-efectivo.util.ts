import { BadRequestException } from '@nestjs/common';

/**
 * Resuelve el cajaDiariaId a guardar en un cobro de cuota o un desembolso de
 * préstamo — Etapa 5, Parte B (ver
 * docs/prestamista/etapa-5-contabilidad-caja-fiscal.md). Mismo criterio que
 * GastosService.crear(): el campo solo tiene efecto en efectivo, y solo si
 * la empresa no apagó `configuracion.prestamoEfectivoPorCaja` (default
 * encendido — decisión ya cerrada en decisiones-pendientes.md).
 *
 * Valida SIEMPRE que la caja pertenezca a esta empresa y esté abierta antes
 * de aceptarla — nunca confía en el id que llega del body sin comprobarlo
 * (si no se validara, una empresa podría imputar su efectivo al cierre de
 * caja de otra con solo mandar un id ajeno).
 *
 * `queryable` acepta tanto `DataSource` como un `QueryRunner` ya abierto —
 * los tres call sites (PagosService, DesembolsosParcialesService,
 * PrestamosService) resuelven esto DENTRO de su propia transacción.
 */
export async function resolverCajaDiariaPrestamo(
  queryable: { query: (sql: string, params?: any[]) => Promise<any> },
  empresaId: number,
  metodoPago: string | null | undefined,
  cajaDiariaId: number | null | undefined,
): Promise<number | null> {
  if (!cajaDiariaId || metodoPago !== 'efectivo') return null;

  const [empRow] = await queryable.query(
    `SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1`, [empresaId],
  );
  const activo = (empRow?.configuracion ?? {}).prestamoEfectivoPorCaja !== false;
  if (!activo) return null;

  const [cajaRow] = await queryable.query(
    `SELECT estado FROM cierres_caja WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
    [cajaDiariaId, empresaId],
  );
  if (!cajaRow) {
    throw new BadRequestException(`La caja #${cajaDiariaId} no existe o no pertenece a esta empresa.`);
  }
  if (cajaRow.estado !== 'abierta') {
    throw new BadRequestException(`La caja #${cajaDiariaId} ya está cerrada. No se puede imputar a una caja cerrada.`);
  }
  return cajaDiariaId;
}
