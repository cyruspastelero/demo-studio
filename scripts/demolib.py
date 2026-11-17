"""Shared helpers for the demo-studio Python scripts: config loading with schema checks,
progress lines for tools that stream output, and small ffmpeg wrappers.

Scripts load this file by path (see load_demolib in each script) so they keep working
under `python3 -I`, which drops the script folder from sys.path.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = PLUGIN_ROOT / "schemas"
ASSETS = PLUGIN_ROOT / "assets"

_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    # NaN and Infinity are not numbers here: Python's json reads them, and they pass every
    # minimum/maximum comparison, so a sidecar could smuggle them past a range check.
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
}


# ---------------------------------------------------------------- schema checks

def _resolve(schema: dict, root: dict) -> dict:
    while "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/$defs/"):
            raise ValueError(f"unsupported $ref {ref}")
        schema = root["$defs"][ref[len("#/$defs/"):]]
    return schema


_END_ANCHOR = re.compile(r"(?<!\\)\$")


def _matches(pattern: str, text: str) -> bool:
    """JSON Schema `pattern` search, except that `$` means the very end of the text. Python's `$`
    also matches before a trailing newline, so "#FFFFFF\n" would pass "^#[0-9A-F]{6}$"; a value
    with a smuggled line break must not reach a filter graph, an HTML page or a prompt."""
    return re.search(_END_ANCHOR.sub(r"\\Z", pattern), text) is not None


def _check(value, schema: dict, root: dict, path: str) -> list[str]:
    """A small JSON Schema subset: type, enum, const, required, properties,
    patternProperties, additionalProperties, items, min/max items, minLength, pattern,
    minimum, maximum, exclusiveMinimum, oneOf, anyOf, $ref to #/$defs."""
    schema = _resolve(schema, root)
    where = path or "(top level)"
    if "const" in schema and value != schema["const"]:
        return [f"{where}: must be {schema['const']!r}"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{where}: must be one of {schema['enum']}, got {value!r}"]
    kinds = schema.get("type")
    if kinds:
        kinds = kinds if isinstance(kinds, list) else [kinds]
        if not any(_TYPES[k](value) for k in kinds):
            return [f"{where}: expected {' or '.join(kinds)}, got {type(value).__name__}"]

    for key in ("oneOf", "anyOf"):
        if key in schema:
            results = [_check(value, s, root, path) for s in schema[key]]
            passing = sum(1 for r in results if not r)
            if passing == 0:
                best = min(results, key=len)
                return [f"{where}: does not match any allowed shape; closest: {'; '.join(best)}"]
            if key == "oneOf" and passing > 1:
                return [f"{where}: matches more than one allowed shape"]

    errors: list[str] = []
    if isinstance(value, dict):
        for req in schema.get("required", []):
            if req not in value:
                errors.append(f"{where}: missing required field '{req}'")
        props = schema.get("properties", {})
        patterns = schema.get("patternProperties", {})
        extra = schema.get("additionalProperties", True)
        for k, v in value.items():
            sub = f"{path}.{k}" if path else k
            if k in props:
                errors += _check(v, props[k], root, sub)
                continue
            matched = [s for p, s in patterns.items() if _matches(p, k)]
            if matched:
                for s in matched:
                    errors += _check(v, s, root, sub)
            elif extra is False:
                errors.append(f"{where}: unknown field '{k}'")
            elif isinstance(extra, dict):
                errors += _check(v, extra, root, sub)
    elif isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{where}: needs at least {schema['minItems']} item(s)")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{where}: allows at most {schema['maxItems']} item(s)")
        if "items" in schema:
            for i, item in enumerate(value):
                errors += _check(item, schema["items"], root, f"{path}[{i}]")
    elif isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{where}: must not be empty")
        if "pattern" in schema and not _matches(schema["pattern"], value):
            errors.append(f"{where}: {value!r} does not match {schema['pattern']}")
    elif _TYPES["number"](value):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{where}: must be >= {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{where}: must be <= {schema['maximum']}")
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errors.append(f"{where}: must be > {schema['exclusiveMinimum']}")
    return errors


def validate(data, schema_name: str, definition: str | None = None) -> list[str]:
    """Checks data against schemas/<schema_name>.schema.json, or one of its $defs."""
    root = json.loads((SCHEMAS / f"{schema_name}.schema.json").read_text())
    schema = root["$defs"][definition] if definition else root
    return _check(data, schema, root, "")


def validate_look(look) -> list[str]:
    """Checks a look (a template's, or the one a build recorded in plan.json) against the `look`
    property of schemas/template.schema.json."""
    root = json.loads((SCHEMAS / "template.schema.json").read_text())
    return _check(look, root["properties"]["look"], root, "look")


# ---------------------------------------------------------------- sidecars
# build-keynote.py and narrate.py write *.plan.json, *.timing.json and *.voice.json next to the cut.
# A shared demo folder can ship its own, so they are read as untrusted input: shape and ranges per
# schemas/sidecars.schema.json, and the recorded look against the template look schema.

SIDECAR_KINDS = ("plan", "timing", "voice")


class SidecarError(ValueError):
    pass


def load_sidecar(path: Path, kind: str) -> dict:
    """Reads and validates one sidecar; raises SidecarError naming the file and every problem."""
    if kind not in SIDECAR_KINDS:
        raise ValueError(f"unknown sidecar kind {kind!r}")
    path = Path(path)
    try:
        data = json.loads(path.read_text())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SidecarError(f"could not read {path.name}: {error}") from error
    errors = validate(data, "sidecars", kind)
    if not errors and kind == "plan" and "look" in data:
        errors = validate_look(data["look"])
    if errors:
        raise SidecarError(f"{path.name} does not match schemas/sidecars.schema.json ({kind}); rebuild it "
                           "rather than trust it:\n  " + "\n  ".join(errors[:20]))
    return data


def finite_number(value, field: str, low: float, high: float) -> float:
    """value as a float, if it is a real number (not a bool, not NaN or infinite) within [low, high].
    Every number that goes into an ffmpeg filter graph passes through this or ff_num first."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SidecarError(f"{field}: expected a number, got {type(value).__name__}")
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise SidecarError(f"{field}: {value!r} is outside {low:g} to {high:g}")
    return number


def ff_num(value, field: str, low: float, high: float, digits: int = 2) -> str:
    """finite_number, formatted with fixed precision for a filter graph (never repr, never a string)."""
    return f"{finite_number(value, field, low, high):.{digits}f}"


def load_config(path: Path, schema_name: str, tool: str) -> dict:
    """Reads a JSON config and exits with every schema problem listed, before any work starts."""
    if not path.exists():
        sys.exit(f"{tool}: config not found: {path}")
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        sys.exit(f"{tool}: {path.name} is not valid JSON: {error}")
    errors = validate(data, schema_name)
    if errors:
        sys.exit(f"{tool}: {path.name} does not match schemas/{schema_name}.schema.json:\n  "
                 + "\n  ".join(errors))
    return data


# ---------------------------------------------------------------- path confinement
# Demo folders may come from other people, so every path read from handoff.json or demo.json
# must stay inside the demo folder. These raise UnsafePath (a ValueError) with the field name.

class UnsafePath(ValueError):
    pass


def _parts(value: str) -> list[str]:
    return re.split(r"[\\/]+", value)


def safe_join(root: Path, value, field: str) -> Path:
    """Joins a config-supplied relative path onto root and returns the resolved path.

    Rejects non-strings, empty values, NUL bytes, absolute paths (POSIX, Windows drive or UNC),
    '..' segments, and anything (including symlinks) that resolves outside root."""
    if not isinstance(value, str) or not value:
        raise UnsafePath(f"{field}: must be a non-empty relative path")
    if "\0" in value:
        raise UnsafePath(f"{field}: path contains a NUL byte")
    if value.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", value) or Path(value).is_absolute():
        raise UnsafePath(f"{field}: absolute paths are not allowed ({value!r}); use a path inside the demo folder")
    if ".." in _parts(value):
        raise UnsafePath(f"{field}: '..' is not allowed ({value!r}); use a path inside the demo folder")
    base = Path(root).resolve()
    full = (base / value).resolve()
    if not full.is_relative_to(base):
        raise UnsafePath(f"{field}: {value!r} resolves outside the demo folder {base}")
    return full


def ensure_inside(root: Path, path: Path, what: str) -> Path:
    """Raises UnsafePath unless path (resolved) is root itself or inside it. Use before deleting."""
    base = Path(root).resolve()
    full = Path(path).resolve()
    if not full.is_relative_to(base):
        raise UnsafePath(f"{what}: {full} is outside {base}; refusing to touch it")
    return full


def safe_rmtree(root: Path, path: Path, what: str) -> None:
    """shutil.rmtree, but only for a real folder strictly inside root (never root, never a symlink)."""
    full = ensure_inside(root, path, what)
    if full == Path(root).resolve():
        raise UnsafePath(f"{what}: refusing to delete the demo folder itself ({full})")
    if Path(path).is_symlink():
        raise UnsafePath(f"{what}: {path} is a symlink; refusing to delete through it")
    shutil.rmtree(full)


def refuse_symlinks_under(folder: Path, what: str) -> None:
    """Raises UnsafePath if folder, or anything under it, is a symlink. Output folders must be real
    folders, so a planted link cannot send a write (or a zip) outside the demo folder."""
    folder = Path(folder)
    if folder.is_symlink():
        raise UnsafePath(f"{what}: {folder} is a symlink; refusing to write through it")
    if not folder.exists():
        return
    for dirpath, dirnames, filenames in os.walk(folder, followlinks=False):
        for name in [*dirnames, *filenames]:
            entry = Path(dirpath) / name
            if entry.is_symlink():
                raise UnsafePath(f"{what}: {entry} is a symlink; remove it, outputs must be real files")


def inside_only(root: Path, files: list, what: str) -> list:
    """Keeps only files that resolve inside root (a symlinked take pointing elsewhere is skipped)."""
    base = Path(root).resolve()
    kept = []
    for file in files:
        if Path(file).resolve().is_relative_to(base):
            kept.append(file)
        else:
            print(f"{what}: WARN skipping {file}, it points outside the demo folder", file=sys.stderr)
    return kept


def safe_make_zip(root: Path, base: Path, root_dir: Path, base_dir: str) -> str:
    """shutil.make_archive, but never through a planted symlink: the zip is built under a temporary
    name in the target folder and renamed into place (os.replace swaps a symlink, it does not follow it)."""
    base = Path(base)
    ensure_inside(root, base.parent, "zip folder")
    target = base.with_name(base.name + ".zip")
    # mkdtemp creates a new, private (0700) folder with an unpredictable name, so nothing can be
    # planted at the temporary path; the finished zip is then renamed over the target.
    workdir = Path(tempfile.mkdtemp(prefix=f".{base.name}.", dir=base.parent))
    try:
        built = Path(shutil.make_archive(str(workdir / base.name), "zip", str(root_dir), base_dir))
        os.replace(built, target)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return str(target)


def config_path(root: Path, value, field: str, tool: str) -> Path:
    """safe_join for scripts: exits with a clear message instead of raising."""
    try:
        return safe_join(root, value, field)
    except UnsafePath as error:
        sys.exit(f"{tool}: {error}")


# ---------------------------------------------------------------- progress and ffmpeg

def progress(stage: str, done: int, total: int) -> None:
    print(f"PROGRESS {stage} {done}/{total}", flush=True)


def output(path: Path | str) -> None:
    print(f"OUTPUT {path}", flush=True)


def require(*tools: str) -> None:
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        sys.exit(f"missing {', '.join(missing)}; run scripts/doctor.sh for install commands")


# Media from a demo folder is untrusted. ffmpeg follows references inside some formats (HLS and
# concat playlists, image2 patterns, data: and http: URLs); limiting protocols to local files and
# pipes keeps a crafted file from making ffmpeg fetch URLs or read other kinds of input.
PROTOCOL_WHITELIST = ("-protocol_whitelist", "file,pipe")


def ffmpeg_cmd(cmd: list) -> list[str]:
    """The command as strings, with the protocol whitelist in front of every input of an ffmpeg
    command (it is a per-input option) and at the start of an ffprobe command."""
    cmd = [str(c) for c in cmd]
    tool = Path(cmd[0]).name if cmd else ""
    if tool == "ffprobe" and "-protocol_whitelist" not in cmd:
        return [cmd[0], *PROTOCOL_WHITELIST, *cmd[1:]]
    if tool != "ffmpeg":
        return cmd
    out: list[str] = []
    for i, arg in enumerate(cmd):
        if arg == "-i" and (i < 2 or cmd[i - 2] != "-protocol_whitelist"):
            out += PROTOCOL_WHITELIST
        out.append(arg)
    return out


def run(cmd: list, tool: str = "ffmpeg") -> str:
    cmd = ffmpeg_cmd(cmd)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"{tool} failed: {' '.join(cmd[:8])}...\n{result.stderr[-1500:]}")
    return result.stdout


def run_progress(cmd: list, stage: str, total_frames: int, tool: str = "ffmpeg") -> None:
    """Runs ffmpeg with -progress on stdout and turns it into PROGRESS lines (about every 5%)."""
    cmd = ffmpeg_cmd(cmd)
    cmd = [cmd[0], "-progress", "pipe:1", "-nostats", *cmd[1:]]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    total = max(1, total_frames)
    last = -1
    for line in proc.stdout:
        if line.startswith("frame="):
            done = min(total, int(line.split("=", 1)[1] or 0))
            step = done * 20 // total
            if step != last:
                last = step
                progress(stage, done, total)
    stderr = proc.stderr.read()
    if proc.wait():
        sys.exit(f"{tool} failed: {' '.join(cmd[:8])}...\n{stderr[-1500:]}")
    if last != 20:
        progress(stage, total, total)


def concat_quote(path) -> str:
    """Quotes a path for an ffmpeg concat list: inside '...', a ' is written as '\\''."""
    text = str(path)
    if "\n" in text or "\r" in text or "\0" in text:
        raise UnsafePath(f"file name has a line break or NUL byte, which ffmpeg concat lists cannot hold: {text!r}")
    return "'" + text.replace("'", "'\\''") + "'"


def concat_list(paths) -> str:
    """The text of an ffmpeg concat demuxer list, one `file '<path>'` line per path."""
    return "".join(f"file {concat_quote(p)}\n" for p in paths)


def probe_size(path: Path) -> tuple[int, int]:
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
               "-of", "csv=p=0", path], "ffprobe")
    w, h = out.strip().split(",")[:2]
    return int(w), int(h)


def duration(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], "ffprobe")
    return float(out.strip())


def has_audio(path: Path) -> bool:
    out = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
               "-of", "csv=p=0", path], "ffprobe")
    return bool(out.strip())


def has_filter(name: str) -> bool:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return any(line.split()[1:2] == [name] for line in out.splitlines() if line.strip())


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "demo"
