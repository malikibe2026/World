#!/usr/bin/env bash
# Checks which hosts this session can reach, grouped by purpose (see references/domains.md).
# usage: check_domains.sh [data|nso|peta|video|deploy|semua]   (default: semua)
# Prints one line per host: OK / SEKAT, the HTTP code and what the host is for. Exit code 1 when a
# required host of the chosen group is blocked, so callers can stop before starting long work.
set -u
GROUP="${1:-semua}"

# group|required(1/0)|test url|purpose
CHECKS=$(cat <<'EOF'
data|1|https://storage.dosm.gov.my/population/population_state.csv|OpenDOSM CSV/Parquet
data|1|https://storage.data.gov.my/|data.gov.my files (link_csv)
data|1|https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/README.md|katalog DOSM, geodata, UN WPP, Natural Earth
data|1|https://media.githubusercontent.com/|geoBoundaries (LFS)
data|1|https://api.worldbank.org/v2/country/MYS?format=json|World Bank WDI
data|1|https://download.geonames.org/export/dump/readme.txt|GeoNames (kampung)
data|0|https://query.wikidata.org/sparql?query=ASK%7B%7D|Wikidata (mercu tanda)
data|0|https://api.data.gov.my/data-catalogue?id=population_state&limit=1|API data.gov.my
nso|0|https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00001?format=JSON&geo=DE|Eurostat (EU/EFTA)
nso|0|https://tablebuilder.singstat.gov.sg/api/table/tabledata/M810001|SingStat (Singapura)
nso|0|https://data.api.abs.gov.au/rest/dataflow|ABS (Australia)
nso|0|https://www150.statcan.gc.ca/t1/wds/rest/getAllCubesListLite|Statistics Canada
nso|0|https://api.census.gov/data.json|US Census Bureau
nso|0|https://api.beta.ons.gov.uk/v1/datasets|ONS (UK)
nso|0|https://openstat.psa.gov.ph/|PSA OpenSTAT (Filipina)
peta|1|https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/3|Esri satelit
peta|1|https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/2/1/3|Esri jalan & nama jalan
peta|0|https://s3.amazonaws.com/elevation-tiles-prod/terrarium/2/1/1.png|AWS rupa bumi
video|1|https://registry.npmjs.org/three-globe|npm (three, tekstur NASA, bendera)
video|1|https://fonts.googleapis.com/css2?family=Inter|Google Fonts (CSS)
video|1|https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/3|Esri satelit (penerbangan peta)
video|1|https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/2/1/3|Esri jalan (penerbangan peta)
video|0|https://pypi.org/simple/scipy/|PyPI (scipy untuk muzik)
deploy|0|https://api.netlify.com/api/v1/|Netlify API
EOF
)

blocked_required=0
printf "%-6s %-5s %-4s %-34s %s\n" KUMP STAT KOD HOS TUJUAN
while IFS='|' read -r grp req url purpose; do
  [ -z "$grp" ] && continue
  if [ "$GROUP" != "semua" ] && [ "$GROUP" != "$grp" ]; then continue; fi
  code=$(curl -s -o /dev/null -m 12 -w '%{http_code}' "$url" 2>/dev/null || true)
  host=$(echo "$url" | sed -E 's#https?://([^/]+).*#\1#')
  case "$code" in
    # a proxy refusal shows up as 000 (the CONNECT fails); any HTTP status means the host answered
    2*|3*|401|403|404|405) stat=OK ;;
    *) stat=SEKAT; [ "$req" = 1 ] && blocked_required=1 ;;
  esac
  mark=$([ "$req" = 1 ] && echo "*" || echo " ")
  printf "%-6s %-5s %-4s %-34s %s\n" "$grp" "$stat" "$code" "$host$mark" "$purpose"
done <<< "$CHECKS"
echo "(* = wajib untuk kumpulan itu)"
if [ "$blocked_required" = 1 ]; then
  echo "Ada hos wajib disekat. Minta pengguna tambah hos SEKAT* di Allowed domains (lihat references/domains.md)."
  exit 1
fi
