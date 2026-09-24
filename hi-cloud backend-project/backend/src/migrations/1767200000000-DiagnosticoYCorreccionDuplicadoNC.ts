import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sigue a 1767100000000 (CorregirAsientoFaltanteNotaCredito) — esa
 * migración resolvió NC-101/FAC-102 con un WHERE por numero+folio, SIN
 * empresaId (no lo tenía). El log del deploy mostró que encontró NC #54
 * (total RD$33,700.80) — una empresa DISTINTA de "L & J LUIS SOLUCIONES
 * ELÉCTRICAS" (la que el usuario reportó, con un caso de RD$100.00): el
 * folio NC-101/FAC-102 no es único entre empresas, cada una numera su
 * propia secuencia.
 *
 * Dos cosas pendientes, ambas diagnosticadas ANTES de corregir nada más:
 *
 * 1. Verificar si el asiento #21287 que esa migración le creó a NC #54 es
 *    un DUPLICADO: esa migración tampoco replicó el guard de
 *    ecf-efectos-nc.service.ts que exime el asiento propio de la NC cuando
 *    viene de una devolución (esa ya trae su propio asiento vía
 *    asientoDevolucionVenta — tipoOrigen='ajuste', referenciaId=devolucion.id,
 *    NUNCA 'nota_credito'). Si NC #54 viene de una devolución que YA tiene
 *    ese asiento, #21287 sobra — se desactiva aquí, con su línea de auditoría.
 *
 * 2. Listar (sin escribir nada) TODAS las notas_credito 'NC-101' sobre
 *    'FAC-102' con su empresa, si ya tienen asiento propio, y si vienen de
 *    una devolución — para encontrar la de L & J LUIS SOLUCIONES ELÉCTRICAS
 *    por evidencia, no por otra coincidencia de folio. La corrección real
 *    de esa empresa queda para una migración aparte, ya con el id exacto.
 */
export class DiagnosticoYCorreccionDuplicadoNC1767200000000 implements MigrationInterface {
  name = 'DiagnosticoYCorreccionDuplicadoNC1767200000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── 1. ¿El asiento #21287 (NC #54) es un duplicado de una reversa que
    // ya existe vía devolución? ────────────────────────────────────────────
    const [nc54] = await qr.query(`
      SELECT id, "empresaId", numero, "facturaOriginalFolio", total
        FROM notas_credito WHERE id = 54
    `);
    if (!nc54) {
      console.log('[Diagnostico] NC #54 no encontrada — nada que verificar.');
    } else {
      console.log(`[Diagnostico] NC #54: empresa #${nc54.empresaId}, numero=${nc54.numero}, factura=${nc54.facturaOriginalFolio}, total=${nc54.total}`);

      const [devRow] = await qr.query(`
        SELECT id FROM devoluciones WHERE "notaCreditoId" = 54 AND "isActive" = true LIMIT 1
      `);

      if (!devRow) {
        console.log('[Diagnostico] NC #54 no viene de una devolución — el asiento #21287 (vía nota_credito directa) era correcto. Se mantiene.');
      } else {
        const [asientoAjuste] = await qr.query(`
          SELECT id FROM asientos_contables
           WHERE "tipoOrigen" = 'ajuste' AND "referenciaId" = $1 AND "isActive" = true
           LIMIT 1
        `, [devRow.id]);

        if (!asientoAjuste) {
          console.log(`[Diagnostico] NC #54 viene de la devolución #${devRow.id}, pero esa devolución NO tiene su propio asiento — el #21287 sí hacía falta. Se mantiene.`);
        } else {
          console.log(`[Diagnostico] ⚠️  NC #54 viene de la devolución #${devRow.id}, que YA tiene su asiento propio (#${asientoAjuste.id}, tipoOrigen=ajuste). El asiento #21287 es un DUPLICADO — desactivando.`);

          const [yaDesactivado] = await qr.query(`SELECT "isActive" FROM asientos_contables WHERE id = 21287`);
          if (yaDesactivado && yaDesactivado.isActive === false) {
            console.log('[Diagnostico] Asiento #21287 ya estaba desactivado — idempotencia, no se repite.');
          } else {
            await qr.query(`UPDATE asientos_contables SET "isActive" = false WHERE id = 21287`);
            await qr.query(`UPDATE asiento_lineas SET "isActive" = false WHERE "asientoId" = 21287`);
            await qr.query(`
              INSERT INTO audit_logs
                (accion, modulo, entidad, "entidadId", descripcion, "valorAnterior", "valorNuevo",
                 metodo, ruta, exitoso, nivel, "empresaId", "createdAt")
              VALUES
                ('update', 'contabilidad', 'AsientoContable', '21287', $1, $2, $3,
                 'MIGRATE', '/migrations/1767200000000', true, 'IMPORTANTE', $4, NOW())
            `, [
              `Asiento #21287 desactivado: DUPLICADO — NC #54 viene de la devolución #${devRow.id}, ` +
              `que ya tenía su propio asiento de reversa (ajuste #${asientoAjuste.id}). Creado por error en ` +
              `1767100000000, que no replicó el guard de ecf-efectos-nc.service.ts para NC nacidas de una devolución.`,
              JSON.stringify({ isActive: true }),
              JSON.stringify({ isActive: false }),
              nc54.empresaId,
            ]);
            console.log('[Diagnostico] Asiento #21287 y sus líneas desactivados.');
          }
        }
      }
    }

    // ── 2. Censo: todas las NC-101 sobre FAC-102, por empresa (solo lectura) ─
    const candidatas = await qr.query(`
      SELECT nc.id, nc."empresaId" AS empresaid, e.nombre AS empresa_nombre, nc.total,
             nc."efectosAplicados" AS efectosaplicados,
             EXISTS(
               SELECT 1 FROM asientos_contables a
                WHERE a."tipoOrigen" = 'nota_credito' AND a."referenciaId" = nc.id AND a."isActive" = true
             ) AS tiene_asiento_nc,
             (SELECT d.id FROM devoluciones d WHERE d."notaCreditoId" = nc.id AND d."isActive" = true LIMIT 1) AS devolucion_id
        FROM notas_credito nc
        JOIN empresa e ON e.id = nc."empresaId"
       WHERE nc.numero = 'NC-101' AND nc."facturaOriginalFolio" = 'FAC-102' AND nc."isActive" = true
    `);
    console.log(`[Diagnostico] ${candidatas.length} NC 'NC-101' sobre 'FAC-102' en total:`);
    for (const c of candidatas) {
      console.log(
        `[Diagnostico]   NC #${c.id} — empresa #${c.empresaid} (${c.empresa_nombre}) — total=${c.total} — ` +
        `efectosAplicados=${c.efectosaplicados} — tieneAsientoNC=${c.tiene_asiento_nc} — devolucionId=${c.devolucion_id ?? 'ninguna'}`,
      );
    }
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo — mismo criterio que 1767100000000: los
    // asientos son inmutables por convención, y esta migración solo
    // desactiva (nunca borra) lo que la anterior creó de más.
  }
}
