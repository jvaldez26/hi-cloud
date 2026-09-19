import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuración Contable por Módulo (2026-09-19) — crea la tabla que permite
 * a cada empresa sobreescribir, concepto por concepto, los códigos de cuenta
 * que hoy viven hardcodeados en el objeto `COD` de AsientosAutomaticosService
 * (ver ConfiguracionCuentaContable, ConfiguracionContableService).
 *
 * Tabla vacía al crearse: sin filas, toda empresa sigue usando exactamente
 * los mismos códigos que usa hoy (el default de `COD`) — nada se rompe para
 * las empresas existentes. Las filas se agregan solo cuando un contador
 * cambia un concepto desde la pantalla de configuración.
 *
 * down() real: es una tabla nueva sin dependientes, sin riesgo de pérdida de
 * datos de otras tablas al revertir (la única pérdida es la propia
 * configuración custom, aceptable en un rollback deliberado).
 */
export class ConfiguracionCuentasContables1765200000000 implements MigrationInterface {
  name = 'ConfiguracionCuentasContables1765200000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS configuraciones_cuentas_contables (
        id SERIAL PRIMARY KEY,
        "empresaId" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "concepto" varchar(60) NOT NULL,
        "cuentaCodigo" varchar(20) NOT NULL,
        CONSTRAINT "UQ_config_cuenta_empresa_concepto" UNIQUE ("empresaId", "concepto")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_config_cuenta_contable_empresaId" ON configuraciones_cuentas_contables ("empresaId")`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DROP TABLE IF EXISTS configuraciones_cuentas_contables`);
  }
}
