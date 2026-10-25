# Provisioner — Hermes DroidBot

`provisioner/prepare.sh` leaves an Ubuntu/Debian VPS ready to serve the DroidBot PWA against
Hermes: "set up basic Hermes → run one script → open the PWA → Hermes works from your phone".
The script is reviewed and run by the architect (never from the dev machine; AGENTS.md rule 9).

Hermes source of truth: the `.hermes-ref` checkout pinned to `bf0203a`. The script assumes the
reference VPS state: Ubuntu 24.04, Hermes installed for the `hermes` user
(`/home/hermes/.hermes`), `hermes serve --host 0.0.0.0 --port 9119` + `hermes gateway run`
running as **systemd user units** (`hermes-serve.service`, `hermes-gateway.service` under the
hermes user), Caddy with the `droidbot.gabrielurrutia.com.ar` site, Cloudflare in front of it.

## Usage

```bash
# everything in one go (curl | sudo):
curl -fsSL .../provisioner/prepare.sh | sudo bash -s -- --all --domain droidbot.gabrielurrutia.com.ar

# PWA deploy/update included:
sudo bash prepare.sh --all --domain <host> --dist ./dist.tar.gz
sudo bash prepare.sh droidbot --dist https://<url>/dist.tar.gz

# HTTPS without your own domain:
sudo bash prepare.sh --all --access sslip      # https://<public-ip>.sslip.io via Caddy
sudo bash prepare.sh --all --access tailscale  # https://<machine>.<tailnet>.ts.net

# diagnostics (changes nothing):
sudo bash prepare.sh --check                 # exit 0 = all OK, 1 = problems
sudo bash prepare.sh --check --json          # schema below (consumed by the PWA "Health" screen)
sudo bash prepare.sh --check browser botdesktop

# rehearsal (prints commands, runs nothing):
sudo bash prepare.sh --dry-run --all --domain <host>
```

Script requirements: bash, `set -euo pipefail`, runs as root, systemd, Debian/Ubuntu (the
distro is detected and the right package names are used; other distros get a clear error).
Every module follows **detect → act → verify**, and on any failure prints the exact manual
command (`[manual] ...`).

## Flags

| Flag | Effect |
|------|--------|
| `--check` | Diagnostics only. Exit 0 = OK, 1 = `fail`/`unknown` in some module. Never writes. |
| `--json` | Emit the diagnostics as JSON (requires `--check`). |
| `--all` | Apply the five modules. |
| `--dry-run` | Print the commands it would run; verifies nothing that mutates state. |
| `--hermes-user <user>` | Owner of `~/.hermes`. Default: auto-detects via `/home/*/.hermes` (if unique) and falls back to `hermes`. |
| `--domain <host>` | Public domain (access/caddy site blocks + verifications). |
| `--access <mode>` | `sslip` or `tailscale`. Ignored when `--domain` is given. Interactive prompt when stdin is a TTY; defaults to `sslip`. |
| `--dist <path\|url>` | PWA tar.gz for `droidbot`. |

## Modules and system changes

### 1. browser — system libraries for Hermes' Chromium

Hermes manages its own Chromium via PM at
`~/.hermes/tools/chromium-*/chrome-linux{64}/chrome` (`pm/packages.py`,
`tools/browser_tool_install.py`), but the host owns the system libraries (the real VPS
incident: `libasound.so.2` was missing).

- **Installs** (apt) the list derived from `playwright install-deps chromium`
  (`packages/playwright-core/src/server/registry/nativeDeps.ts`):
  - Ubuntu 24.04+/Debian 13+ (t64 names): `libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64
    libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4
    libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3
    libxkbcommon0 libxrandr2`
  - Ubuntu 22.04/Debian 12 (historical names): the same without the t64 suffix
    (+ `libwayland-client0`).
  - Playwright fonts/tools: `fonts-noto-color-emoji fonts-unifont libfontconfig1
    libfreetype6 xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic
    fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf xvfb`.
- **Verifies**: `ldd <chrome>` with 0 `not found` lines, and a headless `--dump-dom` run as the
  Hermes user — the exact command the architect confirmed working on the VPS:
  `sudo -u hermes <chrome> --headless=new --no-sandbox --disable-gpu --dump-dom "data:text/html,<p>ok</p>"`.
  Without Chromium yet it reports `warn` with `runuser -u <user> -- hermes tools post-setup
  agent_browser`.

**Why v1's verify failed on the VPS (fixed)**: v1 ran the same binary but wrapped it in
`chrome ... | grep -q '<html'` under `set -o pipefail` and added a fresh `--user-data-dir` in
`/tmp` plus `--disable-dev-shm-usage`. Three defects: (1) the pipeline race — `grep -q` exits at
its first match, Chrome keeps writing and dies with SIGPIPE (exit 141), which `pipefail` turns
into a failed check even though Chrome worked; (2) a fresh profile dir triggers first-run
initialization, which on the slow VPS exceeded the 60 s `timeout`; (3) the extra flags deviated
from the proven invocation. v2 captures the output in memory (no pipeline), uses the default
profile dir with `HOME` set, drops the extra flags, asserts on `<p>ok</p>` in the captured
output, and raises the timeout to 120 s.

### 2. botdesktop — Hermes' official Bot Desktop + legacy cleanup

Hermes ships an official Bot Desktop (`tools/bot_desktop/`): `runtime.py` runs one headless
Xfce desktop **per profile** with Xvnc on a private Unix socket; `lease.py` handles agent vs
human control; the RPC surface is `display.status|thumbnail|start|stop|observe|install|
lease.acquire|lease.release` (`tui_gateway/methods_display.py:50-247`) and the raw-RFB
WebSocket bridge `/api/display/ws` (`hermes_cli/web_routers/display.py:75`). The homemade v1
`computer`/`takeover` modules duplicated all of this and are gone.

- **Installs** (apt) exactly the packages Hermes itself would install, taken from
  `tools/bot_desktop/runtime.py` `PACKAGES["apt"]` (runtime.py:63-65 — the list
  `runtime.install_command()`, runtime.py:94, runs): `tigervnc-standalone-server xfce4-panel
  xfwm4 xfdesktop4 xfce4-settings xfce4-terminal dbus-x11 x11-xserver-utils x11-utils
  x11-xkb-utils xauth fonts-dejavu-core`. **Nothing else**: cua-driver has no additional apt
  prerequisites on Debian/Ubuntu (it drives the X display Hermes publishes per profile via
  `desktop_env`), and its binary is installed by Hermes itself (`hermes computer-use install`).
- **Verifies** every `REQUIRED_BINARIES` entry is on PATH (runtime.py:41-42): `Xvnc xfwm4
  xfce4-panel xfdesktop xfsettingsd dbus-run-session xauth xdpyinfo setxkbmap xprop`.
- **Does not start desktops**: Hermes starts them per profile via `display.start`.
- **Runs the idempotent `cleanup-legacy` step** that removes everything v1 created, printing
  each artifact and the restart command:
  - stops/disables/removes `droidbot-display.service`, `droidbot-vnc.service`,
    `droidbot-novnc.service` (+ their `multi-user.target.wants` symlinks, `reset-failed`),
  - removes `/etc/hermes/droidbot-display.env` and `/etc/hermes/droidbot-vnc.passwd` (and
    `rmdir /etc/hermes` when empty),
  - removes the `~/.hermes/droidbot-xauthority` X11 cookie,
  - removes the `droidbot-display.conf` DISPLAY drop-ins from every detected `hermes-*.service`
    unit in **both scopes** (`/etc/systemd/system/<unit>.d/` and
    `~/.config/systemd/user/<unit>.d/`),
  - strips the marked `/desktop/*` route from the Caddyfile (backup + `caddy validate` +
    reload),
  - `daemon-reload` (system and `--user`) and prints the exact restart for the Hermes units
    (e.g. `runuser -u hermes -- env XDG_RUNTIME_DIR=/run/user/<uid> systemctl --user restart
    hermes-serve.service hermes-gateway.service`).
- In `--check` mode it reports the pending artifacts without touching anything.

### 3. access — HTTPS without your own domain

Interactive when stdin is a TTY (prompts `sslip`/`tailscale`), flag-driven otherwise. Always
ends with a big "Open this on your phone: \<url\>" banner.

**`--domain <host>` (current behaviour)**: verifies the Caddy site block exists, ensures
`dashboard.public_url` equals `https://<host>`, warns when dashboard auth is missing, prints
the URL.

**`--access sslip` (default without `--domain`)**:
1. Detects the public IPv4 via `curl -s https://api.ipify.org` (fallbacks: `ifconfig.me`,
   `checkip.amazonaws.com`).
2. Derives the host `<ip-with-dashes>.sslip.io` (sslip.io resolves anything to the embedded IP).
3. Creates/updates a **marked, self-contained Caddy site block** for that host: the PWA cache
   headers inline, `handle /api/*`, `handle /auth/*`, `handle /login*` → `reverse_proxy
   127.0.0.1:9119` (WebSockets included — Caddy upgrades reverse_proxy automatically, which is
   how `/api/display/ws` reaches the Bot Desktop viewer), and the PWA root (`root *
   /var/www/droidbot`, `try_files {path} /index.html`, `file_server`) for everything else.
   Stale access sites from a changed IP are swept. Backs up the Caddyfile, validates, reloads.
4. **Lets Caddy obtain the certificate** automatically (Let's Encrypt HTTP-01 — ports 80/443
   must be reachable on the VPS).
5. **Adds the host to Hermes' trusted public hosts** the way Hermes requires: sets
   `dashboard.public_url = https://<host>` **via `hermes config set dashboard.public_url ...`
   as the hermes user** — never by hand-editing config.yaml. `dashboard.public_url` is the
   single source of truth for OAuth redirects, Host and WS-Origin validation
   (`hermes_cli/web_server_boundary.py:29`), and its hostname engages the auth gate when
   non-loopback (`web_server_boundary.py:116`). The value is snapshotted at server start
   (`hermes_cli/web_server.py:931`), so the script prints the exact restart command.
6. **Warns that auth must be configured before exposing**: with a declared public host and no
   provider, `hermes serve` **fails closed on restart** (`web_server.py:958-962`). The check
   looks for `dashboard.basic_auth.username` + password/password_hash or
   `dashboard.oauth.client_id` (`hermes config get ...`, read-only); when missing it prints the
   `hermes config set dashboard.basic_auth.*` commands.

**`--access tailscale`**:
1. If `tailscale` is missing → prints the install steps (`curl -fsSL
   https://tailscale.com/install.sh | sh` + `sudo tailscale up`) and fails.
2. If installed but not logged in → prints `sudo tailscale up` and fails.
3. Picks the proxy target: with Caddy present it ensures a **loopback-only catch-all site** on
   `http://127.0.0.1:8081` (same inline cache headers + `/api/* /auth/* /login*` → Hermes +
   PWA root) so the ts.net hostname matches regardless of the public domain sites; without
   Caddy it targets Hermes directly at `http://127.0.0.1:9119` (Hermes' own web UI, not the
   PWA — warned).
4. Runs the current Tailscale CLI syntax (v1.52+): `tailscale serve --bg --yes --https=443
   <target>` (retry without `--yes` for older CLIs).
5. Reads the device DNS name from `tailscale status --json` (`Self.DNSName`, the `*.ts.net`
   entry) and prints `https://<machine>.<tailnet>.ts.net/`.

Host/Origin note for tailscale: with `hermes serve --host 0.0.0.0` any Host header is accepted
(`web_server_boundary.py:79-103`), so no public_url change is needed; on a loopback bind the
operator must set `dashboard.public_url` to the ts.net URL. The script warns accordingly.

### 4. caddy — PWA cache headers

- **Adds to the Caddyfile** (marked block, inside the domain site):
  ```caddyfile
  @pwa-nocache { path /sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js }
  header @pwa-nocache Cache-Control "no-cache, no-store, must-revalidate"
  @assets-immutable { path /assets/* }
  header @assets-immutable Cache-Control "public, max-age=31536000, immutable"
  ```
- **Backs up** the Caddyfile (`Caddyfile.bak.droidbot.<epoch>`), **validates**
  (`caddy validate --config ... --adapter caddyfile`) and reloads with `systemctl reload caddy`.
- When the resolved host is an access-generated site (sslip host / tailscale catch-all), the
  module only verifies the site block (the headers are inline in it).
- **Verifies**: validation OK and real headers via `curl -sSI` against the site (best-effort:
  an unprobeable site yields `warn` with the manual curl).

### 5. droidbot — atomic PWA deploy

- **Downloads/reads** the tar.gz from `--dist`, hashes it and compares against
  `/var/lib/droidbot/dist.sha256`; identical → no-op ("already up to date").
- **Extracts** to `/var/www/droidbot.stage.<pid>`, promotes a single root subdirectory if the
  tar carries one, and requires `index.html` at the root.
- **Atomic swap**: `rm -rf droidbot.prev` → `mv droidbot droidbot.prev` → `mv stage droidbot` →
  writes the sha256 marker. The previous version always stays in `/var/www/droidbot.prev`.
- **Verifies**: `index.html` + `sw.js` present.

## Idempotency and verification

| Mechanism | Where |
|-----------|-------|
| Packages: only the missing ones are installed (`dpkg-query`); apt is idempotent | browser, botdesktop |
| Caddyfile: marked blocks (`# BEGIN/END droidbot-preparer:*`); re-upsert replaces the existing block (literal `index()` match for v1 markers, anchored regex for access sites); full-site replace sweeps stale sslip hosts after an IP change | caddy, access, cleanup |
| Legacy cleanup: every removal is guarded by existence checks; re-runs are no-ops | botdesktop |
| PWA: sha256 marker; identical redeploy = no-op | droidbot |
| `hermes config set` only writes when the value differs; `--check` only reads (`config get`) | access |
| `--check` never writes (guards in `upsert_marked_block`/`replace_whole_site_block`; cleanup reports only) | global |
| Real verification after acting; exact `[manual]` on failure | all modules |

Per-module verification: `ldd` 0 "not found" + `--dump-dom` (browser); every `REQUIRED_BINARIES`
on PATH (botdesktop); site block present + `dashboard.public_url` + auth check + local probe
(access); `caddy validate` + real headers (caddy); `index.html`+`sw.js`+sha (droidbot).

## JSON schema of `--check --json`

`"schema": 2` — the PWA "Health" screen consumes this document. Exit code: 0 when
`ok == true`, 1 otherwise.

```json
{
  "schema": 2,
  "version": "2.0.0",
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
      { "name": "hermes-serve.service", "scope": "user",
        "dropin": "/home/hermes/.config/systemd/user/hermes-serve.service.d/droidbot-display.conf" },
      { "name": "hermes-gateway.service", "scope": "user",
        "dropin": "/home/hermes/.config/systemd/user/hermes-gateway.service.d/droidbot-display.conf" }
    ]
  },
  "access_mode": "sslip",
  "domain": "1-2-3-4.sslip.io",
  "modules": {
    "browser": {
      "status": "ok",
      "chrome": "/home/hermes/.hermes/tools/chromium-1208/chrome-linux/chrome",
      "missing_packages": [],
      "ldd_not_found": 0,
      "dump_dom": "ok"
    },
    "botdesktop": {
      "status": "ok",
      "packages_missing": [],
      "binaries_missing": [],
      "cua_driver": "/home/hermes/.hermes/tools/cua-driver-0.5.8/cua-driver",
      "legacy_removed": 3,
      "restart_needed": ["hermes-serve.service", "hermes-gateway.service"]
    },
    "access": {
      "status": "ok",
      "mode": "sslip",
      "url": "https://1-2-3-4.sslip.io",
      "public_ip": "1.2.3.4",
      "site_found": true,
      "public_url": "https://1-2-3-4.sslip.io",
      "public_url_set": true,
      "auth_configured": true,
      "probe_root": "200",
      "tailscale": { "installed": null, "logged_in": null, "serve_active": null, "dns_name": null }
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

- `status` per module: `ok` | `warn` (works with caveats) | `fail` | `unknown` (not evaluable).
  `ok` and `warn` do not affect `ok`; `fail`/`unknown` → `"ok": false` and exit 1.
- `modules.*.status` **repeats** the module status (redundant on purpose: the Health screen
  only walks `modules`).
- `access.mode`: `domain` | `sslip` | `tailscale`. `url`, `public_ip`, `site_found`,
  `public_url`, `auth_configured`, `probe_root` and the `tailscale` sub-object may be `null`
  depending on the mode (e.g. `mode=domain` has no `public_ip`; `mode=tailscale` fills only
  the `tailscale` object).
- `browser.dump_dom_err` appears only on failure (first 300 chars of Chrome's stderr).
- `botdesktop.legacy_removed`: artifacts removed by `cleanup-legacy` (in `--check`, the count
  of artifacts pending cleanup).
- Nullable everywhere: `chrome`, `cua_driver`, `dist_sha256`, `up_to_date`,
  `ldd_not_found`/`dump_dom`, `caddy_version`, `sw_cache_header`/`assets_cache_header`,
  `probe_root`, access fields.
- `hermes.units` may be `[]` (no units detected).

## System changes (summary)

- apt packages: Playwright's Chromium list + the Bot Desktop list
  (`tools/bot_desktop/runtime.py` `PACKAGES["apt"]`) + `caddy`/`curl` for access.
- Removed (cleanup): `droidbot-display/vnc/novnc.service` units, `/etc/hermes/droidbot-*`,
  `~/.hermes/droidbot-xauthority`, `droidbot-display.conf` drop-ins (system and user scopes),
  the Caddy `/desktop/*` block.
- `/etc/caddy/Caddyfile`: the marked access site block (sslip host), the marked tailscale
  catch-all site, the marked cache block in the domain site; backup `Caddyfile.bak.droidbot.*`,
  `caddy validate` + reload.
- Hermes config (via `hermes config set` as the hermes user, never by hand):
  `dashboard.public_url` — then a restart of `hermes serve`/`gateway` is printed, never run.
- `/var/www/droidbot` (PWA), `/var/www/droidbot.prev`, `/var/lib/droidbot/dist.sha256`.
- Tailscale: `tailscale serve --bg --yes --https=443` (persists in tailscaled; nothing else).

Nothing else inside `~/.hermes/` is touched; no Hermes file is edited.

## Risks and open questions

- **Restart of the Hermes units**: `dashboard.public_url` and the removed DISPLAY drop-ins are
  snapshots read at process start, so both changes only take effect after restarting
  `hermes-serve.service`/`hermes-gateway.service`. The script never restarts Hermes (it
  interrupts sessions); it prints the exact command. Decision for the architect: restart now or
  in a maintenance window.
- **Fail-closed restart without an auth provider**: with a declared non-loopback public host
  and no provider (basic_auth/OAuth), `hermes serve` refuses to start
  (`hermes_cli/web_server.py:958-962`). The access module checks and warns, but configuring
  basic_auth is the operator's job.
- **Single `dashboard.public_url`**: the value holds exactly one host. Switching between sslip
  and tailscale overwrites it; with a 0.0.0.0 bind this is harmless (any Host is accepted), on
  a loopback bind only the configured host passes Host/Origin checks.
- **sslip.io cert issuance**: requires ports 80/443 reachable on the VPS (HTTP-01 challenge,
  direct connection — Cloudflare is not in front of the sslip host). Caddy obtains and renews
  the cert automatically.
- **sslip.io and IP changes**: a DHCP-changed public IP changes the host; the script sweeps the
  stale site block and creates the new one, but the old URL dies until re-run.
- **Caddy assumptions**: the cache block is inserted at site level, assuming top-level
  directives (handle/reverse_proxy). A site wrapped in `route { ... }` needs manual review
  (the markers make the block easy to move). v1's Caddy < 2.8 `forward_auth` constraint is
  gone (no more `/desktop/*` route).
- **Tailscale CLI syntax**: v1.52+ (`tailscale serve --bg --yes --https=443 <target>`); older
  versions get a retry without `--yes`, and the manual fallback is always printed. First use
  may require enabling HTTPS certs for the tailnet (Tailscale shows a consent page).
- **Tailscale without Caddy**: falls back to Hermes directly (Hermes' own web UI, not the PWA).
- **browser verify**: `--no-sandbox` is used only for the `--dump-dom` check (Ubuntu 24.04
  AppArmor restricts user namespaces); agent-browser uses its own sandbox policy.
- **Ports 8081** (tailscale catch-all): fixed. If there is a conflict on the VPS, edit the
  constant in the script.

## Verification of this script (AGENTS.md rule 7)

Never run against the VPS (rule 9). Validated on the dev machine: `bash -n` (syntax), unit
tests of the pure functions (marked-block upsert/strip idempotency, access/tailscale templates,
JSON escaping, no mutation in `--check`, `resolve_domain_auto`, `access_site_present`), and
the JSON emitted by `emit_json` parsed with `python -m json.tool` in three scenarios (sslip,
tailscale with empty units, empty module detail). The real run against the VPS is done by the
architect, first with `--check` and `--dry-run`.
