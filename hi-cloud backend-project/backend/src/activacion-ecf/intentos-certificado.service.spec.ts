import { HttpException } from '@nestjs/common';
import { IntentosCertificadoService } from './intentos-certificado.service';

/**
 * `validar-certificado` es un ORÁCULO DE CLAVES: dice si una contraseña abre un
 * PFX. Con un certificado robado se podrían probar claves hasta dar con la
 * buena. Estos tests fijan el freno.
 */

/** Caché en memoria con el contrato mínimo de cache-manager. */
function cacheFalsa() {
  const datos = new Map<string, any>();
  return {
    datos,
    get:  async (k: string) => datos.get(k),
    set:  async (k: string, v: any) => { datos.set(k, v); },
    del:  async (k: string) => { datos.delete(k); },
  } as any;
}

const EMPRESA = 7;
const USUARIO = 33;
const IP      = '190.80.1.1';

describe('IntentosCertificadoService', () => {
  it('sin fallos previos, deja pasar', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).resolves.toBeUndefined();
  });

  it('cuatro fallos todavía no bloquean — nadie teclea bien a la primera siempre', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    for (let i = 0; i < 4; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);
    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).resolves.toBeUndefined();
  });

  it('al quinto fallo bloquea con 429', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    for (let i = 0; i < 5; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);

    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).rejects.toThrow(HttpException);
    try { await svc.exigirNoBloqueado(EMPRESA, IP); } catch (e: any) {
      expect(e.getStatus()).toBe(429);
      expect(String(e.message)).toMatch(/intenta/i);   // dice cuándo reintentar
    }
  });

  it('el bloqueo crece con la insistencia', async () => {
    const cache = cacheFalsa();
    const svc = new IntentosCertificadoService(cache);

    for (let i = 0; i < 5; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);
    const primero = (await cache.get(`cert_bloqueo:${EMPRESA}:${IP}`)).hasta;

    for (let i = 0; i < 3; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);
    const segundo = (await cache.get(`cert_bloqueo:${EMPRESA}:${IP}`)).hasta;

    // 200 intentos no pueden costar lo mismo que 5.
    expect(segundo).toBeGreaterThan(primero);
  });

  it('un acierto limpia contador y bloqueo', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    for (let i = 0; i < 6; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);
    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).rejects.toThrow();

    await svc.registrarExito(EMPRESA, IP);
    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).resolves.toBeUndefined();
  });

  it('el contador es por EMPRESA e IP: cambiar de red no lo reinicia del todo', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    for (let i = 0; i < 6; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);

    // Otra IP arranca limpia — es el precio de no castigar a un compañero
    // detrás del mismo NAT...
    await expect(svc.exigirNoBloqueado(EMPRESA, '200.1.1.1')).resolves.toBeUndefined();
    // ...pero la combinación original sigue bloqueada.
    await expect(svc.exigirNoBloqueado(EMPRESA, IP)).rejects.toThrow();
    // Y otra empresa desde la misma IP no hereda el bloqueo.
    await expect(svc.exigirNoBloqueado(99, IP)).resolves.toBeUndefined();
  });

  it('deja rastro con empresa y usuario, y NUNCA con la clave', async () => {
    const svc = new IntentosCertificadoService(cacheFalsa());
    const warns: string[] = [];
    const errors: string[] = [];
    (svc as any).logger = {
      warn:  (m: string) => warns.push(m),
      error: (m: string) => errors.push(m),
    };

    for (let i = 0; i < 5; i++) await svc.registrarFallo(EMPRESA, USUARIO, IP);

    // Si alguien prueba 200 veces, tiene que verse quién y desde dónde.
    expect(warns.join(' ')).toContain(`empresa #${EMPRESA}`);
    expect(warns.join(' ')).toContain(`usuario #${USUARIO}`);
    expect(warns.join(' ')).toContain(IP);
    expect(errors.join(' ')).toMatch(/BLOQUEADO/);

    // Y nunca el CONTENIDO. Ojo con la tentación de buscar la palabra "clave":
    // el log dice "Clave incorrecta", que es la etiqueta del suceso, no un
    // valor. Lo que no puede aparecer son los datos en sí.
    const todo = [...warns, ...errors].join(' ');
    expect(todo).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);   // nada que parezca base64/DER
  });

  it('la firma del servicio NO recibe el PFX ni la clave', () => {
    // La garantía estructural: aunque alguien añadiera un log descuidado, no
    // tendría acceso a los datos sensibles desde aquí.
    const fuente = IntentosCertificadoService.prototype.registrarFallo.toString();
    expect(fuente).not.toMatch(/\bpfx\b|\bbuffer\b/i);
    expect(IntentosCertificadoService.prototype.registrarFallo.length).toBe(3); // empresaId, usuarioId, ip
  });
});
