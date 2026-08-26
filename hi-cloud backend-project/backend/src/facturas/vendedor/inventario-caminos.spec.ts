import * as fs   from 'fs';
import * as path from 'path';

/**
 * GUARDIAN: nadie crea facturas por su cuenta sin decidir quien vende.
 *
 * El bug de las 249 huerfanas no fue que resolverVendedor() estuviera mal: fue
 * que solo lo llamaba create(), y con los meses aparecieron otros nueve sitios
 * que crean facturas sin pasar por ahi. Nadie lo noto porque nada lo vigilaba.
 *
 * Este test inventaria los sitios que crean facturas y falla si aparece uno
 * nuevo. No comprueba que el sitio nuevo este bien —eso lo hace
 * siete-caminos.spec.ts— sino que OBLIGA a mirarlo y a declarar como se cubre.
 *
 * Dos estrategias validas:
 *   'resuelve-al-crear'  la factura nace EMITIDA: tiene que llamar al resolver.
 *   'borrador'           nace BORRADOR: el vendedor se lo pone cambiarEstado()
 *                        al emitir, que es la unica puerta borrador -> emitida.
 */

type Estrategia = 'resuelve-al-crear' | 'borrador';

const INVENTARIO: Record<string, { sitios: number; estrategia: Estrategia; nota: string }> = {
  'src/facturas/facturas.service.ts': {
    sitios: 2, estrategia: 'resuelve-al-crear',
    nota: 'create() resuelve; duplicar() crea BORRADOR y NO hereda el vendedor del original',
  },
  'src/pre-factura/pre-factura.service.ts': {
    sitios: 2, estrategia: 'resuelve-al-crear',
    nota: 'convertirAFactura() nace EMITIDA y resuelve; cobrarDesdePos() crea BORRADOR con el vendedor de la caja',
  },
  'src/restaurante/restaurante.service.ts': {
    sitios: 1, estrategia: 'resuelve-al-crear',
    nota: 'INSERT crudo, nace EMITIDA: resuelve antes de insertar',
  },
  'src/cotizaciones/cotizaciones.service.ts': {
    sitios: 2, estrategia: 'borrador',
    nota: 'convertirAFactura() y cobrarDesdePos(), las dos en BORRADOR',
  },
  'src/contratos/contratos.service.ts': {
    sitios: 1, estrategia: 'borrador',
    nota: 'cron y manual: en el cron no hay usuario, asi que nace sin vendedor a proposito',
  },
  'src/servicios/servicios.service.ts': {
    sitios: 1, estrategia: 'borrador',
    nota: 'orden de servicio -> factura',
  },
  'src/facturas-recurrentes/facturas-recurrentes.service.ts': {
    sitios: 1, estrategia: 'borrador',
    nota: 'cron: nadie vendio nada al generarla desde la plantilla',
  },
};

/** Sitios que crean una fila en `facturas`. */
const PATRON = new RegExp(
  [
    'facturaRepo(sitory)?\\s*\\.\\s*create\\s*\\(',
    'INSERT\\s+INTO\\s+facturas\\b',
    'manager\\s*\\.\\s*create\\s*\\(\\s*Factura\\b',
  ].join('|'),
  'i',
);

function escanear(): Map<string, number[]> {
  const raiz  = path.resolve(__dirname, '../..');       // src/
  const hallazgos = new Map<string, number[]>();

  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.spec.ts')) continue;

      const rel   = 'src/' + path.relative(raiz, p).split(path.sep).join('/');
      const lineas = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      const hits: number[] = [];
      lineas.forEach((l, i) => { if (PATRON.test(l)) hits.push(i + 1); });
      if (hits.length) hallazgos.set(rel, hits);
    }
  })(raiz);

  return hallazgos;
}

const COMO_ARREGLARLO =
  '\n\n  Si has anadido un sitio que crea facturas, decide como se le pone el vendedor:\n' +
  '    - Si nace EMITIDA: llama a VendedorResolverService.resolverVendedor() antes de crearla.\n' +
  '    - Si nace BORRADOR: no hace falta, cambiarEstado() se lo pone al emitir.\n' +
  '  Luego declara el sitio en INVENTARIO (este archivo) y anade el caso a\n' +
  '  siete-caminos.spec.ts. Ver docs/estado-actual.md seccion 1.\n';

describe('inventario de caminos que crean facturas', () => {
  const hallazgos = escanear();

  it('no hay ningun camino sin declarar', () => {
    const sinDeclarar = [...hallazgos.keys()].filter(f => !(f in INVENTARIO));
    expect(sinDeclarar.join(', ') + (sinDeclarar.length ? COMO_ARREGLARLO : '')).toBe('');
  });

  it('no hay caminos declarados que ya no existan', () => {
    const fantasmas = Object.keys(INVENTARIO).filter(f => !hallazgos.has(f));
    expect(fantasmas).toEqual([]);
  });

  it.each(Object.entries(INVENTARIO))(
    '%s mantiene el numero de sitios declarado',
    (archivo, { sitios }) => {
      const hits = hallazgos.get(archivo) ?? [];
      expect(
        `${archivo}: ${hits.length} sitio(s) en lineas ${hits.join(', ')}` +
        (hits.length !== sitios ? COMO_ARREGLARLO : ''),
      ).toBe(`${archivo}: ${sitios} sitio(s) en lineas ${hits.join(', ')}`);
    },
  );

  it('los que nacen EMITIDA llaman al resolver', () => {
    const raiz = path.resolve(__dirname, '../..');
    for (const [archivo, { estrategia }] of Object.entries(INVENTARIO)) {
      if (estrategia !== 'resuelve-al-crear') continue;
      const txt = fs.readFileSync(path.join(raiz, archivo.replace(/^src\//, '')), 'utf8');
      expect(`${archivo} -> ${txt.includes('resolverVendedor(')}`).toBe(`${archivo} -> true`);
    }
  });

  it('cambiarEstado sigue siendo la unica puerta BORRADOR -> EMITIDA', () => {
    // Si alguien empieza a poner facturas en EMITIDA por otro sitio, la red de
    // seguridad de los cinco caminos de borrador deja de existir en silencio.
    const raiz    = path.resolve(__dirname, '../..');
    const puertas: string[] = [];

    (function walk(dir: string) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.ts') || e.name.endsWith('.spec.ts')) continue;

        const rel = 'src/' + path.relative(raiz, p).split(path.sep).join('/');
        fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
          if (/estado:\s*FacturaEstado\.EMITIDA/.test(l) || /'emitida'/.test(l)) {
            // Solo interesan las ESCRITURAS, no los filtros de lectura.
            if (/update\(|create\(|INSERT|VALUES/i.test(l) || /estado:\s*FacturaEstado\.EMITIDA/.test(l)) {
              puertas.push(`${rel}:${i + 1}`);
            }
          }
        });
      }
    })(raiz);

    // Las puertas conocidas y por que son legitimas.
    const CONOCIDAS = [
      'src/facturas/facturas.service.ts',   // cambiarEstado(): LA puerta
      'src/pre-factura/pre-factura.service.ts', // nace EMITIDA y resuelve
      'src/restaurante/restaurante.service.ts', // nace EMITIDA y resuelve
      'src/cxc/cxc.service.ts',                 // revierte pagada -> emitida al anular un pago
      'src/recibos-cobro/recibos-cobro.service.ts', // idem al anular un recibo de cobro
    ];
    const desconocidas = puertas.filter(p => !CONOCIDAS.some(c => p.startsWith(c)));

    expect(desconocidas.join(', ') + (desconocidas.length ? COMO_ARREGLARLO : '')).toBe('');
  });
});
