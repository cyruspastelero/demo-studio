#!/usr/bin/env python3
"""Turn a built cut into a Cardboard timeline. Optional: only for people who finish in Cardboard.

Usage (from the demo folder, after build-handoff.py):
  python3 -I cardboard-timeline.py handoff.json [VIDEO_KEY] [--aspect 16:9]

For each video (or the one named) it reads the numbered pre-cut clips that build-handoff.py wrote to
<out>/<KEY>_<m>m<ss>/ and writes, next to them in <out>/cardboard/:
  <KEY>.timeline.tsx     the clips back to back on one video track, plus an empty Voiceover track
  <KEY>.narration.json   every voiceover line with its start time and the seconds it has to fit in

Then, with the Cardboard CLI: `cb project create <name>`, `cb source apply <name> <KEY>.timeline.tsx`,
and one `cb generate voice` per narration line. See references/cardboard.md.
Prints OUTPUT lines. Standard library only; Cardboard itself is not needed to run this script.
"""

import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ASPECTS = ("16:9", "4:3", "3:4", "9:16", "1:1", "4:5")
DEFAULT_ASPECT = "16:9"
NUMBERED_CLIP = re.compile(r"^(?!00_)\d{2,}_.+\.mp4$")
TOOL = "cardboard-timeline"


@dataclass(frozen=True)
class Clip:
    path: Path
    seconds: float


def load_sibling(name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / file_name)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look their module up here while a class is being built
    spec.loader.exec_module(module)
    return module


def number(value: float) -> str:
    """Seconds as a short literal: 4 rather than 4.0, 10.5 rather than 10.500."""
    return f"{round(value, 3):g}"


def numbered_clip_names(names: list[str]) -> list[str]:
    """The pre-cut clips in timeline order, without the rough assembly or other files."""
    return sorted(name for name in names if NUMBERED_CLIP.match(name))


def timeline_source(clips: list[Clip], aspect: str) -> str:
    """A whole timeline.tsx: every clip back to back on one track, and a Voiceover track to fill."""
    if not clips:
        raise ValueError("no clips to place")
    if aspect not in ASPECTS:
        raise ValueError(f"aspect must be one of {', '.join(ASPECTS)}, not {aspect}")
    rows, clock = [], 0.0
    for clip in clips:
        end = clock + clip.seconds
        rows.append(f'      <clip name="{clip.path.stem}" src={{{json.dumps(str(clip.path))}}} '
                    f"start={{{number(clock)}}} end={{{number(end)}}} />")
        clock = end
    return "\n".join([
        "export default (",
        f'  <timeline aspect="{aspect}">',
        '    <track kind="video" name="Demo">',
        *rows,
        "    </track>",
        '    <track kind="audio" name="Voiceover">',
        "    </track>",
        "  </timeline>",
        ");",
        "",
    ])


def narration_plan(scenes: list[str], starts: dict[str, float], lines: dict[str, str],
                   total: float, lead_in: float) -> list[dict]:
    """Each voiceover line with its start and the seconds until the next line (or the end)."""
    narrated = [scene for scene in scenes if scene in lines]
    plan = []
    for index, scene in enumerate(narrated):
        start = starts[scene] + lead_in
        limit = starts[narrated[index + 1]] if index + 1 < len(narrated) else total
        plan.append({"line": index + 1, "scene": scene, "start": round(start, 2),
                     "window": round(limit - start, 2), "text": lines[scene]})
    return plan


def built_folder(out: Path, key: str) -> Path:
    folders = sorted(path for path in out.glob(f"{key}_*") if path.is_dir())
    if not folders:
        sys.exit(f"{TOOL}: no built clips for {key} in {out}. Run build-handoff.py first.")
    return folders[-1]


def main(argv: list[str]) -> None:
    args = [a for a in argv[1:] if not a.startswith("--")]
    aspect = DEFAULT_ASPECT
    if "--aspect" in argv:
        position = argv.index("--aspect")
        if position + 1 >= len(argv):
            sys.exit(f"{TOOL}: --aspect needs a value, one of {', '.join(ASPECTS)}")
        aspect = argv[position + 1]
        args = [a for a in args if a != aspect]
    lib = load_sibling("demolib", "demolib.py")
    handoff = load_sibling("build_handoff", "build-handoff.py")
    cfg_path = Path(args[0] if args else "handoff.json").resolve()
    cfg = lib.load_config(cfg_path, "handoff", TOOL)
    lib.require("ffprobe")
    out = (cfg_path.parent / cfg.get("paths", {}).get("out", "recordings/editor-handoff")).resolve()
    videos = handoff.build_videos(cfg)
    wanted = args[1] if len(args) > 1 else None
    if wanted and wanted not in {video.key for video in videos}:
        sys.exit(f"{TOOL}: no video '{wanted}' in {cfg_path.name} (have {', '.join(v.key for v in videos)})")
    lead_in = cfg.get("voice", {}).get("lead_in", handoff.DEFAULT_LEAD_IN)
    target = out / "cardboard"
    target.mkdir(parents=True, exist_ok=True)
    for video in videos:
        if wanted and video.key != wanted:
            continue
        folder = built_folder(out, video.key)
        names = numbered_clip_names([path.name for path in folder.iterdir()])
        clips = [Clip(folder / name, lib.duration(folder / name)) for name in names]
        try:
            source = timeline_source(clips, aspect)
        except ValueError as error:
            sys.exit(f"{TOOL}: {video.key}: {error}")
        timeline_file = target / f"{video.key}.timeline.tsx"
        timeline_file.write_text(source)
        total = sum(clip.seconds for clip in clips)
        plan = narration_plan(list(video.scenes), handoff.scene_starts(video), video.voiceover, total, lead_in)
        plan_file = target / f"{video.key}.narration.json"
        plan_file.write_text(json.dumps(plan, indent=2) + "\n")
        print(f"{video.key}: {len(clips)} clips, {total:.1f}s, {len(plan)} narration lines", flush=True)
        lib.output(timeline_file)
        lib.output(plan_file)


if __name__ == "__main__":
    main(sys.argv)
