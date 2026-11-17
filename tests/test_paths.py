"""Path confinement for config-supplied paths: demolib.safe_join / safe_rmtree / concat_list, and
scripts that must refuse paths leaving the demo folder. Run: python3 -I tests/test_paths.py"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look their module up here
    spec.loader.exec_module(module)
    return module


lib = load("demolib", "demolib.py")
handoff = load("build_handoff", "build-handoff.py")
narrate = load("narrate", "narrate.py")


class Folder(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name).resolve()
        self.root = base / "demo"
        self.outside = base / "outside"
        self.root.mkdir()
        self.outside.mkdir()
        (self.outside / "secret.txt").write_text("secret")

    def tearDown(self) -> None:
        self._tmp.cleanup()


class SafeJoin(Folder):
    def test_relative_paths_inside_the_demo_folder_resolve(self) -> None:
        self.assertEqual(lib.safe_join(self.root, "recordings/raw", "paths.raw"), self.root / "recordings" / "raw")
        self.assertEqual(lib.safe_join(self.root, "a..b/c.png", "brand.logo"), self.root / "a..b" / "c.png")

    def test_escaping_values_are_rejected_with_the_field_name(self) -> None:
        for value in ["/etc/passwd", "../x", "a/../../x", "..", "a\\..\\x", "C:\\x", "c:x", "\\\\server\\share",
                      "a\0b", "", None, 3]:
            with self.subTest(value=value):
                with self.assertRaises(lib.UnsafePath) as caught:
                    lib.safe_join(self.root, value, "paths.out")
                self.assertTrue(str(caught.exception).startswith("paths.out:"), caught.exception)

    def test_a_symlink_out_of_the_demo_folder_is_rejected(self) -> None:
        (self.root / "link").symlink_to(self.outside)
        with self.assertRaises(lib.UnsafePath):
            lib.safe_join(self.root, "link/secret.txt", "reference_files[0]")

    def test_ensure_inside_accepts_the_root_and_children_only(self) -> None:
        self.assertEqual(lib.ensure_inside(self.root, self.root / "x", "x"), self.root / "x")
        with self.assertRaises(lib.UnsafePath):
            lib.ensure_inside(self.root, self.outside, "x")

    def test_config_path_exits_with_the_tool_and_field(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            lib.config_path(self.root, "../outside", "voice.music", "narrate")
        self.assertIn("narrate: voice.music:", str(caught.exception.code))


class SafeRmtree(Folder):
    def test_deletes_a_folder_inside_root(self) -> None:
        target = self.root / "out" / "PROMO_0m10"
        target.mkdir(parents=True)
        lib.safe_rmtree(self.root, target, "old cut")
        self.assertFalse(target.exists())

    def test_never_deletes_outside_root_root_itself_or_through_a_symlink(self) -> None:
        with self.assertRaises(lib.UnsafePath):
            lib.safe_rmtree(self.root, self.outside, "x")
        with self.assertRaises(lib.UnsafePath):
            lib.safe_rmtree(self.root, self.root, "x")
        (self.root / "link").symlink_to(self.outside)
        with self.assertRaises(lib.UnsafePath):
            lib.safe_rmtree(self.root, self.root / "link", "x")
        self.assertTrue((self.outside / "secret.txt").exists())


class ConcatList(unittest.TestCase):
    def test_quotes_are_escaped_the_way_ffmpeg_concat_expects(self) -> None:
        self.assertEqual(lib.concat_list([Path("/a/it's.mp4")]), "file '/a/it'\\''s.mp4'\n")

    def test_line_breaks_cannot_add_directives(self) -> None:
        with self.assertRaises(lib.UnsafePath):
            lib.concat_list(["/a/x.mp4'\nfile '/etc/passwd"])


class Scripts(Folder):
    def write_handoff(self, paths: dict) -> Path:
        cfg = {"title": "T", "paths": paths,
               "videos": [{"key": "PROMO", "scenes": [{"name": "a", "shots": [{"card": "card-intro", "length": 1}]}]}]}
        path = self.root / "handoff.json"
        path.write_text(json.dumps(cfg))
        return path

    def test_build_handoff_refuses_an_out_folder_that_symlinks_out_of_the_demo(self) -> None:
        (self.root / "recordings").mkdir()
        (self.root / "recordings" / "editor-handoff").symlink_to(self.outside)
        path = self.write_handoff({})
        with self.assertRaises(SystemExit) as caught:
            handoff.config_paths(path, json.loads(path.read_text()))
        self.assertIn("paths.out", str(caught.exception.code))

    def test_build_handoff_refuses_the_demo_folder_itself_as_out(self) -> None:
        path = self.write_handoff({"out": "."})
        with self.assertRaises(SystemExit) as caught:
            handoff.config_paths(path, json.loads(path.read_text()))
        self.assertIn("paths.out must be a subfolder", str(caught.exception.code))

    def test_build_handoff_cli_refuses_an_escaping_out_before_any_work(self) -> None:
        path = self.write_handoff({"out": "../outside"})
        result = subprocess.run([sys.executable, "-I", str(SCRIPTS / "build-handoff.py"), str(path), "--no-zip"],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("paths.out", result.stderr)
        self.assertEqual(list(self.outside.iterdir()), [self.outside / "secret.txt"])

    def test_social_cut_refuses_an_input_outside_the_demo_folder(self) -> None:
        (self.root / "link").symlink_to(self.outside)
        cfg = {"title": "T", "videos": [{"key": "PROMO", "scenes": [{"name": "a", "shots": [{"card": "card-x", "length": 1}]}]}],
               "social": [{"aspect": "4:5", "input": "link/secret.txt"}]}
        path = self.root / "handoff.json"
        path.write_text(json.dumps(cfg))
        result = subprocess.run([sys.executable, "-I", str(SCRIPTS / "social-cut.py"), str(path)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("social[0].input", result.stderr)

    def test_narrate_confines_voice_music_but_not_the_music_flag(self) -> None:
        with self.assertRaises(narrate.NarrateError) as caught:
            narrate.resolve_music(None, "../outside/secret.txt", self.root)
        self.assertIn("voice.music", str(caught.exception))
        music = self.outside / "bed.wav"
        music.write_bytes(b"RIFF")
        self.assertEqual(narrate.resolve_music(str(music), "", self.root), music)

    def test_narrate_refuses_a_voiceover_file_that_symlinks_out(self) -> None:
        voice = self.root / "voiceover"
        voice.mkdir()
        (voice / "01.wav").symlink_to(self.outside / "secret.txt")
        line = narrate.Line(number=1, key="card-intro", text="hi", start=0.0, budget=2.0)
        with self.assertRaises(narrate.NarrateError):
            narrate.user_file(line, voice)


class OutputSymlinks(Folder):
    def test_a_symlink_inside_the_output_tree_is_refused(self) -> None:
        out = self.root / "out"
        (out / "reference").mkdir(parents=True)
        (out / "reference" / "assets").symlink_to(self.outside)
        with self.assertRaises(lib.UnsafePath):
            lib.refuse_symlinks_under(out, "output")

    def test_an_output_folder_that_is_itself_a_symlink_is_refused(self) -> None:
        (self.root / "out").symlink_to(self.outside)
        with self.assertRaises(lib.UnsafePath):
            lib.refuse_symlinks_under(self.root / "out", "output")

    def test_a_real_output_tree_passes(self) -> None:
        (self.root / "out" / "a").mkdir(parents=True)
        (self.root / "out" / "a" / "f.txt").write_text("x")
        lib.refuse_symlinks_under(self.root / "out", "output")

    def test_takes_that_point_outside_are_skipped(self) -> None:
        raw = self.root / "raw"; raw.mkdir()
        inside = raw / "01-t1.mp4"; inside.write_text("x")
        (self.outside / "secret.mp4").write_text("x")
        escaped = raw / "02-t1.mp4"; escaped.symlink_to(self.outside / "secret.mp4")
        self.assertEqual(lib.inside_only(self.root, [inside, escaped], "test"), [inside])


if __name__ == "__main__":
    unittest.main(verbosity=2)
