import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ninguna pantalla ofrece «Cancelar» una factura sin mirar antes si tiene e-CF.
 *
 * El caso real: el detalle de la factura pintaba un botón rojo «✗ Cancelar» en
 * una E32 ya ACEPTADA POR LA DGII. El backend lo rechaza siempre
 * —`cambiarEstado` corta en seco con cualquier `ecfId`, en cualquier estado
 * DGII— porque anular un comprobante emitido exige una Nota de Crédito (E34),
 * no un cambio de estado local. Así que el botón no podía funcionar nunca: solo
 * devolvía un error.
 *
 * Lo que lo delata como descuido y no como criterio: `FacturasPage` YA filtraba
 * esa opción, con su comentario explicando que es «solo para no ofrecer una
 * opción que el servidor va a rechazar». El detalle se quedó sin el filtro. Un
 * mismo botón en dos pantallas, y una sola acertando.
 *
 * La regla que se vigila: si una pantalla calcula las transiciones disponibles y
 * entre ellas está 'cancelada', ese cálculo TIENE que consultar el e-CF.
 */

const RAIZ = join(__dirname, '..', 'pages');

const listar = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
};

interface Hallazgo { archivo: string; expresion: string }

const hallazgos: Hallazgo[] = [];
let revisados = 0;

for (const ruta of listar(join(RAIZ, 'facturas'))) {
  const texto = readFileSync(ruta, 'utf8');
  const rel   = ruta.slice(ruta.indexOf('pages')).replace(/\\/g, '/');

  // Solo las pantallas que de verdad ofrecen cancelar una factura.
  if (!/TRANSICIONES/.test(texto)) continue;
  if (!/emitida:\s*\[[^\]]*'cancelada'/.test(texto)) continue;

  for (const m of texto.matchAll(/const\s+siguientes\s*=\s*([^;]+);/g)) {
    revisados++;
    const expresion = m[1].replace(/\s+/g, ' ');
    // El cálculo tiene que nombrar el e-CF de alguna forma: `tieneEcf`, `.ecf`…
    if (!/ecf/i.test(expresion)) {
      hallazgos.push({ archivo: rel, expresion });
    }
  }
}

describe('Cancelar factura — el botón mira el e-CF antes de ofrecerse', () => {
  it('encuentra las pantallas que ofrecen cancelar', () => {
    // Si esto baja a cero, el escaneo dejó de mirar donde debía y la
    // comprobación siguiente pasaría en verde sin verificar nada.
    expect(revisados).toBeGreaterThanOrEqual(2);
  });

  it('ninguna calcula las transiciones sin consultar el e-CF', () => {
    const informe = hallazgos
      .map(h => `${h.archivo} → siguientes = ${h.expresion}`)
      .join('\n');
    expect(informe).toBe('');
  });
});
