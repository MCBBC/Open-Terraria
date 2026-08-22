// 放置物 style→物品掉落还原（审计 docs/audit/item-audit-2026-08-22.md 补 A ⚠️2/⚠️3 批）：
//   ⚠️2 多格 15 族 + 已覆盖同病 3 族 + 1×1 版 6 族——挖掉按帧掉 GetItemDrop_* 真物品
//      （原 R10 place_v_/style0 恒档）；数据层=src/data/vanillaStyleDrops.ts（1456
//      WorldGen.cs GetItemDrop_* 23 函数逐 case 机械转录）
//   ⚠️3 杂项：巨石族失撑→滚石弹（Check2x2 :86672 派发）/座钟授时（SceneMetrics.HasClock
//      → accWatch=3,Player.cs:12593）/瀑布族 8 帧动画（Main.cs:18743-18793）/陶罐顶部
//      杂草 + 南瓜株成长（UpdateWorld :72376-72390）
import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { styleDropVid, styleDropVidOfFrames, styleFromFrame, holidayLightVid } from '../src/data/vanillaStyleDrops';
import { framedCellFrame, furnitureStyleBase } from '../src/world/FurnitureStyle';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { ITEM_BY_KEY } from '../src/data/items';
import { scanScene, EMPTY_SCENE } from '../src/world/SceneMetrics';
import { TILE_ANIM_RATE, animFrameIdx, animYOffset, tileAnim } from '../src/render/TileAnim';
import { TrapShot } from '../src/entities/Dart';
import { formatWatchText } from '../src/stats/InfoAccs';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';

const keyOf = (k: string) => TILE_BY_KEY[k]!;
const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

// ============ A. 数据层：GetItemDrop_* 逐族两档对拍（1456 行号见表注释） ============
describe('styleDropVid 逐族两档（⚠️2 15 族 + 同病 3 族 + 1×1 版）', () => {
  it('桌 14（GetItemDrop_Tables :42131）：0→32 木 / 1→638 乌木；469 二类 :49445 0→3920', () => {
    expect(styleDropVid(14, 0)).toBe(32);
    expect(styleDropVid(14, 1)).toBe(638);
    expect(styleDropVid(14, 4)).toBe(827);
    expect(styleDropVid(469, 0)).toBe(3920);
    expect(styleDropVid(469, 1)).toBe(3948);
  });

  it('椅 15（GetItemDrop_Chair :42677）0→34 / 1→358 马桶；马桶 497（:42815）0→4096 / 1→4097', () => {
    expect(styleDropVid(15, 0)).toBe(34);
    expect(styleDropVid(15, 1)).toBe(358);
    expect(styleDropVid(497, 0)).toBe(4096);
    expect(styleDropVid(497, 1)).toBe(4097);
  });

  it('烛 33（GetItemDrop_Candles :39766）0→105 铜 / 1→1405 地牢蓝 / 4→2045 珊瑚', () => {
    expect(styleDropVid(33, 0)).toBe(105);
    expect(styleDropVid(33, 1)).toBe(1405);
    expect(styleDropVid(33, 4)).toBe(2045);
  });

  it('吊灯 34（GetItemDrop_Chandeliers :40676）0→106 铜 / 2→108 银；wrap37：style37→3894', () => {
    expect(styleDropVid(34, 0)).toBe(106);
    expect(styleDropVid(34, 2)).toBe(108);
    expect(styleDropVid(34, 37)).toBe(3894);   // 第二 X 列首档（fx/108*37+fy/54）
  });

  it('灯笼 42（GetItemDrop_Lanterns :40873）0→136 链灯 / 1→1390 黄铜', () => {
    expect(styleDropVid(42, 0)).toBe(136);
    expect(styleDropVid(42, 1)).toBe(1390);
  });

  it('钢琴 87（:41298）0→333 / 1→641；梳妆台 88（:49870）0→334 / 1→647', () => {
    expect(styleDropVid(87, 0)).toBe(333);
    expect(styleDropVid(87, 1)).toBe(641);
    expect(styleDropVid(88, 0)).toBe(334);
    expect(styleDropVid(88, 1)).toBe(647);
  });

  it('凳沙发 89（:40211）0→335 / 1→2397；浴缸 90（:42322）0→336 / 1→2073', () => {
    expect(styleDropVid(89, 0)).toBe(335);
    expect(styleDropVid(89, 1)).toBe(2397);
    expect(styleDropVid(90, 0)).toBe(336);
    expect(styleDropVid(90, 1)).toBe(2072);
  });

  it('汤锅 96（Check2x2Style :52430）0→345 / 1→1791 魔锅；烛台 100（:40296）0→349 / 1→2093', () => {
    expect(styleDropVid(96, 0)).toBe(345);
    expect(styleDropVid(96, 1)).toBe(1791);
    expect(styleDropVid(100, 0)).toBe(349);
    expect(styleDropVid(100, 1)).toBe(2092);
  });

  it('书架 101（:40476）0→354 / 1→1414；座钟 104（:40131）0→359 / 1→2237', () => {
    expect(styleDropVid(101, 0)).toBe(354);
    expect(styleDropVid(101, 1)).toBe(1414);
    expect(styleDropVid(104, 0)).toBe(359);
    expect(styleDropVid(104, 1)).toBe(2237);
  });

  it('床 79（GetItemDrop_Beds :39947）0→224 / 1→644 乌木 / 4→920', () => {
    expect(styleDropVid(79, 0)).toBe(224);
    expect(styleDropVid(79, 1)).toBe(644);
    expect(styleDropVid(79, 4)).toBe(920);
  });

  it('墓碑 85（CheckSign :43737-43744）0→321 / 1→1173 / 6→3229', () => {
    expect(styleDropVid(85, 0)).toBe(321);
    expect(styleDropVid(85, 1)).toBe(1173);
    expect(styleDropVid(85, 6)).toBe(3229);
    expect(styleDropVid(85, 10)).toBe(3233);
  });

  it('宝箱 21（GetItemDrop_Chests :41596）0→48 / 1→306 金；二类箱 467 secondType 0→3884 / 1→3885', () => {
    expect(styleDropVid(21, 0)).toBe(48);
    expect(styleDropVid(21, 1)).toBe(306);
    expect(styleDropVid(467, 0)).toBe(3884);
    expect(styleDropVid(467, 1)).toBe(3885);
  });

  it('同病已覆盖族：工作台 18（:42489）0→36 / 1→635；平台 19（:42927）0→94 / 1→631；野餐桌 487（:40287）0→4064', () => {
    expect(styleDropVid(18, 0)).toBe(36);
    expect(styleDropVid(18, 1)).toBe(635);
    expect(styleDropVid(19, 0)).toBe(94);
    expect(styleDropVid(19, 1)).toBe(631);
    expect(styleDropVid(487, 0)).toBe(4064);
    expect(styleDropVid(487, 1)).toBe(4065);
  });

  it('1×1 版：瓶 13（:41265）0→31 / 3→350 粉瓶；矿石条 239（KillTile :65166）0→20 铁 / 1→703 铅 / 22→3467', () => {
    expect(styleDropVid(13, 0)).toBe(31);
    expect(styleDropVid(13, 3)).toBe(350);
    expect(styleDropVid(239, 0)).toBe(20);
    expect(styleDropVid(239, 1)).toBe(703);
    expect(styleDropVid(239, 22)).toBe(3467);
  });

  it('钱币堆 330-333（:64197-64204）→币 71-74；骨块 194（:64652）→154；节日灯 149（:65571）三色', () => {
    expect(styleDropVid(330, 0)).toBe(71);
    expect(styleDropVid(331, 0)).toBe(72);
    expect(styleDropVid(332, 0)).toBe(73);
    expect(styleDropVid(333, 0)).toBe(74);
    expect(styleDropVid(194, 0)).toBe(154);
    expect(holidayLightVid(0)).toBe(596);
    expect(holidayLightVid(18)).toBe(597);
    expect(holidayLightVid(54)).toBe(596);   // 反向带同色（fx%54）
    expect(holidayLightVid(72)).toBe(597);
  });

  it('门 10/11（GetDoorItem :69257）0→25 木 / 1→650 乌木 / 11 神庙锁门→0 不掉', () => {
    expect(styleDropVidOfFrames(10, 0, 0)).toBe(25);
    expect(styleDropVidOfFrames(10, 0, 54)).toBe(650);
    expect(styleDropVidOfFrames(11, 0, 594)).toBe(0);   // style 11 锁门段无物品
  });

  it('全表 vid 均有真实物品键（VANILLA_ITEM_KEY_BY_ID 全覆盖,掉落可实例化）', () => {
    const sheets = [13, 14, 15, 18, 19, 21, 33, 34, 42, 79, 85, 87, 88, 89, 90, 96, 100, 101, 104, 172, 194, 239, 330, 331, 332, 333, 467, 469, 487, 497];
    let checked = 0;
    for (const s of sheets) {
      for (let st = 0; st < 80; st++) {
        const v = styleDropVid(s, st);
        if (v <= 0) continue;
        checked++;
        expect(VANILLA_ITEM_KEY_BY_ID[v], `sheet ${s} style ${st} → vid ${v}`).toBeTruthy();
        expect(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]], `vid ${v} 应有 def`).toBeDefined();
      }
    }
    expect(checked).toBeGreaterThan(900);   // 21 族×平均 45 档量级
  });
});

// ============ B. 帧反推 style（与 furnitureStyleBase 互为反函数） ============
describe('styleFromFrame 反推（放置帧→style roundtrip）', () => {
  it('烛台 100 / 水槽 172 新竖排基（Place2x2 cs:51436 frameY=style*36|38）roundtrip', () => {
    for (let s = 0; s < 8; s++) {
      expect(furnitureStyleBase(100, s, 2)).toEqual([0, s * 36]);
      expect(furnitureStyleBase(172, s, 2)).toEqual([0, s * 38]);
      const [fx, fy] = framedCellFrame(100, 2, s, 1, 1);
      expect(styleFromFrame[100]!(fx, fy)).toBe(s);
      const [fx2, fy2] = framedCellFrame(172, 2, s, 0, 1);
      expect(styleFromFrame[172]!(fx2, fy2)).toBe(s);
    }
  });

  it('横排族（桌 14 fx/54）/ 竖排族（椅 15 fy/40 / 床 79 fy/36）/ 吊灯 34 wrap37 roundtrip', () => {
    for (let s = 0; s < 5; s++) {
      const [tx, ty] = framedCellFrame(14, 3, s, 2, 1);
      expect(styleFromFrame[14]!(tx, ty)).toBe(s);
      const [cx, cy] = framedCellFrame(15, 1, s, 0, 1);
      expect(styleFromFrame[15]!(cx, cy)).toBe(s);
      const [bx, by] = framedCellFrame(79, 4, s, 3, 1);
      expect(styleFromFrame[79]!(bx, by)).toBe(s);
    }
    for (const s of [0, 36, 37, 40, 73]) {
      const [fx, fy] = framedCellFrame(34, 3, s, 1, 2);
      expect(styleFromFrame[34]!(fx, fy)).toBe(s);
    }
  });
});

// ============ C. breakTile 集成（shell 模式,同 vine-cascade） ============
interface Drop { key: string; n: number }
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World; breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [] };
  g.trackTile = 0;
  g.player = undefined;
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}

describe('breakTile 按帧掉真物品（object 分支 + 1×1 分支 + 门）', () => {
  it('乌木桌 style1（帧=framedCellFrame(14,3,1)）挖掉 → vi_638（曾恒掉 vi_32 木桌）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    const t = keyOf('table');
    const [fx, fy] = framedCellFrame(14, 3, 1, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, fx + dx * 18, fy + dy * 18);
    }
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, idOfSheet(1));   // 支撑
    g.breakTile(11, 10, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[638], n: 1 }]);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('金宝箱 style1（fx=36）挖掉 → vi_306（GetItemDrop_Chests :58024 fx/36）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    const t = keyOf('chest');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, 36 + dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 12, idOfSheet(1));
    w.store.setTileSilent(11, 12, idOfSheet(1));
    g.breakTile(10, 10, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[306], n: 1 }]);
  });

  it('1×1：钨矿条 style3（fx=54）挖掉 → vi_704（KillTile :65166 fx/18）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    w.store.setTileSilent(10, 10, keyOf('v_239_ore_bars'), 54, 0);
    g.breakTile(10, 10, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[704], n: 1 }]);
  });

  it('1×1：地牢蓝烛 style1（fy=22）挖掉 → vi_1405（KillTile :65595 fy/22）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    w.store.setTileSilent(10, 10, keyOf('candle'), 0, 22);
    g.breakTile(10, 10, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[1405], n: 1 }]);
  });

  it('门 style1（fy=54）挖掉 → vi_650 乌木门（GetDoorItem :69257,曾恒掉 vi_25）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    const t = keyOf('door_closed');
    for (let dy = 0; dy < 3; dy++) w.store.setTileSilent(10, 10 + dy, t, 0, 54 + dy * 18);
    g.breakTile(10, 11, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[650], n: 1 }]);
  });

  it('TNT 桶 654 挖掉无掉落（KillTile :66114 no-drop + TileFrame :86427 无 Check）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    const t = keyOf('v_654_tnt_barrel');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    g.breakTile(10, 10, false);
    expect(drops).toEqual([]);
    expect(w.store.get(10, 10)).toBe(0);
  });
});

// ============ D. 失撑链：样式掉落 + 非空箱存活门 + 巨石滚石弹 ============
function supportShell(w: World, drops: Drop[], projs: TrapShot[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    checkFurnitureSupport: (x: number, y: number) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.entities = { add: (e: unknown) => { if (e instanceof TrapShot) projs.push(e); }, drops: [] };
  g.player = {};   // 巨石滚石弹的 !isGeneratingOrLoadingWorld 门近似（cs:48764）
  return g as unknown as { checkFurnitureSupport: (x: number, y: number) => void };
}

describe('checkFurnitureSupport（⚠️2 失撑样式掉落 + ⚠️3 巨石/非空箱）', () => {
  it('乌木桌 style1 失撑 → 整件清除 + vi_638（Check3x2 :49383 失败 → Item.NewItem）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = supportShell(w, drops, []);
    const t = keyOf('table');
    const [fx, fy] = framedCellFrame(14, 3, 1, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, fx + dx * 18, fy + dy * 18);
    }
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, idOfSheet(1));
    w.store.setTile(11, 12, 0);   // 挖支撑 → onTileChanged(11,12) → 查 (11,11)
    g.checkFurnitureSupport(11, 11);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[638], n: 1 }]);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 11)).toBe(0);
  });

  it('有支撑的桌不动（复验通过即返回）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = supportShell(w, drops, []);
    const t = keyOf('table');
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, idOfSheet(1));
    g.checkFurnitureSupport(11, 11);
    expect(drops).toEqual([]);
    expect(w.store.get(10, 10)).toBe(t);
  });

  it('非空宝箱失撑悬空保留（CheckChest :57979 CanDestroyChest 门,R10 观察#6）', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const g = supportShell(w, drops, []);
    const t = keyOf('chest');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 12, idOfSheet(1));
    w.store.setTileSilent(11, 12, idOfSheet(1));
    w.chests.push({ x: 10, y: 10, items: Array(10).fill(null) });
    w.chests[0].items[2] = { id: 1, stack: 3 };
    w.store.setTile(10, 12, 0);
    g.checkFurnitureSupport(10, 11);
    expect(drops).toEqual([]);
    expect(w.store.get(10, 10)).toBe(t);      // 整件保留（悬空）
    expect(w.store.get(11, 11)).toBe(t);
    // 清空后失撑 → 掉落 + 移除
    w.chests[0].items[2] = null;
    g.checkFurnitureSupport(10, 11);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[48], n: 1 }]);
    expect(w.store.get(10, 10)).toBe(0);
  });

  it('巨石 138 失撑 → 2×2 清 + 滚石弹（Check2x2 :86672→cs:48766 弹 99 伤 70）,无物品掉落', () => {
    const w = new World(40, 40, 7, 'sdr');
    const drops: Drop[] = [];
    const projs: TrapShot[] = [];
    const g = supportShell(w, drops, projs);
    const t = keyOf('v_138_boulder');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 12, idOfSheet(1));
    w.store.setTileSilent(11, 12, idOfSheet(1));
    w.store.setTile(10, 12, 0);   // 挖左下支撑
    g.checkFurnitureSupport(10, 11);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);      // 整件清
    expect(projs.length).toBe(1);
    expect(projs[0].kind).toBe('boulder');
    expect(projs[0].damage).toBe(70);         // cs:48766 138→99 伤 70
    expect(drops).toEqual([]);                // 原版不掉物品（滚石压人语义）
  });

  it('巨石 712 屎堆失撑 → 伤 50（cs:48796 逐 sheet 伤害表）；有支撑不触发', () => {
    const w = new World(40, 40, 7, 'sdr');
    const projs: TrapShot[] = [];
    const g = supportShell(w, [], projs);
    const t = keyOf('v_712_poo_boulder');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 12, idOfSheet(1));
    w.store.setTileSilent(11, 12, idOfSheet(1));
    g.checkFurnitureSupport(10, 11);          // 支撑还在
    expect(projs.length).toBe(0);
    w.store.setTile(11, 12, 0);
    g.checkFurnitureSupport(11, 11);
    expect(projs.length).toBe(1);
    expect(projs[0].damage).toBe(50);
  });
});

// ============ E. ⚠️3 杂项：瀑布动画 / 座钟授时 / 陶罐杂草 / 南瓜成长 ============
describe('瀑布族 8 帧动画（Main.cs:18743-18793 + TileDrawing.cs:6085-6094 pitch90）', () => {
  it('TILE_ANIM_RATE 五档：326 每 5tick / 327·345·458·459 每 10tick', () => {
    expect(TILE_ANIM_RATE[326]).toBe(5);
    expect(TILE_ANIM_RATE[327]).toBe(10);
    expect(TILE_ANIM_RATE[345]).toBe(10);
    expect(TILE_ANIM_RATE[458]).toBe(10);
    expect(TILE_ANIM_RATE[459]).toBe(10);
  });

  it('8 帧回卷、pitch 90（帧带偏移 = 帧序×90,素材 720px=8 带）', () => {
    tileAnim.tick = 0;
    expect(animFrameIdx(326, 720)).toBe(0);
    tileAnim.tick = 5;
    expect(animFrameIdx(326, 720)).toBe(1);
    expect(animYOffset(326, 720)).toBe(90);
    tileAnim.tick = 40;
    expect(animFrameIdx(326, 720)).toBe(0);      // 40/5=8 → %8 回卷
    tileAnim.tick = 10;
    expect(animFrameIdx(327, 720)).toBe(1);      // 327 每 10tick
    expect(animFrameIdx(326, 720)).toBe(2);      // 326 每 5tick（10/5=2）
    tileAnim.tick = 75;
    expect(animFrameIdx(459, 720)).toBe(7);      // 75/10=7 → 末帧
    tileAnim.tick = 80;
    expect(animFrameIdx(459, 720)).toBe(0);      // >7 回卷
  });
});

describe('座钟授时（⚠️3,SceneMetrics.HasClock → accWatch=3）', () => {
  it('扫描窗内有落地钟 104 → hasClock；无 → false（SceneMetrics.cs:465-467）', () => {
    const w = new World(200, 120, 7, 'clock');
    const clockId = idOfSheet(104);
    w.store.setTileSilent(100, 60, clockId, 0, 0);
    w.store.setTileSilent(101, 60, clockId, 36, 0);
    for (let dy = 1; dy < 5; dy++) {
      w.store.setTileSilent(100, 60 + dy, clockId, 0, dy * 18);
      w.store.setTileSilent(101, 60 + dy, clockId, 36, dy * 18);
    }
    const s = scanScene(w, 100 * 16, 60 * 16, 0);
    expect(s.hasClock).toBe(true);
    // 窗 ±84×±62：(190,60) 窗 x≥106 扫不到 x=100..101 的钟
    const s2 = scanScene(w, 190 * 16, 60 * 16, 0);
    expect(s2.hasClock).toBe(false);
    expect(EMPTY_SCENE.hasClock).toBe(false);
  });

  it('授时精度档（Main.cs:46220-46227）：accWatch 3=真实分 / 1=整点 :00 / 2=半点', () => {
    // Main.time=21600（t=21600/3600-19.5+24=10.5 → 上午 10:30）——level3 真实分 /
    // level1 恒 :00 / level2 半点 :30
    expect(formatWatchText(21600, true, 3)).toContain('10:30');
    expect(formatWatchText(21600, true, 1)).toContain('10:00');
    expect(formatWatchText(21600, true, 2)).toContain('10:30');
    expect(formatWatchText(21200, true, 2)).toContain('10:00');   // 10:23 → 半点档 :00
  });
});

describe('陶罐顶部杂草 + 南瓜株成长（⚠️3,UpdateWorld :72376-72390）', () => {
  const SID = (s: number) => idOfSheet(s);
  function evoOf(w: World): WorldEvolution {
    const host = {
      store: w.store, worldSurface: 12, rockLevel: 18,
      flags: w.flags, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
      dungeonX: 0, difficulty: 0,
    };
    return new WorldEvolution(host);
  }

  it('陶罐 78 采样：上方空 + 掷中 → 顶部杂草 tile3（PlaceTile(3) frameX=Next(5)*18）', () => {
    const w = new World(40, 40, 7, 'pot');
    const evo = evoOf(w);
    w.store.setTileSilent(10, 20, SID(78), 0, 0);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.4);   // <0.5 命中 1/2 掷
    (evo as unknown as { overgroundTile: (i: number, j: number, wallDist: number) => void }).overgroundTile(10, 20, 0);
    rand.mockRestore();
    expect(w.store.get(10, 19)).toBe(SID(3));      // 杂草长在罐顶
  });

  it('陶罐上方被占 → 不长；掷未中 → 不长', () => {
    const w = new World(40, 40, 7, 'pot');
    const evo = evoOf(w);
    w.store.setTileSilent(10, 20, SID(78), 0, 0);
    w.store.setTileSilent(10, 19, SID(3), 0, 0);   // 已有杂草
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    (evo as unknown as { overgroundTile: (i: number, j: number, wallDist: number) => void }).overgroundTile(10, 20, 0);
    rand.mockRestore();
    expect(w.store.get(10, 19)).toBe(SID(3));      // 仍是原杂草（不叠加）
  });

  it('南瓜株 254 GrowPumpkin（cs:52522）：stage0 → 全格 fx+=36；草族支撑门', () => {
    const w = new World(40, 40, 7, 'pumpkin');
    const evo = evoOf(w);
    const t = SID(254);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 18 + dy, t, dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 20, SID(2));         // 草支撑
    w.store.setTileSilent(11, 20, SID(2));
    (evo as unknown as { growPumpkin: (i: number, j: number) => void }).growPumpkin(10, 18);
    expect(w.store.frameX[w.store.idx(10, 18)]).toBe(36);   // stage0 → 1
    expect(w.store.frameX[w.store.idx(11, 19)]).toBe(54);   // 右下格 36+18
    // stage4（fx=144）不再长
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 18 + dy, t, 144 + dx * 18, dy * 18);
    }
    (evo as unknown as { growPumpkin: (i: number, j: number) => void }).growPumpkin(10, 18);
    expect(w.store.frameX[w.store.idx(10, 18)]).toBe(144);
  });

  it('南瓜株支撑非草族（泥 53）→ 不长（cs:52552-52556 type∈{2,477,109,492}）', () => {
    const w = new World(40, 40, 7, 'pumpkin');
    const evo = evoOf(w);
    const t = SID(254);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 18 + dy, t, dx * 18, dy * 18);
    }
    w.store.setTileSilent(10, 20, SID(53));        // 沙——非草族
    w.store.setTileSilent(11, 20, SID(2));
    (evo as unknown as { growPumpkin: (i: number, j: number) => void }).growPumpkin(10, 18);
    expect(w.store.frameX[w.store.idx(10, 18)]).toBe(0);
  });
});
