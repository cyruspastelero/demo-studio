"""Behaviour of scripts/storyboard.py: where each scene's picture comes from before anything is recorded,
which composed frames it keeps (the whole page, then the zoom or the crop), and the page it writes.
The full render runs in tests/smoke.sh. Run: python3 -I tests/test_storyboard.py"""

import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import demolib as lib  # noqa: E402
from keynote import spec  # noqa: E402
from keynote.storyboard_page import Frame, page  # noqa: E402
from keynote.timeline import build_plan  # noqa: E402


def load_storyboard():
    module_spec = importlib.util.spec_from_file_location("storyboard", REPO / "scripts" / "storyboard.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


storyboard = load_storyboard()
TIGHT = [500, 100, 900, 460]
SEQUENCE = [
    {"card": "intro", "kind": "hero", "title": "Invoices <fast>", "subtitle": "Acme"},
    {"scene": "01", "stem": "01-a", "trim": [0, 6], "crop": TIGHT, "voiceover": "Open the inbox.",
     "callouts": [{"at": 3.2, "dur": 2.4, "text": "The deal is agreed."}]},
    {"scene": "02", "stem": "02-b", "trim": [0, 8], "crop": TIGHT,
     "zooms": [{"at": 2.5, "focus": [900, 300], "dur": 2.5}], "highlights": [{"rect": [800, 280, 200, 30]}]},
    {"card": "end", "title": "Acme Invoice Bot", "outro": 3.5},
]
PROBE = lambda path: (12.0, (1920, 1080))  # noqa: E731


def plan_for(sequence):
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "recordings" / "raw"
        raw.mkdir(parents=True)
        for item in sequence:
            if "stem" in item:
                (raw / f"{item['stem']}-t1.mp4").write_bytes(b"x")
        return build_plan({"title": "Acme", "sequence": sequence}, raw, PROBE)


class SceneLength(unittest.TestCase):
    def test_a_trimmed_scene_needs_its_take_up_to_the_out_point(self):
        self.assertEqual(storyboard.scene_seconds({"trim": [1.0, 7.5]}), 7.5)

    def test_an_untrimmed_scene_lasts_about_as_long_as_its_voiceover(self):
        self.assertEqual(storyboard.scene_seconds({}), storyboard.MIN_SCENE)
        line = " ".join(["word"] * 25)  # 10 s at 2.5 words a second, plus a second of air
        self.assertAlmostEqual(storyboard.scene_seconds({"voiceover": line}), 11.0)


class Frames(unittest.TestCase):
    def setUp(self):
        self.plan = plan_for(SEQUENCE)
        self.wanted = storyboard.wanted_frames(self.plan)

    def kinds(self):
        return [(item.key, kind) for item, kind, *_ in self.wanted]

    def test_each_scene_shows_the_whole_page_then_its_zoom_or_crop_and_the_cards_show_too(self):
        self.assertEqual(self.kinds(), [("card-intro", "card"), ("01", "wide"), ("01", "crop"), ("02", "wide"),
                                        ("02", "zoom"), ("card-end", "card"), ("card-end", "outro")])

    def test_the_wide_frame_is_before_the_push_and_marks_the_crop(self):
        shot = self.plan.shots[0]
        _, _, _, t, marks = self.wanted[1]
        self.assertLess(t, (shot.start / spec.FPS) + shot.push_at)
        self.assertGreater(t, (shot.start / spec.FPS) + spec.ENTRY_SECONDS)  # the window is at rest
        self.assertEqual(marks[0][0], "crop")

    def test_the_zoom_frame_has_the_box_in_and_the_wide_frame_marks_the_target(self):
        run = self.plan.runs[0]
        zoom = run.zooms[0]
        _, _, _, t, _ = self.wanted[4]
        self.assertGreater(t, run.start / spec.FPS + zoom.landed + spec.HIGHLIGHT_DELAY + spec.HIGHLIGHT_IN)
        self.assertLess(t, run.start / spec.FPS + zoom.out_start)
        self.assertEqual([m[0] for m in self.wanted[3][4]], ["crop", "target"])

    def test_the_crop_frame_waits_for_the_pill(self):
        _, _, _, t, _ = self.wanted[2]
        pill = self.plan.callouts[0]
        self.assertTrue(pill.start < t < pill.end)


class Page(unittest.TestCase):
    def test_the_page_lists_every_item_in_order_and_escapes_text(self):
        plan = plan_for(SEQUENCE)
        frames = [Frame(item, kind, caption, t, Path(f"frames/{n}.png"), marks)
                  for n, (item, kind, caption, t, marks) in enumerate(storyboard.wanted_frames(plan))]
        look = {"template": "house", "font": "fonts/Outfit.woff2", "title_font": "fonts/Outfit.woff2", "painted": ["Outfit"],
                "accent": "#0A6FA8", "seconds": plan.seconds, "title": "Acme <b>"}
        html = page({"title": "Acme", "sequence": SEQUENCE}, plan, frames, {"01": "the raw take"}, look,
                    lambda png: str(png))
        self.assertNotIn("<fast>", html)
        self.assertIn("Invoices &lt;fast&gt;", html)
        self.assertIn("Acme &lt;b&gt;: storyboard", html)
        self.assertIn("Open the inbox.", html)
        self.assertIn("The deal is agreed.", html)
        self.assertIn("font fonts/Outfit.woff2", html)
        order = [html.index(k) for k in ("Title card: Invoices", "Scene 01", "Scene 02", "End card: Acme")]
        self.assertEqual(order, sorted(order))
        self.assertEqual(html.count('<div class="mark '), 3)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "needs ffmpeg")
class Pictures(unittest.TestCase):
    def test_without_takes_a_scene_uses_its_scout_screenshot_or_a_placeholder(self):
        with tempfile.TemporaryDirectory() as tmp:
            demo = Path(tmp)
            (demo / "recordings" / "scout").mkdir(parents=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=1440x810",
                            "-frames:v", "1", str(demo / "recordings" / "scout" / "01-a.png")], check=True)
            cfg = {"title": "Acme", "sequence": SEQUENCE}
            raw, sources = storyboard.prepare_takes(cfg, demo, demo / "storyboard" / ".work")
            self.assertEqual(sources, {"01": "the scout screenshot recordings/scout/01-a.png",
                                       "02": "no picture yet (placeholder)"})
            take = raw / "01-a-t1.mp4"
            self.assertEqual(lib.probe_size(take), (1920, 1080))
            self.assertGreaterEqual(lib.duration(take), 6.0)
            plan = build_plan(cfg, raw, lambda p: (lib.duration(p), lib.probe_size(p)))
            self.assertIsNotNone(plan.shots[0].wide)

    def test_with_every_take_recorded_it_reads_the_real_takes(self):
        with tempfile.TemporaryDirectory() as tmp:
            demo = Path(tmp)
            raw = demo / "recordings" / "raw"
            raw.mkdir(parents=True)
            for stem in ("01-a", "02-b"):
                (raw / f"{stem}-t1.mp4").write_bytes(b"x")
            found, sources = storyboard.prepare_takes({"title": "Acme", "sequence": SEQUENCE}, demo, demo / "w")
            self.assertEqual(found, raw)
            self.assertEqual(set(sources.values()), {"the raw take"})


class Schema(unittest.TestCase):
    def test_the_sample_plan_still_validates(self):
        self.assertEqual(lib.validate(json.loads((REPO / "samples/plan/demo.json").read_text()), "demo"), [])


if __name__ == "__main__":
    unittest.main()
