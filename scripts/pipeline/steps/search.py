"""Step: smart-search index.

Builds one compact index (lazy-loaded on first search) covering continents, countries,
admin-1, Malaysian districts, populated places, peaks, islands/landforms, seas,
airports and ports. Each entry carries the parent path so selecting "Kajang" can build
the breadcrumb WORLD → Asia → Malaysia → Selangor → Hulu Langat → Kajang.

Entry format (arrays keep the file small):
  [type, id, name, alt_names, country_id, parent_ids, lon, lat, importance]
"""
from __future__ import annotations

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from lib.common import PUBLIC_DATA, RAW, WORK, ImportLog, read_json, write_json

STEP = "search"


def run(log: ImportLog, registry: dict, admin: dict) -> dict:
    log.step_start(STEP)
    entries: list[list] = []
    countries = {e["id"]: e for e in registry["countries"]}

    for r in registry["regions"]:
        if r["level"] == "continent":
            entries.append(["continent", r["id"], r["name"], [r.get("name_ms")], None, ["WORLD"], None, None, 100])
    for e in registry["countries"]:
        alts = [a for a in {e["name_long"], e["name_official"], e["iso2"], e["iso3"], e.get("wpp_name"), *e["name_local"]} if a and a != e["name"]]
        parents = ["WORLD"] + ([e["continent_id"]] if e["continent_id"] else [])
        imp = 90 - (e["label_rank"] or 5)
        entries.append(["country", e["id"], e["name"], alts, e["id"], parents, e["label"][0], e["label"][1], imp])

    # admin-1 polygons for point-in-polygon of places
    a1_geoms, a1_ids = [], []
    for f in read_json(RAW / "ne" / "ne_10m_admin_1_states_provinces.geojson")["features"]:
        if f["properties"]["adm0_a3"] == "MYS":
            continue
        a1_geoms.append(shape(f["geometry"]))
        a1_ids.append(f["properties"]["adm1_code"])
    for f in read_json(RAW / "gb" / "MYS_ADM1.geojson")["features"]:
        a1_geoms.append(shape(f["geometry"]))
        a1_ids.append(f["properties"]["shapeISO"])
    a1_tree = STRtree(a1_geoms)
    a2_geoms, a2_ids = [], []
    for f in read_json(WORK / "geo" / "admin2.geojson")["features"]:
        a2_geoms.append(shape(f["geometry"]))
        a2_ids.append(f["properties"]["id"])
    a2_tree = STRtree(a2_geoms)

    def locate(lon: float, lat: float) -> tuple[str | None, str | None]:
        pt = Point(lon, lat)
        a1 = next((a1_ids[i] for i in a1_tree.query(pt) if a1_geoms[i].contains(pt)), None)
        a2 = next((a2_ids[i] for i in a2_tree.query(pt) if a2_geoms[i].contains(pt)), None) if a1 and a1.startswith("MY-") else None
        return a1, a2

    for cid, units in admin["admin1"].items():
        c = countries.get(cid)
        for u in units:
            alts = [a for a in {u.get("name_local"), u.get("iso")} if a and a != u["name"]]
            parents = ["WORLD"] + ([c["continent_id"]] if c and c["continent_id"] else []) + [cid]
            entries.append(["admin1", u["id"], u["name"], alts, cid, parents, u["label"][0], u["label"][1], 60])
    mys = countries["MYS"]
    for u in admin["admin2"]["MYS"]:
        alts = [u["name_source"]] if u["name_source"] != u["name"] else []
        entries.append(["admin2", u["id"], u["name"], alts, "MYS", ["WORLD", mys["continent_id"], "MYS", u["state"]], u["label"][0], u["label"][1], 50])

    def path_for(cid: str | None, lon: float, lat: float) -> list[str]:
        c = countries.get(cid or "")
        p = ["WORLD"] + ([c["continent_id"]] if c and c["continent_id"] else []) + ([cid] if c else [])
        a1, a2 = locate(lon, lat)
        if a1 and c and (a1.startswith(c["ne_a3"] + "-") or (cid == "MYS" and a1.startswith("MY-"))):
            p.append(a1)
            if a2:
                p.append(a2)
        return p

    unlocated = 0
    for f in read_json(PUBLIC_DATA / "geo" / "places" / "cities.json")["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        parents = path_for(p["country"], lon, lat)
        if len(parents) < 3:
            unlocated += 1
        imp = 40 + (10 - min(p["rank"] or 10, 10)) * 3 + (15 if p["kind"] == "capital" else 0)
        entries.append(["city", f"place:{p['country']}:{p['name']}:{lon:.2f}:{lat:.2f}", p["name"], [], p["country"], parents, lon, lat, imp])
    if unlocated:
        log.info(STEP, "populated places without a country/admin-1 match (kept with partial path)", count=unlocated)

    def add_points(path, kind, idfn, namefn, impfn, altfn=lambda p: []):
        for f in read_json(path)["features"]:
            p = f["properties"]
            name = namefn(p)
            if not name:
                continue
            lon, lat = f["geometry"]["coordinates"]
            entries.append([kind, idfn(p, lon, lat), name, altfn(p), None, ["WORLD"], lon, lat, impfn(p)])

    add_points(PUBLIC_DATA / "geo" / "physical" / "peaks.json", "peak", lambda p, x, y: f"peak:{p['name']}:{x:.2f}:{y:.2f}", lambda p: p["name"], lambda p: 45 - (p["rank"] or 5))
    add_points(PUBLIC_DATA / "geo" / "physical" / "regions.json", "physical", lambda p, x, y: f"phys:{p['name']}:{x:.2f}:{y:.2f}", lambda p: p["name"], lambda p: 40 - (p["rank"] or 5), lambda p: [p["kind"]])
    add_points(PUBLIC_DATA / "geo" / "physical" / "marine.json", "sea", lambda p, x, y: f"sea:{p['name']}:{x:.1f}:{y:.1f}", lambda p: p["name"], lambda p: 42 - (p["rank"] or 5), lambda p: [p["kind"]])
    add_points(PUBLIC_DATA / "geo" / "infra" / "airports.json", "airport", lambda p, x, y: f"airport:{p['iata'] or p['name']}:{x:.2f}", lambda p: p["name"], lambda p: 30 - (p["rank"] or 5), lambda p: [p["iata"]] if p["iata"] else [])
    add_points(PUBLIC_DATA / "geo" / "infra" / "ports.json", "port", lambda p, x, y: f"port:{p['name']}:{x:.2f}:{y:.2f}", lambda p: p["name"], lambda p: 20 - (p["rank"] or 5))

    # GeoNames places (separate, larger file loaded after the core index)
    gn = read_json(WORK / "reference" / "geonames-places.json")
    by_iso2 = {c["iso2"]: c["id"] for c in registry["countries"] if c["iso2"]}
    ne_keys = {(e[4], e[2].lower()) for e in entries if e[0] == "city"}
    places: list[list] = []
    for gid, name, iso2, fcode, _adm, pop, lon, lat in gn["places"]:
        cid = by_iso2.get(iso2)
        if not name or (cid, name.lower()) in ne_keys:
            continue
        parents = path_for(cid, lon, lat)
        imp = 20 + min(int((pop or 1000) ** 0.25), 25)
        places.append(["town", f"gn:{gid}" if gid else f"gn:{iso2}:{name}:{lon:.3f}", name, [], cid, parents, round(lon, 3), round(lat, 3), imp])
    psize = write_json(PUBLIC_DATA / "search" / "places.json", {"fields": ["type", "id", "name", "alt", "country", "parents", "lon", "lat", "importance"], "source_id": "geonames", "entries": places})
    log.info(STEP, "GeoNames places index", entries=len(places), bytes=psize)

    entries = [e for e in entries if e[2]]
    for e in entries:
        if e[6] is not None:
            e[6], e[7] = round(e[6], 3), round(e[7], 3)
        e[3] = [a for a in e[3] if a]
    size = write_json(PUBLIC_DATA / "search" / "index.json", {"fields": ["type", "id", "name", "alt", "country", "parents", "lon", "lat", "importance"], "entries": entries})
    log.step_end(STEP, entries=len(entries), bytes=size)
    return {"entries": len(entries)}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
