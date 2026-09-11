import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El estado de cuenta del portal no se calcula solo desde Cuentas por Cobrar.
 *
 * El caso real: un cliente con 15 facturas, **todas PAGADA**, veía «Total
 * facturado RD$2,284.73 · Total pagado RD$0.00 · 0%». El cálculo era
 *
 *     SUM(cxc."montoPagado")  con  LEFT JOIN cuentas_por_cobrar
 *
 * y **una factura de contado nunca genera CxC** —regla explícita de
 * `facturas.service`: «contado nunca genera CxC»—. Así que toda venta de
 * contado contaba como cobro cero y el portal le decía a un cliente al día que
 * no había pagado nada.
 *
 * El mismo defecto miente en la otra dirección, que es la cara: una factura de
 * contado EMITIDA y sin cobrar tampoco tiene CxC, así que no sumaba pendiente y
 * el portal anunciaba «¡Estás al día! No tienes saldos pendientes» a quien debe
 * dinero.
 *
 * La regla correcta: el pendiente de una factura es el de su CxC cuando existe
 * y, si no, el total salvo que esté pagada. El cobrado se deduce restando.
 *
 * Se lee del código porque el error no está en ninguna cuenta —el SUM suma
 * bien— sino en la fuente de la que se saca el dato, y eso no lo revela ningún
 * test de aritmética.
 */
describe('Portal del cliente — estado de cuenta', () => {
  const ruta   = join(__dirname, 'portal.controller.ts');
  const codigo = readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('no deduce lo cobrado únicamente de cuentas_por_cobrar', () => {
    // El patrón exacto del fallo, en las formas en que suele escribirse.
    expect(codigo).not.toMatch(/SUM\(\s*cxc\."montoPagado"/i);
    expect(codigo).not.toMatch(/SUM\(\s*cxc\."montoPendiente"/i);
  });

  it('contempla la factura sin CxC, que es la de contado', () => {
    // Sin este caso, media aplicación queda fuera del cálculo: el POS factura
    // de contado y esas facturas no tienen fila en cuentas_por_cobrar.
    expect(codigo).toMatch(/CASE WHEN f\.estado = 'pagada' THEN 0 ELSE f\.total/);
  });

  it('el enlace caducado se comprueba también al cargar la cabecera', () => {
    // `validarToken` mira `portalTokenExpiry`; el endpoint de la cabecera hacía
    // su propio findOne sin comprobarlo, así que un enlace muerto pintaba
    // «Bienvenido, Fulano» y fallaba después, por dentro.
    const cabecera = codigo.match(/getClientePorToken[\s\S]{0,600}/);
    expect(cabecera).not.toBeNull();
    expect(cabecera![0]).toMatch(/this\.validarToken\(token\)/);
  });
});
