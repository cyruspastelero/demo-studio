// The documents are plain JSON in the schema shape. These types cover the fields the app reads;
// anything else (including `_` keys) rides along untouched.

export interface ClipSpec {
  source: string;
  in: number;
  out: number;
  speed?: number;
  screen: string;
  text?: string;
  text_pos?: [number, number];
  text_size?: number;
  text_font?: string;
}
export interface CardShotSpec {
  card: string;
  length: number;
  screen?: string;
  text?: string;
  text_pos?: [number, number];
  text_size?: number;
  text_font?: string;
}
export interface RefShotSpec {
  ref: string;
  in?: number;
  out?: number;
  speed?: number;
  screen?: string;
  text?: string;
  text_pos?: [number, number];
  text_size?: number;
  text_font?: string;
}
export type ShotSpec = ClipSpec | CardShotSpec | RefShotSpec;

export interface SceneSpec {
  name: string;
  voiceover?: string;
  shots: ShotSpec[];
}
export interface VideoSpec {
  key: string;
  title?: string;
  label?: string;
  scenes: SceneSpec[];
}
export interface CardText {
  title: string;
  subtitle?: string;
  logo?: boolean;
  people?: { name: string; role?: string; photo?: string }[];
}
export interface Brand {
  name?: string;
  background?: string;
  title_color?: string;
  subtitle_color?: string;
  accent?: string;
  font?: string;
  logo?: string;
}
export interface Caption {
  start: number;
  end: number;
  text?: string;
  png?: string;
}
export interface SocialSpec {
  video?: string;
  input?: string;
  aspect: '4:5' | '9:16';
  fill?: 'blur' | 'color';
  color?: string;
  fit?: 'contain' | 'crop';
  focus_x?: number;
  focus_y?: number;
  zoom?: number;
  radius?: number;
  captions?: Caption[];
}
export interface HandoffDoc {
  title: string;
  paths?: { raw?: string; out?: string; cards?: string };
  voice?: { rate_wpm?: number; lead_in?: number };
  brand?: Brand;
  cards?: Record<string, CardText>;
  shots?: Record<string, ClipSpec>;
  videos: VideoSpec[];
  social?: SocialSpec[];
  [key: string]: unknown;
}

export interface DemoCardItem {
  card: string;
  title: string;
  subtitle?: string;
  logo?: boolean;
  duration?: number;
  kind?: 'hero' | 'section' | 'end';
  outro?: number;
  voiceover?: string;
}
// A cue placed on a spoken word of the scene's voiceover; the build turns it into seconds.
export interface WordCue {
  word: string;
  nth?: number;
  offset?: number;
}
// A timed pill on a scene. The render draws callouts instead of caption when the key is present.
export interface DemoCallout {
  at: number | WordCue;
  text: string;
  dur?: number;
  kind?: 'person' | 'statement';
  role?: string;
  avatar?: string;
  pos?: [number, number];
  font?: string;
}
export interface DemoSceneItem {
  scene: string;
  stem: string;
  take?: number;
  caption?: string;
  caption_pos?: [number, number];
  caption_font?: string;
  callouts?: DemoCallout[];
  speed?: number;
  trim?: [number | null, number | null];
  zoom?: number[];
  voiceover?: string;
}
export type DemoItem = DemoCardItem | DemoSceneItem;
export interface DemoDoc {
  title: string;
  logo?: string;
  sequence: DemoItem[];
  voice?: { rate_wpm?: number; lead_in?: number };
  [key: string]: unknown;
}

export type FileKind = 'handoff' | 'demo';

export interface MediaInfo {
  file: string; // raw take file name
  path: string; // path relative to the demo folder, for /media/
  duration: number | null;
  status?: string;
  notes?: string;
}

export interface MediaIndex {
  raw: MediaInfo[];
  cards: Record<string, string>; // card name -> PNG path (handoff)
  keynoteCards: Record<string, string>; // card name (no prefix) -> PNG path (demo.json)
}

// One block on the timeline, already resolved to concrete values.
export interface TimelineShot {
  id: string;
  sceneIndex: number;
  shotIndex: number;
  kind: 'clip' | 'card';
  file?: string; // raw take file name for clips
  mediaPath?: string; // relative path for /media/, when the file is known
  card?: string;
  cardTitle?: string;
  cardSubtitle?: string;
  cardPng?: string;
  in: number;
  out: number;
  speed: number;
  length: number; // seconds on the timeline, after speed
  start: number; // timeline position in seconds
  screen: string;
  text: string;
  textPos?: [number, number]; // centre of the on-screen text, frame fractions; undefined = default spot
  textSize?: number; // px in a 1920x1080 frame (handoff only)
  textFont?: string; // a font id from scripts/fonts.mjs; undefined = the default
  ref?: string;
}

export interface TimelineScene {
  index: number;
  name: string;
  voiceover?: string;
  start: number;
  length: number;
  shots: TimelineShot[];
}

export interface Timeline {
  scenes: TimelineScene[];
  shots: TimelineShot[];
  total: number;
  rateWpm: number;
  leadIn: number;
}

export type Aspect = '16:9' | '4:5' | '9:16';

export type Selection =
  | { type: 'shot'; scene: number; shot: number }
  | { type: 'scene'; scene: number }
  | { type: 'card'; name: string }
  | { type: 'video' }
  | { type: 'brand' }
  | null;
