---
name: romotiq
description: Use when someone wants a talking-head reel edited end to end — "edit this reel", "edit these clips", "cut this take", "make my reel look produced", "add captions and effects", "punch-ins", "put words behind my head", or they drop phone clips meant for Instagram Reels, TikTok or Shorts. Picks the best take of each line, cuts dead air, punches in, cuts the person out, adds captions and effects in their own brand, renders, and checks the cuts from the render.
---

# Romotiq

You edit the person's talking-head reel end to end. The scripts do the mechanical work. You make the calls between
them: which take, what each beat shows, where each effect goes. Then you look at the result before anyone else sees
it.

```bash
RQ="<this skill's base directory>/scripts/romotiq.mjs"      # the folder this SKILL.md is in
node "$RQ" doctor            # first time on a machine; `doctor --fix` fetches ffmpeg and Chrome if they're missing
```

Every command prints progress on stderr and one JSON line on stdout. Run long steps (cutout, render) in the
background.

## Before the first reel

1. **`doctor`.** Fix whatever it lists. It needs Node 22+. ffmpeg and Chrome come with `--fix`.
   - **The first time, tell them in one line** that Romotiq sends an anonymous usage ping: counts and timings only,
     never names, paths or clips.
   - `node "$RQ" telemetry off` turns it off, if they'd rather.
2. **Their brand kit** (once, then every reel uses it). Ask for three fonts and five colours, or offer to pull them
   from their website. Write `<home>/brands/<name>/brand.json` with the font files beside it (`home` is in
   `doctor`'s output: `~/.romotiq` on a Mac, `%APPDATA%\Romotiq` on Windows):
   ```json
   { "name": "…", "fonts": { "display700": "Bold.otf", "display900": "Black.otf", "mono": "Mono.woff2" },
     "colors": { "core": "#…", "cloud": "#…", "accent": "#…", "prompt": "#…", "blackberry": "#…" },
     "handle": "their_instagram", "initials": "AB" }
   ```
   - `core` is the dark ground and ink;
   - `cloud` is the light ink;
   - `accent` fills the marker strokes and the link pill;
   - `prompt` is the interactive blue;
   - `blackberry` is the second dark.

   Light ink on the dark ground needs a contrast of 7 or more. If they have no fonts, leave `fonts` out and Inter
   and JetBrains Mono are used.

   **Their look is their brand, never a preset.**

## The edit

Make one folder per reel. Use their reels folder if they have one, else `~/Movies/Romotiq/<date> <title>` on a Mac
or `~/Videos/Romotiq/<date> <title>` on Windows.

| # | Step | Command | Your call |
|---|---|---|---|
| 1 | Ingest | `new <reel> <clip> [<clip>…]` | Clips in the order they were shot |
| 2 | Best take | `takes <reel>` prints the lines, the retakes, the false starts and the stumbles, and drafts `edit.json` | **Read the lines.** Keep the best whole take of each line, usually the last. Edit `edit.json` (`remove: [{start, end, why}]` on the recording's time) when the draft is wrong. Add `"hold": 0.8` when the ending needs time to finish. The sound is levelled to -14 LUFS (`"loudness": null` keeps it as recorded) |
| 3 | Cut | `cut <reel>` → `comp/take.mp4`, `words.json`, `cuts.json` | — |
| 4 | Cut-out | `cutout <reel>` → `comp/fg.webm`, `subject.json` | Apple Vision on a Mac, macOS 12 or newer (about 3× the take's length); elsewhere HyperFrames (~40 s per second, so tell them) |
| 5 | Beat sheet | write `<reel>/beats.md` | **One row per beat. Show it to them and get a go before placing effects** (below) |
| 6 | Effects | `effects <reel> --init`, then edit `effects.json` | Punch-ins and captions are written for you. Add one effect per beat, on a word |
| 7 | Build | `build <reel>` → `comp/index.html` and lint | 0 errors. Two warnings are expected (`duplicate_media_discovery_risk` with doodle boil, and file size) |
| 8 | Look | `snapshot <reel> --at 0.5,3.2,…` → `out/snapshots/contact-sheet.jpg` | **Look at it.** A time in every beat. Fix what's wrong, then build again |
| 9 | Render | `render <reel>` → `out/reel.mp4` | — |
| 10 | Check | `check <reel>` → `out/check/cuts.jpg`, `safe.jpg`, `report.json` | **Look at both sheets and read the problems.** Fix, then render again. Only then show them the reel |

### The beat sheet (step 5)

```
| # | t | SAYS | SHOWS (one change) | MUTE (a silent viewer gets) | FAILS IF | RECEIPT |
```

- **One visual change per beat.** If SHOWS needs an "and", it's two beats. A line said in one breath is one beat.
- **Animate the noun in the sentence.** If deleting the motion leaves the claim standing, you drew decoration.
- **Real receipts only.** Every number, headline or screenshot on screen needs a source they gave you, or one you
  checked, written in RECEIPT. If there's no source, draw no number. Use their words, or no card at all.
- **Text on the stage names things** (`$14B` on a card). Text that describes what you're looking at belongs to the
  captions.
- **Cadence:** a visual change at least every 2 s; the captions supply most of it. Put 3–5 effects on the beats that
  carry a number, a name or a turn.

### Placing effects (step 6)

- **Start the visual 0.1–0.45 s (≈ 0.25 s) before its word.** Entrances run ≤ 0.25 s. Exits are mostly hard cuts.
- **Place from `subject.json`:**
  - orbit CX = `head_cx`;
  - cover-story TOP so the letters straddle `head_top`;
  - zoom ORIGIN on the face;
  - front-layer things stay out of the face box.
- **Look at 2–3 frames of `fg.webm` before putting anything behind the person.** A held mic or phone drops out of
  the cut-out.
- **Times on a cut go a hair early** (9.6333 for a cut at 9.63333…), or the change lands a frame late.
- **Emphasis is weight, never colour:** the payload word goes display-900 at 1.12× (captions `ACCENT`).
- **Ink behind the person matches the wall:** dark on a light wall, light on a dark one.
- **Seek-safe only.** Everything is a pure function of timeline time: GSAP on the paused `tl`, or an `onUpdate`
  that recomputes from the time. No `Math.random`, no clocks, no free-running CSS animation.
- **Close takes** (the shoulders fill the width): `--init` already halves the punch and drops the captions to y 1440.
  - Put cards in the side columns (x 20 and x 836, W 224), using a headline wall rather than an orbit.
  - Put the title and the CTA in the top band (CTA `Y 400, RISE 160`).
  - Cover-story TOP ≈ 420.
- **Captions** sit at 55–75% of the height, never below 1440: below that is Instagram's interface.
- **The comment CTA:** only when the keyword's payload page exists, and they say the keyword out loud. Hide the
  captions under it.

### The effects

| Effect | What it does | Needs the cut-out |
|---|---|---|
| `00-punch-ins` | The scale alternates at the cuts, so a jump cut reads as a camera change (`--init`) | — |
| `00-captions` | Word by word, 1–3 words a chunk, each word blurring in | — |
| `00-title` | A 3–8-word promise on frame 0 | — |
| `00-label-pill` | Names the section or step, top centre | — |
| `00-room-dim` | Darkens the room, not the person | yes |
| `01-orbit` | Cards burst from the hands and ride a ring around them, the far half behind | yes |
| `05-digital-zoom` | Creep, punch on the word, snap back out | — |
| `08-headline-wall` | Receipt cards slam onto the wall behind them | yes |
| `14-doodle-boil` | A wobbling chalk line around them, and doodles drawing themselves | yes |
| `16-cover-story` | A masthead word behind their head | yes |
| `x1-spotlight` | Kills the lights to a pool on the face | — |
| `x4-comment-cta` | A comment bar types the keyword, posts it, and gets the reply with the link | — |

Each effect's parameters are in the comment at the top of `effects/<name>.html`. The measurements and build notes are
in `references/effects.md`. One use per effect per reel. To build a new effect for a reel, write it in
`<reel>/effects/<name>.html` in the same three-part shape (style · markup · script ending `})();`). `build` finds it
there before the library.

## Checking (step 10)

`check` reads the final MP4:
- the frames either side of every cut;
- flash frames;
- speech on both sides of a cut (a clipped word);
- a word straddling a cut;
- black frames;
- the loudness;
- Instagram's interface zones, drawn on `safe.jpg`.

**A problem means fix and render again.** A note means look and decide. In `cuts.jpg`, each row is one cut: two
frames before it, two after.
