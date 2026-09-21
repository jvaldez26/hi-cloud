import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 — bug de conteo en las dos migraciones anteriores (1766100000000 y
 * 1766200000000): leían el rowCount desestructurando el resultado de
 * QueryRunner.query() sobre un UPDATE...RETURNING por NOMBRE de propiedad,
 * en vez de por posición. Ese método de TypeORM devuelve [filas, rowCount]
 * — un ARRAY de dos elementos, no { rows, rowCount } — así que leer la
 * propiedad por nombre da `undefined` siempre (los arrays no la tienen).
 * Confirmado contra Postgres real: el UPDATE SÍ se ejecuta (la fila
 * cambia), pero el log de esas dos migraciones reportó "0 empresas
 * marcadas" en las 36 empresas de producción — un falso negativo de
 * conteo, no necesariamente de datos. Mismo patrón que el incidente del
 * 2026-09-02 (memoria del proyecto: "TypeORM query() y UPDATE...RETURNING"),
 * cometido de nuevo por no pasar por el helper — validate-update-
 * returning.js tampoco lo atrapó, por dos huecos ya cerrados en este mismo
 * commit: la carpeta de migraciones estaba fuera del escaneo, y ese patrón
 * de lectura por nombre nunca se buscaba (solo el de lectura por posición).
 * Las dos migraciones anteriores se corrigieron en el propio archivo (no
 * se re-ejecutan — TypeORM ya las tiene marcadas como aplicadas — es
 * limpieza del historial, no un cambio de comportamiento).
 *
 * Esta migración NO asume que el UPDATE anterior funcionó ni que falló —
 * lo VERIFICA con un SELECT antes de tocar nada, y corrige lo que falte,
 * con el conteo esta vez leído del elemento correcto del array. Cubre las
 * 4 cuentas madre no operacionales (4.1.3, 4.2, 6.1.3, 6.1.5) en una sola
 * pasada — la de 6.1.8 no aplica: esa es una cuenta NUEVA (no existía antes
 * del commit del enriquecimiento), así que solo empresas que ya corrieron
 * "Completar con el catálogo estándar" la tendrían, y esa siembra ya
 * incluye clasificacionResultado en el propio archivo generado — no hace
 * falta backfill aparte para 6.1.8.
 */
export class VerificarClasificacionResultadoDiferencialYNoOperacional1766300000000 implements MigrationInterface {
  name = 'VerificarClasificacionResultadoDiferencialYNoOperacional1766300000000';

  private readonly OBJETIVOS = [
    { codigo: '4.1.3', nombre: 'Diferencial Cambiario (Ingreso)' },
    { codigo: '4.2',   nombre: 'Ingresos No Operacionales' },
    { codigo: '6.1.3', nombre: 'Gastos Financieros' },
    { codigo: '6.1.5', nombre: 'Diferencial Cambiario (Gasto)' },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── 1. Diagnóstico ANTES de tocar nada — ¿el UPDATE de las migraciones
    // anteriores realmente aplicó, a pesar del log erróneo? ──────────────
    const yaMarcadas: { codigo: string; total: string }[] = await qr.query(`
      SELECT codigo, COUNT(*)::text AS total
        FROM cuentas_contables
       WHERE codigo = ANY($1) AND "clasificacionResultado" = 'no_operacional'
       GROUP BY codigo`,
      [this.OBJETIVOS.map(o => o.codigo)],
    );
    console.log(
      `[VerificarClasificacionResultado] YA marcadas no_operacional (de migraciones anteriores): ` +
      `${JSON.stringify(yaMarcadas)}`,
    );

    // ── 2. Corregir lo que falte — mismo patrón, empresa por objetivo,
    // pero el conteo esta vez lee result[1] (rowCount real), no
    // result.rowCount (undefined sobre un array). ────────────────────────
    const empresas: { id: number }[] = await qr.query(
      `SELECT DISTINCT "empresaId" AS id FROM cuentas_contables ORDER BY 1`,
    );

    let empresasConAlgunaMarcada = 0;
    const empresasSinNinguna: number[] = [];
    const marcadasPorObjetivo: Record<string, number> = {};

    for (const { id: empresaId } of empresas) {
      let algunaMarcadaEnEstaEmpresa = false;

      for (const obj of this.OBJETIVOS) {
        const result: [unknown[], number] = await qr.query(
          `UPDATE cuentas_contables
              SET "clasificacionResultado" = 'no_operacional'
            WHERE "empresaId" = $1 AND codigo = $2 AND nombre = $3
              AND "clasificacionResultado" IS NULL
           RETURNING id`,
          [empresaId, obj.codigo, obj.nombre],
        );
        const rowCount = result[1]; // ← el fix: NO result.rowCount
        if (rowCount > 0) {
          algunaMarcadaEnEstaEmpresa = true;
          marcadasPorObjetivo[obj.codigo] = (marcadasPorObjetivo[obj.codigo] ?? 0) + 1;
        }
      }

      if (algunaMarcadaEnEstaEmpresa) empresasConAlgunaMarcada++;
      else empresasSinNinguna.push(empresaId);
    }

    console.log(
      `[VerificarClasificacionResultado] ${empresas.length} empresa(s) con catálogo — ` +
      `${empresasConAlgunaMarcada} con al menos una cuenta CORREGIDA AHORA ` +
      `(${JSON.stringify(marcadasPorObjetivo)}) — ` +
      `${empresasSinNinguna.length} sin nada que corregir (ya estaban bien, o catálogo modificado): ` +
      `[${empresasSinNinguna.join(', ')}]`,
    );

    // ── 3. Diagnóstico final — confirma el estado real después de esta migración.
    const final: { codigo: string; total: string }[] = await qr.query(`
      SELECT codigo, COUNT(*)::text AS total
        FROM cuentas_contables
       WHERE codigo = ANY($1) AND "clasificacionResultado" = 'no_operacional'
       GROUP BY codigo`,
      [this.OBJETIVOS.map(o => o.codigo)],
    );
    console.log(`[VerificarClasificacionResultado] Estado FINAL (debe cubrir casi todas las ${empresas.length} empresas por código): ${JSON.stringify(final)}`);
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo — mismo criterio que las dos migraciones anteriores.
  }
}
