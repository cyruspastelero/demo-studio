# Design audit

Design read: a local tool for making product demo videos, for developers and founders, with a calm,
precise light-first language (Geist, near-white greys, one orange accent), in the minimal
developer-tool family.

## Evidence grid

`node app/e2e/layout-audit.mjs [out-dir]` (also part of `npm run e2e -w app`) opens every home section
(overview, demos, examples, prompts, templates) and the editor at 1440, 1024 and 390 px wide, in light
and dark: 36 screenshots. It fails when the page scrolls sideways, a box sticks out of a card or panel
that clips it, or text is cut off with no ellipsis. Look at the screenshots too: the check finds
overflow, not taste.

## Findings (2026-11-27)

| Id | Severity | Finding | Status |
| --- | --- | --- | --- |
| D1 | blocker | Getting started: command boxes ran past the card (a grid row grew to the longest unwrapped path) | fixed: rows shrink (`minmax(0, 1fr)`), commands wrap |
| D2 | blocker | Editor below 768 px: the top bar ran 274 px off screen and the page scrolled sideways | fixed: a "needs a wider window" note with a way back |
| D3 | paper-cut | The timeline ruler showed a text cursor; the playhead head could not be grabbed | fixed earlier: hand cursors, hover tint and time, a draggable head |
| D4 | paper-cut | Text toolbar cut off at the preview's edges | fixed earlier: it slides along and flips below the text |

## Debt (accepted)

- The editor is desktop only (768 px and up); the home screen works at phone width.
- The Templates count in the sidebar includes the launch-ad styles; the overview tile counts looks only
  ("looks you can reuse").

## Gotchas

- Screen-reader-only text (`.sr-only`) is clipped on purpose; the audit skips it.
- Thumbnails are cached for 5 minutes: after a server fix, check in a fresh browser context.
