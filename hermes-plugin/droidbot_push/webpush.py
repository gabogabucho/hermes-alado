"""Web Push para droidbot-push: VAPID, payload y envío con pywebpush.

Sin dependencias de Hermes al importar (todo lazy): los tests pueden importar
este módulo sin el entorno completo.
"""
from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any

from . import context
from . import storage

logger = logging.getLogger("droidbot-push.webpush")

VAPID_STATE_KEY = "vapid"
_DEFAULT_SUBJECT = "mailto:admin@droidbot.local"
_DEFAULT_RATE_LIMIT = 30.0
_PUSH_TTL_SECONDS = 4 * 3600
_BODY_MAX_CHARS = 120


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _state_set(key: str, value: Any) -> None:
    state = context.state()
    if hasattr(state, "set"):
        state.set(key, value)
    else:  # dict en memoria (tests)
        state[key] = value


def _state_get(key: str, default: Any = None) -> Any:
    state = context.state()
    if hasattr(state, "get"):
        return state.get(key, default)
    return state.get(key, default) if isinstance(state, dict) else default


def ensure_vapid() -> None:
    """Genera el par VAPID una sola vez y lo persiste en ``ctx.state``."""
    if _state_get(VAPID_STATE_KEY):
        return
    from cryptography.hazmat.primitives.asymmetric import ec
    private_key = ec.generate_private_key(ec.SECP256R1())
    from cryptography.hazmat.primitives import serialization
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_numbers = private_key.public_key().public_numbers()
    public_raw = b"\x04" + public_numbers.x.to_bytes(32, "big") + public_numbers.y.to_bytes(32, "big")
    _state_set(VAPID_STATE_KEY, {
        "private": _b64url_encode(private_pem),
        "public": _b64url_encode(public_raw),
    })


def vapid_public_key() -> str:
    """La llave pública VAPID (base64url sin padding) para el PushManager."""
    entry = _state_get(VAPID_STATE_KEY)
    if isinstance(entry, dict) and entry.get("public"):
        return str(entry["public"])
    ensure_vapid()
    entry = _state_get(VAPID_STATE_KEY)
    if isinstance(entry, dict) and entry.get("public"):
        return str(entry["public"])
    return ""


def _vapid_private_key() -> bytes:
    entry = _state_get(VAPID_STATE_KEY)
    if isinstance(entry, dict) and entry.get("private"):
        return _b64url_decode(str(entry["private"]))
    return b""


def _subject() -> str:
    ctx = context.get_ctx()
    if ctx is not None:
        try:
            configured = ctx.get_config("subject", _DEFAULT_SUBJECT)
            if isinstance(configured, str) and configured.strip():
                return configured.strip()
        except Exception:
            pass
    return _DEFAULT_SUBJECT


def _rate_limit() -> float:
    ctx = context.get_ctx()
    if ctx is not None:
        try:
            configured = ctx.get_config("rate_limit_seconds", _DEFAULT_RATE_LIMIT)
            return max(0.0, float(configured))
        except Exception:
            pass
    return _DEFAULT_RATE_LIMIT


def truncate_body(text: str, limit: int = _BODY_MAX_CHARS) -> str:
    """Cuerpo de push: primer `limit` de caracteres, cortando en espacio."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rstrip()
    return f"{cut}…"


def build_payload(title: str, body: str, url: str, tag: str) -> dict[str, Any]:
    """Payload del push: {title, body, url, tag} + TTL. Icon/badge los pone el SW."""
    return {
        "title": title or "DroidBot",
        "body": truncate_body(body),
        "url": url,
        "tag": tag,
        "ttl": _PUSH_TTL_SECONDS,
    }


def _is_expired_status(status_code: int | None) -> bool:
    return status_code in (404, 410)


def send_to_endpoint(subscription: dict[str, Any], payload: dict[str, Any]) -> bool:
    """Envía un push a una suscripción. False si la suscripción expiró (404/410).

    Importa pywebpush recién acá: es una dependencia declarada del plugin que
    el PM de Hermes instala con consentimiento.
    """
    endpoint = subscription.get("endpoint")
    p256dh = subscription.get("p256dh")
    auth = subscription.get("auth")
    if not endpoint or not p256dh or not auth:
        return False
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=_vapid_private_key(),
            vapid_claims={"sub": _subject(), "exp": int(time.time()) + 12 * 3600},
            ttl=_PUSH_TTL_SECONDS,
            timeout=10,
        )
        return True
    except Exception as exc:  # WebPushException o red; no dejar caer el turno
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if _is_expired_status(status_code):
            logger.info("pruning expired subscription %s (status=%s)", endpoint, status_code)
            storage.delete_subscription(str(endpoint))
            return False
        logger.debug("push to %s failed: %s", endpoint, exc)
        return True  # no es 404/410: reintentará en el próximo evento


def send_for(kind: str, event_key: str, profile: str, title: str, body: str,
             url: str, tag: str) -> dict[str, int]:
    """Camino común de los hooks: dedupe cross-process + rate limit + envío.

    ``kind`` ∈ {"termina", "necesita"}: filtra suscripciones por la preferencia
    del perfil (defaults: activas). Devuelve un resumen para logs/tests.
    """
    prefs = storage.get_prefs(profile)
    if not prefs.get(kind, True):
        return {"sent": 0, "pref_off": 1}
    if not storage.rate_ok(profile, _rate_limit()):
        return {"sent": 0, "rate_limited": 1}
    payload = build_payload(title, body, url, tag)
    sent = 0
    for subscription in storage.list_subscriptions():
        if not storage.dedupe_claim(event_key, str(subscription["endpoint"])):
            continue
        try:
            if send_to_endpoint(subscription, payload):
                sent += 1
        except Exception as exc:
            logger.warning("send_to_endpoint raised: %s", exc)
    return {"sent": sent}


def send_test(device_id: str | None) -> dict[str, int]:
    """Push de prueba para un dispositivo (o todos si no hay device_id)."""
    sent = 0
    for subscription in storage.list_subscriptions():
        if device_id and subscription.get("device_id") != device_id:
            continue
        payload = build_payload(
            "DroidBot", "Esto es una prueba: las notificaciones funcionan.",
            "/", f"droidbot:test:{int(time.time())}",
        )
        try:
            if send_to_endpoint(subscription, payload):
                sent += 1
        except Exception as exc:
            logger.warning("test push failed: %s", exc)
    return {"sent": sent}
