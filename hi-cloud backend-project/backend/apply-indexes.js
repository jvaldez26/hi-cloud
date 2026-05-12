const { Client } = require('pg');

const tables = [
  'activos_fijos','almacenes','asiento_lineas','asientos_contables','asignaciones_costo',
  'audit_logs','ausencias','categorias_activos','centros_costo','centros_trabajo',
  'chequeras','cheques','comisiones','componentes_lm','compra_detalles',
  'conciliaciones_bancarias','conciliaciones_datafono','contratos','contratos_laborales',
  'conversiones_uom','cotizacion_detalles','cotizacion_proveedor_lineas','cotizaciones_proveedor',
  'crm_actividades','crm_leads','crm_oportunidades','cuentas_bancarias','cuentas_contables',
  'cuentas_estadisticas','cursos_capacitacion','depreciaciones_activos','devolucion_detalles',
  'devoluciones','empleados','encuestas','etapas_ruta','evaluaciones_empleado',
  'factura_detalles','facturas_recurrentes','gastos','hitos_proyecto','invitaciones',
  'licitaciones','listas_materiales','lotes_producto','movimientos_bancarios',
  'movimientos_estadisticos','nomina_lineas','nomina_novedades','nomina_periodos',
  'nota_credito_compra_detalles','nota_debito_detalles','notas_credito_compras','notas_debito',
  'notificaciones_enviadas','objetivos','orden_servicio_detalles','ordenes_mantenimiento',
  'ordenes_produccion','ordenes_servicio','pagos_cobrados','pagos_realizados',
  'plan_demanda_lineas','planes_demanda','pre_factura_detalles','pre_facturas',
  'precios_especiales','presupuesto_lineas','presupuesto_proyecto_lineas','presupuestos',
  'programa_fidelidad','programas_mantenimiento','proveedores','proveedores_ecf',
  'proyecto_tareas','proyecto_tiempos','proyectos','recibos_cobro','registro_etapas_orden',
  'registros_capacitacion','registros_flota','regla_distribucion_lineas','reglas_comision',
  'reglas_distribucion','reportes_generados','respuestas_encuesta','resultados_clave',
  'retenciones_isr','rutas_produccion','secuencias_ecf','seriales_producto',
  'sesiones_capacitacion','solicitud_compra_lineas','solicitudes_compra','solicitudes_vacacion',
  'stock_almacen','suscripciones','terminales_datafono','tickets_soporte',
  'transacciones_tarjeta','transferencias_almacen','unidades_medida','usuario_empresa',
  'valores_atributo','vehiculos','vendedor_clientes','vendedores',
  'wms_lineas_picking','wms_ordenes_picking','wms_ubicaciones',
];

async function run() {
  const c = new Client({
    host: 'hicloud-db.cjc0a822i31y.us-east-2.rds.amazonaws.com',
    port: 5432, user: 'postgres', password: 'Higlobal-4691',
    database: 'hicloud', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  let ok = 0, skip = 0, err = 0;
  const errors = [];

  for (const table of tables) {
    const idxName = `idx_${table}_empresaId`.substring(0, 63);
    const sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${idxName}" ON "${table}"("empresaId")`;
    try {
      await c.query(sql);
      ok++;
      process.stdout.write('✅ ' + table + '\n');
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('IF NOT EXISTS')) {
        skip++;
        process.stdout.write('⏭  ' + table + ' (ya existe)\n');
      } else {
        err++;
        errors.push({ table, error: e.message });
        process.stdout.write('❌ ' + table + ': ' + e.message + '\n');
      }
    }
  }

  console.log('\n══════════════════════════════');
  console.log('RESULTADO:');
  console.log('  ✅ Creados:', ok);
  console.log('  ⏭  Ya existían:', skip);
  console.log('  ❌ Errores:', err);
  if (errors.length) {
    console.log('\nErrores detallados:');
    errors.forEach(e => console.log(' -', e.table, ':', e.error));
  }

  // Verificar total de índices empresaId
  const r = await c.query(`SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%empresaId%'`);
  console.log('\nTotal índices empresaId en BD:', r.rows[0].count);

  await c.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
