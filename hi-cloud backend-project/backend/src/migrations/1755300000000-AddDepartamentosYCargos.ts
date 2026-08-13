import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartamentosYCargos1755300000000 implements MigrationInterface {
  name = 'AddDepartamentosYCargos1755300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Crear tabla departamentos
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS departamentos (
        id         SERIAL PRIMARY KEY,
        "isActive" BOOLEAN      NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "empresaId" INTEGER     NOT NULL,
        nombre     VARCHAR(100) NOT NULL
      )
    `);

    // Crear tabla cargos
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cargos (
        id         SERIAL PRIMARY KEY,
        "isActive" BOOLEAN      NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "empresaId" INTEGER     NOT NULL,
        nombre     VARCHAR(100) NOT NULL
      )
    `);

    // Agregar FKs a empleados (nullable para no romper datos existentes)
    await queryRunner.query(`
      ALTER TABLE empleados
        ADD COLUMN IF NOT EXISTS "departamentoId" INTEGER REFERENCES departamentos(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE empleados
        ADD COLUMN IF NOT EXISTS "cargoId" INTEGER REFERENCES cargos(id) ON DELETE SET NULL
    `);

    // Poblar departamentos a partir de los valores distintos ya existentes en empleados
    await queryRunner.query(`
      INSERT INTO departamentos ("empresaId", nombre)
      SELECT DISTINCT "empresaId", departamento
      FROM   empleados
      WHERE  departamento IS NOT NULL
        AND  departamento != ''
        AND  "isActive"   = true
    `);

    // Poblar cargos a partir de los valores distintos ya existentes en empleados
    await queryRunner.query(`
      INSERT INTO cargos ("empresaId", nombre)
      SELECT DISTINCT "empresaId", cargo
      FROM   empleados
      WHERE  cargo IS NOT NULL
        AND  cargo != ''
        AND  "isActive" = true
    `);

    // Vincular empleados existentes a su departamentoId
    await queryRunner.query(`
      UPDATE empleados e
      SET    "departamentoId" = d.id
      FROM   departamentos d
      WHERE  e."empresaId"      = d."empresaId"
        AND  e.departamento     = d.nombre
        AND  e.departamento IS NOT NULL
        AND  e.departamento     != ''
        AND  e."departamentoId" IS NULL
    `);

    // Vincular empleados existentes a su cargoId
    await queryRunner.query(`
      UPDATE empleados e
      SET    "cargoId" = c.id
      FROM   cargos c
      WHERE  e."empresaId" = c."empresaId"
        AND  e.cargo       = c.nombre
        AND  e.cargo IS NOT NULL
        AND  e.cargo       != ''
        AND  e."cargoId"   IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE empleados DROP COLUMN IF EXISTS "cargoId"`);
    await queryRunner.query(`ALTER TABLE empleados DROP COLUMN IF EXISTS "departamentoId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS cargos`);
    await queryRunner.query(`DROP TABLE IF EXISTS departamentos`);
  }
}
