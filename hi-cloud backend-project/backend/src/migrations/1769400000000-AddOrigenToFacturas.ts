import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Origen polimórfico genérico de una factura (p. ej. 'car_wash_turno' + el id
 * del turno) — no existía ningún campo así en Factura. Permite que un módulo
 * externo (Car Wash, y cualquier otro en el futuro) cobre por el POS normal
 * sin reinventar su propia facturación, y evita cobrar dos veces el mismo
 * origen vía el índice único parcial (ignora facturas canceladas: una NC o
 * anulación debe poder volver a cobrarse).
 */
export class AddOrigenToFacturas1769400000000 implements MigrationInterface {
  name = 'AddOrigenToFacturas1769400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "origenTipo" VARCHAR(30)
    `);
    await queryRunner.query(`
      ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "origenId" INTEGER
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_facturas_origen_activo"
        ON facturas ("empresaId", "origenTipo", "origenId")
        WHERE "origenTipo" IS NOT NULL AND estado <> 'cancelada'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_facturas_origen_activo"`);
    await queryRunner.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "origenId"`);
    await queryRunner.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "origenTipo"`);
  }
}
