import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige el asiento de reversa faltante de NC-101 (Sentry #7745902796,
 * 2026-09-23) — bug real de producción reportado por el usuario al revisar
 * el Balance General de "L & J LUIS SOLUCIONES ELE...": FAC-102 (RD$100.00,
 * e-CF E320000000001 aceptado por DGII) se anuló correctamente vía
 * NC-101 (código de modificación 1), pero el asiento propio de la NC
 * (Debe Ventas / Debe ITBIS por Pagar / Haber Clientes — la reversa que
 * debía dejar el efecto neto en 0) nunca se creó: EcfEfectosNcService lo
 * genera fire-and-forget desde el cron de consulta de estado DGII
 * (ConsultarEstadoECFJob), que corre SIN contexto CLS de empresa — y
 * AsientosAutomaticosService.asientoNotaCredito() lee la empresa del CLS.
 * Sin runForEmpresa() alrededor (arreglado en el mismo commit que esta
 * migración — ver ecf-efectos-nc.service.ts), _crearAsientoContabilizado
 * detectaba "eid === undefined" y omitía el asiento EN SILENCIO (nunca
 * lanza, solo reporta a Sentry) — la factura ya había quedado cancelada.
 *
 * Esta migración NO asume el id de la NC ni de la empresa — los resuelve en
 * vivo por (numero='NC-101', facturaOriginalFolio='FAC-102'), y verifica que
 * el asiento realmente falte antes de crearlo (nunca duplica). Si alguna
 * cuenta contable (Ventas/ITBIS por Pagar/Clientes) no existe en el catálogo
 * de esa empresa, no crea nada y solo deja constancia en el log — igual de
 * conservador que el propio motor de asientos.
 *
 * Alcance deliberadamente estrecho: SOLO NC-101/FAC-102, la instancia que
 * el usuario reportó y verificó a mano. El mismo bug pudo afectar otras
 * NC de otras empresas antes de este fix — un barrido general es un paso
 * aparte, a decidir con el usuario tras revisar Sentry más a fondo.
 */
export class CorregirAsientoFaltanteNotaCredito1767100000000 implements MigrationInterface {
  name = 'CorregirAsientoFaltanteNotaCredito1767100000000';

  private readonly COD_VENTAS          = '4.1.1.01';
  private readonly COD_ITBIS_POR_PAGAR = '2.1.2.01';
  private readonly COD_CLIENTES        = '1.1.2.01';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    const [nc] = await qr.query(`
      SELECT id, "empresaId", subtotal, iva, total, numero, fecha, "usuarioId"
        FROM notas_credito
       WHERE numero = 'NC-101' AND "facturaOriginalFolio" = 'FAC-102'
         AND "efectosAplicados" = true AND "isActive" = true
       LIMIT 1
    `);
    if (!nc) {
      console.log('[CorregirNC101] NC-101/FAC-102 no encontrada (numero/folio distintos, o efectos aún no aplicados) — nada que hacer.');
      return;
    }

    const [yaExiste] = await qr.query(`
      SELECT id FROM asientos_contables
       WHERE "tipoOrigen" = 'nota_credito' AND "referenciaId" = $1 AND "isActive" = true
       LIMIT 1
    `, [nc.id]);
    if (yaExiste) {
      console.log(`[CorregirNC101] NC #${nc.id} ya tiene asiento (#${yaExiste.id}) — idempotencia, no se duplica.`);
      return;
    }

    const resolverCuenta = async (concepto: string, codigoDefault: string): Promise<{ id: number; codigo: string } | null> => {
      const [override] = await qr.query(`
        SELECT "cuentaCodigo" FROM configuraciones_cuentas_contables
         WHERE "empresaId" = $1 AND concepto = $2 AND "isActive" = true
      `, [nc.empresaId, concepto]);
      const codigo = override?.cuentaCodigo ?? codigoDefault;

      const [cuenta] = await qr.query(`
        SELECT id FROM cuentas_contables
         WHERE "empresaId" = $1 AND codigo = $2 AND "isActive" = true AND "permiteMovimientos" = true
         LIMIT 1
      `, [nc.empresaId, codigo]);
      return cuenta ? { id: cuenta.id, codigo } : null;
    };

    const ventas   = await resolverCuenta('VENTAS', this.COD_VENTAS);
    const itbis    = await resolverCuenta('ITBIS_POR_PAGAR', this.COD_ITBIS_POR_PAGAR);
    const clientes = await resolverCuenta('CLIENTES', this.COD_CLIENTES);

    if (!ventas || !itbis || !clientes) {
      const faltantes = [
        !ventas   ? 'Ventas'          : null,
        !itbis    ? 'ITBIS por Pagar' : null,
        !clientes ? 'Clientes'        : null,
      ].filter(Boolean).join(', ');
      console.log(`[CorregirNC101] ⚠️  Empresa #${nc.empresaId} no tiene cuenta para: ${faltantes} — asiento NO generado, revisar Plan de Cuentas a mano.`);
      return;
    }

    const [{ numero: numeroSecuencia }] = await qr.query(
      `SELECT siguiente_numero_secuencia($1, 'ASI') AS numero`,
      [nc.empresaId],
    );
    const numeroAsiento = `ASI-${numeroSecuencia}`;
    const subtotal = Number(nc.subtotal);
    const iva      = Number(nc.iva);
    const total    = Number(nc.total);

    if (Math.abs(subtotal + iva - total) > 0.01) {
      console.log(`[CorregirNC101] ⚠️  NC #${nc.id}: subtotal(${subtotal})+iva(${iva}) ≠ total(${total}) — descuadrado, asiento NO generado, revisar a mano.`);
      return;
    }

    const [asiento] = await qr.query(`
      INSERT INTO asientos_contables
        (numero, fecha, descripcion, "tipoOrigen", "referenciaId", "referenciaFolio",
         estado, "totalDebe", "totalHaber", "userId", "empresaId", "isActive")
      VALUES ($1, CURRENT_DATE, $2, 'nota_credito', $3, $4, 'contabilizado', $5, $5, $6, $7, true)
      RETURNING id
    `, [
      numeroAsiento,
      `Nota de crédito ${nc.numero} (corrección — asiento faltante por bug del cron, ver 1767100000000)`,
      nc.id, nc.numero,
      total.toFixed(2),
      nc.usuarioId, nc.empresaId,
    ]);

    await qr.query(`
      INSERT INTO asiento_lineas ("asientoId", "cuentaContableId", descripcion, debe, haber, "empresaId", "isActive")
      VALUES
        ($1, $2, $3, $4, 0, $7, true),
        ($1, $5, $6, $8, 0, $7, true),
        ($1, $9, $10, 0, $11, $7, true)
    `, [
      asiento.id,
      ventas.id,   `Reversa venta — NC ${nc.numero}`, subtotal.toFixed(2),
      itbis.id,    `Reversa ITBIS — NC ${nc.numero}`,
      nc.empresaId,
      iva.toFixed(2),
      clientes.id, `Nota de crédito ${nc.numero}`,
      total.toFixed(2),
    ]);

    await qr.query(`
      INSERT INTO audit_logs
        (accion, modulo, entidad, "entidadId", descripcion, "valorAnterior", "valorNuevo",
         metodo, ruta, exitoso, nivel, "empresaId", "createdAt")
      VALUES
        ('create', 'contabilidad', 'AsientoContable', $1, $2, $3, $4,
         'MIGRATE', '/migrations/1767100000000', true, 'IMPORTANTE', $5, NOW())
    `, [
      String(asiento.id),
      `Asiento correctivo ${numeroAsiento} para NC-101 (FAC-102) — asiento faltante por bug del cron de consulta DGII (Sentry #7745902796)`,
      JSON.stringify({ asientoExistente: false }),
      JSON.stringify({ asientoId: asiento.id, numero: numeroAsiento, debe: (subtotal + iva).toFixed(2), haber: total.toFixed(2) }),
      nc.empresaId,
    ]);

    console.log(`[CorregirNC101] Asiento ${numeroAsiento} (#${asiento.id}) creado para NC #${nc.id} — Debe Ventas ${subtotal.toFixed(2)}, Debe ITBIS ${iva.toFixed(2)}, Haber Clientes ${total.toFixed(2)}.`);
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: los asientos son inmutables por convención
    // en todo el proyecto (nunca se editan/borran, solo se reversan con un
    // contra-asiento nuevo) — mismo criterio que el resto de las migraciones
    // de corrección contable de esta sesión.
  }
}
