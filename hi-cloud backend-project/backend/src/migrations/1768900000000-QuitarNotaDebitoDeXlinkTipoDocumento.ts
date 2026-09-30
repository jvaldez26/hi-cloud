import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige 1768600000000-CreateXlinkDocumentos.ts: esa migración incluyó
 * 'nota_debito' en el CHECK de tipoDocumento por error. Nota de Débito de
 * proveedor queda FUERA del MVP a propósito — no existe la entidad "ND de
 * proveedor" (lado compras) en el sistema — así que este valor nunca debe
 * ser un tipoDocumento válido en xlink_documentos.
 *
 * No hay filas con 'nota_debito' que migrar (la función de publicar nunca
 * llegó a producción con esta columna permitiéndolo fuera de esta misma
 * sesión de desarrollo).
 */
export class QuitarNotaDebitoDeXlinkTipoDocumento1768900000000 implements MigrationInterface {
  name = 'QuitarNotaDebitoDeXlinkTipoDocumento1768900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos" DROP CONSTRAINT IF EXISTS "ck_xlink_doc_tipo"
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos"
        ADD CONSTRAINT "ck_xlink_doc_tipo"
        CHECK ("tipoDocumento" IN ('factura_credito', 'nota_credito', 'orden_compra'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos" DROP CONSTRAINT IF EXISTS "ck_xlink_doc_tipo"
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos"
        ADD CONSTRAINT "ck_xlink_doc_tipo"
        CHECK ("tipoDocumento" IN ('factura_credito', 'nota_credito', 'nota_debito', 'orden_compra'))
    `);
  }
}
