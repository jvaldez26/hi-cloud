import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEsInformalToProveedores1749950000000 implements MigrationInterface {
  name = 'AddEsInformalToProveedores1749950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE proveedores
        ADD COLUMN IF NOT EXISTS "esInformal" BOOLEAN DEFAULT false
    `);

    // PASO 6: Loggear e-CFs tipo E31 vinculados a compras (colisión de IDs)
    const incorrectos = await queryRunner.query(`
      SELECT ecf.numero, ecf."documentoOrigenId", t.codigo AS tipo
      FROM ecf
      JOIN tipo_ecf t ON t.id = ecf."tipoECFId"
      WHERE ecf."documentoOrigenTipo" = 'COMPRA'
        AND t.codigo NOT IN ('E41', 'E47')
        AND ecf."isActive" = true
    `);
    if (incorrectos.length > 0) {
      console.warn(
        `[MigraciónECF] ⚠️  ${incorrectos.length} e-CF(s) con tipo incorrecto vinculados a compras:`,
        incorrectos.map((r: any) => `${r.tipo} ${r.numero} (compra #${r.documentoOrigenId})`).join(', '),
        '— Requieren revisión manual en el panel DGII.',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE proveedores DROP COLUMN IF EXISTS "esInformal"
    `);
  }
}
