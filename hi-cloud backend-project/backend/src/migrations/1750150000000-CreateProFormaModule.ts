import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProFormaModule1750150000000 implements MigrationInterface {
  name = 'CreateProFormaModule1750150000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pro_formas_estado_enum') THEN
          CREATE TYPE pro_formas_estado_enum AS ENUM ('ACTIVA', 'VENCIDA');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pro_formas (
        id            SERIAL PRIMARY KEY,
        "empresaId"   INTEGER NOT NULL,
        numero        VARCHAR(20) NOT NULL,
        "clienteId"   INTEGER,
        "sucursalId"  INTEGER,
        "vendedorId"  INTEGER,
        subtotal      DECIMAL(15,2) NOT NULL DEFAULT 0,
        itbis         DECIMAL(15,2) NOT NULL DEFAULT 0,
        total         DECIMAL(15,2) NOT NULL DEFAULT 0,
        notas         TEXT,
        "validezDias" INTEGER NOT NULL DEFAULT 30,
        estado        pro_formas_estado_enum NOT NULL DEFAULT 'ACTIVA',
        "fechaEmision"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "fechaVencimiento" TIMESTAMP,
        "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pro_formas_empresa ON pro_formas ("empresaId", "isActive");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pro_formas_estado ON pro_formas ("empresaId", estado);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pro_forma_items (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "proFormaId"    INTEGER NOT NULL REFERENCES pro_formas(id) ON DELETE CASCADE,
        "productoId"    INTEGER,
        descripcion     VARCHAR(255) NOT NULL,
        cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
        precio          DECIMAL(15,2) NOT NULL DEFAULT 0,
        "porcentajeItbis" DECIMAL(5,2) NOT NULL DEFAULT 18,
        itbis           DECIMAL(15,2) NOT NULL DEFAULT 0,
        subtotal        DECIMAL(15,2) NOT NULL DEFAULT 0,
        "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pro_forma_items_pf ON pro_forma_items ("proFormaId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pro_forma_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS pro_formas`);
    await queryRunner.query(`DROP TYPE IF EXISTS pro_formas_estado_enum`);
  }
}
