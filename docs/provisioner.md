# Provisioner — Hermes DroidBot

`provisioner/prepare.sh` deja un VPS Ubuntu/Debian listo para servir la PWA DroidBot contra
Hermes: "configurá lo básico de Hermes → corré un script → abrí la PWA → Hermes funciona desde
tu teléfono". El script lo revisa y lo ejecuta el arquitecto (nunca desde la máquina de
desarrollo; regla 9 de AGENTS.md).

Fuente de verdad de Hermes: checkout `.hermes-ref` pinneado a `bf0203a`. El script asume el
estado del VPS de referencia: Ubuntu 24.04, Hermes instalado para el usuario `hermes`
(`/home/hermes/.hermes`), `hermes serve --host 0.0.0.0 --port 9119` + `hermes gateway run`
(systemd), Caddy con el sitio `droidbot.gabrielurrutia.com.ar`, Cloudflare adelante.

## Uso

```bash
# todo junto (curl | sudo):
curl -fsSL .../provisioner/prepare.sh | sudo bash -s -- --all --domain droidbot.gabrielurrutia.com.ar

# deploy/actualización de la PWA incluida:
sudo bash prepare.sh --all --domain <host> --dist ./dist.tar.gz
sudo bash prepare.sh droidbot --dist https://<url>/dist.tar.gz

# diagnóstico (no cambia nada):
sudo bash prepare.sh --check                 # exit 0 = todo OK, 1 = hay problemas
sudo bash prepare.sh --check --json          # esquema abajo (la pantalla "Salud" lo consume)
sudo bash prepare.sh --check browser computer

# ensayo (imprime comandos, no ejecuta nada):
sudo bash prepare.sh --dry-run --all --domain <host>
```

Requisitos del script: bash, `set -euo pipefail`, corre como root, systemd, Debian/Ubuntu
(detecta distro y usa nombres de paquetes correctos; error claro en otras). Todo módulo sigue
**detectar → actuar → verificar**, y ante cualquier fallo imprime el comando manual exacto
(`[manual] ...`).

## Flags

| Flag | Efecto |
|------|--------|
| `--check` | Solo diagnóstico. Exit 0 = OK, 1 = `fail`/`unknown` en algún módulo. No escribe nada. |
| `--json` | Emite el diagnóstico como JSON (requiere `--check`). |
| `--all` | Aplica los cinco módulos. |
| `--dry-run` | Imprime los comandos que ejecutaría; verifica nada que muta estado. |
| `--hermes-user <user>` | Usuario dueño de `~/.hermes`. Default: autodetecta por `/home/*/.hermes` (si es único) y cae a `hermes`. |
| `--domain <host>` | Dominio público. Requerido para `caddy`/`takeover` (o autodetectado si el Caddyfile tiene un único bloque site). |
| `--dist <ruta\|url>` | Tar.gz de la PWA para `droidbot`. |

## Módulos y cambios al sistema

### 1. browser — librerías del Chromium de Hermes

Hermes administra su propio Chromium vía PM en `~/.hermes/tools/chromium-*/chrome-linux{64}/chrome`
(`pm/packages.py`, `tools/browser_tool_install.py`), pero las librerías del sistema son
responsabilidad del host (el incidente real del VPS: faltaba `libasound.so.2`).

- **Instala** (apt) la lista derivada de `playwright install-deps chromium`
  (`packages/playwright-core/src/server/registry/nativeDeps.ts`):
  - Ubuntu 24.04+/Debian 13+ (nombres t64): `libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64
    libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4
    libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3
    libxkbcommon0 libxrandr2`
  - Ubuntu 22.04/Debian 12 (nombres históricos): los mismos sin sufijo t64 (+ `libwayland-client0`).
  - Fuentes y herramientas Playwright: `fonts-noto-color-emoji fonts-unifont libfontconfig1
    libfreetype6 xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic
    fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf xvfb`.
- **Verifica**: `ldd <chrome>` con 0 líneas `not found`, y un `--headless=new --dump-dom
  about:blank` ejecutado como el usuario Hermes (profile temporal, `--no-sandbox` solo para la
  prueba). Si no hay Chromium instalado todavía, reporta `warn` con el comando:
  `runuser -u <usuario> -- hermes tools post-setup agent_browser`.

### 2. computer — display virtual para computer use

cua-driver necesita un display; el gateway se lo hereda vía `DISPLAY`.

- **Instala** (apt): `xvfb openbox x11-utils`.
- **Crea** la unidad `/etc/systemd/system/droidbot-display.service` (de DroidBot, no de Hermes):
  `User=<usuario>`, `Environment=DISPLAY=:99`, `Environment=XAUTHORITY=<home>/.hermes/droidbot-xauthority`,
  `ExecStart` = `Xvfb :99 -screen 0 1440x900x24 -nolisten tcp -auth $XAUTHORITY` en segundo plano
  + `exec openbox`; `Restart=on-failure`, `WantedBy=multi-user.target`.
- **Crea** `/etc/hermes/droidbot-display.env` con `DISPLAY=:99` y `XAUTHORITY=...`.
- **Crea drop-ins** `<unit>.d/droidbot-display.conf` con
  `[Service]` + `EnvironmentFile=/etc/hermes/droidbot-display.env` para **cada unidad de Hermes
  detectada** (`/etc/systemd/system/hermes-*.service` y `~/.config/systemd/user/hermes-*.service`).
  No se edita ningún archivo de Hermes.
  - **Por qué `EnvironmentFile` y no `Environment=DISPLAY=:99`**: para las listas (como
    `Environment=`), un drop-in **reemplaza la lista completa** de la unidad. Un drop-in con
    `Environment=DISPLAY=:99` borraría `HOME`/`USER`/`PATH`/`HERMES_HOME` del
    `hermes-gateway.service` generado por Hermes (`generate_systemd_unit` en `hermes_cli/gateway.py`)
    y rompería el gateway. `EnvironmentFile` agrega variables sin tocar las existentes, y además
    tiene precedencia sobre `Environment=` de la unidad (systemd.exec(5)).
- **Verifica**: unidad `active`, socket `/tmp/.X11-unix/X99`, `xdpyinfo` como el usuario Hermes, y
  `cua-driver doctor --json` (si el binario existe en `~/.hermes/tools/cua-driver-*`) reportando
  `ok: true`.
- **No reinicia las unidades de Hermes**: imprime el comando exacto (`systemctl restart
  hermes-gateway.service ...`). El reinicio lo decide el arquitecto.

### 3. takeover — vista en vivo y control remoto

- **Instala** (apt): `x11vnc websockify novnc curl`.
- **Crea** `/etc/hermes/droidbot-vnc.passwd` con una contraseña VNC aleatoria (openssl), permisos
  `0600 root:root`, generada una sola vez.
- **Crea** `/etc/systemd/system/droidbot-vnc.service`: `x11vnc -display :99 -auth <cookie>
  -rfbauth <passwd> -localhost -forever -shared -rfbport 5900 -ncache 0` (corre como root para leer
  la contraseña root-only; solo escucha en loopback).
- **Crea** `/etc/systemd/system/droidbot-novnc.service`: `websockify 127.0.0.1:6080
  --web=/usr/share/novnc/ 127.0.0.1:5900` (corre como el usuario Hermes; solo loopback).
- **Agrega al Caddyfile** (bloque marcado dentro del sitio) la ruta protegida:
  ```caddyfile
  handle /desktop/* {
      forward_auth 127.0.0.1:9119 {
          uri /api/auth/me
      }
      uri strip_prefix /desktop
      reverse_proxy 127.0.0.1:6080
  }
  ```
  `/api/auth/me` devuelve 401 sin sesión verificada (`hermes_cli/dashboard_auth/routes.py`), así
  que solo una sesión Hermes autenticada puede abrir `/desktop/`. Los puertos VNC **nunca** se
  exponen públicamente: `-localhost` + websockify en loopback + Caddy como único ingreso.
- **Verifica**: puertos 5900/6080 escuchando solo en `127.0.0.1` (`ss -ltn`), contraseña 0600
  root, y un GET no autenticado a `/desktop/` responde **401/302** (200 = fallo crítico).
- **Nota**: `forward_auth` existe desde Caddy 2.8. El script reporta la versión de Caddy en el
  JSON; con Caddy < 2.8 la validación falla y hay que actualizar Caddy
  (repo oficial: https://caddyserver.com/docs/install#debian-ubuntu-raspbian).

### 4. caddy — cache headers de la PWA

- **Agrega al Caddyfile** (bloque marcado, dentro del sitio):
  ```caddyfile
  @pwa-nocache { path /sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js }
  header @pwa-nocache Cache-Control "no-cache, no-store, must-revalidate"
  @assets-immutable { path /assets/* }
  header @assets-immutable Cache-Control "public, max-age=31536000, immutable"
  ```
- **Respalda** el Caddyfile (`Caddyfile.bak.droidbot.<epoch>`) antes de editar, **valida**
  (`caddy validate --config ... --adapter caddyfile`) antes de recargar, y recarga con
  `systemctl reload caddy`.
- **Verifica**: validación OK y headers reales vía `curl -sSI` contra el sitio (best-effort: si el
  sitio no responde localmente, el estado es `warn` con el curl manual).

### 5. droidbot — deploy atómico de la PWA

- **Descarga/lee** el tar.gz de `--dist`, calcula su sha256 y lo compara contra
  `/var/lib/droidbot/dist.sha256`; si coincide, no hace nada ("ya está al día").
- **Extrae** a `/var/www/droidbot.stage.<pid>`, promueve el subdirectorio raíz si el tar trae uno,
  y exige `index.html` en la raíz.
- **Swap atómico**: `rm -rf droidbot.prev` → `mv droidbot droidbot.prev` → `mv stage droidbot` →
  escribe el marcador sha256. La versión anterior queda siempre en `/var/www/droidbot.prev`.
- **Verifica**: `index.html` + `sw.js` presentes.

## Idempotencia y verificación

| Mecanismo | Dónde |
|-----------|-------|
| Paquetes: se instalan solo los que faltan (`dpkg-query`), apt es idempotente | browser, computer, takeover |
| Archivos (units, env, drop-ins): se escriben solo si el contenido difiere (`write_file_if_changed`, comparación byte a byte) | computer, takeover |
| Caddyfile: bloques marcados (`# BEGIN/END droidbot-preparer:*`); re-upsert reemplaza el bloque existente (coincidencia literal `index()`, no regex) | caddy, takeover |
| PWA: marcador sha256; redeploy idéntico = no-op | droidbot |
| Contraseña VNC: se genera una sola vez; se repara si los permisos difieren | takeover |
| `--check` no escribe jamás (guard en `write_file_if_changed` y `upsert_marked_block`) | global |
| Verificación real después de actuar; `[manual]` exacto ante fallo | todos los módulos |

Verificaciones por módulo: `ldd` 0 "not found" + `--dump-dom` (browser); unidad activa + socket X
+ `xdpyinfo` + `cua-driver doctor --json` (computer); puertos loopback + 401 de `/desktop/`
(takeover); `caddy validate` + headers por HTTP (caddy); `index.html`+`sw.js`+sha (droidbot).

## Esquema JSON de `--check --json`

`"schema": 1` — la pantalla "Salud" de la PWA consume este documento. Exit code: 0 si
`ok == true`, 1 si no.

```json
{
  "schema": 1,
  "version": "1.0.0",
  "mode": "check",
  "ok": true,
  "generated_at": "2026-10-25T00:00:00Z",
  "host": {
    "distro": "ubuntu",
    "version_id": "24.04",
    "codename": "noble",
    "systemd": 1,
    "caddy_binary": "/usr/bin/caddy",
    "caddy_version": "v2.9.1"
  },
  "hermes": {
    "user": "hermes",
    "home_dir": "/home/hermes",
    "hermes_home": "/home/hermes/.hermes",
    "units": [
      { "name": "hermes-gateway.service", "scope": "system",
        "dropin": "/etc/systemd/system/hermes-gateway.service.d/droidbot-display.conf" }
    ]
  },
  "modules": {
    "browser": {
      "status": "ok",
      "chrome": "/home/hermes/.hermes/tools/chromium-1208/chrome-linux/chrome",
      "missing_packages": [],
      "ldd_not_found": 0,
      "dump_dom": "ok"
    },
    "computer": {
      "status": "ok",
      "display_unit": "droidbot-display.service",
      "unit_active": true,
      "x_socket": true,
      "xdpyinfo": true,
      "cua_driver": { "path": "/home/hermes/.hermes/tools/cua-driver-0.5.8/cua-driver",
                      "doctor_ok": true },
      "dropins": 0,
      "restart_needed": ["hermes-gateway.service"]
    },
    "takeover": {
      "status": "ok",
      "vnc_listening": true,
      "novnc_listening": true,
      "password_file": "/etc/hermes/droidbot-vnc.passwd",
      "password_ok": true,
      "desktop_probe": "401",
      "caddy_route": true,
      "caddy_version": "v2.9.1"
    },
    "caddy": {
      "status": "ok",
      "site_found": true,
      "cache_block": true,
      "validate": true,
      "caddy_version": "v2.9.1",
      "sw_cache_header": "no-cache, no-store, must-revalidate",
      "assets_cache_header": "public, max-age=31536000, immutable"
    },
    "droidbot": {
      "status": "ok",
      "installed": true,
      "dist_sha256": "ab12...",
      "up_to_date": true
    }
  }
}
```

- `status` por módulo: `ok` | `warn` (funciona con salvedades) | `fail` | `unknown` (no evaluable).
  `ok` y `warn` no afectan `ok`; `fail`/`unknown` → `"ok": false` y exit 1.
- `modules.*.status` **repite** el estado del módulo (redundante a propósito: la pantalla Salud
  solo recorre `modules`).
- Campos que pueden ser `null`: `chrome`, `cua_driver`, `dist_sha256`, `up_to_date`,
  `ldd_not_found`/`dump_dom` (cuando no aplican), `caddy_version` (sin Caddy),
  `sw_cache_header`/`assets_cache_header` (sitio no sondeable), `desktop_probe` (idem).
- `desktop_probe` es string (`"401"`, `"302"`, `"200"`, `"502"`, `null`…), no número.
- `hermes.units` puede ser `[]` (no se detectó ninguna unidad → computer reporta `warn`).

## Cambios al sistema (resumen)

- Paquetes apt: lista de Playwright para Chromium + `xvfb openbox x11-utils x11vnc websockify
  novnc curl` (+ `xvfb` ya incluido en la lista Playwright).
- `/etc/hermes/droidbot-display.env`, `/etc/hermes/droidbot-vnc.passwd` (0600 root), dir
  `/etc/hermes/`.
- Unidades systemd propias: `droidbot-display.service`, `droidbot-vnc.service`,
  `droidbot-novnc.service` (+ `systemctl enable --now` y `daemon-reload`).
- Drop-ins `droidbot-display.conf` en cada unidad `hermes-*.service` detectada (system y user).
- `/etc/caddy/Caddyfile`: dos bloques marcados (cache + `/desktop/*`), respaldo
  `Caddyfile.bak.droidbot.*`, `caddy validate` y reload.
- `/var/www/droidbot` (PWA), `/var/www/droidbot.prev`, `/var/lib/droidbot/dist.sha256`.
- Cookie X11: `<home>/.hermes/droidbot-xauthority` (la reescribe el display al arrancar).

Nunca se modifica nada dentro de `~/.hermes/` salvo el cookie `droidbot-xauthority`, ni ningún
archivo de Hermes.

## Riesgos y preguntas abiertas

- **Reinicio de las unidades de Hermes**: el drop-in de `DISPLAY` solo toma efecto al reiniciar
  `hermes-gateway.service` (y el `serve` si corre bajo systemd). El script no reinicia servicios
  de Hermes (interrumpe sesiones); imprime el comando. Decisión del arquitecto: reinicio inmediato
  o en ventana.
- **Caddy < 2.8**: `forward_auth` no existe; el módulo falla en la validación y hay que actualizar
  Caddy desde el repo oficial.
- **Supuestos sobre el Caddyfile**: el script inserta bloques a nivel del sitio, asumiendo
  directivas top-level (handle/reverse_proxy). Un sitio envuelto en `route { ... }` necesita
  revisión manual (los marcadores hacen el bloque fácil de mover).
- **Xvfb con `-auth`**: si el gateway arranca antes que el display, cua-driver no encontrará la
  cookie hasta el reinicio. El display está `WantedBy=multi-user.target` para mitigar el orden de
  arranque.
- **x11vnc corre como root** (para leer la contraseña root-only). Loopback-only + contraseña +
  `forward_auth` lo contienen; si se prefiere no-root, mover el archivo de contraseña a
  `0640 root:<usuario>` y correr x11vnc como `<usuario>`.
- **`--no-sandbox` en la prueba headless**: solo para el `--dump-dom` de verificación (Ubuntu 24.04
  restringe los user namespaces por AppArmor); agent-browser usa su propia política de sandbox.
- **Autodetección del dominio** sin `--domain`: solo si el Caddyfile tiene exactamente un bloque
  site a nivel columna 0; en cualquier otro caso se pide `--domain`.
- **Cloudflare**: la cache del edge puede interferir con la verificación de headers si CF cachea
  respuestas; se verifica contra el origen (`--resolve`/`Host`) y CF queda fuera del alcance del
  script.
- **Puerto 6080/5900**: fijos. Si hay conflicto en el VPS hay que editar las constantes del script.

## Verificación de este script (regla 7 de AGENTS.md)

No se ejecuta contra el VPS (regla 9). Se validó en máquina de desarrollo: `bash -n` (sintaxis),
`shellcheck 0.11.0` (0 hallazgos), y tests unitarios de las funciones puras (upsert/borrado de
bloques marcados idempotente, render de unidades, escape JSON, no-mutación en `--check`,
validez del JSON emitido). La corrida real contra el VPS la hace el arquitecto, primero con
`--check` y `--dry-run`.
