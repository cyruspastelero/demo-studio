# Shot list

Goal: <one sentence: what the viewer should believe after watching>
Audience: <who is watching, what they already know>

## Quality bar (every take)

- 1440x810 CSS at DPR 2 (2880x1620 capture) -> 1920x1080, 30fps, silent
- One consistent world: same workspace, channel, customer names, record numbers across scenes
- No banners, popups, toasts, stray test data, personal info or real customer data in frame
- Every secret masked in-page before it can render; verified frame by frame on a contact sheet
- Pointer glides and pauses on what the viewer should read, then parks out of the way
- 1 to 1.5s still at the start, 2 to 3s hold at the end
- Each take checked on a contact sheet before it is marked `keep` in recordings/takes.csv

## Scenes

Scene stems are `NN-kebab-name` (`03-import-repo`); use `03b` for inserts. Part is one of
why / setup / use / proof / edge / close.

| # | Part | Scene | What's on screen | Caption | Length | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | why | | | | | |

## Accounts and state needed before recording

- [ ] Logged in (Playwright MCP browser or demo windows): <sites>
- [ ] Sandbox or test accounts only
- [ ] Seed data: <names, records, numbers>

## Edit plan (what the cut does on screen, to the quality bar)

"Window region" becomes `crop`. "Highlight" is a selector the record step's scout measures; its
rect becomes `highlights[].rect`. About one zoom per 11 s of footage, only on a point the
voiceover makes. A pill is 3 to 5 s and never runs during a zoom. Every title has one accent word.

| # | Window region (crop) | Callout pill (3 to 5 s) | Zoom target (when, what) | Highlight (selector) | Music |
| --- | --- | --- | --- | --- | --- |
| 01 | | | | | bed from frame 0 |

| Card | Kind (hero / section / end) | Title (accent word in bold) | Subtitle or tagline |
| --- | --- | --- | --- |
| intro | hero | | |
| outro | end | | |
