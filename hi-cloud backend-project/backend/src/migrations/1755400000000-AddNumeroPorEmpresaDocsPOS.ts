import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade campo `numero` por empresa a 4 documentos POS que hoy usan el SERIAL
 * global como número visible (RET-/GAS-/RDP-/COMP-).
 *
 * Orden por tabla:
 *   1. ADD COLUMN numero (nullable)
 *   2. UPDATE — rellena el número que ya fue impreso (preserva documentos físicos)
 *   3. SET NOT NULL
 *   4. UNIQUE INDEX (empresaId, numero)
 *   5. Seed contadores_secuencia con MAX(id) por empresa
 *
 * Prefijos:
 *   RET-  retiros_caja         5 dígitos
 *   GAS-  gastos               6 dígitos  (= lo que imprime gasto-pdf.service)
 *   RDP-  pagos_cobrados       5 dígitos  (≠ REC, que usa recibos_cobro)
 *   COMP- cuotas               6 dígitos
 *
 * Nota: retenciones/retencion-pdf.service.ts también usa "RET-" + padStart(6)
 * para retenciones fiscales — distinto contexto, se arregla en migración futura
 * con prefijo "RTEN-".
 */
export class AddNumeroPorEmpresaDocsPOS1755400000000 implements MigrationInterface {
  name = 'AddNumeroPorEmpresaDocsPOS1755400000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Abortar si no puede adquirir lock en 3 s (no bloquear en prod bajo carga)
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── 1. retiros_caja ─────────────────────────────────────────────────────
    await qr.query(`ALTER TABLE retiros_caja ADD COLUMN IF NOT EXISTS numero VARCHAR(20)`);

    // Rellenar con el número que ya se imprimió (preserva recibos físicos)
    await qr.query(`
      UPDATE retiros_caja
      SET numero = 'RET-' || lpad(id::text, 5, '0')
      WHERE numero IS NULL
    `);

    await qr.query(`ALTER TABLE retiros_caja ALTER COLUMN numero SET NOT NULL`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_retiros_caja_empresa_numero"
      ON retiros_caja ("empresaId", numero)
    `);

    // Semilla: MAX(id) actual → próximo generado = MAX+1, sin colisión
    await qr.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'RET', COALESCE(MAX(id), 0)
      FROM retiros_caja
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO UPDATE
        SET ultimo_numero = GREATEST(contadores_secuencia.ultimo_numero, EXCLUDED.ultimo_numero)
    `);

    // ── 2. gastos ───────────────────────────────────────────────────────────
    await qr.query(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS numero VARCHAR(20)`);

    await qr.query(`
      UPDATE gastos
      SET numero = 'GAS-' || lpad(id::text, 6, '0')
      WHERE numero IS NULL
    `);

    await qr.query(`ALTER TABLE gastos ALTER COLUMN numero SET NOT NULL`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gastos_empresa_numero"
      ON gastos ("empresaId", numero)
    `);

    await qr.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'GAS', COALESCE(MAX(id), 0)
      FROM gastos
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO UPDATE
        SET ultimo_numero = GREATEST(contadores_secuencia.ultimo_numero, EXCLUDED.ultimo_numero)
    `);

    // ── 3. pagos_cobrados ───────────────────────────────────────────────────
    // La columna empresaId ya existe en la BD pero está NULL en todos los
    // registros porque el servicio nunca la pasaba. La rellenamos desde CxC.
    await qr.query(`
      UPDATE pagos_cobrados p
      SET "empresaId" = cxc."empresaId"
      FROM cuentas_por_cobrar cxc
      WHERE cxc.id = p."cuentaPorCobrarId"
        AND p."empresaId" IS NULL
    `);

    await qr.query(`ALTER TABLE pagos_cobrados ADD COLUMN IF NOT EXISTS numero VARCHAR(20)`);

    // Prefijo RDP- (Recibo De Pago) para no colisionar con REC de recibos_cobro.
    // Los 40 registros históricos eran generados al vuelo sin persistir; este
    // UPDATE los materializa con el mismo id que tenían para trazabilidad.
    await qr.query(`
      UPDATE pagos_cobrados
      SET numero = 'RDP-' || lpad(id::text, 5, '0')
      WHERE numero IS NULL
    `);

    await qr.query(`ALTER TABLE pagos_cobrados ALTER COLUMN numero SET NOT NULL`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pagos_cobrados_empresa_numero"
      ON pagos_cobrados ("empresaId", numero)
      WHERE "empresaId" IS NOT NULL
    `);

    await qr.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'RDP', COALESCE(MAX(id), 0)
      FROM pagos_cobrados
      WHERE "empresaId" IS NOT NULL
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO UPDATE
        SET ultimo_numero = GREATEST(contadores_secuencia.ultimo_numero, EXCLUDED.ultimo_numero)
    `);

    // ── 4. cuotas ──────────────────────────────────────────────────────────
    // cuotas no tiene empresaId — lo derivamos de planes_pago
    await qr.query(`ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS "empresaId" INTEGER`);

    await qr.query(`
      UPDATE cuotas c
      SET "empresaId" = pp."empresaId"
      FROM planes_pago pp
      WHERE pp.id = c."planPagoId"
        AND c."empresaId" IS NULL
    `);

    await qr.query(`ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS numero VARCHAR(20)`);

    await qr.query(`
      UPDATE cuotas
      SET numero = 'COMP-' || lpad(id::text, 6, '0')
      WHERE numero IS NULL
    `);

    await qr.query(`ALTER TABLE cuotas ALTER COLUMN numero SET NOT NULL`);

    // empresaId puede quedar NULL si la cuota quedó huérfana; el índice lo omite
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cuotas_empresa_numero"
      ON cuotas ("empresaId", numero)
      WHERE "empresaId" IS NOT NULL
    `);

    await qr.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT pp."empresaId", 'COMP', COALESCE(MAX(c.id), 0)
      FROM cuotas c
      JOIN planes_pago pp ON pp.id = c."planPagoId"
      GROUP BY pp."empresaId"
      ON CONFLICT ("empresaId", tipo) DO UPDATE
        SET ultimo_numero = GREATEST(contadores_secuencia.ultimo_numero, EXCLUDED.ultimo_numero)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Cuotas
    await qr.query(`DROP INDEX IF EXISTS "IDX_cuotas_empresa_numero"`);
    await qr.query(`DELETE FROM contadores_secuencia WHERE tipo = 'COMP'`);
    await qr.query(`ALTER TABLE cuotas DROP COLUMN IF EXISTS numero`);
    await qr.query(`ALTER TABLE cuotas DROP COLUMN IF EXISTS "empresaId"`);

    // Pagos cobrados
    await qr.query(`DROP INDEX IF EXISTS "IDX_pagos_cobrados_empresa_numero"`);
    await qr.query(`DELETE FROM contadores_secuencia WHERE tipo = 'RDP'`);
    await qr.query(`ALTER TABLE pagos_cobrados DROP COLUMN IF EXISTS numero`);
    // Devolver empresaId a NULL (era su estado previo)
    await qr.query(`UPDATE pagos_cobrados SET "empresaId" = NULL`);

    // Gastos
    await qr.query(`DROP INDEX IF EXISTS "IDX_gastos_empresa_numero"`);
    await qr.query(`DELETE FROM contadores_secuencia WHERE tipo = 'GAS'`);
    await qr.query(`ALTER TABLE gastos DROP COLUMN IF EXISTS numero`);

    // Retiros
    await qr.query(`DROP INDEX IF EXISTS "IDX_retiros_caja_empresa_numero"`);
    await qr.query(`DELETE FROM contadores_secuencia WHERE tipo = 'RET'`);
    await qr.query(`ALTER TABLE retiros_caja DROP COLUMN IF EXISTS numero`);
  }
}
