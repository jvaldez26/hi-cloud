import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * En las pantallas de dinero y documentos fiscales, el error del backend se
 * muestra. No se sustituye por una frase genérica.
 *
 * El caso real: «Sincronizar» en Cuentas por Cobrar fallaba y la pantalla decía
 * solo «Error al sincronizar CxC». El handler era
 *
 *     onError: () => message.error('Error al sincronizar CxC')
 *
 * sin recibir el error. Un 403 por permisos, un 500 y una caída de red se veían
 * exactamente igual, así que no había forma de saber qué pasaba sin abrir la
 * pestaña de red — y el endpoint va con `@Roles(ADMIN, CONTADOR)`, autorizando
 * desde ayer contra el rol POR EMPRESA: un admin en su empresa principal con
 * otro rol en una secundaria recibe un 403 legítimo que la pantalla ocultaba.
 *
 * El interceptor de `api/client.ts` ya deja `.friendlyMessage` en cada error
 * «para que los componentes puedan mostrarlo directamente sin parsear la
 * respuesta». Estas pantallas lo usan en casi todos sus handlers; los que se
 * quedaron atrás eran la excepción, y por esa excepción se perdió una ronda
 * entera de diagnóstico.
 *
 * El alcance son las pantallas donde un error mudo cuesta dinero o un
 * comprobante fiscal. Los verticales —clínica, farmacia, gimnasio, agro,
 * taller— quedan fuera por ahora: tienen ~65 handlers iguales y su barrido es
 * una tanda aparte.
 */

const CARPETAS = [
  'cxc', 'facturas', 'recibos-cobro', 'notas-credito', 'notas-debito',
  'caja', 'cotizaciones', 'pos', 'compras',
];

const RAIZ = join(__dirname, '..', 'pages');

const listar = (dir: string, acc: string[] = []): string[] => {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
};

interface Hallazgo { archivo: string; linea: number; fragmento: string }

const hallazgos: Hallazgo[] = [];
let revisados = 0;

for (const ruta of CARPETAS.flatMap(c => listar(join(RAIZ, c)))) {
  const texto = readFileSync(ruta, 'utf8');
  const rel   = ruta.slice(ruta.indexOf('pages')).replace(/\\/g, '/');

  // Todo onError de un useMutation, con o sin parámetro.
  for (const m of texto.matchAll(/onError:\s*(\([^)]*\))\s*=>\s*([^\n]*)/g)) {
    revisados++;
    const params = m[1];
    const cuerpo = m[2];
    // Sin parámetro no hay forma de mirar el error: el mensaje del backend se
    // pierde por construcción.
    if (/^\(\s*\)$/.test(params)) {
      hallazgos.push({
        archivo: rel,
        linea:   texto.slice(0, m.index!).split('\n').length,
        fragmento: `onError: ${params} => ${cuerpo}`.replace(/\s+/g, ' ').slice(0, 100),
      });
    }
  }
}

describe('Pantallas de dinero — el error del backend llega al usuario', () => {
  it('encuentra los onError que revisar', () => {
    // Si esto baja a cero, el escaneo dejó de mirar donde debía y la
    // comprobación siguiente pasaría en verde sin verificar nada.
    expect(revisados).toBeGreaterThan(20);
  });

  it('ninguno descarta el error sin mirarlo', () => {
    const informe = hallazgos
      .map(h => `${h.archivo}:${h.linea} → ${h.fragmento}`)
      .join('\n');
    expect(informe).toBe('');
  });
});
