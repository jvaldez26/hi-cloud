# Reglas de Deploy — HiCloud ERP

> **Este sistema tiene usuarios reales en producción.**
> Un bug = usuarios sin poder trabajar. Respetá estas reglas.

---

## ⚠️ LECCIÓN APRENDIDA (2026-05-16)

El sistema estuvo caído por un **ReferenceError de Temporal Dead Zone (TDZ)**:
- Variable `menuActivos` usada en `categoriasFiltradas` (línea ~1069)
- `menuActivos` declarado DESPUÉS (línea ~1244)
- En producción, Vite renombró `menuActivos` → `de` → `Cannot access 'de' before initialization`

**Por qué TypeScript y `npm run build` no lo detectaron:**
TDZ es un error de **runtime**, no de compilación. El bundle compila correctamente
pero falla cuando el browser ejecuta el código con variables en orden equivocado.

---

## OBLIGATORIO antes de cada push

### Si modificaste archivos de frontend:
```bash
cd "hi-cloud frontend-project"
npm run build
```
→ Solo push si termina con **"✓ built in X.XXs"**

### Si modificaste archivos de backend:
```bash
cd "hi-cloud backend-project/backend"
npx tsc --noEmit
```
→ Solo push si termina con **0 errores**

---

## Archivos CRÍTICOS (requieren verificación extra)

| Archivo | Por qué es crítico |
|---------|-------------------|
| `AppLayout.tsx` | Afecta a TODOS los usuarios — sidebar, auth guard |
| `App.tsx` | Rutas de toda la app |
| `main.tsx` | Entry point |
| `auth.service.ts` | Autenticación — si falla, nadie puede entrar |
| `tenant.middleware.ts` | Multi-tenancy — afecta todos los datos |

**Regla extra para archivos críticos:**
Después de editar cualquiera de estos, hacer `npm run build` completo
y revisar manualmente en el navegador antes de hacer push.

---

## Si el sistema cae en producción

```bash
# 1. ROLLBACK INMEDIATO (no diagnosticar antes)
git revert HEAD --no-edit
git push origin main
# → El deploy automático restaura el sistema en ~2 minutos

# 2. VERIFICAR que el sistema funciona
curl -sk https://hicloudrd.com/api/v1/health

# 3. DIAGNOSTICAR la causa (con el sistema ya restaurado)
git diff HEAD~1 HEAD -- "hi-cloud frontend-project/src/"

# 4. FIX LOCAL con build verificado
npm run build   # en hi-cloud frontend-project/
# → Si compila OK → hacer push

# 5. NUNCA hacer push sin build exitoso
```

---

## Protecciones automáticas instaladas

| Protección | Qué verifica | Cuándo actúa |
|-----------|-------------|--------------|
| **Husky pre-commit** | TypeScript (backend + frontend) | En cada `git commit` |
| **Husky pre-push** | Build de producción frontend | En cada `git push` |
| **CI/CD (GitHub Actions)** | TypeScript + Build + Deploy + Health check | En cada push a main |
| **timeout-minutes: 10** | CI no se queda colgado | En cada job del CI |
| **Health check post-deploy** | API responde healthy | Después de cada deploy |

### ⚠️ Qué NO detectan las herramientas automáticas:
- **Temporal Dead Zone (TDZ)**: Error de runtime no visible en build/compile
- **Bugs lógicos**: Código que compila pero hace lo incorrecto
- **CSS roto**: Build pasa pero el UI se ve mal
- **Errores de API**: El frontend compila pero el backend devuelve error

Para estos casos: **revisión manual en staging/dev antes de push a main**.

---

## Script de deploy seguro

```bash
bash scripts/deploy-safe.sh
```

Ejecuta en orden: TypeScript → Build → Tests → Push

---

## Política de commits

1. **Commits pequeños** — un cambio a la vez
2. **Descripción clara** — qué cambia y por qué
3. **Verificar localmente** antes de push
4. **No pushear al final del día** sin verificar — si cae, no hay nadie para hacer rollback rápido
