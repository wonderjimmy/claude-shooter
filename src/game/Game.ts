import { Application, ColorMatrixFilter, Container } from 'pixi.js';
import { BloomFilter, ShockwaveFilter } from 'pixi-filters';
import { STAGE } from '../config';
import { Entity } from './entities/Entity';
import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { Boss } from './entities/Boss';
import { Bullet } from './entities/Bullet';
import { Pickup, POWERUP_POOL, type PowerUpKind } from './entities/Pickup';
import { Input } from './systems/Input';
import { ScreenShake } from './effects/ScreenShake';
import { Starfield } from './effects/Starfield';
import { Particles } from './effects/Particles';
import { ChromaticAberrationFilter } from './effects/ChromaticAberrationFilter';
import { spawnExplosion } from './effects/Explosion';
import { resolveCollisions } from './systems/Collision';
import { Spawner } from './systems/Spawner';
import { Hud } from './ui/Hud';
import { AudioManager } from './audio/AudioManager';
import { registerAudio } from './audio/manifest';

export interface FilterStack {
  bloom: BloomFilter;
  chromatic: ChromaticAberrationFilter;
  color: ColorMatrixFilter;
}

const SCORE_PER_KIND: Record<string, number> = {
  wasp: 100,
  cyborg: 150,
  brain: 200,
  mantis: 250,
  crystal: 300,
};

const PLAYER_MAX_HP = 5;
const BOSS_KILL_SCORE = 5000;

export type Difficulty = 'normal' | 'hard';

interface DifficultyMul {
  enemyHp: number;
  enemySpeed: number;
  enemyFire: number;
  bossHp: number;
  bossFire: number;
  dropRate: number;
  threshold: number;
}

const DIFFICULTY_MULS: Record<Difficulty, DifficultyMul> = {
  normal: { enemyHp: 1.0,  enemySpeed: 1.00, enemyFire: 1.00, bossHp: 1.0,  bossFire: 1.00, dropRate: 0.20, threshold: 7000 },
  hard:   { enemyHp: 1.5,  enemySpeed: 1.18, enemyFire: 0.70, bossHp: 1.4,  bossFire: 0.70, dropRate: 0.13, threshold: 9000 },
};

export class Game {
  readonly app: Application;
  readonly input = new Input();
  readonly shake = new ScreenShake();
  readonly audio = new AudioManager();

  readonly world = new Container();
  readonly layers = {
    bg: new Container(),
    entities: new Container(),
    fx: new Container(),
    ui: new Container(),
  };

  private entities: Entity[] = [];
  private pending: Entity[] = [];
  readonly starfield = new Starfield();
  private spawner!: Spawner;
  private chromaticPunch = 0;
  chromaticBase = 1.8;
  colorSaturation = 0.4;
  colorBrightness = 1.15;
  colorContrast = 0.15;

  get bloomStrength(): number {
    const s = this.filters.bloom.strength as unknown as { x: number } | number;
    return typeof s === 'number' ? s : s.x;
  }
  set bloomStrength(v: number) {
    this.filters.bloom.strength = v;
  }

  filters!: FilterStack;
  particles!: Particles;
  player!: Player;
  hud!: Hud;
  boss: Boss | null = null;

  private shockwaves: Array<{ filter: ShockwaveFilter; life: number; maxLife: number }> = [];
  private winTimers: number[] = [];
  private lastBossX = 0;
  private lastBossY = 0;

  score = 0;
  playerHp = PLAYER_MAX_HP;
  readonly playerMaxHp = PLAYER_MAX_HP;
  gameOver = false;
  won = false;
  private bossSpawned = false;

  gameTime = 0;
  difficulty: Difficulty = 'normal';
  shieldUntil = 0;
  spreadUntil = 0;
  speedUntil = 0;
  fireRateUntil = 0;
  laserUntil = 0;

  constructor(app: Application) {
    this.app = app;
    this.app.stage.addChild(this.world);
    this.world.addChild(this.layers.bg, this.layers.entities, this.layers.fx, this.layers.ui);
    this.layers.bg.addChild(this.starfield.view);
    registerAudio(this.audio);
    try {
      const raw = localStorage.getItem('claude-shooter:difficulty');
      if (raw === 'hard' || raw === 'normal') this.difficulty = raw;
    } catch { /* private mode */ }
  }

  get muls(): DifficultyMul { return DIFFICULTY_MULS[this.difficulty]; }

  toggleDifficulty(): void {
    this.difficulty = this.difficulty === 'normal' ? 'hard' : 'normal';
    try { localStorage.setItem('claude-shooter:difficulty', this.difficulty); } catch { /* */ }
    this.hud.setDifficulty(this.difficulty);
    this.restart();
  }

  start(): void {
    this.particles = new Particles(this.app.renderer);
    this.layers.fx.addChild(this.particles.view);

    const bloom = new BloomFilter({ strength: 5, quality: 1 });
    this.layers.entities.filters = [bloom];

    const chromatic = new ChromaticAberrationFilter(1.8, 1.0);
    const color = new ColorMatrixFilter();
    this.app.stage.filters = [chromatic, color];

    this.filters = { bloom, chromatic, color };
    this.applyColorGrading();

    this.player = new Player(this);
    this.spawn(this.player);
    this.spawner = new Spawner(this);

    this.hud = new Hud();
    this.layers.ui.addChild(this.hud.view);
    this.hud.setScore(this.score);
    this.hud.setHp(this.playerHp, this.playerMaxHp);
    this.hud.setDifficulty(this.difficulty);

    this.audio.playBgm('normal');

    this.app.ticker.add((ticker) => this.tick(ticker.deltaTime));
  }

  spawn(e: Entity): void {
    this.pending.push(e);
    this.layers.entities.addChild(e.view);
  }

  applyColorGrading(): void {
    const f = this.filters.color;
    f.reset();
    f.saturate(this.colorSaturation, true);
    f.brightness(this.colorBrightness, true);
    f.contrast(this.colorContrast, true);
  }

  onHit(x: number, y: number, killed: boolean, kind?: string): void {
    this.particles.emit(x, y, {
      count: killed ? 50 : 12,
      speed: killed ? [2, 9] : [1.5, 4],
      life: killed ? [18, 38] : [10, 18],
      size: killed ? [3, 7] : [2, 4],
      color: killed ? 0xff9966 : 0xffffaa,
      additive: true,
    });
    if (killed) {
      this.particles.emit(x, y, {
        count: 30,
        speed: [4, 11],
        life: [12, 22],
        size: [2, 4],
        color: 0xffe066,
        additive: true,
      });
      spawnExplosion(this, x, y, 1.4);
      this.shake.add(0.35);
      this.chromaticPunch = 12;
      this.audio.playSfx('explode');
      this.score += SCORE_PER_KIND[kind ?? ''] ?? 100;
      this.hud.setScore(this.score);
      this.maybeSpawnPickup(x, y);
    } else {
      this.shake.add(0.08);
      this.chromaticPunch = Math.max(this.chromaticPunch, 4);
      this.audio.playSfx('hit');
    }
  }

  onBossHit(x: number, y: number, killed: boolean): void {
    this.particles.emit(x, y, {
      count: killed ? 80 : 16,
      speed: killed ? [3, 14] : [1.5, 5],
      life: killed ? [22, 48] : [10, 20],
      size: killed ? [3, 8] : [2, 5],
      color: killed ? 0xff9966 : 0xffaaaa,
      additive: true,
    });
    this.shake.add(killed ? 1.0 : 0.1);
    this.chromaticPunch = Math.max(this.chromaticPunch, killed ? 18 : 4);
    if (killed) {
      this.audio.playSfx('bossExplode');
      spawnExplosion(this, x, y, 3.2);
      spawnExplosion(this, x - 60, y + 40, 2.0);
      spawnExplosion(this, x + 50, y - 30, 2.0);
      this.lastBossX = x;
      this.lastBossY = y;
      this.score += BOSS_KILL_SCORE;
      this.hud.setScore(this.score);
      this.triggerWin();
    } else {
      this.audio.playSfx('hit');
    }
    if (this.boss) this.hud.setBossHp(this.boss.totalHp, this.boss.totalMaxHp);
  }

  bossPhaseTransition(x: number, y: number): void {
    this.particles.emit(x, y, {
      count: 100,
      speed: [3, 14],
      life: [16, 36],
      size: [3, 8],
      color: 0xffe066,
      additive: true,
    });
    spawnExplosion(this, x, y, 2.4);
    this.chromaticPunch = 18;
    this.shake.add(0.6);
    this.audio.playSfx('bossPhase');
    this.spawnShockwave(x, y);
  }

  private spawnShockwave(x: number, y: number): void {
    const filter = new ShockwaveFilter({
      center: { x, y },
      amplitude: 50,
      wavelength: 220,
      brightness: 1.05,
      radius: -1,
      speed: 800,
      time: 0,
    });
    this.shockwaves.push({ filter, life: 90, maxLife: 90 });
    this.rebuildStageFilters();
  }

  private rebuildStageFilters(): void {
    this.app.stage.filters = [
      this.filters.chromatic,
      ...this.shockwaves.map((s) => s.filter),
      this.filters.color,
    ];
  }

  private maybeSpawnPickup(x: number, y: number): void {
    if (Math.random() > this.muls.dropRate) return;
    const kind = POWERUP_POOL[Math.floor(Math.random() * POWERUP_POOL.length)]!;
    this.spawn(new Pickup(this, kind, x, y));
  }

  applyPowerUp(kind: PowerUpKind): void {
    const T = (frames: number) => this.gameTime + frames;
    switch (kind) {
      case 'shield': this.shieldUntil = T(540); break;
      case 'spread': this.spreadUntil = T(900); break;
      case 'speed':  this.speedUntil  = T(900); break;
      case 'multi':  this.fireRateUntil = T(900); break;
      case 'laser':  this.laserUntil  = T(900); break;
      case 'life':
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
        this.hud.setHp(this.playerHp, this.playerMaxHp);
        break;
      case 'bomb':   this.bombClear(); break;
      case 'coin':
        this.score += 500;
        this.hud.setScore(this.score);
        break;
    }
    this.audio.playSfx('pickup');
    this.particles.emit(this.player.x, this.player.y, {
      count: 24,
      speed: [2, 6],
      life: [12, 24],
      size: [3, 6],
      color: 0xffe066,
      additive: true,
    });
  }

  private bombClear(): void {
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e instanceof Bullet && e.side === 'enemy') {
        this.particles.emit(e.x, e.y, {
          count: 6, speed: [1, 4], life: [8, 16], size: [2, 4],
          color: 0xffe066, additive: true,
        });
        e.destroy();
      } else if (e instanceof Enemy) {
        const killed = e.damage(2);
        this.onHit(e.x, e.y, killed, e.kind);
      }
    }
    if (this.boss && !this.boss.dead) {
      const killed = this.boss.damage(2);
      this.onBossHit(this.boss.x, this.boss.y, killed);
    }
    this.shake.add(0.7);
    this.chromaticPunch = 18;
  }

  onPlayerHit(_source: Enemy | null): void {
    if (this.gameOver || this.won) return;
    if (this.gameTime < this.shieldUntil) return;
    this.player.takeHit();
    this.playerHp -= 1;
    this.hud.setHp(this.playerHp, this.playerMaxHp);
    this.shake.add(0.45);
    this.chromaticPunch = Math.max(this.chromaticPunch, 14);
    this.audio.playSfx('damage');

    this.particles.emit(this.player.x, this.player.y, {
      count: 28,
      speed: [3, 8],
      life: [14, 26],
      size: [3, 6],
      color: 0xff6b6b,
      additive: true,
    });

    if (this.playerHp <= 0) this.triggerGameOver();
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    this.spawner.paused = true;

    for (const e of this.entities) {
      if (e instanceof Enemy && !e.dead) e.dead = true;
    }

    this.boss = new Boss(this);
    this.spawn(this.boss);
    this.hud.setBossHp(this.boss.totalHp, this.boss.totalMaxHp);
    this.hud.showBoss(true);
    this.audio.playBgm('boss');
    this.audio.playSfx('bossRoar');
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.player.dead = true;
    this.hud.showGameOver(true);
    this.hud.showBoss(false);
    this.audio.stopBgm(800);

    this.particles.emit(this.player.x, this.player.y, {
      count: 100,
      speed: [3, 13],
      life: [22, 45],
      size: [3, 8],
      color: 0xff9966,
      additive: true,
    });
    spawnExplosion(this, this.player.x, this.player.y, 2.0);
    this.shake.add(1.0);
    this.chromaticPunch = 20;
  }

  private triggerWin(): void {
    this.won = true;
    this.hud.showBoss(false);
    this.app.ticker.speed = 0.25;

    const aux = (delay: number, fn: () => void) => {
      this.winTimers.push(window.setTimeout(fn, delay));
    };
    const debris = (dx: number, dy: number, scale: number, count = 60) => {
      const x = this.lastBossX + dx;
      const y = this.lastBossY + dy;
      this.particles.emit(x, y, {
        count, speed: [3, 11], life: [18, 36], size: [3, 7],
        color: 0xff9966, additive: true,
      });
      spawnExplosion(this, x, y, scale);
      this.shake.add(0.4);
      this.chromaticPunch = Math.max(this.chromaticPunch, 14);
    };

    aux(400, () => debris(-90, 50, 2.2));
    aux(900, () => debris(110, -40, 2.4));
    aux(1500, () => debris(-30, 90, 2.0));
    aux(2100, () => debris(80, 80, 2.2));
    aux(2700, () => debris(-110, -60, 2.4));

    aux(3500, () => {
      this.particles.emit(this.lastBossX, this.lastBossY, {
        count: 320, speed: [4, 18], life: [30, 60], size: [3, 10],
        color: 0xffe066, additive: true,
      });
      this.particles.emit(this.lastBossX, this.lastBossY, {
        count: 160, speed: [2, 9], life: [40, 80], size: [4, 9],
        color: 0xff9966, additive: true,
      });
      spawnExplosion(this, this.lastBossX, this.lastBossY, 6.0);
      spawnExplosion(this, this.lastBossX - 80, this.lastBossY + 30, 3.0);
      spawnExplosion(this, this.lastBossX + 70, this.lastBossY - 40, 3.0);
      this.shake.add(1.6);
      this.chromaticPunch = 28;
      this.audio.playSfx('bossExplode');
      this.audio.stopBgm(1800);
      this.app.ticker.speed = 1.0;
    });

    aux(4400, () => {
      this.audio.playBgm('victory', { fadeMs: 400, loop: false });
      this.hud.beginWinAnimation();
      this.particles.emit(STAGE.width / 2, STAGE.height / 2, {
        count: 140, speed: [3, 10], life: [40, 80], size: [4, 8],
        color: 0xffe066, additive: true,
      });
      this.particles.emit(STAGE.width / 2, STAGE.height / 2, {
        count: 90, speed: [2, 7], life: [50, 100], size: [3, 6],
        color: 0x9be7ff, additive: true,
      });

      const start = performance.now();
      const handler = () => {
        const t = Math.min(1, (performance.now() - start) / 800);
        this.hud.tickWinAnimation(t);
        if (t < 1) this.app.ticker.addOnce(handler);
      };
      this.app.ticker.addOnce(handler);
    });
  }

  restart(): void {
    for (const id of this.winTimers) clearTimeout(id);
    this.winTimers = [];
    this.app.ticker.speed = 1.0;

    for (const e of this.entities) {
      if (e !== this.player && !e.dead) {
        e.dead = true;
        e.destroy();
      } else if (e !== this.player) {
        e.destroy();
      }
    }
    this.entities = [this.player];
    this.pending.length = 0;
    this.boss = null;

    this.player.reset();
    this.layers.entities.addChild(this.player.view);
    this.score = 0;
    this.playerHp = this.playerMaxHp;
    this.gameOver = false;
    this.won = false;
    this.bossSpawned = false;
    this.gameTime = 0;
    this.shieldUntil = 0;
    this.spreadUntil = 0;
    this.speedUntil = 0;
    this.fireRateUntil = 0;
    this.laserUntil = 0;
    if (this.shockwaves.length > 0) {
      this.shockwaves = [];
      this.rebuildStageFilters();
    }

    this.spawner = new Spawner(this);
    this.hud.setScore(this.score);
    this.hud.setHp(this.playerHp, this.playerMaxHp);
    this.hud.showGameOver(false);
    this.hud.showWin(false);
    this.hud.showBoss(false);

    this.audio.playBgm('normal');
  }

  private tick(dt: number): void {
    if (this.pending.length) {
      this.entities.push(...this.pending);
      this.pending.length = 0;
    }

    this.starfield.update(dt);
    this.particles.update(dt);

    if (this.chromaticPunch > 0) {
      this.chromaticPunch = Math.max(0, this.chromaticPunch - 0.6 * dt);
    }
    this.filters.chromatic.strength = this.chromaticBase + this.chromaticPunch;

    if (this.shockwaves.length > 0) {
      let alive = false;
      for (const s of this.shockwaves) {
        s.life -= dt;
        s.filter.time = (1 - s.life / s.maxLife) * 1.5;
        if (s.life > 0) alive = true;
      }
      if (!alive) {
        this.shockwaves = [];
        this.rebuildStageFilters();
      } else {
        this.shockwaves = this.shockwaves.filter((s) => s.life > 0);
      }
    }

    if (this.input.pressed('KeyM')) this.audio.toggleMute();
    if (this.input.pressed('KeyH')) this.toggleDifficulty();

    if (this.gameOver || this.won) {
      if (this.input.pressed('KeyR')) this.restart();
    } else {
      this.gameTime += dt;
      if (!this.bossSpawned && this.score >= this.muls.threshold) this.spawnBoss();
      this.spawner.update(dt);
      for (const e of this.entities) if (!e.dead) e.update(dt);
      resolveCollisions(this, this.entities);
    }

    let w = 0;
    for (let r = 0; r < this.entities.length; r++) {
      const e = this.entities[r]!;
      if (!e.dead) {
        this.entities[w++] = e;
      } else if (e !== this.player) {
        if (e === this.boss) this.boss = null;
        e.destroy();
      }
    }
    this.entities.length = w;

    this.shake.apply(this.world, dt);
    this.input.endFrame();
  }

  static async create(parent: HTMLElement): Promise<Game> {
    const app = new Application();
    await app.init({
      width: STAGE.width,
      height: STAGE.height,
      background: STAGE.background,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 1.25),
      autoDensity: true,
      preference: 'webgl',
    });
    parent.appendChild(app.canvas);

    app.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.error('[claude-shooter] WebGL context lost');
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;inset:0;padding:32px;background:#0a0a1a;color:#ff9aaa;font:14px/1.6 ui-monospace,Menlo,monospace;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;z-index:99999';
      div.innerHTML = '<div style="color:#ff9aaa;font-weight:700;font-size:20px;margin-bottom:16px;letter-spacing:2px">WEBGL LOST</div><div>The browser dropped the GPU context. Reload to retry.</div>';
      document.body.appendChild(div);
    });

    return new Game(app);
  }
}
