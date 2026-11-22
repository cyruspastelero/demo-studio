// Storyboard timing: scene lengths in beats or seconds become absolute start/end times,
// optionally aligned to a music beat grid.

export function beatSeconds(bpm) {
  if (!(bpm > 0)) throw new Error(`bpm must be > 0, got ${bpm}`);
  return 60 / bpm;
}

/** Nearest beat time to t on the grid (offset + k * beat), with an optional subdivision (2 = eighths). */
export function snapToBeat(t, { bpm, offset = 0, division = 1 }) {
  const step = beatSeconds(bpm) / division;
  const k = Math.round((t - offset) / step);
  return offset + Math.max(0, k) * step;
}

/**
 * Resolve scene times. Each scene has `beats` (needs timing.bpm) or `duration` seconds.
 * The first scene starts at timing.start (default: the first beat at or after 0, i.e. offset).
 * Returns [{index, start, end, duration}] with times rounded to the frame grid so renders are exact.
 */
export function resolveScenes(scenes, timing = {}, fps = 30) {
  const bpm = timing.bpm;
  const beat = bpm ? beatSeconds(bpm) : null;
  let cursor = timing.start ?? (bpm ? (timing.offset ?? 0) : 0);
  const frame = 1 / fps;
  const snap = (t) => Math.round(t / frame) * frame;
  return scenes.map((scene, index) => {
    let duration;
    if (scene.beats != null) {
      if (!beat) throw new Error(`scenes[${index}].beats needs timing.bpm`);
      duration = scene.beats * beat;
    } else if (scene.duration != null) {
      duration = scene.duration;
    } else {
      throw new Error(`scenes[${index}] needs "beats" or "duration"`);
    }
    const start = snap(cursor);
    cursor += duration;
    const end = snap(cursor);
    return { index, start, end, duration: end - start };
  });
}

/** Times (seconds, local to a scene) for n items spread across the scene, one per `every` beats. */
export function beatSteps(n, { bpm, every = 1, startBeat = 0 }) {
  const beat = beatSeconds(bpm);
  return Array.from({ length: n }, (_, i) => (startBeat + i * every) * beat);
}

export function totalDuration(resolved, tail = 0) {
  return resolved.length ? resolved[resolved.length - 1].end + tail : 0;
}
