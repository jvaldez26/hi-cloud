import { MigrationInterface, QueryRunner } from 'typeorm';

export class PagosSuscripcionDop1753930000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`ALTER TABLE pagos_suscripcion RENAME COLUMN "montoUsd" TO monto`);
    await qr.query(`UPDATE plan_configuracion SET precio = 1700 WHERE clave = 'emprendedor'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 3500 WHERE clave = 'pyme'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 5200 WHERE clave = 'pro'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 7600 WHERE clave = 'plus'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE pagos_suscripcion RENAME COLUMN monto TO "montoUsd"`);
    await qr.query(`UPDATE plan_configuracion SET precio = 29.00    WHERE clave = 'emprendedor'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 3451.50  WHERE clave = 'pyme'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 5206.50  WHERE clave = 'pro'`);
    await qr.query(`UPDATE plan_configuracion SET precio = 7548.50  WHERE clave = 'plus'`);
  }
}
