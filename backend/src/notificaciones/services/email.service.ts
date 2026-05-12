import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailPayload {
  to:       string | string[];
  subject:  string;
  html:     string;
  text?:    string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    this.inicializarTransporter();
  }

  private inicializarTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS', '');

    // Detectar valores placeholder que no son credenciales reales
    const esPlaceholder = !host || !user
      || user.includes('tu_email')
      || user.includes('example')
      || pass.includes('tu_contraseña')
      || pass.includes('app_password');

    if (esPlaceholder) {
      this.logger.warn(
        'SMTP no configurado o usando valores placeholder. ' +
        'Configure SMTP_HOST, SMTP_USER y SMTP_PASS en el .env para envío real de correos.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port:   Number(this.configService.get('SMTP_PORT', '587')),
      secure: this.configService.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user,
        pass: this.configService.get<string>('SMTP_PASS', ''),
      },
    });
  }

  async enviar(payload: EmailPayload): Promise<{ exitoso: boolean; error?: string }> {
    const from = this.configService.get<string>(
      'SMTP_FROM',
      'HiCloud ERP <no-reply@hicloud.com>',
    );

    if (!this.transporter) {
      // Modo sin SMTP — mostrar en consola para desarrollo
      this.logger.log(
        `[EMAIL-SIMULADO] Para: ${payload.to} | Asunto: ${payload.subject}`,
      );
      return { exitoso: true };
    }

    try {
      await this.transporter.sendMail({
        from,
        to:      Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        subject: payload.subject,
        html:    payload.html,
        text:    payload.text,
      });
      this.logger.log(`Email enviado a: ${payload.to} — ${payload.subject}`);
      return { exitoso: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Error enviando email: ${msg}`);
      return { exitoso: false, error: msg };
    }
  }

  async verificarConexion(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
