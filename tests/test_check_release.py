"""scripts/check-release.py keeps product names, emails, personal paths and secrets out of the tracked
tree (and, with --range, out of every commit). Each test builds a throwaway git repo; fake secrets are
assembled at runtime so this file never matches the scanner itself.
Run: python3 -I tests/test_check_release.py"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check-release.py"

GH_TOKEN = "gh" + "p_" + "A" * 36
AWS_KEY = "AK" + "IA" + "B" * 16
SLACK = "xo" + "xb-" + "1234567890-abcdefghij"
SK_KEY = "sk" + "-" + "Z" * 32
SK_UNDERSCORE = "sk" + "_" + "live_" + "Y" * 24
XI_LINE = "xi-api" + "-key: " + "q" * 32
KEY_HEADER = "-----BEGIN " + "RSA PRIVATE KEY" + "-----"
GENERIC = 'api_' + 'key = "' + "k" * 20 + '"'
MAC_PATH = "/Us" + "ers/alice/projects/x"
LINUX_PATH = "/ho" + "me/bob/code"
WIN_PATH = "C:\\Us" + "ers\\carol\\code"
REAL_EMAIL = "jane.doe@" + "acme-corp.io"


class Repo(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name).resolve() / "repo"
        self.root.mkdir()
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull}
        self.git("init", "-q")
        self.git("config", "user.name", "Test Author")
        self.git("config", "user.email", "tester@example.com")
        self.git("config", "commit.gpgsign", "false")

    def git(self, *args: str) -> str:
        done = subprocess.run(["git", *args], cwd=self.root, env=self.env, capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        return done.stdout.strip()

    def track(self, path: str, content: str | bytes) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            target.write_bytes(content)
        else:
            target.write_text(content, encoding="utf-8")
        self.git("add", "-f", "--", path)

    def commit(self, message: str = "chore: change") -> None:
        self.git("commit", "-q", "-m", message)

    def scan(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-I", str(SCRIPT), *args], cwd=cwd or self.root,
                              env=self.env, capture_output=True, text=True)

    def assert_fails(self, rule: str, *args: str) -> subprocess.CompletedProcess:
        done = self.scan(*args)
        self.assertEqual(done.returncode, 1, done.stdout + done.stderr)
        self.assertIn(f"FAIL {rule} ", done.stdout)
        return done

    def assert_clean(self) -> subprocess.CompletedProcess:
        done = self.scan()
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertNotIn("FAIL", done.stdout)
        return done


class Basics(Repo):
    def test_clean_repo_exits_zero(self) -> None:
        self.track("README.md", "# hello\nnothing to see\n")
        self.assert_clean()

    def test_outside_a_git_repo_exits_with_a_named_message(self) -> None:
        with tempfile.TemporaryDirectory() as plain:
            done = self.scan(cwd=Path(plain))
        self.assertEqual(done.returncode, 1)
        self.assertIn("check-release:", done.stderr)

    def test_finding_line_names_rule_path_and_line_number(self) -> None:
        self.track("docs/a.md", f"ok\nok\ntoken {GH_TOKEN}\n")
        done = self.assert_fails("S1")
        self.assertIn("docs/a.md:3", done.stdout)

    def test_match_is_redacted_in_output(self) -> None:
        self.track("a.txt", f"x {GH_TOKEN} y\n{REAL_EMAIL}\n")
        done = self.scan()
        self.assertEqual(done.returncode, 1)
        for secret in (GH_TOKEN, GH_TOKEN[8:], REAL_EMAIL, "acme-corp"):
            self.assertNotIn(secret, done.stdout + done.stderr)
        self.assertIn(GH_TOKEN[:4] + "…", done.stdout)

    def test_json_report_is_redacted_and_lists_findings(self) -> None:
        self.track("a.txt", f"{GH_TOKEN}\n")
        out = self.root.parent / "out.json"
        self.scan("--json", str(out))
        report = out.read_text(encoding="utf-8")
        self.assertNotIn(GH_TOKEN, report)
        findings = json.loads(report)["findings"]
        self.assertEqual([(f["rule"], f["path"], f["line"]) for f in findings], [("S1", "a.txt", 1)])


class Secrets(Repo):
    def test_each_secret_shape_fails_s1(self) -> None:
        shapes = {"private key": KEY_HEADER, "github token": GH_TOKEN, "aws": AWS_KEY, "slack": SLACK,
                  "sk dash": SK_KEY, "sk underscore": SK_UNDERSCORE, "xi header": XI_LINE,
                  "assignment": GENERIC}
        for name, text in shapes.items():
            with self.subTest(name):
                self.track("f.txt", text + "\n")
                self.assert_fails("S1")

    def test_fine_grained_github_token_fails(self) -> None:
        self.track("f.txt", "gi" + "thub_pat_" + "B" * 30 + "\n")
        self.assert_fails("S1")

    def test_short_or_placeholder_values_pass(self) -> None:
        self.track("f.md", 'api_key = "short"\ntoken: "<your-token-goes-here>"\nuse sk-... here\n'
                           "export ELEVENLABS_API_KEY=$KEY\ntask-queue-with-many-words-in-name\n")
        self.assert_clean()


class PathsAndEmails(Repo):
    def test_personal_paths_fail_s2(self) -> None:
        for name, path in {"mac": MAC_PATH, "linux": LINUX_PATH, "windows": WIN_PATH}.items():
            with self.subTest(name):
                self.track("f.txt", f"see {path}\n")
                self.assert_fails("S2")

    def test_placeholder_paths_pass(self) -> None:
        prefix = "/Us" + "ers/"
        lines = [prefix + n + "/x" for n in ("you", "me", "name", "username", "<name>", "$USER", "example")]
        self.track("f.txt", "\n".join(lines) + "\n")
        self.assert_clean()

    def test_real_email_fails_s3(self) -> None:
        self.track("f.txt", f"mail {REAL_EMAIL}\n")
        self.assert_fails("S3")

    def test_example_dot_com_email_is_allowed(self) -> None:
        self.track("f.txt", "a@example.com b@example.org c@example.net d@host.example e@host.test "
                            "f@localhost noreply@acme.io no-reply@acme.io 1+x@users.noreply.github.com\n")
        self.assert_clean()

    def test_image_scale_names_are_not_emails(self) -> None:
        self.track("f.md", "![x](logo@2x.png) pkg@1.2.3\n")
        self.assert_clean()


class ForbiddenFiles(Repo):
    def test_env_file_tracked_fails(self) -> None:
        self.track(".env", "A=1\n")
        self.assert_fails("S4")

    def test_forbidden_names_fail_but_env_example_passes(self) -> None:
        self.track(".env.example", "A=\n")
        self.assert_clean()
        for path in (".env.local", "certs/site.pem", "k.key", "bundle.p12", "id_rsa", "id_rsa.pub",
                     "demos/acme/notes.txt"):
            with self.subTest(path):
                self.track(path, "x\n")
                self.assert_fails("S4")
                self.git("rm", "-q", "--cached", "--", path)


class Skips(Repo):
    def test_binary_node_modules_lockfile_and_big_files_are_skipped(self) -> None:
        self.track("img.bin", b"\x00" + GH_TOKEN.encode())
        self.track("node_modules/x/index.js", GH_TOKEN + "\n")
        self.track("package-lock.json", GH_TOKEN + "\n")
        self.track("big.txt", GH_TOKEN + "\n" + "a" * (1024 * 1024))
        self.assert_clean()


class RangeScan(Repo):
    def test_token_added_then_deleted_is_caught_in_range_scan(self) -> None:
        self.track("a.txt", "base\n")
        self.commit("feat: base")
        base = self.git("rev-parse", "HEAD")
        self.track("a.txt", f"base\n{GH_TOKEN}\n")
        self.commit("feat: oops")
        self.track("a.txt", "base\n")
        self.commit("fix: remove it")
        self.assert_clean()
        done = self.assert_fails("S1", "--range", f"{base}..HEAD")
        self.assertIn("a.txt:2", done.stdout)
        self.assertNotIn(GH_TOKEN, done.stdout)

    def test_secret_in_commit_message_is_caught_in_range_scan(self) -> None:
        self.track("a.txt", "base\n")
        self.commit("feat: base")
        base = self.git("rev-parse", "HEAD")
        self.track("a.txt", "more\n")
        self.commit(f"fix: use {GH_TOKEN}")
        done = self.assert_fails("S1", "--range", f"{base}..HEAD")
        self.assertIn("message", done.stdout)

    def test_file_added_then_deleted_is_caught_by_name_in_range_scan(self) -> None:
        self.track("a.txt", "base\n")
        self.commit("feat: base")
        base = self.git("rev-parse", "HEAD")
        self.track(".env", "A=1\n")
        self.commit("oops")
        self.git("rm", "-q", "--", ".env")
        self.commit("undo")
        self.assert_fails("S4", "--range", f"{base}..HEAD")

    def test_clean_range_exits_zero(self) -> None:
        self.track("a.txt", "base\n")
        self.commit("feat: base")
        self.track("a.txt", "more\n")
        self.commit("feat: more")
        self.assertEqual(self.scan("--range", "HEAD~1..HEAD").returncode, 0)

    def test_range_that_looks_like_an_option_is_refused(self) -> None:
        target = self.root / "written-by-git.txt"
        done = self.scan("--range=--output=" + str(target))
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("check-release:", done.stderr)
        self.assertFalse(target.exists())

    def test_unknown_range_fails_with_a_named_message(self) -> None:
        self.track("a.txt", "x\n")
        self.commit()
        done = self.scan("--range", "nope..HEAD")
        self.assertEqual(done.returncode, 1)
        self.assertIn("check-release:", done.stderr)


class Allowlist(Repo):
    def test_allowlisted_line_passes_and_stale_entry_is_reported(self) -> None:
        self.track("SECURITY.md", f"write to {REAL_EMAIL}\n")
        self.track(".release-allow", "# maintainer contact\nS3 SECURITY.md :: " + REAL_EMAIL +
                                     "\nS1 nowhere/*.md\n")
        done = self.assert_clean()
        self.assertIn("stale", done.stdout)
        self.assertIn("nowhere", done.stdout)
        self.assertNotIn(REAL_EMAIL, done.stdout)

    def test_literal_entry_only_covers_lines_containing_it(self) -> None:
        self.track("SECURITY.md", f"{REAL_EMAIL}\nother.person@" + "acme-corp.io\n")
        self.track(".release-allow", "S3 SECURITY.md :: " + REAL_EMAIL + "\n")
        done = self.assert_fails("S3")
        self.assertIn("SECURITY.md:2", done.stdout)
        self.assertNotIn("SECURITY.md:1", done.stdout)

    def test_glob_entry_without_literal_covers_whole_matching_file(self) -> None:
        self.track("tests/t.py", f"{GH_TOKEN}\n{AWS_KEY}\n")
        self.track(".release-allow", "S1 tests/*.py\n")
        self.assert_clean()

    def test_allow_entry_for_another_rule_does_not_hide_a_finding(self) -> None:
        self.track("a.txt", f"{GH_TOKEN}\n")
        self.track(".release-allow", "S3 a.txt\n")
        self.assert_fails("S1")

    def test_malformed_allow_line_is_an_error(self) -> None:
        self.track("a.txt", "x\n")
        self.track(".release-allow", "justonetoken\n")
        done = self.scan()
        self.assertEqual(done.returncode, 1)
        self.assertIn("check-release:", done.stderr)


if __name__ == "__main__":
    unittest.main()
