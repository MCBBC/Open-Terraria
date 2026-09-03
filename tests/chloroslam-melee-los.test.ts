// ① CanHitWithMeleeWeapon LOS 段补齐闸门（Terarria1457 唯一标杆,行号均指该树）：
// 原版 Projectile.CanHitWithMeleeWeapon（Projectile.cs:12415-12425）两段：
//   距离段 :12417-12419  Distance(ent.Center) > ownerHitCheckDistance → false
//   LOS 段   :12420-12425  A 段整盒 Collision.CanHit(owner ↔ ent) + B/C/D 手位三射线
//              CanHitLine——与 Player.CanHit(Entity)（Player.cs:42857-42865）字面同式
//              ⇒ 仓内整链复用 physics/LineOfSight.playerCanHitEntity（勿重刻）。
// 受理位 = Damage_PVE_Inner :12657 `flag4 || (!targetNPC.noTileCollide && ownerHitCheck
//   && !CanHitWithMeleeWeapon(targetNPC))`——noTileCollide 目标【距离+LOS 双段全豁免】。
// 消费点：1129 ChloroBladeSlam（ownerHitCheck=true :3358,distance 1000 缺省）与
//   1126 ChloroClaymoreBlade（:10554-10555,300px）——两站均经 proj1457.dealContacts gate。
// ★1126 观测面注：其伤害盒=玩家中心 16×16（Center=RRP−velocity :42757）——敌怪须与
//   玩家盒重叠才进结算,四探针几何上恒通,LOS 段对 1126 不可达;本套件全部走 1129。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { ChloroBladeSlam } from '../src/entities/proj1457';

type HurtArgs = [number, number, number, unknown, number?, boolean?, number?, boolean?];
interface StubEnemy extends Record<string, unknown> {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  maxHp: number; hurtLog: HurtArgs[];
}

function mkEnemy(id: number, x: number, y: number, w = 16, h = 16,
  extra: Record<string, unknown> = {}): StubEnemy {
  const e = { id, x, y, w, h, dead: false, maxHp: 100, hurtLog: [] as HurtArgs[], ...extra } as StubEnemy;
  Object.defineProperties(e, {
    cx: { get: () => e.x + e.w / 2 },
    cy: { get: () => e.y + e.h / 2 },
    vx: { get: () => 0 },
    vy: { get: () => 0 },
  });
  e.hurt = (...a: unknown[]) => { e.hurtLog.push(a as HurtArgs); return false; };
  return e;
}

function makeHooks(enemies: StubEnemy[] = [], store?: TileStore,
  player?: Record<string, unknown>): GameHooks {
  const hooks = {
    world: { store: store ?? new TileStore(200, 120) } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, attackSpeedMult: 1, whipBuffs: {},
      ...player,
    } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
  };
  return hooks as unknown as GameHooks;
}

/** 竖墙列：full 高 tile 1（土）——A/B/C/D 四探针全被该列拦截 */
function wallColumn(st: TileStore, tx: number): void {
  for (let y = 0; y < 120; y++) st.setTileSilent(tx, y, 1);
}

function tickN(s: ChloroBladeSlam, g: GameHooks, n: number): void {
  for (let i = 0; i < n && !s.dead; i++) s.fixedUpdate(1 / 60, g);
}

describe('① 1129 ChloroBladeSlam ownerHitCheck 整门（距离+LOS,noTileCollide 豁免）', () => {
  it('距离段基准=弹体 Center（:12417-12419）：爆盒内敌距玩家 1342px 仍结算——', () => {
    // ★R2-F1+F10 重产（2026-09-03）：原版 Distance(ent.Center) 基准=【弹体自身】Center
    // （1129 盒心=砸地位;Projectile.cs:42781 1126 同式锚）——曾按玩家中心锚判此例
    // 不结算,错位。本几何：弹 (720,100) 128×96 → x 656..784 / y 52..148；敌 (712,92)
    // 盒内、距弹心 hypot(8,8)≈11 < 1000 → 距离段过；玩家 (800,1440) 距敌 1342px
    // 只影响 LOS 段探针起点（空场四探针恒通）→ 结算恰一次
    const e = mkEnemy(1, 712, 92);
    const s = new ChloroBladeSlam(720, 100, 128, 96, 95);
    const g = makeHooks([e]);
    tickN(s, g, 5);                                              // timeLeft=5 走完整寿命
    expect(e.hurtLog.length).toBe(1);                            // 弹心近敌照结算
    expect(s.dead).toBe(true);                                   // 盒照常 5 拍亡（:3353）
  });

  it('距离段：敌距【弹心】> 1000px（ownerHitCheckDistance 缺省 :306/:701）→ 不结算', () => {
    // 判别例（旧玩家锚下此敌距玩家仅 10px 会误结算）：巨盒 (720,100) 2400×2800
    // → x −480..1920 / y −1300..1500 敌 (800,1420) 盒内贴玩家（中心 (810,1440)）；
    // 弹心距敌 hypot(90,1340)≈1343 > 1000 → 距离段即拒（AABB 相交但进不了结算）
    const e = mkEnemy(1, 800, 1420);
    const s = new ChloroBladeSlam(720, 100, 2400, 2800, 95);
    const g = makeHooks([e]);
    tickN(s, g, 5);
    expect(e.hurtLog.length).toBe(0);
    expect(s.dead).toBe(true);
  });

  it('LOS 段：爆盒内敌 ≤1000px 但玩家↔敌间整列实心墙 → 四探针全断 → 不结算（:12420-12425）', () => {
    const st = new TileStore(200, 120);
    wallColumn(st, 48);                                          // x=768..784 竖墙（玩家盒 790..810 不贴）
    const e = mkEnemy(2, 700, 700);                              // 中心 (708,708),距离 ≈738 < 1000
    const s = new ChloroBladeSlam(720, 720, 128, 96, 95);
    const g = makeHooks([e], st);
    tickN(s, g, 5);
    expect(e.hurtLog.length).toBe(0);                            // 隔墙大爆盒不吃（A 段整盒+三射线全断）
  });

  it('LOS 正向对照：同几何无墙 → 结算恰一次（cooldown −1 :3357 段）', () => {
    const e = mkEnemy(3, 700, 700);
    const s = new ChloroBladeSlam(720, 720, 128, 96, 95);
    const g = makeHooks([e]);
    tickN(s, g, 5);
    expect(e.hurtLog.length).toBe(1);
  });

  it('noTileCollide 目标整门豁免（:12657 字面）：隔墙+超距双不满足仍结算', () => {
    const st = new TileStore(200, 120);
    wallColumn(st, 48);
    const e = mkEnemy(4, 700, 700, 16, 16, { noTileCollide: true });
    const s = new ChloroBladeSlam(720, 720, 128, 96, 95);
    const g = makeHooks([e], st);
    tickN(s, g, 5);
    expect(e.hurtLog.length).toBe(1);                            // 距离+LOS 两段全跳过
    // 对照组：同盒远端（>1000）noTileCollide 敌——距离段同样豁免
    const far = mkEnemy(5, 712, 92, 16, 16, { noTileCollide: true });
    const s2 = new ChloroBladeSlam(720, 100, 128, 96, 95);
    const g2 = makeHooks([far], st);
    tickN(s2, g2, 5);
    expect(far.hurtLog.length).toBe(1);
  });
});
