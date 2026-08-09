// 游戏内背包/合成 Canvas 重写（M5）。
// 布局公式 1:1 移植自 1.4.5.6 Main.DrawInventory：
//   背包 10 列：x=20+col*56*0.85, y=20+row*56*0.85（inventoryScale 0.85）
//   金币列 x=497（scale 0.6）  垃圾桶 (448,258)
//   装备列：screenWidth-92/-139/-186（步长 -47），顶 y=174
//   合成列表：scale=clamp(100/(|y|+100),0.75,∞)，x=46-26*scale，y=410+y*scale-30*scale，
//             目标 (i-focus)*65，每帧 ±6.5 追赶；越远越淡
// 交互语义搬迁自 src/ui/UI.ts 的 DOM 拖拽系统（整叠拾取/右键拆半或放一/垃圾桶/丢世界/装备位校验）。
import { UIState } from '../core/UIState';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { UserInterface } from '../core/UserInterface';
import { atlasIconForKey } from '../../assets/SpriteAtlas';
import type { DrawRect } from '../../assets/SpriteAtlas';
import type { Game } from '../../core/Game';
import type { ChestData } from '../../world/World';
import { ITEM_DEFS, ITEM_BY_KEY } from '../../data/items';
import { RECIPES } from '../../data/recipes';
import {
  INV_COLS, INV_ROWS, ACCESSORY_START, ARMOR_START, VANITY_START, COIN_START,
} from '../../items/Inventory';

const INV_SCALE = 0.85;
const COIN_SCALE = 0.6;
const SLOT = 56;
const CHEST_SLOTS = 10;

/** 格命中 */
type Hit =
  | { kind: 'inv'; i: number }
  | { kind: 'chest'; i: number }
  | { kind: 'trash' }
  | null;

export class UIInventoryState extends UIState {
  /** 光标持有物（原版 mouseItem 语义） */
  heldStack: { id: number; stack: number } | null = null;
  private trash: { id: number; stack: number } | null = null;
  private openChest: ChestData | null;
  private availableRecipes: number[] = [];
  private recipeY: number[] = [];
  private focusRecipe = 0;
  private hoverSlot: Hit = null;
  private hoverRecipe = -1;

  constructor(private game: Game, chest?: ChestData | null) {
    super();
    this.openChest = chest ?? null;
    this.rebuildRecipes();
    // 全屏捕获：点击/右键路由到格与配方
    this.onClick(() => this.dispatchClick(false));
    this.onRightClick(() => this.dispatchClick(true));
  }

  private get inv() { return this.game.player.inv; }
  private iconRect(id: number): DrawRect | null {
    const def = ITEM_DEFS[id];
    return this.game.atlas && def ? atlasIconForKey(this.game.atlas, def.key) : null;
  }
  private mouse() { return UserInterface.activeInstance?.mousePosition ?? { x: 0, y: 0 }; }

  // ================= 坐标（逻辑 px，原版公式） =================

  private invSlotXY(i: number) {
    const col = i % INV_COLS, row = Math.floor(i / INV_COLS);
    return { x: 20 + col * SLOT * INV_SCALE, y: 20 + row * SLOT * INV_SCALE };
  }
  private coinSlotXY(i: number) { return { x: 497, y: 85 + i * SLOT * COIN_SCALE + 20 }; }
  private trashXY() { return { x: 448, y: 258 }; }
  private equipTopY() { return 174; }
  private chestSlotXY(i: number) {
    const col = i % 5, row = Math.floor(i / 5);
    const cx = this.getDimensions().width / 2 - (5 * SLOT * INV_SCALE) / 2;
    return { x: cx + col * SLOT * INV_SCALE, y: 150 + row * SLOT * INV_SCALE };
  }
  private inSlot(p: { x: number; y: number }, scale: number, x: number, y: number): boolean {
    const s = SLOT * scale;
    return x >= p.x && x < p.x + s && y >= p.y && y < p.y + s;
  }

  private hitAt(x: number, y: number): Hit {
    for (let i = 0; i < INV_COLS * INV_ROWS; i++) {
      if (this.inSlot(this.invSlotXY(i), INV_SCALE, x, y)) return { kind: 'inv', i };
    }
    for (let k = 0; k < 3; k++) {
      if (this.inSlot(this.coinSlotXY(k), COIN_SCALE, x, y)) return { kind: 'inv', i: COIN_START + k };
    }
    const ey = this.equipTopY(), s = SLOT * INV_SCALE;
    for (let k = 0; k < 3; k++) {
      const px = this.getDimensions().width - 92 - s / 2 + 6;
      const vx = this.getDimensions().width - 139 - s / 2 + 6;
      if (x >= px && x < px + s && y >= ey + k * s && y < ey + (k + 1) * s) return { kind: 'inv', i: ARMOR_START + k };
      if (x >= vx && x < vx + s && y >= ey + k * s && y < ey + (k + 1) * s) return { kind: 'inv', i: VANITY_START + k };
    }
    for (let k = 0; k < 5; k++) {
      const px = this.getDimensions().width - 92 - s / 2 + 6;
      const ay = ey + 3 * s + k * s + (k > 1 ? 4 : 0);
      if (x >= px && x < px + s && y >= ay && y < ay + s) return { kind: 'inv', i: ACCESSORY_START + k };
    }
    if (this.inSlot(this.trashXY(), INV_SCALE, x, y)) return { kind: 'trash' };
    if (this.openChest) {
      for (let i = 0; i < CHEST_SLOTS; i++) {
        if (this.inSlot(this.chestSlotXY(i), INV_SCALE, x, y)) return { kind: 'chest', i };
      }
    }
    return null;
  }

  // ================= 点击路由 =================

  private dispatchClick(right: boolean) {
    const m = this.mouse();
    // 合成列表命中优先
    const ri = (m.x < 240 && m.y > 330) ? this.recipeAt(m.y) : -1;
    if (ri >= 0) {
      const r = RECIPES[this.availableRecipes[ri]];
      if (right) return;
      if (!this.heldStack && this.game.canCraft(r)) {
        this.focusRecipe = ri;
        this.game.craft(r);
        this.rebuildRecipes();
      }
      return;
    }
    const hit = this.hitAt(m.x, m.y);
    if (right) this.slotRightClick(hit);
    else this.slotLeftClick(hit);
  }

  // ================= 拖放语义（搬迁自 UI.ts） =================

  private slotContent(hit: Hit) {
    if (!hit) return null;
    if (hit.kind === 'inv') return this.inv.slots[hit.i] ?? null;
    if (hit.kind === 'chest') return this.openChest?.items[hit.i] ?? null;
    return this.trash;
  }
  private setSlot(hit: Hit, v: { id: number; stack: number } | null) {
    if (hit?.kind === 'inv') this.inv.slots[hit.i] = v;
    else if (hit?.kind === 'chest' && this.openChest) this.openChest.items[hit.i] = v;
    else if (hit?.kind === 'trash') this.trash = v;
  }
  private canAccept(hit: Hit, id: number): boolean {
    return hit?.kind !== 'inv' || this.inv.canAccept(hit.i, id);
  }

  private slotLeftClick(hit: Hit) {
    if (!hit) { this.throwHeldToWorld(); return; }
    if (!this.heldStack) {
      const cur = this.slotContent(hit);
      if (!cur) return;
      this.setSlot(hit, null);
      this.heldStack = cur;
      return;
    }
    const cur = this.slotContent(hit);
    if (!this.canAccept(hit, this.heldStack.id)) return;
    if (!cur) {
      this.setSlot(hit, this.heldStack);
      this.heldStack = null;
    } else if (cur.id === this.heldStack.id) {
      const max = ITEM_DEFS[cur.id].maxStack;
      const put = Math.min(max - cur.stack, this.heldStack.stack);
      cur.stack += put;
      this.heldStack.stack -= put;
      if (this.heldStack.stack <= 0) this.heldStack = null;
    } else {
      if (!this.canAccept(hit, cur.id)) return;
      this.setSlot(hit, this.heldStack);
      this.heldStack = cur;
    }
  }

  private slotRightClick(hit: Hit) {
    if (!hit) return;
    if (!this.heldStack) {
      const cur = this.slotContent(hit);
      if (!cur) return;
      const half = Math.ceil(cur.stack / 2);
      cur.stack -= half;
      if (cur.stack <= 0) this.setSlot(hit, null);
      this.heldStack = { id: cur.id, stack: half };
      return;
    }
    if (!this.canAccept(hit, this.heldStack.id)) return;
    const cur = this.slotContent(hit);
    if (!cur) {
      this.setSlot(hit, { id: this.heldStack.id, stack: 1 });
      this.heldStack.stack -= 1;
    } else if (cur.id === this.heldStack.id && cur.stack < ITEM_DEFS[cur.id].maxStack) {
      cur.stack += 1;
      this.heldStack.stack -= 1;
    } else return;
    if (this.heldStack.stack <= 0) this.heldStack = null;
  }

  private throwHeldToWorld() {
    if (!this.heldStack) return;
    const p = this.game.player;
    this.game.spawnDrop(p.cx + p.facing * 18, p.y + 6, ITEM_DEFS[this.heldStack.id].key, this.heldStack.stack, p.facing * 1.5, -2);
    this.heldStack = null;
  }

  /** 关闭结算：垃圾桶销毁（DOM UI 同款语义），持有物返还给宿主放回背包 */
  onClose(): { id: number; stack: number } | null {
    this.trash = null;
    const held = this.heldStack;
    this.heldStack = null;
    return held;
  }

  // ================= 合成 =================

  private rebuildRecipes() {
    this.availableRecipes = RECIPES.map((r, idx) => (this.game.canCraft(r) ? idx : -1)).filter((i) => i >= 0);
    if (this.focusRecipe >= this.availableRecipes.length) this.focusRecipe = Math.max(0, this.availableRecipes.length - 1);
    if (this.recipeY.length !== this.availableRecipes.length) {
      this.recipeY = this.availableRecipes.map((_, i) => (i - this.focusRecipe) * 65);
    }
  }

  private recipeAt(my: number): number {
    for (let i = 0; i < this.availableRecipes.length; i++) {
      const y = this.recipeY[i];
      const scale = Math.max(0.75, 100 / (Math.abs(y) + 100));
      const ry = 410 + y * scale - 30 * scale;
      if (my > ry && my < ry + 40 * scale) return i;
    }
    return -1;
  }

  // ================= 绘制 =================

  protected drawSelf(batch: UISpriteBatch): void {
    this.drawCrafting(batch);
    this.drawSlots(batch);
    if (this.openChest) this.drawChest(batch);
  }

  private drawSlotFrame(batch: UISpriteBatch, x: number, y: number, scale: number, selected = false) {
    const back = UITextures.get('Inventory_Back15');
    if (back) batch.draw(back, x, y, { scale });
    else batch.fillRect(x, y, SLOT * scale, SLOT * scale, rgb(20, 24, 48, 200));
    if (selected) {
      batch.fillRect(x, y, SLOT * scale, 2, rgb(255, 220, 100));
      batch.fillRect(x, y, 2, SLOT * scale, rgb(255, 220, 100));
      batch.fillRect(x + SLOT * scale - 2, y, 2, SLOT * scale, rgb(255, 220, 100));
      batch.fillRect(x, y + SLOT * scale - 2, SLOT * scale, 2, rgb(255, 220, 100));
    }
  }

  private drawStackAt(batch: UISpriteBatch, s: { id: number; stack: number } | null, x: number, y: number, scale: number) {
    if (!s) return;
    const icon = this.iconRect(s.id);
    if (icon) batch.draw(icon, x + (SLOT * scale - icon.sw * scale) / 2, y + (SLOT * scale - icon.sh * scale) / 2, { scale });
    if (s.stack > 1) {
      const text = String(s.stack);
      batch.drawString(text, x + SLOT * scale - 4 - text.length * 6 * scale, y + SLOT * scale - 13 * scale, rgb(255, 255, 255), scale);
    }
  }

  private drawSlots(batch: UISpriteBatch) {
    const inv = this.inv;
    for (let i = 0; i < INV_COLS * INV_ROWS; i++) {
      const p = this.invSlotXY(i);
      this.drawSlotFrame(batch, p.x, p.y, INV_SCALE, inv.selected === i);
      this.drawStackAt(batch, inv.slots[i] ?? null, p.x, p.y, INV_SCALE);
    }
    for (let k = 0; k < 3; k++) {
      const p = this.coinSlotXY(k);
      this.drawSlotFrame(batch, p.x, p.y, COIN_SCALE);
      this.drawStackAt(batch, inv.slots[COIN_START + k] ?? null, p.x, p.y, COIN_SCALE);
    }
    const ey = this.equipTopY(), s = SLOT * INV_SCALE;
    const px = this.getDimensions().width - 92 - s / 2 + 6;
    const vx = this.getDimensions().width - 139 - s / 2 + 6;
    for (let k = 0; k < 3; k++) {
      this.drawSlotFrame(batch, px, ey + k * s, INV_SCALE);
      this.drawStackAt(batch, inv.slots[ARMOR_START + k] ?? null, px, ey + k * s, INV_SCALE);
      this.drawSlotFrame(batch, vx, ey + k * s, INV_SCALE);
      this.drawStackAt(batch, inv.slots[VANITY_START + k] ?? null, vx, ey + k * s, INV_SCALE);
    }
    for (let k = 0; k < 5; k++) {
      const ay = ey + 3 * s + k * s + (k > 1 ? 4 : 0);
      this.drawSlotFrame(batch, px, ay, INV_SCALE);
      this.drawStackAt(batch, inv.slots[ACCESSORY_START + k] ?? null, px, ay, INV_SCALE);
    }
    const t = this.trashXY();
    this.drawSlotFrame(batch, t.x, t.y, INV_SCALE);
    this.drawStackAt(batch, this.trash, t.x, t.y, INV_SCALE);

    // 光标持有物
    const m = this.mouse();
    if (this.heldStack) {
      this.drawStackAt(batch, this.heldStack, m.x - SLOT * INV_SCALE / 2, m.y - SLOT * INV_SCALE / 2, INV_SCALE);
    }

    // 悬停 tooltip（原版 MouseText_DrawItemTooltip 观感：黑底+物品名金色）
    this.hoverSlot = this.hitAt(m.x, m.y);
    const s2 = this.slotContent(this.hoverSlot);
    if (s2) {
      const def = ITEM_DEFS[s2.id];
      if (def) {
        const lines: string[] = [def.name];
        if (def.tool?.damage) lines.push(`伤害 ${def.tool.damage}`);
        if (def.tool?.power) lines.push(`${def.tool.type === 'pick' ? '镐力' : def.tool.type === 'axe' ? '斧力' : '锤力'} ${def.tool.power}`);
        if (def.armor) lines.push(`防御 ${def.armor.defense}（${['头', '胸', '腿'][def.armor.slot]}）`);
        if (def.heal) lines.push(`回复 ${def.heal} 生命`);
        if (def.desc) lines.push(def.desc);
        const x = m.x + 16, y = m.y + 10;
        let w = 0;
        for (const l of lines) w = Math.max(w, l.length * 12 * 0.8);
        batch.fillRect(x, y, w + 16, lines.length * 14.4 + 12, rgb(10, 10, 20, 235));
        lines.forEach((l, i) => batch.drawString(l, x + 8, y + 6 + i * 14.4, i === 0 ? rgb(255, 232, 160) : rgb(220, 220, 230), 0.8));
      }
    }
  }

  private drawChest(batch: UISpriteBatch) {
    const chest = this.openChest!;
    batch.drawString('宝箱', this.getDimensions().width / 2 - 20, 130, rgb(255, 240, 180), 0.9);
    for (let i = 0; i < CHEST_SLOTS; i++) {
      const p = this.chestSlotXY(i);
      this.drawSlotFrame(batch, p.x, p.y, INV_SCALE);
      this.drawStackAt(batch, chest.items[i] ?? null, p.x, p.y, INV_SCALE);
    }
  }

  private drawCrafting(batch: UISpriteBatch) {
    const m = this.mouse();
    batch.drawString('制作', 76, 404, rgb(255, 255, 255), 0.85);

    // 滚动动画：±6.5/帧 追目标（原版 availableRecipeY）
    for (let i = 0; i < this.availableRecipes.length; i++) {
      const target = (i - this.focusRecipe) * 65;
      const diff = target - this.recipeY[i];
      if (Math.abs(diff) <= 6.5) this.recipeY[i] = target;
      else this.recipeY[i] += Math.sign(diff) * 6.5;
    }

    const num27 = this.getDimensions().height / 600 * 250;
    this.hoverRecipe = (m.x < 240 && m.y > 330) ? this.recipeAt(m.y) : -1;
    this.availableRecipes.forEach((ridx, i) => {
      const r = RECIPES[ridx];
      const ry = this.recipeY[i];
      const scale = Math.max(0.75, 100 / (Math.abs(ry) + 100));
      let alpha = 1;
      if (Math.abs(ry) > num27 - 100) alpha = Math.max(0, Math.min(1, 1.5 * (100 - (Math.abs(ry) - num27 + 100)) / 100));
      const can = this.game.canCraft(r);
      const hovered = this.hoverRecipe === i;
      const px = 46 - 26 * scale;
      const py = 410 + ry * scale - 30 * scale;
      const outId = ITEM_BY_KEY[r.out] ?? 0;
      const def = ITEM_DEFS[outId];
      if (hovered && def) {
        const icon = this.iconRect(outId);
        if (icon) batch.draw(icon, px - 4, py + 2, { scale, alpha });
      }
      const label = `${def?.name ?? r.out}${r.count > 1 ? ` ×${r.count}` : ''}`;
      batch.drawString(label, px + (hovered ? 30 : 6), py + 8 * scale,
        hovered ? rgb(255, 230, 120) : can ? rgb(230, 230, 230) : rgb(120, 120, 130), scale * 0.9);
      if (hovered) {
        // 材料行（原版 requiredItem @ x=80+i*40, y=380）+ 制作台需求
        r.inputs.forEach((inp, k) => {
          const [key, need] = inp;
          const have = this.inv.countOf(ITEM_BY_KEY[key] ?? 0);
          const ok = have >= need;
          const def2 = ITEM_DEFS[ITEM_BY_KEY[key] ?? 0];
          batch.drawString(`${def2?.name ?? key} ${have}/${need}`, 80 + k * 150, 380, ok ? rgb(160, 240, 160) : rgb(240, 140, 140), 0.7);
        });
        const stName = { hand: '徒手', workbench: '工作台', furnace: '熔炉', anvil: '铁砧' }[r.station];
        batch.drawString(`需要：${stName}`, 80, 396, rgb(200, 200, 220), 0.7);
      }
    });
  }
}
