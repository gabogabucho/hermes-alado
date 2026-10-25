# Phase 9 brief — First run: install invite + "Traé tus bots" migration

Branch `feat/phase-1-home-chat` (main checkout). Read `repo/AGENTS.md` first — especially the new
**Product principle (light, everyday, one-hand)**; never start a dev server. Hermes source of truth:
`.hermes-ref/` pinned `bf0203a`. Use the Phase 1d design system only. The app may be renamed soon:
take the product name from one constant `APP_NAME` in `src/app/brand.ts` (value `'DroidBot'` for now)
and never hardcode it elsewhere.

## 1. Install invite (first run)
- Android/Chromium: capture `beforeinstallprompt`, show a friendly bottom `Sheet` after login on first
  run ("Instalá {APP_NAME}: abrila como una app, a pantalla completa") with "Instalar" (calls
  `prompt()`) and "Ahora no". iOS Safari (no event): same sheet with 3 illustrated steps
  (Compartir → "Agregar a inicio" → Abrir). Never show when already standalone
  (`display-mode: standalone` / `navigator.standalone`). Remember dismissal per device
  (localStorage, re-offer after 14 days at most once). Also a "Instalar app" row in Settings.

## 2. Migration — "Traé tus bots" (from GrokBot or any other app)
Simple, guided, one screen at a time (no forms wall):
1. Entry points: Home `+` sheet → "Importar bots", and an empty-state CTA when the user has only the
   default bot.
2. **Step 1 — "Pedíselo a tu app anterior"**: show a ready-to-copy prompt (Copy button) that asks the
   old assistant to export ALL its bots, their personality/instructions (SOUL), groups (name +
   members) and routines (name, schedule in plain words, what it does, which bot) in a strict
   Markdown format. Define that format yourself, minimal and robust, e.g.:
   ```
   # Bot: <name>
   ## Personalidad
   <multi-line soul>
   # Grupo: <name>
   - Miembros: <bot>, <bot>
   # Rutina: <name>
   - Bot: <bot>
   - Cuándo: <plain words or cron>
   - Qué hace: <prompt>
   ```
3. **Step 2 — "Pegá la respuesta"**: big paste area (+ "Subir .md").
4. **Step 3 — Vista previa**: parsed cards "Se van a crear: N bots, N grupos, N rutinas", each
   toggleable; conflicts flagged (bot name already exists → "Usar existente" / "Crear como X 2");
   unparseable chunks listed. Pure parser in `src/lib/import/` with **unit tests** (vitest) incl.
   messy inputs (extra prose, bullets, Spanish/English headings).
5. **Step 4 — Crear**: sequential with progress: bots via `createProfile(name, { cloneFrom: <featured
   or default> })` then SOUL (`/api/profiles/{name}/soul` — verify), routines via the cron create
   endpoint (verify shape in `hermes_cli/web_routers/cron*.py`; convert plain-words schedules with a
   small Spanish→cron helper and ask the user to confirm ambiguous ones), groups via the existing
   groups engine `create`. Summary screen with "Ir al inicio".
6. Fallback button on step 3 when parsing finds little: **"Que lo ordene {principal bot}"** — opens
   the principal bot chat with a prefilled message containing the pasted text and an instruction to
   create those bots/groups/routines using its tools (just prefill + send; don't automate further).

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass. Conventional commits, no AI
attribution. Final report: format spec, endpoints used (file:line), deviations, open questions.
