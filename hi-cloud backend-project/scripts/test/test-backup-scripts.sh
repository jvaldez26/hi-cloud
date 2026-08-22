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
