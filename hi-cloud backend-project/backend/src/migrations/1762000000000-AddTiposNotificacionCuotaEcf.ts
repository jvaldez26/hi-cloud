import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dos tipos nuevos de notificación para la cuota de e-CF: el aviso del 80% y el
 * de haberla superado.
 *
 * `notificaciones_enviadas.tipo` es un enum de PostgreSQL, así que añadir un
 * valor es DDL y no cabe solo en el enum de TypeScript. Sin esto, el primer
 * intento de registrar el envío falla con "invalid input value for enum" —
 * después de haber mandado el correo, que es la peor forma de descubrirlo.
 *
 * `ADD VALUE` dentro de una transacción es legal desde PostgreSQL 12 (aquí
 * corre 18.3) siempre que el valor nuevo no se USE en esa misma transacción.
 * Esta migración solo lo declara; quien lo escribe es el runtime, después del
 * commit.
 *
 * `IF NOT EXISTS` para que reaplicarla no reviente.
 */
export class AddTiposNotificacionCuotaEcf1762000000000 implements MigrationInterface {
  name = 'AddTiposNotificacionCuotaEcf1762000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'ecf_cuota_80'
    `);
    await qr.query(`
      ALTER TYPE "notificaciones_enviadas_tipo_enum"
        ADD VALUE IF NOT EXISTS 'ecf_cuota_excedida'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL no sabe quitar un valor de un enum. Deshacerlo exigiría crear
    // el tipo de nuevo, migrar la columna y recrear el default — por dos valores
    // que no estorban a nadie si dejan de usarse. Se deja como no-op a
    // propósito, igual que el resto de enums del proyecto.
  }
}
