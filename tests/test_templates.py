"""Look templates (docs/templates.md): id rules, where a template is found and in what order,
refusing symlinks, schema checks, how a template's look merges under demo.json, that the built-in
house template draws exactly the default plan, and that check-cut.py reads the effective look.
Run: python3 -I tests/test_templates.py"""

import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import demolib as lib  # noqa: E402
from keynote import look as looks  # noqa: E402
from keynote import spec  # noqa: E402
from keynote import templates  # noqa: E402
from keynote.brand import load_brand  # noqa: E402
from keynote.overlay import OverlayTimeline  # noqa: E402
from keynote.timeline import build_plan  # noqa: E402
from keynote.window import canvas_size, run_frames, zoom_progress  # noqa: E402
from keynote.model import Run, Zoom  # noqa: E402


def load_script(name: str):
    path = REPO / "scripts" / name
    module_spec = importlib.util.spec_from_file_location(name.replace("-", "_").removesuffix(".py"), path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def write_template(root: Path, template_id: str, look: dict | None = None, name: str = "T") -> Path:
    folder = root / template_id
    folder.mkdir(parents=True)
    data = {"id": template_id, "name": name, "look": look or {}}
    (folder / "template.json").write_text(json.dumps(data))
    return folder


class TemplateCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.addCleanup(looks.reset)
        env = mock.patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("DEMO_ROOT", None)


class Ids(TemplateCase):
    def test_valid_ids_pass(self):
        for good in ("house", "my-look-a1b2c3", "abc", "a" * 64):
            self.assertEqual(templates.check_id(good), good)

    def test_bad_ids_are_refused_with_the_rule(self):
        for bad in ("ab", "-abc", "Abc", "a_b_c", "../etc", "a" * 65, "", None, 7, "abc/def"):
            with self.assertRaises(templates.TemplateError) as caught:
                templates.check_id(bad)
            self.assertIn("lowercase letters, digits and dashes", str(caught.exception))

    def test_demo_schema_accepts_a_template_id_and_rejects_a_path(self):
        base = {"title": "T", "sequence": [{"card": "a", "title": "Hi"}]}
        self.assertEqual(lib.validate({**base, "template": "house"}, "demo"), [])
        self.assertTrue(lib.validate({**base, "template": "../house"}, "demo"))


class Resolution(TemplateCase):
    def test_workspace_template_wins_over_built_in(self):
        demos = self.root / "demos"
        write_template(demos / "_templates", "house", name="Mine")
        found = templates.find("house", demos / "acme", cwd=self.root / "elsewhere")
        self.assertEqual((found.where, found.name), ("workspace", "Mine"))

    def test_built_in_is_used_when_the_workspace_has_none(self):
        found = templates.find("house", self.root / "demos" / "acme", cwd=self.root)
        self.assertEqual(found.where, "built-in")
        self.assertEqual(found.folder, REPO / "look-templates" / "house")

    def test_search_order_is_demo_parent_then_demo_root_then_cwd(self):
        demo_root = self.root / "env-root"
        os.environ["DEMO_ROOT"] = str(demo_root)
        roots = templates.workspace_roots(self.root / "demos" / "acme", cwd=self.root / "cwd")
        self.assertEqual(roots[:3], [self.root / "demos" / "_templates", demo_root / "_templates",
                                     self.root / "cwd" / "demos" / "_templates"])
        write_template(demo_root / "_templates", "shared-look")
        write_template(self.root / "cwd" / "demos" / "_templates", "shared-look", name="later")
        self.assertEqual(templates.find("shared-look", self.root / "demos" / "acme", self.root / "cwd").name, "T")

    def test_missing_template_lists_available_ids_and_the_command(self):
        write_template(self.root / "demos" / "_templates", "mine-123456")
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("nope-000000", self.root / "demos" / "acme", cwd=self.root)
        text = str(caught.exception)
        self.assertIn("not found", text)
        self.assertIn("mine-123456", text)
        self.assertIn("house", text)
        self.assertIn("templates.py list", text)

    def test_symlinked_template_folder_is_refused(self):
        real = write_template(self.root / "outside", "linked-look")
        (self.root / "demos" / "_templates").mkdir(parents=True)
        (self.root / "demos" / "_templates" / "linked-look").symlink_to(real, target_is_directory=True)
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("linked-look", self.root / "demos" / "acme", cwd=self.root)
        self.assertIn("symlink", str(caught.exception))

    def test_symlinked_template_json_is_refused(self):
        folder = self.root / "demos" / "_templates" / "sneaky"
        folder.mkdir(parents=True)
        other = self.root / "other.json"
        other.write_text(json.dumps({"id": "sneaky", "name": "x", "look": {}}))
        (folder / "template.json").symlink_to(other)
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("sneaky", self.root / "demos" / "acme", cwd=self.root)
        self.assertIn("symlink", str(caught.exception))

    def test_id_must_match_its_folder(self):
        folder = self.root / "demos" / "_templates" / "folder-name"
        folder.mkdir(parents=True)
        (folder / "template.json").write_text(json.dumps({"id": "other-name", "name": "x", "look": {}}))
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("folder-name", self.root / "demos" / "acme", cwd=self.root)
        self.assertIn("does not match its folder", str(caught.exception))


class Schema(TemplateCase):
    def test_house_template_validates(self):
        data = json.loads((REPO / "look-templates" / "house" / "template.json").read_text())
        self.assertEqual(lib.validate(data, "template"), [])

    def test_only_id_name_and_look_are_required(self):
        self.assertEqual(lib.validate({"id": "abc", "name": "x", "look": {}}, "template"), [])
        errors = lib.validate({"id": "abc"}, "template")
        self.assertIn("(top level): missing required field 'name'", errors)
        self.assertIn("(top level): missing required field 'look'", errors)

    def test_colours_must_be_hex(self):
        errors = lib.validate({"id": "abc", "name": "x", "look": {"brand": {"accent": "red"}}}, "template")
        self.assertTrue(any("look.brand.accent" in e for e in errors), errors)

    def test_no_file_paths_or_unknown_fields(self):
        errors = lib.validate({"id": "abc", "name": "x", "look": {"brand": {"logo": "../../x.png"}},
                               "preview": "/etc/passwd"}, "template")
        self.assertTrue(any("unknown field 'preview'" in e for e in errors), errors)
        self.assertTrue(any("unknown field 'logo'" in e for e in errors), errors)

    def test_shadow_cannot_load_a_url(self):
        look = {"window": {"shadow": "0 0 1px url(http://x)"}}
        self.assertTrue(lib.validate({"id": "abc", "name": "x", "look": look}, "template"))

    def test_enums(self):
        look = {"title": {"reveal": "spin"}, "end": {"kind": "fireworks"}, "transitions": {"cut": "wipe"}}
        errors = lib.validate({"id": "abc", "name": "x", "look": look}, "template")
        self.assertEqual(len(errors), 3, errors)

    def test_a_look_that_cannot_be_drawn_is_refused(self):
        write_template(self.root / "demos" / "_templates", "too-big", {"window": {"rect": [800, 100, 1560, 800]}})
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("too-big", self.root / "demos" / "acme", cwd=self.root)
        self.assertIn("inside the 1920x1080 frame", str(caught.exception))


class Merge(TemplateCase):
    def test_house_defaults_match_spec(self):
        d = looks.defaults()
        self.assertEqual(d["window"]["rect"], [180, 100, 1560, 800])
        self.assertEqual(d["zoom"], {"scale": 1.15, "dur": 1.10, "ease": [0.37, 0, 0.63, 1]})
        self.assertEqual(d["pill"]["center_y"], 962)
        self.assertEqual(d["audio"]["lufs"], -14.0)

    def test_house_template_json_equals_the_defaults(self):
        data = json.loads((REPO / "look-templates" / "house" / "template.json").read_text())
        self.assertEqual(looks.effective(data["look"]), looks.defaults())

    def test_template_values_merge_over_defaults_without_touching_them(self):
        merged = looks.effective({"zoom": {"scale": 1.1}, "brand": {"background": {"base": "#000000"}}})
        self.assertEqual(merged["zoom"], {"scale": 1.1, "dur": 1.10, "ease": [0.37, 0, 0.63, 1]})
        self.assertEqual(merged["brand"]["background"]["base"], "#000000")
        self.assertEqual(len(merged["brand"]["background"]["fields"]), 5)
        self.assertEqual(looks.defaults()["zoom"]["scale"], 1.15)

    def test_demo_brand_wins_over_template_brand(self):
        template = {"brand": {"accent": "#112233", "ink": "#000000", "background": {"base": "#101010"}}}
        demo = {"accent": "#ABCDEF", "background": {"fields": ["#111111"] * 5}}
        merged = looks.brand_config(template, demo)
        self.assertEqual(merged["accent"], "#ABCDEF")
        self.assertEqual(merged["ink"], "#000000")
        self.assertEqual(merged["background"], {"base": "#101010", "fields": ["#111111"] * 5})
        brand = load_brand(merged)
        self.assertEqual((brand.accent, brand.highlight), ("#ABCDEF", "#ABCDEF"))

    def test_template_highlight_colour_sets_the_box_stroke(self):
        brand = load_brand(looks.brand_config({"brand": {"highlight": "#00AA55"}}, None))
        self.assertEqual(brand.highlight, "#00AA55")

    def test_apply_swaps_engine_values_and_reset_restores(self):
        look = looks.effective({"window": {"rect": [100, 80, 1720, 860], "radius": 30},
                                "zoom": {"scale": 1.1, "dur": 0.8, "ease": [0.42, 0, 0.58, 1]},
                                "transitions": {"window_in": 0.5}, "end": {"kind": "card", "seconds": 4}})
        looks.apply(look)
        self.assertEqual(spec.WINDOW_REST, spec.Rect(100, 80, 1720, 860))
        self.assertAlmostEqual(spec.WINDOW_ASPECT, 1720 / 860)
        self.assertEqual((spec.ZOOM_MAX, spec.ZOOM_MOVE_SECONDS, spec.ENTRY_SECONDS), (1.1, 0.8, 0.5))
        self.assertEqual((spec.CARD_SECONDS["end"], spec.OUTRO_SECONDS), (4, 0.0))
        self.assertEqual(canvas_size(), (1720 + 300, 860 + 340))
        zoom = Zoom(at=1.0, scale=1.1, focus=(960, 500), hold=3.0)
        self.assertAlmostEqual(zoom_progress(zoom, 1.4), 0.5, places=6)  # symmetric ease, half of 0.8 s
        looks.reset()
        self.assertEqual(spec.WINDOW_REST, spec.Rect(180, 100, 1560, 800))
        self.assertEqual((spec.ZOOM_MAX, spec.OUTRO_SECONDS, spec.CARD_SECONDS["end"]), (1.15, 5.0, 7.9))


TODO = REPO / "examples" / "todo-sample"


def todo_plan():
    cfg = json.loads((TODO / "demo.json").read_text())
    probe = lambda path: (lib.duration(path), lib.probe_size(path))  # noqa: E731
    return build_plan(cfg, TODO / "recordings" / "raw", probe), cfg


class HouseIsTheDefault(TemplateCase):
    def frames(self, plan, cfg):
        windows = {n: run_frames(run) for n, run in enumerate(plan.runs)}
        by_frame = {run.start + i: f for n, run in enumerate(plan.runs) for i, f in enumerate(windows[n])}
        timeline = OverlayTimeline(plan, by_frame, cfg["title"])
        return windows, [timeline.layers(f) for f in range(plan.total_frames)]

    def test_todo_sample_with_house_template_draws_the_same_plan_and_frames(self):
        default_plan, cfg = todo_plan()
        default_frames = self.frames(default_plan, cfg)
        house = templates.find("house", TODO, cwd=self.root)
        looks.apply(looks.effective(house.look))
        house_plan, _ = todo_plan()
        self.assertEqual(house_plan, default_plan)
        self.assertEqual(self.frames(house_plan, cfg), default_frames)
        self.assertEqual(load_brand(looks.brand_config(house.look, cfg.get("brand"))), load_brand(cfg.get("brand")))

    def test_a_different_template_changes_the_plan(self):
        default_plan, _ = todo_plan()
        looks.apply(looks.effective({"zoom": {"dur": 0.8}, "pacing": {"shot_max": 4, "zoom_every": 5}}))
        plan, _ = todo_plan()
        self.assertNotEqual(plan, default_plan)
        self.assertTrue(any("without a zoom" in w for w in plan.warnings), plan.warnings)

    def test_build_keynote_resolve_look_applies_the_template(self):
        build = load_script("build-keynote.py")
        demo_dir = self.root / "demos" / "acme"
        write_template(self.root / "demos" / "_templates", "slow-zoom-abcdef", {"zoom": {"dur": 1.6},
                                                                               "brand": {"ink": "#101010"}})
        cfg = {"template": "slow-zoom-abcdef", "brand": {"accent": "#2255FF"}}
        template_id, look, brand = build.resolve_look(cfg, demo_dir)
        self.assertEqual((template_id, look["zoom"]["dur"], spec.ZOOM_MOVE_SECONDS), ("slow-zoom-abcdef", 1.6, 1.6))
        self.assertEqual(brand, {"ink": "#101010", "accent": "#2255FF"})
        with self.assertRaises(SystemExit) as caught:
            build.resolve_look({"template": "missing-000000"}, demo_dir)
        self.assertIn("templates.py list", str(caught.exception))


class CheckerReadsTheLook(TemplateCase):
    def test_old_plans_get_the_house_look_and_reference_samples(self):
        check = load_script("check-cut.py")
        self.assertEqual(check.plan_look({}), looks.defaults())
        targets, against = check.background_targets({"cards": []})
        self.assertEqual((targets, against), (check.BG_SAMPLES, "the reference"))

    def test_template_background_is_checked_against_what_the_build_drew(self):
        check = load_script("check-cut.py")
        look = looks.effective({"brand": {"background": {"base": "#202020"}}})
        plan = {"template": "dark-abcdef", "look": look,
                "look_samples": {"background": {"40,40": "#202020", "960,40": "#212121"}}}
        targets, against = check.background_targets(plan)
        self.assertEqual(targets, {(40, 40): "#202020", (960, 40): "#212121"})
        self.assertIn("dark-abcdef", against)


class CopierHelpers(TemplateCase):
    def test_template_id_is_slug_plus_six_hex_of_the_hash(self):
        copier = load_script("template-from-video.py")
        self.assertEqual(copier.template_id("My Cool Launch Video.mp4", "ab12cd" + "0" * 58), "my-cool-launch-video-ab12cd")
        self.assertTrue(templates.ID.match(copier.template_id("!!!.mp4", "ffffff" + "0" * 58)))

    def test_scene_times_parse_from_showinfo(self):
        copier = load_script("template-from-video.py")
        text = "[Parsed_showinfo_2 @ 0x1] n:   0 pts:  12 pts_time:1.5 duration\n" \
               "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  99 pts_time:12.25 duration\n"
        self.assertEqual(copier.parse_scene_times(text), [1.5, 12.25])

    def test_ease_and_timing_fit_recover_a_sine_zoom(self):
        copier = load_script("template-from-video.py")
        from keynote.easing import cubic_bezier
        sine = cubic_bezier(0.37, 0, 0.63, 1)
        start, dur, rest, peak = 2.0, 1.1, 1560, 1794
        widths = [(n / 30, round(rest + (peak - rest) * sine(min(1, max(0, (n / 30 - start) / dur)))))
                  for n in range(0, 120)]
        moving = [i for i, (_, w) in enumerate(widths) if rest + 2 < w < peak - 2]
        a, b = moving[0] - 1, moving[-1] + 1
        span = widths[b][0] - widths[a][0]
        name, curve, _ = copier.fit_ease([((t - widths[a][0]) / span, (w - rest) / (peak - rest))
                                          for t, w in widths[a:b + 1]])
        self.assertEqual(name, "ease-in-out sine")
        t0, fitted = copier.fit_timing(widths, a, b, span, rest, peak, curve, 30)
        self.assertLess(span, 1.06)  # visibly moving frames undercount the move
        self.assertAlmostEqual(fitted, 1.1, delta=0.03)
        self.assertAlmostEqual(t0, 2.0, delta=0.03)

    def test_merge_times_drops_near_duplicates(self):
        copier = load_script("template-from-video.py")
        self.assertEqual(copier.merge_times([1.0, 5.0], [1.1, 3.0, 5.2]), [1.0, 3.0, 5.0])

    def test_frame_plan_is_dense_early_and_around_cuts(self):
        copier = load_script("template-from-video.py")
        times = copier.frame_times(60.0, [30.0])
        self.assertIn(0.0, times)
        self.assertIn(19.5, times)
        self.assertTrue(any(29.5 < t < 30.0 for t in times) and any(30.0 < t < 30.5 for t in times))
        self.assertEqual(times, sorted(set(times)))


if __name__ == "__main__":
    unittest.main(verbosity=1)
