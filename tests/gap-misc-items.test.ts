// §8 余项回归：1315 海盗地图 / 5644 占卜球 / 5334 奥库瑞姆剃刀 /
// 1905 蓝/黄串灯（圣诞树装饰族 1874-1905）。
//   1315：Player.cs:43277 → Main.CanStartInvasion(:63863)——无进行中 + 生命上限≥200，
//         ★无昼夜门（"夜间使用"系误传）；useTime 45（Item.cs:16269-16276）。
//   5644：Item.cs:44324-44333 useStyle 15 HoldOrb/useTime 100；Player.cs:43011-43030
//         无观战目标 → Item198 + Game.SpectateSinglePlayer（观战镜头=引擎级缺口）。
//   5334：Item.cs:42276-42287（Variant 条件块提取缺口补丁）；NPC.SpawnMechQueen
//         :19724-19750 双门 + LegacyMisc[107] 公告。
//   1905：Player.PlaceThing_XMasTreeTops :41053-41136 + WorldGen :39239-39500。
import { describe, it, expect } from 'vitest';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { canStartInvasion, INVASION_PIRATE } from '../src/world/Invasion';
import { World } from '../src/world/World';
import {
  xmasDecorOfItem, xmasDecorItem, xmasCell, xmasDecorStyle, xmasSetDecor,
  XMAS_TREE_W, XMAS_TREE_H,
} from '../src/world/XmasTree';
import { TileStore } from '../src/world/TileStore';
import zhHans from '../public/l10n/zh-Hans.json';

function bareWorld(): World {
  return new World(40, 40, 42, 'gap-misc');
}

describe('1315 海盗地图（Player.cs:43277 + Main.cs:63863）', () => {
  it('数据面：consumable/useTime 45（Item.cs:16269-16276）', () => {
    const c = itemCombat(1315)!;
    expect(c.consumable).toBe(true);
    expect(c.useTime).toBe(45);
  });

  it('CanStartInvasion 1:1：无进行中 + 生命上限≥200；ignoreDelay 跳过冷却', () => {
    const w = bareWorld();
    expect(canStartInvasion(w, 199, true)).toBe(false);   // 生命上限 <200 拒绝
    expect(canStartInvasion(w, 200, true)).toBe(true);    // =200 放行（:63876 >=200）
    w.invasionType = INVASION_PIRATE;
    expect(canStartInvasion(w, 400, true)).toBe(false);   // 已有入侵进行中
    w.invasionType = 0;
    w.invasionDelay = 3600;
    expect(canStartInvasion(w, 400, false)).toBe(false);  // 冷却中且不忽略
    expect(canStartInvasion(w, 400, true)).toBe(true);    // 物品触发 ignoreDelay=true
  });
});

describe('5644 占卜球（Item.cs:44324 + Player.cs:43011-43030）', () => {
  it('数据面：useTime/useAnimation 100，不消耗（无 consumable）', () => {
    const c = itemCombat(5644)!;
    expect(c.useTime).toBe(100);
    expect(c.useAnimation).toBe(100);
    expect(c.consumable).toBeUndefined();
  });

  it('无观战目标文案键在库（Game.SpectateSinglePlayer）', () => {
    expect((zhHans as Record<string, Record<string, string>>).Game.SpectateSinglePlayer)
      .toContain('倒影');
  });
});

describe('5334 奥库瑞姆剃刀（Item.cs:42276 + NPC.cs:19724）', () => {
  it('数据面：Variant 条件块提取缺口已补（consumable/useTime 45）', () => {
    const c = itemCombat(5334)!;
    expect(c.consumable).toBe(true);
    expect(c.useTime).toBe(45);
  });

  it('无 shoot → 不落战斗派发（combatWeapon 不接管，走 5334 专属分支）', () => {
    expect(itemCombat(5334)!.shoot).toBeUndefined();
  });
});

describe('圣诞树装饰族 1874-1905（Player.cs:41060-41120）', () => {
  it('物品 → (槽,样式) 四段减法 1:1', () => {
    expect(xmasDecorOfItem(1874)).toEqual({ obj: 0, style: 1 });
    expect(xmasDecorOfItem(1877)).toEqual({ obj: 0, style: 4 });
    expect(xmasDecorOfItem(1878)).toEqual({ obj: 1, style: 1 });
    expect(xmasDecorOfItem(1883)).toEqual({ obj: 1, style: 6 });
    expect(xmasDecorOfItem(1884)).toEqual({ obj: 2, style: 1 });
    expect(xmasDecorOfItem(1894)).toEqual({ obj: 2, style: 11 });
    expect(xmasDecorOfItem(1895)).toEqual({ obj: 3, style: 1 });
    expect(xmasDecorOfItem(1905)).toEqual({ obj: 3, style: 11 });
    expect(xmasDecorOfItem(1873)).toBeNull();   // 圣诞树本体不是装饰
    expect(xmasDecorOfItem(1906)).toBeNull();
  });

  it('槽样式 → 掉落物 id（dropXmasTree :39396-39426）', () => {
    expect(xmasDecorItem(0, 1)).toBe(1874);
    expect(xmasDecorItem(0, 4)).toBe(1877);
    expect(xmasDecorItem(1, 6)).toBe(1883);
    expect(xmasDecorItem(2, 11)).toBe(1894);
    expect(xmasDecorItem(3, 11)).toBe(1905);
    expect(xmasDecorItem(3, 0)).toBe(0);        // 无装饰不掉
  });

  it('xmasCell：原版帧约定（锚点 frameX=10 哨兵 + 裸索引）', () => {
    const st = new TileStore(40, 40);
    // 锚点 (10,10) frameX=10；非锚点写裸列/行索引（PlaceXmasTree_Direct :39584-39593）
    st.setTile(10, 10, 7, 10, 0);
    st.setTile(13, 17, 7, 3, 7);
    expect(xmasCell(st, 10, 10)).toEqual({ ax: 10, ay: 10, col: 0, row: 0 });
    expect(xmasCell(st, 13, 17)).toEqual({ ax: 10, ay: 10, col: 3, row: 7 });
  });

  it('xmasCell：本仓 18px 步长约定（framedCellFrame 放置产物）', () => {
    const st = new TileStore(40, 40);
    for (let dx = 0; dx < XMAS_TREE_W; dx++) {
      for (let dy = 0; dy < XMAS_TREE_H; dy++) st.setTile(20 + dx, 20 + dy, 7, dx * 18, dy * 18);
    }
    expect(xmasCell(st, 20, 20)).toEqual({ ax: 20, ay: 20, col: 0, row: 0 });
    expect(xmasCell(st, 23, 27)).toEqual({ ax: 20, ay: 20, col: 3, row: 7 });
    expect(xmasCell(st, 21, 22)).toEqual({ ax: 20, ay: 20, col: 1, row: 2 });
  });

  it('装饰位段读写（setXmasTree :39430 / checkXmasTreeDrop :39239）：四槽互不干扰', () => {
    const st = new TileStore(40, 40);
    st.setTile(10, 10, 7, 0, 0);
    expect(xmasDecorStyle(st, 10, 10, 0)).toBe(-1);   // 初始无装饰
    xmasSetDecor(st, 10, 10, 0, 3);                   // 树顶饰样式 3（位 0-2 = 0b011）
    xmasSetDecor(st, 10, 10, 1, 5);                   // 花环样式 5（位 3-5）
    xmasSetDecor(st, 10, 10, 2, 9);                   // 彩球样式 9（位 6-9）
    xmasSetDecor(st, 10, 10, 3, 11);                  // 串灯样式 11（位 10-13）
    expect(xmasDecorStyle(st, 10, 10, 0)).toBe(3);
    expect(xmasDecorStyle(st, 10, 10, 1)).toBe(5);
    expect(xmasDecorStyle(st, 10, 10, 2)).toBe(9);
    expect(xmasDecorStyle(st, 10, 10, 3)).toBe(11);
    // frameY 位段编码 1:1：3 | 5<<3 | 9<<6 | 11<<10
    expect(st.frameY[st.idx(10, 10)]).toBe(3 | (5 << 3) | (9 << 6) | (11 << 10));
    // 换槽 0 不动其他槽
    xmasSetDecor(st, 10, 10, 0, 1);
    expect(xmasDecorStyle(st, 10, 10, 0)).toBe(1);
    expect(xmasDecorStyle(st, 10, 10, 3)).toBe(11);
  });

  it('装饰写入后锚点仍可定位（frameY 非 18 倍数时向上扫描）', () => {
    const st = new TileStore(40, 40);
    for (let dx = 0; dx < XMAS_TREE_W; dx++) {
      for (let dy = 0; dy < XMAS_TREE_H; dy++) st.setTile(20 + dx, 20 + dy, 7, dx * 18, dy * 18);
    }
    xmasSetDecor(st, 20, 20, 3, 11);                  // 锚点 frameY 写入 11<<10=11264
    expect(xmasCell(st, 20, 20)).toEqual({ ax: 20, ay: 20, col: 0, row: 0 });
    expect(xmasDecorStyle(st, 20, 20, 3)).toBe(11);
  });
});
