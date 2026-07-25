import { ECFBuilderService, ECFBuildInput } from './ecf-builder.service';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';
import { EcfRncRequeridoError } from '../errors/ecf.errors';

// ── Factories de datos de prueba ──────────────────────────────────────────────

function makeConfig(overrides: Partial<any> = {}): any {
  return {
    empresaId:          1,
    msellerEmail:       'test@empresa.com',
    msellerPasswordEnc: 'enc',
    msellerApiKeyEnc:   'enc',
    msellerUrlBase:     'https://ecf.api.mseller.app',
    modo:               ModoEcf.TEST,
    rncEmisor:          '132414691',
    razonSocialEmisor:  'Empresa Demo S.R.L.',
    nombreComercial:    'Demo',
    direccionEmisor:    'Av. Principal #1, Santo Domingo',
    municipio:          'Santo Domingo',
    provincia:          'Distrito Nacional',
    activo:             true,
    ...overrides,
  };
}

function makeDetalle(opts: { precio?: number; cantidad?: number; iva?: number; desc?: string } = {}): any {
  const precio   = opts.precio   ?? 100;
  const cantidad = opts.cantidad ?? 1;
  const pct      = opts.iva      ?? 18;
  const subtotal = precio * cantidad;
  return {
    id:             1,
    productoId:     1,
    descripcion:    opts.desc ?? 'Producto de prueba',
    precioUnitario: precio,
    cantidad,
    porcentajeIva:  pct,
    subtotal,
    importeIva:     subtotal * (pct / 100),
    total:          subtotal * (1 + pct / 100),
  };
}

function makeFactura(overrides: Partial<any> = {}): any {
  const detalles = overrides.detalles ?? [makeDetalle()];
  const subtotal = detalles.reduce((s: number, d: any) => s + Number(d.subtotal), 0);
  const iva      = detalles.reduce((s: number, d: any) => s + Number(d.importeIva), 0);
  return {
    id:        1,
    folio:     'FAC-202601-0001',
    fecha:     new Date('2026-01-15'),
    empresaId: 1,
    subtotal,
    iva,
    total:     subtotal + iva,
    tipoNcf:   'E32',
    detalles,
    cliente:   overrides.cliente ?? {
      id: 1, nombre: 'Consumidor Final', rfc: null, rncReceptor: null, esExtranjero: false,
    },
    ...overrides,
  };
}

function makeInput(opts: {
  tipoEcf?:          number;
  facturaOverrides?:  any;
  configOverrides?:   any;
  infoReferencia?:    any;
  nombreExtranjero?:  string;
  paisExtranjero?:    string;
} = {}): ECFBuildInput {
  const vence = new Date(2027, 11, 31, 12, 0, 0);
  return {
    encf:             `E${String(opts.tipoEcf ?? 32).padStart(2, '0')}0000000001`,
    factura:          makeFactura(opts.facturaOverrides),
    config:           makeConfig(opts.configOverrides),
    fechaVencSec:     vence,
    infoReferencia:   opts.infoReferencia,
    nombreExtranjero: opts.nombreExtranjero,
    paisExtranjero:   opts.paisExtranjero,
  };
}

const INFO_REF_E33 = {
  NCFModificado:      'E310000000001',
  FechaNCFModificado: '15-01-2026',
  CodigoModificacion: '3',
};

const INFO_REF_E34 = {
  NCFModificado:      'E310000000001',
  FechaNCFModificado: '15-01-2026',
  CodigoModificacion: '1',
};

const CLIENTE_CON_RNC = { id: 2, nombre: 'Empresa Demo SA', rncReceptor: '101234567', rfc: null, direccion: 'Av. 27 de Febrero #1' };

// ── Suite principal ───────────────────────────────────────────────────────────

describe('ECFBuilderService', () => {
  let service: ECFBuilderService;

  beforeEach(() => {
    service = new ECFBuilderService();
  });

  // ── Tipos soportados ──────────────────────────────────────────────────────

  it('lista los 10 tipos soportados (E31-E47)', () => {
    expect(service.getTiposSoportados()).toEqual([31, 32, 33, 34, 41, 43, 44, 45, 46, 47]);
  });

  it('lanza Error para tipo genuinamente no soportado (99)', () => {
    const input = makeInput({ tipoEcf: 32 });
    expect(() => service.build(99, input)).toThrow(/No hay builder registrado/);
  });

  // ── E32 — Factura de Consumo ──────────────────────────────────────────────

  describe('E32 — Factura de Consumo', () => {
    it('monto bajo sin RNC → usa "00000000000" y "Consumidor Final"', () => {
      const p = service.build(32, makeInput({ tipoEcf: 32 }));
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('00000000000');
      expect(p.ECF.Encabezado.Comprador!.RazonSocialComprador).toBe('Consumidor Final');
    });

    it('monto bajo con RNC → usa RNC del cliente', () => {
      const p = service.build(32, makeInput({
        tipoEcf: 32,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
      }));
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
      expect(p.ECF.Encabezado.Comprador!.RazonSocialComprador).toBe('Empresa Demo SA');
    });

    it('monto ≥ 250,000 sin RNC → lanza EcfRncRequeridoError', () => {
      const fn = () => service.build(32, makeInput({
        tipoEcf: 32,
        facturaOverrides: {
          detalles: [makeDetalle({ precio: 250_000 })],
          total:    295_000,
          cliente:  { id: 1, nombre: 'Consumidor', rfc: null, rncReceptor: null },
        },
      }));
      expect(fn).toThrow(EcfRncRequeridoError);
      expect(fn).toThrow(/250,000/);
    });

    it('monto ≥ 250,000 con RNC → construye correctamente', () => {
      const p = service.build(32, makeInput({
        tipoEcf: 32,
        facturaOverrides: {
          detalles: [makeDetalle({ precio: 250_000 })],
          total:    295_000,
          cliente:  CLIENTE_CON_RNC,
        },
      }));
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
    });

    it('IdDoc contiene campos obligatorios E32 (sin FechaVencimientoSecuencia — spec nueva)', () => {
      const idDoc = service.build(32, makeInput({ tipoEcf: 32 })).ECF.Encabezado.IdDoc;
      expect(idDoc.TipoeCF).toBe(32);
      expect(idDoc.eNCF).toBe('E320000000001');
      expect((idDoc as any).FechaVencimientoSecuencia).toBeUndefined(); // removido en spec nueva
      expect(idDoc.TipoIngresos).toBe('01');
      expect(idDoc.TipoPago).toBe(1);
      expect(idDoc.IndicadorMontoGravado).toBeDefined();
      expect(idDoc.IndicadorEnvioDiferido).toBe(1);
    });

    it('fecha de emisión tiene formato DD-MM-YYYY', () => {
      const f = service.build(32, makeInput({ tipoEcf: 32 })).ECF.Encabezado.Emisor.FechaEmision;
      expect(f).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    });

    it('E32 NO tiene TablaFormasPago en IdDoc', () => {
      const idDoc = service.build(32, makeInput({ tipoEcf: 32 })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).TablaFormasPago).toBeUndefined();
    });
  });

  // ── E31 — Factura de Crédito Fiscal ───────────────────────────────────────

  describe('E31 — Factura de Crédito Fiscal', () => {
    it('sin RNC → lanza EcfRncRequeridoError', () => {
      const fn = () => service.build(31, makeInput({
        tipoEcf: 31,
        facturaOverrides: { cliente: { id: 1, nombre: 'Sin RNC', rfc: null, rncReceptor: null } },
      }));
      expect(fn).toThrow(EcfRncRequeridoError);
    });

    it('con rncReceptor → asigna comprador correctamente', () => {
      const p = service.build(31, makeInput({ tipoEcf: 31, facturaOverrides: { cliente: CLIENTE_CON_RNC } }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(31);
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
      expect(p.ECF.Encabezado.Comprador!.RazonSocialComprador).toBe('Empresa Demo SA');
    });

    it('acepta rfc como fallback si rncReceptor es null', () => {
      const p = service.build(31, makeInput({
        tipoEcf: 31,
        facturaOverrides: { cliente: { id: 2, nombre: 'Empresa', rfc: '101234567', rncReceptor: null } },
      }));
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
    });

    it('E31 declara IndicadorMontoGravado=0 (los montos NO incluyen ITBIS)', () => {
      const idDoc = service.build(31, makeInput({ tipoEcf: 31, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      // El builder transparenta el ITBIS: MontoItem=100 y MontoTotal=118, así que
      // el indicador debe ser 0. Antes este test exigía que el campo no existiera.
      expect((idDoc as any).IndicadorMontoGravado).toBe(0);
    });

    it('E31 tiene IndicadorEnvioDiferido=1 y TipoIngresos="01"', () => {
      const idDoc = service.build(31, makeInput({ tipoEcf: 31, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      expect(idDoc.IndicadorEnvioDiferido).toBe(1);
      expect(idDoc.TipoIngresos).toBe('01');
    });
  });

  // ── E33 — Nota de Débito ──────────────────────────────────────────────────

  describe('E33 — Nota de Débito', () => {
    it('sin infoReferencia → lanza Error', () => {
      expect(() => service.build(33, makeInput({ tipoEcf: 33 }))).toThrow(/infoReferencia/);
    });

    it('con infoReferencia → construye payload E33 correcto', () => {
      const p = service.build(33, makeInput({
        tipoEcf:          33,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E33,
      }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(33);
      expect(p.ECF.InformacionReferencia!.NCFModificado).toBe('E310000000001');
      expect(p.ECF.InformacionReferencia!.CodigoModificacion).toBe('3');
    });

    it('E33 tiene TablaFormasPago dentro de Totales', () => {
      const p = service.build(33, makeInput({
        tipoEcf:          33,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E33,
      }));
      // La tabla cuelga de Totales, no de IdDoc (orden XSD del Encabezado).
      const formasPago = (p.ECF.Encabezado.Totales as any).TablaFormasPago;
      expect(formasPago).toBeDefined();
      expect(Array.isArray(formasPago.FormaDePago)).toBe(true);
      expect((p.ECF.Encabezado.IdDoc as any).TablaFormasPago).toBeUndefined();
    });

    it('E33 NO tiene IndicadorEnvioDiferido', () => {
      const p = service.build(33, makeInput({
        tipoEcf:          33,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E33,
      }));
      expect((p.ECF.Encabezado.IdDoc as any).IndicadorEnvioDiferido).toBeUndefined();
    });

    it('E33 items usan valores STRING (CantidadItem, MontoItem)', () => {
      const p = service.build(33, makeInput({
        tipoEcf:          33,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E33,
      }));
      const item = p.ECF.DetallesItems.Item[0];
      expect(typeof item.CantidadItem).toBe('string');
      expect(typeof item.MontoItem).toBe('string');
      expect(item.UnidadMedida).toBe('47');
    });
  });

  // ── E34 — Nota de Crédito ─────────────────────────────────────────────────

  describe('E34 — Nota de Crédito', () => {
    it('sin infoReferencia → lanza Error', () => {
      expect(() => service.build(34, makeInput({ tipoEcf: 34 }))).toThrow(/infoReferencia/);
    });

    it('con infoReferencia → construye payload E34 correcto', () => {
      const p = service.build(34, makeInput({
        tipoEcf:          34,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E34,
      }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(34);
      expect(p.ECF.InformacionReferencia!.NCFModificado).toBe('E310000000001');
      expect(p.ECF.InformacionReferencia!.CodigoModificacion).toBe('1');
    });

    // IndicadorNotaCredito se calcula contra la fecha ACTUAL a partir de
    // FechaNCFModificado (la del comprobante que se corrige): ≤30 días = '0',
    // >30 = '1'. El test anterior fijaba '0' con una fecha de enero de 2026, así
    // que caducó solo con el paso del tiempo. Ahora la fecha es relativa a hoy.
    const refConFecha = (diasAtras: number) => {
      const d  = new Date(Date.now() - diasAtras * 24 * 3600 * 1000);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return { ...INFO_REF_E34, FechaNCFModificado: `${dd}-${mm}-${d.getFullYear()}` };
    };

    it('IndicadorNotaCredito=0 si el comprobante corregido tiene ≤30 días', () => {
      const p = service.build(34, makeInput({
        tipoEcf:          34,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   refConFecha(5),
      }));
      expect((p.ECF.Encabezado.IdDoc as any).IndicadorNotaCredito).toBe('0');
    });

    it('IndicadorNotaCredito=1 si el comprobante corregido tiene más de 30 días', () => {
      const p = service.build(34, makeInput({
        tipoEcf:          34,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   refConFecha(60),
      }));
      expect((p.ECF.Encabezado.IdDoc as any).IndicadorNotaCredito).toBe('1');
    });

    it('E34 tiene IndicadorEnvioDiferido=1 y IndicadorMontoGravado', () => {
      const idDoc = service.build(34, makeInput({
        tipoEcf:          34,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E34,
      })).ECF.Encabezado.IdDoc;
      expect(idDoc.IndicadorEnvioDiferido).toBe(1);
      expect(idDoc.IndicadorMontoGravado).toBeDefined();
    });

    it('E34 items usan valores NUMÉRICOS (igual que E31/E32)', () => {
      const p = service.build(34, makeInput({
        tipoEcf:          34,
        facturaOverrides: { cliente: CLIENTE_CON_RNC },
        infoReferencia:   INFO_REF_E34,
      }));
      const item = p.ECF.DetallesItems.Item[0];
      expect(typeof item.CantidadItem).toBe('number');
      expect(typeof item.MontoItem).toBe('number');
      expect(item.UnidadMedida).toBe(43);
    });
  });

  // ── E41 — Comprobante de Compras ──────────────────────────────────────────

  describe('E41 — Comprobante de Compras', () => {
    it('sin RNC proveedor → lanza EcfRncRequeridoError', () => {
      expect(() => service.build(41, makeInput({ tipoEcf: 41 }))).toThrow(EcfRncRequeridoError);
    });

    it('con RNC → construye payload E41 correcto', () => {
      const p = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(41);
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
    });

    // Retencion es minOccurs=1 en el XSD de E41: va en cada ítem aunque el monto
    // sea 0, y por eso los totales de retención también son obligatorios.
    it('E41 Totales incluye TotalITBISRetenido y TotalISRRetencion', () => {
      const totales = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.Totales;
      expect((totales as any).TotalITBISRetenido).toBeDefined();
      expect((totales as any).TotalISRRetencion).toBeDefined();
      expect(totales.MontoTotal).toBeGreaterThan(0);
    });

    it('E41 items llevan Retencion (obligatoria en el XSD, aunque sea 0)', () => {
      const p = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } }));
      const item = p.ECF.DetallesItems.Item[0] as any;
      expect(item.Retencion).toBeDefined();
      expect(item.Retencion.IndicadorAgenteRetencionoPercepcion).toBe(1);
      expect(item.Retencion).toHaveProperty('MontoITBISRetenido');
      expect(item.Retencion).toHaveProperty('MontoISRRetenido');
    });

    it('E41 los totales de retención cuadran con la suma de los ítems', () => {
      const p = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } }));
      const items   = p.ECF.DetallesItems.Item as any[];
      const totales = p.ECF.Encabezado.Totales as any;
      const sumaItbis = items.reduce((s, i) => s + Number(i.Retencion?.MontoITBISRetenido ?? 0), 0);
      const sumaIsr   = items.reduce((s, i) => s + Number(i.Retencion?.MontoISRRetenido   ?? 0), 0);
      expect(totales.TotalITBISRetenido).toBeCloseTo(sumaItbis, 2);
      expect(totales.TotalISRRetencion).toBeCloseTo(sumaIsr, 2);
    });

    it('E41 NO tiene IndicadorEnvioDiferido ni TipoIngresos', () => {
      const idDoc = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).IndicadorEnvioDiferido).toBeUndefined();
      expect((idDoc as any).TipoIngresos).toBeUndefined();
    });

    it('E41 tiene TipoPago=2 y FechaLimitePago', () => {
      const idDoc = service.build(41, makeInput({ tipoEcf: 41, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).TipoPago).toBe(2);
      expect((idDoc as any).FechaLimitePago).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    });
  });

  // ── E43 — Gastos Menores ──────────────────────────────────────────────────

  describe('E43 — Gastos Menores', () => {
    it('construye payload E43 SIN Comprador (autofactura interna, minOccurs=0)', () => {
      const p = service.build(43, makeInput({ tipoEcf: 43 }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(43);
      // E43 sustenta gastos del propio personal: no hay tercero comprador. El
      // test anterior esperaba el RNC genérico 131880657, que ya no se emite.
      expect(p.ECF.Encabezado.Comprador).toBeUndefined();
    });

    it('E43 Totales solo tiene MontoExento y MontoTotal', () => {
      const totales = service.build(43, makeInput({ tipoEcf: 43 })).ECF.Encabezado.Totales;
      expect(totales.MontoTotal).toBeGreaterThan(0);
      expect(totales.MontoExento).toBeGreaterThan(0);
      expect((totales as any).TotalITBIS).toBeUndefined();
      expect((totales as any).MontoGravadoTotal).toBeUndefined();
    });

    it('E43 tiene TipoPago y NO lleva IndicadorMontoGravado', () => {
      const idDoc = service.build(43, makeInput({ tipoEcf: 43 })).ECF.Encabezado.IdDoc;
      // Todo E43 es exento, así que el indicador no aplica.
      expect((idDoc as any).IndicadorMontoGravado).toBeUndefined();
      expect((idDoc as any).TipoPago).toBeDefined();
      expect((idDoc as any).TipoIngresos).toBeUndefined();
      expect((idDoc as any).IndicadorEnvioDiferido).toBeUndefined();
    });
  });

  // ── E44 — Regímenes Especiales (Zona Franca) ──────────────────────────────

  describe('E44 — Zona Franca', () => {
    it('sin RNC → lanza EcfRncRequeridoError', () => {
      expect(() => service.build(44, makeInput({ tipoEcf: 44 }))).toThrow(EcfRncRequeridoError);
    });

    it('con RNC → ITBIS=0, MontoExento=subtotal', () => {
      const factura = makeFactura({ cliente: CLIENTE_CON_RNC }); // subtotal=100, iva=18, total=118
      const input: ECFBuildInput = {
        encf:         'E440000000001',
        factura,
        config:       makeConfig(),
        fechaVencSec: new Date(2027, 11, 31),
      };
      const p = service.build(44, input);
      const totales = p.ECF.Encabezado.Totales;
      // MontoExento = subtotal (100), no total (118)
      expect(totales.MontoExento).toBe(100);
      expect(totales.MontoTotal).toBe(100);
      expect(totales.TotalITBIS).toBeUndefined();
      expect(totales.MontoGravadoTotal).toBeUndefined();
    });

    it('E44 todos los items tienen IndicadorFacturacion=4 (exento)', () => {
      const facturaConMixItems = makeFactura({
        cliente: CLIENTE_CON_RNC,
        detalles: [makeDetalle({ iva: 18 }), makeDetalle({ iva: 0 })],
      });
      const p = service.build(44, {
        encf:         'E440000000001',
        factura:      facturaConMixItems,
        config:       makeConfig(),
        fechaVencSec: new Date(2027, 11, 31),
      });
      const items = p.ECF.DetallesItems.Item;
      items.forEach(item => {
        expect(item.IndicadorFacturacion).toBe(4);
      });
    });

    it('E44 tiene TipoIngresos="01" y NO lleva IndicadorMontoGravado', () => {
      const idDoc = service.build(44, makeInput({ tipoEcf: 44, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).IndicadorEnvioDiferido).toBeUndefined();
      expect((idDoc as any).TipoIngresos).toBe('01');
      // El campo no existe en el XSD de E44 y enviarlo hace que la DGII rechace
      // el comprobante con error 3.
      expect((idDoc as any).IndicadorMontoGravado).toBeUndefined();
    });
  });

  // ── E45 — Gubernamental ───────────────────────────────────────────────────

  describe('E45 — Gubernamental', () => {
    it('sin RNC → lanza EcfRncRequeridoError', () => {
      expect(() => service.build(45, makeInput({ tipoEcf: 45 }))).toThrow(EcfRncRequeridoError);
    });

    it('con RNC → construye payload E45 con ITBIS normal', () => {
      const p = service.build(45, makeInput({ tipoEcf: 45, facturaOverrides: { cliente: CLIENTE_CON_RNC } }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(45);
      expect(p.ECF.Encabezado.Comprador!.RNCComprador).toBe('101234567');
      // E45 paga ITBIS normal (a diferencia de E44)
      const totales = p.ECF.Encabezado.Totales;
      expect(totales.TotalITBIS).toBeDefined();
      expect(totales.MontoGravadoTotal).toBeDefined();
    });

    it('E45 incluye NumeroOrdenCompra si el cliente lo tiene', () => {
      const clienteConOC = { ...CLIENTE_CON_RNC, numeroOrdenCompra: 'OC-2026-001' };
      const p = service.build(45, makeInput({ tipoEcf: 45, facturaOverrides: { cliente: clienteConOC } }));
      expect((p.ECF.Encabezado.Comprador as any).NumeroOrdenCompra).toBe('OC-2026-001');
    });

    it('E45 tiene TipoIngresos="01" y IndicadorMontoGravado (sin IndicadorEnvioDiferido — spec nueva)', () => {
      const idDoc = service.build(45, makeInput({ tipoEcf: 45, facturaOverrides: { cliente: CLIENTE_CON_RNC } })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).IndicadorEnvioDiferido).toBeUndefined();
      expect((idDoc as any).TipoIngresos).toBe('01');
      expect((idDoc as any).IndicadorMontoGravado).toBeDefined();
    });
  });

  // ── E46 — Exportaciones ───────────────────────────────────────────────────

  describe('E46 — Exportaciones', () => {
    // El comprador de E46 exige identificación fiscal: IdentificadorExtranjero
    // para un cliente de fuera, o RNCComprador si es Zona Franca (residente RD).
    // Los campos se llaman RazonSocialComprador y PaisComprador; el spec anterior
    // usaba NombreExtranjero/PaisCompradorExtranjero, que ya no se emiten.
    const CLIENTE_EXTRANJERO = {
      id: 7, nombre: 'Global Imports Ltd', rfc: null, rncReceptor: null,
      esExtranjero: true, identificadorExtranjero: 'EIN-123456',
    };

    it('sin identificación fiscal del comprador → lanza EcfRncRequeridoError', () => {
      expect(() => service.build(46, makeInput({ tipoEcf: 46 }))).toThrow(EcfRncRequeridoError);
    });

    it('cliente extranjero → IdentificadorExtranjero + RazonSocialComprador + PaisComprador', () => {
      const p = service.build(46, makeInput({
        tipoEcf:          46,
        facturaOverrides: { cliente: CLIENTE_EXTRANJERO },
        nombreExtranjero: 'Global Imports Ltd',
        paisExtranjero:   'MX',
      }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(46);
      const comprador = p.ECF.Encabezado.Comprador! as any;
      expect(comprador.IdentificadorExtranjero).toBe('EIN-123456');
      expect(comprador.RazonSocialComprador).toBe('Global Imports Ltd');
      expect(comprador.PaisComprador).toBe('MX');
      expect(comprador.RNCComprador).toBeUndefined();
    });

    it('Zona Franca (residente con RNC) → usa RNCComprador', () => {
      const p = service.build(46, makeInput({
        tipoEcf:          46,
        facturaOverrides: { cliente: { ...CLIENTE_CON_RNC, esExtranjero: false } },
      }));
      const comprador = p.ECF.Encabezado.Comprador! as any;
      expect(comprador.RNCComprador).toBe('101234567');
      expect(comprador.IdentificadorExtranjero).toBeUndefined();
    });

    it('E46 Totales son de TASA CERO, no exentos', () => {
      const p = service.build(46, makeInput({ tipoEcf: 46, facturaOverrides: { cliente: CLIENTE_EXTRANJERO } }));
      const totales = p.ECF.Encabezado.Totales as any;
      // Una exportación se grava a tasa 0% (IndicadorFacturacion=3), no es exenta:
      // el monto va en MontoGravadoI3 con ITBIS3=0, y no hay MontoExento.
      expect(totales.MontoGravadoI3).toBeGreaterThan(0);
      expect(totales.ITBIS3).toBe(0);
      expect(totales.TotalITBIS).toBe(0);
      expect(totales.MontoTotal).toBeGreaterThan(0);
      expect(totales.MontoExento).toBeUndefined();
      expect((p as any).ECF.OtraMoneda).toBeUndefined();
    });

    it('E46 usa país por defecto "US" si no se provee paisExtranjero', () => {
      const comprador = service.build(46, makeInput({
        tipoEcf: 46, facturaOverrides: { cliente: CLIENTE_EXTRANJERO },
      })).ECF.Encabezado.Comprador! as any;
      expect(comprador.PaisComprador).toBe('US');
    });

    it('E46 tiene TipoIngresos="01" y TipoPago=1', () => {
      const idDoc = service.build(46, makeInput({
        tipoEcf: 46, facturaOverrides: { cliente: CLIENTE_EXTRANJERO },
      })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).TipoIngresos).toBe('01');
      expect((idDoc as any).TipoPago).toBe(1);
    });
  });

  // ── E47 — Pagos al Exterior ───────────────────────────────────────────────

  describe('E47 — Pagos al Exterior', () => {
    it('usa RazonSocialComprador y NO lleva PaisComprador', () => {
      const p = service.build(47, makeInput({
        tipoEcf:          47,
        nombreExtranjero: 'Acme Corp',
        paisExtranjero:   'US',
      }));
      expect(p.ECF.Encabezado.IdDoc.TipoeCF).toBe(47);
      const comprador = p.ECF.Encabezado.Comprador! as any;
      expect(comprador.RazonSocialComprador).toBe('Acme Corp');
      // A diferencia de E46, el XSD de E47 no incluye el país del comprador.
      expect(comprador.PaisComprador).toBeUndefined();
      expect(comprador.IdentificadorExtranjero).toBeUndefined();
    });

    it('E47 Totales llevan MontoExento, MontoTotal y TotalISRRetencion', () => {
      const totales = service.build(47, makeInput({ tipoEcf: 47 })).ECF.Encabezado.Totales as any;
      expect(totales.MontoExento).toBeGreaterThan(0);
      expect(totales.MontoTotal).toBeGreaterThan(0);
      // TotalISRRetencion acompaña siempre a la Retencion de los ítems y debe
      // cuadrar con su suma (0 cuando no hay retención practicada).
      expect(totales.TotalISRRetencion).toBeDefined();
      const items = service.build(47, makeInput({ tipoEcf: 47 })).ECF.DetallesItems.Item as any[];
      const suma  = items.reduce((s, i) => s + Number(i.Retencion?.MontoISRRetenido ?? 0), 0);
      expect(totales.TotalISRRetencion).toBeCloseTo(suma, 2);
    });

    it('E47 NO tiene Subtotales ni OtraMoneda (spec nueva)', () => {
      const p = service.build(47, makeInput({ tipoEcf: 47 })) as any;
      expect(p.ECF.Subtotales).toBeUndefined();
      expect(p.ECF.OtraMoneda).toBeUndefined();
    });

    it('E47 items llevan Retencion (minOccurs=1 en el XSD, aunque sea 0)', () => {
      const item = service.build(47, makeInput({ tipoEcf: 47 })).ECF.DetallesItems.Item[0] as any;
      expect(item.Retencion).toBeDefined();
      expect(item.Retencion.IndicadorAgenteRetencionoPercepcion).toBe(1);
      expect(item.Retencion).toHaveProperty('MontoISRRetenido');
    });

    it('E47 NO tiene TipoIngresos', () => {
      const idDoc = service.build(47, makeInput({ tipoEcf: 47 })).ECF.Encabezado.IdDoc;
      expect((idDoc as any).TipoIngresos).toBeUndefined();
      expect((idDoc as any).IndicadorEnvioDiferido).toBeUndefined();
    });
  });

  // ── Items con ITBIS ───────────────────────────────────────────────────────

  describe('IndicadorFacturacion según porcentaje ITBIS', () => {
    it('18% ITBIS → indicador = 1', () => {
      const items = service.build(32, makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 18 })] } })).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(1);
    });

    it('16% ITBIS → indicador = 2', () => {
      const items = service.build(32, makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 16 })] } })).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(2);
    });

    it('0% ITBIS (exento) → indicador = 4', () => {
      const items = service.build(32, makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 0 })] } })).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(4);
    });

    it('mix items distintas tasas → totales correctos', () => {
      const d1 = makeDetalle({ precio: 1000, iva: 18 });
      const d2 = makeDetalle({ precio: 500,  iva: 0  });
      const totales = service.build(32, makeInput({
        facturaOverrides: { detalles: [d1, d2], subtotal: 1500, iva: 180, total: 1680 },
      })).ECF.Encabezado.Totales;
      expect(totales.MontoGravadoI1).toBe(1000);
      expect(totales.MontoExento).toBe(500);
      expect(totales.TotalITBIS1).toBeCloseTo(180, 2);
      expect(totales.MontoTotal).toBeCloseTo(1680, 2);
    });

    it('múltiples ítems → NumeroLinea consecutivo', () => {
      const detalles = [
        makeDetalle({ precio: 100, desc: 'A' }),
        makeDetalle({ precio: 200, desc: 'B' }),
        makeDetalle({ precio: 300, desc: 'C' }),
      ];
      const items = service.build(32, makeInput({ facturaOverrides: { detalles } })).ECF.DetallesItems.Item;
      expect(items.map(i => i.NumeroLinea)).toEqual([1, 2, 3]);
    });
  });

  // ── Redondeo ──────────────────────────────────────────────────────────────

  it('redondea montos a 2 decimales', () => {
    const item = service.build(32, makeInput({
      facturaOverrides: { detalles: [makeDetalle({ precio: 33.333, iva: 18 })] },
    })).ECF.DetallesItems.Item[0];
    expect(item.PrecioUnitarioItem).toBe(33.33);
  });

  // ── Emisor ────────────────────────────────────────────────────────────────

  it('Emisor contiene RNCEmisor, RazonSocialEmisor y FechaEmision', () => {
    const emisor = service.build(32, makeInput({ tipoEcf: 32 })).ECF.Encabezado.Emisor;
    expect(emisor.RNCEmisor).toBe('132414691');
    expect(emisor.RazonSocialEmisor).toBe('Empresa Demo S.R.L.');
    expect(emisor.FechaEmision).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  describe('Orden de campos del Emisor (XSD DGII)', () => {
    const TIPOS_ECF = [31, 32, 33, 34, 41, 43, 44, 45, 46, 47];

    const inputPorTipo = (tipo: number) => {
      const base = { tipoEcf: tipo, facturaOverrides: { cliente: CLIENTE_CON_RNC } };
      if (tipo === 33) return makeInput({ ...base, infoReferencia: INFO_REF_E33 });
      if (tipo === 34) return makeInput({ ...base, infoReferencia: INFO_REF_E34 });
      if (tipo === 47) return makeInput({ ...base, facturaOverrides: { cliente: { id: 3, nombre: 'Benef', rncReceptor: '12345678', rfc: null } } });
      return makeInput(base);
    };

    it.each(TIPOS_ECF)('E%i: FechaEmision es siempre el último campo del Emisor', (tipo) => {
      const emisor = service.build(tipo, inputPorTipo(tipo)).ECF.Encabezado.Emisor;
      const keys   = Object.keys(emisor as Record<string, unknown>);
      expect(keys[keys.length - 1]).toBe('FechaEmision');
    });

    it('Emisor: orden exacto con config completa', () => {
      const emisor = service.build(32, makeInput({ tipoEcf: 32 })).ECF.Encabezado.Emisor;
      const keys   = Object.keys(emisor as Record<string, unknown>);
      expect(keys).toEqual([
        'RNCEmisor',
        'RazonSocialEmisor',
        'NombreComercial',
        'DireccionEmisor',
        'Municipio',
        'Provincia',
        'FechaEmision',
      ]);
    });

    it('Emisor: orden correcto sin campos opcionales', () => {
      const emisor = service.build(32, makeInput({
        tipoEcf: 32,
        configOverrides: { nombreComercial: undefined, municipio: undefined, provincia: undefined },
      })).ECF.Encabezado.Emisor;
      const keys = Object.keys(emisor as Record<string, unknown>);
      expect(keys).toEqual(['RNCEmisor', 'RazonSocialEmisor', 'DireccionEmisor', 'FechaEmision']);
    });
  });
});
