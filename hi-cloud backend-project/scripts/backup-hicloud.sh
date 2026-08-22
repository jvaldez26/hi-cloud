#!/bin/bash
# ============================================================================
# backup-hicloud.sh — Backup automático diario de HiCloud ERP
# Servidor: EC2 / Ubuntu
# Crontab:  0 2 * * * /home/ubuntu/scripts/backup-hicloud.sh >> /var/log/hicloud-backup.log 2>&1
#
# ── CÓMO SE RESTAURA ESTO ───────────────────────────────────────────────────
#
# El archivo es formato CUSTOM de pg_dump (.dump). NO es SQL:
#
#     psql < db_20260822.dump        ← NO FUNCIONA. Ni con gunzip delante.
#
# Lo que hay que hacer:
#
#     # 1. Bajarlo (o desde el panel: Super Admin → Backups → Descargar)
#     aws s3 cp s3://BUCKET/database/daily/db_20260822.dump .
#
#     # 2. Restaurar en una base NUEVA (lo normal, y lo seguro)
#     createdb  -h HOST -U USUARIO hicloud_restaurado
#     pg_restore -h HOST -U USUARIO -d hicloud_restaurado \
#                --no-owner --no-privileges db_20260822.dump
#
#     # 3. Comprobar que están los datos ANTES de dar nada por bueno
#     psql -h HOST -U USUARIO -d hicloud_restaurado -c "SELECT count(*) FROM facturas;"
#
# Para restaurar ENCIMA de una base existente hay que añadir --clean
# --if-exists. Piénsatelo dos veces: eso borra lo que haya.
#
# Los warnings de "owner does not exist" al restaurar son normales y no impiden
# nada — por eso se pasa --no-owner.
#
# verificar-backup.sh hace todo esto solo, contra una base temporal, y es lo
# único que puede marcar un backup como verificado en el panel.
# ============================================================================
set -euo pipefail

# ── Cargar variables de entorno ──────────────────────────────────────────────
for ENV_PATH in /home/ubuntu/.env /home/ubuntu/hicloud/.env /opt/hicloud/.env; do
  if [ -f "$ENV_PATH" ]; then
    set -o allexport
    # shellcheck source=/dev/null
    source "$ENV_PATH"
    set +o allexport
    break
  fi
done

# ── Configuración (con defaults razonables) ──────────────────────────────────
DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)    # 1=Lunes .. 7=Domingo
DAY_OF_MONTH=$(date +%d)   # 01-31

# TIPO se define AQUI, antes que nada que pueda llamar a notificar_fallo().
#
# Estaba mas abajo, y notificar_fallo lo interpola en el payload. Con `set -u`,
# un fallo temprano (DB_PASSWORD ausente, por ejemplo) mataba el script en
# "TIPO: unbound variable" ANTES de mandar la alerta: el backup llevaba semanas
# roto y el aviso se quedaba en un log local que nadie lee. Justo el caso en que
# la alerta hacia mas falta. Ver test/test-backup-hicloud.sh.
if [ "$DAY_OF_MONTH" = "01" ]; then
  TIPO="monthly"
elif [ "$DAY_OF_WEEK" = "7" ]; then
  TIPO="weekly"
else
  TIPO="daily"
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-hicloud}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

S3_BUCKET="${AWS_S3_BACKUP_BUCKET:-${AWS_S3_BUCKET:-}}"
AWS_REGION="${AWS_REGION:-us-east-2}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
INTERNAL_KEY="${INTERNAL_API_KEY:-}"

BACKUP_LOCAL="/tmp/hicloud-backups"
LOG_FILE="/var/log/hicloud-backup.log"

# ── Funciones ────────────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

notificar_fallo() {
  local MSG="$1"
  log "❌ FALLO: $MSG"
  if [ -n "$INTERNAL_KEY" ] && [ -n "$BACKEND_URL" ]; then
    curl -sf -X POST "$BACKEND_URL/api/v1/admin/backups/internal/alert" \
      -H "Content-Type: application/json" \
      -H "x-internal-key: $INTERNAL_KEY" \
      -d "{\"mensaje\":\"$MSG\",\"tipo\":\"$TIPO\"}" \
      --max-time 10 || true
  fi
}

notificar_exito() {
  local S3_KEY="$1" TAMANIO="$2" DURACION="$3" CHECKSUM="$4"
  if [ -n "$INTERNAL_KEY" ] && [ -n "$BACKEND_URL" ]; then
    curl -sf -X POST "$BACKEND_URL/api/v1/admin/backups/internal/success" \
      -H "Content-Type: application/json" \
      -H "x-internal-key: $INTERNAL_KEY" \
      -d "{\"archivo\":\"$S3_KEY\",\"tamanio\":\"$TAMANIO\",\"duracion\":$DURACION,\"checksum\":\"$CHECKSUM\"}" \
      --max-time 10 || true
  fi
}

# ── Validar prerequisitos ────────────────────────────────────────────────────

if [ -z "$DB_PASSWORD" ]; then
  notificar_fallo "DB_PASSWORD no configurado"; exit 1
fi
if [ -z "$S3_BUCKET" ]; then
  notificar_fallo "AWS_S3_BACKUP_BUCKET no configurado — el backup no se subirá a S3"
  # No salir — hacer el dump local igualmente
fi

# ── Inicio ───────────────────────────────────────────────────────────────────

INICIO=$(date +%s)
log "━━━ HiCloud Backup ━━━ tipo=$TIPO fecha=$DATE"
mkdir -p "$BACKUP_LOCAL"

# ── pg_dump ──────────────────────────────────────────────────────────────────

# .dump, no .sql.gz — el formato custom de pg_dump NO es SQL.
#
# El nombre anterior invitaba a `gunzip archivo | psql`, que falla: hay que usar
# pg_restore. A las 3 de la madrugada con el ERP caido, ese detalle cuesta una
# hora. El comando exacto esta en la cabecera de este archivo.
#
# Y se quita el gzip de encima: --compress=9 ya comprime el archivo. El segundo
# gzip no reducia practicamente nada (comprimir lo ya comprimido) y solo servia
# para que la extension mintiera.
ARCHIVO_LOCAL="$BACKUP_LOCAL/db_${DATE}.dump"
S3_KEY="database/$TIPO/db_${DATE}.dump"

log "Iniciando pg_dump de $DB_NAME en $DB_HOST:$DB_PORT..."

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USERNAME" \
  -d "$DB_NAME" \
  --no-password \
  --format=custom \
  --compress=9 \
  -f "$ARCHIVO_LOCAL" \
  2>> "$LOG_FILE" \
  || { notificar_fallo "pg_dump falló para $DB_NAME"; exit 1; }

TAMANIO=$(du -sh "$ARCHIVO_LOCAL" | cut -f1)
log "pg_dump OK — tamaño: $TAMANIO"

# ── Checksum ─────────────────────────────────────────────────────────────────

CHECKSUM=$(sha256sum "$ARCHIVO_LOCAL" | cut -d' ' -f1)
log "SHA-256: $CHECKSUM"

# ── Subir a S3 ───────────────────────────────────────────────────────────────

if [ -n "$S3_BUCKET" ]; then
  log "Subiendo a s3://$S3_BUCKET/$S3_KEY ..."
  # Usar perfil AWS si está configurado, si no usar variables de entorno
  AWS_PROFILE_OPT=""
  if aws configure list-profiles 2>/dev/null | grep -q "hicloud-backup"; then
    AWS_PROFILE_OPT="--profile hicloud-backup"
  fi
  aws s3 cp \
    "$ARCHIVO_LOCAL" \
    "s3://$S3_BUCKET/$S3_KEY" \
    --region "$AWS_REGION" \
    --storage-class STANDARD_IA \
    --metadata "tipo=$TIPO,fecha=$DATE,checksum=$CHECKSUM" \
    $AWS_PROFILE_OPT \
    2>&1 | tee -a "$LOG_FILE" \
    || { notificar_fallo "Upload S3 falló para $S3_KEY"; exit 1; }
  log "✅ Subido a S3 correctamente"
else
  log "⚠️  S3 no configurado — backup guardado solo en $ARCHIVO_LOCAL"
  S3_KEY="local:$ARCHIVO_LOCAL"
fi

# ── Limpiar locales > 3 días ──────────────────────────────────────────────────

find "$BACKUP_LOCAL" -name "*.dump" -mtime +3 -delete 2>/dev/null || true
# Restos con el nombre viejo, de antes de que la extension dijera la verdad.
find "$BACKUP_LOCAL" -name "*.sql.gz" -mtime +3 -delete 2>/dev/null || true
log "Archivos locales > 3 días limpiados"

# ── Duración y notificación ──────────────────────────────────────────────────

FIN=$(date +%s)
DURACION=$((FIN - INICIO))
log "✅ Backup completado en ${DURACION}s — $TAMANIO"

notificar_exito "$S3_KEY" "$TAMANIO" "$DURACION" "$CHECKSUM"
log "━━━ Fin ━━━"
