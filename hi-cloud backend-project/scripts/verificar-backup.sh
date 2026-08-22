#!/bin/bash
# ============================================================================
# verificar-backup.sh — Comprueba que un dump de HiCloud SE PUEDE RESTAURAR
#
# Un backup que nadie ha restaurado no es un backup, es un archivo. Este script
# es lo unico que puede marcar `integridadVerificada = true` en el panel.
#
# Que hace:
#   1. Toma un dump (o usa el que se le pase con --archivo)
#   2. Calcula el SHA-256
#   3. Lo RESTAURA en una base temporal
#   4. Cuenta filas de las tablas clave y las compara con produccion
#   5. Borra la base temporal, pase lo que pase
#   6. Manda el veredicto al backend — tambien si es NEGATIVO
#
# Uso:
#   ./verificar-backup.sh                      # dump nuevo + verificar
#   ./verificar-backup.sh --archivo /ruta.dump # verificar uno existente
#   ./verificar-backup.sh --conservar          # no borrar el dump al terminar
#
# Crontab sugerido (semanal, domingo 3:30 — despues del backup de las 2:00):
#   30 3 * * 0 /home/ubuntu/scripts/verificar-backup.sh >> /var/log/hicloud-backup.log 2>&1
#
# ── RESTAURAR DE VERDAD (el dia que haga falta) ─────────────────────────────
#   El archivo es formato CUSTOM de pg_dump. NO es SQL: `psql < archivo` falla.
#
#     pg_restore -h HOST -p 5432 -U USUARIO -d BASE_DESTINO --no-owner archivo.dump
#
#   Para restaurar SOBRE la base existente hay que añadir --clean --if-exists.
#   Pensatelo dos veces: eso borra lo que haya.
# ============================================================================
set -euo pipefail

# ── Cargar entorno ───────────────────────────────────────────────────────────
for ENV_PATH in /home/ubuntu/.env /home/ubuntu/hicloud/.env /opt/hicloud/.env; do
  if [ -f "$ENV_PATH" ]; then
    set -o allexport
    # shellcheck source=/dev/null
    source "$ENV_PATH"
    set +o allexport
    break
  fi
done

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-hicloud}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
INTERNAL_KEY="${INTERNAL_API_KEY:-}"

WORK_DIR="/tmp/hicloud-verificacion"
LOG_FILE="/var/log/hicloud-backup.log"

# Prefijo obligatorio de la base temporal. El DROP solo se permite sobre bases
# que empiecen asi — ver borrar_temporal(). Es la unica salvaguarda entre este
# script y un desastre.
PREFIJO_TMP="hicloud_verify_"

# Tablas que se cuentan. No son todas a proposito: son las que si salen vacias
# significan que el dump no sirve, y ademas cubren modulos distintos.
TABLAS=(facturas clientes productos cierres_caja)

ARCHIVO=""
CONSERVAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --archivo)   ARCHIVO="$2"; shift 2 ;;
    --conservar) CONSERVAR=1; shift ;;
    *) echo "Opcion desconocida: $1" >&2; exit 2 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── Veredicto al backend ─────────────────────────────────────────────────────
# Se manda SIEMPRE, sea cual sea el resultado. Una verificacion fallida es justo
# lo que hay que ver en el panel.
enviar_veredicto() {
  local OK="$1" MENSAJE="$2" FILAS_JSON="${3:-null}"
  log "Veredicto: ok=$OK ${MENSAJE:+— $MENSAJE}"
  if [ -z "$INTERNAL_KEY" ] || [ -z "$BACKEND_URL" ]; then
    log "⚠️  INTERNAL_API_KEY o BACKEND_URL sin configurar — el veredicto NO llega al panel"
    return 0
  fi
  curl -sf -X POST "$BACKEND_URL/api/v1/admin/backups/internal/verificacion" \
    -H "Content-Type: application/json" \
    -H "x-internal-key: $INTERNAL_KEY" \
    -d "{\"ok\":$OK,\"mensaje\":\"$MENSAJE\",\"filas\":$FILAS_JSON}" \
    --max-time 15 >/dev/null \
    || log "⚠️  No se pudo enviar el veredicto al backend"
}

# ── Borrado de la base temporal ──────────────────────────────────────────────
# Se llama desde un trap: si el script muere a mitad, la temporal NO se queda
# ocupando espacio en la instancia de produccion.
TMP_DB=""
borrar_temporal() {
  [ -z "$TMP_DB" ] && return 0

  # Salvaguarda. Este script tiene credenciales de produccion y un DROP DATABASE;
  # es el sitio del repo donde un error cuesta mas caro. Si el nombre no empieza
  # por el prefijo, no se borra nada y se grita.
  case "$TMP_DB" in
    "$PREFIJO_TMP"*) ;;
    *) log "🚨 ABORTADO: '$TMP_DB' no empieza por '$PREFIJO_TMP'. NO se borra nada."; return 1 ;;
  esac
  if [ "$TMP_DB" = "$DB_NAME" ]; then
    log "🚨 ABORTADO: la base temporal coincide con la de produccion. NO se borra nada."
    return 1
  fi

  log "Borrando base temporal $TMP_DB..."
  PGPASSWORD="$DB_PASSWORD" dropdb \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" \
    --if-exists --force "$TMP_DB" 2>>"$LOG_FILE" \
    && log "Base temporal borrada" \
    || log "⚠️  No se pudo borrar $TMP_DB — BORRARLA A MANO"
  TMP_DB=""
}
limpiar() {
  local CODIGO=$?
  borrar_temporal
  if [ "$CONSERVAR" = "0" ] && [ -n "${ARCHIVO_GENERADO:-}" ] && [ -f "${ARCHIVO_GENERADO:-}" ]; then
    rm -f "$ARCHIVO_GENERADO"
  fi
  exit $CODIGO
}
trap limpiar EXIT

# ── Contar filas ─────────────────────────────────────────────────────────────
contar() {
  local BASE="$1" TABLA="$2"
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$BASE" \
    -tAc "SELECT COUNT(*) FROM $TABLA" 2>/dev/null || echo "ERROR"
}

# ── Prerequisitos ────────────────────────────────────────────────────────────
INICIO=$(date +%s)
log "━━━ Verificacion de backup ━━━"

if [ -z "$DB_PASSWORD" ]; then
  enviar_veredicto false "DB_PASSWORD no configurado — no se pudo verificar nada"
  exit 1
fi
for BIN in pg_dump pg_restore psql createdb dropdb sha256sum; do
  if ! command -v "$BIN" >/dev/null 2>&1; then
    enviar_veredicto false "Falta $BIN en el servidor"
    exit 1
  fi
done

mkdir -p "$WORK_DIR"

# ── 1. Dump ──────────────────────────────────────────────────────────────────
if [ -z "$ARCHIVO" ]; then
  ARCHIVO="$WORK_DIR/verificacion_$(date +%Y%m%d_%H%M%S).dump"
  ARCHIVO_GENERADO="$ARCHIVO"
  log "Generando dump de $DB_NAME..."
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
    --no-password --format=custom --compress=9 -f "$ARCHIVO" 2>>"$LOG_FILE" \
    || { enviar_veredicto false "pg_dump fallo"; exit 1; }
else
  [ -f "$ARCHIVO" ] || { enviar_veredicto false "No existe el archivo $ARCHIVO"; exit 1; }
  log "Verificando archivo existente: $ARCHIVO"
fi

TAMANIO=$(du -sh "$ARCHIVO" | cut -f1)
log "Dump listo — $TAMANIO"

# ── 2. Checksum ──────────────────────────────────────────────────────────────
CHECKSUM=$(sha256sum "$ARCHIVO" | cut -d' ' -f1)
log "SHA-256: $CHECKSUM"

# ── 3. Restaurar en base temporal ────────────────────────────────────────────
TMP_DB="${PREFIJO_TMP}$(date +%s)"
log "Creando base temporal $TMP_DB..."
PGPASSWORD="$DB_PASSWORD" createdb \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$TMP_DB" 2>>"$LOG_FILE" \
  || { enviar_veredicto false "No se pudo crear la base temporal — ¿el usuario $DB_USERNAME tiene CREATEDB?"; exit 1; }

log "Restaurando... (esto tarda tanto como el dump, o mas)"
# pg_restore devuelve != 0 por WARNINGs que no impiden la restauracion (owners,
# extensiones que ya existen). Se deja continuar y se decide por los CONTEOS,
# que es lo unico que demuestra que los datos estan ahi.
set +e
PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$TMP_DB" \
  --no-owner --no-privileges "$ARCHIVO" 2>>"$LOG_FILE"
RESTORE_CODE=$?
set -e
log "pg_restore termino con codigo $RESTORE_CODE (los warnings de owner son normales)"

# ── 4. Comparar conteos ──────────────────────────────────────────────────────
#
# Los dos numeros importan. Entre que se toma el dump y que se cuenta produccion
# pasan minutos, y produccion sigue facturando: que produccion tenga ALGUNAS
# filas mas es normal, no un fallo. Lo que no puede pasar es:
#   - que una tabla salga vacia en el dump teniendo filas en produccion
#   - que el dump tenga MAS filas que produccion (imposible: algo va muy mal)
#   - que la tabla ni siquiera exista en la restaurada
#
FILAS_JSON="{"
PRIMERA=1
FALLOS=""

for TABLA in "${TABLAS[@]}"; do
  N_RESTAURADO=$(contar "$TMP_DB" "$TABLA")
  N_PRODUCCION=$(contar "$DB_NAME" "$TABLA")

  if [ "$N_RESTAURADO" = "ERROR" ]; then
    FALLOS="$FALLOS; la tabla $TABLA no existe en el dump restaurado"
    N_RESTAURADO=-1
  elif [ "$N_PRODUCCION" != "ERROR" ]; then
    if [ "$N_RESTAURADO" -eq 0 ] && [ "$N_PRODUCCION" -gt 0 ]; then
      FALLOS="$FALLOS; $TABLA vacia en el dump y con $N_PRODUCCION filas en produccion"
    elif [ "$N_RESTAURADO" -gt "$N_PRODUCCION" ]; then
      FALLOS="$FALLOS; $TABLA tiene mas filas en el dump ($N_RESTAURADO) que en produccion ($N_PRODUCCION)"
    fi
  fi

  [ "$PRIMERA" = "0" ] && FILAS_JSON="$FILAS_JSON,"
  FILAS_JSON="$FILAS_JSON\"$TABLA\":{\"restaurado\":$N_RESTAURADO,\"produccion\":${N_PRODUCCION/ERROR/-1}}"
  PRIMERA=0
  log "  $TABLA: dump=$N_RESTAURADO produccion=$N_PRODUCCION"
done
FILAS_JSON="$FILAS_JSON}"

# ── 5. Veredicto ─────────────────────────────────────────────────────────────
DURACION=$(( $(date +%s) - INICIO ))

if [ -n "$FALLOS" ]; then
  enviar_veredicto false "Restauracion NO valida${FALLOS}" "$FILAS_JSON"
  log "❌ La restauracion NO es valida — ${DURACION}s"
  exit 1
fi

enviar_veredicto true "Restaurado y verificado en ${DURACION}s (sha256 ${CHECKSUM:0:12}…)" "$FILAS_JSON"
log "✅ Restauracion verificada — ${DURACION}s"
log "━━━ Fin ━━━"
