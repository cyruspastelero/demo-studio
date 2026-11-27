# Recorded SFX kit: sources

Every file here is CC0 (public domain), made by [Kenney](https://kenney.nl). Credit is not required,
but it is welcome: "Sound effects by Kenney (kenney.nl), CC0."

Each file was trimmed of leading and trailing silence, converted to 48 kHz stereo 16-bit WAV and
peak-normalised to -3 dBFS (typing: -4 dBFS). The render mix sets the final level (`audio.sfxGainDb`).

| Cue | Source file | Pack |
|---|---|---|
| `click` | `click_001.ogg` | Interface Sounds 1.0 |
| `tick` | `tick_002.ogg` | Interface Sounds 1.0 |
| `pop` | `drop_002.ogg` | Interface Sounds 1.0 |
| `select` | `select_001.ogg` | Interface Sounds 1.0 |
| `toggle` | `toggle_001.ogg` | Interface Sounds 1.0 |
| `scroll` | `scroll_002.ogg` | Interface Sounds 1.0 |
| `open` | `open_002.ogg` | Interface Sounds 1.0 |
| `close` | `close_002.ogg` | Interface Sounds 1.0 |
| `success` | `confirmation_002.ogg` | Interface Sounds 1.0 |
| `error` | `error_006.ogg` | Interface Sounds 1.0 |
| `drop` | `drop_004.ogg` | Interface Sounds 1.0 |
| `typing` | 18 hits of `click_002`-`click_005`, `select_001`-`select_002`, uneven 55-105 ms gaps, 2.4 s | Interface Sounds 1.0 |
| `swish` | `card-slide-1` | Casino Audio |
| `sparkle` | `jingles-steel-05` | Music Jingles |
| `notify` | `notification-pop` | Kenney, via the soundcn registry (CC0) |

Interface Sounds came from Kenney's own zip (its `License.txt` says CC0). The rest came from the
[soundcn](https://github.com/kapishdima/soundcn) registry, picking only items whose metadata says
author Kenney and license CC0. Never take soundcn's World of Warcraft sounds: Blizzard owns them.

`whoosh` and `hit` have no recorded file. They stay synthesised by `motion/make-sfx.mjs`, because the
Kenney packs have no air whoosh or low impact that fits a scene change or a logo landing. To replace
one, add `<cue>.wav` here and a row above.
