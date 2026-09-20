import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * COMMIT — conversión de moneda en compras (2026-09-20). El frontend nunca
 * convierte (envía precioUnitario en la moneda seleccionada + moneda +
 * tipoCambio, tal cual); ahora el backend convierte a DOP en el mismo punto
 * donde ya calculaba costoUnitarioReal y los totales que alimentan AVCO y
 * el asiento contable (compras.service.ts: calcularDetalles()).
 *
 * Se agregan columnas NUEVAS en vez de sobrescribir subtotal/itbis/total/
 * costoUnitarioReal — esos siguen en la moneda ORIGINAL de la compra, hacen
 * falta para conciliar con la factura del proveedor. Las columnas *DOP son
 * las que de aquí en adelante alimentan AVCO y el asiento; para compras
 * históricas (creadas antes de este commit) quedan NULL — no se backfillea
 * nada, el código que las lee cae a la columna original cuando *DOP es NULL
 * (que además es exactamente el valor correcto para las compras que ya
 * estaban en DOP).
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 */
export class AgregarConversionMonedaCompras1766000000000 implements MigrationInterface {
  name = 'AgregarConversionMonedaCompras1766000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS "subtotalDOP" decimal(12,2),
        ADD COLUMN IF NOT EXISTS "itbisDOP" decimal(12,2),
        ADD COLUMN IF NOT EXISTS "totalDOP" decimal(12,2),
        ADD COLUMN IF NOT EXISTS "montoRetencionItbisDOP" decimal(10,2),
        ADD COLUMN IF NOT EXISTS "montoRetencionIsrDOP" decimal(10,2),
        ADD COLUMN IF NOT EXISTS "netoPagarDOP" decimal(12,2)
    `);
    await qr.query(`
      ALTER TABLE compra_detalles
        ADD COLUMN IF NOT EXISTS "costoUnitarioRealDOP" decimal(12,4)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE compras
        DROP COLUMN IF EXISTS "subtotalDOP",
        DROP COLUMN IF EXISTS "itbisDOP",
        DROP COLUMN IF EXISTS "totalDOP",
        DROP COLUMN IF EXISTS "montoRetencionItbisDOP",
        DROP COLUMN IF EXISTS "montoRetencionIsrDOP",
        DROP COLUMN IF EXISTS "netoPagarDOP"
    `);
    await qr.query(`
      ALTER TABLE compra_detalles
        DROP COLUMN IF EXISTS "costoUnitarioRealDOP"
    `);
  }
}
