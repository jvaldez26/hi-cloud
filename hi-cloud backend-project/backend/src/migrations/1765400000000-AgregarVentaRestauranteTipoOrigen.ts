import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración de Restaurante al motor compartido (2026-09-19) — antes
 * generaba su asiento con SQL crudo directo a asientos_contables/
 * asiento_lineas, sin pasar por AsientosAutomaticosService: sin validación
 * de partida doble, sin reporte a Sentry si faltaba una cuenta, con
 * Caja/Bancos/Ventas/ITBIS hardcodeados, y con userId fijo en 1 en vez del
 * usuario real que cobró. Ver restaurante.service.ts.
 *
 * Agrega el valor 'venta_restaurante' al enum de tipoOrigen — Postgres no
 * permite usar un valor de enum recién agregado dentro de la MISMA
 * transacción en versiones viejas, así que esta migración solo agrega el
 * valor (no lo usa).
 */
export class AgregarVentaRestauranteTipoOrigen1765400000000 implements MigrationInterface {
  name = 'AgregarVentaRestauranteTipoOrigen1765400000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE IF NOT EXISTS 'venta_restaurante'`);
  }

  public async down(): Promise<void> {
    // Postgres no soporta DROP VALUE en un enum. No-op deliberado — dejar el
    // valor sin uso es inofensivo; quitarlo requeriría recrear el tipo.
  }
}
