# Provisioner — Hermes DroidBot (phase 7b)

Prepares an Ubuntu/Debian VPS so the DroidBot PWA works against Hermes: system libraries for
the bundled Chromium, the packages Hermes' official Bot Desktop needs (one Xfce desktop per
bot profile), HTTPS access without your own domain (sslip.io or Tailscale), PWA cache headers
in Caddy, atomic PWA deploys, and the `droidbot-push` Hermes plugin (web push to the phone).
Idempotent, with `--check` diagnostics and a `--dry-run` rehearsal.

## One-line usage

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/Hermes-Droidbot/main/provisioner/prepare.sh | sudo bash -s -- --all --domain <host>
```

With the PWA dist:

```bash
sudo bash prepare.sh --all --domain droidbot.gabrielurrutia.com.ar --dist ./dist.tar.gz
```

Without your own domain:

```bash
sudo bash prepare.sh --all --access sslip      # https://<public-ip>.sslip.io via Caddy
sudo bash prepare.sh --all --access tailscale  # https://<machine>.<tailnet>.ts.net
```

With push notifications (needs the plugin source from the repo):

```bash
sudo bash prepare.sh push                                 # uses hermes-plugin/droidbot_push next to the script
sudo bash prepare.sh push --plugin-src ./hermes-plugin/droidbot_push
```

## Diagnostics

```bash
sudo bash prepare.sh --check            # exit 0 = OK, 1 = problems
sudo bash prepare.sh --check --json     # output for the PWA "Health" screen
sudo bash prepare.sh --dry-run --all    # prints the commands without running anything
```

## Modules

| Module     | What it does |
|------------|--------------|
| `browser`  | Installs the system libraries Hermes' bundled Chromium needs (list derived from `playwright install-deps chromium` for Ubuntu 24.04/22.04 and Debian 13/12) and verifies with `ldd` (0 "not found") + a headless `--dump-dom` run as the Hermes user — the exact command the architect confirmed working on the VPS. |
| `botdesktop` | Installs exactly the packages Hermes' official Bot Desktop requires (`tools/bot_desktop/runtime.py` `PACKAGES["apt"]`: TigerVNC Xvnc + Xfce) and verifies every `REQUIRED_BINARIES` entry is on PATH. Runs the idempotent `cleanup-legacy` step (v1 `droidbot-display/vnc/novnc` units, `/etc/hermes/droidbot-*`, the xauthority cookie, DISPLAY drop-ins, the Caddy `/desktop/*` route) and prints the restart command. Hermes starts the desktops itself, one per profile, via `display.start` — this module only provisions the host. |
| `access`   | HTTPS without your own domain. `--domain <host>` uses your domain (ensures `dashboard.public_url` via `hermes config set`, warns when dashboard auth is missing). `--access sslip` (default without `--domain`) derives `<public-ip>.sslip.io`, creates a Caddy site proxying `/api/* /auth/* /login*` to Hermes and serving the PWA root, lets Caddy obtain the cert, and adds the host to Hermes' trusted public hosts. `--access tailscale` runs `tailscale serve --bg --yes --https=443` and prints the `ts.net` URL (install steps when tailscale is missing). Interactive prompt when stdin is a TTY; flags otherwise. Ends with a big "Open this on your phone" line. |
| `caddy`    | Marked cache-header block for the PWA: `no-cache` for `/sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js`, `immutable` for `/assets/*`. Backs up the Caddyfile and validates before reloading. |
| `droidbot` | Installs/updates the PWA at `/var/www/droidbot` from `--dist <path|url.tar.gz>` with an atomic swap (the previous version stays in `droidbot.prev`) and a sha256 marker that skips identical redeploys. |
| `push`     | Installs the `droidbot-push` Hermes plugin (web push to the phone when a bot finishes a turn or waits for you): copies `--plugin-src` (default `hermes-plugin/droidbot_push` next to the script) into `~/.hermes/plugins/droidbot_push`, installs `pywebpush>=2,<3` into Hermes' PM-managed Python (`~/.hermes/tools/python-*/bin/python`), runs `hermes plugins enable droidbot-push` as the hermes user, and verifies `GET /api/plugins/droidbot-push/vapid-public-key` → 401 unauthenticated (route mounted). Prints the Hermes restart command — it never restarts Hermes itself. Until the plugin is published on GitHub this folder copy is the install path (then: `hermes plugins install <git-url> --yes-deps --enable`). |

## Flags

```
--check               Diagnostics only (changes nothing). Exit 0/1.
--json                Emit the diagnostics as JSON (requires --check).
--all                 Apply all modules.
--dry-run             Print the commands it would run.
--hermes-user <user>  Owner of ~/.hermes (default: auto-detection, fallback 'hermes').
--domain <host>       Public domain (access/caddy site blocks + verifications).
--access <mode>       HTTPS without your own domain: 'sslip' or 'tailscale'.
--dist <path|url>     PWA tar.gz for the droidbot module.
--plugin-src <path>   droidbot-push plugin source folder for the push module
                      (default: hermes-plugin/droidbot_push next to the script).
```

## Documentation

Full detail (system changes, `--check --json` schema, idempotency, risks) is in
[`docs/provisioner.md`](../docs/provisioner.md).
