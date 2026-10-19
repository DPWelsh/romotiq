# Effect cards

One card per effect. **Measured** is what the reference reels show, measured frame by frame.
**Build** is how it goes into our sandwich. ✅ = an effect exists in `effects/` and was rendered;
📝 = recipe only, build it the first time a reel needs it, then save it in `effects/`.

Universal timing law (measured on every effect): **the visual starts 0.1–0.45 s (mean 0.25 s)
BEFORE the word it illustrates.** Entrances are ≤ 0.25 s. Exits are hard cuts more often than fades.

---

## Building blocks (use on every reel)

### 00 · frame-0 title ✅ `effects/00-title.html`
- **Measured:** a title on frame 0 in 10 of 12 reference reels (median 6.5 words, y 15–22%).
- **Build:** display-900, light ink with the caption halo, top band. `TEXT`, `UNTIL`. On from the first frame, with no entrance. Open on a sharp frame of the face, not a motion smear.

### 00 · captions ✅ `effects/00-captions.html`
- **Measured:** 1–3 words a chunk, ≤ 20 chars. Each word blurs in over 3 frames (opacity .4→1, blur 12→0, scale 1.05→1), about 0.1 s before it's said. Chunks hard-swap. On the reference reels: 74 px at y 1170, one yellow payload word every 2–3 chunks.
- **Build:** display-700, payload word in display-900 at 1.12×, light ink with a dark halo. `WORDS: "@transcript.json"`, `ACCENT: [...]`.
- **Lands:** under the chin. On a close take that's y ≈ 1290–1300.

### 00 · label pill ✅ `effects/00-label-pill.html`
- **Measured:** white box, r 15, ≈ 48 px bold, top y ≈ 234. Pops in 4 frames after the cut. No exit; one per section.
- **Build:** light box, display-900 title, mono number in the accent. `ITEMS: [{t, until, num, text}]`.

### 00 · room dim ✅ `effects/00-room-dim.html`
- **Measured:** under headline wall, chart grow, freeze, doodle boil, the wall drops 45–56% (142→71 luma) while the face doesn't move (99→93).
- **Build:** a dark rectangle in `.behind`. Opacity 0.6 gives about −40% wall luma. The cheapest "produced" upgrade there is.

---

## Effects 01–17

### 01 · orbit ✅ `effects/01-orbit.html`
- **Measured:** 6 phone cards, 60° apart, about 175°/s.
  - They burst out of the speaker's hands in 0.25 s.
  - Depth scale runs 0.6–1.0. Back cards: brightness .8, blur 3 px.
  - Back cards pass behind the head and a raised finger.
  - Ring centre is at shoulder height; on the reference reels, ry ≈ 0.078 H.
- **Build:** z-index swaps 1↔3 around `#fg`.
  - On a close take, RY must put the front pass below the chin (330 cleared it; 120 crossed the face).
  - Real reel thumbnails (`ITEMS: [{img}]`) beat number cards.
- **Cheap if:** back cards aren't hidden behind the person, or the ring is flat or slow (≤ 60°/s).

### 02 · couch wall 📝
- **Measured:** about 30 reel thumbnails tile the wall, top-left to bottom-right, in 0.3 s (stagger ≈ 0.025 s, each −40 px→0, cubic-out). Hold, then hard cut.
  - The furniture (post, pillow, couch) stays IN FRONT, via a static mask per shot.
- **Build:** grid of `<img>` in `.behind`, clipped to the wall rectangle, brightness-matched to the wall (≈ 0.85).
  - For foreground furniture, add a one-off PNG mask cut from one frame, at z 2.5 above the grid.
  - Desk/shelf takes: the shelf lip is the horizon to clip at.

### 03 · ui world 📝
- **Measured:** a cream panel wipes down from the top to a real horizon in the room (couch back ≈ 58–67%) in 0.17 s, cubic-out.
  - Inside it, a Claude-style prompt types at ≈ 55 chars/s. Bubbles pop (scale .92→1, 0.1 s); a timeline rises behind the person.
- **Build:** panel in `.behind` with `clip-path: inset(0 0 calc(100% - var(--h)) 0)` tweened.
  - Starting points for the UI parts: registry `claude-exchange`, `typed-prompt`, `chat-thread`, `typing-indicator`.
  - The matte must be clean around hair; check `fg.webm` first.

### 04 · frame break 📝
- **Measured:** the shot shrinks in 5 frames into a 48%-wide 9:16 card, r 26, over a blurred (45 px), darkened (.45) copy of the room.
  - **The footage inside is scaled only 0.75 from the top-centre, so the head sticks out above the card.**
  - Hold 0.64 s, expand back in 4 frames.
- **Build:** add a second plate `<video>` (blurred, darkened) at z −1.
  - Clip `#plate` to the card rect, computed in its local coordinates.
  - Scale `#plate` and `#fg` by the same 0.75 around (50%, −3%); don't clip `#fg`.
  - Optional: IG Reels chrome fades in item by item, 0.07 s apart.

### 05 · digital zoom ✅ `effects/05-digital-zoom.html`
- **Measured:** push 1.0→1.3 over 0.6 s, punch to 1.65 in 3 frames with a 1–2 frame smear, creep to 1.95, snap out in 5 frames with heavy blur.
- **Build:** scales `#cam`. On a close take, roughly halve the numbers (punch ≈ 1.25–1.3).

### 06 · phone mockup 📝
- **Measured:** an iPhone swings in from the top-right (≈ +400, −150 px, −25°) in 0.17 s with motion blur and stands behind the speaker's shoulder (matte in front).
  - A button gets tapped: grey 2 frames → "✓ Done", ring 120→320 px; rows tick 0.03 s apart. Fades in 2 frames.
- **Build:** registry `device-frame-stage` (phone prop) or `vfx-iphone-device` (real 3D) in `.behind`. Screen UI: `gesture-tap`, `success-check`, `marker-checklist-card`.
  - "Held" variant: put it in `.front`, rising from below.

### 07 · checklist 📝
- **Measured:** a dark glass panel (near-black teal ≈ #192225) pops onto the wall beside the head.
  - Each item types in word by word AS IT'S SAID and ticks on the item's last word (±1 frame), with a sunburst. All done → panel lights up. Long version 8.9 s.
- **Build:** panel in `.behind` beside the head, in dark glass with light text. Ticks in the accent.
  - Drive each word's reveal from `transcript.json`; it's the captions engine pointed at a list.
  - Registry starting point: `marker-checklist-card`.

### 08 · headline wall ✅ `effects/08-headline-wall.html`
- **Measured:**
  - A: about 10 clippings/tweets slap onto the wall in 0.5 s, then a highlighter swipes the keyword.
  - B: screenshots hang behind the head while the room dims.
- **Build:** receipt cards in `.behind`, each a 3-frame slam (scale 1.4→1, rotation from a fixed list), hard cut out. Pair with `00-room-dim`.
  - The head occluding the inner edges is the depth tell. Keep the numbers outside the head's widest lean.
  - The go-to on very close takes, where an orbit's near cards would cross the face.
  - Real numbers only, each with a source line.

### 09 · zoom-through cut 📝
- **Measured:** exponential zoom into a dark area with radial blur, then 2 black frames, then the next shot explodes out of a bright point and settles.
  - Overlays stay locked while the plate flies; the label swaps on the black frames.
- **Build:** needs two shots. Scale `#cam` exponentially (power4.in) to about 6×, add `filter: blur` ramping up, then 2 frames of Core.
  - Next shot: `#cam` from 3× → 1, power4.out. Registry `zoom-through-transition` / `cinematic-zoom` (shader) as references.

### 10 · chart grow 📝
- **Measured:** the room dims, and a glowing line draws across the wall BEHIND the head.
  - It runs flat and white, then rockets up in neon with an area fill and a pulsing peak dot.
  - Flat 0.2 s + climb 0.2 s.
- **Build:** `00-room-dim` plus an SVG path in `.behind` (stroke-dashoffset), area fill = a clip-path reveal. Climb segment in the accent, flat in light ink, peak value in mono.
  - Real numbers only. Registry `chart-story` for data-accurate bars.

### 11 · pull-back reveal 📝
- **Measured:** the WHOLE composite (captions included) shrinks to 0.615 in 0.23 s (easeOutQuart) into a desktop app window on a cream page.
  - A "Working on" task card ticks steps while a render bar fills.
- **Build:** wrap `#cam` AND the hud in one `#world` div and scale that.
  - Window chrome + task card go on a page under it. Registry `pull-back-reveal`, `browser-device-stage`.
  - Great for "Claude made this reel" endings.

### 12 · green screen 📝
- **Measured:** in one frame the room is gone. The person is cut out, scaled to 0.88 and moved down 37%, at the bottom of a near-black studio (#0B1112) with a phone-sized video playing above the head.
- **Build:** hide `#plate`, put a background in `.behind`, transform `#fg` (scale .88, y +37%).
  - The matte quality is the whole effect: check the hair edge.

### 13 · paper cut 📝
- **Measured:** the room becomes a torn-paper collage.
  - The person is a white-bordered sticker (≈ 21 px outline). Ransom-note letter tiles slam in 50 ms apart; pencil scribbles.
  - **The whole frame, footage included, runs at 12 fps.**
- **Build:** sticker outline = the doodle-boil filter trick (blur alpha → threshold → flood Cloud) placed UNDER `#fg`, filled, not ringed.
  - Registry `paper-collage-reveal`, `torn-paper-rip`, `stop-motion-cadence` (12 fps clock).
  - The footage stepping needs `#plate`/`#fg` playback quantised (a pre-pass `ffmpeg -vf fps=12` re-timed to 30).

### 14 · doodle boil ✅ `effects/14-doodle-boil.html`
- **Measured:** room dims to half.
  - A chalk line sits ≈ 16 px outside the silhouette with smoothed corners.
  - Doodles (sparkle, heart) write on over 5 frames. Only the drawn layer boils, at 15 fps; the footage stays at 30.
- **Build:** a second `fg.webm` through an SVG filter: blur alpha 12 → threshold at two levels → subtract = ring → feTurbulence displacement re-seeded at 15 fps. Pair with `00-room-dim`.

### 15 · vertigo 📝
- **Measured:** fake dolly zoom. The room scales 1→1.18–1.40 over 0.67 s (inOutCubic) while the person stays exactly the same size.
  - **Needs a clean plate**; without one, the reference reels show a ghost of the body.
- **Build:** shoot 2 s of the empty room from the same locked-off phone, every time.
  - Plate `<video>` = empty room scaled in `.behind`; `#fg` untouched on top. Registry `camera-dolly-zoom`.

### 16 · cover story ✅ `effects/16-cover-story.html`
- **Measured:** a masthead word (≤ 7 letters) rises letter by letter (65 ms stagger) behind the head; a cap covers the bottom ~15%.
  - Then a hairline border, cover lines and an italic headline build in. Cut at 1.33 s, before it finishes.
- **Build:** word fit to 1000 px, display-900, ink matched to the wall (dark on a light wall).
  - Next upgrade: per-letter rise, plus border + cover lines in `.front` (mono for the issue number).

### 17 · glass type 📝
- **Measured:** clear acrylic letters on the wall behind the person, tilted 9°.
  - The wall shows through them refracted, with a bevelled rim, a soft cast shadow (+22, +68, blur 8, 30%), and a glint sweeping across at 0.25–0.75 s.
- **Build:** text in `.behind`. Glass = `backdrop-filter: blur(1.5px)` + 12% white + SVG displacement; rim = two strokes; glint = gradient band with `mix-blend-mode: screen`, masked to the text.
  - Registry `glass-hero`, `ios26-liquid-glass` for shader glass.

---

## Extras

### x1 · spotlight ✅ `effects/x1-spotlight.html`
- **Measured:** "kill the lights": an elliptical multiply with a navy tint, full darkness in 5 frames, hold ≈ 1.85 s, hard cut back. No matte. Captions stay bright.

### x2 · freeze and label 📝
- **Measured:** on the trigger word, a white flash (≈ 64%), then the picture freezes for 1.1 s while the audio and captions keep running.
  - The room goes dark, grey and blurry; the person stays sharp. Numbered callouts draw leader lines to the hand and head. White flash out (≈ 32%).
- **Build:** freeze = a still PNG of `#plate` and `#fg` at the trigger time (`ffmpeg -ss`), shown over the videos for 1.1 s.
  - Dim/blur the plate still only. Callouts: registry `vox-annotate`, `hw-arrow`. Flash = a light rect, opacity .64→0 over 4 frames.

### x3 · before and after 📝
- **Measured:** a slider (white line + round "<>" handle, 110 px) sweeps in from the right to 8.9%, revealing the edited version.
  - It flicks back to 67%, then wipes off. Chips "before"/"after" ride the handle.
- **Build:** registry `before-after-wipe`. "Before" = raw `source.mp4` in a second `<video>`; "after" = the whole sandwich, clipped with `clip-path: inset(0 0 0 Xpx)`.
  - The obvious hook for "Claude edited this".

### x4 · comment CTA ✅ `effects/x4-comment-cta.html`
- **Measured:** an IG "Add a comment…" bar at about 72% height. The keyword types at 12 chars/s; send lights up.
  - It posts as a bubble that floats up 255 px, gets a heart, and a reply slides in: "Sent you the link" + a link pill. Last 4–12 s of every reference reel.
  - Keyword reels: 20.0 comments per 1k plays vs 1.0 without, across 80 reference reels.
- **Build:** all hud, no matte. Dark glass bar, light bubble, accent link pill and heart, keyword in mono.
  - Close take: `Y 1420, RISE 185` so the bubble stops under the chin.
  - Set captions `HIDE: [[T, end]]`.
  - **Say the keyword out loud too**, and only use it when the keyword's payload page exists.
