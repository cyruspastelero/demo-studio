#!/usr/bin/env python3
"""Packages everything an editor needs into <demo>/editor-handoff/ (+ a .zip next to it):
final cut, raw footage in story order, rendered segments, graphics, SCRIPT.txt, README.txt.

This is the handoff for a single keynote cut made from demo.json. For a promo and a how-to cut
from in/out points, use build-handoff.py with handoff.json instead.

Usage (from the demo dir, after build-keynote.py): keynote-handoff.py demo.json
"""
import csv
import importlib.util
import re
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()

PLUGIN_ASSETS = Path(__file__).resolve().parent.parent / "assets"
WPS = 2.5  # typical AI narrator pace, words per second
VO_LEAD = 0.5  # a voiceover line starts this far into its segment


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout)


def tc(s):
    return f"{int(s // 60)}:{s % 60:05.2f}"


def voiceover_windows(seq, keys, starts, total):
    """key -> (start, seconds available, words). A line runs until the next line starts."""
    narrated = [i for i, item in enumerate(seq) if item.get("voiceover")]
    windows, too_long = {}, []
    for j, i in enumerate(narrated):
        end = starts[narrated[j + 1]] if j + 1 < len(narrated) else total
        start = starts[i] + VO_LEAD
        words = len(seq[i]["voiceover"].split())
        windows[keys[i]] = (start, end - start, words)
        if words / WPS > end - start:
            too_long.append(f"{keys[i]}: ~{words / WPS:.0f}s of speech, {end - start:.0f}s available")
    if too_long:
        sys.exit("handoff: voiceover lines too long for their windows; trim them or slow the edit:\n  "
                 + "\n  ".join(too_long))
    return windows


def voiceover_lines(item, window):
    if not window:
        return ["    Voiceover: (previous line continues)"]
    start, available, words = window
    wrapped = textwrap.wrap(item["voiceover"], 84, initial_indent='      "', subsequent_indent="       ")
    wrapped[-1] += '"'
    return [f"    VOICEOVER starts {tc(start)}, about {words / WPS:.0f}s of {available:.0f}s available:", *wrapped]


def write_voiceover(path, cfg, seq, keys, vo):
    blocks = [(keys[i], item["voiceover"]) for i, item in enumerate(seq) if item.get("voiceover")]
    path.write_text(
        f"{cfg.get('title', 'DEMO').upper()}: VOICEOVER\n"
        "Paste each block into the AI voice tool as its own clip, then place it at its start time.\n"
        "Suggested voice: warm, relaxed, conversational, about 150 words a minute.\n\n"
        + "\n\n".join(f"[{tc(vo[k][0])}]  {k}\n" + textwrap.fill(text, 84) for k, text in blocks)
        + "\n\n\nFULL READ (one take)\n\n" + "\n\n".join(text for _, text in blocks) + "\n")


def copy_in(demo, src, dest):
    """Copies a file from the demo folder, refusing anything (such as a planted symlink) that resolves outside it."""
    try:
        lib.ensure_inside(demo, src, "keynote-handoff source")
    except lib.UnsafePath as error:
        sys.exit(f"keynote-handoff: {error}")
    shutil.copy2(src, dest)


def main():
    cfg_path = Path(sys.argv[1] if len(sys.argv) > 1 else "demo.json").resolve()
    cfg = lib.load_config(cfg_path, "demo", "keynote-handoff")
    demo = cfg_path.parent
    rec = demo / "recordings"
    assets = rec / "exports/.keynote"
    slug = re.sub(r"[^a-z0-9]+", "-", cfg.get("title", "demo").lower()).strip("-") or "demo"
    final = rec / "exports" / f"{slug}-keynote-cut.mp4"
    if not final.exists():
        sys.exit(f"handoff: {final} missing; run build-keynote.py first")

    out = demo / "editor-handoff"
    if out.exists() or out.is_symlink():
        lib.safe_rmtree(demo, out, "editor-handoff")
    dirs = {k: out / k for k in ["01-final-cut", "02-raw-footage", "03-edited-segments",
                                 "04-graphics/title-cards", "04-graphics/captions",
                                 "04-graphics/logo", "04-graphics/layout"]}
    for d in dirs.values():
        d.mkdir(parents=True)

    copy_in(demo, final, dirs["01-final-cut"] / final.name)
    for f in ["bg.png", "shadow.png", "mask.png"]:
        shutil.copy2(PLUGIN_ASSETS / f, dirs["04-graphics/layout"] / f)
    if cfg.get("logo"):
        logo = lib.config_path(demo, cfg["logo"], "logo", "keynote-handoff")
        if not logo.is_file():
            sys.exit(f"keynote-handoff: logo not found: {logo}")
        shutil.copy2(logo, dirs["04-graphics/logo"] / logo.name)

    notes, used = {}, set()
    if (rec / "takes.csv").exists():
        notes = {Path(r["file"]).name: r for r in csv.DictReader(open(rec / "takes.csv"))}

    seq = cfg["sequence"]
    keys = [f"card-{item['card']}" if "card" in item else item["scene"] for item in seq]
    parts = [assets / "parts" / f"{i:02d}-{k}.mp4" for i, k in enumerate(keys)]
    durs = [duration(p) for p in parts]
    starts = [sum(durs[:i]) for i in range(len(durs))]
    vo = voiceover_windows(seq, keys, starts, sum(durs))

    lines, captions, t, n = [], [], 0.0, 0
    for i, item in enumerate(seq):
        key, part, d = keys[i], parts[i], durs[i]
        lib.progress("segments", i + 1, len(seq))
        copy_in(demo, part, dirs["03-edited-segments"] / part.name)
        head = f"[{tc(t)} - {tc(t + d)}]  ({d:.1f}s)"
        if "card" in item:
            copy_in(demo, assets / f"{key}.png", dirs["04-graphics/title-cards"] / f"{key}.png")
            lines += [f"{head}  TITLE CARD  {key}", f"    Title:    {item['title']}",
                      f"    Subtitle: {item.get('subtitle', '')}",
                      f"    Graphic:  04-graphics/title-cards/{key}.png"]
        else:
            n += 1
            raw_name = f"{item['stem']}-t{item.get('take', 1)}.mp4"
            dest = f"{n:02d}_{item['stem']}.mp4"
            copy_in(demo, rec / "raw" / raw_name, dirs["02-raw-footage"] / dest)
            used.add(raw_name)
            cap = assets / f"cap-{key}.png"
            if cap.exists():
                copy_in(demo, cap, dirs["04-graphics/captions"] / cap.name)
            trim = item.get("trim")
            zoom = item.get("zoom")
            captions.append(f"  {key:>4}  {item.get('caption', '')}")
            lines += [f"{head}  SCENE {key}", f"    Caption:  {item.get('caption', '')}",
                      f"    On screen: {notes.get(raw_name, {}).get('notes', '')}",
                      f"    Source:   02-raw-footage/{dest}  "
                      f"({f'{trim[0]}s-{trim[1]}s' if trim else 'full'}, {item.get('speed', 1)}x speed)",
                      f"    Motion:   {f'zoom {zoom[0]}x at ({zoom[1]},{zoom[2]}) from {zoom[3]}s' if zoom else 'slow push-in 1.05x'}",
                      f"    Graphic:  04-graphics/captions/cap-{key}.png"]
        if vo:
            lines += voiceover_lines(item, vo.get(key))
        lines.append("")
        t += d

    if vo:
        write_voiceover(out / "VOICEOVER.txt", cfg, seq, keys, vo)
    (out / "SCRIPT.txt").write_text(
        f"{cfg.get('title', 'DEMO').upper()}: EDIT SCRIPT\n"
        f"Runtime: {tc(t)}  |  1920x1080, 30fps  |  "
        f"{'Voiceover in VOICEOVER.txt, add music under it' if vo else 'No voiceover, no audio'}\n\n"
        "01-final-cut/ is the finished reference cut. Each segment is also rendered on its own in\n"
        "03-edited-segments/, and the untouched screen recordings are in 02-raw-footage/.\n"
        "Speeds and zooms below are what the reference cut uses; change freely.\n\n"
        "CAPTIONS (copy-paste list)\n" + "\n".join(captions) + "\n\n\nTIMELINE\n\n" + "\n".join(lines))

    (out / "README.txt").write_text(f"""{cfg.get('title', 'DEMO').upper()}: EDITOR HANDOFF

WHAT'S HERE
  SCRIPT.txt              Timeline with timecodes, captions, voiceover, source clip, speed and zoom
  VOICEOVER.txt           Narration for an AI voice, one timed block per line (when written)
  01-final-cut/           Finished reference cut ({tc(t)}), keynote style
  02-raw-footage/         {n} clean screen recordings in story order, 1920x1080 30fps, no overlays
  03-edited-segments/     Each segment of the reference cut rendered separately
  04-graphics/            Title cards, transparent caption PNGs, logo, layout (bg, shadow, window mask)
  takes.csv               Recording log for the takes used

STYLE (Apple keynote look)
  Font:     SF Pro Display (San Francisco). Titles semibold 600, tracking -1.5%.
            Subtitles regular 400, tracking +0.4%. Captions semibold 600, 44px, tracking -1%.
  Colours:  Text #1D1D1F, secondary text #6E6E73, background #F3F3F6
  Layout:   Footage scaled to 1600x900 at x=160 y=44, rounded corners 26px, soft drop shadow,
            caption centred below the window
  Motion:   0.4s fades through the background colour between segments; slow 1.05x push-in,
            eased (smoothstep) zooms on key moments

SECRETS
  Tokens, API keys and secret values are blurred in the footage itself. Do not sharpen or
  unblur those areas, and keep the blur if you re-crop or zoom.
""")
    if notes:
        with open(out / "takes.csv", "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=["file", "scene", "duration_s", "recorded_at", "notes"],
                                    extrasaction="ignore")
            writer.writeheader()
            writer.writerows(r for name, r in notes.items() if name in used)

    zip_path = lib.safe_make_zip(demo, demo / f"{slug}-editor-handoff", demo, "editor-handoff")
    print(f"{out}  ({tc(t)}, {n} raw clips)\n{zip_path}")
    lib.output(zip_path)


if __name__ == "__main__":
    main()
