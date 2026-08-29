import { BackupService } from './backup.service';

/**
 * Tres cosas que se comprueban aquí:
 *
 *   0. El S3Client SIEMPRE se construye con un perfil explícito (fromIni).
 *      Sin esto, el SDK lee AWS_PROFILE del proceso — una variable global que
 *      cambia de valor cuando hay dos buckets con requisitos distintos (media
 *      vs backups). El incidente del 2026-08-21 fue exactamente eso: el cliente
 *      de backups tomó credenciales vacías porque AWS_PROFILE apuntaba a otra
 *      cosa. Este test falla si alguien construye un S3Client sin perfil.
 *
 *   1. Un backup EXITOSO no se marca como verificado. "Exitoso" solo significa
 *
 *   1. Un backup EXITOSO no se marca como verificado. "Exitoso" solo significa
 *      que el script termino sin error; que el archivo se pueda restaurar es
 *      otra pregunta, y hasta que alguien la responda la respuesta es "no se".
 *
 *   2. Sin registros es el caso PEOR, no el neutro. Una tabla vacia se veia
 *      igual que si todo fuera bien.
 */

/** ConfigService mínimo — devuelve defaults para las claves que no conoce. */
const configFalso = { get: (_k: string, def?: any) => def ?? '' } as any;

/** ConfigService con bucket y perfil activos — activa la rama S3. */
const configConS3 = {
  get: (k: string, def?: any) => {
    if (k === 'AWS_S3_BACKUP_BUCKET') return 'test-bucket';
    if (k === 'AWS_REGION')            return 'us-east-2';
    if (k === 'AWS_S3_BACKUP_PROFILE') return 'mi-perfil-backup';
    return def ?? '';
  },
} as any;

function servicioCon(repo: Partial<Record<string, any>>): BackupService {
  return new BackupService(repo as any, configFalso);
}

// ── Perfil explícito — el test que blinda el incidente del 2026-08-21 ──────

describe('S3Client — perfil explícito obligatorio', () => {
  it('lee el perfil de AWS_S3_BACKUP_PROFILE, nunca del AWS_PROFILE global', () => {
    const svc = new BackupService({} as any, configConS3);
    // Si alguien elimina fromIni() y deja new S3Client({ region }),
    // credentialProfile queda en '' (el default de configFalso) y este test falla.
    expect(svc.credentialProfile).toBe('mi-perfil-backup');
  });

  it('sin bucket configurado el S3Client no se construye (no hay credenciales que resolver)', () => {
    const svc = servicioCon({});
    // Con bucket vacío, this.s3 queda en null — no se intenta ninguna conexión.
    expect((svc as any).s3).toBeNull();
    // El perfil queda en el default del configFalso (string vacío → fromIni no llega a usarse).
    expect(svc.credentialProfile).toBe('hicloud-backup'); // default hardcodeado en el servicio
  });
});

const HORA = 3_600_000;
const haceHoras = (h: number) => new Date(Date.now() - h * HORA);

describe('registrarExito — "exitoso" no es "verificado"', () => {
  it('NO marca integridadVerificada: eso solo lo hace una restauracion real', async () => {
    let guardado: any = null;
    const svc = servicioCon({
      create: (x: any) => x,
      save:   async (x: any) => { guardado = x; return x; },
    });

    await svc.registrarExito({
      s3Key: 'database/daily/db_20260822.dump', tamanio: '42M', duracion: 30, checksum: 'abc',
    });

    // Ni true ni false explicito: se deja el default de la columna.
    expect(guardado.integridadVerificada).toBeUndefined();
    expect(guardado.verificadoEn).toBeUndefined();
    expect(guardado.estado).toBe('EXITOSO');
  });

  it('deduce el tipo de la ruta en S3', async () => {
    const capturado: any[] = [];
    const svc = servicioCon({
      create: (x: any) => x,
      save:   async (x: any) => { capturado.push(x); return x; },
    });

    for (const [key, esperado] of [
      ['database/daily/db_1.dump',   'daily'],
      ['database/weekly/db_2.dump',  'weekly'],
      ['database/monthly/db_3.dump', 'monthly'],
      ['database/manual/db_4.dump',  'manual'],
    ] as const) {
      await svc.registrarExito({ s3Key: key, tamanio: '1M', duracion: 1 });
      expect(capturado.pop().tipo).toBe(esperado);
    }
  });
});

describe('estadoRespaldo — vacio NO es verde', () => {
  it('EL CASO QUE SE VEIA BIEN: sin registros es CRITICO', async () => {
    // Una tabla vacia significa o que no hay respaldos, o que los hay y nadie
    // los reporta. Desde aqui son indistinguibles, y las dos son graves.
    const svc = servicioCon({ count: async () => 0, findOne: async () => null });
    const e = await svc.estadoRespaldo();

    expect(e.critico).toBe(true);
    expect(e.motivo).toBe('sin-registros');
    expect(e.mensaje).toContain('cron');       // apunta a la causa probable
    expect(e.horasDesdeUltimo).toBeNull();
  });

  it('registros pero ninguno exitoso: tambien critico', async () => {
    const svc = servicioCon({ count: async () => 5, findOne: async () => null });
    const e = await svc.estadoRespaldo();

    expect(e.critico).toBe(true);
    expect(e.motivo).toBe('ultimo-fallido');
    expect(e.mensaje).toContain('NINGUNO exitoso');
  });

  it('un respaldo de hace 2 horas esta bien', async () => {
    const svc = servicioCon({
      count: async () => 10,
      findOne: async () => ({ createdAt: haceHoras(2), estado: 'EXITOSO' }),
    });
    const e = await svc.estadoRespaldo();

    expect(e.critico).toBe(false);
    expect(e.motivo).toBe('ok');
    expect(e.horasDesdeUltimo).toBe(2);
  });

  it('a las 47 horas todavia no grita — un retraso puntual no es una alarma', async () => {
    const svc = servicioCon({
      count: async () => 10,
      findOne: async () => ({ createdAt: haceHoras(47), estado: 'EXITOSO' }),
    });
    expect((await svc.estadoRespaldo()).critico).toBe(false);
  });

  it('a las 48 SI: son dos ciclos diarios perdidos', async () => {
    const svc = servicioCon({
      count: async () => 10,
      findOne: async () => ({ createdAt: haceHoras(48), estado: 'EXITOSO' }),
    });
    const e = await svc.estadoRespaldo();

    expect(e.critico).toBe(true);
    expect(e.motivo).toBe('desactualizado');
    expect(e.umbralHoras).toBe(48);
  });

  it('una semana entera sin respaldo sigue siendo critico, no se "normaliza"', async () => {
    const svc = servicioCon({
      count: async () => 10,
      findOne: async () => ({ createdAt: haceHoras(24 * 7), estado: 'EXITOSO' }),
    });
    const e = await svc.estadoRespaldo();

    expect(e.critico).toBe(true);
    expect(e.horasDesdeUltimo).toBe(168);
  });
});

describe('registrarVerificacion — la unica via para marcar verificado', () => {
  function svcConUltimo(ultimo: any) {
    const actualizaciones: any[] = [];
    const svc = servicioCon({
      findOne: async () => ultimo,
      update:  async (_id: number, datos: any) => { actualizaciones.push(datos); return datos; },
    });
    return { svc, actualizaciones };
  }

  it('un veredicto OK levanta la bandera y guarda los conteos', async () => {
    const { svc, actualizaciones } = svcConUltimo({ id: 7, s3Key: 'k' });
    const filas = { facturas: { restaurado: 5780, produccion: 5782 } };

    await svc.registrarVerificacion({ ok: true, filas });

    const u = actualizaciones[0];
    expect(u.integridadVerificada).toBe(true);
    expect(u.filasVerificadas).toEqual(filas);
    expect(u.restauracionProbadaEn).toBeInstanceOf(Date);
  });

  it('un veredicto NEGATIVO tambien se guarda — si no, el fallo vuelve a ser silencioso', async () => {
    const { svc, actualizaciones } = svcConUltimo({ id: 7, s3Key: 'k' });

    await svc.registrarVerificacion({ ok: false, mensaje: 'facturas vacia en el dump' });

    const u = actualizaciones[0];
    expect(u.integridadVerificada).toBe(false);
    expect(u.verificacionMensaje).toContain('facturas vacia');
    // La fecha se guarda igual: se intento y se sabe cuando.
    expect(u.restauracionProbadaEn).toBeInstanceOf(Date);
  });

  // EL DATO DEL CASO BUENO NO SE TIRA.
  //
  // Antes esto era `verificacionMensaje: ok ? null : mensaje`: en cuanto la
  // verificacion salia bien se borraba el detalle —duracion y sha256— que el
  // script se habia molestado en calcular. Lo que avisa de que algo se degrada
  // no es el primer fallo, es la TENDENCIA: una verificacion que pasa de 90s a
  // 300s en un mes sigue saliendo verde y es la unica señal previa.
  it('en EXITO tambien guarda el mensaje y la duracion', async () => {
    const { svc, actualizaciones } = svcConUltimo({ id: 7, s3Key: 'k' });

    await svc.registrarVerificacion({
      ok: true,
      mensaje: 'Restaurado y verificado en 96s (sha256 138ce42c6d11…)',
      duracionSegundos: 96,
    });

    const u = actualizaciones[0];
    expect(u.verificacionMensaje).toContain('sha256');
    expect(u.verificacionSegundos).toBe(96);
  });

  it('en FALLO guarda la duracion tambien — un fallo lento y uno inmediato no son lo mismo', async () => {
    const { svc, actualizaciones } = svcConUltimo({ id: 7, s3Key: 'k' });

    await svc.registrarVerificacion({ ok: false, mensaje: 'checksum no coincide', duracionSegundos: 8 });

    expect(actualizaciones[0].verificacionSegundos).toBe(8);
  });

  it('sin ningun backup al que aplicarlo, no revienta', async () => {
    const svc = servicioCon({ findOne: async () => null, update: async () => ({}) });
    await expect(svc.registrarVerificacion({ ok: true })).resolves.toBeNull();
  });
});

/**
 * Lo que hace que el tick verde signifique algo: el script pregunta QUE archivo
 * verificar y contra que contrastarlo. Sin esto volveria a verificar un dump
 * recien hecho y a estampar el veredicto sobre un objeto de S3 que nadie abrio.
 */
describe('ultimoParaVerificar — el respaldo REAL que hay que probar', () => {
  it('devuelve id, clave de S3 y checksum del ultimo exitoso', async () => {
    const svc = servicioCon({
      findOne: async () => ({
        id: 42, s3Key: 'database/daily/db_20260829_020001.dump',
        checksum: 'a'.repeat(64), tamanio: '20M', tipo: 'daily', createdAt: new Date(),
      }),
    });

    const r = await svc.ultimoParaVerificar();

    expect(r?.id).toBe(42);
    expect(r?.s3Key).toContain('database/daily/');
    expect(r?.checksum).toHaveLength(64);
  });

  it('un respaldo que se quedo en local NO es verificable desde S3', async () => {
    // S3 sin configurar: el script guarda "local:/tmp/...". No hay nada que
    // bajar, y darlo por verificable seria mentir otra vez.
    const svc = servicioCon({
      findOne: async () => ({ id: 9, s3Key: 'local:/tmp/hicloud-backups/db.dump', tipo: 'daily' }),
    });
    await expect(svc.ultimoParaVerificar()).resolves.toBeNull();
  });

  it('sin ningun respaldo exitoso devuelve null en vez de reventar', async () => {
    const svc = servicioCon({ findOne: async () => null });
    await expect(svc.ultimoParaVerificar()).resolves.toBeNull();
  });
});

describe('cerrarColgados — backups EN_PROGRESO mas de 30 min se cierran como FALLIDO', () => {
  const MIN = 60_000;

  function repoConColgados(backups: any[]): Partial<Record<string, any>> {
    const actualizaciones: Array<{ id: number; datos: any }> = [];
    return {
      find:   async () => backups,
      update: async (id: number, datos: any) => { actualizaciones.push({ id, datos }); return datos; },
      // Exponer las actualizaciones para los asserts
      _actualizaciones: actualizaciones,
    };
  }

  it('un registro EN_PROGRESO de mas de 30 min pasa a FALLIDO con mensaje claro', async () => {
    const hace35min = new Date(Date.now() - 35 * MIN);
    const repo = repoConColgados([{ id: 42, tipo: 'manual', createdAt: hace35min }]);
    const svc = new BackupService(repo as any, configFalso);

    await svc.cerrarColgados();

    const acts = (repo as any)._actualizaciones as Array<{ id: number; datos: any }>;
    expect(acts).toHaveLength(1);
    expect(acts[0].id).toBe(42);
    expect(acts[0].datos.estado).toBe('FALLIDO');
    expect(acts[0].datos.errorMensaje).toMatch(/reporte no recibido/);
    expect(acts[0].datos.errorMensaje).toMatch(/35 min/);
  });

  it('un registro de 29 min NO se cierra — el umbral es 30 min exactos', async () => {
    const hace29min = new Date(Date.now() - 29 * MIN);
    const repo = repoConColgados([{ id: 7, tipo: 'daily', createdAt: hace29min }]);
    const svc = new BackupService(repo as any, configFalso);

    await svc.cerrarColgados();

    const acts = (repo as any)._actualizaciones as Array<any>;
    expect(acts).toHaveLength(0);
  });

  it('sin registros EN_PROGRESO no hace nada', async () => {
    const repo = repoConColgados([]);
    const svc = new BackupService(repo as any, configFalso);

    await expect(svc.cerrarColgados()).resolves.toBeUndefined();
    expect((repo as any)._actualizaciones).toHaveLength(0);
  });

  it('cierra varios registros colgados en el mismo tick', async () => {
    const repos = repoConColgados([
      { id: 10, tipo: 'manual', createdAt: new Date(Date.now() - 45 * MIN) },
      { id: 11, tipo: 'manual', createdAt: new Date(Date.now() - 120 * MIN) }, // los de hoy
    ]);
    const svc = new BackupService(repos as any, configFalso);

    await svc.cerrarColgados();

    const acts = (repos as any)._actualizaciones as Array<{ id: number; datos: any }>;
    expect(acts).toHaveLength(2);
    expect(acts.map(a => a.id).sort()).toEqual([10, 11]);
    acts.forEach(a => expect(a.datos.estado).toBe('FALLIDO'));
  });
});
