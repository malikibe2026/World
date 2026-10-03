"""Step: Data Quality Engine (snapshot-level checks).

Checks (each issue keeps geo_id / indicator / year so it can be traced):
  missing_values      gaps inside a series, entities with no statistics at all
  duplicate_records   duplicated ids / (geo, indicator, year) keys
  outliers            implausible year-on-year jumps and cross-sectional robust z-scores (MAD)
  year_mismatch       stock vs flow reference periods, estimate/projection boundaries, DOSM vs UN coverage
  geographic_mismatch boundary ↔ statistics coverage differences (from registry/geo/opendosm logs)
  unit_mismatch       ranges per unit, pyramid ≠ total, demographic balance (births − deaths + migration ≈ change)

Outliers are flagged for review, never removed: real shocks (wars, pandemics, refugee flows)
also produce them. The UI shows the flags next to the value.
"""
from __future__ import annotations

from collections import Counter, defaultdict

import numpy as np
import pandas as pd

from lib.common import PUBLIC_DATA, REGISTRY, WORK, ImportLog, read_json, utcnow, write_json

STEP = "quality"
HARD = {  # impossible outside these bounds ⇒ unit_mismatch (e.g. per-100 vs per-1000, thousands vs persons)
    "cbr": (0, 1000), "cdr": (0, 1000), "tfr": (0, 15), "e0": (0, 120), "e0_male": (0, 120), "e0_female": (0, 120),
    "sex_ratio": (0, 1000), "median_age": (0, 120), "pop_0_14_pct": (0, 100), "pop_65_plus_pct": (0, 100),
    "growth_rate": (-100, 100), "srb": (50, 200), "population": (0, 2e10), "births": (0, 2e9), "deaths": (0, 2e9),
}
TYPICAL = {  # unusual but possible ⇒ outliers (review), e.g. Rwanda 1994 CDR, Hong Kong median age in the 2050s
    "cbr": (0, 70), "cdr": (0, 60), "tfr": (0.6, 9), "e0": (20, 92), "sex_ratio": (80, 140), "median_age": (12, 62),
    "growth_rate": (-8, 12), "srb": (100, 116), "net_migration_rate": (-60, 60),
}


def run(log: ImportLog, registry: dict) -> dict:
    log.step_start(STEP)
    issues: list[dict] = []
    flags: dict[str, set] = defaultdict(set)

    def add(check, severity, message, geo=None, indicator=None, year=None, value=None):
        issues.append({k: v for k, v in {"check": check, "severity": severity, "geo_id": geo, "indicator": indicator, "year": year, "value": value, "message": message}.items() if v is not None})
        if geo:
            flags[geo].add(check)

    wide = pd.read_parquet(WORK / "wpp_wide.parquet")
    est_last_stock, est_last_flow = 2024, 2023

    # -- duplicates ------------------------------------------------------------------
    d = wide.duplicated(["geo_id", "year"]).sum()
    if d:
        add("duplicate_records", "error", f"{d} duplicated (geo, year) rows in WPP table")
    ids = Counter(e["id"] for e in registry["countries"])
    for k, n in ids.items():
        if n > 1:
            add("duplicate_records", "error", "duplicated geographic id in registry", geo=k, value=n)
    sidx = read_json(PUBLIC_DATA / "search" / "index.json")["entries"]
    sdup = [k for k, n in Counter(e[1] for e in sidx).items() if n > 1]
    for k in sdup[:50]:
        add("duplicate_records", "warning", "duplicated search id (homonymous places merged on select)", value=k)

    # -- missing values -----------------------------------------------------------------
    for e in registry["countries"]:
        if not e.get("m49"):
            add("missing_values", "info", "No UN WPP statistics for this boundary (territory, disputed area or included in another country). UI shows 'Data not available'.", geo=e["id"])
    value_cols = [c for c in wide.columns if c not in ("geo_id", "year")]
    for gid, g in wide.groupby("geo_id"):
        for c in value_cols:
            n = int(g[c].isna().sum())
            if n:
                add("missing_values", "warning", f"{n} missing years", geo=gid, indicator=c, value=n)

    # -- unit mismatch (hard bounds) and atypical values (review) --------------------------------
    for c, (lo, hi) in HARD.items():
        if c not in wide:
            continue
        bad = wide[(wide[c] < lo) | (wide[c] > hi)]
        for _, r in bad.head(200).iterrows():
            add("unit_mismatch", "error", f"value outside possible range [{lo}, {hi}] — unit or scaling error", geo=r.geo_id, indicator=c, year=int(r.year), value=float(r[c]))
    for c, (lo, hi) in TYPICAL.items():
        if c not in wide:
            continue
        x = wide[wide.year <= est_last_stock]
        bad = x[(x[c] < lo) | (x[c] > hi)]
        for _, r in bad.head(100).iterrows():
            add("outliers", "info", f"atypical value outside [{lo}, {hi}] (estimate years) — verify against source notes", geo=r.geo_id, indicator=c, year=int(r.year), value=float(r[c]))

    # -- unit mismatch: pyramid vs total; demographic balance ---------------------------------
    for gid in wide.geo_id.unique():
        doc = read_json(PUBLIC_DATA / "stats" / "wpp" / f"{gid}.json")
        tot = doc["series"]["population"]
        for i, yr in enumerate(doc["years"]):
            pm, pf = doc["pyramid"]["male"][i], doc["pyramid"]["female"][i]
            if pm is None or tot[i] is None:
                continue
            s = sum(pm) + sum(pf)
            if tot[i] and abs(s - tot[i]) / tot[i] > 0.005:
                add("unit_mismatch", "error", "age pyramid does not sum to total population", geo=gid, indicator="population", year=yr, value=s - tot[i])
        g = wide[wide.geo_id == gid].set_index("year")
        nxt = g["population"].shift(-1)
        resid = (nxt - g["population"]) - (g["births"] - g["deaths"] + g["net_migration"])
        tol = np.maximum(0.02 * (nxt - g["population"]).abs(), 2000)
        bad = resid[(resid.abs() > tol) & g.index.to_series().between(1950, 2099)]
        for y, v in bad.head(5).items():
            add("unit_mismatch", "info", "demographic balance residual (births − deaths + net migration ≠ stock change)", geo=gid, indicator="population", year=int(y), value=round(float(v)))

    # -- outliers ------------------------------------------------------------------------------
    for gid, g in wide.groupby("geo_id"):
        g = g.set_index("year").sort_index()
        rel = g["population"].pct_change()
        for y, v in rel[(rel.abs() > 0.12) & rel.notna()].items():
            add("outliers", "warning", "population changes by more than 12% in one year (check for shocks / revisions)", geo=gid, indicator="population", year=int(y), value=round(float(v) * 100, 2))
    for c in ("cbr", "cdr", "tfr", "e0", "growth_rate", "sex_ratio"):
        x = wide[wide.year == est_last_flow][["geo_id", c]].dropna()
        x = x[~x.geo_id.str.startswith("UN_") & (x.geo_id != "WORLD")]
        med = x[c].median()
        mad = (x[c] - med).abs().median() or 1e-9
        z = 0.6745 * (x[c] - med) / mad
        for _, r in x[z.abs() > 5].iterrows():
            add("outliers", "info", f"cross-sectional outlier (robust z > 5) in {est_last_flow}", geo=r.geo_id, indicator=c, year=est_last_flow, value=float(r[c]))

    # -- year mismatch -------------------------------------------------------------------------
    add("year_mismatch", "info", f"Population stocks refer to 1 January (estimates to {est_last_stock}); flows and rates refer to calendar years (estimates to {est_last_flow}). Values after these years are PROJECTIONS (UN medium variant).")
    add("year_mismatch", "info", "World Bank series have indicator-specific latest years; comparisons use the latest common year and show the year next to every value.")
    add("year_mismatch", "info", "DOSM population tables use mid-year estimates; UN WPP uses 1 January. Malaysia values from the two sources are therefore not directly comparable year-for-year.", geo="MYS")

    # -- geographic mismatch (from earlier steps' logs) -----------------------------------------
    for ev in log.events:
        msg = ev["message"]
        ctx = ev.get("context", {})
        if "geographic mismatch" in msg or "has no Natural Earth polygon" in msg or "not in UN WPP locations" in msg:
            add("geographic_mismatch", "warning", msg, geo=ctx.get("ne") or ctx.get("state") or ("MYS" if "Putrajaya" in msg or ctx.get("district") else None), value=ctx.get("name") or ctx.get("district") or ctx.get("m49"))
    add("geographic_mismatch", "warning", "Natural Earth 'France' includes the overseas departments (French Guiana, Guadeloupe, Martinique, Mayotte, Réunion) which UN WPP reports separately; per-area ratios mix coverage.", geo="FRA")
    add("geographic_mismatch", "warning", "Natural Earth 'Netherlands' polygon includes the Caribbean Netherlands (Bonaire, Sint Eustatius, Saba) which UN WPP reports separately.", geo="NLD")

    summary = defaultdict(lambda: Counter())
    for i in issues:
        summary[i["check"]][i["severity"]] += 1
    report = {
        "generated_at": utcnow(),
        "run_id": log.run_id,
        "checks": ["missing_values", "duplicate_records", "outliers", "year_mismatch", "geographic_mismatch", "unit_mismatch"],
        "summary": {k: dict(v) for k, v in summary.items()},
        "issues": issues[:5000],
        "issues_total": len(issues),
    }
    write_json(PUBLIC_DATA / "quality" / "report.json", report)
    write_json(PUBLIC_DATA / "quality" / "flags.json", {k: sorted(v) for k, v in flags.items()})
    log.step_end(STEP, issues=len(issues), **{f"{k}": sum(v.values()) for k, v in summary.items()})
    return report


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"))
