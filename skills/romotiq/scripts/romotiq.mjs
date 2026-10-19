#!/usr/bin/env node
/* ROMOTIQ · the steps of editing a talking-head reel, one command each. Claude runs them and makes the calls between.
   Progress goes to stderr; each command's result is one JSON line on stdout.

     doctor [--fix]                           Node, ffmpeg, Chrome and the cut-out; --fix fetches what's missing
     new <reel> <clip>…                       join the clips, hear the words, find the quiet → <reel>/
     takes <reel> [--force] [--min s] [--pad s]   draft edit.json: best take of each line, dead air out; prints the lines
     cut <reel>                               apply edit.json → comp/take.mp4, words.json, cuts.json
     cutout <reel> [--engine vision|hyperframes]   the person on a transparent track → comp/fg.webm, subject.json
     effects <reel> --init [--force]          a starting effects.json: punch-ins at the cuts, captions
     build <reel>                             effects.json + brand → comp/index.html, then HyperFrames' lint
     snapshot <reel> --at 1.2,3.4             frames of the page as it will render → out/snapshots/
     render <reel> [--draft]                  → out/reel.mp4
     check <reel>                             the final render's cuts, flashes, clipped words, safe zone, loudness
     telemetry [on|off]                       the anonymous usage ping (counts only, never names, paths or clips)
     addons [list | activate <key> | install <id|all>]    paid packs, bought once at romotiq.xyz

   Romotiq is free. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ffmpegBin, ffprobeBin, hf, npm, TOOLS, HOME, HYPERFRAMES, duration, readJson } from "./lib/tools.mjs";
import { telemetry } from "./lib/telemetry.mjs";
import { addons } from "./lib/addons.mjs";
import { newReel, cutTake } from "./lib/ingest.mjs";
import { draftEdit } from "./lib/takes.mjs";
import { cutOut, subject, visionBin } from "./lib/matte.mjs";
import { initEffects, assemble } from "./lib/compose.mjs";
import { check } from "./lib/check.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); flags[k] = v ?? (rest[i + 1] && !rest[i + 1].startsWith("--") && ["min", "pad", "engine", "at"].includes(k) ? rest[++i] : true); }
  else args.push(a);
}
const log = m => process.stderr.write(`[romotiq] ${m}\n`);
const done = v => { process.stdout.write(JSON.stringify(v) + "\n"); };
const version = readJson(fileURLToPath(new URL("../../../.claude-plugin/plugin.json", import.meta.url)), {}).version || "0.0.0";
const tel = telemetry({ home: HOME, version });
const packs = addons({ home: HOME, version });
const reelDir = () => { if (!args[0]) throw new Error(`usage: romotiq ${cmd} <reel folder> …`); return path.resolve(args[0]); };

async function doctor() {
  const out = { node: process.versions.node, ok: true, notes: [] };
  if (Number(process.versions.node.split(".")[0]) < 22) { out.ok = false; out.notes.push("Romotiq needs Node 22 or newer: https://nodejs.org (or brew install node / winget install OpenJS.NodeJS)"); }
  const has = bin => { try { execFileSync(bin, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } };
  if (!has(ffmpegBin()) || !has(ffprobeBin())) {
    if (flags.fix) {
      log("fetching ffmpeg (ffmpeg-static) into " + TOOLS);
      fs.mkdirSync(TOOLS, { recursive: true });
      if (!fs.existsSync(path.join(TOOLS, "package.json"))) fs.writeFileSync(path.join(TOOLS, "package.json"), '{ "private": true }\n');
      await npm(["install", "--silent", "--prefix", TOOLS, "ffmpeg-static@5", "ffprobe-static@3"]);
    } else { out.ok = false; out.notes.push("No ffmpeg: run `romotiq doctor --fix` to fetch one."); }
  }
  out.ffmpeg = ffmpegBin();
  out.ffprobe = ffprobeBin();
  try { out.vp9 = /libvpx-vp9/.test(execFileSync(ffmpegBin(), ["-hide_banner", "-encoders"], { encoding: "utf8" })); } catch { out.vp9 = false; }
  if (!out.vp9) { out.ok = false; out.notes.push("This ffmpeg can't write VP9 with alpha (libvpx-vp9), which the cut-out needs."); }
  try { out.chrome = (await hf(["browser", flags.fix ? "ensure" : "path"])).trim().split("\n").pop(); }
  catch { out.chrome = null; out.notes.push("No Chrome for rendering yet: `romotiq doctor --fix` downloads HyperFrames' own."); }
  try { out.cutout = visionBin() ? "Apple Vision (about 3× the take's length)" : "HyperFrames remove-background (CPU, ~40 s per second of video)"; }
  catch (e) { out.cutout = "HyperFrames remove-background"; out.notes.push(`Vision cut-out didn't build: ${e.message.split("\n")[0]}`); }
  out.home = HOME;
  out.telemetry = tel.status().telemetry;
  out.hyperframes = HYPERFRAMES;
  return out;
}

const commands = {
  doctor,
  async addons() {
    if (args[0] === "activate") return packs.activate(args[1]);
    if (args[0] === "install") return packs.install(args[1] || "all");
    return { ...(await packs.list()), installedHere: packs.installed() };
  },
  async telemetry() {
    if (args[0] === "off") return tel.set(false);
    if (args[0] === "on") return tel.set(true);
    return tel.status();
  },
  async new() {
    const dir = reelDir(), clips = args.slice(1).map(c => path.resolve(c));
    if (!clips.length) throw new Error("usage: romotiq new <reel folder> <clip> [<clip> …]");
    return newReel(dir, clips, { log });
  },
  async takes() {
    const r = draftEdit(reelDir(), { force: !!flags.force, ...(flags.min ? { min: +flags.min } : {}), ...(flags.pad ? { pad: +flags.pad } : {}) });
    process.stderr.write(r.report + "\n");
    return { lines: r.lines.length, drop: r.drop.map(d => ({ line: d.line, keep: d.keep, kind: d.kind })), stumbles: r.stumbles.length, cuts: r.remove.length };
  },
  async cut() { return cutTake(reelDir(), { log }); },
  async cutout() {
    const dir = reelDir(), r = await cutOut(dir, { engine: flags.engine || "auto", log });
    return { ...r, subject: await subject(dir) };
  },
  async effects() {
    if (!flags.init) throw new Error("usage: romotiq effects <reel> --init [--force]  (then edit effects.json)");
    return initEffects(reelDir(), { force: !!flags.force });
  },
  async build() {
    const dir = reelDir(), r = await assemble(dir, { packDirs: packs.effectDirs() });
    let lint = "";
    try { lint = await hf(["lint"], { cwd: path.join(dir, "comp") }); } catch (e) { return { ...r, lint: "failed", error: e.message }; }
    const errors = Number((/(\d+)\s+error/.exec(lint) || [])[1] || 0);
    process.stderr.write(lint.split("\n").slice(-12).join("\n") + "\n");
    return { ...r, lint: errors ? `${errors} errors` : "clean" };
  },
  async snapshot() {
    const dir = reelDir(), out = path.join(dir, "out", "snapshots");
    fs.rmSync(out, { recursive: true, force: true });
    await hf(["snapshot", "--at", String(flags.at || "1"), "--no-end", "-o", out], { cwd: path.join(dir, "comp") });
    return { dir: out, files: fs.readdirSync(out).sort() };
  },
  async render() {
    const dir = reelDir();
    const out = path.join(dir, "out", "reel.mp4"), t0 = Date.now();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let last = 0;
    await hf(["render", "-o", out, "--fps", "30", "--quality", flags.draft ? "draft" : "looks"], { cwd: path.join(dir, "comp"),
      line: l => { const m = /(\d{1,3})%/.exec(l); if (m && +m[1] >= last + 10) { last = +m[1]; log(`render ${m[1]}%`); } } });
    return { file: out, seconds: Math.round((Date.now() - t0) / 1000), length: Math.round(duration(out) * 10) / 10 };
  },
  async check() {
    const r = await check(reelDir(), { log });
    process.stderr.write([`problems: ${r.problems.length ? "\n  " + r.problems.join("\n  ") : "none"}`, ...r.notes.map(n => `note: ${n}`)].join("\n") + "\n");
    return { problems: r.problems, notes: r.notes, sheets: r.sheets, loudness: r.loudness, length: r.length };
  },
};

if (!commands[cmd]) {
  process.stderr.write(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\* ?/, "") + "\n");
  process.exit(cmd ? 2 : 0);
}
/* the anonymous ping (lib/telemetry.mjs) rides along: counts and timings only, and it never fails a command */
try {
  if (cmd !== "telemetry" && tel.firstRun()) await tel.send("first_run");
  const result = await commands[cmd]();
  if (cmd === "new") await tel.send("reel_started", { clips: args.length - 1, recording_s: Math.round(result.seconds) });
  if (cmd === "render") await tel.send("reel_rendered", { render_s: result.seconds, reel_s: result.length, draft: !!flags.draft });
  if (cmd === "check") await tel.send("reel_checked", { problems: result.problems.length, lufs: Math.round(result.loudness?.lufs ?? 0) });
  done(result);
}
catch (e) {
  await tel.send("step_failed", { step: cmd });
  log(e.message); done({ error: e.message, ...(e.code ? { code: e.code } : {}) }); process.exit(1);
}
