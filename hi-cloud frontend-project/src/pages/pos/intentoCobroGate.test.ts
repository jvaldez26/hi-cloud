import { describe, it, expect } from 'vitest';
import { resolverIntentoCobro } from './intentoCobroGate';

describe('resolverIntentoCobro', () => {
  it('sin intento previo, no reutiliza — crea una factura nueva', () => {
    expect(resolverIntentoCobro(null, '{"a":1}')).toEqual({ reusar: false });
  });

  it('payload IDÉNTICO al del intento previo — reutiliza esa factura', () => {
    const previo = { factura: { id: 1, folio: 'FAC-1' }, claveIdempotencia: 'k1', payloadStr: '{"a":1}' };
    expect(resolverIntentoCobro(previo, '{"a":1}')).toEqual({
      reusar: true,
      factura: previo.factura,
      claveIdempotencia: 'k1',
    });
  });

  it('payload DISTINTO (el cajero cambió algo antes de reintentar) — no reutiliza', () => {
    const previo = { factura: { id: 1, folio: 'FAC-1' }, claveIdempotencia: 'k1', payloadStr: '{"a":1}' };
    expect(resolverIntentoCobro(previo, '{"a":2}')).toEqual({ reusar: false });
  });
});
