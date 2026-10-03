"""Shared helpers for the WorldStat Atlas data pipeline.

Every step writes structured log events through `ImportLog` so that any value
in the published snapshot can be traced back to the run, source file and
checksum it came from.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
RAW = DATA / "raw"
WORK = DATA / "work"
REGISTRY = DATA / "registry"
CURATED = DATA / "curated"
LOGS = DATA / "logs"
EXPORTS = DATA / "exports"
PUBLIC_DATA = ROOT / "public" / "data"
PIPELINE_NODE_BIN = ROOT / "scripts" / "pipeline" / "node_modules" / ".bin"

for _p in (RAW, WORK, LOGS, EXPORTS, PUBLIC_DATA):
    _p.mkdir(parents=True, exist_ok=True)


def utcnow() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class ImportLog:
    """Append-only JSONL log + in-memory summary for one pipeline run."""

    def __init__(self, run_id: str | None = None):
        self.run_id = run_id or _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.path = LOGS / f"pipeline-{self.run_id}.jsonl"
        self.events: list[dict[str, Any]] = []
        self.counts: dict[str, int] = {"info": 0, "warning": 0, "error": 0}
        self.steps: dict[str, dict[str, Any]] = {}

    def _write(self, ev: dict[str, Any]) -> None:
        self.events.append(ev)
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(ev, ensure_ascii=False) + "\n")

    def log(self, step: str, level: str, message: str, **context: Any) -> None:
        ev = {"ts": utcnow(), "run_id": self.run_id, "step": step, "level": level, "message": message}
        if context:
            ev["context"] = context
        self.counts[level] = self.counts.get(level, 0) + 1
        self._write(ev)
        stream = sys.stderr if level in ("warning", "error") else sys.stdout
        print(f"[{step}] {level.upper():7s} {message}", file=stream)

    def info(self, step: str, message: str, **ctx: Any) -> None:
        self.log(step, "info", message, **ctx)

    def warning(self, step: str, message: str, **ctx: Any) -> None:
        self.log(step, "warning", message, **ctx)

    def error(self, step: str, message: str, **ctx: Any) -> None:
        self.log(step, "error", message, **ctx)

    def step_start(self, step: str) -> None:
        self.steps[step] = {"started": utcnow(), "status": "running"}
        self.info(step, "step started")

    def step_end(self, step: str, status: str = "ok", **stats: Any) -> None:
        self.steps.setdefault(step, {})
        self.steps[step].update({"finished": utcnow(), "status": status, **stats})
        self.info(step, f"step finished ({status})", **stats)

    def summary(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "generated_at": utcnow(),
            "counts": self.counts,
            "steps": self.steps,
            "warnings": [e for e in self.events if e["level"] == "warning"][-200:],
            "errors": [e for e in self.events if e["level"] == "error"][-200:],
        }


def _clean(o: Any, ndigits: int | None) -> Any:
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o):
            return None
        r = round(o, ndigits) if ndigits is not None else o
        if float(r).is_integer() and abs(r) < 1e15:
            return int(r)
        return r
    if isinstance(o, dict):
        return {k: _clean(v, ndigits) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v, ndigits) for v in o]
    if hasattr(o, "item"):  # numpy scalar
        return _clean(o.item(), ndigits)
    return o


def write_json(path: Path, obj: Any, ndigits: int | None = None, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = _clean(obj, ndigits)
    text = json.dumps(data, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def read_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def round_sig(x: float | None, digits: int = 4) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), digits)


def chunks(seq: list, n: int) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").lower() in ("1", "true", "yes")
