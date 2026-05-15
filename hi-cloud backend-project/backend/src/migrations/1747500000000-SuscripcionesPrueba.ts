import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Reestructuración del sistema de planes y suscripciones.
 *
 * Cambios:
 *   1. Añade 'prueba' al enum suscripciones_estado_enum
 *   2. Añade columnas: fechaFinPrueba, recordatorio5dEnviado, recordatorio1dEnviado, planElegidoEnRegistro
 *   3. Migra suscripciones TRIAL/VENCIDA a PRUEBA o EMPRENDEDOR
 *   4. Actualiza límite de usuarios en plan_configuracion
 */
export class SuscripcionesPrueba1747500000000 implements MigrationInterface {
  name = 'SuscripcionesPrueba1747500000000';
  /**
   * PostgreSQL no permite usar un enum value recién añadido en la misma
   * transacción que el ALTER TYPE ADD VALUE. Con transaction=false la migración
   * corre sin tx envolvente: el ADD VALUE se commitea de inmediato y el UPDATE
   * siguiente puede usarlo sin el error "unsafe use of new value".
   */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Añadir 'prueba' al enum de estado ──────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'suscripciones_estado_enum' AND e.enumlabel = 'prueba'
        ) THEN
          ALTER TYPE suscripciones_estado_enum ADD VALUE 'prueba';
        END IF;
      END $$;
    `);

    // ── 2. Añadir nuevas columnas ─────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE suscripciones
        ADD COLUMN IF NOT EXISTS "fechaFinPrueba"            DATE          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "recordatorio5dEnviado"     BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "recordatorio1dEnviado"     BOOLEAN       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "planElegidoEnRegistro"     VARCHAR(20)   DEFAULT NULL;
    `);

    // ── 3. Migrar suscripciones con plan TRIAL ────────────────────────────────
    // Las que estaban ACTIVA con plan trial → PRUEBA con fecha_fin_prueba = hoy + 15 días
    await queryRunner.query(`
      UPDATE suscripciones
         SET estado           = 'prueba',
             "fechaFinPrueba" = CURRENT_DATE + INTERVAL '15 days',
             plan             = 'emprendedor'
       WHERE plan  = 'trial'
         AND estado = 'activa';
    `);

    // Las que estaban VENCIDA con plan trial → SUSPENDIDA (ya vencieron)
    await queryRunner.query(`
      UPDATE suscripciones
         SET estado            = 'suspendida',
             "motivoSuspension" = 'PRUEBA_VENCIDA',
             plan               = 'emprendedor'
       WHERE plan  = 'trial'
         AND estado IN ('vencida', 'suspendida');
    `);

    // ── 4. Actualizar plan_configuracion — solo 4 planes activos ─────────────
    // Upsert: asegurar que los 4 planes tienen los precios y límites correctos
    await queryRunner.query(`
      INSERT INTO plan_configuracion (clave, nombre, precio, descripcion, activo)
      VALUES
        ('emprendedor', 'Emprendedor', 1696.50, 'Hasta RD$125,000 ingresos/mes, 2 usuarios', true),
        ('pyme',        'Pyme',        3451.50, 'Hasta RD$500,000 ingresos/mes, 3 usuarios', true),
        ('pro',         'Pro',         5206.50, 'Hasta RD$1,250,000 ingresos/mes, 4 usuarios', true),
        ('plus',        'Plus',        7548.50, 'Hasta RD$6,250,000 ingresos/mes, 10 usuarios', true)
      ON CONFLICT (clave) DO UPDATE
        SET nombre      = EXCLUDED.nombre,
            precio      = EXCLUDED.precio,
            descripcion = EXCLUDED.descripcion,
            activo      = true;
    `);

    // Desactivar planes legado en el catálogo
    await queryRunner.query(`
      UPDATE plan_configuracion
         SET activo = false
       WHERE clave IN ('trial', 'basico', 'profesional', 'empresarial', 'enterprise');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir columnas añadidas
    await queryRunner.query(`
      ALTER TABLE suscripciones
        DROP COLUMN IF EXISTS "fechaFinPrueba",
        DROP COLUMN IF EXISTS "recordatorio5dEnviado",
        DROP COLUMN IF EXISTS "recordatorio1dEnviado",
        DROP COLUMN IF EXISTS "planElegidoEnRegistro";
    `);
  }
}
