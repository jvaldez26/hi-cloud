import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpticaInventario1750011100000 implements MigrationInterface {
  name = 'AddOpticaInventario1750011100000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS op_inventario (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        tipo            VARCHAR(20)  NOT NULL DEFAULT 'montura',
        codigo          VARCHAR(50),
        marca           VARCHAR(100),
        modelo          VARCHAR(100),
        color           VARCHAR(50),
        material        VARCHAR(50),
        genero          VARCHAR(20),
        precio          DECIMAL(10,2) NOT NULL DEFAULT 0,
        costo           DECIMAL(10,2) NOT NULL DEFAULT 0,
        "stockActual"   INTEGER NOT NULL DEFAULT 0,
        "stockMinimo"   INTEGER NOT NULL DEFAULT 5,
        descripcion     TEXT,
        activo          BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_op_inventario_empresa
        ON op_inventario("empresaId")
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_op_inventario_tipo
        ON op_inventario("empresaId", tipo)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS op_inventario`);
  }
}
