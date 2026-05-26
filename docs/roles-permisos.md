# Roles y Permisos — HiCloud ERP
**Última actualización:** 2026-05-25  
**Versión:** Sistema multi-tenant con 6 niveles de acceso

---

## Roles disponibles

| Rol | Valor interno | Descripción |
|---|---|---|
| 👑 Administrador | `admin` | Acceso total al sistema de la empresa |
| 📊 Contador | `contador` | Contabilidad, finanzas, reportes DGII completos |
| 🛒 Vendedor | `vendedor` | Ventas, POS, clientes, cotizaciones |
| 👁️ Solo lectura | `viewer` | Consulta de documentos sin creación ni edición |
| 👤 Empleado | `empleado` | Acceso exclusivo al Portal del Empleado (recibos, perfil, prestaciones) |
| 🔧 Super Admin | `super_admin` | Administrador global de la plataforma HiCloud |

---

## Flujo de invitación

### Usuarios del ERP (admin, contador, vendedor, viewer)
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

### Empleados al Portal del Empleado (rol `empleado`)
```
Admin → Nómina → Empleados → menú "..." → Invitar al Portal del Empleado
  ↓
Confirma email (pre-relleno con el del empleado o se puede cambiar)
  ↓
Backend: POST /nomina/empleados/:id/invitar
  → Crea usuario con role='empleado', passwordConfigured=false
  → Crea UsuarioEmpresa (vinculación al tenant)
  → Vincula empleado.userId = nuevo userId
  → Genera setup token (48h) en tabla setup_tokens
  → Envía email con enlace /setup-password/:token
  ↓
Empleado abre enlace → SetupPasswordPage → establece contraseña
  ↓
Empleado hace login → redirigido automáticamente a /portal-empleado
  ↓
Badge en Nómina → Empleados: "Sin portal" → "✓ Portal activo"
```

**Nota SMTP:** Si el servidor de email no está configurado, el backend retorna `emailEnviado: false` + el enlace directo. El admin puede copiar y compartir el enlace manualmente.

---

## Matriz de permisos por módulo

### 🏢 Páginas / módulos visibles

| Módulo / Ruta | Admin | Contador | Vendedor | Viewer | Empleado |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard `/dashboard` | ✅ | ✅ | ✅ | ✅ | ❌ 🔀 |
| Punto de Venta `/pos` | ✅ | ✅ | ✅ | ❌ | ❌ 🔀 |
| Facturas `/facturas` | ✅ | ✅ | ✅ | ✅ 👁️ | ❌ 🔀 |
| Cotizaciones `/cotizaciones` | ✅ | ✅ | ✅ | ❌ | ❌ 🔀 |
| Clientes `/clientes` | ✅ | ✅ | ✅ | ✅ 👁️ | ❌ 🔀 |
| Productos `/productos` | ✅ | ✅ | ❌ | ✅ 👁️ | ❌ 🔀 |
| Compras `/compras` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Proveedores `/proveedores` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Gastos `/gastos` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Inventario `/inventario` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Caja `/caja` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Reportes DGII `/reportes` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Declaraciones `/declaraciones` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Contabilidad `/contabilidad` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Libro Mayor `/libro-mayor` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Bancos `/bancos` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Tesorería `/tesoreria` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Cheques `/cheques` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| CxC (cobros) `/cxc` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| CxP (pagos) `/cxp` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Nómina `/nomina` | ✅ | ✅ | ❌ | ❌ | ❌ 🔀 |
| Equipo & Accesos `/equipo` | ✅ | ❌ | ❌ | ❌ | ❌ 🔀 |
| Configuración `/configuracion` | ✅ | ❌ | ❌ | ❌ | ❌ 🔀 |
| Auditoría `/auditoria` | ❌ | ❌ | ❌ | ❌ | ❌ 🔀 |
| Super Admin `/super-admin` | ❌ | ❌ | ❌ | ❌ | ❌ 🔀 |
| **Portal del Empleado `/portal-empleado`** | ✅ 👁️ | ✅ 👁️ | ❌ | ❌ | ✅ |

> 👁️ = Puede ver pero NO crear/editar/eliminar (botones ocultos via `useCanDo`)  
> ❌ = Sin acceso  
> 🔀 = El rol `empleado` es redirigido automáticamente a `/portal-empleado` al iniciar sesión; cualquier ruta del ERP lo redirige allí

---

### ⚡ Acciones específicas (hook `useCanDo`)

> El rol `empleado` no accede al ERP, por lo que ninguna acción del hook `useCanDo` aplica.  
> En el Portal del Empleado solo puede leer su propio perfil, recibos y prestaciones.

| Acción | Admin | Contador | Vendedor | Viewer | Empleado |
|---|:---:|:---:|:---:|:---:|:---:|
| `facturas:ver` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `facturas:crear` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `facturas:editar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `facturas:anular` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `facturas:eliminar` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `facturas:pdf` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `clientes:ver` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `clientes:crear` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `clientes:editar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `clientes:eliminar` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clientes:estado_cuenta` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `productos:ver` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `productos:crear` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `productos:editar` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `productos:eliminar` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `productos:stock` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `compras:ver` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `compras:crear` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `reportes:ventas` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `reportes:dgii` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `reportes:financiero` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `pos:usar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `caja:abrir` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `caja:cerrar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `caja:anular` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `configuracion:ver` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `configuracion:editar` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `usuarios:ver` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `usuarios:editar` | ✅ | ❌ | ❌ | ❌ | ❌ |

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

## Endpoints del Portal del Empleado

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/portal-empleado/mi-perfil` | empleado / admin / contador | Perfil del empleado vinculado al usuario |
| `GET` | `/portal-empleado/mis-recibos` | empleado / admin / contador | Lista de recibos de nómina del empleado |
| `GET` | `/portal-empleado/mis-prestaciones` | empleado / admin / contador | Prestaciones laborales calculadas |
| `POST` | `/portal-empleado/solicitar-vinculacion` | empleado | Solicita al admin vincular su usuario |

### POST `/nomina/empleados/:id/invitar` — Invitar al Portal
```json
{ "email": "empleado@empresa.com" }   // email opcional; si se omite usa el del empleado
```
**Respuesta:**
```json
{
  "mensaje": "Invitación enviada a empleado@empresa.com",
  "emailEnviado": true,
  "userId": 12
}
```

### PATCH `/nomina/empleados/:id/vincular-usuario` — Vincular usuario existente
```json
{ "userId": 12 }   // userId=null desvincula
```

### GET `/nomina/usuarios-tenant` — Usuarios disponibles para vincular
Retorna lista de usuarios activos del tenant (para el dropdown del admin).

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

### 👤 Empleado (`empleado`)
- **Solo accede al Portal del Empleado** (`/portal-empleado`) — NO ve el ERP
- **Puede ver**: Su perfil, sus recibos de nómina (PDF descargable), sus prestaciones calculadas
- **No puede**: Ver ni acceder a ningún módulo del ERP (facturas, clientes, reportes, etc.)
- **Redirección automática**: Al iniciar sesión es redirigido a `/portal-empleado`; si intenta ir a cualquier ruta del ERP es redirigido de vuelta al portal
- **Creación**: No se invita por el módulo de Equipo & Accesos, sino desde **Nómina → Empleados → Invitar al Portal del Empleado**
- **Setup**: Recibe email con enlace `/setup-password/:token` (token válido 48h) para configurar contraseña
- **Vinculación**: El admin puede también vincular un usuario existente del sistema a un empleado mediante "Vincular usuario del sistema"
- **Uso típico**: Cualquier empleado que necesita consultar sus recibos y prestaciones desde el portal

---

*Documentado por Claude Code — HiCloud ERP v2026*
