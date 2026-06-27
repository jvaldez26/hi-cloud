import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddViajeGastos1750340000000 implements MigrationInterface {
  name = 'AddViajeGastos1750340000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_viaje_gastos (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        "viajeId"    INTEGER NOT NULL REFERENCES tr_viajes(id) ON DELETE CASCADE,
        descripcion  VARCHAR(500) NOT NULL,
        monto        DECIMAL(10,2) NOT NULL DEFAULT 0,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_viaje_gastos_viaje ON tr_viaje_gastos("viajeId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS tr_viaje_gastos`);
  }
}
