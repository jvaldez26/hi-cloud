import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Formulario único de producto (2026-10-16) — al revisar `unidadMedida`
 * fuera del catálogo activo de cada empresa (3,477 productos), la gran
 * mayoría (3,457, casi todos de una sola empresa) resultaron ser el MISMO
 * código del catálogo con otra capitalización ('pza' en vez de 'PZA').
 * Nunca fueron unidades inventadas — es drift de mayúsculas/minúsculas,
 * probablemente de una importación CSV o un alta vieja sin `<UomSelect/>`.
 *
 * Solo normaliza cuando hay EXACTAMENTE UNA unidad activa de esa empresa
 * que calza ignorando mayúsculas (verificado antes de escribir esto:
 * ninguna empresa tiene dos códigos de catálogo que solo difieran en
 * mayúsculas — igual se vuelve a comprobar aquí, por si cambiara en el
 * futuro). Los productos que no calzan con NINGUNA unidad del catálogo ni
 * ignorando mayúsculas (20 en producción) quedan intactos — el formulario
 * los muestra tal cual con un aviso, no se les adivina nada.
 */
export class NormalizarUnidadMedidaPorMayusculas1788000000000 implements MigrationInterface {
  name = 'NormalizarUnidadMedidaPorMayusculas1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const resultado = await queryRunner.query(`
      WITH candidatos AS (
        SELECT p.id AS "productoId", p."unidadMedida" AS actual, u.codigo AS correcta
        FROM productos p
        JOIN unidades_medida u
          ON u."empresaId" = p."empresaId"
         AND u.activa = true
         AND LOWER(u.codigo) = LOWER(p."unidadMedida")
        WHERE p."isActive" = true
          AND NOT EXISTS (
            SELECT 1 FROM unidades_medida u2
            WHERE u2."empresaId" = p."empresaId" AND u2.codigo = p."unidadMedida" AND u2.activa = true
          )
      ),
      -- Defensa en profundidad: si alguna empresa tuviera DOS unidades que
      -- solo difieren en mayúsculas, un producto suyo calzaría con ambas —
      -- esos quedan fuera (ambiguo, no se adivina cuál es la correcta).
      sinAmbiguedad AS (
        SELECT "productoId", MIN(correcta) AS correcta
        FROM candidatos
        GROUP BY "productoId"
        HAVING COUNT(DISTINCT correcta) = 1
      )
      UPDATE productos p
      SET "unidadMedida" = s.correcta
      FROM sinAmbiguedad s
      WHERE p.id = s."productoId"
      RETURNING p.id
    `);
    const actualizados = Array.isArray(resultado) ? resultado[0]?.length ?? resultado.length : 0;
    console.log(`[NormalizarUnidadMedidaPorMayusculas] ${actualizados} producto(s) normalizados`);
  }

  public async down(): Promise<void> {
    // Irreversible a propósito: no hay forma de distinguir, después del
    // hecho, un producto que YA tenía la capitalización correcta de uno
    // que la tuvo antes de esta migración — revertir arriesgaría
    // reintroducir el mismatch en productos que nunca lo tuvieron.
  }
}
