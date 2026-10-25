# Research brief — Push notifications via a Hermes plugin + curated bot catalog (READ-ONLY)

Write only `docs/research/notifications-design.md` and `docs/research/bot-catalog.md`. No app code,
no commits. Source: `.hermes-ref/` pinned `bf0203a` (`C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref`).
Cite `path:line` for every claim.

## A. Notifications (user: "muy importante")
Goal: phone push when a bot **finishes** a turn or **is waiting for you** (approval/clarify), per-bot
toggle, without modifying Hermes core — via an installable **Hermes plugin** (`~/.hermes/plugins/`).
1. Plugin system: manifest (`plugin.yaml`), how plugins register lifecycle hooks
   (`hermes_cli/plugins.py` ~L944, `invoke_hook` ~L1835; hook names incl. `on_stream_end`,
   `on_session_end`, `post_llm_call`, `pre_tool_call`), how a plugin mounts REST routes
   (`plugin_api.py`, `_mount_plugin_api_routes`), plugin storage (`plugins/plugin_storage.py`), and
   whether hooks run in `hermes serve`, `hermes gateway run`, or both (where do bot turns execute?).
2. Which hook/event fires for: turn complete (with session id + profile), approval/clarify requested
   (server requests in `tui_gateway/server_requests.py` — is there a hook?), cron run finished,
   group room needs you. Payload available in each.
3. Web Push design: VAPID keys (generated + stored by the plugin), subscription REST endpoints
   (subscribe/unsubscribe/list/test), per-profile opt-in, sending with `pywebpush` (is it vendorable /
   pip-installable into Hermes' Python env? how do plugins declare Python deps?), payload (title, body,
   url to open `/chat/<profile>` or `/group/<room>`), dedupe/rate limit, auth on the routes (same
   dashboard session cookie?).
4. PWA side: `PushManager.subscribe` with VAPID public key, service worker `push` + `notificationclick`
   handlers with vite-plugin-pwa (injectManifest vs generateSW), iOS requirement (installed PWA, 16.4+).
5. Fallback: Hermes' ntfy platform adapter (`plugins/platforms/ntfy/`) — what it can notify today.
Deliver a concrete design + file list for the plugin and the PWA, and risks.

## B. Curated bot catalog
1. What are profile **distributions** (`distribution_name/version/source` on profiles,
   `hermes_cli/profiles.py`, `web_routers/profiles.py:99`)? How are they installed/shared
   (CLI commands, REST, URLs/git)? Is there an official catalog/hub of bot distributions?
2. Desktop: any bot templates/presets in the "new bot" flow (`apps/desktop/src/plugins/hermes-bots/create-dialog.tsx`,
   `intro-*`, catalog-curation.json)?
3. Recommend how DroidBot offers "Nuevo bot desde catálogo": reuse distributions if viable, else a
   repo-hosted JSON of templates (name, emoji/look, SOUL, suggested toolsets/skills).

Print a 10-line summary at the end.
