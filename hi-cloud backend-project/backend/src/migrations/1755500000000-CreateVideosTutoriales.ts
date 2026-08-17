import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideosTutoriales1755500000000 implements MigrationInterface {
  name = 'CreateVideosTutoriales1755500000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "videos_tutoriales" (
        "id"                SERIAL PRIMARY KEY,
        "modulo"            VARCHAR NOT NULL UNIQUE,
        "titulo"            VARCHAR NOT NULL,
        "descripcion"       TEXT,
        "proveedor"         VARCHAR(20) NOT NULL,
        "videoId"           VARCHAR NOT NULL,
        "duracionSegundos"  INT,
        "orden"             INT NOT NULL DEFAULT 0,
        "activo"            BOOLEAN NOT NULL DEFAULT true,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`CREATE INDEX "IDX_videos_tutoriales_activo" ON "videos_tutoriales" ("activo")`);
    await qr.query(`CREATE INDEX "IDX_videos_tutoriales_orden"  ON "videos_tutoriales" ("orden")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "videos_tutoriales"`);
  }
}
