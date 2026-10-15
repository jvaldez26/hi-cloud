import { FacturasService } from './facturas.service';

/**
 * findAll()/findOne()/buscarParaNota() — Configuración → Punto de Venta →
 * "Ocultar montos de facturas al cajero" (activado por defecto). Un
 * VENDEDOR sin modo supervisor activo nunca debe recibir total/subtotal/
 * ITBIS/formasPago (ni el costo de compra por línea) en la respuesta —
 * "no basta con ocultarlo en pantalla" (requisito explícito del usuario,
 * 2026-10-15): la protección real vive en el backend, no en el render.
 *
 * Métodos privados probados vía `.call({...})`, mismo patrón que
 * facturas-vendedor-filtro.spec.ts.
 */
function makeCtx(opts: { supervisorActivo: boolean; ocultarMontos: boolean }) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('pos_supervisor_log')) return Promise.resolve(opts.supervisorActivo ? [{ id: 1 }] : []);
    if (sql.includes('FROM empresa')) return Promise.resolve([{ configuracion: { ocultarMontosFacturasCajero: opts.ocultarMontos } }]);
    return Promise.resolve([]);
  });
  const ctx: any = {
    tenantService: { getEmpresaId: () => 7, getSucursalId: () => null },
    dataSource:    { query },
    tieneSupervisorActivo:          (FacturasService.prototype as any).tieneSupervisorActivo,
    ocultarMontosActivoParaEmpresa: (FacturasService.prototype as any).ocultarMontosActivoParaEmpresa,
    debeOcultarMontos:              (FacturasService.prototype as any).debeOcultarMontos,
    ocultarMontosFactura:           (FacturasService.prototype as any).ocultarMontosFactura,
  };
  for (const k of ['tieneSupervisorActivo', 'ocultarMontosActivoParaEmpresa', 'debeOcultarMontos', 'ocultarMontosFactura']) {
    ctx[k] = ctx[k].bind(ctx);
  }
  return ctx;
}

const FACTURA_BASE = {
  id: 1, folio: 'FAC-0001', estado: 'emitida',
  subtotal: 1000, iva: 180, total: 1180, totalOriginal: 1180,
  formasPago: [{ tipo: 1, monto: 1180 }],
  detalles: [
    { id: 1, descripcion: 'Producto X', cantidad: 2, precioUnitario: 500, subtotal: 1000, importeIva: 180, total: 1180, descuentoMonto: 0, costoUnitario: 300 },
  ],
};

describe('FacturasService — ocultar montos al cajero (Configuración → Punto de Venta)', () => {
  describe('findOne()', () => {
    function ctxFindOne(opts: { supervisorActivo: boolean; ocultarMontos: boolean }) {
      const ctx = makeCtx(opts);
      ctx.facturaRepository = {
        findOne: jest.fn().mockResolvedValue({ ...FACTURA_BASE }),
        manager: { query: jest.fn().mockResolvedValue([]) },
      };
      return ctx;
    }

    it('VENDEDOR sin supervisor activo, toggle ON: la respuesta NO trae total/subtotal/ITBIS/formasPago ni costo de línea', async () => {
      const ctx = ctxFindOne({ supervisorActivo: false, ocultarMontos: true });
      const r: any = await (FacturasService.prototype as any).findOne.call(ctx, 1, { id: 5, role: 'vendedor' });
      expect(r.total).toBeUndefined();
      expect(r.subtotal).toBeUndefined();
      expect(r.iva).toBeUndefined();
      expect(r.totalOriginal).toBeUndefined();
      expect(r.formasPago).toBeUndefined();
      expect(r.detalles[0].precioUnitario).toBeUndefined();
      expect(r.detalles[0].total).toBeUndefined();
      expect(r.detalles[0].costoUnitario).toBeUndefined();
      // Lo que SÍ debe seguir viéndose — folio, estado, descripción, cantidad.
      expect(r.folio).toBe('FAC-0001');
      expect(r.detalles[0].descripcion).toBe('Producto X');
      expect(r.detalles[0].cantidad).toBe(2);
    });

    it('VENDEDOR CON supervisor activo: ve todo, igual que admin', async () => {
      const ctx = ctxFindOne({ supervisorActivo: true, ocultarMontos: true });
      const r: any = await (FacturasService.prototype as any).findOne.call(ctx, 1, { id: 5, role: 'vendedor' });
      expect(r.total).toBe(1180);
      expect(r.formasPago).toEqual([{ tipo: 1, monto: 1180 }]);
      expect(r.detalles[0].precioUnitario).toBe(500);
    });

    it('ADMIN: ve todo, sin importar el toggle', async () => {
      const ctx = ctxFindOne({ supervisorActivo: false, ocultarMontos: true });
      const r: any = await (FacturasService.prototype as any).findOne.call(ctx, 1, { id: 1, role: 'admin' });
      expect(r.total).toBe(1180);
      expect(r.detalles[0].costoUnitario).toBe(300);
    });

    it('VENDEDOR sin supervisor, toggle OFF: ve todo — la empresa apagó la protección', async () => {
      const ctx = ctxFindOne({ supervisorActivo: false, ocultarMontos: false });
      const r: any = await (FacturasService.prototype as any).findOne.call(ctx, 1, { id: 5, role: 'vendedor' });
      expect(r.total).toBe(1180);
    });

    it('sin `usuario` (llamada interna, ej. tras emitir/respuestaEcfEnCurso): nunca oculta — es la venta en curso', async () => {
      const ctx = ctxFindOne({ supervisorActivo: false, ocultarMontos: true });
      const r: any = await (FacturasService.prototype as any).findOne.call(ctx, 1);
      expect(r.total).toBe(1180);
    });
  });

  describe('ocultarMontosFactura() — el helper puro', () => {
    it('quita los campos de dinero del header y de cada línea, deja el resto intacto', () => {
      const ctx = makeCtx({ supervisorActivo: false, ocultarMontos: true });
      const r: any = ctx.ocultarMontosFactura({ ...FACTURA_BASE, clienteId: 9 });
      expect(r).not.toHaveProperty('total');
      expect(r).not.toHaveProperty('subtotal');
      expect(r).not.toHaveProperty('iva');
      expect(r).not.toHaveProperty('formasPago');
      expect(r.clienteId).toBe(9);
      expect(r.detalles[0]).not.toHaveProperty('precioUnitario');
      expect(r.detalles[0]).not.toHaveProperty('costoUnitario');
      expect(r.detalles[0].descripcion).toBe('Producto X');
    });
  });
});
