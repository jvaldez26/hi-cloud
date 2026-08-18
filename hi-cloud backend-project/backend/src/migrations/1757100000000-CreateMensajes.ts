import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMensajes1757100000000 implements MigrationInterface {
  name = 'CreateMensajes1757100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE mensajes (
        id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        titulo             varchar(200) NOT NULL,
        cuerpo             text         NOT NULL,
        tipo               varchar(10)  NOT NULL,
        destinatario       varchar(10)  NOT NULL,
        "destinatarioIds"  integer[]    NULL,
        "destinatarioPlan" varchar(50)  NULL,
        "fechaPublicacion" timestamp    NOT NULL,
        "fechaExpiracion"  timestamp    NULL,
        activo             boolean      NOT NULL DEFAULT true,
        "editadoEn"        timestamp    NULL,
        "createdBy"        integer      NOT NULL REFERENCES users(id),
        "createdAt"        timestamp    NOT NULL DEFAULT now(),
        "updatedAt"        timestamp    NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_mensajes_activo_pub ON mensajes(activo, "fechaPublicacion")
    `);
    await queryRunner.query(`
      CREATE INDEX idx_mensajes_tipo ON mensajes(tipo)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS mensajes CASCADE`);
  }
}
