// 传送带实体输送 1:1（Collision.StepConveyorBelt, Collision.cs:4215-4351；
// 掉落物 ApplyConveyorBeltMovementToVelocity, Collision.cs:3936-4211）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  stepConveyor, conveyorCarriesEnemy, CONVEYOR_SPEED, CONVEYOR_ITEM_MAX,
} from '../src/physics/Conveyor';

// tile 421 = Conveyor Belt (Clockwise)，素材键 ...conveyorbeltleft
// 推运方向 = +ConveyorDirection（TileID.cs:261）：421 向 +X（右）、422 向 -X（左）
const BELT_421 = TILE_BY_KEY['v_421_conveyorbeltleft']!;
const BELT_422 = TILE_BY_KEY['v_422_conveyor_belt_ccw']!;
const STONE = TILE_BY_KEY['stone']!;
const PLATFORM = TILE_BY_KEY['platform']!;

const ROW = 20;                 // 带所在行，顶面 y = 320
const SURFACE = ROW * 16;

function body(x: number, y: number, w = 20, h = 42, vx = 0) {
  return { x, y, w, h, vx, vy: 0 };
}

/** 在 ROW 行铺 cols 范围的带 */
function layBelt(st: TileStore, c0: number, c1: number, type: number) {
  for (let c = c0; c <= c1; c++) st.setTileSilent(c, ROW, type);
}

describe('传送带实体输送（StepConveyorBelt 1:1）', () => {
  it('421（Clockwise）：站立每 tick 向 +X 平移 2.5px，vy/位置吸附不变', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_421);
    const b = body(10 * 16, SURFACE - 42);
    expect(stepConveyor(b, w.store)).toBe(true);
    expect(b.x).toBeCloseTo(10 * 16 + CONVEYOR_SPEED);   // :4333 的 2.5f
    expect(b.y).toBe(SURFACE - 42);                       // 平带下压贴合无位移(:4337-4141)
    for (let i = 1; i < 10; i++) expect(stepConveyor(b, w.store)).toBe(true);
    expect(b.x).toBeCloseTo(10 * 16 + 10 * CONVEYOR_SPEED); // 恒速 2.5/tick
  });

  it('422（Counter Clockwise）：向 -X 平移 2.5px', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_422);
    const b = body(15 * 16, SURFACE - 42);
    expect(stepConveyor(b, w.store)).toBe(true);
    expect(b.x).toBeCloseTo(15 * 16 - CONVEYOR_SPEED);
  });

  it('非带上（石地/平台/悬空）不动且返回 false', () => {
    const w = new World(60, 40, 42);
    for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, ROW, STONE);
    const onStone = body(10 * 16, SURFACE - 42);
    expect(stepConveyor(onStone, w.store)).toBe(false);
    expect(onStone.x).toBe(10 * 16);

    const w2 = new World(60, 40, 42);
    for (let c = 10; c <= 19; c++) w2.store.setTileSilent(c, ROW, PLATFORM);
    const onPlat = body(10 * 16, SURFACE - 42);
    expect(stepConveyor(onPlat, w2.store)).toBe(false);
    expect(onPlat.x).toBe(10 * 16);

    const w3 = new World(60, 40, 42);
    layBelt(w3.store, 10, 19, BELT_421);
    const air = body(10 * 16, SURFACE - 42 - 4); // 悬空 4px：未接触带面
    expect(stepConveyor(air, w3.store)).toBe(false);
    expect(air.x).toBe(10 * 16);
  });

  it('掉落物：vx 按 0.1/tick 逼近档位目标，钳 2.5 不超限（WorldItem 路径）', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_421);
    const item = body(12 * 16, SURFACE - 12, 12, 12); // 12px 全在带内 → 档位 2.5(:4068)
    expect(stepConveyor(item, w.store, 1, true)).toBe(true);
    expect(item.vx).toBeCloseTo(0.25);                 // 2.5×6/60(:4131)
    expect(item.x).toBe(12 * 16);                      // item 模式只改 vx 不位移
    for (let i = 0; i < 200; i++) {
      stepConveyor(item, w.store, 1, true);
      expect(item.vx).toBeLessThanOrEqual(CONVEYOR_ITEM_MAX + 1e-9);
    }
    expect(item.vx).toBeCloseTo(CONVEYOR_ITEM_MAX, 5); // 收敛到上限
  });

  it('换向（Wiring.cs:1020-1027 翻 421↔422）后方向反转', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_421);
    const b = body(14 * 16, SURFACE - 42);
    stepConveyor(b, w.store);
    expect(b.x).toBeCloseTo(14 * 16 + CONVEYOR_SPEED);
    // devices.ts case 421 的同款翻转：type 互换、帧保留
    for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, ROW, BELT_422);
    stepConveyor(b, w.store);
    expect(b.x).toBeCloseTo(14 * 16);                  // +2.5 后 -2.5 回原位
  });

  it('上限/抵消：跨 421|422 边界双向抵消不动；实体自带 vx 不放大步长', () => {
    const w = new World(60, 40, 42);
    w.store.setTileSilent(12, ROW, BELT_421);
    w.store.setTileSilent(13, ROW, BELT_422);
    const straddle = body(12 * 16 + 8, SURFACE - 42);  // 骑在边界上
    expect(stepConveyor(straddle, w.store)).toBe(true); // 在带上（flag）
    expect(straddle.x).toBe(12 * 16 + 8);              // num=0 → 不动(:4330 num!=0 门)

    const w2 = new World(60, 40, 42);
    layBelt(w2.store, 10, 19, BELT_421);
    const fast = body(10 * 16, SURFACE - 42, 20, 42, 10); // 自带 vx=10
    stepConveyor(fast, w2.store);
    expect(fast.x).toBeCloseTo(10 * 16 + CONVEYOR_SPEED); // 步进恒 2.5，与 vx 无关
    expect(fast.vx).toBe(10);                             // 原版不改 velocity
  });

  it('致动（inActive）的带不搬运（:4249-4252 nactive 门）', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_421);
    for (let c = 10; c <= 19; c++) w.store.wire[w.store.idx(c, ROW)] |= TileStore.WIRE_ACTUATED;
    const b = body(11 * 16, SURFACE - 42);
    expect(stepConveyor(b, w.store)).toBe(false);
    expect(b.x).toBe(11 * 16);
  });

  it('半砖带：顶面 +8 仍接触并平移', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 19, BELT_421);
    const i = w.store.idx(12, ROW);
    w.store.half[i] = 1;
    const b = body(12 * 16 - 2, SURFACE + 8 - 42, 20, 42); // 站半砖顶：底 = SURFACE+8
    expect(stepConveyor(b, w.store)).toBe(true);
    expect(b.x).toBeCloseTo(12 * 16 - 2 + CONVEYOR_SPEED);
  });

  it('带推向墙壁：步进被钳制在墙面，不嵌入（:4335 TileCollision 钳制）', () => {
    const w = new World(60, 40, 42);
    layBelt(w.store, 10, 14, BELT_421);
    for (let r = 15; r <= 19; r++) w.store.setTileSilent(15, r, STONE); // 带尽头的墙
    const b = body(15 * 16 - 20 - 2, SURFACE - 42); // 距墙 2px
    expect(stepConveyor(b, w.store)).toBe(true);
    expect(b.x).toBe(15 * 16 - 20);                 // 只吃到 2px，贴墙停住
    expect(b.x + b.w).toBe(15 * 16);
  });

  it('掉落物档位：带缘小重叠走 0.75 低档（:4052-4077）', () => {
    const w = new World(60, 40, 42);
    w.store.setTileSilent(10, ROW, BELT_421); // 单格带
    const item = body(10 * 16 + 13, SURFACE - 12, 12, 12); // 只压带 3px
    stepConveyor(item, w.store, 1, true);
    expect(item.vx).toBeCloseTo(0.75 * 0.1); // 档位 0.75 → 首 tick +0.075
  });

  it('头顶带（up 边扫描 :3923-3928 + num5-- :4295-4298）：带悬于头顶 1 格 → 反向推动', () => {
    // 48px 身高（3 整格）站在石面上：头顶恰在格底 → GetEntityEdgeTiles 的 num2--（:3897-3899）
    // 把 up 行取到头顶带的所在行（18）；带的下沿线（y=304）命中实体盒顶 → num5=-1 → 反向
    const FLOOR = 22, HEAD = 18;             // 石面行顶 y=352；头顶带行 18（底 y=304=盒顶）
    const FLOOR_Y = FLOOR * 16;
    const overHead = (type: number) => {
      const w = new World(60, 40, 42);
      for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, FLOOR, STONE);
      for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, HEAD, type);
      return w;
    };
    // 421（dir=+1）→ num5=-1 取 -dir → 向 -X（:4304）
    const b = body(12 * 16, FLOOR_Y - 48, 20, 48);
    expect(stepConveyor(b, overHead(BELT_421).store)).toBe(true);
    expect(b.x).toBeCloseTo(12 * 16 - CONVEYOR_SPEED);
    expect(b.y).toBe(FLOOR_Y - 48);          // 按压方向不变（:4337-4341 恒向下），石面钳住
    // 422（dir=-1）→ 反向取 +X
    const b2 = body(12 * 16, FLOOR_Y - 48, 20, 48);
    stepConveyor(b2, overHead(BELT_422).store);
    expect(b2.x).toBeCloseTo(12 * 16 + CONVEYOR_SPEED);
  });

  it('头顶带 2 格高（不接触）：无接触不推（下沿线与盒顶距离 > 容差）', () => {
    const FLOOR = 22, TWO_UP = 17;           // 头顶上方第 2 行（底 y=288 < 盒顶 304-0.1）
    const FLOOR_Y = FLOOR * 16;
    const w = new World(60, 40, 42);
    for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, FLOOR, STONE);
    for (let c = 10; c <= 19; c++) w.store.setTileSilent(c, TWO_UP, BELT_421);
    const b = body(12 * 16, FLOOR_Y - 48, 20, 48);
    expect(stepConveyor(b, w.store)).toBe(false);
    expect(b.x).toBe(12 * 16);
    expect(b.y).toBe(FLOOR_Y - 48);
  });

  it('敌怪门（NPC.cs:93780-93787 + NPCID.cs:4789）：普通敌怪不吃带、表内/小动物吃', () => {
    expect(conveyorCarriesEnemy({ vanillaId: 3, vanilla: { critter: false } })).toBe(false); // 僵尸
    expect(conveyorCarriesEnemy({ vanillaId: 1, vanilla: { critter: false } })).toBe(true);  // 表内
    expect(conveyorCarriesEnemy({ vanillaId: 579, vanilla: null })).toBe(true);
    expect(conveyorCarriesEnemy({ vanillaId: null, vanilla: { critter: true } })).toBe(true); // 小动物
  });

  it('敌怪门数值口径（:93781）：375/549 满足 lifeMax==5&&damage==0 但不入 CountsAsCritter，仍吃带', () => {
    expect(conveyorCarriesEnemy({ vanillaId: 375, vanilla: null })).toBe(true);  // TruffleWormDigger
    expect(conveyorCarriesEnemy({ vanillaId: 549, vanilla: null })).toBe(true);  // DD2LanePortal
    expect(conveyorCarriesEnemy({ vanillaId: 46, vanilla: null })).toBe(true);   // Bunny（两口径均真）
    expect(conveyorCarriesEnemy({ vanillaId: 50, vanilla: null })).toBe(false);  // Zombie 变体
  });
});
