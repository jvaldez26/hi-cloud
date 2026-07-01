import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEcfRecibidos1750100000000 implements MigrationInterface {
  name = 'CreateEcfRecibidos1750100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE ecf_recibidos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        encf VARCHAR(20) NOT NULL,
        "rncEmisor" VARCHAR(15),
        "nombreEmisor" VARCHAR(200),
        "fechaDocumento" DATE,
        "tipoEcf" VARCHAR(5),
        total DECIMAL(12,2) NOT NULL DEFAULT 0,
        "montoGravado" DECIMAL(12,2),
        itbis DECIMAL(12,2),
        "montoExento" DECIMAL(12,2),
        status VARCHAR(50) NOT NULL DEFAULT 'received',
        "fuenteImportacion" VARCHAR(10) NOT NULL DEFAULT 'csv',
        "procesadoComoCompra" BOOLEAN NOT NULL DEFAULT false,
        "creadoEnMseller" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_ecf_recibidos_empresa_encf" UNIQUE ("empresaId", encf)
      )
    `);

    await qr.query(`CREATE INDEX idx_ecf_recibidos_empresa ON ecf_recibidos ("empresaId")`);
    await qr.query(`CREATE INDEX idx_ecf_recibidos_empresa_fecha ON ecf_recibidos ("empresaId", "fechaDocumento" DESC)`);
    await qr.query(`CREATE INDEX idx_ecf_recibidos_rnc ON ecf_recibidos ("empresaId", "rncEmisor")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS ecf_recibidos CASCADE`);
  }
}
