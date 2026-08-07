import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extiende el ENUM notas_credito_estado_enum con el valor 'rechazada'.
 *
 * Este estado se asigna cuando DGII rechaza la NC Y la secuencia fue quemada
 * (secuenciaUtilizada = true): el e-NCF ya no puede reutilizarse y el usuario
 * debe emitir una nueva NC con un número nuevo.
 *
 * Si secuenciaUtilizada = false (o null), la NC vuelve a 'borrador' —
 * ese valor ya existe y no requiere cambio en el ENUM.
 *
 * ⚠ NOTAS TÉCNICAS
 * - ALTER TYPE ... ADD VALUE es transaccionalmente seguro en PG 12+
 *   (la migración solo agrega el valor y no lo usa en la misma transacción).
 * - NO es reversible: PostgreSQL no permite DROP VALUE de enums. El down()
 *   queda vacío intencionalmente — si se necesita revertir, hay que recrear
 *   el tipo entero. No asumir que esta migración se puede hacer rollback.
 */
export class AddRechazadaToNotaCreditoEstadoEnum1754810000000 implements MigrationInterface {
  name = 'AddRechazadaToNotaCreditoEstadoEnum1754810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(
      `ALTER TYPE "public"."notas_credito_estado_enum" ADD VALUE IF NOT EXISTS 'rechazada'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠ NO REVERSIBLE: PostgreSQL no permite eliminar valores de un ENUM.
    // Para revertir manualmente: crear nuevo tipo sin 'rechazada', migrar los
    // registros que lo usen (no deberían existir en down()), renombrar el tipo.
    // En producción: no ejecutar esta migración sin coordinar el rollback completo.
  }
}
