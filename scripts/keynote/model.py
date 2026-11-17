"""demo.json -> a frozen Plan: items on a frame-exact timeline, window runs, shots with their crop,
zooms, highlights and callouts. Pure apart from the probe callback; build-keynote.py does the I/O.

Old demo.json files still work: `zoom: [factor, cx, cy, start, seconds]` becomes one zoom target,
`caption` becomes a statement callout, and a scene without `crop` shows the full width.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Union

from . import spec
from .spec import Rect


class PlanError(ValueError):
    """A demo.json problem: names the field and says what to do."""


@dataclass(frozen=True)
class Zoom:
    at: float                      # run seconds when the zoom-in starts
    scale: float
    focus: tuple[float, float]     # frame px at rest
    hold: float

    @property
    def landed(self) -> float:
        return self.at + spec.ZOOM_MOVE_SECONDS

    @property
    def out_start(self) -> float:
        return self.landed + self.hold

    @property
    def end(self) -> float:
        return self.out_start + spec.ZOOM_MOVE_SECONDS


@dataclass(frozen=True)
class Highlight:
    start: float                   # cut seconds
    end: float                     # cut seconds when the fade-out starts
    rect: Rect                     # source px
    shot: int                      # index into Plan.shots (whose crop maps the rect)
    where: str = ""                # demo.json path, e.g. sequence[3].highlights[0], for messages


@dataclass(frozen=True)
class Callout:
    start: float                   # cut seconds
    end: float                     # cut seconds when the exit starts
    kind: str                      # person | statement
    text: str
    role: str = ""
    avatar: str = ""               # image id in the render job, "" for none


@dataclass(frozen=True)
class Shot:
    index: int                     # position in demo.json sequence
    key: str
    source: Path
    trim_in: float
    trim_out: float
    speed: float
    start: int                     # first frame in the cut
    frames: int
    crop: Rect                     # source px, aspect 1.95
    source_size: tuple[int, int]

    @property
    def scale(self) -> float:
        """Window px per source px at rest."""
        return spec.WINDOW_REST.w / self.crop.w


@dataclass(frozen=True)
class Card:
    index: int
    key: str
    kind: str                      # hero | section | end
    title: str
    subtitle: str
    accent: str
    subtitle_accent: str
    logo: bool
    start: int
    frames: int                    # on screen, without the outro
    outro_frames: int              # end card only
    voiceover: str


@dataclass(frozen=True)
class Run:
    """Consecutive scenes: one window that rises in once and stays put while clips cut inside it."""
    shots: tuple[int, ...]         # indexes into Plan.shots
    start: int
    frames: int
    zooms: tuple[Zoom, ...]        # times relative to the run start
    fade_out: bool                 # a card follows (W8)

    @property
    def end(self) -> int:
        return self.start + self.frames


@dataclass(frozen=True)
class Plan:
    items: tuple[Union[Shot, Card], ...]
    shots: tuple[Shot, ...]
    cards: tuple[Card, ...]
    runs: tuple[Run, ...]
    callouts: tuple[Callout, ...]
    highlights: tuple[Highlight, ...]
    total_frames: int
    outro_frames: int
    warnings: tuple[str, ...] = field(default=())

    @property
    def seconds(self) -> float:
        return self.total_frames / spec.FPS


def frames_for(seconds: float) -> int:
    return max(1, round(seconds * spec.FPS))


def item_key(item: dict) -> str:
    return f"card-{item['card']}" if "card" in item else item["scene"]


def fit_crop(crop: Rect, size: tuple[int, int]) -> Rect:
    """Grows the crop to the window's 1.95:1 aspect around its centre and keeps it inside the source."""
    sw, sh = size
    w, h = crop.w, crop.h
    if w / h > spec.WINDOW_ASPECT:
        h = w / spec.WINDOW_ASPECT
    else:
        w = h * spec.WINDOW_ASPECT
    if w > sw:
        w, h = sw, sw / spec.WINDOW_ASPECT
    if h > sh:
        w, h = sh * spec.WINDOW_ASPECT, sh
    cx, cy = crop.center
    x = min(max(cx - w / 2, 0), sw - w)
    y = min(max(cy - h / 2, 0), sh - h)
    return Rect(round(x, 2), round(y, 2), round(w, 2), round(h, 2))


def source_to_rest(point: tuple[float, float], shot: Shot) -> tuple[float, float]:
    """A source px point -> frame px with the window at rest."""
    k = shot.scale
    return (spec.WINDOW_REST.x + (point[0] - shot.crop.x) * k, spec.WINDOW_REST.y + (point[1] - shot.crop.y) * k)


def card_kind(item: dict, is_last: bool) -> str:
    """kind wins; else the last item of a sequence is the end card, a card with a subtitle is a hero."""
    if item.get("kind"):
        return item["kind"]
    if is_last:
        return "end"
    return "hero" if item.get("subtitle") else "section"


def _shot_from(item: dict, index: int, start: int, raw_dir: Path,
               probe: Callable[[Path], tuple[float, tuple[int, int]]], warn: list[str]) -> Shot:
    where = f"sequence[{index}] (scene {item['scene']})"
    source = raw_dir / f"{item['stem']}-t{item.get('take', 1)}.mp4"
    if not source.exists():
        raise PlanError(f"{where}: raw take {source} is missing. Record or encode it first "
                        f"(skill demo-record), or fix `stem`/`take`.")
    length, size = probe(source)
    trim_in, trim_out = (item.get("trim") or [None, None])
    trim_in = float(trim_in or 0)
    trim_out = float(length if trim_out is None else trim_out)
    if not 0 <= trim_in < trim_out <= length + 0.05:
        raise PlanError(f"{where}.trim: [{trim_in}, {trim_out}] is outside the take (0 to {length:.2f}s)")
    speed = float(item.get("speed", 1))
    frames = frames_for((trim_out - trim_in) / speed)
    if "crop" in item:
        x, y, w, h = item["crop"]
        if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > size[0] + 0.5 or y + h > size[1] + 0.5:
            raise PlanError(f"{where}.crop: {item['crop']} must sit inside the {size[0]}x{size[1]} take "
                            "([x, y, w, h] in source px)")
        crop = fit_crop(Rect(x, y, w, h), size)
        if abs(crop.w - w) / w > 0.02 or abs(crop.h - h) / h > 0.02:
            warn.append(f"{where}.crop: widened to {list(crop)} to match the window's 1.95:1 shape")
    else:
        crop = fit_crop(Rect(0, 0, size[0], size[0] / spec.WINDOW_ASPECT), size)
        warn.append(f"{where}: no `crop`, so the window shows the full width; app text may read under "
                    f"{spec.MIN_CAP_HEIGHT} px. Add crop: [x, y, w, h] around the UI that matters (W2)")
    seconds = frames / spec.FPS
    if seconds > 8.0 and not item.get("zooms") and not item.get("zoom"):
        warn.append(f"{where}: {seconds:.1f}s in one uninterrupted shot (bar P2: 8 s at most); split it "
                    "or add a zoom")
    return Shot(index, item["scene"], source, trim_in, trim_out, speed, start, frames, crop, size)


def _card_from(item: dict, index: int, start: int, is_last: bool, warn: list[str]) -> Card:
    kind = card_kind(item, is_last)
    seconds = float(item.get("duration", spec.CARD_SECONDS[kind]))
    outro = float(item.get("outro", spec.OUTRO_SECONDS)) if kind == "end" else 0.0
    where = f"sequence[{index}] (card {item['card']})"
    for name, text, accent in (("accent", item["title"], item.get("accent", "")),
                               ("subtitle_accent", item.get("subtitle", ""), item.get("subtitle_accent", ""))):
        if accent and accent_index(text, accent) < 0:
            raise PlanError(f"{where}.{name}: {accent!r} is not a word of {text!r}; use one word of it exactly")
    if not item.get("accent"):
        warn.append(f"{where}: no `accent` word; the bar wants exactly one key word in the accent colour (T9)")
    return Card(index, item_key(item), kind, item["title"], item.get("subtitle", ""), item.get("accent", ""),
                item.get("subtitle_accent", ""), bool(item.get("logo", kind == "end")), start,
                frames_for(seconds), frames_for(outro) if outro > 0 else 0, item.get("voiceover", ""))


def accent_index(text: str, accent: str) -> int:
    """Index of the accent word among text.split(), ignoring case and edge punctuation; -1 if absent."""
    wanted = accent.strip().strip(".,!?;:").lower()
    for i, word in enumerate(text.split()):
        if word.strip(".,!?;:\"'").lower() == wanted:
            return i
    return -1
