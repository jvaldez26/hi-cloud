import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Políticas de Modo Supervisor por empresa y por clave (pestaña/acción) —
 * reemplaza los interruptores sueltos en empresa.configuracion
 * (supervisorModeEnabled, posSupervisorCierreCaja, posSupervisorGastos,
 * posSupervisorVentaCredito, posModificarPrecio).
 *
 * Migración de datos: para cada empresa, se inserta una fila por CADA clave
 * del catálogo con el valor EXACTO que esa combinación de interruptores ya
 * producía hoy (ver fórmulas abajo, una por fila de `FORMULAS`) — nadie
 * pierde una protección que ya tenía. El modo ('sesion'/'cada_vez') no
 * existía antes: se aplica el default del catálogo para esa clave, no un
 * dato migrado.
 *
 * Las claves backend-enforced de forma incondicional hoy (SupervisorGateGuard
 * sin soloSi, para cualquier vendedor): anular_documento, crear_nota_credito,
 * crear_producto, editar_producto, entrada_inventario, salida_inventario,
 * cambiar_sucursal, ver_reportes, y el panel de Compras (bloqueo "Forced" en
 * el propio componente) — se migran como requerido=true para TODAS las
 * empresas, igual que su protección actual.
 *
 * "Recibos de Cobro" nunca fue un interruptor y queda desmarcado para todas
 * las empresas (decisión explícita del usuario).
 */
export class SupervisorPoliticas1770700000000 implements MigrationInterface {
  name = 'SupervisorPoliticas1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supervisor_politicas (
        id          SERIAL PRIMARY KEY,
        "empresaId" INTEGER     NOT NULL,
        clave       VARCHAR(60) NOT NULL,
        requerido   BOOLEAN     NOT NULL DEFAULT false,
        modo        VARCHAR(20) NOT NULL DEFAULT 'sesion',
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("empresaId", clave)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_supervisor_politicas_empresa" ON supervisor_politicas ("empresaId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supervisor_autorizaciones (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER     NOT NULL,
        "cajeroId"     INTEGER     NOT NULL,
        "supervisorId" INTEGER     NOT NULL,
        clave          VARCHAR(60) NOT NULL,
        token          VARCHAR(64) NOT NULL,
        usado          BOOLEAN     NOT NULL DEFAULT false,
        "expiraEn"     TIMESTAMPTZ NOT NULL,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supervisor_autorizaciones_token" ON supervisor_autorizaciones (token)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_supervisor_autorizaciones_cajero" ON supervisor_autorizaciones ("empresaId", "cajeroId", clave)
    `);

    // Token transitorio de la política 'venta_credito' en modo 'cada_vez' —
    // se guarda al crear la factura (BORRADOR) y se consume en cambiarEstado().
    await queryRunner.query(`
      ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "supervisorToken" VARCHAR(64)
    `);

    // ── Migración de datos ──────────────────────────────────────────────────
    // "SME" = supervisorModeEnabled efectivo hoy (plano o legacy .pos).
    const SME = `COALESCE(
      (e.configuracion->>'supervisorModeEnabled')::boolean,
      (e.configuracion->'pos'->>'supervisorModeEnabled')::boolean,
      false
    )`;
    // Toggle específico "!== false" (ausente o true = protegido, igual que el frontend hoy).
    const toggleNotFalse = (clave: string) => `COALESCE(
      (e.configuracion->>'${clave}')::boolean,
      (e.configuracion->'pos'->>'${clave}')::boolean,
      true
    ) <> false`;
    const cierreCajaToggle = toggleNotFalse('posSupervisorCierreCaja');
    const gastosToggle     = toggleNotFalse('posSupervisorGastos');
    const creditoToggle    = toggleNotFalse('posSupervisorVentaCredito');
    // posModificarPrecio es al revés: ausente = NO protegido (el frontend exige === true).
    const modificarPrecioOn = `COALESCE(
      (e.configuracion->>'posModificarPrecio')::boolean,
      (e.configuracion->'pos'->>'posModificarPrecio')::boolean,
      false
    ) = true`;

    const FORMULAS: { clave: string; requerido: string; modo: 'sesion' | 'cada_vez' }[] = [
      // Pestañas del POS
      { clave: 'pos.panel.items',         requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.inventario',    requerido: SME,                                   modo: 'sesion' },
      { clave: 'pos.panel.facturas',      requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.pre_facturas',  requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.cotizaciones',  requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.conduce',       requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.clientes',      requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.recibos_cobro', requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.anticipos',     requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.notas_credito', requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.gastos',        requerido: `(${SME} AND ${gastosToggle})`,        modo: 'sesion' },
      { clave: 'pos.panel.cierre_caja',   requerido: `(${SME} AND ${cierreCajaToggle})`,    modo: 'sesion' },
      { clave: 'pos.panel.ventas_hoy',    requerido: SME,                                   modo: 'sesion' },
      { clave: 'pos.panel.pro_formas',    requerido: 'false',                              modo: 'sesion' },
      { clave: 'pos.panel.compras',       requerido: 'true',                               modo: 'sesion' },

      // Acciones de venta
      { clave: 'venta_credito',       requerido: `(${SME} AND ${creditoToggle})`, modo: 'cada_vez' },
      { clave: 'anular_documento',    requerido: 'true',                          modo: 'cada_vez' },
      { clave: 'crear_nota_credito',  requerido: 'true',                          modo: 'cada_vez' },
      { clave: 'devolucion_efectivo', requerido: SME,                             modo: 'cada_vez' },
      { clave: 'descuento_excedido',  requerido: SME,                             modo: 'cada_vez' },
      { clave: 'modificar_precio',    requerido: `(${SME} AND ${modificarPrecioOn})`, modo: 'cada_vez' },

      // Caja
      { clave: 'cerrar_caja',      requerido: `(${SME} AND ${cierreCajaToggle})`, modo: 'cada_vez' },
      { clave: 'registrar_retiro', requerido: 'false',                            modo: 'cada_vez' },
      { clave: 'registrar_gasto',  requerido: `(${SME} AND ${gastosToggle})`,     modo: 'sesion'   },

      // Inventario y Productos
      { clave: 'crear_producto',     requerido: 'true', modo: 'sesion' },
      { clave: 'editar_producto',    requerido: 'true', modo: 'sesion' },
      { clave: 'entrada_inventario', requerido: 'true', modo: 'sesion' },
      { clave: 'salida_inventario',  requerido: 'true', modo: 'sesion' },

      // Sistema / Reportes
      { clave: 'cambiar_sucursal', requerido: 'true', modo: 'sesion' },
      { clave: 'ver_reportes',     requerido: 'true', modo: 'sesion' },
    ];

    for (const f of FORMULAS) {
      await queryRunner.query(`
        INSERT INTO supervisor_politicas ("empresaId", clave, requerido, modo, "updatedAt")
        SELECT e.id, '${f.clave}', ${f.requerido}, '${f.modo}', NOW()
        FROM empresa e
        ON CONFLICT ("empresaId", clave) DO NOTHING
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "supervisorToken"`);
    await queryRunner.query(`DROP TABLE IF EXISTS supervisor_autorizaciones`);
    await queryRunner.query(`DROP TABLE IF EXISTS supervisor_politicas`);
  }
}
