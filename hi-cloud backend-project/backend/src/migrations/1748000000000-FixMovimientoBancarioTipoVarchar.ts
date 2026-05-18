import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte movimientos_bancarios.tipo de ENUM a VARCHAR(20).
 *
 * Problema: la columna fue creada como PostgreSQL ENUM con valores distintos
 * a los del código ('credito'/'debito' en minúscula). Con synchronize:false
 * TypeORM no puede actualizar el tipo y PostgreSQL rechaza inserciones con 22P02.
 *
 * Solución: VARCHAR acepta cualquier string; la validación sigue vía @IsEnum en el DTO.
 */
export class FixMovimientoBancarioTipoVarchar1748000000000 implements MigrationInterface {
  name = 'FixMovimientoBancarioTipoVarchar1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE movimientos_bancarios
        ALTER COLUMN tipo TYPE VARCHAR(20)
        USING CASE
          WHEN LOWER(tipo::TEXT) LIKE 'cred%' THEN 'credito'
          WHEN LOWER(tipo::TEXT) LIKE 'deb%'  THEN 'debito'
          ELSE LOWER(tipo::TEXT)
        END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir a enum sería recrear el tipo — se deja como varchar en rollback.
  }
}
