/* INGEST · a reel from clips, and cutting it. Ported from Romotiq v2 (src/ingest.mjs), with its edit maths unchanged.
     newReel(dir, clips)          recording.mp4 (the clips joined, 1080×1920, 30 fps constant, 48 kHz), its words
                                  (words.source.json, [{text, start, end}]) and its quiet stretches (silences.json)
     findPauses(words, {…})       the dead air worth cutting: at the ends, and gaps of `min` s or more between words, each
                                  kept `pad` s clear of the speech, and only where the sound really is quiet
     normalizeRemove(remove)      cuts sorted, merged where they touch, on frames
     mapTime(t, remove)           a time on the recording → the same moment on the take (unmapTime the other way)
     cutTake(dir)                 edit.json's cuts applied: comp/take.mp4, words.json and cuts.json, all on the take's time
   A reel folder: reel.json · recording.mp4 · words.source.json · silences.json · edit.json · words.json · cuts.json ·
   comp/ (the HyperFrames project: take.mp4, fg.webm, index.html) · out/ (reel.mp4, check/) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ffmpegBin, ffmpegReport, hf, run, probe, duration, into, readJson, writeJson, frame, FPS, W, H } from "./tools.mjs";

const ENCODE = ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart"];

export async function joinClips(clips, out, { log = () => {} } = {}) {
  if (!clips.length) throw new Error("a reel needs at least one clip");
  const inputs = [], parts = [];
  clips.forEach((file, i) => {
    if (!fs.existsSync(file)) throw new Error(`there is no clip at ${file}`);
    const info = probe(file), seconds = Number(info.format.duration);
    if (!info.streams.some(s => s.codec_type === "video")) throw new Error(`${path.basename(file)} has no picture`);
    inputs.push("-i", file);
    const audio = info.streams.some(s => s.codec_type === "audio")
      ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${seconds.toFixed(3)}[a${i}]`;
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${i}];${audio}`);
  });
  const graph = parts.join(";") + ";" + clips.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${clips.length}:v=1:a=1[v][a]`;
  log(`joining ${clips.length} clip${clips.length === 1 ? "" : "s"}`);
  await into(out, partial => run(ffmpegBin(), ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", ...ENCODE, partial], { what: "joining the clips" }));
}

/* the words HyperFrames' local Whisper hears (Parakeet when installed), each with its start and end */
export async function transcribe(file, { log = () => {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "romotiq-words-"));
  try {
    log("hearing the words (local Whisper; the first run downloads the model)");
    await hf(["transcribe", path.resolve(file), "--dir", tmp, "--json"]);
    const found = ["transcript.json", "words.json"].map(f => path.join(tmp, f)).find(f => fs.existsSync(f))
      || fs.readdirSync(tmp).filter(f => f.endsWith(".json")).map(f => path.join(tmp, f))[0];
    if (!found) throw new Error("the transcription wrote no words");
    let words = readJson(found);
    if (!Array.isArray(words)) words = words.words || words.transcript || [];
    const end = duration(file);
    /* no word outlasts the recording; bracketed noises aren't words */
    return words.map(w => ({ text: String(w.text ?? w.word ?? w.w ?? "").trim(), start: Math.min(+w.start, end), end: Math.min(+w.end, end) }))
      .filter(w => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && !/^\[.*\]$|^\(.*\)$/.test(w.text));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/* the stretches where the sound is quiet: ffmpeg's silencedetect, relative to how loud this recording's speech is */
export async function silences(file, { floor } = {}) {
  if (floor === undefined) {
    const vd = await ffmpegReport(["-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
    const mean = Number((/mean_volume:\s*(-?[\d.]+) dB/.exec(vd) || [])[1]);
    /* quiet = 18 dB under the recording's average, never above -30 dB */
    floor = Number.isFinite(mean) ? Math.min(-30, Math.round(mean - 18)) : -38;
  }
  const err = await ffmpegReport(["-i", file, "-af", `silencedetect=noise=${floor}dB:d=0.18`, "-vn", "-f", "null", "-"]);
  const out = [];
  let start = null;
  for (const l of err.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(l), e = /silence_end:\s*([\d.]+)/.exec(l);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start !== null) { out.push({ start, end: Number(e[1]) }); start = null; }
  }
  if (start !== null) out.push({ start, end: duration(file) });
  return { floor, quiet: out };
}

/* the dead air worth cutting. The sound leads: Whisper stretches words over the pauses after them, so word gaps miss
   most pauses in a quick take. With `quiet` (from silences()), every quiet stretch of `minQuiet` s or more is cut down
   to `keep` s either side; quiet at the very start or end goes, less `keep`. Word gaps of `min` s or more (a pause with
   breath or room noise in it, too loud to count as quiet) are cut too, `pad` s clear of the speech, as Romotiq v2 did.
   Edges are on frames, rounded into the pause. */
export function findPauses(words, { duration: dur, min = 0.6, pad = 0.15, quiet = null, minQuiet = 0.3, keep = 0.1 } = {}) {
  const up = t => Math.ceil(t * FPS - 1e-6) / FPS, down = t => Math.floor(t * FPS + 1e-6) / FPS;
  const end = Number.isFinite(dur) ? dur : Infinity, out = [];
  const add = (a, b, why) => {
    const s = a <= 0 ? 0 : up(a), e = b >= end - 1e-3 ? end : down(b);
    if (e - s > 1.5 / FPS) out.push({ start: s, end: e, why });
  };
  if (!words.length) return dur > 0 ? [{ start: 0, end: frame(dur), why: "no speech" }] : [];
  for (const q of quiet || []) {
    const len = q.end - q.start;
    if (q.start <= 0.05) add(0, Math.min(q.end, words[0].start) - keep, "dead air at the start");
    else if (q.end >= end - 0.05) add(Math.max(q.start, words.at(-1).start) + keep, end, "dead air at the end");
    else if (len >= minQuiet) add(q.start + keep, q.end - keep, `pause ${len.toFixed(2)} s`);
  }
  if (!quiet && words[0].start > pad * 2) add(0, words[0].start - pad, "dead air at the start");
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= min) add(words[i - 1].end + pad, words[i].start - pad, `pause ${gap.toFixed(2)} s`);
  }
  if (!quiet && Number.isFinite(dur) && dur - words.at(-1).end > pad * 2) add(words.at(-1).end + pad, dur, "dead air at the end");
  return out.sort((a, b) => a.start - b.start);
}

export function normalizeRemove(remove) {
  const list = (remove || []).map(r => ({ start: frame(Math.max(0, r.start)), end: frame(r.end) })).filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of list) { const last = out.at(-1); if (last && r.start <= last.end) last.end = Math.max(last.end, r.end); else out.push({ ...r }); }
  return out;
}
export function mapTime(t, remove) {
  let gone = 0;
  for (const r of remove) {
    if (t >= r.end) gone += r.end - r.start;
    else if (t > r.start) return Math.round((r.start - gone) * 1000) / 1000;
    else break;
  }
  return Math.round((t - gone) * 1000) / 1000;
}
export function unmapTime(t, remove) {
  let src = t;
  for (const r of remove) { if (src >= r.start) src += r.end - r.start; else break; }
  return Math.round(src * 1000) / 1000;
}

/* made in a hidden folder and moved into place whole, so a half-made reel never shows */
export async function newReel(dir, clips, { log = () => {} } = {}) {
  if (fs.existsSync(path.join(dir, "reel.json"))) throw new Error(`there is already a reel in ${dir}`);
  const tmp = path.join(path.dirname(path.resolve(dir)), `.making-${path.basename(dir)}-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await joinClips(clips, path.join(tmp, "recording.mp4"), { log });
    const words = await transcribe(path.join(tmp, "recording.mp4"), { log });
    writeJson(path.join(tmp, "words.source.json"), words);
    log("finding the quiet stretches");
    writeJson(path.join(tmp, "silences.json"), await silences(path.join(tmp, "recording.mp4")));
    writeJson(path.join(tmp, "reel.json"), { version: 1, recording: "recording.mp4", clips: clips.map(c => path.resolve(c)), created: new Date().toISOString() });
    fs.mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
    if (fs.existsSync(dir)) { for (const f of fs.readdirSync(tmp)) fs.renameSync(path.join(tmp, f), path.join(dir, f)); fs.rmSync(tmp, { recursive: true, force: true }); }
    else fs.renameSync(tmp, dir);
    return { dir: path.resolve(dir), words: words.length, seconds: duration(path.join(dir, "recording.mp4")) };
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
}

/* edit.json's cuts applied. Each kept piece fades its sound over 8 ms at both ends, so a join never clicks.
   edit.json { version, remove: [{start, end, why}], hold, loudness } on the recording's time; hold (s) freezes the last
   frame so an ending (the comment CTA) can finish; loudness (LUFS, default -14, null for as recorded) levels the sound. */
export async function cutTake(dir, { log = () => {} } = {}) {
  const recording = path.join(dir, "recording.mp4"), edit = readJson(path.join(dir, "edit.json"));
  const remove = normalizeRemove(edit.remove), hold = Math.max(0, Number(edit.hold) || 0);
  /* the sound levelled to `loudness` LUFS (Instagram plays reels at about -14): one gain for the whole take, measured on
     the recording, with a limiter at -1.5 dBFS so the gain can't clip; null leaves the sound as recorded */
  const target = edit.loudness === null ? null : Number.isFinite(+edit.loudness) && edit.loudness !== undefined ? +edit.loudness : -14;
  let gain = 0;
  if (target !== null) {
    const r = await ffmpegReport(["-i", recording, "-vn", "-af", "ebur128", "-f", "null", "-"]);
    const I = Number((/I:\s+(-?[\d.]+) LUFS/.exec(r.slice(r.lastIndexOf("Summary"))) || [])[1]);
    if (Number.isFinite(I) && I > -70) gain = Math.max(-12, Math.min(12, Math.round((target - I) * 10) / 10));
  }
  const take = path.join(dir, "comp", "take.mp4"), keyFile = path.join(dir, ".cache", "take.key");
  const st = fs.statSync(recording), key = crypto.createHash("sha256").update(JSON.stringify([st.size, st.mtimeMs, remove, hold, gain])).digest("hex");
  const total = duration(recording);
  const keep = [];
  let at = 0;
  for (const r of remove) { if (r.start > at) keep.push([at, r.start]); at = Math.max(at, r.end); }
  if (total - at > 1 / FPS) keep.push([at, total]);
  if (!keep.length) throw new Error("that would cut the whole recording");
  if (!(fs.existsSync(take) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, "utf8") === key)) {
    log(`cutting ${remove.length} piece${remove.length === 1 ? "" : "s"} out (${keep.length} kept)`);
    const F = 0.008;
    const graph = keep.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(4)}:end=${b.toFixed(4)},setpts=PTS-STARTPTS[v${i}];` +
      `[0:a]atrim=start=${a.toFixed(4)}:end=${b.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=${F},afade=t=out:st=${Math.max(0, b - a - F).toFixed(4)}:d=${F}[a${i}]`).join(";") +
      ";" + keep.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${keep.length}:v=1:a=1[vc][ac]` +
      `;[ac]volume=${gain}dB,alimiter=limit=0.84:level=0:latency=1[al]` +
      (hold > 0 ? `;[vc]tpad=stop_mode=clone:stop_duration=${hold}[v];[al]apad=pad_dur=${hold}[a]` : ";[vc]null[v];[al]anull[a]");
    await into(take, partial => run(ffmpegBin(), ["-v", "error", "-y", "-i", recording, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-r", String(FPS), ...ENCODE, partial], { what: "cutting the take" }));
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    fs.writeFileSync(keyFile, key);
  }
  /* the take's words: the recording's, less those inside a cut, moved up by what was cut before them */
  const inCut = w => remove.some(r => w.start >= r.start - 1e-6 && w.end <= r.end + 1e-6);
  const takeEnd = duration(take), fit = t => Math.min(t, takeEnd);
  const words = readJson(path.join(dir, "words.source.json")).filter(w => !inCut(w))
    .map(w => ({ text: w.text, start: fit(mapTime(w.start, remove)), end: fit(Math.max(mapTime(w.start, remove), mapTime(w.end, remove))) }));
  writeJson(path.join(dir, "words.json"), words);
  /* the joins, on the take's time: where a piece was cut out */
  const cuts = [];
  let t = 0;
  for (let i = 0; i < keep.length - 1; i++) { t += keep[i][1] - keep[i][0]; cuts.push(frame(t)); }
  writeJson(path.join(dir, "cuts.json"), { cuts, duration: takeEnd, hold });
  return { take, seconds: takeEnd, cuts: cuts.length, words: words.length, removed: frame(total - (takeEnd - hold)), gain };
}
