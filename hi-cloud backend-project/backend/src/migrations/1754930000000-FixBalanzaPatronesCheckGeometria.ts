import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige el CHECK de geometría en balanza_patrones.
 *
 * PROBLEMA
 * ─────────
 * La migración original usaba:
 *   prefijo.len + longitudPlu + longitudValor + 1 = longitudTotal
 *
 * Esto es incorrecto cuando tieneCheckValor = true porque el dígito
 * verificador INTERNO ocupa una posición SEPARADA en el código de barras:
 *
 *   [prefijo] [PLU] [valor] [check_interno?] [check_EAN]
 *   ──────── ───── ─────── ──────────────── ──────────
 *   .length    PLU   valor      0 o 1              1
 *
 * Con la fórmula original, un patrón con:
 *   prefijo='2'(1), longitudPlu=5, longitudValor=5, tieneCheckValor=true, longitudTotal=13
 * daba  1+5+5+1 = 12 ≠ 13 → RECHAZADO  ← BUG
 *
 * CORRECCIÓN
 * ───────────
 * longitudValor = dígitos de valor puros (SIN incluir el check interno).
 * tieneCheckValor = true agrega 1 posición adicional al total.
 *
 *   prefijo.len + longitudPlu + longitudValor + tieneCheckValor(0|1) + 1 = longitudTotal
 *
 * Verificación del caso anterior:  1+5+5+1+1 = 13 ✅
 * Sin check (prefijo='2', PLU=5, valor=6, total=13): 1+5+6+0+1 = 13 ✅
 */
export class FixBalanzaPatronesCheckGeometria1754930000000 implements MigrationInterface {
  name = 'FixBalanzaPatronesCheckGeometria1754930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE balanza_patrones DROP CONSTRAINT IF EXISTS "CK_bp_geometria"`);
    await queryRunner.query(`
      ALTER TABLE balanza_patrones ADD CONSTRAINT "CK_bp_geometria"
      CHECK (
        LENGTH(prefijo) + "longitudPlu" + "longitudValor" +
        (CASE WHEN "tieneCheckValor" THEN 2 ELSE 1 END) = "longitudTotal"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE balanza_patrones DROP CONSTRAINT IF EXISTS "CK_bp_geometria"`);
    // Restaurar el constraint original (incorrecto — solo para rollback de emergencia)
    await queryRunner.query(`
      ALTER TABLE balanza_patrones ADD CONSTRAINT "CK_bp_geometria"
      CHECK (LENGTH(prefijo) + "longitudPlu" + "longitudValor" + 1 = "longitudTotal")
    `);
  }
}
