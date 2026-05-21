import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige facturas a crédito que quedaron en estado PAGADA incorrectamente.
 *
 * ROOT CAUSE: esPagoInmediato() usaba regex /pos\s*·/ que matcheaba
 * "POS · Crédito 30 días" → pagoInmediato=true → estado=PAGADA.
 *
 * Facturas a crédito sin pago registrado en CxC → estado EMITIDA.
 */
export class FixCreditInvoices1748700000000 implements MigrationInterface {
  name = 'FixCreditInvoices1748700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Corregir facturas CREDITO con estado PAGADA que no tienen pago real en CxC
    //    (montoPagado = 0 significa que no hubo cobro real)
    await queryRunner.query(`
      UPDATE facturas f
      SET estado = 'emitida', "updatedAt" = NOW()
      FROM cuentas_por_cobrar cxc
      WHERE cxc."facturaId" = f.id
        AND f."tipoPago" = 'CREDITO'
        AND f.estado = 'pagada'
        AND cxc."montoPagado" = 0
        AND f."isActive" = true
    `);

    // 2. También corregir facturas CREDITO con estado PAGADA que NO tienen CxC
    await queryRunner.query(`
      UPDATE facturas f
      SET estado = 'emitida', "updatedAt" = NOW()
      WHERE f."tipoPago" = 'CREDITO'
        AND f.estado = 'pagada'
        AND f."isActive" = true
        AND NOT EXISTS (
          SELECT 1 FROM cuentas_por_cobrar cxc
          WHERE cxc."facturaId" = f.id
        )
    `);

    // 3. Crear CxC faltantes para facturas CREDITO que no tienen ninguna
    await queryRunner.query(`
      INSERT INTO cuentas_por_cobrar (
        "isActive", "createdAt", "updatedAt",
        "empresaId", "facturaId", "clienteId",
        "montoOriginal", "montoPagado", "montoPendiente",
        "fechaEmision", "fechaVencimiento", "diasVencimiento",
        "estado", "userId"
      )
      SELECT
        true, NOW(), NOW(),
        f."empresaId", f.id, f."clienteId",
        f.total, 0, f.total,
        f.fecha::date,
        COALESCE(
          f."fechaVencimiento",
          f.fecha::date + (COALESCE(f."diasCredito", 30) || ' days')::interval
        ),
        COALESCE(f."diasCredito", 30),
        'pendiente',
        f."usuarioId"
      FROM facturas f
      WHERE f."tipoPago" = 'CREDITO'
        AND f."isActive" = true
        AND f.estado IN ('emitida', 'pagada')
        AND NOT EXISTS (
          SELECT 1 FROM cuentas_por_cobrar cxc WHERE cxc."facturaId" = f.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No revertible de forma segura
  }
}
