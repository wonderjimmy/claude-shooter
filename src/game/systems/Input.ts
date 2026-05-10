export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();

  constructor(target: Window | HTMLElement = window) {
    target.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (!this.keys.has(ev.code)) this.pressedThisFrame.add(ev.code);
      this.keys.add(ev.code);
      if (ev.code === 'Space') ev.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete((e as KeyboardEvent).code);
    });
    target.addEventListener('blur', () => this.keys.clear());
  }

  held(code: string): boolean { return this.keys.has(code); }
  pressed(code: string): boolean { return this.pressedThisFrame.has(code); }

  endFrame(): void { this.pressedThisFrame.clear(); }
}
