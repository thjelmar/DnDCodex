#!/usr/bin/env python3
"""Generate the demo's embedded images (T-34): a world-map background, two
handouts, and a gallery sigil. Outputs small stylized WebP data URLs into
src/data/demoSeedImages.ts. Requires Pillow (`pip install Pillow`).

Run from the dnd-codex/ dir:  python3 scripts/gen-demo-images.py
"""
import base64, io, math, os, sys

from PIL import Image, ImageDraw, ImageFont

OUT_TS = sys.argv[1] if len(sys.argv) > 1 else "src/data/demoSeedImages.ts"
PREVIEW_DIR = sys.argv[2] if len(sys.argv) > 2 else None

PARCH = (228, 216, 188)
PARCH_DK = (210, 196, 162)
INK = (62, 48, 34)
INK_SOFT = (104, 86, 62)
SEA = (150, 170, 176)
FOREST = (78, 110, 72)
HILL = (150, 140, 120)
GOLD = (176, 130, 46)
WAX = (150, 54, 46)


def font(size, bold=False):
    names = (
        ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
         "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"]
        if bold else
        ["/System/Library/Fonts/Supplemental/Georgia.ttf",
         "/System/Library/Fonts/Supplemental/Times New Roman.ttf"]
    )
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def parchment(w, h, border=True):
    im = Image.new("RGB", (w, h), PARCH)
    d = ImageDraw.Draw(im)
    # subtle mottling
    import random
    random.seed(7)
    for _ in range(int(w * h / 900)):
        x, y = random.randint(0, w - 1), random.randint(0, h - 1)
        d.point((x, y), fill=PARCH_DK)
    if border:
        d.rectangle([6, 6, w - 7, h - 7], outline=INK_SOFT, width=2)
        d.rectangle([12, 12, w - 13, h - 13], outline=PARCH_DK, width=1)
    return im, d


def centered(d, cx, y, text, f, fill):
    bb = d.textbbox((0, 0), text, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, y), text, font=f, fill=fill)


def world_map():
    w, h = 640, 440
    im, d = parchment(w, h, border=True)
    # sea along the left with a wavy coast
    coast = []
    for i in range(0, h + 1, 8):
        x = 120 + 26 * math.sin(i / 48.0)
        coast.append((x, i))
    poly = [(0, 0)] + coast + [(0, h)]
    d.polygon(poly, fill=SEA)
    for i in range(14, h, 26):  # sea hatching
        d.line([(10, i), (96 + 20 * math.sin(i / 48.0), i)], fill=(132, 154, 160), width=1)
    # Thornwood forest (center) — little trees
    import random
    random.seed(3)
    for _ in range(120):
        x = random.randint(300, 470)
        y = random.randint(250, 360)
        s = random.randint(5, 9)
        d.polygon([(x, y - s), (x - s * 0.7, y + s * 0.6), (x + s * 0.7, y + s * 0.6)], fill=FOREST)
    # Hills + the vault (right)
    for i, (hx, hy, hs) in enumerate([(500, 150, 60), (548, 175, 72), (588, 150, 56)]):
        d.polygon([(hx - hs, hy + hs * 0.6), (hx, hy - hs * 0.5), (hx + hs, hy + hs * 0.6)], fill=HILL)
    d.line([(560, 250), (556, 232), (572, 232), (568, 250)], fill=INK, width=2)  # vault mouth
    # Caldemar (coastal city) — a little cluster of keeps
    cx, cy = 182, 185
    for bx, by, bw, bh in [(-10, -6, 12, 18), (4, -14, 10, 26), (16, -4, 12, 16), (-20, 2, 10, 12)]:
        d.rectangle([cx + bx, cy + by, cx + bx + bw, cy + by + bh], fill=(196, 182, 150), outline=INK_SOFT)
    # dashed roads: Caldemar -> Thornwood -> hills
    def dashed(p0, p1):
        n = 22
        for k in range(0, n, 2):
            a = (p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n)
            b = (p0[0] + (p1[0] - p0[0]) * (k + 1) / n, p0[1] + (p1[1] - p0[1]) * (k + 1) / n)
            d.line([a, b], fill=INK_SOFT, width=2)
    dashed((195, 195), (380, 300))
    dashed((400, 300), (545, 200))
    # a compass rose + title
    centered(d, w / 2, 20, "THE REALM OF CALDEMAR", font(20, True), INK)
    rx, ry = 592, 392
    d.ellipse([rx - 20, ry - 20, rx + 20, ry + 20], outline=INK_SOFT, width=2)
    d.polygon([(rx, ry - 16), (rx - 5, ry), (rx + 5, ry)], fill=INK)
    d.polygon([(rx, ry + 16), (rx - 5, ry), (rx + 5, ry)], fill=INK_SOFT)
    return im


def decree():
    w, h = 460, 600
    im, d = parchment(w, h, border=True)
    centered(d, w / 2, 40, "ROYAL PROCLAMATION", font(26, True), INK)
    d.line([(60, 82), (w - 60, 82)], fill=INK_SOFT, width=2)
    body = [
        "By the hand of King Aldric III,",
        "sovereign of Caldemar:",
        "",
        "Let it be known that the royal",
        "regalia has been taken from the",
        "keep by persons unknown.",
        "",
        "A reward of FIVE HUNDRED crowns",
        "is offered for its safe return,",
        "no questions asked of the bearer.",
        "",
        "Present yourself at the gate.",
    ]
    y = 108
    f = font(19)
    for line in body:
        centered(d, w / 2, y, line, f, INK_SOFT if line else INK)
        y += 30
    # wax seal
    sx, sy = w / 2, h - 86
    d.ellipse([sx - 38, sy - 38, sx + 38, sy + 38], fill=WAX, outline=(110, 36, 30), width=2)
    centered(d, sx, sy - 14, "A", font(30, True), (228, 200, 150))
    return im


def wanted():
    w, h = 460, 600
    im, d = parchment(w, h, border=True)
    centered(d, w / 2, 34, "WANTED", font(48, True), INK)
    centered(d, w / 2, 96, "for TREASON against the Crown", font(17), INK_SOFT)
    # silhouette portrait frame
    fx0, fy0, fx1, fy1 = 120, 140, 340, 360
    d.rectangle([fx0, fy0, fx1, fy1], fill=(198, 184, 152), outline=INK, width=3)
    hx = (fx0 + fx1) / 2
    d.ellipse([hx - 42, 175, hx + 42, 259], fill=(70, 60, 50))  # head
    d.pieslice([hx - 78, 268, hx + 78, 420], 180, 360, fill=(70, 60, 50))  # shoulders
    centered(d, w / 2, 374, "LORD MORDREK", font(26, True), INK)
    centered(d, w / 2, 410, "“The Usurper”", font(17), INK_SOFT)
    centered(d, w / 2, 452, "Reward: ONE THOUSAND crowns", font(18, True), WAX)
    centered(d, w / 2, 484, "Dead or alive. Approach with caution —", font(15), INK_SOFT)
    centered(d, w / 2, 506, "he travels with armed levies.", font(15), INK_SOFT)
    return im


def sigil():
    w, h = 420, 420
    im = Image.new("RGB", (w, h), (36, 30, 46))
    d = ImageDraw.Draw(im)
    cx, cy = w / 2, h / 2 + 6
    d.ellipse([40, 40, w - 40, h - 40], outline=GOLD, width=5)
    d.ellipse([54, 54, w - 54, h - 54], outline=(120, 92, 36), width=1)
    # a crown
    base_y = cy + 40
    d.rectangle([cx - 90, base_y, cx + 90, base_y + 26], fill=GOLD)
    pts = [(cx - 90, base_y), (cx - 60, cy - 40), (cx - 30, base_y - 6),
           (cx, cy - 64), (cx + 30, base_y - 6), (cx + 60, cy - 40), (cx + 90, base_y)]
    d.polygon(pts, fill=GOLD)
    for px, py in [(cx - 60, cy - 46), (cx, cy - 70), (cx + 60, cy - 46)]:
        d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=(180, 60, 60))
    # a crack through the crown (the "hollow" crown)
    d.line([(cx - 8, cy - 64), (cx + 6, cy - 20), (cx - 10, base_y + 26)], fill=(36, 30, 46), width=5)
    centered(d, cx, h - 92, "THE HOLLOW CROWN", font(22, True), GOLD)
    return im


def to_data_url(im, quality=80):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    raw = buf.getvalue()
    b64 = base64.b64encode(raw).decode("ascii")
    return "data:image/webp;base64," + b64, im.width, im.height, len(raw)


SPECS = [
    ("WORLDMAP", world_map()),
    ("DECREE", decree()),
    ("WANTED", wanted()),
    ("SIGIL", sigil()),
]

lines = [
    "// AUTO-GENERATED by scripts/gen-demo-images.py (T-34). Do not edit by hand.",
    "// Small stylized WebP images embedded as data URLs for the demo's world map,",
    "// handouts, and gallery (the demo DB is throwaway and has no Storage).",
    "",
    "export interface DemoImage { dataUrl: string; width: number; height: number; bytes: number }",
    "",
]
total = 0
for name, im in SPECS:
    url, w, h, b = to_data_url(im)
    total += b
    if PREVIEW_DIR:
        im.save(os.path.join(PREVIEW_DIR, f"{name.lower()}.png"))
    lines.append(f"export const DEMO_IMG_{name}: DemoImage = {{")
    lines.append(f"  width: {w}, height: {h}, bytes: {b},")
    lines.append(f"  dataUrl: '{url}',")
    lines.append("}")
    lines.append("")
    print(f"{name:10s} {w}x{h}  {b//1024}KB")

os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
with open(OUT_TS, "w") as f:
    f.write("\n".join(lines))
print(f"--- total embedded: {total//1024}KB -> {OUT_TS}")
