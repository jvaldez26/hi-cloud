import { EmitirECFUseCase } from './emitir-ecf.use-case';
import { ECFBuilderService } from '../services/ecf-builder.service';
import { DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';

/**
 * NINGUNA validación puede quemar un e-NCF.
 *
 * Antes el número se pedía en el paso 3, ANTES de siete validaciones que pueden
 * abortar la emisión. Cada aborto incrementaba `secuenciaActual` y commiteaba,
 * dejando un hueco en la secuencia sin ninguna fila en `ecf` que lo respaldara:
 * un número entregado a la DGII del que no queda rastro.
 *
 * Cada test comprueba `secuenciaActual` ANTES y DESPUÉS. Si alguien vuelve a
 * subir `generateNext`, estos tests se ponen rojos.
 *
 * El builder es el REAL, no un doble: el caso del RNC en E32 ≥ 250.000 tiene que
 * salir del código que corre en producción, no de una imitación.
 */

/** Secuencia viva compartida por el generador falso. Es lo que se vigila. */
function crearSecuencia(inicial = 100) {
  return { id: 7, secuenciaInicial: inicial, secuenciaActual: inicial, secuenciaFinal: 9999 };
}

const CONFIG = {
  empresaId: 1, activo: true,
  rncEmisor: '131000000', razonSocialEmisor: 'EMPRESA DE PRUEBA SRL',
  modo: 'TEST', msellerUrlBase: 'https://ecf.api.mseller.app',
};

const clienteConRnc = (rnc?: string) => ({
  nombre: 'CLIENTE SRL', razonSocial: 'CLIENTE SRL',
  ...(rnc ? { rncReceptor: rnc } : {}), direccion: 'Calle 1',
});

/** Factura mínima que el builder acepta. */
const facturaBase = (over: any = {}) => ({
  id: 1, empresaId: 1, folio: 'FAC-000101',
  fecha: new Date('2026-08-23T14:00:00Z'),
  subtotal: 1000, iva: 180, total: 1180,
  cliente: clienteConRnc('131000001'),
  detalles: [{
    cantidad: 1, precio: 1000, descripcion: 'Producto', descuento: 0,
    subtotal: 1000, itbis: 180, total: 1180, indicadorFacturacion: 1,
  }],
  ...over,
});

/**
 * Nota de credito minima que supera cargarDocumentoOrigen().
 * Los detalles necesitan porcentajeIva y precioUnitario: sin base gravada y con
 * ITBIS > 0 el flujo aborta en el paso 2 y el test pasaria sin probar nada.
 */
const notaBase = (over: any = {}) => ({
  id: 1, empresaId: 1, numero: 'NC-000001',
  fecha: new Date('2026-08-23T14:00:00Z'),
  subtotal: 1000, iva: 180, total: 1180,
  cliente: clienteConRnc('131000001'),
  detalles: [{
    cantidad: 1, precioUnitario: 1000, porcentajeIva: 18,
    descripcion: 'Producto', descuento: 0,
    subtotal: 1000, itbis: 180, total: 1180, indicadorFacturacion: 1,
  }],
  ...over,
});

function montarCaso(opts: {
  documento: any;
  tipoDoc?: DocumentoOrigenTipo;
  secuencia?: ReturnType<typeof crearSecuencia>;
  padronRnc?: any;
  ncAplicadas?: string;
  ecfOriginalActivo?: any;
  ecfRechazado?: any;
}) {
  const sec = opts.secuencia ?? crearSecuencia();
  const tipoDoc = opts.tipoDoc ?? DocumentoOrigenTipo.FACTURA;
  const filasGuardadas: any[] = [];
  const snapshotsEscritos: any[] = [];
  const vinculosPedidos:   any[] = [];

  // Generador falso que se comporta como el real: incrementa la secuencia.
  // Si alguna validación lo alcanza indebidamente, el contador se mueve y el
  // test lo detecta.
  const generator = {
    generateNextEnTransaccion: async (_m: any, _e: number, tipoEcf: number) => {
      const n = sec.secuenciaActual;
      sec.secuenciaActual = n + 1;
      return `E${String(tipoEcf).padStart(2, '0')}${String(n).padStart(10, '0')}`;
    },
    generateNext: async () => { throw new Error('no debe usarse en el flujo nuevo'); },
  };

  const repoVacio = { findOne: async () => null, create: (x: any) => x, save: async (x: any) => x };

  const uc = new EmitirECFUseCase(
    { // ecfRepo
      findOne: async (q: any) => {
        // idempotencia: sin e-CF previo de ESTE documento
        if (q?.where?.documentoOrigenTipo) return null;
        // paso 4: el e-CF original en estados activos llega como where: [ ... ]
        if (Array.isArray(q?.where)) return opts.ecfOriginalActivo ?? null;
        // paso 4: la consulta puntual por RECHAZADO
        if (q?.where?.estadoDGII === EstadoDGII.RECHAZADO) return opts.ecfRechazado ?? null;
        // relectura de la fila recien guardada, al final del flujo
        if (q?.where?.id) return filasGuardadas[filasGuardadas.length - 1] ?? null;
        return null;
      },
      create: (x: any) => x,
      save:   async (x: any) => ({ id: 99, ...x }),
      update: async () => ({}),
    } as any,
    { create: (x: any) => x, save: async (x: any) => x } as any,   // eventoRepo
    { // secuenciaRepo — el flujo la busca con query builder, no con findOne
      findOne: async () => ({ ...sec, tipoECF: { id: 3, codigo: 'E32', prefijo: 'E32' } }),
      createQueryBuilder: () => {
        const qb: any = {
          innerJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb,
          getOne: async () => ({ ...sec, fechaVencimiento: '2027-12-31',
            tipoECF: { id: 3, codigo: 'E32', prefijo: 'E32' } }),
        };
        return qb;
      },
    } as any,
    { findOne: async () => CONFIG } as any,                         // configRepo
    { findOne: async () => (tipoDoc === DocumentoOrigenTipo.FACTURA ? opts.documento : null) } as any,
    repoVacio as any,                                               // notaDebitoRepo
    { findOne: async () => (tipoDoc === DocumentoOrigenTipo.NOTA_CREDITO ? opts.documento : null) } as any,
    repoVacio as any,                                               // compraRepo
    repoVacio as any,                                               // gastoRepo
    generator as any,
    new ECFBuilderService(),                                        // ← builder REAL
    { enviarDocumento: async () => ({ internalTrackId: 'T1', securityCode: 'ABC', qr_url: 'u' }) } as any,
    { } as any,                                                     // configSvc
    { consultarRNC: async () => opts.padronRnc ?? { encontrado: true, estado: 'ACTIVO' } } as any,
    { // vinculoCliente — comercial, fuera de la transacción y falla abierta
      vincular: async (facturaId: number, empresaId: number) => {
        vinculosPedidos.push({ facturaId, empresaId }); return 'vinculado';
      },
    } as any,
    { // DataSource
      query: async () => [{ ncAplicadas: opts.ncAplicadas ?? '0' }],
      getRepository: () => ({ findOne: async () => ({ id: 3, codigo: 'E32', prefijo: 'E32' }) }),
      transaction: async (cb: any) => cb({
        save: async (_e: any, x: any) => { filasGuardadas.push(x); return { id: 99, ...x }; },
        // El snapshot fiscal del comprador se escribe en la factura DENTRO de
        // esta misma transacción, para que factura y e-CF no puedan divergir.
        update: async (_e: any, criterio: any, campos: any) => {
          snapshotsEscritos.push({ criterio, campos }); return { affected: 1 };
        },
      }),
    } as any,
  );

  return { uc, sec, filasGuardadas, snapshotsEscritos, vinculosPedidos, tipoDoc };
}

/** Ejecuta esperando fallo y devuelve cuánto se movió la secuencia. */
async function fallaSinConsumir(caso: ReturnType<typeof montarCaso>, input: any) {
  const antes = caso.sec.secuenciaActual;
  let lanzo = false;
  try {
    await caso.uc.execute({
      empresaId: 1,
      documentoOrigenTipo: caso.tipoDoc,
      documentoOrigenId: 1,
      ...input,
    });
  } catch { lanzo = true; }
  return { lanzo, antes, despues: caso.sec.secuenciaActual, filas: caso.filasGuardadas.length };
}

describe('emitir e-CF — ninguna validación quema un número', () => {
  // ── E33/E34: las cinco de resolución de referencia ──────────────────────

  it('1· nota SIN factura original', async () => {
    const caso = montarCaso({
      documento: { ...notaBase(), facturaOriginalId: undefined },
      tipoDoc: DocumentoOrigenTipo.NOTA_CREDITO,
    });
    const r = await fallaSinConsumir(caso, { tipoEcf: 34 });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);   // ← la secuencia NO se movió
    expect(r.filas).toBe(0);
  });

  it('2· e-CF original RECHAZADO por la DGII', async () => {
    const caso = montarCaso({
      documento: { ...notaBase(), facturaOriginalId: 5 },
      tipoDoc: DocumentoOrigenTipo.NOTA_CREDITO,
      ecfRechazado: { id: 4, numero: 'E320000000050', estadoDGII: EstadoDGII.RECHAZADO, montoTotal: 1180 },
    });
    const r = await fallaSinConsumir(caso, { tipoEcf: 34 });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  it('3· NCF referenciado que no existe', async () => {
    const caso = montarCaso({
      documento: { ...notaBase(), facturaOriginalId: 5 },
      tipoDoc: DocumentoOrigenTipo.NOTA_CREDITO,
      // ni activo ni rechazado: no hay original que referenciar
    });
    const r = await fallaSinConsumir(caso, { tipoEcf: 34 });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  it('4· NC de anulación total con monto distinto al original (DGII 615)', async () => {
    const caso = montarCaso({
      documento: { ...notaBase({ subtotal: 424, iva: 76, total: 500, detalles: [{ cantidad: 1, precioUnitario: 424, porcentajeIva: 18, descripcion: 'P', descuento: 0, subtotal: 424, itbis: 76, total: 500, indicadorFacturacion: 1 }] }), facturaOriginalId: 5 },
      tipoDoc: DocumentoOrigenTipo.NOTA_CREDITO,
      ecfOriginalActivo: { id: 4, numero: 'E310000000050', estadoDGII: EstadoDGII.ACEPTADO, montoTotal: 1180 },
    });
    const r = await fallaSinConsumir(caso, {
      tipoEcf: 34, infoReferencia: { CodigoModificacion: '1' },
    });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  it('5· monto de la NC por encima del saldo disponible', async () => {
    const caso = montarCaso({
      documento: { ...notaBase({ subtotal: 847, iva: 153, total: 1000, detalles: [{ cantidad: 1, precioUnitario: 847, porcentajeIva: 18, descripcion: 'P', descuento: 0, subtotal: 847, itbis: 153, total: 1000, indicadorFacturacion: 1 }] }), facturaOriginalId: 5 },
      tipoDoc: DocumentoOrigenTipo.NOTA_CREDITO,
      ecfOriginalActivo: { id: 4, numero: 'E310000000050', estadoDGII: EstadoDGII.ACEPTADO, montoTotal: 1180 },
      ncAplicadas: '1000',   // ya se aplicaron 1000 de 1180 → quedan 180
    });
    const r = await fallaSinConsumir(caso, {
      tipoEcf: 34, infoReferencia: { CodigoModificacion: '3' },
    });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  // ── Facturas normales: las dos que NO son de notas ──────────────────────

  it('6· RNC del comprador NO vigente en el padrón (E31 crédito fiscal)', async () => {
    const caso = montarCaso({
      documento: facturaBase({ cliente: clienteConRnc('131000009') }),
      padronRnc: { encontrado: true, estado: 'SUSPENDIDO' },
    });
    const r = await fallaSinConsumir(caso, { tipoEcf: 31 });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  it('7· E32 de RD$250.000 o más sin RNC del comprador', async () => {
    // Este error lo lanza el builder REAL (e32.builder.ts), no un doble.
    const caso = montarCaso({
      documento: facturaBase({
        subtotal: 250_000, iva: 45_000, total: 295_000,
        cliente: clienteConRnc(undefined),
        detalles: [{
          cantidad: 1, precio: 250_000, descripcion: 'Producto', descuento: 0,
          subtotal: 250_000, itbis: 45_000, total: 295_000, indicadorFacturacion: 1,
        }],
      }),
    });
    const r = await fallaSinConsumir(caso, { tipoEcf: 32 });

    expect(r.lanzo).toBe(true);
    expect(r.despues).toBe(r.antes);
    expect(r.filas).toBe(0);
  });

  // ── El camino bueno: consume UNO, y con su fila ─────────────────────────

  it('una emisión válida consume exactamente un número y deja su fila', async () => {
    const caso = montarCaso({ documento: facturaBase() });
    const antes = caso.sec.secuenciaActual;

    await caso.uc.execute({
      empresaId: 1,
      documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
      documentoOrigenId: 1,
      tipoEcf: 32,
    });

    expect(caso.sec.secuenciaActual).toBe(antes + 1);
    // Requisito: un número emitido SIEMPRE tiene su fila.
    expect(caso.filasGuardadas).toHaveLength(1);
    expect(caso.filasGuardadas[0].numero).toContain('E32');
  });

  it('la fila se guarda con el MISMO manager de la transacción de la secuencia', async () => {
    // Si alguien vuelve a separarlas, el hueco regresa por otro camino: número
    // commiteado y fila creada aparte.
    const caso = montarCaso({ documento: facturaBase() });
    await caso.uc.execute({
      empresaId: 1,
      documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
      documentoOrigenId: 1,
      tipoEcf: 32,
    });
    // filasGuardadas solo recoge lo que pasó por manager.save dentro de
    // ds.transaction. Si el INSERT saliera fuera, estaría vacío.
    expect(caso.filasGuardadas).toHaveLength(1);
  });

  it('el snapshot del comprador se congela en la factura, en la misma transacción', async () => {
    // Si esta escritura sale de la transacción, un fallo en medio deja un e-CF
    // declarando un comprador y una factura que no sabe cuál — que es la
    // situación que el snapshot viene a eliminar.
    const caso = montarCaso({ documento: facturaBase() });
    await caso.uc.execute({
      empresaId: 1,
      documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
      documentoOrigenId: 1,
      tipoEcf: 32,
    });

    expect(caso.snapshotsEscritos).toHaveLength(1);
    const { criterio, campos } = caso.snapshotsEscritos[0];
    expect(criterio).toEqual({ id: 1, empresaId: 1 });
    // Lo declarado en el XML, no lo que diga el cliente vinculado.
    expect(campos.rncComprador).toBe('131000001');
    expect(campos.razonSocialComprador).toBe('CLIENTE SRL');
    expect(campos.rncComprador).toBe(
      caso.filasGuardadas[0].jsonEnviado.ECF.Encabezado.Comprador.RNCComprador,
    );
  });

  it('el vínculo comercial se pide aparte y no escribe el snapshot', async () => {
    // Dos campos, dos dueños, dos momentos. El snapshot se congela dentro de la
    // transacción; el vínculo se resuelve fuera y solo toca clienteId. Si algún
    // día el vínculo empieza a escribir rncComprador/razonSocialComprador, una
    // nota sobre una factura vieja saldrá con el nombre de hoy y la DGII la
    // rechazará con 615.
    const caso = montarCaso({ documento: facturaBase() });
    await caso.uc.execute({
      empresaId: 1,
      documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
      documentoOrigenId: 1,
      tipoEcf: 32,
    });

    expect(caso.vinculosPedidos).toEqual([{ facturaId: 1, empresaId: 1 }]);
    // Una sola escritura del snapshot, la de la transacción.
    expect(caso.snapshotsEscritos).toHaveLength(1);
  });
});
