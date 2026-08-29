import { BackupService } from './backup.service';

jest.mock('child_process', () => ({ exec: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exec } = require('child_process');

/**
 * El flujo del boton manual, de principio a fin, contado como pasa de verdad.
 *
 * ── QUE SE ROMPIO ───────────────────────────────────────────────────────────
 *
 * `triggerManual()` insertaba una fila EN_PROGRESO y lanzaba el script. Cuando
 * el script terminaba bien llamaba a /internal/success, y `registrarExito()`
 * hacia `repo.save(repo.create({...}))` — un INSERT, siempre. Nadie le pasaba
 * el id de la fila abierta, asi que esa fila no se cerraba nunca por la via
 * normal: `triggerManual` solo la actualiza en la rama de ERROR de exec.
 *
 * Resultado: cada backup manual exitoso dejaba DOS filas, una EXITOSO y una
 * EN_PROGRESO huerfana. El cron `cerrarColgados()` la marcaba como FALLIDO 30
 * minutos despues con el motivo equivocado ("reporte no recibido"), y eso
 * ensuciaba la tasa de exito del panel con fallos que nunca ocurrieron.
 *
 * El test recorre el flujo entero contra una tabla en memoria y mira lo unico
 * que importa: cuantas filas quedan.
 */

const configFalso = { get: (_k: string, def?: any) => def ?? '' } as any;

/**
 * Tabla en memoria con la semantica de TypeORM que aqui importa:
 * `save()` con id existente ACTUALIZA en sitio; sin id, inserta.
 *
 * Se imita asi a proposito para no atar el test a una implementacion concreta:
 * da igual si el arreglo usa `update()` o `save()` con id, lo que se comprueba
 * es que no aparezca una segunda fila.
 */
function tablaEnMemoria() {
  const filas: any[] = [];
  let seq = 0;

  return {
    filas,
    create: (d: any) => ({ ...d }),
    save: async (d: any) => {
      if (d.id) {
        const fila = filas.find(f => f.id === d.id);
        if (fila) { Object.assign(fila, d); return fila; }
      }
      const fila = { id: ++seq, createdAt: new Date(), estado: 'EN_PROGRESO', ...d };
      filas.push(fila);
      return fila;
    },
    findOne: async ({ where }: any) =>
      filas.find(f => f.id === where?.id) ?? null,
    update: async (id: number, cambios: any) => {
      const fila = filas.find(f => f.id === id);
      if (fila) Object.assign(fila, cambios);
      return { affected: fila ? 1 : 0 };
    },
  };
}

function servicioCon(repo: any): BackupService {
  return new BackupService(repo as any, configFalso);
}

beforeEach(() => (exec as jest.Mock).mockReset());

describe('flujo del boton manual — tiene que quedar UNA fila', () => {
  it('EL BUG: el reporte de exito cierra la fila abierta, no crea una segunda', async () => {
    const repo = tablaEnMemoria();
    const svc  = servicioCon(repo);

    // 1. El usuario 42 pulsa "Ejecutar backup manual".
    const disparo: any = await svc.triggerManual(42);

    expect(repo.filas).toHaveLength(1);
    expect(repo.filas[0]).toMatchObject({ tipo: 'manual', estado: 'EN_PROGRESO', iniciadoPor: 42 });

    // 2. El script termina bien y reporta a /internal/success. Manda el id que
    //    recibio al arrancar — es lo que le permite cerrar SU fila.
    const registroId = disparo?.registroId ?? repo.filas[0].id;
    await svc.registrarExito({
      registroId,
      s3Key:    'database/manual/db_20260829_101500.dump',
      tamanio:  '18M',
      duracion: 12,
      checksum: 'a'.repeat(64),
    } as any);

    // 3. Lo unico que importa: UNA fila, cerrada.
    expect(repo.filas).toHaveLength(1);
    expect(repo.filas[0]).toMatchObject({
      id:               registroId,
      estado:           'EXITOSO',
      s3Key:            'database/manual/db_20260829_101500.dump',
      tamanio:          '18M',
      duracionSegundos: 12,
    });
  });

  it('la fila cerrada conserva quien la pidio y que fue manual', async () => {
    const repo = tablaEnMemoria();
    const svc  = servicioCon(repo);

    const disparo: any = await svc.triggerManual(7);
    const registroId = disparo?.registroId ?? repo.filas[0].id;

    // El script deriva el TIPO de la fecha y nunca produce 'manual': un disparo
    // manual sube a database/daily/. Si el cierre dejara que detectarTipo()
    // pisara el tipo, un backup pedido a mano se registraria como diario y se
    // perderia el rastro de quien lo pidio.
    await svc.registrarExito({
      registroId,
      s3Key:    'database/daily/db_20260829_101500.dump',
      tamanio:  '18M',
      duracion: 12,
    } as any);

    expect(repo.filas).toHaveLength(1);
    expect(repo.filas[0]).toMatchObject({
      estado:      'EXITOSO',
      tipo:        'manual',
      iniciadoPor: 7,
    });
  });

  it('el script recibe el id de su fila al arrancar', async () => {
    const repo = tablaEnMemoria();
    const svc  = servicioCon(repo);

    await svc.triggerManual(42);

    expect(exec).toHaveBeenCalledTimes(1);
    const [, opciones] = (exec as jest.Mock).mock.calls[0];
    // Sin esto el script no sabe que fila cerrar y volvemos al INSERT ciego.
    expect(String(opciones?.env?.BACKUP_REGISTRO_ID)).toBe(String(repo.filas[0].id));
  });
});

describe('el cron no tiene fila previa — ahi el INSERT es lo correcto', () => {
  it('un exito sin registroId sigue insertando una fila nueva', async () => {
    const repo = tablaEnMemoria();
    const svc  = servicioCon(repo);

    await svc.registrarExito({
      s3Key:    'database/daily/db_20260829_020000.dump',
      tamanio:  '18M',
      duracion: 11,
    });

    expect(repo.filas).toHaveLength(1);
    expect(repo.filas[0]).toMatchObject({ estado: 'EXITOSO', tipo: 'daily' });
  });

  it('un registroId que ya no existe no puede perder el respaldo: inserta', async () => {
    const repo = tablaEnMemoria();
    const svc  = servicioCon(repo);

    // La fila pudo borrarse a mano entre el disparo y el reporte. Perder el
    // registro de un respaldo que SI se hizo es peor que tener una fila de mas.
    await svc.registrarExito({
      registroId: 9999,
      s3Key:      'database/manual/db_20260829_101500.dump',
      tamanio:    '18M',
      duracion:   12,
    } as any);

    expect(repo.filas).toHaveLength(1);
    expect(repo.filas[0]).toMatchObject({ estado: 'EXITOSO' });
  });
});
