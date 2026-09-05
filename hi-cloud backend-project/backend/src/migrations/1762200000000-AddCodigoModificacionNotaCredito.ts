import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `notas_credito."codigoModificacion"`: el código DGII (1=Anulación total,
 * 2=Corrección de texto, 3=Corrección de montos, 4=Reemplazo de contingencia,
 * 5=Referencia a Factura de Consumo) que el usuario elige al CREAR la nota.
 *
 * Hasta ahora ese valor no se guardaba en ningún lado: `crear()` lo usaba solo
 * de forma transitoria para validar el monto (código 1 exige igualdad exacta
 * con el total de la factura) y luego lo descartaba — nunca entraba al
 * `ncRepo.create({...})`. El único sitio donde sobrevivía era `ecf."codigoModificacion"`,
 * y solo para las NC que ya se habían emitido, porque ahí sí se guarda al someter
 * el e-CF a DGII.
 *
 * Consecuencia visible: el modal de "Emitir e-CF E34" tenía que volver a
 * preguntarlo, porque no había de dónde leerlo. Ver commit que acompaña esta
 * migración — ahora `crear()` lo persiste y el endpoint de emisión lo deriva
 * de la fila en vez de aceptarlo del body.
 *
 * Backfill en dos pasos:
 *   1) Recuperar el valor REAL para las NC ya emitidas, desde `ecf."codigoModificacion"`
 *      (ahí quedó grabado el que de verdad se usó al someter a DGII).
 *   2) Lo que queda sin dato (borrador sin e-CF todavía, o emitida cuyo e-CF no
 *      lo guardó) no tiene forma de recuperarse — se descartaba antes de este
 *      fix. Se asume '3' (corrección de montos), el mismo default que ya usa
 *      el formulario de creación: es el lado correcto en el que equivocarse
 *      si alguien tiene que revisarlo a mano.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy.
 */
export class AddCodigoModificacionNotaCredito1762200000000 implements MigrationInterface {
  name = 'AddCodigoModificacionNotaCredito1762200000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      ALTER TABLE "notas_credito"
        ADD COLUMN IF NOT EXISTS "codigoModificacion" VARCHAR(1) NULL
    `);

    await qr.query(`
      UPDATE "notas_credito" nc
         SET "codigoModificacion" = e."codigoModificacion"::text
        FROM "ecf" e
       WHERE e."documentoOrigenId"   = nc.id
         AND e."documentoOrigenTipo" = 'NOTA_CREDITO'
         AND e."codigoModificacion" IS NOT NULL
         AND nc."codigoModificacion" IS NULL
    `);

    await qr.query(`
      UPDATE "notas_credito"
         SET "codigoModificacion" = '3'
       WHERE "codigoModificacion" IS NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "notas_credito" DROP COLUMN IF EXISTS "codigoModificacion"`);
  }
}
