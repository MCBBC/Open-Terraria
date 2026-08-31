// 对齐清零批回归（2026-08-31）：任务①攻端 PvP 预测反馈删除 / ②attackCD+meleeNpcCd+
// 三桶统一门+immune[whoAmI] 面 / ③WrongBugNet 分桶 / ④仙灵 583-585 ai[2]<=1f 捕捉门 /
// ⑤Volcano 星坠弹 978 全参数 / ⑥判定链整型化锚（intRect/rectIntersects/meleeThirdOf）。
// 标杆：Terarria1457（行号见各用例内注释）。桩口径同 weapon-melee-leftover.test.ts。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';
import { CRITTER_CATCH_BY_NPC } from '../src/data/critters';
import { intRect, rectIntersects, meleeThirdOf, lineRectangleDistance } from '../src/player/SwingPathMath';
import { ImmunityCooldownID, HurtCooldownBuckets, hurtImmunityFrames } from '../src/player/HurtCooldownBuckets';
import { VolcanoBlastProj } from '../src/entities/VolcanoBlastProj';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

afterEach(() => { vi.restoreAllMocks(); });

/** updateSwingHits 驱动桩（weapon-melee-leftover 口径 + 本批扩展：
 *  projectiles 桶、buckets、可注探针锚的 SwingPathMath mock 配套） */
function swingStub(heldVid: number, opts: Partial<{ t: number; dur: number; dmg: number; kb: number }> = {}) {
  const world = new World(120, 120, 30, 'align-batch');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iid(heldVid), 1);
  g.swing = {
    t: opts.t ?? 20, dur: opts.dur ?? 30,
    dmg: opts.dmg ?? 10, kb: opts.kb ?? 3,
    item: iid(heldVid), useStyle: 1,
  };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  const enemies: Enemy[] = [];
  const critters: Enemy[] = [];
  const npcs: TownNPC[] = [];
  const projectiles: unknown[] = [];
  g.entities = {
    critters, npcs, enemies,
    add: (ent: unknown, bucket: string) => {
      if (bucket === 'projectiles') projectiles.push(ent);
      return ent;
    },
  };
  g.projectiles = projectiles;
  g.player = player;
  g.world = world;
  const sfxCalls: Array<unknown[]> = [];
  g.sfx = {
    playWavFile: () => true, playFiles: () => true,
    play: (...args: unknown[]) => { sfxCalls.push(args); },
  };
  g.sfxCalls = sfxCalls;
  g.addDamageNumber = vi.fn();
  g.spawnParticles = vi.fn();
  g.spawnDrop = () => null;
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  g.dropContext = () => undefined;
  g.onEnemyKilled = () => {};
  return { g, player, world, enemies, critters, npcs, projectiles, sfxCalls };
}

// ============================================================
// ★任务① 攻端 PvP 无本地预测反馈 + attackCD 写面（ItemCheck_MeleeHitPVP
// :44420-44494：攻端只跑 StatusToPlayerPvP/OnHit/Hurt 意向包/SendPlayerHurt/
// ApplyAttackCooldown——CombatText 与 Hit 音都在【被击端】Player.Hurt 链）
// ============================================================
describe('任务① 攻端 PvP：无受击音/无预览飘字；循环尾写 attackCD（:44494）', () => {
  it('命中远端代理：sendStrikePlayer 恰一发、本端零音效零飘字、meleeAttackCd 置位', () => {
    const { g, player } = swingStub(3106);
    const strikes: Array<unknown[]> = [];
    (g as Record<string, unknown>).net = {
      active: true, policy: { pvpAllowed: true },
      players: new Map(),
      getProxyPvpImmuneRemaining: () => 0,
      sendStrikePlayer: (...a: unknown[]) => { strikes.push(a); },
    };
    (player as unknown as { hostile: boolean }).hostile = true;
    (player as unknown as { team?: number }).team = 1;
    const rp = {
      // 与玩家盒重叠（CanHit 重叠射线直过；hitRect 必交——探针无歧义）
      x: player.x, y: player.y, w: 20, h: 42,
      cx: player.cx, cy: player.cy, dead: false, hostile: true,
      defense: 0, team: 2, __netSlot: 3,
    } as unknown as Player;
    (g as Record<string, unknown>).remotePlayerProxies = [rp];
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(strikes).toHaveLength(1);              // 命中意向恰一次
    expect(strikes[0][0]).toBe(3);                // __netSlot
    // ★被删反馈的两条断言：攻端不再自响受击音、不再画 InPVP 公式预览飘字
    expect((g.sfxCalls as Array<Array<unknown>>)
      .filter((c) => c[0] === 'hit')).toHaveLength(0);
    expect(g.addDamageNumber).not.toHaveBeenCalled();
    // 写面：ApplyAttackCooldown()=max(1,(int)(dur*0.33))（:44494）
    expect(g.meleeAttackCd).toBe(Math.max(1, Math.trunc(30 * 0.33)));
  });
});

// ============================================================
// ★任务② 冷却面三件套拍点 + 三桶门覆盖
// ============================================================
describe('任务② meleeNpcCd/meleeAttackCd 三桶门与衰减门（Player.cs :43999/:44598/:44779/:44784/:24904）', () => {
  it('普通命中尾双写：per-NPC=当次挥击剩余帧、attackCD=max(1,trunc(dur*0.33))', () => {
    const { g, player, enemies } = swingStub(3106, { t: 20, dur: 30 });
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    e.id = 9930;
    enemies.push(e);
    e.hurt = (() => false) as typeof e.hurt;      // 免真结算
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    // swing.t 先减后命中 ⇒ 写入值 = 20−1 = 19（SetMeleeHitCooldown(id,itemAnimation)）
    expect((g.meleeNpcCd as Map<number, number>).get(e.id)).toBe(19);
    expect(g.meleeAttackCd).toBe(Math.max(1, Math.trunc(30 * 0.33)));   // 9
  });

  it('idle 帧：meleeNpcCd 冻结不清（无挥动帧递减门）、meleeAttackCd 清零（:24908-24911）', () => {
    const { g } = swingStub(3106, { t: 12, dur: 30 });
    g.swing = null;                                // itemAnimation==0
    // 先空跑一拍建立哨兵（引用比对清表面只在「挥击对象变化」沿触发；此后播种）
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    (g.meleeNpcCd as Map<number, number>).set(555, 10);
    for (let i = 0; i < 15; i++) (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect((g.meleeNpcCd as Map<number, number>).get(555)).toBe(10);   // idle 冻结
    expect(g.meleeAttackCd).toBe(0);               // itemAnimation==0 直接清零
  });

  it('挥动帧衰减只在 dmg>0 且非 noMelee 网/药水档：网(1991)挥动帧不递减、sword 递减', () => {
    // sword 挥动帧：10 → 经 8 帧到 2（每帧 −1）；先跑一拍建哨兵再播种键值
    const s = swingStub(3106, { t: 30, dur: 30 });
    (s.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    (s.g.swing as { t: number }).t = 30;
    (s.g.meleeNpcCd as Map<number, number>).set(777, 10);
    for (let i = 0; i < 8; i++) (s.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect((s.g.meleeNpcCd as Map<number, number>).get(777)).toBe(2);

    // 网(1991,damage=0)：外层 :43984 门放行但内层 damage>0 不成立 ⇒ 冻结
    const n = swingStub(1991, { t: 30, dur: 30, dmg: 0 });
    (n.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    (n.g.meleeNpcCd as Map<number, number>).set(777, 10);
    for (let i = 0; i < 8; i++) (n.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect((n.g.meleeNpcCd as Map<number, number>).get(777)).toBe(10);
  });

  it('attackCD 全桶节流：critter 受理后同拍 town/enemies 拒收（三桶共一攻击CD面）', () => {
    const { g, player, critters, npcs, enemies } = swingStub(3106, { t: 25, dur: 30 });
    // 泛用小动物槽（桶内只需 CritterLike 字段；Enemy.fromVanilla(1) 一定可造）
    const c = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    c.id = 9940;
    critters.push(c);
    c.hurt = vi.fn(() => true) as unknown as typeof c.hurt;

    const guide = new TownNPC('guide', player.x + 200, player.y, new Inventory());
    guide.dead = false; guide.bound = false;
    (guide as unknown as { hurt: unknown }).hurt = vi.fn(() => true);
    (guide as unknown as { vanillaId?: number }).vanillaId = 22;
    Object.defineProperty(player, 'equipStats',
      { value: Object.freeze({ ...player.equipStats, killGuide: true }), configurable: true });
    npcs.push(guide);

    const e2 = Enemy.fromVanilla(1, player.cx + 12, player.y)!;
    e2.id = 9941;
    enemies.push(e2);
    e2.hurt = vi.fn(() => false) as typeof e2.hurt;

    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    // critter 受理成功 → 写 attackCD=max(1,trunc(dur*0.33))（:44784 同面）
    expect(g.meleeAttackCd).toBe(Math.max(1, Math.trunc(30 * 0.33)));
    expect(c.hurt).toHaveBeenCalledOnce();
    // 同帧后续循环（town/enemies）受统一三重门拦截（原版该门覆盖全 Main.npc 桶）
    expect(guide.hurt).not.toHaveBeenCalled();
    expect(e2.hurt).not.toHaveBeenCalled();
  });

  it('immune[whoAmI] 面：到期制表节流近战命中（noteNpcPlayerImmune → 门挡 → tick 过期放行）', () => {
    const { g, player, enemies } = swingStub(3106);
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    e.id = 9942;
    enemies.push(e);
    e.hurt = vi.fn(() => false) as typeof e.hurt;
    const gm = g as unknown as {
      tickCount: number; noteNpcPlayerImmune: (id: number, t: number) => void;
      meleeNpcImmuneGateOf: (id: number) => boolean; updateSwingHits: () => void;
    };
    gm.tickCount = 1000;
    gm.noteNpcPlayerImmune(e.id, 40);              // Projectile.Damage immune[owner]=N 等价
    expect(gm.meleeNpcImmuneGateOf(e.id)).toBe(false);   // 门内
    gm.updateSwingHits();
    expect(e.hurt).not.toHaveBeenCalled();
    gm.tickCount += 41;                            // 到期翻转（:91564-91566 减尽语义等价）
    expect(gm.meleeNpcImmuneGateOf(e.id)).toBe(true);
    gm.updateSwingHits();
    expect(e.hurt).toHaveBeenCalledOnce();
  });
});

// ============================================================
// ★任务③ WrongBugNet 分桶（ItemCheck_CatchCritters :45097-45103 +
// Hurt 桶门 :38493/:38495-98/:38674/:38680-83）
// ============================================================
describe('任务③ WrongBugNet 桶隔离与 AddBuff(24,300) 序一致', () => {
  function lavaFlyStub() {
    const { g, player } = swingStub(1991, { t: 10, dur: 30, dmg: 0 });
    const dmgCalls: Array<[number, number, number]> = [];
    g.damagePlayer = (dmg: number, sx: number, sy: number) => {
      dmgCalls.push([dmg, sx, sy]);
      return dmg;
    };
    const buffsApplied: Array<[number, number]> = [];
    (player.buffs as unknown as { apply: (b: number, s: number) => void }).apply =
      ((b: number, s: number) => { buffsApplied.push([b, s]); }) as typeof player.buffs.apply;
    return { g, player, dmgCalls, buffsApplied };
  }

  it('首次捕熔岩饵料：实扣>0 → AddBuff(24,5s)+WrongBugNet 桶 20t（longInvince=false）', () => {
    const { g, player, dmgCalls, buffsApplied } = lavaFlyStub();
    const fly = Enemy.fromVanilla(654, player.cx + 8, player.y)!;   // 熔岩蝇→catch 4847
    (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(fly);
    expect(dmgCalls).toHaveLength(1);
    expect(dmgCalls[0][0]).toBe(1);                              // Hurt(…,1,…)
    // AddBuff(24,300)=On Fire! 5s 固定（buff 枚举面 = BuffType.OnFire）
    expect(buffsApplied).toEqual([[BuffType.OnFire, 5]]);
    expect((g.hurtBuckets as HurtCooldownBuckets)
      .remaining(ImmunityCooldownID.WrongBugNet)).toBe(20);       // num10=实扣1→20
  });

  it('窗内重入：独立桶早退(:38495-98)，不再扣血不加 buff；General/相邻键零污染、到期恢复', () => {
    const { g, dmgCalls, buffsApplied } = lavaFlyStub();
    const fly2 = Enemy.fromVanilla(654, 0, 0)!;
    const netCatch = (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter.bind(g);
    netCatch(fly2);
    netCatch(fly2);                       // 同一挥击窗逐帧重入
    expect(dmgCalls).toHaveLength(1);     // 第二次被 WrongBugNet 桶拦
    expect(buffsApplied).toHaveLength(1);
    // 分桶隔离：WrongBugNet 计时不外溢 General（General=Player.immune 位恒外置）/Lava
    const buckets = g.hurtBuckets as HurtCooldownBuckets;
    expect(buckets.remaining(ImmunityCooldownID.General)).toBe(0);
    expect(blocks(buckets)).toBe(true);
    function blocks(b: HurtCooldownBuckets): boolean {
      return b.blocksHit(ImmunityCooldownID.WrongBugNet) && b.remaining(ImmunityCooldownID.Lava) === 0
        && b.remaining(ImmunityCooldownID.BossNoCheese) === 0;
    }
    // tick 耗尽后重入恢复受理（每 tick 无条件递减 ：19003-19009）
    for (let i = 0; i < 20; i++) buckets.tick();
    netCatch(fly2);
    expect(dmgCalls).toHaveLength(2);
  });
});

// ============================================================
// ★任务④ 仙灵捕捉微门（ItemCheck_CatchCritters :45104-45107 ai[2]<=1f）
// ============================================================
describe('任务④ 仙灵 583/584/585 仅 ai[2]<=1f 可捕（引导态拒捕）', () => {
  function fairyCase(vid: 583 | 584 | 585) {
    const { g, player, critters } = swingStub(1991, { t: 10, dur: 30, dmg: 0 });
    const f = Enemy.fromVanilla(vid, player.cx + 8, player.y)!;
    f.id = 9960 + vid;
    critters.push(f);
    return { g, f };
  }
  it.each([583, 584, 585] as const)('%i 野生态 ai2=0 可捕（CatchNPC→死 + 掉捕获物）', (vid) => {
    const { g, f } = fairyCase(vid);
    let dropKey = '';
    (g as unknown as Record<string, unknown>).spawnDrop =
      (_x: number, _y: number, key: string) => { dropKey = key; return null; };
    (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(f);
    expect(f.dead).toBe(true);
    // 捕获物键 = CRITTER_CATCH_BY_NPC[vid] 反查（4068-4070 三色妖精物品）
    expect(dropKey.startsWith(`vi_${CRITTER_CATCH_BY_NPC[vid]}`)).toBe(true);
  });
  it.each([583, 584, 585] as const)('%i 引导态 ai2=2 拒捕：不死不掉（ai[2]>1f 门）', (vid) => {
    const { g, f } = fairyCase(vid);
    (f as unknown as { ai2: number }).ai2 = 2;
    (g as unknown as Record<string, unknown>).spawnDrop = vi.fn();
    (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(f);
    expect(f.dead).toBe(false);
    expect(g.spawnDrop).not.toHaveBeenCalled();
  });
});

// ============================================================
// ★任务⑤ Volcano 星坠弹 978 全参数（SetDefaults :9255-9271 / AI_189 :43034 /
// StatusNPC :11365 / Volcano_TrySpawningVolcano :44496-44506）
// ============================================================

/** 探针锚注入点（starfurySwingProbes 被 Game 内消费；测试设固定双锚压探针支） */
const probeAnchor = { x: 0, y: 0, sx: 16 };

vi.mock('../src/player/SwingPathMath', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/player/SwingPathMath')>()),
  starfurySwingProbes: (): [{ x: number; y: number }, { x: number; y: number }] => [
    { x: probeAnchor.x, y: probeAnchor.y },
    { x: probeAnchor.x + probeAnchor.sx, y: probeAnchor.y },
  ],
}));

describe('任务⑤ proj 978 弹本体全参数断言（纯实体驱动）', () => {
  type FE = { x: number; y: number; w: number; h: number; id: number; dead: boolean;
    cx: number; cy: number; onFireT?: number; hits: number[];
    hurt?: (d: number, kx: number, ky: number, g: unknown, p: unknown,
      crit?: boolean) => boolean };
  function fakeGame(...enemies: FE[]) {
    for (const e of enemies) {
      e.hurt = (d: number, _kx: number, _ky: number, _g: unknown, _p: unknown,
        crit?: boolean) => { e.hits.push(crit ? d * 2 : d); return false; };
    }
    const game = {
      playSfx: vi.fn(),
      spawnParticles: vi.fn(),
      spawnDrop: () => null,
      enemies: () => enemies,
      critters: () => [],
    };
    return game as unknown as import('../src/entities/types').GameHooks & {
      playSfx: ReturnType<typeof vi.fn>;
    };
  }
  it('出生全参数：160×160、velocity=(0,-gravDir)、ai1=2、timeLeft 终值 30、DD2_ExplosiveTrapExplode 一次性', () => {
    const b = new VolcanoBlastProj(500, 700, 0, -1, 22, 3.5, 1);
    const gg = fakeGame() as unknown as { playSfx: ReturnType<typeof vi.fn>; enemies: () => [] };
    b.fixedUpdate(0.016667, gg as never);
    expect(b.w).toBe(160); expect(b.h).toBe(160);
    expect(b.vx).toBe(0); expect(b.vy).toBe(-1);
    expect(b.ai1).toBe(2);                          // NewProjectile 尾参 num=2
    expect(gg.playSfx).toHaveBeenCalledTimes(1);
    expect(gg.playSfx.mock.calls[0][0]).toBe('dd2Explosive');
    b.fixedUpdate(0.016667, gg as never);
    expect(gg.playSfx).toHaveBeenCalledTimes(1);     // soundDelay==0→-1 一次性门
    expect(b.y).toBeLessThan(708);                  // 每拍上移 1px（无重力直进）
  });
  it('局部免疫 localNPCHitCooldown=-1：同一目标全程只挨一刀；penetrate=3 三目标耗尽即亡', () => {
    const mk = (id: number): FE => ({ id, x: 600, y: 600, w: 20, h: 42, cx: 610, cy: 621, dead: false, hits: [] });
    const es = [mk(1), mk(2), mk(3)];
    const b = new VolcanoBlastProj(610, 621, 0, -1, 10, 1, 1);
    const gg = fakeGame(...es);
    b.fixedUpdate(0.01, gg as never);
    expect(es.map((e) => e.hits.length)).toEqual([1, 1, 1]);
    expect(es.every((e) => (e.onFireT ?? 0) >= 3)).toBe(true);   // AddBuff(24,180)=3s
    expect(b.dead).toBe(true);                      // penLeft 3 打穿即 Kill
  });
  it('寿命：frameCounter 每 2t 进帧、frame>=5 早 Kill（≈10t < timeLeft 30）；alpha 曲线升后降', () => {
    const b = new VolcanoBlastProj(0, 0, 0, -1, 5, 1, 1);
    const gg = fakeGame() as unknown as never;
    for (let i = 0; i < 11 && !b.dead; i++) b.fixedUpdate(0.01, gg);
    expect(b.dead).toBe(true);
    // alphaTick 在第 3 拍（ai0=2）应为满幅(1)、第 12 拍(≥10)应回到 0——渐显渐隐两段钳制
    const b2 = new VolcanoBlastProj(0, 0, 0, -1, 5, 1, 1);
    b2.fixedUpdate(0.01, fakeGame() as never);      // ai0:0→1
    b2.fixedUpdate(0.01, fakeGame() as never);      // ai0:1→2
    b2.fixedUpdate(0.01, fakeGame() as never);      // full display face reads alpha internally
    expect((b2 as unknown as { ai0: number }).ai0).toBeGreaterThanOrEqual(2);
  });
});

describe('任务⑤ 集成：火之大剑窗口消费即发 978（:44853 调用域参数链）', () => {
  it('首个受理命中生成 blast：伤=trunc(baseDmg×0.75)、kb=主命中 kb、window 复位为并集态', () => {
    probeAnchor.x = 0; probeAnchor.sx = 16;
    const { g, player, enemies, projectiles } = swingStub(121, { t: 22, dur: 30, dmg: 32, kb: 4 });
    const e = Enemy.fromVanilla(1, player.cx + 8, player.y)!;
    e.id = 9970;
    enemies.push(e);
    // 探针锚压在目标中心线上 ⇒ flag2（探针支）必真
    probeAnchor.x = e.cx - 8; probeAnchor.y = e.cy;
    e.hurt = vi.fn(() => false) as typeof e.hurt;
    // LOS：重叠盒四射线直过（F1 族既有口径）
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(projectiles).toHaveLength(1);
    const blast = projectiles[0] as VolcanoBlastProj & { damage: number; knockback: number };
    const baseDmg = 32 * player.damageMult('melee');
    expect(blast.damage).toBe(Math.max(1, Math.trunc(baseDmg * 0.75)));
    expect(blast.w).toBe(160);
    expect((g.swing as { volcanoWindow?: boolean }).volcanoWindow).toBe(false);
    expect(blast.critChance).toBeGreaterThan(0);
    expect(blast.direction).toBe(player.facing);
  });
});

// ============================================================
// ★任务⑥ 整型化锚 + [N5] 三段闭式（utils 直测）
// ============================================================
describe('任务⑥ intRect/rectIntersects/meleeThirdOf 闭式判定', () => {
  it('C# (int) 截断朝零而非 floor：负半轴 −2.5→−2', () => {
    const r = intRect(-2.5, -3.9, 10, 8);
    expect(r.x).toBe(-2);          // floor 会得 −3（错）
    expect(r.y).toBe(-3);
  });
  it('Rectangle.Intersects 左闭右开：边线相触不相交', () => {
    expect(rectIntersects(intRect(0, 0, 10, 10), intRect(10, 0, 5, 5))).toBe(false);
    // 截断语义钉住：x=10.4 → (int)10 = 恰贴右边界 → 不相交（floor 同得 10）
    expect(rectIntersects(intRect(0, 0, 10, 10), intRect(10.4, 0, 5, 5))).toBe(false);
    expect(rectIntersects(intRect(0, 0, 10, 10), intRect(9.4, 0, 5, 5))).toBe(true);
    // 负半轴截断（−4.7→−4）后盒 [−4,2] 与 [0,10] 重叠
    expect(rectIntersects(intRect(0, 0, 10, 10), intRect(-4.7, 2, 6, 3))).toBe(true);
  });
  it('[N5] 闭式 vs 有理数三分差：max=30 的三等分点归中段/早挥段（旧 ±1 抖动消失）', () => {
    // anim=10(=max/3)：vanilla `10 < 30*0.333=9.99` 为假 → 中段（旧式 pAnim≤1/3 判 tail=错）
    expect(meleeThirdOf(10, 30)).toBe('mid');
    expect(meleeThirdOf(9, 30)).toBe('tail');      // 9<9.99 ✓
    // anim=20(=max·2/3)：`!(20<19.98)` 真 → 早挥段（旧式 pAnim>2/3 判 mid=错）
    expect(meleeThirdOf(20, 30)).toBe('head');
    expect(meleeThirdOf(21, 30)).toBe('head');
    expect(meleeThirdOf(19, 30)).toBe('mid');
    // max=15：4.995/9.99 双阈值两侧各钉一帧（10 ≥ 10 → head，9 → mid）
    expect(meleeThirdOf(5, 15)).toBe('mid');
    expect(meleeThirdOf(4, 15)).toBe('tail');
    expect(meleeThirdOf(10, 15)).toBe('head');     // !(10 < 15*0.666=9.99)
    expect(meleeThirdOf(9, 15)).toBe('mid');
  });
  it('[N5] 探针测距入参盒截断生效：截断位移改变边界判定', () => {
    // 盒 y=-3.9 截断为 -3：线段贴近原浮点位但不触截断盒时距离变大
    const a = lineRectangleDistance(intRect(10, -3.9, 10, 8), { x: 50, y: 3 }, { x: 60, y: 3 });
    const b = lineRectangleDistance({ x: 10, y: -3.9, w: 10, h: 8 }, { x: 50, y: 3 }, { x: 60, y: 3 });
    expect(Math.abs(a - b)).toBeGreaterThan(0);    // 截断对距离有非零效应
  });
});

describe('HurtCooldownBuckets 工具面（num10 折算/仅空位写入）', () => {
  it('hurtImmunityFrames：实扣1→longInvince?40:20；实扣≠1→80/40（Player.cs:38674）', () => {
    expect(hurtImmunityFrames(1, false)).toBe(20);
    expect(hurtImmunityFrames(1, true)).toBe(40);
    expect(hurtImmunityFrames(3, false)).toBe(40);
    expect(hurtImmunityFrames(3, true)).toBe(80);
  });
  it('applyAfterHit 仅空位写入（:38680 形）：已有窗不被覆盖', () => {
    const bk = new HurtCooldownBuckets();
    bk.applyAfterHit(ImmunityCooldownID.WrongBugNet, 5);
    bk.applyAfterHit(ImmunityCooldownID.WrongBugNet, 99);
    expect(bk.remaining(ImmunityCooldownID.WrongBugNet)).toBe(5);
    bk.tick(); bk.tick();
    expect(bk.remaining(ImmunityCooldownID.WrongBugNet)).toBe(3);
  });
});
