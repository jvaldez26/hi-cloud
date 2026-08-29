/**
 * Verifica las reglas de la preferencia de columnas.
 *
 * Se ejecuta con `npm run verificar:columnas`. El frontend no tiene runner de
 * tests, así que esto importa la lógica real del hook —no una copia— y
 * comprueba lo que no puede romperse en silencio. Son 126 tablas del ERP las
 * que dependen de estas cuatro funciones.
 *
 * Lo que se vigila:
 *
 *   1. Sin preferencia se ven los defaults, incluido `defaultVisible: false`.
 *   2. Una columna NUEVA aparece sola aunque haya preferencia guardada. Este es
 *      el bug que el cambio arregla: guardando las visibles, quedaba oculta.
 *   3. Una columna nueva con `defaultVisible: false` sigue oculta. Por esto la
 *      preferencia son DOS listas y no una.
 *   4. La migración desde el formato viejo conserva lo que el usuario tenía.
 *   5. Retirar una columna no rompe a quien la tuviera guardada, y su clave se
 *      cae en la primera escritura.
 *   6. Restaurar deja cero desviaciones.
 */
import {
  calcularVisibles,
  calcularCambios,
  migrarDesdeVisibles,
} from '../src/hooks/useColumnVisibility.ts';

let fallos = 0, total = 0;
const ok = (nombre, bien, detalle = '') => {
  total++;
  if (bien) { console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? '\n      ' + detalle : ''}`); }
};
const mismos = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Tabla de ejemplo con las dos clases de default, como las hay en el ERP. */
const COLS = [
  { key: 'codigo', label: 'Código', defaultVisible: false },
  { key: 'nombre', label: 'Nombre', defaultVisible: true  },
  { key: 'marca',  label: 'Marca',  defaultVisible: true  },
  { key: 'precio', label: 'Precio' },                         // sin declarar = visible
];
const VACIO = { ocultas: [], mostradas: [] };

// ── 1. Defaults ────────────────────────────────────────────────────────────
console.log('\nDefaults');
ok('sin preferencia se ven las columnas por defecto',
  mismos(calcularVisibles(VACIO, COLS), ['nombre', 'marca', 'precio']));
ok('`defaultVisible: false` se respeta sin preferencia',
  !calcularVisibles(VACIO, COLS).includes('codigo'));
ok('una columna sin `defaultVisible` cuenta como visible',
  calcularVisibles(VACIO, COLS).includes('precio'));

// ── 2. El bug que esto arregla ─────────────────────────────────────────────
console.log('\nColumna nueva con preferencia ya guardada');
// El usuario escondió "marca" cuando la tabla tenía 3 columnas.
const guardado = calcularCambios(['nombre'], COLS.slice(0, 3));
// Después se añade "precio" a la tabla.
const visiblesTrasAnadir = calcularVisibles(guardado, COLS);
ok('la columna nueva aparece sola', visiblesTrasAnadir.includes('precio'),
  `visibles: ${visiblesTrasAnadir.join(', ')}`);
ok('lo que el usuario escondió sigue escondido', !visiblesTrasAnadir.includes('marca'));
ok('lo que el usuario dejó visible sigue visible', visiblesTrasAnadir.includes('nombre'));

const COLS_MAS_OCULTA = [...COLS, { key: 'interno', label: 'Interno', defaultVisible: false }];
ok('una columna nueva con `defaultVisible: false` NO aparece',
  !calcularVisibles(guardado, COLS_MAS_OCULTA).includes('interno'),
  'si aparece, es el mismo bug al revés: sobran las dos listas');

// ── 3. Migración desde el formato viejo (lista de visibles) ────────────────
console.log('\nMigración del formato viejo');
// Formato viejo: el usuario veía nombre + codigo (sacó codigo, escondió marca).
const migrado = migrarDesdeVisibles(['nombre', 'codigo'], COLS);
ok('la que el usuario escondió queda en `ocultas`',  migrado.ocultas.includes('marca'));
ok('la que el usuario sacó queda en `mostradas`',    migrado.mostradas.includes('codigo'));
const visiblesMigradas = calcularVisibles(migrado, COLS);
ok('tras migrar se ve exactamente lo mismo que antes',
  mismos(visiblesMigradas, ['codigo', 'nombre']),
  `visibles: ${visiblesMigradas.join(', ')}`);

// ── 4. Columnas retiradas ──────────────────────────────────────────────────
console.log('\nColumna retirada de la tabla');
const conFantasma = { ocultas: ['marca', 'ya-no-existe'], mostradas: ['tampoco'] };
let leyoBien = true;
try { calcularVisibles(conFantasma, COLS); } catch { leyoBien = false; }
ok('leer con claves de columnas retiradas no lanza', leyoBien);
ok('las claves fantasma no afectan a lo visible',
  mismos(calcularVisibles(conFantasma, COLS), ['nombre', 'precio']));
const reescrito = calcularCambios(calcularVisibles(conFantasma, COLS), COLS);
ok('la clave fantasma se cae en la primera escritura',
  !reescrito.ocultas.includes('ya-no-existe') && !reescrito.mostradas.includes('tampoco'),
  JSON.stringify(reescrito));

// ── 5. Restaurar ───────────────────────────────────────────────────────────
console.log('\nRestaurar');
const defectos  = COLS.filter(c => c.defaultVisible !== false).map(c => c.key);
const restaurado = calcularCambios(defectos, COLS);
ok('guardar los defaults no deja ninguna desviación',
  restaurado.ocultas.length === 0 && restaurado.mostradas.length === 0,
  JSON.stringify(restaurado));
ok('y se vuelve a ver lo de fábrica',
  mismos(calcularVisibles(restaurado, COLS), defectos));

// ── 6. Ida y vuelta ────────────────────────────────────────────────────────
console.log('\nIda y vuelta');
for (const sel of [[], ['nombre'], ['codigo'], ['codigo', 'nombre', 'marca', 'precio']]) {
  const vuelta = calcularVisibles(calcularCambios(sel, COLS), COLS);
  ok(`[${sel.join(',') || '∅'}] sobrevive el ciclo guardar → leer`,
    mismos(vuelta, COLS.filter(c => sel.includes(c.key)).map(c => c.key)),
    `resultado: ${vuelta.join(', ')}`);
}

console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
if (fallos) { console.log(`${fallos} FALLARON\n`); process.exit(1); }
console.log('');
