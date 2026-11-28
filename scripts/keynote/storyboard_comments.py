"""Comments on the storyboard (scripts/storyboard.py --serve): a small server on 127.0.0.1 that shows
<demo>/storyboard/ and saves what the user types on the page to storyboard/comments.json, so the agent
can read it without the user copying anything.

GET serves only index.html, storyboard.png and frames/*.png, plus GET /comments (the saved comments).
POST /comments takes a JSON object {item key or "overall": text} and writes comments.json as
{key: text, ..., "updated": iso time}. It refuses a body over MAX_BODY, anything but an object of
short keys to strings, a request whose Host is not this server (another site cannot write through a
rebound name) and one that is not application/json (a cross-site form or plain-text POST)."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 256 * 1024
MAX_TEXT = 8000
MAX_KEYS = 300
KEY = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
FRAME = re.compile(r"^/frames/[A-Za-z0-9._-]+\.png$")
TYPES = {".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json"}


class BadComments(ValueError):
    pass


def parse_comments(body: bytes) -> dict[str, str]:
    """The comments in a POST body, without empty ones. Raises BadComments on anything else."""
    if len(body) > MAX_BODY:
        raise BadComments(f"too large (over {MAX_BODY} bytes)")
    try:
        data = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BadComments(f"not JSON: {error}") from error
    if not isinstance(data, dict):
        raise BadComments("must be a JSON object")
    data.pop("updated", None)
    if len(data) > MAX_KEYS:
        raise BadComments(f"too many entries (over {MAX_KEYS})")
    out = {}
    for key, text in data.items():
        if not KEY.match(key):
            raise BadComments(f"bad key {key[:80]!r}")
        if not isinstance(text, str):
            raise BadComments(f"{key}: the comment must be text")
        if len(text) > MAX_TEXT:
            raise BadComments(f"{key}: the comment is over {MAX_TEXT} characters")
        if text.strip():
            out[key] = text
    return out


def write_comments(folder: Path, comments: dict[str, str]) -> Path:
    """Writes folder/comments.json atomically, with the time it was saved."""
    target = folder / "comments.json"
    temp = folder / ".comments.json.tmp"
    stamped = {**comments, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    temp.write_text(json.dumps(stamped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temp, target)
    return target


def handler_for(folder: Path):
    folder = Path(folder).resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "storyboard"

        def log_message(self, *args) -> None:  # quiet: the agent reads stdout for OUTPUT lines
            pass

        def send(self, status: int, body: bytes, kind: str = "application/json") -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def error(self, status: int, message: str) -> None:
            self.send(status, json.dumps({"error": message}).encode())

        def own_host(self) -> bool:
            port = self.server.server_address[1]
            return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

        def do_GET(self) -> None:  # noqa: N802
            if not self.own_host():
                return self.error(403, "wrong host")
            path = self.path.split("?", 1)[0]
            if path == "/comments":
                saved = folder / "comments.json"
                return self.send(200, saved.read_bytes() if saved.is_file() else b"{}")
            name = {"/": "index.html", "/index.html": "index.html", "/storyboard.png": "storyboard.png"}.get(path)
            if name is None and FRAME.match(path):
                name = path.lstrip("/")
            file = folder / name if name else None
            if file is None or file.is_symlink() or not file.is_file():
                return self.error(404, "not found")
            self.send(200, file.read_bytes(), TYPES[file.suffix])

        def do_POST(self) -> None:  # noqa: N802
            if not self.own_host():
                return self.error(403, "wrong host")
            if self.path != "/comments":
                return self.error(404, "not found")
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                return self.error(415, "send application/json")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.error(400, "bad Content-Length")
            if length > MAX_BODY:
                return self.error(413, f"too large (over {MAX_BODY} bytes)")
            try:
                comments = parse_comments(self.rfile.read(length))
            except BadComments as error:
                return self.error(400, str(error))
            try:
                write_comments(folder, comments)
            except OSError as error:
                return self.error(500, f"could not save comments.json: {error.strerror}")
            self.send(200, json.dumps({"saved": len(comments)}).encode())

    return Handler


def make_server(folder: Path, port: int = 0) -> ThreadingHTTPServer:
    """A server for folder on 127.0.0.1 only; port 0 picks a free one (server.server_address[1])."""
    return ThreadingHTTPServer(("127.0.0.1", port), handler_for(folder))
