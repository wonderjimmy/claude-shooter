export const STAGE = {
  width: 1280,
  height: 720,
  background: 0x0a0a1a,
} as const;

export const PLAYER = {
  speed: 6,
  fireRate: 8,
  startX: 160,
  startY: STAGE.height / 2,
} as const;

export const BULLET = {
  speed: 14,
  radius: 4,
} as const;
