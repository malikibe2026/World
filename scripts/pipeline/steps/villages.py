"""Step (network): Malaysian villages and settlements (kampung) as map points.

Source: GeoNames country dump MY.zip (CC BY 4.0) — every populated place (feature class P),
not only the ≥1,000-inhabitant places used elsewhere. Points only: there are no open village
polygons, and there are NO village-level statistics; the app shows the enclosing district's
DOSM figures instead and says so.

Rules
* Kept: PPL, PPLA–PPLA4, PPLC, PPLF, PPLG, PPLL, PPLR, PPLS, PPLX. Dropped: historical, abandoned,
  destroyed or religious-site entries (PPLH, PPLQ, PPLW, PPLCH) — they are not settlements today.
* Each point is placed in a state, then a district of that state, by point-in-polygon; a point
  within ~5 km of the coast but outside every polygon snaps to the nearest one; anything further
  is logged (geographic mismatch) and dropped, never guessed. Putrajaya has no district polygon,
  so its points carry the state id.
* Duplicate ids and exact name+coordinate duplicates are logged and dropped.

Output (lazy-loaded per state by the map, so phones never fetch the whole country):
  public/data/geo/places/my/index.json        states → bbox, count
  public/data/geo/places/my/<MY-xx>.json      [gid, name, fcode, lon, lat, district_id]
  public/data/search/villages-my.json         search rows (same format as search/places.json)
"""
from __future__ import annotations

import io
import os
import zipfile
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from lib.common import PUBLIC_DATA, RAW, WORK, ImportLog, read_json, write_json
from lib.http import FetchError, fetch

STEP = "villages"
URL = "https://download.geonames.org/export/dump/MY.zip"
KEEP = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLF", "PPLG", "PPLL", "PPLR", "PPLS", "PPLX"}
SNAP_DEG = 0.05  # ≈ 5.5 km at the equator


def alt_spelling(name: str) -> list[str]:
    """Old and new spellings, so a search for "Kampung X" also finds "Kampong X" (and back)."""
    for old, new in (("Kampong ", "Kampung "), ("Kampung ", "Kampong ")):
        if name.startswith(old):
            return [new + name[len(old):]]
    return []


def parse(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        c = line.split("\t")
        if len(c) < 19 or c[6] != "P" or c[8] != "MY":
            continue
        rows.append({"gid": int(c[0]), "name": c[1].strip(), "fcode": c[7], "lat": float(c[4]), "lon": float(c[5])})
    return rows


def run(log: ImportLog, registry: dict, admin: dict) -> dict:
    log.step_start(STEP)
    local = os.environ.get("GEONAMES_MY_ZIP")  # offline / testing: a locally downloaded MY.zip
    try:
        if local:
            body, prov = Path(local).read_bytes(), {"url": f"file:{Path(local).name}", "retrieved_at": None}
        else:
            body, prov = fetch(URL, max_age_s=86400 * 30, timeout=120)
    except FetchError as e:
        log.error(STEP, "GeoNames dump unreachable; village points not updated", url=URL, error=str(e)[-200:])
        log.step_end(STEP, status="skipped", reason="network")
        return {"ok": False}
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        text = z.read("MY.txt").decode("utf-8")
    raw = parse(text)

    def index_of(features, key):
        geoms, ids = [], []
        for f in features:
            geoms.append(shape(f["geometry"]))
            ids.append(key(f["properties"]))
        return geoms, ids, STRtree(geoms)

    a1_geoms, a1_ids, a1_tree = index_of(read_json(RAW / "gb" / "MYS_ADM1.geojson")["features"], lambda p: p["shapeISO"])
    a2_feats = read_json(WORK / "geo" / "admin2.geojson")["features"]
    a2_geoms, a2_ids, a2_tree = index_of(a2_feats, lambda p: p["id"])
    a2_state = {f["properties"]["id"]: f["properties"]["state"] for f in a2_feats}
    pa_path = WORK / "geo" / "parlimen.geojson"
    pa_feats = read_json(pa_path)["features"] if pa_path.exists() else []
    pa_geoms, pa_ids, pa_tree = index_of(pa_feats, lambda p: p["id"]) if pa_feats else ([], [], None)
    pa_state = {f["properties"]["id"]: f["properties"]["state"] for f in pa_feats}
    names = {u["id"]: u["name"] for u in admin["admin2"]["MYS"]}
    names.update({u["id"]: u["name"] for u in admin["admin1"]["MYS"]})
    names.update({u["id"]: u["name"] for u in admin.get("parlimen", {}).get("MYS", [])})

    def locate(geoms, ids, tree, pt, ok=lambda _id: True):
        hit = next((ids[i] for i in tree.query(pt) if ok(ids[i]) and geoms[i].contains(pt)), None)
        if hit:
            return hit, False
        near = [i for i in tree.query(pt.buffer(SNAP_DEG)) if ok(ids[i])]
        if not near:
            return None, False
        i = min(near, key=lambda j: geoms[j].distance(pt))
        return (ids[i], True) if geoms[i].distance(pt) <= SNAP_DEG else (None, False)

    by_state: dict[str, list[list]] = defaultdict(list)
    seen_gid, seen_key = set(), set()
    dropped = defaultdict(int)
    snapped = 0
    for r in raw:
        if r["fcode"] not in KEEP:
            dropped["not_a_settlement"] += 1
            continue
        if not r["name"]:
            dropped["no_name"] += 1
            continue
        key = (r["name"].lower(), round(r["lon"], 4), round(r["lat"], 4))
        if r["gid"] in seen_gid or key in seen_key:
            dropped["duplicate"] += 1
            continue
        seen_gid.add(r["gid"])
        seen_key.add(key)
        pt = Point(r["lon"], r["lat"])
        sid, s1 = locate(a1_geoms, a1_ids, a1_tree, pt)
        if sid is None:
            dropped["outside_states"] += 1
            continue
        # the state decides first, so a Putrajaya point never lands in a Selangor district;
        # Putrajaya has no district polygon, so its points carry the state id instead
        did, s2 = locate(a2_geoms, a2_ids, a2_tree, pt, lambda d: a2_state[d] == sid)
        pid = locate(pa_geoms, pa_ids, pa_tree, pt, lambda q: pa_state[q] == sid)[0] if pa_tree is not None else None
        snapped += s1 or s2
        by_state[sid].append([r["gid"], r["name"], r["fcode"], round(r["lon"], 5), round(r["lat"], 5), did or sid, pid])

    if dropped["duplicate"]:
        log.warning(STEP, "duplicate records dropped", count=dropped["duplicate"])
    if dropped["outside_states"]:
        log.warning(STEP, "geographic mismatch: settlement outside every state polygon (dropped)", count=dropped["outside_states"])

    out = PUBLIC_DATA / "geo" / "places" / "my"
    index = {}
    search_rows = []
    mys = next(c for c in registry["countries"] if c["id"] == "MYS")
    root = ["WORLD", *([mys["continent_id"]] if mys["continent_id"] else []), "MYS"]
    known = {g for g, *_ in read_json(WORK / "reference" / "geonames-places.json")["places"]}  # already in search/places.json
    for sid, items in sorted(by_state.items()):
        items.sort(key=lambda x: x[1])
        write_json(out / f"{sid}.json", {"state": sid, "source_id": "geonames", "fields": ["gid", "name", "fcode", "lon", "lat", "district", "parlimen"], "items": items})
        xs, ys = [i[3] for i in items], [i[4] for i in items]
        index[sid] = {"name": names.get(sid, sid), "count": len(items), "bbox": [min(xs), min(ys), max(xs), max(ys)]}
        for gid, name, fcode, lon, lat, did, _pid in items:
            if gid in known:
                continue
            search_rows.append(["village", f"gn:{gid}", name, alt_spelling(name), "MYS", [*root, sid] + ([did] if did != sid else []), round(lon, 4), round(lat, 4), 12 if fcode == "PPLX" else 15])
    write_json(out / "index.json", {"source_id": "geonames", "source_url": prov["url"], "retrieved_at": prov.get("retrieved_at"),
                                    "license": "CC BY 4.0", "fields": ["gid", "name", "fcode", "lon", "lat", "district", "parlimen"], "states": index, "names": names})
    size = write_json(PUBLIC_DATA / "search" / "villages-my.json",
                      {"fields": ["type", "id", "name", "alt", "country", "parents", "lon", "lat", "importance"], "source_id": "geonames", "entries": search_rows})
    total = sum(v["count"] for v in index.values())
    log.step_end(STEP, settlements=total, snapped=snapped, search_rows=len(search_rows), search_bytes=size, **{f"dropped_{k}": v for k, v in dropped.items()})
    return {"ok": total > 0}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
