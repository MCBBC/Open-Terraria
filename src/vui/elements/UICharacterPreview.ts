// 移植 UICharacter.cs：59×58 PlayerBackground + 纸娃娃帧居中绘制。
// animated = 行走循环（(time/0.07 % 14 + 6) 帧）
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { compositePaperDoll, dollFrame, walkFrame, IDLE_FRAME } from '../../player/PaperDoll';
import type { Appearance } from '../../player/Appearance';

export class UICharacterPreview extends UIElement {
  private time = 0;
  private doll: HTMLCanvasElement | null = null;
  private dollKey = '';

  constructor(public appearance: Appearance, public animated = true, public hasBackPanel = true, public characterScale = 1) {
    super();
    this.width = StyleDimension.fromPixels(59);
    this.height = StyleDimension.fromPixels(58);
  }

  setAppearance(a: Appearance) { this.appearance = a; }

  update(): void {
    this.time += 1 / 60;
    super.update();
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    if (this.hasBackPanel) {
      const bg = UITextures.get('UI_PlayerBackground');
      if (bg) batch.draw(bg, d.x, d.y, { scale: 1 });
    }
    const key = JSON.stringify(this.appearance);
    if (key !== this.dollKey) {
      this.dollKey = key;
      this.doll = compositePaperDoll(this.appearance);
    }
    if (!this.doll) return;
    const frame = this.animated ? walkFrame(this.time) : IDLE_FRAME;
    const f = dollFrame(this.doll, frame);
    const s = this.characterScale;
    // 贴底居中（角色脚在帧底部）
    const x = d.x + d.width / 2 - (f.sw * s) / 2;
    const y = d.y + d.height - f.sh * s;
    batch.draw(f, x, y, { scale: s });
  }
}
