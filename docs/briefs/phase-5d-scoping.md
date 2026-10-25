# Phase 5d brief — Per-bot scoping (fix "which bot does this affect?") + "Aplicar a todos mis bots"

Branch `feat/phase-1-home-chat` (main checkout, after phase 5c lands). Read `repo/AGENTS.md`
(Product principle). NEVER start a dev server. Hermes source of truth: `.hermes-ref/` pinned `bf0203a`.

## The problem (user-reported + verified on the VPS)
In Hermes almost everything is **per profile (= per bot)**: each profile has its own `config.yaml`
(`approvals.mode`, toolsets), `.env` (vault keys), skills, MCP servers, platforms. Verified: default has
`approvals.mode: manual`, prueba/prueba2 have none. But our Control/Health/Vault/Connectors screens
silently act on the **active profile** (`controlProfile()` = `activeProfile`), even when opened from
another bot's profile → it looks per-bot but edits Pancho. That's a bug.

## Target information architecture
- **Bot profile (`/bots/:profile`)** owns everything of THAT bot, each screen scoped with `?profile=`
  / RPC `profile` param, and its header shows the bot avatar+name so it's obvious:
  Aprobaciones (approvals.mode segmented), Computadora (5c), Conexiones (catalog), Bóveda (keys),
  Herramientas (computer_use / browser toggles), Rutinas, Biblioteca, Programando.
  Routes: `/bots/:profile/{approvals,connectors,connectors/:family/:id,vault,vault/:key,tools}`;
  reuse the existing pages by passing the profile explicitly (remove the implicit active-profile
  fallback from their stores; every store/API call takes `profile` as an argument).
- **Ajustes (`/settings`)** = app + server only: Cuenta, Apariencia, Notificaciones (this device),
  Salud del servidor (doctor runs for a chosen bot — default = featured bot — show the bot picker),
  Instalar app, Avanzado. Remove Conectar aplicaciones / Bóveda / Control del agente from Settings,
  replaced by one hint row "La configuración de cada bot está en su perfil" → opens the featured bot.
- Old routes `/settings/vault*`, `/settings/control`, `/connectors*` redirect to the featured bot's
  equivalent route.

## "Aplicar a todos mis bots" (super plus)
- Vault key detail: after saving a key for this bot, a secondary action **"Aplicar a todos mis bots"**
  → confirmation sheet listing bots (checkboxes, all pre-checked, those that already have it marked
  "ya configurada") → `PUT /api/env?profile=<each>` sequentially with progress, summary of results.
  Never read/reveal values: the value comes only from what the user just typed in this screen.
- Same pattern for **approvals mode** ("Aplicar este modo a todos mis bots") and the computer_use /
  browser toolset toggles.

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass (add tests: every scoped
store passes the profile it was given — no hidden active-profile fallback). Conventional commits, no AI
attribution. Final report: route map before/after, per-screen scoping evidence (file:line), open
questions.
