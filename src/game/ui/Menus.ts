import type { Difficulty } from '../../config';
import { art, type ArtKey } from '../../core/Art';
import type { Game, GameState, RunResult } from '../Game';
import { saveSettings, settings, topScores } from '../Settings';

type ScreenId = 'title' | 'pause' | 'settings' | 'help' | 'scores' | 'result' | 'rotate';

const DIFF_INFO: Record<Difficulty, [string, string]> = {
  easy: ['EASY', '7 hull · 3 bombs'],
  normal: ['NORMAL', 'the intended hive'],
  hard: ['HARD', '4 hull · no mercy'],
};

const fmt = (n: number) => n.toLocaleString('en-US');

function iconFor(key: ArtKey): string {
  try { return art(key).img.toDataURL(); } catch { return ''; }
}

/** DOM overlays for everything that isn't gameplay. */
export class Menus {
  private root: HTMLElement;
  private screens = new Map<ScreenId, HTMLElement>();
  private stack: ScreenId[] = [];
  private lastResult: RunResult | null = null;
  private scoresTab: Difficulty = settings.difficulty;
  private rotateDismissed = false;

  constructor(private game: Game) {
    this.root = document.getElementById('screens')!;
    for (const id of ['title', 'pause', 'settings', 'help', 'scores', 'result', 'rotate'] as ScreenId[]) {
      const el = document.createElement('section');
      el.className = 'screen';
      el.hidden = true;
      el.dataset['screen'] = id;
      this.root.appendChild(el);
      this.screens.set(id, el);
    }
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (btn) {
        this.game.audio.synth('ui');
        this.act(btn.dataset['act']!, btn);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.stack.length > 0) {
        const top = this.stack[this.stack.length - 1];
        if (top === 'pause') { e.preventDefault(); this.game.resume(); }
        else if (top === 'settings' || top === 'help' || top === 'scores') { e.preventDefault(); this.back(); }
      }
    });
    window.addEventListener('resize', () => this.checkRotate());
  }

  // ── navigation ────────────────────────────────────────────────────────────

  private show(id: ScreenId, push = true): void {
    for (const [sid, el] of this.screens) el.hidden = sid !== id;
    if (push) this.stack.push(id);
    const el = this.screens.get(id)!;
    const focusTarget = el.querySelector<HTMLElement>('[autofocus], .btn.primary, .btn');
    // Don't pop the on-screen keyboard / focus rings for touch users.
    if (focusTarget && !this.game.input.usingTouch) focusTarget.focus({ preventScroll: true });
  }

  private back(): void {
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];
    if (prev) {
      this.render(prev);
      this.show(prev, false);
    } else {
      this.hideAll();
    }
  }

  hideAll(): void {
    for (const el of this.screens.values()) el.hidden = true;
    this.stack = [];
  }

  private open(id: ScreenId, reset = false): void {
    if (reset) this.stack = [];
    this.render(id);
    this.show(id);
  }

  onStateChange(s: GameState): void {
    const touchUi = document.getElementById('touch-ui')!;
    touchUi.hidden = !(s === 'playing' && this.game.input.usingTouch);
    if (s === 'title') this.open('title', true);
    else if (s === 'paused') this.open('pause', true);
    else if (s === 'playing') this.hideAll();
  }

  onResult(r: RunResult): void {
    this.lastResult = r;
    const delay = r.won ? 600 : 300;
    window.setTimeout(() => this.open('result', true), delay);
  }

  // ── actions ───────────────────────────────────────────────────────────────

  private act(action: string, el: HTMLElement): void {
    const g = this.game;
    switch (action) {
      case 'play':
        g.audio.unlock();
        this.tryFullscreen();
        g.newRun(settings.difficulty);
        break;
      case 'diff':
        settings.difficulty = el.dataset['d'] as Difficulty;
        saveSettings();
        this.render('title');
        this.screens.get('title')!.querySelector<HTMLElement>(`[data-d="${settings.difficulty}"]`)?.focus();
        break;
      case 'resume': g.resume(); break;
      case 'restart': g.newRun(g.difficulty); break;
      case 'retry': g.newRun(this.lastResult?.difficulty ?? settings.difficulty); break;
      case 'loop': {
        const r = this.lastResult;
        if (r) g.newRun(r.difficulty, r.loop + 1, true);
        break;
      }
      case 'quit': g.toTitle(); break;
      case 'settings': this.open('settings'); break;
      case 'help':
        settings.seenHelp = true;
        saveSettings();
        this.open('help');
        break;
      case 'scores': this.open('scores'); break;
      case 'tab':
        this.scoresTab = el.dataset['d'] as Difficulty;
        this.render('scores');
        break;
      case 'back': this.back(); break;
      case 'share': void this.share(); break;
      case 'rotate-ok':
        this.rotateDismissed = true;
        this.screens.get('rotate')!.hidden = true;
        break;
      case 'fullscreen': this.tryFullscreen(true); break;
    }
  }

  private tryFullscreen(force = false): void {
    if (!this.game.input.usingTouch && !force) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) return;
    try {
      if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch { /* iPhone Safari: unsupported, fine */ }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.('landscape').catch(() => {});
  }

  private async share(): Promise<void> {
    const r = this.lastResult;
    if (!r) return;
    const url = location.origin + location.pathname;
    const verdict = r.won ? `burned Carrion IX${r.loop > 1 ? ` (loop ${r.loop})` : ''}` : 'fell to the hive';
    const text = `I ${verdict} with ${fmt(r.score)} pts — rank ${r.rank} on ${r.difficulty.toUpperCase()}. Can you beat it?`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CARRION IX', text, url });
        return;
      }
    } catch { /* cancelled — fall through to copy */ }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.toast('Copied to clipboard');
    } catch {
      this.toast(url);
    }
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    window.setTimeout(() => t.remove(), 2200);
  }

  checkRotate(): void {
    const el = this.screens.get('rotate')!;
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    const touch = this.game.input.usingTouch || (navigator.maxTouchPoints ?? 0) > 0;
    if (portrait && touch && !this.rotateDismissed) {
      this.render('rotate');
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  private render(id: ScreenId): void {
    const el = this.screens.get(id)!;
    el.className = 'screen';
    switch (id) {
      case 'title': el.classList.add('title-screen'); el.innerHTML = this.titleHtml(); break;
      case 'pause': el.classList.add('dim'); el.innerHTML = this.pauseHtml(); break;
      case 'settings': el.classList.add('dim'); el.innerHTML = this.settingsHtml(); this.bindSettings(el); break;
      case 'help': el.classList.add('dim'); el.innerHTML = this.helpHtml(); break;
      case 'scores': el.classList.add('dim'); el.innerHTML = this.scoresHtml(); break;
      case 'result': el.classList.add('dim'); el.innerHTML = this.resultHtml(); break;
      case 'rotate': el.classList.add('dim'); el.innerHTML = this.rotateHtml(); break;
    }
  }

  private titleHtml(): string {
    const d = settings.difficulty;
    const best = topScores(d)[0];
    const seg = (Object.keys(DIFF_INFO) as Difficulty[]).map((k) =>
      `<button data-act="diff" data-d="${k}" aria-pressed="${k === d}"><b>${DIFF_INFO[k][0]}</b><small>${DIFF_INFO[k][1]}</small></button>`).join('');
    const touch = this.game.input.usingTouch || (navigator.maxTouchPoints ?? 0) > 0;
    const controls = touch && !matchMedia('(pointer: fine)').matches
      ? 'Drag anywhere to fly · auto-fire · ✹ to bomb'
      : '<kbd>WASD</kbd>/<kbd>↑↓←→</kbd> fly · <kbd>Space</kbd> fire · <kbd>X</kbd> bomb · <kbd>Shift</kbd> focus · <kbd>Esc</kbd> pause<br>Gamepad and touch supported';
    return `
      <div class="title-wrap">
        <div class="logo-kicker">CARRION-IX.ENG</div>
        <h1 class="logo">CARRION IX</h1>
        <div class="logo-sub">MOTHER · OF · ENGINES</div>
        <p class="tagline">In the bone-light of dead stars, the swarm remembers your name. Fly the <i>Vespertine</i>. Burn the hive.</p>
        <div class="stack">
          <button class="btn primary" data-act="play" autofocus>▶ Launch</button>
          <div class="seg" role="group" aria-label="Difficulty">${seg}</div>
          <div class="row">
            <button class="btn" data-act="help">${settings.seenHelp ? 'How to play' : '★ How to play'}</button>
            <button class="btn" data-act="scores">Scores</button>
            <button class="btn" data-act="settings">Settings</button>
          </div>
        </div>
        <div class="best-line">${best ? `BEST ${fmt(best.score)} · RANK ${best.rank}` : ''}</div>
        <div class="controls-line">${controls}</div>
      </div>`;
  }

  private pauseHtml(): string {
    const g = this.game;
    return `
      <div class="panel">
        <div class="kicker">${g.muls.label}${g.loop > 1 ? ` · LOOP ${g.loop}` : ''} · SECTOR ${Math.min(3, g.director.sector + 1)}</div>
        <h2>Paused</h2>
        <div class="stack">
          <button class="btn primary" data-act="resume">Resume</button>
          <div class="row">
            <button class="btn" data-act="restart">Restart</button>
            <button class="btn" data-act="settings">Settings</button>
          </div>
          <button class="btn" data-act="help">How to play</button>
          <button class="btn ghost" data-act="quit">Quit to title</button>
        </div>
      </div>`;
  }

  private settingsHtml(): string {
    const a = this.game.audio.settings;
    const range = (id: string, v: number) => `<input type="range" min="0" max="1" step="0.05" data-set="${id}" value="${v}">`;
    const check = (id: string, v: boolean) => `<input type="checkbox" data-set="${id}" ${v ? 'checked' : ''}>`;
    const sel = (id: string, v: string, opts: Array<[string, string]>) =>
      `<select data-set="${id}">${opts.map(([val, label]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
    return `
      <div class="panel">
        <div class="kicker">Configuration</div>
        <h2>Settings</h2>
        <div class="field"><label>Master volume</label>${range('master', a.master)}</div>
        <div class="field"><label>Music</label>${range('music', a.music)}</div>
        <div class="field"><label>Effects</label>${range('sfx', a.sfx)}</div>
        <div class="field"><label>Mute<small>M during play</small></label>${check('muted', a.muted)}</div>
        <div class="field"><label>Auto-fire<small>Auto = on for touch & gamepad. F toggles in play.</small></label>
          ${sel('autofire', settings.autofire, [['auto', 'Auto'], ['on', 'Always on'], ['off', 'Hold to fire']])}</div>
        <div class="field"><label>Screen shake</label>${check('shake', settings.shake)}</div>
        <div class="field"><label>Bright flashes<small>Off softens full-screen flashes</small></label>${check('flashes', settings.flashes)}</div>
        <div class="field"><label>Scanlines</label>${check('scanlines', settings.scanlines)}</div>
        <div class="field"><label>Graphics quality<small>Auto lowers detail if the frame rate dips</small></label>
          ${sel('quality', settings.quality, [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (battery saver)']])}</div>
        <div class="field"><label>Show FPS</label>${check('showFps', settings.showFps)}</div>
        <div class="stack" style="margin-top:18px">
          <button class="btn primary" data-act="back">Done</button>
        </div>
      </div>`;
  }

  private bindSettings(el: HTMLElement): void {
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((input) => {
      const key = input.dataset['set']!;
      const apply = () => {
        const audio = this.game.audio;
        if (key === 'master' || key === 'music' || key === 'sfx') {
          audio.set({ [key]: parseFloat(input.value) });
          if (key === 'sfx') audio.synth('pickup');
        } else if (key === 'muted') {
          audio.set({ muted: (input as HTMLInputElement).checked });
        } else if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          (settings as unknown as Record<string, boolean>)[key] = input.checked;
          saveSettings();
        } else {
          (settings as unknown as Record<string, string>)[key] = input.value;
          saveSettings();
          window.dispatchEvent(new Event('pxvi-quality'));
        }
      };
      input.addEventListener('input', apply);
      input.addEventListener('change', apply);
    });
  }

  private helpHtml(): string {
    const pu = (key: ArtKey, name: string, desc: string) =>
      `<div class="pu"><img src="${iconFor(key)}" alt=""><div><b>${name}</b><br><span class="dim">${desc}</span></div></div>`;
    return `
      <div class="panel wide">
        <div class="kicker">Field manual</div>
        <h2>How to play</h2>
        <div class="help-grid">
          <div>
            <h3>Fly &amp; fire</h3>
            <p><b>Keyboard</b> — <kbd>WASD</kbd>/<kbd>Arrows</kbd> move, <kbd>Space</kbd>/<kbd>J</kbd> fire, <kbd>X</kbd>/<kbd>K</kbd> bomb, <kbd>Shift</kbd> focus, <kbd>F</kbd> auto-fire, <kbd>Esc</kbd> pause, <kbd>M</kbd> mute.</p>
            <p style="margin-top:6px"><b>Touch</b> — drag anywhere; the ship moves with your finger without hiding under it. Fire is automatic. Tap ✹ to bomb.</p>
            <p style="margin-top:6px"><b>Gamepad</b> — stick/D-pad, A fire, B bomb, shoulders focus, Start pause.</p>
          </div>
          <div>
            <h3>Survive</h3>
            <p>Only the <b>glowing core</b> of your ship can be hit — hold <b>Focus</b> to slow down and see it. Getting hit costs one hull and one power level (it drops out — grab it back). Nearby bullets are cleared when you're hit.</p>
            <p style="margin-top:6px"><b>Bombs</b> wipe every bullet into score gems and damage everything on screen.</p>
          </div>
          <div>
            <h3>Score</h3>
            <p><b>Chain</b> kills quickly to raise the multiplier (up to ×8). <b>Graze</b> bullets — let them skim past your core — for points and to keep the chain alive. Red-haloed <b>elites</b> drop power and a shower of gems. Extra hull every 100,000 pts.</p>
          </div>
          <div>
            <h3>The hive</h3>
            <p>Three sectors: <span style="color:var(--cyan)">Outer Husk</span>, <span style="color:var(--magenta)">Sinew Drift</span>, <span style="color:var(--orange)">Hive Throat</span>. Then <b style="color:var(--red)">Carrion IX</b> — three phases, telegraphed lance in phase two. Win to unlock the next, harder <b>loop</b>.</p>
          </div>
          <div style="grid-column: 1 / -1">
            <h3>Pick-ups</h3>
            <div class="pu-list">
              ${pu('puPower', 'POWER', 'weapon level, up to 4')}
              ${pu('puShield', 'SHIELD', '9s invulnerable')}
              ${pu('puSpread', 'SPREAD', '15s extra fan shots')}
              ${pu('puMulti', 'RAPID', '15s fire rate ×2.2')}
              ${pu('puLaser', 'LANCE', '15s piercing main gun')}
              ${pu('puSpeed', 'BOOST', '15s movement ×1.7')}
              ${pu('puBomb', 'BOMB', '+1 bomb (max 5)')}
              ${pu('puLife', 'HULL', '+1 hull')}
              ${pu('puCoin', 'COIN', '+500 points')}
              ${pu('gem', 'GEM', 'cancelled bullets, 50 × chain')}
            </div>
          </div>
        </div>
        <div class="stack" style="margin-top:20px">
          <button class="btn primary" data-act="back">Got it</button>
        </div>
      </div>`;
  }

  private scoresHtml(): string {
    const d = this.scoresTab;
    const list = topScores(d);
    const tabs = (['easy', 'normal', 'hard'] as Difficulty[]).map((k) =>
      `<button class="btn" data-act="tab" data-d="${k}" aria-pressed="${k === d}">${DIFF_INFO[k][0]}</button>`).join('');
    const rows = list.length
      ? `<table class="scores"><tr><th>#</th><th>RANK</th><th>RESULT</th><th>DATE</th><th style="text-align:right">SCORE</th></tr>${
        list.map((s, i) => `<tr><td>${i + 1}</td><td class="rank-${s.rank}">${s.rank}</td><td>${s.won ? `CLEAR${s.loop > 1 ? ` L${s.loop}` : ''}` : '—'}</td><td>${s.date}</td><td class="num">${fmt(s.score)}</td></tr>`).join('')
      }</table>`
      : '<div class="empty">No runs yet. The hive is waiting.</div>';
    return `
      <div class="panel">
        <div class="kicker">Local records · this device</div>
        <h2>High scores</h2>
        <div class="tabs">${tabs}</div>
        ${rows}
        <div class="stack" style="margin-top:18px"><button class="btn primary" data-act="back">Back</button></div>
      </div>`;
  }

  private resultHtml(): string {
    const r = this.lastResult;
    if (!r) return '';
    const newBest = r.place === 0;
    const mm = Math.floor(r.seconds / 60), ss = String(r.seconds % 60).padStart(2, '0');
    const bonuses = r.bonuses.length
      ? `<div class="bonuses">${r.bonuses.map(([k, v]) => `<div><span>${k}</span><span>+${fmt(v)}</span></div>`).join('')}</div>` : '';
    const title = r.won ? (r.loop > 1 ? `Loop ${r.loop} clear` : 'Hive burned') : 'Signal lost';
    return `
      <div class="panel">
        <div class="result-head">
          <div>
            <div class="kicker">${r.difficulty.toUpperCase()}${r.loop > 1 ? ` · LOOP ${r.loop}` : ''}</div>
            <div class="result-title ${r.won ? 'win' : 'lose'}">${title}</div>
          </div>
          <div class="rank rank-${r.rank}" title="Rank">${r.rank}</div>
        </div>
        <div><span class="big-score">${fmt(r.score)}</span>${newBest ? '<span class="new-best">NEW BEST</span>' : ''}</div>
        <div class="kicker" style="color:var(--bone-d);margin-top:4px">BEST ${fmt(Math.max(r.best, r.score))}</div>
        <div class="stats">
          <div class="stat"><b>${mm}:${ss}</b><small>TIME</small></div>
          <div class="stat"><b>${r.kills}</b><small>KILLS</small></div>
          <div class="stat"><b>${r.maxChain}</b><small>MAX CHAIN</small></div>
          <div class="stat"><b>${r.grazes}</b><small>GRAZES</small></div>
          <div class="stat"><b>${r.hitsTaken}</b><small>HITS TAKEN</small></div>
          <div class="stat"><b>${r.bombsUsed}</b><small>BOMBS</small></div>
        </div>
        ${bonuses}
        <div class="stack">
          ${r.won ? `<button class="btn gold" data-act="loop">Continue → Loop ${r.loop + 1}</button>` : ''}
          <button class="btn ${r.won ? '' : 'primary'}" data-act="retry">${r.won ? 'New run' : 'Retry'}</button>
          <div class="row">
            <button class="btn" data-act="share">Share</button>
            <button class="btn" data-act="quit">Title</button>
          </div>
        </div>
      </div>`;
  }

  private rotateHtml(): string {
    return `
      <div class="panel" style="text-align:center">
        <div style="font-size:48px;margin-bottom:8px">⟲</div>
        <h2>Rotate your device</h2>
        <p style="color:var(--bone-d);font-size:13px;line-height:1.6;margin:0 0 18px">Carrion IX is a side-scroller — it plays best in landscape.</p>
        <button class="btn" data-act="rotate-ok">Play in portrait anyway</button>
      </div>`;
  }
}
