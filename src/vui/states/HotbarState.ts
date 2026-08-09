// 游戏内常驻快捷栏（原版 hotbar = 背包首行，位置 (20,20) inventoryScale 0.85）。
// 整个 state ignoresMouseInteraction，只有 10 个不可见命中盒接管点击（选格），
// 游戏输入不被遮挡。
import { UIState } from '../core/UIState';
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { atlasIconForKey } from '../../assets/SpriteAtlas';
import type { Game } from '../../core/Game';
import { ITEM_DEFS } from '../../data/items';
import { INV_COLS } from '../../items/Inventory';

const INV_SCALE = 0.85;
const SLOT = 56;

export class HotbarState extends UIState {
  constructor(private game: Game) {
    super();
    this.ignoresMouseInteraction = true; // 只让命中盒接收指针
    for (let i = 0; i < INV_COLS; i++) {
      const box = new HotbarHitbox(i, () => { this.game.player.inv.selected = i; });
      box.width = StyleDimension.fromPixels(SLOT * INV_SCALE);
      box.height = StyleDimension.fromPixels(SLOT * INV_SCALE);
      box.left = StyleDimension.fromPixels(20 + i * SLOT * INV_SCALE);
      box.top = StyleDimension.fromPixels(20);
      this.append(box);
    }
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const inv = this.game.player.inv;
    for (let i = 0; i < INV_COLS; i++) {
      const x = 20 + i * SLOT * INV_SCALE, y = 20;
      const back = UITextures.get('Inventory_Back15');
      if (back) batch.draw(back, x, y, { scale: INV_SCALE });
      else batch.fillRect(x, y, SLOT * INV_SCALE, SLOT * INV_SCALE, rgb(20, 24, 48, 200));
      const s = inv.slots[i];
      if (s) {
        const key = ITEM_DEFS[s.id]?.key ?? '';
        const icon = this.game.atlas ? atlasIconForKey(this.game.atlas, key) : null;
        if (icon) batch.draw(icon, x + (SLOT * INV_SCALE - icon.sw * INV_SCALE) / 2, y + (SLOT * INV_SCALE - icon.sh * INV_SCALE) / 2, { scale: INV_SCALE });
        if (s.stack > 1) {
          const text = String(s.stack);
          batch.drawString(text, x + SLOT * INV_SCALE - 4 - text.length * 6 * INV_SCALE, y + SLOT * INV_SCALE - 13 * INV_SCALE, rgb(255, 255, 255), INV_SCALE);
        }
      }
      if (inv.selected === i) {
        batch.fillRect(x, y, SLOT * INV_SCALE, 2, rgb(255, 220, 100));
        batch.fillRect(x, y, 2, SLOT * INV_SCALE, rgb(255, 220, 100));
        batch.fillRect(x + SLOT * INV_SCALE - 2, y, 2, SLOT * INV_SCALE, rgb(255, 220, 100));
        batch.fillRect(x, y + SLOT * INV_SCALE - 2, SLOT * INV_SCALE, 2, rgb(255, 220, 100));
      }
    }
  }
}

class HotbarHitbox extends UIElement {
  constructor(public index: number, onPick: () => void) {
    super();
    this.onClick(() => onPick());
  }
  protected drawSelf(_batch: UISpriteBatch): void { /* 不可见命中盒 */ }
}
