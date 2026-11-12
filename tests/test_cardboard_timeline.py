"""Behaviour of scripts/cardboard-timeline.py. Run: python3 -I tests/test_cardboard_timeline.py"""

import importlib.util
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def load_tool():
    spec = importlib.util.spec_from_file_location("cardboard_timeline", REPO / "scripts" / "cardboard-timeline.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tool = load_tool()


class TimelineSource(unittest.TestCase):
    def test_clips_are_placed_back_to_back_in_order(self):
        clips = [tool.Clip(Path("/d/01_scene1_why.mp4"), 4.0), tool.Clip(Path("/d/02_scene2_use.mp4"), 6.5)]
        source = tool.timeline_source(clips, "16:9")
        self.assertIn('<timeline aspect="16:9">', source)
        self.assertIn('<clip name="01_scene1_why" src={"/d/01_scene1_why.mp4"} start={0} end={4} />', source)
        self.assertIn('<clip name="02_scene2_use" src={"/d/02_scene2_use.mp4"} start={4} end={10.5} />', source)
        self.assertLess(source.index("01_scene1_why"), source.index("02_scene2_use"))

    def test_a_voiceover_track_is_declared_for_narration(self):
        source = tool.timeline_source([tool.Clip(Path("/d/01_a.mp4"), 2.0)], "16:9")
        self.assertIn('<track kind="audio" name="Voiceover">', source)

    def test_paths_with_quotes_stay_valid_literals(self):
        source = tool.timeline_source([tool.Clip(Path('/d/my "demo"/01_a.mp4'), 2.0)], "16:9")
        self.assertIn(r'src={"/d/my \"demo\"/01_a.mp4"}', source)

    def test_no_clips_is_an_error(self):
        with self.assertRaises(ValueError):
            tool.timeline_source([], "16:9")

    def test_unknown_aspect_is_an_error(self):
        with self.assertRaises(ValueError):
            tool.timeline_source([tool.Clip(Path("/d/01_a.mp4"), 2.0)], "2:1")


class NarrationPlan(unittest.TestCase):
    def test_each_line_starts_after_the_lead_in_and_ends_at_the_next_line(self):
        starts = {"1 Why": 0.0, "2 Use": 8.0, "3 Close": 20.0}
        lines = {"1 Why": "It starts here.", "3 Close": "And that is it."}
        plan = tool.narration_plan(["1 Why", "2 Use", "3 Close"], starts, lines, total=25.0, lead_in=0.3)
        self.assertEqual([entry["scene"] for entry in plan], ["1 Why", "3 Close"])
        self.assertEqual(plan[0], {"line": 1, "scene": "1 Why", "start": 0.3, "window": 19.7, "text": "It starts here."})
        self.assertEqual(plan[1]["start"], 20.3)
        self.assertEqual(plan[1]["window"], 4.7)


class NumberedClips(unittest.TestCase):
    def test_rough_assembly_and_other_files_are_left_out(self):
        names = ["00_ROUGH-ASSEMBLY.mp4", "02_scene2_use.mp4", "01_scene1_why.mp4", "notes.txt", "10_scene5_end.mp4"]
        self.assertEqual(tool.numbered_clip_names(names),
                         ["01_scene1_why.mp4", "02_scene2_use.mp4", "10_scene5_end.mp4"])


class SiblingModules(unittest.TestCase):
    def test_the_handoff_builder_loads_with_its_dataclasses(self):
        handoff = tool.load_sibling("build_handoff", "build-handoff.py")
        self.assertTrue(hasattr(handoff, "build_videos"))


if __name__ == "__main__":
    unittest.main()
