/* CHECK · the cuts, checked from the final render (out/reel.mp4), not from the plan. Nobody should see a reel Claude
   hasn't looked at, so this writes pictures for Claude to look at, and a report.
     out/check/cuts.jpg      for every cut: the two frames before it and the two after, a row each, in order
     out/check/safe.jpg      three frames with Instagram's interface zones drawn on (captions and the CTA stay out)
     out/check/report.json   the numbers, and what to look at:
       length        the render's length against the take's (± a frame)
       flash frames  a single frame unlike the frames either side of it, where those two are alike
       clipped words speech on both sides of a cut (a word may be cut off), and words that straddle a cut
       black frames  any run of black
       loudness      integrated LUFS (Instagram plays reels at about -14) and the true peak */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegBin, ffmpegReport, run, duration, readJson, writeJson, clock, FPS, W, H } from "./tools.mjs";

const SW = 36, SH = 64;   // the size frames are compared at

async function frames(file) {
  const raw = await run(ffmpegBin(), ["-v", "error", "-i", file, "-vf", `fps=${FPS},scale=${SW}:${SH}:flags=area,format=gray`, "-f", "rawvideo", "-"], { what: "reading the render", binary: true });
  const n = Math.floor(raw.length / (SW * SH));
  return Array.from({ length: n }, (_, i) => raw.subarray(i * SW * SH, (i + 1) * SW * SH));
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

async function audio(file) {
  const raw = await run(ffmpegBin(), ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { what: "reading the sound", binary: true });
  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
}
const dbfs = (pcm, a, b) => {
  const i0 = Math.max(0, Math.floor(a * 16000)), i1 = Math.min(pcm.length, Math.floor(b * 16000));
  let s = 0; for (let i = i0; i < i1; i++) s += pcm[i] * pcm[i];
  return i1 > i0 ? 10 * Math.log10(s / (i1 - i0) + 1e-12) : -120;
};

/* a picture of frames: rows of 4, each frame 216×384 */
async function sheet(file, times, out, { guides = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "romotiq-sheet-"));
  try {
    const box = "drawbox=x=0:y=1440:w=1080:h=480:color=red@0.28:t=fill,drawbox=x=960:y=900:w=120:h=540:color=red@0.28:t=fill,drawbox=x=0:y=0:w=1080:h=220:color=red@0.18:t=fill";
    for (let i = 0; i < times.length; i++) {
      await run(ffmpegBin(), ["-v", "error", "-y", "-ss", Math.max(0, times[i]).toFixed(4), "-i", file, "-frames:v", "1",
        "-vf", (guides ? box + "," : "") + "scale=216:384", path.join(tmp, `f${String(i).padStart(4, "0")}.png`)], { what: "taking a frame" });
    }
    const cols = 4, rows = Math.ceil(times.length / cols);
    await run(ffmpegBin(), ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "f%04d.png"), "-vf", `tile=${cols}x${rows}:padding=6:margin=6:color=white`, "-frames:v", "1", "-q:v", "3", out], { what: "making the sheet" });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export async function check(dir, { log = () => {} } = {}) {
  const file = path.join(dir, "out", "reel.mp4"), outDir = path.join(dir, "out", "check");
  if (!fs.existsSync(file)) throw new Error("there's no out/reel.mp4 yet: render first");
  fs.mkdirSync(outDir, { recursive: true });
  const { cuts, duration: expected } = readJson(path.join(dir, "cuts.json")), words = readJson(path.join(dir, "words.json"));
  const report = { file, at: new Date().toISOString(), problems: [], notes: [] };
  const problem = (what, t) => report.problems.push(t === undefined ? what : `${clock(t)} ${what}`);

  const got = duration(file);
  report.length = { render: +got.toFixed(3), take: expected };
  if (Math.abs(got - expected) > 1.5 / FPS) problem(`the render is ${got.toFixed(2)} s but the take is ${expected.toFixed(2)} s`);

  log("comparing every frame with its neighbours");
  const f = await frames(file), d = f.map((x, i) => i ? diff(f[i - 1], x) : 0);
  const near = (i, list) => list.some(c => Math.abs(i / FPS - c) <= 1.5 / FPS);
  report.flashes = [];
  for (let i = 1; i < f.length - 1; i++) {
    if (d[i] > 14 && d[i + 1] > 14 && diff(f[i - 1], f[i + 1]) < Math.min(d[i], d[i + 1]) / 3) { report.flashes.push(+(i / FPS).toFixed(3)); problem("a flash frame", i / FPS); }
  }
  report.jumps = [];
  for (let i = 1; i < f.length; i++) if (d[i] > 24 && !near(i, cuts)) report.jumps.push(+(i / FPS).toFixed(3));
  if (report.jumps.length) report.notes.push(`big picture changes away from any cut (an effect coming in is normal; look if unsure): ${report.jumps.map(clock).join(", ")}`);

  log("listening at every cut");
  const pcm = await audio(file);
  report.cuts = cuts.map(c => {
    const before = dbfs(pcm, c - 0.05, c - 0.005), after = dbfs(pcm, c + 0.005, c + 0.05);
    const straddle = words.find(w => w.start < c - 0.02 && w.end > c + 0.02);
    const row = { t: c, before: Math.round(before), after: Math.round(after), straddles: straddle ? straddle.text : null };
    /* Whisper's word times run over pauses, so a word "straddling" a cut that is quiet on both sides is its timing,
       not a clipped word: the sound decides */
    const loud = before > -40 || after > -40;
    if (straddle && loud) problem(`the cut lands inside "${straddle.text}" (${row.before} / ${row.after} dBFS)`, c);
    else if (straddle) report.notes.push(`${clock(c)} Whisper times "${straddle.text}" across the cut, but the sound is quiet on both sides (${row.before} / ${row.after} dBFS): fine`);
    else if (before > -32 && after > -32) problem(`speech on both sides of the cut (${row.before} / ${row.after} dBFS): listen for a clipped word`, c);
    return row;
  });

  const black = await ffmpegReport(["-i", file, "-vf", "blackdetect=d=0.05:pix_th=0.08", "-an", "-f", "null", "-"]);
  report.black = [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [+m[1], +m[2]]);
  for (const [a] of report.black) problem("black frames", a);

  const loud = await ffmpegReport(["-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const I = Number((/I:\s+(-?[\d.]+) LUFS/.exec(loud.slice(loud.lastIndexOf("Summary"))) || [])[1]);
  const peak = Number((/Peak:\s+(-?[\d.]+) dBFS/.exec(loud.slice(loud.lastIndexOf("Summary"))) || [])[1]);
  report.loudness = { lufs: I, truePeak: peak };
  if (Number.isFinite(I) && (I < -20 || I > -9)) report.notes.push(`loudness ${I} LUFS: Instagram plays at about -14, so it will sound ${I < -14 ? "quiet" : "loud"} next to other reels`);
  if (Number.isFinite(peak) && peak > -0.5) problem(`the sound peaks at ${peak} dBFS and may distort`);

  log("drawing the cut sheet");
  const at = cuts.flatMap(c => [c - 2 / FPS, c - 1 / FPS, c, c + 1 / FPS]);
  if (at.length) await sheet(file, at, path.join(outDir, "cuts.jpg"));
  await sheet(file, [got * 0.2, got * 0.5, got * 0.85, Math.max(0, got - 0.5)], path.join(outDir, "safe.jpg"), { guides: true });
  report.sheets = { cuts: at.length ? path.join(outDir, "cuts.jpg") : null, safe: path.join(outDir, "safe.jpg"), cutRows: cuts.map(clock) };
  writeJson(path.join(outDir, "report.json"), report);
  return report;
}
