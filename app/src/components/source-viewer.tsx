// The raw take source viewer: one take played on its own at real speed, over the cut preview.
import { ArrowLeft, ExternalLink, Pause, Play, StepBack, StepForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../lib/player';
import { clampSource, sourceLabel, stepSource, type Mark, type SourceControls, type SourceTake } from '../lib/source';
import { timecode } from '../lib/timeline';

interface SourceViewerProps {
  take: SourceTake;
  markable: boolean; // a selected timeline shot uses this take
  onMark: (mark: Mark, time: number) => void;
  onOpenExternal: () => void;
  onClose: () => void;
  onControls: (controls: SourceControls | null) => void;
}

export function SourceViewer({ take, markable, onMark, onOpenExternal, onClose, onControls }: SourceViewerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaLength, setMediaLength] = useState<number | null>(null);
  const duration = take.duration ?? mediaLength;

  const seek = useCallback((t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = clampSource(t, duration);
    setTime(v.currentTime);
  }, [duration]);

  // Keyboard shortcuts reach the viewer through these controls while it is open.
  useEffect(() => {
    const now = () => video.current?.currentTime ?? 0;
    const pause = () => video.current?.pause();
    const play = () => {
      const v = video.current;
      if (!v) return;
      if (v.ended || (duration != null && v.currentTime >= duration - 1 / 60)) v.currentTime = 0;
      v.play().catch(() => setPlaying(false));
    };
    const controls: SourceControls = {
      play, pause, time: now,
      toggle: () => (video.current?.paused ? play() : pause()),
      seekBy: (s) => seek(now() + s),
      step: (f) => { pause(); seek(stepSource(now(), f, duration)); },
      home: () => seek(0),
      end: () => seek(duration ?? Number.MAX_SAFE_INTEGER),
    };
    onControls(controls);
    return () => onControls(null);
  }, [duration, seek, onControls]);

  // A new take starts paused at its first frame.
  useEffect(() => {
    setTime(0);
    setPlaying(false);
    setMediaLength(null);
  }, [take.path]);

  // Smooth time readout while playing; the events cover pauses, seeks and the end.
  useEffect(() => {
    const v = video.current;
    if (!v) return undefined;
    let frame = 0;
    const tick = () => {
      setTime(v.currentTime);
      if (!v.paused) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); tick(); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(frame); setTime(v.currentTime); };
    const onMeta = () => { if (Number.isFinite(v.duration)) setMediaLength(v.duration); };
    const onSeeked = () => setTime(v.currentTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('loadedmetadata', onMeta);
    return () => {
      cancelAnimationFrame(frame);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('loadedmetadata', onMeta);
    };
  }, [take.path]);

  const [kind, file, status] = sourceLabel(take);
  const step = (frames: number) => {
    video.current?.pause();
    seek(stepSource(video.current?.currentTime ?? 0, frames, duration));
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setPlaying(false));
    else v.pause();
  };

  return (
    <div className="source-viewer" data-testid="source-viewer" role="region" aria-label={`Raw take ${take.file}`}>
      <div className="source-head">
        <div className="source-label" data-testid="source-label">
          <span className="eyebrow quiet">{kind}</span>
          <span className="source-sep" aria-hidden="true">·</span>
          <span className="source-file">{file}</span>
          {status && (
            <>
              <span className="source-sep" aria-hidden="true">·</span>
              <span className={`status-${status.toLowerCase()}`}>{status}</span>
            </>
          )}
        </div>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Open in the system player" title="Open in the system player" onClick={onOpenExternal}>
          <ExternalLink size={16} />
        </button>
        <button className="btn" data-testid="source-back" title="Back to the cut (Esc)" onClick={onClose}>
          <ArrowLeft size={16} /> Back to cut
        </button>
      </div>
      <div className="source-stage">
        <video
          ref={video} key={take.path} src={mediaUrl(take.path)} data-testid="source-video"
          muted playsInline preload="auto" onClick={toggle}
        />
      </div>
      <div className="source-scrub">
        <input
          type="range" aria-label="Position in the take" data-testid="source-scrubber"
          min={0} max={duration ?? 0} step={0.01} value={Math.min(time, duration ?? time)}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>
      <div className="transport">
        <button className="icon-btn" aria-label="Back one frame" title="Back one frame (Left)" onClick={() => step(-1)}><StepBack size={16} /></button>
        <button className="icon-btn" aria-label={playing ? 'Pause' : 'Play'} title="Play or pause (Space)" data-testid="source-play" onClick={toggle}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" aria-label="Forward one frame" title="Forward one frame (Right)" onClick={() => step(1)}><StepForward size={16} /></button>
        <span className="tc mono" data-testid="source-timecode">
          <b>{timecode(time)}</b> / <span data-testid="source-duration">{duration == null ? '-' : timecode(duration)}</span>
        </span>
        <span className="spacer" />
        {markable && (
          <>
            <button className="btn" data-testid="source-set-in" title="Set the selected shot's in point here (I)" onClick={() => onMark('in', video.current?.currentTime ?? time)}>Set in</button>
            <button className="btn" data-testid="source-set-out" title="Set the selected shot's out point here (O)" onClick={() => onMark('out', video.current?.currentTime ?? time)}>Set out</button>
          </>
        )}
      </div>
    </div>
  );
}
