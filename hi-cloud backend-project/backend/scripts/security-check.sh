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
