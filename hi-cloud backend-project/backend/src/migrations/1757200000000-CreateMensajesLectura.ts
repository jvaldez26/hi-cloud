import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMensajesLectura1757200000000 implements MigrationInterface {
  name = 'CreateMensajesLectura1757200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE mensajes_lectura (
        id             uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
        "mensajeId"    uuid      NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
        "usuarioId"    integer   NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        "vistoEn"      timestamp NULL,
        "leidoEn"      timestamp NULL,
        "archivadoEn"  timestamp NULL,
        "createdAt"    timestamp NOT NULL DEFAULT now(),
        UNIQUE ("mensajeId", "usuarioId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_mensajes_lectura_usuario ON mensajes_lectura("usuarioId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS mensajes_lectura`);
  }
}
