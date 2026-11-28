"""Look templates (docs/templates.md): id rules, where a template is found and in what order,
refusing symlinks, schema checks, how a template's look merges under demo.json, that the built-in
house template draws exactly the default plan, and that check-cut.py reads the effective look.
Run: python3 -I tests/test_templates.py"""

import importlib.util
import json
import os
import subprocess
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
from keynote.model import Zoom  # noqa: E402


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
        make_workspace(self.root / "demos")


def make_workspace(folder: Path) -> Path:
    """What scripts/new-workspace.sh leaves behind that marks a demos workspace."""
    folder.mkdir(parents=True, exist_ok=True)
    for name in templates.WORKSPACE_MARKERS:
        (folder / name).write_text("")
    return folder


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

    def test_the_only_workspace_root_is_the_workspace_that_holds_the_demo(self):
        self.assertEqual(templates.workspace_roots(self.root / "demos" / "acme", cwd=self.root / "cwd"),
                         [self.root / "demos" / "_templates"])

    def test_demo_root_env_wins_over_the_demo_parent(self):
        os.environ["DEMO_ROOT"] = str(self.root / "env-root")
        roots = templates.workspace_roots(self.root / "demos" / "acme", cwd=self.root / "cwd")
        self.assertEqual(roots, [(self.root / "env-root" / "_templates").resolve()])
        write_template(self.root / "env-root" / "_templates", "shared-look", name="env")
        write_template(self.root / "demos" / "_templates", "shared-look", name="parent")
        self.assertEqual(templates.find("shared-look", self.root / "demos" / "acme", self.root / "cwd").name, "env")

    def test_a_demo_outside_a_workspace_never_reads_a_sibling_templates_folder(self):
        downloads = self.root / "Downloads"  # an unzipped share: demo plus its own _templates/house
        write_template(downloads / "_templates", "house", {"zoom": {"dur": 3.9}}, name="Planted")
        write_template(downloads / "_templates", "planted-look")
        self.assertEqual(templates.workspace_roots(downloads / "shared-demo", cwd=self.root), [])
        self.assertEqual(templates.find("house", downloads / "shared-demo", cwd=self.root).where, "built-in")
        with self.assertRaisesRegex(templates.TemplateError, "not found"):
            templates.find("planted-look", downloads / "shared-demo", cwd=self.root)

    def test_cwd_and_its_parent_templates_are_not_searched_for_a_demo(self):
        write_template(self.root / "cwd" / "demos" / "_templates", "cwd-look")
        with self.assertRaisesRegex(templates.TemplateError, "not found"):
            templates.find("cwd-look", self.root / "demos" / "acme", self.root / "cwd")

    def test_without_a_demo_the_root_is_the_one_the_studio_lists(self):
        # Same rule as app/server/demos.mjs demoRoot(): ./demos, else the current folder if it is a workspace.
        self.assertEqual(templates.WORKSPACE_MARKERS, ("check.py", "AGENTS.md"))  # = demos.mjs WORKSPACE_MARKERS
        self.assertEqual(templates.demo_root(cwd=self.root), self.root / "demos")
        bare = self.root / "bare"
        bare.mkdir()
        self.assertIsNone(templates.demo_root(cwd=bare))
        self.assertEqual(templates.demo_root(cwd=make_workspace(self.root / "ws")), self.root / "ws")
        self.assertEqual(templates.demo_root(cwd=bare, env={"DEMO_ROOT": "x"}), (bare / "x").resolve())

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


    def test_a_window_too_big_for_its_shadow_layer_is_refused_before_any_render(self):
        write_template(self.root / "demos" / "_templates", "huge", {"window": {"rect": [120, 40, 1680, 920]}})
        with self.assertRaises(templates.TemplateError) as caught:
            templates.find("huge", self.root / "demos" / "acme", cwd=self.root)
        self.assertIn("at most 1620x800", str(caught.exception))


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
        self.assertEqual({k: brand[k] for k in ("ink", "accent", "sweep")},
                         {"ink": "#101010", "accent": "#2255FF", "sweep": ["#2255FF", "#7A99FF"]})  # sweep follows the accent
        self.assertIn("background", brand)  # the house glow, tinted to the accent
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

    def test_a_house_cut_with_a_product_tinted_glow_is_checked_against_what_the_build_drew(self):
        check = load_script("check-cut.py")
        look = looks.defaults()
        tinted = looks.brand_config(look, {"accent": "#2563EB"})["background"]
        plan = {"look": {**look, "brand": {**look["brand"], "background": tinted}},
                "look_samples": {"background": {"1880,1040": "#969DCD"}}}
        targets, _ = check.background_targets(plan)
        self.assertEqual(targets, {(1880, 1040): "#969DCD"})


class CopierHelpers(TemplateCase):
    def test_template_id_is_slug_plus_six_hex_of_the_hash(self):
        copier = load_script("template-from-video.py")
        self.assertEqual(copier.template_id("My Cool Launch Video.mp4", "ab12cd" + "0" * 58), "my-cool-launch-video-ab12cd")
        self.assertTrue(templates.ID.match(copier.template_id("!!!.mp4", "ffffff" + "0" * 58)))

    def test_a_link_is_told_apart_from_a_file_path(self):
        copier = load_script("template-from-video.py")
        for text in ("https://www.youtube.com/watch?v=abc", "HTTP://example.com/a.mp4", "ftp://example.com/a.mp4"):
            self.assertTrue(copier.is_link(text), text)
        for text in ("clip.mp4", "/Videos/https-launch.mp4", "./https://x.mp4", "C:/v.mp4", ""):
            self.assertFalse(copier.is_link(text), text)

    def test_only_http_and_https_links_with_a_host_are_accepted(self):
        copier = load_script("template-from-video.py")
        self.assertEqual(copier.check_link("https://youtu.be/abc?t=3"), "https://youtu.be/abc?t=3")
        self.assertEqual(copier.check_link("http://example.com/v"), "http://example.com/v")
        for bad in ("ftp://example.com/a.mp4", "file:///etc/passwd", "https://", "https:///path",
                    "https://exa mple.com/v", "https://example.com/v\n--exec", "javascript://x"):
            with self.assertRaises(ValueError, msg=bad):
                copier.check_link(bad)

    def test_yt_dlp_is_asked_for_one_mp4_up_to_1080p_with_sound_into_scratch(self):
        copier = load_script("template-from-video.py")
        work = Path("/scratch/look")
        args = copier.yt_dlp_args("/opt/bin/yt-dlp", "https://youtu.be/abc", work)
        self.assertEqual(args[0], "/opt/bin/yt-dlp")
        self.assertEqual(args[-2:], ["--", "https://youtu.be/abc"])  # the link can never read as an option
        self.assertIn("--no-playlist", args)
        self.assertIn("--ignore-config", args)
        fmt = args[args.index("-f") + 1]
        self.assertTrue(fmt.startswith("bv*[height<=1080][ext=mp4]+ba"), fmt)  # picture and sound (loudness)
        self.assertNotIn("height>", fmt)
        self.assertEqual(args[args.index("--merge-output-format") + 1], "mp4")
        output = args[args.index("-o") + 1]
        self.assertTrue(output.startswith(str(work) + os.sep), output)
        self.assertTrue(all(isinstance(a, str) for a in args))

    def test_yt_dlp_report_gives_title_and_downloaded_file(self):
        copier = load_script("template-from-video.py")
        text = 'noise\n{"title": "Sintel | Trailer", "filepath": "/scratch/look/reference.mp4"}\n'
        self.assertEqual(copier.parse_download_report(text), ("Sintel | Trailer", Path("/scratch/look/reference.mp4")))
        with self.assertRaises(ValueError):
            copier.parse_download_report("no json here\n")

    def test_a_link_template_id_comes_from_the_title(self):
        copier = load_script("template-from-video.py")
        sha = "ab12cd" + "0" * 58
        self.assertEqual(copier.title_template_id("Sintel v1.0 | Official Trailer", sha),
                         "sintel-v1-0-official-trailer-ab12cd")
        self.assertEqual(copier.title_template_id("", sha), "look-ab12cd")
        self.assertTrue(templates.ID.match(copier.title_template_id("\u2603" * 90, sha)))
        self.assertTrue(templates.ID.match(copier.title_template_id("x" * 200, sha)))

    def test_a_link_source_may_record_its_url_and_title_but_nothing_else(self):
        cli = load_script("templates.py")
        folder = write_template(self.root, "sintel-trailer-ab12cd")
        source = {"file": "Sintel Trailer", "url": "https://youtu.be/abc", "title": "Sintel Trailer", "sha256": "ab"}
        (folder / "source.json").write_text(json.dumps(source))
        self.assertFalse([p for p in cli.folder_problems(folder) if "source.json" in p])
        (folder / "source.json").write_text(json.dumps({**source, "uploader": "Someone"}))
        self.assertIn("source.json has fields beyond provenance: uploader", cli.folder_problems(folder))

    def test_a_frame_time_past_the_last_picture_is_skipped_so_the_sheets_still_build(self):
        # A container can run longer than its video (sound past the last picture): ffmpeg then writes
        # nothing for the last time, and the numbered sequence the contact sheets read had a hole.
        copier = load_script("template-from-video.py")
        video = self.root / "short.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=1",
                        "-pix_fmt", "yuv420p", video], check=True)
        stills = copier.extract_stills(video, [0.2, 0.5, 3.0], self.root / "frames")
        self.assertEqual([s["file"] for s in stills], ["f0001.png", "f0002.png"])
        self.assertEqual(sorted(p.name for p in (self.root / "frames").iterdir()), ["f0001.png", "f0002.png"])
        sheets = copier.contact_sheets(stills, self.root / "frames", self.root / "sheets")
        self.assertEqual(len(sheets[0]["tiles"]), 2)

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


def write_tagged(root: Path, template_id: str, best_for: list[str], name: str = "T") -> Path:
    folder = write_template(root, template_id, name=name)
    data = json.loads((folder / "template.json").read_text())
    (folder / "template.json").write_text(json.dumps({**data, "best_for": best_for}))
    return folder


class Suggest(TemplateCase):
    """templates.py suggest: picks a look (or a motion style) from the product's traits, so a demo gets
    a fitting template without the user naming one, and says why in a line to show the user."""

    def setUp(self):
        super().setUp()
        self.cli = load_script("templates.py")
        self.demo = self.root / "demos" / "acme"

    def test_best_for_tags_are_optional_short_lowercase_and_unique(self):
        base = {"id": "abc", "name": "x", "look": {}}
        self.assertEqual(lib.validate({**base, "best_for": ["dark ui", "fintech"]}, "template"), [])
        self.assertTrue(lib.validate({**base, "best_for": ["Dark UI"]}, "template"))
        self.assertTrue(lib.validate({**base, "best_for": ["x" * 41]}, "template"))
        self.assertTrue(lib.validate({**base, "best_for": "fintech"}, "template"))

    def test_a_template_whose_tags_match_the_traits_is_picked_and_the_reason_named(self):
        write_tagged(self.root / "demos" / "_templates", "night-look", ["dark ui", "fintech"])
        write_tagged(self.root / "demos" / "_templates", "sunny-look", ["light ui", "kids"])
        pick = self.cli.suggest("look", "Fintech dashboard, dark UI, for CFOs", self.demo, cwd=self.root)
        self.assertEqual(pick["id"], "night-look")
        self.assertEqual(pick["matched"], ["dark ui", "fintech"])
        self.assertIn("night-look", pick["tell_user"])
        self.assertIn("dark ui, fintech", pick["tell_user"])

    def test_no_match_falls_back_to_the_default_and_says_so(self):
        write_tagged(self.root / "demos" / "_templates", "night-look", ["dark ui", "fintech"])
        pick = self.cli.suggest("look", "a recipe app for home cooks", self.demo, cwd=self.root)
        self.assertEqual((pick["id"], pick["matched"]), ("house", []))
        self.assertIn("default", pick["tell_user"])

    def test_a_tag_matches_only_when_all_its_words_are_in_the_traits(self):
        write_tagged(self.root / "demos" / "_templates", "night-look", ["dark ui"])
        pick = self.cli.suggest("look", "dark mode marketing site", self.demo, cwd=self.root)
        self.assertEqual(pick["id"], "house")

    def test_on_a_tie_the_workspace_template_wins_over_a_built_in(self):
        write_tagged(self.root / "demos" / "_templates", "my-house-look", ["light ui", "saas"])
        pick = self.cli.suggest("look", "light ui saas tool", self.demo, cwd=self.root)
        self.assertEqual((pick["id"], pick["where"]), ("my-house-look", "workspace"))

    def test_an_invalid_workspace_template_is_skipped_not_picked(self):
        # A tag no built-in look has, so only the broken template could match it.
        folder = write_tagged(self.root / "demos" / "_templates", "broken-look", ["telescope"])
        (folder / "template.json").write_text("{not json")
        pick = self.cli.suggest("look", "telescope", self.demo, cwd=self.root)
        self.assertEqual(pick["id"], "house")

    def test_the_built_in_looks_are_picked_by_their_tags(self):
        self.assertEqual(self.cli.suggest("look", "dark ui developer tool", self.demo, cwd=self.root)["id"], "midnight")
        self.assertEqual(self.cli.suggest("look", "friendly consumer education app", self.demo, cwd=self.root)["id"], "paper")
        self.assertEqual(self.cli.suggest("look", "minimal b2b fintech", self.demo, cwd=self.root)["id"], "mono")

    def test_motion_styles_all_have_tags_and_a_dark_fintech_product_gets_nocturne(self):
        styles = sorted((REPO / "motion-templates").glob("*/style.json"))
        self.assertTrue(styles)
        for path in styles:
            self.assertTrue(json.loads(path.read_text()).get("best_for"), f"{path} has no best_for")
        pick = self.cli.suggest("motion", "dark ui, fintech, premium", None, cwd=self.root)
        self.assertEqual(pick["id"], "nocturne")
        self.assertEqual(self.cli.suggest("motion", "a recipe app", None, cwd=self.root)["id"], "airy")

    def test_cli_prints_the_pick_and_the_line_to_tell_the_user(self):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = self.cli.main(["suggest", "--traits", "a recipe app", "--demo-dir", str(self.demo)])
        self.assertEqual(code, 0)
        text = out.getvalue()
        self.assertRegex(text, r"(?m)^pick house \(built-in\)")
        self.assertRegex(text, r"(?m)^tell the user: ")


if __name__ == "__main__":
    unittest.main(verbosity=1)
