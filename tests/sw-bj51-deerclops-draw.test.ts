// SW-BJ51：668 鹿角怪（独眼巨鹿）专绘层计划回归（deerclopsDrawLayers,纯函数）。
// 用户实报"贴图有重影"取证批：重影面三源定性——
//  ① lai3>0（远距免伤爬升 ≥450px）红雾双环绕+本体透明化 = 原版本相（Main.cs:26735-26753+26755-26762）
//  ② ai0∈{7,8}（回家传送/离场消散）紫五重影 = 原版本相（:26764-26787）
//  ③ 仓库曾两处偏差：紫五重影画在【本体之上】（原版在 :26790 主绘之前=本体之下）
//     + Extra_245 红雾整图压缩进帧格（原版第 3 参 rectangle=本体同格帧子矩形 :26793）——本批校正。
// 全部公式按 1457 反编译逐行锚定；1456↔1457 该函数逐字全等、1458 未动（三版本核对）。
import { describe, it, expect } from 'vitest';
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

describe('SW-BJ51 ④alpha 公式链（预乘语义折算,逐值锚定）', () => {
  it('本体 α=Opacity·(1-r²)·(1-num7)：lai3=18（r²=0.25）→ 0.75', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 18, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'body')!.alpha, 0.75)).toBe(true);
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

  it('本体透明化=远距可见主因：lai3=30 → α=1-(30/36)²≈0.3056（用户所见半透明重影态）', () => {
    const { layers } = deerclopsDrawLayers({ lai3: 30, ai0: 0, ai1: 0, opacity: 1, gt: 0 });
    expect(near(layers.find((l) => l.kind === 'body')!.alpha, 1 - (30 / 36) ** 2)).toBe(true);
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

  it('tPurple=Lerp 链合成 r1+num7-r1·num7：lai3=20,ai0=0 → 1（全紫）;lai3=10 → 0.5', () => {
    expect(near(deerclopsDrawLayers({ lai3: 20, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple, 1)).toBe(true);
    expect(near(deerclopsDrawLayers({ lai3: 10, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple, 0.5)).toBe(true);
    // lai3=0 且非消散态 → 0（原色）
    expect(near(deerclopsDrawLayers({ lai3: 0, ai0: 0, ai1: 0, opacity: 1, gt: 0 }).tPurple, 0)).toBe(true);
  });
});
