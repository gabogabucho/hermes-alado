# Provisioner — Hermes DroidBot (fase 7)

Prepara un VPS Ubuntu/Debian para que la PWA DroidBot funcione contra Hermes: librerías del
Chromium empaquetado, display virtual para computer use, vista en vivo (`/desktop/*`) y deploy
atómico de la PWA. Idempotente, con diagnóstico `--check` y ensayo `--dry-run`.

## Uso en una línea

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/Hermes-Droidbot/main/provisioner/prepare.sh | sudo bash -s -- --all --domain <host>
```

Con el dist de la PWA:

```bash
sudo bash prepare.sh --all --domain droidbot.gabrielurrutia.com.ar --dist ./dist.tar.gz
```

## Diagnóstico

```bash
sudo bash prepare.sh --check            # exit 0 = OK, 1 = problemas
sudo bash prepare.sh --check --json     # salida para la pantalla "Salud" de la PWA
sudo bash prepare.sh --dry-run --all    # imprime los comandos sin ejecutar nada
```

## Módulos

| Módulo     | Qué hace |
|------------|----------|
| `browser`  | Instala las librerías que el Chromium de Hermes necesita (lista de `playwright install-deps chromium` para Ubuntu 24.04/22.04 y Debian 13/12) y verifica con `ldd` (0 "not found") + `--dump-dom` headless como el usuario Hermes. |
| `computer` | Xvfb en `:99` + openbox como servicio systemd del usuario Hermes, y drop-ins `EnvironmentFile` para que las unidades `hermes-*.service` detectadas vean `DISPLAY=:99` (sin tocar archivos de Hermes). Verifica con `xdpyinfo` y `cua-driver doctor --json` si está disponible. |
| `takeover` | `x11vnc` (solo localhost, contraseña aleatoria root-only 0600) + `websockify` sirviendo noVNC en `127.0.0.1:6080`, y ruta Caddy `/desktop/*` protegida con `forward_auth` contra `/api/auth/me` (401 sin sesión). |
| `caddy`    | Bloque marcado con los cache headers de la PWA: `no-cache` para `/sw.js /registerSW.js /index.html /manifest.webmanifest /workbox-*.js` e `immutable` para `/assets/*`. Respalda el Caddyfile y valida antes de recargar. |
| `droidbot` | Instala/actualiza la PWA en `/var/www/droidbot` desde `--dist <ruta|url.tar.gz>` con swap atómico (la versión anterior queda en `droidbot.prev`) y marcador sha256 para saltar redeploys idénticos. |

## Flags

```
--check               Solo diagnóstico (no cambia nada). Exit 0/1.
--json                Emite el diagnóstico como JSON (requiere --check).
--all                 Aplica todos los módulos.
--dry-run             Imprime los comandos que ejecutaría.
--hermes-user <user>  Usuario dueño de ~/.hermes (default: autodetección).
--domain <host>       Dominio público para Caddy y verificaciones.
--dist <ruta|url>     Tar.gz de la PWA (módulo droidbot).
```

## Documentación

El detalle completo (cambios al sistema, esquema JSON de `--check --json`, idempotencia,
riesgos) está en [`docs/provisioner.md`](../docs/provisioner.md).
