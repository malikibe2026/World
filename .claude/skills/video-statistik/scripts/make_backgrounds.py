"""Turns captured PNGs into the JPEGs and derived images the templates load.
usage: python3 scripts/make_backgrounds.py <workspace>
- every shots/*.png -> shots/*.jpg (q93; the templates read .jpg)
- blurred backdrops bg-hl.jpg, bg-world.jpg, bg-asia.jpg from the aerial shots
- inp-crop.png: the focused search box from search-p094 (used by the typing animation in 16:9)
"""
import glob
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

W = sys.argv[1]
S = os.path.join(W, "shots")
for f in glob.glob(os.path.join(S, "*.png")):
    n = os.path.basename(f)
    if n.startswith(("noise", "inp-crop")):
        continue
    Image.open(f).convert("RGB").save(f[:-4] + ".jpg", quality=93)


def blurred(src, dst, radius, brightness):
    p = os.path.join(S, src)
    if not os.path.exists(p):
        print("skip", dst, "(missing", src + ")")
        return
    im = Image.open(p).convert("RGB").resize((960, 540), Image.LANCZOS).filter(ImageFilter.GaussianBlur(radius))
    ImageEnhance.Brightness(im).enhance(brightness).resize((1920, 1080), Image.BICUBIC).save(os.path.join(S, dst), quality=92)


blurred("a-hl.png", "bg-hl.jpg", 22, 0.42)
blurred("a-world.png", "bg-world.jpg", 14, 0.8)
blurred("a-asia.png", "bg-asia.jpg", 26, 0.35)
sp = os.path.join(S, "search-p094.png")
if os.path.exists(sp):
    # CSS (0,60)-(300,120) of the 1600x900@2x screenshot = the focused search input
    Image.open(sp).convert("RGB").crop((0, 120, 600, 240)).save(os.path.join(S, "inp-crop.png"))
print("ok")
