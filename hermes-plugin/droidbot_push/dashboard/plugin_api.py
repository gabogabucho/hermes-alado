"""REST de droidbot-push, montado por Hermes en ``/api/plugins/droidbot-push/``.

La auth del dashboard se hereda automáticamente (middleware de sesión antes
del router). El web server importa este archivo por path (no como paquete),
así que arreglamos sys.path y usamos nombres de módulo estables.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

_plugin_parent = str(Path(__file__).resolve().parents[2])
if _plugin_parent not in sys.path:
    sys.path.insert(0, _plugin_parent)

from fastapi import APIRouter, Header, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from droidbot_push import storage, webpush  # noqa: E402

router = APIRouter()


class SubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    device_id: Optional[str] = None
    device_label: Optional[str] = None


class PrefsBody(BaseModel):
    profile: str
    termina: Optional[bool] = None
    necesita: Optional[bool] = None


class DeleteBody(BaseModel):
    endpoint: Optional[str] = None
    device_id: Optional[str] = None


class TestBody(BaseModel):
    device_id: Optional[str] = None


def _device_id(x_device_id: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    value = (x_device_id or "").strip() or (fallback or "").strip()
    return value or None


@router.get("/vapid-public-key")
def get_vapid_public_key() -> dict[str, str]:
    """Llave pública VAPID (base64url sin padding) para el PushManager."""
    try:
        key = webpush.vapid_public_key()
    except Exception as exc:  # pragma: no cover - la llave se autogenera
        raise HTTPException(status_code=500, detail=f"VAPID no disponible: {exc}") from exc
    if not key:
        raise HTTPException(status_code=503, detail="plugin no inicializado")
    return {"key": key}


@router.post("/subscribe")
def subscribe(body: SubscribeBody, x_device_id: Optional[str] = Header(default=None)) -> dict[str, Any]:
    try:
        storage.upsert_subscription({
            "endpoint": body.endpoint,
            "p256dh": body.p256dh,
            "auth": body.auth,
            "device_id": _device_id(x_device_id, body.device_id),
            "device_label": body.device_label,
        })
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/subscribe")
def unsubscribe(body: DeleteBody, x_device_id: Optional[str] = Header(default=None)) -> dict[str, Any]:
    device = _device_id(x_device_id, body.device_id)
    removed = 0
    for subscription in list(storage.list_subscriptions()):
        if body.endpoint and subscription["endpoint"] == body.endpoint:
            storage.delete_subscription(subscription["endpoint"])
            removed += 1
        elif not body.endpoint and device and subscription.get("device_id") == device:
            storage.delete_subscription(subscription["endpoint"])
            removed += 1
    return {"ok": True, "removed": removed}


@router.get("/prefs")
def get_prefs() -> dict[str, Any]:
    """Todas las preferencias guardadas; el cliente aplica los defaults."""
    return {"prefs": storage.all_prefs()}


@router.put("/prefs")
def put_prefs(body: PrefsBody) -> dict[str, Any]:
    current = storage.get_prefs(body.profile)
    if body.termina is not None:
        current["termina"] = body.termina
    if body.necesita is not None:
        current["necesita"] = body.necesita
    return {"prefs": {body.profile: storage.set_prefs(body.profile, current)}}


@router.post("/test")
def test_push(body: TestBody, x_device_id: Optional[str] = Header(default=None)) -> dict[str, Any]:
    result = webpush.send_test(_device_id(x_device_id, body.device_id))
    if result["sent"] == 0:
        raise HTTPException(status_code=404, detail="no hay suscripciones para este dispositivo")
    return result
