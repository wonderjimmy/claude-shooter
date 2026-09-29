# Claude Shooter — Carrion IX

<p align="center">
  <img src="assets/images/poster.png" alt="CARRION IX — MOTHER OF ENGINES" width="420">
</p>

A bio-mechanical horizontal shoot-'em-up that runs in **any modern browser** — desktop or phone, keyboard, touch or gamepad. No install, no WebGL, no extensions to disable.

> *In the bone-light of dead stars, the swarm remembers your name. Fly the* Vespertine. *Burn the hive.*

**Play:** https://wonderjimmy.github.io/claude-shooter/ (deployed automatically from `main` by GitHub Actions)

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Fly | WASD / Arrows | drag anywhere (relative) | stick / D-pad |
| Fire | Space / J / Z (F toggles auto-fire) | automatic | A / RT |
| Bomb | X / K | ✹ button | B / X |
| Focus (slow + show hitbox) | Shift / L | — | LB / RB / LT |
| Pause | Esc / P | ❚❚ button | Start |
| Mute | M | Settings | — |

The game also auto-pauses when the tab loses focus.

## How it plays

- **Three sectors, then the boss.** *Outer Husk* → *Sinew Drift* → *Hive Throat*, each a shuffled deck of authored formations (lines, V-wings, pincers, sine snakes, turrets, lunging reapers) ending on a red-haloed **elite**.
- **Carrion IX, Mother of Engines** — a cathedral-sized ribcage around a heart-eye:
  1. **Carapace** — the core is sealed under two bone shells; destroy both turret pods (shots that miss a weak point spark off the carcass).
  2. **Unsealed** — the shells split open like a jaw, four bone arms unfurl and fire from their claws, the eye charges a telegraphed lance.
  3. **Heart of Engines** — the shells are blown off, the heart races: rotating rings, whipping claws, and a spiral frenzy below 40 %.
- **Enemies have jobs, and tell you before they shoot** — every muzzle glows for a beat before firing. Parts break off when they die.
- **Power 1–4.** P orbs upgrade the main gun. A hit costs one hull *and* one power level, which drops out so you can grab it back. Nearby bullets are cleared when you're hit so one mistake doesn't cascade.
- **Bombs are stock** (max 5). A bomb turns every bullet on screen into score gems.
- **Scoring:** kill quickly to build a **chain** (×1 → ×8); **graze** bullets past your tiny core for points and to keep the chain alive; sector-clear bonuses; hull / bomb / no-miss bonuses on victory; extend every 100 000.
- **Easy / Normal / Hard**, then **Loop 2, 3…** after a win — keeps your score and power, and the hive gets faster and tougher.
- Results screen with rank (S–D), stats, local top-8 board per difficulty, and a Share button (Web Share API or clipboard).

| Enemy | HP | Score | Behaviour |
|---|---|---|---|
| Sting-drone | 1 | 100 | buzzing wings, weaving swarm, straight stinger |
| Bone Warden | 3 | 150 | armoured skull with a spinning halo, aimed bone shard |
| Psi Medusa | 2 | 200 | brain-jellyfish, trailing tentacles, 3-way psi spread |
| Reaper | 2 | 250 | parks, rears its twin scythes, lunges where you were |
| Shard Choir | 4 | 300 | crystal core with orbiting shards that tighten before a 5-way volley |

The player's *Vespertine* flexes its wings as it banks, folds them in while focusing, and grows weapon pods at power 3 and 4.

Elites: ×4 HP, ×4 score, faster and denser fire, guaranteed power drop + gem shower.

| Pick-up | Effect |
|---|---|
| P | weapon power +1 (max 4) |
| Shield | 9 s invulnerable |
| Spread | 15 s extra fan shots |
| Rapid | 15 s fire rate ×2.2 |
| Lance | 15 s piercing main gun |
| Boost | 15 s speed ×1.7 |
| Bomb | +1 bomb |
| Hull | +1 hull |
| Coin | +500 |
| Gem | 50 × chain (from cancelled bullets) |

## Build / dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production bundle → dist/
npm run preview   # serve dist/ locally
```

Dev helpers: open with `?debug` and press **1** invincible · **2** skip sector · **3** skip to boss · **4** max power/bombs. `?debug&skip=boss` starts at the boss warning.

## Deploying

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`dist/` is plain static files with relative paths, so it also works on Cloudflare Pages / Workers, Netlify, itch.io (upload a zip of `dist/`) or any web server.

## Why the rewrite (v0.2)

The first version (May 2026) was built on PixiJS v8 + WebGL filters and was feature-complete, but it never reached its audience: wallet / Claude-in-Chrome extensions that inject SES lockdown blocked Pixi's runtime shader compilation, Firefox lost the WebGL context, Safari/Tauri lagged, Electron hung in `Application.init()`, and phones were refused outright.

v0.2 follows the lesson that write-up ended on — *"pure Canvas 2D … ship surface 100×"* — and goes further:

- **Rendering:** Canvas 2D only. Every SVG sprite is rasterised once at boot at the exact device resolution, colour-graded in software (the same saturate/brightness/contrast grade the Pixi build used), and given a pre-blurred bloom twin. At runtime it's `drawImage` + additive blending — no WebGL, no shaders, no `eval`/`new Function`, so SES-locked pages, Firefox, Safari and phones all behave the same. JS bundle went from ~460 KB to ~155 KB.
- **Background:** fully procedural, per-sector scenery — domain-warped fbm nebulae, a celestial body per sector (dead star, ringed gas giant, the hive's eye, a blood eclipse for the boss, a gold dawn on victory), rim-lit carcass spines in parallax, wisps, spores, meteors and flesh walls in the Hive Throat — cross-fading between sectors and streaking into warp between them.
- **Characters:** every enemy, the player ship and the boss are redrawn from scratch as canvas vector art (`src/game/art/Sprites.ts`), split into parts (wings, scythes, shards, shells, arms, pods) and animated at runtime by a small rig (`src/game/art/Rig.ts`).
- **Audio:** WebAudio. SFX are decoded buffers (no pool limits, no latency); BGM streams through `<audio>` routed into gain nodes so fades and volume work on iOS. The BGM in `assets/audio/web/` is mastered for the game: loudness-matched to −16 LUFS (was ~−12, drowning the SFX), silence trimmed, and baked into seamless loops by cross-fading each song's tail into its head, at 128 kbps. The music runs through a low-pass the game sweeps — muffled on title/pause, a dip plus tinnitus ring when you're hit, a sweep on sector clear, a closing filter under the boss warning — and slow-motion bends its pitch like a tape stop. A heartbeat plays on your last hull. Pick-up, power, graze, bomb, chain and warning sounds are synthesized.
- **Feel:** fixed-step simulation (identical on 60/120/144 Hz), hitstop on heavy hits, slow-mo boss death, graze sparks, score pop-ups, warp transitions.
- **Reach:** touch controls, gamepad, auto-fire, portrait prompt, fullscreen + landscape lock on Android, PWA manifest (add to home screen), reduced-flash / no-shake / scanline / quality options, adaptive quality when the frame rate dips.

`src-tauri/` and `electron/` are kept; both should now work since they only load `dist/`, but they're untested.

## Credits

- **Carrion Ix asset pack** (projectiles, pick-ups, FX, poster): Anthropic Claude Design. The original character SVGs remain in `assets/images/sprites/` for reference; v0.2 characters are drawn in code.
- **Music & SFX**: generated via Suno
- **Fonts**: JetBrains Mono, Space Grotesk (SIL OFL, self-hosted via @fontsource)
