"""Easing curves from the quality bar, evaluated exactly (CSS cubic-bezier semantics)."""
from __future__ import annotations

from functools import lru_cache
from typing import Callable

Ease = Callable[[float], float]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return low if value < low else high if value > high else value


def lerp(a: float, b: float, p: float) -> float:
    return a + (b - a) * p


def progress(t: float, start: float, seconds: float) -> float:
    """Where t sits in [start, start + seconds], clamped to 0..1."""
    if seconds <= 0:
        return 1.0 if t >= start else 0.0
    return clamp((t - start) / seconds)


def _bezier(a: float, b: float, u: float) -> float:
    """One axis of a cubic Bezier from (0,0) to (1,1) with control values a and b."""
    return 3 * a * (1 - u) ** 2 * u + 3 * b * (1 - u) * u ** 2 + u ** 3


def _bezier_slope(a: float, b: float, u: float) -> float:
    return 3 * a * (1 - u) ** 2 + 6 * (b - a) * (1 - u) * u + 3 * (1 - b) * u ** 2


@lru_cache(maxsize=None)
def cubic_bezier(x1: float, y1: float, x2: float, y2: float) -> Ease:
    """The CSS cubic-bezier(x1, y1, x2, y2) timing function: Newton steps, bisection fallback."""
    if not (0 <= x1 <= 1 and 0 <= x2 <= 1):
        raise ValueError("cubic-bezier x values must be within 0..1")

    def ease(x: float) -> float:
        x = clamp(x)
        if x in (0.0, 1.0):
            return x
        u = x
        for _ in range(8):
            error = _bezier(x1, x2, u) - x
            slope = _bezier_slope(x1, x2, u)
            if abs(error) < 1e-7:
                return _bezier(y1, y2, u)
            if abs(slope) < 1e-6:
                break
            u = clamp(u - error / slope)
        low, high = 0.0, 1.0
        u = x
        for _ in range(60):
            value = _bezier(x1, x2, u)
            if abs(value - x) < 1e-7:
                break
            low, high = (u, high) if value < x else (low, u)
            u = (low + high) / 2
        return _bezier(y1, y2, u)

    return ease


EASE_OUT_CUBIC = cubic_bezier(0.33, 1, 0.68, 1)
EASE_IN_OUT_CUBIC = cubic_bezier(0.65, 0, 0.35, 1)
EASE_IN_OUT_SINE = cubic_bezier(0.37, 0, 0.63, 1)


def linear(x: float) -> float:
    return clamp(x)
