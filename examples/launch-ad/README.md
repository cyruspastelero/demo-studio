# Launch ad sample

The demo-studio launch ad (36 s, music, no narration) as one storyboard. Every panel and card shows
real demo-studio output: frames of the two public sample videos, the editor take where a scene's
voiceover line is rewritten, and the 16:9, 4:5 and 9:16 exports demo-studio made of its own launch
video. Style `airy`; brand fonts from `site/fonts/`.

Render it from the plugin root:

```bash
node motion/render-motion.mjs examples/launch-ad/storyboard.json --size 16x9 --out /tmp/launch-ad-16x9.mp4
node motion/render-motion.mjs examples/launch-ad/storyboard.json --size 9x16 --out /tmp/launch-ad-9x16.mp4
node motion/render-motion.mjs examples/launch-ad/storyboard.json --style nocturne --size 16x9 --from 11.5 --to 25 --out /tmp/launch-ad-nocturne.mp4
```

Expected: `{"ok":true,"style":"airy","duration":36,"bpm":119.999,"scenes":13,...,"loudness":{"integrated":-14,"truePeak":-1.4}}`.
About 6 minutes per size. Clip frames are cached in `examples/launch-ad/.motion-cache/`
(git-ignored); delete it afterwards.

`media/`: `card-1..6.jpg` (sample video frames), `finished-video.mp4`, `editor.mp4`,
`export-16x9/4x5/9x16.mp4` (short, low-bitrate excerpts), `music.mp3` (instrumental, made with
ElevenLabs Music for this ad) and `music.beats.json` (from `motion/analyze-beats.mjs`: 120 BPM).

On screen, in order: "Every demo video / took me / *an afternoon.*", "I make demos for / *my own
apps* / and for what we build at work.", "So I taught *Claude* / everything I *learned.*", the typed
prompt, the six stages with "Quality check: 0 fail", "*Done*", the finished video, "*Fix* anything.",
16:9 / 4:5 / 9:16, "Your look. Your voice. Your *app.*", "Free. Local. *Open source.*", then the
lock-up with github.com/cyruspastelero/demo-studio.
