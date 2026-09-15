import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte para: elegir el sector del negocio en el registro y activar el
 * add-on correspondiente automáticamente (ver ModulosAddonService.
 * activarModulo y AuthService.register).
 *
 * - modulos_addon.activacionAutomatica: flag por add-on configurable desde
 *   Super Admin — hoy todos en automático (default true), mañana se puede
 *   cambiar uno a manual sin tocar código.
 * - empresa_modulos.origen: 'manual' (Super Admin) vs 'registro' (elegido
 *   por el usuario al crear su cuenta) — para poder distinguir el rastro.
 * - empresa_modulos.esCortesia: la activación automática del registro es
 *   cortesía, no una contratación pagada — hace falta saberlo el día que
 *   se empiece a cobrar por add-on.
 * - empresa.sectorOtroTexto: texto libre cuando el usuario elige "Otro" en
 *   el selector de sector — visible para Super Admin como señal de qué
 *   verticales están pidiendo los clientes.
 * - Se agrega 'prestamista' a modulos_addon: el módulo existe completo en
 *   el backend (ModuloAddonGuard('prestamista') en sus ~12 controllers)
 *   pero nunca se insertó en el catálogo — activarlo desde Super Admin
 *   fallaba con 404 y no podía aparecer en el selector de sectores.
 */
export class AddSectorAddonRegistroAutomatico1763500000000 implements MigrationInterface {
  name = 'AddSectorAddonRegistroAutomatico1763500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE modulos_addon
        ADD COLUMN IF NOT EXISTS "activacionAutomatica" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE empresa_modulos
        ADD COLUMN IF NOT EXISTS origen varchar(20) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS "esCortesia" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "sectorOtroTexto" varchar(100)
    `);

    await queryRunner.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion, "isActive")
      VALUES ('prestamista', 'Prestamista / Financiera',
              'Gestión de préstamos, cuotas, pagos, mora y estados de cuenta.', true)
      ON CONFLICT (codigo) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DELETE FROM modulos_addon WHERE codigo = 'prestamista'`);
    await queryRunner.query(`ALTER TABLE empresa DROP COLUMN IF EXISTS "sectorOtroTexto"`);
    await queryRunner.query(`ALTER TABLE empresa_modulos DROP COLUMN IF EXISTS "esCortesia"`);
    await queryRunner.query(`ALTER TABLE empresa_modulos DROP COLUMN IF EXISTS origen`);
    await queryRunner.query(`ALTER TABLE modulos_addon DROP COLUMN IF EXISTS "activacionAutomatica"`);
  }
}
