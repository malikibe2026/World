#!/usr/bin/env bash
# Prepares a video workspace (run from the repository root):
#   setup_workspace.sh <dir> [district_id] [focus_village_gid]
# defaults: MY-10-hulu-langat and 1763768 (Kampung Sungai Tekali), the proven descent target.
# Needs: registry.npmjs.org, fonts.googleapis.com / fonts.gstatic.com (see references/domains.md).
set -euo pipefail
W="${1:?usage: setup_workspace.sh <dir> [district_id] [village_gid]}"
DISTRICT="${2:-MY-10-hulu-langat}"
FOCUS="${3:-1763768}"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(pwd)"
mkdir -p "$W"/{lib/ml,tex,fonts,shots/flags,desc-data,npm,seg,pv}

echo "== templates and scripts"
cp "$SKILL"/assets/templates/*.html "$W"/
cp "$SKILL"/assets/templates/lib/*.js "$W"/lib/
cp -r "$SKILL"/scripts "$W"/

echo "== npm packages (three, three-globe textures, flag-icons)"
fetch_pkg() { # name version
  local d="$W/npm/$1-$2"; [ -d "$d" ] && return
  mkdir -p "$d" && curl -fsSL "https://registry.npmjs.org/$1/-/$1-$2.tgz" | tar xz -C "$d"
}
fetch_pkg three 0.186.1
fetch_pkg three-globe 2.45.6
fetch_pkg flag-icons 7.6.0
cp "$W"/npm/three-0.186.1/package/build/three.module.js "$W"/npm/three-0.186.1/package/build/three.core.js "$W"/lib/
IMG="$W/npm/three-globe-2.45.6/package/example/img"
cp "$IMG"/{earth-blue-marble.jpg,earth-night.jpg,earth-water.png,night-sky.png} "$W"/tex/
cp "$W"/npm/flag-icons-7.6.0/package/flags/4x3/*.svg "$W"/shots/flags/

echo "== MapLibre from the app's node_modules"
cp "$REPO"/node_modules/maplibre-gl/dist/maplibre-gl*.mjs "$REPO"/node_modules/maplibre-gl/dist/maplibre-gl.css "$W"/lib/ml/
cp -r "$REPO"/dist/fonts "$W"/desc-data/ 2>/dev/null || cp -r "$REPO"/public/fonts "$W"/desc-data/

echo "== fonts (Plus Jakarta Sans, Inter, JetBrains Mono)"
python3 - "$W/fonts" <<'EOF'
import re, subprocess, sys, urllib.request
out = sys.argv[1]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def grab(query, cssname):
    req = urllib.request.Request("https://fonts.googleapis.com/css2?" + query + "&display=block", headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=60).read().decode()
    faces = []
    for sub, body in re.findall(r"/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}", css, re.S):
        if sub not in ("latin", "latin-ext"):
            continue
        url = re.search(r"url\((.*?)\)", body).group(1)
        fam = re.search(r"font-family: '(.*?)'", body).group(1)
        w = re.search(r"font-weight: ([\d ]+)", body).group(1).replace(" ", "_")
        fn = f"{fam.replace(' ', '')}-{w}-{sub}.woff2"
        subprocess.run(["curl", "-fsS", "-o", f"{out}/{fn}", url], check=True)
        faces.append("@font-face {" + body.replace(url, fn) + "}")
    open(f"{out}/{cssname}", "w").write("\n".join(faces))
    print(cssname, len(faces), "faces")
grab("family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:wght@500;700", "fonts.css")
grab("family=Plus+Jakarta+Sans:wght@500;600;700;800", "fonts2.css")
EOF

echo "== flags list, grain tiles, descent data"
python3 - "$W" "$REPO" "$DISTRICT" "$FOCUS" <<'EOF'
import json, os, random, sys
import numpy as np
from PIL import Image
W, REPO, DISTRICT, FOCUS = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
c = json.load(open(f"{REPO}/public/data/meta/countries.json"))
have = {f[:-4] for f in os.listdir(f"{W}/shots/flags") if f.endswith(".svg")}
iso = sorted({x["iso2"].lower() for x in c if x.get("iso2") and x["iso2"].lower() in have})
random.Random(42).shuffle(iso)
if "my" in iso: iso.remove("my")          # Malaysia is placed by hand at the centre of the wall
json.dump({"iso": iso}, open(f"{W}/shots/flags/list.json", "w"))
rng = np.random.default_rng(7)
for i in range(6):
    Image.fromarray(rng.normal(128, 40, (256, 256)).clip(0, 255).astype("uint8"), "L").save(f"{W}/shots/noise{i}.png")
state = DISTRICT[:5]
g = json.load(open(f"{REPO}/data/work/geo/admin2.geojson"))
feat = [f for f in g["features"] if f["properties"]["id"] == DISTRICT]
json.dump({"type": "FeatureCollection", "features": feat}, open(f"{W}/desc-data/district.geojson", "w"))
items = json.load(open(f"{REPO}/public/data/geo/places/my/{state}.json"))["items"]
pts = [{"type": "Feature", "properties": {"name": i[1].replace("Kampong ", "Kampung "), "focus": i[0] == FOCUS},
        "geometry": {"type": "Point", "coordinates": [i[3], i[4]]}} for i in items if i[5] == DISTRICT]
json.dump({"type": "FeatureCollection", "features": pts}, open(f"{W}/desc-data/villages.geojson", "w"))
focus = [p for p in pts if p["properties"]["focus"]]
print(len(iso), "flags;", len(pts), "villages in", DISTRICT, "; focus:", focus[0]["properties"]["name"] if focus else "NOT FOUND", focus[0]["geometry"]["coordinates"] if focus else "")
EOF
# the descent template reads desc-data/hulu-langat.geojson; keep that name working for any district
cp "$W"/desc-data/district.geojson "$W"/desc-data/hulu-langat.geojson
echo "Siap: $W. Seterusnya: tangkap skrin (scripts/capture_app.mjs), kemudian scripts/make_backgrounds.py."
echo "Jika kampung fokus berubah, kemas kini koordinat akhir dalam $W/lib/path.js (lonAt/latAt)."
