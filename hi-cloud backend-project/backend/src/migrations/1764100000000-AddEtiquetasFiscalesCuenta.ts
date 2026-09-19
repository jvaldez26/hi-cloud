import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 del catálogo fiscal dominicano (606 vs IR-2, ver material de
 * capacitación del Lic. Wilton Andrés Pérez) — etiquetas fiscales sobre
 * `cuentas_contables`. No renumera ni siembra nada del catálogo existente,
 * solo agrega columnas nullable.
 *
 * - "tipoGasto606": uno de los 11 códigos del Formato 606 ('01' a '11',
 *   ver TIPOS_BIENES_606 en declaraciones/dgii.constants.ts). Solo aplica
 *   a cuentas de gasto o costo (validado en ContabilidadService).
 * - "anexoIR2": a qué anexo del IR-2 aporta esta cuenta — 'A1' (Balance),
 *   'B1' (Estado de Resultados) o 'D' (Costo de Venta).
 * - "casillaIR2": la línea del anexo (texto libre, ej. '6.1', '9.1').
 * - "requiereNCF": si el gasto necesita comprobante fiscal para ser
 *   deducible. La clave del cruce 606↔IR-2: un gasto sin NCF nunca
 *   aparece en el 606 pero sí en el IR-2 (nómina/TSS, pensiones, seguro
 *   familiar de salud, riesgo laboral, INFOTEP, depreciación, destrucción
 *   de inventario autorizada por DGII van SIN NCF; todo lo demás CON NCF).
 */
export class AddEtiquetasFiscalesCuenta1764100000000 implements MigrationInterface {
  name = 'AddEtiquetasFiscalesCuenta1764100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_contables
        ADD COLUMN IF NOT EXISTS "tipoGasto606" VARCHAR(2),
        ADD COLUMN IF NOT EXISTS "anexoIR2"     VARCHAR(2),
        ADD COLUMN IF NOT EXISTS "casillaIR2"   VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "requiereNCF"  BOOLEAN
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE cuentas_contables
        DROP COLUMN IF EXISTS "tipoGasto606",
        DROP COLUMN IF EXISTS "anexoIR2",
        DROP COLUMN IF EXISTS "casillaIR2",
        DROP COLUMN IF EXISTS "requiereNCF"
    `);
  }
}
