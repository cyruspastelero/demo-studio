#!/usr/bin/env python3
"""A plan-free gate for any finished mp4 (promo, how-to, 4:5 or 9:16 social cut, launch ad). Prints one
line per item like check-cut.py: PASS, FAIL (measured value and the bar) or LOOK (a person should watch).

Usage: video-gate.py VIDEO.mp4 [--json OUT.json]
Exit code 0 when nothing FAILs, 1 on any FAIL. Needs ffmpeg and ffprobe; Python standard library only.

Measure: the video is decoded once through an ffmpeg rawvideo pipe as small grayscale frames
(SAMPLE_WIDTH px wide, SAMPLE_FPS per second, any aspect ratio). Per frame:
  spread  = max minus min pixel level; a frame is "blank" when spread < BLANK_SPREAD (flat colour of any hue).
  change  = mean absolute pixel difference from the previous sampled frame, in levels (0 to 255).
G1 FAIL: a run of blank frames of BLANK_SECONDS or more, outside the first and last EDGE_SECONDS;
   LOOK from BLANK_LOOK_SECONDS (a short flat beat can be a designed transition).
G2 LOOK: the longest run where change <= FROZEN_CHANGE (the picture is effectively identical).
G3 LOOK: the longest run where change <= QUIET_CHANGE (little changes: a blinking cursor or a clock
   counts as quiet but not frozen).
G4 FAIL: the probed duration and the decoded frames disagree by more than DURATION_SLACK seconds.
G4a LOOK: no audio stream (silent cuts are a normal intermediate).
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
from operator import sub
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import demolib as lib  # noqa: E402

# The G2 and G3 numbers are starting points borrowed from film_gate.py in the MIT-licensed huashu-art-motion
# project, which calibrated them on 13 art films, not on product demos. A held zoom on a static screen is
# normal in a demo, so G2 and G3 only ask for a look and never fail. This is an independent implementation.
# G1 is set from our own cuts: that project fails at 0.3 s, but the house look holds about 0.33 s of flat
# dark between the brand sweep and the outro words (measured on the todo sample), so 0.3 s fails good cuts.
BLANK_SECONDS = 1.0     # G1: shortest blank run that fails; a missing clip or a dropped card runs this long
BLANK_LOOK_SECONDS = 0.5  # G1: shortest blank run that asks for a look
EDGE_SECONDS = 0.5      # G1: ignored at the start and the end (fade in, fade out, end card settling)
BLANK_SPREAD = 8        # G1: max minus min under this many levels is blank; tuned on lavfi fixtures, keeps real UI and fades out
FROZEN_SECONDS = 6.0    # G2: longest frozen run that asks for a look (huashu-art-motion film_gate)
FROZEN_CHANGE = 0.15    # G2: mean level change counted as identical; encoder noise on a static frame is near 0
QUIET_SECONDS = 15.0    # G3: longest quiet run that asks for a look (huashu-art-motion film_gate)
QUIET_CHANGE = 1.0      # G3: mean level change counted as "nothing much"; a typed line or cursor stays under it
DURATION_SLACK = 0.5    # G4: probed duration vs decoded frames, seconds (the brief's bar)
SAMPLE_WIDTH = 160      # px; small keeps the pipe light and the numbers independent of the source size
SAMPLE_FPS = 12


class Report:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, status: str, item: str, text: str) -> None:
        self.rows.append({"status": status, "item": item, "text": text})
        print(f"{status:<5} {item:<6} {text}", flush=True)

    def check(self, ok: bool, item: str, text: str) -> None:
        self.add("PASS" if ok else "FAIL", item, text)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.rows if r["status"] == "FAIL")


def probe(path: Path) -> tuple[float, int, int]:
    """(duration seconds, width, height); exits with a video-gate message when ffprobe cannot read a video."""
    try:
        width, height = lib.probe_size(path)
        return lib.duration(path), width, height
    except (SystemExit, ValueError) as error:
        sys.exit(f"video-gate: cannot read a video stream from {path.name}: {str(error).splitlines()[-1] if str(error) else error}")


def sample_frames(path: Path, width: int, height: int):
    """Yields each sampled frame as bytes of gray levels; ffmpeg's exit status is checked at the end."""
    out_h = max(2, round(SAMPLE_WIDTH * height / width / 2) * 2)
    cmd = lib.ffmpeg_cmd(["ffmpeg", "-v", "error", "-i", path, "-an", "-vf",
                          f"fps={SAMPLE_FPS},scale={SAMPLE_WIDTH}:{out_h},format=gray",
                          "-f", "rawvideo", "-"])
    size = SAMPLE_WIDTH * out_h
    # stderr goes to a file, not a pipe: a damaged video can print more errors than a pipe holds.
    with tempfile.TemporaryFile() as errors, subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errors) as proc:
        while len(frame := proc.stdout.read(size)) == size:
            yield frame
        proc.stdout.read()
        proc.wait()
        errors.seek(0)
        error = errors.read().decode(errors="replace").strip()
    if proc.returncode:
        sys.exit(f"video-gate: ffmpeg could not decode {path.name}: {error[-300:]}")


def measure(frames) -> tuple[list[int], list[float]]:
    """(spread per frame, change from the previous frame per frame; the first frame's change is 0)."""
    spreads, changes, previous = [], [], None
    for frame in frames:
        spreads.append(max(frame) - min(frame))
        if previous is None or frame == previous:
            changes.append(0.0)
        else:
            changes.append(sum(map(abs, map(sub, frame, previous))) / len(frame))
        previous = frame
    return spreads, changes


def longest_run(flags: list[bool], lo: int = 0, hi: int | None = None) -> tuple[int, int]:
    """(first index, length) of the longest run of True in flags[lo:hi]; (0, 0) when there is none."""
    best, start = (0, 0), None
    hi = len(flags) if hi is None else hi
    for i in range(lo, hi + 1):
        on = i < hi and flags[i]
        if on and start is None:
            start = i
        elif not on and start is not None:
            best = max(best, (start, i - start), key=lambda run: run[1])
            start = None
    return best


def span(first: int, length: int) -> str:
    return f"{first / SAMPLE_FPS:.1f} to {(first + length) / SAMPLE_FPS:.1f} s"


def check_blank(r: Report, spreads: list[int]) -> None:
    edge = round(EDGE_SECONDS * SAMPLE_FPS)
    first, length = longest_run([s < BLANK_SPREAD for s in spreads], edge, len(spreads) - edge)
    bar = f"bar: no blank run of {BLANK_SECONDS:g} s or more between {EDGE_SECONDS:g} s and the last {EDGE_SECONDS:g} s"
    if length >= math.ceil(BLANK_SECONDS * SAMPLE_FPS):
        r.add("FAIL", "G1", f"blank picture at {span(first, length)} ({length / SAMPLE_FPS:.2f} s flat; {bar})")
    elif length >= math.ceil(BLANK_LOOK_SECONDS * SAMPLE_FPS):
        r.add("LOOK", "G1", f"flat picture at {span(first, length)} ({length / SAMPLE_FPS:.2f} s); "
                            f"fine if it is a designed beat between scenes ({bar})")
    else:
        r.add("PASS", "G1", f"no blank picture; longest flat run {length / SAMPLE_FPS:.2f} s ({bar})")


def check_stillness(r: Report, changes: list[float]) -> None:
    for item, limit, seconds, what in (("G2", FROZEN_CHANGE, FROZEN_SECONDS, "frozen"),
                                       ("G3", QUIET_CHANGE, QUIET_SECONDS, "with little happening")):
        first, length = longest_run([c <= limit for c in changes[1:]])
        first += 1
        held = length / SAMPLE_FPS
        text = f"longest stretch {what}: {held:.1f} s at {span(first, length)}" if length else f"never {what}"
        if held >= seconds:
            r.add("LOOK", item, f"{text}; watch it, a held zoom on a static screen can be right (look at {seconds:g} s or more)")
        else:
            r.add("PASS", item, f"{text} (look at {seconds:g} s or more)")


def check_streams(r: Report, path: Path, probed: float, decoded: int) -> None:
    seen = decoded / SAMPLE_FPS
    ok = decoded > 0 and abs(probed - seen) <= DURATION_SLACK
    r.check(ok, "G4", f"video decodes to the end: probed {probed:.2f} s, decoded {seen:.2f} s ({decoded} frames; bar: within {DURATION_SLACK:g} s)")
    if lib.has_audio(path):
        r.add("PASS", "G4a", "has an audio stream")
    else:
        r.add("LOOK", "G4a", "no audio stream: fine for a silent intermediate, not for a finished narrated cut")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gate any finished mp4: blank picture, frozen stretch, quiet gap, decode.")
    parser.add_argument("video")
    parser.add_argument("--json", help="write the results as JSON here")
    args = parser.parse_args()
    path = Path(args.video)
    if not path.is_file():
        sys.exit(f"video-gate: no such file {path}")
    lib.require("ffmpeg", "ffprobe")
    probed, width, height = probe(path)
    spreads, changes = measure(sample_frames(path, width, height))
    r = Report()
    if spreads:
        check_blank(r, spreads)
        check_stillness(r, changes)
    else:
        for item in ("G1", "G2", "G3"):
            r.add("FAIL", item, "no frames decoded, nothing to measure")
    check_streams(r, path, probed, len(spreads))
    if args.json:
        Path(args.json).write_text(json.dumps(r.rows, indent=2) + "\n")
    looks = sum(1 for x in r.rows if x["status"] == "LOOK")
    print(f"\n{sum(1 for x in r.rows if x['status'] == 'PASS')} pass, {r.failed} fail, {looks} to look at")
    return 1 if r.failed else 0


if __name__ == "__main__":
    sys.exit(main())
