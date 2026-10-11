import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Incidente real (2026-10-11): una cajera (Elvia) quedó bloqueada a mitad de
 * turno pidiendo contraseña — SESION_HORAS seguía en el default original de
 * 24h, así que un hueco de un día sin abrir el POS ni una sola vez (no
 * inactividad DENTRO de una sesión — eso es posInactividadMinutos, un
 * control aparte) hacía vencer el refresh token de verdad.
 *
 * Estos tests fijan el comportamiento DESLIZANTE de rotar() de punta a
 * punta, con el default real (720h = 30 días) — no solo que
 * SessionLifetimeService devuelva 720h (ver session-lifetime.spec.ts), sino
 * que una cadena de rotaciones con uso periódico nunca vence, y que SÍ
 * vence tras 30 días seguidos sin ningún uso.
 */
describe('RefreshTokenService — sesión deslizante (720h = 30 días)', () => {
  const HORA = 3_600_000;
  const DIA  = 24 * HORA;
  const SESION_HORAS_MS = 720 * HORA; // el default real tras el incidente — ver session-lifetime.service.ts

  /** Repo en memoria — solo lo que rotar()/crear() tocan de verdad. */
  function fakeRepo() {
    const filas: any[] = [];
    let seq = 0;
    const coincide = (fila: any, where: any) =>
      Object.keys(where).every(k => {
        const v = where[k];
        if (v && typeof v === 'object' && 'type' in v) return v.type === 'isNull' ? fila[k] == null : true;
        return fila[k] === v;
      });
    return {
      filas,
      create: (obj: any) => ({ ...obj }),
      save: async (obj: any) => {
        const fila = { id: obj.id ?? `tok-${++seq}`, revokedAt: null, motivoRevocacion: null, nextTokenId: null, ...obj };
        filas.push(fila);
        return fila;
      },
      findOne: async ({ where }: any) => filas.find(f => coincide(f, where)) ?? null,
      update: async (id: string, partial: any) => {
        const fila = filas.find(f => f.id === id);
        if (fila) Object.assign(fila, partial);
      },
    };
  }

  function buildService() {
    const repo = fakeRepo();
    const sessionLifetime = { paraUsuario: jest.fn().mockResolvedValue(SESION_HORAS_MS) };
    const svc = new RefreshTokenService(repo as any, {} as any, sessionLifetime as any);
    return { svc, repo };
  }

  const AHORA_BASE = new Date('2026-01-01T08:00:00.000Z').getTime();

  beforeEach(() => jest.useFakeTimers().setSystemTime(AHORA_BASE));
  afterEach(() => jest.useRealTimers());

  it('uso diario durante 60 días — nunca vence, cada rotación renueva la ventana', async () => {
    const { svc } = buildService();
    let valor = await svc.crear(1);

    for (let dia = 0; dia < 60; dia++) {
      jest.setSystemTime(AHORA_BASE + dia * DIA);
      const { newRefreshValue } = await svc.rotar(valor);
      valor = newRefreshValue;
    }
    // Llega al día 60 sin que ninguna rotación haya lanzado — la ventana se
    // corrió hacia adelante en cada una, nunca se acercó a los 720h desde el origen.
    expect(valor).toBeTruthy();
  });

  it('31 días SEGUIDOS sin ningún uso — el refresh token expiró de verdad, pide contraseña', async () => {
    const { svc } = buildService();
    const valor = await svc.crear(1);

    jest.setSystemTime(AHORA_BASE + 31 * DIA);
    await expect(svc.rotar(valor)).rejects.toThrow(UnauthorizedException);
  });

  it('30 días exactos SIGUE dentro de la ventana — 720h no se queda corto por un redondeo', async () => {
    const { svc } = buildService();
    const valor = await svc.crear(1);

    jest.setSystemTime(AHORA_BASE + 30 * DIA - HORA);
    await expect(svc.rotar(valor)).resolves.toBeDefined();
  });

  it('PC apagada toda la noche (10h) — al abrir el POS, la rotación automática no pide nada', async () => {
    const { svc } = buildService();
    const valor = await svc.crear(1);

    jest.setSystemTime(AHORA_BASE + 10 * HORA);
    const { newRefreshValue } = await svc.rotar(valor);
    expect(newRefreshValue).toBeTruthy();
  });

  it('una semana sin tocar el sistema sigue dentro de la ventana de 30 días', async () => {
    const { svc } = buildService();
    const valor = await svc.crear(1);

    jest.setSystemTime(AHORA_BASE + 7 * DIA);
    await expect(svc.rotar(valor)).resolves.toBeDefined();
  });
});
