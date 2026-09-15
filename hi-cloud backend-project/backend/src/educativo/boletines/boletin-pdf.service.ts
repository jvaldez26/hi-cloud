import { Injectable, Logger } from '@nestjs/common';
import { altoDeLinea, celdaSinEnvolver } from '../../common/pdf/columnas-numericas.helper';

/**
 * PDF del boletín de calificaciones — PDFKit, nunca Puppeteer (ver
 * feedback_pdfkit_barcode_trampas y el resto de *-pdf.service.ts del
 * proyecto). Un solo renderer (`dibujarBoletin`) sirve tanto para el
 * boletín individual como para el masivo de una sección — el masivo solo
 * llama `doc.addPage()` entre estudiante y estudiante sobre el MISMO
 * PDFDocument, así que es literalmente el mismo dibujo N veces.
 */
@Injectable()
export class BoletinPdfService {
  private readonly logger = new Logger(BoletinPdfService.name);

  private dibujarBoletin(doc: any, datos: any) {
    const { config: cfg, estudiante, matricula, periodos, asignaturas, promedioGeneral, asistencia, tutorPrincipal } = datos;
    const PL = 50, PR = 545, W = PR - PL;

    // ── Encabezado ────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(15).text(cfg.nombreCentro ?? 'Centro Educativo', PL, 45, { width: W, align: 'center' });
    if (cfg.codigoMinerd) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555')
        .text(`Código MINERD: ${cfg.codigoMinerd}`, PL, 65, { width: W, align: 'center' });
      doc.fillColor('black');
    }
    doc.font('Helvetica-Bold').fontSize(12).text('BOLETÍN DE CALIFICACIONES', PL, cfg.codigoMinerd ? 82 : 68, { width: W, align: 'center' });
    doc.moveTo(PL, 100).lineTo(PR, 100).stroke('#334155');
    doc.y = 110;

    // ── Datos del estudiante ─────────────────────────────────────────────
    const datoRow = (label: string, value: string, x: number, w: number, y: number) => {
      doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, x, y, { continued: true, width: w });
      doc.font('Helvetica').text(value ?? '—');
    };
    const y0 = doc.y;
    datoRow('Estudiante', `${estudiante.apellidos}, ${estudiante.nombres}`, PL, 300, y0);
    datoRow('Matrícula', estudiante.matricula ?? '—', PL + 300, 195, y0);
    datoRow('Grado', matricula.gradoNombre ?? '—', PL, 300, y0 + 16);
    datoRow('Sección', matricula.seccionNombre ?? '—', PL + 300, 195, y0 + 16);
    doc.y = y0 + 34;
    doc.moveDown(0.3);

    // ── Tabla de calificaciones ──────────────────────────────────────────
    const colAsig = 165;
    const colFinal = 60;
    const colPeriodo = periodos.length ? (W - colAsig - colFinal) / periodos.length : 0;
    const headers = ['Asignatura', ...periodos.map((p: any) => p.nombre), 'Final'];
    const widths = [colAsig, ...periodos.map(() => colPeriodo), colFinal];
    const ROW_H = 18;
    const lineH = altoDeLinea(doc, 'Helvetica', 8);

    let ty = doc.y;
    doc.rect(PL, ty, W, ROW_H).fill('#1e3a5f');
    let tx = PL;
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h.toUpperCase(), tx + 4, ty + 5, celdaSinEnvolver(widths[i] - 8, i === 0 ? 'left' : 'center', lineH));
      tx += widths[i];
    });
    doc.fillColor('black');
    ty += ROW_H;

    const fmtNota = (nota: number | null, letra?: string | null) => {
      if (nota === null || nota === undefined) return '—';
      const num = Number(nota).toFixed(2).replace(/\.00$/, '');
      return letra ? `${num} (${letra})` : num;
    };

    asignaturas.forEach((asig: any, i: number) => {
      if (ty + ROW_H > 740) { doc.addPage(); ty = 50; }
      const bg = i % 2 === 0 ? '#ffffff' : '#f4f6fb';
      doc.rect(PL, ty, W, ROW_H).fill(bg).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
      doc.lineWidth(1);
      let cx = PL;
      doc.fillColor('black').font('Helvetica').fontSize(8);
      doc.text(asig.nombre, cx + 4, ty + 5, celdaSinEnvolver(colAsig - 8, 'left', lineH));
      cx += colAsig;
      asig.porPeriodo.forEach((nota: number | null) => {
        doc.text(fmtNota(nota), cx + 4, ty + 5, celdaSinEnvolver(colPeriodo - 8, 'center', lineH));
        cx += colPeriodo;
      });
      doc.font('Helvetica-Bold').text(fmtNota(asig.final, asig.finalLetra), cx + 4, ty + 5, celdaSinEnvolver(colFinal - 8, 'center', lineH));
      ty += ROW_H;
    });
    if (!asignaturas.length) {
      doc.rect(PL, ty, W, 24).fill('#f4f6fb');
      doc.fillColor('#666666').font('Helvetica').fontSize(9)
        .text('Este grado no tiene pensum configurado.', PL, ty + 7, { width: W, align: 'center' });
      doc.fillColor('black');
      ty += 24;
    }
    doc.y = ty + 10;

    // ── Promedio general ──────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11)
      .text(`Promedio general: ${promedioGeneral !== null && promedioGeneral !== undefined ? Number(promedioGeneral).toFixed(2) : '— (faltan notas por consolidar)'}`, PL, doc.y);
    doc.moveDown(0.8);

    // ── Asistencia ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).text('Resumen de asistencia', PL, doc.y);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).text(
      `Presente: ${asistencia.presente ?? 0}    Ausente: ${asistencia.ausente ?? 0}    Tardanza: ${asistencia.tardanza ?? 0}    Justificado: ${asistencia.justificado ?? 0}`,
      PL,
    );
    doc.moveDown(0.8);

    // ── Observaciones ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).text('Observaciones', PL, doc.y);
    doc.moveDown(0.2);
    const obsY = doc.y;
    doc.rect(PL, obsY, W, 45).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.y = obsY + 50;

    // ── Firmas ─────────────────────────────────────────────────────────────
    if (doc.y > 700) { doc.addPage(); doc.y = 50; }
    const sigY = doc.y + 15;
    doc.moveTo(PL, sigY).lineTo(PL + 220, sigY).stroke('#334155');
    doc.moveTo(PR - 220, sigY).lineTo(PR, sigY).stroke('#334155');
    doc.font('Helvetica').fontSize(8)
      .text(tutorPrincipal ? `${tutorPrincipal.apellidos}, ${tutorPrincipal.nombres}` : ' ', PL, sigY + 3, { width: 220, align: 'center' })
      .text('Firma del padre, madre o tutor', PL, sigY + 14, { width: 220, align: 'center' })
      .text(' ', PR - 220, sigY + 3, { width: 220, align: 'center' })
      .text('Firma del director(a)', PR - 220, sigY + 14, { width: 220, align: 'center' });
  }

  async boletinIndividual(datos: any): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        this.dibujarBoletin(doc, datos);
        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generando PDF de boletín: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }

  /** Un PDF, una página por estudiante — orden ya viene decidido por el caller. */
  async boletinesMasivo(listaDatos: any[]): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 }, autoFirstPage: false });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        for (const datos of listaDatos) {
          doc.addPage();
          this.dibujarBoletin(doc, datos);
        }
        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generando PDF masivo de boletines: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }
}
