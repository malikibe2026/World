"""Small HTTP helper with retries, a cache in data/raw/http and provenance capture."""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from lib.common import RAW, utcnow

CACHE = RAW / "http"
UA = "WorldStatAtlas-pipeline/0.1 (+https://github.com/malikibe2026/World)"


class FetchError(RuntimeError):
    pass


def fetch(url: str, *, cache: bool = True, max_age_s: int = 86400 * 7, retries: int = 4, timeout: int = 60, accept: str = "*/*") -> tuple[bytes, dict]:
    """Return (body, provenance). Raises FetchError after retries (2s, 4s, 8s, 16s)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()
    body_p, meta_p = CACHE / f"{key}.bin", CACHE / f"{key}.json"
    if cache and body_p.exists() and meta_p.exists() and time.time() - body_p.stat().st_mtime < max_age_s:
        return body_p.read_bytes(), json.loads(meta_p.read_text())
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                prov = {
                    "url": url,
                    "retrieved_at": utcnow(),
                    "status": r.status,
                    "last_modified": r.headers.get("Last-Modified"),
                    "etag": r.headers.get("ETag"),
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                }
            body_p.write_bytes(body)
            meta_p.write_text(json.dumps(prov))
            return body, prov
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:  # network / proxy refusal
            last = e
            if attempt < retries:
                time.sleep(2 ** (attempt + 1))
    raise FetchError(f"{url}: {last}")


def fetch_json(url: str, **kw):
    body, prov = fetch(url, accept="application/json", **kw)
    return json.loads(body.decode("utf-8")), prov


def save_raw(name: str, body: bytes) -> Path:
    p = RAW / "downloads" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(body)
    return p
