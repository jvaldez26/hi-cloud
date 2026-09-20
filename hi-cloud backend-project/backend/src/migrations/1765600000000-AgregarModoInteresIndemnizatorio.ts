import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commit 2 de Herramientas Fiscales — la calculadora de recargos e
 * intereses necesita saber si el interés indemnizatorio se acumula mes a
 * mes (compuesto) o se suma directo (simple) sobre el monto original. El
 * enunciado del Art. 27 CT / Ley 30-26 que maneja el usuario no lo
 * especifica de forma inequívoca — se agrega como parámetro nuevo,
 * PENDIENTE_VALIDACION, en vez de decidirlo en el código.
 */
export class AgregarModoInteresIndemnizatorio1765600000000 implements MigrationInterface {
  name = 'AgregarModoInteresIndemnizatorio1765600000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      INSERT INTO parametros_fiscales ("clave", "valor", "vigenciaDesde", "vigenciaHasta", "baseLegal", "fuente")
      VALUES (
        'interes_indemnizatorio_modo', '{"modo":"simple"}'::jsonb,
        '2000-01-01', NULL,
        'Art. 27 Código Tributario — no especifica de forma inequívoca si el interés se acumula mes a mes o se suma directo sobre el monto original',
        'Placeholder creado en el Commit 2 de Herramientas Fiscales (calculadora de recargos e intereses). "simple" es la suposición menos agresiva para el contribuyente, no una confirmación — Jean debe validar cuál aplica en la práctica de la DGII antes de que esta calculadora pueda cobrar interés.'
      )
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DELETE FROM parametros_fiscales WHERE "clave" = 'interes_indemnizatorio_modo'`);
  }
}
