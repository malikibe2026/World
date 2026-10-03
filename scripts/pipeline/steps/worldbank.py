"""Step (network): World Bank WDI snapshot.

Downloads every indicator in data/registry/indicators.json that has a `wb_code`, for all
economies, 1960 → latest, through the World Bank Indicators API v2. Writes:

  public/data/stats/wb/{ID}.json        per-country series (+ per-series lastupdated)
  public/data/stats/layers/wb/{code}.json  choropleth layers

If the API cannot be reached (e.g. network policy), the step logs an error and exits
cleanly: the browser then fetches the same API live (src/services/worldbank.ts).
"""
from __future__ import annotations

from collections import defaultdict

from lib.common import PUBLIC_DATA, REGISTRY, WORK, ImportLog, read_json, write_json
from lib.http import FetchError, fetch_json

STEP = "worldbank"
API = "https://api.worldbank.org/v2"
FIRST_YEAR = 1960
LAST_YEAR = 2026


def run(log: ImportLog, registry: dict) -> dict:
    log.step_start(STEP)
    indicators = [i for i in read_json(REGISTRY / "indicators.json") if i.get("wb_code")]
    wb_to_id = {e["wb"]: e["id"] for e in registry["countries"] if e.get("wb")}
    per_geo: dict[str, dict] = defaultdict(lambda: {"series": {}, "meta": {}})
    ok = 0
    for ind in indicators:
        url = f"{API}/country/all/indicator/{ind['wb_code']}?format=json&per_page=20000&date={FIRST_YEAR}:{LAST_YEAR}"
        try:
            doc, prov = fetch_json(url)
        except FetchError as e:
            log.error(STEP, "World Bank API unreachable; live API will be used by the browser", indicator=ind["wb_code"], error=str(e)[:300])
            if ok == 0:
                log.step_end(STEP, status="skipped", reason="network")
                return {"ok": False}
            continue
        if not isinstance(doc, list) or len(doc) < 2 or doc[1] is None:
            log.warning(STEP, "empty response", indicator=ind["wb_code"], message=str(doc)[:200])
            continue
        header, rows = doc[0], doc[1]
        values: dict[str, dict[int, float]] = defaultdict(dict)
        seen = set()
        unmatched = set()
        for r in rows:
            code = r.get("countryiso3code") or r["country"]["id"]
            gid = wb_to_id.get(code)
            if gid is None:
                unmatched.add(code)
                continue
            if r["value"] is None:
                continue
            k = (gid, int(r["date"]))
            if k in seen:
                log.warning(STEP, "duplicate observation", indicator=ind["wb_code"], geo=gid, year=k[1])
                continue
            seen.add(k)
            values[gid][int(r["date"])] = float(r["value"])
        years = list(range(FIRST_YEAR, LAST_YEAR + 1))
        layer = {gid: [v.get(y) for y in years] for gid, v in values.items()}
        write_json(PUBLIC_DATA / "stats" / "layers" / "wb" / f"{ind['code']}.json",
                   {"indicator": ind["code"], "wb_code": ind["wb_code"], "source_id": "wb_wdi", "years": years,
                    "last_updated": header.get("lastupdated"), "values": layer}, ndigits=4)
        for gid, v in values.items():
            per_geo[gid]["series"][ind["code"]] = [[y, v[y]] for y in sorted(v)]
            per_geo[gid]["meta"][ind["code"]] = {"last_updated": header.get("lastupdated"), "wb_code": ind["wb_code"]}
        ok += 1
        log.info(STEP, "indicator downloaded", indicator=ind["wb_code"], economies=len(values), last_updated=header.get("lastupdated"),
                 sha256=prov["sha256"], aggregates_ignored=len(unmatched))
    for gid, doc in per_geo.items():
        write_json(PUBLIC_DATA / "stats" / "wb" / f"{gid}.json", {"id": gid, "source_id": "wb_wdi", **doc}, ndigits=4)
    write_json(WORK / "wb_status.json", {"ok": ok, "indicators": len(indicators)})
    log.step_end(STEP, indicators=ok, economies=len(per_geo))
    return {"ok": ok > 0}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"))
