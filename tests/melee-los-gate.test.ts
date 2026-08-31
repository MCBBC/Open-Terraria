// 近战挥击视线门回归（2026-08-30 用户报"隔着一格方块能打到怪"）：
// 原版 ProcessHitAgainstNPC（1457 Player.cs:44641 / 1456 :43619）在命中盒相交后
// 还要过 `noTileCollide || CanHit(nPC)`——Player.CanHit(Entity)（1457 :42858 /
// 1456 :41886）四射线任一通过才算见着。此前 updateSwingHits 漏接此门 → 隔实心
// 块照样命中，与原版不符。本测试钉住 playerCanHitEntity 的几何语义：
//  · 实体 tile（整块实心）挡得住；半砖/坡面/平台（tileSolidTop）不挡；
//  · 背景【墙壁】从来不在判定里（store 无墙输入），只看 tile。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { canHit, canHitLine, playerCanHitEntity, losRayAnchors } from '../src/physics/LineOfSight';

const STONE = TILE_BY_KEY['stone'];
const PLATFORM = TILE_BY_KEY['platform'];

/** 盒：px 坐标（原版 16px 一格）。cx/cy/facing 走 LOSBox 可选面 */
function box(cxPx: number, cyPx: number, w: number, h: number) {
  return { x: cxPx - w / 2, y: cyPx - h / 2, w, h };
}

/** 场景骨架：P|W|E 三列并排——玩家中心 (30.5 格)，目标中心 (32.5 格)，
 *  中间 x=31 列为被试障碍。玩家 20×42 / 目标 18×40（近似原版身材）。 */
function makeScene(fillWall: (st: TileStore) => void) {
  const world = new World(64, 64, 42, '测试');
  fillWall(world.store);
  const pcy = 16 * 16 + 8;
  const player = { ...box(30.5 * 16, pcy, 20, 42), cx: 30.5 * 16, cy: pcy, facing: 1 };
  const enemy = box(32.5 * 16, pcy, 18, 40);
  return { store: world.store, player, enemy, pcy };
}

describe('近战视线门 playerCanHitEntity（Player.CanHit 四射线链）', () => {
  it('开阔地:CanHit 整盒直判过,可命中', () => {
    const { store, player, enemy } = makeScene(() => {});
    expect(canHit(store, player.x, player.y, player.w, player.h,
      enemy.x, enemy.y, enemy.w, enemy.h)).toBe(true);
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });

  it('隔一整块实心石壁:A 盒射线/三手位射线全被挡 → 不可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, STONE);
    });
    // ★治理批 B5：三手位射线的端点改走 losRayAnchors 单源（Player.CanHit(Entity)
    // Player.cs:42858-42862 的 B/C/D 射线公式——手位 gravDir*(−h)/3f 浮点链、
    // 目标 ±height/3 int÷ 截断、Center f32 物化），淘汰本测试曾自建的浮点 h/3
    // 对照面（自建式属"半精度镜像",与实体侧 int÷ 口径存在分叉窗——单源后随
    // 侧别实现同步演进）。A 盒射线保持 canHit 直判不变。
    const a = losRayAnchors(player, enemy);
    expect(canHitLine(store, a.hx, a.hyBC, 0, 0, a.exTop, a.eyTop, 0, 0)).toBe(false);   // B: 手位→上锚
    expect(canHitLine(store, a.hx, a.hyBC, 0, 0, a.exMid, a.eyMid, 0, 0)).toBe(false);   // C: 手位→本体
    expect(canHitLine(store, a.hx, a.hyD, 0, 0, a.exBot, a.eyBot, 0, 0)).toBe(false);    // D: y=0 手位→下锚
    expect(playerCanHitEntity(store, player, enemy)).toBe(false);
  });

  it('中间换平台:tileSolidTop 不阻挡视线 → 可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, PLATFORM);
    });
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });

  it('致动石壁(inActive):不阻挡 → 可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) {
        st.setTile(31, ty, STONE);
        const i = st.idx(31, ty);
        st.wire[i] |= TileStore.WIRE_ACTUATED;   // inActive（fullSolid 排除致动格）
      }
    });
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });
});

// ============================================================
// ★F1 蓝队翻案回归（2026-08-30）：ProcessHitAgainstNPC 双支窄门
//  Player.cs:44617-44625 `if (nPC.dontTakeDamage || !CanNPCBeHitByPlayerOr-
//  PlayerProjectile(nPC)) { 仅水母族反噬 } else { 普通命中管线 }`——非水母的
//  dontTakeDamage 靶【彻底无事】：不烧计时暴击（TryConsumingTimerCrit :44657
//  只在 else 支）、不掷暴击、不进 swingHitSet/蓄能/hurt。
// ============================================================
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE } from '../src/core/constants';

/** 原版 vid → 本仓内部 item id（未注册即抛错，防静默假绿） */
const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateSwingHits 最小驱动桩（同 weapon-melee-leftover.test.ts 口径） */
function swingStub(heldVid: number) {
  const world = new World(120, 120, 30, 'los-f1');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iid(heldVid), 1);
  g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: iid(heldVid), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  const enemies: Enemy[] = [];
  // 任务⑤起近战命中可能生成弹幕（火之大剑 978 星坠）——add 支持与 projectiles 桶
  const projectiles: unknown[] = [];
  g.entities = {
    critters: [], npcs: [], enemies,
    add: (ent: unknown, bucket: string) => { if (bucket === 'projectiles') projectiles.push(ent); return ent; },
  };
  g.projectiles = projectiles;
  g.player = player;
  g.world = world;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  g.dropContext = () => undefined;
  g.onEnemyKilled = () => {};
  return { g, player, world, enemies };
}

describe('★F1 donT 非水母靶不进命中管线（双支窄门 ProcessHitAgainstNPC :44617-44625）', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('dontTakeDamage 靶：不 hurt / 不烧计时暴击（charge 保持满）/ 不占 swingHitSet', () => {
    const { g, player, enemies } = swingStub(3106);
    // 普通敌怪手动置 dontTakeDamage=true（动态面,golem 缩头/deerclops 潜地同型）
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    e.dontTakeDamage = true;
    e.id = 9920;
    enemies.push(e);
    const hits: number[] = [];
    e.hurt = (() => { hits.push(1); return false; }) as typeof e.hurt;
    // equipStats 为冻结记忆化 getter（无 setter）→ defineProperty 自有数据属性
    // 遮蔽原型 accessor 注入测试旗（不改写冻结对象本身）
    Object.defineProperty(player, 'equipStats',
      { value: Object.freeze({ ...player.equipStats, accTimerCrit: true }), configurable: true });
    player.accTimerCritCharge = 1000;                  // 满蓄
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(hits).toHaveLength(0);                      // 原版彻底无事
    expect(player.accTimerCritCharge).toBe(1000);      // tryConsumingTimerCrit 未被消费
    expect((g.swingHitSet as Set<number>).has(e.id)).toBe(false);
  });

  it('对照组同靶无 donT：照常命中并消费计时暴击（1000 → -15）', () => {
    const { g, player, enemies } = swingStub(3106);
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    enemies.push(e);
    const hits: number[] = [];
    const orig = e.hurt.bind(e);
    e.hurt = ((d: number, kx: number, ky: number, ga: unknown, pen: number, crit: boolean,
      pierce: number, fp: boolean) => { hits.push(d); return orig(d, kx, ky, ga as never, pen, crit, pierce, fp); }
    ) as typeof e.hurt;
    Object.defineProperty(player, 'equipStats',
      { value: Object.freeze({ ...player.equipStats, accTimerCrit: true }), configurable: true });
    player.accTimerCritCharge = 1000;
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(hits.length).toBe(1);
    expect(player.accTimerCritCharge).toBe(-15);       // 消费（Player.cs:28568-28571）
  });

  it('水母充能反噬仍可达（63∈ZAPPING_JELLYFISH）：damagePlayer + 冷却面写入、不进普通管线', () => {
    const { g, player, enemies } = swingStub(3106);
    const j = Enemy.fromVanilla(63, player.cx + 8, player.y)!;
    j.dontTakeDamage = true;                           // AI_018 专家潜伏态
    j.id = 9910;                                       // fromVanilla 不发 id → 桩须手工补
    enemies.push(j);
    let hurts = 0;
    j.hurt = (() => { hurts++; return false; }) as typeof j.hurt;
    const dmgCalls: Array<[number, number, number]> = [];
    g.damagePlayer = (dmg: number, sx: number, sy: number) => { dmgCalls.push([dmg, sx, sy]); return dmg; };
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(hurts).toBe(0);                             // 反噬≠普通命中
    expect(dmgCalls.length).toBe(1);
    expect(dmgCalls[0][0]).toBe(
      Math.max(1, Math.trunc(((j.def as unknown as { damage?: number }).damage ?? 0) * 1.3))); // TakeDamageFromJellyfish def.damage×1.3（Player.cs:44609）
    expect((g.meleeNpcCd as Map<number, number>).get(j.id)).toBeGreaterThan(0);
    expect(g.meleeAttackCd).toBe(Math.max(1, Math.trunc(30 * 0.33)));
  });
});

// ============================================================
// ★J2 Volcano(type121 火之大剑)爆炸窗口回归——_spawnVolcanoExplosion：
//  置位 = ItemAnimationJustStarted && type==121（Player.cs:43809-43812）；
//  窗口期 flag=纯探针支（:44639 `flag = !_spawnVolcanoExplosion ? (flag|flag2)
//  : flag2`）→ 盒相交一律拒收；首个受理命中消费窗口（Volcano_TrySpawningVolcano
//  :44498-44506，消费门 HittableForOnHitRewards NPC.cs:91152 !(Critter||immortal)），
//  其后恢复并集。探针几何经 vi.mock 注入以获得确定性场景。
// ============================================================
const mockState = { override: null as null | ((a: { x: number; y: number }, b: { x: number; y: number }, rot: number, facing: number, scale: number) => [{ x: number; y: number }, { x: number; y: number }]) };

vi.mock('../src/player/SwingPathMath', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/player/SwingPathMath')>();
  return { ...orig,
    starfurySwingProbes: (
      loc: { x: number; y: number }, rot: number, facing: number, scale: number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): [{ x: number; y: number }, { x: number; y: number }] =>
      (mockState.override ? mockState.override(loc, loc, rot, facing, scale)
        : orig.starfurySwingProbes(loc, rot, facing, scale)) };
});

describe('★J2 Volcano 窗口：盒交拒收→探针受理消费→并集恢复', () => {
  afterEach(() => { vi.restoreAllMocks(); mockState.override = null; });

  it('窗口期整挥零伤：目标落在判定盒内但全程距探针>16px → 不受理、窗口保持', () => {
    mockState.override = () => [{ x: -99999, y: -99999 }, { x: -95000, y: -99999 }];
    const { g, player, enemies } = swingStub(121);
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;   // 与挥击盒重叠
    enemies.push(e);
    let hurts = 0;
    e.hurt = (() => { hurts++; return false; }) as typeof e.hurt;
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(hurts).toBe(0);                            // 窗口期盒交不计(:44639)
    expect((g.swing as Record<string, unknown>).volcanoWindow).toBe(true);
  });

  it('首个受理命中（纯探针支）消费窗口 → 同帧余敌恢复并集判', () => {
    const { g, player, enemies } = swingStub(121);
    const acceptor = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    // 同足迹第二只：窗口未清时仅探针支可受理；A 消费后 B 走盒支恢复受理。
    // fromVanilla 不发 Entity.id（EntityManager.add 才发）→ 手工发号防 swingHitSet 去重互踩
    const boxOnly = Enemy.fromVanilla(1, acceptor.x, acceptor.y)!;
    acceptor.id = 9901; boxOnly.id = 9902;
    mockState.override =
      () => [{ x: acceptor.cx, y: acceptor.cy }, { x: acceptor.cx, y: acceptor.cy }];
    enemies.push(acceptor, boxOnly);
    const order: string[] = [];
    for (const t of [acceptor, boxOnly]) {
      (t as unknown as { __tag?: string }).__tag = t === acceptor ? 'A' : 'B';
      t.hurt = function (this: never, ..._args: unknown[]) {
        order.push((this as unknown as { __tag?: string }).__tag ?? '?');
        return false;
      } as typeof t.hurt;
    }
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    // ★任务② 对齐修正：A 受理后 ：44784 ApplyAttackCooldown() 写 attackCD=max(1,
    // trunc(max×0.33)) ⇒ 同帧循环内 B 被 :44598 `attackCD<=0` 门拒收（原版攻击CD
    // 是全 Main.npc 桶共享的命中节流面——此前 ['A','B'] 同帧双中预期系旧版近似）
    expect(order).toEqual(['A']);
    expect((g.swing as Record<string, unknown>).volcanoWindow).toBe(false);
    // 冷却窗期满的后续拍：并集态下 B 走盒支恢复受理
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();   // 衰减一帧
    (g as unknown as Record<string, unknown>).meleeAttackCd = 0;           // 剩余窗跳表（等价cd 到期）
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(order).toEqual(['A', 'B']);
  });

  it('对照：非 121 武器不受窗口影响（探针远场仍走盒|探针并集）', () => {
    mockState.override = () => [{ x: -99999, y: -99999 }, { x: -95000, y: -99999 }];
    const { g, player, enemies } = swingStub(3013);   // 臭臭爪 melee 非 121
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    enemies.push(e);
    let hurts = 0;
    e.hurt = (() => { hurts++; return false; }) as typeof e.hurt;
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(hurts).toBe(1);
    expect((g.swing as Record<string, unknown>).volcanoWindow).toBe(false);
  });
});
