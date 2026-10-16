/**
 * asientoCobro() / asientoPago() con metodoPago='efectivo' deben debitar/
 * acreditar CAJA, no BANCOS. Antes `metodoPago` ni siquiera se recibía —
 * sin `cuentaContrapartida` explícito, SIEMPRE caía en COD.BANCOS sin
 * importar el método. Caso real (2026-10-15, empresa 53): CxC #246 pagada
 * en EFECTIVO (RDP-00064) generó un asiento contra Bancos — el dinero nunca
 * entró a un banco, entró (o debió entrar) a la caja del cajero.
 */
import { AsientosAutomaticosService, COD } from './asientos-automaticos.service';

const ID_CAJA = 1, ID_BANCOS = 2, ID_CLIENTES = 3, ID_PROVEEDORES = 4, ID_MANUAL = 5;

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

const CUENTAS_COBRO = [
  cuenta(COD.CAJA, ID_CAJA), cuenta(COD.BANCOS, ID_BANCOS), cuenta(COD.CLIENTES, ID_CLIENTES), cuenta('9.9.9.01', ID_MANUAL),
];
const CUENTAS_PAGO = [
  cuenta(COD.CAJA, ID_CAJA), cuenta(COD.BANCOS, ID_BANCOS), cuenta(COD.PROVEEDORES, ID_PROVEEDORES),
];

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
  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = { getEmpresaId: () => 53 };
  svc.dataSource        = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const cuentasContables = (): number[] => {
    const lineas = lineaRepository.create.mock.calls[0]?.[0] ?? [];
    return (lineas as any[]).map(l => l.cuentaContableId);
  };
  return { svc, cuentasContables };
}

describe('AsientosAutomaticosService.asientoCobro — metodoPago decide Caja vs Bancos', () => {
  it("metodoPago='efectivo': la línea de contrapartida usa CAJA, no BANCOS", async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_COBRO);
    await svc.asientoCobro(24000, 64, 246, '2026-10-16', 78, undefined, false, 'efectivo');

    const ids = cuentasContables();
    expect(ids).toContain(ID_CAJA);
    expect(ids).not.toContain(ID_BANCOS);
  });

  it("metodoPago='transferencia': sigue usando BANCOS", async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_COBRO);
    await svc.asientoCobro(24000, 65, 247, '2026-10-16', 78, undefined, false, 'transferencia');

    expect(cuentasContables()).toContain(ID_BANCOS);
  });

  it('sin metodoPago (caller legacy): mantiene el comportamiento anterior, BANCOS por defecto', async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_COBRO);
    await svc.asientoCobro(500, 66, 248, '2026-10-16', 78);

    expect(cuentasContables()).toContain(ID_BANCOS);
  });

  it('cuentaContrapartida manual explícita gana sobre metodoPago', async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_COBRO);
    await svc.asientoCobro(500, 67, 249, '2026-10-16', 78, '9.9.9.01', true, 'efectivo');

    const ids = cuentasContables();
    expect(ids).toContain(ID_MANUAL);
    expect(ids).not.toContain(ID_CAJA);
  });
});

describe('AsientosAutomaticosService.asientoPago (CxP) — metodoPago decide Caja vs Bancos', () => {
  it("metodoPago='efectivo': la línea de contrapartida usa CAJA, no BANCOS", async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_PAGO);
    await svc.asientoPago(1000, 70, 300, '2026-10-16', 78, undefined, false, 'efectivo');

    const ids = cuentasContables();
    expect(ids).toContain(ID_CAJA);
    expect(ids).not.toContain(ID_BANCOS);
  });

  it('sin metodoPago: mantiene BANCOS por defecto', async () => {
    const { svc, cuentasContables } = makeService(CUENTAS_PAGO);
    await svc.asientoPago(1000, 71, 301, '2026-10-16', 78);

    expect(cuentasContables()).toContain(ID_BANCOS);
  });
});
