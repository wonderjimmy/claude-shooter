// All gameplay units are "frames at 60 fps": dt = 1 is one 60 Hz tick.

export const STAGE = {
  width: 1280,
  height: 720,
} as const;

export const PLAYER = {
  speed: 6,
  focusMul: 0.45,
  touchSensitivity: 1.3,
  fireInterval: 7.5,
  startX: 170,
  startY: STAGE.height / 2,
  hitRadius: 6,
  bodyRadius: 16,
  pickupRadius: 38,
  grazeRadius: 34,
  iFrames: 120,
  mercyRadius: 170,
  maxBombs: 5,
  maxPower: 4,
} as const;

export const BULLET = {
  speed: 15,
} as const;

export const CHAIN = {
  window: 150,
  perStep: 8,
  maxMul: 8,
} as const;

export const SCORE = {
  graze: 20,
  gem: 50,
  coin: 500,
  bossKill: 5000,
  bossHpBonus: 1000,
  bombBonus: 500,
} as const;

export const POWERUP_FRAMES = {
  shield: 540,
  spread: 900,
  speed: 900,
  multi: 900,
  laser: 900,
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyMul {
  label: string;
  enemyHp: number;
  enemySpeed: number;
  enemyFire: number;
  bulletSpeed: number;
  bossHp: number;
  bossFire: number;
  dropRate: number;
  maxHp: number;
  startBombs: number;
  waveGap: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyMul> = {
  easy:   { label: 'EASY',   enemyHp: 0.8, enemySpeed: 0.9,  enemyFire: 1.5,  bulletSpeed: 0.82, bossHp: 0.75, bossFire: 1.4,  dropRate: 0.24, maxHp: 7, startBombs: 3, waveGap: 1.15 },
  normal: { label: 'NORMAL', enemyHp: 1.0, enemySpeed: 1.0,  enemyFire: 1.0,  bulletSpeed: 1.0,  bossHp: 1.0,  bossFire: 1.0,  dropRate: 0.16, maxHp: 5, startBombs: 2, waveGap: 1.0 },
  hard:   { label: 'HARD',   enemyHp: 1.5, enemySpeed: 1.18, enemyFire: 0.7,  bulletSpeed: 1.12, bossHp: 1.4,  bossFire: 0.7,  dropRate: 0.11, maxHp: 4, startBombs: 1, waveGap: 0.85 },
};

/** Each loop after the first victory tightens the screws. */
export function loopScaled(base: DifficultyMul, loop: number): DifficultyMul {
  if (loop <= 1) return base;
  const k = loop - 1;
  return {
    ...base,
    enemyHp: base.enemyHp * (1 + 0.35 * k),
    enemySpeed: base.enemySpeed * (1 + 0.08 * k),
    enemyFire: base.enemyFire * Math.pow(0.82, k),
    bulletSpeed: base.bulletSpeed * (1 + 0.08 * k),
    bossHp: base.bossHp * (1 + 0.3 * k),
    bossFire: base.bossFire * Math.pow(0.85, k),
    waveGap: base.waveGap * Math.pow(0.9, k),
  };
}

export const COLORS = {
  void: '#04030a',
  bone: '#e6d8b8',
  boneDim: '#9a8866',
  sinew: '#a83232',
  cyan: '#5dd9e8',
  ice: '#9be7ff',
  magenta: '#e85dc9',
  orange: '#ff8a3d',
  toxic: '#a8e85d',
  gold: '#ffe066',
  red: '#ff6b6b',
} as const;
