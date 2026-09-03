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
  it('距离段：爆盒内敌 > 1000px（ownerHitCheckDistance 缺省 :306/:701）→ 不结算（:12417-12419）', () => {
    // 爆盒 (720,100) 128×96 → x 656..784 / y 52..148；敌 (712,92) 盒内；
    // 玩家中心 (800,1440) → 敌中心 (720,100) 距离 ≈1342 > 1000（空场无遮挡）
    const e = mkEnemy(1, 712, 92);
    const s = new ChloroBladeSlam(720, 100, 128, 96, 95);
    const g = makeHooks([e]);
    tickN(s, g, 5);                                              // timeLeft=5 走完整寿命
    expect(e.hurtLog.length).toBe(0);                            // 仅距离段即拒
    expect(s.dead).toBe(true);                                   // 盒照常 5 拍亡（:3353）
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
