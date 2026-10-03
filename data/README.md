# data/

| Folder | Di-commit? | Kandungan |
|---|---|---|
| `registry/` | ya | Registri sumber, indikator, kategori mercu tanda, crosswalk nama daerah Malaysia (disunting dengan tangan) |
| `curated/` | ya | Kandungan editorial dengan rujukan (garis masa sejarah) |
| `raw/` | tidak | Muat turun asal (dijana semula oleh `run.py --only fetch`) |
| `work/` | tidak | Jadual perantaraan pipeline |
| `exports/` | tidak | CSV untuk Supabase (`scripts/supabase/load_exports.sql`) |
| `logs/` | ringkasan sahaja | `pipeline-*.jsonl` (tidak di-commit); ringkasan terakhir di `public/data/logs/latest.json` |
