import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Selector de cuenta contable en formularios transaccionales (2026-09-19) —
 * cuando el usuario elige una cuenta distinta de la que el motor habría
 * usado por defecto, esa línea del asiento queda marcada como elección
 * manual (auditoría). Columna nullable, sin default 0/false forzado a las
 * filas existentes — todo asiento generado antes de esta tarea fue 100%
 * automático, así que se deja NULL (nunca fue una decisión, ni manual ni
 * "no manual" explícitamente) en vez de escribir `false` a millones de
 * filas históricas sin necesidad.
 */
export class AddCuentaManualAsientoLinea1765000000000 implements MigrationInterface {
  name = 'AddCuentaManualAsientoLinea1765000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`ALTER TABLE asiento_lineas ADD COLUMN IF NOT EXISTS "cuentaManual" boolean`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE asiento_lineas DROP COLUMN IF EXISTS "cuentaManual"`);
  }
}
