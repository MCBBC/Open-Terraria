// 移植 UICharacterListItem.cs：列表项 = 纸娃娃预览 + 名字 + 难度颜色
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { UIText } from './UIText';
import { UICharacterPreview } from './UICharacterPreview';
import { DIFFICULTY_INFO, type Appearance } from '../../player/Appearance';
import { rgb } from '../draw/UISpriteBatch';

export class UICharacterListItem extends UIElement {
  private preview: UICharacterPreview;
  private nameText: UIText;

  constructor(public appearance: Appearance, public selected: boolean, onClick: () => void, onDoubleClick: () => void) {
    super();
    this.width = StyleDimension.fromPixels(500);
    this.height = StyleDimension.fromPixels(64);

    this.preview = new UICharacterPreview(appearance, true, true, 1);
    this.preview.left = StyleDimension.fromPixels(6);
    this.preview.vAlign = 0.5;
    this.append(this.preview);

    this.nameText = new UIText(appearance.name || '无名角色', 1);
    this.nameText.left = StyleDimension.fromPixels(80);
    this.nameText.vAlign = 0.5;
    const dc = DIFFICULTY_INFO[appearance.difficulty]?.color ?? { r: 255, g: 255, b: 255 };
    this.nameText.setTextColor({ ...rgb(dc.r, dc.g, dc.b), a: 255 });
    this.append(this.nameText);

    this.onClick(() => onClick());
    this.onDoubleClick(() => onDoubleClick());
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    if (this.selected) {
      batch.fillRect(d.x, d.y + 2, d.width, d.height - 4, rgb(255, 255, 255, 24));
    }
  }

  setName(name: string) {
    this.nameText.setText(name || '无名角色');
  }
}
