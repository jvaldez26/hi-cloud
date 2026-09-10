/**
 * EcfEfectosNcService — asiento contable de la Nota de Crédito.
 *
 * Los efectos financieros de una NC (cancelar factura, ajustar CxC) se
 * aplican ÚNICAMENTE cuando DGII confirma ACEPTADO/OBSERVADO. El asiento
 * propio de la NC ahora se genera en el mismo momento — SALVO que la NC
 * venga de una devolución (devoluciones.service.ts ya generó su propio
 * asientoDevolucionVenta al procesar la devolución; generar otro aquí
 * duplicaría la reversa contable).
 *
 * COBERTURA:
 * 1. codigoMod=1 (anulación total), NC no viene de devolución → cancela la
 *    factura Y genera el asiento de la NC con los montos de la NC.
 * 2. codigoMod=3 (ajuste parcial), NC no viene de devolución → ajusta la CxC
 *    Y genera el asiento de la NC.
 * 3. NC que SÍ viene de una devolución → aplica los efectos (cancela/ajusta)
 *    pero NO genera un segundo asiento (evita duplicar la reversa).
 * 4. Idempotencia ya sellada (efectosAplicados=true) → no hace nada.
 * 5. RECHAZADO → nunca genera asiento (nunca se aplicó nada financiero).
 */

import { EcfEfectosNcService } from './ecf-efectos-nc.service';
import { DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';
import { EstadoNotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { FacturaEstado } from '../../facturas/entities/factura.entity';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

function makeService(opts: {
  nc: any;
  devRow?: { id: number } | null;
  cxcRow?: any;
}) {
  const nc = { efectosAplicados: false, ...opts.nc };

  const facturaRepoEm = { update: jest.fn().mockResolvedValue({}) };
  const ncRepoEm = {
    findOne: jest.fn().mockResolvedValue(nc),
    update:  jest.fn((_crit: any, data: any) => { Object.assign(nc, data); return Promise.resolve({}); }),
  };

  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM devoluciones')) return opts.devRow ? [opts.devRow] : [];
    if (sql.includes('FROM cuentas_por_cobrar')) return opts.cxcRow ? [opts.cxcRow] : [];
    return [];
  });

  const em = {
    getRepository: (entity: any) => (entity?.name === 'Factura' ? facturaRepoEm : ncRepoEm),
    query,
  };

  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(em)),
  };

  const asientosService = { asientoNotaCredito: jest.fn().mockResolvedValue(undefined) };

  const svc = new EcfEfectosNcService(
    {} as any, // facturaRepo — no se usa directamente, todo pasa por em.getRepository
    {} as any, // ncRepo
    dataSource as any,
    asientosService as any,
  );

  return { svc, nc, facturaRepoEm, ncRepoEm, asientosService, dataSource };
}

const ecfBase = {
  id: 99, numero: 'E34-1', empresaId: 7,
  documentoOrigenTipo: DocumentoOrigenTipo.NOTA_CREDITO,
  documentoOrigenId: 1,
};

describe('EcfEfectosNcService — asiento de la NC', () => {
  it('codigoMod=1 (total), NC sin devolución: cancela la factura y genera el asiento con los montos de la NC', async () => {
    const nc = { id: 1, facturaOriginalId: 10, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', usuarioId: 5 };
    const { svc, facturaRepoEm, asientosService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(facturaRepoEm.update).toHaveBeenCalledWith(
      { id: 10, empresaId: 7 },
      expect.objectContaining({ estado: FacturaEstado.CANCELADA }),
    );
    expect(asientosService.asientoNotaCredito).toHaveBeenCalledWith(1, 1180, 1000, 180, 'NC-1', 5);
  });

  it('codigoMod=3 (parcial), NC sin devolución: ajusta la CxC y genera el asiento con los montos de la NC', async () => {
    const nc = { id: 2, facturaOriginalId: 11, total: 354, subtotal: 300, iva: 54, numero: 'NC-2', usuarioId: 6 };
    const cxcRow = { id: 500, montoPendiente: '1180.00', montoOriginal: '1180.00', montoPagado: '0.00' };
    const { svc, asientosService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 3 } as any, EstadoDGII.ACEPTADO);

    expect(asientosService.asientoNotaCredito).toHaveBeenCalledWith(2, 354, 300, 54, 'NC-2', 6);
  });

  it('NC que viene de una devolución: aplica los efectos pero NO genera un segundo asiento', async () => {
    const nc = { id: 3, facturaOriginalId: 12, total: 500, subtotal: 423.73, iva: 76.27, numero: 'NC-3', usuarioId: 5 };
    const { svc, facturaRepoEm, asientosService } = makeService({ nc, devRow: { id: 77 } });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(facturaRepoEm.update).toHaveBeenCalled(); // el efecto financiero (cancelar factura) sí ocurre
    expect(asientosService.asientoNotaCredito).not.toHaveBeenCalled(); // pero el asiento NO se duplica
  });

  it('idempotencia: si efectosAplicados ya es true, no hace nada (no genera asiento otra vez)', async () => {
    const nc = { id: 4, facturaOriginalId: 13, total: 100, subtotal: 84.75, iva: 15.25, numero: 'NC-4', usuarioId: 5, efectosAplicados: true };
    const { svc, facturaRepoEm, asientosService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(facturaRepoEm.update).not.toHaveBeenCalled();
    expect(asientosService.asientoNotaCredito).not.toHaveBeenCalled();
  });

  it('RECHAZADO: nunca genera asiento — nada financiero fue aplicado', async () => {
    const nc = { id: 5, facturaOriginalId: 14, total: 100, subtotal: 84.75, iva: 15.25, numero: 'NC-5', usuarioId: 5 };
    const { svc, asientosService, ncRepoEm } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado(
      { ...ecfBase, codigoModificacion: 1, secuenciaUtilizada: false } as any,
      EstadoDGII.RECHAZADO,
    );

    expect(asientosService.asientoNotaCredito).not.toHaveBeenCalled();
    expect(ncRepoEm.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estado: EstadoNotaCredito.BORRADOR }),
    );
  });
});
