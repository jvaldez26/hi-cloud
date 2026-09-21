/**
 * Estado de Resultados v2 (2026-09-21) — arma las filas planas para la
 * tabla (header de bloque + cuentas + total, en ese orden) a partir de
 * EstadoResultadosPeriodo. Espejo en frontend de
 * estado-resultados-bloques.util.ts#aplanarEstadoResultados (backend), pero
 * con el estado de "bloque abierto/cerrado" que solo existe en la UI —
 * colapsado muestra únicamente la fila header (que ya trae el total).
 */
import { EstadoResultadosPeriodo, BloqueResultado, LineaCalculada } from '../api/reportesFinancieros.api';

export interface FilaER {
  key:                  string;
  tipo:                 'header' | 'cuenta' | 'total' | 'calculada';
  bloque:                string; // nombre del bloque dueño ('' para líneas calculadas)
  codigo:                string; // '' salvo en filas de cuenta
  nombre:                string;
  monto:                 number;
  porcentajeIngresos:    number;
  porcentajeMargen:      number | null;
}

export const NOMBRES_BLOQUES = ['Ingresos', 'Costo de Ventas', 'Gastos', 'Otros Ingresos', 'Otros Gastos'] as const;

function filasBloque(bloque: BloqueResultado, abierto: boolean): FilaER[] {
  const filas: FilaER[] = [{
    key: `header-${bloque.nombre}`, tipo: 'header', bloque: bloque.nombre, codigo: '',
    nombre: bloque.nombre, monto: bloque.total,
    porcentajeIngresos: bloque.porcentajeIngresos, porcentajeMargen: null,
  }];
  if (abierto) {
    filas.push(...bloque.cuentas.map(c => ({
      key: `cuenta-${bloque.nombre}-${c.codigo}`, tipo: 'cuenta' as const, bloque: bloque.nombre, codigo: c.codigo,
      nombre: c.nombre, monto: c.monto,
      porcentajeIngresos: c.porcentajeIngresos, porcentajeMargen: null,
    })));
    filas.push({
      key: `total-${bloque.nombre}`, tipo: 'total', bloque: bloque.nombre, codigo: '',
      nombre: `Total ${bloque.nombre}`, monto: bloque.total,
      porcentajeIngresos: bloque.porcentajeIngresos, porcentajeMargen: null,
    });
  }
  return filas;
}

function filaCalculada(linea: LineaCalculada): FilaER {
  return {
    key: `calc-${linea.nombre}`, tipo: 'calculada', bloque: '', codigo: '',
    nombre: linea.nombre, monto: linea.monto,
    porcentajeIngresos: linea.porcentajeIngresos, porcentajeMargen: linea.porcentajeMargen,
  };
}

/** Orden EXACTO de la estructura pedida. `bloquesAbiertos` controla qué bloques muestran sus cuentas. */
export function armarFilasER(periodo: EstadoResultadosPeriodo, bloquesAbiertos: Set<string>): FilaER[] {
  return [
    ...filasBloque(periodo.ingresos, bloquesAbiertos.has('Ingresos')),
    ...filasBloque(periodo.costoDeVentas, bloquesAbiertos.has('Costo de Ventas')),
    filaCalculada(periodo.utilidadBruta),
    ...filasBloque(periodo.gastos, bloquesAbiertos.has('Gastos')),
    filaCalculada(periodo.resultadoOperacional),
    ...filasBloque(periodo.otrosIngresos, bloquesAbiertos.has('Otros Ingresos')),
    ...filasBloque(periodo.otrosGastos, bloquesAbiertos.has('Otros Gastos')),
    filaCalculada(periodo.gananciaPerdidaDelPeriodo),
  ];
}

/** Clave estable de una fila — para leer el monto de la MISMA fila en otro período (comparativos, "Por mes"). */
export function claveDeFila(fila: FilaER): string {
  if (fila.tipo === 'cuenta') return `c:${fila.codigo}`;
  if (fila.tipo === 'header' || fila.tipo === 'total') return `t:${fila.bloque}`;
  return `l:${fila.nombre}`;
}

/** codigo/bloque/nombre-de-línea → monto, de un período CUALQUIERA — para buscar el valor de la misma fila en otro período. */
export function mapaMontosPorClave(periodo: EstadoResultadosPeriodo): Map<string, number> {
  const m = new Map<string, number>();
  const registrar = (bloque: BloqueResultado) => {
    for (const c of bloque.cuentas) m.set(`c:${c.codigo}`, c.monto);
    m.set(`t:${bloque.nombre}`, bloque.total);
  };
  registrar(periodo.ingresos);
  registrar(periodo.costoDeVentas);
  registrar(periodo.gastos);
  registrar(periodo.otrosIngresos);
  registrar(periodo.otrosGastos);
  m.set(`l:${periodo.utilidadBruta.nombre}`, periodo.utilidadBruta.monto);
  m.set(`l:${periodo.resultadoOperacional.nombre}`, periodo.resultadoOperacional.monto);
  m.set(`l:${periodo.gananciaPerdidaDelPeriodo.nombre}`, periodo.gananciaPerdidaDelPeriodo.monto);
  return m;
}

/** Buscador que filtra manteniendo la estructura de bloques: una cuenta sobrevive si coincide ella o el bloque/línea calculada. */
export function filtrarFilasER(filas: FilaER[], termino: string): FilaER[] {
  const t = termino.trim().toLowerCase();
  if (!t) return filas;

  const coincide = (f: FilaER) => f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t);

  // Agrupa por bloque (o standalone para header/calculada), decide si el grupo sobrevive.
  const out: FilaER[] = [];
  let i = 0;
  while (i < filas.length) {
    const f = filas[i];
    if (f.tipo === 'calculada') {
      if (coincide(f)) out.push(f);
      i++;
      continue;
    }
    if (f.tipo === 'header') {
      // Recolecta todo el grupo (header + cuentas + total, si el bloque está abierto).
      const grupo: FilaER[] = [f];
      let j = i + 1;
      while (j < filas.length && filas[j].bloque === f.bloque && filas[j].tipo !== 'header') {
        grupo.push(filas[j]); j++;
      }
      const cuentasCoinciden = grupo.some(g => g.tipo === 'cuenta' && coincide(g));
      if (coincide(f) || cuentasCoinciden) {
        // Si el bloque está cerrado (solo el header), o si coincide el header/bloque completo, se muestra entero.
        if (grupo.length === 1 || coincide(f)) {
          out.push(...grupo);
        } else {
          out.push(f, ...grupo.filter(g => g.tipo === 'cuenta' && coincide(g)), ...grupo.filter(g => g.tipo === 'total'));
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}
