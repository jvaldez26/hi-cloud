import { MigrationInterface, QueryRunner } from 'typeorm';
import '../instrument';
import { reportServiceError } from '../common/observability/sentry';

/**
 * Corrige los 13 asientos contables huérfanos (empresaId NULL) que dejó un
 * bug ya corregido en EcfEfectosNcService.aplicarEfectosPorEstado(): cuando
 * el cron de estado DGII (consultar-estado-ecf.job.ts) procesaba Notas de
 * Crédito de varias empresas en una misma pasada, el asiento propio de la NC
 * se generaba leyendo empresaId de un CLS que podía arrastrar el valor de
 * OTRA empresa de una ejecución anterior (ver el comentario de ese archivo,
 * líneas 392-403 — ya corregido con runForEmpresa(), referencia Sentry
 * #7745902796 / NC-101).
 *
 * Investigado ANTES de escribir esta migración (solo lectura en producción):
 *   - Cada asiento se identificó por el folio "NC-xxx" de su descripción,
 *     cruzado contra notas_credito por numero + total EXACTO (numero NO es
 *     único entre empresas — hay hasta 8 NC "NC-102" en empresas distintas;
 *     el total exacto desambigua sin ambigüedad en los 13 casos).
 *   - La empresa real (notas_credito.empresaId) coincide 13/13 con alguna
 *     empresa activa del usuario creador (asientos_contables.userId →
 *     usuario_empresa) — las dos fuentes se corroboran mutuamente.
 *   - La empresa deducida de las CUENTAS de las líneas (cuentas_contables.
 *     empresaId) NO coincide en 11/13 casos — es precisamente el dato
 *     contaminado por el bug de CLS, así que NO se usa como fuente.
 *   - Cada línea tiene una cuenta equivalente (mismo código) en la empresa
 *     correcta — se verificaron los 13×3 = 39 casos, todos resueltos.
 *   - El número actual (ASI-101..ASI-113) choca con un asiento YA EXISTENTE
 *     en la empresa correcta en los 13 casos (son números bajos, de cuando
 *     esa empresa recién empezaba) — se les asigna el siguiente número real
 *     de la secuencia de esa empresa vía siguiente_numero_secuencia(), y el
 *     número original queda en referenciaFolio y anotado en la descripción.
 *
 * Respaldo COMPLETO (row_to_json) de CADA fila tocada (asientos_contables y
 * asiento_lineas, antes de modificarlas) en _respaldo_asientos_huerfanos
 * (tabla, id, datos, fecha). down() restaura exactamente esos valores.
 * Idempotente: cada UPDATE solo toca una fila si todavía está en el estado
 * esperado (empresaId IS NULL / cuentaContableId = la vieja) — una segunda
 * corrida no hace nada.
 *
 * Al final, borra la fila de contadores_secuencia (empresaId=0, tipo='ASI')
 * que este mismo bug dejó — confirmado que no es un centinela ni está en
 * uso por ningún otro camino del código (ver HuerfanosAuditoriaCron).
 */
interface LineaFix { lineaId: number; cuentaNueva: number }
interface AsientoFix { asientoId: number; empresaCorrecta: number; lineas: LineaFix[] }

const ASIENTOS: AsientoFix[] = [
  { asientoId: 17261, empresaCorrecta: 73, lineas: [
    { lineaId: 51584, cuentaNueva: 4259 }, { lineaId: 51585, cuentaNueva: 4248 }, { lineaId: 51586, cuentaNueva: 4237 },
  ] },
  { asientoId: 17263, empresaCorrecta: 73, lineas: [
    { lineaId: 51590, cuentaNueva: 4259 }, { lineaId: 51591, cuentaNueva: 4248 }, { lineaId: 51592, cuentaNueva: 4237 },
  ] },
  { asientoId: 17871, empresaCorrecta: 57, lineas: [
    { lineaId: 53413, cuentaNueva: 3054 }, { lineaId: 53414, cuentaNueva: 3044 }, { lineaId: 53415, cuentaNueva: 3033 },
  ] },
  { asientoId: 17876, empresaCorrecta: 57, lineas: [
    { lineaId: 53428, cuentaNueva: 3054 }, { lineaId: 53429, cuentaNueva: 3044 }, { lineaId: 53430, cuentaNueva: 3033 },
  ] },
  { asientoId: 18163, empresaCorrecta: 44, lineas: [
    { lineaId: 54286, cuentaNueva: 2053 }, { lineaId: 54287, cuentaNueva: 2043 }, { lineaId: 54288, cuentaNueva: 2032 },
  ] },
  { asientoId: 18245, empresaCorrecta: 44, lineas: [
    { lineaId: 54529, cuentaNueva: 2053 }, { lineaId: 54530, cuentaNueva: 2043 }, { lineaId: 54531, cuentaNueva: 2032 },
  ] },
  { asientoId: 18525, empresaCorrecta: 42, lineas: [
    { lineaId: 55369, cuentaNueva: 1899 }, { lineaId: 55370, cuentaNueva: 1889 }, { lineaId: 55371, cuentaNueva: 1878 },
  ] },
  { asientoId: 19111, empresaCorrecta: 44, lineas: [
    { lineaId: 57125, cuentaNueva: 2053 }, { lineaId: 57126, cuentaNueva: 2043 }, { lineaId: 57127, cuentaNueva: 2032 },
  ] },
  { asientoId: 19144, empresaCorrecta: 44, lineas: [
    { lineaId: 57224, cuentaNueva: 2053 }, { lineaId: 57225, cuentaNueva: 2043 }, { lineaId: 57226, cuentaNueva: 2032 },
  ] },
  { asientoId: 19322, empresaCorrecta: 44, lineas: [
    { lineaId: 57758, cuentaNueva: 2053 }, { lineaId: 57759, cuentaNueva: 2043 }, { lineaId: 57760, cuentaNueva: 2032 },
  ] },
  { asientoId: 19559, empresaCorrecta: 44, lineas: [
    { lineaId: 58458, cuentaNueva: 2053 }, { lineaId: 58459, cuentaNueva: 2043 }, { lineaId: 58460, cuentaNueva: 2032 },
  ] },
  { asientoId: 19701, empresaCorrecta: 44, lineas: [
    { lineaId: 58884, cuentaNueva: 2053 }, { lineaId: 58885, cuentaNueva: 2043 }, { lineaId: 58886, cuentaNueva: 2032 },
  ] },
  { asientoId: 20192, empresaCorrecta: 61, lineas: [
    { lineaId: 60438, cuentaNueva: 3362 }, { lineaId: 60439, cuentaNueva: 3352 }, { lineaId: 60440, cuentaNueva: 3341 },
  ] },
];

export class FixAsientosHuerfanosNotaCredito1770500000000 implements MigrationInterface {
  name = 'FixAsientosHuerfanosNotaCredito1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS _respaldo_asientos_huerfanos (
        tabla VARCHAR(30)  NOT NULL,
        id    INTEGER      NOT NULL,
        datos JSONB        NOT NULL,
        fecha TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tabla, id)
      )
    `);

    let asientosCorregidos = 0;
    let lineasCorregidas = 0;

    for (const { asientoId, empresaCorrecta, lineas } of ASIENTOS) {
      // Respaldo + número nuevo, solo si el asiento sigue huérfano (idempotente).
      const asientosEncontrados: { id: number; numero: string }[] = await queryRunner.query(
        `SELECT * FROM asientos_contables WHERE id = $1 AND "empresaId" IS NULL`,
        [asientoId],
      );
      const [asiento] = asientosEncontrados;
      if (!asiento) {
        console.log(`[FixAsientosHuerfanosNotaCredito] asiento #${asientoId}: ya corregido, se salta`);
        continue;
      }

      await queryRunner.query(`
        INSERT INTO _respaldo_asientos_huerfanos (tabla, id, datos)
        SELECT 'asientos_contables', id, row_to_json(a) FROM asientos_contables a WHERE a.id = $1
        ON CONFLICT (tabla, id) DO NOTHING
      `, [asientoId]);

      const secuencia: { numero: number }[] = await queryRunner.query(
        `SELECT siguiente_numero_secuencia($1, 'ASI') AS numero`, [empresaCorrecta],
      );
      const numeroFormateado = `ASI-${secuencia[0].numero}`;

      await queryRunner.query(`
        UPDATE asientos_contables
        SET "empresaId" = $1,
            numero = $2,
            "referenciaFolio" = $3,
            descripcion = descripcion || ' [reasignado desde ' || $5 || ', empresaId era NULL]'
        WHERE id = $4
      `, [empresaCorrecta, numeroFormateado, asiento.numero, asientoId, asiento.numero]);
      asientosCorregidos++;

      for (const { lineaId, cuentaNueva } of lineas) {
        const lineasEncontradas: { id: number }[] = await queryRunner.query(
          `SELECT id FROM asiento_lineas WHERE id = $1 AND "cuentaContableId" != $2`,
          [lineaId, cuentaNueva],
        );
        if (!lineasEncontradas[0]) continue; // ya corregida (idempotente) o no existe

        await queryRunner.query(`
          INSERT INTO _respaldo_asientos_huerfanos (tabla, id, datos)
          SELECT 'asiento_lineas', id, row_to_json(al) FROM asiento_lineas al WHERE al.id = $1
          ON CONFLICT (tabla, id) DO NOTHING
        `, [lineaId]);

        await queryRunner.query(
          `UPDATE asiento_lineas SET "cuentaContableId" = $1 WHERE id = $2`,
          [cuentaNueva, lineaId],
        );
        lineasCorregidas++;
      }
    }
    console.log(`[FixAsientosHuerfanosNotaCredito] ${asientosCorregidos} asiento(s) y ${lineasCorregidas} línea(s) corregidos`);

    // contadores_secuencia (empresaId=0, tipo='ASI') — ya sin uso (ver
    // generarNumero() ahora exige empresaId, migración 1770500000000 misma
    // tanda de commits). Respaldo + borrado, idempotente.
    const filasContador: { empresaId: number }[] = await queryRunner.query(`
      WITH borrado AS (
        DELETE FROM contadores_secuencia WHERE "empresaId" = 0 AND tipo = 'ASI'
        RETURNING *
      )
      INSERT INTO _respaldo_asientos_huerfanos (tabla, id, datos)
      SELECT 'contadores_secuencia', 0, row_to_json(borrado) FROM borrado
      ON CONFLICT (tabla, id) DO NOTHING
      RETURNING 1 AS "empresaId"
    `);
    console.log(`[FixAsientosHuerfanosNotaCredito] contadores_secuencia empresaId=0: ${filasContador.length} fila eliminada`);

    // Verificación final — nunca debe quedar ningún asiento huérfano después
    // de esta migración; si queda alguno (dato nuevo entre el diagnóstico y
    // el deploy), se reporta a Sentry en vez de fallar en silencio.
    const conteoRestante: { n: number }[] = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM asientos_contables WHERE "empresaId" IS NULL`,
    );
    const huerfanosRestantes = conteoRestante[0].n;
    if (huerfanosRestantes > 0) {
      const msg = `FixAsientosHuerfanosNotaCredito: quedan ${huerfanosRestantes} asiento(s) con empresaId NULL tras la migración`;
      console.error(msg);
      reportServiceError(new Error(msg), 'migration_asientos_huerfanos_residual', {
        huerfanosRestantes: String(huerfanosRestantes),
      });
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Líneas primero (dependen del asiento solo lógicamente, no hay FK real,
    // pero restaurar en este orden deja los datos consistentes en todo momento).
    for (const { lineas } of [...ASIENTOS].reverse()) {
      for (const { lineaId } of [...lineas].reverse()) {
        const filas: { datos: unknown }[] = await queryRunner.query(
          `SELECT datos FROM _respaldo_asientos_huerfanos WHERE tabla = 'asiento_lineas' AND id = $1`,
          [lineaId],
        );
        if (!filas[0]) continue;
        await queryRunner.query(
          `UPDATE asiento_lineas SET "cuentaContableId" = ($1::jsonb->>'cuentaContableId')::int WHERE id = $2`,
          [JSON.stringify(filas[0].datos), lineaId],
        );
      }
    }

    for (const { asientoId } of [...ASIENTOS].reverse()) {
      const filas: { datos: any }[] = await queryRunner.query(
        `SELECT datos FROM _respaldo_asientos_huerfanos WHERE tabla = 'asientos_contables' AND id = $1`,
        [asientoId],
      );
      if (!filas[0]) continue;
      await queryRunner.query(
        `UPDATE asientos_contables
         SET "empresaId" = NULL, numero = $1, "referenciaFolio" = $2, descripcion = $3
         WHERE id = $4`,
        [filas[0].datos.numero, filas[0].datos.referenciaFolio, filas[0].datos.descripcion, asientoId],
      );
    }

    const filasContador: { datos: any }[] = await queryRunner.query(
      `SELECT datos FROM _respaldo_asientos_huerfanos WHERE tabla = 'contadores_secuencia' AND id = 0`,
    );
    if (filasContador[0]) {
      await queryRunner.query(`
        INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
        VALUES (0, 'ASI', $1)
        ON CONFLICT ("empresaId", tipo) DO UPDATE SET ultimo_numero = EXCLUDED.ultimo_numero
      `, [filasContador[0].datos.ultimo_numero]);
    }

    await queryRunner.query(`DELETE FROM _respaldo_asientos_huerfanos`);
  }
}
