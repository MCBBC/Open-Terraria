// 蓝队 R1 复核修复批（2026-08-23）回归测试：
//   R1-01 小丑 109 炸弹链（75 HappyBomb 投掷 + 378 咬齿炸弹召唤 + 视野门）
//   R1-02 真眼 400 悬停分离 1457 参数（1.25/<100,曾 1456 的 0.25/150）
//   R1-04 鹿角怪 case1/4 尖叫入态首拍（ai1==0,曾误 30）
//   R1-05 影手 965 四变体 Next(4)（曾 hint%3 → 390 螺旋恒不可达）
//   R1-06 月总核心部件缺失门 bossFled 语义（曾直写 dead 误触发击败记账）
//   R1-08 真眼攻击 1 瞳孔末 19t 冻结（:43033-43040 门）
//   R1-10 FTW onFire 豁免（type1 && ai1==8 体内火把史莱姆免着火 DoT,:92733）
// 参照：Terarria1457 NPC.cs / Projectile.cs / Main.cs（行号见各断言注释）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { deerclopsAI, InsanityShadowProj } from '../src/entities/bossAI_deerclops';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { BuffState } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

const W = 220, H = 160, GROUND = 70;
const STONE = TILE_BY_KEY['stone'] ?? TILE_BY_KEY['dirt'] ?? 1;

function makeWorld(): World {
  const w = new World(W, H, 11, 'redblue-r1');
  w.groundLevel = 50; w.rockLevel = 90;
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y < H; y++) w.store.setTile(x, y, STONE);
  }
  return w;
}

interface Harness {
  hooks: GameHooks; enemies: Enemy[]; projectiles: unknown[];
  em: { nextId: number; add: (e: unknown, b: string) => void };
  player: Player; sfxFiles: string[][];
}
function makeHooks(world: World, playerAt: { x: number; y: number }): Harness {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const sfxFiles: string[][] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e as never);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: new BuffState(),
  } as unknown as Player;
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (...args: unknown[]) => { sfxFiles.push(args[0] as string[]); },
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, em, player, sfxFiles };
}

function spawn(h: Harness, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

function tick(h: Harness, n: number, only?: Enemy[]): void {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------
// R1-02 真眼悬停分离（1457 NPC.cs:42997 num8=1.25 / :43001 <100f;
//        1456 :38323 num1302=0.25 / :38330 <150f——曾按 1456 移植）
// ---------------------------------------------------------------------------
describe('R1-02 真眼 400 悬停分离参数', () => {
  it('同族 100px 内排斥推力 = ±1.25/轴（1457）;曾 0.25', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 40 });
    const core = spawn(h, 398, 100, 30);
    core.bInit = true; core.ai0 = 0;
    // 两眼重合于悬停伺服目标（玩家中心上方 200px）→ 伺服项为 0,位移纯显排斥项
    const tx0 = h.player.cx, ty0 = h.player.cy - 200;
    const a = spawn(h, 400, 100, 40); a.ai3 = core.id; a.ai0 = 0; a.ai1 = 0;
    a.x = tx0 - a.w / 2; a.y = ty0 - a.h / 2; a.vx = 0; a.vy = 0;
    const b = spawn(h, 400, 100, 40); b.ai3 = core.id; b.ai0 = 0; b.ai1 = 0;
    b.x = a.x; b.y = a.y; b.vx = 0; b.vy = 0;
    tick(h, 1, [a, b]);
    // 同位 → 排斥 ±1.25（b 后 tick 时 a 已位移,方向相反属 tick 序伪影,量值不变）
    expect(Math.abs(a.vx)).toBeCloseTo(1.25, 6);
    expect(Math.abs(b.vx)).toBeCloseTo(1.25, 6);
  });
  it('100px 外不排斥（1457 门 <100;曾 150 → 120px 仍互推）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 40 });
    const core = spawn(h, 398, 100, 30);
    core.bInit = true; core.ai0 = 0;
    const tx0 = h.player.cx, ty0 = h.player.cy - 200;
    const a = spawn(h, 400, 100, 40); a.ai3 = core.id; a.ai0 = 0; a.ai1 = 0;
    a.x = tx0 - a.w / 2; a.y = ty0 - a.h / 2; a.vx = 0; a.vy = 0;
    const b = spawn(h, 400, 100, 40); b.ai3 = core.id; b.ai0 = 0; b.ai1 = 0;
    b.x = a.x + 120; b.y = a.y; b.vx = 0; b.vy = 0;   // 120px:旧门(150)内/新门外
    tick(h, 1, [a]);
    expect(a.vx).toBe(0);                              // 伺服零 + 无排斥
  });
});

// ---------------------------------------------------------------------------
// R1-08 真眼攻击 1 瞳孔冻结门（1457 NPC.cs:43033-43040 num3 < num-14-5）
// ---------------------------------------------------------------------------
describe('R1-08 真眼幻影矢瞳孔末 19t 冻结', () => {
  it('槽时 t≥71（ai1≥124）瞳角/开度不再推进;t<71 仍跟踪', () => {
    const h = makeHooks(makeWorld(), { x: 60, y: 96 });   // 玩家在左侧 → lai0 ≈ π
    const core = spawn(h, 398, 100, 30);
    core.bInit = true; core.ai0 = 0;
    const eye = spawn(h, 400, 100, 60);
    eye.ai3 = core.id; eye.ai0 = 0; eye.ai1 = 0;
    tick(h, 124, [eye]);                                  // 推进到攻击 1 槽 t=71
    expect(eye.ai0).toBe(1);
    const frozenAngle = eye.lai0, frozenOpen = eye.lai1;
    // 玩家瞬移到右侧:冻结窗内瞳角不得跟随
    h.player.x = 140 * TILE; h.player.cx = 140 * TILE + 10;
    tick(h, 5, [eye]);
    expect(eye.lai0).toBe(frozenAngle);
    expect(eye.lai1).toBe(frozenOpen);
  });
});

// ---------------------------------------------------------------------------
// R1-04/R1-11 鹿角怪 case1/4（1457 NPC.cs:44666-44691）
// ---------------------------------------------------------------------------
describe('R1-04 鹿角怪尖刺态尖叫时机', () => {
  it('case 1 前向尖刺:入态首拍(ai1==0)尖叫,非 30t', () => {
    const h = makeHooks(makeWorld(), { x: 106, y: GROUND - 4 });
    const e = spawn(h, 668, 100, GROUND - 10);
    e.y = GROUND * TILE - e.h; e.ai0 = 1; e.ai1 = 0; e.lai1 = 3;
    tick(h, 1, [e]);
    expect(h.sfxFiles.length).toBe(1);                    // 首 tick 即叫
    expect(h.sfxFiles[0]).toContain('deerclops_scream_0');
  });
  it('case 4 双侧尖刺:入态首拍尖叫 + 每 tick 重索敌（:44687 TargetClosest）', () => {
    const h = makeHooks(makeWorld(), { x: 94, y: GROUND - 4 });   // 玩家在左
    const e = spawn(h, 668, 100, GROUND - 10);
    e.y = GROUND * TILE - e.h; e.ai0 = 4; e.ai1 = 0;
    tick(h, 1, [e]);
    expect(h.sfxFiles.length).toBe(1);
    expect(e.facing).toBe(-1);
    // 玩家穿到背后 → 下一 tick 朝向翻转（原版每 tick TargetClosest）
    h.player.x = 112 * TILE; h.player.cx = 112 * TILE + 10;
    tick(h, 1, [e]);
    expect(e.facing).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// R1-05 影手 965 四变体（1457 Projectile.cs:43178-43265 RandomizeInsanityShadowFor）
// ---------------------------------------------------------------------------
describe('R1-05 影手变体选择', () => {
  it('Next(4) 均匀四变体——390 螺旋可达（曾 hint%3 恒不可达）', () => {
    const tgt = { cx: 5000, cy: 3000, vx: 0, vy: 0 };
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const p = new InsanityShadowProj(tgt, 10);
      seen.add((p as unknown as { ai0: number }).ai0);
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(180)).toBe(true);
    expect(seen.has(300)).toBe(true);
    expect(seen.has(390)).toBe(true);                     // 关键:螺旋变体可达
  });
  it('变体出生公式:环绕/俯冲距目标 200px、直插初速 4、螺旋 ai1=旋率', () => {
    const tgt = { cx: 5000, cy: 3000, vx: 0, vy: 0 };
    let sawRing = false, sawDive = false, sawStraight = false, sawSpiral = false;
    for (let i = 0; i < 600; i++) {
      const p = new InsanityShadowProj(tgt, 10) as unknown as {
        ai0: number; ai1: number; cx: number; cy: number; vx: number; vy: number;
      };
      const d = Math.hypot(p.cx - tgt.cx, p.cy - tgt.cy);
      if (p.ai0 === 180) { sawRing = true; expect(Math.abs(d - 200)).toBeLessThan(1e-6); }
      else if (p.ai0 === 300) { sawDive = true; expect(Math.abs(d - 200)).toBeLessThan(1e-6); }
      else if (p.ai0 === 0) {
        sawStraight = true;
        expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(4, 6);  // 200/50（num4+10 门）
      } else {
        sawSpiral = true;
        expect(Math.abs(p.ai1)).toBeLessThanOrEqual(Math.PI / 2);  // num8 ∈ ±π/2
      }
    }
    expect(sawRing && sawDive && sawStraight && sawSpiral).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1-01 小丑 109 炸弹链（1457 NPC.cs:60394-60425）
// ---------------------------------------------------------------------------
describe('R1-01 小丑 109 攻击链', () => {
  function clown(h: Harness): Enemy {
    const e = spawn(h, 109, 100, GROUND - 10);
    e.y = GROUND * TILE - e.h;
    e.ai2 = 61;                                            // :60403 门已过
    return e;
  }
  it('4/5 掷 → 投 75 HappyBomb（伤 80/timeLeft 300,速 Next(3,8)×dir / Next(-8,-5))', () => {
    const h = makeHooks(makeWorld(), { x: 106, y: GROUND - 4 });
    const e = clown(h);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);        // Next(5)=4≠0 → 炸弹支
    tick(h, 1, [e]);
    const proj = h.projectiles.find((p) => (p as { projId?: number }).projId === 75) as
      { projId: number; damage: number; life: number; vx: number; vy: number; hostile: boolean } | undefined;
    expect(proj).toBeTruthy();
    expect(proj!.damage).toBe(80);                         // :60414
    expect(proj!.life).toBe(300);                          // :60416
    expect(proj!.hostile).toBe(true);
    expect(proj!.vx).toBeCloseTo(7 * e.facing, 6);         // Next(3,8)=3+⌊.99×5⌋=7
    expect(proj!.vy).toBeCloseTo(-6, 6);                   // Next(-8,-5)=-8+⌊.99×3⌋=-6
    expect(e.ai2).toBe(0);                                 // :60417
  });
  it('1/5 掷且场上无 378 → 召咬齿炸弹 378 + ai2=-120 长冷却（:60420-60423）', () => {
    const h = makeHooks(makeWorld(), { x: 106, y: GROUND - 4 });
    const e = clown(h);
    vi.spyOn(Math, 'random').mockReturnValue(0);           // Next(5)=0 → 召唤支
    tick(h, 1, [e]);
    const bomb = h.enemies.find((n) => n.vanillaId === 378);
    expect(bomb).toBeTruthy();
    expect(bomb!.y + bomb!.h).toBeCloseTo(e.y + 4, 6);     // NewNPC Bottom 锚(:81594)
    expect(e.ai2).toBe(-120);
  });
  it('超 AI_GlobalFiringDistanceCheck 视野（:60405）不投掷且 ai2 归零', () => {
    const h = makeHooks(makeWorld(), { x: 100 + 920, y: GROUND - 4 });   // >910px 半轴
    const e = clown(h);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    tick(h, 1, [e]);
    expect(h.projectiles.length).toBe(0);
    expect(e.ai2).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R1-06 月总核心部件缺失门（1457 NPC.cs:41682-41701 active=false 直清;
//        Game boss 槽 dead → 击败流程,须 bossFled 豁免——同 ai0=3 分支）
// ---------------------------------------------------------------------------
describe('R1-06 月总核心部件缺失门', () => {
  it('ai0=0 且部件 <3 → dead 且 bossFled=true(不触发击败记账)', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 40 });
    const core = spawn(h, 398, 100, 30);
    core.bInit = true; core.ai0 = 0;                       // 跳过出生演出,无部件
    tick(h, 1, [core]);
    expect(core.dead).toBe(true);
    expect((core as unknown as { bossFled?: boolean }).bossFled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1-10 FTW onFire 豁免（1457 NPC.cs:92733 = 1456 :92616 同款）
// ---------------------------------------------------------------------------
describe('R1-10 FTW 体内火把史莱姆免着火 DoT', () => {
  it('getGoodWorld 下 type1 && ai1==8(火把)不着火;ai1=0 照烧', () => {
    const wA = makeWorld(); wA.seedFlags = { getGoodWorld: true } as never;
    const hA = makeHooks(wA, { x: 106, y: GROUND - 4 });
    const torch = spawn(hA, 1, 100, GROUND - 4);
    torch.y = GROUND * TILE - torch.h; torch.ai1 = 8; torch.onFireT = 120;
    const wB = makeWorld(); wB.seedFlags = { getGoodWorld: true } as never;
    const hB = makeHooks(wB, { x: 106, y: GROUND - 4 });
    const plain = spawn(hB, 1, 100, GROUND - 4);
    plain.y = GROUND * TILE - plain.h; plain.ai1 = 0; plain.onFireT = 120;
    tick(hA, 30, [torch]);
    tick(hB, 30, [plain]);
    expect(torch.hp).toBe(torch.maxHp);                    // 豁免:零火伤
    expect(plain.hp).toBeLessThan(plain.maxHp);            // 4HP/s × 0.5s = 2
  });
});
