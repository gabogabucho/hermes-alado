# Preparer → push notifications (fase 8)

Wire-up que el arquitecto agrega al preparer cuando instale el complemento de
notificaciones (`hermes-plugin/droidbot_push/`) en el VPS.

## Pasos en el VPS

```bash
# 1. Copiar el complemento (el repo ya lo trae en hermes-plugin/)
mkdir -p ~/.hermes/plugins
cp -r hermes-plugin/droidbot_push ~/.hermes/plugins/

# 2. Habilitar. La admisión resuelve pywebpush vía el PM de Hermes; si pide
#    dependencias (consentimiento interactivo): hermes pm install
hermes plugins enable droidbot-push
hermes pm install   # solo si la admisión lo pide

# 3. Reiniciar los procesos que corren turnos
systemctl --user restart hermes-web    # hermes serve (dashboard)
systemctl --user restart hermes-gateway # hermes gateway run (mensajería)
```

Notas:

- Los hooks (`on_session_end`, `pre_approval_request`, `on_human_input_request`,
  `on_room_member_activity`) corren **en el proceso del turno**: el complemento
  debe estar habilitado tanto en `hermes serve` como en `hermes gateway run`.
- Las suscripciones/prefs/dedupe viven en
  `~/.hermes/plugin-data/droidbot_push/data.db` (WAL, cross-process). La llave
  VAPID se autogenera en el estado del complemento la primera vez.
- La PWA debe servirse por HTTPS (ya lo está en producción) y, en iOS, la app
  debe estar instalada como PWA (16.4+).

## Verificación

```bash
# El endpoint de la PWA responde con la llave VAPID:
curl -fsS https://droidbot.gabrielurrutia.com.ar/api/plugins/droidbot-push/vapid-public-key
```

Si responde 404: el complemento no está habilitado en el perfil de la web, o el
`plugins.disabled` le gana al allow-list.
