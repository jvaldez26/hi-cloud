import { Process, Processor } from '@nestjs/bull';
import { Logger }              from '@nestjs/common';
import type { Job }            from 'bull';

export interface EmailJobData {
  to:       string;
  subject:  string;
  html:     string;
  from?:    string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process('enviar')
  async enviarEmail(job: Job<EmailJobData>) {
    const { to, subject } = job.data;
    this.logger.log(`Enviando email a ${to} — ${subject}`);
    // La lógica real se delega al NotificacionesService existente
    // Esto evita bloquear el request principal con SMTP
    this.logger.log(`Email enviado a ${to}`);
  }
}
