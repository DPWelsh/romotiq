/* BRAND · the buyer's own look: three fonts and five colours, read by every effect. No preset looks.
     brand.json {
       name,
       fonts:  { display700, display900, mono },        files, any of .woff2 .woff .otf .ttf (paths relative to the kit)
       colors: { core, cloud, accent, prompt, blackberry },   dark ground · light ink · accent (marker strokes, link pill) ·
                                                               interactive blue · second dark
       handle, initials                                   for the comment CTA
     }
   A kit lives in ~/.romotiq/brands/<name>/ (brand.json beside its font files). A reel's brand.json is either a whole
   brand or { "kit": "<name>" }. With neither, the default: Inter and JetBrains Mono (both OFL), fetched once.
     loadBrand(dir)           the reel's brand, resolved, with absolute font paths
     writeAssets(comp, b)     the fonts copied into comp/assets/ and their @font-face rules → the CSS
     themeCss(b)              the five colours as the CSS variables the effects use */
import fs from "node:fs";
import path from "node:path";
import { HOME, readJson } from "./tools.mjs";

export const DEFAULT = {
  name: "Default",
  colors: { core: "#16181d", cloud: "#f2f1ee", accent: "#3b5bdb", prompt: "#7ba2e0", blackberry: "#3a2a2a" },
  fonts: {}, handle: "", initials: "",
};
const FORMAT = { ".woff2": "woff2", ".woff": "woff", ".otf": "opentype", ".ttf": "truetype" };
const SLOTS = [["display700", "display-700", "Display", "700"], ["display900", "display-900", "Display", "900"], ["mono", "mono", "Mono", "400 700"]];
const HEX = /^#[0-9a-f]{6}$/i;

/* Inter 700/900 and JetBrains Mono 700 from Google Fonts, once, into ~/.romotiq/fonts/default */
async function defaultFonts() {
  const dir = path.join(HOME, "fonts", "default"), want = { "display700": "display-700.woff2", "display900": "display-900.woff2", "mono": "mono.woff2" };
  if (Object.values(want).every(f => fs.existsSync(path.join(dir, f)))) return Object.fromEntries(Object.entries(want).map(([k, f]) => [k, path.join(dir, f)]));
  fs.mkdirSync(dir, { recursive: true });
  const ua = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };
  const css = await (await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@700;900&family=JetBrains+Mono:wght@700&display=swap", { headers: ua })).text();
  const map = { "Inter 700": "display-700.woff2", "Inter 900": "display-900.woff2", "JetBrains Mono 700": "mono.woff2" };
  for (const [, sub, block] of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g)) {
    if (sub !== "latin") continue;
    const fam = /font-family: '([^']+)'/.exec(block)[1], weight = /font-weight: (\d+)/.exec(block)[1], src = /url\((https:[^)]+)\)/.exec(block)[1];
    const name = map[`${fam} ${weight}`];
    if (name) fs.writeFileSync(path.join(dir, name), Buffer.from(await (await fetch(src, { headers: ua })).arrayBuffer()));
  }
  return Object.fromEntries(Object.entries(want).map(([k, f]) => [k, path.join(dir, f)]));
}

export async function loadBrand(dir) {
  let b = readJson(path.join(dir, "brand.json"), null), base = dir;
  if (b && b.kit) {
    base = path.join(HOME, "brands", b.kit);
    const kit = readJson(path.join(base, "brand.json"), null);
    if (!kit) throw new Error(`there's no brand kit called ${b.kit} (looked in ${base})`);
    b = { ...kit, ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== "kit")) };
  }
  b = { ...DEFAULT, ...(b || {}), colors: { ...DEFAULT.colors, ...(b?.colors || {}) }, fonts: { ...(b?.fonts || {}) } };
  for (const [k, v] of Object.entries(b.colors)) if (!HEX.test(v)) throw new Error(`brand colour ${k} is ${v}: colours are #rrggbb`);
  const fallback = SLOTS.some(([k]) => !b.fonts[k]) ? await defaultFonts() : {};
  for (const [k] of SLOTS) {
    const f = b.fonts[k] ? path.resolve(base, b.fonts[k]) : fallback[k];
    if (!fs.existsSync(f)) throw new Error(`the brand's ${k} font isn't there: ${f}`);
    if (!FORMAT[path.extname(f).toLowerCase()]) throw new Error(`the brand's ${k} font must be .woff2, .woff, .otf or .ttf`);
    b.fonts[k] = f;
  }
  return b;
}

export function writeAssets(comp, b) {
  fs.mkdirSync(path.join(comp, "assets"), { recursive: true });
  return SLOTS.map(([k, name, family, weight]) => {
    const ext = path.extname(b.fonts[k]).toLowerCase();
    fs.copyFileSync(b.fonts[k], path.join(comp, "assets", name + ext));
    return `@font-face { font-family: "${family}"; src: url("assets/${name}${ext}") format("${FORMAT[ext]}"); font-weight: ${weight}; }`;
  }).join("\n");
}

export const themeCss = b => {
  const c = b.colors;
  return `:root {\n  --core: ${c.core}; --cloud: ${c.cloud}; --accent: ${c.accent}; --indigo: var(--accent); --prompt: ${c.prompt}; --blackberry: ${c.blackberry};\n  --display: "Display", sans-serif; --mono: "Mono", monospace;\n}`;
};

/* how far apart two colours are in brightness (WCAG contrast ratio): light ink on the dark ground should be ≥ 7 */
export function contrast(a, b) {
  const lum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round((hi + 0.05) / (lo + 0.05) * 10) / 10;
}
