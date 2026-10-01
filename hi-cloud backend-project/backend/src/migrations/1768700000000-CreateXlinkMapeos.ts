import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HiCloud Xlink — mapeos guardados por contraparte, para no volver a pedir
 * la misma homologación (producto/unidad/impuesto/término de pago/retención)
 * en cada recepción futura de esa misma empresa.
 *
 * Tenant-scoped normal (tiene `empresaId`, sin FK sobre ella — igual que el
 * resto del proyecto, lo valida el hook de pre-push): el aislamiento va por
 * TenantService/TenantSubscriber, no por constraint.
 *
 * UNIQUE(empresaId, contraparteXlinkId, tipo, valorExterno): el mismo SKU/
 * código externo de la MISMA contraparte no puede resolver a dos internos
 * distintos a la vez.
 */
export class CreateXlinkMapeos1768700000000 implements MigrationInterface {
  name = 'CreateXlinkMapeos1768700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xlink_mapeos" (
        "id"                  SERIAL PRIMARY KEY,
        -- Nullable a propósito: TenantBaseEntity.empresaId es @Column({nullable:
        -- true}) para TODA entidad tenant-scoped del sistema (ver clientes,
        -- compras, facturas, productos en producción) — NOT NULL aquí sería la
        -- única tabla distinta, sin ganar nada (siempre se asigna igual).
        "empresaId"           INTEGER,
        "contraparteXlinkId"  UUID NOT NULL,
        "tipo"                VARCHAR(20) NOT NULL,
        "valorExterno"        TEXT NOT NULL,
        "valorInternoId"      INTEGER NOT NULL,
        "isActive"            BOOLEAN NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "ck_xlink_mapeo_tipo"
          CHECK ("tipo" IN ('producto', 'unidad', 'impuesto', 'termino_pago', 'retencion')),
        CONSTRAINT "uq_xlink_mapeo"
          UNIQUE ("empresaId", "contraparteXlinkId", "tipo", "valorExterno")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_xlink_mapeo_empresa_contraparte"
        ON "xlink_mapeos" ("empresaId", "contraparteXlinkId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "xlink_mapeos"`);
  }
}
