import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bug: subirComprobante() (pagos-suscripcion.service.ts) guardaba en
 * "comprobanteUrl" una URL pública directa de S3
 * (https://<bucket>.s3.<region>.amazonaws.com/<key>) cuando S3 está
 * habilitado — pero ambos buckets de S3 tienen bloqueado el acceso público
 * (ver docs/aws-credentials.md: "las imágenes se sirven con URL firmada,
 * nunca directamente públicas"). Esa URL siempre devuelve 403 al navegador
 * — el comprobante nunca se pudo ver desde que se activó S3 en producción.
 *
 * Mismo patrón que activacion-ecf ya usaba correctamente
 * (comprobantePagoKey + s3Service.getSignedUrl()): se guarda solo la KEY
 * del objeto en "comprobanteKey", y la URL firmada (15 min) se genera al
 * momento de leer, nunca se persiste.
 *
 * Backfill: para las filas ya rotas cuya "comprobanteUrl" es una URL
 * pública de S3 reconocible, se extrae la key para que vuelvan a ser
 * visibles sin que el admin tenga que pedirle el comprobante de nuevo al
 * cliente. Las filas del fallback de disco local (comprobanteUrl con
 * dominio hicloudrd.com) no son S3 — se dejan tal cual, siguen usando
 * comprobanteUrl (ese camino tiene un problema de infraestructura aparte,
 * sin relación con S3, no cubierto por esta migración).
 */
export class ComprobanteKeyPagosSuscripcion1763900000000 implements MigrationInterface {
  name = 'ComprobanteKeyPagosSuscripcion1763900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE "pagos_suscripcion"
        ADD COLUMN IF NOT EXISTS "comprobanteKey" TEXT
    `);

    await queryRunner.query(`
      UPDATE "pagos_suscripcion"
         SET "comprobanteKey" = split_part("comprobanteUrl", '.amazonaws.com/', 2)
       WHERE "comprobanteUrl" LIKE 'https://%.amazonaws.com/%'
         AND "comprobanteKey" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE "pagos_suscripcion"
        DROP COLUMN IF EXISTS "comprobanteKey"
    `);
  }
}
