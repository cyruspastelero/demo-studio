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
from .model import Card, PlanError

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


MAX_SPAN = 6        # spoken words one card word may stretch over ("x dot y", "A I powered")
SPOKEN_DOT = "dot"  # said for the "." of a domain or file name


def spoken_span(target: str, spoken: list[tuple[str, float]], start: int) -> int | None:
    """Index of the last spoken word when the words from `start` join up to `target`, else None.
    Joining drops separators, so "x.y" (normalised "xy") matches "x dot y", "x y" or "xy"; a spoken
    "dot" inside the run may stand for the "." the normalisation removed."""
    joined = {""}
    for j in range(start, min(len(spoken), start + MAX_SPAN)):
        word = spoken[j][0]
        grown = {a + word for a in joined}
        if word == SPOKEN_DOT and j > start:
            grown |= joined
        if target in grown:
            return j
        joined = {a for a in grown if a and target.startswith(a)}
        if not joined:
            return None
    return None


def match_times(words: list[str], spoken: list[tuple[str, float]], cursor: int, start: float,
                seconds: float, fallback_step: float) -> tuple[list[float], int]:
    """Card-local reveal times for `words`, matched in order against the spoken words from `cursor`.
    A card word may match several spoken words in a row; it shows when the first of them is said."""
    times: list[float] = []
    for word in words:
        target = norm(word)
        hit = next(((i, end) for i in range(cursor, len(spoken))
                    if target and (end := spoken_span(target, spoken, i)) is not None), None)
        if hit is None:
            previous = times[-1] if times else start
            times.append(previous + fallback_step)
            continue
        times.append(max(0.0, start + spoken[hit[0]][1] * seconds - spec.END_REVEAL_LEAD))
        cursor = hit[1] + 1
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
        cache = demo_dir / "recordings" / "voice-cache"
        for folder, what in ((demo_dir / "recordings", "recordings"), (cache, "recordings/voice-cache")):
            if folder.is_symlink():  # render_say writes here: a planted link must not redirect it
                raise lib.UnsafePath(f"{what}: {folder} is a symlink; refusing to write through it")
        lib.refuse_symlinks_under(cache, "recordings/voice-cache")
        audio = render_say(Line(number, "end", text, 0.0, 0.0), voice, cache)
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


class WordCues:
    """Resolves a cue's `at` to scene-local seconds. A number passes through; {"word", "nth", "offset"}
    lands on that spoken word of the scene's own voiceover. The word's place in the line is an
    ESTIMATE (its character fraction times the measured line length). Every resolved cue is kept
    in `records` for plan.json; narrate.py compares them with the real line length."""

    def __init__(self, cfg: dict, warn: list[str], measure: Measure | None = None):
        self.sequence, self.warn, self.records = cfg["sequence"], warn, []
        self.voice = cfg.get("voice", {})
        self.measure = measure

    def at(self, value, index: int, scene_seconds: float, where: str) -> float:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        return self._resolve(value, index, scene_seconds, where)

    def _resolve(self, cue, index: int, scene_seconds: float, where: str) -> float:
        from narration.core import DEFAULT_LEAD_IN  # the one lead_in the narration uses

        text = self.sequence[index].get("voiceover", "").strip()
        if not text:
            raise PlanError(f"{where}: names the word {cue.get('word')!r}, but the scene has no `voiceover` to find it in. "
                            "Add the line, or give `at` in seconds")
        spoken = word_offsets(text)
        word, nth = norm(str(cue.get("word", ""))), int(cue.get("nth", 1))
        hits = [fraction for said, fraction in spoken if said == word] if word else []
        if not hits or nth > len(hits):
            raise PlanError(self._missing(where, cue, text, spoken, nth, len(hits)))
        if "nth" not in cue and len(hits) > 1:
            self.warn.append(f"{where}: {cue['word']!r} is said {len(hits)} times, using the first; set nth")
        number = line_number(self.sequence, index)
        seconds, source = self._line_length(text, number)
        lead_in = self.voice.get("lead_in", DEFAULT_LEAD_IN)
        at = lead_in + hits[nth - 1] * seconds + float(cue.get("offset", 0))
        if not 0 <= at <= scene_seconds:
            side = "before the scene starts" if at < 0 else "after the scene ends"
            raise PlanError(f"{where}: the word {cue['word']!r} lands at {at:.2f}s, {side} "
                            f"({scene_seconds:.2f}s long, estimated). Change `offset`, `nth` or the scene")
        self.records.append({"where": where, "word": word, "nth": nth, "at": round(at, 3), "line": number,
                             "line_seconds": round(seconds, 3), "source": source})
        return at

    def _line_length(self, text: str, number: int) -> tuple[float, str]:
        if self.measure:
            return self.measure(text, number)
        from narration.core import DEFAULT_RATE
        return len(text.split()) / self.voice.get("rate_wpm", DEFAULT_RATE) * 60, "word-count estimate"

    @staticmethod
    def _missing(where: str, cue: dict, text: str, spoken: list, nth: int, found: int) -> str:
        if found:
            return (f"{where}: nth {nth} was asked for, but {cue['word']!r} is said {found} time"
                    f"{'s' if found > 1 else ''} in the line. Lower `nth`")
        words = ", ".join(w for w, _ in spoken if w)
        return (f"{where}: the word {cue.get('word')!r} is not in this scene's voiceover. "
                f"The line's words are: {words}. Name one word of it, or give `at` in seconds")
