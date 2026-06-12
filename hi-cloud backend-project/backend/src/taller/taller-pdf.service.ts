import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { DataSource } from 'typeorm';

function fmt(s: string | Date | null | undefined): string {
  if (!s) return '';
  try {
    const iso = s instanceof Date ? s.toISOString() : String(s);
    const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return String(s);
    return [
      String(d.getUTCDate()).padStart(2, '0'),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      d.getUTCFullYear(),
    ].join('/');
  } catch { return String(s); }
}

function money(n: any): string {
  const v = Number(n ?? 0);
  return `RD$ ${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

@Injectable()
export class TallerPdfService {
  private readonly logger = new Logger(TallerPdfService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async getEmpresaInfo(empresaId: number): Promise<any> {
    const [e] = await this.ds.query<any[]>(
      `SELECT nombre, "logoUrl", telefono, email, direccion FROM empresas WHERE id = $1`,
      [empresaId],
    );
    return e ?? {};
  }

  private buildBuffer(fn: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try { fn(doc); } catch (err) { reject(err); }
      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, empresa: any, titulo: string, numero: string) {
    const top = 40;
    doc.fontSize(18).font('Helvetica-Bold').text(empresa.nombre ?? 'Taller', 40, top, { width: 350 });
    if (empresa.telefono) doc.fontSize(9).font('Helvetica').text(empresa.telefono, 40, top + 22);
    if (empresa.email) doc.fontSize(9).font('Helvetica').text(empresa.email, 40, top + 33);
    if (empresa.direccion) doc.fontSize(9).font('Helvetica').text(empresa.direccion, 40, top + 44, { width: 300 });
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1677ff').text(titulo, 400, top, { align: 'right', width: 162 });
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text(numero, 400, top + 25, { align: 'right', width: 162 });
    doc.moveTo(40, 100).lineTo(572, 100).strokeColor('#cccccc').lineWidth(1).stroke();
  }

  private drawVehiculo(doc: PDFKit.PDFDocument, orden: any) {
    let y = 110;
    doc.fontSize(10).font('Helvetica-Bold').text('VEHÍCULO', 40, y);
    doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE / PROPIETARIO', 310, y);
    y += 14;
    const leftLines = [
      [`Placa:`, orden.placa ?? '—'],
      [`Marca/Modelo:`, `${orden.marca ?? ''} ${orden.modelo ?? ''}`.trim() || '—'],
      [`Año:`, orden.anio ?? '—'],
      [`Color:`, orden.color ?? '—'],
      [`Km ingreso:`, orden.kilometrajeIngreso ? `${Number(orden.kilometrajeIngreso).toLocaleString()} km` : '—'],
      [`VIN:`, orden.vin ?? '—'],
    ];
    const rightLines = [
      [`Propietario:`, orden.propietarioNombre ?? '—'],
      [`Teléfono:`, orden.propietarioTelefono ?? '—'],
      [`Email:`, orden.propietarioEmail ?? '—'],
      [`Técnico:`, orden.tecnicoNombre ?? '—'],
    ];
    let maxLines = Math.max(leftLines.length, rightLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (leftLines[i]) {
        doc.fontSize(9).font('Helvetica-Bold').text(leftLines[i][0], 40, y + i * 14, { continued: true });
        doc.font('Helvetica').text(` ${leftLines[i][1]}`, { lineBreak: false });
      }
      if (rightLines[i]) {
        doc.fontSize(9).font('Helvetica-Bold').text(rightLines[i][0], 310, y + i * 14, { continued: true });
        doc.font('Helvetica').text(` ${rightLines[i][1]}`, { lineBreak: false });
      }
    }
    return y + maxLines * 14 + 6;
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    y: number,
    titulo: string,
    headers: string[],
    rows: string[][],
    widths: number[],
  ): number {
    if (!rows.length) return y;
    doc.moveTo(40, y).lineTo(572, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    y += 6;
    doc.fontSize(10).font('Helvetica-Bold').text(titulo, 40, y);
    y += 14;
    // header
    let x = 40;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
    doc.rect(40, y - 2, 532, 14).fill('#1677ff').stroke();
    x = 40;
    for (let i = 0; i < headers.length; i++) {
      doc.fillColor('#ffffff').text(headers[i], x + 3, y, { width: widths[i] - 4, align: i >= 2 ? 'right' : 'left' });
      x += widths[i];
    }
    y += 14;
    // rows
    rows.forEach((row, ri) => {
      if (ri % 2 === 1) {
        doc.rect(40, y - 2, 532, 14).fill('#f5f5f5').stroke();
      }
      x = 40;
      for (let i = 0; i < row.length; i++) {
        doc.fontSize(9).font('Helvetica').fillColor('#000').text(row[i], x + 3, y, {
          width: widths[i] - 6,
          align: i >= 2 ? 'right' : 'left',
          lineBreak: false,
        });
        x += widths[i];
      }
      y += 14;
    });
    return y + 4;
  }

  private drawTotales(doc: PDFKit.PDFDocument, y: number, orden: any): number {
    const manoObra = Number(orden.subtotalManoObra ?? 0);
    const repuestos = Number(orden.subtotalRepuestos ?? 0);
    const itbis = Number(orden.itbis ?? 0);
    const descuento = Number(orden.descuento ?? 0);
    const total = Number(orden.total ?? 0);
    const lines = [
      ['Mano de obra:', money(manoObra)],
      ['Repuestos:', money(repuestos)],
      ['ITBIS (18%):', money(itbis)],
    ];
    if (descuento > 0) lines.push(['Descuento:', `-${money(descuento)}`]);
    y += 8;
    for (const [label, val] of lines) {
      doc.fontSize(9).font('Helvetica').text(label, 380, y, { width: 100, align: 'right' });
      doc.text(val, 490, y, { width: 80, align: 'right' });
      y += 14;
    }
    doc.moveTo(380, y).lineTo(572, y).strokeColor('#1677ff').lineWidth(1.5).stroke();
    y += 6;
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1677ff');
    doc.text('TOTAL:', 380, y, { width: 100, align: 'right' });
    doc.text(money(total), 490, y, { width: 80, align: 'right' });
    doc.fillColor('#000');
    return y + 20;
  }

  // ── PDF ORDEN DE SERVICIO ──────────────────────────────────────────────────

  async generarOrdenServicio(orden: any): Promise<Buffer> {
    const empresa = await this.getEmpresaInfo(orden.empresaId);
    return this.buildBuffer((doc) => {
      this.drawHeader(doc, empresa, 'ORDEN DE SERVICIO', `OS-${orden.numero ?? orden.id}`);
      let y = this.drawVehiculo(doc, orden);
      // Info de la orden
      y += 6;
      const infoCols = [
        [`Fecha ingreso:`, fmt(orden.fechaIngreso)],
        [`Estado:`, (orden.estado ?? '').toUpperCase()],
        [`Prioridad:`, (orden.prioridad ?? '').toUpperCase()],
        [`Entrega estimada:`, fmt(orden.fechaEstimadaEntrega)],
      ];
      for (const [l, v] of infoCols) {
        doc.fontSize(9).font('Helvetica-Bold').text(l, 40, y, { continued: true });
        doc.font('Helvetica').text(` ${v}`, { lineBreak: false });
        y += 13;
      }
      if (orden.motivoIngreso) {
        doc.fontSize(9).font('Helvetica-Bold').text('Motivo: ', 40, y, { continued: true });
        doc.font('Helvetica').text(orden.motivoIngreso, { lineBreak: true });
        y += 13;
      }
      // Servicios
      const svcs: string[][] = (orden.servicios ?? []).map((s: any) => [
        s.descripcion ?? '',
        String(Number(s.cantidad ?? 1)),
        money(s.precioUnitario),
        money(s.total),
      ]);
      y = this.drawTable(doc, y + 4, 'SERVICIOS / MANO DE OBRA', ['Descripción', 'Cant', 'P.Unit.', 'Total'], svcs, [280, 50, 100, 102]);
      // Repuestos
      const reps: string[][] = (orden.repuestos ?? []).map((r: any) => [
        r.descripcion ?? '',
        String(Number(r.cantidad ?? 1)),
        money(r.precioUnitario),
        money(r.total),
      ]);
      y = this.drawTable(doc, y + 6, 'REPUESTOS / MATERIALES', ['Descripción', 'Cant', 'P.Unit.', 'Total'], reps, [280, 50, 100, 102]);
      // Totales
      y = this.drawTotales(doc, y, orden);
      // Diagnósticos
      if (Array.isArray(orden.diagnosticos) && orden.diagnosticos.length) {
        if (y > 580) { doc.addPage(); y = 40; }
        doc.moveTo(40, y).lineTo(572, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
        y += 6;
        doc.fontSize(10).font('Helvetica-Bold').text('DIAGNÓSTICO', 40, y);
        y += 14;
        for (const d of orden.diagnosticos) {
          doc.fontSize(9).font('Helvetica-Bold').text(`• ${d.sistema ?? 'General'}: `, 40, y, { continued: true });
          doc.font('Helvetica').text(d.descripcion ?? '', { lineBreak: true, width: 500 });
          y += 13;
          if (d.recomendacion) {
            doc.fontSize(8).font('Helvetica').fillColor('#555').text(`  → ${d.recomendacion}`, 48, y, { width: 490 });
            doc.fillColor('#000');
            y += 11;
          }
          if (y > 700) { doc.addPage(); y = 40; }
        }
      }
      // Notas
      if (orden.notas) {
        y += 8;
        doc.fontSize(9).font('Helvetica-Bold').text('Notas:', 40, y, { continued: true });
        doc.font('Helvetica').text(` ${orden.notas}`);
        y += 13;
      }
      // Firmas
      if (y > 660) { doc.addPage(); y = 40; }
      y = Math.max(y + 30, doc.page.height - 120);
      doc.moveTo(60, y + 30).lineTo(220, y + 30).strokeColor('#555').lineWidth(0.5).stroke();
      doc.moveTo(350, y + 30).lineTo(510, y + 30).stroke();
      doc.fontSize(8).font('Helvetica').text('Firma cliente / propietario', 80, y + 34);
      doc.text('Firma técnico responsable', 370, y + 34);
    });
  }

  // ── PDF PRESUPUESTO ────────────────────────────────────────────────────────

  async generarPresupuesto(orden: any): Promise<Buffer> {
    const empresa = await this.getEmpresaInfo(orden.empresaId);
    return this.buildBuffer((doc) => {
      this.drawHeader(doc, empresa, 'PRESUPUESTO', `PRES-${orden.numero ?? orden.id}`);
      let y = this.drawVehiculo(doc, orden);
      y += 6;
      doc.fontSize(9).font('Helvetica-Bold').text('Fecha: ', 40, y, { continued: true });
      doc.font('Helvetica').text(fmt(orden.fechaIngreso));
      doc.fontSize(9).font('Helvetica-Bold').text('Válido hasta: ', 200, y, { continued: true });
      const valido = orden.fechaIngreso
        ? (() => { const d = new Date(orden.fechaIngreso); d.setDate(d.getDate() + 15); return fmt(d); })()
        : '—';
      doc.font('Helvetica').text(valido);
      y += 16;
      if (orden.motivoIngreso) {
        doc.fontSize(9).font('Helvetica-Bold').text('Descripción del servicio: ', 40, y, { continued: true });
        doc.font('Helvetica').text(orden.motivoIngreso, { lineBreak: true, width: 500 });
        y += 16;
      }
      // Diagnósticos incluidos en presupuesto
      const diagsPres = (orden.diagnosticos ?? []).filter((d: any) => d.incluidoEnPresupuesto);
      if (diagsPres.length) {
        doc.fontSize(10).font('Helvetica-Bold').text('TRABAJOS A REALIZAR', 40, y);
        y += 14;
        for (const d of diagsPres) {
          doc.fontSize(9).font('Helvetica').text(`• ${d.descripcion ?? ''}`, 48, y, { width: 490 });
          y += 13;
          if (y > 680) { doc.addPage(); y = 40; }
        }
        y += 6;
      }
      // Servicios
      const svcs: string[][] = (orden.servicios ?? []).map((s: any) => [
        s.descripcion ?? '',
        String(Number(s.cantidad ?? 1)),
        money(s.precioUnitario),
        money(s.total),
      ]);
      y = this.drawTable(doc, y, 'MANO DE OBRA', ['Descripción', 'Cant', 'P.Unit.', 'Total'], svcs, [280, 50, 100, 102]);
      // Repuestos
      const reps: string[][] = (orden.repuestos ?? []).map((r: any) => [
        r.descripcion ?? '',
        String(Number(r.cantidad ?? 1)),
        money(r.precioUnitario),
        money(r.total),
      ]);
      y = this.drawTable(doc, y + 6, 'REPUESTOS / MATERIALES', ['Descripción', 'Cant', 'P.Unit.', 'Total'], reps, [280, 50, 100, 102]);
      y = this.drawTotales(doc, y, orden);
      // Garantía
      if (orden.garantiaDias || orden.garantiaKm) {
        y += 6;
        let gtext = 'Garantía: ';
        if (orden.garantiaDias) gtext += `${orden.garantiaDias} días`;
        if (orden.garantiaKm) gtext += ` / ${Number(orden.garantiaKm).toLocaleString()} km`;
        doc.fontSize(9).font('Helvetica-Bold').text(gtext, 40, y);
        y += 13;
      }
      // Condiciones
      y += 10;
      doc.moveTo(40, y).lineTo(572, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
      y += 8;
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text('• Este presupuesto tiene una validez de 15 días desde su fecha de emisión.', 40, y);
      y += 11;
      doc.text('• Los precios pueden variar si durante la reparación se detectan daños adicionales.', 40, y);
      y += 11;
      doc.text('• El trabajo solo comenzará con la aprobación escrita o verbal del cliente.', 40, y);
      doc.fillColor('#000');
      // Firma aprobación
      y += 30;
      doc.moveTo(60, y + 30).lineTo(280, y + 30).strokeColor('#555').lineWidth(0.5).stroke();
      doc.fontSize(8).font('Helvetica').text('Firma y aprobación del cliente', 90, y + 34);
    });
  }
}
