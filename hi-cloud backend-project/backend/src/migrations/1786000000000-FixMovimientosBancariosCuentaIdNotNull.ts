import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hallazgo mayor (2026-10-15, durante el incidente de la empresa 53):
 * `movimientos_bancarios` (la tabla real de la entidad de tesorería) tiene
 * una columna huérfana `"cuentaId" INTEGER NOT NULL` que quedó de la MISMA
 * colisión de esquema que ya se corrigió para el módulo `bancos` en
 * `1748100000000-CreateBancosConciliacion.ts` (ver el comentario de esa
 * migración: "cada insert de Bancos fallaba con PG 23502 cuentaBancariaId
 * NOT NULL"). Esa migración le dio a `bancos` su propia tabla
 * (`bancos_conciliacion`) y resolvió SU lado — pero nunca limpió la columna
 * que había quedado en `movimientos_bancarios`, la tabla de TESORERÍA.
 *
 * La entidad de tesorería (`tesoreria/entities/movimiento-bancario.entity.ts`)
 * nunca conoció esa columna y nunca la llena — así que, desde que existe,
 * CUALQUIER INSERT en `movimientos_bancarios` (depósito, retiro,
 * transferencia, o automático desde CxC/CxP/Nómina/Recibos de Cobro) ha
 * fallado con "null value in column cuentaId violates not-null constraint".
 * Confirmado: la tabla tiene 0 filas en TODA la base de producción.
 *
 * Como las dos escrituras (saldo de la cuenta + movimiento) no estaban en
 * una transacción, el saldo SÍ se actualizaba (ese INSERT nunca tocaba esta
 * columna) y el error del movimiento quedaba solo en el log del servidor —
 * exactamente el incidente de la empresa 53 (saldo subió RD$24,000 sin
 * ningún movimiento que lo explicara). Esa parte ya se corrigió
 * (registrarMovimiento ahora es atómico) — esta migración corrige la causa
 * de fondo: sin esto, la transacción atómica simplemente fallaría SIEMPRE,
 * y ningún depósito/retiro/transferencia de tesorería volvería a funcionar.
 *
 * `saldoResultante`, `sistemaId`, `sistemaTipo` son el mismo tipo de
 * columna huérfana (del módulo bancos) pero SÍ son nullable, así que nunca
 * bloquearon nada — se dejan como están por ahora (limpieza de esquema
 * aparte, no bloqueante).
 */
export class FixMovimientosBancariosCuentaIdNotNull1786000000000 implements MigrationInterface {
  name = 'FixMovimientosBancariosCuentaIdNotNull1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defensivo: esta columna huérfana solo existe en bases con el drift
    // histórico de `synchronize: true` (como producción) — una base nueva
    // creada solo a partir de migraciones nunca la tuvo.
    const rows: { existe: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movimientos_bancarios' AND column_name = 'cuentaId'
      ) AS existe
    `);
    const { existe } = rows[0];
    if (existe) {
      await queryRunner.query(`ALTER TABLE movimientos_bancarios ALTER COLUMN "cuentaId" DROP NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se revierte a NOT NULL — volvería a bloquear todos los inserts de
    // tesorería, que es exactamente el bug que esta migración corrige.
  }
}
