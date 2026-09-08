import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ningún campo de CANTIDAD de un documento comercial puede bloquear los
 * decimales.
 *
 * El caso real: en la cotización, «Cant.» era
 * `<InputNumber min={1} precision={0} …>`. Media funda de cemento o medio metro
 * de arena —0.5 de ARENA DE EMPAÑETE fue lo que se intentó teclear— es la venta
 * normal de una ferretería, y no había forma de escribirlo. La columna es
 * `decimal(12,4)` y el DTO valida cuatro decimales: lo único que lo impedía era
 * el widget.
 *
 * Y esas dos props hacían algo peor que estorbar. Con una cantidad decimal ya
 * guardada —las que entran desde el POS— el input no mostraba lo que tenía:
 * `min={1}` subía 0.5 a 1 y `precision={0}` pintaba 3 teniendo 2.5. Al salir
 * del campo disparaba `onChange` con el valor alterado, así que bastaba pasar
 * por la celda al editar cualquier otra cosa para reescribir la cantidad y
 * guardarla mal, sin aviso. Ocurrió: una cotización creada en el POS con 0.5
 * volvió con 1 después de abrirla para modificarla.
 *
 * Se comprueba leyendo el código porque el fallo no está en la aritmética
 * —ninguna cuenta se equivoca— sino en una prop de un widget, y eso no lo
 * atrapa ningún test de cálculo.
 */

/**
 * Solo los documentos de VENTA, que son los que comparten la tubería
 * cotización → pre-factura → factura → nota de crédito/débito y el mismo
 * contrato de `decimal(12,4)` con cuatro decimales en el DTO.
 *
 * Las pantallas de los verticales (farmacia, taller, gimnasio, clínica) quedan
 * fuera a propósito: ahí un entero puede ser lo correcto —unidades de un lote,
 * horas, etiquetas a imprimir— y no es esta prueba quien debe decidirlo.
 */
const CARPETAS = [
  'cotizaciones', 'facturas', 'pre-factura', 'pro-formas',
  'notas-credito', 'notas-debito',
];

const RAIZ = join(__dirname, '..', 'pages');

const listar = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
};

/**
 * Campos que se llaman «cantidad» y NO son la cantidad vendida de una línea:
 * ahí un entero, o un mínimo de 1, es lo correcto.
 */
const NO_ES_UNA_LINEA =
  /cantidadTrabajadores|cantidadMaxima|cantidadMinima|cantidadPendiente|cantidadCuotas|validezDias/;

interface Hallazgo { archivo: string; linea: number; tag: string; motivo: string }

const hallazgos: Hallazgo[] = [];
let revisados = 0;

const archivos = CARPETAS.flatMap(c => listar(join(RAIZ, c)));

for (const ruta of archivos) {
  const texto = readFileSync(ruta, 'utf8');
  const rel   = ruta.slice(ruta.indexOf('pages')).replace(/\\/g, '/');

  for (const m of texto.matchAll(/<InputNumber\b/g)) {
    const desde = m.index!;
    const cierre = texto.indexOf('/>', desde);
    const hasta  = cierre === -1 ? desde + 300 : cierre + 2;
    const tag    = texto.slice(desde, hasta);
    // El nombre del campo puede ir en el propio tag (`value={r.cantidad}`) o en
    // el Form.Item que lo envuelve, justo antes.
    const ventana = texto.slice(Math.max(0, desde - 240), hasta);

    if (!/cantidad/i.test(ventana)) continue;
    if (NO_ES_UNA_LINEA.test(ventana)) continue;

    revisados++;
    const linea = texto.slice(0, desde).split('\n').length;
    const corto = tag.replace(/\s+/g, ' ').slice(0, 110);

    if (/precision=\{0\}/.test(tag)) {
      hallazgos.push({ archivo: rel, linea, tag: corto, motivo: 'precision={0} redondea la cantidad al entero' });
      continue;
    }
    const min = tag.match(/min=\{([\d.]+)\}/);
    if (min && Number(min[1]) >= 1) {
      hallazgos.push({ archivo: rel, linea, tag: corto, motivo: `min={${min[1]}} impide vender menos de una unidad` });
    }
  }
}

describe('Cantidades de línea — los decimales no se bloquean en el widget', () => {
  it('encuentra los campos de cantidad para poder juzgarlos', () => {
    // Si esto baja a cero, el escaneo dejó de mirar donde debía y el siguiente
    // pasaría en verde sin haber comprobado nada.
    expect(revisados).toBeGreaterThan(5);
  });

  it('ninguno redondea al entero ni exige vender al menos una unidad', () => {
    const informe = hallazgos
      .map(h => `${h.archivo}:${h.linea} → ${h.motivo}\n    ${h.tag}`)
      .join('\n');
    expect(informe).toBe('');
  });
});
