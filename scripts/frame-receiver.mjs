// Local sink for Chrome screencast frames posted from the Playwright session.
// POST /start?take=<name>  -> creates <rec>/frames/<name>/, resets the index
// POST /frame  {ts, b64}    -> writes fNNNNN.jpg and records its timestamp
// POST /blur   {x,y,w,h,t[,until]} -> appends a post-encode blur box (CSS px, epoch s)
// POST /stop                -> writes ts.txt (timestamps) + end.txt (stop time)
// Run from the recordings dir: node frame-receiver.mjs [recordings-dir]
// Env: DEMO_RX_PORT (default 8765), DEMO_MIN_FREE_GB (default 4)
//
// Any website open in the browser can send requests to 127.0.0.1, so every request must carry
// the x-rx-token header with this run's random token. The token is written to
// <recordings>/.rx-token (mode 0600, a JSON map of port -> token); mk-scene.sh, mk-lib.sh and
// rec.mjs read it and put it into the scene code. A web page cannot add a custom header to a
// cross-origin request without a CORS preflight, which this server never approves. Requests
// with an Origin header, or a Host other than 127.0.0.1/localhost on this port, are refused too.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statfsSync, writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const recordings = resolve(process.argv[2] || process.cwd());
const root = join(recordings, "frames");
const port = Number(process.env.DEMO_RX_PORT || 8765);
const minFreeBytes = Number(process.env.DEMO_MIN_FREE_GB || 4) * 1024 ** 3;
const MIN_GAP = 1 / 30; // cap at 30fps; terminals and consoles repaint constantly
const MAX_FRAMES = 5400; // 3 min at 30fps, hard stop per take
const MAX_FRAME_BODY = 16 * 1024 * 1024; // one 2880x1620 JPEG as base64 JSON is ~1-3 MB
const MAX_SMALL_BODY = 4 * 1024;
const TAKE = /^[A-Za-z0-9][\w.-]*$/;
const MAX_COORD = 100_000;
const TOKEN_FILE = join(recordings, ".rx-token");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[frame-receiver] DEMO_RX_PORT must be a port number, got ${process.env.DEMO_RX_PORT}`);
  process.exit(1);
}
mkdirSync(root, { recursive: true });

const token = randomBytes(24).toString("hex");
const tokenBuffer = Buffer.from(token);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

// Keeps other ports' tokens so two windows can record at once into the same folder.
function writeTokenFile() {
  let tokens = {};
  try {
    const old = existsSync(TOKEN_FILE) ? JSON.parse(readFileSync(TOKEN_FILE, "utf8")) : {};
    if (old && typeof old === "object" && !Array.isArray(old)) tokens = old;
  } catch {
    tokens = {};
  }
  const next = { ...tokens, [String(port)]: token };
  const tmp = `${TOKEN_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, TOKEN_FILE);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) {
      reject(new HttpError(413, `body too large (limit ${limit} bytes)`));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `body too large (limit ${limit} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

function checkRequest(req) {
  if (req.method !== "POST") throw new HttpError(405, "only POST is allowed");
  if (!allowedHosts.has(String(req.headers.host || "").toLowerCase())) throw new HttpError(403, "bad Host header");
  if (req.headers.origin !== undefined) throw new HttpError(403, "requests from web pages are not allowed");
  const given = Buffer.from(String(req.headers["x-rx-token"] || ""));
  if (given.length !== tokenBuffer.length || !timingSafeEqual(given, tokenBuffer)) {
    throw new HttpError(403, "missing or wrong x-rx-token (re-run mk-scene.sh / mk-lib.sh after starting the receiver)");
  }
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

function blurBox(body) {
  const box = parseJson(body);
  if (!box || typeof box !== "object") throw new HttpError(400, "blur box must be an object");
  const { x, y, w, h, t, until } = box;
  for (const [name, value] of Object.entries({ x, y, w, h, t })) {
    if (!finite(value)) throw new HttpError(400, `blur.${name} must be a number`);
  }
  if (x < 0 || y < 0 || x > MAX_COORD || y > MAX_COORD) throw new HttpError(400, "blur x/y out of range");
  if (w <= 0 || h <= 0 || w > MAX_COORD || h > MAX_COORD) throw new HttpError(400, "blur w/h out of range");
  if (t <= 0) throw new HttpError(400, "blur.t must be an epoch time in seconds");
  if (until !== undefined && until !== null && (!finite(until) || until < t)) {
    throw new HttpError(400, "blur.until must be a number after t");
  }
  return { x, y, w, h, t, ...(finite(until) ? { until } : {}) };
}

let dir = null;
let stamps = [];
let lastTs = 0;

async function handle(req, res, url) {
  if (url.pathname === "/start") {
    await readBody(req, MAX_SMALL_BODY);
    const take = url.searchParams.get("take");
    if (!take || !TAKE.test(take) || take.includes("..")) throw new HttpError(400, "bad take name");
    const free = statfsSync(root);
    if (free.bavail * free.bsize < minFreeBytes) throw new HttpError(507, "not enough free disk space to record");
    dir = join(root, take);
    mkdirSync(dir, { recursive: true });
    stamps = [];
    lastTs = 0;
  } else if (url.pathname === "/frame") {
    const body = await readBody(req, MAX_FRAME_BODY);
    if (!dir) throw new HttpError(409, "no active take");
    const { ts, b64 } = parseJson(body) ?? {};
    if (!finite(ts) || typeof b64 !== "string") throw new HttpError(400, "frame needs a numeric ts and a b64 string");
    if (ts - lastTs < MIN_GAP || stamps.length >= MAX_FRAMES) { res.end("skip"); return; }
    const jpeg = Buffer.from(b64, "base64");
    if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new HttpError(400, "frame is not a JPEG");
    lastTs = ts;
    writeFileSync(join(dir, `f${String(stamps.length).padStart(5, "0")}.jpg`), jpeg);
    stamps.push(ts);
  } else if (url.pathname === "/blur") {
    const box = blurBox(await readBody(req, MAX_SMALL_BODY));
    if (!dir) throw new HttpError(409, "no active take");
    appendFileSync(join(dir, "blur.jsonl"), JSON.stringify(box) + "\n");
  } else if (url.pathname === "/stop") {
    await readBody(req, MAX_SMALL_BODY);
    if (!dir) throw new HttpError(409, "no active take");
    writeFileSync(join(dir, "ts.txt"), stamps.join("\n") + "\n");
    // screencast only emits on change; the encoder holds the last frame until this time
    writeFileSync(join(dir, "end.txt"), String(Date.now() / 1000));
    res.end(JSON.stringify({ frames: stamps.length, dir }));
    dir = null;
    return;
  } else {
    throw new HttpError(404, "not found");
  }
  res.end("ok");
}

const server = createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
    checkRequest(req);
    await handle(req, res, url);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    console.error(`[frame-receiver] ${req.method} ${url?.pathname ?? "?"}: ${error.message}`);
    if (!res.headersSent) {
      res.statusCode = status;
      if (status === 413) res.setHeader("connection", "close");
    }
    res.end(error.message);
  }
});
server.listen(port, "127.0.0.1", () => {
  writeTokenFile();
  console.log(`frame-receiver on 127.0.0.1:${port}, frames in ${root}, token in ${TOKEN_FILE}`);
});
