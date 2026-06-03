import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CRÍTICO: Corrige 17 índices únicos globales que violaban el aislamiento multi-tenant.
 * Cada tabla operacional debe usar UNIQUE(campo, empresaId), no UNIQUE(campo) global.
 *
 * Sin este fix, un código/RNC/cédula existente en la empresa A bloqueaba
 * crear/editar el mismo valor en la empresa B.
 */
export class FixUniqueConstraintsMultiTenant1749998000000 implements MigrationInterface {
  name = 'FixUniqueConstraintsMultiTenant1749998000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const fixes: Array<{ tabla: string; indiceViejo: string; camposClave: string }> = [
      { tabla: 'productos',            indiceViejo: 'UQ_2da210b34325c2319d784a32d49', camposClave: 'codigo' },
      { tabla: 'activos_fijos',        indiceViejo: 'UQ_7a2eab3e98e3a3c6c2266d1ec07', camposClave: 'codigo' },
      { tabla: 'asientos_contables',   indiceViejo: 'UQ_90490f25cfd49d58dfe7699385a', camposClave: 'numero' },
      { tabla: 'categorias_activos',   indiceViejo: 'UQ_851e2a9bc8779bbc987b0ec542c', camposClave: 'codigo' },
      { tabla: 'centros_costo',        indiceViejo: 'UQ_f25d410b49cd8e31a9df28826fb', camposClave: 'codigo' },
      { tabla: 'contratos',            indiceViejo: 'UQ_118d425b390cd16aa23be3d675c', camposClave: 'numero' },
      { tabla: 'cuentas_bancarias',    indiceViejo: 'UQ_95d89dcc8a6b831c1dc0ebf226a', camposClave: '"numeroCuenta"' },
      { tabla: 'cuentas_contables',    indiceViejo: 'UQ_fad7e044cff19ec01f5b6c0f451', camposClave: 'codigo' },
      { tabla: 'devoluciones',         indiceViejo: 'UQ_087baf824ec23905ebd35a6128c', camposClave: 'numero' },
      { tabla: 'empleados',            indiceViejo: 'UQ_531b62206ec48fc3ba88593af3a', camposClave: 'cedula' },
      { tabla: 'licitaciones',         indiceViejo: 'UQ_09c245a211e0166d54e2106c759', camposClave: 'numero' },
      { tabla: 'listas_materiales',    indiceViejo: 'UQ_fa884f456da42ec4360b856aff7', camposClave: 'codigo' },
      { tabla: 'ordenes_mantenimiento',indiceViejo: 'UQ_dec175756e08680f48b4a2382db', camposClave: 'numero' },
      { tabla: 'ordenes_produccion',   indiceViejo: 'UQ_e7cbe6fb5898d3560afcb2ecc15', camposClave: 'numero' },
      { tabla: 'ordenes_servicio',     indiceViejo: 'UQ_503cd4bda73b0dae044de806348', camposClave: 'numero' },
      { tabla: 'proveedores',          indiceViejo: 'UQ_bc9fff0b99bb4003e585c5d442e', camposClave: 'rnc' },
      { tabla: 'vehiculos',            indiceViejo: 'UQ_a9455f3a37d1d922a10f51664e9', camposClave: 'placa' },
    ];

    for (const { tabla, indiceViejo, camposClave } of fixes) {
      // 1. Eliminar el CONSTRAINT único global (no DROP INDEX — son constraints de TypeORM)
      await queryRunner.query(
        `ALTER TABLE "${tabla}" DROP CONSTRAINT IF EXISTS "${indiceViejo}"`,
      );

      // 2. Crear índice único compuesto con empresaId (por tenant, solo registros activos)
      const nuevoIndice = `UQ_mt_${tabla}_${camposClave.replace(/[^a-z0-9]/gi, '')}`;
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "${nuevoIndice}"
          ON "${tabla}" (${camposClave}, "empresaId")
          WHERE "isActive" = true
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: eliminar índices compuestos y restaurar los globales (solo para rollback de emergencia)
    const fixes: Array<{ tabla: string; indiceViejo: string; camposClave: string }> = [
      { tabla: 'productos',            indiceViejo: 'UQ_2da210b34325c2319d784a32d49', camposClave: 'codigo' },
      { tabla: 'activos_fijos',        indiceViejo: 'UQ_7a2eab3e98e3a3c6c2266d1ec07', camposClave: 'codigo' },
      { tabla: 'asientos_contables',   indiceViejo: 'UQ_90490f25cfd49d58dfe7699385a', camposClave: 'numero' },
      { tabla: 'categorias_activos',   indiceViejo: 'UQ_851e2a9bc8779bbc987b0ec542c', camposClave: 'codigo' },
      { tabla: 'centros_costo',        indiceViejo: 'UQ_f25d410b49cd8e31a9df28826fb', camposClave: 'codigo' },
      { tabla: 'contratos',            indiceViejo: 'UQ_118d425b390cd16aa23be3d675c', camposClave: 'numero' },
      { tabla: 'cuentas_bancarias',    indiceViejo: 'UQ_95d89dcc8a6b831c1dc0ebf226a', camposClave: '"numeroCuenta"' },
      { tabla: 'cuentas_contables',    indiceViejo: 'UQ_fad7e044cff19ec01f5b6c0f451', camposClave: 'codigo' },
      { tabla: 'devoluciones',         indiceViejo: 'UQ_087baf824ec23905ebd35a6128c', camposClave: 'numero' },
      { tabla: 'empleados',            indiceViejo: 'UQ_531b62206ec48fc3ba88593af3a', camposClave: 'cedula' },
      { tabla: 'licitaciones',         indiceViejo: 'UQ_09c245a211e0166d54e2106c759', camposClave: 'numero' },
      { tabla: 'listas_materiales',    indiceViejo: 'UQ_fa884f456da42ec4360b856aff7', camposClave: 'codigo' },
      { tabla: 'ordenes_mantenimiento',indiceViejo: 'UQ_dec175756e08680f48b4a2382db', camposClave: 'numero' },
      { tabla: 'ordenes_produccion',   indiceViejo: 'UQ_e7cbe6fb5898d3560afcb2ecc15', camposClave: 'numero' },
      { tabla: 'ordenes_servicio',     indiceViejo: 'UQ_503cd4bda73b0dae044de806348', camposClave: 'numero' },
      { tabla: 'proveedores',          indiceViejo: 'UQ_bc9fff0b99bb4003e585c5d442e', camposClave: 'rnc' },
      { tabla: 'vehiculos',            indiceViejo: 'UQ_a9455f3a37d1d922a10f51664e9', camposClave: 'placa' },
    ];

    for (const { tabla, indiceViejo, camposClave } of fixes) {
      const nuevoIndice = `UQ_mt_${tabla}_${camposClave.replace(/[^a-z0-9]/gi, '')}`;
      await queryRunner.query(`DROP INDEX IF EXISTS "${nuevoIndice}"`);
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ADD CONSTRAINT "${indiceViejo}" UNIQUE (${camposClave})`,
      );
    }
  }
}
