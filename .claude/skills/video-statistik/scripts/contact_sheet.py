"""Builds one contact sheet from preview frames (f-<t>.jpg) or check frames (c-<t>.jpg) so a whole
video can be reviewed in a single image read.
usage: python3 scripts/contact_sheet.py <dir> <out.jpg> [cols] [thumb_width]
"""
import glob
import os
import re
import sys

from PIL import Image

d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 640
files = sorted(glob.glob(os.path.join(d, "*.jpg")), key=lambda f: float(re.findall(r"[-_]([\d.]+)\.jpg$", f)[0]) if re.findall(r"[-_]([\d.]+)\.jpg$", f) else 0)
if not files:
    sys.exit("no frames in " + d)
w0, h0 = Image.open(files[0]).size
th = round(tw * h0 / w0)
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th))
for i, f in enumerate(files):
    sheet.paste(Image.open(f).convert("RGB").resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=86)
print(out, len(files), "frames")
