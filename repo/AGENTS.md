# AGENTS.md — Hermes DroidBot

Mobile PWA client for the Hermes Agent backend (NousResearch/hermes-agent).
Product plan: `../PLAN-droidbot-v2.md`. Phase briefs: `../docs/briefs/`.

## Product principle (decides every trade-off)

**Light. Hermes for everyday life, not for sitting down to work.** The official Hermes apps include
everything; we are the opposite: one-hand, on-the-go, glanceable (GrokBot is the reference).
- Default screens show only what you use daily: chats, groups, approvals, notifications, voice,
  quick routines. Power/admin features go behind "Avanzado" or a detail screen — never in the
  primary flow.
- Prefer one tap and sensible defaults over options. No walls of settings, no raw technical text.
- If a feature mainly helps someone working at a desk, it belongs in Hermes Desktop, not here.
- Keep the PWA small and fast (lazy-load heavy, rarely used screens).

## Hard rules

1. **Read the real contract before calling anything.** The source of truth is the Hermes
   git checkout at `../.hermes-ref/`, pinned to commit `bf0203a` — the exact version running
   on our VPS. Do NOT use `%LOCALAPPDATA%\hermes\hermes-agent` (stale, 7 weeks older).
   - REST: `hermes_cli/web_server.py`, `hermes_cli/web_routers/*.py`
   - JSON-RPC over `/api/ws`: `tui_gateway/server.py`, `tui_gateway/methods_*.py`
   - Reference client (desktop app): `apps/desktop/src/**`, `apps/shared/src/**`
   Never invent request/response shapes. If something is missing, stop and report it.
2. **Never modify Hermes.** Read only.
3. Code ported from Hermes (MIT, Nous Research) keeps a license header:
   `// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).`
4. **No secrets in client storage** (localStorage/IndexedDB/cookies you set). Only the
   backend URL may be persisted. Session tokens live in memory only.
   Never call `/api/env/reveal`. No payment cards anywhere.
   *Phase 10a exception (the only one):* the last-known **roster** is cached in localStorage
   (`droidbot.roster.<backend>`, stale-while-revalidate) and **avatar assets** in IndexedDB
   (`droidbot/avatar-assets`, 24 h TTL) so Home paints instantly on later boots. Both hold
   only non-secret display data (bot names, titles, avatar appearance/look — never message previews,
   session ids the roster already exposes) and are keyed by backend origin. Nothing else
   may join them.
5. Visual inspiration from GrokBot is structural only. Two themes: `hermes` (warm
   near-black + gold) and `clean` (light gray/white, ink accent). Components use semantic
   tokens only — never raw hex. Our own avatar shapes and typography.
6. Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`).
   **No `Co-Authored-By`, no AI attribution in commits.**
7. Do not run `npm run build` / `vite build`. Verification allowed:
   `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint`.
   **Never start the dev server (`npm run dev`, `vite`, `npx vite`) at all** — on this Windows
   machine background starts fail and fall back to a foreground server that never exits and
   blocks you. Runtime/visual checks are done by the architect.
8. Keep it simple: no speculative abstractions, no features beyond the brief.
9. **Never touch the VPS** (no ssh, no deploy). Deploys to
   `droidbot.gabrielurrutia.com.ar` (`/var/www/droidbot`, unused v1 — free to replace) are
   done only by the architect.
10. Vendored files under `src/lib/hermes/vendor/` are copied verbatim from `.hermes-ref`;
    never edit them by hand — re-copy when the pinned commit changes.

## Stack

React 19, Vite 8, `vite-plugin-pwa`, nanostores (`@nanostores/react`), react-router 7,
TypeScript 6 strict-ish (`noUnusedLocals`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
→ no TS `enum`, no parameter properties).

## Layout (target)

```
src/
  app/            App shell, router, providers
  lib/hermes/     transport + auth + typed RPC/REST (no React)
  ui/             design system (tokens, primitives, icons) — presentational only
  features/<x>/   feature folders: containers (stores/hooks) + presentational components
```
