# Provisioner — Hermes DroidBot

`provisioner/prepare.sh` leaves an Ubuntu/Debian VPS ready to serve the DroidBot PWA against
Hermes: "set up basic Hermes → run one script → open the PWA → Hermes works from your phone".
That includes the `droidbot-push` Hermes plugin, so the phone also gets push notifications when
a bot finishes a turn or waits for you, and the `alado-companion` skill, so every bot knows it
is talked to from Alado (not Hermes Desktop) and stops sending the user to desktop menus that
don't exist there. The script is reviewed and run by the architect (never from the dev machine;
AGENTS.md rule 9).

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

# push notifications (droidbot-push Hermes plugin):
sudo bash prepare.sh push                                  # hermes-plugin/droidbot_push next to the script
sudo bash prepare.sh push --plugin-src ./hermes-plugin/droidbot_push

# alado-companion skill for every bot profile (they stop pointing at Hermes Desktop menus):
sudo bash prepare.sh companion                  # skills/ next to the script
sudo bash prepare.sh companion --skills-src ./skills

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
| `--all` | Apply the seven modules. |
| `--dry-run` | Print the commands it would run; verifies nothing that mutates state. |
| `--hermes-user <user>` | Owner of `~/.hermes`. Default: auto-detects via `/home/*/.hermes` (if unique) and falls back to `hermes`. |
| `--domain <host>` | Public domain (access/caddy site blocks + verifications). |
| `--access <mode>` | `sslip` or `tailscale`. Ignored when `--domain` is given. Interactive prompt when stdin is a TTY; defaults to `sslip`. |
| `--dist <path\|url>` | PWA tar.gz for `droidbot`. |
| `--plugin-src <path>` | `droidbot-push` plugin source folder for `push` (default: `hermes-plugin/droidbot_push` next to the script). |
| `--skills-src <path>` | `alado-companion` skill source folder for `companion` (default: `skills/` next to the script). |

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

### 6. push — the droidbot-push Hermes plugin (web push)

Installs the `droidbot-push` plugin (repo folder `hermes-plugin/droidbot_push`): phone push when
a bot **finishes a turn** (`on_session_end`, cron included) or **waits for you**
(`pre_approval_request`, `on_human_input_request`, `on_room_member_activity` with
`kind=request.opened`). Per-bot toggles live in the PWA; the REST surface is
`/api/plugins/droidbot-push/{vapid-public-key,subscribe,prefs,test}` with the dashboard session
auth inherited.

The module (as root; the plugin copy is chown'ed to the hermes user because the default source
may sit under `/root`, unreadable by hermes):

1. **Validates the source** from `--plugin-src` (default: the `hermes-plugin/droidbot_push`
   folder next to the script): requires `plugin.yaml` with `name: droidbot-push` and
   `__init__.py`. Missing/invalid → `fail` with the manual steps.
2. **Copies** it to `~/.hermes/plugins/droidbot_push` (stage → swap, so a failed copy never
   leaves a half plugin). Idempotent: every source file is sha256-compared against the installed
   copy; identical → "already up to date" (runtime files like `__pycache__` are ignored).
   Plugin state (VAPID key, subscriptions, prefs) lives in `plugin-data/`, never inside the
   plugin folder, so re-copies lose nothing.
3. **Installs the Python dependency** `pywebpush>=2,<3` (pinned in `plugin.yaml`
   `python_dependencies`, which the PM resolver honors) into Hermes' PM-managed Python
   (`~/.hermes/tools/python-*/bin/python` — the interpreter `hermes serve`/`gateway` run with):
   `<python> -m pip install "pywebpush>=2,<3"` as the hermes user, only when the import/version
   check fails. **Temporary path** until the plugin is published on GitHub; then this step
   becomes `hermes plugins install <git-url> --yes-deps --enable`.
4. **Enables it** with `hermes plugins enable droidbot-push` as the hermes user (idempotent:
   Hermes reports "already enabled"). The plugin declares no capabilities, so there is no
   interactive consent prompt; if the PM admission refuses (e.g. resolver conflict), the exact
   commands are printed as `[manual]`.
5. **Prints the restart command** (never restarts Hermes — it interrupts sessions): the plugin
   hooks and its dashboard routes load at process start, so `hermes-serve.service` and
   `hermes-gateway.service` (user units) must be restarted for the install to take effect.
6. **Verifies** the route is mounted with an unauthenticated probe:
   `curl http://127.0.0.1:9119/api/plugins/droidbot-push/vapid-public-key`. `401` = mounted with
   the auth gate active (the expected result on the VPS), `200` = mounted without an auth gate,
   `503` = mounted but the plugin has not initialized its VAPID key yet. Anything else (or
   connection refused) → `warn` "restart Hermes" when the install itself is complete.

In `--check` mode nothing is touched: it reports `unknown` when the plugin is not installed,
`fail` when installed-but-disabled or `pywebpush` is missing from Hermes' Python, and `warn`
when everything is in place but the routes are not mounted yet (restart pending).

### 7. companion — the alado-companion skill (teach every bot it lives in Alado)

Bots answered "go to Hermes Desktop → Bots → Screen → Take over" because the gateway tells them
they are in the TUI; Alado users have no desktop menus. The fix, verified live by the architect
on the VPS: install the `alado-companion` skill (repo folder `skills/alado-companion`) at
`~/.hermes/alado-skills/`, merge that dir into every profile's `skills.external_dirs`, and set
the TOP-LEVEL config key `platform_hints.tui.replace` per profile to the skill's one-line
`platform-hint.txt` — that is the text Hermes injects as the TUI platform hint, so the model
learns it is talked to from Alado and follows `skill_view alado-companion`. (An earlier marked
`SOUL.md` pointer approach was replaced by this config key — the module now only *removes* any
legacy block, never adds it.) New bots created from Alado use `clone_from`, which copies
`config.yaml` + `SOUL.md`, so they inherit the config automatically.

The module (as root; the skill copy is chown'ed to the hermes user because the default source
may sit under `/root`):

1. **Validates the source** from `--skills-src` (default: the `skills/` folder next to the
   script): requires `alado-companion/SKILL.md` and a non-empty `alado-companion/platform-hint.txt`.
   Missing/invalid → `fail` with the manual steps.
2. **Copies** `alado-companion` to `~/.hermes/alado-skills/alado-companion/` (stage → swap,
   so a failed copy never leaves a half skill). Idempotent: every source file is
   sha256-compared against the installed copy; identical → "already up to date".
3. **Merges `~/.hermes/alado-skills` into `skills.external_dirs` per profile** (default
   profile + every `~/.hermes/profiles/<name>/`): reads the current list with
   `hermes -p <profile> config get skills.external_dirs`, appends the entry only when absent,
   and writes with `hermes -p <profile> config set skills.external_dirs '[...]'` as the hermes
   user. Existing entries are **never dropped**; a value the script cannot parse is reported
   (`unparsable`) with a manual merge command instead of being overwritten.
4. **Sets `platform_hints.tui.replace` per profile** (TOP-LEVEL key, never under `agent:`):
   the current value is read with `hermes -p <profile> config get platform_hints.tui.replace`
   and, when it differs from `platform-hint.txt`, written with
   `hermes -p <profile> config set --force platform_hints.tui.replace <text>` as the hermes
   user (`--force` is required — the key would otherwise be rejected as unknown).
5. **Removes the legacy marked SOUL block per profile** from `~/.hermes/SOUL.md` (default) or
   `~/.hermes/profiles/<name>/SOUL.md` (others): strips anything between
   `<!-- alado:begin -->` and `<!-- alado:end -->`. Cleanup only — the block is never added
   again. Text outside the markers is never touched; a missing `SOUL.md` is left missing.
6. **Verifies** after acting: the skill files exist, and per profile `external_dirs: ok`,
   `platform_hint: ok` and `soul_block: absent` are re-read through the hermes CLI and the
   file system.

In `--check` mode nothing is touched: it reports `unknown` when the skill is not installed,
and per profile whether the `external_dirs` entry is `ok`/`missing`/`unparsable`, whether
`platform_hints.tui.replace` matches the hint file (`ok`/`missing`/`differs` — compared via
`hermes -p <profile> config get`), and whether a legacy marked SOUL block is still present
(`absent`/`leftover`) — in the note and in the JSON `profiles` array. `fail` when any profile
is not fully wired (including leftover blocks).

## Idempotency and verification

| Mechanism | Where |
|-----------|-------|
| Packages: only the missing ones are installed (`dpkg-query`); apt is idempotent | browser, botdesktop |
| Caddyfile: marked blocks (`# BEGIN/END droidbot-preparer:*`); re-upsert replaces the existing block (literal `index()` match for v1 markers, anchored regex for access sites); full-site replace sweeps stale sslip hosts after an IP change | caddy, access, cleanup |
| Legacy cleanup: every removal is guarded by existence checks; re-runs are no-ops | botdesktop |
| PWA: sha256 marker; identical redeploy = no-op | droidbot |
| Plugin: per-file sha256 compare against the installed copy; pip install only when the import/version check fails; `hermes plugins enable` is idempotent | push |
| Skill: per-file sha256 compare against the installed copy; `skills.external_dirs` merged via read-modify-write (`config get` → append only when absent → `config set`); `platform_hints.tui.replace` written with `config set --force` only when the value differs from the hint file; marked SOUL block stripped only (cleanup) | companion |
| `hermes config set` only writes when the value differs; `--check` only reads (`config get`) | access |
| `--check` never writes (guards in `upsert_marked_block`/`replace_whole_site_block`; cleanup reports only) | global |
| Real verification after acting; exact `[manual]` on failure | all modules |

Per-module verification: `ldd` 0 "not found" + `--dump-dom` (browser); every `REQUIRED_BINARIES`
on PATH (botdesktop); site block present + `dashboard.public_url` + auth check + local probe
(access); `caddy validate` + real headers (caddy); `index.html`+`sw.js`+sha (droidbot); plugin
installed + enabled + `pywebpush` importable + unauth probe of `/api/plugins/droidbot-push/
vapid-public-key` → 401 (push); skill files present + per-profile `external_dirs`,
`platform_hints.tui.replace` and SOUL block absence re-read after acting (companion).

## JSON schema of `--check --json`

`"schema": 2` — the PWA "Health" screen consumes this document. Exit code: 0 when
`ok == true`, 1 otherwise.

```json
{
  "schema": 2,
  "version": "2.3.0",
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
    },
    "push": {
      "status": "ok",
      "installed": true,
      "enabled": true,
      "source": null,
      "python": "/home/hermes/.hermes/tools/python-3.14.9+20261021-linux-x64/bin/python3",
      "pywebpush_ok": true,
      "route_mounted": true,
      "probe": "401"
    },
    "companion": {
      "status": "ok",
      "installed": true,
      "skill_dir": "/home/hermes/.hermes/alado-skills/alado-companion",
      "source": "/root/Hermes-Droidbot/skills",
      "profiles": [
        { "name": "default", "soul": "/home/hermes/.hermes/SOUL.md",
          "external_dirs": "ok", "platform_hint": "ok", "soul_block": "absent" },
        { "name": "marta", "soul": "/home/hermes/.hermes/profiles/marta/SOUL.md",
          "external_dirs": "ok", "platform_hint": "ok", "soul_block": "absent" }
      ]
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
- `push.probe`: the HTTP code of the unauthenticated `vapid-public-key` GET (`401` expected with
  the auth gate, `200` without one, `503` when the plugin has not initialized its VAPID key);
  `null` when Hermes is unreachable or the probe was skipped. `push.source` is the resolved
  `--plugin-src` in apply mode and `null` in `--check`.
- `companion.profiles[]`: one entry per profile (the default profile plus every
  `~/.hermes/profiles/<name>/`), with the profile's `SOUL.md` path and three states:
  `external_dirs` (`ok` | `missing` | `unparsable` — the stored list is read through
  `hermes -p <profile> config get`), `platform_hint` (`ok` | `missing` | `differs` — the
  stored `platform_hints.tui.replace` compared against the skill's `platform-hint.txt` via
  `hermes -p <profile> config get`) and `soul_block` (`absent` | `leftover` — a legacy marked
  alado block still present in `SOUL.md`). The module status is `ok` only when every profile
  is fully wired; `companion.source` is the resolved `--skills-src`.
- Nullable everywhere: `chrome`, `cua_driver`, `dist_sha256`, `up_to_date`,
  `ldd_not_found`/`dump_dom`, `caddy_version`, `sw_cache_header`/`assets_cache_header`,
  `probe_root`, access fields, `push.python`/`push.probe`/`push.source`.
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
- `~/.hermes/plugins/droidbot_push` (the plugin, hermes-owned) and
  `~/.hermes/tools/python-*/lib/.../site-packages` (pywebpush pip-installed into Hermes'
  PM-managed Python); `hermes plugins enable droidbot-push` writes `plugins.enabled` and syncs
  the PM environment. The Hermes restart is printed, never run.
- `~/.hermes/alado-skills/alado-companion/` (the skill, hermes-owned) and, per profile,
  `skills.external_dirs` in `config.yaml` (via `hermes -p <profile> config set`, merged — never
  overwritten) and `platform_hints.tui.replace` (TOP-LEVEL key, via
  `hermes -p <profile> config set --force`). The legacy marked alado block is removed from
  `SOUL.md` (`~/.hermes/SOUL.md` and `~/.hermes/profiles/<name>/SOUL.md`) — cleanup only.

Nothing else inside `~/.hermes/` is touched; no Hermes file is edited by hand.

## Risks and open questions

- **Restart of the Hermes units**: `dashboard.public_url`, the removed DISPLAY drop-ins and the
  enabled plugin (hooks + dashboard routes) are snapshots read at process start, so all three
  changes only take effect after restarting `hermes-serve.service`/`hermes-gateway.service`.
  The script never restarts Hermes (it interrupts sessions); it prints the exact command.
  Decision for the architect: restart now or in a maintenance window.
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
- **push install path is temporary**: until `droidbot-push` is published on GitHub, the preparer
  copies the folder and pip-installs `pywebpush>=2,<3` into Hermes' PM-managed Python (validated
  on the VPS during phase 8). Once published, this step should become
  `hermes plugins install <git-url> --yes-deps --enable` so the PM owns the dependency
  (Hermes' `doctor` may keep warning about the pip-installed dep until then).
- **push enable admission**: `hermes plugins enable` syncs the PM environment and may refuse
  non-interactively (e.g. a resolver conflict); the module then prints the exact commands as
  `[manual]`. The plugin declares no capabilities, so no interactive consent prompt is expected.
- **push probe semantics**: `401` means the auth gate is engaged (expected on the VPS); `200`
  means Hermes is reachable without a gate; a not-yet-restarted server yields `404`/refused →
  the module reports `warn` with the restart hint.
- **Ports 8081** (tailscale catch-all): fixed. If there is a conflict on the VPS, edit the
  constant in the script.
- **companion: `skills.external_dirs` value format**: the merge expects the CLI to echo a
  flow-style list (`['/a', '/b']` or `["/a", "/b"]`) or a bare single path. Anything else is
  reported `unparsable` and the module refuses to overwrite it (a manual merge command is
  printed), so user entries are never lost even if Hermes changes the output format.
- **companion: profile addressing**: profiles are wired with `hermes -p <profile>` where the
  default profile is addressed as `-p default` and the others by their `~/.hermes/profiles/`
  directory name — the exact invocation the architect verified live on the VPS. If a profile
  directory exists but has no CLI-accessible config, `config get` reads empty and `config set`
  creates it.
- **companion: `platform_hints.tui.replace` is TOP-LEVEL and needs `--force`**: the key must be
  written at the top level (never under `agent:`) and `hermes config set` rejects unknown keys
  without `--force` — the module always passes `--force` and the architect verified the exact
  invocation live on the VPS. The value is compared against `platform-hint.txt` on every run;
  a manual edit of the config will be reverted to the file's content on the next apply.
- **companion: `platform_hints.tui.replace` output format**: `config get` must echo the raw
  value (one line). A multi-line or quoted-by-the-CLI echo would report `differs` and the
  module would rewrite the same value (idempotent, but noisy) — re-check on the next VPS run.
- **companion: config pick-up timing**: `skills.external_dirs` and
  `platform_hints.tui.replace` are read by the gateway per bot session; no Hermes restart is
  printed (the live fix applied by hand took effect for new sessions). If a running session
  still mentions the TUI, start a new one. The legacy marked SOUL block is inert once removed.
- **companion: `-p default` vs plain `hermes config`**: the module always uses the explicit
  `-p <profile>` form; if the default profile's config lives elsewhere on an older Hermes, the
  `config get` reads empty and the module reports it — re-check on the next VPS run.

## Verification of this script (AGENTS.md rule 7)

Never run against the VPS (rule 9). Validated on the dev machine: `bash -n` (syntax),
`shellcheck -S warning` (0 findings), unit tests of the pure functions (marked-block
upsert/strip idempotency, access/tailscale templates, JSON escaping, no mutation in `--check`,
`resolve_domain_auto`, `access_site_present`), and functional tests of the companion module
against a fake `hermes` CLI and a fake `~/.hermes` tree (apply/check/dry-run, idempotency,
`external_dirs` merge never drops entries, `platform_hints.tui.replace` set with `--force` and
compared on `--check`, legacy SOUL block removed without touching outside text), plus the JSON
emitted by `emit_json` parsed with `python -m json.tool` in three scenarios (sslip, tailscale
with empty units, empty module detail). The real run against the VPS is done by the architect,
first with `--check` and `--dry-run`.
