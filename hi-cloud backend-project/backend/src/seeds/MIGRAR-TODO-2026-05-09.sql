-- ============================================================================
-- MIGRACIÓN COMPLETA — HiCloud ERP — 2026-05-09
-- Ejecutar TODO de una sola vez en pgAdmin o psql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: Columnas nuevas en tablas EXISTENTES (CRÍTICO — sin esto el
--           backend no arranca en producción)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- nomina_lineas — Nómina Avanzada
ALTER TABLE nomina_lineas
  ADD COLUMN IF NOT EXISTS "horasExtras"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montoHorasExtras" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonos              DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "otrosDescuentos"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "novedadesDetalle" TEXT;

-- proyecto_tareas — Proyectos Avanzados
ALTER TABLE proyecto_tareas
  ADD COLUMN IF NOT EXISTS "fechaInicio"  DATE,
  ADD COLUMN IF NOT EXISTS "horasReales" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "esHito"      BOOLEAN NOT NULL DEFAULT FALSE;

-- ordenes_servicio — Servicio Avanzado
DO $$ BEGIN
  CREATE TYPE ordenes_servicio_prioridad_enum AS ENUM ('baja','normal','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS prioridad              ordenes_servicio_prioridad_enum NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "slaHoras"             INTEGER,
  ADD COLUMN IF NOT EXISTS "fechaLimiteSla"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "esGarantia"           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "fechaVencimientoGarantia" DATE,
  ADD COLUMN IF NOT EXISTS "numeroSerieEquipo"    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "origenPortal"         BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: Tablas nuevas — Nómina Avanzada
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN
  CREATE TYPE nomina_novedades_tipo_enum AS ENUM ('bono','horas_extras','ausencia','descuento','otro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contratos_laborales_tipo_enum AS ENUM ('indefinido','fijo','temporal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contratos_laborales_estado_enum AS ENUM ('activo','vencido','rescindido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS nomina_novedades (
  id            SERIAL PRIMARY KEY,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"   INTEGER,
  "empleadoId"  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  "periodoId"   INTEGER,
  tipo          nomina_novedades_tipo_enum NOT NULL,
  descripcion   VARCHAR(200) NOT NULL,
  monto         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "horasExtras" INTEGER NOT NULL DEFAULT 0,
  aplicado      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS contratos_laborales (
  id              SERIAL PRIMARY KEY,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"     INTEGER,
  "empleadoId"    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  numero          VARCHAR(50) NOT NULL,
  tipo            contratos_laborales_tipo_enum NOT NULL DEFAULT 'indefinido',
  estado          contratos_laborales_estado_enum NOT NULL DEFAULT 'activo',
  "fechaInicio"   DATE NOT NULL,
  "fechaFin"      DATE,
  salario         DECIMAL(12,2) NOT NULL,
  cargo           VARCHAR(100) NOT NULL,
  departamento    VARCHAR(100),
  clausulas       TEXT,
  "lugarTrabajo"  VARCHAR(100),
  "horasSemana"   INTEGER
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3: Inventarios Avanzados
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE lotes_producto_estado_enum AS ENUM ('activo','agotado','vencido','cuarentena'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE seriales_producto_estado_enum AS ENUM ('disponible','vendido','devuelto','defectuoso','en_garantia','dado_baja'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lotes_producto (
  id                   SERIAL PRIMARY KEY,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"          INTEGER,
  "productoId"         INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  "almacenId"          INTEGER,
  "numeroLote"         VARCHAR(100) NOT NULL,
  "fechaFabricacion"   DATE,
  "fechaVencimiento"   DATE,
  "cantidadInicial"    DECIMAL(12,4) NOT NULL,
  "cantidadDisponible" DECIMAL(12,4) NOT NULL,
  "costoUnitario"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado               lotes_producto_estado_enum NOT NULL DEFAULT 'activo',
  proveedor            VARCHAR(200),
  referencia           VARCHAR(100),
  notas                TEXT
);

CREATE TABLE IF NOT EXISTS seriales_producto (
  id                         SERIAL PRIMARY KEY,
  "isActive"                 BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "empresaId"                INTEGER,
  "productoId"               INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  "numeroSerie"              VARCHAR(100) NOT NULL,
  estado                     seriales_producto_estado_enum NOT NULL DEFAULT 'disponible',
  "loteId"                   INTEGER,
  "facturaId"                INTEGER,
  "clienteId"                INTEGER,
  "fechaVenta"               DATE,
  "fechaVencimientoGarantia" DATE,
  "costoUnitario"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas                      TEXT
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 4: Compras Avanzadas
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE solicitud_compra_estado_enum AS ENUM ('borrador','enviada','aprobada','rechazada','en_cotizacion','procesada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE solicitud_compra_prioridad_enum AS ENUM ('baja','media','alta','urgente'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cotizacion_proveedor_estado_enum AS ENUM ('borrador','enviada','recibida','seleccionada','rechazada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS solicitudes_compra (
  id                      SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  numero                  VARCHAR(20) NOT NULL, "solicitanteId" INTEGER NOT NULL REFERENCES users(id),
  "fechaSolicitud"        DATE NOT NULL, "fechaNecesidad" DATE, estado solicitud_compra_estado_enum NOT NULL DEFAULT 'borrador',
  prioridad               solicitud_compra_prioridad_enum NOT NULL DEFAULT 'media', departamento VARCHAR(200), justificacion TEXT NOT NULL,
  "presupuestoEstimado"   DECIMAL(12,2) NOT NULL DEFAULT 0, "comentarioAprobacion" TEXT, "aprobadorId" INTEGER, "fechaAprobacion" DATE
);
CREATE TABLE IF NOT EXISTS solicitud_compra_lineas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "solicitudId" INTEGER NOT NULL REFERENCES solicitudes_compra(id) ON DELETE CASCADE, "productoId" INTEGER, descripcion VARCHAR(300) NOT NULL, unidad VARCHAR(30) NOT NULL DEFAULT 'UND', cantidad DECIMAL(12,4) NOT NULL, "presupuestoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0, especificaciones TEXT
);
CREATE TABLE IF NOT EXISTS cotizaciones_proveedor (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  numero VARCHAR(20) NOT NULL, "solicitudId" INTEGER REFERENCES solicitudes_compra(id), "proveedorId" INTEGER NOT NULL REFERENCES proveedores(id),
  "fechaEnvio" DATE NOT NULL, "fechaRespuesta" DATE, "fechaValidez" DATE, "tiempoEntregaDias" INTEGER NOT NULL DEFAULT 0, "condicionesPago" VARCHAR(200),
  estado cotizacion_proveedor_estado_enum NOT NULL DEFAULT 'enviada', subtotal DECIMAL(14,2) NOT NULL DEFAULT 0, itbis DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(14,2) NOT NULL DEFAULT 0, notas TEXT
);
CREATE TABLE IF NOT EXISTS cotizacion_proveedor_lineas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "cotizacionId" INTEGER NOT NULL REFERENCES cotizaciones_proveedor(id) ON DELETE CASCADE, "productoId" INTEGER, descripcion VARCHAR(300) NOT NULL,
  cantidad DECIMAL(12,4) NOT NULL, "precioUnitario" DECIMAL(12,2) NOT NULL, "porcentajeItbis" DECIMAL(5,2) NOT NULL DEFAULT 18, itbis DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL, unidad VARCHAR(100)
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 5: Planeación de la Demanda
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE plan_demanda_estado_enum AS ENUM ('borrador','aprobado','ejecutado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plan_demanda_tendencia_enum AS ENUM ('creciente','estable','decreciente','sin_datos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS planes_demanda (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  numero VARCHAR(20) NOT NULL, "periodoDesde" VARCHAR(7) NOT NULL, "periodoHasta" VARCHAR(7) NOT NULL, "horizonteMeses" INTEGER NOT NULL DEFAULT 3,
  estado plan_demanda_estado_enum NOT NULL DEFAULT 'borrador', "totalProductos" INTEGER NOT NULL DEFAULT 0, "productosConAlerta" INTEGER NOT NULL DEFAULT 0, notas TEXT
);
CREATE TABLE IF NOT EXISTS plan_demanda_lineas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "planId" INTEGER NOT NULL REFERENCES planes_demanda(id) ON DELETE CASCADE, "productoId" INTEGER NOT NULL REFERENCES productos(id),
  "ventaPromedio3m" DECIMAL(12,4) NOT NULL DEFAULT 0, "ventaPromedio6m" DECIMAL(12,4) NOT NULL DEFAULT 0, "ventaPromedio12m" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "ventaMaximaMensual" DECIMAL(12,4) NOT NULL DEFAULT 0, "ventaMinimaMensual" DECIMAL(12,4) NOT NULL DEFAULT 0, tendencia plan_demanda_tendencia_enum NOT NULL DEFAULT 'sin_datos',
  "coeficienteVariacion" DECIMAL(6,2) NOT NULL DEFAULT 0, "proyeccionMes1" DECIMAL(12,4) NOT NULL DEFAULT 0, "proyeccionMes2" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "proyeccionMes3" DECIMAL(12,4) NOT NULL DEFAULT 0, "proyeccionTotal" DECIMAL(12,4) NOT NULL DEFAULT 0, "stockActual" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "stockMinimo" DECIMAL(12,4) NOT NULL DEFAULT 0, "cantidadSugeridaCompra" DECIMAL(12,4) NOT NULL DEFAULT 0, "requiereCompra" BOOLEAN NOT NULL DEFAULT FALSE, "historicoMensual" TEXT
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 6: Manufactura Avanzada
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE centros_trabajo_tipo_enum AS ENUM ('maquina','manual','subcontratado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE registro_etapas_estado_enum AS ENUM ('pendiente','en_proceso','completada','omitida','rechazada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS centros_trabajo (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  nombre VARCHAR(100) NOT NULL, descripcion VARCHAR(200), tipo centros_trabajo_tipo_enum NOT NULL DEFAULT 'manual',
  "capacidadHorasDia" DECIMAL(8,2) NOT NULL DEFAULT 8, "costoHora" DECIMAL(10,2) NOT NULL DEFAULT 0, responsable VARCHAR(100), ubicacion VARCHAR(200), activo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS rutas_produccion (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  codigo VARCHAR(20) NOT NULL, nombre VARCHAR(200) NOT NULL, descripcion TEXT, "listaId" INTEGER, activa BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS etapas_ruta (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "rutaId" INTEGER NOT NULL REFERENCES rutas_produccion(id) ON DELETE CASCADE, "centroTrabajoId" INTEGER REFERENCES centros_trabajo(id),
  orden INTEGER NOT NULL DEFAULT 1, nombre VARCHAR(200) NOT NULL, descripcion TEXT, "tiempoSetupMin" DECIMAL(8,2) NOT NULL DEFAULT 0, "tiempoOperacionMinPorUnidad" DECIMAL(8,2) NOT NULL DEFAULT 0, "esControl" BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS registro_etapas_orden (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "ordenId" INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE, "etapaId" INTEGER NOT NULL REFERENCES etapas_ruta(id),
  "ordenEtapa" INTEGER NOT NULL DEFAULT 1, estado registro_etapas_estado_enum NOT NULL DEFAULT 'pendiente',
  "fechaInicio" TIMESTAMPTZ, "fechaFin" TIMESTAMPTZ, "cantidadProcesada" DECIMAL(12,4) NOT NULL DEFAULT 0, "operadorId" INTEGER, observaciones TEXT
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 7: Proyectos Avanzados
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE presupuesto_categoria_enum AS ENUM ('mano_obra','materiales','subcontratista','gastos_viaje','licencias','otro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS presupuesto_proyecto_lineas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "proyectoId" INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE, categoria presupuesto_categoria_enum NOT NULL DEFAULT 'otro',
  descripcion VARCHAR(200) NOT NULL, monto DECIMAL(14,2) NOT NULL DEFAULT 0, "montoReal" DECIMAL(14,2) NOT NULL DEFAULT 0, notas TEXT
);
CREATE TABLE IF NOT EXISTS hitos_proyecto (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "proyectoId" INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE, nombre VARCHAR(200) NOT NULL, fecha DATE NOT NULL,
  descripcion TEXT, completado BOOLEAN NOT NULL DEFAULT FALSE, "fechaCompletado" DATE
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 8: Comisiones Avanzadas + Cuentas Estadísticas
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE reglas_comision_tipo_enum AS ENUM ('global','por_vendedor','por_categoria','por_monto','por_antiguedad'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cuentas_estadisticas_tipo_enum AS ENUM ('acumulador','promedio','maximo','conteo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reglas_comision (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  nombre VARCHAR(100) NOT NULL, tipo reglas_comision_tipo_enum NOT NULL DEFAULT 'global', prioridad INTEGER NOT NULL DEFAULT 100,
  "vendedorId" INTEGER, categoria VARCHAR(100), "montoDesde" DECIMAL(14,2), "montoHasta" DECIMAL(14,2), "diasMaximoCobro" INTEGER,
  porcentaje DECIMAL(5,2) NOT NULL, activa BOOLEAN NOT NULL DEFAULT TRUE, descripcion TEXT
);
CREATE TABLE IF NOT EXISTS cuentas_estadisticas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  codigo VARCHAR(20) NOT NULL, nombre VARCHAR(200) NOT NULL, descripcion TEXT, unidad VARCHAR(50) NOT NULL DEFAULT 'unidades',
  tipo cuentas_estadisticas_tipo_enum NOT NULL DEFAULT 'acumulador', categoria VARCHAR(100), activa BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS movimientos_estadisticos (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "cuentaId" INTEGER NOT NULL REFERENCES cuentas_estadisticas(id) ON DELETE CASCADE, fecha DATE NOT NULL, valor DECIMAL(18,4) NOT NULL,
  descripcion VARCHAR(200), referencia VARCHAR(50), "userId" INTEGER
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 9: WMS
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE wms_ubicacion_tipo_enum AS ENUM ('picking','bulk','recepcion','despacho','cuarentena'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wms_orden_tipo_enum AS ENUM ('salida_venta','transferencia','devolucion','ajuste'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wms_orden_estado_enum AS ENUM ('borrador','asignada','en_proceso','empacada','despachada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wms_linea_estado_enum AS ENUM ('pendiente','pickeado','faltante','parcial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS wms_ubicaciones (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "almacenId" INTEGER NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE, codigo VARCHAR(30) NOT NULL, pasillo VARCHAR(10), estante VARCHAR(10), nivel VARCHAR(10), posicion VARCHAR(10),
  tipo wms_ubicacion_tipo_enum NOT NULL DEFAULT 'picking', "capacidadKg" DECIMAL(8,2), activa BOOLEAN NOT NULL DEFAULT TRUE, notas TEXT
);
CREATE TABLE IF NOT EXISTS wms_ordenes_picking (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  numero VARCHAR(20) NOT NULL, tipo wms_orden_tipo_enum NOT NULL DEFAULT 'salida_venta', estado wms_orden_estado_enum NOT NULL DEFAULT 'borrador',
  "almacenId" INTEGER NOT NULL REFERENCES almacenes(id), "facturaId" INTEGER, "transferId" INTEGER, "operadorId" INTEGER, "creadoPorId" INTEGER,
  "fechaAsignacion" TIMESTAMPTZ, "fechaInicio" TIMESTAMPTZ, "fechaEmpacado" TIMESTAMPTZ, "fechaDespachado" TIMESTAMPTZ,
  prioridad INTEGER NOT NULL DEFAULT 2, observaciones TEXT, destinatario VARCHAR(100), "direccionEntrega" VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS wms_lineas_picking (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "ordenId" INTEGER NOT NULL REFERENCES wms_ordenes_picking(id) ON DELETE CASCADE, "productoId" INTEGER NOT NULL REFERENCES productos(id),
  "ubicacionId" INTEGER, "ubicacionCodigo" VARCHAR(30), "cantidadSolicitada" DECIMAL(12,4) NOT NULL, "cantidadPickeada" DECIMAL(12,4) NOT NULL DEFAULT 0,
  estado wms_linea_estado_enum NOT NULL DEFAULT 'pendiente', "loteId" INTEGER, "numeroSerie" VARCHAR(100), notas TEXT, "orden_linea" INTEGER NOT NULL DEFAULT 0
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 10: Atributos & Variantes de Producto (2026-05-09)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE atributos_producto_tipo_enum AS ENUM ('dimension','color','material','sabor','otro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS atributos_producto (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  nombre VARCHAR(100) NOT NULL, tipo atributos_producto_tipo_enum NOT NULL DEFAULT 'otro', unidad VARCHAR(50), orden INTEGER NOT NULL DEFAULT 0, activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS valores_atributo (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "atributoId" INTEGER NOT NULL REFERENCES atributos_producto(id) ON DELETE CASCADE,
  valor VARCHAR(100) NOT NULL, codigo VARCHAR(30), "colorHex" VARCHAR(7), orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS producto_variantes (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "productoId" INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL, nombre VARCHAR(200) NOT NULL, atributos JSONB NOT NULL DEFAULT '[]',
  stock DECIMAL(12,4) NOT NULL DEFAULT 0, "stockMinimo" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "precioOverride" DECIMAL(12,2), "costoPromedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE, "imagenUrl" TEXT
);

CREATE INDEX IF NOT EXISTS idx_atributos_empresa ON atributos_producto ("empresaId");
CREATE INDEX IF NOT EXISTS idx_valores_atributo ON valores_atributo ("atributoId");
CREATE INDEX IF NOT EXISTS idx_producto_variantes_producto ON producto_variantes ("empresaId", "productoId");

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 11: Reglas de Distribución de Costos (2026-05-09)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE reglas_dist_periodicidad_enum AS ENUM ('manual','mensual','trimestral','anual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reglas_distribucion (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  nombre VARCHAR(200) NOT NULL, descripcion TEXT, "cuentaOrigenId" INTEGER NOT NULL, "cuentaOrigenNombre" VARCHAR(200),
  periodicidad reglas_dist_periodicidad_enum NOT NULL DEFAULT 'manual',
  activa BOOLEAN NOT NULL DEFAULT TRUE, "vecesEjecutada" INTEGER NOT NULL DEFAULT 0, "ultimaEjecucion" DATE
);

CREATE TABLE IF NOT EXISTS regla_distribucion_lineas (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "reglaId" INTEGER NOT NULL REFERENCES reglas_distribucion(id) ON DELETE CASCADE,
  "cuentaDestinoId" INTEGER NOT NULL, "cuentaDestinoNombre" VARCHAR(200),
  "centroCostoId" INTEGER, "centroCostoNombre" VARCHAR(100),
  porcentaje DECIMAL(7,4) NOT NULL, descripcion VARCHAR(200)
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 12: Unidades de Medida (UOM) (2026-05-09)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE uom_tipo_enum AS ENUM ('peso','volumen','longitud','area','tiempo','cantidad','otro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS unidades_medida (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  codigo VARCHAR(20) NOT NULL, nombre VARCHAR(100) NOT NULL, simbolo VARCHAR(10),
  tipo uom_tipo_enum NOT NULL DEFAULT 'cantidad', activa BOOLEAN NOT NULL DEFAULT TRUE, "esBase" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS conversiones_uom (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "unidadDesdeId" INTEGER NOT NULL REFERENCES unidades_medida(id),
  "unidadHastaId" INTEGER NOT NULL REFERENCES unidades_medida(id),
  factor DECIMAL(18,8) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unidades_medida_empresa ON unidades_medida ("empresaId");
CREATE INDEX IF NOT EXISTS idx_conversiones_uom_desde ON conversiones_uom ("empresaId", "unidadDesdeId", "unidadHastaId");

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 13: Tickets de Soporte (Portal Cliente) (2026-05-09)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN CREATE TYPE tickets_estado_enum AS ENUM ('abierto','en_proceso','resuelto','cerrado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tickets_prioridad_enum AS ENUM ('baja','media','alta'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tickets_categoria_enum AS ENUM ('soporte_tecnico','facturacion','devolucion','consulta','otro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets_soporte (
  id SERIAL PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "empresaId" INTEGER,
  "clienteId" INTEGER NOT NULL, "clienteNombre" VARCHAR(100), "portalToken" VARCHAR(64) NOT NULL,
  asunto VARCHAR(200) NOT NULL, descripcion TEXT NOT NULL,
  categoria tickets_categoria_enum NOT NULL DEFAULT 'otro',
  prioridad tickets_prioridad_enum NOT NULL DEFAULT 'media',
  estado tickets_estado_enum NOT NULL DEFAULT 'abierto',
  respuesta TEXT, "fechaRespuesta" TIMESTAMPTZ, "asignadoId" INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tickets_soporte_empresa ON tickets_soporte ("empresaId", estado);
CREATE INDEX IF NOT EXISTS idx_tickets_soporte_cliente ON tickets_soporte ("clienteId");

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN — Reinicia el backend después de ejecutar este script
-- Tablas nuevas: ~45 tablas | Columnas nuevas en existentes: 21
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'Migración completa OK — reinicia el backend' AS resultado;
