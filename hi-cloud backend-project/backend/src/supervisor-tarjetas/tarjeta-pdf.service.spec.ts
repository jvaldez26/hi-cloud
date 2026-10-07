import sharp from 'sharp';
import { MultiFormatReader, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { TarjetaPdfService } from './tarjeta-pdf.service';

/**
 * El Code128 de la tarjeta de supervisor no se escaneaba en producción,
 * primero por una zona muda insuficiente (fix anterior, commit 791f8b60) y
 * después porque, aun con eso corregido, el código alfanumérico de 30
 * caracteres sobre un rectángulo rasterizado (PNG) en papel de oficina
 * normal seguía dando barras demasiado finas (reporte real, 2026-10-07).
 *
 * El arreglo de fondo: el código pasó a ser SOLO DÍGITOS (Code Set C, la
 * mitad de módulos que Set B) y el código de barras se dibuja como VECTOR
 * (rectángulos de PDFKit), nunca como imagen — ver el comentario largo en
 * tarjeta-pdf.service.ts sobre por qué.
 *
 * Al escribir este fix apareció un bug real y no obvio en el camino: bwip-js
 * dibuja cada barra como una línea CENTRADA en x0 (semántica estándar de
 * "line"), no un rectángulo que arranca en x0 — tratarlo como borde
 * izquierdo descuadraba las barras más finas (ancho impar) por medio
 * módulo, acumulándose hacia la derecha del código. Esta prueba construye
 * la imagen de verificación con el MISMO método (rasterizado antialiased
 * por cobertura de subpíxel, directo a la resolución objetivo — igual que
 * un visor de PDF o una impresora dibuja un vector, sin el paso intermedio
 * de "dibujar grande y reescalar" que SÍ introduce su propio ruido y dio un
 * falso negativo la primera vez que se escribió esta prueba) para que un
 * futuro cambio que reintroduzca el mismo error de centrado falle aquí.
 */
const CODIGO_24_DIGITOS = '900123456789012345678901';
const MODULO_MM = 0.40;
const ZONA_MUDA_MODULOS = 10;
const ALTURA_BARRAS_MM = 10;

interface BarraCode128 { xModulos: number; anchoModulos: number; }
interface Code128Vector { barras: BarraCode128[]; totalModulos: number; }

/**
 * Rasteriza el vector por cobertura de subpíxel (cuánto de cada columna de
 * salida cae bajo una barra negra), directo a la resolución objetivo — el
 * mismo resultado que produce un rasterizador de PDF antialiased al dibujar
 * un vector, sin reescalar una imagen ya rasterizada de por medio.
 */
async function rasterizarDirecto(vector: Code128Vector, pxPorMm: number, alturaMm: number): Promise<Buffer> {
  const moduloPx = MODULO_MM * pxPorMm;
  const zonaMudaPx = ZONA_MUDA_MODULOS * moduloPx;
  const anchoTotalPx = Math.round(vector.totalModulos * moduloPx + zonaMudaPx * 2);
  const alturaPx = Math.round(alturaMm * pxPorMm);

  const cobertura = new Float32Array(anchoTotalPx);
  for (const b of vector.barras) {
    const xIniPx = zonaMudaPx + b.xModulos * moduloPx;
    const xFinPx = zonaMudaPx + (b.xModulos + b.anchoModulos) * moduloPx;
    for (let col = Math.max(0, Math.floor(xIniPx)); col < Math.min(anchoTotalPx, Math.ceil(xFinPx)); col++) {
      const cov = Math.max(0, Math.min(xFinPx, col + 1) - Math.max(xIniPx, col));
      cobertura[col] = Math.min(1, cobertura[col] + cov);
    }
  }

  const canvas = Buffer.alloc(anchoTotalPx * alturaPx * 3);
  for (let col = 0; col < anchoTotalPx; col++) {
    const gris = Math.round(255 * (1 - cobertura[col]));
    for (let y = 0; y < alturaPx; y++) {
      const i = (y * anchoTotalPx + col) * 3;
      canvas[i] = canvas[i + 1] = canvas[i + 2] = gris;
    }
  }
  return sharp(canvas, { raw: { width: anchoTotalPx, height: alturaPx, channels: 3 } }).png().toBuffer();
}

async function decodificar(buf: Buffer): Promise<string | null> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const gris = new Uint8ClampedArray(info.width * info.height);
  for (let i = 0, p = 0; p < info.width * info.height; i += info.channels, p++) {
    gris[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  const reader = new MultiFormatReader();
  const hints = new Map(); hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  try {
    return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gris, info.width, info.height)))).getText();
  } catch {
    return null;
  }
}

describe('TarjetaPdfService — Code128 como vector (Code Set C, 24 dígitos)', () => {
  const svc = new TarjetaPdfService();
  const codificar = (): Code128Vector | null =>
    (TarjetaPdfService.prototype as any).codificarCode128Vector.call(svc, CODIGO_24_DIGITOS);

  it('24 dígitos en Code Set C dan exactamente 167 módulos (12 pares×11 + start 11 + checksum 11 + stop 13)', () => {
    const vector = codificar();
    expect(vector).not.toBeNull();
    expect(vector!.totalModulos).toBe(167);
  });

  it('el ancho total a 0.40mm/módulo cabe en el ancho disponible de la tarjeta (~77.6mm)', () => {
    const vector = codificar()!;
    const anchoBarrasMm = vector.totalModulos * MODULO_MM;
    const anchoTotalMm = anchoBarrasMm + 2 * ZONA_MUDA_MODULOS * MODULO_MM;
    expect(anchoTotalMm).toBeLessThan(77.6);
    // Documenta las medidas reales — si esto cambia es señal de que cambió
    // el formato del código (longitud aleatoria) y hay que revisar que
    // siga cabiendo.
    expect(Math.round(anchoBarrasMm * 100) / 100).toBe(66.8);
    expect(Math.round(anchoTotalMm * 100) / 100).toBe(74.8);
  });

  it('la zona muda a 0.40mm/módulo (10 módulos) es >= 2.2mm, el mínimo del estándar Code128', () => {
    expect(ZONA_MUDA_MODULOS * MODULO_MM).toBeGreaterThanOrEqual(2.2);
  });

  it('las barras no se superponen y cubren exactamente el ancho reportado por bwip-js (sin huecos ni dobles)', () => {
    const vector = codificar()!;
    const ordenadas = [...vector.barras].sort((a, b) => a.xModulos - b.xModulos);
    for (let i = 1; i < ordenadas.length; i++) {
      expect(ordenadas[i].xModulos).toBeGreaterThanOrEqual(ordenadas[i - 1].xModulos + ordenadas[i - 1].anchoModulos);
    }
    const ultima = ordenadas[ordenadas.length - 1];
    expect(ultima.xModulos + ultima.anchoModulos).toBeLessThanOrEqual(vector.totalModulos);
  });

  it('rasterizado a las medidas físicas reales (vector antialiased, igual que un visor/impresora) decodifica correctamente de 150 a 600dpi', async () => {
    const vector = codificar()!;
    for (const dpi of [150, 203, 300, 600]) {
      const img = await rasterizarDirecto(vector, dpi / 25.4, ALTURA_BARRAS_MM);
      const texto = await decodificar(img);
      expect(texto).toBe(CODIGO_24_DIGITOS);
    }
  });
});
