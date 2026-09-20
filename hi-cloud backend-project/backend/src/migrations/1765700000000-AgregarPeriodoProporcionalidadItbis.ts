import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commit 5 de Herramientas Fiscales — la calculadora de proporcionalidad
 * del ITBIS necesita saber si la prorrata se declara mensual (con ajuste
 * anual de regularización) o solo anual. El enunciado del usuario marca
 * esto explícitamente como un PARÁMETRO, no una decisión de código — se
 * agrega PENDIENTE_VALIDACION, sin valor, igual que los demás
 * placeholders del Commit 1.
 */
export class AgregarPeriodoProporcionalidadItbis1765700000000 implements MigrationInterface {
  name = 'AgregarPeriodoProporcionalidadItbis1765700000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      INSERT INTO parametros_fiscales ("clave", "valor", "vigenciaDesde", "vigenciaHasta", "baseLegal", "fuente")
      VALUES (
        'proporcionalidad_itbis_periodo', NULL,
        '2026-01-01', NULL,
        'Periodicidad de la prorrata del ITBIS de costos y gastos comunes (mensual con ajuste anual de regularización, o solo anual) — a completar',
        'Placeholder creado en el Commit 5 de Herramientas Fiscales (calculadora de proporcionalidad del ITBIS), sin datos aún. Jean debe confirmar la periodicidad exacta y, si es mensual, la regla de ajuste anual antes de que esta calculadora pueda producir un ITBIS deducible.'
      )
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DELETE FROM parametros_fiscales WHERE "clave" = 'proporcionalidad_itbis_periodo'`);
  }
}
