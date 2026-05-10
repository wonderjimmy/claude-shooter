import { Assets, Texture } from 'pixi.js';

import shipUrl from '../../../assets/images/sprites/ship.svg';
import enemyCyborgUrl from '../../../assets/images/sprites/enemy-cyborg.svg';
import enemyBrainUrl from '../../../assets/images/sprites/enemy-brain.svg';
import enemyWaspUrl from '../../../assets/images/sprites/enemy-wasp.svg';
import enemyMantisUrl from '../../../assets/images/sprites/enemy-mantis.svg';
import enemyCrystalUrl from '../../../assets/images/sprites/enemy-crystal.svg';
import bossStage1Url from '../../../assets/images/sprites/boss-stage1.svg';
import bossStage2Url from '../../../assets/images/sprites/boss-stage2.svg';
import bossStage3Url from '../../../assets/images/sprites/boss-stage3.svg';
import projPulseUrl from '../../../assets/images/sprites/proj-pulse.svg';
import projChargeUrl from '../../../assets/images/sprites/proj-charge.svg';
import projBoneShardUrl from '../../../assets/images/sprites/proj-bone-shard.svg';
import projPsiUrl from '../../../assets/images/sprites/proj-psi.svg';
import projBladeUrl from '../../../assets/images/sprites/proj-blade.svg';
import projSplinterUrl from '../../../assets/images/sprites/proj-splinter.svg';
import projStingerUrl from '../../../assets/images/sprites/proj-stinger.svg';
import projBossUrl from '../../../assets/images/sprites/proj-boss.svg';
import puShieldUrl from '../../../assets/images/sprites/pu-shield.svg';
import puSpreadUrl from '../../../assets/images/sprites/pu-spread.svg';
import puSpeedUrl from '../../../assets/images/sprites/pu-speed.svg';
import puLifeUrl from '../../../assets/images/sprites/pu-life.svg';
import puBombUrl from '../../../assets/images/sprites/pu-bomb.svg';
import puMultiUrl from '../../../assets/images/sprites/pu-multi.svg';
import puLaserUrl from '../../../assets/images/sprites/pu-laser.svg';
import puCoinUrl from '../../../assets/images/sprites/pu-coin.svg';
import fxExplosionUrl from '../../../assets/images/sprites/fx-explosion.svg';
import fxHitUrl from '../../../assets/images/sprites/fx-hit.svg';
import bgStarsFarUrl from '../../../assets/images/sprites/bg-stars-far.svg';
import bgNebulaMidUrl from '../../../assets/images/sprites/bg-nebula-mid.svg';
import bgDebrisNearUrl from '../../../assets/images/sprites/bg-debris-near.svg';

export const SPRITE_URLS = {
  ship: shipUrl,
  enemyCyborg: enemyCyborgUrl,
  enemyBrain: enemyBrainUrl,
  enemyWasp: enemyWaspUrl,
  enemyMantis: enemyMantisUrl,
  enemyCrystal: enemyCrystalUrl,
  bossStage1: bossStage1Url,
  bossStage2: bossStage2Url,
  bossStage3: bossStage3Url,
  projPulse: projPulseUrl,
  projCharge: projChargeUrl,
  projBoneShard: projBoneShardUrl,
  projPsi: projPsiUrl,
  projBlade: projBladeUrl,
  projSplinter: projSplinterUrl,
  projStinger: projStingerUrl,
  projBoss: projBossUrl,
  puShield: puShieldUrl,
  puSpread: puSpreadUrl,
  puSpeed: puSpeedUrl,
  puLife: puLifeUrl,
  puBomb: puBombUrl,
  puMulti: puMultiUrl,
  puLaser: puLaserUrl,
  puCoin: puCoinUrl,
  fxExplosion: fxExplosionUrl,
  fxHit: fxHitUrl,
  bgStarsFar: bgStarsFarUrl,
  bgNebulaMid: bgNebulaMidUrl,
  bgDebrisNear: bgDebrisNearUrl,
} as const;

export type SpriteKey = keyof typeof SPRITE_URLS;

const cache = new Map<SpriteKey, Texture>();

export async function loadSprites(): Promise<void> {
  const records = (Object.entries(SPRITE_URLS) as Array<[SpriteKey, string]>).map(
    ([alias, src]) => ({ alias, src }),
  );
  Assets.add(records);
  const loaded = (await Assets.load(Object.keys(SPRITE_URLS))) as Record<SpriteKey, Texture>;
  for (const key of Object.keys(SPRITE_URLS) as SpriteKey[]) {
    cache.set(key, loaded[key]);
  }
}

export function tex(key: SpriteKey): Texture {
  const t = cache.get(key);
  if (!t) throw new Error(`Sprite not loaded: ${key}. Call loadSprites() first.`);
  return t;
}
