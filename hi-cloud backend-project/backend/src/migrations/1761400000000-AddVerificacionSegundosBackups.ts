import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuanto tardo la verificacion de un respaldo, en segundos.
 *
 * El script ya medía la duracion y la mandaba dentro del mensaje, pero el
 * backend descartaba el mensaje entero cuando la verificacion salia BIEN. Es
 * decir: el dato existia y se tiraba justo en el caso util.
 *
 * Lo que avisa de que algo se esta degradando no es el primer fallo — es que la
 * verificacion empiece a tardar el doble semanas antes de fallar. Sin la serie
 * historica eso no se puede ver.
 *
 * Columna en camelCase y entrecomillada: esta base no usa NamingStrategy, las
 * entidades mapean a camelCase tal cual. Con snake_case el backend arranca y
 * revienta al primer SELECT con "la columna no existe".
 *
 * Solo AÑADE una columna. No recalcula ni modifica nada existente.
 */
export class AddVerificacionSegundosBackups1761400000000 implements MigrationInterface {
  name = 'AddVerificacionSegundosBackups1761400000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        ADD COLUMN IF NOT EXISTS "verificacionSegundos" INTEGER NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE backup_registros
        DROP COLUMN IF EXISTS "verificacionSegundos"
    `);
  }
}
