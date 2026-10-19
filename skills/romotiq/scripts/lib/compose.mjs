/* COMPOSE · effects.json → comp/index.html, the HyperFrames page: the take, the person's cut-out, and the effects in
   the depth sandwich (behind them · them · in front · the screen layer), in the reel's own brand.
   Assembly follows the reel-effects skill's (each effect a three-part snippet: style · markup · IIFE ending `})();`).
     punchSteps(cuts, words, …)   the punch-ins: alternate scales at the cuts, and a punch on a sentence start where 10 s
                                  pass without one
     initEffects(dir)             a starting effects.json: punch-ins and captions; Claude adds the beats' effects
     assemble(dir)                comp/index.html (and comp/assets/ for the fonts)
   effects.json { duration?, effects: [{ use, params }] }. "@words.json" (or any "@<file>.json") is read from the reel.
   An effect is looked for first in the reel's own effects/ folder (one built for this reel), then in installed add-on
   packs (packDirs), then the library. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson, frame, W, H } from "./tools.mjs";
import { loadBrand, writeAssets, themeCss } from "./brand.mjs";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const LIBRARY = path.join(SKILL, "effects");

export function punchSteps(cuts, words, total, { punch = 1.15, every = 10 } = {}) {
  const points = [...cuts];
  /* a sentence start: a word after a pause of a quarter-second or more, or after . ? ! */
  const starts = words.filter((w, i) => i > 0 && (w.start - words[i - 1].end >= 0.25 || /[.?!,]$/.test(words[i - 1].text))).map(w => frame(Math.max(0, w.start - 0.05)));
  const edges = [0, ...points.sort((a, b) => a - b), total];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    if (b - a <= every) continue;
    const mid = (a + b) / 2, near = starts.filter(t => t > a + 2 && t < b - 2).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0];
    if (near !== undefined) points.push(near);
  }
  points.sort((a, b) => a - b);
  let s = 1;
  /* a hair before the cut's frame, so float rounding can never land the punch a frame late */
  return points.map(t => { s = s === 1 ? punch : 1; return [Math.floor(t * 1e4) / 1e4, s]; });
}

export function initEffects(dir, { force = false } = {}) {
  const file = path.join(dir, "effects.json");
  if (fs.existsSync(file) && !force) throw new Error("effects.json is already there: edit it, or pass --force to start it again");
  const { cuts, duration: total } = readJson(path.join(dir, "cuts.json")), words = readJson(path.join(dir, "words.json"));
  const sub = readJson(path.join(dir, "subject.json"), null);
  /* a close take (the shoulders fill the width, or the person most of the height) gets a smaller punch, and captions
     below the chin but wholly above y 1440, where Instagram's interface starts */
  const close = sub ? sub.x1 - sub.x0 >= W * 0.85 || sub.y1 - sub.y0 > H * 0.7 : false;
  const origin = sub ? `${Math.round(sub.head_cx / W * 100)}% ${Math.round((sub.head_top + (sub.y1 - sub.y0) * 0.22) / H * 100)}%` : "50% 40%";
  const effects = [
    { use: "00-punch-ins", params: { STEPS: punchSteps(cuts, words, total, { punch: close ? 1.12 : 1.2 }), ORIGIN: origin } },
    { use: "00-captions", params: { WORDS: "@words.json", ACCENT: [], Y: close ? 1400 : 1200, HIDE: [], BREAKS: cuts.map(c => Math.floor(c * 1e4) / 1e4) } },
  ];
  writeJson(file, { duration: total, effects });
  return { effects: effects.length, punches: effects[0].params.STEPS.length, close };
}

export async function assemble(dir, { packDirs = [] } = {}) {
  const spec = readJson(path.join(dir, "effects.json")), comp = path.join(dir, "comp");
  const total = spec.duration || readJson(path.join(dir, "cuts.json")).duration;
  const brand = await loadBrand(dir);
  const inline = v => typeof v === "string" && /^@[\w./-]+\.json$/.test(v) ? readJson(path.join(dir, v.slice(1)))
    : Array.isArray(v) ? v.map(inline) : v;
  /* the brand's handle and initials reach the CTA unless the reel says otherwise */
  const defaults = { "x4-comment-cta": { NAME: brand.handle || undefined, INITIALS: brand.initials || undefined } };

  let html = fs.readFileSync(path.join(SKILL, "templates", "sandwich.html"), "utf8");
  const css = [], behind = [], front = [], hud = [], js = [], seen = new Set();
  for (const fx of spec.effects) {
    if (fx.skip) continue;
    if (seen.has(fx.use)) throw new Error(`${fx.use} is used twice: its ids would collide (one use per effect per reel)`);
    seen.add(fx.use);
    const where = [path.join(dir, "effects"), ...packDirs, LIBRARY];
    const file = where.map(d => path.join(d, `${fx.use}.html`)).find(f => fs.existsSync(f));
    if (!file) throw new Error(`there's no effect called ${fx.use} (looked in the reel's effects/, ${packDirs.length} installed pack${packDirs.length === 1 ? "" : "s"} and the library)`);
    /* the header comment first: it may mention "<style>" in its prose */
    const src = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const style = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const script = src.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const markup = src.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").trim();
    css.push(`/* ${fx.use} */\n${style.trim()}`);
    if (markup) (/class="[^"]*\bfront\b/.test(markup) ? front : /class="[^"]*\bhud\b/.test(markup) ? hud : behind).push(`<!-- ${fx.use} -->\n${markup}`);
    if (script.trim()) {
      const params = Object.fromEntries(Object.entries({ ...(defaults[fx.use] || {}), ...(fx.params || {}) }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, inline(v)]));
      const call = script.trim().replace(/\}\)\(\);\s*$/, `})(${JSON.stringify(params)});`);
      if (call === script.trim()) throw new Error(`${fx.use}: its script must end with an IIFE "})();"`);
      js.push(`// ${fx.use}\n${call}`);
    }
  }
  const indent = (s, n) => s.split("\n").map(l => " ".repeat(n) + l).join("\n");
  html = html
    .replace("/* ── fonts: brand.json, written by assemble ── */", indent(writeAssets(comp, brand), 6).trimStart())
    .replace("/* ── theme: brand.json, written by assemble ── */", indent(themeCss(brand), 6).trimStart())
    .replace("/* ── effect styles go here ── */", indent(css.join("\n\n"), 6).trimStart())
    .replace("<!-- ── behind-layer effect markup goes here (class=\"behind\") ── -->", indent(behind.join("\n"), 10).trimStart())
    .replace("<!-- ── front-layer effect markup goes here (class=\"front\") ── -->", indent(front.join("\n"), 10).trimStart())
    .replace("<!-- ── screen-space UI (class=\"hud\"): captions, label pills, CTA ── -->", indent(hud.join("\n"), 6).trimStart())
    .replace("// ── effect timelines go here. Start each on a word from words.json. ──", indent(js.join("\n\n"), 6).trimStart())
    .replaceAll("__DUR__", String(total));
  fs.writeFileSync(path.join(comp, "index.html"), html);
  return { file: path.join(comp, "index.html"), effects: seen.size, brand: brand.name, duration: total };
}
