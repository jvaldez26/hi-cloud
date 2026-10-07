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

// ── Code128 como VECTOR (nunca imagen rasterizada) ───────────────────────────
//
// Reporte real (2026-10-07): el código de barras, generado antes como PNG
// con bwip-js.toBuffer() e insertado con doc.image(), no se leía con un
// escáner de caja real en una tarjeta impresa en papel carta normal —
// causa raíz, en dos capas:
//   1. 30 caracteres alfanuméricos en Code Set B necesitan ~365 módulos;
//      en los ~77.6mm de ancho disponible eso da un módulo de ~0.21mm,
//      por debajo de lo que una impresora de oficina (no una impresora de
//      tarjetas PVC dedicada) puede reproducir sin que el toner/tinta
//      empaste las barras más finas.
//   2. Al rasterizar a PNG y reescalarlo con doc.image({width,height}),
//      cualquier imprecisión de interpolación entre el PNG nativo y el
//      tamaño final impreso se suma al problema — un vector dibujado
//      directamente a la escala final no tiene ese paso intermedio.
//
// El código se cambió a SOLO DÍGITOS (ver tarjeta-codigo.util.ts) para
// poder usar Code Set C (2 dígitos por símbolo — la mitad de módulos que
// Set B), y el código de barras ahora se dibuja como rectángulos de PDFKit
// (doc.rect().fill()), nunca como imagen.
//
// La codificación en sí (qué barra va dónde, el checksum mod 103, el
// cambio a Set C) la sigue resolviendo bwip-js — reescribir esa tabla a
// mano es la forma más fácil de producir un código de barras inválido sin
// que nadie lo note hasta que un escáner real falle. Lo que cambia es CÓMO
// se dibuja: en vez de pedirle a bwip-js un PNG (bwipjs.toBuffer), se usa
// su motor de renderizado con un "drawing backend" propio (bwipjs.render +
// un objeto que solo sabe hacer una cosa: anotar cada barra que bwip-js le
// manda dibujar) y esas barras se trasladan 1:1 a PDFKit, a la escala
// física exacta que se decide aquí.
const MODULO_MM       = 0.40; // mínimo pedido: 0.33mm — con margen real de sobra en el ancho de la tarjeta
const ZONA_MUDA_MODULOS = 10; // mínimo del estándar Code128 (>= 10x el ancho de módulo)
const ALTURA_BARRAS_MM  = 10; // mínimo pedido: 10mm

interface BarraCode128 { xModulos: number; anchoModulos: number; }

interface Code128Vector {
  barras: BarraCode128[];
  totalModulos: number;
}

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

  /**
   * Captura la codificación Code128 de bwip-js como vector (lista de barras
   * en unidades de MÓDULO, no píxeles) en vez de pedirle un PNG. `scale:1`
   * en bwip-js hace que 1 unidad de su sistema de dibujo = 1 módulo exacto
   * (verificado: para un código de 24 dígitos — Code Set C, 12 pares × 11 +
   * start 11 + checksum 11 + stop 13 — init() reporta un ancho total de 167
   * módulos, exactamente la cuenta de la especificación). Cada línea que
   * bwip-js dibuja ES una barra negra; los espacios blancos quedan
   * implícitos (nunca se dibujan, el fondo de la tarjeta ya es blanco).
   */
  private codificarCode128Vector(codigo: string): Code128Vector | null {
    try {
      const barras: BarraCode128[] = [];
      let totalModulos = 0;
      const drawing: any = {
        scale: (sx: number, sy: number) => [sx, sy],
        measure: () => ({ width: 0, ascent: 0, descent: 0 }),
        init: (w: number) => { totalModulos = w; },
        // bwip-js dibuja cada barra como una línea CENTRADA en x0 con grosor
        // lw (semántica estándar de "line": x0 es el centro del trazo, no el
        // borde izquierdo) — verificado barra por barra contra el PNG nativo
        // de bwip-js (bwipjs.toBuffer) para el mismo código. Para grosores
        // pares el borde izquierdo es exactamente x0-lw/2; para impares,
        // x0-Math.ceil(lw/2) (redondeo hacia la izquierda, no x0-lw/2 que
        // deja medio módulo de más a cada lado y descuadra TODAS las barras
        // siguientes — así fallaba el primer intento de este fix, con las
        // posiciones del lado derecho de la tarjeta cada vez más corridas).
        line: (x0: number, _y0: number, _x1: number, _y1: number, lw: number) => {
          barras.push({ xModulos: x0 - Math.ceil(lw / 2), anchoModulos: lw });
        },
        polygon: () => {},
        hexagon: () => {},
        ellipse: () => {},
        fill: () => {},
        text: () => {},
        end: () => {},
      };
      bwipjs.render({ bcid: 'code128', text: codigo, includetext: false, paddingwidth: 0, paddingheight: 0, scale: 1 }, drawing);
      if (!barras.length || !totalModulos) return null;
      return { barras, totalModulos };
    } catch (e: any) {
      this.logger.error(`[tarjeta-supervisor] Code128 (vector) falló: ${e?.message}`);
      return null;
    }
  }

  /**
   * Dibuja el código de barras VECTOR centrado dentro de un ancho disponible
   * (en puntos PDF), con zona muda real a cada lado — nunca una imagen.
   * Devuelve las medidas finales para poder registrarlas/loguearlas.
   */
  private dibujarCode128(
    doc: PDFKit.PDFDocument, codigo: string, xDisponible: number, yTop: number, anchoDisponible: number,
  ): { moduloMm: number; anchoBarrasMm: number; anchoTotalMm: number; alturaMm: number } | null {
    const vector = this.codificarCode128Vector(codigo);
    if (!vector) return null;

    const moduloPt = MODULO_MM * MM;
    const anchoBarrasPt = vector.totalModulos * moduloPt;
    const zonaMudaPt = ZONA_MUDA_MODULOS * moduloPt;
    const anchoTotalPt = anchoBarrasPt + zonaMudaPt * 2;
    const alturaPt = ALTURA_BARRAS_MM * MM;

    // Centrado dentro del ancho disponible de la tarjeta.
    const offsetX = xDisponible + (anchoDisponible - anchoTotalPt) / 2 + zonaMudaPt;

    doc.save();
    doc.fillColor('#000000');
    for (const b of vector.barras) {
      doc.rect(offsetX + b.xModulos * moduloPt, yTop, b.anchoModulos * moduloPt, alturaPt).fill();
    }
    doc.restore();

    return {
      moduloMm: MODULO_MM,
      anchoBarrasMm: anchoBarrasPt / MM,
      anchoTotalMm: anchoTotalPt / MM,
      alturaMm: ALTURA_BARRAS_MM,
    };
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
   * con frente+reverso lado a lado (mismo dibujo, otro origen y a tamaño
   * físico real — ver generarPdfHoja).
   */
  private dibujarFrente(doc: PDFKit.PDFDocument, x0: number, y0: number, w: number, h: number, d: DatosTarjetaPdf, qrBuf: Buffer | null) {
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

    // Código de barras — vector, centrado, con zona muda real a cada lado.
    // Banda reservada desde el borde inferior: barras (10mm) + aire (2mm) +
    // línea de "Tarjeta ••••" (2mm) = 14mm.
    const bandaInferior = 14 * MM;
    const codeY = y0 + h - margen - bandaInferior;
    const codeW = w - margen * 2;
    const medidas = this.dibujarCode128(doc, d.codigo, x0 + margen, codeY, codeW);
    if (medidas) {
      this.logger.debug(
        `[tarjeta-supervisor] Code128: módulo ${medidas.moduloMm}mm, barras ${medidas.anchoBarrasMm.toFixed(2)}mm, ` +
        `total con zona muda ${medidas.anchoTotalMm.toFixed(2)}mm, altura ${medidas.alturaMm}mm`,
      );
    }

    // "Tarjeta ••••XXXX" — el código completo NUNCA se imprime en texto legible.
    doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(6.5)
      .text(`Tarjeta ••••${d.ultimosCuatro}`, x0 + margen, codeY + ALTURA_BARRAS_MM * MM + 2 * MM, { width: codeW, align: 'right' });
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
    const qrBuf = await this.generarQR(d.codigo);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [CARD_W, CARD_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.dibujarFrente(doc, 0, 0, CARD_W, CARD_H, d, qrBuf);
      doc.addPage({ size: [CARD_W, CARD_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      this.dibujarReverso(doc, 0, 0, CARD_W, CARD_H, d);

      doc.end();
    });
  }

  /**
   * Opción 2: PDF en hoja carta, frente y reverso lado a lado con marcas de
   * corte — para imprimir en papel y plastificar. Las tarjetas se dibujan a
   * su tamaño FÍSICO REAL (85.6 × 54mm, la misma función dibujarFrente/
   * dibujarReverso que la Opción 1, solo con otro origen) — nada en este
   * archivo aplica doc.scale() ni ningún otro factor de escala. El único
   * riesgo de que salgan más chicas es el diálogo de impresión del
   * visor/sistema operativo (p. ej. "Ajustar al papel" activado), que está
   * fuera del control del PDF — por eso el aviso impreso en la hoja.
   */
  async generarPdfHoja(d: DatosTarjetaPdf): Promise<Buffer> {
    const qrBuf = await this.generarQR(d.codigo);

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
      const y0 = (pageH - CARD_H) / 2 - 10 * MM; // deja aire abajo para el aviso de impresión

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

      this.dibujarFrente(doc, x0, y0, CARD_W, CARD_H, d, qrBuf);
      dibujarMarcasCorte(x0, y0);
      doc.rect(x0, y0, CARD_W, CARD_H).lineWidth(0.4).strokeColor('#CCCCCC').stroke();

      const x1 = x0 + CARD_W + gap;
      this.dibujarReverso(doc, x1, y0, CARD_W, CARD_H, d);
      dibujarMarcasCorte(x1, y0);
      doc.rect(x1, y0, CARD_W, CARD_H).lineWidth(0.4).strokeColor('#CCCCCC').stroke();

      // Aviso de impresión — el tamaño real de la tarjeta depende de que el
      // diálogo de impresión NO reescale la página (ver el comentario del
      // método sobre por qué esto no se puede forzar desde el PDF).
      doc.fillColor('#DC2626').font('Helvetica-Bold').fontSize(9)
        .text('Imprima en tamaño real (100%), sin "Ajustar a la página" — de lo contrario el código de barras no escaneará.',
          36, y0 + CARD_H + 14 * MM, { width: pageW - 72, align: 'center' });
      doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(8)
        .text(`Tamaño real de cada tarjeta: 85.6 × 54mm (CR80).`,
          36, y0 + CARD_H + 14 * MM + 14, { width: pageW - 72, align: 'center' });

      doc.end();
    });
  }
}
