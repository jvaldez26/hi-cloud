--
-- PostgreSQL database dump
--

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: activos_fijos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activos_fijos_estado_enum AS ENUM (
    'activo',
    'vendido',
    'dado_de_baja',
    'totalmente_depreciado'
);


--
-- Name: anticipo_cliente_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.anticipo_cliente_estado_enum AS ENUM (
    'activo',
    'aplicado',
    'anulado'
);


--
-- Name: aprobaciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aprobaciones_estado_enum AS ENUM (
    'pendiente',
    'aprobado',
    'rechazado'
);


--
-- Name: aprobaciones_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aprobaciones_tipo_enum AS ENUM (
    'cotizacion',
    'pre_factura',
    'compra',
    'gasto',
    'nota_debito',
    'otro'
);


--
-- Name: asientos_contables_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asientos_contables_estado_enum AS ENUM (
    'borrador',
    'contabilizado',
    'anulado'
);


--
-- Name: asientos_contables_tipoorigen_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asientos_contables_tipoorigen_enum AS ENUM (
    'manual',
    'factura',
    'compra',
    'cobro',
    'pago',
    'ajuste',
    'manufactura',
    'prestamista',
    'importacion',
    'nota_credito',
    'nota_debito',
    'nota_credito_compra',
    'venta_restaurante'
);


--
-- Name: atributos_producto_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.atributos_producto_tipo_enum AS ENUM (
    'dimension',
    'color',
    'material',
    'sabor',
    'otro'
);


--
-- Name: audit_logs_accion_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_logs_accion_enum AS ENUM (
    'create',
    'read',
    'update',
    'delete',
    'login',
    'logout',
    'export',
    'error'
);


--
-- Name: ausencias_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ausencias_tipo_enum AS ENUM (
    'enfermedad',
    'personal',
    'tardia',
    'sin_aviso',
    'maternidad',
    'paternidad',
    'luto',
    'licencia_especial'
);


--
-- Name: cajas_chicas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cajas_chicas_estado_enum AS ENUM (
    'activa',
    'cerrada'
);


--
-- Name: categorias_activos_metodo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.categorias_activos_metodo_enum AS ENUM (
    'linea_recta',
    'saldo_decreciente'
);


--
-- Name: centros_costo_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.centros_costo_tipo_enum AS ENUM (
    'ingreso',
    'egreso',
    'ambos'
);


--
-- Name: centros_trabajo_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.centros_trabajo_tipo_enum AS ENUM (
    'maquina',
    'manual',
    'subcontratado'
);


--
-- Name: chequeras_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chequeras_estado_enum AS ENUM (
    'activa',
    'agotada',
    'anulada'
);


--
-- Name: cheques_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cheques_estado_enum AS ENUM (
    'en_cartera',
    'entregado',
    'cobrado',
    'rechazado',
    'anulado',
    'posfechado'
);


--
-- Name: cheques_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cheques_tipo_enum AS ENUM (
    'emitido',
    'recibido'
);


--
-- Name: cierres_caja_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cierres_caja_estado_enum AS ENUM (
    'abierta',
    'cerrada',
    'revisada',
    'cerrada_por_sistema'
);


--
-- Name: clientes_tipocliente_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.clientes_tipocliente_enum AS ENUM (
    'persona_juridica',
    'persona_fisica',
    'consumidor_final',
    'extranjero',
    'regimen_especial',
    'gubernamental'
);


--
-- Name: comisiones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.comisiones_estado_enum AS ENUM (
    'pendiente',
    'aprobada',
    'pagada',
    'anulada'
);


--
-- Name: compras_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compras_estado_enum AS ENUM (
    'borrador',
    'enviada',
    'recibida',
    'recibida_parcial',
    'pagada',
    'cancelada'
);


--
-- Name: conciliaciones_bancarias_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conciliaciones_bancarias_estado_enum AS ENUM (
    'borrador',
    'en_proceso',
    'cerrada'
);


--
-- Name: conduces_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conduces_estado_enum AS ENUM (
    'generado',
    'en_transito',
    'entregado',
    'devuelto'
);


--
-- Name: configuraciones_sistema_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.configuraciones_sistema_tipo_enum AS ENUM (
    'string',
    'number',
    'boolean',
    'json'
);


--
-- Name: contratos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contratos_estado_enum AS ENUM (
    'activo',
    'vencido',
    'cancelado',
    'suspendido'
);


--
-- Name: contratos_laborales_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contratos_laborales_estado_enum AS ENUM (
    'activo',
    'vencido',
    'rescindido'
);


--
-- Name: contratos_laborales_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contratos_laborales_tipo_enum AS ENUM (
    'indefinido',
    'fijo',
    'temporal'
);


--
-- Name: contratos_periodofacturacion_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contratos_periodofacturacion_enum AS ENUM (
    'mensual',
    'bimestral',
    'trimestral',
    'semestral',
    'anual'
);


--
-- Name: cotizaciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cotizaciones_estado_enum AS ENUM (
    'borrador',
    'enviada',
    'aceptada',
    'rechazada',
    'vencida',
    'convertida'
);


--
-- Name: cotizaciones_proveedor_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cotizaciones_proveedor_estado_enum AS ENUM (
    'borrador',
    'enviada',
    'recibida',
    'seleccionada',
    'rechazada'
);


--
-- Name: crm_actividades_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crm_actividades_tipo_enum AS ENUM (
    'llamada',
    'email',
    'reunion',
    'nota',
    'tarea',
    'demo'
);


--
-- Name: crm_leads_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crm_leads_estado_enum AS ENUM (
    'nuevo',
    'contactado',
    'calificado',
    'no_calificado',
    'convertido'
);


--
-- Name: crm_leads_fuente_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crm_leads_fuente_enum AS ENUM (
    'web',
    'referido',
    'llamada',
    'evento',
    'redes_sociales',
    'email',
    'otro'
);


--
-- Name: crm_oportunidades_etapa_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crm_oportunidades_etapa_enum AS ENUM (
    'prospecto',
    'contactado',
    'propuesta',
    'negociacion',
    'ganado',
    'perdido'
);


--
-- Name: cuentas_bancarias_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_bancarias_tipo_enum AS ENUM (
    'corriente',
    'ahorros',
    'empresarial'
);


--
-- Name: cuentas_bancarias_tipocuenta_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_bancarias_tipocuenta_enum AS ENUM (
    'corriente',
    'ahorros',
    'credito'
);


--
-- Name: cuentas_contables_clasificacionresultado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_contables_clasificacionresultado_enum AS ENUM (
    'operacional',
    'no_operacional'
);


--
-- Name: cuentas_contables_naturaleza_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_contables_naturaleza_enum AS ENUM (
    'deudora',
    'acreedora'
);


--
-- Name: cuentas_contables_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_contables_tipo_enum AS ENUM (
    'activo',
    'pasivo',
    'patrimonio',
    'ingreso',
    'costo',
    'gasto'
);


--
-- Name: cuentas_estadisticas_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_estadisticas_tipo_enum AS ENUM (
    'acumulador',
    'promedio',
    'maximo',
    'conteo'
);


--
-- Name: cuentas_por_cobrar_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_por_cobrar_estado_enum AS ENUM (
    'pendiente',
    'pagada_parcial',
    'pagada',
    'vencida',
    'anulada'
);


--
-- Name: cuentas_por_pagar_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuentas_por_pagar_estado_enum AS ENUM (
    'pendiente',
    'pagada_parcial',
    'pagada',
    'vencida',
    'anulada'
);


--
-- Name: cuotas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cuotas_estado_enum AS ENUM (
    'pendiente',
    'pagada',
    'vencida',
    'cancelada'
);


--
-- Name: demo_requests_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.demo_requests_estado_enum AS ENUM (
    'nuevo',
    'contactado',
    'demo_agendada',
    'demo_realizada',
    'convertido',
    'descartado'
);


--
-- Name: demo_requests_tamanoempresa_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.demo_requests_tamanoempresa_enum AS ENUM (
    '1-5',
    '6-20',
    '21-100',
    '100+'
);


--
-- Name: depositos_bancarios_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.depositos_bancarios_tipo_enum AS ENUM (
    'efectivo',
    'cheque',
    'transferencia',
    'pago_tarjeta',
    'otro'
);


--
-- Name: depreciaciones_activos_metodo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.depreciaciones_activos_metodo_enum AS ENUM (
    'linea_recta',
    'saldo_decreciente'
);


--
-- Name: devoluciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.devoluciones_estado_enum AS ENUM (
    'pendiente',
    'procesada',
    'anulada'
);


--
-- Name: devoluciones_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.devoluciones_tipo_enum AS ENUM (
    'total',
    'parcial'
);


--
-- Name: documentos_tipoentidad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.documentos_tipoentidad_enum AS ENUM (
    'factura',
    'compra',
    'cliente',
    'proveedor',
    'empleado',
    'contrato',
    'gasto',
    'asiento',
    'proyecto',
    'licitacion',
    'general'
);


--
-- Name: ecf_estadodgii_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ecf_estadodgii_enum AS ENUM (
    'pendiente',
    'aceptado',
    'rechazado',
    'condicionado',
    'borrador',
    'pendiente_envio',
    'enviado',
    'observado',
    'contingencia',
    'en_validacion_dgii'
);


--
-- Name: ecf_eventos_evento_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ecf_eventos_evento_enum AS ENUM (
    'CREADO',
    'ENVIADO',
    'RESPUESTA_RECIBIDA',
    'REINTENTO',
    'ERROR',
    'ESTADO_CAMBIADO'
);


--
-- Name: empleados_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.empleados_estado_enum AS ENUM (
    'activo',
    'inactivo',
    'suspendido'
);


--
-- Name: empleados_sexo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.empleados_sexo_enum AS ENUM (
    'M',
    'F'
);


--
-- Name: empleados_tipocontrato_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.empleados_tipocontrato_enum AS ENUM (
    'indefinido',
    'fijo',
    'temporal'
);


--
-- Name: empleados_tipopago_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.empleados_tipopago_enum AS ENUM (
    'mensual',
    'quincenal'
);


--
-- Name: empresa_ecf_config_modo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.empresa_ecf_config_modo_enum AS ENUM (
    'TEST',
    'CERTIFICACION',
    'PRODUCCION'
);


--
-- Name: evaluaciones_empleado_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evaluaciones_empleado_estado_enum AS ENUM (
    'borrador',
    'en_revision',
    'completada'
);


--
-- Name: evaluaciones_empleado_periodo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evaluaciones_empleado_periodo_enum AS ENUM (
    'trimestral',
    'semestral',
    'anual'
);


--
-- Name: facturas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.facturas_estado_enum AS ENUM (
    'borrador',
    'emitida',
    'pagada',
    'cancelada'
);


--
-- Name: facturas_recurrentes_frecuencia_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.facturas_recurrentes_frecuencia_enum AS ENUM (
    'diaria',
    'semanal',
    'mensual',
    'anual'
);


--
-- Name: gastos_categoria_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gastos_categoria_enum AS ENUM (
    'alquiler',
    'servicios_publicos',
    'comunicaciones',
    'nomina',
    'materiales_oficina',
    'transporte',
    'marketing',
    'impuestos_tasas',
    'mantenimiento',
    'seguros',
    'gastos_financieros',
    'gasto_menor',
    'otros'
);


--
-- Name: invitaciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invitaciones_estado_enum AS ENUM (
    'pendiente',
    'aceptada',
    'expirada',
    'cancelada'
);


--
-- Name: invitaciones_rol_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invitaciones_rol_enum AS ENUM (
    'super_admin',
    'admin',
    'contador',
    'vendedor',
    'viewer',
    'empleado'
);


--
-- Name: licitaciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.licitaciones_estado_enum AS ENUM (
    'identificada',
    'en_proceso',
    'presentada',
    'adjudicada',
    'perdida',
    'cancelada'
);


--
-- Name: licitaciones_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.licitaciones_tipo_enum AS ENUM (
    'publica',
    'privada',
    'restringida',
    'emergencia'
);


--
-- Name: lotes_producto_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lotes_producto_estado_enum AS ENUM (
    'activo',
    'agotado',
    'vencido',
    'cuarentena'
);


--
-- Name: movimientos_bancarios_origen_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movimientos_bancarios_origen_enum AS ENUM (
    'manual',
    'cobro_cxc',
    'pago_cxp',
    'nomina',
    'transferencia'
);


--
-- Name: movimientos_bancarios_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movimientos_bancarios_tipo_enum AS ENUM (
    'deposito',
    'retiro',
    'transferencia_entrada',
    'transferencia_salida',
    'nota_credito',
    'nota_debito',
    'comision',
    'interes'
);


--
-- Name: movimientos_caja_chica_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movimientos_caja_chica_tipo_enum AS ENUM (
    'apertura',
    'egreso',
    'reposicion',
    'ajuste',
    'cierre'
);


--
-- Name: movimientos_inventario_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movimientos_inventario_tipo_enum AS ENUM (
    'entrada',
    'salida',
    'ajuste',
    'devolucion',
    'salida_transferencia',
    'entrada_transferencia',
    'cancelacion_transferencia',
    'ajuste_costo_importacion'
);


--
-- Name: nomina_anticipos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.nomina_anticipos_estado_enum AS ENUM (
    'pendiente',
    'descontado',
    'anulado'
);


--
-- Name: nomina_novedades_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.nomina_novedades_tipo_enum AS ENUM (
    'bono',
    'horas_extras',
    'ausencia',
    'descuento',
    'otro'
);


--
-- Name: nomina_periodos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.nomina_periodos_estado_enum AS ENUM (
    'borrador',
    'procesada',
    'pagada',
    'anulada'
);


--
-- Name: nomina_prestamos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.nomina_prestamos_estado_enum AS ENUM (
    'activo',
    'saldado',
    'anulado'
);


--
-- Name: notas_credito_compras_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_credito_compras_estado_enum AS ENUM (
    'borrador',
    'recibida',
    'anulada'
);


--
-- Name: notas_credito_compras_motivo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_credito_compras_motivo_enum AS ENUM (
    'devolucion',
    'defecto',
    'descuento',
    'error_precio',
    'otro'
);


--
-- Name: notas_credito_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_credito_estado_enum AS ENUM (
    'borrador',
    'emitida',
    'anulada',
    'rechazada'
);


--
-- Name: notas_credito_motivo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_credito_motivo_enum AS ENUM (
    'devolucion',
    'descuento_otorgado',
    'error_precio',
    'error_cantidad',
    'anulacion_factura',
    'otro'
);


--
-- Name: notas_debito_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_debito_estado_enum AS ENUM (
    'borrador',
    'emitida',
    'anulada'
);


--
-- Name: notas_debito_motivo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notas_debito_motivo_enum AS ENUM (
    'cargo_adicional',
    'ajuste_precio',
    'intereses',
    'flete_adicional',
    'diferencia_cambio',
    'otro'
);


--
-- Name: notificaciones_enviadas_canal_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notificaciones_enviadas_canal_enum AS ENUM (
    'email',
    'whatsapp',
    'sistema'
);


--
-- Name: notificaciones_enviadas_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notificaciones_enviadas_tipo_enum AS ENUM (
    'cxc_vencida',
    'cxc_por_vencer',
    'cxp_vencida',
    'cxp_por_vencer',
    'stock_bajo',
    'ecf_secuencia_vence',
    'ecf_cuota_80',
    'ecf_cuota_excedida',
    'nomina_pendiente',
    'manual',
    'xlink_documento_recibido'
);


--
-- Name: objetivos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.objetivos_estado_enum AS ENUM (
    'activo',
    'en_riesgo',
    'cumplido',
    'cancelado'
);


--
-- Name: objetivos_nivel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.objetivos_nivel_enum AS ENUM (
    'empresa',
    'departamento',
    'individual'
);


--
-- Name: objetivos_periodo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.objetivos_periodo_enum AS ENUM (
    'Q1',
    'Q2',
    'Q3',
    'Q4',
    'anual'
);


--
-- Name: orden_servicio_detalles_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.orden_servicio_detalles_tipo_enum AS ENUM (
    'pieza',
    'mano_obra',
    'otro'
);


--
-- Name: ordenes_mantenimiento_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_mantenimiento_estado_enum AS ENUM (
    'programado',
    'en_proceso',
    'completado',
    'cancelado',
    'vencido'
);


--
-- Name: ordenes_mantenimiento_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_mantenimiento_prioridad_enum AS ENUM (
    'baja',
    'media',
    'alta',
    'critica'
);


--
-- Name: ordenes_mantenimiento_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_mantenimiento_tipo_enum AS ENUM (
    'preventivo',
    'correctivo',
    'predictivo'
);


--
-- Name: ordenes_produccion_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_produccion_estado_enum AS ENUM (
    'borrador',
    'planificada',
    'en_proceso',
    'completada',
    'cancelada'
);


--
-- Name: ordenes_servicio_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_servicio_estado_enum AS ENUM (
    'recibido',
    'en_diagnostico',
    'esperando_piezas',
    'en_proceso',
    'listo',
    'entregado',
    'cobrado',
    'cancelado'
);


--
-- Name: ordenes_servicio_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ordenes_servicio_prioridad_enum AS ENUM (
    'baja',
    'normal',
    'alta',
    'urgente'
);


--
-- Name: pagos_cobrados_metodopago_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pagos_cobrados_metodopago_enum AS ENUM (
    'efectivo',
    'transferencia',
    'cheque',
    'tarjeta',
    'otro'
);


--
-- Name: pagos_realizados_metodopago_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pagos_realizados_metodopago_enum AS ENUM (
    'efectivo',
    'transferencia',
    'cheque',
    'tarjeta',
    'otro'
);


--
-- Name: periodos_contables_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.periodos_contables_estado_enum AS ENUM (
    'abierto',
    'cerrado',
    'bloqueado'
);


--
-- Name: plan_demanda_lineas_tendencia_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_demanda_lineas_tendencia_enum AS ENUM (
    'creciente',
    'estable',
    'decreciente',
    'sin_datos'
);


--
-- Name: planes_demanda_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.planes_demanda_estado_enum AS ENUM (
    'borrador',
    'aprobado',
    'ejecutado'
);


--
-- Name: planes_pago_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.planes_pago_estado_enum AS ENUM (
    'vigente',
    'completado',
    'vencido',
    'cancelado'
);


--
-- Name: pre_facturas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pre_facturas_estado_enum AS ENUM (
    'borrador',
    'enviada',
    'aprobada',
    'rechazada',
    'convertida',
    'vencida'
);


--
-- Name: precios_especiales_tier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.precios_especiales_tier_enum AS ENUM (
    'mayorista',
    'minorista',
    'vip',
    'especial',
    'distribuidor'
);


--
-- Name: presupuesto_proyecto_lineas_categoria_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.presupuesto_proyecto_lineas_categoria_enum AS ENUM (
    'mano_obra',
    'materiales',
    'subcontratista',
    'gastos_viaje',
    'licencias',
    'otro'
);


--
-- Name: presupuestos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.presupuestos_estado_enum AS ENUM (
    'borrador',
    'aprobado',
    'cerrado'
);


--
-- Name: presupuestos_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.presupuestos_tipo_enum AS ENUM (
    'ventas',
    'compras',
    'gastos',
    'caja',
    'general'
);


--
-- Name: pro_formas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pro_formas_estado_enum AS ENUM (
    'ACTIVA',
    'VENCIDA'
);


--
-- Name: programas_mantenimiento_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.programas_mantenimiento_tipo_enum AS ENUM (
    'preventivo',
    'correctivo',
    'predictivo'
);


--
-- Name: proveedores_ecf_ambiente_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proveedores_ecf_ambiente_enum AS ENUM (
    'pruebas',
    'produccion'
);


--
-- Name: proyecto_tareas_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proyecto_tareas_estado_enum AS ENUM (
    'pendiente',
    'en_progreso',
    'revision',
    'completada',
    'cancelada'
);


--
-- Name: proyecto_tareas_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proyecto_tareas_prioridad_enum AS ENUM (
    'baja',
    'media',
    'alta',
    'urgente'
);


--
-- Name: proyectos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proyectos_estado_enum AS ENUM (
    'planificacion',
    'activo',
    'en_pausa',
    'completado',
    'cancelado'
);


--
-- Name: proyectos_tipofacturacion_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proyectos_tipofacturacion_enum AS ENUM (
    'precio_fijo',
    'por_hora',
    'sin_cobro'
);


--
-- Name: recibos_cobro_metodopago_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recibos_cobro_metodopago_enum AS ENUM (
    'efectivo',
    'transferencia',
    'cheque',
    'tarjeta',
    'deposito',
    'otro'
);


--
-- Name: registro_etapas_orden_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registro_etapas_orden_estado_enum AS ENUM (
    'pendiente',
    'en_proceso',
    'completada',
    'omitida',
    'rechazada'
);


--
-- Name: registros_flota_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registros_flota_tipo_enum AS ENUM (
    'combustible',
    'mantenimiento',
    'seguro',
    'multa',
    'peaje',
    'otro'
);


--
-- Name: reglas_comision_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reglas_comision_tipo_enum AS ENUM (
    'global',
    'por_vendedor',
    'por_categoria',
    'por_monto',
    'por_antiguedad'
);


--
-- Name: reglas_descuento_condicion_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reglas_descuento_condicion_enum AS ENUM (
    'siempre',
    'categoria',
    'producto',
    'cantidad_min',
    'monto_min',
    'fecha'
);


--
-- Name: reglas_descuento_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reglas_descuento_tipo_enum AS ENUM (
    'porcentaje',
    'monto_fijo'
);


--
-- Name: reglas_distribucion_periodicidad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reglas_distribucion_periodicidad_enum AS ENUM (
    'manual',
    'mensual',
    'trimestral',
    'anual'
);


--
-- Name: reportes_generados_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reportes_generados_estado_enum AS ENUM (
    'procesando',
    'completado',
    'error'
);


--
-- Name: reportes_generados_formato_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reportes_generados_formato_enum AS ENUM (
    'json',
    'pdf',
    'excel'
);


--
-- Name: reportes_generados_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reportes_generados_tipo_enum AS ENUM (
    'ventas',
    'compras',
    'inventario',
    'clientes',
    'ecf',
    'itbis',
    'general'
);


--
-- Name: resultados_clave_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.resultados_clave_tipo_enum AS ENUM (
    'numero',
    'porcentaje',
    'booleano'
);


--
-- Name: retenciones_isr_tiposervicio_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.retenciones_isr_tiposervicio_enum AS ENUM (
    'profesional',
    'servicios_tecnicos',
    'alquileres',
    'otros_servicios',
    'dividendos',
    'intereses'
);


--
-- Name: seriales_producto_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seriales_producto_estado_enum AS ENUM (
    'disponible',
    'vendido',
    'devuelto',
    'defectuoso',
    'en_garantia',
    'dado_baja'
);


--
-- Name: solicitudes_ajuste_inventario_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solicitudes_ajuste_inventario_estado_enum AS ENUM (
    'pendiente',
    'aprobada',
    'rechazada'
);


--
-- Name: solicitudes_compra_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solicitudes_compra_estado_enum AS ENUM (
    'borrador',
    'enviada',
    'aprobada',
    'rechazada',
    'en_cotizacion',
    'procesada',
    'cancelada'
);


--
-- Name: solicitudes_compra_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solicitudes_compra_prioridad_enum AS ENUM (
    'baja',
    'media',
    'alta',
    'urgente'
);


--
-- Name: solicitudes_vacacion_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solicitudes_vacacion_estado_enum AS ENUM (
    'pendiente',
    'aprobada',
    'rechazada',
    'cancelada'
);


--
-- Name: soporte_tickets_asunto_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.soporte_tickets_asunto_enum AS ENUM (
    'error_tecnico',
    'duda_uso',
    'solicitud_funcion',
    'facturacion',
    'certificacion_dgii',
    'otro'
);


--
-- Name: soporte_tickets_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.soporte_tickets_estado_enum AS ENUM (
    'abierto',
    'en_proceso',
    'resuelto',
    'cerrado'
);


--
-- Name: soporte_tickets_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.soporte_tickets_prioridad_enum AS ENUM (
    'baja',
    'media',
    'alta'
);


--
-- Name: suscripciones_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.suscripciones_estado_enum AS ENUM (
    'prueba',
    'activa',
    'vencida',
    'suspendida',
    'cancelada'
);


--
-- Name: suscripciones_plan_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.suscripciones_plan_enum AS ENUM (
    'emprendedor',
    'pyme',
    'pro',
    'plus',
    'trial',
    'basico',
    'profesional',
    'empresarial',
    'enterprise'
);


--
-- Name: tickets_soporte_categoria_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tickets_soporte_categoria_enum AS ENUM (
    'soporte_tecnico',
    'facturacion',
    'devolucion',
    'consulta',
    'otro'
);


--
-- Name: tickets_soporte_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tickets_soporte_estado_enum AS ENUM (
    'abierto',
    'en_proceso',
    'resuelto',
    'cerrado'
);


--
-- Name: tickets_soporte_prioridad_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tickets_soporte_prioridad_enum AS ENUM (
    'baja',
    'media',
    'alta'
);


--
-- Name: transacciones_puntos_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transacciones_puntos_tipo_enum AS ENUM (
    'acumulacion',
    'canje',
    'vencimiento',
    'ajuste'
);


--
-- Name: transferencias_almacen_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transferencias_almacen_estado_enum AS ENUM (
    'pendiente',
    'borrador',
    'en_transito',
    'completada',
    'cancelada'
);


--
-- Name: unidades_medida_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.unidades_medida_tipo_enum AS ENUM (
    'peso',
    'volumen',
    'longitud',
    'area',
    'tiempo',
    'cantidad',
    'otro'
);


--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_role_enum AS ENUM (
    'super_admin',
    'admin',
    'contador',
    'vendedor',
    'viewer',
    'empleado'
);


--
-- Name: usuario_empresa_rol_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.usuario_empresa_rol_enum AS ENUM (
    'super_admin',
    'admin',
    'contador',
    'vendedor',
    'viewer',
    'empleado'
);


--
-- Name: vehiculos_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vehiculos_estado_enum AS ENUM (
    'activo',
    'en_taller',
    'inactivo',
    'dado_baja'
);


--
-- Name: wms_lineas_picking_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wms_lineas_picking_estado_enum AS ENUM (
    'pendiente',
    'pickeado',
    'faltante',
    'parcial'
);


--
-- Name: wms_ordenes_picking_estado_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wms_ordenes_picking_estado_enum AS ENUM (
    'borrador',
    'asignada',
    'en_proceso',
    'empacada',
    'despachada',
    'cancelada'
);


--
-- Name: wms_ordenes_picking_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wms_ordenes_picking_tipo_enum AS ENUM (
    'salida_venta',
    'transferencia',
    'devolucion',
    'ajuste'
);


--
-- Name: wms_ubicaciones_tipo_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wms_ubicaciones_tipo_enum AS ENUM (
    'picking',
    'bulk',
    'recepcion',
    'despacho',
    'cuarentena'
);


--
-- Name: siguiente_numero_secuencia(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.siguiente_numero_secuencia(p_empresa_id integer, p_tipo character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $$
  DECLARE
    v_numero INTEGER;
  BEGIN
    INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
    VALUES (p_empresa_id, p_tipo, 101)
    ON CONFLICT ("empresaId", tipo) DO UPDATE
      SET ultimo_numero = contadores_secuencia.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;
    RETURN v_numero;
  END;
  $$;


SET default_table_access_method = heap;

--
-- Name: _bak_1769200000000_cxc_huerfanas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._bak_1769200000000_cxc_huerfanas (
    "cxcId" integer NOT NULL,
    "estadoAnterior" character varying(20) NOT NULL,
    "montoPendienteAnterior" numeric(10,2) NOT NULL,
    "notasAnterior" text
);


--
-- Name: activos_fijos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activos_fijos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(30) NOT NULL,
    descripcion character varying(200) NOT NULL,
    "categoriaId" integer NOT NULL,
    "fechaAdquisicion" date NOT NULL,
    "costoAdquisicion" numeric(14,2) NOT NULL,
    "valorResidual" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "vidaUtilAnios" integer NOT NULL,
    "valorLibros" numeric(14,2) NOT NULL,
    "depreciacionAcumulada" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    estado public.activos_fijos_estado_enum DEFAULT 'activo'::public.activos_fijos_estado_enum NOT NULL,
    ubicacion character varying(100),
    proveedor character varying(100),
    "numeroSerie" character varying(50),
    "fechaBaja" date,
    "motivoBaja" text,
    "valorVenta" numeric(14,2),
    notas text,
    "fechaUltimoMantenimiento" date,
    "userId" integer NOT NULL
);


--
-- Name: activos_fijos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activos_fijos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activos_fijos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activos_fijos_id_seq OWNED BY public.activos_fijos.id;


--
-- Name: ag_animales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_animales (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "fincaId" integer,
    numero character varying(50),
    nombre character varying(100),
    tipo character varying(50) NOT NULL,
    raza character varying(100),
    sexo character varying(10),
    "fechaNacimiento" date,
    "pesoNacimiento" numeric(8,2),
    "pesoActual" numeric(8,2),
    color character varying(50),
    origen character varying(50),
    "madreId" integer,
    "padreId" integer,
    proposito character varying(50),
    estado character varying(30) DEFAULT 'activo'::character varying NOT NULL,
    "costoAdquisicion" numeric(12,2),
    notas text,
    "fotoUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_animales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_animales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_animales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_animales_id_seq OWNED BY public.ag_animales.id;


--
-- Name: ag_aplicaciones_insumo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_aplicaciones_insumo (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "cicloId" integer NOT NULL,
    "laborId" integer,
    "productoId" integer,
    "insumoNombre" character varying(200) NOT NULL,
    tipo character varying(50),
    cantidad numeric(10,2) NOT NULL,
    unidad character varying(30),
    "costoUnitario" numeric(10,2),
    "costoTotal" numeric(12,2),
    fecha date NOT NULL,
    "dosisPorArea" character varying(50),
    "metodoAplicacion" character varying(50),
    "loteInsumo" character varying(100),
    "periodoCarencia" integer,
    responsable character varying(200),
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_aplicaciones_insumo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_aplicaciones_insumo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_aplicaciones_insumo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_aplicaciones_insumo_id_seq OWNED BY public.ag_aplicaciones_insumo.id;


--
-- Name: ag_ciclos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_ciclos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "parcelaId" integer NOT NULL,
    "cultivoId" integer NOT NULL,
    "fechaSiembra" date NOT NULL,
    "fechaEstimadaCosecha" date,
    "fechaCosechaReal" date,
    "areaSembrada" numeric(10,2),
    "cantidadSemilla" numeric(10,2),
    "unidadSemilla" character varying(30),
    "rendimientoEstimado" numeric(10,2),
    "cantidadCosechada" numeric(10,2),
    "unidadCosecha" character varying(30),
    "mermaPerdida" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "costoSemilla" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoInsumos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoManoObra" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoMaquinaria" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoOtros" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoTotal" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ingresoVentas" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(30) DEFAULT 'sembrado'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_ciclos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_ciclos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_ciclos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_ciclos_id_seq OWNED BY public.ag_ciclos.id;


--
-- Name: ag_cosechas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_cosechas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "cicloId" integer NOT NULL,
    "parcelaId" integer,
    fecha date NOT NULL,
    cantidad numeric(10,2) NOT NULL,
    unidad character varying(30),
    calidad character varying(50),
    clasificacion jsonb,
    destino character varying(50),
    "cantidadTrabajadores" integer,
    "costoManoObra" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "productoId" integer,
    "ingresadoInventario" boolean DEFAULT false NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_cosechas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_cosechas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_cosechas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_cosechas_id_seq OWNED BY public.ag_cosechas.id;


--
-- Name: ag_cultivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_cultivos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    variedad character varying(100),
    tipo character varying(50),
    "diasCicloPromedio" integer,
    "rendimientoEsperado" numeric(10,2),
    "unidadRendimiento" character varying(30),
    "unidadPorArea" character varying(50),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_cultivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_cultivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_cultivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_cultivos_id_seq OWNED BY public.ag_cultivos.id;


--
-- Name: ag_eventos_animal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_eventos_animal (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "animalId" integer NOT NULL,
    tipo character varying(50) NOT NULL,
    fecha date NOT NULL,
    descripcion text,
    peso numeric(8,2),
    producto character varying(200),
    dosis character varying(50),
    costo numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "cantidadProduccion" numeric(10,2),
    "unidadProduccion" character varying(20),
    responsable character varying(200),
    "proximaFecha" date,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_eventos_animal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_eventos_animal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_eventos_animal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_eventos_animal_id_seq OWNED BY public.ag_eventos_animal.id;


--
-- Name: ag_fincas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_fincas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    ubicacion character varying(300),
    provincia character varying(100),
    municipio character varying(100),
    "areaTotal" numeric(10,2),
    "unidadArea" character varying(20) DEFAULT 'tarea'::character varying NOT NULL,
    latitud numeric(10,6),
    longitud numeric(10,6),
    "tieneRiego" boolean DEFAULT false NOT NULL,
    "tipoRiego" character varying(50),
    "fuenteAgua" character varying(100),
    encargado character varying(200),
    "encargadoTelefono" character varying(20),
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_fincas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_fincas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_fincas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_fincas_id_seq OWNED BY public.ag_fincas.id;


--
-- Name: ag_insumos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_insumos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo character varying(50),
    marca character varying(100),
    presentacion character varying(100),
    unidad character varying(30),
    "stockActual" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "stockMinimo" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "costoUnitario" numeric(10,2),
    "requiereReceta" boolean DEFAULT false NOT NULL,
    "periodoCarencia" integer,
    "productoId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_insumos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_insumos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_insumos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_insumos_id_seq OWNED BY public.ag_insumos.id;


--
-- Name: ag_labores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_labores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "cicloId" integer NOT NULL,
    "parcelaId" integer,
    tipo character varying(50) NOT NULL,
    descripcion text,
    fecha date NOT NULL,
    "cantidadTrabajadores" integer,
    "horasTrabajadas" numeric(6,2),
    "costoManoObra" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "usoMaquinaria" character varying(100),
    "costoMaquinaria" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'completada'::character varying NOT NULL,
    responsable character varying(200),
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_labores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_labores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_labores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_labores_id_seq OWNED BY public.ag_labores.id;


--
-- Name: ag_maquinaria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_maquinaria (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo character varying(50),
    marca character varying(100),
    modelo character varying(100),
    anio integer,
    "costoHora" numeric(10,2),
    "horasUso" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "ultimoMantenimiento" date,
    "proximoMantenimiento" date,
    estado character varying(30) DEFAULT 'operativo'::character varying NOT NULL,
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_maquinaria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_maquinaria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_maquinaria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_maquinaria_id_seq OWNED BY public.ag_maquinaria.id;


--
-- Name: ag_parcelas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ag_parcelas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "fincaId" integer,
    nombre character varying(100) NOT NULL,
    codigo character varying(50),
    area numeric(10,2),
    "unidadArea" character varying(20) DEFAULT 'tarea'::character varying NOT NULL,
    "tipoSuelo" character varying(50),
    "phSuelo" numeric(4,2),
    estado character varying(30) DEFAULT 'disponible'::character varying NOT NULL,
    "cultivoActual" character varying(100),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ag_parcelas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ag_parcelas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ag_parcelas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ag_parcelas_id_seq OWNED BY public.ag_parcelas.id;


--
-- Name: alerta_dispositivo_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerta_dispositivo_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: almacenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.almacenes (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    codigo character varying(20),
    direccion character varying(200),
    ciudad character varying(100),
    responsable character varying(100),
    telefono character varying(20),
    activo boolean DEFAULT true NOT NULL,
    descripcion text,
    "sucursalId" integer
);


--
-- Name: almacenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.almacenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: almacenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.almacenes_id_seq OWNED BY public.almacenes.id;


--
-- Name: anticipo_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anticipo_cliente (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "clienteId" integer NOT NULL,
    "clienteNombre" character varying(200),
    monto numeric(14,2) NOT NULL,
    "montoPendiente" numeric(14,2) NOT NULL,
    "tipoPago" character varying(30) NOT NULL,
    referencia character varying(100),
    descripcion character varying(300) NOT NULL,
    estado public.anticipo_cliente_estado_enum DEFAULT 'activo'::public.anticipo_cliente_estado_enum NOT NULL,
    "fechaRegistro" date NOT NULL,
    "cajaDiariaId" integer,
    "asientoId" integer,
    "usuarioId" integer NOT NULL,
    "nombreUsuario" character varying(150)
);


--
-- Name: anticipo_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.anticipo_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: anticipo_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.anticipo_cliente_id_seq OWNED BY public.anticipo_cliente.id;


--
-- Name: aprobaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aprobaciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    tipo public.aprobaciones_tipo_enum NOT NULL,
    "entidadId" integer NOT NULL,
    "entidadRef" character varying(50),
    monto numeric(14,2),
    estado public.aprobaciones_estado_enum DEFAULT 'pendiente'::public.aprobaciones_estado_enum NOT NULL,
    "solicitadoPorId" integer NOT NULL,
    "nombreSolicitante" character varying(150),
    "aprobadoPorId" integer,
    "nombreAprobador" character varying(150),
    "comentarioSolicitud" text,
    "comentarioResolucion" text,
    "fechaResolucion" timestamp without time zone
);


--
-- Name: aprobaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aprobaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aprobaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aprobaciones_id_seq OWNED BY public.aprobaciones.id;


--
-- Name: asiento_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asiento_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "asientoId" integer NOT NULL,
    "cuentaContableId" integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    debe numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    haber numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "cuentaManual" boolean
);


--
-- Name: asiento_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asiento_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asiento_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asiento_lineas_id_seq OWNED BY public.asiento_lineas.id;


--
-- Name: asientos_contables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asientos_contables (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    descripcion character varying(300) NOT NULL,
    "tipoOrigen" public.asientos_contables_tipoorigen_enum DEFAULT 'manual'::public.asientos_contables_tipoorigen_enum NOT NULL,
    "referenciaId" integer,
    "referenciaFolio" character varying(50),
    "asientoRevertidoId" integer,
    estado public.asientos_contables_estado_enum DEFAULT 'borrador'::public.asientos_contables_estado_enum NOT NULL,
    "totalDebe" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalHaber" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "userId" integer NOT NULL
);


--
-- Name: asientos_contables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asientos_contables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asientos_contables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asientos_contables_id_seq OWNED BY public.asientos_contables.id;


--
-- Name: asignaciones_costo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones_costo (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "centroCostoId" integer NOT NULL,
    "tipoDocumento" character varying(30) NOT NULL,
    "documentoId" integer NOT NULL,
    monto numeric(14,2) NOT NULL,
    porcentaje integer DEFAULT 100 NOT NULL,
    nota text,
    fecha date NOT NULL
);


--
-- Name: asignaciones_costo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaciones_costo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaciones_costo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaciones_costo_id_seq OWNED BY public.asignaciones_costo.id;


--
-- Name: atributos_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atributos_producto (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    tipo public.atributos_producto_tipo_enum DEFAULT 'otro'::public.atributos_producto_tipo_enum NOT NULL,
    unidad character varying(50),
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: atributos_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.atributos_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: atributos_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.atributos_producto_id_seq OWNED BY public.atributos_producto.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    "userId" integer,
    "userName" character varying(100),
    "userRole" character varying(30),
    accion public.audit_logs_accion_enum NOT NULL,
    modulo character varying(50) NOT NULL,
    entidad character varying(100),
    "entidadId" character varying(50),
    descripcion character varying(300) NOT NULL,
    "valorAnterior" text,
    "valorNuevo" text,
    metodo character varying(8) NOT NULL,
    ruta character varying(300) NOT NULL,
    "statusCode" integer,
    "duracionMs" integer,
    exitoso boolean DEFAULT true NOT NULL,
    "ipAddress" character varying(50),
    "userAgent" character varying(300),
    "empresaId" integer,
    nivel character varying(20) DEFAULT 'NORMAL'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: ausencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ausencias (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    fecha date NOT NULL,
    tipo public.ausencias_tipo_enum NOT NULL,
    justificada boolean DEFAULT false NOT NULL,
    descripcion text,
    dias numeric(4,2) DEFAULT '1'::numeric NOT NULL,
    "registradoPor" integer
);


--
-- Name: ausencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ausencias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ausencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ausencias_id_seq OWNED BY public.ausencias.id;


--
-- Name: backup_registros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_registros (
    id integer NOT NULL,
    tipo character varying(10) DEFAULT 'daily'::character varying NOT NULL,
    estado character varying(20) NOT NULL,
    "s3Key" character varying(300),
    tamanio character varying(20),
    "duracionSegundos" integer,
    checksum character varying(64),
    "errorMensaje" text,
    "integridadVerificada" boolean DEFAULT false NOT NULL,
    "verificadoEn" timestamp with time zone,
    "restauracionProbadaEn" timestamp with time zone,
    "filasVerificadas" jsonb,
    "verificacionMensaje" text,
    "verificacionSegundos" integer,
    "iniciadoPor" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: backup_registros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_registros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_registros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_registros_id_seq OWNED BY public.backup_registros.id;


--
-- Name: balanza_formatos_exportacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balanza_formatos_exportacion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    formato character varying(20) DEFAULT 'CSV'::character varying NOT NULL,
    separador character varying(5),
    "limiteNombre" smallint DEFAULT '20'::smallint NOT NULL,
    codificacion character varying(20) DEFAULT 'UTF-8'::character varying NOT NULL,
    columnas jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: balanza_formatos_exportacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balanza_formatos_exportacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balanza_formatos_exportacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balanza_formatos_exportacion_id_seq OWNED BY public.balanza_formatos_exportacion.id;


--
-- Name: balanza_patrones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balanza_patrones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    prefijo character varying(4) NOT NULL,
    "longitudPlu" smallint NOT NULL,
    "tipoDato" character varying(10) DEFAULT 'peso'::character varying NOT NULL,
    "longitudValor" smallint NOT NULL,
    "decimalesValor" smallint DEFAULT '3'::smallint NOT NULL,
    "unidadPeso" character varying(20),
    "tieneCheckValor" boolean DEFAULT false NOT NULL,
    "longitudTotal" smallint DEFAULT '13'::smallint NOT NULL,
    prioridad smallint DEFAULT '100'::smallint NOT NULL
);


--
-- Name: balanza_patrones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.balanza_patrones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: balanza_patrones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.balanza_patrones_id_seq OWNED BY public.balanza_patrones.id;


--
-- Name: bancos_conciliacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bancos_conciliacion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cuentaId" integer NOT NULL,
    fecha date NOT NULL,
    descripcion character varying(300) NOT NULL,
    referencia character varying(60),
    tipo character varying(20) NOT NULL,
    monto numeric(14,2) NOT NULL,
    "saldoResultante" numeric(14,2),
    conciliado boolean DEFAULT false NOT NULL,
    "sistemaId" integer,
    "sistemaTipo" character varying(30)
);


--
-- Name: bancos_conciliacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bancos_conciliacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bancos_conciliacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bancos_conciliacion_id_seq OWNED BY public.bancos_conciliacion.id;


--
-- Name: cajas_chicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cajas_chicas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    "montoInicial" numeric(12,2) NOT NULL,
    "saldoActual" numeric(12,2) NOT NULL,
    "montoMaximoEgreso" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "pctAlerta" numeric(5,2) DEFAULT '20'::numeric NOT NULL,
    "responsableId" integer,
    "nombreResponsable" character varying(150),
    estado public.cajas_chicas_estado_enum DEFAULT 'activa'::public.cajas_chicas_estado_enum NOT NULL,
    descripcion text
);


--
-- Name: cajas_chicas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cajas_chicas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cajas_chicas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cajas_chicas_id_seq OWNED BY public.cajas_chicas.id;


--
-- Name: cargos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL
);


--
-- Name: cargos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cargos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cargos_id_seq OWNED BY public.cargos.id;


--
-- Name: categorias_activos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_activos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(10) NOT NULL,
    nombre character varying(100) NOT NULL,
    "tasaAnual" numeric(5,2) NOT NULL,
    metodo public.categorias_activos_metodo_enum NOT NULL,
    "vidaUtilAnios" integer NOT NULL,
    descripcion character varying(200),
    "cuentaActivoCodigo" character varying(20),
    "cuentaDepreciacionCodigo" character varying(20),
    "cuentaGastoCodigo" character varying(20)
);


--
-- Name: categorias_activos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categorias_activos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categorias_activos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categorias_activos_id_seq OWNED BY public.categorias_activos.id;


--
-- Name: centros_costo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centros_costo (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    tipo public.centros_costo_tipo_enum DEFAULT 'ambos'::public.centros_costo_tipo_enum NOT NULL,
    presupuesto numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "parentId" integer
);


--
-- Name: centros_costo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.centros_costo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: centros_costo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.centros_costo_id_seq OWNED BY public.centros_costo.id;


--
-- Name: centros_trabajo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centros_trabajo (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    descripcion character varying(200),
    tipo public.centros_trabajo_tipo_enum DEFAULT 'manual'::public.centros_trabajo_tipo_enum NOT NULL,
    "capacidadHorasDia" numeric(8,2) DEFAULT '8'::numeric NOT NULL,
    "costoHora" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    responsable character varying(100),
    ubicacion character varying(200),
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: centros_trabajo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.centros_trabajo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: centros_trabajo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.centros_trabajo_id_seq OWNED BY public.centros_trabajo.id;


--
-- Name: chequeras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chequeras (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    banco character varying(80) NOT NULL,
    "numeroCuenta" character varying(30) NOT NULL,
    "nombreCuenta" character varying(80),
    "serieDesde" integer NOT NULL,
    "serieHasta" integer NOT NULL,
    "siguienteNumero" integer NOT NULL,
    estado public.chequeras_estado_enum DEFAULT 'activa'::public.chequeras_estado_enum NOT NULL,
    descripcion text
);


--
-- Name: chequeras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chequeras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chequeras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chequeras_id_seq OWNED BY public.chequeras.id;


--
-- Name: cheques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheques (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "chequeraId" integer NOT NULL,
    numero character varying NOT NULL,
    tipo public.cheques_tipo_enum DEFAULT 'emitido'::public.cheques_tipo_enum NOT NULL,
    estado public.cheques_estado_enum DEFAULT 'en_cartera'::public.cheques_estado_enum NOT NULL,
    fecha date NOT NULL,
    "fechaCobro" date,
    beneficiario character varying(200) NOT NULL,
    monto numeric(14,2) NOT NULL,
    concepto text,
    "facturaId" integer,
    "compraId" integer,
    referencia character varying(100)
);


--
-- Name: cheques_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cheques_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cheques_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cheques_id_seq OWNED BY public.cheques.id;


--
-- Name: cierres_caja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cierres_caja (
    id integer NOT NULL,
    fecha date NOT NULL,
    "vendedorId" integer,
    "vendedorNombre" character varying(120),
    "sucursalId" integer,
    estado public.cierres_caja_estado_enum DEFAULT 'abierta'::public.cierres_caja_estado_enum NOT NULL,
    "saldoApertura" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ventasEfectivo" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ventasTarjeta" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ventasTransferencia" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ventasCredito" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "cobrosRecibidos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "cobrosEfectivo" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "cobrosOtrosMedios" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalAnticipos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "anticiposEfectivo" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "anticiposOtrosMedios" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "gastosEfectivo" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    retiros numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "saldoCierre" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "saldoFisico" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    diferencia numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "formulaVersion" integer DEFAULT 1 NOT NULL,
    "esperadoOriginal" numeric(12,2),
    "contadoOriginal" numeric(12,2),
    "diferenciaOriginal" numeric(12,2),
    "formulaVersionOriginal" integer,
    "reabiertoPorUsuarioId" integer,
    "reabiertoPorNombre" character varying(120),
    "reabiertoEn" timestamp with time zone,
    "cantidadTransacciones" integer DEFAULT 0 NOT NULL,
    notas text,
    "desgloseBilletes" jsonb,
    "desglosePago" jsonb,
    "userId" integer NOT NULL,
    "empresaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cierres_caja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cierres_caja_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cierres_caja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cierres_caja_id_seq OWNED BY public.cierres_caja.id;


--
-- Name: cl_autorizaciones_ars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_autorizaciones_ars (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer,
    "arsNombre" character varying(100) NOT NULL,
    "arsNumeroAfiliado" character varying(50),
    "tipoServicio" character varying(100),
    descripcion text,
    "codigoAutorizacion" character varying(100),
    "montoAutorizado" numeric(10,2),
    "montoCubierto" numeric(10,2),
    "montoPaciente" numeric(10,2),
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "fechaSolicitud" date,
    "fechaRespuesta" date,
    observaciones text,
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_autorizaciones_ars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_autorizaciones_ars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_autorizaciones_ars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_autorizaciones_ars_id_seq OWNED BY public.cl_autorizaciones_ars.id;


--
-- Name: cl_catalogo_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_catalogo_servicios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    codigo character varying(50),
    nombre character varying(200) NOT NULL,
    descripcion text,
    especialidad character varying(100),
    precio numeric(10,2),
    "precioArs" numeric(10,2),
    "duracionMinutos" integer DEFAULT 30 NOT NULL,
    "requiereAutorizacion" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: cl_catalogo_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_catalogo_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_catalogo_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_catalogo_servicios_id_seq OWNED BY public.cl_catalogo_servicios.id;


--
-- Name: cl_citas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_citas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer NOT NULL,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    "duracionMinutos" integer DEFAULT 30 NOT NULL,
    "tipoCita" character varying(50),
    motivo text,
    estado character varying(20) DEFAULT 'programada'::character varying NOT NULL,
    sala character varying(50),
    prioridad character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    "recordatorioEnviado" boolean DEFAULT false NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_citas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_citas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_citas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_citas_id_seq OWNED BY public.cl_citas.id;


--
-- Name: cl_consultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_consultas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer NOT NULL,
    "citaId" integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    "tipoCita" character varying(50),
    "motivoConsulta" text NOT NULL,
    "enfermedadActual" text,
    temperatura numeric(4,1),
    "presionSistolica" integer,
    "presionDiastolica" integer,
    "frecuenciaCardiaca" integer,
    "frecuenciaRespiratoria" integer,
    "saturacionOxigeno" numeric(4,1),
    peso numeric(6,2),
    talla numeric(5,2),
    imc numeric(5,2),
    "examenFisico" text,
    "diagnosticoPrincipal" text,
    "diagnosticosCIE10" character varying(500),
    "diagnosticosDescripcion" text,
    "planTratamiento" text,
    indicaciones text,
    "proximaCita" date,
    "proximaCitaMotivo" text,
    "recetaGenerada" boolean DEFAULT false NOT NULL,
    "ordenLaboratorioGenerada" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_consultas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_consultas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_consultas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_consultas_id_seq OWNED BY public.cl_consultas.id;


--
-- Name: cl_examenes_laboratorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_examenes_laboratorio (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "ordenId" integer NOT NULL,
    examen character varying(200) NOT NULL,
    categoria character varying(100),
    resultado text,
    unidad character varying(50),
    "valorReferencia" character varying(100),
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL
);


--
-- Name: cl_examenes_laboratorio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_examenes_laboratorio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_examenes_laboratorio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_examenes_laboratorio_id_seq OWNED BY public.cl_examenes_laboratorio.id;


--
-- Name: cl_medicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_medicos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    apellidos character varying(200),
    especialidad character varying(100),
    subespecialidad character varying(100),
    exequatur character varying(50),
    colegiatura character varying(50),
    telefono character varying(20),
    email character varying(100),
    firma text,
    "selloUrl" text,
    "tarifaConsulta" numeric(10,2),
    "horarioLunes" character varying(50),
    "horarioMartes" character varying(50),
    "horarioMiercoles" character varying(50),
    "horarioJueves" character varying(50),
    "horarioViernes" character varying(50),
    "horarioSabado" character varying(50),
    "horarioDomingo" character varying(50),
    "empleadoId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_medicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_medicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_medicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_medicos_id_seq OWNED BY public.cl_medicos.id;


--
-- Name: cl_ordenes_laboratorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_ordenes_laboratorio (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer NOT NULL,
    "consultaId" integer,
    fecha date NOT NULL,
    urgente boolean DEFAULT false NOT NULL,
    "diagnosticoPresuntivo" text,
    indicaciones text,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "fechaResultados" date,
    "laboratorioNombre" character varying(100),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_ordenes_laboratorio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_ordenes_laboratorio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_ordenes_laboratorio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_ordenes_laboratorio_id_seq OWNED BY public.cl_ordenes_laboratorio.id;


--
-- Name: cl_pacientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_pacientes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    codigo character varying(20),
    cedula character varying(20),
    nombre character varying(200) NOT NULL,
    apellidos character varying(200),
    "fechaNacimiento" date,
    sexo character varying(10),
    "estadoCivil" character varying(20),
    telefono character varying(20),
    "telefonoEmergencia" character varying(20),
    "contactoEmergencia" character varying(100),
    email character varying(100),
    direccion text,
    "arsNombre" character varying(100),
    "arsNumeroAfiliado" character varying(50),
    "arsTipo" character varying(30),
    "arsPlan" character varying(100),
    "grupoSanguineo" character varying(10),
    alergias text,
    "antecedentesFamiliares" text,
    "antecedentesPersonales" text,
    "medicamentosActuales" text,
    "clienteId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_pacientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_pacientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_pacientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_pacientes_id_seq OWNED BY public.cl_pacientes.id;


--
-- Name: cl_procedimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_procedimientos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer NOT NULL,
    "consultaId" integer,
    fecha timestamp without time zone NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    "duracionMinutos" integer,
    anestesia character varying(100),
    sala character varying(50),
    estado character varying(30) DEFAULT 'programado'::character varying NOT NULL,
    complicaciones text,
    notas text,
    costo numeric(10,2),
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_procedimientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_procedimientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_procedimientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_procedimientos_id_seq OWNED BY public.cl_procedimientos.id;


--
-- Name: cl_receta_medicamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_receta_medicamentos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "recetaId" integer NOT NULL,
    medicamento character varying(200) NOT NULL,
    concentracion character varying(100),
    forma character varying(50),
    via character varying(50),
    dosis character varying(100),
    frecuencia character varying(100),
    duracion character varying(100),
    cantidad integer,
    indicaciones text,
    orden integer DEFAULT 1 NOT NULL
);


--
-- Name: cl_receta_medicamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_receta_medicamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_receta_medicamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_receta_medicamentos_id_seq OWNED BY public.cl_receta_medicamentos.id;


--
-- Name: cl_recetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_recetas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "pacienteId" integer NOT NULL,
    "medicoId" integer NOT NULL,
    "consultaId" integer,
    fecha date NOT NULL,
    "fechaVencimiento" date,
    diagnostico text,
    "indicacionesGenerales" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cl_recetas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_recetas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_recetas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_recetas_id_seq OWNED BY public.cl_recetas.id;


--
-- Name: cl_sala_espera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_sala_espera (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "citaId" integer NOT NULL,
    "pacienteId" integer NOT NULL,
    "horaLlegada" timestamp without time zone DEFAULT now() NOT NULL,
    "horaLlamada" timestamp without time zone,
    "horaAtencion" timestamp without time zone,
    estado character varying(20) DEFAULT 'esperando'::character varying NOT NULL,
    turno integer,
    notas text
);


--
-- Name: cl_sala_espera_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_sala_espera_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_sala_espera_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_sala_espera_id_seq OWNED BY public.cl_sala_espera.id;


--
-- Name: cl_signos_vitales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cl_signos_vitales (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "pacienteId" integer NOT NULL,
    "consultaId" integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    temperatura numeric(4,1),
    "presionSistolica" integer,
    "presionDiastolica" integer,
    "frecuenciaCardiaca" integer,
    "frecuenciaRespiratoria" integer,
    "saturacionOxigeno" numeric(4,1),
    peso numeric(6,2),
    talla numeric(5,2),
    imc numeric(5,2),
    glucosa numeric(6,2),
    "registradoPor" character varying(100)
);


--
-- Name: cl_signos_vitales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cl_signos_vitales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cl_signos_vitales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cl_signos_vitales_id_seq OWNED BY public.cl_signos_vitales.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(200) NOT NULL,
    rfc character varying(13),
    "rncReceptor" character varying(11),
    "esExtranjero" boolean DEFAULT false NOT NULL,
    "tipoCliente" public.clientes_tipocliente_enum DEFAULT 'consumidor_final'::public.clientes_tipocliente_enum NOT NULL,
    "razonSocial" character varying(300),
    direccion character varying(300),
    ciudad character varying(100),
    estado character varying(100),
    "codigoPostal" character varying(10),
    email character varying(100),
    telefono character varying(20),
    "regimenFiscal" character varying(100),
    "usoCfdi" character varying(50),
    notas text,
    "identificadorExtranjero" character varying(30),
    sector character varying(64),
    "diasCredito" integer DEFAULT 30 NOT NULL,
    "limiteCredito" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "portalToken" character varying(64),
    "portalTokenExpiry" timestamp without time zone,
    "xlinkEmpresaXlinkId" uuid,
    "sincronizarArticulosXlink" boolean DEFAULT false NOT NULL
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: comisiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comisiones (
    id integer NOT NULL,
    "empresaId" integer,
    "vendedorId" integer NOT NULL,
    "facturaId" integer,
    "facturaFolio" character varying(30),
    periodo character varying(7) NOT NULL,
    "montoVenta" numeric(12,2) NOT NULL,
    "porcentajeComision" numeric(5,2) NOT NULL,
    "montoComision" numeric(12,2) NOT NULL,
    estado public.comisiones_estado_enum DEFAULT 'pendiente'::public.comisiones_estado_enum NOT NULL,
    "fechaPago" date,
    notas text,
    "userId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: comisiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comisiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comisiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comisiones_id_seq OWNED BY public.comisiones.id;


--
-- Name: componentes_lm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.componentes_lm (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "listaId" integer NOT NULL,
    "productoId" integer NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    unidad character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    notas text,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: componentes_lm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.componentes_lm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: componentes_lm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.componentes_lm_id_seq OWNED BY public.componentes_lm.id;


--
-- Name: compra_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compra_detalles (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "compraId" integer NOT NULL,
    "productoId" integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "cantidadBonificada" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "cantidadTotal" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "cantidadRecibida" numeric(12,4),
    "costoUnitarioReal" numeric(12,4),
    "costoUnitarioRealDOP" numeric(12,4),
    "costoImportacionUnitario" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "porcentajeItbis" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoMonto" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "importeItbis" numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    "destinoItbis" character varying(30),
    "destinoItbisMotivo" text
);


--
-- Name: compra_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compra_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compra_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compra_detalles_id_seq OWNED BY public.compra_detalles.id;


--
-- Name: compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    folio character varying(20) NOT NULL,
    fecha date NOT NULL,
    estado public.compras_estado_enum DEFAULT 'borrador'::public.compras_estado_enum NOT NULL,
    "proveedorId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoTotal" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoGeneralTipo" character varying(20),
    "descuentoGeneralValor" numeric(12,4),
    "descuentoGeneralMonto" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoGeneralAplicarSobre" character varying(20),
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "numeroFacturaProveedor" character varying(50),
    "sucursalId" integer,
    "almacenId" integer,
    notas text,
    "tipoBienes" character varying(2) DEFAULT '09'::character varying,
    "formaPago" character varying(2) DEFAULT '04'::character varying,
    "cuentaDestino" character varying(20),
    "fechaPago" date,
    "tipoPago" character varying(10) DEFAULT 'credito'::character varying,
    "diasCredito" integer DEFAULT 30,
    "fechaVencimiento" date,
    moneda character varying(3) DEFAULT 'DOP'::character varying,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric,
    "retieneItbis" boolean DEFAULT false NOT NULL,
    "porcentajeRetencionItbis" numeric(5,2) DEFAULT '30'::numeric NOT NULL,
    "montoRetencionItbis" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "retieneIsr" boolean DEFAULT false NOT NULL,
    "porcentajeRetencionIsr" numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    "montoRetencionIsr" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "netoPagar" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "subtotalDOP" numeric(12,2),
    "itbisDOP" numeric(12,2),
    "totalDOP" numeric(12,2),
    "montoRetencionItbisDOP" numeric(10,2),
    "montoRetencionIsrDOP" numeric(10,2),
    "netoPagarDOP" numeric(12,2),
    "claveIdempotencia" character varying(36) DEFAULT NULL::character varying
);


--
-- Name: compras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compras_id_seq OWNED BY public.compras.id;


--
-- Name: conciliaciones_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliaciones_bancarias (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cuentaBancariaId" integer NOT NULL,
    periodo character varying(7) NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    "saldoExtracto" numeric(14,2) NOT NULL,
    "saldoSistema" numeric(14,2) NOT NULL,
    diferencia numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    estado public.conciliaciones_bancarias_estado_enum DEFAULT 'borrador'::public.conciliaciones_bancarias_estado_enum NOT NULL,
    "movimientosConciliados" integer DEFAULT 0 NOT NULL,
    "movimientosPendientes" integer DEFAULT 0 NOT NULL,
    notas text,
    "userId" integer NOT NULL
);


--
-- Name: conciliaciones_bancarias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conciliaciones_bancarias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conciliaciones_bancarias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conciliaciones_bancarias_id_seq OWNED BY public.conciliaciones_bancarias.id;


--
-- Name: conciliaciones_datafono; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliaciones_datafono (
    id integer NOT NULL,
    "empresaId" integer,
    "terminalId" integer NOT NULL,
    "fechaDesde" date NOT NULL,
    "fechaHasta" date NOT NULL,
    "totalBruto" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalComisiones" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalNeto" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "cantidadTransacciones" integer DEFAULT 0 NOT NULL,
    estado character varying(30) DEFAULT 'borrador'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conciliaciones_datafono_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conciliaciones_datafono_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conciliaciones_datafono_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conciliaciones_datafono_id_seq OWNED BY public.conciliaciones_datafono.id;


--
-- Name: conduce_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conduce_detalles (
    id integer NOT NULL,
    "conduceId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "cantidadDevuelta" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    observaciones text
);


--
-- Name: conduce_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conduce_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conduce_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conduce_detalles_id_seq OWNED BY public.conduce_detalles.id;


--
-- Name: conduces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conduces (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "fechaEntregaProgramada" date,
    estado public.conduces_estado_enum DEFAULT 'generado'::public.conduces_estado_enum NOT NULL,
    "clienteId" integer NOT NULL,
    "facturaId" integer,
    "preFacturaId" integer,
    "direccionEntrega" character varying(400) NOT NULL,
    ciudad character varying(100),
    "contactoEntrega" character varying(150),
    "telefonoContacto" character varying(20),
    conductor character varying(150),
    vehiculo character varying(20),
    "usuarioId" integer NOT NULL,
    notas text,
    "fechaEntregaReal" timestamp without time zone,
    "observacionesEntrega" text,
    "sucursalId" integer,
    "almacenId" integer,
    "entregadoPorUsuarioId" integer,
    "motivoDevolucion" character varying(500),
    "devueltoPorUsuarioId" integer,
    "fechaDevolucion" timestamp without time zone
);


--
-- Name: conduces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conduces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conduces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conduces_id_seq OWNED BY public.conduces.id;


--
-- Name: configuracion_bancaria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_bancaria (
    id integer NOT NULL,
    banco character varying(255) NOT NULL,
    "numeroCuenta" character varying(50) NOT NULL,
    "tipoCuenta" character varying(20) DEFAULT 'corriente'::character varying NOT NULL,
    titular character varying(255) NOT NULL,
    rnc character varying(20),
    activo boolean DEFAULT true NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "actualizadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: configuracion_bancaria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_bancaria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_bancaria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_bancaria_id_seq OWNED BY public.configuracion_bancaria.id;


--
-- Name: configuracion_cobros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_cobros (
    id integer DEFAULT 1 NOT NULL,
    "precioEcfExcedente" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "cargoAutomaticoSuscripcionDesde" date,
    "actualizadoPor" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: configuraciones_cuentas_contables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuraciones_cuentas_contables (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    concepto character varying(60) NOT NULL,
    "cuentaCodigo" character varying(20) NOT NULL
);


--
-- Name: configuraciones_cuentas_contables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuraciones_cuentas_contables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuraciones_cuentas_contables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuraciones_cuentas_contables_id_seq OWNED BY public.configuraciones_cuentas_contables.id;


--
-- Name: configuraciones_sistema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuraciones_sistema (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    clave character varying(80) NOT NULL,
    valor text NOT NULL,
    tipo public.configuraciones_sistema_tipo_enum DEFAULT 'string'::public.configuraciones_sistema_tipo_enum NOT NULL,
    grupo character varying(50) NOT NULL,
    descripcion character varying(300) NOT NULL,
    editable boolean DEFAULT true NOT NULL
);


--
-- Name: configuraciones_sistema_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuraciones_sistema_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuraciones_sistema_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuraciones_sistema_id_seq OWNED BY public.configuraciones_sistema.id;


--
-- Name: contadores_secuencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contadores_secuencia (
    "empresaId" integer NOT NULL,
    tipo character varying(20) NOT NULL,
    ultimo_numero integer DEFAULT 100 NOT NULL
);


--
-- Name: conteo_ajustes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conteo_ajustes (
    id integer NOT NULL,
    "empresaId" integer,
    "conteoId" integer NOT NULL,
    "lineaId" integer NOT NULL,
    "productoId" integer NOT NULL,
    "movimientoId" integer NOT NULL,
    "cantidadAntes" numeric(12,4) NOT NULL,
    "cantidadDespues" numeric(12,4) NOT NULL,
    diferencia numeric(12,4) NOT NULL,
    "costoUnitario" numeric(12,4) NOT NULL,
    "valorImpacto" numeric(14,2) NOT NULL,
    tipo character varying(10) NOT NULL,
    "avisaLotes" boolean DEFAULT false NOT NULL,
    "aplicadoPorId" integer NOT NULL,
    "aplicadoEn" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conteo_ajustes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conteo_ajustes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conteo_ajustes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conteo_ajustes_id_seq OWNED BY public.conteo_ajustes.id;


--
-- Name: conteos_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conteos_inventario (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo character varying(30) DEFAULT 'total'::character varying NOT NULL,
    modalidad character varying(20) DEFAULT 'ciego'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    "almacenId" integer NOT NULL,
    filtros jsonb,
    "umbralTipo" character varying(10) DEFAULT 'unidades'::character varying NOT NULL,
    "umbralValor" numeric(12,4) DEFAULT '5'::numeric NOT NULL,
    "fechaGeneracion" timestamp with time zone DEFAULT now() NOT NULL,
    "fechaCorteConteo" timestamp with time zone DEFAULT now() NOT NULL,
    "fechaInicio" timestamp with time zone,
    "fechaCierre" timestamp with time zone,
    "generadoPorId" integer NOT NULL,
    "cerradoPorId" integer,
    "ajustadoPorId" integer,
    "totalLineas" integer DEFAULT 0 NOT NULL,
    "lineasContadas" integer DEFAULT 0 NOT NULL,
    "totalDiferencias" integer DEFAULT 0 NOT NULL,
    "valorDiferencia" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notas text
);


--
-- Name: conteos_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conteos_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conteos_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conteos_inventario_id_seq OWNED BY public.conteos_inventario.id;


--
-- Name: contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "clienteId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    "descripcionServicio" text NOT NULL,
    estado public.contratos_estado_enum DEFAULT 'activo'::public.contratos_estado_enum NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date,
    "periodoFacturacion" public.contratos_periodofacturacion_enum DEFAULT 'mensual'::public.contratos_periodofacturacion_enum NOT NULL,
    "montoBase" numeric(12,2) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    "diaFacturacion" integer DEFAULT 1 NOT NULL,
    "ultimaFactura" date,
    "proximaFactura" date,
    "totalFacturasGeneradas" integer DEFAULT 0 NOT NULL,
    "facturaAutomatica" boolean DEFAULT true NOT NULL,
    terminos text,
    "userId" integer NOT NULL
);


--
-- Name: contratos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_id_seq OWNED BY public.contratos.id;


--
-- Name: contratos_laborales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos_laborales (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    numero character varying(50) NOT NULL,
    tipo public.contratos_laborales_tipo_enum DEFAULT 'indefinido'::public.contratos_laborales_tipo_enum NOT NULL,
    estado public.contratos_laborales_estado_enum DEFAULT 'activo'::public.contratos_laborales_estado_enum NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date,
    salario numeric(12,2) NOT NULL,
    cargo character varying(100) NOT NULL,
    departamento character varying(100),
    clausulas text,
    "lugarTrabajo" character varying(100),
    "horasSemana" integer,
    "estadoFirma" character varying(30) DEFAULT 'pendiente_firma'::character varying NOT NULL,
    "firmadoEn" timestamp without time zone
);


--
-- Name: contratos_laborales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_laborales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_laborales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_laborales_id_seq OWNED BY public.contratos_laborales.id;


--
-- Name: conversiones_uom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversiones_uom (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "unidadDesdeId" integer NOT NULL,
    "unidadHastaId" integer NOT NULL,
    factor numeric(18,8) NOT NULL
);


--
-- Name: conversiones_uom_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversiones_uom_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversiones_uom_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversiones_uom_id_seq OWNED BY public.conversiones_uom.id;


--
-- Name: cotizacion_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizacion_detalles (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "cotizacionId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(200) NOT NULL,
    "precioUnitario" numeric(12,4) NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "importeIva" numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoMonto" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "precioOriginal" numeric(12,4)
);


--
-- Name: cotizacion_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizacion_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizacion_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizacion_detalles_id_seq OWNED BY public.cotizacion_detalles.id;


--
-- Name: cotizacion_proveedor_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizacion_proveedor_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cotizacionId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    "porcentajeItbis" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) NOT NULL,
    unidad character varying(100)
);


--
-- Name: cotizacion_proveedor_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizacion_proveedor_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizacion_proveedor_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizacion_proveedor_lineas_id_seq OWNED BY public.cotizacion_proveedor_lineas.id;


--
-- Name: cotizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "validezDias" integer DEFAULT 30 NOT NULL,
    estado public.cotizaciones_estado_enum DEFAULT 'borrador'::public.cotizaciones_estado_enum NOT NULL,
    "clienteId" integer NOT NULL,
    "userId" integer NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoGeneralTipo" character varying(10),
    "descuentoGeneralValor" numeric(12,4),
    "descuentoGeneralFinal" numeric(12,2),
    "condicionesPago" character varying(200),
    "vendedorId" integer,
    "nombreVendedor" character varying(150),
    "sucursalId" integer,
    notas text,
    "facturaId" integer
);


--
-- Name: cotizaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_id_seq OWNED BY public.cotizaciones.id;


--
-- Name: cotizaciones_proveedor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones_proveedor (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "solicitudId" integer,
    "proveedorId" integer NOT NULL,
    "fechaEnvio" date NOT NULL,
    "fechaRespuesta" date,
    "fechaValidez" date,
    "tiempoEntregaDias" integer DEFAULT 0 NOT NULL,
    "condicionesPago" character varying(200),
    estado public.cotizaciones_proveedor_estado_enum DEFAULT 'enviada'::public.cotizaciones_proveedor_estado_enum NOT NULL,
    subtotal numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notas text
);


--
-- Name: cotizaciones_proveedor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_proveedor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_proveedor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_proveedor_id_seq OWNED BY public.cotizaciones_proveedor.id;


--
-- Name: credito_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credito_cliente (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "clienteId" integer NOT NULL,
    "limiteCredito" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "diasPlazo" integer DEFAULT 30 NOT NULL,
    "saldoUtilizado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    notas text
);


--
-- Name: credito_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credito_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credito_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credito_cliente_id_seq OWNED BY public.credito_cliente.id;


--
-- Name: crm_actividades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_actividades (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    tipo public.crm_actividades_tipo_enum NOT NULL,
    descripcion character varying NOT NULL,
    fecha timestamp without time zone NOT NULL,
    completada boolean DEFAULT false NOT NULL,
    "leadId" integer,
    "oportunidadId" integer,
    "usuarioId" integer
);


--
-- Name: crm_actividades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_actividades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_actividades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_actividades_id_seq OWNED BY public.crm_actividades.id;


--
-- Name: crm_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying NOT NULL,
    empresa character varying,
    cargo character varying,
    email character varying,
    telefono character varying,
    fuente public.crm_leads_fuente_enum DEFAULT 'web'::public.crm_leads_fuente_enum NOT NULL,
    estado public.crm_leads_estado_enum DEFAULT 'nuevo'::public.crm_leads_estado_enum NOT NULL,
    "valorEstimado" numeric(14,2),
    notas text,
    "responsableId" integer,
    "clienteConvertidoId" integer
);


--
-- Name: crm_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_leads_id_seq OWNED BY public.crm_leads.id;


--
-- Name: crm_oportunidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_oportunidades (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    titulo character varying NOT NULL,
    empresa character varying,
    "clienteId" integer,
    "leadId" integer,
    etapa public.crm_oportunidades_etapa_enum DEFAULT 'prospecto'::public.crm_oportunidades_etapa_enum NOT NULL,
    valor numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    probabilidad integer DEFAULT 50 NOT NULL,
    "fechaCierreEsperada" date,
    descripcion text,
    "motivoPerdida" text,
    "responsableId" integer
);


--
-- Name: crm_oportunidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_oportunidades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_oportunidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_oportunidades_id_seq OWNED BY public.crm_oportunidades.id;


--
-- Name: cuenta_anexo_ir2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuenta_anexo_ir2 (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cuentaContableId" integer NOT NULL,
    "anexoIR2" character varying(2) NOT NULL,
    "casillaIR2" character varying(30)
);


--
-- Name: cuenta_anexo_ir2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuenta_anexo_ir2_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuenta_anexo_ir2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuenta_anexo_ir2_id_seq OWNED BY public.cuenta_anexo_ir2.id;


--
-- Name: cuentas_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_bancarias (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "numeroCuenta" character varying(30) NOT NULL,
    "tipoCuenta" public.cuentas_bancarias_tipocuenta_enum DEFAULT 'corriente'::public.cuentas_bancarias_tipocuenta_enum NOT NULL,
    saldo numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "isActiva" boolean DEFAULT true NOT NULL,
    nombre character varying(100) NOT NULL,
    tipo public.cuentas_bancarias_tipo_enum DEFAULT 'corriente'::public.cuentas_bancarias_tipo_enum NOT NULL,
    "saldoInicial" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    banco character varying(60) NOT NULL,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    descripcion text
);


--
-- Name: cuentas_bancarias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_bancarias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_bancarias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_bancarias_id_seq OWNED BY public.cuentas_bancarias.id;


--
-- Name: cuentas_contables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_contables (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo public.cuentas_contables_tipo_enum NOT NULL,
    naturaleza public.cuentas_contables_naturaleza_enum NOT NULL,
    nivel integer NOT NULL,
    "clasificacionResultado" public.cuentas_contables_clasificacionresultado_enum,
    "permiteMovimientos" boolean DEFAULT false NOT NULL,
    "cuentaPadreId" integer,
    descripcion text,
    "tipoGasto606" character varying(2),
    "requiereNCF" boolean,
    "esCuentaSistema" boolean DEFAULT false NOT NULL
);


--
-- Name: cuentas_contables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_contables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_contables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_contables_id_seq OWNED BY public.cuentas_contables.id;


--
-- Name: cuentas_estadisticas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_estadisticas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    unidad character varying(50) DEFAULT 'unidades'::character varying NOT NULL,
    tipo public.cuentas_estadisticas_tipo_enum DEFAULT 'acumulador'::public.cuentas_estadisticas_tipo_enum NOT NULL,
    categoria character varying(100),
    activa boolean DEFAULT true NOT NULL
);


--
-- Name: cuentas_estadisticas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_estadisticas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_estadisticas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_estadisticas_id_seq OWNED BY public.cuentas_estadisticas.id;


--
-- Name: cuentas_por_cobrar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_por_cobrar (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "facturaId" integer NOT NULL,
    "clienteId" integer NOT NULL,
    "montoOriginal" numeric(10,2) NOT NULL,
    "montoPagado" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "montoPendiente" numeric(10,2) NOT NULL,
    "fechaEmision" date NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "diasVencimiento" integer DEFAULT 30 NOT NULL,
    estado public.cuentas_por_cobrar_estado_enum DEFAULT 'pendiente'::public.cuentas_por_cobrar_estado_enum NOT NULL,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "userId" integer NOT NULL,
    notas text
);


--
-- Name: cuentas_por_cobrar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_por_cobrar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_por_cobrar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_por_cobrar_id_seq OWNED BY public.cuentas_por_cobrar.id;


--
-- Name: cuentas_por_pagar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_por_pagar (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "compraId" integer NOT NULL,
    "proveedorId" integer NOT NULL,
    "montoOriginal" numeric(10,2) NOT NULL,
    "montoPagado" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "montoPendiente" numeric(10,2) NOT NULL,
    "fechaEmision" date NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "diasVencimiento" integer DEFAULT 30 NOT NULL,
    estado public.cuentas_por_pagar_estado_enum DEFAULT 'pendiente'::public.cuentas_por_pagar_estado_enum NOT NULL,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "userId" integer NOT NULL
);


--
-- Name: cuentas_por_pagar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_por_pagar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_por_pagar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_por_pagar_id_seq OWNED BY public.cuentas_por_pagar.id;


--
-- Name: cuotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuotas (
    id integer NOT NULL,
    "planPagoId" integer NOT NULL,
    "numeroCuota" integer NOT NULL,
    "fechaVencimiento" date NOT NULL,
    monto numeric(14,2) NOT NULL,
    "montoPagado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    interes numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    estado public.cuotas_estado_enum DEFAULT 'pendiente'::public.cuotas_estado_enum NOT NULL,
    "fechaPago" date,
    "referenciaPago" character varying(100),
    "empresaId" integer,
    numero character varying(20)
);


--
-- Name: cuotas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuotas_id_seq OWNED BY public.cuotas.id;


--
-- Name: cursos_capacitacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cursos_capacitacion (
    id integer NOT NULL,
    "empresaId" integer,
    nombre character varying(200) NOT NULL,
    descripcion text,
    categoria character varying(100),
    instructor character varying(150),
    "duracionHoras" integer DEFAULT 0 NOT NULL,
    modalidad character varying(20) DEFAULT 'presencial'::character varying NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cursos_capacitacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cursos_capacitacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cursos_capacitacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cursos_capacitacion_id_seq OWNED BY public.cursos_capacitacion.id;


--
-- Name: cw_adelantos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_adelantos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "lavadorId" integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha date NOT NULL,
    motivo text,
    "usuarioId" integer NOT NULL,
    "retiroCajaId" integer,
    liquidado boolean DEFAULT false NOT NULL,
    "liquidacionId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "metodoPago" character varying(20) DEFAULT 'efectivo'::character varying NOT NULL,
    referencia text,
    "cuentaBancariaId" integer
);


--
-- Name: cw_adelantos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_adelantos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_adelantos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_adelantos_id_seq OWNED BY public.cw_adelantos.id;


--
-- Name: cw_comisiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_comisiones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "turnoId" integer NOT NULL,
    "lavadorId" integer NOT NULL,
    "servicioId" integer,
    "servicioNombre" character varying(150),
    "modoPago" character varying(20) NOT NULL,
    base numeric(10,2) NOT NULL,
    "tarifaAplicada" numeric(10,2) NOT NULL,
    "porcentajeReparto" numeric(5,2) NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha date NOT NULL,
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    "motivoAnulacion" text,
    "anuladoPorId" integer,
    "anuladoAt" timestamp without time zone,
    "liquidacionId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cw_comision_estado CHECK (((estado)::text = ANY ((ARRAY['activa'::character varying, 'anulada'::character varying])::text[])))
);


--
-- Name: cw_comisiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_comisiones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_comisiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_comisiones_id_seq OWNED BY public.cw_comisiones.id;


--
-- Name: cw_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_config (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "sucursalId" integer NOT NULL,
    "bahiasActivas" integer DEFAULT 1 NOT NULL,
    "prefijoTurno" character varying(10) DEFAULT 'L'::character varying NOT NULL,
    "usaSecado" boolean DEFAULT false NOT NULL,
    "cobroEn" character varying(20) DEFAULT 'entrega'::character varying NOT NULL,
    "horasCaducidadEnlace" integer DEFAULT 24 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cw_config_cobro_en CHECK ((("cobroEn")::text = ANY ((ARRAY['recepcion'::character varying, 'entrega'::character varying])::text[])))
);


--
-- Name: cw_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_config_id_seq OWNED BY public.cw_config.id;


--
-- Name: cw_contador_turno; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_contador_turno (
    "empresaId" integer NOT NULL,
    "sucursalId" integer NOT NULL,
    "fechaRD" date NOT NULL,
    ultimo integer DEFAULT 0 NOT NULL
);


--
-- Name: cw_lavadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_lavadores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    cedula character varying(20),
    telefono character varying(20),
    activo boolean DEFAULT true NOT NULL,
    "modoPago" character varying(20) NOT NULL,
    "valorModoPago" numeric(10,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cw_lavador_modo_pago CHECK ((("modoPago")::text = ANY ((ARRAY['por_vehiculo'::character varying, 'porcentaje'::character varying, 'por_servicio'::character varying])::text[])))
);


--
-- Name: cw_lavadores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_lavadores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_lavadores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_lavadores_id_seq OWNED BY public.cw_lavadores.id;


--
-- Name: cw_liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_liquidaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "lavadorId" integer NOT NULL,
    desde date NOT NULL,
    hasta date NOT NULL,
    "totalComisiones" numeric(10,2) NOT NULL,
    "totalAdelantos" numeric(10,2) NOT NULL,
    "totalPagado" numeric(10,2) NOT NULL,
    "retiroCajaId" integer,
    "usuarioId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "metodoPago" character varying(20) DEFAULT 'efectivo'::character varying NOT NULL,
    referencia text,
    "cuentaBancariaId" integer
);


--
-- Name: cw_liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_liquidaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_liquidaciones_id_seq OWNED BY public.cw_liquidaciones.id;


--
-- Name: cw_servicio_precios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_servicio_precios (
    id integer NOT NULL,
    "servicioId" integer NOT NULL,
    "tipoVehiculo" character varying(20) NOT NULL,
    "duracionMinutos" integer NOT NULL,
    precio numeric(10,2) NOT NULL,
    "tarifaLavador" numeric(10,2),
    CONSTRAINT ck_cw_servicio_precio_tipo CHECK ((("tipoVehiculo")::text = ANY ((ARRAY['carro'::character varying, 'jeepeta'::character varying, 'camioneta'::character varying, 'moto'::character varying, 'camion'::character varying])::text[])))
);


--
-- Name: cw_servicio_precios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_servicio_precios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_servicio_precios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_servicio_precios_id_seq OWNED BY public.cw_servicio_precios.id;


--
-- Name: cw_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_servicios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    "productoId" integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cw_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_servicios_id_seq OWNED BY public.cw_servicios.id;


--
-- Name: cw_turno_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_turno_eventos (
    id integer NOT NULL,
    "turnoId" integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estadoAnterior" character varying(20),
    "estadoNuevo" character varying(20) NOT NULL,
    "usuarioId" integer,
    motivo text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cw_turno_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_turno_eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_turno_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_turno_eventos_id_seq OWNED BY public.cw_turno_eventos.id;


--
-- Name: cw_turno_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_turno_fotos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "turnoId" integer NOT NULL,
    ruta text NOT NULL,
    "tipoMime" character varying(50) NOT NULL,
    "tamanioBytes" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cw_turno_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_turno_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_turno_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_turno_fotos_id_seq OWNED BY public.cw_turno_fotos.id;


--
-- Name: cw_turno_lavadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_turno_lavadores (
    id integer NOT NULL,
    "turnoId" integer NOT NULL,
    "lavadorId" integer NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cw_turno_lavadores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_turno_lavadores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_turno_lavadores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_turno_lavadores_id_seq OWNED BY public.cw_turno_lavadores.id;


--
-- Name: cw_turno_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_turno_servicios (
    id integer NOT NULL,
    "turnoId" integer NOT NULL,
    "servicioId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    precio numeric(10,2) NOT NULL,
    "duracionMinutos" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cw_turno_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_turno_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_turno_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_turno_servicios_id_seq OWNED BY public.cw_turno_servicios.id;


--
-- Name: cw_turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cw_turnos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "sucursalId" integer NOT NULL,
    "numeroDia" integer NOT NULL,
    codigo character varying(20) NOT NULL,
    "fechaRD" date NOT NULL,
    placa character varying(20) NOT NULL,
    "tipoVehiculo" character varying(20) NOT NULL,
    marca character varying(100),
    color character varying(50),
    "clienteId" integer,
    telefono character varying(20),
    estado character varying(20) DEFAULT 'en_espera'::character varying NOT NULL,
    bahia integer,
    "lavadorNombre" character varying(150),
    "tokenPublico" character varying(64) NOT NULL,
    "notasDanos" text,
    "motivoCancelacion" text,
    "enEsperaAt" timestamp without time zone,
    "enLavadoAt" timestamp without time zone,
    "secadoAt" timestamp without time zone,
    "listoAt" timestamp without time zone,
    "entregadoAt" timestamp without time zone,
    "canceladoAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cw_turno_estado CHECK (((estado)::text = ANY ((ARRAY['en_espera'::character varying, 'en_lavado'::character varying, 'secado'::character varying, 'listo'::character varying, 'entregado'::character varying, 'cancelado'::character varying])::text[]))),
    CONSTRAINT ck_cw_turno_tipo_vehiculo CHECK ((("tipoVehiculo")::text = ANY ((ARRAY['carro'::character varying, 'jeepeta'::character varying, 'camioneta'::character varying, 'moto'::character varying, 'camion'::character varying])::text[])))
);


--
-- Name: cw_turnos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cw_turnos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cw_turnos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cw_turnos_id_seq OWNED BY public.cw_turnos.id;


--
-- Name: declaraciones_itbis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.declaraciones_itbis (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    mes integer NOT NULL,
    anio integer NOT NULL,
    "diferenciaAPagar" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "nuevoSaldoAFavor" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "calculadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: declaraciones_itbis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.declaraciones_itbis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: declaraciones_itbis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.declaraciones_itbis_id_seq OWNED BY public.declaraciones_itbis.id;


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    empresa character varying(200) NOT NULL,
    email character varying(150) NOT NULL,
    telefono character varying(25) NOT NULL,
    pais character varying(50) DEFAULT 'República Dominicana'::character varying NOT NULL,
    "tamanoEmpresa" public.demo_requests_tamanoempresa_enum DEFAULT '1-5'::public.demo_requests_tamanoempresa_enum NOT NULL,
    "modulosInteres" text,
    mensaje text,
    estado public.demo_requests_estado_enum DEFAULT 'nuevo'::public.demo_requests_estado_enum NOT NULL,
    "notasInternas" text,
    notas jsonb DEFAULT '[]'::jsonb NOT NULL,
    "asignadoA" character varying,
    "atendidoPor" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: demo_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demo_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demo_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demo_requests_id_seq OWNED BY public.demo_requests.id;


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL
);


--
-- Name: departamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departamentos_id_seq OWNED BY public.departamentos.id;


--
-- Name: depositos_bancarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depositos_bancarios (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "cuentaId" integer NOT NULL,
    fecha date NOT NULL,
    tipo public.depositos_bancarios_tipo_enum DEFAULT 'efectivo'::public.depositos_bancarios_tipo_enum NOT NULL,
    monto numeric(14,2) NOT NULL,
    referencia character varying(100),
    descripcion character varying(200),
    "clienteId" integer,
    "nombreDepositante" character varying(200),
    "cxcId" integer,
    "usuarioId" integer NOT NULL,
    notas text
);


--
-- Name: depositos_bancarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.depositos_bancarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: depositos_bancarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.depositos_bancarios_id_seq OWNED BY public.depositos_bancarios.id;


--
-- Name: depreciaciones_activos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciaciones_activos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "activoId" integer NOT NULL,
    periodo character varying(7) NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    "tasaAplicada" numeric(5,2) NOT NULL,
    metodo public.depreciaciones_activos_metodo_enum NOT NULL,
    "valorLibrosInicio" numeric(14,2) NOT NULL,
    "montoDepreciacion" numeric(14,2) NOT NULL,
    "valorLibrosFin" numeric(14,2) NOT NULL,
    "depreciacionAcumulada" numeric(14,2) NOT NULL,
    "userId" integer NOT NULL
);


--
-- Name: depreciaciones_activos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.depreciaciones_activos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: depreciaciones_activos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.depreciaciones_activos_id_seq OWNED BY public.depreciaciones_activos.id;


--
-- Name: devolucion_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devolucion_detalles (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "devolucionId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(200) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "importeIva" numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);


--
-- Name: devolucion_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.devolucion_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: devolucion_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.devolucion_detalles_id_seq OWNED BY public.devolucion_detalles.id;


--
-- Name: devoluciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devoluciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    tipo public.devoluciones_tipo_enum DEFAULT 'total'::public.devoluciones_tipo_enum NOT NULL,
    estado public.devoluciones_estado_enum DEFAULT 'pendiente'::public.devoluciones_estado_enum NOT NULL,
    "facturaId" integer NOT NULL,
    "clienteId" integer NOT NULL,
    motivo text NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "userId" integer NOT NULL,
    "notaCreditoId" integer,
    "notaCreditoNumero" character varying(20),
    "generadaDesdeNc" boolean DEFAULT false NOT NULL,
    "almacenId" integer
);


--
-- Name: devoluciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.devoluciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: devoluciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.devoluciones_id_seq OWNED BY public.devoluciones.id;


--
-- Name: dispositivos_conocidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispositivos_conocidos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    fingerprint character varying(64) NOT NULL,
    ip character varying(45),
    "userAgent" character varying(255),
    pais character varying(2),
    "primeraVez" timestamp with time zone NOT NULL,
    "ultimaVez" timestamp with time zone NOT NULL
);


--
-- Name: documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "tipoEntidad" public.documentos_tipoentidad_enum DEFAULT 'general'::public.documentos_tipoentidad_enum NOT NULL,
    "entidadId" integer,
    nombre character varying(300) NOT NULL,
    "tipoMime" character varying(50),
    extension character varying(10),
    "tamanioKb" integer DEFAULT 0 NOT NULL,
    url text NOT NULL,
    descripcion text,
    "subidoPorId" integer NOT NULL,
    "nombreSubidoPor" character varying(200)
);


--
-- Name: documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documentos_id_seq OWNED BY public.documentos.id;


--
-- Name: ecf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ecf (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(13) NOT NULL,
    "tipoECFId" integer NOT NULL,
    "secuenciaId" integer NOT NULL,
    "facturaId" integer,
    "documentoOrigenTipo" character varying(20),
    "documentoOrigenId" integer,
    "fechaUso" timestamp without time zone,
    "isUsado" boolean DEFAULT false NOT NULL,
    "estadoDGII" public.ecf_estadodgii_enum DEFAULT 'pendiente'::public.ecf_estadodgii_enum NOT NULL,
    "codigoSeguridad" character varying(6) NOT NULL,
    xml text,
    "xmlRespuesta" text,
    "firmaDigital" text,
    "fechaFirma" timestamp without time zone,
    "intentosEnvio" integer DEFAULT 0 NOT NULL,
    "ultimoIntentoEnvio" timestamp without time zone,
    "errorEnvio" text,
    "proveedorReferencia" character varying(100),
    "modoEmision" character varying(15) DEFAULT 'PRODUCCION'::character varying NOT NULL,
    "trackId" character varying(36),
    "qrUrl" text,
    "jsonEnviado" jsonb,
    "respuestaMSeller" jsonb,
    "respuestaDgii" jsonb,
    "rncComprador" character varying(11),
    "razonSocialComprador" character varying(300),
    "direccionComprador" character varying(400),
    "montoExento" numeric(18,2),
    "montoGravado" numeric(18,2),
    "montoItbis" numeric(18,2),
    "montoTotal" numeric(18,2),
    "ncfModificado" character varying(13),
    "codigoModificacion" integer,
    "tipoExportacion" character varying(5),
    "monedaExtranjera" character varying(3),
    "tipoCambio" numeric(12,4),
    "montoRetencionIsr" numeric(18,2),
    "montoRetencionItbis" numeric(18,2),
    "secuenciaUtilizada" boolean,
    "archivadoEnPanel" boolean DEFAULT false NOT NULL,
    "archivadoPorId" integer,
    "archivadoEn" timestamp without time zone,
    "superAdminNotificado" boolean DEFAULT false NOT NULL,
    "notificadoResumen" boolean DEFAULT false NOT NULL,
    "ultimaConsultaAt" timestamp without time zone,
    "consultasRealizadas" integer DEFAULT 0 NOT NULL,
    "revisionManual" boolean DEFAULT false NOT NULL
);


--
-- Name: ecf_consumo_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ecf_consumo_ciclo (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "cicloInicio" date NOT NULL,
    "cicloFin" date NOT NULL,
    "aviso80EnviadoEn" timestamp with time zone,
    "aviso100EnviadoEn" timestamp with time zone,
    "planCobrado" character varying(20),
    "cupoCobrado" integer,
    "emitidosCobrados" integer,
    "precioUnitario" numeric(10,2),
    monto numeric(12,2),
    "cargoId" integer,
    "cobradoEn" timestamp with time zone,
    "cobradoPor" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ecf_consumo_ciclo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ecf_consumo_ciclo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ecf_consumo_ciclo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ecf_consumo_ciclo_id_seq OWNED BY public.ecf_consumo_ciclo.id;


--
-- Name: ecf_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ecf_eventos (
    id integer NOT NULL,
    "comprobanteId" integer NOT NULL,
    evento public.ecf_eventos_evento_enum NOT NULL,
    payload jsonb,
    mensaje text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ecf_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ecf_eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ecf_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ecf_eventos_id_seq OWNED BY public.ecf_eventos.id;


--
-- Name: ecf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ecf_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ecf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ecf_id_seq OWNED BY public.ecf.id;


--
-- Name: ecf_recibidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ecf_recibidos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    encf character varying(20) NOT NULL,
    "rncEmisor" character varying(15),
    "nombreEmisor" character varying(200),
    "fechaDocumento" date,
    "tipoEcf" character varying(5),
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoGravado" numeric(12,2),
    itbis numeric(12,2),
    "montoExento" numeric(12,2),
    status character varying(50) DEFAULT 'received'::character varying NOT NULL,
    "fuenteImportacion" character varying(10) DEFAULT 'csv'::character varying NOT NULL,
    "procesadoComoCompra" boolean DEFAULT false NOT NULL,
    "creadoEnMseller" timestamp without time zone,
    "urlDocumento" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ecf_recibidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ecf_recibidos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ecf_recibidos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ecf_recibidos_id_seq OWNED BY public.ecf_recibidos.id;


--
-- Name: ed_anios_escolares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_anios_escolares (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(50) NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "esActual" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_anios_escolares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_anios_escolares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_anios_escolares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_anios_escolares_id_seq OWNED BY public.ed_anios_escolares.id;


--
-- Name: ed_asignaturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_asignaturas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    codigo character varying(50),
    area character varying(100),
    "esEvaluable" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_asignaturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_asignaturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_asignaturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_asignaturas_id_seq OWNED BY public.ed_asignaturas.id;


--
-- Name: ed_asistencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_asistencia (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    "seccionId" integer NOT NULL,
    fecha date NOT NULL,
    estado character varying(20) NOT NULL,
    "asignaturaId" integer,
    justificacion text,
    "registradoPor" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_asistencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_asistencia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_asistencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_asistencia_id_seq OWNED BY public.ed_asistencia.id;


--
-- Name: ed_becas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_becas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    tipo character varying(30),
    valor numeric(12,2),
    "aplicaA" character varying(50),
    descripcion text,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_becas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_becas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_becas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_becas_id_seq OWNED BY public.ed_becas.id;


--
-- Name: ed_biblioteca_libros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_biblioteca_libros (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    codigo character varying(50),
    isbn character varying(50),
    titulo character varying(300) NOT NULL,
    autor character varying(200),
    editorial character varying(150),
    categoria character varying(100),
    "cantidadTotal" integer DEFAULT 1 NOT NULL,
    "cantidadDisponible" integer DEFAULT 1 NOT NULL,
    ubicacion character varying(100),
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_biblioteca_libros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_biblioteca_libros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_biblioteca_libros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_biblioteca_libros_id_seq OWNED BY public.ed_biblioteca_libros.id;


--
-- Name: ed_biblioteca_prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_biblioteca_prestamos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "libroId" integer NOT NULL,
    "estudianteId" integer,
    "docenteId" integer,
    "fechaPrestamo" date,
    "fechaVencimiento" date,
    "fechaDevolucion" date,
    estado character varying(20) DEFAULT 'prestado'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_biblioteca_prestamos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_biblioteca_prestamos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_biblioteca_prestamos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_biblioteca_prestamos_id_seq OWNED BY public.ed_biblioteca_prestamos.id;


--
-- Name: ed_calificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_calificaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "evaluacionId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    nota numeric(5,2),
    observacion text,
    entregado boolean DEFAULT true NOT NULL,
    "registradoPor" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_calificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_calificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_calificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_calificaciones_id_seq OWNED BY public.ed_calificaciones.id;


--
-- Name: ed_cargos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_cargos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "estudianteId" integer NOT NULL,
    "matriculaId" integer,
    "tutorResponsableId" integer,
    tipo character varying(30) NOT NULL,
    concepto character varying(200),
    periodo character varying(20),
    "montoOriginal" numeric(12,2),
    descuento numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoMora" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoTotal" numeric(12,2),
    "montoPagado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "saldoPendiente" numeric(12,2),
    "fechaVencimiento" date,
    "fechaPago" date,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "diasMora" integer DEFAULT 0 NOT NULL,
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "planPagoId" integer,
    descripcion character varying(200),
    mes integer,
    anio integer,
    "moraCondonada" boolean DEFAULT false NOT NULL
);


--
-- Name: ed_cargos_condonaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_cargos_condonaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "cargoId" integer NOT NULL,
    "montoCondonado" numeric(12,2) NOT NULL,
    motivo text NOT NULL,
    "usuarioId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_cargos_condonaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_cargos_condonaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_cargos_condonaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_cargos_condonaciones_id_seq OWNED BY public.ed_cargos_condonaciones.id;


--
-- Name: ed_cargos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_cargos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_cargos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_cargos_id_seq OWNED BY public.ed_cargos.id;


--
-- Name: ed_comedor_planes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_comedor_planes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    tipo character varying(30),
    "costoMensual" numeric(12,2),
    "restriccionesAlimenticias" text,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_comedor_planes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_comedor_planes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_comedor_planes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_comedor_planes_id_seq OWNED BY public.ed_comedor_planes.id;


--
-- Name: ed_comunicados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_comunicados (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    titulo character varying(300) NOT NULL,
    contenido text NOT NULL,
    tipo character varying(30),
    "destinatarioTipo" character varying(30),
    "gradoId" integer,
    "seccionId" integer,
    "estudianteId" integer,
    "fechaEnvio" timestamp without time zone DEFAULT now() NOT NULL,
    "enviarWhatsapp" boolean DEFAULT false NOT NULL,
    "enviarEmail" boolean DEFAULT false NOT NULL,
    "creadoPor" character varying(200),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_comunicados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_comunicados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_comunicados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_comunicados_id_seq OWNED BY public.ed_comunicados.id;


--
-- Name: ed_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_config (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "nombreCentro" character varying(300),
    "codigoMinerd" character varying(100),
    regional character varying(100),
    "distritoEducativo" character varying(100),
    "escalaMinima" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "escalaMaxima" numeric(5,2) DEFAULT '100'::numeric NOT NULL,
    "notaMinimaAprobar" numeric(5,2) DEFAULT '70'::numeric NOT NULL,
    "usaLetras" boolean DEFAULT false NOT NULL,
    "escalaLetras" jsonb,
    "cantidadPeriodos" integer DEFAULT 4 NOT NULL,
    "tipoPeriodo" character varying(20) DEFAULT 'trimestre'::character varying NOT NULL,
    "monedaColegiatura" character varying(10) DEFAULT 'DOP'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_config_id_seq OWNED BY public.ed_config.id;


--
-- Name: ed_disciplina; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_disciplina (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "estudianteId" integer NOT NULL,
    "seccionId" integer,
    fecha date NOT NULL,
    tipo character varying(30),
    categoria character varying(100),
    descripcion text NOT NULL,
    "medidaTomada" text,
    "reportadoPor" integer,
    "padresNotificados" boolean DEFAULT false NOT NULL,
    "fechaNotificacion" timestamp without time zone,
    estado character varying(20) DEFAULT 'abierto'::character varying NOT NULL,
    seguimiento text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_disciplina_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_disciplina_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_disciplina_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_disciplina_id_seq OWNED BY public.ed_disciplina.id;


--
-- Name: ed_docentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_docentes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    codigo character varying(30),
    nombres character varying(200) NOT NULL,
    apellidos character varying(200),
    cedula character varying(20),
    "fechaNacimiento" date,
    sexo character varying(10),
    telefono character varying(20),
    email character varying(100),
    direccion text,
    foto text,
    titulo character varying(200),
    especialidad character varying(200),
    "fechaIngreso" date,
    "empleadoId" integer,
    "usuarioId" integer,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_docentes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_docentes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_docentes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_docentes_id_seq OWNED BY public.ed_docentes.id;


--
-- Name: ed_enfermeria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_enfermeria (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    fecha timestamp without time zone NOT NULL,
    motivo text NOT NULL,
    sintomas text,
    "atencionBrindada" text,
    "medicamentoDado" character varying(200),
    "padresNotificados" boolean DEFAULT false NOT NULL,
    "enviadoCasa" boolean DEFAULT false NOT NULL,
    "atendidoPor" character varying(200),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_enfermeria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_enfermeria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_enfermeria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_enfermeria_id_seq OWNED BY public.ed_enfermeria.id;


--
-- Name: ed_estudiante_becas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_estudiante_becas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    "becaId" integer NOT NULL,
    "anioEscolarId" integer,
    "fechaAsignacion" date DEFAULT ('now'::text)::date NOT NULL,
    motivo text,
    "aprobadoPor" character varying(200),
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_estudiante_becas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_estudiante_becas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_estudiante_becas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_estudiante_becas_id_seq OWNED BY public.ed_estudiante_becas.id;


--
-- Name: ed_estudiantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_estudiantes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    matricula character varying(30),
    nombres character varying(200) NOT NULL,
    apellidos character varying(200) NOT NULL,
    cedula character varying(20),
    "actaNacimiento" character varying(50),
    "fechaNacimiento" date,
    sexo character varying(10),
    nacionalidad character varying(50) DEFAULT 'Dominicana'::character varying NOT NULL,
    direccion text,
    telefono character varying(20),
    email character varying(100),
    foto text,
    "tipoSangre" character varying(10),
    alergias text,
    "condicionesMedicas" text,
    "medicoTelefono" character varying(20),
    "seguroMedico" character varying(100),
    "colegioProcedencia" character varying(200),
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "fechaIngreso" date,
    observaciones text,
    "clienteId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_estudiantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_estudiantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_estudiantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_estudiantes_id_seq OWNED BY public.ed_estudiantes.id;


--
-- Name: ed_evaluaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_evaluaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "asignacionDocenteId" integer,
    "seccionId" integer NOT NULL,
    "asignaturaId" integer NOT NULL,
    "periodoId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo character varying(50),
    fecha date,
    "puntajeMaximo" numeric(5,2) DEFAULT '100'::numeric NOT NULL,
    ponderacion numeric(5,2),
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_evaluaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_evaluaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_evaluaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_evaluaciones_id_seq OWNED BY public.ed_evaluaciones.id;


--
-- Name: ed_grados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_grados (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "nivelId" integer,
    nombre character varying(100) NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_grados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_grados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_grados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_grados_id_seq OWNED BY public.ed_grados.id;


--
-- Name: ed_matriculas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_matriculas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "estudianteId" integer NOT NULL,
    "anioEscolarId" integer NOT NULL,
    "gradoId" integer NOT NULL,
    "seccionId" integer,
    "fechaMatricula" date,
    tipo character varying(30) DEFAULT 'nuevo_ingreso'::character varying NOT NULL,
    "montoInscripcion" numeric(12,2),
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    "facturaId" integer,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_matriculas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_matriculas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_matriculas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_matriculas_id_seq OWNED BY public.ed_matriculas.id;


--
-- Name: ed_niveles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_niveles (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_niveles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_niveles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_niveles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_niveles_id_seq OWNED BY public.ed_niveles.id;


--
-- Name: ed_notas_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_notas_periodo (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "estudianteId" integer NOT NULL,
    "asignaturaId" integer NOT NULL,
    "seccionId" integer NOT NULL,
    "periodoId" integer NOT NULL,
    "notaFinal" numeric(5,2),
    "notaLetra" character varying(5),
    aprobado boolean,
    observacion text
);


--
-- Name: ed_notas_periodo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_notas_periodo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_notas_periodo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_notas_periodo_id_seq OWNED BY public.ed_notas_periodo.id;


--
-- Name: ed_pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_pagos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "estudianteId" integer NOT NULL,
    "tutorId" integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    "montoPagado" numeric(12,2) NOT NULL,
    "metodoPago" character varying(50),
    referencia character varying(100),
    observaciones text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "motivoAnulacion" text,
    "anuladoPor" integer,
    "anuladoEn" timestamp without time zone
);


--
-- Name: ed_pagos_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_pagos_detalle (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "pagoId" integer NOT NULL,
    "cargoId" integer NOT NULL,
    monto numeric(12,2) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_pagos_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_pagos_detalle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_pagos_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_pagos_detalle_id_seq OWNED BY public.ed_pagos_detalle.id;


--
-- Name: ed_pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_pagos_id_seq OWNED BY public.ed_pagos.id;


--
-- Name: ed_periodos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_periodos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "anioEscolarId" integer NOT NULL,
    nombre character varying(50) NOT NULL,
    numero integer NOT NULL,
    "fechaInicio" date,
    "fechaFin" date,
    ponderacion numeric(5,2) DEFAULT '25'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'abierto'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_periodos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_periodos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_periodos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_periodos_id_seq OWNED BY public.ed_periodos.id;


--
-- Name: ed_planes_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_planes_pago (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    "gradoId" integer,
    "anioEscolarId" integer,
    "montoInscripcion" numeric(12,2),
    "montoColegiaturaMensual" numeric(12,2),
    "cantidadCuotas" integer DEFAULT 10 NOT NULL,
    "montoMaterial" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoSeguro" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "diaVencimiento" integer DEFAULT 5 NOT NULL,
    "cargoMoraPct" numeric(6,3) DEFAULT '0'::numeric NOT NULL,
    "diasGracia" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "estudianteId" integer,
    "montoColegiatura" numeric(12,2),
    "montoMatricula" numeric(12,2),
    "diaCobro" integer DEFAULT 5 NOT NULL,
    descuento numeric(6,2) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: ed_planes_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_planes_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_planes_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_planes_pago_id_seq OWNED BY public.ed_planes_pago.id;


--
-- Name: ed_secciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_secciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "gradoId" integer NOT NULL,
    "anioEscolarId" integer,
    nombre character varying(50) NOT NULL,
    "capacidadMaxima" integer DEFAULT 30 NOT NULL,
    aula character varying(50),
    "tutorId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_secciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_secciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_secciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_secciones_id_seq OWNED BY public.ed_secciones.id;


--
-- Name: ed_transporte_rutas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_transporte_rutas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    chofer character varying(200),
    "choferTelefono" character varying(20),
    "vehiculoPlaca" character varying(20),
    capacidad integer,
    "costoMensual" numeric(12,2),
    paradas jsonb,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ed_transporte_rutas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_transporte_rutas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_transporte_rutas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_transporte_rutas_id_seq OWNED BY public.ed_transporte_rutas.id;


--
-- Name: ed_tutores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ed_tutores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombres character varying(200) NOT NULL,
    apellidos character varying(200),
    cedula character varying(20),
    parentesco character varying(50),
    telefono character varying(20),
    "telefonoTrabajo" character varying(20),
    email character varying(100),
    direccion text,
    ocupacion character varying(100),
    "lugarTrabajo" character varying(200),
    "esResponsablePago" boolean DEFAULT false NOT NULL,
    "usuarioPortal" character varying(100),
    "clienteId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ed_tutores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ed_tutores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ed_tutores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ed_tutores_id_seq OWNED BY public.ed_tutores.id;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    cedula character varying(11) NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(100),
    telefono character varying(20),
    "fechaNacimiento" date NOT NULL,
    "fechaIngreso" date NOT NULL,
    "fechaSalida" date,
    cargo character varying(100) NOT NULL,
    departamento character varying(100),
    "salarioBase" numeric(12,2) NOT NULL,
    "tipoPago" public.empleados_tipopago_enum DEFAULT 'mensual'::public.empleados_tipopago_enum NOT NULL,
    "tipoContrato" public.empleados_tipocontrato_enum DEFAULT 'indefinido'::public.empleados_tipocontrato_enum NOT NULL,
    estado public.empleados_estado_enum DEFAULT 'activo'::public.empleados_estado_enum NOT NULL,
    sexo public.empleados_sexo_enum,
    banco character varying(100),
    "cuentaBancaria" character varying(30),
    "otrasDeduccionesFixed" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "lugarTrabajo" character varying(200),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric,
    "userId" integer,
    "departamentoId" integer,
    "cargoId" integer
);


--
-- Name: empleados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empleados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empleados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empleados_id_seq OWNED BY public.empleados.id;


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    rnc character varying(11) NOT NULL,
    nombre character varying(300) NOT NULL,
    "nombreComercial" character varying(200),
    direccion character varying(400) DEFAULT ''::character varying,
    ciudad character varying(100) DEFAULT 'Santo Domingo'::character varying,
    provincia character varying(100),
    telefono character varying(20),
    email character varying(150),
    "sitioWeb" character varying(300),
    logo text,
    sector character varying(100),
    "sectorOtroTexto" character varying(100),
    "regimenFiscal" character varying(100),
    "representanteLegal" character varying(200),
    "fechaConstitucion" date,
    "actividadEconomica" character varying(200),
    "codigoPostal" character varying(10),
    moneda character varying(30),
    "zonaHoraria" character varying(50) DEFAULT 'America/Santo_Domingo'::character varying,
    "tipoSociedad" character varying(50),
    "cedulaRepresentante" character varying(13),
    direccion2 character varying(200),
    "telefonoSecundario" character varying(20),
    favicon text,
    configuracion jsonb DEFAULT '{}'::jsonb,
    "controlCajaActivo" boolean DEFAULT false NOT NULL,
    "contadorPuedeVerAuditoria" boolean DEFAULT true NOT NULL,
    "permitirVentaBajoCosto" boolean DEFAULT true NOT NULL,
    "estadoAprobacion" character varying(20) DEFAULT 'aprobada'::character varying NOT NULL,
    "motivoRechazo" text,
    "aprobadoPor" integer,
    "fechaAprobacion" timestamp with time zone,
    "diasCreditoDefault" integer DEFAULT 30 NOT NULL,
    "limiteCreditoDefault" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "creditoHabilitado" boolean DEFAULT true NOT NULL,
    "xlinkId" uuid NOT NULL,
    "xlinkVisible" boolean DEFAULT false NOT NULL,
    "xlinkVisibleDesde" timestamp with time zone
);


--
-- Name: empresa_ecf_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_ecf_config (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer NOT NULL,
    "msellerEmail" character varying(150),
    "msellerPasswordEnc" text,
    "msellerApiKeyEnc" text,
    "msellerUrlBase" character varying(300) DEFAULT 'https://ecf.api.mseller.app'::character varying NOT NULL,
    modo public.empresa_ecf_config_modo_enum DEFAULT 'TEST'::public.empresa_ecf_config_modo_enum NOT NULL,
    "rncEmisor" character varying(11),
    "razonSocialEmisor" character varying(300),
    "nombreComercial" character varying(200),
    "direccionEmisor" character varying(400),
    municipio character varying(100),
    provincia character varying(100),
    activo boolean DEFAULT true NOT NULL,
    "bloqueadoHasta" timestamp without time zone
);


--
-- Name: empresa_ecf_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_ecf_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_ecf_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_ecf_config_id_seq OWNED BY public.empresa_ecf_config.id;


--
-- Name: empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_id_seq OWNED BY public.empresa.id;


--
-- Name: empresa_modulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_modulos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "moduloCodigo" character varying(50) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "fechaActivacion" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaVencimiento" timestamp without time zone,
    "activadoPor" integer,
    notas text,
    origen character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    "esCortesia" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa_modulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_modulos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_modulos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_modulos_id_seq OWNED BY public.empresa_modulos.id;


--
-- Name: encuestas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encuestas (
    id integer NOT NULL,
    "empresaId" integer,
    titulo character varying(200) NOT NULL,
    tipo character varying(20) DEFAULT 'nps'::character varying NOT NULL,
    descripcion text,
    preguntas jsonb DEFAULT '[]'::jsonb NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "tokenPublico" character varying(60),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: encuestas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encuestas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encuestas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encuestas_id_seq OWNED BY public.encuestas.id;


--
-- Name: etapas_ruta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etapas_ruta (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "rutaId" integer NOT NULL,
    "centroTrabajoId" integer,
    orden integer DEFAULT 1 NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    "tiempoSetupMin" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "tiempoOperacionMinPorUnidad" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "esControl" boolean DEFAULT false NOT NULL
);


--
-- Name: etapas_ruta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etapas_ruta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etapas_ruta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.etapas_ruta_id_seq OWNED BY public.etapas_ruta.id;


--
-- Name: evaluaciones_empleado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluaciones_empleado (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    "evaluadorId" integer NOT NULL,
    periodo public.evaluaciones_empleado_periodo_enum DEFAULT 'semestral'::public.evaluaciones_empleado_periodo_enum NOT NULL,
    anio integer NOT NULL,
    semestre integer DEFAULT 1 NOT NULL,
    estado public.evaluaciones_empleado_estado_enum DEFAULT 'borrador'::public.evaluaciones_empleado_estado_enum NOT NULL,
    criterios jsonb DEFAULT '{}'::jsonb NOT NULL,
    "calificacionGeneral" numeric(4,2),
    fortalezas text,
    "areasImprovement" text,
    comentarios text,
    "comentariosEmpleado" text
);


--
-- Name: evaluaciones_empleado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluaciones_empleado_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluaciones_empleado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluaciones_empleado_id_seq OWNED BY public.evaluaciones_empleado.id;


--
-- Name: fa_alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_alertas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    tipo character varying(30),
    "medicamentoId" integer,
    "loteId" integer,
    mensaje text,
    "diasRestantes" integer,
    resuelta boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_alertas_id_seq OWNED BY public.fa_alertas.id;


--
-- Name: fa_control_narcoticos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_control_narcoticos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "medicamentoId" integer NOT NULL,
    "loteId" integer,
    "dispensacionId" integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    tipo character varying(20),
    cantidad numeric(8,2) NOT NULL,
    "saldoAnterior" numeric(10,2),
    "saldoActual" numeric(10,2),
    "receptorNombre" character varying(200),
    "receptorCedula" character varying(20),
    "receptorMedico" character varying(200),
    "recetaNumero" character varying(100),
    "autorizadoPor" character varying(200),
    observaciones text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_control_narcoticos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_control_narcoticos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_control_narcoticos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_control_narcoticos_id_seq OWNED BY public.fa_control_narcoticos.id;


--
-- Name: fa_devoluciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_devoluciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "dispensacionId" integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    motivo text NOT NULL,
    "montoDevuelto" numeric(12,2),
    estado character varying(20) DEFAULT 'procesada'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_devoluciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_devoluciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_devoluciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_devoluciones_id_seq OWNED BY public.fa_devoluciones.id;


--
-- Name: fa_dispensacion_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_dispensacion_items (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "dispensacionId" integer NOT NULL,
    "medicamentoId" integer NOT NULL,
    "loteId" integer,
    cantidad numeric(8,2) NOT NULL,
    "precioUnitario" numeric(10,2) NOT NULL,
    descuento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2),
    instrucciones text,
    "requeriReceta" boolean DEFAULT false NOT NULL,
    "recetaVerificada" boolean DEFAULT false NOT NULL
);


--
-- Name: fa_dispensacion_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_dispensacion_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_dispensacion_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_dispensacion_items_id_seq OWNED BY public.fa_dispensacion_items.id;


--
-- Name: fa_dispensaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_dispensaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    "clienteId" integer,
    "clienteNombre" character varying(200),
    "clienteCedula" character varying(20),
    "recetaMedico" character varying(200),
    "recetaNumero" character varying(100),
    "recetaFecha" date,
    "arsNombre" character varying(100),
    "arsNumeroAfiliado" character varying(50),
    "autorizacionArs" character varying(100),
    "farmaceuticoId" integer,
    "farmaceuticoNombre" character varying(200),
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoCubierto" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "metodoPago" character varying(50),
    "facturaId" integer,
    estado character varying(20) DEFAULT 'completada'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_dispensaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_dispensaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_dispensaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_dispensaciones_id_seq OWNED BY public.fa_dispensaciones.id;


--
-- Name: fa_lotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_lotes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "medicamentoId" integer NOT NULL,
    "numeroLote" character varying(100) NOT NULL,
    "fechaFabricacion" date,
    "fechaVencimiento" date NOT NULL,
    "cantidadInicial" integer NOT NULL,
    "cantidadActual" integer NOT NULL,
    "proveedorId" integer,
    "fechaCompra" date,
    "precioCompra" numeric(10,2),
    "facturaCompra" character varying(100),
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_lotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_lotes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_lotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_lotes_id_seq OWNED BY public.fa_lotes.id;


--
-- Name: fa_medicamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_medicamentos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    codigo character varying(50),
    "codigoBarra" character varying(100),
    "nombreGenerico" character varying(200) NOT NULL,
    "nombreComercial" character varying(200),
    laboratorio character varying(100),
    categoria character varying(100),
    forma character varying(50),
    concentracion character varying(100),
    via character varying(50),
    "unidadMedida" character varying(30),
    "requiereReceta" boolean DEFAULT false NOT NULL,
    "esNarcotico" boolean DEFAULT false NOT NULL,
    "esPsicotropico" boolean DEFAULT false NOT NULL,
    "esRefrigerado" boolean DEFAULT false NOT NULL,
    "precioCompra" numeric(10,2),
    "precioVenta" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "precioArs" numeric(10,2),
    "margenGanancia" numeric(5,2),
    "stockMinimo" integer DEFAULT 10 NOT NULL,
    "stockMaximo" integer,
    "stockActual" integer DEFAULT 0 NOT NULL,
    "productoId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_medicamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_medicamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_medicamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_medicamentos_id_seq OWNED BY public.fa_medicamentos.id;


--
-- Name: fa_recepcion_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_recepcion_items (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "recepcionId" integer NOT NULL,
    "medicamentoId" integer NOT NULL,
    "numeroLote" character varying(100) NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "cantidadOrdenada" integer,
    "cantidadRecibida" integer NOT NULL,
    "precioCompra" numeric(10,2),
    "precioVenta" numeric(10,2),
    subtotal numeric(12,2)
);


--
-- Name: fa_recepcion_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_recepcion_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_recepcion_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_recepcion_items_id_seq OWNED BY public.fa_recepcion_items.id;


--
-- Name: fa_recepciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_recepciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    fecha date NOT NULL,
    "proveedorId" integer,
    "facturaProveedor" character varying(100),
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "compraId" integer,
    estado character varying(20) DEFAULT 'recibida'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_recepciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_recepciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_recepciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_recepciones_id_seq OWNED BY public.fa_recepciones.id;


--
-- Name: fa_reclamaciones_ars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_reclamaciones_ars (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "arsNombre" character varying(100) NOT NULL,
    "periodoDesde" date,
    "periodoHasta" date,
    "cantidadDispensaciones" integer,
    "montoTotal" numeric(12,2),
    "montoCubierto" numeric(12,2),
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "fechaEnvio" date,
    "fechaPago" date,
    observaciones text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fa_reclamaciones_ars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fa_reclamaciones_ars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fa_reclamaciones_ars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fa_reclamaciones_ars_id_seq OWNED BY public.fa_reclamaciones_ars.id;


--
-- Name: factura_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura_detalles (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "facturaId" integer NOT NULL,
    "productoId" integer,
    "opticaInventarioId" integer,
    descripcion character varying(200) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "importeIva" numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoMonto" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "precioOriginal" numeric(12,2),
    "costoUnitario" numeric(14,4) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: factura_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_detalles_id_seq OWNED BY public.factura_detalles.id;


--
-- Name: facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    folio character varying(20) NOT NULL,
    fecha date NOT NULL,
    estado public.facturas_estado_enum DEFAULT 'borrador'::public.facturas_estado_enum NOT NULL,
    "clienteId" integer,
    "usuarioId" integer NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "ecfId" integer,
    "tipoNcf" character varying(10) DEFAULT 'E32'::character varying,
    "sucursalId" integer,
    "vendedorId" integer,
    "nombreVendedor" character varying(150),
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "totalOriginal" numeric(12,2),
    notas text,
    "facturaRecurrenteId" integer,
    "emailEstado" character varying(12),
    "emailEnviadoAt" timestamp without time zone,
    "emailDestino" character varying(320),
    "emailError" text,
    "emailIntentos" integer DEFAULT 0 NOT NULL,
    "ecfError" text,
    "ecfErrorAt" timestamp without time zone,
    "tipoPago" character varying(10) DEFAULT 'CONTADO'::character varying NOT NULL,
    "diasCredito" integer DEFAULT 0 NOT NULL,
    "fechaVencimiento" date,
    "aplicaRetenciones" boolean DEFAULT false NOT NULL,
    "retieneItbis" boolean DEFAULT false NOT NULL,
    "porcentajeRetencionItbis" numeric(5,2) DEFAULT '30'::numeric NOT NULL,
    "montoRetencionItbis" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "retieneIsr" boolean DEFAULT false NOT NULL,
    "porcentajeRetencionIsr" numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    "montoRetencionIsr" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "netoCobrar" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "anulacionPendiente" boolean DEFAULT false NOT NULL,
    "supervisorSessionId" integer,
    "descuentoGeneralTipo" character varying(10),
    "descuentoGeneralValor" numeric(12,4),
    "descuentoGeneralFinal" numeric(12,2),
    "rncComprador" character varying(11),
    "razonSocialComprador" character varying(300),
    "ordenCompraNumero" character varying(100),
    "ordenCompraUrl" text,
    "formasPago" jsonb,
    "claveIdempotencia" character varying(36),
    "origenTipo" character varying(30),
    "origenId" integer
);


--
-- Name: facturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facturas_id_seq OWNED BY public.facturas.id;


--
-- Name: facturas_recurrentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturas_recurrentes (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(200) NOT NULL,
    "clienteId" integer NOT NULL,
    detalles json NOT NULL,
    frecuencia public.facturas_recurrentes_frecuencia_enum DEFAULT 'mensual'::public.facturas_recurrentes_frecuencia_enum NOT NULL,
    "diaMes" integer,
    "diaSemana" integer,
    "fechaInicio" date NOT NULL,
    "proximaEjecucion" date NOT NULL,
    "ultimaEjecucion" date,
    "fechaFin" date,
    "totalGeneradas" integer DEFAULT 0 NOT NULL,
    "ciclosSaltados" integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "modoEmision" character varying(10) DEFAULT 'borrador'::character varying NOT NULL,
    "tipoEcf" character varying(4),
    "formaPago" integer DEFAULT 1 NOT NULL,
    "diasCredito" integer DEFAULT 0 NOT NULL,
    "emailCliente" boolean DEFAULT true NOT NULL,
    "avisoPrevioDias" integer DEFAULT 0 NOT NULL,
    "avisoPrevioEnviadoPara" date,
    "ultimoError" text,
    "ultimoErrorAt" timestamp without time zone,
    notas text,
    "userId" integer NOT NULL
);


--
-- Name: facturas_recurrentes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facturas_recurrentes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facturas_recurrentes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facturas_recurrentes_id_seq OWNED BY public.facturas_recurrentes.id;


--
-- Name: gastos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    fecha date NOT NULL,
    categoria public.gastos_categoria_enum NOT NULL,
    descripcion character varying(300) NOT NULL,
    monto numeric(12,2) NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) NOT NULL,
    proveedor character varying(200),
    comprobante character varying(50),
    "rncProveedor" character varying(11),
    "tipoBienes" character varying(2),
    "formaPago" character varying(2),
    periodo character varying(7) NOT NULL,
    "asientoId" integer,
    "userId" integer NOT NULL,
    "sucursalId" integer,
    "cajaDiariaId" integer,
    numero character varying(20),
    "destinoItbis" character varying(30),
    "destinoItbisMotivo" text
);


--
-- Name: gastos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_id_seq OWNED BY public.gastos.id;


--
-- Name: gastos_importacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos_importacion (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "compraId" integer NOT NULL,
    "embarqueId" integer,
    concepto character varying(200) NOT NULL,
    tipo character varying(20) NOT NULL,
    monto numeric(12,2) NOT NULL,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "montoDOP" numeric(12,2) NOT NULL,
    "criterioProrrateo" character varying(20) DEFAULT 'valor_fob'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "ajusteRetroactivo" boolean DEFAULT false NOT NULL,
    "motivoAjuste" text,
    "aplicadoAt" timestamp with time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gastos_importacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_importacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_importacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_importacion_id_seq OWNED BY public.gastos_importacion.id;


--
-- Name: gastos_importacion_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos_importacion_lineas (
    id integer NOT NULL,
    "gastoImportacionId" integer NOT NULL,
    "compraDetalleId" integer NOT NULL,
    "montoAsignado" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "montoUnitario" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "ajusteManual" boolean DEFAULT false NOT NULL
);


--
-- Name: gastos_importacion_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_importacion_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_importacion_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_importacion_lineas_id_seq OWNED BY public.gastos_importacion_lineas.id;


--
-- Name: gm_accesos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_accesos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "membresiaId" integer,
    tipo character varying DEFAULT 'entrada'::character varying NOT NULL,
    "fechaHora" timestamp without time zone DEFAULT now() NOT NULL,
    metodo character varying(50),
    autorizado boolean DEFAULT true NOT NULL,
    "motivoRechazo" character varying(200),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_accesos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_accesos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_accesos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_accesos_id_seq OWNED BY public.gm_accesos.id;


--
-- Name: gm_clases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_clases (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    tipo character varying(50),
    categoria character varying(50),
    "capacidadMaxima" integer DEFAULT 20 NOT NULL,
    "duracionMinutos" integer DEFAULT 60 NOT NULL,
    "costoAdicional" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "entrenadorId" integer,
    "imagenUrl" character varying(500),
    color character varying DEFAULT '#1E3A8A'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_clases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_clases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_clases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_clases_id_seq OWNED BY public.gm_clases.id;


--
-- Name: gm_comidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_comidas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "planNutricionalId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    hora character varying(10),
    alimentos jsonb,
    "caloriasTotal" integer,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: gm_comidas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_comidas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_comidas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_comidas_id_seq OWNED BY public.gm_comidas.id;


--
-- Name: gm_entrenadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_entrenadores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellidos character varying(100),
    especialidad character varying(100),
    certificaciones text,
    foto character varying(500),
    telefono character varying(20),
    email character varying(150),
    "tarifaSesion" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "tarifaMes" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    horario jsonb,
    "empleadoId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_entrenadores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_entrenadores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_entrenadores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_entrenadores_id_seq OWNED BY public.gm_entrenadores.id;


--
-- Name: gm_lockers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_lockers (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20) NOT NULL,
    area character varying(50),
    estado character varying DEFAULT 'disponible'::character varying NOT NULL,
    "miembroId" integer,
    "fechaAsignacion" date,
    "precioMes" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: gm_lockers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_lockers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_lockers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_lockers_id_seq OWNED BY public.gm_lockers.id;


--
-- Name: gm_membresias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_membresias (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    "miembroId" integer NOT NULL,
    "planId" integer NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    precio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "precioInscripcion" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying DEFAULT 'activa'::character varying NOT NULL,
    congelada boolean DEFAULT false NOT NULL,
    "fechaCongelamiento" date,
    "diasCongelados" integer DEFAULT 0 NOT NULL,
    "motivoCongelamiento" text,
    "renovacionDe" integer,
    "facturaId" integer,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_membresias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_membresias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_membresias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_membresias_id_seq OWNED BY public.gm_membresias.id;


--
-- Name: gm_miembros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_miembros (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    nombre character varying(100) NOT NULL,
    apellidos character varying(100),
    cedula character varying(20),
    "fechaNacimiento" date,
    sexo character varying(10),
    telefono character varying(20),
    "telefonoEmergencia" character varying(20),
    "contactoEmergencia" character varying(100),
    email character varying(150),
    direccion text,
    foto character varying(500),
    "pesoInicial" numeric(6,2),
    "tallaInicial" numeric(6,2),
    "imcInicial" numeric(6,2),
    objetivo character varying(200),
    "nivelFitness" character varying(50),
    "condicionesMedicas" text,
    lesiones text,
    medicamentos text,
    "codigoAcceso" character varying(100),
    estado character varying DEFAULT 'activo'::character varying NOT NULL,
    "clienteId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_miembros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_miembros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_miembros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_miembros_id_seq OWNED BY public.gm_miembros.id;


--
-- Name: gm_planes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_planes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    tipo character varying(50),
    "duracionDias" integer DEFAULT 30 NOT NULL,
    precio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "precioInscripcion" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    moneda character varying DEFAULT 'DOP'::character varying NOT NULL,
    "incluyeClases" boolean DEFAULT true NOT NULL,
    "limiteClasesMes" integer,
    "incluyeEntrenadorPersonal" boolean DEFAULT false NOT NULL,
    "sesionesEntrenadorMes" integer DEFAULT 0 NOT NULL,
    "incluyeNutricion" boolean DEFAULT false NOT NULL,
    "incluyeLocker" boolean DEFAULT false NOT NULL,
    acceso24h boolean DEFAULT false NOT NULL,
    "permiteCongelar" boolean DEFAULT true NOT NULL,
    "diasCongelamientoMax" integer DEFAULT 15 NOT NULL,
    "renovacionAutomatica" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_planes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_planes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_planes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_planes_id_seq OWNED BY public.gm_planes.id;


--
-- Name: gm_planes_nutricionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_planes_nutricionales (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "entrenadorId" integer,
    nombre character varying(100) NOT NULL,
    objetivo character varying(200),
    "caloriasObjetivo" integer,
    "proteinasGramos" numeric(6,2),
    "carbohidratosGramos" numeric(6,2),
    "grasasGramos" numeric(6,2),
    "fechaInicio" date,
    "fechaFin" date,
    activo boolean DEFAULT true NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_planes_nutricionales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_planes_nutricionales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_planes_nutricionales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_planes_nutricionales_id_seq OWNED BY public.gm_planes_nutricionales.id;


--
-- Name: gm_productos_tienda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_productos_tienda (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    categoria character varying(50),
    precio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    "imagenUrl" character varying(500),
    "productoId" integer,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: gm_productos_tienda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_productos_tienda_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_productos_tienda_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_productos_tienda_id_seq OWNED BY public.gm_productos_tienda.id;


--
-- Name: gm_progreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_progreso (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "entrenadorId" integer,
    fecha date NOT NULL,
    peso numeric(6,2),
    talla numeric(6,2),
    imc numeric(6,2),
    "grasaCorporal" numeric(6,2),
    "masaMuscular" numeric(6,2),
    pecho numeric(6,2),
    cintura numeric(6,2),
    cadera numeric(6,2),
    "brazoDerecho" numeric(6,2),
    "brazoIzquierdo" numeric(6,2),
    "musloDerecho" numeric(6,2),
    "musloIzquierdo" numeric(6,2),
    "fotoFrontal" character varying(500),
    "fotoPerfil" character varying(500),
    "fotoEspalda" character varying(500),
    observaciones text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_progreso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_progreso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_progreso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_progreso_id_seq OWNED BY public.gm_progreso.id;


--
-- Name: gm_reservas_clases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_reservas_clases (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "scheduleId" integer NOT NULL,
    fecha date NOT NULL,
    estado character varying DEFAULT 'reservada'::character varying NOT NULL,
    pagado boolean DEFAULT false NOT NULL,
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_reservas_clases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_reservas_clases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_reservas_clases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_reservas_clases_id_seq OWNED BY public.gm_reservas_clases.id;


--
-- Name: gm_rutina_dias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_rutina_dias (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "rutinaId" integer NOT NULL,
    "numeroDia" integer NOT NULL,
    nombre character varying(100),
    "grupoMuscular" character varying(100),
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: gm_rutina_dias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_rutina_dias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_rutina_dias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_rutina_dias_id_seq OWNED BY public.gm_rutina_dias.id;


--
-- Name: gm_rutina_ejercicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_rutina_ejercicios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "rutinaDiaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    "grupoMuscular" character varying(100),
    series integer,
    repeticiones character varying(50),
    "descansoSegundos" integer,
    "pesoKg" numeric(6,2),
    notas text,
    "videoUrl" character varying(500),
    "imagenUrl" character varying(500),
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: gm_rutina_ejercicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_rutina_ejercicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_rutina_ejercicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_rutina_ejercicios_id_seq OWNED BY public.gm_rutina_ejercicios.id;


--
-- Name: gm_rutinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_rutinas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "entrenadorId" integer,
    nombre character varying(100) NOT NULL,
    objetivo character varying(200),
    "duracionSemanas" integer DEFAULT 4 NOT NULL,
    nivel character varying(50),
    "diasSemana" integer DEFAULT 3 NOT NULL,
    "fechaInicio" date,
    "fechaFin" date,
    activa boolean DEFAULT true NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_rutinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_rutinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_rutinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_rutinas_id_seq OWNED BY public.gm_rutinas.id;


--
-- Name: gm_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_schedule (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "claseId" integer NOT NULL,
    "entrenadorId" integer,
    "diaSemana" integer NOT NULL,
    "horaInicio" time without time zone NOT NULL,
    "horaFin" time without time zone NOT NULL,
    sala character varying(50),
    "fechaDesde" date,
    "fechaHasta" date,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_schedule_id_seq OWNED BY public.gm_schedule.id;


--
-- Name: gm_sesiones_ep; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gm_sesiones_ep (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "miembroId" integer NOT NULL,
    "entrenadorId" integer,
    "membresiaId" integer,
    fecha timestamp without time zone NOT NULL,
    "duracionMinutos" integer DEFAULT 60 NOT NULL,
    tipo character varying(50),
    estado character varying DEFAULT 'programada'::character varying NOT NULL,
    observaciones text,
    "proximaSesion" date,
    pagado boolean DEFAULT false NOT NULL,
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gm_sesiones_ep_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gm_sesiones_ep_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gm_sesiones_ep_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gm_sesiones_ep_id_seq OWNED BY public.gm_sesiones_ep.id;


--
-- Name: grupos_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupos_producto (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(10) NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    "parentId" integer,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: grupos_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grupos_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grupos_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grupos_producto_id_seq OWNED BY public.grupos_producto.id;


--
-- Name: hitos_proyecto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hitos_proyecto (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "proyectoId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    fecha date NOT NULL,
    descripcion text,
    completado boolean DEFAULT false NOT NULL,
    "fechaCompletado" date
);


--
-- Name: hitos_proyecto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hitos_proyecto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hitos_proyecto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hitos_proyecto_id_seq OWNED BY public.hitos_proyecto.id;


--
-- Name: invitaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitaciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    email character varying(100) NOT NULL,
    token character varying(100) NOT NULL,
    "empresaId" integer NOT NULL,
    rol public.invitaciones_rol_enum DEFAULT 'viewer'::public.invitaciones_rol_enum NOT NULL,
    estado public.invitaciones_estado_enum DEFAULT 'pendiente'::public.invitaciones_estado_enum NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    "invitadoPorId" integer NOT NULL,
    "nombreEmpresa" character varying(200),
    "nombreInvitador" character varying(100)
);


--
-- Name: invitaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invitaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invitaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invitaciones_id_seq OWNED BY public.invitaciones.id;


--
-- Name: licitaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licitaciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(30) NOT NULL,
    titulo character varying(300) NOT NULL,
    descripcion text,
    "entidadConvocante" character varying(200) NOT NULL,
    "rncEntidad" character varying(60),
    tipo public.licitaciones_tipo_enum DEFAULT 'publica'::public.licitaciones_tipo_enum NOT NULL,
    estado public.licitaciones_estado_enum DEFAULT 'identificada'::public.licitaciones_estado_enum NOT NULL,
    "montoEstimado" numeric(16,2),
    "montoOfertado" numeric(16,2),
    "montoAdjudicado" numeric(16,2),
    "fechaPublicacion" date NOT NULL,
    "fechaLimiteOfertas" date,
    "fechaApertura" date,
    "fechaAdjudicacion" date,
    requisitos text,
    "motivoPerdida" text,
    "enlacePortal" character varying(200),
    "responsableId" integer,
    "clienteId" integer
);


--
-- Name: licitaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.licitaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: licitaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.licitaciones_id_seq OWNED BY public.licitaciones.id;


--
-- Name: lineas_conteo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lineas_conteo (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "conteoId" integer NOT NULL,
    orden integer NOT NULL,
    "productoId" integer NOT NULL,
    "productoCodigo" character varying(30),
    "productoNombre" character varying(200),
    "unidadMedida" character varying(20),
    "ubicacionId" integer,
    "tieneLotes" boolean DEFAULT false NOT NULL,
    "tieneSeriales" boolean DEFAULT false NOT NULL,
    "cantidadSistema" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "cantidadContada" numeric(12,4),
    "cantidadRecuento" numeric(12,4),
    diferencia numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "movimientosVentana" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "costoUnitario" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "estadoLinea" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "contadaPorId" integer,
    "contadaEn" timestamp with time zone,
    "recuentadoPorId" integer,
    "recuentadaEn" timestamp with time zone,
    nota text
);


--
-- Name: lineas_conteo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lineas_conteo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lineas_conteo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lineas_conteo_id_seq OWNED BY public.lineas_conteo.id;


--
-- Name: listas_materiales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listas_materiales (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    "productoFinalId" integer NOT NULL,
    rendimiento numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "unidadRendimiento" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    "costoPorUnidad" numeric(14,2),
    activa boolean DEFAULT true NOT NULL
);


--
-- Name: listas_materiales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listas_materiales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listas_materiales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listas_materiales_id_seq OWNED BY public.listas_materiales.id;


--
-- Name: lotes_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lotes_producto (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    "almacenId" integer,
    "numeroLote" character varying(100) NOT NULL,
    "fechaFabricacion" date,
    "fechaVencimiento" date,
    "cantidadInicial" numeric(12,4) NOT NULL,
    "cantidadDisponible" numeric(12,4) NOT NULL,
    "costoUnitario" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado public.lotes_producto_estado_enum DEFAULT 'activo'::public.lotes_producto_estado_enum NOT NULL,
    proveedor character varying(200),
    referencia character varying(100),
    notas text
);


--
-- Name: lotes_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lotes_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lotes_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lotes_producto_id_seq OWNED BY public.lotes_producto.id;


--
-- Name: mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    titulo character varying(200) NOT NULL,
    cuerpo text NOT NULL,
    tipo character varying(10) NOT NULL,
    destinatario character varying(10) NOT NULL,
    "destinatarioIds" integer[],
    "destinatarioPlan" character varying(50),
    "fechaPublicacion" timestamp without time zone NOT NULL,
    "fechaExpiracion" timestamp without time zone,
    activo boolean DEFAULT true NOT NULL,
    "editadoEn" timestamp without time zone,
    "createdBy" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mensajes_lectura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes_lectura (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "mensajeId" uuid NOT NULL,
    "usuarioId" integer NOT NULL,
    "vistoEn" timestamp without time zone,
    "leidoEn" timestamp without time zone,
    "archivadoEn" timestamp without time zone,
    "eliminadoEn" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: modulos_addon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos_addon (
    id integer NOT NULL,
    codigo character varying(50) NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    "isActive" boolean DEFAULT true NOT NULL,
    "activacionAutomatica" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: modulos_addon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulos_addon_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulos_addon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulos_addon_id_seq OWNED BY public.modulos_addon.id;


--
-- Name: movimientos_bancarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_bancarios (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cuentaBancariaId" integer NOT NULL,
    tipo public.movimientos_bancarios_tipo_enum NOT NULL,
    monto numeric(14,2) NOT NULL,
    fecha date NOT NULL,
    descripcion character varying(300) NOT NULL,
    referencia character varying(50),
    origen public.movimientos_bancarios_origen_enum DEFAULT 'manual'::public.movimientos_bancarios_origen_enum NOT NULL,
    "origenId" integer,
    "saldoAnterior" numeric(14,2) NOT NULL,
    "saldoNuevo" numeric(14,2) NOT NULL,
    conciliado boolean DEFAULT false NOT NULL,
    "fechaConciliacion" date,
    "userId" integer NOT NULL
);


--
-- Name: movimientos_bancarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_bancarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_bancarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_bancarios_id_seq OWNED BY public.movimientos_bancarios.id;


--
-- Name: movimientos_caja_chica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_caja_chica (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cajaChicaId" integer NOT NULL,
    tipo public.movimientos_caja_chica_tipo_enum NOT NULL,
    fecha date NOT NULL,
    descripcion character varying(300) NOT NULL,
    categoria character varying(50),
    monto numeric(12,2) NOT NULL,
    "saldoAnterior" numeric(12,2) NOT NULL,
    "saldoNuevo" numeric(12,2) NOT NULL,
    comprobante character varying(60),
    beneficiario character varying(150),
    "userId" integer NOT NULL,
    notas text
);


--
-- Name: movimientos_caja_chica_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_caja_chica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_caja_chica_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_caja_chica_id_seq OWNED BY public.movimientos_caja_chica.id;


--
-- Name: movimientos_estadisticos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_estadisticos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "cuentaId" integer NOT NULL,
    fecha date NOT NULL,
    valor numeric(18,4) NOT NULL,
    descripcion character varying(200),
    referencia character varying(50),
    "userId" integer
);


--
-- Name: movimientos_estadisticos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_estadisticos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_estadisticos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_estadisticos_id_seq OWNED BY public.movimientos_estadisticos.id;


--
-- Name: movimientos_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_inventario (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    tipo public.movimientos_inventario_tipo_enum NOT NULL,
    "productoId" integer NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "cantidadAnterior" numeric(12,4) NOT NULL,
    "cantidadNueva" numeric(12,4) NOT NULL,
    motivo text,
    referencia character varying(50),
    "userId" integer NOT NULL,
    "almacenId" integer
);


--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_inventario_id_seq OWNED BY public.movimientos_inventario.id;


--
-- Name: nomina_anticipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_anticipos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    monto numeric(12,2) NOT NULL,
    "periodoDescontar" character varying(7) NOT NULL,
    descripcion character varying(300),
    estado public.nomina_anticipos_estado_enum DEFAULT 'pendiente'::public.nomina_anticipos_estado_enum NOT NULL
);


--
-- Name: nomina_anticipos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_anticipos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_anticipos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_anticipos_id_seq OWNED BY public.nomina_anticipos.id;


--
-- Name: nomina_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "periodoId" integer NOT NULL,
    "empleadoId" integer NOT NULL,
    "salarioBase" numeric(12,2) NOT NULL,
    "diasTrabajados" integer DEFAULT 30 NOT NULL,
    "horasExtras" integer DEFAULT 0 NOT NULL,
    "montoHorasExtras" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    bonos numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "salarioBruto" numeric(12,2) NOT NULL,
    "tssSfsEmpleado" numeric(10,2) NOT NULL,
    "tssAfpEmpleado" numeric(10,2) NOT NULL,
    "totalTSSEmpleado" numeric(10,2) NOT NULL,
    isr numeric(10,2) NOT NULL,
    "otrosDescuentos" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "otrasDeduciones" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "totalDeducciones" numeric(10,2) NOT NULL,
    "salarioNeto" numeric(12,2) NOT NULL,
    "tssSfsPatronal" numeric(10,2) NOT NULL,
    "tssAfpPatronal" numeric(10,2) NOT NULL,
    "tssSrlPatronal" numeric(10,2) NOT NULL,
    "totalTSSPatronal" numeric(10,2) NOT NULL,
    "costoTotalEmpleado" numeric(12,2) NOT NULL,
    "novedadesDetalle" text,
    moneda character varying(3) DEFAULT 'DOP'::character varying,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric,
    "salarioBaseUSD" numeric(12,2)
);


--
-- Name: nomina_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_lineas_id_seq OWNED BY public.nomina_lineas.id;


--
-- Name: nomina_novedades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_novedades (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    "periodoId" integer,
    tipo public.nomina_novedades_tipo_enum NOT NULL,
    descripcion character varying(200) NOT NULL,
    monto numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "horasExtras" integer DEFAULT 0 NOT NULL,
    aplicado boolean DEFAULT false NOT NULL
);


--
-- Name: nomina_novedades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_novedades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_novedades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_novedades_id_seq OWNED BY public.nomina_novedades.id;


--
-- Name: nomina_periodos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_periodos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    periodo character varying(7) NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    "fechaPago" date NOT NULL,
    "diasPeriodo" integer DEFAULT 30 NOT NULL,
    estado public.nomina_periodos_estado_enum DEFAULT 'borrador'::public.nomina_periodos_estado_enum NOT NULL,
    "totalEmpleados" integer DEFAULT 0 NOT NULL,
    "totalSalariosBruto" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "totalTSSEmpleados" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalISR" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalOtrasDeducciones" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalNeto" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "totalTSSPatronal" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalCostoEmpresa" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "userId" integer NOT NULL
);


--
-- Name: nomina_periodos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_periodos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_periodos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_periodos_id_seq OWNED BY public.nomina_periodos.id;


--
-- Name: nomina_prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomina_prestamos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    monto numeric(12,2) NOT NULL,
    cuotas integer NOT NULL,
    "cuotasPagadas" integer DEFAULT 0 NOT NULL,
    "montoMensual" numeric(10,2) NOT NULL,
    "saldoPendiente" numeric(12,2) NOT NULL,
    "fechaDesembolso" date NOT NULL,
    descripcion character varying(300),
    estado public.nomina_prestamos_estado_enum DEFAULT 'activo'::public.nomina_prestamos_estado_enum NOT NULL
);


--
-- Name: nomina_prestamos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomina_prestamos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomina_prestamos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomina_prestamos_id_seq OWNED BY public.nomina_prestamos.id;


--
-- Name: nota_credito_compra_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nota_credito_compra_detalles (
    id integer NOT NULL,
    "notaCreditoCompraId" integer NOT NULL,
    "productoId" integer,
    "compraDetalleId" integer,
    descripcion character varying(300) NOT NULL,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    iva numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);


--
-- Name: nota_credito_compra_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nota_credito_compra_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nota_credito_compra_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nota_credito_compra_detalles_id_seq OWNED BY public.nota_credito_compra_detalles.id;


--
-- Name: nota_credito_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nota_credito_detalles (
    id integer NOT NULL,
    "notaCreditoId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    iva numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);


--
-- Name: nota_credito_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nota_credito_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nota_credito_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nota_credito_detalles_id_seq OWNED BY public.nota_credito_detalles.id;


--
-- Name: nota_debito_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nota_debito_detalles (
    id integer NOT NULL,
    "notaDebitoId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    iva numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
);


--
-- Name: nota_debito_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nota_debito_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nota_debito_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nota_debito_detalles_id_seq OWNED BY public.nota_debito_detalles.id;


--
-- Name: notas_credito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_credito (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "tipoNcf" character varying(10) DEFAULT 'E34'::character varying NOT NULL,
    "facturaOriginalId" integer,
    "facturaOriginalFolio" character varying(20),
    "clienteId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    motivo public.notas_credito_motivo_enum DEFAULT 'devolucion'::public.notas_credito_motivo_enum NOT NULL,
    "descripcionMotivo" text,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado public.notas_credito_estado_enum DEFAULT 'borrador'::public.notas_credito_estado_enum NOT NULL,
    "sucursalId" integer,
    "vendedorId" integer,
    "nombreVendedor" character varying(150),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "efectosAplicados" boolean DEFAULT false NOT NULL,
    "codigoModificacion" character varying(1),
    "devolucionId" integer,
    "devolucionNumero" character varying(20)
);


--
-- Name: notas_credito_compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_credito_compras (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "proveedorId" integer NOT NULL,
    "compraOriginalId" integer,
    "compraOriginalFolio" character varying(20),
    tipo character varying(30) DEFAULT 'devolucion_inventario'::character varying NOT NULL,
    "ncfProveedor" character varying(50),
    motivo public.notas_credito_compras_motivo_enum DEFAULT 'devolucion'::public.notas_credito_compras_motivo_enum NOT NULL,
    "descripcionMotivo" text,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado public.notas_credito_compras_estado_enum DEFAULT 'borrador'::public.notas_credito_compras_estado_enum NOT NULL,
    "usuarioId" integer NOT NULL,
    notas text
);


--
-- Name: notas_credito_compras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notas_credito_compras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notas_credito_compras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notas_credito_compras_id_seq OWNED BY public.notas_credito_compras.id;


--
-- Name: notas_credito_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notas_credito_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notas_credito_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notas_credito_id_seq OWNED BY public.notas_credito.id;


--
-- Name: notas_debito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_debito (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "tipoNcf" character varying(10) DEFAULT 'E33'::character varying NOT NULL,
    "facturaOriginalId" integer,
    "facturaOriginalFolio" character varying(20),
    "clienteId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    motivo public.notas_debito_motivo_enum DEFAULT 'cargo_adicional'::public.notas_debito_motivo_enum NOT NULL,
    "descripcionMotivo" text,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado public.notas_debito_estado_enum DEFAULT 'borrador'::public.notas_debito_estado_enum NOT NULL,
    "vendedorId" integer,
    "nombreVendedor" character varying(150),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL
);


--
-- Name: notas_debito_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notas_debito_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notas_debito_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notas_debito_id_seq OWNED BY public.notas_debito.id;


--
-- Name: notificaciones_enviadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones_enviadas (
    id integer NOT NULL,
    tipo public.notificaciones_enviadas_tipo_enum NOT NULL,
    canal public.notificaciones_enviadas_canal_enum DEFAULT 'email'::public.notificaciones_enviadas_canal_enum NOT NULL,
    destinatario character varying(200) NOT NULL,
    asunto character varying(300) NOT NULL,
    mensaje text NOT NULL,
    referencia character varying(100),
    exitoso boolean DEFAULT false NOT NULL,
    error text,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notificaciones_enviadas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_enviadas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_enviadas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_enviadas_id_seq OWNED BY public.notificaciones_enviadas.id;


--
-- Name: objetivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objetivos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    titulo character varying(300) NOT NULL,
    descripcion text,
    nivel public.objetivos_nivel_enum DEFAULT 'empresa'::public.objetivos_nivel_enum NOT NULL,
    estado public.objetivos_estado_enum DEFAULT 'activo'::public.objetivos_estado_enum NOT NULL,
    periodo public.objetivos_periodo_enum DEFAULT 'anual'::public.objetivos_periodo_enum NOT NULL,
    anio integer NOT NULL,
    "progresoGlobal" integer DEFAULT 0 NOT NULL,
    propietario character varying(100),
    "propietarioId" integer,
    "parentId" integer
);


--
-- Name: objetivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.objetivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: objetivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.objetivos_id_seq OWNED BY public.objetivos.id;


--
-- Name: op_citas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_citas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(30) NOT NULL,
    "pacienteId" integer NOT NULL,
    "medicoId" integer,
    "fechaHora" timestamp without time zone NOT NULL,
    "duracionMinutos" integer DEFAULT 30 NOT NULL,
    tipo character varying(50) DEFAULT 'consulta'::character varying NOT NULL,
    estado character varying(30) DEFAULT 'programada'::character varying NOT NULL,
    "motivoConsulta" text,
    notas text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_citas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_citas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_citas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_citas_id_seq OWNED BY public.op_citas.id;


--
-- Name: op_consultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_consultas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(30) NOT NULL,
    "pacienteId" integer NOT NULL,
    "medicoId" integer,
    "citaId" integer,
    fecha date NOT NULL,
    "motivoConsulta" text,
    "agudezaVisualOD" character varying(20),
    "agudezaVisualOI" character varying(20),
    "presionOcularOD" numeric(5,2),
    "presionOcularOI" numeric(5,2),
    hallazgos text,
    diagnostico text,
    tratamiento text,
    "proximaCita" date,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_consultas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_consultas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_consultas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_consultas_id_seq OWNED BY public.op_consultas.id;


--
-- Name: op_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_inventario (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    tipo character varying(20) NOT NULL,
    codigo character varying(50),
    marca character varying(100),
    modelo character varying(100),
    color character varying(50),
    material character varying(50),
    genero character varying(50),
    precio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    costo numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "stockActual" integer DEFAULT 0 NOT NULL,
    "stockMinimo" integer DEFAULT 5 NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_inventario_id_seq OWNED BY public.op_inventario.id;


--
-- Name: op_medicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_medicos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    especialidad character varying(100) DEFAULT 'Optometría'::character varying NOT NULL,
    exequatur character varying(50),
    telefono character varying(20),
    email character varying(150),
    direccion character varying(200),
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_medicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_medicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_medicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_medicos_id_seq OWNED BY public.op_medicos.id;


--
-- Name: op_ordenes_trabajo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_ordenes_trabajo (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(30) NOT NULL,
    "pacienteId" integer NOT NULL,
    "recetaId" integer,
    fecha date NOT NULL,
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "tipoLente" character varying(100),
    "materialLente" character varying(100),
    "tratamientoLente" character varying(200),
    "colorMontura" character varying(50),
    "marcaMontura" character varying(100),
    "modeloMontura" character varying(100),
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    abono numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "facturaId" integer,
    notas text,
    "fechaEntrega" date,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_ordenes_trabajo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_ordenes_trabajo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_ordenes_trabajo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_ordenes_trabajo_id_seq OWNED BY public.op_ordenes_trabajo.id;


--
-- Name: op_pacientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_pacientes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    cedula character varying(20),
    "fechaNacimiento" date,
    genero character varying(10),
    telefono character varying(20),
    email character varying(150),
    direccion text,
    ocupacion character varying(100),
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_pacientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_pacientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_pacientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_pacientes_id_seq OWNED BY public.op_pacientes.id;


--
-- Name: op_recetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_recetas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(30) NOT NULL,
    "pacienteId" integer NOT NULL,
    "medicoId" integer,
    "consultaId" integer,
    fecha date NOT NULL,
    tipo character varying(30) DEFAULT 'lentes'::character varying NOT NULL,
    "esferaOD" numeric(5,2),
    "cilindroOD" numeric(5,2),
    "ejeOD" numeric(5,1),
    "adicionOD" numeric(5,2),
    "esferaOI" numeric(5,2),
    "cilindroOI" numeric(5,2),
    "ejeOI" numeric(5,1),
    "adicionOI" numeric(5,2),
    "dipLejos" numeric(5,1),
    "dipCerca" numeric(5,1),
    "marcaContacto" character varying(100),
    "tipoContacto" character varying(100),
    instrucciones text,
    "vigenciaAnos" integer DEFAULT 1 NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_recetas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_recetas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_recetas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_recetas_id_seq OWNED BY public.op_recetas.id;


--
-- Name: op_reclamaciones_ars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.op_reclamaciones_ars (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(30) NOT NULL,
    "pacienteId" integer NOT NULL,
    "arsNombre" character varying(100) NOT NULL,
    "arsNumeroAfiliado" character varying(50),
    "arsNumeroAutorizacion" character varying(50),
    "consultaId" integer,
    "recetaId" integer,
    "ordenTrabajoId" integer,
    fecha date NOT NULL,
    estado character varying(30) DEFAULT 'borrador'::character varying NOT NULL,
    "montoReclamado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoCubierto" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "montoPaciente" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "motivoRechazo" text,
    observaciones text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: op_reclamaciones_ars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.op_reclamaciones_ars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: op_reclamaciones_ars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.op_reclamaciones_ars_id_seq OWNED BY public.op_reclamaciones_ars.id;


--
-- Name: orden_servicio_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_servicio_detalles (
    id integer NOT NULL,
    "ordenId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(200) NOT NULL,
    cantidad numeric(10,2) NOT NULL,
    "precioUnitario" numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    tipo public.orden_servicio_detalles_tipo_enum DEFAULT 'pieza'::public.orden_servicio_detalles_tipo_enum NOT NULL
);


--
-- Name: orden_servicio_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_servicio_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_servicio_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_servicio_detalles_id_seq OWNED BY public.orden_servicio_detalles.id;


--
-- Name: ordenes_mantenimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_mantenimiento (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "activoId" integer NOT NULL,
    tipo public.ordenes_mantenimiento_tipo_enum NOT NULL,
    prioridad public.ordenes_mantenimiento_prioridad_enum DEFAULT 'media'::public.ordenes_mantenimiento_prioridad_enum NOT NULL,
    estado public.ordenes_mantenimiento_estado_enum DEFAULT 'programado'::public.ordenes_mantenimiento_estado_enum NOT NULL,
    descripcion text NOT NULL,
    "fechaProgramada" date NOT NULL,
    "fechaRealizada" date,
    "costoEstimado" numeric(12,2),
    "costoReal" numeric(12,2),
    tecnico character varying(150),
    observaciones text,
    "repuestosUsados" jsonb,
    "usuarioId" integer
);


--
-- Name: ordenes_mantenimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_mantenimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_mantenimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_mantenimiento_id_seq OWNED BY public.ordenes_mantenimiento.id;


--
-- Name: ordenes_produccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_produccion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "listaId" integer NOT NULL,
    "cantidadPlanificada" numeric(12,4) NOT NULL,
    "cantidadProducida" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    estado public.ordenes_produccion_estado_enum DEFAULT 'borrador'::public.ordenes_produccion_estado_enum NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFinPlanificada" date,
    "fechaFinReal" date,
    notas text,
    "responsableId" integer,
    "costoReal" numeric(14,2),
    "asientoInicioId" integer,
    "asientoFinId" integer
);


--
-- Name: ordenes_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_produccion_id_seq OWNED BY public.ordenes_produccion.id;


--
-- Name: ordenes_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_servicio (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "clienteId" integer NOT NULL,
    "descripcionEquipo" character varying(300) NOT NULL,
    "descripcionProblema" text NOT NULL,
    diagnostico text,
    estado public.ordenes_servicio_estado_enum DEFAULT 'recibido'::public.ordenes_servicio_estado_enum NOT NULL,
    prioridad public.ordenes_servicio_prioridad_enum DEFAULT 'normal'::public.ordenes_servicio_prioridad_enum NOT NULL,
    "slaHoras" integer,
    "fechaLimiteSla" timestamp with time zone,
    "esGarantia" boolean DEFAULT false NOT NULL,
    "fechaVencimientoGarantia" date,
    "numeroSerieEquipo" character varying(100),
    "origenPortal" boolean DEFAULT false NOT NULL,
    "tecnicoId" integer,
    "fechaPromesa" date,
    presupuesto numeric(10,2),
    "totalPiezas" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "totalManoObra" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "facturaId" integer,
    notas text,
    "userId" integer NOT NULL
);


--
-- Name: ordenes_servicio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_servicio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_servicio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_servicio_id_seq OWNED BY public.ordenes_servicio.id;


--
-- Name: pagos_cobrados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_cobrados (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "cuentaPorCobrarId" integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha date NOT NULL,
    "metodoPago" public.pagos_cobrados_metodopago_enum NOT NULL,
    referencia character varying(100),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "userId" integer NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "reciboCobroId" integer
);


--
-- Name: pagos_cobrados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_cobrados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_cobrados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_cobrados_id_seq OWNED BY public.pagos_cobrados.id;


--
-- Name: pagos_realizados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_realizados (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "cuentaPorPagarId" integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha date NOT NULL,
    "metodoPago" public.pagos_realizados_metodopago_enum NOT NULL,
    referencia character varying(100),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL,
    "tipoCambio" numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    "userId" integer NOT NULL
);


--
-- Name: pagos_realizados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_realizados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_realizados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_realizados_id_seq OWNED BY public.pagos_realizados.id;


--
-- Name: pagos_suscripcion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_suscripcion (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    tipo character varying(20) NOT NULL,
    concepto text NOT NULL,
    monto numeric(10,2) NOT NULL,
    "montoPagado" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    "comprobanteUrl" text,
    "comprobanteKey" text,
    referencia character varying(255),
    notas text,
    "registradoPor" integer,
    "confirmadoPor" integer,
    "motivoRechazo" text,
    "periodoInicio" date,
    "periodoFin" date,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL,
    "confirmadoEn" timestamp with time zone
);


--
-- Name: pagos_suscripcion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_suscripcion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_suscripcion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_suscripcion_id_seq OWNED BY public.pagos_suscripcion.id;


--
-- Name: parametros_fiscales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_fiscales (
    id integer NOT NULL,
    clave character varying(80) NOT NULL,
    valor jsonb,
    "vigenciaDesde" date NOT NULL,
    "vigenciaHasta" date,
    "baseLegal" text NOT NULL,
    fuente text NOT NULL,
    estado character varying(30) DEFAULT 'PENDIENTE_VALIDACION'::character varying NOT NULL,
    "validadoPor" integer,
    "validadoEn" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: parametros_fiscales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parametros_fiscales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parametros_fiscales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parametros_fiscales_id_seq OWNED BY public.parametros_fiscales.id;


--
-- Name: periodos_contables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periodos_contables (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    anio integer NOT NULL,
    mes integer NOT NULL,
    nombre character varying(50) NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    estado public.periodos_contables_estado_enum DEFAULT 'abierto'::public.periodos_contables_estado_enum NOT NULL,
    "totalDebitos" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "totalCreditos" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "cantidadAsientos" integer DEFAULT 0 NOT NULL,
    "cerradoPorId" integer,
    "fechaCierre" timestamp without time zone,
    "notasCierre" text
);


--
-- Name: periodos_contables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.periodos_contables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: periodos_contables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.periodos_contables_id_seq OWNED BY public.periodos_contables.id;


--
-- Name: plan_configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_configuracion (
    clave character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    precio numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    descripcion character varying(200),
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_demanda_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_demanda_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "planId" integer NOT NULL,
    "productoId" integer NOT NULL,
    "ventaPromedio3m" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "ventaPromedio6m" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "ventaPromedio12m" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "ventaMaximaMensual" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "ventaMinimaMensual" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    tendencia public.plan_demanda_lineas_tendencia_enum DEFAULT 'sin_datos'::public.plan_demanda_lineas_tendencia_enum NOT NULL,
    "coeficienteVariacion" numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    "proyeccionMes1" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "proyeccionMes2" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "proyeccionMes3" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "proyeccionTotal" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockActual" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMinimo" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "cantidadSugeridaCompra" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "requiereCompra" boolean DEFAULT false NOT NULL,
    "historicoMensual" text
);


--
-- Name: plan_demanda_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_demanda_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_demanda_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_demanda_lineas_id_seq OWNED BY public.plan_demanda_lineas.id;


--
-- Name: planes_demanda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes_demanda (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "periodoDesde" character varying(7) NOT NULL,
    "periodoHasta" character varying(7) NOT NULL,
    "horizonteMeses" integer DEFAULT 3 NOT NULL,
    estado public.planes_demanda_estado_enum DEFAULT 'borrador'::public.planes_demanda_estado_enum NOT NULL,
    "totalProductos" integer DEFAULT 0 NOT NULL,
    "productosConAlerta" integer DEFAULT 0 NOT NULL,
    notas text
);


--
-- Name: planes_demanda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planes_demanda_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planes_demanda_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planes_demanda_id_seq OWNED BY public.planes_demanda.id;


--
-- Name: planes_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes_pago (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "clienteId" integer NOT NULL,
    "clienteNombre" character varying(200),
    "facturaId" integer,
    "facturaFolio" character varying(20),
    "montoTotal" numeric(14,2) NOT NULL,
    "montoInicial" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "montoFinanciar" numeric(14,2) NOT NULL,
    "numeroCuotas" integer NOT NULL,
    "tasaInteresMensual" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "montoCuota" numeric(14,2) NOT NULL,
    "fechaInicio" date NOT NULL,
    estado public.planes_pago_estado_enum DEFAULT 'vigente'::public.planes_pago_estado_enum NOT NULL,
    "usuarioId" integer NOT NULL,
    notas text
);


--
-- Name: planes_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planes_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planes_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planes_pago_id_seq OWNED BY public.planes_pago.id;


--
-- Name: pr_cobranzas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_cobranzas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "prestamoId" integer NOT NULL,
    "deudorId" integer NOT NULL,
    "cobradorId" integer,
    "cobradorNombre" character varying(200),
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    tipo character varying(30),
    resultado character varying(50),
    "montoPrometido" numeric(12,2),
    "fechaPromesaPago" date,
    descripcion text NOT NULL,
    "diasMoraAlMomento" integer,
    "saldoAlMomento" numeric(14,2),
    "proximaGestion" date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_cobranzas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_cobranzas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_cobranzas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_cobranzas_id_seq OWNED BY public.pr_cobranzas.id;


--
-- Name: pr_cuotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_cuotas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "prestamoId" integer NOT NULL,
    "numeroCuota" integer NOT NULL,
    "fechaVencimiento" date NOT NULL,
    capital numeric(12,2) NOT NULL,
    interes numeric(12,2) NOT NULL,
    "cuotaTotal" numeric(12,2) NOT NULL,
    "saldoRestante" numeric(14,2),
    "capitalPagado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "interesPagado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "moraGenerada" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "moraPagada" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalPagado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "fechaPago" date,
    "diasMora" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_cuotas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_cuotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_cuotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_cuotas_id_seq OWNED BY public.pr_cuotas.id;


--
-- Name: pr_deudores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_deudores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    nombre character varying(200) NOT NULL,
    apellidos character varying(200),
    cedula character varying(20),
    rnc character varying(20),
    "fechaNacimiento" date,
    sexo character varying(10),
    "estadoCivil" character varying(20),
    telefono character varying(20),
    "telefonoTrabajo" character varying(20),
    email character varying(100),
    direccion text,
    "direccionTrabajo" text,
    ocupacion character varying(100),
    "empresaLabora" character varying(200),
    "ingresoMensual" numeric(12,2),
    "tiempoEmpleoMeses" integer,
    "referenciaNombre1" character varying(200),
    "referenciaTelefono1" character varying(20),
    "referenciaNombre2" character varying(200),
    "referenciaTelefono2" character varying(20),
    "scoreCredito" integer,
    "nivelRiesgo" character varying(20) DEFAULT 'medio'::character varying NOT NULL,
    "totalPrestado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "totalPagado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "prestamosActivos" integer DEFAULT 0 NOT NULL,
    "diasMoraHistorico" integer DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "enListaNegra" boolean DEFAULT false NOT NULL,
    "motivoListaNegra" text,
    "clienteId" integer,
    foto text,
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_deudores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_deudores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_deudores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_deudores_id_seq OWNED BY public.pr_deudores.id;


--
-- Name: pr_garantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_garantes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "prestamoId" integer,
    "solicitudId" integer,
    nombre character varying(200) NOT NULL,
    cedula character varying(20),
    telefono character varying(20),
    direccion text,
    ocupacion character varying(100),
    "ingresoMensual" numeric(12,2),
    "relacionDeudor" character varying(100),
    "documentosUrls" jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_garantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_garantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_garantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_garantes_id_seq OWNED BY public.pr_garantes.id;


--
-- Name: pr_garantias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_garantias (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "prestamoId" integer,
    "solicitudId" integer,
    "deudorId" integer NOT NULL,
    tipo character varying(50) NOT NULL,
    descripcion text NOT NULL,
    "valorTasado" numeric(12,2),
    "valorRealizacion" numeric(12,2),
    detalles jsonb,
    "documentosUrls" jsonb,
    "fotosUrls" jsonb,
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    ubicacion character varying(200),
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_garantias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_garantias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_garantias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_garantias_id_seq OWNED BY public.pr_garantias.id;


--
-- Name: pr_pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_pagos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "prestamoId" integer NOT NULL,
    "deudorId" integer NOT NULL,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    "montoPagado" numeric(12,2) NOT NULL,
    "aplicadoMora" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "aplicadoInteres" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "aplicadoCapital" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "aplicadoCargos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "metodoPago" character varying(50),
    referencia character varying(100),
    "cobradorId" integer,
    "cobradorNombre" character varying(200),
    "cuotasAfectadas" jsonb,
    "facturaId" integer,
    "reciboId" integer,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_pagos_id_seq OWNED BY public.pr_pagos.id;


--
-- Name: pr_prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_prestamos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20) NOT NULL,
    "solicitudId" integer,
    "deudorId" integer NOT NULL,
    "productoId" integer,
    "montoPrincipal" numeric(12,2) NOT NULL,
    "tasaInteresMensual" numeric(6,3) NOT NULL,
    "plazoMeses" integer NOT NULL,
    "frecuenciaPago" character varying(20) NOT NULL,
    "metodoAmortizacion" character varying(20) DEFAULT 'frances'::character varying NOT NULL,
    "cuotaPeriodica" numeric(12,2),
    "porcentajeMora" numeric(6,3) DEFAULT '0'::numeric NOT NULL,
    "diasGracia" integer DEFAULT 0 NOT NULL,
    "cargoCierre" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "fechaDesembolso" date NOT NULL,
    "fechaPrimerPago" date NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "totalInteres" numeric(14,2),
    "totalAPagar" numeric(14,2),
    "saldoCapital" numeric(14,2),
    "saldoInteres" numeric(14,2),
    "saldoMora" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "saldoTotal" numeric(14,2),
    "totalPagado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "diasMoraActual" integer DEFAULT 0 NOT NULL,
    "cuotasVencidas" integer DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'al_dia'::character varying NOT NULL,
    "oficialId" integer,
    "oficialNombre" character varying(200),
    "refinanciaDe" integer,
    "facturaDesembolsoId" integer,
    "vehiculoId" integer,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_prestamos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_prestamos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_prestamos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_prestamos_id_seq OWNED BY public.pr_prestamos.id;


--
-- Name: pr_productos_prestamo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_productos_prestamo (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    "montoMinimo" numeric(12,2),
    "montoMaximo" numeric(12,2),
    "tasaInteresMensual" numeric(6,3) NOT NULL,
    "tipoTasa" character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    "plazoMinimoMeses" integer,
    "plazoMaximoMeses" integer,
    "frecuenciaPago" character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    "metodoAmortizacion" character varying(20) DEFAULT 'frances'::character varying NOT NULL,
    "porcentajeMora" numeric(6,3) DEFAULT '0'::numeric NOT NULL,
    "cargoCierre" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "porcentajeCargoCierre" numeric(6,3) DEFAULT '0'::numeric NOT NULL,
    "diasGracia" integer DEFAULT 0 NOT NULL,
    "tipoCredito" character varying(20) DEFAULT 'personal'::character varying NOT NULL,
    "requiereGarantia" boolean DEFAULT false NOT NULL,
    "requiereGarante" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_productos_prestamo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_productos_prestamo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_productos_prestamo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_productos_prestamo_id_seq OWNED BY public.pr_productos_prestamo.id;


--
-- Name: pr_refinanciamientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_refinanciamientos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "prestamoOriginalId" integer NOT NULL,
    "prestamoNuevoId" integer,
    "deudorId" integer NOT NULL,
    "saldoCapitalOriginal" numeric(14,2),
    "saldoInteresOriginal" numeric(14,2),
    "saldoMoraOriginal" numeric(14,2),
    "saldoTotalOriginal" numeric(14,2),
    "montoNuevo" numeric(12,2),
    "nuevaTasa" numeric(6,3),
    "nuevoPlazo" integer,
    "moraCondonada" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "interesCondonado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    fecha date,
    "autorizadoPor" character varying(200),
    motivo text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_refinanciamientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_refinanciamientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_refinanciamientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_refinanciamientos_id_seq OWNED BY public.pr_refinanciamientos.id;


--
-- Name: pr_solicitudes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_solicitudes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "deudorId" integer NOT NULL,
    "productoId" integer,
    "montoSolicitado" numeric(12,2) NOT NULL,
    "plazoMeses" integer NOT NULL,
    "frecuenciaPago" character varying(20),
    proposito text,
    "oficialId" integer,
    "oficialNombre" character varying(200),
    "fechaSolicitud" date,
    "ingresoMensual" numeric(12,2),
    "gastosMensuales" numeric(12,2),
    "capacidadPago" numeric(12,2),
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "montoAprobado" numeric(12,2),
    "tasaAprobada" numeric(6,3),
    "fechaDecision" date,
    "decididoPor" character varying(200),
    "motivoRechazo" text,
    observaciones text,
    "vehiculoId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_solicitudes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_solicitudes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_solicitudes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_solicitudes_id_seq OWNED BY public.pr_solicitudes.id;


--
-- Name: pr_vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pr_vehiculos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "sucursalId" integer,
    placa character varying(20),
    chasis character varying(50),
    motor character varying(50),
    marca character varying(50),
    modelo character varying(50),
    anio integer,
    color character varying(30),
    "tipoVehiculo" character varying(30),
    "valorMercado" numeric(15,2),
    "valorFactura" numeric(15,2),
    aseguradora character varying(100),
    "polizaSeguro" character varying(50),
    "fechaVencePoliza" date,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pr_vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pr_vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pr_vehiculos_id_seq OWNED BY public.pr_vehiculos.id;


--
-- Name: pre_factura_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_factura_detalles (
    id integer NOT NULL,
    "preFacturaId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "precioUnitario" numeric(12,2) NOT NULL,
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    iva numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoMonto" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "precioOriginal" numeric(12,4)
);


--
-- Name: pre_factura_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pre_factura_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pre_factura_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pre_factura_detalles_id_seq OWNED BY public.pre_factura_detalles.id;


--
-- Name: pre_facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_facturas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    folio character varying(20) NOT NULL,
    fecha date NOT NULL,
    "fechaVencimiento" date,
    estado public.pre_facturas_estado_enum DEFAULT 'borrador'::public.pre_facturas_estado_enum NOT NULL,
    "clienteId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    iva numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "tipoNcf" character varying(10) DEFAULT 'E32'::character varying,
    "facturaId" integer,
    "conduceId" integer,
    "sucursalId" integer,
    "vendedorId" integer,
    "nombreVendedor" character varying(150),
    notas text,
    "motivoRechazo" text,
    "descuentoGeneralTipo" character varying(10),
    "descuentoGeneralValor" numeric(12,4),
    "descuentoGeneralFinal" numeric(12,2)
);


--
-- Name: pre_facturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pre_facturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pre_facturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pre_facturas_id_seq OWNED BY public.pre_facturas.id;


--
-- Name: precios_especiales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precios_especiales (
    id integer NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    "clienteId" integer,
    tier public.precios_especiales_tier_enum,
    nombre character varying(200),
    "precioFijo" numeric(12,2),
    "descuentoPorcentaje" numeric(5,2),
    "vigenciaDesde" date,
    "vigenciaHasta" date,
    "isActive" boolean DEFAULT true NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: precios_especiales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precios_especiales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precios_especiales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precios_especiales_id_seq OWNED BY public.precios_especiales.id;


--
-- Name: preferencias_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_usuario (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer NOT NULL,
    "empresaId" integer NOT NULL,
    clave character varying(80) NOT NULL,
    valor jsonb NOT NULL
);


--
-- Name: preferencias_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.preferencias_usuario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: preferencias_usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.preferencias_usuario_id_seq OWNED BY public.preferencias_usuario.id;


--
-- Name: presupuesto_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presupuesto_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "presupuestoId" integer NOT NULL,
    mes integer NOT NULL,
    categoria character varying(100) DEFAULT 'General'::character varying NOT NULL,
    "cuentaCodigo" character varying(20),
    "montoPresupuestado" numeric(14,2) NOT NULL,
    notas text
);


--
-- Name: presupuesto_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.presupuesto_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: presupuesto_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.presupuesto_lineas_id_seq OWNED BY public.presupuesto_lineas.id;


--
-- Name: presupuesto_proyecto_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presupuesto_proyecto_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "proyectoId" integer NOT NULL,
    categoria public.presupuesto_proyecto_lineas_categoria_enum DEFAULT 'otro'::public.presupuesto_proyecto_lineas_categoria_enum NOT NULL,
    descripcion character varying(200) NOT NULL,
    monto numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "montoReal" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notas text
);


--
-- Name: presupuesto_proyecto_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.presupuesto_proyecto_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: presupuesto_proyecto_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.presupuesto_proyecto_lineas_id_seq OWNED BY public.presupuesto_proyecto_lineas.id;


--
-- Name: presupuestos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presupuestos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    anio integer NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo public.presupuestos_tipo_enum NOT NULL,
    estado public.presupuestos_estado_enum DEFAULT 'borrador'::public.presupuestos_estado_enum NOT NULL,
    "totalPresupuestado" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    descripcion text,
    "userId" integer NOT NULL
);


--
-- Name: presupuestos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.presupuestos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: presupuestos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.presupuestos_id_seq OWNED BY public.presupuestos.id;


--
-- Name: pro_forma_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pro_forma_items (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "proFormaId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(255) NOT NULL,
    cantidad numeric(10,2) DEFAULT '1'::numeric NOT NULL,
    precio numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    "porcentajeItbis" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    itbis numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "descuentoMonto" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "precioOriginal" numeric(12,4)
);


--
-- Name: pro_forma_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pro_forma_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pro_forma_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pro_forma_items_id_seq OWNED BY public.pro_forma_items.id;


--
-- Name: pro_formas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pro_formas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "clienteId" integer,
    "sucursalId" integer,
    "vendedorId" integer,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    notas text,
    "validezDias" integer DEFAULT 30 NOT NULL,
    estado public.pro_formas_estado_enum DEFAULT 'ACTIVA'::public.pro_formas_estado_enum NOT NULL,
    "fechaEmision" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaVencimiento" timestamp without time zone,
    "descuentoGeneralTipo" character varying(10),
    "descuentoGeneralValor" numeric(12,4),
    "descuentoGeneralFinal" numeric(12,2)
);


--
-- Name: pro_formas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pro_formas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pro_formas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pro_formas_id_seq OWNED BY public.pro_formas.id;


--
-- Name: producto_proveedor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_proveedor (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    "proveedorId" integer NOT NULL,
    "esPreferente" boolean DEFAULT false NOT NULL,
    "codigoProveedor" character varying(100),
    "precioPactado" numeric(14,4),
    "monedaPactada" character(3) DEFAULT 'DOP'::bpchar NOT NULL,
    "precioPactadoAt" date,
    "diasEntrega" integer,
    "pedidoMinimo" numeric(12,4),
    "multiploEmpaque" numeric(12,4),
    origen character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    notas text
);


--
-- Name: producto_proveedor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producto_proveedor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producto_proveedor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producto_proveedor_id_seq OWNED BY public.producto_proveedor.id;


--
-- Name: producto_variantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_variantes (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    sku character varying(50) NOT NULL,
    nombre character varying(200) NOT NULL,
    atributos jsonb NOT NULL,
    stock numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMinimo" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "precioOverride" numeric(12,2),
    "costoPromedio" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "imagenUrl" text
);


--
-- Name: producto_variantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producto_variantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producto_variantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producto_variantes_id_seq OWNED BY public.producto_variantes.id;


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    tipo character varying(10) DEFAULT 'producto'::character varying NOT NULL,
    codigo character varying(30),
    "codigoBarras" character varying(100),
    nombre character varying(200) NOT NULL,
    descripcion text,
    "unidadMedida" character varying(20) DEFAULT 'PZA'::character varying NOT NULL,
    precio numeric(14,4) NOT NULL,
    precio2 numeric(14,4),
    precio3 numeric(14,4),
    "porcentajeIva" numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    stock numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMinimo" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMaximo" numeric(12,4),
    categoria character varying(100),
    "claveProductoSat" character varying(10),
    "claveUnidadSat" character varying(10),
    "imagenUrl" text,
    costo numeric(12,2),
    "costoPromedio" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "costoManualMotivo" text,
    "costoManualPorId" integer,
    "costoManualPorNombre" character varying(200),
    "costoManualEn" timestamp with time zone,
    "costoManualAnterior" numeric(14,4),
    marca character varying(100),
    modelo character varying(100),
    referencia character varying(100),
    "esCreacionRapida" boolean DEFAULT false NOT NULL,
    plu integer,
    "esPesable" boolean DEFAULT false NOT NULL
);


--
-- Name: productos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.productos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: productos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.productos_id_seq OWNED BY public.productos.id;


--
-- Name: programa_fidelidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programa_fidelidad (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) DEFAULT 'Programa de Puntos'::character varying NOT NULL,
    "puntosPorDOP" numeric(8,4) DEFAULT '1'::numeric NOT NULL,
    "minimoCanjePoints" integer DEFAULT 100 NOT NULL,
    "valorPorPunto" numeric(8,4) DEFAULT '1'::numeric NOT NULL,
    "diasVencimiento" integer DEFAULT 365 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    descripcion text
);


--
-- Name: programa_fidelidad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programa_fidelidad_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programa_fidelidad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programa_fidelidad_id_seq OWNED BY public.programa_fidelidad.id;


--
-- Name: programas_mantenimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programas_mantenimiento (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "activoId" integer NOT NULL,
    tipo public.programas_mantenimiento_tipo_enum DEFAULT 'preventivo'::public.programas_mantenimiento_tipo_enum NOT NULL,
    descripcion text NOT NULL,
    "frecuenciaDias" integer DEFAULT 30 NOT NULL,
    "ultimoMantenimiento" date,
    "proximoMantenimiento" date,
    "costoEstimado" numeric(10,2),
    habilitado boolean DEFAULT true NOT NULL
);


--
-- Name: programas_mantenimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programas_mantenimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programas_mantenimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programas_mantenimiento_id_seq OWNED BY public.programas_mantenimiento.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(200) NOT NULL,
    rnc character varying(11),
    telefono character varying(20),
    email character varying(100),
    direccion character varying(300),
    contacto character varying(100),
    categoria character varying(100),
    "diasPago" integer,
    banco character varying(100),
    "cuentaBancaria" character varying(30),
    notas text,
    "esInformal" boolean DEFAULT false,
    "xlinkEmpresaXlinkId" uuid,
    "sincronizarArticulosXlink" boolean DEFAULT false NOT NULL
);


--
-- Name: proveedores_ecf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores_ecf (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    nombre character varying(100) NOT NULL,
    "apiUrl" character varying(300) NOT NULL,
    "apiKey" character varying(500) NOT NULL,
    ambiente public.proveedores_ecf_ambiente_enum DEFAULT 'pruebas'::public.proveedores_ecf_ambiente_enum NOT NULL,
    "certificadoDigital" text,
    rnc character varying(11) NOT NULL,
    "razonSocial" character varying(200) NOT NULL,
    configuracion json
);


--
-- Name: proveedores_ecf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_ecf_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_ecf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_ecf_id_seq OWNED BY public.proveedores_ecf.id;


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: proyecto_tareas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyecto_tareas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "proyectoId" integer NOT NULL,
    titulo character varying NOT NULL,
    descripcion text,
    estado public.proyecto_tareas_estado_enum DEFAULT 'pendiente'::public.proyecto_tareas_estado_enum NOT NULL,
    prioridad public.proyecto_tareas_prioridad_enum DEFAULT 'media'::public.proyecto_tareas_prioridad_enum NOT NULL,
    "fechaInicio" date,
    "fechaVencimiento" date,
    "horasEstimadas" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "horasReales" numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    "esHito" boolean DEFAULT false NOT NULL,
    "asignadoId" integer,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: proyecto_tareas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proyecto_tareas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proyecto_tareas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proyecto_tareas_id_seq OWNED BY public.proyecto_tareas.id;


--
-- Name: proyecto_tiempos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyecto_tiempos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "proyectoId" integer NOT NULL,
    "tareaId" integer,
    "usuarioId" integer NOT NULL,
    fecha date NOT NULL,
    horas numeric(6,2) NOT NULL,
    descripcion text,
    facturado boolean DEFAULT false NOT NULL
);


--
-- Name: proyecto_tiempos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proyecto_tiempos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proyecto_tiempos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proyecto_tiempos_id_seq OWNED BY public.proyecto_tiempos.id;


--
-- Name: proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyectos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying NOT NULL,
    descripcion text,
    "clienteId" integer,
    "fechaInicio" date NOT NULL,
    "fechaFin" date,
    estado public.proyectos_estado_enum DEFAULT 'planificacion'::public.proyectos_estado_enum NOT NULL,
    "tipoFacturacion" public.proyectos_tipofacturacion_enum DEFAULT 'precio_fijo'::public.proyectos_tipofacturacion_enum NOT NULL,
    presupuesto numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "horasEstimadas" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "tarifaHora" numeric(8,2),
    "responsableId" integer,
    "porcentajeAvance" integer DEFAULT 0 NOT NULL,
    notas text
);


--
-- Name: proyectos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proyectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proyectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proyectos_id_seq OWNED BY public.proyectos.id;


--
-- Name: recibos_cobro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recibos_cobro (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    fecha date NOT NULL,
    "clienteId" integer,
    "clienteNombre" character varying(200),
    monto numeric(14,2) NOT NULL,
    "metodoPago" public.recibos_cobro_metodopago_enum DEFAULT 'efectivo'::public.recibos_cobro_metodopago_enum NOT NULL,
    concepto character varying(300) NOT NULL,
    "facturaId" integer,
    "facturaFolio" character varying(20),
    "cxcId" integer,
    referencia character varying(100),
    "cajaDiariaId" integer,
    "usuarioId" integer NOT NULL,
    "nombreUsuario" character varying(150),
    notas text,
    moneda character varying(3) DEFAULT 'DOP'::character varying NOT NULL
);


--
-- Name: recibos_cobro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recibos_cobro_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recibos_cobro_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recibos_cobro_id_seq OWNED BY public.recibos_cobro.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "revokedAt" timestamp with time zone,
    "motivoRevocacion" character varying(10),
    "nextTokenId" character varying(36),
    "deviceInfo" character varying(255),
    "ipAddress" character varying(45),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "lastActivityAt" timestamp with time zone
);


--
-- Name: registro_etapas_orden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registro_etapas_orden (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "ordenId" integer NOT NULL,
    "etapaId" integer NOT NULL,
    "ordenEtapa" integer DEFAULT 1 NOT NULL,
    estado public.registro_etapas_orden_estado_enum DEFAULT 'pendiente'::public.registro_etapas_orden_estado_enum NOT NULL,
    "fechaInicio" timestamp with time zone,
    "fechaFin" timestamp with time zone,
    "cantidadProcesada" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "operadorId" integer,
    observaciones text
);


--
-- Name: registro_etapas_orden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registro_etapas_orden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registro_etapas_orden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registro_etapas_orden_id_seq OWNED BY public.registro_etapas_orden.id;


--
-- Name: registros_capacitacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_capacitacion (
    id integer NOT NULL,
    "empresaId" integer,
    "sesionId" integer NOT NULL,
    "empleadoId" integer NOT NULL,
    asistio boolean DEFAULT false NOT NULL,
    calificacion numeric(5,2),
    aprobado boolean DEFAULT false NOT NULL,
    "certificadoEmitido" boolean DEFAULT false NOT NULL,
    comentarios text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: registros_capacitacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registros_capacitacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registros_capacitacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registros_capacitacion_id_seq OWNED BY public.registros_capacitacion.id;


--
-- Name: registros_flota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_flota (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "vehiculoId" integer NOT NULL,
    tipo public.registros_flota_tipo_enum NOT NULL,
    fecha date NOT NULL,
    monto numeric(12,2) NOT NULL,
    kilometraje integer,
    litros numeric(8,3),
    descripcion text,
    proveedor character varying(100),
    "usuarioId" integer
);


--
-- Name: registros_flota_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registros_flota_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registros_flota_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registros_flota_id_seq OWNED BY public.registros_flota.id;


--
-- Name: regla_distribucion_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regla_distribucion_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "reglaId" integer NOT NULL,
    "cuentaDestinoId" integer NOT NULL,
    "cuentaDestinoNombre" character varying(200),
    "centroCostoId" integer,
    "centroCostoNombre" character varying(100),
    porcentaje numeric(7,4) NOT NULL,
    descripcion character varying(200)
);


--
-- Name: regla_distribucion_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regla_distribucion_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regla_distribucion_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regla_distribucion_lineas_id_seq OWNED BY public.regla_distribucion_lineas.id;


--
-- Name: reglas_comision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_comision (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(100) NOT NULL,
    tipo public.reglas_comision_tipo_enum DEFAULT 'global'::public.reglas_comision_tipo_enum NOT NULL,
    prioridad integer DEFAULT 100 NOT NULL,
    "vendedorId" integer,
    categoria character varying(100),
    "montoDesde" numeric(14,2),
    "montoHasta" numeric(14,2),
    "diasMaximoCobro" integer,
    porcentaje numeric(5,2) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    descripcion text
);


--
-- Name: reglas_comision_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reglas_comision_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reglas_comision_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reglas_comision_id_seq OWNED BY public.reglas_comision.id;


--
-- Name: reglas_descuento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_descuento (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(150) NOT NULL,
    tipo public.reglas_descuento_tipo_enum DEFAULT 'porcentaje'::public.reglas_descuento_tipo_enum NOT NULL,
    valor numeric(10,2) NOT NULL,
    condicion public.reglas_descuento_condicion_enum DEFAULT 'siempre'::public.reglas_descuento_condicion_enum NOT NULL,
    "condicionValor" character varying(300),
    "fechaDesde" date,
    "fechaHasta" date,
    prioridad integer DEFAULT 1 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    descripcion text
);


--
-- Name: reglas_descuento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reglas_descuento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reglas_descuento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reglas_descuento_id_seq OWNED BY public.reglas_descuento.id;


--
-- Name: reglas_distribucion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_distribucion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    nombre character varying(200) NOT NULL,
    descripcion text,
    "cuentaOrigenId" integer NOT NULL,
    "cuentaOrigenNombre" character varying(200),
    periodicidad public.reglas_distribucion_periodicidad_enum DEFAULT 'manual'::public.reglas_distribucion_periodicidad_enum NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "vecesEjecutada" integer DEFAULT 0 NOT NULL,
    "ultimaEjecucion" date
);


--
-- Name: reglas_distribucion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reglas_distribucion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reglas_distribucion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reglas_distribucion_id_seq OWNED BY public.reglas_distribucion.id;


--
-- Name: reportes_dgii; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes_dgii (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    tipo character varying(3) NOT NULL,
    mes integer NOT NULL,
    anio integer NOT NULL,
    "totalLineas" integer DEFAULT 0 NOT NULL,
    "totalMonto" numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    errores integer DEFAULT 0 NOT NULL,
    advertencias integer DEFAULT 0 NOT NULL,
    "generadoPor" integer,
    "hashContenido" character varying(64),
    contenido text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reportes_dgii_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_dgii_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_dgii_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_dgii_id_seq OWNED BY public.reportes_dgii.id;


--
-- Name: reportes_generados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes_generados (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    tipo public.reportes_generados_tipo_enum NOT NULL,
    formato public.reportes_generados_formato_enum DEFAULT 'json'::public.reportes_generados_formato_enum NOT NULL,
    parametros json,
    url character varying(300),
    estado public.reportes_generados_estado_enum DEFAULT 'completado'::public.reportes_generados_estado_enum NOT NULL,
    "userId" integer NOT NULL,
    "fechaDesde" date NOT NULL,
    "fechaHasta" date NOT NULL
);


--
-- Name: reportes_generados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_generados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_generados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_generados_id_seq OWNED BY public.reportes_generados.id;


--
-- Name: respuestas_encuesta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.respuestas_encuesta (
    id integer NOT NULL,
    "empresaId" integer,
    "encuestaId" integer NOT NULL,
    "clienteId" integer,
    "nombreRespondente" character varying(200),
    puntuacion integer,
    respuestas jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentarios text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: respuestas_encuesta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.respuestas_encuesta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: respuestas_encuesta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.respuestas_encuesta_id_seq OWNED BY public.respuestas_encuesta.id;


--
-- Name: resultados_clave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultados_clave (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "objetivoId" integer NOT NULL,
    descripcion character varying(300) NOT NULL,
    tipo public.resultados_clave_tipo_enum DEFAULT 'numero'::public.resultados_clave_tipo_enum NOT NULL,
    "valorInicio" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "valorMeta" numeric(14,2) NOT NULL,
    "valorActual" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    progreso integer DEFAULT 0 NOT NULL,
    unidad character varying(50)
);


--
-- Name: resultados_clave_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resultados_clave_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resultados_clave_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resultados_clave_id_seq OWNED BY public.resultados_clave.id;


--
-- Name: retenciones_isr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retenciones_isr (
    id integer NOT NULL,
    "empresaId" integer,
    periodo character varying(7) NOT NULL,
    "nombreProveedor" character varying(200) NOT NULL,
    "rncProveedor" character varying(11),
    "tipoServicio" public.retenciones_isr_tiposervicio_enum NOT NULL,
    "descripcionServicio" character varying(300) NOT NULL,
    "montoBruto" numeric(12,2) NOT NULL,
    "porcentajeRetencion" numeric(5,2) NOT NULL,
    "montoRetenido" numeric(12,2) NOT NULL,
    "montoNeto" numeric(12,2) NOT NULL,
    "compraId" integer,
    "userId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: retenciones_isr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retenciones_isr_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retenciones_isr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retenciones_isr_id_seq OWNED BY public.retenciones_isr.id;


--
-- Name: retiros_caja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retiros_caja (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "cajaDiariaId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    "usuarioNombre" character varying(150),
    monto numeric(12,2) NOT NULL,
    descripcion character varying(300) NOT NULL,
    categoria character varying(30) DEFAULT 'otro'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "autorizadorId" integer,
    "autorizadorNombre" character varying(150),
    "autorizadoEn" timestamp with time zone,
    "motivoAnulacion" character varying(500),
    "anuladoPorId" integer,
    "anuladoPorNombre" character varying(150),
    "anuladoEn" timestamp with time zone,
    "motivoRechazo" character varying(500),
    "rechazadoPorId" integer,
    "rechazadoPorNombre" character varying(150),
    "rechazadoEn" timestamp with time zone,
    "cuentaBancariaId" integer,
    numero character varying(20),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: retiros_caja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retiros_caja_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retiros_caja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retiros_caja_id_seq OWNED BY public.retiros_caja.id;


--
-- Name: rs_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_areas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying NOT NULL,
    descripcion character varying,
    "capacidadTotal" integer,
    orden integer DEFAULT 0 NOT NULL,
    color character varying DEFAULT '#3b82f6'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_areas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_areas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_areas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_areas_id_seq OWNED BY public.rs_areas.id;


--
-- Name: rs_categorias_menu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_categorias_menu (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying NOT NULL,
    descripcion character varying,
    icono character varying,
    color character varying,
    orden integer DEFAULT 0 NOT NULL,
    "disponibleDesde" time without time zone,
    "disponibleHasta" time without time zone,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: rs_categorias_menu_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_categorias_menu_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_categorias_menu_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_categorias_menu_id_seq OWNED BY public.rs_categorias_menu.id;


--
-- Name: rs_comanda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_comanda_items (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "comandaId" integer NOT NULL,
    "menuItemId" integer NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    "precioUnitario" numeric(10,2) NOT NULL,
    descuento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2),
    modificaciones jsonb,
    "notasEspeciales" character varying,
    "estadoCocina" character varying DEFAULT 'pendiente'::character varying NOT NULL,
    "enviadoCocinaAt" timestamp without time zone,
    "listoCocinaAt" timestamp without time zone,
    "entregadoAt" timestamp without time zone,
    "numeroRonda" integer DEFAULT 1 NOT NULL,
    cancelado boolean DEFAULT false NOT NULL,
    "motivoCancelacion" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_comanda_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_comanda_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_comanda_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_comanda_items_id_seq OWNED BY public.rs_comanda_items.id;


--
-- Name: rs_comandas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_comandas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    "mesaId" integer NOT NULL,
    "meseroId" integer,
    "meseroNombre" character varying,
    "clienteId" integer,
    "numPersonas" integer DEFAULT 1 NOT NULL,
    "fechaApertura" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaCierre" timestamp without time zone,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    propina numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying DEFAULT 'abierta'::character varying NOT NULL,
    "metodoPago" character varying,
    "facturaId" integer,
    notas character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_comandas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_comandas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_comandas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_comandas_id_seq OWNED BY public.rs_comandas.id;


--
-- Name: rs_combo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_combo_items (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "comboId" integer NOT NULL,
    "menuItemId" integer NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    "esOpcional" boolean DEFAULT false NOT NULL
);


--
-- Name: rs_combo_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_combo_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_combo_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_combo_items_id_seq OWNED BY public.rs_combo_items.id;


--
-- Name: rs_combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_combos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying NOT NULL,
    descripcion character varying,
    precio numeric(10,2) NOT NULL,
    "imagenUrl" character varying,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: rs_combos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_combos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_combos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_combos_id_seq OWNED BY public.rs_combos.id;


--
-- Name: rs_kds_estaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_kds_estaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying NOT NULL,
    categorias jsonb,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: rs_kds_estaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_kds_estaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_kds_estaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_kds_estaciones_id_seq OWNED BY public.rs_kds_estaciones.id;


--
-- Name: rs_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_menu_items (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "categoriaId" integer,
    codigo character varying,
    nombre character varying NOT NULL,
    descripcion character varying,
    "imagenUrl" character varying,
    precio numeric(10,2) NOT NULL,
    "precioEspecial" numeric(10,2),
    costo numeric(10,2),
    "tiempoPreparacionMin" integer DEFAULT 15 NOT NULL,
    disponible boolean DEFAULT true NOT NULL,
    "disponibleParaDelivery" boolean DEFAULT true NOT NULL,
    "disponibleParaLlevar" boolean DEFAULT true NOT NULL,
    "controlStock" boolean DEFAULT false NOT NULL,
    "stockActual" integer,
    "productoId" integer,
    calorias integer,
    alergenos character varying,
    "esVegetariano" boolean DEFAULT false NOT NULL,
    "esVegano" boolean DEFAULT false NOT NULL,
    "esGlutenFree" boolean DEFAULT false NOT NULL,
    "permiteModificaciones" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_menu_items_id_seq OWNED BY public.rs_menu_items.id;


--
-- Name: rs_mesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_mesas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "areaId" integer,
    numero character varying NOT NULL,
    nombre character varying,
    capacidad integer DEFAULT 4 NOT NULL,
    "posicionX" integer DEFAULT 0 NOT NULL,
    "posicionY" integer DEFAULT 0 NOT NULL,
    forma character varying DEFAULT 'cuadrada'::character varying NOT NULL,
    estado character varying DEFAULT 'disponible'::character varying NOT NULL,
    "comandaActualId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_mesas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_mesas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_mesas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_mesas_id_seq OWNED BY public.rs_mesas.id;


--
-- Name: rs_modificadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_modificadores (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "menuItemId" integer,
    nombre character varying NOT NULL,
    tipo character varying DEFAULT 'opcional'::character varying NOT NULL,
    opciones jsonb,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: rs_modificadores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_modificadores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_modificadores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_modificadores_id_seq OWNED BY public.rs_modificadores.id;


--
-- Name: rs_pedidos_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_pedidos_delivery (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    "clienteNombre" character varying NOT NULL,
    "clienteTelefono" character varying NOT NULL,
    "clienteEmail" character varying,
    "clienteId" integer,
    "direccionEntrega" character varying NOT NULL,
    "referenciasDireccion" character varying,
    "fechaPedido" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaEstimadaEntrega" timestamp without time zone,
    "fechaEntregaReal" timestamp without time zone,
    "repartidorNombre" character varying,
    "repartidorTelefono" character varying,
    subtotal numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "costoEnvio" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying DEFAULT 'recibido'::character varying NOT NULL,
    "metodoPago" character varying,
    "pagadoOnline" boolean DEFAULT false NOT NULL,
    "comandaId" integer,
    "facturaId" integer,
    notas character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_pedidos_delivery_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_pedidos_delivery_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_pedidos_delivery_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_pedidos_delivery_id_seq OWNED BY public.rs_pedidos_delivery.id;


--
-- Name: rs_propinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_propinas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "comandaId" integer,
    "meseroId" integer,
    "meseroNombre" character varying,
    monto numeric(10,2) NOT NULL,
    porcentaje numeric(5,2),
    "metodoPago" character varying,
    fecha timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_propinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_propinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_propinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_propinas_id_seq OWNED BY public.rs_propinas.id;


--
-- Name: rs_reservaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_reservaciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    "clienteNombre" character varying NOT NULL,
    "clienteTelefono" character varying,
    "clienteEmail" character varying,
    "clienteId" integer,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    "numPersonas" integer NOT NULL,
    "mesaId" integer,
    "ocasionEspecial" character varying,
    "peticionesEspeciales" character varying,
    estado character varying DEFAULT 'confirmada'::character varying NOT NULL,
    "recordatorioEnviado" boolean DEFAULT false NOT NULL,
    notas character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_reservaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_reservaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_reservaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_reservaciones_id_seq OWNED BY public.rs_reservaciones.id;


--
-- Name: rs_turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rs_turnos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying,
    "usuarioId" integer,
    "usuarioNombre" character varying,
    "fechaApertura" timestamp without time zone DEFAULT now() NOT NULL,
    "fechaCierre" timestamp without time zone,
    "fondoInicial" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalVentas" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalEfectivo" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalTarjeta" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalTransferencia" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalPropinas" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "totalDescuentos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "efectivoContado" numeric(12,2),
    diferencia numeric(12,2),
    estado character varying DEFAULT 'abierto'::character varying NOT NULL,
    notas character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rs_turnos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rs_turnos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rs_turnos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rs_turnos_id_seq OWNED BY public.rs_turnos.id;


--
-- Name: rutas_produccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rutas_produccion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    "listaId" integer,
    activa boolean DEFAULT true NOT NULL
);


--
-- Name: rutas_produccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rutas_produccion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rutas_produccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rutas_produccion_id_seq OWNED BY public.rutas_produccion.id;


--
-- Name: saldo_puntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saldo_puntos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "clienteId" integer NOT NULL,
    "clienteNombre" character varying(200),
    "puntosTotales" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "puntosCanjeados" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "puntosDisponibles" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "totalTransacciones" integer DEFAULT 0 NOT NULL,
    "fechaUltimaActividad" date,
    "fechaVencimiento" date
);


--
-- Name: saldo_puntos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saldo_puntos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saldo_puntos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saldo_puntos_id_seq OWNED BY public.saldo_puntos.id;


--
-- Name: secuencias_ecf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secuencias_ecf (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "tipoECFId" integer NOT NULL,
    "secuenciaInicial" integer NOT NULL,
    "secuenciaFinal" integer NOT NULL,
    "secuenciaActual" integer NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "isAgotada" boolean DEFAULT false NOT NULL,
    "isActiva" boolean DEFAULT true NOT NULL,
    "alertaEnviada" boolean DEFAULT false NOT NULL,
    "userId" integer
);


--
-- Name: secuencias_ecf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.secuencias_ecf_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: secuencias_ecf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.secuencias_ecf_id_seq OWNED BY public.secuencias_ecf.id;


--
-- Name: segmentos_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segmentos_cliente (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(10) NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    "descuentoPct" numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    "diasCreditoDefault" integer DEFAULT 30 NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: segmentos_cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.segmentos_cliente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: segmentos_cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.segmentos_cliente_id_seq OWNED BY public.segmentos_cliente.id;


--
-- Name: seriales_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seriales_producto (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    "numeroSerie" character varying(100) NOT NULL,
    estado public.seriales_producto_estado_enum DEFAULT 'disponible'::public.seriales_producto_estado_enum NOT NULL,
    "loteId" integer,
    "facturaId" integer,
    "clienteId" integer,
    "fechaVenta" date,
    "fechaVencimientoGarantia" date,
    "costoUnitario" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    notas text
);


--
-- Name: seriales_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seriales_producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seriales_producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seriales_producto_id_seq OWNED BY public.seriales_producto.id;


--
-- Name: sesiones_capacitacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones_capacitacion (
    id integer NOT NULL,
    "empresaId" integer,
    "cursoId" integer NOT NULL,
    fecha date NOT NULL,
    hora character varying(10),
    lugar character varying(200),
    modalidad character varying(20) DEFAULT 'presencial'::character varying NOT NULL,
    "capacidadMaxima" integer,
    estado character varying(20) DEFAULT 'programada'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sesiones_capacitacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sesiones_capacitacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sesiones_capacitacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sesiones_capacitacion_id_seq OWNED BY public.sesiones_capacitacion.id;


--
-- Name: setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.setup_tokens (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: setup_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.setup_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: setup_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.setup_tokens_id_seq OWNED BY public.setup_tokens.id;


--
-- Name: solicitud_cambio_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_cambio_plan (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "planSolicitado" character varying(20) NOT NULL,
    modalidad character varying(10) DEFAULT 'mensual'::character varying NOT NULL,
    comentario text,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "motivoRechazo" text,
    "superAdminId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: solicitud_cambio_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_cambio_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_cambio_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_cambio_plan_id_seq OWNED BY public.solicitud_cambio_plan.id;


--
-- Name: solicitud_compra_lineas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_compra_lineas (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "solicitudId" integer NOT NULL,
    "productoId" integer,
    descripcion character varying(300) NOT NULL,
    unidad character varying(30) DEFAULT 'UND'::character varying NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    "presupuestoUnitario" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    especificaciones text
);


--
-- Name: solicitud_compra_lineas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_compra_lineas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_compra_lineas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_compra_lineas_id_seq OWNED BY public.solicitud_compra_lineas.id;


--
-- Name: solicitudes_activacion_ecf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_activacion_ecf (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    estado character varying(20) DEFAULT 'pendiente_pago'::character varying NOT NULL,
    "montoAcordado" numeric(12,2) NOT NULL,
    "tarifaVersion" integer DEFAULT 1 NOT NULL,
    "tieneCertificado" boolean DEFAULT false NOT NULL,
    "certificadoVenceEn" date,
    "certificadoTitular" character varying(200),
    "certificadoVencido" boolean DEFAULT false NOT NULL,
    "comprobantePagoKey" character varying(400),
    "comprobanteSubidoEn" timestamp with time zone,
    "contactoNombre" character varying(150),
    "contactoEmail" character varying(150),
    "contactoTelefono" character varying(40),
    notas text,
    "solicitadoPorUsuarioId" integer,
    "pagoConfirmadoEn" timestamp with time zone,
    "pagoConfirmadoPorUsuarioId" integer,
    "activadaEn" timestamp with time zone,
    "motivoRechazo" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: solicitudes_activacion_ecf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_activacion_ecf_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_activacion_ecf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_activacion_ecf_id_seq OWNED BY public.solicitudes_activacion_ecf.id;


--
-- Name: solicitudes_ajuste_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_ajuste_inventario (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "productoId" integer NOT NULL,
    "cantidadNueva" numeric(12,4) NOT NULL,
    motivo text NOT NULL,
    estado public.solicitudes_ajuste_inventario_estado_enum DEFAULT 'pendiente'::public.solicitudes_ajuste_inventario_estado_enum NOT NULL,
    "userId" integer NOT NULL,
    "adminId" integer,
    "motivoRechazo" text
);


--
-- Name: solicitudes_ajuste_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_ajuste_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_ajuste_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_ajuste_inventario_id_seq OWNED BY public.solicitudes_ajuste_inventario.id;


--
-- Name: solicitudes_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_compra (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "solicitanteId" integer NOT NULL,
    "fechaSolicitud" date NOT NULL,
    "fechaNecesidad" date,
    estado public.solicitudes_compra_estado_enum DEFAULT 'borrador'::public.solicitudes_compra_estado_enum NOT NULL,
    prioridad public.solicitudes_compra_prioridad_enum DEFAULT 'media'::public.solicitudes_compra_prioridad_enum NOT NULL,
    departamento character varying(200),
    justificacion text NOT NULL,
    "presupuestoEstimado" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "comentarioAprobacion" text,
    "aprobadorId" integer,
    "fechaAprobacion" date
);


--
-- Name: solicitudes_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_compra_id_seq OWNED BY public.solicitudes_compra.id;


--
-- Name: solicitudes_vacacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_vacacion (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "empleadoId" integer NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaFin" date NOT NULL,
    "diasSolicitados" integer NOT NULL,
    estado public.solicitudes_vacacion_estado_enum DEFAULT 'pendiente'::public.solicitudes_vacacion_estado_enum NOT NULL,
    motivo text,
    "observacionAprobador" text,
    "aprobadorId" integer,
    "fechaRespuesta" timestamp without time zone,
    anio integer DEFAULT 2026 NOT NULL
);


--
-- Name: solicitudes_vacacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_vacacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_vacacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_vacacion_id_seq OWNED BY public.solicitudes_vacacion.id;


--
-- Name: soporte_ticket_adjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soporte_ticket_adjuntos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "ticketId" integer NOT NULL,
    ruta text NOT NULL,
    "tipoMime" character varying(50) NOT NULL,
    "tamanioBytes" integer NOT NULL
);


--
-- Name: soporte_ticket_adjuntos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.soporte_ticket_adjuntos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: soporte_ticket_adjuntos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.soporte_ticket_adjuntos_id_seq OWNED BY public.soporte_ticket_adjuntos.id;


--
-- Name: soporte_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soporte_tickets (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "usuarioId" integer NOT NULL,
    asunto public.soporte_tickets_asunto_enum NOT NULL,
    mensaje text NOT NULL,
    estado public.soporte_tickets_estado_enum DEFAULT 'abierto'::public.soporte_tickets_estado_enum NOT NULL,
    prioridad public.soporte_tickets_prioridad_enum,
    "contextoAutomatico" jsonb NOT NULL,
    "respuestaAdmin" text,
    "respondidoPor" integer,
    "respondidoEn" timestamp with time zone
);


--
-- Name: soporte_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.soporte_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: soporte_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.soporte_tickets_id_seq OWNED BY public.soporte_tickets.id;


--
-- Name: stock_almacen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_almacen (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "almacenId" integer NOT NULL,
    "productoId" integer NOT NULL,
    stock numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMinimo" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    "stockMaximo" numeric(12,4),
    "ubicacionId" integer
);


--
-- Name: stock_almacen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_almacen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_almacen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_almacen_id_seq OWNED BY public.stock_almacen.id;


--
-- Name: sucursales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sucursales (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(10) NOT NULL,
    nombre character varying(100) NOT NULL,
    direccion character varying(400),
    ciudad character varying(100),
    telefono character varying(20),
    email character varying(100),
    "esPrincipal" boolean DEFAULT false NOT NULL,
    "responsableId" integer,
    notas text,
    "almacenPrincipalId" integer
);


--
-- Name: sucursales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sucursales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sucursales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sucursales_id_seq OWNED BY public.sucursales.id;


--
-- Name: suscripcion_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suscripcion_auditoria (
    id integer NOT NULL,
    "suscripcionId" integer NOT NULL,
    "empresaId" integer NOT NULL,
    accion character varying(50) NOT NULL,
    "valorAnterior" jsonb,
    "valorNuevo" jsonb,
    "superAdminId" integer,
    motivo text,
    "ipOrigen" character varying(45),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: suscripcion_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suscripcion_auditoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suscripcion_auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suscripcion_auditoria_id_seq OWNED BY public.suscripcion_auditoria.id;


--
-- Name: suscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suscripciones (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    plan public.suscripciones_plan_enum DEFAULT 'emprendedor'::public.suscripciones_plan_enum NOT NULL,
    estado public.suscripciones_estado_enum DEFAULT 'prueba'::public.suscripciones_estado_enum NOT NULL,
    modalidad character varying(10) DEFAULT 'mensual'::character varying NOT NULL,
    "fechaInicio" date NOT NULL,
    "fechaVencimiento" date NOT NULL,
    "fechaFinPrueba" date,
    "recordatorio5dEnviado" boolean DEFAULT false NOT NULL,
    "recordatorio1dEnviado" boolean DEFAULT false NOT NULL,
    "planElegidoEnRegistro" character varying(20),
    "ingresosMesActualDop" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "mesPeriodo" character varying(7),
    "enPeriodoGracia" boolean DEFAULT false NOT NULL,
    "fechaFinGracia" date,
    "recordatorio1dGraciaEnviado" boolean DEFAULT false NOT NULL,
    "diaCorte" smallint NOT NULL,
    "motivoSuspension" text,
    "motivoCancelacion" text,
    "canceladaEn" timestamp with time zone,
    "canceladaPor" integer,
    "abonoDisponible" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "facturasMesUsadas" integer DEFAULT 0 NOT NULL,
    "facturasMesReset" integer DEFAULT 0 NOT NULL,
    "notasAdmin" text,
    "asignadoA" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: suscripciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suscripciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suscripciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suscripciones_id_seq OWNED BY public.suscripciones.id;


--
-- Name: tasas_cambio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasas_cambio (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    moneda character varying(3) NOT NULL,
    "nombreMoneda" character varying(50),
    "tasaVenta" numeric(12,4) NOT NULL,
    "tasaCompra" numeric(12,4) NOT NULL,
    fecha date NOT NULL,
    fuente character varying(50) DEFAULT 'Manual'::character varying
);


--
-- Name: tasas_cambio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasas_cambio_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasas_cambio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasas_cambio_id_seq OWNED BY public.tasas_cambio.id;


--
-- Name: terminales_datafono; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terminales_datafono (
    id integer NOT NULL,
    "empresaId" integer,
    "numeroTerminal" character varying(30) NOT NULL,
    banco character varying(100) NOT NULL,
    "tipoTarjeta" character varying(50) DEFAULT 'all'::character varying NOT NULL,
    sucursal character varying(100),
    "comisionPct" numeric(5,2) DEFAULT 3.5 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: terminales_datafono_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.terminales_datafono_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: terminales_datafono_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.terminales_datafono_id_seq OWNED BY public.terminales_datafono.id;


--
-- Name: tickets_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets_soporte (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "clienteId" integer NOT NULL,
    "clienteNombre" character varying(100),
    "portalToken" character varying(64) NOT NULL,
    asunto character varying(200) NOT NULL,
    descripcion text NOT NULL,
    categoria public.tickets_soporte_categoria_enum DEFAULT 'otro'::public.tickets_soporte_categoria_enum NOT NULL,
    prioridad public.tickets_soporte_prioridad_enum DEFAULT 'media'::public.tickets_soporte_prioridad_enum NOT NULL,
    estado public.tickets_soporte_estado_enum DEFAULT 'abierto'::public.tickets_soporte_estado_enum NOT NULL,
    respuesta text,
    "fechaRespuesta" timestamp with time zone,
    "asignadoId" integer
);


--
-- Name: tickets_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tickets_soporte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tickets_soporte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tickets_soporte_id_seq OWNED BY public.tickets_soporte.id;


--
-- Name: tipos_ecf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_ecf (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    codigo character varying(3) NOT NULL,
    descripcion character varying(200) NOT NULL,
    prefijo character varying(3) NOT NULL,
    "requiereRNC" boolean DEFAULT false NOT NULL,
    "aplicaITBIS" boolean DEFAULT true NOT NULL
);


--
-- Name: tipos_ecf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_ecf_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_ecf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_ecf_id_seq OWNED BY public.tipos_ecf.id;


--
-- Name: tm_catalogo_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_catalogo_servicios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    categoria character varying(100),
    "precioBase" numeric(10,2),
    "horasEstimadas" numeric(5,2),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_catalogo_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_catalogo_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_catalogo_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_catalogo_servicios_id_seq OWNED BY public.tm_catalogo_servicios.id;


--
-- Name: tm_checklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_checklist (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "ordenId" integer NOT NULL,
    "motorAceite" character varying(20),
    "motorRefrigerante" character varying(20),
    "motorCorreas" character varying(20),
    "motorFiltroAire" character varying(20),
    "motorBujias" character varying(20),
    "frenosPastillas" character varying(20),
    "frenosDiscos" character varying(20),
    "frenosLiquido" character varying(20),
    "frenosMano" character varying(20),
    "suspensionAmortiguadores" character varying(20),
    "suspensionBrazos" character varying(20),
    "suspensionBujes" character varying(20),
    "llantaDelanteraIzq" character varying(20),
    "llantaDelanteraDer" character varying(20),
    "llantaTraseraIzq" character varying(20),
    "llantaTraseraDer" character varying(20),
    "llantaRepuesto" character varying(20),
    "electricoBateria" character varying(20),
    "electricoAlternador" character varying(20),
    "electricoLuces" character varying(20),
    "acFuncionamiento" character varying(20),
    "acGas" character varying(20),
    "acFiltro" character varying(20),
    limpiaparabrisas character varying(20),
    "nivelLiquidos" character varying(20),
    observaciones text,
    "inspeccionadoPor" integer,
    "fechaInspeccion" timestamp without time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_checklist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_checklist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_checklist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_checklist_id_seq OWNED BY public.tm_checklist.id;


--
-- Name: tm_citas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_citas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20),
    "vehiculoId" integer,
    "clienteId" integer,
    "tecnicoId" integer,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    "duracionMinutos" integer DEFAULT 60 NOT NULL,
    "tipoServicio" character varying(100),
    descripcion text,
    estado character varying(20) DEFAULT 'programada'::character varying NOT NULL,
    "recordatorioEnviado" boolean DEFAULT false NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_citas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_citas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_citas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_citas_id_seq OWNED BY public.tm_citas.id;


--
-- Name: tm_diagnosticos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_diagnosticos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "ordenId" integer NOT NULL,
    "tecnicoId" integer,
    fecha timestamp without time zone NOT NULL,
    sistema character varying(100),
    descripcion text NOT NULL,
    severidad character varying(20),
    recomendacion text,
    "requiereAtencionInmediata" boolean DEFAULT false NOT NULL,
    "incluidoEnPresupuesto" boolean DEFAULT true NOT NULL,
    "costoEstimado" numeric(10,2),
    "imagenUrl" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_diagnosticos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_diagnosticos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_diagnosticos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_diagnosticos_id_seq OWNED BY public.tm_diagnosticos.id;


--
-- Name: tm_historial_mantenimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_historial_mantenimiento (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "vehiculoId" integer NOT NULL,
    "ordenId" integer,
    fecha date NOT NULL,
    tipo character varying(100),
    descripcion text,
    kilometraje integer,
    "proximoMantenimientoKm" integer,
    "proximoMantenimientoFecha" date,
    costo numeric(10,2),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_historial_mantenimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_historial_mantenimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_historial_mantenimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_historial_mantenimiento_id_seq OWNED BY public.tm_historial_mantenimiento.id;


--
-- Name: tm_orden_repuestos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_orden_repuestos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "ordenId" integer NOT NULL,
    "productoId" integer,
    descripcion text NOT NULL,
    referencia character varying(100),
    marca character varying(100),
    cantidad numeric(8,2) DEFAULT '1'::numeric NOT NULL,
    "costoUnitario" numeric(10,2),
    "precioUnitario" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    origen character varying(30) DEFAULT 'inventario'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_orden_repuestos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_orden_repuestos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_orden_repuestos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_orden_repuestos_id_seq OWNED BY public.tm_orden_repuestos.id;


--
-- Name: tm_orden_servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_orden_servicios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "ordenId" integer NOT NULL,
    "tecnicoId" integer,
    descripcion text NOT NULL,
    categoria character varying(100),
    "horasEstimadas" numeric(5,2),
    "horasReales" numeric(5,2),
    "tarifaHora" numeric(10,2),
    "precioUnitario" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    cantidad numeric(8,2) DEFAULT '1'::numeric NOT NULL,
    descuento numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "completadoAt" timestamp without time zone,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_orden_servicios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_orden_servicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_orden_servicios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_orden_servicios_id_seq OWNED BY public.tm_orden_servicios.id;


--
-- Name: tm_ordenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_ordenes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    numero character varying(20) NOT NULL,
    "vehiculoId" integer NOT NULL,
    "clienteId" integer,
    "fechaIngreso" timestamp without time zone NOT NULL,
    "kilometrajeIngreso" integer,
    "nivelCombustible" character varying(20),
    "motivoIngreso" text NOT NULL,
    "diagnosticoInicial" text,
    "tecnicoId" integer,
    prioridad character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    estado character varying(30) DEFAULT 'recibido'::character varying NOT NULL,
    "fechaDiagnostico" timestamp without time zone,
    "fechaAprobacion" timestamp without time zone,
    "fechaInicio" timestamp without time zone,
    "fechaEstimadaEntrega" date,
    "fechaFinalizacion" timestamp without time zone,
    "fechaEntrega" timestamp without time zone,
    "presupuestoAprobado" boolean DEFAULT false NOT NULL,
    "aprobadoPor" character varying(100),
    "aprobadoFecha" timestamp without time zone,
    "formaAprobacion" character varying(50),
    "tieneRayones" boolean DEFAULT false NOT NULL,
    "tieneGolpes" boolean DEFAULT false NOT NULL,
    "tieneDocumentos" boolean DEFAULT false NOT NULL,
    "tieneGato" boolean DEFAULT false NOT NULL,
    "tieneHerramientas" boolean DEFAULT false NOT NULL,
    "observacionesIngreso" text,
    "subtotalManoObra" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "subtotalRepuestos" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    descuento numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    itbis numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "garantiaDias" integer DEFAULT 0 NOT NULL,
    "garantiaKm" integer DEFAULT 0 NOT NULL,
    "facturaId" integer,
    notas text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_ordenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_ordenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_ordenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_ordenes_id_seq OWNED BY public.tm_ordenes.id;


--
-- Name: tm_tecnicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_tecnicos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    especialidad character varying(100),
    telefono character varying(20),
    email character varying(100),
    "tarifaHora" numeric(10,2),
    "empleadoId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_tecnicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_tecnicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_tecnicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_tecnicos_id_seq OWNED BY public.tm_tecnicos.id;


--
-- Name: tm_vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tm_vehiculos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    placa character varying(20) NOT NULL,
    vin character varying(50),
    marca character varying(100) NOT NULL,
    modelo character varying(100) NOT NULL,
    anio integer,
    color character varying(50),
    tipo character varying(50),
    combustible character varying(30),
    transmision character varying(20),
    cilindraje character varying(20),
    "kilometrajeActual" integer DEFAULT 0 NOT NULL,
    "kilometrajeUltimoServicio" integer,
    "proximoServicioKm" integer,
    "clienteId" integer,
    "propietarioNombre" character varying(200),
    "propietarioTelefono" character varying(20),
    "propietarioEmail" character varying(100),
    observaciones text,
    "imagenUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tm_vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tm_vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tm_vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tm_vehiculos_id_seq OWNED BY public.tm_vehiculos.id;


--
-- Name: token_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_blacklist (
    jti character varying(36) NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: tr_choferes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tr_choferes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(200) NOT NULL,
    cedula character varying(20),
    telefono character varying(20),
    email character varying(150),
    licencia character varying(50),
    "tipoLicencia" character varying(20),
    "vencimientoLicencia" date,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tr_choferes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tr_choferes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tr_choferes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tr_choferes_id_seq OWNED BY public.tr_choferes.id;


--
-- Name: tr_combustible; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tr_combustible (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "vehiculoId" integer,
    "choferId" integer,
    fecha date NOT NULL,
    "tipoCombustible" character varying(20) DEFAULT 'gasolina'::character varying NOT NULL,
    galones numeric(8,3),
    "precioGalon" numeric(8,2),
    total numeric(10,2) NOT NULL,
    odometro numeric(10,1),
    estacion character varying(200),
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tr_combustible_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tr_combustible_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tr_combustible_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tr_combustible_id_seq OWNED BY public.tr_combustible.id;


--
-- Name: tr_mantenimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tr_mantenimiento (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "vehiculoId" integer,
    fecha date NOT NULL,
    tipo character varying(20) DEFAULT 'preventivo'::character varying NOT NULL,
    descripcion text NOT NULL,
    costo numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    proveedor character varying(200),
    "odometroActual" numeric(10,1),
    "proximaFecha" date,
    "proximoKm" numeric(10,1),
    estado character varying(20) DEFAULT 'programado'::character varying NOT NULL,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tr_mantenimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tr_mantenimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tr_mantenimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tr_mantenimiento_id_seq OWNED BY public.tr_mantenimiento.id;


--
-- Name: tr_vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tr_vehiculos (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    placa character varying(20) NOT NULL,
    marca character varying(100) NOT NULL,
    modelo character varying(100) NOT NULL,
    anio integer,
    tipo character varying(30) DEFAULT 'camion'::character varying NOT NULL,
    color character varying(50),
    capacidad character varying(50),
    estado character varying(30) DEFAULT 'operativo'::character varying NOT NULL,
    "choferId" integer,
    "seguroVencimiento" date,
    "marbeteVencimiento" date,
    "inspeccionVencimiento" date,
    notas text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tr_vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tr_vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tr_vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tr_vehiculos_id_seq OWNED BY public.tr_vehiculos.id;


--
-- Name: tr_viajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tr_viajes (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "sucursalId" integer,
    numero character varying(30) NOT NULL,
    fecha date NOT NULL,
    origen character varying(200) NOT NULL,
    destino character varying(200) NOT NULL,
    "clienteId" integer,
    "choferId" integer,
    "vehiculoId" integer,
    tarifa numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(20) DEFAULT 'programado'::character varying NOT NULL,
    notas text,
    "facturaId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tr_viajes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tr_viajes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tr_viajes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tr_viajes_id_seq OWNED BY public.tr_viajes.id;


--
-- Name: transacciones_puntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacciones_puntos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "clienteId" integer NOT NULL,
    tipo public.transacciones_puntos_tipo_enum NOT NULL,
    puntos numeric(14,4) NOT NULL,
    "montoReferencia" numeric(14,2),
    "referenciaId" character varying(50),
    "saldoAnterior" numeric(14,4) NOT NULL,
    "saldoNuevo" numeric(14,4) NOT NULL,
    descripcion text
);


--
-- Name: transacciones_puntos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transacciones_puntos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transacciones_puntos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transacciones_puntos_id_seq OWNED BY public.transacciones_puntos.id;


--
-- Name: transacciones_tarjeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacciones_tarjeta (
    id integer NOT NULL,
    "empresaId" integer,
    "terminalId" integer NOT NULL,
    fecha date NOT NULL,
    referencia character varying(80) NOT NULL,
    "tarjetaUltimos4" character varying(10),
    tipo character varying(30) DEFAULT 'venta'::character varying NOT NULL,
    monto numeric(12,2) NOT NULL,
    comision numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    neto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    estado character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "conciliacionId" integer,
    notas text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: transacciones_tarjeta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transacciones_tarjeta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transacciones_tarjeta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transacciones_tarjeta_id_seq OWNED BY public.transacciones_tarjeta.id;


--
-- Name: transferencias_almacen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencias_almacen (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    "almacenOrigenId" integer NOT NULL,
    "almacenDestinoId" integer NOT NULL,
    "productoId" integer NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    estado public.transferencias_almacen_estado_enum DEFAULT 'pendiente'::public.transferencias_almacen_estado_enum NOT NULL,
    fecha date NOT NULL,
    notas text,
    "usuarioId" integer
);


--
-- Name: transferencias_almacen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transferencias_almacen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transferencias_almacen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transferencias_almacen_id_seq OWNED BY public.transferencias_almacen.id;


--
-- Name: typeorm_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.typeorm_migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.typeorm_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: typeorm_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.typeorm_migrations_id_seq OWNED BY public.typeorm_migrations.id;


--
-- Name: unidades_medida; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades_medida (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    simbolo character varying(10),
    tipo public.unidades_medida_tipo_enum DEFAULT 'cantidad'::public.unidades_medida_tipo_enum NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "esBase" boolean DEFAULT false NOT NULL,
    "permiteDecimales" boolean DEFAULT false NOT NULL
);


--
-- Name: unidades_medida_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unidades_medida_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unidades_medida_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unidades_medida_id_seq OWNED BY public.unidades_medida.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    nombre character varying(200) NOT NULL,
    email character varying(150) NOT NULL,
    username character varying(30),
    password character varying NOT NULL,
    role public.users_role_enum DEFAULT 'viewer'::public.users_role_enum NOT NULL,
    "resetPasswordToken" character varying(100),
    "resetPasswordExpires" timestamp without time zone,
    "emailVerifiedAt" timestamp with time zone,
    "emailVerificationToken" character varying(255),
    "emailVerificationExpires" timestamp with time zone,
    provider character varying(20) DEFAULT 'LOCAL'::character varying NOT NULL,
    "googleId" character varying(100),
    "googleAccessToken" text,
    "roleVersion" integer DEFAULT 1 NOT NULL,
    "sessionToken" character varying(64),
    "sessionCreatedAt" timestamp with time zone,
    "tourCompletado" boolean DEFAULT false NOT NULL,
    "accountStatus" character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    "passwordConfigured" boolean DEFAULT true NOT NULL,
    "temaSidebar" character varying(20) DEFAULT 'nube'::character varying NOT NULL,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "twoFactorSecret" character varying(100),
    "twoFactorBackupCodes" jsonb,
    "pinSupervisor" character varying(100)
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: usuario_empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_empresa (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer NOT NULL,
    "empresaId" integer NOT NULL,
    rol public.usuario_empresa_rol_enum DEFAULT 'viewer'::public.usuario_empresa_rol_enum NOT NULL,
    "isPrincipal" boolean DEFAULT false NOT NULL,
    "sucursalId" integer
);


--
-- Name: usuario_empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_empresa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_empresa_id_seq OWNED BY public.usuario_empresa.id;


--
-- Name: valores_atributo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valores_atributo (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "atributoId" integer NOT NULL,
    valor character varying(100) NOT NULL,
    codigo character varying(30),
    "colorHex" character varying(7),
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: valores_atributo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.valores_atributo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: valores_atributo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.valores_atributo_id_seq OWNED BY public.valores_atributo.id;


--
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    placa character varying(20) NOT NULL,
    marca character varying(100) NOT NULL,
    modelo character varying(100) NOT NULL,
    anio integer NOT NULL,
    color character varying(50),
    "tipoVehiculo" character varying(50),
    estado public.vehiculos_estado_enum DEFAULT 'activo'::public.vehiculos_estado_enum NOT NULL,
    kilometraje integer DEFAULT 0 NOT NULL,
    conductor character varying(100),
    "conductorId" integer,
    "vencimientoItbis" date,
    "vencimientoSeguro" date,
    "vencimientoInspeccion" date,
    "valorCompra" numeric(12,2),
    notas text
);


--
-- Name: vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculos_id_seq OWNED BY public.vehiculos.id;


--
-- Name: vendedor_clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedor_clientes (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "vendedorId" integer NOT NULL,
    "clienteId" integer NOT NULL,
    "fechaAsignacion" date NOT NULL
);


--
-- Name: vendedor_clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendedor_clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendedor_clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendedor_clientes_id_seq OWNED BY public.vendedor_clientes.id;


--
-- Name: vendedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedores (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    codigo character varying(10) NOT NULL,
    nombre character varying(150) NOT NULL,
    cedula character varying(11),
    email character varying(100),
    telefono character varying(20),
    zona character varying(100),
    cargo character varying(60),
    "comisionPct" numeric(5,2) DEFAULT '5'::numeric NOT NULL,
    "metaMensual" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "usuarioId" integer,
    "fechaIngreso" date,
    notas text,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: vendedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendedores_id_seq OWNED BY public.vendedores.id;


--
-- Name: videos_tutoriales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos_tutoriales (
    id integer NOT NULL,
    modulo character varying NOT NULL,
    titulo character varying NOT NULL,
    descripcion text,
    proveedor character varying(20) NOT NULL,
    "videoId" character varying NOT NULL,
    "duracionSegundos" integer,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: videos_tutoriales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.videos_tutoriales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: videos_tutoriales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.videos_tutoriales_id_seq OWNED BY public.videos_tutoriales.id;


--
-- Name: wms_lineas_picking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_lineas_picking (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "ordenId" integer NOT NULL,
    "productoId" integer NOT NULL,
    "ubicacionId" integer,
    "ubicacionCodigo" character varying(30),
    "cantidadSolicitada" numeric(12,4) NOT NULL,
    "cantidadPickeada" numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    estado public.wms_lineas_picking_estado_enum DEFAULT 'pendiente'::public.wms_lineas_picking_estado_enum NOT NULL,
    "loteId" integer,
    "numeroSerie" character varying(100),
    notas text,
    orden_linea integer DEFAULT 0 NOT NULL
);


--
-- Name: wms_lineas_picking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_lineas_picking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_lineas_picking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_lineas_picking_id_seq OWNED BY public.wms_lineas_picking.id;


--
-- Name: wms_ordenes_picking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_ordenes_picking (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    numero character varying(20) NOT NULL,
    tipo public.wms_ordenes_picking_tipo_enum DEFAULT 'salida_venta'::public.wms_ordenes_picking_tipo_enum NOT NULL,
    estado public.wms_ordenes_picking_estado_enum DEFAULT 'borrador'::public.wms_ordenes_picking_estado_enum NOT NULL,
    "almacenId" integer NOT NULL,
    "facturaId" integer,
    "transferId" integer,
    "operadorId" integer,
    "creadoPorId" integer,
    "fechaAsignacion" timestamp with time zone,
    "fechaInicio" timestamp with time zone,
    "fechaEmpacado" timestamp with time zone,
    "fechaDespachado" timestamp with time zone,
    prioridad integer DEFAULT 2 NOT NULL,
    observaciones text,
    destinatario character varying(100),
    "direccionEntrega" character varying(200)
);


--
-- Name: wms_ordenes_picking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_ordenes_picking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_ordenes_picking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_ordenes_picking_id_seq OWNED BY public.wms_ordenes_picking.id;


--
-- Name: wms_ubicaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_ubicaciones (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "almacenId" integer NOT NULL,
    codigo character varying(30) NOT NULL,
    pasillo character varying(10),
    estante character varying(10),
    nivel character varying(10),
    posicion character varying(10),
    tipo public.wms_ubicaciones_tipo_enum DEFAULT 'picking'::public.wms_ubicaciones_tipo_enum NOT NULL,
    "capacidadKg" numeric(8,2),
    activa boolean DEFAULT true NOT NULL,
    notas text
);


--
-- Name: wms_ubicaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_ubicaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_ubicaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_ubicaciones_id_seq OWNED BY public.wms_ubicaciones.id;


--
-- Name: xlink_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xlink_documentos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "origenEmpresaId" integer NOT NULL,
    "destinoEmpresaId" integer NOT NULL,
    "tipoDocumento" character varying(20) NOT NULL,
    "documentoOrigenId" integer NOT NULL,
    "numeroOrigen" character varying(20) NOT NULL,
    "ncfOrigen" character varying(20),
    "fechaOrigen" date NOT NULL,
    "totalOrigen" numeric(14,2) NOT NULL,
    snapshot jsonb NOT NULL,
    "estadoReceptor" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "documentoGeneradoTipo" character varying(20),
    "documentoGeneradoId" integer,
    "numeroGenerado" character varying(20),
    "xlinkPadreId" integer,
    "publicadoPorUsuarioId" integer NOT NULL,
    "publicadoEn" timestamp with time zone DEFAULT now() NOT NULL,
    "procesadoPorUsuarioId" integer,
    "procesadoEn" timestamp with time zone,
    "motivoDescarte" text,
    CONSTRAINT ck_xlink_doc_estado CHECK ((("estadoReceptor")::text = ANY ((ARRAY['pendiente'::character varying, 'procesado'::character varying, 'procesado_manual'::character varying, 'descartado'::character varying, 'anulado_en_origen'::character varying])::text[]))),
    CONSTRAINT ck_xlink_doc_tipo CHECK ((("tipoDocumento")::text = ANY ((ARRAY['factura_credito'::character varying, 'nota_credito'::character varying, 'orden_compra'::character varying])::text[])))
);


--
-- Name: xlink_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.xlink_documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: xlink_documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.xlink_documentos_id_seq OWNED BY public.xlink_documentos.id;


--
-- Name: xlink_mapeos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xlink_mapeos (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "empresaId" integer,
    "contraparteXlinkId" uuid NOT NULL,
    tipo character varying(20) NOT NULL,
    "valorExterno" text NOT NULL,
    "valorInternoId" integer NOT NULL
);


--
-- Name: xlink_mapeos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.xlink_mapeos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: xlink_mapeos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.xlink_mapeos_id_seq OWNED BY public.xlink_mapeos.id;


--
-- Name: activos_fijos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos_fijos ALTER COLUMN id SET DEFAULT nextval('public.activos_fijos_id_seq'::regclass);


--
-- Name: ag_animales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_animales ALTER COLUMN id SET DEFAULT nextval('public.ag_animales_id_seq'::regclass);


--
-- Name: ag_aplicaciones_insumo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_aplicaciones_insumo ALTER COLUMN id SET DEFAULT nextval('public.ag_aplicaciones_insumo_id_seq'::regclass);


--
-- Name: ag_ciclos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_ciclos ALTER COLUMN id SET DEFAULT nextval('public.ag_ciclos_id_seq'::regclass);


--
-- Name: ag_cosechas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_cosechas ALTER COLUMN id SET DEFAULT nextval('public.ag_cosechas_id_seq'::regclass);


--
-- Name: ag_cultivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_cultivos ALTER COLUMN id SET DEFAULT nextval('public.ag_cultivos_id_seq'::regclass);


--
-- Name: ag_eventos_animal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_eventos_animal ALTER COLUMN id SET DEFAULT nextval('public.ag_eventos_animal_id_seq'::regclass);


--
-- Name: ag_fincas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_fincas ALTER COLUMN id SET DEFAULT nextval('public.ag_fincas_id_seq'::regclass);


--
-- Name: ag_insumos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_insumos ALTER COLUMN id SET DEFAULT nextval('public.ag_insumos_id_seq'::regclass);


--
-- Name: ag_labores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_labores ALTER COLUMN id SET DEFAULT nextval('public.ag_labores_id_seq'::regclass);


--
-- Name: ag_maquinaria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_maquinaria ALTER COLUMN id SET DEFAULT nextval('public.ag_maquinaria_id_seq'::regclass);


--
-- Name: ag_parcelas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_parcelas ALTER COLUMN id SET DEFAULT nextval('public.ag_parcelas_id_seq'::regclass);


--
-- Name: almacenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.almacenes ALTER COLUMN id SET DEFAULT nextval('public.almacenes_id_seq'::regclass);


--
-- Name: anticipo_cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anticipo_cliente ALTER COLUMN id SET DEFAULT nextval('public.anticipo_cliente_id_seq'::regclass);


--
-- Name: aprobaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprobaciones ALTER COLUMN id SET DEFAULT nextval('public.aprobaciones_id_seq'::regclass);


--
-- Name: asiento_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asiento_lineas ALTER COLUMN id SET DEFAULT nextval('public.asiento_lineas_id_seq'::regclass);


--
-- Name: asientos_contables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asientos_contables ALTER COLUMN id SET DEFAULT nextval('public.asientos_contables_id_seq'::regclass);


--
-- Name: asignaciones_costo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_costo ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_costo_id_seq'::regclass);


--
-- Name: atributos_producto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atributos_producto ALTER COLUMN id SET DEFAULT nextval('public.atributos_producto_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: ausencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias ALTER COLUMN id SET DEFAULT nextval('public.ausencias_id_seq'::regclass);


--
-- Name: backup_registros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_registros ALTER COLUMN id SET DEFAULT nextval('public.backup_registros_id_seq'::regclass);


--
-- Name: balanza_formatos_exportacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balanza_formatos_exportacion ALTER COLUMN id SET DEFAULT nextval('public.balanza_formatos_exportacion_id_seq'::regclass);


--
-- Name: balanza_patrones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balanza_patrones ALTER COLUMN id SET DEFAULT nextval('public.balanza_patrones_id_seq'::regclass);


--
-- Name: bancos_conciliacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos_conciliacion ALTER COLUMN id SET DEFAULT nextval('public.bancos_conciliacion_id_seq'::regclass);


--
-- Name: cajas_chicas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cajas_chicas ALTER COLUMN id SET DEFAULT nextval('public.cajas_chicas_id_seq'::regclass);


--
-- Name: cargos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos ALTER COLUMN id SET DEFAULT nextval('public.cargos_id_seq'::regclass);


--
-- Name: categorias_activos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_activos ALTER COLUMN id SET DEFAULT nextval('public.categorias_activos_id_seq'::regclass);


--
-- Name: centros_costo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_costo ALTER COLUMN id SET DEFAULT nextval('public.centros_costo_id_seq'::regclass);


--
-- Name: centros_trabajo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_trabajo ALTER COLUMN id SET DEFAULT nextval('public.centros_trabajo_id_seq'::regclass);


--
-- Name: chequeras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chequeras ALTER COLUMN id SET DEFAULT nextval('public.chequeras_id_seq'::regclass);


--
-- Name: cheques id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques ALTER COLUMN id SET DEFAULT nextval('public.cheques_id_seq'::regclass);


--
-- Name: cierres_caja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_caja ALTER COLUMN id SET DEFAULT nextval('public.cierres_caja_id_seq'::regclass);


--
-- Name: cl_autorizaciones_ars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_autorizaciones_ars ALTER COLUMN id SET DEFAULT nextval('public.cl_autorizaciones_ars_id_seq'::regclass);


--
-- Name: cl_catalogo_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_catalogo_servicios ALTER COLUMN id SET DEFAULT nextval('public.cl_catalogo_servicios_id_seq'::regclass);


--
-- Name: cl_citas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_citas ALTER COLUMN id SET DEFAULT nextval('public.cl_citas_id_seq'::regclass);


--
-- Name: cl_consultas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_consultas ALTER COLUMN id SET DEFAULT nextval('public.cl_consultas_id_seq'::regclass);


--
-- Name: cl_examenes_laboratorio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_examenes_laboratorio ALTER COLUMN id SET DEFAULT nextval('public.cl_examenes_laboratorio_id_seq'::regclass);


--
-- Name: cl_medicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_medicos ALTER COLUMN id SET DEFAULT nextval('public.cl_medicos_id_seq'::regclass);


--
-- Name: cl_ordenes_laboratorio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_ordenes_laboratorio ALTER COLUMN id SET DEFAULT nextval('public.cl_ordenes_laboratorio_id_seq'::regclass);


--
-- Name: cl_pacientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_pacientes ALTER COLUMN id SET DEFAULT nextval('public.cl_pacientes_id_seq'::regclass);


--
-- Name: cl_procedimientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_procedimientos ALTER COLUMN id SET DEFAULT nextval('public.cl_procedimientos_id_seq'::regclass);


--
-- Name: cl_receta_medicamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_receta_medicamentos ALTER COLUMN id SET DEFAULT nextval('public.cl_receta_medicamentos_id_seq'::regclass);


--
-- Name: cl_recetas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_recetas ALTER COLUMN id SET DEFAULT nextval('public.cl_recetas_id_seq'::regclass);


--
-- Name: cl_sala_espera id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_sala_espera ALTER COLUMN id SET DEFAULT nextval('public.cl_sala_espera_id_seq'::regclass);


--
-- Name: cl_signos_vitales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_signos_vitales ALTER COLUMN id SET DEFAULT nextval('public.cl_signos_vitales_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: comisiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones ALTER COLUMN id SET DEFAULT nextval('public.comisiones_id_seq'::regclass);


--
-- Name: componentes_lm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.componentes_lm ALTER COLUMN id SET DEFAULT nextval('public.componentes_lm_id_seq'::regclass);


--
-- Name: compra_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalles ALTER COLUMN id SET DEFAULT nextval('public.compra_detalles_id_seq'::regclass);


--
-- Name: compras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras ALTER COLUMN id SET DEFAULT nextval('public.compras_id_seq'::regclass);


--
-- Name: conciliaciones_bancarias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_bancarias ALTER COLUMN id SET DEFAULT nextval('public.conciliaciones_bancarias_id_seq'::regclass);


--
-- Name: conciliaciones_datafono id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_datafono ALTER COLUMN id SET DEFAULT nextval('public.conciliaciones_datafono_id_seq'::regclass);


--
-- Name: conduce_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduce_detalles ALTER COLUMN id SET DEFAULT nextval('public.conduce_detalles_id_seq'::regclass);


--
-- Name: conduces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduces ALTER COLUMN id SET DEFAULT nextval('public.conduces_id_seq'::regclass);


--
-- Name: configuracion_bancaria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_bancaria ALTER COLUMN id SET DEFAULT nextval('public.configuracion_bancaria_id_seq'::regclass);


--
-- Name: configuraciones_cuentas_contables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_cuentas_contables ALTER COLUMN id SET DEFAULT nextval('public.configuraciones_cuentas_contables_id_seq'::regclass);


--
-- Name: configuraciones_sistema id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_sistema ALTER COLUMN id SET DEFAULT nextval('public.configuraciones_sistema_id_seq'::regclass);


--
-- Name: conteo_ajustes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteo_ajustes ALTER COLUMN id SET DEFAULT nextval('public.conteo_ajustes_id_seq'::regclass);


--
-- Name: conteos_inventario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario ALTER COLUMN id SET DEFAULT nextval('public.conteos_inventario_id_seq'::regclass);


--
-- Name: contratos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos ALTER COLUMN id SET DEFAULT nextval('public.contratos_id_seq'::regclass);


--
-- Name: contratos_laborales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_laborales ALTER COLUMN id SET DEFAULT nextval('public.contratos_laborales_id_seq'::regclass);


--
-- Name: conversiones_uom id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversiones_uom ALTER COLUMN id SET DEFAULT nextval('public.conversiones_uom_id_seq'::regclass);


--
-- Name: cotizacion_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_detalles ALTER COLUMN id SET DEFAULT nextval('public.cotizacion_detalles_id_seq'::regclass);


--
-- Name: cotizacion_proveedor_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_proveedor_lineas ALTER COLUMN id SET DEFAULT nextval('public.cotizacion_proveedor_lineas_id_seq'::regclass);


--
-- Name: cotizaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones ALTER COLUMN id SET DEFAULT nextval('public.cotizaciones_id_seq'::regclass);


--
-- Name: cotizaciones_proveedor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_proveedor ALTER COLUMN id SET DEFAULT nextval('public.cotizaciones_proveedor_id_seq'::regclass);


--
-- Name: credito_cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credito_cliente ALTER COLUMN id SET DEFAULT nextval('public.credito_cliente_id_seq'::regclass);


--
-- Name: crm_actividades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_actividades ALTER COLUMN id SET DEFAULT nextval('public.crm_actividades_id_seq'::regclass);


--
-- Name: crm_leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads ALTER COLUMN id SET DEFAULT nextval('public.crm_leads_id_seq'::regclass);


--
-- Name: crm_oportunidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_oportunidades ALTER COLUMN id SET DEFAULT nextval('public.crm_oportunidades_id_seq'::regclass);


--
-- Name: cuenta_anexo_ir2 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_anexo_ir2 ALTER COLUMN id SET DEFAULT nextval('public.cuenta_anexo_ir2_id_seq'::regclass);


--
-- Name: cuentas_bancarias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias ALTER COLUMN id SET DEFAULT nextval('public.cuentas_bancarias_id_seq'::regclass);


--
-- Name: cuentas_contables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_contables ALTER COLUMN id SET DEFAULT nextval('public.cuentas_contables_id_seq'::regclass);


--
-- Name: cuentas_estadisticas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_estadisticas ALTER COLUMN id SET DEFAULT nextval('public.cuentas_estadisticas_id_seq'::regclass);


--
-- Name: cuentas_por_cobrar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar ALTER COLUMN id SET DEFAULT nextval('public.cuentas_por_cobrar_id_seq'::regclass);


--
-- Name: cuentas_por_pagar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar ALTER COLUMN id SET DEFAULT nextval('public.cuentas_por_pagar_id_seq'::regclass);


--
-- Name: cuotas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuotas ALTER COLUMN id SET DEFAULT nextval('public.cuotas_id_seq'::regclass);


--
-- Name: cursos_capacitacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos_capacitacion ALTER COLUMN id SET DEFAULT nextval('public.cursos_capacitacion_id_seq'::regclass);


--
-- Name: cw_adelantos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_adelantos ALTER COLUMN id SET DEFAULT nextval('public.cw_adelantos_id_seq'::regclass);


--
-- Name: cw_comisiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_comisiones ALTER COLUMN id SET DEFAULT nextval('public.cw_comisiones_id_seq'::regclass);


--
-- Name: cw_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_config ALTER COLUMN id SET DEFAULT nextval('public.cw_config_id_seq'::regclass);


--
-- Name: cw_lavadores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_lavadores ALTER COLUMN id SET DEFAULT nextval('public.cw_lavadores_id_seq'::regclass);


--
-- Name: cw_liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.cw_liquidaciones_id_seq'::regclass);


--
-- Name: cw_servicio_precios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_servicio_precios ALTER COLUMN id SET DEFAULT nextval('public.cw_servicio_precios_id_seq'::regclass);


--
-- Name: cw_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_servicios ALTER COLUMN id SET DEFAULT nextval('public.cw_servicios_id_seq'::regclass);


--
-- Name: cw_turno_eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_eventos ALTER COLUMN id SET DEFAULT nextval('public.cw_turno_eventos_id_seq'::regclass);


--
-- Name: cw_turno_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_fotos ALTER COLUMN id SET DEFAULT nextval('public.cw_turno_fotos_id_seq'::regclass);


--
-- Name: cw_turno_lavadores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_lavadores ALTER COLUMN id SET DEFAULT nextval('public.cw_turno_lavadores_id_seq'::regclass);


--
-- Name: cw_turno_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_servicios ALTER COLUMN id SET DEFAULT nextval('public.cw_turno_servicios_id_seq'::regclass);


--
-- Name: cw_turnos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turnos ALTER COLUMN id SET DEFAULT nextval('public.cw_turnos_id_seq'::regclass);


--
-- Name: declaraciones_itbis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_itbis ALTER COLUMN id SET DEFAULT nextval('public.declaraciones_itbis_id_seq'::regclass);


--
-- Name: demo_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests ALTER COLUMN id SET DEFAULT nextval('public.demo_requests_id_seq'::regclass);


--
-- Name: departamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos ALTER COLUMN id SET DEFAULT nextval('public.departamentos_id_seq'::regclass);


--
-- Name: depositos_bancarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depositos_bancarios ALTER COLUMN id SET DEFAULT nextval('public.depositos_bancarios_id_seq'::regclass);


--
-- Name: depreciaciones_activos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciaciones_activos ALTER COLUMN id SET DEFAULT nextval('public.depreciaciones_activos_id_seq'::regclass);


--
-- Name: devolucion_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_detalles ALTER COLUMN id SET DEFAULT nextval('public.devolucion_detalles_id_seq'::regclass);


--
-- Name: devoluciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones ALTER COLUMN id SET DEFAULT nextval('public.devoluciones_id_seq'::regclass);


--
-- Name: documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos ALTER COLUMN id SET DEFAULT nextval('public.documentos_id_seq'::regclass);


--
-- Name: ecf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf ALTER COLUMN id SET DEFAULT nextval('public.ecf_id_seq'::regclass);


--
-- Name: ecf_consumo_ciclo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_consumo_ciclo ALTER COLUMN id SET DEFAULT nextval('public.ecf_consumo_ciclo_id_seq'::regclass);


--
-- Name: ecf_eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_eventos ALTER COLUMN id SET DEFAULT nextval('public.ecf_eventos_id_seq'::regclass);


--
-- Name: ecf_recibidos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_recibidos ALTER COLUMN id SET DEFAULT nextval('public.ecf_recibidos_id_seq'::regclass);


--
-- Name: ed_anios_escolares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_anios_escolares ALTER COLUMN id SET DEFAULT nextval('public.ed_anios_escolares_id_seq'::regclass);


--
-- Name: ed_asignaturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_asignaturas ALTER COLUMN id SET DEFAULT nextval('public.ed_asignaturas_id_seq'::regclass);


--
-- Name: ed_asistencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_asistencia ALTER COLUMN id SET DEFAULT nextval('public.ed_asistencia_id_seq'::regclass);


--
-- Name: ed_becas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_becas ALTER COLUMN id SET DEFAULT nextval('public.ed_becas_id_seq'::regclass);


--
-- Name: ed_biblioteca_libros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_biblioteca_libros ALTER COLUMN id SET DEFAULT nextval('public.ed_biblioteca_libros_id_seq'::regclass);


--
-- Name: ed_biblioteca_prestamos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_biblioteca_prestamos ALTER COLUMN id SET DEFAULT nextval('public.ed_biblioteca_prestamos_id_seq'::regclass);


--
-- Name: ed_calificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_calificaciones ALTER COLUMN id SET DEFAULT nextval('public.ed_calificaciones_id_seq'::regclass);


--
-- Name: ed_cargos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_cargos ALTER COLUMN id SET DEFAULT nextval('public.ed_cargos_id_seq'::regclass);


--
-- Name: ed_cargos_condonaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_cargos_condonaciones ALTER COLUMN id SET DEFAULT nextval('public.ed_cargos_condonaciones_id_seq'::regclass);


--
-- Name: ed_comedor_planes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_comedor_planes ALTER COLUMN id SET DEFAULT nextval('public.ed_comedor_planes_id_seq'::regclass);


--
-- Name: ed_comunicados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_comunicados ALTER COLUMN id SET DEFAULT nextval('public.ed_comunicados_id_seq'::regclass);


--
-- Name: ed_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_config ALTER COLUMN id SET DEFAULT nextval('public.ed_config_id_seq'::regclass);


--
-- Name: ed_disciplina id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_disciplina ALTER COLUMN id SET DEFAULT nextval('public.ed_disciplina_id_seq'::regclass);


--
-- Name: ed_docentes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_docentes ALTER COLUMN id SET DEFAULT nextval('public.ed_docentes_id_seq'::regclass);


--
-- Name: ed_enfermeria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_enfermeria ALTER COLUMN id SET DEFAULT nextval('public.ed_enfermeria_id_seq'::regclass);


--
-- Name: ed_estudiante_becas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_estudiante_becas ALTER COLUMN id SET DEFAULT nextval('public.ed_estudiante_becas_id_seq'::regclass);


--
-- Name: ed_estudiantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_estudiantes ALTER COLUMN id SET DEFAULT nextval('public.ed_estudiantes_id_seq'::regclass);


--
-- Name: ed_evaluaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_evaluaciones ALTER COLUMN id SET DEFAULT nextval('public.ed_evaluaciones_id_seq'::regclass);


--
-- Name: ed_grados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_grados ALTER COLUMN id SET DEFAULT nextval('public.ed_grados_id_seq'::regclass);


--
-- Name: ed_matriculas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_matriculas ALTER COLUMN id SET DEFAULT nextval('public.ed_matriculas_id_seq'::regclass);


--
-- Name: ed_niveles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_niveles ALTER COLUMN id SET DEFAULT nextval('public.ed_niveles_id_seq'::regclass);


--
-- Name: ed_notas_periodo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_notas_periodo ALTER COLUMN id SET DEFAULT nextval('public.ed_notas_periodo_id_seq'::regclass);


--
-- Name: ed_pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_pagos ALTER COLUMN id SET DEFAULT nextval('public.ed_pagos_id_seq'::regclass);


--
-- Name: ed_pagos_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_pagos_detalle ALTER COLUMN id SET DEFAULT nextval('public.ed_pagos_detalle_id_seq'::regclass);


--
-- Name: ed_periodos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_periodos ALTER COLUMN id SET DEFAULT nextval('public.ed_periodos_id_seq'::regclass);


--
-- Name: ed_planes_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_planes_pago ALTER COLUMN id SET DEFAULT nextval('public.ed_planes_pago_id_seq'::regclass);


--
-- Name: ed_secciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_secciones ALTER COLUMN id SET DEFAULT nextval('public.ed_secciones_id_seq'::regclass);


--
-- Name: ed_transporte_rutas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_transporte_rutas ALTER COLUMN id SET DEFAULT nextval('public.ed_transporte_rutas_id_seq'::regclass);


--
-- Name: ed_tutores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_tutores ALTER COLUMN id SET DEFAULT nextval('public.ed_tutores_id_seq'::regclass);


--
-- Name: empleados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados ALTER COLUMN id SET DEFAULT nextval('public.empleados_id_seq'::regclass);


--
-- Name: empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa ALTER COLUMN id SET DEFAULT nextval('public.empresa_id_seq'::regclass);


--
-- Name: empresa_ecf_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_ecf_config ALTER COLUMN id SET DEFAULT nextval('public.empresa_ecf_config_id_seq'::regclass);


--
-- Name: empresa_modulos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_modulos ALTER COLUMN id SET DEFAULT nextval('public.empresa_modulos_id_seq'::regclass);


--
-- Name: encuestas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuestas ALTER COLUMN id SET DEFAULT nextval('public.encuestas_id_seq'::regclass);


--
-- Name: etapas_ruta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_ruta ALTER COLUMN id SET DEFAULT nextval('public.etapas_ruta_id_seq'::regclass);


--
-- Name: evaluaciones_empleado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_empleado ALTER COLUMN id SET DEFAULT nextval('public.evaluaciones_empleado_id_seq'::regclass);


--
-- Name: fa_alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_alertas ALTER COLUMN id SET DEFAULT nextval('public.fa_alertas_id_seq'::regclass);


--
-- Name: fa_control_narcoticos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_control_narcoticos ALTER COLUMN id SET DEFAULT nextval('public.fa_control_narcoticos_id_seq'::regclass);


--
-- Name: fa_devoluciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_devoluciones ALTER COLUMN id SET DEFAULT nextval('public.fa_devoluciones_id_seq'::regclass);


--
-- Name: fa_dispensacion_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_dispensacion_items ALTER COLUMN id SET DEFAULT nextval('public.fa_dispensacion_items_id_seq'::regclass);


--
-- Name: fa_dispensaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_dispensaciones ALTER COLUMN id SET DEFAULT nextval('public.fa_dispensaciones_id_seq'::regclass);


--
-- Name: fa_lotes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_lotes ALTER COLUMN id SET DEFAULT nextval('public.fa_lotes_id_seq'::regclass);


--
-- Name: fa_medicamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_medicamentos ALTER COLUMN id SET DEFAULT nextval('public.fa_medicamentos_id_seq'::regclass);


--
-- Name: fa_recepcion_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_recepcion_items ALTER COLUMN id SET DEFAULT nextval('public.fa_recepcion_items_id_seq'::regclass);


--
-- Name: fa_recepciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_recepciones ALTER COLUMN id SET DEFAULT nextval('public.fa_recepciones_id_seq'::regclass);


--
-- Name: fa_reclamaciones_ars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_reclamaciones_ars ALTER COLUMN id SET DEFAULT nextval('public.fa_reclamaciones_ars_id_seq'::regclass);


--
-- Name: factura_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalles ALTER COLUMN id SET DEFAULT nextval('public.factura_detalles_id_seq'::regclass);


--
-- Name: facturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas ALTER COLUMN id SET DEFAULT nextval('public.facturas_id_seq'::regclass);


--
-- Name: facturas_recurrentes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas_recurrentes ALTER COLUMN id SET DEFAULT nextval('public.facturas_recurrentes_id_seq'::regclass);


--
-- Name: gastos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos ALTER COLUMN id SET DEFAULT nextval('public.gastos_id_seq'::regclass);


--
-- Name: gastos_importacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_importacion ALTER COLUMN id SET DEFAULT nextval('public.gastos_importacion_id_seq'::regclass);


--
-- Name: gastos_importacion_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_importacion_lineas ALTER COLUMN id SET DEFAULT nextval('public.gastos_importacion_lineas_id_seq'::regclass);


--
-- Name: gm_accesos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_accesos ALTER COLUMN id SET DEFAULT nextval('public.gm_accesos_id_seq'::regclass);


--
-- Name: gm_clases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_clases ALTER COLUMN id SET DEFAULT nextval('public.gm_clases_id_seq'::regclass);


--
-- Name: gm_comidas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_comidas ALTER COLUMN id SET DEFAULT nextval('public.gm_comidas_id_seq'::regclass);


--
-- Name: gm_entrenadores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_entrenadores ALTER COLUMN id SET DEFAULT nextval('public.gm_entrenadores_id_seq'::regclass);


--
-- Name: gm_lockers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_lockers ALTER COLUMN id SET DEFAULT nextval('public.gm_lockers_id_seq'::regclass);


--
-- Name: gm_membresias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_membresias ALTER COLUMN id SET DEFAULT nextval('public.gm_membresias_id_seq'::regclass);


--
-- Name: gm_miembros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_miembros ALTER COLUMN id SET DEFAULT nextval('public.gm_miembros_id_seq'::regclass);


--
-- Name: gm_planes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_planes ALTER COLUMN id SET DEFAULT nextval('public.gm_planes_id_seq'::regclass);


--
-- Name: gm_planes_nutricionales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_planes_nutricionales ALTER COLUMN id SET DEFAULT nextval('public.gm_planes_nutricionales_id_seq'::regclass);


--
-- Name: gm_productos_tienda id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_productos_tienda ALTER COLUMN id SET DEFAULT nextval('public.gm_productos_tienda_id_seq'::regclass);


--
-- Name: gm_progreso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_progreso ALTER COLUMN id SET DEFAULT nextval('public.gm_progreso_id_seq'::regclass);


--
-- Name: gm_reservas_clases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_reservas_clases ALTER COLUMN id SET DEFAULT nextval('public.gm_reservas_clases_id_seq'::regclass);


--
-- Name: gm_rutina_dias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutina_dias ALTER COLUMN id SET DEFAULT nextval('public.gm_rutina_dias_id_seq'::regclass);


--
-- Name: gm_rutina_ejercicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutina_ejercicios ALTER COLUMN id SET DEFAULT nextval('public.gm_rutina_ejercicios_id_seq'::regclass);


--
-- Name: gm_rutinas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutinas ALTER COLUMN id SET DEFAULT nextval('public.gm_rutinas_id_seq'::regclass);


--
-- Name: gm_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_schedule ALTER COLUMN id SET DEFAULT nextval('public.gm_schedule_id_seq'::regclass);


--
-- Name: gm_sesiones_ep id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_sesiones_ep ALTER COLUMN id SET DEFAULT nextval('public.gm_sesiones_ep_id_seq'::regclass);


--
-- Name: grupos_producto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos_producto ALTER COLUMN id SET DEFAULT nextval('public.grupos_producto_id_seq'::regclass);


--
-- Name: hitos_proyecto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitos_proyecto ALTER COLUMN id SET DEFAULT nextval('public.hitos_proyecto_id_seq'::regclass);


--
-- Name: invitaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones ALTER COLUMN id SET DEFAULT nextval('public.invitaciones_id_seq'::regclass);


--
-- Name: licitaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licitaciones ALTER COLUMN id SET DEFAULT nextval('public.licitaciones_id_seq'::regclass);


--
-- Name: lineas_conteo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo ALTER COLUMN id SET DEFAULT nextval('public.lineas_conteo_id_seq'::regclass);


--
-- Name: listas_materiales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listas_materiales ALTER COLUMN id SET DEFAULT nextval('public.listas_materiales_id_seq'::regclass);


--
-- Name: lotes_producto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_producto ALTER COLUMN id SET DEFAULT nextval('public.lotes_producto_id_seq'::regclass);


--
-- Name: modulos_addon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_addon ALTER COLUMN id SET DEFAULT nextval('public.modulos_addon_id_seq'::regclass);


--
-- Name: movimientos_bancarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_bancarios ALTER COLUMN id SET DEFAULT nextval('public.movimientos_bancarios_id_seq'::regclass);


--
-- Name: movimientos_caja_chica id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja_chica ALTER COLUMN id SET DEFAULT nextval('public.movimientos_caja_chica_id_seq'::regclass);


--
-- Name: movimientos_estadisticos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_estadisticos ALTER COLUMN id SET DEFAULT nextval('public.movimientos_estadisticos_id_seq'::regclass);


--
-- Name: movimientos_inventario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario ALTER COLUMN id SET DEFAULT nextval('public.movimientos_inventario_id_seq'::regclass);


--
-- Name: nomina_anticipos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_anticipos ALTER COLUMN id SET DEFAULT nextval('public.nomina_anticipos_id_seq'::regclass);


--
-- Name: nomina_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_lineas ALTER COLUMN id SET DEFAULT nextval('public.nomina_lineas_id_seq'::regclass);


--
-- Name: nomina_novedades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_novedades ALTER COLUMN id SET DEFAULT nextval('public.nomina_novedades_id_seq'::regclass);


--
-- Name: nomina_periodos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_periodos ALTER COLUMN id SET DEFAULT nextval('public.nomina_periodos_id_seq'::regclass);


--
-- Name: nomina_prestamos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_prestamos ALTER COLUMN id SET DEFAULT nextval('public.nomina_prestamos_id_seq'::regclass);


--
-- Name: nota_credito_compra_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_compra_detalles ALTER COLUMN id SET DEFAULT nextval('public.nota_credito_compra_detalles_id_seq'::regclass);


--
-- Name: nota_credito_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_detalles ALTER COLUMN id SET DEFAULT nextval('public.nota_credito_detalles_id_seq'::regclass);


--
-- Name: nota_debito_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_debito_detalles ALTER COLUMN id SET DEFAULT nextval('public.nota_debito_detalles_id_seq'::regclass);


--
-- Name: notas_credito id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito ALTER COLUMN id SET DEFAULT nextval('public.notas_credito_id_seq'::regclass);


--
-- Name: notas_credito_compras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito_compras ALTER COLUMN id SET DEFAULT nextval('public.notas_credito_compras_id_seq'::regclass);


--
-- Name: notas_debito id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_debito ALTER COLUMN id SET DEFAULT nextval('public.notas_debito_id_seq'::regclass);


--
-- Name: notificaciones_enviadas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_enviadas ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_enviadas_id_seq'::regclass);


--
-- Name: objetivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetivos ALTER COLUMN id SET DEFAULT nextval('public.objetivos_id_seq'::regclass);


--
-- Name: op_citas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_citas ALTER COLUMN id SET DEFAULT nextval('public.op_citas_id_seq'::regclass);


--
-- Name: op_consultas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_consultas ALTER COLUMN id SET DEFAULT nextval('public.op_consultas_id_seq'::regclass);


--
-- Name: op_inventario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_inventario ALTER COLUMN id SET DEFAULT nextval('public.op_inventario_id_seq'::regclass);


--
-- Name: op_medicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_medicos ALTER COLUMN id SET DEFAULT nextval('public.op_medicos_id_seq'::regclass);


--
-- Name: op_ordenes_trabajo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_ordenes_trabajo ALTER COLUMN id SET DEFAULT nextval('public.op_ordenes_trabajo_id_seq'::regclass);


--
-- Name: op_pacientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_pacientes ALTER COLUMN id SET DEFAULT nextval('public.op_pacientes_id_seq'::regclass);


--
-- Name: op_recetas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_recetas ALTER COLUMN id SET DEFAULT nextval('public.op_recetas_id_seq'::regclass);


--
-- Name: op_reclamaciones_ars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_reclamaciones_ars ALTER COLUMN id SET DEFAULT nextval('public.op_reclamaciones_ars_id_seq'::regclass);


--
-- Name: orden_servicio_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio_detalles ALTER COLUMN id SET DEFAULT nextval('public.orden_servicio_detalles_id_seq'::regclass);


--
-- Name: ordenes_mantenimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_mantenimiento ALTER COLUMN id SET DEFAULT nextval('public.ordenes_mantenimiento_id_seq'::regclass);


--
-- Name: ordenes_produccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion ALTER COLUMN id SET DEFAULT nextval('public.ordenes_produccion_id_seq'::regclass);


--
-- Name: ordenes_servicio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio ALTER COLUMN id SET DEFAULT nextval('public.ordenes_servicio_id_seq'::regclass);


--
-- Name: pagos_cobrados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_cobrados ALTER COLUMN id SET DEFAULT nextval('public.pagos_cobrados_id_seq'::regclass);


--
-- Name: pagos_realizados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_realizados ALTER COLUMN id SET DEFAULT nextval('public.pagos_realizados_id_seq'::regclass);


--
-- Name: pagos_suscripcion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_suscripcion ALTER COLUMN id SET DEFAULT nextval('public.pagos_suscripcion_id_seq'::regclass);


--
-- Name: parametros_fiscales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_fiscales ALTER COLUMN id SET DEFAULT nextval('public.parametros_fiscales_id_seq'::regclass);


--
-- Name: periodos_contables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_contables ALTER COLUMN id SET DEFAULT nextval('public.periodos_contables_id_seq'::regclass);


--
-- Name: plan_demanda_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_demanda_lineas ALTER COLUMN id SET DEFAULT nextval('public.plan_demanda_lineas_id_seq'::regclass);


--
-- Name: planes_demanda id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_demanda ALTER COLUMN id SET DEFAULT nextval('public.planes_demanda_id_seq'::regclass);


--
-- Name: planes_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_pago ALTER COLUMN id SET DEFAULT nextval('public.planes_pago_id_seq'::regclass);


--
-- Name: pr_cobranzas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_cobranzas ALTER COLUMN id SET DEFAULT nextval('public.pr_cobranzas_id_seq'::regclass);


--
-- Name: pr_cuotas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_cuotas ALTER COLUMN id SET DEFAULT nextval('public.pr_cuotas_id_seq'::regclass);


--
-- Name: pr_deudores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_deudores ALTER COLUMN id SET DEFAULT nextval('public.pr_deudores_id_seq'::regclass);


--
-- Name: pr_garantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_garantes ALTER COLUMN id SET DEFAULT nextval('public.pr_garantes_id_seq'::regclass);


--
-- Name: pr_garantias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_garantias ALTER COLUMN id SET DEFAULT nextval('public.pr_garantias_id_seq'::regclass);


--
-- Name: pr_pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_pagos ALTER COLUMN id SET DEFAULT nextval('public.pr_pagos_id_seq'::regclass);


--
-- Name: pr_prestamos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_prestamos ALTER COLUMN id SET DEFAULT nextval('public.pr_prestamos_id_seq'::regclass);


--
-- Name: pr_productos_prestamo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_productos_prestamo ALTER COLUMN id SET DEFAULT nextval('public.pr_productos_prestamo_id_seq'::regclass);


--
-- Name: pr_refinanciamientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_refinanciamientos ALTER COLUMN id SET DEFAULT nextval('public.pr_refinanciamientos_id_seq'::regclass);


--
-- Name: pr_solicitudes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_solicitudes ALTER COLUMN id SET DEFAULT nextval('public.pr_solicitudes_id_seq'::regclass);


--
-- Name: pr_vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_vehiculos ALTER COLUMN id SET DEFAULT nextval('public.pr_vehiculos_id_seq'::regclass);


--
-- Name: pre_factura_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_factura_detalles ALTER COLUMN id SET DEFAULT nextval('public.pre_factura_detalles_id_seq'::regclass);


--
-- Name: pre_facturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_facturas ALTER COLUMN id SET DEFAULT nextval('public.pre_facturas_id_seq'::regclass);


--
-- Name: precios_especiales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_especiales ALTER COLUMN id SET DEFAULT nextval('public.precios_especiales_id_seq'::regclass);


--
-- Name: preferencias_usuario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_usuario ALTER COLUMN id SET DEFAULT nextval('public.preferencias_usuario_id_seq'::regclass);


--
-- Name: presupuesto_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_lineas ALTER COLUMN id SET DEFAULT nextval('public.presupuesto_lineas_id_seq'::regclass);


--
-- Name: presupuesto_proyecto_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_proyecto_lineas ALTER COLUMN id SET DEFAULT nextval('public.presupuesto_proyecto_lineas_id_seq'::regclass);


--
-- Name: presupuestos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos ALTER COLUMN id SET DEFAULT nextval('public.presupuestos_id_seq'::regclass);


--
-- Name: pro_forma_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_forma_items ALTER COLUMN id SET DEFAULT nextval('public.pro_forma_items_id_seq'::regclass);


--
-- Name: pro_formas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_formas ALTER COLUMN id SET DEFAULT nextval('public.pro_formas_id_seq'::regclass);


--
-- Name: producto_proveedor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_proveedor ALTER COLUMN id SET DEFAULT nextval('public.producto_proveedor_id_seq'::regclass);


--
-- Name: producto_variantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN id SET DEFAULT nextval('public.producto_variantes_id_seq'::regclass);


--
-- Name: productos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos ALTER COLUMN id SET DEFAULT nextval('public.productos_id_seq'::regclass);


--
-- Name: programa_fidelidad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_fidelidad ALTER COLUMN id SET DEFAULT nextval('public.programa_fidelidad_id_seq'::regclass);


--
-- Name: programas_mantenimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas_mantenimiento ALTER COLUMN id SET DEFAULT nextval('public.programas_mantenimiento_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: proveedores_ecf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores_ecf ALTER COLUMN id SET DEFAULT nextval('public.proveedores_ecf_id_seq'::regclass);


--
-- Name: proyecto_tareas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tareas ALTER COLUMN id SET DEFAULT nextval('public.proyecto_tareas_id_seq'::regclass);


--
-- Name: proyecto_tiempos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tiempos ALTER COLUMN id SET DEFAULT nextval('public.proyecto_tiempos_id_seq'::regclass);


--
-- Name: proyectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos ALTER COLUMN id SET DEFAULT nextval('public.proyectos_id_seq'::regclass);


--
-- Name: recibos_cobro id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos_cobro ALTER COLUMN id SET DEFAULT nextval('public.recibos_cobro_id_seq'::regclass);


--
-- Name: registro_etapas_orden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registro_etapas_orden ALTER COLUMN id SET DEFAULT nextval('public.registro_etapas_orden_id_seq'::regclass);


--
-- Name: registros_capacitacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_capacitacion ALTER COLUMN id SET DEFAULT nextval('public.registros_capacitacion_id_seq'::regclass);


--
-- Name: registros_flota id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_flota ALTER COLUMN id SET DEFAULT nextval('public.registros_flota_id_seq'::regclass);


--
-- Name: regla_distribucion_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regla_distribucion_lineas ALTER COLUMN id SET DEFAULT nextval('public.regla_distribucion_lineas_id_seq'::regclass);


--
-- Name: reglas_comision id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_comision ALTER COLUMN id SET DEFAULT nextval('public.reglas_comision_id_seq'::regclass);


--
-- Name: reglas_descuento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_descuento ALTER COLUMN id SET DEFAULT nextval('public.reglas_descuento_id_seq'::regclass);


--
-- Name: reglas_distribucion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_distribucion ALTER COLUMN id SET DEFAULT nextval('public.reglas_distribucion_id_seq'::regclass);


--
-- Name: reportes_dgii id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_dgii ALTER COLUMN id SET DEFAULT nextval('public.reportes_dgii_id_seq'::regclass);


--
-- Name: reportes_generados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_generados ALTER COLUMN id SET DEFAULT nextval('public.reportes_generados_id_seq'::regclass);


--
-- Name: respuestas_encuesta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_encuesta ALTER COLUMN id SET DEFAULT nextval('public.respuestas_encuesta_id_seq'::regclass);


--
-- Name: resultados_clave id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_clave ALTER COLUMN id SET DEFAULT nextval('public.resultados_clave_id_seq'::regclass);


--
-- Name: retenciones_isr id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retenciones_isr ALTER COLUMN id SET DEFAULT nextval('public.retenciones_isr_id_seq'::regclass);


--
-- Name: retiros_caja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros_caja ALTER COLUMN id SET DEFAULT nextval('public.retiros_caja_id_seq'::regclass);


--
-- Name: rs_areas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_areas ALTER COLUMN id SET DEFAULT nextval('public.rs_areas_id_seq'::regclass);


--
-- Name: rs_categorias_menu id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_categorias_menu ALTER COLUMN id SET DEFAULT nextval('public.rs_categorias_menu_id_seq'::regclass);


--
-- Name: rs_comanda_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_comanda_items ALTER COLUMN id SET DEFAULT nextval('public.rs_comanda_items_id_seq'::regclass);


--
-- Name: rs_comandas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_comandas ALTER COLUMN id SET DEFAULT nextval('public.rs_comandas_id_seq'::regclass);


--
-- Name: rs_combo_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_combo_items ALTER COLUMN id SET DEFAULT nextval('public.rs_combo_items_id_seq'::regclass);


--
-- Name: rs_combos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_combos ALTER COLUMN id SET DEFAULT nextval('public.rs_combos_id_seq'::regclass);


--
-- Name: rs_kds_estaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_kds_estaciones ALTER COLUMN id SET DEFAULT nextval('public.rs_kds_estaciones_id_seq'::regclass);


--
-- Name: rs_menu_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_menu_items ALTER COLUMN id SET DEFAULT nextval('public.rs_menu_items_id_seq'::regclass);


--
-- Name: rs_mesas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_mesas ALTER COLUMN id SET DEFAULT nextval('public.rs_mesas_id_seq'::regclass);


--
-- Name: rs_modificadores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_modificadores ALTER COLUMN id SET DEFAULT nextval('public.rs_modificadores_id_seq'::regclass);


--
-- Name: rs_pedidos_delivery id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_pedidos_delivery ALTER COLUMN id SET DEFAULT nextval('public.rs_pedidos_delivery_id_seq'::regclass);


--
-- Name: rs_propinas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_propinas ALTER COLUMN id SET DEFAULT nextval('public.rs_propinas_id_seq'::regclass);


--
-- Name: rs_reservaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_reservaciones ALTER COLUMN id SET DEFAULT nextval('public.rs_reservaciones_id_seq'::regclass);


--
-- Name: rs_turnos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_turnos ALTER COLUMN id SET DEFAULT nextval('public.rs_turnos_id_seq'::regclass);


--
-- Name: rutas_produccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutas_produccion ALTER COLUMN id SET DEFAULT nextval('public.rutas_produccion_id_seq'::regclass);


--
-- Name: saldo_puntos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldo_puntos ALTER COLUMN id SET DEFAULT nextval('public.saldo_puntos_id_seq'::regclass);


--
-- Name: secuencias_ecf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secuencias_ecf ALTER COLUMN id SET DEFAULT nextval('public.secuencias_ecf_id_seq'::regclass);


--
-- Name: segmentos_cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segmentos_cliente ALTER COLUMN id SET DEFAULT nextval('public.segmentos_cliente_id_seq'::regclass);


--
-- Name: seriales_producto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seriales_producto ALTER COLUMN id SET DEFAULT nextval('public.seriales_producto_id_seq'::regclass);


--
-- Name: sesiones_capacitacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones_capacitacion ALTER COLUMN id SET DEFAULT nextval('public.sesiones_capacitacion_id_seq'::regclass);


--
-- Name: setup_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setup_tokens ALTER COLUMN id SET DEFAULT nextval('public.setup_tokens_id_seq'::regclass);


--
-- Name: solicitud_cambio_plan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cambio_plan ALTER COLUMN id SET DEFAULT nextval('public.solicitud_cambio_plan_id_seq'::regclass);


--
-- Name: solicitud_compra_lineas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_compra_lineas ALTER COLUMN id SET DEFAULT nextval('public.solicitud_compra_lineas_id_seq'::regclass);


--
-- Name: solicitudes_activacion_ecf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_activacion_ecf ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_activacion_ecf_id_seq'::regclass);


--
-- Name: solicitudes_ajuste_inventario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_ajuste_inventario ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_ajuste_inventario_id_seq'::regclass);


--
-- Name: solicitudes_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_compra ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_compra_id_seq'::regclass);


--
-- Name: solicitudes_vacacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_vacacion ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_vacacion_id_seq'::regclass);


--
-- Name: soporte_ticket_adjuntos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_ticket_adjuntos ALTER COLUMN id SET DEFAULT nextval('public.soporte_ticket_adjuntos_id_seq'::regclass);


--
-- Name: soporte_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_tickets ALTER COLUMN id SET DEFAULT nextval('public.soporte_tickets_id_seq'::regclass);


--
-- Name: stock_almacen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_almacen ALTER COLUMN id SET DEFAULT nextval('public.stock_almacen_id_seq'::regclass);


--
-- Name: sucursales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales ALTER COLUMN id SET DEFAULT nextval('public.sucursales_id_seq'::regclass);


--
-- Name: suscripcion_auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripcion_auditoria ALTER COLUMN id SET DEFAULT nextval('public.suscripcion_auditoria_id_seq'::regclass);


--
-- Name: suscripciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones ALTER COLUMN id SET DEFAULT nextval('public.suscripciones_id_seq'::regclass);


--
-- Name: tasas_cambio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_cambio ALTER COLUMN id SET DEFAULT nextval('public.tasas_cambio_id_seq'::regclass);


--
-- Name: terminales_datafono id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminales_datafono ALTER COLUMN id SET DEFAULT nextval('public.terminales_datafono_id_seq'::regclass);


--
-- Name: tickets_soporte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_soporte ALTER COLUMN id SET DEFAULT nextval('public.tickets_soporte_id_seq'::regclass);


--
-- Name: tipos_ecf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_ecf ALTER COLUMN id SET DEFAULT nextval('public.tipos_ecf_id_seq'::regclass);


--
-- Name: tm_catalogo_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_catalogo_servicios ALTER COLUMN id SET DEFAULT nextval('public.tm_catalogo_servicios_id_seq'::regclass);


--
-- Name: tm_checklist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_checklist ALTER COLUMN id SET DEFAULT nextval('public.tm_checklist_id_seq'::regclass);


--
-- Name: tm_citas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_citas ALTER COLUMN id SET DEFAULT nextval('public.tm_citas_id_seq'::regclass);


--
-- Name: tm_diagnosticos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_diagnosticos ALTER COLUMN id SET DEFAULT nextval('public.tm_diagnosticos_id_seq'::regclass);


--
-- Name: tm_historial_mantenimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_historial_mantenimiento ALTER COLUMN id SET DEFAULT nextval('public.tm_historial_mantenimiento_id_seq'::regclass);


--
-- Name: tm_orden_repuestos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_orden_repuestos ALTER COLUMN id SET DEFAULT nextval('public.tm_orden_repuestos_id_seq'::regclass);


--
-- Name: tm_orden_servicios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_orden_servicios ALTER COLUMN id SET DEFAULT nextval('public.tm_orden_servicios_id_seq'::regclass);


--
-- Name: tm_ordenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_ordenes ALTER COLUMN id SET DEFAULT nextval('public.tm_ordenes_id_seq'::regclass);


--
-- Name: tm_tecnicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_tecnicos ALTER COLUMN id SET DEFAULT nextval('public.tm_tecnicos_id_seq'::regclass);


--
-- Name: tm_vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_vehiculos ALTER COLUMN id SET DEFAULT nextval('public.tm_vehiculos_id_seq'::regclass);


--
-- Name: tr_choferes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_choferes ALTER COLUMN id SET DEFAULT nextval('public.tr_choferes_id_seq'::regclass);


--
-- Name: tr_combustible id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_combustible ALTER COLUMN id SET DEFAULT nextval('public.tr_combustible_id_seq'::regclass);


--
-- Name: tr_mantenimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_mantenimiento ALTER COLUMN id SET DEFAULT nextval('public.tr_mantenimiento_id_seq'::regclass);


--
-- Name: tr_vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_vehiculos ALTER COLUMN id SET DEFAULT nextval('public.tr_vehiculos_id_seq'::regclass);


--
-- Name: tr_viajes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_viajes ALTER COLUMN id SET DEFAULT nextval('public.tr_viajes_id_seq'::regclass);


--
-- Name: transacciones_puntos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_puntos ALTER COLUMN id SET DEFAULT nextval('public.transacciones_puntos_id_seq'::regclass);


--
-- Name: transacciones_tarjeta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_tarjeta ALTER COLUMN id SET DEFAULT nextval('public.transacciones_tarjeta_id_seq'::regclass);


--
-- Name: transferencias_almacen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen ALTER COLUMN id SET DEFAULT nextval('public.transferencias_almacen_id_seq'::regclass);


--
-- Name: typeorm_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations ALTER COLUMN id SET DEFAULT nextval('public.typeorm_migrations_id_seq'::regclass);


--
-- Name: unidades_medida id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_medida ALTER COLUMN id SET DEFAULT nextval('public.unidades_medida_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: usuario_empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_empresa ALTER COLUMN id SET DEFAULT nextval('public.usuario_empresa_id_seq'::regclass);


--
-- Name: valores_atributo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_atributo ALTER COLUMN id SET DEFAULT nextval('public.valores_atributo_id_seq'::regclass);


--
-- Name: vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos ALTER COLUMN id SET DEFAULT nextval('public.vehiculos_id_seq'::regclass);


--
-- Name: vendedor_clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes ALTER COLUMN id SET DEFAULT nextval('public.vendedor_clientes_id_seq'::regclass);


--
-- Name: vendedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedores ALTER COLUMN id SET DEFAULT nextval('public.vendedores_id_seq'::regclass);


--
-- Name: videos_tutoriales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_tutoriales ALTER COLUMN id SET DEFAULT nextval('public.videos_tutoriales_id_seq'::regclass);


--
-- Name: wms_lineas_picking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_lineas_picking ALTER COLUMN id SET DEFAULT nextval('public.wms_lineas_picking_id_seq'::regclass);


--
-- Name: wms_ordenes_picking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ordenes_picking ALTER COLUMN id SET DEFAULT nextval('public.wms_ordenes_picking_id_seq'::regclass);


--
-- Name: wms_ubicaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ubicaciones ALTER COLUMN id SET DEFAULT nextval('public.wms_ubicaciones_id_seq'::regclass);


--
-- Name: xlink_documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos ALTER COLUMN id SET DEFAULT nextval('public.xlink_documentos_id_seq'::regclass);


--
-- Name: xlink_mapeos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_mapeos ALTER COLUMN id SET DEFAULT nextval('public.xlink_mapeos_id_seq'::regclass);


--
-- Name: cuentas_por_cobrar PK_002aed62cd79eff526b073e253e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT "PK_002aed62cd79eff526b073e253e" PRIMARY KEY (id);


--
-- Name: retiros_caja PK_00e95a6c4c19adfd8e3114c4370; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros_caja
    ADD CONSTRAINT "PK_00e95a6c4c19adfd8e3114c4370" PRIMARY KEY (id);


--
-- Name: segmentos_cliente PK_00f3f65f91026282019b3c8e7ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segmentos_cliente
    ADD CONSTRAINT "PK_00f3f65f91026282019b3c8e7ce" PRIMARY KEY (id);


--
-- Name: crm_leads PK_023c67e7150b04458c964631db3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT "PK_023c67e7150b04458c964631db3" PRIMARY KEY (id);


--
-- Name: nota_debito_detalles PK_0300dd447c4530ddc3424145fc6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_debito_detalles
    ADD CONSTRAINT "PK_0300dd447c4530ddc3424145fc6" PRIMARY KEY (id);


--
-- Name: cl_ordenes_laboratorio PK_03590e61aa1aed4319ea05e21e3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_ordenes_laboratorio
    ADD CONSTRAINT "PK_03590e61aa1aed4319ea05e21e3" PRIMARY KEY (id);


--
-- Name: op_recetas PK_04525f890da0ab55d37821f1c90; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_recetas
    ADD CONSTRAINT "PK_04525f890da0ab55d37821f1c90" PRIMARY KEY (id);


--
-- Name: productos PK_04f604609a0949a7f3b43400766; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY (id);


--
-- Name: rs_modificadores PK_04fddfbb58441f8a3b0cde67d81; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_modificadores
    ADD CONSTRAINT "PK_04fddfbb58441f8a3b0cde67d81" PRIMARY KEY (id);


--
-- Name: cargos PK_052f813788106484e4ef7cd1745; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT "PK_052f813788106484e4ef7cd1745" PRIMARY KEY (id);


--
-- Name: conversiones_uom PK_06f5427fd23a153fd2009fc89ad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversiones_uom
    ADD CONSTRAINT "PK_06f5427fd23a153fd2009fc89ad" PRIMARY KEY (id);


--
-- Name: tm_tecnicos PK_07b818e472aa70bfb4e33cb433d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_tecnicos
    ADD CONSTRAINT "PK_07b818e472aa70bfb4e33cb433d" PRIMARY KEY (id);


--
-- Name: ed_anios_escolares PK_09448f7973eadf568091dbc2822; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_anios_escolares
    ADD CONSTRAINT "PK_09448f7973eadf568091dbc2822" PRIMARY KEY (id);


--
-- Name: backup_registros PK_0a39cb9812bc1b24cb00acac2e8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_registros
    ADD CONSTRAINT "PK_0a39cb9812bc1b24cb00acac2e8" PRIMARY KEY (id);


--
-- Name: conciliaciones_datafono PK_0a68c9dc0a914e774c049a6b311; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_datafono
    ADD CONSTRAINT "PK_0a68c9dc0a914e774c049a6b311" PRIMARY KEY (id);


--
-- Name: ed_secciones PK_0b4fce5a814f5381cef2dfe09b1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_secciones
    ADD CONSTRAINT "PK_0b4fce5a814f5381cef2dfe09b1" PRIMARY KEY (id);


--
-- Name: ed_comunicados PK_0cfdf548115f2775558cdc06d54; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_comunicados
    ADD CONSTRAINT "PK_0cfdf548115f2775558cdc06d54" PRIMARY KEY (id);


--
-- Name: rutas_produccion PK_0d9ad824dadba81de037ff6c336; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutas_produccion
    ADD CONSTRAINT "PK_0d9ad824dadba81de037ff6c336" PRIMARY KEY (id);


--
-- Name: tr_choferes PK_0e73b0646d9102d141f22513d33; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_choferes
    ADD CONSTRAINT "PK_0e73b0646d9102d141f22513d33" PRIMARY KEY (id);


--
-- Name: nomina_novedades PK_0ecdbfe0f56d9ebc16078907235; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_novedades
    ADD CONSTRAINT "PK_0ecdbfe0f56d9ebc16078907235" PRIMARY KEY (id);


--
-- Name: ed_matriculas PK_1144dc955fa7b84aead333b5c98; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_matriculas
    ADD CONSTRAINT "PK_1144dc955fa7b84aead333b5c98" PRIMARY KEY (id);


--
-- Name: ecf PK_11edb13fbe7c114d593f7147f8e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf
    ADD CONSTRAINT "PK_11edb13fbe7c114d593f7147f8e" PRIMARY KEY (id);


--
-- Name: ed_disciplina PK_12838a4e5be0363cbe9463467f2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_disciplina
    ADD CONSTRAINT "PK_12838a4e5be0363cbe9463467f2" PRIMARY KEY (id);


--
-- Name: etapas_ruta PK_128485e430995fa8a8ea5dd76bc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_ruta
    ADD CONSTRAINT "PK_128485e430995fa8a8ea5dd76bc" PRIMARY KEY (id);


--
-- Name: anticipo_cliente PK_13f1ab782a6a46b75068860fc9b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anticipo_cliente
    ADD CONSTRAINT "PK_13f1ab782a6a46b75068860fc9b" PRIMARY KEY (id);


--
-- Name: cotizaciones_proveedor PK_1417cc5e33162e03f7494ae7d27; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_proveedor
    ADD CONSTRAINT "PK_1417cc5e33162e03f7494ae7d27" PRIMARY KEY (id);


--
-- Name: pr_cuotas PK_158a9c1cb9e4da9cf5e455332dd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_cuotas
    ADD CONSTRAINT "PK_158a9c1cb9e4da9cf5e455332dd" PRIMARY KEY (id);


--
-- Name: parametros_fiscales PK_17a3ce326c01a638cb19a9d7462; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_fiscales
    ADD CONSTRAINT "PK_17a3ce326c01a638cb19a9d7462" PRIMARY KEY (id);


--
-- Name: orden_servicio_detalles PK_18eef87cd7d78a0d0282e67af2a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio_detalles
    ADD CONSTRAINT "PK_18eef87cd7d78a0d0282e67af2a" PRIMARY KEY (id);


--
-- Name: ed_enfermeria PK_193f2cbda5f5869457373266815; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_enfermeria
    ADD CONSTRAINT "PK_193f2cbda5f5869457373266815" PRIMARY KEY (id);


--
-- Name: centros_trabajo PK_1a1446de2d774effe428626198a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_trabajo
    ADD CONSTRAINT "PK_1a1446de2d774effe428626198a" PRIMARY KEY (id);


--
-- Name: audit_logs PK_1bb179d048bbc581caa3b013439; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id);


--
-- Name: centros_costo PK_1c086dfbfdaccf3c734f702d018; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_costo
    ADD CONSTRAINT "PK_1c086dfbfdaccf3c734f702d018" PRIMARY KEY (id);


--
-- Name: declaraciones_itbis PK_1d883e075dd9be9268cc9739e31; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraciones_itbis
    ADD CONSTRAINT "PK_1d883e075dd9be9268cc9739e31" PRIMARY KEY (id);


--
-- Name: proveedores PK_1dcf121f19f362fb1b4c0a493a9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT "PK_1dcf121f19f362fb1b4c0a493a9" PRIMARY KEY (id);


--
-- Name: recibos_cobro PK_1dd0e0d393810ad4b237475e523; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos_cobro
    ADD CONSTRAINT "PK_1dd0e0d393810ad4b237475e523" PRIMARY KEY (id);


--
-- Name: ordenes_produccion PK_1ff59e80fd8c80c161e9ad56ec7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT "PK_1ff59e80fd8c80c161e9ad56ec7" PRIMARY KEY (id);


--
-- Name: producto_variantes PK_20ae34aa8e270776414325962d2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT "PK_20ae34aa8e270776414325962d2" PRIMARY KEY (id);


--
-- Name: mensajes PK_20c919d08249bb93d84ce01beb4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT "PK_20c919d08249bb93d84ce01beb4" PRIMARY KEY (id);


--
-- Name: pr_refinanciamientos PK_218c65b2bbf93e54e563ae4f3b9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_refinanciamientos
    ADD CONSTRAINT "PK_218c65b2bbf93e54e563ae4f3b9" PRIMARY KEY (id);


--
-- Name: transacciones_tarjeta PK_2239aec48826c446c10d67ff9f3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_tarjeta
    ADD CONSTRAINT "PK_2239aec48826c446c10d67ff9f3" PRIMARY KEY (id);


--
-- Name: invitaciones PK_224c1573f98dbf3c1c825bc447f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT "PK_224c1573f98dbf3c1c825bc447f" PRIMARY KEY (id);


--
-- Name: grupos_producto PK_22d43a78cc230489ccc8a098626; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos_producto
    ADD CONSTRAINT "PK_22d43a78cc230489ccc8a098626" PRIMARY KEY (id);


--
-- Name: facturas_recurrentes PK_23d0483677862204fc19fb6a549; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas_recurrentes
    ADD CONSTRAINT "PK_23d0483677862204fc19fb6a549" PRIMARY KEY (id);


--
-- Name: tr_viajes PK_23d3e2c6b97d9686ac40b618577; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_viajes
    ADD CONSTRAINT "PK_23d3e2c6b97d9686ac40b618577" PRIMARY KEY (id);


--
-- Name: configuraciones_cuentas_contables PK_241391db865b352376ae5776cc3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_cuentas_contables
    ADD CONSTRAINT "PK_241391db865b352376ae5776cc3" PRIMARY KEY (id);


--
-- Name: ag_aplicaciones_insumo PK_2423e7c4bebc729eb709665b2c0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_aplicaciones_insumo
    ADD CONSTRAINT "PK_2423e7c4bebc729eb709665b2c0" PRIMARY KEY (id);


--
-- Name: configuracion_bancaria PK_244db81ded9ca81e65c2c49bfc2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_bancaria
    ADD CONSTRAINT "PK_244db81ded9ca81e65c2c49bfc2" PRIMARY KEY (id);


--
-- Name: ed_tutores PK_255f202329b60f1a976e3e538da; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_tutores
    ADD CONSTRAINT "PK_255f202329b60f1a976e3e538da" PRIMARY KEY (id);


--
-- Name: ed_cargos PK_25d7ed7f59295441b23e70f2383; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_cargos
    ADD CONSTRAINT "PK_25d7ed7f59295441b23e70f2383" PRIMARY KEY (id);


--
-- Name: gm_progreso PK_262793d3fd82188cd8fe8dd3194; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_progreso
    ADD CONSTRAINT "PK_262793d3fd82188cd8fe8dd3194" PRIMARY KEY (id);


--
-- Name: compra_detalles PK_275e76dd0e6fc62eee69072fbba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalles
    ADD CONSTRAINT "PK_275e76dd0e6fc62eee69072fbba" PRIMARY KEY (id);


--
-- Name: wms_ubicaciones PK_28969855e8d3a1f87dac8fcbd6f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ubicaciones
    ADD CONSTRAINT "PK_28969855e8d3a1f87dac8fcbd6f" PRIMARY KEY (id);


--
-- Name: almacenes PK_2af9818dc2019bc97c7d26217e1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.almacenes
    ADD CONSTRAINT "PK_2af9818dc2019bc97c7d26217e1" PRIMARY KEY (id);


--
-- Name: gastos PK_2b6965305b864a1ed8e6f6bf586; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos
    ADD CONSTRAINT "PK_2b6965305b864a1ed8e6f6bf586" PRIMARY KEY (id);


--
-- Name: reglas_comision PK_2c922206dd13d351b707afd494c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_comision
    ADD CONSTRAINT "PK_2c922206dd13d351b707afd494c" PRIMARY KEY (id);


--
-- Name: ed_periodos PK_2cb1407f514bfb39eb28d20ad07; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_periodos
    ADD CONSTRAINT "PK_2cb1407f514bfb39eb28d20ad07" PRIMARY KEY (id);


--
-- Name: notas_debito PK_2cc5ed4059033e266865bc77a24; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_debito
    ADD CONSTRAINT "PK_2cc5ed4059033e266865bc77a24" PRIMARY KEY (id);


--
-- Name: ed_biblioteca_libros PK_2d05a8786032fba32e7540e2355; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_biblioteca_libros
    ADD CONSTRAINT "PK_2d05a8786032fba32e7540e2355" PRIMARY KEY (id);


--
-- Name: pr_prestamos PK_2d8aa6e3b4cee7647643bb30903; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_prestamos
    ADD CONSTRAINT "PK_2d8aa6e3b4cee7647643bb30903" PRIMARY KEY (id);


--
-- Name: gm_comidas PK_2dcea98327ce5a5c39a158777a7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_comidas
    ADD CONSTRAINT "PK_2dcea98327ce5a5c39a158777a7" PRIMARY KEY (id);


--
-- Name: tr_vehiculos PK_2e00c35c14629e85ab5ba303143; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_vehiculos
    ADD CONSTRAINT "PK_2e00c35c14629e85ab5ba303143" PRIMARY KEY (id);


--
-- Name: gm_sesiones_ep PK_2f1485f0267ffca100ab1813337; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_sesiones_ep
    ADD CONSTRAINT "PK_2f1485f0267ffca100ab1813337" PRIMARY KEY (id);


--
-- Name: fa_lotes PK_2fc47f370205d9e5ce51ddef06b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_lotes
    ADD CONSTRAINT "PK_2fc47f370205d9e5ce51ddef06b" PRIMARY KEY (id);


--
-- Name: reportes_dgii PK_2fe81d8a62a102dac88c6e91b2d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_dgii
    ADD CONSTRAINT "PK_2fe81d8a62a102dac88c6e91b2d" PRIMARY KEY (id);


--
-- Name: proyecto_tiempos PK_304dc975280671431f93399d52c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tiempos
    ADD CONSTRAINT "PK_304dc975280671431f93399d52c" PRIMARY KEY (id);


--
-- Name: proyecto_tareas PK_30ae50d6a43bd70f5b77605feb4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tareas
    ADD CONSTRAINT "PK_30ae50d6a43bd70f5b77605feb4" PRIMARY KEY (id);


--
-- Name: documentos PK_30b7ee230a352e7582842d1dc02; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT "PK_30b7ee230a352e7582842d1dc02" PRIMARY KEY (id);


--
-- Name: cl_signos_vitales PK_3227be62c53a3d254bfaea609e0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_signos_vitales
    ADD CONSTRAINT "PK_3227be62c53a3d254bfaea609e0" PRIMARY KEY (id);


--
-- Name: crm_oportunidades PK_330f2a9581d8a16d8d68dd94259; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_oportunidades
    ADD CONSTRAINT "PK_330f2a9581d8a16d8d68dd94259" PRIMARY KEY (id);


--
-- Name: op_ordenes_trabajo PK_34b6a4acc700e97587d9a417a3b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_ordenes_trabajo
    ADD CONSTRAINT "PK_34b6a4acc700e97587d9a417a3b" PRIMARY KEY (id);


--
-- Name: plan_configuracion PK_35baa02cd7b71e86c8092fad3a6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_configuracion
    ADD CONSTRAINT "PK_35baa02cd7b71e86c8092fad3a6" PRIMARY KEY (clave);


--
-- Name: tm_vehiculos PK_363d2887f054e51f0385254b1ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_vehiculos
    ADD CONSTRAINT "PK_363d2887f054e51f0385254b1ce" PRIMARY KEY (id);


--
-- Name: ag_fincas PK_368babcfbfff48ef3bc0a800248; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_fincas
    ADD CONSTRAINT "PK_368babcfbfff48ef3bc0a800248" PRIMARY KEY (id);


--
-- Name: regla_distribucion_lineas PK_377f421234e5ad87e4f2b6e0d9b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regla_distribucion_lineas
    ADD CONSTRAINT "PK_377f421234e5ad87e4f2b6e0d9b" PRIMARY KEY (id);


--
-- Name: licitaciones PK_378bbe0c37e96cf8297fb0efa68; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licitaciones
    ADD CONSTRAINT "PK_378bbe0c37e96cf8297fb0efa68" PRIMARY KEY (id);


--
-- Name: ed_cargos_condonaciones PK_38c044122effb819563119b8d30; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_cargos_condonaciones
    ADD CONSTRAINT "PK_38c044122effb819563119b8d30" PRIMARY KEY (id);


--
-- Name: cl_examenes_laboratorio PK_3910ae5073764f331773fdc1075; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_examenes_laboratorio
    ADD CONSTRAINT "PK_3910ae5073764f331773fdc1075" PRIMARY KEY (id);


--
-- Name: planes_pago PK_3949df4c495bd4dc2defed0de09; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_pago
    ADD CONSTRAINT "PK_3949df4c495bd4dc2defed0de09" PRIMARY KEY (id);


--
-- Name: reportes_generados PK_3b5008aab4a89cd50836b71607b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_generados
    ADD CONSTRAINT "PK_3b5008aab4a89cd50836b71607b" PRIMARY KEY (id);


--
-- Name: tr_mantenimiento PK_3bdf68d7241f70aa69092a1e52a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_mantenimiento
    ADD CONSTRAINT "PK_3bdf68d7241f70aa69092a1e52a" PRIMARY KEY (id);


--
-- Name: empresa_modulos PK_3bee06f56dd6a296e9a655f3112; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_modulos
    ADD CONSTRAINT "PK_3bee06f56dd6a296e9a655f3112" PRIMARY KEY (id);


--
-- Name: ag_eventos_animal PK_3d15bbd556504e606dc51ee1c12; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_eventos_animal
    ADD CONSTRAINT "PK_3d15bbd556504e606dc51ee1c12" PRIMARY KEY (id);


--
-- Name: atributos_producto PK_3ef65a763142850af9d1f80be7b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atributos_producto
    ADD CONSTRAINT "PK_3ef65a763142850af9d1f80be7b" PRIMARY KEY (id);


--
-- Name: asiento_lineas PK_40a23d359ef92d0a24708200e61; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asiento_lineas
    ADD CONSTRAINT "PK_40a23d359ef92d0a24708200e61" PRIMARY KEY (id);


--
-- Name: rs_categorias_menu PK_41bacb2601133b1d9825555fb6e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_categorias_menu
    ADD CONSTRAINT "PK_41bacb2601133b1d9825555fb6e" PRIMARY KEY (id);


--
-- Name: seriales_producto PK_4254ff5b4cf04be5d34993b349e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seriales_producto
    ADD CONSTRAINT "PK_4254ff5b4cf04be5d34993b349e" PRIMARY KEY (id);


--
-- Name: op_medicos PK_4290ce6b179e2ce2d64b5f66982; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_medicos
    ADD CONSTRAINT "PK_4290ce6b179e2ce2d64b5f66982" PRIMARY KEY (id);


--
-- Name: terminales_datafono PK_441b7bdd862d0c936845e746042; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminales_datafono
    ADD CONSTRAINT "PK_441b7bdd862d0c936845e746042" PRIMARY KEY (id);


--
-- Name: proyectos PK_4763a49914127cbdde2143db52a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT "PK_4763a49914127cbdde2143db52a" PRIMARY KEY (id);


--
-- Name: presupuestos PK_4a44c11f4d06bd130088d3f696d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos
    ADD CONSTRAINT "PK_4a44c11f4d06bd130088d3f696d" PRIMARY KEY (id);


--
-- Name: ed_asignaturas PK_4a85268f3ee420a56bc95810a9a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_asignaturas
    ADD CONSTRAINT "PK_4a85268f3ee420a56bc95810a9a" PRIMARY KEY (id);


--
-- Name: balanza_patrones PK_4c4a2409097aef96dd8677a2ecb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balanza_patrones
    ADD CONSTRAINT "PK_4c4a2409097aef96dd8677a2ecb" PRIMARY KEY (id);


--
-- Name: ed_pagos PK_4c6e48e95fe84cb5a461ae6dfb5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_pagos
    ADD CONSTRAINT "PK_4c6e48e95fe84cb5a461ae6dfb5" PRIMARY KEY (id);


--
-- Name: ag_animales PK_4ca850ecf208cd3c53a09034d3b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_animales
    ADD CONSTRAINT "PK_4ca850ecf208cd3c53a09034d3b" PRIMARY KEY (id);


--
-- Name: credito_cliente PK_4e2f808d6e24b09eba3e543a7ac; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credito_cliente
    ADD CONSTRAINT "PK_4e2f808d6e24b09eba3e543a7ac" PRIMARY KEY (id);


--
-- Name: planes_demanda PK_4eb6f1614adc7a00c3b07d79c36; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_demanda
    ADD CONSTRAINT "PK_4eb6f1614adc7a00c3b07d79c36" PRIMARY KEY (id);


--
-- Name: movimientos_bancarios PK_4ec4979932f6f220fc52e46f607; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_bancarios
    ADD CONSTRAINT "PK_4ec4979932f6f220fc52e46f607" PRIMARY KEY (id);


--
-- Name: ed_comedor_planes PK_4f501491b177ec640f9f91854f9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_comedor_planes
    ADD CONSTRAINT "PK_4f501491b177ec640f9f91854f9" PRIMARY KEY (id);


--
-- Name: tasas_cambio PK_4f6fd2e25375fbcd6cd245db7f8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_cambio
    ADD CONSTRAINT "PK_4f6fd2e25375fbcd6cd245db7f8" PRIMARY KEY (id);


--
-- Name: cotizaciones PK_4fcc685d6bca9b3a997ba9cd3bc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT "PK_4fcc685d6bca9b3a997ba9cd3bc" PRIMARY KEY (id);


--
-- Name: aprobaciones PK_50da260caa8273612a4220d6330; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aprobaciones
    ADD CONSTRAINT "PK_50da260caa8273612a4220d6330" PRIMARY KEY (id);


--
-- Name: configuraciones_sistema PK_525270e38851bf0ce7434f9cfd7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_sistema
    ADD CONSTRAINT "PK_525270e38851bf0ce7434f9cfd7" PRIMARY KEY (id);


--
-- Name: xlink_documentos PK_52c356f37155db73775ece56616; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos
    ADD CONSTRAINT "PK_52c356f37155db73775ece56616" PRIMARY KEY (id);


--
-- Name: tm_historial_mantenimiento PK_53a3158370130d79e4ef40d0090; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_historial_mantenimiento
    ADD CONSTRAINT "PK_53a3158370130d79e4ef40d0090" PRIMARY KEY (id);


--
-- Name: rs_areas PK_55572f97a2de14239f51b909560; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_areas
    ADD CONSTRAINT "PK_55572f97a2de14239f51b909560" PRIMARY KEY (id);


--
-- Name: crm_actividades PK_55e12e5d75be0d78447fe35d68a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_actividades
    ADD CONSTRAINT "PK_55e12e5d75be0d78447fe35d68a" PRIMARY KEY (id);


--
-- Name: ag_cultivos PK_56c553dd4d64d6a1ae4ed4845ee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_cultivos
    ADD CONSTRAINT "PK_56c553dd4d64d6a1ae4ed4845ee" PRIMARY KEY (id);


--
-- Name: objetivos PK_5907ecf0f9be78475e62917b3ac; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetivos
    ADD CONSTRAINT "PK_5907ecf0f9be78475e62917b3ac" PRIMARY KEY (id);


--
-- Name: ed_evaluaciones PK_5a09b35c47040bf5c73324d00fe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_evaluaciones
    ADD CONSTRAINT "PK_5a09b35c47040bf5c73324d00fe" PRIMARY KEY (id);


--
-- Name: solicitud_cambio_plan PK_5a6c7df8d1fc4d13c5cc7e4d67b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cambio_plan
    ADD CONSTRAINT "PK_5a6c7df8d1fc4d13c5cc7e4d67b" PRIMARY KEY (id);


--
-- Name: pr_solicitudes PK_5bb23c2e17c8b95683dffe7e081; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_solicitudes
    ADD CONSTRAINT "PK_5bb23c2e17c8b95683dffe7e081" PRIMARY KEY (id);


--
-- Name: depreciaciones_activos PK_5c8c6c44e94c45de44ca9073cbf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciaciones_activos
    ADD CONSTRAINT "PK_5c8c6c44e94c45de44ca9073cbf" PRIMARY KEY (id);


--
-- Name: fa_dispensaciones PK_5d21ea9ab9f5ca145c577d1cce6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_dispensaciones
    ADD CONSTRAINT "PK_5d21ea9ab9f5ca145c577d1cce6" PRIMARY KEY (id);


--
-- Name: cl_citas PK_5e5b4df962c4fee309afe17362c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_citas
    ADD CONSTRAINT "PK_5e5b4df962c4fee309afe17362c" PRIMARY KEY (id);


--
-- Name: cl_medicos PK_5f3a3f3a9b60dc66210e365f27b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_medicos
    ADD CONSTRAINT "PK_5f3a3f3a9b60dc66210e365f27b" PRIMARY KEY (id);


--
-- Name: ecf_eventos PK_5fe948e6b29919e3b1be9c84f14; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_eventos
    ADD CONSTRAINT "PK_5fe948e6b29919e3b1be9c84f14" PRIMARY KEY (id);


--
-- Name: evaluaciones_empleado PK_603937ff87743b03a58c6338157; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_empleado
    ADD CONSTRAINT "PK_603937ff87743b03a58c6338157" PRIMARY KEY (id);


--
-- Name: rs_mesas PK_60e2af5e364e76f4973ef78563c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_mesas
    ADD CONSTRAINT "PK_60e2af5e364e76f4973ef78563c" PRIMARY KEY (id);


--
-- Name: stock_almacen PK_62181641a9a6699b16a2ebb620c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_almacen
    ADD CONSTRAINT "PK_62181641a9a6699b16a2ebb620c" PRIMARY KEY (id);


--
-- Name: tipos_ecf PK_62aca8a19534c918ab8044e0cb7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_ecf
    ADD CONSTRAINT "PK_62aca8a19534c918ab8044e0cb7" PRIMARY KEY (id);


--
-- Name: compras PK_63037d5249eefe140e3587ff6f2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT "PK_63037d5249eefe140e3587ff6f2" PRIMARY KEY (id);


--
-- Name: presupuesto_proyecto_lineas PK_633a30eaac7c19c66263d6f8a34; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_proyecto_lineas
    ADD CONSTRAINT "PK_633a30eaac7c19c66263d6f8a34" PRIMARY KEY (id);


--
-- Name: solicitudes_activacion_ecf PK_6341cd2b02f9862f93463528a96; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_activacion_ecf
    ADD CONSTRAINT "PK_6341cd2b02f9862f93463528a96" PRIMARY KEY (id);


--
-- Name: transferencias_almacen PK_664466e7657aeef9143a7dc6f32; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen
    ADD CONSTRAINT "PK_664466e7657aeef9143a7dc6f32" PRIMARY KEY (id);


--
-- Name: dispositivos_conocidos PK_6818a81f255718ba3042022d9c3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos_conocidos
    ADD CONSTRAINT "PK_6818a81f255718ba3042022d9c3" PRIMARY KEY (id);


--
-- Name: tm_orden_servicios PK_6a23b19f0ef3033b05cf477eb7b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_orden_servicios
    ADD CONSTRAINT "PK_6a23b19f0ef3033b05cf477eb7b" PRIMARY KEY (id);


--
-- Name: empresa_ecf_config PK_6ad92e4aaf724b0656f30272d88; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_ecf_config
    ADD CONSTRAINT "PK_6ad92e4aaf724b0656f30272d88" PRIMARY KEY (id);


--
-- Name: solicitud_compra_lineas PK_6ae80a3b0966c109a48c4c90763; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_compra_lineas
    ADD CONSTRAINT "PK_6ae80a3b0966c109a48c4c90763" PRIMARY KEY (id);


--
-- Name: solicitudes_compra PK_6ca8505ed144a7e98a345065b6b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_compra
    ADD CONSTRAINT "PK_6ca8505ed144a7e98a345065b6b" PRIMARY KEY (id);


--
-- Name: cuentas_contables PK_6d2003fd5a3029b89852c6c43fd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_contables
    ADD CONSTRAINT "PK_6d2003fd5a3029b89852c6c43fd" PRIMARY KEY (id);


--
-- Name: departamentos PK_6d34dc0415358a018818c683c1e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT "PK_6d34dc0415358a018818c683c1e" PRIMARY KEY (id);


--
-- Name: pro_formas PK_70d5027f37fc2e463c21739ead7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_formas
    ADD CONSTRAINT "PK_70d5027f37fc2e463c21739ead7" PRIMARY KEY (id);


--
-- Name: nota_credito_compra_detalles PK_7136c643fe4aaeb6030e20390f2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_compra_detalles
    ADD CONSTRAINT "PK_7136c643fe4aaeb6030e20390f2" PRIMARY KEY (id);


--
-- Name: ed_docentes PK_73335eefac36e0514fd8019ee29; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_docentes
    ADD CONSTRAINT "PK_73335eefac36e0514fd8019ee29" PRIMARY KEY (id);


--
-- Name: empleados PK_73a63a6fcb4266219be3eb0ce8a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT "PK_73a63a6fcb4266219be3eb0ce8a" PRIMARY KEY (id);


--
-- Name: ag_labores PK_7413812fd5e471a60b910a9cd72; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_labores
    ADD CONSTRAINT "PK_7413812fd5e471a60b910a9cd72" PRIMARY KEY (id);


--
-- Name: solicitudes_ajuste_inventario PK_74581d470d0dc042393ed61a960; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_ajuste_inventario
    ADD CONSTRAINT "PK_74581d470d0dc042393ed61a960" PRIMARY KEY (id);


--
-- Name: cierres_caja PK_745ea63bc26660d2a5b1b81eac0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_caja
    ADD CONSTRAINT "PK_745ea63bc26660d2a5b1b81eac0" PRIMARY KEY (id);


--
-- Name: fa_devoluciones PK_75c57a5b9d3c9f71aabfd9b9fb4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_devoluciones
    ADD CONSTRAINT "PK_75c57a5b9d3c9f71aabfd9b9fb4" PRIMARY KEY (id);


--
-- Name: ecf_recibidos PK_765077efc7f53c8bd13e76f0a3d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_recibidos
    ADD CONSTRAINT "PK_765077efc7f53c8bd13e76f0a3d" PRIMARY KEY (id);


--
-- Name: ed_transporte_rutas PK_7795f651696353388e733fe1b80; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_transporte_rutas
    ADD CONSTRAINT "PK_7795f651696353388e733fe1b80" PRIMARY KEY (id);


--
-- Name: cursos_capacitacion PK_77a5606aa75bd1ed2d095b4dc68; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos_capacitacion
    ADD CONSTRAINT "PK_77a5606aa75bd1ed2d095b4dc68" PRIMARY KEY (id);


--
-- Name: proveedores_ecf PK_789c44411c28c802c30881405a3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores_ecf
    ADD CONSTRAINT "PK_789c44411c28c802c30881405a3" PRIMARY KEY (id);


--
-- Name: lineas_conteo PK_78a165fe828b8c85fc6ed8e59de; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "PK_78a165fe828b8c85fc6ed8e59de" PRIMARY KEY (id);


--
-- Name: rs_combo_items PK_795cee25574bd4a67e56bba097f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_combo_items
    ADD CONSTRAINT "PK_795cee25574bd4a67e56bba097f" PRIMARY KEY (id);


--
-- Name: cl_catalogo_servicios PK_797746792309997796ae2570b33; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_catalogo_servicios
    ADD CONSTRAINT "PK_797746792309997796ae2570b33" PRIMARY KEY (id);


--
-- Name: videos_tutoriales PK_79d9ee1c7f3c73455a76874e02a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_tutoriales
    ADD CONSTRAINT "PK_79d9ee1c7f3c73455a76874e02a" PRIMARY KEY (id);


--
-- Name: transacciones_puntos PK_79daf6f9bc6dce86d86e8d8982c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_puntos
    ADD CONSTRAINT "PK_79daf6f9bc6dce86d86e8d8982c" PRIMARY KEY (id);


--
-- Name: saldo_puntos PK_7c6af3f21067ebe737ee64fe8d9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldo_puntos
    ADD CONSTRAINT "PK_7c6af3f21067ebe737ee64fe8d9" PRIMARY KEY (id);


--
-- Name: refresh_tokens PK_7d8bee0204106019488c4c50ffa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id);


--
-- Name: rs_menu_items PK_7dec0364fbee7d7ec8ff5205802; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_menu_items
    ADD CONSTRAINT "PK_7dec0364fbee7d7ec8ff5205802" PRIMARY KEY (id);


--
-- Name: nomina_prestamos PK_7f89564f2b52227b0588fa81010; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_prestamos
    ADD CONSTRAINT "PK_7f89564f2b52227b0588fa81010" PRIMARY KEY (id);


--
-- Name: movimientos_inventario PK_812f6e4f95b017981363c4b9ff9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "PK_812f6e4f95b017981363c4b9ff9" PRIMARY KEY (id);


--
-- Name: gm_productos_tienda PK_82a7ef165909d4e8c3045fbbb0f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_productos_tienda
    ADD CONSTRAINT "PK_82a7ef165909d4e8c3045fbbb0f" PRIMARY KEY (id);


--
-- Name: tr_combustible PK_832c6eefdb281a58dba78bb6ae2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tr_combustible
    ADD CONSTRAINT "PK_832c6eefdb281a58dba78bb6ae2" PRIMARY KEY (id);


--
-- Name: gm_rutinas PK_833f45681c66b4187d75b0405ff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutinas
    ADD CONSTRAINT "PK_833f45681c66b4187d75b0405ff" PRIMARY KEY (id);


--
-- Name: ag_maquinaria PK_8453f26820e4aaf8b19a078b772; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_maquinaria
    ADD CONSTRAINT "PK_8453f26820e4aaf8b19a078b772" PRIMARY KEY (id);


--
-- Name: tickets_soporte PK_854b4321b13c5685c72bc5ab80b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets_soporte
    ADD CONSTRAINT "PK_854b4321b13c5685c72bc5ab80b" PRIMARY KEY (id);


--
-- Name: ag_insumos PK_85a076762e494736c6acf46b153; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_insumos
    ADD CONSTRAINT "PK_85a076762e494736c6acf46b153" PRIMARY KEY (id);


--
-- Name: pr_pagos PK_863c0062079dd5d3f4cf891bbd9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_pagos
    ADD CONSTRAINT "PK_863c0062079dd5d3f4cf891bbd9" PRIMARY KEY (id);


--
-- Name: resultados_clave PK_867b610c0101547848d00632000; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_clave
    ADD CONSTRAINT "PK_867b610c0101547848d00632000" PRIMARY KEY (id);


--
-- Name: fa_recepciones PK_86a5e60c84fcb1f8a700cb6e657; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_recepciones
    ADD CONSTRAINT "PK_86a5e60c84fcb1f8a700cb6e657" PRIMARY KEY (id);


--
-- Name: cl_procedimientos PK_88744d301a0455da3e8d383d841; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_procedimientos
    ADD CONSTRAINT "PK_88744d301a0455da3e8d383d841" PRIMARY KEY (id);


--
-- Name: comisiones PK_88764b006b7b1cf80c27bbc8ff8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT "PK_88764b006b7b1cf80c27bbc8ff8" PRIMARY KEY (id);


--
-- Name: op_pacientes PK_88e65ad15c0fdcfee9557f61fee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_pacientes
    ADD CONSTRAINT "PK_88e65ad15c0fdcfee9557f61fee" PRIMARY KEY (id);


--
-- Name: cl_pacientes PK_8924d74cedd23472204299846ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_pacientes
    ADD CONSTRAINT "PK_8924d74cedd23472204299846ce" PRIMARY KEY (id);


--
-- Name: op_inventario PK_898d5f8db5e4271c1b81ce76b18; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_inventario
    ADD CONSTRAINT "PK_898d5f8db5e4271c1b81ce76b18" PRIMARY KEY (id);


--
-- Name: retenciones_isr PK_8a8b852dbee76fba42b5d826d13; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retenciones_isr
    ADD CONSTRAINT "PK_8a8b852dbee76fba42b5d826d13" PRIMARY KEY (id);


--
-- Name: soporte_ticket_adjuntos PK_8b76993f7f2ad5b36e94e4fd5cb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_ticket_adjuntos
    ADD CONSTRAINT "PK_8b76993f7f2ad5b36e94e4fd5cb" PRIMARY KEY (id);


--
-- Name: gm_reservas_clases PK_8d091339d6c9ce7db5e4587ee28; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_reservas_clases
    ADD CONSTRAINT "PK_8d091339d6c9ce7db5e4587ee28" PRIMARY KEY (id);


--
-- Name: op_reclamaciones_ars PK_8d3b212684c52409aa9cdebced2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_reclamaciones_ars
    ADD CONSTRAINT "PK_8d3b212684c52409aa9cdebced2" PRIMARY KEY (id);


--
-- Name: mensajes_lectura PK_8d9ba3fdfe89f509b7af5039c4b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_lectura
    ADD CONSTRAINT "PK_8d9ba3fdfe89f509b7af5039c4b" PRIMARY KEY (id);


--
-- Name: pr_garantes PK_8da2058658ad197581eefb32212; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_garantes
    ADD CONSTRAINT "PK_8da2058658ad197581eefb32212" PRIMARY KEY (id);


--
-- Name: reglas_descuento PK_8ec49aa9af6f054567674fdc59e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_descuento
    ADD CONSTRAINT "PK_8ec49aa9af6f054567674fdc59e" PRIMARY KEY (id);


--
-- Name: ed_asistencia PK_8fbf5a5ef93c248bc78fca17cf3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_asistencia
    ADD CONSTRAINT "PK_8fbf5a5ef93c248bc78fca17cf3" PRIMARY KEY (id);


--
-- Name: pagos_realizados PK_8fe39ef76f5c24b2113df36799b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_realizados
    ADD CONSTRAINT "PK_8fe39ef76f5c24b2113df36799b" PRIMARY KEY (id);


--
-- Name: pre_factura_detalles PK_90ac1ceaba75938352e8b416981; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_factura_detalles
    ADD CONSTRAINT "PK_90ac1ceaba75938352e8b416981" PRIMARY KEY (id);


--
-- Name: conteo_ajustes PK_90f5d2b1ba017fd3315ad749cbf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteo_ajustes
    ADD CONSTRAINT "PK_90f5d2b1ba017fd3315ad749cbf" PRIMARY KEY (id);


--
-- Name: nomina_periodos PK_91873a21286090f197d04aedf41; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_periodos
    ADD CONSTRAINT "PK_91873a21286090f197d04aedf41" PRIMARY KEY (id);


--
-- Name: programa_fidelidad PK_9296417e0ef97573d6d0cb2cce8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_fidelidad
    ADD CONSTRAINT "PK_9296417e0ef97573d6d0cb2cce8" PRIMARY KEY (id);


--
-- Name: wms_ordenes_picking PK_92e02f7e94bcb89f5d3a77c6b9a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ordenes_picking
    ADD CONSTRAINT "PK_92e02f7e94bcb89f5d3a77c6b9a" PRIMARY KEY (id);


--
-- Name: pagos_cobrados PK_93ab0cb19a8eab990578b116adb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_cobrados
    ADD CONSTRAINT "PK_93ab0cb19a8eab990578b116adb" PRIMARY KEY (id);


--
-- Name: gm_rutina_ejercicios PK_93d6a52134b4a493a6eabda6612; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutina_ejercicios
    ADD CONSTRAINT "PK_93d6a52134b4a493a6eabda6612" PRIMARY KEY (id);


--
-- Name: lotes_producto PK_947bc42513ff248a61bd30d8900; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_producto
    ADD CONSTRAINT "PK_947bc42513ff248a61bd30d8900" PRIMARY KEY (id);


--
-- Name: ordenes_servicio PK_949a2ee4e1ed008a7d89ef2a3c6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio
    ADD CONSTRAINT "PK_949a2ee4e1ed008a7d89ef2a3c6" PRIMARY KEY (id);


--
-- Name: ed_config PK_955afd872c32f651d53236dc9e8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_config
    ADD CONSTRAINT "PK_955afd872c32f651d53236dc9e8" PRIMARY KEY (id);


--
-- Name: conciliaciones_bancarias PK_95c4bc608bea8c99a08144bcec7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_bancarias
    ADD CONSTRAINT "PK_95c4bc608bea8c99a08144bcec7" PRIMARY KEY (id);


--
-- Name: devolucion_detalles PK_96da5ade0cd09f242cbfbd01497; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_detalles
    ADD CONSTRAINT "PK_96da5ade0cd09f242cbfbd01497" PRIMARY KEY (id);


--
-- Name: ecf_consumo_ciclo PK_974e9d0ed3f05299b641a6cf216; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_consumo_ciclo
    ADD CONSTRAINT "PK_974e9d0ed3f05299b641a6cf216" PRIMARY KEY (id);


--
-- Name: gm_accesos PK_9789b4c5f9719ee3495666ae1f7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_accesos
    ADD CONSTRAINT "PK_9789b4c5f9719ee3495666ae1f7" PRIMARY KEY (id);


--
-- Name: suscripcion_auditoria PK_97b23c5d8ba0aa94d9aab0961fc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripcion_auditoria
    ADD CONSTRAINT "PK_97b23c5d8ba0aa94d9aab0961fc" PRIMARY KEY (id);


--
-- Name: conduce_detalles PK_97bc17d4151b591c5a8453387fc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduce_detalles
    ADD CONSTRAINT "PK_97bc17d4151b591c5a8453387fc" PRIMARY KEY (id);


--
-- Name: ed_planes_pago PK_980ab6b693000ccda36c1622039; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_planes_pago
    ADD CONSTRAINT "PK_980ab6b693000ccda36c1622039" PRIMARY KEY (id);


--
-- Name: registros_flota PK_994f9e92dc68555a234f54f7b95; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_flota
    ADD CONSTRAINT "PK_994f9e92dc68555a234f54f7b95" PRIMARY KEY (id);


--
-- Name: cotizacion_detalles PK_99f18539e7daa651fc397bcf255; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_detalles
    ADD CONSTRAINT "PK_99f18539e7daa651fc397bcf255" PRIMARY KEY (id);


--
-- Name: pr_productos_prestamo PK_9ac6015a7f1c3900ddca2eb833b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_productos_prestamo
    ADD CONSTRAINT "PK_9ac6015a7f1c3900ddca2eb833b" PRIMARY KEY (id);


--
-- Name: gm_entrenadores PK_9b94e7724e7cf9f30f1bba03fe0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_entrenadores
    ADD CONSTRAINT "PK_9b94e7724e7cf9f30f1bba03fe0" PRIMARY KEY (id);


--
-- Name: fa_reclamaciones_ars PK_9c1058e6a1185d868d668bb1a20; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_reclamaciones_ars
    ADD CONSTRAINT "PK_9c1058e6a1185d868d668bb1a20" PRIMARY KEY (id);


--
-- Name: op_consultas PK_9d3ad62fe2452295a7124981f84; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_consultas
    ADD CONSTRAINT "PK_9d3ad62fe2452295a7124981f84" PRIMARY KEY (id);


--
-- Name: producto_proveedor PK_9d7eb17b15ec2971a26f48a8329; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_proveedor
    ADD CONSTRAINT "PK_9d7eb17b15ec2971a26f48a8329" PRIMARY KEY (id);


--
-- Name: activos_fijos PK_9e35d697c77206742766d52b96d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos_fijos
    ADD CONSTRAINT "PK_9e35d697c77206742766d52b96d" PRIMARY KEY (id);


--
-- Name: conduces PK_9fbdb4ab09fa7e82c19118b314d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduces
    ADD CONSTRAINT "PK_9fbdb4ab09fa7e82c19118b314d" PRIMARY KEY (id);


--
-- Name: balanza_formatos_exportacion PK_9fe963fa8b8ffe628c256cdac68; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balanza_formatos_exportacion
    ADD CONSTRAINT "PK_9fe963fa8b8ffe628c256cdac68" PRIMARY KEY (id);


--
-- Name: tm_citas PK_a0a9246ece77e971b2c3ba77ae7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_citas
    ADD CONSTRAINT "PK_a0a9246ece77e971b2c3ba77ae7" PRIMARY KEY (id);


--
-- Name: fa_alertas PK_a12f10df60b577a8119044673bf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_alertas
    ADD CONSTRAINT "PK_a12f10df60b577a8119044673bf" PRIMARY KEY (id);


--
-- Name: xlink_mapeos PK_a215377f4ce0dc58e8f5e8444d2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_mapeos
    ADD CONSTRAINT "PK_a215377f4ce0dc58e8f5e8444d2" PRIMARY KEY (id);


--
-- Name: conteos_inventario PK_a22db37edb12aea420323bc0a89; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario
    ADD CONSTRAINT "PK_a22db37edb12aea420323bc0a89" PRIMARY KEY (id);


--
-- Name: gm_planes PK_a232cefbe7a48ae17d60bc2eaca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_planes
    ADD CONSTRAINT "PK_a232cefbe7a48ae17d60bc2eaca" PRIMARY KEY (id);


--
-- Name: factura_detalles PK_a246936511706b22cf1b1a2474d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalles
    ADD CONSTRAINT "PK_a246936511706b22cf1b1a2474d" PRIMARY KEY (id);


--
-- Name: nomina_anticipos PK_a38ed426be9ae9ae7ab9289422d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_anticipos
    ADD CONSTRAINT "PK_a38ed426be9ae9ae7ab9289422d" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: pro_forma_items PK_a4007a5f8c6b5a905ab4b63298e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_forma_items
    ADD CONSTRAINT "PK_a4007a5f8c6b5a905ab4b63298e" PRIMARY KEY (id);


--
-- Name: gastos_importacion_lineas PK_a626ff33ee7a00fc0624dd34764; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_importacion_lineas
    ADD CONSTRAINT "PK_a626ff33ee7a00fc0624dd34764" PRIMARY KEY (id);


--
-- Name: vendedores PK_a6b6552f1f5cdae92c9f14e2025; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedores
    ADD CONSTRAINT "PK_a6b6552f1f5cdae92c9f14e2025" PRIMARY KEY (id);


--
-- Name: rs_kds_estaciones PK_a6e9476b5da1dd2ddc3d9673b01; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_kds_estaciones
    ADD CONSTRAINT "PK_a6e9476b5da1dd2ddc3d9673b01" PRIMARY KEY (id);


--
-- Name: ed_niveles PK_a7b7054b801921d631678559d76; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_niveles
    ADD CONSTRAINT "PK_a7b7054b801921d631678559d76" PRIMARY KEY (id);


--
-- Name: ordenes_mantenimiento PK_a80c9c30bc98fa9a7fefdfaf839; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_mantenimiento
    ADD CONSTRAINT "PK_a80c9c30bc98fa9a7fefdfaf839" PRIMARY KEY (id);


--
-- Name: cl_consultas PK_a81c311968840ccf24db5c7e632; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_consultas
    ADD CONSTRAINT "PK_a81c311968840ccf24db5c7e632" PRIMARY KEY (id);


--
-- Name: wms_lineas_picking PK_a83c168caa9c70568a5435645cb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_lineas_picking
    ADD CONSTRAINT "PK_a83c168caa9c70568a5435645cb" PRIMARY KEY (id);


--
-- Name: ed_calificaciones PK_a8ce6963ebf6ba1391438a9e8dc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_calificaciones
    ADD CONSTRAINT "PK_a8ce6963ebf6ba1391438a9e8dc" PRIMARY KEY (id);


--
-- Name: valores_atributo PK_a928353511c610201e1c9a20ff2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_atributo
    ADD CONSTRAINT "PK_a928353511c610201e1c9a20ff2" PRIMARY KEY (id);


--
-- Name: gm_clases PK_a92baeb41781cb750d5240de329; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_clases
    ADD CONSTRAINT "PK_a92baeb41781cb750d5240de329" PRIMARY KEY (id);


--
-- Name: asignaciones_costo PK_a95b9d4603936f67f2bb78f348c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_costo
    ADD CONSTRAINT "PK_a95b9d4603936f67f2bb78f348c" PRIMARY KEY (id);


--
-- Name: tm_checklist PK_aa6bbbd1bfb86e42f3a30e9626f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_checklist
    ADD CONSTRAINT "PK_aa6bbbd1bfb86e42f3a30e9626f" PRIMARY KEY (id);


--
-- Name: cl_autorizaciones_ars PK_ad78ffa6355e4543628d36ec936; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_autorizaciones_ars
    ADD CONSTRAINT "PK_ad78ffa6355e4543628d36ec936" PRIMARY KEY (id);


--
-- Name: pr_deudores PK_aee0b47a8100e39aad64268a250; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_deudores
    ADD CONSTRAINT "PK_aee0b47a8100e39aad64268a250" PRIMARY KEY (id);


--
-- Name: ed_grados PK_af57f3c4c7877c9021883cdc53e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_grados
    ADD CONSTRAINT "PK_af57f3c4c7877c9021883cdc53e" PRIMARY KEY (id);


--
-- Name: movimientos_caja_chica PK_af935b71a3e870b34bd6a4343dc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_caja_chica
    ADD CONSTRAINT "PK_af935b71a3e870b34bd6a4343dc" PRIMARY KEY (id);


--
-- Name: hitos_proyecto PK_b22e95e6eafb857a4ac9a806161; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitos_proyecto
    ADD CONSTRAINT "PK_b22e95e6eafb857a4ac9a806161" PRIMARY KEY (id);


--
-- Name: unidades_medida PK_b299f0e6758c0c02ae3e729232a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades_medida
    ADD CONSTRAINT "PK_b299f0e6758c0c02ae3e729232a" PRIMARY KEY (id);


--
-- Name: notas_credito PK_b2b891a43e393bd403209578ced; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito
    ADD CONSTRAINT "PK_b2b891a43e393bd403209578ced" PRIMARY KEY (id);


--
-- Name: cajas_chicas PK_b36f11b07fc1ad37557b9b3d3e4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cajas_chicas
    ADD CONSTRAINT "PK_b36f11b07fc1ad37557b9b3d3e4" PRIMARY KEY (id);


--
-- Name: rs_pedidos_delivery PK_b3a9731d4d2c65e9f7a9a21f246; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_pedidos_delivery
    ADD CONSTRAINT "PK_b3a9731d4d2c65e9f7a9a21f246" PRIMARY KEY (id);


--
-- Name: tm_diagnosticos PK_b44fcae87a404a1e80c5312a59a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_diagnosticos
    ADD CONSTRAINT "PK_b44fcae87a404a1e80c5312a59a" PRIMARY KEY (id);


--
-- Name: ed_estudiantes PK_b54121326e4d7640e0c92c287bd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_estudiantes
    ADD CONSTRAINT "PK_b54121326e4d7640e0c92c287bd" PRIMARY KEY (id);


--
-- Name: soporte_tickets PK_b5478fa7fd23670532150fac9d6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_tickets
    ADD CONSTRAINT "PK_b5478fa7fd23670532150fac9d6" PRIMARY KEY (id);


--
-- Name: ausencias PK_b6289e2506fb285c569ab3e29cf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias
    ADD CONSTRAINT "PK_b6289e2506fb285c569ab3e29cf" PRIMARY KEY (id);


--
-- Name: ag_cosechas PK_b67a8b0884ebb492e2eaa8c7758; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_cosechas
    ADD CONSTRAINT "PK_b67a8b0884ebb492e2eaa8c7758" PRIMARY KEY (id);


--
-- Name: rs_comandas PK_b796232963963219a4170118789; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_comandas
    ADD CONSTRAINT "PK_b796232963963219a4170118789" PRIMARY KEY (id);


--
-- Name: cheques PK_b87771b4d5f52b7e5bf4498e912; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT "PK_b87771b4d5f52b7e5bf4498e912" PRIMARY KEY (id);


--
-- Name: tm_catalogo_servicios PK_b8e8bec475e8e891c314bb2284b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_catalogo_servicios
    ADD CONSTRAINT "PK_b8e8bec475e8e891c314bb2284b" PRIMARY KEY (id);


--
-- Name: cl_sala_espera PK_b9831a06a1f9d564e1cee9cee0f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_sala_espera
    ADD CONSTRAINT "PK_b9831a06a1f9d564e1cee9cee0f" PRIMARY KEY (id);


--
-- Name: gm_lockers PK_bafe7383d8a49c3904aeeed1eed; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_lockers
    ADD CONSTRAINT "PK_bafe7383d8a49c3904aeeed1eed" PRIMARY KEY (id);


--
-- Name: registros_capacitacion PK_bb3c8c76668dc8d6ede8566b321; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_capacitacion
    ADD CONSTRAINT "PK_bb3c8c76668dc8d6ede8566b321" PRIMARY KEY (id);


--
-- Name: vehiculos PK_bc0b75baae377e599cd46b502e1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT "PK_bc0b75baae377e599cd46b502e1" PRIMARY KEY (id);


--
-- Name: notas_credito_compras PK_bd2986b083d712e3c1a915cec45; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito_compras
    ADD CONSTRAINT "PK_bd2986b083d712e3c1a915cec45" PRIMARY KEY (id);


--
-- Name: secuencias_ecf PK_bd65fb60042897b3edb63a15ff2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secuencias_ecf
    ADD CONSTRAINT "PK_bd65fb60042897b3edb63a15ff2" PRIMARY KEY (id);


--
-- Name: suscripciones PK_bdaed0a0504c9786d45b786a68a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT "PK_bdaed0a0504c9786d45b786a68a" PRIMARY KEY (id);


--
-- Name: fa_dispensacion_items PK_bdf5ca28be2be1650f413056e98; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_dispensacion_items
    ADD CONSTRAINT "PK_bdf5ca28be2be1650f413056e98" PRIMARY KEY (id);


--
-- Name: empresa PK_bee78e8f1760ccf9cff402118a6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT "PK_bee78e8f1760ccf9cff402118a6" PRIMARY KEY (id);


--
-- Name: solicitudes_vacacion PK_c088c35aed08c965d3f6980b104; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_vacacion
    ADD CONSTRAINT "PK_c088c35aed08c965d3f6980b104" PRIMARY KEY (id);


--
-- Name: fa_recepcion_items PK_c1505a6cd137997385434c737ef; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_recepcion_items
    ADD CONSTRAINT "PK_c1505a6cd137997385434c737ef" PRIMARY KEY (id);


--
-- Name: reglas_distribucion PK_c1de96c1b904793e4be82e0ccad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_distribucion
    ADD CONSTRAINT "PK_c1de96c1b904793e4be82e0ccad" PRIMARY KEY (id);


--
-- Name: nota_credito_detalles PK_c1df7434e442449006ae74917f1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_detalles
    ADD CONSTRAINT "PK_c1df7434e442449006ae74917f1" PRIMARY KEY (id);


--
-- Name: fa_medicamentos PK_c21c4df828296cd49582df8111e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_medicamentos
    ADD CONSTRAINT "PK_c21c4df828296cd49582df8111e" PRIMARY KEY (id);


--
-- Name: sucursales PK_c2232960c9e458db5b18d35eeba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT "PK_c2232960c9e458db5b18d35eeba" PRIMARY KEY (id);


--
-- Name: cuentas_por_pagar PK_c236f7d188aebbcdad27535191f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT "PK_c236f7d188aebbcdad27535191f" PRIMARY KEY (id);


--
-- Name: programas_mantenimiento PK_c3d7d85aa9e8af18961af97bfb9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas_mantenimiento
    ADD CONSTRAINT "PK_c3d7d85aa9e8af18961af97bfb9" PRIMARY KEY (id);


--
-- Name: vendedor_clientes PK_c417ea19a7e6c8dba9e5b855dc5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor_clientes
    ADD CONSTRAINT "PK_c417ea19a7e6c8dba9e5b855dc5" PRIMARY KEY (id);


--
-- Name: ed_becas PK_c53019bf2f14f5d6c7dda77259b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_becas
    ADD CONSTRAINT "PK_c53019bf2f14f5d6c7dda77259b" PRIMARY KEY (id);


--
-- Name: preferencias_usuario PK_c6c8f3cd2aea439da76a1edf8d5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_usuario
    ADD CONSTRAINT "PK_c6c8f3cd2aea439da76a1edf8d5" PRIMARY KEY (id);


--
-- Name: cl_receta_medicamentos PK_c86e05a46802bccb52f3a7c6496; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_receta_medicamentos
    ADD CONSTRAINT "PK_c86e05a46802bccb52f3a7c6496" PRIMARY KEY (id);


--
-- Name: nomina_lineas PK_c8c512f24eec25f55ab5e35f5a9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_lineas
    ADD CONSTRAINT "PK_c8c512f24eec25f55ab5e35f5a9" PRIMARY KEY (id);


--
-- Name: alerta_dispositivo_tokens PK_ca859d4fe5addabd2a7b7fc1924; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerta_dispositivo_tokens
    ADD CONSTRAINT "PK_ca859d4fe5addabd2a7b7fc1924" PRIMARY KEY (id);


--
-- Name: demo_requests PK_caebe842f55969080ee55adf186; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT "PK_caebe842f55969080ee55adf186" PRIMARY KEY (id);


--
-- Name: sesiones_capacitacion PK_cc48069bcf9428842931f6cf7d7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones_capacitacion
    ADD CONSTRAINT "PK_cc48069bcf9428842931f6cf7d7" PRIMARY KEY (id);


--
-- Name: pr_vehiculos PK_cd40a977f11e9df3a16e2b1838f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_vehiculos
    ADD CONSTRAINT "PK_cd40a977f11e9df3a16e2b1838f" PRIMARY KEY (id);


--
-- Name: listas_materiales PK_cdcf2c1fd1c9df15f14cf96a8de; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listas_materiales
    ADD CONSTRAINT "PK_cdcf2c1fd1c9df15f14cf96a8de" PRIMARY KEY (id);


--
-- Name: pr_garantias PK_ce2fb1efbe477e853fa73ba0556; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_garantias
    ADD CONSTRAINT "PK_ce2fb1efbe477e853fa73ba0556" PRIMARY KEY (id);


--
-- Name: chequeras PK_ce8730f8b1e18125a8df7b0d83b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chequeras
    ADD CONSTRAINT "PK_ce8730f8b1e18125a8df7b0d83b" PRIMARY KEY (id);


--
-- Name: configuracion_cobros PK_cee0bc3991a8a646c504a3c60a8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_cobros
    ADD CONSTRAINT "PK_cee0bc3991a8a646c504a3c60a8" PRIMARY KEY (id);


--
-- Name: contratos PK_cfae35069d6f59da899c17ed397; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT "PK_cfae35069d6f59da899c17ed397" PRIMARY KEY (id);


--
-- Name: encuestas PK_cff77141e81a3b68a91a37691dd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuestas
    ADD CONSTRAINT "PK_cff77141e81a3b68a91a37691dd" PRIMARY KEY (id);


--
-- Name: presupuesto_lineas PK_d27cd37914c309bd382841b7c42; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_lineas
    ADD CONSTRAINT "PK_d27cd37914c309bd382841b7c42" PRIMARY KEY (id);


--
-- Name: cuentas_bancarias PK_d2f7102bbd713a134c287c07dbf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias
    ADD CONSTRAINT "PK_d2f7102bbd713a134c287c07dbf" PRIMARY KEY (id);


--
-- Name: ag_parcelas PK_d35858f60f83d0821efe5e25d2c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_parcelas
    ADD CONSTRAINT "PK_d35858f60f83d0821efe5e25d2c" PRIMARY KEY (id);


--
-- Name: respuestas_encuesta PK_d37a66a93ddeaadcd679df46193; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_encuesta
    ADD CONSTRAINT "PK_d37a66a93ddeaadcd679df46193" PRIMARY KEY (id);


--
-- Name: ed_pagos_detalle PK_d4394aabcf349e604b94fb51779; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_pagos_detalle
    ADD CONSTRAINT "PK_d4394aabcf349e604b94fb51779" PRIMARY KEY (id);


--
-- Name: rs_combos PK_d593fff62d9db8e3106d7c34572; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_combos
    ADD CONSTRAINT "PK_d593fff62d9db8e3106d7c34572" PRIMARY KEY (id);


--
-- Name: ed_notas_periodo PK_d5f183db27043e761c69cca03a3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_notas_periodo
    ADD CONSTRAINT "PK_d5f183db27043e761c69cca03a3" PRIMARY KEY (id);


--
-- Name: asientos_contables PK_d65d3bfd43da26ef441362c0a35; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asientos_contables
    ADD CONSTRAINT "PK_d65d3bfd43da26ef441362c0a35" PRIMARY KEY (id);


--
-- Name: clientes PK_d76bf3571d906e4e86470482c08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY (id);


--
-- Name: movimientos_estadisticos PK_d858df7e34a954ed74a91debbec; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_estadisticos
    ADD CONSTRAINT "PK_d858df7e34a954ed74a91debbec" PRIMARY KEY (id);


--
-- Name: gm_schedule PK_d869046b89b8e88801bb92d5aca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_schedule
    ADD CONSTRAINT "PK_d869046b89b8e88801bb92d5aca" PRIMARY KEY (id);


--
-- Name: contratos_laborales PK_d8ecc659fc704d18c333de571b7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_laborales
    ADD CONSTRAINT "PK_d8ecc659fc704d18c333de571b7" PRIMARY KEY (id);


--
-- Name: plan_demanda_lineas PK_d92396b9dcd010d14a3b66ba0c3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_demanda_lineas
    ADD CONSTRAINT "PK_d92396b9dcd010d14a3b66ba0c3" PRIMARY KEY (id);


--
-- Name: cuenta_anexo_ir2 PK_d9cd31ce6fea291903f0e95b65e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_anexo_ir2
    ADD CONSTRAINT "PK_d9cd31ce6fea291903f0e95b65e" PRIMARY KEY (id);


--
-- Name: depositos_bancarios PK_db427e2eed49aabf1b3a1f352bb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depositos_bancarios
    ADD CONSTRAINT "PK_db427e2eed49aabf1b3a1f352bb" PRIMARY KEY (id);


--
-- Name: gm_miembros PK_dbf06a8ed0fc1cbe8b000a28166; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_miembros
    ADD CONSTRAINT "PK_dbf06a8ed0fc1cbe8b000a28166" PRIMARY KEY (id);


--
-- Name: pagos_suscripcion PK_dcd170ab606e7a1772a1ceb3796; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_suscripcion
    ADD CONSTRAINT "PK_dcd170ab606e7a1772a1ceb3796" PRIMARY KEY (id);


--
-- Name: pr_cobranzas PK_ddee0f9adff41b6dab594699848; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pr_cobranzas
    ADD CONSTRAINT "PK_ddee0f9adff41b6dab594699848" PRIMARY KEY (id);


--
-- Name: categorias_activos PK_ddf91c7d34168fc4bc2de025603; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_activos
    ADD CONSTRAINT "PK_ddf91c7d34168fc4bc2de025603" PRIMARY KEY (id);


--
-- Name: pre_facturas PK_e22ec19caf3bb2e568f1e7fb787; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_facturas
    ADD CONSTRAINT "PK_e22ec19caf3bb2e568f1e7fb787" PRIMARY KEY (id);


--
-- Name: rs_reservaciones PK_e3e8299f60f5e1adc398b420b09; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_reservaciones
    ADD CONSTRAINT "PK_e3e8299f60f5e1adc398b420b09" PRIMARY KEY (id);


--
-- Name: bancos_conciliacion PK_e438b84a9e64c4d0ad1574ffd36; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos_conciliacion
    ADD CONSTRAINT "PK_e438b84a9e64c4d0ad1574ffd36" PRIMARY KEY (id);


--
-- Name: notificaciones_enviadas PK_e44b137853298eb9bf749b6db02; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_enviadas
    ADD CONSTRAINT "PK_e44b137853298eb9bf749b6db02" PRIMARY KEY (id);


--
-- Name: tm_orden_repuestos PK_e63a251e7ed819779bc2c1ea23c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_orden_repuestos
    ADD CONSTRAINT "PK_e63a251e7ed819779bc2c1ea23c" PRIMARY KEY (id);


--
-- Name: precios_especiales PK_e75f3160ea876b2ba66cd89dc86; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_especiales
    ADD CONSTRAINT "PK_e75f3160ea876b2ba66cd89dc86" PRIMARY KEY (id);


--
-- Name: ag_ciclos PK_e79d7edf79fbfe4847eef475ece; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ag_ciclos
    ADD CONSTRAINT "PK_e79d7edf79fbfe4847eef475ece" PRIMARY KEY (id);


--
-- Name: gastos_importacion PK_e97d2b29cf4bec16859e5e282a4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_importacion
    ADD CONSTRAINT "PK_e97d2b29cf4bec16859e5e282a4" PRIMARY KEY (id);


--
-- Name: rs_comanda_items PK_ea5bd790dfd8d8648044e39a04e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_comanda_items
    ADD CONSTRAINT "PK_ea5bd790dfd8d8648044e39a04e" PRIMARY KEY (id);


--
-- Name: periodos_contables PK_eec5c11a948dae88afd9d692585; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_contables
    ADD CONSTRAINT "PK_eec5c11a948dae88afd9d692585" PRIMARY KEY (id);


--
-- Name: tm_ordenes PK_efe36543cc3945d509590994e90; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_ordenes
    ADD CONSTRAINT "PK_efe36543cc3945d509590994e90" PRIMARY KEY (id);


--
-- Name: ed_estudiante_becas PK_f013270357778e171ef2ffb52ae; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_estudiante_becas
    ADD CONSTRAINT "PK_f013270357778e171ef2ffb52ae" PRIMARY KEY (id);


--
-- Name: rs_propinas PK_f1de5e8f9e34c361c944a166e57; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_propinas
    ADD CONSTRAINT "PK_f1de5e8f9e34c361c944a166e57" PRIMARY KEY (id);


--
-- Name: ed_biblioteca_prestamos PK_f21b65c64ec6f385e3fb8a5ff1e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ed_biblioteca_prestamos
    ADD CONSTRAINT "PK_f21b65c64ec6f385e3fb8a5ff1e" PRIMARY KEY (id);


--
-- Name: cl_recetas PK_f2bcf1413c880f2a92dd924af45; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cl_recetas
    ADD CONSTRAINT "PK_f2bcf1413c880f2a92dd924af45" PRIMARY KEY (id);


--
-- Name: facturas PK_f302947c1e4773639b20707a8bc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT "PK_f302947c1e4773639b20707a8bc" PRIMARY KEY (id);


--
-- Name: gm_membresias PK_f3d418c8b642f5dee4125ea1939; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_membresias
    ADD CONSTRAINT "PK_f3d418c8b642f5dee4125ea1939" PRIMARY KEY (id);


--
-- Name: usuario_empresa PK_f3ec4943ff70f8567cf5e63182c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_empresa
    ADD CONSTRAINT "PK_f3ec4943ff70f8567cf5e63182c" PRIMARY KEY (id);


--
-- Name: cotizacion_proveedor_lineas PK_f57d6c784c25d72668ae42a6565; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_proveedor_lineas
    ADD CONSTRAINT "PK_f57d6c784c25d72668ae42a6565" PRIMARY KEY (id);


--
-- Name: rs_turnos PK_f6d10c5bbd374d7dcae5a7145f8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rs_turnos
    ADD CONSTRAINT "PK_f6d10c5bbd374d7dcae5a7145f8" PRIMARY KEY (id);


--
-- Name: modulos_addon PK_f81be3a6b13b014cece88294d69; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_addon
    ADD CONSTRAINT "PK_f81be3a6b13b014cece88294d69" PRIMARY KEY (id);


--
-- Name: cuentas_estadisticas PK_fab70d8551c196f61ec4d31d53d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_estadisticas
    ADD CONSTRAINT "PK_fab70d8551c196f61ec4d31d53d" PRIMARY KEY (id);


--
-- Name: cuotas PK_fb728d76452f13f226db1943bdb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT "PK_fb728d76452f13f226db1943bdb" PRIMARY KEY (id);


--
-- Name: gm_rutina_dias PK_fb84b949a791dbc9c01c739f589; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_rutina_dias
    ADD CONSTRAINT "PK_fb84b949a791dbc9c01c739f589" PRIMARY KEY (id);


--
-- Name: registro_etapas_orden PK_fbcec071c8a0c6aee5948f295cf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registro_etapas_orden
    ADD CONSTRAINT "PK_fbcec071c8a0c6aee5948f295cf" PRIMARY KEY (id);


--
-- Name: gm_planes_nutricionales PK_fc6a99e0081967ff76238c2532a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_planes_nutricionales
    ADD CONSTRAINT "PK_fc6a99e0081967ff76238c2532a" PRIMARY KEY (id);


--
-- Name: componentes_lm PK_fcc6dea83c88c0e9239afb6167f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.componentes_lm
    ADD CONSTRAINT "PK_fcc6dea83c88c0e9239afb6167f" PRIMARY KEY (id);


--
-- Name: fa_control_narcoticos PK_fd201b9a17106b540682fe68b78; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_control_narcoticos
    ADD CONSTRAINT "PK_fd201b9a17106b540682fe68b78" PRIMARY KEY (id);


--
-- Name: op_citas PK_fe2f401aa668358f1d9f33956c8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.op_citas
    ADD CONSTRAINT "PK_fe2f401aa668358f1d9f33956c8" PRIMARY KEY (id);


--
-- Name: devoluciones PK_feb81d67019ea7b8f09eb54ec33; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT "PK_feb81d67019ea7b8f09eb54ec33" PRIMARY KEY (id);


--
-- Name: cuentas_por_cobrar REL_00ab057fdbc6d10cd1c930c07e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT "REL_00ab057fdbc6d10cd1c930c07e" UNIQUE ("facturaId");


--
-- Name: cuentas_por_pagar REL_6c38073a5d80af801a8ee87be2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT "REL_6c38073a5d80af801a8ee87be2" UNIQUE ("compraId");


--
-- Name: cotizaciones REL_cf47e975a1b4583dc3eb4323c3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT "REL_cf47e975a1b4583dc3eb4323c3" UNIQUE ("facturaId");


--
-- Name: devoluciones UQ_087baf824ec23905ebd35a6128c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT "UQ_087baf824ec23905ebd35a6128c" UNIQUE (numero);


--
-- Name: tipos_ecf UQ_19bc78101ec95ad08e2ab76d343; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_ecf
    ADD CONSTRAINT "UQ_19bc78101ec95ad08e2ab76d343" UNIQUE (codigo);


--
-- Name: mensajes_lectura UQ_235ffd184f67b6a0fc2f3e5d901; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_lectura
    ADD CONSTRAINT "UQ_235ffd184f67b6a0fc2f3e5d901" UNIQUE ("mensajeId", "usuarioId");


--
-- Name: alerta_dispositivo_tokens UQ_38eadf1a862841bc805f80dfeb1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerta_dispositivo_tokens
    ADD CONSTRAINT "UQ_38eadf1a862841bc805f80dfeb1" UNIQUE ("tokenHash");


--
-- Name: empresa_ecf_config UQ_56de466aaf8eaee99f824050ad3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_ecf_config
    ADD CONSTRAINT "UQ_56de466aaf8eaee99f824050ad3" UNIQUE ("empresaId");


--
-- Name: producto_proveedor UQ_5886917f4894d6f575d1db24295; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_proveedor
    ADD CONSTRAINT "UQ_5886917f4894d6f575d1db24295" UNIQUE ("empresaId", "productoId", "proveedorId");


--
-- Name: ecf_recibidos UQ_7c12d631b186d1e3ba5a9dfa1be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_recibidos
    ADD CONSTRAINT "UQ_7c12d631b186d1e3ba5a9dfa1be" UNIQUE ("empresaId", encf);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: stock_almacen UQ_9f1395f3378e0a4e4660992046c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_almacen
    ADD CONSTRAINT "UQ_9f1395f3378e0a4e4660992046c" UNIQUE ("almacenId", "productoId");


--
-- Name: transferencias_almacen UQ_b94913c2366836dfd087f7cfed3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen
    ADD CONSTRAINT "UQ_b94913c2366836dfd087f7cfed3" UNIQUE (numero);


--
-- Name: videos_tutoriales UQ_caeebbe29a03999b693194a2375; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_tutoriales
    ADD CONSTRAINT "UQ_caeebbe29a03999b693194a2375" UNIQUE (modulo);


--
-- Name: cierres_caja UQ_caja_fecha_vendedor; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres_caja
    ADD CONSTRAINT "UQ_caja_fecha_vendedor" UNIQUE (fecha, "vendedorId");


--
-- Name: modulos_addon UQ_cea649884d1a1759fb2c0d44698; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos_addon
    ADD CONSTRAINT "UQ_cea649884d1a1759fb2c0d44698" UNIQUE (codigo);


--
-- Name: configuraciones_cuentas_contables UQ_d38c72b405bb82f17b9c6836f92; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_cuentas_contables
    ADD CONSTRAINT "UQ_d38c72b405bb82f17b9c6836f92" UNIQUE ("empresaId", concepto);


--
-- Name: empresa UQ_dc4fc232e8015781e24791c2878; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT "UQ_dc4fc232e8015781e24791c2878" UNIQUE (rnc);


--
-- Name: ordenes_mantenimiento UQ_dec175756e08680f48b4a2382db; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_mantenimiento
    ADD CONSTRAINT "UQ_dec175756e08680f48b4a2382db" UNIQUE (numero);


--
-- Name: encuestas UQ_dfbda2657fcc00aa4bc9211677b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encuestas
    ADD CONSTRAINT "UQ_dfbda2657fcc00aa4bc9211677b" UNIQUE ("tokenPublico");


--
-- Name: tm_checklist UQ_e3ffea89b9975e131f29d2f9e5d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tm_checklist
    ADD CONSTRAINT "UQ_e3ffea89b9975e131f29d2f9e5d" UNIQUE ("ordenId");


--
-- Name: ordenes_produccion UQ_e7cbe6fb5898d3560afcb2ecc15; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT "UQ_e7cbe6fb5898d3560afcb2ecc15" UNIQUE (numero);


--
-- Name: gm_reservas_clases UQ_e8bacc0a72f1530304dcac4dc4c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gm_reservas_clases
    ADD CONSTRAINT "UQ_e8bacc0a72f1530304dcac4dc4c" UNIQUE ("miembroId", "scheduleId", fecha);


--
-- Name: invitaciones UQ_eec7069e2883bb38a63800f8214; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT "UQ_eec7069e2883bb38a63800f8214" UNIQUE (token);


--
-- Name: centros_costo UQ_f25d410b49cd8e31a9df28826fb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_costo
    ADD CONSTRAINT "UQ_f25d410b49cd8e31a9df28826fb" UNIQUE (codigo);


--
-- Name: clientes UQ_f54a872b04d5c02d461d8338f73; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT "UQ_f54a872b04d5c02d461d8338f73" UNIQUE ("portalToken");


--
-- Name: listas_materiales UQ_fa884f456da42ec4360b856aff7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listas_materiales
    ADD CONSTRAINT "UQ_fa884f456da42ec4360b856aff7" UNIQUE (codigo);


--
-- Name: configuraciones_sistema UQ_ffcb466ee6c9b2591b9dc6b7f3b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuraciones_sistema
    ADD CONSTRAINT "UQ_ffcb466ee6c9b2591b9dc6b7f3b" UNIQUE (clave);


--
-- Name: sucursales UQ_sucursal_codigo_empresa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT "UQ_sucursal_codigo_empresa" UNIQUE (codigo, "empresaId");


--
-- Name: _bak_1769200000000_cxc_huerfanas _bak_1769200000000_cxc_huerfanas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._bak_1769200000000_cxc_huerfanas
    ADD CONSTRAINT _bak_1769200000000_cxc_huerfanas_pkey PRIMARY KEY ("cxcId");


--
-- Name: contadores_secuencia contadores_secuencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contadores_secuencia
    ADD CONSTRAINT contadores_secuencia_pkey PRIMARY KEY ("empresaId", tipo);


--
-- Name: cw_adelantos cw_adelantos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_adelantos
    ADD CONSTRAINT cw_adelantos_pkey PRIMARY KEY (id);


--
-- Name: cw_comisiones cw_comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_comisiones
    ADD CONSTRAINT cw_comisiones_pkey PRIMARY KEY (id);


--
-- Name: cw_config cw_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_config
    ADD CONSTRAINT cw_config_pkey PRIMARY KEY (id);


--
-- Name: cw_contador_turno cw_contador_turno_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_contador_turno
    ADD CONSTRAINT cw_contador_turno_pkey PRIMARY KEY ("empresaId", "sucursalId", "fechaRD");


--
-- Name: cw_lavadores cw_lavadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_lavadores
    ADD CONSTRAINT cw_lavadores_pkey PRIMARY KEY (id);


--
-- Name: cw_liquidaciones cw_liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_liquidaciones
    ADD CONSTRAINT cw_liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: cw_servicio_precios cw_servicio_precios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_servicio_precios
    ADD CONSTRAINT cw_servicio_precios_pkey PRIMARY KEY (id);


--
-- Name: cw_servicios cw_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_servicios
    ADD CONSTRAINT cw_servicios_pkey PRIMARY KEY (id);


--
-- Name: cw_turno_eventos cw_turno_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_eventos
    ADD CONSTRAINT cw_turno_eventos_pkey PRIMARY KEY (id);


--
-- Name: cw_turno_fotos cw_turno_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_fotos
    ADD CONSTRAINT cw_turno_fotos_pkey PRIMARY KEY (id);


--
-- Name: cw_turno_lavadores cw_turno_lavadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_lavadores
    ADD CONSTRAINT cw_turno_lavadores_pkey PRIMARY KEY (id);


--
-- Name: cw_turno_servicios cw_turno_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_servicios
    ADD CONSTRAINT cw_turno_servicios_pkey PRIMARY KEY (id);


--
-- Name: cw_turnos cw_turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turnos
    ADD CONSTRAINT cw_turnos_pkey PRIMARY KEY (id);


--
-- Name: setup_tokens setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setup_tokens
    ADD CONSTRAINT setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: setup_tokens setup_tokens_tokenHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setup_tokens
    ADD CONSTRAINT "setup_tokens_tokenHash_key" UNIQUE ("tokenHash");


--
-- Name: token_blacklist token_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_blacklist
    ADD CONSTRAINT token_blacklist_pkey PRIMARY KEY (jti);


--
-- Name: typeorm_migrations typeorm_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typeorm_migrations
    ADD CONSTRAINT typeorm_migrations_pkey PRIMARY KEY (id);


--
-- Name: cw_config uq_cw_config_empresa_sucursal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_config
    ADD CONSTRAINT uq_cw_config_empresa_sucursal UNIQUE ("empresaId", "sucursalId");


--
-- Name: cw_servicio_precios uq_cw_servicio_precio; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_servicio_precios
    ADD CONSTRAINT uq_cw_servicio_precio UNIQUE ("servicioId", "tipoVehiculo");


--
-- Name: cw_turnos uq_cw_turno_codigo_dia; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turnos
    ADD CONSTRAINT uq_cw_turno_codigo_dia UNIQUE ("empresaId", "sucursalId", "fechaRD", "numeroDia");


--
-- Name: cw_turno_lavadores uq_cw_turno_lavador; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turno_lavadores
    ADD CONSTRAINT uq_cw_turno_lavador UNIQUE ("turnoId", "lavadorId");


--
-- Name: cw_turnos uq_cw_turno_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cw_turnos
    ADD CONSTRAINT uq_cw_turno_token UNIQUE ("tokenPublico");


--
-- Name: xlink_documentos uq_xlink_doc_origen; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos
    ADD CONSTRAINT uq_xlink_doc_origen UNIQUE ("origenEmpresaId", "tipoDocumento", "documentoOrigenId");


--
-- Name: xlink_mapeos uq_xlink_mapeo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_mapeos
    ADD CONSTRAINT uq_xlink_mapeo UNIQUE ("empresaId", "contraparteXlinkId", tipo, "valorExterno");


--
-- Name: IDX_01f3749604ea4cdd29cc6d37e3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_01f3749604ea4cdd29cc6d37e3" ON public.precios_especiales USING btree ("empresaId");


--
-- Name: IDX_02009891f9a6ce3233ad2b8d76; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_02009891f9a6ce3233ad2b8d76" ON public.transacciones_puntos USING btree ("empresaId", "clienteId");


--
-- Name: IDX_02a07de88807dd2b10a2654725; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_02a07de88807dd2b10a2654725" ON public.vendedor_clientes USING btree ("empresaId", "clienteId");


--
-- Name: IDX_0349316c4ba02d9611b1384907; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0349316c4ba02d9611b1384907" ON public.seriales_producto USING btree ("empresaId", "numeroSerie");


--
-- Name: IDX_0427d3ca57345bf85408bfb44b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0427d3ca57345bf85408bfb44b" ON public.movimientos_inventario USING btree ("empresaId", "productoId");


--
-- Name: IDX_0626b69c743975fac30c3d9730; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0626b69c743975fac30c3d9730" ON public.cuentas_bancarias USING btree ("empresaId", "isActive");


--
-- Name: IDX_073d3578f07c6eb6e68e1cf252; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_073d3578f07c6eb6e68e1cf252" ON public.periodos_contables USING btree ("empresaId", anio, mes);


--
-- Name: IDX_0777d041bc98cc00550b476eab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0777d041bc98cc00550b476eab" ON public.asientos_contables USING btree ("empresaId");


--
-- Name: IDX_07dfc792a60db7e1ffd528099a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_07dfc792a60db7e1ffd528099a" ON public.notas_credito_compras USING btree ("empresaId", "isActive");


--
-- Name: IDX_08c81672216bfd344090b97f8e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_08c81672216bfd344090b97f8e" ON public.grupos_producto USING btree ("empresaId");


--
-- Name: IDX_09b174c1c4a6c16ba1925b5cd3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_09b174c1c4a6c16ba1925b5cd3" ON public.proyectos USING btree ("empresaId", estado);


--
-- Name: IDX_0be602846f141363925ab57848; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0be602846f141363925ab57848" ON public.conteos_inventario USING btree ("empresaId", "almacenId");


--
-- Name: IDX_0c6c4f68b5a0b47c8d6f54ec2e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0c6c4f68b5a0b47c8d6f54ec2e" ON public.conteo_ajustes USING btree ("movimientoId");


--
-- Name: IDX_0d8fba5f8c0c47ed1deff367fd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0d8fba5f8c0c47ed1deff367fd" ON public.movimientos_bancarios USING btree ("empresaId");


--
-- Name: IDX_0e36e594e955838b4e42a464f3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0e36e594e955838b4e42a464f3" ON public.wms_ordenes_picking USING btree ("empresaId", estado);


--
-- Name: IDX_0e88804064a62ac8d8eeb52911; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0e88804064a62ac8d8eeb52911" ON public.notas_debito USING btree ("empresaId");


--
-- Name: IDX_0e8b2a0ab501b6c9d127bf6864; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0e8b2a0ab501b6c9d127bf6864" ON public.facturas USING btree ("empresaId", "createdAt");


--
-- Name: IDX_0f22346776ac024ce1c4217acb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_0f22346776ac024ce1c4217acb" ON public.gastos USING btree ("empresaId", "isActive");


--
-- Name: IDX_10a4ad3c1afc20810ac27c5645; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_10a4ad3c1afc20810ac27c5645" ON public.centros_trabajo USING btree ("empresaId");


--
-- Name: IDX_111fc606ef9d34ab6dab75e1f6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_111fc606ef9d34ab6dab75e1f6" ON public.unidades_medida USING btree ("empresaId", "isActive");


--
-- Name: IDX_116411f010c42c400573bc42a4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_116411f010c42c400573bc42a4" ON public.ecf_eventos USING btree ("comprobanteId");


--
-- Name: IDX_118644fdaff6fa04a3373e976c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_118644fdaff6fa04a3373e976c" ON public.transacciones_tarjeta USING btree ("empresaId");


--
-- Name: IDX_127b3d11ea4435ca1761d273e5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_127b3d11ea4435ca1761d273e5" ON public.solicitudes_ajuste_inventario USING btree ("empresaId");


--
-- Name: IDX_1431ac58a04093e6dbd63ea008; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1431ac58a04093e6dbd63ea008" ON public.respuestas_encuesta USING btree ("empresaId");


--
-- Name: IDX_14727521c2a394b16689be3f31; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_14727521c2a394b16689be3f31" ON public.tasas_cambio USING btree ("empresaId", moneda, fecha);


--
-- Name: IDX_14d591ab41dc71a817a18b6491; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_14d591ab41dc71a817a18b6491" ON public.empleados USING btree ("empresaId", cedula);


--
-- Name: IDX_157999cf5f7dab115be7c50b0a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_157999cf5f7dab115be7c50b0a" ON public.lineas_conteo USING btree ("empresaId", "estadoLinea");


--
-- Name: IDX_16f3513f682b28bc386bb346c2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_16f3513f682b28bc386bb346c2" ON public.cursos_capacitacion USING btree ("empresaId");


--
-- Name: IDX_17151abb704d5c5dbc532144a0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_17151abb704d5c5dbc532144a0" ON public.soporte_ticket_adjuntos USING btree ("ticketId");


--
-- Name: IDX_173570d488513d7151fcce6ec0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_173570d488513d7151fcce6ec0" ON public.conteos_inventario USING btree ("empresaId", "isActive");


--
-- Name: IDX_1777725f687b02357a4e24f336; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1777725f687b02357a4e24f336" ON public.parametros_fiscales USING btree (clave);


--
-- Name: IDX_195d169e4d4abf2b670cb6996b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_195d169e4d4abf2b670cb6996b" ON public.proyectos USING btree ("empresaId");


--
-- Name: IDX_1980625e176f92db0fd9efdb44; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1980625e176f92db0fd9efdb44" ON public.crm_leads USING btree ("empresaId");


--
-- Name: IDX_1bd0d5da8eba8709b6deb09644; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1bd0d5da8eba8709b6deb09644" ON public.credito_cliente USING btree ("empresaId");


--
-- Name: IDX_1cbad7c603f2dd5a74979fc74f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1cbad7c603f2dd5a74979fc74f" ON public.nomina_anticipos USING btree ("empresaId", "empleadoId", estado);


--
-- Name: IDX_1e5503e298b6724dc6fc2bb475; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1e5503e298b6724dc6fc2bb475" ON public.pre_facturas USING btree ("empresaId", "clienteId");


--
-- Name: IDX_1ebc2aaf131e11d7cc2b6805e0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1ebc2aaf131e11d7cc2b6805e0" ON public.notas_credito USING btree ("empresaId", "clienteId");


--
-- Name: IDX_1fdbf7e3190f696312aa228c5a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1fdbf7e3190f696312aa228c5a" ON public.objetivos USING btree ("empresaId");


--
-- Name: IDX_202270b85066fe3b9ba52a0559; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_202270b85066fe3b9ba52a0559" ON public.movimientos_estadisticos USING btree ("empresaId");


--
-- Name: IDX_20fa1a26ff37b1fbe855afc962; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_20fa1a26ff37b1fbe855afc962" ON public.rutas_produccion USING btree ("empresaId", "isActive");


--
-- Name: IDX_2156b45bf47384bd42725b6d71; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2156b45bf47384bd42725b6d71" ON public.xlink_mapeos USING btree ("empresaId");


--
-- Name: IDX_2264bf66e08c51dd5ed9f801cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2264bf66e08c51dd5ed9f801cb" ON public.anticipo_cliente USING btree ("empresaId", estado);


--
-- Name: IDX_241102facd03e1816fbeab565d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_241102facd03e1816fbeab565d" ON public.cotizaciones_proveedor USING btree ("empresaId", "solicitudId");


--
-- Name: IDX_26b8a087061dd70e1329527668; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_26b8a087061dd70e1329527668" ON public.secuencias_ecf USING btree ("empresaId", "tipoECFId", "isActiva");


--
-- Name: IDX_2a0d9e132907c2f8f8b0d96fc9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2a0d9e132907c2f8f8b0d96fc9" ON public.precios_especiales USING btree ("productoId");


--
-- Name: IDX_2b5550c41437ea83b74cbb2586; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2b5550c41437ea83b74cbb2586" ON public.solicitudes_activacion_ecf USING btree ("empresaId", estado);


--
-- Name: IDX_2b68c8e2d94d3f8d517a3706b1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2b68c8e2d94d3f8d517a3706b1" ON public.periodos_contables USING btree ("empresaId", estado);


--
-- Name: IDX_2dc66167ffed23720d114869f3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2dc66167ffed23720d114869f3" ON public.valores_atributo USING btree ("empresaId");


--
-- Name: IDX_2e482694b7836c93ac4c8887c7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2e482694b7836c93ac4c8887c7" ON public.conversiones_uom USING btree ("empresaId");


--
-- Name: IDX_2fff544d26d944d4cecf094c48; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2fff544d26d944d4cecf094c48" ON public.facturas_recurrentes USING btree ("empresaId", "isActive");


--
-- Name: IDX_302e3a356772e76a2439a34957; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_302e3a356772e76a2439a34957" ON public.nomina_prestamos USING btree ("empresaId");


--
-- Name: IDX_314c5e4306542ccd516317dc44; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_314c5e4306542ccd516317dc44" ON public.contratos USING btree ("empresaId", estado);


--
-- Name: IDX_31ba61919b4dfa05dcd8093f79; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_31ba61919b4dfa05dcd8093f79" ON public.registros_capacitacion USING btree ("empresaId");


--
-- Name: IDX_331959b0662bc8da2acacea75c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_331959b0662bc8da2acacea75c" ON public.reglas_comision USING btree ("empresaId", "isActive");


--
-- Name: IDX_35ea73fdce5e3be0b8dccb6d94; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_35ea73fdce5e3be0b8dccb6d94" ON public.transacciones_puntos USING btree ("empresaId");


--
-- Name: IDX_374819cffff40d1c54c6b99e42; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_374819cffff40d1c54c6b99e42" ON public.atributos_producto USING btree ("empresaId");


--
-- Name: IDX_3c953ac7490192fc6a5d6a67c8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3c953ac7490192fc6a5d6a67c8" ON public.lotes_producto USING btree ("empresaId", "productoId");


--
-- Name: IDX_3d18fb85ec8e5599c693fdd83b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3d18fb85ec8e5599c693fdd83b" ON public.clientes USING btree ("empresaId");


--
-- Name: IDX_3db592b024e2dcca68c0446a6d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3db592b024e2dcca68c0446a6d" ON public.cotizaciones_proveedor USING btree ("empresaId", "proveedorId");


--
-- Name: IDX_3dce84f6cab57604c6dae46275; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3dce84f6cab57604c6dae46275" ON public.terminales_datafono USING btree ("empresaId");


--
-- Name: IDX_3eaa32a820a89970024cffc03a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3eaa32a820a89970024cffc03a" ON public.segmentos_cliente USING btree ("empresaId", "isActive");


--
-- Name: IDX_3f508190d49e5d4414f416d885; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3f508190d49e5d4414f416d885" ON public.depositos_bancarios USING btree ("empresaId");


--
-- Name: IDX_3f75bba17bdee09ddc5837a2a9; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_3f75bba17bdee09ddc5837a2a9" ON public.vendedores USING btree ("empresaId", codigo);


--
-- Name: IDX_3fe2afe838aaa205b0b3c9de91; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3fe2afe838aaa205b0b3c9de91" ON public.producto_proveedor USING btree ("empresaId", "productoId");


--
-- Name: IDX_4036cb5d79f5c822232113f0cd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4036cb5d79f5c822232113f0cd" ON public.cuentas_por_cobrar USING btree ("empresaId", "fechaVencimiento");


--
-- Name: IDX_40e8392d58c66d7fecf6797f5d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_40e8392d58c66d7fecf6797f5d" ON public.seriales_producto USING btree ("empresaId", "productoId");


--
-- Name: IDX_416d6e35fed7df9eadb7a7e9c3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_416d6e35fed7df9eadb7a7e9c3" ON public.solicitudes_compra USING btree ("empresaId");


--
-- Name: IDX_423d2f932a4d0dc87bd09bd1aa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_423d2f932a4d0dc87bd09bd1aa" ON public.cotizaciones USING btree ("empresaId", estado);


--
-- Name: IDX_427f9d1d3765493888bc91fbc0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_427f9d1d3765493888bc91fbc0" ON public.notas_credito_compras USING btree ("empresaId");


--
-- Name: IDX_42b330f24ed8d0918a18357863; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_42b330f24ed8d0918a18357863" ON public.movimientos_caja_chica USING btree ("empresaId", "cajaChicaId");


--
-- Name: IDX_43247eca8a0885e25ec32936f8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_43247eca8a0885e25ec32936f8" ON public.conduces USING btree ("empresaId", "clienteId");


--
-- Name: IDX_43d95fc248a316eefd63e78948; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_43d95fc248a316eefd63e78948" ON public.departamentos USING btree ("empresaId");


--
-- Name: IDX_4449f04aeb780a995d71c7a15c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4449f04aeb780a995d71c7a15c" ON public.depositos_bancarios USING btree ("empresaId", fecha);


--
-- Name: IDX_467acc7dcb706bf72e45658299; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_467acc7dcb706bf72e45658299" ON public.notas_credito_compras USING btree ("empresaId", "proveedorId");


--
-- Name: IDX_473d4b942bc46871dc0dedbb69; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_473d4b942bc46871dc0dedbb69" ON public.facturas_recurrentes USING btree ("empresaId");


--
-- Name: IDX_474fbba8901ba2fc7dfb9e0113; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_474fbba8901ba2fc7dfb9e0113" ON public.contratos_laborales USING btree ("empresaId");


--
-- Name: IDX_48d7c802f3f9282e99d542cdc1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_48d7c802f3f9282e99d542cdc1" ON public.cuentas_estadisticas USING btree ("empresaId");


--
-- Name: IDX_4a4a8ac4c6d7d1ad7806b0194f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4a4a8ac4c6d7d1ad7806b0194f" ON public.lineas_conteo USING btree ("empresaId", "productoId");


--
-- Name: IDX_4ac5cedb207aa37211467f7a43; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4ac5cedb207aa37211467f7a43" ON public.atributos_producto USING btree ("empresaId", "isActive");


--
-- Name: IDX_4b0bf8975ef3c98ea51bba9302; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4b0bf8975ef3c98ea51bba9302" ON public.lineas_conteo USING btree ("conteoId", orden);


--
-- Name: IDX_4b3dd9834ba53ae3cb7d68d76b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4b3dd9834ba53ae3cb7d68d76b" ON public.depositos_bancarios USING btree ("empresaId", "isActive");


--
-- Name: IDX_4c836c06ab3e03d5ba17c93b07; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4c836c06ab3e03d5ba17c93b07" ON public.conduces USING btree ("empresaId");


--
-- Name: IDX_4d4f8d43ac8a89fa9454678880; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4d4f8d43ac8a89fa9454678880" ON public.notificaciones_enviadas USING btree ("createdAt");


--
-- Name: IDX_4d9aebfd35ea40a363a354b07a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4d9aebfd35ea40a363a354b07a" ON public.cuentas_contables USING btree ("empresaId");


--
-- Name: IDX_4df70da75a5e844c584c8cf0fc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4df70da75a5e844c584c8cf0fc" ON public.asiento_lineas USING btree ("empresaId");


--
-- Name: IDX_4e7575d376f08e39c9953f2e4a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4e7575d376f08e39c9953f2e4a" ON public.encuestas USING btree ("empresaId");


--
-- Name: IDX_51267f8c5f926fc7f5c63f4ced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_51267f8c5f926fc7f5c63f4ced" ON public.cuentas_por_pagar USING btree ("empresaId", "fechaVencimiento");


--
-- Name: IDX_54e27cdac811a9f7c6322aa821; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_54e27cdac811a9f7c6322aa821" ON public.departamentos USING btree ("empresaId", "isActive");


--
-- Name: IDX_567bd4e91fb02d9eded3e6e2b6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_567bd4e91fb02d9eded3e6e2b6" ON public.rutas_produccion USING btree ("empresaId");


--
-- Name: IDX_56de466aaf8eaee99f824050ad; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_56de466aaf8eaee99f824050ad" ON public.empresa_ecf_config USING btree ("empresaId");


--
-- Name: IDX_57af9572fe15449510e6e3ea46; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_57af9572fe15449510e6e3ea46" ON public.conteo_ajustes USING btree ("empresaId", "conteoId");


--
-- Name: IDX_59764a91b303c066f931808cd9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_59764a91b303c066f931808cd9" ON public.cuentas_por_cobrar USING btree ("empresaId");


--
-- Name: IDX_5983efdfecc3fcb484a574db27; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5983efdfecc3fcb484a574db27" ON public.demo_requests USING btree (email);


--
-- Name: IDX_5a655cc272019f0135de47e237; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5a655cc272019f0135de47e237" ON public.backup_registros USING btree (estado, "createdAt");


--
-- Name: IDX_5b649f4e133fe264225559020f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5b649f4e133fe264225559020f" ON public.ecf_recibidos USING btree ("empresaId");


--
-- Name: IDX_5e296df1e607464c6ec5edf29f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5e296df1e607464c6ec5edf29f" ON public.notas_credito USING btree ("empresaId");


--
-- Name: IDX_5e997e7de65ab2cac832270359; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5e997e7de65ab2cac832270359" ON public.nomina_prestamos USING btree ("empresaId", "empleadoId", estado);


--
-- Name: IDX_607ed35659c75e9d79179c9f15; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_607ed35659c75e9d79179c9f15" ON public.notas_debito USING btree ("empresaId", estado);


--
-- Name: IDX_60a9f176a3e9d18642c8eed045; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_60a9f176a3e9d18642c8eed045" ON public.tickets_soporte USING btree ("empresaId", estado);


--
-- Name: IDX_60c8428c2582b9292138f574af; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_60c8428c2582b9292138f574af" ON public.presupuesto_proyecto_lineas USING btree ("empresaId");


--
-- Name: IDX_617501d7258106930f34b64c40; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_617501d7258106930f34b64c40" ON public.xlink_mapeos USING btree ("empresaId", "contraparteXlinkId");


--
-- Name: IDX_61cdd749caaf9c57523130d5c7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_61cdd749caaf9c57523130d5c7" ON public.proveedores USING btree ("empresaId", "isActive");


--
-- Name: IDX_62e73fbfc39336d5ec94bd7033; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_62e73fbfc39336d5ec94bd7033" ON public.lineas_conteo USING btree ("empresaId", "isActive");


--
-- Name: IDX_64924f94abc6afabe07bc05c13; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_64924f94abc6afabe07bc05c13" ON public.regla_distribucion_lineas USING btree ("empresaId");


--
-- Name: IDX_64c8946b4781724fb735a2d7b9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_64c8946b4781724fb735a2d7b9" ON public.reglas_distribucion USING btree ("empresaId", "isActive");


--
-- Name: IDX_663ddfa5b9e19b54325c7e76ef; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_663ddfa5b9e19b54325c7e76ef" ON public.ordenes_servicio USING btree ("empresaId");


--
-- Name: IDX_6770b8b7426b26886a096b374b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6770b8b7426b26886a096b374b" ON public.movimientos_inventario USING btree ("empresaId");


--
-- Name: IDX_6788ab24320e19e2123198395b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6788ab24320e19e2123198395b" ON public.facturas USING btree ("empresaId");


--
-- Name: IDX_6c8fbe850ce7c076686bc21c13; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6c8fbe850ce7c076686bc21c13" ON public.compras USING btree ("empresaId", estado);


--
-- Name: IDX_6dfa744bf94b9e54366397adc3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6dfa744bf94b9e54366397adc3" ON public.movimientos_caja_chica USING btree ("empresaId");


--
-- Name: IDX_6dfd9d75044e79d0ed916fabcc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6dfd9d75044e79d0ed916fabcc" ON public.contratos USING btree ("empresaId", "isActive");


--
-- Name: IDX_6ebf5f1c9e768a4b6ab23fb839; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6ebf5f1c9e768a4b6ab23fb839" ON public.anticipo_cliente USING btree ("empresaId");


--
-- Name: IDX_741dc743245b6c421e8e5f2dbe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_741dc743245b6c421e8e5f2dbe" ON public.cuentas_por_pagar USING btree ("empresaId", estado);


--
-- Name: IDX_7482d21dc4d2374ace535b4977; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7482d21dc4d2374ace535b4977" ON public.lineas_conteo USING btree ("empresaId", "conteoId");


--
-- Name: IDX_78c553a1c7be1cc4ce4d27b475; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_78c553a1c7be1cc4ce4d27b475" ON public.cotizacion_proveedor_lineas USING btree ("empresaId");


--
-- Name: IDX_7983c9acff63d90525c7be5a97; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7983c9acff63d90525c7be5a97" ON public.aprobaciones USING btree ("empresaId", estado);


--
-- Name: IDX_7a1d36c0e95466fec2c281dd67; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7a1d36c0e95466fec2c281dd67" ON public.notas_debito USING btree ("empresaId", "isActive");


--
-- Name: IDX_7aaff956fa3aad74434f89b3c4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7aaff956fa3aad74434f89b3c4" ON public.depositos_bancarios USING btree ("empresaId", "cuentaId");


--
-- Name: IDX_7b318f19670e825de09cf0d0ba; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7b318f19670e825de09cf0d0ba" ON public.documentos USING btree ("empresaId");


--
-- Name: IDX_7be95aad91fe8c5784ddb603ae; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7be95aad91fe8c5784ddb603ae" ON public.wms_ubicaciones USING btree ("empresaId");


--
-- Name: IDX_7bf31aa43a7ad0644f81bf247c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7bf31aa43a7ad0644f81bf247c" ON public.balanza_patrones USING btree ("empresaId");


--
-- Name: IDX_7cc51a1c9e490929cb6ee4310f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7cc51a1c9e490929cb6ee4310f" ON public.wms_ubicaciones USING btree ("empresaId", "almacenId");


--
-- Name: IDX_7e954e22a7bf5c665746a1f762; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7e954e22a7bf5c665746a1f762" ON public.categorias_activos USING btree ("empresaId");


--
-- Name: IDX_7eeecc47641df1f4792bc4c79a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7eeecc47641df1f4792bc4c79a" ON public.sucursales USING btree ("empresaId");


--
-- Name: IDX_80c81c82c20dc00cb145c30e7b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_80c81c82c20dc00cb145c30e7b" ON public.declaraciones_itbis USING btree ("empresaId");


--
-- Name: IDX_8100afe0ab3012d5bb5cd42bc1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8100afe0ab3012d5bb5cd42bc1" ON public.centros_trabajo USING btree ("empresaId", "isActive");


--
-- Name: IDX_8150fdf3ce9d65edbbad510bdb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8150fdf3ce9d65edbbad510bdb" ON public.pre_facturas USING btree ("empresaId", "isActive");


--
-- Name: IDX_818220e79b515eddcc9505f02f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_818220e79b515eddcc9505f02f" ON public.pro_formas USING btree ("empresaId");


--
-- Name: IDX_81d952b9df47c152b791a70e57; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_81d952b9df47c152b791a70e57" ON public.audit_logs USING btree (modulo);


--
-- Name: IDX_824e2ed3162e986bd1c747042b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_824e2ed3162e986bd1c747042b" ON public.wms_ordenes_picking USING btree ("empresaId");


--
-- Name: IDX_82838c07faa717fb8918b1af18; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_82838c07faa717fb8918b1af18" ON public.seriales_producto USING btree ("empresaId");


--
-- Name: IDX_837e066910205454844012acae; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_837e066910205454844012acae" ON public.reglas_descuento USING btree ("empresaId", "isActive");


--
-- Name: IDX_845ecd7e8ad0d6b9abad092413; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_845ecd7e8ad0d6b9abad092413" ON public.cuentas_por_pagar USING btree ("empresaId");


--
-- Name: IDX_84b39537257648b8c5535d29e6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_84b39537257648b8c5535d29e6" ON public.balanza_patrones USING btree ("empresaId", "isActive");


--
-- Name: IDX_84c1857fc18dd8c0394b143bea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_84c1857fc18dd8c0394b143bea" ON public.reportes_dgii USING btree ("empresaId");


--
-- Name: IDX_85eca12d761c8a5853b521b1a8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_85eca12d761c8a5853b521b1a8" ON public.wms_lineas_picking USING btree ("empresaId");


--
-- Name: IDX_86cad0834f9cf282c71a4b6da2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_86cad0834f9cf282c71a4b6da2" ON public.xlink_documentos USING btree ("destinoEmpresaId", "estadoReceptor", "publicadoEn");


--
-- Name: IDX_86e92e2912204c08ce882af1e8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_86e92e2912204c08ce882af1e8" ON public.movimientos_caja_chica USING btree ("empresaId", "createdAt");


--
-- Name: IDX_87533af61c299d46543a1e93be; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_87533af61c299d46543a1e93be" ON public.grupos_producto USING btree ("empresaId", "isActive");


--
-- Name: IDX_8784cf2ffd2fbe44df25449666; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8784cf2ffd2fbe44df25449666" ON public.vendedor_clientes USING btree ("empresaId");


--
-- Name: IDX_89c51961e298ef7d54ceb73da5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_89c51961e298ef7d54ceb73da5" ON public.proyectos USING btree ("empresaId", "isActive");


--
-- Name: IDX_89d5b65148b4a2af207da715d9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_89d5b65148b4a2af207da715d9" ON public.reportes_dgii USING btree ("empresaId", tipo, anio, mes);


--
-- Name: IDX_8a00475a252cf5088ec65d9ac0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8a00475a252cf5088ec65d9ac0" ON public.notas_credito USING btree ("empresaId", estado);


--
-- Name: IDX_8aff258324ac5cb4f1d5b5d876; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8aff258324ac5cb4f1d5b5d876" ON public.empleados USING btree ("empresaId", "isActive");


--
-- Name: IDX_8b706be36ab0a1da030a64faf1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8b706be36ab0a1da030a64faf1" ON public.movimientos_inventario USING btree ("empresaId", "createdAt");


--
-- Name: IDX_8bead44be2087924db648ea841; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8bead44be2087924db648ea841" ON public.gastos USING btree ("empresaId", periodo);


--
-- Name: IDX_8c49178fe6d2d7c28ede533acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8c49178fe6d2d7c28ede533acc" ON public.conteos_inventario USING btree ("empresaId");


--
-- Name: IDX_8d470a3da5b1495e3f4dc9da23; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8d470a3da5b1495e3f4dc9da23" ON public.resultados_clave USING btree ("empresaId");


--
-- Name: IDX_8e87625190747f64db1c7f47f6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8e87625190747f64db1c7f47f6" ON public.solicitudes_ajuste_inventario USING btree ("empresaId", estado);


--
-- Name: IDX_8f8e0e486b9ebc575057f5a69e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8f8e0e486b9ebc575057f5a69e" ON public.presupuesto_lineas USING btree ("empresaId");


--
-- Name: IDX_90aa1466a94818885dad5b1b0f; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_90aa1466a94818885dad5b1b0f" ON public.saldo_puntos USING btree ("empresaId", "clienteId");


--
-- Name: IDX_9116bad6e9bce52f8ad1d4e617; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9116bad6e9bce52f8ad1d4e617" ON public.conduces USING btree ("empresaId", "isActive");


--
-- Name: IDX_932c9aa14b27a739ea39d42ca4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_932c9aa14b27a739ea39d42ca4" ON public.plan_demanda_lineas USING btree ("empresaId");


--
-- Name: IDX_94e9d05fc3b20b9bec810e86dc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_94e9d05fc3b20b9bec810e86dc" ON public.producto_variantes USING btree ("empresaId", sku);


--
-- Name: IDX_95d93ba3436fab8851650e4cf6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_95d93ba3436fab8851650e4cf6" ON public.anticipo_cliente USING btree ("empresaId", "clienteId");


--
-- Name: IDX_965c3f70d64a584e23ebcae8c4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_965c3f70d64a584e23ebcae8c4" ON public.configuraciones_cuentas_contables USING btree ("empresaId");


--
-- Name: IDX_98419776ce69518109c89a4610; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_98419776ce69518109c89a4610" ON public.notificaciones_enviadas USING btree (tipo);


--
-- Name: IDX_990b86695417d7740f0c34b89e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_990b86695417d7740f0c34b89e" ON public.clientes USING btree ("empresaId", "isActive");


--
-- Name: IDX_99166685b5f11ec4198367f4ea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_99166685b5f11ec4198367f4ea" ON public.facturas USING btree ("empresaId", "isActive");


--
-- Name: IDX_9991ce0d45a9db5004f71225c6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9991ce0d45a9db5004f71225c6" ON public.lineas_conteo USING btree ("empresaId");


--
-- Name: IDX_99a846b1619e566e7fdd35126a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_99a846b1619e566e7fdd35126a" ON public.depreciaciones_activos USING btree ("empresaId");


--
-- Name: IDX_9aa92fa99b127fc1acc6a933a3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9aa92fa99b127fc1acc6a933a3" ON public.aprobaciones USING btree ("empresaId");


--
-- Name: IDX_9b9694d815cc3d002ab1840152; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9b9694d815cc3d002ab1840152" ON public.vendedores USING btree ("empresaId", "isActive");


--
-- Name: IDX_9bd126ff436bdbc5027bcb5935; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9bd126ff436bdbc5027bcb5935" ON public.unidades_medida USING btree ("empresaId");


--
-- Name: IDX_9cc64b2ac75a8fc135084b1f69; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9cc64b2ac75a8fc135084b1f69" ON public.nomina_novedades USING btree ("empresaId");


--
-- Name: IDX_9df2c9789e5e6456b02967be11; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9df2c9789e5e6456b02967be11" ON public.tasas_cambio USING btree ("empresaId");


--
-- Name: IDX_a048f8e16d05e6d48fb4ba4907; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a048f8e16d05e6d48fb4ba4907" ON public.reglas_distribucion USING btree ("empresaId");


--
-- Name: IDX_a1f2decba158e34a840dc22ad7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a1f2decba158e34a840dc22ad7" ON public.cajas_chicas USING btree ("empresaId", "isActive");


--
-- Name: IDX_a2c898e72a948a7de01c0c4273; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a2c898e72a948a7de01c0c4273" ON public.tickets_soporte USING btree ("empresaId", "clienteId");


--
-- Name: IDX_a363307f189f48d0f33f0e2c94; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a363307f189f48d0f33f0e2c94" ON public.reglas_descuento USING btree ("empresaId");


--
-- Name: IDX_a3d39534a21821f7b0a8e068a2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a3d39534a21821f7b0a8e068a2" ON public.periodos_contables USING btree ("empresaId");


--
-- Name: IDX_a4219c4756ce140939823646e7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a4219c4756ce140939823646e7" ON public.wms_ordenes_picking USING btree ("empresaId", "operadorId");


--
-- Name: IDX_a47276ae25124163c3e85d6ff0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a47276ae25124163c3e85d6ff0" ON public.pre_facturas USING btree ("empresaId");


--
-- Name: IDX_a48932bd222b92a7a8ac253fc6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a48932bd222b92a7a8ac253fc6" ON public.productos USING btree ("empresaId", "isActive");


--
-- Name: IDX_a4ff650256fd509d9fc1d0a055; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a4ff650256fd509d9fc1d0a055" ON public.solicitudes_compra USING btree ("empresaId", "solicitanteId");


--
-- Name: IDX_a67d7786a148f2b0b7eb1cdbe6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a67d7786a148f2b0b7eb1cdbe6" ON public.conduces USING btree ("empresaId", estado);


--
-- Name: IDX_aaed8522e516bd88427eda3ba5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aaed8522e516bd88427eda3ba5" ON public.soporte_ticket_adjuntos USING btree ("empresaId");


--
-- Name: IDX_ad025053fdb0638f53fb837241; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ad025053fdb0638f53fb837241" ON public.movimientos_estadisticos USING btree ("empresaId", "cuentaId", fecha);


--
-- Name: IDX_ae10e2cd8bc31ec31a7f2e5ab3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ae10e2cd8bc31ec31a7f2e5ab3" ON public.proveedores USING btree ("empresaId");


--
-- Name: IDX_ae2060f3ec3f0d94ab5311bae6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ae2060f3ec3f0d94ab5311bae6" ON public.cotizaciones USING btree ("empresaId", "isActive");


--
-- Name: IDX_aee535ab1589fd2228d9ec88b6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_aee535ab1589fd2228d9ec88b6" ON public.wms_ubicaciones USING btree ("empresaId", codigo);


--
-- Name: IDX_afec7e7ed6fb05c9bfabaf056a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_afec7e7ed6fb05c9bfabaf056a" ON public.pre_facturas USING btree ("empresaId", estado);


--
-- Name: IDX_b07403cb543aa41b5080b46527; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b07403cb543aa41b5080b46527" ON public.registro_etapas_orden USING btree ("empresaId");


--
-- Name: IDX_b0d1c9dc04838a84b5dc63b37c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b0d1c9dc04838a84b5dc63b37c" ON public.conteos_inventario USING btree ("empresaId", estado);


--
-- Name: IDX_b1507cbc4fb8c628ffbcc0f97d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b1507cbc4fb8c628ffbcc0f97d" ON public.producto_proveedor USING btree ("empresaId", "proveedorId");


--
-- Name: IDX_b251319d40067b47329ccf3730; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b251319d40067b47329ccf3730" ON public.solicitudes_compra USING btree ("empresaId", estado);


--
-- Name: IDX_b3d4f9be6f21cae61e3c195aee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b3d4f9be6f21cae61e3c195aee" ON public.cuentas_estadisticas USING btree ("empresaId", "isActive");


--
-- Name: IDX_b55369b1297a65d0736bb6ccd1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b55369b1297a65d0736bb6ccd1" ON public.audit_logs USING btree ("empresaId");


--
-- Name: IDX_b81902283810ec2df0ea5df025; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b81902283810ec2df0ea5df025" ON public.recibos_cobro USING btree ("empresaId", "isActive");


--
-- Name: IDX_b8ae578b1bc56492cadb122750; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b8ae578b1bc56492cadb122750" ON public.cajas_chicas USING btree ("empresaId");


--
-- Name: IDX_b8e825a2ab232368a3ce550511; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b8e825a2ab232368a3ce550511" ON public.aprobaciones USING btree ("empresaId", "solicitadoPorId");


--
-- Name: IDX_ba2cba0506a924818281648b88; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ba2cba0506a924818281648b88" ON public.compras USING btree ("empresaId");


--
-- Name: IDX_baf932eb95d85d2c6998e15e31; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_baf932eb95d85d2c6998e15e31" ON public.licitaciones USING btree ("empresaId");


--
-- Name: IDX_bc18cb9f96488f5bfaa6888d97; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bc18cb9f96488f5bfaa6888d97" ON public.cargos USING btree ("empresaId", "isActive");


--
-- Name: IDX_bca578ef8e5234d2e37e644194; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bca578ef8e5234d2e37e644194" ON public.documentos USING btree ("empresaId", "tipoEntidad", "entidadId");


--
-- Name: IDX_bd26eef2c35648d090eaf4dbab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bd26eef2c35648d090eaf4dbab" ON public.compras USING btree ("empresaId", "isActive");


--
-- Name: IDX_bd715bd894fe11a2aa9843dac4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bd715bd894fe11a2aa9843dac4" ON public.producto_variantes USING btree ("empresaId");


--
-- Name: IDX_bf1768208957da6c166a627c03; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bf1768208957da6c166a627c03" ON public.producto_proveedor USING btree ("empresaId");


--
-- Name: IDX_bf3ff7d7664c44bc0a667a7b16; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bf3ff7d7664c44bc0a667a7b16" ON public.cuentas_bancarias USING btree ("empresaId");


--
-- Name: IDX_c0e1551e0e3d40f4e789874efd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c0e1551e0e3d40f4e789874efd" ON public.ecf USING btree ("documentoOrigenTipo", "documentoOrigenId");


--
-- Name: IDX_c2129e604dac31b58dc54ec0fd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c2129e604dac31b58dc54ec0fd" ON public.planes_pago USING btree ("empresaId", "clienteId");


--
-- Name: IDX_c246654f9aea969bee82e53b50; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c246654f9aea969bee82e53b50" ON public.cheques USING btree ("empresaId", "isActive");


--
-- Name: IDX_c2ccbb4c15c77f5576226bc880; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c2ccbb4c15c77f5576226bc880" ON public.xlink_documentos USING btree ("origenEmpresaId", "publicadoEn");


--
-- Name: IDX_c34bb1f449f483173329f66830; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c34bb1f449f483173329f66830" ON public.reglas_descuento USING btree ("empresaId", activo);


--
-- Name: IDX_c47a64d8c2dc3a2ff9245a1249; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_c47a64d8c2dc3a2ff9245a1249" ON public.preferencias_usuario USING btree ("userId", "empresaId", clave);


--
-- Name: IDX_c4da30a51aea8766309f8f7bd5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c4da30a51aea8766309f8f7bd5" ON public.conciliaciones_datafono USING btree ("empresaId");


--
-- Name: IDX_c613984530e94cdb9d5915c0db; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_c613984530e94cdb9d5915c0db" ON public.credito_cliente USING btree ("empresaId", "clienteId");


--
-- Name: IDX_c69efb19bf127c97e6740ad530; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON public.audit_logs USING btree ("createdAt");


--
-- Name: IDX_c6efd5061759ecf6e9be002d53; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c6efd5061759ecf6e9be002d53" ON public.vendedor_clientes USING btree ("empresaId", "vendedorId");


--
-- Name: IDX_c6f144376561882d3786731ff4; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_c6f144376561882d3786731ff4" ON public.ecf USING btree ("trackId");


--
-- Name: IDX_c765387c7573c0b8a397902734; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c765387c7573c0b8a397902734" ON public.audit_logs USING btree (nivel);


--
-- Name: IDX_c83539d076c65b588f8207c7cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c83539d076c65b588f8207c7cb" ON public.empleados USING btree ("empresaId");


--
-- Name: IDX_c88409eaaf011a58cc69f0b3ec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c88409eaaf011a58cc69f0b3ec" ON public.crm_leads USING btree ("empresaId", "isActive");


--
-- Name: IDX_c8996a947e38383f405ff0b658; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c8996a947e38383f405ff0b658" ON public.recibos_cobro USING btree ("empresaId", "clienteId");


--
-- Name: IDX_cbb4c2b7276937cc9ef3c73d29; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cbb4c2b7276937cc9ef3c73d29" ON public.pro_forma_items USING btree ("empresaId");


--
-- Name: IDX_cc8ff32fbf959b17c0d7f98b68; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cc8ff32fbf959b17c0d7f98b68" ON public.saldo_puntos USING btree ("empresaId");


--
-- Name: IDX_ccd1c5b6f043a08846f775dec5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ccd1c5b6f043a08846f775dec5" ON public.cheques USING btree ("empresaId");


--
-- Name: IDX_ce2048fe0f5a796f69d44dd0d9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ce2048fe0f5a796f69d44dd0d9" ON public.segmentos_cliente USING btree ("empresaId");


--
-- Name: IDX_ce95d5347f046275daa867d225; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ce95d5347f046275daa867d225" ON public.programa_fidelidad USING btree ("empresaId");


--
-- Name: IDX_ceba2caebe958a1417eb52e8b4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ceba2caebe958a1417eb52e8b4" ON public.cuenta_anexo_ir2 USING btree ("cuentaContableId");


--
-- Name: IDX_cfa83f61e4d27a87fcae1e025a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON public.audit_logs USING btree ("userId");


--
-- Name: IDX_compras_empresaId_claveIdempotencia; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_compras_empresaId_claveIdempotencia" ON public.compras USING btree ("empresaId", "claveIdempotencia") WHERE ("claveIdempotencia" IS NOT NULL);


--
-- Name: IDX_d009ffb51a50a70648fed4d0dc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d009ffb51a50a70648fed4d0dc" ON public.soporte_tickets USING btree ("empresaId");


--
-- Name: IDX_d0e8a883565e5c5a2f5773b4eb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d0e8a883565e5c5a2f5773b4eb" ON public.cargos USING btree ("empresaId");


--
-- Name: IDX_d149817947bcf8985055782622; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d149817947bcf8985055782622" ON public.sesiones_capacitacion USING btree ("empresaId");


--
-- Name: IDX_d23ccf112928285bdbe1afdeb0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d23ccf112928285bdbe1afdeb0" ON public.facturas_recurrentes USING btree (activa, "proximaEjecucion");


--
-- Name: IDX_d591e5436d5eda14f070847ac9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d591e5436d5eda14f070847ac9" ON public.planes_pago USING btree ("empresaId");


--
-- Name: IDX_d953af9aed0d989eb4bf1bef9f; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_d953af9aed0d989eb4bf1bef9f" ON public.dispositivos_conocidos USING btree ("userId", fingerprint);


--
-- Name: IDX_d9a8103db0faad240f34b3d7db; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d9a8103db0faad240f34b3d7db" ON public.cotizaciones_proveedor USING btree ("empresaId");


--
-- Name: IDX_d9e694923f3443ce82c56cc3bb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d9e694923f3443ce82c56cc3bb" ON public.cotizaciones USING btree ("empresaId");


--
-- Name: IDX_daa091f0b7263a8aeb7437c554; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_daa091f0b7263a8aeb7437c554" ON public.gastos USING btree ("empresaId");


--
-- Name: IDX_dbaf6614f13254d1128686364b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dbaf6614f13254d1128686364b" ON public.presupuestos USING btree ("empresaId");


--
-- Name: IDX_dbda5365b0bf0adadff6dc5833; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dbda5365b0bf0adadff6dc5833" ON public.reglas_comision USING btree ("empresaId");


--
-- Name: IDX_dc279f02377b5948dd9485c8fc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dc279f02377b5948dd9485c8fc" ON public.conciliaciones_bancarias USING btree ("empresaId");


--
-- Name: IDX_dc7facc35228d99f4c49d3f7bc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dc7facc35228d99f4c49d3f7bc" ON public.facturas USING btree ("empresaId", estado);


--
-- Name: IDX_dca3b532f7603c2f83a407c04d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dca3b532f7603c2f83a407c04d" ON public.pro_formas USING btree ("empresaId", "isActive");


--
-- Name: IDX_e21fae27e4e1112a5edff03935; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e21fae27e4e1112a5edff03935" ON public.planes_demanda USING btree ("empresaId");


--
-- Name: IDX_e2d7d944503b3e738f16625b3b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e2d7d944503b3e738f16625b3b" ON public.lotes_producto USING btree ("empresaId", "numeroLote");


--
-- Name: IDX_e36319dab8311d913e1eb26764; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e36319dab8311d913e1eb26764" ON public.notas_credito USING btree ("empresaId", "isActive");


--
-- Name: IDX_e57108f28b65cf82b41793a022; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e57108f28b65cf82b41793a022" ON public.etapas_ruta USING btree ("empresaId");


--
-- Name: IDX_e5901a3fa6cb52e33f36508dcd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e5901a3fa6cb52e33f36508dcd" ON public.registros_flota USING btree ("empresaId");


--
-- Name: IDX_e7b33118cdd0808c80358ed60b; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_e7b33118cdd0808c80358ed60b" ON public.ecf_consumo_ciclo USING btree ("empresaId", "cicloInicio");


--
-- Name: IDX_e80065452e59fd5bdd5a7bad87; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e80065452e59fd5bdd5a7bad87" ON public.notas_debito USING btree ("empresaId", "clienteId");


--
-- Name: IDX_e9aaed3575be9ea3d86edc22d4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e9aaed3575be9ea3d86edc22d4" ON public.productos USING btree ("empresaId");


--
-- Name: IDX_eba9d4d0d7a4e5efd610e4127f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_eba9d4d0d7a4e5efd610e4127f" ON public.crm_leads USING btree ("empresaId", estado);


--
-- Name: IDX_ede122e01e98976209fc1375c6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ede122e01e98976209fc1375c6" ON public.activos_fijos USING btree ("empresaId");


--
-- Name: IDX_efa20ec1918c65e39aed03c06c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_efa20ec1918c65e39aed03c06c" ON public.planes_pago USING btree ("empresaId", "isActive");


--
-- Name: IDX_f00d0adeda76cd259d3d0773ff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f00d0adeda76cd259d3d0773ff" ON public.solicitud_compra_lineas USING btree ("empresaId");


--
-- Name: IDX_f039636ad9ac31791c5f9a0816; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f039636ad9ac31791c5f9a0816" ON public.vendedores USING btree ("empresaId");


--
-- Name: IDX_f088632edd9da0d6d59427ecc2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f088632edd9da0d6d59427ecc2" ON public.hitos_proyecto USING btree ("empresaId");


--
-- Name: IDX_f0f67cf2a8d2240098cc70890a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f0f67cf2a8d2240098cc70890a" ON public.balanza_formatos_exportacion USING btree ("empresaId", "isActive");


--
-- Name: IDX_f102aab36ec3bd61717abb80dc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f102aab36ec3bd61717abb80dc" ON public.precios_especiales USING btree ("clienteId");


--
-- Name: IDX_f473d2450ad41532f55190f74a; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_f473d2450ad41532f55190f74a" ON public.declaraciones_itbis USING btree ("empresaId", anio, mes);


--
-- Name: IDX_f4b323de25b126bef414ca6f8c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f4b323de25b126bef414ca6f8c" ON public.recibos_cobro USING btree ("empresaId");


--
-- Name: IDX_f4fa9abc64af4fe568d8a1ebd0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f4fa9abc64af4fe568d8a1ebd0" ON public.nomina_anticipos USING btree ("empresaId");


--
-- Name: IDX_f6d43c0e86fbcf509e68b01ff9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f6d43c0e86fbcf509e68b01ff9" ON public.lotes_producto USING btree ("empresaId");


--
-- Name: IDX_f8206f000549c5404c91edb8bd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f8206f000549c5404c91edb8bd" ON public.producto_variantes USING btree ("empresaId", "productoId");


--
-- Name: IDX_f89e6fb5454547fc71bfcb4b6c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f89e6fb5454547fc71bfcb4b6c" ON public.tickets_soporte USING btree ("empresaId");


--
-- Name: IDX_fa1dcbedd3d38ff4d2737d2a5d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fa1dcbedd3d38ff4d2737d2a5d" ON public.balanza_formatos_exportacion USING btree ("empresaId");


--
-- Name: IDX_fbb726cc2b7c795b3e435a0258; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fbb726cc2b7c795b3e435a0258" ON public.conversiones_uom USING btree ("empresaId", "unidadDesdeId", "unidadHastaId");


--
-- Name: IDX_fbead6a53ec6c7abfaed489c94; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fbead6a53ec6c7abfaed489c94" ON public.contratos USING btree ("empresaId");


--
-- Name: IDX_fd1523b4900dcb945f3b20c963; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fd1523b4900dcb945f3b20c963" ON public.documentos USING btree ("empresaId", "isActive");


--
-- Name: IDX_fd6ddcfcaf3b4a1fbc68a5e62f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fd6ddcfcaf3b4a1fbc68a5e62f" ON public.cuenta_anexo_ir2 USING btree ("empresaId");


--
-- Name: IDX_fe37ea4da5362c5a0a1299b4b7; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_fe37ea4da5362c5a0a1299b4b7" ON public.facturas USING btree ("empresaId", "claveIdempotencia") WHERE ("claveIdempotencia" IS NOT NULL);


--
-- Name: IDX_fe746442b90e3d705fffa3da42; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fe746442b90e3d705fffa3da42" ON public.pro_formas USING btree ("empresaId", estado);


--
-- Name: IDX_feb07bc31cc4ac3065940c23a8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_feb07bc31cc4ac3065940c23a8" ON public.vehiculos USING btree ("empresaId");


--
-- Name: IDX_fec26ead3565ba1324c908ac60; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fec26ead3565ba1324c908ac60" ON public.cuentas_por_cobrar USING btree ("empresaId", estado);


--
-- Name: IDX_setup_tokens_tokenHash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_setup_tokens_tokenHash" ON public.setup_tokens USING btree ("tokenHash");


--
-- Name: IDX_users_sessionToken; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_users_sessionToken" ON public.users USING btree ("sessionToken");


--
-- Name: idx_clientes_xlinkEmpresaXlinkId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clientes_xlinkEmpresaXlinkId" ON public.clientes USING btree ("xlinkEmpresaXlinkId");


--
-- Name: idx_cw_adelantos_lavador_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_adelantos_lavador_fecha ON public.cw_adelantos USING btree ("empresaId", "lavadorId", fecha);


--
-- Name: idx_cw_comisiones_lavador_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_comisiones_lavador_fecha ON public.cw_comisiones USING btree ("empresaId", "lavadorId", fecha);


--
-- Name: idx_cw_comisiones_liquidacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_comisiones_liquidacion ON public.cw_comisiones USING btree ("liquidacionId");


--
-- Name: idx_cw_lavadores_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_lavadores_empresa ON public.cw_lavadores USING btree ("empresaId");


--
-- Name: idx_cw_liquidaciones_lavador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_liquidaciones_lavador ON public.cw_liquidaciones USING btree ("empresaId", "lavadorId");


--
-- Name: idx_cw_servicio_precios_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_servicio_precios_servicio ON public.cw_servicio_precios USING btree ("servicioId");


--
-- Name: idx_cw_servicios_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_servicios_empresa ON public.cw_servicios USING btree ("empresaId");


--
-- Name: idx_cw_turno_eventos_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turno_eventos_turno ON public.cw_turno_eventos USING btree ("turnoId");


--
-- Name: idx_cw_turno_fotos_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turno_fotos_turno ON public.cw_turno_fotos USING btree ("turnoId");


--
-- Name: idx_cw_turno_lavadores_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turno_lavadores_turno ON public.cw_turno_lavadores USING btree ("turnoId");


--
-- Name: idx_cw_turno_servicios_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turno_servicios_turno ON public.cw_turno_servicios USING btree ("turnoId");


--
-- Name: idx_cw_turnos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turnos_fecha ON public.cw_turnos USING btree ("empresaId", "sucursalId", "fechaRD");


--
-- Name: idx_cw_turnos_tablero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cw_turnos_tablero ON public.cw_turnos USING btree ("empresaId", "sucursalId", estado);


--
-- Name: idx_ecf_en_validacion_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecf_en_validacion_pendiente ON public.ecf USING btree ("estadoDGII", "revisionManual", "ultimaConsultaAt") WHERE (("estadoDGII" = 'en_validacion_dgii'::public.ecf_estadodgii_enum) AND ("isActive" = true));


--
-- Name: idx_proveedores_xlinkEmpresaXlinkId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_proveedores_xlinkEmpresaXlinkId" ON public.proveedores USING btree ("xlinkEmpresaXlinkId");


--
-- Name: idx_xlink_doc_destino; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xlink_doc_destino ON public.xlink_documentos USING btree ("destinoEmpresaId", "estadoReceptor", "publicadoEn");


--
-- Name: idx_xlink_doc_origen_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xlink_doc_origen_fecha ON public.xlink_documentos USING btree ("origenEmpresaId", "publicadoEn");


--
-- Name: idx_xlink_doc_padre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xlink_doc_padre ON public.xlink_documentos USING btree ("xlinkPadreId");


--
-- Name: idx_xlink_mapeo_empresa_contraparte; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xlink_mapeo_empresa_contraparte ON public.xlink_mapeos USING btree ("empresaId", "contraparteXlinkId");


--
-- Name: uq_cw_comision_linea; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cw_comision_linea ON public.cw_comisiones USING btree ("turnoId", "lavadorId", COALESCE("servicioId", 0));


--
-- Name: uq_empresa_xlinkId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_empresa_xlinkId" ON public.empresa USING btree ("xlinkId");


--
-- Name: uq_facturas_origen_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_facturas_origen_activo ON public.facturas USING btree ("empresaId", "origenTipo", "origenId") WHERE (("origenTipo" IS NOT NULL) AND (estado <> 'cancelada'::public.facturas_estado_enum));


--
-- Name: cuentas_por_cobrar FK_00ab057fdbc6d10cd1c930c07ee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT "FK_00ab057fdbc6d10cd1c930c07ee" FOREIGN KEY ("facturaId") REFERENCES public.facturas(id);


--
-- Name: facturas FK_016cdc5e7b78d6ee9e0b3e93aab; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT "FK_016cdc5e7b78d6ee9e0b3e93aab" FOREIGN KEY ("usuarioId") REFERENCES public.users(id);


--
-- Name: factura_detalles FK_0369a3029523965ad0a6449fcd1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalles
    ADD CONSTRAINT "FK_0369a3029523965ad0a6449fcd1" FOREIGN KEY ("facturaId") REFERENCES public.facturas(id) ON DELETE CASCADE;


--
-- Name: lineas_conteo FK_05aebf64a5db443b6f7ce394d28; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "FK_05aebf64a5db443b6f7ce394d28" FOREIGN KEY ("conteoId") REFERENCES public.conteos_inventario(id) ON DELETE CASCADE;


--
-- Name: cotizacion_proveedor_lineas FK_069523cec00f89e2898d131d401; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_proveedor_lineas
    ADD CONSTRAINT "FK_069523cec00f89e2898d131d401" FOREIGN KEY ("cotizacionId") REFERENCES public.cotizaciones_proveedor(id) ON DELETE CASCADE;


--
-- Name: movimientos_bancarios FK_0c1367aed20579c9c95f5e68197; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_bancarios
    ADD CONSTRAINT "FK_0c1367aed20579c9c95f5e68197" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: notas_credito_compras FK_0d11572605a54dd14aa9fd989c4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito_compras
    ADD CONSTRAINT "FK_0d11572605a54dd14aa9fd989c4" FOREIGN KEY ("compraOriginalId") REFERENCES public.compras(id);


--
-- Name: resultados_clave FK_1083270130fc122240a7b70c396; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_clave
    ADD CONSTRAINT "FK_1083270130fc122240a7b70c396" FOREIGN KEY ("objetivoId") REFERENCES public.objetivos(id) ON DELETE CASCADE;


--
-- Name: plan_demanda_lineas FK_1125321d4001b23a429423d078a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_demanda_lineas
    ADD CONSTRAINT "FK_1125321d4001b23a429423d078a" FOREIGN KEY ("planId") REFERENCES public.planes_demanda(id) ON DELETE CASCADE;


--
-- Name: ecf_eventos FK_116411f010c42c400573bc42a41; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf_eventos
    ADD CONSTRAINT "FK_116411f010c42c400573bc42a41" FOREIGN KEY ("comprobanteId") REFERENCES public.ecf(id) ON DELETE CASCADE;


--
-- Name: facturas_recurrentes FK_120fb3f13ef8c12bc64caed6291; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas_recurrentes
    ADD CONSTRAINT "FK_120fb3f13ef8c12bc64caed6291" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: conteos_inventario FK_12329ed44465e2dccad1ace439c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario
    ADD CONSTRAINT "FK_12329ed44465e2dccad1ace439c" FOREIGN KEY ("ajustadoPorId") REFERENCES public.users(id);


--
-- Name: cuotas FK_19a42669e68feca2633bd7db108; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT "FK_19a42669e68feca2633bd7db108" FOREIGN KEY ("planPagoId") REFERENCES public.planes_pago(id) ON DELETE CASCADE;


--
-- Name: lineas_conteo FK_1e69405ccc3dd5b5340f4cfda60; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "FK_1e69405ccc3dd5b5340f4cfda60" FOREIGN KEY ("ubicacionId") REFERENCES public.wms_ubicaciones(id);


--
-- Name: evaluaciones_empleado FK_2159c0150d50a813cea66d79da7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_empleado
    ADD CONSTRAINT "FK_2159c0150d50a813cea66d79da7" FOREIGN KEY ("evaluadorId") REFERENCES public.users(id);


--
-- Name: factura_detalles FK_232f6959be554f42c71427b9b78; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_detalles
    ADD CONSTRAINT "FK_232f6959be554f42c71427b9b78" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: solicitudes_ajuste_inventario FK_23436e3462b856c6fe14dfbb85d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_ajuste_inventario
    ADD CONSTRAINT "FK_23436e3462b856c6fe14dfbb85d" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: secuencias_ecf FK_2354b330404401bbd67718e2741; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secuencias_ecf
    ADD CONSTRAINT "FK_2354b330404401bbd67718e2741" FOREIGN KEY ("tipoECFId") REFERENCES public.tipos_ecf(id);


--
-- Name: crm_leads FK_27d4122bacf9c838e4510be4f87; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT "FK_27d4122bacf9c838e4510be4f87" FOREIGN KEY ("responsableId") REFERENCES public.users(id);


--
-- Name: etapas_ruta FK_28e0149c479d2dc960b836d4604; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_ruta
    ADD CONSTRAINT "FK_28e0149c479d2dc960b836d4604" FOREIGN KEY ("rutaId") REFERENCES public.rutas_produccion(id) ON DELETE CASCADE;


--
-- Name: cuentas_contables FK_29b233ec2425ecdf7811951e89a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_contables
    ADD CONSTRAINT "FK_29b233ec2425ecdf7811951e89a" FOREIGN KEY ("cuentaPadreId") REFERENCES public.cuentas_contables(id);


--
-- Name: sucursales FK_2a119f6ed870d619b12d934d6d6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT "FK_2a119f6ed870d619b12d934d6d6" FOREIGN KEY ("responsableId") REFERENCES public.users(id);


--
-- Name: grupos_producto FK_2b67317f84e927406c1af12d3aa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos_producto
    ADD CONSTRAINT "FK_2b67317f84e927406c1af12d3aa" FOREIGN KEY ("parentId") REFERENCES public.grupos_producto(id);


--
-- Name: solicitudes_ajuste_inventario FK_308911ac79f83f136e40d10d3a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_ajuste_inventario
    ADD CONSTRAINT "FK_308911ac79f83f136e40d10d3a1" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: pre_facturas FK_3292e5e453924119c6fcd8ffcee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_facturas
    ADD CONSTRAINT "FK_3292e5e453924119c6fcd8ffcee" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: lineas_conteo FK_32c11edcc956243303349b4b1f5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "FK_32c11edcc956243303349b4b1f5" FOREIGN KEY ("recuentadoPorId") REFERENCES public.users(id);


--
-- Name: compra_detalles FK_33c07903830d4e0d44c4427eb4d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalles
    ADD CONSTRAINT "FK_33c07903830d4e0d44c4427eb4d" FOREIGN KEY ("compraId") REFERENCES public.compras(id) ON DELETE CASCADE;


--
-- Name: conduces FK_34f8e406e8b6142f6de88ee5372; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduces
    ADD CONSTRAINT "FK_34f8e406e8b6142f6de88ee5372" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: asientos_contables FK_35319e7792ba5247326e9e65bcc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asientos_contables
    ADD CONSTRAINT "FK_35319e7792ba5247326e9e65bcc" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: cotizacion_detalles FK_35e5828a92757043429f81ec051; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_detalles
    ADD CONSTRAINT "FK_35e5828a92757043429f81ec051" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: movimientos_inventario FK_36a689b5824051c8a5308fcf08c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "FK_36a689b5824051c8a5308fcf08c" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: bancos_conciliacion FK_39eb541ea131bf9b5f009fcefc4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos_conciliacion
    ADD CONSTRAINT "FK_39eb541ea131bf9b5f009fcefc4" FOREIGN KEY ("cuentaId") REFERENCES public.cuentas_bancarias(id);


--
-- Name: proyecto_tareas FK_3b644a56aa698cf0e3e5e348729; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tareas
    ADD CONSTRAINT "FK_3b644a56aa698cf0e3e5e348729" FOREIGN KEY ("asignadoId") REFERENCES public.users(id);


--
-- Name: nomina_anticipos FK_3e371209bd91bf50d3673acc44d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_anticipos
    ADD CONSTRAINT "FK_3e371209bd91bf50d3673acc44d" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: seriales_producto FK_3e3e5b7573b26d4184cd0ec0b3b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seriales_producto
    ADD CONSTRAINT "FK_3e3e5b7573b26d4184cd0ec0b3b" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: transferencias_almacen FK_3ead6b659faea17e656e5e79ca2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen
    ADD CONSTRAINT "FK_3ead6b659faea17e656e5e79ca2" FOREIGN KEY ("almacenOrigenId") REFERENCES public.almacenes(id);


--
-- Name: nomina_prestamos FK_3eefdcf8dc7788750deea6337a4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_prestamos
    ADD CONSTRAINT "FK_3eefdcf8dc7788750deea6337a4" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: ordenes_mantenimiento FK_421af3087f205c0a9abb11e099c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_mantenimiento
    ADD CONSTRAINT "FK_421af3087f205c0a9abb11e099c" FOREIGN KEY ("activoId") REFERENCES public.activos_fijos(id);


--
-- Name: presupuesto_lineas FK_427ed509b232563d86451d2bb6d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_lineas
    ADD CONSTRAINT "FK_427ed509b232563d86451d2bb6d" FOREIGN KEY ("presupuestoId") REFERENCES public.presupuestos(id) ON DELETE CASCADE;


--
-- Name: proyectos FK_43ed19232f3e2e5dc288ff93c74; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT "FK_43ed19232f3e2e5dc288ff93c74" FOREIGN KEY ("responsableId") REFERENCES public.users(id);


--
-- Name: conversiones_uom FK_46dd4ab307c1cb665dadf86531c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversiones_uom
    ADD CONSTRAINT "FK_46dd4ab307c1cb665dadf86531c" FOREIGN KEY ("unidadDesdeId") REFERENCES public.unidades_medida(id);


--
-- Name: conduce_detalles FK_483f6e0edc145dfb90839cc4922; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conduce_detalles
    ADD CONSTRAINT "FK_483f6e0edc145dfb90839cc4922" FOREIGN KEY ("conduceId") REFERENCES public.conduces(id) ON DELETE CASCADE;


--
-- Name: cotizaciones_proveedor FK_48e995b25a9772700d97507d8ea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_proveedor
    ADD CONSTRAINT "FK_48e995b25a9772700d97507d8ea" FOREIGN KEY ("proveedorId") REFERENCES public.proveedores(id);


--
-- Name: devolucion_detalles FK_4b751ce97757fcf2c8883672f92; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_detalles
    ADD CONSTRAINT "FK_4b751ce97757fcf2c8883672f92" FOREIGN KEY ("devolucionId") REFERENCES public.devoluciones(id) ON DELETE CASCADE;


--
-- Name: nomina_lineas FK_4d57e06ed2af2904e5928dd7976; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_lineas
    ADD CONSTRAINT "FK_4d57e06ed2af2904e5928dd7976" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: mensajes_lectura FK_4e8ccbeab6cb8a9b166bc112db8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_lectura
    ADD CONSTRAINT "FK_4e8ccbeab6cb8a9b166bc112db8" FOREIGN KEY ("mensajeId") REFERENCES public.mensajes(id) ON DELETE CASCADE;


--
-- Name: ecf FK_50767a0c308e210559e48d416c6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf
    ADD CONSTRAINT "FK_50767a0c308e210559e48d416c6" FOREIGN KEY ("facturaId") REFERENCES public.facturas(id);


--
-- Name: secuencias_ecf FK_52d14b78b9d42876e890740876c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secuencias_ecf
    ADD CONSTRAINT "FK_52d14b78b9d42876e890740876c" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: mensajes FK_54af4290595a83804f50c43236d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT "FK_54af4290595a83804f50c43236d" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: ordenes_produccion FK_55d91ecb550346f037e7444569b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_produccion
    ADD CONSTRAINT "FK_55d91ecb550346f037e7444569b" FOREIGN KEY ("listaId") REFERENCES public.listas_materiales(id);


--
-- Name: cotizaciones FK_560f1208188debff54bd1af2b6b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT "FK_560f1208188debff54bd1af2b6b" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: cotizaciones_proveedor FK_5656d9fbc977d8098e541031c0e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_proveedor
    ADD CONSTRAINT "FK_5656d9fbc977d8098e541031c0e" FOREIGN KEY ("solicitudId") REFERENCES public.solicitudes_compra(id);


--
-- Name: pre_factura_detalles FK_5872905b5fc83dd3b618e0f98f2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_factura_detalles
    ADD CONSTRAINT "FK_5872905b5fc83dd3b618e0f98f2" FOREIGN KEY ("preFacturaId") REFERENCES public.pre_facturas(id) ON DELETE CASCADE;


--
-- Name: depreciaciones_activos FK_596827f392ecf96c9cd97a4fdbb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciaciones_activos
    ADD CONSTRAINT "FK_596827f392ecf96c9cd97a4fdbb" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: devoluciones FK_5e96ffb26ccaf2159bf533e87ef; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT "FK_5e96ffb26ccaf2159bf533e87ef" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: movimientos_inventario FK_602d638031eaa734b416d80b0bd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT "FK_602d638031eaa734b416d80b0bd" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: crm_oportunidades FK_61370729e1a96a5a1c7f1926d34; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_oportunidades
    ADD CONSTRAINT "FK_61370729e1a96a5a1c7f1926d34" FOREIGN KEY ("responsableId") REFERENCES public.users(id);


--
-- Name: evaluaciones_empleado FK_61795909d42d8edb6a7781df38f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_empleado
    ADD CONSTRAINT "FK_61795909d42d8edb6a7781df38f" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: wms_lineas_picking FK_6482ef86632c0b2210fbb30378c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_lineas_picking
    ADD CONSTRAINT "FK_6482ef86632c0b2210fbb30378c" FOREIGN KEY ("ordenId") REFERENCES public.wms_ordenes_picking(id) ON DELETE CASCADE;


--
-- Name: movimientos_estadisticos FK_64a839e9cf2f10d173a95606ca6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_estadisticos
    ADD CONSTRAINT "FK_64a839e9cf2f10d173a95606ca6" FOREIGN KEY ("cuentaId") REFERENCES public.cuentas_estadisticas(id);


--
-- Name: contratos FK_64e21418a6674a9a4301f153eb7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT "FK_64e21418a6674a9a4301f153eb7" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: crm_actividades FK_66d6893525cb82142376e8ecd04; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_actividades
    ADD CONSTRAINT "FK_66d6893525cb82142376e8ecd04" FOREIGN KEY ("usuarioId") REFERENCES public.users(id);


--
-- Name: cuentas_por_pagar FK_67ffb6d3b4d42df26919da3e79c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT "FK_67ffb6d3b4d42df26919da3e79c" FOREIGN KEY ("proveedorId") REFERENCES public.proveedores(id);


--
-- Name: componentes_lm FK_68599b7bc73606dacd8b3618427; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.componentes_lm
    ADD CONSTRAINT "FK_68599b7bc73606dacd8b3618427" FOREIGN KEY ("listaId") REFERENCES public.listas_materiales(id) ON DELETE CASCADE;


--
-- Name: facturas_recurrentes FK_695b5bc97984122292b8dd0a0f4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas_recurrentes
    ADD CONSTRAINT "FK_695b5bc97984122292b8dd0a0f4" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: devoluciones FK_69ddc02af394bc1a77dead42d82; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT "FK_69ddc02af394bc1a77dead42d82" FOREIGN KEY ("facturaId") REFERENCES public.facturas(id);


--
-- Name: lotes_producto FK_6a910bc3c2c517b4c487b390060; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_producto
    ADD CONSTRAINT "FK_6a910bc3c2c517b4c487b390060" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: regla_distribucion_lineas FK_6b4c0794c602130f23388672498; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regla_distribucion_lineas
    ADD CONSTRAINT "FK_6b4c0794c602130f23388672498" FOREIGN KEY ("reglaId") REFERENCES public.reglas_distribucion(id) ON DELETE CASCADE;


--
-- Name: cuentas_por_pagar FK_6c38073a5d80af801a8ee87be2d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT "FK_6c38073a5d80af801a8ee87be2d" FOREIGN KEY ("compraId") REFERENCES public.compras(id);


--
-- Name: conteo_ajustes FK_6e08037433d7686be2bb0412d9a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteo_ajustes
    ADD CONSTRAINT "FK_6e08037433d7686be2bb0412d9a" FOREIGN KEY ("aplicadoPorId") REFERENCES public.users(id);


--
-- Name: devoluciones FK_6ea2c311da94e489b1cefda1ae7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT "FK_6ea2c311da94e489b1cefda1ae7" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: notas_credito_compras FK_6f40d6d875b951a8e1e57901fbf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito_compras
    ADD CONSTRAINT "FK_6f40d6d875b951a8e1e57901fbf" FOREIGN KEY ("proveedorId") REFERENCES public.proveedores(id);


--
-- Name: ordenes_servicio FK_715fb95c180484bbb88c45df257; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio
    ADD CONSTRAINT "FK_715fb95c180484bbb88c45df257" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: registro_etapas_orden FK_73608a4772848e6aa32fdd28f6f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registro_etapas_orden
    ADD CONSTRAINT "FK_73608a4772848e6aa32fdd28f6f" FOREIGN KEY ("ordenId") REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE;


--
-- Name: pagos_cobrados FK_74203d581b2636baa8d084cc60e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_cobrados
    ADD CONSTRAINT "FK_74203d581b2636baa8d084cc60e" FOREIGN KEY ("reciboCobroId") REFERENCES public.recibos_cobro(id) ON DELETE SET NULL;


--
-- Name: notas_debito FK_7455f275c49cef98a3f3754519f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_debito
    ADD CONSTRAINT "FK_7455f275c49cef98a3f3754519f" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: asignaciones_costo FK_765f857b77a573febbc76694b78; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_costo
    ADD CONSTRAINT "FK_765f857b77a573febbc76694b78" FOREIGN KEY ("centroCostoId") REFERENCES public.centros_costo(id);


--
-- Name: hitos_proyecto FK_78ca3038edc4a4b59675a0dbdd3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hitos_proyecto
    ADD CONSTRAINT "FK_78ca3038edc4a4b59675a0dbdd3" FOREIGN KEY ("proyectoId") REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: cotizaciones FK_7a7f77d7f881bbc1de890dfe4f1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT "FK_7a7f77d7f881bbc1de890dfe4f1" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: proyecto_tiempos FK_7d6f9df15db34f122e79dbd9a2c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tiempos
    ADD CONSTRAINT "FK_7d6f9df15db34f122e79dbd9a2c" FOREIGN KEY ("proyectoId") REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: sucursales FK_7eeecc47641df1f4792bc4c79a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sucursales
    ADD CONSTRAINT "FK_7eeecc47641df1f4792bc4c79a7" FOREIGN KEY ("empresaId") REFERENCES public.empresa(id);


--
-- Name: usuario_empresa FK_802d1738e306004674232be8fd6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_empresa
    ADD CONSTRAINT "FK_802d1738e306004674232be8fd6" FOREIGN KEY ("empresaId") REFERENCES public.empresa(id);


--
-- Name: transferencias_almacen FK_83746a5cd2cdd775a742429c513; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen
    ADD CONSTRAINT "FK_83746a5cd2cdd775a742429c513" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: gastos_importacion_lineas FK_83c415692092d6dd892502d25ac; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos_importacion_lineas
    ADD CONSTRAINT "FK_83c415692092d6dd892502d25ac" FOREIGN KEY ("gastoImportacionId") REFERENCES public.gastos_importacion(id) ON DELETE CASCADE;


--
-- Name: lineas_conteo FK_870c8c26a3a60326a585bfbe28f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "FK_870c8c26a3a60326a585bfbe28f" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: movimientos_bancarios FK_8b09fe82251d9640db0434a2c19; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_bancarios
    ADD CONSTRAINT "FK_8b09fe82251d9640db0434a2c19" FOREIGN KEY ("cuentaBancariaId") REFERENCES public.cuentas_bancarias(id);


--
-- Name: proyecto_tiempos FK_8c50c52ef9effe85d59b85e8cbf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tiempos
    ADD CONSTRAINT "FK_8c50c52ef9effe85d59b85e8cbf" FOREIGN KEY ("usuarioId") REFERENCES public.users(id);


--
-- Name: conciliaciones_bancarias FK_90077dd1340ae2083b77527fc63; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_bancarias
    ADD CONSTRAINT "FK_90077dd1340ae2083b77527fc63" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: solicitud_compra_lineas FK_901c009cac54dc5e6a73e3f9019; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_compra_lineas
    ADD CONSTRAINT "FK_901c009cac54dc5e6a73e3f9019" FOREIGN KEY ("solicitudId") REFERENCES public.solicitudes_compra(id) ON DELETE CASCADE;


--
-- Name: devolucion_detalles FK_907f8def39166b5db933182fc87; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_detalles
    ADD CONSTRAINT "FK_907f8def39166b5db933182fc87" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: contratos FK_92d59bbd5608b6aa82694dcd7a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT "FK_92d59bbd5608b6aa82694dcd7a1" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: pro_forma_items FK_93a97d3646813e75905f3a73e22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_forma_items
    ADD CONSTRAINT "FK_93a97d3646813e75905f3a73e22" FOREIGN KEY ("proFormaId") REFERENCES public.pro_formas(id) ON DELETE CASCADE;


--
-- Name: nomina_lineas FK_952dfe2f906dd7899b10ca5bc82; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_lineas
    ADD CONSTRAINT "FK_952dfe2f906dd7899b10ca5bc82" FOREIGN KEY ("periodoId") REFERENCES public.nomina_periodos(id);


--
-- Name: ausencias FK_9588e888f104e77b4c96acc1777; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ausencias
    ADD CONSTRAINT "FK_9588e888f104e77b4c96acc1777" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: etapas_ruta FK_99c5929b9e615be485a9a661b1c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_ruta
    ADD CONSTRAINT "FK_99c5929b9e615be485a9a661b1c" FOREIGN KEY ("centroTrabajoId") REFERENCES public.centros_trabajo(id);


--
-- Name: usuario_empresa FK_9c9d4df5bf8786527c8ee696817; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_empresa
    ADD CONSTRAINT "FK_9c9d4df5bf8786527c8ee696817" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: conteo_ajustes FK_9cb4063c4730f71c9e1839d9a77; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteo_ajustes
    ADD CONSTRAINT "FK_9cb4063c4730f71c9e1839d9a77" FOREIGN KEY ("conteoId") REFERENCES public.conteos_inventario(id);


--
-- Name: ordenes_servicio FK_9cfaa11576098d7db2a3180c8b9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio
    ADD CONSTRAINT "FK_9cfaa11576098d7db2a3180c8b9" FOREIGN KEY ("tecnicoId") REFERENCES public.users(id);


--
-- Name: cuentas_por_cobrar FK_a4c6d57b8662d31e0b44ad2ceb7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT "FK_a4c6d57b8662d31e0b44ad2ceb7" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: solicitudes_vacacion FK_a62e339a0e18f06bbf8529945b0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_vacacion
    ADD CONSTRAINT "FK_a62e339a0e18f06bbf8529945b0" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: pagos_cobrados FK_a67b8d37f187a7ac7705dcde11e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_cobrados
    ADD CONSTRAINT "FK_a67b8d37f187a7ac7705dcde11e" FOREIGN KEY ("cuentaPorCobrarId") REFERENCES public.cuentas_por_cobrar(id) ON DELETE CASCADE;


--
-- Name: plan_demanda_lineas FK_a6e90c188f8b18f83f3a0fe6e57; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_demanda_lineas
    ADD CONSTRAINT "FK_a6e90c188f8b18f83f3a0fe6e57" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: notas_credito FK_a737ba941a940bbb64a8f61c5c3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_credito
    ADD CONSTRAINT "FK_a737ba941a940bbb64a8f61c5c3" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: reportes_generados FK_a8021b9612302d47ddf7a6fa83d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_generados
    ADD CONSTRAINT "FK_a8021b9612302d47ddf7a6fa83d" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: mensajes_lectura FK_a8fc8c043224a8128aba64c369e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_lectura
    ADD CONSTRAINT "FK_a8fc8c043224a8128aba64c369e" FOREIGN KEY ("usuarioId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: registros_flota FK_a98f9cf07b541987de78d382c15; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_flota
    ADD CONSTRAINT "FK_a98f9cf07b541987de78d382c15" FOREIGN KEY ("vehiculoId") REFERENCES public.vehiculos(id);


--
-- Name: programas_mantenimiento FK_afdef243119e86bbcdf6358d78e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas_mantenimiento
    ADD CONSTRAINT "FK_afdef243119e86bbcdf6358d78e" FOREIGN KEY ("activoId") REFERENCES public.activos_fijos(id);


--
-- Name: stock_almacen FK_afefa3d52e2643f102d79c867e8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_almacen
    ADD CONSTRAINT "FK_afefa3d52e2643f102d79c867e8" FOREIGN KEY ("almacenId") REFERENCES public.almacenes(id);


--
-- Name: conversiones_uom FK_b111b60c8b4ab472d090c07cae6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversiones_uom
    ADD CONSTRAINT "FK_b111b60c8b4ab472d090c07cae6" FOREIGN KEY ("unidadHastaId") REFERENCES public.unidades_medida(id);


--
-- Name: solicitudes_compra FK_b22492dcb6b69a76cfc06ae8b19; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_compra
    ADD CONSTRAINT "FK_b22492dcb6b69a76cfc06ae8b19" FOREIGN KEY ("solicitanteId") REFERENCES public.users(id);


--
-- Name: pagos_cobrados FK_b2bb68f7f0cc5cb8e2e9dd8ef48; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_cobrados
    ADD CONSTRAINT "FK_b2bb68f7f0cc5cb8e2e9dd8ef48" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: cuentas_por_pagar FK_b331ebcc6d57218b4b49f5bc2b2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT "FK_b331ebcc6d57218b4b49f5bc2b2" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: lineas_conteo FK_b36afb86871efc57bda0684606f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_conteo
    ADD CONSTRAINT "FK_b36afb86871efc57bda0684606f" FOREIGN KEY ("contadaPorId") REFERENCES public.users(id);


--
-- Name: activos_fijos FK_b43c6cbf20aeda0d4609d04c891; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos_fijos
    ADD CONSTRAINT "FK_b43c6cbf20aeda0d4609d04c891" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: orden_servicio_detalles FK_b63676344af6ee193c3d19570c6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_servicio_detalles
    ADD CONSTRAINT "FK_b63676344af6ee193c3d19570c6" FOREIGN KEY ("ordenId") REFERENCES public.ordenes_servicio(id) ON DELETE CASCADE;


--
-- Name: conteos_inventario FK_b80f82cc35ecf8b18aa0196e430; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario
    ADD CONSTRAINT "FK_b80f82cc35ecf8b18aa0196e430" FOREIGN KEY ("almacenId") REFERENCES public.almacenes(id);


--
-- Name: stock_almacen FK_b931eae37e4ee2a01076114c660; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_almacen
    ADD CONSTRAINT "FK_b931eae37e4ee2a01076114c660" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: cuentas_por_cobrar FK_b9bcdb988f0d368c12dd5623c5f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT "FK_b9bcdb988f0d368c12dd5623c5f" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: conteos_inventario FK_bcf24fc72da707e10c028fd6889; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario
    ADD CONSTRAINT "FK_bcf24fc72da707e10c028fd6889" FOREIGN KEY ("cerradoPorId") REFERENCES public.users(id);


--
-- Name: depreciaciones_activos FK_bd46ff5e1d2c22e5ee49df74be2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciaciones_activos
    ADD CONSTRAINT "FK_bd46ff5e1d2c22e5ee49df74be2" FOREIGN KEY ("activoId") REFERENCES public.activos_fijos(id);


--
-- Name: facturas FK_be6dba2298d9414913463f492bb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT "FK_be6dba2298d9414913463f492bb" FOREIGN KEY ("clienteId") REFERENCES public.clientes(id);


--
-- Name: conteo_ajustes FK_be78c10d7036dd61721edda5edc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteo_ajustes
    ADD CONSTRAINT "FK_be78c10d7036dd61721edda5edc" FOREIGN KEY ("lineaId") REFERENCES public.lineas_conteo(id);


--
-- Name: producto_proveedor FK_c0d025cc1126306805bd400a00f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_proveedor
    ADD CONSTRAINT "FK_c0d025cc1126306805bd400a00f" FOREIGN KEY ("proveedorId") REFERENCES public.proveedores(id) ON DELETE CASCADE;


--
-- Name: compra_detalles FK_c12b88bf411b93bb28c08f1252a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalles
    ADD CONSTRAINT "FK_c12b88bf411b93bb28c08f1252a" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: nota_credito_detalles FK_c26eee02435f1184e1fa13fd7ad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_detalles
    ADD CONSTRAINT "FK_c26eee02435f1184e1fa13fd7ad" FOREIGN KEY ("notaCreditoId") REFERENCES public.notas_credito(id) ON DELETE CASCADE;


--
-- Name: contratos_laborales FK_c37a426fd45b02aa9fc1e06aa6b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_laborales
    ADD CONSTRAINT "FK_c37a426fd45b02aa9fc1e06aa6b" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: nomina_periodos FK_c64e9058b86007b76e36c2d1fd9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_periodos
    ADD CONSTRAINT "FK_c64e9058b86007b76e36c2d1fd9" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: compras FK_ccbc87d4d0703f780e5f55f1f04; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT "FK_ccbc87d4d0703f780e5f55f1f04" FOREIGN KEY ("proveedorId") REFERENCES public.proveedores(id);


--
-- Name: pagos_realizados FK_cd5c1c69550e7f8aa2157f0d88b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_realizados
    ADD CONSTRAINT "FK_cd5c1c69550e7f8aa2157f0d88b" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: cuenta_anexo_ir2 FK_ceba2caebe958a1417eb52e8b45; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_anexo_ir2
    ADD CONSTRAINT "FK_ceba2caebe958a1417eb52e8b45" FOREIGN KEY ("cuentaContableId") REFERENCES public.cuentas_contables(id) ON DELETE CASCADE;


--
-- Name: cotizaciones FK_cf47e975a1b4583dc3eb4323c3e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT "FK_cf47e975a1b4583dc3eb4323c3e" FOREIGN KEY ("facturaId") REFERENCES public.facturas(id);


--
-- Name: ecf FK_d40c4fed3bb270e6a1900ae8e08; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf
    ADD CONSTRAINT "FK_d40c4fed3bb270e6a1900ae8e08" FOREIGN KEY ("secuenciaId") REFERENCES public.secuencias_ecf(id);


--
-- Name: transferencias_almacen FK_d556cdd104001a126fd8d5a2121; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_almacen
    ADD CONSTRAINT "FK_d556cdd104001a126fd8d5a2121" FOREIGN KEY ("almacenDestinoId") REFERENCES public.almacenes(id);


--
-- Name: ecf FK_d9753b6383161054346c4f4a82d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ecf
    ADD CONSTRAINT "FK_d9753b6383161054346c4f4a82d" FOREIGN KEY ("tipoECFId") REFERENCES public.tipos_ecf(id);


--
-- Name: conciliaciones_bancarias FK_dcd279b42c5cd13cc768fbf4a34; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliaciones_bancarias
    ADD CONSTRAINT "FK_dcd279b42c5cd13cc768fbf4a34" FOREIGN KEY ("cuentaBancariaId") REFERENCES public.cuentas_bancarias(id);


--
-- Name: registro_etapas_orden FK_dcf32c147d4f8ef4299fcada3a2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registro_etapas_orden
    ADD CONSTRAINT "FK_dcf32c147d4f8ef4299fcada3a2" FOREIGN KEY ("etapaId") REFERENCES public.etapas_ruta(id);


--
-- Name: presupuesto_proyecto_lineas FK_ded4599fd4f80b7425180b1b70b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuesto_proyecto_lineas
    ADD CONSTRAINT "FK_ded4599fd4f80b7425180b1b70b" FOREIGN KEY ("proyectoId") REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: valores_atributo FK_e0cd4eca42baee9b94771567b98; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_atributo
    ADD CONSTRAINT "FK_e0cd4eca42baee9b94771567b98" FOREIGN KEY ("atributoId") REFERENCES public.atributos_producto(id) ON DELETE CASCADE;


--
-- Name: nota_credito_compra_detalles FK_e0d7720b7d5dcf9dfc448db865b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_credito_compra_detalles
    ADD CONSTRAINT "FK_e0d7720b7d5dcf9dfc448db865b" FOREIGN KEY ("notaCreditoCompraId") REFERENCES public.notas_credito_compras(id) ON DELETE CASCADE;


--
-- Name: conteos_inventario FK_e1c28f0e2ad88eda7e2757504fe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conteos_inventario
    ADD CONSTRAINT "FK_e1c28f0e2ad88eda7e2757504fe" FOREIGN KEY ("generadoPorId") REFERENCES public.users(id);


--
-- Name: asiento_lineas FK_e4be7a98fc697e3435a9b1dddb0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asiento_lineas
    ADD CONSTRAINT "FK_e4be7a98fc697e3435a9b1dddb0" FOREIGN KEY ("asientoId") REFERENCES public.asientos_contables(id) ON DELETE CASCADE;


--
-- Name: nota_debito_detalles FK_e629bd2b4aa3791f48610a2328a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nota_debito_detalles
    ADD CONSTRAINT "FK_e629bd2b4aa3791f48610a2328a" FOREIGN KEY ("notaDebitoId") REFERENCES public.notas_debito(id) ON DELETE CASCADE;


--
-- Name: periodos_contables FK_e734ef0c294a15f9dbebd478fa7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_contables
    ADD CONSTRAINT "FK_e734ef0c294a15f9dbebd478fa7" FOREIGN KEY ("cerradoPorId") REFERENCES public.users(id);


--
-- Name: presupuestos FK_e7490223053bc516cbec596e803; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos
    ADD CONSTRAINT "FK_e7490223053bc516cbec596e803" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: cotizacion_detalles FK_e87b084fdfb196ee035eedcd5c3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_detalles
    ADD CONSTRAINT "FK_e87b084fdfb196ee035eedcd5c3" FOREIGN KEY ("cotizacionId") REFERENCES public.cotizaciones(id) ON DELETE CASCADE;


--
-- Name: activos_fijos FK_ec04e8f0199b42b5f52998055a6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos_fijos
    ADD CONSTRAINT "FK_ec04e8f0199b42b5f52998055a6" FOREIGN KEY ("categoriaId") REFERENCES public.categorias_activos(id);


--
-- Name: wms_lineas_picking FK_edc30b73e85be5e4b2f2a557dbe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_lineas_picking
    ADD CONSTRAINT "FK_edc30b73e85be5e4b2f2a557dbe" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: producto_proveedor FK_ee6b148d2fa49544f4cc1d94156; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_proveedor
    ADD CONSTRAINT "FK_ee6b148d2fa49544f4cc1d94156" FOREIGN KEY ("productoId") REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: wms_ordenes_picking FK_eec49c5c35795f37c394252373f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ordenes_picking
    ADD CONSTRAINT "FK_eec49c5c35795f37c394252373f" FOREIGN KEY ("operadorId") REFERENCES public.users(id);


--
-- Name: nomina_novedades FK_f442e294b1201fa09296abc9944; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomina_novedades
    ADD CONSTRAINT "FK_f442e294b1201fa09296abc9944" FOREIGN KEY ("empleadoId") REFERENCES public.empleados(id);


--
-- Name: wms_ordenes_picking FK_f4f650b110b8f543a8a6866c48f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ordenes_picking
    ADD CONSTRAINT "FK_f4f650b110b8f543a8a6866c48f" FOREIGN KEY ("almacenId") REFERENCES public.almacenes(id);


--
-- Name: proyecto_tareas FK_f96718989490ae78fa494211b47; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyecto_tareas
    ADD CONSTRAINT "FK_f96718989490ae78fa494211b47" FOREIGN KEY ("proyectoId") REFERENCES public.proyectos(id) ON DELETE CASCADE;


--
-- Name: compras FK_fb09b81b8bc5a9c6cec96375ef0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT "FK_fb09b81b8bc5a9c6cec96375ef0" FOREIGN KEY ("usuarioId") REFERENCES public.users(id);


--
-- Name: wms_ubicaciones FK_fb67ac07c843ef9902079ff582c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_ubicaciones
    ADD CONSTRAINT "FK_fb67ac07c843ef9902079ff582c" FOREIGN KEY ("almacenId") REFERENCES public.almacenes(id);


--
-- Name: pagos_realizados FK_fbacf2a654df5deb91122e6bad7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_realizados
    ADD CONSTRAINT "FK_fbacf2a654df5deb91122e6bad7" FOREIGN KEY ("cuentaPorPagarId") REFERENCES public.cuentas_por_pagar(id) ON DELETE CASCADE;


--
-- Name: cheques FK_fe13d08875bbe2c34ad355bbbe0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT "FK_fe13d08875bbe2c34ad355bbbe0" FOREIGN KEY ("chequeraId") REFERENCES public.chequeras(id);


--
-- Name: asiento_lineas FK_ffaf909c270468d2336bffa8a66; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asiento_lineas
    ADD CONSTRAINT "FK_ffaf909c270468d2336bffa8a66" FOREIGN KEY ("cuentaContableId") REFERENCES public.cuentas_contables(id);


--
-- Name: producto_variantes FK_ffc86eff7615749b06202c731ad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT "FK_ffc86eff7615749b06202c731ad" FOREIGN KEY ("productoId") REFERENCES public.productos(id);


--
-- Name: clientes fk_clientes_xlink_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT fk_clientes_xlink_empresa FOREIGN KEY ("xlinkEmpresaXlinkId") REFERENCES public.empresa("xlinkId") ON DELETE SET NULL;


--
-- Name: proveedores fk_proveedores_xlink_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT fk_proveedores_xlink_empresa FOREIGN KEY ("xlinkEmpresaXlinkId") REFERENCES public.empresa("xlinkId") ON DELETE SET NULL;


--
-- Name: xlink_documentos fk_xlink_doc_destino_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos
    ADD CONSTRAINT fk_xlink_doc_destino_empresa FOREIGN KEY ("destinoEmpresaId") REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: xlink_documentos fk_xlink_doc_origen_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos
    ADD CONSTRAINT fk_xlink_doc_origen_empresa FOREIGN KEY ("origenEmpresaId") REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: xlink_documentos fk_xlink_doc_padre; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xlink_documentos
    ADD CONSTRAINT fk_xlink_doc_padre FOREIGN KEY ("xlinkPadreId") REFERENCES public.xlink_documentos(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

