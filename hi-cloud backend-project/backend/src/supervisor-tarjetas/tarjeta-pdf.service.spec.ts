import sharp from 'sharp';
import { MultiFormatReader, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { TarjetaPdfService } from './tarjeta-pdf.service';

/**
 * El Code128 de la tarjeta de supervisor dejó de escanearse en producción
 * (reporte real, 2026-10-07) mientras el QR —con el MISMO código— seguía
 * funcionando. Causa: paddingwidth:6 daba una zona muda real de solo
 * 1.24mm a los ~77.6mm de ancho final de la tarjeta — el estándar Code128
 * exige >= 10x el ancho de módulo (~2.2mm aquí) para que un escáner
 * ENCUENTRE el código, no solo para que lo lea. Un decoder de software al
 * que se le da la imagen ya recortada (como la verificación original de
 * este archivo) nunca iba a atrapar esto — no tiene que "encontrar" nada.
 *
 * Esta prueba mide la zona muda REAL en píxeles (no confía en el parámetro
 * de bwip-js a ciegas) y hace un round-trip de decodificación con un
 * decoder real a las resoluciones de impresión típicas — para que un
 * futuro cambio de paddingwidth que vuelva a angostar la zona muda, o que
 * rompa la decodificación, falle aquí antes que en una tarjeta impresa.
 */
const CODIGO = 'HSUPA1B2C3D4E5F6G7H8I9J0K1L2M3'; // 30 chars — el tamaño real del código
const ANCHO_TARJETA_MM = 77.6; // CARD_W (85.6mm) - 2*margen (4mm) — ver tarjeta-pdf.service.ts

async function zonaMudaMm(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const row = Math.floor(info.height / 2);
  let primerNoBlanco = -1;
  for (let x = 0; x < info.width; x++) {
    const i = (row * info.width + x) * 4;
    if (!(data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240)) { primerNoBlanco = x; break; }
  }
  return (primerNoBlanco / info.width) * ANCHO_TARJETA_MM;
}

async function decodeAResolucion(buf: Buffer, nativoW: number, nativoH: number, dpi: number): Promise<string | null> {
  const targetW = Math.round((ANCHO_TARJETA_MM / 25.4) * dpi);
  const targetH = Math.round(targetW * (nativoH / nativoW));
  const resized = await sharp(buf).resize(targetW, targetH, { kernel: 'cubic' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = resized;
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

describe('TarjetaPdfService — Code128 escaneable de verdad (no solo decodificable)', () => {
  const svc = new TarjetaPdfService();
  const generar = (): Promise<Buffer | null> =>
    (TarjetaPdfService.prototype as any).generarCode128.call(svc, CODIGO);

  it('la zona muda real (quiet zone) es >= 2.2mm por lado — el mínimo del estándar Code128', async () => {
    const buf = await generar();
    expect(buf).not.toBeNull();
    const mm = await zonaMudaMm(buf!);
    expect(mm).toBeGreaterThanOrEqual(2.2);
  });

  it('decodifica correctamente a resoluciones de impresión reales (203dpi y 300dpi)', async () => {
    const buf = await generar();
    expect(buf).not.toBeNull();
    const meta = await sharp(buf!).metadata();

    for (const dpi of [203, 300]) {
      const texto = await decodeAResolucion(buf!, meta.width!, meta.height!, dpi);
      expect(texto).toBe(CODIGO);
    }
  });
});
