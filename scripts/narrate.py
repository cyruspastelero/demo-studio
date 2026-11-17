#!/usr/bin/env python3
"""Narrates the keynote cut: renders each `voiceover` line in demo.json, places it where its item
starts in the cut (plus voice.lead_in), checks that every line ends before the next voiced item,
optionally ducks a music bed under the speech, normalises loudness to about -16 LUFS and muxes the
result onto the cut as AAC. The video stream is copied, not re-encoded.

Usage (from the demo dir, after build-keynote.py):
  narrate.py [demo.json] [--voice say|elevenlabs|files] [--music PATH] [--allow-overrun] [--dry-run]
  narrate.py [demo.json] --export-lines

--export-lines writes voiceover/lines.json (one entry per voiced line with its target file
voiceover/NN.mp3, start, time budget and word budget) plus voiceover/README.txt and music/README.txt.
That is the route for voice tools this script does not call itself, such as the ElevenLabs or
Higgsfield MCP servers: make each NN.mp3 there, then run with --voice files.

Output: recordings/exports/<slug>-keynote-cut-narrated.mp4. Prints PROGRESS and OUTPUT lines.
Timing comes from recordings/exports/<slug>-keynote-cut.timing.json, written by build-keynote.py.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess  # noqa: F401  (tests patch narrate.subprocess.run)
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # the narration package sits next to this file

from narration.core import *  # noqa: E402,F401,F403
from narration.core import (ESTIMATE, KEY_ENV, KEY_FIX, KEYCHAIN_ENV, KEYCHAIN_EXAMPLE, MUSIC_DIR,  # noqa: E402
                            MUSIC_TARGET, PROVIDERS, REBUILD, SCRIPTS, SERVICE_NAME, VOICE_DIR, Context,
                            ItemTiming, NarrateError, Voice, lib)
from narration.mix import *  # noqa: E402,F401,F403
from narration.mix import ebur128, is_placeholder_bed, loudness_report, mux  # noqa: E402
from narration import core as narration_core  # noqa: E402
from narration.core import OUTRO_FADE  # noqa: E402
from narration.providers import *  # noqa: E402,F401,F403
from narration.providers import (check_voice_files, find_api_key, has_voice_files, keychain_service,  # noqa: E402
                                 select_provider, speak)
from narration.report import *  # noqa: E402,F401,F403
from narration.report import format_table, lines_manifest, overrun_advice, write_exports  # noqa: E402
from narration.timing import *  # noqa: E402,F401,F403
from narration.timing import derive_timing, load_timing, plan_lines, timing_outro  # noqa: E402


def export_lines(manifest: dict, demo_dir: Path, args: argparse.Namespace) -> int:
    written = write_exports(manifest, demo_dir, base_command(args))
    for line in manifest["lines"]:
        print(f"  {line['file']}  {line['budget']:>5.1f}s  ~{line['suggested_words']:>2} words  {line['text']}")
    print("\n".join(f"wrote {path}" for path in written))
    print(f"Next: make each file listed above (see {VOICE_DIR}/README.txt), then render:\n"
          f"  {base_command(args)} --voice files")
    return 0


# ---------------------------------------------------------------- main

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="narrate.py", description="Add a finished voiceover (and optional music) to the keynote cut. "
        "Run it from the demo folder after build-keynote.py.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""examples:
  # 1. check every line fits its slot first (renders no video, spends no credits)
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --dry-run
  # 2. free macOS voice plus a music bed (compose_music or your own track) ducked under the speech
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --voice say --music music/bed.m4a
  # 3. ElevenLabs with an API key (the key stays in your shell, never in a file)
  export {KEY_ENV}=your-key-here
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --voice elevenlabs
  # 4. same, with the key kept in the macOS Keychain instead
  security add-generic-password -a "$USER" -s {KEYCHAIN_EXAMPLE} -w
  export {KEYCHAIN_ENV}={KEYCHAIN_EXAMPLE}
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --voice elevenlabs
  # 5. any other voice tool (ElevenLabs MCP, Higgsfield MCP, your own mic): list the lines,
  #    save line N as voiceover/NN.mp3, then render from those files
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --export-lines
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --voice files

output: recordings/exports/<slug>-keynote-cut-narrated.mp4

voices:
  say         macOS built-in voice, free. Default on a Mac.
  elevenlabs  needs {KEY_ENV} in the environment, or a macOS Keychain item named by
              {KEYCHAIN_ENV} (or voice.elevenlabs.keychain_service). Never put the key in a
              file. Rendered lines are cached in recordings/voice-cache/, so re-runs never spend
              credits twice.
  files       ready-made audio: voiceover/01.mp3, voiceover/02.wav, ... next to demo.json,
              numbered 1, 2, 3 in the order of the voiced items (.wav, .mp3 or .m4a). Made by
              you, or by an MCP voice tool from voiceover/lines.json (--export-lines).
Default: files when voiceover/ has them, else elevenlabs when a key is found, else say.

music: --music or voice.music (for example music/bed.m4a). Make it with the ElevenLabs MCP
compose_music (instrumental), or use your own licensed track. make-bed.py only makes a placeholder
(narrate.py warns while it is in use). The bed is set voice.music_gap_db (13) under the narration,
held 7 dB lower under each spoken line (no pumping), dipped at voice.music_dips and faded
(voice.music_fade_in, voice.music_fade_out); the mix lands at -14 LUFS, true peak under -1 dBTP.
--export-lines also writes music/README.txt.""")
    parser.add_argument("config", nargs="?", default="demo.json")
    parser.add_argument("--voice", choices=PROVIDERS, help="voice provider (overrides voice.provider)")
    parser.add_argument("--music", help="music bed file (overrides voice.music)")
    parser.add_argument("--allow-overrun", action="store_true", help="mux even when a line runs long")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the line table only; no final video, no ElevenLabs calls")
    parser.add_argument("--export-lines", action="store_true",
                        help="write voiceover/lines.json and READMEs for MCP voice and music tools, then stop")
    return parser.parse_args(argv)


def resolve_music(cli: str | None, configured: str, demo_dir: Path) -> Path | None:
    """--music is typed by the user, so any path is fine. voice.music comes from demo.json, which may
    be someone else's, so it must stay inside the demo folder."""
    path = None
    if cli:
        path = Path(cli).resolve()
    elif configured:
        try:
            path = lib.safe_join(demo_dir, configured, "voice.music")
        except lib.UnsafePath as error:
            raise NarrateError(str(error), ("Move the music file into the demo folder and point voice.music at it,",
                                            f"for example {MUSIC_TARGET}. Then:", "{cmd}")) from error
    if path and not path.is_file():
        where = "--music is relative to where you run the command" if cli else \
            "voice.music in demo.json is relative to the demo folder"
        fixes = ("Fix the path, or narrate without music:", "{cmd}") if cli else (
            f"Save the bed as {MUSIC_TARGET} (ways to get one: {MUSIC_DIR}/README.txt, written by --export-lines),",
            "or remove voice.music from {config} to narrate without music. Then:", "{cmd}")
        raise NarrateError(f"music file not found: {path} ({where})", fixes)
    return path


def timeline(cfg: dict, cut: Path, raw_dir: Path, rebuild: str) -> tuple[list[ItemTiming], float]:
    timing_file = cut.with_suffix(".timing.json")
    if timing_file.exists():
        return load_timing(timing_file, cfg["sequence"])
    print(f"narrate: no {timing_file.name}; deriving timing from demo.json. For measured timing, "
          f"rebuild the cut first:\n  {rebuild}", flush=True)
    return derive_timing(cfg["sequence"], raw_dir, lib.duration), lib.duration(cut)


def choose_provider(args: argparse.Namespace, voice: Voice, files_dir: Path) -> tuple[str, str]:
    """(provider, ElevenLabs key or ""). The Keychain is read only when ElevenLabs could be picked."""
    choice = args.voice or voice.provider
    has_files = has_voice_files(files_dir)
    key, problem = "", ""
    if choice == "elevenlabs" or (choice is None and not has_files):
        key, problem = find_api_key(voice, os.environ, explicit=args.voice == "elevenlabs")
    try:
        if choice == "elevenlabs" and not key and problem and not args.dry_run:
            service = keychain_service(voice, os.environ, explicit=args.voice == "elevenlabs")
            raise NarrateError(f"provider 'elevenlabs' found no {KEY_ENV} and {problem}",
                               (f'Store the key (it asks for it): security add-generic-password -a "$USER" -s '
                                f"{shlex.quote(service) if SERVICE_NAME.fullmatch(service) else KEYCHAIN_EXAMPLE} -w",
                                f"Or set it for this shell only: {KEY_FIX}",
                                "Then: {cmd} --voice elevenlabs"))
        return select_provider(args.voice, voice.provider, bool(key),
                               shutil.which("say") is not None, has_files), key
    except NarrateError:
        if args.dry_run and not args.voice and voice.provider is None:
            return ESTIMATE, key
        if args.dry_run and choice == "elevenlabs":
            return "elevenlabs", key  # dry run: cached lines are measured, the rest estimated
        raise


def use_template_audio(cut: Path) -> None:
    """The build's look template may set its own loudness targets; they are in plan.json `look.audio`."""
    plan = cut.with_suffix(".plan.json")
    try:
        data = json.loads(plan.read_text()) if plan.is_file() else {}
    except json.JSONDecodeError:
        return
    if data.get("template"):
        narration_core.use_audio((data.get("look") or {}).get("audio"))
        print(f"narrate: audio targets from template {data['template']}: "
              f"{narration_core.TARGET_LUFS} LUFS, true peak <= {narration_core.TRUE_PEAK_BAR} dBTP", flush=True)


def narrate(args: argparse.Namespace) -> int:
    cfg_path = Path(args.config).resolve()
    cfg = lib.load_config(cfg_path, "demo", "narrate")
    demo_dir = cfg_path.parent
    rec = demo_dir / "recordings"
    use_template_audio(rec / "exports" / f"{lib.slugify(cfg['title'])}-keynote-cut.mp4")  # before Voice reads the gap
    voice = Voice.from_config(cfg.get("voice", {}))
    cut = rec / "exports" / f"{lib.slugify(cfg['title'])}-keynote-cut.mp4"
    if not cut.exists():
        raise NarrateError(f"the keynote cut {cut} does not exist yet. Build it first, then narrate:",
                           (REBUILD, "{cmd}"))
    timings, total = timeline(cfg, cut, rec / "raw", keynote_command(args))
    outro = timing_outro(cut.with_suffix(".timing.json"))
    lines = plan_lines(cfg["sequence"], timings, total - outro, voice.lead_in)
    if not lines:
        raise NarrateError(f"{cfg_path.name} has no voiceover lines, so there is nothing to narrate",
                           ('Add "voiceover": "What to say over this part." to the sequence items in {config}',
                            "Check the timing: {cmd} --dry-run", "Then: {cmd}"))
    if args.export_lines:
        return export_lines(lines_manifest(lines, cfg["sequence"], total, voice.rate_wpm, cfg["title"]),
                            demo_dir, args)
    files_dir = demo_dir / VOICE_DIR
    provider, api_key = choose_provider(args, voice, files_dir)
    if provider == "files" and not args.dry_run:
        check_voice_files(lines, files_dir)
    music = resolve_music(args.music, voice.music, demo_dir)
    lib.require("ffmpeg", "ffprobe")
    for folder, what in ((rec / "voice-cache", "recordings/voice-cache"), (rec / "exports", "recordings/exports")):
        lib.refuse_symlinks_under(folder, what)  # a planted link must not redirect a write
    ctx = Context(provider, voice, rec / "voice-cache", files_dir, args.dry_run, api_key)
    print(f"narrate: voice {provider}, {len(lines)} line(s), cut {total:.1f}s", flush=True)

    spoken = []
    for line in lines:
        spoken.append(speak(line, ctx))
        lib.progress("voice", line.number, len(lines))
    print(format_table(spoken), flush=True)
    advice = overrun_advice(spoken, voice.rate_wpm)
    if advice:
        report_overrun(advice, args)
        if not args.allow_overrun:
            return 1
    if args.dry_run:
        print("narrate: dry run, no video written. " + ("Every line fits." if not advice else
                                                         "Some lines overlap the next one (allowed)."))
        print(f"Next, render the narrated video:\n  {command_for(args)}" + (" --allow-overrun" if advice else ""))
        return 0
    out = cut.with_name(f"{cut.stem}-narrated.mp4")
    tail = narration_core.SILENT_TAIL if outro else 0.0
    fade_out = OUTRO_FADE if outro and not voice.fade_out_set else None
    mux(cut, spoken, total, music, voice, out, tail=tail, fade_out=fade_out)
    if not music:
        print("narrate: no music bed. The quality bar wants one under the narration (A6). Make one with the\n"
              f"  ElevenLabs MCP compose_music (instrumental, music_length_ms {(int(total) + 2) * 1000}) or use your own\n"
              f"  licensed track, save it as {MUSIC_TARGET}, set \"voice\": {{\"music\": \"{MUSIC_TARGET}\"}} in\n"
              f"  {args.config} and run again. Ways to get one: {MUSIC_DIR}/README.txt (--export-lines).", flush=True)
    elif is_placeholder_bed(music):
        print(f"narrate: WARN placeholder bed, replace before sharing: {music.name} was made by make-bed.py.\n"
              "  Make the real bed with the ElevenLabs MCP compose_music (instrumental) or use your own licensed\n"
              f"  track, save it over {MUSIC_TARGET} and run again.", file=sys.stderr, flush=True)
    write_atomic(out.with_suffix(".voice.json"), (json.dumps({  # for check-cut.py: where narration is
        "total": round(total, 3), "outro": outro,
        "dips": [{"at": a, "dur": d} for a, d in voice.music_dips],
        "lines": [{"start": round(x.line.start, 3), "end": round(x.line.start + x.seconds, 3)} for x in spoken]},
        indent=2) + "\n").encode())
    levels = ebur128(out)
    print(f"loudness: I {levels['I']:.1f} LUFS, true peak {levels['TP']:.1f} dBTP, LRA {levels['LRA']:.1f} LU", flush=True)
    for problem in loudness_report(levels):
        print(f"narrate: WARN {problem}", file=sys.stderr, flush=True)
    print(f"\nDone. Narrated video ({lib.duration(out):.1f}s): {out}")
    print(f"Watch it:\n  {'open' if sys.platform == 'darwin' else 'xdg-open'} {shlex.quote(str(out))}")
    lib.output(out)
    return 0


def report_overrun(advice: list[str], args: argparse.Namespace) -> None:
    keynote = keynote_command(args)
    print("\nnarrate: these lines run into the next voiced part:\n  " + "\n  ".join(advice)
          + "\nFix each one in one of three ways:"
          + "\n  1. Cut words from that line's \"voiceover\" in demo.json (about 2.5 words a second)."
          + "\n  2. Give it more time: lower \"speed\" or widen \"trim\" on the scenes it plays over, or raise"
          + "\n     a card's \"duration\". Then rebuild the cut:  " + keynote
          + "\n  3. Accept the overlap:  " + command_for(args) + " --allow-overrun"
          + "\nThen check again:  " + command_for(args) + " --dry-run", file=sys.stderr, flush=True)


def command_for(args: argparse.Namespace) -> str:
    """This script with the same config and voice, ready to paste."""
    parts = ["python3", "-I", str(SCRIPTS / "narrate.py"), args.config]
    parts += ["--voice", args.voice] if args.voice else []
    parts += ["--music", args.music] if args.music else []
    return " ".join(shlex.quote(p) for p in parts)


def base_command(args: argparse.Namespace) -> str:
    return " ".join(shlex.quote(p) for p in ["python3", "-I", str(SCRIPTS / "narrate.py"), args.config])


def keynote_command(args: argparse.Namespace) -> str:
    return " ".join(shlex.quote(p) for p in ["python3", "-I", str(SCRIPTS / "build-keynote.py"), args.config])


def fill(template: str, values: dict[str, str]) -> str:
    for placeholder, value in values.items():
        template = template.replace(placeholder, value)
    return template


def explain(error: NarrateError, args: argparse.Namespace) -> str:
    values = {"{cmd}": base_command(args), "{keynote}": keynote_command(args), "{config}": args.config}
    steps = [fill(fix, values) for fix in error.fixes]
    return f"narrate: {error}" + ("\nWhat to do next:\n  " + "\n  ".join(steps) if steps else "")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        return narrate(args)
    except NarrateError as error:
        print(explain(error, args), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
