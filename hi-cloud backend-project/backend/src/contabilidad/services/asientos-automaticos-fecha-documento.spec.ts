/**
 * P3 BLOQUE 3 — el asiento se contabiliza con la FECHA DEL DOCUMENTO
 * ORIGEN, nunca con new Date() del servidor (que corre en UTC — una venta
 * de las 8pm en RD se asentaba con fecha del día siguiente, corriendo las
 * ventas de fin de mes al mes siguiente en los reportes fiscales).
 *
 * fecha es ahora un parámetro requerido en todos los métodos públicos del
 * servicio, propagado desde cada caller con la fecha de SU documento
 * origen (factura.fecha, compra.fecha, dto.fechaPago, fechaHoyRD() para
 * eventos que genuinamente ocurren "ahora", etc.) — ver los callers reales
 * para el detalle de cada uno.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

function makeService(cuentas: any[]) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(cuentas) };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = { getEmpresaId: () => 7 };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc: svc as AsientosAutomaticosService, asientoRepository };
}

describe('AsientosAutomaticosService — fecha del documento origen (P3 Bloque 3)', () => {
  it('crearAsientoContabilizado() persiste EXACTAMENTE la fecha recibida, no new Date()', async () => {
    const { svc, asientoRepository } = makeService([cuenta('1.1.1.02', 1), cuenta('1.1.2.01', 2)]);

    // Una fecha claramente distinta de "hoy" — si el código usara new Date()
    // por accidente, esta aserción lo detectaría sin ambigüedad.
    const fechaDocumento = '2020-03-15';

    await svc.crearAsientoContabilizado({
      descripcion:     'Asiento de prueba',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    1,
      referenciaFolio: 'TEST-1',
      fecha:           fechaDocumento,
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Debe', debe: 100, haber: 0 },
        { codigo: '1.1.2.01', descripcion: 'Haber', debe: 0, haber: 100 },
      ],
    });

    const asientoGuardado = (asientoRepository.save as jest.Mock).mock.calls[0][0];
    expect(asientoGuardado.fecha).toBe(fechaDocumento);
  });

  it('asientoFacturaEmitida() propaga la fecha de la factura al asiento', async () => {
    const { svc, asientoRepository } = makeService([
      cuenta('1.1.2.01', 1), cuenta('4.1.1.01', 2), cuenta('2.1.2.01', 3),
    ]);

    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', '2019-12-31', 5);

    const asientoGuardado = (asientoRepository.save as jest.Mock).mock.calls[0][0];
    expect(asientoGuardado.fecha).toBe('2019-12-31');
  });

  it('asientoCompraRecibida() propaga la fecha de la compra al asiento', async () => {
    const { svc, asientoRepository } = makeService([
      cuenta('1.1.3.01', 1), cuenta('1.1.4.01', 2), cuenta('2.1.1.01', 3),
    ]);

    await svc.asientoCompraRecibida(50, 236, 200, 36, 'OC-1', '2021-06-01', 5);

    const asientoGuardado = (asientoRepository.save as jest.Mock).mock.calls[0][0];
    expect(asientoGuardado.fecha).toBe('2021-06-01');
  });
});
