"""The quality bar as constants. docs/quality-bar.md is the source of truth; the ids in the comments
(W1, Z4, C2 ...) point at its rows. Sizes are px in a 1920x1080 frame, times are seconds.

These are the house look. A look template (docs/templates.md) replaces some of them for one build:
keynote/look.py swaps them in before the plan is made, so every module reads them as `spec.NAME`
at call time (never `from .spec import NAME`)."""
from __future__ import annotations

from typing import NamedTuple


class Rect(NamedTuple):
    x: float
    y: float
    w: float
    h: float

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h

    @property
    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)


FPS = 30
FRAME_W, FRAME_H = 1920, 1080

# 2.3 Window
WINDOW_REST = Rect(180, 100, 1560, 800)          # W1
WINDOW_ASPECT = WINDOW_REST.w / WINDOW_REST.h    # 1.95
WINDOW_RADIUS = 22                               # W3, scales with the window
WINDOW_SHADOW = "0 50px 110px rgba(45,40,60,0.16), 0 14px 34px rgba(45,40,60,0.09)"  # W5
WINDOW_FILL = "#FFFFFF"                          # W4
ENTRY_SECONDS = 0.70                             # W6, ease-out cubic
ENTRY_FROM_TOP = 1000                            # W6, top edge starts here
EXIT_FRAMES = 4                                  # W8, fade before a title card
# Transparent margin around the window in the window layer, so the shadow is not clipped.
CANVAS_PAD_SIDE, CANVAS_PAD_TOP, CANVAS_PAD_BOTTOM = 150, 120, 220
MIN_CAP_HEIGHT = 18                              # W2, app body text cap height at rest

# 2.4 Zoom
ZOOM_MAX = 1.15                                  # Z2
ZOOM_MOVE_SECONDS = 1.10                         # Z4, ease-in-out sine both ways
ZOOM_HOLD_DEFAULT = 3.0                          # Z5
ZOOM_HOLD_RANGE = (2.4, 4.5)                     # Z5 / checklist
ZOOM_EDGE = 40                                   # Z3, clear on every side
ZOOM_PAN_MAX = 70                                # Z3, centre moves at most this far toward the target
ZOOM_EASE = (0.37, 0, 0.63, 1)                   # Z4, ease-in-out sine as cubic-bezier
ZOOM_EVERY = None                                # template pacing.zoom_every: warn on a run this long with no zoom

# 2.5 Highlight boxes
HIGHLIGHT_STROKE = 3                             # H1
# H1/H3: the box takes the product's colour (brand.accent), never a fixed red, so it reads as part of
# the UI being shown. Without a brand accent it is a neutral ink. brand.py derives the actual colours.
HIGHLIGHT_NEUTRAL = "#171717"                    # H1, no brand.accent set
# H3: fill = that colour at 7%, a 6 px halo at 10% (keynote-page.mjs draws them).
HIGHLIGHT_RADIUS = 12                            # H2
HIGHLIGHT_PAD_X, HIGHLIGHT_PAD_Y = 15, 9         # H4
HIGHLIGHT_DELAY = 0.17                           # H5, after a zoom lands
HIGHLIGHT_IN = 0.40                              # H6, ease-out cubic, scale 1.12 -> 1
HIGHLIGHT_IN_SCALE = 1.12
HIGHLIGHT_OUT = 0.30                             # H6, linear opacity
HIGHLIGHT_MAX_ON_SCREEN = 2                      # H7
HIGHLIGHT_FILL_ALPHA, HIGHLIGHT_HALO_ALPHA, HIGHLIGHT_HALO = 0.07, 0.10, 6  # H3

# 2.6 Callout pills
PILL_CENTER = (960, 962)                         # C1
PILL_HEIGHT = 68                                 # C2
PILL_RADIUS = 999                                # C2, fully round ends
PILL_KINDS = ("statement", "person")             # C3, C4
PILL_FILL = "rgba(255,255,255,0.95)"             # C2
PILL_SHADOW = "0 14px 40px rgba(60,45,60,0.12), 0 2px 6px rgba(60,45,60,0.06)"  # C2
PILL_AVATAR = 50                                 # C3
PILL_PERSON_PADDING = (9, 30, 9, 9)              # C3, top right bottom left
PILL_GAP = 14                                    # C3
PILL_STATEMENT_PADDING = (16, 32, 16, 32)        # C4
PILL_STATEMENT_MAX_WORDS = 6                     # C4
PILL_TEXT_NEUTRAL = "#171717"                    # C4, statement text with no brand.accent set
PILL_TEXT_MIN_CONTRAST = 4.5                     # C4, statement text vs the white pill (WCAG AA)
PILL_FONT_SIZE, PILL_FONT_WEIGHT, PILL_TRACKING = 30, 500, -0.3  # C5
PILL_ENTRY = 0.45                                # C6, ease-out cubic
PILL_ENTRY_RISE, PILL_ENTRY_SCALE = 16, 0.96     # C6
PILL_WORD_STAGGER, PILL_WORD_SECONDS = 0.07, 0.40  # C6
PILL_WORD_BLUR, PILL_WORD_SHIFT = 8, 10          # C6
PILL_EXIT = 0.35                                 # C7
PILL_EXIT_BLUR, PILL_EXIT_DROP = 6, 8            # C7
PILL_SECONDS_RANGE = (3.0, 5.0)                  # C8
PILL_SECONDS_DEFAULT = 4.0

# 2.7 Typography
HERO = {"size": 132, "weight": 500, "tracking": -4}            # T2
HERO_SETTLE_SCALE, HERO_SETTLE_RISE = 0.52, 70                 # T3
CARD_HEADING = {"size": 72, "weight": 500, "tracking": -2}     # T4
END_TITLE = {"size": 104, "weight": 500, "tracking": -3}       # T5
SUBTITLE = {"size": 42, "weight": 400, "tracking": -0.6}       # T6
TAGLINE = {"size": 40, "weight": 400, "tracking": -0.5}        # T6
TITLE_FONT = None                                              # T1: None = brand.font
TITLE_WEIGHT = 500                                             # T2, T4, T5
TITLE_REVEAL = "word-blur"                                     # T10: word-blur | fade | none
ACCENT_WORD = True                                             # T9: one accent word per title
INK, SECONDARY, TERTIARY, ACCENT = "#24272B", "#5F656D", "#6B7178", "#D9463B"  # T8
WORD_SECONDS, WORD_BLUR, WORD_SHIFT = 0.50, 16, 26             # T10
TITLE_STAGGER, SUBTITLE_STAGGER = 0.13, 0.05                   # T10
SETTLE_SECONDS, SETTLE_EARLIEST, SUBTITLE_AFTER_SETTLE = 0.60, 1.0, 0.20  # T11, O2
CARD_EXIT, CARD_EXIT_RISE, CARD_EXIT_BLUR = 0.40, 60, 12       # T12
OPEN_LEAD = 0.12   # O1: the opening title is already blurring in on frame 0
CARD_SECONDS = {"hero": 3.0, "section": 2.4, "end": 7.9}       # O2, O5, X1
CUT_STYLE = "inside-window"                                    # W7: clips cut inside a stationary window
SHOT_MAX = 8.0                                                 # P2: longest uninterrupted window shot

# 2.2 Background: base fill plus five radial fields (colour at the centre, transparent at 68%).
BG_BASE = "#E3E3E4"                                            # B1
BG_FIELDS = (                                                  # B2: colour, radius, x%, y%
    ("#FAF9F7", 1500, 16, 20),
    ("#BCC6D3F2", 1400, 92, 8),
    ("#E6C4C2F2", 1400, 95, 100),
    ("#DEDAD9", 1200, 5, 98),
    ("#F1EFEDD9", 1100, 50, 50),
)
BG_FADE_AT = 0.68
# B4: each field drifts on a sine, amplitude 2 to 4% of the frame, 0.03 to 0.08 rad/s.
BG_DRIFT = ((0.030, 0.050, 0.0), (0.025, 0.035, 1.3), (0.035, 0.065, 2.1), (0.020, 0.045, 3.4), (0.030, 0.080, 4.6))
BG_KEYFRAME_SECONDS = 1.0       # rendered once a second, blended to 30 fps (motion is near-static)

# 2.10 End card and outro
END_LOGO_WIDTH, END_LOGO_TOP = 128, 330                        # X1
END_REVEAL_LEAD = 0.10                                         # X1, a word shows before it is spoken
SWEEP_FROM, SWEEP_TO, SWEEP_SKEW, SWEEP_SECONDS = "#EF4849", "#F68C41", -4, 0.80  # X2
DARK_FIELD = "#1B1D21"                                         # X2
OUTRO_SECONDS = 5.0                                            # X3: sweep + lockup + >= 3 s hold
LOCKUP_SECONDS = 0.70
SILENT_TAIL = 3.0                                              # X3, A6
END_KIND = "sweep-logo"                                        # X1 to X3: sweep-logo | card | none

# 2.12 Audio (narration/core.py mixes to these)
AUDIO_LUFS, AUDIO_TRUE_PEAK, MUSIC_GAP_DB = -14.0, -1.0, 13.0  # A2, A3, A6

# 2.1 Encode
VIDEO_BITRATE, VIDEO_MAXRATE, VIDEO_BUFSIZE = "5M", "8M", "10M"  # E4: two-pass, >= 3.5 Mbps
GOP = 60                                                       # E5: 2.0 s at 30 fps
X264_LEVEL = "4.1"                                             # E1

FONTS = {  # brand.font -> bundled files in assets/fonts (SIL OFL 1.1)
    "inter": {"family": "Inter", "text": "InterVariable.woff2",
              "display": {400: "InterDisplay-Regular.woff2", 500: "InterDisplay-Medium.woff2"}},
    "geist": {"family": "Geist", "text": "GeistVariable.woff2", "display": {}},
}
