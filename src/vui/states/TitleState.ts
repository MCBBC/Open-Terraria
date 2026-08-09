// 主菜单标题页 —— 复刻 Main.DrawMenu（Main.cs:35045-38160）的可复刻部分：
//   logo 摆动缩放动画（35076-35107：rotation ±0.08 / scale 1.0~1.35 渐变）
//   纯文字按钮列（38102-38115 hover 心跳）+ 版本号左下描边（38127-38154）
// 背景不在此处：mainFlow 的 MenuBackground 画在游戏 canvas 上。
import { UIState } from '../core/UIState';
import { UIText } from '../elements/UIText';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { rgb } from '../draw/UISpriteBatch';
import { Lang } from '../../i18n/Lang';

export interface TitleFlow {
  onSinglePlayer(): void;
  onSettings(): void;
  onQuit(): void;
}

/** 原版风格纯文字菜单按钮（hover 金色心跳） */
class MenuTextButton extends UIText {
  pulse = 0;
  constructor(text: string, onClick: () => void) {
    super(text, 1);
    this.setTextColor(rgb(255, 255, 255));
    this.hAlign = 0.5;
    this.onClick(() => onClick());
  }

  protected drawSelf(batch: UISpriteBatch): void {
    // hover 时金色 + 心跳脉冲（原版 mouseTextColor 语义）
    if (this.isMouseHovering) {
      this.pulse = Math.min(1, this.pulse + 0.08);
    } else {
      this.pulse = Math.max(0, this.pulse - 0.08);
    }
    const beat = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    const hot = this.pulse;
    const c: Color = {
      r: Math.round(255 * (1 - hot) + (255) * hot),
      g: Math.round(255 * (1 - hot) + (200 + 30 * beat) * hot),
      b: Math.round(255 * (1 - hot) + (80) * hot),
      a: 255,
    };
    const saved = this._color;
    this._color = c;
    super.drawSelf(batch);
    this._color = saved;
  }
}

export class TitleState extends UIState {
  // logo 动画状态（1:1 Main.cs 字段）
  private logoRotation = 0;
  private logoRotationSpeed = 0;
  private logoRotationDirection = 1;
  private logoScale = 1;
  private logoScaleSpeed = 0;
  private logoScaleDirection = 1;
  private versionText = `SandboxWorld ${'v0.1.0'}`;

  constructor(private flow: TitleFlow) {
    super();
    const y0 = 250;   // 原版 num2
    const step = 80;  // 原版 num4
    const labels: Array<[string, () => void]> = [
      [Lang.has('Legacy.LegacyMenu.12') ? Lang.text('Legacy.LegacyMenu.12') : '单人游戏', () => flow.onSinglePlayer()],
      [Lang.has('Legacy.LegacyMenu.14') ? Lang.text('Legacy.LegacyMenu.14') : '设置', () => flow.onSettings()],
      [Lang.has('Legacy.LegacyMenu.15') ? Lang.text('Legacy.LegacyMenu.15') : '退出', () => flow.onQuit()],
    ];
    labels.forEach(([label, fn], i) => {
      const btn = new MenuTextButton(label, fn);
      btn.top = StyleDimension.fromPixels(y0 + i * step);
      btn.hAlign = 0.5;
      this.append(btn);
    });
  }

  protected drawSelf(batch: UISpriteBatch): void {
    this.drawLogo(batch);
    this.drawVersion(batch);
  }

  private drawLogo(batch: UISpriteBatch) {
    // 动画公式 1:1（Main.cs:35083-35106）
    this.logoRotation += this.logoRotationSpeed * 4e-6 * 60;
    if (this.logoRotation > 0.08) this.logoRotationDirection = -1;
    else if (this.logoRotation < -0.08) this.logoRotationDirection = 1;
    if (this.logoRotationSpeed < 20 && this.logoRotationDirection === 1) this.logoRotationSpeed += 1;
    else if (this.logoRotationSpeed > -20 && this.logoRotationDirection === -1) this.logoRotationSpeed -= 1;
    this.logoScale += this.logoScaleSpeed * 9e-6 * 60;
    if (this.logoScale > 1.35) this.logoScaleDirection = -1;
    else if (this.logoScale < 1.0) this.logoScaleDirection = 1;
    if (this.logoScaleSpeed < 50 && this.logoScaleDirection === 1) this.logoScaleSpeed += 1;
    else if (this.logoScaleSpeed > -50 && this.logoScaleDirection === -1) this.logoScaleSpeed -= 1;

    const logo = UITextures.get('Logo.png');
    const glow = UITextures.get('Logo2.png');
    if (!logo) return;
    const cx = this.getDimensions().width / 2;
    const cy = 100;
    const base = 0.8;
    const scale = base * this.logoScale;
    // Logo（本体）
    batch.draw(logo, cx, cy, {
      scale,
      rotation: this.logoRotation,
      originX: logo.sw / 2, originY: logo.sh / 2,
    });
    // Logo2（发光层）
    if (glow) {
      batch.draw(glow, cx, cy, {
        scale,
        rotation: this.logoRotation,
        originX: glow.sw / 2, originY: glow.sh / 2,
        alpha: 0.6,
      });
    }
  }

  /** 版本号：左下角描边小字（Main.cs:38127：5 遍绘制做描边阴影） */
  private drawVersion(batch: UISpriteBatch) {
    const d = this.getDimensions();
    const x = 10;
    const y = d.height - 24;
    const black = rgb(0, 0, 0);
    const offsets = [[-2, 0], [2, 0], [0, -2], [0, 2], [0, 0]];
    for (const [ox, oy] of offsets) {
      batch.drawString(this.versionText, x + ox, y + oy, black, 0.75);
    }
    batch.drawString(this.versionText, x, y, rgb(255, 255, 255), 0.75);
  }
}
