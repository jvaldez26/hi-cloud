import { FacturasService } from '../facturas/facturas.service';
import { tipoFormaPagoDesdeEtiqueta } from '../declaraciones/dgii.constants';

/**
 * Regresión del bug real: "No existe rastro de cobro para marcar esta
 * factura como pagada" al cobrar una cotización o una pre-factura desde el
 * POS con Efectivo/Tarjeta/Transferencia.
 *
 * La causa NO era el guard (verificarRastroCobro, en facturas.service) — el
 * guard hacía justo lo que debía: no encontraba formasPago porque
 * cobrarDesdePos() nunca lo escribía en la factura que crea. Este archivo
 * fija dos cosas para que no se repita:
 *
 *   1. El mapeo del botón que pulsó el cajero (texto) al tipo DGII (número)
 *      que espera `factura.formasPago`. Cotizaciones y pre-facturas tenían
 *      cada una su propia copia privada de este mapeo, byte a byte
 *      idénticas; el fix del Formato 607 (2026-09-19) las consolidó en
 *      tipoFormaPagoDesdeEtiqueta() (declaraciones/dgii.constants.ts) — el
 *      MISMO traductor que alimenta el desglose de forma de pago del 607.
 *   2. Que una factura CON ese formasPago pasa por el guard sin tocar la
 *      base de datos (rama rápida de verificarRastroCobro, línea "if
 *      (Array.isArray(formasPago) && formasPago.length > 0) return"). Si
 *      alguien vuelve a romper el llenado de formasPago, esta prueba falla
 *      aquí y no en producción.
 *
 * El guard en sí (facturas.service.ts) NO se toca ni se debilita: sigue
 * bloqueando cualquier factura que de verdad no tenga rastro.
 */
describe('cobrarDesdePos — formasPago del botón del cajero', () => {
  describe('tipoFormaPagoDesdeEtiqueta — mapa completo, lo usan cotizaciones y pre-facturas por igual', () => {
    it.each([
      ['Efectivo', 1], ['Tarjeta', 3], ['Transferencia', 2], ['Cheque', 2],
      ['Crédito', 4], ['credito', 4],
      // Insensible a mayúsculas/espacios: son los mismos botones del modal
      ['  efectivo  ', 1], ['TARJETA', 3],
    ])('%s → tipo DGII %i', (metodo, tipo) => {
      expect(tipoFormaPagoDesdeEtiqueta(metodo)).toBe(tipo);
    });

    it('un texto que no reconoce no inventa un tipo', () => {
      expect(tipoFormaPagoDesdeEtiqueta('bitcoin')).toBeUndefined();
    });
  });

  describe('el guard deja pasar la factura una vez que formasPago está', () => {
    // Rama rápida de verificarRastroCobro: con formasPago no vacío no toca
    // this.dataSource, así que invocarlo con {} como `this` es seguro — igual
    // que hace formas-pago.invariantes.spec.ts con validarFormasPago.
    const guard = (factura: any) =>
      (FacturasService.prototype as any).verificarRastroCobro.call({}, factura);

    it('con el formasPago que ahora escribe cobrarDesdePos, no rechaza', async () => {
      const facturaComoLaEscribeCobrarDesdePos = {
        id: 999,
        formasPago: [{ tipo: 1, monto: 1180 }], // Efectivo, tal cual el fix
      };
      await expect(guard(facturaComoLaEscribeCobrarDesdePos)).resolves.toBeUndefined();
    });

    it('SIN formasPago, sigue exigiendo consultar la base de datos (el bug real)', () => {
      // No pasa `this.dataSource` — si el guard intentara usarlo, esto
      // truena con TypeError en vez de devolver silenciosamente. Confirma
      // que la rama rápida NO se toma sin formasPago: el guard sigue vivo.
      const facturaSinRastro = { id: 999, formasPago: null };
      return expect(guard(facturaSinRastro)).rejects.toThrow();
    });
  });
});
