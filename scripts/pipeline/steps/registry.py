"""Step: geographic registry & matching.

Builds the canonical list of geographic entities (World → UN regions → countries)
and the code crosswalk used by every other step:

    Natural Earth ADM0_A3 / ISO_A3_EH / ISO_N3_EH  ↔  UN M49 (WPP)  ↔  World Bank code  ↔  ISO 3166

Every unmatched or overridden code is written to the import log so geographic
mismatches can be traced (see data quality engine: `geographic_mismatch`).
"""
from __future__ import annotations

import json

import pandas as pd

from lib.common import PUBLIC_DATA, RAW, WORK, ImportLog, read_json, write_json

STEP = "registry"

# Entities that NE codes as -99 but that have a well-defined M49 / WB code.
M49_OVERRIDES = {"KOS": 412, "NOR": 578, "FRA": 250}
WB_OVERRIDES = {"KOS": "XKX", "PSX": "PSE"}
ISO3_OVERRIDES = {"KOS": "XKX"}  # canonical id used across the atlas
WC_OVERRIDES = {"XKX": "UNK"}  # world-countries uses 'UNK' for Kosovo

# UN M49 continental areas used for WORLD → continent navigation.
CONTINENTS = {
    903: {"id": "UN_903", "name": "Africa", "name_ms": "Afrika"},
    935: {"id": "UN_935", "name": "Asia", "name_ms": "Asia"},
    908: {"id": "UN_908", "name": "Europe", "name_ms": "Eropah"},
    904: {"id": "UN_904", "name": "Latin America and the Caribbean", "name_ms": "Amerika Latin dan Caribbean"},
    905: {"id": "UN_905", "name": "Northern America", "name_ms": "Amerika Utara"},
    909: {"id": "UN_909", "name": "Oceania", "name_ms": "Oceania"},
}


def _num(v) -> int | None:
    try:
        n = int(str(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def run(log: ImportLog) -> dict:
    log.step_start(STEP)
    ne = read_json(RAW / "ne" / "ne_10m_admin_0_countries.geojson")
    wc_doc = read_json(WORK / "reference" / "world-countries.json")
    tz_doc = read_json(WORK / "reference" / "timezones.json")
    wc = {c["cca3"]: c for c in wc_doc["countries"]}
    tz = tz_doc["timezones"]
    unloc = pd.read_csv(RAW / "wpp" / "UNlocations.txt", sep="\t")
    un_countries = unloc[unloc.location_type == 4].set_index("country_code")

    entities: list[dict] = []
    matched_m49: set[int] = set()
    all_a3 = {f["properties"]["ADM0_A3"] for f in ne["features"]}
    for f in ne["features"]:
        p = f["properties"]
        a3 = p["ADM0_A3"]
        iso3 = p["ISO_A3_EH"] if p["ISO_A3_EH"] not in ("-99", None) else None
        # A polygon whose ISO code belongs to another polygon (Clipperton→FRA, Baikonur→KAZ, Coral Sea Is.→AUS …)
        # is a secondary part: it keeps its own NE code and gets no statistics.
        secondary = iso3 is not None and iso3 != a3 and iso3 in all_a3
        if secondary:
            log.info(STEP, "secondary polygon of another country; own id, statistics not attached", ne=a3, parent=iso3)
            iso3 = None
        canon = ISO3_OVERRIDES.get(a3) or iso3 or a3
        m49 = None if secondary else (M49_OVERRIDES.get(a3) or _num(p["ISO_N3_EH"]) or _num(p["UN_A3"]))
        if m49 is not None and m49 not in un_countries.index:
            log.warning(STEP, "NE numeric code not in UN WPP locations", ne=a3, m49=m49)
            m49 = None
        if m49 is not None and m49 in matched_m49:
            # e.g. Baikonur (KAZ) or Indian Ocean Territories (AUS) share the parent's code:
            # keep statistics on the main polygon only.
            log.info(STEP, "secondary polygon shares parent M49; statistics not attached", ne=a3, m49=m49)
            m49 = None
        if m49 is not None:
            matched_m49.add(m49)
        wb = WB_OVERRIDES.get(a3) or (p["WB_A3"] if p["WB_A3"] not in ("-99", None) else iso3)
        wcr = wc.get(WC_OVERRIDES.get(canon, canon))
        un = un_countries.loc[m49] if m49 is not None else None
        area_code = int(un["area_code"]) if un is not None else None
        iso2 = p["ISO_A2_EH"] if p["ISO_A2_EH"] not in ("-99", None) else None
        ent = {
            "id": canon,
            "level": "country",
            # common short name (world-countries), else Natural Earth's NAME (e.g. "China", not "People's Republic of China")
            "name": ((wcr or {}).get("name") or {}).get("common") or p["NAME"] or p["NAME_EN"],
            "name_long": p["NAME_LONG"],
            "name_official": (wcr or {}).get("name", {}).get("official") or p["FORMAL_EN"],
            "name_local": [v.get("common") for v in ((wcr or {}).get("name", {}).get("native") or {}).values()][:3],
            "iso2": iso2,
            "iso3": iso3,
            "m49": m49,
            "wb": wb,
            "ne_a3": a3,
            "wikidata": p["WIKIDATAID"],
            "type": p["TYPE"],
            "sovereign": p["SOVEREIGNT"],
            "continent_ne": p["CONTINENT"],
            "un_area_code": area_code,
            "continent": CONTINENTS[area_code]["name"] if area_code in CONTINENTS else None,
            "continent_id": CONTINENTS[area_code]["id"] if area_code in CONTINENTS else None,
            "un_reg_code": int(un["reg_code"]) if un is not None else None,
            "subregion": un["reg_name"] if un is not None else p["SUBREGION"],
            "wpp_name": un["name"] if un is not None else None,
            "label": [round(float(p["LABEL_X"]), 4), round(float(p["LABEL_Y"]), 4)],
            "min_zoom": p["MIN_ZOOM"],
            "label_rank": p["LABELRANK"],
            "income_group_ne": p["INCOME_GRP"],
            "capital": (wcr or {}).get("capital") or [],
            "languages": list(((wcr or {}).get("languages") or {}).values()),
            "currencies": [
                {"code": k, "name": v.get("name"), "symbol": v.get("symbol")}
                for k, v in ((wcr or {}).get("currencies") or {}).items()
            ],
            "tld": (wcr or {}).get("tld") or [],
            "calling_code": ((wcr or {}).get("idd") or {}).get("root", "") + (
                ((wcr or {}).get("idd") or {}).get("suffixes", [""])[0] if len(((wcr or {}).get("idd") or {}).get("suffixes", [])) == 1 else ""
            ),
            "landlocked": (wcr or {}).get("landlocked"),
            "borders": [b if b != "UNK" else "XKX" for b in ((wcr or {}).get("borders") or [])],
            "flag": (wcr or {}).get("flag"),
            "un_member": (wcr or {}).get("unMember"),
            "independent": (wcr or {}).get("independent"),
            "timezones": tz.get(iso2 or "", []),
        }
        if wcr is None:
            log.info(STEP, "no world-countries reference record (attributes left empty)", ne=a3, name=ent["name"])
        entities.append(ent)

    missing = sorted(set(un_countries.index) - matched_m49)
    for m in missing:
        log.warning(
            STEP,
            "UN WPP location has no Natural Earth polygon (statistics available, not mappable)",
            m49=int(m),
            name=un_countries.loc[m, "name"],
        )

    # UN regional aggregates kept for WORLD and continent views.
    regions = [{"id": "WORLD", "level": "world", "name": "World", "name_ms": "Dunia", "m49": 900}]
    for code, c in CONTINENTS.items():
        members = [e["id"] for e in entities if e["un_area_code"] == code and e["m49"]]
        regions.append({**c, "level": "continent", "m49": code, "members": members})
    subregions = []
    for code, grp in un_countries.groupby("reg_code"):
        row = unloc[unloc.country_code == code]
        if row.empty:
            continue
        members = [e["id"] for e in entities if e["un_reg_code"] == code]
        subregions.append({
            "id": f"UN_{int(code)}",
            "level": "subregion",
            "name": row.iloc[0]["name"],
            "m49": int(code),
            "continent_id": CONTINENTS.get(int(grp.iloc[0]["area_code"]), {}).get("id"),
            "members": members,
        })

    registry = {"countries": entities, "regions": regions, "subregions": subregions}
    write_json(WORK / "registry.json", registry)
    write_json(PUBLIC_DATA / "meta" / "regions.json", {"regions": regions, "subregions": subregions})
    log.step_end(STEP, entities=len(entities), wpp_matched=len(matched_m49), wpp_unmapped=len(missing))
    return registry


if __name__ == "__main__":
    run(ImportLog())
