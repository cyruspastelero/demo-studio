# Roadmap

What is planned, roughly in order. Open an issue if you want to pick one up or argue for another.

## Next

- **A sample video.** A short demo of a public sample app, made end to end with the plugin, linked
  from the README, with its demo folder in `examples/` so people can rebuild it.
- **Recording on Linux and Windows.** The pipeline runs on Linux in CI, but recording has mostly
  been used on macOS. Test it, fix what breaks and document the differences.
- **A voice-agnostic narration step.** Today the built-in path writes a timed script and a
  placeholder preview. Add a small adapter so any text-to-speech tool can fill the voiceover track.
- **`check.py` fixes.** Let it fix what is safe to fix (index paths, statuses) instead of only reporting.

## Later

- Captions burned in by the built-in path, so a narrated cut needs no other tool.
- Mobile app demos (simulator capture) with the same plan, gates and handoff.
- More worked examples: a multi-person demo and a client-brief demo.
- A gallery of videos made with the plugin.

## Not planned

- AI-generated footage. The point is that the product on screen is real.
- A hosted service. Everything runs on your machine with your logged-in browser.
