import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices faltantes en facturaId/notaCreditoId/notaDebitoId de las tablas de
 * detalle (2026-09-21) — encontrados al ver que el 607 se volvió lento tras
 * agregar el desglose de ITBIS por línea (declaraciones.service.ts,
 * getFormato607(), fallback de desgloseItbisFuenteVerdad). Ese fallback
 * corre una subconsulta correlacionada `WHERE fd."facturaId" = f.id` por
 * cada fila del 607 — sin índice, cada una es un seq scan completo de
 * `factura_detalles` (64k+ filas ya en el backup local, mucho más en
 * producción con todas las empresas). `nota_credito_detalles` no tenía
 * NINGÚN índice más allá de la PK.
 *
 * `CREATE INDEX CONCURRENTLY` no puede correr dentro de una transacción —
 * por eso `transaction = false` (mismo mecanismo que
 * 1763100000000-AddUsernameToUsers.ts). Son tablas con escritura constante
 * (cada factura/nota nueva inserta detalles); CONCURRENTLY evita bloquear
 * esos INSERT mientras se construye el índice.
 */
export class IndicesFacturaIdDetalles1766700000000 implements MigrationInterface {
  name = 'IndicesFacturaIdDetalles1766700000000';

  public transaction = false;

  private static readonly INDICES: { nombre: string; tabla: string; columna: string }[] = [
    { nombre: 'idx_factura_detalles_facturaId',       tabla: 'factura_detalles',       columna: '"facturaId"' },
    { nombre: 'idx_nota_credito_detalles_notaCreditoId', tabla: 'nota_credito_detalles', columna: '"notaCreditoId"' },
    { nombre: 'idx_nota_debito_detalles_notaDebitoId',   tabla: 'nota_debito_detalles',  columna: '"notaDebitoId"' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '3s'`);

    for (const { nombre, tabla, columna } of IndicesFacturaIdDetalles1766700000000.INDICES) {
      // Índice INVALID de un intento anterior fallido — dropear antes de recrear.
      const invalido = await queryRunner.query(`
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = '${nombre}' AND i.indisvalid = false
      `);
      if (invalido.length > 0) {
        await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nombre}"`);
      }
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${nombre}" ON ${tabla} (${columna})
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '3s'`);
    for (const { nombre } of IndicesFacturaIdDetalles1766700000000.INDICES) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${nombre}"`);
    }
  }
}
