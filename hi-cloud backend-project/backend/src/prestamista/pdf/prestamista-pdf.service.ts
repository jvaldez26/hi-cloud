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
      `SELECT p.*, d.nombre as deudorNombre, d.cedula as deudorCedula
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
    const [pago] = await this.ds.query<any[]>(
      `SELECT pg.*, p.numero as prestamoNumero, d.nombre as deudorNombre, d.cedula as deudorCedula
       FROM pr_pagos pg JOIN pr_prestamos p ON p.id=pg."prestamoId"
       JOIN pr_deudores d ON d.id=pg."deudorId"
       WHERE pg.id=$1 AND pg."empresaId"=$2`, [pagoId, empresaId],
    );
    if (!pago) { res.status(404).json({ message: 'Pago no encontrado' }); return; }

    const doc = new PDFDocument({ margin: 50, size: [300, 420] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${pago.numero}.pdf"`);
    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold').text('RECIBO DE PAGO', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`N°: ${pago.numero}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(30, doc.y).lineTo(270, doc.y).stroke();
    doc.moveDown(0.3);

    const row = (label: string, val: string) => {
      doc.font('Helvetica-Bold').fontSize(8).text(label, 30, doc.y, { continued: true, width: 100 });
      doc.font('Helvetica').text(val, { width: 150 });
    };

    row('Deudor:', pago.deudorNombre);
    row('Cédula:', pago.deudorCedula ?? 'N/A');
    row('Préstamo N°:', pago.prestamoNumero);
    row('Fecha:', new Date(pago.fecha).toLocaleDateString('es-DO'));
    row('Método:', pago.metodoPago ?? 'Efectivo');
    if (pago.referencia) row('Referencia:', pago.referencia);
    doc.moveDown(0.5);
    doc.moveTo(30, doc.y).lineTo(270, doc.y).stroke();
    doc.moveDown(0.3);
    row('Abono Mora:', `RD$ ${this.r2(pago.aplicadoMora)}`);
    row('Abono Interés:', `RD$ ${this.r2(pago.aplicadoInteres)}`);
    row('Abono Capital:', `RD$ ${this.r2(pago.aplicadoCapital)}`);
    doc.moveDown(0.3);
    doc.moveTo(30, doc.y).lineTo(270, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL: RD$ ${this.r2(pago.montoPagado)}`, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(8).font('Helvetica').text('_______________________', 30, doc.y);
    doc.text('Firma Autorizada', 30);

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
