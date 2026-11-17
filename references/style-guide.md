# Style guide: the house look

How a demo-studio video should look and sound. Follow it unless the user, the workspace AGENTS.md
or a client brief says otherwise. It sums up the defaults table in the `demo-studio` skill and the
gotchas in `learnings.md`; where this guide is short on detail, those two files have it.

The aim is simple: a viewer should feel they are watching a calm, capable person use a real
product. Nothing flashy, nothing faked, nothing they have to squint at.

**The numbers for the finished cut live in [`../docs/quality-bar.md`](../docs/quality-bar.md)**
(the bare minimum, measured from a reference cut; ids like W1 or C8 point at its rows). Where this
guide and the bar disagree, the bar wins. `scripts/build-keynote.py` builds every look value in,
and `scripts/check-cut.py` runs the bar's checklist on a finished cut.

## 1. Capture

- **Viewport 1440x810 CSS at DPR 2.** That captures 2880x1620 frames, downscaled with lanczos to
  1920x1080. UI text is large enough to read at 1080p. A 1920 wide viewport makes the UI too small.
- **30fps constant, H.264 CRF 14, silent.** Audio is added in the edit.
- **CDP screencast only** (`record()`). Never screenshot loops or Playwright's video option.
- **No page zoom in the raw take.** Zooms belong in the edit, where they can be tuned and undone.
- Always `prep(p)` right before `record()`. A tab switch can reset the viewport.

## 2. Framing and what to hide

The frame shows the product and nothing else.

- **Hide:** notification banners, cookie bars, "enable notifications" prompts, onboarding tours,
  unread pills, chat widgets, toasts like "Saved" or "Copied". Put their full wording in
  `PROJECT.clutter`. Short or empty patterns hide real UI.
- **Hide personal history:** recent chats, recent projects, other workspaces, real names in the
  sidebar. Use a dedicated demo user so there is nothing to hide.
- **Hide site chrome that is not the product,** like a docs side panel, with one line of CSS in the
  scene (see `examples/todo-sample`, scene 01).
- **Mask secrets in the page, never in post.** One unmasked frame is a leak. See `secrets.md`.
- **One consistent world.** Same workspace, customer, record numbers and dates in every scene.
- **Realistic data.** Seeded names, amounts and dates that look like a real team's, and that agree
  with the app's own maths across pages.
- **The right clock.** Set the timezone and locale so greetings, deadlines and dates look right.

## 3. Pointer

- **A pointing hand by default** (K1): `PROJECT.cursor = 'hand'`, drawn into the page at record
  time (fingertip is the hotspot), so it scales with the window in the edit and presses slightly
  on click. Use `'arrow'` for developer tools and terminals. Never a dot or a click circle: they
  read as a screen recorder, not a person.
- **Glide, never teleport.** `glide`, `click` and `park` move on a slight eased arc (`moveHuman`).
  Never call `p.mouse.move(..., { steps })` on camera; constant speed looks robotic.
- **Pause before every click,** 300 to 600ms. `click()` waits 350ms; add a `sleep` when the viewer
  needs to see where the pointer landed.
- **Click where it does not cover the content.** The right end of an input, the edge of a button.
- **Park after the action** with `park(p)`, away from what the viewer should read now.
- **Set the start position off camera** with `placeCursor(p)` before `record()`.
- One pointer movement per idea. No wandering, no circling a thing to point at it.

## 4. Typing

- `typeHuman` at 45 to 75ms per key (default 55). Slower (70 to 75) for an @mention or a short,
  important phrase; faster (45) for a long sentence in a chat box.
- **Paste anything longer than about two lines:** code, manifests, config, long prompts. Nobody
  wants 40 seconds of typing.
- **Check focus before typing in a rich composer.** If `document.activeElement` is not inside it,
  the keystrokes hit page shortcuts.
- What is typed reads like a real person with a goal, not a test case. "Northwind signed off on the
  redesign", not "test message 1".

## 5. Pacing and handles

- **Head handle:** 1 to 1.5s of stillness after `record()` starts. **Tail handle:** 2 to 3s of hold
  at the end. Editors need both.
- **Hold on every result** for about 2s so it can be read.
- **Wait on real UI signals** (`locator.waitFor`), never a fixed sleep, and log the latency. Long
  waits are cut in the edit with `trim`, not hidden by recording less.
- **Scenes are 10 to 40 seconds and single purpose.** One idea per scene.
- **In the cut, 2 to 6 s between cuts or framing changes,** never more than 8 s of one
  uninterrupted window shot (bar P2), and at least 0.6 s of still UI after each result (P4).
- **Speed up the boring parts in the edit,** not on camera: `speed` 1.25 to 1.5 for form filling,
  up to 3 for a long wait you want to show passing. Never speed up the hero moment.

## 6. Scrolling

- `smoothScroll(p, dy)` for a wheel-like scroll, or `scrollIntoCenter(p, loc)` to land a section
  about 30% from the top.
- Scroll, stop, let it settle for a beat, then point. Never point while scrolling.
- Scroll in a few deliberate moves, not one long fling.

## 7. Zoom (bar 2.4)

- **The whole window zooms,** frame, shadow and all, to **1.15x** (1560x800 to 1794x920), never
  more; the window stays 40 px inside the frame and its centre moves at most 70 px toward the
  target. Content never zooms inside a fixed frame.
- **1.1 s in and 1.1 s out, ease-in-out sine**, held **2.4 to 4.5 s**.
- **About one zoom per 11 s of footage,** only to land a point the narration is making. Start it
  about 1.1 s before the thing appears so it lands as it happens.
- **How:** `zooms: [{"at": 5.2, "focus": [x, y], "dur": 3.0}]` on the scene in demo.json; `at` is
  seconds into the scene after trim and speed, `focus` is source px from the record step's scout.

## 8. Window, highlights and callouts (bar 2.3, 2.5, 2.6)

- **Crop to the UI that matters** (`crop: [x, y, w, h]` in source px): the window is 1560x800 at
  (180, 100), app body text at least 18 px cap height, no empty sidebar over 15% of the window.
- **The window rises in once** (0.7 s, ease-out) and clips cut inside it. Never a dip through an
  empty background between two window shots.
- **Highlights:** a 3 px `#E2483C` outline, radius 12, on the one element the narration names,
  0.17 s after a zoom lands, glued to the UI while the window eases back. At most two at once.
- **Callout pills** sit centred under the window at y = 962, 68 px tall, Inter 500 30 px, 3 to 5 s,
  one at a time, never during a zoom. Two kinds: a **person** (50 px avatar, "Name," in ink, role in
  grey) or a **statement** in the accent colour, at most six words, sentence case, a period, no em
  dashes, exclamation marks or filler. Claim only what that scene's footage shows.

## 9. Title cards (bar 2.7, 2.9, 2.10)

- **Hero** (opening): 132 px, words blur in one by one (0.13 s apart), settle to 0.52x, then the
  subtitle; about 3.4 s. The first title is already blurring in on frame 0. First UI by 6 s.
- **Section** cards mid-cut ask a question ("Who is on the team?"), 2.2 to 2.6 s.
- **Exactly one accent word** per title or subtitle (`accent`), the key noun. Never two colours.
- **End card** (`kind: end`, the last item): logo, a 104 px title whose words appear just before
  the narration says them, a 40 px tagline, about 7.9 s; then a brand-gradient sweep into a dark
  field and a logo lockup held 3 s or more, silent at the very end. The tagline says where to get
  the product, with a URL that works (checked in the test sweep).

## 10. Colour, type and brand (bar 2.2, 2.7)

- **Background:** the soft pastel field (`#E3E3E4` base with five drifting colour fields), the same
  under every title, window and end card. No grain, no vignette, no flat grey.
- **Type:** bundled **Inter** (Inter Display for titles), never `system-ui` or SF Pro, which cannot
  be bundled and fall back on Linux. Titles 500 weight with tight tracking (-4 px at 132 px),
  subtitles 400. Ink `#24272B`, secondary `#5F656D`, accent `#D9463B`. `brand.font: "geist"` for a
  product whose own UI is a geometric sans.
- **Brand:** `brand.accent` for the product's accent colour, `brand.sweep` for the outro gradient,
  `logo` and `brand.logo_on_dark` for the end card and the lockup. The product's own UI carries the
  rest. Spell product names exactly as the brand does, everywhere (`brand.spelling` in handoff.json).

## 11. Voiceover

- **Who it sounds like:** a person teaching a colleague. Warm, relaxed, conversational.
- **Words:** present tense, second person, short sentences, contractions. Point at what is on
  screen and say why in half a sentence.
- **Speed:** about 2.5 words per second of the time it plays over (about 160 words a minute).
- **For the ear:** spell out URLs ("acme dot com slash billing") and amounts ("twelve hundred
  dollars"). No symbols, parentheses or em dashes.
- **Timing:** each line starts just after its item starts and ends before the next voiced item.
  The fit check says when a line runs long. Cut words or slow the footage; never speed up the voice.
- **Shape:** open with the everyday pain, signpost each part ("First, set it up."), end with the
  payoff and where to get it.
- **Voice choice:** the user's own recordings if they made them, else ElevenLabs if
  `ELEVENLABS_API_KEY` is set in their shell, else macOS `say`. Full rules in `voiceover.md`; the
  narrate step is in the `demo-edit` skill.

## 12. Music and loudness (bar 2.12)

- **Always a bed** from frame 0, instrumental, no vocals: the user's file, an MCP-made track, or
  a licensed track (ElevenLabs MCP `compose_music` or the user's own). `scripts/make-bed.py` is a
  placeholder for timing only; replace it before anyone sees the cut. narrate.py sets the bed
  **13 dB under the narration** (`voice.music_gap_db`), holds it down under each spoken line, dips it on one key moment (`voice.music_dips`) and
  fades it so the last 3 s of the outro are silent.
- **The mix:** -14 LUFS integrated (+-1), true peak at most -1 dBTP, loudness range at most 15 LU.
  Narration covers at least half the runtime. If a viewer notices the music, it is too loud.
- Use music you have the rights to. Never a popular track.
- A promo can have music; a how-to usually does not.

## 13. Social crops

- **4:5 (1080x1350)** for feeds, **9:16 (1080x1920)** for stories and shorts.
- `fit: crop` around the part of the UI that matters, with `focus_x` and `focus_y` picked from a
  contact sheet, so text reads on a phone. `fit: contain` only when the whole screen matters.
- Blurred footage behind (`fill: blur`), or the brand colour.
- A caption band above the window carries the story, since most people watch muted.
- One focus per entry. For a moving focus, cut the source into segments.
- Check a contact sheet of every social version for cut-off content.

## 14. Do and don't

| Do | Don't |
| --- | --- |
| Record at 1440x810, DPR 2 | Record at 1920 wide, or zoom the page |
| The pointing hand, eased arcs, pause, then click | Teleport clicks, constant-speed moves, a dot or click circle |
| Park the pointer after every action | Leave the pointer on the text being read |
| Type short text, paste long text | Type a whole config file on camera |
| Wait on real UI signals, trim waits in the edit | Fixed sleeps, or cutting the take short |
| 1 to 1.5s head, 2 to 3s tail on every take | Start moving on frame one |
| Hide banners, toasts and personal history | Film a real or personal account |
| Mask secrets in the page, check every frame | Blur them in post |
| Whole-window zoom to 1.15x where the narration makes a point | Zoom inside a fixed frame, or past 1.15x |
| A 3 to 5 s pill: a person or a 6-word statement | A caption on screen for a whole scene |
| Crop the window to the UI that matters | Show the whole viewport with empty sidebars |
| Run `check-cut.py` until 0 FAIL | Call a cut finished from one look |
| Claim only what the footage proves | "Instant", "magic", "effortless" without proof |
| Create real things on camera, delete them after | Fake a step or stage a result |
| Quiet music, ducked under speech | Music that competes with the voice |
| Spell out URLs and amounts in voiceover | Symbols, slashes and em dashes in a script |

## See also

- `learnings.md`: the gotchas behind these rules
- `scene-patterns.md` and `../samples/`: scene code to copy
- `voiceover.md`: writing and timing the voiceover
- `quality-gates.md`: what must pass before each stage
- `../docs/quality-bar.md`: the measured bar every finished cut must pass
- `secrets.md`: masking and checking secrets
