// GroupOptionButton<T> 的简化移植：图标 + 标题的单选项，选中高亮（互斥组由调用方管理）。
// 悬停描述由调用方的描述面板显示（onHover 回传 null 表示移出）。
import { UITextPanel } from './UITextPanel';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import type { UISpriteBatch } from '../draw/UISpriteBatch';

export class GroupOptionButton<T> extends UITextPanel {
  selected = false;

  constructor(
    public value: T,
    title: string,
    public iconKey: string | null,
    public description: string,
    onPick: (v: T) => void,
    onHover: ((v: T | null) => void) | null = null,
  ) {
    super(title, 0.85);
    this.height = StyleDimension.fromPixels(38);
    this.minWidth = StyleDimension.fromPixels(96);
    if (iconKey) this.paddingLeft = 30; // 标题右移给图标让位
    this.onClick(() => onPick(this.value));
    if (onHover) {
      this.onMouseOver(() => onHover(this.value));
      this.onMouseOut(() => onHover(null));
    }
  }

  setSelected(v: boolean) {
    this.selected = v;
    this.backgroundColor = v ? rgb(90, 110, 180, 230) : rgb(63, 82, 151, 200);
  }

  protected drawSelf(batch: UISpriteBatch): void {
    super.drawSelf(batch);
    if (!this.iconKey) return;
    const tex = UITextures.get(this.iconKey);
    if (!tex) return;
    const d = this.getInnerDimensions();
    const y = d.y + (d.height - tex.sh) / 2;
    batch.draw(tex, d.x + 2, y, { scale: 1 });
  }
}
