// R32 钓竿案回归（2026-08-25 用户实报：钓鱼时竿贴图不画、鱼线凭空出现；浮漂被拖走）：
//   ① 竿尖偏移表/线色表逐值对拍（DrawProj_FishingLine，1458 Main.cs:36122-36240；
//      1456 Main.cs:34967-35106 / 1457 Main.cs:36116- 三版同值）
//   ② ItemCheck_HackHoldStyles 静持门纯判定（Player.cs:53483-53492）——竿+浮漂在场
//      +动画窗收 → holdStyle 运行时置 1（此前缺失 = 抛竿后手上看不到竿、线凭空）
//   ③ AI_061 存活门/距离断线/收线飞行（Projectile.cs:54605-54705 / PullFishingBobbers
//      Player.cs:53019-53043）——手持非竿即收漂；>900px 自动收线；触玩家盒才 Kill
import { describe, it, expect } from 'vitest';
import {
  Bobber, hackHoldStyleActive,
  POLE_TIP, POLE_STRING_COLOR,
  RETRACT_DIST, KILL_DIST, REEL_SMOOTH, REEL_SPEED, BOBBER_BOX,
} from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const TILE = 16;
const ROD_2289 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!;

// ============================================================
// ① 每竿型线起点偏移表 / 线色表（1458 Main.cs:36145-36233 逐 case 复核）
// ============================================================
describe('竿尖偏移表 POLE_TIP（DrawProj_FishingLine 全竿型）', () => {
  it('11 支在册竿 [X·dir, Y·gravDir] 与 1458 反编译逐值相等', () => {
    // 木竿2289/强化2291/灵魂渔者2292/玻纤2293/金2294/机械2295/坐鸭2296/
    // 血肉抛竿2421/热线2422/血肉竿4325/圣甲虫4442
    expect(POLE_TIP).toEqual({
      2289: [43, -36], 2291: [43, -34], 2292: [46, -34], 2293: [43, -34],
      2294: [43, -30], 2295: [43, -30], 2296: [43, -30],
      2421: [47, -36], 2422: [47, -32], 4325: [44, -32], 4442: [44, -32],
    });
  });
  it('竿→浮漂弹配对（Item.cs:23001 shoot = 360 | 361+type-2291 | 381/382/760/775）', () => {
    const pairs: Array<[number, number]> = [
      [2289, 360], [2291, 361], [2292, 363], [2293, 362], [2294, 364],
      [2295, 365], [2296, 366], [2421, 381], [2422, 382], [4325, 760], [4442, 775],
    ];
    expect(pairs.filter(([p]) => !(itemFuncOfVid(p)?.fishingPole ?? 0)).map(([p]) => p))
      .toEqual([]);   // 表内 vid 必须全是钓竿
    expect(itemFuncOfVid(2289)?.shoot).toBe(360);
    expect(itemFuncOfVid(4325)?.shoot).toBe(760);
    expect(itemFuncOfVid(4442)?.shoot).toBe(775);
  });
  it('线色覆写 7 支（Main.cs:36141-36162 基色 (200,200,200) 外的竿型）', () => {
    expect(POLE_STRING_COLOR).toEqual({
      2293: [203, 190, 210], 2294: [100, 180, 230], 2295: [250, 90, 70],
      2421: [183, 77, 112], 2422: [255, 226, 116], 4325: [200, 100, 100],
      4442: [100, 100, 200],
    });
  });
});

// ============================================================
// ② HackHoldStyles 静持门（Player.cs:53483-53492）
// ============================================================
describe('hackHoldStyleActive（竿静持绘制门）', () => {
  it('竿+浮漂在场+动画窗收 → 1（ItemCheck_HackHoldStyles 置位支）', () => {
    expect(hackHoldStyleActive(5, true, true)).toBe(1);
  });
  it('竿在手但浮漂不在场 → 0（竿不静持——原版收漂后手上无竿）', () => {
    expect(hackHoldStyleActive(5, false, true)).toBe(0);
  });
  it('竿+浮漂在场但使用动画窗未收 → 0（挥竿期走 useStyle 动画支）', () => {
    expect(hackHoldStyleActive(5, true, false)).toBe(0);
  });
  it('非钓竿 → -1（不接管，沿用物品自身 holdStyle）', () => {
    expect(hackHoldStyleActive(0, true, true)).toBe(-1);
  });
});

// ============================================================
// ③ AI_061 距离断线 / 收线飞行 / 存活门（Projectile.cs:54605-54705）
// ============================================================
function makeHooks() {
  const store = new TileStore(200, 120);
  for (let dx = 0; dx < 20; dx++) {
    for (let dy = 0; dy < 3; dy++) store.setLiquid(64 + dx, 95 + dy, 200, 1);
  }
  const player = new Player(70 * TILE, 90 * TILE, new Inventory());
  player.inv.selected = 5;
  player.inv.slots[5] = { id: ROD_2289, stack: 1 };   // 手持木竿（shoot 360）
  return {
    hooks: {
      world: {
        store,
        clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
        weather: { raining: false, cloudAlpha: 0 },
        flags: {}, scene: null,
      } as never,
      player: player as never,
      enemies: () => [], critters: () => [], spawnDrop: () => null,
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {},
    } as unknown as GameHooks,
    store,
    player,
  };
}

describe('AI_061 存活门与距离断线（R32）', () => {
  it('常量与原版一致（900 断线 / 3000 强杀 / 平滑窗 10 / 收线速 15.9 / 弹盒 14）', () => {
    expect(RETRACT_DIST).toBe(900);
    expect(KILL_DIST).toBe(3000);
    expect(REEL_SMOOTH).toBe(10);
    expect(REEL_SPEED).toBe(15.9);
    expect(BOBBER_BOX).toBe(14);   // SetDefaults :4511-4512 width=height=14
  });

  it('漂浮中玩家小范围走动：浮漂不被拖着跑（<900px 不收线、位置自锚定）', async () => {
    const { hooks, player } = makeHooks();
    const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    const ax = b.x, ay = b.y;
    // 玩家左右踱步 ±48px × 60 tick
    for (let s = 0; s < 4; s++) {
      player.vx = s % 2 ? -1.5 : 1.5;
      for (let k = 0; k < 60; k++) {
        player.x += player.vx;
        b.fixedUpdate(1, hooks);
      }
    }
    player.x = 70 * TILE;
    expect(b.dead).toBe(false);
    expect(b.retracting).toBe(false);       // 未触发 900px 门
    expect(b.x).toBe(ax);                   // 浮漂钉在落水点（不随玩家位移）
    expect(b.y).toBe(ay);
  });

  it('玩家走远超 900px → 自动收线（ai[0]=1），飞回途中触玩家盒 Kill（断线语义）', () => {
    const { hooks, player } = makeHooks();
    const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    // 玩家瞬移 1200px 外（>900 门）
    player.x = (70 + 80) * TILE;
    b.fixedUpdate(1, hooks);
    expect(b.retracting).toBe(true);        // :54703-54705 ai[0]=1
    expect(b.dead).toBe(false);
    // 收线飞行：距玩家单调收敛，最终触盒即 Kill（tileCollide=false 直移）
    let d0 = Math.hypot(player.cx - b.cx, player.cy - b.cy);
    let killed = false;
    for (let k = 0; k < 600; k++) {
      b.fixedUpdate(1, hooks);
      if (b.dead) { killed = true; break; }
      const d1 = Math.hypot(player.cx - b.cx, player.cy - b.cy);
      expect(d1).toBeLessThanOrEqual(d0);   // 单调逼近（平滑窗 10 内可能微抖，取 ≤）
      d0 = d1;
    }
    expect(killed).toBe(true);
  });

  it('无咬收竿：reel() → 收线态而非即时消失（PullFishingBobbers :53031），湿态上提 vy=-10', () => {
    const { hooks, player } = makeHooks();
    const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    expect(b.reel(hooks)).toBe(0);          // 无咬：返回 0
    expect(b.retracting).toBe(true);        // ai[0]=1 收线飞行
    expect(b.vy).toBe(-10);                 // :53033-53035 wet 上提一记
    expect(b.dead).toBe(false);             // Game.reelBobber 尾部 !retracting 门放行
    let killed = false;
    for (let k = 0; k < 600; k++) { b.fixedUpdate(1, hooks); if (b.dead) { killed = true; break; } }
    expect(killed).toBe(true);              // 触玩家盒 Kill（:54666-54668）
  });

  it('手持切到非钓竿 → 浮漂立即消失（存活门 :54606 fishingPole==0 支）', () => {
    const { hooks, player } = makeHooks();
    const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    player.inv.slots[5]!.stack = 0;         // 手上不再有竿
    player.inv.slots[5] = null;
    b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
  });

  it('手持竿 shoot 与浮漂弹型不符 → Kill；浮漂饰品覆写弹 986-993 豁免（:54609 flag）', () => {
    const { hooks, player } = makeHooks();
    const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    const savedX = b.x;
    b.projId = 364;                          // 金竿浮漂 ≠ 木竿 shoot 360
    b.fixedUpdate(1, hooks);
    expect(b.dead).toBe(true);
    // 覆写弹豁免：987 在木竿手上仍存活
    const c = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
    c.x = savedX; c.y = 95 * TILE + 8;
    c.floating = true;
    c.liquidKind = 'water';
    c.projId = 987;                          // 浮漂饰品覆写档（5139-5146 → 986-993）
    c.fixedUpdate(1, hooks);
    expect(c.dead).toBe(false);
  });

  it('★R32 用户实报回归：itemfunc 缺 shoot 键的竿（金竿 2294 等）浮漂不被误杀——', () => {
    // 存活门 shoot 比对读 bobberProjFor(手持竿)（=SetDefaults shoot 表移植），
    // 不读 vanilla-itemfunc.shoot（该表仅 2289/4325/4442 有键——曾致金竿/玻纤/
    // 强化/机械/坐鸭/热线浮漂一出生即 Kill = "挥不出鱼线"）
    for (const [poleVid, bobberId] of [[2291, 361], [2292, 362], [2293, 363], [2294, 364], [2295, 365], [2296, 366], [2421, 381], [2422, 382]] as const) {
      const { hooks, player } = makeHooks();
      const poleId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[poleVid]!]!;
      player.inv.slots[5] = { id: poleId, stack: 1 };
      const b = new Bobber(player.cx + 8, 95 * TILE + 8, 0, 2, 30, 0, 15, () => player);
      b.projId = bobberId;                   // 正确配对浮漂
      let landed = false;
      for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
      expect(landed).toBe(true);             // 落水漂浮=未被存活门误杀
      expect(b.dead).toBe(false);
    }
  });
});
