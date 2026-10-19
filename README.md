# Romotiq for Claude Code

Drop your phone clips into Claude, and Claude edits them into a finished talking-head reel:
- the best take of each line;
- dead air out;
- punch-ins at the cuts;
- you cut out of the background, so words and cards can sit behind you;
- captions and effects in **your** brand (your fonts, your colours);
- and a render Claude checks frame by frame before you see it.

Before anything renders, Claude shows you a beat sheet: what you say, what goes on screen, and where every number or
screenshot comes from. You say go. Romotiq never posts anything for you.

## Install

**In the Claude desktop app (no terminal):**
1. Open **Customize** in the sidebar, then **Plugins**.
2. Select **Add marketplace** and type `DPWelsh/romotiq`.
3. Install **Romotiq**.
4. Open the **Code** tab, drop in your clips and say "edit my reel".

**Already in Claude Code** (the terminal, or the Code tab), paste:

```
/plugin install romotiq --marketplace DPWelsh/romotiq
```

On Claude Code older than 2.1.275, use two lines instead:

```
/plugin marketplace add DPWelsh/romotiq
/plugin install romotiq@romotiq
```

## Needs

- **Claude Code on a paid Claude plan.** Romotiq runs video tools on your computer, so it works in Claude Code. Claude
  chat can't run it, and Cowork isn't tested yet.
- **A Mac on macOS 12 or newer**, or **Windows (beta)**.
- **Node 22 or newer.**
- **Nothing else:** the first time, Claude checks your computer and fetches what's missing (see below).
- **For the fast cut-out on a Mac:** Apple's free Command Line Tools (`xcode-select --install`). Without them,
  Romotiq uses a slower cut-out.

## Price

Romotiq is free. Optional add-on packs are bought once each:
- **Pro effects pack, US$9:** frame break, phone mockup, checklist, before and after, and paper cut.
- **Coming:** a looks pack, a sound pack and cloud rendering.

To buy one, ask Claude ("buy the Pro effects pack"). It opens Stripe's checkout in your browser; you pay there, and
the pack installs by itself. Card details only ever go into Stripe's page, never through Claude or Romotiq. You can
also buy at [romotiq.xyz](https://romotiq.xyz) and paste the key you're given.

## What it runs and connects to

Everything runs on your computer. Romotiq reaches the internet only for these:

| When | What | Where from |
|---|---|---|
| Editing a reel | HyperFrames 0.8.163, which renders the reel ([Apache-2.0](https://github.com/heygen-com/hyperframes)) | npm, pinned to that version |
| First transcription | whisper.cpp and its speech model, for word timings | GitHub and Hugging Face, through HyperFrames |
| First render | Chrome for Testing, which HyperFrames renders in | Google, through HyperFrames |
| Each render | GSAP 3.14.2, the animation library the reel page loads | jsDelivr |
| Only without your own brand kit | The default fonts, Inter and JetBrains Mono | Google Fonts |
| Only if there's no ffmpeg | ffmpeg-static 5 and ffprobe-static 3, into `~/.romotiq/tools` | npm (the ffmpeg files themselves from the packages' GitHub releases) |
| Only for the slower cut-out | HyperFrames' background-removal model | GitHub, through HyperFrames |
| First run, and each reel started, rendered, checked or failed | The anonymous usage ping below | PostHog (`us.i.posthog.com`) |
| Only when you use add-ons | The add-on list, your purchase and the pack download | `romotiq.xyz` and its storage (Supabase), with checkout on Stripe |

The fast cut-out on a Mac is built on your computer from `skills/romotiq/native/matte.swift`, with Apple's own
compiler and Vision framework. Your clips, words and reels never leave your computer.

**On your computer, in `~/.romotiq/`:** a random id for the usage ping, your brand kits, any tools Romotiq fetched,
installed packs, and (once you buy a pack) `addons.json`, readable only by you. That file holds your install token, the
email you paid with, and, while a checkout is open, a one-time secret that links the checkout to this computer.

## Privacy

**The usage ping** lets us see how many people get from installing Romotiq to a finished reel, and which step stops
them.
- **What goes:** the step (first run, reel started, reel rendered, reel checked, step failed), the plugin version,
  your OS, and numbers like how long a render took. A random id ties one computer's pings together.
- **What never goes:** your name, email, file names or paths, your words, your clips, your reels or your brand.
- **Off:** say "turn off Romotiq's telemetry" to Claude, or set `ROMOTIQ_TELEMETRY=0` or `DO_NOT_TRACK=1`.

**Add-ons:** a purchase sends your email to Stripe, and to romotiq.xyz to send your key. Activating sends a hash of
your computer's hardware id (never the id itself), so one purchase works on up to three of your computers.

The full policy, with how long each thing is kept: [romotiq.xyz/privacy](https://romotiq.xyz/privacy).

## Licence

[PolyForm Shield 1.0.0](LICENSE): free to use for anything, your business included. You may not sell Romotiq or use it
to build a product that competes with it. Add-on packs are licensed to the buyer and aren't in this repository.

## Help

Email [daniel@romotion.xyz](mailto:daniel@romotion.xyz). For what Claude runs, `node skills/romotiq/scripts/romotiq.mjs`
lists every step.
