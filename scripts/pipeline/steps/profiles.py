"""Step: geographic profiles (spatial joins with Shapely).

For every country (and every Malaysian state / district) derive, from Natural Earth
features only:
  peaks inside the boundary, rivers crossing it, lakes, islands, landforms
  (ranges, plateaus, deserts, plains …), seas/oceans within ~60 km of the coast,
  main cities, capital, airports, ports, bounding box and label point.

Everything here is DERIVED from geometry, and the UI says so. Facts that cannot be
derived from an open, authoritative dataset (climate class, natural resources …) are
left null so the UI shows "Data not available" instead of a made-up value.
"""
from __future__ import annotations

from collections import defaultdict

from shapely.geometry import Point, shape
from shapely.ops import unary_union  # noqa: F401  (kept for future dissolves)
from shapely.prepared import prep
from shapely.strtree import STRtree

from lib.common import PUBLIC_DATA, RAW, WORK, ImportLog, read_json, write_json

STEP = "profiles"
SEA_BUFFER_DEG = 0.55  # ≈ 60 km at the equator; coarse proximity test only


def _points(path, key_lonlat=None):
    out = []
    for f in read_json(path)["features"]:
        lon, lat = f["geometry"]["coordinates"][:2]
        out.append((Point(lon, lat), f["properties"]))
    return out


def _within(poly_prep, bounds, pts):
    minx, miny, maxx, maxy = bounds
    return [p for g, p in pts if minx <= g.x <= maxx and miny <= g.y <= maxy and poly_prep.contains(g)]


def run(log: ImportLog, registry: dict, admin: dict) -> dict:
    log.step_start(STEP)
    geo = PUBLIC_DATA / "geo"
    peaks = _points(geo / "physical" / "peaks.json")
    cities = _points(geo / "places" / "cities.json")
    airports = _points(geo / "infra" / "airports.json")
    ports = _points(geo / "infra" / "ports.json")

    rivers = [(shape(f["geometry"]), f["properties"]) for f in read_json(RAW / "ne" / "ne_10m_rivers_lake_centerlines.geojson")["features"] if f.get("geometry")]
    lakes = [(shape(f["geometry"]), f["properties"]) for f in read_json(RAW / "ne" / "ne_10m_lakes.geojson")["features"] if f.get("geometry")]
    regions = [(shape(r["geometry"]), r) for r in read_json(WORK / "geo" / "region_polys.json")]
    marine = [(shape(m["geometry"]), m) for m in read_json(WORK / "geo" / "marine_polys.json")]
    river_tree = STRtree([g for g, _ in rivers])
    lake_tree = STRtree([g for g, _ in lakes])
    region_tree = STRtree([g for g, _ in regions])
    marine_tree = STRtree([g for g, _ in marine])

    def profile(geom, cid: str | None, area_km2: float | None) -> dict:
        pg = prep(geom)
        b = geom.bounds
        pk = sorted(_within(pg, b, peaks), key=lambda p: -(p["elev"] or 0))
        ct = sorted(_within(pg, b, cities), key=lambda p: -(p["pop"] or 0))
        ap = _within(pg, b, airports)
        po = _within(pg, b, ports)

        rv: dict[str, float] = defaultdict(float)
        rv_rank: dict[str, int] = {}
        for i in river_tree.query(geom):
            g, p = rivers[i]
            name = p.get("name_en") or p.get("name")
            if not name or p.get("featurecla") == "Lake Centerline":
                continue
            if pg.intersects(g):
                rv[name] += geom.intersection(g).length
                rv_rank[name] = min(rv_rank.get(name, 99), p.get("scalerank") or 99)
        rivers_out = [{"name": n, "rank": rv_rank[n]} for n in sorted(rv, key=lambda n: (rv_rank[n], -rv[n]))][:8]

        lk = []
        for i in lake_tree.query(geom):
            g, p = lakes[i]
            name = p.get("name_en") or p.get("name")
            if name and pg.intersects(g):
                lk.append((name, g.area, p.get("featurecla")))
        lakes_out = [{"name": n, "kind": k} for n, _, k in sorted({(n, a, k) for n, a, k in lk}, key=lambda t: -t[1])][:6]

        islands, landforms = [], []
        for i in region_tree.query(geom):
            g, r = regions[i]
            if not pg.intersects(g):
                continue
            share = geom.intersection(g).area / max(g.area, 1e-12)
            if share < 0.05:
                continue
            item = {"name": r["name"], "kind": r["kind"], "wikidata": r.get("wikidata")}
            (islands if r["kind"] in ("Island", "Island group") else landforms).append((g.area * share, item))
        islands_out = [i for _, i in sorted(islands, key=lambda t: -t[0])][:10]
        landforms_out = [i for _, i in sorted(landforms, key=lambda t: -t[0])][:10]

        seas = []
        buf = geom.buffer(SEA_BUFFER_DEG, 4) if geom.area < 2000 else geom.buffer(SEA_BUFFER_DEG / 2, 2)
        bp = prep(buf)
        for i in marine_tree.query(buf):
            g, m = marine[i]
            if bp.intersects(g):
                seas.append((m["kind"] == "ocean", g.area, {"name": m["name"], "kind": m["kind"]}))
        seen = set()
        seas_out = []
        for _, _, s in sorted(seas, key=lambda t: (not t[0], -t[1])):
            if s["name"] not in seen:
                seen.add(s["name"])
                seas_out.append(s)
        rp = geom.representative_point()
        return {
            "label": [round(rp.x, 4), round(rp.y, 4)],
            "bbox": [round(v, 4) for v in b],
            "area_geometry_km2": round(area_km2, 1) if area_km2 else None,
            "peaks": [{"name": p["name"], "elev": p["elev"], "kind": p["kind"], "wikidata": p.get("wikidata")} for p in pk[:8] if p["name"]],
            "highest_listed_peak": ({"name": pk[0]["name"], "elev": pk[0]["elev"]} if pk and pk[0]["elev"] else None),
            "rivers": rivers_out,
            "lakes": lakes_out,
            "islands": islands_out,
            "landforms": landforms_out,
            "seas": seas_out[:8],
            "cities": [{"name": c["name"], "pop": c["pop"], "kind": c["kind"], "admin1": c.get("admin1")} for c in ct[:12]],
            "airports": [{"name": a["name"], "iata": a["iata"], "kind": a["kind"]} for a in sorted(ap, key=lambda a: a["rank"] or 9)[:10]],
            "ports": [p["name"] for p in sorted(po, key=lambda p: p["rank"] or 9)[:10]],
            "climate": None,
            "natural_resources": None,
        }

    ne10 = read_json(RAW / "ne" / "ne_10m_admin_0_countries.geojson")
    by_a3 = {e["ne_a3"]: e for e in registry["countries"]}
    areas = admin["country_area_km2"]
    n = 0
    index: list[dict] = []
    for f in ne10["features"]:
        ent = by_a3.get(f["properties"]["ADM0_A3"])
        if not ent:
            continue
        geom = shape(f["geometry"])
        prof = profile(geom, ent["id"], areas.get(ent["id"]))
        capital_city = next((c for c in prof["cities"] if c["kind"] == "capital"), None)
        doc = {
            "id": ent["id"],
            "level": "country",
            "name": ent["name"],
            "name_official": ent["name_official"],
            "name_local": ent["name_local"],
            "type": ent["type"],
            "sovereign": ent["sovereign"],
            "continent": ent["continent"] or ent["continent_ne"],
            "continent_id": ent["continent_id"],
            "subregion": ent["subregion"],
            "capital": ent["capital"],
            "capital_point": capital_city,
            "timezones": ent["timezones"],
            "languages": ent["languages"],
            "currencies": ent["currencies"],
            "calling_code": ent["calling_code"],
            "tld": ent["tld"],
            "landlocked": ent["landlocked"],
            "borders": ent["borders"],
            "flag": ent["flag"],
            "iso2": ent["iso2"], "iso3": ent["iso3"], "m49": ent["m49"], "wb": ent["wb"], "wikidata": ent["wikidata"],
            "has_wpp": bool(ent["m49"]),
            "admin1_count": len(admin["admin1"].get(ent["id"], [])),
            **prof,
            "source_ids": ["natural_earth", "world_countries", "iana_tz", "worldstat_derived"],
        }
        write_json(PUBLIC_DATA / "profiles" / f"{ent['id']}.json", doc)
        index.append({"id": ent["id"], "name": ent["name"], "iso2": ent["iso2"], "iso3": ent["iso3"], "wb": ent["wb"], "flag": ent["flag"],
                      "continent_id": ent["continent_id"], "subregion": ent["subregion"], "bbox": prof["bbox"], "label": ent["label"],
                      "has_wpp": bool(ent["m49"]), "admin1": bool(admin["admin1"].get(ent["id"])), "rank": ent["label_rank"], "wikidata": ent["wikidata"]})
        n += 1

    write_json(PUBLIC_DATA / "meta" / "countries.json", index)
    write_json(PUBLIC_DATA / "meta" / "areas.json", {k: round(v, 1) for k, v in areas.items()})

    # admin-1 / admin-2 profiles: one file per country holding all units
    a1_feats = defaultdict(dict)
    for f in read_json(RAW / "ne" / "ne_10m_admin_1_states_provinces.geojson")["features"]:
        a1_feats[f["properties"]["adm1_code"]] = f["geometry"]
    for f in read_json(RAW / "gb" / "MYS_ADM1.geojson")["features"]:
        a1_feats[f["properties"]["shapeISO"]] = f["geometry"]
    a2_geoms = {}
    for f in read_json(WORK / "geo" / "admin2.geojson")["features"]:
        a2_geoms[f["properties"]["id"]] = f["geometry"]

    n_admin = 0
    for cid, units in admin["admin1"].items():
        out = []
        for u in units:
            g = a1_feats.get(u["id"])
            if g is None:
                log.warning(STEP, "admin-1 geometry missing for profile", id=u["id"])
                continue
            p = profile(shape(g), cid, u["area_km2"])
            out.append({**u, "level": "admin1", **{k: p[k] for k in ("peaks", "rivers", "lakes", "islands", "landforms", "seas", "cities", "airports", "ports", "highest_listed_peak", "area_geometry_km2")}})
            n_admin += 1
        doc = {"country": cid, "admin1": out}
        if cid == "MYS":
            gn = read_json(WORK / "reference" / "geonames-places.json")["places"]
            towns = [(Point(r[6], r[7]), {"name": r[1], "geonameid": r[0]}) for r in gn if r[2] == "MY"]
            a2 = []
            for u in admin["admin2"]["MYS"]:
                g = a2_geoms.get(u["id"])
                p = profile(shape(g), cid, u["area_km2"]) if g else {}
                tw = sorted({t["name"] for t in _within(prep(shape(g)), shape(g).bounds, towns)}) if g else []
                a2.append({**u, "level": "admin2", "towns": tw, **{k: p.get(k) for k in ("peaks", "rivers", "lakes", "islands", "seas", "cities", "airports", "ports", "highest_listed_peak", "area_geometry_km2")}})
                n_admin += 1
            doc["admin2"] = a2
        write_json(PUBLIC_DATA / "profiles" / "admin" / f"{cid}.json", doc)

    log.step_end(STEP, country_profiles=n, admin_profiles=n_admin)
    return {"countries": n}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
