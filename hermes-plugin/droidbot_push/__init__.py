"""droidbot-push plugin — Web Push for Alado.

Hooks (todos observer-only, nunca bloquean el turno):
- ``on_session_end``            → "terminó" (chat y cron)
- ``pre_approval_request``      → "te necesita" (aprobación gateway)
- ``on_human_input_request``    → "te necesita" (aclaración/sudo; las
  aprobaciones las cubre pre_approval_request para no duplicar)
- ``on_room_member_activity``   → ``kind=request.opened`` (un grupo te espera)

VAPID: llave EC P-256 generada una vez y persistida en ``ctx.state`` (perfil).
Suscripciones, preferencias por bot y dedupe: SQLite del plugin
(``plugins.plugin_storage.plugin_db``), compartido entre los procesos
serve y gateway para no duplicar pushes del mismo turno.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from . import context
from . import webpush

logger = logging.getLogger("droidbot-push")


def _profile_of(payload: dict[str, Any]) -> str:
    """Perfil de la sesión: ``session_key`` del payload cuando existe (en el
    gateway es el nombre del chat), si no el activo del proceso."""
    session_key = payload.get("session_key")
    if isinstance(session_key, str) and session_key.strip():
        return session_key.strip()
    ctx = context.get_ctx()
    try:
        return ctx.profile_name or "default"
    except Exception:
        return "default"


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def _enqueue(kind: str, event_key: str, profile: str, title_key: str | None,
             body_key: str, url: str, tag: str,
             approval: dict[str, Any] | None = None) -> None:
    """Hilo daemon: el send HTTP (pywebpush) jamás bloquea el turno."""
    def _run() -> None:
        try:
            webpush.send_for(kind, event_key, profile, title_key, body_key, url, tag,
                             approval=approval)
        except Exception as exc:
            logger.warning("push %s (%s) falló: %s", kind, event_key, exc)

    threading.Thread(target=_run, name=f"droidbot-push-{kind}", daemon=True).start()


def _urlseg(value: str) -> str:
    from urllib.parse import quote
    return quote(str(value), safe="")


# ── hooks ────────────────────────────────────────────────────────────────────

def _on_session_end(**payload: Any) -> None:
    """Turno terminado (chat, cron): pref ``termina``."""
    if not payload.get("completed"):
        return
    if payload.get("failed") or payload.get("interrupted"):
        return
    if payload.get("platform") == "subagent":
        return  # turnos internos de delegación: ruido, no son "el bot terminó"
    if context.get_ctx() is None:
        return
    platform = payload.get("platform") or ""
    profile = _profile_of(payload)
    body_key = "routine_done" if platform == "cron" else "turn_done"
    url = f"/chat/{_urlseg(profile)}"
    key = "turn:" + ":".join(str(payload.get(k) or "") for k in ("session_id", "turn_id", "task_id"))
    _enqueue("termina", key, profile, None, body_key, url, f"droidbot:{profile}")


def _approval_request_id(session_key: str, command: str) -> str | None:
    """Best-effort ``request_id`` de la entrada recién encolada para este push.

    El hook corre DESPUÉS del enqueue (``_await_gateway_decision``) pero su
    payload no incluye ``request_id`` (se genera en ``_ApprovalEntry``). La
    entrada ya vive en la cola del proceso: matcheamos por ``command`` y
    tomamos la última (la más reciente). Ninguna cola en este proceso (CLI u
    otra superficie) → None, y el SW resuelve FIFO por session_key.
    """
    try:
        from tools.approval import list_gateway_approvals
        pending = list_gateway_approvals(session_key)
    except Exception:
        return None
    matches = [p for p in pending if str(p.get("command") or "") == command]
    if not matches:
        return None
    request_id = matches[-1].get("request_id")
    return str(request_id) if request_id else None


def _on_pre_approval_request(**payload: Any) -> None:
    """El bot espera una aprobación (surface gateway/local).

    El push lleva botones Approve/Reject: ``approval.respond`` del SW usa
    ``session_key`` + ``request_id`` para resolver exactamente ESTA entrada.
    Approve = ``once`` (consiento una sola vez, la opción más segura);
    Reject = ``deny``. Seguidores coalescidos no generan push: adoptan la
    decisión del líder, cuya notificación ya está en el teléfono.
    """
    if payload.get("surface") == "cli":
        return  # el terminal ya muestra el prompt
    if payload.get("coalesced"):
        return  # espera coalescida: la notificación del líder ya salió
    if context.get_ctx() is None:
        return
    profile = _profile_of(payload)
    session_key = str(payload.get("session_key") or "") or profile
    command = str(payload.get("command") or "")
    approval = {
        "session_key": session_key,
        "request_id": _approval_request_id(session_key, command),
        "command": _truncate(command, 160),
    }
    key = "wait:" + ":".join(str(payload.get(k) or "")
                             for k in ("turn_id", "tool_call_id", "session_id", "request_id"))
    _enqueue("necesita", key, profile, None, "approval_wait",
             f"/chat/{_urlseg(profile)}", f"droidbot:{profile}", approval=approval)


def _on_human_input_request(**payload: Any) -> None:
    """Espera humana (aclaración / sudo). Las aprobaciones las cubre
    ``pre_approval_request`` (acá no hay turn_id: la misma aprobación
    dispararía un push duplicado con otro event_key)."""
    if payload.get("platform") == "cli":
        return
    if payload.get("kind") == "approval":
        return
    if context.get_ctx() is None:
        return
    kind = payload.get("kind") or ""
    profile = _profile_of(payload)
    if kind == "clarify":
        body_key = "clarify_wait"
    elif kind == "sudo":
        body_key = "sudo_wait"
    else:
        body_key = "wait"
    key = "wait:" + ":".join(str(payload.get(k) or "")
                             for k in ("turn_id", "tool_call_id", "session_id", "request_id"))
    _enqueue("necesita", key, profile, None, body_key,
             f"/chat/{_urlseg(profile)}", f"droidbot:{profile}")


def _on_room_member_activity(**payload: Any) -> None:
    """Un grupo espera la aprobación de un miembro (kind=request.opened)."""
    if payload.get("kind") != "request.opened":
        return
    if context.get_ctx() is None:
        return
    room = payload.get("room_id") or ""
    if not room:
        return
    profile = _profile_of(payload)
    key = "room:" + ":".join(str(payload.get(k) or "") for k in ("room_id", "turn_id"))
    _enqueue("necesita", key, profile, "room_wait_title", "room_wait_body",
             f"/group/{_urlseg(room)}", f"droidbot:room:{room}")


# browser_vault actions that open a secure prompt on the phone (vault.save_login /
# vault.code / vault.unlock_prompt). Hermes does not wrap those in
# on_human_input_request, so we observe the tool call itself (never block it).
_VAULT_PROMPTS = {
    "save_login": "vault_login",
    "enter_code": "vault_code",
    "unlock": "vault_unlock",
}


def _on_pre_tool_call(**payload: Any) -> None:
    if payload.get("tool_name") != "browser_vault":
        return None
    args = payload.get("args") or {}
    body_key = _VAULT_PROMPTS.get(str(args.get("action") or "")) if isinstance(args, dict) else None
    if body_key is None or context.get_ctx() is None:
        return None
    profile = _profile_of(payload)
    key = "vault:" + ":".join(str(payload.get(k) or "") for k in ("turn_id", "tool_call_id", "session_id"))
    _enqueue("necesita", key, profile, None, body_key, f"/chat/{_urlseg(profile)}", f"droidbot:{profile}")
    return None


def register(ctx: Any) -> None:
    context.set_ctx(ctx)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("on_human_input_request", _on_human_input_request)
    ctx.register_hook("on_room_member_activity", _on_room_member_activity)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    try:
        webpush.ensure_vapid()
    except Exception as exc:
        logger.warning("VAPID ensure falló (los sends reintentarán): %s", exc)
    logger.info("droidbot-push registrado (profile=%s)", getattr(ctx, "profile_name", "?"))


__all__ = ["register"]
