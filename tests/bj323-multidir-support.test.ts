// ★BJ323（2026-09-24）：多向锚件支撑失效链——129 水晶碎晶/149 节日灯
//   CheckAndAdjustMultiDirectionalTile（WorldGen.cs:60805-60855）+ ValidAnchor
//   ForMultiDirectionalTile（:60788-60803）+ 调用门 tileSolid∧!tileSolidTop
//   （:60844-60849）1:1 移植。用户实报：挖掉水晶碎块下方物块后碎块悬空不掉落。
//   机制锚：TileFrameImportant case 129/149 组（:86339-86400 唯一派发）——四邻任一
//   有效锚 → 重帧 frameY{下0,上18,左54,右36}（优先级 下→左→右→上）;全失 → KillTile
//   → KillTile_GetItemDrops case 129（:65496-65503 fx≥324→4988 else 502）/case 149
//   （:66036 帧表）。原版为挖时立即联检（KillTile 尾 SquareTileFrame :64436→:81462
//   3×3 TileFrame）,本仓触发面=checkDecorSquareFrame 3×3 扫 + checkFurnitureSupport
//   家具监听路由（dKind≠'furniture'）,两面同接 'multidir' 判据。
//   宝箱底块特例（用户提示）不在本刀面：PROTECTED_ABOVE_SHEETS（Game.ts:976,
//   CanKillTile :62293-62297/CheckTileBreakability :62874 return 2 同源）已 1:1,
//   有物/空箱底块均不可挖,不触发失撑链。
// shell 模式同 decor-support.test.ts（Object.create(Game.prototype)+桩）。
import { describe, expect, it, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';

const keyOf = (k: string) => {
  const id = TILE_BY_KEY[k];
  expect(id, `def ${k} 应存在`).toBeDefined();
  return id!;
};

interface Drop { key: string; n: number }

/** Game 壳（同 decor-support mkShell,补 multidir 链所需桩） */
function mkShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    checkFurnitureSupport: (x: number, y: number) => void;
    checkDecorSquareFrame: (x: number, y: number) => void;
    checkAndAdjustMultiDirAt: (x: number, y: number) => boolean;
    multiDirBestDirAt: (x: number, y: number) => number;
    breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.entities = { add: () => {}, critters: [], drops: [] };
  g.trackTile = 0;
  g.scene = null;
  g.player = { inv: { countOf: () => 0 }, equipStats: { cordage: false }, cx: 0, cy: 0 };
  g.evolution = new WorldEvolution({
    store: w.store,
    seed: 7, worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false, maxRaining: 0,
    windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: () => {},
    selectedAxePower: () => 35,
  });
  return g;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ323 多向锚支撑失效链（129 水晶碎晶/149 节日灯）', () => {
  it('立地碎块挖掉支撑块 → 清除+掉 Crystal Shard 502（:65496-65503 else 支）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);
    w.store.setTileSilent(30, 20, SHARD, 0, 0);        // frameY=0 立地档
    w.store.setTile(30, 21, 0);                        // 挖支撑块
    g.checkDecorSquareFrame(30, 21);                   // SquareTileFrame 3×3 等价触发面
    expect(w.store.get(30, 20)).toBe(0);               // 碎块塌
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
  });

  it('悬顶碎块（frameY=18）挖掉上方块 → 清除+掉落（旧链只查变化格上方=漏检根因）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 19, STONE, 0, 0);
    w.store.setTileSilent(30, 20, SHARD, 0, 18);       // 吊顶档
    w.store.setTile(30, 19, 0);                        // 挖天花板
    g.checkDecorSquareFrame(30, 19);
    expect(w.store.get(30, 20)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
  });

  it('侧附碎块挖掉侧锚块 → 清除+掉落（左锚 54/右锚 36 两向）', () => {
    for (const [dx, fy] of [[-1, 54], [1, 36]] as const) {
      const w = new World(60, 60, 7, 'bj323');
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
      w.store.setTileSilent(30 + dx, 20, STONE, 0, 0);
      w.store.setTileSilent(30, 20, SHARD, 0, fy);
      w.store.setTile(30 + dx, 20, 0);
      g.checkDecorSquareFrame(30 + dx, 20);
      expect(w.store.get(30, 20)).toBe(0);
      expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
    }
  });

  it('旁侧锚存活 → 重帧 frameY=54（下锚失、左锚接管;原版存活不误杀）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);        // 下锚
    w.store.setTileSilent(29, 20, STONE, 0, 0);        // 左锚
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    w.store.setTile(30, 21, 0);                        // 挖下支撑
    g.checkDecorSquareFrame(30, 21);
    expect(w.store.get(30, 20)).toBe(SHARD);           // 存活
    expect(frameYAt(w, 30, 20)).toBe(54);             // 重帧左锚档
    expect(drops).toEqual([]);
    // 二段：左锚也失 → 此时才塌
    w.store.setTile(29, 20, 0);
    g.checkDecorSquareFrame(29, 20);
    expect(w.store.get(30, 20)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
  });

  it('下锚优先于左锚（:60831 num 臂在前——优先级判别位）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);        // 下锚
    w.store.setTileSilent(29, 20, STONE, 0, 0);        // 左锚
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    g.checkDecorSquareFrame(30, 20);                   // 邻格扰动复评
    expect(frameYAt(w, 30, 20)).toBe(0);              // 下锚胜,不变帧
    expect(drops).toEqual([]);
  });

  it('★BJ343 双锚并存判别位：左锚优先于右锚（:60836 num3 在 :60841 num4 前）', () => {
    // 双侧锚并存（下/上锚缺）→ 重帧取左锚档 fy=54,不取右锚档 36——
    //  互换两支序（右先）会选 36 = 立即爆红。存档态摆成右附档（fy=36）作再证：
    //  右锚仍在时复评也翻回左锚档（存活重帧,非杀格）
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(29, 20, STONE, 0, 0);        // 左锚
    w.store.setTileSilent(31, 20, STONE, 0, 0);        // 右锚
    w.store.setTileSilent(30, 20, SHARD, 0, 36);       // 摆右附档（双侧锚并存不应维持）
    g.checkDecorSquareFrame(30, 20);                   // 邻格扰动复评
    expect(w.store.get(30, 20)).toBe(SHARD);           // 有锚存活
    expect(frameYAt(w, 30, 20)).toBe(54);              // 左锚胜（右锚档 36 被翻）
    expect(drops).toEqual([]);
    // 二段：左锚失 → 右锚接管（换档不塌）
    w.store.setTile(29, 20, 0);
    g.checkDecorSquareFrame(29, 20);
    expect(w.store.get(30, 20)).toBe(SHARD);
    expect(frameYAt(w, 30, 20)).toBe(36);              // 右锚档
    expect(drops).toEqual([]);
  });

  it('上锚接管重帧 frameY=18（下锚失、头顶块接管）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);        // 下锚
    w.store.setTileSilent(30, 19, STONE, 0, 0);        // 上锚
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    w.store.setTile(30, 21, 0);
    g.checkDecorSquareFrame(30, 21);
    expect(w.store.get(30, 20)).toBe(SHARD);
    expect(frameYAt(w, 30, 20)).toBe(18);
  });

  it('有墙无锚 → 清除+掉落（旧 hasSupport「任一格有墙」误活面修复）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    w.store.wall[w.store.idx(30, 20)] = 1;             // 背后有墙
    w.store.setTile(30, 21, 0);
    g.checkFurnitureSupport(30, 20);                   // 家具监听路由面（x,y-1 换算）
    expect(w.store.get(30, 20)).toBe(0);               // 墙不作支撑 → 塌
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
  });

  it('平台不作锚（调用门 tileSolidTop 拒——BottomSlope 放行被 :60844 滤掉）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), PLATFORM = keyOf('platform');
    w.store.setTileSilent(30, 21, PLATFORM, 0, 0);
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    g.checkDecorSquareFrame(30, 20);
    expect(w.store.get(30, 20)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
  });

  it('巨石/门不作锚（ValidAnchor 排除表 :60790——实心但排除）', () => {
    for (const key of ['v_138_boulder', 'door_closed'] as const) {
      const w = new World(60, 60, 7, 'bj323');
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      const SHARD = keyOf('v_129_crystal_shard'), ANCHOR = keyOf(key);
      w.store.setTileSilent(30, 21, ANCHOR, 0, 0);
      w.store.setTileSilent(30, 20, SHARD, 0, 0);
      g.checkDecorSquareFrame(30, 20);
      expect(w.store.get(30, 20)).toBe(0);
      expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[502], n: 1 }]);
    }
  });

  it('节日灯 149 同面：挖支撑 → 清除+按帧档掉落（KillTile case 149 :66036）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const LIGHTS = keyOf('v_149_holidaylights'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);
    w.store.setTileSilent(30, 20, LIGHTS, 36, 0);      // fx36 三色档一
    w.store.setTile(30, 21, 0);
    g.checkDecorSquareFrame(30, 21);
    expect(w.store.get(30, 20)).toBe(0);
    const sv = styleDropVidOfFrames(149, 36, 0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[sv], n: 1 }]);
  });

  it('G-129 掉落锚：fx≥324 大晶簇档掉 4988（wld 导入档,styleDropVidOfFrames 同源）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 21, STONE, 0, 0);
    w.store.setTileSilent(30, 20, SHARD, 324, 0);      // 大晶簇帧带
    w.store.setTile(30, 21, 0);
    g.checkDecorSquareFrame(30, 21);
    expect(w.store.get(30, 20)).toBe(0);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[4988], n: 1 }]);
  });

  it('helper 纯判据：无锚 false / 有锚 true+重帧（放置门 multiDirBestDirAt 同源）', () => {
    const w = new World(60, 60, 7, 'bj323');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const SHARD = keyOf('v_129_crystal_shard'), STONE = keyOf('stone');
    w.store.setTileSilent(30, 20, SHARD, 0, 0);
    expect(g.multiDirBestDirAt(30, 20)).toBe(-1);      // 无锚
    expect(g.checkAndAdjustMultiDirAt(30, 20)).toBe(false);
    w.store.setTileSilent(30, 21, STONE, 0, 0);
    expect(g.multiDirBestDirAt(30, 20)).toBe(0);       // 下锚
    w.store.frameY[w.store.idx(30, 20)] = 36;          // 摆成侧附档
    expect(g.checkAndAdjustMultiDirAt(30, 20)).toBe(true);   // 重帧
    expect(frameYAt(w, 30, 20)).toBe(0);
    expect(drops).toEqual([]);
  });
});

/** 简写：读 (x,y) 的 frameY */
function frameYAt(w: World, x: number, y: number): number {
  return w.store.frameY[w.store.idx(x, y)];
}
