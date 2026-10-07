import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';

/**
 * HOTFIX urgente (2026-10-07, producción) — Sentry/incidente real: FAC-1705
 * y otras facturas mostraban "Comprobante fiscal pendiente de emisión" con
 * "No se puede cambiar de 'emitida' a 'emitida'". Causa: el camino síncrono
 * de emitir-pos puede tardar más que el timeout del cliente (15s) cuando
 * MSeller está lento — el cajero reintenta sobre la MISMA venta (el propio
 * modal lo invitaba a hacerlo) y, para cuando esa segunda petición llega, la
 * primera YA escribió estado=EMITIDA. Antes de este guard, eso reventaba
 * contra el BadRequestException genérico de transición de estados.
 *
 * Este es el fix MÍNIMO (sin el candado pg_advisory_xact_lock de la rama
 * grande en curso, que cierra además la carrera verdaderamente concurrente):
 * una relectura simple de factura.estado, ya hecha por cambiarEstado() al
 * principio — suficiente para el patrón observado (la primera petición ya
 * terminó de escribir EMITIDA cuando llega la segunda).
 */
function buildService(estadoActual: FacturaEstado, ecf: any = null) {
  const svc: any = Object.create(FacturasService.prototype);
  svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };

  const facturaBase = {
    id: 777, empresaId: 61, estado: estadoActual,
    fecha: new Date(), folio: 'FAC-1705', total: 1000,
    tipoPago: 'CONTADO', usuarioId: 94, ecfId: ecf ? 55 : null,
  };

  svc.findOne = jest.fn().mockResolvedValue({ ...facturaBase, ecf });
  return { svc };
}

describe('cambiarEstado() — segundo emitir-pos sobre una factura ya emitida/pagada (hotfix 2026-10-07)', () => {
  it.each([FacturaEstado.EMITIDA, FacturaEstado.PAGADA])(
    'factura ya %s + e-CF en curso (pendiente_envio) → devuelve enCurso:true con el estado real, NO lanza',
    async (estadoActual) => {
      const ecf = { estadoDGII: 'pendiente_envio', numero: 'E320000000001', qrUrl: null, trackId: 't1', codigoSeguridad: '123456' };
      const { svc } = buildService(estadoActual, ecf);

      const resultado: any = await svc.cambiarEstado(777, FacturaEstado.EMITIDA);

      expect(resultado).toMatchObject({
        enCurso: true,
        estado:  'pendiente_envio',   // el estado del e-CF manda, no el de la factura
        encf:    'E320000000001',
        trackId: 't1',
      });
    },
  );

  it('factura ya EMITIDA + e-CF ya ACEPTADO → también enCurso:true, con estado=aceptado (el POS lo trata como éxito, no "en proceso")', async () => {
    const ecf = { estadoDGII: 'aceptado', numero: 'E320000000001', qrUrl: 'https://dgii.test/qr', trackId: 't1', codigoSeguridad: '123456' };
    const { svc } = buildService(FacturaEstado.EMITIDA, ecf);

    const resultado: any = await svc.cambiarEstado(777, FacturaEstado.EMITIDA);

    expect(resultado).toMatchObject({ enCurso: true, estado: 'aceptado', qrUrl: 'https://dgii.test/qr' });
  });

  it('factura ya EMITIDA sin ninguna fila de e-CF (caso raro) → enCurso:true con el estado de la FACTURA como fallback', async () => {
    const { svc } = buildService(FacturaEstado.EMITIDA, null);

    const resultado: any = await svc.cambiarEstado(777, FacturaEstado.EMITIDA);

    expect(resultado).toMatchObject({ enCurso: true, estado: FacturaEstado.EMITIDA });
  });

  it('CANCELADA → EMITIDA (una transición de verdad inválida, no un doble envío) sigue rechazándose como antes', async () => {
    const { svc } = buildService(FacturaEstado.CANCELADA, null);

    await expect(svc.cambiarEstado(777, FacturaEstado.EMITIDA)).rejects.toThrow(
      /No se puede cambiar de "cancelada" a "emitida"/,
    );
  });
});
