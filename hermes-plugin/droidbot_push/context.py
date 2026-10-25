"""Contexto compartido del plugin (cargado en serve, gateway y web server).

``register(ctx)`` deja el PluginContext acá. En el proceso del web server (que
no carga plugins) el estado cae al mismo archivo perfil de ``ctx.state`` vía
``PluginState`` — mismo path, así la llave VAPID es la misma en todos los
procesos.
"""
from __future__ import annotations

import threading
from typing import Any

_ctx: Any = None
_lock = threading.Lock()
_test_state: dict[str, Any] | None = None


def set_ctx(ctx: Any) -> None:
    global _ctx
    with _lock:
        _ctx = ctx


def get_ctx() -> Any:
    with _lock:
        return _ctx


def set_test_state(state: dict[str, Any]) -> None:
    """Sobreescribe el estado para tests."""
    global _test_state
    _test_state = state


def clear_test_state() -> None:
    global _test_state
    _test_state = None


def state() -> Any:
    """``ctx.state`` (PluginState con get/set) o un dict en memoria (tests)."""
    with _lock:
        if _test_state is not None:
            return _test_state
        if _ctx is not None:
            try:
                return _ctx.state
            except Exception:
                pass
        # Web server process (sin register): mismo PluginState que usaría el
        # ctx — mismo archivo, misma llave VAPID.
        try:
            from hermes_cli.plugins_state import PluginState
            return PluginState("droidbot-push", "")
        except Exception:
            pass
        return _test_state if _test_state is not None else {}
