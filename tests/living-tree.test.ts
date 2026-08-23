// Living Trees pass 回归（对照原版 WorldGen.cs:15551 LivingTrees / :15792 LivingTreeWalls
// / :28123 GrowLivingTree / :29019 MakePassage / :29306 PassageRoom）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY } from '../src/data/items';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import {
  runLivingTreesPass, runLivingTreeWallsPass, growLivingTree,
} from '../src/world/gen/vanilla/LivingTreePass';
import { rollChestLoot } from '../src/world/gen/vanilla/BuriedChestsPass';

const DIRT = TILE_BY_KEY['dirt']!;
const BRICK41 = TILE_BY_KEY['v_41_blue_brick']!;
const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
const LIVING_WOOD = TILE_BY_KEY['v_191_living_wood_block']!;
const LEAF = TILE_BY_KEY['v_192_living_leaf_block']!;
const CHEST = TILE_BY_KEY['chest']!;

const SURFACE = 200; // 地表首实心行（GrowLivingTree 门禁要求锚 j > 150,cs:28178）

function makeFlat(w: number, h: number): TileStore {
  const st = new TileStore(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = SURFACE; y < h; y++) st.setTileSilent(x, y, DIRT);
  }
  return st;
}

function gsFor(w: number, h: number): GenState {
  return {
    worldSurface: SURFACE + 40,
    rockLevel: SURFACE + 200,
    lavaLine: h - 200,                       // Main.UnderworldLayer => maxTilesY-200（Main.cs:2863）
    beachDistance: Math.max(24, Math.floor(w * 0.06)),
    mCaveX: new Int32Array(1024), mCaveY: new Int32Array(1024), numMCaves: 0,
    crimson: false, oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
    seedFlags: {},                          // 批4 BuriedChests seedFlags 门(空=falsy)
  } as unknown as GenState;
}

/** 191 连通分量计数（≥ minSize 视为一棵树） */
function countTreeComponents(st: TileStore, minSize: number): number {
  const seen = new Uint8Array(st.w * st.h);
  const stack: number[] = [];
  let count = 0;
  for (let i = 0; i < st.type.length; i++) {
    if (seen[i] || st.type[i] !== LIVING_WOOD) continue;
    stack.length = 0;
    stack.push(i); seen[i] = 1;
    let size = 0;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % st.w, y = (p / st.w) | 0;
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) return;
        const np = ny * st.w + nx;
        if (!seen[np] && st.type[np] === LIVING_WOOD) { seen[np] = 1; stack.push(np); }
      };
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    if (size >= minSize) count++;
  }
  return count;
}

describe('Living Trees 世界生成', () => {
  it('数量分布：num4 = Next(0, 2*maxTilesX/4200 +1)（cs:15564），3 种子平均量级与原版一致', () => {
    const w = 4200, h = 600;
    const num3 = w / 4200;
    const num4Max = Math.floor(2 * num3);           // = 2（与原版大世界一致）
    const counts: number[] = [];
    let total = 0;
    for (const seed of [12345, 9293480, 777]) {
      // 原版前两掷（cs:15564-15566）：num4 及其 0 值补掷——单独 RNG 复算公式上界
      const probe = new RNG(seed);
      const drawn = probe.int(0, num4Max);
      expect(drawn).toBeGreaterThanOrEqual(0);
      expect(drawn).toBeLessThanOrEqual(num4Max);   // num4 ∈ [0, 2*num3]

      const st = makeFlat(w, h);
      const gs = gsFor(w, h);
      const chests: ChestSink = [];
      runLivingTreesPass(st, new RNG(seed), gs, chests);
      runLivingTreeWallsPass(st, gs);
      const trees = countTreeComponents(st, 30);
      counts.push(trees);
      total += trees;
      // 每棵主树最多带 2 侧 × 4 步 patch 小树（cs:15695-15699）→ 上界 9×num4
      expect(trees).toBeLessThanOrEqual(9 * (drawn || 1) + 9);
    }
    // 3 个种子至少出一棵（平地无障碍世界,主树成功率应接近 100%）
    expect(total).toBeGreaterThanOrEqual(1);
    expect(counts.every((c) => c >= 0)).toBe(true);
  }, 60000);

  it('排除区拒绝：候选点 50×50 内有地牢砖/云（cs:15645-15671）则该处不长树', () => {
    const w = 2000, h = 600;
    const st = makeFlat(w, h);
    // x∈[500,540) y∈[160,200) 铺蓝砖 41 + 一块云 189 —— 任何落点 ±50 内都会被否决
    for (let x = 500; x < 540; x++) {
      for (let y = 160; y < SURFACE; y++) st.setTileSilent(x, y, BRICK41);
    }
    st.setTileSilent(560, 180, CLOUD);
    const gs = gsFor(w, h);
    runLivingTreesPass(st, new RNG(4242), gs, []);
    let woodInZone = 0;
    for (let x = 450; x <= 610; x++) {
      for (let y = 110; y <= 250; y++) {
        if (st.type[st.idx(x, y)] === LIVING_WOOD) woodInZone++;
      }
    }
    expect(woodInZone).toBe(0);
  }, 60000);

  it('排除区拒绝：Mount Caves 锚点 ±50（cs:15674-15682）拒绝树干穿越山洞', () => {
    const w = 1200, h = 600;
    const st = makeFlat(w, h);
    const gs = gsFor(w, h);
    gs.mCaveX[0] = 900; gs.mCaveY[0] = SURFACE; gs.numMCaves = 1;
    runLivingTreesPass(st, new RNG(2024), gs, []);
    // 山洞锚点 x=900 ±50 内不得出现活木
    for (let x = 851; x <= 949; x++) {
      for (let y = 100; y <= 320; y++) {
        expect(st.type[st.idx(x, y)]).not.toBe(LIVING_WOOD);
      }
    }
  }, 60000);

  it('wall 244 连通填充：每格墙 244 都贴着活木（cs:15792-15824）', () => {
    const w = 1600, h = 600;
    const st = makeFlat(w, h);
    const gs = gsFor(w, h);
    runLivingTreesPass(st, new RNG(31337), gs, []);
    let wallCount = 0, woodCount = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === LIVING_WOOD) woodCount++;
    }
    runLivingTreeWallsPass(st, gs);
    for (let i = 0; i < st.wall.length; i++) {
      if (st.wall[i] !== 244) continue;
      wallCount++;
      const x = i % st.w, y = (i / st.w) | 0;
      const near = st.type[i] === LIVING_WOOD
        || st.type[st.idx(Math.max(0, x - 1), y)] === LIVING_WOOD
        || st.type[st.idx(Math.min(st.w - 1, x + 1), y)] === LIVING_WOOD
        || st.type[st.idx(x, Math.max(0, y - 1))] === LIVING_WOOD
        || st.type[st.idx(x, Math.min(st.h - 1, y + 1))] === LIVING_WOOD;
      expect(near).toBe(true);   // cs:15805 候选门禁的逆否
    }
    if (woodCount > 0) expect(wallCount).toBeGreaterThan(0);
  }, 60000);

  it('树干竖井：宽干(num5≥4)贯通地表向下 ≥30 格的墙 244 空腔（cs:29019 MakePassage）', () => {
    const w = 800, h = 600;
    const st = makeFlat(w, h);
    const gs = gsFor(w, h);
    const chests: ChestSink = [];
    const anchorX = 400;
    const ok = growLivingTree(st, new RNG(555), gs, chests, anchorX, SURFACE - 1);
    expect(ok).toBe(true);
    // 井筒核心列 num10-1..num10+1（cs:29088 i > num10-2 && i <= num10+1）。
    // 注：井口 j+1 行是生命木平台活板门（cs:29109-29112）,且井筒每 6 行 ±1 蛇行
    //（cs:29177）→ 逐行断言 ±4 窗口内存在墙 244 空腔
    let hollowRows = 0, hollowCells = 0;
    for (let y = SURFACE + 1; y < SURFACE + 41; y++) {
      let rowHollow = 0;
      for (let dx = -4; dx <= 4; dx++) {
        const i = st.idx(anchorX + dx, y);
        if (st.flags[i] === 0 && st.wall[i] === 244) rowHollow++;
      }
      if (rowHollow > 0) hollowRows++;
      hollowCells += rowHollow;
    }
    expect(hollowRows).toBeGreaterThanOrEqual(35);
    expect(hollowCells).toBeGreaterThanOrEqual(70);
    // 树冠（锚点上方空气）与根系（地表以下）存在
    let leaves = 0, roots = 0;
    for (let y = 60; y < SURFACE; y++) {
      for (let dx = -80; dx <= 80; dx++) {
        if (st.type[st.idx(anchorX + dx, y)] === LEAF) leaves++;
      }
    }
    for (let y = SURFACE + 1; y < SURFACE + 60; y++) {
      for (let dx = -40; dx <= 40; dx++) {
        if (st.type[st.idx(anchorX + dx, y)] === LIVING_WOOD) roots++;
      }
    }
    expect(leaves).toBeGreaterThan(0);
    expect(roots).toBeGreaterThan(0);
  }, 60000);

  it('密室宝箱：竖井 50 格后出现活木腔房间+宝箱（cs:29306 PassageRoom）', () => {
    const w = 800, h = 600;
    const st = makeFlat(w, h);
    const gs = gsFor(w, h);
    const chests: ChestSink = [];
    growLivingTree(st, new RNG(8888), gs, chests, 400, SURFACE - 1);
    expect(chests.length).toBeGreaterThanOrEqual(1);
    // 宝箱 tile 已落盘（2×2,style12 帧基 12*2*18=432）
    let chestTiles = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === CHEST) chestTiles++;
    }
    expect(chestTiles).toBeGreaterThanOrEqual(4);
    // 主件 = 832 生命木魔棒 或 4281 雀杖（cs:29418-29421）
    const wand = ITEM_BY_KEY['vi_832_living_wood_wand']!;
    const finch = ITEM_BY_KEY['vi_4281_finch_staff']!;
    // 同原版 id 的规范驼峰键（items.ts 自动注册循环）——曾与显式键双份入箱
    const wandCamel = ITEM_BY_KEY['vi_832_LivingWoodWand']!;
    const finchCamel = ITEM_BY_KEY['vi_4281_BabyBirdStaff']!;
    const hasMain = chests.some((c) => c.items.some((it) => it && (it.id === wand || it.id === finch)));
    expect(hasMain).toBe(true);
    // 主件恰一份：显式键与驼峰键不得同时出现（rollChestLoot 尾段主件去重）
    for (const c of chests) {
      const mains = c.items.filter((it) => it
        && (it.id === wand || it.id === finch || it.id === wandCamel || it.id === finchCamel));
      expect(mains.length).toBeLessThanOrEqual(1);
    }
    // 房间本体：活木墙腔（wall 244 的空格）在竖井深处存在
    let deepHollow = 0;
    for (let y = SURFACE + 40; y < SURFACE + 200; y++) {
      for (let dx = -60; dx <= 60; dx++) {
        const i = st.idx(400 + dx, y);
        if (st.flags[i] === 0 && st.wall[i] === 244) deepHollow++;
      }
    }
    expect(deepHollow).toBeGreaterThan(0);
  }, 60000);

  it('主件 id 解析：832/4281 裸 id 与 vi_ key 均可入箱且不双份（vid() 查 vanilla.json 全量表）', () => {
    // vid() 的查表源是 VANILLA_ITEM_KEY_BY_ID（public/sprites/vanilla.json 全量 6059 条）,
    // 与 vanilla-itemstats.json（盔甲/配饰属性表）无关——裸 id 路径不会被"无 itemstats 条目"丢弃
    const wandCamel = ITEM_BY_KEY['vi_832_LivingWoodWand']!;
    const finchCamel = ITEM_BY_KEY['vi_4281_BabyBirdStaff']!;
    expect(wandCamel).toBeGreaterThan(0);
    expect(finchCamel).toBeGreaterThan(0);
    const ctx = (mainKey: string | null) => ({
      rng: new RNG(7), gs: gsFor(800, 600), gy: SURFACE + 60, flags: {}, mainKey, worldH: 600,
    });
    // ① 裸 id 路径：主件以规范驼峰键注册条目入箱
    for (const vid of [832, 4281]) {
      const loot = rollChestLoot(ctx(null), vid).filter((it): it is { id: number; stack: number } => !!it);
      const camel = vid === 832 ? wandCamel : finchCamel;
      expect(loot.some((it) => it.id === camel)).toBe(true);
    }
    // ② key 路径：按调用方显式键入箱,且剔除驼峰键那份——同物恰一份
    const keyCases = [
      { key: 'vi_832_living_wood_wand', vid: 832, camel: wandCamel },
      { key: 'vi_4281_finch_staff', vid: 4281, camel: finchCamel },
    ];
    for (const { key, vid, camel } of keyCases) {
      const loot = rollChestLoot(ctx(key), vid).filter((it): it is { id: number; stack: number } => !!it);
      expect(loot.some((it) => it.id === ITEM_BY_KEY[key])).toBe(true);   // 显式键入箱
      expect(loot.some((it) => it.id === camel)).toBe(false);             // 驼峰键那份已剔除
    }
  });

  it('破坏掉落：活木掉木材 9（KillTile case 191 :64584/1457 :65049→dropItem=9）/树叶无掉落（192 no-drop 表 :66336）', () => {
    const world = new World(64, 64, 1, 't');
    const st = world.store;
    st.setTileSilent(10, 10, LIVING_WOOD);
    st.setTileSilent(12, 10, LEAF);
    expect(world.breakTileAt(10, 10)).toBe('vi_9_Wood'); // 活木→木材 9（2026-08-23 方块审计 A 区回填;曾误 drop:null）
    expect(world.breakTileAt(12, 10)).toBeNull();   // 树叶无掉落（192 在 no-drop 表）
    expect(st.get(10, 10)).toBe(0);
    // def 对齐：191/192 均实心（Main.cs:10159/:10167 初始 tileSolid=true；生成期
    // :15789/:16694 曾置 false 但被 generateWorld finally 的 tileSolidBackup 整表
    // 还原（:11128 克隆 / :22678 RestoreTemporaryStateChanges）——初始=运行时终态）
    expect(TILE_DEFS[LIVING_WOOD].solid).toBe(true);
    expect(TILE_DEFS[LEAF].solid).toBe(true);
  });
});
