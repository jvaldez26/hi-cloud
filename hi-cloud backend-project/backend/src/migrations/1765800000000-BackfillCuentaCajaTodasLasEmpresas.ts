import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX 3 (2026-09-20), FASE A commit 1 — pre-requisito del motor de ventas de
 * contado: si Caja (1.1.1.02) no existe en el catálogo de una empresa, el
 * nuevo `asientoFacturaEmitida()` (commit 2) no podría resolverla y el
 * asiento moriría en silencio (mismo riesgo documentado en
 * contabilidad.service.ts:256-267 y ya cerrado una vez para otros 8 códigos
 * por AgregarCuentasHuerfanasMotor1764700000000 — este es el mismo patrón,
 * un solo código).
 *
 * Caja SIEMPRE está en PLAN_CUENTAS (contabilidad.service.ts:65) — toda
 * empresa nueva la recibe vía seedPlanCuentas(). Esta migración cierra la
 * brecha para empresas que ya existían antes de que Caja se agregara al
 * seed, o cuyo seedPlanCuentas() falló silenciosamente (es fire-and-forget,
 * `.catch()` solo loguea — ver auth.service.ts:326, multi-empresa.service.ts:169).
 *
 * Alcance: TODAS las empresas activas (empresa."isActive" = true) que YA
 * TIENEN algún catálogo de cuentas (al menos una fila en cuentas_contables) —
 * a esas se les agrega Caja si falta, replicando exactamente lo que
 * etiquetarFiscalmente()/marcarCuentaSistema() le asignarían en el seed
 * normal: esCuentaSistema=true, anexoIR2='A1' (cuenta_anexo_ir2). Una
 * empresa activa SIN ningún catálogo (cuentas_contables vacío) es un
 * problema distinto y más profundo — no se re-siembra aquí, se lista aparte
 * en el log para decidir por separado.
 *
 * Idempotente: solo inserta donde (codigo, empresaId) no existe todavía.
 * Reejecutarla no duplica nada.
 */
export class BackfillCuentaCajaTodasLasEmpresas1765800000000 implements MigrationInterface {
  name = 'BackfillCuentaCajaTodasLasEmpresas1765800000000';

  private readonly CODIGO = '1.1.1.02';
  private readonly NOMBRE = 'Caja General';
  private readonly CODIGO_PADRE = '1.1.1';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    const empresasActivas: { id: number }[] = await qr.query(
      `SELECT id FROM empresa WHERE "isActive" = true ORDER BY id`,
    );

    const sinCatalogo: number[] = [];
    const agregadas: number[] = [];
    const yaTenian: number[] = [];

    for (const { id: empresaId } of empresasActivas) {
      const catalogo: { total: string }[] = await qr.query(
        `SELECT COUNT(*)::text AS total FROM cuentas_contables WHERE "empresaId" = $1`,
        [empresaId],
      );
      if (Number(catalogo[0]?.total ?? 0) === 0) {
        sinCatalogo.push(empresaId);
        continue; // empresa sin ningún catálogo — problema aparte, no se toca aquí
      }

      const existeCaja: unknown[] = await qr.query(
        `SELECT 1 FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
        [this.CODIGO, empresaId],
      );
      if (existeCaja.length > 0) {
        yaTenian.push(empresaId);
        continue;
      }

      const padreRows: { id: number }[] = await qr.query(
        `SELECT id FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
        [this.CODIGO_PADRE, empresaId],
      );
      const cuentaPadreId = padreRows[0]?.id ?? null;

      const [{ id: cuentaId }]: { id: number }[] = await qr.query(
        `INSERT INTO cuentas_contables
           (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "cuentaPadreId",
            "esCuentaSistema", "empresaId", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, 'activo', 'deudora', 4, true, $3, true, $4, true, now(), now())
         RETURNING id`,
        [this.CODIGO, this.NOMBRE, cuentaPadreId, empresaId],
      );

      // Mismo etiquetado que etiquetarFiscalmente() le da a Caja en el seed
      // normal: activo con permiteMovimientos=true → Anexo A1, sin casilla.
      await qr.query(
        `INSERT INTO cuenta_anexo_ir2
           ("cuentaContableId", "anexoIR2", "empresaId", "isActive", "createdAt", "updatedAt")
         VALUES ($1, 'A1', $2, true, now(), now())`,
        [cuentaId, empresaId],
      );

      agregadas.push(empresaId);
    }

    console.log(
      `[BackfillCuentaCajaTodasLasEmpresas] agregada en ${agregadas.length} empresa(s): [${agregadas.join(', ')}] — ` +
      `ya la tenían ${yaTenian.length} — sin catálogo (no tocadas): ${sinCatalogo.length} [${sinCatalogo.join(', ')}]`,
    );
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: para el momento de un rollback, alguna
    // empresa podría ya tener asientos reales contabilizados contra la
    // Caja recién creada (justo el propósito de esta migración, seguido
    // por el commit 2 de FASE A) — borrarla rompería la FK cuentaContableId
    // de asiento_lineas. No-op intencional, mismo criterio que
    // 1764700000000-AgregarCuentasHuerfanasMotor.
  }
}
