import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { BackupInternalController } from './backup-internal.controller';
import { BackupService } from './backup.service';

/**
 * EL TEST QUE FALTABA.
 *
 * Estas rutas vivían dentro de SuperAdminController, que lleva
 * `@UseGuards(SuperAdminGuard)` a nivel de CLASE. En Nest los guards de clase
 * corren ANTES del handler, y ese guard exige un JWT (cookie `access_token` o
 * `Authorization: Bearer`). El script de respaldo manda `x-internal-key` y
 * ninguna sesión, así que recibía 401 y la comprobación de INTERNAL_API_KEY
 * —que estaba dentro del handler— nunca se ejecutaba.
 *
 * Los respaldos corrían bien y subían a S3. Lo único roto era el reporte, y por
 * eso el panel llevaba meses diciendo "Último backup: Nunca": todo funcionaba
 * salvo la parte que nos permitía saberlo.
 *
 * Ningún test hacía la petición como la hace el script — solo con la cabecera y
 * sin sesión. Por eso sobrevivió. Este la hace.
 */

const CLAVE = 'clave-interna-de-prueba-larga';

/**
 * Va en su propio describe, SIN beforeAll.
 *
 * Si alguien pone un guard encima, el módulo de pruebas ni siquiera compila
 * (SuperAdminGuard pide JwtService, DataSource…) y el beforeAll revienta,
 * dejando los demás tests con un "Nest can't resolve dependencies" que no
 * explica nada. Esta comprobación no depende de que el módulo arranque, así que
 * sobrevive y dice qué pasa y por qué.
 */
describe('BackupInternalController — sin guard de sesión', () => {
  it('el controlador NO puede llevar @UseGuards: lo llama un script, no una persona', () => {
    const guards = Reflect.getMetadata('__guards__', BackupInternalController) ?? [];
    const nombres = guards.map((g: any) => g?.name ?? String(g)).join(', ');

    expect(
      guards.length === 0 ? 'sin guards' : `LLEVA GUARD(S): ${nombres}`,
    ).toBe('sin guards');
    // Si esto falla: los guards de clase corren ANTES del handler. Un guard de
    // sesión rechaza al script con 401 y la comprobación de x-internal-key no
    // llega a ejecutarse. Es el bug que dejó el panel meses diciendo
    // "Último backup: Nunca" mientras los respaldos corrían sin problema.
  });
});

describe('BackupInternalController — autenticación por x-internal-key', () => {
  let app: INestApplication;
  const llamadas: Record<string, any[]> = { exito: [], fallo: [], verificacion: [] };

  // Lo que devuelve ultimoParaVerificar(); se cambia por test.
  let ultimoFalso: any = {
    id: 42, s3Key: 'database/daily/db_20260829_020001.dump',
    checksum: 'a'.repeat(64), tamanio: '20M', tipo: 'daily', createdAt: new Date(),
  };

  const backupSvcFalso = {
    registrarExito:        async (d: any) => { llamadas.exito.push(d);        return { id: 1, ...d }; },
    registrarFallo:        async (d: any) => { llamadas.fallo.push(d);        return { id: 2, ...d }; },
    registrarVerificacion: async (d: any) => { llamadas.verificacion.push(d); return { id: 3, ...d }; },
    ultimoParaVerificar:   async () => ultimoFalso,
  };

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = CLAVE;

    const mod = await Test.createTestingModule({
      controllers: [BackupInternalController],
      providers:   [{ provide: BackupService, useValue: backupSvcFalso }],
    }).compile();

    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => {
    llamadas.exito = []; llamadas.fallo = []; llamadas.verificacion = [];
    process.env.INTERNAL_API_KEY = CLAVE;
  });

  // ── El caso exacto que fallaba en producción ──────────────────────────────

  it('EL BUG: alert SIN sesión y CON la clave correcta responde 2xx', async () => {
    // Exactamente lo que hace backup-hicloud.sh: una cabecera, ninguna cookie,
    // ningún Bearer. Si alguien vuelve a poner un guard de sesión encima de
    // este controlador, esto devuelve 401 y el CI se pone rojo.
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert')
      .set('x-internal-key', CLAVE)
      .send({ mensaje: 'pg_dump fallo', tipo: 'daily' });

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(llamadas.fallo).toHaveLength(1);
    expect(llamadas.fallo[0].mensaje).toBe('pg_dump fallo');
  });

  it('success SIN sesión y CON la clave correcta responde 2xx', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/success')
      .set('x-internal-key', CLAVE)
      .send({ archivo: 'database/daily/db_20260822.dump', tamanio: '42M', duracion: 30, checksum: 'abc' });

    expect(res.status).toBe(200);
    expect(llamadas.exito[0].s3Key).toBe('database/daily/db_20260822.dump');
  });

  it('verificacion SIN sesión y CON la clave correcta responde 2xx', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/verificacion')
      .set('x-internal-key', CLAVE)
      .send({ ok: true, filas: { facturas: { restaurado: 10, produccion: 10 } } });

    expect(res.status).toBe(200);
    expect(llamadas.verificacion[0].ok).toBe(true);
  });

  // ── Que siga estando protegido ────────────────────────────────────────────

  it('sin la cabecera: 401, no 200 con un error en el cuerpo', async () => {
    // Antes se devolvia `{ error: 'No autorizado' }` con HTTP 200. El script usa
    // `curl -sf`, que solo falla ante codigos de error: con un 200 curl daba
    // exito y el script creia haber notificado.
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert')
      .send({ mensaje: 'x' });

    expect(res.status).toBe(401);
    expect(llamadas.fallo).toHaveLength(0);
  });

  it('con una clave equivocada: 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert')
      .set('x-internal-key', 'no-es-la-clave-aaaaaaaaaaaaa')
      .send({ mensaje: 'x' });

    expect(res.status).toBe(401);
    expect(llamadas.fallo).toHaveLength(0);
  });

  it('con INTERNAL_API_KEY vacia NO se deja pasar a nadie', async () => {
    // Falla cerrado. La version original comparaba `key !== process.env.X`:
    // sin variable definida, un request sin cabecera comparaba
    // `undefined !== undefined` → false, y entraba.
    process.env.INTERNAL_API_KEY = '';

    const sinCabecera = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert').send({ mensaje: 'x' });
    const conCabecera = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert').set('x-internal-key', '').send({ mensaje: 'x' });

    expect(sinCabecera.status).toBe(401);
    expect(conCabecera.status).toBe(401);
    expect(llamadas.fallo).toHaveLength(0);
  });

  it('una clave de la longitud correcta pero distinta no pasa', async () => {
    // timingSafeEqual exige longitudes iguales; el caso interesante es cuando
    // coinciden en longitud y no en contenido.
    const misma = 'X'.repeat(CLAVE.length);
    expect(misma).toHaveLength(CLAVE.length);

    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/alert')
      .set('x-internal-key', misma)
      .send({ mensaje: 'x' });

    expect(res.status).toBe(401);
  });

  // ── La duración del caso bueno llega hasta el servicio ────────────────────

  it('verificacion pasa la duracion al servicio tambien cuando ok=true', async () => {
    // Si el DTO no declara `duracion`, el ValidationPipe con whitelist:true la
    // descarta en silencio y el dato muere aquí, no en el servicio.
    const res = await request(app.getHttpServer())
      .post('/admin/backups/internal/verificacion')
      .set('x-internal-key', CLAVE)
      .send({ backupId: 42, ok: true, duracion: 96, mensaje: 'Restaurado y verificado en 96s' });

    expect(res.status).toBe(200);
    expect(llamadas.verificacion[0].duracionSegundos).toBe(96);
    expect(llamadas.verificacion[0].backupId).toBe(42);
  });

  // ── El script pregunta QUÉ archivo verificar ──────────────────────────────

  it('ultimo devuelve id, s3Key y checksum con la clave interna', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/backups/internal/ultimo')
      .set('x-internal-key', CLAVE);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.s3Key).toContain('database/daily/');
    expect(res.body.checksum).toHaveLength(64);
  });

  it('ultimo sin clave interna responde 401, como las demás', async () => {
    const res = await request(app.getHttpServer()).get('/admin/backups/internal/ultimo');
    expect(res.status).toBe(401);
  });

  it('sin respaldo que verificar responde 404 — el script lo distingue de un fallo', async () => {
    // 404 aquí significa "todavía no hay respaldo", que NO es "el respaldo no
    // sirve". Si esto devolviera 500 o 200-con-null, el script marcaría como
    // fallida una verificación que nunca llegó a empezar.
    const previo = ultimoFalso;
    ultimoFalso = null;
    try {
      const res = await request(app.getHttpServer())
        .get('/admin/backups/internal/ultimo')
        .set('x-internal-key', CLAVE);
      expect(res.status).toBe(404);
    } finally {
      ultimoFalso = previo;
    }
  });

  // ── Las rutas no pueden cambiar sin cambiar el script ─────────────────────

  it('las rutas siguen siendo /admin/backups/internal/* — el script las tiene fijas', async () => {
    for (const ruta of ['success', 'alert', 'verificacion']) {
      const res = await request(app.getHttpServer())
        .post(`/admin/backups/internal/${ruta}`)
        .set('x-internal-key', CLAVE)
        .send(
          ruta === 'success' ? { archivo: 'a/b.dump', tamanio: '1M', duracion: 1 }
          : ruta === 'alert' ? { mensaje: 'x' }
          : { ok: true },
        );
      expect(res.status).not.toBe(404);
    }
  });
});
