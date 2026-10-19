/* TAKES · the best take of each line. People re-say a line until it lands; the last whole take is usually the keeper.
     phrases(words)        the recording's lines: words split at a pause of `gap` s or more, or after . ? !
     findRetakes(lines)    lines said again (most of the same words), false starts (a short line the next one restarts)
                           and stumbles inside a line ("my own my own")
     draftEdit(dir)        edit.json drafted from those and the dead air, with a report for Claude to read and correct.
   Nothing here is final: Claude reads the report, listens where it's unsure, and edits edit.json. */
import path from "node:path";
import fs from "node:fs";
import { readJson, writeJson, duration, clock } from "./tools.mjs";
import { findPauses, normalizeRemove } from "./ingest.mjs";

const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, "").trim();

/* a line ends at a pause: a gap between words of `gap` s or more, a quiet stretch (Whisper's word times run over
   pauses, the sound doesn't), or . ? ! */
export function phrases(words, { gap = 0.45, quiet = [] } = {}) {
  const breaks = new Set();
  for (const q of quiet || []) {
    if (q.end - q.start < 0.18) continue;
    const mid = (q.start + q.end) / 2, i = words.findIndex(w => w.start >= mid - 0.15);
    if (i > 0) breaks.add(i);
  }
  const out = [];
  let cur = null;
  words.forEach((w, i) => {
    if (cur && (breaks.has(i) || w.start - words[i - 1].end >= gap || /[.?!]$/.test(words[i - 1].text))) { out.push(cur); cur = null; }
    if (!cur) cur = { i0: i, i1: i, start: w.start, end: w.end, words: [] };
    cur.i1 = i; cur.end = w.end; cur.words.push(w.text);
  });
  if (cur) out.push(cur);
  return out.map((p, n) => ({ ...p, n: n + 1, text: p.words.join(" "), tokens: p.words.map(norm).filter(Boolean) }));
}

function lcs(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
}
const prefix = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };

export function findRetakes(lines, { look = 4 } = {}) {
  const drop = new Map(), stumbles = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i].tokens;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + look); j++) {
      const b = lines[j].tokens, p = prefix(a, b), same = lcs(a, b) / Math.max(1, Math.min(a.length, b.length));
      /* a false start is a fragment: short, and the next line begins with it */
      if (a.length < b.length && (a.length <= 4 || a.length <= b.length * 0.6) && p >= Math.min(2, a.length) && p >= a.length - 1) {
        drop.set(i, { kind: "false start", line: lines[i].n, keep: lines[j].n, why: `"${lines[i].text}" restarts as line ${lines[j].n}` });
        break;
      }
      if (Math.min(a.length, b.length) >= 3 && same >= 0.6) {
        drop.set(i, { kind: "retake", line: lines[i].n, keep: lines[j].n, why: `said again as line ${lines[j].n} (${Math.round(same * 100)}% the same words)` });
        break;
      }
    }
    /* a stumble inside one line: the same 2–5 words twice in a row */
    for (let n = 5; n >= 2; n--) {
      for (let k = 0; k + 2 * n <= a.length; k++) {
        if (a.slice(k, k + n).join(" ") === a.slice(k + n, k + 2 * n).join(" ")) {
          stumbles.push({ line: lines[i].n, from: lines[i].i0 + k, to: lines[i].i0 + k + n, words: a.slice(k, k + n).join(" ") });
          k += 2 * n;
        }
      }
      if (stumbles.some(s => s.line === lines[i].n)) break;
    }
  }
  return { drop: [...drop.entries()].map(([i, d]) => ({ i, ...d })), stumbles };
}

/* edit.json, drafted. A dropped line is cut from the end of the word before it to the start of the word after it, each
   kept `pad` s clear; a stumble from the start of its first copy to the start of its second. */
export function draftEdit(dir, { pad = 0.15, min = 0.6, force = false } = {}) {
  const file = path.join(dir, "edit.json");
  if (fs.existsSync(file) && !force) throw new Error("edit.json is already there: change it by hand, or pass --force to draft it again");
  const words = readJson(path.join(dir, "words.source.json")), quiet = readJson(path.join(dir, "silences.json"), { quiet: null }).quiet;
  const dur = duration(path.join(dir, "recording.mp4"));
  const lines = phrases(words, { quiet }), found = findRetakes(lines);
  const remove = findPauses(words, { duration: dur, min, pad, quiet }).map(r => ({ ...r }));
  for (const d of found.drop) {
    const L = lines[d.i], before = words[L.i0 - 1], after = words[L.i1 + 1];
    remove.push({ start: before ? before.end + pad : 0, end: after ? after.start - pad : dur, why: `${d.kind}: line ${d.line} (keeping ${d.keep})` });
  }
  for (const s of found.stumbles) {
    const a = words[s.from], b = words[s.to], prev = words[s.from - 1];
    remove.push({ start: Math.max(prev ? prev.end : 0, a.start - 0.04), end: Math.max(words[s.to - 1].end, b.start - 0.04), why: `stumble: "${s.words}" twice in line ${s.line}` });
  }
  remove.sort((a, b) => a.start - b.start);
  const merged = normalizeRemove(remove), out = merged.reduce((n, r) => n + r.end - r.start, 0);
  writeJson(file, { version: 1, remove: remove.map(r => ({ start: +r.start.toFixed(3), end: +r.end.toFixed(3), why: r.why })), hold: 0 });

  const report = ["LINES (recording time)"];
  for (const L of lines) {
    const d = found.drop.find(x => x.i === L.n - 1);
    report.push(` [${String(L.n).padStart(2, "0")}] ${clock(L.start)}–${clock(L.end)}  ${L.text}${d ? `   ← drop: ${d.why}` : ""}`);
  }
  if (found.stumbles.length) { report.push("STUMBLES"); for (const s of found.stumbles) report.push(` line ${s.line}: "${s.words}" twice → the first copy is cut`); }
  const pauses = remove.filter(r => /pause|dead air/.test(r.why));
  report.push(`DEAD AIR: ${pauses.length} cut${pauses.length === 1 ? "" : "s"}, ${pauses.reduce((n, r) => n + r.end - r.start, 0).toFixed(1)} s`);
  report.push(`edit.json: ${merged.length} cuts, ${out.toFixed(1)} s out of ${dur.toFixed(1)} s → ${(dur - out).toFixed(1)} s`);
  return { lines, ...found, remove, report: report.join("\n") };
}
