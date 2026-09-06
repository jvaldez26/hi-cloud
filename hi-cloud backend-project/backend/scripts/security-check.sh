#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# HiCloud ERP — Security Pattern Check
# Detecta los patrones de vulnerabilidad más frecuentes ANTES de llegar a CI.
# Uso: bash scripts/security-check.sh
#      (también se ejecuta automáticamente en CI y en pre-push)
#
# Para marcar un hit como falso positivo, añadir en esa línea:
#   // nosec: <razón>
# ─────────────────────────────────────────────────────────────────────────────
set -e

ERRORES=0
ADVERTENCIAS=0
SRC="src"

# Colores solo si hay terminal interactiva
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; RESET=''
fi

ok()    { echo "${GREEN}✅ $1${RESET}"; }
warn()  { echo "${YELLOW}⚠️  $1${RESET}"; ADVERTENCIAS=$((ADVERTENCIAS+1)); }
fail()  { echo "${RED}❌ $1${RESET}"; ERRORES=$((ERRORES+1)); }
header(){ echo ""; echo "→ $1"; }

echo ""
echo "🔍 HiCloud Security Pattern Check"
echo "══════════════════════════════════"

# ─── CHECK 1: SQL injection — interpolación directa en queries ───────────────
header "SQL injection (interpolación \${var} en query strings)..."
# Excluye:
#  - archivos de migración y seeds (no son endpoints de usuario)
#  - SAVEPOINT (nombres internos de transacción)
#  - patrones marcados con // nosec
#  - variables de nombre seguro: where, clause, sql, safeTable, sp, vals, name, nuevoIndice
RESULTADO=$(grep -rn 'query(`[^`]*\${' "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts" \
  | grep -v "migrations/" \
  | grep -v "seeds/" \
  | grep -v "SAVEPOINT" \
  | grep -v "nosec" \
  | grep -v '\${\(where\|clause\|conditions\|safeTable\|sp\b\|vals\|nuevoIndice\|name\b\|sql\b\)' \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "Posible SQL injection — usar parámetros \$1, \$2 en lugar de interpolación:"
  echo "$RESULTADO" | head -10
else
  ok "Sin interpolación directa en queries"
fi

# ─── CHECK 2: empresaId tomado del DTO/body en lugar del JWT/CLS ─────────────
header "Multi-tenant: empresaId del request (debe ser del JWT/CLS)..."
# Excluye super-admin y ecf-config (servicios cross-tenant por diseño)
# Excluye nosec, tests y la validación "exists" de config única
RESULTADO=$(grep -rn \
  'empresaId: dto\.\|empresaId: body\.\|empresaId: req\.body\|empresaId: params\.' \
  "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts" \
  | grep -v "super-admin/" \
  | grep -v "ecf-config\.service\|ecf\.service\|EcfConfig" \
  | grep -v "nosec" \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "empresaId tomado del request — usar tenantService.getEmpresaId():"
  echo "$RESULTADO" | head -10
else
  ok "Sin empresaId tomado del request"
fi

# ─── CHECK 3: Secrets hardcodeados ───────────────────────────────────────────
header "Secrets hardcodeados en el código fuente..."
RESULTADO=$(grep -rn \
  "secret\s*=\s*['\"][^'\"]\{8,\}['\"]" \
  "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts\|test\.\|process\.env\|config\.get\|cfg\.get\|ConfigService\|@Column\|describe\|it(\|nosec" \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "Posible secret hardcodeado — usar process.env o ConfigService:"
  echo "$RESULTADO" | head -10
else
  ok "Sin secrets hardcodeados detectados"
fi

# ─── CHECK 4: Fallback de JWT_SECRET ─────────────────────────────────────────
header "Fallback de JWT_SECRET (debe lanzar error si falta)..."
RESULTADO=$(grep -rn "JWT_SECRET.*??\|JWT_SECRET.*||" "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts\|nosec" || true)
if [ -n "$RESULTADO" ]; then
  fail "Fallback de JWT_SECRET detectado — usar throw si la variable no está definida:"
  echo "$RESULTADO"
else
  ok "Sin fallbacks de JWT_SECRET"
fi

# ─── CHECK 5: FileInterceptor sin fileFilter ─────────────────────────────────
header "Uploads: FileInterceptor sin fileFilter (validación de MIME)..."
# Usa node para analizar cada archivo: busca FileInterceptor y verifica que
# las siguientes 8 líneas contengan fileFilter
RESULTADO=$(node -e "
const fs = require('fs');
const path = require('path');
function walk(dir) {
  let r = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) r = r.concat(walk(fp));
      else if (f.endsWith('.controller.ts') && !f.endsWith('.spec.ts')) r.push(fp);
    }
  } catch(e) {}
  return r;
}
const issues = [];
for (const file of walk('$SRC')) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('UseInterceptors(FileInterceptor(') && !lines[i].includes('nosec')) {
      const block = lines.slice(i, Math.min(i+8, lines.length)).join('\n');
      if (!block.includes('fileFilter') && !block.includes('nosec')) {
        issues.push(file + ':' + (i+1) + ': ' + lines[i].trim());
      }
    }
  }
}
if (issues.length > 0) { console.log(issues.join('\n')); process.exit(1); }
" 2>&1 || true)
if echo "$RESULTADO" | grep -q "\.controller\.ts:"; then
  fail "FileInterceptor sin fileFilter — riesgo de upload arbitrario:"
  echo "$RESULTADO" | head -10
else
  ok "Todos los FileInterceptors tienen fileFilter"
fi

# ─── CHECK 6: catch blocks completamente vacíos ──────────────────────────────
header "Catch blocks vacíos (sin logger.error ni rethrow)..."
RESULTADO=$(grep -rn -P 'catch\s*\([^)]*\)\s*\{[\s]*\}' "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts\|nosec" || true)
if [ -n "$RESULTADO" ]; then
  warn "Catch vacío detectado — usar logger.error() o rethrow:"
  echo "$RESULTADO" | head -10
else
  ok "Sin catch vacíos"
fi

# ─── CHECK 7: Swagger sin guardia de entorno ─────────────────────────────────
header "Swagger expuesto en producción..."
SW_SETUP=$(grep -rn "SwaggerModule\.setup" "$SRC" --include="*.ts" | grep -v "\.spec\.ts" || true)
if [ -n "$SW_SETUP" ]; then
  SW_GUARD=$(grep -rn -B5 "SwaggerModule\.setup" "$SRC" --include="*.ts" \
    | grep -E "NODE_ENV|isDev|development|isProduction" || true)
  if [ -z "$SW_GUARD" ]; then
    fail "Swagger sin guardia de entorno — podría estar expuesto en producción:"
    echo "$SW_SETUP"
  else
    ok "Swagger protegido por comprobación de entorno"
  fi
else
  ok "SwaggerModule.setup no encontrado"
fi

# ─── CHECK 8: createQueryBuilder sin filtro de empresa ───────────────────────
header "QueryBuilders sin filtro de empresa (posible cross-tenant)..."
# Solo cuenta archivos de servicio (no super-admin, no auditoria, no health)
# donde el QB no tiene ninguna referencia a empresaId en el mismo archivo
QB_FILES=$(grep -rln "createQueryBuilder" "$SRC" --include="*.service.ts" \
  | grep -v "\.spec\.ts\|super-admin\|auditoria\|health\|nosec" \
  || true)
QB_PROBLEMAS=0
QB_LISTA=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Verificar si el archivo tiene alguna referencia a empresaId o tenantService
  if ! grep -q "empresaId\|tenantService\|tenantSvc" "$f" 2>/dev/null; then
    QB_PROBLEMAS=$((QB_PROBLEMAS+1))
    QB_LISTA="$QB_LISTA\n  $f"
  fi
done <<< "$QB_FILES"

if [ "$QB_PROBLEMAS" -gt 0 ]; then
  warn "$QB_PROBLEMAS servicio(s) con QueryBuilder sin referencia a empresaId (revisar manualmente):"
  printf "$QB_LISTA" | head -5
else
  ok "Todos los servicios con QueryBuilder referencian empresaId"
fi

# ─── CHECK 9: Tabla "empresas" en plural — la tabla real es "empresa" ────────
header "Tabla 'empresas' (plural) en SQL — debe ser 'empresa' (singular)..."
# Aplica a entidades, servicios, migraciones y seeds. Los falsos positivos
# reales son imposibles: "empresas" no es una tabla válida en este proyecto.
RESULTADO=$(grep -rn \
  -E '(FROM|JOIN|REFERENCES|UPDATE|INSERT\s+INTO)\s+"?empresas"?' \
  "$SRC" --include="*.ts" \
  | grep -v "\.spec\.ts\|nosec" \
  || true)
# Buscar también en migrations/ (fuera de src/)
RESULTADO_MIGS=$(grep -rn \
  -E '(FROM|JOIN|REFERENCES|UPDATE|INSERT\s+INTO)\s+"?empresas"?' \
  "src/migrations" "src/seeds" --include="*.ts" 2>/dev/null \
  | grep -v "\.spec\.ts\|nosec" \
  || true)
if [ -n "$RESULTADO" ] || [ -n "$RESULTADO_MIGS" ]; then
  fail "Referencia a tabla 'empresas' (plural) — la tabla real es 'empresa' (sin s):"
  [ -n "$RESULTADO" ]      && echo "$RESULTADO"      | head -10
  [ -n "$RESULTADO_MIGS" ] && echo "$RESULTADO_MIGS" | head -10
else
  ok "Sin referencias a 'empresas' (plural)"
fi

# ─── CHECK 10: FK sobre empresaId en migraciones — convención multi-tenant ───
header "FOREIGN KEY sobre empresaId en migraciones (convención: sin FK a nivel BD)..."
# Ninguna tabla multi-tenant del proyecto tiene FK de empresaId a la tabla empresa.
# El aislamiento de tenant se resuelve en la capa de aplicación (TenantService).
# Un FK así siempre es un error de diseño — y puede referenciar "empresas" (plural).
RESULTADO=$(grep -rn \
  -E 'FOREIGN\s+KEY\s*\([^)]*empresaId[^)]*\)|empresaId[^)]*REFERENCES' \
  "src/migrations" --include="*.ts" 2>/dev/null \
  | grep -v "nosec" \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "FK sobre empresaId en migración — usar empresaId como columna plain (sin FK a BD):"
  echo "$RESULTADO" | head -10
else
  ok "Sin FK sobre empresaId en migraciones"
fi

# ─── CHECK 11: Tabla "configuracion_sistema" (singular) — la tabla real es
#     "configuraciones_sistema" (plural, la del @Entity) ─────────────────────
header "Tabla 'configuracion_sistema' (singular) en SQL — debe ser 'configuraciones_sistema'..."
# Incidente 2026-09-06: auth.service.ts y session-lifetime.service.ts leían
# MAX_INTENTOS_LOGIN y SESION_HORAS de "configuracion_sistema", que nunca
# existió. El SELECT fallaba en cada login y cada rotación de refresh token,
# el catch lo tragaba y caía al default en silencio — meses sin que nadie lo
# notara, y carga constante de más sobre una RDS que ya iba al límite.
RESULTADO=$(grep -rn \
  -E '(FROM|JOIN|REFERENCES|UPDATE|INSERT\s+INTO)\s+"?configuracion_sistema"?\b' \
  "$SRC" "src/migrations" "src/seeds" --include="*.ts" 2>/dev/null \
  | grep -v "\.spec\.ts\|nosec" \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "Referencia a tabla 'configuracion_sistema' (singular) — la tabla real es 'configuraciones_sistema':"
  echo "$RESULTADO" | head -10
else
  ok "Sin referencias a 'configuracion_sistema' (singular)"
fi

# ─── CHECK 12: Tabla "usuarios" en SQL — la tabla real es "users" ────────────
header "Tabla 'usuarios' en SQL — la tabla real de usuarios es 'users'..."
# Mismo patrón que el CHECK 11, otro sitio: cobranza.service.ts hacía
# LEFT JOIN usuarios sin try/catch — 500 garantizado en cada llamada, no un
# fallo silencioso, pero el mismo nombre-a-mano que no correspondía a ninguna
# tabla real del proyecto.
RESULTADO=$(grep -rn \
  -E '(FROM|JOIN|REFERENCES|UPDATE|INSERT\s+INTO)\s+"?usuarios"?\b' \
  "$SRC" "src/migrations" "src/seeds" --include="*.ts" 2>/dev/null \
  | grep -v "\.spec\.ts\|nosec" \
  || true)
if [ -n "$RESULTADO" ]; then
  fail "Referencia a tabla 'usuarios' — la tabla real de usuarios es 'users' (sin traducir):"
  echo "$RESULTADO" | head -10
else
  ok "Sin referencias a 'usuarios' (la tabla real es 'users')"
fi

# ─── CHECK 13: SQL crudo con nombres de tabla escritos a mano — patrón general ─
header "SQL crudo con nombres de tabla no reconocidos (forma general del incidente 2026-09-06)..."
# Los CHECK 9/11/12 persiguen nombres concretos ya confirmados como bug.
# Este persigue la FORMA: cualquier FROM/JOIN/UPDATE/INSERT INTO en SQL crudo
# cuyo nombre no corresponda a ningún @Entity ni CREATE TABLE del código. Cada
# hit nuevo que se confirme como bug real se persigue luego con un check
# dedicado como los anteriores. Advertencia, no bloqueo — ver cabecera de
# check-raw-sql-tables.js: es heurístico y puede tener falsos positivos en
# casos no vistos todavía.
RESULTADO=$(node scripts/check-raw-sql-tables.js)
echo "$RESULTADO"
if echo "$RESULTADO" | grep -q '^⚠️'; then
  ADVERTENCIAS=$((ADVERTENCIAS+1))
fi

# ─── RESUMEN ─────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════"
if [ $ERRORES -gt 0 ]; then
  echo "${RED}❌ $ERRORES error(es) crítico(s) — resolver antes de hacer push${RESET}"
  [ $ADVERTENCIAS -gt 0 ] && echo "${YELLOW}⚠️  $ADVERTENCIAS advertencia(s) — revisar manualmente${RESET}"
  echo ""
  exit 1
elif [ $ADVERTENCIAS -gt 0 ]; then
  echo "${YELLOW}⚠️  $ADVERTENCIAS advertencia(s) — revisar manualmente${RESET}"
  echo "${GREEN}✅ Sin errores críticos — push permitido${RESET}"
  echo ""
  exit 0
else
  echo "${GREEN}✅ Todo OK — sin vulnerabilidades detectadas${RESET}"
  echo ""
  exit 0
fi
