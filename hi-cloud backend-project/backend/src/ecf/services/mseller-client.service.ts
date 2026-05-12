import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EcfConfigService } from './ecf-config.service';
import type { MSellerPayload } from './ecf-builder.service';
import { assertEmisorOrder } from '../builders/sections/emisor.section';
import {
  EcfComunicacionError,
  EcfValidacionError,
} from '../errors/ecf.errors';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';

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

interface TokenCacheEntry {
  idToken:     string;
  refreshToken: string;
  expiresAt:   Date;
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

  /** Caché de tokens por empresaId. En producción multi-instancia usar Redis. */
  private readonly tokenCache = new Map<number, TokenCacheEntry>();

  constructor(
    private readonly http:           HttpService,
    private readonly ecfConfigSvc:   EcfConfigService,
  ) {}

  // ── Autenticación ─────────────────────────────────────────────────────────

  /**
   * Devuelve un idToken válido para la empresa.
   * Usa caché en memoria; renueva si está a < 2 min de expirar.
   */
  async getIdToken(empresaId: number): Promise<{
    idToken: string;
    apiKey:  string;
    baseUrl: string;
    envPath: string;
  }> {
    const creds = await this.ecfConfigSvc.getCredencialesDescifradas(empresaId);

    // Verificar caché — los tokens de MSeller duran ~1 hora
    const cached = this.tokenCache.get(empresaId);
    if (cached && cached.expiresAt > new Date(Date.now() + 2 * 60_000)) {
      return {
        idToken: cached.idToken,
        apiKey:  creds.apiKey,
        baseUrl: creds.urlBase,
        envPath: creds.envPath,
      };
    }

    // Obtener nuevo token
    const authUrl = `${creds.urlBase}/${creds.envPath}/customer/authentication`;
    this.logger.log(`Autenticando en MSeller: ${authUrl} [empresa #${empresaId}]`);

    const t0 = Date.now();
    try {
      const resp = await firstValueFrom(
        this.http.post<MSellerAuthResponse>(
          authUrl,
          { email: creds.email, password: creds.password },
          { timeout: 10_000, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const { idToken, refreshToken } = resp.data;
      // Asumir expiración de 55 min (conservador, Cognito emite tokens de 1h)
      this.tokenCache.set(empresaId, {
        idToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 55 * 60_000),
      });

      this.logger.log(`Auth MSeller OK [${Date.now() - t0}ms] empresa #${empresaId}`);
      return { idToken, apiKey: creds.apiKey, baseUrl: creds.urlBase, envPath: creds.envPath };
    } catch (err: any) {
      this.tokenCache.delete(empresaId); // limpiar caché si falla
      const status = err?.response?.status;
      const msg    = err?.response?.data?.message ?? err?.message ?? 'timeout';
      throw new EcfComunicacionError(
        `No se pudo autenticar con MSeller [${status ?? 'timeout'}]: ${msg}`,
      );
    }
  }

  /** Invalida el token cacheado (forzar re-autenticación en el próximo envío). */
  invalidateToken(empresaId: number): void {
    this.tokenCache.delete(empresaId);
    this.logger.log(`Token MSeller invalidado para empresa #${empresaId}`);
  }

  // ── Envío de documentos ───────────────────────────────────────────────────

  /**
   * Envía el documento a MSeller.
   *
   * @param payload       JSON del e-CF construido por ECFBuilderService
   * @param empresaId     ID de la empresa (para obtener credenciales)
   * @param timeoutMs     Timeout en ms (default 30s; usar 8000 en POS)
   *
   * @throws EcfValidacionError    MSeller devolvió 4xx (error de formato/datos)
   * @throws EcfComunicacionError  Timeout o error 5xx (reintentable)
   */
  async enviarDocumento(
    payload:    MSellerPayload,
    empresaId:  number,
    timeoutMs = 30_000,
  ): Promise<MSellerEnvioResponse> {
    const { idToken, apiKey, baseUrl, envPath } = await this.getIdToken(empresaId);
    const url = `${baseUrl}/${envPath}/documentos-ecf`;

    // ── Guard: verifica FechaEmision al final (assertEmisorOrder lanza si falla) ─
    assertEmisorOrder(payload.ECF.Encabezado.Emisor as object);

    const jsonString = JSON.stringify(payload, null, 2);
    this.logger.log('=== JSON A ENVIAR A MSELLER ===');
    this.logger.log(jsonString);
    this.logger.log('=== FIN JSON ===');

    return this.withRetry(
      async () => {
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
  async consultarEstado(
    trackId:   string,
    empresaId: number,
  ): Promise<MSellerEstadoResponse> {
    const { idToken, apiKey, baseUrl, envPath } = await this.getIdToken(empresaId);
    const url = `${baseUrl}/${envPath}/documentos-ecf/${trackId}`;

    const t0 = Date.now();
    try {
      const resp = await firstValueFrom(
        this.http.get<MSellerEstadoResponse>(url, {
          timeout: 15_000,
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'X-API-KEY':     apiKey,
          },
        }),
      );
      this.logger.log(
        `Estado MSeller ${trackId}: ${resp.data.status} [${Date.now() - t0}ms]`,
      );
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.message ?? err?.message;
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

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;

        // ── Errores 4xx: validación / datos incorrectos → NO reintentar ──
        if (status && status >= 400 && status < 500) {
          const data   = err?.response?.data;
          const msg    = data?.message ?? err?.message ?? 'Error de validación';
          const detalles = data?.details?.validationErrors;
          throw new EcfValidacionError(status, msg, detalles);
        }

        // ── 401: token expirado → invalidar caché y reintentar una vez ───
        if (status === 401) {
          this.logger.warn(`Token expirado para empresa #${empresaId}, invalidando...`);
          this.invalidateToken(empresaId);
          if (attempt === 0) continue; // reintentar inmediatamente
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
