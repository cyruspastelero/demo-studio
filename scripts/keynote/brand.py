"""Brand settings (demo.json `brand`) with the quality-bar defaults, and the drifting background."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

from . import spec
from .model import PlanError

HEX = re.compile(r"^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")


@dataclass(frozen=True)
class Brand:
    font: str
    ink: str
    secondary: str
    accent: str
    base: str
    fields: tuple[str, ...]
    sweep: tuple[str, str]
    dark: str
    highlight: str = spec.HIGHLIGHT_NEUTRAL   # H1 stroke: the product's accent, or neutral ink
    pill_text: str = spec.PILL_TEXT_NEUTRAL   # C4 statement text: the accent, darkened to read on white


def rgb(value: str) -> tuple[int, int, int]:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


def luminance(value: str) -> float:
    """WCAG relative luminance of #RRGGBB (alpha ignored)."""
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_on_white(value: str) -> float:
    return 1.05 / (luminance(value) + 0.05)


def readable_on_white(value: str, minimum: float = spec.PILL_TEXT_MIN_CONTRAST) -> str:
    """The colour itself when it reads on white at `minimum` contrast, else the same hue darkened
    in small steps until it does."""
    r, g, b = rgb(value)
    for step in range(0, 101):
        k = 1 - step / 100
        candidate = f"#{round(r * k):02X}{round(g * k):02X}{round(b * k):02X}"
        if contrast_on_white(candidate) >= minimum:
            return candidate
    return "#000000"


def colour(value: object, field: str) -> str:
    if not isinstance(value, str) or not HEX.match(value):
        raise PlanError(f"brand.{field}: {value!r} is not a colour; use #RRGGBB or #RRGGBBAA")
    return value.upper()


def load_brand(raw: dict | None) -> Brand:
    raw = raw or {}
    font = raw.get("font", "inter")
    if font not in spec.FONTS:
        raise PlanError(f"brand.font: {font!r} is not bundled; use one of {sorted(spec.FONTS)}")
    background = raw.get("background", {})
    fields = background.get("fields", [f[0] for f in spec.BG_FIELDS])
    if len(fields) != len(spec.BG_FIELDS):
        raise PlanError(f"brand.background.fields: give exactly {len(spec.BG_FIELDS)} colours "
                        "(warm glow top left, blue top right, pink bottom right, grey bottom left, centre)")
    sweep = raw.get("sweep", [spec.SWEEP_FROM, spec.SWEEP_TO])
    if len(sweep) != 2:
        raise PlanError("brand.sweep: give two colours, [from, to]")
    accent = colour(raw.get("accent", spec.ACCENT), "accent")
    product = accent[:7] if "accent" in raw else None  # the product's own colour, when the demo names it
    return Brand(font=font, ink=colour(raw.get("ink", spec.INK), "ink"),
                 secondary=colour(raw.get("secondary", spec.SECONDARY), "secondary"),
                 accent=accent,
                 highlight=product or spec.HIGHLIGHT_NEUTRAL,
                 pill_text=readable_on_white(product) if product else spec.PILL_TEXT_NEUTRAL,
                 base=colour(background.get("base", spec.BG_BASE), "background.base"),
                 fields=tuple(colour(c, f"background.fields[{i}]") for i, c in enumerate(fields)),
                 sweep=(colour(sweep[0], "sweep[0]"), colour(sweep[1], "sweep[1]")),
                 dark=colour(raw.get("dark", spec.DARK_FIELD), "dark"))


def background_fields(brand: Brand, t: float) -> list[list]:
    """The five radial fields at time t: [colour, radius, x px, y px] each (B2, B4)."""
    out = []
    for (_, radius, x_pct, y_pct), color, (amp, omega, phase) in zip(spec.BG_FIELDS, brand.fields, spec.BG_DRIFT):
        x = spec.FRAME_W * (x_pct / 100 + amp * math.sin(omega * t + phase))
        y = spec.FRAME_H * (y_pct / 100 + amp * math.cos(omega * 0.8 * t + phase))
        out.append([color, radius, round(x, 1), round(y, 1)])
    return out


def background_keyframes(brand: Brand, seconds: float) -> list[dict]:
    """One background state per BG_KEYFRAME_SECONDS, covering the cut plus one spare."""
    count = math.ceil(seconds / spec.BG_KEYFRAME_SECONDS) + 2
    return [{"base": brand.base, "fields": background_fields(brand, i * spec.BG_KEYFRAME_SECONDS)}
            for i in range(count)]
