"""Measures how well each product photo fits the card frame and writes reports/image-quality.md.

The card shows every photo in one neutral frame (4:3 on phones and tablets, 16:10 on wide
desktops) with object-fit: contain, so packaging is never stretched or cropped. A frame cannot
repair the photo itself: very wide or tall strips and low-resolution images stay small. This
report lists those so the owner can supply originals. It edits no image.

Usage: python scripts/image_quality.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = {"4:3": (4, 3), "16:10": (16, 10)}
products = json.loads((ROOT / "src/products.json").read_text(encoding="utf-8"))["products"]


def fill(width, height, frame):
    """Share of the frame's area the image covers when scaled to fit (object-fit: contain)."""
    fw, fh = frame
    scale = min(fw / width, fh / height)
    return (width * scale) * (height * scale) / (fw * fh)


rows, missing, ok = [], [], 0
for p in products:
    if not p["images"]:
        missing.append(p)
        continue
    for index, image in enumerate(p["images"], 1):
        with Image.open(ROOT / "public" / image) as img:
            w, h = img.size
        ratio = w / h
        fills = {name: fill(w, h, f) for name, f in FRAMES.items()}
        flags = []
        if ratio >= 2.2:
            flags.append("wide strip")
        if ratio <= 0.6:
            flags.append("tall strip")
        if min(w, h) < 300:
            flags.append("low resolution")
        if fills["4:3"] < 0.5:
            flags.append(f"fills only {fills['4:3']:.0%} of the phone frame")
        if flags:
            rows.append((p["id"], p["name"], index, w, h, ratio, fills, flags))
        else:
            ok += 1

lines = [
    "# Image quality report",
    "",
    "Measured by `python scripts/image_quality.py`. No image file is edited: photos are shown",
    "whole, in one neutral frame. Framing cannot repair a photo, so the images below still",
    "render small or poorly even though the cards are consistent. Please supply original,",
    "single-product photos for them (and for the products with no photo).",
    "",
    f"- Images that fit the frame well: **{ok}**",
    f"- Images flagged below: **{len(rows)}**",
    f"- Products with no photo: **{len(missing)}**",
    "",
    "A photo is flagged when it is a wide strip (ratio 2.2:1 or more), a tall strip (0.6:1 or less),",
    "below 300px on its short side, or fills less than half of the 4:3 phone frame.",
    "",
    "| Product | Photo | Size | Ratio | Frame fill 4:3 / 16:10 | Why flagged |",
    "|---|---|---|---|---|---|",
]
for pid, name, index, w, h, ratio, fills, flags in rows:
    lines.append(
        f"| {pid} {name} | {index} | {w}×{h} | {ratio:.2f} | {fills['4:3']:.0%} / {fills['16:10']:.0%} | {'; '.join(flags)} |"
    )
lines += ["", "## Products with no photo", ""]
for p in missing:
    lines.append(f"- {p['id']} {p['name']}: the card shows “Product image coming soon”.")
lines += [
    "",
    "## Not detectable by measurement",
    "",
    "Some photos are multi-panel collages or screenshots of several cards (visually confirmed for",
    "dc-001 and dc-002). A collage can have a normal aspect ratio, so it is not flagged above;",
    "it needs the owner's original single-product photo, or a faithful, documented crop.",
    "Public reuse rights for all photos are still unconfirmed (see docs/LAUNCH.md).",
    "",
]
(ROOT / "reports/image-quality.md").write_text("\n".join(lines), encoding="utf-8")
print(f"ok={ok} flagged={len(rows)} missing={len(missing)}")
