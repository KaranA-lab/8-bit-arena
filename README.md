# 8-Bit Arena

A single-screen, pixel-art hero section with four tiny sports games playable on a retro PC.
Built from the Figma file *Cineworld Case Study → PIXEL game* (Desktop 1 + Desktop 2).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (deploy to Vercel, Netlify, GitHub Pages…)
npm run preview    # serve the production build locally
```

## Flow

1. **Boot**: BIOS text types out, a pixel PC logo assembles, then *Press Start*. Any click or key plays the 8-bit startup chime and pixel-dissolves into the hero. (The click also unlocks browser audio.)
2. **Hero (Desktop 1)**: the nebula un-pixelates, clouds drop in, the title pops in letter by letter, the crowd rises and does a Mexican wave, and the plane loops with perspective. Each cloud sits at its own depth: the plane starts small and hazy behind the left clouds, grows as it passes in front of the big one, then slips between the two right-hand clouds. Every other pass it dives *through* the crowd, between the two crowd layers, and the fans go wild.
3. **Start Playing → Desktop 2**: a Figma "smart animate"-style move. Clouds shrink and float up, the crowd sinks, the copy slides right, the plane exits top-right, and the PC rises in with a CRT power-on.
4. **Menu** (yellow icon): a pixel-block wipe from the corner. Hovering a game rolls its ball across the title (cricket ball, football, golf ball into the hole, shuttlecock). It also shows local records and Home, Sound and CRT FX toggles. Slot `05 MEET THE CREATOR` opens an about page: a "Player 1" card with a pixel avatar that sharpens into the real photo on hover, a short bio, how the project started, experience, skills, and a resume download.
5. **The PC's buttons work**: LED 1 = sound, LED 2 = CRT scanlines, LED 3 = restart game, red button = power off and return home.
6. **Phones (portrait, up to 760px wide)**: the hero zooms in on the middle of the frame, and the PC turns into a pocket console with a D-pad, A (action), B (jump) and Sound / CRT / Reset / Home keys, so every game is playable by touch. In badminton the D-pad becomes an analog thumbstick. In-game hints switch from "CLICK" to "TAP".

## Games (all 320×160 canvas, scaled crisply)

| Game | Controls | Rules |
|---|---|---|
| Cricket | Pick right- or left-handed, then click left/right half of the screen, or ← → / A D | Chase a random 25–80 target in 18 balls with 3 wickets. Side-on batsman, mirrored for left-handers. Singles and twos bounce along the outfield; catches fly. Timing gives 6 / 4 / 2 / 1, and perfect timing into the gap is always a six. A deep fielder guards one side each ball: hit the gap, or he fields it for 2, with a catch risk. |
| Football | Pick a nation (Brazil, Argentina, France, Portugal, Spain, Germany, Italy or England), click a corner of the goal to shoot (or arrows + Space). When you're in goal, click left / middle / right to dive | Alternating penalties, 5 each, then sudden death. Random rival nation in contrasting colours each game. Confetti on your goals and saves. |
| Mini Golf | Drag back from anywhere and release (works with touch) | Endless seeded courses with walls, sand, water (+1 stroke), blocks and moving blockers. Course number shown top-right. |
| Badminton | A/D move, W jump, click to swing, mouse over their side to aim. Phone: analog thumbstick (push up to jump), B jump, A swing | Beginner / Intermediate / Extreme bot (speed, reactions, accuracy, smashes and shot placement all scale). First to 5. Jump + hit above your head = smash. Out is out, net is a fault. |

## Project structure

```
src/
  App.tsx                 scene orchestration + GSAP timelines (intro, home <-> arcade)
  components/             Background, Crowd, Plane, Hero, Monitor (PC + phone handheld), GameScreen,
                          Menu, Creator (meet-the-creator page), BootIntro
  games/                  cricket.ts, football.ts, golf.ts, badminton.ts  (plain TS classes)
  lib/                    gfx (pixel drawing, particles, crowd), font (3x5 bitmap font),
                          audio (WebAudio chiptune SFX), records (localStorage), scene (layout)
  assets/                 bg-nebula.png, cloud.png, plane.png (from Figma), creator.jpg (avatar)
public/Karan-Anilkumar-Resume.pdf   served as-is for the resume download
scripts/prep-assets.mjs   trims Figma exports into src/assets
```

Every game implements the small `Game` interface in `src/lib/gfx.ts` (`update`, `draw`, pointer/key handlers),
so adding a 5th game means one new file plus one entry in `GameScreen.tsx` and `lib/scene.ts`.

## Using the Figma font

The UI currently uses **Pixelify Sans** at weight 400. Heavier weights close up the "C", which then reads as an "O".
To use the exact font from the Figma file, drop it into `src/assets/fonts/`, add an `@font-face` in `src/styles.css`,
and change `--font-pixel` at the top of that file. In-game text uses its own bitmap font, so it isn't affected.

## Editing the creator page

All the copy (bio, "how this started", levels cleared, inventory, links) lives at the top of `src/components/Creator.tsx`.
To update the resume, replace `public/Karan-Anilkumar-Resume.pdf`, keeping the same file name.

## Deploying

`npm run build` outputs a static site in `dist/` (about 1 MB). Vercel and Netlify work with no config (build `npm run build`, output `dist`).
For GitHub Pages under `https://<user>.github.io/<repo>/`, set `base: '/<repo>/'` in `vite.config.ts` first.

## Notes

- The crowd is drawn procedurally in the Figma colours (plum behind, navy in front) instead of the two static masked layers, so individual fans can jump, wave flags and hold up phone lights.
- Sound effects are synthesised with WebAudio, so there are no audio files to load.
- In dev builds the running game is exposed as `window.__game` for debugging. It's stripped from production builds.
