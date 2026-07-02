import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeSecuenciaUserIdNullable1750390000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // userId = 0 causa FK violation cuando lo carga el Super Admin (no es un users.id real).
    // Hacemos la columna nullable para que procesos de sistema puedan omitir el userId.
    // El path normal (usuario tenant) sigue guardando el userId real del ADMIN o CONTADOR.
    await qr.query(`ALTER TABLE secuencias_ecf ALTER COLUMN "userId" DROP NOT NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Antes de revertir, asegurarse de que no haya filas con userId NULL
    await qr.query(`UPDATE secuencias_ecf SET "userId" = 1 WHERE "userId" IS NULL`);
    await qr.query(`ALTER TABLE secuencias_ecf ALTER COLUMN "userId" SET NOT NULL`);
  }
}
