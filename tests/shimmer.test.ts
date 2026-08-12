// 微光实体转化系统回归（WorldItem.GetShimmered / Player shimmer / NPC.GetShimmered）。
// 表来源 = tools/extract-shimmer.mjs（ItemID.cs/NPCID.cs Sets → vanilla-shimmer.json）。
// 探针断言：
//  1. 转化表提取完整性（312 物品对 / 114 NPC 对）+ 已知对抽查
//  2. GetShimmerEquivalentType 等价计数（幻影族 5358-5361 → 5437）
//  3. 钱币 → coinLuck 接通（LuckState.addCoinLuck 距离门 + 面额放大 + 衰减）
//  4. 掉落物入微光端到端：进度累积 → 转化换物品（原堆叠保留）+ 钱币消失入 luck
//  5. 玩家脱困落点搜索（findShimmerFreeSpot：微光内不放、最近空气落点优先）
import { describe, it, expect } from 'vitest';
import {
  canShimmerItem, coinLuckAmount, findShimmerFreeSpot,
  getShimmerEquivalentType, getTransformToItem,
  internalIdOfVanilla, isNpcTownShimmerable, npcShimmerTransformTo,
  npcShimmerTransformToItem, vanillaIdOfItem,
} from '../src/stats/Shimmer';
import { LuckState } from '../src/stats/Luck';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

describe('转化表提取（ItemID.cs / NPCID.cs Sets）', () => {
  it('物品对 312 条 + 抽查已知转化（含火炬 8 → 5353 双向链）', () => {
    expect(getTransformToItem(3460)).toBe(947);      // 夜明锭链头
    expect(getTransformToItem(947)).toBe(1106);
    expect(getTransformToItem(8)).toBe(5353);        // 火炬 → 骨炬
    expect(getTransformToItem(206)).toBe(207);       // 凝胶 ↔ 精炼凝胶族
    expect(getTransformToItem(3461)).toBe(0);        // 月相砖动态分支未接（GAP）
    expect(getTransformToItem(4837)).toBe(999);      // 绿宝石 → 金皇冠（源在键侧）
  });

  it('等价计数（Item.cs:49073-49086）：幻影系 5358-5360 → 5437，普通物品恒等', () => {
    expect(getShimmerEquivalentType(5358)).toBe(5437);
    expect(getShimmerEquivalentType(5360)).toBe(5437);
    expect(getShimmerEquivalentType(5437)).toBe(5437);
    expect(getShimmerEquivalentType(8)).toBe(8);
    expect(getShimmerEquivalentType(5669, true)).toBe(4956); // forDecraft 专用表
  });

  it('CanShimmer 子集：钱币/可转化物为真，无表物品为假，月后锁生效', () => {
    expect(canShimmerItem(71)).toBe(true);            // 铜币
    expect(canShimmerItem(8)).toBe(true);             // 火炬
    expect(canShimmerItem(75)).toBe(false);           // 坠落之星：无表不可转
    expect(canShimmerItem(1326, false)).toBe(false);  // ShimmerPostMoonlord 锁
    expect(canShimmerItem(1326, true)).toBe(true);
  });

  it('NPC 表：114 对转化 + NPC→物品 + 城镇变体名单', () => {
    expect(npcShimmerTransformTo(3)).toBeGreaterThan(0);
    expect(npcShimmerTransformTo(132)).toBe(202);
    expect(npcShimmerTransformToItem(651)).toBe(182);  // 附魔日晷族 → 哥布林数据
    expect(npcShimmerTransformToItem(448)).toBe(5341); // 448 → 银河珍珠 5341
    expect(isNpcTownShimmerable(22)).toBe(true);       // 向导
    expect(isNpcTownShimmerable(17)).toBe(true);       // 商人
    expect(isNpcTownShimmerable(1)).toBe(false);       // 蓝史莱姆非城镇
  });
});

describe('钱币 → 微光化币 → coinLuck（WorldItem.cs:1791-1810 + Player.cs:17943-17963）', () => {
  it('面额放大：银 ×100 / 金 ×10000 / 铂 stack 钳 1 后 ×1e6', () => {
    expect(coinLuckAmount(71, 50)).toBe(50);
    expect(coinLuckAmount(72, 3)).toBe(300);
    expect(coinLuckAmount(73, 2)).toBe(20000);
    expect(coinLuckAmount(74, 7)).toBe(1000000);
  });

  it('AddCoinLuck 距离门 <1000px + 1e6 cap + ×0.9999 衰减', () => {
    const s = new LuckState();
    s.addCoinLuck(999, 500);
    expect(s.coinLuck).toBe(500);
    s.addCoinLuck(1000, 500);           // 恰 1000px 不计
    expect(s.coinLuck).toBe(500);
    s.addCoinLuck(0, 2_000_000);        // cap 1e6
    expect(s.coinLuck).toBe(1_000_000);
    expect(s.coinLuckValue).toBe(0.2);  // >249000 满档
    s.update(1);
    expect(s.coinLuck).toBeLessThan(1_000_000);
  });
});

// ============ 掉落物端到端（TileStore 造微光池） ============

const W = 60, H = 60;

function shimmerWorld(): World {
  const w = new World(W, H, 11, 'shimmer-test');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);               // 池底
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4); // 微光满格
  }
  w.lavaLine = 50;
  return w;
}

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('掉落物入微光（WorldItem.Shimmering + GetShimmered）', () => {
  it('金币 73 入池 90t → 消失并按 ×10000 计入 coinLuck', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const key = 'coin_gold';
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[key], 2);
    expect(vanillaIdOfItem(d.itemId)).toBe(73);
    for (let i = 0; i < 200 && !d.dead; i++) d.fixedUpdate(1, hooks(w, p));
    expect(d.dead).toBe(true);
    expect(p.luckState.coinLuck).toBe(2 * 10000); // 20000 铜币面额
  });

  it('火炬 8 入池 → 换成 5353 原堆叠保留并微光化上浮（shimmered）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY['torch'], 5);
    for (let i = 0; i < 300; i++) {
      d.fixedUpdate(1, hooks(w, p));
      if (d.shimmered) break;
    }
    expect(d.shimmered).toBe(true);
    expect(d.stack).toBe(5);
    expect(vanillaIdOfItem(d.itemId)).toBe(5353);
    expect(internalIdOfVanilla(5353)).toBeGreaterThan(0);
  });

  it('不可转化物（坠落之星 75）入池不转化不消失', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[75]], 1);
    for (let i = 0; i < 400; i++) d.fixedUpdate(1, hooks(w, p));
    expect(d.dead).toBe(false);
    expect(d.shimmered).toBe(false);
    expect(d.shimmerTime).toBe(0);
  });
});

describe('玩家脱困落点（ShimmerHelper.FindSpotWithoutShimmer 近似）', () => {
  it('微光柱内不放人；池外最近的空气+实地落点被选中', () => {
    const w = shimmerWorld();
    const st = w.store;
    // 池心上方全是微光 → 不该选池内任何格
    const inPool = findShimmerFreeSpot(st, 20, 36);
    if (inPool) {
      const i = st.idx(inPool.x, inPool.y);
      expect(st.liquid[i] === 0 || st.liquidType[i] !== 4).toBe(true);
    }
    // 池外（x=35 无液体，y=39 上方三格空 + 下方实地 40 行石）→ 选脚下实地上一格
    for (let x = 31; x < 40; x++) st.setTile(x, 40, 1);
    const spot = findShimmerFreeSpot(st, 35, 39);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeGreaterThanOrEqual(31);
    expect(spot!.y).toBeLessThan(40);
  });
});

describe('玩家浸微光（buff 353 + 脱困传送，Player.cs:27420/11381/28377）', () => {
  it('入微光：shimmering 置位 + 受击免疫 + timeShimmering 累积；脱困传送落点无微光', () => {
    const w = shimmerWorld();
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const h = hooks(w, p);
    p.fixedUpdate(1 / 60, h);
    expect(p.inShimmer).toBe(true);
    expect(p.shimmering).toBe(true);          // y=36 < lavaLine 50 → buff 353 生效
    expect(p.timeShimmering).toBe(1);
    expect(p.damage(9999, p.cx, p.cy)).toBe(false); // Hurt :37591-37595 直接 0
    // 强制走脱困（≥1200 且有输入）：传送到池外无微光落点
    p.timeShimmering = 1200;
    p.inputX = 1;
    p.fixedUpdate(1 / 60, h);
    const st = w.store;
    const i = st.idx(Math.floor(p.cx / TILE), Math.floor((p.y + p.h - 4) / TILE));
    expect(st.liquid[i] === 0 || st.liquidType[i] !== 4).toBe(true); // 落点不在微光里
    expect(p.shimmering).toBe(false);
    expect(p.timeShimmering).toBe(0);
  });

  it('地狱层内微光不生效（:11391-11397 position.Y/16 > UnderworldLayer → DelBuff）', () => {
    const w = shimmerWorld();
    w.lavaLine = 30;                          // 玩家 y=36 已入地狱层
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    p.fixedUpdate(1 / 60, hooks(w, p));
    expect(p.inShimmer).toBe(true);
    expect(p.shimmering).toBe(false);
  });
});
