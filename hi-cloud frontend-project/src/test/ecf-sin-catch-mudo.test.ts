import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ninguna llamada de emisión de e-CF se envuelve en un `catch` que no haga nada.
 *
 * El caso real: el POS emitía una Nota de Crédito en tres pasos y el tercero
 * —pedir el e-CF E34— iba así:
 *
 *     try   { await api.post(`/ecf/nota-credito/${nc.id}/emitir`, …) }
 *     catch { /* sin config ECF → NC ya emitida, solo sin timbre fiscal *\/ }
 *
 * y a continuación, sin condición ninguna:
 *
 *     message.success('Nota de Crédito emitida y e-CF E34 generado ✓')
 *
 * El comentario suponía que el único fallo posible era «no hay config ECF».
 * Por ahí se colaba todo lo demás sin decir palabra: secuencia E34 agotada,
 * factura original sin e-CF aceptado, monto sobre el saldo disponible, RNC
 * fuera del padrón, proveedor caído, certificado vencido. La nota quedaba
 * EMITIDA con Estado DGII en «—», el cajero veía un visto verde, y el problema
 * aparecía días después cuadrando con la DGII.
 *
 * Un documento fiscal sin timbre no es un detalle que se pueda tragar en
 * silencio. Si la emisión falla hay que decirlo y hay que poder reintentarla.
 */

const RAIZ = join(__dirname, '..');

const listar = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'test' || e.name === 'node_modules') continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) acc.push(ruta);
  }
  return acc;
};

/** Cuerpo sin una sola sentencia: solo comentarios y espacios. */
const cuerpoVacio = (cuerpo: string): boolean =>
  cuerpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim() === '';

interface Hallazgo { archivo: string; linea: number; fragmento: string }

const hallazgos: Hallazgo[] = [];
let revisados = 0;

for (const ruta of listar(RAIZ)) {
  const texto = readFileSync(ruta, 'utf8');
  const rel   = ruta.slice(ruta.indexOf('src')).replace(/\\/g, '/');

  for (const m of texto.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([^{}]*)\}/g)) {
    // Solo los catch que envuelven una emisión de e-CF. El `try` está antes, y
    // la llamada con él: 600 caracteres cubren el bloque de sobra.
    const antes = texto.slice(Math.max(0, m.index! - 600), m.index!);
    if (!/\/ecf\/[^\s'"`]*emitir/.test(antes)) continue;

    revisados++;
    if (cuerpoVacio(m[1])) {
      const linea = texto.slice(0, m.index!).split('\n').length;
      hallazgos.push({
        archivo:   rel,
        linea,
        fragmento: m[0].replace(/\s+/g, ' ').slice(0, 100),
      });
    }
  }
}

describe('Emisión de e-CF — el fallo nunca se traga en silencio', () => {
  it('encuentra los catch que envuelven una emisión de e-CF', () => {
    // Si esto baja a cero, el escaneo dejó de mirar donde debía y la
    // comprobación siguiente pasaría en verde sin verificar nada.
    expect(revisados).toBeGreaterThanOrEqual(1);
  });

  it('ninguno se queda sin hacer nada con el error', () => {
    const informe = hallazgos
      .map(h => `${h.archivo}:${h.linea} → ${h.fragmento}`)
      .join('\n');
    expect(informe).toBe('');
  });
});
