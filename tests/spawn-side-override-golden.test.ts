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

const ROOT = fileURLToPath(new URL('.', import.meta.url));

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

  it('D3: 479 分裂子镖 pierce 终值 1（IchorDartUpdatePenetrate，P.cs:58320+Modifier :15-28）', () => {
    const child = new Arrow(0, 0, 1, 0, 10, 0, 479, null, { pierce: 1 });
    expect(child.pierce).toBe(1);
    expect(projectileData(479)?.penetrate).toBeUndefined();
  });
});
