"""On-screen text in the exports: which shots get a text overlay, with what place, size and font, and
how the script points the editor at it. Run: python3 -I tests/test_text_overlays.py"""

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


handoff = load("build_handoff", "build-handoff.py")


def video(shots: list[dict]):
    cfg = {"title": "T", "shots": {"SHARED": {"source": "b.mp4", "in": 0, "out": 2, "screen": "s", "text": "Shared",
                                            "text_font": "geist"}},
           "videos": [{"key": "V", "scenes": [{"name": "One", "shots": shots}]}]}
    return handoff.build_videos(cfg)[0]


class Overlays(unittest.TestCase):
    def test_only_shots_with_text_get_an_overlay_named_by_clip_number(self):
        v = video([{"card": "card-a", "length": 2},
                   {"source": "a.mp4", "in": 0, "out": 2, "screen": "s", "text": "Hello",
                    "text_pos": [0.25, 0.8], "text_size": 56, "text_font": "fonts/Brand.woff2"},
                   {"ref": "SHARED", "text_pos": [0.5, 0.1]}])
        self.assertEqual(handoff.text_overlay_items(v), [
            {"name": "02", "text": "Hello", "pos": [0.25, 0.8], "size": 56, "font": "fonts/Brand.woff2"},
            {"name": "03", "text": "Shared", "pos": [0.5, 0.1], "size": None, "font": "geist"},
        ])

    def test_the_script_names_the_overlay_file_and_the_font(self):
        shot = video([{"source": "a.mp4", "in": 0, "out": 2, "screen": "s", "text": "Hi", "text_font": "geist"}]).shots[0]
        self.assertEqual(shot.text_place, " (font geist)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
