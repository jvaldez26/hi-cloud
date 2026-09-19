import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P3 Bloque 4 — flag esCuentaSistema en cuentas_contables. El motor de
 * asientos automáticos referencia cuentas por CÓDIGO (COD.* en
 * asientos-automaticos.service.ts), no por id — el código de una cuenta
 * hoy es editable sin restricción, así que si un contador renombra una
 * cuenta del sistema, ese tipo de asiento muere en silencio para toda la
 * empresa. Esta columna es lo que ContabilidadService usa para bloquear
 * la edición del código y la desactivación; se marca en el seed (nueva
 * empresa) y en la migración de datos siguiente
 * (1764600000000-MarcarCuentasSistemaExistentes) para las 35 empresas que
 * ya tienen catálogo.
 *
 * NOT NULL DEFAULT false: no hace falta NOT VALID/backfill — toda fila
 * existente pasa a false automáticamente, que es el valor correcto salvo
 * para los ~17 códigos que la siguiente migración marca en true.
 */
export class AddEsCuentaSistema1764500000000 implements MigrationInterface {
  name = 'AddEsCuentaSistema1764500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_contables
        ADD COLUMN IF NOT EXISTS "esCuentaSistema" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_contables
        DROP COLUMN IF EXISTS "esCuentaSistema"
    `);
  }
}
