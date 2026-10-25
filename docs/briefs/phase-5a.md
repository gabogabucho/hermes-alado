# Phase 5a brief — Rutinas, Biblioteca, Programando (bot sub-screens)

Implements the sub-screens of `PLAN-droidbot-v2.md` §6 "Fase 5" (GrokBot screens 6–7), as
standalone pages. The bot profile screen that links to them is built later. App code in `repo/`.
**Parallel work warning:** Phases 1, 1b and 3 are being built on other branches at the same time.
- Write only in `repo/src/features/routines/**`, `repo/src/features/library/**`,
  `repo/src/features/working/**`, and `repo/src/lib/hermes/` NEW files you create.
- You may add route lines in `repo/src/app/Shell.tsx`:
  `/bots/:profile/routines`, `/bots/:profile/routines/:id`, `/bots/:profile/library`,
  `/bots/:profile/working`. Don't touch other features or `src/ui/**` (use existing
  primitives; new small components go in your feature folder).
- Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned
  `bf0203a`). Rules in `repo/AGENTS.md` apply (never run the dev server in the foreground).
- Read the desktop's equivalents first (`.hermes-ref/apps/desktop/src`, grep for
  `cron/jobs`, `webhooks`, `api/files`, `kanban/workers`) and `apps/shared/src/cron-trigger-controller.ts`.
  Verify profile scoping (`?profile=`) for every endpoint.

## 1. Rutinas (GrokBot screen 7)

- List cron jobs (`GET /api/cron/jobs`) and webhooks (`GET /api/webhooks`) for the bot's profile,
  each row: name, **schedule in human Spanish**, toggle (cron: `/pause` `/resume`; webhook:
  `/{name}/enabled`), "· Pausada" suffix when paused.
- Cron → Spanish text: write `cronToSpanish(expr, tz?)` covering at least: every N minutes/hours,
  daily at HH:MM ("Todos los días a las 7:00"), weekdays ("De lunes a viernes a las 7:00"),
  specific weekdays ("Cada lunes a las 8:31", "Lunes y jueves a las 9:00"), monthly day
  ("El día 1 de cada mes a las 10:00"), fallback to the raw expression. Also handle the
  non-cron schedule kinds the backend may return (read the job shape: interval/once/rrule?).
  Unit-test it as a pure function: there is no test runner, so add `vitest` as devDependency
  with a `test` script and a `cronToSpanish.test.ts` (this is the only test infra allowed).
  Webhooks render "Cuando se activa un webhook".
- Detail (`/bots/:profile/routines/:id`): prompt/description, schedule, next run, last runs
  (`/runs`), "Ejecutar ahora" (`/trigger`), delete with confirmation.
- "Nueva rutina" from blueprints (`GET /api/cron/blueprints`): sheet listing blueprints →
  create with the backend's create endpoint (verify shape).

## 2. Biblioteca

Browser for `/api/files*`: folder navigation with breadcrumbs, file rows (icon by type, size,
modified), preview for text/markdown/images/PDF (inline where the browser can), download.
Read-only except upload (reuse `lib/files.ts`) — no delete in this phase.

## 3. Programando

`GET /api/plugins/kanban/workers/active` (verify; plugin may be absent → friendly empty state):
count + list of active workers (task title, bot, elapsed time), auto-refresh every 10 s while
visible.

## Quality

Mobile first, both themes, skeletons, empty and error states, 44 px targets, semantic tokens only.

## Done when

`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass; small conventional
commits on your branch, no AI attribution. Final report: files, deviations, Hermes mismatches
(file:line), open questions.
