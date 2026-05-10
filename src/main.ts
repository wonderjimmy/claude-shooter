import { Game } from './game/Game';
import { attachTuningPanel } from './game/ui/Tuning';
import { loadSprites } from './game/assets/sprites';

function detectSesLockdown(): boolean {
  const g = globalThis as Record<string, unknown>;
  return typeof g['lockdown'] === 'function'
      || typeof g['harden'] === 'function'
      || typeof g['Compartment'] === 'function';
}

function detectMobile(): boolean {
  return (navigator.maxTouchPoints ?? 0) > 1
      || /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent);
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function showInfo(title: string, body: string, color = '#ffe066'): void {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;padding:32px;background:#0a0a1a;color:#e6d8b8;font:14px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow:auto;z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center';
  div.innerHTML = `<div style="color:${color};font-weight:700;font-size:22px;margin-bottom:20px;letter-spacing:2px">${title}</div><div style="max-width:560px">${body.replace(/\n/g, '<br>')}</div>`;
  document.body.appendChild(div);
}

if (detectMobile()) {
  showInfo('DESKTOP ONLY', 'Claude Shooter needs a keyboard.\n\nOpen this link on a laptop / desktop with arrow keys + space.', '#9be7ff');
  throw new Error('mobile-not-supported');
}

if (!detectWebGL()) {
  showInfo('WEBGL UNAVAILABLE', 'Your browser cannot run WebGL.\n\nUse a modern Chrome / Safari / Firefox on desktop.', '#ff9aaa');
  throw new Error('no-webgl');
}

function showFatal(err: unknown): void {
  console.error('[claude-shooter] fatal boot error:', err);
  const msg = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err);
  const ses = detectSesLockdown();

  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;padding:32px;background:#1a0a14;color:#e6d8b8;font:14px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow:auto;z-index:99999';
  const heading = ses
    ? `⚠ Browser extension blocking the game\n\nA wallet / Claude / SES-lockdown extension has hardened this page's JavaScript in a way that breaks PixiJS.\n\nFix:\n  1. Open chrome://extensions\n  2. Disable any wallet / Claude in Chrome / MetaMask-like extension\n  3. Reload this page\n\nOr play in Safari / Firefox / Incognito (with extensions disabled).`
    : `Claude Shooter failed to start.\n\nLikely causes: browser too old (needs top-level await), asset 404, or unexpected runtime error.\nTry Incognito with extensions disabled, or another browser.`;
  div.innerHTML = `<div style="color:#ff9aaa;font-weight:700;font-size:18px;margin-bottom:16px;letter-spacing:1px">${ses ? 'EXTENSION CONFLICT' : 'BOOT ERROR'}</div>`;
  const body = document.createElement('div');
  body.textContent = `${heading}\n\n— — —\n\n${msg}`;
  div.appendChild(body);
  document.body.appendChild(div);
}

window.addEventListener('error', (e) => showFatal(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

try {
  await loadSprites();
  const game = await Game.create(document.body);
  game.start();
  if (new URLSearchParams(location.search).has('tune')) {
    attachTuningPanel(game);
  }
  (globalThis as unknown as { game: Game }).game = game;
} catch (err) {
  showFatal(err);
}
