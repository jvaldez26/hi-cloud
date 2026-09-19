import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P3 Bloque 4 — marca esCuentaSistema=true en las cuentas ya existentes en
 * producción que el motor de asientos automáticos referencia por código
 * (COD.* en asientos-automaticos.service.ts). Sin esto, un contador podía
 * renombrar el código de "Caja General" o "Ventas" y el motor dejaba de
 * encontrarla — asiento omitido en silencio para toda la empresa, solo
 * visible en Sentry.
 *
 * 17 de los 20 códigos de COD.* — los 3 restantes (GANANCIA_CAMBIARIA
 * 4.1.3.01, PERDIDA_CAMBIARIA 6.1.5.01, ISR_RET_POR_PAGAR 2.1.2.04) no
 * existen en el seed en absoluto (confirmado en el diagnóstico del
 * Bloque 2 de este mismo P3) — no hay nada que marcar para ellos; ya
 * caen en la rama "cuenta no encontrada" de _crearAsientoContabilizado(),
 * un hallazgo distinto reportado sin corregir.
 *
 * No filtra por empresaId a propósito, mismo criterio que
 * 1764300000000-EtiquetarCuentasFiscalesSeed: toca las 35 empresas con
 * catálogo y las filas con empresaId NULL por igual. Idempotente —
 * correrla dos veces no cambia nada (WHERE ... = false evita el UPDATE
 * cuando ya está en true).
 */
export class MarcarCuentasSistemaExistentes1764600000000 implements MigrationInterface {
  name = 'MarcarCuentasSistemaExistentes1764600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      UPDATE cuentas_contables
      SET "esCuentaSistema" = true
      WHERE "esCuentaSistema" = false
        AND codigo IN (
          '1.1.1.02', '1.1.1.03', '1.1.2.01', '1.1.3.01', '1.1.4.01',
          '2.1.1.01', '2.1.2.01', '2.1.2.02', '2.1.2.03', '2.1.3.01', '2.1.3.02', '2.1.5.01', '2.1.6.01',
          '4.1.1.01',
          '5.1.1.01',
          '6.1.1.01', '6.1.1.02'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No reversible sin riesgo: para el momento de un rollback, alguien
    // pudo haber marcado esCuentaSistema en una cuenta custom por su cuenta
    // (no expuesto en el DTO, pero sí alcanzable por un script/soporte) —
    // un DOWN que pusiera todo en false otra vez podría desproteger cuentas
    // que ya no son solo las de este bloque. No-op intencional, mismo
    // criterio que 1764300000000-EtiquetarCuentasFiscalesSeed.
  }
}
