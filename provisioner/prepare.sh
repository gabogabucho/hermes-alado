#!/usr/bin/env bash
#
# prepare.sh — Hermes DroidBot provisioner (phase 7b/7c)
#
# Prepares an Ubuntu/Debian VPS so the DroidBot PWA can talk to Hermes:
#   browser    system libraries for Hermes' bundled Chromium (verified headless)
#   botdesktop packages for Hermes' official Bot Desktop (one Xfce desktop per
#              profile, Xvnc on a private unix socket) + cleanup of the v1
#              computer/takeover artifacts (Xvfb/x11vnc/noVNC units and routes)
#   access     HTTPS without your own domain: --domain, --access sslip
#              (<public-ip>.sslip.io through Caddy) or --access tailscale
#   caddy      PWA cache headers via a marked block inside the domain site
#   droidbot   atomic PWA install/update in /var/www/droidbot
#   push       droidbot-push Hermes plugin (web push to the phone): copy
#              hermes-plugin/droidbot_push to ~/.hermes/plugins/, install its
#              pywebpush dependency into Hermes' Python, enable it as the hermes
#              user and print the restart command (never restarts Hermes)
#   companion  alado-companion skill for every bot profile: copy
#              skills/alado-companion to ~/.hermes/alado-skills/, MERGE that dir
#              into each profile's skills.external_dirs (`hermes -p <p> config
#              get/set`, never dropping existing entries), set the top-level
#              platform_hints.tui.replace config per profile
#              (`hermes -p <p> config set --force`, never under agent:) and
#              remove the legacy marked alado block from each profile's SOUL.md
#              (cleanup only, never re-added) so bots know they are talked to
#              from Alado and stop pointing users at Hermes Desktop menus that
#              don't exist
#
# Idempotent: re-running changes nothing that is already correct.
# Diagnostics: --check (read-only, exit 0/1) and --check --json.
# Rehearsal:   --dry-run prints the commands without running them.
#
# Hermes source of truth: .hermes-ref checkout pinned to bf0203a.
# Relevant contract:
#   - Bot Desktop packages/bins: tools/bot_desktop/runtime.py
#     (PACKAGES["apt"] / BINARY_PACKAGES / REQUIRED_BINARIES)
#   - one desktop per profile, started by Hermes itself via display.start
#     (tui_gateway/methods_display.py); RFB over WS at /api/display/ws
#     (hermes_cli/web_routers/display.py)
#   - dashboard.public_url = trusted public host + engages the auth gate when
#     non-loopback; snapshot at server start (hermes_cli/web_server_boundary.py,
#     hermes_cli/web_server.py _configure_auth_gate) — set with
#     `hermes config set dashboard.public_url <url>`, never by editing files
#   - Hermes runs as systemd USER units (hermes-serve.service,
#     hermes-gateway.service) under the hermes user
#   - GET /api/auth/me → 401 without a session (hermes_cli/dashboard_auth/routes.py)
#   - Chromium in ~/.hermes/tools/chromium-*/chrome-linux{64}/chrome
#     (pm/paths.py, pm/packages.py)
#   - `hermes plugins enable <name>` writes plugins.enabled and syncs the PM
#     environment; plugins are opt-in, only 'enabled' plugins load
#     (hermes_cli/plugins_cmd.py cmd_enable, pm/plugin_declarations.py —
#     python_dependencies accepts version specifiers like "pywebpush>=2,<3")
#   - Hermes' PM-managed Python: ~/.hermes/tools/python-*/bin/python (pm/packages.py
#     Python.binary_rel) — the interpreter serve/gateway run with
#   - plugin dashboard routes mount at /api/plugins/<name>/... with the dashboard
#     session auth inherited; unauthenticated GETs get 401
#   - skills.external_dirs: per-profile config list of extra skill dirs; default
#     profile config at ~/.hermes/config.yaml, others at
#     ~/.hermes/profiles/<name>/config.yaml — managed only via
#     `hermes -p <profile> config get/set` (phase 7c brief, verified live)
#   - platform_hints.tui.replace: TOP-LEVEL per-profile config key whose value is
#     the text injected into the TUI platform hint (never under agent:); written
#     only via `hermes -p <profile> config set --force platform_hints.tui.replace
#     <text>` as the hermes user (architect, verified live on the VPS)
#   - profile SOUL.md: ~/.hermes/SOUL.md (default),
#     ~/.hermes/profiles/<name>/SOUL.md (others) — the legacy marked alado block
#     is removed only (cleanup), never added again

set -euo pipefail

VERSION="2.3.0"
SCHEMA=2

# --- Constants ------------------------------------------------------------------
HERMES_PORT=9119
WEBROOT="/var/www/droidbot"
DIST_MARKER="/var/lib/droidbot/dist.sha256"
CADDYFILE="/etc/caddy/Caddyfile"
# Loopback-only catch-all port Caddy serves for the tailscale route (kept off :80/:443
# so the public domain sites are untouched).
ACCESS_CADDY_PORT=8081
DISPLAY_ENV_FILE="/etc/hermes/droidbot-display.env"
VNC_PASS_FILE="/etc/hermes/droidbot-vnc.passwd"
DISPLAY_UNIT="droidbot-display.service"
VNC_UNIT="droidbot-vnc.service"
NOVNC_UNIT="droidbot-novnc.service"
DROPIN_NAME="droidbot-display.conf"
# These marker strings are kept VERBATIM from v1 (Spanish): the real VPS Caddyfile
# already contains v1-written blocks with these markers, and the cleanup/cache upsert
# must recognize them. New v2 markers (access sites) are English.
CADDY_CACHE_BEGIN="# BEGIN droidbot-preparer:cache (gestionado — no editar)"
CADDY_CACHE_END="# END droidbot-preparer:cache"
CADDY_DESKTOP_BEGIN="# BEGIN droidbot-preparer:desktop (gestionado — no editar)"
CADDY_DESKTOP_END="# END droidbot-preparer:desktop"
ACCESS_SITE_BEGIN_RE="^# BEGIN droidbot-preparer:site "
ACCESS_SITE_END_RE="^# END droidbot-preparer:site "
TAILSCALE_SITE_BEGIN="# BEGIN droidbot-preparer:tailscale-site (managed — do not edit)"
TAILSCALE_SITE_BEGIN_RE="^# BEGIN droidbot-preparer:tailscale-site"
TAILSCALE_SITE_END_RE="^# END droidbot-preparer:tailscale-site"
# Push plugin (backlog: Preparer: push module).
PLUGIN_NAME="droidbot-push"        # manifest name: `hermes plugins enable` id
PLUGIN_FOLDER="droidbot_push"      # folder name inside ~/.hermes/plugins/
PLUGIN_DEP="pywebpush>=2,<3"       # pinned in plugin.yaml python_dependencies
PUSH_ROUTE="/api/plugins/${PLUGIN_NAME}/vapid-public-key"
# Alado companion skill (phase 7c): teach every bot it lives in Alado (phone PWA),
# not Hermes Desktop — stop "go to Hermes Desktop → Bots → Screen" answers.
ALADO_SKILL_DIR_NAME="alado-companion"      # skill folder (source and installed)
# The tilde form is intentional: it is the literal config entry Hermes expands
# for the hermes user (~/.hermes/alado-skills).
# shellcheck disable=SC2088
ALADO_SKILLS_ENTRY="~/.hermes/alado-skills"
ALADO_CONFIG_KEY="skills.external_dirs"
ALADO_HINT_FILE="platform-hint.txt"          # one-line text inside the skill dir
PLATFORM_HINT_KEY="platform_hints.tui.replace" # TOP-LEVEL key (never under agent:)
# Legacy marked block in profile SOUL.md (phase 7c v1): removed only, never re-added.
SOUL_BLOCK_BEGIN="<!-- alado:begin -->"
SOUL_BLOCK_END="<!-- alado:end -->"

# Directory of this script (empty when piped from stdin, e.g. curl | bash -s):
# used only for the default --plugin-src.
SCRIPT_DIR=""
if [[ -n ${BASH_SOURCE[0]:-} && ${BASH_SOURCE[0]} != "bash" && ${BASH_SOURCE[0]} != "-" ]]; then
  SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fi

# --- Global state ---------------------------------------------------------------
CHECK=0
JSON_OUT=0
ALL=0
DRY=0
ARG_HERMES_USER=""
ARG_DOMAIN=""
ARG_DIST=""
ARG_ACCESS=""
ARG_PLUGIN_SRC=""
ARG_SKILLS_SRC=""
MODULES=("browser" "botdesktop" "access" "caddy" "droidbot" "push" "companion")
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
ACCESS_MODE=""          # domain | sslip | tailscale
ACCESS_HOST=""          # <ip-with-dashes>.sslip.io (mode=sslip)
PUBLIC_IP=""
TAILSCALE_BIN=""
TAILSCALE_DNS=""
CADDY_BIN=""
CADDY_VERSION=""
PLUGIN_SRC=""
HERMES_PYTHON=""
SKILLS_SRC=""
ALADO_SKILLS_DIR=""
PROFILES=()
LIST_ENTRIES=()
MISSING_DIRS=()
HINT_MISSING=()
SOUL_LEFTOVER=()
COMP_PROFILES_JSON=""
P_NAME=""
P_SOUL=""
P_DIRS_STATE=""
P_HINT_STATE=""
P_SOUL_STATE=""

# --- Logging ---------------------------------------------------------------------
info() { printf '[info] %s\n' "$*" >&2; }
warn() { printf '[warn] %s\n' "$*" >&2; }
err()  { printf '[error] %s\n' "$*" >&2; }

die() { # die <exit> <msg>
  local code=$1
  shift
  err "$*"
  exit "$code"
}

# Prints exact manual recovery commands.
manual() {
  local line
  for line in "$@"; do
    printf '[manual] %s\n' "$line" >&2
  done
}

# Runs the command, or prints it in --dry-run mode.
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

# As the Hermes user (the script always runs as root). Mutating commands go through
# run_hermes so --dry-run prints them; read-only probes use runuser directly below.
run_hermes() {
  cmd runuser -u "$HERMES_USER" -- "$@"
}

hermes_cmd() { # read-only: runs as the hermes user even in --dry-run (never mutates)
  runuser -u "$HERMES_USER" -- "$@"
}

set_status() { # set_status <module> <status> <note>
  M_STATUS[$1]=$2
  M_NOTE[$1]=$3
}

json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r\t'
}

# --- Environment detection --------------------------------------------------------
detect_distro() {
  [[ -r /etc/os-release ]] || die 2 "could not read /etc/os-release"
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO_ID=${ID:-unknown}
  DISTRO_VERSION_ID=${VERSION_ID:-}
  DISTRO_CODENAME=${VERSION_CODENAME:-}
  case "$DISTRO_ID" in
    ubuntu | debian) ;;
    *) die 2 "unsupported distro: ${DISTRO_ID}. This script only supports Debian/Ubuntu." ;;
  esac
  info "detected distro: ${DISTRO_ID} ${DISTRO_VERSION_ID} (${DISTRO_CODENAME})"
}

# System libraries for Hermes' bundled Chromium, derived from
# `playwright install-deps chromium` (packages/playwright-core/src/server/registry/nativeDeps.ts):
#  - Ubuntu 24.04+ and Debian 13+ use the t64 package names (includes libasound2t64,
#    the library that was actually missing in the real VPS incident).
#  - Ubuntu 22.04 / Debian 12 use the historical names.
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

# Packages for Hermes' official Bot Desktop, taken VERBATIM from
# tools/bot_desktop/runtime.py PACKAGES["apt"] (the list runtime.install_command() runs)
# plus nothing else: cua-driver has no additional apt prerequisites on Debian/Ubuntu
# (it drives the X display Hermes publishes per profile via desktop_env).
set_botdesktop_packages() {
  BOTDESKTOP_PKGS=(tigervnc-standalone-server xfce4-panel xfwm4 xfdesktop4
    xfce4-settings xfce4-terminal dbus-x11 x11-xserver-utils x11-utils x11-xkb-utils
    xauth fonts-dejavu-core)
  # runtime.py REQUIRED_BINARIES — the launcher execs these.
  BOTDESKTOP_BINARIES=(Xvnc xfwm4 xfce4-panel xfdesktop xfsettingsd dbus-run-session
    xauth xdpyinfo setxkbmap xprop)
}

resolve_hermes_user() {
  if [[ -n $ARG_HERMES_USER ]]; then
    getent passwd "$ARG_HERMES_USER" >/dev/null || die 2 "no such user: $ARG_HERMES_USER"
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
      info "Hermes user auto-detected via ~/.hermes: ${HERMES_USER}"
    else
      getent passwd hermes >/dev/null \
        || die 2 "could not auto-detect the owner of ~/.hermes (${#found[@]} candidates) and user 'hermes' does not exist. Pass --hermes-user <user>."
      HERMES_USER=hermes
      warn "ambiguous auto-detection (${#found[@]} ~/.hermes candidates); using 'hermes'"
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

# --- Caddy helpers -----------------------------------------------------------------
find_caddy() {
  CADDY_BIN=$(command -v caddy 2>/dev/null || true)
  CADDY_VERSION=""
  if [[ -n $CADDY_BIN ]]; then
    CADDY_VERSION=$(caddy version 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
  fi
}

# Line of the site block of <domain> in the Caddyfile (0 when not found).
find_site_open_line() {
  awk -v d="$DOMAIN" '
    index($0, "{") > 0 && $0 !~ /^[[:space:]]*#/ && index($0, d) > 0 && index($0, d) < index($0, "{") {
      print NR
      exit
    }
  ' "$1" 2>/dev/null || true
}

# Inserts <blockfile> after line <line> of <file>.
insert_block_after_line() {
  local file=$1 line=$2 blockfile=$3
  if (( DRY )); then
    printf '[dry-run] insert block (%s) after line %s in %s\n' "$blockfile" "$line" "$file"
    return 0
  fi
  local tmp=$file.droidbot.tmp.$$
  awk -v blk="$blockfile" -v at="$line" '
    { print }
    NR == at { while ((getline x < blk) > 0) print x; close(blk) }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Removes from the Caddyfile the block between <begin> and <end> (literal index match).
# Exit 0 = the block was present.
strip_marked_block() {
  local file=$1 begin=$2 end=$3
  if ! grep -qF "$begin" "$file" 2>/dev/null; then
    return 1
  fi
  if (( DRY )); then
    printf '[dry-run] replace marked block (%s) in %s\n' "$begin" "$file"
    return 0
  fi
  local tmp=$file.droidbot.tmp.$$
  # index() (literal match), not regex: the v1 markers contain parentheses.
  awk -v b="$begin" -v e="$end" '
    index($0, b) > 0 { skip = 1; next }
    index($0, e) > 0 { skip = 0; next }
    !skip { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
  return 0
}

# Same as strip_marked_block but with anchored regexes (for the access site markers,
# which embed the hostname). The markers are generated at column 0 by this script.
strip_marked_block_re() {
  local file=$1 begin_re=$2 end_re=$3
  if ! grep -qE "$begin_re" "$file" 2>/dev/null; then
    return 1
  fi
  if (( DRY )); then
    printf '[dry-run] replace marked block (%s) in %s\n' "$begin_re" "$file"
    return 0
  fi
  local tmp=$file.droidbot.tmp.$$
  awk -v b="$begin_re" -v e="$end_re" '
    $0 ~ b { skip = 1; next }
    $0 ~ e { skip = 0; next }
    !skip { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
  return 0
}

# Guarantees the marked block exists inside the domain's site, with exact content.
# Never mutates in --check mode (guard; it is not called there anyway).
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

# Replaces the whole marked site block (access/tailscale) with the rendered block:
# strip every block with the markers, then append the fresh one at the end of the file.
# This also sweeps stale access sites left over by a changed public IP.
replace_whole_site_block() {
  local begin_re=$1 end_re=$2 blockfile=$3
  [[ -f $CADDYFILE ]] || return 1
  (( CHECK )) && return 1
  strip_marked_block_re "$CADDYFILE" "$begin_re" "$end_re" || true
  if (( DRY )); then
    printf '[dry-run] append site block (%s) to %s\n' "$blockfile" "$CADDYFILE"
    return 0
  fi
  { printf '\n'; cat "$blockfile"; } >> "$CADDYFILE"
  return 0
}

caddy_backup() { # backups the Caddyfile before an edit
  if (( DRY )); then
    printf '[dry-run] backup: cp -a %s %s.bak.droidbot\n' "$CADDYFILE" "$CADDYFILE"
    return 0
  fi
  cp -a "$CADDYFILE" "$CADDYFILE.bak.droidbot.$(date +%s)"
  info "Caddyfile backed up to ${CADDYFILE}.bak.droidbot.*"
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
    if systemctl reload caddy 2>/dev/null; then
      info "caddy reloaded (systemctl reload caddy)"
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

# --- Access helpers ---------------------------------------------------------------
clean_host() { # strips scheme/path/port off a host argument
  local h=$1
  h=${h#https://}
  h=${h#http://}
  h=${h%%/*}
  h=${h%%:*}
  printf '%s' "$h"
}

# Auto-detect the public domain: exactly one top-level site block in the Caddyfile.
resolve_domain_auto() {
  DOMAIN=""
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

# Public IPv4 via api.ipify.org, with fallbacks. Read-only (network probe).
resolve_public_ip() {
  PUBLIC_IP=""
  if (( DRY && !CHECK )); then
    cmd curl -fsS --max-time 10 https://api.ipify.org
    return 0
  fi
  local out=""
  out=$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)
  [[ -z $out ]] && out=$(curl -fsS --max-time 10 https://ifconfig.me 2>/dev/null || true)
  [[ -z $out ]] && out=$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null || true)
  if [[ $out =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    PUBLIC_IP=$out
  fi
}

# Resolves the access mode and the effective DOMAIN. $1 = 1 when the access module
# was requested (or --all); otherwise the mode is forced to "domain" and only the
# Caddy-relevant DOMAIN resolution runs (no prompt, no public-IP lookup).
#   --domain <host>   → mode=domain, DOMAIN=<host>          (current behaviour)
#   --access <m>      → mode=<m>
#   (no flags, TTY)   → interactive prompt (sslip | tailscale, default sslip)
#   (no flags, no TTY)→ mode=sslip (default)
#   mode=sslip        → DOMAIN=<public-ip-with-dashes>.sslip.io
#   mode=tailscale    → DOMAIN=auto-detected Caddy site (may be empty; the caddy
#                       module then verifies the tailscale site instead)
resolve_access() {
  local needed=$1

  if [[ -n $ARG_DOMAIN ]]; then
    [[ -n $ARG_ACCESS ]] && warn "--domain given: --access ${ARG_ACCESS} ignored (domain mode)"
    ACCESS_MODE=domain
    DOMAIN=$(clean_host "$ARG_DOMAIN")
    return 0
  fi
  if (( !needed )); then
    ACCESS_MODE=domain
    resolve_domain_auto || DOMAIN=""
    return 0
  fi
  if [[ -n $ARG_ACCESS ]]; then
    ACCESS_MODE=$ARG_ACCESS
  elif [[ -t 0 ]] && (( !JSON_OUT )); then
    local ans
    printf '[info] Access method [sslip/tailscale] (default sslip): ' >&2
    read -r ans || ans=""
    case "$ans" in
      tailscale) ACCESS_MODE=tailscale ;;
      "" | sslip) ACCESS_MODE=sslip ;;
      *)
        warn "unknown access method '${ans}'; using sslip"
        ACCESS_MODE=sslip
        ;;
    esac
  else
    ACCESS_MODE=sslip
  fi

  if [[ $ACCESS_MODE == sslip ]]; then
    resolve_public_ip
    if (( DRY && !CHECK )) && [[ -z $PUBLIC_IP ]]; then
      PUBLIC_IP="<public-ip>" # rehearsal placeholder
    fi
    if [[ -n $PUBLIC_IP ]]; then
      ACCESS_HOST="${PUBLIC_IP//./-}.sslip.io"
      DOMAIN=$ACCESS_HOST
      info "public IPv4: ${PUBLIC_IP} → access host ${ACCESS_HOST}"
    else
      warn "could not detect the public IPv4 address (api.ipify.org and fallbacks failed)"
      ACCESS_HOST=""
      DOMAIN=""
    fi
  else
    resolve_domain_auto || DOMAIN=""
  fi
  return 0
}

hermes_cli_exists() { # `command` is a shell builtin: runuser needs a shell to run it
  hermes_cmd sh -c 'command -v hermes' >/dev/null 2>&1
}

# Read-only: prints the resolved config value ("" when unset/absent).
hermes_config_get() {
  local key=$1 out=""
  if ! hermes_cli_exists; then
    return 0
  fi
  out=$(hermes_cmd hermes config get "$key" 2>/dev/null || true)
  [[ $out == *"not set"* ]] && out=""
  printf '%s' "$out"
}

# True when some dashboard auth provider is configured: basic_auth (username +
# password or password_hash) or the Nous OAuth provider (client_id). Without one,
# `hermes serve` FAILS CLOSED on the next restart once a public host is declared
# (hermes_cli/web_server.py _configure_auth_gate).
check_auth_configured() {
  local u="" p="" o=""
  u=$(hermes_config_get dashboard.basic_auth.username)
  [[ -n $(hermes_config_get dashboard.basic_auth.password) ]] && p=1
  [[ -n $(hermes_config_get dashboard.basic_auth.password_hash) ]] && p=1
  [[ -n $(hermes_config_get dashboard.oauth.client_id) ]] && o=1
  [[ -n $u && -n $p ]] || [[ -n $o ]]
}

hermes_get_public_url() {
  hermes_config_get dashboard.public_url
}

# Ensures dashboard.public_url == https://<DOMAIN> via `hermes config set` as the
# hermes user (never by hand-editing config.yaml). Returns 0 when set/already set.
set_public_url() {
  local url="https://$DOMAIN"
  if ! hermes_cli_exists; then
    warn "no 'hermes' CLI on PATH for user ${HERMES_USER}; set dashboard.public_url manually:"
    manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.public_url ${url}"
    return 1
  fi
  local current
  current=$(hermes_get_public_url)
  if [[ $current == "$url" ]]; then
    info "dashboard.public_url already ${url}"
    return 0
  fi
  if (( DRY )); then
    run_hermes hermes config set dashboard.public_url "$url"
    return 0
  fi
  if run_hermes hermes config set dashboard.public_url "$url" >/dev/null 2>&1; then
    info "hermes config set dashboard.public_url ${url} (as ${HERMES_USER})"
    return 0
  fi
  warn "hermes config set dashboard.public_url ${url} failed"
  manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.public_url ${url}"
  return 1
}

# Prints the exact restart command(s) for the detected Hermes units. The public_url
# and the legacy DISPLAY drop-ins are snapshots read at process start, so a restart
# is required for changes to take effect.
hermes_restart_hint() {
  local uid
  if ((${#SYS_UNITS[@]} > 0)); then
    manual "systemctl restart ${SYS_UNITS[*]}"
  fi
  if ((${#USER_UNITS[@]} > 0)); then
    uid=$(id -u "$HERMES_USER" 2>/dev/null || true)
    [[ -z $uid ]] && uid="<uid>"
    manual "runuser -u ${HERMES_USER} -- env XDG_RUNTIME_DIR=/run/user/${uid} systemctl --user restart ${USER_UNITS[*]}"
  fi
  if ((${#SYS_UNITS[@]} + ${#USER_UNITS[@]} == 0)); then
    manual "restart hermes serve/gateway however they run (no systemd units detected)"
  fi
}

print_phone_banner() {
  local url=$1
  printf '\n'
  printf '%s\n' '============================================================'
  printf '%s\n' '  Open this on your phone:'
  printf '      %s\n' "$url"
  printf '%s\n' '============================================================'
  printf '\n'
}

# True when the Caddyfile carries the generated site block for the current sslip host.
access_site_present() {
  [[ -f $CADDYFILE ]] && [[ -n $ACCESS_HOST ]] \
    && grep -qF "# BEGIN droidbot-preparer:site ${ACCESS_HOST} " "$CADDYFILE"
}

# --- Caddy templates ---------------------------------------------------------------
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

# Full site block for the sslip.io host: cache headers inline, /api/* /auth/* /login*
# proxied to Hermes (WebSockets included — Caddy upgrades reverse_proxy automatically,
# which is how /api/display/ws reaches the Bot Desktop viewer), PWA root from the webroot.
render_access_site_block() {
  cat <<EOF
# BEGIN droidbot-preparer:site ${DOMAIN} (managed — do not edit)
${DOMAIN} {
	encode zstd gzip
	@pwa-nocache {
		path /sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js
	}
	header @pwa-nocache Cache-Control "no-cache, no-store, must-revalidate"
	@assets-immutable {
		path /assets/*
	}
	header @assets-immutable Cache-Control "public, max-age=31536000, immutable"
	handle /api/* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle /auth/* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle /login* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle {
		root * ${WEBROOT}
		try_files {path} /index.html
		file_server
	}
}
# END droidbot-preparer:site ${DOMAIN}
EOF
}

# Loopback-only catch-all site for the tailscale route (Host-independent, so the
# ts.net hostname matches regardless of the public domain sites).
render_tailscale_site_block() {
  cat <<EOF
# BEGIN droidbot-preparer:tailscale-site (managed — do not edit)
http://127.0.0.1:${ACCESS_CADDY_PORT} {
	encode zstd gzip
	@pwa-nocache {
		path /sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js
	}
	header @pwa-nocache Cache-Control "no-cache, no-store, must-revalidate"
	@assets-immutable {
		path /assets/*
	}
	header @assets-immutable Cache-Control "public, max-age=31536000, immutable"
	handle /api/* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle /auth/* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle /login* {
		reverse_proxy 127.0.0.1:${HERMES_PORT}
	}
	handle {
		root * ${WEBROOT}
		try_files {path} /index.html
		file_server
	}
}
# END droidbot-preparer:tailscale-site
EOF
}

# --- Modules ------------------------------------------------------------------------
mod_browser() {
  local missing=() p
  for p in "${BROWSER_PKGS[@]}"; do
    pkg_installed "$p" || missing+=("$p")
  done
  if ((${#missing[@]} > 0)) && (( !CHECK )); then
    info "browser: ${#missing[@]} packages missing; installing"
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
    set_status browser fail "${#missing[@]} system packages missing"
    manual "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${missing[*]}"
    M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[${miss}],\"ldd_not_found\":null,\"dump_dom\":null"
    return
  fi

  if [[ -z $CHROME ]]; then
    set_status browser warn "libraries OK but no Chromium in ~/.hermes/tools"
    manual "runuser -u ${HERMES_USER} -- hermes tools post-setup agent_browser"
    M_DETAIL[browser]="\"chrome\":null,\"missing_packages\":[],\"ldd_not_found\":null,\"dump_dom\":null"
    return
  fi

  local ldd_missing
  ldd_missing=$(ldd "$CHROME" 2>/dev/null | grep -c 'not found' || true)
  ldd_missing=${ldd_missing:-0}

  # Verification runs the EXACT command the architect confirmed working on the VPS:
  #   sudo -u hermes <chrome> --headless=new --no-sandbox --disable-gpu \
  #       --dump-dom "data:text/html,<p>ok</p>"
  # v1 failed here for three reasons, all fixed now:
  #   1. `chrome | grep -q` under `set -o pipefail`: grep exits on its first match,
  #      Chrome keeps writing and dies with SIGPIPE (141), flipping the check.
  #      → output is captured and inspected in memory, no pipeline race.
  #   2. A fresh `--user-data-dir` in /tmp runs first-run initialization; on the slow
  #      VPS this exceeded the 60s `timeout`. The known-good invocation uses the
  #      default profile dir (HOME is set), and the timeout is now 120s.
  #   3. Extra flags (`--disable-dev-shm-usage`) deviated from the proven command.
  local dump_ok=false
  local dump_err=""
  local errfile
  errfile=$(mktemp /tmp/droidbot-chrome-err.XXXXXX)
  if (( DRY && !CHECK )); then
    cmd timeout 120 runuser -u "$HERMES_USER" -- env HOME="$HERMES_HOME_DIR" "$CHROME" \
      --headless=new --no-sandbox --disable-gpu --dump-dom "data:text/html,<p>ok</p>"
    dump_ok=true
  else
    local dump_out=""
    local dump_rc=0
    dump_out=$(timeout 120 runuser -u "$HERMES_USER" -- env HOME="$HERMES_HOME_DIR" "$CHROME" \
      --headless=new --no-sandbox --disable-gpu --dump-dom "data:text/html,<p>ok</p>" 2>"$errfile") || dump_rc=$?
    if [[ $dump_rc -eq 0 && $dump_out == *"<p>ok</p>"* ]]; then
      dump_ok=true
    fi
    if ! $dump_ok; then
      dump_err=$(tr -d '\n\r\t' < "$errfile" 2>/dev/null | head -c 300 || true)
    fi
  fi
  rm -f "$errfile"

  if [[ $ldd_missing -gt 0 || $dump_ok == false ]]; then
    set_status browser fail "ldd reports ${ldd_missing} missing libraries and/or --dump-dom failed"
    manual "ldd ${CHROME} | grep 'not found'"
    manual "runuser -u ${HERMES_USER} -- env HOME=${HERMES_HOME_DIR} ${CHROME} --headless=new --no-sandbox --disable-gpu --dump-dom \"data:text/html,<p>ok</p>\""
    M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[],\"ldd_not_found\":${ldd_missing},\"dump_dom\":\"fail\",\"dump_dom_err\":$(printf '%s' "${dump_err:-}" | json_escape | sed 's/^/"/;s/$/"/')"
    return
  fi
  set_status browser ok "Chromium OK: ldd has no 'not found' and --dump-dom works"
  M_DETAIL[browser]="\"chrome\":$(printf '%s' "$CHROME" | json_escape | sed 's/^/"/;s/$/"/'),\"missing_packages\":[],\"ldd_not_found\":0,\"dump_dom\":\"ok\""
}

# Removes everything the v1 computer/takeover modules created. Idempotent; prints
# what was found/removed and the restart command for the Hermes units.
# In --check mode nothing is touched: artifacts are reported as pending cleanup.
cleanup_legacy() {
  local removed=0
  local u f verb

  if (( CHECK )); then verb="found (pending cleanup)"; else verb="removed"; fi

  for u in "$DISPLAY_UNIT" "$VNC_UNIT" "$NOVNC_UNIT"; do
    if [[ -f /etc/systemd/system/$u ]] || [[ -L /etc/systemd/system/$u ]]; then
      if (( !CHECK )); then
        cmd systemctl stop "$u" || true
        cmd systemctl disable "$u" || true
        cmd rm -f "/etc/systemd/system/$u"
        cmd rm -f "/etc/systemd/system/multi-user.target.wants/$u"
        cmd systemctl reset-failed "$u" || true
      fi
      info "legacy: unit $u ${verb}"
      removed=$((removed + 1))
    fi
  done

  for f in "$DISPLAY_ENV_FILE" "$VNC_PASS_FILE"; do
    if [[ -e $f ]]; then
      (( !CHECK )) && cmd rm -f "$f"
      info "legacy: file $f ${verb}"
      removed=$((removed + 1))
    fi
  done
  if [[ -d /etc/hermes ]] && (( !CHECK )); then
    cmd rmdir /etc/hermes 2>/dev/null || true
  fi

  if [[ -e $XAUTH ]]; then
    (( !CHECK )) && cmd rm -f "$XAUTH"
    info "legacy: X11 cookie $XAUTH ${verb}"
    removed=$((removed + 1))
  fi

  # DISPLAY drop-ins on the detected Hermes units (system + user scope).
  local dropin dropin_dir unit
  for unit in "${SYS_UNITS[@]}"; do
    dropin="/etc/systemd/system/${unit}.d/${DROPIN_NAME}"
    if [[ -f $dropin ]]; then
      (( !CHECK )) && cmd rm -f "$dropin"
      (( !CHECK )) && cmd rmdir "/etc/systemd/system/${unit}.d" 2>/dev/null || true
      info "legacy: drop-in $dropin ${verb}"
      removed=$((removed + 1))
    fi
  done
  for unit in "${USER_UNITS[@]}"; do
    dropin_dir="$HERMES_HOME_DIR/.config/systemd/user/${unit}.d"
    dropin="$dropin_dir/${DROPIN_NAME}"
    if [[ -f $dropin ]]; then
      (( !CHECK )) && cmd rm -f "$dropin"
      (( !CHECK )) && cmd rmdir "$dropin_dir" 2>/dev/null || true
      info "legacy: drop-in $dropin ${verb}"
      removed=$((removed + 1))
    fi
  done

  # Marked /desktop/* route in the Caddyfile (v1 takeover).
  if [[ -f $CADDYFILE ]] && grep -qF "$CADDY_DESKTOP_BEGIN" "$CADDYFILE"; then
    if (( !CHECK )); then
      strip_marked_block "$CADDYFILE" "$CADDY_DESKTOP_BEGIN" "$CADDY_DESKTOP_END"
      caddy_backup
      caddy_validate_and_reload || true
    fi
    info "legacy: marked /desktop/* route in ${CADDYFILE} ${verb}"
    removed=$((removed + 1))
  fi

  if (( removed > 0 )) && (( !CHECK )); then
    cmd systemctl daemon-reload
    if ((${#USER_UNITS[@]} > 0)); then
      # shellcheck disable=SC2016 # $(id -u) expands in the user-side bash, not here
      cmd runuser -u "$HERMES_USER" -- bash -c 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user daemon-reload' || true
    fi
  fi

  LEGACY_REMOVED=$removed
  if (( removed > 0 )); then
    info "legacy: ${removed} artifact(s) ${verb}; the DISPLAY drop-in change needs a Hermes restart:"
    hermes_restart_hint
  fi
}

# Bot Desktop packages + cua-driver prerequisites + legacy cleanup. Hermes starts the
# desktops itself (one Xfce desktop per profile via display.start) — this module only
# provisions the host.
mod_botdesktop() {
  local missing=() p
  for p in "${BOTDESKTOP_PKGS[@]}"; do
    pkg_installed "$p" || missing+=("$p")
  done
  if ((${#missing[@]} > 0)) && (( !CHECK )); then
    info "botdesktop: ${#missing[@]} packages missing; installing"
    apt_ensure_installed "${missing[@]}"
  fi

  missing=()
  for p in "${BOTDESKTOP_PKGS[@]}"; do
    pkg_installed "$p" || missing+=("$p")
  done

  local bin_missing=()
  for b in "${BOTDESKTOP_BINARIES[@]}"; do
    command -v "$b" >/dev/null 2>&1 || bin_missing+=("$b")
  done

  cleanup_legacy

  local pkgs_json="" b
  for b in "${missing[@]}"; do pkgs_json+=$(printf '"%s",' "$b"); done
  pkgs_json=${pkgs_json%,}
  local bins_json=""
  for b in "${bin_missing[@]}"; do bins_json+=$(printf '"%s",' "$b"); done
  bins_json=${bins_json%,}

  local restart_list=() restart_json="" unit
  for unit in "${SYS_UNITS[@]}" "${USER_UNITS[@]}"; do restart_list+=("$unit"); done
  for unit in "${restart_list[@]}"; do restart_json+=$(printf '"%s",' "$unit"); done
  restart_json=${restart_json%,}

  M_DETAIL[botdesktop]=$(cat <<EOF
"packages_missing":[${pkgs_json}],"binaries_missing":[${bins_json}],"cua_driver":$(printf '%s' "${CUA_DRIVER:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"legacy_removed":${LEGACY_REMOVED},"restart_needed":[${restart_json}]
EOF
  )
  M_DETAIL[botdesktop]=$(printf '%s' "${M_DETAIL[botdesktop]}" | tr -d '\n\t')

  if ((${#missing[@]} > 0 || ${#bin_missing[@]} > 0)); then
    set_status botdesktop fail "Bot Desktop incomplete: ${#missing[@]} packages and ${#bin_missing[@]} binaries missing"
    if ((${#missing[@]} > 0)); then
      manual "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${missing[*]}"
    fi
    if ((${#bin_missing[@]} > 0)); then
      manual "verify PATH for the hermes user: ${bin_missing[*]} (packages per tools/bot_desktop/runtime.py PACKAGES)"
    fi
    return
  fi

  local note=""
  if (( LEGACY_REMOVED > 0 )); then
    if (( CHECK )); then
      note="${LEGACY_REMOVED} legacy v1 artifact(s) pending cleanup (apply the module to remove them)"
    else
      note="legacy v1 cleanup: ${LEGACY_REMOVED} artifact(s) removed — restart Hermes (see [manual] above)"
    fi
  else
    note="no legacy v1 artifacts found"
  fi
  set_status botdesktop ok "Bot Desktop packages OK (all REQUIRED_BINARIES on PATH). Hermes starts desktops per profile via display.start. ${note}"
}

mod_access() {
  case "$ACCESS_MODE" in
    sslip) access_sslip ;;
    tailscale) access_tailscale ;;
    domain) access_domain ;;
  esac
}

access_domain() {
  local site_found=false
  if [[ -f $CADDYFILE ]] && [[ -n $(find_site_open_line "$CADDYFILE") ]]; then
    site_found=true
  fi

  local public_url="" public_url_set=false
  public_url=$(hermes_get_public_url)
  [[ $public_url == "https://$DOMAIN" ]] && public_url_set=true

  local auth_ok=false
  check_auth_configured && auth_ok=true

  if (( !CHECK )); then
    set_public_url && public_url_set=true
    if ! check_auth_configured; then
      warn "dashboard auth is NOT configured (dashboard.basic_auth.username + password/password_hash, or dashboard.oauth.client_id)."
      warn "Once a public host is declared, 'hermes serve' fails closed on restart without an auth provider — configure it BEFORE restarting:"
      manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.username droidbot"
      manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.password 'REPLACE-ME'"
      auth_ok=false
    fi
    if ! $site_found; then
      warn "no site block for '${DOMAIN}' found in ${CADDYFILE} (create it, then re-run; or use --access sslip)"
    fi
  fi

  local probe=""
  if (( !DRY )) && $site_found; then
    probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" -k \
      "https://${DOMAIN}/" 2>/dev/null || true)
    [[ -z $probe ]] && probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      -H "Host: ${DOMAIN}" "http://127.0.0.1/" 2>/dev/null || true)
  fi

  M_DETAIL[access]=$(cat <<EOF
"mode":"domain","url":$(printf '%s' "https://${DOMAIN}" | json_escape | sed 's/^/"/;s/$/"/'),"public_ip":null,"site_found":${site_found},"public_url":$(printf '%s' "${public_url:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"public_url_set":${public_url_set},"auth_configured":${auth_ok},"probe_root":$(printf '%s' "${probe:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"tailscale":{"installed":null,"logged_in":null,"serve_active":null,"dns_name":null}
EOF
  )
  M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')

  if ! $public_url_set || ! $site_found; then
    set_status access fail "https://${DOMAIN} is not fully wired (site_found=${site_found}, public_url_set=${public_url_set})"
    manual "check the site block in ${CADDYFILE} and dashboard.public_url (see [manual] lines above)"
    return
  fi
  if ! $auth_ok; then
    set_status access warn "site and public_url OK but dashboard auth is NOT configured — configure basic_auth before exposing"
    print_phone_banner "https://${DOMAIN}"
    return
  fi
  set_status access ok "https://${DOMAIN} serves the PWA and proxies /api/* /auth/* /login* to Hermes"
  print_phone_banner "https://${DOMAIN}"
}

access_sslip() {
  if [[ -z $PUBLIC_IP || -z $ACCESS_HOST ]]; then
    set_status access fail "could not derive the sslip.io host (public IPv4 detection failed)"
    manual "curl -s https://api.ipify.org   # then re-run with --domain <ip-with-dashes>.sslip.io"
    M_DETAIL[access]="\"mode\":\"sslip\",\"url\":null,\"public_ip\":null,\"site_found\":false,\"public_url\":null,\"public_url_set\":false,\"auth_configured\":false,\"probe_root\":null,\"tailscale\":{\"installed\":null,\"logged_in\":null,\"serve_active\":null,\"dns_name\":null}"
    return
  fi

  if (( !CHECK )); then
    apt_ensure_installed caddy curl
  fi
  find_caddy
  local site_found=false
  if access_site_present; then
    site_found=true
  fi

  local caddy_ok=true
  if (( !CHECK )); then
    if [[ -z $CADDY_BIN ]] || [[ ! -f $CADDYFILE ]]; then
      caddy_ok=false
      err "caddy or ${CADDYFILE} not found"
      manual "apt-get install -y caddy   # or the official repo: https://caddyserver.com/docs/install#debian-ubuntu-raspbian"
    else
      local block
      block=$(mktemp /tmp/droidbot-caddy-access.XXXXXX)
      render_access_site_block > "$block"
      if replace_whole_site_block "$ACCESS_SITE_BEGIN_RE" "$ACCESS_SITE_END_RE" "$block"; then
        caddy_backup
        caddy_validate_and_reload || caddy_ok=false
        site_found=true
        info "Caddy site block for ${ACCESS_HOST} in place; Caddy obtains the Let's Encrypt certificate automatically (HTTP-01 challenge — ports 80/443 must be reachable)"
      else
        caddy_ok=false
      fi
      rm -f "$block"
    fi
  fi

  local public_url="" public_url_set=false
  public_url=$(hermes_get_public_url)
  [[ $public_url == "https://$ACCESS_HOST" ]] && public_url_set=true

  local auth_ok=false
  check_auth_configured && auth_ok=true

  if (( !CHECK )); then
    if ! set_public_url; then
      public_url_set=false
    else
      public_url_set=true
    fi
    if ! check_auth_configured; then
      warn "dashboard auth is NOT configured (dashboard.basic_auth.username + password/password_hash, or dashboard.oauth.client_id)."
      warn "Once a public host is declared, 'hermes serve' fails closed on restart without an auth provider — configure it BEFORE restarting:"
      manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.username droidbot"
      manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.password 'REPLACE-ME'"
      auth_ok=false
    fi
    # public_url is snapshotted at server start → restart needed.
    info "restart Hermes for the new trusted public host to take effect:"
    hermes_restart_hint
  fi

  local probe=""
  if (( !DRY )) && $site_found; then
    probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${ACCESS_HOST}:443:127.0.0.1" -k \
      "https://${ACCESS_HOST}/" 2>/dev/null || true)
    [[ -z $probe ]] && probe=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      -H "Host: ${ACCESS_HOST}" "http://127.0.0.1/" 2>/dev/null || true)
  fi

  M_DETAIL[access]=$(cat <<EOF
"mode":"sslip","url":$(printf '%s' "https://${ACCESS_HOST}" | json_escape | sed 's/^/"/;s/$/"/'),"public_ip":$(printf '%s' "${PUBLIC_IP}" | json_escape | sed 's/^/"/;s/$/"/'),"site_found":${site_found},"public_url":$(printf '%s' "${public_url:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"public_url_set":${public_url_set},"auth_configured":${auth_ok},"probe_root":$(printf '%s' "${probe:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"tailscale":{"installed":null,"logged_in":null,"serve_active":null,"dns_name":null}
EOF
  )
  M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')

  if (( CHECK )); then
    if ! $site_found || ! $public_url_set; then
      set_status access fail "sslip.io site incomplete (site_found=${site_found}, public_url_set=${public_url_set}) — apply the module"
      manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
      return
    fi
  else
    if ! $caddy_ok || ! $public_url_set; then
      set_status access fail "sslip.io site incomplete (caddy_ok=${caddy_ok}, public_url_set=${public_url_set})"
      manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
      return
    fi
  fi
  if ! $auth_ok; then
    set_status access warn "sslip.io site and public_url OK but dashboard auth is NOT configured — configure basic_auth before exposing"
    print_phone_banner "https://${ACCESS_HOST}"
    return
  fi
  set_status access ok "https://${ACCESS_HOST} serves the PWA and proxies /api/* /auth/* /login* to Hermes"
  print_phone_banner "https://${ACCESS_HOST}"
}

access_tailscale() {
  TAILSCALE_BIN=$(command -v tailscale 2>/dev/null || true)
  local installed=false logged=false serve_active=false

  if [[ -n $TAILSCALE_BIN ]]; then
    installed=true
    if tailscale status >/dev/null 2>&1; then
      logged=true
    fi
    if tailscale serve status --json 2>/dev/null | grep -q "127.0.0.1"; then
      serve_active=true
    fi
    TAILSCALE_DNS=$(tailscale status --json 2>/dev/null | grep -m1 -o '[A-Za-z0-9.-]*\.ts\.net' || true)
  fi

  local target="" caddy_site_ok=false
  find_caddy
  if [[ -n $CADDY_BIN ]] && [[ -f $CADDYFILE ]]; then
    # Route through Caddy's loopback catch-all site so the PWA static files are served
    # (tailscale → Caddy → Hermes API + PWA).
    if (( !CHECK )); then
      local block
      block=$(mktemp /tmp/droidbot-caddy-ts.XXXXXX)
      render_tailscale_site_block > "$block"
      if replace_whole_site_block "$TAILSCALE_SITE_BEGIN_RE" "$TAILSCALE_SITE_END_RE" "$block"; then
        caddy_backup
        caddy_site_ok=true
        caddy_validate_and_reload || caddy_site_ok=false
      fi
      rm -f "$block"
    elif grep -qF "$TAILSCALE_SITE_BEGIN" "$CADDYFILE"; then
      caddy_site_ok=true
    fi
    target="http://127.0.0.1:${ACCESS_CADDY_PORT}"
  else
    target="http://127.0.0.1:${HERMES_PORT}"
    warn "Caddy not found: tailscale will proxy Hermes directly (${target}). Hermes serves its own web UI there, not the DroidBot PWA."
  fi

  if (( !CHECK )); then
    if ! $installed; then
      err "tailscale is not installed"
      manual "curl -fsSL https://tailscale.com/install.sh | sh"
      manual "sudo tailscale up   # then re-run this module"
      M_DETAIL[access]=$(cat <<EOF
"mode":"tailscale","url":null,"public_ip":null,"site_found":null,"public_url":null,"public_url_set":false,"auth_configured":null,"probe_root":null,"tailscale":{"installed":false,"logged_in":false,"serve_active":false,"dns_name":null}
EOF
      )
      M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')
      set_status access fail "tailscale not installed"
      return
    fi
    if ! $logged; then
      err "tailscale is installed but not logged in"
      manual "sudo tailscale up   # then re-run this module"
      M_DETAIL[access]=$(cat <<EOF
"mode":"tailscale","url":null,"public_ip":null,"site_found":null,"public_url":null,"public_url_set":false,"auth_configured":null,"probe_root":null,"tailscale":{"installed":true,"logged_in":false,"serve_active":false,"dns_name":null}
EOF
      )
      M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')
      set_status access fail "tailscale installed but not logged in"
      return
    fi
    # Current CLI syntax (v1.52+): `tailscale serve --bg --https=443 <target>`.
    # --yes skips interactive prompts (e.g. enabling HTTPS certs for the tailnet).
    if ! cmd tailscale serve --bg --yes --https=443 "$target"; then
      if ! cmd tailscale serve --bg --https=443 "$target"; then
        err "tailscale serve failed"
        manual "tailscale serve --bg --https=443 ${target}"
        manual "tailscale serve status --json"
        M_DETAIL[access]=$(cat <<EOF
"mode":"tailscale","url":null,"public_ip":null,"site_found":null,"public_url":null,"public_url_set":false,"auth_configured":null,"probe_root":null,"tailscale":{"installed":true,"logged_in":true,"serve_active":false,"dns_name":$(printf '%s' "${TAILSCALE_DNS:-null}" | json_escape | sed 's/^/"/;s/$/"/')}
EOF
        )
        M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')
        set_status access fail "tailscale serve could not be configured"
        return
      fi
    fi
    serve_active=true
    TAILSCALE_DNS=$(tailscale status --json 2>/dev/null | grep -m1 -o '[A-Za-z0-9.-]*\.ts\.net' || true)
  fi

  local auth_ok=false
  check_auth_configured && auth_ok=true
  if (( !CHECK )) && ! $auth_ok; then
    warn "dashboard auth is NOT configured (dashboard.basic_auth.username + password/password_hash, or dashboard.oauth.client_id) — configure it, otherwise Hermes keeps refusing a public dashboard"
    manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.username droidbot"
    manual "runuser -u ${HERMES_USER} -- hermes config set dashboard.basic_auth.password 'REPLACE-ME'"
  fi

  local url_json="null"
  if [[ -n $TAILSCALE_DNS ]]; then
    url_json=$(printf '%s' "https://${TAILSCALE_DNS}/" | json_escape | sed 's/^/"/;s/$/"/')
  fi
  M_DETAIL[access]=$(cat <<EOF
"mode":"tailscale","url":${url_json},"public_ip":null,"site_found":${caddy_site_ok},"public_url":null,"public_url_set":false,"auth_configured":${auth_ok},"probe_root":null,"tailscale":{"installed":${installed},"logged_in":${logged},"serve_active":${serve_active},"dns_name":$(printf '%s' "${TAILSCALE_DNS:-null}" | json_escape | sed 's/^/"/;s/$/"/')}
EOF
  )
  M_DETAIL[access]=$(printf '%s' "${M_DETAIL[access]}" | tr -d '\n\t')

  if (( CHECK )); then
    if ! $installed; then
      set_status access fail "tailscale not installed"
      manual "curl -fsSL https://tailscale.com/install.sh | sh"
      return
    fi
    if ! $logged; then
      set_status access fail "tailscale installed but not logged in"
      manual "sudo tailscale up"
      return
    fi
    if ! $serve_active; then
      set_status access warn "tailscale logged in but no serve config for 127.0.0.1 (run the module to apply)"
      manual "tailscale serve --bg --yes --https=443 ${target}"
      return
    fi
    set_status access ok "tailscale serving ${TAILSCALE_DNS:-<host>.ts.net} → ${target}"
    return
  fi

  if [[ -z $TAILSCALE_DNS ]]; then
    set_status access warn "tailscale serve configured, but the device DNS name could not be read (tailscale status --json)"
    manual "tailscale status   # the https://<machine>.<tailnet>.ts.net URL is in the first line"
    print_phone_banner "https://<machine>.<tailnet>.ts.net/"
    return
  fi
  # Hermes Host/Origin checks: with `hermes serve --host 0.0.0.0` any Host is
  # accepted; on a loopback bind, dashboard.public_url must hold this ts.net host.
  warn "note: if hermes serve binds to a loopback address (not 0.0.0.0), set dashboard.public_url to the ts.net URL or Host/Origin checks will reject the PWA"
  set_status access ok "tailscale serving https://${TAILSCALE_DNS}/ → ${target}"
  print_phone_banner "https://${TAILSCALE_DNS}/"
}

mod_caddy() {
  find_caddy
  if [[ -z $CADDY_BIN ]] || [[ ! -f $CADDYFILE ]]; then
    set_status caddy fail "caddy or ${CADDYFILE} not found"
    manual "apt-get install -y caddy   # or the official repo: https://caddyserver.com/docs/install#debian-ubuntu-raspbian"
    M_DETAIL[caddy]="\"site_found\":false,\"cache_block\":false,\"validate\":false,\"caddy_version\":null,\"sw_cache_header\":null,\"assets_cache_header\":null"
    return
  fi

  # Access-generated sites already carry the cache headers inline: verify only.
  if [[ $ACCESS_MODE == sslip ]] || [[ $ACCESS_MODE == tailscale && -z $DOMAIN ]]; then
    local access_present=false
    if [[ $ACCESS_MODE == sslip ]]; then
      access_site_present && access_present=true
    else
      grep -qF "$TAILSCALE_SITE_BEGIN" "$CADDYFILE" && access_present=true
    fi
    local validate_ok=false
    if "$CADDY_BIN" validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
      validate_ok=true
    fi
    M_DETAIL[caddy]=$(cat <<EOF
"site_found":${access_present},"cache_block":${access_present},"validate":${validate_ok},"caddy_version":$(printf '%s' "${CADDY_VERSION:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"sw_cache_header":null,"assets_cache_header":null
EOF
    )
    M_DETAIL[caddy]=$(printf '%s' "${M_DETAIL[caddy]}" | tr -d '\n\t')
    if ! $access_present || ! $validate_ok; then
      set_status caddy fail "the ${ACCESS_MODE} site block is missing or the Caddyfile is invalid"
      manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
      return
    fi
    set_status caddy ok "${ACCESS_MODE} site block present (cache headers inline) and Caddyfile valid"
    return
  fi

  if [[ -z $DOMAIN ]]; then
    set_status caddy warn "no domain resolved (no --domain, no single Caddyfile site, no sslip host); nothing to manage"
    M_DETAIL[caddy]="\"site_found\":false,\"cache_block\":false,\"validate\":false,\"caddy_version\":$(printf '%s' "${CADDY_VERSION:-null}" | json_escape | sed 's/^/"/;s/$/"/'),\"sw_cache_header\":null,\"assets_cache_header\":null"
    return
  fi

  local line
  line=$(find_site_open_line "$CADDYFILE")
  if [[ -z $line ]]; then
    set_status caddy fail "no site block for '${DOMAIN}' found in ${CADDYFILE}"
    manual "edit ${CADDYFILE} and add the site block for ${DOMAIN} (or pass --domain <host>)"
    M_DETAIL[caddy]="\"site_found\":false,\"cache_block\":false,\"validate\":false,\"caddy_version\":$(printf '%s' "${CADDY_VERSION:-}" | json_escape | sed 's/^/"/;s/$/"/'),\"sw_cache_header\":null,\"assets_cache_header\":null"
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
        caddy_backup
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
    validate_ok=true
  elif "$CADDY_BIN" validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    validate_ok=true
  fi

  # Probe the real headers (best-effort; an unreachable site is not the block's fault).
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
    set_status caddy fail "Caddyfile invalid or cache block missing"
    manual "caddy validate --config ${CADDYFILE} --adapter caddyfile"
    return
  fi
  if (( DRY && !CHECK )); then
    set_status caddy ok "(rehearsal) cache block ready to insert; headers apply on reload"
    return
  fi
  if [[ -z $sw_header && -z $assets_header ]]; then
    set_status caddy warn "block present and Caddyfile valid, but ${DOMAIN} could not be probed locally"
    manual "curl -sSI -H 'Host: ${DOMAIN}' http://127.0.0.1/sw.js"
    return
  fi
  set_status caddy ok "cache headers active (sw.js: '${sw_header:-?}')"
}

mod_droidbot() {
  if (( CHECK )); then
    check_droidbot
    return
  fi
  if [[ -z $ARG_DIST ]]; then
    set_status droidbot fail "--dist <path|url-to-tar.gz> required"
    M_DETAIL[droidbot]="\"installed\":$([[ -f $WEBROOT/index.html ]] && echo true || echo false)"
    return
  fi

  local tarball src=$ARG_DIST
  if (( DRY )); then
    # Rehearsal: print the full flow without running anything.
    if [[ $src == http://* || $src == https://* ]]; then
      cmd curl -fsSL --retry 3 -o "/tmp/droidbot-dist.tar.gz" "$src"
    fi
    printf '[dry-run] sha256sum of dist → compare against %s\n' "$DIST_MARKER"
    printf '[dry-run] extract into %s.stage; validate index.html\n' "$WEBROOT"
    printf '[dry-run] atomic swap: rm -rf %s.prev; mv %s %s.prev; mv stage %s\n' \
      "$WEBROOT" "$WEBROOT" "$WEBROOT" "$WEBROOT"
    printf '[dry-run] write %s\n' "$DIST_MARKER"
    set_status droidbot ok "(rehearsal) simulated deploy into ${WEBROOT}"
    M_DETAIL[droidbot]="\"installed\":null,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi

  if [[ $src == http://* || $src == https://* ]]; then
    tarball=$(mktemp /tmp/droidbot-dist.XXXXXX.tar.gz)
    if ! cmd curl -fsSL --retry 3 -o "$tarball" "$src"; then
      rm -f "$tarball"
      set_status droidbot fail "could not download $src"
      manual "curl -fsSL -o /tmp/dist.tar.gz '${src}'"
      return
    fi
  else
    if [[ ! -f $src ]]; then
      set_status droidbot fail "--dist does not point to an existing file: $src"
      return
    fi
    tarball=$src
  fi

  local sha
  sha=$(sha256sum "$tarball" | awk '{print $1}')
  local installed_sha=""
  installed_sha=$(cat "$DIST_MARKER" 2>/dev/null || true)
  if [[ $sha == "$installed_sha" && -f $WEBROOT/index.html ]]; then
    set_status droidbot ok "already up to date (sha256 matches)"
    [[ $src != "$tarball" ]] && rm -f "$tarball"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":true"
    return
  fi

  local stage=$WEBROOT.stage.$$
  mkdir -p "$stage"
  if ! cmd tar -xzf "$tarball" -C "$stage"; then
    rm -rf "$stage"
    set_status droidbot fail "could not extract the tar.gz"
    manual "tar -xzf ${src} -C /var/www"
    return
  fi

  # If the tar holds a single root directory (dist/), promote it.
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
    set_status droidbot fail "the dist has no index.html at its root"
    manual "make sure the tar.gz has index.html at the root (or inside a single subdirectory)"
    return
  fi

  # Atomic swap: the previous PWA stays at /var/www/droidbot.prev.
  if [[ -e $WEBROOT.prev ]]; then
    cmd rm -rf "$WEBROOT.prev"
  fi
  if [[ -d $WEBROOT ]]; then
    cmd mv "$WEBROOT" "$WEBROOT.prev"
  fi
  if ! cmd mv "$stage" "$WEBROOT"; then
    set_status droidbot fail "could not move the stage to $WEBROOT"
    manual "mv ${stage} ${WEBROOT}"
    return
  fi
  if (( DRY )); then
    printf '[dry-run] write %s\n' "$DIST_MARKER"
  else
    mkdir -p "$(dirname "$DIST_MARKER")"
    printf '%s\n' "$sha" > "$DIST_MARKER"
  fi
  [[ $src != "$tarball" ]] && rm -f "$tarball"

  if [[ -f $WEBROOT/index.html && -f $WEBROOT/sw.js ]]; then
    set_status droidbot ok "PWA installed (${sha:0:12}…) — previous version in ${WEBROOT}.prev"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  else
    set_status droidbot fail "incomplete install (missing index.html or sw.js)"
    manual "ls -la ${WEBROOT}"
    M_DETAIL[droidbot]="\"installed\":false,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  fi
}

check_droidbot() {
  local installed=false
  [[ -f $WEBROOT/index.html && -f $WEBROOT/sw.js ]] && installed=true
  if ! $installed; then
    set_status droidbot unknown "no PWA installed at $WEBROOT"
    M_DETAIL[droidbot]="\"installed\":false,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi
  if [[ -z $ARG_DIST ]]; then
    set_status droidbot ok "PWA installed (index.html + sw.js)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":null,\"up_to_date\":null"
    return
  fi

  local sha=""
  local tmp=""
  if [[ $ARG_DIST == http://* || $ARG_DIST == https://* ]]; then
    tmp=$(mktemp /tmp/droidbot-check.XXXXXX)
    if ! curl -fsSL --retry 2 -o "$tmp" "$ARG_DIST"; then
      rm -f "$tmp"
      set_status droidbot fail "could not download $ARG_DIST to compare"
      return
    fi
    sha=$(sha256sum "$tmp" | awk '{print $1}')
    rm -f "$tmp"
  elif [[ -f $ARG_DIST ]]; then
    sha=$(sha256sum "$ARG_DIST" | awk '{print $1}')
  else
    set_status droidbot fail "--dist does not point to an existing file: $ARG_DIST"
    return
  fi

  local installed_sha=""
  installed_sha=$(cat "$DIST_MARKER" 2>/dev/null || true)
  if [[ $installed_sha == "$sha" ]]; then
    set_status droidbot ok "PWA installed and up to date (sha256 matches)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":true"
  else
    set_status droidbot fail "the dist differs from the installed one (deploy pending)"
    M_DETAIL[droidbot]="\"installed\":true,\"dist_sha256\":\"${sha}\",\"up_to_date\":false"
  fi
}

# --- Push module -------------------------------------------------------------------
# Resolves Hermes' PM-managed Python (~/.hermes/tools/python-*/bin/python[3]), the
# interpreter hermes serve/gateway run with — pywebpush must be importable from it.
find_hermes_python() {
  HERMES_PYTHON=""
  local p
  shopt -s nullglob
  for p in "$HERMES_HOME"/tools/python-*/bin/python "$HERMES_HOME"/tools/python-*/bin/python3; do
    if [[ -x $p ]]; then
      HERMES_PYTHON=$p
      break
    fi
  done
  shopt -u nullglob
  [[ -n $HERMES_PYTHON ]]
}

# Resolves the plugin source folder: --plugin-src wins; the default is the
# hermes-plugin/droidbot_push folder next to the provisioner directory.
resolve_plugin_src() {
  local default_src="hermes-plugin/droidbot_push"
  if [[ -n $SCRIPT_DIR ]]; then
    default_src="$SCRIPT_DIR/../hermes-plugin/droidbot_push"
  fi
  if [[ -n $ARG_PLUGIN_SRC ]]; then
    PLUGIN_SRC=$ARG_PLUGIN_SRC
  else
    PLUGIN_SRC=$default_src
  fi
  PLUGIN_SRC=$(cd "$PLUGIN_SRC" 2>/dev/null && pwd || printf '%s' "$PLUGIN_SRC")
}

plugin_source_valid() {
  [[ -f $PLUGIN_SRC/plugin.yaml && -f $PLUGIN_SRC/__init__.py ]] \
    && grep -qE "^name:[[:space:]]*${PLUGIN_NAME}[[:space:]]*$" "$PLUGIN_SRC/plugin.yaml"
}

# True when every file under <src> exists under <dst> with identical bytes.
# Ignores anything in <dst> that is not in <src> (e.g. runtime __pycache__).
tree_matches() {
  local src=$1 dst=$2 rel sha_src sha_dst
  [[ -d $src && -d $dst ]] || return 1
  while IFS= read -r -d '' rel_path; do
    rel=${rel_path#"$src"/}
    [[ -f $dst/$rel ]] || return 1
    sha_src=$(sha256sum "$rel_path" | awk '{print $1}')
    sha_dst=$(sha256sum "$dst/$rel" 2>/dev/null | awk '{print $1}')
    [[ -n $sha_src && $sha_src == "$sha_dst" ]] || return 1
  done < <(find "$src" -type f -print0)
  return 0
}

# True when `hermes plugins list --plain` shows the plugin as enabled.
plugin_enabled() {
  hermes_cmd hermes plugins list --plain 2>/dev/null \
    | awk -v n="$PLUGIN_NAME" '$1 == "enabled" && $NF == n { found = 1 } END { exit !found }'
}

# True when pywebpush imports in Hermes' Python and its major version is >= 2.
hermes_pywebpush_ok() {
  hermes_cmd "$HERMES_PYTHON" -c 'import pywebpush, sys
try:
    from importlib.metadata import version
    major = int(version("pywebpush").split(".")[0])  # pywebpush has no __version__
except Exception:
    major = 0
sys.exit(0 if major >= 2 else 1)' >/dev/null 2>&1
}

# HTTP code of an unauthenticated GET of the plugin route (read-only probe).
push_route_probe() {
  local code=""
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    "http://127.0.0.1:${HERMES_PORT}${PUSH_ROUTE}" 2>/dev/null || true)
  printf '%s' "$code"
}

# True when the probe code means the route is mounted: 401 (auth gate),
# 200 (no auth gate), 503 (mounted but plugin not initialized yet).
route_mounted() {
  case "$1" in
    200 | 401 | 503) return 0 ;;
    *) return 1 ;;
  esac
}

mod_push() {
  if (( CHECK )); then
    check_push
    return
  fi

  local target="$HERMES_HOME/plugins/$PLUGIN_FOLDER"

  if ! plugin_source_valid; then
    set_status push fail "no droidbot-push plugin source at ${PLUGIN_SRC} (plugin.yaml with 'name: ${PLUGIN_NAME}' required)"
    manual "copy hermes-plugin/droidbot_push from the repo to the VPS and pass --plugin-src <path>"
    manual "once published on GitHub: hermes plugins install <git-url> --yes-deps --enable"
    M_DETAIL[push]=$(cat <<EOF
"installed":$([[ -f $target/plugin.yaml ]] && echo true || echo false),"enabled":false,"source":$(printf '%s' "$PLUGIN_SRC" | json_escape | sed 's/^/"/;s/$/"/'),"python":null,"pywebpush_ok":false,"route_mounted":false,"probe":null
EOF
    )
    M_DETAIL[push]=$(printf '%s' "${M_DETAIL[push]}" | tr -d '\n\t')
    return
  fi

  # 1. Copy the plugin (root-owned ops + chown: the default source may live under
  # /root, unreadable by the hermes user; the copy must end up hermes-owned).
  if tree_matches "$PLUGIN_SRC" "$target"; then
    info "push: plugin already up to date at ${target}"
  else
    cmd mkdir -p "$HERMES_HOME/plugins"
    cmd rm -rf "$target.droidbot-stage"
    if ! cmd cp -r "$PLUGIN_SRC" "$target.droidbot-stage"; then
      set_status push fail "could not copy the plugin source to ${target}"
      manual "cp -r '${PLUGIN_SRC}' '${HERMES_HOME}/plugins/${PLUGIN_FOLDER}'"
      return
    fi
    cmd chown -R "$HERMES_USER:" "$target.droidbot-stage"
    cmd rm -rf "$target"
    cmd mv "$target.droidbot-stage" "$target"
    info "push: plugin copied to ${target}"
  fi

  # 2. Python dependency into Hermes' Python (temporary until the plugin is
  # published on GitHub; then: hermes plugins install <git-url> --yes-deps).
  if ! find_hermes_python; then
    set_status push fail "no Hermes-managed Python found (${HERMES_HOME}/tools/python-*/bin/python)"
    manual "runuser -u ${HERMES_USER} -- hermes pm install python"
    return
  fi
  if hermes_pywebpush_ok; then
    info "push: ${PLUGIN_DEP} already available in Hermes' Python (${HERMES_PYTHON})"
  elif (( DRY )); then
    run_hermes "$HERMES_PYTHON" -m pip install --quiet "$PLUGIN_DEP"
  elif run_hermes "$HERMES_PYTHON" -m pip install --quiet "$PLUGIN_DEP" >/dev/null 2>&1; then
    info "push: ${PLUGIN_DEP} installed into Hermes' Python (${HERMES_PYTHON})"
  else
    set_status push fail "${PLUGIN_DEP} could not be installed into Hermes' Python"
    manual "runuser -u ${HERMES_USER} -- ${HERMES_PYTHON} -m pip install '${PLUGIN_DEP}'"
    return
  fi

  # 3. Enable as the hermes user (idempotent: reports 'already enabled').
  if plugin_enabled; then
    info "push: plugin already enabled"
  elif (( DRY )); then
    run_hermes hermes plugins enable "$PLUGIN_NAME"
  elif run_hermes hermes plugins enable "$PLUGIN_NAME" >/dev/null 2>&1; then
    info "push: plugin enabled (hermes plugins enable ${PLUGIN_NAME})"
  else
    warn "push: 'hermes plugins enable ${PLUGIN_NAME}' failed"
    manual "runuser -u ${HERMES_USER} -- hermes plugins enable ${PLUGIN_NAME}"
    manual "runuser -u ${HERMES_USER} -- hermes plugins list   # discovery/dependency admission"
  fi

  # 4. Restart hint (the plugin and its routes load at process start; never restarts).
  info "restart Hermes to load the plugin and mount ${PUSH_ROUTE}:"
  hermes_restart_hint

  local installed=false enabled=false pyok=false
  [[ -f $target/plugin.yaml ]] && installed=true
  plugin_enabled && enabled=true
  find_hermes_python && hermes_pywebpush_ok && pyok=true

  local probe="" mounted=false
  if (( !DRY )); then
    probe=$(push_route_probe)
    route_mounted "$probe" && mounted=true
  fi

  M_DETAIL[push]=$(cat <<EOF
"installed":${installed},"enabled":${enabled},"source":$(printf '%s' "$PLUGIN_SRC" | json_escape | sed 's/^/"/;s/$/"/'),"python":$(printf '%s' "${HERMES_PYTHON:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"pywebpush_ok":${pyok},"route_mounted":${mounted},"probe":$(printf '%s' "${probe:-null}" | json_escape | sed 's/^/"/;s/$/"/')
EOF
  )
  M_DETAIL[push]=$(printf '%s' "${M_DETAIL[push]}" | tr -d '\n\t')

  if (( DRY )); then
    set_status push ok "(rehearsal) plugin copied, ${PLUGIN_DEP} installed and plugin enabled — restart Hermes after the real run"
    return
  fi
  if $installed && $enabled && $pyok && $mounted; then
    set_status push ok "routes mounted — GET ${PUSH_ROUTE} → ${probe} (unauthenticated)"
  elif $installed && $enabled && $pyok; then
    set_status push warn "installed and enabled, but the routes are not mounted yet — restart Hermes (see [manual] above)"
  else
    set_status push fail "push setup incomplete (installed=${installed}, enabled=${enabled}, pywebpush_ok=${pyok})"
  fi
}

check_push() {
  local target="$HERMES_HOME/plugins/$PLUGIN_FOLDER"
  local installed=false enabled=false pyok=false
  [[ -f $target/plugin.yaml ]] && installed=true
  plugin_enabled && enabled=true
  find_hermes_python && hermes_pywebpush_ok && pyok=true

  local probe="" mounted=false
  if (( !DRY )); then
    probe=$(push_route_probe)
    route_mounted "$probe" && mounted=true
  fi

  M_DETAIL[push]=$(cat <<EOF
"installed":${installed},"enabled":${enabled},"source":null,"python":$(printf '%s' "${HERMES_PYTHON:-null}" | json_escape | sed 's/^/"/;s/$/"/'),"pywebpush_ok":${pyok},"route_mounted":${mounted},"probe":$(printf '%s' "${probe:-null}" | json_escape | sed 's/^/"/;s/$/"/')
EOF
  )
  M_DETAIL[push]=$(printf '%s' "${M_DETAIL[push]}" | tr -d '\n\t')

  if ! $installed; then
    set_status push unknown "plugin not installed at ${target} — apply the push module"
    manual "sudo bash prepare.sh push --plugin-src <path-to-hermes-plugin/droidbot_push>"
    return
  fi
  if ! $enabled; then
    set_status push fail "plugin installed but not enabled"
    manual "runuser -u ${HERMES_USER} -- hermes plugins enable ${PLUGIN_NAME}"
    return
  fi
  if ! $pyok; then
    set_status push fail "${PLUGIN_DEP} missing from Hermes' Python"
    manual "runuser -u ${HERMES_USER} -- ${HERMES_PYTHON:-<hermes-python>} -m pip install '${PLUGIN_DEP}'"
    return
  fi
  if ! $mounted; then
    set_status push warn "installed and enabled, but the routes are not mounted — restart Hermes"
    hermes_restart_hint
    return
  fi
  set_status push ok "routes mounted — GET ${PUSH_ROUTE} → ${probe} (unauthenticated)"
}

# --- Companion module (phase 7c) ---------------------------------------------------
# Teaches every bot profile it is talked to from Alado (the phone PWA), not Hermes
# Desktop: ships the alado-companion skill, wires it into every profile via the
# TOP-LEVEL config key platform_hints.tui.replace (never under agent:; --force
# required), and removes the legacy marked alado block from every SOUL.md
# (cleanup only — the SOUL pointer approach was replaced, verified live by the
# architect on the VPS). New bots created from Alado use clone_from (copies
# config.yaml + SOUL.md), so they inherit the config automatically.

# Resolves the skills source folder: --skills-src wins; the default is the skills/
# folder next to the provisioner directory (mirror of resolve_plugin_src).
resolve_skills_src() {
  local default_src="skills"
  if [[ -n $SCRIPT_DIR ]]; then
    default_src="$SCRIPT_DIR/../skills"
  fi
  if [[ -n $ARG_SKILLS_SRC ]]; then
    SKILLS_SRC=$ARG_SKILLS_SRC
  else
    SKILLS_SRC=$default_src
  fi
  SKILLS_SRC=$(cd "$SKILLS_SRC" 2>/dev/null && pwd || printf '%s' "$SKILLS_SRC")
}

skill_source_valid() {
  [[ -f $SKILLS_SRC/$ALADO_SKILL_DIR_NAME/SKILL.md \
    && -s $SKILLS_SRC/$ALADO_SKILL_DIR_NAME/$ALADO_HINT_FILE ]]
}

# Profiles to wire: the default profile plus every ~/.hermes/profiles/<name>/.
collect_profiles() {
  PROFILES=("default")
  local d
  shopt -s nullglob
  for d in "$HERMES_HOME"/profiles/*/; do
    [[ -d $d ]] && PROFILES+=("$(basename "$d")")
  done
  shopt -u nullglob
}

# SOUL.md path of a profile: ~/.hermes/SOUL.md for the default profile,
# ~/.hermes/profiles/<name>/SOUL.md otherwise.
soul_file_for() {
  if [[ $1 == "default" ]]; then
    printf '%s/SOUL.md' "$HERMES_HOME"
  else
    printf '%s/profiles/%s/SOUL.md' "$HERMES_HOME" "$1"
  fi
}

# Parses a flow-style list ("['/a', '/b']" / '["/a", "/b"]') or a bare single path
# into LIST_ENTRIES. Returns 1 (parse failed) when the input is non-empty but not a
# recognized shape — callers then refuse to overwrite the config.
parse_list_entries() {
  LIST_ENTRIES=()
  local raw=$1 part line
  raw=${raw//$'\r'/}
  # `hermes config get` prints lists as a YAML block ("  - /path" per line).
  if [[ $raw =~ ^[[:space:]]*-[[:space:]] ]]; then
    while IFS= read -r line; do
      [[ -z ${line//[[:space:]]/} ]] && continue
      [[ $line =~ ^[[:space:]]*-[[:space:]]+(.*)$ ]] || return 1
      part=${BASH_REMATCH[1]}
      part=${part%%[[:space:]]}
      part=${part#\"}; part=${part%\"}; part=${part#\'}; part=${part%\'}
      LIST_ENTRIES+=("$part")
    done <<< "$raw"
    return 0
  fi
  [[ $raw == *$'\n'* ]] && return 1
  [[ -z $raw ]] && return 0
  if [[ $raw == "["*"]" ]]; then
    raw=${raw#\[}
    raw=${raw%\]}
  elif [[ $raw == *,* ]]; then
    return 1
  fi
  [[ -z $raw ]] && return 0
  local parts
  IFS=',' read -r -a parts <<< "$raw"
  for part in "${parts[@]}"; do
    part=${part##[[:space:]]}
    part=${part%%[[:space:]]}
    if [[ $part == \"*\" ]]; then
      part=${part#\"}
      part=${part%\"}
    elif [[ $part == \'*\' ]]; then
      part=${part#\'}
      part=${part%\'}
    fi
    part=${part//\"/}
    part=${part//\'/}
    [[ -n $part ]] && LIST_ENTRIES+=("$part")
  done
  ((${#LIST_ENTRIES[@]} > 0)) || return 1
  return 0
}

# Renders LIST_ENTRIES as a flow-style list for `hermes config set` (['a', 'b']).
render_list_entries() {
  local out="" e
  for e in "${LIST_ENTRIES[@]}"; do
    out+="'${e}', "
  done
  out=${out%, }
  printf '[%s]' "$out"
}

# True when LIST_ENTRIES already contains the alado-skills dir (tilde or expanded).
dirs_entry_present() {
  local e
  for e in "${LIST_ENTRIES[@]}"; do
    [[ $e == "$ALADO_SKILLS_ENTRY" || $e == "$ALADO_SKILLS_DIR" ]] && return 0
  done
  return 1
}

# Profile-aware read: `hermes -p <profile> config get` ("" when unset/absent).
hermes_config_get_p() {
  local profile=$1 key=$2 out=""
  if ! hermes_cli_exists; then
    return 0
  fi
  out=$(hermes_cmd hermes -p "$profile" config get "$key" 2>/dev/null || true)
  [[ $out == *"not set"* ]] && out=""
  printf '%s' "$out"
}

# Reads one profile's state into P_NAME/P_SOUL/P_DIRS_STATE/P_HINT_STATE/P_SOUL_STATE
# (external_dirs: ok|missing|unparsable; platform_hint: ok|missing|differs;
# soul_block: absent|leftover).
companion_read_profile() {
  local profile=$1 hintfile=$2 current want
  P_NAME=$profile
  P_SOUL=$(soul_file_for "$profile")
  current=$(hermes_config_get_p "$profile" "$ALADO_CONFIG_KEY")
  if [[ -z $current ]]; then
    P_DIRS_STATE="missing"
  elif ! parse_list_entries "$current"; then
    P_DIRS_STATE="unparsable"
  elif dirs_entry_present; then
    P_DIRS_STATE="ok"
  else
    P_DIRS_STATE="missing"
  fi
  current=$(hermes_config_get_p "$profile" "$PLATFORM_HINT_KEY")
  if [[ -s $hintfile ]]; then
    want=$(cat "$hintfile")
    if [[ -n $current && $current == "$want" ]]; then
      P_HINT_STATE="ok"
    elif [[ -z $current ]]; then
      P_HINT_STATE="missing"
    else
      P_HINT_STATE="differs"
    fi
  else
    P_HINT_STATE="missing" # cannot compare: the hint file is not installed
  fi
  if [[ -f $P_SOUL ]] && grep -qF "$SOUL_BLOCK_BEGIN" "$P_SOUL"; then
    P_SOUL_STATE="leftover"
  else
    P_SOUL_STATE="absent"
  fi
}

# JSON array of all profiles. Fills the globals COMP_PROFILES_JSON and
# MISSING_DIRS/HINT_MISSING/SOUL_LEFTOVER (profiles whose state is not ok/absent).
# Must be called WITHOUT command substitution (a $( ) subshell would drop the
# side effects).
companion_profiles_json() {
  local hintfile=$1 p out=""
  MISSING_DIRS=()
  HINT_MISSING=()
  SOUL_LEFTOVER=()
  for p in "${PROFILES[@]}"; do
    companion_read_profile "$p" "$hintfile"
    out+="{\"name\":$(printf '%s' "$P_NAME" | json_escape | sed 's/^/"/;s/$/"/'),\"soul\":$(printf '%s' "$P_SOUL" | json_escape | sed 's/^/"/;s/$/"/'),\"external_dirs\":\"${P_DIRS_STATE}\",\"platform_hint\":\"${P_HINT_STATE}\",\"soul_block\":\"${P_SOUL_STATE}\"},"
    [[ $P_DIRS_STATE == "ok" ]] || MISSING_DIRS+=("$p")
    [[ $P_HINT_STATE == "ok" ]] || HINT_MISSING+=("$p")
    [[ $P_SOUL_STATE == "absent" ]] || SOUL_LEFTOVER+=("$p")
  done
  COMP_PROFILES_JSON=${out%,}
}

# Merges ~/.hermes/alado-skills into <profile>'s skills.external_dirs, reading the
# current list first and never dropping entries the user had. 0 = ok/up to date.
companion_ensure_dirs() {
  local profile=$1 current new_list
  if ! hermes_cli_exists; then
    warn "companion: no 'hermes' CLI on PATH for user ${HERMES_USER}; wire skills.external_dirs manually:"
    manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set ${ALADO_CONFIG_KEY} '[\"${ALADO_SKILLS_ENTRY}\"]'"
    return 1
  fi
  current=$(hermes_config_get_p "$profile" "$ALADO_CONFIG_KEY")
  if [[ -n $current ]]; then
    if ! parse_list_entries "$current"; then
      warn "companion: ${profile}: could not parse '${ALADO_CONFIG_KEY}' (${current}) — merge it by hand so no entry is lost:"
      manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set ${ALADO_CONFIG_KEY} '[existing entries..., \"${ALADO_SKILLS_ENTRY}\"]'"
      return 1
    fi
    if dirs_entry_present; then
      info "companion: ${profile}: ${ALADO_CONFIG_KEY} already includes ${ALADO_SKILLS_ENTRY}"
      return 0
    fi
  else
    LIST_ENTRIES=() # empty/unset config: start a fresh list (no leftovers)
  fi
  LIST_ENTRIES+=("$ALADO_SKILLS_ENTRY")
  new_list=$(render_list_entries)
  if (( DRY )); then
    run_hermes hermes -p "$profile" config set "$ALADO_CONFIG_KEY" "$new_list"
    return 0
  fi
  if run_hermes hermes -p "$profile" config set "$ALADO_CONFIG_KEY" "$new_list" >/dev/null 2>&1; then
    info "companion: ${profile}: ${ALADO_CONFIG_KEY} set to ${new_list} (merged)"
    return 0
  fi
  warn "companion: ${profile}: 'hermes -p ${profile} config set ${ALADO_CONFIG_KEY}' failed"
  manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set ${ALADO_CONFIG_KEY} '${new_list}'"
  return 1
}

# Sets <profile>'s platform_hints.tui.replace (TOP-LEVEL key) to the contents of
# <hintfile> with `hermes -p <profile> config set --force` as the hermes user.
# 0 = ok/up to date.
companion_ensure_hint() {
  local profile=$1 hintfile=$2 current want
  if ! hermes_cli_exists; then
    warn "companion: no 'hermes' CLI on PATH for user ${HERMES_USER}; set the platform hint manually:"
    manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set --force ${PLATFORM_HINT_KEY} '<hint text>'"
    return 1
  fi
  if [[ ! -s $hintfile ]]; then
    warn "companion: ${profile}: ${ALADO_HINT_FILE} missing/empty at ${hintfile} — set ${PLATFORM_HINT_KEY} manually:"
    manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set --force ${PLATFORM_HINT_KEY} '<hint text>'"
    return 1
  fi
  want=$(cat "$hintfile")
  current=$(hermes_config_get_p "$profile" "$PLATFORM_HINT_KEY")
  if [[ $current == "$want" ]]; then
    info "companion: ${profile}: ${PLATFORM_HINT_KEY} already set"
    return 0
  fi
  if (( DRY )); then
    run_hermes hermes -p "$profile" config set --force "$PLATFORM_HINT_KEY" "$want"
    return 0
  fi
  if run_hermes hermes -p "$profile" config set --force "$PLATFORM_HINT_KEY" "$want" >/dev/null 2>&1; then
    info "companion: ${profile}: ${PLATFORM_HINT_KEY} set (--force)"
    return 0
  fi
  warn "companion: ${profile}: 'hermes -p ${profile} config set --force ${PLATFORM_HINT_KEY}' failed"
  manual "runuser -u ${HERMES_USER} -- hermes -p ${profile} config set --force ${PLATFORM_HINT_KEY} '${want}'"
  return 1
}

# Removes the legacy marked alado block from <profile>'s SOUL.md (cleanup only —
# never adds it again; text outside the markers is never touched). 0 = clean/absent.
companion_cleanup_soul() {
  local profile=$1 soul
  (( CHECK )) && return 0
  soul=$(soul_file_for "$profile")
  [[ -f $soul ]] || return 0
  if strip_marked_block "$soul" "$SOUL_BLOCK_BEGIN" "$SOUL_BLOCK_END"; then
    cmd chown "$HERMES_USER:" "$soul"
    info "companion: ${profile}: removed the legacy marked alado block from ${soul}"
  else
    info "companion: ${profile}: no marked alado block in ${soul}"
  fi
  return 0
}

mod_companion() {
  if (( CHECK )); then
    check_companion
    return
  fi

  local skill_src_dir="$SKILLS_SRC/$ALADO_SKILL_DIR_NAME"
  local skill_dir="$ALADO_SKILLS_DIR/$ALADO_SKILL_DIR_NAME"

  if ! skill_source_valid; then
    set_status companion fail "no alado-companion skill source at ${SKILLS_SRC} (SKILL.md + ${ALADO_HINT_FILE} required)"
    manual "copy skills/alado-companion from the repo to the VPS and pass --skills-src <path>"
    M_DETAIL[companion]=$(cat <<EOF
"installed":$([[ -f $skill_dir/SKILL.md && -s $skill_dir/$ALADO_HINT_FILE ]] && echo true || echo false),"skill_dir":$(printf '%s' "$skill_dir" | json_escape | sed 's/^/"/;s/$/"/'),"source":$(printf '%s' "$SKILLS_SRC" | json_escape | sed 's/^/"/;s/$/"/'),"profiles":[]
EOF
    )
    M_DETAIL[companion]=$(printf '%s' "${M_DETAIL[companion]}" | tr -d '\n\t')
    return
  fi

  # 1. Copy the skill dir to ~/.hermes/alado-skills/ (hermes-owned; stage/swap so a
  # failed copy never leaves a half skill).
  if tree_matches "$skill_src_dir" "$skill_dir"; then
    info "companion: skill already up to date at ${skill_dir}"
  else
    cmd mkdir -p "$ALADO_SKILLS_DIR"
    cmd rm -rf "$skill_dir.droidbot-stage"
    if ! cmd cp -r "$skill_src_dir" "$skill_dir.droidbot-stage"; then
      set_status companion fail "could not copy the skill source to ${skill_dir}"
      manual "cp -r '${skill_src_dir}' '${ALADO_SKILLS_DIR}/${ALADO_SKILL_DIR_NAME}'"
      M_DETAIL[companion]="\"installed\":false,\"skill_dir\":$(printf '%s' "$skill_dir" | json_escape | sed 's/^/"/;s/$/"/'),\"source\":$(printf '%s' "$SKILLS_SRC" | json_escape | sed 's/^/"/;s/$/"/'),\"profiles\":[]"
      return
    fi
    cmd chown -R "$HERMES_USER:" "$skill_dir.droidbot-stage"
    cmd rm -rf "$skill_dir"
    cmd mv "$skill_dir.droidbot-stage" "$skill_dir"
    info "companion: skill copied to ${skill_dir}"
  fi
  cmd chown "$HERMES_USER:" "$ALADO_SKILLS_DIR"

  # 2/3/4. Every profile: merge external_dirs, set the platform hint (--force,
  # top-level) and remove the legacy marked SOUL block (cleanup only).
  collect_profiles
  local p hintfile="$skill_dir/$ALADO_HINT_FILE"
  if (( DRY )) && [[ ! -s $hintfile ]]; then
    hintfile="$skill_src_dir/$ALADO_HINT_FILE" # rehearsal prints the real value
  fi
  for p in "${PROFILES[@]}"; do
    companion_ensure_dirs "$p" || true
    companion_ensure_hint "$p" "$hintfile" || true
    companion_cleanup_soul "$p"
  done

  companion_profiles_json "$hintfile"
  local installed=false
  [[ -f $skill_dir/SKILL.md && -s $skill_dir/$ALADO_HINT_FILE ]] && installed=true

  M_DETAIL[companion]=$(cat <<EOF
"installed":${installed},"skill_dir":$(printf '%s' "$skill_dir" | json_escape | sed 's/^/"/;s/$/"/'),"source":$(printf '%s' "$SKILLS_SRC" | json_escape | sed 's/^/"/;s/$/"/'),"profiles":[${COMP_PROFILES_JSON}]
EOF
  )
  M_DETAIL[companion]=$(printf '%s' "${M_DETAIL[companion]}" | tr -d '\n\t')

  if (( DRY )); then
    set_status companion ok "(rehearsal) skill copied, external_dirs merged, platform hint set and marked SOUL block removed per profile"
    return
  fi
  if ((${#MISSING_DIRS[@]} > 0 || ${#HINT_MISSING[@]} > 0 || ${#SOUL_LEFTOVER[@]} > 0)); then
    set_status companion fail "external_dirs missing in ${#MISSING_DIRS[@]} profile(s) (${MISSING_DIRS[*]}); platform hint missing/different in ${#HINT_MISSING[@]} profile(s) (${HINT_MISSING[*]}); marked SOUL block left in ${#SOUL_LEFTOVER[@]} profile(s) (${SOUL_LEFTOVER[*]})"
    return
  fi
  set_status companion ok "skill installed; ${#PROFILES[@]} profile(s) wired (external_dirs + platform hint; marked SOUL block removed)"
}

check_companion() {
  local skill_dir="$ALADO_SKILLS_DIR/$ALADO_SKILL_DIR_NAME"
  local hintfile="$skill_dir/$ALADO_HINT_FILE"
  local installed=false
  [[ -f $skill_dir/SKILL.md && -s $skill_dir/$ALADO_HINT_FILE ]] && installed=true

  collect_profiles

  companion_profiles_json "$hintfile"

  M_DETAIL[companion]=$(cat <<EOF
"installed":${installed},"skill_dir":$(printf '%s' "$skill_dir" | json_escape | sed 's/^/"/;s/$/"/'),"source":$(printf '%s' "$SKILLS_SRC" | json_escape | sed 's/^/"/;s/$/"/'),"profiles":[${COMP_PROFILES_JSON}]
EOF
  )
  M_DETAIL[companion]=$(printf '%s' "${M_DETAIL[companion]}" | tr -d '\n\t')

  if ! $installed; then
    set_status companion unknown "skill not installed at ${skill_dir} — apply the companion module"
    manual "sudo bash prepare.sh companion --skills-src <path-to-skills>"
    return
  fi
  if ((${#MISSING_DIRS[@]} == 0 && ${#HINT_MISSING[@]} == 0 && ${#SOUL_LEFTOVER[@]} == 0)); then
    set_status companion ok "skill installed; all ${#PROFILES[@]} profile(s) wired (external_dirs + platform hint; no marked SOUL block)"
    return
  fi
  set_status companion fail "external_dirs missing in ${#MISSING_DIRS[@]} profile(s) (${MISSING_DIRS[*]}); platform hint missing/different in ${#HINT_MISSING[@]} profile(s) (${HINT_MISSING[*]}); marked SOUL block left in ${#SOUL_LEFTOVER[@]} profile(s) (${SOUL_LEFTOVER[*]})"
  manual "sudo bash prepare.sh companion"
}

# --- Output --------------------------------------------------------------------------
print_summary() {
  printf '\n== Summary ==\n'
  printf '%-10s %-8s %s\n' 'MODULE' 'STATUS' 'DETAIL'
  printf '%-10s %-8s %s\n' '--------' '--------' '--------'
  local m
  for m in "${MODULES[@]}"; do
    if [[ -n ${M_STATUS[$m]:-} ]]; then
      printf '%-10s %-8s %s\n' "$m" "${M_STATUS[$m]}" "${M_NOTE[$m]}"
    else
      printf '%-10s %-8s %s\n' "$m" "skip" "(not selected)"
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
  "access_mode": "$(printf '%s' "$ACCESS_MODE" | json_escape)",
  "domain": "$(printf '%s' "${DOMAIN:-}" | json_escape)",
  "modules": {
    ${modules_json}
  }
}
EOF
}

usage() {
  cat <<EOF
Usage: prepare.sh [flags] [module...]

Modules: browser botdesktop access caddy droidbot push companion  (or --all)

Flags:
  --check                Diagnostics only (changes nothing). Exit 0 = all OK, 1 = problems.
  --json                 Emit the diagnostics as JSON (requires --check).
  --all                  Apply all modules.
  --dry-run              Print the commands it would run, without running them.
  --hermes-user <user>   Owner of ~/.hermes (default: auto-detection, fallback 'hermes').
  --domain <host>        Public domain (access/caddy site blocks + verifications).
  --access <mode>        HTTPS without your own domain: 'sslip' (default without --domain)
                         or 'tailscale'. Ignored when --domain is given.
  --dist <path|url>      PWA tar.gz for the droidbot module.
  --plugin-src <path>    droidbot-push plugin source folder for the push module
                         (default: hermes-plugin/droidbot_push next to this script).
  --skills-src <path>    alado-companion skill source folder for the companion module
                         (default: skills/ next to this script).
  -h, --help             This help.

Examples:
  prepare.sh --all --domain droidbot.gabrielurrutia.com.ar --dist ./dist.tar.gz
  prepare.sh --all --access sslip      # <public-ip>.sslip.io + Caddy cert
  prepare.sh --all --access tailscale  # https://<machine>.<tailnet>.ts.net
  prepare.sh push                      # plugin from hermes-plugin/droidbot_push
  prepare.sh companion                 # skill from skills/ next to this script
  prepare.sh --check --json
  prepare.sh --check browser botdesktop
EOF
}

# --- Main -----------------------------------------------------------------------------
main() {
  local opts
  opts=$(getopt -o h -l check,json,all,dry-run,hermes-user:,domain:,dist:,access:,plugin-src:,skills-src:,help -- "$@") \
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
      --access) ARG_ACCESS=$2; shift 2 ;;
      --plugin-src) ARG_PLUGIN_SRC=$2; shift 2 ;;
      --skills-src) ARG_SKILLS_SRC=$2; shift 2 ;;
      -h | --help) usage; exit 0 ;;
      --) shift; break ;;
    esac
  done

  if [[ $EUID -ne 0 ]]; then
    die 2 "this script must run as root (use sudo)"
  fi

  case "${ARG_ACCESS:-}" in
    "" | sslip | tailscale) ;;
    *) die 2 "invalid --access value: ${ARG_ACCESS} (valid: sslip, tailscale)" ;;
  esac

  SYSTEMD_AVAILABLE=0
  if command -v systemctl >/dev/null 2>&1; then
    SYSTEMD_AVAILABLE=1
  fi
  (( CHECK || SYSTEMD_AVAILABLE )) || die 2 "systemd is required (this script manages systemd units)"

  [[ $JSON_OUT -eq 1 && $CHECK -eq 0 ]] && die 2 "--json requires --check"

  local requested=() m
  if (( ALL )); then
    requested=("${MODULES[@]}")
  else
    for m in "$@"; do
      local known=0 mod
      for mod in "${MODULES[@]}"; do
        [[ $m == "$mod" ]] && known=1
      done
      (( known )) || die 2 "unknown module: $m (valid: ${MODULES[*]})"
      requested+=("$m")
    done
    if (( CHECK )); then
      ((${#requested[@]} > 0)) || requested=("${MODULES[@]}")
    else
      ((${#requested[@]} > 0)) || { usage; die 2 "specify modules or --all"; }
    fi
  fi

  detect_distro
  set_browser_packages
  set_botdesktop_packages
  resolve_hermes_user
  ALADO_SKILLS_DIR="$HERMES_HOME/alado-skills"
  find_chrome || true
  find_cua_driver || true
  detect_hermes_units
  find_caddy
  resolve_plugin_src
  resolve_skills_src
  find_hermes_python || true

  local needs_access=0
  local m
  for m in "${requested[@]}"; do
    [[ $m == "access" ]] && needs_access=1
  done
  resolve_access "$needs_access"
  if [[ -n $DOMAIN ]]; then
    info "domain: ${DOMAIN} (access mode: ${ACCESS_MODE})"
  else
    info "access mode: ${ACCESS_MODE} (no domain resolved)"
  fi

  if (( CHECK )); then
    info "diagnostics mode (--check): nothing is modified"
  elif (( DRY )); then
    info "rehearsal mode (--dry-run): nothing is executed"
  fi

  for m in "${requested[@]}"; do
    info "── module: ${m} ──"
    case "$m" in
      browser) mod_browser ;;
      botdesktop) mod_botdesktop ;;
      access) mod_access ;;
      caddy) mod_caddy ;;
      droidbot) mod_droidbot ;;
      push) mod_push ;;
      companion) mod_companion ;;
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
