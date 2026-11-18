"""Pack transparent Blender frames into one lossless WebP sheet per character."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument("--character", required=True)
parser.add_argument("--qa-only", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
character = args.character
frames_dir = root / ".sprite-build" / character
qa = root / "assets/qa"
qa.mkdir(parents=True, exist_ok=True)
refs = root / "assets/reference" / character
legacy = root / "assets/reference" / ("Muawiz_the_Great.png" if character == "muawiz" else "Nigamon_Firas.png")
font_path = Path("C:/Windows/Fonts/arial.ttf")
font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()
small = ImageFont.truetype(str(font_path), 15) if font_path.exists() else font


def card(path, size):
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A").point(lambda a: 255 if a > 100 else 0).getbbox()
    if alpha:
        image = image.crop(alpha)
    image.thumbnail((size[0] - 24, size[1] - 24))
    surface = Image.new("RGBA", size, "#e8e0ed")
    surface.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return surface


comparison = Image.new("RGB", (1230, 790), "#231e30")
draw = ImageDraw.Draw(comparison)
draw.text((22, 16), character.upper() + " / Blender reference comparison", font=font, fill="#ffda86")
for index, view in enumerate(["front", "side", "back"]):
    x = 18 + index * 406
    ref = refs / (view + ".png")
    supplied = ref.exists()
    path = ref if supplied else legacy
    draw.text((x, 55), view.upper() + (" reference" if supplied else " / existing 3-quarter reference"), font=small, fill="white")
    comparison.paste(card(path, (390, 300)), (x, 84))
    draw.text((x, 399), "Blender " + view, font=small, fill="white")
    comparison.paste(card(frames_dir / (view + ".png"), (390, 320)), (x, 426))
draw.text((20, 760), "Side/back references missing: reconstructed views require reference review.", font=small, fill="#ffda86")
comparison.save(qa / (character + "_compare.png"), optimize=True)
if args.qa_only:
    raise SystemExit(0)

data = json.loads((frames_dir / "frames.json").read_text())
atlas = {"version": 1, "frameSize": 256, "directions": 8, "anchor": data["anchor"], "drawSize": 145,
         "animations": {}, "images": []}
destination = root / "assets/sprites"
portrait = Image.open(frames_dir / "front.png").convert("RGBA")
bounds = portrait.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox()
if bounds:
    portrait = portrait.crop(bounds)
    scale = min(224 / portrait.width, 232 / portrait.height)
    portrait = portrait.resize((round(portrait.width * scale), round(portrait.height * scale)), Image.Resampling.LANCZOS)
    preview = Image.new("RGBA", (256, 256))
    preview.alpha_composite(portrait, ((256 - portrait.width) // 2, 244 - portrait.height))
    preview.save(destination / (character + "-portrait.webp"), quality=92, method=6)
total = 0
for page, animation in enumerate(data["animations"]):
    state = animation["name"]
    entries = [entry for entry in data["frames"] if entry["state"] == state]
    columns = 8
    rows = math.ceil(len(entries) / columns)
    sheet = Image.new("RGBA", (columns * 256, rows * 256))
    atlas["animations"][state] = {"fps": animation["fps"], "loop": animation["loop"], "directions": [[] for _ in range(8)]}
    for slot, entry in enumerate(entries):
        x, y = slot % columns * 256, slot // columns * 256
        sheet.paste(Image.open(frames_dir / entry["file"]).convert("RGBA"), (x, y))
        atlas["animations"][state]["directions"][entry["direction"]].append(
            [x, y, 256, 256, page, *entry["anchor"], entry["scale"]])
    filename = character + "-3d-" + state + ".webp"
    sheet.save(destination / filename, quality=88, method=6, alpha_quality=100)
    atlas["images"].append("/assets/sprites/" + filename)
    total += (destination / filename).stat().st_size
(destination / (character + "-3d.json")).write_text(json.dumps(atlas, separators=(",", ":")), encoding="utf8")
print(character, "packed", len(data["frames"]), "frames;", total, "bytes")
