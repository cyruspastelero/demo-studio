# Plan: an editor on par with paid desktop editors, free and local

Goal: demo-studio's editor must do what people use paid desktop editors for, so finished
videos never need a paid app. Everything stays local and free; ElevenLabs and Higgsfield are optional
voice and music sources (API key or MCP).

## What a paid desktop editor gave us

- Multi-track timeline: video, audio (narration lines, scene audio, sound effects, music), captions, text.
- Clips with in/out, start/end, volume, audio fades, transitions.
- Keyframed transforms: position, scale, opacity, blur, corner radius (zooms and pans).
- Captions synced to narration, exported as burned-in text and as .srt.
- Colour grading and preset looks.
- Generated narration and music, then a finished MP4 export in 16:9, 4:5, 9:16 and more.

## Design

- **One timeline file per cut: `<demo>/timelines/<name>.timeline.json`**, schema in
  `schemas/timeline.schema.json`. Tracks hold items with `start`, `end`, `in`, `out`, `src` (always
  inside the demo folder, checked with the same path rules as everything else), `volume`, `fade_in`,
  `fade_out`, `transition`, `keyframes`, `grade`, `text`, `caption`.
- **Converters, so nothing is lost:** `demo.json` (keynote cut) to timeline, `handoff.json` video to
  timeline.
- **One renderer:** `scripts/render-timeline.py` builds a single ffmpeg filter graph from the
  timeline (video, overlays, keyframes, grade, captions, mixed audio with ducking, loudness) and
  writes the MP4 plus an .srt. The editor's preview plays the same model in the browser with audio.
- **Voice and music sources:** `say`, own recordings, ElevenLabs (API key from the environment, or
  the ElevenLabs MCP), Higgsfield (MCP; its API only if it has a documented speech endpoint).
  `narrate.py --export-lines` writes `voiceover/lines.json` (index, text, target file, max seconds)
  so Claude can make each line with any MCP tool and drop the files in `voiceover/`.

## Phases (one at a time, each ends green: typecheck, unit tests, smoke, e2e)

1. **Timeline core:** schema, converters (demo.json, handoff.json), renderer
   with video, audio tracks, volume, fades, music ducking, captions and .srt.
2. **Editor tracks:** the editor opens timelines: multiple video and audio tracks with waveforms,
   audio playback in the preview, drag, trim, split, ripple, snapping, volume and fade handles,
   caption track editing, render to MP4 from the editor.
3. **Look:** keyframed zoom and pan with easing (editable on the preview), transitions
   (dissolve, dip), text and title layers, image overlays, colour grade (exposure, contrast,
   saturation, temperature, preset looks), reframing for 4:5 and 9:16 per clip.
4. **Voice and music in the editor:** generate or regenerate a narration line from its caption
   (say, ElevenLabs key), line fit warnings, MCP route through Claude, music bed picker with
   ducking preview.

## Not planned

AI-generated footage, cloud rendering, accounts, or anything that needs a network connection
except the optional voice and music sources.
