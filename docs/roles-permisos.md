# Roles y Permisos — HiCloud ERP
**Última actualización:** 2026-05-23  
**Versión:** Sistema multi-tenant con 5 niveles de acceso

---

## Roles disponibles

| Rol | Valor interno | Descripción |
|---|---|---|
| 👑 Administrador | `admin` | Acceso total al sistema de la empresa |
| 📊 Contador | `contador` | Contabilidad, finanzas, reportes DGII completos |
| 🛒 Vendedor | `vendedor` | Ventas, POS, clientes, cotizaciones |
| 👁️ Solo lectura | `viewer` | Consulta de documentos sin creación ni edición |
| 🔧 Super Admin | `super_admin` | Administrador global de la plataforma HiCloud |

---

## Flujo de invitación

```
Admin → Equipo & Accesos → Invitar usuario
  ↓
Ingresa email + selecciona rol
  ↓
Backend: POST /invitaciones
  ↓
Email enviado con enlace /invitacion/:token (válido 48h)
  ↓
Usuario abre enlace → AcceptInvitePage
  ↓
Si es nuevo usuario: ingresa nombre + contraseña
Si ya tiene cuenta: click "Aceptar y unirme"
  ↓
Backend: POST /invitaciones/aceptar/:token
  → Crea usuario (si nuevo) con role=rol_invitación
  → Crea UsuarioEmpresa (asignación empresa-usuario)
  ↓
Usuario hace login → JWT con role y empresaId
  ↓
Estado en Equipo & Accesos: Pendiente → Aceptada
```

**Nota SMTP:** Si el servidor de email no está configurado, el backend retorna `emailEnviado: false` + el enlace directo. El admin puede copiar y compartir el enlace manualmente.

---

## Matriz de permisos por módulo

### 🏢 Páginas / módulos visibles

| Módulo / Ruta | Admin | Contador | Vendedor | Viewer |
|---|:---:|:---:|:---:|:---:|
| Dashboard `/dashboard` | ✅ | ✅ | ✅ | ✅ |
| Punto de Venta `/pos` | ✅ | ✅ | ✅ | ❌ |
| Facturas `/facturas` | ✅ | ✅ | ✅ | ✅ 👁️ |
| Cotizaciones `/cotizaciones` | ✅ | ✅ | ✅ | ❌ |
| Clientes `/clientes` | ✅ | ✅ | ✅ | ✅ 👁️ |
| Productos `/productos` | ✅ | ✅ | ❌ | ✅ 👁️ |
| Compras `/compras` | ✅ | ✅ | ❌ | ❌ |
| Proveedores `/proveedores` | ✅ | ✅ | ❌ | ❌ |
| Gastos `/gastos` | ✅ | ✅ | ❌ | ❌ |
| Inventario `/inventario` | ✅ | ✅ | ❌ | ❌ |
| Caja `/caja` | ✅ | ✅ | ❌ | ❌ |
| Reportes DGII `/reportes` | ✅ | ✅ | ❌ | ❌ |
| Declaraciones `/declaraciones` | ✅ | ✅ | ❌ | ❌ |
| Contabilidad `/contabilidad` | ✅ | ✅ | ❌ | ❌ |
| Libro Mayor `/libro-mayor` | ✅ | ✅ | ❌ | ❌ |
| Bancos `/bancos` | ✅ | ✅ | ❌ | ❌ |
| Tesorería `/tesoreria` | ✅ | ✅ | ❌ | ❌ |
| Cheques `/cheques` | ✅ | ✅ | ❌ | ❌ |
| CxC (cobros) `/cxc` | ✅ | ✅ | ❌ | ❌ |
| CxP (pagos) `/cxp` | ✅ | ✅ | ❌ | ❌ |
| Nómina `/nomina` | ✅ | ✅ | ❌ | ❌ |
| Equipo & Accesos `/equipo` | ✅ | ❌ | ❌ | ❌ |
| Configuración `/configuracion` | ✅ | ❌ | ❌ | ❌ |
| Auditoría `/auditoria` | ❌ | ❌ | ❌ | ❌ |
| Super Admin `/super-admin` | ❌ | ❌ | ❌ | ❌ |

> 👁️ = Puede ver pero NO crear/editar/eliminar (botones ocultos via `useCanDo`)
> ❌ = Redireccionado a `/dashboard` si intenta acceder directamente

---

### ⚡ Acciones específicas (hook `useCanDo`)

| Acción | Admin | Contador | Vendedor | Viewer |
|---|:---:|:---:|:---:|:---:|
| `facturas:ver` | ✅ | ✅ | ✅ | ✅ |
| `facturas:crear` | ✅ | ✅ | ✅ | ❌ |
| `facturas:editar` | ✅ | ✅ | ✅ | ❌ |
| `facturas:anular` | ✅ | ✅ | ❌ | ❌ |
| `facturas:eliminar` | ✅ | ❌ | ❌ | ❌ |
| `facturas:pdf` | ✅ | ✅ | ✅ | ❌ |
| `clientes:ver` | ✅ | ✅ | ✅ | ✅ |
| `clientes:crear` | ✅ | ✅ | ✅ | ❌ |
| `clientes:editar` | ✅ | ✅ | ✅ | ❌ |
| `clientes:eliminar` | ✅ | ❌ | ❌ | ❌ |
| `clientes:estado_cuenta` | ✅ | ✅ | ❌ | ❌ |
| `productos:ver` | ✅ | ✅ | ✅ | ✅ |
| `productos:crear` | ✅ | ✅ | ❌ | ❌ |
| `productos:editar` | ✅ | ✅ | ❌ | ❌ |
| `productos:eliminar` | ✅ | ❌ | ❌ | ❌ |
| `productos:stock` | ✅ | ✅ | ✅ | ❌ |
| `compras:ver` | ✅ | ✅ | ❌ | ❌ |
| `compras:crear` | ✅ | ✅ | ❌ | ❌ |
| `reportes:ventas` | ✅ | ✅ | ✅ | ❌ |
| `reportes:dgii` | ✅ | ✅ | ❌ | ❌ |
| `reportes:financiero` | ✅ | ✅ | ❌ | ❌ |
| `pos:usar` | ✅ | ✅ | ✅ | ❌ |
| `caja:abrir` | ✅ | ✅ | ✅ | ❌ |
| `caja:cerrar` | ✅ | ✅ | ✅ | ❌ |
| `caja:anular` | ✅ | ✅ | ❌ | ❌ |
| `configuracion:ver` | ✅ | ❌ | ❌ | ❌ |
| `configuracion:editar` | ✅ | ❌ | ❌ | ❌ |
| `usuarios:ver` | ✅ | ❌ | ❌ | ❌ |
| `usuarios:editar` | ✅ | ❌ | ❌ | ❌ |

---

## Verificación técnica — Guards por capa

### Backend (NestJS `RolesGuard`)
Los guards verifican `user.role` del JWT en TODOS los endpoints.  
Las rutas sin `@Roles()` requieren solo autenticación (JWT válido).

```typescript
// Ejemplo: solo Admin puede crear/eliminar, todos pueden leer
@Post()
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
create(@Body() dto: CreateProductoDto) { ... }

@Get()  // sin @Roles → cualquier usuario autenticado puede leer
findAll() { ... }

@Delete(':id')
@Roles(UserRole.ADMIN)
remove(@Param() id: number) { ... }
```

### Prueba API directa (403 esperado)
```bash
# Obtener token de vendedor
TOKEN=$(curl -s -X POST https://api.hicloud.com.do/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vendedor@test.com","password":"Test123"}' \
  | jq -r '.accessToken')

# Intentar crear compra con rol vendedor → debe devolver 403
curl -X POST https://api.hicloud.com.do/compras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"proveedorId":1}' 
# Respuesta esperada: {"statusCode":403,"message":"Forbidden resource"}

# Intentar cambiar configuración → debe devolver 403
curl -X PATCH https://api.hicloud.com.do/configuracion \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
# Respuesta esperada: 403
```

### Frontend (`rolPuedeVerRuta` + `useCanDo`)
- **Navegación**: `AppLayout.tsx` → `PATH_ROLES` define rutas por rol → redirige a `/dashboard` si no autorizado
- **Botones de acción**: `useCanDo('accion:especifica')` → devuelve `false` para viewer en acciones de escritura

---

## Endpoints de invitación

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/invitaciones` | Admin | Crear invitación + enviar email |
| `GET` | `/invitaciones/empresa/:id` | Admin | Listar invitaciones de la empresa |
| `DELETE` | `/invitaciones/:id` | Admin | Cancelar invitación pendiente |
| `GET` | `/invitaciones/aceptar/:token` | Público | Ver datos de invitación |
| `POST` | `/invitaciones/aceptar/:token` | Público | Aceptar + crear cuenta |

### POST `/invitaciones` — Body
```json
{ "email": "contador@empresa.com", "rol": "contador" }
```

### POST `/invitaciones/aceptar/:token` — Body (usuario nuevo)
```json
{ "nombre": "Juan Pérez", "password": "miContraseña123" }
```

### POST `/invitaciones/aceptar/:token` — Body (usuario ya existe)
```json
{}
```

### Respuesta exitosa
```json
{
  "mensaje": "Invitación aceptada",
  "userId": 42,
  "empresaId": 7
}
```

---

## Endpoints de gestión del equipo

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/multi-empresa/:id/usuarios` | Admin | Listar miembros del equipo |
| `PATCH` | `/multi-empresa/:empresaId/usuarios/:userId` | Admin | Cambiar rol del usuario |
| `DELETE` | `/multi-empresa/:empresaId/usuarios/:userId` | Admin | Remover usuario de la empresa |

### PATCH — Cambiar rol
```json
{ "rol": "contador" }
```
- Actualiza `UsuarioEmpresa.rol` (per-empresa)
- Si la empresa es la principal del usuario, también actualiza `User.role` (para JWT)
- Previene auto-degradación: un admin no puede quitarse su propio rol

---

## Limitaciones conocidas

| Limitación | Impacto | Prioridad |
|---|---|---|
| Roles son globales (no per-empresa) | Usuario en 2 empresas con roles distintos → JWT usa rol de empresa principal | Media |
| Cambio de rol no invalida JWT actual | El usuario necesita re-login para que los nuevos permisos apliquen | Baja |
| Dashboard no filtra por usuario | Vendedor ve stats globales, no solo sus ventas | Baja |
| Facturas no filtradas por creador | Vendedor ve todas las facturas, no solo las suyas | Media |

---

## Resumen por rol

### 👑 Administrador (`admin`)
- Acceso total a todos los módulos del sistema
- Único que puede: invitar/remover usuarios, cambiar roles, configurar empresa, ver auditoría
- Puede crear, editar y eliminar cualquier documento

### 📊 Contador (`contador`)
- **Puede ver y usar**: Facturas, Compras, Gastos, Caja, Reportes DGII, Contabilidad, Bancos, Nómina, ECF, Declaraciones, y más
- **No puede**: Configurar la empresa, gestionar usuarios del equipo, acceder al Panel Super Admin
- **No puede eliminar**: Documentos (solo anular con debida trazabilidad)

### 🛒 Vendedor (`vendedor`)
- **Puede ver y usar**: POS, Facturas (crear/editar), Clientes (crear/editar), Cotizaciones
- **No puede**: Ver compras, gastos, contabilidad, reportes DGII, bancos, nomina
- **Permisos limitados**: Puede ajustar stock de productos pero no crear/editar productos
- **Nota**: Puede abrir/cerrar caja desde POS

### 👁️ Solo lectura (`viewer`)
- **Solo puede ver**: Facturas, Clientes, Productos (con botones de acción ocultos)
- **No puede**: Crear ni editar ningún documento, acceder al POS
- **Uso típico**: Auditor externo, socio consultor, directivo de solo consulta

---

*Documentado por Claude Code — HiCloud ERP v2026*
