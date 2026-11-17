"""Builds the Plan from demo.json: frame-exact item starts, window runs, and every zoom, callout and
highlight placed on the cut's clock. Problems that make a render impossible raise PlanError; ones
that only miss the quality bar become warnings (build-keynote.py --strict turns them into errors)."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from . import spec
from .model import (Callout, Card, Highlight, Plan, PlanError, Run, Shot, Zoom, _card_from, _shot_from,
                    source_to_rest)

Probe = Callable[[Path], tuple[float, tuple[int, int]]]


def build_plan(cfg: dict, raw_dir: Path, probe: Probe) -> Plan:
    warn: list[str] = []
    sequence = cfg["sequence"]
    items, clock = [], 0
    for index, item in enumerate(sequence):
        if "card" in item:
            card = _card_from(item, index, clock, index == len(sequence) - 1 and index > 0, warn)
            items.append(card)
            clock += card.frames + card.outro_frames
        else:
            shot = _shot_from(item, index, clock, raw_dir, probe, warn)
            items.append(shot)
            clock += shot.frames
    shots = tuple(i for i in items if isinstance(i, Shot))
    cards = tuple(i for i in items if isinstance(i, Card))
    if any(c.kind == "end" for c in cards[:-1]) or (cards and cards[-1].kind == "end" and items[-1] is not cards[-1]):
        raise PlanError("an end card (kind \"end\") must be the last item of the sequence")
    runs = _runs(items, shots, sequence, warn)
    zoom_spans = [(r.start / spec.FPS + z.at, r.start / spec.FPS + z.end) for r in runs for z in r.zooms]
    callouts = _callouts(sequence, shots, runs, zoom_spans, warn)
    highlights = _highlights(sequence, shots, runs, warn)
    if items and isinstance(items[0], Shot):
        warn.append("sequence[0]: the cut opens on footage, so frame 0 is an empty background; "
                    "start with a title card (bar O1)")
    first_ui = next((s.start / spec.FPS for s in shots), None)
    if first_ui is not None and first_ui > 6.0:
        warn.append(f"first product UI appears at {first_ui:.1f}s; the bar wants it by 6.0s (O4)")
    outro = cards[-1].outro_frames if cards and cards[-1].kind == "end" else 0
    return Plan(tuple(items), shots, cards, runs, callouts, highlights, clock, outro, tuple(warn))


def _runs(items: list, shots: tuple[Shot, ...], sequence: list[dict], warn: list[str]) -> tuple[Run, ...]:
    runs, current = [], []
    position = {shot.index: n for n, shot in enumerate(shots)}
    for item in [*items, None]:
        if isinstance(item, Shot):
            current.append(item)
            continue
        if current:
            start = current[0].start
            frames = sum(s.frames for s in current)
            zooms = tuple(z for s in current for z in _zooms(sequence[s.index], s, start, warn))
            _check_zooms(zooms, frames / spec.FPS, current[0].index, warn)
            _check_zoom_pacing(zooms, frames / spec.FPS, current[0].index, warn)
            runs.append(Run(tuple(position[s.index] for s in current), start, frames, zooms,
                            fade_out=item is not None))
            current = []
    return tuple(runs)


def _zooms(item: dict, shot: Shot, run_start: int, warn: list[str]) -> list[Zoom]:
    offset = (shot.start - run_start) / spec.FPS
    seconds = shot.frames / spec.FPS
    where = f"sequence[{shot.index}]"
    zooms = []
    for n, z in enumerate(item.get("zooms", [])):
        hold = float(z.get("dur", spec.ZOOM_HOLD_DEFAULT))
        focus = source_to_rest(tuple(z["focus"]), shot)
        zooms.append(Zoom(offset + float(z["at"]), float(z.get("scale", spec.ZOOM_MAX)), focus, hold))
        lo, hi = spec.ZOOM_HOLD_RANGE
        if not lo <= hold <= hi:
            warn.append(f"{where}.zooms[{n}].dur: holds {hold:.1f}s; the bar wants {lo} to {hi}s (Z5)")
    legacy = item.get("zoom")
    if legacy and not item.get("zooms"):
        factor, cx, cy, at = legacy[:4]
        hold = min(4.3, seconds - at - 2 * spec.ZOOM_MOVE_SECONDS)
        if hold < 0.6:
            warn.append(f"{where}.zoom: the scene is too short to zoom in and back out; zoom skipped. "
                        "Use `zooms` with an earlier `at`, or widen `trim`")
        else:
            zooms.append(Zoom(offset + at, min(float(factor), spec.ZOOM_MAX),
                              source_to_rest((cx, cy), shot), hold))
            warn.append(f"{where}.zoom: old [factor, x, y, start, seconds] form; converted to a {min(factor, 1.15)}x "
                        "whole-window zoom. Switch to `zooms: [{at, scale, focus, dur}]`")
    return zooms


def _check_zooms(zooms: tuple[Zoom, ...], run_seconds: float, first_index: int, warn: list[str]) -> None:
    ordered = sorted(zooms, key=lambda z: z.at)
    for a, b in zip(ordered, ordered[1:]):
        if b.at < a.end:
            raise PlanError(f"zooms overlap in the run starting at sequence[{first_index}]: one starts at "
                            f"{b.at:.2f}s before the previous one has eased back at {a.end:.2f}s (run time)")
    for z in ordered:
        if z.at < spec.ENTRY_SECONDS:
            warn.append(f"a zoom at run time {z.at:.2f}s starts while the window is still rising in; start it "
                        f"after {spec.ENTRY_SECONDS}s")
        if z.end > run_seconds:
            warn.append(f"a zoom at run time {z.at:.2f}s eases back at {z.end:.2f}s, after its run ends at "
                        f"{run_seconds:.2f}s; shorten `dur` or start earlier")


def _check_zoom_pacing(zooms: tuple[Zoom, ...], run_seconds: float, first_index: int, warn: list[str]) -> None:
    """A look template's pacing.zoom_every: no stretch of a window run longer than that without a zoom."""
    every = spec.ZOOM_EVERY
    if not every:
        return
    marks = sorted([0.0, run_seconds, *(z.at for z in zooms), *(z.end for z in zooms)])
    longest = max(b - a for a, b in zip(marks, marks[1:]))
    if longest > every:
        warn.append(f"the run starting at sequence[{first_index}] goes {longest:.1f}s without a zoom; the look "
                    f"paces one every {every:g}s or less (template pacing.zoom_every)")


def _shot_of(index: int, shots: tuple[Shot, ...]) -> tuple[int, Shot]:
    return next((n, s) for n, s in enumerate(shots) if s.index == index)


def _callouts(sequence: list[dict], shots: tuple[Shot, ...], runs: tuple[Run, ...],
              zoom_spans: list[tuple[float, float]], warn: list[str]) -> tuple[Callout, ...]:
    out: list[tuple[Callout, str]] = []
    run_starts = {r.start for r in runs}
    for shot in shots:
        item, base = sequence[shot.index], shot.start / spec.FPS
        seconds = shot.frames / spec.FPS
        where = f"sequence[{shot.index}]"
        entries = item.get("callouts")
        if entries is None and item.get("caption"):
            at = spec.ENTRY_SECONDS + 0.06 if shot.start in run_starts else 0.1
            dur = min(spec.PILL_SECONDS_DEFAULT, seconds - at - spec.PILL_EXIT)
            entries = [{"at": at, "dur": dur, "kind": "statement", "text": item["caption"]}] if dur >= 1.5 else []
        for n, c in enumerate(entries or []):
            dur = float(c.get("dur", spec.PILL_SECONDS_DEFAULT))
            kind = c.get("kind", "statement")
            callout = Callout(base + float(c["at"]), base + float(c["at"]) + dur, kind, c["text"].strip(),
                              c.get("role", "").strip(), c.get("avatar", ""))
            out.append((callout, f"{where}.callouts[{n}]" if "callouts" in item else f"{where}.caption"))
            lo, hi = spec.PILL_SECONDS_RANGE
            if not lo <= dur <= hi:
                warn.append(f"{out[-1][1]}: on screen {dur:.1f}s; the bar wants {lo} to {hi}s (C8)")
            if kind == "statement" and len(callout.text.split()) > spec.PILL_STATEMENT_MAX_WORDS:
                warn.append(f"{out[-1][1]}: {len(callout.text.split())} words; a statement pill holds at most "
                            f"{spec.PILL_STATEMENT_MAX_WORDS} (C4)")
            if kind not in spec.PILL_KINDS:
                warn.append(f"{out[-1][1]}: a {kind} pill, but the look uses only {', '.join(spec.PILL_KINDS)} pills")
            if kind == "person" and not callout.role:
                warn.append(f"{out[-1][1]}: a person pill needs `role` (\"Name, role\", C3)")
            for start, end in zoom_spans:
                if callout.start < end and callout.end + spec.PILL_EXIT > start:
                    warn.append(f"{out[-1][1]}: overlaps a zoom ({start:.2f}s to {end:.2f}s); a pill ends before a "
                                "zoom and returns after it eases back (Z7)")
    ordered = sorted(out, key=lambda pair: pair[0].start)
    for (a, _), (b, where) in zip(ordered, ordered[1:]):
        if b.start < a.end + spec.PILL_EXIT:
            raise PlanError(f"{where}: starts at {b.start:.2f}s while the previous pill is still on screen until "
                            f"{a.end + spec.PILL_EXIT:.2f}s; one pill at a time (C8)")
    return tuple(c for c, _ in ordered)


def _highlights(sequence: list[dict], shots: tuple[Shot, ...], runs: tuple[Run, ...],
                warn: list[str]) -> tuple[Highlight, ...]:
    out = []
    for run in runs:
        run_base = run.start / spec.FPS
        landings = [(run_base + z.landed, run_base + z.end) for z in run.zooms]
        for shot_number in run.shots:
            shot = shots[shot_number]
            base = shot.start / spec.FPS
            own = _shot_landings(run, shot)
            automatic = 0
            for n, h in enumerate(sequence[shot.index].get("highlights", [])):
                where = f"sequence[{shot.index}].highlights[{n}]"
                x, y, w, hh = h["rect"]
                if x < 0 or y < 0 or x + w > shot.source_size[0] or y + hh > shot.source_size[1]:
                    raise PlanError(f"{where}.rect: {h['rect']} is outside the {shot.source_size[0]}x"
                                    f"{shot.source_size[1]} take (source px)")
                start, zoom = _highlight_start(h, base, landings, own, where, automatic)
                automatic += "at" not in h
                end = start + float(h["dur"]) if "dur" in h else (zoom[1] if zoom else start + 2.5)
                if zoom and not 0.1 <= start - zoom[0] <= 0.3:
                    warn.append(f"{where}.at: shows {start - zoom[0]:+.2f}s after the zoom lands; the bar wants "
                                f"{spec.HIGHLIGHT_DELAY}s (H5). Leave `at` out to place it automatically")
                if not zoom:
                    warn.append(f"{where}: no zoom lands just before it; the bar pairs each box with a zoom (H5)")
                out.append(Highlight(start, end, spec.Rect(x, y, w, hh), shot_number, where))
    for h in out:
        live = sum(1 for o in out if o.start < h.end and o.end > h.start)
        if live > spec.HIGHLIGHT_MAX_ON_SCREEN:
            warn.append(f"{live} highlight boxes on screen at {h.start:.2f}s; the bar allows "
                        f"{spec.HIGHLIGHT_MAX_ON_SCREEN} (H7)")
            break
    return tuple(out)


def _shot_landings(run: Run, shot: Shot) -> list[tuple[float, float]]:
    """(landed, eased back) in cut seconds for the zooms that start inside this shot."""
    run_base = run.start / spec.FPS
    first, last = shot.start / spec.FPS, (shot.start + shot.frames) / spec.FPS
    return [(run_base + z.landed, run_base + z.end) for z in run.zooms if first <= run_base + z.at < last]


def _highlight_start(h: dict, base: float, landings: list[tuple[float, float]],
                     own: list[tuple[float, float]], where: str,
                     automatic: int) -> tuple[float, tuple[float, float] | None]:
    """With `at`: that time. Without: 0.17 s after the zoom it pairs with, counted inside its own
    scene only (the first box without `at` follows the scene's first zoom, the second its second
    zoom, and so on). A zoom in another scene of the same window run never counts."""
    if "at" in h:
        start = base + float(h["at"])
        before = [z for z in landings if z[0] <= start + 0.05 and start < z[1]]
        return start, (before[-1] if before else None)
    if len(own) <= automatic:
        have = f"its scene has {len(own)} zoom(s)" if own else "its scene has no zoom"
        raise PlanError(f"{where}: no `at`, so it follows zoom {automatic + 1} of its own scene, but {have} "
                        "(zooms in other scenes do not count). Give `at` (seconds into the scene), or add a "
                        "zoom to this scene's `zooms`")
    return own[automatic][0] + spec.HIGHLIGHT_DELAY, own[automatic]
