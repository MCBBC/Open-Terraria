// SW-FX28 刀①（2026-09-11）:箱子态内嵌布局——vanilla-inventory-refactor 登记债#1 箱侧清偿。
// 金标 = 1457 反编译 Terarria1457/Terraria/UI/ChestUI.cs + Main.cs DrawInventory
// （行号逐锚见各断言;1458 增量面 SetDefaults 零变更,本布局域无增量）。
// 覆盖面:①几何金标（纯算术+逐槽截断纪律）②单源接线锚定（结构锁,变异证红）
// ③开箱流 D0/绑定面（开/关/变体让位门/槽 context 分派的反向锁定）。
// 商店态(NpcShop 独立面板→内嵌)为同债分期二,不在本文件锚定域(见债册 #1 分期表)。
//
// 变异证红纪律:每段断言即判别器——几何常量/单源接线/门条件任一漂移即红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHEST_SCALE, CHEST_NAME_XY, chestSlotXY, chestButtonXY,
  trashXY, bestiaryXY, emoteXY, quickStackXY, sortXY,
} from '../src/ui/vanillaInvLayout';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const layoutSrc = read('src/ui/vanillaInvLayout.ts');

// ============================================================
// ① 几何金标(ChestUI.cs:324-386 DrawSlots;invBottom=258 Main.cs:6746)
// ============================================================
describe('SW-FX28 ①箱条几何金标(ChestUI.cs DrawSlots)', () => {
  it('缩放/名字/按钮锚常量(ChestUI.cs:83/:158/:186/:198)', () => {
    expect(CHEST_SCALE).toBe(0.755);                    // :83 Main.inventoryScale=0.755f
    expect(CHEST_NAME_XY).toEqual({ x: 504, y: 258 });  // :158 DrawName (504, invBottom)
    expect(chestButtonXY(0)).toEqual({ x: 506, y: 298 }); // :186 506, invBottom+40
  });
  it('按钮列步距 26(:198 Y+=ID*26):ID0-4 = 298/324/350/376/402', () => {
    expect([0, 1, 2, 3, 4].map(chestButtonXY).map((p) => p.y)).toEqual([298, 324, 350, 376, 402]);
    for (const id of [0, 1, 2, 3, 4]) expect(chestButtonXY(id).x).toBe(506);
    // ID5/6(重命名,登记债未画)=公式同源不特判
    expect(chestButtonXY(5).y).toBe(428);
  });
  it('40 槽逐槽与反编译表达式恒等(:375-376 逐槽 (int) 截断,行主序 :372 num4=i+j*10)', () => {
    for (let i = 0; i < 40; i++) {
      const col = i % 10, row = Math.floor(i / 10);
      // 反编译字面:ChestUI.cs:375 (int)(73f+(float)(i*56)*scale) / :376 (int)(invBottom+(j*56)*scale)
      const vx = Math.trunc(73 + col * 56 * 0.755);
      const vy = Math.trunc(258 + row * 56 * 0.755);
      expect(chestSlotXY(i), `slot ${i}`).toEqual({ x: vx, y: vy });
    }
  });
  it('关键落位像素:首格 (73,258)/行末 x=453(trunc 453.52)/第 4 行 y=384(trunc 384.84)', () => {
    expect(chestSlotXY(0)).toEqual({ x: 73, y: 258 });
    expect(chestSlotXY(1).x).toBe(115);    // trunc(115.28)
    expect(chestSlotXY(2).x).toBe(157);    // trunc(157.56)
    expect(chestSlotXY(9)).toEqual({ x: 453, y: 258 });
    expect(chestSlotXY(10)).toEqual({ x: 73, y: 300 });   // trunc(300.28)
    expect(chestSlotXY(20).y).toBe(342);   // trunc(342.56)
    expect(chestSlotXY(39)).toEqual({ x: 453, y: 384 });
  });
  it('同域相容:箱条首行 y=垃圾桶关态 y(invBottom 同锚);让位垃圾桶=末行下一格位', () => {
    expect(chestSlotXY(0).y).toBe(trashXY(false).y);         // 同 invBottom=258
    expect(trashXY(true)).toEqual({ x: 453, y: chestSlotXY(30).y + 42, scale: 0.755 });
    // 让位图鉴/表情 y=446=关态 278+168(4 格带),x=关态+5(Main.cs:43103-43108)
    expect(bestiaryXY(true)).toEqual({ x: 503, y: 446 });
    expect(emoteXY(true)).toEqual({ x: 539, y: 446 });
    // 开箱态 2×2 钮隐藏(FX10 既有面;Main.cs:42548 门)
    expect(quickStackXY(true)).toBeNull();
    expect(sortXY(true)).toBeNull();
  });
  it('箱条右缘不压钱币列:末列槽右缘 < 钱币 x=497(原版并存不叠)', () => {
    const rightEdge = chestSlotXY(9).x + 52 * CHEST_SCALE;
    expect(rightEdge).toBeLessThan(497);
  });
  it('商店同构面:货架格几何同式(Main.cs:42523-42524)、店名/储蓄同位(Main.cs:42502-42503)', () => {
    // 反编译字面逐槽对拍——商店与箱条共用同一 10×4 网格与 (504,invBottom) 名位
    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 4; r++) {
        expect(chestSlotXY(c + r * 10)).toEqual({
          x: Math.trunc(73 + c * 56 * 0.755),
          y: Math.trunc(258 + r * 56 * 0.755),
        });
      }
    }
    expect(CHEST_NAME_XY).toEqual({ x: 504, y: 258 });
  });
});

// ============================================================
// ② 单源接线锚定(登记债#1 箱侧清偿本体:vinvBuildChest 几何只认 vanillaInvLayout)
// ============================================================
describe('SW-FX28 ②单源接线锚定(结构锁,变异证红)', () => {
  it('vanillaInvLayout.ts 携反编译行号锚+字面公式', () => {
    expect(layoutSrc).toContain('Math.trunc(73 + (i % 10) * 56 * CHEST_SCALE)');
    expect(layoutSrc).toContain('Math.trunc(258 + Math.floor(i / 10) * 56 * CHEST_SCALE)');
    expect(layoutSrc).toContain('258 + 40 + id * 26');
    expect(layoutSrc).toContain('ChestUI.cs:375');
    expect(layoutSrc).toContain('ChestUI.cs:158');
    expect(layoutSrc).toContain('ChestUI.cs:186');
  });
  it('UI.ts vinvBuildChest 消费单源(槽/scale/名/钮四路)', () => {
    expect(uiSrc).toContain("vinvMakeSlot('chest', i, CHEST_SCALE)");
    expect(uiSrc).toContain('const { x, y } = chestSlotXY(i);');
    expect(uiSrc).toContain('return chestButtonXY(id);');
    expect(uiSrc).toContain('return { x: CHEST_NAME_XY.x, y: CHEST_NAME_XY.y };');
    expect(uiSrc).toContain('CHEST_SCALE, CHEST_NAME_XY, chestSlotXY, chestButtonXY,');
  });
  it('反向锁定:内联字面已废除,禁回潮', () => {
    expect(uiSrc).not.toContain('Math.trunc(73 + col * 56 * 0.755)');
    expect(uiSrc).not.toContain('Math.trunc(258 + row * 56 * 0.755)');
    expect(uiSrc).not.toContain("vinvMakeSlot('chest', i, 0.755)");
    expect(uiSrc).not.toContain('return { x: 504, y: 258 };');
    expect(uiSrc).not.toContain('return { x: 506, y: 258 + 40 + id * 26 };');
  });
});

// ============================================================
// ③ 开箱流 D0/绑定面(开/关流+变体让位门+槽 context 分派反向锁定)
// ============================================================
describe('SW-FX28 ③开箱流 D0/绑定面(UI.ts)', () => {
  it('开箱 vanilla 分支:无独立 modal,原位开背包+退重铸(Main.cs:41164 playerInventory=true 等价)', () => {
    const s = uiSrc;
    expect(s).toContain("if (this._builtLayout === 'vanilla') {\n      this.vinvReforgeOpen = false;   // 原版 :42277 chest≠-1 → InReforgeMenu=false\n      this.openInventory(true);\n      this.refreshAll();\n      return;\n    }");
    // vanilla 分支后不再落 chestPanel display:block(独立面板=classic 专属)
    const vanillaBranch = s.slice(s.indexOf('private openChestPanel'), s.indexOf('closeChest()'));
    expect(vanillaBranch).not.toContain("chestPanel.style.display = 'block'");
  });
  it('关箱链:closeChest 清 openChest(箱条 pos 门失效→display:none)并随关包调用', () => {
    expect(uiSrc).toContain('closeChest() {\n    this.openChest = null;');
    expect(uiSrc).toContain('this.closeChest();');
  });
  it('变体让位门 = ChestOrShopUIVisible 同面(Main.cs:3035-3046):openChest ∨ npcShopOpen', () => {
    // 垃圾桶/图鉴/表情让位与 2×2 钮隐藏在商店态同面生效(:43078/:43103/:43158)
    expect(uiSrc).toContain('const chestOpen = !!this.openChest || this.game.npcShopOpen;');
  });
  it('箱槽 context 分派绑定 openChest.x(ctx3 世界箱/ctx4 银行族/ctx32 虚空;SlotActions 域)', () => {
    expect(uiSrc).toContain("slotContext(where, i, panelOpen, where === 'chest' ? this.openChest?.x : undefined)");
  });
  it('40 槽循环全量挂 vinvLayoutItems(pos 门 this.openChest——关箱即隐,开箱即原位)', () => {
    const start = uiSrc.indexOf('private vinvBuildChest');
    const body = uiSrc.slice(start, uiSrc.indexOf('private vinvUpdateChestName', start));
    expect(body).toContain('for (let i = 0; i < 40; i++) {');
    expect(body).toContain('pos: () => (this.openChest ? { x, y } : null)');
    expect(body).toContain('const { x, y } = chestSlotXY(i);');
  });
});
