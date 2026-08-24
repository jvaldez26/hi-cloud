import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitudes de implementación de facturación electrónica.
 *
 * NO HAY COLUMNA PARA EL CERTIFICADO, y es deliberado. El PFX se valida en
 * memoria y se descarta: de él solo quedan tres metadatos no sensibles —si era
 * válido, cuándo vence y a nombre de quién—. La clave tampoco se guarda, ni
 * cifrada.
 *
 * El PFX es la identidad fiscal de la empresa. Almacenarlo solo tendría sentido
 * si algo lo necesitara más adelante, y nada lo necesita: cuando llega el
 * momento de activar, se le pide al cliente y se carga en MSeller a mano.
 *
 * `montoAcordado` se congela al crear la solicitud. Si sube la tarifa, las
 * solicitudes ya enviadas conservan lo que se le prometió al cliente.
 */
export class CrearSolicitudesActivacionEcf1761000000000 implements MigrationInterface {
  name = 'CrearSolicitudesActivacionEcf1761000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS solicitudes_activacion_ecf (
        id                            SERIAL PRIMARY KEY,
        "empresaId"                   INTEGER NOT NULL,
        estado                        VARCHAR(20) NOT NULL DEFAULT 'pendiente_pago',

        "montoAcordado"               DECIMAL(12,2) NOT NULL,
        "tarifaVersion"               INTEGER NOT NULL DEFAULT 1,

        "tieneCertificado"            BOOLEAN NOT NULL DEFAULT false,
        "certificadoVenceEn"          DATE NULL,
        "certificadoTitular"          VARCHAR(200) NULL,
        "certificadoVencido"          BOOLEAN NOT NULL DEFAULT false,

        "comprobantePagoKey"          VARCHAR(400) NULL,
        "comprobanteSubidoEn"         TIMESTAMPTZ NULL,

        "contactoNombre"              VARCHAR(150) NULL,
        "contactoEmail"               VARCHAR(150) NULL,
        "contactoTelefono"            VARCHAR(40) NULL,
        notas                         TEXT NULL,
        "solicitadoPorUsuarioId"      INTEGER NULL,

        "pagoConfirmadoEn"            TIMESTAMPTZ NULL,
        "pagoConfirmadoPorUsuarioId"  INTEGER NULL,
        "activadaEn"                  TIMESTAMPTZ NULL,
        "motivoRechazo"               TEXT NULL,

        "createdAt"                   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"                   TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_solicitudes_activacion_empresa_estado"
        ON solicitudes_activacion_ecf("empresaId", estado)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_solicitudes_activacion_empresa_estado"`);
    await qr.query(`DROP TABLE IF EXISTS solicitudes_activacion_ecf`);
  }
}
