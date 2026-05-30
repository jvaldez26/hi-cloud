import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as qrcode from 'qrcode';
import { Gasto } from './entities/gasto.entity';
import { TenantService } from '../tenant/tenant.service';

const PDFDocument = require('pdfkit') as typeof import('pdfkit');

const CATEGORIA_LABEL: Record<string, string> = {
  alquiler: 'Alquiler', servicios_publicos: 'Servicios Públicos', comunicaciones: 'Comunicaciones',
  nomina: 'Nómina', materiales_oficina: 'Materiales de Oficina', transporte: 'Transporte',
  marketing: 'Marketing / Publicidad', impuestos_tasas: 'Impuestos y Tasas', mantenimiento: 'Mantenimiento',
  seguros: 'Seguros', gastos_financieros: 'Gastos Financieros', gasto_menor: 'Gasto Menor', otros: 'Otros',
};

const MESES: Record<number, string> = {
  1:'Enero',2:'Febrero',3:'Marzo',4:'Abril',5:'Mayo',6:'Junio',
  7:'Julio',8:'Agosto',9:'Septiembre',10:'Octubre',11:'Noviembre',12:'Diciembre',
};

function fmtM(v: number): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtF(s: string | Date | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s + (String(s).includes('T') ? '' : 'T12:00:00'));
    return [String(d.getDate()).padStart(2,'0'), String(d.getMonth()+1).padStart(2,'0'), d.getFullYear()].join('/');
  } catch { return String(s); }
}

function fmtPeriodo(p: string | undefined): string {
  if (!p) return '';
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${MESES[Number(m[2])] ?? m[2]} ${m[1]}`;
}

@Injectable()
export class GastoPDFService {
  private readonly logger = new Logger(GastoPDFService.name);

  constructor(
    @InjectRepository(Gasto) private repo: Repository<Gasto>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const g = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!g) throw new NotFoundException(`Gasto #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    // ECF E43 asociado al gasto
    const ecf = await this.repo.manager.query(
      `SELECT e.numero, e."estadoDGII", e."codigoSeguridad", e."qrUrl",
              s."fechaVencimiento" AS "secFechaVenc"
       FROM ecf e
       LEFT JOIN secuencias_ecf s ON s.id = e."secuenciaId"
       WHERE e."documentoOrigenId"   = $1
         AND e."documentoOrigenTipo" = 'GASTO'
         AND e."isActive"            = true
       ORDER BY e."createdAt" DESC LIMIT 1`,
      [id],
    ).then((r: any[]) => r[0] || null);

    // Generar QR DGII si hay ECF
    let qrBase64 = '';
    if (ecf?.numero && empresa.rnc) {
      const urlQR = ecf.qrUrl
        ?? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${empresa.rnc}&eNCF=${ecf.numero}` +
           (ecf.codigoSeguridad ? `&CodigoSeguridadNCF=${ecf.codigoSeguridad}` : '');
      qrBase64 = await qrcode.toDataURL(urlQR, { width: 180, margin: 1, color: { dark: '#000', light: '#fff' } })
        .then(u => u.replace('data:image/png;base64,', ''))
        .catch(err => { this.logger.warn(`[GastoPDF] QR error: ${err.message}`); return ''; });
    }

    const numero = `GAS-${g.id.toString().padStart(6, '0')}`;
    const fechaVencSec = ecf?.secFechaVenc
      ? fmtF(ecf.secFechaVenc)
      : undefined;

    const buffer = await this.buildPDF({ g, empresa, ecf, qrBase64, numero, fechaVencSec });
    this.logger.log(`PDF E43 generado: ${numero}${ecf ? ' (' + ecf.numero + ')' : ''}`);
    return { buffer, filename: `${numero}.pdf` };
  }

  private buildPDF(ctx: {
    g: Gasto; empresa: any; ecf: any; qrBase64: string; numero: string; fechaVencSec?: string;
  }): Promise<Buffer> {
    const { g, empresa, ecf, qrBase64, numero, fechaVencSec } = ctx;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
        const chunks: Buffer[] = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PW = 595.28;
        const PL = 40;
        const PR = PW - 40;
        const W  = PR - PL;
        const THEAD = '#1a2c5b';
        const DARK  = '#111111';
        const GRAY  = '#555555';
        const LGRAY = '#f8f9fa';
        let y = 36;

        // ── HEADER IZQUIERDO — empresa ────────────────────────────────────────
        const ini = (empresa.nombreComercial || empresa.razonSocial || empresa.nombre || 'HC')
          .split(' ').slice(0,2).map((w:string) => w[0]).join('').toUpperCase();
        doc.rect(PL, y, 48, 48).fill(THEAD);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18)
          .text(ini, PL, y + 16, { width: 48, align: 'center' });

        const infoX = PL + 56;
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12)
          .text(empresa.nombreComercial || empresa.razonSocial || empresa.nombre || 'Mi Empresa', infoX, y, { width: 210 });
        let iy = y + 18;
        doc.font('Helvetica').fontSize(8).fillColor(GRAY);
        if (empresa.direccion) { doc.text(empresa.direccion + (empresa.ciudad ? ', '+empresa.ciudad : ''), infoX, iy, { width: 210 }); iy += 11; }
        if (empresa.email)     { doc.text('Correo: '+empresa.email, infoX, iy, { width: 210 }); iy += 11; }
        if (empresa.telefono)  { doc.text('Teléfono: '+empresa.telefono, infoX, iy, { width: 210 }); iy += 11; }
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text('RNC: '+empresa.rnc, infoX, iy);
        const leftBottom = Math.max(y + 52, iy + 14);

        // ── HEADER DERECHO — datos fiscales ───────────────────────────────────
        const rW = 215; const rX = PR - rW;
        let ry = y;
        doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(9.5)
          .text('COMPROBANTE DE GASTOS MENORES ELECTRÓNICO', rX, ry, { width: rW, align: 'right' });
        ry += 14;
        if (ecf?.numero) {
          doc.fillColor('#0047AB').font('Helvetica-Bold').fontSize(15)
            .text(ecf.numero, rX, ry, { width: rW, align: 'right' });
          ry += 20;
        }
        doc.fillColor(GRAY).font('Helvetica').fontSize(8.5);
        doc.text('Número interno: '+numero, rX, ry, { width: rW, align: 'right' }); ry += 11;
        if (fechaVencSec) { doc.text('Válida hasta: '+fechaVencSec, rX, ry, { width: rW, align: 'right' }); ry += 11; }
        doc.text('Fecha: '+fmtF(String(g.fecha)), rX, ry, { width: rW, align: 'right' }); ry += 11;
        // Estado badge
        const bW = 76; const bX = PR - bW;
        doc.roundedRect(bX, ry, bW, 17, 4).fill('#dcfce7');
        doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(8).text('EMITIDO', bX, ry+4, { width: bW, align: 'center' });
        ry += 22;

        y = Math.max(leftBottom, ry) + 10;

        // ── SEPARADOR ─────────────────────────────────────────────────────────
        doc.rect(PL, y, W, 2).fill(THEAD);
        y += 10;

        // ── SECCIÓN INFO (3 columnas) ─────────────────────────────────────────
        const col3W = Math.floor(W / 3);
        const infoItems = [
          { lbl: 'Categoría',   val: CATEGORIA_LABEL[g.categoria as string] ?? String(g.categoria) },
          { lbl: 'Período',     val: fmtPeriodo(g.periodo) },
          { lbl: 'Referencia',  val: g.proveedor ?? '—' },
        ];
        const boxH = 36;
        doc.rect(PL, y, W, boxH).strokeColor('#cccccc').lineWidth(0.5).stroke();
        doc.lineWidth(1);
        infoItems.forEach((item, i) => {
          const cx = PL + i * col3W;
          if (i > 0) { doc.moveTo(cx, y).lineTo(cx, y+boxH).strokeColor('#cccccc').lineWidth(0.5).stroke(); doc.lineWidth(1); }
          doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(7).text(item.lbl.toUpperCase(), cx+8, y+6, { width: col3W-16 });
          doc.fillColor(DARK).font('Helvetica').fontSize(9.5).text(item.val, cx+8, y+17, { width: col3W-16, ellipsis: true });
        });
        y += boxH + 10;

        // ── TABLA DE ÍTEMS ────────────────────────────────────────────────────
        const NUM_W = 24; const DESC_W = W - NUM_W - 55 - 75 - 70 - 75;
        const cols = [
          { lbl: '#',           w: NUM_W,  a: 'center' as const },
          { lbl: 'Descripción', w: DESC_W, a: 'left' as const },
          { lbl: 'Cant.',       w: 55,     a: 'right' as const },
          { lbl: 'Precio U.',   w: 75,     a: 'right' as const },
          { lbl: 'Exento',      w: 70,     a: 'right' as const },
          { lbl: 'Total',       w: 75,     a: 'right' as const },
        ];
        doc.rect(PL, y, W, 18).fill(THEAD);
        let hx = PL;
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7);
        cols.forEach(c => { doc.text(c.lbl.toUpperCase(), hx+3, y+5, { width: c.w-6, align: c.a }); hx += c.w; });
        y += 18;

        // Fila del gasto
        const monto = Number(g.monto);
        const total = Number(g.total);
        const rowData = [
          String(1),
          g.descripcion,
          '1',
          fmtM(monto),
          fmtM(monto),   // exento = monto (sin ITBIS)
          fmtM(total),
        ];
        doc.rect(PL, y, W, 18).fill(LGRAY);
        doc.moveTo(PL, y+18).lineTo(PR, y+18).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
        doc.lineWidth(1);
        let rx = PL;
        cols.forEach((c, i) => {
          doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
            .text(rowData[i], rx+3, y+5, { width: c.w-6, align: c.a, ellipsis: true });
          rx += c.w;
        });
        y += 18 + 12;

        // ── TOTALES ───────────────────────────────────────────────────────────
        const tW = 240; const tX = PR - tW;
        const addRow = (label: string, val: string, bold = false, color = DARK) => {
          doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(label+':', tX, y, { width: 130 });
          doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
            .text(val, tX+130, y, { width: tW-130, align: 'right' });
          doc.moveTo(tX, y+13).lineTo(PR, y+13).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
          doc.lineWidth(1);
          y += 14;
        };
        addRow('Subtotal Exento', fmtM(monto));
        addRow('ITBIS', 'RD$ 0.00 (Exento)', false, '#888');
        y += 3;
        doc.moveTo(tX, y).lineTo(PR, y).strokeColor(DARK).lineWidth(1).stroke(); doc.lineWidth(1); y += 5;
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('TOTAL COMPROBANTE:', tX, y, { width: 155 });
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a6e2a').text(fmtM(total), tX+140, y-1, { width: tW-140, align: 'right' });
        y += 26;

        // ── SECCIÓN SEGURIDAD FISCAL DGII ─────────────────────────────────────
        if (ecf?.numero) {
          doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#cccccc').lineWidth(1).stroke(); y += 10;
          doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(9).text('SEGURIDAD FISCAL DGII', PL, y); y += 14;

          // Info fiscal
          doc.fillColor(DARK).font('Helvetica').fontSize(8)
            .text(`e-NCF: ${ecf.numero}  ·  Tipo: E43  ·  Comprobante de Gastos Menores`, PL, y, { width: W });
          y += 11;

          const QR_SIZE = 80;
          const qrY = y;
          if (qrBase64) {
            try { doc.image(Buffer.from(qrBase64, 'base64'), PL, qrY, { width: QR_SIZE, height: QR_SIZE }); }
            catch(e: any) { this.logger.warn(`[GastoPDF] imagen QR: ${e.message}`); }
          }
          const sx = PL + QR_SIZE + 14; const sw = W - QR_SIZE - 14;
          let sy = qrY;
          if (ecf.codigoSeguridad) {
            doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(`Código de Seguridad: ${ecf.codigoSeguridad}`, sx, sy, { width: sw });
            sy += 12;
          }
          doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
            .text('La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.', sx, sy, { width: sw });
          y = qrY + QR_SIZE + 12;
        }

        // ── PIE LEGAL ─────────────────────────────────────────────────────────
        const footerY = Math.max(y + 8, 795);
        doc.moveTo(PL, footerY).lineTo(PR, footerY).strokeColor('#ddd').lineWidth(0.5).stroke();
        doc.fillColor('#666').font('Helvetica').fontSize(7.5)
          .text(
            'Este comprobante ampara gastos menores realizados por personal de la empresa. ' +
            'Emitido conforme a la Ley 32-23 y normativa DGII. ' +
            'Los montos reportados no pueden utilizarse como adelanto de ITBIS.',
            PL, footerY + 6, { width: W, align: 'center' },
          );

        doc.end();
      } catch(e) { reject(e); }
    });
  }
}
