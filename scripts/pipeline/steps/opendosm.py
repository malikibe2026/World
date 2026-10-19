"""Step (network): OpenDOSM — Malaysia national, state (negeri), district (daerah), parliamentary
(parlimen) and state assembly (DUN) constituency statistics.

1. Catalogue metadata is read from github.com/data-gov-my/datagovmy-meta (title, methodology,
   caveats, last_updated, next_update, CSV link). This always runs and feeds the source panel.
2. Data CSVs are downloaded from storage.dosm.gov.my / storage.data.gov.my (link_csv in the
   metadata), validated and standardised to the atlas schema:

     public/data/stats/my/national.json  public/data/stats/my/admin1.json  public/data/stats/my/admin2.json
     public/data/stats/my/parlimen.json  public/data/stats/my/dun.json

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
    "gdp_state_real_supply",
    "population_parlimen", "hh_income_parlimen", "hh_poverty_parlimen",
    "hh_expenditure_parlimen", "hh_inequality_parlimen", "lfs_parlimen",
    "hh_inequality", "hh_inequality_state", "hh_inequality_district",
    "population_dun", "hh_income_dun", "hh_poverty_dun", "hh_expenditure_dun", "hh_inequality_dun", "lfs_dun",
    "life_expectancy", "life_expectancy_state", "life_expectancy_district",
    "schools_district", "enrolment_school_district", "teachers_district", "completion_school_district", "completion_school_state",
    "gdp_district_real_supply", "wages_state", "wages_real_state", "cpi_headline", "cpi_state", "cpi_headline_inflation", "cpi_state_inflation",
    "crime_district", "crops_state", "crops_district_area", "crops_district_production",
    "state_finance_revenue", "state_finance_expenditure",
]
# GDP by economic activity (production approach, constant 2015 prices); p6 (import duties) is state/national only
GDP_SECTORS = {"p1": "agriculture", "p2": "mining", "p3": "manufacturing", "p4": "construction", "p5": "services"}
# citizen ethnic groups in DOSM's order; DOSM reports ethnic shares of citizens, non-citizens as a share of everyone
ETH_CITIZEN = ["bumi_malay", "bumi_other", "chinese", "indian", "other_citizen"]
# states with no district of their own: their single map district takes the state's figures
SINGLE_DISTRICT = {"MY-09", "MY-14", "MY-15", "MY-16"}
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


def num(v) -> float | None:
    """CSV cell → float; blank / placeholder cells are missing values, never zero."""
    if v is None:
        return None
    v = str(v).strip()
    return None if v in ("", "-", "NA", "N/A", "..") else float(v)


def year(d: str) -> int:
    return int(d[:4])


def pop_quality(y: int) -> str:
    return "OFFICIAL" if y in CENSUS_YEARS else "ESTIMATE"


class Store:
    def __init__(self):
        self.units: dict[str, dict] = defaultdict(lambda: {"series": defaultdict(dict), "datasets": {}})

    def put(self, unit: str, ind: str, y: int, v, q: str, ds: str):
        v = num(v)
        if v is None:
            return
        self.units[unit]["series"][ind][y] = (v, q)
        self.units[unit]["datasets"][ind] = ds

    def dump(self, names: dict[str, str]):
        out = {}
        for u, d in self.units.items():
            out[u] = {
                "name": names.get(u, u),
                "series": {k: [[y, v, q] for y, (v, q) in sorted(s.items())] for k, s in d["series"].items()},
                "datasets": d["datasets"],
                **{k: v for k, v in d.items() if k not in ("series", "datasets")},  # pyramid, ethnicity, breaks, crime_ipd, …
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
    aliases = read_json(REGISTRY / "mys_district_crosswalk.json").get("dosm_aliases", {})

    def state_id(name: str) -> str | None:
        return STATE_ISO.get(name.strip().lower())

    def district_id(state: str, district: str, unmatched: set | None = None) -> str | None:
        sid = state_id(state)
        if sid is None:
            return None
        district = aliases.get(state.strip(), {}).get(district.strip(), district)
        did = a2_by_key.get((sid, norm(district)))
        if did is None and norm(district) == norm(state):
            did = next((v for (s, _), v in a2_by_key.items() if s == sid), None) if sid in ("MY-09", "MY-14", "MY-15") else None
        if did is None:
            (unmatched_d if unmatched is None else unmatched).add((state, district))
        return did

    def population(ds: str, store: Store, key, ethnicity: bool = True):
        data = rows(ds)
        if data is None:
            return
        pyr = defaultdict(lambda: {"male": {}, "female": {}})
        eth = defaultdict(dict)
        cit = defaultdict(dict)
        for r in data:
            unit = key(r)
            if unit is None:
                continue
            y = year(r["date"])
            v = num(r["population"])
            v = v * 1000.0 if v is not None else None
            q = pop_quality(y)
            if r["age"] == "overall" and r["ethnicity"] == "overall":
                ind = {"both": "population", "male": "population_male", "female": "population_female"}[r["sex"]]
                store.put(unit, ind, y, v, q, ds)
            elif r["age"] in AGE5 and r["ethnicity"] == "overall" and r["sex"] in ("male", "female") and v is not None:
                pyr[(unit, y)][r["sex"]][r["age"]] = v
            elif ethnicity and r["age"] == "overall" and r["sex"] == "both" and r["ethnicity"] != "overall" and v is not None:
                eth[(unit, y)][r["ethnicity"]] = v
            elif not ethnicity and r["sex"] == "both" and v is not None and {r["age"], r["ethnicity"]} in ({"overall", "citizen"}, {"overall", "noncitizen"}):
                # parlimen / DUN: citizenship only (in 'ethnicity' for 2020, in 'age' from 2021)
                cit[(unit, y)][r["ethnicity"] if r["age"] == "overall" else r["age"]] = v
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
            citizens = sum(d.get(g, 0) for g in ETH_CITIZEN)
            if "other_noncitizen" in d:
                cit[(unit, y)] = {"citizen": citizens, "noncitizen": d["other_noncitizen"]}
            if citizens > 0:
                for g in ETH_CITIZEN:
                    if g in d:
                        store.put(unit, f"eth_{g}_pct", y, d[g] / citizens * 100, "DERIVED", ds)
        for (unit, y), d in cit.items():
            c, n = d.get("citizen"), d.get("noncitizen")
            if c is None or n is None or c + n <= 0:
                continue
            store.put(unit, "pop_noncitizen", y, n, pop_quality(y), ds)
            store.put(unit, "noncitizen_pct", y, n / (c + n) * 100, "DERIVED", ds)
        for unit, d in store.units.items():
            pm, pf = d["series"].get("population_male", {}), d["series"].get("population_female", {})
            for y in set(pm) & set(pf):
                if pf[y][0] > 0:
                    store.put(unit, "sex_ratio", y, pm[y][0] / pf[y][0] * 100, "DERIVED", ds)

    population("population_malaysia", nat, lambda r: "MYS")
    population("population_state", st, lambda r: state_id(r["state"]))
    population("population_district", di, lambda r: district_id(r["state"], r["district"]))

    def lfs(data: list[dict] | None, store: Store, key, ds: str):
        """Labour force survey by area: rates in %, labour force published in thousands."""
        for r in data or []:
            u = key(r)
            if u:
                y = year(r["date"])
                store.put(u, "unemployment", y, r.get("u_rate"), "OFFICIAL", ds)
                store.put(u, "lfpr", y, r.get("p_rate"), "OFFICIAL", ds)
                store.put(u, "labour_force", y, num(r["lf"]) * 1000 if num(r.get("lf")) is not None else None, "OFFICIAL", ds)

    def hies_extra(level: str, store: Store, key):
        """Household Income and Expenditure Survey: mean consumption expenditure and the Gini coefficient."""
        for ds, col, ind in ((f"hh_expenditure_{level}", "expenditure", "hh_expenditure_mean"), (f"hh_inequality_{level}", "gini", "gini_coef")):
            for r in rows(ds) or []:
                u = key(r)
                if u:
                    store.put(u, ind, year(r["date"]), r.get(col), "OFFICIAL", ds)

    # parliamentary constituencies (a separate division at district depth)
    pa = Store()
    p_by_name = {u["name"]: u["id"] for u in admin.get("parlimen", {}).get("MYS", [])}
    unmatched_p: set[str] = set()

    def parlimen_id(name: str) -> str | None:
        pid = p_by_name.get(name.strip())
        if pid is None:
            unmatched_p.add(name)
        return pid

    if p_by_name:
        # the source puts citizen/non-citizen in the 'ethnicity' column for 2020 and in 'age' from 2021;
        # only the overall/overall rows are used, so totals are unaffected, and no ethnicity split is shown
        population("population_parlimen", pa, lambda r: parlimen_id(r["parlimen"]), ethnicity=False)
        for r in rows("hh_income_parlimen") or []:
            u = parlimen_id(r["parlimen"])
            if u:
                pa.put(u, "hh_income_mean", year(r["date"]), r.get("income_mean"), "OFFICIAL", "hh_income_parlimen")
                pa.put(u, "hh_income_median", year(r["date"]), r.get("income_median"), "OFFICIAL", "hh_income_parlimen")
        for r in rows("hh_poverty_parlimen") or []:
            u = parlimen_id(r["parlimen"])
            if u:
                pa.put(u, "poverty_absolute", year(r["date"]), r.get("poverty_absolute"), "OFFICIAL", "hh_poverty_parlimen")
        hies_extra("parlimen", pa, lambda r: parlimen_id(r["parlimen"]))
        lfs(rows("lfs_parlimen"), pa, lambda r: parlimen_id(r["parlimen"]), "lfs_parlimen")
        log.info(STEP, "source note: population_parlimen stores citizenship in 'ethnicity' (2020) but in 'age' (2021+); totals unaffected")

    # state assembly constituencies, DUN (one level below parlimen; none in the federal territories)
    du = Store()
    # matched on state + N code: the codes are stable, the spellings differ between files
    # (stats "N.22 Tanjung Aru" vs boundary "N.22 Tanjong Aru")
    d_units = {(u["state"], u["code"]): u for u in admin.get("dun", {}).get("MYS", [])}
    unmatched_n: set[tuple[str, str]] = set()
    renamed_n: set[tuple[str, str, str]] = set()

    def dun_id(state: str, name: str) -> str | None:
        sid = state_id(state)
        u = d_units.get((sid, name.strip().split(" ", 1)[0])) if sid else None
        if u is None:
            unmatched_n.add((state, name))
            return None
        if u["name"] != name.strip():
            renamed_n.add((state, name.strip(), u["name"]))
        return u["id"]

    if d_units:
        key = lambda r: dun_id(r["state"], r["dun"])  # noqa: E731 — N codes repeat in every state
        # totals and sex only (no age groups); citizenship sits in 'age'/'ethnicity' as for parlimen
        population("population_dun", du, key, ethnicity=False)
        for r in rows("hh_income_dun") or []:
            u = key(r)
            if u:
                du.put(u, "hh_income_mean", year(r["date"]), r.get("income_mean"), "OFFICIAL", "hh_income_dun")
                du.put(u, "hh_income_median", year(r["date"]), r.get("income_median"), "OFFICIAL", "hh_income_dun")
        for r in rows("hh_poverty_dun") or []:
            u = key(r)
            if u:
                du.put(u, "poverty_absolute", year(r["date"]), r.get("poverty_absolute"), "OFFICIAL", "hh_poverty_dun")
        hies_extra("dun", du, key)
        lfs(rows("lfs_dun"), du, key, "lfs_dun")

    def district_breaks(data: list[dict] | None, store: Store):
        """Boundary changes: a district that first appears after the series start (e.g. Sarawak's
        Gedong and Sebuyau in 2025) takes area from existing districts, so those drop sharply in the
        same year. Such drops are a change of definition, not of population: each is flagged as a
        structural break (detected from the data, never hard-coded) so the app does not draw a fall,
        a y/y change or a density on the old map polygon across it."""
        if not data:
            return
        totals: dict[tuple[str, str], dict[int, float]] = defaultdict(dict)
        for r in data:
            if r["sex"] == "both" and r["age"] == "overall" and r["ethnicity"] == "overall" and num(r["population"]) is not None:
                totals[(r["state"], r["district"])][year(r["date"])] = num(r["population"]) * 1000.0
        start = min(y for v in totals.values() for y in v)
        new_by_state: dict[tuple[str, int], list[str]] = defaultdict(list)
        for (state, district), v in totals.items():
            first = min(v)
            if first > start:
                new_by_state[(state, first)].append(district)
        for (state, y), news in sorted(new_by_state.items()):
            sid = state_id(state)
            new_pop = sum(totals[(state, d)][y] for d in news)
            lost = 0.0
            for (st, district), v in totals.items():
                if st != state or district in news or y not in v or (y - 1) not in v or v[y - 1] <= 0:
                    continue
                change = v[y] / v[y - 1] - 1
                if change < -0.10:  # far beyond any one-year demographic change
                    did = district_id(state, district)
                    if did and did in store.units:
                        store.units[did].setdefault("breaks", []).append({"year": y, "change_pct": round(change * 100, 1), "new_districts": sorted(news)})
                        lost += v[y - 1] - v[y]
                        log.warning(STEP, "structural break: district redefined (area moved to new districts)", district=district, state=state, year=y,
                                    change_pct=round(change * 100, 1), new_districts=sorted(news))
            log.info(STEP, "new districts in source", state=state, state_id=sid, first_year=y, districts=sorted(news),
                     new_population=round(new_pop), population_lost_by_flagged_districts=round(lost))

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

    district_breaks(rows("population_district"), di)

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
    lfs(rows("lfs_district"), di, lambda r: district_id(r["state"], r["district"]), "lfs_district")
    for r in rows("lfs_year") or []:
        y = year(r["date"])
        nat.put("MYS", "unemployment", y, r.get("u_rate"), "OFFICIAL", "lfs_year")
        nat.put("MYS", "lfpr", y, r.get("p_rate"), "OFFICIAL", "lfs_year")
        if num(r.get("lf")) is not None:
            nat.put("MYS", "labour_force", y, num(r["lf"]) * 1000, "OFFICIAL", "lfs_year")
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

    for ds, store, key in (("hh_inequality", nat, lambda r: "MYS"), ("hh_inequality_state", st, lambda r: state_id(r["state"])),
                           ("hh_inequality_district", di, lambda r: district_id(r["state"], r["district"]))):
        for r in rows(ds) or []:
            u = key(r)
            if u:
                store.put(u, "gini_coef", year(r["date"]), r.get("gini"), "OFFICIAL", ds)

    def life(ds: str, store: Store, key):
        """Life expectancy at birth. Each release revises the two latest years (the last is an
        estimate, the one before preliminary), so those two are ESTIMATE; earlier years are final."""
        data = rows(ds)
        if not data:
            return
        last = max(year(r["date"]) for r in data)
        for r in data:
            if r.get("ethnicity", "overall") != "overall":
                continue
            ind = {"both": "e0", "male": "e0_male", "female": "e0_female"}.get(r["sex"])
            u = key(r)
            if ind and u:
                y = year(r["date"])
                store.put(u, ind, y, r["life_expectancy"], "ESTIMATE" if y >= last - 1 else "OFFICIAL", ds)

    life("life_expectancy", nat, lambda r: "MYS")
    life("life_expectancy_state", st, lambda r: state_id(r["state"]))
    life("life_expectancy_district", di, lambda r: district_id(r["state"], r["district"]))

    # ---- government schools (Ministry of Education, EMIS, via data.gov.my) -----------------
    # District rows are District Education Offices (PPD), not always administrative districts:
    # a PPD inside one district is added to it (counts only), a PPD spanning two districts cannot be
    # split and is left out (logged), and the four single-district states take their state rows.
    ppd = read_json(REGISTRY / "mys_district_crosswalk.json").get("moe_ppd", {})
    ppd_unmatched: set[tuple[str, str]] = set()
    ppd_spanning: set[tuple[str, str]] = set()

    def edu_unit(r) -> tuple[Store, str] | None:
        if r["state"] == "Malaysia":
            return (nat, "MYS") if r["district"] == "All Districts" else None
        sid = state_id(r["state"])
        if sid is None:
            return None
        if r["district"] == "All Districts":
            return st, sid
        return None

    def edu_district(r) -> str | None:
        if r["state"] == "Malaysia" or r["district"] == "All Districts" or state_id(r["state"]) in SINGLE_DISTRICT:
            return None
        name = ppd.get(r["state"], {}).get(r["district"], r["district"])
        if name is None:
            ppd_spanning.add((r["state"], r["district"]))
            return None
        return district_id(r["state"], name, ppd_unmatched)

    edu_sum: dict[tuple[str, str, int], float] = defaultdict(float)
    edu_n: dict[tuple[str, str, int], int] = defaultdict(int)
    edu_ds: dict[str, str] = {}

    def edu(ds: str, col: str, ind_of, filt=lambda r: True):
        for r in rows(ds) or []:
            ind = ind_of(r)
            if not ind or not filt(r) or num(r.get(col)) is None:
                continue
            y, v = year(r["date"]), num(r[col])
            edu_ds[ind] = ds
            hit = edu_unit(r)
            if hit:
                hit[0].put(hit[1], ind, y, v, "OFFICIAL", ds)
                if hit[1] in SINGLE_DISTRICT:
                    did = district_id(r["state"], r["state"], ppd_unmatched) if hit[1] != "MY-16" else None
                    if did:
                        di.put(did, ind, y, v, "OFFICIAL", ds)
                continue
            did = edu_district(r)
            if did:
                edu_sum[(did, ind, y)] += v
                edu_n[(did, ind, y)] += 1

    stage = {"primary": "primary", "secondary": "secondary"}
    edu("schools_district", "schools", lambda r: f"schools_{stage[r['stage']]}" if r["stage"] in stage else None)
    edu("enrolment_school_district", "students", lambda r: f"students_{stage[r['stage']]}" if r["stage"] in stage else None, lambda r: r["sex"] == "both")
    edu("teachers_district", "teachers", lambda r: f"teachers_{stage[r['stage']]}" if r["stage"] in stage else None, lambda r: r["sex"] == "both")
    # state rows here only matter for the single-district states; other states take the state dataset below
    edu("completion_school_district", "completion", lambda r: f"completion_{r['stage']}")
    for r in rows("completion_school_state") or []:
        if r["sex"] != "both" or num(r.get("completion")) is None:
            continue
        u = (nat, "MYS") if r["state"] == "Malaysia" else (st, state_id(r["state"]))
        if u[1]:
            u[0].put(u[1], f"completion_{r['stage']}", year(r["date"]), r["completion"], "OFFICIAL", "completion_school_state")
    combined_rates = 0
    for (did, ind, y), v in edu_sum.items():
        if ind.startswith("completion_") and edu_n[(did, ind, y)] > 1:
            combined_rates += 1  # a rate cannot be added up across offices: left out
            continue
        di.put(did, ind, y, v, "OFFICIAL", edu_ds[ind])
    for store in (nat, st, di):  # pupil–teacher ratio from the totals just stored
        for unit, d in store.units.items():
            for lvl in ("primary", "secondary"):
                sts, tch = d["series"].get(f"students_{lvl}", {}), d["series"].get(f"teachers_{lvl}", {})
                for y in set(sts) & set(tch):
                    if tch[y][0] > 0:
                        store.put(unit, f"ptr_{lvl}", y, sts[y][0] / tch[y][0], "DERIVED", edu_ds.get(f"students_{lvl}", "enrolment_school_district"))
    for state, office in sorted(ppd_spanning):
        log.info(STEP, "education office spans two districts: not split, no district figures", state=state, office=office)
    for state, office in sorted(ppd_unmatched):
        log.warning(STEP, "geographic mismatch: education office not matched to a district", state=state, office=office)
    if combined_rates:
        log.info(STEP, "completion rates of districts with several education offices left out (rates cannot be added)", unit_years=combined_rates)

    # ---- GDP (constant 2015 prices): states to the latest year, districts 2015–2020 only ---------
    gdp_abs: dict[tuple[str, str, int], dict[str, float]] = defaultdict(dict)  # (level, unit, year) -> sector -> RM

    def gdp(ds: str, key):
        for r in rows(ds) or []:
            k = key(r)
            v = num(r.get("value"))
            if not k or v is None:
                continue
            store, unit = k
            y = year(r["date"])
            if r["series"] == "abs":
                gdp_abs[(id(store), unit, y)][r["sector"]] = v * 1e6
                if r["sector"] == "p0":
                    store.put(unit, "gdp_real_myr", y, v * 1e6, "OFFICIAL", ds)
            elif r["series"] == "growth_yoy" and r["sector"] == "p0":
                store.put(unit, "gdp_real_growth", y, v, "OFFICIAL", ds)

    by_store = {id(nat): nat, id(st): st, id(di): di}
    gdp("gdp_state_real_supply", lambda r: (nat, "MYS") if r["state"] == "Malaysia" else (st, state_id(r["state"])) if state_id(r["state"]) else None)
    # 'Supra' (supranational: offshore activity outside any state or district) is skipped; national GDP stays World Bank's
    gdp("gdp_district_real_supply", lambda r: (di, district_id(r["state"], r["district"])) if r["district"] != "Supra" and state_id(r["state"]) and district_id(r["state"], r["district"]) else None)
    putrajaya_gdp = set(st.units["MY-16"]["series"].get("gdp_real_myr", {})) if "MY-16" in st.units else set()
    for (sk, unit, y), sec in gdp_abs.items():
        store, total = by_store[sk], sec.get("p0")
        if not total:
            continue
        for code, name in GDP_SECTORS.items():
            if sec.get(code) is not None:  # values under RM5 million are blank in the source, never zero
                store.put(unit, f"gdp_share_{name}", y, sec[code] / total * 100, "DERIVED", "gdp_district_real_supply" if store is di else "gdp_state_real_supply")
        pop = store.units[unit]["series"].get("population", {}).get(y)
        # Kuala Lumpur's GDP includes Putrajaya's in the years Putrajaya has no figure of its own
        if pop and pop[0] > 0 and not (unit.startswith("MY-14") and y not in putrajaya_gdp):
            store.put(unit, "gdp_real_per_capita_myr", y, total / pop[0], "DERIVED", "gdp_district_real_supply" if store is di else "gdp_state_real_supply")

    # ---- salaries & wages (Salaries & Wages Survey), states and Malaysia ----------------------------
    wkey = lambda r: (nat, "MYS") if r["state"] == "Malaysia" else (st, state_id(r["state"])) if state_id(r["state"]) else None  # noqa: E731
    for r in rows("wages_state") or []:
        k = wkey(r)
        if not k:
            continue
        y = year(r["date"])
        if r["sex"] == "both":
            k[0].put(k[1], "wages_median", y, r.get("wages_median"), "OFFICIAL", "wages_state")
            k[0].put(k[1], "wages_mean", y, r.get("wages_mean"), "OFFICIAL", "wages_state")
            k[0].put(k[1], "wage_recipients", y, num(r["recipients"]) * 1000 if num(r.get("recipients")) is not None else None, "OFFICIAL", "wages_state")
        elif r["sex"] in ("male", "female"):
            k[0].put(k[1], f"wages_median_{r['sex']}", y, r.get("wages_median"), "OFFICIAL", "wages_state")
    for r in rows("wages_real_state") or []:
        k = wkey(r)
        if k:
            k[0].put(k[1], "wages_median_real", year(r["date"]), r.get("wages_median_real"), "OFFICIAL", "wages_real_state")
            k[0].put(k[1], "wages_mean_real", year(r["date"]), r.get("wages_mean_real"), "OFFICIAL", "wages_real_state")

    # ---- consumer prices: annual average index and annual inflation from the monthly series --------
    # Only complete years are averaged (the current year is not); the latest month is kept as it is.
    def cpi(ds: str, ds_inflation: str, key):
        months: dict[tuple[int, str], dict[int, float]] = defaultdict(dict)
        stores = {}
        for r in rows(ds) or []:
            k = key(r)
            v = num(r.get("index"))
            if not k or r["division"] != "overall" or v is None:
                continue
            stores[k[1]] = k[0]
            months[(id(k[0]), k[1])][r["date"][:7]] = v
        for (_, unit), m in months.items():
            store = stores[unit]
            by_year = defaultdict(list)
            for ym, v in m.items():
                by_year[int(ym[:4])].append(v)
            avg = {y: sum(v) / 12 for y, v in by_year.items() if len(v) == 12}
            for y, a in avg.items():
                store.put(unit, "cpi", y, a, "DERIVED", ds)
                if y - 1 in avg:
                    store.put(unit, "inflation", y, (a / avg[y - 1] - 1) * 100, "DERIVED", ds)
            last = max(m)
            store.units[unit]["cpi_latest"] = {"month": last, "index": m[last], "inflation_yoy": None, "dataset": ds}
        # the latest month's year-on-year inflation as DOSM publishes it (not recomputed from rounded indices)
        for r in rows(ds_inflation) or []:
            k = key(r)
            if not k or r["division"] != "overall":
                continue
            latest_m = k[0].units[k[1]].get("cpi_latest")
            if latest_m and r["date"][:7] == latest_m["month"] and num(r.get("inflation_yoy")) is not None:
                latest_m["inflation_yoy"] = num(r["inflation_yoy"])

    cpi("cpi_headline", "cpi_headline_inflation", lambda r: (nat, "MYS"))
    cpi("cpi_state", "cpi_state_inflation", lambda r: (st, state_id(r["state"])) if state_id(r["state"]) else None)

    # ---- crime (Royal Malaysian Police): states exactly; police districts as a table ---------------
    # Police districts (IPD) do not follow administrative districts (Petaling has five; Ampang Jaya
    # spans two), so no figure is put on a district polygon. The source files W.P. Putrajaya under
    # Kuala Lumpur and W.P. Labuan under Sabah as police districts; they are moved to their own states.
    CRIME_TYPES = {"murder": "crime_murder", "rape": "crime_rape", "causing_injury": "crime_injury", "break_in": "crime_break_in",
                   "theft_other": "crime_theft_other"}
    crime: dict[tuple[str, int], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    ipd_rows: dict[tuple[str, int], dict[str, list]] = defaultdict(dict)
    for r in rows("crime_district") or []:
        v = num(r.get("crimes"))
        if v is None:
            continue
        y = year(r["date"])
        if r["state"] == "Malaysia":
            unit = "MYS" if r["district"] == "All" else None
        elif r["district"] == "All":
            continue  # rebuilt from police districts below, with Putrajaya and Labuan moved out
        else:
            unit = {"W.P. Putrajaya": "MY-16", "W.P. Labuan": "MY-15"}.get(r["district"]) or state_id(r["state"])
            if r["type"] == "all":
                row = ipd_rows[(unit, y)].setdefault(r["district"], [r["district"], 0, 0])
                row[1 if r["category"] == "assault" else 2] = v
        if not unit:
            continue
        t = r["type"]
        if t == "all":
            crime[(unit, y)]["crime_violent" if r["category"] == "assault" else "crime_property"] += v
        elif t.startswith("robbery"):
            crime[(unit, y)]["crime_robbery"] += v
        elif t.startswith("theft_vehicle"):
            crime[(unit, y)]["crime_vehicle_theft"] += v
        elif t in CRIME_TYPES:
            crime[(unit, y)][CRIME_TYPES[t]] += v
    for (unit, y), d in crime.items():
        store = nat if unit == "MYS" else st
        for ind, v in d.items():
            store.put(unit, ind, y, v, "OFFICIAL", "crime_district")
        if "crime_violent" in d and "crime_property" in d:
            idx = d["crime_violent"] + d["crime_property"]
            store.put(unit, "crime_index", y, idx, "DERIVED", "crime_district")
            pop = store.units[unit]["series"].get("population", {}).get(y)
            if pop and pop[0] > 0:
                store.put(unit, "crime_rate", y, idx / pop[0] * 100_000, "DERIVED", "crime_district")
    for (unit, y), d in ipd_rows.items():
        if y == max(yy for (u, yy) in ipd_rows if u == unit):
            st.units[unit]["crime_ipd"] = {"year": y, "rows": sorted(d.values(), key=lambda x: -(x[1] + x[2]))}

    # ---- crops (excluding oil palm, rubber and other plantation crops) -------------------------------
    for r in rows("crops_state") or []:
        k = wkey(r)
        kind = {"paddy": "paddy", "fruits": "fruit", "vegetables": "vegetables"}.get(r["crop_type"])
        if k and kind:
            k[0].put(k[1], f"crop_area_{kind}", year(r["date"]), r.get("planted_area"), "OFFICIAL", "crops_state")
            k[0].put(k[1], f"crop_prod_{kind}", year(r["date"]), r.get("production"), "OFFICIAL", "crops_state")
    # districts: 2017 only, and no paddy in the district files
    crop_sum: dict[tuple[str, int, str, str], float] = defaultdict(float)
    crop_species: dict[tuple[str, int], dict[str, list]] = defaultdict(dict)
    for ds, col, ix in (("crops_district_area", "planted_area", 1), ("crops_district_production", "production", 2)):
        for r in rows(ds) or []:
            v = num(r.get(col))
            if v is None or r["state"] == "Malaysia" or not state_id(r["state"]):
                continue
            did = district_id(r["state"], r["district"])
            if not did:
                continue
            y = year(r["date"])
            kind = {"fruit": "fruit", "vegetables": "vegetables", "vegetable": "vegetables"}.get(r["crop_type"])  # the two files spell it differently
            if kind:
                crop_sum[(did, y, kind, col)] += v
            sp = crop_species[(did, y)].setdefault(r["crop_species"], [r["crop_species"], None, None])
            sp[ix] = v
    for (did, y, kind, col), v in crop_sum.items():
        di.put(did, f"crop_{'area' if col == 'planted_area' else 'prod'}_{kind}", y, v, "DERIVED", "crops_district_area" if col == "planted_area" else "crops_district_production")
    for (did, y), d in crop_species.items():
        top = sorted((x for x in d.values() if x[1]), key=lambda x: -x[1])[:6]
        if top:
            di.units[did]["crops_top"] = {"year": y, "rows": top}

    # ---- state government finance (Auditor-General), 13 states; federal territories have none -------
    for ds, prefix, cats in (("state_finance_revenue", "state_revenue", {"total": "", "revenue_60000": "_tax", "revenue_70000": "_nontax", "revenue_80000": "_nonrevenue"}),
                             ("state_finance_expenditure", "state_expenditure", {"total": "", "oe": "_operating", "de": "_development"})):
        for r in rows(ds) or []:
            sid = state_id(r["state"])
            v = num(r.get("revenue" if "revenue" in r else "expenditure"))
            if sid and v is not None and r["category"] in cats:
                st.put(sid, prefix + cats[r["category"]], year(r["date"]), v * 1e6, "OFFICIAL", ds)
    for sid, d in st.units.items():
        rev, oe = d["series"].get("state_revenue", {}), d["series"].get("state_expenditure_operating", {})
        for y in set(rev) & set(oe):
            st.put(sid, "state_current_balance", y, rev[y][0] - oe[y][0], "DERIVED", "state_finance_revenue / state_finance_expenditure")

    for state, name, boundary in sorted(renamed_n):
        log.info(STEP, "DUN spelling differs between statistics and boundary file (matched on code)", state=state, stats=name, boundary=boundary)
    for state, name in sorted(unmatched_n):
        log.warning(STEP, "geographic mismatch: DOSM DUN not matched to a boundary polygon", state=state, dun=name)
    for name in sorted(unmatched_p):
        log.warning(STEP, "geographic mismatch: DOSM constituency not matched to a boundary polygon", parlimen=name)
    for state, district in sorted(unmatched_d):
        log.warning(STEP, "geographic mismatch: DOSM district not matched to a boundary polygon", state=state, district=district)

    names_a1 = {u["id"]: u["name"] for u in admin["admin1"].get("MYS", [])}
    names_a2 = {u["id"]: u["name"] for u in admin["admin2"]["MYS"]}
    wrote = 0
    names_pa = {u["id"]: u["name"] for u in admin.get("parlimen", {}).get("MYS", [])}
    names_du = {u["id"]: u["name"] for u in admin.get("dun", {}).get("MYS", [])}
    for fname, store, names in (("national", nat, {"MYS": "Malaysia"}), ("admin1", st, names_a1), ("admin2", di, names_a2), ("parlimen", pa, names_pa), ("dun", du, names_du)):
        if store.units:
            write_json(PUBLIC_DATA / "stats" / "my" / f"{fname}.json",
                       {"source_id": "dosm_opendosm", "level": fname, "units": store.dump(names)}, ndigits=3)
            wrote += 1
    status = "ok" if wrote else "partial"
    log.step_end(STEP, status=status, catalogue=len(catalogue), files=wrote, unmatched_districts=len(unmatched_d))
    return {"ok": wrote > 0}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"), read_json(WORK / "admin_index.json"))
