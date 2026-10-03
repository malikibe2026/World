"""Step: geometry standardisation & optimisation for the browser.

* Rewrites Natural Earth / geoBoundaries attributes to the atlas schema (canonical ids).
* Simplifies and quantises with mapshaper, writes TopoJSON (3–10× smaller than GeoJSON).
* Splits admin-1 into one file per country so the browser only loads what it shows.
* Computes geodesic areas (DERIVED) used for density and the geographic profile.

Nothing here is sent to the browser as one big world file: zoom-dependent resolutions
(110m → 50m → 10m) and per-country admin layers are lazy-loaded by the map.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape

from lib.common import PIPELINE_NODE_BIN, PUBLIC_DATA, RAW, REGISTRY, WORK, ImportLog, read_json, write_json

STEP = "geo"
GEOD = Geod(ellps="WGS84")
OUT = PUBLIC_DATA / "geo"
TMP = WORK / "geo"

MYS_STATE_NAMES = {  # ISO 3166-2:MY → DOSM naming
    "MY-01": "Johor", "MY-02": "Kedah", "MY-03": "Kelantan", "MY-04": "Melaka",
    "MY-05": "Negeri Sembilan", "MY-06": "Pahang", "MY-07": "Pulau Pinang", "MY-08": "Perak",
    "MY-09": "Perlis", "MY-10": "Selangor", "MY-11": "Terengganu", "MY-12": "Sabah",
    "MY-13": "Sarawak", "MY-14": "W.P. Kuala Lumpur", "MY-15": "W.P. Labuan", "MY-16": "W.P. Putrajaya",
}


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def geodesic_km2(geom) -> float:
    try:
        a, _ = GEOD.geometry_area_perimeter(geom)
        return abs(a) / 1e6
    except Exception:  # pragma: no cover - defensive for broken rings
        return float("nan")


def mapshaper(args: list[str]) -> None:
    exe = PIPELINE_NODE_BIN / "mapshaper"
    if not exe.exists():
        raise RuntimeError("mapshaper not installed: run `npm install --prefix scripts/pipeline`")
    subprocess.run([str(exe), *args], check=True, capture_output=True)


def fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def to_topo(name: str, features: list[dict], out: Path, simplify: str | None, quant: int = 100000, extra: list[str] | None = None) -> int:
    TMP.mkdir(parents=True, exist_ok=True)
    src = TMP / f"{name}.geojson"
    src.write_text(json.dumps(fc(features)), encoding="utf-8")
    args = ["-i", str(src), "name=" + name]
    if simplify:
        args += ["-simplify", simplify, "keep-shapes", "planar"]
    if extra:
        args += extra
    out.parent.mkdir(parents=True, exist_ok=True)
    args += ["-o", f"format=topojson", f"quantization={quant}", "precision=0.0001", str(out)]
    mapshaper(args)
    return out.stat().st_size


def run(log: ImportLog, registry: dict) -> dict:
    log.step_start(STEP)
    if OUT.exists():
        shutil.rmtree(OUT)
    by_a3 = {e["ne_a3"]: e for e in registry["countries"]}
    sizes: dict[str, int] = {}

    # ---- countries at three resolutions -----------------------------------------
    areas: dict[str, float] = {}
    for res, simp in (("110m", None), ("50m", "60%"), ("10m", "18%")):
        src = read_json(RAW / "ne" / f"ne_{res}_admin_0_countries.geojson")
        feats = []
        for f in src["features"]:
            p = f["properties"]
            ent = by_a3.get(p["ADM0_A3"])
            if ent is None:
                log.warning(STEP, "country polygon without registry entry", res=res, ne=p["ADM0_A3"])
                continue
            if res == "10m":
                areas[ent["id"]] = geodesic_km2(shape(f["geometry"]))
            feats.append({"type": "Feature", "properties": {"id": ent["id"], "name": ent["name"], "stats": 1 if ent.get("m49") else 0}, "geometry": f["geometry"]})
        sizes[f"world-{res}"] = to_topo(f"countries", feats, OUT / f"world-{res}.topo.json", simp, quant=100000 if res != "10m" else 400000)
        log.info(STEP, f"countries {res}", features=len(feats), bytes=sizes[f"world-{res}"])

    # ---- admin-1 per country (NE 10m; Malaysia from geoBoundaries) ---------------
    a1 = read_json(RAW / "ne" / "ne_10m_admin_1_states_provinces.geojson")
    admin1_index: dict[str, list[dict]] = {}
    per_country: dict[str, list[dict]] = {}
    for f in a1["features"]:
        p = f["properties"]
        ent = by_a3.get(p["adm0_a3"])
        if ent is None or ent["id"] == "MYS":
            continue
        if not (p["name_en"] or p["name"]) or "+99" in str(p["adm1_code"]):
            log.info(STEP, "admin-1 feature without name/code skipped", code=p["adm1_code"], country=ent["id"])
            continue
        g = shape(f["geometry"])
        props = {
            "id": p["adm1_code"],
            "name": p["name_en"] or p["name"],
            "name_local": p["name"],
            "type": p["type_en"],
            "iso": p["iso_3166_2"] if p["iso_3166_2"] and not str(p["iso_3166_2"]).endswith("~") else None,
            "country": ent["id"],
            "wikidata": p["wikidataid"],
        }
        per_country.setdefault(ent["id"], []).append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        c = g.representative_point()
        admin1_index.setdefault(ent["id"], []).append({**props, "area_km2": round(geodesic_km2(g), 1), "label": [round(c.x, 4), round(c.y, 4)], "bbox": [round(v, 4) for v in g.bounds]})

    gb1 = read_json(RAW / "gb" / "MYS_ADM1.geojson")
    mys_states = []
    mys_state_geoms = {}
    for f in gb1["features"]:
        p = f["properties"]
        iso = p["shapeISO"]
        g = shape(f["geometry"])
        mys_state_geoms[iso] = g
        props = {"id": iso, "name": MYS_STATE_NAMES.get(iso, p["shapeName"]), "name_local": p["shapeName"],
                 "type": "Federal Territory" if iso in ("MY-14", "MY-15", "MY-16") else "State", "iso": iso, "country": "MYS", "wikidata": None}
        mys_states.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        c = g.representative_point()
        admin1_index.setdefault("MYS", []).append({**props, "area_km2": round(geodesic_km2(g), 1), "label": [round(c.x, 4), round(c.y, 4)], "bbox": [round(v, 4) for v in g.bounds]})
    per_country["MYS"] = mys_states
    (TMP / "admin1_all.geojson").write_text(json.dumps(fc([f for feats in per_country.values() for f in feats])), encoding="utf-8")
    for cid, feats in per_country.items():
        simp = "30%" if cid != "MYS" else "45%"
        sizes[f"admin1/{cid}"] = to_topo("admin1", feats, OUT / "admin1" / f"{cid}.topo.json", simp)
    log.info(STEP, "admin-1 written", countries=len(per_country), features=sum(len(v) for v in per_country.values()))

    # ---- admin-2 Malaysia (districts) -------------------------------------------
    crosswalk = read_json(REGISTRY / "mys_district_crosswalk.json")["geoboundaries_to_dosm"]
    gb2 = read_json(RAW / "gb" / "MYS_ADM2.geojson")
    districts = []
    admin2_index = []
    for f in gb2["features"]:
        p = f["properties"]
        g = shape(f["geometry"])
        pt = g.representative_point()
        state = next((iso for iso, sg in mys_state_geoms.items() if sg.contains(pt)), None)
        if state is None:
            state = min(mys_state_geoms, key=lambda iso: mys_state_geoms[iso].distance(pt))
            log.warning(STEP, "district centroid outside every state polygon; nearest state used", district=p["shapeName"], state=state)
        name = crosswalk.get(p["shapeName"], p["shapeName"])
        if name != p["shapeName"]:
            log.info(STEP, "district renamed via crosswalk", source=p["shapeName"], dosm=name)
        did = f"{state}-{slug(name)}"
        props = {"id": did, "name": name, "name_source": p["shapeName"], "state": state, "country": "MYS", "type": "District"}
        districts.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        admin2_index.append({**props, "area_km2": round(geodesic_km2(g), 1), "label": [round(pt.x, 4), round(pt.y, 4)], "bbox": [round(v, 4) for v in g.bounds]})
    sizes["admin2/MYS"] = to_topo("admin2", districts, OUT / "admin2" / "MYS.topo.json", "45%")
    if not any(d["state"] == "MY-16" for d in admin2_index):
        log.warning(STEP, "geographic mismatch: no district polygon for W.P. Putrajaya in geoBoundaries ADM2 (area lies inside a neighbouring district polygon)")
    log.info(STEP, "admin-2 Malaysia written", districts=len(districts))

    # ---- populated places --------------------------------------------------------
    pp = read_json(RAW / "ne" / "ne_10m_populated_places_simple.geojson")
    cities = []
    for f in pp["features"]:
        p = f["properties"]
        if p["featurecla"] in ("Scientific station", "Meteorological Station"):
            continue
        ent = by_a3.get(p["adm0_a3"])
        cls = p["featurecla"]
        kind = "capital" if cls in ("Admin-0 capital",) else "capital_alt" if cls.startswith("Admin-0") else "admin1_capital" if cls.startswith("Admin-1") else "historic" if cls == "Historic place" else "place"
        cities.append({
            "type": "Feature",
            "properties": {
                "name": p["name"], "country": ent["id"] if ent else p["adm0_a3"], "admin1": p["adm1name"],
                "kind": kind, "rank": p["scalerank"], "pop": p["pop_max"] if p["pop_max"] and p["pop_max"] > 0 else None,
                "mz": round(float(p["min_zoom"]), 1), "mega": p["megacity"],
            },
            "geometry": {"type": "Point", "coordinates": [round(p["longitude"], 4), round(p["latitude"], 4)]},
        })
    write_json(OUT / "places" / "cities.json", fc(cities))
    log.info(STEP, "populated places", features=len(cities))

    # ---- physical: peaks, islands/capes, ranges & regions, seas -----------------------
    peaks = []
    for f in read_json(RAW / "ne" / "ne_10m_geography_regions_elevation_points.geojson")["features"]:
        p = f["properties"]
        if p["featurecla"] not in ("mountain", "spot elevation", "depression", "plateau", "pass"):
            continue
        peaks.append({"type": "Feature", "properties": {"name": p["name"], "kind": p["featurecla"], "elev": p["elevation"], "rank": p["scalerank"], "mz": p["min_zoom"], "wikidata": p["wikidataid"]},
                      "geometry": {"type": "Point", "coordinates": [round(p["long_x"], 4), round(p["lat_y"], 4)]}})
    write_json(OUT / "physical" / "peaks.json", fc(peaks))

    labels = []
    region_polys = []
    for f in read_json(RAW / "ne" / "ne_10m_geography_regions_polys.geojson")["features"]:
        p = f["properties"]
        if p["FEATURECLA"] in ("Continent", "Dragons-be-here"):
            continue
        g = shape(f["geometry"])
        c = g.representative_point()
        labels.append({"type": "Feature", "properties": {"name": p["NAME_EN"] or p["NAME"], "kind": p["FEATURECLA"].lower(), "rank": p["SCALERANK"], "mz": p["MIN_LABEL"], "wikidata": p["WIKIDATAID"]},
                       "geometry": {"type": "Point", "coordinates": [round(c.x, 4), round(c.y, 4)]}})
        region_polys.append({"name": p["NAME_EN"] or p["NAME"], "kind": p["FEATURECLA"], "wikidata": p["WIKIDATAID"], "geometry": f["geometry"]})
    for f in read_json(RAW / "ne" / "ne_10m_geography_regions_points.geojson")["features"]:
        p = f["properties"]
        if p["featurecla"] == "pole":
            continue
        labels.append({"type": "Feature", "properties": {"name": p["name_en"] or p["name"], "kind": p["featurecla"], "rank": p["scalerank"], "mz": p["min_zoom"], "wikidata": p["wikidataid"]},
                       "geometry": {"type": "Point", "coordinates": [round(p["long_x"], 4), round(p["lat_y"], 4)]}})
    write_json(OUT / "physical" / "regions.json", fc(labels))
    write_json(TMP / "region_polys.json", region_polys)

    marine = []
    marine_polys = []
    for f in read_json(RAW / "ne" / "ne_10m_geography_marine_polys.geojson")["features"]:
        p = f["properties"]
        if not p["name"]:
            continue
        g = shape(f["geometry"])
        c = g.representative_point()
        marine.append({"type": "Feature", "properties": {"name": p["name_en"] or p["name"], "kind": p["featurecla"], "rank": p["scalerank"], "mz": p["min_label"]},
                       "geometry": {"type": "Point", "coordinates": [round(c.x, 4), round(c.y, 4)]}})
        marine_polys.append({"name": p["name_en"] or p["name"], "kind": p["featurecla"], "geometry": f["geometry"]})
    write_json(OUT / "physical" / "marine.json", fc(marine))
    write_json(TMP / "marine_polys.json", marine_polys)

    for res, simp in (("50m", "50%"), ("10m", "25%")):
        rv = read_json(RAW / "ne" / f"ne_{res}_rivers_lake_centerlines.geojson")
        feats = [{"type": "Feature", "properties": {"name": f["properties"].get("name_en") or f["properties"].get("name"), "rank": f["properties"].get("scalerank"), "kind": f["properties"].get("featurecla")}, "geometry": f["geometry"]}
                 for f in rv["features"] if f.get("geometry")]
        sizes[f"rivers-{res}"] = to_topo("rivers", feats, OUT / "physical" / f"rivers-{res}.topo.json", simp)
        lk = read_json(RAW / "ne" / f"ne_{res}_lakes.geojson")
        feats = [{"type": "Feature", "properties": {"name": f["properties"].get("name_en") or f["properties"].get("name"), "rank": f["properties"].get("scalerank"), "kind": f["properties"].get("featurecla")}, "geometry": f["geometry"]}
                 for f in lk["features"] if f.get("geometry")]
        sizes[f"lakes-{res}"] = to_topo("lakes", feats, OUT / "physical" / f"lakes-{res}.topo.json", simp)

    # ---- infrastructure & strategic locations ---------------------------------------
    airports = []
    for f in read_json(RAW / "ne" / "ne_10m_airports.geojson")["features"]:
        p = f["properties"]
        airports.append({"type": "Feature", "properties": {"name": p["name_en"] or p["name"], "iata": p["iata_code"], "kind": p["type"], "rank": p["scalerank"], "wikidata": p["wikidataid"]},
                         "geometry": {"type": "Point", "coordinates": [round(c, 4) for c in f["geometry"]["coordinates"][:2]]}})
    write_json(OUT / "infra" / "airports.json", fc(airports))
    ports = []
    for f in read_json(RAW / "ne" / "ne_10m_ports.geojson")["features"]:
        p = f["properties"]
        ports.append({"type": "Feature", "properties": {"name": p["name"], "rank": p["scalerank"]},
                      "geometry": {"type": "Point", "coordinates": [round(c, 4) for c in f["geometry"]["coordinates"][:2]]}})
    write_json(OUT / "infra" / "ports.json", fc(ports))

    roads = []
    for f in read_json(RAW / "ne" / "ne_10m_roads.geojson")["features"]:
        p = f["properties"]
        if p.get("type") not in ("Major Highway", "Secondary Highway") or not f.get("geometry"):
            continue
        roads.append({"type": "Feature", "properties": {"kind": "major" if p["type"] == "Major Highway" else "secondary", "ref": p.get("name") or None, "rank": p.get("scalerank")}, "geometry": f["geometry"]})
    sizes["roads"] = to_topo("roads", roads, OUT / "infra" / "roads.topo.json", "12%")

    urban = []
    for f in read_json(RAW / "ne" / "ne_10m_urban_areas_landscan.geojson")["features"]:
        p = f["properties"]
        if not f.get("geometry") or (p.get("max_pop_al") or 0) < 300000:
            continue
        urban.append({"type": "Feature", "properties": {"name": p["name_conve"], "pop": p["max_pop_al"]}, "geometry": f["geometry"]})
    sizes["urban"] = to_topo("urban", urban, OUT / "infra" / "urban.topo.json", "10%")
    log.info(STEP, "infrastructure layers", airports=len(airports), ports=len(ports), roads=len(roads), urban=len(urban))

    write_json(WORK / "admin_index.json", {"admin1": admin1_index, "admin2": {"MYS": admin2_index}, "country_area_km2": areas})
    for k, v in sizes.items():
        if v > 3_000_000:
            log.warning(STEP, "large geometry file for the browser", file=k, bytes=v)
    log.step_end(STEP, files=len(sizes), total_bytes=sum(sizes.values()))
    return {"areas": areas, "admin1": admin1_index, "admin2": admin2_index}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"))
