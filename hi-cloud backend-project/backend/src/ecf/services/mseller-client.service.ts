import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { EcfConfigService } from './ecf-config.service';
import type { MSellerPayload } from './ecf-builder.service';
import { assertEmisorOrder } from '../builders/sections/emisor.section';
import {
  EcfComunicacionError,
  EcfValidacionError,
} from '../errors/ecf.errors';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';
import { CacheKeys, CacheTTL } from '../../common/cache/cache-keys';

// ── Tipos de respuesta MSeller ────────────────────────────────────────────────

export interface MSellerAuthResponse {
  accessToken:  string;
  idToken:      string;
  refreshToken: string;
}

export interface MSellerEnvioResponse {
  rnc:             string;
  ecf:             string;
  internalTrackId: string;  // UUID para consultas / webhook
  securityCode:    string;  // Código de seguridad para QR
  qr_url:          string;  // URL del QR DGII
  signedDate:      string;  // Fecha firma: "DD-MM-YYYY HH:MM:SS"
}

export interface MSellerEstadoResponse {
  status:   string;  // 'ACEPTADO' | 'RECHAZADO' | 'PROCESANDO' | 'RECIBIDO'
  message?: string;
  details?: unknown;
}

export interface MSellerBatchStatusItem {
  ecf:    string;
  status: string;   // 'Aceptado' | 'Rechazado' | 'Aceptado Condicional' | 'Enviado' | 'En Proceso'
  found:  boolean;
  data?:  Record<string, unknown>;
}

export interface MSellerBatchStatusResponse {
  total:   number;
  results: MSellerBatchStatusItem[];
}

interface TokenCacheEntry {
  idToken:      string;
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;  // timestamp ms — JSON-serializable para Redis
}

const MSELLER_ENV_PATH: Record<ModoEcf, string> = {
  [ModoEcf.TEST]:          'TesteCF',
  [ModoEcf.CERTIFICACION]: 'CerteCF',
  [ModoEcf.PRODUCCION]:    'eCF',
};

// Backoff en ms para reintentos: 1s, 2s, 4s
const RETRY_DELAYS = [1_000, 2_000, 4_000];

/**
 * Cliente HTTP para la API de MSeller.
 *
 * - Gestiona tokens de autenticación por empresa (caché en memoria con TTL).
 * - Reintentos exponenciales solo en errores 5xx y timeouts (no en 4xx).
 * - Timeout configurable: 8 s para POS, 30 s para facturas regulares.
 * - Logging completo: request, response, latencia.
 */
@Injectable()
export class MSellerClientService {
  private readonly logger = new Logger(MSellerClientService.name);

  constructor(
    private readonly http:           HttpService,
    private readonly ecfConfigSvc:   EcfConfigService,
    /** Cache global (Redis en prod, in-memory en dev) — multi-instancia safe */
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── Autenticación ─────────────────────────────────────────────────────────

  /**
   * ¿El circuit breaker GLOBAL por 429 está activo ahora mismo? Lo consultan
   * los crones (ReintentoECFJob, ConsultarEstadoECFJob) ANTES de arrancar su
   * ciclo — si está abierto, se saltan el ciclo completo en vez de descubrir
   * el 429 llamada por llamada (lo que solo alargaría el bloqueo).
   * Devuelve la fecha hasta la que está abierto, o null si está cerrado.
   */
  async circuitoGlobal429Hasta(): Promise<Date | null> {
    const hasta = await this.cache.get<number>(CacheKeys.msellerCircuito429());
    return hasta && hasta > Date.now() ? new Date(hasta) : null;
  }

  /**
   * Devuelve un idToken válido para la empresa.
   * Usa caché en memoria; renueva si está a < 2 min de expirar.
   */
  async getIdToken(empresaId: number, authTimeoutMs = 10_000): Promise<{
    idToken:     string;
    accessToken: string;
    apiKey:      string;
    baseUrl:     string;
    envPath:     string;
  }> {
    // Circuit breaker GLOBAL (429 de MSeller, ver abrirCircuitoGlobalMSeller) —
    // se revisa PRIMERO de todo, antes de cualquier credencial/circuit breaker
    // por empresa: MSeller es un proveedor compartido entre todas las
    // empresas, así que un 429 de CUALQUIER empresa pausa a TODAS. Único
    // punto de entrada para enviarDocumento/consultarBatch/consultarEstado —
    // cubre los tres (y los crons que los llaman) sin tocar cada uno.
    const circuitoHasta = await this.cache.get<number>(CacheKeys.msellerCircuito429());
    if (circuitoHasta && circuitoHasta > Date.now()) {
      throw new EcfComunicacionError(
        `MSeller: circuit breaker GLOBAL activo por 429 (Too Many Requests) — ` +
        `pausado hasta ${new Date(circuitoHasta).toISOString()}, no se llama a MSeller.`,
      );
    }

    // Circuit breaker por empresa (Cognito bloqueado por intentos fallidos,
    // ver el catch de abajo) — se revisa ANTES de autenticar o llamar a
    // MSeller, no después: cada intento mientras está bloqueado puede
    // alargar el bloqueo.
    if (await this.ecfConfigSvc.isEmpresaBloqueada(empresaId)) {
      throw new EcfComunicacionError(
        `Empresa #${empresaId}: circuit breaker activo (credenciales MSeller bloqueadas temporalmente) — no se llama a MSeller.`,
      );
    }

    const creds = await this.ecfConfigSvc.getCredencialesDescifradas(empresaId);

    // Verificar caché Redis — los tokens de MSeller duran ~1 hora
    const cacheKey = CacheKeys.msellerToken(empresaId);
    const cached   = await this.cache.get<TokenCacheEntry>(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 2 * 60_000) {
      return {
        idToken:     cached.idToken,
        accessToken: cached.accessToken,
        apiKey:      creds.apiKey,
        baseUrl:     creds.urlBase,
        envPath:     creds.envPath,
      };
    }

    // ── Single-flight: UNA sola petición/instancia refresca el token de esta
    // empresa a la vez (hotfix 429, 2026-10-07) — sin esto, N ventas
    // concurrentes con el token recién vencido disparaban N autenticaciones
    // simultáneas contra Cognito, justo el patrón que dispara un 429. Si
    // otra petición ya está refrescando, esperamos su resultado en vez de
    // autenticar por nuestra cuenta.
    const lockKey  = CacheKeys.msellerTokenLock(empresaId);
    const tengoLock = await this.adquirirLock(lockKey, 15_000);
    if (!tengoLock) {
      const tokenAjeno = await this.esperarTokenDeOtraPeticion(cacheKey);
      if (tokenAjeno) {
        return { idToken: tokenAjeno.idToken, accessToken: tokenAjeno.accessToken, apiKey: creds.apiKey, baseUrl: creds.urlBase, envPath: creds.envPath };
      }
      // Nadie terminó a tiempo — seguir con el intento propio (fail-safe,
      // nunca bloquear la emisión indefinidamente por el lock de otro).
    }

    try {
      // Obtener nuevo token
      const authUrl = `${creds.urlBase}/${creds.envPath}/customer/authentication`;
      this.logger.log(`Autenticando en MSeller: ${authUrl} [empresa #${empresaId}]`);

      const t0 = Date.now();
      try {
        const resp = await firstValueFrom(
          this.http.post<MSellerAuthResponse>(
            authUrl,
            { email: creds.email, password: creds.password },
            { timeout: authTimeoutMs, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const { idToken, accessToken, refreshToken } = resp.data;
        // Guardar en Redis con TTL 55 min (conservador vs 1h de Cognito)
        await this.cache.set(
          CacheKeys.msellerToken(empresaId),
          { idToken, accessToken, refreshToken, expiresAt: Date.now() + 55 * 60_000 },
          CacheTTL.MSELLER_TOKEN,
        );

        this.logger.log(`Auth MSeller OK [${Date.now() - t0}ms] empresa #${empresaId}`);
        return { idToken, accessToken, apiKey: creds.apiKey, baseUrl: creds.urlBase, envPath: creds.envPath };
      } catch (err: any) {
        await this.cache.del(CacheKeys.msellerToken(empresaId)); // limpiar caché si falla
        const status  = err?.response?.status;
        const resData = err?.response?.data;
        const msg     = resData?.message ?? resData?.error ?? err?.message ?? 'timeout';

        // 429 en el LOGIN también es throttling de MSeller/Cognito — abre el
        // mismo circuit breaker global que el envío (ver withRetry).
        if (status === 429) {
          await this.abrirCircuitoGlobalMSeller(err);
        }

        // Cognito bloquea la cuenta tras varios intentos fallidos → circuit breaker 30 min
        if (typeof msg === 'string' && msg.toLowerCase().includes('password attempts exceeded')) {
          const hasta = new Date(Date.now() + 30 * 60_000);
          try {
            await this.ecfConfigSvc.setBloqueadoHasta(empresaId, hasta);
          } catch (cbErr) {
            this.logger.error(`No se pudo guardar circuit breaker para empresa #${empresaId}: ${cbErr}`);
          }
          this.logger.error(
            `[CircuitBreaker] Empresa #${empresaId} bloqueada por Cognito — ` +
            `reintentos pausados hasta ${hasta.toISOString()}`,
          );
        }

        throw new EcfComunicacionError(
          `No se pudo autenticar con MSeller [${status ?? 'timeout'}]: ${msg}`,
        );
      }
    } finally {
      if (tengoLock) {
        try { await this.cache.del(lockKey); } catch { /* no-op — el lock expira solo por su PX/ttl */ }
      }
    }
  }

  /**
   * Intenta tomar un lock distribuido (Redis SET NX PX cuando hay cliente
   * Redis real; best-effort get-then-set si no — dev sin Redis, una sola
   * instancia, sin concurrencia entre procesos que proteger).
   */
  private async adquirirLock(key: string, ttlMs: number): Promise<boolean> {
    const client = (this.cache as any)?.store?.client;
    if (client?.set) {
      try {
        const resultado = await client.set(key, '1', { NX: true, PX: ttlMs });
        return resultado === 'OK';
      } catch (err) {
        this.logger.warn(`adquirirLock(${key}) falló, se sigue sin lock: ${(err as Error).message}`);
        return true; // no bloquear el flujo por un problema del lock en sí
      }
    }
    const existe = await this.cache.get(key);
    if (existe) return false;
    await this.cache.set(key, '1', ttlMs);
    return true;
  }

  /** Espera hasta ~5s a que OTRA petición/instancia termine de refrescar el token. */
  private async esperarTokenDeOtraPeticion(cacheKey: string): Promise<TokenCacheEntry | null> {
    for (let i = 0; i < 20; i++) {
      await this.sleep(250);
      const cached = await this.cache.get<TokenCacheEntry>(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached;
    }
    return null;
  }

  /**
   * 429 (Too Many Requests), o 401/403 persistente incluso con token fresco —
   * NUNCA un rechazo real, es throttling o un problema de autenticación del
   * proveedor. Abre el circuit breaker GLOBAL (todas las empresas, todos los
   * tipos de llamada) respetando Retry-After si MSeller lo manda (solo
   * aplica al 429), con un piso de 60s. Hotfix 2026-10-07 — ver
   * mseller-client-429.spec.ts y emitir-pos-en-curso.spec.ts para el 429;
   * FAC-1705 (errorEnvio="MSeller rechazó el documento [403]: Forbidden")
   * para el 401/403.
   */
  private async abrirCircuitoGlobalMSeller(err: any): Promise<void> {
    const status = err?.response?.status ?? err?.status;
    const retryAfterHeader = err?.response?.headers?.['retry-after'] ?? err?.response?.headers?.['Retry-After'];
    let retryAfterMs = 0;
    if (retryAfterHeader != null) {
      const comoNumero = Number(retryAfterHeader);
      if (!Number.isNaN(comoNumero)) {
        retryAfterMs = comoNumero * 1000; // Retry-After en segundos
      } else {
        const comoFecha = new Date(retryAfterHeader).getTime();
        if (!Number.isNaN(comoFecha)) retryAfterMs = Math.max(0, comoFecha - Date.now());
      }
    }
    const duracionMs = Math.max(retryAfterMs, 60_000);
    const hasta = Date.now() + duracionMs;
    await this.cache.set(CacheKeys.msellerCircuito429(), hasta, duracionMs + 5_000);
    this.logger.error(
      `[CircuitBreaker GLOBAL] MSeller devolvió ${status ?? '(sin status)'}` +
      `${retryAfterHeader ? ` [Retry-After: ${retryAfterHeader}]` : ''} — ` +
      `TODAS las llamadas a MSeller (cualquier empresa) pausadas hasta ${new Date(hasta).toISOString()}`,
    );
  }

  /** Invalida el token cacheado en Redis (forzar re-autenticación en el próximo envío). */
  async invalidateToken(empresaId: number): Promise<void> {
    await this.cache.del(CacheKeys.msellerToken(empresaId));
    this.logger.log(`Token MSeller invalidado para empresa #${empresaId}`);
  }

  // ── Envío de documentos ───────────────────────────────────────────────────

  /**
   * Envía el documento a MSeller.
   *
   * @param payload       JSON del e-CF construido por ECFBuilderService
   * @param empresaId     ID de la empresa (para obtener credenciales)
   * @param timeoutMs     Timeout en ms (default 30s; usar 9000 en POS)
   * @param opts.maxRetries    Reintentos tras el primer intento (default 3).
   *   El camino síncrono del POS pasa 0 — un solo intento, para que el
   *   presupuesto total de la petición quede acotado (~12s: ver
   *   emitir-ecf.use-case.ts); el seguimiento real de lo que no se confirma
   *   a tiempo lo hace ReintentoECFJob (cron), no un reintento aquí adentro.
   * @param opts.authTimeoutMs Timeout de getIdToken (default 10s; 3s en POS).
   *
   * @throws EcfValidacionError    MSeller devolvió 4xx (error de formato/datos)
   * @throws EcfComunicacionError  Timeout, 429 o error 5xx (reintentable)
   */
  async enviarDocumento(
    payload:    MSellerPayload,
    empresaId:  number,
    timeoutMs = 30_000,
    opts?: { maxRetries?: number; authTimeoutMs?: number },
  ): Promise<MSellerEnvioResponse> {
    const { apiKey, baseUrl, envPath } = await this.getIdToken(empresaId, opts?.authTimeoutMs);
    const url = `${baseUrl}/${envPath}/documentos-ecf`;

    // ── Guard: verifica FechaEmision al final (assertEmisorOrder lanza si falla) ─
    assertEmisorOrder(payload.ECF.Encabezado.Emisor as object);

    const jsonString = JSON.stringify(payload, null, 2);
    this.logger.log('=== JSON A ENVIAR A MSELLER ===');
    this.logger.log(jsonString);
    this.logger.log('=== FIN JSON ===');

    return this.withRetry(
      async () => {
        // idToken se resuelve en CADA intento (no una sola vez arriba): si un
        // intento anterior recibió 401/403 y withRetry invalidó el caché, este
        // intento debe mandar un token REALMENTE fresco, no el mismo que ya
        // rechazaron. En el camino feliz es un cache-hit, sin costo real.
        const { idToken } = await this.getIdToken(empresaId, opts?.authTimeoutMs);

        const t0 = Date.now();
        this.logger.log(
          `MSeller POST ${url} [empresa #${empresaId}] ` +
          `eNCF=${payload.ECF.Encabezado.IdDoc.eNCF}`,
        );

        const resp = await firstValueFrom(
          this.http.post<MSellerEnvioResponse>(url, payload, {
            timeout: timeoutMs,
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${idToken}`,
              'X-API-KEY':     apiKey,
            },
          }),
        );

        const ms   = Date.now() - t0;
        const data = resp.data as any;

        // Validar que MSeller devolvió un trackId real (UUID).
        // Si internalTrackId es null/undefined la respuesta tiene un error
        // aunque el HTTP status sea 200.
        if (!data.internalTrackId) {
          const errMsg = data.error ?? data.message ?? data.mensaje
            ?? 'MSeller no devolvió internalTrackId — el documento no fue recibido';
          this.logger.error(
            `MSeller devolvió HTTP 200 pero sin trackId para eNCF=${payload.ECF.Encabezado.IdDoc.eNCF}: ${errMsg}`,
          );
          throw new EcfValidacionError(200, errMsg, data.details ?? data.errores);
        }

        this.logger.log(
          `MSeller OK [${ms}ms] trackId=${data.internalTrackId} ` +
          `secCode=${data.securityCode}`,
        );
        return resp.data;
      },
      empresaId,
      timeoutMs,
      opts?.maxRetries,
    );
  }

  /**
   * Valida el documento en MSeller sin consumir número de secuencia.
   * Útil para detectar errores de formato antes de emitir.
   */
  async validarDocumento(
    payload:   MSellerPayload,
    empresaId: number,
  ): Promise<{ valid: boolean; message: string }> {
    const { idToken, apiKey, baseUrl, envPath } = await this.getIdToken(empresaId);
    const url = `${baseUrl}/${envPath}/documentos-ecf?validate=true`;

    try {
      const resp = await firstValueFrom(
        this.http.post<{ valid: boolean; message: string }>(url, payload, {
          timeout: 15_000,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-API-KEY':     apiKey,
          },
        }),
      );
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const data   = err?.response?.data;
      return {
        valid:   false,
        message: data?.message ?? `Error ${status ?? 'desconocido'}`,
      };
    }
  }

  // ── Consulta de estado ────────────────────────────────────────────────────

  /**
   * Consulta el estado de un documento enviado usando su internalTrackId.
   * Usado por el job de polling para documentos en estado ENVIADO.
   */
  /**
   * Consulta el estado de múltiples e-CFs en un solo request (POST batch).
   * Usa los eNCF directamente — NO requiere trackId.
   * Endpoint: POST /{entorno}/documentos-ecf/status/batch
   */
  async consultarBatch(
    ecfNumeros: string[],
    empresaId:  number,
  ): Promise<MSellerBatchStatusResponse> {
    const { idToken, apiKey, baseUrl, envPath } = await this.getIdToken(empresaId);
    const url = `${baseUrl}/${envPath}/documentos-ecf/status/batch`;

    this.logger.log(`MSeller batch status: ${ecfNumeros.length} e-CFs [empresa #${empresaId}]`);
    this.logger.debug(`Batch eNCFs: ${ecfNumeros.join(', ')}`);

    try {
      const resp = await firstValueFrom(
        this.http.post<MSellerBatchStatusResponse>(
          url,
          { ecfs: ecfNumeros },
          {
            timeout: 30_000,
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${idToken}`,
              'X-API-KEY':     apiKey,
            },
          },
        ),
      );

      this.logger.log(`MSeller batch status OK: total=${resp.data.total}`);
      for (const r of resp.data.results ?? []) {
        this.logger.debug(`  [batch] ecf=${r.ecf} status="${r.status}" found=${r.found}`);
      }
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.message ?? err?.message;
      this.logger.warn(`Error consultarBatch MSeller [${status ?? 'timeout'}]: ${msg}`);
      throw new EcfComunicacionError(`Error batch status MSeller [${status ?? 'timeout'}]: ${msg}`);
    }
  }

  async consultarEstado(
    trackId:   string,
    empresaId: number,
  ): Promise<MSellerEstadoResponse> {
    const { accessToken, apiKey, baseUrl, envPath } = await this.getIdToken(empresaId);
    const url = `${baseUrl}/${envPath}/documentos-ecf/${trackId}`;

    // El endpoint GET /documentos-ecf/{trackId} de MSeller usa solo X-API-KEY
    // para autenticación. Enviar "Authorization: Bearer {jwt}" en este endpoint
    // causa 403 "Invalid key=value pair" en el API Gateway de MSeller.
    // El accessToken (OAuth2 access token) se guarda como fallback por si MSeller
    // actualiza el endpoint para requerirlo en el futuro.
    const t0 = Date.now();
    try {
      const resp = await firstValueFrom(
        this.http.get<MSellerEstadoResponse>(url, {
          timeout: 15_000,
          headers: {
            'X-API-KEY': apiKey,
          },
        }),
      );
      this.logger.log(
        `Estado MSeller ${trackId}: ${resp.data.status} [${Date.now() - t0}ms]`,
      );
      return resp.data;
    } catch (err: any) {
      const status  = err?.response?.status;
      const msg     = err?.response?.data?.message ?? err?.message;

      // Si X-API-KEY solo no funciona (401/403), reintentar con accessToken
      if (status === 401 || status === 403) {
        this.logger.debug(
          `GET estado ${trackId} falló con X-API-KEY solo [${status}]. ` +
          `Reintentando con Authorization: Bearer ${accessToken ? '(token)' : 'MISSING'}`,
        );
        try {
          const resp2 = await firstValueFrom(
            this.http.get<MSellerEstadoResponse>(url, {
              timeout: 15_000,
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-API-KEY':     apiKey,
              },
            }),
          );
          this.logger.log(
            `Estado MSeller ${trackId}: ${resp2.data.status} [${Date.now() - t0}ms] (accessToken fallback)`,
          );
          return resp2.data;
        } catch (err2: any) {
          const s2 = err2?.response?.status;
          const m2 = err2?.response?.data?.message ?? err2?.message;
          throw new EcfComunicacionError(
            `Error consultando estado en MSeller [${s2 ?? 'timeout'}]: ${m2}`,
          );
        }
      }

      throw new EcfComunicacionError(
        `Error consultando estado en MSeller [${status ?? 'timeout'}]: ${msg}`,
      );
    }
  }

  // ── Retry con backoff exponencial ─────────────────────────────────────────

  private async withRetry<T>(
    fn:         () => Promise<T>,
    empresaId:  number,
    timeoutMs:  number,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error = new EcfComunicacionError('Error desconocido');
    // 401/403: un solo reintento con token fresco, FUERA del contador de
    // maxRetries — así funciona también con maxRetries=0 (POS). Antes el
    // bucket 4xx de abajo corría primero y lo convertía en EcfValidacionError
    // (RECHAZADO) sin llegar nunca al chequeo de 401 de más abajo, que por
    // eso era código muerto (hotfix 2026-10-07, FAC-1705: errorEnvio="MSeller
    // rechazó el documento [403]: Forbidden" — un token rechazado por MSeller,
    // no un rechazo real de DGII).
    let tokenRenovadoPorAuth = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;

        // ── 429: throttling, NUNCA un rechazo real ──────────────────────
        // Antes caía en el bucket 4xx de abajo → EcfValidacionError → el
        // e-CF quedaba RECHAZADO permanentemente por un simple "espera un
        // poco" del proveedor (hotfix 2026-10-07). Abre el circuit breaker
        // global y responde como comunicación (reintentable, nunca rechazo):
        // el e-CF queda pendiente_envio y el cron lo reintenta cuando el
        // circuito cierre — sin reintentar aquí mismo, de inmediato.
        if (status === 429) {
          await this.abrirCircuitoGlobalMSeller(err);
          throw new EcfComunicacionError(
            `MSeller: 429 Too Many Requests — circuito abierto, no se reintenta de inmediato.`,
          );
        }

        // ── 401/403: token inválido/vencido para ESTA llamada, aunque
        // getIdToken lo haya devuelto como "vigente" — nunca un rechazo real
        // de DGII. Un solo reintento inmediato tras invalidar el caché; si
        // persiste incluso con token fresco, no es un problema de token sino
        // de MSeller — abre el mismo circuito global que el 429 en vez de
        // seguir insistiendo.
        if ((status === 401 || status === 403) && !tokenRenovadoPorAuth) {
          tokenRenovadoPorAuth = true;
          this.logger.warn(`Token rechazado [${status}] para empresa #${empresaId} — invalidando y reintentando una vez con token fresco...`);
          await this.invalidateToken(empresaId);
          attempt -= 1; // neutraliza el ++ del for: no cuenta contra maxRetries
          continue;
        }
        if ((status === 401 || status === 403) && tokenRenovadoPorAuth) {
          await this.abrirCircuitoGlobalMSeller(err);
          throw new EcfComunicacionError(
            `MSeller: ${status} persistente tras renovar el token — circuito abierto, no se reintenta de inmediato.`,
          );
        }

        // ── Errores 4xx restantes: validación / datos incorrectos → NO reintentar ──
        if (status && status >= 400 && status < 500) {
          const data   = err?.response?.data;
          const msg    = data?.message ?? err?.message ?? 'Error de validación';
          const detalles = data?.details?.validationErrors;
          throw new EcfValidacionError(status, msg, detalles);
        }

        lastError = err;

        if (attempt < maxRetries) {
          const delay = RETRY_DELAYS[attempt] ?? 4_000;
          this.logger.warn(
            `MSeller fallo intento ${attempt + 1}/${maxRetries + 1} ` +
            `[${status ?? 'timeout'}]. Reintento en ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw new EcfComunicacionError(
      `MSeller no disponible después de ${maxRetries + 1} intentos: ${lastError?.message ?? 'error desconocido'}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
