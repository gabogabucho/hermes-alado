# Hermes DroidBot

Cliente móvil (PWA) para el agente [Hermes](https://github.com/NousResearch/hermes-agent).
Habla con tus bots, crea chats individuales y (próximamente) grupos, conecta aplicaciones y
gestiona la bóveda de credenciales — todo desde el teléfono.

## Modos de autenticación

Hermes se sirve en dos modos. DroidBot los detecta solos:

| Modo | Cómo se detecta | Auth REST | Auth WS |
|------|-----------------|-----------|---------|
| **loopback** (`hermes dashboard` local, sin `public_url`) | La página raíz inyecta `window.__HERMES_SESSION_TOKEN__` | Header `X-Hermes-Session-Token` | `/api/ws?token=<token>` |
| **gated** (`public_url` / OAuth) | La raíz no trae token | Cookie de sesión (`credentials: include`) | `POST /api/auth/ws-ticket` → `/api/ws?ticket=<ticket>` (un solo uso, ~30 s) |

El token de loopback se guarda **solo en memoria**; nunca en `localStorage`/`IndexedDB`. Solo se
persiste la URL del backend.

## Desarrollo

```bash
cd repo
npm install
npm run dev
```

Por defecto el proxy de Vite apunta a `https://droidbot.gabrielurrutia.com.ar` (el backend gated
real). Para desarrollar contra un Hermes local:

```bash
hermes dashboard            # en otra terminal, escucha en http://localhost:9119
HERMES_URL=http://localhost:9119 npm run dev
```

El proxy reenvía `/api`, `/auth`, `/login` y `/__hermes_root` a Hermes, y reescribe el header
`Origin` de los upgrades de WebSocket para pasar el guard `_ws_host_origin_reason`.

### Abrir desde el teléfono en la LAN

`server.host: true` expone el dev server en la red. En modo **loopback** alcanza con abrir
`http://<lan-ip>:5173`. En modo **gated**, el login desde un teléfono por `http://` plano **no
funciona**: la cookie `__Host-` exige HTTPS. Probá el modo gated desde el teléfono contra un
deploy HTTPS.

## Verificación

No correr `npm run build`. Verificación permitida:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
```

## Licencia

El código del transporte JSON-RPC bajo `src/lib/hermes/vendor/` está copiado de
[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) (MIT, Copyright © 2025
Nous Research) y mantiene su encabezado de licencia.
