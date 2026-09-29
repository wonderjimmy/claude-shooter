// Unified input: keyboard, touch (relative drag, like most mobile shmups) and
// standard-mapping gamepads. The game only asks intent-level questions.

export type Action = 'fire' | 'bomb' | 'focus' | 'pause' | 'confirm' | 'mute' | 'autofire';

const KEYMAP: Record<string, Action> = {
  Space: 'fire', KeyJ: 'fire', KeyZ: 'fire',
  KeyK: 'bomb', KeyX: 'bomb',
  ShiftLeft: 'focus', ShiftRight: 'focus', KeyL: 'focus',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  KeyM: 'mute',
  KeyF: 'autofire',
};

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};

// Standard gamepad buttons.
const PAD: Record<number, Action> = {
  0: 'fire', 7: 'fire',
  1: 'bomb', 2: 'bomb',
  4: 'focus', 5: 'focus', 6: 'focus',
  9: 'pause', 8: 'pause',
};

export class Input {
  private keys = new Set<string>();
  private actionsHeld = new Set<Action>();
  private actionsPressed = new Set<Action>();
  private padPrev = new Set<Action>();

  /** Accumulated touch drag since last frame, in CSS pixels. */
  private dragX = 0;
  private dragY = 0;
  private touchPointer: number | null = null;
  private lastTX = 0;
  private lastTY = 0;

  /** True once the player has touched the screen — flips HUD & auto-fire defaults. */
  usingTouch = false;
  usingPad = false;
  /** When false, gameplay keys are ignored (menus have focus). */
  enabled = true;

  private padAxes: [number, number] = [0, 0];

  constructor(private touchSurface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (this.enabled && (MOVE_KEYS[e.code] || KEYMAP[e.code] === 'fire')) e.preventDefault();
        return;
      }
      this.usingTouch = false;
      this.usingPad = false;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) {
        this.actionsPressed.add(a);
        if (this.enabled) e.preventDefault();
      } else if (MOVE_KEYS[e.code] && this.enabled) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.clear());

    const surface = this.touchSurface;
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.usingTouch = true;
      if (this.touchPointer === null) {
        this.touchPointer = e.pointerId;
        this.lastTX = e.clientX;
        this.lastTY = e.clientY;
        try { surface.setPointerCapture(e.pointerId); } catch { /* */ }
      }
      e.preventDefault();
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchPointer) return;
      this.dragX += e.clientX - this.lastTX;
      this.dragY += e.clientY - this.lastTY;
      this.lastTX = e.clientX;
      this.lastTY = e.clientY;
      e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.touchPointer) this.touchPointer = null;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    // Stop iOS from scrolling / zooming the page while playing.
    surface.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  get touching(): boolean { return this.touchPointer !== null; }

  /** Called once per rendered frame (not per sim step). */
  poll(): void {
    this.actionsHeld.clear();
    for (const k of this.keys) {
      const a = KEYMAP[k];
      if (a) this.actionsHeld.add(a);
    }

    this.padAxes = [0, 0];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<Action>();
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      const dead = 0.2;
      let x = Math.abs(ax) > dead ? ax : 0;
      let y = Math.abs(ay) > dead ? ay : 0;
      if (p.buttons[14]?.pressed) x = -1;
      if (p.buttons[15]?.pressed) x = 1;
      if (p.buttons[12]?.pressed) y = -1;
      if (p.buttons[13]?.pressed) y = 1;
      if (x || y) { this.padAxes = [x, y]; }
      p.buttons.forEach((b, i) => {
        const a = PAD[i];
        if (a && b.pressed) now.add(a);
      });
      if (x || y || now.size) {
        this.usingPad = true;
        this.usingTouch = false;
      }
    }
    for (const a of now) {
      this.actionsHeld.add(a);
      if (!this.padPrev.has(a)) this.actionsPressed.add(a);
    }
    if (now.has('fire') && !this.padPrev.has('fire')) this.actionsPressed.add('confirm');
    this.padPrev = now;
  }

  /** Digital/analog direction in [-1,1]², length ≤ 1. */
  move(): [number, number] {
    let x = 0, y = 0;
    for (const k of this.keys) {
      const m = MOVE_KEYS[k];
      if (m) { x += m[0]; y += m[1]; }
    }
    x = Math.max(-1, Math.min(1, x + this.padAxes[0]));
    y = Math.max(-1, Math.min(1, y + this.padAxes[1]));
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return [x, y];
  }

  /** Consume accumulated touch drag (CSS px). */
  takeDrag(): [number, number] {
    const d: [number, number] = [this.dragX, this.dragY];
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  consumeKey(code: string): boolean { return this.keys.delete(code); }

  held(a: Action): boolean { return this.actionsHeld.has(a); }
  pressed(a: Action): boolean { return this.actionsPressed.has(a); }
  press(a: Action): void { this.actionsPressed.add(a); }

  endFrame(): void { this.actionsPressed.clear(); }

  clear(): void {
    this.keys.clear();
    this.actionsHeld.clear();
    this.touchPointer = null;
    this.dragX = this.dragY = 0;
  }
}
