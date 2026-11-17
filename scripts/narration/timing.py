"""Where each voiced line goes: read build-keynote's timing file, or derive it from demo.json."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from .core import DEFAULT_CARD, FPS, REBUILD, ItemTiming, Line, NarrateError

def item_key(item: dict) -> str:
    return f"card-{item['card']}" if "card" in item else item["scene"]


def load_timing(path: Path, sequence: list[dict]) -> tuple[list[ItemTiming], float]:
    """Reads the timing file build-keynote.py wrote and checks it still matches demo.json."""
    try:
        data = json.loads(path.read_text())
        items = [ItemTiming(i["key"], float(i["start"]), float(i["duration"])) for i in data["items"]]
        total = float(data["total"])
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise NarrateError(f"could not read timing file {path.name}: {error}") from error
    built = [i.key for i in items]
    wanted = [item_key(i) for i in sequence]
    if built != wanted:
        raise NarrateError(f"demo.json sequence changed since the cut was built (cut has {built}, "
                           f"demo.json has {wanted}); build the cut again", (REBUILD, "{cmd}"))
    return items, total


def item_length(item: dict, raw_dir: Path, probe: Callable[[Path], float]) -> float:
    """Same arithmetic as build-keynote.py: card duration, or trimmed take length / speed."""
    if "card" in item:
        seconds = item.get("duration", DEFAULT_CARD)
    else:
        start, end = item.get("trim") or [None, None]
        if end is None:
            source = raw_dir / f"{item['stem']}-t{item.get('take', 1)}.mp4"
            if not source.exists():
                raise NarrateError(f"deriving timing needs {source}, which is missing",
                                   (REBUILD, "{cmd}"))
            end = probe(source)
        seconds = (end - (start or 0)) / item.get("speed", 1)
    return round(seconds * FPS) / FPS


def derive_timing(sequence: list[dict], raw_dir: Path, probe: Callable[[Path], float]) -> list[ItemTiming]:
    lengths = [item_length(item, raw_dir, probe) for item in sequence]
    starts = [sum(lengths[:i]) for i in range(len(lengths))]
    return [ItemTiming(item_key(item), start, length) for item, start, length in zip(sequence, starts, lengths)]


def plan_lines(sequence: list[dict], timings: list[ItemTiming], total: float, lead_in: float) -> list[Line]:
    """One Line per voiced item. A line may run until the next voiced item starts."""
    voiced = [i for i, item in enumerate(sequence) if item.get("voiceover", "").strip()]
    lines = []
    for number, index in enumerate(voiced, start=1):
        start = timings[index].start + lead_in
        end = timings[voiced[number]].start if number < len(voiced) else total
        lines.append(Line(number, timings[index].key, sequence[index]["voiceover"].strip(),
                          round(start, 3), round(end - start, 3)))
    return lines


def estimate_seconds(text: str, rate_wpm: float) -> float:
    return len(text.split()) / rate_wpm * 60



def timing_outro(path: Path) -> float:
    """Seconds of narration-free outro at the end of the cut (0 for older timing files)."""
    try:
        return max(0.0, float(json.loads(path.read_text()).get("outro", 0)))
    except (OSError, ValueError, TypeError, AttributeError):
        return 0.0
