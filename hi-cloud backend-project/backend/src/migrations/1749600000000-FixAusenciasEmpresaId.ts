import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repara registros de ausencias y solicitudes_vacacion que fueron
 * guardados sin empresaId (era null por un bug en registrarAusencia).
 *
 * Estrategia: inferir el empresaId correcto desde la tabla empleados
 * usando el empleadoId almacenado en cada registro.
 *
 * Idempotente: solo actualiza donde empresaId IS NULL.
 */
export class FixAusenciasEmpresaId1749600000000 implements MigrationInterface {
  name = 'FixAusenciasEmpresaId1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Reparar ausencias con empresaId NULL ────────────────────────────────────
    await queryRunner.query(`
      UPDATE ausencias a
      SET    "empresaId" = e."empresaId"
      FROM   empleados e
      WHERE  a."empleadoId" = e.id
        AND  (a."empresaId" IS NULL OR a."empresaId" = 0)
    `);

    // ── Reparar solicitudes_vacacion con empresaId NULL ─────────────────────────
    // (crearSolicitud sí seteaba empresaId, pero por si acaso)
    await queryRunner.query(`
      UPDATE solicitudes_vacacion s
      SET    "empresaId" = e."empresaId"
      FROM   empleados e
      WHERE  s."empleadoId" = e.id
        AND  (s."empresaId" IS NULL OR s."empresaId" = 0)
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No hay forma segura de revertir un UPDATE sin backup — no-op
  }
}
