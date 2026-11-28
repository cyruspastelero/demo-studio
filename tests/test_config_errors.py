"""When a config fails its schema, the error says which demo-studio is installed and whether the
checkout is behind, so a file written for a newer version is not mistaken for a broken file.
Run: python3 -I tests/test_config_errors.py"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("demolib", REPO / "scripts" / "demolib.py")
lib = importlib.util.module_from_spec(spec)
sys.modules["demolib"] = lib
spec.loader.exec_module(lib)


def git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-C", str(cwd), *args],
                   check=True, capture_output=True)


class Checkout(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "package.json").write_text(json.dumps({"version": "9.8.7"}))
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "one")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_names_the_installed_version(self) -> None:
        self.assertIn("demo-studio 9.8.7", lib.install_status(self.root))

    def test_says_how_far_behind_origin_main_the_checkout_is(self) -> None:
        git(self.root, "commit", "-q", "--allow-empty", "-m", "two")
        git(self.root, "commit", "-q", "--allow-empty", "-m", "three")
        git(self.root, "update-ref", "refs/remotes/origin/main", "HEAD")
        git(self.root, "reset", "-q", "--hard", "HEAD~2")
        self.assertIn("2 commits behind origin/main", lib.install_status(self.root))

    def test_an_up_to_date_checkout_is_not_called_behind(self) -> None:
        git(self.root, "update-ref", "refs/remotes/origin/main", "HEAD")
        self.assertNotIn("behind", lib.install_status(self.root))

    def test_a_folder_that_is_not_a_git_checkout_still_gets_the_version(self) -> None:
        with tempfile.TemporaryDirectory() as plain:
            (Path(plain) / "package.json").write_text(json.dumps({"version": "1.2.3"}))
            self.assertIn("demo-studio 1.2.3", lib.install_status(Path(plain)))


class SchemaFailure(unittest.TestCase):
    def test_unknown_field_error_points_at_a_newer_demo_studio(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "demo.json"
            path.write_text(json.dumps({"from_the_future": True}))
            with self.assertRaises(SystemExit) as raised:
                lib.load_config(path, "demo", "quick-preview")
        message = str(raised.exception)
        self.assertIn("unknown field 'from_the_future'", message)
        self.assertIn("newer demo-studio", message)
        self.assertIn("You have demo-studio", message)


if __name__ == "__main__":
    unittest.main()
