"""Chrome renders the graphics: background keyframes, the window card and mask, and every unique
overlay frame. Each PNG is named by a hash of what it shows, so a rebuild only renders what changed.
The per-frame sequences ffmpeg reads are hard links to those PNGs (no copies, no symlinks)."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import demolib as lib

from . import spec
from .brand import Brand
from .window import CANVAS_H, CANVAS_W

SCRIPTS = Path(__file__).resolve().parent.parent
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
               ".svg": "image/svg+xml"}
ROLE_GREY = "#7A8089"  # C3: role text in a person pill


class RenderError(RuntimeError):
    pass


def image_uri(demo_dir: Path, value: str, field: str) -> str:
    """A data: URI for an image named in demo.json; the path must stay inside the demo folder."""
    path = lib.safe_join(demo_dir, value, field)
    mime = IMAGE_TYPES.get(path.suffix.lower())
    if not mime:
        raise lib.UnsafePath(f"{field}: {value} must be a {', '.join(IMAGE_TYPES)} image")
    if not path.is_file():
        raise lib.UnsafePath(f"{field}: image not found: {value}")
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def card_styles(has_logo: bool) -> dict:
    """Type sizes (T2, T5, T6) and vertical positions per card kind, for the page."""
    title_y = 560 if has_logo else 500
    return {
        "hero": {**_type(spec.HERO, spec.SUBTITLE), "titleY": 540, "subY": 578},
        "section": {**_type(spec.HERO, spec.SUBTITLE), "titleY": 540, "subY": 660},
        "end": {**_type(spec.END_TITLE, spec.TAGLINE), "titleY": title_y, "subY": title_y + 100},
    }


def _type(title: dict, sub: dict) -> dict:
    return {"size": title["size"], "tracking": title["tracking"], "subSize": sub["size"], "subTracking": sub["tracking"]}


def state_key(state: dict, salt: str) -> str:
    return hashlib.sha1((salt + json.dumps(state, sort_keys=True, separators=(",", ":"))).encode()).hexdigest()[:20]


def window_statics() -> list[dict]:
    rest = spec.WINDOW_REST
    # The card carries only the shadow: an outer box-shadow is not painted under its own box, and the
    # footage fills the box, so a transparent fill leaves no light fringe at the rounded corners.
    card = {"window": {"x": spec.CANVAS_PAD_SIDE, "y": spec.CANVAS_PAD_TOP, "w": rest.w, "h": rest.h,
                       "radius": spec.WINDOW_RADIUS, "fill": "transparent", "shadow": spec.WINDOW_SHADOW}}
    mask = {"window": {"x": 0, "y": 0, "w": rest.w, "h": rest.h, "radius": spec.WINDOW_RADIUS, "fill": "#FFFFFF"}}
    return [{"name": "window-card.png", "state": card, "size": [CANVAS_W, CANVAS_H]},
            {"name": "window-mask.png", "state": mask, "size": [int(rest.w), int(rest.h)]}]


class Renderer:
    """Collects unique states, renders the missing ones in one Chrome session, links sequences."""

    def __init__(self, work: Path, brand: Brand, images: dict[str, str], has_logo: bool):
        self.work = work
        self.cache = work / "png"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.brand = brand
        self.images = images
        self.styles = card_styles(has_logo)
        # The cache key covers everything a PNG depends on: brand, images, layout and the renderer's
        # own code, so an engine update never reuses a picture drawn by an older page.
        code = "".join((SCRIPTS / name).read_text() for name in ("keynote-page.mjs", "keynote-render.mjs"))
        fonts = "".join(sorted(f"{f.name}:{f.stat().st_size}"
                               for f in (SCRIPTS.parent / "assets" / "fonts").glob("*.woff2")))
        salt = json.dumps([brand.__dict__, sorted(images.items()), self.styles, code, fonts],
                          sort_keys=True, default=str)
        self.salt = hashlib.sha1(salt.encode()).hexdigest()
        self.pending: dict[str, dict] = {}

    def add(self, state: dict, size: tuple[int, int] = (spec.FRAME_W, spec.FRAME_H)) -> str:
        key = state_key({"s": state, "z": list(size)}, self.salt)
        if not (self.cache / f"{key}.png").exists():
            self.pending[key] = {"path": f"png/{key}.png", "state": state, "size": list(size)}
        return key

    def job(self, kind: str, font_probe: dict | None) -> dict:
        b = self.brand
        font = spec.FONTS[b.font]
        groups = {"backgrounds": [], "static": [], "frames": []}
        for entry in self.pending.values():
            target = "backgrounds" if "background" in entry["state"] else (
                "static" if "window" in entry["state"] else "frames")
            groups[target].append(entry)
        return {"out_dir": str(self.work), "kind": kind,
                "font": {"text": font["text"], "display": {str(k): v for k, v in font["display"].items()}},
                "colors": {"ink": b.ink, "secondary": b.secondary, "accent": b.accent, "role": ROLE_GREY,
                           "pill": b.pill_text, "highlight": b.highlight,
                           "dark": b.dark, "sweep": list(b.sweep), "skew": spec.SWEEP_SKEW},
                "images": self.images, "styles": self.styles, "font_probe": font_probe, **groups}

    def run(self, font_probe: dict | None) -> list[str]:
        """Renders what is pending; returns the font families Chrome painted (when probed)."""
        if not self.pending and not font_probe:
            return []
        job_path = self.work / "render-job.json"
        job_path.write_text(json.dumps(self.job("keynote", font_probe)))
        print(f"render: {len(self.pending)} new image(s) with headless Chrome", flush=True)
        proc = subprocess.Popen(["node", str(SCRIPTS / "keynote-render.mjs"), str(job_path)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        fonts: list[str] = []
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("PROGRESS"):
                print(line, flush=True)
            elif line.startswith("FONTS "):
                fonts = json.loads(line[6:])
        stderr = proc.stderr.read()
        if proc.wait():
            raise RenderError(f"keynote-render.mjs failed:\n{stderr[-1500:]}\nCheck Chrome with: bash "
                              f"{SCRIPTS / 'doctor.sh'}")
        job_path.unlink(missing_ok=True)
        self.pending = {}
        return fonts

    def png(self, key: str) -> Path:
        return self.cache / f"{key}.png"

    def link_sequence(self, folder: str, keys: list[str], pattern: str) -> Path:
        """folder/pattern % i -> hard link to the cached PNG of keys[i]. Returns the folder."""
        target = self.work / folder
        if target.exists():
            lib.safe_rmtree(self.work, target, f".keynote/{folder}")
        target.mkdir()
        for i, key in enumerate(keys):
            os.link(self.png(key), target / (pattern % i))
        return target

    def prune(self, keep: set[str]) -> None:
        """Deletes cached PNGs no longer used, so the cache does not grow without end."""
        for path in self.cache.glob("*.png"):
            if path.stem not in keep and not path.is_symlink():
                path.unlink()


def check_fonts(painted: list[str], brand: Brand) -> None:
    family = spec.FONTS[brand.font]["family"]
    if painted and not all(family in name for name in painted):
        sys.exit(f"build-keynote: Chrome painted {painted}, not the bundled {family}. Check assets/fonts/ "
                 "is complete (git checkout assets/fonts) and run again.")
    if painted:
        print(f"fonts: painted {', '.join(painted)} (bundled {family})", flush=True)
