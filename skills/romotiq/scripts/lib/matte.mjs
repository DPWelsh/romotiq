/* THE CUT-OUT · the person, alone, on a transparent video (comp/fg.webm, VP9 with alpha), so graphics can sit behind them.
     On a Mac (macOS 12 or newer): Apple Vision's person segmentation, in real time. The plugin ships native/matte built
     (universal, signed and notarised); without it, native/matte.swift is compiled once into ~/.romotiq/bin.
     Elsewhere, or with --engine hyperframes: HyperFrames' remove-background (a local model, ~40 s of CPU per second).
     cutOut(dir, {engine, quality})   comp/take.mp4 → comp/fg.webm
     subject(dir)                     where the person is on a middle frame → subject.json {x0, x1, y0, y1, head_cx, head_top} */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ffmpegBin, hf, run, into, toolEnv, duration, writeJson, HOME, W, H, FPS } from "./tools.mjs";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.join(SKILL, "native", "matte.swift");
/* VP9 with alpha, a keyframe a second (the renderer seeks, and long GOPs decode transparent when seeked). Realtime mode:
   5× faster than "good" at the same alpha (PSNR 56.9 vs 58.5 dB, measured 16 Oct), so the cut-out keeps up with Vision */
const VP9 = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "22", "-g", String(FPS), "-row-mt", "1", "-tile-columns", "2", "-threads", "8", "-deadline", "realtime", "-cpu-used", "8", "-auto-alt-ref", "0", "-an"];

/* the Vision tool: ROMOTIQ_MATTE, a prebuilt copy beside the skill (native/matte), or compiled from its source */
export function visionBin() {
  /* Vision's person segmentation is macOS 12 (Darwin 21) on */
  if (process.platform !== "darwin" || Number(os.release().split(".")[0]) < 21) return null;
  if (process.env.ROMOTIQ_MATTE) return process.env.ROMOTIQ_MATTE;
  const shipped = path.join(SKILL, "native", "matte");
  if (fs.existsSync(shipped)) {
    /* a copy that lost its execute bit on the way (an unzip, a copy) gets it back */
    try { fs.accessSync(shipped, fs.constants.X_OK); } catch { try { fs.chmodSync(shipped, 0o755); } catch {} }
    return shipped;
  }
  const src = fs.readFileSync(SOURCE), built = path.join(HOME, "bin", `matte-${crypto.createHash("sha256").update(src).digest("hex").slice(0, 12)}`);
  if (fs.existsSync(built)) return built;
  /* no Swift compiler (Apple's free Command Line Tools), or a build that fails: HyperFrames' cut-out instead */
  try {
    execFileSync("swiftc", ["--version"], { stdio: "ignore" });
    fs.mkdirSync(path.dirname(built), { recursive: true });
    execFileSync("swiftc", ["-O", SOURCE, "-o", built + ".partial"], { stdio: "pipe" });
    fs.renameSync(built + ".partial", built);
    return built;
  } catch { fs.rmSync(built + ".partial", { force: true }); return null; }
}

async function vision(bin, take, out, { quality = "accurate", log }) {
  const frames = Math.round(duration(take) * FPS);
  await into(out, partial => new Promise((resolve, reject) => {
    const matte = spawn(bin, [take, quality], { stdio: ["ignore", "pipe", "pipe"] });
    /* the masks arrive as raw grey frames on stdin; the picture comes from the take; alphamerge joins them. Vision's edge
       is soft and carries a rim of wall with it, which shows as a light line once the room behind is dimmed: the mask
       is eroded a pixel and its ramp steepened so the edge sits on the person */
    const ff = spawn(ffmpegBin(), ["-v", "error", "-y", "-i", take, "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0",
      "-filter_complex", "[0:v]format=yuva420p[p];[1:v]format=gray,erosion,lut=c0='clip((val-64)*1.34,0,255)'[m];[p][m]alphamerge,format=yuva420p[v]", "-map", "[v]", ...VP9, partial],
      { stdio: ["pipe", "ignore", "pipe"], env: toolEnv() });
    let err = "", last = 0;
    matte.stderr.on("data", d => {
      err = (err + d).slice(-4000);
      const m = /MATTE (\d+)/g, s = String(d);
      let x; while ((x = m.exec(s))) { const n = +x[1]; if (n - last >= 150) { last = n; log(`cut-out ${Math.round(n / frames * 100)}%`); } }
    });
    ff.stderr.on("data", d => { err = (err + d).slice(-4000); });
    matte.stdout.pipe(ff.stdin);
    let left = 2, failed = null;
    const done = (who, code) => {
      if (code !== 0 && !failed) failed = new Error(`the cut-out (${who}) failed: ${err.trim().split("\n").slice(-2).join(" | ")}`);
      if (--left === 0) failed ? reject(failed) : resolve();
    };
    matte.on("close", code => done("Vision", code));
    ff.on("close", code => done("ffmpeg", code));
    matte.on("error", reject); ff.on("error", reject);
  }));
}

export async function cutOut(dir, { engine = "auto", quality, log = () => {} } = {}) {
  const take = path.join(dir, "comp", "take.mp4"), out = path.join(dir, "comp", "fg.webm");
  if (!fs.existsSync(take)) throw new Error("there's no comp/take.mp4 yet: run `cut` first");
  const bin = engine === "hyperframes" ? null : visionBin();
  if (engine === "vision" && !bin) throw new Error("Apple Vision's cut-out needs a Mac on macOS 12 or newer");
  const t0 = Date.now();
  if (bin) {
    log("cutting the person out with Apple Vision");
    await vision(bin, take, out, { quality: quality || "accurate", log });
  } else {
    log("cutting the person out with HyperFrames (CPU: about 40 s per second of video; the first run downloads the model)");
    await hf(["remove-background", take, "-o", out, "--device", "cpu", "--quality", quality || "best"], { cwd: path.join(dir, "comp") });
  }
  return { file: out, engine: bin ? "vision" : "hyperframes", seconds: Math.round((Date.now() - t0) / 1000) };
}

/* the person's box on the middle frame, from the cut-out's alpha, at a tenth of the size */
export async function subject(dir) {
  const fg = path.join(dir, "comp", "fg.webm"), mid = (duration(fg) / 2).toFixed(2);
  const w = W / 10, h = H / 10;
  const raw = await run(ffmpegBin(), ["-v", "error", "-c:v", "libvpx-vp9", "-ss", mid, "-i", fg, "-frames:v", "1", "-vf", `alphaextract,scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { what: "reading the cut-out", binary: true });
  const pts = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] > 128) pts.push([i % w, Math.floor(i / w)]);
  if (!pts.length) throw new Error("the cut-out found no person on the middle frame");
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const box = { x0: Math.min(...xs) * 10, x1: (Math.max(...xs) + 1) * 10, y0: Math.min(...ys) * 10, y1: (Math.max(...ys) + 1) * 10 };
  const top = pts.filter(p => p[1] <= box.y0 / 10 + 6).map(p => p[0]);
  const s = { ...box, head_cx: Math.round(top.reduce((a, b) => a + b, 0) / top.length * 10), head_top: box.y0 };
  writeJson(path.join(dir, "subject.json"), s);
  return s;
}
