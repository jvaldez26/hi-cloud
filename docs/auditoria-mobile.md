# Auditoría Mobile — HiCloud ERP
**Fecha:** 2026-05-23  
**Tester:** valdezsamuel03@gmail.com  
**Breakpoints evaluados:** 375px (Mobile), 768px (Tablet), 1024px+ (Desktop)  

---

## Resumen Ejecutivo

| Módulo | Problemas encontrados | Estado |
|---|---|---|
| AppLayout (global) | `padding: 20` fijo en main-content | ✅ Corregido |
| Login | `minWidth: 310` en label de contraseña (overflow <343px) | ✅ Corregido |
| Register | Layout 2 columnas sin colapsar en mobile | ✅ Corregido |
| Landing Page | Navbar, hero, pricing, banner sin responsive | ✅ Corregido |
| Dashboard | Grid 3-col `repeat(3,1fr)` sin breakpoints | ✅ Corregido |
| Facturas | Header toolbar sin wrap; filtro RangePicker `xs={12}` | ✅ Corregido |
| Clientes | Modal `width={680}` desborda en 375px | ✅ Corregido |
| Compras | Header toolbar sin wrap | ✅ Corregido |
| Inventario | Modales 620/560/480px sin responsive | ✅ Corregido |
| Productos | Modal 700px; header toolbar sin `xs={24}` | ✅ Corregido |
| Reportes | Selects mes/año `width` fijo sin `Col xs` | ✅ Corregido |
| Caja Diaria | Drawer 480px; modales 420/460/460px sin responsive | ✅ Corregido |
| POS | Modales 400px; numpad botones 40px (<44px min) | ✅ Corregido |
| Configuración | Sidebar 240px fijo → solo 135px de contenido | ✅ Corregido |
| Global (tokens.css) | Sin reglas globales de modal responsive | ✅ Corregido |
| Cotizaciones | Toolbar sin wrap; drawer sin responsive; tabla sin scroll | ✅ Corregido |
| CxC / CxP | Toolbar sin wrap | ✅ Corregido |
| FacturasRecurrentes | Toolbar sin `xs={24}` | ✅ Corregido |
| ECF | Filtros con width fijo; acciones sin wrap | ✅ Corregido |
| NotasCredito / NotasDebito | Toolbar flex sin wrap | ✅ Corregido |
| Declaraciones | Toolbar sin wrap; selects ancho fijo | ✅ Corregido |
| Vendedores | Toolbar flex sin wrap | ✅ Corregido |
| Bancos | Toolbar sin `xs={24}` ni `Space wrap` | ✅ Corregido |
| Almacenes | Toolbar sin `xs={24}` ni `Space wrap` | ✅ Corregido |
| Calendario | Toolbar selects sin `xs={24}` ni `Space wrap` | ✅ Corregido |
| Centro de Costos | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Equipo | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Evaluaciones | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Flota | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Licitaciones | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Mantenimiento | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Objetivos | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Presupuestos | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| Proyectos | Toolbar sin wrap; Input width fijo | ✅ Corregido |
| SolicitudesCompra | Ambas columnas sin wrap | ✅ Corregido |
| Backups | Toolbar sin `xs={24}` ni `Space wrap` | ✅ Corregido |
| Tesorería | Ambas columnas (filtros + acciones) sin wrap | ✅ Corregido |
| WMS | Columna filtros sin wrap; Input width fijo | ✅ Corregido |

---

## Commits de Corrección

| Commit | Descripción | Archivos |
|---|---|---|
| `83ea36e` | Auditoría inicial — módulos principales | AppLayout, Login, Dashboard, Facturas, Clientes, Compras, Inventario, Productos, Reportes, Caja, POS, Configuración, tokens.css |
| `5b51868` | Mejoras UI — touch targets + adaptive sizing | POSPage numpad, AnimatedStatCard, TableToolbar |
| `4a6a110` | Docs — reporte auditoria-mobile.md | docs/auditoria-mobile.md |
| `43d4e15` | Módulos secundarios batch 1 | Cotizaciones, CxC, CxP, FacturasRecurrentes, ECF, NotasCredito, NotasDebito |
| `37da057` | Módulos secundarios batch 2 | Declaraciones, Vendedores |
| `1cc0350` | Módulos secundarios batch 3 | Bancos, Almacenes, Calendario, CentroCostos, Equipo, Evaluaciones, Flota, Licitaciones, Mantenimiento, Objetivos, Presupuestos, Proyectos, SolicitudesCompra, Backups, Tesorería, WMS |

---

## Patrones Adoptados

| Patrón | Uso |
|---|---|
| `width="min(NNNpx, 95vw)"` | Todos los modales con ancho fijo ≥400px |
| `<Col xs={24} sm="auto">` | Columna de toolbar de acciones |
| `<Col xs={24} md="auto">` | Columna de filtros (más ancha, colapsa en tablet) |
| `<Space wrap>` | Botones de toolbar para fluir en varias filas |
| `scroll={{ x: 'max-content' }}` | Tablas con columnas de ancho fijo |
| `style={{ width: '100%', maxWidth: NNN, minWidth: 0 }}` | Inputs de búsqueda (evita overflow) |
| `gutter={[0, 8]}` | Row de toolbar para separación vertical en mobile |
| `@media (max-width: 768px) { .ant-modal { max-width: 95vw } }` | Fix global en tokens.css |

---

## Módulos Verificados SIN Issues (ya tenían responsive)

- **GastosPage** — `xs={24} sm="auto"` + `Space wrap` ✅
- **NominaPage** — `Space wrap` ✅  
- **FlujoCajaPage** — `Space wrap` ✅
- **VacacionesPage** — `Space wrap` ✅
- **TSSPage** — `Space wrap` ✅
- **ProveedoresPage** — `Space wrap` ✅
- **ContabilidadPage** — `Space wrap` ✅
- **ChequesPage** — `xs={24} sm="auto"` + `gutter=[0,8]` ✅
- **FacturaFormPage** — `xs={24}` + `scroll={{ x: 'max-content' }}` ✅
- **CompraFormPage** — `xs={24}` + `scroll={{ x: 'max-content' }}` ✅
- **ProfilePage** — sin modales de ancho fijo ✅

---

## Mejoras UI (commit 5b51868)

| Componente | Mejora |
|---|---|
| POSPage Numpad | Botones 40px → 48px (cumple 44px min touch) |
| AnimatedStatCard | Padding y font-size fijos → `clamp()` adaptativo |
| TableToolbar | Gap 12px → 8px |

---

## Fix CSS Global (tokens.css)

```css
@media (max-width: 768px) {
  .ant-modal { max-width: 95vw !important; }
  .ant-drawer-content-wrapper { max-width: 95vw !important; }
  .ant-card-body { padding: 12px !important; }
  .ant-table-wrapper { overflow-x: auto; }
  .ant-pagination { justify-content: center; flex-wrap: wrap; }
  .dashboard-widgets-row { grid-template-columns: 1fr !important; }
}
```

> Esta regla cubre automáticamente cualquier modal/drawer que no haya sido ajustado individualmente.

---

*Auditado y corregido por Claude Code — HiCloud ERP v2026*
