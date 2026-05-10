import GUI from 'lil-gui';
import type { Game } from '../Game';

const STORAGE_KEY = 'claude-shooter:tuning';

interface TuningSnapshot {
  bloomStrength: number;
  chromaticBase: number;
  chromaticRadial: number;
  colorSaturation: number;
  colorBrightness: number;
  colorContrast: number;
  bgAlphas: number[];
  bgSpeeds: number[];
  bgScales: number[];
}

function snapshot(game: Game): TuningSnapshot {
  return {
    bloomStrength: game.bloomStrength,
    chromaticBase: game.chromaticBase,
    chromaticRadial: game.filters.chromatic.radial,
    colorSaturation: game.colorSaturation,
    colorBrightness: game.colorBrightness,
    colorContrast: game.colorContrast,
    bgAlphas: game.starfield.layers.map((l) => l.tile.alpha),
    bgSpeeds: game.starfield.layers.map((l) => l.speed),
    bgScales: game.starfield.layers.map((l) => {
      const ts = l.tile.tileScale as unknown as { x: number };
      return ts.x;
    }),
  };
}

function applySnapshot(game: Game, s: Partial<TuningSnapshot>): void {
  if (typeof s.bloomStrength === 'number') game.bloomStrength = s.bloomStrength;
  if (typeof s.chromaticBase === 'number') game.chromaticBase = s.chromaticBase;
  if (typeof s.chromaticRadial === 'number') game.filters.chromatic.radial = s.chromaticRadial;
  if (typeof s.colorSaturation === 'number') game.colorSaturation = s.colorSaturation;
  if (typeof s.colorBrightness === 'number') game.colorBrightness = s.colorBrightness;
  if (typeof s.colorContrast === 'number') game.colorContrast = s.colorContrast;
  game.applyColorGrading();
  game.starfield.layers.forEach((l, i) => {
    if (s.bgAlphas?.[i] !== undefined) l.tile.alpha = s.bgAlphas[i]!;
    if (s.bgSpeeds?.[i] !== undefined) l.speed = s.bgSpeeds[i]!;
    if (s.bgScales?.[i] !== undefined) l.tile.tileScale.set(s.bgScales[i]!);
  });
}

function loadSaved(game: Game): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applySnapshot(game, JSON.parse(raw) as Partial<TuningSnapshot>);
  } catch { /* corrupt or private mode */ }
}

function persist(game: Game): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(game)));
  } catch { /* private mode */ }
}

export function attachTuningPanel(game: Game): GUI {
  loadSaved(game);
  const factoryDefaults = snapshot(game);
  const gui = new GUI({ title: 'Visual tuning' });
  const onAnyChange = () => persist(game);

  const bloom = gui.addFolder('Bloom');
  bloom.add(game, 'bloomStrength', 0, 20, 0.1).name('strength').onChange(onAnyChange);

  const color = gui.addFolder('Color grade');
  const onColorChange = () => { game.applyColorGrading(); persist(game); };
  color.add(game, 'colorSaturation', 0, 2, 0.01).name('saturation').onChange(onColorChange);
  color.add(game, 'colorBrightness', 0.5, 2, 0.01).name('brightness').onChange(onColorChange);
  color.add(game, 'colorContrast', -0.5, 1, 0.01).name('contrast').onChange(onColorChange);

  const chroma = gui.addFolder('Chromatic Aberration');
  chroma.add(game, 'chromaticBase', 0, 12, 0.1).name('base strength').onChange(onAnyChange);
  chroma.add(game.filters.chromatic, 'radial', 0, 2, 0.05).onChange(onAnyChange);

  const audio = gui.addFolder('Audio');
  audio.add(game.audio, 'masterVolume', 0, 1, 0.01).name('master').onChange((v: number) => game.audio.setMasterVolume(v));
  audio.add(game.audio, 'bgmVolume', 0, 1, 0.01).name('bgm').onChange((v: number) => game.audio.setBgmVolume(v));
  audio.add(game.audio, 'sfxVolume', 0, 1, 0.01).name('sfx').onChange((v: number) => game.audio.setSfxVolume(v));
  audio.add({ mute: () => game.audio.toggleMute() }, 'mute').name('toggle mute (M)');

  const bg = gui.addFolder('Background');
  const labels = ['stars (far)', 'nebula (mid)', 'debris (near)'];
  game.starfield.layers.forEach((layer, i) => {
    const f = bg.addFolder(labels[i] ?? `layer ${i}`);
    f.add(layer.tile, 'alpha', 0, 1, 0.01).onChange(onAnyChange);
    f.add(layer, 'speed', 0, 3, 0.05).onChange(onAnyChange);
    f.add(layer.tile.tileScale, 'x', 0.3, 4, 0.05).name('tileScale').onChange((v: number) => {
      layer.tile.tileScale.set(v);
      persist(game);
    });
  });

  const actions = {
    reset: () => {
      applySnapshot(game, factoryDefaults);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
  };
  gui.add(actions, 'reset').name('↺ Reset to defaults');

  gui.close();
  return gui;
}
