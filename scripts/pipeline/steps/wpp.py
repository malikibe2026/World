"""Step: UN World Population Prospects 2024 → standardised series.

Input  : data/raw/wpp/*.rda (wpp2024 R package v1.1-3, UN DESA Population Division)
Output : public/data/stats/wpp/{ID}.json      one file per country / region (lazy-loaded)
         public/data/stats/layers/{code}.json one file per mappable indicator (choropleth / time machine)
         data/work/wpp_long.parquet           long table used for Supabase export & quality checks

Conventions (see docs/data-dictionary.md):
* Counts are converted from thousands to persons.
* Population stocks: the R package stores the stock at 31 Dec of year t. We publish it as
  1 January of year t+1 (same number, official UN dating). No interpolation is done.
* Flows and rates (births, deaths, CBR, TFR, e0 …) refer to calendar year t.
* quality = ESTIMATE up to the last estimate year, PROJECTION afterwards (medium variant).
* Indicators computed here (sex ratio, median age, broad age groups, shares, natural
  increase) are flagged DERIVED in the indicator registry.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import rdata

from lib.common import PUBLIC_DATA, RAW, WORK, ImportLog, read_json, write_json

STEP = "wpp"
YEARS = list(range(1950, 2101))
POP_EST_LAST = 2024  # 1 Jan 2024 == 31 Dec 2023 (last estimate stock)
RATE_EST_LAST = 2023
AGE_GROUPS = [f"{a}-{a + 4}" for a in range(0, 100, 5)] + ["100+"]


def _read(name: str) -> pd.DataFrame:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        d = rdata.read_rda(str(RAW / "wpp" / f"{name}.rda"))
    df = next(iter(d.values()))
    df = pd.DataFrame(df).reset_index(drop=True)
    df["country_code"] = df["country_code"].astype(int)
    df["year"] = df["year"].astype(int)
    return df


def _median_age(counts: np.ndarray) -> float | None:
    """Median from single-year counts (ages 0..100+), linear within the median year."""
    total = counts.sum()
    if total <= 0:
        return None
    half = total / 2.0
    cum = np.cumsum(counts)
    i = int(np.searchsorted(cum, half))
    prev = cum[i - 1] if i > 0 else 0.0
    within = counts[i]
    return float(i + (half - prev) / within) if within > 0 else float(i)


def run(log: ImportLog, registry: dict) -> dict:
    log.step_start(STEP)
    ids_by_m49: dict[int, str] = {}
    names: dict[str, str] = {}
    for e in registry["countries"]:
        if e.get("m49"):
            ids_by_m49[e["m49"]] = e["id"]
            names[e["id"]] = e["name"]
    for r in registry["regions"]:
        ids_by_m49[r["m49"]] = r["id"]
        names[r["id"]] = r["name"]
    for r in registry["subregions"]:
        ids_by_m49[r["m49"]] = r["id"]
        names[r["id"]] = r["name"]

    # ---- age-specific population (stocks) ---------------------------------------
    log.info(STEP, "reading popAge1dt / popprojAge1dt (single-year ages)")
    est = _read("popAge1dt")[["country_code", "year", "age", "popM", "popF"]]
    proj = _read("popprojAge1dt")[["country_code", "year", "age", "popM", "popF"]]
    ages = pd.concat([est, proj], ignore_index=True)
    ages = ages[ages.country_code.isin(ids_by_m49.keys())]
    ages["year"] = ages["year"] + 1  # 31 Dec t  →  1 Jan t+1
    ages = ages[ages.year.between(YEARS[0], YEARS[-1])]
    dup = ages.duplicated(["country_code", "year", "age"]).sum()
    if dup:
        log.error(STEP, "duplicate age records after merge", count=int(dup))
        ages = ages.drop_duplicates(["country_code", "year", "age"], keep="first")

    # ---- flows / rates -------------------------------------------------------------
    log.info(STEP, "reading misc, e0, tfr, srb, migration")
    misc = pd.concat([_read("misc1dt"), _read("miscproj1dt")], ignore_index=True)
    e0 = pd.concat([_read("e01dt")[["country_code", "year", "e0M", "e0F", "e0B"]],
                    _read("e0proj1dt")[["country_code", "year", "e0M", "e0F", "e0B"]]], ignore_index=True)
    tfr = pd.concat([_read("tfr1dt"), _read("tfrproj1dt")[["country_code", "year", "tfr"]]], ignore_index=True)
    srb = _read("sexRatio1dt")
    mig = pd.concat([_read("mig1dt"), _read("migproj1dt")[["country_code", "year", "mig"]]], ignore_index=True)
    flows = (
        misc.merge(e0, on=["country_code", "year"], how="outer")
        .merge(tfr, on=["country_code", "year"], how="outer")
        .merge(srb, on=["country_code", "year"], how="outer")
        .merge(mig, on=["country_code", "year"], how="outer")
    )
    fdup = flows.duplicated(["country_code", "year"]).sum()
    if fdup:
        log.error(STEP, "duplicate flow records (estimate/projection overlap)", count=int(fdup))
        flows = flows.drop_duplicates(["country_code", "year"], keep="first")
    flows = flows[flows.country_code.isin(ids_by_m49.keys()) & flows.year.between(YEARS[0], YEARS[-1])]

    layer_codes = ["population", "population_male", "population_female", "sex_ratio", "median_age",
                   "pop_0_14_pct", "pop_65_plus_pct", "growth_rate", "cbr", "cdr", "tfr", "e0"]
    layers: dict[str, dict[str, list]] = {c: {} for c in layer_codes}
    long_rows: list[pd.DataFrame] = []
    n_files = 0

    year_index = {y: i for i, y in enumerate(YEARS)}
    for m49, grp in ages.groupby("country_code"):
        gid = ids_by_m49[int(m49)]
        n = len(YEARS)
        pop_m = np.full(n, np.nan)
        pop_f = np.full(n, np.nan)
        med = np.full(n, np.nan)
        g014 = np.full(n, np.nan)
        g1564 = np.full(n, np.nan)
        g65 = np.full(n, np.nan)
        pyr_m: list[list[int] | None] = [None] * n
        pyr_f: list[list[int] | None] = [None] * n
        for y, gy in grp.groupby("year"):
            gy = gy.sort_values("age")
            if len(gy) != 101:
                log.warning(STEP, "incomplete age distribution", id=gid, year=int(y), ages=len(gy))
            m = gy.popM.to_numpy(dtype=float) * 1000.0
            f = gy.popF.to_numpy(dtype=float) * 1000.0
            i = year_index[int(y)]
            pop_m[i], pop_f[i] = m.sum(), f.sum()
            b = m + f
            med[i] = _median_age(b) or np.nan
            g014[i], g1564[i], g65[i] = b[:15].sum(), b[15:65].sum(), b[65:].sum()
            bins = list(range(0, 101, 5))
            pyr_m[i] = [int(round(m[a : a + 5].sum())) if a < 100 else int(round(m[100:].sum())) for a in bins]
            pyr_f[i] = [int(round(f[a : a + 5].sum())) if a < 100 else int(round(f[100:].sum())) for a in bins]
        pop = pop_m + pop_f
        with np.errstate(divide="ignore", invalid="ignore"):
            sex_ratio = np.where(pop_f > 0, pop_m / pop_f * 100.0, np.nan)
            pct014 = g014 / pop * 100.0
            pct1564 = g1564 / pop * 100.0
            pct65 = g65 / pop * 100.0

        fl = flows[flows.country_code == m49].set_index("year").reindex(YEARS)
        births = fl["births"].to_numpy(dtype=float) * 1000.0
        deaths = fl["deaths"].to_numpy(dtype=float) * 1000.0

        series = {
            "population": np.round(pop),
            "population_male": np.round(pop_m),
            "population_female": np.round(pop_f),
            "sex_ratio": np.round(sex_ratio, 2),
            "median_age": np.round(med, 2),
            "pop_0_14": np.round(g014),
            "pop_15_64": np.round(g1564),
            "pop_65_plus": np.round(g65),
            "pop_0_14_pct": np.round(pct014, 2),
            "pop_15_64_pct": np.round(pct1564, 2),
            "pop_65_plus_pct": np.round(pct65, 2),
            "births": np.round(births),
            "deaths": np.round(deaths),
            "natural_increase": np.round(births - deaths),
            "cbr": fl["cbr"].to_numpy(dtype=float),
            "cdr": fl["cdr"].to_numpy(dtype=float),
            "natural_change_rate": fl["NatChangeRT"].to_numpy(dtype=float),
            "growth_rate": fl["growthrate"].to_numpy(dtype=float),
            "pop_change": np.round(fl["PopChange"].to_numpy(dtype=float) * 1000.0),
            "net_migration": np.round(fl["mig"].to_numpy(dtype=float) * 1000.0),
            "net_migration_rate": fl["cnmr"].to_numpy(dtype=float),
            "tfr": np.round(fl["tfr"].to_numpy(dtype=float), 3),
            "e0": np.round(fl["e0B"].to_numpy(dtype=float), 2),
            "e0_male": np.round(fl["e0M"].to_numpy(dtype=float), 2),
            "e0_female": np.round(fl["e0F"].to_numpy(dtype=float), 2),
            "srb": np.round(fl["srb"].to_numpy(dtype=float) * 100.0, 1),
        }
        series_json = {k: [None if np.isnan(v) else float(v) for v in arr] for k, arr in series.items()}
        doc = {
            "id": gid,
            "name": names.get(gid),
            "m49": int(m49),
            "source_id": "un_wpp_2024",
            "years": YEARS,
            "estimate_last": {"stock": POP_EST_LAST, "flow": RATE_EST_LAST},
            "series": series_json,
            "pyramid": {"groups": AGE_GROUPS, "male": pyr_m, "female": pyr_f},
        }
        write_json(PUBLIC_DATA / "stats" / "wpp" / f"{gid}.json", doc, ndigits=3)
        n_files += 1
        if not gid.startswith("UN_") and gid != "WORLD":
            for c in layer_codes:
                layers[c][gid] = series_json[c]
        long = pd.DataFrame({"geo_id": gid, "year": YEARS})
        for k, arr in series.items():
            long[k] = arr
        long_rows.append(long)

    for code, values in layers.items():
        write_json(
            PUBLIC_DATA / "stats" / "layers" / f"{code}.json",
            {"indicator": code, "source_id": "un_wpp_2024", "years": YEARS,
             "estimate_last": POP_EST_LAST if code in ("population", "population_male", "population_female", "sex_ratio", "median_age", "pop_0_14_pct", "pop_65_plus_pct") else RATE_EST_LAST,
             "values": values},
            ndigits=3,
        )
    long_df = pd.concat(long_rows, ignore_index=True)
    long_df.to_parquet(WORK / "wpp_wide.parquet", index=False)
    log.step_end(STEP, files=n_files, layers=len(layers), rows=len(long_df))
    return {"wide": long_df}


if __name__ == "__main__":
    reg = read_json(WORK / "registry.json")
    run(ImportLog(), reg)
