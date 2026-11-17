# Bundled fonts

Every word the keynote engine renders (titles, callout pills, end card) is set in one of these
files, loaded into headless Chrome with `@font-face` from a `data:` URI. No system font is used, so a
cut renders the same on macOS and Linux. Pick the family with `brand.font` in demo.json.

| brand.font | Files | Use |
| --- | --- | --- |
| `inter` (default) | `InterVariable.woff2` (text, `wght` + `opsz` axes), `InterDisplay-Regular.woff2`, `InterDisplay-Medium.woff2` | Inter Display for titles, subtitles and the end card (40 px and up), Inter for pills |
| `geist` | `GeistVariable.woff2` (`wght` axis), `GeistMonoVariable.woff2` | Products whose own UI is set in a geometric sans |

All are SIL Open Font License 1.1 (`OFL.txt` for Inter, `OFL-Geist.txt` for Geist), credited in
the repo `NOTICE`.

## Where they came from

| File | Release | Archive SHA-256 |
| --- | --- | --- |
| Inter files | [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1), `Inter-4.1.zip` (33,707,794 bytes, published 2024-11-16), `web/` folder | `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| Geist files | [vercel/geist-font v1.9.0](https://github.com/vercel/geist-font/releases/tag/v1.9.0), `geist-font-v1.9.0.zip` (published 2026-10-30), `Geist/webfonts/Geist[wght].woff2` and `GeistMono/webfonts/GeistMono[wght].woff2`, renamed | `1f2dd9ea90e68d0358a1d234a5f156807b2c3e0e295d78d87980a6dbad1fa58c` (matches the digest GitHub publishes for the asset) |

File SHA-256:

```
693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3  InterVariable.woff2
3a9463a58c3e7ba1e3cd65b5dbff91a35c508ff78a104cd1121feff83efeb787  InterDisplay-Regular.woff2
f1227907684853882ad00d7f97ce9f64bc17b89a2a291a7d4ec84fccfa442934  InterDisplay-Medium.woff2
5c5588027e59e74e205b9d6c7fd877b261091cee367f6bb3a8d505da14cae512  GeistVariable.woff2
cf5bf55f69e043b1ecf04b0719119b7298e94add67ebcaa709a925b945b46b25  GeistMonoVariable.woff2
```
