import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix urgente — Sentry #7742858869 (factura FAC-15227, empresa 44, tipo E32).
 *
 * `ecf.facturaId` tenía un UNIQUE incondicional (heredado de un @OneToOne de
 * TypeORM) que bloqueaba a lo sumo UN e-CF por factura, SIN IMPORTAR el
 * estado. Eso rompía el reintento que el propio código de EmitirECFUseCase
 * ya documenta como soportado ("RECHAZADO/CONTINGENCIA → se permite
 * reintento con nuevo eNCF"): la segunda fila para la misma factura
 * reventaba contra esta constraint igual que el intento erróneo que generó
 * el bug (emitir sobre una factura que ya tenía un e-CF en ENVIADO/
 * PENDIENTE_ENVIO/OBSERVADO — hueco de idempotencia corregido aparte en
 * emitir-ecf.use-case.ts).
 *
 * La unicidad real que hace falta ("a lo sumo un e-CF ACEPTADO por
 * documento") ya la impone `idx_ecf_origen_unico_aceptado` — índice único
 * PARCIAL sobre (documentoOrigenTipo, documentoOrigenId) filtrado por
 * estadoDGII='aceptado', creado en una migración anterior y que sí permite
 * varias filas no-aceptadas (reintentos). Esta migración solo retira la
 * constraint vieja e incondicional y la reemplaza por un índice plano (no
 * único) sobre facturaId, para no perder el índice que los JOIN/WHERE por
 * facturaId necesitan.
 *
 * Busca el nombre real de la constraint en vez de asumirlo (TypeORM lo
 * genera por hash — puede diferir entre entornos si el esquema no se creó
 * exactamente igual).
 */
export class RelajarUnicidadFacturaIdEcf1765300000000 implements MigrationInterface {
  name = 'RelajarUnicidadFacturaIdEcf1765300000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    const constraints: { conname: string }[] = await qr.query(`
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'ecf'::regclass
        AND c.contype = 'u'
        AND c.conkey = (
          SELECT array_agg(a.attnum)
          FROM pg_attribute a
          WHERE a.attrelid = 'ecf'::regclass AND a.attname = 'facturaId'
        )
    `);
    for (const { conname } of constraints) {
      await qr.query(`ALTER TABLE ecf DROP CONSTRAINT "${conname}"`);
    }

    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_ecf_facturaId" ON ecf ("facturaId")`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_ecf_facturaId"`);
    // No se restaura el UNIQUE viejo: si ya existen varias filas para el
    // mismo facturaId (el propio caso que esta migración habilita), restaurar
    // la constraint fallaría o perdería datos. Revertir esto exige limpiar
    // duplicados a mano primero.
  }
}
