// BJ441 定谳测试（2026-10-03 用户实报："每挖一个红木树叶块就会掉落一个红木树叶魔棒"）。
//
// 定谳锚（1457 反编译逐行亲读）：
// - 挖掘面【零掉落】才是原文本相：KillTile_GetItemDrops（WorldGen.cs:64477-66612）
//   对 192 生命树叶块（:66336 共享 no-drop 组）/384 红木树叶块（:66429 同组）无任何
//   dropItem 赋值→break（dropItem 恒 0）；Check* 帧检对这两 sheet 亦无 Item.NewItem。
// - 同族对照（早期修复在案）：191 生命木→9 木（:65049-65050）/383 生命红木→620 红木
//   （:64653-64654）——原版【有】掉落,本仓补 def.drop 使 place_v_ 回收支不可达
//   （tiles.ts drop:9/620,git e4933945 批）;192/384 原版【无】掉落,须压回收门
//   （Game.ts NO_RETURN_RECYCLE_SHEETS 三消费点同源：1×1 尾段/object 支/失撑链）。
// - 错位层：v_384/v_192 def.drop=null → 1×1 尾段 place_v_ 兜底（:24128-24131）必触发,
//   且阶段5 克隆退位（items.ts 文件尾⑦）把 place_v_384→vi_3361/ place_v_192→vi_933
//   （真件唯一性）→ 每挖必掉 100% 魔棒。魔棒正取面=摇树（:63691/:63699/:63703）。
// - 摇树概率钉值：Forest Next(300)==0→832 生命木魔棒（:63689-63691）;Jungle 两条独立
//   Next(200)==0→3360（:63697-63699）/3361（:63701-63703）——else-if 链互斥。
//
// 判别面：①运行时 breakTile 千格挖掘零掉落 + 对照组真掉落;②魔棒克隆退位身份
// （回收键==魔棒 vid,证明病灶物证）;③概率分母 RecordingRNG 结构钉（300/200/200）
// +千次采样统计（频率≈1/200,seeded 确定性无 flakes）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Game, NO_RETURN_RECYCLE_SHEETS, multiTileDropKey } from '../src/core/Game';
import { vanillaPlaceableTileKeys, PLACE_CLONE_SUPERSEDED, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI } from '../src/data/itemKeys';
import { RNG } from '../src/core/rng';
import { TreeShakeState, shakeTree, type TreeShakeHost, type TreeShakeSinks } from '../src/world/TreeShake';

interface Drop { key: string; n: number; x: number; y: number }

/** breakTile 裸架 harness（tile-drop-handover dropShell 同款） */
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    drops.push({ key, n, x, y });
    return null;
  };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}

const V_384 = TILE_BY_KEY['v_384_living_mahogany_leaves_block']!;
const V_192 = TILE_BY_KEY['v_192_living_leaf_block']!;
const V_191 = TILE_BY_KEY['v_191_living_wood_block']!;
const V_383 = TILE_BY_KEY['v_383_living_mahogany_block']!;
/** def 查找（TILE_BY_KEY 是内部 tile id,def 面在 TILE_DEFS） */
const defOf = (key: string) => TILE_DEFS.find((d) => d.key === key)!;

describe('BJ441 ①运行时：挖掘叶块零掉落（KillTile_GetItemDrops no-drop 组 :66336/:66429）', () => {
  it('挖 v_384 红木树叶块/v_192 生命树叶块：零掉落（修前=place_v_ 回收→魔棒 100%）', () => {
    for (const [tile, label] of [[V_384, '红木树叶块'], [V_192, '生命树叶块']] as const) {
      const w = new World(64, 64, 441, 'bj441');
      w.store.setTile(30, 30, tile, 0, 0);
      const drops: Drop[] = [];
      breakShell(w, drops).breakTile(30, 30);
      expect(drops, `${label} 挖掘不应有任何掉落`).toEqual([]);
    }
  });

  it('对照组：v_191 掉 9 木/v_383 掉 620 红木（早期修复同构面 :65049/:64653）', () => {
    for (const [tile, vid] of [[V_191, 9], [V_383, 620]] as const) {
      const w = new World(64, 64, 441, 'bj441');
      w.store.setTile(30, 30, tile, 0, 0);
      const drops: Drop[] = [];
      breakShell(w, drops).breakTile(30, 30);
      expect(drops.length, `掉落 ${vid} 应 1 件`).toBe(1);
      expect(drops[0].key).toBe(VI(vid));
    }
  });

  it('noItem 破坏链（灰烬连锁/裂砖 noItem:true 同门）对四 tile 全零掉落', () => {
    // 1×1 尾段三支全在 noItem 门内（:64373）;本仓尾段 if/else-if 已带门——
    // place_v_ 兜底同门=压制面无 noItem 例外（补 192/384 后自然成立,此处钉死防回退）
    for (const tile of [V_384, V_192, V_191, V_383]) {
      const w = new World(64, 64, 441, 'bj441');
      w.store.setTile(30, 30, tile, 0, 0);
      const drops: Drop[] = [];
      const g = breakShell(w, drops) as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean) => void };
      g.breakTile(30, 30, false, true);
      expect(drops, `tile ${tile} noItem 链不应掉落`).toEqual([]);
    }
  });
});

describe('BJ441 ②病灶物证：place_v_ 回收键经克隆退位直指原版魔棒（错位层证据）', () => {
  it('vanillaPlaceableTileKeys 命中 v_384/v_192（933/3361 createTile 反查,items.ts 阶段5 通道）', () => {
    const placeable = vanillaPlaceableTileKeys();
    expect(placeable.has('v_384_living_mahogany_leaves_block')).toBe(true);
    expect(placeable.has('v_192_living_leaf_block')).toBe(true);
    expect(VANILLA_ITEM_KEY_BY_ID[3361]).toBeDefined();
    expect(VANILLA_ITEM_KEY_BY_ID[933]).toBeDefined();
  });

  it('克隆退位：place_v_384→3361 红木树叶魔棒 / place_v_192→933 树叶魔棒（items.ts 尾⑦）', () => {
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_384_living_mahogany_leaves_block')).toBe(3361);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_192_living_leaf_block')).toBe(933);
    // 同族全谱：832→191 / 3360→383 同理曾被回收,但 191/383 def.drop 有值先短路（早期修）
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_191_living_wood_block')).toBe(832);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_383_living_mahogany_block')).toBe(3360);
  });

  it('修后三消费点单源压门（multiTileDropKey 纯函数面 = object 支/失撑链）', () => {
    const placeable = vanillaPlaceableTileKeys();
    for (const key of ['v_384_living_mahogany_leaves_block', 'v_192_living_leaf_block']) {
      const d = defOf(key);
      expect(NO_RETURN_RECYCLE_SHEETS.has(d.vanilla!.sheet!), `sheet ${d.vanilla!.sheet} 应入 NO_RETURN_RECYCLE_SHEETS`).toBe(true);
      expect(multiTileDropKey(d, placeable), `${key} multiTileDropKey 应空`).toBe('');
    }
    // 修前危险面探针（判别力锚）：def.drop=null + placeable 命中 + v_ 键——若无门,
    // 1×1 尾段（Game.ts place_v_ 兜底支）谓词即真 → 每挖必掉。门移除时本组红。
    for (const key of ['v_384_living_mahogany_leaves_block', 'v_192_living_leaf_block']) {
      const d = defOf(key);
      const wouldRecycleWithoutGate = d.drop == null
        && d.key.startsWith('v_')
        && placeable.has(d.key);
      expect(wouldRecycleWithoutGate, `${key} 无门时必触发 place_v_ 回收（病灶成立面）`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ③摇树概率钉值 + 千次采样（WorldGen.ShakeTree :63689-63703）
// ---------------------------------------------------------------------------

/** RecordingRNG：逐掷记录 (min,max)（分母=max+1）;队列值优先,空则恒 miss（1） */
class RecordingRNG extends RNG {
  rolls: Array<[number, number]> = [];
  private q: number[] = [];
  push(...v: number[]): this { this.q.push(...v); return this; }
  next(): number { return 0.5; }
  int(min: number, max: number): number {
    this.rolls.push([min, max]);
    return this.q.length ? this.q.shift()! : 1;
  }
  nextInt(maxValue: number): number { return this.int(0, maxValue - 1); }
}

const TREE = TILE_BY_KEY['tree']!;                       // sheet 5
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;  // sheet 60 → TreeTypes.Jungle
const GRASS = TILE_BY_KEY['grass']!;                     // sheet 2 → TreeTypes.Forest

/** 造一棵带冠顶标记帧的树（tree-shake.test plantTree 同款） */
function plantTree(w: World, x: number, groundY: number, groundTile: number, topY: number) {
  w.store.setTile(x, groundY, groundTile, 0, 0);
  for (let y = topY; y < groundY; y++) w.store.setTile(x, y, TREE, 0, 0);
  w.store.setTile(x, topY, TREE, 22, 198);
}

function makeHost(w: World): TreeShakeHost {
  return {
    st: w.store, isDay: true, halloween: false, raining: false, windyForButterflies: false,
    tenthAnniversary: false, getGoodWorld: false, remixWorld: false, notTheBees: false,
    drunkWorld: false, luck: 0,
  };
}

function makeSinks() {
  const items: Array<{ vid: number; stack: number }> = [];
  const sinks: TreeShakeSinks = {
    item: (vid, _x, _y, stack) => { items.push({ vid, stack }); },
    npc: () => {}, bomb: () => {}, beehive: () => {}, leaf: () => {}, ashDust: () => {},
  };
  return { items, sinks };
}

describe('BJ441 ③摇树魔棒概率面（Forest Next(300)→832;Jungle Next(200)→3360/3361）', () => {
  it('分母结构钉：魔棒支掷序 = Next(300),Next(300),Next(200),Next(200)（ Jungle 树）', () => {
    const w = new World(64, 120, 441, 'bj441');
    plantTree(w, 30, 60, JUNGLE_GRASS, 30);
    const { sinks } = makeSinks();
    const state = new TreeShakeState();
    state.bind(w.store);
    const rng = new RecordingRNG(1);
    // 全 miss 掷序：摇完记录整条分支链
    state.reset();
    shakeTree(makeHost(w), sinks, state, rng, new RNG(1), 30, 40);
    // :63685 Next(300)（832,F 门）/:63693 Next(300)（933,F 门）/:63697 Next(200)（3360）/
    // :63701 Next(200)（3361）——前四掷必须恰为 (0,299)×2 + (0,199)×2
    expect(rng.rolls.slice(0, 4)).toEqual([[0, 299], [0, 299], [0, 199], [0, 199]]);
  });

  it('命中钉：Next(300) 第 1 掷 0 → 832;Jungle 第 3 掷 0 → 3360 / 第 3 掷 miss 第 4 掷 0 → 3361', () => {
    const w = new World(64, 120, 441, 'bj441');
    plantTree(w, 30, 60, GRASS, 30);                 // 森林树
    plantTree(w, 40, 60, JUNGLE_GRASS, 30);          // 丛林树
    const state = new TreeShakeState();
    state.bind(w.store);

    const f = new RecordingRNG(1); f.push(0);        // 森林第 1 掷命中
    const s1 = makeSinks();
    state.reset();
    shakeTree(makeHost(w), s1.sinks, state, f, new RNG(1), 30, 40);
    expect(s1.items.filter((i) => i.vid === 832).length).toBe(1);

    const j0 = new RecordingRNG(1); j0.push(1, 1, 0); // 丛林：两掷 300 miss 后第 3 掷命中
    const s2 = makeSinks();
    state.reset();
    shakeTree(makeHost(w), s2.sinks, state, j0, new RNG(1), 40, 40);
    expect(s2.items.filter((i) => i.vid === 3360).length).toBe(1);
    expect(s2.items.filter((i) => i.vid === 3361).length).toBe(0);  // else-if 互斥

    const j1 = new RecordingRNG(1); j1.push(1, 1, 1, 0);
    const s3 = makeSinks();
    state.reset();
    shakeTree(makeHost(w), s3.sinks, state, j1, new RNG(1), 40, 40);
    expect(s3.items.filter((i) => i.vid === 3361).length).toBe(1);
    expect(s3.items.filter((i) => i.vid === 3360).length).toBe(0);
  });

  it('千次采样统计：频率 ≈ 原版概率（Jungle 1/200 ≈ 5/1000;Forest 1/300 ≈ 3.3/1000）', () => {
    const w = new World(64, 120, 441, 'bj441');
    plantTree(w, 20, 60, GRASS, 30);
    plantTree(w, 40, 60, JUNGLE_GRASS, 30);
    const state = new TreeShakeState();
    state.bind(w.store);
    const host = makeHost(w);
    const genRand = new RNG(20260923);               // 固定种:确定性无 flakes
    const mainRand = new RNG(20260924);

    const N = 1000;
    let w832 = 0, w3360 = 0, w3361 = 0, bothJungle = 0;
    for (let k = 0; k < N; k++) {
      state.reset();                                 // ResetTreeShakes=每日一摇逐树独立
      const { items, sinks } = makeSinks();
      shakeTree(host, sinks, state, genRand, mainRand, k % 2 === 0 ? 40 : 20, 40);
      const has3360 = items.some((i) => i.vid === 3360);
      const has3361 = items.some((i) => i.vid === 3361);
      if (has3360 && has3361) bothJungle++;
      w3360 += has3360 ? 1 : 0;
      w3361 += has3361 ? 1 : 0;
      w832 += items.some((i) => i.vid === 832) ? 1 : 0;
    }
    // 理论均值:832≈3.33(sd1.82)/3360≈5(sd2.23)/3361≈4.98(sd2.22)——宽界 3σ 以上防脆,
    // 显著偏离 1/300、1/200 档(如错写 1/20≈50、1/2≈500、100%≈1000)必爆
    expect(w832).toBeGreaterThan(0);
    expect(w832).toBeLessThanOrEqual(12);
    expect(w3360).toBeGreaterThan(0);
    expect(w3360).toBeLessThanOrEqual(15);
    expect(w3361).toBeGreaterThan(0);
    expect(w3361).toBeLessThanOrEqual(15);
    expect(bothJungle, 'else-if 链互斥:单次摇树不得同掉双魔棒').toBe(0);
    // 掘地面反向统计：1000 次挖掘零魔棒（与 ①运行时单点互补的批量面）
    const w2 = new World(16, 16, 441, 'bj441-mine');
    let minedWands = 0;
    for (let k = 0; k < N; k++) {
      const drops: Drop[] = [];
      const g = breakShell(w2, drops);
      w2.store.setTile(8, 8, k % 2 === 0 ? V_384 : V_192, 0, 0);
      g.breakTile(8, 8);
      if (drops.length > 0) minedWands++;
    }
    expect(minedWands, '千格挖掘叶块应零掉落（原版挖掘面无魔棒概率,摇树才有）').toBe(0);
  });
});
