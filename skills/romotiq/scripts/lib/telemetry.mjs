/* TELEMETRY · an anonymous usage ping, so Daniel can see how many people get from installing Romotiq to a finished
   reel, and which step stops them (19 Oct 2026).
   What goes: the event (first_run, reel_started, reel_rendered, reel_checked, step_failed), the plugin version, the
   OS, the CPU, the Node version, and numbers: how long a render took, how long the reel is, how many problems the
   check found. A failure says which step failed, never its message. A random id in ~/.romotiq/id ties one
   computer's events together.
   What never goes: names, emails, file names or paths, words, clips, reels, brand kits.
   Off: ROMOTIQ_TELEMETRY=0, DO_NOT_TRACK=1, or `romotiq telemetry off`. It never slows or breaks a command: one try,
   1.5 s at most, every error ignored.
     telemetry({home, version, fetcher}) → { send(event, props), status(), set(on) } */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const KEY = "phc_da1r8FmgU0mnVEcxWT50T7VR3TntddHrOcXiGdft3Z4";   // PostHog's public client key (Routiq's project)
const URL_ = "https://us.i.posthog.com/i/v0/e/";
const EVENTS = new Set(["first_run", "reel_started", "reel_rendered", "reel_checked", "step_failed"]);

export function telemetry({ home, version = "0.0.0", fetcher = globalThis.fetch, env = process.env } = {}) {
  const idFile = path.join(home, "id"), configFile = path.join(home, "config.json");
  const config = () => { try { return JSON.parse(fs.readFileSync(configFile, "utf8")); } catch { return {}; } };
  const off = () => env.ROMOTIQ_TELEMETRY === "0" || env.DO_NOT_TRACK === "1" || config().telemetry === false;

  /* the computer's random id, made on first use; first says whether this run made it */
  function id() {
    try { return { id: fs.readFileSync(idFile, "utf8").trim(), first: false }; } catch {}
    const made = crypto.randomUUID();
    try { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(idFile, made + "\n"); } catch {}
    return { id: made, first: true };
  }

  /* only plain numbers, booleans and short known words go: anything else is dropped */
  const clean = props => Object.fromEntries(Object.entries(props).filter(([, v]) =>
    typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean" ? true : typeof v === "string" && /^[a-z0-9._-]{1,40}$/i.test(v)));

  async function send(event, props = {}) {
    if (off() || !EVENTS.has(event) || typeof fetcher !== "function") return false;
    try {
      const { id: distinct_id } = id();
      const body = { api_key: KEY, event: `romotiq_${event}`, distinct_id, timestamp: new Date().toISOString(),
        properties: { ...clean(props), app_source: "romotiq-plugin", version, os: process.platform, arch: process.arch,
          node: process.versions.node.split(".")[0], $process_person_profile: false } };
      const r = await fetcher(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(1500) });
      return !!r?.ok;
    } catch { return false; }
  }
  const status = () => ({ telemetry: off() ? "off" : "on", sends: "anonymous counts only: version, OS, which step, how long", turnOff: "romotiq telemetry off" });
  function set(on) {
    const c = config();
    try { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(configFile, JSON.stringify({ ...c, telemetry: !!on }, null, 2) + "\n"); } catch {}
    return status();
  }
  /* is this the first run on this computer? (makes the id when it is) */
  const firstRun = () => id().first;
  return { send, status, set, firstRun };
}
