# AGENTS.md — Hermes DroidBot

Mobile PWA client for the Hermes Agent backend (NousResearch/hermes-agent).
Product plan: `../PLAN-droidbot-v2.md`. Phase briefs: `../docs/briefs/`.

## Hard rules

1. **Read the real contract before calling anything.** Hermes source lives at
   `C:\Users\gabog\AppData\Local\hermes\hermes-agent`.
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
5. Visual inspiration from GrokBot is structural only. Two themes: `hermes` (warm
   near-black + gold) and `clean` (light gray/white, ink accent). Components use semantic
   tokens only — never raw hex. Our own avatar shapes and typography.
6. Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`).
   **No `Co-Authored-By`, no AI attribution in commits.**
7. Do not run `npm run build` / `vite build`. Verification allowed:
   `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint`.
8. Keep it simple: no speculative abstractions, no features beyond the brief.

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
