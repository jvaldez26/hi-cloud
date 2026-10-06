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
 * Desde el rediseño de Modo Supervisor (políticas por clave en
 * supervisor_politicas, ver 1770700000000-SupervisorPoliticas), la fuente
 * de "requerido"/"modo" ya no es empresa.configuracion sino la tabla
 * supervisor_politicas, clave 'venta_credito' — pero el enforcement en sí
 * (sesión de 8h, o token de un solo uso en modo 'cada_vez') sigue siendo el
 * mismo flujo auditado.
 *
 * Método privado probado vía `.call({...})`, mismo patrón que
 * supervisor-session-id.spec.ts / costo-venta-validacion.spec.ts: no hace
 * falta instanciar FacturasService completo (su constructor arrastra media
 * docena de servicios) porque este método solo usa `this.dataSource.query`.
 */
describe('FacturasService — validarAutorizacionVentaCredito', () => {
  const EMPRESA = 7;
  const CAJERO = 10;
  const SESSION_ID = 42;
  const TOKEN = 'abc123tokendeunsolouso';

  function makeService(respuestas: { politica: unknown[]; prueba?: unknown[] }) {
    const query = jest.fn()
      .mockResolvedValueOnce(respuestas.politica)
      .mockResolvedValueOnce(respuestas.prueba ?? []);
    const ctx: any = Object.create(FacturasService.prototype);
    ctx.dataSource = { query };
    const call = (supervisorSessionId: number | null | undefined, supervisorToken?: string | null) =>
      (FacturasService.prototype as any).validarAutorizacionVentaCredito
        .call(ctx, EMPRESA, CAJERO, supervisorSessionId, supervisorToken);
    return { call, query };
  }

  describe('modo sesion', () => {
    const politicaSesion = [{ requerido: true, modo: 'sesion' }];

    it('sin supervisorSessionId → 403', async () => {
      await expect(makeService({ politica: politicaSesion }).call(undefined)).rejects.toThrow(ForbiddenException);
      await expect(makeService({ politica: politicaSesion }).call(null)).rejects.toThrow(ForbiddenException);
    });

    it('con una sesión de OTRO cajero (misma empresa, vigente) → 403', async () => {
      // El query real filtra por "cajeroId" = $3 — una sesión de otro cajero
      // nunca aparece en el resultado, exactamente como una inexistente.
      const { call, query } = makeService({ politica: politicaSesion, prueba: [] });
      await expect(call(SESSION_ID)).rejects.toThrow(ForbiddenException);
      expect(query.mock.calls[1][1]).toEqual([SESSION_ID, EMPRESA, CAJERO]);
    });

    it('con sesión vencida (más de 8h) → 403', async () => {
      const { call } = makeService({ politica: politicaSesion, prueba: [] });
      await expect(call(SESSION_ID)).rejects.toThrow(ForbiddenException);
    });

    it('con sesión válida (del mismo cajero, vigente) → OK, no lanza', async () => {
      const { call } = makeService({ politica: politicaSesion, prueba: [{ id: SESSION_ID }] });
      await expect(call(SESSION_ID)).resolves.toBeUndefined();
    });
  });

  describe('modo cada_vez', () => {
    const politicaCadaVez = [{ requerido: true, modo: 'cada_vez' }];

    it('sin token → 403, nunca mira supervisorSessionId', async () => {
      await expect(makeService({ politica: politicaCadaVez }).call(SESSION_ID, undefined))
        .rejects.toThrow(ForbiddenException);
    });

    it('token que no consume ninguna fila (vencido, usado, de otro cajero/clave) → 403', async () => {
      const { call, query } = makeService({ politica: politicaCadaVez, prueba: [] });
      await expect(call(undefined, TOKEN)).rejects.toThrow(ForbiddenException);
      expect(query.mock.calls[1][1]).toEqual([TOKEN, EMPRESA, CAJERO]);
    });

    it('token válido (consumido) → OK, no lanza', async () => {
      const { call } = makeService({ politica: politicaCadaVez, prueba: [{ id: 1 }] });
      await expect(call(undefined, TOKEN)).resolves.toBeUndefined();
    });
  });

  it('política desmarcada (requerido=false) → no exige nada, ni siquiera consulta sesión/token', async () => {
    const { call, query } = makeService({ politica: [{ requerido: false, modo: 'cada_vez' }] });
    await expect(call(undefined)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1); // solo el SELECT de la política
  });

  it('empresa sin fila en supervisor_politicas (nunca migrada) → default del catálogo (no requerido)', async () => {
    const { call, query } = makeService({ politica: [] });
    await expect(call(undefined)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
