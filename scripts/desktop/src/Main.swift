// deskcap: records and drives one macOS app window for demo-studio (apps outside the browser).
//
// Writes the same take folder the browser frame receiver writes, so encode-take.sh, tile-frames.py,
// blur-filter.py and the edit work unchanged:
//   <dir>/fNNNNN.jpg   2880x1620 frames: the window fitted in (letterboxed if not 16:9) plus the house cursor
//   <dir>/ts.txt       one capture time per frame (epoch seconds); written last, it marks the take finished
//   <dir>/end.txt      stop time (epoch seconds)
//   <dir>/blur.jsonl   secret boxes from `deskcap blur`, already converted to the 1440-wide space blur-filter.py reads
//   <dir>/layout.json  where the window sits in the frame
//
// Coordinates you pass (move, blur) are window points from the window's top-left corner, title bar included.
// Build: bash scripts/desktop/build.sh. Docs: docs/desktop.md.
import AppKit
import Foundation

let usage = """
usage: deskcap <command> [options]     (coordinates are window points from the window's top-left corner)
  check                                   permissions and macOS version, as JSON
  setup [--no-open]                       which permissions are missing, for which app; adds the app to
                                          each list and opens those Settings pages, with steps to tell the user
  windows [--app NAME]                    on-screen windows, as JSON
  prep --app NAME [--title T] [--x 80 --y 60 --w 1440 --h 810]
                                          bring the app forward and size its window (Accessibility)
  shot --app NAME OUT.png                 one 2x still of the window, to scout a scene (Screen Recording)
  find --app NAME TEXT [--role AXButton]  controls whose label contains TEXT: window points, plus rect and
                                          focus in 1080p take px for scout files (Accessibility)
  record --app NAME --out DIR [--fps 30] [--max-seconds 180] [--cursor hand|arrow|none]
                                          record until `deskcap stop DIR`, Ctrl-C or the limit (Screen Recording)
  stop DIR                                end a running record and wait until the take is written
  move --app NAME X Y [--steps 30]        glide the pointer to X,Y on an eased arc
  click [--app NAME] [--double] [--right] click where the pointer is
  scroll DY [--steps 25]                  smooth scroll by DY points (positive = down)
  type [--app NAME] [--delay 55] -- TEXT  type like a person (ms per key; \\n = Return)
  key [--app NAME] COMBO                  press a shortcut: cmd+s, cmd+shift+n, return, escape, tab, up
  blur DIR X Y W H [--for SECONDS]        blur a box in the take from now on (during or after record)
  selftest DIR [--frames 45] [--window 1440x810] [--pointer X,Y] [--cursor hand]
                                          write a synthetic take, no permissions needed (tests)
With --app, click, type and key refuse to run unless that app is frontmost.
"""

@main
struct Deskcap {
    static func main() async {
        do {
            let args = try Args(Array(CommandLine.arguments.dropFirst()))
            switch args.positional.first {
            case "check":
                printJSON(["screenRecording": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted(),
                           "macOS": ProcessInfo.processInfo.operatingSystemVersionString])
            case "setup": setup(args)
            case "windows": printJSON(listWindows(app: args.options["app"]).map(\.json))
            case "prep": try prep(args)
            case "shot": try await shot(args)
            case "find": try find(args)
            case "record": try await record(args)
            case "stop": try stop(args)
            case "move": try move(args)
            case "click": try click(args)
            case "scroll": try scroll(args)
            case "type": try typeText(args)
            case "key": try key(args)
            case "blur": try blur(args)
            case "selftest": try selftest(args)
            case nil, "help", "-h": print(usage)
            default: print(usage); exit(2)
            }
        } catch {
            warn("\(error)")
            exit(1)
        }
    }
}
