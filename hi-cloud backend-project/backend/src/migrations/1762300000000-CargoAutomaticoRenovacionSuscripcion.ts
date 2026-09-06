import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cargo automático al vencer un ciclo de suscripción — nace de un panel de
 * cobros que mentía: 13 empresas vencidas hoy, ninguna con un cargo generado
 * para el ciclo nuevo, 9 mostrando "a favor" en vez de deuda (el crédito del
 * último pago, sin nada que lo compense). RD$70,100 que Jean no veía en su
 * propio panel. Causa raíz: el único cargo automático que existe es el de
 * excedente de e-CF — nunca hubo uno para la renovación de la suscripción
 * misma, así que el "saldo" del panel solo refleja lo que alguien tecleó a
 * mano.
 *
 * ── `configuracion_cobros."cargoAutomaticoSuscripcionDesde"` ────────────────
 * Fecha de corte, FIJA y escrita — no calculada en tiempo de ejecución. Un
 * redeploy o un rollback no debe poder moverla: si se calculara al desplegar,
 * ambos volverían a poner "hoy" y el cron generaría de golpe los cargos
 * retroactivos de las 13 que ya estaban vencidas antes de este cambio, que es
 * justo lo que no se puede hacer sin que Jean lo apruebe. Se siembra UNA vez
 * con la fecha real del día de este despliegue; querer cambiarla después es
 * una decisión aparte, no un efecto de tocar código.
 *
 * NULL hasta sembrarla = SIN CONFIGURAR: mismo criterio que
 * `precioEcfExcedente = 0` en esta misma tabla. El cron que lea esta columna
 * debe no hacer nada mientras sea NULL, nunca asumir "desde siempre".
 *
 * Vive en `configuracion_cobros` y no en `configuraciones_sistema` por el
 * mismo motivo que ya está escrito en `configuracion-cobros.entity.ts`: aquel
 * PATCH está abierto a `UserRole.ADMIN` (el admin de cualquier empresa
 * cliente) sobre una tabla sin `empresaId`.
 *
 * ── `suscripciones."motivoCancelacion"/"canceladaEn"/"canceladaPor"` ────────
 * `SuscripcionEstado.CANCELADA` ya existía en el enum de TypeScript, pero no
 * había ni un solo sitio en el backend que lo usara — cancelar una suscripción
 * no era posible. Hace falta para el tope de "suspendida sigue devengando
 * hasta que se cancele": sin un camino para cancelar, una empresa cortada
 * ocho meses acumularía ocho cargos sin que nadie tenga forma de detenerlo.
 * `motivoCancelacion` NOT NULL a nivel de aplicación (se exige en el
 * servicio, no aquí, porque las filas existentes no tienen valor que darle).
 * `canceladaPor` sale del CLS (`@GetUser`), nunca del body — mismo criterio
 * que `confirmadoPor`/`registradoPor` en `pagos_suscripcion`.
 *
 * ── Índice único en `pagos_suscripcion` ─────────────────────────────────────
 * Un ciclo no puede generar dos cargos. Mismo principio que el índice único
 * de `ecf_consumo_ciclo (empresaId, cicloInicio)` (`1761800000000-CrearCuotaEcf`),
 * pero sin tabla nueva: `pagos_suscripcion` ya tiene `periodoInicio`/`periodoFin`
 * — los usan los pagos normales; el único CARGO que existe hoy (id=7, un cargo
 * manual de contabilidad ajeno a esto) los dejó en NULL, así que no hay nada
 * que migrar. Parcial (`WHERE tipo = 'CARGO'`) porque los pagos normales SÍ
 * pueden repetir período si alguien paga dos veces por error — ese caso no es
 * el que este índice existe para impedir.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy.
 */
export class CargoAutomaticoRenovacionSuscripcion1762300000000 implements MigrationInterface {
  name = 'CargoAutomaticoRenovacionSuscripcion1762300000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── configuracion_cobros: fecha de corte ──────────────────────────────
    await qr.query(`
      INSERT INTO "configuracion_cobros" (id, "precioEcfExcedente")
      VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING
    `);
    await qr.query(`
      ALTER TABLE "configuracion_cobros"
        ADD COLUMN IF NOT EXISTS "cargoAutomaticoSuscripcionDesde" DATE NULL
    `);
    // Solo si está vacía: una corrida repetida de esta migración (o un
    // entorno donde ya se sembró a mano) no debe moverla.
    await qr.query(`
      UPDATE "configuracion_cobros"
         SET "cargoAutomaticoSuscripcionDesde" = CURRENT_DATE
       WHERE id = 1 AND "cargoAutomaticoSuscripcionDesde" IS NULL
    `);

    // ── suscripciones: rastro de cancelación ──────────────────────────────
    await qr.query(`
      ALTER TABLE "suscripciones"
        ADD COLUMN IF NOT EXISTS "motivoCancelacion" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "canceladaEn" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "canceladaPor" INT NULL
    `);

    // ── pagos_suscripcion: un ciclo, un cargo ─────────────────────────────
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pagos_suscripcion_cargo_periodo"
        ON "pagos_suscripcion" ("empresaId", "periodoInicio")
        WHERE "tipo" = 'CARGO'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_pagos_suscripcion_cargo_periodo"`);
    await qr.query(`
      ALTER TABLE "suscripciones"
        DROP COLUMN IF EXISTS "motivoCancelacion",
        DROP COLUMN IF EXISTS "canceladaEn",
        DROP COLUMN IF EXISTS "canceladaPor"
    `);
    await qr.query(`
      ALTER TABLE "configuracion_cobros"
        DROP COLUMN IF EXISTS "cargoAutomaticoSuscripcionDesde"
    `);
  }
}
