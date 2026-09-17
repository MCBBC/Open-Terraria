// ★FX58 定谳测试（用户实报「原版溜滑鞋(Ice Skates)最低水平移速会匹配方块放置速度」）：
//
// 【原版定谳 = 伪bug·归属错位】
//   1457 反编译全量 grep iceSkate 仅 10 处消费点（Player.cs :1071 字段/:15205 950/
//   :15368 1861/:15503 1862/:15510 5000 置位/:18774 复位/:26754 slippy2 牵引/
//   :26763 slippy 牵引/:28249 CheckIceBreak 门）——【不存在】任何「冰鞋最低水平
//   移速 × 方块放置节奏(useTime/tileSpeed)」的行；冰鞋移动面完整集合 =
//   slippy2(:26750-26757 acc×0.6/slowdown=0/冰刀 acc×3.5+maxRun×1.25) +
//   slippy(:26760-26771 acc×0.7/冰刀同/无冰刀 slowdown×0.1)。
//   「滑行速度与放置速度相匹配」的机制载体是【滚轴鞋坐骑】（MountID 57-60，
//   Player.RollerSkateMovement :28738-28776：num3=手持可放置物/魔杖 useTime 否则 10、
//   num4=(int)(num3×tileSpeed)、num6=max(1.5,16/num4) 巡航挡）——官方 zh 名即
//   「绿/经典/派对溜冰鞋」（tooltip「滑行速度与放置速度相匹配」），与配饰 950
//   「溜冰鞋」同名撞车 = 用户误 attribution 的根源。SW-BJ59 已 1:1 移植并测试
//   （src/entities/Player.ts 滚轴鞋块 + src/entities/Mounts.ts mountRollerSkateStep
//   + tests/sw-bj59-roller-skates.test.ts）。
//
// 【本测试职责 = 定谳锁定（反伪影双向）】
//   正向：冰鞋牵引公式 1:1（acc 0.08×0.7×3.5=0.196/t、上限带 3×1.25=3.75、
//         无冰刀滑行 slowdown×0.1）；
//   正向：「连续放置不被自身减速拖慢」是涌现语义——放置窗(itemAnimation>0)下
//         vx 轨迹与空手逐位相等（原版 HorizontalMovement 整链不读 itemAnimation）；
//   反向：冰鞋滑行衰减恰 = runSlowdown 0.2/t 全额且【无任何正数下限】——
//         禁止未来把滚轴鞋巡航挡「补」进冰鞋（原版无此行，补=反模式）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_BY_KEY } from '../src/data/tiles';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

const fakeHooks = (w: World, p?: Player) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  spawnDrop: () => null,
  damagePlayer: (): number => 0,
  addDamageNumber: () => {},
  cutTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
});

/** 冰面世界：y=30 一行冰块（TileID.Sets.IceSkateSlippery 161→内部 id 47），玩家 (20,27) */
const mkIceWorld = (): World => {
  const w = new World(60, 60, 42, 'fx58-ice');
  const ice = TILE_BY_KEY['ice'];
  expect(ice).toBeGreaterThan(0);
  for (let x = 8; x <= 52; x++) w.store.setTileSilent(x, 30, ice);
  return w;
};
const mkSkater = (w: World): Player => {
  const p = new Player(20 * 16, 27 * 16, new Inventory());
  p.inv.armor[3] = { id: _iid(950), stack: 1 };   // 溜冰鞋（Player.cs:15203-15206 仅置 iceSkate）
  return p;
};
const settle = (p: Player, w: World, ticks = 12): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};

// ============================================================================
// 1 冰鞋牵引公式（Player.cs:26760-26767 逐值；基底 runAcceleration=0.08f :2505,
//    runSlowdown=0.2f :2507——冰面加速 = 0.08×0.7×3.5 = 0.196/t,≠ 减速基底 0.2）
// ============================================================================
describe('FX58 冰鞋牵引 1:1（slippy acc×0.7×3.5 / maxRun×1.25）', () => {
  it('起跑线性段：0.08×0.7×3.5 = 0.196/t 精确（:2505 基底×:26762×:26765）', () => {
    const w = mkIceWorld();
    const p = mkSkater(w);
    settle(p, w);
    expect(p.onGround).toBe(true);
    p.inputX = 1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(0.196, 9);           // 无反向制动臂（vx≥0 不进减速）
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(0.392, 9);
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(0.588, 9);
  });

  it('上限带 = maxRun 3×1.25 = 3.75 锯齿（t20 末 19×0.196+0.196=3.92；此后摩擦回落 0.2/t）', () => {
    const w = mkIceWorld();
    const p = mkSkater(w);
    settle(p, w);
    p.inputX = 1;
    for (let t = 1; t <= 19; t++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(3.724, 9);           // 0.196×19（纯线性段,3.724<3.75）
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(3.92, 9);            // 3.724<3.75 末次 branch1 步进
    // 超帽回落摩擦带（原版整链无硬钳）：vx 锯齿带 [3.75−0.2, 3.75+0.196],不发散
    let min = Infinity; let max = -Infinity;
    for (let t = 0; t < 40; t++) {
      p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
      min = Math.min(min, p.vx); max = Math.max(max, p.vx);
    }
    expect(min).toBeGreaterThanOrEqual(3.75 - 0.2 - 0.01);
    expect(max).toBeLessThanOrEqual(3.75 + 0.196 + 1e-9);
  });
});

// ============================================================================
// 2 「连续放置不被自身减速拖慢」= 涌现语义锁定（放置窗 vx 轨迹逐位等价）
//    原版 HorizontalMovement 整链（Player.cs:19887-20240）不读 itemAnimation
//    ——放置期间不削加速、不削减速、不加下限；本仓同（animBusy 仅锁朝向）。
// ============================================================================
describe('FX58 连续放置×冰面：放置窗 vx 轨迹与空手逐位相等', () => {
  const runTrace = (placing: boolean, heldDirt: boolean): number[] => {
    const w = mkIceWorld();
    const p = mkSkater(w);
    if (heldDirt) p.inv.add(_iid(2), 999);   // 空背包首格 = 热键 0 持握位
    settle(p, w);
    p.inputX = 1;
    const trace: number[] = [];
    for (let t = 0; t < 40; t++) {
      if (placing) { p.itemAnimTicks = 16; p.useTime = 16; }   // 连续放置窗常开
      p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
      trace.push(p.vx);
    }
    return trace;
  };

  it('放置窗（itemAnimation>0 每拍刷新）vs 空手：40 拍 vx 逐位相等', () => {
    const a = runTrace(false, true);
    const b = runTrace(true, true);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 12);
    // 且两条轨迹都吃满冰鞋牵引（末段处于 3.75 带内）
    expect(a[39]).toBeGreaterThan(3.5);
  });

  it('手持泥土块（useTime=10 数据面）不构成任何移速耦合', () => {
    const a = runTrace(false, false);
    const b = runTrace(false, true);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 12);
  });
});

// ============================================================================
// 3 反向锁定：冰鞋滑行衰减 = runSlowdown 0.2/t 全额、【无正数下限】
//    （原版冰鞋无滚轴鞋式巡航挡——补非原版地板 = 反模式；无冰刀才 ×0.1 滑行）
// ============================================================================
describe('FX58 反向锁定：冰面滑行衰减 0.2/t（有冰刀）/ 0.02/t（无冰刀），零下限', () => {
  it('有冰刀：vx=3 松键 → 2.8/2.6/… 恰 0.2/t 至 0（15 拍归零,无地板）', () => {
    const w = mkIceWorld();
    const p = mkSkater(w);
    settle(p, w);
    p.vx = 3;
    p.inputX = 0;
    for (let t = 1; t <= 14; t++) {
      p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
      expect(p.vx).toBeCloseTo(3 - 0.2 * t, 9);
    }
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBe(0);                          // 穿过一切正数「下限」归零
  });

  it('无冰刀：slowdown×0.1（:26770）→ vx=3 松键 2.98（打滑语义,冰鞋的存在意义）', () => {
    const w = mkIceWorld();
    const p = new Player(20 * 16, 27 * 16, new Inventory());   // 裸装
    settle(p, w);
    p.vx = 3;
    p.inputX = 0;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(2.98, 9);
  });
});

// ============================================================================
// 4 命名撞车存证：配饰「溜冰鞋」官方 tooltip 无任何「放置速度」措辞；
//   「滑行速度与放置速度相匹配」专属滚轴鞋坐骑物品（sw-bj59 已测,此处只存证
//   误 attribution 的 l10n 根源——重命名/改 tooltip 时须同步本判例）。
// ============================================================================
describe('FX58 命名撞车存证（l10n 三源）', () => {
  it('配饰 950「溜冰鞋」tooltip 不含放置速度措辞；滚轴鞋 5640 才是「滑行速度与放置速度相匹配」', () => {
    const zh = JSON.parse(fs.readFileSync(path.resolve('public/l10n/zh-Hans.json'), 'utf8'));
    expect(zh.ItemName.IceSkates).toBe('溜冰鞋');
    expect(zh.ItemTooltip.IceSkates).not.toContain('放置');
    expect(zh.ItemTooltip.RollerSkatesGreenMountItem).toBe('滑行速度与放置速度相匹配');
  });
});
