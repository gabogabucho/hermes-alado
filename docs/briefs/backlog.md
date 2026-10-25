# Backlog (queued small items)

## Delete bot and delete group (user request, 2026-10-25)
- **Bot**: Bot profile → bottom of the page, danger row "Eliminar bot" → confirm sheet (type the bot
  name to confirm; explain chats, routines and files of that bot are removed). `DELETE /api/profiles/{name}`
  (`hermes_cli/web_routers/profiles.py:979`; note `settlement_pending` answers `ok`). Disallow deleting
  the `default` profile and the currently active profile (explain why). Also remove it from the
  featured-bot preference if it was featured; refresh Home; navigate to Home.
- **Group**: disband already exists inside the group menu (`GroupChatPage.tsx:256`) but is hard to find:
  add a Home row `…` menu for groups with "Eliminar grupo" (same confirm), and label the in-room action
  "Eliminar grupo" instead of "Disolver grupo" (plain language).

## Preparer: `push` module (user request, 2026-10-25)
Install the `droidbot-push` Hermes plugin from the preparer: copy `hermes-plugin/droidbot_push` to
`<hermes home>/plugins/`, `hermes plugins enable droidbot-push` (as the hermes user), install its Python
dependency into Hermes' Python (`<hermes>/tools/python-*/bin/python -m pip install "pywebpush>=2,<3"`)
until the plugin is published on GitHub (then: `hermes plugins install <git-url> --yes-deps`), restart
the Hermes user units, verify `GET /api/plugins/droidbot-push/vapid-public-key` → 401 unauthenticated
(route mounted). Pin `pywebpush>=2,<3` in plugin.yaml.
