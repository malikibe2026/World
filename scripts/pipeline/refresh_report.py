#!/usr/bin/env python3
"""Summarise what a scheduled data refresh changed, for the pull request it opens.

Compares the regenerated snapshot in the working tree with the last commit (git HEAD):
  * whether anything other than run metadata changed (timestamps in logs/manifest/quality)
  * which OpenDOSM datasets have a newer `last_updated`
  * files changed per data folder
  * quality warnings and import-log errors of this run, including structural breaks

Usage: python3 scripts/pipeline/refresh_report.py <markdown-out>
Writes the markdown summary to <markdown-out> and `changed=true|false` to $GITHUB_OUTPUT.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = "public/data"
# files rewritten on every run (run id / timestamps): a change here alone is not a data update
VOLATILE = {f"{DATA}/logs/latest.json", f"{DATA}/manifest.json", f"{DATA}/quality/report.json", f"{DATA}/quality/flags.json"}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def head_json(path: str):
    try:
        return json.loads(git("show", f"HEAD:{path}"))
    except subprocess.CalledProcessError:
        return None


def main(out: Path) -> int:
    status = [line for line in git("status", "--porcelain", "--untracked-files=all", "--", DATA).splitlines() if line.strip()]
    paths = [line[3:].strip() for line in status]
    real = [p for p in paths if p not in VOLATILE]
    changed = bool(real)

    lines = ["## Kemas kini data automatik", ""]
    if not changed:
        lines.append("Tiada perubahan data berbanding snapshot semasa (hanya metadata larian).")
    else:
        per_folder = Counter("/".join(p.split("/")[:4]) for p in real)
        lines += ["### Fail berubah", "", "| Folder | Fail |", "|---|---|"]
        lines += [f"| `{k}` | {v} |" for k, v in sorted(per_folder.items())]
        lines.append("")

    cat_path = f"{DATA}/stats/my/catalogue.json"
    old = (head_json(cat_path) or {}).get("datasets", {})
    new_file = ROOT / cat_path
    new = json.loads(new_file.read_text())["datasets"] if new_file.exists() else {}
    updated = [(k, old.get(k, {}).get("last_updated"), v.get("last_updated"), v.get("dataset_end")) for k, v in sorted(new.items())
               if v.get("last_updated") != old.get(k, {}).get("last_updated")]
    if updated:
        lines += ["### Dataset OpenDOSM dengan kemas kini baharu", "", "| Dataset | Dahulu | Kini | Data hingga |", "|---|---|---|---|"]
        lines += [f"| `{k}` | {a or '—'} | {b or '—'} | {e or '—'} |" for k, a, b, e in updated]
        lines.append("")

    log = json.loads((ROOT / DATA / "logs" / "latest.json").read_text())
    errors = log.get("errors") or []
    if errors:
        lines += ["### Ralat import (langkah gagal dengan selamat)", ""]
        lines += [f"- `{e.get('step')}`: {e.get('message')}" for e in errors[:20]]
        lines.append("")

    report = json.loads((ROOT / DATA / "quality" / "report.json").read_text())
    lines += ["### Laporan kualiti", "", "| Semakan | Tahap | Bilangan |", "|---|---|---|"]
    for check, levels in sorted(report.get("summary", {}).items()):
        for level, n in sorted(levels.items()):
            lines.append(f"| {check} | {level} | {n} |")
    breaks = [i for i in report.get("issues", []) if "structural break" in i.get("message", "")]
    if breaks:
        lines += ["", "**Perubahan sempadan dikesan** (graf diputuskan, tiada kepadatan merentasinya):", ""]
        lines += [f"- {i['message']}" for i in breaks[:20]]
    lines += ["", "Semak laman pratonton PR ini sebelum digabungkan. Gabung = terbit ke laman utama."]

    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
    print(f"changed={changed} files={len(real)} dosm_updates={len(updated)} errors={len(errors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "refresh-summary.md")))
