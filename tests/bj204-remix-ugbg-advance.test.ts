// BJ204（2026-09-20）remix 世界地下背景风格冻结修（BJ175 债①清算）。
// 病灶：Renderer 对 remix 世界整层跳过 surface 相位绘制（IIIII224，锚 Main.cs:60573
// ShouldDrawSurfaceBackground——原版门只摘地表层），而 BiomeBackground.draw 的
// update() 每帧单次推进门 = surface 相位吃真实 dt / underground 相位恒 0 → remix 下
// update 全帧 0 推进：ugAlpha 恒 0 → 地下带恒显旧风格（drawSlots(old,1-α)/new,α），
// 风格切换无交叉淡化 = 冻结锐化。
// 原版锚：地下风格推进在 DrawBackground :53638-53650（PickUnderground + ugBackTransition
// ±0.25/帧）每帧照跑，无 remix 门；ShouldDrawSurfaceBackground 只摘地表层绘制。
// 修法：remix 时 underground 相位调用承接真实 dt（Renderer :3857 恒 16.7）→ 每帧
// 单次推进不缺位；非 remix 恒 0 = 逐位不变（本文件②为不变性闸）。
import { describe, it, expect } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

interface Rec { tex: number; alpha: number }
interface UgSt { ugStyle: number; ugOld: number; ugAlpha: number }

function mkHarness(remix: boolean) {
  const bg = new BiomeBackground();
  (bg as unknown as Record<string, unknown>).flippedOf = (im: { __tex: number }) => im;
  (bg as unknown as { img: (n: number) => { __tex: number } | null }).img = (n: number) =>
    n < 0 ? null : { width: 160, height: 288, complete: true, __tex: n };
  // 地狱多层远景缓存置空（Node 无 Image；同 tests/underground-bg-tiling 桩）
  (bg as unknown as { hellImgs: Map<number, unknown> }).hellImgs =
    new Map(Array.from({ length: 14 }, (_, n) => [n, null]));
  const recs: Rec[] = [];
  const blit = {
    img: (im: { __tex: number }, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number,
      opts?: { alpha?: number }) => { recs.push({ tex: im.__tex, alpha: opts?.alpha ?? 1 }); },
    fill: () => {},
  };
  const world = new World(400, 600, 7, 'bj204');
  world.groundLevel = 100;
  world.rockLevel = 200;
  if (remix) (world as unknown as { seedFlags: Record<string, boolean> }).seedFlags = { remix: true };
  // zoneJungle → pickUnderground :53474-53483 无条件 style=11 ≠ 初始 0 → 强制翻转判别位
  const scene: Record<string, unknown> = { zoneJungle: true };
  const cam = { x: 800, y: 3000, zoom: 1.25 };   // 深土带（surfacePx=1600 远在屏上）
  const frame = () => {
    recs.length = 0;
    bg.draw(blit as never, world, scene as never, cam, 1512, 862, [1, 1, 1], 16.7, 'underground');
  };
  const st = () => bg as unknown as UgSt;
  return { st, frame, recs };
}

describe('BJ204 remix 地下背景推进（DrawBackground :53638-53650 无 remix 门）', () => {
  it('①remix：underground 相位承接真实 dt → ugStyle 翻转 + ugAlpha 0.25/帧坡道到 1', () => {
    const { st, frame } = mkHarness(true);
    frame();
    expect(st().ugStyle).toBe(11);       // 风格落定（dt 无关分支）
    expect(st().ugAlpha).toBeGreaterThan(0.1);   // ★修复前恒 0（冻结锐化）
    for (let i = 0; i < 5; i++) frame();
    expect(st().ugAlpha).toBe(1);        // 0.25/帧×16.7ms 坡道吸合（capped）
    expect(st().ugOld).toBe(0);          // 旧槽 = 初始风格（交叉淡化语义保持）
  });

  it('②非 remix：underground 相位恒 0 推进（逐位不变闸——ugAlpha 永不涨）', () => {
    const { st, frame } = mkHarness(false);
    for (let i = 0; i < 8; i++) frame();
    expect(st().ugAlpha).toBe(0);        // 推进仍由 surface 相位独占（Renderer :3703/3711）
  });

  it('③remix 吸合后新风格带以 α=1 实绘（可见面复原，非仅内部态）', () => {
    const { frame, recs } = mkHarness(true);
    for (let i = 0; i < 6; i++) frame();
    const painted = recs.filter((r) => r.alpha > 0.99);
    expect(painted.length).toBeGreaterThan(0);   // 新风格带层（α≥0.99）落 blit
    expect(recs.some((r) => r.alpha > 0.01 && r.alpha < 0.99)).toBe(false); // 吸合后无半透明中间帧
  });
});
