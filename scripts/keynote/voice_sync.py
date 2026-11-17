"""End-card words timed to the narration (X1): each title and tagline word shows about 0.1 s before
the voice says it. The line's length comes from the real audio when it exists (voiceover/NN files,
the say cache, or a fresh `say` render, which narrate.py then reuses); otherwise from the word rate.
Within the line, a word's time is proportional to the characters spoken before it."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Callable

from . import spec
from .model import Card

Measure = Callable[[str, int], tuple[float, str]]


def norm(word: str) -> str:
    return re.sub(r"[^0-9a-z]+", "", word.lower())


def word_offsets(text: str) -> list[tuple[str, float]]:
    """(normalised word, fraction of the line spoken before it)."""
    words = text.split()
    total = max(1, sum(len(w) + 1 for w in words))
    out, chars = [], 0
    for word in words:
        out.append((norm(word), chars / total))
        chars += len(word) + 1
    return out


def match_times(words: list[str], spoken: list[tuple[str, float]], cursor: int, start: float,
                seconds: float, fallback_step: float) -> tuple[list[float], int]:
    """Card-local reveal times for `words`, matched in order against the spoken words from `cursor`."""
    times: list[float] = []
    for word in words:
        target = norm(word)
        hit = next((i for i in range(cursor, len(spoken)) if spoken[i][0] == target), None)
        if hit is None:
            previous = times[-1] if times else start
            times.append(previous + fallback_step)
            continue
        times.append(max(0.0, start + spoken[hit][1] * seconds - spec.END_REVEAL_LEAD))
        cursor = hit + 1
    return times, cursor


def end_card_times(card: Card, lead_in: float, seconds: float) -> tuple[list[float], list[float]]:
    spoken = word_offsets(card.voiceover)
    title, cursor = match_times(card.title.split(), spoken, 0, lead_in, seconds, spec.TITLE_STAGGER)
    first = (title[-1] if title else lead_in) + spec.SUBTITLE_STAGGER
    tagline, _ = match_times(card.subtitle.split(), spoken, cursor, first, seconds, spec.SUBTITLE_STAGGER)
    return title, tagline


def line_number(sequence: list[dict], index: int) -> int:
    """1-based number of the item's voiceover line among voiced items (narrate.py's numbering)."""
    return sum(1 for item in sequence[: index + 1] if item.get("voiceover", "").strip())


def measure_line(demo_dir: Path, cfg: dict, text: str, number: int) -> tuple[float, str]:
    """(seconds, source) for one voiceover line, without calling any paid service."""
    from narration.core import FILE_EXTENSIONS, Voice  # the narration package sits next to keynote
    from narration.providers import render_say
    import demolib as lib

    voice = Voice.from_config(cfg.get("voice", {}))
    folder = demo_dir / "voiceover"
    for name in (f"{number:02d}", str(number)):
        for ext in FILE_EXTENSIONS:
            path = folder / f"{name}{ext}"
            if path.is_file():
                lib.ensure_inside(demo_dir, path, f"voiceover file {path.name}")
                return lib.duration(path), f"voiceover/{path.name}"
    if voice.provider in (None, "say") and shutil.which("say"):
        from narration.core import Line
        audio = render_say(Line(number, "end", text, 0.0, 0.0), voice, demo_dir / "recordings" / "voice-cache")
        return lib.duration(audio), "say"
    return len(text.split()) / voice.rate_wpm * 60, "word-count estimate"


def sync_end_card(card: Card | None, demo_dir: Path, cfg: dict, measure: Measure | None = None):
    """(title times, tagline times) for the end card, or None when it has no voiceover."""
    if card is None or card.kind != "end" or not card.voiceover.strip():
        return None
    from narration.core import DEFAULT_LEAD_IN

    number = line_number(cfg["sequence"], card.index)
    seconds, source = (measure or (lambda text, n: measure_line(demo_dir, cfg, text, n)))(card.voiceover, number)
    lead_in = cfg.get("voice", {}).get("lead_in", DEFAULT_LEAD_IN)
    print(f"end card: words timed to line {number} ({seconds:.2f}s, from {source})", flush=True)
    return end_card_times(card, lead_in, seconds)
