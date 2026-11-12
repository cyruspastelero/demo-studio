# Quality gates

A demo that shows something a viewer cannot repeat is worse than no demo. These gates sit between
the stages. Each one has a "done when" line; do not start the next stage until it is true.

## 1. Claims list (end of planning)

Write down every claim the video makes ("one click", "no API keys", "paid in seconds"). Each claim
needs a shot that proves it. A claim the footage cannot show is cut from the script, not softened.
The list goes in `handoff.json` `brief.claims` and is ticked against the footage before sending.

Every person on screen has a name and a role, and the script introduces each one.

Done when: every claim maps to a scene in the shot list.

## 2. Test sweep (before any take)

**Test the product**
- If you run your own copy (`app/`), its test suite passes.
- Run each scene's action off camera, in order, from a freshly reset state. Every scene ends in the
  expected visible state, waited for on a real UI signal, not a sleep.
- Run each edge-case scene too (decline, cancel, missing input, a wrong value). Each must end in a
  clear message, not a spinner, a raw error or an empty screen.
- Run the hero flow twice in a row. The second run must also pass: no "already exists", no stale
  drafts, no duplicate ids.
- Anything that cannot be undone (a sent email, a simulated deposit) is rehearsed on a separate
  account, never the one being filmed.

**Hunt dead ends** (anything that leaves the viewer stuck)
- Every link, button and menu the video shows or the voiceover mentions opens a real page: no 404,
  no "coming soon", no login wall for a public viewer, no admin-only screen shown as a normal step.
- Every URL, repo, install command and product name in the script, captions, cards and end card is
  checked: `curl -sI` returns 200 or the expected redirect, the repo is visible to the audience, the
  command runs.
- Setup is complete: every credential, scope, permission, env var and toggle the viewer needs is
  shown on camera or written in the how-to script. Nothing was set up earlier, off screen, without
  saying so.
- Fresh-account check for anything a viewer would do themselves: do it once as a brand new user.
  Onboarding tours, empty states and permission prompts that only a new user sees are handled or shown.
- The video never ends mid-air: the last scene shows proof in the system of record, and the end
  card says where to get the product.

Write the result as a table in the demo README under **Test sweep**: each path, how it was checked,
pass or the fix. A failure is fixed, or the scene is cut and its claim removed.

Done when: every scene, edge case and link in the table passes.

## 3. Take review (during the shoot)

- Mark each take `keep`, `alt` or `reject` with a reason before moving to the next scene.
- Add to THROWAWAYS.md the moment something is created on camera.
- Check every secret-bearing take frame by frame across the reveal (`tile-frames.py ... every=1`).

Done when: every scene has a `keep` take and no take is still `new`.

## 4. Cold follow-through (before sending)

Follow the how-to script literally, as a stranger, with only what it says and shows, on a fresh
test account. If you get stuck, have to guess, or need something it never mentions, that is a dead
end: add the missing step to the script and the footage list, or re-shoot. Then re-check every URL
in the final scripts and cards.

Done when: the cold run reaches the end result, the voiceover fits, and every claim is ticked.

## 5. After the edit comes back

- Save the finished videos to `<demo>/final/` and point the index at them.
- Re-time the voiceover to the finished cut, not to the rough assembly. Editors tighten: a 1:30
  assembly can come back at 1:14, and the old timing drifts.

## 6. Close out

- Delete `recordings/frames/` once takes are encoded and the reel or handoff is built, with the
  user's go-ahead (or a standing OK written in the workspace AGENTS.md). Raw takes stay.
- After sign-off, delete the throwaways and mark each row `deleted <date>` or `kept: <reason>`.
- Rotate any credential that was pasted into chat or shown on screen, even blurred.
- Set the status and the index row, then run the workspace `check.py`. It should report nothing.
