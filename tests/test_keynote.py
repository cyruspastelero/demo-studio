"""Behaviour of the keynote engine (scripts/keynote/): easing, the window and zoom math, pill and
highlight geometry, title timing, plan building from demo.json, and the new schema fields.
Every expected number comes from docs/quality-bar.md. Run: python3 -I tests/test_keynote.py"""

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import demolib as lib  # noqa: E402
from keynote import spec  # noqa: E402
from keynote.brand import background_fields, load_brand  # noqa: E402
from keynote.compose import piecewise  # noqa: E402
from keynote.easing import EASE_IN_OUT_CUBIC, EASE_IN_OUT_SINE, EASE_OUT_CUBIC, cubic_bezier  # noqa: E402
from keynote.model import Callout, Card, PlanError, Run, Zoom, accent_index, card_kind, fit_crop  # noqa: E402
from keynote.overlay import box_geometry, pill_state, title_card_state  # noqa: E402
from keynote.spec import Rect  # noqa: E402
from keynote.timeline import build_plan  # noqa: E402
from keynote.voice_sync import end_card_times, match_times, word_offsets  # noqa: E402
from keynote.window import quantize, rise_offset, run_frames, window_rect, zoom_center, zoom_progress  # noqa: E402

FPS = spec.FPS


def run_with(*zooms, frames=600):
    return Run(shots=(0,), start=0, frames=frames, zooms=tuple(zooms), fade_out=False)


def evaluate(expression: str, t: float) -> float:
    """Evaluates the if(lt(t,..),..) trees compose.piecewise writes, the way ffmpeg would."""
    if not re.fullmatch(r"[0-9a-z(),.\-]+", expression):  # only our own generated if/lt/number trees
        raise ValueError(expression)
    python = expression.replace("if(", "iff(")
    return eval(python, {"__builtins__": {}, "iff": lambda c, a, b: a if c else b,  # noqa: S307
                         "lt": lambda a, b: a < b, "t": t})


class Easing(unittest.TestCase):
    def test_curves_start_at_zero_and_end_at_one(self):
        for ease in (EASE_OUT_CUBIC, EASE_IN_OUT_CUBIC, EASE_IN_OUT_SINE):
            self.assertEqual((ease(0), ease(1)), (0, 1))
            self.assertEqual((ease(-1), ease(2)), (0, 1))

    def test_in_out_curves_are_symmetric(self):
        for ease in (EASE_IN_OUT_CUBIC, EASE_IN_OUT_SINE):
            self.assertAlmostEqual(ease(0.5), 0.5, places=4)
            for x in (0.1, 0.2, 0.3, 0.4):
                self.assertAlmostEqual(ease(x) + ease(1 - x), 1.0, places=4)

    def test_ease_out_cubic_matches_the_css_curve_closely(self):
        for x in (0.1, 0.3, 0.5, 0.7, 0.9):
            self.assertAlmostEqual(EASE_OUT_CUBIC(x), 1 - (1 - x) ** 3, delta=0.02)

    def test_zoom_ease_is_slow_at_both_ends(self):
        self.assertLess(EASE_IN_OUT_SINE(0.1), 0.05)
        self.assertGreater(EASE_IN_OUT_SINE(0.9), 0.95)

    def test_linear_bezier_is_identity(self):
        line = cubic_bezier(0.25, 0.25, 0.75, 0.75)
        for x in (0.13, 0.5, 0.87):
            self.assertAlmostEqual(line(x), x, places=5)


class WindowMotion(unittest.TestCase):
    def test_window_rests_at_the_bar_rectangle_after_the_rise(self):
        self.assertEqual(window_rect(run_with(), 1.0), Rect(180, 100, 1560, 800))

    def test_rise_starts_below_frame_and_lands_in_0_7_s_mostly_early(self):
        self.assertEqual(window_rect(run_with(), 0).y, spec.ENTRY_FROM_TOP)
        self.assertEqual(rise_offset(spec.ENTRY_SECONDS), 0)
        halfway = rise_offset(spec.ENTRY_SECONDS / 2)
        self.assertLess(halfway, 0.2 * (spec.ENTRY_FROM_TOP - 100))  # ease-out: most travel in the first half

    def test_zoom_peaks_at_1_15_and_keeps_40_px_clear(self):
        for focus in ((180, 100), (1740, 900), (960, 500), (1700, 150)):
            zoom = Zoom(1.0, 1.15, focus, 3.0)
            frame = quantize(window_rect(run_with(zoom), zoom.landed + 0.5))
            self.assertEqual((frame.w, frame.h), (1794, 920))
            self.assertGreaterEqual(frame.x, 40)
            self.assertGreaterEqual(frame.y, 40)
            self.assertLessEqual(frame.x + frame.w, 1880)
            self.assertLessEqual(frame.y + frame.h, 1040)

    def test_pan_moves_the_centre_at_most_70_px_toward_the_target(self):
        zoom = Zoom(1.0, 1.15, (1700, 900), 3.0)
        cx, cy = zoom_center(zoom)
        self.assertLessEqual(((cx - 960) ** 2 + (cy - 500) ** 2) ** 0.5, 70.001)
        self.assertGreater(cx, 960)
        self.assertGreater(cy, 500)

    def test_zoom_moves_take_1_1_s_and_are_symmetric(self):
        zoom = Zoom(1.0, 1.15, (960, 500), 3.0)
        self.assertEqual(zoom_progress(zoom, 0.99), 0)
        self.assertAlmostEqual(zoom_progress(zoom, 1.0 + 0.55), 0.5, places=4)
        self.assertEqual(zoom_progress(zoom, 2.1 + 1.0), 1)
        self.assertAlmostEqual(zoom_progress(zoom, zoom.out_start + 0.55), 0.5, places=4)
        self.assertEqual(zoom_progress(zoom, zoom.end), 0)
        mid = window_rect(run_with(zoom), 1.55).w
        self.assertAlmostEqual(mid, (1560 + 1794) / 2, delta=1)

    def test_whole_window_scales_including_its_canvas(self):
        zoom = Zoom(1.0, 1.15, (960, 500), 3.0)
        frames = run_frames(run_with(zoom, frames=200))
        widths = {f.w for f in frames}
        self.assertIn(1560, widths)
        self.assertIn(1794, widths)
        peak = max(frames, key=lambda f: f.w)
        self.assertAlmostEqual(peak.canvas_w / peak.w, frames[-1].canvas_w / frames[-1].w, places=2)


class Geometry(unittest.TestCase):
    def test_crop_is_widened_to_the_window_shape_and_kept_inside(self):
        crop = fit_crop(Rect(540, 150, 840, 300), (1920, 1080))
        self.assertAlmostEqual(crop.w / crop.h, spec.WINDOW_ASPECT, places=2)
        self.assertGreaterEqual(crop.y, 0)
        edge = fit_crop(Rect(1800, 900, 120, 180), (1920, 1080))
        self.assertLessEqual(edge.x + edge.w, 1920.01)
        self.assertLessEqual(edge.y + edge.h, 1080.01)

    def test_highlight_box_maps_through_the_window_and_is_padded(self):
        crop = Rect(540, 150, 840, 430.77)
        frame = quantize(Rect(180, 100, 1560, 800))
        box = box_geometry(Rect(673, 366, 268, 32), crop, frame)
        k = 1560 / 840
        self.assertAlmostEqual(box.x, 180 + (673 - 540) * k - 15, places=3)
        self.assertAlmostEqual(box.y, 100 + (366 - 150) * k - 9, places=3)
        self.assertAlmostEqual(box.w, 268 * k + 30, places=3)
        self.assertAlmostEqual(box.h, 32 * k + 18, places=3)

    def test_highlight_box_moves_with_a_zooming_window(self):
        crop = Rect(540, 150, 840, 430.77)
        zoom = Zoom(1.0, 1.15, (960, 500), 3.0)
        run = run_with(zoom)
        at_rest = box_geometry(Rect(673, 366, 268, 32), crop, quantize(window_rect(run, 0.9)))
        zoomed = box_geometry(Rect(673, 366, 268, 32), crop, quantize(window_rect(run, zoom.landed + 1)))
        self.assertGreater(zoomed.w, at_rest.w)

    def test_pill_constants_match_the_bar(self):
        self.assertEqual(spec.PILL_CENTER, (960, 962))
        self.assertEqual(spec.PILL_HEIGHT, 68)
        self.assertEqual(spec.PILL_AVATAR, 50)
        self.assertEqual((spec.PILL_FONT_SIZE, spec.PILL_FONT_WEIGHT), (30, 500))
        # The page draws pill and box geometry from the job's look (a template may change it); the
        # house values reach it through render.page_look() and are the page's own fallback too.
        from keynote.render import page_look
        self.assertEqual(page_look(), {"pill": {"centerY": 962, "height": 68, "radius": 999, "fontSize": 30},
                                       "box": {"stroke": 3, "radius": 12, "fill": 0.07, "halo": 0.10, "haloWidth": 6},
                                       "title": {"weight": 500}})
        page = (REPO / "scripts" / "keynote-page.mjs").read_text()
        for snippet in ("top: ${k.pill.centerY - k.pill.height / 2}px", "height: ${k.pill.height}px",
                        "padding: 9px 30px 9px 9px", "padding: 16px 32px",
                        "font-size: ${k.pill.fontSize}px; font-weight: 500; letter-spacing: -0.3px",
                        "width: 50px; height: 50px",
                        "border: ${k.box.stroke}px solid ${c.highlight}; border-radius: ${k.box.radius}px",
                        "background: ${rgba(c.highlight, k.box.fill)}; box-shadow: 0 0 0 ${k.box.haloWidth}px",
                        "pill: { centerY: 962, height: 68, radius: 999, fontSize: 30 }",
                        "box: { stroke: 3, radius: 12, fill: 0.07, halo: 0.1, haloWidth: 6 }"):
            self.assertIn(snippet, page)


class Pills(unittest.TestCase):
    CALLOUT = Callout(10.0, 14.0, "statement", "One click clears them")

    def test_pill_enters_over_0_45_s_and_exits_over_0_35_s(self):
        self.assertIsNone(pill_state(self.CALLOUT, 9.99))
        start = pill_state(self.CALLOUT, 10.0)
        self.assertEqual(start["opacity"], 0)
        self.assertEqual(start["ty"], 16)
        landed = pill_state(self.CALLOUT, 10.45)
        self.assertEqual((landed["opacity"], landed["ty"], landed["scale"]), (1, 0, 1))
        leaving = pill_state(self.CALLOUT, 14.35 - 1 / FPS)
        self.assertLess(leaving["opacity"], 0.05)
        self.assertGreater(leaving["blur"], 5)
        self.assertIsNone(pill_state(self.CALLOUT, 14.35))

    def test_words_stagger_by_0_07_s_with_blur(self):
        state = pill_state(self.CALLOUT, 10.07)
        first, second = state["words"][0], state["words"][1]
        self.assertGreater(first[2], 0)
        self.assertEqual(second[2], 0)
        self.assertEqual(second[3], spec.PILL_WORD_BLUR)
        self.assertTrue(all(w[1] == "pill" for w in state["words"]))  # brand-derived pill colour

    def test_person_pill_has_name_in_ink_and_role_in_grey(self):
        person = Callout(0, 4, "person", "Ana Cruz", "Product lead", "people/ana.png")
        state = pill_state(person, 2)
        self.assertEqual([w[0] for w in state["words"]], ["Ana", "Cruz,", "Product", "lead"])
        self.assertEqual([w[1] for w in state["words"]], ["ink", "ink", "role", "role"])
        self.assertEqual(state["avatar"], "people/ana.png")


class Titles(unittest.TestCase):
    CARD = Card(0, "card-intro", "hero", "Meet the team today", "Who builds it.", "team", "", False, 0, 90, 0, "")

    def test_words_reveal_one_by_one_with_one_accent(self):
        state = title_card_state(self.CARD, 0.13, 3.0, 0.4)
        opacities = [w[2] for w in state["title"]["words"]]
        self.assertGreater(opacities[0], 0)
        self.assertEqual(opacities[1:], [0, 0, 0])
        roles = [w[1] for w in state["title"]["words"]]
        self.assertEqual(roles.count("accent"), 1)
        self.assertEqual(roles[2], "accent")
        self.assertEqual(state["title"]["words"][1][3], spec.WORD_BLUR)

    def test_hero_settles_to_0_52_and_the_subtitle_follows(self):
        before = title_card_state(self.CARD, 0.9, 3.0, 0.4)
        self.assertEqual(before["title"]["scale"], 1)
        self.assertEqual(before["sub"]["words"][0][2], 0)
        after = title_card_state(self.CARD, 2.5, 3.0, 0.4)
        self.assertEqual(after["title"]["scale"], 0.52)
        self.assertEqual(after["title"]["ty"], -70)
        self.assertEqual(after["sub"]["words"][0][2], 1)

    def test_card_exit_fades_rises_and_blurs(self):
        self.assertEqual(title_card_state(self.CARD, 2.0, 3.0, 0.4)["block"], [1, 0, 0])
        gone = title_card_state(self.CARD, 3.4, 3.0, 0.4)["block"]
        self.assertEqual(gone[0], 0)
        self.assertEqual(gone[1], -60)

    def test_accent_matching_and_card_kinds(self):
        self.assertEqual(accent_index("Who is on the team?", "team"), 4)
        self.assertEqual(accent_index("Who is on the team?", "nope"), -1)
        self.assertEqual(card_kind({"subtitle": "x"}, False), "hero")
        self.assertEqual(card_kind({}, False), "section")
        self.assertEqual(card_kind({}, True), "end")
        self.assertEqual(card_kind({"kind": "section"}, True), "section")

    def test_end_card_words_lead_the_voice_by_0_1_s(self):
        card = Card(4, "card-end", "end", "Real app. Real clicks.", "", "clicks.", "", True, 0, 237, 150,
                    "Real app, real clicks. Made on a laptop.")
        title, _ = end_card_times(card, lead_in=0.3, seconds=4.0)
        offsets = dict((i, f) for i, (_, f) in enumerate(word_offsets(card.voiceover)))
        self.assertAlmostEqual(title[0], max(0, 0.3 - 0.1), places=6)
        self.assertAlmostEqual(title[3], 0.3 + offsets[3] * 4.0 - 0.1, places=6)
        self.assertEqual(title, sorted(title))


class SpokenWords(unittest.TestCase):
    def test_a_dotted_name_syncs_to_the_spoken_x_dot_y(self):
        spoken = word_offsets("Start today at example dot review.")
        times, cursor = match_times(["example.review"], spoken, 0, 0.0, 10.0, 0.05)
        self.assertEqual(cursor, 6)
        self.assertAlmostEqual(times[0], 10.0 * spoken[3][1] - spec.END_REVEAL_LEAD, places=6)

    def test_multi_word_matches_join_any_separator(self):
        spoken = word_offsets("Our AI powered notes app")
        times, cursor = match_times(["AI-powered", "notes"], spoken, 0, 0.0, 10.0, 0.05)
        self.assertEqual(cursor, 4)
        self.assertLess(times[0], times[1])

    def test_a_word_that_is_never_said_falls_back_to_the_stagger(self):
        spoken = word_offsets("Hello there")
        times, cursor = match_times(["missing.word"], spoken, 0, 2.0, 10.0, 0.05)
        self.assertEqual((times, cursor), ([2.05], 0))


class ProductColours(unittest.TestCase):
    """Boxes and statement pills take the product's colour (brand.accent), never a fixed red."""

    def test_no_brand_accent_means_neutral_ink_never_red(self):
        brand = load_brand({})
        self.assertEqual((brand.highlight, brand.pill_text), ("#171717", "#171717"))
        r, g, b = (int(brand.highlight[i:i + 2], 16) for i in (1, 3, 5))
        self.assertLess(max(r, g, b) - min(r, g, b), 8)  # grey, no hue

    def test_box_stroke_and_pill_text_follow_the_brand_accent(self):
        brand = load_brand({"accent": "#1d4ed8"})
        self.assertEqual(brand.highlight, "#1D4ED8")
        self.assertEqual(brand.pill_text, "#1D4ED8")  # already reads on white: kept as is

    def test_pill_text_is_darkened_until_it_reads_on_white(self):
        from keynote.brand import contrast_on_white
        brand = load_brand({"accent": "#22D3EE"})  # light cyan: about 1.8:1 on white
        self.assertEqual(brand.highlight, "#22D3EE")  # the box keeps the product's own colour
        self.assertGreaterEqual(contrast_on_white(brand.pill_text), spec.PILL_TEXT_MIN_CONTRAST)
        self.assertLess(contrast_on_white(brand.pill_text), spec.PILL_TEXT_MIN_CONTRAST + 0.5)  # no darker than needed
        r, g, b = (int(brand.pill_text[i:i + 2], 16) for i in (1, 3, 5))
        self.assertTrue(b >= g > r)  # same hue

    def test_alpha_in_the_accent_is_dropped_for_box_and_pill(self):
        self.assertEqual(load_brand({"accent": "#1D4ED8CC"}).highlight, "#1D4ED8")

    def test_render_job_carries_the_hex_colours_the_page_validates(self):
        from keynote.render import Renderer
        with tempfile.TemporaryDirectory() as tmp:
            job = Renderer(Path(tmp), load_brand({"accent": "#22D3EE"}), {}, has_logo=False).job("keynote", None)
        hex_colour = re.compile(r"^#[0-9A-F]{6}$")
        self.assertRegex(job["colors"]["highlight"], hex_colour)
        self.assertRegex(job["colors"]["pill"], hex_colour)


class Expressions(unittest.TestCase):
    def test_piecewise_returns_each_frames_value(self):
        values = [5, 5, 5, 7, 9, 9, 2]
        expression = piecewise(values, start_frame=30)
        for i, value in enumerate(values):
            self.assertEqual(evaluate(expression, (30 + i) / FPS), value)

    def test_constant_runs_collapse_to_one_value(self):
        self.assertEqual(piecewise([4] * 50, 0), "4")


class Background(unittest.TestCase):
    def test_fields_drift_2_to_4_percent_and_never_jump(self):
        brand = load_brand({})
        start = background_fields(brand, 0)
        for t in range(1, 85):
            now = background_fields(brand, t)
            for (_, _, x0, y0), (_, _, x, y), (fx, fy) in zip(start, now, [(f[2], f[3]) for f in spec.BG_FIELDS]):
                self.assertLessEqual(abs(x - fx * 19.2), 0.04 * 1920 + 0.1)
                self.assertLessEqual(abs(y - fy * 10.8), 0.04 * 1080 + 0.1)
        one_second = background_fields(brand, 1)
        for (_, _, x0, y0), (_, _, x1, y1) in zip(start, one_second):
            self.assertLess(abs(x1 - x0) + abs(y1 - y0), 12)

    def test_brand_defaults_and_bad_colours(self):
        brand = load_brand(None)
        self.assertEqual((brand.font, brand.accent, brand.base), ("inter", "#D9463B", "#E3E3E4"))
        with self.assertRaises(PlanError) as caught:
            load_brand({"accent": "red; background:url(x)"})
        self.assertIn("brand.accent", str(caught.exception))
        with self.assertRaises(PlanError):
            load_brand({"font": "Comic Sans"})


def make_demo(tmp: Path, sequence: list) -> tuple[dict, Path]:
    raw = tmp / "recordings" / "raw"
    raw.mkdir(parents=True)
    for item in sequence:
        if "stem" in item:
            (raw / f"{item['stem']}-t1.mp4").write_bytes(b"x")
    return {"title": "T", "sequence": sequence}, raw


PROBE = lambda path: (12.0, (1920, 1080))  # noqa: E731


class Plans(unittest.TestCase):
    SEQUENCE = [
        {"card": "intro", "title": "Hello there", "subtitle": "Sub", "accent": "there"},
        {"scene": "01", "stem": "01-a", "trim": [0, 6], "crop": [500, 100, 900, 460],
         "callouts": [{"at": 0.76, "dur": 3.5, "text": "Type it."}]},
        {"scene": "02", "stem": "02-b", "trim": [0, 6], "crop": [500, 100, 900, 460],
         "zooms": [{"at": 0.5, "focus": [900, 300], "dur": 2.5}], "highlights": [{"rect": [800, 280, 200, 30]}]},
        {"card": "end", "title": "Bye now", "accent": "now"},
    ]

    def plan(self, sequence):
        with tempfile.TemporaryDirectory() as tmp:
            cfg, raw = make_demo(Path(tmp), sequence)
            self.assertEqual(lib.validate(cfg, "demo"), [])
            return build_plan(cfg, raw, PROBE)

    def test_items_runs_and_frames(self):
        plan = self.plan(self.SEQUENCE)
        self.assertEqual([i.start for i in plan.items], [0, 90, 270, 450])
        self.assertEqual(len(plan.runs), 1)
        self.assertEqual((plan.runs[0].start, plan.runs[0].frames, plan.runs[0].fade_out), (90, 360, True))
        self.assertEqual(plan.cards[-1].kind, "end")
        self.assertEqual(plan.outro_frames, 150)
        self.assertEqual(plan.total_frames, 450 + round(7.9 * FPS) + 150)

    def test_highlight_without_at_follows_its_zoom_by_0_17_s(self):
        plan = self.plan(self.SEQUENCE)
        zoom = plan.runs[0].zooms[0]
        self.assertAlmostEqual(plan.highlights[0].start, 3.0 + zoom.landed + 0.17, places=6)
        self.assertAlmostEqual(plan.highlights[0].end, 3.0 + zoom.end, places=6)

    def test_callout_times_are_scene_relative(self):
        plan = self.plan(self.SEQUENCE)
        self.assertAlmostEqual(plan.callouts[0].start, 3.76, places=6)
        self.assertAlmostEqual(plan.callouts[0].end, 7.26, places=6)

    def test_old_zoom_and_caption_still_build(self):
        old = [{"card": "a", "title": "Hi"},
               {"scene": "01", "stem": "01-a", "trim": [0, 8], "caption": "It works.", "zoom": [1.6, 900, 300, 0.8, 0.6]},
               {"card": "b", "title": "Bye"}]
        plan = self.plan(old)
        self.assertEqual(len(plan.runs[0].zooms), 1)
        self.assertEqual(plan.runs[0].zooms[0].scale, 1.15)
        self.assertEqual(plan.callouts[0].text, "It works.")
        self.assertTrue(any("old [factor" in w for w in plan.warnings))

    def test_overlapping_pills_are_refused(self):
        bad = json.loads(json.dumps(self.SEQUENCE))
        bad[1]["callouts"].append({"at": 2.0, "text": "Too soon"})
        with self.assertRaises(PlanError) as caught:
            self.plan(bad)
        self.assertIn("one pill at a time", str(caught.exception))

    def test_crop_outside_the_take_names_the_field(self):
        bad = json.loads(json.dumps(self.SEQUENCE))
        bad[1]["crop"] = [1500, 0, 900, 460]
        with self.assertRaises(PlanError) as caught:
            self.plan(bad)
        self.assertIn("sequence[1] (scene 01).crop", str(caught.exception))

    def test_warnings_name_bar_rows(self):
        long_pill = json.loads(json.dumps(self.SEQUENCE))
        long_pill[1]["callouts"][0]["dur"] = 6.5
        long_pill[0].pop("accent")
        warnings = "\n".join(self.plan(long_pill).warnings)
        self.assertIn("(C8)", warnings)
        self.assertIn("(T9)", warnings)

    def test_highlight_without_at_never_pairs_with_another_scenes_zoom(self):
        other = json.loads(json.dumps(self.SEQUENCE))
        other[1]["zooms"] = [{"at": 0.8, "focus": [900, 300], "dur": 2.5}]
        other[2]["zooms"] = []
        with self.assertRaises(PlanError) as caught:
            self.plan(other)
        message = str(caught.exception)
        self.assertIn("sequence[2].highlights[0]", message)
        self.assertIn("its scene has no zoom", message)
        self.assertIn("Give `at`", message)

    def test_highlight_without_at_follows_its_own_scenes_zoom_not_an_earlier_one(self):
        both = json.loads(json.dumps(self.SEQUENCE))
        both[1]["zooms"] = [{"at": 0.8, "focus": [900, 300], "dur": 2.5}]
        both[1]["callouts"] = []
        plan = self.plan(both)
        own = plan.runs[0].zooms[1]
        self.assertAlmostEqual(plan.highlights[0].start, 3.0 + own.landed + 0.17, places=6)
        self.assertEqual(plan.highlights[0].where, "sequence[2].highlights[0]")

    def test_unknown_accent_word_is_an_error(self):
        bad = json.loads(json.dumps(self.SEQUENCE))
        bad[0]["accent"] = "missing"
        with self.assertRaises(PlanError):
            self.plan(bad)


class Schema(unittest.TestCase):
    def check(self, scene=None, card=None, brand=None):
        cfg = {"title": "x", "sequence": [{"card": "a", "title": "t", **(card or {})},
                                          {"scene": "01", "stem": "01-a", **(scene or {})}]}
        if brand is not None:
            cfg["brand"] = brand
        return lib.validate(cfg, "demo")

    def test_new_fields_validate(self):
        self.assertEqual(self.check(
            scene={"crop": [0, 0, 1560, 800], "zooms": [{"at": 1, "scale": 1.15, "focus": [10, 20], "dur": 3}],
                   "callouts": [{"at": 1, "dur": 4, "kind": "person", "text": "Ana", "role": "Lead",
                                 "avatar": "people/ana.png"}],
                   "highlights": [{"rect": [1, 2, 3, 4]}, {"at": 2, "dur": 2, "rect": [1, 2, 3, 4]}]},
            card={"kind": "end", "accent": "t", "outro": 5},
            brand={"font": "geist", "accent": "#FF0000", "background": {"base": "#E3E3E4",
                   "fields": ["#FFFFFF", "#000000", "#111111", "#222222", "#333333CC"]},
                   "sweep": ["#EF4849", "#F68C41"], "dark": "#1B1D21", "logo_on_dark": "assets/logo-white.svg"}), [])

    def test_file_fields_must_stay_inside_the_demo_folder(self):
        for path in ("/etc/passwd", "../outside.png", "C:\\x.png", "a/../../b.png"):
            errors = self.check(scene={"callouts": [{"at": 1, "text": "A", "avatar": path}]})
            self.assertTrue(errors, path)
            self.assertTrue(self.check(brand={"logo_on_dark": path}), path)

    def test_bad_values_are_rejected(self):
        self.assertTrue(self.check(scene={"zooms": [{"at": 1, "scale": 1.5, "focus": [1, 2]}]}))
        self.assertTrue(self.check(scene={"crop": [0, 0, 100]}))
        self.assertTrue(self.check(scene={"callouts": [{"at": 1, "text": "A", "kind": "banner"}]}))
        self.assertTrue(self.check(brand={"accent": "red"}))
        self.assertTrue(self.check(brand={"font": "papyrus"}))
        self.assertTrue(self.check(card={"kind": "outro"}))
        self.assertTrue(self.check(scene={"highlights": [{"at": 1}]}))

    def test_shipped_examples_and_templates_validate(self):
        for name in ("templates/demo.json", "samples/plan/demo.json", "examples/todo-sample/demo.json",
                     "examples/acme-invoice-bot/demo.json"):
            self.assertEqual(lib.validate(json.loads((REPO / name).read_text()), "demo"), [], name)


class Fonts(unittest.TestCase):
    def test_bundled_fonts_and_licences_are_present(self):
        fonts = REPO / "assets" / "fonts"
        for family in spec.FONTS.values():
            self.assertTrue((fonts / family["text"]).is_file(), family["text"])
            for file in family["display"].values():
                self.assertTrue((fonts / file).is_file(), file)
        self.assertIn("SIL OPEN FONT LICENSE", (fonts / "OFL.txt").read_text().upper())
        self.assertIn("SIL OPEN FONT LICENSE", (fonts / "OFL-Geist.txt").read_text().upper())
        self.assertIn("assets/fonts", (REPO / "NOTICE").read_text())

    def test_no_system_font_in_the_page(self):
        page = (REPO / "scripts" / "keynote-page.mjs").read_text()
        self.assertIsNone(re.search(r"system-ui|-apple-system|SF Pro|Helvetica", page))


if __name__ == "__main__":
    unittest.main()
