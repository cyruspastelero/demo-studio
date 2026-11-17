#!/usr/bin/env python3
"""Makes a quiet, royalty-free music bed with ffmpeg alone: a slow four-chord pad (soft sine
voices, gentle swell, low-passed), so a narrated cut always has the bed the quality bar asks for
(docs/quality-bar.md A6). Deterministic: the same arguments give the same file. No network.

Usage: make-bed.py OUT.(m4a|wav|mp3) [--seconds 60] [--bpm 72]
Then set "voice": {"music": "<OUT relative to demo.json>"} and run narrate.py; it levels the bed
13 dB under the narration and ducks it while someone speaks.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# A calm I - vi - IV - V in C major, as frequencies (Hz) per chord voice.
CHORDS = (
    (130.81, 196.00, 261.63, 329.63),   # C
    (110.00, 164.81, 220.00, 261.63),   # Am
    (87.31, 174.61, 220.00, 261.63),    # F
    (98.00, 146.83, 196.00, 246.94),    # G
)


def chord_expr(seconds_per_chord: float) -> str:
    """aevalsrc expression: each chord swells in and out over its slot, neighbours overlap."""
    slot = seconds_per_chord
    cycle = slot * len(CHORDS)
    terms = []
    for i, chord in enumerate(CHORDS):
        start = i * slot
            # Each chord swells over two slots, centred on its own; neighbouring Hann windows overlap by
        # half, so the pad's level stays steady (a bed that pulses reads as a second voice).
        local = f"mod(t-{start - slot / 2:.3f}+{cycle:.3f},{cycle:.3f})"
        envelope = f"(lt({local},{2 * slot:.3f})*0.5*(1-cos(2*PI*{local}/{2 * slot:.3f})))"
        voices = "+".join(f"{0.9 if n == 0 else 0.55}*sin(2*PI*{f}*t)" for n, f in enumerate(chord))
        terms.append(f"{envelope}*({voices})")
    return f"0.2*({'+'.join(terms)})*(0.85+0.15*sin(2*PI*0.11*t))"


def main() -> int:
    parser = argparse.ArgumentParser(description="Make a quiet pad music bed with ffmpeg.")
    parser.add_argument("out", help="output file (.m4a, .wav or .mp3)")
    parser.add_argument("--seconds", type=float, default=60.0, help="length in seconds (default 60)")
    parser.add_argument("--bpm", type=float, default=72.0, help="tempo; one chord per bar of 4 beats (default 72)")
    args = parser.parse_args()
    if not shutil.which("ffmpeg"):
        sys.exit("make-bed: ffmpeg not found; run scripts/doctor.sh for install commands")
    out = Path(args.out)
    if out.suffix.lower() not in (".m4a", ".wav", ".mp3"):
        sys.exit(f"make-bed: {out.name} must end in .m4a, .wav or .mp3")
    if not 3 <= args.seconds <= 1800:
        sys.exit("make-bed: --seconds must be between 3 and 1800")
    out.parent.mkdir(parents=True, exist_ok=True)
    expr = chord_expr(4 * 60 / args.bpm)
    fade = min(2.0, args.seconds / 4)
    chain = (f"lowpass=f=1800,highpass=f=60,aecho=0.8:0.6:120|240:0.25|0.15,"
             f"afade=t=in:d=0.5,afade=t=out:st={args.seconds - fade:.3f}:d={fade:.3f}")
    codec = {".m4a": ["-c:a", "aac", "-b:a", "192k"], ".mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
             ".wav": ["-c:a", "pcm_s16le"]}[out.suffix.lower()]
    result = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                             "-i", f"aevalsrc='{expr}|{expr}':s=48000:d={args.seconds:.3f}",
                             "-af", chain, *codec, str(out)], capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"make-bed: ffmpeg failed:\n{result.stderr[-1500:]}")
    print(f"OUTPUT {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
