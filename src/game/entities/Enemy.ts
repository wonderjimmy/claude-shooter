import { Sprite } from 'pixi.js';
import { Entity } from './Entity';
import { Bullet, type BulletSpec } from './Bullet';
import type { Game } from '../Game';
import { STAGE } from '../../config';
import { tex, type SpriteKey } from '../assets/sprites';

export type EnemyKind = 'cyborg' | 'brain' | 'wasp' | 'mantis' | 'crystal';

interface FireSpec {
  bullet: Omit<BulletSpec, 'side'>;
  speed: number;
  interval: number;
  pattern: 'aimed' | 'straight' | 'spread3' | 'shotgun5';
  initialDelay: number;
}

interface EnemySpec {
  sprite: SpriteKey;
  scale: number;
  radius: number;
  hp: number;
  speedX: number;
  weaveAmp: number;
  weaveFreq: number;
  rotate: number;
  fire?: FireSpec;
}

const SPECS: Record<EnemyKind, EnemySpec> = {
  cyborg: {
    sprite: 'enemyCyborg', scale: 0.55, radius: 28, hp: 3, speedX: -2.0,
    weaveAmp: 0, weaveFreq: 0, rotate: 0,
    fire: {
      bullet: { sprite: 'projBoneShard', scale: 0.35, radius: 4 },
      speed: 4.5, interval: 170, pattern: 'aimed', initialDelay: 100,
    },
  },
  brain: {
    sprite: 'enemyBrain', scale: 0.55, radius: 30, hp: 2, speedX: -1.6,
    weaveAmp: 90, weaveFreq: 0.04, rotate: 0.01,
    fire: {
      bullet: { sprite: 'projPsi', scale: 0.3, radius: 5 },
      speed: 3.2, interval: 180, pattern: 'spread3', initialDelay: 130,
    },
  },
  wasp: {
    sprite: 'enemyWasp', scale: 0.45, radius: 18, hp: 1, speedX: -3.8,
    weaveAmp: 40, weaveFreq: 0.10, rotate: 0,
    fire: {
      bullet: { sprite: 'projStinger', scale: 0.4, radius: 3, tint: 0xa8e85d },
      speed: 5.5, interval: 140, pattern: 'straight', initialDelay: 90,
    },
  },
  mantis: {
    sprite: 'enemyMantis', scale: 0.55, radius: 30, hp: 2, speedX: -2.6,
    weaveAmp: 20, weaveFreq: 0.06, rotate: 0,
    fire: {
      bullet: { sprite: 'projBlade', scale: 0.4, radius: 5 },
      speed: 4.0, interval: 150, pattern: 'aimed', initialDelay: 110,
    },
  },
  crystal: {
    sprite: 'enemyCrystal', scale: 0.55, radius: 28, hp: 4, speedX: -1.4,
    weaveAmp: 0, weaveFreq: 0, rotate: 0.02,
    fire: {
      bullet: { sprite: 'projSplinter', scale: 0.32, radius: 3 },
      speed: 3.6, interval: 220, pattern: 'shotgun5', initialDelay: 160,
    },
  },
};

export class Enemy extends Entity {
  radius: number;
  hp: number;
  readonly kind: EnemyKind;
  private spec: EnemySpec;
  private t = 0;
  private baseY: number;
  private sprite: Sprite;
  private flashTimer = 0;
  private fireTimer = 0;

  constructor(game: Game, kind: EnemyKind, y: number) {
    super(game);
    this.kind = kind;
    const base = SPECS[kind];
    const m = game.muls;
    this.spec = {
      ...base,
      speedX: base.speedX * m.enemySpeed,
      fire: base.fire ? { ...base.fire, interval: base.fire.interval * m.enemyFire } : undefined,
    };
    this.radius = this.spec.radius;
    this.hp = Math.ceil(base.hp * m.enemyHp);
    this.baseY = y;
    this.x = STAGE.width + 60;
    this.y = y;
    this.fireTimer = this.spec.fire?.initialDelay ?? 0;

    this.sprite = new Sprite(tex(this.spec.sprite));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(this.spec.scale);
    this.view.addChild(this.sprite);
  }

  override update(dt: number): void {
    this.t += dt;
    this.x += this.spec.speedX * dt;
    if (this.spec.weaveAmp > 0) {
      this.y = this.baseY + Math.sin(this.t * this.spec.weaveFreq) * this.spec.weaveAmp;
    }
    if (this.spec.rotate !== 0) {
      this.sprite.rotation += this.spec.rotate * dt;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.sprite.tint = 0xffffff;
    }

    const fire = this.spec.fire;
    if (fire && this.x < STAGE.width - 30 && this.x > 40) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = fire.interval;
        this.shoot(fire);
      }
    }

    if (this.x < -80) this.dead = true;
  }

  damage(amount: number): boolean {
    this.hp -= amount;
    this.sprite.tint = 0xffaaaa;
    this.flashTimer = 4;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  private shoot(fire: FireSpec): void {
    const player = this.game.player;
    const aim = (extraAngle = 0): { vx: number; vy: number } => {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const a = Math.atan2(dy, dx) + extraAngle;
      return { vx: Math.cos(a) * fire.speed, vy: Math.sin(a) * fire.speed };
    };
    const spawnBullet = (vx: number, vy: number) => {
      this.game.spawn(new Bullet(this.game, this.x, this.y, vx, vy, {
        side: 'enemy',
        ...fire.bullet,
      }));
    };

    switch (fire.pattern) {
      case 'straight':
        spawnBullet(-fire.speed, 0);
        break;
      case 'aimed': {
        const { vx, vy } = aim();
        spawnBullet(vx, vy);
        break;
      }
      case 'spread3': {
        for (const ofs of [-0.18, 0, 0.18]) {
          const { vx, vy } = aim(ofs);
          spawnBullet(vx, vy);
        }
        break;
      }
      case 'shotgun5': {
        for (const ofs of [-0.32, -0.16, 0, 0.16, 0.32]) {
          const { vx, vy } = aim(ofs);
          spawnBullet(vx, vy);
        }
        break;
      }
    }
  }
}
