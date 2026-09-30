import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HiCloud Xlink — el buzón de documentos entre dos empresas.
 *
 * SIN columna `empresaId` a propósito: esta fila pertenece a DOS empresas
 * (origen y destino), no a una. El TenantSubscriber (afterLoad) solo actúa
 * sobre filas que traen `empresaId` — al no tenerla, esta tabla queda fuera
 * de su guardia automáticamente, sin necesidad de ninguna exclusión especial
 * (ver tenant.subscriber.ts línea 48: `if (!entity?.empresaId) return`).
 * Por la misma razón, la entidad NO se decora con @TenantScoped() y NUNCA
 * se consulta con el Repository<XlinkDocumento> crudo — solo a través de
 * XlinkDocumentosRepository (src/xlink/xlink-documentos.repository.ts), que
 * exige el empresaId del CLS en cada método y filtra por
 * (origenEmpresaId = eid OR destinoEmpresaId = eid) o el lado específico
 * según la operación. Un test estructural (xlink-documentos.repository.spec.ts)
 * falla el build si algún otro archivo consulta la tabla directo.
 *
 * `xlinkPadreId` (self-FK, nullable): encadena un documento con el que lo
 * originó — ej. una Factura publicada que nació de un Pedido/Cotización
 * generado por una Orden de Compra recibida antes. Se llena solo cuando el
 * vínculo pedido→factura existe de verdad en el emisor (ver
 * XlinkPublicarService) — nunca se infiere a ciegas.
 *
 * UNIQUE(origenEmpresaId, tipoDocumento, documentoOrigenId): un documento no
 * se puede publicar dos veces — es la barrera real, no solo UX.
 */
export class CreateXlinkDocumentos1768600000000 implements MigrationInterface {
  name = 'CreateXlinkDocumentos1768600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xlink_documentos" (
        "id"                      SERIAL PRIMARY KEY,
        "origenEmpresaId"         INTEGER NOT NULL,
        "destinoEmpresaId"        INTEGER NOT NULL,
        "tipoDocumento"           VARCHAR(20) NOT NULL,
        "documentoOrigenId"       INTEGER NOT NULL,
        "numeroOrigen"            VARCHAR(20) NOT NULL,
        "ncfOrigen"               VARCHAR(20) NULL,
        "fechaOrigen"             DATE NOT NULL,
        "totalOrigen"             NUMERIC(14,2) NOT NULL,
        "snapshot"                JSONB NOT NULL,
        "estadoReceptor"          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        "documentoGeneradoTipo"   VARCHAR(20) NULL,
        "documentoGeneradoId"     INTEGER NULL,
        "numeroGenerado"          VARCHAR(20) NULL,
        "xlinkPadreId"            INTEGER NULL,
        "publicadoPorUsuarioId"   INTEGER NOT NULL,
        "publicadoEn"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "procesadoPorUsuarioId"   INTEGER NULL,
        "procesadoEn"             TIMESTAMPTZ NULL,
        "motivoDescarte"          TEXT NULL,
        "isActive"                BOOLEAN NOT NULL DEFAULT true,
        "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "ck_xlink_doc_tipo"
          CHECK ("tipoDocumento" IN ('factura_credito', 'nota_credito', 'nota_debito', 'orden_compra')),
        CONSTRAINT "ck_xlink_doc_estado"
          CHECK ("estadoReceptor" IN ('pendiente', 'procesado', 'procesado_manual', 'descartado', 'anulado_en_origen')),
        CONSTRAINT "uq_xlink_doc_origen"
          UNIQUE ("origenEmpresaId", "tipoDocumento", "documentoOrigenId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_xlink_doc_destino"
        ON "xlink_documentos" ("destinoEmpresaId", "estadoReceptor", "publicadoEn")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_xlink_doc_origen_fecha"
        ON "xlink_documentos" ("origenEmpresaId", "publicadoEn")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_xlink_doc_padre"
        ON "xlink_documentos" ("xlinkPadreId")
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos"
        ADD CONSTRAINT "fk_xlink_doc_origen_empresa"
        FOREIGN KEY ("origenEmpresaId") REFERENCES empresa("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos"
        ADD CONSTRAINT "fk_xlink_doc_destino_empresa"
        FOREIGN KEY ("destinoEmpresaId") REFERENCES empresa("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "xlink_documentos"
        ADD CONSTRAINT "fk_xlink_doc_padre"
        FOREIGN KEY ("xlinkPadreId") REFERENCES "xlink_documentos"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "xlink_documentos"`);
  }
}
