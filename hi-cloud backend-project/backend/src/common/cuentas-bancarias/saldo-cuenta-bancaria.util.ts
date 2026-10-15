/** Lo único que hace falta de DataSource/EntityManager — así cada módulo
 *  pasa `repo.manager` (ya lo tiene) sin que haga falta inyectar DataSource. */
export interface ConQuery {
  query<T = any>(sql: string, params?: unknown[]): Promise<T>;
}

export interface DatosCuentaBancariaUnificada {
  saldoActual: number;
  nombre: string;
  banco: string;
  numeroCuenta: string;
}

/**
 * Única fuente del saldo de una cuenta bancaria — usada por el widget de
 * Inicio, por "Cuentas Bancarias & Conciliación" y por cualquier reporte
 * que necesite el saldo real. Ver incidente 2026-10-15 (empresa 53, LUBRI
 * GOMAS PEÑA CASTILLO: el widget mostraba RD$0.00 y "SCOTIABANK" genérico,
 * la pantalla de Bancos mostraba RD$16,202.56 con el nombre de la cuenta).
 * La causa de fondo (dos módulos colisionando sobre la misma tabla) queda
 * como deuda técnica documentada en docs/deuda-tecnica-bancos-tesoreria.md
 * — esto solo unifica la LECTURA, no fusiona nada.
 *
 * La tabla física `cuentas_bancarias` la comparten (por accidente
 * histórico, nunca a propósito) dos módulos backend con columnas propias:
 *
 *   - `bancos` (ver bancos/entities/cuenta-bancaria.entity.ts): registra la
 *     cuenta a mano — nombre/alias, tipo (incluye "empresarial"), un
 *     `saldoInicial` ESTÁTICO que el usuario declara, y sus propios
 *     movimientos de conciliación en `bancos_conciliacion`.
 *   - `tesoreria` (ver tesoreria/entities/cuenta-bancaria.entity.ts): un
 *     LIBRO vivo — columna `saldo` que se incrementa con cada movimiento de
 *     `movimientos_bancarios` (enganchado a CxC, CxP, nómina, depósitos y
 *     retiros manuales).
 *
 * En la práctica cada fila solo usa UNO de los dos esquemas — nunca se ha
 * visto una fila con `saldoInicial` Y `saldo` distintos de cero a la vez —
 * así que sumar las tres fuentes nunca duplica dinero real:
 *
 *   saldoActual = saldoInicial          (0 si la fila es de tesorería)
 *               + saldo                 (0 si la fila es de bancos)
 *               + créditos − débitos de bancos_conciliacion (0 si ese módulo nunca se usó)
 *
 * Esto NO fusiona los dos módulos ni toca cómo escriben sus propios saldos
 * — solo da una lectura consistente para mostrar. Devuelve también
 * nombre/banco/numeroCuenta tal como están en la fila física (sin pasar por
 * ninguna de las dos entidades, que solo mapean un subconjunto de columnas
 * cada una) para que el nombre mostrado sea siempre el mismo sin importar
 * qué módulo armó la pantalla.
 */
export async function obtenerDatosUnificadosCuentasBancarias(
  db: ConQuery,
  empresaId: number,
): Promise<Map<number, DatosCuentaBancariaUnificada>> {
  const rows = await db.query<{
    id: number; nombre: string; banco: string; numeroCuenta: string; saldoActual: string;
  }[]>(`
    SELECT
      c.id, c.nombre, c.banco, c."numeroCuenta",
      (COALESCE(c."saldoInicial", 0) + COALESCE(c.saldo, 0) + COALESCE(mc.neto, 0)) AS "saldoActual"
    FROM cuentas_bancarias c
    LEFT JOIN (
      SELECT "cuentaId",
             SUM(CASE WHEN tipo = 'credito' THEN monto ELSE -monto END) AS neto
      FROM bancos_conciliacion
      WHERE "isActive" = true
      GROUP BY "cuentaId"
    ) mc ON mc."cuentaId" = c.id
    WHERE c."empresaId" = $1
  `, [empresaId]);

  return new Map(rows.map(r => [r.id, {
    saldoActual: Number(r.saldoActual),
    nombre:      r.nombre,
    banco:       r.banco,
    numeroCuenta: r.numeroCuenta,
  }]));
}

/**
 * Cómo se muestra una cuenta bancaria en toda la app — alias/titular + banco
 * + últimos dígitos del número, NUNCA solo el nombre del banco (requisito
 * explícito: el widget mostraba "SCOTIABANK" sin decir de cuál cuenta).
 */
export function etiquetaCuentaBancaria(c: { nombre?: string | null; banco: string; numeroCuenta?: string | null }): string {
  const ultimos = (c.numeroCuenta ?? '').slice(-4);
  const sufijo  = ultimos ? ` ···${ultimos}` : '';
  const alias   = c.nombre?.trim();
  return alias ? `${alias} — ${c.banco}${sufijo}` : `${c.banco}${sufijo}`;
}
