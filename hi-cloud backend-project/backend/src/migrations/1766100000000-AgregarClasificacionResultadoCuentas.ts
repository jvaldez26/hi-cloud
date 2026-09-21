import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estado de Resultados (2026-09-21) — clasificacionResultado distingue
 * "Ingresos"/"Gastos" (operacionales) de "Otros Ingresos"/"Otros Gastos"
 * SIN usar rangos de código (el código '4.1'/'4.2' del catálogo no es una
 * fuente de verdad limpia — Gastos Financieros vive bajo '6.1'
 * "Operacionales" aunque contablemente es no operacional, ver el debate en
 * el commit de este mismo archivo).
 *
 * NULLABLE con herencia (resolverClasificacionResultado() en
 * reportes-financieros): null = "hereda de la cuenta madre", subiendo la
 * cadena hasta encontrar un valor; sin valor en toda la cadena →
 * 'operacional'. Por eso el backfill de esta migración solo necesita
 * marcar DOS cuentas madre — sus hijas quedan clasificadas solas:
 *
 *   '4.2' "Ingresos No Operacionales" → no_operacional (cascada a Ingresos
 *          Financieros / Otros Ingresos, sus hijas del seed)
 *   '6.1.3' "Gastos Financieros"      → no_operacional (cascada a Intereses
 *          Bancarios / Comisiones Bancarias, aunque el código las ubique
 *          bajo '6.1' "Gastos Operacionales")
 *
 * Alcance: por EMPRESA y por CADA una de las dos cuentas objetivo, de forma
 * independiente — se marca esa cuenta puntual SOLO si su código Y su
 * nombre siguen coincidiendo exactamente con el seed (PLAN_CUENTAS_BASE en
 * contabilidad.service.ts). Un catálogo donde el contador renombró o movió
 * esa cuenta no se toca — no hay forma segura de adivinar la intención de
 * un cambio manual. Se reporta cuántas empresas quedaron sin NINGÚN
 * backfill (ninguna de las dos coincidió) para revisar aparte.
 *
 * Idempotente: solo actualiza filas cuyo clasificacionResultado sea NULL
 * todavía — reejecutarla no pisa una clasificación puesta a mano después.
 */
export class AgregarClasificacionResultadoCuentas1766100000000 implements MigrationInterface {
  name = 'AgregarClasificacionResultadoCuentas1766100000000';

  private readonly OBJETIVOS = [
    { codigo: '4.2',   nombre: 'Ingresos No Operacionales' },
    { codigo: '6.1.3', nombre: 'Gastos Financieros' },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TYPE "cuentas_contables_clasificacionResultado_enum"
        AS ENUM ('operacional', 'no_operacional')
    `);
    await qr.query(`
      ALTER TABLE "cuentas_contables"
        ADD COLUMN "clasificacionResultado" "cuentas_contables_clasificacionResultado_enum"
    `);

    const empresas: { id: number }[] = await qr.query(
      `SELECT DISTINCT "empresaId" AS id FROM cuentas_contables ORDER BY 1`,
    );

    let empresasConAlgunaMarcada = 0;
    const empresasSinNinguna: number[] = [];
    const marcadasPorObjetivo: Record<string, number> = {};

    for (const { id: empresaId } of empresas) {
      let algunaMarcadaEnEstaEmpresa = false;

      for (const obj of this.OBJETIVOS) {
        const { rowCount } = await qr.query(
          `UPDATE cuentas_contables
              SET "clasificacionResultado" = 'no_operacional'
            WHERE "empresaId" = $1 AND codigo = $2 AND nombre = $3
              AND "clasificacionResultado" IS NULL
           RETURNING id`,
          [empresaId, obj.codigo, obj.nombre],
        );
        if (rowCount > 0) {
          algunaMarcadaEnEstaEmpresa = true;
          marcadasPorObjetivo[obj.codigo] = (marcadasPorObjetivo[obj.codigo] ?? 0) + 1;
        }
      }

      if (algunaMarcadaEnEstaEmpresa) empresasConAlgunaMarcada++;
      else empresasSinNinguna.push(empresaId);
    }

    console.log(
      `[AgregarClasificacionResultadoCuentas] ${empresas.length} empresa(s) con catálogo — ` +
      `${empresasConAlgunaMarcada} con al menos una cuenta marcada ` +
      `(${JSON.stringify(marcadasPorObjetivo)}) — ` +
      `${empresasSinNinguna.length} sin ninguna coincidencia (catálogo modificado, no tocadas): ` +
      `[${empresasSinNinguna.join(', ')}]`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "cuentas_contables" DROP COLUMN "clasificacionResultado"`);
    await qr.query(`DROP TYPE "cuentas_contables_clasificacionResultado_enum"`);
  }
}
