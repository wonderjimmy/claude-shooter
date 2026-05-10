import { Container, Graphics, Text } from 'pixi.js';
import { STAGE } from '../../config';

export class Hud {
  readonly view = new Container();
  private scoreText: Text;
  private hpBar: Graphics;
  private hpBg: Graphics;
  private bossBar: Graphics;
  private bossBg: Graphics;
  private bossLabel: Text;
  private gameOverText: Text;
  private winText: Text;
  private hintText: Text;
  private modeBadge: Text;

  private maxHp = 1;
  private hp = 1;
  private bossHp = 1;
  private bossMaxHp = 1;

  constructor() {
    this.scoreText = new Text({
      text: 'SCORE  0',
      style: {
        fill: 0x9be7ff,
        fontSize: 22,
        fontFamily: 'Menlo, "Courier New", monospace',
        fontWeight: '700',
        letterSpacing: 2,
        dropShadow: { color: 0x5dd9e8, blur: 6, distance: 0, alpha: 0.7 },
      },
    });
    this.scoreText.x = 24;
    this.scoreText.y = 18;

    this.hpBg = new Graphics();
    this.hpBar = new Graphics();
    this.hpBg.x = STAGE.width - 224;
    this.hpBg.y = 22;
    this.hpBar.x = STAGE.width - 224;
    this.hpBar.y = 22;

    this.bossBg = new Graphics();
    this.bossBar = new Graphics();
    this.bossBg.x = STAGE.width / 2 - 360;
    this.bossBg.y = STAGE.height - 48;
    this.bossBar.x = STAGE.width / 2 - 360;
    this.bossBar.y = STAGE.height - 48;
    this.bossBg.visible = false;
    this.bossBar.visible = false;

    this.bossLabel = new Text({
      text: 'CARRION IX',
      style: {
        fill: 0xff6b6b,
        fontSize: 16,
        fontFamily: 'Menlo, "Courier New", monospace',
        fontWeight: '900',
        letterSpacing: 4,
        dropShadow: { color: 0xff6b6b, blur: 6, distance: 0, alpha: 0.8 },
      },
    });
    this.bossLabel.x = STAGE.width / 2 - 360;
    this.bossLabel.y = STAGE.height - 70;
    this.bossLabel.visible = false;

    this.gameOverText = new Text({
      text: 'GAME OVER',
      style: {
        fill: 0xff6b6b,
        fontSize: 64,
        fontFamily: 'Menlo, "Courier New", monospace',
        fontWeight: '900',
        letterSpacing: 6,
        dropShadow: { color: 0xff6b6b, blur: 12, distance: 0, alpha: 0.9 },
      },
    });
    this.gameOverText.anchor.set(0.5);
    this.gameOverText.x = STAGE.width / 2;
    this.gameOverText.y = STAGE.height / 2 - 24;
    this.gameOverText.visible = false;

    this.winText = new Text({
      text: 'VICTORY',
      style: {
        fill: 0xffe066,
        fontSize: 80,
        fontFamily: 'Menlo, "Courier New", monospace',
        fontWeight: '900',
        letterSpacing: 10,
        dropShadow: { color: 0x5dd9e8, blur: 16, distance: 0, alpha: 0.9 },
      },
    });
    this.winText.anchor.set(0.5);
    this.winText.x = STAGE.width / 2;
    this.winText.y = STAGE.height / 2 - 24;
    this.winText.visible = false;

    this.hintText = new Text({
      text: 'press R to restart',
      style: {
        fill: 0xe6d8b8,
        fontSize: 18,
        fontFamily: 'Menlo, "Courier New", monospace',
        letterSpacing: 3,
      },
    });
    this.hintText.anchor.set(0.5);
    this.hintText.x = STAGE.width / 2;
    this.hintText.y = STAGE.height / 2 + 36;
    this.hintText.visible = false;

    this.modeBadge = new Text({
      text: 'NORMAL  [H]',
      style: {
        fill: 0x9be7ff,
        fontSize: 13,
        fontFamily: 'Menlo, "Courier New", monospace',
        fontWeight: '700',
        letterSpacing: 2,
      },
    });
    this.modeBadge.x = 24;
    this.modeBadge.y = STAGE.height - 30;
    this.modeBadge.alpha = 0.7;

    this.view.addChild(
      this.scoreText, this.hpBg, this.hpBar,
      this.bossBg, this.bossBar, this.bossLabel,
      this.modeBadge,
      this.gameOverText, this.winText, this.hintText,
    );
  }

  setDifficulty(d: 'normal' | 'hard'): void {
    if (d === 'hard') {
      this.modeBadge.text = 'HARD  [H]';
      this.modeBadge.style.fill = 0xff6b6b;
    } else {
      this.modeBadge.text = 'NORMAL  [H]';
      this.modeBadge.style.fill = 0x9be7ff;
    }
  }

  setScore(score: number): void {
    this.scoreText.text = `SCORE  ${score.toString().padStart(6, '0')}`;
  }

  setHp(hp: number, maxHp: number): void {
    this.hp = Math.max(0, hp);
    this.maxHp = Math.max(1, maxHp);
    this.redrawHp();
  }

  setBossHp(hp: number, maxHp: number): void {
    this.bossHp = Math.max(0, hp);
    this.bossMaxHp = Math.max(1, maxHp);
    this.redrawBossHp();
  }

  showBoss(visible: boolean): void {
    this.bossBg.visible = visible;
    this.bossBar.visible = visible;
    this.bossLabel.visible = visible;
  }

  showGameOver(visible: boolean): void {
    this.gameOverText.visible = visible;
    this.hintText.visible = visible || this.winText.visible;
  }

  showWin(visible: boolean): void {
    this.winText.visible = visible;
    this.winText.alpha = 1;
    this.winText.scale.set(1);
    this.hintText.visible = visible || this.gameOverText.visible;
    this.hintText.alpha = 1;
  }

  beginWinAnimation(): void {
    this.winText.alpha = 0;
    this.winText.scale.set(0.5);
    this.winText.visible = true;
    this.hintText.alpha = 0;
    this.hintText.visible = true;
  }

  tickWinAnimation(t: number): void {
    const eased = 1 - Math.pow(1 - Math.min(1, t), 3);
    this.winText.alpha = eased;
    this.winText.scale.set(0.5 + eased * 0.5);
    const hintT = Math.max(0, Math.min(1, (t - 0.7) / 0.3));
    this.hintText.alpha = hintT;
  }

  private redrawHp(): void {
    const w = 200;
    const h = 14;
    this.hpBg.clear();
    this.hpBg
      .rect(0, 0, w, h)
      .fill({ color: 0x1d1828, alpha: 0.7 })
      .stroke({ color: 0x5dd9e8, width: 1.5, alpha: 0.8 });

    const ratio = this.hp / this.maxHp;
    const fillW = w * ratio;
    const color = ratio > 0.5 ? 0x9be7ff : ratio > 0.25 ? 0xffe066 : 0xff6b6b;
    this.hpBar.clear();
    if (fillW > 0) {
      this.hpBar
        .rect(2, 2, Math.max(0, fillW - 4), h - 4)
        .fill({ color, alpha: 0.9 });
    }
  }

  private redrawBossHp(): void {
    const w = 720;
    const h = 16;
    this.bossBg.clear();
    this.bossBg
      .rect(0, 0, w, h)
      .fill({ color: 0x1d1828, alpha: 0.75 })
      .stroke({ color: 0xff6b6b, width: 2, alpha: 0.9 });

    const ratio = this.bossHp / this.bossMaxHp;
    const fillW = w * ratio;
    this.bossBar.clear();
    if (fillW > 0) {
      this.bossBar
        .rect(2, 2, Math.max(0, fillW - 4), h - 4)
        .fill({ color: 0xff6b6b, alpha: 0.92 });
    }
  }
}
