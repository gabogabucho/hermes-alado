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
