import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueuesService } from './queues.service';
import { PdfProcessor }   from './pdf.processor';
import { EmailProcessor }  from './email.processor';

/**
 * Módulo central de colas BullMQ.
 * En producción: requiere Redis (REDIS_URL en .env)
 * En desarrollo sin Redis: el módulo carga pero las colas
 * no procesan jobs — usar la ejecución síncrona de fallback.
 *
 * Colas disponibles:
 *  - 'pdf'           → generación de PDFs (Puppeteer, 3-8s)
 *  - 'email'         → envío de correos SMTP
 *  - 'notificaciones'→ push notifications masivas
 *  - 'ecf-retry'     → reintento automático de e-CFs rechazados
 *  - 'reportes'      → generación de reportes 606/607 y Excel
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          // Sin Redis: Bull usa conexión localhost por defecto
          // Las colas funcionarán si hay Redis local, sino fallarán silenciosamente
          return { redis: { host: 'localhost', port: 6379 } };
        }
        return { url: redisUrl };
      },
    }),
    BullModule.registerQueue(
      { name: 'pdf' },
      { name: 'email' },
      { name: 'notificaciones' },
      { name: 'ecf-retry' },
      { name: 'reportes' },
    ),
  ],
  providers: [QueuesService, PdfProcessor, EmailProcessor],
  exports:   [QueuesService, BullModule],
})
export class QueuesModule {}
