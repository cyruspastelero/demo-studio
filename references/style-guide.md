# Style guide: the house look

How a demo-studio video should look and sound. Follow it unless the user, the workspace AGENTS.md
or a client brief says otherwise. It sums up the defaults table in the `demo-studio` skill and the
gotchas in `learnings.md`; where this guide is short on detail, those two files have it.

The aim is simple: a viewer should feel they are watching a calm, capable person use a real
product. Nothing flashy, nothing faked, nothing they have to squint at.

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

- **The normal arrow cursor by default.** `PROJECT.cursor = 'hand'` (a pointing hand) only when it
  suits a consumer app. Never a click dot or a ripple: it reads as a screen recorder, not a person.
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
- **Speed up the boring parts in the edit,** not on camera: `speed` 1.25 to 1.5 for form filling,
  up to 3 for a long wait you want to show passing. Never speed up the hero moment.

## 6. Scrolling

- `smoothScroll(p, dy)` for a wheel-like scroll, or `scrollIntoCenter(p, loc)` to land a section
  about 30% from the top.
- Scroll, stop, let it settle for a beat, then point. Never point while scrolling.
- Scroll in a few deliberate moves, not one long fling.

## 7. Zoom

- **Default: no zoom, just the gentle 1.05 push-in** the keynote cut adds on its own.
- **Zoom only on the hero moment** of a scene: the result appearing, the number that matters, the
  small button the story depends on. Two or three zooms in a 90 second cut is plenty.
- **How much:** 1.5 to 1.75x. Up to 1.7 for a small app in a wide page (the todo sample). Past 2x
  the UI gets soft.
- **How:** `zoom: [factor, cx, cy, start, duration]` in demo.json, in 1920x1080 output coordinates.
  The ease is a smoothstep. A 0.6 to 1.4s ease reads as calm; under 0.5s feels like a jump cut.
- Start the zoom just before the thing happens, so the viewer is already looking when it changes.
- Pick the centre from a contact sheet, not by guessing.

## 8. Captions

- **One short declarative sentence per scene,** sentence case, ending in a period.
- Under about eight words. Say what happened or why it matters: "Approve. The invoice is sent."
  "Your key stays private." "It asks instead of guessing."
- No em dashes, no exclamation marks, no emoji, no "simply" or "just" filler (except a brand line
  the client wrote).
- Claim only what that scene's footage shows.
- Captions sit below the window, never over the UI being shown.

## 9. Title cards

- Use cards to mark the parts of the story: intro, setup, use, outro. Not between every scene.
- **Title:** a short statement, sentence case, with a period ("Just ask."). **Subtitle:** one plain
  line of context ("Right in the thread.").
- Intro card 3 to 3.5s, part cards about 2.4s, outro card 3.5 to 4s.
- The outro says what it is and where to get it, with a URL that works (checked in the test sweep).

## 10. Colour, type and brand

- **The keynote look is restrained:** a light radial background, the footage in a 1600x900 window
  with a 26px radius and a soft shadow, 0.4s fades through #F3F3F6.
- **Type:** San Francisco (`system-ui` on macOS). Titles 600 weight at -0.015em, subtitles 400 in
  #6e6e73, captions 600 at 44px, text #1d1d1f.
- **Brand:** one accent colour from the product, used on cards and social bands only. The product's
  own UI carries the rest of the brand. Logos go on the intro and outro cards, not every frame.
- Spell product names exactly as the brand does, everywhere (`brand.spelling` in handoff.json).

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

## 12. Music

- Optional, and quiet. A simple bed with no vocals, at 0.12 to 0.18 of full volume
  (`voice.music_volume`, default 0.18), ducked under speech. The narrate step normalises the mix
  to about -16 LUFS. If a viewer notices the music, it is too loud.
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
| Normal arrow, eased arcs, pause, then click | Teleport clicks, constant-speed moves, a click dot |
| Park the pointer after every action | Leave the pointer on the text being read |
| Type short text, paste long text | Type a whole config file on camera |
| Wait on real UI signals, trim waits in the edit | Fixed sleeps, or cutting the take short |
| 1 to 1.5s head, 2 to 3s tail on every take | Start moving on frame one |
| Hide banners, toasts and personal history | Film a real or personal account |
| Mask secrets in the page, check every frame | Blur them in post |
| Zoom 1.5 to 1.75x on the hero moment only | Zoom every scene, or past 2x |
| One short caption sentence per scene | Two lines of caption, or marketing copy |
| Claim only what the footage proves | "Instant", "magic", "effortless" without proof |
| Create real things on camera, delete them after | Fake a step or stage a result |
| Quiet music, ducked under speech | Music that competes with the voice |
| Spell out URLs and amounts in voiceover | Symbols, slashes and em dashes in a script |

## See also

- `learnings.md`: the gotchas behind these rules
- `scene-patterns.md` and `../samples/`: scene code to copy
- `voiceover.md`: writing and timing the voiceover
- `quality-gates.md`: what must pass before each stage
- `secrets.md`: masking and checking secrets
