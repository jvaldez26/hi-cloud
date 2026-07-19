import {
  Controller, Post, Param, ParseIntPipe,
  Headers, Body, Req,
  UnauthorizedException, BadRequestException,
  HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { EcfEncryptionService } from '../services/ecf-encryption.service';
import { EcfEfectosNcService } from '../services/ecf-efectos-nc.service';
import { reportServiceError } from '../../common/observability/sentry';

/**
 * Payload que MSeller envía en notificaciones webhook.
 * El shape exacto depende de MSeller; ajustar según documentación oficial.
 */
interface MSellerWebhookPayload {
  internalTrackId: string;
  ecf:             string;       // eNCF afectado
  status:          string;       // ACEPTADO | RECHAZADO | OBSERVADO
  rnc?:            string;
  message?:        string;
  details?:        unknown;
  timestamp?:      string;
}

const MSELLER_ESTADO_MAP: Record<string, EstadoDGII> = {
  ACEPTADO:   EstadoDGII.ACEPTADO,
  RECHAZADO:  EstadoDGII.RECHAZADO,
  OBSERVADO:  EstadoDGII.OBSERVADO,
};

/**
 * Webhook público para recibir notificaciones de MSeller sobre cambios de
 * estado de e-CFs.  Autenticado con HMAC-SHA256 usando un secreto por empresa.
 *
 * URL: POST /api/v1/ecf/webhook/:empresaId
 * Header: X-MSeller-Signature: sha256=<hex>
 */
@ApiTags('e-CF Webhook (MSeller → HiCloud)')
@Controller('ecf/webhook')
export class EcfWebhookController {
  private readonly logger = new Logger(EcfWebhookController.name);

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    @InjectRepository(EmpresaEcfConfig)
    private readonly configRepo: Repository<EmpresaEcfConfig>,

    private readonly encryption: EcfEncryptionService,
    private readonly efectosNc: EcfEfectosNcService,
  ) {}

  @Post(':empresaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook MSeller — notificación de cambio de estado de un e-CF',
  })
  async recibirNotificacion(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Headers('x-mseller-signature') signature: string | undefined,
    @Body() payload: MSellerWebhookPayload,
    @Req() req: any,
  ) {
    // ── 1. Validar firma HMAC (fail-CLOSED: rechazar si NO se puede probar firma válida) ──
    const config = await this.configRepo.findOne({
      where: { empresaId, activo: true },
    });

    if (!config) {
      throw new BadRequestException(`Empresa #${empresaId} sin configuración e-CF`);
    }

    // A) Sin clave HMAC configurada → no se puede verificar → 401.
    //    Es una anomalía operacional: MSeller envía webhooks para una empresa cuya clave
    //    no está en BD. Reportar a Sentry para investigación.
    if (!config.msellerApiKeyEnc) {
      reportServiceError(
        new Error(`Webhook recibido para empresa #${empresaId} sin msellerApiKeyEnc configurada`),
        'webhook_sin_clave_hmac',
        { empresaId: String(empresaId) },
      );
      this.logger.warn(`Webhook empresa #${empresaId}: msellerApiKeyEnc no configurado — rechazado`);
      throw new UnauthorizedException('Empresa sin clave HMAC configurada para verificar webhook');
    }

    // B) Header de firma ausente → 401.
    if (!signature) {
      this.logger.warn(`Webhook empresa #${empresaId}: header x-mseller-signature ausente — rechazado`);
      throw new UnauthorizedException('Header x-mseller-signature requerido');
    }

    // C) rawBody no disponible → bug de configuración de middleware → 401 + error en log.
    //    Si este log aparece en producción, significa que express.json({ verify }) no está
    //    montado correctamente en main.ts — es un error de infraestructura, no del caller.
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      this.logger.error(
        `Webhook empresa #${empresaId}: rawBody no disponible — ` +
        `verificar que express.json({ verify: (req,_,buf)=>req.rawBody=buf }) esté en main.ts`,
      );
      throw new UnauthorizedException('No se puede verificar la firma: rawBody no disponible');
    }

    // D) Verificación HMAC con comparación en tiempo constante.
    //    Cualquier excepción (incluidas las de crypto) → 401 + captureException.
    //    Nunca continuar tras un error de verificación (fail-closed ante lo inesperado).
    try {
      const apiKey   = this.encryption.decrypt(config.msellerApiKeyEnc);
      const expected = `sha256=${createHmac('sha256', apiKey).update(rawBody).digest('hex')}`;
      const sigBuf   = Buffer.from(signature);
      const expBuf   = Buffer.from(expected);
      // timingSafeEqual lanza TypeError si los buffers tienen distinta longitud.
      // Verificar longitud primero evita esa excepción y también previene timing leak.
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        this.logger.warn(`Firma HMAC inválida en webhook empresa #${empresaId}`);
        throw new UnauthorizedException('Firma HMAC inválida');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Error inesperado de crypto/descifrado — reportar y rechazar.
      reportServiceError(err, 'webhook_hmac_error', { empresaId: String(empresaId) });
      this.logger.error(
        `Error al verificar HMAC webhook empresa #${empresaId}: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Error al verificar firma HMAC');
    }

    // ── 2. Buscar el comprobante por trackId o eNCF ───────────────────────
    const { internalTrackId, ecf: encf, status, message } = payload;

    if (!internalTrackId && !encf) {
      throw new BadRequestException('Payload sin internalTrackId ni eNCF');
    }

    const comprobante = await this.ecfRepo.findOne({
      where: [
        { trackId: internalTrackId, empresaId },
        { numero: encf, empresaId },
      ].filter(Boolean) as any,
    });

    if (!comprobante) {
      this.logger.warn(
        `Webhook: comprobante no encontrado [trackId=${internalTrackId} | eNCF=${encf}] ` +
        `empresa #${empresaId}`,
      );
      // Devolver 200 de todas formas (idempotente)
      return { ok: true, mensaje: 'Comprobante no registrado — ignorado' };
    }

    // ── 3. Idempotencia — si ya tiene estado definitivo, ignorar ─────────
    const estadosDefinitivos = [
      EstadoDGII.ACEPTADO,
      EstadoDGII.RECHAZADO,
      EstadoDGII.OBSERVADO,
    ];
    if (estadosDefinitivos.includes(comprobante.estadoDGII)) {
      this.logger.debug(
        `Webhook duplicado para ${comprobante.numero} (ya está ${comprobante.estadoDGII})`,
      );
      return { ok: true, mensaje: 'Estado ya procesado — evento duplicado ignorado' };
    }

    // ── 4. Actualizar estado ──────────────────────────────────────────────
    const estadoNuevo = MSELLER_ESTADO_MAP[status?.toUpperCase()] ?? EstadoDGII.ENVIADO;
    const esDefinitivo = estadosDefinitivos.includes(estadoNuevo);

    await this.ecfRepo.update(comprobante.id, {
      estadoDGII:    estadoNuevo,
      respuestaDgii: payload as any,
      ...(estadoNuevo === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
    } as any);

    // ── 5. Registrar eventos ──────────────────────────────────────────────
    await this.eventoRepo.save(
      this.eventoRepo.create({
        comprobanteId: comprobante.id,
        evento:        TipoEcfEvento.RESPUESTA_RECIBIDA,
        payload:       { via: 'webhook', status, internalTrackId, timestamp: payload.timestamp },
        mensaje:       message,
      }),
    );

    if (esDefinitivo) {
      await this.eventoRepo.save(
        this.eventoRepo.create({
          comprobanteId: comprobante.id,
          evento:        TipoEcfEvento.ESTADO_CAMBIADO,
          payload:       {
            de: comprobante.estadoDGII,
            a:  estadoNuevo,
            via: 'webhook',
          },
          mensaje: `MSeller notificó: ${status}`,
        }),
      );
    }

    this.logger.log(
      `Webhook procesado | ${comprobante.numero} | ${comprobante.estadoDGII} → ${estadoNuevo} | empresa #${empresaId}`,
    );

    // Aplicar/revertir efectos sobre la factura si es NC de anulación total
    if (esDefinitivo) {
      this.efectosNc.aplicarEfectosPorEstado(comprobante, estadoNuevo).catch(err =>
        this.logger.error(`[Webhook] Error aplicando efectos NC ${comprobante.numero}: ${(err as Error).message}`),
      );
    }

    return { ok: true, estadoActualizado: estadoNuevo };
  }
}
