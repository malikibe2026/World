"""Step: publish registries, curated content, fonts and the dataset manifest.

The manifest (public/data/manifest.json) is the snapshot's table of contents: every
dataset version with retrieval time, checksum and licence — what the UI shows under
"Sources" and what every export file embeds as `last_updated`.
"""
from __future__ import annotations

import shutil

from lib.common import CURATED, PUBLIC_DATA, RAW, REGISTRY, ROOT, WORK, ImportLog, read_json, sha256, utcnow, write_json

STEP = "publish"

DATASET_FILES = {
    "un_wpp_2024": ["wpp/popAge1dt.rda", "wpp/popprojAge1dt.rda", "wpp/misc1dt.rda", "wpp/miscproj1dt.rda", "wpp/e01dt.rda",
                    "wpp/e0proj1dt.rda", "wpp/tfr1dt.rda", "wpp/tfrproj1dt.rda", "wpp/sexRatio1dt.rda", "wpp/mig1dt.rda", "wpp/migproj1dt.rda", "wpp/UNlocations.txt"],
    "natural_earth": ["ne/ne_110m_admin_0_countries.geojson", "ne/ne_50m_admin_0_countries.geojson", "ne/ne_10m_admin_0_countries.geojson",
                      "ne/ne_10m_admin_1_states_provinces.geojson", "ne/ne_10m_populated_places_simple.geojson"],
    "geoboundaries": ["gb/MYS_ADM1.geojson", "gb/MYS_ADM2.geojson"],
}
VERSIONS = {
    "un_wpp_2024": {"version": "WPP 2024 (wpp2024 R package 1.1-3)", "reference": "Estimates 1950–2023, projections 2024–2100 (medium variant)"},
    "natural_earth": {"version": "natural-earth-vector master (5.2.0-pre)"},
    "geoboundaries": {"version": "gbOpen MYS ADM1/ADM2, build Dec 12, 2023 (boundary year 2020)"},
}


def run(log: ImportLog) -> dict:
    log.step_start(STEP)
    meta = PUBLIC_DATA / "meta"
    sources = read_json(REGISTRY / "sources.json")
    indicators = read_json(REGISTRY / "indicators.json")
    ids = {s["id"] for s in sources}
    for ind in indicators:
        for k in ("source_id", "inputs_source_id"):
            if ind.get(k) and ind[k] not in ids:
                log.error(STEP, "indicator references unknown source", indicator=ind["code"], source=ind[k])
    write_json(meta / "sources.json", sources, pretty=True)
    write_json(meta / "indicators.json", indicators, pretty=True)
    write_json(meta / "landmark_categories.json", read_json(REGISTRY / "landmark_categories.json"))

    hist = PUBLIC_DATA / "history"
    hist.mkdir(parents=True, exist_ok=True)
    for p in (CURATED / "history").glob("*.json"):
        doc = read_json(p)
        for e in doc["events"]:
            if not e.get("refs"):
                log.error(STEP, "history event without reference", country=doc["id"], event=e["id"])
        write_json(hist / p.name, doc)

    fonts_src, fonts_dst = RAW / "fonts", ROOT / "public" / "fonts"
    if fonts_src.exists():
        shutil.copytree(fonts_src, fonts_dst, dirs_exist_ok=True)

    datasets = []
    for sid, files in DATASET_FILES.items():
        entries = []
        for rel in files:
            p = RAW / rel
            if p.exists():
                entries.append({"file": rel, "bytes": p.stat().st_size, "sha256": sha256(p)})
            else:
                log.warning(STEP, "raw file missing for manifest", file=rel)
        datasets.append({"source_id": sid, **VERSIONS.get(sid, {}), "files": entries})
    ref = WORK / "reference"
    for name, sid in (("world-countries.json", "world_countries"), ("timezones.json", "iana_tz"), ("geonames-places.json", "geonames")):
        if (ref / name).exists():
            datasets.append({"source_id": sid, "version": read_json(ref / name).get("version"), "files": [{"file": f"work/reference/{name}", "sha256": sha256(ref / name)}]})
    my_cat = PUBLIC_DATA / "stats" / "my" / "catalogue.json"
    if my_cat.exists():
        cat = read_json(my_cat)["datasets"]
        datasets.append({"source_id": "dosm_opendosm", "version": "catalogue metadata", "datasets": {k: {"last_updated": v.get("last_updated"), "next_update": v.get("next_update")} for k, v in cat.items()},
                         "data_loaded": all((PUBLIC_DATA / "stats" / "my" / f).exists() for f in ("admin1.json",))})
    wb_status = WORK / "wb_status.json"
    datasets.append({"source_id": "wb_wdi", "mode": "snapshot" if wb_status.exists() and read_json(wb_status)["ok"] else "live"})
    lm = PUBLIC_DATA / "landmarks"
    datasets.append({"source_id": "wikidata", "mode": "snapshot" if lm.exists() and any(lm.iterdir()) else "live"})

    manifest = {
        "app": "WorldStat Atlas",
        "snapshot_built_at": utcnow(),
        "run_id": log.run_id,
        "datasets": datasets,
        "available": {
            "wpp": True,
            "wb_snapshot": (PUBLIC_DATA / "stats" / "layers" / "wb").exists(),
            "dosm_snapshot": (PUBLIC_DATA / "stats" / "my" / "admin1.json").exists(),
            "landmarks_snapshot": lm.exists() and any(lm.iterdir()),
        },
    }
    write_json(PUBLIC_DATA / "manifest.json", manifest, pretty=True)
    log.step_end(STEP, sources=len(sources), indicators=len(indicators))
    return manifest


if __name__ == "__main__":
    run(ImportLog())
