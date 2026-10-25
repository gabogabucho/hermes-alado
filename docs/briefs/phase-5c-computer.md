# Phase 5c brief — "Computadora" (official Bot Desktop) + delete bot / delete group

Branch `feat/phase-1-home-chat` (main checkout). Read `repo/AGENTS.md` (Product principle: light,
everyday). NEVER start a dev server. Hermes source of truth: `.hermes-ref/` pinned `bf0203a`.
Phase 1d design system only. App name via `src/app/brand.ts` (`APP_NAME` = 'Alado').

## 1. Computadora (GrokBot screen 8) — use Hermes' OFFICIAL Bot Desktop
Hermes ships one Xfce desktop per profile with a take-over lease. Read, in this order:
`tools/bot_desktop/runtime.py`, `lease.py`, `rfb_filter.py`, `tui_gateway/methods_display.py`
(RPC `display.status | thumbnail | start | stop | observe | install | lease.acquire | lease.release`),
`hermes_cli/web_routers/display.py` (`/api/display/ws`, ticket from `display.observe`, close codes
4401 re-observe / 4001 screen gone), and the desktop UI `apps/desktop/src/plugins/hermes-bots/screen-pane.tsx`
(mirror its states and calls exactly).
- Bot profile row "Computadora" shows live status (Activo / Inactivo / Sin instalar) from
  `display.status`, and navigates to `/bots/:profile/computer`.
- `/bots/:profile/computer`: thumbnail (`display.thumbnail`, refresh every few seconds while visible)
  → "Ver" opens a full-screen live view: noVNC client over `wss://…/api/display/ws?ticket=…`
  (add `@novnc/novnc` — MPL-2.0 — lazy-loaded so it doesn't grow the main bundle). Default
  **view-only**. Big button **"Tomar el control"** → `display.lease.acquire`; while held: input enabled,
  banner "Tenés el control — el bot está en pausa", button **"Devolver"** → `display.lease.release`
  (also release on leave/unmount/visibility hidden). Touch: tap = click, two-finger scroll, a small
  floating keyboard button to open the on-screen keyboard.
- Not running → "Encender" (`display.start`). Not installed → explain + show the preparer command from
  `src/lib/hermes/preparer.ts` (do NOT call `display.install`: it needs sudo on the server).
- Phone-first: landscape-friendly viewer, pinch-zoom, fit-to-width.

## 2. Delete bot and delete group — see `docs/briefs/backlog.md` (first item); implement as written.

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass. Conventional commits, no AI
attribution. Final report: RPC/WS calls used (file:line), lease handling, bundle impact of noVNC
(lazy chunk), deviations, open questions.
