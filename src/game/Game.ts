import {
  CHAIN, COLORS, DIFFICULTY, PLAYER, POWERUP_FRAMES, SCORE,
  loopScaled, type Difficulty, type DifficultyMul,
} from '../config';
import type { AudioSystem } from '../core/Audio';
import type { Input } from '../core/Input';
import { Boss } from './entities/Boss';
import type { Bullet } from './entities/Bullet';
import { Enemy, type EnemyKind, type EnemyOptions } from './entities/Enemy';
import { DROP_TABLE, PICKUP_LABEL, Pickup, type PickupKind } from './entities/Pickup';
import { Player } from './entities/Player';
import { Background } from './fx/Background';
import { Fx } from './fx/Fx';
import { Renderer } from './Renderer';
import { bestScore, recordScore, settings } from './Settings';
import { collide } from './systems/Collision';
import { Director } from './systems/Director';
import { Hud } from './ui/Hud';

export type TimedPower = keyof typeof POWERUP_FRAMES;
export type GameState = 'title' | 'playing' | 'paused' | 'over' | 'victory';

export interface RunResult {
  won: boolean;
  score: number;
  best: number;
  place: number;
  difficulty: Difficulty;
  loop: number;
  rank: string;
  seconds: number;
  kills: number;
  maxChain: number;
  grazes: number;
  bombsUsed: number;
  hitsTaken: number;
  bonuses: Array<[string, number]>;
}

export interface GameEvents {
  onResult(r: RunResult): void;
  onStateChange(s: GameState): void;
}

class Shake {
  trauma = 0;
  x = 0;
  y = 0;
  add(v: number): void { this.trauma = Math.min(1, this.trauma + v); }
  update(dt: number, enabled: boolean): void {
    if (this.trauma <= 0 || !enabled) { this.x = this.y = 0; this.trauma = Math.max(0, this.trauma - 0.04 * dt); return; }
    const s = this.trauma * this.trauma * 22;
    this.x = (Math.random() * 2 - 1) * s;
    this.y = (Math.random() * 2 - 1) * s;
    this.trauma = Math.max(0, this.trauma - 0.035 * dt);
  }
}

interface Timer { at: number; fn: () => void }

export class Game {
  readonly renderer: Renderer;
  readonly fx = new Fx();
  readonly background = new Background();
  readonly shake = new Shake();
  readonly hud: Hud;
  readonly player: Player;
  director: Director;

  enemies: Enemy[] = [];
  playerBullets: Bullet[] = [];
  enemyBullets: Bullet[] = [];
  pickups: Pickup[] = [];
  boss: Boss | null = null;

  state: GameState = 'title';
  difficulty: Difficulty = settings.difficulty;
  loop = 1;
  muls: DifficultyMul = DIFFICULTY.normal;

  score = 0;
  best = 0;
  hp = 5;
  bombs = 2;
  chain = 0;
  chainTimer = 0;
  gameTime = 0;
  debugInvincible = false;
  readonly debug: boolean;

  private timed: Record<TimedPower, number> = { shield: 0, spread: 0, speed: 0, multi: 0, laser: 0 };
  private timers: Timer[] = [];
  private timeScale = 1;
  private hitstop = 0;
  private flashColor = '#ffffff';
  private flashAlpha = 0;
  private bombWave = 0;
  private nextExtend = 0;
  private stats = { kills: 0, maxChain: 0, grazes: 0, bombsUsed: 0, hitsTaken: 0, startedAt: 0 };
  private autofireToggle = false;
  private resultSent = false;

  constructor(canvas: HTMLCanvasElement, readonly input: Input, readonly audio: AudioSystem, readonly events: GameEvents) {
    this.renderer = new Renderer(canvas);
    this.hud = new Hud(this);
    this.player = new Player(this);
    this.director = new Director(this);
    this.debug = new URLSearchParams(location.search).has('debug');
    this.player.alive = false;
    this.input.enabled = false;
  }

  get maxHp(): number { return this.muls.maxHp; }
  get chainMul(): number { return Math.min(CHAIN.maxMul, 1 + Math.floor(this.chain / CHAIN.perStep)); }
  timeLeft(k: TimedPower): number { return Math.max(0, this.timed[k] - this.gameTime); }

  wantsFire(): boolean {
    return this.autofireOn() || this.input.held('fire');
  }

  autofireOn(): boolean {
    const i = this.input;
    const mode = settings.autofire;
    const auto = mode === 'on' || (mode === 'auto' && (i.usingTouch || i.usingPad));
    return auto !== this.autofireToggle;
  }

  // ── run lifecycle ─────────────────────────────────────────────────────────

  newRun(difficulty: Difficulty, loop = 1, keepScore = false): void {
    this.difficulty = difficulty;
    this.loop = loop;
    this.muls = loopScaled(DIFFICULTY[difficulty], loop);
    if (!keepScore) {
      this.score = 0;
      this.stats = { kills: 0, maxChain: 0, grazes: 0, bombsUsed: 0, hitsTaken: 0, startedAt: 0 };
      this.nextExtend = 50000;
      this.player.reset();
      this.hp = this.maxHp;
      this.bombs = this.muls.startBombs;
    } else {
      const keptPower = this.player.power;
      this.player.reset();
      this.player.power = keptPower;
      this.hp = Math.min(this.maxHp, this.hp + 2);
      this.bombs = Math.max(this.bombs, this.muls.startBombs);
    }
    this.best = bestScore(difficulty);
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.boss = null;
    this.timers = [];
    this.timed = { shield: 0, spread: 0, speed: 0, multi: 0, laser: 0 };
    this.chain = 0;
    this.chainTimer = 0;
    this.gameTime = 0;
    this.timeScale = 1;
    this.hitstop = 0;
    this.flashAlpha = 0;
    this.resultSent = false;
    this.fx.clear();
    this.hud.reset();
    this.hud.hintT = loop === 1 ? 420 : 0;
    this.director = new Director(this);
    this.director.start();
    if (this.debug) {
      const skip = new URLSearchParams(location.search).get('skip');
      if (skip === 'boss') this.director.skipToBoss();
    }
    this.audio.music('normal', 600);
    this.setState('playing');
  }

  setState(s: GameState): void {
    if (this.state === s) return;
    this.state = s;
    this.input.enabled = s === 'playing';
    this.audio.setDucked(s === 'paused' || s === 'title');
    this.events.onStateChange(s);
  }

  pause(): void { if (this.state === 'playing') this.setState('paused'); }
  resume(): void {
    if (this.state !== 'paused') return;
    this.input.clear();
    this.setState('playing');
  }

  toTitle(): void {
    this.enemies = [];
    this.enemyBullets = [];
    this.playerBullets = [];
    this.pickups = [];
    this.boss = null;
    this.timers = [];
    this.player.alive = false;
    this.fx.clear();
    this.background.setTheme('husk');
    this.background.setWarp(1);
    this.timeScale = 1;
    this.audio.music('normal', 800);
    this.setState('title');
  }

  after(frames: number, fn: () => void): void {
    this.timers.push({ at: this.gameTime + frames, fn });
  }

  // ── spawning ──────────────────────────────────────────────────────────────

  spawnEnemy(kind: EnemyKind, opts: EnemyOptions): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.enemies.push(new Enemy(this, kind, opts));
  }

  spawnBoss(): void {
    this.boss = new Boss(this);
    this.audio.music('boss', 400);
    this.audio.play('bossRoar');
    this.shake.add(0.6);
  }

  private dropFrom(e: Enemy): void {
    if (e.elite) {
      const kind: PickupKind = this.player.power < PLAYER.maxPower ? 'power' : (Math.random() < 0.5 ? 'bomb' : 'life');
      this.pickups.push(new Pickup(this, kind, e.x, e.y));
      this.gemBurst(e.x, e.y, 12);
      return;
    }
    if (Math.random() > this.muls.dropRate) return;
    const total = DROP_TABLE.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    let kind: PickupKind = 'coin';
    for (const [k, w] of DROP_TABLE) {
      roll -= w;
      if (roll <= 0) { kind = k; break; }
    }
    if (kind === 'power' && this.player.power >= PLAYER.maxPower) kind = 'coin';
    if (kind === 'life' && this.hp >= this.maxHp) kind = 'shield';
    this.pickups.push(new Pickup(this, kind, e.x, e.y));
  }

  private gemBurst(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      this.pickups.push(new Pickup(this, 'gem', x, y, Math.cos(a) * sp, Math.sin(a) * sp));
    }
  }

  // ── scoring ───────────────────────────────────────────────────────────────

  addScore(base: number, x?: number, y?: number, useChain = true): number {
    const pts = Math.round(base * (useChain ? this.chainMul : 1));
    this.score += pts;
    if (x !== undefined && y !== undefined) {
      const mul = useChain && this.chainMul > 1 ? ` ×${this.chainMul}` : '';
      this.fx.popup(x, y - 20, `${pts}${mul}`, this.chainMul >= 4 ? COLORS.gold : COLORS.bone, this.chainMul >= 4 ? 20 : 16);
    }
    if (this.score >= this.nextExtend) {
      this.nextExtend += 100000;
      if (this.hp < this.maxHp) {
        this.hp++;
        this.fx.popup(this.player.x, this.player.y - 50, 'EXTEND +1 HULL', COLORS.toxic, 20);
      } else {
        this.bombs = Math.min(PLAYER.maxBombs, this.bombs + 1);
        this.fx.popup(this.player.x, this.player.y - 50, 'EXTEND +1 BOMB', COLORS.toxic, 20);
      }
      this.audio.synth('extend');
    }
    return pts;
  }

  private bumpChain(): void {
    this.chain++;
    this.chainTimer = CHAIN.window;
    this.stats.maxChain = Math.max(this.stats.maxChain, this.chain);
    if (this.chain % CHAIN.perStep === 0 && this.chainMul <= CHAIN.maxMul) {
      this.audio.synth('chain');
      this.fx.popup(this.player.x + 40, this.player.y - 40, `CHAIN ×${this.chainMul}`, COLORS.magenta, 18);
    }
  }

  // ── combat events (called from Collision) ─────────────────────────────────

  hitEnemy(e: Enemy, dmg: number, hx: number, hy: number): void {
    const killed = e.damage(dmg);
    if (!killed) {
      this.fx.spark(hx, hy);
      this.fx.emit(hx, hy, { count: 4, speed: [1.5, 4], life: [8, 14], size: [2, 4], color: '#ffffaa' });
      this.audio.play('hit', { volume: 0.5, rate: 1 + Math.random() * 0.2 });
      return;
    }
    this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    this.stats.kills++;
    this.bumpChain();
    this.addScore(e.score, e.x, e.y);
    this.dropFrom(e);
    const big = e.elite;
    this.fx.emit(e.x, e.y, { count: big ? 70 : 34, speed: [2, big ? 11 : 8], life: [16, 36], size: [3, 7], color: '#ff9966' });
    this.fx.emit(e.x, e.y, { count: big ? 30 : 16, speed: [4, 11], life: [10, 20], size: [2, 4], color: e.sparkColor });
    this.fx.explosion(e.x, e.y, big ? 2.6 : 1.4);
    if (big) {
      this.fx.ring(e.x, e.y, '#ff6b6b', 16, 30, 12);
      this.hitstop = 5;
      this.flash('#ffffff', 0.25);
    }
    this.shake.add(big ? 0.5 : 0.2);
    this.audio.play('explode', { volume: big ? 1 : 0.7, rate: 0.9 + Math.random() * 0.25 });
  }

  hitBoss(dmg: number, hx: number, hy: number): void {
    const boss = this.boss;
    if (!boss) return;
    const res = boss.damage(dmg);
    if (res === 'none') {
      this.fx.spark(hx, hy);
      return;
    }
    if (res === 'hit') {
      this.fx.emit(hx, hy, { count: 5, speed: [1.5, 5], life: [8, 16], size: [2, 5], color: '#ffaaaa' });
      this.audio.play('hit', { volume: 0.45, rate: 0.8 + Math.random() * 0.2 });
      this.score += 10;
      return;
    }
    if (res === 'dead') this.onBossDeath(boss);
  }

  onBossPhase(x: number, y: number): void {
    this.fx.emit(x, y, { count: 120, speed: [3, 14], life: [16, 36], size: [3, 8], color: '#ffe066' });
    this.fx.explosion(x, y, 3);
    this.fx.ring(x, y, '#ffe066', 20, 40, 16);
    this.fx.ring(x, y, '#e85dc9', 12, 50, 8);
    this.flash('#ffffff', 0.5);
    this.shake.add(0.7);
    this.hitstop = 8;
    this.audio.play('bossPhase');
    this.addScore(2000, x, y - 60, false);
    this.cancelBullets(true);
  }

  private onBossDeath(boss: Boss): void {
    const bx = boss.x, by = boss.y;
    this.cancelBullets(true);
    this.addScore(SCORE.bossKill, bx, by, false);
    this.audio.play('bossExplode');
    this.flash('#ffffff', 0.8);
    this.shake.add(1);
    this.hitstop = 12;
    this.timeScale = 0.3;
    this.audio.music(null, 1500);
    this.player.invuln = 99999;
    this.setState('victory');

    const debris = (dx: number, dy: number, scale: number) => {
      this.fx.emit(bx + dx, by + dy, { count: 50, speed: [3, 11], life: [18, 36], size: [3, 7], color: '#ff9966' });
      this.fx.explosion(bx + dx, by + dy, scale);
      this.shake.add(0.4);
      this.audio.play('explode', { rate: 0.7 });
    };
    [[-90, 50, 2.2], [110, -40, 2.4], [-30, 90, 2], [80, 80, 2.2], [-110, -60, 2.4], [30, -110, 2]].forEach(([dx, dy, s], i) => {
      this.after(8 + i * 9, () => debris(dx!, dy!, s!));
    });
    this.after(70, () => {
      this.fx.emit(bx, by, { count: 300, speed: [4, 18], life: [30, 60], size: [3, 10], color: '#ffe066' });
      this.fx.emit(bx, by, { count: 140, speed: [2, 9], life: [40, 80], size: [4, 9], color: '#ff9966' });
      this.fx.explosion(bx, by, 6, 50);
      this.fx.ring(bx, by, '#ffffff', 26, 50, 22);
      this.fx.ring(bx, by, '#ffe066', 18, 60, 12);
      this.flash('#ffffff', 1);
      this.shake.add(1.6);
      this.audio.play('bossExplode');
      boss.dead = true;
      this.boss = null;
      this.timeScale = 1;
    });
    this.after(150, () => {
      this.audio.music('victory', 300);
      this.background.setTheme('dawn');
      this.background.setWarp(3);
      this.finish(true);
    });
  }

  private cancelBullets(toGems: boolean): void {
    for (const b of this.enemyBullets) {
      if (b.dead) continue;
      b.dead = true;
      if (toGems) this.pickups.push(new Pickup(this, 'gem', b.x, b.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
      else this.fx.emit(b.x, b.y, { count: 3, speed: [1, 3], life: [8, 14], size: [2, 4], color: '#ffe066' });
    }
  }

  graze(b: Bullet): void {
    this.stats.grazes++;
    this.addScore(SCORE.graze, undefined, undefined, true);
    this.chainTimer = Math.max(this.chainTimer, CHAIN.window * 0.5);
    this.fx.emit(b.x, b.y, { count: 3, speed: [2, 5], life: [6, 12], size: [2, 3], color: '#ffffff' });
    this.audio.synth('graze');
  }

  collect(p: Pickup): void {
    const x = this.player.x, y = this.player.y;
    switch (p.kind) {
      case 'gem':
        this.addScore(SCORE.gem, undefined, undefined, true);
        this.audio.synth('graze');
        return;
      case 'power':
        if (this.player.power < PLAYER.maxPower) {
          this.player.power++;
          this.audio.synth('power');
          this.fx.popup(x, y - 40, this.player.power === PLAYER.maxPower ? 'MAX POWER' : `POWER ${this.player.power}`, COLORS.orange, 20);
        } else {
          this.addScore(1000, x, y - 40, false);
        }
        break;
      case 'shield': case 'spread': case 'speed': case 'multi': case 'laser':
        this.timed[p.kind] = this.gameTime + POWERUP_FRAMES[p.kind];
        this.fx.popup(x, y - 40, PICKUP_LABEL[p.kind], COLORS.ice, 18);
        this.audio.synth('power');
        break;
      case 'life':
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this.fx.popup(x, y - 40, PICKUP_LABEL.life, COLORS.toxic, 18);
        this.audio.synth('extend');
        break;
      case 'bomb':
        if (this.bombs < PLAYER.maxBombs) {
          this.bombs++;
          this.fx.popup(x, y - 40, PICKUP_LABEL.bomb, COLORS.gold, 18);
        } else {
          this.addScore(1000, x, y - 40, false);
        }
        this.audio.synth('pickup');
        break;
      case 'coin':
        this.addScore(SCORE.coin, x, y - 40, false);
        this.audio.synth('pickup');
        break;
    }
    this.fx.emit(x, y, { count: 18, speed: [2, 6], life: [10, 22], size: [3, 6], color: '#ffe066' });
  }

  useBomb(): void {
    if (this.bombs <= 0 || !this.player.alive || this.state !== 'playing') return;
    this.bombs--;
    this.stats.bombsUsed++;
    const px = this.player.x, py = this.player.y;
    this.player.invuln = Math.max(this.player.invuln, 150);
    this.cancelBullets(true);
    this.bombWave = 40;
    this.fx.ring(px, py, '#ffe066', 34, 45, 26);
    this.fx.ring(px, py, '#ffffff', 24, 35, 12);
    this.fx.emit(px, py, { count: 120, speed: [5, 20], life: [20, 45], size: [3, 8], color: '#ffe066' });
    this.flash('#ffe066', 0.55);
    this.shake.add(0.8);
    this.audio.synth('bomb');
    this.audio.play('explode', { rate: 0.6 });
    for (const e of this.enemies) if (!e.dead) this.hitEnemy(e, 6, e.x, e.y);
    if (this.boss) this.hitBoss(8, this.boss.x, this.boss.y);
  }

  hurtPlayer(): void {
    const p = this.player;
    if (p.invulnerable || !p.alive || this.state !== 'playing') return;
    this.hp--;
    this.stats.hitsTaken++;
    p.takeHit();
    if (this.chain > 0) this.fx.popup(p.x, p.y - 60, 'CHAIN BROKEN', COLORS.red, 16);
    this.chain = 0;
    this.chainTimer = 0;
    if (p.power > 1) {
      p.power--;
      // Throw the lost power level back out so it can be recovered.
      this.pickups.push(new Pickup(this, 'power', p.x + 60, p.y - 30, 3, -2));
    }
    // Mercy clear: nearby bullets vanish so one mistake doesn't cascade.
    for (const b of this.enemyBullets) {
      if (!b.dead && Math.hypot(b.x - p.x, b.y - p.y) < PLAYER.mercyRadius) {
        b.dead = true;
        this.fx.emit(b.x, b.y, { count: 2, speed: [1, 3], life: [6, 12], size: [2, 3], color: '#ff6b6b' });
      }
    }
    this.fx.emit(p.x, p.y, { count: 40, speed: [3, 9], life: [14, 28], size: [3, 6], color: '#ff6b6b' });
    this.flash('#ff3b3b', 0.35);
    this.shake.add(0.55);
    this.hitstop = 6;
    this.audio.play('damage');
    if (this.hp <= 0) this.playerDeath();
  }

  private playerDeath(): void {
    const p = this.player;
    p.alive = false;
    this.fx.emit(p.x, p.y, { count: 140, speed: [3, 14], life: [22, 50], size: [3, 8], color: '#ff9966' });
    this.fx.emit(p.x, p.y, { count: 60, speed: [2, 8], life: [30, 60], size: [3, 6], color: '#5dd9e8' });
    this.fx.explosion(p.x, p.y, 2.4, 40);
    this.fx.ring(p.x, p.y, '#5dd9e8', 18, 40, 14);
    this.shake.add(1);
    this.hitstop = 10;
    this.timeScale = 0.4;
    this.audio.music(null, 1200);
    this.audio.play('bossExplode', { volume: 0.7, rate: 1.2 });
    this.setState('over');
    this.after(45, () => { this.timeScale = 1; });
    this.after(80, () => this.finish(false));
  }

  onSectorClear(sector: number): void {
    const bonus = 2000 * (sector + 1) * this.loop;
    this.addScore(bonus, undefined, undefined, false);
    this.hud.banner('SECTOR CLEAR', `+${bonus.toLocaleString()}`, 'hull integrity holding', COLORS.gold, 150);
    this.background.setWarp(3);
    this.audio.synth('extend');
  }

  private finish(won: boolean): void {
    if (this.resultSent) return;
    this.resultSent = true;
    const bonuses: Array<[string, number]> = [];
    if (won) {
      const hpBonus = this.hp * SCORE.bossHpBonus * this.loop;
      const bombBonus = this.bombs * SCORE.bombBonus * this.loop;
      if (hpBonus) bonuses.push(['Hull bonus', hpBonus]);
      if (bombBonus) bonuses.push(['Bomb bonus', bombBonus]);
      if (this.stats.hitsTaken === 0) bonuses.push(['No-miss bonus', 20000 * this.loop]);
      for (const [, v] of bonuses) this.score += v;
    }
    const rank = this.computeRank(won);
    const place = recordScore(this.difficulty, {
      score: this.score, rank, won, loop: this.loop, date: new Date().toISOString().slice(0, 10),
    });
    const prevBest = this.best;
    this.best = bestScore(this.difficulty);
    this.events.onResult({
      won,
      score: this.score,
      best: Math.max(prevBest, this.score),
      place,
      difficulty: this.difficulty,
      loop: this.loop,
      rank,
      seconds: Math.round(this.gameTime / 60),
      kills: this.stats.kills,
      maxChain: this.stats.maxChain,
      grazes: this.stats.grazes,
      bombsUsed: this.stats.bombsUsed,
      hitsTaken: this.stats.hitsTaken,
      bonuses,
    });
  }

  private computeRank(won: boolean): string {
    const progress = won ? 50 : (this.director.sector / 3) * 30 + (this.boss ? 10 : 0);
    const hull = won ? 25 * (this.hp / this.maxHp) : 0;
    const chain = Math.min(15, this.stats.maxChain / 4);
    const graze = Math.min(10, this.stats.grazes / 25);
    const pts = progress + hull + chain + graze;
    return pts >= 92 ? 'S' : pts >= 78 ? 'A' : pts >= 60 ? 'B' : pts >= 40 ? 'C' : 'D';
  }

  flash(color: string, alpha: number): void {
    const a = settings.flashes ? alpha : alpha * 0.25;
    if (a >= this.flashAlpha) { this.flashColor = color; this.flashAlpha = a; }
  }

  // ── main loop ─────────────────────────────────────────────────────────────

  /** One rendered frame; `frames` is elapsed time in 60 Hz frames. */
  frame(frames: number): void {
    const input = this.input;
    input.poll();

    if (input.pressed('mute')) this.audio.toggleMute();
    if (this.state === 'playing') {
      if (input.pressed('pause')) { this.pause(); input.endFrame(); return; }
      if (input.pressed('autofire')) {
        this.autofireToggle = !this.autofireToggle;
        this.fx.popup(this.player.x, this.player.y - 50, this.autofireOn() ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF', COLORS.ice, 16);
      }
      if (input.pressed('bomb')) this.useBomb();
      const [dx, dy] = input.takeDrag();
      if (dx || dy) {
        const k = PLAYER.touchSensitivity / this.renderer.cssScale;
        this.player.applyDrag(dx * k, dy * k);
      }
      if (this.debug) this.debugKeys();
    } else {
      input.takeDrag();
    }

    if (this.state !== 'paused') {
      let left = Math.min(frames, 4);
      while (left > 0) {
        const step = Math.min(1, left);
        this.step(step);
        left -= step;
      }
    }
    input.endFrame();
  }

  /** ?debug only: 1 invincible · 2 skip sector · 3 skip to boss · 4 max power. */
  private debugKeys(): void {
    const k = (code: string) => this.input.consumeKey(code);
    if (k('Digit1')) this.debugInvincible = !this.debugInvincible;
    if (k('Digit2')) this.director.skipSector();
    if (k('Digit3')) this.director.skipToBoss();
    if (k('Digit4')) { this.player.power = PLAYER.maxPower; this.bombs = PLAYER.maxBombs; }
  }

  private step(realDt: number): void {
    // Effects run on real time (so hitstop still animates sparks); the world on scaled time.
    this.shake.update(realDt, settings.shake);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.045 * realDt);
    this.hud.update(realDt);

    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return;
    }
    const dt = realDt * this.timeScale;
    this.background.update(dt);
    this.fx.update(dt);

    if (this.state === 'title' || this.state === 'paused') return;

    this.gameTime += dt;
    for (let i = 0; i < this.timers.length;) {
      const tm = this.timers[i]!;
      if (tm.at <= this.gameTime) {
        this.timers.splice(i, 1);
        tm.fn();
      } else i++;
    }

    if (this.state === 'playing') this.director.update(dt);
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) this.chain = 0;
    }

    this.player.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.boss?.update(dt);
    for (const b of this.playerBullets) b.update(dt);
    for (const b of this.enemyBullets) b.update(dt);
    for (const p of this.pickups) p.update(dt);

    if (this.bombWave > 0) {
      this.bombWave -= dt;
      for (const b of this.enemyBullets) b.dead = true;
    }

    if (this.state === 'playing') collide(this);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.playerBullets = this.playerBullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  render(fps: number | null, glowOnEnemies: boolean): void {
    const r = this.renderer;
    const ctx = r.ctx;
    r.setCamera(this.shake.x, this.shake.y);
    this.background.draw(r);

    // Solid pass.
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.pickups) p.draw(r);
    for (const e of this.enemies) e.draw(r);
    this.boss?.draw(r);
    this.player.draw(r);

    // Additive pass: bloom, bullets, particles.
    r.additive(true);
    for (const p of this.pickups) p.drawGlow(r);
    if (glowOnEnemies) for (const e of this.enemies) e.drawGlow(r, 0.5);
    else for (const e of this.enemies) if (e.elite) e.drawGlow(r, 0.4);
    this.boss?.drawGlow(r);
    this.player.drawGlow(r);
    for (const b of this.playerBullets) { b.drawGlow(r, 0.7); b.draw(r); }
    this.fx.drawAdditive(r);
    for (const b of this.enemyBullets) b.drawGlow(r, 0.8);
    r.additive(false);

    // Enemy bullets on top of everything so they're always readable.
    for (const b of this.enemyBullets) b.draw(r);
    this.player.drawCore(r, this.input.usingTouch);
    this.fx.drawPopups(r);

    r.post(settings.scanlines);
    r.flash(this.flashColor, this.flashAlpha);
    if (this.state !== 'title') this.hud.draw(r, fps);
    ctx.globalAlpha = 1;
  }
}
