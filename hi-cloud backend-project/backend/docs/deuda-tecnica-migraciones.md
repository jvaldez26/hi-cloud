# Deuda técnica: HiCloud no se puede reconstruir desde el repositorio

**Fecha del hallazgo:** 2026-09-14. Encontrado durante la Fase 1 del módulo
educativo, al intentar levantar una base de pruebas local corriendo las 179
migraciones desde cero contra un Postgres vacío. **No es un problema del
módulo educativo** — es un hallazgo de infraestructura que afecta a todo el
ERP. Este documento solo diagnostica; no propone ni aplica ninguna
corrección. Ver la nota al final.

## El hallazgo

`src/migrations/1747360000000-Baseline.ts` es la migración más antigua del
repositorio. Su `up()` está vacío. Su propio comentario lo explica:

> "Esta migración NO hace cambios en la BD porque todas las tablas ya
> existen... Las tablas fueron creadas directamente con TypeORM o SQL
> manual."

Es una forma legítima y común de adoptar un sistema de migraciones sobre una
base de datos que ya existía — pero tiene una consecuencia que, hasta este
hallazgo, nadie había verificado: **"correr las migraciones desde cero" nunca
fue viable**. El Baseline asume que el esquema previo ya está ahí; no lo
crea.

### Alcance verificado (introspección de producción, solo lectura)

Comparé las tablas reales de producción (`pg_tables`) contra cada
`CREATE TABLE` de los archivos en `src/migrations/`:

- **340 tablas existen en producción.**
- **179 tienen su `CREATE TABLE` en alguna migración** (incluye las 31 de
  `1753600000000-CreateEducativoModule.ts`, así que no son 179 migraciones,
  son 179 tablas creadas por migraciones — un archivo puede crear varias).
- **162 no tienen ningún `CREATE TABLE` que las origine.** De esas, 5 son
  backups puntuales de incidentes (`_backup_cajas_huerfanas_20260817`,
  `bkp_cotizacion_corruptos`, `bkp_nc_detalle_103`, `bkp_nombres_corruptos`,
  `folios_backup_20260514`) — no son esquema de aplicación, es esperable que
  no tengan migración. **Quedan 157 tablas de aplicación real sin origen
  rastreable**, prácticamente todo lo creado antes de julio 2026.

<details>
<summary>Lista completa de las 157 tablas sin CREATE TABLE en ninguna migración</summary>

```
activos_fijos, almacenes, anticipo_cliente, aprobaciones, asiento_lineas,
asientos_contables, asignaciones_costo, atributos_producto, audit_logs,
ausencias, backup_registros, cajas_chicas, cargos, categorias_activos,
centros_costo, centros_trabajo, chequeras, cheques, cierres_caja,
cl_autorizaciones_ars, cl_catalogo_servicios, cl_citas, cl_consultas,
cl_examenes_laboratorio, cl_medicos, cl_ordenes_laboratorio, cl_pacientes,
cl_procedimientos, cl_receta_medicamentos, cl_recetas, cl_sala_espera,
cl_signos_vitales, clientes, comisiones, componentes_lm, compra_detalles,
compras, conciliaciones_bancarias, conciliaciones_datafono,
conduce_detalles, conduces, configuraciones_sistema, contratos,
contratos_laborales, conversiones_uom, cotizacion_detalles,
cotizacion_proveedor_lineas, cotizaciones, cotizaciones_proveedor,
credito_cliente, crm_actividades, crm_leads, crm_oportunidades,
cuentas_bancarias, cuentas_contables, cuentas_estadisticas,
cuentas_por_cobrar, cuentas_por_pagar, cuotas, cursos_capacitacion,
demo_requests, depositos_bancarios, depreciaciones_activos,
devolucion_detalles, devoluciones, documentos, ecf, ecf_eventos,
empleados, empresa, empresa_ecf_config, encuestas, evaluaciones_empleado,
factura_detalles, facturas, gastos, grupos_producto, hitos_proyecto,
invitaciones, licitaciones, lotes_producto, movimientos_bancarios,
movimientos_caja_chica, movimientos_estadisticos, movimientos_inventario,
nomina_lineas, nomina_novedades, nomina_periodos, nota_credito_compra_detalles,
nota_credito_detalles, nota_debito_detalles, notas_credito,
notas_credito_compras, notas_debito, notificaciones_enviadas, objetivos,
orden_servicio_detalles, ordenes_mantenimiento, ordenes_servicio,
pagos_cobrados, pagos_realizados, periodos_contables, plan_configuracion,
plan_demanda_lineas, planes_demanda, planes_pago, pr_cobranzas, pr_cuotas,
pr_deudores, pr_garantes, pr_garantias, pr_pagos, pr_prestamos,
pr_productos_prestamo, pr_refinanciamientos, pr_solicitudes,
pre_factura_detalles, pre_facturas, precios_especiales,
presupuesto_lineas, presupuesto_proyecto_lineas, presupuestos,
producto_variantes, productos, programa_fidelidad,
programas_mantenimiento, proveedores, proveedores_ecf, proyecto_tareas,
proyecto_tiempos, proyectos, push_subscriptions, recibos_cobro,
refresh_tokens, registros_capacitacion, registros_flota,
regla_distribucion_lineas, reglas_comision, reglas_descuento,
reglas_distribucion, reportes_dgii, reportes_generados,
respuestas_encuesta, resultados_clave, retenciones_isr, saldo_puntos,
secuencias_ecf, segmentos_cliente, seriales_producto,
sesiones_capacitacion, setup_tokens, solicitud_cambio_plan,
solicitud_compra_lineas, solicitudes_compra, stock_almacen, sucursales,
suscripcion_auditoria, suscripciones, tasas_cambio, terminales_datafono,
tickets_soporte, tipos_ecf, token_blacklist, transacciones_puntos,
transacciones_tarjeta, transferencias_almacen, typeorm_migrations,
unidades_medida, users, usuario_empresa, valores_atributo, vehiculos,
vendedor_clientes, vendedores, wms_lineas_picking, wms_ordenes_picking,
wms_ubicaciones
```

(`typeorm_migrations` no cuenta como gap real: TypeORM la crea sola al
conectar, no necesita migración.)

</details>

### De esas 157, al menos 43 revientan literalmente al correr desde cero

No basta con que la tabla no exista — el problema real es que hay
migraciones **posteriores al Baseline** que hacen `ALTER TABLE` sobre estas
tablas asumiendo que ya existen. En una base vacía, esas migraciones fallan
con `relation "X" does not exist` apenas les toca el turno. Así se descubrió
todo esto: `1747500000000-SuscripcionesPrueba.ts` fue la primera en tronar,
pero no es la única ni la más grave.

<details>
<summary>43 tablas con al menos un ALTER TABLE posterior al Baseline (lista no exhaustiva — solo detecta referencias directas <code>ALTER TABLE nombre</code>, no FKs vía <code>REFERENCES</code> en otras tablas)</summary>

```
activos_fijos, almacenes, asientos_contables, cierres_caja, clientes,
compra_detalles, compras, conduces, cotizacion_detalles, cotizaciones,
cuentas_por_cobrar, cuentas_por_pagar, cuotas, demo_requests, devoluciones,
ecf, empleados, factura_detalles, facturas, gastos, movimientos_inventario,
nomina_lineas, notas_credito, notas_debito, ordenes_mantenimiento,
pagos_cobrados, pagos_realizados, pr_prestamos, pr_productos_prestamo,
pr_solicitudes, pre_factura_detalles, pre_facturas, productos, proveedores,
recibos_cobro, secuencias_ecf, stock_almacen, sucursales, suscripciones,
transferencias_almacen, unidades_medida, users, usuario_empresa
```

</details>

`suscripciones` y `plan_configuracion` — las dos primeras que encontré — no
son un caso aislado. Son 2 de al menos 43.

### El módulo educativo no puede migrar desde cero de ninguna forma

`1753600000000-CreateEducativoModule.ts` declara:

```sql
"clienteId" INTEGER REFERENCES clientes(id) ON DELETE SET NULL   -- x2 (ed_estudiantes, ed_tutores)
"facturaId" INTEGER REFERENCES facturas(id) ON DELETE SET NULL   -- x3 (ed_matriculas, ed_cargos, ed_pagos)
```

`clientes` y `facturas` están en la lista de 157. Aunque nunca las alterara
ninguna otra migración, el propio `CREATE TABLE` de educativo fallaría con
`relation "clientes" does not exist` al intentar declarar la FK. Esto no es
específico de educativo — cualquier módulo nuevo que referencie una tabla
pre-Baseline tiene el mismo problema.

## Una tercera vía de cambios de esquema, y esta no es historia — es presente

`src/seeds/sync.ts` (`npm run db:sync`) compara las entidades TypeORM contra
las columnas reales de la base y agrega con `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS` lo que falte — **directo contra la base que apunte el `.env`
local de quien lo corra, sin pasar por `typeorm_migrations`**.

Verificado:
- **No está en ningún workflow de CI/CD** (`ci.yml`, `deploy.yml`) — grep
  vacío en ambos.
- **No tiene ninguna gate de rol ni de entorno** — es un script de Node
  plano; lo puede correr cualquiera que tenga el repo y un `.env` con
  credenciales de base (que, en este proyecto, es el mismo `.env` que ya
  apunta a producción para cualquiera que clone el backend).
- **No deja ningún registro.** Todo el output es `console.log` a la
  terminal de quien lo corre — no escribe a un archivo, no inserta en
  ninguna tabla de auditoría, no notifica a nada. **No hay forma de saber
  quién lo corrió por última vez, ni cuándo, ni qué columnas agregó.**
- Su propio código (`SKIP_TABLES`) excluye explícitamente `suscripciones`,
  `users`, `empresa`, `configuraciones_sistema`, `demo_requests`,
  `tipos_ecf`, `invitaciones`, `usuario_empresa` — alguien en algún momento
  decidió que tocar esas 8 tablas por esta vía era peligroso. El resto de
  las ~150 tablas pre-Baseline queda abierto a que este script les agregue
  columnas en cualquier momento, sin dejar rastro.
- Su único commit en el historial de git es el commit inicial del
  repositorio (`15d9920c`) — nunca se ha vuelto a tocar el archivo, lo cual
  no dice nada sobre si se ha *ejecutado*.

## La consecuencia real

**HiCloud no se puede reconstruir desde el repositorio.** Si la RDS de
producción se perdiera hoy, correr `git clone` + `npm run migration:run`
desde cero no recrearía el ERP — se detendría en la primera de al menos 43
tablas con un `ALTER TABLE` prematuro, y aun si se lo saltara a mano, el
esquema resultante no tendría columnas que puedan haber sido agregadas
alguna vez por `db:sync` sin dejar rastro en ninguna migración.

La recuperación ante desastres depende enteramente de los backups de S3
(ver `[[project_incidente_rds_2026-09-06]]` para el contexto del último
incidente real de este tipo de riesgo). **Esos backups nunca se han probado
restaurando de verdad** — no hay evidencia en este repo ni en los workflows
de que exista un simulacro de restauración documentado.

## Qué NO hace este documento

No propone una migración de baseline para las 157 (o 43) tablas. Escribir
esa migración correctamente — con el DDL exacto de cada tabla, sus enums,
constraints e índices, verificado contra producción — es un proyecto de
infraestructura aparte, deliberado, que se decide con calma y no como
subproducto de una tarea sobre el módulo educativo. Y **lo primero de ese
proyecto no debería ser escribir migraciones — debería ser verificar que un
backup de S3 restaura de verdad.** Escribir DDL de reconstrucción antes de
saber si el mecanismo de recuperación real (los backups) funciona sería
resolver el problema secundario primero.

Para desbloquear el trabajo de desarrollo local (bases de prueba tipo
`hicloud_test`) mientras ese proyecto no se aborda, ver la sección "Base de
pruebas local" en el `README.md` de este backend: se restaura un dump
schema-only de producción como paso previo a las migraciones, en vez de
intentar recrear el esquema pre-Baseline desde cero.
