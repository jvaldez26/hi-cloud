#!/bin/bash
# deploy-safe.sh — Deploy seguro con verificaciones obligatorias
# Uso: bash scripts/deploy-safe.sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/hi-cloud frontend-project"
BACKEND_DIR="$ROOT_DIR/hi-cloud backend-project/backend"

echo ""
echo "🚀 Deploy Seguro — HiCloud ERP"
echo "══════════════════════════════════"
echo ""

# ── 1. TypeScript Backend ─────────────────────────────────────────────────────
echo "1/4 📦 TypeScript Backend..."
cd "$BACKEND_DIR"
if ! npx tsc --noEmit; then
  echo ""
  echo "❌ ERROR: TypeScript backend con errores."
  echo "   Corrige los errores antes de deployar."
  exit 1
fi
echo "   ✅ Backend TypeScript OK"

# ── 2. TypeScript Frontend ────────────────────────────────────────────────────
echo "2/4 🌐 TypeScript Frontend..."
cd "$FRONTEND_DIR"
if ! npx tsc --noEmit; then
  echo ""
  echo "❌ ERROR: TypeScript frontend con errores."
  echo "   Corrige los errores antes de deployar."
  exit 1
fi
echo "   ✅ Frontend TypeScript OK"

# ── 3. Build de producción frontend (EL MÁS IMPORTANTE) ──────────────────────
echo "3/4 🔨 Build de producción frontend..."
echo "   (Tarda ~25s — nunca saltarse este paso)"
cd "$FRONTEND_DIR"
if ! npm run build; then
  echo ""
  echo "❌ ERROR: Build de producción falló."
  echo "   El sistema estaría caído si se deployara."
  echo ""
  echo "   Si el sistema está caído ahora mismo:"
  echo "   git revert HEAD --no-edit && git push origin main"
  exit 1
fi
echo "   ✅ Build de producción OK"

# ── 4. Git push ───────────────────────────────────────────────────────────────
echo "4/4 📤 Push a origen..."
cd "$ROOT_DIR"
if ! git push origin main; then
  echo ""
  echo "❌ ERROR: Git push falló."
  exit 1
fi
echo "   ✅ Push exitoso"

echo ""
echo "══════════════════════════════════"
echo "✅ Deploy completado correctamente"
echo ""
echo "   El CI/CD de GitHub Actions completará el deploy"
echo "   en ~2-3 minutos. Verifica:"
echo "   curl -sk https://hicloudrd.com/api/v1/health"
echo ""
