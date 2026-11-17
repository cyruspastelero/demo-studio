# Writing the voiceover

The voiceover is read by an AI voice (or a person) over the finished cut. Write it like a person
teaching a colleague, not like a caption.

## Voice

- Present tense, second person: "Go to Settings." "Now press Run." "Here's our thread."
- Point at what is on screen at that moment ("this Install button") and explain why in a half
  sentence ("so nothing sensitive ends up in the repo").
- Open with the relatable problem, signpost each part ("First, set it up." "Now let's use it."),
  and end with the one-line payoff and where to get it.
- Claim only what the footage shows. If the screen does not prove it, do not say it. The brief's
  `do_not_say` list goes to the editor too.
- Introduce people by name and role the first time ("Meet Sam from sales").

## Write for the ear

- Short sentences and contractions.
- No em dashes, parentheses, slashes, ampersands or other symbols. Use commas and periods.
- Spell out URLs: "acme dot com slash billing".
- Spell out amounts and numbers the way they are said: "twelve hundred dollars", "net fourteen",
  "invoice zero zero zero six".
- Write names as they are pronounced if the voice might trip ("Smith and Lowe", not "Smith & Lowe").

## Timing

- Budget about **2.5 words per second** of the scene the line plays over (165 words a minute).
- A line starts 0.3s into its scene (`voice.lead_in`) and must end before the next voiced scene
  starts. A scene without a line lets the previous line run on.
- `build-handoff.py` checks every line. On macOS it renders each line with `say` at
  `voice.rate_wpm` and measures it; elsewhere it estimates from the word count. It reports lines
  that run long ("line 3 runs 9.1s but has 7.4s"). Fix by cutting words, slowing the shots
  (lower `speed`), or holding a card longer. Never speed the voice up past natural.
- The timing preview (`reference/<VIDEO>-VOICEOVER-TIMING-PREVIEW.mp4`) places every line with a
  placeholder voice so the editor and the user can hear the pacing before the real voice exists.

## Recording the voice

`narrate.py` turns the `voiceover` lines in `demo.json` into a narrated keynote cut. Where the
voice comes from:

| Source | How |
| --- | --- |
| Your own recordings | Save line 1 as `voiceover/01.mp3`, line 2 as `02.mp3`... (.wav and .m4a also work), then `--voice files` |
| ElevenLabs MCP or Higgsfield MCP | `narrate.py demo.json --export-lines` writes `voiceover/lines.json` with each line's text, file name, start, time budget and word budget. Make each file with the MCP tool, save it under that name, then `--voice files` |
| ElevenLabs API key | `export ELEVENLABS_API_KEY=...` in your shell, or keep the key in the macOS Keychain and `export ELEVENLABS_KEYCHAIN_SERVICE=<item name>` |
| macOS `say` | Free, used when nothing else is set up |

With no `--voice`, narrate.py uses your files when `voiceover/` has them, else ElevenLabs when it
finds a key, else `say`. Never paste a key into chat, a file or a commit. Higgsfield has no
documented text to speech API, so it is MCP only. Commands and fixes: skill `demo-edit`, Step 3.

For the MCP route, keep one voice for every line and remake a line's file after changing its text.
Each line still has to fit its budget; narrate.py reports a long line, it never speeds it up.

## Music bed

The quality bar asks for a bed under every narrated cut (`docs/quality-bar.md` A6). The default
source is the ElevenLabs MCP (`compose_music`, `force_instrumental: true`, `music_length_ms` from
`voiceover/lines.json`) or the user's own licensed instrumental track. The Higgsfield MCP
(`generate_audio` with a music model) also works. Save it as `music/bed.m4a`.
`scripts/make-bed.py` makes only a **placeholder bed, replace before sharing**: sine-pad test tones
for checking timing and levels. It tags the file, and narrate.py prints a warning on every render
that uses it. Then set
`"voice": {"music": "music/bed.m4a", "music_dips": [{"at": 12.0, "dur": 1.5}]}`. narrate.py loops
it, sets it 13 dB under the narration, holds it 7 dB lower under each spoken line (a fixed
envelope with 0.25 s ramps that stays down through pauses under 1.2 s, so it never pumps), dips it
on the key moment,
fades it out (silent for the last 3 s of an outro) and brings the mix to -14 LUFS with true peak
under -1 dBTP. No vocals, and only music you have the rights to.

## Promo vs how-to

- **Promo (about 1:30):** the story only. One idea per scene, about 8 to 12 lines in total.
- **How-to (about 3:00):** the same story plus setup steps and an edge case. Each step names the
  exact button or field. About 12 to 16 lines.

## Client wording

If the brief came with a script, use their lines exactly. Do not "improve" them. If a line does not
fit its window or the footage cannot prove it, flag it to the user with a suggested change.

## Delivery

The editor gets `<n>-<VIDEO>-VOICEOVER.txt`: numbered lines with start times, then a full read in one
block for voice tools that prefer a single take. The suggested voice is warm, relaxed and
conversational, about 160 words a minute.
