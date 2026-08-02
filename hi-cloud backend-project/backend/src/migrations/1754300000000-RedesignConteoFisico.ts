import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rediseño completo del módulo de Conteo Físico de Inventario.
 *
 * Reemplaza las tablas originales (conteos_inventario, lineas_conteo) que tenían
 * defectos críticos: lineas_conteo sin empresaId ni timestamps, confirmar() que
 * escribía stock directamente sin movimiento, costoUnitario siempre 0.
 *
 * Las tablas nuevas implementan:
 *  - Snapshot con COALESCE(stock_almacen.stock, productos.stock): 115 productos
 *    activos no tienen fila en stock_almacen; sin el COALESCE arrancarían en 0.
 *  - movimientosVentana: delta neto entre fechaGeneracion y captura de la línea.
 *  - CHECK constraints en todos los campos de dominio discreto.
 *  - Trazabilidad total: conteo_ajustes vincula cada ajuste a su movimiento_inventario.
 *  - FK sin CASCADE en conteo_ajustes: bloquea borrar conteos ya ajustados a nivel DB.
 */
export class RedesignConteoFisico1754300000000 implements MigrationInterface {
  name = 'RedesignConteoFisico1754300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // ── 1. Respaldar filas huérfanas de lineas_conteo ──────────────────────────
    // Verificar que la tabla fuente existe antes de copiar. En entornos limpios
    // (staging, nueva base) la tabla puede no existir y el SELECT reventaría.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.lineas_conteo') IS NOT NULL THEN
          CREATE TABLE IF NOT EXISTS bkp_lineas_conteo_20260802 AS
            SELECT *, NOW() AS backed_up_at FROM lineas_conteo;
        END IF;
      END $$
    `);

    // ── 2. Sembrar contadores_secuencia con ultimo_numero=0 ────────────────────
    // Primer conteo → función retorna 0+1=1 → código CNT-000001.
    // Empresas creadas después de esta migración no tendrán fila; la función
    // siguiente_numero_secuencia() las inserta con 101 (comportamiento fijo,
    // igual que FAC, COT, etc. — es diseño del sistema).
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT id, 'cnt', 0
      FROM empresa
      WHERE "isActive" = true
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // ── 3. Eliminar tablas originales rotas ────────────────────────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS lineas_conteo`);
    await queryRunner.query(`DROP TABLE IF EXISTS conteos_inventario`);

    // ── 4. conteos_inventario ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE conteos_inventario (
        "id"                SERIAL        PRIMARY KEY,
        "empresaId"         INTEGER,
        "codigo"            VARCHAR(20)   NOT NULL,
        "nombre"            VARCHAR(200)  NOT NULL,
        "tipo"              VARCHAR(30)   NOT NULL DEFAULT 'total',
        "modalidad"         VARCHAR(20)   NOT NULL DEFAULT 'ciego',
        "estado"            VARCHAR(20)   NOT NULL DEFAULT 'borrador',
        "almacenId"         INTEGER       NOT NULL REFERENCES almacenes(id),
        "filtros"           JSONB,
        "umbralTipo"        VARCHAR(10)   NOT NULL DEFAULT 'unidades',
        "umbralValor"       DECIMAL(12,4) NOT NULL DEFAULT 5,
        "fechaGeneracion"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "fechaInicio"       TIMESTAMPTZ,
        "fechaCierre"       TIMESTAMPTZ,
        "generadoPorId"     INTEGER       NOT NULL REFERENCES users(id),
        "cerradoPorId"      INTEGER                REFERENCES users(id),
        "ajustadoPorId"     INTEGER                REFERENCES users(id),
        "totalLineas"       INTEGER       NOT NULL DEFAULT 0,
        "lineasContadas"    INTEGER       NOT NULL DEFAULT 0,
        "totalDiferencias"  INTEGER       NOT NULL DEFAULT 0,
        "valorDiferencia"   DECIMAL(14,2) NOT NULL DEFAULT 0,
        "notas"             TEXT,
        "isActive"          BOOLEAN       NOT NULL DEFAULT true,
        "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT "UQ_conteo_empresa_codigo"
          UNIQUE ("empresaId", "codigo"),

        CONSTRAINT "CHK_conteo_tipo"
          CHECK (tipo IN (
            'total','ubicacion','categoria','ciclico_abc',
            'selectivo','proveedor','marca'
          )),

        CONSTRAINT "CHK_conteo_modalidad"
          CHECK (modalidad IN ('ciego','informado')),

        CONSTRAINT "CHK_conteo_estado"
          CHECK (estado IN (
            'borrador','en_conteo','en_digitacion','en_revision',
            'ajustado','cerrado','anulado'
          )),

        CONSTRAINT "CHK_conteo_umbral_tipo"
          CHECK ("umbralTipo" IN ('unidades','valor'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conteo_empresa_activo"
        ON conteos_inventario ("empresaId", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conteo_empresa_estado"
        ON conteos_inventario ("empresaId", estado)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conteo_empresa_almacen"
        ON conteos_inventario ("empresaId", "almacenId")
    `);

    // ── 5. lineas_conteo ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE lineas_conteo (
        "id"                  SERIAL        PRIMARY KEY,
        "empresaId"           INTEGER,
        "conteoId"            INTEGER       NOT NULL
                                REFERENCES conteos_inventario(id) ON DELETE CASCADE,
        "orden"               INTEGER       NOT NULL,
        "productoId"          INTEGER       NOT NULL REFERENCES productos(id),
        "productoCodigo"      VARCHAR(30),
        "productoNombre"      VARCHAR(200),
        "unidadMedida"        VARCHAR(20),
        "ubicacionId"         INTEGER       REFERENCES wms_ubicaciones(id),
        "tieneLotes"          BOOLEAN       NOT NULL DEFAULT false,
        "tieneSeriales"       BOOLEAN       NOT NULL DEFAULT false,
        "cantidadSistema"     DECIMAL(12,4) NOT NULL DEFAULT 0,
        "cantidadContada"     DECIMAL(12,4),
        "cantidadRecuento"    DECIMAL(12,4),
        "diferencia"          DECIMAL(12,4) NOT NULL DEFAULT 0,
        "movimientosVentana"  DECIMAL(12,4) NOT NULL DEFAULT 0,
        "costoUnitario"       DECIMAL(12,4) NOT NULL DEFAULT 0,
        "estadoLinea"         VARCHAR(20)   NOT NULL DEFAULT 'pendiente',
        "contadaPorId"        INTEGER       REFERENCES users(id),
        "contadaEn"           TIMESTAMPTZ,
        "nota"                TEXT,
        "isActive"            BOOLEAN       NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updatedAt"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT "CHK_linea_estado"
          CHECK ("estadoLinea" IN ('pendiente','contada','en_recuento','conciliada'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_linea_empresa_conteo"
        ON lineas_conteo ("empresaId", "conteoId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linea_empresa_activo"
        ON lineas_conteo ("empresaId", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linea_conteo_orden"
        ON lineas_conteo ("conteoId", "orden")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linea_empresa_producto"
        ON lineas_conteo ("empresaId", "productoId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linea_empresa_estadolinea"
        ON lineas_conteo ("empresaId", "estadoLinea")
    `);

    // ── 6. conteo_ajustes ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE conteo_ajustes (
        "id"                SERIAL        PRIMARY KEY,
        "empresaId"         INTEGER,
        "conteoId"          INTEGER       NOT NULL REFERENCES conteos_inventario(id),
        "lineaId"           INTEGER       NOT NULL REFERENCES lineas_conteo(id),
        "productoId"        INTEGER       NOT NULL,
        "movimientoId"      INTEGER       NOT NULL REFERENCES movimientos_inventario(id),
        "cantidadAntes"     DECIMAL(12,4) NOT NULL,
        "cantidadDespues"   DECIMAL(12,4) NOT NULL,
        "diferencia"        DECIMAL(12,4) NOT NULL,
        "costoUnitario"     DECIMAL(12,4) NOT NULL,
        "valorImpacto"      DECIMAL(14,2) NOT NULL,
        "tipo"              VARCHAR(10)   NOT NULL,
        "avisaLotes"        BOOLEAN       NOT NULL DEFAULT false,
        "aplicadoPorId"     INTEGER       NOT NULL REFERENCES users(id),
        "aplicadoEn"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT "CHK_ajuste_tipo"
          CHECK (tipo IN ('sobrante','faltante'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ajuste_empresa_conteo"
        ON conteo_ajustes ("empresaId", "conteoId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ajuste_movimiento"
        ON conteo_ajustes ("movimientoId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── ADVERTENCIA ────────────────────────────────────────────────────────────
    // Este down() NO es reversible en la práctica si ya hubo conteos ajustados.
    // Los ajustes generaron movimientos_inventario reales (stock ya modificado).
    // Correr down() elimina las tablas de trazabilidad pero NO revierte el stock.
    // Quedan movimientos con tipo='ajuste' y referencia='CNT-*' sin conteo padre.
    // Solo usar down() en entornos donde no haya conteos ajustados en producción.
    // ──────────────────────────────────────────────────────────────────────────

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`DROP TABLE IF EXISTS conteo_ajustes`);
    await queryRunner.query(`DROP TABLE IF EXISTS lineas_conteo`);
    await queryRunner.query(`DROP TABLE IF EXISTS conteos_inventario`);

    await queryRunner.query(`DELETE FROM contadores_secuencia WHERE tipo = 'cnt'`);

    // Recrear schema original (pre-migración, con defectos documentados)
    await queryRunner.query(`
      CREATE TABLE conteos_inventario (
        "id"               SERIAL PRIMARY KEY,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "isActive"         BOOLEAN NOT NULL DEFAULT true,
        "empresaId"        INTEGER,
        "numero"           VARCHAR(20) NOT NULL,
        "nombre"           VARCHAR(200) NOT NULL,
        "fecha"            DATE NOT NULL,
        "estado"           VARCHAR NOT NULL DEFAULT 'borrador',
        "sucursalId"       INTEGER,
        "categoria"        VARCHAR(100),
        "totalProductos"   INTEGER NOT NULL DEFAULT 0,
        "totalDiferencias" INTEGER NOT NULL DEFAULT 0,
        "usuarioId"        INTEGER NOT NULL,
        "notas"            TEXT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ON conteos_inventario ("empresaId", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX ON conteos_inventario ("empresaId", "estado")
    `);

    await queryRunner.query(`
      CREATE TABLE lineas_conteo (
        "id"                SERIAL PRIMARY KEY,
        "conteoId"          INTEGER NOT NULL
                              REFERENCES conteos_inventario(id) ON DELETE CASCADE,
        "productoId"        INTEGER NOT NULL,
        "productoCodigo"    VARCHAR(30),
        "productoNombre"    VARCHAR(200),
        "categoriaProducto" VARCHAR(100),
        "cantidadSistema"   DECIMAL(12,4) NOT NULL DEFAULT 0,
        "cantidadFisica"    DECIMAL(12,4),
        "diferencia"        DECIMAL(12,4) NOT NULL DEFAULT 0,
        "costoUnitario"     DECIMAL(12,2) NOT NULL DEFAULT 0,
        "costoVariacion"    DECIMAL(12,2) NOT NULL DEFAULT 0,
        "observaciones"     TEXT
      )
    `);
    // Las 4 filas huérfanas quedan en bkp_lineas_conteo_20260802 para consulta.
    // No se restauran: su conteo padre no existe y el FK lo bloquearía.
  }
}
