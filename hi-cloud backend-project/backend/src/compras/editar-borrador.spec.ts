import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Todo documento comercial se puede editar mientras es un borrador, y solo
 * mientras lo es.
 *
 * El caso real: una orden de compra en BORRADOR no se podía editar. No es que
 * faltara el botón en el menú — no existía en ninguna capa: ni
 * `PATCH /compras/:id`, ni `update()` en el servicio, ni pantalla. El único modo
 * de corregir un borrador equivocado era eliminarlo y rehacerlo desde cero, y
 * «Duplicar compra» no ayudaba: crea otro borrador que tampoco se puede editar.
 *
 * Y era una asimetría, no un criterio: facturas, cotizaciones, pre-facturas y
 * pro-formas ya tenían su edición con el guard de estado. Compras se quedó
 * fuera y nadie lo notó porque un módulo sin endpoint no falla — simplemente no
 * está.
 *
 * Se vigilan las dos mitades, porque cada una sin la otra es un problema:
 *
 *   - sin endpoint, el borrador es inmutable y hay que rehacerlo;
 *   - sin guard de estado, se podría editar un documento ya emitido, que es
 *     mucho peor: en compras significaría reescribir las líneas de algo que ya
 *     movió inventario y AVCO.
 */
describe('Documentos comerciales — edición de borradores', () => {
  const SRC = join(__dirname, '..');

  /** Módulo → palabra con la que su servicio nombra el estado editable. */
  const FAMILIAS: Array<{ modulo: string; estado: RegExp }> = [
    { modulo: 'facturas',     estado: /borrador/i },
    { modulo: 'cotizaciones', estado: /borrador/i },
    { modulo: 'compras',      estado: /borrador/i },
    { modulo: 'pre-factura',  estado: /borrador/i },
    // Una pro-forma no tiene borrador: su estado editable es ACTIVA.
    { modulo: 'pro-forma',    estado: /activa/i },
  ];

  const leer = (dir: string, sufijo: string): string => {
    const ruta = join(SRC, dir);
    if (!existsSync(ruta)) return '';
    return readdirSync(ruta)
      .filter(n => n.endsWith(sufijo))
      .map(n => readFileSync(join(ruta, n), 'utf8'))
      .join('\n');
  };

  it.each(FAMILIAS)('$modulo expone PATCH :id para editar', ({ modulo }) => {
    const controller = leer(modulo, '.controller.ts');
    expect(controller).not.toBe('');
    // `@Patch(':id')` a secas — no `:id/estado` ni `:id/recibir`, que son otras
    // operaciones y no permiten corregir el contenido.
    expect(controller).toMatch(/@Patch\(\s*['"]:id['"]\s*\)/);
  });

  /**
   * `pro-forma` queda fuera de la segunda mitad: **hoy no tiene guard**.
   * `actualizar()` no mira el estado en ningún momento, aunque su propio
   * `@ApiOperation` promete «solo ACTIVA». Lo encontró esta prueba al escribirla
   * y está anotado en `docs/estado-actual.md` — se arregla en su propia tanda,
   * no de rebote aquí. Cuando se le ponga el guard, se mueve a `FAMILIAS`.
   */
  const CON_GUARD = FAMILIAS.filter(f => f.modulo !== 'pro-forma');

  it.each(CON_GUARD)('$modulo solo deja editar en su estado editable', ({ modulo, estado }) => {
    const service = leer(modulo, '.service.ts');
    expect(service).not.toBe('');

    // El guard: en algún sitio se compara el estado y se lanza. Se busca el
    // texto del error, que es lo que de verdad llega al usuario y lo único
    // estable entre módulos que escriben la comparación de formas distintas.
    const mensajes = service.match(/Solo se puede[n]? (?:editar|modificar|actualizar)[^`'"]*/gi) ?? [];
    expect(mensajes.length).toBeGreaterThan(0);
    expect(mensajes.some(m => estado.test(m))).toBe(true);
  });
});
