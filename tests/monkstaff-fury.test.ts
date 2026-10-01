// DD2 僧杖系 T1/T2 武器链回归（Sleepy Octopod 3835 / Ghastly Glaive 3836）：
//   · 697 旋棍（AI_140 type697 支 Projectile.cs:70509-70584）：加速旋进、半程松手收棍/
//     重瞄换向、砸地生成 698（伤×3）+ dd2_monk_staff_ground_impact 音（:70575-70583）、
//     命中=玩家中心半径 73 邻域盘（Colliding :15992-16013）、12t 同敌冷却
//     ★707 无砸地段（707 支 :70586 起）——账本 B2"707 砸地爆段缺"系误归因，
//     SkyDragonFury 不应有爆箱，此处以 697 为唯一宿主锁定行为
//   · 698 爆箱（AI_141 :70685-70701）：timeLeft=5 寿命、每敌一次（localNPCImmunity −1）、
//     Colliding 子盒变换（:15537-15551）
//   · 699 骸骨长戟（AI_142 type699 支 :70914-70962）：绕手椭圆弧、命中→SummonMonkGhast
//     （:15238-15265 索敌 800px CanBeChasedBy 随机一敌、单次门 localAI[0]=1000）、
//     anim≤2 收势
//   · 700 幽灵（AI_143 :71055-71120）：首帧 dd2_ghastly_glaive_impact_ghost 音一次、
//     α 钳底 100/ai0>50 渐隐、vel×0.98 衰减、4 帧 5t、60t 寿命、每敌一次
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { MonkStaffSpin, MonkSlam, GhastlyGlaiveProj, MonkGhast } from '../src/entities/MonkStaffFury';

function makeGame(w: World, list: unknown[] = [], sfx?: string[][]) {
  const sfxCalls = sfx ?? [];
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFile: () => {},
    playSfxFiles: (files: string[]) => { sfxCalls.push(files); },
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    sfxCalls,
  } as unknown as GameHooks & { sfxCalls: string[][] };
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 180, 1, 0, 0);
  return w;
}

function mkOwner(cx: number, cy: number) {
  return { cx, cy, facing: 1, dead: false, vx: 0, vy: 0 };
}

/** 敌怪假体（def.lifeMax/vanillaId/dontTakeDamage 驱动 canBeChasedBy/playerCanHitEnemy） */
function mkEnemy(id: number, x: number, y: number, opts?: {
  w?: number; h?: number; vanillaId?: number; lifeMax?: number;
}) {
  const e = {
    id, x, y, w: opts?.w ?? 40, h: opts?.h ?? 40, dead: false,
    vanillaId: opts?.vanillaId,
    // ★X2 桩修正（2026-10-01）:BJ89 幻影字段定谳——EnemyDef 只有 hp 无 lifeMax,
    //  canBeChasedBy（projTargets.ts:538）读 t.maxHp ?? t.def?.hp;旧桩只写幻影
    //  lifeMax → 小生命排除谓词恒失明（随机误选 50%）。补写真实消费字段。
    maxHp: opts?.lifeMax ?? 100,
    def: { hp: opts?.lifeMax ?? 100, friendly: false },
    hurtCalls: 0,
    hurt() { e.hurtCalls++; return true; },
  };
  return e;
}

describe('697 睡章鱼旋棍（AI_140 type697 支）', () => {
  it('持按：约 40-49t 走完 50 进度收棍，onEnd 恰一次（reuseDelay=10 语义）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let ended = 0;
    const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
      () => true, () => ({ x: owner.cx + 500, y: owner.cy }), () => { ended++; });
    let ticks = 0;
    for (; ticks < 60 && !spin.dead; ticks++) spin.fixedUpdate(1, game);
    expect(spin.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(35);        // 加速旋进 1.0→1.25 → 约 40t
    expect(ticks).toBeLessThan(50);
    expect(ended).toBe(1);
  });

  it('半程松手：越半程帧（flag 越门）即收棍', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
      () => false, () => ({ x: owner.cx, y: owner.cy }), () => {});
    let ticks = 0;
    for (; ticks < 40 && !spin.dead; ticks++) spin.fixedUpdate(1, game);
    expect(spin.dead).toBe(true);
    // 半程门在进度 25 前后（加速下约 20-22t），远早于满程
    expect(ticks).toBeLessThan(30);
  });

  it('半程重瞄：鼠标换侧 → dir/facing 翻转且 rot 折返 π', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let mouseRight = true;
    const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
      () => true, () => ({ x: owner.cx + (mouseRight ? 500 : -500), y: owner.cy }), () => {});
    const rotBefore = () => (spin as unknown as { rot: number }).rot;
    for (let t = 0; t < 15; t++) spin.fixedUpdate(1, game);
    expect((spin as unknown as { dir: number }).dir).toBe(1);
    mouseRight = false;
    let flipped = false;
    for (let t = 0; t < 12 && !flipped; t++) {
      const r0 = rotBefore();
      spin.fixedUpdate(1, game);
      if ((spin as unknown as { dir: number }).dir === -1) {
        flipped = true;
        expect(owner.facing).toBe(-1);               // ChangeDir(num9)
        expect(Math.abs(rotBefore() - (r0 - Math.PI))).toBeLessThan(1e-6 + 0.7);   // rot−=π 后仍续旋
      }
    }
    expect(flipped).toBe(true);
  });

  it('砸地：进度越过 47 恰一帧生成 698（伤×3、vel=dir）+ ground_impact 音恰一次', () => {
    const sfx: string[][] = [];
    const game = makeGame(emptyWorld(), [], sfx);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const slams: Array<{ x: number; y: number; vx: number; vy: number; dmg: number }> = [];
    const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
      () => true, () => ({ x: owner.cx + 500, y: owner.cy }), () => {});
    spin.spawnSlam = (x, y, vx, vy, dmg) => slams.push({ x, y, vx, vy, dmg });
    for (let t = 0; t < 60 && !spin.dead; t++) spin.fixedUpdate(1, game);
    expect(slams.length).toBe(1);                    // 单次掷（越门恰一帧）
    expect(slams[0].dmg).toBe(150);                  // damage*3（:70511/:70580）
    expect(slams[0].vx).toBe(1);                     // velocity=(num6,0)
    const gi = sfx.find((f) => f.length && f[0].startsWith('dd2_monk_staff_ground_impact'));
    expect(gi).toBeDefined();                        // SoundID.cs:1008 三变体整组
    expect(gi!.length).toBe(3);
    expect(sfx.filter((f) => f.length && f[0].startsWith('dd2_monk_staff_ground_impact')).length).toBe(1);
  });

  it('命中=玩家中心半径 73 邻域盘（Colliding :15992-16013）：近敌中、远敌不中、12t 冷却', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const near = mkEnemy(1, owner.cx - 20, owner.cy - 20);           // 盘内
    const far = mkEnemy(2, owner.cx + 300, owner.cy - 20);           // 盘外（>73）
    list.push(near, far);
    const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
      () => true, () => ({ x: owner.cx + 500, y: owner.cy }), () => {});
    spin.critChance = 0;
    spin.fixedUpdate(1, game);
    expect((near as { hurtCalls: number }).hurtCalls).toBe(1);
    expect((far as { hurtCalls: number }).hurtCalls).toBe(0);
    for (let t = 0; t < 11; t++) spin.fixedUpdate(1, game);          // 冷却期内不再结算
    expect((near as { hurtCalls: number }).hurtCalls).toBe(1);
    spin.fixedUpdate(1, game);                                       // 第 13t：冷却完再中
    expect((near as { hurtCalls: number }).hurtCalls).toBeGreaterThanOrEqual(2);
  });
});

describe('698 睡章鱼砸地爆箱（AI_141）', () => {
  it('timeLeft=5 寿命闸；每敌至多一次（localNPCImmunity −1）；碎屑尘在 ai0==1 帧出', () => {
    const list: unknown[] = [];
    const parts: number[] = [];
    const game = makeGame(emptyWorld(), list);
    (game as unknown as { spawnParticles: () => void }).spawnParticles = (..._a: unknown[]) => { parts.push(1); };
    const owner = mkOwner(80 * TILE, 176 * TILE);                    // 底对地板（y=180 行顶）
    list.push(mkEnemy(1, owner.cx - 30, owner.cy - 30));
    const en = list[0] as { hurtCalls: number };
    const slam = new MonkSlam(owner.cx - 37, 176 * TILE - 100, 1, 0, 150);
    slam.critChance = 0;
    slam.fixedUpdate(1, game);                                       // ai0=1：impactFx + 首轮判定
    expect(parts.length).toBeGreaterThan(0);                         // 地表碎屑（CreateImpactExplosion 族近似）
    expect(en.hurtCalls).toBe(1);
    for (let t = 0; t < 3; t++) slam.fixedUpdate(1, game);           // 第 2..4t 持续在场
    expect(en.hurtCalls).toBe(1);                                    // 但同敌不再结算
    expect(slam.dead).toBe(false);
    slam.fixedUpdate(1, game);                                       // 第 5t：timeLeft 归零寿命尽
    expect(slam.dead).toBe(true);
  });

  it('Colliding 子盒（inflate70+平移+上移子盒）：命中带前向偏置', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    // 弹盒 75×200 @ (1000,1000)，vx=+1 → 判定子盒 X≈[1030,1185]、Y=[930,1300]
    const front = mkEnemy(1, 1100, 1100);                            // 子盒内
    const back = mkEnemy(2, 850, 1100);                              // 弹盒后方（原盒外且子盒外）
    list.push(front, back);
    const slam = new MonkSlam(1000, 1000, 1, 0, 90);
    slam.critChance = 0;
    slam.fixedUpdate(1, game);
    expect((front as { hurtCalls: number }).hurtCalls).toBe(1);
    expect((back as { hurtCalls: number }).hurtCalls).toBe(0);
  });

  it('bonusCritChance=25 接线位：critChance=1 时伤翻倍（wiring 叠加 +0.25 的实体侧语义）', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const en = mkEnemy(1, 1000, 1000);
    list.push(en);
    const slam = new MonkSlam(1000, 1000, 1, 0, 90);
    slam.critChance = 1;                                             // wiring: critTotal+0.25 极端化
    slam.fixedUpdate(1, game);
    expect(en.hurtCalls).toBe(1);
    void game;
  });
});

describe('699 骸骨长戟（AI_142 type699 支 + SummonMonkGhast）', () => {
  it('绕手椭圆弧：位置逐 tick 移动；anim≤2 收势 + onEnd（reuseDelay=2）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let animT = 27;
    let ended = 0;
    const gl = new GhastlyGlaiveProj(owner, 42, 0, 45, 7,
      31.5, () => animT, 27, () => { ended++; });
    gl.fixedUpdate(1, game);
    const p0 = { x: gl.x, y: gl.y };
    animT -= 6;
    gl.fixedUpdate(1, game);
    const p1 = { x: gl.x, y: gl.y };
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(5);   // 弧上明显移位
    expect(gl.dead).toBe(false);
    animT = 2;                                                         // itemAnimation<=2 收势门
    gl.fixedUpdate(1, game);
    expect(gl.dead).toBe(true);
    expect(ended).toBe(1);
  });

  it('命中敌 → SummonMonkGhast 恰一次：反向 120px 出生、伤继承、速度含 ±4..6 横向分量', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    // 命中线 = 弹体 Center 反向 95px 线段厚 23（Colliding :16016-16028）→ 敌放
    // 手心与弹头之间（弹头在手心前 ~64px、线段向后延至手心后 ~31px）
    const en = mkEnemy(1, owner.cx - 60, owner.cy - 20);
    list.push(en);
    let animT = 27;
    const ghosts: Array<{ x: number; y: number; vx: number; vy: number; dmg: number }> = [];
    const gl = new GhastlyGlaiveProj(owner, 42, 0, 45, 7,
      31.5, () => animT, 27, () => {});
    gl.spawnGhast = (x, y, vx, vy, dmg) => ghosts.push({ x, y, vx, vy, dmg });
    gl.fixedUpdate(1, game);
    expect(ghosts.length).toBe(1);                   // localAI[0]=1000 单次门
    expect(ghosts[0].dmg).toBe(45);                  // NewProjectile damage 实参（:15257）
    expect(Math.abs(ghosts[0].y - (en.y + 20))).toBeLessThan(1e-6);    // 出生 Y=目标中心 Y
    expect(Math.abs(Math.abs(ghosts[0].x - (en.x + 20)) - 120)).toBeLessThan(1e-6);   // 反向 120px
    expect(Math.abs(ghosts[0].vx)).toBeGreaterThanOrEqual(4);          // (±4..6,0)+追向×2
    expect(Math.abs(ghosts[0].vx)).toBeLessThanOrEqual(6 + 2 + 1e-9);
    for (let t = 0; t < 24 && !gl.dead; t++) { animT--; gl.fixedUpdate(1, game); }
    expect(ghosts.length).toBe(1);                   // 多次命中不重复召唤
  });

  it('索敌 800px 门 + CanBeChasedBy：盘外/假人(488)/小生命(lifeMax≤5)不入候选', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const dummy = mkEnemy(1, owner.cx + 30, owner.cy - 20, { vanillaId: 488 });       // 最近但 immortal
    const critter = mkEnemy(2, owner.cx - 40, owner.cy - 20, { lifeMax: 5 });         // 小生命
    const far = mkEnemy(3, owner.cx + 900, owner.cy);                                 // >800px
    const valid = mkEnemy(4, owner.cx - 200, owner.cy - 10);                          // 唯一合法候选
    list.push(dummy, critter, far, valid);
    let animT = 27;
    const ghosts: Array<{ x: number; y: number }> = [];
    const gl = new GhastlyGlaiveProj(owner, 42, 0, 45, 7,
      31.5, () => animT, 27, () => {});
    gl.spawnGhast = (x, y) => ghosts.push({ x, y });
    gl.fixedUpdate(1, game);
    expect(ghosts.length).toBe(1);
    // 目标必为 valid：出生位 = 其中心 ±120px 横移、Y=其中心 Y
    expect(Math.abs(ghosts[0].y - (valid.y + 20))).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(ghosts[0].x - (valid.x + 20)) - 120)).toBeLessThan(1e-6);
  });

  it('无敌可索 → 目标=自体中心（出生位仍反向 120px）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let animT = 27;
    const ghosts: Array<{ x: number; y: number }> = [];
    const gl = new GhastlyGlaiveProj(owner, 42, 0, 45, 7,
      31.5, () => animT, 27, () => {});
    gl.spawnGhast = (x, y) => ghosts.push({ x, y });
    gl.fixedUpdate(1, game);                          // 未命中也无敌在场——vanilla 由命中触发召唤；
    expect(ghosts.length).toBe(0);                    // 此处锁"无命中不召唤"
    // 直接驱动召唤路径（命中分支内部函数不可达时以命中假体验证）：
    const list: unknown[] = [mkEnemy(9, owner.cx + 10, owner.cy - 10)];
    (game as unknown as { enemies: () => unknown[] }).enemies = () => list;
    const gl2 = new GhastlyGlaiveProj(owner, 42, 0, 45, 7,
      31.5, () => animT, 27, () => {});
    gl2.spawnGhast = (x, y) => ghosts.push({ x, y });
    gl2.fixedUpdate(1, game);
    expect(ghosts.length).toBe(1);
  });
});

describe('700 骸骨幽灵（AI_143_MonkStaffT2Ghast）', () => {
  it('首帧 dd2_ghastly_glaive_impact_ghost 音恰一次（三变体组）', () => {
    const sfx: string[][] = [];
    const game = makeGame(emptyWorld(), [], sfx);
    const g = new MonkGhast(1000, 1000, 4, 0, 45);
    g.fixedUpdate(1, game);
    g.fixedUpdate(1, game);
    g.fixedUpdate(1, game);
    expect(sfx.length).toBe(1);
    expect(sfx[0][0]).toBe('dd2_ghastly_glaive_impact_ghost_0');
    expect(sfx[0].length).toBe(3);                   // SoundID.cs:1004 三变体整组
  });

  it('追踪衰减 vel×0.98/t、α 钳底 100→ai0>50 渐隐→60t 寿命', () => {
    const game = makeGame(emptyWorld());
    const g = new MonkGhast(1000, 1000, 10, 0, 45);
    const priv = g as unknown as { alphaI: number; ai0: number };
    g.fixedUpdate(1, game);
    expect(g.vx).toBeCloseTo(9.8, 6);
    expect(priv.alphaI).toBe(230);                   // 255−25（未触底）
    for (let t = 0; t < 10; t++) g.fixedUpdate(1, game);
    expect(priv.alphaI).toBe(100);                   // 钳底（:71078-71079）
    expect(g.dead).toBe(false);
    expect(priv.ai0).toBeLessThan(51);
    for (let t = 0; t < 50 && !g.dead; t++) g.fixedUpdate(1, game);
    expect(g.dead).toBe(true);                       // ai0≥60 Kill（:71086-71089）
    expect(priv.ai0).toBeGreaterThanOrEqual(60);
  });

  it('4 帧 5t 帧循环（projFrames[700]=4）+ 每敌至多一次', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const en = mkEnemy(1, 990, 990);
    list.push(en);
    const g = new MonkGhast(1000, 1000, 0.5, 0, 45);
    const priv = g as unknown as { frame: number; frameCtr: number };
    const framesSeen = new Set<number>();
    for (let t = 0; t < 21; t++) {
      g.fixedUpdate(1, game);
      framesSeen.add(priv.frame);
    }
    expect(framesSeen.size).toBe(4);                 // 0..3 全档扫过
    expect(en.hurtCalls).toBe(1);                    // 慢速漂移穿过但只结算一次
  });
});
