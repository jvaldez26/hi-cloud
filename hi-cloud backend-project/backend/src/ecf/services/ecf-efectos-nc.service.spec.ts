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
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

function makeService(opts: {
  nc: any;
  devRow?: { id: number } | null;
  cxcRow?: any; // también sirve para la CxC que código 1 busca para cerrar
  anticipoCreado?: any;
  crearAnticipoError?: Error;
  asientoReclasifId?: number;
  asientoReclasifError?: Error;
}) {
  const nc = { efectosAplicados: false, ...opts.nc };

  const facturaRepoEm = { update: jest.fn().mockResolvedValue({}) };
  const ncRepoEm = {
    findOne: jest.fn().mockResolvedValue(nc),
    update:  jest.fn((_crit: any, data: any) => { Object.assign(nc, data); return Promise.resolve({}); }),
  };

  const query = jest.fn(async (sql: string, _params?: any[]) => {
    if (sql.includes('FROM devoluciones'))      return opts.devRow ? [opts.devRow] : [];
    if (sql.trim().startsWith('UPDATE'))        return []; // UPDATE cuentas_por_cobrar SET ... — sin filas que devolver
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

  const asientosService = {
    asientoNotaCredito: jest.fn().mockResolvedValue(undefined),
    asientoReclasificacionAnticipoNc: opts.asientoReclasifError
      ? jest.fn().mockRejectedValue(opts.asientoReclasifError)
      : jest.fn().mockResolvedValue(opts.asientoReclasifId ?? 777),
  };
  const devolucionesService = { crearDesdeNotaCredito: jest.fn().mockResolvedValue(null) };
  // Passthrough: en producción establece el contexto CLS que le falta al
  // cron (ver comentario en aplicarEfectosPorEstado); en el test no hay CLS
  // real que simular, solo importa que ejecute el callback.
  const tenantService = { runForEmpresa: jest.fn((_empresaId: number, fn: () => Promise<any>) => fn()) };
  const auditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const anticiposClienteService = {
    // crearPorReclasificacionNc corre DENTRO de la transacción (recibe `em`)
    // — nunca debe fallar en estos tests salvo que se pida explícitamente.
    crearPorReclasificacionNc: opts.crearAnticipoError
      ? jest.fn().mockRejectedValue(opts.crearAnticipoError)
      : jest.fn().mockResolvedValue(opts.anticipoCreado ?? { id: 55, numero: 'ANT-1' }),
    crear: jest.fn(), // nunca debe llamarse desde este flujo — ver test dedicado
  };
  const notificacionesService = { notificarSistemaEmpresa: jest.fn().mockResolvedValue(undefined) };

  const svc = new EcfEfectosNcService(
    {} as any, // facturaRepo — no se usa directamente, todo pasa por em.getRepository
    {} as any, // ncRepo
    dataSource as any,
    asientosService as any,
    devolucionesService as any,
    tenantService as any,
    auditoriaService as any,
    anticiposClienteService as any,
    notificacionesService as any,
  );

  return {
    svc, nc, facturaRepoEm, ncRepoEm, asientosService, devolucionesService, tenantService, dataSource,
    query, auditoriaService, anticiposClienteService, notificacionesService,
  };
}

const ecfBase = {
  id: 99, numero: 'E34-1', empresaId: 7,
  documentoOrigenTipo: DocumentoOrigenTipo.NOTA_CREDITO,
  documentoOrigenId: 1,
};

describe('EcfEfectosNcService — asiento de la NC', () => {
  it('codigoMod=1 (total), NC sin devolución: cancela la factura y genera el asiento con los montos de la NC', async () => {
    const nc = { id: 1, facturaOriginalId: 10, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const { svc, facturaRepoEm, asientosService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(facturaRepoEm.update).toHaveBeenCalledWith(
      { id: 10, empresaId: 7 },
      expect.objectContaining({ estado: FacturaEstado.CANCELADA }),
    );
    expect(asientosService.asientoNotaCredito).toHaveBeenCalledWith(1, 1180, 1000, 180, 'NC-1', '2026-09-19', 5);
  });

  it('codigoMod=3 (parcial), NC sin devolución: ajusta la CxC y genera el asiento con los montos de la NC', async () => {
    const nc = { id: 2, facturaOriginalId: 11, total: 354, subtotal: 300, iva: 54, numero: 'NC-2', fecha: '2026-09-19', usuarioId: 6 };
    const cxcRow = { id: 500, montoPendiente: '1180.00', montoOriginal: '1180.00', montoPagado: '0.00' };
    const { svc, asientosService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 3 } as any, EstadoDGII.ACEPTADO);

    expect(asientosService.asientoNotaCredito).toHaveBeenCalledWith(2, 354, 300, 54, 'NC-2', '2026-09-19', 6);
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

  /**
   * Bug real de producción (Sentry #7745902796, NC-101): el cron de consulta
   * de estado DGII (consultar-estado-ecf.job.ts) llama a este método SIN
   * contexto CLS. AsientosAutomaticosService.asientoNotaCredito() lee la
   * empresa de CLS (TenantService.getEmpresaId()) — sin runForEmpresa()
   * alrededor, _crearAsientoContabilizado ve "eid === undefined", omite el
   * asiento EN SILENCIO (nunca lanza, solo reporta a Sentry) y la NC quedaba
   * con la factura ya cancelada pero sin reversar Ventas/ITBIS/Clientes.
   * Este bloque prueba que el asiento (y la devolución) corren envueltos en
   * runForEmpresa(ecf.empresaId, …) — pase lo que pase con el CLS del caller.
   */
  it('el asiento y la devolución de la NC corren dentro de runForEmpresa(ecf.empresaId) — el fix del bug del cron', async () => {
    const nc = { id: 1, facturaOriginalId: 10, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const { svc, tenantService, asientosService, devolucionesService } = makeService({ nc, devRow: null });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1, empresaId: 44 } as any, EstadoDGII.ACEPTADO);

    expect(tenantService.runForEmpresa).toHaveBeenCalledWith(44, expect.any(Function));
    // Ambas llamadas deben haber ocurrido — confirma que el callback pasado a
    // runForEmpresa sí se ejecutó y llegó hasta el final, no solo se registró.
    expect(asientosService.asientoNotaCredito).toHaveBeenCalled();
    expect(devolucionesService.crearDesdeNotaCredito).toHaveBeenCalled();
  });

  it('si no hay asiento ni devolución pendientes (NC que viene de devolución), no llama a runForEmpresa — nada que envolver', async () => {
    const nc = { id: 3, facturaOriginalId: 12, total: 500, subtotal: 423.73, iva: 76.27, numero: 'NC-3', usuarioId: 5 };
    const { svc, tenantService } = makeService({ nc, devRow: { id: 77 } });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(tenantService.runForEmpresa).not.toHaveBeenCalled();
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

describe('EcfEfectosNcService — código 1 también cierra la CxC vinculada (bug real: quedaba viva para siempre)', () => {
  it('cierra la CxC (anulada, montoPendiente 0, con nota) y registra auditoría de la cancelación', async () => {
    const nc = { id: 1, facturaOriginalId: 10, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const cxcRow = { id: 500, montoPagado: '0.00' };
    const { svc, query, auditoriaService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    const updateCall = query.mock.calls.find((c: any[]) => String(c[0]).trim().startsWith('UPDATE') && String(c[0]).includes('cuentas_por_cobrar'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['Anulada por NC NC-1 (e-NCF E34-1)', 500]);

    expect(auditoriaService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: 'facturas', entidadId: '10', empresaId: 7, userId: 5,
        descripcion: expect.stringContaining('NC-1'),
      }),
    );
  });

  it('CxC con abono ya aplicado (montoPagado > 0): registra el anticipo DENTRO de la transacción y genera su asiento (Clientes/Anticipos, nunca Caja)', async () => {
    const nc = { id: 1, facturaOriginalId: 10, facturaOriginalFolio: 'FAC-10', clienteId: 9, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const cxcRow = { id: 500, montoPagado: '350.00' };
    const { svc, anticiposClienteService, asientosService } = makeService({
      nc, devRow: null, cxcRow, anticipoCreado: { id: 55, numero: 'ANT-55' },
    });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    // Registro del anticipo: dentro de la transacción (recibe el `em` como
    // 4º argumento), empresaId explícito (3º), nunca CLS.
    expect(anticiposClienteService.crearPorReclasificacionNc).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 9, monto: 350, ncNumero: 'NC-1',
        facturaOriginalId: 10, facturaOriginalFolio: 'FAC-10',
      }),
      5,   // usuarioId
      7,   // empresaId
      expect.anything(), // em de la transacción
    );
    // El método viejo (Debe Caja/Haber Anticipos — dinero NUEVO) NUNCA debe
    // usarse aquí: el dinero ya entró con el abono original.
    expect(anticiposClienteService.crear).not.toHaveBeenCalled();

    // Asiento Debe Clientes/Haber Anticipos, con el id real del anticipo creado.
    expect(asientosService.asientoReclasificacionAnticipoNc).toHaveBeenCalledWith(
      350, 55, 'NC-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 5,
    );
  });

  it('CxC SIN abono (montoPagado 0): no registra ningún anticipo ni asiento de reclasificación', async () => {
    const nc = { id: 1, facturaOriginalId: 10, clienteId: 9, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const cxcRow = { id: 500, montoPagado: '0.00' };
    const { svc, anticiposClienteService, asientosService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(anticiposClienteService.crearPorReclasificacionNc).not.toHaveBeenCalled();
    expect(asientosService.asientoReclasificacionAnticipoNc).not.toHaveBeenCalled();
  });

  it('factura de contado sin CxC vinculada: no falla, no intenta cerrar ni registrar anticipo', async () => {
    const nc = { id: 1, facturaOriginalId: 10, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const { svc, facturaRepoEm, query, anticiposClienteService } = makeService({ nc, devRow: null, cxcRow: undefined });

    await expect(
      svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO),
    ).resolves.toBeUndefined();

    expect(facturaRepoEm.update).toHaveBeenCalled(); // la factura SÍ se cancela igual
    const updateCxc = query.mock.calls.find((c: any[]) => String(c[0]).trim().startsWith('UPDATE') && String(c[0]).includes('cuentas_por_cobrar'));
    expect(updateCxc).toBeUndefined();
    expect(anticiposClienteService.crearPorReclasificacionNc).not.toHaveBeenCalled();
  });

  it('idempotencia: efectosAplicados ya es true → no vuelve a cerrar la CxC ni a registrar el anticipo', async () => {
    const nc = {
      id: 1, facturaOriginalId: 10, clienteId: 9, total: 1180, subtotal: 1000, iva: 180,
      numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5, efectosAplicados: true,
    };
    const cxcRow = { id: 500, montoPagado: '350.00' };
    const { svc, auditoriaService, anticiposClienteService } = makeService({ nc, devRow: null, cxcRow });

    await svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO);

    expect(auditoriaService.registrar).not.toHaveBeenCalled();
    expect(anticiposClienteService.crearPorReclasificacionNc).not.toHaveBeenCalled();
  });

  it('crearPorReclasificacionNc falla (dentro de la transacción): PROPAGA — nada queda a medias, el cron reintenta (TIPO A)', async () => {
    const nc = { id: 1, facturaOriginalId: 10, clienteId: 9, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const cxcRow = { id: 500, montoPagado: '350.00' };
    const { svc } = makeService({ nc, devRow: null, cxcRow, crearAnticipoError: new Error('violación de constraint') });

    await expect(
      svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1 } as any, EstadoDGII.ACEPTADO),
    ).rejects.toThrow('violación de constraint');
  });

  it('el asiento de reclasificación falla (fuera de la transacción, el anticipo YA quedó registrado): se notifica a ADMIN/CONTADOR y se reporta a Sentry, sin romper el procesamiento (TIPO B)', async () => {
    const nc = { id: 1, facturaOriginalId: 10, clienteId: 9, total: 1180, subtotal: 1000, iva: 180, numero: 'NC-1', fecha: '2026-09-19', usuarioId: 5 };
    const cxcRow = { id: 500, montoPagado: '350.00' };
    const { svc, notificacionesService, anticiposClienteService } = makeService({
      nc, devRow: null, cxcRow, anticipoCreado: { id: 55, numero: 'ANT-55' },
      asientoReclasifError: new Error('cuenta Anticipos de Clientes faltante'),
    });

    await expect(
      svc.aplicarEfectosPorEstado({ ...ecfBase, codigoModificacion: 1, empresaId: 7 } as any, EstadoDGII.ACEPTADO),
    ).resolves.toBeUndefined(); // no propaga — el anticipo ya existe y es usable

    expect(anticiposClienteService.crearPorReclasificacionNc).toHaveBeenCalled(); // el registro SÍ se completó
    expect(notificacionesService.notificarSistemaEmpresa).toHaveBeenCalledWith(
      7, expect.anything(), expect.any(String), expect.stringContaining('350.00'), 'NC-NC-1',
    );
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error), 'ecf_efectos_nc_asiento_reclasificacion_anticipo',
      expect.objectContaining({ anticipoId: '55' }),
    );
  });
});
