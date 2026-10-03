import { ForbiddenException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

/**
 * FacturasService.validarAutorizacionVentaCredito — la defensa REAL contra
 * una venta a crédito sin autorización de supervisor (hotfix de seguridad,
 * reporte de Bellamar González — VENTAS DIVERSAS ELIDO). Llamada desde
 * cambiarEstado() en la transición BORRADOR → EMITIDA, la ÚNICA puerta que
 * hace borrador → emitida para los siete caminos que crean facturas (ver
 * supervisor-session-id.spec.ts para el método hermano
 * resolverSupervisorSessionId, que valida pero nunca EXIGE).
 *
 * Método privado probado vía `.call({...})`, mismo patrón que
 * supervisor-session-id.spec.ts / costo-venta-validacion.spec.ts: no hace
 * falta instanciar FacturasService completo (su constructor arrastra media
 * docena de servicios) porque este método solo usa `this.dataSource.query`.
 */
describe('FacturasService — validarAutorizacionVentaCredito', () => {
  const EMPRESA = 7;
  const CAJERO = 10;
  const OTRO_CAJERO = 11;
  const SESSION_ID = 42;

  const configuracion = (overrides: Record<string, unknown> = {}) => ({
    supervisorModeEnabled: true,
    ...overrides,
  });

  function makeService(respuestas: { empresa: unknown[]; sesion?: unknown[] }) {
    const query = jest.fn()
      .mockResolvedValueOnce(respuestas.empresa)
      .mockResolvedValueOnce(respuestas.sesion ?? []);
    const ctx = { dataSource: { query } };
    const call = (supervisorSessionId: number | null | undefined) =>
      (FacturasService.prototype as any).validarAutorizacionVentaCredito
        .call(ctx, EMPRESA, CAJERO, supervisorSessionId);
    return { call, query };
  }

  it('sin supervisorSessionId → 403 (venta a crédito sin autorización)', async () => {
    await expect(makeService({ empresa: [{ configuracion: configuracion() }] }).call(undefined))
      .rejects.toThrow(ForbiddenException);
    await expect(makeService({ empresa: [{ configuracion: configuracion() }] }).call(null))
      .rejects.toThrow(ForbiddenException);
  });

  it('con una sesión de OTRO cajero (misma empresa, vigente) → 403', async () => {
    // El query real filtra por "cajeroId" = $3 — una sesión de otro cajero
    // nunca aparece en el resultado, exactamente como una inexistente.
    const { call, query } = makeService({ empresa: [{ configuracion: configuracion() }], sesion: [] });
    await expect(call(SESSION_ID)).rejects.toThrow(ForbiddenException);
    expect(query.mock.calls[1][1]).toEqual([SESSION_ID, EMPRESA, CAJERO]);
  });

  it('con sesión vencida (más de 8h) → 403', async () => {
    // La ventana de 8h vive en el SQL (NOW() - INTERVAL '8 hours'); una
    // sesión vencida simplemente no aparece en el resultado.
    const { call } = makeService({ empresa: [{ configuracion: configuracion() }], sesion: [] });
    await expect(call(SESSION_ID)).rejects.toThrow(ForbiddenException);
  });

  it('con sesión válida (del mismo cajero, vigente) → OK, no lanza', async () => {
    const { call } = makeService({
      empresa: [{ configuracion: configuracion() }],
      sesion: [{ id: SESSION_ID }],
    });
    await expect(call(SESSION_ID)).resolves.toBeUndefined();
  });

  it('empresa con modo supervisor DESACTIVADO → no exige nada, ni siquiera consulta la sesión', async () => {
    const { call, query } = makeService({
      empresa: [{ configuracion: configuracion({ supervisorModeEnabled: false }) }],
    });
    await expect(call(undefined)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1); // solo el SELECT de configuracion, nunca el de la sesión
  });

  it('empresa con posSupervisorVentaCredito=false (toggle específico apagado) → no exige nada', async () => {
    const { call } = makeService({
      empresa: [{ configuracion: configuracion({ posSupervisorVentaCredito: false }) }],
    });
    await expect(call(undefined)).resolves.toBeUndefined();
  });

  it('acepta el formato legado configuracion.pos.* (compatibilidad con updatePosConfig)', async () => {
    const { call } = makeService({
      empresa: [{ configuracion: { pos: { supervisorModeEnabled: true } } }],
    });
    await expect(call(undefined)).rejects.toThrow(ForbiddenException);
  });
});
