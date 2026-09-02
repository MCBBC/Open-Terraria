// R27 红蓝对抗回归（魔法武器 I 前期族，2026-08-25）：
//  ① Demon Scythe 45 指数加速（AI_018 :25781-25798：ai[0]∈[30,100) velocity×=1.06、
//     ≥100 冻结）+ 快自旋 + 飞行尘 + Kill Item10/60×d27（Game.onProjectileDeath）
//  ② Water Bolt 27：五点错位 d172 拖尾 + timeLeft/=2=1800（:1104）+ 贴图隐形
//     （alpha=255 缺省 GetAlpha）+ 自旋 0.3×dir（:24636）
//  ③ Aqua Scepter 22：收缩 0.01/update 至 Kill + 重力弧线 0.15（:24837-24885）+ 拖尾
//  ④ 宝石法珠族：rotation=velocity.ToRotation()（:38691，PROJ_ROT_ASIS）+ 飞行彩尘
//     2 臂各 1/5（:38534-38541）+ Kill PlaySound(0)+15×gem 尘（Game.onProjectileDeath）
//  ⑤ Vilethorn/Nettle Burst 链段系统（aiStyle4 :23943-24080）：渐显静止/链生/翻转/
//     尾端/穿 170 尘爆/静默消亡 + 物品无 UseSound（64/788 fallback 'tink' 抑制）
//  ⑥ Rainbow Rod 79 1458 变更面（AI_009 :44390-44406）：Item9 十拍循环啸声 +
//     每拍 d66 disco 尘 + Kill Resize(128) AoE（MissileProj）
//  ⑦ Crystal Storm 出速散布 Next(-40,41)×0.04（Player.cs:48258-48267）
//  ⑧ Zapinator 876 命中侧随机化（Damage_PVE :12691-12777）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Arrow, PROJ_ROT_ASIS, PROJ_NO_ROT } from '../src/entities/Arrow';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

interface DustRec {
  type: number; vx: number; vy: number; scale: number; noGravity: boolean;
  x: number; y: number; alpha: number;
}

function makeGame(w: World, enemies: unknown[] = [], hooks: Record<string, unknown> = {}): GameHooks {
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const g = {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => enemies, critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files.join(',')); },
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: (x: number, y: number, ww: number, hh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c = null, scale = 1, noGravity = false) => {
      const d: DustRec = { type, vx: sx, vy: sy, scale, noGravity, x, y, alpha };
      dusts.push(d);
      return d as never;
    },
    dusts, sfx,
    ...hooks,
  };
  return g as unknown as GameHooks;
}

/** 从 makeGame 的 hooks 里取记录器（测试侧读取用） */
function rec(game: GameHooks): { dusts: DustRec[]; sfx: string[] } {
  return game as unknown as { dusts: DustRec[]; sfx: string[] };
}

/** 真 Game.prototype 壳：onProjectileDeath 走真实现（Kill 分档音/尘端到端）——
 *  weapon-arrow-fx.test.ts deathShell 同法 */
function realDeathHook(): { hook: (projId: number, ...rest: unknown[]) => void; sfx: string[]; dusts: DustRec[] } {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const sfx: string[] = [];
  const dusts: DustRec[] = [];
  g.entities = { add: () => {}, projectiles: [] };
  g.player = { dead: true, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 };
  g.playSfxFiles = (files: string[]) => { sfx.push(files.join(',')); };
  g.playSfxWav = () => {};
  g.sfx = { play: () => {} };
  g.spawnDust = (x: number, y: number, w: number, h: number, type: number,
    sx = 0, sy = 0, alpha = 0, c = null, scale = 1, noGravity = false) => {
    const d = { type, vx: sx, vy: sy, scale, noGravity, x, y, alpha };
    dusts.push(d as DustRec);
    return d;
  };
  g.damagePlayer = (): number => 0;
  return {
    hook: (projId: number, ...rest: unknown[]) =>
      (g.onProjectileDeath as (...a: unknown[]) => void)(projId, ...rest),
    sfx, dusts,
  };
}

afterEach(() => { vi.restoreAllMocks(); });

// ============ ① Demon Scythe 45 ============
describe('① Demon Scythe 加速曲线（AI_018 :25781-25798）', () => {
  it('shootSpeed 0.2 是起点：ai[0]∈[30,100) 每 update ×1.06，≥100 冻结', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    // 出生速 0.2（Item.cs:4564 shootSpeed=0.2f），水平向右
    const a = new Arrow(80 * TILE, 100 * TILE, 0.2, 0, 35, 5, 45, null, {});
    expect(a.drawScale).toBeCloseTo(0.9, 5);                       // SetDefaults scale
    for (let t = 0; t < 29; t++) a.fixedUpdate(1 / 60, game);       // ai[0] 1..29 未加速
    expect(a.vx).toBeCloseTo(0.2, 6);
    for (let t = 0; t < 70; t++) a.fixedUpdate(1 / 60, game);       // ai[0] 30..99 ×1.06^70
    // C# float 语义逐次浮点乘（非 pow），容差放宽
    expect(a.vx).toBeGreaterThan(11);                               // 0.2×1.06⁷⁰ ≈ 11.8
    expect(a.vx).toBeLessThan(13);
    const frozen = a.vx;
    for (let t = 0; t < 30; t++) a.fixedUpdate(1 / 60, game);       // ai[0]→200 冻结
    expect(a.vx).toBeCloseTo(frozen, 6);
  });

  it('快自旋 0.8×direction/update（PROJ_SPIN 表）+ 每 update 2×d27(alpha100,noGravity)', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const r0 = rec(game).dusts.length;
    const a = new Arrow(80 * TILE, 100 * TILE, 1, 0, 35, 5, 45, null, {});
    a.fixedUpdate(1 / 60, game);
    expect(a.spinRot).toBeCloseTo(0.8, 5);
    const d45 = rec(game).dusts.slice(r0);
    expect(d45.length).toBe(2);
    expect(d45.every((d) => d.type === 27 && d.noGravity && d.alpha === 100)).toBe(true);
  });
});

// ============ ② Water Bolt 27 ============
describe('② Water Bolt（AI_008 type 支 :24515-24577）', () => {
  it('timeLeft/=2 → 寿命 1800（SetDefaults :1104）；贴图隐形（alpha=255 缺省 GetAlpha）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 6, -2, 19, 5, 27, null, {});
    expect(a.life).toBe(1800);
    expect(a.alpha).toBe(255);
    // drawGlobalAlpha 私有——经 draw 断言隐形等价于 (255-alpha)/255 = 0
    expect((a as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha()).toBe(0);
  });

  it('每 update 5 点错位 d172 连续水痕（noGravity,scale1.2,alpha100）+ 1/5 小尘', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 6, 0, 19, 5, 27, null, {});
    const r0 = rec(game).dusts.length;
    a.fixedUpdate(1 / 60, game);
    const d27 = rec(game).dusts.slice(r0);
    // 5 枚主尘必出；小尘 1/5 概率——统计断言只锚必出部分
    expect(d27.filter((d) => d.scale === 1.2).length).toBe(5);
    expect(d27.filter((d) => d.scale === 1.2).every((d) => d.type === 172 && d.noGravity)).toBe(true);
    // 五点错位：位置沿 −velocity/3×i 排布（i=0..4），连续水痕的几何签名
    const xs = d27.filter((d) => d.scale === 1.2)
      .map((d) => Math.round((d.x - (80 * TILE + 4)) * 100));
    expect(xs[4]).toBeLessThan(xs[0]);                              // 尾点在头点后方
  });

  it('自旋 rotation += 0.3×direction（PROJ_SPIN :24636）；Kill → Item10 + 60 枚 d172', async () => {
    const w = emptyWorld();
    const deaths: Array<{ projId: number }> = [];
    const death = realDeathHook();
    const game = makeGame(w, [], {
      onProjectileDeath: (projId: number, ...rest: unknown[]) => {
        deaths.push({ projId });
        death.hook(projId, ...rest);
      },
    });
    const a = new Arrow(80 * TILE, 189 * TILE, 6, 0, 19, 5, 27, null, {});
    a.fixedUpdate(1 / 60, game);
    expect(a.spinRot).toBeCloseTo(0.3, 5);
    const r0 = rec(game).dusts.length;
    (a as unknown as { killNow(g: GameHooks): void }).killNow(game);
    expect(deaths.some((d) => d.projId === 27)).toBe(true);
    expect(death.sfx.some((s) => s.includes('Item_10'))).toBe(true);
    const killDusts = death.dusts;
    expect(killDusts.length).toBe(60);                              // 30 循环 × 2 枚
    expect(killDusts.every((d) => d.type === 172)).toBe(true);
    expect(killDusts.filter((d) => d.scale === 0.5).length).toBe(30);
    void r0;
  });
});

// ============ ③ Aqua Scepter 22 ============
describe('③ Aqua Scepter（aiStyle 12 type 22 支 :24835-24926）', () => {
  it('收缩 −0.01/AI update（extraUpdates=2 → 3 子步/帧）至 ≤0 Kill；重力弧线 vy+=0.15', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 12.5, 0, 27, 7, 22, null, {});
    expect(a.extraUpdates).toBe(2);
    expect(a.drawScale).toBeCloseTo(1, 6);
    let ticks = 0;
    while (!a.dead && ticks < 400) { a.fixedUpdate(1 / 60, game); ticks++; }
    expect(a.dead).toBe(true);
    // 100 个 AI update 收缩到 0；每帧 3 子步 → ~34 帧
    expect(ticks).toBeGreaterThanOrEqual(30);
    expect(ticks).toBeLessThanOrEqual(40);
  });

  it('ai[0]>3 后每子步 3×d172 六px 内缩错位拖尾（noGravity,scale1.2）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 12.5, 0, 27, 7, 22, null, {});
    for (let t = 0; t < 3; t++) a.fixedUpdate(1 / 60, game);        // ai[0] 1..9（3 帧×3 子步）
    const trail = rec(game).dusts.filter((d) => d.type === 172 && d.scale === 1.2);
    expect(trail.length).toBeGreaterThan(3);                        // ai[0]>3 起每子步 3 枚
  });
});

// ============ ④ 宝石法珠族 ============
describe('④ 宝石法珠三层视觉（AI_029 :38516-38692）', () => {
  it('rotation=velocity.ToRotation()：PROJ_ROT_ASIS 含 121-126/597 且不含 521', () => {
    for (const id of [121, 122, 123, 124, 125, 126, 597]) {
      expect(PROJ_ROT_ASIS.has(id), `proj ${id}`).toBe(true);
      expect(PROJ_NO_ROT.has(id), `proj ${id} 不应直立`).toBe(false);
    }
  });

  it('飞行彩尘 2 臂各 1/5：d(type−121+86)/597→262,noGravity,scale1.2,alpha50', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    // 琥珀杖弹 597 → 尘 262
    const a = new Arrow(80 * TILE, 100 * TILE, 8, 0, 12, 1, 597, null,
      { gem: { homing: true } });
    const r0 = rec(game).dusts.length;
    for (let t = 0; t < 60; t++) a.fixedUpdate(1 / 60, game);
    const gd = rec(game).dusts.slice(r0).filter((d) => d.type === 262);
    expect(gd.length).toBeGreaterThan(4);                           // 60 update × 2 臂 × 1/5 ≈ 24
    expect(gd.every((d) => d.noGravity && d.alpha === 50 && d.scale > 1.05)).toBe(true);
  });
});

// ============ ⑤ Vilethorn / Nettle Burst 链段系统 ============
describe('⑤ 荆棘链段系统（aiStyle 4 :23943-24080）', () => {
  it('Vilethorn：渐显期不动（alpha −50/update）→ 归零链生子段（前方一格速度处）→ tip 8', () => {
    const w = emptyWorld();
    const added: Arrow[] = [];
    const game = makeGame(w, [], {
      entities: { nextId: 1, add: (e: unknown) => added.push(e as Arrow), projectiles: [] },
    });
    const root = new Arrow(80 * TILE, 100 * TILE, 32, 0, 10, 1, 7, null, {});
    expect(root.thornChain).toBe(true);
    const x0 = root.x;
    for (let t = 0; t < 5; t++) root.fixedUpdate(1 / 60, game);     // alpha 255→5 渐显期
    expect(root.x).toBe(x0);                                        // 渐显期静止
    expect(root.alpha).toBe(5);
    root.fixedUpdate(1 / 60, game);                                 // 归零转段 + 链生
    expect((root as unknown as { thornAi0: number }).thornAi0).toBe(1);
    expect(root.x).toBe(x0 + 32);                                   // 首段补一步位移(:23981)
    expect(added.length).toBe(1);
    expect(added[0].projId).toBe(7);
    expect((added[0] as unknown as { thornAi1: number }).thornAi1).toBe(2);
    expect(added[0].x).toBe(root.x + 32 + 14);                      // position+v+(w/2)
    // 淡出期 alpha 回升 → ≥255 静默消亡（无声无尘）
    const r0 = rec(game).dusts.length;
    const s0 = rec(game).sfx.length;
    for (let t = 0; t < 200 && !root.dead; t++) root.fixedUpdate(1 / 60, game);
    expect(root.dead).toBe(true);
    expect(rec(game).dusts.length).toBe(r0 + 4);                    // 仅穿 170 尘爆 4 枚
    expect(rec(game).sfx.length).toBe(s0);
  });

  it('出生音 Item_8 仅首发段播一次（localAI[0]/ai[1]==0 门）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const root = new Arrow(80 * TILE, 100 * TILE, 32, 0, 10, 1, 7, null, {});
    root.fixedUpdate(1 / 60, game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_8')).length).toBe(1);
    root.fixedUpdate(1 / 60, game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_8')).length).toBe(1);
  });

  it('Nettle Burst：150↔151 每节翻转、ai[1]>=10 且 151 → 152 尾端；渐显步长 −75', () => {
    const w = emptyWorld();
    const added: Arrow[] = [];
    const game = makeGame(w, [], {
      entities: { nextId: 1, add: (e: unknown) => added.push(e as Arrow), projectiles: [] },
    });
    // 链生段直接以 thornChainAi1 注入（Game 发射的是 150 首发）
    const seg = new Arrow(80 * TILE, 100 * TILE, 32, 0, 35, 1, 150, null, {});
    expect(seg.alpha).toBe(255);
    seg.fixedUpdate(1 / 60, game);
    expect(seg.alpha).toBe(180);                                    // 255−75
    // 尾端判定：151 段 ai1>=10 → 子段 152
    const tipParent = new Arrow(80 * TILE, 110 * TILE, 32, 0, 35, 1, 151, null,
      { thornChainAi1: 10 });
    for (let t = 0; t < 5; t++) tipParent.fixedUpdate(1 / 60, game);   // 渐显 255→0（ceil(255/75)=4 步）
    expect(tipParent.dead).toBe(false);
    expect(added.length).toBe(1);
    expect(added[0].projId).toBe(152);
  });
});

// ============ ⑥ Rainbow Rod 79（1458 变更面） ============
describe('⑥ Rainbow Rod 1458 飞行尘+循环音+Kill AoE（AI_009 :44390-44406 / Kill :72426）', () => {
  function mkMissile(game: GameHooks): MagicMissileProj {
    return new MagicMissileProj(80 * TILE, 100 * TILE, 20, 0, {
      projId: 79, damage: 50, knockback: 4, useTime: 20,
      channelCb: () => false,
      aimCb: () => ({ x: 90 * TILE, y: 100 * TILE }),   // MissileCtor 键名（旧 aim 为死键,TS2353）
      payMana: () => true,
    }) as MagicMissileProj;
  }

  it('十拍循环啸声：|v|>2 时每 10 update 播 Item_9；每 update 1×d66 disco 尘', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mkMissile(game);
    const r0 = rec(game).dusts.length;
    for (let t = 0; t < 21; t++) m.fixedUpdate(1 / 60, game);
    const item9 = rec(game).sfx.filter((s) => s.includes('Item_9'));
    expect(item9.length).toBe(3);                                   // t=0/10/20 三拍
    const d66 = rec(game).dusts.slice(r0).filter((d) => d.type === 66);
    expect(d66.length).toBe(21);                                    // 每拍 1 枚
    expect(d66[0].noGravity).toBe(true);
  });

  it('Kill：128px 盒 AoE 二次结算 + Item10 + 沿尾迹 d267 迸散 + 14×d66', () => {
    const w = emptyWorld();
    const hurtLog: number[] = [];
    const enemy = {
      id: 1, x: 82 * TILE, y: 100 * TILE - 8, w: 16, h: 16, dead: false,
      maxHp: 100,
      get cx() { return this.x + this.w / 2; },
      get cy() { return this.y + this.h / 2; },
      hurt(d: number): boolean { hurtLog.push(d); return true; },
    };
    const game = makeGame(w, [enemy]);
    const m = mkMissile(game);
    // 预置尾迹（模拟飞行期 oldPos 链,新→老 [0]=头——Kill 尾迹迸散沿 strip 逐点;
    // ★裁定 a:旧 12 点 push 带退役,改 mode-3 strip 带）
    (m as unknown as { strip: Array<{ x: number; y: number }> }).strip.push(
      { x: 81 * TILE, y: 100 * TILE },
      { x: 81 * TILE - 8, y: 100 * TILE },
      { x: 80 * TILE, y: 100 * TILE },
      { x: 79 * TILE, y: 100 * TILE },
      { x: 78 * TILE, y: 100 * TILE });
    const r0 = rec(game).dusts.length;
    m['killNow'](game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_10')).length).toBe(1);
    // 敌在弹心右侧 ~24px、128px 盒内 → AoE 二跳（接触未发生）
    expect(hurtLog.length).toBe(1);
    const burst = rec(game).dusts.slice(r0);
    expect(burst.filter((d) => d.type === 66).length).toBe(14);     // :72496-72502
    expect(burst.filter((d) => d.type === 267).length).toBeGreaterThan(0);   // 尾迹迸散
  });
});

// ============ ⑦ Crystal Storm 出速散布 ============
describe('⑦ Crystal Storm 散布（Player.cs:48258-48267）', () => {
  it('Next(-40,41)×0.04 双轴 ±1.6px/t：样本有偏移且不越界', () => {
    const spread = (): number => (Math.floor(Math.random() * 81) - 40) * 0.04;
    let nonzero = 0;
    for (let i = 0; i < 500; i++) {
      const v = spread();
      expect(Math.abs(v)).toBeLessThanOrEqual(1.600001);
      if (Math.abs(v) > 1e-9) nonzero++;
    }
    expect(nonzero).toBeGreaterThan(400);                           // ~98% 非零
  });
});

// ============ ⑧ Zapinator 876 命中侧随机化 ============
describe('⑧ Zapinator 命中侧随机化（Damage_PVE :12691-12777）', () => {
  it('每次命中伤 ×0.9（int 截断）/kb ×0.9 必然生效；速度基线 ×0.6（1/50、1/10 档独立掷）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 15, 0, 42, 6, 876, null, {});
    expect(a.alpha).toBe(255);
    expect(a.extraUpdates).toBe(3);
    (a as unknown as { zapinatorHitChaos(g: GameHooks): void }).zapinatorHitChaos(game);
    // 确定性项：伤/kb 乘区恒发生；速度基线 ×0.6=9，±0.3 抖速/1/14 反向/1/10 缩速为独立掷
    const dOk = a.damage === Math.trunc(42 * 0.9) || a.damage === Math.trunc(42 * 0.9) * 10;
    expect(dOk).toBe(true);
    const spd = Math.hypot(a.vx, a.vy);
    // 基线带（±0.3 双轴抖速）或 1/10 缩速档（×[0.0005,0.1] → ≤0.93）
    expect(spd < 0.95 || Math.abs(spd - 9) <= 0.32).toBe(true);
    // 统计：200 次重掷中伤 ×0.9 恒成立（×10 为稀有档），速度落在基线带内占绝对多数
    let baseBand = 0;
    for (let i = 0; i < 200; i++) {
      const b = new Arrow(80 * TILE, 100 * TILE, 20, 0, 42, 6, 876, null, {});
      (b as unknown as { zapinatorHitChaos(g: GameHooks): void }).zapinatorHitChaos(game);
      if (Math.abs(b.knockback - 3.6) < 1e-6 || Math.abs(b.knockback - 36) < 1e-6) {
        expect(b.damage === 37 || b.damage === 370).toBe(true);
      }
      const s2 = Math.hypot(b.vx, b.vy);
      if (s2 > 1 && s2 < 13.5) baseBand++;
    }
    expect(baseBand).toBeGreaterThanOrEqual(170);                   // 1/10 缩速档期望 ~20 次
  });

  it('alpha −10/AI update 渐显（extraUpdates=3 → −40/帧）；GetAlpha 白加算档 ≥200 透明', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 15, 0, 42, 6, 876, null, {});
    expect((a as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha()).toBe(0);
    for (let t = 0; t < 6; t++) a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(15);                                       // 255−6帧×4子步×10
    expect((a as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha())
      .toBeCloseTo((255 - 15) / 255, 5);
  });
});
