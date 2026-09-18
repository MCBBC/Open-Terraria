// 远景背景过渡双通道回归（2026-09-19 用户实报"群系切换远景背景瞬切,原版会过渡"）：
// 原版地表群系过渡 = bgDelay 等待（新森林 60/非森林 30 帧）+ 新旧【双槽】±0.05/帧
// 交叉淡化（DrawBG :64956-64971 + DrawBG_HandleBackgroundTransition :63508-63527 +
// UpdateBGVisibility_FrontLayer :65065 逐槽驱动；绘制侧前景逐槽 :60460-60532、
// 远山 Step1 :60768-60823 / Step2 :60836-60912、bgStyle→far 槽映射 :65123）。
// 传送 = instantBGTransitionCounter=10 一帧吸合（BlackFadeCameraTeleport :63513，
// BJ103-A1b/BJ108 面——update() 消费 instantBG>0 → speed=1）,黑幕遮蔽下无中间帧。
// 本仓病灶 = drawSurface 曾只绘当前 bgStyle 单槽：flip 帧旧槽 α 仍在衰减但不再绘制
// = 旧背景一帧消失（露天空）+ 新背景从 0 淡入 = "瞬切"。本文件四道闸：
//   ①普通切换双槽交叉淡化逐帧采样（变异靶 M1：单槽化回退即红）
//   ②传送 instant 通道保持（一帧吸合、无半透明帧——BJ108 不回归）
//   ③远山槽映射 + 丛林远山驻留（变异靶 M2：同号化回退即红）
//   ④沙漠侵染列按【槽】解析（变异靶 M3：bgStyle 键回退即红）
import { describe, it, expect } from 'vitest';
import { BiomeBackground, FOREST_STYLES, CORRUPT_STYLES, JUNGLE_STYLES, DESERT_STYLES } from '../src/render/BiomeBackground';
import { World } from '../src/world/World';

interface Rec { tex: number; alpha: number }

interface BgInternals {
  bgStyle: number; bgDelay: number; instantBG: number;
  alphaFront: number[]; alphaFar: number[];
  forestStyles: number[]; corruptStyle: number; jungleStyle: number;
  desertStyle: number;
}

function mkHarness() {
  const bg = new BiomeBackground();
  // Node 桩：img() 返回带 __tex 标记的伪贴图；flip 烘焙直通（无 DOM）
  (bg as unknown as Record<string, unknown>).flippedOf = (im: { __tex: number }) => im;
  (bg as unknown as { img: (n: number) => { __tex: number } | null }).img = (n: number) =>
    n < 0 ? null : { width: 1152, height: 216, complete: true, __tex: n };
  const recs: Rec[] = [];
  const blit = {
    img: (im: { __tex: number }, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number,
      opts?: { alpha?: number }) => {
      recs.push({ tex: im.__tex, alpha: opts?.alpha ?? 1 });
    },
    fill: () => {},
  };
  const world = new World(400, 600, 7, 'bgx');
  world.groundLevel = 100;
  world.rockLevel = 200;
  world.treeX = [80, 200, 320];   // cam.x=800 → tileX 50 < 80 = Forest1 段
  const scene: Record<string, unknown> = {};
  const cam = { x: 800, y: 100 * 16 - 200, zoom: 1.25 };
  const frame = (): Rec[] => {
    recs.length = 0;
    bg.draw(blit as never, world, scene as never, cam, 1512, 862, [1, 1, 1], 16.7, 'surface');
    return recs;
  };
  const st = (): BgInternals => bg as unknown as BgInternals;
  const texSet = (arr: readonly number[]) => new Set(arr.filter((n) => n >= 0));
  return { bg, st, frame, scene, cam, recs, texSet };
}

/** 驱动到 bgStyle 翻转,返回翻转帧 recs（等待期不变式由 cb 逐帧校验） */
function driveToFlip(
  frame: () => Rec[], st: () => BgInternals, from: number, waitCheck?: (r: Rec[]) => void,
): Rec[] {
  for (let i = 0; i < 80; i++) {
    const r = frame();
    if (st().bgStyle !== from) return r;
    waitCheck?.(r);
  }
  throw new Error('bgStyle 80 帧内未翻转（bgDelay 链断裂）');
}

describe('群系背景过渡双通道（DrawBG :64956 + HandleBackgroundTransition :63508）', () => {
  it('①森林→腐化：等待期旧景独绘 α=1,翻转帧起新旧双槽 ±0.05/帧 交叉淡化', () => {
    const { st, frame, scene, texSet } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    expect(st().bgStyle).toBe(0);
    const fsRow = FOREST_STYLES[st().forestStyles[0] % FOREST_STYLES.length];
    const csRow = CORRUPT_STYLES[st().corruptStyle];
    const forestT = texSet(fsRow.t);
    const forestM = texSet(fsRow.m);
    const csTex = texSet(csRow);
    expect([...forestT].some((t) => csTex.has(t))).toBe(false);   // 判别力前提:两族贴图无交
    scene.zoneCorrupt = true;
    // 翻转帧:双槽同绘——前景 森林0.95/腐化0.05,远山 森林m0.95/腐化24 0.05
    const flip = driveToFlip(frame, st, 0, (r) => {
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((x) => x.alpha === 1)).toBe(true);          // 等待期无半透明
      expect(r.some((x) => csTex.has(x.tex))).toBe(false);        // 等待期无新景
    });
    expect(st().bgStyle).toBe(1);
    expect(flip.some((r) => forestT.has(r.tex) && Math.abs(r.alpha - 0.95) < 0.02)).toBe(true);
    expect(flip.some((r) => forestM.has(r.tex) && Math.abs(r.alpha - 0.95) < 0.02)).toBe(true);
    expect(flip.some((r) => csTex.has(r.tex) && Math.abs(r.alpha - 0.05) < 0.02)).toBe(true);
    expect(flip.some((r) => r.tex === 24 && Math.abs(r.alpha - 0.05) < 0.02)).toBe(true);
    // 中段:α 交叉(第 10 帧 ≈ 0.5/0.5)
    let recs: Rec[] = [];
    for (let i = 0; i < 9; i++) recs = frame();
    expect(recs.some((r) => forestT.has(r.tex) && Math.abs(r.alpha - 0.5) < 0.04)).toBe(true);
    expect(recs.some((r) => csTex.has(r.tex) && Math.abs(r.alpha - 0.5) < 0.04)).toBe(true);
    // 完成:仅腐化 @1,森林层全退
    for (let i = 0; i < 14; i++) recs = frame();
    expect(recs.some((r) => csTex.has(r.tex) && r.alpha === 1)).toBe(true);
    expect(recs.some((r) => forestT.has(r.tex))).toBe(false);
    expect(recs.some((r) => forestM.has(r.tex))).toBe(false);
  });

  it('②传送 instant 通道保持（BJ103-A1b/BJ108）:instantBGTransition() 一帧吸合无半透明帧', () => {
    const { bg, st, frame, scene, texSet } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    const fsRow = FOREST_STYLES[st().forestStyles[0] % FOREST_STYLES.length];
    const csRow = CORRUPT_STYLES[st().corruptStyle];
    const forestT = texSet(fsRow.t);
    const csTex = texSet(csRow);
    scene.zoneCorrupt = true;
    bg.instantBGTransition();          // :63513 等价:计数 10 + bgDelay 清零
    expect(st().bgDelay).toBe(0);
    const recs = frame();              // 一帧吸合(黑幕遮蔽,无过渡中间态)
    expect(st().bgStyle).toBe(1);
    expect(st().alphaFront[1]).toBeGreaterThanOrEqual(1);
    expect(st().alphaFront[0]).toBeLessThanOrEqual(0);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.alpha >= 1)).toBe(true);   // 无 0<α<1 过渡帧
    expect(recs.some((r) => csTex.has(r.tex))).toBe(true);
    expect(recs.some((r) => forestT.has(r.tex))).toBe(false);
  });

  it('③森林→丛林:远山槽0共用驻留(不淡化),前景树层交叉淡化（far 槽映射 :65123）', () => {
    const { bg, st, frame, scene, texSet } = mkHarness();
    for (let i = 0; i < 5; i++) frame();   // 首帧先跑 seedFor,变体才不被重掷冲掉
    bg.setBiomeVariant('jungle', 0);       // 钉丛林行 0（档 5 落槽 15 才淡出——非本例）
    const fsRow = FOREST_STYLES[st().forestStyles[0] % FOREST_STYLES.length];
    const jsRow = JUNGLE_STYLES[st().jungleStyle];
    const forestM = texSet(fsRow.m);
    const forestT = texSet(fsRow.t);
    const jsTex = texSet(jsRow);
    scene.zoneJungle = true;
    const flip = driveToFlip(frame, st, 0);
    // 远山(槽0)驻留:翻转帧 m 贴图 α=1——丛林与森林共用 far 槽 0,山体不参与淡化
    expect(flip.some((r) => forestM.has(r.tex) && r.alpha === 1)).toBe(true);
    expect(flip.some((r) => forestT.has(r.tex) && Math.abs(r.alpha - 0.95) < 0.02)).toBe(true);
    expect(flip.some((r) => jsTex.has(r.tex) && Math.abs(r.alpha - 0.05) < 0.02)).toBe(true);
    // 完成后:远山仍在(α=1),前景只剩丛林
    let recs: Rec[] = [];
    for (let i = 0; i < 25; i++) recs = frame();
    expect(recs.some((r) => forestM.has(r.tex) && r.alpha === 1)).toBe(true);
    expect(recs.some((r) => jsTex.has(r.tex) && r.alpha === 1)).toBe(true);
    expect(recs.some((r) => forestT.has(r.tex))).toBe(false);
  });

  it('④沙漠→腐化沙漠:旧槽2按 Pure 列衰减、新槽5按侵染列上升（列解析锚槽位）', () => {
    const { bg, st, frame, scene } = mkHarness();
    for (let i = 0; i < 3; i++) frame();   // 首帧先跑 seedFor
    bg.setBiomeVariant('desert', 5);       // 行 5 = 侵染族（p/c/h/r 四列齐全）,钉档防重掷
    scene.zoneDesert = true;
    driveToFlip(frame, st, 0);         // 森林→沙漠
    let recs: Rec[] = [];
    for (let i = 0; i < 30; i++) recs = frame();   // 淡化走完,稳态沙漠
    expect(st().bgStyle).toBe(2);
    expect(recs.some((r) => r.tex === 306 && r.alpha === 1)).toBe(true);   // Pure 列
    expect(recs.some((r) => r.tex === 23 && r.alpha === 1)).toBe(true);    // 远山槽1(行5≠档4)
    // 沙漠内腐化化:want=CorruptDesert(5)
    scene.zoneCorrupt = true;
    const flip = driveToFlip(frame, st, 2);
    expect(st().bgStyle).toBe(5);
    // 旧槽2仍按 Pure 列 306 衰减(@0.95),新槽5按 c 列 310 上升(@0.05);
    // 远山:槽1(23)衰减 / 槽2(24)上升 = 沙漠↔腐化沙漠远山异槽交叉淡化
    expect(flip.some((r) => r.tex === 306 && Math.abs(r.alpha - 0.95) < 0.02)).toBe(true);
    expect(flip.some((r) => r.tex === 310 && Math.abs(r.alpha - 0.05) < 0.02)).toBe(true);
    expect(flip.some((r) => r.tex === 23 && Math.abs(r.alpha - 0.95) < 0.02)).toBe(true);
    expect(flip.some((r) => r.tex === 24 && Math.abs(r.alpha - 0.05) < 0.02)).toBe(true);
  });

  it('⑤森林→森林同 treeStyle:瞬切通道一帧吸合（instantBGTransitionCounter=1 面）', () => {
    const { st, frame, cam } = mkHarness();
    for (let i = 0; i < 5; i++) frame();
    cam.x = 81 * 16;                 // 跨 treeX[0] → Forest2（treeStyle 默认全 0 = 同生成背景）
    const recs = frame();
    expect(st().bgStyle).toBe(10);
    expect(st().alphaFront[10]).toBeGreaterThanOrEqual(1);
    expect(recs.every((r) => r.alpha >= 1)).toBe(true);   // 无淡化中间帧
  });
});
