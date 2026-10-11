import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Incidente real (2026-10-11): una cajera quedó bloqueada a mitad de turno
 * pidiendo contraseña — SESION_HORAS seguía en el default original de 24h.
 * La sesión es DESLIZANTE (session-lifetime.service.ts: rotar() renueva la
 * ventana en cada uso), así que el default correcto es el mismo tope que el
 * máximo permitido (720h = 30 días): con uso periódico nunca vence por
 * tiempo, solo tras 30 días SEGUIDOS sin ningún uso.
 *
 * Solo toca la fila si sigue en el valor '24' que trajo el seed original —
 * si un Super Admin ya la personalizó a otra cosa, esa decisión se respeta.
 */
export class SesionHorasDeslizante30Dias1778000000000 implements MigrationInterface {
  name = 'SesionHorasDeslizante30Dias1778000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE configuraciones_sistema
      SET valor = '720'
      WHERE clave = 'SESION_HORAS' AND valor = '24'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE configuraciones_sistema
      SET valor = '24'
      WHERE clave = 'SESION_HORAS' AND valor = '720'
    `);
  }
}
