import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as qrcode from 'qrcode';
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { Compra } from './entities/compra.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';
import { altoDeLinea, celdaSinEnvolver } from '../common/pdf/columnas-numericas.helper';

const ESTADO_COLOR: Record<string, string> = {
  recibida: 'green', pagada: 'blue', pendiente: 'orange', anulada: 'red',
};

@Injectable()
export class ComprasPdfService {
  private readonly logger = new Logger(ComprasPdfService.name);

  constructor(
    @InjectRepository(Compra)  private compraRepo:  Repository<Compra>,
    @InjectRepository(Empresa) private empresaRepo: Repository<Empresa>,
    private tenantService: TenantService,
    private ds: DataSource,
  ) {}

  async generarOrdenCompraPDF(compraId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantService.getEmpresaId();

    const compra = await this.compraRepo.findOne({
      where: { id: compraId, empresaId, isActive: true },
      relations: ['proveedor', 'detalles', 'detalles.producto', 'usuario'],
    });
    if (!compra) throw new NotFoundException(`Compra #${compraId} no encontrada`);

    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId, isActive: true } });
    const proveedor = (compra as any).proveedor ?? {};

    // Buscar e-CF E41 asociado a esta compra
    const ecf = await this.ds.query<any[]>(
      `SELECT numero, "codigoSeguridad", "qrUrl", "estadoDGII", "fechaFirma", "respuestaMSeller"
       FROM ecf
       WHERE "documentoOrigenTipo" = 'COMPRA'
         AND "documentoOrigenId"   = $1
         AND "empresaId"           = $2
         AND "isActive"            = true
       ORDER BY "createdAt" DESC LIMIT 1`,
      [compraId, empresaId],
    ).then(r => r[0] ?? null);

    const sucursalNombre: string | undefined = (compra as any).sucursalId
      ? await this.ds.query<any[]>(
          'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
          [(compra as any).sucursalId],
        ).then(r => r[0]?.nombre ?? undefined)
      : undefined;

    const esInformal = !proveedor.rnc || proveedor.rnc === '000000000' || proveedor.esInformal === true;

    if (ecf && !ecf.fechaFirma) ecf.fechaFirma = msellerSignedDate(ecf.respuestaMSeller);

    if (esInformal && ecf?.numero) {
      const buffer = await this.generarE41PDF(compra, empresa, proveedor, ecf);
      this.logger.log(`PDF E41 fiscal generado: ${compra.folio} (${ecf.numero})`);
      return { buffer, filename: `${compra.folio}-E41.pdf` };
    }

    // Layout simple (orden de compra sin e-CF)
    const data: DocData = {
      tipo:        'ORDEN DE COMPRA',
      numero:      compra.folio,
      fecha:       String(compra.fecha),
      estado:      compra.estado ?? 'pendiente',
      estadoColor: ESTADO_COLOR[(compra.estado ?? 'pendiente').toLowerCase()] ?? 'orange',
      empresa: {
        nombre:    empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
        rnc:       empresa?.rnc ?? '',
        direccion: empresa?.direccion ?? '',
        ciudad:    empresa?.ciudad,
        telefono:  empresa?.telefono,
        email:     empresa?.email,
      },
      participante: {
        label:  'Proveedor',
        nombre: proveedor.nombre || '—',
        rnc:    proveedor.rnc,
        tel:    proveedor.telefono,
        email:  proveedor.email,
      },
      campos: [
        ...((compra as any).usuario?.nombre
          ? [{ label: 'Elaborado por', valor: (compra as any).usuario.nombre }]
          : []),
        ...(sucursalNombre ? [{ label: 'Sucursal', valor: sucursalNombre }] : []),
      ],
      items: (compra.detalles ?? []).map((d: any) => {
        const sub  = Number(d.precioUnitario) * Number(d.cantidad);
        const itbs = sub * (Number(d.porcentajeItbis ?? 18) / 100);
        return {
          descripcion:    d.descripcion,
          cantidad:       Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
          importe:        sub + itbs,
        };
      }),
      totales: [
        { label: 'Subtotal',    valor: Number(compra.subtotal) },
        { label: 'ITBIS (18%)', valor: Number(compra.itbis) },
        { label: 'Total Orden', valor: Number(compra.total), bold: true },
      ],
      notas: compra.notas ?? undefined,
      pie: '¡Gracias por su preferencia! HiCloud ERP · República Dominicana',
    };

    const buffer = await generarDocumentoPDF(data);
    this.logger.log(`PDF Orden de Compra generado: ${compra.folio}`);
    return { buffer, filename: `${compra.folio}.pdf` };
  }

  // ── Layout fiscal E41 ──────────────────────────────────────────────────────
  private async generarE41PDF(
    compra: Compra,
    empresa: Empresa | null,
    proveedor: any,
    ecf: { numero: string; codigoSeguridad: string; qrUrl?: string; estadoDGII?: string; fechaFirma?: string | null },
  ): Promise<Buffer> {
    // Generar QR
    let qrBase64 = '';
    const empresaRnc = empresa?.rnc ?? '';
    const urlQR = ecf.qrUrl
      ?? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${empresaRnc}&eNCF=${ecf.numero}` +
         (ecf.codigoSeguridad ? `&CodigoSeguridadNCF=${ecf.codigoSeguridad}` : '');
    try {
      const dataUrl = await qrcode.toDataURL(urlQR, { width: 180, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      qrBase64 = dataUrl.replace('data:image/png;base64,', '');
    } catch (err: any) {
      this.logger.warn(`[ComprasPDF] No se pudo generar QR para ${ecf.numero}: ${err.message}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PW = 595.28; // A4 width
        const M  = 40;     // margin
        const CW = PW - M * 2; // content width
        let y = M;

        const fmt = (n: number) =>
          'RD$ ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // ── HEADER ──────────────────────────────────────────────────────────
        // Izquierda: empresa
        doc.fontSize(13).font('Helvetica-Bold')
           .text(empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa', M, y, { width: CW * 0.55 });
        y += 16;
        doc.fontSize(8).font('Helvetica').fillColor('#555555');
        if (empresa?.direccion) {
          doc.text(empresa.direccion, M, y, { width: CW * 0.55 }); y += 10;
        }
        if (empresa?.email)   { doc.text(`Correo: ${empresa.email}`,   M, y, { width: CW * 0.55 }); y += 10; }
        if (empresa?.telefono){ doc.text(`Teléfono: ${empresa.telefono}`, M, y, { width: CW * 0.55 }); y += 10; }
        if (empresa?.rnc)     { doc.text(`RNC: ${empresa.rnc}`,          M, y, { width: CW * 0.55 }); y += 10; }

        // Derecha: título fiscal
        const RX = M + CW * 0.55;
        const RW = CW * 0.45;
        let ry = M;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a')
           .text('COMPROBANTE DE COMPRAS ELECTRÓNICO', RX, ry, { width: RW, align: 'right' });
        ry += 14;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0047AB')
           .text(ecf.numero, RX, ry, { width: RW, align: 'right' });
        ry += 18;
        doc.fontSize(8).font('Helvetica').fillColor('#555555')
           .text(`Número interno: ${compra.folio}`, RX, ry, { width: RW, align: 'right' });
        ry += 11;
        const fechaStr = compra.fecha
          ? new Date(compra.fecha).toLocaleDateString('es-DO', { day:'2-digit', month:'2-digit', year:'numeric' })
          : '—';
        doc.text(`Fecha: ${fechaStr}`, RX, ry, { width: RW, align: 'right' });
        ry += 11;
        const estado = (compra.estado ?? 'pendiente').toUpperCase();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a6e2a')
           .text(estado, RX, ry, { width: RW, align: 'right' });

        y = Math.max(y, ry + 14) + 6;

        // Separador
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(1).strokeColor('#cccccc').stroke();
        y += 10;

        // ── DATOS DEL PROVEEDOR ─────────────────────────────────────────────
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#333333')
           .text('DATOS DEL PROVEEDOR', M, y);
        y += 12;
        doc.fontSize(8).font('Helvetica').fillColor('#555555')
           .text(`RNC o Cédula: ${proveedor.rnc || '—'}`, M, y, { width: CW * 0.5 })
           .text(`Nombre o Razón Social: ${proveedor.nombre || '—'}`, M + CW * 0.5, y, { width: CW * 0.5 });
        y += 11;
        if (proveedor.direccion) {
          doc.text(`Dirección: ${proveedor.direccion}`, M, y, { width: CW }); y += 11;
        }
        if (proveedor.telefono) {
          doc.text(`Teléfono: ${proveedor.telefono}`, M, y, { width: CW * 0.5 }); y += 11;
        }
        y += 4;

        // Separador
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
        y += 10;

        // ── TABLA DE PRODUCTOS ─────────────────────────────────────────────
        const COL = {
          num:    { x: M,                 w: 20 },
          desc:   { x: M + 20,            w: CW * 0.38 },
          cant:   { x: M + 20 + CW*0.38,  w: 40 },
          precio: { x: M + 20 + CW*0.38 + 40, w: 80 },
          itbis:  { x: M + 20 + CW*0.38 + 120, w: 45 },
          imp:    { x: M + CW - 70,       w: 70 },
        };

        const LINE_H = altoDeLinea(doc, 'Helvetica', 7.5);

        // Cabecera tabla
        doc.rect(M, y, CW, 16).fillColor('#1a2c5b').fill();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('#',           COL.num.x + 2,    y + 4, { width: COL.num.w    });
        doc.text('DESCRIPCIÓN', COL.desc.x + 2,   y + 4, { width: COL.desc.w   });
        doc.text('CANT.',       COL.cant.x,        y + 4, { width: COL.cant.w,  align: 'center' });
        doc.text('P. UNIT.',    COL.precio.x,      y + 4, { width: COL.precio.w,align: 'right'  });
        doc.text('ITBIS%',      COL.itbis.x,       y + 4, { width: COL.itbis.w, align: 'center' });
        doc.text('IMPORTE',     COL.imp.x,         y + 4, { width: COL.imp.w,   align: 'right'  });
        y += 16;

        const detalles = (compra.detalles ?? []) as any[];
        detalles.forEach((d, i) => {
          const sub  = Number(d.precioUnitario) * Number(d.cantidad);
          const pct  = Number(d.porcentajeItbis ?? 18);
          const itb  = sub * (pct / 100);
          const tot  = sub + itb;
          const rowH = 16;

          if (i % 2 === 0) {
            doc.rect(M, y, CW, rowH).fillColor('#f8f9fa').fill();
          }
          doc.fontSize(7.5).font('Helvetica').fillColor('#333333');
          // rowH es FIJO (16pt) y cada celda se dibuja a y+4: si un texto no
          // cabe y PDFKit lo envuelve, la segunda línea cae encima de la fila
          // siguiente, porque la altura no crece con el contenido. Un documento
          // solapado se lee peor que uno recortado, así que toda celda va en una
          // sola línea. `ellipsis: true` a secas NO basta — hace falta el
          // `height`; ver columnas-numericas.helper.ts.
          const unaLinea = (w: number, align: 'left' | 'right' | 'center' = 'left') =>
            celdaSinEnvolver(w, align, LINE_H);
          doc.text(String(i + 1),           COL.num.x + 2,    y + 4, unaLinea(COL.num.w));
          doc.text(d.descripcion ?? '',      COL.desc.x + 2,   y + 4, unaLinea(COL.desc.w - 4));
          doc.text(String(Number(d.cantidad)), COL.cant.x,     y + 4, unaLinea(COL.cant.w,  'center'));
          doc.text(fmt(Number(d.precioUnitario)), COL.precio.x, y + 4, unaLinea(COL.precio.w, 'right'));
          doc.text(`${pct.toFixed(0)}%`,     COL.itbis.x,      y + 4, unaLinea(COL.itbis.w, 'center'));
          doc.text(fmt(tot),                 COL.imp.x,        y + 4, unaLinea(COL.imp.w,   'right'));
          y += rowH;
        });

        // Separador tabla
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
        y += 10;

        // ── TOTALES ────────────────────────────────────────────────────────
        const TW = 160;
        const TX = M + CW - TW;
        const subtotalGrav = Number(compra.subtotal);
        const itbisTotal   = Number(compra.itbis);
        const totalGen     = Number(compra.total);

        // La fila avanza 13pt fijos: el importe también va en una sola línea,
        // por el mismo motivo que las de la tabla.
        const LINE_H_TOT = altoDeLinea(doc, 'Helvetica', 8);

        const addTotalRow = (label: string, valor: number, bold = false, color = '#333333') => {
          doc.fontSize(8)
             .font(bold ? 'Helvetica-Bold' : 'Helvetica')
             .fillColor(color)
             .text(label, TX, y, { width: TW * 0.55 })
             .text(fmt(valor), TX + TW * 0.55, y,
               celdaSinEnvolver(TW * 0.45, 'right', LINE_H_TOT));
          y += 13;
        };

        addTotalRow('Subtotal Gravado:',  subtotalGrav);
        addTotalRow('Subtotal Exento:',   0);
        addTotalRow('ITBIS Total (18%):', itbisTotal, false, '#e07000');
        doc.moveTo(TX, y).lineTo(TX + TW, y).lineWidth(0.5).strokeColor('#999999').stroke();
        y += 4;
        addTotalRow('TOTAL COMPROBANTE:', totalGen, true, '#0047AB');
        y += 6;

        // ── SECCIÓN SEGURIDAD FISCAL DGII ──────────────────────────────────
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(1).strokeColor('#cccccc').stroke();
        y += 10;

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
           .text('SEGURIDAD FISCAL DGII', M, y);
        y += 14;

        const QR_SIZE = 82;
        const qrY = y;

        // QR a la izquierda
        if (qrBase64) {
          try {
            const qrBuf = Buffer.from(qrBase64, 'base64');
            doc.image(qrBuf, M, qrY, { width: QR_SIZE, height: QR_SIZE });
          } catch (err: any) {
            this.logger.warn(`[ComprasPDF] No se pudo insertar QR en PDF: ${err.message}`);
          }
        }

        // Texto de seguridad a la derecha del QR
        const SX = M + QR_SIZE + 16;
        const SW = CW - QR_SIZE - 16;
        let sy = qrY;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#333333')
           .text(`Código de Seguridad: ${ecf.codigoSeguridad ?? '—'}`, SX, sy, { width: SW });
        sy += 12;
        if (ecf.fechaFirma) {
          const fmtDTlocal = (s: string) => {
            try {
              const dt = new Date(s);
              if (isNaN(dt.getTime())) return s;
              const fmt = new Intl.DateTimeFormat('es', {
                timeZone: 'America/Santo_Domingo',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
              });
              const p = Object.fromEntries(fmt.formatToParts(dt).map(x => [x.type, x.value]));
              return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
            } catch { return s; }
          };
          doc.fontSize(7.5).font('Helvetica').fillColor('#666666')
             .text('Fecha y Hora de Firma:', SX, sy, { width: SW }); sy += 11;
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333333')
             .text(fmtDTlocal(String(ecf.fechaFirma)), SX, sy, { width: SW }); sy += 12;
        }
        doc.fontSize(7.5).font('Helvetica').fillColor('#666666')
           .text(
             'La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.',
             SX, sy, { width: SW },
           );
        sy += 22;
        doc.fontSize(7).fillColor('#888888')
           .text('Escanear código QR para verificar en: ecf.dgii.gov.do', SX, sy, { width: SW });

        y = qrY + QR_SIZE + 14;

        // ── NOTAS LEGALES AL PIE ────────────────────────────────────────────
        doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor('#dddddd').stroke();
        y += 8;
        doc.fontSize(7).font('Helvetica').fillColor('#888888')
           .text('Este comprobante ampara la compra realizada a proveedor no registrado.', M, y, { width: CW });
        y += 10;
        doc.text(`RNC Emisor: ${empresaRnc}  ·  Emitido por: HiCloud ERP  ·  República Dominicana`, M, y, { width: CW });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

function msellerSignedDate(resp: unknown): Date | undefined {
  const sd = (resp as any)?.signedDate;
  if (!sd) return undefined;
  const m = String(sd).match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`) : undefined;
}
