import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sentry #7779557844 — defensa final contra el e-CF duplicado por carrera.
 *
 * `idx_ecf_origen_unico_aceptado` (seeds/migration-ecf-mseller.sql) es un
 * índice único PARCIAL sobre (documentoOrigenTipo, documentoOrigenId) que
 * solo exige unicidad cuando estadoDGII='aceptado'. Dos peticiones
 * concurrentes que ambas insertan como 'pendiente_envio' (el estado inicial
 * de TODO e-CF nuevo) no violan ese índice — las dos pueden tener éxito,
 * cada una con su propio eNCF, antes de que cualquiera llegue a 'aceptado'.
 * El `findOne` + `INSERT` de emitir-ecf.use-case.ts (la comprobación de
 * idempotencia) tiene esa misma ventana de carrera — el candado de
 * cambiarEstado() en facturas.service.ts cierra la carrera a NIVEL FACTURA,
 * pero un segundo documento (nota de crédito/débito, compra, gasto) que
 * llame a EmitirECFUseCase.execute() concurrentemente sigue expuesto aquí.
 *
 * Esta migración reemplaza ese índice por uno que cubre TODO estado "vivo"
 * — cualquiera salvo 'rechazado' (un rechazo real libera el eNCF para un
 * reintento con número nuevo, ver emitir-ecf.use-case.ts) y solo entre filas
 * activas (isActive=true; una fila desactivada/anulada no cuenta). Verificado
 * contra producción antes de crear esto (verificar-duplicados-concurrencia-
 * emitir-pos.js, sección 4, 2026-10-07): 0 filas existentes lo violarían.
 */
export class AmpliarUnicidadEcfOrigenVivo1771000000000 implements MigrationInterface {
  name = 'AmpliarUnicidadEcfOrigenVivo1771000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`DROP INDEX IF EXISTS idx_ecf_origen_unico_aceptado`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ecf_origen_unico_vivo
      ON ecf ("documentoOrigenTipo", "documentoOrigenId")
      WHERE "estadoDGII" != 'rechazado' AND "isActive" = true
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DROP INDEX IF EXISTS idx_ecf_origen_unico_vivo`);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ecf_origen_unico_aceptado
      ON ecf ("documentoOrigenTipo", "documentoOrigenId")
      WHERE "estadoDGII" = 'aceptado'
    `);
  }
}
