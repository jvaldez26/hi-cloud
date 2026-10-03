import { ForbiddenException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

const reportServiceError = jest.fn();
jest.mock('../common/observability/sentry', () => ({
  reportServiceError: (...args: unknown[]) => reportServiceError(...args),
  reportServerError:  jest.fn(),
}));

/**
 * FacturasService.alarmarSiInvarianteSupervisorCreditoViolada — RED DE
 * SEGURIDAD, no el guard real (ese es validarAutorizacionVentaCredito, ver
 * validar-autorizacion-venta-credito.spec.ts, que SIEMPRE corre primero en
 * cambiarEstado() y ya lanza 403 en este mismo caso). Esta alarma solo
 * debería dispararse si, por un bug o un refactor futuro, el guard de
 * verdad se salta — por eso el test la invoca DIRECTO, simulando justo ese
 * escenario ("el guard de arriba no atajó esto").
 */
describe('FacturasService — alarmarSiInvarianteSupervisorCreditoViolada', () => {
  const EMPRESA = 7;

  function makeService(empresaRows: unknown[]) {
    const query = jest.fn().mockResolvedValue(empresaRows);
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    // Object.create(FacturasService.prototype) — no un objeto literal — para
    // que empresaExigeSupervisorParaCredito() siga disponible por la cadena
    // de prototipos, igual que siete-caminos.spec.ts.
    const ctx: any = Object.create(FacturasService.prototype);
    ctx.dataSource = { query };
    ctx.logger = logger;
    const call = (factura: { id: number; empresaId: number; tipoPago: string; supervisorSessionId?: number | null }) =>
      (ctx as any).alarmarSiInvarianteSupervisorCreditoViolada(factura);
    return { call, query, logger };
  }

  beforeEach(() => reportServiceError.mockClear());

  it('invariante violada de verdad (crédito + empresa exige + sin sesión) → reporta a Sentry CON nivel error y tag, y bloquea con 403', async () => {
    const { call } = makeService([{ configuracion: { supervisorModeEnabled: true } }]);
    const factura = { id: 777, empresaId: EMPRESA, tipoPago: 'CREDITO', supervisorSessionId: null };

    await expect(call(factura)).rejects.toThrow(ForbiddenException);

    expect(reportServiceError).toHaveBeenCalledTimes(1);
    const [err, operation, extraTags] = reportServiceError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toMatch(/Invariante violada/);
    expect(operation).toBe('facturas.invariante-supervisor-credito');
    expect(extraTags).toMatchObject({ facturaId: 777, empresaId: EMPRESA });
  });

  it('con supervisorSessionId presente (el caso normal, el guard ya hizo su trabajo) → NO dispara, ni siquiera consulta la empresa', async () => {
    const { call, query } = makeService([]);
    const factura = { id: 777, empresaId: EMPRESA, tipoPago: 'CREDITO', supervisorSessionId: 42 };

    await expect(call(factura)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('venta de CONTADO → nunca dispara, sin importar supervisorSessionId', async () => {
    const { call, query } = makeService([]);
    const factura = { id: 777, empresaId: EMPRESA, tipoPago: 'CONTADO', supervisorSessionId: null };

    await expect(call(factura)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('empresa que NO exige supervisor para crédito → no dispara (no es una invariante violada, es la configuración de la empresa)', async () => {
    const { call } = makeService([{ configuracion: { supervisorModeEnabled: false } }]);
    const factura = { id: 777, empresaId: EMPRESA, tipoPago: 'CREDITO', supervisorSessionId: null };

    await expect(call(factura)).resolves.toBeUndefined();
    expect(reportServiceError).not.toHaveBeenCalled();
  });
});
