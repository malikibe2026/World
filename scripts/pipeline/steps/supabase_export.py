"""Step: export the standardised snapshot as CSV files for Supabase (PostgreSQL + PostGIS).

Output: data/exports/*.csv, loaded by scripts/supabase/load_exports.sql (psql \\copy into
staging tables, then upserts with foreign keys to geography and data_sources).
Geometries are exported as GeoJSON text and converted with ST_GeomFromGeoJSON on load.
"""
from __future__ import annotations

import csv
import json

import pandas as pd

from lib.common import EXPORTS, PUBLIC_DATA, RAW, WORK, ImportLog, read_json

STEP = "supabase_export"

STOCK_INDICATORS = {"population", "population_male", "population_female", "sex_ratio", "median_age", "pop_0_14", "pop_15_64",
                    "pop_65_plus", "pop_0_14_pct", "pop_15_64_pct", "pop_65_plus_pct"}
VITAL_INDICATORS = {"births", "deaths", "cbr", "cdr", "natural_increase", "natural_change_rate", "tfr", "e0", "e0_male",
                    "e0_female", "srb", "net_migration", "net_migration_rate", "growth_rate", "pop_change"}


def _w(name: str, header: list[str], rows) -> int:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(EXPORTS / f"{name}.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for r in rows:
            w.writerow(["" if v is None else v for v in r])
            n += 1
    return n


def run(log: ImportLog, registry: dict, admin: dict) -> dict:
    log.step_start(STEP)
    counts = {}
    sources = read_json(PUBLIC_DATA / "meta" / "sources.json")
    counts["data_sources"] = _w("data_sources", ["id", "name", "publisher", "url", "license", "citation", "access", "default_quality", "notes"],
                                ([s["id"], s["name"], s["publisher"], s["url"], s.get("license"), s.get("citation"), s.get("access"), s.get("default_quality"), s.get("notes")] for s in sources))
    inds = read_json(PUBLIC_DATA / "meta" / "indicators.json")
    counts["indicators"] = _w("indicators", ["code", "category", "name_en", "name_ms", "unit", "source_id", "default_quality", "wb_code", "original_source", "formula", "notes"],
                              ([i["code"], i["category"], i["name_en"], i["name_ms"], i["unit"], i["source_id"], i["quality"], i.get("wb_code"), i.get("original_source"), i.get("formula"), i.get("notes")] for i in inds))

    regions = read_json(PUBLIC_DATA / "meta" / "regions.json")
    areas = admin["country_area_km2"]

    def geos():
        for r in regions["regions"]:
            yield [r["id"], r["level"], None if r["id"] == "WORLD" else "WORLD", None, r["name"], r.get("name_ms"), None, None, None, None, None, None, None, "un_wpp_2024"]
        for r in regions["subregions"]:
            yield [r["id"], "subregion", r.get("continent_id") or "WORLD", None, r["name"], None, None, None, None, None, None, None, None, "un_wpp_2024"]
        for e in registry["countries"]:
            prof = PUBLIC_DATA / "profiles" / f"{e['id']}.json"
            bb = read_json(prof)["bbox"] if prof.exists() else [None] * 4
            yield [e["id"], "country", e["continent_id"] or "WORLD", e["id"], e["name"], (e["name_local"] or [None])[0], e["label"][0], e["label"][1], *bb, areas.get(e["id"]), "natural_earth"]
        for cid, units in admin["admin1"].items():
            for u in units:
                yield [u["id"], "admin1", cid, cid, u["name"], u.get("name_local"), u["label"][0], u["label"][1], *u["bbox"], u["area_km2"], "geoboundaries" if cid == "MYS" else "natural_earth"]
        for u in admin["admin2"]["MYS"]:
            yield [u["id"], "admin2", u["state"], "MYS", u["name"], u["name_source"], u["label"][0], u["label"][1], *u["bbox"], u["area_km2"], "geoboundaries"]
    counts["geographies"] = _w("geographies", ["id", "level", "parent_id", "country_id", "name", "name_local", "lon", "lat", "minx", "miny", "maxx", "maxy", "area_km2", "source_id"], geos())

    manifest = read_json(PUBLIC_DATA / "manifest.json")

    src_by_id = {s["id"]: s for s in sources}

    def versions():
        for d in manifest["datasets"]:
            s = src_by_id.get(d["source_id"], {})
            for f in d.get("files", []) or [{"file": None, "sha256": None}]:
                yield [d["source_id"], f["file"] or d.get("version") or d["source_id"], d.get("version"), s.get("distribution_url") or s.get("url"),
                       manifest["snapshot_built_at"], s.get("release_date"), f.get("sha256")]
    counts["dataset_versions"] = _w("dataset_versions", ["source_id", "dataset", "version", "source_url", "retrieved_at", "last_updated", "sha256"], versions())

    counts["countries"] = _w("countries", ["id", "iso2", "iso3", "m49", "wb_code", "name", "name_official", "type", "continent_id", "subregion", "capital", "wikidata", "label_lon", "label_lat"],
                             ([e["id"], e["iso2"], e["iso3"], e["m49"], e["wb"], e["name"], e["name_official"], e["type"], e["continent_id"], e["subregion"],
                               "; ".join(e["capital"]), e["wikidata"], e["label"][0], e["label"][1]] for e in registry["countries"]))
    counts["admin_level_1"] = _w("admin_level_1", ["id", "country_id", "name", "name_local", "type", "iso_3166_2", "wikidata", "area_km2", "label_lon", "label_lat"],
                                 ([u["id"], cid, u["name"], u.get("name_local"), u.get("type"), u.get("iso"), u.get("wikidata"), u["area_km2"], u["label"][0], u["label"][1]]
                                  for cid, units in admin["admin1"].items() for u in units))
    counts["admin_level_2"] = _w("admin_level_2", ["id", "admin1_id", "country_id", "name", "name_source", "type", "area_km2", "label_lon", "label_lat"],
                                 ([u["id"], u["state"], "MYS", u["name"], u["name_source"], u["type"], u["area_km2"], u["label"][0], u["label"][1]] for u in admin["admin2"]["MYS"]))

    def geoms():
        for f in read_json(RAW / "ne" / "ne_10m_admin_0_countries.geojson")["features"]:
            ent = next((e for e in registry["countries"] if e["ne_a3"] == f["properties"]["ADM0_A3"]), None)
            if ent:
                yield ["country", ent["id"], "natural_earth", "10m", json.dumps(f["geometry"])]
        for f in read_json(WORK / "geo" / "admin1_all.geojson")["features"]:
            yield ["admin1", f["properties"]["id"], "geoboundaries", "simplified", json.dumps(f["geometry"])]
        for f in read_json(WORK / "geo" / "admin2.geojson")["features"]:
            yield ["admin2", f["properties"]["id"], "geoboundaries", "simplified", json.dumps(f["geometry"])]
    counts["geometries"] = _w("geometries", ["level", "geo_id", "source_id", "resolution", "geojson"], geoms())

    cities = read_json(PUBLIC_DATA / "geo" / "places" / "cities.json")["features"]
    counts["places"] = _w("places", ["name", "country_id", "admin1_name", "kind", "scalerank", "pop_estimate", "lon", "lat", "source_id"],
                          ([c["properties"]["name"], c["properties"]["country"], c["properties"]["admin1"], c["properties"]["kind"], c["properties"]["rank"],
                            c["properties"]["pop"], *c["geometry"]["coordinates"], "natural_earth"] for c in cities))

    wide = pd.read_parquet(WORK / "wpp_wide.parquet")
    est_stock, est_flow = 2024, 2023

    def long_rows(cols):
        for r in wide.itertuples(index=False):
            d = r._asdict()
            for c in cols:
                v = d.get(c)
                if v is None or pd.isna(v):
                    continue
                stock = c in STOCK_INDICATORS
                q = ("ESTIMATE" if d["year"] <= (est_stock if stock else est_flow) else "PROJECTION")
                if c in ("sex_ratio", "median_age", "pop_0_14", "pop_15_64", "pop_65_plus", "pop_0_14_pct", "pop_15_64_pct", "pop_65_plus_pct", "natural_increase"):
                    q = "DERIVED"
                ref = f"{d['year']}-01-01" if stock else str(d["year"])
                yield [d["geo_id"], c, d["year"], ref, float(v), q, "un_wpp_2024"]

    hdr = ["geo_id", "indicator_code", "year", "reference_period", "value", "quality", "source_id"]
    counts["population"] = _w("population", hdr, long_rows(sorted(STOCK_INDICATORS)))
    counts["vital_statistics"] = _w("vital_statistics", hdr, long_rows(sorted(VITAL_INDICATORS)))

    def pyr():
        for p in (PUBLIC_DATA / "stats" / "wpp").glob("*.json"):
            doc = read_json(p)
            groups = doc["pyramid"]["groups"]
            for i, y in enumerate(doc["years"]):
                m, f = doc["pyramid"]["male"][i], doc["pyramid"]["female"][i]
                if m is None:
                    continue
                q = "ESTIMATE" if y <= est_stock else "PROJECTION"
                for g, vm, vf in zip(groups, m, f):
                    yield [doc["id"], y, g, "male", vm, q, "un_wpp_2024"]
                    yield [doc["id"], y, g, "female", vf, q, "un_wpp_2024"]
    counts["population_age_sex"] = _w("population_age_sex", ["geo_id", "year", "age_group", "sex", "value", "quality", "source_id"], pyr())

    def hist():
        for p in (PUBLIC_DATA / "history").glob("*.json"):
            doc = read_json(p)
            for e in doc["events"]:
                c = e.get("coord") or [None, None]
                yield [f"{doc['id']}:{e['id']}", doc["id"], e["era"], e["year"], e.get("date"), e["precision"], e["title_en"], e["title_ms"],
                       e["summary_en"], e["summary_ms"], bool(e.get("contested")), json.dumps(e.get("interpretations_en") or []), json.dumps(e.get("refs") or []), c[0], c[1], doc["source_id"]]
    counts["historical_events"] = _w("historical_events", ["id", "geo_id", "era", "year", "date", "precision", "title_en", "title_ms", "summary_en", "summary_ms",
                                                           "contested", "interpretations", "refs", "lon", "lat", "source_id"], hist())
    log.step_end(STEP, **counts)
    return counts


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
