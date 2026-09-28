import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Imágenes adjuntas a un ticket de soporte — ver SoporteTicketAdjunto.
 * "ruta" guarda la KEY de S3 (bucket privado), nunca una URL: la URL se
 * firma on-demand con TTL corto (mismo patrón que comprobanteKey en
 * pagos_suscripcion — ver ComprobanteKeyPagosSuscripcion).
 *
 * Sin FK a nivel BD sobre ticketId/empresaId — convención multi-tenant del
 * proyecto (ver CHECK 10 de scripts/security-check.sh): el aislamiento lo
 * garantiza el código de aplicación (SoporteAdjuntosService), no Postgres.
 */
export class CreateSoporteTicketAdjuntos1768100000000 implements MigrationInterface {
  name = 'CreateSoporteTicketAdjuntos1768100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soporte_ticket_adjuntos" (
        "id"           SERIAL    NOT NULL,
        "isActive"     boolean   NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"    integer,
        "ticketId"     integer   NOT NULL,
        "ruta"         text      NOT NULL,
        "tipoMime"     varchar(50) NOT NULL,
        "tamanioBytes" integer   NOT NULL,
        CONSTRAINT "PK_soporte_ticket_adjuntos_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soporte_ticket_adjuntos_empresaId"
        ON "soporte_ticket_adjuntos" ("empresaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soporte_ticket_adjuntos_ticketId"
        ON "soporte_ticket_adjuntos" ("ticketId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_soporte_ticket_adjuntos_ticketId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_soporte_ticket_adjuntos_empresaId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "soporte_ticket_adjuntos"`);
  }
}
