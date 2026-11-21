# Research brief — Hermes Kanban in Alado (READ-ONLY)

Write only `docs/research/kanban-design.md`. No app code, no commits, never touch the VPS.
Source of truth: `.hermes-ref/` pinned `bf0203a` (`C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref`).
Cite `path:line` for every claim. If something is not in the source, say "not found" — never invent
request/response shapes. Read `app/AGENTS.md` first (product principle: light, one-hand, glanceable;
admin/power features go behind a detail screen).

## Goal

Hermes ships a Kanban system (`plugins/kanban/`, `gateway/kanban_watchers*.py`, Desktop contrib).
The user wants to know how Alado can **integrate, show and take advantage of** it on the phone,
especially for his marketing-agency team of bots (Pancho = chief of staff, Lola = account PM,
Nico = analyst, Tomi = paid media, Vera = sales; they share a group room "Agencia").

## Questions

1. **What it is.** Data model (boards, columns, cards/tasks, assignees, statuses, comments, due dates,
   links to sessions/rooms?), where it is stored (per profile? shared across profiles?), lifecycle.
2. **Who uses it.** Agent tools the bots get (names, args, results), how a bot creates/moves/claims a
   card, whether cards dispatch work to bots automatically (`kanban_watchers`, dispatcher, cron),
   multi-bot coordination (can Pancho assign a card to Lola and Lola picks it up on her own?).
3. **Client contract.** Every way a client can read and change it: REST routes (dashboard plugin
   `plugins/kanban/dashboard/`, `hermes_cli/web_routers/*`), JSON-RPC methods over `/api/ws`, events
   pushed when a card changes (live updates?), auth. Exact params/results with `path:line`.
4. **Desktop reference.** How Hermes Desktop renders it (`apps/desktop/src/contrib/*kanban*`,
   plugins tab, any board view): screens, interactions, what is shown on a card.
5. **Enablement.** Is it a bundled plugin that must be enabled (`hermes plugins enable kanban`?),
   config keys, systemd units in `plugins/kanban/systemd`, dependencies, anything the Alado
   preparer would need to do.
6. **Push.** Which hook/event could tell the phone "a card was assigned to you / moved to Done /
   blocked" (our `droidbot-push` plugin uses hooks; see `hermes-plugin/droidbot_push/`).

## Deliverable: `docs/research/kanban-design.md`

- Summary of the system (1 page max) with citations.
- Full client contract table (method/route, params, result, event).
- **Phone UX proposal** in line with the product principle: where it lives (tab? inside a bot or a
  group? Home badge?), a glanceable default (e.g. "my cards / waiting on me"), card detail, quick
  actions (move, assign, comment, open the bot's chat). ASCII mockups at phone width.
- **How to take advantage of it** for the agency team: 3–5 concrete workflows (e.g. brief → Pancho
  splits into cards → each bot claims and reports → user approves from the phone), and what the
  `alado-companion` skill should teach bots about it.
- Phased plan (MVP read-only board → actions → push), files to touch in `app/src`, effort per phase.
- Risks, unknowns, and what must be verified on a live server (list exact checks; the architect runs them).

Print a 10-line summary at the end.
