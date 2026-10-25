# droidbot-push — Web Push para DroidBot

Complemento Hermes que manda notificaciones push al teléfono cuando un bot:

1. **Termina un turno** (`on_session_end`, incluye cron),
2. **Te espera** para una aprobación / aclaración / sudo
   (`pre_approval_request` + `on_human_input_request`),
3. **Un grupo te espera** (`on_room_member_activity` con `kind=request.opened`).

Con toggle por bot ("Cuando termine" / "Cuando te necesite") desde la PWA, al
estilo GrokBot. Tocar la notificación abre `/chat/<perfil>` o `/group/<sala>`.

## Instalación

```bash
# 1. Copiar el complemento a la carpeta de user plugins
mkdir -p ~/.hermes/plugins
cp -r droidbot_push ~/.hermes/plugins/

# 2. Habilitarlo. La admisión de Hermes resuelve pywebpush vía el PM;
#    si pide dependencias: hermes pm install (consentimiento interactivo).
hermes plugins enable droidbot-push

# 3. Reiniciar Hermes
#    hermes serve   (web)   y/o   hermes gateway run   (mensajería)
```

Alternativa desde un repo git (instalación no interactiva con consentimiento
explícito de dependencias):

```bash
hermes plugins install <git-url> --yes-deps --enable
```

Los hooks corren en el proceso que ejecuta el turno (serve y gateway), por lo
que el complemento debe quedar habilitado en ambos. Las suscripciones, el dedupe
y las preferencias viven en SQLite (`plugin-data/droidbot_push/data.db`, WAL) y
se comparten entre procesos; la llave VAPID se genera una vez y queda en el
estado del complemento (`plugin-data/.../state.json`).

## API (montada por la dashboard en `/api/plugins/droidbot-push/`)

| Método | Ruta              | Cuerpo / Query                            | Respuesta                     |
| ------ | ----------------- | ----------------------------------------- | ----------------------------- |
| GET    | `/vapid-public-key` | —                                       | `{ "key": "<base64url>" }`    |
| POST   | `/subscribe`        | `{ endpoint, p256dh, auth, device_id?, device_label? }` | `{ "ok": true }` |
| DELETE | `/subscribe`        | `{ endpoint?, device_id? }`              | `{ "ok": true, "removed": n }` |
| GET    | `/prefs`            | —                                         | `{ "prefs": { "<perfil>": { "termina": bool, "necesita": bool } } }` |
| PUT    | `/prefs`            | `{ profile, termina?, necesita? }`        | `{ "prefs": { "<perfil>": ... } }` |
| POST   | `/test`             | `{ device_id? }`                          | `{ "sent": n }`               |

La autenticación de la dashboard se hereda sola (misma cookie de sesión).

## Configuración opcional (`plugins.entries.droidbot-push.settings`)

- `subject` — claim VAPID (`mailto:` o `https:`). Default: `mailto:admin@droidbot.local`.
- `rate_limit_seconds` — mínimo entre pushes por perfil. Default: `30`.

## Tests

```bash
python -m pytest tests/ -q
```
