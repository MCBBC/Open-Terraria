// 树生命周期补全批（2026-08-17"不允许遗漏"指令）：
//   ①橡实放置全锚点 + 交替档帧（TileObjectData tile20 :4858-4900）
//   ②再生之斧补种门（IsBottomOfTreeTrunkNoRoots :45168-45185）
//   ③露西斧台词机（LucyAxeMessage 冷却/variation）
//   ④树苗成长分发锚点帧（frameX/54 档 → 棕榈/灰烬/普通树，AttemptToGrowTreeFromSapling :72860）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, T, TILE_DEFS } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { growPalmTree, growTree, growAshTree } from '../src/world/gen/vanilla/TreePass';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import {
  setLucySinks, lucyEnterWorld, lucyTryIdle, lucyTryWithCooldown,
  putLucyOnCooldown, lucyCooldownOf, lucyVariation,
} from '../src/items/LucyAxe';

interface Shell {
  world: World; chunks: { markDirtyArea: () => void };
  placeAcornSapling(x: number, y: number): boolean;
  isBottomOfTreeTrunkNoRoots(x: number, y: number): boolean;
}

function shell(w: World): Shell {
  const g = Object.create(Game.prototype) as unknown as Shell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  return g;
}

function ground(w: World, sheet: number): World {
  const key = TILE_DEFS.find((d) => d.vanilla?.sheet === sheet)?.key;
  const id = key ? TILE_BY_KEY[key] : 0;
  for (let x = 0; x < 30; x++) w.store.setTileSilent(x, 20, id || 1, 0, 0);
  return w;
}

describe('橡实放置（TileObjectData tile20 全锚点 + 交替档帧）', () => {
  const CASES: Array<[number, number]> = [   // [地面 sheet, 档]
    [2, 0], [477, 0], [147, 3], [60, 6], [23, 9], [661, 9],
    [199, 12], [662, 12], [109, 15], [492, 15],
    [53, 18], [116, 21], [234, 24], [112, 27], [633, 30],
  ];
  it('11 类地面全可种（沙族→棕榈档 6-9、灰烬草→10），帧落带内', () => {
    for (const [gsheet, alt] of CASES) {
      const w = ground(new World(30, 40, 15, 'open'), gsheet);
      const g = shell(w);
      expect(g.placeAcornSapling(10, 19), `sheet ${gsheet}`).toBe(true);
      expect(w.store.get(10, 19)).toBe(T.SAPLING);
      const fx = w.store.frameX[w.store.idx(10, 19)];
      expect(fx, `sheet ${gsheet} 帧 ${fx} 应在档 ${alt} 带 [${alt * 18},${(alt + 3) * 18})`)
        .toBeGreaterThanOrEqual(alt * 18);
      expect(fx).toBeLessThan((alt + 3) * 18);
      expect(Math.floor(fx / 54)).toBe(alt / 3);   // 成长分发档
    }
  });

  it('非锚点地面（石头/泥土）与液体格拒绝，静默失败', () => {
    const w = ground(new World(30, 40, 15, 'open'), 1);   // 石头
    const g = shell(w);
    expect(g.placeAcornSapling(10, 19)).toBe(false);
    expect(w.store.get(10, 19)).toBe(0);
    const w2 = ground(new World(30, 40, 15, 'open'), 2);
    w2.store.setLiquid(10, 19, 200, 1);
    expect(shell(w2).placeAcornSapling(10, 19)).toBe(false);
    // 半砖地面拒绝（整砖门）
    const w3 = ground(new World(30, 40, 15, 'open'), 2);
    w3.store.setTileSilent(10, 20, T.GRASS, 0, 0);
    w3.store.half[w3.store.idx(10, 20)] = 1;
    expect(shell(w3).placeAcornSapling(10, 19)).toBe(false);
  });
});

describe('再生之斧补种门（IsBottomOfTreeTrunkNoRoots）', () => {
  it('干底（任意干帧）true / 根帧 false / 非干 false / 棕榈恒 true', () => {
    const w = new World(30, 40, 15, 'open');
    const g = shell(w);
    const TREE = T.TREE;
    w.store.setTileSilent(10, 19, TREE, 0, 0);              // 普通干身
    expect(g.isBottomOfTreeTrunkNoRoots(10, 19)).toBe(true);
    w.store.setTileSilent(10, 19, TREE, 44, 154);           // 根帧（22/44 @132-176）
    expect(g.isBottomOfTreeTrunkNoRoots(10, 19)).toBe(false);
    w.store.setTileSilent(10, 19, TREE, 44, 198);           // 冠帧带不是根
    expect(g.isBottomOfTreeTrunkNoRoots(10, 19)).toBe(true);
    const PALM = TILE_BY_KEY['v_323_palm_trees'];
    w.store.setTileSilent(10, 19, PALM, 44, 154);           // 棕榈无根帧豁免
    expect(g.isBottomOfTreeTrunkNoRoots(10, 19)).toBe(true);
    w.store.setTileSilent(10, 19, T.GRASS, 0, 0);           // 非干
    expect(g.isBottomOfTreeTrunkNoRoots(10, 19)).toBe(false);
  });
});

describe('露西斧台词机（LucyAxeMessage）', () => {
  it('冷却链：进世界 Idle 7200-14400t / 说话后 Idle 推远 / 带冷却源 420t 内抑制', () => {
    const popups: string[] = [];
    setLucySinks({
      popup: (t) => { popups.push(t); },
      talk: () => {}, emote: () => {},
      top: () => ({ x: 0, y: 0 }), direction: () => 1,
    });
    lucyEnterWorld();
    expect(lucyCooldownOf('idle')).toBeGreaterThanOrEqual(7200);
    expect(lucyCooldownOf('idle')).toBeLessThan(14400);
    lucyTryIdle();                       // 冷却中 → 不说话
    expect(popups.length).toBe(0);
    putLucyOnCooldown('idle', 0);        // 清零后 → 说 Idle（l10n 未载时文本 null，仅计数 variation）
    const v0 = lucyVariation();
    lucyTryIdle();
    expect(lucyVariation()).toBe((v0 + 1) & 0xFF);
    expect(lucyCooldownOf('idle')).toBeGreaterThan(0);   // GiveIdleMessageCooldown 推远
    // 420t 冷却源：首触发 + 冷却，二次抑制（variation 首触发即 +1，抑制后不再增）
    putLucyOnCooldown('choppedCactus', 0);
    lucyTryWithCooldown('choppedCactus', 420);
    expect(lucyCooldownOf('choppedCactus')).toBe(420);
    expect(lucyVariation()).toBe((v0 + 2) & 0xFF);      // idle(+1) + cactus 首触发(+1)
    lucyTryWithCooldown('choppedCactus', 420);
    expect(lucyVariation()).toBe((v0 + 2) & 0xFF);      // 冷却内未再自增
    setLucySinks(null);
  });
});

describe('树苗成长分发（AttemptToGrowTreeFromSapling 档位）', () => {
  it('style 6 沙地苗 → growPalmTree 成棕榈（干列+登记）', () => {
    const w = ground(new World(30, 40, 15, 'open'), 53);   // 沙地
    const st = w.store;
    st.setTileSilent(10, 19, T.SAPLING, (18 + 1) * 18, 0);  // 档 18 → /54 = 6
    const gs = { genTrees: w.trees, seedFlags: {} } as unknown as GenState;   // TreePass 直读 gs.seedFlags.errorWorld 等,真实 worldgen 恒有(普通档={})
    expect(growPalmTree(st, new RNG(12345), 10, 19, gs)).toBe(true);
    // 棕榈已立（该列出现 v_323）
    let anyPalm = false;
    for (let y = 5; y < 20; y++) if (st.get(10, y) === TILE_BY_KEY['v_323_palm_trees']) anyPalm = true;
    expect(anyPalm).toBe(true);
  });

  it('绿草苗 → growTree 全套（干+冠标记帧+登记表）', () => {
    const w = ground(new World(30, 40, 15, 'open'), 2);
    const st = w.store;
    st.setTileSilent(10, 19, T.SAPLING, 0, 0);
    const gs = { genTrees: w.trees, seedFlags: {} } as unknown as GenState;   // TreePass 直读 gs.seedFlags.errorWorld 等,真实 worldgen 恒有(普通档={})
    expect(growTree(st, new RNG(777), gs, 10, 19)).toBe(true);
    let crown = false;
    for (let y = 0; y < 20; y++) {
      if (st.get(10, y) === T.TREE && st.frameY[st.idx(10, y)] >= 198) crown = true;
    }
    expect(crown).toBe(true);       // 树顶冠标记帧（fellTree/dropVanillaTreeLoot 消费）
    expect(w.trees.length).toBe(1);
  });

  it('灰烬草苗 style 10 → growAshTree（sheet 634）', () => {
    const w = ground(new World(30, 40, 15, 'open'), 633);
    const st = w.store;
    st.setTileSilent(10, 19, T.SAPLING, (30 + 1) * 18, 0);  // 档 30 → /54 = 10
    expect(growAshTree(st, new RNG(999), 10, 19)).toBe(true);
    let any = false;
    for (let y = 0; y < 20; y++) if (st.get(10, y) === TILE_BY_KEY['v_634_ash_tree']) any = true;
    expect(any).toBe(true);
  });
});
