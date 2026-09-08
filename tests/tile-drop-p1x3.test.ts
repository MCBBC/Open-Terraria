// P1×3 补玩家破坏链掉落口（2026-09-08 数据面红队审计清偿批）行为回归。
// 三型此前被 killTileDropItems 白名单门整型吞掉（TILE_CUT 可割、镐斧清装饰两链
// 均汇入本函数,却无任何掉落出口）,本批补：
//   519 香蒲  frameY==90 → 1/2 发光蘑菇 183（WorldGen.cs:65516-65519;1456 :65051 同文）
//   528 蘑菇藤 纯 1/2 发光蘑菇 183      （WorldGen.cs:65522-65525;1456 :65057 同文）
//   637 灰烬草株 1/100 灰烬草种子 5214  （WorldGen.cs:65490-65493;1456 :65025 同文）
// ★519 frameY 语义勘定（红队"种穗帧"假设不成立）：CheckCatTail 基座表（cs:59285-59306）
//   2/477→0、53→18、199/234/662→54、23/112/661→72、70→90 全列写 frameY（:59396）
//   ——frameY==90 = 长在蘑菇草(70)上的香蒲;基座非蘑菇草（0/18/54/72）不掉。
// 掷序照抄原文：条件在先骰在后（519 frameY!=90 零掷——①不误耗全局流,②与原版
//   genRand/Main.rand 消费位次逐字对齐）。RNG 通道=本函数现行 Math.random（同
//   71/72/52 族口径）;演化域蔓延流另走 WorldEvolution.kill 两域独立不冲突。
// 双掉自查（2026-09-08）：三型 def.drop 均 null、不在 styleDropVidOfFrames/
//   NO_RETURN_RECYCLE_SHEETS;既有 183 出口（dropVanillaTreeLoot/fellTree 蘑菇树支）
//   只服务树倒链 killed 面,与三型无交集。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

// TILE_BY_KEY 值=内部数字 id;killTileDropItems 形参=TILE_DEFS 元素（读 vanilla.sheet）
const CATTAIL_ID = TILE_BY_KEY['v_519_cattails']!;
const MUSH_VINE_ID = TILE_BY_KEY['v_528_mushroom_vines']!;
const ASH_PLANT_ID = TILE_BY_KEY['v_637_ash_short_plants']!;
const CATTAIL = TILE_DEFS[CATTAIL_ID]!;
const MUSH_VINE = TILE_DEFS[MUSH_VINE_ID]!;
const ASH_PLANT = TILE_DEFS[ASH_PLANT_ID]!;

interface Drop { key: string; n: number; x: number; y: number }

/** killTileDropItems 裸架 harness（multi-tile-drop boulderShell 同款——只备本函数
 *  触达面：world.store / spawnDrop / player?.equipStats） */
function shell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    killTileDropItems: (x: number, y: number, def?: { vanilla?: { sheet?: number } }) => void;
  };
  g.world = w;
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    drops.push({ key, n, x, y });
    return null;
  };
  g.player = { equipStats: {} };
  return g as unknown as {
    killTileDropItems: (x: number, y: number, def?: { vanilla?: { sheet?: number } }) => void;
  };
}

/** mulberry32 播种（charBake/RNG flake 治理同范式）——统计批用固定 seed */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P1×3 玩家破坏链掉落口（519/528/637）', () => {
  it('519 香蒲 frameY==90（蘑菇草基座档）→ 1/2 发光蘑菇 183（:65516-65519）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = shell(w, drops);
    w.store.setTileSilent(10, 10, CATTAIL_ID, 90, 90);   // frameX 顶段/frameY=70 基座档
    // 骰序列:0.49→floor(×2)=0 掉;0.99→1 不掉
    const rnd = vi.spyOn(Math, 'random').mockReturnValueOnce(0.49).mockReturnValueOnce(0.99);
    g.killTileDropItems(10, 10, CATTAIL);
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[183]);
    // 183 双键别名并存（桥接批 snake vi_183_glowing_mushroom / vanilla.json 自动
    // Pascal vi_183_GlowingMushroom）——反查表按注册序指其一,断言 vid 前缀即可
    expect(drops[0]!.key.startsWith('vi_183_')).toBe(true);
    g.killTileDropItems(10, 10, CATTAIL);             // 第二骰 0.99 → 无掉
    expect(drops.length).toBe(1);
    expect(rnd).toHaveBeenCalledTimes(2);
  });

  it('519 香蒲基座非蘑菇草（frameY 0/18/54/72）→ 条件在先零掷（:59285-59306 基座表）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = shell(w, drops);
    const rnd = vi.spyOn(Math, 'random');            // 先装 spy 再杀格,才能断言零掷
    for (const fy of [0, 18, 54, 72]) {
      w.store.setTileSilent(10, 10, CATTAIL_ID, 90, fy);
      g.killTileDropItems(10, 10, CATTAIL);
    }
    expect(drops.length).toBe(0);
    expect(rnd).not.toHaveBeenCalled();              // 掷序=frameY 门先于骰
  });

  it('528 蘑菇藤 纯 1/2 发光蘑菇 183（:65522-65525,无 frame 条件）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = shell(w, drops);
    w.store.setTileSilent(10, 10, MUSH_VINE_ID);
    const rnd = vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    g.killTileDropItems(10, 10, MUSH_VINE);
    expect(drops.map((d) => d.key)).toEqual([VANILLA_ITEM_KEY_BY_ID[183]]);
    g.killTileDropItems(10, 10, MUSH_VINE);
    expect(drops.length).toBe(1);                     // 0.8 → Next(2)=1 不掉
    expect(rnd).toHaveBeenCalledTimes(2);
  });

  it('637 灰烬草株 1/100 灰烬草种子 5214（:65490-65493）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = shell(w, drops);
    w.store.setTileSilent(10, 10, ASH_PLANT_ID);
    const rnd = vi.spyOn(Math, 'random').mockReturnValueOnce(0.005).mockReturnValueOnce(0.995);
    g.killTileDropItems(10, 10, ASH_PLANT);
    expect(drops.map((d) => d.key)).toEqual([VANILLA_ITEM_KEY_BY_ID[5214]]);
    expect(drops[0]!.key).toBe('vi_5214_AshGrassSeeds');
    g.killTileDropItems(10, 10, ASH_PLANT);
    expect(drops.length).toBe(1);                     // 0.995 → Next(100)=99 不掉
    expect(rnd).toHaveBeenCalledTimes(2);
  });

  it('统计批（mulberry32 固定 seed×400）：519@fy90≈1/2、528≈1/2、637≈1/100', () => {
    const w = new World(40, 40, 7, 't');
    w.store.setTileSilent(10, 10, CATTAIL_ID, 90, 90);
    w.store.setTileSilent(12, 10, MUSH_VINE_ID);
    w.store.setTileSilent(14, 10, ASH_PLANT_ID);
    const drops: Drop[] = [];
    const g = shell(w, drops);
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(20260908));
    const N = 400;
    for (let i = 0; i < N; i++) {
      g.killTileDropItems(10, 10, CATTAIL);
      g.killTileDropItems(12, 10, MUSH_VINE);
      g.killTileDropItems(14, 10, ASH_PLANT);
    }
    const count = (vid: number) => drops.filter((d) => d.key === VANILLA_ITEM_KEY_BY_ID[vid]).length;
    const c183 = count(183), c5214 = count(5214);
    // p=0.5,n=800（519+528 两型合计）:μ=400,σ≈14.1 → ±7σ 带宽防 flake
    expect(c183).toBeGreaterThan(280);
    expect(c183).toBeLessThan(520);
    // p=0.01,n=400:μ=4,σ≈1.99 → ≤15（≈+5.5σ）;播种流恒真>0
    expect(c5214).toBeGreaterThanOrEqual(1);
    expect(c5214).toBeLessThanOrEqual(15);
  });

  it('掉落锚点/堆叠口径：盒中心 (x*16+8,y*16+8)、stack=1（与既有植物族支同 spawnDrop 面）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = shell(w, drops);
    w.store.setTileSilent(7, 9, ASH_PLANT_ID);
    vi.spyOn(Math, 'random').mockReturnValue(0.0);    // 恒掉
    g.killTileDropItems(7, 9, ASH_PLANT);
    expect(drops.length).toBe(1);
    expect(drops[0]!.x).toBe(7 * 16 + 8);
    expect(drops[0]!.y).toBe(9 * 16 + 8);
    expect(drops[0]!.n).toBe(1);
  });
});
