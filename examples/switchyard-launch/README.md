# Switchyard launch ad sample (daylight)

A 36 s launch ad (music, no narration) for [Switchyard](https://github.com/cyruspastelero/switchyard),
an open-source macOS app that gives each project its own desktop. It shows the `daylight` motion
template: typed headlines with a caret, one button lifted out of the UI and clicked on the beat, a
prompt box, a `shapeSweep` transition, a sharp zoom into a real dashboard take, and the lock-up.

Render it from the plugin root:

```bash
node motion/render-motion.mjs examples/switchyard-launch/storyboard.json --check
node motion/render-motion.mjs examples/switchyard-launch/storyboard.json --size 16x9 --out /tmp/switchyard-16x9.mp4
```

Expected: `{"ok":true,"style":"daylight","duration":36,"bpm":119.999,"scenes":13,...}` with no
`warnings`. About 6 minutes per size. Delete `examples/switchyard-launch/.motion-cache/` afterwards.

`media/`:

- `dashboard-sort.mp4`: a real take of Switchyard's dashboard sorting windows (demo data).
- `rename-closeup.mp4`: a real close-up take, recorded with the panel zoomed to 260% and encoded at
  2880x1620 (`OUT_SIZE=2880x1620`), so the `uiFocus` zoom stays sharp. Compare it with a zoom into
  half of a normal 1920 take: `--check` warns that one stretches 2.0x.
- `windows-pile.mp4`, `menu-sort.mp4`, `switch-keys.mp4`: stylised illustrations of the desktop
  (neutral window shapes, no real app icons), made before the desktop was screen recorded.
- `logo.svg`: Switchyard's mark.
- Music and beats: shared with `examples/launch-ad/media/` (instrumental, made with ElevenLabs Music).

On screen, in order: "Where's my *payments* terminal?", "Every window, *one desktop.*", "Meet
*Switchyard.*", "One *click.*" [Sort now > Sorted], "Every window *goes home.*", "One *key* per
project.", the shape sweep, the option keys, "Or type a *few letters.*", "Every project, *one page.*",
"Name your *Chrome windows.*", "Runs *locally.*" / "Free and *open source.*", then the lock-up with
github.com/cyruspastelero/switchyard and "Every project, its own desktop."
