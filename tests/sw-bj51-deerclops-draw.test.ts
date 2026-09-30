// SW-BJ51：668 鹿角怪（独眼巨鹿）专绘层计划回归（deerclopsDrawLayers,纯函数）。
// 用户实报"贴图有重影"取证批：重影面三源定性——
//  ① lai3>0（远距免伤爬升 ≥450px）红雾双环绕+本体透明化 = 原版本相（Main.cs:26735-26753+26755-26762）
//  ② ai0∈{7,8}（回家传送/离场消散）紫五重影 = 原版本相（:26764-26787）
//  ③ 仓库曾两处偏差：紫五重影画在【本体之上】（原版在 :26790 主绘之前=本体之下）
//     + Extra_245 红雾整图压缩进帧格（原版第 3 参 rectangle=本体同格帧子矩形 :26793）——本批校正。
// 全部公式按 1457 反编译逐行锚定；1456↔1457 该函数逐字全等、1458 未动（三版本核对）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deerclopsDrawLayers, type DeerclopsDrawLayer } from '../src/render/Renderer';

const kinds = (ls: DeerclopsDrawLayer[]) => ls.map((l) => l.kind);
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('SW-BJ51 ①绘制次数（Main.cs:26714-26800 逐层门）', () => {
  it('近距战斗（lai3=0,ai0=0）：恰 1 层=本体,无任何重影/雾', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 0, ai0: 0, ai1: 0, opacity: 1, gt: 3.7 });
    expect(layers.length).toBe(1);
    expect(kinds(layers)).toEqual(['body']);
  });

  it('入场态（ai0=-1,lai3=-10）：负 lai3 与 0 同门,仍只画本体', () => {
    const { layers } = deerclopsDrawLayers({ lai3: -10, ai0: -1, ai1: 0, opacity: 1, gt: 0 });
    expect(kinds(layers)).toEqual(['body']);
  });

  it('远距爬升（lai3=30,ai0=0）：红雾×2+本体×1+雾×2=5 层（原版本相=用户所见"重影"态）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 30, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(kinds(layers)).toEqual(['redGhost', 'redGhost', 'body', 'fog', 'fog']);
  });

  it('消散态（ai0=7/8,lai3=0）：紫重影×5+本体×1=6 层', () => {
    for (const ai0 of [7, 8] as const) {
      const { layers } = deerclopsDrawLayers({ lai3: 0, ai0, ai1: 35, opacity: 1, gt: 0 });
      expect(kinds(layers)).toEqual(['purpleGhost', 'purpleGhost', 'purpleGhost', 'purpleGhost', 'purpleGhost', 'body']);
    }
  });

  it('全叠加态（lai3=30,ai0=7）：2+5+1+2=10 层', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 30, ai0: 7, ai1: 30, opacity: 1, gt: 1.23 });
    expect(layers.length).toBe(10);
    expect(kinds(layers).filter((k) => k === 'redGhost').length).toBe(2);
    expect(kinds(layers).filter((k) => k === 'purpleGhost').length).toBe(5);
    expect(kinds(layers).filter((k) => k === 'fog').length).toBe(2);
  });
});

describe('SW-BJ51 ②层序=原版 z 序（★本批校正面:紫重影须在本体之下 :26764-26790）', () => {
  it('purpleGhost 全部先于 body（变异:回到修复前"本体→重影"序即红）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 12, ai0: 7, ai1: 33, opacity: 1, gt: 2.5 });
    const ks = kinds(layers);
    const firstBody = ks.indexOf('body');
    const ghostIdx = ks.map((k, i) => (k === 'purpleGhost' ? i : -1)).filter((i) => i >= 0);
    expect(ghostIdx.length).toBe(5);
    expect(ghostIdx.every((i) => i < firstBody)).toBe(true);
  });

  it('redGhost 先于 body、fog 恒在 body 之上（:26735 vs :26790 vs :26792）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 25, ai0: 0, ai1: 0, opacity: 1, gt: 0.9 });
    const ks = kinds(layers);
    expect(ks.indexOf('redGhost')).toBeLessThan(ks.indexOf('body'));
    expect(ks.lastIndexOf('fog')).toBeGreaterThan(ks.indexOf('body'));
  });
});

describe('SW-BJ51 ③偏移公式（gt=0 时解析可算,逐值锚定）', () => {
  it('红雾双环绕 gt=0：θ=iπ → (0,+r²·20)/(0,-r²·20)（(0,1).RotatedBy 语义）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 36, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    const reds = layers.filter((l) => l.kind === 'redGhost');
    expect(near(reds[0].dx, 0)).toBe(true);
    expect(near(reds[0].dy, 20)).toBe(true);      // r=lai3/36=1, R=r²·20
    expect(near(reds[1].dx, 0)).toBe(true);
    expect(near(reds[1].dy, -20)).toBe(true);
  });

  it('紫五重影 gt=0：双轨道同角退化 R1+R2,ai1=40 → num7=1,n9=1 → j=0 偏移 (160,0)', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 0, ai0: 7, ai1: 40, opacity: 1, gt: 0 });
    const ghosts = layers.filter((l) => l.kind === 'purpleGhost');
    expect(near(ghosts[0].dx, 160)).toBe(true);   // R1=80+R2=80+30·0 → 模长 160
    expect(near(ghosts[0].dy, 0)).toBe(true);
    // j=4: R1+R2=80+(80+30·4)=280,角 8π/5（gt=0 时 a1=a2 同角退化）
    expect(near(ghosts[4].dx, 280 * Math.cos((8 * Math.PI) / 5))).toBe(true);
    expect(near(ghosts[4].dy, 280 * Math.sin((8 * Math.PI) / 5))).toBe(true);
  });

  it('雾环绕半径 r²·4：lai3=36,gt=0 → (0,±4)', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 36, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    const fogs = layers.filter((l) => l.kind === 'fog');
    expect(near(fogs[0].dy, 4)).toBe(true);
    expect(near(fogs[1].dy, -4)).toBe(true);
  });
});

describe('SW-BJ51 ④alpha 公式链（预乘语义折算,逐值锚定;★BJ418 重产:金标=反编译直读）', () => {
  // ★BJ418（2026-09-30）:本块 3 处旧值把「漏紫影 Lerp alpha 回升」的误转录钉成了金标
  //  （α=Opacity(1−r²)(1−num7)）。反编译直读重产:XNA Color.Lerp 四通道同插,
  //  首段 Lerp(Transparent,color,1−num3) A×(1−num3)（:26742）→ lai3 支 Lerp(·,(50,0,160),
  //  A=255,r1)（:26759-26762）→（7/8）Lerp(·,num7)（:26767）→ ×(1−num7)（:26768）:
  //  A=[(1−num3)(1−r1)+r1] →（7/8）[(·)(1−num7)+num7](1−num7)。lai3=18: r²=0.25,
  //  r1=0.9 → A=0.75×0.1+0.9=0.975（旧值 0.75 误）
  it('本体 α=Opacity·[(1-r²)(1-r1)+r1]：lai3=18（r²=0.25,r1=0.9）→ 0.975（★BJ418 重产,旧 0.75=误转录）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 18, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'body')!.alpha, 0.975)).toBe(true);
  });

  it('本体 α 含消散衰减：ai0=7,ai1=30 → num7=0.5 → 0.5;ai1=40 → num7=1 → 0（全消散）', () => {
    const b = (ai1: number) => deerclopsDrawLayers({ lai3: 0, ai0: 7, ai1, opacity: 1, gt: 0 })
      .layers.find((l) => l.kind === 'body')!.alpha;
    expect(near(b(30), 0.5)).toBe(true);
    expect(near(b(40), 0)).toBe(true);
  });

  it('红雾环 α=(128/255)·(1-r²/2)·Opacity（value2=(80,0,0,255)×0.5 :26743）：lai3=36 → 0.251', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 36, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    const a = layers.find((l) => l.kind === 'redGhost')!.alpha;
    expect(near(a, (128 / 255) * 0.5)).toBe(true);
  });

  it('紫重影 α=本体 α×0.5（color2×0.5 :26783）：ai1=30 → 0.25', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 0, ai0: 7, ai1: 30, opacity: 1, gt: 0 });
    const g = layers.find((l) => l.kind === 'purpleGhost')!.alpha;
    expect(near(g, 0.25)).toBe(true);
  });

  it('雾 α=(66/255)·Opacity·Remap(lai3,0,20,0,1)·0.25·(1-num7)（:26795）：lai3≥20 → 66/1020', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 25, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'fog')!.alpha, 66 / 255 * 0.25)).toBe(true);
    const half = deerclopsDrawLayers({ lai3: 10, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(half.layers.find((l) => l.kind === 'fog')!.alpha, 66 / 255 * 0.5 * 0.25)).toBe(true);
  });

  // ★BJ418 重产（本断言=用户实报"一闪一闪"的定谳锚）:lai3=30 时 r1=1 → 紫影 Lerp 把 A
  //  拉回 255 → 本体【不透明】纯紫影剪身（tPurple=1）,α 旧值 0.3056 是漏回升的误转录。
  //  原版远距态从不整段淡出（Main.cs:26759-26762 Lerp 目标 (50,0,160,255)）。
  it('★BJ418：本体 α=1（远距 lai3=30=不透明紫影剪影,旧 0.3056 淡出=闪烁根因已废）', () => {
    const { layers, tPurple } = deerclopsDrawLayers({ lai3: 30, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'body')!.alpha, 1)).toBe(true);
    expect(near(tPurple, 1)).toBe(true);   // r1=1 → 纯 (50,0,160) 紫影
  });

  // ★SW-RB10e 2026-09-10：红雾环不乘 Opacity——原版 value3 链 Lerp(·,value2,1)
  //  整体覆写 GetAlpha 光照链（Main.cs:26747-26751）；本体/雾照常吃 Opacity
  //  （本体经 GetAlpha :94549、雾 color3 显式 ×Opacity :26795）
  it('★SW-RB10e：红雾环 α 不随 Opacity 衰减（GetAlpha 被覆写）；本体/雾随 Opacity（变异:回潮 ×opacity 即红）', () => {
    const a = (o: number) => deerclopsDrawLayers({ lai3: 18, ai0: 0, ai1: 0, opacity: o, gt: 0 }).layers;
    const red1 = a(1).find((l) => l.kind === 'redGhost')!.alpha;
    const redHalf = a(0.4).find((l) => l.kind === 'redGhost')!.alpha;
    expect(near(red1, redHalf)).toBe(true);                       // 红雾环与 Opacity 无关
    expect(near(red1, (128 / 255) * (1 - 0.25 * 0.5))).toBe(true);
    expect(near(a(1).find((l) => l.kind === 'body')!.alpha * 0.4,
      a(0.4).find((l) => l.kind === 'body')!.alpha)).toBe(true);  // 本体吃 Opacity
    expect(near(a(1).find((l) => l.kind === 'fog')!.alpha * 0.4,
      a(0.4).find((l) => l.kind === 'fog')!.alpha)).toBe(true);   // 雾吃 Opacity
  });
});

// ★SW-RB10e 2026-09-10：帧矩形几何/烘焙语义/层安置 tripwire（drawDeerclopsGrid
//  消费侧纯函数外语义,源正则锁定防回潮）
describe('★SW-RB10e 668 几何/烘焙/安置 tripwire', () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

  it('帧矩形=原版 sizeOffset 外扩 +2（Utils.Frame :1389-1395），非内缩 padding', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r).toMatch(/const sx = col \* g\.cellW, sy = row \* g\.cellH;/);
    expect(r).toMatch(/const vw = g\.cellW \+ 2, vh = g\.cellH \+ 2;/);
    expect(r).toMatch(/originX = facingRight \? 106 : vw - 106, originY = vh - 4;/);
    // 旧内缩式不得回潮
    expect(r).not.toMatch(/const sw = g\.cellW - \(g\.padX/);
    // NPC_GRIDS[668] 不再载 pad 语义
    const layouts = src('../src/remaster/NpcGridLayouts.ts');
    expect(layouts).toMatch(/668: \{ cols: 5, rows: 5, cellW: 218, cellH: 240, perRow: 5 \}/);
  });

  it('红雾环/雾烘焙=顶点色乘法（tintedSprite），本体=Lerp（lerpSprite）；自发光层出实体层', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r).toMatch(/tintedSprite\('deer-red-m', frame, \[40, 0, 0\]\)/);
    expect(r).toMatch(/tintedSprite\('deer-fog-m'/);
    expect(r).toMatch(/lerpSprite\('deer-body', frame, \[50, 0, 160\], tPurple\)/);
    // 旧 lerp t=1 压平烘焙不得回潮
    expect(r).not.toMatch(/lerpSprite\('deer-red'/);
    // 7d' 合成后专绘挂钩 + 实体层跳过红雾/雾层
    expect(r).toMatch(/if \(ent\.vanillaId === 668\) this\.drawDeerclopsGlow\(ent\);/);
  });
});

describe('SW-BJ51 ⑤num7 三角波与 tPurple 合成', () => {
  it('num7=Remap(ai1,20,60,0,2) 三角折返：20→0,30→0.5,40→1,50→0.5,60→0,55→0.25', () => {
    const n7 = (ai1: number) => {
      const { layers } = deerclopsDrawLayers({ lai3: 0, ai0: 8, ai1, opacity: 1, gt: 0 });
      const b = layers.find((l) => l.kind === 'body')!.alpha;   // bodyAlpha=1-num7
      return 1 - b;
    };
    for (const [ai1, want] of [[20, 0], [30, 0.5], [40, 1], [50, 0.5], [60, 0], [55, 0.25]] as const) {
      expect(near(n7(ai1), want, 1e-9)).toBe(true);
    }
  });

  // ★BJ418 重产:精确折叠 t1=1−(1−num3)(1−r1)（首段 Transparent lerp 的 rgb×(1−num3)
  //  向黑档不丢）。lai3=10: r²=100/1296,r1=0.5 → t1=0.5+0.5×100/1296≈0.53858（旧值 0.5 漏档）
  it('tPurple=精确折叠 1−(1−t1)(1−num7),t1=num3+r1−num3·r1：lai3=20 → 1（全紫）;lai3=10 → 0.53858', () => {
    expect(near(deerclopsDrawLayers({ lai3: 20, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple, 1)).toBe(true);
    const t10 = deerclopsDrawLayers({ lai3: 10, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple;
    expect(near(t10, 0.5 + 0.5 * (10 / 36) ** 2)).toBe(true);
    // lai3=0 且非消散态 → 0（原色）
    expect(near(deerclopsDrawLayers({ lai3: 0, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple, 0)).toBe(true);
    // 7/8 态合成:num7 lerp 与 t1 的乘积补（lai3=0,ai1=40 → num7=1 → 纯紫）
    expect(near(deerclopsDrawLayers({ lai3: 0, ai0: 8, ai1: 40, opacity: 1, gt: 0 }).tPurple, 1)).toBe(true);
  });
});
