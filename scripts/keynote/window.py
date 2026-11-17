"""The product window per frame: rise-in (W6) and whole-window zooms (Z1 to Z4).

Python owns this math. compose.py turns the per-frame integers into ffmpeg expressions, and
overlay.py maps highlight boxes through the very same numbers, so a box stays glued to the UI.
"""
from __future__ import annotations

import math
from typing import NamedTuple

from . import spec
from .easing import EASE_OUT_CUBIC, cubic_bezier, progress
from .model import Run, Zoom
from .spec import Rect



class WindowFrame(NamedTuple):
    """Integer window and window-layer (canvas) geometry for one frame."""
    x: int
    y: int
    w: int
    h: int
    canvas_x: int
    canvas_y: int
    canvas_w: int
    canvas_h: int


def canvas_size() -> tuple[int, int]:
    """The window layer: the rest window plus transparent margins for its shadow."""
    return (int(spec.WINDOW_REST.w + 2 * spec.CANVAS_PAD_SIDE),
            int(spec.WINDOW_REST.h + spec.CANVAS_PAD_TOP + spec.CANVAS_PAD_BOTTOM))


def zoom_ease(x: float) -> float:
    """Z4: ease-in-out sine by default; a look template may give its own cubic-bezier."""
    return cubic_bezier(*spec.ZOOM_EASE)(x)


def zoom_center(zoom: Zoom) -> tuple[float, float]:
    """Where the window centre sits at full zoom: toward the focus by (scale - 1) of the distance,
    at most ZOOM_PAN_MAX px (Z3), then clamped so the window keeps ZOOM_EDGE px clear (Z3)."""
    cx, cy = spec.WINDOW_REST.center
    dx, dy = (zoom.focus[0] - cx) * (zoom.scale - 1), (zoom.focus[1] - cy) * (zoom.scale - 1)
    length = math.hypot(dx, dy)
    if length > spec.ZOOM_PAN_MAX:
        dx, dy = dx * spec.ZOOM_PAN_MAX / length, dy * spec.ZOOM_PAN_MAX / length
    w, h = spec.WINDOW_REST.w * zoom.scale, spec.WINDOW_REST.h * zoom.scale
    x = min(max(cx + dx, spec.ZOOM_EDGE + w / 2), spec.FRAME_W - spec.ZOOM_EDGE - w / 2)
    y = min(max(cy + dy, spec.ZOOM_EDGE + h / 2), spec.FRAME_H - spec.ZOOM_EDGE - h / 2)
    return x, y


def zoom_progress(zoom: Zoom, t: float) -> float:
    """0 at rest, 1 at full zoom; eases in, holds, eases out (Z4, Z5)."""
    if t < zoom.at or t >= zoom.end:
        return 0.0
    if t < zoom.landed:
        return zoom_ease(progress(t, zoom.at, spec.ZOOM_MOVE_SECONDS))
    if t < zoom.out_start:
        return 1.0
    return 1.0 - zoom_ease(progress(t, zoom.out_start, spec.ZOOM_MOVE_SECONDS))


def rise_offset(t: float) -> float:
    """Px the window sits below its rest position while rising in (W6)."""
    travel = spec.ENTRY_FROM_TOP - spec.WINDOW_REST.y
    return travel * (1.0 - EASE_OUT_CUBIC(progress(t, 0.0, spec.ENTRY_SECONDS)))


def window_rect(run: Run, t: float) -> Rect:
    """The window in frame px at run time t (seconds since the run started)."""
    rest = spec.WINDOW_REST.center
    scale, (cx, cy) = 1.0, rest
    for zoom in run.zooms:
        p = zoom_progress(zoom, t)
        if p > 0:
            tx, ty = zoom_center(zoom)
            scale = 1 + (zoom.scale - 1) * p
            cx, cy = rest[0] + (tx - rest[0]) * p, rest[1] + (ty - rest[1]) * p
            break
    w, h = spec.WINDOW_REST.w * scale, spec.WINDOW_REST.h * scale
    return Rect(cx - w / 2, cy - h / 2 + rise_offset(t), w, h)


def quantize(rect: Rect) -> WindowFrame:
    w = round(rect.w)
    h = round(rect.h)
    x, y = round(rect.x), round(rect.y)
    k = w / spec.WINDOW_REST.w
    canvas_w, canvas_h = canvas_size()
    return WindowFrame(x, y, w, h, x - round(spec.CANVAS_PAD_SIDE * k), y - round(spec.CANVAS_PAD_TOP * k),
                       round(canvas_w * k), round(canvas_h * k))


def run_frames(run: Run) -> list[WindowFrame]:
    """One WindowFrame per frame of the run."""
    return [quantize(window_rect(run, n / spec.FPS)) for n in range(run.frames)]


def map_rect(rect: Rect, crop: Rect, frame: WindowFrame) -> Rect:
    """A source px rect -> frame px, through this frame's window."""
    k = frame.w / crop.w
    return Rect(frame.x + (rect.x - crop.x) * k, frame.y + (rect.y - crop.y) * k, rect.w * k, rect.h * k)
