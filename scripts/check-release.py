#!/usr/bin/env python3
"""Release scan: keeps secrets, personal paths, email addresses and never-track files out of the repo.
The rule (AGENTS.md): no product names, account ids, emails or secrets outside the git-ignored demos/.

Usage: check-release.py [--range BASE..HEAD] [--json OUT.json]
  (none)   scan every tracked file as it sits in the working tree
  --range  ALSO scan the added lines, file names and commit messages of every commit in the range,
           so something committed and deleted again before the push is still caught
  --json   write the findings (redacted) and stale allowlist entries to OUT.json
Rules: S1 secret-shaped strings, S2 personal paths, S3 email addresses, S4 files that must not be tracked.
Allowlist: .release-allow at the repo root, one entry per line: `RULE path-glob` or
`RULE path-glob :: literal-substring`; `#` starts a comment line. Say why in the comment above it.
An entry that matches nothing is reported as stale (a warning). Output never prints a full match:
only its first 4 characters. Exit code 1 on any finding, 0 when clean. Needs git.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterator, NamedTuple

MAX_BYTES = 1024 * 1024
SKIP_PARTS = {"node_modules"}
SKIP_NAMES = {"package-lock.json"}
ALLOW_FILE = ".release-allow"
MESSAGE_PATH = "(commit message)"

PLACEHOLDER_NAMES = {"you", "me", "name", "username"}
FILE_TLDS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "mov", "css", "js", "json", "md", "ts"}
EXAMPLE_DOMAINS = ("example.com", "example.org", "example.net", "localhost", "users.noreply.github.com")
EXAMPLE_SUFFIXES = (".example", ".test", ".localhost")
NEVER_TRACKED = ("*.pem", "*.key", "*.p12", "id_rsa*")


class Hit(NamedTuple):
    rule: str
    line: int
    kind: str
    match: str
    text: str


class Finding(NamedTuple):
    rule: str
    path: str
    line: int
    kind: str
    match: str
    text: str
    where: str


class Allow(NamedTuple):
    rule: str
    glob: str
    literal: str
    number: int


def _placeholder_path(match: re.Match) -> bool:
    name = match.group(1).lower()
    return name in PLACEHOLDER_NAMES or name.startswith(("<", "$", "example"))


def _real_email(match: re.Match) -> bool:
    local, domain = match.group(0).lower().rsplit("@", 1)
    if local == "git" or "noreply" in local or "no-reply" in local:
        return False
    if domain.rsplit(".", 1)[-1] in FILE_TLDS:
        return False
    return not (domain in EXAMPLE_DOMAINS or domain.endswith(EXAMPLE_SUFFIXES)
                or domain.endswith(tuple("." + d for d in EXAMPLE_DOMAINS)))


def _real_value(match: re.Match) -> bool:
    return not match.group(1).startswith(("<", "$", "{"))


def _always(_match: re.Match) -> bool:
    return True


# (rule, kind, pattern, keep): keep(match) is True when the match really is a finding.
MATCHERS = [
    ("S1", "private-key-header", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", _always),
    ("S1", "github-token", r"\b(?:gh[pous]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})", _always),
    ("S1", "sk-key", r"\bsk[-_][A-Za-z0-9][A-Za-z0-9_-]{19,}", _always),
    ("S1", "xi-api-key", r"xi-api-key[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9]{16,}", _always),
    ("S1", "aws-access-key-id", r"\bAKIA[0-9A-Z]{16}\b", _always),
    ("S1", "slack-token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}", _always),
    ("S1", "secret-assignment",
     r"(?i)(?:api[_-]?key|secret|token|password)\s*[:=]\s*[\"']([^\"']{16,})[\"']", _real_value),
    ("S2", "personal-path", r"/(?:Users|home)/([^/\s\"'`:]+)/", lambda m: not _placeholder_path(m)),
    ("S2", "personal-path", r"[A-Za-z]:\\Users\\([^\\\s\"'`]+)\\", lambda m: not _placeholder_path(m)),
    ("S3", "email", r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b", _real_email),
]
COMPILED = [(rule, kind, re.compile(pattern), keep) for rule, kind, pattern, keep in MATCHERS]


def fail(message: str) -> None:
    sys.exit(f"check-release: {message}")


def git(root: Path | None, *args: str) -> str:
    try:
        done = subprocess.run(["git", "-c", "core.quotepath=false", *args], cwd=root, capture_output=True,
                              text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        fail("git is not installed")
    if done.returncode != 0:
        fail(f"git {args[0]} failed: {done.stderr.strip() or 'no output'}")
    return done.stdout


def redact(match: str) -> str:
    return match[:4] + "…"


def scan_text(text: str) -> Iterator[Hit]:
    for number, line in enumerate(text.splitlines(), 1):
        for rule, kind, pattern, keep in COMPILED:
            for found in pattern.finditer(line):
                if keep(found):
                    yield Hit(rule, number, kind, found.group(0), line)


def path_problem(path: str) -> str | None:
    name = path.rsplit("/", 1)[-1]
    if path.startswith("demos/"):
        return "file-under-demos"
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return "env-file"
    if any(fnmatch.fnmatch(name, glob) for glob in NEVER_TRACKED):
        return "key-or-credential-file"
    return None


def path_finding(path: str, where: str) -> list[Finding]:
    kind = path_problem(path)
    return [Finding("S4", path, 0, kind, path.rsplit("/", 1)[-1], "", where)] if kind else []


def scan_tree(root: Path) -> list[Finding]:
    found: list[Finding] = []
    for path in git(root, "ls-files").splitlines():
        found += path_finding(path, path)
        target = root / path
        skip = SKIP_PARTS & set(path.split("/")) or path.rsplit("/", 1)[-1] in SKIP_NAMES or path == ALLOW_FILE
        if skip or not target.is_file() or target.stat().st_size > MAX_BYTES:
            continue
        data = target.read_bytes()
        if b"\0" in data:
            continue
        found += [Finding(h.rule, path, h.line, h.kind, h.match, h.text, f"{path}:{h.line}")
                  for h in scan_text(data.decode("utf-8", errors="replace"))]
    return found


def diff_added(diff: str) -> Iterator[tuple[str, int, str]]:
    path, number, in_hunk = "", 0, False
    for line in diff.splitlines():
        if line.startswith("diff --git"):
            path, in_hunk = "", False
        elif not in_hunk and line.startswith("+++ b/"):
            path = line[6:].split("\t")[0]
            yield path, 0, ""
        elif line.startswith("@@"):
            number, in_hunk = int(re.search(r"\+(\d+)", line).group(1)), True
        elif in_hunk and line.startswith("+"):
            yield path, number, line[1:]
            number += 1


def scan_range(root: Path, revisions: str) -> list[Finding]:
    log = git(root, "log", "-p", "-U0", "--no-color", "--no-ext-diff", "--format=%x01%h%x02%B%x03", revisions)
    found: list[Finding] = []
    for chunk in log.split("\x01")[1:]:
        sha, rest = chunk.split("\x02", 1)
        message, diff = rest.split("\x03", 1)
        found += [Finding(h.rule, MESSAGE_PATH, h.line, h.kind, h.match, h.text, f"{sha}:message:{h.line}")
                  for h in scan_text(message)]
        for path, number, text in diff_added(diff):
            if number == 0:
                found += path_finding(path, f"{sha}:{path}")
            if path == ALLOW_FILE:  # its literals are the values it allows
                continue
            found += [Finding(h.rule, path, number, h.kind, h.match, text, f"{sha}:{path}:{number}")
                      for h in scan_text(text)]
    return found


def load_allow(root: Path) -> list[Allow]:
    file = root / ALLOW_FILE
    if not file.is_file():
        return []
    entries = []
    for number, raw in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        head, _, literal = line.partition(" :: ")
        parts = head.split()
        if len(parts) != 2:
            fail(f"{ALLOW_FILE}:{number}: expected `RULE path-glob [:: literal]`")
        entries.append(Allow(parts[0], parts[1], literal.strip(), number))
    return entries


def apply_allow(findings: list[Finding], allow: list[Allow]) -> tuple[list[Finding], list[Allow]]:
    used: set[int] = set()
    kept = []
    for finding in findings:
        hits = [a for a in allow if a.rule == finding.rule and fnmatch.fnmatch(finding.path, a.glob)
                and (not a.literal or a.literal in finding.text)]
        used.update(a.number for a in hits)
        if not hits:
            kept.append(finding)
    return kept, [a for a in allow if a.number not in used]


def report(findings: list[Finding], stale: list[Allow], out: str | None) -> None:
    for f in findings:
        print(f"FAIL {f.rule} {f.where} {f.kind} {redact(f.match)}")
    for a in stale:
        print(f"WARN stale {ALLOW_FILE}:{a.number} {a.rule} {a.glob} matches nothing")
    print(f"check-release: {len(findings)} finding(s), {len(stale)} stale allowlist entr(ies)")
    if out:
        rows = [{"rule": f.rule, "path": f.path, "line": f.line, "kind": f.kind, "match": redact(f.match),
                 "where": f.where} for f in findings]
        stale_rows = [{"line": a.number, "rule": a.rule, "glob": a.glob} for a in stale]
        Path(out).write_text(json.dumps({"findings": rows, "stale": stale_rows}, indent=2) + "\n",
                             encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan the repo for secrets, personal paths and emails.")
    parser.add_argument("--range", dest="revisions", metavar="BASE..HEAD")
    parser.add_argument("--json", dest="out", metavar="OUT.json")
    args = parser.parse_args()
    if args.revisions and args.revisions.startswith("-"):
        fail(f"--range takes revisions such as BASE..HEAD, not an option ({args.revisions[:20]})")
    root = Path(git(None, "rev-parse", "--show-toplevel").strip())
    findings = scan_tree(root) + (scan_range(root, args.revisions) if args.revisions else [])
    findings, stale = apply_allow(findings, load_allow(root))
    report(findings, stale, args.out)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
