import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RestaurantePdfService {
  private readonly logger = new Logger(RestaurantePdfService.name);

  private buildBuffer(fn: (doc: any) => void): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFDocument = require('pdfkit');
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [226, 800], margin: 10, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      fn(doc);
      doc.end();
    });
  }

  private separator(doc: any) {
    doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2, { space: 2 }).stroke().undash();
    doc.moveDown(0.3);
  }

  async generarPreCuenta(comanda: any): Promise<Buffer> {
    return this.buildBuffer((doc) => {
      const W = 216;
      doc.fontSize(12).font('Helvetica-Bold').text('PRE-CUENTA', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(`Mesa: ${comanda.mesaNumero}  Área: ${comanda.areaNombre ?? '-'}`, { align: 'center' });
      doc.text(`Mesero: ${comanda.meseroNombre ?? '-'}  Personas: ${comanda.numPersonas}`, { align: 'center' });
      doc.text(`Comanda: ${comanda.numero}`, { align: 'center' });
      doc.text(`Fecha: ${new Date(comanda.fechaApertura).toLocaleString('es-DO')}`, { align: 'center' });
      this.separator(doc);

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Cant  Descripción', 10, doc.y, { continued: true });
      doc.text('Total', { align: 'right' });
      doc.font('Helvetica').fontSize(8);
      this.separator(doc);

      const items: any[] = comanda.items ?? [];
      let subtotal = 0;
      for (const item of items) {
        const t = Number(item.total ?? (item.precioUnitario * item.cantidad));
        subtotal += t;
        doc.text(`${String(item.cantidad).padStart(3)}  ${item.itemNombre}`, 10, doc.y, { continued: true, width: W - 50 });
        doc.text(`${t.toFixed(2)}`, { align: 'right' });
        const mods: any[] = item.modificaciones ?? [];
        for (const m of mods) {
          doc.fontSize(7).text(`     → ${m.nombre ?? m}`, { color: '#555' }).fontSize(8);
        }
        if (item.notasEspeciales) {
          doc.fontSize(7).text(`     * ${item.notasEspeciales}`, { color: '#555' }).fontSize(8);
        }
      }

      this.separator(doc);
      const propina = Number(comanda.propina ?? 0);
      const itbis = subtotal * 0.18;
      const total = subtotal + itbis + propina;

      doc.font('Helvetica').fontSize(9);
      doc.text('Subtotal:', 10, doc.y, { continued: true }); doc.text(`RD$${subtotal.toFixed(2)}`, { align: 'right' });
      if (propina > 0) {
        doc.text('Propina:', 10, doc.y, { continued: true }); doc.text(`RD$${propina.toFixed(2)}`, { align: 'right' });
      }
      doc.text('ITBIS (18%):', 10, doc.y, { continued: true }); doc.text(`RD$${itbis.toFixed(2)}`, { align: 'right' });
      this.separator(doc);
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('TOTAL:', 10, doc.y, { continued: true }); doc.text(`RD$${total.toFixed(2)}`, { align: 'right' });
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).text('¡Gracias por su visita!', { align: 'center' });
    }).catch(err => { this.logger.error('Error generando pre-cuenta PDF', err); throw err; });
  }

  async generarTicketCocina(comanda: any): Promise<Buffer> {
    return this.buildBuffer((doc) => {
      doc.fontSize(14).font('Helvetica-Bold').text('COCINA', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`COM: ${comanda.numero}  Mesa: ${comanda.mesaNumero}`, { align: 'center' });
      doc.text(`Hora: ${new Date(comanda.fechaApertura).toLocaleTimeString('es-DO')}  Ronda: #${comanda.items?.[0]?.numeroRonda ?? 1}`, { align: 'center' });
      if (comanda.notas) doc.text(`NOTA: ${comanda.notas}`, { align: 'center' });
      this.separator(doc);
      doc.fontSize(9).font('Helvetica');
      const items: any[] = comanda.items ?? [];
      for (const item of items) {
        doc.font('Helvetica-Bold').text(`${item.cantidad}x ${item.itemNombre}`);
        doc.font('Helvetica');
        const mods: any[] = item.modificaciones ?? [];
        for (const m of mods) doc.text(`  → ${m.nombre ?? m}`, { fontSize: 8 });
        if (item.notasEspeciales) doc.text(`  * ${item.notasEspeciales}`);
        doc.moveDown(0.3);
      }
    }).catch(err => { this.logger.error('Error generando ticket cocina PDF', err); throw err; });
  }

  async generarCierreTurno(data: { turno: any; resumen: any }): Promise<Buffer> {
    const { turno, resumen } = data;
    return this.buildBuffer((doc) => {
      doc.fontSize(13).font('Helvetica-Bold').text('CIERRE DE TURNO', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(`Turno: ${turno.numero}`, { align: 'center' });
      doc.text(`Cajero: ${turno.usuarioNombre ?? '-'}`, { align: 'center' });
      doc.text(`Apertura: ${new Date(turno.fechaApertura).toLocaleString('es-DO')}`, { align: 'center' });
      if (turno.fechaCierre) doc.text(`Cierre: ${new Date(turno.fechaCierre).toLocaleString('es-DO')}`, { align: 'center' });
      this.separator(doc);
      doc.fontSize(9).font('Helvetica');
      const row = (label: string, val: string | number) => {
        doc.text(label, 10, doc.y, { continued: true });
        doc.text(String(val), { align: 'right' });
      };
      row('Fondo inicial:', `RD$${Number(turno.fondoInicial).toFixed(2)}`);
      row('Total ventas:', `RD$${Number(turno.totalVentas).toFixed(2)}`);
      row('Efectivo:', `RD$${Number(turno.totalEfectivo).toFixed(2)}`);
      row('Tarjeta:', `RD$${Number(turno.totalTarjeta).toFixed(2)}`);
      row('Transferencia:', `RD$${Number(turno.totalTransferencia).toFixed(2)}`);
      row('Propinas:', `RD$${Number(turno.totalPropinas).toFixed(2)}`);
      row('Descuentos:', `RD$${Number(turno.totalDescuentos).toFixed(2)}`);
      this.separator(doc);
      if (turno.efectivoContado !== null) {
        row('Efectivo contado:', `RD$${Number(turno.efectivoContado).toFixed(2)}`);
        row('Diferencia:', `RD$${Number(turno.diferencia ?? 0).toFixed(2)}`);
        this.separator(doc);
      }
      if (resumen) {
        row('Comandas totales:', resumen.total ?? 0);
        row('Cobradas:', resumen.cobradas ?? 0);
      }
      if (turno.notas) { doc.moveDown(0.5); doc.text(`Notas: ${turno.notas}`); }
    }).catch(err => { this.logger.error('Error generando cierre turno PDF', err); throw err; });
  }
}
