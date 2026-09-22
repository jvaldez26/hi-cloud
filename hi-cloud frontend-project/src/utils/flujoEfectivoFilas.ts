/**
 * Estado de Flujo de Efectivo v2 (2026-09-22) — arma las filas planas para
 * la tabla (header de bloque → línea → cuentas → total, en ese orden) a
 * partir de FlujoEfectivoPeriodo. Espejo en frontend de
 * flujo-efectivo-bloques.util.ts#aplanarFlujoEfectivo (backend), con el
 * estado de "bloque abierto/cerrado" que solo existe en la UI: colapsado
 * (Resumido) muestra solo el header con el total del bloque; abierto
 * (Detallado) muestra cada línea (Resultado Neto, Depreciaciones, Aumento
 * en Cuentas por Cobrar...) y, dentro de cada línea, sus cuentas.
 */
import { FlujoEfectivoPeriodo, BloqueFlujoEfectivo } from '../api/reportesFinancieros.api';

export interface FilaFE {
  key:     string;
  tipo:    'header' | 'linea' | 'cuenta' | 'total' | 'resumen';
  bloque:  string; // nombre del bloque dueño ('' en las 3 filas de resumen final)
  codigo:  string; // '' salvo en filas de cuenta
  nombre:  string;
  monto:   number;
}

export const NOMBRES_BLOQUES_FE = [
  'Flujo de Efectivo de las Operaciones',
  'Efectivo Neto Generado por Inversiones',
  'Flujo de Efectivo de los Financiamientos',
] as const;

function filasBloque(b: BloqueFlujoEfectivo, abierto: boolean): FilaFE[] {
  const filas: FilaFE[] = [{ key: `header-${b.nombre}`, tipo: 'header', bloque: b.nombre, codigo: '', nombre: b.nombre, monto: b.total }];
  if (abierto) {
    for (const l of b.lineas) {
      filas.push({ key: `linea-${b.nombre}-${l.nombre}`, tipo: 'linea', bloque: b.nombre, codigo: '', nombre: l.nombre, monto: l.monto });
      for (const c of l.cuentas) {
        filas.push({ key: `cuenta-${b.nombre}-${l.nombre}-${c.codigo}`, tipo: 'cuenta', bloque: b.nombre, codigo: c.codigo, nombre: c.nombre, monto: c.monto });
      }
    }
    filas.push({ key: `total-${b.nombre}`, tipo: 'total', bloque: b.nombre, codigo: '', nombre: `Total ${b.nombre}`, monto: b.total });
  }
  return filas;
}

/** Orden EXACTO de la estructura pedida. `bloquesAbiertos` controla qué bloques muestran sus líneas/cuentas. */
export function armarFilasFE(periodo: FlujoEfectivoPeriodo, bloquesAbiertos: Set<string>): FilaFE[] {
  return [
    ...filasBloque(periodo.operaciones, bloquesAbiertos.has(periodo.operaciones.nombre)),
    ...filasBloque(periodo.inversiones, bloquesAbiertos.has(periodo.inversiones.nombre)),
    ...filasBloque(periodo.financiamientos, bloquesAbiertos.has(periodo.financiamientos.nombre)),
    { key: 'resumen-cambio', tipo: 'resumen', bloque: '', codigo: '', nombre: 'Cambio Neto en el Efectivo y Equivalentes de Efectivo', monto: periodo.cambioNetoEfectivo },
    { key: 'resumen-inicio', tipo: 'resumen', bloque: '', codigo: '', nombre: 'Efectivo al Inicio del Período', monto: periodo.efectivoInicio },
    { key: 'resumen-fin',    tipo: 'resumen', bloque: '', codigo: '', nombre: 'Efectivo al Final del Período', monto: periodo.efectivoFin },
  ];
}

/** Clave estable de una fila — para leer el monto de la MISMA fila en otro período (comparativos, "Por mes"). */
export function claveDeFilaFE(fila: FilaFE): string {
  if (fila.tipo === 'cuenta') return `c:${fila.bloque}:${fila.codigo}`;
  if (fila.tipo === 'linea') return `l:${fila.bloque}:${fila.nombre}`;
  if (fila.tipo === 'header' || fila.tipo === 'total') return `t:${fila.bloque}`;
  return `r:${fila.nombre}`;
}

/** clave → monto, de un período CUALQUIERA — para buscar el valor de la misma fila en otro período. */
export function mapaMontosPorClaveFE(periodo: FlujoEfectivoPeriodo): Map<string, number> {
  const m = new Map<string, number>();
  const registrar = (b: BloqueFlujoEfectivo) => {
    for (const l of b.lineas) {
      m.set(`l:${b.nombre}:${l.nombre}`, l.monto);
      for (const c of l.cuentas) m.set(`c:${b.nombre}:${c.codigo}`, c.monto);
    }
    m.set(`t:${b.nombre}`, b.total);
  };
  registrar(periodo.operaciones);
  registrar(periodo.inversiones);
  registrar(periodo.financiamientos);
  m.set('r:Cambio Neto en el Efectivo y Equivalentes de Efectivo', periodo.cambioNetoEfectivo);
  m.set('r:Efectivo al Inicio del Período', periodo.efectivoInicio);
  m.set('r:Efectivo al Final del Período', periodo.efectivoFin);
  return m;
}

/** Buscador que filtra manteniendo la estructura de bloques: una cuenta/línea sobrevive si coincide ella o su bloque. */
export function filtrarFilasFE(filas: FilaFE[], termino: string): FilaFE[] {
  const t = termino.trim().toLowerCase();
  if (!t) return filas;

  const coincide = (f: FilaFE) => f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t);

  const out: FilaFE[] = [];
  let i = 0;
  while (i < filas.length) {
    const f = filas[i];
    if (f.tipo === 'resumen') {
      if (coincide(f)) out.push(f);
      i++;
      continue;
    }
    if (f.tipo === 'header') {
      const grupo: FilaFE[] = [f];
      let j = i + 1;
      while (j < filas.length && filas[j].bloque === f.bloque && filas[j].tipo !== 'header') {
        grupo.push(filas[j]); j++;
      }
      const algunoCoincide = grupo.some(g => g.tipo !== 'header' && g.tipo !== 'total' && coincide(g));
      if (coincide(f) || algunoCoincide) {
        if (grupo.length === 1 || coincide(f)) {
          out.push(...grupo);
        } else {
          out.push(f, ...grupo.filter(g => (g.tipo === 'linea' || g.tipo === 'cuenta') && coincide(g)), ...grupo.filter(g => g.tipo === 'total'));
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}
