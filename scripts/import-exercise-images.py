from __future__ import annotations

import io
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts" / "exercise-image-import.json"
MEDIA_ROOT = (ROOT / "public" / "media" / "exercises").resolve()

config = json.loads(CONFIG.read_text(encoding="utf-8"))
images = config.get("images", [])

for item in images:
    source_url = str(item["source_url"]).strip()
    code = str(item["exercise_code"]).strip().lower()
    filename = str(item.get("filename", "image.webp")).strip()
    max_width = int(item.get("max_width", 1000))
    quality = int(item.get("quality", 84))

    target = (MEDIA_ROOT / code / filename).resolve()
    if MEDIA_ROOT not in target.parents:
        raise SystemExit(f"Target must stay inside public/media/exercises: {target}")

    request = urllib.request.Request(
        source_url,
        headers={"User-Agent": "AndreyFit-Exercise-Importer/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()

    with Image.open(io.BytesIO(raw)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        elif image.mode == "RGBA":
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background

        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)

        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=quality, method=6)
        print(f"Saved {target.relative_to(ROOT)}: {target.stat().st_size} bytes, {image.width}x{image.height}")
