import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El UNION de listar() no puede juntar dos columnas de tipos incompatibles.
 *
 * ── El caso real (Sentry #7717886116) ───────────────────────────────────────
 * GET /api/v1/recibos-cobro devolvía 500 en producción:
 *
 *   UNION could not convert type pagos_cobrados_metodopago_enum
 *                             to recibos_cobro_metodopago_enum
 *
 * Las dos tablas tienen una columna `metodoPago` y las dos son enum de
 * Postgres, pero son enums DISTINTOS —`MetodoPagoRecibo` y `MetodoPago`, con
 * juegos de valores parecidos y tipos diferentes— y un UNION no sabe convertir
 * uno en el otro. Se arregla casteando a `text` en LAS DOS ramas: castear una
 * sola deja el mismo error.
 *
 * TypeScript no puede ver esto —es SQL en una plantilla— y jest tampoco sin una
 * base de datos delante. El único sitio donde cabe la comprobación es el texto
 * de la consulta, así que aquí se comprueba el texto.
 *
 * Los valores no cambian al castear: los dos enums usan las mismas cadenas en
 * minúscula ('efectivo', 'transferencia', …), así que la pantalla sigue
 * pintando el método igual.
 */
describe('listar() — el UNION une tipos compatibles', () => {
  const fuente = readFileSync(join(__dirname, 'recibos-cobro.service.ts'), 'utf8');

  /** El bloque de la consulta, para no mirar el resto del archivo. */
  const union = (() => {
    const ini = fuente.indexOf('const union = `');
    expect(ini).toBeGreaterThan(-1);
    const fin = fuente.indexOf('`;', ini);
    return fuente.slice(ini, fin);
  })();

  const ramas = union.split(/UNION\s+ALL/i);

  it('el UNION tiene exactamente dos ramas', () => {
    expect(ramas).toHaveLength(2);
  });

  it('metodoPago va casteado a text en AMBAS ramas', () => {
    // Es el fallo exacto de Sentry. Con una sola rama casteada, el UNION sigue
    // reventando — por eso se comprueban las dos por separado y no el total.
    for (const [i, rama] of ramas.entries()) {
      expect(rama).toMatch(/"metodoPago"::text/);
      if (!/"metodoPago"::text/.test(rama)) {
        throw new Error(`La rama ${i + 1} no castea metodoPago`);
      }
    }
  });

  it('la columna que puede ser NULL declara su tipo', () => {
    // NULL sin tipo en un UNION se resuelve como text y choca con el int de la
    // otra rama. cajaDiariaId es el caso: en los pagos siempre es NULL.
    expect(union).toMatch(/NULL::int\s+AS "cajaDiariaId"/);
  });

  it('no queda ninguna columna enum sin castear', () => {
    // Hoy metodoPago es el ÚNICO enum de las dos tablas — se verificó columna a
    // columna. Si mañana se añade otro (un `estado`, por ejemplo) y entra en el
    // UNION sin ::text, este test no lo vería: la lista de enums vive en las
    // entidades, no aquí. Queda dicho para quien amplíe la consulta.
    const enumsConocidos = ['metodoPago'];
    for (const col of enumsConocidos) {
      const sinCastear = new RegExp(`[rp]\."${col}"(?!::)`, 'g');
      expect(union).not.toMatch(sinCastear);
    }
  });
});
