"""Step (network): landmark & tourism points from Wikidata (CC0).

One SPARQL query per country (P17) over the classes in data/registry/landmark_categories.json,
ranked by sitelink count. Output: public/data/landmarks/{ID}.json. Images are referenced by
their Wikimedia Commons file name only; the UI links every image to its Commons licence page.
If the endpoint is unreachable the step is skipped and the browser queries Wikidata live.
"""
from __future__ import annotations

import time
import urllib.parse

from lib.common import PUBLIC_DATA, REGISTRY, WORK, ImportLog, read_json, write_json
from lib.http import FetchError, fetch_json

STEP = "wikidata"
ENDPOINT = "https://query.wikidata.org/sparql"
MAX_STREAK = 5  # consecutive failures before the endpoint is treated as unreachable
LIMIT = 150


def build_query(country_qid: str, categories: list[dict], limit: int = LIMIT) -> str:
    values = " ".join(f"(wd:{q} \"{c['id']}\")" for c in categories for q in c["classes"])
    heritage = next((c for c in categories if c.get("heritage_designation")), None)
    union = ""
    if heritage:
        union = f"UNION {{ ?item wdt:P1435 wd:{heritage['heritage_designation']} . BIND(\"{heritage['id']}\" AS ?cat) }}"
    return f"""
SELECT ?item ?itemLabel ?itemDescription ?coord ?cat ?image ?sitelinks ?inception ?article WHERE {{
  {{ VALUES (?class ?cat) {{ {values} }} ?item wdt:P31 ?class . }} {union}
  ?item wdt:P17 wd:{country_qid} ; wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks .
  OPTIONAL {{ ?item wdt:P18 ?image }}
  OPTIONAL {{ ?item wdt:P571 ?inception }}
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,ms,id" }}
}} ORDER BY DESC(?sitelinks) LIMIT {limit}"""


def parse_point(wkt: str) -> list[float] | None:
    if not wkt.startswith("Point("):
        return None
    lon, lat = wkt[6:-1].split()
    return [round(float(lon), 5), round(float(lat), 5)]


def run(log: ImportLog, registry: dict, only: list[str] | None = None) -> dict:
    log.step_start(STEP)
    cats = read_json(REGISTRY / "landmark_categories.json")["categories"]
    done = failed = streak = 0
    for ent in registry["countries"]:
        if not ent.get("wikidata") or (only and ent["id"] not in only):
            continue
        q = build_query(ent["wikidata"], cats)
        url = ENDPOINT + "?format=json&query=" + urllib.parse.quote(q)
        try:
            doc, prov = fetch_json(url, max_age_s=86400 * 30, timeout=90, retries=2)
        except FetchError as e:
            # one heavy country can time out on the public endpoint; only a run of failures means "offline"
            failed += 1
            streak += 1
            log.error(STEP, "Wikidata query failed; the browser will query this country live", country=ent["id"], error=str(e)[-200:])
            if streak >= MAX_STREAK:
                log.step_end(STEP, status="skipped" if done == 0 else "partial", reason="network", countries=done, failed=failed)
                return {"ok": done > 0}
            continue
        streak = 0
        items: dict[str, dict] = {}
        for b in doc["results"]["bindings"]:
            qid = b["item"]["value"].rsplit("/", 1)[-1]
            pt = parse_point(b["coord"]["value"])
            if pt is None:
                continue
            it = items.setdefault(qid, {
                "id": qid, "name": b.get("itemLabel", {}).get("value"), "description": b.get("itemDescription", {}).get("value"),
                "coord": pt, "categories": [], "sitelinks": int(b["sitelinks"]["value"]),
                "image": b.get("image", {}).get("value", "").rsplit("/", 1)[-1] or None,
                "inception": b.get("inception", {}).get("value"), "wikipedia": b.get("article", {}).get("value"),
            })
            if b["cat"]["value"] not in it["categories"]:
                it["categories"].append(b["cat"]["value"])
        write_json(PUBLIC_DATA / "landmarks" / f"{ent['id']}.json",
                   {"country": ent["id"], "source_id": "wikidata", "retrieved_at": prov["retrieved_at"], "items": list(items.values())})
        done += 1
        time.sleep(1.0)  # be polite to the public endpoint
    log.step_end(STEP, status="ok" if not failed else "partial", countries=done, failed=failed)
    return {"ok": done > 0}


if __name__ == "__main__":
    run(ImportLog(), read_json(WORK / "registry.json"))
