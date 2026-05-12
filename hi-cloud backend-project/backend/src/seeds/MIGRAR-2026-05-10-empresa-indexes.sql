-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: Índices empresaId en 110 tablas (crítico para escalar a 1M registros)
-- Fecha: 2026-05-10
-- IMPORTANTE: CREATE INDEX CONCURRENTLY no puede ir dentro de transacción
-- Ejecutar fuera de BEGIN/COMMIT — cada statement es autónomo
-- ─────────────────────────────────────────────────────────────────────────────

-- TIER 1: Tablas de alta frecuencia de consulta
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gastos_empresaId ON gastos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notas_debito_empresaId ON notas_debito("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_empresaId ON audit_logs("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asientos_contables_empresaId ON asientos_contables("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activos_fijos_empresaId ON activos_fijos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_almacenes_empresaId ON almacenes("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_empresaId ON contratos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empleados_empresaId ON empleados("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nomina_periodos_empresaId ON nomina_periodos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presupuestos_empresaId ON presupuestos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proyectos_empresaId ON proyectos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cuentas_bancarias_empresaId ON cuentas_bancarias("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cuentas_contables_empresaId ON cuentas_contables("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pre_facturas_empresaId ON pre_facturas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devoluciones_empresaId ON devoluciones("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitaciones_empresaId ON invitaciones("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suscripciones_empresaId ON suscripciones("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proveedores_empresaId ON proveedores("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secuencias_ecf_empresaId ON secuencias_ecf("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendedores_empresaId ON vendedores("empresaId");

-- TIER 2: Tablas de transacciones y detalles
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_factura_detalles_empresaId ON factura_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compra_detalles_empresaId ON compra_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asiento_lineas_empresaId ON asiento_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cotizacion_detalles_empresaId ON cotizacion_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pre_factura_detalles_empresaId ON pre_factura_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devolucion_detalles_empresaId ON devolucion_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_debito_detalles_empresaId ON nota_debito_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_credito_compra_det_empresaId ON nota_credito_compra_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nomina_lineas_empresaId ON nomina_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nomina_novedades_empresaId ON nomina_novedades("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_servicio_empresaId ON ordenes_servicio("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_produccion_empresaId ON ordenes_produccion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_mantenimiento_empresaId ON ordenes_mantenimiento("empresaId");

-- TIER 3: Módulos de RRHH, CRM y operaciones
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ausencias_empresaId ON ausencias("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evaluaciones_empresaId ON evaluaciones_empleado("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_laborales_empresaId ON contratos_laborales("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_solicitudes_vacacion_empresaId ON solicitudes_vacacion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_leads_empresaId ON crm_leads("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_actividades_empresaId ON crm_actividades("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_oportunidades_empresaId ON crm_oportunidades("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_licitaciones_empresaId ON licitaciones("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encuestas_empresaId ON encuestas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_soporte_empresaId ON tickets_soporte("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_objetivos_empresaId ON objetivos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_clave_empresaId ON resultados_clave("empresaId");

-- TIER 4: Finanzas y bancos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cheques_empresaId ON cheques("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chequeras_empresaId ON chequeras("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_bancarios_empresaId ON movimientos_bancarios("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conciliaciones_bancarias_empresaId ON conciliaciones_bancarias("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transacciones_tarjeta_empresaId ON transacciones_tarjeta("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conciliaciones_datafono_empresaId ON conciliaciones_datafono("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pagos_cobrados_empresaId ON pagos_cobrados("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pagos_realizados_empresaId ON pagos_realizados("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retenciones_isr_empresaId ON retenciones_isr("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recibos_cobro_empresaId ON recibos_cobro("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comisiones_empresaId ON comisiones("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cuentas_estadisticas_empresaId ON cuentas_estadisticas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_estadisticos_empresaId ON movimientos_estadisticos("empresaId");

-- TIER 5: Inventario, manufactura y logística
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lotes_producto_empresaId ON lotes_producto("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seriales_producto_empresaId ON seriales_producto("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_almacen_empresaId ON stock_almacen("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transferencias_almacen_empresaId ON transferencias_almacen("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listas_materiales_empresaId ON listas_materiales("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_componentes_lm_empresaId ON componentes_lm("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rutas_produccion_empresaId ON rutas_produccion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planes_demanda_empresaId ON planes_demanda("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plan_demanda_lineas_empresaId ON plan_demanda_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wms_ordenes_picking_empresaId ON wms_ordenes_picking("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wms_lineas_picking_empresaId ON wms_lineas_picking("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wms_ubicaciones_empresaId ON wms_ubicaciones("empresaId");

-- TIER 6: Configuración y catálogos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_centros_costo_empresaId ON centros_costo("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_centros_trabajo_empresaId ON centros_trabajo("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unidades_medida_empresaId ON unidades_medida("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categorias_activos_empresaId ON categorias_activos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_depreciaciones_activos_empresaId ON depreciaciones_activos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asignaciones_costo_empresaId ON asignaciones_costo("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reglas_comision_empresaId ON reglas_comision("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reglas_distribucion_empresaId ON reglas_distribucion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regla_distribucion_lineas_empresaId ON regla_distribucion_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_precios_especiales_empresaId ON precios_especiales("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversiones_uom_empresaId ON conversiones_uom("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proveedores_ecf_empresaId ON proveedores_ecf("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programa_fidelidad_empresaId ON programa_fidelidad("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendedor_clientes_empresaId ON vendedor_clientes("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuario_empresa_empresaId ON usuario_empresa("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificaciones_enviadas_empresaId ON notificaciones_enviadas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reportes_generados_empresaId ON reportes_generados("empresaId");

-- TIER 7: Proyectos y capacitación
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proyecto_tareas_empresaId ON proyecto_tareas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proyecto_tiempos_empresaId ON proyecto_tiempos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hitos_proyecto_empresaId ON hitos_proyecto("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presupuesto_proyecto_lineas_empresaId ON presupuesto_proyecto_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presupuesto_lineas_empresaId ON presupuesto_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cursos_capacitacion_empresaId ON cursos_capacitacion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sesiones_capacitacion_empresaId ON sesiones_capacitacion("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registros_capacitacion_empresaId ON registros_capacitacion("empresaId");

-- TIER 8: Flota, mantenimiento y operaciones
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculos_empresaId ON vehiculos("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registros_flota_empresaId ON registros_flota("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_programas_mantenimiento_empresaId ON programas_mantenimiento("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ordenes_mantenimiento_empresaId2 ON ordenes_mantenimiento("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_solicitudes_compra_empresaId ON solicitudes_compra("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_solicitud_compra_lineas_empresaId ON solicitud_compra_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cotizacion_proveedor_empresaId ON cotizaciones_proveedor("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cotizacion_proveedor_lineas_empresaId ON cotizacion_proveedor_lineas("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_terminales_datafono_empresaId ON terminales_datafono("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_etapas_ruta_empresaId ON etapas_ruta("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registro_etapas_orden_empresaId ON registro_etapas_orden("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orden_servicio_detalles_empresaId ON orden_servicio_detalles("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_facturas_recurrentes_empresaId ON facturas_recurrentes("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notas_credito_compras_empresaId ON notas_credito_compras("empresaId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_encuesta_empresaId ON respuestas_encuesta("empresaId");
