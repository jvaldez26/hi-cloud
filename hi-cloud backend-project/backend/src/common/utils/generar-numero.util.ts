import { DataSource } from 'typeorm';

/**
 * Genera el siguiente número secuencial de forma ATÓMICA.
 *
 * Usa SELECT ... FOR UPDATE dentro de una transacción para prevenir
 * race conditions cuando múltiples cajeros/usuarios operan simultáneamente.
 * Sin este lock, MAX()+1 concurrente produce duplicados.
 *
 * @example
 *   const folio = await generarNumeroSecuencial(ds, 'facturas', 'folio', '^FAC-[0-9]+$', 'FAC-', 5, empresaId);
 *   // → 'FAC-00101'
 */
export async function generarNumeroSecuencial(
  dataSource: DataSource,
  tabla: string,
  columna: string,
  regex: string,
  prefijo: string,
  longitudNumero: number,
  empresaId: number,
): Promise<string> {
  return dataSource.transaction(async (em) => {
    const [row] = await em.query<{ maxNum: number | null }[]>(`
      SELECT MAX(
        CASE WHEN "${columna}" ~ $1
             THEN CAST(SUBSTRING("${columna}" FROM ${prefijo.length + 1}) AS INTEGER)
             ELSE 100
        END
      ) AS "maxNum"
      FROM "${tabla}"
      WHERE "empresaId" = $2
        AND "isActive" = true
      FOR UPDATE
    `, [regex, empresaId]);

    const next = Math.max(101, (row?.maxNum ?? 100) + 1);
    return `${prefijo}${String(next).padStart(longitudNumero, '0')}`;
  });
}
