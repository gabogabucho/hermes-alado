# Phase 7 brief — The preparer (`provisioner/prepare.sh`)

Goal: "configure Hermes basics → run one script → open the PWA → Hermes works from your phone like
GrokBot". You write a server-side provisioning script. **You do NOT run it** (no SSH, no VPS access —
AGENTS.md rule 9); the architect reviews and runs it. Work only in `provisioner/` at the repo root
(new folder) plus `docs/provisioner.md`. Never start a dev server.

Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned
`bf0203a`). Read what Hermes expects before writing: computer use (`tools/computer_use/`, cua-driver
status checks in `hermes_cli/web_routers/tools*.py` / `computer-use/status`), browser tool
(Chromium bundle path `~/.hermes/tools/chromium-*`, `hermes tools post-setup browser`), how Hermes
is run as a service (`hermes_cli/gateway*`, systemd units it installs, `gateway-service/`), and the
dashboard auth (`/api/auth/me` returns 401 without a session).

Reference target (our VPS): Ubuntu 24.04, Hermes installed for user `hermes` (home
`/home/hermes/.hermes`), `hermes serve --host 0.0.0.0 --port 9119` + `hermes gateway run`
(systemd), Caddy in front (`/etc/caddy/Caddyfile`, site `droidbot.gabrielurrutia.com.ar`, proxies
`/api/*` `/auth/*` `/login*` to 127.0.0.1:9119, serves the PWA from `/var/www/droidbot`), Cloudflare
in front of Caddy. Real incident: Chromium failed with missing `libasound.so.2`.

## Requirements
- Bash, `set -euo pipefail`, idempotent (re-running changes nothing), Debian/Ubuntu first (detect
  distro; clear error elsewhere), must run as root, prints a clear summary table at the end.
- Flags: `--check` (diagnose only, exit code 0/1, also `--json` output), `--all`, or individual
  modules; `--hermes-user <user>` (default: autodetect owner of `~/.hermes`, fallback `hermes`),
  `--domain <host>`, `--dry-run` (print commands).
- Modules:
  1. **browser** — install the system libraries Hermes' Chromium needs (derive the list from
     Playwright's Ubuntu 24.04 deps; include `libasound2t64`, `libnss3`, `libatk-bridge2.0-0t64`,
     fonts…); verify with `ldd` on the bundled chrome (0 "not found") and a headless `--dump-dom` run
     as the hermes user.
  2. **computer** — virtual display for computer use: Xvfb on `:99` + a lightweight WM (openbox or
     xfce4-session minimal) as a systemd service owned by the hermes user; make Hermes' services see
     `DISPLAY=:99` (systemd drop-in `Environment=DISPLAY=:99` for the Hermes units you detect — do not
     edit Hermes files); verify via `cua-driver` doctor/status if available.
  3. **takeover** — live view + remote control: `x11vnc` bound to localhost on :99 + `websockify`
     serving noVNC (localhost only) as systemd services; add a Caddy route `/desktop/*` protected with
     `forward_auth 127.0.0.1:9119 { uri /api/auth/me }` (so only a logged-in Hermes session can open
     it); never expose VNC ports publicly; random VNC password stored root-only. Verify: unauthenticated
     request to `/desktop/` → 401/redirect.
  4. **caddy** — ensure the PWA cache headers: no-cache for `/sw.js /registerSW.js /index.html /
     /manifest.webmanifest /workbox-*.js`, immutable for `/assets/*` (edit via a marked block, backup
     the Caddyfile, `caddy validate` before reload).
  5. **droidbot** — install/update the PWA into `/var/www/droidbot` from `--dist <path|url-to-tar.gz>`
     (atomic swap, keep previous as `.prev`).
- Every module: detect → act → verify; on failure print the exact manual command.
- `--check --json` schema documented in `docs/provisioner.md` (the PWA "Salud" screen will link to it).
- Add `provisioner/README.md` (one-liner usage: `curl -fsSL .../provisioner/prepare.sh | sudo bash -s -- --all --domain <host>`).
- Lint with `shellcheck` if available (`npx shellcheck` or skip and report).

Commit with conventional commits on your branch, no AI attribution. Final report: modules, every
system change it makes, how idempotency/verification works, risks, open questions.
