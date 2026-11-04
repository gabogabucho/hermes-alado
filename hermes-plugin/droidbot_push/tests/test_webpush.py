"""Tests puros del plugin droidbot-push (sin Hermes cargado).

Correr desde la raíz del plugin:
    python -m pytest tests/ -q
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

_plugin_root = str(Path(__file__).resolve().parents[2])
if _plugin_root not in sys.path:
    sys.path.insert(0, _plugin_root)

import pytest  # noqa: E402

from droidbot_push import context, storage, webpush  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh(tmp_path):
    storage.set_test_db(str(tmp_path / "push.db"))
    context.set_test_state({})
    yield
    storage.reset_for_tests()
    context.clear_test_state()


# ── payload ──────────────────────────────────────────────────────────────────

def test_truncate_body_short():
    assert webpush.truncate_body("hola") == "hola"


def test_truncate_body_long():
    assert webpush.truncate_body("x" * 300).endswith("…")
    assert len(webpush.truncate_body("x" * 300)) <= webpush._BODY_MAX_CHARS + 1


def test_build_payload_shape():
    payload = webpush.build_payload("Bot", "Terminó", "/chat/bot", "tag")
    assert payload["title"] == "Bot"
    assert payload["body"] == "Terminó"
    assert payload["url"] == "/chat/bot"
    assert payload["tag"] == "tag"
    assert payload["ttl"] == webpush._PUSH_TTL_SECONDS


def test_vapid_generate_and_stable():
    webpush.ensure_vapid()
    first = webpush.vapid_public_key()
    webpush.ensure_vapid()
    assert webpush.vapid_public_key() == first  # no se regenera
    # clave EC P-256 pública sin comprimir: 0x04 + 64 bytes → 65 bytes
    import base64
    raw = base64.urlsafe_b64decode(first + "=" * (-len(first) % 4))
    assert raw[0] == 0x04
    assert len(raw) == 65


# ── storage: suscripciones ───────────────────────────────────────────────────

def test_subscription_roundtrip_and_upsert():
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a",
                                 "device_id": "dev-1", "device_label": "Pixel"})
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p2", "auth": "a2",
                                 "device_id": "dev-1", "device_label": "Pixel 2"})
    subs = storage.list_subscriptions()
    assert len(subs) == 1
    assert subs[0]["p256dh"] == "p2"


def test_subscription_locale_roundtrip():
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a", "locale": "es"})
    storage.upsert_subscription({"endpoint": "https://push/2", "p256dh": "p", "auth": "a", "locale": "en"})
    storage.upsert_subscription({"endpoint": "https://push/3", "p256dh": "p", "auth": "a"})
    by_endpoint = {s["endpoint"]: s for s in storage.list_subscriptions()}
    assert by_endpoint["https://push/1"]["locale"] == "es"
    assert by_endpoint["https://push/2"]["locale"] == "en"
    assert by_endpoint["https://push/3"]["locale"] is None  # legacy rows keep NULL


def test_subscription_locale_rejects_junk():
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a", "locale": "fr"})
    subs = storage.list_subscriptions()
    assert subs[0]["locale"] is None


def test_delete_subscription():
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a"})
    assert storage.delete_subscription("https://push/1") is True
    assert storage.list_subscriptions() == []


# ── storage: prefs ───────────────────────────────────────────────────────────

def test_prefs_defaults():
    assert storage.get_prefs("bot") == {"termina": True, "necesita": True}


def test_prefs_roundtrip():
    storage.set_prefs("bot", {"termina": False, "necesita": True})
    assert storage.get_prefs("bot") == {"termina": False, "necesita": True}
    assert storage.all_prefs()["bot"] == {"termina": False, "necesita": True}


def test_prefs_partial_update_preserves():
    storage.set_prefs("bot", {"termina": False, "necesita": True})
    storage.set_prefs("bot", {"necesita": False})
    assert storage.get_prefs("bot") == {"termina": True, "necesita": False}


def test_normalize_prefs_filters_junk():
    assert storage.normalize_prefs({"termina": "yes", "necesita": 0, "extra": 1}) == {
        "termina": True, "necesita": False}


# ── storage: dedupe + rate limit ─────────────────────────────────────────────

def test_dedupe_claim_second_call_false():
    assert storage.dedupe_claim("evt-1", "https://push/1") is True
    assert storage.dedupe_claim("evt-1", "https://push/1") is False
    assert storage.dedupe_claim("evt-2", "https://push/1") is True


def test_rate_limit():
    assert storage.rate_ok("bot", 1.0) is True
    assert storage.rate_ok("bot", 1.0) is False
    time.sleep(1.05)
    assert storage.rate_ok("bot", 1.0) is True


def test_rate_limit_zero_disabled():
    assert storage.rate_ok("bot", 0.0) is True
    assert storage.rate_ok("bot", 0.0) is True


# ── send_for: pref off y rate limit (sin red) ────────────────────────────────

def test_send_for_pref_off_skips():
    storage.set_prefs("bot", {"termina": False, "necesita": True})
    result = webpush.send_for("termina", "evt", "bot", None, "turn_done", "/chat/bot", "t")
    assert result == {"sent": 0, "pref_off": 1}


def test_send_for_rate_limited(monkeypatch):
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a"})
    monkeypatch.setattr(webpush, "send_to_endpoint", lambda subscription, payload: True)
    result1 = webpush.send_for("necesita", "evt-1", "bot", None, "wait", "/chat/bot", "t")
    assert "rate_limited" not in result1
    result2 = webpush.send_for("necesita", "evt-2", "bot", None, "wait", "/chat/bot", "t")
    assert "rate_limited" in result2 and result2["sent"] == 0


# ── envío localizado por suscripción ─────────────────────────────────────────

def _locale_payloads(monkeypatch, monkey_locale=None):
    """Suscribe en/es/legacy y devuelve los payloads que vería cada endpoint."""
    storage.upsert_subscription({"endpoint": "https://push/es", "p256dh": "p", "auth": "a", "locale": "es"})
    storage.upsert_subscription({"endpoint": "https://push/en", "p256dh": "p", "auth": "a", "locale": "en"})
    storage.upsert_subscription({"endpoint": "https://push/legacy", "p256dh": "p", "auth": "a"})
    if monkey_locale:
        monkeypatch.setattr(webpush, "subscription_locale", monkey_locale)
    seen = {}
    def capture(subscription, payload):
        seen[str(subscription["endpoint"])] = payload
        return True
    monkeypatch.setattr(webpush, "send_to_endpoint", capture)
    webpush.send_for("termina", "evt", "bot", None, "turn_done", "/chat/bot", "t")
    return seen


def test_send_for_localizes_per_subscription(monkeypatch):
    seen = _locale_payloads(monkeypatch)
    assert seen["https://push/es"]["title"] == "bot"  # title es el perfil
    assert seen["https://push/es"]["body"] == "Turno terminado"
    assert seen["https://push/en"]["body"] == "Turn finished"
    # Retrocompatibilidad: la suscripción sin locale (pre-locale) recibe español.
    assert seen["https://push/legacy"]["body"] == "Turno terminado"


def test_send_for_title_key_localized(monkeypatch):
    storage.upsert_subscription({"endpoint": "https://push/es", "p256dh": "p", "auth": "a", "locale": "es"})
    storage.upsert_subscription({"endpoint": "https://push/en", "p256dh": "p", "auth": "a", "locale": "en"})
    seen = {}
    def capture(subscription, payload):
        seen[str(subscription["endpoint"])] = payload
        return True
    monkeypatch.setattr(webpush, "send_to_endpoint", capture)
    webpush.send_for("necesita", "evt", "bot", "room_wait_title", "room_wait_body", "/group/x", "t")
    assert seen["https://push/es"]["title"] == "El grupo te necesita"
    assert seen["https://push/es"]["body"] == "Espera una aprobación"
    assert seen["https://push/en"]["title"] == "The group needs you"
    assert seen["https://push/en"]["body"] == "Waiting for an approval"


def test_send_test_localized(monkeypatch):
    storage.upsert_subscription({"endpoint": "https://push/es", "p256dh": "p", "auth": "a", "locale": "es"})
    storage.upsert_subscription({"endpoint": "https://push/en", "p256dh": "p", "auth": "a", "locale": "en"})
    seen = {}
    def capture(subscription, payload):
        seen[str(subscription["endpoint"])] = payload
        return True
    monkeypatch.setattr(webpush, "send_to_endpoint", capture)
    result = webpush.send_test(None)
    assert result == {"sent": 2}
    assert seen["https://push/es"]["body"] == "Esto es una prueba: las notificaciones funcionan."
    assert seen["https://push/en"]["body"] == "This is a test: notifications work."


def test_unknown_locale_falls_back_to_english(monkeypatch):
    def fake_locale(subscription):
        return "xx"
    seen = _locale_payloads(monkeypatch, monkey_locale=fake_locale)
    assert seen["https://push/es"]["body"] == "Turn finished"


# ── aprobaciones con botones Approve/Reject ─────────────────────────────────

_APPROVAL = {"session_key": "bot", "request_id": "rid-1", "command": "rm -rf /tmp/x"}


def test_build_payload_without_approval_has_no_actions():
    payload = webpush.build_payload("Bot", "Te necesita…", "/chat/bot", "t")
    assert "approval" not in payload and "actions" not in payload and "confirm" not in payload


def test_build_payload_with_approval_carries_actions_and_confirm():
    payload = webpush.build_payload(
        "Bot", "Te necesita…", "/chat/bot", "t",
        approval=_APPROVAL,
        action_titles={"approve": "Aprobar", "reject": "Rechazar",
                       "confirm_approve": "✓ Aprobado", "confirm_reject": "✗ Rechazado"})
    assert payload["approval"] == _APPROVAL
    assert payload["actions"] == [
        {"action": "approve", "title": "Aprobar"},
        {"action": "reject", "title": "Rechazar"},
    ]
    assert payload["confirm"]["approve"] == "✓ Aprobado"


def test_send_for_approval_localized_per_subscription(monkeypatch):
    storage.upsert_subscription({"endpoint": "https://push/es", "p256dh": "p", "auth": "a", "locale": "es"})
    storage.upsert_subscription({"endpoint": "https://push/en", "p256dh": "p", "auth": "a", "locale": "en"})
    seen = {}
    def capture(subscription, payload):
        seen[str(subscription["endpoint"])] = payload
        return True
    monkeypatch.setattr(webpush, "send_to_endpoint", capture)
    webpush.send_for("necesita", "evt", "bot", None, "approval_wait", "/chat/bot", "t",
                     approval=_APPROVAL)
    assert seen["https://push/es"]["approval"] == _APPROVAL
    assert [a["title"] for a in seen["https://push/es"]["actions"]] == ["Aprobar", "Rechazar"]
    assert seen["https://push/en"]["actions"][0]["title"] == "Approve"
    assert seen["https://push/en"]["confirm"]["reject"] == "✗ Rejected"
