// 发射点 Modifier/覆写审计金标（2026-09-03，"SetDefaults≠终值" 批）：
// 原版 NewProjectile 出膛链在 SetDefaults 之后还有三层覆写（Arrow.ts 寿命处方法论注
// 全表）：① NewProjectile 内联 per-Type 表（P.cs:10971-11090，Owner==Main.myPlayer）
// ② NewProjectileModifiers 三权威（NewProjectileModifiers.cs，:11097 最后调用）
// ③ 发射点直写 Main.projectile[idx].x（后写者胜）。本文件钉三处清偿偏差 + 对齐锚：
//   A. 419-422 烟花喷泉 life 3600→600（内联表 :11035-11050；SetDefaults 无 timeLeft 行）
//   B. 680 弩箭侍从 T2 套装 penetrate 4→7（内联表 :11083-11086，条件覆写）
//   C. 手雷族引信表 {29,470,637,1086,1087}=300 其余 aiStyle16 炸弹 180（:10987/:10991）
//   D. 对齐锚：290/291/293 HardmodeDungeonSkeletonShot=300（290 为 EU=100 子步换算
//      life=4 等价档，2026-09-02 定谳）/129·38·55 发射点钉 300/443=300/479 子镖 pierce=1
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRAP_SHOT_STYLE } from '../src/entities/Dart';
import { DART_STYLE } from '../src/entities/Dart';
import { Arrow } from '../src/entities/Arrow';
import { ELECTROSPHERE_LIFE } from '../src/entities/ElectroSphereProj';
import { projectileData } from '../src/data/vanillaProjectiles';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { Game, killTileHitDustAmount } from '../src/core/Game';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** hitTilesFx 行为桩（同 kill-tier-audit harness:原型方法绑最小 GameHooks,粒子源 spy） */
function fxHarness(): { w: World; parts: Array<[number, number, string, number]>;
  fx: (...a: number[]) => void } {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  const parts: Array<[number, number, string, number]> = [];
  const game = {
    world: w,
    spawnParticles: (x: number, y: number, c: string, n: number) => { parts.push([x, y, c, n]); },
  } as unknown as Game;
  const fx = (Game.prototype.hitTilesFx as (...a: number[]) => void).bind(game);
  return { w, parts, fx };
}

describe('发射点覆写金标（NewProjectile 内联表 + Modifiers）', () => {
  it('A: 419-422 烟花喷泉寿命 = 600（NewProjectile P.cs:11035-11050 钳，非 SetDefaults 3600）', () => {
    expect(TRAP_SHOT_STYLE.fireworkFountain.life).toBe(600);
  });

  it('B: 680 弩箭数据面 penetrate=4，侍从 T2 套装出生覆写 7（P.cs:11083-11086）', () => {
    expect(projectileData(680)?.penetrate).toBe(4);
    const base = new Arrow(0, 0, 1, 0, 10, 0, 680, null);
    expect(base.pierce).toBe(4);
    const t2 = new Arrow(0, 0, 1, 0, 10, 0, 680, null, { pierce: 7 });
    expect(t2.pierce).toBe(7);
  });

  it('C: 手雷族引信表（Game.EXPLODE_FUSE 查表,并行会话重构后形态）={29,470,637,1086,1087}→300 其余 180', () => {
    const src = readFileSync(ROOT + '../src/core/Game.ts', 'utf-8');
    // ★R6:引信消费重构为 EXPLODE_FUSE 静态查表（Game.ts:22225 表/:13862 消费,值面
    // 与原 :10971-11090 内联表一致）——正则改钉表本体;29 单 token 会平凡命中 293/1086
    // 等,改逐型带引号精确锚
    const m = src.match(/static readonly EXPLODE_FUSE[\s\S]{0,300}29: 300[\s\S]{0,120}1087: 300/);
    expect(m, 'Game.EXPLODE_FUSE 表形态漂移').toBeTruthy();
    for (const t of [29, 470, 637, 1086, 1087]) {
      expect(m![0]).toContain(`${t}: 300`);
    }
    expect(m![0]).not.toContain('SetDefaults');
  });

  it('D1: 290/291/293 覆写 300（290=EU100 子步换算 life 4 等价档；291/293 直钉）', () => {
    expect(DART_STYLE[291].life).toBe(300);
    expect(DART_STYLE[293].life).toBe(300);
    expect(DART_STYLE[290].life).toBe(4);
    expect(DART_STYLE[290].updates).toBe(100);
  });

  it('D2: 发射点钉 300 锚（129 符文爆弹/38 哈比羽毛/55 蜇针）', () => {
    for (const t of [129, 38, 55]) expect(DART_STYLE[t].life).toBe(300);
    expect(ELECTROSPHERE_LIFE).toBe(300);
  });

  it('D3: 479 pd0 无 penetrate 键（SetDefaults :5542-5550 无行）→ 数据链缺省 pierce=1 承载分裂子镖终值（:58320+Modifier :15-28）', () => {
    // 行身份钉（aiStyle1/14×14,与 SetDefaults 同面）——防"行不存在→undefined"平凡真
    const pd = projectileData(479);
    expect(pd).toBeDefined();
    expect(pd?.aiStyle).toBe(1);
    expect(pd?.width).toBe(14);
    expect(pd?.height).toBe(14);
    expect(pd?.penetrate, '479 SetDefaults 无 penetrate 行,json 应不含该键').toBeUndefined();
    // 实质链:无 opts 出生 → Arrow pierce 链 opts ?? pd0.penetrate ?? 缺省 1（Arrow.ts
    // "opts 显式优先 → SetDefaults penetrate → 缺省 1"）= 原版字段缺省 penetrate=1;
    // 分裂子镖（P.cs:58320 带 NewProjectileModifiers.IchorDartUpdatePenetrate,ai[1]<0
    // 档=1,Modifier.cs:15-28）由该缺省+Arrow 479 支承载——非再传 {pierce:1} 恒真管路
    const spawned = new Arrow(0, 0, 1, 0, 10, 0, 479, null);
    expect(spawned.pierce).toBe(1);
    // 源锚:子镖出生即 pierce=1（Arrow.ts 分裂支,pd0 链缺省同值）
    const arrowSrc = readFileSync(ROOT + '../src/entities/Arrow.ts', 'utf-8');
    const m = arrowSrc.match(/new Arrow\(this\.cx, this\.cy, sx, sy,[\s\S]{0,200}479, null,[\s\S]{0,80}\{ pierce: 1, grav: 0 \}\)/);
    expect(m, 'Arrow 479 分裂子镖 pierce=1 链漂移').toBeTruthy();
  });

  it('D4: hitTilesFx 尘量=GetTileDustAmount(fail:true) 分型档——654 TNTBarrel→0 粒（WorldGen.cs:67129-67130）', () => {
    expect(killTileHitDustAmount(654, 0)).toBe(0);
    const { w, parts, fx } = fxHarness();
    w.store.setTileSilent(25, 100, TILE_INTERNAL_BY_SHEET.get(654)!, 0, 0);
    fx(25 * TILE, 100 * TILE, 8, 8, 0, 4);
    expect(parts).toHaveLength(0);   // 非实心（HitTiles 实心门）+分型档 0 双门
  });

  it('D5: 541 EchoBlock→1 粒（WorldGen.cs:67144-67145）——缺省 3 近似退役', () => {
    expect(killTileHitDustAmount(541, 0)).toBe(1);
    expect(killTileHitDustAmount(1, 0)).toBe(3);   // 表外缺省档仍在
    const { w, parts, fx } = fxHarness();
    w.store.setTileSilent(30, 100, TILE_INTERNAL_BY_SHEET.get(541)!, 0, 0);
    fx(30 * TILE, 100 * TILE, 8, 8, 0, 4);
    expect(parts).toHaveLength(1);
    expect(parts[0][3]).toBe(1);
  });
});
