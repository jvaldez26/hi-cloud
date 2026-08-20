import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { Conduce } from './entities/conduce.entity';
import { TenantService } from '../tenant/tenant.service';

const ESTADO_LABEL: Record<string, string> = {
  generado:    'Generado',
  en_transito: 'En Tránsito',
  entregado:   'Entregado',
  devuelto:    'Devuelto',
};

const ESTADO_HEX: Record<string, string> = {
  generado:    '#d97706',
  en_transito: '#2563eb',
  entregado:   '#16a34a',
  devuelto:    '#dc2626',
};

function fmtFecha(d: any): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

@Injectable()
export class ConducePDFService {
  constructor(
    @InjectRepository(Conduce) private repo: Repository<Conduce>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number, formato: 'carta' | 'termico' = 'carta'): Promise<{ buffer: Buffer; filename: string }> {
    if (formato === 'termico') return this.generarPDFTermico(id);
    const empresaId = this.tenantSvc.getEmpresaId();
    const cond = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!cond) throw new NotFoundException(`Conduce #${id} no encontrado`);

    const empresaRows: any[] = await this.repo.manager.query(
      'SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    );
    const empresa = empresaRows[0] ?? {};
    const nombreEmpresa: string = empresa.nombreComercial || empresa.nombre || 'Mi Empresa';
    const estadoLabel = ESTADO_LABEL[cond.estado] ?? cond.estado;
    const estadoHex   = ESTADO_HEX[cond.estado]   ?? '#2563eb';

    const sucursalNombre: string | undefined = (cond as any).sucursalId
      ? await this.repo.manager.query(
          'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
          [(cond as any).sucursalId],
        ).then((r: any[]) => r[0]?.nombre ?? undefined)
      : undefined;

    const facturaFolio: string | undefined = cond.facturaId
      ? await this.repo.manager.query(
          'SELECT folio FROM facturas WHERE id = $1 LIMIT 1',
          [cond.facturaId],
        ).then((r: any[]) => r[0]?.folio ?? undefined)
      : undefined;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50, compress: true });
      const chunks: Buffer[] = [];
      doc.on('data',  c  => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W   = doc.page.width  - 100; // ancho útil
      const PL  = 50;                    // margen izquierdo
      const PR  = doc.page.width - 50;  // margen derecho
      const brandBlue = '#1e40af';

      // ── Franja de cabecera ──────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 78).fill(brandBlue);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
        .text(nombreEmpresa, PL, 18, { width: W * 0.65 });
      doc.font('Helvetica').fontSize(9)
        .text(`RNC: ${empresa.rnc || '—'}  ·  Tel: ${empresa.telefono || '—'}`, PL, 40)
        .text(empresa.direccion || '', PL, 52);

      // Badge de estado (esquina superior derecha)
      const badgeX = PR - 120;
      doc.roundedRect(badgeX, 20, 115, 26, 5).fill(estadoHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
        .text(estadoLabel.toUpperCase(), badgeX, 27, { width: 115, align: 'center' });

      // ── Título CONDUCE ──────────────────────────────────────────────────────
      let y = 98;
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(22)
        .text('CONDUCE / NOTA DE ENTREGA', PL, y);
      const refLine = facturaFolio
        ? `N°: ${cond.numero}   ·   Fecha: ${fmtFecha(cond.fecha)}   ·   Ref. Factura: ${facturaFolio}`
        : `N°: ${cond.numero}   ·   Fecha: ${fmtFecha(cond.fecha)}`;
      doc.fillColor('#374151').font('Helvetica').fontSize(10)
        .text(refLine, PL, y + 28);

      // ── Línea separadora ────────────────────────────────────────────────────
      y += 52;
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 10;

      // ── Dos columnas: destinatario / detalles entrega ───────────────────────
      const colW  = W / 2 - 10;
      const colR  = PL + colW + 20;
      const yTop  = y;

      // Columna izquierda — DESTINATARIO
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('DESTINATARIO / CLIENTE', PL, y);
      y += 14;
      const cli = (cond as any).cliente ?? {};
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
        .text(cli.nombre || 'Sin cliente', PL, y, { width: colW });
      y += 14;
      if (cli.rncReceptor) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(`RNC: ${cli.rncReceptor}`, PL, y); y += 12;
      }
      if (cli.direccion) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(cli.direccion, PL, y, { width: colW }); y += 12;
      }
      if (cli.telefono) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(`Tel: ${cli.telefono}`, PL, y); y += 12;
      }
      if (cli.email) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(cli.email, PL, y); y += 12;
      }

      // Columna derecha — DETALLES DE ENTREGA
      let yr = yTop;
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('DETALLES DE ENTREGA', colR, yr);
      yr += 14;

      const infoRows: [string, string][] = [
        ['Dirección', cond.direccionEntrega + (cond.ciudad ? ', ' + cond.ciudad : '')],
      ];
      if (cond.fechaEntregaProgramada) infoRows.push(['Entrega programada', fmtFecha(cond.fechaEntregaProgramada)]);
      if (cond.contactoEntrega)        infoRows.push(['Contacto', cond.contactoEntrega + (cond.telefonoContacto ? '  ' + cond.telefonoContacto : '')]);
      if (cond.conductor)              infoRows.push(['Conductor', cond.conductor]);
      if (cond.vehiculo)               infoRows.push(['Vehículo',  cond.vehiculo]);
      if (sucursalNombre)              infoRows.push(['Sucursal',  sucursalNombre]);

      for (const [label, val] of infoRows) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
          .text(label.toUpperCase(), colR, yr, { width: colW });
        doc.font('Helvetica').fontSize(9).fillColor('#111827')
          .text(val, colR, yr + 9, { width: colW });
        yr += 24;
      }

      // Avanzar y al mayor de las dos columnas + margen
      y = Math.max(y, yr) + 16;

      // ── Separador ──────────────────────────────────────────────────────────
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 12;

      // ── Tabla de ítems ─────────────────────────────────────────────────────
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('ARTÍCULOS / MERCANCÍA', PL, y);
      y += 16;

      // Cabecera de tabla
      const colWidths = [30, W - 30 - 60 - 50 - 100, 60, 50, 100]; // #, Desc, Cant, U.M., Notas
      const headers   = ['#', 'Descripción', 'Cantidad', 'U.M.', 'Obs / Devuelta'];
      const aligns    = ['center', 'left', 'right', 'center', 'left'] as const;
      let cx = PL;

      doc.rect(PL, y, W, 18).fill('#1e3a8a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      let hx = PL;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], hx + 4, y + 4, { width: colWidths[i] - 8, align: aligns[i] });
        hx += colWidths[i];
      }
      y += 18;

      const detalles: any[] = (cond as any).detalles ?? [];
      if (detalles.length === 0) {
        doc.rect(PL, y, W, 22).fill('#f9fafb').stroke();
        doc.fillColor('#9ca3af').font('Helvetica').fontSize(9)
          .text('Sin ítems registrados', PL, y + 6, { width: W, align: 'center' });
        y += 22;
      } else {
        detalles.forEach((d: any, idx: number) => {
          const rowH  = 20;
          const bg    = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
          doc.rect(PL, y, W, rowH).fill(bg).stroke('#e5e7eb');

          const nota = Number(d.cantidadDevuelta ?? 0) > 0
            ? `Dev: ${Number(d.cantidadDevuelta)}`
            : (d.observaciones ?? '');

          const rowData = [
            String(idx + 1),
            d.descripcion ?? '',
            Number(d.cantidad).toString(),
            d.unidadMedida ?? 'PZA',
            nota,
          ];

          cx = PL;
          for (let i = 0; i < rowData.length; i++) {
            doc.fillColor('#111827').font('Helvetica').fontSize(8)
              .text(rowData[i], cx + 4, y + 5, {
                width: colWidths[i] - 8,
                align: aligns[i],
                ellipsis: true,
              });
            cx += colWidths[i];
          }
          y += rowH;
        });
      }

      y += 16;

      // ── Notas ──────────────────────────────────────────────────────────────
      if (cond.notas) {
        doc.rect(PL, y, W, 1).fill('#e5e7eb');
        y += 8;
        doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9).text('NOTAS', PL, y);
        y += 12;
        doc.fillColor('#374151').font('Helvetica').fontSize(9)
          .text(cond.notas, PL, y, { width: W });
        y += doc.heightOfString(cond.notas, { width: W }) + 12;
      }

      // ── Área de firmas ─────────────────────────────────────────────────────
      const needsNewPage = y + 90 > doc.page.height - 60;
      if (needsNewPage) { doc.addPage(); y = 50; }
      else y += 12;

      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 20;

      const sigW   = W / 3 - 8;
      const sigGap = 12;
      const sigs   = ['Preparado por', 'Entregado por', 'Recibido conforme'];
      for (let i = 0; i < 3; i++) {
        const sx = PL + i * (sigW + sigGap);
        // Línea de firma
        doc.moveTo(sx, y + 36).lineTo(sx + sigW, y + 36).strokeColor('#374151').lineWidth(0.5).stroke();
        // Etiqueta
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
          .text(sigs[i], sx, y + 40, { width: sigW, align: 'center' });
      }

      // ── Pie de página ──────────────────────────────────────────────────────
      const footerY = doc.page.height - 38;
      doc.rect(0, footerY, doc.page.width, 38).fill('#f1f5f9');
      doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
        .text(
          `Este conduce certifica la entrega de la mercancía descrita. La firma del receptor acredita conformidad.  ·  HiCloud ERP · República Dominicana`,
          PL, footerY + 8, { width: W, align: 'center' },
        );
      doc.fillColor('#9ca3af').fontSize(7)
        .text(`Generado: ${new Date().toLocaleString('es-DO')}`, PL, footerY + 22, { width: W, align: 'right' });

      doc.end();
    });

    return { buffer, filename: `${cond.numero}.pdf` };
  }

  // ── PDF Térmico 80mm ───────────────────────────────────────────────────────
  private async generarPDFTermico(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cond = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!cond) throw new NotFoundException(`Conduce #${id} no encontrado`);

    const empresaRows: any[] = await this.repo.manager.query(
      'SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    );
    const empresa     = empresaRows[0] ?? {};
    const nombreEmpresa: string = empresa.nombreComercial || empresa.nombre || 'Mi Empresa';
    const estadoLabel = ESTADO_LABEL[cond.estado] ?? cond.estado;
    const facturaFolio: string | undefined = cond.facturaId
      ? await this.repo.manager.query(
          'SELECT folio FROM facturas WHERE id = $1 LIMIT 1',
          [cond.facturaId],
        ).then((r: any[]) => r[0]?.folio ?? undefined)
      : undefined;

    const detalles: any[] = (cond as any).detalles ?? [];

    // 80mm térmico: 226pt × altura generosa (recortado por la impresora)
    const W  = 226;
    const M  = 8;   // margen
    const UW = W - M * 2; // ancho útil = 210pt

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: [W, 1800], margin: M, compress: true, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data',  c  => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const center = (text: string, y: number, size = 8, bold = false) => {
        doc.fillColor('#000000')
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(size)
          .text(text, M, y, { width: UW, align: 'center' });
      };
      const line = (y: number) => {
        doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#000000').lineWidth(0.5).dash(2, { space: 2 }).stroke().undash();
      };

      let y = M;

      // Cabecera empresa
      center(nombreEmpresa, y, 9, true); y += 14;
      if (empresa.rnc)      { center(`RNC: ${empresa.rnc}`,       y, 7); y += 10; }
      if (empresa.telefono) { center(`Tel: ${empresa.telefono}`,  y, 7); y += 10; }
      if (empresa.direccion){ center(empresa.direccion,           y, 7); y += 10; }

      line(y); y += 6;

      // Cabecera del conduce
      center('CONDUCE / NOTA DE ENTREGA', y, 8, true); y += 12;
      center(cond.numero, y, 11, true); y += 14;
      doc.fillColor('#000').font('Helvetica').fontSize(7)
        .text(`Fecha: ${fmtFecha(cond.fecha)}`, M, y); y += 10;
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7)
        .text(`Estado: ${estadoLabel.toUpperCase()}`, M, y); y += 10;
      if (facturaFolio) {
        doc.fillColor('#000').font('Helvetica').fontSize(7)
          .text(`Ref. Factura: ${facturaFolio}`, M, y); y += 10;
      }

      line(y); y += 6;

      // Cliente
      const cli = (cond as any).cliente ?? {};
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7).text('CLIENTE', M, y); y += 10;
      doc.font('Helvetica').fontSize(8).text(cli.nombre || '—', M, y, { width: UW }); y += 12;
      if (cli.rncReceptor) { doc.fontSize(7).text(`RNC: ${cli.rncReceptor}`, M, y); y += 10; }
      if (cond.direccionEntrega) { doc.fontSize(7).text(cond.direccionEntrega, M, y, { width: UW }); y += 10; }
      if (cond.contactoEntrega)  { doc.fontSize(7).text(`Contacto: ${cond.contactoEntrega}`, M, y); y += 10; }
      if (cond.conductor)        { doc.fontSize(7).text(`Conductor: ${cond.conductor}`, M, y); y += 10; }

      line(y); y += 6;

      // Artículos
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7).text('ARTÍCULOS', M, y); y += 10;

      // Cabecera mini-tabla
      const descW = UW - 40 - 22; // Desc | Cant | UM
      doc.font('Helvetica-Bold').fontSize(6.5)
        .text('DESCRIPCIÓN',          M,            y, { width: descW })
        .text('CANT',   M + descW,    y, { width: 40,  align: 'right' })
        .text('U.M.',   M + descW + 40, y, { width: 22, align: 'center' });
      y += 9;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#000').lineWidth(0.3).stroke(); y += 4;

      if (detalles.length === 0) {
        doc.font('Helvetica').fontSize(7).text('Sin ítems', M, y, { width: UW, align: 'center' }); y += 12;
      } else {
        for (const d of detalles) {
          const cant = Number(d.cantidad).toLocaleString('es-DO', { maximumFractionDigits: 2 });
          const nota = Number(d.cantidadDevuelta ?? 0) > 0 ? ` (Dev:${d.cantidadDevuelta})` : '';
          doc.font('Helvetica').fontSize(7)
            .text(d.descripcion + nota, M, y, { width: descW, ellipsis: true })
            .text(cant,               M + descW, y, { width: 40,  align: 'right' })
            .text(d.unidadMedida ?? 'PZA', M + descW + 40, y, { width: 22, align: 'center' });
          y += 11;
        }
      }

      line(y); y += 6;

      // Notas
      if (cond.notas) {
        doc.font('Helvetica-Bold').fontSize(7).text('NOTAS:', M, y); y += 10;
        doc.font('Helvetica').fontSize(7).text(cond.notas, M, y, { width: UW }); y += 10;
        line(y); y += 6;
      }

      // Firmas
      y += 8;
      const sigW2 = (UW - 8) / 2;
      doc.moveTo(M,             y + 22).lineTo(M + sigW2,             y + 22).strokeColor('#000').lineWidth(0.5).stroke();
      doc.moveTo(M + sigW2 + 8, y + 22).lineTo(M + UW,                y + 22).strokeColor('#000').lineWidth(0.5).stroke();
      doc.fillColor('#000').font('Helvetica').fontSize(6.5)
        .text('Entregado por',    M,             y + 25, { width: sigW2, align: 'center' })
        .text('Recibido conforme', M + sigW2 + 8, y + 25, { width: sigW2, align: 'center' });
      y += 44;

      // Pie
      line(y); y += 6;
      center('HiCloud ERP · República Dominicana', y, 6); y += 9;
      center(`Generado: ${new Date().toLocaleString('es-DO')}`, y, 5.5);

      doc.end();
    });

    return { buffer, filename: `${cond.numero}-termico.pdf` };
  }
}
