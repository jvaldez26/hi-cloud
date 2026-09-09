import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lo que el frontend manda en el cuerpo de una emisión de e-CF tiene que existir
 * en el DTO del backend.
 *
 * El caso real: el POS pedía el e-CF de una Nota de Crédito así
 *
 *     api.post(`/ecf/nota-credito/${nc.id}/emitir`, { codigoModificacion: codigoMod })
 *
 * y `codigoModificacion` se había sacado del DTO a propósito —el controller lo
 * lee de la propia nota para que no se pueda colar uno distinto al validado—.
 * El ValidationPipe global va con `forbidNonWhitelisted: true`, así que la
 * respuesta era un 400 seco: «property codigoModificacion should not exist».
 *
 * El escritorio se actualizó y este llamado del POS se quedó atrás. Como encima
 * el error caía en un `catch` vacío, **todas** las NC emitidas desde el POS se
 * quedaron sin su E34 sin que nadie lo viera: nota en EMITIDA, Estado DGII en
 * «—», y un visto verde al cajero.
 *
 * Nada lo habría detectado antes: `api.post` recibe `any`, los dos proyectos son
 * npm distintos y no comparten tipos, y el 400 solo aparece en ejecución. Aquí
 * se comparan los dos lados leyendo el código, que es lo único que los une.
 *
 * Solo cubre las rutas de emisión de e-CF. Son las que fabrican un documento
 * fiscal: si una se cae, lo que falta es el timbre ante la DGII.
 */

const RAIZ_FE = join(__dirname, '..');
const RAIZ_BE = join(__dirname, '..', '..', '..', 'hi-cloud backend-project', 'backend', 'src', 'ecf');

const listar = (dir: string, filtro: (n: string) => boolean, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, filtro, acc);
    else if (filtro(e.name)) acc.push(ruta);
  }
  return acc;
};

// ── Lado backend: ruta de emisión → propiedades que su DTO admite ────────────
const propiedadesPorRuta = new Map<string, Set<string>>();

if (existsSync(RAIZ_BE)) {
  const controllers = listar(RAIZ_BE, n => n.endsWith('.controller.ts'));
  const dtos        = listar(RAIZ_BE, n => n.endsWith('.dto.ts'));

  // class XDto { … } → nombres de sus propiedades declaradas
  const propsDeDto = new Map<string, Set<string>>();
  for (const ruta of dtos) {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/export class (\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const props = new Set<string>();
      for (const p of m[2].matchAll(/^\s{2}(\w+)[?!]?\s*:/gm)) props.add(p[1]);
      propsDeDto.set(m[1], props);
    }
  }

  for (const ruta of controllers) {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/@Post\(\s*'([^']*emitir[^']*)'\s*\)/g)) {
      // Se toma un trozo generoso y se busca el primer @Body dentro. Intentar
      // delimitar la firma con paréntesis no funciona: entre el @Post y el
      // @Body hay un @ApiOperation con descripciones llenas de paréntesis, y
      // ahí se cortaba justo en `nota-credito/:id/emitir` —la ruta del bug—,
      // que quedaba emparejada como «sin @Body» y no se comparaba con nada.
      const bloque = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 1800);
      const body   = bloque.match(/@Body\(\)\s*\w+\s*:\s*(\w+)/);
      if (!body) continue;
      const props = propsDeDto.get(body[1]);
      if (props) propiedadesPorRuta.set(m[1].replace(/:\w+/g, ':id'), props);
    }
  }
}

// ── Lado frontend: qué claves manda cada llamada ─────────────────────────────
interface Hallazgo { archivo: string; linea: number; ruta: string; sobra: string[] }

const hallazgos: Hallazgo[] = [];
let comparadas = 0;

for (const ruta of listar(RAIZ_FE, n => n.endsWith('.ts') || n.endsWith('.tsx'))) {
  if (ruta.includes(join('src', 'test'))) continue;
  const texto = readFileSync(ruta, 'utf8');
  const rel   = ruta.slice(ruta.indexOf('src')).replace(/\\/g, '/');

  // api.post(`/ecf/<ruta>/emitir`, { … })  —  el objeto tiene que ser literal
  for (const m of texto.matchAll(/api\.post\(\s*[`'"]\/(?:api\/v1\/)?ecf\/([^`'"]*emitir)[`'"]\s*,\s*\{([^{}]*)\}/g)) {
    const rutaFe = m[1].replace(/\$\{[^}]*\}/g, ':id');
    const props  = propiedadesPorRuta.get(rutaFe);
    if (!props) continue;   // ruta que no se pudo emparejar: la cuenta el centinela

    comparadas++;
    const claves = [...m[2].matchAll(/(?:^|,)\s*(\w+)\s*:/g)].map(k => k[1]);
    const sobra  = claves.filter(k => !props.has(k));
    if (sobra.length) {
      hallazgos.push({
        archivo: rel,
        linea:   texto.slice(0, m.index!).split('\n').length,
        ruta:    rutaFe,
        sobra,
      });
    }
  }
}

describe('Emisión de e-CF — el cuerpo que se manda existe en el DTO', () => {
  it('empareja rutas del backend con sus DTO', () => {
    // Si esto baja a cero, el escaneo dejó de encontrar los controllers o los
    // DTO —una ruta movida, otro nombre de archivo— y la comprobación de abajo
    // pasaría en verde sin haber comparado nada.
    expect(propiedadesPorRuta.size).toBeGreaterThanOrEqual(3);
  });

  it('encuentra llamadas del frontend que comparar', () => {
    expect(comparadas).toBeGreaterThanOrEqual(1);
  });

  it('ninguna manda una propiedad que el DTO rechazaría', () => {
    const informe = hallazgos
      .map(h => `${h.archivo}:${h.linea} → POST /ecf/${h.ruta} manda ${h.sobra.map(s => `«${s}»`).join(', ')}, que su DTO no admite (400 con forbidNonWhitelisted)`)
      .join('\n');
    expect(informe).toBe('');
  });
});
