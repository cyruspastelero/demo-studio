# Motion gallery

Every launch-ad scene type once, 1 to 2 seconds each, on demo-studio's own screenshots. It is the
preview set for the motion templates (`motion-templates/<name>/preview/`) and the quickest way to see
a new style.

```bash
node motion/render-motion.mjs examples/motion-gallery/storyboard.json --style nocturne --size 16x9 --no-audio --out /tmp/gallery-nocturne.mp4
node motion/contact-sheet.mjs /tmp/gallery-nocturne.mp4 --fps 2
```

Expected: `{"ok":true,"style":"nocturne","duration":29.2,"bpm":null,"scenes":16,...}` and a sheet
path. `long-headline.json` is a robustness check: in 9:16 its long words shrink and its long lines
wrap, and nothing is clipped (`--size 9x16 --stills 0.9,2.4,3.8,5.3,6.9 --stills-dir /tmp/long`).
