import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bwipjs = require('bwip-js') as typeof import('bwip-js');

const TZ = 'America/Santo_Domingo';
const MM = 72 / 25.4; // puntos por milímetro (PDFKit trabaja en puntos, 72/pulgada)

// ── Medidas de la tarjeta CR80 (85.6 × 54 mm) ────────────────────────────────
const CARD_W = 85.6 * MM;
const CARD_H = 54 * MM;

const AZUL_HICLOUD   = '#185FA5';
const AZUL_CLARO     = '#B5D4F4';
const GRIS_TEXTO     = '#6B7280';
const GRIS_OSCURO    = '#1F2937';

export interface DatosTarjetaPdf {
  nombre:          string;
  role:            string;
  empresaNombre:   string;
  sucursalNombre?: string | null;
  codigo:          string;       // completo — solo se usa para generar los códigos, NUNCA se imprime en texto
  ultimosCuatro:   string;
  emitidaEn:       Date;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', contador: 'Contador', super_admin: 'Super Admin',
};

function fmtFechaRD(d: Date): string {
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
}

@Injectable()
export class TarjetaPdfService {
  private readonly logger = new Logger(TarjetaPdfService.name);

  private async generarCode128(codigo: string): Promise<Buffer | null> {
    try {
      return await bwipjs.toBuffer({
        bcid: 'code128', text: codigo, scale: 3, height: 8,
        includetext: false, paddingwidth: 6, paddingheight: 1,
        backgroundcolor: 'FFFFFF', // bwip-js genera fondo transparente por defecto — un escáner no lo decodifica
      });
    } catch (e: any) {
      this.logger.error(`[tarjeta-supervisor] Code128 falló: ${e?.message}`);
      return null;
    }
  }

  private async generarQR(codigo: string): Promise<Buffer | null> {
    try {
      // Nivel de corrección de errores por defecto de bwip-js para QR ya es 'M'
      // — no está en los tipos de la librería (gap de sus .d.ts), así que no
      // se pasa explícito para no romper la resolución de sobrecargas de toBuffer.
      return await bwipjs.toBuffer({
        bcid: 'qrcode', text: codigo, scale: 3,
        backgroundcolor: 'FFFFFF',
      });
    } catch (e: any) {
      this.logger.error(`[tarjeta-supervisor] QR falló: ${e?.message}`);
      return null;
    }
  }

  /**
   * Dibuja el FRENTE dentro del rectángulo (x0,y0,w,h) dado — reutilizable
   * tanto para la página de tarjeta sola (w=CARD_W) como para la hoja carta
   * con frente+reverso lado a lado (mismo dibujo, otro origen).
   */
  private dibujarFrente(doc: PDFKit.PDFDocument, x0: number, y0: number, w: number, h: number, d: DatosTarjetaPdf, codeBuf: Buffer | null, qrBuf: Buffer | null) {
    const margen = 4 * MM;
    const franjaH = 8 * MM;

    // Franja superior azul
    doc.save();
    doc.rect(x0, y0, w, franjaH).fill(AZUL_HICLOUD);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
      .text('HiCloud', x0 + margen, y0 + franjaH / 2 - 5, { lineBreak: false });
    doc.fillColor(AZUL_CLARO).font('Helvetica').fontSize(7)
      .text('Tarjeta de supervisor', x0, y0 + franjaH / 2 - 3.5, { width: w - margen, align: 'right' });
    doc.restore();

    // Cuerpo — izquierda: nombre/rol/empresa; derecha: QR
    const cuerpoY = y0 + franjaH + 3 * MM;
    const qrLado = 17 * MM;
    const textoAncho = w - margen * 2 - qrLado - 3 * MM;

    doc.fillColor(GRIS_OSCURO).font('Helvetica-Bold').fontSize(10)
      .text(d.nombre, x0 + margen, cuerpoY, { width: textoAncho, lineBreak: true });
    const rolY = doc.y + 1;
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(8)
      .text(ROLE_LABEL[d.role] ?? d.role, x0 + margen, rolY, { width: textoAncho });

    const empresaY = doc.y + 4;
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(7)
      .text(d.empresaNombre, x0 + margen, empresaY, { width: textoAncho });
    if (d.sucursalNombre) {
      doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(7)
        .text(d.sucursalNombre, x0 + margen, doc.y + 1, { width: textoAncho });
    }

    if (qrBuf) {
      doc.image(qrBuf, x0 + w - margen - qrLado, cuerpoY, { width: qrLado, height: qrLado });
    }

    // Código de barras — todo el ancho disponible, con zona muda (ya incluida
    // por bwip-js vía paddingwidth) y margen a los lados del cuerpo.
    const codeY = y0 + h - margen - 11 * MM;
    const codeW = w - margen * 2;
    if (codeBuf) {
      doc.image(codeBuf, x0 + margen, codeY, { width: codeW, height: 7 * MM });
    }

    // "Tarjeta ••••XXXX" — el código completo NUNCA se imprime en texto legible.
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(6.5)
      .text(`Tarjeta ••••${d.ultimosCuatro}`, x0 + margen, y0 + h - margen - 3, { width: codeW, align: 'right' });
  }

  private dibujarReverso(doc: PDFKit.PDFDocument, x0: number, y0: number, w: number, h: number, d: DatosTarjetaPdf) {
    const margen = 4 * MM;
    let cursorY = y0 + 5 * MM;

    // Candado simple dibujado a mano (sin depender de una fuente de íconos)
    const lx = x0 + margen, ly = cursorY;
    doc.save();
    doc.roundedRect(lx, ly + 3, 7, 5, 1).fill(GRIS_OSCURO);
    doc.lineWidth(1.3).strokeColor(GRIS_OSCURO)
      .moveTo(lx + 1.3, ly + 3).lineTo(lx + 1.3, ly + 1.5)
      .bezierCurveTo(lx + 1.3, ly - 1, lx + 5.7, ly - 1, lx + 5.7, ly + 1.5)
      .lineTo(lx + 5.7, ly + 3).stroke();
    doc.restore();

    doc.fillColor(GRIS_OSCURO).font('Helvetica-Bold').fontSize(9)
      .text('Personal e intransferible', lx + 12, ly, { width: w - margen * 2 - 12 });

    cursorY = doc.y + 8;
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(7.5)
      .text('Pásala por el escáner de la caja para autorizar acciones del modo supervisor.',
        x0 + margen, cursorY, { width: w - margen * 2, lineGap: 1 });

    cursorY = doc.y + 6;
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(7.5)
      .text('Si la pierdes, revócala de inmediato en HiCloud: Mi perfil, tarjeta de supervisor.',
        x0 + margen, cursorY, { width: w - margen * 2, lineGap: 1 });

    // Pie — línea fina + fecha de emisión / dominio
    const pieY = y0 + h - margen - 8;
    doc.moveTo(x0 + margen, pieY).lineTo(x0 + w - margen, pieY)
      .lineWidth(0.5).strokeColor('#D1D5DB').stroke();
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(6.5)
      .text(`Emitida el ${fmtFechaRD(d.emitidaEn)}`, x0 + margen, pieY + 3, { width: (w - margen * 2) / 2, lineBreak: false });
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(6.5)
      .text('hicloudrd.com', x0 + margen, pieY + 3, { width: w - margen * 2, align: 'right', lineBreak: false });
  }

  /** Opción 1: PDF de UNA tarjeta, 2 páginas (frente/reverso) a tamaño físico CR80 — para impresora de tarjetas PVC. */
  async generarPdfTarjeta(d: DatosTarjetaPdf): Promise<Buffer> {
    const [codeBuf, qrBuf] = await Promise.all([this.generarCode128(d.codigo), this.generarQR(d.codigo)]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [CARD_W, CARD_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.dibujarFrente(doc, 0, 0, CARD_W, CARD_H, d, codeBuf, qrBuf);
      doc.addPage({ size: [CARD_W, CARD_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      this.dibujarReverso(doc, 0, 0, CARD_W, CARD_H, d);

      doc.end();
    });
  }

  /** Opción 2: PDF en hoja carta, frente y reverso lado a lado con marcas de corte — para imprimir en papel y plastificar. */
  async generarPdfHoja(d: DatosTarjetaPdf): Promise<Buffer> {
    const [codeBuf, qrBuf] = await Promise.all([this.generarCode128(d.codigo), this.generarQR(d.codigo)]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const gap = 6 * MM;
      const totalW = CARD_W * 2 + gap;
      const x0 = (pageW - totalW) / 2;
      const y0 = (pageH - CARD_H) / 2;

      const dibujarMarcasCorte = (x: number, y: number) => {
        const largo = 3 * MM, off = 1.5 * MM;
        doc.lineWidth(0.4).strokeColor('#999999');
        // 4 esquinas, cada una con dos trazos en L hacia afuera del rectángulo
        const esquinas = [[x, y], [x + CARD_W, y], [x, y + CARD_H], [x + CARD_W, y + CARD_H]];
        for (const [cx, cy] of esquinas) {
          const dx = cx === x ? -1 : 1;
          const dy = cy === y ? -1 : 1;
          doc.moveTo(cx + dx * off, cy).lineTo(cx + dx * (off + largo), cy).stroke();
          doc.moveTo(cx, cy + dy * off).lineTo(cx, cy + dy * (off + largo)).stroke();
        }
      };

      this.dibujarFrente(doc, x0, y0, CARD_W, CARD_H, d, codeBuf, qrBuf);
      dibujarMarcasCorte(x0, y0);
      doc.rect(x0, y0, CARD_W, CARD_H).lineWidth(0.4).strokeColor('#CCCCCC').stroke();

      const x1 = x0 + CARD_W + gap;
      this.dibujarReverso(doc, x1, y0, CARD_W, CARD_H, d);
      dibujarMarcasCorte(x1, y0);
      doc.rect(x1, y0, CARD_W, CARD_H).lineWidth(0.4).strokeColor('#CCCCCC').stroke();

      doc.end();
    });
  }
}
