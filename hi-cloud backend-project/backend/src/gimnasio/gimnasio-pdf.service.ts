import { Injectable, Logger } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

@Injectable()
export class GimnasioPdfService {
  private readonly logger = new Logger(GimnasioPdfService.name);

  async generarRutinaPdf(rutina: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('RUTINA DE ENTRENAMIENTO', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).font('Helvetica')
          .text(`Miembro: ${rutina.miembroNombre ?? ''}`)
          .text(`Entrenador: ${rutina.entrenadorNombre ?? 'N/A'}`)
          .text(`Objetivo: ${rutina.objetivo ?? ''}`)
          .text(`Nivel: ${rutina.nivel ?? ''}`)
          .text(`Duración: ${rutina.duracionSemanas ?? 4} semanas (${rutina.diasSemana ?? 3} días/sem)`);
        doc.moveDown();

        for (const dia of (rutina.dias ?? [])) {
          doc.fontSize(14).font('Helvetica-Bold').text(`DÍA ${dia.numeroDia} — ${dia.nombre ?? ''}`);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica');
          const y0 = doc.y;
          doc.text('Ejercicio', 40, y0, { width: 200, lineBreak: false });
          doc.text('Series', 240, y0, { width: 60, lineBreak: false });
          doc.text('Reps', 300, y0, { width: 80, lineBreak: false });
          doc.text('Descanso', 380, y0, { width: 80 });
          doc.moveDown(0.5);
          for (const ej of (dia.ejercicios ?? [])) {
            const y1 = doc.y;
            doc.text(ej.nombre ?? '', 40, y1, { width: 200, lineBreak: false });
            doc.text(String(ej.series ?? '-'), 240, y1, { width: 60, lineBreak: false });
            doc.text(ej.repeticiones ?? '-', 300, y1, { width: 80, lineBreak: false });
            doc.text(ej.descansoSegundos ? `${ej.descansoSegundos}s` : '-', 380, y1, { width: 80 });
            doc.moveDown(0.4);
          }
          doc.moveDown();
        }

        doc.fontSize(10).font('Helvetica-Oblique')
          .text('Indicaciones: Calentar 10 min antes. Hidratarse constantemente. Descanso 60-90s entre series.');
        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF rutina', err);
        reject(err);
      }
    });
  }

  async generarNutricionPdf(plan: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(20).font('Helvetica-Bold').text('PLAN NUTRICIONAL', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).font('Helvetica')
          .text(`Miembro: ${plan.miembroNombre ?? ''}`)
          .text(`Objetivo: ${plan.caloriasObjetivo ?? '-'} kcal/día`)
          .text(`Proteínas: ${plan.proteinasGramos ?? '-'}g | Carbs: ${plan.carbohidratosGramos ?? '-'}g | Grasas: ${plan.grasasGramos ?? '-'}g`);
        doc.moveDown();

        for (const comida of (plan.comidas ?? [])) {
          doc.fontSize(13).font('Helvetica-Bold')
            .text(`${comida.nombre}${comida.hora ? ' (' + comida.hora + ')' : ''}${comida.caloriasTotal ? ' — ' + comida.caloriasTotal + ' kcal' : ''}`);
          doc.fontSize(10).font('Helvetica');
          const alimentos: any[] = Array.isArray(comida.alimentos) ? comida.alimentos : [];
          for (const alimento of alimentos) {
            doc.text(`• ${alimento.nombre ?? ''} — ${alimento.cantidad ?? ''}`);
          }
          doc.moveDown(0.5);
        }

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF nutrición', err);
        reject(err);
      }
    });
  }
}
