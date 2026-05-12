import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { PdfJobData }   from './pdf.processor';
import type { EmailJobData } from './email.processor';

/**
 * Servicio centralizado para encolar tareas asíncronas.
 * Uso en cualquier servicio:
 *
 *   constructor(private queues: QueuesService) {}
 *
 *   await this.queues.encolarPDF({ tipo: 'factura', id: 42, empresaId: 1 });
 *   await this.queues.encolarEmail({ to: 'x@y.com', subject: '...', html: '...' });
 *
 * Si Redis no está disponible, los métodos fallan silenciosamente
 * (el flujo principal nunca se bloquea por un error de cola).
 */
@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @Optional() @InjectQueue('pdf')           private pdfQueue?:            Queue,
    @Optional() @InjectQueue('email')         private emailQueue?:          Queue,
    @Optional() @InjectQueue('notificaciones')private notifQueue?:          Queue,
    @Optional() @InjectQueue('ecf-retry')     private ecfRetryQueue?:       Queue,
    @Optional() @InjectQueue('reportes')      private reportesQueue?:       Queue,
  ) {}

  async encolarPDF(data: PdfJobData, opts?: { delay?: number; priority?: number }) {
    try {
      await this.pdfQueue?.add('generar', data, {
        attempts:     3,
        backoff:      { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        ...opts,
      });
    } catch (e: any) {
      this.logger.warn(`No se pudo encolar PDF: ${e.message}`);
    }
  }

  async encolarEmail(data: EmailJobData) {
    try {
      await this.emailQueue?.add('enviar', data, {
        attempts:     3,
        backoff:      { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
      });
    } catch (e: any) {
      this.logger.warn(`No se pudo encolar email: ${e.message}`);
    }
  }

  async encolarReintentarECF(ecfId: number, empresaId: number, delay = 60_000) {
    try {
      await this.ecfRetryQueue?.add('reintentar', { ecfId, empresaId }, {
        delay,      // esperar N ms antes de reintentar
        attempts:   5,
        backoff:    { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
      });
    } catch (e: any) {
      this.logger.warn(`No se pudo encolar reintento ECF: ${e.message}`);
    }
  }

  async encolarReporte(tipo: string, params: Record<string, unknown>, empresaId: number) {
    try {
      await this.reportesQueue?.add('generar', { tipo, params, empresaId }, {
        attempts: 2,
        removeOnComplete: true,
      });
    } catch (e: any) {
      this.logger.warn(`No se pudo encolar reporte: ${e.message}`);
    }
  }

  /** Estado de las colas para monitoreo */
  async getStatus() {
    const queues = [
      { name: 'pdf',            queue: this.pdfQueue },
      { name: 'email',          queue: this.emailQueue },
      { name: 'notificaciones', queue: this.notifQueue },
      { name: 'ecf-retry',      queue: this.ecfRetryQueue },
      { name: 'reportes',       queue: this.reportesQueue },
    ];

    const status = await Promise.all(queues.map(async ({ name, queue }) => {
      if (!queue) return { name, activa: false };
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        return { name, activa: true, waiting, active, completed, failed };
      } catch {
        return { name, activa: false };
      }
    }));

    return status;
  }
}
