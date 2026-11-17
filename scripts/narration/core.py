"""Shared pieces of narrate.py: constants, the error type and the small frozen records."""
from __future__ import annotations

import importlib.util
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


def _load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent.parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = sys.modules.get("demolib") or _load_demolib()
SCRIPTS = Path(__file__).resolve().parent.parent
FPS = 30
DEFAULT_RATE = 165          # words per minute, for say and for estimates
DEFAULT_LEAD_IN = 0.3       # seconds into an item before its line starts
DEFAULT_CARD = 2.4          # build-keynote's default card length
DEFAULT_MUSIC_VOLUME = 0.18
MUSIC_FADE = 1.5
TARGET_LUFS = -14          # quality bar A2: -14 LUFS +-1
TARGET_TP = -2.0           # A3 asks <= -1.0 dBTP after AAC; aim lower for encoder overshoot
MUSIC_GAP_DB = 13.0        # A6: bed sits 12 to 14 dB under the narration between lines
OUTRO_FADE = 4.0           # A6: the bed fades over 4 s and is gone for the silent tail
SILENT_TAIL = 3.0          # X3: the last 3 s of an outro are silent
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
MUSIC_TARGET = "music/bed.m4a"
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
    music_volume: float | None   # None: set from the narration's loudness (music_gap_db under it)
    music_fade_in: float
    music_fade_out: float
    voice_id: str
    model_id: str
    stability: float
    similarity_boost: float
    keychain_service: str
    music_gap_db: float = MUSIC_GAP_DB
    music_dips: tuple[tuple[float, float], ...] = ()
    fade_out_set: bool = False

    @classmethod
    def from_config(cls, raw: dict) -> "Voice":
        eleven = raw.get("elevenlabs", {})
        return cls(provider=raw.get("provider"), rate_wpm=raw.get("rate_wpm", DEFAULT_RATE),
                   say_voice=raw.get("say_voice", ""), lead_in=raw.get("lead_in", DEFAULT_LEAD_IN),
                   music=raw.get("music", ""), music_volume=raw.get("music_volume"),
                   music_fade_in=raw.get("music_fade_in", 0.0),
                   music_fade_out=raw.get("music_fade_out", MUSIC_FADE),
                   voice_id=eleven.get("voice_id", DEFAULT_ELEVENLABS_VOICE),
                   model_id=eleven.get("model_id", DEFAULT_ELEVENLABS_MODEL),
                   stability=eleven.get("stability", 0.5),
                   similarity_boost=eleven.get("similarity_boost", 0.75),
                   keychain_service=eleven.get("keychain_service", ""),
                   music_gap_db=raw.get("music_gap_db", MUSIC_GAP_DB),
                   music_dips=tuple((float(d["at"]), float(d.get("dur", 1.5))) for d in raw.get("music_dips", [])),
                   fade_out_set="music_fade_out" in raw)


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

@dataclass(frozen=True)
class Context:
    provider: str
    voice: Voice
    cache_dir: Path
    files_dir: Path
    dry_run: bool
    api_key: str = field(default="", repr=False)

