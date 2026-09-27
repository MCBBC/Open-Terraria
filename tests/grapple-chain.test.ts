// 钩爪链分节贴图 1:1 测试——原版行号 = Terarria1456 反编译源码。
//
// 覆盖：ChainID 全表（ChainID.cs）、HOOK_CHAINS/HOOK_HEADS 32 型号全表
// （Main.cs DrawProjDirect 链段 if-else 链 :28188-29206 + 偏移表 :29395+）、
// 贴图可用性（PNG IHDR 逐张尺寸 = 缺图兜底名单恒空）、分节几何（步进/停铺门/
// 起点偏移/旋转偏移/首节跳过）、钩头绘制公式（:29886 同构）、段光/沿线光
// （332/488/446/646-649）、PlotLine Bresenham（Utils.cs:2329-2368）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import { GrappleProj } from '../src/entities/GrappleProj';
import type { GrappleDrawHost } from '../src/entities/GrappleProj';
import { HOOK_PROJ_STATS } from '../src/data/grappleHooks';
import {
  CHAIN_ID, CHAIN_ID_COUNT, HOOK_CHAINS, HOOK_HEADS,
  hookChainOf, hookHeadOf, SKELETRON_HAND_ROT,
} from '../src/data/grappleChains';

const SPRITES = join(__dirname, '..', 'public', 'sprites', 'vanilla');

/** PNG IHDR 尺寸（宽 @16 / 高 @20，大端 u32；入参可带 vanilla/ 前缀） */
function pngSize(rel: string): [number, number] {
  const b = readFileSync(join(SPRITES, rel.replace(/^vanilla\//, '')));
  expect(b.slice(1, 4).toString('ascii')).toBe('PNG');   // 魔数护栏
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// ---- mock 渲染宿主 ----

type SegOp = { kind: 'seg'; tex: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; rot: number };
type HeadOp = { kind: 'head'; tex: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; rot: number };

/** 记录 translate/rotate/drawImage 的假 ctx（世界系原语录制；save/restore 快照坐标/旋转） */
function makeCtxRecorder() {
  const segs: Array<SegOp | HeadOp> = [];
  const strokes: number[] = [];
  const fills: number[] = [];
  let x = 0, y = 0, rot = 0;
  const stack: Array<[number, number, number]> = [];
  const texOf = new Map<object, string>();
  const ctx = {
    imageSmoothingEnabled: true, globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { stack.push([x, y, rot]); },
    restore() { const s = stack.pop(); if (s) { [x, y, rot] = s; } },
    translate(nx: number, ny: number) { x = nx; y = ny; },
    rotate(r: number) { rot += r; },
    drawImage(img: never, ...a: number[]) {
      const tex = texOf.get(img)!;
      const d = img as unknown as { width: number; height: number };
      if (a.length === 2) {
        segs.push({ kind: tex.startsWith('Projectile_') ? 'head' : 'seg', tex, sx: 0, sy: 0, sw: d.width, sh: d.height, dx: x + a[0], dy: y + a[1], rot });
      } else {
        segs.push({ kind: tex.startsWith('Projectile_') ? 'head' : 'seg', tex, sx: a[0], sy: a[1], sw: a[2], sh: a[3], dx: x + a[4], dy: y + a[5], rot });
      }
    },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push(1); },
    fillRect() { fills.push(1); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, segs, strokes, fills, texOf };
}

/** 假贴图（尺寸 = 磁盘 PNG 实际尺寸） */
function stubImages(rec: ReturnType<typeof makeCtxRecorder>, files: string[]) {
  const map = new Map<string, object>();
  for (const f of files) {
    const [w, h] = pngSize(f);
    const img = { width: w, height: h };
    map.set(f, img);
    rec.texOf.set(img, f.replace(/^vanilla\//, ''));   // 保留 .png（与 HOOK_CHAINS.tex 同名）
  }
  return map;
}

interface Light { x: number; y: number; r: number; g: number; b: number }

/** 组装 draw 宿主（atlas=尺寸桩 / lighting=录制 / world 可选） */
function makeHost(rec: ReturnType<typeof makeCtxRecorder>, files: string[],
  world?: GrappleDrawHost['world']): GrappleDrawHost & { lights: Light[] } {
  const map = stubImages(rec, files);
  const lights: Light[] = [];
  return {
    ctx: rec.ctx,
    atlas: { ensureVImage: (f: string) => (map.get(f) as CanvasImageSource | undefined) ?? null },
    lighting: {
      addLight(x: number, y: number, r: number, g: number, b: number) { lights.push({ x, y, r, g, b }); },
    },
    world: world ?? null,
    lights,
  };
}

/** 假玩家（draw 只消费 cx/cy） */
function fakePlayer(cx: number, cy: number): Player {
  return { cx, cy } as unknown as Player;
}

/** 构造钩爪弹体并直接 draw（默认玩家中心 (1300,1000)、钩心 (1000,1000) → 水平链 300px）。
 *  构造后精确居中到 hook（各型号盒尺寸不同）并镜像 aiStep 后的 rotation 状态 */
function drawHook(projType: number, host: GrappleDrawHost,
  hook = { cx: 1000, cy: 1000 }, player = { cx: 1300, cy: 1000 }) {
  const g = new GrappleProj(hook.cx, hook.cy, 0, 0, projType,
    () => fakePlayer(player.cx, player.cy));
  g.x = hook.cx - g.w / 2;                              // 盒居中（构造参 x/y 为左上角）
  g.y = hook.cy - g.h / 2;
  g.rot = Math.atan2(player.cy - hook.cy, player.cx - hook.cx) - Math.PI / 2;  // :49658
  g.draw(host, null);
  return g;
}

/** 一次 draw 需要取的全部贴图（链 + 发光层 + 钩头） */
function filesFor(type: number): string[] {
  const spec = HOOK_CHAINS[type];
  return [`vanilla/${spec.tex}`, ...(spec.glowTex ? [`vanilla/${spec.glowTex}`] : []),
    `vanilla/Projectile_${type}.png`];
}

/** AI 期沿线光驱动（复审③ 2026-08-21：446/646-649 沿线光回迁 AI 期——原版
 *  Projectile.cs:49687-49727 AI 段 AddLight，本仓经 fixedUpdate→GameHooks.
 *  addLightAt 发射）。几何同 drawHook（钩心 (1000,1000)/玩家心 (1300,1000)），
 *  addLightAt 像素坐标→格坐标录制。玩家桩 isBlacklistedForGrappling=true 防
 *  实心世界挂墙进 doLatch（光测试不涉挂墙链）。 */
function aiDriveLineLight(projType: number,
  store: { inBounds(x: number, y: number): boolean; isActive(x: number, y: number): boolean; get(x: number, y: number): number },
  hook = { cx: 1000, cy: 1000 }, player = { cx: 1300, cy: 1000 }): Light[] {
  const lights: Light[] = [];
  const mkPlayer = (): Player => ({
    cx: player.cx, cy: player.cy, dead: false,
    buffs: { has: () => false },
    isBlacklistedForGrappling: () => true,
  } as unknown as Player);
  const hooks = {
    world: { store },
    player: mkPlayer(),
    addLightAt: (px: number, py: number, r: number, g: number, b: number) => {
      lights.push({ x: Math.floor(px / TILE), y: Math.floor(py / TILE), r, g, b });
    },
  } as never;
  const g = new GrappleProj(hook.cx, hook.cy, 0, 0, projType, mkPlayer);
  g.x = hook.cx - g.w / 2;                              // 盒居中（同 drawHook）
  g.y = hook.cy - g.h / 2;
  g.fixedUpdate(1 / 60, hooks);
  return lights;
}

// ---- ChainID 全表 ----

describe('ChainID 全表（ChainID.cs）', () => {
  it('17 条槽位 0..16 与名字一一对应', () => {
    expect(CHAIN_ID_COUNT).toBe(17);
    expect(CHAIN_ID).toEqual({
      TendonHook: 0, ThornHook: 1, IlluminantHook: 2, Wormhook: 3,
      SilkRope: 4, SilkRope2: 5, WebRope: 6, WebRope2: 7,
      LunarSolar: 8, LunarVortex: 9, LunarNebula: 10, LunarStardust: 11,
      LunarSolarGlow: 12, LunarVortexGlow: 13, LunarNebulaGlow: 14, LunarStardustGlow: 15,
      StaticHook: 16,
    });
  });

  it('Chains_N 槽位与钩爪型号的数组下标消费式一致（Main.cs:28856-28869）', () => {
    // 486-489 → Chains[type-486]；646-649 → Chains[type-646+8] + 发光 +12；652 → Chains[16]
    expect(HOOK_CHAINS[486].tex).toBe(`Chains_${CHAIN_ID.TendonHook}.png`);
    expect(HOOK_CHAINS[487].tex).toBe(`Chains_${CHAIN_ID.ThornHook}.png`);
    expect(HOOK_CHAINS[488].tex).toBe(`Chains_${CHAIN_ID.IlluminantHook}.png`);
    expect(HOOK_CHAINS[489].tex).toBe(`Chains_${CHAIN_ID.Wormhook}.png`);
    expect(HOOK_CHAINS[646].tex).toBe(`Chains_${CHAIN_ID.LunarSolar}.png`);
    expect(HOOK_CHAINS[647].tex).toBe(`Chains_${CHAIN_ID.LunarVortex}.png`);
    expect(HOOK_CHAINS[648].tex).toBe(`Chains_${CHAIN_ID.LunarNebula}.png`);
    expect(HOOK_CHAINS[649].tex).toBe(`Chains_${CHAIN_ID.LunarStardust}.png`);
    expect(HOOK_CHAINS[646].glowTex).toBe(`Chains_${CHAIN_ID.LunarSolarGlow}.png`);
    expect(HOOK_CHAINS[647].glowTex).toBe(`Chains_${CHAIN_ID.LunarVortexGlow}.png`);
    expect(HOOK_CHAINS[648].glowTex).toBe(`Chains_${CHAIN_ID.LunarNebulaGlow}.png`);
    expect(HOOK_CHAINS[649].glowTex).toBe(`Chains_${CHAIN_ID.LunarStardustGlow}.png`);
    expect(HOOK_CHAINS[652].tex).toBe(`Chains_${CHAIN_ID.StaticHook}.png`);
  });
});

// ---- 全表覆盖 + 贴图可用性 ----

describe('HOOK_CHAINS/HOOK_HEADS 全表', () => {
  it('32 型号与 HOOK_PROJ_STATS 键集完全一致（aiStyle7 全集）', () => {
    expect([...Object.keys(HOOK_CHAINS).map(Number)].sort((a, b) => a - b))
      .toEqual([...Object.keys(HOOK_PROJ_STATS).map(Number)].sort((a, b) => a - b));
    for (const t of Object.keys(HOOK_PROJ_STATS)) expect(hookChainOf(Number(t))).not.toBeNull();
  });

  it('缺图兜底名单恒空（链/发光层/钩头贴图全部就位）', () => {
    const missing: string[] = [];
    for (const [t, spec] of Object.entries(HOOK_CHAINS)) {
      for (const f of [spec.tex, ...(spec.glowTex ? [spec.glowTex] : []), `Projectile_${t}.png`]) {
        try { pngSize(f); } catch { missing.push(`${t}:${f}`); }
      }
    }
    expect(missing).toEqual([]);
  });

  it('step:null 型号的贴图尺寸可解析（大分支 num112 = Height）', () => {
    for (const spec of Object.values(HOOK_CHAINS)) {
      if (spec.step === null) {
        const [w, h] = pngSize(spec.tex);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
      }
    }
  });
});

// ---- 逐型号几何金标（Main.cs 各分支硬编码） ----

describe('分节几何金标', () => {
  it('简单分支步进/停铺门（各型号 :28190-29020）', () => {
    expect(HOOK_CHAINS[13]).toMatchObject({ tex: 'Chain.png', step: 12, stop: 25 });
    expect(HOOK_CHAINS[32]).toMatchObject({ tex: 'Chain5.png', step: 28, stop: 28, backOff: 8 });
    expect(HOOK_CHAINS[73]).toMatchObject({ tex: 'Chain8.png', step: 12, stop: 25 });
    expect(HOOK_CHAINS[74]).toMatchObject({ tex: 'Chain9.png', step: 12, stop: 25 });
    expect(HOOK_CHAINS[165]).toMatchObject({ tex: 'Chain15.png', step: 24, stop: 25 });
    expect(HOOK_CHAINS[256]).toMatchObject({ tex: 'Chain20.png', step: 26, stop: 26, rotOff: -0.785 });
    expect(HOOK_CHAINS[315]).toMatchObject({ tex: 'Chain28.png', step: 40, stop: 50 });
    expect(HOOK_CHAINS[322]).toMatchObject({ tex: 'Chain29.png', step: 22, stop: 22 });
    expect(HOOK_CHAINS[331]).toMatchObject({ tex: 'Chain30.png', step: 24, stop: 30 });
    expect(HOOK_CHAINS[332]).toMatchObject({ tex: 'Chain31.png', step: 16, stop: 30, frameRows: 'seg' });
    expect(HOOK_CHAINS[372]).toMatchObject({ tex: 'Chain33.png', step: null, stop: null });
    expect(HOOK_CHAINS[396]).toMatchObject({ tex: 'Chain35.png', alphaFactor: 155 / 255 });
    expect(HOOK_CHAINS[403]).toMatchObject({ tex: 'Chain36.png' });
    expect(HOOK_CHAINS[446]).toMatchObject({ tex: 'Extra_3.png', hookBack: 20, frameRows: 'tick7', lineLight: [0, 0.4, 0.3] });
    expect(HOOK_CHAINS[486]).toMatchObject({ tex: 'Chains_0.png' });
    expect(HOOK_CHAINS[487]).toMatchObject({ tex: 'Chains_1.png', hookBack: 8 });
    expect(HOOK_CHAINS[488]).toMatchObject({ tex: 'Chains_2.png', fullBright: true, segLight: [0.2, 0, 0.175] });
    expect(HOOK_CHAINS[489]).toMatchObject({ tex: 'Chains_3.png', hookBack: 10 });
    expect(HOOK_CHAINS[753]).toMatchObject({ tex: 'Extra_95.png', stop: 25 });
    expect(HOOK_CHAINS[865]).toMatchObject({ tex: 'Extra_154.png', stop: 25, skipFirst: true });
    expect(HOOK_CHAINS[935]).toMatchObject({ tex: 'Extra_208.png', stop: 8, skipFirst: true });
    // 宝石钩 230-235 → GemChain_[type-229]（Main.cs:28524-28533）
    for (let t = 230; t <= 235; t++) {
      expect(HOOK_CHAINS[t]).toMatchObject({ tex: `GemChain_${t - 229}.png`, step: null, stop: 25 });
    }
    // 月亮四色沿线光（Projectile.cs:49705-49727）
    expect(HOOK_CHAINS[646].lineLight).toEqual([0.7, 0.5, 0.1]);
    expect(HOOK_CHAINS[647].lineLight).toEqual([0, 0.6, 0.7]);
    expect(HOOK_CHAINS[648].lineLight).toEqual([0.6, 0.2, 0.6]);
    expect(HOOK_CHAINS[649].lineLight).toEqual([0.6, 0.6, 0.9]);
  });

  it('钩头偏移/帧数（Main.cs:29395+ 仅 5 型号非零；projFrames 仅 652=6）', () => {
    expect(HOOK_HEADS).toEqual({
      315: { n143: -13, n144: -6 },
      331: { n144: -4 },
      486: { n143: -6 },
      488: { n144: -8 },
      489: { n143: -2 },
      652: { frames: 6, frameTicks: 7 },
    });
    expect(hookHeadOf(13)).toEqual({});
    expect(SKELETRON_HAND_ROT).toBeCloseTo(3.9250002, 6);
  });
});

// ---- draw() 几何（mock 宿主全链） ----

describe('链段绘制几何', () => {
  /** 只取链段（排除钩头） */
  const segsOf = (segs: Array<SegOp | HeadOp>) => segs.filter((s) => s.kind === 'seg');
  /** 段心（= 原版 EntitySpriteDraw 的 position；录制 dx 是贴图左缘） */
  const pivot = (s: SegOp | HeadOp) => s.dx + s.sw / 2;

  it('13 普通钩：300px 水平链 → 23 节、末节距玩家 24px、旋转 −π/2', () => {
    const rec = makeCtxRecorder();
    drawHook(13, makeHost(rec, filesFor(13)));
    const segs = segsOf(rec.segs);
    expect(segs.length).toBe(23);                       // 300−12n<25 → n=23
    expect(pivot(segs[0])).toBeCloseTo(1012, 6);        // 首节 = 钩心 + 12
    expect(pivot(segs[segs.length - 1])).toBeCloseTo(1276, 6); // 末节距玩家 24px(<25 停)
    for (const s of segs) {
      expect(s.dy + s.sh / 2).toBeCloseTo(1000, 6);
      expect(s.rot).toBeCloseTo(-Math.PI / 2, 6);       // atan2(0,300)−π/2
    }
  });

  it('32 常春藤鞭：起点反退 8（远离玩家）→ 首节 = 钩心+20、共 11 节', () => {
    const rec = makeCtxRecorder();
    drawHook(32, makeHost(rec, filesFor(32)));
    const segs = segsOf(rec.segs);
    expect(segs.length).toBe(11);                       // 308−28n<28 → n=11
    expect(pivot(segs[0])).toBeCloseTo(1020, 6);        // 反退 8 + 步进 28
  });

  it('165 吐蛛丝者：步进 24 → 12 节', () => {
    const rec = makeCtxRecorder();
    drawHook(165, makeHost(rec, filesFor(165)));
    expect(segsOf(rec.segs).length).toBe(12);           // 300−24n<25 → n=12
  });

  it('315 蝙蝠钩：步进 40/停 50 → 7 节', () => {
    const rec = makeCtxRecorder();
    drawHook(315, makeHost(rec, filesFor(315)));
    expect(segsOf(rec.segs).length).toBe(7);            // 300−40n<50 → n=7
  });

  it('256 骷髅王之手：旋转偏移 −0.785', () => {
    const rec = makeCtxRecorder();
    drawHook(256, makeHost(rec, filesFor(256)));
    for (const s of segsOf(rec.segs)) {
      expect(s.rot).toBeCloseTo(-Math.PI / 2 - 0.785, 6);
    }
  });

  it('大分支（372）：步进 = 贴图高 12、停 = 13 → 24 节', () => {
    const rec = makeCtxRecorder();
    drawHook(372, makeHost(rec, filesFor(372)));
    const segs = segsOf(rec.segs);
    expect(segs.length).toBe(24);                       // 300−12n<13 → n=24
    expect(pivot(segs[0])).toBeCloseTo(1012, 6);
  });

  it('大分支起点偏移（446 hookBack20/489 hookBack10/487 hookBack8）', () => {
    // 446：Extra_3 高 64 → 帧高 16 步进；起点净前移 20−16/2=12 → 首节 = 钩心+28
    let rec = makeCtxRecorder();
    drawHook(446, makeHost(rec, filesFor(446)));
    let segs = segsOf(rec.segs);
    expect(pivot(segs[0])).toBeCloseTo(1028, 6);
    expect(segs.length).toBe(17);                       // 288−16n<17 → n=17
    // 489：Chains_3 高 30 步进；净后撤 10−15=−5 → 起点距玩家 305、首节 = 钩心+25
    rec = makeCtxRecorder();
    drawHook(489, makeHost(rec, filesFor(489)));
    segs = segsOf(rec.segs);
    expect(pivot(segs[0])).toBeCloseTo(1025, 6);
    expect(segs.length).toBe(10);                       // 305−30n<31 → n=10
    // 487：Chains_1 高 28 步进；净后撤 8−14=−6 → 起点距玩家 306、首节 = 钩心+22
    rec = makeCtxRecorder();
    drawHook(487, makeHost(rec, filesFor(487)));
    segs = segsOf(rec.segs);
    expect(pivot(segs[0])).toBeCloseTo(1022, 6);
    expect(segs.length).toBe(10);                       // 306−28n<29 → n=10
  });

  it('865/935 首节推进不绘制（flag12/flag14）', () => {
    let rec = makeCtxRecorder();
    drawHook(865, makeHost(rec, filesFor(865)));
    let segs = segsOf(rec.segs);
    expect(segs.length).toBe(22);                       // 300−12n≥25 → n=23 推进、首节跳过 → 22 绘制
    expect(pivot(segs[0])).toBeCloseTo(1024, 6);        // 首绘 = 第 2 节
    rec = makeCtxRecorder();
    drawHook(935, makeHost(rec, filesFor(935)));
    segs = segsOf(rec.segs);
    expect(segs.length).toBe(36);                       // 300−8n≥8 → n=37 推进、跳首 → 36
    expect(pivot(segs[0])).toBeCloseTo(1016, 6);        // Extra_208 高 8：首绘 = 钩心+16
  });

  it('332 圣诞钩：四帧行逐节循环 + Chain30 尺寸 origin（:28796-28833）', () => {
    const rec = makeCtxRecorder();
    drawHook(332, makeHost(rec, filesFor(332)));
    const segs = segsOf(rec.segs);
    // 300−16n<30 → n=17
    expect(segs.length).toBe(17);
    for (let i = 0; i < segs.length; i++) {
      expect(segs[i].sy).toBe((i % 4) * 18);            // Chain31 高 72/4 = 18/帧行
      expect(segs[i].sw).toBe(20);
      expect(segs[i].sh).toBe(18);
    }
  });

  it('646-649 月亮四色：本体 + 发光层同几何叠画（α=127/255）', () => {
    for (const t of [646, 647, 648, 649] as const) {
      const rec = makeCtxRecorder();
      drawHook(t, makeHost(rec, filesFor(t)));
      const segs = segsOf(rec.segs);
      const base = segs.filter((s) => s.tex === HOOK_CHAINS[t].tex);
      const glow = segs.filter((s) => s.tex === HOOK_CHAINS[t].glowTex);
      expect(base.length).toBe(glow.length);
      expect(base.length).toBeGreaterThan(0);
      for (let i = 0; i < base.length; i++) {
        expect(glow[i].dx).toBeCloseTo(base[i].dx, 6);
        expect(glow[i].dy).toBeCloseTo(base[i].dy, 6);
      }
    }
  });

  it('钩头：通用公式 pivot/origin（:29886 同构）+ 488 的 n144=−8', () => {
    let rec = makeCtxRecorder();
    const g = drawHook(13, makeHost(rec, filesFor(13)));
    const head = rec.segs.find((s) => s.kind === 'head')!;
    expect(head.tex).toBe('Projectile_13.png');
    // 贴图左上 = (盒左+n144, 盒上−n143)（未旋转基准点；旋转绕 pivot）
    expect(head.dx).toBeCloseTo(g.x, 6);
    expect(head.dy).toBeCloseTo(g.y, 6);
    expect(head.rot).toBeCloseTo(g.rot, 6);
    rec = makeCtxRecorder();
    const g488 = drawHook(488, makeHost(rec, filesFor(488)));
    const head488 = rec.segs.find((s) => s.kind === 'head')!;
    expect(head488.dx).toBeCloseTo(g488.x - 8, 6);      // n144=−8
  });

  it('贴图未就绪：回退旧线段+方块渲染（兜底路径）', () => {
    const rec = makeCtxRecorder();
    const host = { ctx: rec.ctx, atlas: { ensureVImage: () => null } };
    drawHook(13, host);
    expect(rec.segs.length).toBe(0);
    // ★P0-B 零上传兜底（2026-09-27）：旧 stroke 线段改旋转 solid fillRect quad
    // （acc 态路径 op=逐帧栅格化+上传病）——零 stroke;链 quad 因测试桩 fakePlayer
    // 无 x/w（len 非有限）被有限门跳过,仅钩头方块 1 fill。
    expect(rec.strokes.length).toBe(0);                 // 路径 op 归零（零上传判据）
    expect(rec.fills.length).toBe(1);                   // 旧钩头方块（链 quad 被桩跳过）
  });
});

// ---- 段光 / 沿线光 ----

describe('链段发光', () => {
  it('332：推进前取格、四色循环（:28796-28814）', () => {
    const rec = makeCtxRecorder();
    const host = makeHost(rec, filesFor(332));
    drawHook(332, host);
    const cyc = HOOK_CHAINS[332].segLightCycle!;
    const lights = host.lights;
    expect(lights.length).toBe(17);
    // 首光在钩心格(推进前)，色 = 第 0 色
    expect(lights[0]).toMatchObject({ x: 62, y: 62, r: 0, g: 0.2, b: 0.2 });
    for (let i = 0; i < lights.length; i++) {
      const c = cyc[i % 4];
      expect([lights[i].r, lights[i].g, lights[i].b]).toEqual(c);
    }
  });

  it('488：推进后取格、恒 (0.2,0,0.175)（:28971）', () => {
    const rec = makeCtxRecorder();
    const host = makeHost(rec, filesFor(488));
    drawHook(488, host);
    expect(host.lights.length).toBeGreaterThan(0);
    for (const l of host.lights) {
      expect([l.r, l.g, l.b]).toEqual([0.2, 0, 0.175]);
    }
    // 首光 = 首节推进后位置（Chains_2 高 12 → 钩心+12）
    expect(host.lights[0].x).toBe(Math.floor(1012 / 16));
  });

  // ★复审③（2026-08-21）：446/646-649 沿线光回迁 AI 期（原版 Projectile.cs
  // :49687-49727 AI 段；曾移 draw 期 = 恒 1 tick 延迟）——经 fixedUpdate→
  // GameHooks.addLightAt 发射，测试改为驱动 AI 期（332/488 段光仍走 draw，上方两例）
  it('446：端点 + 沿线开格发光（PlotTileLine + CastLightOpen 门）', () => {
    // 全空世界（isActive=false → CastLightOpen 全放行）
    const store = {
      inBounds: () => true,
      isActive: () => false,
      get: () => 0,
    };
    const lights = aiDriveLineLight(446, store);
    const [lr, lg, lb] = HOOK_CHAINS[446].lineLight!;
    expect(lights.length).toBeGreaterThan(2);
    for (const l of lights) {
      expect([l.r, l.g, l.b]).toEqual([lr, lg, lb]);
      // 钩心 (1000,1000)=格(62,62) → 玩家 (1300,1000)=格(81,62)：水平线全在 y=62
      expect(l.y).toBe(62);
      expect(l.x).toBeGreaterThanOrEqual(62);
      expect(l.x).toBeLessThanOrEqual(81);
    }
    // 两端点必在（AddLight(mountedCenter)+AddLight(Center)）
    expect(lights.some((l) => l.x === 62 && l.y === 62)).toBe(true);
    expect(lights.some((l) => l.x === 81 && l.y === 62)).toBe(true);
  });

  it('446：实心格不放行（CastLightOpen `!solid` 门）', () => {
    // (70,62) 设为实心
    const store = {
      inBounds: () => true,
      isActive: (x: number) => true,
      get: (x: number) => (x === 70 ? 1 : 0),   // tile 1 = dirt（solid）
    };
    const lights = aiDriveLineLight(446, store);
    expect(lights.some((l) => l.x === 70 && l.y === 62)).toBe(false);
    expect(lights.some((l) => l.x === 71 && l.y === 62)).toBe(true);
  });
});

// ---- PlotLine（Utils.cs:2329-2368） ----

describe('plotLine Bresenham', () => {
  // 经 GrappleProj 模块内部实现间接验证：446 沿线光在纯水平线覆盖 62..80（终点 81 不绘）
  it('水平线：覆盖除终点外全部格 + 端点光补齐', () => {
    const store = { inBounds: () => true, isActive: () => false, get: () => 0 };
    const lights = aiDriveLineLight(446, store);
    const xs = new Set(lights.map((l) => l.x));
    for (let x = 62; x <= 81; x++) expect(xs.has(x)).toBe(true); // 终点 81 由端点光补
    expect(lights.filter((l) => l.x === 70).length).toBe(1); // 每格恰一次
  });
});

// ---- AI 侧视觉驱动（Projectile.cs:49685-49704） ----

describe('AI 侧视觉字段', () => {
  /** 空 40×40 世界 + 最小 GameHooks（只走 aiStep 无挂墙） */
  function tickWorld(projType: number, ticks: number): GrappleProj {
    const w = new World(60, 60, 42, 'chain-tick');
    const p = new Player(30 * TILE, 40 * TILE, new Inventory());
    const game = { world: w, player: p, spawnDrop: () => null, addDamageNumber: () => {},
      playSfx: () => {}, spawnParticles: () => {}, onInventoryChanged: () => {},
      enemies: () => [], critters: () => [], spawnEnemy: () => {}, damagePlayer: (): number => 0 } as never;
    // 玩家正上 300px、速度 0 → FLY 态静止（射程门 500-600 不触发）
    const g = new GrappleProj(p.cx - 9, p.cy - 300 - 9, 0, 0, projType,
      () => (p.dead ? null : p));
    p.registerGrappleProj(g);
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60, game);
    return g;
  }

  it('652 静态钩：钩头 6 帧每 7 tick 推进（:49697-49704）', () => {
    expect(tickWorld(652, 6).headFrame).toBe(0);
    expect(tickWorld(652, 7).headFrame).toBe(1);
    expect(tickWorld(652, 14).headFrame).toBe(2);
    expect(tickWorld(652, 42).headFrame).toBe(0);       // 6 帧循环
  });

  it('446 反重力钩：localAI[0] 0..27 循环（:49686-49696）', () => {
    expect(tickWorld(446, 1).lai0).toBe(1);
    expect(tickWorld(446, 28).lai0).toBe(0);
    expect(tickWorld(446, 29).lai0).toBe(1);
    // 链帧行 = ⌊lai0/7⌋（Main.cs:28895-28900 num115）
    expect(Math.floor(tickWorld(446, 8).lai0 / 7)).toBe(1);
  });

  it('256 骷髅王之手：rotation 覆写 atan2+3.9250002（:49681-49684）', () => {
    const g = tickWorld(256, 1);
    const p = g.owner()!;
    const expectA = Math.atan2(p.cy - g.cy, p.cx - g.cx) + SKELETRON_HAND_ROT;
    expect(g.rot).toBeCloseTo(expectA, 6);              // 覆写生效
    expect(Math.abs(g.rot - (expectA - SKELETRON_HAND_ROT - Math.PI / 2)))
      .toBeGreaterThan(0.01);                            // ≠ 通用 atan2−π/2 分支
  });
});
