"""What the overlay layer shows on each frame: title cards (T10 to T12, O1, O2, O5), callout pills
(C1 to C8), highlight boxes (H1 to H7), the end card and the outro (X1 to X3).

Each frame is a small JSON-able dict. Python computes every animated value here; the Chrome page
(keynote-render.mjs) only lays the words out and applies these numbers. Identical states are
rendered once."""
from __future__ import annotations

from typing import Sequence

from . import spec
from .easing import EASE_IN_OUT_CUBIC, EASE_OUT_CUBIC, linear, progress
from .model import Callout, Card, Highlight, Plan, Shot, accent_index
from .spec import Rect
from .window import WindowFrame, map_rect

Word = list  # [text, colour role, opacity, blur px, shift px]


def r(value: float, digits: int = 3) -> float:
    rounded = round(value, digits)
    return 0.0 if rounded == 0 else rounded


def word_state(text: str, role: str, t: float, start: float, seconds: float, blur: float, shift: float,
               ease=EASE_OUT_CUBIC) -> Word:
    """One word revealing: opacity 0 -> 1, blur -> 0, shifted right -> 0 (T10, C6)."""
    p = ease(progress(t, start, seconds))
    return [text, role, r(p), r(blur * (1 - p), 2), r(shift * (1 - p), 1)]


def words_of(text: str, accent: str, base_role: str) -> list[tuple[str, str]]:
    marked = accent_index(text, accent) if accent else -1
    return [(w, "accent" if i == marked else base_role) for i, w in enumerate(text.split())]


def reveal(text: str, accent: str, role: str, t: float, starts: Sequence[float]) -> list[Word]:
    return [word_state(w, colour, t, start, spec.WORD_SECONDS, spec.WORD_BLUR, spec.WORD_SHIFT)
            for (w, colour), start in zip(words_of(text, accent, role), starts)]


def stagger(count: int, first: float, step: float) -> list[float]:
    return [first + i * step for i in range(count)]


def title_land(count: int) -> float:
    return (count - 1) * spec.TITLE_STAGGER + spec.WORD_SECONDS


def settle_start(card: Card) -> float:
    return max(spec.SETTLE_EARLIEST, title_land(len(card.title.split())) + 0.1)


def card_exit(card: Card, next_is_shot: bool) -> tuple[float, float]:
    """(card-local start, seconds) of the card's exit. Before a window it runs with the rise (W6)."""
    seconds = card.frames / spec.FPS
    if next_is_shot:
        return seconds, spec.ENTRY_SECONDS
    return max(0.0, seconds - spec.CARD_EXIT), spec.CARD_EXIT


def title_card_state(card: Card, t: float, exit_at: float, exit_seconds: float) -> dict:
    """Hero (title, settle, subtitle) or section card (title only), card-local time t."""
    count = len(card.title.split())
    title = reveal(card.title, card.accent, "ink", t, stagger(count, 0.0, spec.TITLE_STAGGER))
    state = {"kind": card.kind, "title": {"words": title, "scale": 1.0, "ty": 0.0}}
    if card.subtitle:
        if card.kind == "hero":
            begin = settle_start(card)
            p = EASE_IN_OUT_CUBIC(progress(t, begin, spec.SETTLE_SECONDS))
            state["title"] = {"words": title, "scale": r(1 - (1 - spec.HERO_SETTLE_SCALE) * p),
                              "ty": r(-spec.HERO_SETTLE_RISE * p, 2)}
            first = begin + spec.SUBTITLE_AFTER_SETTLE
        else:
            first = title_land(count)
        sub_count = len(card.subtitle.split())
        state["sub"] = {"words": reveal(card.subtitle, card.subtitle_accent, "secondary", t,
                                        stagger(sub_count, first, spec.SUBTITLE_STAGGER))}
    q = EASE_IN_OUT_CUBIC(progress(t, exit_at, exit_seconds))
    state["block"] = [r(1 - q), r(-spec.CARD_EXIT_RISE * q, 2), r(spec.CARD_EXIT_BLUR * q, 2)]
    return state


def default_end_times(card: Card) -> tuple[list[float], list[float]]:
    title = stagger(len(card.title.split()), 0.35, spec.TITLE_STAGGER)
    first = (title[-1] if title else 0.35) + spec.WORD_SECONDS + 0.3
    return title, stagger(len(card.subtitle.split()), first, spec.SUBTITLE_STAGGER)


def end_card_state(card: Card, t: float, times: tuple[list[float], list[float]], has_logo: bool) -> dict:
    """End card (X1): logo, then title and tagline words revealed at the given card-local times."""
    title_times, tag_times = times
    p = EASE_OUT_CUBIC(progress(t, 0.0, 0.6))
    state = {"kind": "end", "block": [1.0, 0.0, 0.0],
             "title": {"words": reveal(card.title, card.accent, "ink", t, title_times), "scale": 1.0, "ty": 0.0}}
    if has_logo:
        state["logo"] = [r(p), r(0.9 + 0.1 * p), r(10 * (1 - p), 2)]
    if card.subtitle:
        state["sub"] = {"words": reveal(card.subtitle, card.subtitle_accent, "secondary", t, tag_times)}
    return state


def outro_state(title: str, t: float, has_logo: bool) -> dict:
    """Brand sweep over the end card into a dark field (X2), then the logo lockup (X3)."""
    sweep = EASE_IN_OUT_CUBIC(progress(t, 0.0, spec.SWEEP_SECONDS))
    lock = EASE_OUT_CUBIC(progress(t, spec.SWEEP_SECONDS, spec.LOCKUP_SECONDS))
    words = [word_state(w, "white", t, spec.SWEEP_SECONDS + 0.15 + i * 0.08, spec.WORD_SECONDS, 12, 18)
             for i, w in enumerate(title.split())]
    state = {"sweep": r(sweep), "words": words}
    if has_logo:
        state["mark"] = [r(lock), r(1.25 - 0.25 * lock), r(-40 * (1 - lock), 1)]
    return state


def pill_state(callout: Callout, t: float) -> dict | None:
    """C6 entry, per-word blur reveal, C7 exit."""
    if t < callout.start or t >= callout.end + spec.PILL_EXIT:
        return None
    e = EASE_OUT_CUBIC(progress(t, callout.start, spec.PILL_ENTRY))
    x = EASE_IN_OUT_CUBIC(progress(t, callout.end, spec.PILL_EXIT))
    if callout.kind == "person":
        name = callout.text if callout.text.endswith(",") else callout.text + ","
        parts = [(w, "ink") for w in name.split()] + [(w, "role") for w in callout.role.split()]
    else:
        parts = [(w, "pill") for w in callout.text.split()]  # C4: brand-derived, readable on white
    words = [word_state(w, role, t, callout.start + i * spec.PILL_WORD_STAGGER, spec.PILL_WORD_SECONDS,
                        spec.PILL_WORD_BLUR, spec.PILL_WORD_SHIFT) for i, (w, role) in enumerate(parts)]
    return {"variant": callout.kind, "avatar": callout.avatar if callout.kind == "person" else "",
            "opacity": r(e * (1 - x)), "ty": r(spec.PILL_ENTRY_RISE * (1 - e) + spec.PILL_EXIT_DROP * x, 2),
            "scale": r(spec.PILL_ENTRY_SCALE + (1 - spec.PILL_ENTRY_SCALE) * e), "blur": r(spec.PILL_EXIT_BLUR * x, 2),
            "words": words}


def box_geometry(rect: Rect, crop: Rect, frame: WindowFrame) -> Rect:
    """The highlight outline around a source rect, after the window transform, padded (H4)."""
    inner = map_rect(rect, crop, frame)
    return Rect(inner.x - spec.HIGHLIGHT_PAD_X, inner.y - spec.HIGHLIGHT_PAD_Y,
                inner.w + 2 * spec.HIGHLIGHT_PAD_X, inner.h + 2 * spec.HIGHLIGHT_PAD_Y)


def box_state(h: Highlight, shot: Shot, t: float, frame: WindowFrame | None) -> list | None:
    if frame is None or t < h.start or t >= h.end + spec.HIGHLIGHT_OUT:
        return None
    p = EASE_OUT_CUBIC(progress(t, h.start, spec.HIGHLIGHT_IN))
    fade = 1 - linear(progress(t, h.end, spec.HIGHLIGHT_OUT))
    box = box_geometry(h.rect, shot.crop, frame)
    return [r(box.x, 1), r(box.y, 1), r(box.w, 1), r(box.h, 1), r(p * fade),
            r(spec.HIGHLIGHT_IN_SCALE - (spec.HIGHLIGHT_IN_SCALE - 1) * p)]


class OverlayTimeline:
    """Frame -> overlay state for a whole Plan."""

    def __init__(self, plan: Plan, windows: dict[int, WindowFrame], brand_name: str,
                 end_times: tuple[list[float], list[float]] | None = None, has_logo: bool = False):
        self.plan = plan
        self.brand_name = brand_name
        self.windows = windows
        self.has_logo = has_logo
        self.end_times = end_times
        items = list(plan.items)
        self.card_spans = []
        for n, item in enumerate(items):
            if isinstance(item, Card):
                next_is_shot = n + 1 < len(items) and isinstance(items[n + 1], Shot)
                exit_at, exit_seconds = card_exit(item, next_is_shot)
                end = item.start + item.frames + item.outro_frames
                if next_is_shot:
                    end += round(exit_seconds * spec.FPS)
                self.card_spans.append((item, item.start, end, exit_at, exit_seconds))

    def state(self, frame: int) -> dict:
        t = frame / spec.FPS
        out: dict = {}
        for card, start, end, exit_at, exit_seconds in self.card_spans:
            if not start <= frame < end:
                continue
            local = t - start / spec.FPS + (spec.OPEN_LEAD if start == 0 else 0.0)  # O1
            if card.kind == "end":
                times = self.end_times or default_end_times(card)
                out["card"] = end_card_state(card, local, times, self.has_logo and card.logo)
                if frame >= card.start + card.frames:
                    out["outro"] = outro_state(self.brand_name, t - (card.start + card.frames) / spec.FPS,
                                               self.has_logo)
            else:
                out["card"] = title_card_state(card, local, exit_at, exit_seconds)
        pill = next((p for p in (pill_state(c, t) for c in self.plan.callouts) if p), None)
        if pill:
            out["pill"] = pill
        boxes = [b for b in (box_state(h, self.plan.shots[h.shot], t, self.windows.get(frame))
                             for h in self.plan.highlights) if b]
        if boxes:
            out["boxes"] = boxes
        return out

    def layers(self, frame: int) -> tuple[dict, dict]:
        """(under, over): title cards sit under the window, so a card leaving while the window rises
        in passes behind it (W6); pills, boxes and the outro sit over it."""
        state = self.state(frame)
        under = {"card": state["card"]} if "card" in state and "outro" not in state else {}
        over = {k: v for k, v in state.items() if k not in under}
        return under, over
