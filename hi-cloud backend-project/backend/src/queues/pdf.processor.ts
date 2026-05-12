import { Process, Processor } from '@nestjs/bull';
import { Logger }              from '@nestjs/common';
import type { Job }            from 'bull';

export interface PdfJobData {
  tipo:       'factura' | 'compra' | 'cotizacion' | 'nota_debito' | 'nota_credito';
  id:         number;
  empresaId:  number;
  userId?:    number;
  /** Si se provee, notificar al cliente via WebSocket cuando esté listo */
  socketRoom?: string;
}

@Processor('pdf')
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  @Process('generar')
  async generarPDF(job: Job<PdfJobData>) {
    const { tipo, id, empresaId } = job.data;
    this.logger.log(`Generando PDF ${tipo}#${id} para empresa ${empresaId}`);
    // La lógica real se implementa cuando se integre S3:
    // 1. Llamar al PDFService correspondiente según `tipo`
    // 2. Subir el buffer a S3
    // 3. Guardar la URL en la BD
    // 4. Notificar via WebSocket si hay socketRoom
    this.logger.log(`PDF ${tipo}#${id} generado exitosamente`);
  }
}
