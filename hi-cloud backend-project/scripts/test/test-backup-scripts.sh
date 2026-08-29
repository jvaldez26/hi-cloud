#!/bin/bash
# ============================================================================
# test-backup-scripts.sh — Tests de los scripts de respaldo.
#
# Ejecutar:  ./scripts/test/test-backup-scripts.sh
#
# No tocan la base de datos ni la red: comprueban la LOGICA de los scripts,
# que es donde estaban los bugs que hacian que un backup roto fuera silencioso.
# ============================================================================
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SH="$DIR/backup-hicloud.sh"
VERIFICAR_SH="$DIR/verificar-backup.sh"

TOTAL=0
FALLOS=0

ok() {
  TOTAL=$((TOTAL + 1))
  if [ "$2" = "0" ]; then echo "  ✓ $1"
  else echo "  ✗ $1"; FALLOS=$((FALLOS + 1)); fi
}

echo ""
echo "Sintaxis"
bash -n "$BACKUP_SH"    2>/dev/null; ok "backup-hicloud.sh parsea"  $?
bash -n "$VERIFICAR_SH" 2>/dev/null; ok "verificar-backup.sh parsea" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "EL BUG: la alerta de fallo tiene que SALIR de la maquina"
#
# notificar_fallo() interpola \$TIPO en el payload. TIPO se asignaba DESPUES de
# las validaciones que llaman a notificar_fallo, asi que con `set -u` el script
# moria en "TIPO: unbound variable" antes de mandar nada.
#
# Solo se notaba con INTERNAL_API_KEY configurada — es decir, justo cuando
# creias tener alertas. Un backup podia llevar semanas fallando en silencio.
#
# Se reproduce la forma ROTA para demostrar que el test detecta el bug, y luego
# se comprueba que el script real ya no la tiene.

ROTO=$(mktemp)
cat > "$ROTO" <<'SCRIPT'
set -euo pipefail
INTERNAL_KEY="una-clave"; BACKEND_URL="http://localhost:3000"
notificar_fallo() {
  local MSG="$1"
  echo "[log] FALLO: $MSG"
  if [ -n "$INTERNAL_KEY" ] && [ -n "$BACKEND_URL" ]; then
    echo "ALERTA-ENVIADA {\"mensaje\":\"$MSG\",\"tipo\":\"$TIPO\"}"
  fi
}
DB_PASSWORD=""
if [ -z "$DB_PASSWORD" ]; then notificar_fallo "DB_PASSWORD no configurado"; exit 1; fi
TIPO="daily"
SCRIPT
SALIDA_ROTA=$(bash "$ROTO" 2>&1 || true)
echo "$SALIDA_ROTA" | grep -q "unbound variable"
ok "la forma ROTA muere en 'unbound variable' (el test detecta el bug)" $?
echo "$SALIDA_ROTA" | grep -q "ALERTA-ENVIADA"
[ $? -ne 0 ]; ok "la forma ROTA nunca llega a enviar la alerta" $?
rm -f "$ROTO"

# Ahora la forma ARREGLADA: TIPO definido antes.
ARREGLADO=$(mktemp)
cat > "$ARREGLADO" <<'SCRIPT'
set -euo pipefail
DAY_OF_WEEK=1; DAY_OF_MONTH=15
if [ "$DAY_OF_MONTH" = "01" ]; then TIPO="monthly"
elif [ "$DAY_OF_WEEK" = "7" ]; then TIPO="weekly"
else TIPO="daily"; fi
INTERNAL_KEY="una-clave"; BACKEND_URL="http://localhost:3000"
notificar_fallo() {
  local MSG="$1"
  echo "[log] FALLO: $MSG"
  if [ -n "$INTERNAL_KEY" ] && [ -n "$BACKEND_URL" ]; then
    echo "ALERTA-ENVIADA {\"mensaje\":\"$MSG\",\"tipo\":\"$TIPO\"}"
  fi
}
DB_PASSWORD=""
if [ -z "$DB_PASSWORD" ]; then notificar_fallo "DB_PASSWORD no configurado"; exit 1; fi
SCRIPT
SALIDA_OK=$(bash "$ARREGLADO" 2>&1 || true)
echo "$SALIDA_OK" | grep -q "ALERTA-ENVIADA"
ok "la forma ARREGLADA SI envia la alerta" $?
echo "$SALIDA_OK" | grep -q '"tipo":"daily"'
ok "y el tipo va bien en el payload" $?
rm -f "$ARREGLADO"

# Y sobre el script real: TIPO tiene que asignarse antes de la primera llamada
# a notificar_fallo, no despues.
LINEA_TIPO=$(grep -n '^  TIPO=' "$BACKUP_SH" | head -1 | cut -d: -f1)
LINEA_LLAMADA=$(grep -n 'notificar_fallo "' "$BACKUP_SH" | head -1 | cut -d: -f1)
[ -n "$LINEA_TIPO" ] && [ -n "$LINEA_LLAMADA" ] && [ "$LINEA_TIPO" -lt "$LINEA_LLAMADA" ]
ok "en el script real TIPO (linea $LINEA_TIPO) se asigna antes de la 1a llamada (linea $LINEA_LLAMADA)" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "La extension dice la verdad"
grep -q 'ARCHIVO_LOCAL=.*\.dump"' "$BACKUP_SH"
ok "el dump se llama .dump, no .sql.gz" $?
grep -q '| gzip -c > "\$ARCHIVO_LOCAL"' "$BACKUP_SH"
[ $? -ne 0 ]; ok "no hay doble compresion (--compress=9 ya comprime)" $?
grep -q 'S3_KEY="database/\$TIPO/db_\${DATE}\.dump"' "$BACKUP_SH"
ok "la clave de S3 usa la misma extension" $?
grep -q 'pg_restore' "$BACKUP_SH"
ok "la cabecera documenta el comando de restauracion" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "El borrado de la base temporal NO puede tocar produccion"
#
# verificar-backup.sh tiene credenciales de produccion y un DROP DATABASE. Es el
# sitio del repo donde un error cuesta mas caro.

probar_borrado() {
  local NOMBRE="$1"
  TMP_DB="$NOMBRE" DB_NAME="hicloud" PREFIJO_TMP="hicloud_verify_" \
  bash -c '
    set -uo pipefail
    log() { echo "$*"; }
    borrar_temporal() {
      [ -z "$TMP_DB" ] && return 0
      case "$TMP_DB" in
        "$PREFIJO_TMP"*) ;;
        *) log "ABORTADO-PREFIJO"; return 1 ;;
      esac
      if [ "$TMP_DB" = "$DB_NAME" ]; then log "ABORTADO-PRODUCCION"; return 1; fi
      log "BORRARIA $TMP_DB"
    }
    borrar_temporal
  ' 2>&1
}

# La salida se captura ANTES de filtrar: con `pipefail`, el exit 1 del subshell
# (que es el comportamiento correcto al abortar) se propagaria por la tuberia y
# el test daria falso negativo aunque el grep acertara.
SALIDA=$(probar_borrado "hicloud")
echo "$SALIDA" | grep -q "ABORTADO"
ok "se niega a borrar la base de produccion" $?

SALIDA=$(probar_borrado "cualquier_otra")
echo "$SALIDA" | grep -q "ABORTADO-PREFIJO"
ok "se niega a borrar cualquier base sin el prefijo" $?

SALIDA=$(probar_borrado "hicloud_verify_1234")
echo "$SALIDA" | grep -q "BORRARIA"
ok "si borra la temporal con el prefijo correcto" $?

# El guardarrail solo sirve si esta en el script de verdad.
grep -q 'PREFIJO_TMP=' "$VERIFICAR_SH"
ok "el prefijo esta definido en verificar-backup.sh" $?
grep -q 'trap limpiar EXIT' "$VERIFICAR_SH"
ok "hay trap EXIT: la temporal se borra aunque el script muera a mitad" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "El veredicto negativo tambien se manda"
# Un dump que no restaura es tan grave como no tener dump. Si solo se avisara
# del exito, el fallo volveria a ser silencioso — el bug de arriba otra vez.
grep -q 'enviar_veredicto false' "$VERIFICAR_SH"
ok "hay al menos un camino que envia ok=false" $?
N_FALSE=$(grep -c 'enviar_veredicto false' "$VERIFICAR_SH")
[ "$N_FALSE" -ge 4 ]
ok "todos los caminos de fallo notifican ($N_FALSE encontrados)" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "SE VERIFICA EL ARCHIVO REAL DE S3, NO UN DUMP RECIEN HECHO"
#
# El agujero: el script generaba un dump NUEVO a las 03:30 y verificaba ESE,
# pero el veredicto se estampaba sobre el respaldo de las 02:00 que estaba en
# S3. La fila del panel decia "Probada" sobre un archivo que nadie habia
# abierto. Una subida truncada salia en verde.

grep -q 'aws s3 cp "s3://\$S3_BUCKET/\$S3_KEY"' "$VERIFICAR_SH"
ok "el camino por defecto BAJA el objeto de S3" $?
grep -q 'internal/ultimo' "$VERIFICAR_SH"
ok "pregunta al backend cual es el respaldo a verificar" $?
grep -q 'CHECKSUM_ESPERADO' "$VERIFICAR_SH"
ok "contrasta el SHA-256 contra el registrado al crearlo" $?

# Los dos fallos que el usuario pidio que quedaran como VEREDICTO NEGATIVO y no
# como error de infraestructura: si no se puede bajar, o si no cuadra el hash,
# eso ES que el respaldo no sirve.
sed -n '/No se pudo bajar el respaldo/p' "$VERIFICAR_SH" | grep -q 'enviar_veredicto false'
ok "una descarga fallida se registra como verificacion FALLIDA" $?
sed -n '/NO coincide con el checksum/p' "$VERIFICAR_SH" | grep -q 'enviar_veredicto false'
ok "un checksum que no cuadra se registra como verificacion FALLIDA" $?

# El veredicto tiene que clavarse en la fila del archivo que se probo, no en
# "el ultimo exitoso que hubiera al terminar".
grep -q 'CAMPO_ID="\\"backupId\\":\$BACKUP_ID,"' "$VERIFICAR_SH"
ok "el veredicto va contra el backupId exacto" $?

# BACKUP_ID tiene que estar puesto ANTES de los enviar_veredicto de la descarga
# y el checksum; si no, esos dos fallos irian a parar a la fila equivocada.
LINEA_ID=$(grep -n '^  BACKUP_ID=\$(json_numero' "$VERIFICAR_SH" | head -1 | cut -d: -f1)
LINEA_DESCARGA=$(grep -n 'No se pudo bajar el respaldo' "$VERIFICAR_SH" | head -1 | cut -d: -f1)
[ -n "$LINEA_ID" ] && [ -n "$LINEA_DESCARGA" ] && [ "$LINEA_ID" -lt "$LINEA_DESCARGA" ]
ok "BACKUP_ID (linea $LINEA_ID) se conoce antes del fallo de descarga (linea $LINEA_DESCARGA)" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "LA DURACION SE MANDA TAMBIEN EN EL CASO BUENO"
# Descartarla en exito era tirar el dato justo cuando sirve para ver una
# tendencia: lo que avisa de una degradacion no es el primer fallo.
grep -q '\\"duracion\\":\$DURACION' "$VERIFICAR_SH"
ok "el payload del veredicto lleva la duracion" $?
sed -n '/^enviar_veredicto() {/,/^}/p' "$VERIFICAR_SH" | grep -q 'DURACION=\$(( \$(date +%s) - INICIO ))'
ok "la duracion se calcula dentro de enviar_veredicto (todos los caminos)" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "EL CONTRASTE DE CONTEOS AGUANTA UN DUMP DE HACE HORA Y MEDIA"
#
# Antes se comparaba un dump de hacia SEGUNDOS, y "el dump tiene mas filas que
# produccion" se trataba como imposible. Verificando el archivo de las 02:00 a
# las 03:30 ya no lo es: en hora y media alguien borra un cliente y el dump pasa
# a tener legitimamente mas filas. Con la regla vieja, un borrado normal salia
# como verificacion FALLIDA — y un panel que grita en falso se deja de mirar.
grep -q 'TOLERANCIA_EXCESO_PCT' "$VERIFICAR_SH"
ok "hay tolerancia para la deriva por borrados" $?

comparar() {
  local RESTAURADO="$1" PRODUCCION="$2"
  TOLERANCIA_EXCESO_PCT=10 bash -c '
    set -uo pipefail
    N_RESTAURADO='"$RESTAURADO"'; N_PRODUCCION='"$PRODUCCION"'; FALLOS=""
    if [ "$N_RESTAURADO" -eq 0 ] && [ "$N_PRODUCCION" -gt 0 ]; then
      FALLOS="vacia"
    elif [ "$N_RESTAURADO" -gt "$N_PRODUCCION" ]; then
      UMBRAL=$(( N_PRODUCCION + (N_PRODUCCION * TOLERANCIA_EXCESO_PCT / 100) + 1 ))
      [ "$N_RESTAURADO" -gt "$UMBRAL" ] && FALLOS="exceso"
    fi
    [ -n "$FALLOS" ] && echo "FALLO:$FALLOS" || echo "OK"
  '
}

[ "$(comparar 12377 12380)" = "OK" ]
ok "produccion con unas filas mas que el dump: normal (siguen facturando)" $?
[ "$(comparar 128 127)" = "OK" ]
ok "un cliente borrado desde que se tomo el dump: normal, no es fallo" $?
[ "$(comparar 0 12377)" = "FALLO:vacia" ]
ok "tabla vacia en el dump con filas en produccion: FALLO" $?
[ "$(comparar 5000 100)" = "FALLO:exceso" ]
ok "el dump con 50x las filas de produccion: FALLO (borrado masivo o dump ajeno)" $?
[ "$(comparar 0 0)" = "OK" ]
ok "las dos vacias no es fallo (tabla legitimamente sin datos)" $?

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "EL REPORTE AL BACKEND NO PUEDE FALLAR EN SILENCIO"
#
# El bug que costo meses: `curl -sf ... || true` se traga el fallo entero. El
# backend devolvia 401 a TODOS los reportes y nadie se entero, mientras los
# respaldos corrian y subian a S3 sin problema.

# Los comentarios DOCUMENTAN el patron roto, asi que un grep a pelo sobre el
# archivo se encuentra a si mismo. Se miran solo lineas de codigo.
sin_comentarios() { sed 's/#.*//' "$1"; }

sin_comentarios "$BACKUP_SH" | grep -q 'curl -sf'
[ $? -ne 0 ]; ok "backup-hicloud.sh ya no usa 'curl -sf ... || true'" $?
sin_comentarios "$VERIFICAR_SH" | grep -q 'curl -sf'
[ $? -ne 0 ]; ok "verificar-backup.sh tampoco" $?
grep -q "http_code" "$BACKUP_SH"
ok "backup-hicloud.sh captura el codigo HTTP" $?
grep -q "http_code" "$VERIFICAR_SH"
ok "verificar-backup.sh captura el codigo HTTP" $?
grep -q "401|403" "$BACKUP_SH"
ok "un 401 se distingue y se explica en el log" $?

# Comprobacion de verdad: se levanta un servidor que responde 401 y se mira si
# el script deja constancia. Es el escenario exacto de produccion.
if command -v node >/dev/null 2>&1; then
  PUERTO=8791
  node -e "
    require('http').createServer((req,res)=>{res.writeHead(401,{'Content-Type':'application/json'});res.end('{\"message\":\"Token requerido\"}');})
      .listen($PUERTO, ()=>{ setTimeout(()=>process.exit(0), 8000); });
  " &
  SRV=$!
  sleep 1

  SALIDA=$(
    BACKEND_URL="http://127.0.0.1:$PUERTO" INTERNAL_KEY="una-clave" TIPO="daily" \
    LOG_FILE=/dev/null bash -c '
      log() { echo "$*"; }
      '"$(sed -n "/^reportar() {/,/^}/p" "$BACKUP_SH")"'
      reportar "admin/backups/internal/alert" "{\"mensaje\":\"prueba\"}"
    ' 2>&1
  )
  kill $SRV 2>/dev/null
  wait $SRV 2>/dev/null

  echo "$SALIDA" | grep -q "AVISO"
  ok "ante un 401 real del backend, el script escribe un AVISO" $?
  echo "$SALIDA" | grep -q "401"
  ok "y el AVISO incluye el codigo HTTP" $?
  echo "$SALIDA" | grep -qi "El backup SI se hizo"
  ok "y aclara que el backup si se hizo" $?
else
  echo "  (node no disponible: se omite la prueba contra un 401 real)"
fi

echo ""
echo "$((TOTAL - FALLOS))/$TOTAL comprobaciones OK"
exit $([ "$FALLOS" -eq 0 ] && echo 0 || echo 1)
