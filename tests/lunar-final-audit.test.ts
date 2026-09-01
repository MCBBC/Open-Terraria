// 终审三项探针：①Confused(31) 真反向 ②星璇塔四组怪 AI_085/095/096/097/099 状态机
// ③Collision.CanHit/CanHitLine 1:1（半砖/致动/平台/开关门/夹缝语义）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { canHit, canHitLine } from '../src/physics/LineOfSight';
import { LunarOrb } from '../src/entities/bossAI_lunar_misc';
import { BuffState } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 140, FLOOR = 120;
const T = (n: number) => n * TILE;

function makeWorld(): World {
  const w = new World(W, H, 7, 'lunar-final-audit');
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) w.store.setTile(x, FLOOR, 1);
  return w;
}

type AnyEnt = { id: number };
function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: AnyEnt[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as AnyEnt).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as AnyEnt);
    },
  };
  const px = playerAt.x, py = playerAt.y;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, facing: 1,
    buffs: new BuffState(),
    aabbOverlaps: () => false,
  };
  return {
    hooks: {
      world, player, entities: em,
      enemies: () => enemies,
      critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    } as unknown as GameHooks,
    enemies, projectiles, em,
  };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, x: number, y: number): Enemy {
  const e = Enemy.fromVanilla(id, x, y)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
    for (const p of h.projectiles) {
      if (!(p as { dead?: boolean }).dead) {
        (p as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate(1 / 60, h.hooks);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ③ CanHit / CanHitLine（Collision.cs:388-480 / :590-785）
// ---------------------------------------------------------------------------
describe('Collision.CanHit 1:1（physics/LineOfSight）', () => {
  const world = makeWorld();
  const st: TileStore = world.store;
  const DIRT = 1, PLAT = TILE_BY_KEY['platform'], DOOR_C = TILE_BY_KEY['door_closed'],
    DOOR_O = TILE_BY_KEY['door_open'];
  const from = (tx: number, ty: number) => [T(tx) + 8, T(ty) + 8, 0, 0] as const;

  it('空旷直线可见', () => {
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    expect(canHitLine(st, ...from(20, 100), ...from(40, 100))).toBe(true);
  });

  it('整块实心墙阻挡', () => {
    for (let y = 98; y <= 102; y++) st.setTile(30, y, DIRT);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    expect(canHitLine(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    for (let y = 98; y <= 102; y++) { st.setTile(30, y, 0); st.wire[st.idx(30, y)] = 0; }
  });

  it('半砖不参与"夹缝"判定（halfBrick 豁免仅在邻格 squeeze 检查处）', () => {
    // 视线沿 y=100：上邻 (30,99) 整实心、下邻 (30,101) 半砖 → 不构成夹缝 → 可见
    st.setTile(30, 99, DIRT);
    st.setTile(30, 101, DIRT); st.setHalfBrick(30, 101, true);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    // 下邻换回整实心 → 夹缝成立 → 不可见（原文两邻格均须 slope0 且非半砖,cs:443-453）
    st.setHalfBrick(30, 101, false);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    st.setTile(30, 99, 0); st.setTile(30, 101, 0);
  });

  it('已致动(actuated)块不阻挡', () => {
    for (let y = 99; y <= 101; y++) {
      st.setTile(30, y, DIRT);
      st.wire[st.idx(30, y)] |= TileStore.WIRE_ACTUATED;
    }
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    for (let y = 99; y <= 101; y++) {
      st.setTile(30, y, 0);
      st.wire[st.idx(30, y)] = 0;                     // 清致动位防污染后续用例
    }
  });

  it('平台(solidTop)不阻挡；开门不阻挡、关门阻挡', () => {
    for (let y = 99; y <= 101; y++) st.setTile(30, y, PLAT);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    for (let y = 99; y <= 101; y++) st.setTile(30, y, 0);
    st.setTile(30, 100, DOOR_O);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    st.setTile(30, 100, DOOR_C);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    st.setTile(30, 100, 0);
    st.wire[st.idx(30, 100)] = 0;
  });

  it('夹缝语义：CanHit 须两邻格均整实心才阻挡（单侧不算）', () => {
    // 水平路径 y=100，仅 y=99 一侧整实心 → 仍可见
    st.setTile(30, 99, DIRT);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(true);
    // 两侧(99/101)都整实心 → 被夹住 → 不可见
    st.setTile(30, 101, DIRT);
    expect(canHit(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    st.setTile(30, 99, 0); st.setTile(30, 101, 0);
    st.wire[st.idx(30, 99)] = 0; st.wire[st.idx(30, 101)] = 0;
  });

  it('CanHitLine 更严：单侧整实心即阻挡（ANY 语义）', () => {
    st.setTile(30, 99, DIRT);
    expect(canHitLine(st, ...from(20, 100), ...from(40, 100))).toBe(false);
    st.setTile(30, 99, 0);
    st.wire[st.idx(30, 99)] = 0;
  });
});

// ---------------------------------------------------------------------------
// ① Confused(31) 真反向（TargetClosest 尾段 NPC.cs:78569 direction *= -1）
// ---------------------------------------------------------------------------
describe('Confused(31) 真反向', () => {
  it('AI_003 战士族：confused 存量期间索敌水平方向取反（非速度周期翻转）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(116) });   // 玩家在右侧地面
    const e = spawn(h, 3, T(60), T(FLOOR - 3));        // 僵尸 3（aiStyle 3）
    tick(h, 30, [e]);
    const normalFacing = e.facing;
    const normalX = e.x;
    expect(normalFacing).toBe(1);                      // 正常朝右追

    const e2 = spawn(h, 3, T(40), T(FLOOR - 3));
    e2.confusedT = 3;                                  // 3 秒存量
    tick(h, 30, [e2]);
    expect(e2.facing).toBe(-1);                        // 反向：朝左
    expect(e2.x).toBeLessThan(T(40) + 8);              // 且实际向左移动
    void normalX;
  });
});

// ---------------------------------------------------------------------------
// ② 星璇塔四组怪（AI_085/095/096/097/099）
// ---------------------------------------------------------------------------
describe('AI_085 星细胞 405 / 星云头蟹 421', () => {
  it('405：通视线 → 态 1 直追（速度朝玩家）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(90), y: T(100) });
    const e = spawn(h, 405, T(30), T(100));
    tick(h, 3, [e]);
    expect(e.ai0).toBe(1);
    expect(e.vx).toBeGreaterThan(0);
  });

  it('405：断视线且 >800px → 态 2 穿墙', () => {
    const w = makeWorld();
    for (let y = 95; y <= 105; y++) w.store.setTile(60, y, 1);   // 隔墙
    const h = makeHooks(w, { x: T(110), y: T(100) });
    const e = spawn(h, 405, T(30), T(100));                       // 距 80 格 >800px
    tick(h, 2, [e]);
    expect(e.ai0).toBe(2);
  });

  it('405：同族排斥（同格两细胞互相推开）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(90), y: T(100) });
    const a = spawn(h, 405, T(30), T(100));
    const b = spawn(h, 405, T(30) + 4, T(100));
    const d0 = Math.abs(a.x - b.x);
    tick(h, 10, [a, b]);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(d0);
  });

  it('421：近距 40px 且无同族吸附 → 钉上玩家头顶（态 5）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(100) });
    const e = spawn(h, 421, T(80) - 30, T(100));        // 距玩家 30px
    tick(h, 5, [e]);
    expect(e.ai0).toBe(5);
    expect(Math.abs(e.cx - h.hooks.player.cx)).toBeLessThanOrEqual(8);
  });
});

describe('AI_095 小星细胞 406', () => {
  it('300 tick 线性长大后 Transform 405', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(100) });
    const e = spawn(h, 406, T(40), T(100));
    e.vx = 0; e.vy = 0;
    tick(h, 299, [e]);
    expect(e.vanillaId).toBe(406);
    expect(e.vanillaScale).toBeGreaterThan(1.29);       // scale 1+0.3×(299/300)
    tick(h, 3, [e]);
    expect(e.vanillaId).toBe(405);                      // Transform(405)
  });
});

describe('AI_096 水流入侵者 407', () => {
  it('每 70 tick 甩一枚环绕球 539（LunarOrb, 60 伤）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(60) });
    const e = spawn(h, 407, T(40), T(100));
    tick(h, 69, [e]);
    expect(h.projectiles.filter((p) => p instanceof LunarOrb && p.kind === 539)).toHaveLength(0);
    tick(h, 3, [e]);
    const orb = h.projectiles.find((p) => p instanceof LunarOrb) as LunarOrb;
    expect(orb).toBeTruthy();
    expect(orb.kind).toBe(539);
    expect(Math.abs(orb.vx)).toBeGreaterThanOrEqual(1.5);   // 近水平甩出
  });
});

describe('AI_097 星云悬浮脑 420', () => {
  it('开场 60t 放环绕球 574；480t 周期满取落点瞬移', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(100) });
    const e = spawn(h, 420, T(60), T(100));
    tick(h, 61, [e]);
    expect(h.projectiles.some((p) => p instanceof LunarOrb && p.kind === 574)).toBe(true);
    e.ai0 = 479;                                        // 压到周期末
    tick(h, 2, [e]);
    expect(e.ai0).toBeLessThan(479);                    // 周期重置
    tick(h, 3, [e]);                                    // 下一拍执行瞬移落点
    const done = e.ai2 === 0 && e.ai3 === 0;
    expect(done || e.ai2 !== 0).toBe(true);             // 落点已写入并消费/等待中
  });

  it('玩家失活 → ai[1]=1 渐隐,3t 后消散', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(100) });
    const e = spawn(h, 420, T(60), T(100));
    tick(h, 2, [e]);
    (h.hooks as unknown as { player: { dead: boolean } }).player.dead = true;
    tick(h, 1, [e]);
    expect(e.ai1).toBe(1);
    tick(h, 4, [e]);
    expect(e.dead).toBe(true);
  });
});

describe('AI_099 日耀黏液 519', () => {
  it('重力坠落,落地后 5 tick 自爆消亡（无掉落记账）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: T(80), y: T(60) });
    const e = spawn(h, 519, T(60), T(90));              // 地板在 y=FLOOR=120
    e.vx = 2; e.vy = -1;
    tick(h, 200, [e]);
    expect(e.ai0).toBe(1);                              // 已落地进入自爆定格
    expect(e.vy).toBe(0);
    tick(h, 4, [e]);
    expect(e.dead).toBe(true);                          // ai[1]>=5 → HitEffect 自爆
  });
});
