import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega la columna controlCajaActivo a la tabla empresa.
 *
 * Esta columna es un booleano directo (NOT NULL) — no vive en el blob
 * configuracion para que ningún UPDATE parcial pueda borrarla accidentalmente.
 * Controla si la empresa exige abrir turno de caja antes de facturar.
 *
 * Valores sembrados individualmente:
 *   ACTIVADO  (true)  — empresas que ya usan cierres reales con arqueo:
 *     44  Ventas Populares R&M
 *     52  REPUESTOS CRANCHA
 *     53  LUBRI GOMAS
 *     57  MULTISERVICIOS HI GLOBAL
 *     61  FERRETERIA PAVEL
 *
 *   DESACTIVADO (false) — el resto (incluye MOTO REPUESTO MANOLIN #50,
 *   pendiente de decisión con el cliente).
 */
export class AddControlCajaActivo1757000000000 implements MigrationInterface {
  name = 'AddControlCajaActivo1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Evitar timeout en locks en ambientes de producción con carga.
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Agregar columna con default false para las empresas no listadas.
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "controlCajaActivo" BOOLEAN NOT NULL DEFAULT false
    `);

    // Activar solo para las empresas que usan control de caja con arqueo real.
    await queryRunner.query(`
      UPDATE empresa
         SET "controlCajaActivo" = true
       WHERE id IN (44, 52, 53, 57, 61)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "controlCajaActivo"
    `);
  }
}
