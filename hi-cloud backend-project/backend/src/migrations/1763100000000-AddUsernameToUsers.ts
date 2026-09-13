import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Login por username — alias de acceso opcional, nullable, único
 * GLOBALMENTE (no por empresa) y case-insensitive. NO genera username para
 * nadie: todos los usuarios existentes siguen entrando por correo sin
 * ningún cambio en su cuenta.
 *
 * `CREATE UNIQUE INDEX CONCURRENTLY` no puede correr dentro de una
 * transacción — por eso `public transaction = false`, que le dice al
 * MigrationExecutor de TypeORM que no envuelva esta migración en BEGIN/COMMIT
 * (confirmado contra el runner: con `runMigrations({ transaction: 'each' })`,
 * que es como corre el deploy, una migración con `transaction = false` no
 * abre transacción — mismo mecanismo que ya usa
 * 1755620000000-AddImportacionEnum.ts para ALTER TYPE ADD VALUE).
 *
 * Como no hay transacción, `SET LOCAL lock_timeout` no aplica (solo tiene
 * efecto dentro de un bloque de transacción) — se usa `SET lock_timeout`
 * a secas, que rige el resto de esta sesión/conexión.
 *
 * ── Índice CONCURRENTLY fallido a medias ─────────────────────────────────
 * Si el CREATE falla a mitad de camino (timeout, deploy abortado, conexión
 * caída), Postgres NO hace rollback — no hay transacción que revertir — y
 * deja el índice en estado `indisvalid = true`: existe, pero no impone
 * unicidad y ninguna query lo usa. Un reintento con `IF NOT EXISTS` lo
 * encuentra, lo da por "ya existe" y lo salta — quedarías sin unicidad real
 * y sin ningún error que lo delate.
 *
 * Por eso, antes de crear el índice, se verifica en pg_index si ya existe
 * uno con ese nombre e `indisvalid = true`; si lo hay, se dropea primero
 * (DROP INDEX CONCURRENTLY, también fuera de transacción) para que el
 * CREATE que sigue lo reconstruya limpio.
 *
 * Si esto vuelve a pasar en un futuro despliegue: revisa los logs de
 * `runMigrations` para confirmar en qué statement falló. Este `up()` es
 * idempotente y reintentable tal cual — no hace falta limpieza manual más
 * allá de volver a correr las migraciones.
 */
export class AddUsernameToUsers1763100000000 implements MigrationInterface {
  name = 'AddUsernameToUsers1763100000000';

  public transaction = false;

  private static readonly INDEX_NAME = 'UQ_users_username_lower';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30) NULL
    `);

    // Índice INVALID de un intento anterior fallido — dropear antes de recrear.
    const invalido = await queryRunner.query(`
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = '${AddUsernameToUsers1763100000000.INDEX_NAME}'
        AND i.indisvalid = false
    `);
    if (invalido.length > 0) {
      await queryRunner.query(`
        DROP INDEX CONCURRENTLY IF EXISTS "${AddUsernameToUsers1763100000000.INDEX_NAME}"
      `);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${AddUsernameToUsers1763100000000.INDEX_NAME}"
      ON users (LOWER(username))
      WHERE username IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '3s'`);
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "${AddUsernameToUsers1763100000000.INDEX_NAME}"
    `);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS username`);
  }
}
