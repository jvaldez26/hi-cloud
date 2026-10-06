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
 * Caso real FAC-1623 (2026-10-06): la factura quedó en BORRADOR porque (a)
 * el 403 de este método no llevaba supervisorClaveRequerida/supervisorModo
 * — el interceptor genérico del frontend nunca abría el modal — y (b) la
 * única fuente de autorización era la capturada AL CREAR el borrador, sin
 * ningún camino para reautorizar en vivo si esa sesión ya había vencido o
 * nunca se capturó. Este archivo cubre ambos arreglos: el 403 ahora lleva
 * los campos, y hay un fallback "en vivo" (sesión activa ahora / token
 * fresco de esta misma petición) antes de rechazar.
 *
 * Método privado probado vía `.call({...})`, mismo patrón que
 * supervisor-session-id.spec.ts / costo-venta-validacion.spec.ts: no hace
 * falta instanciar FacturasService completo (su constructor arrastra media
 * docena de servicios) porque este método solo usa `this.dataSource.query`.
 */
describe('FacturasService — validarAutorizacionVentaCredito', () => {
  const EMPRESA = 7;
  const CAJERO_CREADOR = 10; // quien creó el borrador (factura.usuarioId)
  const CAJERO_EMISOR  = 10; // quien está pulsando "Emitir" AHORA (puede ser el mismo u otro)
  const SESSION_ID = 42;
  const TOKEN = 'abc123tokendeunsolouso';
  const TOKEN_FRESCO = 'tokenfrescodelreintento';

  function makeService(respuestas: unknown[][]) {
    const query = jest.fn();
    for (const r of respuestas) query.mockResolvedValueOnce(r);
    const ctx: any = Object.create(FacturasService.prototype);
    ctx.dataSource = { query };

    const call = (opts: {
      factura?: { id: number; supervisorSessionId?: number | null; supervisorToken?: string | null };
      cajeroEmisorId?: number;
      supervisorSessionId?: number | null;
      supervisorToken?: string | null;
      supervisorTokenFresco?: string | null;
    } = {}) => {
      const factura = opts.factura ?? { id: 1, supervisorSessionId: opts.supervisorSessionId, supervisorToken: opts.supervisorToken };
      return (FacturasService.prototype as any).validarAutorizacionVentaCredito.call(
        ctx,
        factura,
        EMPRESA,
        CAJERO_CREADOR,
        opts.cajeroEmisorId ?? CAJERO_EMISOR,
        opts.supervisorSessionId,
        opts.supervisorToken,
        opts.supervisorTokenFresco,
      ).then((r: unknown) => ({ resultado: r, factura }));
    };
    return { call, query };
  }

  async function esperar403ConCodigo(p: Promise<unknown>, modoEsperado: 'sesion' | 'cada_vez') {
    await expect(p).rejects.toThrow(ForbiddenException);
    try { await p; } catch (e: any) {
      expect(e.getResponse()).toMatchObject({
        supervisorClaveRequerida: 'venta_credito',
        supervisorModo: modoEsperado,
      });
    }
  }

  describe('modo sesion', () => {
    const politicaSesion = [{ requerido: true, modo: 'sesion' }];

    it('sin supervisorSessionId y sin sesión en vivo → 403 con supervisorClaveRequerida/supervisorModo', async () => {
      const { call, query } = makeService([politicaSesion, []]); // [politica, sesionEnVivo]
      await esperar403ConCodigo(call({}), 'sesion');
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('sesión estática de OTRO cajero (no matchea) y sin sesión en vivo → 403', async () => {
      const { call, query } = makeService([politicaSesion, [], []]); // [politica, estática(vacía), enVivo(vacía)]
      await esperar403ConCodigo(call({ supervisorSessionId: SESSION_ID }), 'sesion');
      expect(query.mock.calls[1][1]).toEqual([SESSION_ID, EMPRESA, CAJERO_CREADOR]);
    });

    it('sesión estática válida (del mismo cajero que creó, vigente) → OK directo, nunca consulta la sesión en vivo', async () => {
      const { call, query } = makeService([politicaSesion, [{ id: SESSION_ID }]]);
      await expect(call({ supervisorSessionId: SESSION_ID }).then(r => r.resultado)).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(2); // política + estática — jamás la de "en vivo"
    });

    it('sesión estática vencida/ausente, pero HAY sesión activa AHORA para quien emite → OK (fallback en vivo), y deja evidencia en la factura', async () => {
      const ID_EN_VIVO = 99;
      const { call, query } = makeService([politicaSesion, [], [{ id: ID_EN_VIVO }], []]); // [política, estática(vacía), enVivo(encontrada), UPDATE]
      const { resultado, factura } = await call({ supervisorSessionId: SESSION_ID });
      expect(resultado).toBeUndefined();
      expect(factura.supervisorSessionId).toBe(ID_EN_VIVO);
      expect(query).toHaveBeenCalledTimes(4);
      expect(query.mock.calls[3][0]).toContain('UPDATE facturas');
      expect(query.mock.calls[3][1]).toEqual([ID_EN_VIVO, factura.id]);
    });
  });

  describe('modo cada_vez', () => {
    const politicaCadaVez = [{ requerido: true, modo: 'cada_vez' }];

    it('sin token estático ni fresco → 403, no intenta consumir nada', async () => {
      const { call, query } = makeService([politicaCadaVez]);
      await esperar403ConCodigo(call({}), 'cada_vez');
      expect(query).toHaveBeenCalledTimes(1); // solo la política — ni un intento de consumo
    });

    it('token estático inválido (vencido/usado/de otra clave) y sin fresco → 403', async () => {
      const { call, query } = makeService([politicaCadaVez, []]);
      await esperar403ConCodigo(call({ supervisorToken: TOKEN }), 'cada_vez');
      expect(query.mock.calls[1][1]).toEqual([TOKEN, EMPRESA, CAJERO_EMISOR]);
    });

    it('token estático válido → OK directo, nunca intenta el fresco ni toca la factura', async () => {
      const { call, query } = makeService([politicaCadaVez, [{ id: 1 }]]);
      const { resultado, factura } = await call({ supervisorToken: TOKEN });
      expect(resultado).toBeUndefined();
      expect(query).toHaveBeenCalledTimes(2);
      expect(factura.supervisorToken).toBe(TOKEN); // sin cambios — era el valor ya guardado
    });

    it('token estático inválido, pero el FRESCO de esta petición (tras reautorizar) consume → OK, y persiste el fresco en la factura', async () => {
      const { call, query } = makeService([politicaCadaVez, [], [{ id: 1 }], []]); // [política, estático(vacío), fresco(consumido), UPDATE]
      const { resultado, factura } = await call({ supervisorToken: TOKEN, supervisorTokenFresco: TOKEN_FRESCO });
      expect(resultado).toBeUndefined();
      expect(factura.supervisorToken).toBe(TOKEN_FRESCO);
      expect(query).toHaveBeenCalledTimes(4);
      expect(query.mock.calls[2][1]).toEqual([TOKEN_FRESCO, EMPRESA, CAJERO_EMISOR]);
    });

    it('sin token estático pero con un FRESCO válido → OK, persiste', async () => {
      const { call, query } = makeService([politicaCadaVez, [{ id: 1 }], []]); // [política, fresco(consumido), UPDATE]
      const { resultado, factura } = await call({ supervisorTokenFresco: TOKEN_FRESCO });
      expect(resultado).toBeUndefined();
      expect(factura.supervisorToken).toBe(TOKEN_FRESCO);
      expect(query).toHaveBeenCalledTimes(3);
    });
  });

  it('política desmarcada (requerido=false) → no exige nada, ni siquiera consulta sesión/token', async () => {
    const { call, query } = makeService([[{ requerido: false, modo: 'cada_vez' }]]);
    await expect(call({}).then(r => r.resultado)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1); // solo el SELECT de la política
  });

  it('empresa sin fila en supervisor_politicas (nunca migrada) → default del catálogo (no requerido)', async () => {
    const { call, query } = makeService([[]]);
    await expect(call({}).then(r => r.resultado)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
