import { DataSource } from 'typeorm';

/**
 * Genera el siguiente número secuencial de forma atómica usando contadores_secuencia.
 * El INSERT ... ON CONFLICT DO UPDATE de PostgreSQL garantiza que dos requests
 * concurrentes nunca obtengan el mismo número (elimina la race condition del MAX()).
 *
 * @example
 *   const folio = await generarNumeroSecuencial(ds, 'facturas', 'folio', '^FAC-[0-9]+$', 'FAC-', 1, empresaId);
 *   // → 'FAC-302'
 */
export async function generarNumeroSecuencial(
  dataSource:     DataSource,
  _tabla:         string,   // conservado para compatibilidad — ya no se usa
  _columna:       string,
  _regex:         string,
  prefijo:        string,
  _longitudNumero: number,
  empresaId:      number,
): Promise<string> {
  // 'FAC-' → 'FAC',  'NC-' → 'NC',  'CONT-' → 'CONT'
  const tipo = prefijo.endsWith('-') ? prefijo.slice(0, -1) : prefijo;

  const [row] = await dataSource.query<{ numero: number }[]>(
    `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
    [empresaId, tipo],
  );

  return `${prefijo}${row.numero}`;
}
