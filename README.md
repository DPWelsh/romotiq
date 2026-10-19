# Romotiq for Claude Code

Claude edits your talking-head reels end to end:
- the best take of each line;
- dead air out;
- punch-ins at the cuts;
- you cut out of the background, so words and cards can sit behind you;
- captions and effects in **your** brand (your fonts, your colours);
- and a render Claude checks frame by frame.

## Install

In Claude Code (the terminal, or the Code tab in the Claude desktop app), paste:

```
/plugin install romotiq --marketplace DPWelsh/romotiq
```

On Claude Code older than 2.1.275, use two lines instead:

```
/plugin marketplace add DPWelsh/romotiq
/plugin install romotiq@romotiq
```

Then say "edit my reel" and drop your clips in.

## Needs

- **Claude Code on a paid Claude plan.** Regular Claude chat and Cowork run plugin code in the cloud, not on your
  computer, so they can't edit video.
- **A Mac on macOS 12 or newer**, or **Windows (beta)**.
- **Node 22 or newer.**
- **Nothing else:** Romotiq fetches ffmpeg and its own Chrome the first time if you don't have them.
- **For the fast cut-out on a Mac:** Apple's free Command Line Tools (`xcode-select --install`). Without them,
  Romotiq uses a slower cut-out.

## Price

Free. Add-ons (looks, sounds, more effects and cloud rendering) are coming as one-off purchases at romotiq.xyz.

## Privacy

Romotiq sends an anonymous usage ping, so we can see how many people get from installing it to a finished reel, and
which step stops them:
- **What goes:** the step (first run, reel started, reel rendered, reel checked, step failed), the plugin version,
  your OS, and numbers like how long a render took. A random id ties one computer's pings together.
- **What never goes:** your name, email, file names or paths, your words, your clips, your reels or your brand.
- **Off:** say "turn off Romotiq's telemetry" to Claude, or set `ROMOTIQ_TELEMETRY=0` or `DO_NOT_TRACK=1`.

## Under the hood

`node skills/romotiq/scripts/romotiq.mjs` lists the steps Claude runs. Rendering is [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), pinned at 0.8.163.
