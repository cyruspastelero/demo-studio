"""The look of a cut as one JSON-able dict (schemas/template.schema.json `look`), and how a template's
look reaches the engine.

defaults() is the house look, read from spec.py once at import (before anything can change it).
effective(template_look) deep-merges a template over it. apply(look) swaps the values into spec for
this process, so every engine module (which reads `spec.NAME` at call time) draws that look;
apply(defaults()) puts the house look back. demo.json's own `brand` always wins over a template's
brand (see brand_config)."""
from __future__ import annotations

import copy

from . import spec
from .spec import Rect


def _num(value: float) -> float | int:
    """Keeps integral values as ints, so the house look round-trips to identical numbers."""
    return int(value) if float(value).is_integer() else value


def _capture() -> dict:
    return {
        "brand": {"font": "inter", "ink": spec.INK, "secondary": spec.SECONDARY,
                  "background": {"base": spec.BG_BASE, "fields": [f[0] for f in spec.BG_FIELDS]},
                  "sweep": [spec.SWEEP_FROM, spec.SWEEP_TO], "dark": spec.DARK_FIELD},
        "window": {"rect": [_num(v) for v in spec.WINDOW_REST], "radius": spec.WINDOW_RADIUS,
                   "shadow": spec.WINDOW_SHADOW},
        "zoom": {"scale": spec.ZOOM_MAX, "dur": spec.ZOOM_MOVE_SECONDS, "ease": list(spec.ZOOM_EASE)},
        "highlight": {"stroke": spec.HIGHLIGHT_STROKE, "radius": spec.HIGHLIGHT_RADIUS,
                      "pad": [spec.HIGHLIGHT_PAD_X, spec.HIGHLIGHT_PAD_Y], "delay": spec.HIGHLIGHT_DELAY,
                      "fill_alpha": spec.HIGHLIGHT_FILL_ALPHA, "halo_alpha": spec.HIGHLIGHT_HALO_ALPHA},
        "pill": {"center_y": spec.PILL_CENTER[1], "height": spec.PILL_HEIGHT, "radius": spec.PILL_RADIUS,
                 "font_size": spec.PILL_FONT_SIZE, "kinds": list(spec.PILL_KINDS)},
        "title": {"size": spec.HERO["size"], "weight": spec.TITLE_WEIGHT, "tracking": spec.HERO["tracking"],
                  "reveal": spec.TITLE_REVEAL, "accent_word": spec.ACCENT_WORD},
        "transitions": {"window_in": spec.ENTRY_SECONDS, "cut": spec.CUT_STYLE},
        "end": {"kind": spec.END_KIND, "seconds": spec.CARD_SECONDS["end"]},
        "pacing": {"shot_max": spec.SHOT_MAX},
        "audio": {"lufs": spec.AUDIO_LUFS, "true_peak": spec.AUDIO_TRUE_PEAK, "music_gap_db": spec.MUSIC_GAP_DB,
                  "outro_silence": spec.SILENT_TAIL},
    }


_HOUSE = _capture()
_HOUSE_TYPE = {"hero": dict(spec.HERO), "card": dict(spec.CARD_HEADING), "end": dict(spec.END_TITLE)}


def defaults() -> dict:
    """The house look (a fresh copy every call)."""
    return copy.deepcopy(_HOUSE)


def deep_merge(base: dict, over: dict | None) -> dict:
    """A new dict: `over` on top of `base`, recursing into dicts. Lists and scalars replace. Keys
    starting with "_" (comments) are dropped."""
    out = copy.deepcopy(base)
    for key, value in (over or {}).items():
        if key.startswith("_"):
            continue
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def effective(template_look: dict | None) -> dict:
    """The look a build draws: house defaults with the template's look on top."""
    return deep_merge(_HOUSE, template_look)


def brand_config(template_look: dict | None, demo_brand: dict | None) -> dict:
    """The brand dict load_brand() gets: the template's brand under demo.json's own brand (demo wins)."""
    return deep_merge((template_look or {}).get("brand", {}), demo_brand or {})


def _scaled(kind: str, size: float, tracking: float) -> dict:
    """Section and end titles keep their house ratio to the hero title."""
    house = _HOUSE_TYPE[kind]
    k = size / _HOUSE_TYPE["hero"]["size"]
    t = tracking / _HOUSE_TYPE["hero"]["tracking"] if _HOUSE_TYPE["hero"]["tracking"] else 1
    return {"size": _num(round(house["size"] * k, 1)), "weight": house["weight"],
            "tracking": _num(round(house["tracking"] * t, 2))}


def apply(look: dict) -> None:
    """Swaps an effective look into spec for this process (build-keynote.py, check-cut.py and
    narrate.py are one-shot scripts, one look each). Brand colours are not here: they go through
    brand_config + load_brand."""
    window, zoom, box = look["window"], look["zoom"], look["highlight"]
    pill, title, end = look["pill"], look["title"], look["end"]
    rest = Rect(*(float(v) for v in window["rect"]))
    spec.WINDOW_REST = Rect(*(_num(v) for v in rest))
    spec.WINDOW_ASPECT = rest.w / rest.h
    spec.WINDOW_RADIUS = window["radius"]
    spec.WINDOW_SHADOW = window["shadow"]
    spec.ZOOM_MAX, spec.ZOOM_MOVE_SECONDS, spec.ZOOM_EASE = zoom["scale"], zoom["dur"], tuple(zoom["ease"])
    spec.HIGHLIGHT_STROKE, spec.HIGHLIGHT_RADIUS = box["stroke"], box["radius"]
    spec.HIGHLIGHT_PAD_X, spec.HIGHLIGHT_PAD_Y = box["pad"]
    spec.HIGHLIGHT_DELAY = box["delay"]
    spec.HIGHLIGHT_FILL_ALPHA, spec.HIGHLIGHT_HALO_ALPHA = box["fill_alpha"], box["halo_alpha"]
    spec.PILL_CENTER = (spec.PILL_CENTER[0], pill["center_y"])
    spec.PILL_HEIGHT, spec.PILL_RADIUS, spec.PILL_FONT_SIZE = pill["height"], pill["radius"], pill["font_size"]
    spec.PILL_KINDS = tuple(pill["kinds"])
    spec.TITLE_FONT = title.get("font")
    spec.TITLE_WEIGHT, spec.TITLE_REVEAL, spec.ACCENT_WORD = title["weight"], title["reveal"], title["accent_word"]
    spec.HERO = {"size": title["size"], "weight": title["weight"], "tracking": title["tracking"]}
    spec.CARD_HEADING = _scaled("card", title["size"], title["tracking"])
    spec.END_TITLE = _scaled("end", title["size"], title["tracking"])
    spec.ENTRY_SECONDS = look["transitions"]["window_in"]
    spec.CUT_STYLE = look["transitions"]["cut"]
    spec.END_KIND = end["kind"]
    spec.CARD_SECONDS = {**spec.CARD_SECONDS, "end": end["seconds"]}
    spec.OUTRO_SECONDS = 5.0 if end["kind"] == "sweep-logo" else 0.0
    spec.SHOT_MAX = look["pacing"]["shot_max"]
    spec.ZOOM_EVERY = look["pacing"].get("zoom_every")
    audio = look["audio"]
    spec.AUDIO_LUFS, spec.AUDIO_TRUE_PEAK = audio["lufs"], audio["true_peak"]
    spec.MUSIC_GAP_DB, spec.SILENT_TAIL = audio["music_gap_db"], audio["outro_silence"]


def problems(look: dict) -> list[str]:
    """Checks the schema cannot express: the window inside the frame, a usable easing curve, the
    zoomed window still fitting. Empty when the look can be drawn."""
    out = []
    x, y, w, h = look["window"]["rect"]
    if w < 400 or h < 200:
        out.append(f"window.rect {look['window']['rect']}: at least 400x200 px")
    if x + w > spec.FRAME_W or y + h > spec.FRAME_H:
        out.append(f"window.rect {look['window']['rect']}: must sit inside the 1920x1080 frame")
    x1, _, x2, _ = look["zoom"]["ease"]
    if not (0 <= x1 <= 1 and 0 <= x2 <= 1):
        out.append(f"zoom.ease {look['zoom']['ease']}: x1 and x2 must be within 0..1 (CSS cubic-bezier)")
    scale = look["zoom"]["scale"]
    if w * scale > spec.FRAME_W - 2 * spec.ZOOM_EDGE or h * scale > spec.FRAME_H - 2 * spec.ZOOM_EDGE:
        out.append(f"zoom.scale {scale}: the zoomed window ({w * scale:.0f}x{h * scale:.0f}) must keep "
                   f"{spec.ZOOM_EDGE} px clear of every edge")
    pill = look["pill"]
    if pill["center_y"] + pill["height"] / 2 > spec.FRAME_H:
        out.append(f"pill.center_y {pill['center_y']}: the pill runs off the bottom of the frame")
    return out


def reset() -> None:
    """Puts the house look back (tests)."""
    apply(defaults())
