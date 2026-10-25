# Phase 4b brief — "Salud del sistema" (diagnose, repair, or tell exactly what to run)

Branch `feat/phase-1-home-chat` (main checkout). Read `repo/AGENTS.md` (NEVER start a dev server).
Hermes source of truth: `.hermes-ref/` pinned `bf0203a`. Use the Phase 1d design system only
(PageShell, Section/Row icon tiles, StatusDot, Badge, Disclosure, EmptyState, gold accent).

## Why
Real incident: Pancho couldn't browse — Hermes' bundled Chromium failed with
`libasound.so.2: cannot open shared object file` (exit 127). The agent runs as non-root, so it
could not fix it. Users of a "free GrokBot" must see such problems in plain language and either
fix them from the phone or get the exact command to run.

## Build — route `/settings/health`, linked from Control del agente ("Salud del sistema")
1. **Diagnosticar**: `POST /api/ops/doctor?profile=<active>` spawns `hermes doctor` as a background
   action. Read `hermes_cli/web_routers/ops.py` (`_spawn_action`) and the action log/status
   endpoints (grep `actions` router: how the desktop polls an action's output/status) and poll until
   done. Parse the doctor output into checks (read `hermes_cli/doctor*.py` to know its line format:
   ok/warn/fail markers, sections). Render one grouped section per area (Modelo/credenciales,
   Herramientas, Navegador, Computadora, Mensajería…) with a `StatusDot` per check and a short human
   sentence; raw output inside a `Disclosure` "Salida completa".
2. **Probes that don't need doctor** (instant, on open): `GET /api/tools/computer-use/status`
   (ready / display server / permissions), `GET /api/tools/toolsets` (browser/computer_use enabled),
   provider credential presence for the active model (`GET /api/env` is_set of the provider key).
3. **Remediation per finding** — map known failures to actions:
   - Fixable without root → button **"Reparar"**: `POST /api/tools/toolsets/{name}/post-setup`
     (e.g. reinstall Chromium for `browser`), enabling a toolset, or deep-link to the Bóveda key /
     Conexiones item. Show progress and re-run the probe after.
   - Needs root (missing system libraries like `libasound.so.2`, no display server for computer use,
     etc.) → card "Requiere acceso al servidor" with the **exact command** in a mono block +
     "Copiar" button. Primary recommendation is the repo's preparer:
     `curl -fsSL https://raw.githubusercontent.com/gabogabucho/hermes-droidbot/main/provisioner/prepare.sh | sudo bash -s -- --all`
     (keep this string in one constant `PREPARER_COMMAND` in `src/lib/hermes/preparer.ts`; the
     script itself is built in another phase). Also show the specific one-liner when known
     (e.g. `sudo apt-get install -y libasound2t64`).
   - Browser alternative without root: row "Usar un navegador en la nube" → Bóveda keys for
     Browserbase / Browser Use (link to their vault rows).
4. Control del agente gets a "Salud del sistema" row with a summary dot (worst status of the
   instant probes).

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass (add unit tests for the
doctor-output parser with fixtures captured from the doctor source format). Conventional commits,
no AI attribution. Final report: endpoints used (file:line), parser approach, remediation map,
open questions.
