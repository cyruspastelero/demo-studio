"""The fit table, overrun advice, and the line export for voice tools this script does not call."""
from __future__ import annotations

import json
import math
from pathlib import Path

from .core import (EXPORT_EXT, MUSIC_DIR, MUSIC_FADE, MUSIC_TARGET, VOICE_DIR, Line,
                   NarrateError, Spoken, lib)
from .providers import write_atomic
from .timing import item_key

def fit_problems(spoken: list[Spoken]) -> list[str]:
    return [f"line {s.line.number} ({s.line.key}) runs {s.seconds:.1f}s but has {s.line.budget:.1f}s"
            for s in spoken if not s.fits]


def overrun_advice(spoken: list[Spoken], rate_wpm: float) -> list[str]:
    """Per long line: how much too long, and roughly how many words to cut."""
    out = []
    for problem, s in zip(fit_problems(spoken), [s for s in spoken if not s.fits]):
        over = s.seconds - s.line.budget
        words = max(1, round(over * rate_wpm / 60 + 0.49))
        out.append(f"{problem}: {over:.1f}s too long (cut about {words} word{'s' if words > 1 else ''})")
    return out


def format_table(spoken: list[Spoken]) -> str:
    rows = [f"  {'#':>2}  {'item':<12} {'start':>7} {'budget':>7} {'length':>8}  fits"]
    for s in spoken:
        length = f"{s.seconds:.2f}s" if s.measured else f"~{s.seconds:.2f}s"
        rows.append(f"  {s.line.number:>2}  {s.line.key:<12} {s.line.start:>7.2f} {s.line.budget:>7.2f} "
                    f"{length:>8}  {'yes' if s.fits else 'NO'}")
    if any(not s.measured for s in spoken):
        rows.append("  ~ = estimated from the word count, not rendered")
    return "\n".join(rows)


# ---------------------------------------------------------------- export for MCP voice tools

VOICE_README = """Voiceover files for narrate.py
==============================

lines.json lists every voiced line of {title} in order. Each entry has the text, the file
name it must be saved as, where it starts in the cut, its time budget in seconds and about how
many words fit. The drop-in rule: one file per line, named by its index, 01.mp3, 02.mp3 and so
on (.wav and .m4a also work). narrate.py places file NN where line NN starts.

Make the files any way you like:
  Your own voice   record each line and save it as voiceover/NN.mp3 (or .wav / .m4a).
  ElevenLabs MCP   call text_to_speech with the line's text and output_directory set to this
                   folder. It saves a file with its own name; rename it to the entry's "file"
                   value, for example voiceover/01.mp3. Use the same voice for every line.
  Higgsfield MCP   call generate_audio with the line's text as the prompt (speech model), wait
                   for the job, then download the result URL to the entry's "file" value.

Keep each line inside its budget. A line that runs long is reported, never sped up.
When every file is in place, render the narrated cut:
  {command} --voice files
narrate.py lists any missing numbers and what to do. If you change a voiceover line in demo.json,
export again and remake that line's file.
"""

MUSIC_README = """Music bed for narrate.py
========================

narrate.py loops one music file under the voice, ducks it while someone speaks, fades it and
balances the loudness. The cut is {total:.1f}s long, so a bed of about {seconds}s needs no loop.
Use instrumental music only, with no vocals, that you have the rights to use.

Get a bed one of these ways, and save it as {target}:
  Free, made here  {make_bed} {target} --seconds {seconds}
                   (a calm pad made with ffmpeg alone; no network, no credits)
  Your own file    any .mp3, .wav or .m4a you are allowed to use; copy it to {target}.
  ElevenLabs MCP   compose_music with a short prompt (for example "calm modern instrumental for a
                   product demo, soft piano and light beat"), force_instrumental true,
                   music_length_ms {length_ms}. Move the saved file to {target}.
  Higgsfield MCP   generate_audio with a music model (for example suno_music, instrumental true,
                   duration {seconds}), wait for the job, then download the result to {target}.

Then point demo.json at it, inside "voice":
  "music": "{target}", "music_dips": [{{"at": 12.0, "dur": 1.5}}]
narrate.py sets the bed 13 dB under the narration (music_gap_db), ducks it under speech, dips it at
each music_dips time (cut seconds; pick one key moment) and fades it out ({fade}s, or 4 s before a
silent outro). music_volume fixes the level by hand instead (0 to 1, before ducking). Render:
  {command}
"""


def item_label(item: dict) -> str:
    return item.get("title") or item.get("caption") or item_key(item)


def lines_manifest(lines: list[Line], sequence: list[dict], total: float, rate_wpm: float,
                   title: str) -> dict:
    """Everything a voice tool needs to make voiceover/NN.mp3 for each line."""
    items = {item_key(item): item for item in sequence}
    return {
        "title": title, "total": round(total, 3), "rate_wpm": rate_wpm,
        "music_length_ms": max(3000, math.ceil(total + 1) * 1000),
        "rule": "Save line N as voiceover/NN.mp3 (01, 02 ...; .wav or .m4a also work), then run "
                "narrate.py --voice files.",
        "lines": [{"index": line.number, "item": line.key, "label": item_label(items[line.key]),
                   "text": line.text, "file": f"{VOICE_DIR}/{line.number:02d}{EXPORT_EXT}",
                   "start": line.start, "budget": line.budget,
                   "suggested_words": int(line.budget * rate_wpm / 60)} for line in lines],
    }


def write_exports(manifest: dict, demo_dir: Path, command: str = "narrate.py demo.json") -> list[Path]:
    """Writes voiceover/lines.json, voiceover/README.txt and music/README.txt inside the demo folder."""
    seconds = math.ceil(manifest["total"] + 1)
    texts = {
        f"{VOICE_DIR}/lines.json": json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        f"{VOICE_DIR}/README.txt": VOICE_README.format(title=manifest["title"], command=command),
        f"{MUSIC_DIR}/README.txt": MUSIC_README.format(
            total=manifest["total"], seconds=seconds, length_ms=manifest["music_length_ms"],
            target=MUSIC_TARGET, fade=MUSIC_FADE, command=command,
            make_bed=f"python3 -I {Path(__file__).resolve().parent.parent / 'make-bed.py'}"),
    }
    written = []
    for relative, text in texts.items():
        try:  # a symlinked voiceover/ or music/ folder must not send these files elsewhere
            target = lib.safe_join(demo_dir, relative, relative)
        except lib.UnsafePath as error:
            raise NarrateError(str(error), (f"Replace that symlink with a real folder, then: {{cmd}} --export-lines",)) from error
        written.append(write_atomic(target, text.encode()))
    return written
