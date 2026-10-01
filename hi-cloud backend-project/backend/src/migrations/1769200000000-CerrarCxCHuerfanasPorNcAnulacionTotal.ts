import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrección de datos — bug diagnosticado 2026-10-01 (FAC-1091, empresa 73):
 * EcfEfectosNcService.aplicarEfectosPorEstado() cancelaba la factura cuando
 * una NC código 1 (anulación total) era aceptada/observada por DGII, pero
 * NUNCA tocaba la CxC vinculada (fix de código en el mismo commit). Esto dejó
 * CxC "huérfanas": factura cancelada, NC código 1 ya aplicada, pero la CxC
 * seguía pendiente/vencida con saldo, para siempre.
 *
 * Alcance confirmado en producción (solo lectura, 2026-10-01): 4 filas, las
 * 4 con montoPagado = 0 — NC-101 (empresa 51), NC-102 y NC-103 (empresa 53),
 * NC-106 (empresa 73). Ninguna con abonos aplicados.
 *
 * SOLO cierra CxC con montoPagado = 0. Si en el futuro existe alguna con
 * abonos, esta migración la deja intacta a propósito — ese caso necesita el
 * camino de saldo a favor (ver EcfEfectosNcService) y no debe resolverse con
 * un UPDATE ciego en una migración.
 *
 * Reversible de verdad: antes de tocar nada, captura el estado previo de
 * cada fila que va a cambiar en una tabla de respaldo propia de esta
 * migración; down() restaura exactamente esos valores y luego borra la
 * tabla de respaldo. Idempotente: un segundo up() no encuentra filas que
 * calcen (la condición exige estado NOT IN ('pagada','anulada'), que ya no
 * se cumple tras el primer run).
 *
 * UPDATE ... FROM con dos tablas (facturas, notas_credito) en la lista FROM
 * puede, en Postgres, emitir una fila por RETURNING por cada combinación del
 * join aunque solo exista una NC por factura — un subquery con DISTINCT ON
 * (cxc.id) elimina ese riesgo: una sola fila candidata por CxC, siempre.
 */
export class CerrarCxCHuerfanasPorNcAnulacionTotal1769200000000 implements MigrationInterface {
  name = 'CerrarCxCHuerfanasPorNcAnulacionTotal1769200000000';

  private readonly backupTable = '_bak_1769200000000_cxc_huerfanas';

  private readonly candidatas = `
    SELECT DISTINCT ON (cxc.id)
      cxc.id AS "cxcId", cxc.estado AS "estadoAnterior",
      cxc."montoPendiente" AS "montoPendienteAnterior", cxc.notas AS "notasAnterior",
      nc.numero AS "ncNumero"
    FROM cuentas_por_cobrar cxc
    JOIN facturas f       ON f.id = cxc."facturaId"
    JOIN notas_credito nc ON nc."facturaOriginalId" = f.id AND nc."isActive" = true
    WHERE f.estado = 'cancelada'
      AND nc."codigoModificacion" = '1'
      AND nc."efectosAplicados" = true
      AND cxc."isActive" = true
      AND cxc.estado NOT IN ('pagada', 'anulada')
      AND cxc."montoPendiente" > 0
      AND cxc."montoPagado" = 0
    ORDER BY cxc.id, nc.id
  `;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${this.backupTable} (
        "cxcId"                   INT PRIMARY KEY,
        "estadoAnterior"          VARCHAR(20)    NOT NULL,
        "montoPendienteAnterior"  DECIMAL(10,2)  NOT NULL,
        "notasAnterior"           TEXT
      )
    `);

    // Captura el estado ANTES de tocar nada. ON CONFLICT DO NOTHING: si esta
    // migración ya corrió una vez, no vuelve a capturar (las candidatas de
    // abajo ya no encontrarán estas filas — ver idempotencia).
    await queryRunner.query(`
      INSERT INTO ${this.backupTable} ("cxcId", "estadoAnterior", "montoPendienteAnterior", "notasAnterior")
      SELECT "cxcId", "estadoAnterior", "montoPendienteAnterior", "notasAnterior"
      FROM (${this.candidatas}) candidatas
      ON CONFLICT ("cxcId") DO NOTHING
    `);

    // UPDATE ... RETURNING vía queryRunner.query() devuelve [rows, rowCount]
    // en TypeORM/pg, NUNCA un array plano de filas — .length da siempre 2 sin
    // importar cuántas filas se tocaron. Envolver en un CTE con un SELECT
    // arriba (cuyo contrato SÍ es estable) es la forma correcta — ver memoria
    // del proyecto "TypeORM: query() y UPDATE ... RETURNING".
    const [{ n }] = await queryRunner.query(`
      WITH cerradas AS (
        UPDATE cuentas_por_cobrar cxc
        SET estado = 'anulada',
            "montoPendiente" = 0,
            notas = 'Corrección: CxC huérfana de factura anulada por NC ' || candidatas."ncNumero"
        FROM (${this.candidatas}) candidatas
        WHERE cxc.id = candidatas."cxcId"
        RETURNING cxc.id
      )
      SELECT COUNT(*)::int AS n FROM cerradas
    `);
    console.log(`[CerrarCxCHuerfanasPorNcAnulacionTotal] CxC cerradas: ${n}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      UPDATE cuentas_por_cobrar cxc
      SET estado = b."estadoAnterior"::cuentas_por_cobrar_estado_enum,
          "montoPendiente" = b."montoPendienteAnterior",
          notas = b."notasAnterior"
      FROM ${this.backupTable} b
      WHERE cxc.id = b."cxcId"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${this.backupTable}`);
  }
}
