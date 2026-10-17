import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de categorías de producto — reemplaza `productos.categoria`
 * (texto libre, sin diccionario) por un catálogo real por empresa.
 *
 * `productos.categoria` NO se toca ni se elimina aquí a propósito: queda de
 * solo lectura (ver producto.entity.ts) hasta que la migración de DATOS
 * (script aparte, fuera del repo — ver hicloud-secrets/dry-run-categorias-
 * productos.js y aplicar-categorias-productos.js) confirme que todo
 * producto quedó bien asignado a `categoriaId`. Se elimina en OTRA
 * migración después, nunca en la misma que crea el catálogo.
 *
 * Sin FK de `empresaId` a la tabla `empresa` — convención del proyecto
 * (aislamiento de tenant resuelto en la capa de aplicación, ver
 * scripts/security-check.sh CHECK 10).
 *
 * `categoriaPadreId` (self-FK, nullable): un solo nivel de subcategorías —
 * el formulario del catálogo no deja elegir como padre una categoría que ya
 * tiene padre (ver categorias-producto.service.ts::validarPadre), así que
 * no hace falta impedir ciclos a nivel de BD.
 */
export class CategoriasProductos1790000000000 implements MigrationInterface {
  name = 'CategoriasProductos1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categorias_productos" (
        "id"               SERIAL PRIMARY KEY,
        "empresaId"        INTEGER NOT NULL,
        "nombre"           VARCHAR(100) NOT NULL,
        "descripcion"      TEXT NULL,
        "categoriaPadreId" INTEGER NULL,
        "isActive"         BOOLEAN NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categorias_productos_empresa"
        ON "categorias_productos" ("empresaId", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categorias_productos_padre"
        ON "categorias_productos" ("categoriaPadreId")
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "categorias_productos"
        ADD CONSTRAINT "fk_categorias_productos_padre"
        FOREIGN KEY ("categoriaPadreId") REFERENCES "categorias_productos"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "categoriaId" INTEGER NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_productos_categoria"
        ON "productos" ("categoriaId")
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "productos"
        ADD CONSTRAINT "fk_productos_categoria"
        FOREIGN KEY ("categoriaId") REFERENCES "categorias_productos"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT IF EXISTS "fk_productos_categoria"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_productos_categoria"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN IF EXISTS "categoriaId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categorias_productos"`);
  }
}
