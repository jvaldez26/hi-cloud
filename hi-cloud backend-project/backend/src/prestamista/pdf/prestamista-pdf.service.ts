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

  /**
   * Las columnas `date` de Postgres llegan como objeto Date de JS (no string)
   * vía node-postgres/TypeORM. `.toString().slice(0, 10)` cortaba los
   * primeros 10 caracteres del toString() EN INGLÉS ("Fri Oct 09 2026...")
   * en vez de la fecha ISO — el resultado era "Fri Oct 09", sin año y en
   * inglés. toLocaleDateString('es-DO') funciona igual con Date o string.
   */
  private fecha(v: any): string {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-DO');
  }

  /** Trae nombre/RNC/dirección/teléfono/email de la empresa — membrete de todo PDF del módulo. */
  private async empresaInfo(empresaId: number): Promise<any> {
    const [e] = await this.ds.query<any[]>(
      `SELECT nombre, "nombreComercial", rnc, direccion, ciudad, telefono, email FROM empresa WHERE id=$1`,
      [empresaId],
    );
    return e ?? {};
  }

  /**
   * Membrete: nombre de la empresa (nunca "HiCloud ERP" — ese es el software,
   * no quien emite el documento) + su información general, y debajo
   * "Generado por HiCloud" como atribución del sistema, no como encabezado.
   */
  private buildHeader(doc: any, titulo: string, empresa: any, numero?: string) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
      .text(empresa?.nombreComercial || empresa?.nombre || 'Mi Empresa', 50, 40);

    doc.fontSize(8).font('Helvetica').fillColor('#555');
    const info = [
      empresa?.rnc ? `RNC: ${empresa.rnc}` : null,
      [empresa?.direccion, empresa?.ciudad].filter(Boolean).join(', ') || null,
      empresa?.telefono ? `Tel: ${empresa.telefono}` : null,
      empresa?.email || null,
    ].filter(Boolean).join('  ·  ');
    let y = 58;
    if (info) { doc.text(info, 50, y, { width: 500 }); y += 13; }
    doc.fontSize(7).font('Helvetica-Oblique').fillColor('#999').text('Generado por HiCloud', 50, y);
    y += 16;

    doc.fillColor('#000').fontSize(14).font('Helvetica-Bold').text(titulo, 50, y);
    if (numero) doc.fontSize(10).font('Helvetica').text(`N°: ${numero}`, 450, y, { align: 'right' });
    y += 22;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    return y + 15;
  }

  async tablaAmortizacion(res: Response, prestamoId: number, empresaId: number) {
    const [prestamo] = await this.ds.query<any[]>(
      `SELECT p.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [prestamoId, empresaId],
    );
    if (!prestamo) { res.status(404).json({ message: 'Préstamo no encontrado' }); return; }

    const cuotas = await this.ds.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 ORDER BY "numeroCuota"`, [prestamoId],
    );
    const empresa = await this.empresaInfo(empresaId);

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="amortizacion-${prestamo.numero}.pdf"`);
    doc.pipe(res);

    let y = this.buildHeader(doc, 'Tabla de Amortización', empresa, prestamo.numero);
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
        this.fecha(c.fechaVencimiento),
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

  /** Público: también lo usa PagosController para el link de WhatsApp (mismos datos, sin generar el PDF). */
  async buscarPagoParaRecibo(pagoId: number, empresaId: number): Promise<any | null> {
    const rows: any[] = await this.ds.query(
      `SELECT pg.*,
              p.numero         AS "prestamoNumero",
              d.nombre         AS "deudorNombre",
              d.cedula         AS "deudorCedula",
              d.telefono       AS "deudorTelefono",
              COALESCE(e."nombreComercial", e.nombre) AS "empresaNombre",
              e.rnc            AS "empresaRnc",
              e.direccion      AS "empresaDireccion",
              e.telefono       AS "empresaTelefono"
       FROM pr_pagos pg
       JOIN pr_prestamos p ON p.id = pg."prestamoId" AND p."empresaId"=pg."empresaId"
       JOIN pr_deudores d ON d.id=pg."deudorId" AND d."empresaId"=pg."empresaId"
       LEFT JOIN empresa e ON e.id = pg."empresaId"
       WHERE pg.id=$1 AND pg."empresaId"=$2`, [pagoId, empresaId],
    );
    return rows[0] ?? null;
  }

  /** Dibuja el recibo sobre un `doc` ya creado — compartido entre reciboPago() (HTTP) y reciboPagoBuffer() (adjunto de correo). */
  private dibujarRecibo(doc: any, pago: any): void {
    // ── Papel térmico 80 mm (~200 pt ancho útil) ────────────────
    const PL = 8; const PR = 200 - 8; const W = PR - PL;

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
    if (pago.empresaRnc) center(`RNC: ${pago.empresaRnc}`, 7);
    if (pago.empresaDireccion) center(String(pago.empresaDireccion), 7);
    if (pago.empresaTelefono) center(`Tel: ${pago.empresaTelefono}`, 7);
    center('Generado por HiCloud', 6, 'Helvetica-Oblique', '#888');
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

    // Recortar página al contenido real
    (doc.page as any).height = y + 15;
  }

  async reciboPago(res: Response, pagoId: number, empresaId: number) {
    const pago = await this.buscarPagoParaRecibo(pagoId, empresaId);
    if (!pago) { res.status(404).json({ message: 'Pago no encontrado' }); return; }

    const doc = new PDFDocument({ size: [200, 800], margin: 0, compress: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${pago.numero}.pdf"`);
    doc.pipe(res);
    this.dibujarRecibo(doc, pago);
    doc.end();
  }

  /**
   * Mismo recibo que reciboPago(), como buffer en memoria — para adjuntarlo
   * a un correo (enviarReciboPorCorreo en notificaciones) en vez de
   * escribirlo directo a una Response HTTP.
   */
  async reciboPagoBuffer(pagoId: number, empresaId: number): Promise<{ buffer: Buffer; filename: string; pago: any } | null> {
    const pago = await this.buscarPagoParaRecibo(pagoId, empresaId);
    if (!pago) return null;

    const doc = new PDFDocument({ size: [200, 800], margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const fin = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));
    this.dibujarRecibo(doc, pago);
    doc.end();
    const buffer = await fin;
    return { buffer, filename: `recibo-${pago.numero}.pdf`, pago };
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
    const empresa = await this.empresaInfo(empresaId);

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="estado-cuenta-${deudor.cedula ?? deudorId}.pdf"`);
    doc.pipe(res);

    let y = this.buildHeader(doc, 'Estado de Cuenta del Deudor', empresa);
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
      doc.text(`Desembolso: ${this.fecha(p.fechaDesembolso)} | Vencimiento: ${this.fecha(p.fechaVencimiento)}`, 60, y);
      y += 20;
    }

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total prestado: RD$ ${this.r2(deudor.totalPrestado)} | Total pagado: RD$ ${this.r2(deudor.totalPagado)}`, 50, y);

    doc.end();
  }
}
