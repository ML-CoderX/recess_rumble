"""Extract thin feature decals from the supplied reference pixels."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
regions = {
    "muawiz": ("Muawiz_the_Great.png", {"eyes": (747, 279, 887, 356), "mouth": (796, 351, 863, 405)}),
    "firas": ("Nigamon_Firas.png", {"eyes": (408, 258, 646, 383), "mouth": (513, 373, 629, 495), "shirt": (420, 573, 684, 733)})
}
for character, (filename, crops) in regions.items():
    target = root / "assets/models/textures" / character
    target.mkdir(parents=True, exist_ok=True)
    image = Image.open(root / "assets/reference" / filename).convert("RGBA")
    for feature, box in crops.items():
        crop = image.crop(box)
        pixels = crop.load()
        for y in range(crop.height):
            for x in range(crop.width):
                r, g, b, a = pixels[x, y]
                # Keep ink, whites and mouth reds. Remove the orange skin around features.
                skin = r > 145 and g > 65 and g < r * 0.87 and b < g * 0.91
                if skin or feature == "shirt" and (r > 125 or g > 125 or b > 145):
                    pixels[x, y] = (r, g, b, 0)
        crop.save(target / (feature + ".png"), optimize=True)
