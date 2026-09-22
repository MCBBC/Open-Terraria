// ★BJ269 配方列表逐帧驱动守卫（2026-09-22 用户实报「ESC 开着时配方列表不随工作台
// 距离实时刷新」双向失效）定谳后的守卫。
//
// 原版权威（Terarria1457；1458 交叉同构，行号漂移 ≤2）：
//   列表重算 = 【绘制相每帧】全量重算 availableRecipe，无缓存无节流：
//     Main.cs:42424        DrawInventory（:41710 起）else 支直调 Recipe.UpdateRecipeList()
//     NewCraftingUI.cs:405 NewCraftingUI.Draw() → UpdateContents() → :591 UpdateRecipeList()
//     Recipe.cs:229-260    UpdateRecipeList：ClearAvailableRecipes → 全配方表
//                          PlayerMeetsEnvironmentConditions（:322-357，adjTile 门）
//                          + CollectedEnoughItemsToCraft（材料门,含近箱）→ availableRecipe
//   站点面 = 【update 相每拍】重扫：
//     Player.cs:25485      Update(int i) 内 → UpdateNearbyCraftingTiles()
//     Main.cs:17589        DoUpdate_WhilePaused 尾（autoPause 暂停期照跑）
//     Player.cs:28729-28734 UpdateNearbyCraftingTiles: if (Main.playerInventory) AdjTiles()
//     TileReachCheckSettings.cs:16-20/53-62  Simple=±5/±3（玩家盒外扩）逐格扫描
//
// 本仓病灶定谳：列表重算全为事件驱动（UI.ts refreshAll 族 60+ 调用点全挂
//   拾取/开关面板/槽位点击等事件，无一每帧；vinvPulseTick 每帧面只含 modern 滤器
//   失效检查/吸附步进/呼吸脉冲），移动改站点邻接不产生任何事件 → 双向失效：
//   离站行滞留（超距行还在,且 vanillaCraft 无环境复验门=真可超距合成）+
//   进站行不来（靠近工作台列表不动）。
// 修复：Game.probeCraftListRefresh 挂 frame() 绘制相（SuppressDraw 早退之后=抑制帧
//   不进，原版抑制帧不进 DrawInventory 同相）——每帧（60Hz 钳,原版锁 60fps 同拍）
//   全量重算 vanillaAvailableRecipes（站点集逐调即扫无缓存）+ craftListSignature
//   比对，变化才发 onInventoryChanged（rAF 合并 refreshAll → legacy
//   refreshVanillaCrafting / vanilla 布局 vinvRefreshCraft / FX41 modern
//   vinvUpdateModernCraft 三布局同拍刷新）。
//
// 三层断言：
//   ① 语义：craftListSignature——行集变化/轮数变化改变签名，同输入恒同串（防伪刷新）；
//   ② 行为：availableRecipes 站点门双向（近站入列/离站出列=探针变化检测的数据面，
//      与 SW-FX36 继承表守卫互补——那里证"判据对"，这里证"信号会变"）；
//   ③ 结构：Game.ts 探针接线五锚（定义/frame 调用在绘制相/inventoryOpen 门/
//      关包清签名/变化才发 cb）——并行会话摘除任一环即红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  availableRecipes, craftListSignature, VANILLA_RECIPES,
  invIndexOfVanilla, type VanillaCraftCtx,
} from '../src/data/vanillaRecipes';
import { TILE_DEFS } from '../src/data/tiles';
import { Inventory } from '../src/items/Inventory';

const GAME_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** vanilla.sheet（原版 tile id）→ 本仓 internal tile id */
const internalOfSheet = (sheet: number): number => {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
};

const ctxNear = (...sheets: number[]): VanillaCraftCtx => ({
  nearbyInternal: new Set(sheets.map(internalOfSheet)),
});

const cobaltBar = VANILLA_RECIPES.find((r) => r.create === 381 && r.tile === 17)!; // 钴锭 @熔炉

describe('① craftListSignature（BJ269 探针签名面）', () => {
  it('同输入恒同串（重算不变 → 不发伪刷新）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 3 };   // 钴矿 ×3 → 造钴锭
    const a = availableRecipes(inv, ctxNear(17));
    const b = availableRecipes(inv, ctxNear(17));
    expect(craftListSignature(a)).toBe(craftListSignature(b));
  });

  it('行集变化（离站出列/进站入列）改变签名', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 3 };
    const atStation = craftListSignature(availableRecipes(inv, ctxNear(17)));
    const away = craftListSignature(availableRecipes(inv, ctxNear()));
    expect(atStation).not.toBe(away);
    expect(availableRecipes(inv, ctxNear(17)).some((e) => e.r === cobaltBar)).toBe(true);
    expect(availableRecipes(inv, ctxNear()).some((e) => e.r === cobaltBar)).toBe(false);
  });

  it('轮数变化（材料源跨阈）改变签名', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 3 };
    const sig3 = craftListSignature(availableRecipes(inv, ctxNear(17)));
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 8 };
    const sig8 = craftListSignature(availableRecipes(inv, ctxNear(17)));
    expect(sig8).not.toBe(sig3);
  });

  it('空表 → 空串（关包清签名的复位语义）', () => {
    expect(craftListSignature([])).toBe('');
  });
});

describe('② availableRecipes 站点门双向（探针变化检测的数据面）', () => {
  it('同帧两向重算输出与单帧一致（移动跨阈两拍签名必异）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: invIndexOfVanilla(364), stack: 3 };
    // 进站拍 → 离站拍 → 再进站拍：签名序列 A→B→A（探针据此各发一次刷新）
    const seq = [ctxNear(17), ctxNear(), ctxNear(17)].map((c) => craftListSignature(availableRecipes(inv, c)));
    expect(seq[0]).toBe(seq[2]);
    expect(seq[0]).not.toBe(seq[1]);
  });
});

describe('③ Game.ts 探针接线结构锚（BJ269 五锚,摘任一环即红）', () => {
  const src = readFileSync(GAME_ROOT + '../src/core/Game.ts', 'utf8');

  it('探针定义存在且门 = world ∧ __swUI.inventoryOpen（Main.playerInventory 等价）', () => {
    expect(src).toContain('probeCraftListRefresh(): void');
    const body = src.slice(src.indexOf('private probeCraftListRefresh'));
    expect(body).toContain('if (!this.world) return;');
    expect(body).toContain('__swUI?.inventoryOpen');
  });

  it('关包清签名（防陈旧跨开包残留）', () => {
    const body = src.slice(src.indexOf('private probeCraftListRefresh'));
    expect(body).toContain('this._craftProbeSig = null;');
  });

  it('变化才发 cb.onInventoryChanged（签名比对门内）', () => {
    const body = src.slice(src.indexOf('private probeCraftListRefresh'));
    expect(body).toContain('if (sig !== this._craftProbeSig)');
    expect(body).toContain('this.cb.onInventoryChanged?.()');
    // cb 触发必须在签名分支内（防每帧全量 refreshAll 回归 SUI-P1 开包 hitch 面）
    const branch = body.slice(body.indexOf('if (sig !== this._craftProbeSig)'));
    expect(branch.indexOf('this.cb.onInventoryChanged?.()')).toBeGreaterThan(-1);
    expect(branch.indexOf('this.cb.onInventoryChanged?.()')).toBeLessThan(branch.indexOf('}', branch.indexOf('this.cb.onInventoryChanged?.()')) + 1);
  });

  it('挂在 frame() 绘制相（tickInfoAccsHover 之后、render 之前=SuppressDraw 早退后）', () => {
    const frameAt = src.indexOf('private frame(now: number) {');
    const drawPhase = src.slice(frameAt, src.indexOf('private _autoSaveAt = 0;', frameAt));
    expect(drawPhase).toContain('this.probeCraftListRefresh();');
    const probeCall = drawPhase.indexOf('this.probeCraftListRefresh();');
    const hover = drawPhase.indexOf('this.tickInfoAccsHover()');
    const render = drawPhase.indexOf('this.render();');
    expect(probeCall).toBeGreaterThan(hover);   // 绘制相尾段（抑制帧早退之后）
    expect(probeCall).toBeLessThan(render);
  });

  it('签名比对用 craftListSignature 单源（行集+轮数双维,散写公式防漂移）', () => {
    const body = src.slice(src.indexOf('private probeCraftListRefresh'));
    expect(body).toContain('craftListSignature(avail)');
  });
});
