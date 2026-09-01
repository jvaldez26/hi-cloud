/**
 * Cómo se juzga el tamaño de un respaldo.
 *
 * Vive fuera de BackupsPage.tsx a propósito: el frontend no tiene runner de
 * tests y los .tsx no se pueden importar con `--experimental-strip-types`, así
 * que la única forma de que `npm run verificar:backups` compruebe la lógica
 * REAL —y no una copia que se desincroniza— es que no esté dentro del JSX.
 */

/**
 * `du -sh` da cadenas CON UNIDAD ("18M", "1.5G", "500K"). El código anterior
 * hacía `parseFloat(t)`: leía el número y TIRABA la unidad, así que "500K"
 * valía 500 y salía en ámbar —"esto está creciendo"— cuando dice lo contrario.
 */
const UNIDAD: Record<string, number> = {
  K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4,
};

export function tamanioBytes(t?: string | null): number | null {
  if (!t) return null;
  const m = /^\s*([\d.,]+)\s*([KMGT])?/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n * (m[2] ? UNIDAD[m[2].toUpperCase()] : 1);
}

export function humano(bytes: number): string {
  if (bytes >= UNIDAD.G) return `${(bytes / UNIDAD.G).toFixed(1)}G`;
  if (bytes >= UNIDAD.M) return `${Math.round(bytes / UNIDAD.M)}M`;
  if (bytes >= UNIDAD.K) return `${Math.round(bytes / UNIDAD.K)}K`;
  return `${bytes}B`;
}

/**
 * Mediana en bytes de los respaldos EXITOSOS visibles. Es la referencia de "lo
 * normal" contra la que se juzga cada fila.
 *
 * Mediana y no media: un solo dump truncado tira de la media hacia abajo y
 * acaba tapándose a sí mismo. La mediana lo ignora.
 *
 * Se excluyen los FALLIDOS porque no tienen tamaño real que comparar, y los
 * ceros porque un "0" contaminaría la referencia hacia abajo.
 *
 * LÍMITE CONOCIDO: se calcula sobre la PÁGINA visible, que es lo único que el
 * frontend tiene. Si una página entera estuviera truncada, su propia mediana
 * sería el tamaño truncado y nada saldría en rojo por comparación. Para ese
 * caso está el suelo absoluto de evaluarTamanio().
 */
export function medianaBytes(items: Array<{ estado?: string; tamanio?: string }>): number | null {
  const v = items
    .filter(r => r?.estado === 'EXITOSO')
    .map(r => tamanioBytes(r?.tamanio))
    .filter((n): n is number => n !== null && n > 0)
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Grande NO es el único problema, y era el único que esto miraba.
 *
 * El dump de esta base ronda los 20M. Uno de 500K no es "un respaldo pequeño":
 * es un respaldo TRUNCADO —pg_dump cortado, disco lleno, subida a medias— y es
 * el primero que hay que mirar, no el último. Salía en verde.
 *
 * Se compara contra la mediana en vez de contra un número escrito a mano
 * porque la base crece: un umbral fijo empieza acertando y acaba mintiendo.
 */
export function evaluarTamanio(
  t: string | undefined | null,
  ref: number | null,
): { color: string; aviso?: string } {
  const b = tamanioBytes(t);
  if (b === null) return { color: '#94a3b8' };

  // Suelo absoluto, independiente de la referencia. Un respaldo completo de
  // este ERP no baja de un mega ni vacío: si lo hace, el archivo no sirve, y
  // esto tiene que saltar aunque la mediana de la página también esté mal.
  if (b < UNIDAD.M) {
    return {
      color: '#ef4444',
      aviso: `${t} para una base entera no es un respaldo pequeño, es un dump truncado. ` +
             'Descárgalo y ábrelo antes de contar con él.',
    };
  }

  if (ref) {
    if (b < ref * 0.5) {
      return {
        color: '#ef4444',
        aviso: `${t} es menos de la mitad de lo normal (${humano(ref)}). Suele significar ` +
               'que pg_dump se cortó a medias: disco lleno, timeout, o la subida incompleta.',
      };
    }
    if (b > ref * 3) {
      return {
        color: '#f59e0b',
        aviso: `${t} es más del triple de lo normal (${humano(ref)}). Puede ser crecimiento ` +
               'real, o tablas de log/auditoría que nadie purga.',
      };
    }
  }

  // Escala absoluta, ya sin nada raro respecto a los demás.
  if (b >= UNIDAD.G) {
    return { color: '#f59e0b', aviso: 'Más de 1 GB: el respaldo y su verificación van a tardar.' };
  }
  return { color: '#10b981' };
}
