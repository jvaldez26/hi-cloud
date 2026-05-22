import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garantiza que la tabla audit_logs existe en producción.
 *
 * El interceptor AuditInterceptor estaba registrado globalmente pero la tabla
 * podría no existir si TypeORM synchronize estaba desactivado.
 *
 * Correcciones incluidas:
 * 1. CREATE TABLE IF NOT EXISTS audit_logs con todas las columnas
 * 2. Índices críticos para las queries del panel de Super Admin
 */
export class CreateAuditLogs1749200000000 implements MigrationInterface {
  name = 'CreateAuditLogs1749200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear el tipo ENUM si no existe
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_accion_enum') THEN
          CREATE TYPE "audit_logs_accion_enum" AS ENUM (
            'create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'error'
          );
        END IF;
      END $$;
    `);

    // Crear la tabla si no existe
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id             SERIAL PRIMARY KEY,
        "userId"       INTEGER,
        "userName"     VARCHAR(100),
        "userRole"     VARCHAR(30),
        accion         "audit_logs_accion_enum" NOT NULL,
        modulo         VARCHAR(50)  NOT NULL,
        entidad        VARCHAR(100),
        "entidadId"    VARCHAR(50),
        descripcion    VARCHAR(300) NOT NULL,
        "valorAnterior" TEXT,
        "valorNuevo"    TEXT,
        metodo         VARCHAR(8)   NOT NULL,
        ruta           VARCHAR(300) NOT NULL,
        "statusCode"   INTEGER,
        "duracionMs"   INTEGER,
        exitoso        BOOLEAN NOT NULL DEFAULT true,
        "ipAddress"    VARCHAR(50),
        "userAgent"    VARCHAR(300),
        "empresaId"    INTEGER,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Índices para las queries del panel
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId"    ON audit_logs("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_modulo"    ON audit_logs(modulo)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_empresaId" ON audit_logs("empresaId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" ON audit_logs("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_exitoso"   ON audit_logs(exitoso) WHERE exitoso = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_logs_accion_enum"`);
  }
}
