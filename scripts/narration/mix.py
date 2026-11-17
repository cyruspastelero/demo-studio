"""The mix: lines placed on the cut, the music bed levelled and ducked under them, loudness to the bar.

Quality bar 2.12: integrated -14 LUFS +-1 (A2), true peak <= -1 dBTP (A3), LRA <= 15 LU (A4), the bed
present from frame 0, 12 to 14 dB under the narration between lines and a fixed DUCK_DB lower
under them (A6), at least one deliberate
dip (voice.music_dips), and silent for the last 3 s of an outro (X3)."""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path

from . import core
from .core import FPS, MUSIC_FADE, SAMPLE_RATE, Spoken, Voice, lib

DIP_RAMP = 0.3     # seconds the bed takes to drop into and come back from a dip
DIP_GAIN = 0.35    # about -9 dB
DUCK_DB = 7.0      # the bed sits this much lower while someone speaks
DUCK_RAMP = 0.25   # seconds to ease down before a line and back up after it
DUCK_MIN_GAP = 1.2  # a pause shorter than this stays ducked, so the bed never swells between sentences


def voice_chain(index: int, start: float) -> str:
    ms = int(round(start * 1000))
    return (f"[{index}:a]aresample={SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={ms}|{ms}[v{index}];")


def loudnorm(measured: dict | None) -> str:
    """Pass one: a loudnorm that only measures. Pass two: one fixed gain to the target, then a
    limiter for the peaks. (loudnorm's own second pass falls back to a slow AGC whenever its
    linear gain would clip, and that AGC pumps the music bed up in every pause.)"""
    lufs = lib.ff_num(core.TARGET_LUFS, "target loudness", -70, 0)
    true_peak = lib.ff_num(core.TARGET_TP, "target true peak", -9, 0)
    if not measured:
        return f"loudnorm=I={lufs}:TP={true_peak}:LRA=11:print_format=json"
    gain = float(lufs) - lib.finite_number(float(measured["input_i"]), "measured loudness", -200, 50)
    ceiling = 10 ** ((float(true_peak) - 0.3) / 20)  # sample-peak ceiling under the true-peak target
    return f"volume={gain:.2f}dB,alimiter=limit={ceiling:.4f}:attack=5:release=80:level=false"


def parse_loudnorm(stderr: str) -> dict | None:
    """The JSON block loudnorm prints at the end of pass one, or None if it is missing."""
    start = stderr.rfind("{")
    try:
        data = json.loads(stderr[start:stderr.rfind("}") + 1]) if start >= 0 else None
    except ValueError:
        return None
    keys = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    if not data or any(k not in data for k in keys):
        return None
    if any(str(data[k]) in ("-inf", "inf", "nan") for k in keys):
        return None  # silence: nothing to measure
    return data


def music_fades(total: float, fade_in: float, fade_out: float) -> str:
    """afade stages for the bed. Each fade is clamped to half the cut so they never overlap."""
    half = total / 2
    fade_in, fade_out = min(fade_in, half), min(fade_out, half)
    stages = f",afade=t=in:st=0:d={fade_in:.3f}" if fade_in > 0 else ""
    if fade_out > 0:
        stages += f",afade=t=out:st={total - fade_out:.3f}:d={fade_out:.3f}"
    return stages


def dip_stage(dips: tuple[tuple[float, float], ...]) -> str:
    """A volume stage that eases the bed down by DIP_GAIN over each (start, seconds) window."""
    if not dips:
        return ""
    terms = "*".join(f"(1-{1 - DIP_GAIN:.3f}*clip(min((t-{a:.3f})/{DIP_RAMP},({a + d:.3f}-t)/{DIP_RAMP}),0,1))"
                     for a, d in dips)
    return f",volume='{terms}':eval=frame"


def duck_regions(spans: list[tuple[float, float]], min_gap: float = DUCK_MIN_GAP) -> list[tuple[float, float]]:
    """Spoken (start, end) spans merged across pauses shorter than min_gap: the stretches where the
    bed stays ducked. Sorted, non-overlapping, with at least min_gap between them."""
    merged: list[tuple[float, float]] = []
    for start, end in sorted(spans):
        if merged and start - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def duck_stage(spans: list[tuple[float, float]], duck_db: float = DUCK_DB, ramp: float = DUCK_RAMP) -> str:
    """A volume stage that holds the bed duck_db down under each spoken stretch, easing down over
    `ramp` s before it and back up over `ramp` s after it: a fixed envelope, so the bed never pumps
    with the syllables the way a sidechain compressor does."""
    regions = duck_regions(spans)
    if not regions or duck_db <= 0:
        return ""
    depth = 1 - 10 ** (-duck_db / 20)
    terms = "+".join(f"clip(min((t-{a - ramp:.3f})/{ramp},({b + ramp:.3f}-t)/{ramp}),0,1)" for a, b in regions)
    return f",volume='1-{depth:.4f}*({terms})':eval=frame"


def mix_filter(spans: list[tuple[float, float]], total: float, music_input: int | None,
               music_volume: float, measured: dict | None = None,
               fade_in: float = 0.0, fade_out: float = MUSIC_FADE, tail: float = 0.0,
               dips: tuple[tuple[float, float], ...] = ()) -> str:
    """Filter graph: line i (spoken over spans[i] = (start, end) cut seconds) is input i+1. Ends in
    [out], exactly `total` seconds long. The bed plays at music_volume in real pauses, is ducked by a
    volume envelope under speech, and stops `tail` seconds before the end (silent outro)."""
    starts = [start for start, _ in spans]
    graph = "".join(voice_chain(i + 1, start) for i, start in enumerate(starts))
    graph += ("".join(f"[v{i + 1}]" for i in range(len(starts)))
              + f"amix=inputs={len(starts)}:normalize=0,apad,atrim=0:{total:.3f}[voice];")
    final = "voice"
    if music_input is not None:
        bed_end = max(0.1, total - tail)
        graph += (f"[{music_input}:a]aresample={SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
                  f"volume={music_volume:.3f},atrim=0:{bed_end:.3f}{music_fades(bed_end, fade_in, fade_out)}"
                  f"{duck_stage(spans)}{dip_stage(dips)},apad,atrim=0:{total:.3f}[bed];"
                  "[voice][bed]amix=inputs=2:normalize=0[mixed];")
        final = "mixed"
    return graph + f"[{final}]{loudnorm(measured)},aresample={SAMPLE_RATE}[out]"


def measure(inputs: list, graph: str, what: str) -> dict | None:
    """Runs a graph that ends in a print_format=json loudnorm and returns its measurements."""
    result = subprocess.run(lib.ffmpeg_cmd(["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "info", *inputs,
                                         "-filter_complex", graph, "-map", "[out]", "-f", "null", "-"]),
                            capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"ffmpeg failed while measuring {what}:\n{result.stderr[-1500:]}")
    return parse_loudnorm(result.stderr)


def bed_volume(voice_lufs: float, music_lufs: float, gap_db: float) -> float:
    """Linear gain that puts the bed gap_db under the narration (A6)."""
    return 10 ** ((voice_lufs - gap_db - music_lufs) / 20)


def auto_bed_volume(cut: Path, spoken: list[Spoken], total: float, music: Path, voice: Voice) -> float:
    inputs = ["-i", cut, *[arg for s in spoken for arg in ("-i", s.audio)]]  # line i is input i + 1
    voice_graph = mix_filter(spans_of(spoken), total, None, 0)
    spoken_level = measure(inputs, voice_graph, "the narration")
    bed_level = measure(["-stream_loop", "-1", "-t", f"{total:.3f}", "-i", music],
                        "[0:a]loudnorm=print_format=json[out]", "the music bed")
    if not spoken_level or not bed_level:
        return 0.18
    volume = bed_volume(float(spoken_level["input_i"]), float(bed_level["input_i"]), voice.music_gap_db)
    print(f"narrate: bed set {voice.music_gap_db:.0f} dB under the narration "
          f"({float(spoken_level['input_i']):.1f} LUFS): gain {20 * math.log10(volume):+.1f} dB", flush=True)
    return volume


def spans_of(spoken: list[Spoken]) -> list[tuple[float, float]]:
    """(start, end) cut seconds of each placed line."""
    return [(s.line.start, s.line.start + s.seconds) for s in spoken]


def mux(cut: Path, spoken: list[Spoken], total: float, music: Path | None, voice: Voice, out: Path,
        tail: float = 0.0, fade_out: float | None = None) -> None:
    inputs = [arg for s in spoken for arg in ("-i", s.audio)]
    music_input, volume = None, voice.music_volume or 0.0
    if music:
        if voice.music_volume is None:
            volume = auto_bed_volume(cut, spoken, total, music, voice)
        inputs += ["-stream_loop", "-1", "-i", music]
        music_input = len(spoken) + 1
    spans = spans_of(spoken)
    # Pass one: measure the mix's loudness (audio only, fast). Pass two applies it linearly.
    options = {"fade_in": voice.music_fade_in, "fade_out": voice.music_fade_out if fade_out is None else fade_out,
               "tail": tail, "dips": voice.music_dips}
    probe = mix_filter(spans, total, music_input, volume, **options)
    measured = measure(["-i", cut, *inputs], probe, "loudness")
    graph = mix_filter(spans, total, music_input, volume, measured, **options)
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", "-i", cut, *inputs, "-filter_complex", graph,
                      "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                      "-ar", SAMPLE_RATE, "-ac", "2", "-t", f"{total:.3f}", "-movflags", "+faststart", out],
                     "mux", int(total * FPS))


PLACEHOLDER_MARK = "make-bed placeholder"  # make-bed.py writes this into the file's comment tag


def is_placeholder_bed(path: Path) -> bool:
    """True when the bed is make-bed.py's placeholder pad (it tags its files)."""
    result = subprocess.run(lib.ffmpeg_cmd(["ffprobe", "-v", "error", "-show_entries", "format_tags=comment", "-of", "json", path]),
                            capture_output=True, text=True)
    try:
        tags = json.loads(result.stdout or "{}").get("format", {}).get("tags", {})
    except ValueError:
        return False
    return any(PLACEHOLDER_MARK in str(v) for k, v in tags.items() if k.lower() == "comment")


EBUR = {"I": r"I:\s+(-?[\d.]+|-inf) LUFS", "LRA": r"LRA:\s+(-?[\d.]+) LU", "TP": r"Peak:\s+(-?[\d.]+|-inf) dBFS"}


def ebur128(path: Path) -> dict[str, float]:
    """Integrated loudness, loudness range and true peak of a file's audio (ffmpeg ebur128)."""
    result = subprocess.run(lib.ffmpeg_cmd(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-map", "0:a:0",
                                         "-af", "ebur128=peak=true", "-f", "null", "-"]), capture_output=True, text=True)
    summary = result.stderr[result.stderr.rfind("Summary:"):]
    values = {}
    for key, pattern in EBUR.items():
        match = re.search(pattern, summary)
        values[key] = float(match.group(1)) if match else float("nan")
    return values


def loudness_report(values: dict[str, float]) -> list[str]:
    """Bar problems with the measured loudness; empty when it passes A2 to A4."""
    problems = []
    if not abs(values["I"] - core.TARGET_LUFS) <= 1.0:
        problems.append(f"integrated {values['I']:.1f} LUFS (bar: {core.TARGET_LUFS} +-1)")
    if not values["TP"] <= core.TRUE_PEAK_BAR:
        problems.append(f"true peak {values['TP']:.1f} dBTP (bar: <= {core.TRUE_PEAK_BAR})")
    if not values["LRA"] <= 15:
        problems.append(f"loudness range {values['LRA']:.1f} LU (bar: <= 15)")
    return problems
