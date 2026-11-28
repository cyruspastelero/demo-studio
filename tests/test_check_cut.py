"""check-cut.py reads the look a cut was built with, so its checks hold in every look (house, paper,
midnight, mono) and still catch a broken cut in each. Uses small synthetic frames painted in memory.
Run: python3 -I tests/test_check_cut.py"""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from keynote import look as looks, measure as m, spec  # noqa: E402
from keynote.spec import Rect  # noqa: E402
from keynote.storyboard_page import push_marks  # noqa: E402
from keynote.model import Shot  # noqa: E402


def load_check_cut():
    module_spec = importlib.util.spec_from_file_location("check_cut", REPO / "scripts" / "check-cut.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


check_cut = load_check_cut()


def template_look(name: str) -> dict:
    data = json.loads((REPO / "look-templates" / name / "template.json").read_text())
    return looks.effective(data["look"])


LOOKS = {name: template_look(name) for name in ("house", "paper", "midnight", "mono")}


def rgb(value: str) -> tuple[int, int, int]:
    return m.hex_rgb(value[:7])


def blend(top: tuple[int, int, int], under: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return tuple(round(a * alpha + b * (1 - alpha)) for a, b in zip(top, under))


class Canvas:
    """A frame painted row by row: a flat field, then boxes over it."""

    def __init__(self, field: tuple[int, int, int], size=(1920, 1080)):
        self.w, self.h = size
        self.rows = [bytearray(bytes(field) * self.w) for _ in range(self.h)]

    def box(self, x: int, y: int, w: int, h: int, colour: tuple[int, int, int]) -> "Canvas":
        x0, x1 = max(0, x), min(self.w, x + w)
        for row in self.rows[max(0, y):min(self.h, y + h)]:
            row[x0 * 3:x1 * 3] = bytes(colour) * (x1 - x0)
        return self

    def text(self, x: int, y: int, w: int, h: int, colour: tuple[int, int, int], cell: int = 8) -> "Canvas":
        """A block of glyph-like ink: strokes `cell` px apart both ways, like a line of letters."""
        for yy in range(y, y + h):
            if (yy - y) % cell < 2:
                self.box(x, yy, w, 1, colour)
            else:
                for xx in range(x, x + w, cell):
                    self.box(xx, yy, 3, 1, colour)
        return self

    def glow(self, x: int, y: int, w: int, h: int, to: tuple[int, int, int]) -> "Canvas":
        """A soft field glow: the colour eases from the field at x to `to` at x + w."""
        for xx in range(x, x + w):
            k = (xx - x) / w
            base = tuple(self.rows[y][xx * 3:xx * 3 + 3])
            for row in self.rows[y:y + h]:
                row[xx * 3:xx * 3 + 3] = bytes(round(a + (b - a) * k) for a, b in zip(base, to))
        return self

    def frame(self) -> m.Frame:
        return m.Frame(b"".join(self.rows), self.w, self.h)


def window_canvas(look: dict, field: str | None = None, shadow: bool = True, top: int | None = None) -> Canvas:
    """The look's field with its window (white page, a grey header bar) at rest, or with its top at `top`,
    and the look's own shadow under it."""
    base = rgb(field or look["brand"]["background"]["base"])
    x, y, w, h = (round(v) for v in look["window"]["rect"])
    y = y if top is None else top
    canvas = Canvas(base)
    if shadow:
        bottom = y + h
        luma = check_cut.hex_luma(field or look["brand"]["background"]["base"])
        for d in range(0, 200):
            dark = check_cut.shadow_darkening(look["window"]["shadow"], luma, d + 0.5)
            k = max(0.0, (luma - dark) / luma) if luma else 1.0
            canvas.box(x, bottom + d, w, 1, tuple(round(c * k) for c in base))
    canvas.box(x, y, w, min(h, 1080 - y), (255, 255, 255))
    canvas.box(x, y, w, 40, (250, 250, 251))
    canvas.text(x + 60, y + 120, 400, 20, (40, 40, 40))
    return canvas


def pill_canvas(look: dict, field: str | None = None, pill: bool = True) -> Canvas:
    base = rgb(field or look["brand"]["background"]["base"])
    canvas = Canvas(base)
    if pill:
        cy, ph = look["pill"]["center_y"], look["pill"]["height"]
        top = round(cy - ph / 2)
        canvas.box(660, top, 600, ph, blend((255, 255, 255), base, 0.95))
        canvas.text(700, top + ph // 2 - 10, 520, 20, (30, 30, 30))
    return canvas


class PillsInEveryLook(unittest.TestCase):
    def found(self, look, canvas):
        frame = canvas.frame()
        cy = look["pill"]["center_y"]
        return m.pill_box(frame, cy, m.pill_bright(frame, cy), look["pill"]["height"])

    def test_a_pill_is_found_centred_and_full_height_in_every_look(self):
        for name, look in LOOKS.items():
            with self.subTest(look=name):
                box = self.found(look, pill_canvas(look))
                self.assertIsNotNone(box)
                self.assertLessEqual(abs(box[1] + box[3] / 2 - look["pill"]["center_y"]), 3)
                self.assertLessEqual(abs(box[3] - look["pill"]["height"]), 2)
                self.assertEqual((box[0], box[2]), (660, 600))

    def test_a_grey_pill_on_the_midnight_field_is_a_pill(self):
        look = LOOKS["midnight"]
        luma = m.Frame(bytes(blend((255, 255, 255), rgb("#0A0A0A"), 0.95)), 1, 1).luma(0, 0)
        self.assertLess(luma, 246)  # under the old fixed bar: why the Midnight pills went missing
        self.assertIsNotNone(self.found(look, pill_canvas(look)))

    def test_a_bright_paper_field_without_a_pill_has_no_pill(self):
        look = LOOKS["paper"]
        self.assertIsNone(self.found(look, pill_canvas(look, field="#FAF8F4", pill=False)))
        self.assertIsNotNone(self.found(look, pill_canvas(look, field="#FAF8F4")))

    def test_no_pill_means_none_in_every_look(self):
        for name, look in LOOKS.items():
            with self.subTest(look=name):
                self.assertIsNone(self.found(look, pill_canvas(look, pill=False)))


class WindowInEveryLook(unittest.TestCase):
    def test_the_rest_window_is_found_at_the_looks_own_rect(self):
        for name, look in LOOKS.items():
            with self.subTest(look=name):
                rect = tuple(look["window"]["rect"])
                frame = window_canvas(look).frame()
                box = m.window_box(frame, m.edge_threshold(frame, rect), rect)
                self.assertIsNotNone(box)
                self.assertTrue(all(abs(a - b) <= 4 for a, b in zip(box, rect)), (box, rect))

    def test_a_white_window_on_a_near_white_paper_field_is_found(self):
        look = LOOKS["paper"]
        rect = tuple(look["window"]["rect"])
        frame = window_canvas(look, field="#F5EFE6").frame()
        self.assertIsNone(m.window_box(frame))  # the house scan lines miss the paper window
        box = m.window_box(frame, m.edge_threshold(frame, rect), rect)
        self.assertTrue(box and all(abs(a - b) <= 4 for a, b in zip(box, rect)), box)

    def test_no_window_is_no_box_in_every_look(self):
        for name, look in LOOKS.items():
            with self.subTest(look=name):
                rect = tuple(look["window"]["rect"])
                base = rgb(look["brand"]["background"]["base"])
                field = Canvas(base).glow(900, 0, 1020, 1080, tuple(max(0, c - 40) for c in base))  # a soft glow
                frame = field.frame()
                self.assertIsNone(m.window_box(frame, m.edge_threshold(frame, rect), rect))

    def test_the_rising_window_is_not_confused_with_title_words_above_it(self):
        look = LOOKS["midnight"]
        rect = tuple(look["window"]["rect"])
        canvas = window_canvas(look, top=800)
        for x in range(150, 1780, 200):  # a fading title line: words with gaps, their tops aligned
            canvas.box(x, 560, 120, 70, (230, 230, 230))
        frame = canvas.frame()
        self.assertLess(m.top_edge(frame), 700)  # the old scan took the title for the window
        self.assertEqual(m.rising_top(frame, rect, 10), 800)

    def test_a_rising_window_whose_top_bar_matches_a_light_corner_of_the_field_is_found(self):
        look = LOOKS["house"]
        x, _, w, _ = look["window"]["rect"]
        canvas = window_canvas(look, top=500).box(0, 0, x + w // 4, 500, (250, 250, 251))
        self.assertEqual(m.rising_top(canvas.frame(), tuple(look["window"]["rect"]), 10), 500)

    def test_a_window_that_has_not_risen_yet_has_no_top(self):
        look = LOOKS["house"]
        frame = Canvas(rgb(look["brand"]["background"]["base"])).text(300, 500, 1300, 80, (30, 30, 30)).frame()
        self.assertIsNone(m.rising_top(frame, tuple(look["window"]["rect"]), 10))


class ShadowInEveryLook(unittest.TestCase):
    def rows(self, look, canvas):
        report = check_cut.Report()
        rect = tuple(round(v) for v in look["window"]["rect"])
        check_cut.check_shadow(report, canvas.frame(), rect, look)
        return [(row["status"], row["item"]) for row in report.rows]

    def test_the_looks_own_shadow_passes_and_no_shadow_fails(self):
        for name in ("house", "paper", "midnight"):
            look = LOOKS[name]
            with self.subTest(look=name):
                self.assertEqual(self.rows(look, window_canvas(look)), [("PASS", "W5")])
                self.assertEqual(self.rows(look, window_canvas(look, shadow=False)), [("FAIL", "W5")])

    def test_the_house_bar_is_still_about_20_levels(self):
        expected = check_cut.shadow_darkening(LOOKS["house"]["window"]["shadow"], 227, 6) \
            - check_cut.shadow_darkening(LOOKS["house"]["window"]["shadow"], 227, 120)
        self.assertAlmostEqual(0.6 * expected, 20, delta=2.5)

    def test_a_shadow_too_faint_to_measure_on_its_field_is_a_look_line(self):
        look = looks.effective({"window": {"shadow": "0 30px 80px rgba(0,0,0,0.6)"},
                                "brand": {"background": {"base": "#020202"}}})
        self.assertEqual(self.rows(look, window_canvas(look)), [("LOOK", "W5")])


class TitleInkInEveryLook(unittest.TestCase):
    def test_a_dark_look_counts_its_light_ink_not_its_field(self):
        look = LOOKS["midnight"]
        blank = Canvas(rgb("#0A0A0A")).glow(1300, 380, 520, 320, (90, 50, 25))  # a warm glow, no title
        self.assertEqual(check_cut.ink_present(blank.frame(), (380, 700), look, check_cut.INK_FAINT), 0)
        title = Canvas(rgb("#0A0A0A")).text(300, 450, 1200, 120, (242, 242, 242))
        self.assertGreater(check_cut.ink_present(title.frame(), (380, 700), look), 200)

    def test_a_light_look_counts_dark_ink_as_before(self):
        look = LOOKS["house"]
        self.assertEqual(check_cut.ink_present(Canvas(rgb("#E4E3E1")).frame(), (380, 700), look), 0)
        title = Canvas(rgb("#E4E3E1")).text(300, 450, 1200, 120, (26, 26, 26))
        self.assertGreater(check_cut.ink_present(title.frame(), (380, 700), look), 200)

    def test_words_revealed_one_by_one_grow_and_a_settling_blur_may_shed_a_little(self):
        self.assertTrue(check_cut.reveal_grows([0, 900, 2100, 3300, 4000]))
        self.assertTrue(check_cut.reveal_grows([0, 1500, 3000, 4100, 4050]))  # last word settles

    def test_a_title_that_appears_whole_or_fades_away_fails(self):
        self.assertFalse(check_cut.reveal_grows([4000, 4000, 4000, 4000, 4000]))
        self.assertFalse(check_cut.reveal_grows([61418, 58402, 56006, 53773, 52585]))

    def test_the_first_title_word_is_found_in_light_ink(self):
        look = LOOKS["midnight"]
        threshold, light = check_cut.ink_threshold(look, check_cut.INK_WORD)
        frame = Canvas(rgb("#0A0A0A")).box(400, 450, 300, 130, (242, 242, 242)).box(760, 450, 300, 130, (242, 242, 242))
        self.assertEqual(m.first_word_box(frame.frame(), (400, 680), threshold, light), (400, 450, 300, 130))


class TitleCapHeight(unittest.TestCase):
    def test_the_cap_height_measured_by_the_build_wins(self):
        self.assertEqual(check_cut.title_cap({"title_cap": 0.7, "brand": {"font": "fonts/Outfit.woff2"}}), 0.7)

    def test_inter_titles_use_inters_cap_height(self):
        self.assertAlmostEqual(check_cut.title_cap({}), 0.727, places=3)
        self.assertAlmostEqual(check_cut.title_cap({"brand": {"font": "inter"}}), 0.727, places=3)

    def test_an_unmeasured_product_font_has_no_bar_rather_than_inters(self):
        self.assertIsNone(check_cut.title_cap({"brand": {"font": "inter", "title_font": "fonts/Outfit.woff2"}}))
        self.assertIsNone(check_cut.title_cap({"look": LOOKS["paper"]}))  # instrument-serif titles


class TakeSizes(unittest.TestCase):
    def test_a_frame_reads_pixels_at_its_own_size(self):
        frame = Canvas((10, 10, 10), size=(2880, 1620)).box(2870, 1610, 10, 10, (200, 200, 200)).frame()
        self.assertEqual((frame.px(2875, 1615), frame.px(1919, 1079)), ((200, 200, 200), (10, 10, 10)))

    def test_storyboard_marks_land_in_the_window_for_a_2880_take(self):
        size = (2880, 1620)
        wide = Rect(0, 0, 2880, 2880 / spec.WINDOW_ASPECT)
        crop = Rect(720, 405, 1440, 1440 / spec.WINDOW_ASPECT)
        shot = Shot(0, "01", Path("a.mp4"), 0, 5, 1, 0, 150, crop, size, wide=wide, push_at=1.0)
        (_, mark), = push_marks(shot, None)
        rest = spec.WINDOW_REST
        self.assertAlmostEqual(mark.x, rest.x + rest.w / 4, places=3)
        self.assertAlmostEqual(mark.w, rest.w / 2, places=3)


if __name__ == "__main__":
    unittest.main(verbosity=1)
