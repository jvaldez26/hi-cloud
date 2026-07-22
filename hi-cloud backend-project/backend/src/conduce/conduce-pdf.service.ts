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

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
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
      doc.fillColor('#374151').font('Helvetica').fontSize(10)
        .text(`N°: ${cond.numero}   ·   Fecha: ${fmtFecha(cond.fecha)}`, PL, y + 28);

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
}
