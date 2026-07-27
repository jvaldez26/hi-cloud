import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixColegiaturaSchema1753700000000 implements MigrationInterface {
  name = 'FixColegiaturaSchema1753700000000';

  async up(qr: QueryRunner): Promise<void> {
    // Lock timeout a nivel de transacción — se revierte al COMMIT (seguro para el pool)
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── ed_planes_pago: 5 columnas para plan por estudiante ──────────────────
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "estudianteId"    INTEGER`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "montoColegiatura" DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "montoMatricula"  DECIMAL(12,2) DEFAULT 0`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "diaCobro"        INTEGER DEFAULT 5`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS descuento         DECIMAL(6,2) DEFAULT 0`);

    // FK en sentencia separada — evita escalada de lock que ADD COLUMN + REFERENCES provoca en una sola
    await qr.query(`
      ALTER TABLE ed_planes_pago
        ADD CONSTRAINT fk_ed_planes_pago_estudiante
        FOREIGN KEY ("estudianteId") REFERENCES ed_estudiantes(id) ON DELETE CASCADE
        NOT VALID`);
    await qr.query(`ALTER TABLE ed_planes_pago VALIDATE CONSTRAINT fk_ed_planes_pago_estudiante`);

    // ── ed_cargos: 5 columnas simplificadas ─────────────────────────────────
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS "planPagoId"  INTEGER`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS monto         DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS descripcion   VARCHAR(200)`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS mes           INTEGER`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS anio          INTEGER`);

    await qr.query(`
      ALTER TABLE ed_cargos
        ADD CONSTRAINT fk_ed_cargos_plan_pago
        FOREIGN KEY ("planPagoId") REFERENCES ed_planes_pago(id) ON DELETE SET NULL
        NOT VALID`);
    await qr.query(`ALTER TABLE ed_cargos VALIDATE CONSTRAINT fk_ed_cargos_plan_pago`);

    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_cargos_plan ON ed_cargos ("planPagoId", mes, anio)`);

    // ── ed_pagos: 3 columnas simplificadas ───────────────────────────────────
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS "cargoId"     INTEGER`);
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS monto         DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS observaciones TEXT`);

    await qr.query(`
      ALTER TABLE ed_pagos
        ADD CONSTRAINT fk_ed_pagos_cargo
        FOREIGN KEY ("cargoId") REFERENCES ed_cargos(id) ON DELETE SET NULL
        NOT VALID`);
    await qr.query(`ALTER TABLE ed_pagos VALIDATE CONSTRAINT fk_ed_pagos_cargo`);

    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_pagos_cargo ON ed_pagos ("cargoId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // Soltar constraints FK antes que las columnas que referencian
    await qr.query(`ALTER TABLE ed_pagos      DROP CONSTRAINT IF EXISTS fk_ed_pagos_cargo`);
    await qr.query(`ALTER TABLE ed_cargos     DROP CONSTRAINT IF EXISTS fk_ed_cargos_plan_pago`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP CONSTRAINT IF EXISTS fk_ed_planes_pago_estudiante`);

    await qr.query(`DROP INDEX IF EXISTS idx_ed_pagos_cargo`);
    await qr.query(`DROP INDEX IF EXISTS idx_ed_cargos_plan`);

    await qr.query(`ALTER TABLE ed_pagos       DROP COLUMN IF EXISTS observaciones`);
    await qr.query(`ALTER TABLE ed_pagos       DROP COLUMN IF EXISTS monto`);
    await qr.query(`ALTER TABLE ed_pagos       DROP COLUMN IF EXISTS "cargoId"`);

    await qr.query(`ALTER TABLE ed_cargos      DROP COLUMN IF EXISTS anio`);
    await qr.query(`ALTER TABLE ed_cargos      DROP COLUMN IF EXISTS mes`);
    await qr.query(`ALTER TABLE ed_cargos      DROP COLUMN IF EXISTS descripcion`);
    await qr.query(`ALTER TABLE ed_cargos      DROP COLUMN IF EXISTS monto`);
    await qr.query(`ALTER TABLE ed_cargos      DROP COLUMN IF EXISTS "planPagoId"`);

    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS descuento`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "diaCobro"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "montoMatricula"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "montoColegiatura"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "estudianteId"`);
  }
}
