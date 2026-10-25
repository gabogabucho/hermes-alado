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
    result = webpush.send_for("termina", "evt", "bot", "Bot", "Terminó", "/chat/bot", "t")
    assert result == {"sent": 0, "pref_off": 1}


def test_send_for_rate_limited(monkeypatch):
    storage.upsert_subscription({"endpoint": "https://push/1", "p256dh": "p", "auth": "a"})
    monkeypatch.setattr(webpush, "send_to_endpoint", lambda subscription, payload: True)
    result1 = webpush.send_for("necesita", "evt-1", "bot", "Bot", "Espera", "/chat/bot", "t")
    assert "rate_limited" not in result1
    result2 = webpush.send_for("necesita", "evt-2", "bot", "Bot", "Espera", "/chat/bot", "t")
    assert "rate_limited" in result2 and result2["sent"] == 0
