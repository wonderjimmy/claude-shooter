import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

import { STAGE } from './config';
import { bakeArt } from './core/Art';
import { AudioSystem } from './core/Audio';
import { Input } from './core/Input';
import { DRAWN_COUNT, bakeSprites } from './game/art/Sprites';
import { Game } from './game/Game';
import { settings } from './game/Settings';
import { Menus } from './game/ui/Menus';

function fatal(err: unknown): void {
  console.error('[carrion-ix] fatal:', err);
  if (document.querySelector('.fatal')) return;
  const div = document.createElement('div');
  div.className = 'fatal';
  const h = document.createElement('h1');
  h.textContent = 'The Vespertine failed to launch';
  const body = document.createElement('div');
  const msg = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err);
  body.textContent = `Something went wrong while starting the game. Reloading usually fixes it; if not, please report the text below.\n\n${msg}`;
  div.append(h, body);
  document.body.appendChild(div);
}

window.addEventListener('error', (e) => { if (e.error) fatal(e.error); });
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

const isTouchFirst = () => matchMedia('(pointer: coarse)').matches;

function maxRatio(low: boolean): number {
  if (low) return 1;
  return isTouchFirst() ? 1.75 : 2;
}

async function boot(): Promise<void> {
  const fill = document.getElementById('boot-fill')!;
  const msg = document.getElementById('boot-msg')!;
  const stage = document.getElementById('stage')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;

  // Fonts first so the procedural "P" orb and canvas HUD use them.
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);

  const vw = () => window.visualViewport?.width ?? window.innerWidth;
  const vh = () => window.visualViewport?.height ?? window.innerHeight;
  const fit = Math.min(vw() / STAGE.width, vh() / STAGE.height);
  const bakeRatio = Math.max(1, Math.min(maxRatio(settings.quality === 'low'), fit * (window.devicePixelRatio || 1)));
  msg.textContent = 'rendering bone and sinew…';
  await bakeArt(bakeRatio, (done, total) => { fill.style.width = `${(done / total) * 50}%`; });
  msg.textContent = 'growing the swarm…';
  let drawn = 0;
  await bakeSprites(() => { drawn++; fill.style.width = `${50 + (drawn / DRAWN_COUNT) * 45}%`; });

  msg.textContent = 'seeding the nebula…';
  const input = new Input(stage);
  const audio = new AudioSystem();
  let menus: Menus | null = null;
  const game = new Game(canvas, input, audio, {
    onResult: (r) => menus?.onResult(r),
    onStateChange: (s) => menus?.onStateChange(s),
  });
  menus = new Menus(game);
  await game.background.prepare('husk');
  // Bake the other sectors' scenery in the background while the player reads the title.
  void (async () => {
    for (const t of ['sinew', 'throat', 'heart', 'dawn'] as const) await game.background.prepare(t);
  })();
  (globalThis as unknown as { game: Game }).game = game;

  // ── quality management ────────────────────────────────────────────────────
  let lowDetail = settings.quality === 'low';
  const applyQuality = () => {
    lowDetail = settings.quality === 'low';
    game.fx.maxParticles = lowDetail ? 200 : 420;
    game.background.lowDetail = lowDetail;
    game.renderer.resize(vw(), vh(), maxRatio(lowDetail));
  };
  window.addEventListener('pxvi-quality', applyQuality);
  const onResize = () => { game.renderer.resize(vw(), vh(), maxRatio(lowDetail)); menus?.checkRotate(); };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  applyQuality();

  // ── touch buttons ─────────────────────────────────────────────────────────
  const bombBtn = document.getElementById('btn-bomb')!;
  const pauseBtn = document.getElementById('btn-pause')!;
  bombBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); game.useBomb(); });
  pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); game.pause(); });
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && game.state === 'playing') {
      document.getElementById('touch-ui')!.hidden = false;
    }
  });

  // Auto-pause whenever the player looks away.
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
  window.addEventListener('blur', () => game.pause());

  // ── main loop ─────────────────────────────────────────────────────────────
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 60;
  let slowStreak = 0;

  const loop = (now: number) => {
    const elapsed = Math.min(250, now - last);
    last = now;
    try {
      game.frame(elapsed / (1000 / 60));
      game.render(settings.showFps ? fps : null, !lowDetail);
    } catch (err) {
      fatal(err);
      return;
    }
    bombBtn.classList.toggle('empty', game.bombs <= 0);

    fpsFrames++;
    fpsTime += elapsed;
    if (fpsTime >= 1000) {
      fps = Math.round((fpsFrames * 1000) / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      // Adaptive detail: two consecutive seconds under 45 fps while playing → drop to low.
      if (settings.quality === 'auto' && !lowDetail && game.state === 'playing') {
        slowStreak = fps < 45 ? slowStreak + 1 : 0;
        if (slowStreak >= 2) {
          lowDetail = true;
          game.fx.maxParticles = 220;
          game.background.lowDetail = true;
          game.renderer.resize(vw(), vh(), 1);
          console.info('[carrion-ix] frame rate low — switched to low detail');
        }
      }
    }
    requestAnimationFrame(loop);
  };

  fill.style.width = '100%';
  const bootEl = document.getElementById('boot')!;
  bootEl.classList.add('gone');
  window.setTimeout(() => bootEl.remove(), 500);
  game.toTitle();
  menus.onStateChange('title');
  menus.checkRotate();
  requestAnimationFrame(loop);
}

boot().catch(fatal);
