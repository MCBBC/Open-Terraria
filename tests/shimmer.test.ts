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
  canShimmerItem, coinLuckAmount, findShimmerFreeSpot, shimmerTeleportPos,
  getShimmerEquivalentType, getTransformToItem,
  internalIdOfVanilla, isNpcShimmerImmune, isNpcTownShimmerable, npcShimmerTransformTo,
  npcShimmerTransformToItem, vanillaIdOfItem,
} from '../src/stats/Shimmer';
import { LuckState } from '../src/stats/Luck';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Enemy } from '../src/entities/Enemy';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
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
    expect(getTransformToItem(3461)).toBe(0);        // 无月相参 → 动态分支不启用（表外）
    // 月相砖动态分支全 8 相位（ShimmerTransforms.cs:108-125;MoonPhase 枚举序 0-7）
    const LUNAR = [5408, 5401, 5403, 5402, 5406, 5407, 5405, 5404]; // Full/TQL/HL/QL/Empty/QR/HR/TQR
    for (let ph = 0; ph < 8; ph++) {
      expect(getTransformToItem(3461, ph)).toBe(LUNAR[ph]);
      // 转化目标物品必须已注册(★曾缺 5402/5406/5408 → 对应月相转化静默丢物)
      expect(internalIdOfVanilla(LUNAR[ph])).toBeGreaterThanOrEqual(0);
    }
    expect(canShimmerItem(3461, false, 3)).toBe(true); // 有月相 → 可微光化(无参时 false)
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

// 高度取 256：UnderworldLayer = h-200 = 56（Main.cs:2863）须落在池（行 33-40）
// 之下，玩家（行 36）才在地狱层之上可获 buff 353——60 高的小世界 h-200=-140
// 会让全域被判入地狱层、微光永不生效（2026-08-13 地狱层门 lavaLine→h-200 对齐）
const W = 60, H = 256;

function shimmerWorld(): World {
  const w = new World(W, H, 11, 'shimmer-test');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);               // 池底
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4); // 微光满格
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1); // 池外实地（脱困传送落点候选）
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
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[73]], 2);
    expect(vanillaIdOfItem(d.itemId)).toBe(73);
    for (let i = 0; i < 200 && !d.dead; i++) d.fixedUpdate(1, hooks(w, p));
    expect(d.dead).toBe(true);
    expect(p.luckState.coinLuck).toBe(2 * 10000); // 20000 铜币面额
  });

  it('火炬 8 入池 → 换成 5353 原堆叠保留并微光化上浮（shimmered）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]], 5);
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

  it('shimmerWet = Collision.shimmer 盒判定（浅液面盒缘擦液即湿,非中心格 >30 门）', () => {
    // 浅微光格 liquid=40 → 液面段仅上部 ~3px（drop=(256-40)/32=6.75 → y+13.5 起 3px 高）。
    // 物品盒顶压入液面段 → 原版盒判定 true。旧实现中心单格 >30 在液面边界处时真时假
    // = "有时能分解有时不能"根因（Shimmering 顶格采样是另一层门,满液没顶必触发）
    const w = new World(W, H, 11, 'shimmer-shallow');
    const st = w.store;
    for (let x = 10; x < 30; x++) st.setTile(x, 40, 1);
    for (let x = 10; x < 30; x++) st.setLiquid(x, 39, 40, 4);   // 浅液(40/255)
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const d = new ItemDrop(20 * TILE, 39 * TILE + 2, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]], 1);
    d.vx = 0; d.vy = 0;
    d.fixedUpdate(1, hooks(w, p));
    expect(d.shimmerWet).toBe(true);          // 盒擦浅液即湿（液面段 627.5-630.5 与盒顶相交）
  });

  it('decraft 产物 shimmered 上浮 + vx 通用摩擦衰减（:927-932,勿放非 shimmered 分支）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const drops: ItemDrop[] = [];
    const h = hooks(w, p);
    (h as unknown as { spawnDrop: (x: number, y: number, key: string, stack: number, vx: number, vy: number) => ItemDrop | null }).spawnDrop =
      (x: number, y: number, key: string, stack: number, vx: number, vy: number) => {
        const d = new ItemDrop(x, y, ITEM_BY_KEY[key], stack);
        d.vx = vx; d.vy = vy;
        drops.push(d);
        return d;
      };
    const d = new ItemDrop(20 * TILE, 36 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]], 1);
    d.vx = 0; d.vy = 0;
    for (let i = 0; i < 300 && !d.dead; i++) d.fixedUpdate(1, h);
    expect(d.dead).toBe(true);
    expect(drops.length).toBe(2);             // 木材 12 + 铜矿 9
    const mats = drops.map((x) => vanillaIdOfItem(x.itemId)).sort((a, b) => a - b);
    expect(mats).toEqual([9, 12]);
    expect(drops.every((x) => x.shimmered)).toBe(true);   // 上浮漂浮
    // 散射初速 |vx|≤2.2;通用摩擦每 tick ×0.95——驱动 200t 后 |vx| 必归零(<0.1)
    // (旧实现 shimmered 分支无摩擦 → 无限横漂 + 恒 >0.2 永不可拾)
    for (let i = 0; i < 200; i++) drops.forEach((x) => x.fixedUpdate(1, h));
    expect(drops.every((x) => Math.abs(x.vx) < 0.1)).toBe(true);
  });
});

describe('玩家脱困落点（ShimmerHelper.FindSpotWithoutShimmer 近似）', () => {
  it('微光柱内不放人；池外最近的空气+实地落点被选中', () => {
    const w = shimmerWorld();
    const st = w.store;
    // 池心上方全是微光 → 不该选池内任何格（必然断言：落点必存在且必在池外）
    const inPool = findShimmerFreeSpot(st, 20, 36);
    expect(inPool).not.toBeNull();
    const i = st.idx(inPool!.x, inPool!.y);
    expect(st.liquid[i] === 0 || st.liquidType[i] !== 4).toBe(true);
    // 池列 x∈[10,30) 全液——落点必须溢出到池外实地列
    expect(inPool!.x).toBeGreaterThanOrEqual(30);
    // 池外（x=35 无液体，y=39 上方三格空 + 下方实地 40 行石）→ 选脚下实地上一格
    for (let x = 31; x < 40; x++) st.setTile(x, 40, 1);
    const spot = findShimmerFreeSpot(st, 35, 39);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeGreaterThanOrEqual(31);
    expect(spot!.y).toBeLessThan(40);
  });

  it('封闭洞穴兜底（Player.cs:28442-28469 三层兜底）：玩家周围 60 圈无落点 → 出生点兜底必脱困', () => {
    // 140×140 全实心世界：玩家腔在 (10,10)，出生点区在 (130,120)——切比雪夫距离 120 > 59，
    // 第一层搜索（r<60）必空；出生点上方净空+实地 → 兜底层命中
    const EW = 140, EH = 140;
    const w = new World(EW, EH, 11, 'shimmer-enclosed');
    const st = w.store;
    for (let x = 0; x < EW; x++) for (let y = 0; y < EH; y++) st.setTile(x, y, 1);
    // 封闭微光腔（玩家位 10,10；腔 3×3 微光 + 上方 3 格空气）
    for (let x = 9; x <= 11; x++) {
      st.setTile(x, 9, 0); st.setTile(x, 10, 0); st.setTile(x, 11, 0);
      st.setLiquid(x, 10, 255, 4); st.setLiquid(x, 11, 255, 4);
    }
    // 出生点区：上方净空（3 格）+ 实地
    for (let x = 127; x <= 133; x++) {
      st.setTile(x, 121, 1);
      st.setTile(x, 120, 0); st.setTile(x, 119, 0); st.setTile(x, 118, 0);
    }
    w.spawnX = 130; w.spawnY = 120;
    w.lavaLine = 125;
    // 玩家层（无兜底参数）→ 旧实现在这里返回 null = 每 20s 重试永远失败 = 永久卡死
    expect(findShimmerFreeSpot(st, 10, 10)).toBeNull();
    // 三层兜底：出生点周围必命中
    const spot = findShimmerFreeSpot(st, 10, 10, w.spawnX, w.spawnY);
    expect(spot).not.toBeNull();
    expect(Math.abs(spot!.x - 130)).toBeLessThan(60);
    expect(st.liquid[st.idx(spot!.x, spot!.y)] === 0 || st.liquidType[st.idx(spot!.x, spot!.y)] !== 4).toBe(true);
  });

  it('落点下方 7 格内有微光 → 拒绝（ShimmerHelper.cs:80-81 第三判 WetCollision(h+100)）', () => {
    const w = shimmerWorld();
    const st = w.store;
    // 独立小池（x=50 列）：空气 34-36 / 实地 37 / 微光 38-40 / 实地 41。
    // 无第三判时 (50,36) 是"3 格空气 + 下方实地"的理想落点 → 传送后落回微光里
    st.setTile(50, 37, 1);
    for (let y = 38; y <= 40; y++) st.setLiquid(50, y, 255, 4);
    st.setTile(50, 41, 1);
    const spot = findShimmerFreeSpot(st, 50, 36);
    expect(spot).not.toBeNull();
    // 微光列（x=50）本身不得被选为落点
    expect(spot!.x).not.toBe(50);
    // 被选落点的下方 7 格必须全无微光
    for (let j = spot!.y + 1; j <= spot!.y + 7; j++) {
      const i = st.idx(spot!.x, j);
      expect(st.liquid[i] === 0 || st.liquidType[i] !== 4).toBe(true);
    }
  });

  it('传送锚点 = 玩家盒左上角（ShimmerHelper.cs:9 vector + Player.cs:28400-28402 +(0,-2)）', () => {
    // 原版落点向量 = (tile*16, tile*16) + (-w/2, -h)，Teleport 再 +(0,-2)——
    // 旧实现 {tile*16, tile*16-2} 漏 -w/2/-h → 脚部沉入下方实心 40px（半身入地）
    expect(shimmerTeleportPos({ x: 100, y: 200 })).toEqual({ x: 100 * TILE - 10, y: 200 * TILE - 44 });
    expect(shimmerTeleportPos({ x: 0, y: 0 }, 20, 42)).toEqual({ x: -10, y: -44 });
  });
});

describe('玩家浸微光（buff 353 + 穿墙下坠 + 脱困传送，Player.cs:27420/11381/27868/28377）', () => {
  it('穿墙下坠 → 落入空腔实体化（:27868 velocity×0.375 绕过碰撞 + :11403-11419 落点检查）', () => {
    const w = shimmerWorld();
    const st = w.store;
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const h = hooks(w, p);
    p.inputX = 1; p.inputJump = true;          // 封输入：穿落全程不得横移
    const x0 = p.x, y0 = p.y;
    const boxSolid = (): boolean => {
      for (let ty = Math.floor(p.y / TILE); ty <= Math.floor((p.y + p.h) / TILE); ty++)
        for (let tx = Math.floor(p.x / TILE); tx <= Math.floor((p.x + p.w) / TILE); tx++)
          if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
      return false;
    };
    let piercedSolid = false;   // 穿落中盒覆盖实心格（池底 row 40）且脱离液面仍 shimmering
    let pierceBuffTime = -1;    // 穿落段 buffTime=6t=0.1s 刷新（:11416）
    let solidified = false;     // 全非实心容纳空间 → DelBuff 实体化
    for (let i = 0; i < 600 && !(piercedSolid && solidified); i++) {
      p.fixedUpdate(1 / 60, h);
      if (p.shimmering && !p.inShimmer && boxSolid()) {
        piercedSolid = true;
        pierceBuffTime = p.buffs.active.get(BuffType.Shimmered) ?? -1;
      }
      if (piercedSolid && !p.shimmering && !p.buffs.has(BuffType.Shimmered)) solidified = true;
    }
    expect(p.y).toBeGreaterThan(y0);           // 下坠（旧实现的"原地慢沉"已废）
    expect(p.x).toBe(x0);                      // 封输入 → 无横移
    expect(piercedSolid).toBe(true);           // 穿入实心格（无视 tile collision）
    expect(pierceBuffTime).toBeCloseTo(0.1, 5);// 6t = 0.1s 穿落刷新
    expect(solidified).toBe(true);             // 盒覆盖全非实心 → 实体化
    expect(p.y).toBeGreaterThanOrEqual(41 * TILE); // 已穿出池底实心层（row 40）下方
  });

  it('入微光：shimmering 置位 + 受击免疫 + timeShimmering 累积；脱困传送落点无微光', () => {
    const w = shimmerWorld();
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const h = hooks(w, p);
    p.fixedUpdate(1 / 60, h);
    expect(p.inShimmer).toBe(true);
    expect(p.shimmering).toBe(true);          // y=36 < UnderworldLayer(=h-200=56) → buff 353 生效
    expect(p.timeShimmering).toBe(1);
    expect(p.damage(9999, p.cx, p.cy)).toBe(0); // Hurt :37591-37595 免伤——damage() 返回数值 0=未受伤（2026-08-13 重构 false→0，曾 .toBe(false) 陈旧断言）
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

  it('地狱层内微光不生效（:27430/:11391-11397 position.Y/16 > UnderworldLayer(=h-200) → 不授予/即撤）', () => {
    const w = shimmerWorld();
    const st = w.store;
    // 世界底部另造深池（行 60-63 液 + 行 64 实地）——UnderworldLayer = 256-200 = 56，
    // 池体整体在地狱层内（旧实现用 lavaLine=30 模拟，门源已对齐 Main.cs:2863）
    for (let x = 10; x < 30; x++) {
      st.setTile(x, 64, 1);
      for (let y = 60; y < 64; y++) st.setLiquid(x, y, 255, 4);
    }
    const p = new Player(20 * TILE, 61 * TILE, new Inventory());
    p.fixedUpdate(1 / 60, hooks(w, p));
    expect(p.inShimmer).toBe(true);    // 浸液判定照常（盒/脚格采样不受层门影响）
    expect(p.shimmering).toBe(false);  // y/16=61 > 56 → 地狱层门拦授予
  });
});

// ============ 回归探针（2026-08：矿车/装备聚合重写把微光封输入挪到移动积分之后） ============
describe('微光封输入回归探针（buff 353 frozen 语义 + 图标来源 + NPC 转化链）', () => {
  it('浸微光：inputX 清零先于移动积分 → 不可行走 + Shimmered buff 每帧刷新（图标来源）', () => {
    const w = shimmerWorld();
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const h = hooks(w, p);
    const x0 = p.x;
    for (let i = 0; i < 10; i++) {
      // 模拟 Game.ts:2234 每帧重灌输入：灌入后 fixedUpdate 必须先清零再积分。
      // 回归形态 = 清零在 else-if 链的 shimmering 物理分支（积分之后）→ 微光里自由行走
      p.inputX = 1; p.inputJump = true; p.inputDown = true;
      p.fixedUpdate(1 / 60, h);
    }
    expect(p.inShimmer).toBe(true);
    expect(p.shimmering).toBe(true);
    expect(p.buffs.has(BuffType.Shimmered)).toBe(true);  // 左上角 debuff 图标显示前提
    expect(p.buffs.active.get(BuffType.Shimmered)).toBeCloseTo(1, 5); // 浸液 60t=1s 刷新（:11400）
    expect(p.inputX).toBe(0);                            // 清零生效（先于 const ix 消费点）
    expect(Math.abs(p.vx)).toBeLessThan(0.05);           // 无水平加速 → 摩擦钳零
    expect(p.x).toBe(x0);                                // 微光中不可位移
  });

  it('敌怪浸微光 90t → NPC.GetShimmered 转化/消散链路活性（物理可入湖，入后必转化）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    // 走原版数据工厂（fromVanilla 才置 vanillaId；直接 new Enemy('zombie') 是旧本地
    // 数据路径，vanillaId=null → 微光转化门直接跳过——生产刷怪全部走 fromVanilla）
    const e = Enemy.fromVanilla(3, 20 * TILE, 34 * TILE);   // 僵尸（NPCID 3）
    expect(e).not.toBeNull();
    expect(e!.vanillaId).toBe(3);
    const orig = e!.vanillaId;
    for (let i = 0; i < 200 && !e!.dead; i++) e!.fixedUpdate(1 / 60, h as never);
    // ShimmerTransformToNPC 换型（vanillaId 变）或 TransformToItem 掉物后消散（dead）
    expect(e!.dead || e!.vanillaId !== orig).toBe(true);
  });
});

describe('NPC 免微光名单（NPCID.Sets.ShimmerImmunity, NPCID.cs:4837 → NPC.cs:17773 buffImmune[353]）', () => {
  it('131 id：Boss（50/245-249/657-660）、城镇宠物（637/638/656/670/678-684）、微光原住民（676/677）在表；僵尸 3 / EoC 4 不在', () => {
    // Boss 及部件
    for (const id of [50, 245, 246, 247, 248, 249, 657, 658, 659, 660, 5, 115, 116, 139]) {
      expect(isNpcShimmerImmune(id), `npc ${id}`).toBe(true);
    }
    // 城镇宠物（housingCategory=1 全员）
    for (const id of [637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]) {
      expect(isNpcShimmerImmune(id), `npc ${id}`).toBe(true);
    }
    // 微光原住民 / 小动物
    expect(isNpcShimmerImmune(676)).toBe(true);  // ShimmerSlime
    expect(isNpcShimmerImmune(677)).toBe(true);  // Shimmerfly
    expect(isNpcShimmerImmune(356)).toBe(true);  // Butterfly
    // 非免表：可正常进 shimmering（GetShimmered 无表项时为空操作）
    expect(isNpcShimmerImmune(3)).toBe(false);   // 僵尸（有转化链）
    expect(isNpcShimmerImmune(4)).toBe(false);   // EoC——免表无此 id
    expect(isNpcShimmerImmune(1)).toBe(false);   // 蓝史莱姆（→ 676 微光史莱姆）
  });

  it('免表敌怪浸微光不转化（入口门 buffImmune[353] → shimmering 恒 false）', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    // 5 = 克苏鲁仆从（ShimmerImmunity 成员，且不在任何转化表——转化与否可判）
    const e = Enemy.fromVanilla(5, 20 * TILE, 34 * TILE);
    expect(e).not.toBeNull();
    expect(e!.vanillaId).toBe(5);
    for (let i = 0; i < 400 && !e!.dead; i++) e!.fixedUpdate(1 / 60, h as never);
    expect(e!.dead).toBe(false);
    expect(e!.vanillaId).toBe(5);
  });
});

describe('微光化物品上浮白光（WorldItem.cs:486-511 dust 309 + (1-shimmerTime)*0.8 光）', () => {
  it('转化后 shimmerTime 1 → 衰减 0.01/t：lightRGB 渐亮 0→0.8；尘 1/30t 量级', () => {
    const w = shimmerWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    let dust = 0;
    const h = {
      ...hooks(w, p),
      spawnParticles: () => { dust++; },
    } as GameHooks;
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]], 1); // 火炬 → 5353 骨炬
    for (let i = 0; i < 400 && !d.shimmered; i++) d.fixedUpdate(1, h);   // 沉底 + 90t 浸入
    expect(d.shimmered).toBe(true);
    expect(d.shimmerTime).toBe(1);               // GetShimmered 尾段 :1948
    expect(d.lightRGB).toEqual([0, 0, 0]);       // (1-1)*0.8：转化瞬间不亮
    for (let i = 0; i < 100; i++) d.fixedUpdate(1, h);   // :552-558 衰减（shimmered 同走）
    expect(d.shimmerTime).toBeCloseTo(0, 5);
    const l = d.lightRGB!;
    expect(l[0]).toBeCloseTo(0.8, 5);
    expect(l[1]).toBeCloseTo(0.8, 5);
    expect(l[2]).toBeCloseTo(0.8, 5);
    expect(dust).toBeGreaterThan(0);             // 上浮白光尘已出
    expect(dust).toBeLessThan(80);               // ~1/30t × 250t ≈ 8 枚的量级上限
  });
});
