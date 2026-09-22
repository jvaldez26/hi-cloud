import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vínculo real entre recibos_cobro y pagos_cobrados (2026-09-22).
 *
 * Cuando "Nuevo Recibo" se emite contra una CxC (recibos-cobro.service.ts:crear()),
 * la operación escribe DOS filas para el mismo cobro: un REC- en recibos_cobro y un
 * RDP- en pagos_cobrados, en la misma transacción. Hasta ahora el único vínculo
 * entre ambas era texto libre — pagos_cobrados.notas = "Recibo REC-xxx" — que
 * listar(), eliminar() y cxc.service.ts (getPagos/anularPago) tenían que adivinar
 * con una expresión regular o un LIKE con comodín (este último con riesgo real de
 * falso positivo: LIKE 'Recibo REC-101%' también matchea 'Recibo REC-1010').
 *
 * "reciboCobroId" es NOT NULL solo para las filas de pagos_cobrados creadas desde
 * el flujo A (con CxC); las que se registran directo desde Cuentas por Cobrar
 * (POST /cxc/:id/pago) no tienen recibo y quedan NULL — por eso la columna es
 * nullable y el ON DELETE es SET NULL, no CASCADE.
 */
export class AgregarReciboCobroIdPagosCobrados1766800000000 implements MigrationInterface {
  name = 'AgregarReciboCobroIdPagosCobrados1766800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE pagos_cobrados
        ADD COLUMN IF NOT EXISTS "reciboCobroId" INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE pagos_cobrados
        ADD CONSTRAINT fk_pagos_cobrados_recibo_cobro
        FOREIGN KEY ("reciboCobroId") REFERENCES recibos_cobro(id) ON DELETE SET NULL NOT VALID
    `);
    await queryRunner.query(`ALTER TABLE pagos_cobrados VALIDATE CONSTRAINT fk_pagos_cobrados_recibo_cobro`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pagos_cobrados_recibo_cobro_id ON pagos_cobrados ("reciboCobroId")
    `);

    // Backfill: el mismo vínculo que hasta hoy vivía en notas, ahora como FK real.
    // notas siempre trae "Recibo REC-xxx" al principio para las filas del flujo A
    // (recibos-cobro.service.ts:253) — se extrae con regex, no con LIKE, para no
    // heredar el problema de comodín que se está corrigiendo.
    await queryRunner.query(`
      UPDATE pagos_cobrados pc
         SET "reciboCobroId" = rc.id
        FROM recibos_cobro rc
       WHERE pc."reciboCobroId" IS NULL
         AND pc.notas ~ '^Recibo (REC-[0-9]+)'
         AND rc.numero = substring(pc.notas from 'Recibo (REC-[0-9]+)')
         AND rc."empresaId" = pc."empresaId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pagos_cobrados_recibo_cobro_id`);
    await queryRunner.query(`ALTER TABLE pagos_cobrados DROP CONSTRAINT IF EXISTS fk_pagos_cobrados_recibo_cobro`);
    await queryRunner.query(`ALTER TABLE pagos_cobrados DROP COLUMN IF EXISTS "reciboCobroId"`);
  }
}
