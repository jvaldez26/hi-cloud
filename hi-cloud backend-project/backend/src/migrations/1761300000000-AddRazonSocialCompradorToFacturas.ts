import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot fiscal del comprador en la factura.
 *
 * La factura ya guardaba `rncComprador`; le falta el nombre. Sin él, lo único
 * que sabe qué razón social se le declaró a la DGII es el e-CF, y todo lo que
 * necesita el comprador —notas de crédito, PDF A4, recibo térmico, listados—
 * tiene que ir a buscarlo ahí o caer al cliente vinculado. Caer al cliente es
 * justo lo que hizo que la NC E340000000009 saliera a "consumidor final" sobre
 * una factura emitida a RODELA CONSTRUCCIONES RODECO SRL, y la DGII la rechazó
 * con código 615 quemando la secuencia.
 *
 * El backfill lee `jsonEnviado`, no las columnas denormalizadas del e-CF: el
 * JSON que se le mandó a MSeller es el único registro fiel de lo declarado y
 * está en el 100% de los e-CF, mientras que `ecf.rncComprador` solo estaba
 * poblado en 112 de 13.565 aceptados (la columna solo miraba
 * cliente.rncReceptor, y la mayoría de los clientes guarda el RNC en `rfc`).
 *
 * Solo se rellenan facturas cuyo e-CF llegó a existir y no fue rechazado —
 * un rechazado no declaró nada que valga la pena congelar. El RNC de todo
 * ceros se descarta: es el centinela de "sin comprador identificado", no un
 * dato, y guardarlo haría que la guarda de las notas lo tratara como si el
 * comprobante se hubiera declarado a consumidor final a propósito.
 *
 * Idempotente: la columna con IF NOT EXISTS y el backfill solo sobre filas que
 * siguen en NULL, así que una segunda pasada no pisa nada.
 */
export class AddRazonSocialCompradorToFacturas1761300000000 implements MigrationInterface {
  name = 'AddRazonSocialCompradorToFacturas1761300000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "razonSocialComprador" VARCHAR(300) NULL
    `);

    // Un solo UPDATE con el e-CF más reciente de cada factura. DISTINCT ON
    // porque una factura puede acumular varios e-CF (reintentos tras rechazo).
    await qr.query(`
      UPDATE facturas f
      SET "razonSocialComprador" = COALESCE(f."razonSocialComprador", d.razon),
          "rncComprador"         = COALESCE(f."rncComprador", d.rnc)
      FROM (
        SELECT DISTINCT ON (e."documentoOrigenId", e."empresaId")
               e."documentoOrigenId" AS factura_id,
               e."empresaId",
               NULLIF(regexp_replace(
                 COALESCE(e."jsonEnviado"->'ECF'->'Encabezado'->'Comprador'->>'RNCComprador', ''),
                 '^0+$', ''), '')                                            AS rnc,
               NULLIF(trim(COALESCE(
                 e."jsonEnviado"->'ECF'->'Encabezado'->'Comprador'->>'RazonSocialComprador',
                 '')), '')                                                   AS razon
        FROM ecf e
        WHERE e."documentoOrigenTipo" IN ('FACTURA', 'VENTA_POS')
          AND e."estadoDGII" <> 'rechazado'
          AND e."jsonEnviado" IS NOT NULL
        ORDER BY e."documentoOrigenId", e."empresaId", e."createdAt" DESC
      ) d
      WHERE f.id = d.factura_id
        AND f."empresaId" = d."empresaId"
        AND (f."razonSocialComprador" IS NULL OR f."rncComprador" IS NULL)
        AND (d.razon IS NOT NULL OR d.rnc IS NOT NULL)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    // El backfill de rncComprador no se revierte: eran NULL y ahora tienen el
    // valor declarado, que es correcto con o sin esta columna.
    await qr.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "razonSocialComprador"
    `);
  }
}
