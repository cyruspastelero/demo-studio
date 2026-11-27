# Desktop apps

[Back to the README](../README.md)

Most demos are filmed in the browser. For a native app (a macOS app, an Electron app, a simulator
window), demo-studio records that one window with `deskcap`, a small Swift tool in
`scripts/desktop/`. It writes the same take folder the browser rig writes, so the QA sheets, blur
boxes, `encode-take.sh` and every cut work the same way. The house hand cursor is drawn into each
frame, so desktop and browser scenes look the same.

macOS 14 or newer only.

## Set up once

1. Install the Xcode command line tools: `xcode-select --install`.
2. Build it: `bash "$P/scripts/desktop/build.sh"`. That prints the binary path. It rebuilds only
   when the source changes.
3. Grant two permissions to the app that runs Claude Code (Terminal, iTerm, Ghostty, or your editor
   if Claude Code runs inside it):
   - **Screen Recording**: for `record` and `shot`
   - **Accessibility**: for `prep`, `find`, and the pointer and keyboard commands

   Run `"$P/scripts/desktop/deskcap" setup` (or ask Claude to "set up desktop recording"). It names the
   app that needs them, adds it to both lists and opens those System Settings pages. Turn the app on
   in each, then quit it fully (Cmd-Q) and reopen it. Run `claude --continue` to resume the session.
4. Check it: `"$P/scripts/desktop/deskcap" setup --no-open` should say `"ready": true`.

These permissions let the terminal see your screen and move your pointer. Turn them off again when
you are done filming, if you like.

## How a take works

Run this as one script (the recorder runs in the background of the same shell). The scene recipe
`samples/scenes/desktop-app.scene.sh` has the full version with `# CHANGE:` markers.

```bash
D="$(bash "$P/scripts/desktop/build.sh")"
"$D" prep --app "Notes"                             # bring it forward, size the window to 1440x810
"$D" shot --app "Notes" scout/01-new-note.png       # a 2x still to read coordinates from
"$D" find --app "Notes" "New Note"                  # controls by label: x, y, w, h, centre cx, cy

"$D" record --app "Notes" --out frames/_tmp01 &     # recording starts
"$D" move --app "Notes" 410 52                      # glide on an eased arc, in window points
"$D" click --app "Notes"                            # --app: refuse if Notes is not frontmost
"$D" type --app "Notes" -- "Ideas for the launch"   # 55 ms per key by default
"$D" blur frames/_tmp01 900 300 240 40              # blur a secret from now to the end of the take
"$D" stop frames/_tmp01 && wait                     # returns once ts.txt is written

bash "$P/scripts/encode-take.sh" frames/_tmp01 01-new-note "first take"
```

Coordinates are **window points from the window's top-left corner**, title bar included. In a
`shot` PNG, divide pixel positions by 2. `find` also gives each control's `rect` and `focus` in source
px of the 1080p take, ready for the scout file and demo.json.

If the app won't take 1440x810 (some have a fixed or minimum size), `prep` warns and the take is
letterboxed to 16:9. `record` writes `layout.json` into the take, and `blur` and `find` use it,
so boxes still land in the right place. Keep the window still during a take.

## Commands

| Command | What it does |
| --- | --- |
| `check` | Shows the permissions and macOS version |
| `setup [--no-open]` | Says which permissions are missing and for which app, adds the app to those lists, opens the Settings pages, and prints the steps for the user |
| `windows [--app NAME]` | Lists on-screen windows as JSON (titles need Screen Recording) |
| `prep --app NAME [--title T] [--x --y --w --h]` | Brings the app forward and moves and sizes its window |
| `shot --app NAME [--title T] OUT.png` | Saves one 2x still of the window, without the pointer |
| `find --app NAME TEXT [--role AXButton]` | Finds controls whose label contains TEXT |
| `record --app NAME --out DIR [--title T] [--fps 30] [--max-seconds 180] [--cursor hand\|arrow\|none]` | Records the window until `stop`, Ctrl-C or the limit (5,400 frames at most) |
| `stop DIR` | Ends a running `record` and waits until the take is written |
| `move --app NAME X Y [--steps 30]` | Glides the real pointer on the same eased arc as the browser rig |
| `click [--app NAME] [--double] [--right]` | Clicks where the pointer is |
| `scroll DY [--steps 25]` | Scrolls smoothly (positive is down) |
| `type [--app NAME] [--delay 55] -- TEXT` | Types like a person; `\n` presses Return |
| `key [--app NAME] COMBO` | Presses a shortcut: `cmd+s`, `cmd+shift+n`, `return`, `escape`, `tab`, arrows |
| `blur DIR X Y W H [--for SECONDS]` | Blurs a box in the take, starting now |
| `selftest DIR` | Writes a synthetic take, no permissions needed (used by the tests) |

With `--app`, `click`, `type` and `key` refuse to run unless that app is frontmost, so keys never
land in your terminal.

## Good to know

- **Only that window is filmed.** Other windows, notifications and the menu bar stay out. Menus,
  popovers and right-click menus are separate windows, so they don't show either. Film the result
  instead.
- **The cursor is drawn, not filmed.** The real pointer is hidden in the capture and the house
  hand (or `--cursor arrow` for developer tools) is drawn where it is, pressed while a button is down.
- **Don't touch the mouse or keyboard during a take.** `move`, `click` and `type` use your real
  pointer and keyboard.
- **Hide anything private first.** Quit chat apps and turn on Do Not Disturb. Use a demo account
  in the app, the same as for the browser.
- **Electron apps** may need `--force-renderer-accessibility` at launch before `find` can see
  their controls.
- **`key` uses US key positions.** Use `type` for text, which works with any layout.
- **Rounded window corners** show as black in the frame. The cut's crop usually removes them.
