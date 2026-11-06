"""Memoria por bot para la PWA: leer y borrar entradas de MEMORY.md / USER.md.

El gateway no expone la memoria curada por perfil (``learning.*`` opera sobre
el home del proceso), así que el plugin — que corre en el proceso serve junto
al filesystem — la lee directamente con el MISMO formato que
``tools.memory_tool_store``: entradas unidas por ``\\n§\\n`` en
``<profile>/memories/MEMORY.md`` y ``USER.md``.

Borrar una entrada reescribe el archivo (temp + rename atómico, backup
``.bak``) quitando exactamente esa entrada: el id viaja al cliente y vuelve
con un check de staleness (sha del texto) para no borrar la equivocada si el
bot consolidó memoria mientras tanto.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
from pathlib import Path
from typing import Any

ENTRY_DELIMITER = "\n§\n"
_ID_LEN = 12
_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

TARGETS = {"memory": "MEMORY.md", "user": "USER.md"}


def _entry_id(text: str) -> str:
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:_ID_LEN]


def _resolve_profile_dir(name: str) -> Path:
    """Directorio del perfil usando el MISMO resolver que el gateway."""
    if not _NAME_RE.match(name or ""):
        raise ValueError("invalid profile name")
    try:
        from hermes_cli.profiles import get_profile_dir
        return Path(get_profile_dir(name))
    except Exception:
        # Sin Hermes importable (tests): layout estándar <home>/profiles/<name>
        from hermes_constants import get_hermes_home
        return get_hermes_home() / "profiles" / name


def _entries_file(profile: str, target: str) -> Path:
    filename = TARGETS.get(target)
    if filename is None:
        raise ValueError("invalid target")
    profile_dir = _resolve_profile_dir(profile)
    if not profile_dir.is_dir():
        raise FileNotFoundError(f"profile '{profile}' not found")
    return profile_dir / "memories" / filename


def _split_entries(raw: str) -> list[str]:
    return [entry.strip() for entry in raw.split(ENTRY_DELIMITER) if entry.strip()]


def read_memory(profile: str) -> dict[str, Any]:
    """Entradas de MEMORY.md y USER.md con ids estables para el borrado."""
    out: dict[str, Any] = {"memory": [], "user": []}
    for target in TARGETS:
        path = _entries_file(profile, target)
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8-sig")
        out[target] = [
            {"id": _entry_id(entry), "text": entry}
            for entry in _split_entries(raw)
        ]
    return out


def delete_entry(profile: str, target: str, entry_id: str) -> dict[str, Any]:
    """Quita UNA entrada por id (sha1 del texto). Stale id → 409-ish dict."""
    path = _entries_file(profile, target)
    if not path.is_file():
        return {"ok": False, "message": "nothing to delete"}
    raw = path.read_text(encoding="utf-8-sig")
    entries = _split_entries(raw)
    remaining = [e for e in entries if _entry_id(e) != entry_id]
    if len(remaining) == len(entries):
        return {"ok": False, "message": "entry not found (it may have changed — refresh)"}
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(ENTRY_DELIMITER.join(remaining), encoding="utf-8")
    try:
        shutil.copy2(path, path.with_name(path.name + ".bak"))
    except OSError:
        pass  # el backup es best-effort; el delete no depende de él
    os.replace(tmp, path)
    return {"ok": True, "removed": 1}
