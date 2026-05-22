import { DataSource } from 'typeorm';

/**
 * Genera el siguiente número secuencial para una empresa.
 *
 * NOTA: FOR UPDATE no es compatible con funciones de agregación en PostgreSQL.
 * La protección contra duplicados se delega a la constraint UNIQUE de cada tabla.
 * Si hay colisión (race condition extrema) el caller recibe un 23505 y puede reintentar.
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
  const [row] = await dataSource.query<{ maxNum: number | null }[]>(`
    SELECT MAX(
      CASE WHEN "${columna}" ~ $1
           THEN CAST(SUBSTRING("${columna}" FROM ${prefijo.length + 1}) AS INTEGER)
           ELSE 100
      END
    ) AS "maxNum"
    FROM "${tabla}"
    WHERE "empresaId" = $2
      AND "isActive" = true
  `, [regex, empresaId]);

  const next = Math.max(101, (row?.maxNum ?? 100) + 1);
  return `${prefijo}${String(next).padStart(longitudNumero, '0')}`;
}
