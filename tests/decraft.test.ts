// 微光 decraft（反合成）回归探针（ShimmerTransforms.cs + WorldItem.cs:1878-1946 +
// Recipe.UpdateWhichItemsAreCrafted :15110-15127）。选取规则 = 注册序 last-wins 的
// IsCrafted；猩红/腐化世界覆盖分支；双锁 = 配方含 154 骨头（骷髅王）/ 1101 丛林蜥蜴
// 砖（石巨人）。探针全部对照 vanilla-recipes.json + Terarria1456 源码手工核出。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  canShimmerItem, decraftOutcome, isItemDecraftableAndUnlocked, isRecipeIndexDecraftLocked,
  groupDecraftItemId, makeNpcOfItem,
} from '../src/stats/Shimmer';
import itemValueJson from '../src/data/vanilla-itemvalue.json';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { RECIPE_GROUP_ITEMS } from '../src/data/vanillaRecipes';
import type { GameHooks } from '../src/entities/types';

const NO_LOCK = { crimsonWorld: false, downedBoss3: true, downedGolemBoss: true };
const open = (stack: number, over: Partial<typeof NO_LOCK> = {}) => ({ ...NO_LOCK, stack, ...over });

describe('选取规则：IsCrafted last-wins + 邪恶覆盖分支', () => {
  it('机械蠕虫 556：腐化世界返还腐烂块 68，猩红世界返还椎骨 1330（GetDecraftingRecipeIndex :22-27）', () => {
    const corr = decraftOutcome(556, 1, false)!;
    expect(corr.piles).toEqual([{ vid: 68, stack: 6 }, { vid: 22, stack: 5 }, { vid: 521, stack: 6 }]);
    const crim = decraftOutcome(556, 1, true)!;
    expect(crim.piles).toEqual([{ vid: 1330, stack: 6 }, { vid: 22, stack: 5 }, { vid: 521, stack: 6 }]);
  });

  it('怪物千层面 5092：8 腐烂块 ↔ 8 椎骨', () => {
    expect(decraftOutcome(5092, 1, false)!.piles).toEqual([{ vid: 68, stack: 8 }]);
    expect(decraftOutcome(5092, 1, true)!.piles).toEqual([{ vid: 1330, stack: 8 }]);
  });

  it('组材料【替换】为组代表而非追加（RecipeGroup.DecraftItemId，WorldItem.cs:1895-1897）', () => {
    // 铁斧 10 = 铁锭×8 + 木头×3（Wood 组成员 9 → 组代表仍是木头 9）。
    // 旧实现曾把组代表当【额外】一垛追加 → 多返 1 木头，此断言锁定替换语义。
    const out = decraftOutcome(10, 1, false)!;
    expect(out.piles).toEqual([{ vid: 22, stack: 8 }, { vid: 9, stack: 3 }]);
    expect(out.spread).toBe(true);   // ≥2 材料 → 掉落物按序号散射（:1882）
  });
});

describe('数量与拆垛（Item.FindDecraftAmount :49062-49070 / :1913-1916）', () => {
  it('骨头平台 634 createStack=2：5 个 → 2 次 → 2 骨头，消耗 4；不足一组 → null', () => {
    expect(decraftOutcome(634, 5, false, () => 2)).toEqual({
      piles: [{ vid: 154, stack: 2 }], slots: [1], consumed: 4, spread: false,
    });
    expect(decraftOutcome(634, 1, false, () => 2)).toBeNull();
  });

  it('单垛上限 9999：30000 骨头平台 → 15000 骨头拆 9999+5001 两垛', () => {
    const out = decraftOutcome(634, 30000, false, () => 2)!;
    expect(out.piles).toEqual([{ vid: 154, stack: 9999 }, { vid: 154, stack: 5001 }]);
    expect(out.slots).toEqual([1, 1]);   // 拆垛共享材料序号（num7 按材料递增，非按垛）
    expect(out.consumed).toBe(30000);
  });
});

describe('RecipeSets 双锁（UpdateRecipeSets :78-84 + IsRecipeIndexDecraftLocked :46-61）', () => {
  it('骷髅头灯笼 347（含骨头 154）：未败骷髅王锁死，败后返还 骨头×10+火炬×1', () => {
    expect(isItemDecraftableAndUnlocked(347, 1, false, false, true)).toBe(false);
    expect(canShimmerItem(347, false, undefined, open(1, { downedBoss3: false }))).toBe(false);
    expect(isItemDecraftableAndUnlocked(347, 1, false, true, true)).toBe(true);
    expect(canShimmerItem(347, false, undefined, open(1))).toBe(true);
    expect(decraftOutcome(347, 1, false)!.piles).toEqual([{ vid: 154, stack: 10 }, { vid: 8, stack: 1 }]);
  });

  it('丛林蜥蜴椅 1143（含丛林蜥蜴砖 1101）：未败石巨人锁死，败后返还 砖×4', () => {
    expect(isItemDecraftableAndUnlocked(1143, 1, false, true, false)).toBe(false);
    expect(isItemDecraftableAndUnlocked(1143, 1, false, true, true)).toBe(true);
    expect(decraftOutcome(1143, 1, false)!.piles).toEqual([{ vid: 1101, stack: 4 }]);
  });

  it('锁只看材料表：154/1101 不在任何 RecipeGroup 内（ContainsIngredient 字面比对等价）', () => {
    for (const items of Object.values(RECIPE_GROUP_ITEMS)) {
      expect((items as number[]).includes(154)).toBe(false);
      expect((items as number[]).includes(1101)).toBe(false);
    }
    expect(isRecipeIndexDecraftLocked(-1, false, false)).toBe(false); // 负索引不锁
  });
});

describe('返还表变体（WorldItem.cs:1884-1911）', () => {
  it('AddCustomShimmerResult 覆盖：银弹 278（70/组）→ 火枪弹 97 + 银矿石 14（非材料银锭）', () => {
    const out = decraftOutcome(278, 140, false)!;   // 2 组 → ×2
    expect(out.piles).toEqual([{ vid: 97, stack: 140 }, { vid: 14, stack: 2 }]);
    expect(out.consumed).toBe(140);
    expect(decraftOutcome(278, 69, false)).toBeNull();  // 不足 70 不分解
  });

  it('铜镐 3509 覆盖表 → 铜矿石 12 + 木头 9（替代 铜锭×8+木头×4 材料表）', () => {
    expect(decraftOutcome(3509, 1, false)!.piles).toEqual([{ vid: 12, stack: 1 }, { vid: 9, stack: 1 }]);
  });

  it('炼金配方逐单位 1/3 蒸发：战斗药水 300 无蒸发全返 / 全蒸发空返但仍消耗', () => {
    // rand3 语义 = Main.rand.Next(3)；==0 蒸发。腐化世界战斗药水 = 瓶装水+死亡草+腐烂块
    const full = decraftOutcome(300, 1, false, () => 2)!;
    expect(full.piles).toEqual([{ vid: 126, stack: 1 }, { vid: 316, stack: 1 }, { vid: 68, stack: 1 }]);
    const gone = decraftOutcome(300, 1, false, () => 0)!;
    expect(gone.piles).toEqual([]);
    expect(gone.consumed).toBe(1);   // 原版照扣（:1927），不因空垛回退
  });

  it('forDecrafting 等价计数：真铜短剑 5669 按 Zenith 4956 配方反分解（10 材料）', () => {
    const out = decraftOutcome(5669, 1, false)!;
    expect(out.piles.length).toBe(10);
    expect(out.piles.map((p) => p.vid)).toContain(757);   // 泰拉刃
    expect(out.consumed).toBe(1);
  });
});

// ============ 端到端（ItemDrop 入微光池 → GetShimmered 分支顺序） ============

const W = 60, H = 60;

function shimmerWorld(): World {
  const w = new World(W, H, 11, 'decraft-test');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4);
  }
  w.lavaLine = 50;
  return w;
}

interface Spawned { key: string; count: number; drop: ItemDrop }

function hooks(w: World, p: Player, spawned: Spawned[]): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: (x: number, y: number, key: string, count?: number) => {
      const d = new ItemDrop(x, y, ITEM_BY_KEY[key], count ?? 1);
      spawned.push({ key, count: count ?? 1, drop: d });
      return d;
    },
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('掉落物端到端（分支顺序 ：1790 钱币 → :1812 转化 → :1878 decraft）', () => {
  it('木桌 32（木头×8）入池 → 分解出 8 木头，原物消失', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const key = VANILLA_ITEM_KEY_BY_ID[32];
    expect(key).toBeDefined();
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 1);
    for (let i = 0; i < 400 && !d.dead; i++) d.fixedUpdate(1, hooks(w, p, spawned));
    expect(d.dead).toBe(true);
    expect(spawned).toHaveLength(1);
    expect(VANILLA_ITEM_KEY_BY_ID[9] && spawned[0].key === VANILLA_ITEM_KEY_BY_ID[9]).toBe(true);
    expect(spawned[0].count).toBe(8);
    expect(spawned[0].drop.shimmered).toBe(true);     // 返还物上浮漂浮（:1924）
    expect(spawned[0].drop.shimmerTime).toBe(1);      // :1923
  });

  it('火炬 8 同时具备配方与转化目标 → 必走转化（5353），不得 decraft 成 凝胶+木头', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    // 经 VANILLA_ITEM_KEY_BY_ID 取 vi_ 键（本地原生键正随并行会话退役，vid 解析不稳）
    const torchKey = VANILLA_ITEM_KEY_BY_ID[8];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[torchKey], 5);
    for (let i = 0; i < 300; i++) {
      d.fixedUpdate(1, hooks(w, p, spawned));
      if (d.shimmered) break;
    }
    expect(d.shimmered).toBe(true);
    expect(d.stack).toBe(5);
    expect(spawned).toHaveLength(0);   // 转化不产生返还垛（decraft 抢先 = 回归形态）
  });

  it('金币 73 有币币兑换配方 → 必走 coinLuck（×10000），不得 decraft 成铂金币', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const coinKey = VANILLA_ITEM_KEY_BY_ID[73];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[coinKey], 2);
    for (let i = 0; i < 200 && !d.dead; i++) d.fixedUpdate(1, hooks(w, p, spawned));
    expect(d.dead).toBe(true);
    expect(spawned).toHaveLength(0);
    expect(p.luckState.coinLuck).toBe(2 * 10000);
  });

  it('锁门态：骷髅头灯笼 347 在未败骷髅王世界入池不分解（shimmerTime 归零衰减）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const key = VANILLA_ITEM_KEY_BY_ID[347];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 1);
    for (let i = 0; i < 400; i++) d.fixedUpdate(1, hooks(w, p, spawned));
    expect(d.dead).toBe(false);
    expect(d.shimmered).toBe(false);
    expect(d.shimmerTime).toBe(0);
    expect(spawned).toHaveLength(0);
    // 败骷髅王后同池同物 → 分解出 骨头×10+火炬×1 两垛
    w.flags['downed_35'] = true;
    const d2 = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 1);
    const spawned2: Spawned[] = [];
    for (let i = 0; i < 400 && !d2.dead; i++) d2.fixedUpdate(1, hooks(w, p, spawned2));
    expect(d2.dead).toBe(true);
    expect(spawned2).toHaveLength(2);
  });
});

// ============ 2026-08-13 散项批：value 表工厂盲区修复 + makeNPC/4986/560 ============

describe('RecipeGroup.DecraftItemId 并列组代表（value 表修复回归）', () => {
  // tools/extract-itemrare.mjs 曾缺 buyPrice/SetShopValues/标签列求值：1250-1252 读 0
  // 抢占气球三组代表（原版 OrderBy(value).First() 取注册序首个 399/1163/983）
  it('气球三组（509/510/511）同价并列 → 注册序首位代表 399/1163/983', () => {
    expect(groupDecraftItemId(11)).toBe(399);
    expect(groupDecraftItemId(12)).toBe(1163);
    expect(groupDecraftItemId(13)).toBe(983);
  });

  it('贝壳组 16：2625=500 < 2626=1000 → 组代表 2625（DefaultToSeaShell 工厂值）', () => {
    expect(groupDecraftItemId(16)).toBe(2625);
  });

  it('宝石小动物组 22 / 水母组 30：全员同价 → 注册序首位 4838 / 2436', () => {
    expect(groupDecraftItemId(22)).toBe(4838);
    expect(groupDecraftItemId(30)).toBe(2436);
  });

  it('buyPrice 求值回归：1250/1251/1252 = 150000（旧表缺 → 0）', () => {
    expect(itemValueJson['1250']).toBe(150000);
    expect(itemValueJson['1251']).toBe(150000);
    expect(itemValueJson['1252']).toBe(150000);
  });
});

describe('makeNPC 放生 / 4986 彩虹史莱姆 / 560 史莱姆雨（WorldItem.cs:1816-1877）', () => {
  let npcSpawns: Array<{ id: number; x: number; y: number }>;

  beforeEach(() => { npcSpawns = []; });

  function hooksNpc(w: World, p: Player, spawned: Spawned[]): GameHooks {
    return {
      ...hooks(w, p, spawned),
      spawnNpcByVanilla: (id: number, x: number, y: number) => {
        npcSpawns.push({ id, x, y });
        return null;
      },
    } as unknown as GameHooks;
  }

  it('CanShimmer 门：瓶中小动物走 makeNPC 位（:49058），4986 已解锁后禁入（:49056）', () => {
    // 1992 瓶中萤火虫（DefaultToCapturedCritter(355)，Item.cs:21292）
    expect(makeNpcOfItem(1992)).toBe(355);
    expect(canShimmerItem(1992, true)).toBe(true);
    // 4986 未解锁 → 特例放行；解锁后且无转化/配方 → 禁入
    expect(canShimmerItem(4986, false, undefined, undefined, { rainbowSlimeUnlocked: false })).toBe(true);
    expect(canShimmerItem(4986, false, undefined, undefined, { rainbowSlimeUnlocked: true })).toBe(false);
    // 560 雨进行中禁入（:49052 先于 :49056 求值）；非雨态经 decraft 位放行
    //（史莱姆王冠 20 凝胶+金冠 IsCrafted 配方 → IsItemDecraftableAndIsDecraftUnlocked）
    const crown = { stack: 1, crimsonWorld: false, downedBoss3: true, downedGolemBoss: true };
    expect(canShimmerItem(560, false, undefined, crown, { slimeRain: true })).toBe(false);
    expect(canShimmerItem(560, false, undefined, crown, { slimeRain: false })).toBe(true);
  });

  it('瓶中小动物入池 → 放生（目标优先 ShimmerTransformToNPC → 677 微光蝇）并逐个消耗', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const key = VANILLA_ITEM_KEY_BY_ID[1992];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 3);
    for (let i = 0; i < 400 && !d.shimmered; i++) d.fixedUpdate(1, hooksNpc(w, p, spawned));
    expect(d.shimmered).toBe(true);
    expect(d.stack).toBe(0);            // 3 个放生 3 只（:1860-1871）
    expect(d.dead).toBe(true);          // stack ≤ 0 → type=0（:1873-1876）
    expect(npcSpawns).toHaveLength(3);
    expect(npcSpawns.every((s) => s.id === 677)).toBe(true);   // :1866 表项优先
  });

  it('4986 首次入池 → 解锁彩虹史莱姆 681 并消耗；再次入池不再转化', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const key = VANILLA_ITEM_KEY_BY_ID[4986];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 2);
    for (let i = 0; i < 400 && npcSpawns.length === 0; i++) d.fixedUpdate(1, hooksNpc(w, p, spawned));
    expect(w.flags['unlockedSlimeRainbowSpawn']).toBe(true);   // :1822
    expect(npcSpawns).toHaveLength(1);
    expect(npcSpawns[0].id).toBe(681);                          // :1824
    expect(d.stack).toBe(1);                                    // :1832 stack--
    expect(d.dead).toBe(false);
    // 已解锁：CanShimmer 关门，物品滞留微光不再触发
    const d2 = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 1);
    for (let i = 0; i < 400; i++) d2.fixedUpdate(1, hooksNpc(w, p, spawned));
    expect(npcSpawns).toHaveLength(1);
    expect(d2.dead).toBe(false);
  });

  it('560 史莱姆王冠入池 → 触发史莱姆雨并消耗（雨中禁入由 CanShimmer 把门）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const spawned: Spawned[] = [];
    const key = VANILLA_ITEM_KEY_BY_ID[560];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key!], 2);
    for (let i = 0; i < 400 && !w.weather.slimeRain; i++) d.fixedUpdate(1, hooksNpc(w, p, spawned));
    expect(w.weather.slimeRain).toBe(true);    // Main.StartSlimeRain（:1844）
    expect(d.stack).toBe(1);                   // :1845 stack--
    expect(d.shimmered).toBe(true);            // :1852 剩余 stack 微光化
  });
});
