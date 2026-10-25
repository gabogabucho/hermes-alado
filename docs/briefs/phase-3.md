# Phase 3 brief — "Conectar aplicaciones" (unified connector catalog)

Implements `PLAN-droidbot-v2.md` §4.5 + decision D7 + §6 "Fase 3". App code in `repo/`.
**Parallel work warning:** Phase 1 (home/chat/navigation) and Phase 1b (avatars) are being built
on other branches at the same time. Stay inside your lane to avoid merge conflicts:
- Write only in `repo/src/features/connectors/**` and `repo/src/lib/hermes/connectors/**`.
- You may add ONE route line in `repo/src/app/Shell.tsx` (`/connectors/:family/:id` for the
  detail screen). Do not touch `features/chat`, `features/home`, `features/bots`, `src/ui/**`
  (use existing primitives; if you need a new small component, put it in your feature folder).
- Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned
  `bf0203a`). Rules in `repo/AGENTS.md` apply (never run the dev server in the foreground).

## Goal (GrokBot screen 5)

One catalog for the **five** Hermes connector families, with a search, chips and a
Conectar/Conectado button per row, plus one shared detail screen.

| Family | Endpoints (verify in `hermes_cli/web_routers/*.py` / `web_server.py`) |
|---|---|
| Apps (MCP) | `GET /api/mcp/catalog`, `POST /api/mcp/catalog/install`, `GET/POST/PUT /api/mcp/servers`, `/{name}/test`, `/{name}/auth`, `/{name}/enabled`, `DELETE /{name}`, `/api/mcp/oauth/flows/{id}` |
| Herramientas (toolsets) | `GET /api/tools/toolsets`, `PUT /{name}`, `/{name}/config`, `/env`, `/provider`, `/model(s)`, `/post-setup` |
| Habilidades (skills) | `GET /api/skills`, `PUT /api/skills/toggle`, hub `/api/skills/hub/search|official|preview|install|uninstall|update` |
| Plugins | `GET /api/dashboard/plugins`, `/hub`, `/api/dashboard/agent-plugins/install`, `/{name}/enable|disable|update` |
| Mensajería | `GET /api/messaging/platforms`, `PUT /{id}`, `POST /{id}/test`, Telegram/WhatsApp onboarding, `/api/pairing*`, gateway `start|stop|restart` |

**Read the desktop implementation first** and mirror its behaviour/shapes: search
`.hermes-ref/apps/desktop/src` for the Capabilities / Skills / MCP / Tools / Messaging views
(e.g. `grep -ril "mcp/catalog\|tools/toolsets\|skills/hub\|messaging/platforms"`), and
`apps/shared/src/catalog-*.ts` (catalog browse/featured/install helpers — vendor verbatim into
`src/lib/hermes/vendor/` with the MIT header if useful). Profile scoping: most of these accept
`?profile=`; target the active profile (`GET /api/profiles/active`).

## Build

1. `lib/hermes/connectors/`: one adapter per family normalising to
   `Connector { id, family, name, description, icon, category, status: 'connected'|'available'|'needs_setup'|'error', configurable, auth: 'none'|'oauth'|'fields' }`
   plus family-specific raw data for the detail screen. Pure TS, no React.
2. **Catalog screen** (`/connectors`): header with back button + pill "N conectados";
   search input ("Buscar aplicaciones y habilidades") over all families; chips: Todos,
   Apps, Herramientas, Habilidades, Plugins, Mensajería (+ category chips if the catalogs
   provide categories); sections "Conectados", "Recomendados/Destacados" (catalog featured),
   "Disponibles"; each row = `ListRow` with icon, name, one-line description, trailing
   Conectar/Conectado button. Skeletons while loading, per-family error rows that don't break
   the whole list (fetch families in parallel, `Promise.allSettled`).
3. **Detail screen** (`/connectors/:family/:id`): description, status, dynamic config form from
   the backend schema (secret fields as password inputs, never echo stored secrets — only
   `is_set`/redacted), "Probar" (test endpoint), enable/disable toggle, "Desconectar"/uninstall
   with confirmation, and **OAuth via poll flow**: start → open the provider URL with
   `window.open` → poll the flow endpoint until done/failed (no callbacks — PWA). For
   messaging: Telegram/WhatsApp guided pairing (QR or code, whatever the backend returns) and
   gateway start/stop/restart.
4. Keep the existing gateway start/stop behaviour of the old ConnectorsPage inside the
   messaging detail.

## Done when

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass; small conventional commits on
your branch, no AI attribution. Final report: files, deviations, Hermes mismatches (file:line),
which flows you could not verify without a live backend, open questions.
