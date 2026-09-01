import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Relación producto↔proveedor, con backfill desde el historial de compras.
 *
 * Sale de que un cliente quiere abrir «lo que este proveedor me vende» cuando el
 * proveedor llega al negocio, ver qué falta y pedirlo en el momento. Hasta ahora
 * esa relación no existía en el esquema: se deducía encadenando
 * `compra_detalles → compras."proveedorId"`, que solo responde «qué le he
 * comprado» — nunca «qué me vende», que incluye lo que aún no le has comprado y
 * es justo lo que uno quiere pedir. La ausencia ya había bloqueado antes el
 * conteo de inventario por proveedor.
 *
 * Decisiones:
 *
 * - **Índice único PARCIAL para el preferente.** `UNIQUE (empresaId, productoId)
 *   WHERE "esPreferente" AND "isActive"` garantiza como mucho un preferente por
 *   producto en la BASE DE DATOS. Dejar esa regla solo en el servicio es como se
 *   acaba con dos preferentes y nadie sabiendo cuál gana. Va en SQL crudo porque
 *   TypeORM no expresa índices parciales de forma portable.
 *
 * - **`pedidoMinimo` y `multiploEmpaque` separados, y ambos NULL por defecto.**
 *   «No te vendo menos de 6» y «solo de 12 en 12» son reglas distintas y en
 *   ferretería conviven; con un solo campo la sugerencia de compra redondea mal.
 *   NULL = sin regla → la sugerencia es el faltante sin redondear.
 *
 * - **Sello de fecha (`precioPactadoAt`), no vigencia.** Un precio «vigente
 *   hasta» que nadie actualizó miente igual que uno viejo, pero con más
 *   confianza. Con la fecha, la pantalla dice «pactado hace 8 meses» y decide
 *   quien compra.
 *
 * - **`monedaPactada`.** `compras` ya maneja `moneda` y `tipoCambio`, así que un
 *   precio sin moneda es ambiguo desde el primer registro que venga de una
 *   compra en USD.
 *
 * - **Sin FK sobre `empresaId`**, como el resto del proyecto (lo valida el hook
 *   de pre-push): el aislamiento va por TenantService/TenantSubscriber. Las FK
 *   sobre `productoId` y `proveedorId` sí se quedan, con CASCADE.
 *
 * - **El backfill va aquí y no en un script aparte** para que las empresas ya en
 *   marcha abran la pantalla con datos el primer día. Es idempotente
 *   (`ON CONFLICT DO NOTHING`) y solo escribe en la tabla nueva. Si algún día el
 *   volumen de `compra_detalles` lo hiciera pesado, se puede sacar a un comando
 *   sin tocar el resto de la migración.
 *
 * - **Una empresa sin historial de compras queda con CERO filas, y eso es
 *   correcto, no un fallo.** El poblado permanente NO es esta migración sino el
 *   enganche al recibir una compra (`ComprasService`), más el alta manual desde
 *   la pantalla. El backfill solo pone al día a quien ya lleva tiempo operando.
 *
 * Nombres de columna en camelCase y entre comillas: el proyecto no usa
 * NamingStrategy.
 */
export class CrearProductoProveedor1761700000000 implements MigrationInterface {
  name = 'CrearProductoProveedor1761700000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "producto_proveedor" (
        "id"                SERIAL PRIMARY KEY,
        "empresaId"         INTEGER      NOT NULL,
        "productoId"        INTEGER      NOT NULL,
        "proveedorId"       INTEGER      NOT NULL,
        "esPreferente"      BOOLEAN      NOT NULL DEFAULT FALSE,
        "codigoProveedor"   VARCHAR(100),
        "precioPactado"     NUMERIC(14,4),
        "monedaPactada"     CHAR(3)      NOT NULL DEFAULT 'DOP',
        "precioPactadoAt"   DATE,
        "diasEntrega"       INTEGER,
        "pedidoMinimo"      NUMERIC(12,4),
        "multiploEmpaque"   NUMERIC(12,4),
        "origen"            VARCHAR(10)  NOT NULL DEFAULT 'manual',
        "notas"             TEXT,
        "isActive"          BOOLEAN      NOT NULL DEFAULT TRUE,
        "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_prod_prov_producto"
          FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_prod_prov_proveedor"
          FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_prod_prov_par"
          UNIQUE ("empresaId", "productoId", "proveedorId"),
        CONSTRAINT "ck_prod_prov_origen"
          CHECK ("origen" IN ('backfill', 'compra', 'manual'))
      )
    `);

    // La consulta que mueve la pantalla: todos los productos de UN proveedor.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "idx_prod_prov_proveedor"
        ON "producto_proveedor" ("empresaId", "proveedorId")
    `);

    // La inversa: los proveedores de UN producto (ficha de producto, preferente).
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "idx_prod_prov_producto"
        ON "producto_proveedor" ("empresaId", "productoId")
    `);

    // Un solo preferente por producto, garantizado por la base de datos.
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_prod_prov_preferente"
        ON "producto_proveedor" ("empresaId", "productoId")
        WHERE "esPreferente" = TRUE AND "isActive" = TRUE
    `);

    // ── Backfill ──────────────────────────────────────────────────────────────
    //
    // Un par por cada (empresa, producto, proveedor) que aparezca en una compra
    // no cancelada. El precio arranca con el ÚLTIMO costo real conocido de ese
    // proveedor, con su moneda y su fecha — pero marcado 'backfill', porque un
    // costo histórico no es un precio pactado y la pantalla debe presentarlo
    // como «último costo» hasta que una persona lo confirme.
    //
    // DISTINCT ON necesita el ORDER BY que se ve abajo; el orden final del
    // INSERT no importa.
    await qr.query(`
      INSERT INTO "producto_proveedor" (
        "empresaId", "productoId", "proveedorId", "esPreferente",
        "precioPactado", "monedaPactada", "precioPactadoAt", "origen"
      )
      SELECT DISTINCT ON (c."empresaId", cd."productoId", c."proveedorId")
             c."empresaId",
             cd."productoId",
             c."proveedorId",
             FALSE,
             cd."costoUnitarioReal",
             COALESCE(c."moneda", 'DOP'),
             c."fecha",
             'backfill'
        FROM "compra_detalles" cd
        JOIN "compras" c ON c."id" = cd."compraId"
       WHERE c."isActive" = TRUE
         AND c."estado" <> 'cancelada'
         AND c."empresaId" IS NOT NULL
       ORDER BY c."empresaId", cd."productoId", c."proveedorId",
                c."fecha" DESC, c."id" DESC
      ON CONFLICT DO NOTHING
    `);

    // ── Preferente sembrado ───────────────────────────────────────────────────
    //
    // El proveedor al que más veces se le ha comprado ese producto, con desempate
    // por compra más reciente. Es el mismo criterio que ya calcula
    // `productos.service.historialCompras()` como `proveedorMasFrecuente`, para
    // que la ficha del producto y esta pantalla no digan cosas distintas.
    //
    // El índice único parcial protege esto: si el ranking empatara mal, el INSERT
    // fallaría en vez de dejar dos preferentes.
    await qr.query(`
      WITH ranking AS (
        SELECT c."empresaId",
               cd."productoId",
               c."proveedorId",
               ROW_NUMBER() OVER (
                 PARTITION BY c."empresaId", cd."productoId"
                 ORDER BY COUNT(*) DESC, MAX(c."fecha") DESC, c."proveedorId" ASC
               ) AS puesto
          FROM "compra_detalles" cd
          JOIN "compras" c ON c."id" = cd."compraId"
         WHERE c."isActive" = TRUE
           AND c."estado" <> 'cancelada'
           AND c."empresaId" IS NOT NULL
         GROUP BY c."empresaId", cd."productoId", c."proveedorId"
      )
      UPDATE "producto_proveedor" pp
         SET "esPreferente" = TRUE
        FROM ranking r
       WHERE r.puesto        = 1
         AND pp."empresaId"  = r."empresaId"
         AND pp."productoId" = r."productoId"
         AND pp."proveedorId" = r."proveedorId"
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "producto_proveedor"`);
  }
}
