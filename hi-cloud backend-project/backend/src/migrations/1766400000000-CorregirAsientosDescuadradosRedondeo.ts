import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Balanza de Comprobación (2026-09-21) — PASO 0(b): 18 asientos de tipo
 * 'factura', todos de junio-julio/2026, con SUM(debe) ≠ SUM(haber) por
 * exactamente ±$0.01. Causa: `factura.total` no coincidía con
 * `subtotal + iva` en esos documentos — residuo de ANTES de que
 * descuento-documento.ts se extrajera como motor único (commit d22dfcd3,
 * 2026-09-02), que desde entonces garantiza esa igualdad por construcción.
 * Cero asientos descuadrados desde esa fecha — no es un bug activo, es
 * residuo histórico en asientos inmutables (nunca se editan, ver down()).
 *
 * Esta migración NO asume la lista fija de 18 — vuelve a calcularla en
 * vivo (criterio, no hardcode) para que corra igual de bien si aparece
 * alguno más entre el diagnóstico y el despliegue. Cualquier asiento con
 * diferencia > $0.01 se reporta y se deja intacto — no es el patrón de
 * redondeo, hace falta revisarlo a mano.
 *
 * Por cada asiento a corregir, UNA línea nueva en el MISMO asiento (nunca
 * un asiento aparte — a diferencia de la reclasificación de contado, esto
 * no es un evento económico distinto, es cerrar un residuo aritmético) a
 * la cuenta "Redondeos" de la empresa (gasto si faltaba debe, ingreso si
 * faltaba haber), creando la cuenta —y su grupo, si hace falta— cuando la
 * empresa no la tiene. asientos_contables.totalDebe/totalHaber se
 * sincronizan: obtenerAsientosDescuadrados() (Balance de Comprobación) lee
 * esas columnas guardadas, no una suma en vivo de las líneas.
 *
 * Idempotente por reverificación: antes de corregir, se vuelve a sumar
 * SUM(debe)-SUM(haber) del asiento — si ya da ~0 (esta migración ya corrió,
 * o alguien lo corrigió a mano), se salta. Sin marca dedicada: la propia
 * partida doble es la prueba de que ya está resuelto.
 */
export class CorregirAsientosDescuadradosRedondeo1766400000000 implements MigrationInterface {
  name = 'CorregirAsientosDescuadradosRedondeo1766400000000';

  private readonly TOLERANCIA_MAXIMA = 0.01;
  private readonly CODIGO_GASTO_GRUPO        = '6.1.8';
  private readonly CODIGO_GASTO_GRUPO_NOMBRE = 'Otros Gastos No Operacionales';
  private readonly CODIGO_GASTO_REDONDEOS    = '6.1.8.02';
  private readonly CODIGO_INGRESO_PADRE      = '4.2';
  private readonly CODIGO_INGRESO_REDONDEOS  = '4.2.1.05';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── 1. Diagnóstico en vivo — nunca una lista fija ──────────────────────
    const descuadrados: { id: number; empresaid: number; numero: string; diff: string }[] = await qr.query(`
      SELECT a.id, a."empresaId" AS empresaid, a.numero,
             ROUND((SUM(al.debe) - SUM(al.haber))::numeric, 2)::text AS diff
        FROM asientos_contables a
        JOIN asiento_lineas al ON al."asientoId" = a.id AND al."isActive" = true
       WHERE a."isActive" = true AND a.estado = 'contabilizado'
       GROUP BY a.id, a."empresaId", a.numero
      HAVING ABS(SUM(al.debe) - SUM(al.haber)) > 0.001
       ORDER BY a."empresaId", a.id
    `);

    const dentroDeRango = descuadrados.filter(d => Math.abs(Number(d.diff)) <= this.TOLERANCIA_MAXIMA);
    const fueraDeRango  = descuadrados.filter(d => Math.abs(Number(d.diff)) >  this.TOLERANCIA_MAXIMA);

    console.log(
      `[CorregirRedondeo] ${descuadrados.length} asiento(s) descuadrado(s) — ` +
      `${dentroDeRango.length} dentro de ±${this.TOLERANCIA_MAXIMA} (se corrigen), ` +
      `${fueraDeRango.length} fuera de rango (NUNCA se tocan)`,
    );
    if (fueraDeRango.length) {
      console.log(`[CorregirRedondeo] ⚠️  FUERA DE RANGO — revisar a mano: ${JSON.stringify(fueraDeRango)}`);
    }
    if (!dentroDeRango.length) {
      console.log('[CorregirRedondeo] Nada que corregir dentro de tolerancia — fin.');
      return;
    }

    // ── 2. Cuentas de Redondeos por empresa afectada — se resuelven una
    // sola vez por empresa, no por asiento. ────────────────────────────────
    const empresasAfectadas = [...new Set(dentroDeRango.map(d => d.empresaid))];
    const cuentaGastoPorEmpresa:   Record<number, number> = {};
    const cuentaIngresoPorEmpresa: Record<number, number> = {};
    for (const empresaId of empresasAfectadas) {
      cuentaGastoPorEmpresa[empresaId]   = await this.resolverCuentaGastoRedondeos(qr, empresaId);
      cuentaIngresoPorEmpresa[empresaId] = await this.resolverCuentaIngresoRedondeos(qr, empresaId);
    }

    // ── 3. Corregir — con reverificación en vivo antes de cada uno ────────
    let corregidos = 0;
    let saltados = 0;
    for (const d of dentroDeRango) {
      const [{ debe, haber }]: { debe: string; haber: string }[] = await qr.query(`
        SELECT COALESCE(SUM(debe),0)::text AS debe, COALESCE(SUM(haber),0)::text AS haber
          FROM asiento_lineas WHERE "asientoId" = $1 AND "isActive" = true
      `, [d.id]);
      const diffActual = +(Number(debe) - Number(haber)).toFixed(2);

      if (Math.abs(diffActual) < 0.005) {
        console.log(`[CorregirRedondeo] Asiento #${d.id} (${d.numero}) ya está cuadrado — se salta (idempotencia)`);
        saltados++;
        continue;
      }
      if (Math.abs(diffActual) > this.TOLERANCIA_MAXIMA) {
        console.log(`[CorregirRedondeo] ⚠️  Asiento #${d.id} (${d.numero}) cambió y ahora excede ${this.TOLERANCIA_MAXIMA} (${diffActual}) — se salta, revisar a mano`);
        saltados++;
        continue;
      }

      const esGasto  = diffActual < 0; // haber > debe → falta debe → Redondeos GASTO
      const cuentaId = esGasto ? cuentaGastoPorEmpresa[d.empresaid] : cuentaIngresoPorEmpresa[d.empresaid];
      const monto    = Math.abs(diffActual);

      await qr.query(`
        INSERT INTO asiento_lineas ("asientoId","cuentaContableId",descripcion,debe,haber,"empresaId","isActive")
        VALUES ($1,$2,$3,$4,$5,$6,true)
      `, [
        d.id, cuentaId,
        `Corrección de redondeo — asiento ${d.numero}`,
        esGasto ? monto : 0,
        esGasto ? 0 : monto,
        d.empresaid,
      ]);

      const nuevoTotal = Math.max(Number(debe), Number(haber)).toFixed(2);
      await qr.query(
        `UPDATE asientos_contables SET "totalDebe" = $1, "totalHaber" = $1 WHERE id = $2`,
        [nuevoTotal, d.id],
      );

      await qr.query(`
        INSERT INTO audit_logs
          (accion, modulo, entidad, "entidadId", descripcion, "valorAnterior", "valorNuevo",
           metodo, ruta, exitoso, nivel, "empresaId", "createdAt")
        VALUES
          ('update', 'contabilidad', 'AsientoContable', $1, $2, $3, $4,
           'MIGRATE', '/migrations/1766400000000', true, 'IMPORTANTE', $5, NOW())
      `, [
        String(d.id),
        `Corrección de redondeo — asiento ${d.numero}: diferencia ${diffActual.toFixed(2)} cerrada contra Redondeos (${esGasto ? 'gasto' : 'ingreso'})`,
        JSON.stringify({ totalDebe: debe, totalHaber: haber }),
        JSON.stringify({ totalDebe: nuevoTotal, totalHaber: nuevoTotal }),
        d.empresaid,
      ]);

      corregidos++;
    }

    console.log(`[CorregirRedondeo] ${corregidos} asiento(s) corregido(s), ${saltados} saltado(s), de ${dentroDeRango.length} candidato(s)`);
  }

  /** Resuelve (o crea) la cuenta "Redondeos" de gasto no operacional — código 6.1.8.02, bajo el grupo 6.1.8. */
  private async resolverCuentaGastoRedondeos(qr: QueryRunner, empresaId: number): Promise<number> {
    const [existente] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId"=$1 AND codigo=$2 AND "isActive"=true`,
      [empresaId, this.CODIGO_GASTO_REDONDEOS],
    );
    if (existente) return existente.id;

    let [grupo] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId"=$1 AND codigo=$2 AND "isActive"=true`,
      [empresaId, this.CODIGO_GASTO_GRUPO],
    );
    if (!grupo) {
      const [padre61] = await qr.query(
        `SELECT id FROM cuentas_contables WHERE "empresaId"=$1 AND codigo='6.1' AND "isActive"=true`,
        [empresaId],
      );
      const [nuevoGrupo] = await qr.query(`
        INSERT INTO cuentas_contables
          (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "clasificacionResultado", "cuentaPadreId", "empresaId")
        VALUES ($1,$2,'gasto','deudora',3,false,'no_operacional',$3,$4)
        RETURNING id
      `, [this.CODIGO_GASTO_GRUPO, this.CODIGO_GASTO_GRUPO_NOMBRE, padre61?.id ?? null, empresaId]);
      grupo = nuevoGrupo;
      console.log(`[CorregirRedondeo] Grupo ${this.CODIGO_GASTO_GRUPO} creado para empresa #${empresaId} — id ${grupo.id}`);
    }

    const [cuenta] = await qr.query(`
      INSERT INTO cuentas_contables
        (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "cuentaPadreId", "empresaId")
      VALUES ($1,'Redondeos','gasto','deudora',4,true,$2,$3)
      RETURNING id
    `, [this.CODIGO_GASTO_REDONDEOS, grupo.id, empresaId]);
    console.log(`[CorregirRedondeo] Cuenta Redondeos (gasto) ${this.CODIGO_GASTO_REDONDEOS} creada para empresa #${empresaId} — id ${cuenta.id}`);
    return cuenta.id;
  }

  /**
   * Resuelve (o crea) la cuenta "Redondeos" de ingreso no operacional —
   * código 4.2.1.05. Se parentea directo bajo 4.2 (Ingresos No
   * Operacionales): el grupo intermedio "4.2.1 Ingresos Financieros y
   * Otros" no existe en catálogos anteriores a la ampliación del catálogo
   * de esta misma sesión (commit 6f086e56) — las cuentas 4.2.1.01/.02 de
   * estas empresas ya viven así, sin padre intermedio. Corregir esa brecha
   * de jerarquía para catálogos existentes es un problema aparte, fuera de
   * alcance aquí.
   */
  private async resolverCuentaIngresoRedondeos(qr: QueryRunner, empresaId: number): Promise<number> {
    const [existente] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId"=$1 AND codigo=$2 AND "isActive"=true`,
      [empresaId, this.CODIGO_INGRESO_REDONDEOS],
    );
    if (existente) return existente.id;

    const [padre42] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId"=$1 AND codigo=$2 AND "isActive"=true`,
      [empresaId, this.CODIGO_INGRESO_PADRE],
    );
    const [cuenta] = await qr.query(`
      INSERT INTO cuentas_contables
        (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "cuentaPadreId", "empresaId")
      VALUES ($1,'Redondeos','ingreso','acreedora',4,true,$2,$3)
      RETURNING id
    `, [this.CODIGO_INGRESO_REDONDEOS, padre42?.id ?? null, empresaId]);
    console.log(`[CorregirRedondeo] Cuenta Redondeos (ingreso) ${this.CODIGO_INGRESO_REDONDEOS} creada para empresa #${empresaId} — id ${cuenta.id}`);
    return cuenta.id;
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: no hay marca que distinga la línea de
    // corrección que puso esta migración de una que alguien haya creado a
    // mano después — mismo criterio que el resto de migraciones de
    // contabilidad de esta sesión.
  }
}
