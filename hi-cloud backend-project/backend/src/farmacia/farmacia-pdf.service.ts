import { Injectable, Logger } from '@nestjs/common';
import { fechaHoraRD, fechaTextoRD, fechaYHoraRD } from '../common/utils/fecha-local.util';

@Injectable()
export class FarmaciaPdfService {
  private readonly logger = new Logger(FarmaciaPdfService.name);

  private async buildBuffer(fn: (doc: any) => void): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFDocument = require('pdfkit');
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      fn(doc);
      doc.end();
    });
  }

  private header(doc: any, titulo: string) {
    doc.fontSize(16).font('Helvetica-Bold').text('HiCloud ERP — Farmacia', 40, 40);
    doc.fontSize(12).font('Helvetica').text(titulo, 40, 60);
    doc.moveTo(40, 80).lineTo(570, 80).stroke();
    doc.y = 90;
  }

  private footer(doc: any) {
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#666')
        .text(`Página ${i - pages.start + 1} de ${pages.count} — Generado ${fechaHoraRD()}`, 40, 750, { align: 'center', width: 530 });
    }
  }

  // ── RECIBO DE DISPENSACIÓN ─────────────────────────────────────────────────

  async generarRecibo(disp: any): Promise<Buffer> {
    return this.buildBuffer((doc) => {
      this.header(doc, `Recibo de Dispensación — ${disp.numero}`);

      doc.fontSize(10).font('Helvetica');

      // Info cliente
      doc.text(`Fecha: ${fechaYHoraRD(new Date(disp.fecha))}`, { continued: true })
         .text(`   Farmacéutico: ${disp.farmaceuticoNombre ?? 'N/D'}`, { align: 'right' });
      if (disp.clienteNombre) {
        doc.text(`Cliente: ${disp.clienteNombre}${disp.clienteCedula ? ' — Cédula: ' + disp.clienteCedula : ''}`);
      }
      if (disp.arsNombre) {
        doc.text(`ARS: ${disp.arsNombre}  Afiliado: ${disp.arsNumeroAfiliado ?? 'N/D'}  Auth: ${disp.autorizacionArs ?? 'N/D'}`);
      }
      if (disp.recetaMedico) {
        doc.text(`Receta: Dr./Dra. ${disp.recetaMedico}  # ${disp.recetaNumero ?? 'N/D'}`);
      }
      doc.moveDown(0.5);

      // Tabla de items
      const cols = [40, 240, 340, 390, 445, 510];
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('#', cols[0], doc.y, { width: 20 });
      doc.text('Medicamento', cols[1], doc.y - 11, { width: 95 });
      doc.text('Lote', cols[2], doc.y - 11, { width: 45 });
      doc.text('Cant.', cols[3], doc.y - 11, { width: 50 });
      doc.text('P.Unit', cols[4], doc.y - 11, { width: 60 });
      doc.text('Total', cols[5], doc.y - 11, { width: 55 });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();

      doc.font('Helvetica').fontSize(9);
      for (const [idx, item] of (disp.items ?? []).entries()) {
        const y = doc.y + 4;
        const nombre = `${item.nombreGenerico ?? ''} ${item.concentracion ?? ''} (${item.forma ?? ''})`.trim();
        doc.text(String(idx + 1), cols[0], y, { width: 20 });
        doc.text(nombre, cols[1], y, { width: 95 });
        doc.text(item.numeroLote ?? '-', cols[2], y, { width: 45 });
        doc.text(String(item.cantidad), cols[3], y, { width: 50 });
        doc.text(`RD$ ${Number(item.precioUnitario ?? 0).toFixed(2)}`, cols[4], y, { width: 60 });
        doc.text(`RD$ ${Number(item.total ?? 0).toFixed(2)}`, cols[5], y, { width: 55 });
        if (item.instrucciones) {
          doc.fontSize(8).fillColor('#555')
             .text(`  → ${item.instrucciones}`, cols[1], doc.y + 2, { width: 420 })
             .fillColor('black').fontSize(9);
        }
      }

      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();
      doc.moveDown(0.3);

      // Totales
      const right = 370;
      doc.font('Helvetica').fontSize(10);
      doc.text(`Subtotal:`, right, doc.y, { width: 100 }).text(`RD$ ${Number(disp.subtotal ?? 0).toFixed(2)}`, right + 105, doc.y - 12, { width: 95, align: 'right' });
      if (Number(disp.descuento) > 0) {
        doc.text(`Descuento:`, right, doc.y + 2, { width: 100 }).text(`RD$ ${Number(disp.descuento).toFixed(2)}`, right + 105, doc.y - 12, { width: 95, align: 'right' });
      }
      if (Number(disp.montoCubierto) > 0) {
        doc.text(`Cubierto ARS:`, right, doc.y + 2, { width: 100 }).text(`RD$ ${Number(disp.montoCubierto).toFixed(2)}`, right + 105, doc.y - 12, { width: 95, align: 'right' });
      }
      doc.text(`ITBIS (0%):`, right, doc.y + 2, { width: 100 }).text(`RD$ 0.00`, right + 105, doc.y - 12, { width: 95, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`TOTAL:`, right, doc.y + 4, { width: 100 }).text(`RD$ ${Number(disp.total ?? 0).toFixed(2)}`, right + 105, doc.y - 14, { width: 95, align: 'right' });

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).fillColor('#555')
         .text('* Los medicamentos están exentos de ITBIS según Ley 253-12, Art. 343 (República Dominicana)', 40, doc.y, { align: 'center', width: 530 });

      this.footer(doc);
    }).catch((err) => {
      this.logger.error('Error generando PDF recibo dispensación', err);
      throw err;
    });
  }

  // ── LIBRO DE NARCÓTICOS ────────────────────────────────────────────────────

  async generarLibroNarcoticos(registros: any[], filtros: { desde?: string; hasta?: string }): Promise<Buffer> {
    return this.buildBuffer((doc) => {
      this.header(doc, 'Libro de Control de Narcóticos y Psicotrópicos');

      doc.fontSize(9).font('Helvetica');
      if (filtros.desde || filtros.hasta) {
        doc.text(`Período: ${filtros.desde ?? 'inicio'} al ${filtros.hasta ?? 'hoy'}`);
      }
      doc.moveDown(0.5);

      const cols = [40, 110, 200, 270, 330, 395, 460, 520];
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Fecha', cols[0], doc.y, { width: 65 });
      doc.text('Medicamento', cols[1], doc.y - 9, { width: 85 });
      doc.text('Lote', cols[2], doc.y - 9, { width: 65 });
      doc.text('Tipo', cols[3], doc.y - 9, { width: 55 });
      doc.text('Cant', cols[4], doc.y - 9, { width: 60 });
      doc.text('Saldo Ant', cols[5], doc.y - 9, { width: 60 });
      doc.text('Saldo Act', cols[6], doc.y - 9, { width: 55 });
      doc.text('Receptor', cols[7], doc.y - 9, { width: 80 });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();

      doc.font('Helvetica').fontSize(7.5);
      for (const r of registros) {
        if (doc.y > 700) { doc.addPage(); this.header(doc, 'Libro de Control de Narcóticos (cont.)'); }
        const y = doc.y + 3;
        const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-DO') : '-';
        doc.text(fecha, cols[0], y, { width: 65 });
        doc.text((r.nombreGenerico ?? '-').substring(0, 18), cols[1], y, { width: 85 });
        doc.text(r.numeroLote ?? '-', cols[2], y, { width: 65 });
        doc.text(r.tipo ?? '-', cols[3], y, { width: 55 });
        doc.text(String(r.cantidad ?? '-'), cols[4], y, { width: 60 });
        doc.text(String(r.saldoAnterior ?? '-'), cols[5], y, { width: 60 });
        doc.text(String(r.saldoActual ?? '-'), cols[6], y, { width: 55 });
        doc.text((r.receptorNombre ?? '-').substring(0, 18), cols[7], y, { width: 80 });
      }

      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica')
         .text('____________________________', 80, doc.y).text('____________________________', 380, doc.y - 11);
      doc.text('Farmacéutico Regente', 80, doc.y + 2).text('Director / Supervisor', 380, doc.y - 11);

      this.footer(doc);
    }).catch((err) => {
      this.logger.error('Error generando PDF libro narcóticos', err);
      throw err;
    });
  }

  // ── REPORTE DE VENCIMIENTOS ────────────────────────────────────────────────

  async generarReporteVencimientos(lotes: any[], dias: number): Promise<Buffer> {
    return this.buildBuffer((doc) => {
      this.header(doc, `Reporte de Vencimientos — próximos ${dias} días`);

      doc.fontSize(9).font('Helvetica');
      doc.text(`Fecha de emisión: ${fechaTextoRD()}   Total lotes: ${lotes.length}`);
      doc.moveDown(0.5);

      const cols = [40, 180, 290, 355, 420, 490];
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Medicamento', cols[0], doc.y, { width: 135 });
      doc.text('Lote', cols[1], doc.y - 11, { width: 105 });
      doc.text('Vence', cols[2], doc.y - 11, { width: 60 });
      doc.text('Días', cols[3], doc.y - 11, { width: 60 });
      doc.text('Cantidad', cols[4], doc.y - 11, { width: 65 });
      doc.text('Estado', cols[5], doc.y - 11, { width: 70 });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();

      doc.font('Helvetica').fontSize(9);
      for (const l of lotes) {
        if (doc.y > 700) { doc.addPage(); this.header(doc, `Reporte de Vencimientos (cont.)`); }
        const y = doc.y + 4;
        const nombre = `${l.nombreGenerico ?? ''} ${l.concentracion ?? ''}`.trim();
        const fechaV = l.fechaVencimiento ? new Date(l.fechaVencimiento).toLocaleDateString('es-DO') : '-';
        const dias2 = Number(l.diasRestantes ?? 0);
        const color = dias2 <= 0 ? '#d32f2f' : dias2 <= 15 ? '#f57c00' : '#388e3c';
        doc.text(nombre.substring(0, 30), cols[0], y, { width: 135 });
        doc.text(l.numeroLote ?? '-', cols[1], y, { width: 105 });
        doc.text(fechaV, cols[2], y, { width: 60 });
        doc.fillColor(color).text(String(dias2), cols[3], y, { width: 60 });
        doc.fillColor('black').text(String(l.cantidadActual ?? 0), cols[4], y, { width: 65 });
        const estado = dias2 <= 0 ? 'VENCIDO' : dias2 <= 15 ? 'CRÍTICO' : 'PRÓXIMO';
        doc.fillColor(color).text(estado, cols[5], y, { width: 70 });
        doc.fillColor('black');
      }

      this.footer(doc);
    }).catch((err) => {
      this.logger.error('Error generando PDF reporte vencimientos', err);
      throw err;
    });
  }
}
