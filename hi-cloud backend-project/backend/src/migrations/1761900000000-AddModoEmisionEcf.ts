import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ecf."modoEmision"`: en qué ambiente se emitió cada comprobante.
 *
 * Hace falta para la cuota de e-CF. La regla de negocio es que un e-CF emitido
 * en modo TEST no cuenta —no llega a la DGII, y cobrar por él haría discutible
 * todo el cargo— pero hasta ahora esa información no estaba en ningún sitio
 * utilizable:
 *
 * - `empresa_ecf_config.modo` es el modo ACTUAL de la empresa, no el de la
 *   emisión. Las empresas 54 y 57 están hoy en TEST con 21 y 65 comprobantes;
 *   el día que pasen a PRODUCCIÓN, esos 86 empezarían a contar retroactivamente
 *   en ciclos ya cerrados, que son justo los que el panel ofrece cobrar.
 *
 * - `qrUrl` NO sirve de discriminador, aunque lo parezca: comprobado sobre las
 *   14.626 filas con QR, los dos modos producen los mismos dos hosts
 *   (`fc.dgii.gov.do` y `ecf.dgii.gov.do`). No hay nada en la respuesta de
 *   MSeller que distinga el ambiente.
 *
 * El ambiente es una propiedad de la emisión, así que va en la fila de la
 * emisión. A partir de aquí es exacto por construcción.
 *
 * Backfill: el modo actual de la empresa. Cubre el 100% de las filas —las
 * 14.628 pertenecen a las 11 empresas con configuración— y es correcto en las
 * dos direcciones: las 9 empresas en PRODUCCIÓN llevan ahí desde su primera
 * emisión (lo prueban 14.581 aceptados por la DGII) y las 2 en TEST nunca han
 * salido de TEST. Reparto resultante: 14.542 PRODUCCION / 86 TEST. Es la única
 * vez que este dato se puede deducir; de ahí en adelante lo escribe
 * `emitir-ecf.use-case.ts` con el `config.modo` que usó para emitir.
 *
 * Queda NOT NULL con DEFAULT 'PRODUCCION'. La regla que se quería —que una
 * marca ausente NO exima de la cuota— la impone así el esquema en vez de un
 * `OR "modoEmision" IS NULL` repetido en cada consulta. Y no es cosmético: con
 * ese OR el planificador no puede usar la columna como clave del índice y el
 * conteo del peor ciclo se iba a Seq Scan (11,9 ms contra los 2,1 ms del Index
 * Only Scan). Con la columna obligatoria, el predicado es una igualdad simple y
 * el índice compuesto de abajo lo cubre entero.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy.
 */
export class AddModoEmisionEcf1761900000000 implements MigrationInterface {
  name = 'AddModoEmisionEcf1761900000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // NOT NULL DEFAULT en el propio ADD COLUMN, y no una columna nullable que
    // se rellena después. Desde PostgreSQL 11 un default CONSTANTE se guarda en
    // el catálogo y la tabla NO se reescribe: es metadato, instantáneo.
    //
    // La diferencia importa y está medida. Rellenar las 14.628 filas con un
    // UPDATE deja 14.628 tuplas muertas y destruye el mapa de visibilidad de
    // `ecf`, que es la tabla más caliente del sistema. Con el mapa sucio, el
    // conteo del ciclo pasa de Index Only Scan con 0 heap fetches (1,8 ms) a
    // recorrer 5.829 bloques (16 ms), y así se queda hasta que pase autovacuum.
    // Por 86 filas que corregir no vale la pena reescribir 14.628.
    await qr.query(`
      ALTER TABLE "ecf"
        ADD COLUMN IF NOT EXISTS "modoEmision" VARCHAR(15) NOT NULL DEFAULT 'PRODUCCION'
    `);

    // Solo las que NO son de producción: hoy 86 filas de las empresas 54 y 57,
    // ambas en TEST. El default ya dejó bien a las otras 14.542.
    //
    // Asumir PRODUCCIÓN por defecto es el lado correcto en el que equivocarse:
    // contar de más se discute con el cliente, no contar lo consumido se pierde
    // sin que nadie se entere.
    await qr.query(`
      UPDATE "ecf" e
         SET "modoEmision" = cfg."modo"
        FROM "empresa_ecf_config" cfg
       WHERE cfg."empresaId" = e."empresaId"
         AND cfg."modo" <> 'PRODUCCION'
    `);

    // Cubre entera la consulta del contador —empresa + modo + rango de fechas—
    // para que resuelva por Index Only Scan sin tocar el heap. Sin él, añadir
    // el filtro de modo obligaba a leer la fila de cada comprobante solo para
    // descartar los de prueba.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "idx_ecf_empresa_modo_fecha"
        ON "ecf" ("empresaId", "modoEmision", "createdAt" DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "idx_ecf_empresa_modo_fecha"`);
    await qr.query(`ALTER TABLE "ecf" DROP COLUMN IF EXISTS "modoEmision"`);
  }
}
