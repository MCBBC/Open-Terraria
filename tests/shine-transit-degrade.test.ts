// ★TileShine 滚屏降级锁（2026-10-03 主刀;第 0 刀 A/B 定谳=scripts/_shine-ab-fall.mjs 三臂）
//
// 【定谳锚】同种子同竖井自然下坠（用户真实导出档,vy 600px/s=x-ray 基线）,
//   腐化带慢帧密度:缺省(4ms 盒) 33.0/s(忙机)/10.1/s(闲机) vs __SW_SHINE_OFF
//   2.3/s≈石带 1.9/s——群系差消失=shine 烘焙主因闭环;shinebudget=0(计数路径)
//   11.5/s p95 34.3ms=整 chunk 无盒 hitch,非干净逃生门。修正=滚屏态时间盒
//   4ms→1.5ms（方案 a;弃 b/c 证据面见 TileShine.ts 滚屏降级注）。
// 【旗面】不立新旗挂既有 shinebudget 语义:显式传参=逐字(永不自适应),仅缺省吃
//   速度门;shinebudget=4=本刀前行为逐字逃生门,0=计数路径,__SW_SHINE_OFF=秒关。
// 本文件锁三面：①adaptiveShineBudgetMs 纯函数（显式逐字/速度门/只降不升/阈界）
//   ②cameraSpeedPxPerMs 推进语义（首帧 0/dt≤0/长缝 250ms/瞬移=滚屏态）
//   ③源级锁：drawTileShineGrid 接线在位（防静默拆除——门在 shineBudgetMs>0 内,
//     显式态走 adaptive 但被逐字支短路）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adaptiveShineBudgetMs, cameraSpeedPxPerMs, shineCamSpeed,
  SHINE_TRANSIT_SPEED, SHINE_TRANSIT_BUDGET_MS,
  shineBudgetExplicit, shineBudgetMs,
} from '../src/render/TileShine';

const TSHINE = readFileSync(join(__dirname, '../src/render/TileShine.ts'), 'utf8');

describe('滚屏降级 ①adaptiveShineBudgetMs — 显式逐字 + 速度门（纯函数）', () => {
  it('显式传参（shineBudgetExplicit≠null）= 逐字,速度无关（确定性仪器面）', () => {
    expect(adaptiveShineBudgetMs(4, 0)).toBe(4);
    expect(adaptiveShineBudgetMs(4, 10)).toBe(4);      // 高速也不降——显式=逐字
    expect(adaptiveShineBudgetMs(8, 10)).toBe(8);
    expect(adaptiveShineBudgetMs(1, 0)).toBe(1);
    expect(adaptiveShineBudgetMs(0, 10)).toBe(0);      // 显式 0 逐字（计数路径选择在上层门）
    expect(adaptiveShineBudgetMs(16, 0.0001)).toBe(16);
  });
  it('缺省（explicit=null）：静止/慢速=base 4ms;超阈=压到 SHINE_TRANSIT_BUDGET_MS', () => {
    expect(adaptiveShineBudgetMs(null, 0)).toBe(4);
    expect(adaptiveShineBudgetMs(null, 0.2)).toBe(4);          // 步行 ~264px/s=0.264 域内
    expect(adaptiveShineBudgetMs(null, SHINE_TRANSIT_SPEED)).toBe(4);  // 阈值点严格 >,不降
    expect(adaptiveShineBudgetMs(null, SHINE_TRANSIT_SPEED + 0.01)).toBe(SHINE_TRANSIT_BUDGET_MS);
    expect(adaptiveShineBudgetMs(null, 10)).toBe(1.5);         // 下坠 ~0.6px/ms 域
    expect(SHINE_TRANSIT_SPEED).toBe(0.35);                    // 定参锁（步行 264<350<下坠 600 px/s）
    expect(SHINE_TRANSIT_BUDGET_MS).toBe(1.5);                 // 定参锁（任务域 1-2ms 取中）
  });
  it('只降不升:baseMs < TRANSIT_BUDGET 时取 baseMs（显式小盒不被放大）', () => {
    expect(adaptiveShineBudgetMs(null, 10, 1)).toBe(1);
    expect(adaptiveShineBudgetMs(null, 0, 1)).toBe(1);
  });
  it('Node 装载语义:explicit=null 且 shineBudgetMs=0（计数路径,既有断言同源）', () => {
    expect(shineBudgetExplicit).toBeNull();
    expect(shineBudgetMs).toBe(0);
  });
});

describe('滚屏降级 ②cameraSpeedPxPerMs — 帧间相机位移速度推进', () => {
  it('首帧（lastX=NaN）=0,状态照常推进', () => {
    shineCamSpeed.reset();
    expect(cameraSpeedPxPerMs(1000, 2000, 1000)).toBe(0);
    expect(shineCamSpeed.lastX).toBe(1000);
    expect(shineCamSpeed.lastY).toBe(2000);
    expect(shineCamSpeed.lastT).toBe(1000);
  });
  it('匀速 35px/100ms = 0.35 px/ms（阈界值本身）', () => {
    shineCamSpeed.reset();
    cameraSpeedPxPerMs(1000, 2000, 1000);
    expect(cameraSpeedPxPerMs(1035, 2000, 1100)).toBeCloseTo(0.35, 10);
  });
  it('dt≤0（同拍双调）=0,不除零', () => {
    shineCamSpeed.reset();
    cameraSpeedPxPerMs(0, 0, 500);
    expect(cameraSpeedPxPerMs(500, 0, 500)).toBe(0);
  });
  it('长缝 dt≥250ms（暂停恢复/长卡顿）=0（慢速长缝≠滚屏）', () => {
    shineCamSpeed.reset();
    cameraSpeedPxPerMs(0, 0, 0);
    expect(cameraSpeedPxPerMs(300, 0, 249)).toBeCloseTo(300 / 249, 10);   // 短缝照常计速
    expect(cameraSpeedPxPerMs(600, 0, 249 + 251)).toBe(0);                // 251ms 长缝
    expect(cameraSpeedPxPerMs(601, 0, 249 + 252)).toBe(1);                // 缝后重新起算:1px/1ms
  });
  it('瞬移（大位移短 dt）=高速 → 滚屏态降级语义正确', () => {
    shineCamSpeed.reset();
    cameraSpeedPxPerMs(0, 0, 0);
    expect(cameraSpeedPxPerMs(1200, 900, 8)).toBe(187.5);   // hypot(1200,900)=1500/8ms
  });
  it('对角位移用 hypot（x/y 合速度）', () => {
    shineCamSpeed.reset();
    cameraSpeedPxPerMs(0, 0, 0);
    // 3-4-5 三角形:位移 5px/10ms = 0.5
    expect(cameraSpeedPxPerMs(3, 4, 10)).toBeCloseTo(0.5, 10);
  });
});

describe('滚屏降级 ③源级锁 — drawTileShineGrid 接线在位（防静默拆除）', () => {
  it('预算构造点:门在 shineBudgetMs>0 内,adaptive 双参（explicit+speed）接线', () => {
    expect(TSHINE).toContain('const tbNow = shineBudgetMs > 0');
    expect(TSHINE).toContain('adaptiveShineBudgetMs(shineBudgetExplicit,');
    expect(TSHINE).toContain('cameraSpeedPxPerMs(cam.x, cam.y, performance.now()), shineBudgetMs)');
    expect(TSHINE).toContain('const timeBudget = tbNow > 0 ? { deadline: performance.now() + tbNow } : null;');
  });
  it('定参常量导出面在位（SHINE_TRANSIT_SPEED/SHINE_TRANSIT_BUDGET_MS）', () => {
    expect(TSHINE).toContain('export const SHINE_TRANSIT_SPEED = 0.35;');
    expect(TSHINE).toContain('export const SHINE_TRANSIT_BUDGET_MS = 1.5;');
  });
  it('既有逃生门未被拆除（shinebudget=0 计数路径 / __SW_SHINE_OFF / budgetExhausted）', () => {
    expect(TSHINE).toContain('const countBudget: ShineBakeBudget | undefined = timeBudget ? undefined : { left: 2 };');
    expect(TSHINE).toContain('if ((globalThis as { __SW_SHINE_OFF?: boolean }).__SW_SHINE_OFF) return;');
    expect(TSHINE).toContain("return 'deadline' in budget ? performance.now() >= budget.deadline : budget.left <= 0;");
  });
});
