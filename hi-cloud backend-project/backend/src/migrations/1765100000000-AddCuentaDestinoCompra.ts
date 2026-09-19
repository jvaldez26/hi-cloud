import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Selector de cuenta contable en formularios transaccionales (2026-09-19) —
 * segundo formulario editable (Compras, después de Gastos). La misma
 * factura puede ser gasto, activo fijo o inventario según lo que
 * realmente se compró; el asiento automático siempre iba a Inventario sin
 * importar esto. Columna nullable, sin default: NULL = usa el default del
 * motor (Inventario), igual que hoy — no se inventa un valor para las
 * compras existentes.
 */
export class AddCuentaDestinoCompra1765100000000 implements MigrationInterface {
  name = 'AddCuentaDestinoCompra1765100000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS "cuentaDestino" varchar(20)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE compras DROP COLUMN IF EXISTS "cuentaDestino"`);
  }
}
