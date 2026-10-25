"""SQLite del plugin droidbot-push.

Vive en ``<hermes home>/plugin-data/droidbot-push/data.db`` (WAL) — el mismo
archivo para los procesos serve y gateway, así el dedupe, las suscripciones y
las preferencias se comparten entre procesos. El path es inyectable para tests.
"""
from __future__ import annotations

import sqlite3
import threading
import time
from typing import Any

PLUGIN_NAME = "droidbot-push"

_conn: sqlite3.Connection | None = None
_override_path: str | None = None
_lock = threading.Lock()


def set_test_db(path: str) -> None:
    """Sobreescribe el path del SQLite (solo tests)."""
    global _conn, _override_path
    with _lock:
        _conn = None
        _override_path = path


def reset_for_tests() -> None:
    global _conn, _override_path
    with _lock:
        _conn = None
        _override_path = None


def _plugin_db() -> sqlite3.Connection:
    if _override_path:
        conn = sqlite3.connect(_override_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn
    from plugins.plugin_storage import plugin_db
    return plugin_db(PLUGIN_NAME)


def get_conn() -> sqlite3.Connection:
    """Conexión compartida por proceso; un ``with conn:`` por operación."""
    global _conn
    with _lock:
        if _conn is None:
            _conn = _plugin_db()
            _init_schema(_conn)
        return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    with conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS subscriptions (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 endpoint TEXT NOT NULL UNIQUE,
                 p256dh TEXT NOT NULL,
                 auth TEXT NOT NULL,
                 device_id TEXT,
                 device_label TEXT,
                 created_at REAL NOT NULL
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS prefs (
                 profile TEXT PRIMARY KEY,
                 termina INTEGER NOT NULL DEFAULT 1,
                 necesita INTEGER NOT NULL DEFAULT 1,
                 updated_at REAL NOT NULL
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sent_events (
                 event_key TEXT NOT NULL,
                 endpoint TEXT NOT NULL,
                 sent_at REAL NOT NULL,
                 PRIMARY KEY (event_key, endpoint)
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS ix_sent_events_sent_at ON sent_events (sent_at)")


# ── suscripciones ────────────────────────────────────────────────────────────

def upsert_subscription(sub: dict[str, Any]) -> None:
    """INSERT/UPDATE por endpoint (clave natural del push service)."""
    endpoint = str(sub.get("endpoint") or "")
    if not endpoint.startswith("https://"):
        raise ValueError("subscription endpoint debe ser https")
    p256dh = str(sub.get("p256dh") or "")
    auth = str(sub.get("auth") or "")
    if not p256dh or not auth:
        raise ValueError("subscription sin keys")
    conn = get_conn()
    with _lock:
        with conn:
            conn.execute(
                """INSERT INTO subscriptions (endpoint, p256dh, auth, device_id, device_label, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(endpoint) DO UPDATE SET
                     p256dh = excluded.p256dh, auth = excluded.auth,
                     device_id = excluded.device_id, device_label = excluded.device_label""",
                (endpoint, p256dh, auth, sub.get("device_id"), sub.get("device_label"), time.time()),
            )


def delete_subscription(endpoint: str) -> bool:
    conn = get_conn()
    with _lock:
        with conn:
            cur = conn.execute("DELETE FROM subscriptions WHERE endpoint = ?", (endpoint,))
            return cur.rowcount > 0


def list_subscriptions() -> list[dict[str, Any]]:
    conn = get_conn()
    with _lock:
        rows = conn.execute(
            "SELECT endpoint, p256dh, auth, device_id, device_label FROM subscriptions"
        ).fetchall()
    return [dict(r) for r in rows]


# ── prefs ────────────────────────────────────────────────────────────────────

_DEFAULT_PREFS = {"termina": True, "necesita": True}


def normalize_prefs(raw: dict[str, Any] | None) -> dict[str, bool]:
    """Filtra {termina, necesita} a bools con defaults."""
    raw = raw or {}
    return {
        "termina": bool(raw.get("termina", True)),
        "necesita": bool(raw.get("necesita", True)),
    }


def get_prefs(profile: str) -> dict[str, bool]:
    conn = get_conn()
    with _lock:
        row = conn.execute(
            "SELECT termina, necesita FROM prefs WHERE profile = ?", (profile,)
        ).fetchone()
    if row is None:
        return dict(_DEFAULT_PREFS)
    return {"termina": bool(row["termina"]), "necesita": bool(row["necesita"])}


def set_prefs(profile: str, prefs: dict[str, Any]) -> dict[str, bool]:
    norm = normalize_prefs(prefs)
    conn = get_conn()
    with _lock:
        with conn:
            conn.execute(
                """INSERT INTO prefs (profile, termina, necesita, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(profile) DO UPDATE SET
                     termina = excluded.termina, necesita = excluded.necesita,
                     updated_at = excluded.updated_at""",
                (profile, int(norm["termina"]), int(norm["necesita"]), time.time()),
            )
    return norm


def all_prefs() -> dict[str, dict[str, bool]]:
    conn = get_conn()
    with _lock:
        rows = conn.execute("SELECT profile, termina, necesita FROM prefs").fetchall()
    return {r["profile"]: {"termina": bool(r["termina"]), "necesita": bool(r["necesita"])} for r in rows}


# ── dedupe + rate limit (cross-process, atómicos) ────────────────────────────

_SENT_TTL_SECONDS = 6 * 3600  # un mismo evento no se reenvía por 6 h


def dedupe_claim(event_key: str, endpoint: str) -> bool:
    """True si ESTE proceso gana el reclamo (INSERT ok) y debe enviar."""
    conn = get_conn()
    now = time.time()
    with _lock:
        try:
            with conn:
                conn.execute(
                    "INSERT INTO sent_events (event_key, endpoint, sent_at) VALUES (?, ?, ?)",
                    (event_key, endpoint, now),
                )
            return True
        except sqlite3.IntegrityError:
            return False


def prune_sent_events() -> int:
    conn = get_conn()
    cutoff = time.time() - _SENT_TTL_SECONDS
    with _lock:
        with conn:
            cur = conn.execute("DELETE FROM sent_events WHERE sent_at < ?", (cutoff,))
            return cur.rowcount


def rate_ok(profile: str, min_gap_seconds: float) -> bool:
    """True si pasaron >= min_gap_seconds desde el último send de este perfil.

    Persistido en ``sent_events`` con event_key ``__rate__:<profile>`` para que
    el rate limit también sea cross-process.
    """
    if min_gap_seconds <= 0:
        return True
    key = f"__rate__:{profile}"
    conn = get_conn()
    now = time.time()
    with _lock:
        row = conn.execute(
            "SELECT sent_at FROM sent_events WHERE event_key = ? ORDER BY sent_at DESC LIMIT 1", (key,)
        ).fetchone()
        if row is not None and now - row["sent_at"] < min_gap_seconds:
            return False
        with conn:
            conn.execute(
                """INSERT INTO sent_events (event_key, endpoint, sent_at) VALUES (?, ?, ?)
                   ON CONFLICT(event_key, endpoint) DO UPDATE SET sent_at = excluded.sent_at""",
                (key, f"__rate__:{profile}", now),
            )
    return True
