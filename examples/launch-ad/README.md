# Launch ad sample

The demo-studio launch ad (36 s, music, no narration) as one storyboard. It is the ad on
demo-studio.pastelero.ph and `sample-launch-ad.mp4` on the samples release. Every panel and card
shows real demo-studio output: frames of the public sample videos, the editor take where a scene's
voiceover line is rewritten, the 16:9, 4:5 and 9:16 exports demo-studio made of its own walkthrough,
and previews of the built-in looks.

## How it was made

1. The walkthrough was filmed and cut first (`examples/demo-studio-launch`). The ad reuses its
   footage, so the stills and clips here are small excerpts of real output.
2. The story was written as a storyboard: a hook, the problem, one typed sentence, the six stages,
   the finished video, a fix in the editor, the three aspect ratios, the looks, then the lock-up.
3. Close-ups were recorded for the zooms: `editor.mp4` is 2880 wide, so the "Fix anything." zoom
   stays under 1.25x and sharp.
4. The look was tuned by eye into its own style, `midnight-ad`, and the ad was rendered in all three
   sizes and checked with `--check` and the video gate.

## The style

`midnight-ad` ([motion-templates/midnight-ad](../../motion-templates/midnight-ad)) is `nocturne`
with a neutral near-black stage, DM Sans (the site's font), one-colour type, no accent glow or
background tint, and no light flips. The ember accent (`#ff7a2e`) appears only on the caret, the
send button, the stage tiles, the progress bar and the done ring.

## Music

The bundled track `ad-french-house-120` from `motion/music/` (demo-studio's own library, free to use,
120 BPM). The storyboard points at it directly, with its beat map
`motion/music/ad-french-house-120.beats.json`, so the cuts land on the beat.

## Render it

From the plugin root:

```bash
node motion/render-motion.mjs examples/launch-ad/storyboard.json --size 16x9 --out /tmp/launch-ad-16x9.mp4
node motion/render-motion.mjs examples/launch-ad/storyboard.json --size 4x5 --out /tmp/launch-ad-4x5.mp4
node motion/render-motion.mjs examples/launch-ad/storyboard.json --size 9x16 --out /tmp/launch-ad-9x16.mp4
```

Expected: `{"ok":true,"style":"midnight-ad","duration":36,"bpm":120.02,"scenes":12,...}` with no
`warnings`, about -14 LUFS. A few minutes per size. Clip frames are cached in
`examples/launch-ad/.motion-cache/` (git-ignored); delete it afterwards. Add `--style nocturne` (or
any other style) to see the same story in another look.

## Files

`media/`: `card-1..6.jpg` (frames of the sample videos and the site), `finished-video.mp4` (a
finished demo-studio video, with the demo account's name blurred), `editor.mp4` (the editor take),
`export-16x9/4x5/9x16.mp4` (short, low-bitrate excerpts of the three exports) and `look-1..6.jpg`
(previews of the built-in looks: Midnight, House, Paper, Mono and a look copied from one of our own
videos). Logo: `assets/logo/mark.svg`. Font: `site/fonts/dm-sans.woff2`.

On screen, in order: "Every demo video / took me / an afternoon.", "I make demos for / my own apps /
and for what we build at work.", "So I taught Claude / everything I learned.", the typed prompt, the
six stages with "Quality check: 0 fail", "Done", the finished video, "Fix anything.", 16:9 / 4:5 /
9:16, "Your look. Your voice. Your app.", "Free. Local. Open source.", then the lock-up with
github.com/cyruspastelero/demo-studio.
