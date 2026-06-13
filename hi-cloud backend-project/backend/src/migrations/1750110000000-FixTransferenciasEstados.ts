import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransferenciasEstados1750110000000 implements MigrationInterface {
  name = 'FixTransferenciasEstados1750110000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Transferencias: agregar 'pendiente' al enum ───────────────────────────
    // DROP DEFAULT primero para poder cambiar el tipo
    await qr.query(`ALTER TABLE transferencias_almacen ALTER COLUMN estado DROP DEFAULT`);
    // Convertir a TEXT para liberar la dependencia del tipo enum
    await qr.query(`ALTER TABLE transferencias_almacen ALTER COLUMN estado TYPE TEXT`);
    // Eliminar el enum antiguo
    await qr.query(`DROP TYPE IF EXISTS "transferencias_almacen_estado_enum"`);
    // Crear nuevo enum con 'pendiente' + mantener 'borrador' para BC
    await qr.query(`
      CREATE TYPE "transferencias_almacen_estado_enum" AS ENUM
        ('pendiente', 'borrador', 'en_transito', 'completada', 'cancelada')
    `);
    // Restaurar la columna como enum
    await qr.query(`
      ALTER TABLE transferencias_almacen
        ALTER COLUMN estado TYPE "transferencias_almacen_estado_enum"
        USING estado::"transferencias_almacen_estado_enum"
    `);
    // Nuevo default: pendiente
    await qr.query(`
      ALTER TABLE transferencias_almacen
        ALTER COLUMN estado SET DEFAULT 'pendiente'::"transferencias_almacen_estado_enum"
    `);
    // Migrar datos: borrador → pendiente
    await qr.query(`UPDATE transferencias_almacen SET estado = 'pendiente' WHERE estado = 'borrador'`);

    // ── Movimientos: agregar tipos de transferencia ───────────────────────────
    await qr.query(`ALTER TABLE movimientos_inventario ALTER COLUMN tipo TYPE TEXT`);
    await qr.query(`DROP TYPE IF EXISTS "movimientos_inventario_tipo_enum"`);
    await qr.query(`
      CREATE TYPE "movimientos_inventario_tipo_enum" AS ENUM
        ('entrada', 'salida', 'ajuste', 'devolucion',
         'salida_transferencia', 'entrada_transferencia', 'cancelacion_transferencia')
    `);
    await qr.query(`
      ALTER TABLE movimientos_inventario
        ALTER COLUMN tipo TYPE "movimientos_inventario_tipo_enum"
        USING tipo::"movimientos_inventario_tipo_enum"
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Revertir movimientos
    await qr.query(`ALTER TABLE movimientos_inventario ALTER COLUMN tipo TYPE TEXT`);
    await qr.query(`DROP TYPE IF EXISTS "movimientos_inventario_tipo_enum"`);
    await qr.query(`
      CREATE TYPE "movimientos_inventario_tipo_enum" AS ENUM
        ('entrada', 'salida', 'ajuste', 'devolucion')
    `);
    await qr.query(`
      ALTER TABLE movimientos_inventario
        ALTER COLUMN tipo TYPE "movimientos_inventario_tipo_enum"
        USING tipo::"movimientos_inventario_tipo_enum"
    `);

    // Revertir transferencias (vuelve a 'borrador')
    await qr.query(`UPDATE transferencias_almacen SET estado = 'borrador' WHERE estado = 'pendiente'`);
    await qr.query(`ALTER TABLE transferencias_almacen ALTER COLUMN estado DROP DEFAULT`);
    await qr.query(`ALTER TABLE transferencias_almacen ALTER COLUMN estado TYPE TEXT`);
    await qr.query(`DROP TYPE IF EXISTS "transferencias_almacen_estado_enum"`);
    await qr.query(`
      CREATE TYPE "transferencias_almacen_estado_enum" AS ENUM
        ('borrador', 'en_transito', 'completada', 'cancelada')
    `);
    await qr.query(`
      ALTER TABLE transferencias_almacen
        ALTER COLUMN estado TYPE "transferencias_almacen_estado_enum"
        USING estado::"transferencias_almacen_estado_enum"
    `);
    await qr.query(`
      ALTER TABLE transferencias_almacen
        ALTER COLUMN estado SET DEFAULT 'borrador'::"transferencias_almacen_estado_enum"
    `);
  }
}
