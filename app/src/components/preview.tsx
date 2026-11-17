import { Pause, Play, Repeat, StepBack, StepForward, SkipBack } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { captionAt, windowGeometry, type Geometry } from '../lib/geometry';
import { mediaUrl, Player } from '../lib/player';
import { timecode } from '../lib/timeline';
import type { Aspect, Brand, FileKind, SocialSpec, Timeline, TimelineShot } from '../lib/types';

const FULL = { W: 1920, H: 1080 };
// build-keynote.py: footage window at 160,44 sized 1600x900 on a light background.
const KEYNOTE = { x: 160, y: 44, w: 1600, h: 900, bg: '#F3F3F6', radius: 22 };
const BLUR_SCALE = 4;

interface Frame {
  W: number;
  H: number;
  win: { x: number; y: number; w: number; h: number; radius: number };
  crop: { x: number; y: number; w: number; h: number };
  band?: number;
  social: boolean;
}

function frameFor(kind: FileKind, aspect: Aspect, entry: SocialSpec | undefined, src: { w: number; h: number }): Frame {
  if (aspect !== '16:9' && entry) {
    const g: Geometry = windowGeometry(entry, src.w, src.h);
    return { W: g.W, H: g.H, band: g.band, social: true, win: { x: g.x, y: g.y, w: g.winW, h: g.winH, radius: g.radius }, crop: g.crop };
  }
  const crop = { x: 0, y: 0, w: src.w, h: src.h };
  if (kind === 'demo') return { ...FULL, social: false, crop, win: { x: KEYNOTE.x, y: KEYNOTE.y, w: KEYNOTE.w, h: KEYNOTE.h, radius: KEYNOTE.radius } };
  return { ...FULL, social: false, crop, win: { x: 0, y: 0, w: FULL.W, h: FULL.H, radius: 0 } };
}

function useFit(ref: React.RefObject<HTMLDivElement | null>, w: number, h: number) {
  const [box, setBox] = useState({ scale: 0.3, left: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const pad = 16;
      const scale = Math.min((el.clientWidth - pad * 2) / w, (el.clientHeight - pad * 2) / h);
      setBox({ scale: Math.max(scale, 0.05), left: (el.clientWidth - w * scale) / 2, top: (el.clientHeight - h * scale) / 2 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, w, h]);
  return box;
}

function CardView({ shot, brand }: { shot: TimelineShot; brand: Brand | undefined }) {
  if (shot.cardPng) return <img src={mediaUrl(shot.cardPng)} alt={shot.cardTitle ?? shot.card} />;
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: brand?.background ?? '#F6F6F8',
      fontFamily: brand?.font ?? "'SF Pro Display', system-ui, -apple-system, sans-serif",
    }} data-testid="html-card">
      <div>
        <div className="card-title" style={{ color: brand?.title_color ?? '#1D1D1F' }}>{shot.cardTitle ?? shot.card}</div>
        {shot.cardSubtitle && <div className="card-subtitle" style={{ color: brand?.subtitle_color ?? '#6E6E73' }}>{shot.cardSubtitle}</div>}
      </div>
    </div>
  );
}

export function Preview({ kind, timeline, aspect, social, brand, missing, loop, onToggleLoop, onPlayer, overlay }: {
  kind: FileKind;
  timeline: Timeline;
  aspect: Aspect;
  social: SocialSpec | undefined;
  brand: Brand | undefined;
  missing: Set<string>;
  loop: boolean;
  onToggleLoop: () => void;
  onPlayer: (player: Player | null) => void;
  overlay?: ReactNode; // the raw take source viewer, drawn over the cut while open
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [src, setSrc] = useState({ w: 1920, h: 1080 });

  useEffect(() => {
    if (!videoA.current || !videoB.current) return undefined;
    const p = new Player(videoA.current, videoB.current);
    setPlayer(p);
    onPlayer(p);
    return () => {
      onPlayer(null);
      p.destroy();
    };
  }, [onPlayer]);

  useEffect(() => { player?.setTimeline(timeline); }, [player, timeline]);

  useEffect(() => {
    const onMeta = (e: Event) => {
      const v = e.target as HTMLVideoElement;
      if (v.videoWidth && (v.videoWidth !== src.w || v.videoHeight !== src.h)) setSrc({ w: v.videoWidth, h: v.videoHeight });
    };
    const videos = [videoA.current, videoB.current];
    videos.forEach((v) => v?.addEventListener('loadedmetadata', onMeta));
    return () => videos.forEach((v) => v?.removeEventListener('loadedmetadata', onMeta));
  }, [src]);

  const frame = frameFor(kind, aspect, social, src);
  const blur = frame.social && (social?.fill ?? 'blur') === 'blur';

  // The blurred background of the social layouts, painted from the visible video each frame.
  useEffect(() => {
    if (!player) return undefined;
    player.onFrame = (video, shot) => {
      const c = canvas.current;
      if (!blur || !c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      if (!video || video.readyState < 2) {
        ctx.fillStyle = shot?.kind === 'card' ? (brand?.background ?? '#F6F6F8') : '#888';
        ctx.fillRect(0, 0, c.width, c.height);
        return;
      }
      const scale = Math.max(c.width / video.videoWidth, c.height / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      ctx.filter = 'blur(5px) brightness(1.25) saturate(0.55)';
      ctx.drawImage(video, (c.width - w) / 2, (c.height - h) / 2, w, h);
      ctx.filter = 'none';
    };
    // Repaint after a paused seek lands on a new frame.
    const repaint = () => player.onFrame?.(player.current?.kind === 'clip' ? player.activeVideo : null, player.current);
    const videos = [videoA.current, videoB.current];
    videos.forEach((v) => v?.addEventListener('seeked', repaint));
    return () => {
      player.onFrame = null;
      videos.forEach((v) => v?.removeEventListener('seeked', repaint));
    };
  }, [player, blur, brand]);

  const snap = useSyncExternalStore(player?.subscribe ?? noopSubscribe, player?.getSnapshot ?? emptySnapshot);
  const shot = timeline.shots.find((s) => s.id === snap.shotId) ?? timeline.shots[0];
  const box = useFit(wrap, frame.W, frame.H);
  const scale = frame.win.w / frame.crop.w;
  const videoStyle: React.CSSProperties = {
    width: src.w * scale, height: src.h * scale, left: -frame.crop.x * scale, top: -frame.crop.y * scale,
  };
  const caption = frame.social ? captionAt(social, snap.time) : undefined;
  const isMissing = shot?.kind === 'clip' && shot.file && missing.has(shot.file);
  // Hidden, not unmounted, under the source viewer: the cut player and its playhead stay as they were.
  const under: React.CSSProperties | undefined = overlay ? { visibility: 'hidden' } : undefined;
  const stageBg = frame.social ? (blur ? '#888' : social?.color ?? '#F3F3F6') : kind === 'demo' ? KEYNOTE.bg : '#000';

  return (
    <section className="preview" aria-label="Preview">
      <div className="stage-wrap" ref={wrap} style={under}>
        <div
          className="stage" data-testid="stage" data-aspect={aspect}
          style={{ width: frame.W, height: frame.H, background: stageBg, transform: `translate(${box.left}px, ${box.top}px) scale(${box.scale})` }}
        >
          {blur && <canvas ref={canvas} className="bg-canvas" width={frame.W / BLUR_SCALE} height={frame.H / BLUR_SCALE} />}
          {frame.social && (
            <div className="band" data-testid="caption-band" style={{ height: frame.band, fontFamily: brand?.font }}>{caption}</div>
          )}
          <div
            className={`window${frame.social ? ' social' : kind === 'demo' ? ' keynote' : ''}`} data-testid="window"
            style={{ left: frame.win.x, top: frame.win.y, width: frame.win.w, height: frame.win.h, borderRadius: frame.win.radius }}
          >
            <video ref={videoA} style={videoStyle} data-testid="video-a" muted playsInline />
            <video ref={videoB} style={videoStyle} data-testid="video-b" muted playsInline />
            {shot?.kind === 'card' && (
              <div className="card-view" style={videoStyle}>
                <CardView shot={shot} brand={brand} />
              </div>
            )}
            {isMissing && <div className="missing-media">Missing take: {shot.file}</div>}
            {!shot && <div className="empty-stage">Nothing on the timeline yet</div>}
          </div>
          {!frame.social && kind === 'handoff' && shot?.text && <div className="onscreen" data-testid="onscreen-text">{shot.text}</div>}
          {!frame.social && kind === 'demo' && shot?.kind === 'clip' && shot.text && <div className="keynote-caption">{shot.text}</div>}
        </div>
      </div>
      <div className="transport" style={under}>
        <button className="icon-btn" aria-label="Go to start" title="Go to start (Home)" onClick={() => player?.seek(0)}><SkipBack size={16} /></button>
        <button className="icon-btn" aria-label="Back one frame" title="Back one frame (Left)" onClick={() => player?.step(-1)}><StepBack size={16} /></button>
        <button className="icon-btn" aria-label={snap.playing ? 'Pause' : 'Play'} title="Play or pause (Space)" data-testid="play" onClick={() => player?.toggle()}>
          {snap.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" aria-label="Forward one frame" title="Forward one frame (Right)" onClick={() => player?.step(1)}><StepForward size={16} /></button>
        <span className="tc mono" data-testid="timecode"><b>{timecode(snap.time)}</b> / {timecode(timeline.total)}</span>
        <button className={`icon-btn${loop ? ' on' : ''}`} aria-pressed={loop} aria-label="Loop the selected shot" title="Loop the selected shot (O)" onClick={onToggleLoop}><Repeat size={16} /></button>
        <span className="spacer" />
        <span className="shot-label">{shot ? (shot.kind === 'card' ? shot.card : `${shot.file}  ${shot.in.toFixed(2)}s to ${shot.out.toFixed(2)}s${shot.speed !== 1 ? `  at ${shot.speed}x` : ''}`) : ''}</span>
      </div>
      {overlay}
    </section>
  );
}

const noopSubscribe = () => () => undefined;
const EMPTY = { time: 0, playing: false, shotId: null };
const emptySnapshot = () => EMPTY;
