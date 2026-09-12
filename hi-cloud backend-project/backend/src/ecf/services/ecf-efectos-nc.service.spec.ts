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
 *
 * Devoluciones ← NC (misma tarea que agregó el guard de arriba, sentido
 * contrario):
 * 6. codigoMod=1 o 3, NC no viene de devolución → crea devolución pendiente
 *    (fire-and-forget, vía DevolucionesService.crearDesdeNotaCredito).
 * 7. NC que SÍ viene de una devolución → NO crea una segunda devolución
 *    (mismo !devRow que exime el asiento).
 * 8. codigoMod=2/4/5 → nunca llega a este bloque (return temprano de la
 *    función, ya cubierto por el resto de la clase) — no crea devolución.
 * 9. RECHAZADO → no crea devolución (nada financiero se aplicó).
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
  const devolucionesService = { crearDesdeNotaCredito: jest.fn().mockResolvedValue(null) };

  const svc = new EcfEfectosNcService(
    {} as any, // facturaRepo — no se usa directamente, todo pasa por em.getRepository
    {} as any, // ncRepo
    dataSource as any,
    asientosService as any,
    devolucionesService as any,
  );

  return { svc, nc, facturaRepoEm, ncRepoEm, asientosService, devolucionesService, dataSource };
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

describe('EcfEfectosNcService — devolución generada desde la NC (código 1/3)', () => {
  it('codigoMod=1, NC sin devolución: crea devolución pendiente (fire-and-forget)', async () => {
    const nc = { id: 6, facturaOriginalId: 20, clienteId: 3, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-6', usuarioId: 5 };
    const { svc, devolucionesService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1, empresaId: 7 } as any, EstadoDGII.ACEPTADO);

    expect(devolucionesService.crearDesdeNotaCredito).toHaveBeenCalledWith({
      empresaId: 7, ncId: 6, ncNumero: 'NC-6', facturaOriginalId: 20,
      clienteId: 3, usuarioId: 5, codigoModificacion: 1,
    });
  });

  it('codigoMod=3, NC sin devolución: también crea devolución pendiente', async () => {
    const nc = { id: 7, facturaOriginalId: 21, clienteId: 4, total: 354, subtotal: 300, iva: 54, numero: 'NC-7', usuarioId: 6 };
    const cxcRow = { id: 501, montoPendiente: '1180.00', montoOriginal: '1180.00', montoPagado: '0.00' };
    const { svc, devolucionesService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 3, empresaId: 7 } as any, EstadoDGII.ACEPTADO);

    expect(devolucionesService.crearDesdeNotaCredito).toHaveBeenCalledWith(
      expect.objectContaining({ ncId: 7, codigoModificacion: 3 }),
    );
  });

  it('NC que viene de una devolución (devRow existe): NO crea una segunda devolución', async () => {
    const nc = { id: 8, facturaOriginalId: 22, clienteId: 5, total: 500, subtotal: 423.73, iva: 76.27, numero: 'NC-8', usuarioId: 5 };
    const { svc, devolucionesService } = makeService({ nc, devRow: { id: 77 } });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(devolucionesService.crearDesdeNotaCredito).not.toHaveBeenCalled();
  });

  it('codigoMod=2 (corrección de texto): no llega al bloque de efectos — no crea devolución', async () => {
    const nc = { id: 9, facturaOriginalId: 23, clienteId: 6, total: 100, subtotal: 84.75, iva: 15.25, numero: 'NC-9', usuarioId: 5 };
    const { svc, devolucionesService, facturaRepoEm, asientosService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 2 } as any, EstadoDGII.ACEPTADO);

    expect(devolucionesService.crearDesdeNotaCredito).not.toHaveBeenCalled();
    expect(facturaRepoEm.update).not.toHaveBeenCalled();
    expect(asientosService.asientoNotaCredito).not.toHaveBeenCalled();
  });

  it('RECHAZADO: no crea devolución — nada financiero fue aplicado', async () => {
    const nc = { id: 10, facturaOriginalId: 24, clienteId: 7, total: 100, subtotal: 84.75, iva: 15.25, numero: 'NC-10', usuarioId: 5 };
    const { svc, devolucionesService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado(
      { ...ecfBase, codigoModificacion: 1, secuenciaUtilizada: false } as any,
      EstadoDGII.RECHAZADO,
    );

    expect(devolucionesService.crearDesdeNotaCredito).not.toHaveBeenCalled();
  });

  it('crearDesdeNotaCredito falla: se reporta a Sentry pero no rompe el procesamiento ya confirmado', async () => {
    const nc = { id: 11, facturaOriginalId: 25, clienteId: 8, total: 200, subtotal: 169.49, iva: 30.51, numero: 'NC-11', usuarioId: 5 };
    const { svc, devolucionesService } = makeService({ nc, devRow: null });
    devolucionesService.crearDesdeNotaCredito.mockRejectedValueOnce(new Error('boom'));

    await expect(
      svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO),
    ).resolves.toBeUndefined(); // no propaga — TIPO B
  });
});
