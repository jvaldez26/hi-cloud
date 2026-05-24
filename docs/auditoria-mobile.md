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
| Register | Layout 2 columnas sin colapsar en mobile | ✅ Corregido (commit bd1ca69) |
| Landing Page | Navbar, hero, pricing, banner sin responsive | ✅ Corregido (commit 8d23766) |
| Dashboard | Grid 3-col `repeat(3,1fr)` sin breakpoints | ✅ Corregido |
| Facturas | Header toolbar sin wrap; filtro RangePicker `xs={12}` | ✅ Corregido |
| Clientes | Modal `width={680}` desborda en 375px; search `maxWidth: 260` | ✅ Corregido |
| Compras | Header toolbar sin wrap | ✅ Corregido |
| Inventario | Modales 620, 560, 480px sin responsive | ✅ Corregido |
| Productos | Modal 700px; header toolbar sin `xs={24}` | ✅ Corregido |
| Reportes | Selects mes/año `width: 130/100` fijos sin `Col xs` | ✅ Corregido |
| Caja Diaria | Drawer 480px; modales 420, 460, 460px sin responsive | ✅ Corregido |
| POS | Modales 400px en pantalla 375px | ✅ Corregido |
| Configuración | Sidebar 240px fijo en mobile → sólo 135px de contenido | ✅ Corregido (nav horizontal mobile) |
| Global (tokens.css) | Sin reglas globales de modal responsive | ✅ Corregido |

---

## Cambios Implementados

### 1. `tokens.css` — Reglas globales mobile
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

### 2. `AppLayout.tsx` — Padding adaptativo
```tsx
padding: isMobile ? 12 : 20
```

### 3. `LoginPage.tsx` — Eliminar minWidth 310
```tsx
// ANTES
<div style={{ minWidth: 310 }}>
// DESPUÉS
<div style={{ /* sin minWidth */ }}>
```

### 4. `DashboardPage.tsx` — Grid 3-col → responsive via CSS global
- El CSS ya estaba en `tokens.css` con breakpoints 1024px y 768px
- Eliminado `<style>` inline duplicado

### 5. `FacturasPage.tsx` — Header toolbar + filtro fecha
```tsx
<Col xs={24} sm="auto">
  <Space wrap> {/* ← wrap añadido */}
// RangePicker: xs={24} en vez de xs={12}
```

### 6. `ClientesPage.tsx` — Modal responsivo
```tsx
width="min(680px, 95vw)"  // era: width={680}
```

### 7. `ComprasPage.tsx` — Header toolbar wrap
```tsx
<Col xs={24} sm="auto"><Space wrap>
```

### 8. `InventarioPage.tsx` — Modales responsivos
```tsx
width="min(620px, 95vw)"  // Lote
width="min(560px, 95vw)"  // Seriales
width="min(480px, 95vw)"  // Detalle serial
```

### 9. `ProductosPage.tsx` — Modales + toolbar
```tsx
width="min(700px, 95vw)"  // Nuevo producto
width="min(480px, 95vw)"  // Nuevo atributo
<Col xs={24} sm="auto">   // toolbar
```

### 10. `ReportesPage.tsx` — Selects mes/año
```tsx
<Col xs={12} sm="auto">
  <Select style={{ width: '100%', minWidth: 120 }} />
<Col xs={8} sm="auto">
  <Select style={{ width: '100%', minWidth: 90 }} />
```

### 11. `CajaPage.tsx` — Drawer + modales
```tsx
width="min(480px, 95vw)"  // Drawer detalle cierre
width="min(420px, 95vw)"  // Modal abrir caja
width="min(460px, 95vw)"  // Modal cerrar caja
width="min(460px, 95vw)"  // Modal anular cierre
```

### 12. `POSPage.tsx` — Modales checkout/recibo
```tsx
width="min(400px, 95vw)"  // Modal numérico apertura
width="min(400px, 95vw)"  // Modal recibo venta
```

### 13. `ConfiguracionPage.tsx` — Sidebar → nav horizontal en mobile
- Sidebar oculto en ≤768px (`display: none !important`)
- Nav horizontal scrolleable con chips de sección
- Contenido ocupa 100% del ancho en mobile

---

## Patrones Adoptados

| Patrón | Uso |
|---|---|
| `width="min(NNNpx, 95vw)"` | Todos los modales con ancho fijo ≥400px |
| `<Col xs={24} sm="auto">` | Columna de toolbar de acciones |
| `<Space wrap>` | Botones de toolbar |
| `scroll={{ x: 'max-content' }}` | Tablas con columnas de ancho fijo |
| `@media (max-width: 768px) { .ant-modal { max-width: 95vw } }` | Fix global en tokens.css |

---

## Páginas NO Modificadas (sin issues críticos)

- GastosPage — ya tenía `xs={24} sm="auto"` y `Space wrap`
- CxCPage, CxPPage — tablas con scroll, toolbar básico
- ProveedoresPage — cubierto por fix global de modales
- Todas las páginas secundarias (TSS, WMS, Manufactura, etc.) — cubiertos por global

---

## Segunda Pasada — Mejoras UI (commit 5b51868)

| Componente | Mejora | Fix |
|---|---|---|
| POSPage Numpad | Botones 40px → 48px (cumple 44px min touch) | `height: 48, fontSize: 16` |
| AnimatedStatCard | Padding y font-size fijos → adaptativos | `clamp()` en padding y font-size |
| TableToolbar | Gap 12px → 8px en toolbar actions | `gap: 8` |

## Formularios de alta complejidad

- **FacturaFormPage** — ya usa `xs={24}` + `scroll={{ x: 'max-content' }}` ✅
- **CompraFormPage** — ya usa `xs={24}` + `scroll={{ x: 'max-content' }}` ✅
- **ProfilePage** — sin modales de ancho fijo, ya responsive ✅

## Pendientes (no críticos)

- [ ] CotizacionFormPage — revisar tabla de líneas en tablet ≤768px
- [ ] Módulos secundarios de RRHH (Nómina, Vacaciones) — cubiertos por global CSS, ok en tablet

---

*Auditado y corregido por Claude Code — HiCloud ERP v2026*
