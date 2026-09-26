/**
 * SupervisorGateGuard — cierra el hueco real: Productos, Movimientos de
 * Stock, Notas de Crédito, Recibos de Cobro, Gastos, anular Facturas,
 * cambiar sucursal y Reportes/BI/KPI ya estaban protegidos por modo
 * supervisor DENTRO del POS, pero un vendedor podía ejecutar la misma
 * acción sin ninguna autorización si entraba por la página normal o por la
 * API directa. Este guard exige la MISMA sesión de supervisor activa (ver
 * pos_supervisor_log) sin importar desde qué pantalla llegue la petición.
 *
 * Se prueba directamente vía `canActivate()` con un ExecutionContext falso
 * — mismo criterio que el resto de specs de auth/: nada de
 * Test.createTestingModule para una guardia de pocas líneas.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SupervisorGateGuard } from './supervisor-gate.guard';

function makeContext(user: any, body: any = {}) {
  const req = { user, body };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(rows: any[][]) {
  // Cada llamada a query() consume la siguiente entrada de `rows` — permite
  // simular "no hay sesión activa" (array vacío) o "sí hay" (una fila).
  let i = 0;
  const query = jest.fn(async () => rows[i++] ?? []);
  const GuardClass = SupervisorGateGuard();
  const guard = new (GuardClass as any)({ query });
  return { guard, query };
}

const VENDEDOR = { id: 1, role: 'vendedor', empresaId: 7 };
const ADMIN    = { id: 2, role: 'admin',    empresaId: 7 };
const CONTADOR = { id: 3, role: 'contador', empresaId: 7 };

describe('SupervisorGateGuard — roles que pasan siempre', () => {
  it('ADMIN pasa sin consultar nada', async () => {
    const { guard, query } = makeGuard([]);
    await expect(guard.canActivate(makeContext(ADMIN))).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('CONTADOR pasa sin consultar nada', async () => {
    const { guard, query } = makeGuard([]);
    await expect(guard.canActivate(makeContext(CONTADOR))).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('SupervisorGateGuard — VENDEDOR', () => {
  it('sin sesión de supervisor activa: 403', async () => {
    const { guard } = makeGuard([[]]); // la query no devuelve fila
    await expect(guard.canActivate(makeContext(VENDEDOR))).rejects.toThrow(ForbiddenException);
  });

  it('con sesión de supervisor activa: pasa (esto ya funciona hoy dentro del POS, sin cambios)', async () => {
    const { guard, query } = makeGuard([[{ id: 42 }]]);
    await expect(guard.canActivate(makeContext(VENDEDOR))).resolves.toBe(true);
    expect(query.mock.calls[0][1]).toEqual([VENDEDOR.id, VENDEDOR.empresaId]);
  });

  it('sin empresaId en el token: 403 (nunca consulta con empresaId undefined)', async () => {
    const { guard, query } = makeGuard([]);
    await expect(
      guard.canActivate(makeContext({ id: 1, role: 'vendedor', empresaId: null })),
    ).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('SupervisorGateGuard — soloSi (ej. facturas: solo gatear la transición a anulada)', () => {
  it('vendedor SIN sesión activa, pero soloSi() da false (ej. estado=emitida): pasa igual', async () => {
    const { guard, query } = makeGuard([]);
    const g = SupervisorGateGuard({ soloSi: (body) => body?.estado === 'cancelada' });
    const instancia = new (g as any)({ query });
    await expect(
      instancia.canActivate(makeContext(VENDEDOR, { estado: 'emitida' })),
    ).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('vendedor SIN sesión activa y soloSi() da true (estado=cancelada): 403', async () => {
    const { query } = makeGuard([]);
    const g = SupervisorGateGuard({ soloSi: (body) => body?.estado === 'cancelada' });
    const instancia = new (g as any)({ query: jest.fn().mockResolvedValue([]) });
    await expect(
      instancia.canActivate(makeContext(VENDEDOR, { estado: 'cancelada' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('vendedor CON sesión activa y soloSi() da true: pasa', async () => {
    const g = SupervisorGateGuard({ soloSi: (body) => body?.estado === 'cancelada' });
    const instancia = new (g as any)({ query: jest.fn().mockResolvedValue([{ id: 1 }]) });
    await expect(
      instancia.canActivate(makeContext(VENDEDOR, { estado: 'cancelada' })),
    ).resolves.toBe(true);
  });
});
