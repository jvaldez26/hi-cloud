import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `integridadVerificada` se escribia a true en cada backup exitoso sin que nada
 * lo comprobara: ni el checksum contra el objeto en S3, ni una restauracion, ni
 * una sola fila leida. El panel de Super Admin mostraba un tick verde con el
 * texto "SHA-256 verificado" para archivos que nadie habia abierto nunca.
 *
 * Todos los registros existentes vuelven a false, que es la verdad: nadie los
 * verifico. `verificadoEn` se pone a NULL por lo mismo — esa fecha era la del
 * momento en que se guardo la fila, no la de ninguna verificacion.
 *
 * No se borra ni se toca ningun otro dato del historico. Los backups en S3
 * siguen donde estaban; lo unico que cambia es que el panel deja de afirmar
 * algo que no sabe.
 *
 * A partir de aqui solo verificarRestauracion() puede levantar la bandera, y lo
 * hace despues de restaurar el dump en una base temporal y cuadrar los conteos.
 */
export class LimpiarIntegridadVerificadaFalsa1760900000000 implements MigrationInterface {
  name = 'LimpiarIntegridadVerificadaFalsa1760900000000';

  public async up(qr: QueryRunner): Promise<void> {
    const [{ count }] = await qr.query(
      `SELECT COUNT(*)::int AS count FROM backup_registros WHERE "integridadVerificada" = true`,
    );

    await qr.query(`
      UPDATE backup_registros
         SET "integridadVerificada" = false,
             "verificadoEn"         = NULL
       WHERE "integridadVerificada" = true
          OR "verificadoEn" IS NOT NULL
    `);

    console.log(
      `[LimpiarIntegridadVerificadaFalsa] ${count} backup(s) estaban marcados como ` +
      `verificados sin haberlo sido. Ahora figuran como NO verificados.`,
    );
  }

  /**
   * No hay vuelta atras honesta: volver a marcarlos como verificados seria
   * reintroducir exactamente la mentira que esta migracion quita. Se deja como
   * no-op a proposito.
   */
  public async down(): Promise<void> {
    console.warn(
      '[LimpiarIntegridadVerificadaFalsa] down() es un no-op deliberado: ' +
      'no se vuelve a marcar como verificado lo que nadie verifico.',
    );
  }
}
