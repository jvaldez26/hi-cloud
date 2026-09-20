import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * COSTO DE VENTA COMMIT 2 (2026-09-20) — la validación C-4 (facturas.
 * service.ts: "el precio no puede ser inferior al costo") existe desde
 * antes, pero hasta ahora estaba dormida para casi todo el catálogo: solo
 * dispara si `producto.costoPromedio > 0`, y con el proyecto AVCO
 * arrancando apenas hoy (ver COMMIT 1 de este mismo bloque), la inmensa
 * mayoría de los productos siguen en costoPromedio=0. En cuanto se corra el
 * seed retroactivo de AVCO (Fase 1, todavía sin ejecutar — pendiente de
 * resolver la conversión de moneda), miles de productos van a tener un
 * costo real de la noche a la mañana, y esta validación empezaría a
 * bloquear cualquier venta por debajo de ese costo — incluidas promociones
 * y liquidaciones legítimas — sin ninguna forma de permitirlo.
 *
 * DEFAULT true a propósito: que el seed de AVCO no le despierte de golpe a
 * ningún cliente un bloqueo que hoy no existe y deje a un cajero sin poder
 * vender una promoción. Cada empresa decide desde Configuración si quiere
 * activar el bloqueo.
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 */
export class AgregarPermitirVentaBajoCosto1765900000000 implements MigrationInterface {
  name = 'AgregarPermitirVentaBajoCosto1765900000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "permitirVentaBajoCosto" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "permitirVentaBajoCosto"
    `);
  }
}
