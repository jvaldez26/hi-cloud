# Auditoría de Configuración del Sistema — HiCloud ERP
**Fecha:** 2026-05-21  
**Alcance:** Sección Configuración → Punto de Venta, Facturación, Notificaciones

---

## Resumen Ejecutivo

Todos los toggles y campos se guardaban correctamente en `empresa.configuracion` (JSONB en PostgreSQL).  
El problema era el **lado de consumo**: los sistemas que debían leer y actuar sobre esos valores los ignoraban.

| Sección | Items auditados | Funcionaban antes | Corregidos | Documentados |
|---------|----------------|-------------------|------------|--------------|
| POS | 11 | 0 | 5 | 3 |
| Facturación | 7 | 2 | 4 | 0 |
| Notificaciones | 8 | 3 | 3 | 2 |

---

## 1. PUNTO DE VENTA (POS)

| Item | Estado Antes | Estado Después | Archivo |
|------|-------------|----------------|---------|
| Toggle Efectivo | ❌ POS ignoraba — siempre visible | ✅ Filtrado por `posEfectivo` | POSPage.tsx |
| Toggle Tarjeta crédito | ❌ POS ignoraba — siempre visible | ✅ Filtrado por `posTarjetaCredito` | POSPage.tsx |
| Toggle Tarjeta débito | ❌ POS ignoraba — siempre visible | ✅ Filtrado por `posTarjetaDebito` | POSPage.tsx |
| Toggle Transferencia bancaria | ❌ POS ignoraba — siempre visible | ✅ Filtrado por `posTransferencia` | POSPage.tsx |
| Toggle Cheque | ❌ No aparecía en el POS (btn faltante) | ✅ Botón agregado, visible si `posCheque=true` | POSPage.tsx |
| Toggle Vale/cortesía | ❌ No aparecía en el POS (btn faltante) | ✅ Botón agregado, visible si `posVale=true` | POSPage.tsx |
| Campo Requerir cédula monto | ❌ Hardcoded `>= 250.000` | ✅ Lee `posCedulaMonto` de configuración | POSPage.tsx |
| Toggle Imprimir ticket automáticamente | ❌ Print siempre manual | ✅ Auto-dispara `window.print()` si `posImpresionAuto=true` | POSPage.tsx |
| Toggle Propina activada | ❌ Sin UI de propina en POS | 📋 Pendiente — requiere nuevo campo en checkout + lógica de cálculo de totales |
| Toggle Modo contingencia | ❌ Solo alert visual en Config | 📋 Pendiente — requiere enviar flag al backend y que el ECF service lo respete inmediatamente |
| Toggle Pedir confirmación antes de anular | ❌ Anulación no existe en POS (solo en módulo Facturas) | 📋 Documentado — anulación desde POS no está implementada; aplica en módulo /facturas |

### Notas técnicas

**Métodos de pago**: La lógica de filtrado usa `posConf[flag] !== false` para los métodos que son `true` por defecto (efectivo, tarjeta, transferencia) y `posConf[flag] === true` para los que son `false` por defecto (cheque, vale). El tipo `MetodoPago` fue extendido con `'cheque' | 'vale'`.

**Auto-impresión**: Se implementó como un `useEffect` en `ModalExito` que escucha el cambio de `sale.folio` y `autoImprimir`. Usa un delay de 300ms para garantizar que el DOM del recibo esté renderizado antes de `window.print()`.

---

## 2. FACTURACIÓN

| Item | Estado Antes | Estado Después | Archivo |
|------|-------------|----------------|---------|
| Campo Pie de factura | ✅ Guardado y usado en PDF | ✅ Sin cambios | pdf.service.ts |
| Campo Términos y condiciones | ✅ Guardado y usado en PDF | ✅ Sin cambios | pdf.service.ts |
| Toggle Mostrar logo | ❌ Siempre mostraba aunque estuviera OFF | ✅ Condicional por `factMostrarLogo` | pdf.service.ts |
| Toggle Mostrar teléfono | ❌ Siempre mostraba aunque estuviera OFF | ✅ Condicional por `factMostrarTelefono` | pdf.service.ts |
| Toggle Mostrar correo | ❌ Siempre mostraba aunque estuviera OFF | ✅ Condicional por `factMostrarEmail` | pdf.service.ts |
| Toggle Mostrar sitio web | ❌ Siempre mostraba aunque estuviera OFF | ✅ Condicional por `factMostrarWeb` | pdf.service.ts |
| Toggle Mostrar N.° orden de compra | ❌ Campo no pasado al template | ✅ Condicional por `factMostrarOC` | pdf.service.ts |

### Notas técnicas

En `pdf.service.ts → buildFacturaData()`: se lee `factConf = empresa.configuracion as Record<string, unknown>` y cada campo se retorna como `undefined` cuando el flag correspondiente es `false`. El template HTML ya usaba `{{ if empresaTelefono }}` conditionals, así que no necesitó cambios en el template.

---

## 3. NOTIFICACIONES

| Item | Estado Antes | Estado Después | Archivo |
|------|-------------|----------------|---------|
| Toggle Notificaciones por email | ✅ Verificado en `cronResumenSemanal` | ✅ Sin cambios | notificaciones.service.ts |
| Toggle Notificaciones push (navegador) | ❌ Guardado pero no implementado el envío push | 📋 Pendiente — requiere Service Worker + VAPID keys (infraestructura nueva) |
| Toggle Alertas CxC vencidas | ✅ Verificado en `cronRecordatoriosClientesCxC` | ✅ Sin cambios | notificaciones.service.ts |
| Toggle Alertas CxP próximas | ❌ `cronAlertasDiarias` no verificaba el flag | ✅ Verificado con `notifConf2.notifVencCxP` | notificaciones.service.ts |
| Toggle Alertas stock bajo | ❌ `cronAlertasSemanales` no verificaba el flag | ✅ Verificado con `notifConf.notifStockBajo` | notificaciones.service.ts |
| Toggle Avisos facturas recurrentes | ❌ No existe cron relacionado | 📋 Pendiente — las facturas recurrentes no tienen sistema de alertas por email |
| Toggle Alertas secuencias e-CF | ❌ `cronAlertasSemanales` no verificaba el flag | ✅ Verificado con `notifConf.notifVencECF` | notificaciones.service.ts |
| Botón Enviar recordatorios CxC ahora | ✅ Llama a `POST /notificaciones/disparar/recordatorios-clientes` | ✅ Sin cambios — funcionaba |

### Notas técnicas

**notifPush**: Las notificaciones push de navegador requieren un Service Worker registrado, claves VAPID y una base de datos de suscripciones push. Es una feature de infraestructura separada, no un bug de configuración.

**notifFactRecurrente**: Las facturas recurrentes se generan automáticamente vía cron, pero no tienen sistema de alertas por email cuando fallan o cuando se generan. Implementar requiere modificar el servicio de facturas recurrentes.

**Crons afectados**: Los crons globales (`cronAlertasSemanales`, `cronAlertasDiarias`) ahora leen la configuración de la **primera empresa activa** en la BD. Para arquitecturas multi-tenant esto sería inadecuado, pero HiCloud actualmente opera con un tenant por instancia.

---

## Pendientes no implementados (requieren trabajo futuro)

| Feature | Complejidad | Por qué no se implementó |
|---------|-------------|--------------------------|
| Propina en POS | Alta | Requiere nuevo campo UI, recálculo de totales, modificar DTO de factura |
| Modo contingencia proactivo | Media | Requiere nuevo flag en CreateFacturaDto + lógica en ECF service para saltar MSeller |
| Push notifications | Alta | Requiere Service Worker, VAPID keys, tabla de suscripciones |
| Avisos facturas recurrentes | Media | Requiere nuevo hook en el servicio de generación de facturas recurrentes |
| posConfirmarAnulacion en POS | Baja | La anulación desde el POS no existe — se hace desde módulo Facturas |

---

*Generado automáticamente — última actualización: 2026-05-21*
