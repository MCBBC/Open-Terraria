// ★W4 光照区域锚相机（2026-10-01）：清偿 W2 登记缺口——ensureRegion 锚 player → 相机。
//
// 定谳锚（反编译唯一标杆）：
//   原版 GetAreaToLight（Main.cs:64888-64899）= Camera.ScaledPosition/UnscaledPosition
//   【相机/屏幕域】——Color 模式 Scaled、旧模式 Unscaled,双支皆相机;区域逐帧随相机
//   移动,GetColor 出区 =Vector3.Zero（LightingEngine.cs GetColor !_activeProcessedArea
//   Contains 支,与仓内 lightAt 出域 [0,0,0] 同语义）。
//   本仓旧锚 player.cx/cy 两暴露面（scripts/_w4-light-anchor.mjs 探针定谳）：
//   ① 跟踪镜头（高尔夫/无人机 FPV/观战）：相机距玩家 >~110 格 coverage=0、lightAt
//      四角全 0=全屏黑持续整个跟踪窗（跟拍 200 格实测 17+ 拍全黑）;
//   ② 传送滑行（advanceTeleportLerp 起步 ≤blackFadeDist≈52 格 > 区域余量 ~29 格）：
//      t1-t4 视口出区（coverage 0.82-0.98）。
//
// 本文件四判据：
//   ① 源锚锁：Game.tickLighting 必须 ensureRegion(this.camera.x, this.camera.y,…)
//     （三调用点相机段已终态=follow/teleportLerp/pan/clamp 走完,语义=原版相机锚 1:1）;
//   ② 跳变承载（暴露面①/② t1 形态）：锚大跳 200 格 → 本地路径 dirty→runFullCycle
//     同帧发布,公共对当拍覆盖新视口、lightAt 视口内非黑（=vanilla 传送双 LightTiles
//     同帧出光的结构等价面,Game.ts blackFadeCameraTeleport 注）;
//   ③ 滑行承载（暴露面② t1-tN 形态）：锚每 tick 平移 ≤5 格（lerp 率 0.1+ 峰值面）
//     → 逐拍公共对覆盖视口;
//   ④ 零回归（普通游玩）：静置锚两次 compute,公共对覆盖+lightAt 稳定。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { TileStore } from '../src/world/TileStore';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

function makeWorld(w = 800, h = 400): LightingWorld {
  return {
    store: new TileStore(w, h),
    groundLevel: 30,
    lavaLine: 190,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}

const VIEW_W = 60, VIEW_H = 40;   // tile 数（Game 调用约定 viewTW/viewTH）

/** 视口包络（锚 ± viewW/2 (+2 内缩余),与渲染视口/探针 coverage 同口径） */
function viewport(px: number, py: number) {
  const cx = Math.floor(px / 16), cy = Math.floor(py / 16);
  return {
    x0: cx - Math.ceil(VIEW_W / 2), x1: cx + Math.ceil(VIEW_W / 2) + 1,
    y0: cy - Math.ceil(VIEW_H / 2), y1: cy + Math.ceil(VIEW_H / 2) + 1,
    cx, cy,
  };
}

/** 公共对是否完整覆盖视口（=渲染 lightAt 采样全域在界内,出区黑不再触发） */
function covers(L: LightingEngine, v: ReturnType<typeof viewport>): boolean {
  return L.rx <= v.x0 && L.ry <= v.y0 && v.x1 < L.rx + L.rw && v.y1 < L.ry + L.rh;
}

describe('★W4 光照区域锚相机', () => {
  // ---- ① 源锚锁 ----
  it('源锚:Game.tickLighting 锚 camera.x/y（原版 GetAreaToLight 相机域 1:1）', () => {
    const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
    expect(src).toContain('this.lighting.ensureRegion(this.camera.x, this.camera.y, viewTW, viewTH)');
    expect(src).not.toContain('ensureRegion(player.cx');
    // 原版标杆锚注释在场（防后来者凭"区域=玩家域"直觉回改）
    expect(src).toContain('Main.cs:64888-64899');
  });

  // ---- ② 跳变承载（高尔夫跟拍 200 格/传送硬吸合同形态）----
  it('锚大跳 200 格:本地路径同帧发布,公共对当拍覆盖新视口且 lightAt 非黑', () => {
    const L = new LightingEngine(makeWorld());
    const playerPx = 100 * 16, skyY = 20 * 16;   // 天空层(groundLevel 30 之上)=阳光亮
    // t0:玩家域锚（旧世界态）——先建立稳态公共对
    L.ensureRegion(playerPx, skyY, VIEW_W, VIEW_H);
    L.compute(0);
    expect(covers(L, viewport(playerPx, skyY))).toBe(true);
    // 相机大跳 200 格（跟踪链 camTX 汇入 follow 的远距跟拍形态）
    const camPx = 300 * 16;
    L.ensureRegion(camPx, skyY, VIEW_W, VIEW_H);
    L.compute(0);
    const v = viewport(camPx, skyY);
    expect(covers(L, v)).toBe(true);                       // 出区黑不再触发
    const c = L.lightAt(v.cx, v.cy);
    expect(c[0] + c[1] + c[2]).toBeGreaterThan(0);         // 空世界白天=阳光亮
  });

  // ---- ③ 滑行承载（传送 lerp:锚每 tick ≤5 格平移）----
  it('锚滑行(每拍 ≤5 格):逐拍公共对覆盖当前视口', () => {
    const L = new LightingEngine(makeWorld());
    const skyY = 20 * 16;
    let px = 100 * 16;
    L.ensureRegion(px, skyY, VIEW_W, VIEW_H);
    L.compute(0);
    for (let t = 0; t < 8; t++) {
      px += 5 * 16;   // lerp 率 0.1×剩余距离 的峰值单拍面（50 格起步 → 5 格/拍）
      L.ensureRegion(px, skyY, VIEW_W, VIEW_H);
      L.compute(0);
      expect(covers(L, viewport(px, skyY))).toBe(true);    // t1..t8 全程覆盖
    }
  });

  // ---- ④ 零回归（普通游玩:静置）----
  it('静置锚:公共对覆盖+lightAt 稳定（普通游玩零回归面）', () => {
    const L = new LightingEngine(makeWorld());
    const px = 100 * 16, py = 20 * 16;
    L.ensureRegion(px, py, VIEW_W, VIEW_H);
    L.compute(0);
    const c1 = L.lightAt(Math.floor(px / 16), Math.floor(py / 16));
    L.ensureRegion(px, py, VIEW_W, VIEW_H);   // 同点再锚:区域不变,无重算
    L.compute(0);
    expect(covers(L, viewport(px, py))).toBe(true);
    const c2 = L.lightAt(Math.floor(px / 16), Math.floor(py / 16));
    expect(c2).toEqual(c1);
  });
});
