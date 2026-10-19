/* TOOLS · the programs Romotiq runs, found the same way on a Mac, Windows or Linux.
     HOME                     ~/.romotiq (ROMOTIQ_HOME): receipts, brand kits, the compiled cut-out tool, fetched tools
     ffmpegBin(), ffprobeBin() ROMOTIQ_FFMPEG / ROMOTIQ_FFPROBE, then the PATH, then Homebrew, then the copies `doctor`
                              fetched into HOME/tools (ffmpeg-static), so a machine without ffmpeg still works
     toolEnv()                the environment for child processes: those ffmpeg folders first on the PATH, so HyperFrames
                              finds the same ffmpeg
     run(bin, args, opts)     a child process; resolves with its stdout, rejects with the last lines it printed
     hf(args, opts)           HyperFrames, pinned: npx -y hyperframes@0.8.163 …
     npm(args, opts)          npm itself (doctor fetches ffmpeg with it)
     probe(file)              ffprobe's JSON */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

export const HYPERFRAMES = "hyperframes@0.8.163";
export const FPS = 30;
export const W = 1080, H = 1920;
export const WIN = process.platform === "win32";
export const HOME = process.env.ROMOTIQ_HOME || (WIN && process.env.APPDATA ? path.join(process.env.APPDATA, "Romotiq") : path.join(os.homedir(), ".romotiq"));
export const TOOLS = path.join(HOME, "tools");

function which(name) {
  try {
    return execFileSync(WIN ? "where" : "which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/)[0].trim() || null;
  } catch { return null; }
}
/* the copies `doctor` fetched with npm, when there is no ffmpeg on the machine */
function fetched(name) {
  try {
    const req = createRequire(path.join(TOOLS, "package.json"));
    const p = name === "ffmpeg" ? req("ffmpeg-static") : req("ffprobe-static").path;
    return p && fs.existsSync(p) ? p : null;
  } catch { return null; }
}
const homebrew = name => ["/opt/homebrew/bin/" + name, "/usr/local/bin/" + name].find(f => fs.existsSync(f)) || null;
/* an override path (named in full, so it's plain which variables are read), then PATH, Homebrew, or the fetched copy */
const find = (override, name) => override || which(name) || (WIN ? null : homebrew(name)) || fetched(name);

export const ffmpegBin = () => find(process.env.ROMOTIQ_FFMPEG, "ffmpeg") || "ffmpeg";
export const ffprobeBin = () => find(process.env.ROMOTIQ_FFPROBE, "ffprobe") || "ffprobe";

export function toolEnv(extra = {}) {
  const dirs = [ffmpegBin(), ffprobeBin()].filter(p => path.isAbsolute(p)).map(p => path.dirname(p));
  const PATH = [...new Set(dirs), process.env.PATH || ""].join(path.delimiter);
  return { ...process.env, PATH, ...extra };
}

/* line(text) hears each line the tool prints on either stream; input, when given, is piped in (a stream or a Buffer) */
export function run(bin, args, { what = path.basename(bin), cwd, env = toolEnv(), line, input, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const shell = WIN && /\.(cmd|bat)$/i.test(bin);
    const p = spawn(shell ? `"${bin}"` : bin, shell ? args.map(cmdArg) : args, { cwd, env, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"], shell });
    const out = [];
    let err = "", rest = "";
    const hear = d => { if (!line) return; const all = (rest + d).split(/\r?\n|\r/); rest = all.pop(); for (const l of all) line(l); };
    p.stdout.on("data", d => { out.push(d); if (!binary) hear(d); });
    p.stderr.on("data", d => { err = (err + d).slice(-8000); hear(d); });
    p.on("error", e => reject(new Error(`${what}: ${e.message}`)));
    p.on("close", code => {
      const stdout = Buffer.concat(out);
      if (code === 0) resolve(binary ? stdout : stdout.toString());
      else reject(new Error(`${what} failed: ${err.trim().split("\n").filter(Boolean).slice(-3).join(" | ")}`));
    });
    if (input) { if (Buffer.isBuffer(input)) p.stdin.end(input); else input.pipe(p.stdin); }
  });
}

/* what ffmpeg says on stderr, for the filters that report there (silencedetect, volumedetect, ebur128, blackdetect) */
export function ffmpegReport(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"], env: toolEnv() });
    let text = "";
    p.stderr.on("data", d => { text += d; });
    p.on("error", e => reject(new Error(`ffmpeg: ${e.message}`)));
    p.on("close", () => resolve(text));
  });
}

/* cmd.exe re-reads a .cmd file's arguments: a space splits one, and & | < > ^ ( ) mean something. Quoted, they're one
   argument again (a " inside is escaped for the program reading its own command line) */
export const cmdArg = a => (a = String(a), /^[\w.:\\/=@+,-]+$/.test(a) ? a : `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`);
/* npx and npm. On Windows they're .cmd files, which only run through cmd.exe, so they run as Node and npm's own script
   beside it (no shell, nothing re-read); the .cmd, quoted, only when that script isn't there */
function npmTool(name) {
  if (!WIN) return [name];
  const js = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", `${name}-cli.js`);
  return fs.existsSync(js) ? [process.execPath, js] : [`${name}.cmd`];
}
export const npm = (args, opts = {}) => { const [bin, ...pre] = npmTool("npm"); return run(bin, [...pre, ...args], { what: `npm ${args[0]}`, ...opts }); };
export const hf = (args, opts = {}) => { const [bin, ...pre] = npmTool("npx"); return run(bin, [...pre, "-y", HYPERFRAMES, ...args], { what: `hyperframes ${args[0]}`, ...opts }); };

export function probe(file) {
  return JSON.parse(execFileSync(ffprobeBin(), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8", env: toolEnv() }));
}
export const duration = file => Number(probe(file).format.duration);

export const frame = t => Math.round(t * FPS) / FPS;
export const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { if (fallback !== undefined) return fallback; throw new Error(`can't read ${f}: ${e.message}`); } };
export const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.partial-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n"); fs.renameSync(tmp, f); };
/* write out through a partial file, renamed into place when whole */
export async function into(out, make) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const partial = path.join(path.dirname(out), `.${path.basename(out, path.extname(out))}.partial-${process.pid}${path.extname(out)}`);
  try { await make(partial); fs.renameSync(partial, out); } finally { fs.rmSync(partial, { force: true }); }
}
export const clock = t => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, "0")}`; };
