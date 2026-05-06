import { ECFBuilderService, ECFBuildInput } from './ecf-builder.service';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';
import { EcfRncRequeridoError } from '../errors/ecf.errors';

// ── Factories de datos de prueba ──────────────────────────────────────────────

function makeConfig(overrides: Partial<any> = {}): any {
  return {
    empresaId:        1,
    msellerEmail:     'test@empresa.com',
    msellerPasswordEnc: 'enc',
    msellerApiKeyEnc:   'enc',
    msellerUrlBase:   'https://ecf.api.mseller.app',
    modo:             ModoEcf.TEST,
    rncEmisor:        '132414691',
    razonSocialEmisor: 'Empresa Demo S.R.L.',
    nombreComercial:  'Demo',
    direccionEmisor:  'Av. Principal #1, Santo Domingo',
    municipio:        'Santo Domingo',
    provincia:        'Distrito Nacional',
    activo:           true,
    ...overrides,
  };
}

function makeDetalle(opts: { precio?: number; cantidad?: number; iva?: number; desc?: string } = {}): any {
  return {
    id: 1,
    productoId: 1,
    descripcion: opts.desc ?? 'Producto de prueba',
    precioUnitario: opts.precio ?? 100,
    cantidad: opts.cantidad ?? 1,
    porcentajeIva: opts.iva ?? 18,
    subtotal: (opts.precio ?? 100) * (opts.cantidad ?? 1),
    importeIva: (opts.precio ?? 100) * (opts.cantidad ?? 1) * ((opts.iva ?? 18) / 100),
    total: (opts.precio ?? 100) * (opts.cantidad ?? 1) * (1 + (opts.iva ?? 18) / 100),
  };
}

function makeFactura(overrides: Partial<any> = {}): any {
  const detalles = overrides.detalles ?? [makeDetalle()];
  const subtotal = detalles.reduce((s: number, d: any) => s + Number(d.subtotal), 0);
  const iva      = detalles.reduce((s: number, d: any) => s + Number(d.importeIva), 0);
  return {
    id:         1,
    folio:      'FAC-202601-0001',
    fecha:      new Date('2026-01-15'),
    empresaId:  1,
    subtotal,
    iva,
    total:      subtotal + iva,
    tipoNcf:    'E32',
    detalles,
    cliente:    overrides.cliente ?? { id: 1, nombre: 'Consumidor Final', rfc: null, rncReceptor: null, esExtranjero: false },
    ...overrides,
  };
}

function makeInput(opts: { tipoEcf?: number; facturaOverrides?: any; configOverrides?: any } = {}): ECFBuildInput {
  // Usamos mediodía local para evitar que el offset de timezone cambie el día
  const vence = new Date(2027, 11, 31, 12, 0, 0); // mes 11 = diciembre (0-indexed)
  return {
    encf:        `E${String(opts.tipoEcf ?? 32).padStart(2,'0')}0000000001`,
    factura:     makeFactura(opts.facturaOverrides),
    config:      makeConfig(opts.configOverrides),
    fechaVencSec: vence,
  };
}

// ── Suite principal ───────────────────────────────────────────────────────────

describe('ECFBuilderService', () => {
  let service: ECFBuilderService;

  beforeEach(() => {
    service = new ECFBuilderService();
  });

  // ── Tipos soportados ──────────────────────────────────────────────────────

  it('lista los tipos soportados: 31 y 32', () => {
    expect(service.getTiposSoportados()).toEqual([31, 32]);
  });

  it('lanza Error para tipo no soportado (33, 41, etc.)', () => {
    const input = makeInput({ tipoEcf: 33 });
    expect(() => service.build(33, input)).toThrow(/No hay builder registrado/);
  });

  // ── E32 — Factura de Consumo ──────────────────────────────────────────────

  describe('E32 — Factura de Consumo', () => {
    it('monto bajo sin RNC → usa "00000000000" como comprador', () => {
      const input = makeInput({ tipoEcf: 32 });
      const payload = service.build(32, input);
      const comprador = payload.ECF.Encabezado.Comprador;
      expect(comprador.RNCComprador).toBe('00000000000');
      expect(comprador.RazonSocialComprador).toBe('Consumidor Final');
    });

    it('monto bajo con RNC → usa el RNC del cliente', () => {
      const input = makeInput({
        tipoEcf: 32,
        facturaOverrides: { cliente: { id: 2, nombre: 'Empresa XYZ', rncReceptor: '101234567', esExtranjero: false } },
      });
      const payload = service.build(32, input);
      expect(payload.ECF.Encabezado.Comprador.RNCComprador).toBe('101234567');
      expect(payload.ECF.Encabezado.Comprador.RazonSocialComprador).toBe('Empresa XYZ');
    });

    it('monto ≥ 250,000 sin RNC → lanza EcfRncRequeridoError', () => {
      const detalle = makeDetalle({ precio: 250_000 });
      const input = makeInput({
        tipoEcf: 32,
        facturaOverrides: {
          detalles: [detalle],
          total: 295_000,
          cliente: { id: 1, nombre: 'Consumidor', rfc: null, rncReceptor: null, esExtranjero: false },
        },
      });
      expect(() => service.build(32, input)).toThrow(EcfRncRequeridoError);
      expect(() => service.build(32, input)).toThrow(/250,000/);
    });

    it('monto ≥ 250,000 con RNC → construye correctamente', () => {
      const detalle = makeDetalle({ precio: 250_000 });
      const input = makeInput({
        tipoEcf: 32,
        facturaOverrides: {
          detalles: [detalle],
          total: 295_000,
          cliente: { id: 2, nombre: 'Empresa Grande', rncReceptor: '131456789', esExtranjero: false },
        },
      });
      const payload = service.build(32, input);
      expect(payload.ECF.Encabezado.Comprador.RNCComprador).toBe('131456789');
    });

    it('estructura del payload es correcta', () => {
      const input = makeInput({ tipoEcf: 32 });
      const payload = service.build(32, input);
      const { Encabezado, DetallesItems } = payload.ECF;

      expect(Encabezado.Version).toBe('1.0');
      expect(Encabezado.IdDoc.TipoeCF).toBe(32);
      expect(Encabezado.IdDoc.eNCF).toBe('E320000000001');
      expect(Encabezado.Emisor.RNCEmisor).toBe('132414691');
      expect(DetallesItems.Item).toHaveLength(1);
    });

    it('fecha de emisión tiene formato DD-MM-YYYY', () => {
      const input = makeInput({ tipoEcf: 32 });
      const fecha = service.build(32, input).ECF.Encabezado.Emisor.FechaEmision;
      expect(fecha).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    });

    it('fecha de vencimiento de secuencia está en el payload', () => {
      const input = makeInput({ tipoEcf: 32 });
      const vence = service.build(32, input).ECF.Encabezado.IdDoc.FechaVencimientoSecuencia;
      expect(vence).toBe('31-12-2027');
    });
  });

  // ── E31 — Factura de Crédito Fiscal ───────────────────────────────────────

  describe('E31 — Factura de Crédito Fiscal', () => {
    it('sin RNC → lanza EcfRncRequeridoError', () => {
      const input = makeInput({
        tipoEcf: 31,
        facturaOverrides: { cliente: { id: 1, nombre: 'Sin RNC', rfc: null, rncReceptor: null } },
      });
      expect(() => service.build(31, input)).toThrow(EcfRncRequeridoError);
      expect(() => service.build(31, input)).toThrow(/E31|Crédito Fiscal/);
    });

    it('con rncReceptor → construye y asigna el comprador', () => {
      const input = makeInput({
        tipoEcf: 31,
        facturaOverrides: { cliente: { id: 2, nombre: 'Empresa SA', rncReceptor: '101234567', esExtranjero: false } },
      });
      const payload = service.build(31, input);
      expect(payload.ECF.Encabezado.IdDoc.TipoeCF).toBe(31);
      expect(payload.ECF.Encabezado.Comprador.RNCComprador).toBe('101234567');
      expect(payload.ECF.Encabezado.Comprador.RazonSocialComprador).toBe('Empresa SA');
    });

    it('acepta rfc como RNC si rncReceptor no está definido', () => {
      const input = makeInput({
        tipoEcf: 31,
        facturaOverrides: { cliente: { id: 2, nombre: 'Empresa', rfc: '101234567', rncReceptor: null } },
      });
      const payload = service.build(31, input);
      expect(payload.ECF.Encabezado.Comprador.RNCComprador).toBe('101234567');
    });
  });

  // ── Items con ITBIS ───────────────────────────────────────────────────────

  describe('IndicadorFacturacion según porcentaje ITBIS', () => {
    it('18% ITBIS → indicador = 1', () => {
      const input = makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 18 })] } });
      const items = service.build(32, input).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(1);
    });

    it('16% ITBIS → indicador = 2', () => {
      const input = makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 16 })] } });
      const items = service.build(32, input).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(2);
    });

    it('0% ITBIS (exento) → indicador = 4', () => {
      const input = makeInput({ facturaOverrides: { detalles: [makeDetalle({ iva: 0 })] } });
      const items = service.build(32, input).ECF.DetallesItems.Item;
      expect(items[0].IndicadorFacturacion).toBe(4);
    });

    it('mix de items con diferentes tasas → totales correctos', () => {
      const d1 = makeDetalle({ precio: 1000, iva: 18 }); // gravado 18%
      const d2 = makeDetalle({ precio: 500,  iva: 0  }); // exento
      const input = makeInput({
        facturaOverrides: {
          detalles: [d1, d2],
          subtotal: 1500,
          iva: 180,
          total: 1680,
        },
      });
      const totales = service.build(32, input).ECF.Encabezado.Totales;
      expect(totales.MontoGravadoI1).toBe(1000);
      expect(totales.MontoExento).toBe(500);
      expect(totales.TotalITBIS1).toBeCloseTo(180, 2);
      expect(totales.MontoTotal).toBeCloseTo(1680, 2);
    });

    it('múltiples ítems con mismo ITBIS → NumeroLinea consecutivo', () => {
      const detalles = [
        makeDetalle({ precio: 100, desc: 'Item A' }),
        makeDetalle({ precio: 200, desc: 'Item B' }),
        makeDetalle({ precio: 300, desc: 'Item C' }),
      ];
      const input = makeInput({ facturaOverrides: { detalles } });
      const items = service.build(32, input).ECF.DetallesItems.Item;
      expect(items.map(i => i.NumeroLinea)).toEqual([1, 2, 3]);
    });
  });

  // ── Redondeo ──────────────────────────────────────────────────────────────

  it('redondea montos a 2 decimales', () => {
    const input = makeInput({
      facturaOverrides: {
        detalles: [makeDetalle({ precio: 33.333, iva: 18 })],
      },
    });
    const payload = service.build(32, input);
    const item = payload.ECF.DetallesItems.Item[0];
    // 33.333 × 1 = 33.33 redondeado
    expect(item.PrecioUnitarioItem).toBe(33.33);
  });
});
