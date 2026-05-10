import type { AudioManager } from './AudioManager';

// When Jimmy drops MP3s into assets/audio/, uncomment the matching block below
// and the file will be auto-registered. Vite resolves the import to a hashed URL.
//
// Naming convention:
//   bgm-normal.mp3   — main gameplay loop
//   bgm-boss.mp3     — boss fight loop
//   sfx-shoot.mp3    — player fires
//   sfx-hit.mp3      — bullet hits enemy
//   sfx-explode.mp3  — enemy dies
//   sfx-damage.mp3   — player takes damage
//   sfx-pickup.mp3   — power-up collected
//   sfx-boss-roar.mp3, sfx-boss-phase.mp3, …

import bgmNormalUrl     from '../../../assets/audio/bgm-normal.mp3';
import bgmBossUrl       from '../../../assets/audio/bgm-boss.mp3';
import bgmVictoryUrl    from '../../../assets/audio/bgm-victory.mp3';
import sfxShootUrl      from '../../../assets/audio/sfx-shoot.mp3';
import sfxHitUrl        from '../../../assets/audio/sfx-hit.mp3';
import sfxExplodeUrl    from '../../../assets/audio/sfx-explode.mp3';
import sfxDamageUrl     from '../../../assets/audio/sfx-damage.mp3';
import sfxBossRoarUrl    from '../../../assets/audio/sfx-boss-roar.mp3';
import sfxBossPhaseUrl   from '../../../assets/audio/sfx-boss-phase.mp3';
import sfxBossExplodeUrl from '../../../assets/audio/sfx-boss-explode.mp3';

export function registerAudio(audio: AudioManager): void {
  // BGM
  audio.registerBgm('normal', bgmNormalUrl);
  audio.registerBgm('boss',   bgmBossUrl);
  audio.registerBgm('victory', bgmVictoryUrl);

  // SFX (poolSize tuned per how many can overlap)
  audio.registerSfx('shoot',       sfxShootUrl,       8);
  audio.registerSfx('hit',         sfxHitUrl,         6);
  audio.registerSfx('explode',     sfxExplodeUrl,     4);
  audio.registerSfx('damage',      sfxDamageUrl,      2);
  audio.registerSfx('bossRoar',    sfxBossRoarUrl,    1);
  audio.registerSfx('bossPhase',   sfxBossPhaseUrl,   2);
  audio.registerSfx('bossExplode', sfxBossExplodeUrl, 1);
}
