import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciliación de ed_pagos — mismo espíritu que FixColegiaturaSchema con
 * ed_cargos, pero para pagos. Diagnóstico completo en el commit.
 *
 * - cargosAfectados (JSONB, nunca escrito) y cargoId (siempre UN cargo, el
 *   diseño real hoy) se reemplazan por ed_pagos_detalle: un pago puede
 *   cubrir varios cargos, consultable con un JOIN normal — no un JSONB que
 *   nadie puede reportar.
 * - monto (duplicado de montoPagado, nunca reconciliado — el dashboard leía
 *   montoPagado, colegiatura.service.ts y reportes leían monto, y solo
 *   coincidían porque nunca se tocaban por separado) se elimina; montoPagado
 *   (la columna NOT NULL original) queda como única fuente.
 * - notas (nunca escrito, duplicado de observaciones) se elimina.
 * - facturaId/reciboId (huérfanas — educativo no tiene integración con
 *   facturación ni existe una tabla "recibos") se eliminan.
 * - numero/tutorId se mantienen reservados sin uso, igual que
 *   ed_cargos.numero (documentado, no bloquea nada).
 * - estado/motivoAnulacion/anuladoPor/anuladoEn: soporte para anular un
 *   pago sin borrarlo — devuelve el saldo a los cargos afectados, el
 *   registro queda como historial.
 *
 * Cero filas en producción (confirmado) — migración limpia, sin backfill.
 */
export class ReconciliarEdPagos1763800000000 implements MigrationInterface {
  name = 'ReconciliarEdPagos1763800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ed_pagos_detalle (
        id          SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "pagoId"    INTEGER NOT NULL REFERENCES ed_pagos(id) ON DELETE CASCADE,
        "cargoId"   INTEGER NOT NULL REFERENCES ed_cargos(id) ON DELETE RESTRICT,
        monto       DECIMAL(12,2) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ed_pagos_detalle_pago  ON ed_pagos_detalle ("pagoId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ed_pagos_detalle_cargo ON ed_pagos_detalle ("cargoId")`);

    await queryRunner.query(`
      ALTER TABLE ed_pagos
        ADD COLUMN IF NOT EXISTS estado           VARCHAR(20) NOT NULL DEFAULT 'activo',
        ADD COLUMN IF NOT EXISTS "motivoAnulacion" TEXT,
        ADD COLUMN IF NOT EXISTS "anuladoPor"      INTEGER,
        ADD COLUMN IF NOT EXISTS "anuladoEn"       TIMESTAMP
    `);

    // Constraints y columnas huérfanas/duplicadas — soltar el FK antes que
    // la columna que referencia.
    await queryRunner.query(`ALTER TABLE ed_pagos DROP CONSTRAINT IF EXISTS fk_ed_pagos_cargo`);
    await queryRunner.query(`ALTER TABLE ed_pagos DROP CONSTRAINT IF EXISTS "ed_pagos_facturaId_fkey"`);
    await queryRunner.query(`
      ALTER TABLE ed_pagos
        DROP COLUMN IF EXISTS "cargoId",
        DROP COLUMN IF EXISTS "cargosAfectados",
        DROP COLUMN IF EXISTS monto,
        DROP COLUMN IF EXISTS notas,
        DROP COLUMN IF EXISTS "facturaId",
        DROP COLUMN IF EXISTS "reciboId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE ed_pagos
        ADD COLUMN IF NOT EXISTS "cargoId"         INTEGER,
        ADD COLUMN IF NOT EXISTS "cargosAfectados"  JSONB,
        ADD COLUMN IF NOT EXISTS monto              DECIMAL(12,2),
        ADD COLUMN IF NOT EXISTS notas               TEXT,
        ADD COLUMN IF NOT EXISTS "facturaId"        INTEGER,
        ADD COLUMN IF NOT EXISTS "reciboId"         INTEGER
    `);
    await queryRunner.query(`
      ALTER TABLE ed_pagos
        ADD CONSTRAINT fk_ed_pagos_cargo FOREIGN KEY ("cargoId") REFERENCES ed_cargos(id) ON DELETE SET NULL NOT VALID
    `);
    await queryRunner.query(`ALTER TABLE ed_pagos VALIDATE CONSTRAINT fk_ed_pagos_cargo`);
    await queryRunner.query(`
      ALTER TABLE ed_pagos
        ADD CONSTRAINT "ed_pagos_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES facturas(id) ON DELETE SET NULL NOT VALID
    `);
    await queryRunner.query(`ALTER TABLE ed_pagos VALIDATE CONSTRAINT "ed_pagos_facturaId_fkey"`);

    await queryRunner.query(`
      ALTER TABLE ed_pagos
        DROP COLUMN IF EXISTS estado,
        DROP COLUMN IF EXISTS "motivoAnulacion",
        DROP COLUMN IF EXISTS "anuladoPor",
        DROP COLUMN IF EXISTS "anuladoEn"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ed_pagos_detalle_pago`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ed_pagos_detalle_cargo`);
    await queryRunner.query(`DROP TABLE IF EXISTS ed_pagos_detalle`);
  }
}
