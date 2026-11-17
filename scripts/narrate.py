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
import hashlib
import importlib.util
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()

FPS = 30
DEFAULT_RATE = 165          # words per minute, for say and for estimates
DEFAULT_LEAD_IN = 0.3       # seconds into an item before its line starts
DEFAULT_CARD = 2.4          # build-keynote's default card length
DEFAULT_MUSIC_VOLUME = 0.18
MUSIC_FADE = 1.5
TARGET_LUFS = -16
SAMPLE_RATE = 48000
KEY_ENV = "ELEVENLABS_API_KEY"
KEYCHAIN_ENV = "ELEVENLABS_KEYCHAIN_SERVICE"
KEYCHAIN_EXAMPLE = "elevenlabs-api"
KEYCHAIN_TIMEOUT = 60       # seconds; macOS may ask the user to allow access the first time
SERVICE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._ -]{0,127}")
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
# "Rachel", one of the stock premade voices every ElevenLabs account can use.
# Pick your own in the ElevenLabs voice library and set voice.elevenlabs.voice_id.
DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM"
DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2"
HTTP_TIMEOUT = 120
PROVIDERS = ("say", "elevenlabs", "files")
FILE_EXTENSIONS = (".wav", ".mp3", ".m4a")
ESTIMATE = "estimate"       # dry-run only: word-count estimates, nothing rendered
SCRIPTS = Path(__file__).resolve().parent
KEY_FIX = f"export {KEY_ENV}=your-key-here   (in your shell only; never save the key in a file here)"
KEYCHAIN_FIXES = (
    f"Or keep it in the macOS Keychain (it asks for the key, so it stays out of shell history):",
    f'  security add-generic-password -a "$USER" -s {KEYCHAIN_EXAMPLE} -w',
    f"  export {KEYCHAIN_ENV}={KEYCHAIN_EXAMPLE}",
)
REBUILD = "{keynote}"
VOICE_DIR = "voiceover"
MUSIC_DIR = "music"
MUSIC_TARGET = "assets/music.mp3"
EXPORT_EXT = ".mp3"


class NarrateError(Exception):
    """An operational failure. `fixes` are next steps shown to the user, one per line; they may use
    {cmd} (this script with the same config), {keynote} (the build-keynote command) and {config}."""

    def __init__(self, message: str, fixes: tuple[str, ...] = ()):
        super().__init__(message)
        self.fixes = fixes


@dataclass(frozen=True)
class Voice:
    provider: str | None
    rate_wpm: float
    say_voice: str
    lead_in: float
    music: str
    music_volume: float
    music_fade_in: float
    music_fade_out: float
    voice_id: str
    model_id: str
    stability: float
    similarity_boost: float
    keychain_service: str

    @classmethod
    def from_config(cls, raw: dict) -> "Voice":
        eleven = raw.get("elevenlabs", {})
        return cls(provider=raw.get("provider"), rate_wpm=raw.get("rate_wpm", DEFAULT_RATE),
                   say_voice=raw.get("say_voice", ""), lead_in=raw.get("lead_in", DEFAULT_LEAD_IN),
                   music=raw.get("music", ""), music_volume=raw.get("music_volume", DEFAULT_MUSIC_VOLUME),
                   music_fade_in=raw.get("music_fade_in", 0.0),
                   music_fade_out=raw.get("music_fade_out", MUSIC_FADE),
                   voice_id=eleven.get("voice_id", DEFAULT_ELEVENLABS_VOICE),
                   model_id=eleven.get("model_id", DEFAULT_ELEVENLABS_MODEL),
                   stability=eleven.get("stability", 0.5),
                   similarity_boost=eleven.get("similarity_boost", 0.75),
                   keychain_service=eleven.get("keychain_service", ""))


@dataclass(frozen=True)
class ItemTiming:
    key: str
    start: float
    duration: float


@dataclass(frozen=True)
class Line:
    number: int     # 1-based among voiced items; also names voiceover/<NN>.wav
    key: str        # item key: scene id or card-<name>
    text: str
    start: float    # seconds into the cut
    budget: float   # seconds until the next voiced item starts (or the end)


@dataclass(frozen=True)
class Spoken:
    line: Line
    seconds: float
    measured: bool
    audio: Path | None

    @property
    def fits(self) -> bool:
        return self.seconds <= self.line.budget


# ---------------------------------------------------------------- timing

def item_key(item: dict) -> str:
    return f"card-{item['card']}" if "card" in item else item["scene"]


def load_timing(path: Path, sequence: list[dict]) -> tuple[list[ItemTiming], float]:
    """Reads the timing file build-keynote.py wrote and checks it still matches demo.json."""
    try:
        data = json.loads(path.read_text())
        items = [ItemTiming(i["key"], float(i["start"]), float(i["duration"])) for i in data["items"]]
        total = float(data["total"])
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise NarrateError(f"could not read timing file {path.name}: {error}") from error
    built = [i.key for i in items]
    wanted = [item_key(i) for i in sequence]
    if built != wanted:
        raise NarrateError(f"demo.json sequence changed since the cut was built (cut has {built}, "
                           f"demo.json has {wanted}); build the cut again", (REBUILD, "{cmd}"))
    return items, total


def item_length(item: dict, raw_dir: Path, probe: Callable[[Path], float]) -> float:
    """Same arithmetic as build-keynote.py: card duration, or trimmed take length / speed."""
    if "card" in item:
        seconds = item.get("duration", DEFAULT_CARD)
    else:
        start, end = item.get("trim") or [None, None]
        if end is None:
            source = raw_dir / f"{item['stem']}-t{item.get('take', 1)}.mp4"
            if not source.exists():
                raise NarrateError(f"deriving timing needs {source}, which is missing",
                                   (REBUILD, "{cmd}"))
            end = probe(source)
        seconds = (end - (start or 0)) / item.get("speed", 1)
    return round(seconds * FPS) / FPS


def derive_timing(sequence: list[dict], raw_dir: Path, probe: Callable[[Path], float]) -> list[ItemTiming]:
    lengths = [item_length(item, raw_dir, probe) for item in sequence]
    starts = [sum(lengths[:i]) for i in range(len(lengths))]
    return [ItemTiming(item_key(item), start, length) for item, start, length in zip(sequence, starts, lengths)]


def plan_lines(sequence: list[dict], timings: list[ItemTiming], total: float, lead_in: float) -> list[Line]:
    """One Line per voiced item. A line may run until the next voiced item starts."""
    voiced = [i for i, item in enumerate(sequence) if item.get("voiceover", "").strip()]
    lines = []
    for number, index in enumerate(voiced, start=1):
        start = timings[index].start + lead_in
        end = timings[voiced[number]].start if number < len(voiced) else total
        lines.append(Line(number, timings[index].key, sequence[index]["voiceover"].strip(),
                          round(start, 3), round(end - start, 3)))
    return lines


def estimate_seconds(text: str, rate_wpm: float) -> float:
    return len(text.split()) / rate_wpm * 60


# ---------------------------------------------------------------- providers

def has_voice_files(folder: Path) -> bool:
    return folder.is_dir() and any(re.fullmatch(r"\d+", p.stem) and p.suffix.lower() in FILE_EXTENSIONS
                                   for p in folder.iterdir())


def select_provider(requested: str | None, configured: str | None, has_key: bool,
                    has_say: bool, has_files: bool) -> str:
    """--voice wins, then voice.provider, then files > elevenlabs (key set) > say (macOS)."""
    choice = requested or configured
    if choice == "say" and not has_say:
        raise NarrateError("provider 'say' needs macOS (the `say` command was not found). Use another voice:",
                           (f"ElevenLabs: {KEY_FIX}", "  then: {cmd} --voice elevenlabs",
                            "An AI voice through MCP, or your own recordings: {cmd} --export-lines",
                            "  save voiceover/01.mp3, 02.mp3 ... as voiceover/README.txt says, then:",
                            "{cmd} --voice files"))
    if choice == "elevenlabs" and not has_key:
        raise NarrateError(f"provider 'elevenlabs' needs the {KEY_ENV} environment variable, which is not set "
                           f"(and no Keychain item was named in {KEYCHAIN_ENV} or voice.elevenlabs.keychain_service)",
                           (KEY_FIX, *KEYCHAIN_FIXES, "Then: {cmd} --voice elevenlabs"))
    if choice:
        return choice
    if has_files:
        return "files"
    if has_key:
        return "elevenlabs"
    if has_say:
        return "say"
    raise NarrateError(
        "no voice available on this machine. Pick one of these:",
        ("1. macOS: the built-in `say` voice is free and used automatically on a Mac: {cmd} --voice say",
         f"2. ElevenLabs: {KEY_FIX}",
         "   then: {cmd} --voice elevenlabs",
         "3. Your own recordings, or an AI voice made through the ElevenLabs or Higgsfield MCP:",
         "   {cmd} --export-lines   (writes voiceover/lines.json and voiceover/README.txt)",
         "   save voiceover/01.mp3, 02.mp3 ... (or .wav / .m4a), one per voiced line, then: {cmd} --voice files",
         "Or check the timing first from word-count estimates (renders nothing):",
         "{cmd} --dry-run"))


def cache_key(provider: str, voice: str, model: str, settings: dict, text: str) -> str:
    payload = json.dumps({"provider": provider, "voice": voice, "model": model,
                          "settings": settings, "text": text}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def eleven_settings(voice: Voice) -> dict:
    return {"stability": voice.stability, "similarity_boost": voice.similarity_boost}


def eleven_cache_path(text: str, voice: Voice, cache_dir: Path) -> Path:
    key = cache_key("elevenlabs", voice.voice_id, voice.model_id, eleven_settings(voice), text)
    return cache_dir / f"{key}.mp3"


def say_cache_path(text: str, voice: Voice, cache_dir: Path) -> Path:
    key = cache_key("say", voice.say_voice, "", {"rate_wpm": voice.rate_wpm}, text)
    return cache_dir / f"{key}.aiff"


def build_tts_request(text: str, voice: Voice, api_key: str) -> urllib.request.Request:
    body = {"text": text, "model_id": voice.model_id, "voice_settings": eleven_settings(voice)}
    return urllib.request.Request(
        ELEVENLABS_URL.format(voice_id=urllib.parse.quote(voice.voice_id, safe="")),
        data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"})


def describe_http_error(error: urllib.error.HTTPError, number: int) -> str:
    try:
        detail = json.loads(error.read()[:2000].decode("utf-8", "replace")).get("detail", "")
    except (ValueError, AttributeError, OSError):
        detail = ""
    text = detail.get("message", "") if isinstance(detail, dict) else str(detail)
    status = str(detail.get("status", "")) if isinstance(detail, dict) else ""
    where = f"ElevenLabs text-to-speech for line {number}"
    if error.code == 401 and "quota" not in status:
        return f"{where} was refused (401): {KEY_ENV} does not hold a valid key. {text}".strip()
    if error.code in (402, 429) or "quota" in status or "quota" in text.lower():
        return (f"{where} hit a quota or rate limit ({error.code}): {text or 'no detail'}. "
                "Lines rendered so far are cached and will not be charged again.")
    return f"{where} failed with HTTP {error.code}: {text or error.reason}"


def http_fixes(code: int, message: str) -> tuple[str, ...]:
    if code == 401 and "quota" not in message:
        return ("Copy a valid key from your ElevenLabs profile (API keys), then:", KEY_FIX,
                "{cmd} --voice elevenlabs")
    if "quota" in message:
        return ("Add credits in your ElevenLabs account or wait for the limit to reset, then: {cmd}",
                "Or use the free macOS voice now: {cmd} --voice say")
    return ("Wait a minute and try again: {cmd}", "Or use the free macOS voice: {cmd} --voice say")


def render_elevenlabs(line: Line, voice: Voice, api_key: str, cache_dir: Path,
                      opener: Callable = urllib.request.urlopen) -> Path:
    """Returns the cached mp3 for this line, calling ElevenLabs only on a cache miss."""
    target = eleven_cache_path(line.text, voice, cache_dir)
    if target.exists():
        return target
    request = build_tts_request(line.text, voice, api_key)
    try:
        with opener(request, timeout=HTTP_TIMEOUT) as response:
            audio = response.read()
    except urllib.error.HTTPError as error:
        message = describe_http_error(error, line.number)
        raise NarrateError(message, http_fixes(error.code, message)) from None
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        reason = getattr(error, "reason", error)
        raise NarrateError(f"could not reach ElevenLabs for line {line.number}: {reason}",
                           ("Check your internet connection, then run again (finished lines are cached): {cmd}",
                            "Or use the free macOS voice: {cmd} --voice say")) from None
    if not audio:
        raise NarrateError(f"ElevenLabs returned no audio for line {line.number}",
                           ("Run again: {cmd}", "Or use the free macOS voice: {cmd} --voice say"))
    return write_atomic(target, audio)


def write_atomic(target: Path, data: bytes) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    partial.write_bytes(data)
    os.replace(partial, target)
    return target


def render_say(line: Line, voice: Voice, cache_dir: Path) -> Path:
    target = say_cache_path(line.text, voice, cache_dir)
    if target.exists():
        return target
    cache_dir.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f"{target.stem}.part.aiff")
    cmd = ["say", "-r", str(voice.rate_wpm), "-o", partial]
    if voice.say_voice:
        cmd += ["-v", voice.say_voice]
    lib.run([*cmd, line.text], "say")
    os.replace(partial, target)
    return target


def user_file(line: Line, folder: Path) -> Path | None:
    for name in (f"{line.number:02d}", str(line.number)):
        for ext in FILE_EXTENSIONS:
            path = folder / f"{name}{ext}"
            if path.exists():
                try:  # a symlink in a shared demo folder must not pull in files from elsewhere
                    lib.ensure_inside(folder.parent, path, f"voiceover file {path.name}")
                except lib.UnsafePath as error:
                    raise NarrateError(str(error)) from error
                return path
    return None


def keychain_service(voice: Voice, env: dict) -> str:
    """The Keychain item to read the ElevenLabs key from. The environment wins over demo.json, so a
    shared demo folder cannot pick which of your Keychain items gets sent to ElevenLabs."""
    return (env.get(KEYCHAIN_ENV, "") or voice.keychain_service).strip()


def read_keychain(service: str) -> tuple[str, str]:
    """Reads one generic password with macOS `security`, no shell. Returns (key, problem).
    The key is never printed, logged or written; `problem` never contains command output."""
    if not SERVICE_NAME.fullmatch(service):
        return "", f"{service!r} is not a valid Keychain service name (letters, digits, . _ - and spaces)"
    try:
        result = subprocess.run(["security", "find-generic-password", "-s", service, "-w"],
                                capture_output=True, text=True, timeout=KEYCHAIN_TIMEOUT)
    except FileNotFoundError:
        return "", "the macOS `security` command was not found, so the Keychain cannot be read here"
    except subprocess.TimeoutExpired:
        return "", f"reading Keychain item {service!r} timed out (was an access prompt left open?)"
    key = result.stdout.strip() if result.returncode == 0 else ""
    if key:
        return key, ""
    if result.returncode == 44 or "could not be found" in result.stderr:
        return "", f"Keychain item {service!r} was not found"
    return "", f"Keychain item {service!r} could not be read (security exit code {result.returncode})"


def find_api_key(voice: Voice, env: dict) -> tuple[str, str]:
    """The ElevenLabs key: ELEVENLABS_API_KEY first, else the named Keychain item. (key, problem)."""
    key = env.get(KEY_ENV, "").strip()
    if key:
        return key, ""
    service = keychain_service(voice, env)
    return read_keychain(service) if service else ("", "")


@dataclass(frozen=True)
class Context:
    provider: str
    voice: Voice
    cache_dir: Path
    files_dir: Path
    dry_run: bool
    api_key: str = field(default="", repr=False)


def check_voice_files(lines: list[Line], folder: Path) -> None:
    """Before rendering with --voice files: names every missing NN file at once."""
    missing = [line for line in lines if user_file(line, folder) is None]
    if not missing:
        return
    rows = "\n  ".join(f"{folder.name}/{line.number:02d}{EXPORT_EXT}  ({line.key}, {line.budget:.1f}s): "
                       f"\"{line.text}\"" for line in missing)
    raise NarrateError(
        f"{len(missing)} of {len(lines)} voiceover file(s) are missing (.wav or .m4a also work):\n  {rows}",
        ("Write the line list for a voice tool: {cmd} --export-lines   (then follow voiceover/README.txt)",
         "Make each missing file with the ElevenLabs MCP (text_to_speech) or the Higgsfield MCP",
         "(generate_audio), or record it yourself, and save it under the name shown above.",
         "Or narrate with the free macOS voice now: {cmd} --voice say",
         "Then: {cmd} --voice files"))


def speak(line: Line, ctx: Context) -> Spoken:
    """Renders (or finds) one line and measures it; estimates when nothing may be rendered."""
    audio: Path | None = None
    if ctx.provider == "files":
        audio = user_file(line, ctx.files_dir)
        if audio is None and not ctx.dry_run:
            raise NarrateError(
                f"line {line.number} ({line.key}) has no recording: expected {ctx.files_dir / f'{line.number:02d}.wav'} "
                "(or .mp3 / .m4a)",
                (f"Record this line or make it with an AI voice, saved as {ctx.files_dir.name}/{line.number:02d}.mp3: "
                 f"\"{line.text}\"",
                 "List every line with its file name and time budget: {cmd} --export-lines",
                 "Then: {cmd} --voice files"))
    elif ctx.provider == "say":
        audio = render_say(line, ctx.voice, ctx.cache_dir)
    elif ctx.provider == "elevenlabs":
        cached = eleven_cache_path(line.text, ctx.voice, ctx.cache_dir)
        if ctx.dry_run:
            audio = cached if cached.exists() else None
        else:
            audio = render_elevenlabs(line, ctx.voice, ctx.api_key, ctx.cache_dir)
    if audio is None:
        return Spoken(line, estimate_seconds(line.text, ctx.voice.rate_wpm), False, None)
    return Spoken(line, lib.duration(audio), True, audio)


# ---------------------------------------------------------------- report

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
  Your own file    any .mp3, .wav or .m4a you are allowed to use; copy it to {target}.
  ElevenLabs MCP   compose_music with a short prompt (for example "calm modern instrumental for a
                   product demo, soft piano and light beat"), force_instrumental true,
                   music_length_ms {length_ms}. Move the saved file to {target}.
  Higgsfield MCP   generate_audio with a music model (for example suno_music, instrumental true,
                   duration {seconds}), wait for the job, then download the result to {target}.

Then point demo.json at it, inside "voice":
  "music": "{target}", "music_volume": 0.12, "music_fade_in": 1.0, "music_fade_out": 2.0
music_volume is the level before ducking (default {volume}); the fades are in seconds (defaults:
no fade in, {fade}s fade out). Render:
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
            target=MUSIC_TARGET, volume=DEFAULT_MUSIC_VOLUME, fade=MUSIC_FADE, command=command),
    }
    written = []
    for relative, text in texts.items():
        try:  # a symlinked voiceover/ or music/ folder must not send these files elsewhere
            target = lib.safe_join(demo_dir, relative, relative)
        except lib.UnsafePath as error:
            raise NarrateError(str(error), (f"Replace that symlink with a real folder, then: {{cmd}} --export-lines",)) from error
        written.append(write_atomic(target, text.encode()))
    return written


def export_lines(manifest: dict, demo_dir: Path, args: argparse.Namespace) -> int:
    written = write_exports(manifest, demo_dir, base_command(args))
    for line in manifest["lines"]:
        print(f"  {line['file']}  {line['budget']:>5.1f}s  ~{line['suggested_words']:>2} words  {line['text']}")
    print("\n".join(f"wrote {path}" for path in written))
    print(f"Next: make each file listed above (see {VOICE_DIR}/README.txt), then render:\n"
          f"  {base_command(args)} --voice files")
    return 0


# ---------------------------------------------------------------- mix and mux

def voice_chain(index: int, start: float) -> str:
    ms = int(round(start * 1000))
    return (f"[{index}:a]aresample={SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={ms}|{ms}[v{index}];")


def loudnorm(measured: dict | None) -> str:
    """One loudnorm stage. With pass-one measurements it runs linear (accurate on short cuts)."""
    base = f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11"
    if not measured:
        return base + ":print_format=json"
    return (base + f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
            f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
            f":offset={measured['target_offset']}:linear=true")


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


def mix_filter(starts: list[float], total: float, music_input: int | None,
               music_volume: float, sidechain: bool, measured: dict | None = None,
               fade_in: float = 0.0, fade_out: float = MUSIC_FADE) -> str:
    """Filter graph: line i is input i+1. Ends in [out], exactly `total` seconds long."""
    graph = "".join(voice_chain(i + 1, start) for i, start in enumerate(starts))
    graph += ("".join(f"[v{i + 1}]" for i in range(len(starts)))
              + f"amix=inputs={len(starts)}:normalize=0,apad,atrim=0:{total:.3f}[voice];")
    final = "voice"
    if music_input is not None:
        level = music_volume if sidechain else music_volume * 0.5
        graph += (f"[{music_input}:a]aresample={SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
                  f"volume={level:.3f},atrim=0:{total:.3f}{music_fades(total, fade_in, fade_out)}[bed];")
        if sidechain:
            graph += ("[voice]asplit=2[vmain][vkey];"
                      "[bed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=350[duck];"
                      "[vmain][duck]amix=inputs=2:normalize=0[mixed];")
        else:
            graph += "[voice][bed]amix=inputs=2:normalize=0[mixed];"
        final = "mixed"
    return graph + f"[{final}]{loudnorm(measured)},aresample={SAMPLE_RATE}[out]"


def mux(cut: Path, spoken: list[Spoken], total: float, music: Path | None, voice: Voice, out: Path) -> None:
    inputs = [arg for s in spoken for arg in ("-i", s.audio)]
    music_input = None
    if music:
        inputs += ["-stream_loop", "-1", "-i", music]
        music_input = len(spoken) + 1
    starts, sidechain = [s.line.start for s in spoken], lib.has_filter("sidechaincompress")
    # Pass one: measure the mix's loudness (audio only, fast). Pass two applies it linearly.
    fades = {"fade_in": voice.music_fade_in, "fade_out": voice.music_fade_out}
    probe = mix_filter(starts, total, music_input, voice.music_volume, sidechain, **fades)
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "info", "-i", str(cut),
                             *map(str, inputs), "-filter_complex", probe, "-map", "[out]", "-f", "null", "-"],
                            capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"ffmpeg failed while measuring loudness:\n{result.stderr[-1500:]}")
    measured = parse_loudnorm(result.stderr)
    graph = mix_filter(starts, total, music_input, voice.music_volume, sidechain, measured, **fades)
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", "-i", cut, *inputs, "-filter_complex", graph,
                      "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                      "-ar", SAMPLE_RATE, "-t", f"{total:.3f}", "-movflags", "+faststart", out],
                     "mux", int(total * FPS))


# ---------------------------------------------------------------- main

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="narrate.py", description="Add a finished voiceover (and optional music) to the keynote cut. "
        "Run it from the demo folder after build-keynote.py.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""examples:
  # 1. check every line fits its slot first (renders no video, spends no credits)
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --dry-run
  # 2. free macOS voice plus a music bed ducked under the speech
  python3 -I {SCRIPTS / 'narrate.py'} demo.json --voice say --music assets/music.mp3
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

music: --music or voice.music (for example assets/music.mp3), with voice.music_volume,
voice.music_fade_in and voice.music_fade_out. --export-lines also writes music/README.txt.""")
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
        key, problem = find_api_key(voice, os.environ)
    try:
        if choice == "elevenlabs" and not key and problem and not args.dry_run:
            service = keychain_service(voice, os.environ)
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


def narrate(args: argparse.Namespace) -> int:
    cfg_path = Path(args.config).resolve()
    cfg = lib.load_config(cfg_path, "demo", "narrate")
    demo_dir = cfg_path.parent
    rec = demo_dir / "recordings"
    voice = Voice.from_config(cfg.get("voice", {}))
    cut = rec / "exports" / f"{lib.slugify(cfg['title'])}-keynote-cut.mp4"
    if not cut.exists():
        raise NarrateError(f"the keynote cut {cut} does not exist yet. Build it first, then narrate:",
                           (REBUILD, "{cmd}"))
    timings, total = timeline(cfg, cut, rec / "raw", keynote_command(args))
    lines = plan_lines(cfg["sequence"], timings, total, voice.lead_in)
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
    mux(cut, spoken, total, music, voice, out)
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
