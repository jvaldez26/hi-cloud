import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Selector de cuenta contable en formularios transaccionales (2026-09-19) —
 * al conectar CATEGORIA_LABELS (gasto.entity.ts) con el motor de asientos
 * (gastos.service.ts, antes calculaba la cuenta de cada categoría y la
 * descartaba) se descubrió que 5 de las 13 categorías apuntaban a un código
 * que no existía en el catálogo (Mantenimiento, Seguros, Otros, Gasto
 * Menor, Impuestos y Tasas) y 2 apuntaban a un código que YA es de otra
 * cuenta real (Transporte reusaba 6.1.2.05 "Depreciación y Amortización";
 * Marketing reusaba 6.1.2.06 "ITBIS no Recuperable"). Esta migración cierra
 * esos 8 códigos en las empresas que ya existían — el seed (PLAN_CUENTAS en
 * contabilidad.service.ts) ya los tiene para empresas nuevas.
 *
 * Transporte y Marketing se reasignaron a códigos nuevos (.11/.12) en vez
 * de robarle el código a una cuenta que ya existe y está etiquetada — ver
 * el mismo criterio ya usado en 1764700000000-AgregarCuentasHuerfanasMotor.
 *
 * Idempotente: por cada empresa y cada código, solo inserta si ese
 * (codigo, empresaId) todavía no existe. El nodo padre 6.1.4 se inserta
 * PRIMERO en cada empresa — la hoja 6.1.4.01 resuelve su cuentaPadreId
 * contra esa fila (o la ya existente, si la migración se reejecuta). Las
 * 6 hojas bajo 6.1.2 usan el grupo "Gastos Generales y Administración" que
 * ya existe para toda empresa desde el seed base.
 */
export class AgregarCuentasCategoriaGasto1764900000000 implements MigrationInterface {
  name = 'AgregarCuentasCategoriaGasto1764900000000';

  private readonly NUEVAS: Array<{
    codigo: string; nombre: string; nivel: number; permiteMovimientos: boolean; padre: string;
    tipoGasto606?: string; requiereNCF?: boolean; anexoIR2?: 'B1';
  }> = [
    { codigo: '6.1.4',    nombre: 'Impuestos y Tasas',        nivel: 3, permiteMovimientos: false, padre: '6.1' },
    { codigo: '6.1.2.07', nombre: 'Mantenimiento',            nivel: 4, permiteMovimientos: true,  padre: '6.1.2', tipoGasto606: '02', requiereNCF: true,  anexoIR2: 'B1' },
    { codigo: '6.1.2.08', nombre: 'Seguros',                  nivel: 4, permiteMovimientos: true,  padre: '6.1.2', tipoGasto606: '11', requiereNCF: true,  anexoIR2: 'B1' },
    { codigo: '6.1.2.09', nombre: 'Otros Gastos',              nivel: 4, permiteMovimientos: true,  padre: '6.1.2', requiereNCF: true },
    { codigo: '6.1.2.10', nombre: 'Gasto Menor',               nivel: 4, permiteMovimientos: true,  padre: '6.1.2', requiereNCF: false },
    { codigo: '6.1.2.11', nombre: 'Transporte',                nivel: 4, permiteMovimientos: true,  padre: '6.1.2', tipoGasto606: '02', requiereNCF: true,  anexoIR2: 'B1' },
    { codigo: '6.1.2.12', nombre: 'Marketing y Publicidad',    nivel: 4, permiteMovimientos: true,  padre: '6.1.2', tipoGasto606: '02', requiereNCF: true,  anexoIR2: 'B1' },
    { codigo: '6.1.4.01', nombre: 'Impuestos y Tasas',         nivel: 4, permiteMovimientos: true,  padre: '6.1.4' }, // requiereNCF ambiguo a propósito, sin dictamen
  ];

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    const empresas: { empresaId: number }[] = await qr.query(
      `SELECT DISTINCT "empresaId" FROM cuentas_contables WHERE "empresaId" IS NOT NULL ORDER BY "empresaId"`,
    );

    for (const { empresaId } of empresas) {
      for (const c of this.NUEVAS) {
        const existe = await qr.query(
          `SELECT id FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
          [c.codigo, empresaId],
        );
        let cuentaId: number;
        if (existe.length > 0) {
          cuentaId = existe[0].id; // ya existe — idempotente, pero puede que su anexo B1 todavía no se haya insertado
        } else {
          const padreRows: { id: number }[] = await qr.query(
            `SELECT id FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
            [c.padre, empresaId],
          );
          const cuentaPadreId = padreRows[0]?.id ?? null;

          const [inserted] = await qr.query(
            `INSERT INTO cuentas_contables
               (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "cuentaPadreId",
                "tipoGasto606", "requiereNCF", "empresaId", "isActive", "createdAt", "updatedAt")
             VALUES ($1, $2, 'gasto', 'deudora', $3, $4, $5, $6, $7, $8, true, now(), now())
             RETURNING id`,
            [
              c.codigo, c.nombre, c.nivel, c.permiteMovimientos, cuentaPadreId,
              c.tipoGasto606 ?? null, c.requiereNCF ?? null, empresaId,
            ],
          );
          cuentaId = inserted.id;
        }

        if (c.anexoIR2) {
          const yaTieneAnexo = await qr.query(
            `SELECT 1 FROM cuenta_anexo_ir2 WHERE "cuentaContableId" = $1 AND "anexoIR2" = $2 AND "isActive" = true LIMIT 1`,
            [cuentaId, c.anexoIR2],
          );
          if (yaTieneAnexo.length === 0) {
            await qr.query(
              `INSERT INTO cuenta_anexo_ir2 ("empresaId", "cuentaContableId", "anexoIR2", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, now(), now())`,
              [empresaId, cuentaId, c.anexoIR2],
            );
          }
        }
      }
    }
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: para el momento de un rollback, alguna
    // empresa podría ya tener gastos reales contabilizados contra estas
    // cuentas (Mantenimiento, Seguros, Transporte, Marketing, etc. —
    // categorías que ya existían en el formulario antes de esta migración,
    // así que ya podría haber gastos guardados esperando esta cuenta) —
    // borrarlas rompería la FK cuentaContableId de asiento_lineas. No-op
    // intencional, mismo criterio que 1764700000000-AgregarCuentasHuerfanasMotor.
  }
}
