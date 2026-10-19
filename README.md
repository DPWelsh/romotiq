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

## Under the hood

`node skills/romotiq/scripts/romotiq.mjs` lists the steps Claude runs. Rendering is [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), pinned at 0.8.163.
