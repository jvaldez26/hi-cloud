import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autorización REMOTA del Modo Supervisor (ADMIN/CONTADOR responde desde
 * cualquier dispositivo, no solo presencial en la caja) — ver
 * src/autorizacion-remota/.
 *
 * 1. `supervisor_politicas.permiteRemoto`: por defecto true — salvo
 *    'cierre_caja_descuadre' y 'anular_cierre_caja', que siguen siendo
 *    presenciales a propósito (decisión explícita del pedido: ambas exigen
 *    que el supervisor vea algo in situ — la tabla de descuadre por forma de
 *    pago, o la caja físicamente — antes de autorizar). El UPDATE backfillea
 *    las filas YA EXISTENTES de esas dos claves (filas nuevas de otras
 *    claves nacen en true por el DEFAULT de la columna).
 *
 * 2. `supervisor_autorizaciones` gana las columnas que la autorización
 *    remota necesita y la presencial no usaba: `origen` (distingue remoto de
 *    presencial para el tag "Remota" del reporte), y la "huella" de la
 *    acción aprobada (`facturaId`/`clienteId`/`monto`, todas NULL por
 *    defecto) — si el cajero cambia el carrito después de pedir la
 *    autorización, estos valores ya no van a coincidir con la petición real
 *    y el guard la rechaza (ver huella-autorizacion-remota.util.ts).
 *    `solicitudRemotaId` enlaza de vuelta a la solicitud que la originó.
 *
 * 3. `solicitudes_autorizacion_remota`: la solicitud en sí — desde que el
 *    cajero la pide hasta que un ADMIN/CONTADOR la aprueba o rechaza (o
 *    expira a los 3 minutos). El conflicto de interés ("nadie aprueba su
 *    propia solicitud") se exige en el propio UPDATE de decidir() (ver
 *    AutorizacionRemotaService.decidir), no aquí — esta tabla solo guarda el
 *    estado.
 */
export class AutorizacionRemotaSupervisor1789000000000 implements MigrationInterface {
  name = 'AutorizacionRemotaSupervisor1789000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE supervisor_politicas ADD COLUMN IF NOT EXISTS "permiteRemoto" boolean NOT NULL DEFAULT true
    `);
    await qr.query(`
      UPDATE supervisor_politicas SET "permiteRemoto" = false
      WHERE clave IN ('cierre_caja_descuadre', 'anular_cierre_caja')
    `);

    await qr.query(`ALTER TABLE supervisor_autorizaciones ADD COLUMN IF NOT EXISTS origen varchar(20) NOT NULL DEFAULT 'presencial'`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones ADD COLUMN IF NOT EXISTS "facturaId" int NULL`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones ADD COLUMN IF NOT EXISTS "clienteId" int NULL`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones ADD COLUMN IF NOT EXISTS monto numeric(14,2) NULL`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones ADD COLUMN IF NOT EXISTS "solicitudRemotaId" int NULL`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS solicitudes_autorizacion_remota (
        id               SERIAL PRIMARY KEY,
        "empresaId"      int NOT NULL,
        "cajeroId"       int NOT NULL,
        "cajeroNombre"   varchar(150) NOT NULL,
        "sucursalId"     int NULL,
        "cajaId"         int NULL,
        clave            varchar(60) NOT NULL,
        estado           varchar(20) NOT NULL DEFAULT 'pendiente',
        motivo           text NOT NULL,
        detalle          jsonb NULL,
        "facturaId"       int NULL,
        "clienteId"       int NULL,
        monto            numeric(14,2) NULL,
        "supervisorId"    int NULL,
        "supervisorNombre" varchar(150) NULL,
        comentario       text NULL,
        token            varchar(64) NULL,
        ip               varchar(64) NULL,
        dispositivo      varchar(300) NULL,
        "createdAt"       timestamptz NOT NULL DEFAULT NOW(),
        "respondidoEn"    timestamptz NULL,
        "expiraEn"        timestamptz NOT NULL
      )
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_solicitudes_autorizacion_remota_caja_pendiente
      ON solicitudes_autorizacion_remota ("empresaId", "cajaId", estado)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_solicitudes_autorizacion_remota_cajero_fecha
      ON solicitudes_autorizacion_remota ("cajeroId", "createdAt")
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_solicitudes_autorizacion_remota_empresa_estado
      ON solicitudes_autorizacion_remota ("empresaId", estado, "createdAt")
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS solicitudes_autorizacion_remota`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones DROP COLUMN IF EXISTS "solicitudRemotaId"`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones DROP COLUMN IF EXISTS monto`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones DROP COLUMN IF EXISTS "clienteId"`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones DROP COLUMN IF EXISTS "facturaId"`);
    await qr.query(`ALTER TABLE supervisor_autorizaciones DROP COLUMN IF EXISTS origen`);
    await qr.query(`ALTER TABLE supervisor_politicas DROP COLUMN IF EXISTS "permiteRemoto"`);
  }
}
