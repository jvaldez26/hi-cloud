import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRestauranteModule1750050000000 implements MigrationInterface {
  name = 'CreateRestauranteModule1750050000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('restaurante', 'Módulo Restaurante / Food Service',
        'Gestión completa para restaurantes: mesas, comandas, cocina (KDS), menú digital, delivery, propinas, turnos y facturación')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. ÁREAS / ZONAS ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_areas (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        nombre           VARCHAR(100) NOT NULL,
        descripcion      TEXT,
        "capacidadTotal" INTEGER,
        orden            INTEGER DEFAULT 0,
        "isActive"       BOOLEAN DEFAULT true,
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. MESAS ─────────────────────────────────────────────────────────
    // comandaActualId sin FK aún — se agrega después de crear rs_comandas
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_mesas (
        id                 SERIAL PRIMARY KEY,
        "empresaId"        INTEGER NOT NULL,
        "areaId"           INTEGER REFERENCES rs_areas(id) ON DELETE SET NULL,
        numero             VARCHAR(20) NOT NULL,
        nombre             VARCHAR(100),
        capacidad          INTEGER DEFAULT 4,
        "posicionX"        INTEGER DEFAULT 0,
        "posicionY"        INTEGER DEFAULT 0,
        forma              VARCHAR(20) DEFAULT 'cuadrada',
        estado             VARCHAR(20) DEFAULT 'disponible',
        "comandaActualId"  INTEGER,
        "isActive"         BOOLEAN DEFAULT true,
        "createdAt"        TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. CATEGORÍAS DEL MENÚ ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_categorias_menu (
        id                 SERIAL PRIMARY KEY,
        "empresaId"        INTEGER NOT NULL,
        nombre             VARCHAR(100) NOT NULL,
        descripcion        TEXT,
        icono              VARCHAR(50),
        color              VARCHAR(20),
        orden              INTEGER DEFAULT 0,
        "disponibleDesde"  TIME,
        "disponibleHasta"  TIME,
        "isActive"         BOOLEAN DEFAULT true
      )
    `);

    // ── 4. MENÚ / PLATOS ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_menu_items (
        id                       SERIAL PRIMARY KEY,
        "empresaId"              INTEGER NOT NULL,
        "categoriaId"            INTEGER REFERENCES rs_categorias_menu(id) ON DELETE SET NULL,
        codigo                   VARCHAR(50),
        nombre                   VARCHAR(200) NOT NULL,
        descripcion              TEXT,
        "imagenUrl"              TEXT,
        precio                   DECIMAL(10,2) NOT NULL,
        "precioEspecial"         DECIMAL(10,2),
        costo                    DECIMAL(10,2),
        "tiempoPreparacionMin"   INTEGER DEFAULT 15,
        disponible               BOOLEAN DEFAULT true,
        "disponibleParaDelivery" BOOLEAN DEFAULT true,
        "disponibleParaLlevar"   BOOLEAN DEFAULT true,
        "controlStock"           BOOLEAN DEFAULT false,
        "stockActual"            INTEGER,
        "productoId"             INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        calorias                 INTEGER,
        alergenos                TEXT,
        "esVegetariano"          BOOLEAN DEFAULT false,
        "esVegano"               BOOLEAN DEFAULT false,
        "esGlutenFree"           BOOLEAN DEFAULT false,
        "permiteModificaciones"  BOOLEAN DEFAULT true,
        "isActive"               BOOLEAN DEFAULT true,
        "createdAt"              TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 5. MODIFICADORES / OPCIONES ───────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_modificadores (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        "menuItemId" INTEGER REFERENCES rs_menu_items(id) ON DELETE CASCADE,
        nombre       VARCHAR(100) NOT NULL,
        tipo         VARCHAR(20) DEFAULT 'opcional',
        opciones     JSONB,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    // ── 6. COMBOS / PAQUETES ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_combos (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        nombre       VARCHAR(200) NOT NULL,
        descripcion  TEXT,
        precio       DECIMAL(10,2) NOT NULL,
        "imagenUrl"  TEXT,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_combo_items (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        "comboId"    INTEGER NOT NULL REFERENCES rs_combos(id) ON DELETE CASCADE,
        "menuItemId" INTEGER NOT NULL REFERENCES rs_menu_items(id),
        cantidad     INTEGER DEFAULT 1,
        "esOpcional" BOOLEAN DEFAULT false
      )
    `);

    // ── 7. RESERVACIONES ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_reservaciones (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        numero                  VARCHAR(20),
        "clienteNombre"         VARCHAR(200) NOT NULL,
        "clienteTelefono"       VARCHAR(20),
        "clienteEmail"          VARCHAR(100),
        "clienteId"             INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        fecha                   DATE NOT NULL,
        hora                    TIME NOT NULL,
        "numPersonas"           INTEGER NOT NULL,
        "mesaId"                INTEGER REFERENCES rs_mesas(id) ON DELETE SET NULL,
        "ocasionEspecial"       VARCHAR(100),
        "peticionesEspeciales"  TEXT,
        estado                  VARCHAR(20) DEFAULT 'confirmada',
        "recordatorioEnviado"   BOOLEAN DEFAULT false,
        notas                   TEXT,
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 8. COMANDAS ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_comandas (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        numero           VARCHAR(20),
        "mesaId"         INTEGER NOT NULL REFERENCES rs_mesas(id),
        "meseroId"       INTEGER,
        "meseroNombre"   VARCHAR(100),
        "clienteId"      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        "numPersonas"    INTEGER DEFAULT 1,
        "fechaApertura"  TIMESTAMP DEFAULT NOW(),
        "fechaCierre"    TIMESTAMP,
        subtotal         DECIMAL(12,2) DEFAULT 0,
        descuento        DECIMAL(12,2) DEFAULT 0,
        propina          DECIMAL(12,2) DEFAULT 0,
        itbis            DECIMAL(12,2) DEFAULT 0,
        total            DECIMAL(12,2) DEFAULT 0,
        estado           VARCHAR(20) DEFAULT 'abierta',
        "metodoPago"     VARCHAR(50),
        "facturaId"      INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
        notas            TEXT,
        "createdAt"      TIMESTAMP DEFAULT NOW(),
        "updatedAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── FK circular rs_mesas.comandaActualId → rs_comandas ────────────────
    await qr.query(`
      ALTER TABLE rs_mesas
        ADD CONSTRAINT fk_rs_mesa_comanda_actual
        FOREIGN KEY ("comandaActualId") REFERENCES rs_comandas(id) ON DELETE SET NULL
    `);

    // ── 9. ITEMS DE COMANDA ───────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_comanda_items (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "comandaId"         INTEGER NOT NULL REFERENCES rs_comandas(id) ON DELETE CASCADE,
        "menuItemId"        INTEGER NOT NULL REFERENCES rs_menu_items(id),
        cantidad            INTEGER NOT NULL DEFAULT 1,
        "precioUnitario"    DECIMAL(10,2) NOT NULL,
        descuento           DECIMAL(10,2) DEFAULT 0,
        total               DECIMAL(12,2),
        modificaciones      JSONB,
        "notasEspeciales"   TEXT,
        "estadoCocina"      VARCHAR(20) DEFAULT 'pendiente',
        "enviadoCocinaAt"   TIMESTAMP,
        "listoCocinaAt"     TIMESTAMP,
        "entregadoAt"       TIMESTAMP,
        "numeroRonda"       INTEGER DEFAULT 1,
        cancelado           BOOLEAN DEFAULT false,
        "motivoCancelacion" TEXT,
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 10. PEDIDOS DELIVERY ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_pedidos_delivery (
        id                     SERIAL PRIMARY KEY,
        "empresaId"            INTEGER NOT NULL,
        numero                 VARCHAR(20),
        "clienteNombre"        VARCHAR(200) NOT NULL,
        "clienteTelefono"      VARCHAR(20) NOT NULL,
        "clienteEmail"         VARCHAR(100),
        "clienteId"            INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        "direccionEntrega"     TEXT NOT NULL,
        "referenciasDireccion" TEXT,
        "fechaPedido"          TIMESTAMP DEFAULT NOW(),
        "fechaEstimadaEntrega" TIMESTAMP,
        "fechaEntregaReal"     TIMESTAMP,
        "repartidorNombre"     VARCHAR(100),
        "repartidorTelefono"   VARCHAR(20),
        subtotal               DECIMAL(12,2) DEFAULT 0,
        "costoEnvio"           DECIMAL(10,2) DEFAULT 0,
        descuento              DECIMAL(12,2) DEFAULT 0,
        itbis                  DECIMAL(12,2) DEFAULT 0,
        total                  DECIMAL(12,2) DEFAULT 0,
        estado                 VARCHAR(30) DEFAULT 'recibido',
        "metodoPago"           VARCHAR(50),
        "pagadoOnline"         BOOLEAN DEFAULT false,
        "comandaId"            INTEGER REFERENCES rs_comandas(id) ON DELETE SET NULL,
        "facturaId"            INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
        notas                  TEXT,
        "createdAt"            TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 11. TURNOS ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_turnos (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        numero               VARCHAR(20),
        "usuarioId"          INTEGER,
        "usuarioNombre"      VARCHAR(100),
        "fechaApertura"      TIMESTAMP DEFAULT NOW(),
        "fechaCierre"        TIMESTAMP,
        "fondoInicial"       DECIMAL(12,2) DEFAULT 0,
        "totalVentas"        DECIMAL(12,2) DEFAULT 0,
        "totalEfectivo"      DECIMAL(12,2) DEFAULT 0,
        "totalTarjeta"       DECIMAL(12,2) DEFAULT 0,
        "totalTransferencia" DECIMAL(12,2) DEFAULT 0,
        "totalPropinas"      DECIMAL(12,2) DEFAULT 0,
        "totalDescuentos"    DECIMAL(12,2) DEFAULT 0,
        "efectivoContado"    DECIMAL(12,2),
        diferencia           DECIMAL(12,2),
        estado               VARCHAR(20) DEFAULT 'abierto',
        notas                TEXT,
        "createdAt"          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 12. KDS ESTACIONES ────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_kds_estaciones (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        nombre       VARCHAR(100) NOT NULL,
        categorias   JSONB,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    // ── 13. PROPINAS ──────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rs_propinas (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        "comandaId"    INTEGER REFERENCES rs_comandas(id) ON DELETE SET NULL,
        "meseroId"     INTEGER,
        "meseroNombre" VARCHAR(100),
        monto          DECIMAL(10,2) NOT NULL,
        porcentaje     DECIMAL(5,2),
        "metodoPago"   VARCHAR(50),
        fecha          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── ÍNDICES ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_mesas_empresa       ON rs_mesas           ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_mesas_estado        ON rs_mesas           ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_comandas_empresa    ON rs_comandas        ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_comandas_estado     ON rs_comandas        ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_comandas_mesa       ON rs_comandas        ("mesaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_menu_empresa        ON rs_menu_items      ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_comanda_items_cocina ON rs_comanda_items  ("estadoCocina")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rs_delivery_empresa    ON rs_pedidos_delivery("empresaId", estado)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Remover FK circular antes de drop
    await qr.query(`ALTER TABLE rs_mesas DROP CONSTRAINT IF EXISTS fk_rs_mesa_comanda_actual`);

    // Índices
    await qr.query(`DROP INDEX IF EXISTS idx_rs_delivery_empresa`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_comanda_items_cocina`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_menu_empresa`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_comandas_mesa`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_comandas_estado`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_comandas_empresa`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_mesas_estado`);
    await qr.query(`DROP INDEX IF EXISTS idx_rs_mesas_empresa`);

    // Tablas en orden inverso (respetando FKs)
    await qr.query(`DROP TABLE IF EXISTS rs_propinas`);
    await qr.query(`DROP TABLE IF EXISTS rs_kds_estaciones`);
    await qr.query(`DROP TABLE IF EXISTS rs_turnos`);
    await qr.query(`DROP TABLE IF EXISTS rs_pedidos_delivery`);
    await qr.query(`DROP TABLE IF EXISTS rs_comanda_items`);
    await qr.query(`DROP TABLE IF EXISTS rs_comandas`);
    await qr.query(`DROP TABLE IF EXISTS rs_reservaciones`);
    await qr.query(`DROP TABLE IF EXISTS rs_combo_items`);
    await qr.query(`DROP TABLE IF EXISTS rs_combos`);
    await qr.query(`DROP TABLE IF EXISTS rs_modificadores`);
    await qr.query(`DROP TABLE IF EXISTS rs_menu_items`);
    await qr.query(`DROP TABLE IF EXISTS rs_categorias_menu`);
    await qr.query(`DROP TABLE IF EXISTS rs_mesas`);
    await qr.query(`DROP TABLE IF EXISTS rs_areas`);

    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'restaurante'`);
  }
}
