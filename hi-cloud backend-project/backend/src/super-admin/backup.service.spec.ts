import { BackupService } from './backup.service';

/**
 * Dos cosas que se comprueban aquí, y las dos venían de que el panel afirmaba
 * cosas que no sabía:
 *
 *   1. Un backup EXITOSO no se marca como verificado. "Exitoso" solo significa
 *      que el script termino sin error; que el archivo se pueda restaurar es
 *      otra pregunta, y hasta que alguien la responda la respuesta es "no se".
 *
 *   2. Sin registros es el caso PEOR, no el neutro. Una tabla vacia se veia
 *      igual que si todo fuera bien.
 */

/** ConfigService minimo — solo se le piden region y bucket en el constructor. */
const configFalso = { get: (_k: string, def?: any) => def ?? '' } as any;

function servicioCon(repo: Partial<Record<string, any>>): BackupService {
  return new BackupService(repo as any, configFalso);
}

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
    expect(u.verificacionMensaje).toBeNull();
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

  it('sin ningun backup al que aplicarlo, no revienta', async () => {
    const svc = servicioCon({ findOne: async () => null, update: async () => ({}) });
    await expect(svc.registrarVerificacion({ ok: true })).resolves.toBeNull();
  });
});
