import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vínculo NC → Devolución — dirección inversa de devoluciones."notaCreditoId"
 * (que ya existía). Hace falta para el flujo nuevo: una NC de código 1 o 3
 * aceptada por DGII genera una devolución pendiente automáticamente (ver
 * ecf-efectos-nc.service.ts y devoluciones.service.ts#crearDesdeNotaCredito).
 * El guard bidireccional que evita el ciclo (NC↔devolución generándose la
 * una a la otra sin fin) vive en el código, no en estas columnas — ver el
 * comentario en ecf-efectos-nc.service.ts.
 *
 * numero se guarda denormalizado junto al id, igual que devoluciones ya hace
 * con "notaCreditoId"/"notaCreditoNumero" — evita un JOIN solo para mostrar
 * "Devolución relacionada: DEV-0042" en el detalle de la NC.
 *
 * devoluciones."generadaDesdeNc": después de procesar(), una devolución
 * manual y una nacida de NC quedan idénticas por fuera — las dos terminan
 * con notaCreditoId asignado (una lo generó, la otra ya lo traía). Sin este
 * flag, fijado SOLO en crearDesdeNotaCredito() y nunca tocado por
 * procesar(), la lista no podría mostrar el origen real una vez procesada.
 */
export class AddDevolucionIdNotaCredito1762900000000 implements MigrationInterface {
  name = 'AddDevolucionIdNotaCredito1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notas_credito"
        ADD COLUMN IF NOT EXISTS "devolucionId" integer NULL,
        ADD COLUMN IF NOT EXISTS "devolucionNumero" varchar(20) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "devoluciones"
        ADD COLUMN IF NOT EXISTS "generadaDesdeNc" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devoluciones"
        DROP COLUMN IF EXISTS "generadaDesdeNc"
    `);
    await queryRunner.query(`
      ALTER TABLE "notas_credito"
        DROP COLUMN IF EXISTS "devolucionId",
        DROP COLUMN IF EXISTS "devolucionNumero"
    `);
  }
}
