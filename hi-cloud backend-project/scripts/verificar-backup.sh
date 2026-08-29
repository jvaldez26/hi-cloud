#!/bin/bash
# ============================================================================
# verificar-backup.sh — Comprueba que EL RESPALDO QUE ESTA EN S3 se puede restaurar
#
# Un backup que nadie ha restaurado no es un backup, es un archivo. Este script
# es lo unico que puede marcar `integridadVerificada = true` en el panel.
#
# ── QUE CAMBIO Y POR QUE (lee esto antes de tocar nada) ─────────────────────
#
# Hasta ahora este script generaba un dump NUEVO a las 03:30 y verificaba ESE.
# Despues el backend estampaba el veredicto sobre "el ultimo backup exitoso",
# que era el de las 02:00 subido a S3. Es decir: la fila del panel decia
# "Probada" sobre un archivo que nadie habia abierto jamas.
#
# Lo que se demostraba era que pg_dump/pg_restore funcionan sobre esa base.
# Util, pero no es lo que el panel afirmaba. Si el fallo estuviera en la SUBIDA
# —objeto truncado, corrupto, o sencillamente ausente— la verificacion lo daba
# en verde igual. Justo la clase de mentira tranquilizadora que este modulo
# existe para eliminar.
#
# Ahora se baja el objeto REAL de S3, se comprueba su SHA-256 contra el que se
# registro al crearlo, y se restaura ESE archivo. El veredicto va contra el
# `backupId` exacto, no contra "el ultimo que hubiera".
#
# Y sale mas barato: nos ahorramos el pg_dump de ~12s a cambio de bajar 20 MB.
#
# Que hace:
#   1. Pregunta al backend cual es el ultimo respaldo exitoso (id, s3Key, sha256)
#   2. Lo BAJA de S3 — si no se puede bajar, ESO es el fallo de la verificacion
#   3. Comprueba el SHA-256 — si no coincide, ESO es el fallo de la verificacion
#   4. Lo RESTAURA en una base temporal
#   5. Cuenta filas de las tablas clave y las compara con produccion
#   6. Borra la base temporal y el archivo bajado, pase lo que pase
#   7. Manda el veredicto al backend — tambien si es NEGATIVO, y con la duracion
#
# Uso:
#   ./verificar-backup.sh                      # baja el ultimo de S3 y lo verifica
#   ./verificar-backup.sh --archivo /ruta.dump # verificar un archivo local
#   ./verificar-backup.sh --dump-nuevo         # modo viejo: dump fresco (diagnostico)
#   ./verificar-backup.sh --conservar          # no borrar el archivo al terminar
#
# Crontab (diario, 03:30 — hora y media despues del respaldo de las 02:00):
#   30 3 * * * /home/ubuntu/scripts/verificar-backup.sh >> /var/log/hicloud-backup.log 2>&1
#
#   Es DIARIO a proposito. Un respaldo probado ayer vale mas que uno probado el
#   domingo pasado, y la verificacion completa cuesta ~1-2 min en una ventana
#   sin trafico.
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

S3_BUCKET="${AWS_S3_BACKUP_BUCKET:-${AWS_S3_BUCKET:-}}"
AWS_REGION="${AWS_REGION:-us-east-2}"

WORK_DIR="/tmp/hicloud-verificacion"
LOG_FILE="/var/log/hicloud-backup.log"

# Prefijo obligatorio de la base temporal. El DROP solo se permite sobre bases
# que empiecen asi — ver borrar_temporal(). Es la unica salvaguarda entre este
# script y un desastre.
PREFIJO_TMP="hicloud_verify_"

# Tablas que se cuentan. No son todas a proposito: son las que si salen vacias
# significan que el dump no sirve, y ademas cubren modulos distintos.
TABLAS=(facturas clientes productos cierres_caja)

# Margen del contraste de conteos. Ver "Comparar conteos" mas abajo: ahora el
# dump es HORA Y MEDIA mas viejo que produccion, no de hace unos segundos.
TOLERANCIA_EXCESO_PCT=10

ARCHIVO=""
CONSERVAR=0
DUMP_NUEVO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --archivo)    ARCHIVO="$2"; shift 2 ;;
    --conservar)  CONSERVAR=1; shift ;;
    --dump-nuevo) DUMP_NUEVO=1; shift ;;
    *) echo "Opcion desconocida: $1" >&2; exit 2 ;;
  esac
done

INICIO=$(date +%s)
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# El id del respaldo que se esta verificando. Vacio = no se sabe todavia, y el
# backend aplicara el veredicto al ultimo exitoso (comportamiento heredado).
BACKUP_ID=""
CHECKSUM_ESPERADO=""

# ── Veredicto al backend ─────────────────────────────────────────────────────
# Se manda SIEMPRE, sea cual sea el resultado. Una verificacion fallida es justo
# lo que hay que ver en el panel.
#
# La DURACION va en todos los caminos, tambien en el bueno. Descartarla en el
# caso de exito era tirar el dato justo cuando sirve: lo que avisa de que algo
# se esta degradando es la TENDENCIA. Si un dia tarda el triple, eso se ve
# antes de que llegue a fallar.
enviar_veredicto() {
  local OK="$1" MENSAJE="$2" FILAS_JSON="${3:-null}"
  local DURACION=$(( $(date +%s) - INICIO ))
  log "Veredicto: ok=$OK duracion=${DURACION}s ${MENSAJE:+— $MENSAJE}"
  if [ -z "$INTERNAL_KEY" ] || [ -z "$BACKEND_URL" ]; then
    log "⚠️  INTERNAL_API_KEY o BACKEND_URL sin configurar — el veredicto NO llega al panel"
    return 0
  fi

  # backupId solo si se sabe cual es. Mandarlo vacio o como null obligaria al
  # backend a adivinar; omitirlo activa su fallback documentado.
  local CAMPO_ID=""
  [ -n "$BACKUP_ID" ] && CAMPO_ID="\"backupId\":$BACKUP_ID,"

  # Codigo HTTP explicito, igual que en backup-hicloud.sh. Un `|| true` aqui
  # repetiria el mismo error: meses reportando a un backend que devolvia 401 sin
  # que nadie lo supiera.
  local CODIGO
  CODIGO=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$BACKEND_URL/api/v1/admin/backups/internal/verificacion" \
    -H "Content-Type: application/json" \
    -H "x-internal-key: $INTERNAL_KEY" \
    -d "{${CAMPO_ID}\"ok\":$OK,\"duracion\":$DURACION,\"mensaje\":\"$MENSAJE\",\"filas\":$FILAS_JSON}" \
    --max-time 15) || CODIGO="000"

  case "$CODIGO" in
    2*)      log "Veredicto registrado en el panel (HTTP $CODIGO)" ;;
    000)     log "⚠️  AVISO: el backend no respondio al veredicto (timeout o conexion rechazada)" ;;
    401|403) log "⚠️  AVISO: el backend RECHAZO el veredicto (HTTP $CODIGO) — revisa INTERNAL_API_KEY y que la ruta no este detras de un guard de sesion" ;;
    *)       log "⚠️  AVISO: el backend rechazo el veredicto (HTTP $CODIGO)" ;;
  esac
  return 0
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
  if [ "$CONSERVAR" = "0" ] && [ -n "${ARCHIVO_TEMPORAL:-}" ] && [ -f "${ARCHIVO_TEMPORAL:-}" ]; then
    rm -f "$ARCHIVO_TEMPORAL"
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

# ── Leer un campo de un JSON plano ───────────────────────────────────────────
# Sin jq: no esta garantizado en la instancia y no vale la pena una dependencia
# nueva en la ruta critica del respaldo. La respuesta es plana y conocida.
json_texto() {
  echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*"[[:space:]]*:[[:space:]]*"//; s/"$//'
}
json_numero() {
  echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*[0-9]\+" | head -1 | sed 's/.*:[[:space:]]*//'
}

# ── Prerequisitos ────────────────────────────────────────────────────────────
log "━━━ Verificacion de backup ━━━"

if [ -z "$DB_PASSWORD" ]; then
  enviar_veredicto false "DB_PASSWORD no configurado — no se pudo verificar nada"
  exit 1
fi
for BIN in pg_dump pg_restore psql createdb dropdb sha256sum curl; do
  if ! command -v "$BIN" >/dev/null 2>&1; then
    enviar_veredicto false "Falta $BIN en el servidor"
    exit 1
  fi
done

mkdir -p "$WORK_DIR"

# ── 1. Conseguir el archivo ──────────────────────────────────────────────────
#
# Tres modos, en orden de preferencia:
#   (a) por defecto  — bajar de S3 el respaldo real que se creo a las 02:00
#   (b) --archivo    — un archivo local concreto (verificacion manual)
#   (c) --dump-nuevo — dump fresco; ya NO es el camino normal, ver cabecera
#
if [ -n "$ARCHIVO" ]; then
  [ -f "$ARCHIVO" ] || { enviar_veredicto false "No existe el archivo $ARCHIVO"; exit 1; }
  log "Verificando archivo local: $ARCHIVO"

elif [ "$DUMP_NUEVO" = "1" ]; then
  ARCHIVO="$WORK_DIR/verificacion_$(date +%Y%m%d_%H%M%S).dump"
  ARCHIVO_TEMPORAL="$ARCHIVO"
  log "Modo --dump-nuevo: generando dump fresco de $DB_NAME (NO verifica lo que hay en S3)..."
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
    --no-password --format=custom --compress=9 -f "$ARCHIVO" 2>>"$LOG_FILE" \
    || { enviar_veredicto false "pg_dump fallo"; exit 1; }

else
  # ── (a) El camino normal: el respaldo REAL que esta en S3 ─────────────────
  if ! command -v aws >/dev/null 2>&1; then
    enviar_veredicto false "Falta el CLI de aws en el servidor — no se puede bajar el respaldo de S3"
    exit 1
  fi
  if [ -z "$S3_BUCKET" ]; then
    enviar_veredicto false "AWS_S3_BACKUP_BUCKET no configurado — no se sabe de donde bajar el respaldo"
    exit 1
  fi
  if [ -z "$INTERNAL_KEY" ]; then
    log "🚨 INTERNAL_API_KEY vacia: no se puede preguntar cual es el ultimo respaldo NI reportar el veredicto."
    log "   Sin eso esto no es una verificacion. Configura INTERNAL_API_KEY o usa --archivo."
    exit 1
  fi

  log "Preguntando al backend cual es el ultimo respaldo exitoso..."
  RESPUESTA_TMP=$(mktemp)
  CODIGO=$(curl -s -o "$RESPUESTA_TMP" -w '%{http_code}' \
    -X GET "$BACKEND_URL/api/v1/admin/backups/internal/ultimo" \
    -H "x-internal-key: $INTERNAL_KEY" \
    --max-time 15) || CODIGO="000"
  RESPUESTA=$(cat "$RESPUESTA_TMP" 2>/dev/null || echo "")
  rm -f "$RESPUESTA_TMP"

  case "$CODIGO" in
    2*) ;;
    404)
      # No hay nada que verificar. No es un fallo de un respaldo: es que aun no
      # hay respaldo. El panel ya grita por su cuenta cuando la tabla esta vacia.
      log "El backend dice que no hay ningun respaldo exitoso registrado — nada que verificar."
      exit 0 ;;
    000)
      log "🚨 El backend no respondio (timeout o conexion rechazada). No se puede saber que verificar NI reportar."
      exit 1 ;;
    401|403)
      log "🚨 El backend RECHAZO la consulta (HTTP $CODIGO) — revisa INTERNAL_API_KEY."
      exit 1 ;;
    *)
      log "🚨 El backend respondio HTTP $CODIGO a la consulta del ultimo respaldo."
      exit 1 ;;
  esac

  BACKUP_ID=$(json_numero "$RESPUESTA" "id")
  S3_KEY=$(json_texto "$RESPUESTA" "s3Key")
  CHECKSUM_ESPERADO=$(json_texto "$RESPUESTA" "checksum")

  if [ -z "$BACKUP_ID" ] || [ -z "$S3_KEY" ]; then
    log "🚨 Respuesta del backend sin id o sin s3Key: $RESPUESTA"
    exit 1
  fi
  log "Respaldo a verificar: id=$BACKUP_ID s3://$S3_BUCKET/$S3_KEY"

  # Desde aqui BACKUP_ID ya esta puesto: cualquier enviar_veredicto false que
  # venga a continuacion se clava en la fila correcta.

  ARCHIVO="$WORK_DIR/s3_$(basename "$S3_KEY")"
  ARCHIVO_TEMPORAL="$ARCHIVO"

  AWS_PROFILE_OPT=""
  if aws configure list-profiles 2>/dev/null | grep -q "hicloud-backup"; then
    AWS_PROFILE_OPT="--profile hicloud-backup"
  fi

  log "Bajando de S3..."
  # Que no se pueda bajar ES el fallo de la verificacion, no un error de
  # infraestructura al margen: un respaldo que no se puede recuperar no sirve
  # de nada, y da igual si la causa es el objeto o el permiso para leerlo.
  # shellcheck disable=SC2086
  if ! aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$ARCHIVO" \
        --region "$AWS_REGION" $AWS_PROFILE_OPT >>"$LOG_FILE" 2>&1; then
    enviar_veredicto false "No se pudo bajar el respaldo de s3://$S3_BUCKET/$S3_KEY — el archivo no es recuperable"
    exit 1
  fi
  if [ ! -s "$ARCHIVO" ]; then
    enviar_veredicto false "El respaldo bajado de s3://$S3_BUCKET/$S3_KEY esta VACIO"
    exit 1
  fi
  log "Bajado de S3 correctamente"
fi

TAMANIO=$(du -sh "$ARCHIVO" | cut -f1)
log "Archivo listo — $TAMANIO"

# ── 2. Checksum ──────────────────────────────────────────────────────────────
CHECKSUM=$(sha256sum "$ARCHIVO" | cut -d' ' -f1)
log "SHA-256: $CHECKSUM"

# Comparar contra el que se registro AL CREARLO. Esto es lo que detecta una
# subida truncada o un objeto alterado en S3, y es justo lo que la version
# anterior de este script no podia ver: verificaba un dump recien hecho, asi
# que el archivo de S3 nunca se tocaba.
if [ -n "$CHECKSUM_ESPERADO" ]; then
  if [ "$CHECKSUM" != "$CHECKSUM_ESPERADO" ]; then
    enviar_veredicto false "El archivo de S3 NO coincide con el checksum registrado al crearlo (esperado ${CHECKSUM_ESPERADO:0:12}…, bajado ${CHECKSUM:0:12}…) — el respaldo esta corrupto o fue alterado"
    exit 1
  fi
  log "✅ El SHA-256 coincide con el registrado al crear el respaldo"
elif [ -n "$BACKUP_ID" ]; then
  # Vino de S3 pero el registro no guarda checksum (respaldos anteriores a que
  # se empezara a guardar). Se restaura igual: sin checksum el conteo de filas
  # sigue siendo prueba util, solo que mas debil.
  log "⚠️  El respaldo id=$BACKUP_ID no tiene checksum registrado — no se puede contrastar. Se restaura igual."
fi
# En --archivo y --dump-nuevo no hay contra que comparar, y es lo esperado.

# ── 3. Restaurar en base temporal ────────────────────────────────────────────
TMP_DB="${PREFIJO_TMP}$(date +%s)"
log "Creando base temporal $TMP_DB..."
PGPASSWORD="$DB_PASSWORD" createdb \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$TMP_DB" 2>>"$LOG_FILE" \
  || { enviar_veredicto false "No se pudo crear la base temporal — ¿el usuario $DB_USERNAME tiene CREATEDB?"; exit 1; }

log "Restaurando... (esto es lo que mas tarda)"
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
# OJO: el dump que se verifica ahora es el de las 02:00, hora y media mas VIEJO
# que produccion. Antes se comparaba un dump de hacia unos segundos, y por eso
# "el dump tiene mas filas que produccion" se trataba como imposible.
#
# Ya no lo es: en hora y media alguien puede borrar un cliente o un producto, y
# entonces el dump tiene legitimamente mas filas. Mantener aquella regla habria
# convertido un borrado normal en una verificacion FALLIDA, y un panel que grita
# en falso se deja de mirar — que es exactamente el problema que este modulo
# vino a resolver.
#
# Lo que se sigue tratando como fallo real:
#   - que la tabla ni siquiera exista en la restaurada
#   - que salga vacia en el dump teniendo filas en produccion
#   - que el dump exceda a produccion MAS ALLA de la tolerancia: eso ya no es
#     deriva normal, es un borrado masivo o un dump que no es de esta base
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
      UMBRAL=$(( N_PRODUCCION + (N_PRODUCCION * TOLERANCIA_EXCESO_PCT / 100) + 1 ))
      if [ "$N_RESTAURADO" -gt "$UMBRAL" ]; then
        FALLOS="$FALLOS; $TABLA tiene $N_RESTAURADO filas en el dump y solo $N_PRODUCCION en produccion (mas del ${TOLERANCIA_EXCESO_PCT}% de diferencia)"
      else
        log "  (deriva normal: $TABLA bajo de $N_RESTAURADO a $N_PRODUCCION desde que se tomo el dump)"
      fi
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
