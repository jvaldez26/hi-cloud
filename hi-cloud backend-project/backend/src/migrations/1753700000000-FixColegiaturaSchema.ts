import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixColegiaturaSchema1753700000000 implements MigrationInterface {
  name = 'FixColegiaturaSchema1753700000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── ed_planes_pago: añadir columnas para plan por estudiante ────────────
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "estudianteId" INTEGER REFERENCES ed_estudiantes(id) ON DELETE CASCADE`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "montoColegiatura" DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "montoMatricula" DECIMAL(12,2) DEFAULT 0`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS "diaCobro" INTEGER DEFAULT 5`);
    await qr.query(`ALTER TABLE ed_planes_pago ADD COLUMN IF NOT EXISTS descuento DECIMAL(6,2) DEFAULT 0`);

    // ── ed_cargos: añadir columnas simplificadas ─────────────────────────────
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS "planPagoId" INTEGER REFERENCES ed_planes_pago(id) ON DELETE SET NULL`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS monto DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS descripcion VARCHAR(200)`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS mes INTEGER`);
    await qr.query(`ALTER TABLE ed_cargos ADD COLUMN IF NOT EXISTS anio INTEGER`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_cargos_plan ON ed_cargos ("planPagoId", mes, anio)`);

    // ── ed_pagos: añadir referencia a cargo y campo simplificado ─────────────
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS "cargoId" INTEGER REFERENCES ed_cargos(id) ON DELETE SET NULL`);
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS monto DECIMAL(12,2)`);
    await qr.query(`ALTER TABLE ed_pagos ADD COLUMN IF NOT EXISTS observaciones TEXT`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_pagos_cargo ON ed_pagos ("cargoId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_ed_pagos_cargo`);
    await qr.query(`DROP INDEX IF EXISTS idx_ed_cargos_plan`);
    await qr.query(`ALTER TABLE ed_pagos DROP COLUMN IF EXISTS observaciones`);
    await qr.query(`ALTER TABLE ed_pagos DROP COLUMN IF EXISTS monto`);
    await qr.query(`ALTER TABLE ed_pagos DROP COLUMN IF EXISTS "cargoId"`);
    await qr.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS anio`);
    await qr.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS mes`);
    await qr.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS descripcion`);
    await qr.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS monto`);
    await qr.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS "planPagoId"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS descuento`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "diaCobro"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "montoMatricula"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "montoColegiatura"`);
    await qr.query(`ALTER TABLE ed_planes_pago DROP COLUMN IF EXISTS "estudianteId"`);
  }
}
