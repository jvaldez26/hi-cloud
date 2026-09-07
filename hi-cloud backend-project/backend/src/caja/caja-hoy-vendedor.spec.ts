import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * La caja del día se busca por las DOS personas que guarda `cierres_caja`.
 *
 * ── El caso real ────────────────────────────────────────────────────────────
 * Adalberta Reyes, en Ferretería Pavel: Caja Diaria la mostraba ABIERTA con su
 * nombre y su POS decía «la caja no ha sido abierta hoy».
 *
 * `cierres_caja` guarda dos cosas distintas —`userId`, quién pulsó abrir, y
 * `vendedorId`, para quién es el turno— y abrirCaja() las llena con personas
 * diferentes cuando un encargado le abre la caja al cajero, que es lo normal a
 * primera hora. El historial identifica la fila por `vendedorNombre`; el POS
 * buscaba solo por `userId`.
 *
 * La pregunta correcta no es «¿abrí yo una caja?» sino «¿hay una caja PARA MÍ
 * abierta?».
 *
 * ── Lo que este test protege de verdad ──────────────────────────────────────
 * No solo el arreglo: la propiedad de SEGURIDAD que lo acompaña. El guard A-1
 * existe para que un vendedor no pueda mirar la caja de otro pasando un
 * parámetro. La segunda vía tiene que derivarse del usuario autenticado —de
 * `vendedores.usuarioId`— y nunca de algo que venga del cliente. Si alguien
 * «simplifica» esto aceptando un vendedorId por parámetro, el arreglo sigue
 * funcionando y el aislamiento se cae en silencio.
 */
describe('getCajaHoyByUserId — caja propia sin depender de quién la abrió', () => {
  const ruta   = join(__dirname, 'caja.service.ts');
  const fuente = readFileSync(ruta, 'utf8');

  /** El cuerpo del método, para no confundirlo con getCajaHoy(vendedorId). */
  const cuerpo = (() => {
    const ini = fuente.indexOf('async getCajaHoyByUserId');
    expect(ini).toBeGreaterThan(-1);
    return fuente.slice(ini, ini + 2600);
  })();

  const sinComentarios = cuerpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('considera también el vendedorId, no solo el userId', () => {
    expect(sinComentarios).toMatch(/vendedorId/);
    // La condición tiene que ser un OR: exigir las dos a la vez no encontraría
    // ni la caja que abrió él ni la que le abrieron.
    expect(sinComentarios).toMatch(/userId[^)]*OR[^)]*vendedorId|vendedorId[^)]*OR[^)]*userId/i);
  });

  it('el vendedorId sale de vendedores.usuarioId, NO de un parámetro', () => {
    // Es la propiedad del guard A-1. Derivarlo del JWT lo mantiene; aceptarlo
    // del cliente convertiría el arreglo en un agujero de aislamiento.
    expect(sinComentarios).toMatch(/FROM vendedores/);
    expect(sinComentarios).toMatch(/"usuarioId"\s*=\s*\$1/);
  });

  it('la firma sigue recibiendo solo el userId del JWT', () => {
    // Si aquí apareciera un segundo parámetro, sería la puerta para que el
    // controlador volviera a pasar algo del cliente.
    expect(sinComentarios).toMatch(/async getCajaHoyByUserId\(\s*userId:\s*number\s*\)/);
  });

  it('con dos cajas del mismo día, gana la abierta', () => {
    // Puede haber una que abrió él y otra a su nombre. La que sirve para vender
    // es la abierta; devolver la cerrada dejaría al cajero bloqueado igual.
    expect(sinComentarios).toMatch(/CASE WHEN c\.estado = 'abierta'/);
  });
});
