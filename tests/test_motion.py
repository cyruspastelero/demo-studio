"""Highlights must sit on still UI (quality bar H8), and check-cut.py reads the cut's own brand and
the silent tail correctly. Makes a few tiny synthetic clips with ffmpeg (about a second of work).
Run: python3 -I tests/test_motion.py"""

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from keynote import motion, spec  # noqa: E402
from keynote.measure import parse_momentary  # noqa: E402
from keynote.model import Highlight, Shot  # noqa: E402
from keynote.spec import Rect  # noqa: E402


def load_check_cut():
    module_spec = importlib.util.spec_from_file_location("check_cut", REPO / "scripts" / "check-cut.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


check_cut = load_check_cut()
SIZE = (640, 360)
RECT = [100, 100, 200, 60]   # sits on the ruled pattern


def clip(path: Path, scroll_px_per_s: float, seconds: float = 4.0) -> Path:
    """A light page with a 700 px tall ruled pattern (UI-like rows) at the top; scroll_px_per_s > 0
    scrolls it up the screen, leaving the plain page below it."""
    y = f"-t*{scroll_px_per_s}" if scroll_px_per_s else "0"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0xF3F3F6:s=640x360:r=30:d={seconds}",
                    "-f", "lavfi", "-i", f"color=c=white:s=640x700:r=30:d={seconds},drawgrid=w=40:h=24:t=6:c=0x303030",
                    "-filter_complex", f"[0:v][1:v]overlay=x=0:y='{y}':shortest=1",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", str(path)],
                   check=True)
    return path


class Fixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.still = clip(root / "still.mp4", 0)
        cls.scroll = clip(root / "scroll.mp4", 150)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()


class RegionMotion(Fixtures):
    def test_a_still_region_does_not_move_and_is_not_empty(self):
        series = motion.patch_series(self.still, Rect(*RECT), SIZE, 0.5, 3.5)
        self.assertGreaterEqual(len(series), 10)
        self.assertEqual(motion.moving_spans(series), [])
        self.assertGreater(motion.spread(series[0][1]), motion.EMPTY_SPREAD)

    def test_a_scrolling_region_moves_between_samples(self):
        series = motion.patch_series(self.scroll, Rect(*RECT), SIZE, 0.5, 3.5)
        spans = motion.moving_spans(series)
        self.assertGreaterEqual(len(spans), len(series) - 2)
        self.assertTrue(all(f >= motion.MOVING_FRACTION for _, _, f in spans))

    def test_a_blank_region_reads_as_empty(self):
        blank = motion.patch_at(self.scroll, Rect(100, 300, 200, 40), SIZE, 3.9)  # pattern scrolled past
        self.assertLess(motion.spread(blank), motion.EMPTY_SPREAD)

    def test_context_stays_inside_the_take(self):
        context, inner = motion.context_box(Rect(600, 340, 40, 20), SIZE)
        self.assertEqual(context, (552, 292, 88, 68))
        self.assertEqual(inner, (48, 48, 40, 20))


def sidecar(take: Path, **changes) -> dict:
    row = {"start": 1.0, "end": 3.0, "rect": RECT, "where": "sequence[2].highlights[0]", "scene": "02",
           "take": take.name, "take_size": list(SIZE), "shot_start": 0.0, "shot_end": 4.0, "trim_in": 0.0,
           "speed": 1.0}
    return {**row, **changes}


class CheckCutHighlightMotion(Fixtures):
    def test_box_on_still_ui_passes(self):
        ok, text = check_cut.highlight_motion(sidecar(self.still), self.still.parent)
        self.assertTrue(ok, text)

    def test_box_over_a_scroll_fails_naming_scene_time_rect_and_fix(self):
        ok, text = check_cut.highlight_motion(sidecar(self.scroll), self.scroll.parent)
        self.assertFalse(ok)
        for part in ("sequence[2].highlights[0] (scene 02)", str(RECT), "moves between", "re-time `at`/`dur`",
                     "re-measure `rect`"):
            self.assertIn(part, text)

    def test_box_on_an_empty_area_fails(self):
        row = sidecar(self.still, rect=[100, 300, 200, 40], start=0.0, end=0.0)
        scrolled = sidecar(self.scroll, rect=[100, 300, 200, 40], start=3.3, end=3.6)
        self.assertTrue(check_cut.highlight_motion(row, self.still.parent)[0])  # pattern still there
        ok, text = check_cut.highlight_motion(scrolled, self.scroll.parent)
        self.assertFalse(ok)
        self.assertIn("empty area", text)

    def test_box_that_outlasts_its_scene_fails(self):
        ok, text = check_cut.highlight_motion(sidecar(self.still, end=3.9), self.still.parent)
        self.assertFalse(ok)
        self.assertIn("sits over the next clip", text)

    def test_cut_time_maps_through_trim_and_speed(self):
        # The cut shows take 2.0 s onward at 2x: cut 1.0 to 1.5 s is take 4.0 to 5.0 s of a 6 s still take.
        with tempfile.TemporaryDirectory() as tmp:
            take = clip(Path(tmp) / "long.mp4", 0, seconds=6.0)
            row = sidecar(take, start=1.0, end=1.5, shot_start=0.0, shot_end=2.0, trim_in=2.0, speed=2.0)
            self.assertTrue(check_cut.highlight_motion(row, take.parent)[0])

    def test_old_plans_without_take_mapping_ask_for_a_rebuild(self):
        report = check_cut.Report()
        check_cut.check_highlight_motion(report, {"highlights": [{"start": 1.0, "end": 2.0}]}, REPO)
        self.assertEqual(report.rows[0]["status"], "LOOK")
        self.assertIn("rebuild", report.rows[0]["text"])


class BuildTimeProbe(Fixtures):
    def plan(self, take: Path, start: float, end: float):
        shot = Shot(2, "02", take, 0.0, 4.0, 1.0, 0, 120, Rect(0, 0, 640, 328), SIZE)
        return SimpleNamespace(shots=(shot,), highlights=(Highlight(start, end, Rect(*RECT), 0,
                                                                     "sequence[2].highlights[0]"),))

    def test_still_take_gives_no_warning(self):
        self.assertEqual(motion.highlight_warnings(self.plan(self.still, 1.0, 3.0)), [])

    def test_scrolling_take_warns_with_the_moving_span_and_the_fix(self):
        warnings = motion.highlight_warnings(self.plan(self.scroll, 1.0, 3.0))
        self.assertEqual(len(warnings), 1)
        self.assertIn("sequence[2].highlights[0]: the take moves under the box", warnings[0])
        self.assertIn("(H8)", warnings[0])
        self.assertIn("re-time `at`/`dur`", warnings[0])

    def test_box_past_the_scene_end_warns(self):
        warnings = motion.highlight_warnings(self.plan(self.still, 1.0, 3.9))
        self.assertTrue(any("sits over the next clip" in w for w in warnings), warnings)


class BrandColours(unittest.TestCase):
    def test_checker_uses_the_cuts_brand_colours(self):
        plan = {"brand": {"accent": "#1E6FD9", "sweep": ["#0A84FF", "#30D158"]}}
        self.assertEqual(check_cut.brand_colours(plan), ("#1E6FD9", ("#0A84FF", "#30D158")))

    def test_old_plans_fall_back_to_the_bar_defaults(self):
        self.assertEqual(check_cut.brand_colours({}), (spec.ACCENT, (spec.SWEEP_FROM, spec.SWEEP_TO)))

    def test_build_writes_the_brand_into_the_plan_sidecar(self):
        source = (REPO / "scripts" / "build-keynote.py").read_text()
        self.assertIn('"brand": {"accent": brand.accent, "sweep": list(brand.sweep), "highlight": brand.highlight',
                      source)

    def test_box_and_pill_colours_come_from_the_plan(self):
        plan = {"brand": {"highlight": "#1D4ED8", "pill": "#1D4ED8"}}
        self.assertEqual(check_cut.overlay_colours(plan), ("#1D4ED8", "#1D4ED8"))
        self.assertEqual(check_cut.overlay_colours({}), (check_cut.OLD_HIGHLIGHT, None))


class Momentary(unittest.TestCase):
    STDERR = (
        "[Parsed_ebur128_0 @ 0x6000] t: 0.0999792  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS  LRA:   0.0 LU\n"
        "[Parsed_ebur128_0 @ 0x6000] t: 0.199979   TARGET:-23 LUFS    M: -21.8 S: -22.0     I: -21.9 LUFS  LRA:   0.0 LU\n"
        "[Parsed_ebur128_0 @ 0x6000] t: 0.3        TARGET:-23 LUFS    M:-inf S:-inf     I: -70.0 LUFS  LRA:   0.0 LU\n"
        "[Parsed_ebur128_0 @ 0x6000] Summary:\n"
    )

    def test_silence_without_a_space_after_m_is_parsed(self):
        series = parse_momentary(self.STDERR)
        self.assertEqual([round(t, 2) for t, _ in series], [0.1, 0.2, 0.3])
        self.assertEqual(series[0][1], -120.7)
        self.assertEqual(series[1][1], -21.8)
        self.assertEqual(series[2][1], float("-inf"))

    def test_lines_from_other_filters_are_ignored(self):
        self.assertEqual(parse_momentary("[Parsed_loudnorm_0] t: 1 M: -3\n"), [])


if __name__ == "__main__":
    unittest.main()
