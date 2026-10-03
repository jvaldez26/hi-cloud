import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extiende el ENUM ecf_estadodgii_enum con 'en_validacion_dgii'.
 *
 * Hotfix E320000001774 (Ferretería Pavel, SRL): un e-CF quedaba RECHAZADO
 * sin ningún código ni mensaje real de DGII cuando MSeller devolvía
 * status:"Error" (DGII en mantenimiento) y la consulta de respaldo tampoco
 * confirmaba nada — el código viejo forzaba RECHAZADO "para evitar bucle
 * infinito" (consultar-estado-ecf.job.ts). Ahora ese caso va a este nuevo
 * estado intermedio, reintentado automáticamente con backoff.
 *
 * ⚠ NOTAS TÉCNICAS (mismo patrón que 1754810000000-AddRechazadaToNotaCreditoEstadoEnum.ts)
 * - ALTER TYPE ... ADD VALUE es transaccionalmente seguro en PG 12+ siempre
 *   que el valor no se USE en la misma transacción — aquí solo se declara.
 * - NO es reversible: PostgreSQL no permite DROP VALUE de enums. down()
 *   queda vacío a propósito.
 */
export class AddEnValidacionDgiiToEcfEstado1769700000000 implements MigrationInterface {
  name = 'AddEnValidacionDgiiToEcfEstado1769700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(
      `ALTER TYPE "public"."ecf_estadodgii_enum" ADD VALUE IF NOT EXISTS 'en_validacion_dgii'`,
    );
  }

  public async down(): Promise<void> {
    // ⚠ NO REVERSIBLE: PostgreSQL no permite eliminar valores de un ENUM.
    // Para revertir manualmente: crear nuevo tipo sin 'en_validacion_dgii',
    // migrar los registros que lo usen, renombrar el tipo. En producción: no
    // ejecutar esta migración sin coordinar el rollback completo.
  }
}
