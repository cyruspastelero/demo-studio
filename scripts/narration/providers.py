"""Voices: macOS say, ElevenLabs (with the key from the env or the Keychain) and ready-made files."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

from .core import (ELEVENLABS_URL, EXPORT_EXT, FILE_EXTENSIONS, HTTP_TIMEOUT, KEY_ENV, KEY_FIX, KEYCHAIN_ENV,
                   KEYCHAIN_FIXES, KEYCHAIN_TIMEOUT, SERVICE_NAME, Context, Line, NarrateError, Spoken, Voice, lib)
from .timing import estimate_seconds

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
    """Writes through a new, uniquely named temp file (mkstemp: O_CREAT|O_EXCL, never follows a link)
    in the same folder, then renames it over the target (a rename replaces a symlink, never follows it)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, partial = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".part")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(partial, target)
    except BaseException:
        Path(partial).unlink(missing_ok=True)
        raise
    return target


def render_say(line: Line, voice: Voice, cache_dir: Path) -> Path:
    target = say_cache_path(line.text, voice, cache_dir)
    if target.exists():
        return target
    cache_dir.mkdir(parents=True, exist_ok=True)
    # The text goes in through a file (-f), never as an argument, so a line that starts with "-"
    # cannot be read as an option. Both temp files live in a fresh private folder (mkdtemp).
    work = Path(tempfile.mkdtemp(prefix=".say.", dir=cache_dir))
    try:
        text_file = work / "line.txt"
        text_file.write_text(line.text)
        partial = work / "line.aiff"
        cmd = ["say", "-r", str(voice.rate_wpm), "-o", partial, "-f", text_file]
        if voice.say_voice:
            cmd += ["-v", voice.say_voice]
        lib.run(cmd, "say")
        os.replace(partial, target)
    finally:
        shutil.rmtree(work, ignore_errors=True)
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


CONFIG_KEYCHAIN_PREFIX = "elevenlabs"


def keychain_service(voice: Voice, env: dict, explicit: bool = False) -> str:
    """The Keychain item to read the ElevenLabs key from.

    The environment always wins. demo.json may name an item only when the user chose ElevenLabs
    themselves (--voice elevenlabs) and the name starts with "elevenlabs", so a shared demo folder
    cannot pick an unrelated Keychain item to be sent to ElevenLabs."""
    from_env = env.get(KEYCHAIN_ENV, "").strip()
    if from_env:
        return from_env
    from_config = voice.keychain_service.strip()
    if explicit and from_config.lower().startswith(CONFIG_KEYCHAIN_PREFIX):
        return from_config
    return ""


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


def find_api_key(voice: Voice, env: dict, explicit: bool = False) -> tuple[str, str]:
    """The ElevenLabs key: ELEVENLABS_API_KEY first, else the named Keychain item. (key, problem)."""
    key = env.get(KEY_ENV, "").strip()
    if key:
        return key, ""
    service = keychain_service(voice, env, explicit)
    return read_keychain(service) if service else ("", "")



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

