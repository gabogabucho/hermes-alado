# Phase 4a brief — Bóveda, Auto-review, Control del agente (standalone screens)

Implements `PLAN-droidbot-v2.md` §4.4, §4.6 level 1, §6 "Fase 4" (minus the Settings page itself)
and decisions D4/D5/D6. App code in `repo/`. Hermes source of truth:
`C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned `bf0203a`). Rules in
`repo/AGENTS.md` apply (never run the dev server in the foreground).

**Parallel work:** other agents are restyling the app (Phase 1c) and building connectors (Phase 3).
Write only in `repo/src/features/vault/**`, `repo/src/features/control/**` and NEW files in
`repo/src/lib/hermes/`. You may add route lines in `repo/src/app/Shell.tsx`:
`/settings/vault`, `/settings/vault/:key`, `/settings/control`. Don't touch Settings, Home, Chat or
`src/ui/**` (use existing primitives; new small components in your folders). The architect links
these from Settings later. Read the desktop equivalents first (`.hermes-ref/apps/desktop/src`,
grep `api/env`, `credentials/pool`, `computer-use`, `approval`), and mirror their shapes/behaviour.

## 1. Bóveda (`/settings/vault`) — write-only (D4, D5, D6)

- `GET /api/env?profile=<active>`: group variables by `category`; each row shows name,
  description, `is_set` badge and `redacted_value` (never the real value). **Never call
  `/api/env/reveal`.** Nothing secret is ever stored client-side.
- Detail/edit (`/settings/vault/:key`): replace value (password input, `PUT`), delete
  (`DELETE`, confirm), link "Conseguir clave" to the variable's `url` (new tab), which tools use it.
- Credential pool (`/api/credentials/pool`): per provider list of keys (redacted), add / remove,
  showing rotation status if returned. Verify shapes.
- Custom variables ("Inicios de sesión de servicios"): add a custom KEY=value (validate the key
  format the backend accepts).
- No payment cards anywhere.

## 2. Control del agente (`/settings/control`) — plan §4.6 level 1

- **Auto-review** toggle: "Pedir aprobación para acciones riesgosas (shell, MCP, computadora)".
  Find the exact approval config key in `GET /api/config/schema` (+ how the desktop's approval
  setting writes it via `/api/config`); read current value from `GET /api/config`. Report the key.
- **Computer use**: status from `/api/tools/computer-use/status` (activo/inactivo + permission
  state), enable/disable the `computer_use` and `browser` toolsets (`PUT /api/tools/toolsets/{name}`).
- **Tarea en curso**: list running sessions/turns if an endpoint exposes them (verify, e.g.
  `session.active_list` RPC) with a "Detener" button (`session.interrupt`). If no clean source
  exists, skip and report.
- A disabled row "Ver pantalla y tomar el control — Próximamente" (plan §4.6 level 2).

## Quality

Mobile first, both themes, skeletons, empty/error states, 44 px targets, semantic tokens only,
confirmation before destructive actions.

## Done when

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass; small conventional commits on your
branch, no AI attribution. Final report: files, deviations, Hermes mismatches (file:line),
the approval config key, open questions.
