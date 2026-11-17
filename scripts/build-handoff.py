#!/usr/bin/env python3
"""Builds the editor handoff (for example a promo and a how-to) from raw takes and handoff.json.

For each video: cuts every shot to its in/out points and speed, numbers the clips in timeline
order, uses the title-card placeholders, joins a rough assembly, writes the script and voiceover
files with timecodes, checks that each voiceover line fits before the next one starts (macOS `say`,
or a words-per-minute estimate elsewhere), and renders a timing preview with a placeholder voice.
Also copies the uncut takes into source-footage/ grouped by story part with a contact sheet per
take in reference/, writes 1-READ-ME-FIRST.txt and assets/brand/BRAND.txt, renders the social
versions listed in handoff.json, and zips the folder.

Usage: build-handoff.py [handoff.json] [--no-say] [--no-social] [--no-zip]
Prints PROGRESS <stage> <done>/<total> lines and OUTPUT <path> lines for tools that stream them.
"""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass, replace
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()
FPS = 30
DEFAULT_RATE = 165  # words per minute for the timing check; the AI voice should be close to this
DEFAULT_LEAD_IN = 0.3  # seconds into a scene before its line starts


@dataclass(frozen=True)
class Shot:
    scene: str          # scene label "N Name", for the script
    source: str         # raw take file name, or a card name in the cards folder
    start: float        # in point (seconds); ignored for cards
    end: float          # out point (seconds), or the card's length
    speed: float        # 1.0 is real time
    screen: str         # what's on screen
    text: str = ""      # on-screen text the editor adds

    @property
    def is_card(self) -> bool:
        return self.source.startswith("card-")

    @property
    def length(self) -> float:
        return self.end if self.is_card else (self.end - self.start) / self.speed


@dataclass(frozen=True)
class Video:
    key: str
    title: str
    label: str
    script_file: str
    voiceover_file: str
    shots: tuple[Shot, ...]
    voiceover: dict[str, str]    # scene label -> the line read over it (scenes with a line only)
    scenes: tuple[str, ...]      # every scene label in order


@dataclass(frozen=True)
class Paths:
    root: Path
    raw: Path
    out: Path
    cards: Path

    @property
    def reference(self) -> Path:
        return self.out / "reference"


# ---------------------------------------------------------------- config -> model

def resolve_shot(spec: dict, named: dict, label: str) -> Shot:
    if "card" in spec:
        return Shot(label, spec["card"], 0, spec["length"], 1,
                    spec.get("screen", "Title card placeholder"), spec.get("text", ""))
    base = named.get(spec["ref"]) if "ref" in spec else spec
    if base is None:
        sys.exit(f"build-handoff: scene '{label}' uses unknown shot ref '{spec['ref']}'")
    merged = {**base, **{k: v for k, v in spec.items() if k != "ref"}}
    shot = Shot(label, merged["source"], merged["in"], merged["out"], merged.get("speed", 1),
                merged.get("screen", ""), merged.get("text", ""))
    if shot.end <= shot.start:
        sys.exit(f"build-handoff: scene '{label}': out ({shot.end}) must be after in ({shot.start})")
    return shot


def build_videos(cfg: dict) -> list[Video]:
    named = cfg.get("shots", {})
    videos = []
    for index, spec in enumerate(cfg["videos"]):
        labels, shots, voiceover = [], [], {}
        for number, scene in enumerate(spec["scenes"], start=1):
            label = f"{number} {scene['name']}"
            labels.append(label)
            shots += [resolve_shot(s, named, label) for s in scene["shots"]]
            if scene.get("voiceover"):
                voiceover[label] = scene["voiceover"]
        key = spec["key"]
        videos.append(Video(
            key=key,
            title=spec.get("title", f"{cfg['title'].upper()}: {key}"),
            label=spec.get("label", ""),
            script_file=spec.get("script_file", f"{2 + 2 * index}-{key}-SCRIPT.txt"),
            voiceover_file=spec.get("voiceover_file", f"{3 + 2 * index}-{key}-VOICEOVER.txt"),
            shots=tuple(shots), voiceover=voiceover, scenes=tuple(labels)))
    return videos


def shot_input(shot: Shot, paths: Paths) -> Path:
    """The card PNG or raw take a shot is cut from, confined to its folder."""
    if shot.is_card:
        return lib.config_path(paths.cards, f"{shot.source}.png", f"scene '{shot.scene}' card", "build-handoff")
    return lib.config_path(paths.raw, shot.source, f"scene '{shot.scene}' source", "build-handoff")


def check_sources(videos: list[Video], paths: Paths) -> None:
    missing = set()
    for video in videos:
        for shot in video.shots:
            source = shot_input(shot, paths)
            if not source.exists():
                missing.add(str(source))
    if missing:
        sys.exit("build-handoff: missing inputs (render cards with scripts/title-cards.mjs):\n  "
                 + "\n  ".join(sorted(missing)))


# ---------------------------------------------------------------- cutting

def timecode(seconds: float) -> str:
    return f"{int(seconds // 60)}:{seconds % 60:04.1f}"


def cut(shot: Shot, target: Path, paths: Paths) -> None:
    encode = ["-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-an", str(target)]
    if shot.is_card:
        lib.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{shot.end}",
                 "-i", shot_input(shot, paths), "-vf", "scale=1920:1080", *encode])
        return
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{shot.start}", "-to", f"{shot.end}",
             "-i", shot_input(shot, paths), "-vf", f"setpts=PTS/{shot.speed},scale=1920:1080", *encode])


def scene_starts(video: Video) -> dict[str, float]:
    starts: dict[str, float] = {}
    clock = 0.0
    for shot in video.shots:
        starts.setdefault(shot.scene, clock)
        clock += shot.length
    return starts


def spoken_length(text: str, workdir: Path, name: str, voice: dict, use_say: bool) -> tuple[float, Path | None]:
    rate = voice.get("rate_wpm", DEFAULT_RATE)
    if not use_say:
        return len(text.split()) / rate * 60, None
    audio = workdir / f"{name}.aiff"
    cmd = ["say", "-r", str(rate), "-o", str(audio)]
    if voice.get("say_voice"):
        cmd += ["-v", voice["say_voice"]]
    lib.run([*cmd, text], "say")
    return lib.duration(audio), audio


def slug_of(label: str) -> str:
    return lib.slugify(label.split(" ", 1)[1].replace("'", ""))


def build(video: Video, paths: Paths, voice: dict, use_say: bool) -> tuple[list[str], Path]:
    """Cuts one video's clips, rough assembly and voiceover preview. Returns voiceover problems."""
    total = sum(shot.length for shot in video.shots)
    folder = paths.out / f"{video.key}_{int(total // 60)}m{int(total % 60):02d}"
    for old in paths.out.glob(f"{video.key}_*"):
        lib.safe_rmtree(paths.out, old, f"old {video.key} folder")
    folder.mkdir(parents=True)

    clips = []
    for number, shot in enumerate(video.shots, start=1):
        clip = folder / f"{number:02d}_scene{shot.scene.split()[0]}_{slug_of(shot.scene)}.mp4"
        cut(shot, clip, paths)
        clips.append(clip)
        lib.progress(f"cut-{video.key}", number, len(video.shots))

    starts = scene_starts(video)
    narrated = [s for s in video.scenes if s in video.voiceover]
    problems = [f"{video.key}: no voiceover for scene {s}" for s in video.scenes if s not in video.voiceover]
    lines = []
    lead_in = voice.get("lead_in", DEFAULT_LEAD_IN)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        listing = work / "clips.txt"
        listing.write_text(lib.concat_list(clips))
        rough = folder / "00_ROUGH-ASSEMBLY.mp4"
        lib.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", rough])
        lib.output(rough)

        audio = []
        for index, name in enumerate(narrated):
            start = starts[name] + lead_in
            limit = (starts[narrated[index + 1]] if index + 1 < len(narrated) else total) - start
            seconds, file = spoken_length(video.voiceover[name], work, f"vo{index}", voice, use_say)
            if seconds > limit:
                problems.append(f"{video.key} line {index + 1} ({name}) runs {seconds:.1f}s but has {limit:.1f}s")
            lines.append((index + 1, start, name, video.voiceover[name]))
            if file:
                audio.append((start, file))
            lib.progress(f"voiceover-{video.key}", index + 1, len(narrated))

        if audio:
            # Timing preview: the rough assembly with a placeholder voice at each line's start.
            preview = paths.reference / f"{video.key}-VOICEOVER-TIMING-PREVIEW.mp4"
            inputs = [arg for _, file in audio for arg in ("-i", str(file))]
            delays = "".join(f"[{i + 1}:a]adelay={int(start * 1000)}|{int(start * 1000)}[a{i}];"
                             for i, (start, _) in enumerate(audio))
            mix = "".join(f"[a{i}]" for i in range(len(audio))) + f"amix=inputs={len(audio)}:normalize=0[out]"
            lib.run(["ffmpeg", "-y", "-loglevel", "error", "-i", rough, *inputs, "-filter_complex", delays + mix,
                     "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-shortest", preview])
            lib.output(preview)

    write_script(video, folder, total, paths)
    write_voiceover(video, lines, total, paths, bool(audio))
    print(f"{folder.name}: {len(clips)} clips, {timecode(total)}", flush=True)
    return problems, folder


# ---------------------------------------------------------------- source footage

def clone_copy(src: Path, dest: Path) -> None:
    # APFS clone on macOS costs no disk; plain copy elsewhere.
    if sys.platform == "darwin" and subprocess.run(["cp", "-c", str(src), str(dest)], capture_output=True).returncode == 0:
        return
    shutil.copy2(src, dest)


def copy_source_footage(cfg: dict, paths: Paths) -> None:
    source = paths.out / "source-footage"
    if source.exists() or source.is_symlink():
        lib.safe_rmtree(paths.out, source, "source-footage")
    groups = cfg.get("parts") or {"all-takes": [""]}
    sheets = paths.reference / "take-contact-sheets"
    sheets.mkdir(parents=True, exist_ok=True)
    takes = lib.inside_only(paths.root, sorted(paths.raw.glob("*.mp4")), "build-handoff")
    for done, (group, patterns) in enumerate(groups.items(), start=1):
        source.mkdir(parents=True, exist_ok=True)
        part = lib.config_path(source, group, f"parts.{group}", "build-handoff")
        part.mkdir(parents=True)
        matched = [t for t in takes if any(t.name == p or t.name.startswith(p) for p in patterns)]
        if not matched:
            print(f"build-handoff: WARN part '{group}' matched no takes in {paths.raw}", file=sys.stderr)
        for take in matched:
            clone_copy(take, part / take.name)
            lib.run(["ffmpeg", "-y", "-loglevel", "error", "-i", take, "-vf", "fps=1/2,scale=480:-1,tile=6x4",
                     "-frames:v", "1", sheets / f"{take.stem}.jpg"])
        lib.progress("source-footage", done, len(groups))


# ---------------------------------------------------------------- text files

def write_script(video: Video, folder: Path, total: float, paths: Paths) -> None:
    out, clock, current = [], 0.0, None
    out.append(f"{video.title} SCRIPT ({timecode(total)})\n{'=' * 72}\n")
    out.append(f"Clips are in {folder.name}/, numbered in timeline order. 00_ROUGH-ASSEMBLY.mp4 is all of them joined.\n")
    for number, shot in enumerate(video.shots, start=1):
        if shot.scene != current:
            current = shot.scene
            line = video.voiceover.get(shot.scene, "(none)")
            out.append(f"\nSCENE {shot.scene.upper()}\n  VOICEOVER: {line}\n  SHOTS:")
        speed = "" if shot.speed == 1 or shot.is_card else f", {shot.speed}x speed"
        out.append(f"    {timecode(clock)}  clip {number:02d}{speed}: {shot.screen}")
        if shot.text:
            out.append(f"           ON-SCREEN TEXT: {shot.text}")
        clock += shot.length
    target = lib.config_path(paths.out, video.script_file, f"videos[{video.key}].script_file", "build-handoff")
    target.write_text("\n".join(out) + "\n")


def write_voiceover(video: Video, lines: list, total: float, paths: Paths, has_preview: bool) -> None:
    preview = (f"reference/{video.key}-VOICEOVER-TIMING-PREVIEW.mp4 has every line placed with a placeholder voice."
               if has_preview else "No timing preview (macOS `say` was not available); times are estimates.")
    out = [f"{video.title} VOICEOVER ({timecode(total)})", "=" * 72,
           "Generate each numbered line as its own clip and start it at the time shown. Each line ends",
           "before the next one starts at a natural pace (about 160 words per minute).", preview, ""]
    for number, start, name, text in lines:
        out += [f"{number:2d}. [{timecode(start)}]  {name.split(' ', 1)[1]}", f"      {text}", ""]
    out += ["=" * 72, "FULL READ (all lines in order, for a single take)", "=" * 72,
            " ".join(text for *_, text in lines)]
    target = lib.config_path(paths.out, video.voiceover_file, f"videos[{video.key}].voiceover_file", "build-handoff")
    target.write_text("\n".join(out) + "\n")


def bullet_block(heading: str, items: list[str], mark: str = "-") -> list[str]:
    if not items:
        return []
    out = [heading]
    for item in items:
        out += textwrap.wrap(item, 72, initial_indent=f"  {mark} ", subsequent_indent=" " * (len(mark) + 3))
    return out + [""]


def write_readme(cfg: dict, videos: list[Video], folders: dict[str, Path], paths: Paths) -> None:
    brief = cfg.get("brief", {})
    rule = "=" * 73
    out = [f"{cfg['title'].upper()}: EDITOR BRIEF", rule, ""]
    out.append(f"{len(videos)} video(s) from one shoot:")
    for video in videos:
        out.append(f"  {video.key:<10}{folders[video.key].name.split('_', 1)[1].replace('m', ':', 1):>6}  {video.label}")
    out.append("")
    if brief.get("summary"):
        out += textwrap.wrap(brief["summary"], 73) + [""]
    if brief.get("style_reference"):
        out += textwrap.wrap(f"Keep this look: {brief['style_reference']}", 73) + [""]
    if brief.get("people"):
        out.append("WHO IS IN IT")
        out += [f"  {p['name']:<16}{p['role']}" for p in brief["people"]] + [""]
    if brief.get("glossary"):
        out.append("Words used here")
        out += [f"  {g['term']:<16}{g['meaning']}" for g in brief["glossary"]] + [""]
    scripts = ", ".join(v.script_file for v in videos)
    voices = " and ".join(v.voiceover_file for v in videos)
    out += ["HOW TO EDIT (same steps for each video)",
            "  1. Watch the rough assembly: <VIDEO>_<length>/00_ROUGH-ASSEMBLY.mp4. It is",
            "     every clip joined in order.",
            *textwrap.wrap(f"2. Follow the script ({scripts}). The numbered clips are already trimmed and "
                           "sped up; the script gives each clip's start time and its on-screen text.",
                           70, initial_indent="  ", subsequent_indent="     "),
            *textwrap.wrap(f"3. Generate the voice from {voices}, one clip per numbered line, starting at the "
                           "time shown. The timing previews in reference/ place every line with a placeholder voice.",
                           70, initial_indent="  ", subsequent_indent="     "),
            "  4. Replace the card clips (card-*.png in assets/title-cards/) with",
            "     designed cards. The text on them is final.", ""]
    out += bullet_block("EDIT NOTES", brief.get("edit_notes", []))
    out += bullet_block("FIXES (please do these)", brief.get("fixes", []))
    out += bullet_block("DO NOT SAY", brief.get("do_not_say", []))
    out += ["FOLDERS"]
    out += [f"  {f.name + '/':<20}{v.key} clips in timeline order, plus the rough assembly" for v in videos for f in [folders[v.key]]]
    out += ["  source-footage/     every uncut take, grouped by story part",
            "  assets/             title cards, brand sheet, logo",
            "  reference/          voiceover timing previews, contact sheets, review reel"]
    if cfg.get("social"):
        out.append("  social/             vertical versions (4:5, 9:16) for feeds")
    out += ["", *bullet_block("CLAIMS CHECKLIST (each one is shown in the footage)", brief.get("claims", []), "[x]"),
            "SECRETS",
            "  Tokens, keys and private values are blurred in the footage itself. Do not",
            "  sharpen or unblur those areas, and keep the blur if you re-crop or zoom."]
    (paths.out / "1-READ-ME-FIRST.txt").write_text("\n".join(out) + "\n")


def write_brand(cfg: dict, paths: Paths) -> None:
    brand = cfg.get("brand")
    if not brand:
        return
    folder = paths.out / "assets" / "brand"
    folder.mkdir(parents=True, exist_ok=True)
    out = [f"{cfg['title'].upper()}: BRAND SHEET", "=" * 73, ""]
    out += bullet_block("NAMES (spell them exactly like this)", brand.get("spelling", []))
    colours = [(k, brand[k]) for k in ("background", "title_color", "subtitle_color", "accent") if k in brand]
    if colours:
        out += ["COLORS", *[f"  {k.replace('_', ' '):<16}{v}" for k, v in colours], ""]
    if brand.get("font"):
        out += ["FONTS", f"  {brand['font']}", ""]
    out += bullet_block("TAGLINES (use only these)", [f'"{t}"' for t in brand.get("taglines", [])])
    (folder / "BRAND.txt").write_text("\n".join(out) + "\n")
    if brand.get("logo"):
        logo = lib.config_path(paths.root, brand["logo"], "brand.logo", "build-handoff")
        if not logo.exists():
            sys.exit(f"build-handoff: brand.logo not found: {logo}")
        (paths.out / "assets" / "logos").mkdir(parents=True, exist_ok=True)
        shutil.copy2(logo, paths.out / "assets" / "logos" / logo.name)


def copy_reference_files(cfg: dict, paths: Paths) -> None:
    for index, name in enumerate(cfg.get("reference_files", [])):
        src = lib.config_path(paths.root, name, f"reference_files[{index}]", "build-handoff")
        if not src.exists():
            sys.exit(f"build-handoff: reference file not found: {src}")
        clone_copy(src, paths.reference / src.name)


def run_social(cfg_path: Path) -> None:
    script = Path(__file__).resolve().parent / "social-cut.py"
    result = subprocess.run([sys.executable, "-I", str(script), str(cfg_path)])
    if result.returncode:
        sys.exit("build-handoff: social versions failed (see above)")


# ---------------------------------------------------------------- main

def config_paths(cfg_path: Path, cfg: dict) -> Paths:
    """paths.* from handoff.json, each confined to the demo folder. out must be a subfolder,
    because old cuts inside it are deleted and the zip is written next to it."""
    root = cfg_path.parent.resolve()
    conf = cfg.get("paths", {})
    out = lib.config_path(root, conf.get("out", "recordings/editor-handoff"), "paths.out", "build-handoff")
    if out == root:
        sys.exit("build-handoff: paths.out must be a subfolder of the demo folder, not the folder itself")
    raw = lib.config_path(root, conf.get("raw", "recordings/raw"), "paths.raw", "build-handoff")
    cards = (lib.config_path(root, conf["cards"], "paths.cards", "build-handoff") if "cards" in conf
             else out / "assets" / "title-cards")
    return Paths(root=root, raw=raw, out=out, cards=cards)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    unknown = flags - {"--no-say", "--no-social", "--no-zip"}
    if unknown:
        sys.exit(f"build-handoff: unknown option(s) {', '.join(sorted(unknown))}")
    cfg_path = Path(args[0] if args else "handoff.json").resolve()
    cfg = lib.load_config(cfg_path, "handoff", "build-handoff")
    lib.require("ffmpeg", "ffprobe")
    use_say = "--no-say" not in flags and shutil.which("say") is not None
    if not use_say:
        print("build-handoff: macOS `say` not used; voiceover fit is estimated from words per minute", flush=True)

    paths = config_paths(cfg_path, cfg)
    try:
        lib.refuse_symlinks_under(paths.out, "build-handoff output")
    except lib.UnsafePath as error:
        sys.exit(f"build-handoff: {error}")
    videos = build_videos(cfg)
    check_sources(videos, paths)
    paths.reference.mkdir(parents=True, exist_ok=True)

    problems, folders = [], {}
    for video in videos:
        found, folder = build(video, paths, cfg.get("voice", {}), use_say)
        problems += found
        folders[video.key] = folder
    copy_source_footage(cfg, paths)
    copy_reference_files(cfg, paths)
    write_brand(cfg, paths)
    write_readme(cfg, videos, folders, paths)
    if cfg.get("social") and "--no-social" not in flags:
        run_social(cfg_path)

    if "--no-zip" not in flags:
        zip_base = paths.out.parent / f"{lib.slugify(cfg['title'])}-editor-handoff"
        lib.progress("zip", 0, 1)
        zip_path = shutil.make_archive(str(zip_base), "zip", paths.out.parent, paths.out.name)
        lib.progress("zip", 1, 1)
        lib.output(zip_path)
    lib.output(paths.out)
    print("voiceover fits" if not problems else "VOICEOVER PROBLEMS: " + "; ".join(problems), flush=True)


if __name__ == "__main__":
    main()
