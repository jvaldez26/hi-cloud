import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierre del censo de 1767200000000: de las 4 NC 'NC-101'/'FAC-102' que
 * existen en todo el sistema, NC #54 (empresa #51) ya se descartó como
 * correcta (asiento propio, no viene de devolución). Quedan tres casos
 * reales, cada uno con su reversa exacta:
 *
 * 1. NC #176 (empresa #76, L & J LUIS SOLUCIONES ELÉCTRICAS SRL — el caso
 *    que el usuario reportó, RD$100.00) viene de la devolución #20. Su
 *    reversa NO es un asiento 'nota_credito' — es el de la devolución
 *    (tipoOrigen='ajuste', referenciaId=20, ver asientoDevolucionVenta en
 *    asientos-automaticos.service.ts) — y ese es el que falta.
 *
 * 2. NC #63 (empresa #59, PRO LIMPIA CASADA SRL, RD$2,950.00) y
 * 3. NC #155 (empresa #73, VENTAS DIVERSAS ELIDO, RD$475.01)
 *    no vienen de una devolución — su reversa es el asiento propio de la
 *    NC (tipoOrigen='nota_credito'), el mismo patrón que 1767100000000 ya
 *    aplicó correctamente para NC #54.
 *
 * Todo resuelto por ID exacto (censo previo), nunca por folio — ese fue el
 * error de 1767100000000. Cada bloque verifica de nuevo en vivo que el
 * asiento siga faltando (idempotencia) antes de crear nada.
 */
export class CorregirAsientosFaltantesNC176NC63NC1551767300000000 implements MigrationInterface {
  name = 'CorregirAsientosFaltantesNC176NC63NC1551767300000000';

  private readonly COD_VENTAS          = '4.1.1.01';
  private readonly COD_ITBIS_POR_PAGAR = '2.1.2.01';
  private readonly COD_CLIENTES        = '1.1.2.01';

  private async resolverCuenta(qr: QueryRunner, empresaId: number, concepto: string, codigoDefault: string): Promise<{ id: number; codigo: string } | null> {
    const [override] = await qr.query(`
      SELECT "cuentaCodigo" FROM configuraciones_cuentas_contables
       WHERE "empresaId" = $1::integer AND concepto = $2 AND "isActive" = true
    `, [empresaId, concepto]);
    const codigo = override?.cuentaCodigo ?? codigoDefault;

    const [cuenta] = await qr.query(`
      SELECT id FROM cuentas_contables
       WHERE "empresaId" = $1::integer AND codigo = $2 AND "isActive" = true AND "permiteMovimientos" = true
       LIMIT 1
    `, [empresaId, codigo]);
    return cuenta ? { id: cuenta.id, codigo } : null;
  }

  /** Crea el asiento de reversa (Debe Ventas / Debe ITBIS por Pagar / Haber Clientes) y su línea de auditoría. Devuelve el id o null si faltó alguna cuenta. */
  private async crearAsientoReversa(qr: QueryRunner, args: {
    empresaId: number; tipoOrigen: string; referenciaId: number; referenciaFolio: string;
    descripcion: string; subtotal: number; iva: number; total: number; fecha: string; userId: number;
    origenLog: string;
  }): Promise<number | null> {
    const { empresaId, tipoOrigen, referenciaId, referenciaFolio, descripcion, subtotal, iva, total, fecha, userId, origenLog } = args;

    if (Math.abs(subtotal + iva - total) > 0.01) {
      console.log(`[${origenLog}] ⚠️  subtotal(${subtotal})+iva(${iva}) ≠ total(${total}) — descuadrado, asiento NO generado.`);
      return null;
    }

    const ventas   = await this.resolverCuenta(qr, empresaId, 'VENTAS', this.COD_VENTAS);
    const itbis    = await this.resolverCuenta(qr, empresaId, 'ITBIS_POR_PAGAR', this.COD_ITBIS_POR_PAGAR);
    const clientes = await this.resolverCuenta(qr, empresaId, 'CLIENTES', this.COD_CLIENTES);
    if (!ventas || !itbis || !clientes) {
      const faltantes = [!ventas ? 'Ventas' : null, !itbis ? 'ITBIS por Pagar' : null, !clientes ? 'Clientes' : null].filter(Boolean).join(', ');
      console.log(`[${origenLog}] ⚠️  Empresa #${empresaId} no tiene cuenta para: ${faltantes} — asiento NO generado.`);
      return null;
    }

    const [{ numero: numeroSecuencia }] = await qr.query(`SELECT siguiente_numero_secuencia($1::integer, 'ASI') AS numero`, [empresaId]);
    const numeroAsiento = `ASI-${numeroSecuencia}`;

    const [asiento] = await qr.query(`
      INSERT INTO asientos_contables
        (numero, fecha, descripcion, "tipoOrigen", "referenciaId", "referenciaFolio",
         estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
      VALUES ($1, $2::date, $3, $4, $5::integer, $6, 'contabilizado', $7, $7, $8::integer, $9::integer, true)
      RETURNING id
    `, [numeroAsiento, fecha, descripcion, tipoOrigen, referenciaId, referenciaFolio, total.toFixed(2), userId, empresaId]);

    await qr.query(`
      INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId", "isActive")
      VALUES
        ($1::integer, $2::integer, $3, $4, 0, $9::integer, true),
        ($1::integer, $5::integer, $6, $7, 0, $9::integer, true),
        ($1::integer, $8::integer, $10, 0, $11, $9::integer, true)
    `, [
      asiento.id,
      ventas.id, `Reversa venta — ${referenciaFolio}`, subtotal.toFixed(2),
      itbis.id, `Reversa ITBIS — ${referenciaFolio}`, iva.toFixed(2),
      clientes.id,
      empresaId,
      `Nota de crédito ${referenciaFolio}`, total.toFixed(2),
    ]);

    await qr.query(`
      INSERT INTO audit_logs
        (accion, modulo, entidad, "entidadId", descripcion, "valorAnterior", "valorNuevo",
         metodo, ruta, exitoso, nivel, "empresaId", "createdAt")
      VALUES ('create', 'contabilidad', 'AsientoContable', $1, $2, $3, $4,
              'MIGRATE', '/migrations/1767300000000', true, 'IMPORTANTE', $5::integer, NOW())
    `, [
      String(asiento.id),
      `Asiento correctivo ${numeroAsiento} (${origenLog}) — ver 1767300000000.`,
      JSON.stringify({ asientoExistente: false }),
      JSON.stringify({ asientoId: asiento.id, numero: numeroAsiento, tipoOrigen, referenciaId, debe: total.toFixed(2), haber: total.toFixed(2) }),
      empresaId,
    ]);

    console.log(`[${origenLog}] Asiento ${numeroAsiento} (#${asiento.id}) creado — Debe Ventas ${subtotal.toFixed(2)}, Debe ITBIS ${iva.toFixed(2)}, Haber Clientes ${total.toFixed(2)}.`);
    return asiento.id;
  }

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── Caso 1: NC #176 ↔ devolución #20 (L & J LUIS SOLUCIONES ELÉCTRICAS) ─
    //
    // ¿Cuál de las dos debía llevar la reversa? Depende de QUIÉN generó a
    // QUIÉN — devoluciones."generadaDesdeNc" es la única marca que lo dice
    // (devoluciones.service.ts:74-91):
    //   - generadaDesdeNc = true  → la devolución nació DE la NC (flujo
    //     NC código 1 → cron confirma DGII → ecf-efectos-nc.service.ts
    //     genera el asiento de la NC Y crea la devolución después, fire-
    //     and-forget). La reversa es el asiento de la NC (tipoOrigen=
    //     'nota_credito', referenciaId=176) — el que el bug del cron pudo
    //     omitir. La devolución NUNCA tiene asiento propio en este camino
    //     (devoluciones.service.ts:337-350, "Su NC y el asiento de esa NC
    //     ya existen... Solo queda marcarla procesada").
    //   - generadaDesdeNc = false → la devolución se procesó a mano PRIMERO
    //     (procesar()), generó su propio asiento (asientoDevolucionVenta,
    //     tipoOrigen='ajuste', referenciaId=20) Y la NC como consecuencia.
    //     Ahí la reversa es la de la devolución, no la de la NC — y ESTE
    //     camino nunca pasa por el cron, así que el bug de CLS no debería
    //     tocarlo (si falta, es un problema distinto).
    const [dev20] = await qr.query(`
      SELECT id, "empresaId", numero, subtotal, iva, total, fecha, "userId", "generadaDesdeNc"
        FROM devoluciones WHERE id = 20 AND "isActive" = true
    `);
    const [nc176] = await qr.query(`
      SELECT id, "empresaId", numero, subtotal, iva, total, fecha, "usuarioId"
        FROM notas_credito WHERE id = 176 AND "isActive" = true
    `);
    if (!dev20 || !nc176) {
      console.log(`[NC176/Dev20] ${!dev20 ? 'Devolución #20' : 'NC #176'} no encontrada — nada que hacer.`);
    } else {
      console.log(`[NC176/Dev20] devoluciones.generadaDesdeNc = ${dev20.generadaDesdeNc}`);

      if (dev20.generadaDesdeNc === true) {
        // La reversa es el asiento de la NC.
        const [yaExiste] = await qr.query(`
          SELECT id FROM asientos_contables
           WHERE "tipoOrigen" = 'nota_credito' AND "referenciaId" = $1::integer AND "isActive" = true LIMIT 1
        `, [nc176.id]);
        if (yaExiste) {
          console.log(`[NC176/Dev20] NC #176 ya tiene asiento (#${yaExiste.id}) — idempotencia, no se duplica.`);
        } else {
          await this.crearAsientoReversa(qr, {
            empresaId: nc176.empresaId, tipoOrigen: 'nota_credito', referenciaId: nc176.id, referenciaFolio: nc176.numero,
            descripcion: `Nota de crédito ${nc176.numero} (corrección — asiento faltante, ver 1767300000000)`,
            subtotal: Number(nc176.subtotal), iva: Number(nc176.iva), total: Number(nc176.total),
            fecha: (nc176.fecha instanceof Date ? nc176.fecha.toISOString().slice(0, 10) : String(nc176.fecha)),
            userId: nc176.usuarioId, origenLog: 'NC176/Dev20 (generadaDesdeNc=true → asiento de la NC)',
          });
        }
      } else {
        // La reversa es el asiento de la devolución.
        const [yaExiste] = await qr.query(`
          SELECT id FROM asientos_contables
           WHERE "tipoOrigen" = 'ajuste' AND "referenciaId" = $1::integer AND "isActive" = true LIMIT 1
        `, [dev20.id]);
        if (yaExiste) {
          console.log(`[NC176/Dev20] Devolución #20 ya tiene asiento (#${yaExiste.id}) — idempotencia, no se duplica.`);
        } else {
          await this.crearAsientoReversa(qr, {
            empresaId: dev20.empresaId, tipoOrigen: 'ajuste', referenciaId: dev20.id, referenciaFolio: dev20.numero,
            descripcion: `Devolución de venta ${dev20.numero} (corrección — ver 1767300000000)`,
            subtotal: Number(dev20.subtotal), iva: Number(dev20.iva), total: Number(dev20.total),
            fecha: (dev20.fecha instanceof Date ? dev20.fecha.toISOString().slice(0, 10) : String(dev20.fecha)),
            userId: dev20.userId, origenLog: 'NC176/Dev20 (generadaDesdeNc=false → asiento de la devolución)',
          });
        }
      }
    }

    // ── Casos 2 y 3: NC #63 y NC #155 — asiento propio de la NC ─────────────
    for (const ncId of [63, 155]) {
      const [nc] = await qr.query(`
        SELECT id, "empresaId", numero, subtotal, iva, total, fecha, "usuarioId", "efectosAplicados"
          FROM notas_credito WHERE id = $1::integer AND "isActive" = true
      `, [ncId]);
      if (!nc) {
        console.log(`[NC${ncId}] No encontrada — nada que hacer.`);
        continue;
      }
      if (nc.efectosAplicados !== true) {
        console.log(`[NC${ncId}] efectosAplicados no es true — no se toca (DGII aún no la confirmó).`);
        continue;
      }
      const [tieneDevolucion] = await qr.query(`
        SELECT id FROM devoluciones WHERE "notaCreditoId"::text = $1::text AND "isActive" = true LIMIT 1
      `, [nc.id]);
      if (tieneDevolucion) {
        console.log(`[NC${ncId}] Viene de la devolución #${tieneDevolucion.id} — su reversa es la de esa devolución, no la propia. Revisar aparte.`);
        continue;
      }
      const [yaExiste] = await qr.query(`
        SELECT id FROM asientos_contables
         WHERE "tipoOrigen" = 'nota_credito' AND "referenciaId" = $1::integer AND "isActive" = true LIMIT 1
      `, [nc.id]);
      if (yaExiste) {
        console.log(`[NC${ncId}] Ya tiene asiento (#${yaExiste.id}) — idempotencia, no se duplica.`);
        continue;
      }
      await this.crearAsientoReversa(qr, {
        empresaId: nc.empresaId, tipoOrigen: 'nota_credito', referenciaId: nc.id, referenciaFolio: nc.numero,
        descripcion: `Nota de crédito ${nc.numero} (corrección — asiento faltante, ver 1767300000000)`,
        subtotal: Number(nc.subtotal), iva: Number(nc.iva), total: Number(nc.total),
        fecha: (nc.fecha instanceof Date ? nc.fecha.toISOString().slice(0, 10) : String(nc.fecha)),
        userId: nc.usuarioId, origenLog: `NC${ncId}`,
      });
    }
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo — los asientos son inmutables por convención
    // en todo el proyecto, mismo criterio que el resto de esta serie.
  }
}
