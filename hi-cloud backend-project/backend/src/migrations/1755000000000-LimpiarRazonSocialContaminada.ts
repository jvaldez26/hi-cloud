import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deja `clientes.razonSocial` disponible como RAZÓN SOCIAL FISCAL (DGII).
 *
 * CONTEXTO: la columna existía desde siempre pero NINGÚN código la leía — el
 * e-CF siempre armó el RazonSocialComprador a partir de `nombre`. Al ser un
 * campo huérfano, los usuarios la llenaron como "nombre corto / apodo":
 *
 *     nombre                                    razonSocial
 *     AYUNTAMIENTO MUNICIPAL DE LOS ALCARRIZOS  AMA
 *     HIPERMERCADOS OLE SA                      hipermercados ole
 *     BLAJIM SRL                                BLAJIM
 *
 * A partir de ahora el e-CF lee `razonSocial ?? nombre`. Si dejáramos esos
 * valores, esos clientes empezarían a declarar "AMA" ante DGII. Por eso aquí
 * se vacían, preservando el apodo en `notas` para no perder el dato.
 *
 * Criterio de "contaminada": razonSocial poblada Y distinta de nombre. Se
 * revisaron las filas afectadas en producción una por una — todas eran el
 * nombre sin sufijo societario, siglas, o el mismo nombre en minúsculas.
 * Ninguna era una razón social más completa que `nombre`.
 *
 * Las filas donde razonSocial == nombre se dejan intactas: son redundantes
 * pero inocuas (`razonSocial ?? nombre` da el mismo resultado).
 */
export class LimpiarRazonSocialContaminada1755000000000 implements MigrationInterface {
  name = 'LimpiarRazonSocialContaminada1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Preservar el apodo en notas antes de vaciarlo. El marcador
    // "[migr-razonsocial]" permite localizarlos después y revertir.
    await queryRunner.query(`
      UPDATE clientes
      SET notas = COALESCE(NULLIF(btrim(notas), '') || E'\\n', '')
                  || '[migr-razonsocial] Nombre corto: ' || btrim("razonSocial")
      WHERE btrim(COALESCE("razonSocial", '')) <> ''
        AND btrim("razonSocial") <> btrim(nombre)
    `);

    await queryRunner.query(`
      UPDATE clientes
      SET "razonSocial" = NULL
      WHERE btrim(COALESCE("razonSocial", '')) <> ''
        AND btrim("razonSocial") <> btrim(nombre)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Restaurar razonSocial desde el marcador dejado en notas
    await queryRunner.query(`
      UPDATE clientes
      SET "razonSocial" = btrim(
            substring(notas from '\\[migr-razonsocial\\] Nombre corto: ([^\\n]*)')
          )
      WHERE notas LIKE '%[migr-razonsocial] Nombre corto: %'
    `);

    // Quitar la línea marcada de notas
    await queryRunner.query(`
      UPDATE clientes
      SET notas = NULLIF(
            btrim(regexp_replace(notas, E'\\n?\\\\[migr-razonsocial\\\\] Nombre corto: [^\\n]*', '', 'g')),
            ''
          )
      WHERE notas LIKE '%[migr-razonsocial] Nombre corto: %'
    `);
  }
}
