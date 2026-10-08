// ★BJ448 标尺网格 dst 衰减双 pass 精确化（BJ422-债1 清偿,2026-10-03）判别闸门。
//  金标链：
//   · Main.cs:47146-47302 DrawInterface_3_LaserRuler——层内 spriteBatch.Draw 用
//     DrawInterface 前置 Begin（Main.cs:63371 `Begin(Deferred, null, …)`=缺省
//     BlendState.AlphaBlend=One/InvSrcAlpha）⇒ 每绘 out = texA·tint.rgb
//     + dst×(1−texA·tint.a)。Extra_68 XNB 预乘贴图：内核 texA=127/255 ⇒ 贡献额
//     texA·tint.rgb（半额）而衰减额 texA·tint.a——两个不同标度,单 pass 不可表达。
//   · 模板 public/sprites/vanilla/Extra_68.png（本测试实读 PNG）：18×36 白模
//     rgb=255、α∈{255,127}——2px 边框 255/内核 127;源矩形 (0,18,16|14,16|14)
//     普通格、(0,0,16,16|18) 十字横行、(0,0,18,16) 十字纵列。
//   · 本仓落刀（Renderer.drawBuilderRulers 网格段）：pass A 黑罩 'multiply'
//     gA=tint.a（黑模 α=texA ⇒ 逐像素 αs=texA·tint.a;W3C compositing-1:Cs=0 ⇒
//     B(Cb,Cs)=0,co=αb(1−αs)Cb——PDF 洗色项 αs(1−αb)Cs 恒零,主画布不透明 αd=1
//     ⇒ αo=αs+αd(1−αs)=1）【先罩后加】;pass B 'lighter' 加算预乘 rgb（BJ422②
//     锁定贡献面,暗域逐位不动）;pass C 竖十字独立罩→加（竖列×横行仅交叠 2×2 块,
//     罩/加交替序=原版逐绘序复刻）。α 档单源 rulerGridMaskAlpha/rulerCrossMaskAlpha。
//   · 暗域回归面：单覆盖像素逐位不动（④）;唯一暗域行为差=2×2 十字交叠块
//     （旧双加 178 → 原版序 163,向 vanilla 收敛——旧码在黑底对这 4 px 也偏亮）。
//   · 重放模型=W3C compositing-1 算子式（multiply 黑源/lighter）逐 op 8bit 量化,
//     模板 α 实读 PNG;与 Chrome Canvas2D 语义同式（±1 量化容差不锁舍入模式）。
//   ★变异证红：①摘 pass A（罩段）→ ②③红（无罩值偏差 8~22/255）;
//             ②罩/加倒序（先加后罩）→ 白底 (dst+src)×(1−a) 双错红;
//             ③摘 pass C 竖罩/乱 pass 序 → ⑤交叠块红（原版序 231 vs 批罩 247@dst=100）;
//             ④动标尺线支（Extra_2）→ ⑦线支纯 source-over 结构锁红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 既有用法）
// @ts-ignore
import { PNG } from 'pngjs';
import { Renderer } from '../src/render/Renderer';
import {
  rulerGridFade, rulerGridMaskAlpha, rulerCrossMaskAlpha, rulerLineAlpha,
} from '../src/stats/builderAcc';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR_SRC = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');

// ---- 真模板逐像素 α（pngjs 实读;罩与贡献的逐像素保真均以此为准） ----
const tpl = PNG.sync.read(readFileSync(join(HERE, '..', 'public/sprites/vanilla/Extra_68.png')));
const texA = (x: number, y: number): number => tpl.data[(tpl.width * y + x) * 4 + 3] / 255;

// ---- 记录型 ctx（drawImage 落参+gco/gA 快照;drawBuilderRulers 直呼=恒等变换） ----
interface DrawRec { img: unknown; a: number[]; gco: string; ga: number }
function recordingCtx(): { ctx: CanvasRenderingContext2D; rec: DrawRec[] } {
  const rec: DrawRec[] = [];
  const state = { gco: 'source-over', ga: 1 };
  const t: Record<string, unknown> = {};
  const ctx = new Proxy(t, {
    get(o, k) {
      if (k === 'globalCompositeOperation') return state.gco;
      if (k === 'globalAlpha') return state.ga;
      if (k === 'imageSmoothingEnabled') return false;
      return (...args: unknown[]) => {
        if (k === 'drawImage') rec.push({ img: args[0], a: args.slice(1) as number[], gco: state.gco, ga: state.ga });
        if (k === 'globalCompositeOperation') state.gco = args[0] as string;
        if (k === 'globalAlpha') state.ga = args[0] as number;
        return undefined;
      };
    },
    set(o, k, v) {
      if (k === 'globalCompositeOperation') state.gco = v as string;
      if (k === 'globalAlpha') state.ga = v as number;
      (o as Record<string, unknown>)[k as string] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rec };
}

// ---- 烘焙桩：记录 tint 请求,返回按 (r,g,b,slot) 恒等的标记 ----
interface TintMark { r: number; g: number; b: number; slot: number }
function makeSelf(builderRulers: Record<string, unknown>) {
  const tints: TintMark[] = [];
  const self = {
    builderRulers,
    atlas: {},
    rulerReadout: null as unknown,
    tintedExtra(_p: string, r: number, g: number, b: number, slot: number): TintMark {
      const m: TintMark = { r, g, b, slot };
      tints.push(m);
      return m;
    },
  };
  return { self, tints };
}

const drawBuilderRulers = (Renderer.prototype as unknown as {
  drawBuilderRulers: (this: unknown, ctx: CanvasRenderingContext2D, world: unknown,
    cam: unknown, viewW: number, viewH: number, z: number) => void;
}).drawBuilderRulers;

// ---- 标准机位：ox=oy=0,视区 56×43 格,鼠标格 (10,8)（十字行列在场） ----
function gridRulers(): Record<string, unknown> {
  return {
    lineOn: false, gridOn: true,
    feetTx: 30, feetTy: 30, nudge: 1,
    mouseTx: 10, mouseTy: 8, speed: 0,
    gridDist: 0, gravDir: 1,              // gridDist=0 ⇒ num3=0.7（满幅档）
  };
}

// W3C compositing-1 精确重放：不透明 dst 面,逐 op 8bit 量化（premultiplied）。
//  1:1 直绘无变换 ⇒ 设备像素=世界像素;α=0 模板像素不落笔（B/Cs 皆零）。
function runGrid(dstFill: number): { rec: DrawRec[]; tints: TintMark[]; px: Float64Array; W: number } {
  const { self, tints } = makeSelf(gridRulers());
  const { ctx, rec } = recordingCtx();
  const W = 960, H = 720;
  const px = new Float64Array(W * H).fill(dstFill);
  const r8 = Math.round;
  // ★BJ572（2026-10-08）：网格条带批刀后,本套件的受试面=整数 zoom 下的
  //   【回退逐格支】（门=Number.isInteger(z)&&!Renderer._gridStripsOff）——
  //   W3C 重放模型既定锚在此支;条带支的等价性由 tests/bj572-grand-design-family
  //   + _bj572-samebase-ab 实机探针（整数相位 n=0 逐字节）另行锁定。
  Renderer.gridStripsSetForTest(true);
  try {
  drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
  } finally { Renderer.gridStripsSetForTest(false); }
  for (const op of rec) {
    const m = op.img as TintMark;
    const [sx, sy, sw, sh, dx, dy] = op.a;
    for (let v = 0; v < sh; v++) {
      for (let u = 0; u < sw; u++) {
        const ta = texA(sx + u, sy + v);
        if (ta === 0) continue;
        const di = (dx + u) + W * (dy + v);
        if (op.gco === 'multiply') {
          const as = ta * op.ga;                       // αs = texA·gA（黑模）
          px[di] = r8(px[di] * (1 - as));              // co=αb(1−αs)Cb（αb=1,αo=1）
        } else if (op.gco === 'lighter') {
          px[di] = r8(Math.min(255, px[di] + m.r * ta * op.ga));   // 预乘贡献加算
        }
      }
    }
  }
  void H;
  return { rec, tints, px, W };
}

describe('★BJ448 罩/加双 pass 合成代数（XNA AlphaBlend=src×1+dst×(1−a) 逐位）', () => {
  const num3 = rulerGridFade(0);                       // 0.7
  const aG = rulerGridMaskAlpha(num3);                 // floor(127·0.4·0.7)/255=35/255
  const aC = rulerCrossMaskAlpha(num3);                // floor(127·0.5·0.7)/255=44/255
  const tintG = Math.floor(61 * 0.4 * num3);           // 17
  const tintC = Math.floor(127.5 * num3);              // 89

  it('① 结构：gco 序恰为 [罩(格+横)/加(格+横)/罩(纵)/加(纵)] 四段,罩在加前,α 两档正确', () => {
    const { rec, tints } = runGrid(128);
    const runs: Array<{ gco: string; n: number; gas: number[] }> = [];
    for (const op of rec) {
      const last = runs[runs.length - 1];
      if (last && last.gco === op.gco) { last.n++; last.gas.push(op.ga); }
      else runs.push({ gco: op.gco, n: 1, gas: [op.ga] });
    }
    expect(runs.map((r) => r.gco)).toEqual(['multiply', 'lighter', 'multiply', 'lighter']);
    // 段 1=普通格罩（gA=aGrid）接横行罩（gA=aCross,同 gco 同段）
    expect(runs[0].gas[0]).toBe(aG);
    expect(runs[0].gas[runs[0].gas.length - 1]).toBe(aC);
    expect(runs[1].gas.every((g) => g === 1)).toBe(true);   // 加算 gA 恒 1
    expect(runs[2].gas.every((g) => g === aC)).toBe(true);  // 纵列罩档
    expect(runs[3].gas.every((g) => g === 1)).toBe(true);
    // 烘焙请求=青调两版（槽 0/1）+黑模（槽 2）——byte 链 floor 约定
    expect(tints).toEqual([
      { r: Math.floor(61 * 0.4 * num3), g: Math.floor(204 * 0.4 * num3), b: Math.floor(229 * 0.4 * num3), slot: 0 },
      { r: Math.floor(127.5 * num3), g: Math.floor(102 * num3), b: Math.floor(114.5 * num3), slot: 1 },
      { r: 0, g: 0, b: 0, slot: 2 },
    ]);
    // 罩全为黑模;罩/加数量配平且几何逐 rect 恒等（同序同源矩形 ⇒ 衰减面=贡献面）
    const mult = rec.filter((o) => o.gco === 'multiply');
    const lite = rec.filter((o) => o.gco === 'lighter');
    const isBlack = (o: DrawRec) => {
      const m = o.img as TintMark;
      return m.r === 0 && m.g === 0 && m.b === 0;
    };
    expect(mult.every(isBlack)).toBe(true);
    expect(mult.length).toBe(lite.length);
    const geom = (o: DrawRec): string => o.a.join(',');
    const nCH = runs[0].n;
    expect(runs[1].n).toBe(nCH);
    expect(runs[3].n).toBe(runs[2].n);
    expect(mult.slice(0, nCH).map(geom)).toEqual(lite.slice(0, nCH).map(geom));
    expect(mult.slice(nCH).map(geom)).toEqual(lite.slice(nCH).map(geom));
  });

  it('② 白底 (255)：逐位对拍 round(src+dst×(1−a))（±1 量化容差）;罩后严格低于无罩值', () => {
    const { px, W } = runGrid(255);
    // [名, x, y, tint, texA, isCross]
    const spots: Array<[string, number, number, number, number, boolean]> = [
      ['gridBorder', 207, 191, tintG, texA(0, 18), false],
      ['gridCore', 215, 199, tintG, texA(8, 26), false],
      ['insetBorder', 177, 191, tintG, texA(2, 18), false],
      ['hCrossBorder', 191, 127, tintC, texA(0, 0), true],
      ['hCrossCore', 199, 135, tintC, texA(8, 8), true],
      ['vCrossBorder', 159, 159, tintC, texA(0, 0), true],
      ['vCrossCore', 167, 167, tintC, texA(8, 8), true],
    ];
    for (const [name, x, y, tint, ta, isCross] of spots) {
      const a = isCross ? aC : aG;
      const got = px[x + W * y];
      const want = Math.round(Math.min(255, tint * ta + 255 * (1 - ta * a)));
      const noMask = Math.round(Math.min(255, 255 + tint * ta));
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1);           // XNA 语义逐位
      if (noMask - want >= 2) expect(got).toBeLessThan(noMask);      // 衰减确实发生
      void name;
    }
    expect(px[900 + W * 100]).toBe(255);                             // 网格幅外零触
  });

  it('③ 中灰底 (128)：格/十字两 a 档分别对拍——无罩偏差 8~22/255 全数收敛（判别主面）', () => {
    const { px, W } = runGrid(128);
    const spots: Array<[string, number, number, number, number, boolean]> = [
      ['gridBorder', 207, 191, tintG, texA(0, 18), false],
      ['gridCore', 215, 199, tintG, texA(8, 26), false],
      ['insetBorder', 177, 191, tintG, texA(2, 18), false],
      ['hCrossBorder', 191, 127, tintC, texA(0, 0), true],
      ['hCrossCore', 199, 135, tintC, texA(8, 8), true],
      ['vCrossBorder', 159, 159, tintC, texA(0, 0), true],
      ['vCrossCore', 167, 167, tintC, texA(8, 8), true],
    ];
    for (const [name, x, y, tint, ta, isCross] of spots) {
      const a = isCross ? aC : aG;
      const got = px[x + W * y];
      const want = Math.round(Math.min(255, tint * ta + 128 * (1 - ta * a)));
      const noMask = Math.round(Math.min(255, 128 + tint * ta));
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1);
      expect(noMask - want).toBeGreaterThanOrEqual(8);   // 判别力下界（无罩旧实现偏差）
      expect(got).toBeLessThan(noMask);
      void name;
    }
  });

  it('④ 黑底 (0)：单覆盖像素与 BJ422② lighter 单遍逐位恒等（暗域零回归,罩恒零效果）', () => {
    const { px, W } = runGrid(0);
    const spots: Array<[number, number, number, number]> = [
      // [x, y, tint, texA]——单覆盖像素（★2×2 块除外,见下）
      [207, 191, tintG, texA(0, 18)],
      [215, 199, tintG, texA(8, 26)],
      [191, 127, tintC, texA(0, 0)],
      [167, 167, tintC, texA(8, 8)],
    ];
    for (const [x, y, tint, ta] of spots) {
      expect(px[x + W * y]).toBe(Math.round(Math.min(255, tint * ta)));   // 旧实现=纯加算
    }
    // ★2×2 交叠块暗域【有变】但为向原版收敛：旧无罩实现=纯双加 2×s2=178,
    //   原版逐绘（横绘→纵绘,纵绘的 InvSrcAlpha 衰减吃掉横贡献 (1−a2) 倍）
    //   = s2×(2−a2)=163——本刀 pass C 复刻原版序,黑底亦精确（唯一暗域行为差,
    //   4 像素,178→163=向 vanilla 逐位收敛）
    const vanillaBlack = Math.round(tintC * (2 - aC));
    expect(px[175 + W * 143]).toBe(vanillaBlack);
  });

  it('⑤ 2×2 交叠块（横行×纵列）：原版逐绘序复刻（罩/加交替）,非批罩近似', () => {
    // 块=设备 (16px+15..16px+16, 16py+15..16py+16)=H(k=px+1)×V(l=py+1) 覆盖
    const { px, W } = runGrid(100);
    const r8 = Math.round;
    // 原版逐绘：d→×(1−a2)→+s2→×(1−a2)→+s2（罩加交替;texA=255 边框）
    const d1 = r8(100 * (1 - aC));
    const d2 = r8(Math.min(255, d1 + tintC));
    const vanilla = r8(Math.min(255, r8(Math.min(255, d2 * (1 - aC))) + tintC));
    // 批罩近似（全罩后全加）= 不拆 pass C 的退化值
    const batched = r8(Math.min(255, r8(r8(100 * (1 - aC)) * (1 - aC)) + 2 * tintC));
    for (const [x, y] of [[175, 143], [176, 143], [175, 144], [176, 144]] as const) {
      const got = px[x + W * y];
      expect(Math.abs(got - vanilla)).toBeLessThanOrEqual(2);   // 原版序逐位（量化容差）
      expect(got).toBeLessThan(batched);                        // 批罩退化可辨（判别面）
    }
    expect(batched - vanilla).toBeGreaterThanOrEqual(5);        // 断言本身有判别力
  });

  it('⑥ a 档单源：floor byte 链、十字>普通格、上界 ≤0.175（登记账偏差面）', () => {
    for (const n3 of [0.2, 0.45, 0.7]) {
      expect(rulerGridMaskAlpha(n3)).toBe(Math.floor(127 * 0.4 * n3) / 255);
      expect(rulerCrossMaskAlpha(n3)).toBe(Math.floor(127 * 0.5 * n3) / 255);
      expect(rulerCrossMaskAlpha(n3)).toBeGreaterThan(rulerGridMaskAlpha(n3));
    }
    expect(rulerGridMaskAlpha(0.7)).toBe(35 / 255);    // floor(50.8·0.7)=35 ≤0.14 档
    expect(rulerCrossMaskAlpha(0.7)).toBe(44 / 255);   // floor(63.5·0.7)=44 ≤0.175 档
  });

  it('⑦ 标尺线支（Extra_2）零波及：纯 source-over 单遍,无 multiply/黑模', () => {
    const r = {
      lineOn: true, gridOn: false, feetTx: 20, feetTy: 20, nudge: 1,
      mouseTx: 23, mouseTy: 25, speed: 0, gridDist: 0, gravDir: 1,
    };
    const { self, tints } = makeSelf(r);
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.every((o) => o.gco === 'source-over')).toBe(true);   // 单遍精确支未动
    expect(rec.every((o) => Math.abs(o.ga - rulerLineAlpha(0)!) < 1e-12)).toBe(true);
    expect(tints).toEqual([{ r: 61, g: 204, b: 229, slot: 0 }]);    // 本色烘焙+gA=k 惯例
    // 源面结构锁：线段体内无 multiply/黑模标记（回潮即红）
    const iLine = RDR_SRC.indexOf('// ---- 标尺线');
    const iNext = RDR_SRC.indexOf('\n  private drawGrandPreview', iLine);
    const lineBody = RDR_SRC.slice(iLine, iNext);
    expect(lineBody).not.toContain('multiply');
    expect(lineBody).not.toContain('imgMask');
  });

  it('⑧ 网格段源面：罩图烘焙 (0,0,0) 槽 2 在位,四 pass 算子序锁（回潮即红）', () => {
    const iDef = RDR_SRC.indexOf('private drawBuilderRulers(');
    const iNext = RDR_SRC.indexOf('\n  private ', iDef + 10);
    const body = RDR_SRC.slice(iDef, iNext);
    expect(body).toContain("this.tintedExtra('vanilla/Extra_68.png', 0, 0, 0, 2)");
    const setM = body.match(/globalCompositeOperation = 'multiply'/g) ?? [];
    const setL = body.match(/globalCompositeOperation = 'lighter'/g) ?? [];
    // ★BJ572：条带批支并入同函数体（整数 zoom 门;同底图 A/B 定谳整数相位
    //   逐字节等价）⇒ multiply/lighter 各 +2（条带 pass A/C 罩+BJ448 逐格回退
    //   支各自成对;逐格支=非整数 zoom 回退档,门=_gridStripsOff 测试开关）
    expect(setM.length).toBe(4);                         // 条带 A+C + 逐格 A+C 两罩段对
    expect(setL.length).toBe(4);                         // 条带 B+C + 逐格 B+C 加段对
    expect(body.indexOf("globalCompositeOperation = 'multiply'"))
      .toBeLessThan(body.indexOf("globalCompositeOperation = 'lighter'"));   // 先罩后加
    expect(body).toContain('rulerGridMaskAlpha(num3)');
    expect(body).toContain('rulerCrossMaskAlpha(num3)');
  });
});
