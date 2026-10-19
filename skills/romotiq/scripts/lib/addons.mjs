/* ADD-ONS · packs bought once each at romotiq.xyz (19 Oct 2026). The plugin is free; the free edit never touches this.
   Two ways in, one install token kept in ~/.romotiq/addons.json:
   - `buy` (from inside Claude) puts a one-time secret on the pack's checkout link, opens it in the browser, and asks
     the licence service for it back while they pay. Once paid, the service activates this computer with the
     purchase's own key, and the pack installs. The secret waits in addons.json until then (`wait` picks it up again).
   - `activate` trades the key from the email (or the page after paying) for the same install token.
   From then on, the token lists what this computer owns and fetches a 5-minute download link for each pack. A pack
   unpacks into ~/.romotiq/addons/<id>/: its pack.json, plus effects/ that `build` looks in after the reel's own
   effects and before the library. Card details only ever go into Stripe's page, never through here.
     addons({home, api, version, fetcher, open, sleep, now, log})
       → { list(), buy(id, {wait, open}), wait({minutes}), activate(key), install(id | "all"), installed(), effectDirs() } */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readJson, writeJson, run, WIN } from "./tools.mjs";

export const API = () => process.env.ROMOTIQ_API || "https://romotiq.xyz/api";
const NOT_OPEN = "Add-ons aren't open yet. They're coming to romotiq.xyz: looks packs, a sound pack, pro effects and cloud rendering.";

/* a stable, non-identifying machine id: the hardware id, hashed; the raw value is never stored or sent */
export function fingerprint() {
  let raw = "";
  try {
    if (process.platform === "darwin") raw = (execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]).toString().match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/) || [])[1] || "";
    else if (WIN) raw = (execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]).toString().match(/MachineGuid\s+REG_SZ\s+(\S+)/) || [])[1] || "";
    else raw = fs.readFileSync("/etc/machine-id", "utf8").trim();
  } catch {}
  if (!raw) raw = os.userInfo().username + "@" + os.homedir();
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/* the browser, opened with the system's own command; false when it can't even start */
export function openInBrowser(url) {
  const [bin, argv] = process.platform === "darwin" ? ["open", [url]] : WIN ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try { const p = spawn(bin, argv, { stdio: "ignore", detached: true }); p.on("error", () => {}); p.unref(); return true; }
  catch { return false; }
}

/* a zip, unpacked with the system's own tool: ditto on a Mac, tar (bsdtar) on Windows 10+, unzip elsewhere */
async function unzip(zip, into) {
  fs.mkdirSync(into, { recursive: true });
  if (process.platform === "darwin") await run("ditto", ["-x", "-k", zip, into], { what: "unpacking the pack" });
  else if (WIN) await run("tar", ["-xf", zip, "-C", into], { what: "unpacking the pack" });
  else await run("unzip", ["-q", "-o", zip, "-d", into], { what: "unpacking the pack" });
}

export function addons({ home, api = API(), version = "0.0.0", fetcher = globalThis.fetch, open = openInBrowser,
  sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), log = () => {} } = {}) {
  const receiptFile = path.join(home, "addons.json"), packsDir = path.join(home, "addons");
  const receipt = () => readJson(receiptFile, null);
  const token = () => receipt()?.install || null;
  /* the receipt holds secrets (the install token, a pending checkout's secret): only this user can read it */
  const save = patch => {
    const next = Object.fromEntries(Object.entries({ ...(receipt() || {}), ...patch }).filter(([, v]) => v != null));
    fs.mkdirSync(home, { recursive: true });
    writeJson(receiptFile, next);
    try { fs.chmodSync(receiptFile, 0o600); } catch {}
  };
  /* who is asking: worked out only when needed, since every command makes this object */
  const machine = () => ({ machine: fingerprint(), product: "beat-workbench", version, build: "plugin" });

  async function call(pathname, { method = "GET", body } = {}) {
    let r;
    try {
      r = await fetcher(api + pathname, { method, headers: { "content-type": "application/json", ...(token() ? { "x-romotiq-install": token() } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(20000) });
    } catch { throw new Error("Couldn't reach romotiq.xyz. Check the internet and try again."); }
    if (r.status === 404 && !(r.headers.get("content-type") || "").includes("json")) throw new Error(NOT_OPEN);
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out.error) throw Object.assign(new Error(out.error || NOT_OPEN), { status: r.status, buy: out.buy || null });
    return out;
  }

  function installed() {
    try {
      /* a folder, or a link to one (a pack linked in while it's being made) */
      return fs.readdirSync(packsDir, { withFileTypes: true }).filter(d => d.isDirectory() || (d.isSymbolicLink() && fs.statSync(path.join(packsDir, d.name)).isDirectory()))
        .map(d => readJson(path.join(packsDir, d.name, "pack.json"), null)).filter(Boolean);
    } catch { return []; }
  }
  /* where build looks for pack effects, after the reel's own */
  const effectDirs = () => installed().map(p => path.join(packsDir, p.id, "effects")).filter(d => fs.existsSync(d));

  async function list() {
    const { addons: all = [], owned } = await call("/addons");
    const here = new Map(installed().map(p => [p.id, p.version]));
    return {
      activated: !!token(),
      addons: all.map(a => ({ ...a, owned: owned ? owned.includes(a.id) : null, installed: here.get(a.id) || null })),
      next: !token() ? "Buy one from here: romotiq addons buy <id>. Bought on romotiq.xyz? Paste the key: romotiq addons activate <key>" : null,
    };
  }

  async function activate(code) {
    code = String(code || "").trim();
    if (!code) throw new Error("Paste the key from your purchase: romotiq addons activate <key>");
    const res = await call("/licence/activate", { method: "POST", body: { key: code, ...machine() } });
    if (res.valid !== true || !res.install) throw new Error(res.error || "That code wasn't accepted.");
    save({ install: res.install, activatedAt: new Date().toISOString(), email: res.email || null });
    return { ok: true, message: "Activated on this computer. Next: romotiq addons install all" };
  }

  /* checkout in the browser, with a secret only this computer knows; then wait for it unless told not to */
  async function buy(id, { wait: andWait = true, open: andOpen = true } = {}) {
    const { addons: all = [] } = await call("/addons");
    const a = all.find(x => x.id === id);
    if (!a) throw new Error(`There's no add-on called "${id}". romotiq addons lists them.`);
    if (!a.buy || !a.ready) throw new Error(`The ${a.name} isn't on sale yet.`);
    const claim = crypto.randomBytes(32).toString("base64url");
    const link = new URL(a.buy);
    link.searchParams.set("client_reference_id", claim);
    if (receipt()?.email) link.searchParams.set("prefilled_email", receipt().email);
    save({ pending: { pack: a.id, claim, at: new Date(now()).toISOString() } });
    const opened = andOpen && open(link.href);
    const out = { pack: a.id, price: a.price, opened: !!opened,
      /* the link carries the secret, so it's only shown when the browser couldn't be opened */
      ...(opened ? {} : { checkout: link.href }) };
    if (!andWait) return { ...out, next: "Pay in the browser, then: romotiq addons wait" };
    log(`Checkout for the ${a.name} (${a.price}) is open in the browser. Waiting for the payment…`);
    return { ...out, ...(await wait()) };
  }

  /* ask every 10 s until the purchase lands, then activate and install; a dropped connection just asks again */
  async function wait({ minutes = 8 } = {}) {
    const pending = receipt()?.pending;
    if (!pending?.claim) throw new Error("There's no checkout to wait for. Start one with: romotiq addons buy <id>");
    const until = now() + minutes * 60000;
    let asked = 0;
    for (;;) {
      let res = null;
      try { res = await call("/licence/claim", { method: "POST", body: { claim: pending.claim, ...machine() } }); }
      catch (e) {
        if (!(e.status >= 500 || /Couldn't reach/.test(e.message))) {
          if (/already been used/.test(e.message)) save({ pending: null });
          throw e;
        }
      }
      if (res?.valid === true && res.install) {
        save({ install: res.install, activatedAt: new Date(now()).toISOString(), email: res.email || null, pending: null });
        const pack = res.pack || pending.pack;
        const got = await installOne(pack);
        return { ok: true, bought: pack, installed: [got], message: `Paid, activated on this computer, and the ${pack} pack is installed. Its effects work by name in effects.json.` };
      }
      if (now() >= until) return { waiting: true, pack: pending.pack, next: "Not paid yet. Once it's paid, run: romotiq addons wait" };
      if (++asked % 6 === 0) log("Still waiting for the payment…");
      /* every 10 s: the service allows 100 asks a quarter hour from one network */
      await sleep(10000);
    }
  }

  async function installOne(id) {
    if (!token()) throw new Error("Activate first: romotiq addons activate <key from your purchase>");
    const { url, version: v } = await call("/addons", { method: "POST", body: { pack: id } });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "romotiq-pack-"));
    try {
      const r = await fetcher(url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60000) });
      if (!r.ok) throw new Error("The download didn't finish. Try again.");
      const zip = path.join(tmp, "pack.zip");
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
      const out = path.join(tmp, "unpacked");
      await unzip(zip, out);
      /* a zip may hold the pack at its root or inside one folder */
      const root = fs.existsSync(path.join(out, "pack.json")) ? out
        : fs.readdirSync(out).map(d => path.join(out, d)).find(d => fs.existsSync(path.join(d, "pack.json")));
      if (!root) throw new Error("That pack is damaged: there's no pack.json in it.");
      const meta = readJson(path.join(root, "pack.json"));
      if (meta.id !== id) throw new Error("That download isn't the pack that was asked for.");
      const dest = path.join(packsDir, id);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(packsDir, { recursive: true });
      fs.cpSync(root, dest, { recursive: true });
      writeJson(path.join(dest, "pack.json"), { ...meta, version: meta.version || v, installedAt: new Date().toISOString() });
      return { id, version: meta.version || v };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  async function install(id) {
    if (id !== "all") return { installed: [await installOne(id)] };
    const { addons: all } = await list();
    const mine = all.filter(a => a.owned && a.kind === "download" && a.ready);
    if (!mine.length) return { installed: [], message: "This computer owns no downloadable pack yet." };
    const done = [];
    for (const a of mine) done.push(await installOne(a.id));
    return { installed: done };
  }

  return { list, buy, wait, activate, install, installed, effectDirs };
}
