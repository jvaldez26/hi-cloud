import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enriquecimiento del catálogo (2026-09-21) — decisión tomada DESPUÉS de que
 * 1766100000000-AgregarClasificacionResultadoCuentas ya se desplegó: las
 * cuentas de Diferencial Cambiario (ganancia/pérdida) también son no
 * operacionales, no solo Ingresos No Operacionales (4.2) y Gastos
 * Financieros (6.1.3), que la migración anterior ya cubrió. No se pudo
 * incluir en esa migración porque ya había corrido en producción — de ahí
 * esta segunda pasada, mismo patrón exacto (solo dos objetivos nuevos).
 *
 *   '4.1.3' "Diferencial Cambiario (Ingreso)" → no_operacional
 *   '6.1.5' "Diferencial Cambiario (Gasto)"   → no_operacional
 *
 * Marca la cuenta MADRE — sus hijas (4.1.3.01 Ganancia en Diferencial
 * Cambiario, 6.1.5.01 Pérdida en Diferencial Cambiario) quedan clasificadas
 * solas por herencia, sin tocarlas.
 *
 * Mismo alcance que la migración anterior: por empresa y por cada objetivo
 * de forma independiente, SOLO si código Y nombre siguen coincidiendo
 * exactamente con el seed — un catálogo modificado no se toca. Idempotente
 * (WHERE "clasificacionResultado" IS NULL).
 */
export class BackfillClasificacionResultadoDiferencialCambiario1766200000000 implements MigrationInterface {
  name = 'BackfillClasificacionResultadoDiferencialCambiario1766200000000';

  private readonly OBJETIVOS = [
    { codigo: '4.1.3',   nombre: 'Diferencial Cambiario (Ingreso)' },
    { codigo: '6.1.5',   nombre: 'Diferencial Cambiario (Gasto)' },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

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
      `[BackfillClasificacionResultadoDiferencialCambiario] ${empresas.length} empresa(s) con catálogo — ` +
      `${empresasConAlgunaMarcada} con al menos una cuenta marcada ` +
      `(${JSON.stringify(marcadasPorObjetivo)}) — ` +
      `${empresasSinNinguna.length} sin ninguna coincidencia (catálogo modificado, no tocadas): ` +
      `[${empresasSinNinguna.join(', ')}]`,
    );
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: no hay forma de distinguir "esta fila la
    // puso esta migración" de "el usuario la marcó a mano después" — mismo
    // criterio que la migración anterior (down no-op).
  }
}
