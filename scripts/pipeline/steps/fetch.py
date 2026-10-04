"""Step: fetch raw source files (idempotent; skips files that already exist).

All raw files land in data/raw (git-ignored) and their checksums go to the manifest.
"""
from __future__ import annotations

from lib.common import RAW, ImportLog, sha256
from lib.http import FetchError, fetch

STEP = "fetch"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
WPP = "https://raw.githubusercontent.com/PPgp/wpp2024/main/data/{}"
GB = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/MYS/{lvl}/geoBoundaries-MYS-{lvl}_simplified.geojson"
FONTS = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/{font}/{range}.pbf"
# DOSM open geodata (DOSM Open Data Licence): parliamentary constituency boundaries, P.001–P.222
DOSM_PARLIMEN = "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/geodata/electoral_0_parlimen.geojson"

NE_LAYERS = [
    "ne_110m_admin_0_countries", "ne_50m_admin_0_countries", "ne_10m_admin_0_countries", "ne_10m_admin_1_states_provinces",
    "ne_10m_populated_places_simple", "ne_50m_rivers_lake_centerlines", "ne_10m_rivers_lake_centerlines", "ne_50m_lakes",
    "ne_10m_lakes", "ne_10m_geography_regions_elevation_points", "ne_10m_geography_regions_points",
    "ne_10m_geography_regions_polys", "ne_10m_geography_marine_polys", "ne_10m_airports", "ne_10m_ports", "ne_10m_roads",
    "ne_10m_urban_areas_landscan",
]
WPP_FILES = ["popAge1dt.rda", "popprojAge1dt.rda", "misc1dt.rda", "miscproj1dt.rda", "e01dt.rda", "e0proj1dt.rda", "tfr1dt.rda",
             "tfrproj1dt.rda", "sexRatio1dt.rda", "mig1dt.rda", "migproj1dt.rda", "UNlocations.txt"]
FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"]
FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023", "7680-7935", "8192-8447"]


def _get(log: ImportLog, url: str, dest) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    body, prov = fetch(url, cache=False, timeout=300)
    dest.write_bytes(body)
    log.info(STEP, "downloaded", url=url, bytes=prov["bytes"], sha256=prov["sha256"])


def run(log: ImportLog) -> None:
    log.step_start(STEP)
    jobs = [(NE.format(n), RAW / "ne" / f"{n}.geojson") for n in NE_LAYERS]
    jobs += [(WPP.format(f), RAW / "wpp" / f) for f in WPP_FILES]
    jobs += [(GB.format(lvl=lvl), RAW / "gb" / f"MYS_{lvl}.geojson") for lvl in ("ADM0", "ADM1", "ADM2")]
    jobs += [(DOSM_PARLIMEN, RAW / "dosm" / "electoral_0_parlimen.geojson")]
    jobs += [(FONTS.format(font=f.replace(" ", "%20"), range=r), RAW / "fonts" / f / f"{r}.pbf") for f in FONT_STACKS for r in FONT_RANGES]
    errors = 0
    for url, dest in jobs:
        try:
            _get(log, url, dest)
        except FetchError as e:
            errors += 1
            log.error(STEP, "download failed", url=url, error=str(e)[:200])
    for dest in [d for _, d in jobs if d.exists()][:0]:
        sha256(dest)
    log.step_end(STEP, status="ok" if errors == 0 else "partial", files=len(jobs), errors=errors)
