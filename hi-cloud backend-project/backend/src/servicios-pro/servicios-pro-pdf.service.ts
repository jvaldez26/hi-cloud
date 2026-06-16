import { Injectable, Logger } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

@Injectable()
export class ServiciosProPdfService {
  private readonly logger = new Logger(ServiciosProPdfService.name);

  private fmt(n: number | string): string {
    return `RD$${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private fmtFecha(d: string | Date | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── PDF 1: Factura de Honorarios ─────────────────────────────────────────────

  async generarHonorarioPdf(honorario: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const W = 495; // ancho útil
        const blue = '#1e40af';

        // ── Header ───────────────────────────────────────────────────────────
        doc.fontSize(22).font('Helvetica-Bold').fillColor(blue).text('FACTURA DE HONORARIOS', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#374151').text('No. ' + honorario.numero, { align: 'center' });
        doc.moveDown(0.5);

        // Línea separadora
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(blue).lineWidth(1.5).stroke();
        doc.moveDown(0.5);

        // Fecha e info básica
        const yInfo = doc.y;
        doc.fontSize(9).font('Helvetica-Bold').text('Fecha:', 50, yInfo, { continued: true });
        doc.font('Helvetica').text(' ' + this.fmtFecha(honorario.createdAt));
        if (honorario.fechaVencimiento) {
          doc.font('Helvetica-Bold').text('Vence:', { continued: true });
          doc.font('Helvetica').text(' ' + this.fmtFecha(honorario.fechaVencimiento));
        }
        doc.moveDown(0.5);

        // ── Cliente ──────────────────────────────────────────────────────────
        doc.fontSize(10).font('Helvetica-Bold').fillColor(blue).text('CLIENTE:');
        doc.fontSize(10).font('Helvetica').fillColor('#111827')
          .text(honorario.clienteNombre ?? '')
          .text(honorario.clienteRnc ? `RNC: ${honorario.clienteRnc}` : '')
          .text(honorario.clienteDireccion ?? '');
        doc.moveDown(0.5);

        // ── Expediente ───────────────────────────────────────────────────────
        doc.font('Helvetica-Bold').fillColor(blue).text('EXPEDIENTE:');
        doc.font('Helvetica').fillColor('#111827')
          .text(`${honorario.expedienteNumero} — ${honorario.expedienteNombre}`);
        if (honorario.periodoDesde || honorario.periodoHasta) {
          doc.text(`Período: ${this.fmtFecha(honorario.periodoDesde)} al ${this.fmtFecha(honorario.periodoHasta)}`);
        }
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        // ── Detalle de tiempo ────────────────────────────────────────────────
        if (honorario.tiempos?.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor(blue).text('DETALLE DE SERVICIOS:');
          doc.moveDown(0.3);

          // Encabezados tabla
          const yH = doc.y;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
          doc.text('Fecha',       50,  yH, { width: 70, lineBreak: false });
          doc.text('Profesional', 120, yH, { width: 130, lineBreak: false });
          doc.text('Hrs',         250, yH, { width: 40, lineBreak: false });
          doc.text('Descripción', 290, yH, { width: 165, lineBreak: false });
          doc.text('Monto',       455, yH, { width: 90, align: 'right' });
          doc.moveDown(0.2);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
          doc.moveDown(0.3);

          doc.font('Helvetica').fillColor('#111827');
          for (const t of honorario.tiempos) {
            const y = doc.y;
            if (y > 720) { doc.addPage(); }
            doc.fontSize(9);
            doc.text(this.fmtFecha(t.fecha),            50,  doc.y, { width: 70,  lineBreak: false });
            doc.text(`${t.profesionalNombre ?? ''} ${t.profesionalApellidos ?? ''}`.trim(), 120, doc.y, { width: 130, lineBreak: false });
            doc.text(String(Number(t.horas).toFixed(2)), 250, doc.y, { width: 40,  lineBreak: false });
            doc.text((t.descripcion ?? '').slice(0, 60), 290, doc.y, { width: 165, lineBreak: false });
            doc.text(t.monto ? this.fmt(t.monto) : '',  455, doc.y, { width: 90,  align: 'right' });
            doc.moveDown(0.4);
          }
        }

        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        // ── Totales ──────────────────────────────────────────────────────────
        const rowTotales = (label: string, value: string, bold = false) => {
          const y = doc.y;
          doc[bold ? 'font' : 'font']('Helvetica' + (bold ? '-Bold' : ''));
          doc.fontSize(10).text(label, 350, y, { width: 100, lineBreak: false });
          doc.text(value, 450, y, { width: 95, align: 'right' });
          doc.moveDown(0.4);
        };

        if (Number(honorario.horasFacturadas) > 0) {
          doc.font('Helvetica-Bold').text('Total horas:', 350, doc.y, { width: 100, continued: true });
          doc.font('Helvetica').text(`  ${Number(honorario.horasFacturadas).toFixed(2)} hrs`);
          doc.moveDown(0.2);
        }

        rowTotales('Subtotal horas:', this.fmt(honorario.montoHoras));
        if (Number(honorario.gastosReembolsables) > 0) rowTotales('Gastos reemb.:', this.fmt(honorario.gastosReembolsables));
        if (Number(honorario.descuento) > 0) rowTotales('Descuento:', `-${this.fmt(honorario.descuento)}`);
        if (Number(honorario.itbis) > 0) rowTotales('ITBIS (18%):', this.fmt(honorario.itbis));

        doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor(blue).lineWidth(1).stroke();
        doc.moveDown(0.3);
        doc.fontSize(13).font('Helvetica-Bold').fillColor(blue)
          .text('TOTAL:', 350, doc.y, { width: 100, lineBreak: false });
        doc.text(this.fmt(honorario.total), 450, doc.y, { width: 95, align: 'right' });
        doc.moveDown(1);

        if (honorario.notas) {
          doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
          doc.moveDown(0.5);
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280').text(honorario.notas);
        }

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF honorario', err);
        reject(err);
      }
    });
  }

  // ── PDF 2: Contrato de Servicios ─────────────────────────────────────────────

  async generarContratoPdf(contrato: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const blue = '#1e40af';

        doc.fontSize(18).font('Helvetica-Bold').fillColor(blue).text('CONTRATO DE SERVICIOS PROFESIONALES', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#374151').text('No. ' + contrato.numero, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor(blue).lineWidth(1.5).stroke();
        doc.moveDown(0.8);

        // Partes
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('ENTRE LAS PARTES:');
        doc.moveDown(0.3);
        doc.font('Helvetica').text(`PROVEEDOR DE SERVICIOS: __________________________`);
        doc.moveDown(0.3);
        doc.text(`CLIENTE: ${contrato.clienteNombre ?? ''}${contrato.clienteRnc ? ` (RNC: ${contrato.clienteRnc})` : ''}`);
        doc.moveDown(0.8);

        // Info del contrato
        doc.font('Helvetica-Bold').text('DATOS DEL CONTRATO:');
        doc.moveDown(0.3);
        doc.font('Helvetica')
          .text(`Título: ${contrato.titulo}`)
          .text(`Tipo: ${contrato.tipo ?? 'Servicios profesionales'}`)
          .text(`Inicio: ${this.fmtFecha(contrato.fechaInicio)}`)
          .text(contrato.fechaVencimiento ? `Vencimiento: ${this.fmtFecha(contrato.fechaVencimiento)}` : '')
          .text(contrato.valor ? `Valor: ${this.fmt(contrato.valor)}` : '');
        doc.moveDown(0.8);

        // Contenido del contrato
        if (contrato.contenido) {
          doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica').fillColor('#111827').text(contrato.contenido, { lineGap: 4 });
          doc.moveDown(1);
        }

        // Firmas
        if (doc.y > 650) doc.addPage();
        doc.moveDown(2);
        doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text('FIRMAS:', { underline: true });
        doc.moveDown(1);
        const yFirmas = doc.y;
        doc.text('_____________________________', 60,  yFirmas, { width: 200 });
        doc.text('_____________________________', 335, yFirmas, { width: 200 });
        doc.moveDown(0.3);
        doc.text('Proveedor de Servicios', 60, doc.y, { width: 200 });
        doc.text('Cliente', 335, doc.y, { width: 200 });
        doc.moveDown(0.3);
        doc.text(`Fecha: ${this.fmtFecha(new Date().toISOString())}`, 60, doc.y, { width: 200 });
        if (contrato.firmadoPor) doc.text(`${contrato.firmadoPor}`, 335, doc.y, { width: 200 });

        // Footer con número de página
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
            .text(`Página ${i + 1} de ${range.count} — ${contrato.numero}`, 60, 790, { align: 'center' });
        }

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF contrato', err);
        reject(err);
      }
    });
  }

  // ── PDF 3: Estado de Cuenta del Expediente ───────────────────────────────────

  async generarEstadoCuentaPdf(resumen: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const blue = '#1e40af';
        const exp = resumen.expediente;

        doc.fontSize(18).font('Helvetica-Bold').fillColor(blue).text('ESTADO DE CUENTA', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#374151')
          .text(`${exp.numero} — ${exp.nombre}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(blue).lineWidth(1.5).stroke();
        doc.moveDown(0.8);

        doc.fontSize(10).font('Helvetica')
          .text(`Cliente: ${exp.clienteNombre}`)
          .text(`Responsable: ${exp.profesionalNombre ?? ''} ${exp.profesionalApellidos ?? ''}`.trim())
          .text(`Inicio: ${this.fmtFecha(exp.fechaInicio)}`)
          .text(`Estado: ${exp.estado?.toUpperCase()}`);
        doc.moveDown(0.8);

        // Resumen financiero
        doc.font('Helvetica-Bold').text('RESUMEN FINANCIERO:');
        doc.moveDown(0.3);

        const fila = (label: string, value: string, color?: string) => {
          const y = doc.y;
          doc.fontSize(10).font('Helvetica').fillColor(color ?? '#111827')
            .text(label, 50, y, { width: 300, lineBreak: false })
            .text(value, 350, y, { width: 195, align: 'right' });
          doc.moveDown(0.4);
        };

        if (exp.presupuestoTotal) fila('Presupuesto total:', this.fmt(exp.presupuestoTotal));
        fila('Total horas trabajadas:', `${Number(resumen.totalHoras).toFixed(2)} hrs`);
        fila('Monto por tiempo:', this.fmt(resumen.totalMontoTiempo));
        fila('Total gastos:', this.fmt(resumen.totalGastos));
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.moveDown(0.3);
        fila('Total facturado:', this.fmt(resumen.totalFacturado));
        fila('Total cobrado:', this.fmt(resumen.totalCobrado), '#16a34a');
        const saldo = Number(resumen.totalFacturado) - Number(resumen.totalCobrado);
        fila('Saldo pendiente:', this.fmt(saldo), saldo > 0 ? '#dc2626' : '#16a34a');
        doc.moveDown(0.5);
        fila('Horas sin facturar:', `${Number(resumen.horasSinFacturar).toFixed(2)} hrs`, '#d97706');
        fila('Tareas pendientes:', String(resumen.tareasPendientes));

        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#9ca3af')
          .text(`Generado el ${this.fmtFecha(new Date().toISOString())}`, { align: 'right' });

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF estado cuenta', err);
        reject(err);
      }
    });
  }

  // ── PDF 4: Reporte de Tiempo por Profesional ─────────────────────────────────

  async generarReporteTiempoPdf(profesional: any, tiempos: any[], desde: string, hasta: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const blue = '#1e40af';

        doc.fontSize(18).font('Helvetica-Bold').fillColor(blue).text('REPORTE DE TIEMPO', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').fillColor('#374151')
          .text(`${profesional.nombre ?? ''} ${profesional.apellidos ?? ''}`.trim(), { align: 'center' })
          .text(`Período: ${this.fmtFecha(desde)} — ${this.fmtFecha(hasta)}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(blue).lineWidth(1.5).stroke();
        doc.moveDown(0.5);

        let totalHoras = 0;
        let totalMonto = 0;

        for (const t of tiempos) {
          if (doc.y > 730) doc.addPage();
          const y = doc.y;
          doc.fontSize(9).font('Helvetica').fillColor('#111827');
          doc.text(this.fmtFecha(t.fecha),           50,  y, { width: 70,  lineBreak: false });
          doc.text(t.expedienteNumero ?? '',          120, y, { width: 70,  lineBreak: false });
          doc.text(String(Number(t.horas).toFixed(2)), 190, y, { width: 40,  lineBreak: false });
          doc.text((t.descripcion ?? '').slice(0, 80), 230, y, { width: 220, lineBreak: false });
          doc.text(t.monto ? this.fmt(t.monto) : '',  450, y, { width: 95,  align: 'right' });
          doc.moveDown(0.4);
          totalHoras += Number(t.horas);
          totalMonto += Number(t.monto ?? 0);
        }

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(blue).lineWidth(1).stroke();
        doc.moveDown(0.4);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(blue)
          .text(`TOTAL: ${totalHoras.toFixed(2)} hrs`, 50, doc.y, { width: 300, lineBreak: false })
          .text(this.fmt(totalMonto), 350, doc.y, { width: 195, align: 'right' });

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF reporte tiempo', err);
        reject(err);
      }
    });
  }
}
