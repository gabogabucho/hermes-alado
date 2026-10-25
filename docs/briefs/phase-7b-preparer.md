# Phase 7b brief — Preparer v2: official Bot Desktop + access without a domain

Worktree `phase-7-preparer` (branch `phase-7-preparer`), file `provisioner/prepare.sh` (+ README,
`docs/provisioner.md`). Never SSH, never run it; the architect runs it. Keep scripts LF (there is a
`.gitattributes`). Read `repo/AGENTS.md` (Product principle). All script output and docs in **English**
(the repo is public and English-first; the PWA stays Spanish for now).

Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned `bf0203a`).

## Context — what we learned running v1 on the real VPS
- Fixed in v1 (keep): Xvfb auth cookie, x11vnc `-noshm`, LF scripts. Hermes runs as **systemd USER
  units** (`hermes-serve.service`, `hermes-gateway.service` under the hermes user;
  `runuser -u hermes -- env XDG_RUNTIME_DIR=/run/user/<uid> systemctl --user ...`) — the restart hint
  and drop-in handling must support user units.
- **Hermes already ships an official Bot Desktop** (`tools/bot_desktop/`: `runtime.py` — one Xfce desktop
  per profile, Xvnc on a private unix socket; `lease.py` — agent vs human control; `rfb_filter.py`;
  `install.py` / `runtime.install_command()` + `REQUIRED_BINARIES` / `BINARY_PACKAGES`; RPC
  `display.status|thumbnail|start|stop|observe|install|lease.acquire|lease.release` in
  `tui_gateway/methods_display.py`; WS bridge `/api/display/ws` in `hermes_cli/web_routers/display.py`).
  It gives per-bot persistent browser profiles and a proper take-over. **Our homemade
  computer/takeover modules duplicate it.**

## Changes
1. **Replace `computer` + `takeover` with one `botdesktop` module**: install exactly the packages the
   Bot Desktop requires for the detected package manager (derive from `BINARY_PACKAGES`/`PACKAGES` in
   `runtime.py` — read them, don't guess), plus cua-driver prerequisites if any. Verify by checking every
   `REQUIRED_BINARIES` entry is on PATH. Do not start desktops yourself (Hermes starts them per profile via
   `display.start`).
2. **`cleanup-legacy` step** (runs as part of `botdesktop`, idempotent): stop/disable/remove v1 units
   `droidbot-display/vnc/novnc.service`, the `/etc/hermes/droidbot-*` files, the
   `~/.hermes/droidbot-xauthority`, the DISPLAY drop-ins (`droidbot-display.conf`) for system and user
   Hermes units, and the marked Caddy `/desktop/*` block. Print what was removed and the restart command.
3. **`access` module — HTTPS without your own domain** (interactive when stdin is a TTY, flags otherwise):
   - `--domain <host>` → use it (current behaviour).
   - `--access sslip` (default when no domain): derive `<ip-with-dashes>.sslip.io` from the public IPv4
     (detect via `curl -s https://api.ipify.org` with fallback), create/ensure a Caddy site block for it
     proxying `/api/* /auth/* /login*` to Hermes and serving the PWA root, let Caddy obtain the cert, and
     **add the host to Hermes' trusted public hosts / public_url as Hermes requires** (read how
     `dashboard.public_url` / trusted hosts are configured in `hermes_cli/web_server_boundary.py` and
     `dashboard_auth/prefix.py`; set it via `hermes config set ...` as the hermes user if a CLI exists,
     never by hand-editing unknown keys). Warn that auth must be configured (basic_auth) before exposing.
   - `--access tailscale`: if `tailscale` is installed and logged in, run
     `tailscale serve --bg https / http://127.0.0.1:<caddy-port or hermes>` (read current Tailscale CLI
     syntax in its `--help`), print the `https://<host>.ts.net` URL; if not installed, print install steps.
   - End with a big "Open this on your phone: <url>" line.
4. `--check --json` updated (modules: browser, botdesktop, access, caddy, droidbot); docs updated.
5. Keep the `browser` module; investigate why its `--dump-dom` verify failed on the VPS although Chromium
   works when run as the hermes user with HOME set (compare with the architect's working command:
   `sudo -u hermes <chrome> --headless=new --no-sandbox --disable-gpu --dump-dom "data:text/html,<p>ok</p>"`)
   and fix the verification.

Commit with conventional commits on your branch, no AI attribution. Final report: package list (with
file:line of the source), cleanup list, access flow, risks, open questions.
