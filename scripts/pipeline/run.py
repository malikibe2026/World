#!/usr/bin/env python3
"""WorldStat Atlas data pipeline.

    Official source → Raw data → Validation → Standardisation → Geographic matching
      → Snapshot (public/data) + Supabase export (data/exports) → API → Map → Analytics → Download

Usage
    python3 scripts/pipeline/run.py                 # full run (network steps degrade gracefully)
    python3 scripts/pipeline/run.py --only wpp geo  # selected steps (dependencies are loaded from data/work)
    python3 scripts/pipeline/run.py --skip-network  # offline: no World Bank / OpenDOSM / Wikidata
    python3 scripts/pipeline/run.py --wikidata-only MYS IDN

Every run writes data/logs/pipeline-<run_id>.jsonl and public/data/logs/latest.json.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.common import PUBLIC_DATA, RAW, ROOT, WORK, ImportLog, read_json, write_json  # noqa: E402

STEPS = ["fetch", "reference", "registry", "wpp", "geo", "profiles", "search", "villages", "worldbank", "opendosm", "wikidata", "publish", "quality", "supabase_export"]
NETWORK = {"villages", "worldbank", "opendosm", "wikidata"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", choices=STEPS)
    ap.add_argument("--skip-network", action="store_true")
    ap.add_argument("--wikidata-only", nargs="*", help="limit the Wikidata step to these country ids")
    args = ap.parse_args()
    steps = args.only or STEPS
    if args.skip_network:
        steps = [s for s in steps if s not in NETWORK]

    log = ImportLog()
    log.info("pipeline", "run started", steps=steps)
    ctx: dict = {}

    def registry():
        return ctx.get("registry") or read_json(WORK / "registry.json")

    def admin():
        return ctx.get("admin") or read_json(WORK / "admin_index.json")

    failed = False
    for step in steps:
        try:
            if step == "fetch":
                from steps import fetch
                fetch.run(log)
            elif step == "reference":
                log.step_start("reference")
                subprocess.run(["node", str(ROOT / "scripts" / "pipeline" / "node" / "dump_reference.mjs")], check=True)
                log.step_end("reference")
            elif step == "registry":
                from steps import registry as s
                ctx["registry"] = s.run(log)
            elif step == "wpp":
                from steps import wpp
                wpp.run(log, registry())
            elif step == "geo":
                from steps import geo
                r = geo.run(log, registry())
                ctx["admin"] = read_json(WORK / "admin_index.json")
            elif step == "profiles":
                from steps import profiles
                profiles.run(log, registry(), admin())
            elif step == "search":
                from steps import search
                search.run(log, registry(), admin())
            elif step == "villages":
                from steps import villages
                villages.run(log, registry(), admin())
            elif step == "worldbank":
                from steps import worldbank
                worldbank.run(log, registry())
            elif step == "opendosm":
                from steps import opendosm
                opendosm.run(log, registry(), admin())
            elif step == "wikidata":
                from steps import wikidata
                wikidata.run(log, registry(), args.wikidata_only)
            elif step == "publish":
                from steps import publish
                publish.run(log)
            elif step == "quality":
                from steps import quality
                quality.run(log, registry())
            elif step == "supabase_export":
                from steps import supabase_export
                supabase_export.run(log, registry(), admin())
        except Exception as e:  # keep the log complete, then stop
            log.error(step, f"step failed: {e}", traceback=traceback.format_exc()[-2000:])
            failed = True
            break

    summary = log.summary()
    write_json(PUBLIC_DATA / "logs" / "latest.json", summary, pretty=True)
    log.info("pipeline", "run finished", status="failed" if failed else "ok", **summary["counts"])
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
