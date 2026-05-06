import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp Business API — placeholder listo para integrar con:
 * - Meta Cloud API (developers.facebook.com/docs/whatsapp)
 * - Twilio WhatsApp Sandbox
 * - 360dialog
 * - Ultramsg
 *
 * Configura en .env:
 *   WHATSAPP_API_URL=https://api.ultramsg.com/instance123
 *   WHATSAPP_TOKEN=tu_token
 *   WHATSAPP_FROM=18099999999
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiUrl:  string | undefined;
  private readonly token:   string | undefined;
  private readonly from:    string | undefined;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get('WHATSAPP_API_URL');
    this.token  = this.configService.get('WHATSAPP_TOKEN');
    this.from   = this.configService.get('WHATSAPP_FROM');
  }

  get estaConfigurado(): boolean {
    return !!(this.apiUrl && this.token);
  }

  async enviarMensaje(
    telefono: string,
    mensaje:  string,
  ): Promise<{ exitoso: boolean; error?: string }> {
    if (!this.estaConfigurado) {
      this.logger.log(
        `[WHATSAPP-SIMULADO] Para: ${telefono} | Mensaje: ${mensaje.substring(0, 80)}…`,
      );
      return { exitoso: true };
    }

    try {
      const response = await fetch(`${this.apiUrl}/messages/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          to:    `${telefono}@c.us`,
          body:  mensaje,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      this.logger.log(`WhatsApp enviado a: ${telefono}`);
      return { exitoso: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Error WhatsApp: ${msg}`);
      return { exitoso: false, error: msg };
    }
  }
}
