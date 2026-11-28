#!/usr/bin/env python3
"""Plan-time lint for a demo: reads only demo.json, so run it before anything is recorded.
Prints one line per item: PASS, LOOK (a judgement call: read the line and decide), or FAIL
(--strict turns every LOOK into FAIL).

Usage: plan-lint.py DEMO_DIR_OR_DEMO_JSON [--strict] [--json OUT.json]
  N1  a number on screen (card title or subtitle, callout or caption) that the same item's voiceover
      does not say. "3" matches "three", "1,000" matches "one thousand", "50%" matches "fifty percent".
      Items with no voiceover are skipped. Version strings (v2.1.3), digits glued to letters (Web3,
      H264), times (10:30) and bare years (1900 to 2099) are not number claims.
  N2  monotony: three or more scenes in a row that each zoom within their first second, or whose
      first callout has the same kind and an explicit, identical `pos`. A card breaks a run.
  W9  a scene that opens straight on a tight crop: `"wide": false` on a scene that does not follow
      another scene in the same window, or a first zoom so early that the engine cannot show
      the whole page first. "Tight" is a crop under 85% of a 1920 px take's width.
Exit code 0 unless a line FAILs. Python standard library only; no footage needed.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import demolib as lib  # noqa: E402

TOOL = "plan-lint"
RUN_LENGTH = 3            # N2: this many scenes in a row is monotony
TAKE_WIDTH = 1920         # W9: the take width the crops are measured in
# W9: the engine's numbers (scripts/keynote/spec.py), copied so this lint stays standard-library only.
WIDE_TIGHT, WIDE_MIN_HOLD, WIDE_MOVE, WINDOW_IN = 0.85, 0.6, 1.1, 0.7
EARLY_ZOOM_SECONDS = 1.0  # N2: a zoom that starts this soon after the scene begins

Finding = tuple[str, str]  # (check id, message)

# ---------------------------------------------------------------- numbers
UNITS = {w: n for n, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
    "sixteen seventeen eighteen nineteen twenty".split())}
TENS = {w: 10 * n for n, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split(), 2)}
SCALES = {"thousand": 1e3, "million": 1e6, "billion": 1e9}
SUFFIX_FACTORS = {"k": (1e3,), "m": (1e6, 1), "x": (1,), "s": (1,), "ms": (1,)}  # m: million or minutes

ON_SCREEN = re.compile(
    r"(?<![\w.:/-])(?<![A-Za-z]-)[$€£₱¥]?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(%|ms\b|[kKmMxXsS]\b)?(?![\d:/]|\.\d|\w)")
SPOKEN_DIGITS = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")


def to_float(digits: str) -> float:
    return float(digits.replace(",", ""))


def is_bare_year(raw: str, suffix: str | None) -> bool:
    return not suffix and re.fullmatch(r"(19|20)\d\d", raw) is not None


def on_screen_numbers(text: str) -> list[tuple[str, tuple[float, ...]]]:
    """(as written, acceptable spoken values) for each number claim in a piece of on-screen text."""
    found = []
    for match in ON_SCREEN.finditer(text):
        raw, suffix = match.group(1), (match.group(2) or "").lower()
        if is_bare_year(raw, suffix):
            continue
        value = to_float(raw)
        factors = SUFFIX_FACTORS.get(suffix, (1,))
        found.append((match.group(0).strip(), tuple({value * f for f in factors} | {value})))
    return found


def spoken_numbers(line: str) -> set[float]:
    """Every number the line says, as digits ("1,000", "10k") or as words ("two hundred and fifty")."""
    words = re.findall(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?[kK]?|\d+(?:\.\d+)?[kK]?|[a-z]+", line.lower())
    values: set[float] = set()
    i = 0
    while i < len(words):
        value, i = read_number(words, i)
        if value is not None:
            values.add(value)
    return values


def read_number(words: list[str], i: int) -> tuple[float | None, int]:
    """Parse one number starting at words[i]; return (value or None, next index)."""
    word = words[i]
    if word[0].isdigit():
        value, i = to_float(word.rstrip("k")) * (1e3 if word.endswith("k") else 1), i + 1
        if i < len(words) and words[i] in SCALES:
            value, i = value * SCALES[words[i]], i + 1
        return value, i
    total, current, used = 0.0, 0.0, False
    j = i
    while j < len(words):
        w = words[j]
        if w in UNITS or w in TENS:
            current, used = current + (UNITS.get(w) or TENS[w]), True
        elif w == "hundred" and (used or words[j - 1] == "a"):
            current, used = max(current, 1) * 100, True
        elif w in SCALES and (used or (j > 0 and words[j - 1] == "a")):
            total, current, used = total + max(current, 1) * SCALES[w], 0.0, True
        elif w == "and" and used and j + 1 < len(words) and (words[j + 1] in UNITS or words[j + 1] in TENS):
            pass
        else:
            break
        j += 1
    if not used:
        return None, i + 1
    value = total + current
    if j + 1 < len(words) and words[j] == "point" and words[j + 1] in UNITS:
        digits = []
        k = j + 1
        while k < len(words) and words[k] in UNITS and UNITS[words[k]] < 10:
            digits.append(str(UNITS[words[k]]))
            k += 1
        if digits:
            return float(f"{int(value)}.{''.join(digits)}"), k
    return value, j


# ---------------------------------------------------------------- items
def label(item: dict, index: int) -> str:
    name = f"card {item['card']}" if "card" in item else f"scene {item['scene']}"
    return f"sequence[{index}] ({name})"


def on_screen_text(item: dict) -> list[str]:
    """The words a viewer reads in this item. Person pills hold a name, not a claim."""
    if "card" in item:
        return [t for t in (item["title"], item.get("subtitle", "")) if t]
    texts = [c["text"] for c in item.get("callouts", []) if c.get("kind", "statement") == "statement"]
    if "callouts" not in item and item.get("caption"):
        texts.append(item["caption"])
    return texts


def check_numbers(sequence: list[dict]) -> tuple[list[Finding], int]:
    findings, checked = [], 0
    for index, item in enumerate(sequence):
        voice = item.get("voiceover", "").strip()
        if not voice:
            continue
        said = spoken_numbers(voice)
        for text in on_screen_text(item):
            for written, accepted in on_screen_numbers(text):
                checked += 1
                if not any(abs(v - s) < 1e-9 for v in accepted for s in said):
                    findings.append(("N1", f'{label(item, index)}: "{text}" shows {written}, but the voiceover '
                                     f'never says it: "{voice}"'))
    return findings, checked


def early_zoom(item: dict) -> bool:
    starts = [float(z["at"]) for z in item.get("zooms", []) if not isinstance(z["at"], dict)]  # a word cue has no fixed second
    if item.get("zoom") and not item.get("zooms"):
        starts.append(float(item["zoom"][3]))
    return any(at < EARLY_ZOOM_SECONDS for at in starts)


def first_pill(item: dict) -> tuple | None:
    """(kind, pos) of the first callout when it sits at an explicit position, else None."""
    callouts = item.get("callouts") or []
    if not callouts or "pos" not in callouts[0]:
        return None
    return callouts[0].get("kind", "statement"), tuple(callouts[0]["pos"])


def runs_of(sequence: list[dict], key) -> list[list[str]]:
    """Names of scenes in runs of RUN_LENGTH or more with one non-None key; a card or a gap ends a run."""
    runs, current, last = [], [], None
    for item in [*sequence, {"card": "", "title": ""}]:
        k = key(item) if "scene" in item else None
        if k is not None and k == last:
            current.append(item["scene"])
            continue
        if len(current) >= RUN_LENGTH:
            runs.append(current)
        current, last = ([item["scene"]] if k is not None else []), k
    return runs


def check_monotony(sequence: list[dict]) -> list[Finding]:
    names = lambda run: ", ".join(f"scene {n}" for n in run)
    zooms = [("N2", f"{names(r)}: each starts a zoom within its first {EARLY_ZOOM_SECONDS:g} s; "
              "stagger them so the camera does not feel like a tic") for r in runs_of(sequence, lambda i: True if early_zoom(i) else None)]
    pills = [("N2", f"{names(r)}: the first callout has the same kind and position every time; "
              "move or drop one") for r in runs_of(sequence, first_pill)]
    return zooms + pills


def check_opening(sequence: list[dict]) -> list[Finding]:
    """W9: every scene with a tight crop shows the whole page before it pushes into the crop."""
    findings = []
    for index, item in enumerate(sequence):
        crop = item.get("crop")
        if "scene" not in item or not crop or crop[2] >= WIDE_TIGHT * TAKE_WIDTH:
            continue
        previous = sequence[index - 1] if index else {}
        if item.get("wide") is False:
            if "scene" not in previous:
                findings.append(("W9", f"{label(item, index)}: \"wide\": false, but no scene comes right before it in "
                                 "the same window, so it opens straight on a tight crop; drop `wide` so the whole page "
                                 "shows first"))
            continue
        need = (WINDOW_IN if "scene" not in previous else 0.0) + WIDE_MIN_HOLD + WIDE_MOVE
        starts = [float(z["at"]) for z in item.get("zooms", []) if isinstance(z.get("at"), (int, float))]
        if starts and min(starts) < need:
            findings.append(("W9", f"{label(item, index)}: the first zoom starts at {min(starts):g}s, before the whole "
                             f"page can show and push in ({need:.1f}s); start it later, or set \"wide\": false if "
                             "the scene before it already showed this page"))
    return findings


def lint(demo: dict) -> list[Finding]:
    return check_numbers(demo["sequence"])[0] + check_monotony(demo["sequence"]) + check_opening(demo["sequence"])


# ---------------------------------------------------------------- command line
def find_demo(given: str) -> Path:
    path = Path(given)
    path = path / "demo.json" if path.is_dir() else path
    if not path.is_file():
        sys.exit(f"{TOOL}: no demo.json at {path}. Pass the demo folder or the file.")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(prog="plan-lint.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("demo", help="demo folder or demo.json")
    parser.add_argument("--strict", action="store_true", help="LOOK lines FAIL and exit 1")
    parser.add_argument("--json", help="write the results as JSON here")
    args = parser.parse_args()
    path = find_demo(args.demo)
    demo = lib.load_config(path, "demo", TOOL)
    rows: list[dict] = []

    def add(status: str, item: str, text: str) -> None:
        rows.append({"status": status, "item": item, "text": text})
        print(f"{status:<5} {item:<6} {text}", flush=True)

    flagged = "FAIL" if args.strict else "LOOK"
    numbers, checked = check_numbers(demo["sequence"])
    monotony = check_monotony(demo["sequence"])
    opening = check_opening(demo["sequence"])
    print(f"Plan lint for {path} ({len(demo['sequence'])} items). Bar: docs/quality-bar.md.")
    for check, group, ok_text in (("N1", numbers, f"{checked} on-screen number(s) with a voiceover are all said"),
                                  ("N2", monotony, "no run of three scenes zooming at once or repeating a pill spot"),
                                  ("W9", opening, "every tightly cropped scene shows the whole page first")):
        for _, text in group:
            add(flagged, check, text)
        if not group:
            add("PASS", check, ok_text)
    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2) + "\n")
    failed = sum(1 for r in rows if r["status"] == "FAIL")
    print(f"\n{sum(r['status'] == 'PASS' for r in rows)} pass, {failed} fail, "
          f"{sum(r['status'] == 'LOOK' for r in rows)} to look at")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
