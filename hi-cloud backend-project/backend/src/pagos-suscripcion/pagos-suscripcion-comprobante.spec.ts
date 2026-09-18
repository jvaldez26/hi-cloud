import { PagosSuscripcionService } from './pagos-suscripcion.service';

/**
 * Regresión del bug: subirComprobante() guardaba una URL pública directa de
 * S3 en "comprobanteUrl" — pero ambos buckets bloquean acceso público (ver
 * docs/aws-credentials.md), así que esa URL siempre devolvía 403 y el
 * comprobante nunca se podía ver en el panel de cobros del Super Admin.
 *
 * Fix: se guarda solo la key ("comprobanteKey") y conComprobanteResuelto()
 * firma la URL on-demand (15 min) al leer — mismo patrón que
 * activacion-ecf.service.ts (comprobantePagoKey + getSignedUrl()). Ver
 * migración 1763900000000-ComprobanteKeyPagosSuscripcion.
 */
describe('PagosSuscripcionService — conComprobanteResuelto()', () => {
  const svc = (s3: any) =>
    new PagosSuscripcionService({} as any, {} as any, {} as any, s3, {} as any, {} as any, {} as any);

  it('con comprobanteKey (S3): firma una URL de 15 min y nunca expone la key cruda', async () => {
    const getSignedUrl = jest.fn(async (key: string, expiresIn: number) =>
      `https://signed.example.com/${key}?exp=${expiresIn}`,
    );
    const [r] = await (svc({ getSignedUrl }) as any).conComprobanteResuelto([
      { id: 1, comprobanteUrl: null, comprobanteKey: 'comprobantes/7/abc123.png' },
    ]);
    expect(getSignedUrl).toHaveBeenCalledWith('comprobantes/7/abc123.png', 900);
    expect(r.comprobanteUrl).toBe('https://signed.example.com/comprobantes/7/abc123.png?exp=900');
    expect(r).not.toHaveProperty('comprobanteKey');
  });

  it('sin comprobanteKey (fallback de disco local o filas viejas): deja comprobanteUrl tal cual', async () => {
    const getSignedUrl = jest.fn();
    const [r] = await (svc({ getSignedUrl }) as any).conComprobanteResuelto([
      { id: 2, comprobanteUrl: 'https://hicloudrd.com/uploads/comprobantes/x.png', comprobanteKey: null },
    ]);
    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(r.comprobanteUrl).toBe('https://hicloudrd.com/uploads/comprobantes/x.png');
  });

  it('nunca guarda una URL pública de S3 — subirComprobante() usa uploadKey(), no upload()', () => {
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync(require.resolve('./pagos-suscripcion.service.ts'), 'utf8');
    const bloque = src.slice(src.indexOf('async subirComprobante('), src.indexOf('private async'));
    expect(bloque).toContain('this.s3.uploadKey(');
    expect(bloque).not.toMatch(/comprobanteUrl\s*=\s*await this\.s3\.upload\(/);
  });
});
