import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Borra el `rncReceptor` de los clientes donde quedó cargado el RNC de la
 * PROPIA empresa emisora.
 *
 * QUÉ PASÓ: en la empresa 62 (INVENSEM SRL, RNC 133656914) alguien copió el RNC
 * de la empresa al campo "RNC Receptor" de 5 de sus clientes. Como el e-CF y el
 * 607 resuelven el RNC del comprador con COALESCE(rncReceptor, rfc), esos
 * clientes habrían declarado al emisor como comprador de su propia venta.
 *
 * ALCANCE: se revisó la tabla completa — el problema estaba solo en esa empresa,
 * pero la condición se escribe general para cubrir cualquier caso equivalente
 * que exista al momento de correr la migración.
 *
 * No llegó a DGII: esas facturas no tienen e-CF emitido (la empresa no tenía
 * configuración e-CF activa). Se limpia antes de que eso cambie.
 *
 * El `rfc` de cada cliente ya tiene su RNC correcto, así que basta con vaciar
 * `rncReceptor` para que el COALESCE resuelva bien.
 */
export class LimpiarRncReceptorDelEmisor1755020000000 implements MigrationInterface {
  name = 'LimpiarRncReceptorDelEmisor1755020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Se deja rastro del valor borrado por si hiciera falta auditarlo
    await queryRunner.query(`
      UPDATE clientes cl
      SET notas = COALESCE(NULLIF(btrim(cl.notas), '') || E'\\n', '')
                  || '[migr-rncreceptor] Se borró rncReceptor='
                  || cl."rncReceptor" || ' (era el RNC de la propia empresa)'
      FROM empresa e
      WHERE e.id = cl."empresaId"
        AND btrim(COALESCE(cl."rncReceptor", '')) <> ''
        AND regexp_replace(cl."rncReceptor", '\\D', '', 'g')
            = regexp_replace(COALESCE(e.rnc, ''), '\\D', '', 'g')
    `);

    await queryRunner.query(`
      UPDATE clientes cl
      SET "rncReceptor" = NULL
      FROM empresa e
      WHERE e.id = cl."empresaId"
        AND btrim(COALESCE(cl."rncReceptor", '')) <> ''
        AND regexp_replace(cl."rncReceptor", '\\D', '', 'g')
            = regexp_replace(COALESCE(e.rnc, ''), '\\D', '', 'g')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Restaura desde el rastro dejado en notas
    await queryRunner.query(`
      UPDATE clientes
      SET "rncReceptor" = substring(notas from '\\[migr-rncreceptor\\] Se borró rncReceptor=(\\d+)')
      WHERE notas LIKE '%[migr-rncreceptor] Se borró rncReceptor=%'
    `);

    await queryRunner.query(`
      UPDATE clientes
      SET notas = NULLIF(
            btrim(regexp_replace(
              notas,
              E'\\n?\\\\[migr-rncreceptor\\\\] Se borró rncReceptor=[^\\n]*', '', 'g')),
            ''
          )
      WHERE notas LIKE '%[migr-rncreceptor] Se borró rncReceptor=%'
    `);
  }
}
