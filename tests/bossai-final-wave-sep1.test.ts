// 终清波·bossAI 三件残留近似 1:1 清偿回归(2026-09-01)
// 覆盖面:
//   ① 女皇侧弹伤五元组 ForProjectiles Remap(NPC.cs:46495-46499,曾按经典二元档硬编码)
//   ② 923 太阳舞 CastLightOpen 光路精确式(:45818-45826 + DelegateMethods.cs:729-744)
//   ③ 石巨人断臂 Dust31×双臂流+1/10 火星(:19626-19663)/拳聚能向心收敛 228(:19374-19390)/
//      冲拳焰尾 306 OurFavoriteColor scale2(:19455-19460)/自由头排焰双流 228(:31796-31812)
//   ④ dd2 电光尘双支(:66985-67014)
//   ⑤ dd2 胜利尘涡 num1499 相位爬升+12 拍星爆(:41214-41271)
//   ⑥ dd2 传送门循环轨位置化(startTrackedLoop atten/pan,NPC.cs:41403-41465)
// RNG 注入:Math.random 用顺序队列驱动(队列空后回退 .5),按注入序列做闭式数值断言。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { golemAI, golemFistAI, golemHeadAI } from '../src/entities/bossAI_golem';
import { empressOfLightAI, SunDanceBeam } from '../src/entities/bossAI_lategame';
import { eterniaCrystalAI, dd2LightningBugAI, lanePortalAI } from '../src/entities/bossAI_dd2';
import type { GameHooks } from '../src/entities/types';

// ---------------------------------------------------------------------------
// 公共件
// ---------------------------------------------------------------------------

interface DustCall {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number;
  color: unknown;
  scale: number; noGravity: boolean; perfect: boolean;
  /** 入池尘引用(调用侧逐字段修型写入) */
  d: { alpha: number; vx: number; vy: number; fadeIn: number; scale: number;
    noGravity: boolean; noLight: boolean };
}

function makeHooks(difficulty = 1): {
  hooks: GameHooks; enemies: unknown[]; projectiles: unknown[];
  dusts: DustCall[]; lights: Array<{ x: number; y: number; r: number; g: number; b: number }>;
  loops: Array<{ file: string; vol: number; x: number; y: number; ops: string[]; vols: number[] }>;
  player: { x: number; y: number; w: number; h: number };
} {
  const enemies: unknown[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e);
      else projectiles.push(e);
    },
  };
  const dusts: DustCall[] = [];
  const lights: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];
  const loops: Array<{ file: string; vol: number; x: number; y: number; ops: string[]; vols: number[] }> = [];
  const w = new World(160, 120, 7, 'final-wave');
  (w as unknown as { difficulty: number }).difficulty = difficulty;
  w.clock.timeOfDay = 0;          // 午夜 = 非白天(女皇不暴怒)
  // 底板(y=100 行实心)——石巨人本体重力积分落地,避免下坠漂移污染锚点
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 100, 1, 0, 0);
  const player = {
    x: 28 * TILE, y: 40 * TILE, w: 20, h: 42,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, iframes: 0,
    buffs: { apply: () => {}, has: () => false },
    useTime: 1, equipStats: {}, addDPS: () => {},
  };
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnParticles: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    notifyInventoryChanged: () => {},
    spawnDust: (
      x: number, y: number, ww: number, hh: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: unknown = null, scale = 1,
      ng = false, perfect = false,
    ) => {
      const d = { alpha, vx: sx, vy: sy, fadeIn: 0, scale, noGravity: false, noLight: false };
      dusts.push({ x, y, w: ww, h: hh, type, sx, sy, alpha, color, scale, noGravity: ng, perfect, d });
      return d;
    },
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => {
      lights.push({ x, y, r, g, b });
    },
    startTrackedLoop: (file: string, vol: number, x: number, y: number) => {
      const ops: string[] = []; const vols: number[] = [];
      loops.push({ file, vol, x, y, ops, vols });
      return {
        stop: () => ops.push('stop'),
        setPos: () => ops.push('pos'),
        setVolume: (v: number) => { ops.push('vol'); vols.push(v); },
      };
    },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, dusts, lights, loops, player };
}

/** GetLerpValue(clamped) 克隆 */
const glv = (from: number, to: number, v: number): number =>
  from === to ? (v < from ? 0 : 1) : Math.max(0, Math.min(1, (v - from) / (to - from)));

/** Math.random 顺序注入(队列空回退 .5) */
function driveRandom(seq: number[]): void {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() =>
    i < seq.length ? seq[i++] : 0.5);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ① 女皇五元组 Remap(NPC.cs:46495-46499 GetAttackDamage_ForProjectiles)
// ---------------------------------------------------------------------------

describe('女皇侧弹伤五元组 Remap(NPC.cs:46455-46505)', () => {
  function stepCase(ai0: number, difficulty: number, phase2 = false, ticks = 4) {
    const f = makeHooks(difficulty);
    const e = Enemy.fromVanilla(636, 100 * TILE, 40 * TILE)!;
    f.enemies.push(e);
    e.bInit = true;
    e.spawnAlpha = 0;
    // npc.difficulty 测试面直置(实机经 bindScaleStatsWorld 由世界难度驱动)
    (e as unknown as { difficulty: number }).difficulty = difficulty;
    e.ai0 = ai0;
    e.ai1 = 0;
    e.ai2 = 0;
    e.ai3 = phase2 ? 1 : 0;
    for (let t = 0; t < ticks; t++) {
      driveRandom([0.25]);                       // 态内速度散布掷(fallback .5 续)
      empressOfLightAI(e, f.hooks, f.hooks.player as never);
    }
    return f;
  }
  const damagesOf = (f: ReturnType<typeof makeHooks>, projId: number): number[] =>
    (f.projectiles as Array<{ damage?: number; projId?: number }>)
      .filter((p) => p.projId === projId)
      .map((p) => p.damage ?? -1);

  it('case2 彩虹射线 873 = num8:p1 R(45,30)/p2 R(50,35)/master·legendary 钳 expert', () => {
    expect(damagesOf(stepCase(2, 1), 873)).toContain(45);
    expect(damagesOf(stepCase(2, 1, true), 873)).toContain(50);
    expect(damagesOf(stepCase(2, 2), 873)).toContain(30);
    expect(damagesOf(stepCase(2, 2, true), 873)).toContain(35);
    expect(damagesOf(stepCase(2, 3), 873)).toContain(30);        // clamp
    expect(damagesOf(stepCase(2, 4, true), 873)).toContain(35);  // clamp
  });

  it('case7 光枪回环 919 = num7:classic p1 R(70,65)=70 / classic p2 R(65,30)→normal 档 65 / expert p2 →30', () => {
    expect(damagesOf(stepCase(7, 1), 919)).toContain(70);
    expect(damagesOf(stepCase(7, 1, true), 919)).toContain(65);
    expect(damagesOf(stepCase(7, 2, true), 919)).toContain(30);
  });

  it('case4 光枪墙 919 = num6:p1(50,30)/expert·p2(60,35)', () => {
    expect(damagesOf(stepCase(4, 1), 919)).toContain(50);
    expect(damagesOf(stepCase(4, 2, true), 919)).toContain(35);
  });

  it('case5 永恒彩虹 872 = num9:p1 R(45,30)=45/expert p2 R(50,35)=35', () => {
    expect(damagesOf(stepCase(5, 1), 872)).toContain(45);
    expect(damagesOf(stepCase(5, 2, true), 872)).toContain(35);
  });

  it('case6 太阳舞 923 = num10:p1 R(50,35)=50/expert p2 R(60,40)=40', () => {
    expect(damagesOf(stepCase(6, 1), 923)).toContain(50);
    expect(damagesOf(stepCase(6, 2, true), 923)).toContain(40);
  });
});

// ---------------------------------------------------------------------------
// ② 923 光路精确式
// ---------------------------------------------------------------------------

describe('SunDanceBeam 束身光路(CastLightOpen 13 点全采样+实心豁免,:45818-45826)', () => {
  it('13 点采样/步进 800·scale/12/hsl(l=.85) 色;实心格豁免', () => {
    const f = makeHooks();
    const boss = Enemy.fromVanilla(636, 20 * TILE, 40 * TILE)!;
    f.enemies.push(boss);
    const beam = new SunDanceBeam(boss.cx, boss.cy - 100, 0, boss.id, 50, false);
    f.projectiles.push(beam);
    // 预热至 scaleV 饱和(la0∈[20,120] 恒 1),采样几何冻结便于断言
    for (let t = 0; t < 22; t++) beam.fixedUpdate(1 / 60, f.hooks);
    f.lights.length = 0;
    beam.fixedUpdate(1 / 60, f.hooks);       // 光路段(scaleV=1,step=800/12)
    expect(f.lights.length).toBe(13);
    // 采样点 0=center(已锚到本体 Center)
    expect(Math.abs(f.lights[0].x - boss.cx)).toBeLessThan(1e-6);
    expect(Math.abs(f.lights[0].y - boss.cy)).toBeLessThan(1e-6);
    // 第 6 点沿 +X(ang=0):位移 = 6·800·1/12 = 400
    const step6 = f.lights[6].x - f.lights[0].x;
    expect(Math.abs(step6 - 400)).toBeLessThan(1e-4);
    // 色:hslToRgb(hue=(baseAng/2π+la0/180)%1,1,.85)(逐字节取整)/255 —— la0 为私有,
    // 以"存在某 la0 使三元组全等"证明引擎走同一 hsl 常式(3600 点全扫亦极廉价)
    const matchHue = (() => {
      for (let l0 = 0; l0 < 180; l0++) {
        const c = hslL085((l0 / 180) % 1);
        if (Math.abs(c[0] / 255 - f.lights[6].r) < 1e-4
          && Math.abs(c[1] / 255 - f.lights[6].g) < 1e-4
          && Math.abs(c[2] / 255 - f.lights[6].b) < 1e-4) return true;
      }
      return false;
    })();
    expect(matchHue).toBe(true);
    // 实心豁免(CastLightOpen):第 6 采样格置实心 → 该点无光(其余 12 点仍在)
    const sx6 = f.lights[6].x, sy6 = f.lights[6].y;
    f.hooks.world.store.setTileSilent(Math.floor(sx6 / TILE), Math.floor(sy6 / TILE), 1, 0, 0);
    f.lights.length = 0;
    beam.fixedUpdate(1 / 60, f.hooks);
    expect(f.lights.length).toBe(12);
    expect(f.lights.some((l) => Math.abs(l.x - sx6) < 1 && Math.abs(l.y - sy6) < 1)).toBe(false);
  });
});

/** Main.hslToRgb(h,1,.85)(仓内 AuroraSky 同式独立实现,供测试闭式核对) */
function hslL085(hue: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    let x = c;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (6 * x < 1) return t1 + (t2 - t1) * 6 * x;
    if (2 * x < 1) return t2;
    if (3 * x < 2) return t1 + (t2 - t1) * (2 / 3 - x) * 6;
    return t1;
  };
  const s = 1, l = 0.85;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t = 2 * l - q;
  return [
    Math.round(hue2rgb(hue + 1 / 3, t, q) * 255),
    Math.round(hue2rgb(hue, t, q) * 255),
    Math.round(hue2rgb(hue - 1 / 3, t, q) * 255),
  ];
}

// ---------------------------------------------------------------------------
// ③ 石巨人尘埃族
// ---------------------------------------------------------------------------

describe('石巨人尘埃族精确化(NPC.cs 1458 :19626/:19374/:19455/:31796)', () => {
  function cycle(vals: number[], period = vals.length): void {
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => vals[i++ % period] ?? 0.5);
  }

  it('断臂尘:每 tick 双臂各一粒 Dust31(v×0.2/vy−/fadeIn)+左侧走 1/10 火星支', () => {
    const f = makeHooks();
    const body = Enemy.fromVanilla(245, 40 * TILE, 38 * TILE)!;
    f.enemies.push(body);
    body.bInit = false;
    driveRandom([]);                          // 首拍:部件生成(localAI[0]==0)等固定支
    golemAI(body, f.hooks, f.hooks.player as never);
    // 部件标 dead → flag2/flag3(双拳缺位)分支
    for (const p of f.enemies as Array<{ vanillaId?: number; dead?: boolean }>) {
      if (p.vanillaId === 247 || p.vanillaId === 248 || p.vanillaId === 246) p.dead = true;
    }
    body.bInit = true;                        // 防重生成部件(localAI[0] 档)
    f.dusts.length = 0;
    const cxBefore = body.cx, cyBefore = body.cy;   // 尘段在物理积分前跑,先取锚位快照
    cycle([0.5, 0.5, 0.5, 0.001, 0.6,         // 左臂 31 三掷+火星门(<0.1 中)+Next(20)!=0 支(.6 过)
           0.5, 0.5, 0.5, 0.999]);            // 右臂 31 三掷+火星门(.999 不中)
    golemAI(body, f.hooks, f.hooks.player as never);
    expect(f.dusts.filter((d) => d.type === 31).length).toBe(2);
    const left = f.dusts.find((d) => d.type === 31 && d.x < cxBefore)!;
    const right = f.dusts.find((d) => d.type === 31 && d.x > cxBefore)!;
    expect(left.x).toBeCloseTo(cxBefore - 84, 4);      // −80·sc−4(NewDust 盒左上)
    expect(right.x).toBeCloseTo(cxBefore + 58, 4);     // +62·sc−4
    expect(left.y).toBeCloseTo(cyBefore - 13, 4);      // cy−9−4
    expect(f.dusts.filter((d) => d.type === 6).length).toBe(1);
    const spark = f.dusts.find((d) => d.type === 6)!;
    expect(spark.d.noGravity).toBe(true);
    expect(spark.d.scale).not.toBe(spark.scale);       // scale *= 1+Next(10)·0.1 已写入
    // 31 尘:v×0.2(trap 初速 0 → vx 仍 0)、vy -= 0.5+Next(10)·0.1 必负、fadeIn ∈ [.5,1.5)
    const d31 = f.dusts.find((d) => d.type === 31)!;
    expect(d31.d.vx).toBe(0);
    expect(d31.d.vy).toBeLessThan(-0.5);
    expect(d31.d.fadeIn).toBeGreaterThanOrEqual(0.5);
    expect(d31.d.alpha).toBeGreaterThan(100);          // α += Next(100)(快照面读入池尘)
  });

  function golemStage(): {
    f: ReturnType<typeof makeHooks>; body: Enemy; fist: Enemy;
    pin: () => void;
  } {
    const f = makeHooks();
    const body = Enemy.fromVanilla(245, 40 * TILE, 98 * TILE)!;
    f.enemies.push(body);
    body.bInit = true;
    body.ai0 = 0; body.ai1 = 0; body.hp = body.maxHp;
    const fist = Enemy.fromVanilla(247, 40 * TILE, 98 * TILE)!;
    f.enemies.push(fist);
    // 钉回左肩锚(body.Center+(−84·sc,−9·sc))——归位距离≈0,直接吃蓄力计时
    const pin = (): void => {
      fist.x = body.cx + body.vx - 84 - fist.w / 2;
      fist.y = body.cy + body.vy - 9 - fist.h / 2;
      fist.vx = 0; fist.vy = 0;
    };
    pin();
    return { f, body, fist, pin };
  }

  it('拳聚能(state1 ai1≤15):每 tick 一粒 228/NewDustPerfect 向心,fadeIn=1.5/scale=0.5/noGravity', () => {
    const { f, body, fist, pin } = golemStage();
    f.player.x = 34 * TILE;                            // 玩家偏左 → 左拳 sideOk(出冲门)
    // 64 拍推进:60t 贴肩蓄满(ai1 每拍 +num(经典=1)) → 进 state1;后 4 拍已发尘(预lude 内清)
    for (let t = 0; t < 64; t++) {
      driveRandom([]);
      golemAI(body, f.hooks, f.hooks.player as never);
      pin();
      golemFistAI(fist, f.hooks, f.hooks.player as never);
    }
    f.dusts.length = 0;
    for (let t = 0; t < 6; t++) {                      // 蓄力期 ai1≤15 每 tick 一粒向心尘
      driveRandom([0.3, 0.4]);                         // circular 两轴样本
      golemFistAI(fist, f.hooks, f.hooks.player as never);
      pin();                                           // 持续贴肩防 state 推进?不 —— 放行推进:
    }
    const charge = f.dusts.filter((d) => d.type === 228);
    expect(charge.length).toBeGreaterThanOrEqual(4);   // ai1 1..15 窗口内至少前几拍命中
    expect(charge.every((d) => d.perfect)).toBe(true);
    expect(charge.every((d) => d.d.fadeIn === 1.5)).toBe(true);
    expect(charge.every((d) => Math.abs(d.d.scale - 0.5) < 1e-6)).toBe(true);
    expect(charge.every((d) => d.d.noGravity)).toBe(true);
    // 向心形态:出生位必落在本体附近 ±110px 带(v3 半径 80×0.95+jitter20)
    expect(charge.every((d) => Math.abs(d.x - body.cx) < 110)).toBe(true);
    expect(charge.every((d) => Math.abs(d.y - body.cy) < 110)).toBe(true);
  });

  it('冲拳焰尾(state2 起):拍内 1/2 一粒 306/perfect/scale=2/OurFavoriteColor(255,231,69)', () => {
    const { f, body, fist, pin } = golemStage();
    f.player.x = 36 * TILE;                            // 左侧 ~600px <700:冲出后仍在轴判定带
    for (let t = 0; t < 96; t++) {                     // 60 归位 + 30 蓄力 + 冲拳初段
      driveRandom([0.001]);                            // Next(2)==0 常中(蓄力期的 circular 同吃)
      golemAI(body, f.hooks, f.hooks.player as never);
      pin();
      golemFistAI(fist, f.hooks, f.hooks.player as never);
    }
    f.dusts.length = 0;
    let preVx = 0; let hit = false;
    for (let t = 0; t < 10 && !hit; t++) {
      preVx = Math.abs(fist.vx);
      driveRandom([0.001]);
      golemFistAI(fist, f.hooks, f.hooks.player as never);
      pin();
      if (f.dusts.some((d) => d.type === 306)) hit = true;
    }
    expect(hit).toBe(true);                            // state2 尾焰支真实可达
    const tail = f.dusts.find((d) => d.type === 306)!;
    expect(tail.perfect).toBe(true);
    expect(tail.color).toEqual({ r: 255, g: 231, b: 69, a: 255 });   // Main.OurFavoriteColor(:886)
    expect(tail.d.scale).toBe(2);                      // NewDustPerfect(...).scale = 2f
    expect(Math.abs(tail.sx)).toBeLessThanOrEqual(preVx / 2 + 21);   // v×0.5+抖动(Circular20)
  });

  it('自由头排焰双流:每 tick 两粒 228(perfect/noGravity;流②fadeIn=0,scale∈[0.7,1.2])', () => {
    const f = makeHooks();
    const body = Enemy.fromVanilla(245, 50 * TILE, 38 * TILE)!;
    f.enemies.push(body);                              // 锚主存活面(缺锚 → 头自杀早退)
    body.bInit = true;
    const head = Enemy.fromVanilla(249, 50 * TILE, 36 * TILE)!;
    f.enemies.push(head);
    head.bInit = true;
    f.dusts.length = 0;
    driveRandom([0.99, 0.25, 0.75, 0.3, 0.5, 0.9, 0.2]);
    golemHeadAI(head, f.hooks, null);                  // player=null 也恒跑(aiStyle48 无门)
    const exhaust = f.dusts.filter((d) => d.type === 228);
    expect(exhaust.length).toBe(2);
    expect(exhaust.every((d) => d.perfect)).toBe(true);
    expect(exhaust.every((d) => d.d.noGravity)).toBe(true);
    expect(exhaust[1].d.fadeIn).toBe(0);
    expect(exhaust[1].d.scale).toBeGreaterThanOrEqual(0.7);
    expect(exhaust[1].d.scale).toBeLessThanOrEqual(1.2);
    // 流① 位:Bottom+(±22·sc,−22·sc)
    expect(Math.abs(Math.abs(exhaust[0].x - head.cx) - 22)).toBeLessThan(1e-6);
    expect(Math.abs(exhaust[0].y - (head.y + head.h - 22))).toBeLessThan(1e-6);
    expect(exhaust[1].y).toBeLessThan(head.y + head.h);// 流② 底边上方带(−8..−12·sc)
    // FTW 整块关闭(seedFlags 为属性视图对象)
    (f.hooks.world.seedFlags as unknown as Record<string, boolean>).getGoodWorld = true;
    f.dusts.length = 0;
    golemHeadAI(head, f.hooks, null);
    expect(f.dusts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ④ dd2 电光尘双支(:66985-67014)
// ---------------------------------------------------------------------------

describe('dd2 荧光虫电光尘', () => {
  it('支① Next(15)=direct 半宽盒 272(scale .65/vy−0.8);支② Next(80)=Center 双粒 perfect×{1.1,1.5}', () => {
    const f = makeHooks();
    const bug = Enemy.fromVanilla(578, 40 * TILE, 40 * TILE)!;
    f.enemies.push(bug);
    bug.bInit = true;
    for (let t = 0; t < 61; t++) {                     // 烧过出生烟窗(60t,<60 内 maxValue 门)
      driveRandom([]);
      dd2LightningBugAI(bug, f.hooks, null);
    }
    f.dusts.length = 0;
    driveRandom([0.01,                                 // <1/15 → 支①
                 0.005, 0.25,                          // <1/80 → 支②;r3 = 环角 rand
                 0.7]);                                // 余掷 fallback 起点前的过渡
    dd2LightningBugAI(bug, f.hooks, null);
    const zaps = f.dusts.filter((d) => d.type === 272);
    expect(zaps.length).toBe(3);
    const direct = zaps.find((d) => !d.perfect)!;
    expect(direct.w).toBe(bug.w / 2);                  // 半宽盒
    expect(direct.d.scale).toBeCloseTo(0.65, 6);       // 后置 scale 覆写
    expect(direct.d.vy).toBeCloseTo(-0.8, 6);          // velocity.Y -= 0.8
    const perf = zaps.filter((d) => d.perfect);
    expect(perf.length).toBe(2);
    const ang = 0.25 * Math.PI * 2;
    expect(perf[0].sx).toBeCloseTo(Math.cos(ang) * 1.1, 6);
    expect(perf[0].sy).toBeCloseTo(Math.sin(ang) * 1.1, 6);
    expect(perf[1].sx).toBeCloseTo(Math.cos(ang) * 1.5, 6);
    expect(perf.every((d) => d.d.noGravity)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 胜利演出尘涡/星爆(:41214-41271)
// ---------------------------------------------------------------------------

describe('dd2 永晶胜利:尘涡 num1499 相位爬升 + 12 拍星爆', () => {
  function crystalAt(ai0: number): { f: ReturnType<typeof makeHooks>; c: Enemy } {
    const f = makeHooks();
    const c = Enemy.fromVanilla(548, 100 * TILE, 30 * TILE)!;
    f.enemies.push(c);
    c.bInit = true;
    c.ai1 = 2;
    c.ai0 = ai0;
    return { f, c };
  }

  it('早期 num1499=0.99:roll<0.99 全免(零尘);晚期 0.33:9 掷按 roll 出尘且四参精确', () => {
    const early = crystalAt(10);
    driveRandom(Array(27).fill(0.98));                 // roll .98 < .99 ⇒ 不出
    eterniaCrystalAI(early.c, early.f.hooks, null);
    expect(early.f.dusts.length).toBe(0);

    const late = crystalAt(300);
    const rngVals: number[] = [];
    for (let k = 0; k < 9; k++) rngVals.push(0.5, 0.25, 0.75);   // roll(.5)/ang(.25τ)/r(.75)
    driveRandom(rngVals);
    eterniaCrystalAI(late.c, late.f.hooks, null);
    const vortex = late.f.dusts.filter((d) => d.type === 264);
    expect(vortex.length).toBe(9);                     // roll .5 ≥ .33 全出
    const ang = 0.25 * Math.PI * 2, r = 0.75;
    const rad = 110 + 600 * r;
    expect(vortex[0].perfect).toBe(true);
    expect(vortex[0].x).toBeCloseTo(late.c.cx + Math.cos(ang) * rad, 4);
    expect(vortex[0].y).toBeCloseTo(late.c.cy - 20 + Math.sin(ang) * rad, 4);
    expect(vortex[0].sx).toBeCloseTo(-Math.cos(ang) * (14 + 8 * r), 4);
    expect(vortex[0].sy).toBeCloseTo(-Math.sin(ang) * (14 + 8 * r), 4);
    expect(vortex[0].d.scale).toBeCloseTo(0.9, 6);
    expect(vortex[0].d.fadeIn).toBeCloseTo(1.15 + r * 0.3, 6);
    expect((vortex[0].d.color as { a: number }).a).toBe(Math.round(255 * 0.33 * 0.67));
    expect(vortex[0].d.noGravity).toBe(true);
    expect(vortex[0].d.noLight).toBe(true);

    // ≥540 → num1499=1:任何 roll<1 均免 → 零尘
    const endT = crystalAt(545);
    driveRandom(Array(27).fill(0.99));
    eterniaCrystalAI(endT.c, endT.f.hooks, null);
    expect(endT.f.dusts.length).toBe(0);
  });

  it('12 拍星爆:ai0 自增至 100 拍整环 120 粒(radius=810−100,速=反向×(14+5·ai0/600+8r))', () => {
    const { f, c } = crystalAt(99);                    // tick 内 ai0++ → 命中 100 触发位
    const rngVals: number[] = [];
    for (let i = 0; i < 120; i++) rngVals.push(0.5);   // r=.5
    driveRandom(rngVals);
    eterniaCrystalAI(c, f.hooks, null);
    const burst = f.dusts.filter((d) => d.type === 264);
    expect(burst.length).toBe(120);
    const radius = 810 - 100;
    const i0 = burst[0];                               // ang=i/120·τ=0
    expect(i0.x).toBeCloseTo(c.cx + radius, 4);
    expect(i0.y).toBeCloseTo(c.cy - 20, 4);
    const spd = 14 + 5 * (100 / 600) + 8 * 0.5;
    expect(i0.sx).toBeCloseTo(-spd, 4);                // 反向 −π … cos(π)=−1 ⇒ x 分量负
    expect(i0.sy).toBeCloseTo(0, 4);                   // sin(π)≈0
    expect((i0.d.color as { a: number }).a).toBe(0);   // color A=0(加性白)
    expect(i0.d.noGravity).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 传送门循环轨位置化(:41403-41465)
// ---------------------------------------------------------------------------

describe('dd2 传送门 idle 循环轨:startTrackedLoop 位置化+收门 Volume=scale', () => {
  it('>150 起轨(dd2_etherian_portal_idle_loop)+setPos 随动;收门期 setVolume 降档,终帧拆轨', () => {
    const f = makeHooks();
    const portal = Enemy.fromVanilla(549, 80 * TILE, 30 * TILE)!;
    f.enemies.push(portal);
    for (let t = 0; t < 155; t++) lanePortalAI(portal, f.hooks, null);
    expect(f.loops.some((l) => l.file === 'dd2_etherian_portal_idle_loop')).toBe(true);
    const h = f.loops.find((l) => l.file === 'dd2_etherian_portal_idle_loop')!;
    expect(h.ops.includes('pos')).toBe(true);
    let sawVolBelowOne = false;
    for (let t = 0; t < 700; t++) {
      lanePortalAI(portal, f.hooks, null);
      if (f.loops.flatMap((l) => l.vols).some((v) => v < 1)) { sawVolBelowOne = true; break; }
    }
    expect(sawVolBelowOne).toBe(true);
    let sawStop = false;
    for (let t = 0; t < 60; t++) {
      lanePortalAI(portal, f.hooks, null);
      if (f.loops.every((l) => l.ops.includes('stop'))) { sawStop = true; break; }
    }
    expect(sawStop).toBe(true);
  });
});
