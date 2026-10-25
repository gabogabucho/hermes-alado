"""droidbot-push plugin — Web Push para DroidBot.

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


def _enqueue(kind: str, event_key: str, profile: str, title: str, body: str,
             url: str, tag: str) -> None:
    """Hilo daemon: el send HTTP (pywebpush) jamás bloquea el turno."""
    def _run() -> None:
        try:
            webpush.send_for(kind, event_key, profile, title, body, url, tag)
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
    if platform == "cron":
        title, body = profile, "Rutina terminada"
    else:
        title, body = profile, "Turno terminado"
    url = f"/chat/{_urlseg(profile)}"
    key = "turn:" + ":".join(str(payload.get(k) or "") for k in ("session_id", "turn_id", "task_id"))
    _enqueue("termina", key, profile, title, body, url, f"droidbot:{profile}")


def _on_pre_approval_request(**payload: Any) -> None:
    """El bot espera una aprobación (surface gateway/local)."""
    if payload.get("surface") == "cli":
        return  # el terminal ya muestra el prompt
    if context.get_ctx() is None:
        return
    profile = _profile_of(payload)
    key = "wait:" + ":".join(str(payload.get(k) or "")
                             for k in ("turn_id", "tool_call_id", "session_id", "request_id"))
    _enqueue("necesita", key, profile, profile, "Te necesita para aprobar…",
             f"/chat/{_urlseg(profile)}", f"droidbot:{profile}")


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
        body = "Te necesita para responder…"
    elif kind == "sudo":
        body = "Te necesita para una contraseña…"
    else:
        body = "Te necesita…"
    key = "wait:" + ":".join(str(payload.get(k) or "")
                             for k in ("turn_id", "tool_call_id", "session_id", "request_id"))
    _enqueue("necesita", key, profile, profile, body,
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
    _enqueue("necesita", key, profile, "El grupo te necesita", "Espera una aprobación",
             f"/group/{_urlseg(room)}", f"droidbot:room:{room}")


def register(ctx: Any) -> None:
    context.set_ctx(ctx)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("on_human_input_request", _on_human_input_request)
    ctx.register_hook("on_room_member_activity", _on_room_member_activity)
    try:
        webpush.ensure_vapid()
    except Exception as exc:
        logger.warning("VAPID ensure falló (los sends reintentarán): %s", exc)
    logger.info("droidbot-push registrado (profile=%s)", getattr(ctx, "profile_name", "?"))


__all__ = ["register"]
