import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

@Injectable()
export class PrestamistaPdfService {
  private readonly logger = new Logger(PrestamistaPdfService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private r2(n: any): string {
    return Number(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  private buildHeader(doc: any, titulo: string, numero?: string) {
    doc.fontSize(16).font('Helvetica-Bold').text('HiCloud ERP', 50, 40);
    doc.fontSize(10).font('Helvetica').text('Módulo Prestamista / Financiera', 50, 60);
    doc.fontSize(14).font('Helvetica-Bold').text(titulo, 50, 80);
    if (numero) doc.fontSize(10).font('Helvetica').text(`N°: ${numero}`, 450, 80, { align: 'right' });
    doc.moveTo(50, 100).lineTo(550, 100).stroke();
    return 115;
  }

  async tablaAmortizacion(res: Response, prestamoId: number, empresaId: number) {
    const [prestamo] = await this.ds.query<any[]>(
      `SELECT p.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [prestamoId, empresaId],
    );
    if (!prestamo) { res.status(404).json({ message: 'Préstamo no encontrado' }); return; }

    const cuotas = await this.ds.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 ORDER BY "numeroCuota"`, [prestamoId],
    );

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="amortizacion-${prestamo.numero}.pdf"`);
    doc.pipe(res);

    let y = this.buildHeader(doc, 'Tabla de Amortización', prestamo.numero);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Deudor: ${prestamo.deudorNombre} | Cédula: ${prestamo.deudorCedula ?? 'N/A'}`, 50, y);
    y += 14;
    doc.text(`Capital: RD$ ${this.r2(prestamo.montoPrincipal)} | Tasa: ${prestamo.tasaInteresMensual}% mensual | Plazo: ${prestamo.plazoMeses} meses | Método: ${prestamo.metodoAmortizacion}`, 50, y);
    y += 20;

    // Cabecera tabla
    const cols = [50, 95, 175, 270, 350, 440, 510];
    doc.font('Helvetica-Bold').fontSize(8);
    ['#', 'Fecha', 'Cuota', 'Capital', 'Interés', 'Saldo', 'Estado'].forEach((h, i) => {
      doc.text(h, cols[i], y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 60 });
    });
    y += 12;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 5;

    doc.font('Helvetica').fontSize(8);
    for (const c of cuotas) {
      if (y > 700) { doc.addPage(); y = 50; }
      const estado = c.estado === 'pagada' ? '✓' : c.estado === 'parcial' ? '~' : '';
      [
        c.numeroCuota,
        c.fechaVencimiento?.toString().slice(0, 10) ?? '',
        `${this.r2(c.cuotaTotal)}`,
        `${this.r2(c.capital)}`,
        `${this.r2(c.interes)}`,
        `${this.r2(c.saldoRestante)}`,
        estado,
      ].forEach((val, i) => {
        doc.text(String(val), cols[i], y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 60 });
      });
      y += 12;
    }

    y += 10;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`Total Capital: RD$ ${this.r2(prestamo.montoPrincipal)}`, 50, y);
    doc.text(`Total Interés: RD$ ${this.r2(prestamo.totalInteres)}`, 200, y);
    doc.text(`Total a Pagar: RD$ ${this.r2(prestamo.totalAPagar)}`, 380, y);

    doc.end();
  }

  async reciboPago(res: Response, pagoId: number, empresaId: number) {
    const rows: any[] = await this.ds.query(
      `SELECT pg.*,
              p.numero       AS "prestamoNumero",
              d.nombre       AS "deudorNombre",
              d.cedula       AS "deudorCedula",
              e."razonSocial" AS "empresaNombre",
              e.telefono     AS "empresaTelefono"
       FROM pr_pagos pg
       JOIN pr_prestamos p ON p.id = pg."prestamoId"
       JOIN pr_deudores  d ON d.id = pg."deudorId"
       LEFT JOIN empresas e ON e.id = pg."empresaId"
       WHERE pg.id=$1 AND pg."empresaId"=$2`, [pagoId, empresaId],
    );
    const pago = rows[0];
    if (!pago) { res.status(404).json({ message: 'Pago no encontrado' }); return; }

    // ── Papel térmico 80 mm (~200 pt ancho útil) ────────────────
    const TW = 200; const PL = 8; const PR = TW - 8; const W = PR - PL;
    const doc = new PDFDocument({ size: [TW, 800], margin: 0, compress: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${pago.numero}.pdf"`);
    doc.pipe(res);

    let y = 10;
    const LH = 11;

    const center = (text: string, fs: number, font = 'Helvetica', color = '#000') => {
      doc.font(font).fontSize(fs).fillColor(color)
         .text(String(text ?? ''), PL, y, { width: W, align: 'center', lineBreak: false });
      y += LH;
    };
    const sep = (color = '#000', lw = 0.5) => {
      y += 3;
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor(color).lineWidth(lw).stroke();
      y += 4;
    };
    const kv = (label: string, val: string) => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000')
         .text(String(label), PL, y, { width: W * 0.55, lineBreak: false });
      doc.font('Helvetica').fontSize(7).fillColor('#000')
         .text(String(val ?? '—'), PL + W * 0.55, y, { width: W * 0.45, align: 'right', lineBreak: false });
      y += LH;
    };

    // ── Encabezado ────────────────────────────────────────────────
    if (pago.empresaNombre) center(String(pago.empresaNombre), 9, 'Helvetica-Bold');
    if (pago.empresaTelefono) center(String(pago.empresaTelefono), 7);
    y += 3;
    center('RECIBO DE PAGO', 11, 'Helvetica-Bold');
    center(`N°: ${pago.numero ?? ''}`, 9, 'Helvetica-Bold');
    sep('#ccc', 0.5);

    // ── Datos del pago ────────────────────────────────────────────
    kv('Deudor:',      String(pago.deudorNombre ?? '—'));
    kv('Cédula:',      String(pago.deudorCedula ?? 'N/A'));
    kv('Préstamo N°:', String(pago.prestamoNumero ?? '—'));
    kv('Fecha:',       pago.fecha ? new Date(pago.fecha).toLocaleDateString('es-DO') : '—');
    kv('Método:',      String(pago.metodoPago ?? 'Efectivo'));
    if (pago.referencia) kv('Referencia:', String(pago.referencia));
    sep('#000', 1);

    // ── Detalle abonos ────────────────────────────────────────────
    kv('Abono Mora:',     `RD$ ${this.r2(pago.aplicadoMora)}`);
    kv('Abono Interés:',  `RD$ ${this.r2(pago.aplicadoInteres)}`);
    kv('Abono Capital:',  `RD$ ${this.r2(pago.aplicadoCapital)}`);
    sep('#000', 0.5);

    // ── Total ─────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
       .text(`TOTAL: RD$ ${this.r2(pago.montoPagado)}`, PL, y, { width: W, align: 'center', lineBreak: false });
    y += LH + 4;
    sep('#ccc', 0.5);

    // ── Firma ─────────────────────────────────────────────────────
    y += 6;
    doc.font('Helvetica').fontSize(7).fillColor('#000')
       .text('_______________________', PL, y, { width: W, align: 'center', lineBreak: false });
    y += LH;
    doc.font('Helvetica').fontSize(7).fillColor('#000')
       .text('Firma Autorizada', PL, y, { width: W, align: 'center', lineBreak: false });
    y += LH + 4;
    center('HiCloud ERP', 7, 'Helvetica', '#888');
    y += 4;

    // Recortar página al contenido real
    (doc.page as any).height = y + 15;
    doc.end();
  }

  async estadoCuenta(res: Response, deudorId: number, empresaId: number) {
    const [deudor] = await this.ds.query<any[]>(
      `SELECT * FROM pr_deudores WHERE id=$1 AND "empresaId"=$2`, [deudorId, empresaId],
    );
    if (!deudor) { res.status(404).json({ message: 'Deudor no encontrado' }); return; }

    const prestamos = await this.ds.query<any[]>(
      `SELECT * FROM pr_prestamos WHERE "deudorId"=$1 AND "empresaId"=$2 ORDER BY "createdAt" DESC`,
      [deudorId, empresaId],
    );

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="estado-cuenta-${deudor.cedula ?? deudorId}.pdf"`);
    doc.pipe(res);

    let y = this.buildHeader(doc, 'Estado de Cuenta del Deudor');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Deudor: ${deudor.nombre} ${deudor.apellidos ?? ''}`, 50, y);
    y += 14;
    doc.text(`Cédula: ${deudor.cedula ?? 'N/A'} | Tel: ${deudor.telefono ?? 'N/A'} | Nivel riesgo: ${deudor.nivelRiesgo}`, 50, y);
    y += 20;

    for (const p of prestamos) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.font('Helvetica-Bold').fontSize(9).text(`Préstamo ${p.numero} — ${p.estado.toUpperCase()}`, 50, y);
      y += 14;
      doc.font('Helvetica').fontSize(8);
      doc.text(`Capital: RD$ ${this.r2(p.montoPrincipal)} | Saldo Capital: RD$ ${this.r2(p.saldoCapital)} | Mora: RD$ ${this.r2(p.saldoMora)} | Días mora: ${p.diasMoraActual}`, 60, y);
      y += 14;
      doc.text(`Desembolso: ${p.fechaDesembolso?.toString().slice(0, 10)} | Vencimiento: ${p.fechaVencimiento?.toString().slice(0, 10)}`, 60, y);
      y += 20;
    }

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total prestado: RD$ ${this.r2(deudor.totalPrestado)} | Total pagado: RD$ ${this.r2(deudor.totalPagado)}`, 50, y);

    doc.end();
  }
}
