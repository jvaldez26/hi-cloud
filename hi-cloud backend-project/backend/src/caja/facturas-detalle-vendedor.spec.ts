import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * GET /caja/:id/facturas-detalle estaba restringido a ADMIN/CONTADOR — un
 * cajero no podía usar "Incluir detalle de facturas emitidas" al imprimir su
 * propio cierre y recibía "No tienes permisos para esta acción". El resto del
 * módulo (abrir, cerrar, resumen, historial, retiros propios) ya está abierto
 * a VENDEDOR; este endpoint se había quedado copiado del grupo de acciones
 * supervisoras (anular, autorizar retiro) sin necesitarlo — la consulta ya
 * filtra por el vendedorId de LA CAJA, no por quién la pide.
 *
 * ── La propiedad de seguridad que este test protege ─────────────────────────
 * Abrir el endpoint a VENDEDOR sin más lo dejaría pedir el detalle de UNA
 * CAJA AJENA con solo cambiar el :id de la URL — cliente, e-CF y montos de
 * otro cajero. El guard tiene que ser el mismo criterio que
 * getCajaHoyByUserId (ver caja-hoy-vendedor.spec.ts): derivar el vendedorId
 * propio de `vendedores.usuarioId` a partir del JWT, nunca de un parámetro,
 * y comparar contra la caja pedida.
 */
describe('getFacturasDetalle — VENDEDOR solo su propia caja', () => {
  const rutaServicio    = join(__dirname, 'caja.service.ts');
  const rutaController  = join(__dirname, 'caja.controller.ts');
  const fuenteServicio   = readFileSync(rutaServicio, 'utf8');
  const fuenteController = readFileSync(rutaController, 'utf8');

  const cuerpoServicio = (() => {
    const ini = fuenteServicio.indexOf('async getFacturasDetalle');
    expect(ini).toBeGreaterThan(-1);
    return fuenteServicio.slice(ini, ini + 1200);
  })();

  const sinComentarios = cuerpoServicio
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('el controller ya permite VENDEDOR en este endpoint', () => {
    const ini = fuenteController.indexOf("':id/facturas-detalle'");
    expect(ini).toBeGreaterThan(-1);
    const bloque = fuenteController.slice(ini, ini + 300);
    expect(bloque).toMatch(/@Roles\([^)]*UserRole\.VENDEDOR[^)]*\)/);
  });

  it('el controller pasa el usuario autenticado al servicio', () => {
    const ini = fuenteController.indexOf('getFacturasDetalle(');
    const bloque = fuenteController.slice(ini, ini + 200);
    expect(bloque).toMatch(/@GetUser\(\)\s*usuario/);
  });

  it('compara contra el rol VENDEDOR antes de restringir', () => {
    expect(sinComentarios).toMatch(/UserRole\.VENDEDOR/);
  });

  it('el vendedorId propio sale de vendedores.usuarioId, NO de un parámetro del cliente', () => {
    // Mismo guard A-1 que getCajaHoyByUserId — derivado del JWT, nunca del cajaId pedido.
    expect(sinComentarios).toMatch(/FROM vendedores/);
    expect(sinComentarios).toMatch(/"usuarioId"\s*=\s*\$1/);
  });

  it('la condición de "es mi caja" es un OR entre userId y vendedorId, no un AND', () => {
    // Igual que en getCajaHoyByUserId: la caja pudo abrirla otro a su nombre.
    expect(sinComentarios).toMatch(/userId[\s\S]*\|\|[\s\S]*vendedorId|vendedorId[\s\S]*\|\|[\s\S]*userId/);
  });

  it('si no es su caja, rechaza con ForbiddenException — no devuelve datos ajenos', () => {
    expect(sinComentarios).toMatch(/ForbiddenException/);
  });
});
