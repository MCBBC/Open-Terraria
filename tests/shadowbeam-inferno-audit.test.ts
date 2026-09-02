// 敌侧弹幕三缺口金标（2026-09-02 批;桩式仿 arrow-flight-trail-dust.test.ts）：
// ① 290 ShadowBeamHostile（aiStyle48 :28608-28646 + 反弹 :18975-19018 + Kill :71825-71870）：
//    本体恒隐（alpha=255 每子步写）/ 撞块反弹不消亡（主轴反射登记口径）/ 束段 d173 铺撒
//    （Spawn_Shadowbeam 敌版 velocityScalar=0.03334,Orchestrator.cs:1989-1993）/ Kill 收尾铺撒
// ② 291 InfernoHostileBolt（aiStyle50 291 支 :28738-28767 + Kill :75802-75807）：
//    10×d174 尾迹/拍 + 越点引爆（Dot(target−Center,v)<=0）+ Kill=spawn 292（非通用 rocket 爆）
// ③ 292 InfernoHostileBlast（SetDefaults :3817-3826 + AI :28782-28823）：
//    25×d174/拍（中心±10 出生,3..8 归一外发,scale1.5）+ 541 拍存续（ai0>540→Kill :28792-28800）
//    + 接触伤害（Damage_EVP immune 门重判,命中不消亡）+ Item74 单次
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Dart } from '../src/entities/Dart';
import { InfernoHostileBlast } from '../src/entities/InfernoHostileBlast';
import { BuffType, buffTypeByVanilla } from '../src/stats/Buffs';

interface DustRec { type: number; alpha: number; scale: number; noGravity: boolean;
  x: number; y: number; vx: number; vy: number; }

function makeGame(w: World, opts?: { playerAt?: [number, number] }) {
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const broadcasts: Array<{ type: number; x: number; y: number; mx: number; my: number; info: number }> = [];
  const added: Array<{ e: unknown; bucket: string }> = [];
  const damageCalls: Array<{ dmg: number; x: number; y: number }> = [];
  const buffsApplied: Array<[number, number]> = [];
  const px = opts?.playerAt?.[0] ?? 60 * 16;
  const py = opts?.playerAt?.[1] ?? 60 * 16;
  const player = {
    x: px - 10, y: py - 21, w: 20, h: 42, cx: px, cy: py, dead: false,
    vx: 0, vy: 0, iframes: 0, luck: 0, shimmering: false,
    buffs: { has: () => false, apply: (t: number, s: number) => buffsApplied.push([t, s]) },
  };
  const hooks = {
    world: w,
    player,
    playSfxFiles: (files: string[], _v?: number, x?: number, y?: number) => {
      for (const f of files) sfx.push(f);
      void x; void y;
    },
    playSfx: () => {}, playSfxFile: () => false,
    spawnParticles: () => {},
    addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (dmg: number, x: number, y: number): number => {
      damageCalls.push({ dmg, x, y });
      player.iframes = 30;                    // Player.damage 命中落地 → 无敌帧（镜像）
      return dmg;
    },
    entities: { nextId: 1, add: (e: unknown, bucket: string) => { added.push({ e, bucket }); } },
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {}, notifyInventoryChanged: () => {},
    broadcastParticleOrchestra: (type: number, x: number, y: number, mx = 0, my = 0, info = 0) => {
      broadcasts.push({ type, x, y, mx, my, info });
    },
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec = { type, alpha, scale, noGravity: !!ng, x, y, vx: sx, vy: sy };
      dusts.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { hooks, dusts, sfx, broadcasts, added, damageCalls, buffsApplied, player };
}

function emptyWorld(wide = false): World {
  const w = new World(wide ? 160 : 80, wide ? 120 : 80, 42, 'open');
  for (let x = 0; x < (wide ? 160 : 80); x++) w.store.setTileSilent(x, 70, 1, 0, 0);
  return w;
}

function flyTicks(d: Dart, hooks: GameHooks, n: number): number {
  let i = 0;
  for (; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
  return i;
}

// ---------------------------------------------------------------- ① 290 暗影束

describe('① 290 ShadowBeamHostile（aiStyle48）', () => {
  it('本体恒隐：alpha=255（AI 每子步写 :28630-28632），且通用 fade 不再衰减', () => {
    const { hooks } = makeGame(emptyWorld());
    const d = new Dart(30 * 16, 40 * 16, 6, 0, 30, 290);
    expect(d['alpha']).toBe(255);
    flyTicks(d, hooks, 2);
    expect(d['alpha']).toBe(255);
  });

  it('撞块反弹：velocity 全速反号不消亡（:18975-19018）+ 束段 d173 铺撒 + 重锚', () => {
    const w = emptyWorld();
    w.store.setTileSilent(44, 40, 1, 0, 0);          // 单格墙（弹心必采样）
    const { hooks, dusts, broadcasts } = makeGame(w, { playerAt: [10 * 16, 10 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 6, 0, 30, 290);
    flyTicks(d, hooks, 1);
    expect(d.dead).toBe(false);                       // 反弹不消亡
    expect(d.vx).toBe(-6);                            // 主轴全速反号（登记口径）
    expect(dusts.filter((x) => x.type === 173).length).toBeGreaterThan(0);
    expect(broadcasts.some((b) => b.type === 58)).toBe(true);   // ShadowbeamHostile=58
  });

  it('Kill 收尾铺撒（:71825-71870）：无墙直飞寿终 → d173 线束 + 广播一次', () => {
    const { hooks, dusts, broadcasts, sfx } = makeGame(emptyWorld(true), { playerAt: [10 * 16, 10 * 16] });
    const d = new Dart(20 * 16, 40 * 16, 6, 0, 30, 290);   // 宽世界防 InWorld 内缘门截停
    const t = flyTicks(d, hooks, 10);
    expect(d.dead).toBe(true);
    // ★290 寿命金标（2026-09-02 专项定谳）：SetDefaults :3795-3805 timeLeft=100【非终值】
    // —— 发射点 NPC.cs:21251-21300（弹速 num100=6f）尾参 HardmodeDungeonSkeletonShot
    // → NewProjectileModifiers.cs:5-8 直写 timeLeft=300；timeLeft-- :17307 括号计数
    // depth2 = 子步循环（:16781,101 子步/拍）直接体 → 2 全拍+第 3 拍 98 子步处 Kill
    // （+1 尾子步 :17132 早退,位移共 301 子步=1806px）。头递减模型取 life 4 =
    // 3 全拍飞行 303 子步（较原版 +2 子步≈12px;life 3 少 99 子步=整拍缺飞）
    expect(t).toBe(4);
    expect(d.cx).toBe(20 * 16 + 2 + 3 * 101 * 6);   // 3 全拍 × 101 子步 × 6px = 1818px
    expect(dusts.filter((x) => x.type === 173).length).toBeGreaterThan(0);
    expect(broadcasts.filter((b) => b.type === 58).length).toBe(1);
    expect(sfx.filter((f) => f === 'Item_8').length).toBe(1);   // 首子步单次（:28633-28636）
  });
});

// ---------------------------------------------------------------- ② 291 地狱火弹

describe('② 291 InfernoHostileBolt（aiStyle50 291 支）', () => {
  it('尾迹：10×d174/拍（noGravity α100 scale1.2,尘速×0.5+弹速×0.1 :28758-28766）+ Item20 单次', () => {
    const { hooks, dusts, sfx } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    d.spawnAi0 = 70 * 16; d.spawnAi1 = 40 * 16;      // 锚点远置（不引爆,纯尾迹窗）
    flyTicks(d, hooks, 5);
    const trail = dusts.filter((x) => x.type === 174);
    expect(trail.length).toBe(50);
    expect(trail.every((x) => x.alpha === 100 && Math.abs(x.scale - 1.2) < 1e-9 && x.noGravity)).toBe(true);
    expect(sfx.filter((f) => f === 'Item_20').length).toBe(1);   // localAI[0]==0 单次（:28740-28744）
  });

  it('越点引爆：Dot(target−Center,v)<=0 → 速度归零 → Kill（:28748-28756）', () => {
    const { hooks } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    d.spawnAi0 = 34 * 16; d.spawnAi1 = 40 * 16;      // 锚=弹心 +64px（8 拍余 8 步）
    flyTicks(d, hooks, 12);
    expect(d.dead).toBe(true);
    expect(d.vx).toBe(0); expect(d.vy).toBe(0);      // velocity=Zero（:28751）
  });

  it('锚点缺省补偿：未传 ai 参 → 首子步捕玩家心并越点引爆（NPC.cs:21294 等价域）', () => {
    const { hooks } = makeGame(emptyWorld(), { playerAt: [34 * 16, 40 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    flyTicks(d, hooks, 14);
    expect(d.dead).toBe(true);                        // 弹心越过玩家心即爆
  });

  it('Kill=原位 spawn 292（:75802-75807）：爆区实体同伤入桶,不走 rocket 通用爆', () => {
    const { hooks, added, sfx } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    d.spawnAi0 = 34 * 16; d.spawnAi1 = 40 * 16;
    flyTicks(d, hooks, 12);
    const blasts = added.filter((a) => a.e instanceof InfernoHostileBlast);
    expect(blasts.length).toBe(1);
    expect(blasts[0].bucket).toBe('projectiles');
    const b = blasts[0].e as InfernoHostileBlast;
    expect(b.damage).toBe(40);                        // 同 damage 直传（:75806）
    expect(b.w).toBe(130); expect(b.h).toBe(130);     // SetDefaults :3819-3820
    expect(sfx).not.toContain('Item_14');             // 旧 rocket:65 通用爆已退役
  });
});

// ---------------------------------------------------------------- ③ 292 爆区

describe('③ 292 InfernoHostileBlast（aiStyle50 通用支）', () => {
  it('尘面：25×d174/拍（Center±10 出生,3..8 归一外发,scale1.5 noGravity α100 :28806-28823）', () => {
    const { hooks, dusts } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const b = new InfernoHostileBlast(40 * 16, 40 * 16, 40);
    for (let i = 0; i < 3; i++) b.fixedUpdate(1 / 60, hooks);
    const flame = dusts.filter((x) => x.type === 174);
    // 75=25×3;双零掷(1/441/尘)跳过（原版=NaN 尘,登记近似）→ 容差窗
    expect(flame.length).toBeGreaterThanOrEqual(73);
    expect(flame.length).toBeLessThanOrEqual(75);
    expect(flame.every((x) => x.alpha === 100 && Math.abs(x.scale - 1.5) < 1e-9 && x.noGravity)).toBe(true);
    const spd = flame.every((x) => {
      const m = Math.hypot(x.vx, x.vy);
      return m >= 3 - 1e-6 && m <= 8 + 1e-6;
    });
    expect(spd).toBe(true);                           // Next(3,9) 归一外发
    const near = flame.every((x) => Math.abs(x.x - 40 * 16) <= 10 && Math.abs(x.y - 40 * 16) <= 10);
    expect(near).toBe(true);                          // 出生位 Center±10（:28817-28820）
  });

  it('Item74 单次点火吼（localAI[0]==0 门 :28782-28786）', () => {
    const { hooks, sfx } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const b = new InfernoHostileBlast(40 * 16, 40 * 16, 40);
    for (let i = 0; i < 5; i++) b.fixedUpdate(1 / 60, hooks);
    expect(sfx.filter((f) => f === 'Item_74').length).toBe(1);
  });

  it('存续 541 拍（ai0>540 → num361≤0 → Kill :28792-28800）', () => {
    const { hooks } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const b = new InfernoHostileBlast(40 * 16, 40 * 16, 40);
    let t = 0;
    for (; t < 600 && !b.dead; t++) b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(true);
    expect(t).toBe(541);
  });

  it('接触伤害：命中实扣（DamageVar ±15% 掷内）+ 命中不消亡 + immune 门内不重判 + On Fire 表', () => {
    const { hooks, damageCalls, buffsApplied, player } = makeGame(emptyWorld(),
      { playerAt: [40 * 16, 40 * 16] });               // 玩家在爆区盒内
    const b = new InfernoHostileBlast(40 * 16, 40 * 16, 40);
    b.fixedUpdate(1 / 60, hooks);                     // 首拍命中（80=40×难度1×2）
    expect(b.dead).toBe(false);                       // 灼烧区持续（penetrate=-1 不因命中消亡）
    expect(damageCalls.length).toBe(1);
    expect(damageCalls[0].dmg).toBeGreaterThanOrEqual(68);
    expect(damageCalls[0].dmg).toBeLessThanOrEqual(92);
    expect(buffsApplied.length).toBe(1);              // On Fire(24) 60×Next(8,16)（:12337-12340）
    expect(buffsApplied[0][0]).toBe(BuffType.OnFire); // vanilla 24 → 本仓枚举位
    expect(buffTypeByVanilla(24)).toBe(BuffType.OnFire);
    expect(buffsApplied[0][1]).toBeGreaterThan(0);
    for (let i = 0; i < 29; i++) {                    // immune 窗内（iframes>0）不重判
      player.iframes = 30;
      b.fixedUpdate(1 / 60, hooks);
    }
    expect(damageCalls.length).toBe(1);
    player.iframes = 0;                               // 窗出 → 灼烧区重判（Damage_EVP 门）
    b.fixedUpdate(1 / 60, hooks);
    expect(damageCalls.length).toBe(2);
  });

  it('291 链路直构位:伤害由 spawn 侧直传（Dart.inferno291Kill → 同 damage）', () => {
    const { hooks, added } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 57, 291);
    d.spawnAi0 = 34 * 16; d.spawnAi1 = 40 * 16;
    flyTicks(d, hooks, 12);
    const b = added.map((a) => a.e).find((e) => e instanceof InfernoHostileBlast) as InfernoHostileBlast;
    expect(b).toBeTruthy();
    expect(b.damage).toBe(57);
  });
});

// ---------------------------------------------------------------- ④ 292 联机访客镜像

// ★MP 架构判定（2026-09-02 专项）：敌弹在联机=房主权威模拟（NPC AI 房主独算）,
// 访客端是快照傀儡（netMakeProj case 2 → netPuppet 早退）——"敌弹各端自算,访客
// 自然 spawn 292"不成立,登记的访客缺口成立。修法=借房主消亡权威事件
// （msg28 ProjDespawn / 180t 未 seen 超时清扫 → dead=true → Entity.compact destroy
// 钩）在访客本地镜像重建 292（不上线,各端自算,victim-settles 同构）。
describe('④ 292 联机访客镜像（Dart.destroy 口,2026-09-02 缺口清偿）', () => {
  it('访客傀儡 291 消亡 → 本地镜像 292（同伤/末拍位/130×130 SetDefaults）', () => {
    const { hooks, added } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    d.netPuppet = true;                    // 访客傀儡（netMakeProj case 2 同构）
    d.fixedUpdate(1 / 60, hooks);          // 傀儡步进（lastGame 引用刷新）
    d.x = 50 * 16 - 6; d.y = 40 * 16 - 6;  // 快照末拍位（291 盒 12×12,傀儡心 = 50*16,40*16）
    d.dead = true;                         // netRemoveProjPuppets/超时清扫置位
    d.destroy();
    const blasts = added.filter((a) => a.e instanceof InfernoHostileBlast);
    expect(blasts.length).toBe(1);
    expect(blasts[0].bucket).toBe('projectiles');
    const b = blasts[0].e as InfernoHostileBlast;
    expect(b.damage).toBe(40);             // 快照 dmg = 房主 291 终伤（与 Kill 口同源）
    expect(b.cx).toBe(50 * 16); expect(b.cy).toBe(40 * 16);   // 末拍傀儡心
    expect(b.w).toBe(130); expect(b.h).toBe(130);
  });

  it('幂等：destroy 重复调用 / 房主 Kill 口已生成 → 恒 1 个 292', () => {
    // 房主路径：越点引爆（Kill 口已置 if291Mirrored）→ destroy 直拒（!netPuppet + 门）
    const { hooks, added } = makeGame(emptyWorld(), { playerAt: [34 * 16, 40 * 16] });
    const d = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    flyTicks(d, hooks, 14);
    expect(d.dead).toBe(true);
    expect(added.filter((a) => a.e instanceof InfernoHostileBlast).length).toBe(1);
    d.destroy();
    expect(added.filter((a) => a.e instanceof InfernoHostileBlast).length).toBe(1);
    // 傀儡路径：destroy 双调 → 仍 1
    const g2 = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const p = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    p.netPuppet = true;
    p.fixedUpdate(1 / 60, g2.hooks);
    p.dead = true;
    p.destroy(); p.destroy();
    expect(g2.added.filter((a) => a.e instanceof InfernoHostileBlast).length).toBe(1);
  });

  it('非 291 / 未步进傀儡（无 lastGame）→ destroy 零生成', () => {
    const { hooks, added } = makeGame(emptyWorld(), { playerAt: [70 * 16, 70 * 16] });
    const other = new Dart(30 * 16, 40 * 16, 8, 0, 40, 128);
    other.netPuppet = true;
    other.fixedUpdate(1 / 60, hooks);
    other.dead = true;
    other.destroy();
    const neverStepped = new Dart(30 * 16, 40 * 16, 8, 0, 40, 291);
    neverStepped.netPuppet = true;
    neverStepped.dead = true;
    neverStepped.destroy();
    expect(added.filter((a) => a.e instanceof InfernoHostileBlast).length).toBe(0);
  });
});
