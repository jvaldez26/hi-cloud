import { ForbiddenException } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';

jest.mock('../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportServerError:  jest.fn(),
}));

/**
 * cambiarEstado() — el guard de autorización de supervisor para venta a
 * crédito, en la ÚNICA puerta BORRADOR → EMITIDA (ver siete-caminos.spec.ts
 * para el inventario completo de caminos que terminan aquí, y
 * validar-autorizacion-venta-credito.spec.ts para el método en sí mismo
 * aislado). Este archivo prueba la integración: que cambiarEstado() de
 * verdad llama al guard, con los datos correctos, y solo cuando corresponde.
 *
 * Mismo patrón que siete-caminos.spec.ts: cambiarEstado hace mucho más
 * después de la autorización (vendedor, fecha, e-CF, asientos...) — se corta
 * en el primer paso posterior (el límite de ingresos) para que el test
 * afirme una sola cosa.
 */
const EMPRESA      = 61;
const CAJERO        = 94;
const OTRO_CAJERO   = 11;
const SESSION_ID    = 42;

const ALTO = Symbol('alto-tras-autorizacion');

function buildService(opts: {
  tipoPago: string;
  supervisorSessionId?: number | null;
  supervisorToken?: string | null;
  queryResponses: unknown[][];
}) {
  const facturaRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
  const svc: any = Object.create(FacturasService.prototype);
  svc.logger             = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  svc.facturaRepository  = facturaRepository;
  svc.tenantService       = { getUserId: () => CAJERO, getEmpresaId: () => EMPRESA };
  svc.vendedorResolver    = { resolverVendedor: jest.fn().mockResolvedValue({ vendedorId: 1, nombreVendedor: 'V' }) };
  svc.cajaService         = { esCajaAbiertaVendedor: jest.fn().mockResolvedValue({ ok: true }) };
  svc.limitesService      = { verificarLimiteIngresos: jest.fn().mockRejectedValue(ALTO) };

  let i = 0;
  const query = jest.fn(() => Promise.resolve(opts.queryResponses[i++] ?? []));
  svc.dataSource = { query };

  svc.findOne = jest.fn().mockResolvedValue({
    id: 777, empresaId: EMPRESA, estado: FacturaEstado.BORRADOR,
    fecha: new Date(), folio: 'FAC-777', total: 1000,
    tipoPago: opts.tipoPago, usuarioId: CAJERO,
    supervisorSessionId: opts.supervisorSessionId ?? null,
    supervisorToken: opts.supervisorToken ?? null,
    vendedorId: 1, nombreVendedor: 'V',
  });

  return { svc, query };
}

const POLITICA_SESION_EXIGE    = [{ requerido: true,  modo: 'sesion' }];
const POLITICA_CADA_VEZ_EXIGE  = [{ requerido: true,  modo: 'cada_vez' }];
const POLITICA_NO_EXIGE        = [{ requerido: false, modo: 'cada_vez' }];

describe('cambiarEstado() — guard de autorización de supervisor para crédito', () => {
  it('factura a CRÉDITO sin supervisorSessionId (política en modo sesión) → 403, no llega a crearse', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorSessionId: null,
      queryResponses: [POLITICA_SESION_EXIGE],
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toThrow(ForbiddenException);
  });

  it('factura a CRÉDITO con sesión de OTRO cajero (la factura es de CAJERO, la sesión es de OTRO_CAJERO) → 403', async () => {
    // El propio SQL filtra "cajeroId" = $3 con el cajero DUEÑO de la factura
    // (factura.usuarioId) — una sesión de otro cajero nunca aparece.
    const { svc, query } = buildService({
      tipoPago: 'CREDITO',
      supervisorSessionId: SESSION_ID,
      queryResponses: [POLITICA_SESION_EXIGE, []], // la sesión no aparece: es de otro cajero
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toThrow(ForbiddenException);
    expect(query.mock.calls[1][1]).toEqual([SESSION_ID, EMPRESA, CAJERO]);
  });

  it('factura a CRÉDITO con sesión vencida (más de 8h) → 403', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorSessionId: SESSION_ID,
      queryResponses: [POLITICA_SESION_EXIGE, []], // vencida: tampoco aparece en el resultado
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toThrow(ForbiddenException);
  });

  it('factura a CRÉDITO con sesión válida → pasa la autorización (sigue hasta el siguiente guard real)', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorSessionId: SESSION_ID,
      queryResponses: [POLITICA_SESION_EXIGE, [{ id: SESSION_ID }]],
    });
    // Pasó el guard de supervisor: ahora sí llega al límite de ingresos (ALTO) — si
    // el 403 fuera a disparar, el test fallaría con ForbiddenException, no con ALTO.
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);
  });

  it('política en modo cada_vez, sin token → 403', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorToken: null,
      queryResponses: [POLITICA_CADA_VEZ_EXIGE],
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toThrow(ForbiddenException);
  });

  it('política en modo cada_vez, con token válido (consumido) → pasa la autorización', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorToken: 'abc123',
      queryResponses: [POLITICA_CADA_VEZ_EXIGE, [{ id: 1 }]],
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);
  });

  it('venta de CONTADO → no exige nada, ni siquiera consulta la política', async () => {
    const { svc, query } = buildService({
      tipoPago: 'CONTADO',
      supervisorSessionId: null,
      queryResponses: [],
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);
    expect(query).not.toHaveBeenCalled();
  });

  it('empresa con la política desmarcada → la venta a crédito pasa igual (comportamiento previo intacto)', async () => {
    const { svc } = buildService({
      tipoPago: 'CREDITO',
      supervisorSessionId: null,
      queryResponses: [POLITICA_NO_EXIGE],
    });
    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toBe(ALTO);
  });
});
