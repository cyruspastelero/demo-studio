"""Behaviour of scripts/plan-lint.py: numbers on screen against the voiceover (N1), monotony (N2) and
scenes that open straight on a tight crop (W9), read from demo.json alone. Run: python3 -I tests/test_plan_lint.py"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "plan-lint.py"


def load_lint():
    spec = importlib.util.spec_from_file_location("plan_lint", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["plan_lint"] = module
    spec.loader.exec_module(module)
    return module


plan_lint = load_lint()


def card(title: str, voiceover: str | None = None, subtitle: str = "", name: str = "intro") -> dict:
    item = {"card": name, "title": title}
    if subtitle:
        item["subtitle"] = subtitle
    if voiceover is not None:
        item["voiceover"] = voiceover
    return item


def scene(number: str, callout: str | None = None, voiceover: str | None = None, **extra) -> dict:
    item = {"scene": number, "stem": f"{number}-demo", **extra}
    if callout is not None:
        item["callouts"] = [{"at": 1, "text": callout}]
    if voiceover is not None:
        item["voiceover"] = voiceover
    return item


def demo(*sequence: dict) -> dict:
    return {"title": "Acme", "sequence": list(sequence)}


def items(findings: list, check: str) -> list:
    return [f for f in findings if f[0] == check]


class NumberTests(unittest.TestCase):
    def numbers(self, *sequence: dict) -> list:
        return items(plan_lint.lint(demo(*sequence)), "N1")

    def test_card_number_missing_from_voiceover_is_flagged(self):
        found = self.numbers(card("Done in 3 steps", "Four simple moves and you are done."))
        self.assertEqual(len(found), 1)
        self.assertIn("3", found[0][1])
        self.assertIn("Four simple moves", found[0][1])

    def test_digit_matches_spelled_number(self):
        self.assertEqual(self.numbers(card("3 steps", "Just three steps.")), [])

    def test_spelled_number_with_hyphen_matches(self):
        self.assertEqual(self.numbers(card("21 tools", "Twenty-one tools in one place.")), [])

    def test_thousands_separator_matches_plain_and_spoken(self):
        self.assertEqual(self.numbers(card("1,000 users", "Over 1000 users.")), [])
        self.assertEqual(self.numbers(card("1,000 users", "One thousand users.")), [])

    def test_percent_matches_percent_word_and_spelled_form(self):
        self.assertEqual(self.numbers(card("50% faster", "Fifty percent faster.")), [])
        self.assertEqual(self.numbers(card("50% faster", "50 percent faster.")), [])

    def test_compound_spoken_number_matches(self):
        self.assertEqual(self.numbers(card("250 invoices", "Two hundred and fifty invoices.")), [])

    def test_k_suffix_matches_thousand_or_k(self):
        self.assertEqual(self.numbers(card("10k teams", "Ten thousand teams.")), [])
        self.assertEqual(self.numbers(card("10k teams", "10k teams.")), [])

    def test_decimal_matches_point_form(self):
        self.assertEqual(self.numbers(card("2.5x faster", "Two point five times faster.")), [])

    def test_currency_matches_spoken_amount(self):
        self.assertEqual(self.numbers(card("$20 a month", "Twenty dollars a month.")), [])

    def test_scene_callout_number_missing_from_voiceover_is_flagged(self):
        found = self.numbers(scene("01", "Saves 40% of the time", "It saves a lot of time."))
        self.assertEqual(len(found), 1)
        self.assertIn("40", found[0][1])
        self.assertIn("scene 01", found[0][1])

    def test_legacy_caption_is_checked_too(self):
        found = self.numbers(scene("01", None, "Nothing numeric here.", caption="5 clicks"))
        self.assertEqual(len(found), 1)

    def test_scene_without_voiceover_is_skipped(self):
        self.assertEqual(self.numbers(scene("01", "3 clicks"), card("3 steps")), [])

    def test_item_without_on_screen_numbers_is_skipped(self):
        self.assertEqual(self.numbers(card("Hello there", "Four steps ahead.")), [])

    def test_person_pill_name_is_not_a_number_claim(self):
        item = scene("01", None, "A happy customer.")
        item["callouts"] = [{"at": 1, "kind": "person", "text": "Agent 47", "role": "Tester"}]
        self.assertEqual(self.numbers(item), [])

    def test_version_strings_and_glued_digits_are_not_flagged(self):
        for title in ("Acme v2.1.3", "Acme 2.0.1", "Web3 for teams", "H264 export", "Call 10:30"):
            with self.subTest(title=title):
                self.assertEqual(self.numbers(card(title, "Welcome to the tour.")), [])

    def test_bare_year_is_not_flagged(self):
        self.assertEqual(self.numbers(card("Acme 2026", "Welcome to the tour.")), [])

    def test_every_missing_number_is_reported(self):
        found = self.numbers(card("3 steps, 5 minutes", "Quick and easy."))
        self.assertEqual(len(found), 2)


class MonotonyTests(unittest.TestCase):
    def runs(self, *sequence: dict) -> list:
        return items(plan_lint.lint(demo(*sequence)), "N2")

    def early(self, number: str, at: float = 0.5) -> dict:
        return scene(number, zooms=[{"at": at, "focus": [100, 100]}])

    def test_three_scenes_that_zoom_at_once_are_flagged_by_name(self):
        found = self.runs(self.early("01"), self.early("02"), self.early("03"))
        self.assertEqual(len(found), 1)
        for name in ("01", "02", "03"):
            self.assertIn(name, found[0][1])

    def test_a_word_cue_zoom_does_not_crash_and_does_not_count_as_early(self):
        word = scene("01", voiceover="Invite your team.", zooms=[{"at": {"word": "invite"}, "focus": [100, 100]}])
        self.assertEqual(self.runs(word, self.early("02"), self.early("03")), [])

    def test_two_early_zooms_in_a_row_are_fine(self):
        self.assertEqual(self.runs(self.early("01"), self.early("02"), self.early("03", at=4)), [])

    def test_a_card_between_scenes_breaks_the_run(self):
        self.assertEqual(self.runs(self.early("01"), self.early("02"), card("Next"), self.early("03")), [])

    def test_legacy_zoom_start_counts(self):
        legacy = lambda n: scene(n, zoom=[1.1, 900, 500, 0.4, 3])
        self.assertEqual(len(self.runs(legacy("01"), legacy("02"), legacy("03"))), 1)

    def test_three_scenes_with_same_pill_kind_and_position_are_flagged(self):
        pill = lambda n: scene(n, callouts=[{"at": 1, "text": "Hi", "pos": [0.2, 0.9]}])
        found = self.runs(pill("01"), pill("02"), pill("03"))
        self.assertEqual(len(found), 1)
        self.assertIn("01", found[0][1])

    def test_pills_in_different_places_are_fine(self):
        make = lambda n, x: scene(n, callouts=[{"at": 1, "text": "Hi", "pos": [x, 0.9]}])
        self.assertEqual(self.runs(make("01", 0.2), make("02", 0.5), make("03", 0.2)), [])

    def test_default_position_pills_are_not_flagged(self):
        self.assertEqual(self.runs(scene("01", "A"), scene("02", "B"), scene("03", "C")), [])


class OpeningTests(unittest.TestCase):
    TIGHT = [500, 100, 900, 460]

    def opening(self, *sequence: dict) -> list:
        return items(plan_lint.lint(demo(*sequence)), "W9")

    def test_a_tight_scene_with_room_to_open_wide_passes(self):
        self.assertEqual(self.opening(card("Hi"), scene("01", crop=self.TIGHT)), [])

    def test_wide_false_right_after_a_card_is_flagged(self):
        found = self.opening(card("Hi"), scene("01", crop=self.TIGHT, wide=False))
        self.assertEqual(len(found), 1)
        self.assertIn("opens straight on a tight crop", found[0][1])

    def test_wide_false_continuing_a_scene_in_the_same_window_passes(self):
        self.assertEqual(self.opening(scene("01", crop=self.TIGHT), scene("02", crop=self.TIGHT, wide=False)), [])

    def test_a_zoom_too_early_to_show_the_page_first_is_flagged(self):
        found = self.opening(card("Hi"), scene("01", crop=self.TIGHT, zooms=[{"at": 0.5, "focus": [900, 300]}]))
        self.assertEqual(len(found), 1)
        self.assertIn("first zoom starts at 0.5s", found[0][1])

    def test_a_crop_close_to_the_whole_page_is_not_tight(self):
        self.assertEqual(self.opening(card("Hi"), scene("01", crop=[0, 0, 1800, 923], wide=False)), [])


class CommandLineTests(unittest.TestCase):
    def run_cli(self, plan: dict, *flags: str) -> subprocess.CompletedProcess:
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "demo.json").write_text(json.dumps(plan))
            return subprocess.run([sys.executable, "-I", str(SCRIPT), folder, *flags],
                                  capture_output=True, text=True, check=False)

    BAD = demo(card("3 steps", "Four steps."), scene("01", None, "Clip.", crop=[0, 0, 1920, 984]))

    def test_look_findings_exit_0_by_default(self):
        result = self.run_cli(self.BAD)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout, r"(?m)^LOOK\s+N1\s")

    def test_strict_turns_look_into_exit_1(self):
        result = self.run_cli(self.BAD, "--strict")
        self.assertEqual(result.returncode, 1)
        self.assertRegex(result.stdout, r"(?m)^FAIL\s+N1\s")

    def test_clean_plan_passes_in_strict_mode(self):
        result = self.run_cli(demo(card("3 steps", "Three steps.")), "--strict")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stdout, r"(?m)^PASS\s+N1\s")

    def test_json_output_lists_every_row(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "demo.json").write_text(json.dumps(self.BAD))
            out = Path(folder, "out.json")
            subprocess.run([sys.executable, "-I", str(SCRIPT), folder, "--json", str(out)],
                           capture_output=True, text=True, check=True)
            rows = json.loads(out.read_text())
        self.assertTrue(any(r["item"] == "N1" and r["status"] == "LOOK" for r in rows))

    def test_demo_json_path_is_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, "demo.json")
            path.write_text(json.dumps(demo(card("Hi", "Hello."))))
            result = subprocess.run([sys.executable, "-I", str(SCRIPT), str(path)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_file_exits_with_a_plan_lint_message(self):
        result = subprocess.run([sys.executable, "-I", str(SCRIPT), "/nonexistent-folder"],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("plan-lint:", result.stderr)

    def test_invalid_demo_json_exits_with_the_schema_problem(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "demo.json").write_text(json.dumps({"title": "x"}))
            result = subprocess.run([sys.executable, "-I", str(SCRIPT), folder], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("plan-lint:", result.stderr)


class ShippedPlanTests(unittest.TestCase):
    def test_every_shipped_demo_json_lints_without_crashing(self):
        plans = sorted([*REPO.glob("examples/*/demo.json"), *REPO.glob("templates/**/demo.json")])
        self.assertTrue(plans)
        for path in plans:
            with self.subTest(plan=str(path.relative_to(REPO))):
                result = subprocess.run([sys.executable, "-I", str(SCRIPT), str(path)],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, result.stderr)
                print(f"\n[{path.relative_to(REPO)}]\n{result.stdout.strip()}", file=sys.stderr)


if __name__ == "__main__":
    unittest.main()
