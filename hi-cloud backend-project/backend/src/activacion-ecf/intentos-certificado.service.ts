import { Injectable, Inject, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Frena la fuerza bruta contra el endpoint que valida el certificado.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────────────
 *
 * `validar-certificado` es un ORÁCULO: recibe un PFX y una clave, y responde si
 * la clave es la correcta. Quien tenga un certificado robado puede usarlo para
 * probar claves hasta dar con la buena. El endpoint pide sesión, pero una
 * sesión válida se consigue —un empleado, una cuenta comprometida— y sin límite
 * probaría miles de claves por minuto.
 *
 * Mismo diseño que LoginAttemptsService, que resuelve exactamente este problema
 * para el login: contador en caché, bloqueo temporal progresivo. No se inventa
 * un mecanismo nuevo.
 *
 * Se cuenta por EMPRESA y por IP a la vez: por empresa para que cambiar de red
 * no reinicie el contador, por IP para que rotar de cuenta tampoco.
 */

/** Fallos seguidos antes de bloquear. Bajo a propósito: nadie teclea mal 5 veces. */
const MAX_FALLOS = 5;

/** Cuánto dura el bloqueo, creciendo con la insistencia. */
const BLOQUEOS_SEGUNDOS = [60, 300, 900, 3600];

/** Los contadores caducan solos: un fallo de hace horas no cuenta. */
const TTL_CONTADOR_MS = 60 * 60 * 1000;

@Injectable()
export class IntentosCertificadoService {
  private readonly logger = new Logger(IntentosCertificadoService.name);

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private claveContador(empresaId: number, ip: string) { return `cert_intentos:${empresaId}:${ip}`; }
  private claveBloqueo(empresaId: number, ip: string)  { return `cert_bloqueo:${empresaId}:${ip}`; }

  /**
   * Lanza 429 si está bloqueado. Se llama ANTES de tocar el archivo: si hay
   * bloqueo, el PFX ni se abre.
   */
  async exigirNoBloqueado(empresaId: number, ip: string): Promise<void> {
    const dato = await this.cache.get<{ hasta: number }>(this.claveBloqueo(empresaId, ip));
    if (dato && dato.hasta > Date.now()) {
      const segundos = Math.ceil((dato.hasta - Date.now()) / 1000);
      throw new HttpException(
        `Demasiados intentos fallidos con la clave del certificado. ` +
        `Vuelve a intentarlo en ${segundos > 60 ? `${Math.ceil(segundos / 60)} minutos` : `${segundos} segundos`}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Registra un fallo y bloquea si toca.
   *
   * DEJA RASTRO con empresaId y usuario — nunca con el archivo ni la clave. Si
   * alguien prueba 200 veces, tiene que verse en el log.
   */
  async registrarFallo(empresaId: number, usuarioId: number, ip: string): Promise<void> {
    const clave  = this.claveContador(empresaId, ip);
    const fallos = ((await this.cache.get<number>(clave)) ?? 0) + 1;
    await this.cache.set(clave, fallos, TTL_CONTADOR_MS);

    this.logger.warn(
      `[Certificado] Clave incorrecta — empresa #${empresaId} · usuario #${usuarioId} · ` +
      `ip ${ip} · intento ${fallos}`,
    );

    if (fallos >= MAX_FALLOS) {
      const idx      = Math.min(fallos - MAX_FALLOS, BLOQUEOS_SEGUNDOS.length - 1);
      const segundos = BLOQUEOS_SEGUNDOS[idx];
      await this.cache.set(
        this.claveBloqueo(empresaId, ip),
        { hasta: Date.now() + segundos * 1000 },
        segundos * 1000,
      );
      // A este nivel sí interesa que salte en Sentry: no es un usuario torpe.
      this.logger.error(
        `[Certificado] BLOQUEADO ${segundos}s tras ${fallos} claves incorrectas — ` +
        `empresa #${empresaId} · usuario #${usuarioId} · ip ${ip}`,
      );
    }
  }

  /** Un acierto limpia el contador: quien da con la clave no es un atacante. */
  async registrarExito(empresaId: number, ip: string): Promise<void> {
    await this.cache.del(this.claveContador(empresaId, ip));
    await this.cache.del(this.claveBloqueo(empresaId, ip));
  }
}
