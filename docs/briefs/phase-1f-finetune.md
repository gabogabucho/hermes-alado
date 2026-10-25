# Phase 1f brief — Fine-tune from the architect's visual audit (360×780 screenshots)

Branch `feat/phase-1-home-chat` (main checkout). Read `repo/AGENTS.md` (never start a dev server).
Small, surgical fixes only.

1. **Connector catalog duplicate React keys** (console error): ids collide across families
   (`openrouter`, `fal`, `xai`, `deepinfra`, `yuanbao`, `a2a` exist in more than one family). Use
   `${family}:${id}` as the key everywhere connectors are listed/selected, and in the detail route
   lookups make sure family+id is used (not id alone).
2. **Vault rows**: drop the "Sin configurar" text — show only the status dot (grey = unset, green =
   set) with an accessible label; titles may wrap to 2 lines (no ellipsis on the human label; keep
   the mono env-var line ellipsized). Clean labels: strip trailing "API key", "API token",
   "subscription token", "key" from human labels ("Browser Use API key" → "Browser Use").
3. **Wrong brand icons in the vault**: `CAMOFOX_URL` shows the GitHub logo because the brand lookup
   uses a domain found in the description/URL (github.com). Only use a brand icon when the
   recognized brand matches the variable's own provider/prefix (e.g. key starts with the brand
   name or maps via the explicit table); otherwise fall back to the initial tile. Never map
   github.com/docs hosts to a brand unless the key is GITHUB_*.
4. **Connectors header**: title "Conexiones" (single line), keep the "N activos" badge.
5. **Control del agente**: the "Detalles técnicos" disclosure row must align with the row gutters
   (same 16 px inset as other rows, hairline above) and have no extra bottom padding.
6. Section labels (`label-mono` small caps): reduce weight/letter-spacing slightly so they read as
   quiet captions, not headings.

Verify with `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test`. Conventional
commits, no AI attribution. Short final report.
