#!/usr/bin/env bash
#
# prepare.sh — provisioner de Hermes DroidBot (fase 7)
#
# Prepara un VPS Ubuntu/Debian para servir la PWA DroidBot contra Hermes:
#   browser   librerías del sistema que necesita el Chromium empaquetado de Hermes
#   computer  display virtual Xvfb :99 + openbox para computer use (cua-driver)
#   takeover  vista en vivo + control remoto: x11vnc + websockify/noVNC + ruta /desktop/* protegida
#   caddy     cache headers de la PWA mediante un bloque marcado en el Caddyfile
#   droidbot  instalación/actualización atómica de la PWA en /var/www/droidbot
#
# Idempotente: volver a ejecutar no cambia nada que ya esté correcto.
# Diagnóstico:  --check (solo lectura, exit 0/1) y --check --json.
# Ensayo:       --dry-run imprime los comandos sin ejecutarlos.
#
# Fuente de verdad de Hermes: checkout .hermes-ref pinneado a bf0203a.
# Ver contrato relevante:
#   - hermes serve --host 0.0.0.0 --port 9119       (hermes_cli/subcommands/dashboard.py)
#   - unidad systemd hermes-gateway*.service        (hermes_cli/gateway.py generate_systemd_unit)
#   - GET /api/auth/me → 401 sin sesión             (hermes_cli/dashboard_auth/routes.py)
#   - Chromium en ~/.hermes/tools/chromium-*/chrome-linux{64}/chrome  (pm/paths.py, pm/packages.py)
#   - cua-driver doctor --json                      (tools/computer_use/permissions.py)

set -euo pipefail

VERSION="1.0.0"
SCHEMA=1

# --- Constantes ---------------------------------------------------------------
DISPLAY_NUM=99
VNC_PORT=5900
NOVNC_PORT=6080
HERMES_PORT=9119
DISPLAY_ENV_FILE="/etc/hermes/droidbot-display.env"
VNC_PASS_FILE="/etc/hermes/droidbot-vnc.passwd"
WEBROOT="/var/www/droidbot"
DIST_MARKER="/var/lib/droidbot/dist.sha256"
CADDYFILE="/etc/caddy/Caddyfile"
DISPLAY_UNIT="droidbot-display.service"
VNC_UNIT="droidbot-vnc.service"
NOVNC_UNIT="droidbot-novnc.service"
DROPIN_NAME="droidbot-display.conf"
CADDY_CACHE_BEGIN="# BEGIN droidbot-preparer:cache (gestionado — no editar)"
CADDY_CACHE_END="# END droidbot-preparer:cache"
CADDY_DESKTOP_BEGIN="# BEGIN droidbot-preparer:desktop (gestionado — no editar)"
CADDY_DESKTOP_END="# END droidbot-preparer:desktop"

# --- Estado global -------------------------------------------------------------
CHECK=0
JSON_OUT=0
ALL=0
DRY=0
ARG_HERMES_USER=""
ARG_DOMAIN=""
ARG_DIST=""
MODULES=("browser" "computer" "takeover" "caddy" "droidbot")
declare -A M_STATUS=() M_NOTE=() M_DETAIL=()
APT_UPDATED=0
SYSTEMD_AVAILABLE=0

DISTRO_ID=""
DISTRO_VERSION_ID=""
DISTRO_CODENAME=""
HERMES_USER=""
HERMES_HOME_DIR=""
HERMES_HOME=""
XAUTH=""
CHROME=""
CUA_DRIVER=""
SYS_UNITS=()
USER_UNITS=()
DOMAIN=""
CADDY_BIN=""
CADDY_VERSION=""

# --- Logging --------------------------------------------------------------------
info() { printf '[info] %s\n' "$*" >&2; }
warn() { printf '[warn] %s\n' "$*" >&2; }
err()  { printf '[error] %s\n' "$*" >&2; }

die() { # die <exit> <msg>
  local code=$1
  shift
  err "$*"
  exit "$code"
}

# Imprime comandos de recuperación manual exactos.
manual() {
  local line
  for line in "$@"; do
    printf '[manual] %s\n' "$line" >&2
  done
}

# Ejecuta el comando, o lo imprime en modo --dry-run.
cmd() {
  if (( DRY )); then
    local q=()
    local a
    for a in "$@"; do q+=("$(printf '%q' "$a")"); done
    printf '[dry-run] %s\n' "${q[*]}"
    return 0
  fi
  "$@"
}

# Como el usuario Hermes (el script siempre corre como root).
run_hermes() {
  cmd runuser -u "$HERMES_USER" -- "$@"
}

set_status() { # set_status <modulo> <status> <nota>
  M_STATUS[$1]=$2
  M_NOTE[$1]=$3
}

json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r\t'
}

# --- Detección de entorno --------------------------------------------------------
detect_distro() {
  [[ -r /etc/os-release ]] || die 2 "no se pudo leer /etc/os-release"
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO_ID=${ID:-unknown}
  DISTRO_VERSION_ID=${VERSION_ID:-}
  DISTRO_CODENAME=${VERSION_CODENAME:-}
  case "$DISTRO_ID" in
    ubuntu | debian) ;;
    *) die 2 "distro no soportada: ${DISTRO_ID}. Este script solo soporta Debian/Ubuntu." ;;
  esac
  info "distro detectada: ${DISTRO_ID} ${DISTRO_VERSION_ID} (${DISTRO_CODENAME})"
}

# Lista de paquetes derivada de `playwright install-deps chromium` para cada distro
# (packages/playwright-core/src/server/registry/nativeDeps.ts):
#  - Ubuntu 24.04+ y Debian 13+ usan los nombres con sufijo t64 (incluye libasound2t64,
#    la librería que faltó en el incidente real del VPS).
#  - Ubuntu 22.04 / Debian 12 usan los nombres históricos.
set_browser_packages() {
  local t64=0
  case "$DISTRO_ID" in
    ubuntu) [[ ${DISTRO_VERSION_ID%%.*} -ge 24 ]] && t64=1 ;;
    debian) [[ ${DISTRO_VERSION_ID%%.*} -ge 13 ]] && t64=1 ;;
  esac
  BROWSER_PKGS=(fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6
    xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic
    fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf xvfb)
  if (( t64 )); then
    BROWSER_PKGS+=(libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64
      libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4
      libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6
      libxfixes3 libxkbcommon0 libxrandr2)
  else
    BROWSER_PKGS+=(libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2
      libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3
      libpango-1.0-0 libwayland-client0 libx11-6 libxcb1 libxcomposite1 libxdamage1
      libxext6 libxfixes3 libxkbcommon0 libxrandr2)
  fi
}

resolve_hermes_user() {
  if [[ -n $ARG_HERMES_USER ]]; then
    getent passwd "$ARG_HERMES_USER" >/dev/null || die 2 "usuario inexistente: $ARG_HERMES_USER"
    HERMES_USER=$ARG_HERMES_USER
  else
    local found=() d
    shopt -s nullglob
    for d in /home/*/.hermes /root/.hermes; do
      [[ -d $d ]] && found+=("$d")
    done
    shopt -u nullglob
    if ((${#found[@]} == 1)); then
      HERMES_HOME_DIR=${found[0]%/.hermes}
      HERMES_USER=$(stat -c '%U' "$HERMES_HOME_DIR")
      info "usuario Hermes autodetectado por ~/.hermes: ${HERMES_USER}"
    else
      getent passwd hermes >/dev/null \
        || die 2 "no se pudo autodetectar el dueño de ~/.hermes (${#found[@]} candidatos) y no existe el usuario 'hermes'. Usá --hermes-user <usuario>."
      HERMES_USER=hermes
      warn "autodetección ambigua (${#found[@]} candidatos a ~/.hermes); usando 'hermes'"
    fi
  fi
  HERMES_HOME_DIR=$(getent passwd "$HERMES_USER" | cut -d: -f6)
  HERMES_HOME=$HERMES_HOME_DIR/.hermes
  XAUTH=$HERMES_HOME/droidbot-xauthority
}

find_chrome() {
  CHROME=${AGENT_BROWSER_EXECUTABLE_PATH:-}
  if [[ -n $CHROME ]]; then
    [[ -x $CHROME ]] || CHROME=""
    [[ -n $CHROME ]] && return 0
  fi
  local d c
  shopt -s nullglob
  for d in "$HERMES_HOME"/tools/chromium-*/; do
    for c in "$d"chrome-linux/chrome "$d"chrome-linux64/chrome; do
      if [[ -x $c ]]; then
        CHROME=$c
        shopt -u nullglob
        return 0
      fi
    done
  done
  shopt -u nullglob
  CHROME=""
  return 1
}

find_cua_driver() {
  CUA_DRIVER=${HERMES_CUA_DRIVER_CMD:-}
  if [[ -n $CUA_DRIVER ]]; then
    [[ -x $CUA_DRIVER ]] || CUA_DRIVER=""
    [[ -n $CUA_DRIVER ]] && return 0
  fi
  local b
  shopt -s nullglob
  for b in "$HERMES_HOME"/tools/cua-driver-*/cua-driver; do
    if [[ -x $b ]]; then
      CUA_DRIVER=$b
      shopt -u nullglob
      return 0
    fi
  done
  shopt -u nullglob
  local which_bin
  which_bin=$(command -v cua-driver 2>/dev/null || true)
  if [[ -n $which_bin ]]; then
    CUA_DRIVER=$which_bin
    return 0
  fi
  CUA_DRIVER=""
  return 1
}

detect_hermes_units() {
  SYS_UNITS=()
  USER_UNITS=()
  local u
  shopt -s nullglob
  for u in /etc/systemd/system/hermes-*.service; do
    SYS_UNITS+=("$(basename "$u")")
  done
  for u in "$HERMES_HOME_DIR"/.config/systemd/user/hermes-*.service; do
    USER_UNITS+=("$(basename "$u")")
  done
  shopt -u nullglob
}

pkg_installed() {
  [[ "$(dpkg-query -W -f='${db:Status-Status}' "$1" 2>/dev/null)" == "installed" ]]
}

apt_ensure_installed() { # apt_ensure_installed <pkg>...
  local missing=() p
  for p in "$@"; do
    pkg_installed "$p" || missing+=("$p")
  done
  ((${#missing[@]} == 0)) && return 0
  if (( DRY )); then
    cmd apt-get update -qq
    cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
    return 0
  fi
  if (( !APT_UPDATED )); then
    apt-get update -qq
    APT_UPDATED=1
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
}

# Escribe <path> con <content> solo si difiere. Exit 0 = sin cambios, 1 = escribió (o escribiría).
# En modo --check NUNCA escribe: solo compara.
write_file_if_changed() {
  local path=$1 content=$2
  if [[ -f $path ]] && [[ "$(cat "$path")" == "$content" ]]; then
    return 0
  fi
  if (( CHECK )); then
    return 1
  fi
  if (( DRY )); then
    printf '[dry-run] escribir %s\n' "$path"
    return 1
  fi
  mkdir -p "$(dirname "$path")"
  local tmp=$path.droidbot.tmp.$$
  printf '%s\n' "$content" > "$tmp"
  if [[ -f $path ]]; then
    chmod --reference="$path" "$tmp"
  else
    chmod 644 "$tmp"
  fi
  mv "$tmp" "$path"
  info "escrito: $path"
  return 1
}

resolve_domain() {
  DOMAIN=""
  if [[ -n $ARG_DOMAIN ]]; then
    DOMAIN=$ARG_DOMAIN
    DOMAIN=${DOMAIN#https://}
    DOMAIN=${DOMAIN#http://}
    DOMAIN=${DOMAIN%%/*}
    DOMAIN=${DOMAIN%%:*}
    return 0
  fi
  [[ -f $CADDYFILE ]] || return 1
  local matches=() m
  mapfile -t matches < <(grep -E '^[^[:space:]#].*\{[[:space:]]*$' "$CADDYFILE" 2>/dev/null || true)
  ((${#matches[@]} == 1)) || return 1
  m=${matches[0]%%\{*}
  m=${m%%,*}
  m=${m// /}
  DOMAIN=${m#https://}
  DOMAIN=${DOMAIN#http://}
  DOMAIN=${DOMAIN%%:*}
  [[ -n $DOMAIN && $DOMAIN != *'*'* ]] && return 0
  DOMAIN=""
  return 1
}

find_caddy() {
  CADDY_BIN=$(command -v caddy 2>/dev/null || true)
  CADDY_VERSION=""
  if [[ -n $CADDY_BIN ]]; then
    CADDY_VERSION=$(caddy version 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
  fi
}

# Línea del bloque site del dominio en el Caddyfile (0 si no se encuentra).
find_site_open_line() {
  awk -v d="$DOMAIN" '
    index($0, "{") > 0 && $0 !~ /^[[:space:]]*#/ && index($0, d) > 0 && index($0, d) < index($0, "{") {
      print NR
      exit
    }
  ' "$1" 2>/dev/null || true
}

# Inserta <blockfile> después de la línea <line> de <file>.
insert_block_after_line() {
  local file=$1 line=$2 blockfile=$3
  if (( DRY )); then
    printf '[dry-run] insertar bloque (%s) tras la línea %s en %s\n' "$blockfile" "$line" "$file"
    return 0
  fi
  local tmp=$file.droidbot.tmp.$$
  awk -v blk="$blockfile" -v at="$line" '
    { print }
    NR == at { while ((getline x < blk) > 0) print x; close(blk) }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Quita del Caddyfile el bloque entre <begin> y <end> (si existe). Exit 0 = había bloque.
strip_marked_block() {
  local file=$1 begin=$2 end=$3
  if ! grep -qF "$begin" "$file" 2>/dev/null; then
    return 1
  fi
  if (( DRY )); then
    printf '[dry-run] reemplazar bloque marcado (%s) en %s\n' "$begin" "$file"
    return 0
  fi
  local tmp=$file.droidbot.tmp.$$
  # index() (coincidencia literal), no regex: los marcadores llevan paréntesis.
  awk -v b="$begin" -v e="$end" '
    index($0, b) > 0 { skip = 1; next }
    index($0, e) > 0 { skip = 0; next }
    !skip { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
  return 0
}

# Garantiza que el bloque marcado exista dentro del site del dominio, con el contenido exacto.
# En modo --check nunca muta el Caddyfile (no se lo llama igual: defensa en profundidad).
upsert_marked_block() {
  local begin=$1 end=$2 blockfile=$3
  [[ -f $CADDYFILE ]] || return 1
  (( CHECK )) && return 1
  local line
  line=$(find_site_open_line "$CADDYFILE")
  [[ -n $line ]] || return 1
  strip_marked_block "$CADDYFILE" "$begin" "$end" || true
  insert_block_after_line "$CADDYFILE" "$line" "$blockfile"
  return 0
}

caddy_validate_and_reload() {
  if (( DRY )); then
    cmd "$CADDY_BIN" validate --config "$CADDYFILE" --adapter caddyfile
    cmd systemctl reload caddy
    return 0
  fi
  local ok=true
  if cmd "$CADDY_BIN" validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    info "caddy validate: OK"
  else
    ok=false
  fi
  if $ok; then
    if (( DRY )); then
      cmd systemctl reload caddy
    elif systemctl reload caddy 2>/dev/null; then
      info "caddy recargado (systemctl reload caddy)"
    else
      ok=false
    fi
  fi
  if ! $ok; then
    manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
    manual "systemctl reload caddy"
    return 1
  fi
  return 0
}

# --- Plantillas de unidades systemd y archivos -----------------------------------
render_display_unit() {
  cat <<EOF
[Unit]
Description=DroidBot virtual display :${DISPLAY_NUM} (Xvfb + openbox) for Hermes computer use
After=network.target

[Service]
Type=simple
User=${HERMES_USER}
Group=${HERMES_USER}
Environment=DISPLAY=:${DISPLAY_NUM}
Environment=XAUTHORITY=${XAUTH}
ExecStart=/bin/bash -c 'rm -f "\$XAUTHORITY"; touch "\$XAUTHORITY"; /usr/bin/xauth -f "\$XAUTHORITY" add :${DISPLAY_NUM} . "\$(/usr/bin/mcookie)"; /usr/bin/Xvfb :${DISPLAY_NUM} -screen 0 1440x900x24 -nolisten tcp -auth "\$XAUTHORITY" & sleep 1; exec /usr/bin/openbox'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

render_vnc_unit() {
  cat <<EOF
[Unit]
Description=DroidBot x11vnc on :${DISPLAY_NUM} (loopback only, password protected)
After=${DISPLAY_UNIT}
Requires=${DISPLAY_UNIT}

[Service]
Type=simple
ExecStart=/usr/bin/x11vnc -display :${DISPLAY_NUM} -auth ${XAUTH} -rfbauth ${VNC_PASS_FILE} -localhost -forever -shared -noshm -rfbport ${VNC_PORT} -ncache 0 -quiet
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

render_novnc_unit() {
  cat <<EOF
[Unit]
Description=DroidBot noVNC (websockify) for live view, loopback only
After=${VNC_UNIT}
Requires=${VNC_UNIT}

[Service]
Type=simple
User=${HERMES_USER}
ExecStart=/usr/bin/websockify 127.0.0.1:${NOVNC_PORT} --web=/usr/share/novnc/ 127.0.0.1:${VNC_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

render_display_env_file() {
  printf '# Gestionado por provisioner/prepare.sh (droidbot). No editar.\nDISPLAY=:%s\nXAUTHORITY=%s\n' \
    "$DISPLAY_NUM" "$XAUTH"
}

render_dropin() {
  cat <<EOF
# Gestionado por provisioner/prepare.sh (droidbot).
# Se usa EnvironmentFile (no Environment=) a propósito: para listas como
# Environment=, un drop-in REEMPLAZA la lista completa de la unidad y borraría
# HOME/USER/PATH/HERMES_HOME del hermes-gateway generado por Hermes.
[Service]
EnvironmentFile=${DISPLAY_ENV_FILE}
EOF
}

render_caddy_cache_block() {
  cat <<EOF
	${CADDY_CACHE_BEGIN}
	@pwa-nocache {
		path /sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js
	}
	header @pwa-nocache Cache-Control "no-cache, no-store, must-revalidate"
	@assets-immutable {
		path /assets/*
	}
	header @assets-immutable Cache-Control "public, max-age=31536000, immutable"
	${CADDY_CACHE_END}
EOF
}

render_caddy_desktop_block() {
  cat <<EOF
	${CADDY_DESKTOP_BEGIN}
	handle /desktop/* {
		forward_auth 127.0.0.1:${HERMES_PORT} {
			uri /api/auth/me
		}
		uri strip_prefix /desktop
		reverse_proxy 127.0.0.1:${NOVNC_PORT}
	}
	${CADDY_DESKTOP_END}
EOF
}

# --- Módulos ---------------------------------------------------------------------
mod_browser() {
  local missing=() p
  for p in "${BROWSER_PKGS[@]}"; do
    pkg_installed "$p" || missing+=("$p")
  done
  if ((${#missing[@]} > 0)) && (( !CHECK )); then
    info "browser: faltan ${#missing[@]} paquetes; instalando"
    apt_ensure_installed "${missing[@]}"
  fi

  missing=()
  for p in "${BROWSER_PKGS[@]}"; do
    pkg_installed "$p" || missing+=("$p")
  done
  if ((${#missing[@]} > 0)); then
    local miss=""
    for p in "${missing[@]}"; do
      miss+=$(printf '"%s",' "$p")
    done
    miss=${miss%,}
    set_status browser fail "faltan ${#missing[@]} paquetes de sistema"
    manual "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${missing[*]}"
    M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[${miss}],\"ldd_not_found\":null,\"dump_dom\":null"
    return
  fi

  if [[ -z $CHROME ]]; then
    set_status browser warn "librerías OK pero no hay Chromium en ~/.hermes/tools"
    manual "runuser -u ${HERMES_USER} -- hermes tools post-setup agent_browser"
    M_DETAIL[browser]="\"chrome\":null,\"missing_packages\":[],\"ldd_not_found\":null,\"dump_dom\":null"
    return
  fi

  local ldd_missing
  ldd_missing=$(ldd "$CHROME" 2>/dev/null | grep -c 'not found' || true)
  ldd_missing=${ldd_missing:-0}
  local dump_ok=true
  if (( DRY && !CHECK )); then
    cmd timeout 60 runuser -u "$HERMES_USER" -- env HOME="$HERMES_HOME_DIR" "$CHROME" \
      --headless=new --disable-gpu --no-sandbox --dump-dom about:blank
  else
    local profile_dir
    profile_dir=$(mktemp -d /tmp/droidbot-chrome-check.XXXXXX)
    chown "$HERMES_USER" "$profile_dir"
    if run_hermes timeout 60 env HOME="$HERMES_HOME_DIR" "$CHROME" --headless=new --disable-gpu --no-sandbox \
      --disable-dev-shm-usage --user-data-dir="$profile_dir" --dump-dom about:blank 2>/dev/null | grep -q '<html'; then
      dump_ok=true
    else
      dump_ok=false
    fi
    rm -rf "$profile_dir"
  fi

  if [[ $ldd_missing -gt 0 || $dump_ok == false ]]; then
    set_status browser fail "ldd reporta ${ldd_missing} librerías faltantes y/o --dump-dom falló"
    manual "ldd ${CHROME} | grep 'not found'"
    manual "runuser -u ${HERMES_USER} -- env HOME=${HERMES_HOME_DIR} ${CHROME} --headless=new --disable-gpu --no-sandbox --dump-dom about:blank"
    M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[],\"ldd_not_found\":${ldd_missing},\"dump_dom\":\"fail\""
    return
  fi
  set_status browser ok "Chromium OK: ldd sin 'not found' y --dump-dom funciona"
  M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[],\"ldd_not_found\":0,\"dump_dom\":\"ok\""
}

mod_computer() {
  if (( !CHECK )); then
    apt_ensure_installed xvfb openbox x11-utils xauth
  fi
  local pkgs_ok=true
  for p in xvfb openbox x11-utils xauth; do
    pkg_installed "$p" || pkgs_ok=false
  done
  if ! $pkgs_ok; then
    set_status computer fail "faltan paquetes: xvfb/openbox/x11-utils"
    manual "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb openbox x11-utils xauth"
    M_DETAIL[computer]=""
    return
  fi

  local changed=0
  write_file_if_changed "$DISPLAY_ENV_FILE" "$(render_display_env_file)" || changed=1
  write_file_if_changed "/etc/systemd/system/${DISPLAY_UNIT}" "$(render_display_unit)" || changed=1

  # Drop-ins para las unidades de Hermes detectadas (system + user).
  # Nunca se edita el unit de Hermes: el drop-in vive en <unit>.d/.
  local dropin dropin_dir unit
  local dropins_applied=0
  for unit in "${SYS_UNITS[@]}"; do
    dropin_dir="/etc/systemd/system/${unit}.d"
    dropin="$dropin_dir/${DROPIN_NAME}"
    write_file_if_changed "$dropin" "$(render_dropin)" || dropins_applied=1
  done
  for unit in "${USER_UNITS[@]}"; do
    dropin_dir="$HERMES_HOME_DIR/.config/systemd/user/${unit}.d"
    dropin="$dropin_dir/${DROPIN_NAME}"
    write_file_if_changed "$dropin" "$(render_dropin)" || dropins_applied=1
  done

  if (( changed || dropins_applied )) && (( !CHECK )); then
    if ((${#USER_UNITS[@]} > 0)); then
      # Los drop-ins en el home del usuario deben quedar del usuario (no de root).
      for unit in "${USER_UNITS[@]}"; do
        dropin_dir="$HERMES_HOME_DIR/.config/systemd/user/${unit}.d"
        cmd chown "$HERMES_USER:$HERMES_USER" "$dropin_dir" 2>/dev/null || true
        cmd chown "$HERMES_USER:$HERMES_USER" "$dropin_dir/${DROPIN_NAME}" 2>/dev/null || true
      done
    fi
    cmd systemctl daemon-reload
    if ((${#USER_UNITS[@]} > 0)); then
      # shellcheck disable=SC2016 # $(id -u) se expande en el bash interno (lado usuario), no acá
      cmd runuser -u "$HERMES_USER" -- bash -c 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user daemon-reload' || true
    fi
  fi

  if (( !CHECK )); then
    cmd systemctl enable --now "$DISPLAY_UNIT"
  fi

  local unit_active=false
  local socket_ok=false
  local xdpy_ok=false
  if (( DRY && !CHECK )); then
    # Ensayo: las verificaciones de estado se asumen al aplicar.
    unit_active=true
    socket_ok=true
    xdpy_ok=true
  else
    if [[ "$(systemctl is-active "$DISPLAY_UNIT" 2>/dev/null || true)" == "active" ]]; then
      unit_active=true
    fi
    [[ -S /tmp/.X11-unix/X${DISPLAY_NUM} ]] && socket_ok=true
    if run_hermes env DISPLAY=":${DISPLAY_NUM}" XAUTHORITY="$XAUTH" xdpyinfo >/dev/null 2>&1; then
      xdpy_ok=true
    fi
  fi

  # Verificación con cua-driver si está disponible.
  local cua_json="null"
  local cua_ok="null"
  if [[ -n $CUA_DRIVER ]]; then
    local doctor_out
    if doctor_out=$(run_hermes env DISPLAY=":${DISPLAY_NUM}" XAUTHORITY="$XAUTH" "$CUA_DRIVER" doctor --json 2>/dev/null); then
      if printf '%s' "$doctor_out" | grep -q '"ok" *: *true'; then
        cua_ok="true"
      elif printf '%s' "$doctor_out" | grep -q '"ok"'; then
        cua_ok="false"
      fi
    fi
    cua_json="{\"path\":$(printf '%s' "$CUA_DRIVER" | json_escape | sed 's/^/"/;s/$/"/'),\"doctor_ok\":${cua_ok}}"
  fi

  local restart_list=()
  for unit in "${SYS_UNITS[@]}" "${USER_UNITS[@]}"; do
    restart_list+=("$unit")
  done
  local restart_json=""
  for unit in "${restart_list[@]}"; do
    restart_json+=$(printf '"%s",' "$unit")
  done
  restart_json=${restart_json%,}

  M_DETAIL[computer]=$(cat <<EOF
"display_unit":"${DISPLAY_UNIT}","unit_active":${unit_active},"x_socket":${socket_ok},"xdpyinfo":${xdpy_ok},"cua_driver":${cua_json},"dropins":${dropins_applied},"restart_needed":[${restart_json}]
EOF
  )
  M_DETAIL[computer]=$(printf '%s' "${M_DETAIL[computer]}" | tr -d '\n\t')

  if ! $unit_active || ! $socket_ok || ! $xdpy_ok; then
    set_status computer fail "display :99 no operativo (unit=${unit_active}, socket=${socket_ok}, xdpyinfo=${xdpy_ok})"
    manual "systemctl start ${DISPLAY_UNIT}"
    manual "journalctl -u ${DISPLAY_UNIT} -e"
    return
  fi

  if ((${#SYS_UNITS[@]} + ${#USER_UNITS[@]} == 0)); then
    set_status computer warn "display OK, pero no se detectaron unidades systemd de Hermes (¿'hermes serve' corre a mano?)"
    manual "export DISPLAY=:${DISPLAY_NUM} XAUTHORITY=${XAUTH}   # en el entorno donde corre hermes serve/gateway"
    return
  fi

  local restart_note
  restart_note=$(printf '%s' "reiniciar para tomar DISPLAY: $(IFS=' '; echo "${restart_list[*]}")")
  set_status computer ok "$restart_note"
}

mod_takeover() {
  # Depende del display de computer: sin Xvfb activo no hay nada que mostrar.
  local display_active=false
  if (( DRY )); then
    display_active=true
  elif [[ "$(systemctl is-active "$DISPLAY_UNIT" 2>/dev/null || true)" == "active" ]]; then
    display_active=true
  fi
  if ! $display_active && (( !CHECK )); then
    set_status takeover fail "el display :99 no está activo; corré antes el módulo computer"
    manual "./prepare.sh computer --domain ${DOMAIN:-<host>}   # y después volvé a correr takeover"
    M_DETAIL[takeover]="\"reason\":\"display-inactive\""
    return
  fi

  if (( !CHECK )); then
    apt_ensure_installed x11vnc websockify novnc curl
  fi

  # Contraseña VNC aleatoria, root-only, generada una sola vez.
  local pass_ok=true
  if [[ ! -f $VNC_PASS_FILE ]]; then
    if (( DRY )); then
      printf '[dry-run] generar contraseña VNC en %s (root-only 0600)\n' "$VNC_PASS_FILE"
    elif (( !CHECK )); then
      mkdir -p "$(dirname "$VNC_PASS_FILE")"
      local pass
      pass=$(openssl rand -hex 24)
      if x11vnc -storepasswd "$pass" "$VNC_PASS_FILE" >/dev/null 2>&1; then
        chown root:root "$VNC_PASS_FILE"
        chmod 600 "$VNC_PASS_FILE"
        info "contraseña VNC generada en ${VNC_PASS_FILE} (root-only)"
      else
        pass_ok=false
      fi
    fi
  fi
  if [[ -f $VNC_PASS_FILE ]]; then
    local st owner
    st=$(stat -c '%a' "$VNC_PASS_FILE")
    owner=$(stat -c '%U' "$VNC_PASS_FILE")
    if [[ $st != "600" || $owner != "root" ]]; then
      pass_ok=false
      if (( !CHECK )); then
        chown root:root "$VNC_PASS_FILE"
        chmod 600 "$VNC_PASS_FILE"
        pass_ok=true
      fi
    fi
  elif (( DRY )); then
    : # ensayo: la generación de contraseña ya se imprimió arriba
  else
    pass_ok=false
  fi

  if (( !CHECK )); then
    write_file_if_changed "/etc/systemd/system/${VNC_UNIT}" "$(render_vnc_unit)" || true
    write_file_if_changed "/etc/systemd/system/${NOVNC_UNIT}" "$(render_novnc_unit)" || true
    cmd systemctl daemon-reload
    cmd systemctl enable --now "$VNC_UNIT"
    cmd systemctl enable --now "$NOVNC_UNIT"
  fi

  # Ruta /desktop/* protegida con forward_auth contra /api/auth/me (401 sin sesión).
  local caddy_ok=true
  if [[ -f $CADDYFILE ]]; then
    if (( CHECK )); then
      # Diagnóstico: solo verificar presencia del bloque marcado.
      grep -qF "$CADDY_DESKTOP_BEGIN" "$CADDYFILE" && grep -qF "$CADDY_DESKTOP_END" "$CADDYFILE" || caddy_ok=false
    else
      local block
      block=$(mktemp /tmp/droidbot-caddy-desktop.XXXXXX)
      render_caddy_desktop_block > "$block"
      if upsert_marked_block "$CADDY_DESKTOP_BEGIN" "$CADDY_DESKTOP_END" "$block"; then
        if (( DRY )); then
          printf '[dry-run] respaldo: cp -a %s %s.bak.droidbot\n' "$CADDYFILE" "$CADDYFILE"
        else
          cp -a "$CADDYFILE" "$CADDYFILE.bak.droidbot.$(date +%s)"
          info "Caddyfile respaldado en ${CADDYFILE}.bak.droidbot.*"
        fi
        caddy_validate_and_reload || caddy_ok=false
      else
        caddy_ok=false
      fi
      rm -f "$block"
    fi
  else
    caddy_ok=false
  fi

  local vnc_listening=false novnc_listening=false
  local probe=""
  local probe_ok=false
  if (( DRY && !CHECK )); then
    # Ensayo: los puertos y el 401 se asumen tras aplicar.
    vnc_listening=true
    novnc_listening=true
    probe_ok=true
    probe="(ensayo)"
  else
    if ss -ltn 2>/dev/null | grep -q "127.0.0.1:${VNC_PORT}"; then vnc_listening=true; fi
    if ss -ltn 2>/dev/null | grep -q "127.0.0.1:${NOVNC_PORT}"; then novnc_listening=true; fi

    # Probar que /desktop/ rechace sesiones no autenticadas (401 o redirect).
    if command -v curl >/dev/null 2>&1 && [[ -n $DOMAIN ]]; then
      probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" \
        -k "https://${DOMAIN}/desktop/" 2>/dev/null || true)
      if [[ -z $probe ]]; then
        probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: ${DOMAIN}" \
          "http://127.0.0.1/desktop/" 2>/dev/null || true)
      fi
      case "$probe" in
        401 | 302 | 303) probe_ok=true ;;
      esac
    fi
  fi

  M_DETAIL[takeover]=$(cat <<EOF
"vnc_listening":${vnc_listening},"novnc_listening":${novnc_listening},"password_file":$(printf '%s' "$VNC_PASS_FILE" | json_escape | sed 's/^/"/;s/$/"/'),"password_ok":${pass_ok},"desktop_probe":$(printf '%s' "${probe:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"caddy_route":${caddy_ok},"caddy_version":$(printf '%s' "${CADDY_VERSION:-null}" | json_escape | sed 's/^/"/;s/$/"/')
EOF
  )
  M_DETAIL[takeover]=$(printf '%s' "${M_DETAIL[takeover]}" | tr -d '\n\t')

  local failed=0
  if ! $pass_ok; then
    err "takeover: contraseña VNC ausente o con permisos incorrectos"
    failed=1
  fi
  if ! $caddy_ok; then
    err "takeover: no se pudo asegurar la ruta /desktop/* en el Caddyfile"
    failed=1
  fi
  if ! $vnc_listening; then
    err "takeover: x11vnc no escucha en 127.0.0.1:${VNC_PORT}"
    manual "systemctl start ${VNC_UNIT}"
    failed=1
  fi
  if ! $novnc_listening; then
    err "takeover: websockify no escucha en 127.0.0.1:${NOVNC_PORT}"
    manual "systemctl start ${NOVNC_UNIT}"
    failed=1
  fi
  if (( failed )); then
    set_status takeover fail "vista en vivo incompleta (ver errores arriba)"
    manual "journalctl -u ${VNC_UNIT} -u ${NOVNC_UNIT} -e"
    return
  fi
  if ! $probe_ok; then
    set_status takeover warn "servicios OK pero no se pudo verificar el 401 de /desktop/ (respuesta: ${probe:-sin respuesta})"
    manual "curl -sS -o /dev/null -w '%{http_code}' -H 'Host: ${DOMAIN}' http://127.0.0.1/desktop/"
    return
  fi
  set_status takeover ok "noVNC listo; /desktop/ exige sesión Hermes (${probe})"
}

mod_caddy() {
  find_caddy
  if [[ -z $CADDY_BIN ]] || [[ ! -f $CADDYFILE ]]; then
    set_status caddy fail "caddy o ${CADDYFILE} no encontrados"
    manual "apt-get install -y caddy   # o el repo oficial: https://caddyserver.com/docs/install#debian-ubuntu-raspbian"
    M_DETAIL[caddy]="\"site_found\":false,\"cache_block\":false,\"validate\":false"
    return
  fi

  local line
  line=$(find_site_open_line "$CADDYFILE")
  if [[ -z $line ]]; then
    set_status caddy fail "no se encontró el bloque site de '${DOMAIN}' en ${CADDYFILE}"
    manual "editá ${CADDYFILE} y agregá el bloque site de ${DOMAIN} (o pasá --domain <host>)"
    M_DETAIL[caddy]="\"site_found\":false,\"cache_block\":false,\"validate\":false,\"caddy_version\":$(printf '%s' "${CADDY_VERSION:-}" | json_escape | sed 's/^/"/;s/$/"/')"
    return
  fi

  local block
  block=$(mktemp /tmp/droidbot-caddy-cache.XXXXXX)
  render_caddy_cache_block > "$block"

  local has_block=false
  if grep -qF "$CADDY_CACHE_BEGIN" "$CADDYFILE" && grep -qF "$CADDY_CACHE_END" "$CADDYFILE"; then
    has_block=true
  fi

  local caddy_ok=true
  if ! $has_block || (( !CHECK )); then
    if (( !CHECK )); then
      upsert_marked_block "$CADDY_CACHE_BEGIN" "$CADDY_CACHE_END" "$block" || caddy_ok=false
      if $caddy_ok; then
        if (( DRY )); then
          printf '[dry-run] respaldo: cp -a %s %s.bak.droidbot\n' "$CADDYFILE" "$CADDYFILE"
        else
          cp -a "$CADDYFILE" "$CADDYFILE.bak.droidbot.$(date +%s)"
        fi
        caddy_validate_and_reload || caddy_ok=false
      fi
    fi
  fi
  rm -f "$block"
  has_block=true
  if (( !DRY )); then
    grep -qF "$CADDY_CACHE_BEGIN" "$CADDYFILE" || has_block=false
  fi

  local validate_ok=false
  if (( DRY && !CHECK )); then
    # Ensayo: la validación real corre al aplicar.
    validate_ok=true
  elif "$CADDY_BIN" validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    validate_ok=true
  fi

  # Sondear headers reales (best-effort; si el sitio no responde localmente no es fallo del bloque).
  local sw_header="" assets_header=""
  if (( !DRY )) && command -v curl >/dev/null 2>&1 && [[ -n $DOMAIN ]]; then
    sw_header=$(curl -sSI --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" -k \
      "https://${DOMAIN}/sw.js" 2>/dev/null | grep -i '^cache-control:' | tr -d '\r' || true)
    [[ -z $sw_header ]] && sw_header=$(curl -sSI --max-time 10 -H "Host: ${DOMAIN}" \
      "http://127.0.0.1/sw.js" 2>/dev/null | grep -i '^cache-control:' | tr -d '\r' || true)
    assets_header=$(curl -sSI --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" -k \
      "https://${DOMAIN}/assets/x.js" 2>/dev/null | grep -i '^cache-control:' | tr -d '\r' || true)
    [[ -z $assets_header ]] && assets_header=$(curl -sSI --max-time 10 -H "Host: ${DOMAIN}" \
      "http://127.0.0.1/assets/x.js" 2>/dev/null | grep -i '^cache-control:' | tr -d '\r' || true)
  fi

  M_DETAIL[caddy]=$(cat <<EOF
"site_found":true,"cache_block":${has_block},"validate":${validate_ok},"caddy_version":$(printf '%s' "${CADDY_VERSION:-}" | json_escape | sed 's/^/"/;s/$/"/'),"sw_cache_header":$(printf '%s' "${sw_header:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"assets_cache_header":$(printf '%s' "${assets_header:-null}" | json_escape | sed 's/^/"/;s/$/"/')
EOF
  )
  M_DETAIL[caddy]=$(printf '%s' "${M_DETAIL[caddy]}" | tr -d '\n\t')

  if ! $validate_ok || ! $has_block; then
    set_status caddy fail "Caddyfile inválido o bloque de cache ausente"
    manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
    return
  fi
  if (( DRY && !CHECK )); then
    set_status caddy ok "(ensayo) bloque de cache listo para insertar; headers se aplican al recargar"
    return
  fi
  if [[ -z $sw_header && -z $assets_header ]]; then
    set_status caddy warn "bloque presente y Caddyfile válido, pero no se pudo sondear ${DOMAIN} localmente"
    manual "curl -sSI -H 'Host: ${DOMAIN}' http://127.0.0.1/sw.js"
    return
  fi
  set_status caddy ok "headers de cache activos (sw.js: '${sw_header:-?}')"
}

mod_droidbot() {
  if (( CHECK )); then
    check_droidbot
    return
  fi
  if [[ -z $ARG_DIST ]]; then
    set_status droidbot fail "requiere --dist <ruta|url-a-tar.gz>"
    M_DETAIL[droidbot]="\"installed\":$([[ -f $WEBROOT/index.html ]] && echo true || echo false)"
    return
  fi

  local tarball src=$ARG_DIST
  if (( DRY )); then
    # Ensayo: imprimir el flujo completo sin ejecutar nada.
    if [[ $src == http://* || $src == https://* ]]; then
      cmd curl -fsSL --retry 3 -o "/tmp/droidbot-dist.tar.gz" "$src"
    fi
    printf '[dry-run] sha256sum del dist → comparar contra %s\n' "$DIST_MARKER"
    printf '[dry-run] extraer en %s.stage; validar index.html\n' "$WEBROOT"
    printf '[dry-run] swap atómico: rm -rf %s.prev; mv %s %s.prev; mv stage %s\n' \
      "$WEBROOT" "$WEBROOT" "$WEBROOT" "$WEBROOT"
    printf '[dry-run] escribir %s\n' "$DIST_MARKER"
    set_status droidbot ok "(ensayo) deploy simulado en ${WEBROOT}"
    M_DETAIL[droidbot]="\"installed\":null,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi

  if [[ $src == http://* || $src == https://* ]]; then
    tarball=$(mktemp /tmp/droidbot-dist.XXXXXX.tar.gz)
    if ! cmd curl -fsSL --retry 3 -o "$tarball" "$src"; then
      rm -f "$tarball"
      set_status droidbot fail "no se pudo descargar $src"
      manual "curl -fsSL -o /tmp/dist.tar.gz '${src}'"
      return
    fi
  else
    if [[ ! -f $src ]]; then
      set_status droidbot fail "--dist no apunta a un archivo existente: $src"
      return
    fi
    tarball=$src
  fi

  local sha
  sha=$(sha256sum "$tarball" | awk '{print $1}')
  local installed_sha=""
  installed_sha=$(cat "$DIST_MARKER" 2>/dev/null || true)
  if [[ $sha == "$installed_sha" && -f $WEBROOT/index.html ]]; then
    set_status droidbot ok "ya está al día (sha256 coincide)"
    [[ $src != "$tarball" ]] && rm -f "$tarball"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":true"
    return
  fi

  local stage=$WEBROOT.stage.$$
  mkdir -p "$stage"
  if ! cmd tar -xzf "$tarball" -C "$stage"; then
    rm -rf "$stage"
    set_status droidbot fail "no se pudo extraer el tar.gz"
    manual "tar -xzf ${src} -C /var/www"
    return
  fi

  # Si el tar contiene un único directorio raíz (dist/), promovelo.
  local items=() inner=""
  shopt -s nullglob
  items=("$stage"/*)
  shopt -u nullglob
  if ((${#items[@]} == 1)) && [[ -d ${items[0]} ]] && [[ ! -f $stage/index.html ]]; then
    inner=${items[0]}
    if cmd mv "$inner" "$stage.holder"; then
      cmd rmdir "$stage"
      cmd mv "$stage.holder" "$stage"
    fi
  fi

  if [[ ! -f $stage/index.html ]]; then
    rm -rf "$stage"
    set_status droidbot fail "el dist no contiene index.html en la raíz"
    manual "verificá que el tar.gz tenga index.html en la raíz (o en un único subdirectorio)"
    return
  fi

  # Swap atómico: la PWA anterior queda en /var/www/droidbot.prev.
  if [[ -e $WEBROOT.prev ]]; then
    cmd rm -rf "$WEBROOT.prev"
  fi
  if [[ -d $WEBROOT ]]; then
    cmd mv "$WEBROOT" "$WEBROOT.prev"
  fi
  if ! cmd mv "$stage" "$WEBROOT"; then
    set_status droidbot fail "no se pudo mover el stage a $WEBROOT"
    manual "mv ${stage} ${WEBROOT}"
    return
  fi
  if (( DRY )); then
    printf '[dry-run] escribir %s\n' "$DIST_MARKER"
  else
    mkdir -p "$(dirname "$DIST_MARKER")"
    printf '%s\n' "$sha" > "$DIST_MARKER"
  fi
  [[ $src != "$tarball" ]] && rm -f "$tarball"

  if [[ -f $WEBROOT/index.html && -f $WEBROOT/sw.js ]]; then
    set_status droidbot ok "PWA instalada (${sha:0:12}…) — anterior en ${WEBROOT}.prev"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  else
    set_status droidbot fail "instalación incompleta (falta index.html o sw.js)"
    manual "ls -la ${WEBROOT}"
    M_DETAIL[droidbot]="\"installed\":false,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  fi
}

check_droidbot() {
  local installed=false
  [[ -f $WEBROOT/index.html && -f $WEBROOT/sw.js ]] && installed=true
  if ! $installed; then
    set_status droidbot unknown "no hay PWA instalada en $WEBROOT"
    M_DETAIL[droidbot]="\"installed\":false,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi
  if [[ -z $ARG_DIST ]]; then
    set_status droidbot ok "PWA instalada (index.html + sw.js)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi

  local sha=""
  local tmp=""
  if [[ $ARG_DIST == http://* || $ARG_DIST == https://* ]]; then
    tmp=$(mktemp /tmp/droidbot-check.XXXXXX)
    if ! curl -fsSL --retry 2 -o "$tmp" "$ARG_DIST"; then
      rm -f "$tmp"
      set_status droidbot fail "no se pudo descargar $ARG_DIST para comparar"
      return
    fi
    sha=$(sha256sum "$tmp" | awk '{print $1}')
    rm -f "$tmp"
  elif [[ -f $ARG_DIST ]]; then
    sha=$(sha256sum "$ARG_DIST" | awk '{print $1}')
  else
    set_status droidbot fail "--dist no apunta a un archivo existente: $ARG_DIST"
    return
  fi

  local installed_sha=""
  installed_sha=$(cat "$DIST_MARKER" 2>/dev/null || true)
  if [[ $installed_sha == "$sha" ]]; then
    set_status droidbot ok "PWA instalada y al día (sha256 coincide)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":true"
  else
    set_status droidbot fail "el dist difiere del instalado (pendiente de deploy)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  fi
}

# --- Salida -----------------------------------------------------------------------
print_summary() {
  printf '\n== Resumen ==\n'
  printf '%-9s %-8s %s\n' 'MODULO' 'ESTADO' 'DETALLE'
  printf '%-9s %-8s %s\n' '--------' '--------' '--------'
  local m
  for m in "${MODULES[@]}"; do
    if [[ -n ${M_STATUS[$m]:-} ]]; then
      printf '%-9s %-8s %s\n' "$m" "${M_STATUS[$m]}" "${M_NOTE[$m]}"
    else
      printf '%-9s %-8s %s\n' "$m" "skip" "(no seleccionado)"
    fi
  done
}

overall_ok() {
  local m
  for m in "${MODULES[@]}"; do
    case ${M_STATUS[$m]:-skip} in
      ok | warn | skip) ;;
      *) return 1 ;;
    esac
  done
  return 0
}

emit_json() {
  local now m ok_status=true
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  overall_ok || ok_status=false

  local units_json=""
  local u
  for u in "${SYS_UNITS[@]}"; do
    units_json+="{\"name\":$(printf '%s' "$u" | json_escape | sed 's/^/"/;s/$/"/'),\"scope\":\"system\",\"dropin\":$(printf '%s' "/etc/systemd/system/${u}.d/${DROPIN_NAME}" | json_escape | sed 's/^/"/;s/$/"/')},"
  done
  for u in "${USER_UNITS[@]}"; do
    units_json+="{\"name\":$(printf '%s' "$u" | json_escape | sed 's/^/"/;s/$/"/'),\"scope\":\"user\",\"dropin\":$(printf '%s' "$HERMES_HOME_DIR/.config/systemd/user/${u}.d/${DROPIN_NAME}" | json_escape | sed 's/^/"/;s/$/"/')},"
  done
  units_json=${units_json%,}

  local modules_json=""
  local frag
  for m in "${MODULES[@]}"; do
    [[ -n ${M_STATUS[$m]:-} ]] || continue
    frag=${M_DETAIL[$m]:-}
    if [[ -n $frag ]]; then
      modules_json+="\"$m\":{\"status\":\"${M_STATUS[$m]}\",${frag}},"
    else
      modules_json+="\"$m\":{\"status\":\"${M_STATUS[$m]}\"},"
    fi
  done
  modules_json=${modules_json%,}

  cat <<EOF
{
  "schema": ${SCHEMA},
  "version": "$(printf '%s' "$VERSION" | json_escape)",
  "mode": "$([ "$CHECK" -eq 1 ] && echo check || echo apply)",
  "ok": ${ok_status},
  "generated_at": "${now}",
  "host": {
    "distro": "$(printf '%s' "$DISTRO_ID" | json_escape)",
    "version_id": "$(printf '%s' "$DISTRO_VERSION_ID" | json_escape)",
    "codename": "$(printf '%s' "$DISTRO_CODENAME" | json_escape)",
    "systemd": ${SYSTEMD_AVAILABLE:-0},
    "caddy_binary": "$(printf '%s' "${CADDY_BIN:-}" | json_escape)",
    "caddy_version": "$(printf '%s' "${CADDY_VERSION:-}" | json_escape)"
  },
  "hermes": {
    "user": "$(printf '%s' "$HERMES_USER" | json_escape)",
    "home_dir": "$(printf '%s' "$HERMES_HOME_DIR" | json_escape)",
    "hermes_home": "$(printf '%s' "$HERMES_HOME" | json_escape)",
    "units": [${units_json}]
  },
  "modules": {
    ${modules_json}
  }
}
EOF
}

usage() {
  cat <<EOF
Uso: prepare.sh [flags] [modulo...]

Módulos: browser computer takeover caddy droidbot  (o --all)

Flags:
  --check                Solo diagnóstico (no cambia nada). Exit 0 = todo OK, 1 = problemas.
  --json                 Emite el diagnóstico como JSON (requiere --check).
  --all                  Aplica todos los módulos.
  --dry-run              Imprime los comandos que ejecutaría, sin ejecutarlos.
  --hermes-user <user>   Usuario dueño de ~/.hermes (default: autodetección, fallback 'hermes').
  --domain <host>        Dominio público (bloques site de Caddy + verificaciones).
  --dist <ruta|url>      Tar.gz de la PWA para el módulo droidbot.
  -h, --help             Esta ayuda.

Ejemplos:
  prepare.sh --all --domain droidbot.gabrielurrutia.com.ar --dist ./dist.tar.gz
  prepare.sh --check --json
  prepare.sh --check browser computer
EOF
}

# --- Main ------------------------------------------------------------------------
main() {
  local opts
  opts=$(getopt -o h -l check,json,all,dry-run,hermes-user:,domain:,dist:,help -- "$@") \
    || { usage; exit 2; }
  eval set -- "$opts"

  while (($# > 0)); do
    case "$1" in
      --check) CHECK=1; shift ;;
      --json) JSON_OUT=1; shift ;;
      --all) ALL=1; shift ;;
      --dry-run) DRY=1; shift ;;
      --hermes-user) ARG_HERMES_USER=$2; shift 2 ;;
      --domain) ARG_DOMAIN=$2; shift 2 ;;
      --dist) ARG_DIST=$2; shift 2 ;;
      -h | --help) usage; exit 0 ;;
      --) shift; break ;;
    esac
  done

  if [[ $EUID -ne 0 ]]; then
    die 2 "este script debe correr como root (usa sudo)"
  fi

  SYSTEMD_AVAILABLE=0
  if command -v systemctl >/dev/null 2>&1; then
    SYSTEMD_AVAILABLE=1
  fi
  (( CHECK || SYSTEMD_AVAILABLE )) || die 2 "se requiere systemd (este script administra unidades systemd)"

  [[ $JSON_OUT -eq 1 && $CHECK -eq 0 ]] && die 2 "--json requiere --check"

  local requested=() m
  if (( ALL )); then
    requested=("${MODULES[@]}")
  else
    for m in "$@"; do
      local known=0 mod
      for mod in "${MODULES[@]}"; do
        [[ $m == "$mod" ]] && known=1
      done
      (( known )) || die 2 "módulo desconocido: $m (válidos: ${MODULES[*]})"
      requested+=("$m")
    done
    if (( CHECK )); then
      ((${#requested[@]} > 0)) || requested=("${MODULES[@]}")
    else
      ((${#requested[@]} > 0)) || { usage; die 2 "indicá módulos o --all"; }
    fi
  fi

  detect_distro
  set_browser_packages
  resolve_hermes_user
  find_chrome || true
  find_cua_driver || true
  detect_hermes_units
  find_caddy

  local needs_domain=0
  for m in "${requested[@]}"; do
    case "$m" in
      takeover | caddy) needs_domain=1 ;;
    esac
  done
  if (( needs_domain )); then
    if ! resolve_domain; then
      die 2 "no se pudo determinar el dominio: pasá --domain <host>"
    fi
    info "dominio: ${DOMAIN}"
  fi

  if (( CHECK )); then
    info "modo diagnóstico (--check): no se modifica nada"
  elif (( DRY )); then
    info "modo ensayo (--dry-run): no se ejecuta nada"
  fi

  for m in "${requested[@]}"; do
    info "── módulo: ${m} ──"
    case "$m" in
      browser) mod_browser ;;
      computer) mod_computer ;;
      takeover) mod_takeover ;;
      caddy) mod_caddy ;;
      droidbot) mod_droidbot ;;
    esac
  done

  if (( JSON_OUT )); then
    emit_json
  else
    print_summary
  fi

  if overall_ok; then
    exit 0
  fi
  exit 1
}

main "$@"
