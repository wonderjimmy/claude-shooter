# Claude Shooter — Carrion IX

Browser-based horizontal shoot-'em-up. Must run everywhere: desktop + mobile browsers, SES-locked pages (wallet / Claude-in-Chrome extensions), Firefox, Safari, Electron/Tauri. That constraint drives the stack.

## Stack

- **Canvas 2D only.** No WebGL, no shader compilation, no `eval` / `new Function`. Don't add PixiJS / Three / Phaser back — v0.1 did, and it couldn't ship (see README "Why the rewrite").
- **Vite + TypeScript strict** (`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`).
- **WebAudio** for all sound. **@fontsource** fonts are self-hosted (no CDN at runtime).
- Zero runtime dependencies besides fonts.

## Layout

```
src/
  main.ts            boot: fonts → bake art → bake husk scenery → Game + Menus → rAF loop, adaptive quality
  config.ts          ALL tunables: stage, player, chain, score, power-up durations, difficulty table, loop scaling
  styles.css         DOM overlay styling (poster palette: void / bone / sinew / cyan / magenta / gold)
  core/
    Art.ts           SVG (?raw imports) → canvas bitmaps at device resolution; colour grade; glow + white-flash twins
    Audio.ts         WebAudio mixer: sample SFX, synth SFX, BGM via <audio> → GainNode (iOS-safe), ducking
    Input.ts         keyboard + relative touch drag + standard gamepad → intent actions
    Storage.ts       localStorage wrappers (prefix `claude-shooter:`)
  game/
    Game.ts          run state, fixed-step loop (`frame` → `step`), combat events, scoring, render passes
    Renderer.ts      stage-space (1280×720) drawing helpers over a letterboxed canvas; vignette/scanlines/flash
    Settings.ts      persisted settings + local leaderboard
    entities/        Player, Enemy (5 kinds × 4 motions, elites), Boss (3 phases), Bullet, Pickup
    systems/         Director (sectors → shuffled wave decks → elite → warning → boss), Collision
    fx/              Fx (particles, explosions, rings, popups, sparks), Background + Scenery (procedural themes)
    ui/              Hud (canvas), Menus (DOM screens: title, pause, settings, help, scores, results, rotate)
```

## Conventions

- Units are **frames at 60 fps**; every update takes `dt` (≤ 1, sub-stepped). Real-time effects (shake, flash, hitstop) use unscaled dt; the world uses `dt × timeScale`.
- Entities are plain classes in typed arrays on `Game` (`enemies`, `playerBullets`, `enemyBullets`, `pickups`, `boss`). Mark `dead = true`; `Game.step` compacts.
- Draw order: background → solid sprites → additive pass (glows, player bullets, particles) → enemy bullets on top (readability) → popups → post → HUD.
- Sprites: add the SVG to `DEFS` in `core/Art.ts` with its draw scale; use `art('key')`. Colours for `dot()` / particles must be `#rrggbb`.
- New tunable → `config.ts`. No per-frame allocations in hot loops beyond bullets/particles.
- Background themes live in `fx/Scenery.ts` (`THEMES`); Director picks one per sector. Scenery bakes async — call `background.prepare()` early.

## Verify

```bash
npx tsc -p tsconfig.json --noEmit
npm run build
npm run preview        # then play: ?debug → 1 invincible, 2 next sector, 3 boss, 4 max power
```

Check at least: title → sector 1 banner → a hit → bomb → boss warning → all three phases → results → Loop 2; and a phone-sized landscape viewport (touch drag + bomb button).

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages on push to `main`.
