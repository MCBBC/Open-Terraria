// BJ372 群系交界背景稳定性 + 黑闪画位判别面（2026-09-27 用户实报交界处远景 ABAB 抖动）。
// 定谳（探针 scripts/_bj372-bgosc-probe.mjs）：交界处 ABAB = zone 阈值信号翻转经
// 原版门控机器（30/60 帧延迟+负冷却+交叉淡化）的正常响应——机制面与原版 1:1
// （DrawBG :64956-65055 + HandleBackgroundTransition :65032-65055 +
// GetPreferredBGStyleForPlayer :65183-65215 逐行对拍,BJ178 五件套在盘完好）。
// 本仓真实差异 = 黑闪遮罩画位:原版逐槽内联于前景循环（DrawSurfaceBG 前景槽
// 循环 :60460-60532 每组层后紧跟 DrawSurfaceBG_DrawChangeOverlay(area) :62042），
// 曾全局后置单遍 = 黑闪盖住含新槽在内的一切 = 切换"跳"感知放大。三道闸：
//   ①Snow→Forest 翻转帧:黑闪(area0)画在森林层之后雪层之前（全局后置回退即红）
//   ②Ocean 槽无前景层但 overlay 照画（:60488-60490 无层支）
//   ③交界快速翻转 want 的 bgStyle 切换次数上限（BJ178 门控判别面;
//     变异靶 = 森林 60 帧偏置回退即红——want 每 45 帧翻转,机器须压到 ≤3 次）
import { describe, it, expect } from 'vitest';
import { BiomeBackground, FOREST_STYLES, OCEAN_STYLES, SNOW_STYLES } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

type Op = { kind: 'img'; tex: number; alpha: number }
  | { kind: 'fill'; r: number; g: number; b: number; a: number };

interface BgInternals {
  bgStyle: number; bgDelay: number; instantBG: number;
  alphaFront: number[]; alphaFar: number[];
  forestStyles: number[]; snowStyle: number; corruptStyle: number; oceanStyle: number;
  bgFlash: Float64Array;
}

function mkHarness() {
  const bg = new BiomeBackground();
  (bg as unknown as Record<string, unknown>).flippedOf = (im: { __tex: number }) => im;
  (bg as unknown as { img: (n: number) => { __tex: number } | null }).img = (n: number) =>
    n < 0 ? null : { width: 1152, height: 216, complete: true, __tex: n };
  // ★2026-10-03:测试面现在经 setBiomeVariant 武装黑闪(原版触发链)——warmStyle
  //   的真图集预热被 img mock 接管,stub 掉避免 loadBg 触真图集
  (bg as unknown as { warmStyle: (s: number) => void }).warmStyle = () => {};
  const ops: Op[] = [];
  const blit = {
    img: (im: { __tex: number }, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number,
      opts?: { alpha?: number }) => {
      ops.push({ kind: 'img', tex: im.__tex, alpha: opts?.alpha ?? 1 });
    },
    fill: (x: number, y: number, w: number, h: number, r: number, g: number, b: number, a?: number) => {
      ops.push({ kind: 'fill', r, g, b, a: a ?? 1 });
      void x; void y; void w; void h;
    },
  };
  const world = new World(400, 600, 7, 'bgx');
  world.groundLevel = 100;
  world.rockLevel = 200;
  world.treeX = [80, 200, 320];   // cam.x=800 → tileX 50 < 80 = Forest1 段
  const scene: Record<string, unknown> = {};
  const cam = { x: 800, y: 100 * 16 - 200, zoom: 1.25 };
  const frame = (): Op[] => {
    ops.length = 0;
    bg.draw(blit as never, world, scene as never, cam, 1512, 862, [1, 1, 1], 16.7, 'surface');
    return ops;
  };
  const st = (): BgInternals => bg as unknown as BgInternals;
  const texSet = (arr: readonly number[]) => new Set(arr.filter((n) => n >= 0));
  return { bg, st, frame, scene, cam, ops, texSet };
}

const isFill = (op: Op, area: number, a?: number): op is Extract<Op, { kind: 'fill' }> =>
  op.kind === 'fill' && op.r === 0 && op.g === 0 && op.b === 0 && (a === undefined || Math.abs(op.a - a) < 0.02);

describe('BJ372 群系切换黑闪逐槽画位（DrawSurfaceBG 前景循环 :60460-60532 内联）', () => {
  // ★2026-10-03 触发链改版（四柱区云山瞬闪案定谳刀）:黑闪点火源=变体旗实变
  //   （BackgroundChangeFlashInfo.UpdateVariation :25-33;玩法内唯一触发=天柱死亡
  //   重掷 869 链）——bgStyle 槽切换不再点火（原版槽切换只有交叉淡化,飞行跨群系
  //   每循环全屏黑闪=用户实报病灶）。本套画位判别改为 setBiomeVariant 武装闪 +
  //   交叉淡化同帧,逐槽序判别力原样保留。
  it('①雪→森林交叉淡化帧:黑闪(area0)在森林层之后、雪层之前;全局后置回退即红', () => {
    const { bg, st, frame, scene, texSet } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    // 森林→雪落定（30 帧门）——★新语义闸:槽切换零闪
    scene.zoneSnow = true;
    let flip: Op[] = [];
    for (let i = 0; i < 80; i++) {
      flip = frame();
      if (st().bgStyle === 7) break;
    }
    expect(st().bgStyle).toBe(7);
    expect(flip.some((op) => op.kind === 'fill')).toBe(false);   // 风格落定零闪（原版同相）
    for (let i = 0; i < 26; i++) frame();
    expect([...st().bgFlash].every((v) => v === 0)).toBe(true);
    // 雪→森林:先让 Forest1 落定（森林 want=60 帧门）并进入交叉淡化窗
    //   （森林槽 α 渐升>0——原版 overlay 画位在 bgAlphaFrontLayer[l]>0 门内），
    //   再以变体旗实变武装黑闪（869 重掷同链）→ 同帧 update 先衰减一档 0.95
    const snowRow = SNOW_STYLES[st().snowStyle];
    const snowT = texSet(snowRow.t);
    scene.zoneSnow = false;
    let landed = false;
    for (let i = 0; i < 200; i++) {
      frame();
      if (st().bgStyle === 0) { landed = true; break; }
    }
    expect(landed).toBe(true);
    frame();   // 森林槽 α 渐入(>0)——槽切换零闪（新语义）
    const forestNew = (st().forestStyles[0] + 1) % FOREST_STYLES.length;
    bg.setBiomeVariant('forest0', forestNew);            // 值实变→flash[0]=1
    const fsRow = FOREST_STYLES[st().forestStyles[0] % FOREST_STYLES.length];
    const forestT = texSet(fsRow.t);
    expect(st().bgFlash[0]).toBe(1);
    flip = frame();
    const fill0 = flip.find((op) => isFill(op, 0, 0.95));   // draw 内 update 先衰减一档(1−0.05)
    expect(fill0).toBeDefined();
    const fill0Idx = flip.indexOf(fill0!);
    const lastForest = Math.max(...flip.map((op, i) =>
      op.kind === 'img' && forestT.has(op.tex) ? i : -1));
    const firstSnowFront = Math.min(...flip.map((op, i) =>
      op.kind === 'img' && snowT.has(op.tex) ? i : flip.length));
    expect(lastForest).toBeGreaterThan(-1);
    expect(firstSnowFront).toBeLessThan(flip.length);
    expect(lastForest).toBeLessThan(fill0Idx);           // 森林层 → 黑闪
    expect(fill0Idx).toBeLessThan(firstSnowFront);       // 黑闪 → 雪层（雪画在黑闪上=原版）
    // 黑闪之后不得再有任何 fill（全局后置单遍回退的判别点）
    const fillsAfter = flip.filter((op, i) => i > fill0Idx && op.kind === 'fill');
    expect(fillsAfter.length).toBe(0);
    // 稳态:flash 衰减归零
    for (let i = 0; i < 30; i++) frame();
    expect([...st().bgFlash].every((v) => v === 0)).toBe(true);
  });

  it('②变体旗实变:同值重写不点火,异值实变点火 area6（UpdateVariation 值变判据）', () => {
    const { bg, st, frame, scene } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    scene.zoneSnow = true;
    for (let i = 0; i < 80; i++) frame();
    expect(st().bgStyle).toBe(7);
    const same = st().snowStyle;
    bg.setBiomeVariant('snow', same);                    // 同值:零点火
    expect(st().bgFlash[6]).toBe(0);
    const nv = (same + 1) % SNOW_STYLES.length;
    bg.setBiomeVariant('snow', nv);                      // 异值:点火
    expect(st().bgFlash[6]).toBe(1);
    const flip = frame();
    expect(flip.some((op) => isFill(op, 6, 0.95))).toBe(true);   // 遮罩照画（draw 内先衰减一档）
  });

  it('③Ocean 槽:无前景层组但黑闪 overlay 照画（:60488-60490 无层支）', () => {
    const { bg, st, frame, scene } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    scene.zoneBeach = true;                              // want=Ocean(4),30 帧门
    let flip: Op[] = [];
    for (let i = 0; i < 80; i++) {
      flip = frame();
      if (st().bgStyle === 4) break;
    }
    expect(st().bgStyle).toBe(4);
    expect(st().alphaFront[4]).toBeGreaterThan(0);       // 槽已激活
    expect(flip.some((op) => isFill(op, 10, 1))).toBe(false);  // 槽切换零闪（新语义）
    const nv = (st().oceanStyle + 1) % OCEAN_STYLES.length;
    bg.setBiomeVariant('ocean', nv);                     // 变体实变→点火
    flip = frame();
    expect(flip.some((op) => isFill(op, 10, 0.95))).toBe(true);   // area10 黑闪在场（draw 内先衰减一档）
  });

  it('③交界处 want 快速翻转:bgStyle 切换次数上限（BJ178 门控判别面;森林 60 帧偏置变异靶）', () => {
    const { st, frame, scene } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    // zoneSnow 每 45 帧翻转(交界阈值等值线徘徊)——原始 want 跟踪≈15 次切换;
    // 原版机器:雪切换(31帧)→负冷却 60 帧+森林 want 60 帧门压雪相 45 帧<61
    // → 全程至多个位数次切换
    let switches = 0;
    let prev = st().bgStyle;
    for (let t = 0; t < 700; t++) {
      scene.zoneSnow = Math.floor(t / 45) % 2 === 0;
      frame();
      if (st().bgStyle !== prev) { switches++; prev = st().bgStyle; }
    }
    expect(switches).toBeLessThanOrEqual(3);
    // 稳态收敛:翻转停止后 bgStyle 稳定在 want 上,flash 归零
    scene.zoneSnow = true;
    for (let i = 0; i < 130; i++) frame();
    expect(st().bgStyle).toBe(7);
    expect([...st().bgFlash].every((v) => v === 0)).toBe(true);
  });
});
