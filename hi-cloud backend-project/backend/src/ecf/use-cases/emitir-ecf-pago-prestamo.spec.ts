import { EmitirECFUseCase } from './emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../entities/ecf.entity';

/**
 * Prestamista Etapa 5, Parte C — ver
 * docs/prestamista/etapa-5-contabilidad-caja-fiscal.md. `cargarDocumentoOrigen()`
 * para PAGO_PRESTAMO: el interés SIEMPRE genera su línea (circuito
 * preexistente, etapa-2-resto.md §1); mora/cargos son nuevos y solo entran
 * si `pr_productos_prestamo.motorConfig.fiscal[concepto].generaComprobante`
 * es `true` — con la sección "Fiscal" vacía (hoy, en todos los productos),
 * el resultado es idéntico al de antes de esta etapa.
 *
 * Método privado — se invoca vía cast, mismo criterio que el resto del
 * use case (sin repos reales, un `ds.query` mínimo).
 */
function buildUseCase(filaPago: any) {
  const repoVacio = {} as any;
  const uc = new EmitirECFUseCase(
    repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio,
    repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio, repoVacio,
    { query: jest.fn().mockResolvedValue([filaPago]) } as any,
  );
  return uc;
}

const PAGO_BASE = {
  createdat: new Date('2026-10-11'),
  deudor_nombre: 'Juan Pérez', deudor_rnc: null, deudor_cedula: '00112223334', deudor_direccion: 'Calle 1',
  prestamo_numero: 'PRE-0010',
  aplicadoInteres: 100, aplicadoMora: 50, aplicadoCargos: 25,
};

describe('EmitirECFUseCase.cargarDocumentoOrigen — PAGO_PRESTAMO (Etapa 5, Parte C)', () => {
  it('sin motorConfig.fiscal (producto sin la sección configurada): solo la línea de interés, exenta — idéntico a antes de esta etapa', async () => {
    const uc = buildUseCase({ ...PAGO_BASE, prestamo_motor_config: null });
    const factura: any = await (uc as any).cargarDocumentoOrigen(DocumentoOrigenTipo.PAGO_PRESTAMO, 1, 1);

    expect(factura.detalles).toHaveLength(1);
    expect(factura.detalles[0]).toMatchObject({ descripcion: 'Interés préstamo PRE-0010', porcentajeIva: 0, subtotal: 100 });
    expect(factura.iva).toBe(0);
    expect(factura.subtotal).toBe(100);
    expect(factura.total).toBe(100);
  });

  it('con fiscal.mora.generaComprobante=true: agrega la línea de mora con su tratamiento ITBIS', async () => {
    const uc = buildUseCase({
      ...PAGO_BASE,
      prestamo_motor_config: { fiscal: { mora: { generaComprobante: true, tratamientoItbis: 18 } } },
    });
    const factura: any = await (uc as any).cargarDocumentoOrigen(DocumentoOrigenTipo.PAGO_PRESTAMO, 1, 1);

    expect(factura.detalles).toHaveLength(2);
    const mora = factura.detalles.find((d: any) => d.descripcion.includes('Mora'));
    expect(mora).toMatchObject({ porcentajeIva: 18, subtotal: 50, importeIva: 9 });
    expect(factura.subtotal).toBe(150); // 100 interés + 50 mora
    expect(factura.iva).toBe(9);
    expect(factura.total).toBe(159);
  });

  it('con fiscal.gastos.generaComprobante=true: agrega la línea de cargos', async () => {
    const uc = buildUseCase({
      ...PAGO_BASE,
      prestamo_motor_config: { fiscal: { gastos: { generaComprobante: true, tratamientoItbis: 'exento' } } },
    });
    const factura: any = await (uc as any).cargarDocumentoOrigen(DocumentoOrigenTipo.PAGO_PRESTAMO, 1, 1);

    const cargos = factura.detalles.find((d: any) => d.descripcion.includes('Cargos'));
    expect(cargos).toMatchObject({ porcentajeIva: 0, subtotal: 25, importeIva: 0 });
    expect(factura.subtotal).toBe(125);
  });

  it('fiscal.mora existe pero generaComprobante no es true (false/null/ausente): no agrega la línea', async () => {
    const uc = buildUseCase({
      ...PAGO_BASE,
      prestamo_motor_config: { fiscal: { mora: { generaComprobante: null, tratamientoItbis: null } } },
    });
    const factura: any = await (uc as any).cargarDocumentoOrigen(DocumentoOrigenTipo.PAGO_PRESTAMO, 1, 1);

    expect(factura.detalles).toHaveLength(1);
  });

  it('mora configurada pero aplicadoMora=0 en este pago: no agrega una línea vacía', async () => {
    const uc = buildUseCase({
      ...PAGO_BASE, aplicadoMora: 0,
      prestamo_motor_config: { fiscal: { mora: { generaComprobante: true, tratamientoItbis: 18 } } },
    });
    const factura: any = await (uc as any).cargarDocumentoOrigen(DocumentoOrigenTipo.PAGO_PRESTAMO, 1, 1);

    expect(factura.detalles).toHaveLength(1);
  });
});
