// SW-BJ50（2026-09-09）特殊篝火挖掉变普通篝火——放置侧 placeStyle 缺档定谳+修复钉值。
// 金标（1457 终值；1458 同域 GetCampfireItemDrop :50489-50520 逐字节同,无增量变更面）：
//   · 掉落表 GetCampfireItemDrop（Terarria1457/Terraria/WorldGen.cs:50481-50512）：
//     0→966 / 1-5→3046+s-1（诅咒/恶魔/冰霜/灵液/彩虹）/ 6→3723（超亮）/ 7→3724（骨）
//     / 8-13→4689+s-8（沙漠/珊瑚/腐化/猩红/神圣/丛林）/ 14→5299（蘑菇）/ 15→5357（微光）
//     / 越界 default→966。style=frameX/54（KillTile_GetItemDrops :64497-64500 fx/54、
//     Check3x2 case 215 :49995 num6 同函数）。
//   · 放置侧 Item.cs SetDefaults 三段共享 case 算式：:28181-28193
//     `placeStyle = 1 + type - 3046`（3046-3050）、:33002-33011
//     `placeStyle = 6 + type - 3723`（3723/3724）、:38599-38612
//     `placeStyle = 8 + type - 4689`（4689-4694）；显式档 5299=14（:42033）、
//     5357=15（:42501）、966 缺省 0（:12525-12531）。
//   · 点燃态语义：Wiring.ToggleCampFire（Wiring.cs:3013-3060）frameY += ±36、
//     lit=frameY>=36——frameX 不动 ⇒ 掉落反推与点燃态无关。
// 定谳：掉落侧 S2 批已在册（vanillaStyleDrops Campfires 表+styleFromFrame[215]=fx/54+
// Game.breakTile object 分支消费）✅健在；真根=放置侧 itemfunc 提取器对共享 case 算式
// 解不开（3046-3049/3723/4689-4693 整条目缺失、3050/3724/4694 只余 createTile）⇒
// 13 件变体 placeStyle 全缺 ⇒ 放置恒 style0（普通篝火帧）⇒ 挖掉 GetCampfireItemDrop(0)=966。
// 修复=items.ts PLACE_STYLE_BACKFILL_1458 补 13 条（本测试全矩阵钉死）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { styleDropVid, styleDropVidOfFrames, styleFromFrame } from '../src/data/vanillaStyleDrops';
import { framedCellFrame } from '../src/world/FurnitureStyle';

interface Drop { key: string; n: number }

/** 1457 Item.cs/WorldGen.cs 双侧金标：vid ↔ placeStyle ↔ GetCampfireItemDrop */
const GOLD_STYLE_OF_VID: Readonly<Record<number, number>> = {
  966: 0,
  3046: 1, 3047: 2, 3048: 3, 3049: 4, 3050: 5,
  3723: 6, 3724: 7,
  4689: 8, 4690: 9, 4691: 10, 4692: 11, 4693: 12, 4694: 13,
  5299: 14, 5357: 15,
};
/** GetCampfireItemDrop（WorldGen.cs:50481-50512）逐 style 终值 */
const GOLD_DROP_OF_STYLE: readonly number[] = [
  966,
  3046, 3047, 3048, 3049, 3050,
  3723, 3724,
  4689, 4690, 4691, 4692, 4693, 4694,
  5299, 5357,
];
const CAMPSHEET = 215;
const keyOfVid = (vid: number): string => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(k, `vid ${vid} 应有 vi_ 键`).toBeDefined();
  return k!;
};
const defOfVid = (vid: number) => {
  const k = keyOfVid(vid);
  const idx = (ITEM_BY_KEY as Record<string, number>)[k];
  expect(idx, `vid ${vid} 应有 def`).toBeDefined();
  return ITEM_DEFS[idx!];
};
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

describe('SW-BJ50 A. 放置侧 placeStyle 金标（Item.cs 三段共享 case 算式 + 显式档）', () => {
  it('16 件篝火物品 placeStyle 终态 == vanilla（曾 13 件缺档恒 style0）', () => {
    for (const [vidStr, exp] of Object.entries(GOLD_STYLE_OF_VID)) {
      const vid = Number(vidStr);
      const d = defOfVid(vid);
      expect(d.tile, `vid ${vid} tile`).toBe('v_215_campfires');
      expect(d.placeStyle ?? 0, `vid ${vid} placeStyle`).toBe(exp);
    }
  });

  it('放置帧合成（Game 通用放置链 framedCellFrame 同入口,Game.ts:23429）：style N → frameX=N*54', () => {
    for (const [vidStr, exp] of Object.entries(GOLD_STYLE_OF_VID)) {
      const d = defOfVid(Number(vidStr));
      // 顶行锚格 (dx=0,dy=0) 与右下格 (dx=2,dy=1)
      const [ax, ay] = framedCellFrame(CAMPSHEET, 3, d.placeStyle ?? 0, 0, 0);
      const [bx, by] = framedCellFrame(CAMPSHEET, 3, d.placeStyle ?? 0, 2, 1);
      expect(ax, `vid ${vidStr} 锚格 frameX`).toBe(exp * 54);
      expect(ay, `vid ${vidStr} 锚格 frameY`).toBe(0);
      expect(bx, `vid ${vidStr} 底行 frameX`).toBe(exp * 54 + 36);
      expect(by, `vid ${vidStr} 底行 frameY`).toBe(18);
    }
  });
});

describe('SW-BJ50 B. 掉落侧金标（GetCampfireItemDrop :50481,style=fx/54 :64497/:49995）', () => {
  it('styleDropVid(215, 0..15) 16 档全矩阵', () => {
    for (let s = 0; s < GOLD_DROP_OF_STYLE.length; s++) {
      expect(styleDropVid(CAMPSHEET, s), `style ${s}`).toBe(GOLD_DROP_OF_STYLE[s]);
    }
  });

  it('越界回落 default 966（C# switch default 支,WorldGen.cs:50508-50511）', () => {
    expect(styleDropVid(CAMPSHEET, 16)).toBe(966);
    expect(styleDropVid(CAMPSHEET, 99)).toBe(966);
  });

  it('styleFromFrame[215]=fx/54 与点燃态无关（ToggleCampFire fy±36,:3013-3060）', () => {
    expect(styleFromFrame[CAMPSHEET](54, 0)).toBe(1);      // 诅咒 未点燃顶行
    expect(styleFromFrame[CAMPSHEET](54, 36)).toBe(1);     // 点燃顶行
    expect(styleFromFrame[CAMPSHEET](54, 54)).toBe(1);     // 点燃底行
    expect(styleFromFrame[CAMPSHEET](54 + 36, 18)).toBe(1); // 命中中列
    expect(styleDropVidOfFrames(CAMPSHEET, 54, 0)).toBe(styleDropVidOfFrames(CAMPSHEET, 54, 54));
  });
});

describe('SW-BJ50 C. 挖掉端到端（breakTile object 分支,16 style × 点燃态）', () => {
  const tileId = (TILE_BY_KEY as Record<string, number | undefined>)['v_215_campfires']!;
  const place6 = (w: World, x: number, y: number, style: number, lit: boolean) => {
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      const [fx, fy] = framedCellFrame(CAMPSHEET, 3, style, dx, dy);
      w.store.setTileSilent(x + dx, y + dy, tileId, fx, fy + (lit ? 36 : 0));
    }
  };

  it('16 档全矩阵：style N 篝火挖掉 → GetCampfireItemDrop(N) 对应物品（未点燃）', () => {
    const w = new World(64, 40, 7, 'bj50');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    for (let s = 0; s < 16; s++) {
      const x = 2 + s * 4, y = 8;
      place6(w, x, y, s, false);
      g.breakTile(x + 1, y + 1, false);   // 命中底行中列（非锚格）
      expect(drops[s]?.key, `style ${s}`).toBe(keyOfVid(GOLD_DROP_OF_STYLE[s]));
      expect(drops[s]?.n, `style ${s} 数量`).toBe(1);
    }
  });

  it('点燃态挖掉同档（lit=frameY>=36,fx 不动）：style1/8/15 点燃 vs 未点燃同掉', () => {
    for (const s of [1, 8, 15]) {
      const w = new World(40, 40, 7, 'bj50');
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      place6(w, 10, 10, s, true);
      g.breakTile(11, 11, false);
      expect(drops, `style ${s} lit`).toEqual([{ key: keyOfVid(GOLD_DROP_OF_STYLE[s]), n: 1 }]);
    }
  });

  it('命中任一格整件回收（锚点扫描）：style5 命中左上格也掉 vi_3050 彩虹篝火', () => {
    const w = new World(40, 40, 7, 'bj50');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    place6(w, 10, 10, 5, false);
    g.breakTile(10, 10, false);
    expect(drops).toEqual([{ key: keyOfVid(3050), n: 1 }]);
  });
});
