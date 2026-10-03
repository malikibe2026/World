"""Step (network): OpenDOSM — Malaysia national, state (negeri) and district (daerah) statistics.

1. Catalogue metadata is read from github.com/data-gov-my/datagovmy-meta (title, methodology,
   caveats, last_updated, next_update, CSV link). This always runs and feeds the source panel.
2. Data CSVs are downloaded from storage.dosm.gov.my / storage.data.gov.my (link_csv in the
   metadata), validated and standardised to the atlas schema:

     public/data/stats/my/national.json  public/data/stats/my/admin1.json  public/data/stats/my/admin2.json

Rules
* DOSM is the priority source for Malaysia; UN WPP stays available for comparison.
* Census years (1970, 1980, 1991, 2000, 2010, 2020) → OFFICIAL; intercensal years → ESTIMATE
  (DOSM "intercensal mid-year population estimates"). Registration-based births/deaths → OFFICIAL.
* Values published in thousands are converted to persons.
* District names are matched to the boundary file with an explicit crosswalk + normalisation;
  every unmatched name is logged (geographic mismatch) and never silently dropped.
"""
from __future__ import annotations

import csv
import io
import re
from collections import defaultdict

from lib.common import PUBLIC_DATA, REGISTRY, WORK, ImportLog, read_json, write_json
from lib.http import FetchError, fetch, fetch_json

STEP = "opendosm"
META = "https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/data-catalogue/{id}.json"
CENSUS_YEARS = {1970, 1980, 1991, 2000, 2010, 2020}
DATASETS = [
    "population_malaysia", "population_state", "population_district",
    "births_district_sex", "deaths_state", "deaths_district_sex", "marriages",
    "fertility_state", "fertility", "lfs_district", "lfs_year",
    "hh_income_state", "hh_income_district", "hh_poverty_state", "hh_poverty_district",
    "gdp_state_real_supply", "gdp_lookup",
]
AGE5 = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49",
        "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85+"]
STATE_ISO = {
    "johor": "MY-01", "kedah": "MY-02", "kelantan": "MY-03", "melaka": "MY-04", "negeri sembilan": "MY-05",
    "pahang": "MY-06", "pulau pinang": "MY-07", "perak": "MY-08", "perlis": "MY-09", "selangor": "MY-10",
    "terengganu": "MY-11", "sabah": "MY-12", "sarawak": "MY-13", "w.p. kuala lumpur": "MY-14",
    "w.p. labuan": "MY-15", "w.p. putrajaya": "MY-16",
}


def norm(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"^w\.?\s*p\.?\s*", "", s)
    s = re.sub(r"^ulu\b", "hulu", s)
    return re.sub(r"[^a-z0-9]", "", s)


def year(d: str) -> int:
    return int(d[:4])


def pop_quality(y: int) -> str:
    return "OFFICIAL" if y in CENSUS_YEARS else "ESTIMATE"


class Store:
    def __init__(self):
        self.units: dict[str, dict] = defaultdict(lambda: {"series": defaultdict(dict), "datasets": {}})

    def put(self, unit: str, ind: str, y: int, v, q: str, ds: str):
        if v in (None, ""):
            return
        self.units[unit]["series"][ind][y] = (float(v), q)
        self.units[unit]["datasets"][ind] = ds

    def dump(self, names: dict[str, str]):
        out = {}
        for u, d in self.units.items():
            out[u] = {
                "name": names.get(u, u),
                "series": {k: [[y, v, q] for y, (v, q) in sorted(s.items())] for k, s in d["series"].items()},
                "datasets": d["datasets"],
                **({"pyramid": d["pyramid"]} if "pyramid" in d else {}),
                **({"ethnicity": d["ethnicity"]} if "ethnicity" in d else {}),
            }
        return out


def run(log: ImportLog, registry: dict, admin: dict) -> dict:
    log.step_start(STEP)
    catalogue = {}
    for ds in DATASETS:
        try:
            meta, prov = fetch_json(META.format(id=ds), max_age_s=86400)
        except FetchError as e:
            log.error(STEP, "catalogue metadata unreachable", dataset=ds, error=str(e)[:200])
            continue
        catalogue[ds] = {k: meta.get(k) for k in (
            "title_en", "title_ms", "description_en", "description_ms", "methodology_en", "methodology_ms",
            "caveat_en", "caveat_ms", "data_as_of", "last_updated", "next_update", "link_csv", "link_parquet",
            "frequency", "geography", "demography", "dataset_begin", "dataset_end", "data_source")}
        catalogue[ds]["metadata_url"] = prov["url"]
        catalogue[ds]["fields"] = [{"name": f["name"], "description_en": f.get("description_en")} for f in meta.get("fields", [])]
    write_json(PUBLIC_DATA / "stats" / "my" / "catalogue.json", {"source_id": "dosm_opendosm", "datasets": catalogue}, pretty=True)
    log.info(STEP, "catalogue metadata written", datasets=len(catalogue))

    offline = {"hosts": set()}

    def rows(ds: str) -> list[dict] | None:
        link = (catalogue.get(ds) or {}).get("link_csv")
        if not link:
            log.error(STEP, "no CSV link in metadata", dataset=ds)
            return None
        host = link.split("/")[2]
        if host in offline["hosts"]:
            log.error(STEP, "dataset skipped: host unreachable earlier in this run", dataset=ds, url=link)
            return None
        try:
            body, prov = fetch(link, max_age_s=86400)
        except FetchError as e:
            offline["hosts"].add(host)
            log.error(STEP, "dataset download failed (network policy or source down)", dataset=ds, url=link, error=str(e)[:200])
            return None
        r = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        log.info(STEP, "dataset downloaded", dataset=ds, rows=len(r), sha256=prov["sha256"], retrieved_at=prov["retrieved_at"])
        return r

    nat, st, di = Store(), Store(), Store()
    a2_by_key = {}
    for u in admin["admin2"]["MYS"]:
        a2_by_key[(u["state"], norm(u["name"]))] = u["id"]
        a2_by_key[(u["state"], norm(u["name_source"]))] = u["id"]
    unmatched_d: set[tuple[str, str]] = set()

    def state_id(name: str) -> str | None:
        return STATE_ISO.get(name.strip().lower())

    def district_id(state: str, district: str) -> str | None:
        sid = state_id(state)
        if sid is None:
            return None
        did = a2_by_key.get((sid, norm(district)))
        if did is None and norm(district) == norm(state):
            did = next((v for (s, _), v in a2_by_key.items() if s == sid), None) if sid in ("MY-09", "MY-14", "MY-15") else None
        if did is None:
            unmatched_d.add((state, district))
        return did

    def population(ds: str, store: Store, key):
        data = rows(ds)
        if data is None:
            return
        pyr = defaultdict(lambda: {"male": {}, "female": {}})
        eth = defaultdict(dict)
        for r in data:
            unit = key(r)
            if unit is None:
                continue
            y = year(r["date"])
            v = float(r["population"]) * 1000.0 if r["population"] not in ("", None) else None
            q = pop_quality(y)
            if r["age"] == "overall" and r["ethnicity"] == "overall":
                ind = {"both": "population", "male": "population_male", "female": "population_female"}[r["sex"]]
                store.put(unit, ind, y, v, q, ds)
            elif r["age"] in AGE5 and r["ethnicity"] == "overall" and r["sex"] in ("male", "female") and v is not None:
                pyr[(unit, y)][r["sex"]][r["age"]] = v
            elif r["age"] == "overall" and r["sex"] == "both" and r["ethnicity"] != "overall" and v is not None:
                eth[(unit, y)][r["ethnicity"]] = v
        by_unit = defaultdict(dict)
        for (unit, y), d in pyr.items():
            by_unit[unit][y] = d
        for unit, years in by_unit.items():
            ys = sorted(years)
            store.units[unit]["pyramid"] = {
                "groups": AGE5, "years": ys,
                "male": [[round(years[y]["male"].get(a, 0)) for a in AGE5] for y in ys],
                "female": [[round(years[y]["female"].get(a, 0)) for a in AGE5] for y in ys],
                "dataset": ds,
            }
            for y in ys:
                m, f = years[y]["male"], years[y]["female"]
                tot = [m.get(a, 0) + f.get(a, 0) for a in AGE5]
                s = sum(tot)
                if s <= 0:
                    continue
                q = "DERIVED"
                store.put(unit, "pop_0_14", y, sum(tot[:3]), q, ds)
                store.put(unit, "pop_15_64", y, sum(tot[3:13]), q, ds)
                store.put(unit, "pop_65_plus", y, sum(tot[13:]), q, ds)
                store.put(unit, "pop_0_14_pct", y, sum(tot[:3]) / s * 100, q, ds)
                store.put(unit, "pop_15_64_pct", y, sum(tot[3:13]) / s * 100, q, ds)
                store.put(unit, "pop_65_plus_pct", y, sum(tot[13:]) / s * 100, q, ds)
        for (unit, y), d in eth.items():
            store.units[unit].setdefault("ethnicity", {})[str(y)] = d
        for unit, d in store.units.items():
            pm, pf = d["series"].get("population_male", {}), d["series"].get("population_female", {})
            for y in set(pm) & set(pf):
                if pf[y][0] > 0:
                    store.put(unit, "sex_ratio", y, pm[y][0] / pf[y][0] * 100, "DERIVED", ds)

    population("population_malaysia", nat, lambda r: "MYS")
    population("population_state", st, lambda r: state_id(r["state"]))
    population("population_district", di, lambda r: district_id(r["state"], r["district"]))

    def vital(ds: str, ind_abs: str, ind_rate: str):
        data = rows(ds)
        if data is None:
            return
        for r in data:
            if r.get("sex", "both") != "both":
                continue
            y = year(r["date"])
            if "district" in r:
                did = district_id(r["state"], r["district"])
                if did:
                    di.put(did, ind_abs, y, r["abs"], "OFFICIAL", ds)
                    di.put(did, ind_rate, y, r["rate"], "OFFICIAL", ds)
            else:
                sid = state_id(r["state"])
                if sid:
                    st.put(sid, ind_abs, y, r["abs"], "OFFICIAL", ds)
                    st.put(sid, ind_rate, y, r["rate"], "OFFICIAL", ds)

    vital("births_district_sex", "births", "cbr")
    vital("deaths_state", "deaths", "cdr")
    vital("deaths_district_sex", "deaths", "cdr")

    m = rows("marriages")
    for r in m or []:
        nat.put("MYS", f"marriages_{r['sex']}", year(r["date"]), r["abs"], "OFFICIAL", "marriages")
    for ds, store, key in (("fertility_state", st, lambda r: state_id(r["state"])), ("fertility", nat, lambda r: "MYS")):
        for r in rows(ds) or []:
            if r.get("age_group") == "tfr":
                u = key(r)
                if u:
                    store.put(u, "tfr", year(r["date"]), r["fertility_rate"], "OFFICIAL", ds)
    for r in rows("lfs_district") or []:
        did = district_id(r["state"], r["district"])
        if did:
            y = year(r["date"])
            di.put(did, "unemployment", y, r["u_rate"], "OFFICIAL", "lfs_district")
            di.put(did, "lfpr", y, r["p_rate"], "OFFICIAL", "lfs_district")
            di.put(did, "labour_force", y, float(r["lf"]) * 1000 if r["lf"] else None, "OFFICIAL", "lfs_district")
    for r in rows("lfs_year") or []:
        y = year(r["date"])
        nat.put("MYS", "unemployment", y, r.get("u_rate"), "OFFICIAL", "lfs_year")
        nat.put("MYS", "lfpr", y, r.get("p_rate"), "OFFICIAL", "lfs_year")
        if r.get("lf"):
            nat.put("MYS", "labour_force", y, float(r["lf"]) * 1000, "OFFICIAL", "lfs_year")
    for ds, store, key in (("hh_income_state", st, lambda r: state_id(r["state"])),
                           ("hh_income_district", di, lambda r: district_id(r["state"], r["district"]))):
        for r in rows(ds) or []:
            u = key(r)
            if u:
                store.put(u, "hh_income_mean", year(r["date"]), r.get("income_mean"), "OFFICIAL", ds)
                store.put(u, "hh_income_median", year(r["date"]), r.get("income_median"), "OFFICIAL", ds)
    for ds, store, key in (("hh_poverty_state", st, lambda r: state_id(r["state"])),
                           ("hh_poverty_district", di, lambda r: district_id(r["state"], r["district"]))):
        for r in rows(ds) or []:
            u = key(r)
            if u:
                store.put(u, "poverty_absolute", year(r["date"]), r.get("poverty_absolute"), "OFFICIAL", ds)

    lookup = {r.get("sector"): r for r in (rows("gdp_lookup") or [])}
    sectors = defaultdict(lambda: defaultdict(dict))
    for r in rows("gdp_state_real_supply") or []:
        sid = state_id(r["state"])
        if sid is None or r.get("series") != "abs":
            continue
        sectors[sid][year(r["date"])][r["sector"]] = float(r["value"]) * 1e6
    if sectors and not lookup:
        log.error(STEP, "gdp_lookup unavailable: sector codes cannot be labelled, state GDP skipped")
    elif sectors:
        for sid, ys in sectors.items():
            st.units[sid]["gdp_sectors"] = {
                str(y): [{"code": c, "name_en": lookup.get(c, {}).get("desc_en") or lookup.get(c, {}).get("sector_en") or c, "value": v} for c, v in d.items()]
                for y, d in ys.items()
            }

    for state, district in sorted(unmatched_d):
        log.warning(STEP, "geographic mismatch: DOSM district not matched to a boundary polygon", state=state, district=district)

    names_a1 = {u["id"]: u["name"] for u in admin["admin1"].get("MYS", [])}
    names_a2 = {u["id"]: u["name"] for u in admin["admin2"]["MYS"]}
    wrote = 0
    for fname, store, names in (("national", nat, {"MYS": "Malaysia"}), ("admin1", st, names_a1), ("admin2", di, names_a2)):
        if store.units:
            write_json(PUBLIC_DATA / "stats" / "my" / f"{fname}.json",
                       {"source_id": "dosm_opendosm", "level": fname, "units": store.dump(names)}, ndigits=3)
            wrote += 1
    status = "ok" if wrote else "partial"
    log.step_end(STEP, status=status, catalogue=len(catalogue), files=wrote, unmatched_districts=len(unmatched_d))
    return {"ok": wrote > 0}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
