import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFarmaciaModule1750040000000 implements MigrationInterface {
  name = 'CreateFarmaciaModule1750040000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Registrar módulo ────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('farmacia', 'Módulo Farmacia',
        'Gestión completa para farmacias: medicamentos, lotes, vencimientos, dispensación de recetas, control narcóticos, ARS y facturación')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. MEDICAMENTOS ─────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_medicamentos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        codigo VARCHAR(50),
        "codigoBarra" VARCHAR(100),
        "nombreGenerico" VARCHAR(200) NOT NULL,
        "nombreComercial" VARCHAR(200),
        laboratorio VARCHAR(100),
        categoria VARCHAR(100),
        forma VARCHAR(50),
        concentracion VARCHAR(100),
        via VARCHAR(50),
        "unidadMedida" VARCHAR(30),
        "requiereReceta" BOOLEAN DEFAULT false,
        "esNarcotico" BOOLEAN DEFAULT false,
        "esPsicotropico" BOOLEAN DEFAULT false,
        "esRefrigerado" BOOLEAN DEFAULT false,
        "precioCompra" DECIMAL(10,2),
        "precioVenta" DECIMAL(10,2) NOT NULL DEFAULT 0,
        "precioArs" DECIMAL(10,2),
        "margenGanancia" DECIMAL(5,2),
        "stockMinimo" INTEGER DEFAULT 10,
        "stockMaximo" INTEGER,
        "stockActual" INTEGER DEFAULT 0,
        "productoId" INTEGER REFERENCES productos(id),
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. LOTES ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_lotes (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "medicamentoId" INTEGER NOT NULL REFERENCES fa_medicamentos(id),
        "numeroLote" VARCHAR(100) NOT NULL,
        "fechaFabricacion" DATE,
        "fechaVencimiento" DATE NOT NULL,
        "cantidadInicial" INTEGER NOT NULL,
        "cantidadActual" INTEGER NOT NULL,
        "proveedorId" INTEGER REFERENCES proveedores(id),
        "fechaCompra" DATE,
        "precioCompra" DECIMAL(10,2),
        "facturaCompra" VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'activo',
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. DISPENSACIONES ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_dispensaciones (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        fecha TIMESTAMP DEFAULT NOW(),
        "clienteId" INTEGER REFERENCES clientes(id),
        "clienteNombre" VARCHAR(200),
        "clienteCedula" VARCHAR(20),
        "recetaMedico" VARCHAR(200),
        "recetaNumero" VARCHAR(100),
        "recetaFecha" DATE,
        "arsNombre" VARCHAR(100),
        "arsNumeroAfiliado" VARCHAR(50),
        "autorizacionArs" VARCHAR(100),
        "farmaceuticoId" INTEGER,
        "farmaceuticoNombre" VARCHAR(200),
        subtotal DECIMAL(12,2) DEFAULT 0,
        descuento DECIMAL(12,2) DEFAULT 0,
        "montoCubierto" DECIMAL(12,2) DEFAULT 0,
        itbis DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) DEFAULT 0,
        "metodoPago" VARCHAR(50),
        "facturaId" INTEGER REFERENCES facturas(id),
        estado VARCHAR(20) DEFAULT 'completada',
        notas TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 4. ITEMS DE DISPENSACIÓN ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_dispensacion_items (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "dispensacionId" INTEGER NOT NULL REFERENCES fa_dispensaciones(id) ON DELETE CASCADE,
        "medicamentoId" INTEGER NOT NULL REFERENCES fa_medicamentos(id),
        "loteId" INTEGER REFERENCES fa_lotes(id),
        cantidad DECIMAL(8,2) NOT NULL,
        "precioUnitario" DECIMAL(10,2) NOT NULL,
        descuento DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(12,2),
        instrucciones TEXT,
        "requeriReceta" BOOLEAN DEFAULT false,
        "recetaVerificada" BOOLEAN DEFAULT false
      )
    `);

    // ── 5. CONTROL NARCÓTICOS ────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_control_narcoticos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "medicamentoId" INTEGER NOT NULL REFERENCES fa_medicamentos(id),
        "loteId" INTEGER REFERENCES fa_lotes(id),
        "dispensacionId" INTEGER REFERENCES fa_dispensaciones(id),
        fecha TIMESTAMP DEFAULT NOW(),
        tipo VARCHAR(20),
        cantidad DECIMAL(8,2) NOT NULL,
        "saldoAnterior" DECIMAL(10,2),
        "saldoActual" DECIMAL(10,2),
        "receptorNombre" VARCHAR(200),
        "receptorCedula" VARCHAR(20),
        "receptorMedico" VARCHAR(200),
        "recetaNumero" VARCHAR(100),
        "autorizadoPor" VARCHAR(200),
        observaciones TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 6. RECEPCIONES ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_recepciones (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        fecha DATE NOT NULL,
        "proveedorId" INTEGER REFERENCES proveedores(id),
        "facturaProveedor" VARCHAR(100),
        subtotal DECIMAL(12,2) DEFAULT 0,
        itbis DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) DEFAULT 0,
        "compraId" INTEGER,
        estado VARCHAR(20) DEFAULT 'recibida',
        notas TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 7. ITEMS DE RECEPCIÓN ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_recepcion_items (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "recepcionId" INTEGER NOT NULL REFERENCES fa_recepciones(id) ON DELETE CASCADE,
        "medicamentoId" INTEGER NOT NULL REFERENCES fa_medicamentos(id),
        "numeroLote" VARCHAR(100) NOT NULL,
        "fechaVencimiento" DATE NOT NULL,
        "cantidadOrdenada" INTEGER,
        "cantidadRecibida" INTEGER NOT NULL,
        "precioCompra" DECIMAL(10,2),
        "precioVenta" DECIMAL(10,2),
        subtotal DECIMAL(12,2)
      )
    `);

    // ── 8. DEVOLUCIONES ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_devoluciones (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "dispensacionId" INTEGER REFERENCES fa_dispensaciones(id),
        fecha TIMESTAMP DEFAULT NOW(),
        motivo TEXT NOT NULL,
        "montoDevuelto" DECIMAL(12,2),
        estado VARCHAR(20) DEFAULT 'procesada',
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 9. RECLAMACIONES ARS ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_reclamaciones_ars (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "arsNombre" VARCHAR(100) NOT NULL,
        "periodoDesde" DATE,
        "periodoHasta" DATE,
        "cantidadDispensaciones" INTEGER,
        "montoTotal" DECIMAL(12,2),
        "montoCubierto" DECIMAL(12,2),
        estado VARCHAR(30) DEFAULT 'pendiente',
        "fechaEnvio" DATE,
        "fechaPago" DATE,
        observaciones TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 10. ALERTAS ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE fa_alertas (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        tipo VARCHAR(30),
        "medicamentoId" INTEGER REFERENCES fa_medicamentos(id),
        "loteId" INTEGER REFERENCES fa_lotes(id),
        mensaje TEXT,
        "diasRestantes" INTEGER,
        resuelta BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Índices ────────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX idx_fa_medicamentos_empresa ON fa_medicamentos ("empresaId")`);
    await qr.query(`CREATE INDEX idx_fa_medicamentos_codigo ON fa_medicamentos ("empresaId", codigo)`);
    await qr.query(`CREATE INDEX idx_fa_lotes_vencimiento ON fa_lotes ("empresaId", "fechaVencimiento")`);
    await qr.query(`CREATE INDEX idx_fa_lotes_medicamento ON fa_lotes ("medicamentoId")`);
    await qr.query(`CREATE INDEX idx_fa_dispensaciones_empresa ON fa_dispensaciones ("empresaId")`);
    await qr.query(`CREATE INDEX idx_fa_dispensaciones_fecha ON fa_dispensaciones ("empresaId", fecha DESC)`);
    await qr.query(`CREATE INDEX idx_fa_control_narcoticos ON fa_control_narcoticos ("empresaId", "medicamentoId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_fa_control_narcoticos`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_dispensaciones_fecha`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_dispensaciones_empresa`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_lotes_medicamento`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_lotes_vencimiento`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_medicamentos_codigo`);
    await qr.query(`DROP INDEX IF EXISTS idx_fa_medicamentos_empresa`);
    await qr.query(`DROP TABLE IF EXISTS fa_alertas`);
    await qr.query(`DROP TABLE IF EXISTS fa_reclamaciones_ars`);
    await qr.query(`DROP TABLE IF EXISTS fa_devoluciones`);
    await qr.query(`DROP TABLE IF EXISTS fa_recepcion_items`);
    await qr.query(`DROP TABLE IF EXISTS fa_recepciones`);
    await qr.query(`DROP TABLE IF EXISTS fa_control_narcoticos`);
    await qr.query(`DROP TABLE IF EXISTS fa_dispensacion_items`);
    await qr.query(`DROP TABLE IF EXISTS fa_dispensaciones`);
    await qr.query(`DROP TABLE IF EXISTS fa_lotes`);
    await qr.query(`DROP TABLE IF EXISTS fa_medicamentos`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'farmacia'`);
  }
}
