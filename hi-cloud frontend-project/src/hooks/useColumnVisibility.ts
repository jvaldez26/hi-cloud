import { useState, useEffect } from 'react';
import { message } from 'antd';
import type { ColumnType } from 'antd/es/table';

export interface ColDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

/**
 * Preferencia de columnas de una tabla.
 *
 * Se guarda lo que el usuario CAMBIÓ respecto a los defaults, no la lista de
 * columnas visibles. La diferencia importa:
 *
 * Guardando las visibles, una columna nueva no está en la lista de nadie que
 * hubiera tocado el selector alguna vez, así que le queda oculta — y como está
 * oculta, no la ve, y como no la ve, no sabe que existe para poder activarla.
 * Cada columna añadida a las 126 tablas del ERP se estrenó así.
 *
 * Guardando los cambios, lo que no se menciona sigue el default: una columna
 * nueva aparece sola para todo el mundo.
 *
 * Son DOS listas y no una porque hay 147 columnas declaradas con
 * `defaultVisible: false` en 84 páginas. Con solo `ocultas`, esas columnas no
 * estarían mencionadas en la preferencia de nadie y pasarían a mostrarse —
 * exactamente el mismo bug al revés. `mostradas` guarda las que el usuario sacó
 * a propósito de entre las ocultas por defecto.
 */
export interface CambiosColumnas {
  /** El usuario las escondió (venían visibles por defecto). */
  ocultas:   string[];
  /** El usuario las sacó (venían ocultas por defecto). */
  mostradas: string[];
}

const VACIO: CambiosColumnas = { ocultas: [], mostradas: [] };

/**
 * Qué columnas se ven, dados los cambios guardados.
 *
 * Una clave que ya no está en `todas` se ignora en silencio: retirar una columna
 * no puede romperle la tabla a quien la tuviera guardada. Al escribir sí se
 * normaliza (ver `calcularCambios`), que es donde tiene arreglo.
 *
 * Pura y exportada para poder verificarla — ver scripts/verificar-columnas.mjs.
 */
export function calcularVisibles(cambios: CambiosColumnas, todas: ColDef[]): string[] {
  return todas
    .filter(c => {
      if (cambios.mostradas.includes(c.key)) return true;
      if (cambios.ocultas.includes(c.key))   return false;
      return c.defaultVisible !== false;
    })
    .map(c => c.key);
}

/**
 * Del listado de visibles que maneja la UI a las desviaciones que se guardan.
 *
 * Al recalcular desde `todas`, las claves de columnas ya retiradas se caen solas
 * en la primera escritura.
 */
export function calcularCambios(visibles: string[], todas: ColDef[]): CambiosColumnas {
  const quiere = new Set(visibles);
  const out: CambiosColumnas = { ocultas: [], mostradas: [] };

  for (const c of todas) {
    const visiblePorDefecto = c.defaultVisible !== false;
    const laQuiereVisible   = quiere.has(c.key);
    if (laQuiereVisible === visiblePorDefecto) continue;   // sin desviación
    if (laQuiereVisible) out.mostradas.push(c.key);
    else                 out.ocultas.push(c.key);
  }
  return out;
}

/**
 * Clave nueva. La vieja (`hicloud-columns-…`) NO se borra al migrar: queda como
 * foto para poder revertir este cambio sin que nadie pierda su configuración.
 */
const claveNueva = (modulo: string) => `hicloud-cols-cambios-${modulo}`;
const claveVieja = (modulo: string) => `hicloud-columns-${modulo}`;

/**
 * Marca de que ya se avisó del límite de la migración. Es global y no por tabla:
 * quien tenga cinco tablas migradas no necesita el mismo aviso cinco veces.
 */
const CLAVE_AVISO = 'hicloud-cols-aviso-migracion';

function leerJSON<T>(clave: string): T | null {
  try {
    const s = localStorage.getItem(clave);
    return s ? (JSON.parse(s) as T) : null;
  } catch { return null; }
}

/**
 * Convierte la preferencia vieja (lista de visibles) al formato nuevo.
 *
 * Ojo con lo que esta conversión NO puede hacer: no hay forma de distinguir
 * "el usuario escondió esta columna" de "esta columna no existía cuando guardó".
 * Las dos se ven igual, una ausencia. Así que una columna añadida ANTES de este
 * cambio sigue oculta para quien ya tuviera preferencia; el botón de restaurar
 * es la salida. De aquí en adelante no puede volver a pasar.
 */
export function migrarDesdeVisibles(visibles: string[], todas: ColDef[]): CambiosColumnas {
  const vis = new Set(visibles);
  return {
    ocultas:   todas.filter(c => c.defaultVisible !== false && !vis.has(c.key)).map(c => c.key),
    mostradas: todas.filter(c => c.defaultVisible === false &&  vis.has(c.key)).map(c => c.key),
  };
}

export function useColumnVisibility(moduloKey: string, allColumns: ColDef[]) {
  const [cambios, setCambios] = useState<CambiosColumnas>(() => {
    const nuevo = leerJSON<CambiosColumnas>(claveNueva(moduloKey));
    if (nuevo && Array.isArray(nuevo.ocultas) && Array.isArray(nuevo.mostradas)) return nuevo;

    const viejo = leerJSON<string[]>(claveVieja(moduloKey));
    if (Array.isArray(viejo)) {
      const migrado = migrarDesdeVisibles(viejo, allColumns);
      try { localStorage.setItem(claveNueva(moduloKey), JSON.stringify(migrado)); } catch { /* ignorar */ }
      return migrado;
    }
    return VACIO;
  });

  /**
   * El límite de la migración, dicho a quien lo sufre.
   *
   * Una columna añadida antes de este cambio sigue oculta para quien ya tuviera
   * preferencia guardada, y no hay forma de detectarlo desde el código: "la
   * escondió" y "no existía cuando guardó" son la misma ausencia. Quien lo
   * padece no va a leer el comentario del hook, así que se le dice una vez y se
   * le señala la salida.
   *
   * El aviso es global y no por tabla —quien tenga cinco migradas no necesita
   * verlo cinco veces— y se marca en localStorage para que no vuelva nunca.
   *
   * La condición se lee de localStorage y NO de una bandera puesta al migrar.
   * Con una bandera en ref no funciona: StrictMode desmonta y vuelve a montar en
   * desarrollo, y en el segundo montaje la clave nueva ya existe, así que no se
   * migra, el ref nace en false y el aviso no sale nunca. Se comprobó: la marca
   * quedaba en null. La presencia de la clave vieja sí sobrevive al remontaje.
   */
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_AVISO)) return;
      // Solo tiene sentido avisar a quien venía del formato viejo.
      if (!localStorage.getItem(claveVieja(moduloKey))) return;
      localStorage.setItem(CLAVE_AVISO, '1');
    } catch { return; }   // sin localStorage no hay marca: mejor callar que repetir
    message.info({
      content: 'Cambiamos cómo se guardan las columnas de las tablas. Si echas en falta alguna, '
             + 'usa «Restaurar columnas» en el menú ☰ de la tabla.',
      duration: 10,
    });
  }, [moduloKey]);

  const visibleColumns = calcularVisibles(cambios, allColumns);

  /**
   * Recibe la lista de VISIBLES —es lo que ColumnToggle sabe manejar y lo que
   * llaman las 126 páginas— y guarda solo las diferencias con el default.
   */
  const updateVisibility = (cols: string[]) => {
    const next = calcularCambios(cols, allColumns);
    setCambios(next);
    try { localStorage.setItem(claveNueva(moduloKey), JSON.stringify(next)); } catch { /* ignorar */ }
  };

  /** Vuelve a los defaults del módulo, como si nunca se hubiera tocado. */
  const restaurar = () => {
    setCambios(VACIO);
    try { localStorage.removeItem(claveNueva(moduloKey)); } catch { /* ignorar */ }
  };

  /** true = no hay ninguna desviación guardada. Lo usa el botón de restaurar. */
  const esPorDefecto = cambios.ocultas.length === 0 && cambios.mostradas.length === 0;

  /**
   * El universo sigue siendo `allColumns`: una columna de la tabla que no esté
   * declarada en el COLS_DEF se comporta como hasta ahora. Sacarlas a la luz es
   * un cambio visible en decenas de páginas del ERP y va aparte, no colado en
   * el arreglo de la persistencia.
   */
  const filterColumns = <T,>(columns: ColumnType<T>[]): ColumnType<T>[] =>
    columns.filter(col => {
      const k = (col.key ?? (col as any).dataIndex) as string;
      // 'acc' / 'acciones' / 'actions' son siempre visibles (columna de botones)
      return k === 'acc' || k === 'acciones' || k === 'actions' || visibleColumns.includes(k);
    });

  return { visibleColumns, updateVisibility, filterColumns, restaurar, esPorDefecto };
}
