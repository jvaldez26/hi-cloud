import { PagosSuscripcionService } from './pagos-suscripcion.service';
import { TenantService } from '../tenant/tenant.service';

/**
 * Pedido explícito: "el panel y la vista del cliente devuelven el mismo
 * número". estado-cuenta-empresa.util.spec.ts ya prueba que la función pura
 * es determinística; esto prueba que getMiResumen() (cliente) y
 * resumenCobros() (panel de Cobros) — dos queries SQL DISTINTAS — terminan
 * llamando la MISMA función con los mismos datos y devuelven el mismo
 * saldoNeto/totalAdeudado para la misma empresa.
 *
 * Fixture: los datos reales de MOTO REPUESTO MANOLIN SRL (auditoría
 * 2026-10-06) — plan Pro RD$5,200, un cargo ECF de RD$4,800 sin pagar,
 * vencida desde el 05/10. Total correcto: RD$10,000.
 */
const EMPRESA = 42;

const SUSCRIPCION_ROW = {
  empresaId: EMPRESA, plan: 'pro', estado: 'activa', modalidad: 'mensual',
  fechaInicio: '2026-08-11', fechaVencimiento: '2026-10-05', fechaFinPrueba: null,
  diaCorte: 5, enPeriodoGracia: true, fechaFinGracia: '2026-10-11',
  motivoSuspension: null, abonoDisponible: '0.00', precioMensual: 5200,
};

const CARGO_PENDIENTE = { id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0, creadoEn: '2026-10-06T13:36:23.385Z' };

function montarParaGetMiResumen() {
  const query = jest.fn()
    .mockResolvedValueOnce([SUSCRIPCION_ROW])     // estadoCuentaEmpresa(): SELECT suscripciones + plan
    .mockResolvedValueOnce([CARGO_PENDIENTE]);    // obtenerCargosPendientes()
  const ds: any = { query };
  const tenantSvc: any = { getEmpresaId: () => EMPRESA } as Partial<TenantService>;
  const svc = new PagosSuscripcionService(
    {} as any, {} as any, {} as any, ds, {} as any, {} as any, tenantSvc, {} as any,
  );
  return svc;
}

function montarParaResumenCobros() {
  const row = {
    empresaId: EMPRESA, nombre: 'MOTO REPUESTO MANOLIN SRL', email: 'x@test.com',
    plan: 'pro', estadoSuscripcion: 'activa', modalidad: 'mensual', diaCorte: 5,
    fechaInicio: '2026-08-11', venceSuscripcion: '2026-10-05', finPrueba: null,
    enPeriodoGracia: true, finGracia: '2026-10-11', motivoSuspension: null,
    abonoDisponible: 0, precioMensual: 5200,
    cargos: [CARGO_PENDIENTE],
    ultimoPago: '2026-09-11T02:07:35.541Z', pendientesConfirmacion: 0,
  };
  const ds: any = { query: jest.fn().mockResolvedValue([row]) };
  const svc = new PagosSuscripcionService(
    {} as any, {} as any, {} as any, ds, {} as any, {} as any, {} as any, {} as any,
  );
  return svc;
}

describe('getMiResumen() y resumenCobros() — mismo número para la misma empresa', () => {
  // saldoSuscripcion depende de "hoy" (períodos vencidos desde el
  // vencimiento) — ninguno de los dos métodos de producción acepta un `hoy`
  // de prueba (correcto: en producción siempre es el real), así que este
  // test compara los DOS caminos ENTRE SÍ en vez de fijar un número exacto.
  // Fijarlo habría hecho que el test se rompiera solo el día en que
  // cambiara cuántos períodos lleva vencida esta fecha fija — no por un bug.
  it('ambos devuelven exactamente el mismo saldoCargos, saldoSuscripcion, totalAdeudado y saldoNeto', async () => {
    const miResumen = await montarParaGetMiResumen().getMiResumen();
    const [filaCobros] = await montarParaResumenCobros().resumenCobros();

    // Cargo-based: no depende de "hoy", siempre el mismo valor — RD$4,800 sin pagar.
    expect(miResumen.saldoCargos).toBe(4800);
    expect(filaCobros.saldoCargos).toBe(4800);

    // El resto sí depende de "hoy" (vencida desde el 05/10) — lo que importa
    // es que las DOS pantallas, llamadas con los MISMOS datos, concuerden.
    expect(miResumen.saldoSuscripcion).toBe(filaCobros.saldoSuscripcion);
    expect(miResumen.totalAdeudado).toBe(filaCobros.totalAdeudado);
    expect(miResumen.saldoNeto).toBe(filaCobros.saldoNeto);
    expect(miResumen.totalAdeudado).toBe(miResumen.saldoCargos + miResumen.saldoSuscripcion);
    // Vencida desde el 05/10: al menos un período adeudado, siempre > 0 sin importar el día de hoy.
    expect(miResumen.saldoSuscripcion).toBeGreaterThan(0);
  });

  it('ambos muestran el mismo vencimiento, como texto plano YYYY-MM-DD (nunca un Date serializado con Z)', async () => {
    const miResumen = await montarParaGetMiResumen().getMiResumen();
    const [filaCobros] = await montarParaResumenCobros().resumenCobros();

    expect(miResumen.fechaVencimiento).toBe('2026-10-05');
    expect(filaCobros.fechaVencimiento).toBe('2026-10-05');
    expect(typeof miResumen.fechaVencimiento).toBe('string');
  });
});
