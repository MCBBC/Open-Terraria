// obj55 "MagicMissile" pass SM2 字节码拖尾像素面（2026-09-03）闸门。
// 原版真值链：
//   · Terarria1458/Terraria.Initializers/DyeInitializer.cs:461-484 —— 四 Misc 拖尾
//     技术（MagicMissile/FlameLash/RainbowRod/LightDisc）全部指向同一 pixelShaderRef
//     技术 "MagicMissile"（=fxPixelShader.json obj55，23 tokens/17 实指令/3 texld），
//     只换三张噪声贴图（uImage0/1/2 ← Extra_191/189/190 等三件套）。
//   · Terarria1458/Terraria.Graphics/{FlameLash,MagicMissile,RainbowRod,
//     LightDisc}Drawer.cs —— UseSaturation(-2f/-2.8f)/UseOpacity(Lerp(4,8,t2d)/2/4/2)。
//   · preshader（fxPixelShader.json obj55.preshader）：syms=[uSaturation,uTime]、
//     唯一 inst=标量乘、outMap→c1.x ⇒ **c1.x = uSaturation×uTime**；主 shader
//     instr#4 `add r0, T0.x, c1` ⇒ s2 采样相位 = p + uSaturation×uTime——
//     "负饱和度"实为 s2 噪声沿 p 轴的滚动速度（负值反向滚动），非颜色饱和度。
//   · 生成体 src/fx/gen/px_MagicMissile.gen.ts 逐指令（instr# 编号见下）：
//       wEnv  = p×1.5 − 0.5                     （instr#1，c2=(1.5,-0.5) def 常量）
//       acr   = T0.y / T0.z                     （instr#2 rcp + instr#3 mul）
//       ph    = p + c1.x                        （instr#4）
//       s2px  = tex(s2, (ph, acr))              （instr#8）
//       s1px  = tex(s1, (ph, acr))              （instr#9）
//       s0px  = tex(s0, (p, acr))               （instr#10）
//       edge  = sat(2×(s2px.r − wEnv))          （instr#11 add + instr#12 add_sat）
//       out   = s0px × (s1px.r × edge) × v0 × uOpacity（instr#13-16 mul 链）
//     XNA oC0 UNORM → (One,One) 加算；寻址 SamplerState.LinearWrap
//     （MiscShaderData.cs:110），滤波双线性。
// 无 jsdom——注入最小 fake DOM（复用 trail-shader.test.ts 同款 stub）。
import { describe, it, expect, beforeAll } from 'vitest';
import { drawStripTrail, EXTRA_SETS } from '../src/fx/TrailShader';

interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
interface FakeCanvas { width: number; height: number; _ctx: FakeCtx2d; getContext(k: string): FakeCtx2d | null }
class FakeCtx2d {
  buf: FakeBuf | null = null;
  blitCalls = 0;
  gco = '';
  constructor(public cv: FakeCanvas) {}
  createImageData(w: number, h: number): FakeBuf { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData(im: FakeBuf): void { this.buf = im; }
  getImageData(x: number, y: number, w: number, h: number): FakeBuf {
    if (this.buf && this.buf.width === w) return this.buf;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  drawImage(src: FakeCanvas): void {
    this.blitCalls++;
    if ((src as FakeCanvas)._ctx?.buf) this.buf = (src as FakeCanvas)._ctx.buf;
  }
  save(): void {}
  restore(): void {}
  get globalCompositeOperation(): string { return this.gco; }
  set globalCompositeOperation(v: string) { this.gco = v; }
}

function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): FakeCanvas {
      const cv: FakeCanvas = { width: 0, height: 0, _ctx: null as never, getContext(k: string) {
        if (k !== '2d') return null;
        if (!cv._ctx) cv._ctx = new FakeCtx2d(cv);
        return cv._ctx;
      } };
      return cv;
    },
  };
}

/** 常值 LUT 贴图（v=0..255 全 texel 同值——wrap/双线性采样恒 v/255，相位无感） */
function mkConstImg(v: number): FakeCanvas {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const cv = dom.document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  const cx2 = cv.getContext('2d')!;
  const im = cx2.createImageData(2, 2);
  for (let i = 0; i < 4; i++) {
    im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  cx2.putImageData(im);
  return cv;
}

/** 非常值 2×2 LUT（[a,b;b,a] 棋盘——uTime/uSaturation 相位滚动改变采样 texel） */
function mkPatternImg(a: number, b: number): FakeCanvas {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const cv = dom.document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  const cx2 = cv.getContext('2d')!;
  const im = cx2.createImageData(2, 2);
  const vals = [a, b, b, a];
  for (let i = 0; i < 4; i++) {
    im.data[i * 4] = vals[i]; im.data[i * 4 + 1] = vals[i]; im.data[i * 4 + 2] = vals[i]; im.data[i * 4 + 3] = 255;
  }
  cx2.putImageData(im);
  return cv;
}

/** v 向梯度 LUT（2×2：row0=top 值、row1=bottom 值——v=1=图底=bot；双线性下
 *  采样值随 v 线性过渡）。极性决定性测用：across=v 直接进 s1 采样。 */
function mkGradImg(top: number, bot: number): FakeCanvas {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const cv = dom.document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  const cx2 = cv.getContext('2d')!;
  const im = cx2.createImageData(2, 2);
  for (let x = 0; x < 2; x++) {
    im.data[x * 4] = top; im.data[x * 4 + 1] = top; im.data[x * 4 + 2] = top; im.data[x * 4 + 3] = 255;
    const o = (x + 2) * 4;
    im.data[o] = bot; im.data[o + 1] = bot; im.data[o + 2] = bot; im.data[o + 3] = 255;
  }
  cx2.putImageData(im);
  return cv;
}

/** fake atlas：Extra_191=s0 常值、Extra_189=s1 常值、Extra_190=s2（const2===undefined
 *  时也常值;否则棋盘）、Extra_195/196/197=RainbowRod 三件套（棋盘 s2） */
function sm2Atlas(s0v: number, s1v: number, s2v: number, s2pattern?: [number, number],
  s1grad?: boolean): never {
  const cache = new Map<string, FakeCanvas>();
  const get = (path: string): FakeCanvas | null => {
    if (!path) return null;
    if (!cache.has(path)) {
      if (path.includes('Extra_191') || path.includes('Extra_192')) cache.set(path, mkConstImg(s0v));
      else if (path.includes('Extra_189') || path.includes('Extra_194')) cache.set(path, s1grad ? mkGradImg(50, 220) : mkConstImg(s1v));
      else if (path.includes('Extra_190') || path.includes('Extra_193')) cache.set(path, s2pattern ? mkPatternImg(s2pattern[0], s2pattern[1]) : mkConstImg(s2v));
      else cache.set(path, mkConstImg(s2v));   // 其余（RainbowRod/LightDisc 域）同 s2 常值（活性测试不被 path 域差异污染）
    }
    return cache.get(path)!;
  };
  return {
    ensureVImage: (path: string) => get(path),
  } as never;
}

/** 顶点带：水平直线带（y 恒、x 均匀 8px 间隔），v0 恒定（二进制精确值防浮点漂） */
const PTS = (n: number): Array<{ x: number; y: number; hw: number; r: number; g: number; b: number; a: number }> =>
  Array.from({ length: n }, (_, i) => ({
    x: 10 + i * 8, y: 32, hw: 8, r: 0.75, g: 0.5, b: 0.25, a: 0.5,
  }));

function runTrail(set: 'FlameLash' | 'MagicMissile' | 'RainbowRod', opacity: number,
  time: number, atlas: never, n = 10): FakeBuf | null {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const target = dom.document.createElement('canvas');
  target.width = 128; target.height = 64;
  target.getContext('2d');
  const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
    { atlas } as never, { set, pts: PTS(n), opacity, time });
  if (!ok) return null;
  return target._ctx.buf!;
}

describe('TrailShader obj55 "MagicMissile" pass SM2 字节码像素面', () => {
  beforeAll(() => installFakeDom());

  it('EXTRA_SETS 钉值：四技术 uSaturation=-2/-2.8（Drawer.cs 逐值）、FinalFractal 不入 SM2 档', () => {
    expect(EXTRA_SETS.FlameLash.sm2).toBe(-2);            // FlameLashDrawer.cs:16
    expect(EXTRA_SETS.MagicMissile.sm2).toBe(-2.8);       // MagicMissileDrawer.cs:15
    expect(EXTRA_SETS.RainbowRod.sm2).toBe(-2.8);         // RainbowRodDrawer.cs:15
    expect(EXTRA_SETS.LightDisc.sm2).toBe(-2.8);          // LightDiscDrawer.cs:15
    expect(EXTRA_SETS.FinalFractal.sm2).toBeUndefined();  // obj58 tech 档不重叠
    expect(EXTRA_SETS.EmpressBlade.sm2).toBeUndefined();
  });

  it('精确公式锚（instr#1-16 独立重算）：常值 LUT 下 s0×(s1.r×edge)×v0×uOpacity', () => {
    // 像素 (pxi=47, pyi=11)：wx=46.5（bx=−1,rs=1）落段 4（[42,50]）tt=0.5625 →
    // bestV=(4.5625)/9 → p=min(1, bestV)=0.506944…；wy=32.5 → uN=0.53125（d=16）。
    // 常值 LUT：s0=204/255、s1=153/255、s2=230/255（相位无感）。
    //   wEnv = p×1.5−0.5 = 0.2604166…
    //   edge = sat(2×(230/255 − wEnv)) = sat(1.28308…) = 1
    //   out.r = 204/255×(153/255×1)×0.75×2 = 0.72          → ×255 → 184
    //   out.g = 204/255×(153/255×1)×0.5×2  = 0.48          → 122（122.4 量化）
    //   out.b = 204/255×(153/255×1)×0.25×2 = 0.24          → 61（61.2）
    const buf = runTrail('FlameLash', 2, 1.25, sm2Atlas(204, 153, 230));
    expect(buf).not.toBeNull();
    // scratch bbox：x∈[−1,93]→bw=94、y∈[21,42]→bh=22；行 pyi=11、列 pxi=47
    const o = (11 * buf!.width + 47) * 4;
    const d = buf!.data;
    expect(d[o]).toBeGreaterThanOrEqual(183);
    expect(d[o]).toBeLessThanOrEqual(185);
    expect(d[o + 1]).toBeGreaterThanOrEqual(121);
    expect(d[o + 1]).toBeLessThanOrEqual(123);
    expect(d[o + 2]).toBeGreaterThanOrEqual(60);
    expect(d[o + 2]).toBeLessThanOrEqual(62);
    expect(d[o + 3]).toBe(255);                            // ★premul 陷阱修：a=255 让 rgb 全额通过（probe4 实证 a=0 被吞）
  });

  it('edge 包络带尾截断：常值 s2=0.9 → p>0.933 判黑（wEnv 越界 sat(负)=0）', () => {
    const buf = runTrail('FlameLash', 2, 1.25, sm2Atlas(204, 153, 230));
    const d = buf!.data;
    if (process.env.TRAIL_DBG) {
      const bw = buf!.width;
      const colLit: number[] = [];
      for (let pxi = 0; pxi < bw; pxi++) {
        let nz = 0;
        for (let pyi = 0; pyi < buf!.height; pyi++) {
          const o = (pyi * bw + pxi) * 4;
          if (d[o] > 0 || d[o + 1] > 0 || d[o + 2] > 0) nz++;
        }
        colLit.push(nz);
      }
      console.log('DBG colLit:', colLit.map((v, i) => v > 0 ? `${i}:${v}` : null).filter(Boolean).join(' '));
      const o86 = (11 * bw + 86) * 4;
      console.log('DBG px86 rgb', d[o86], d[o86 + 1], d[o86 + 2]);
    }
    // 带尾列（pxi=86 → wx=85.5 → 最近段 8 tt=1 → p=1 → wEnv=1.0 → edge=sat(2×(0.9−1.0))=0）
    const bw = buf!.width;
    let tailLit = 0;
    for (let pyi = 6; pyi <= 16; pyi++) {
      const o = (pyi * bw + 86) * 4;
      if (d[o] > 0 || d[o + 1] > 0 || d[o + 2] > 0) tailLit++;
    }
    expect(tailLit).toBe(0);
    // 带头列（pxi=4 → wx=3.5 → p≈0.0625 → wEnv=−0.406 → edge=1）
    const headO = (11 * bw + 4) * 4;
    expect(d[headO]).toBeGreaterThanOrEqual(183);          // 0.8×0.6×0.75×2×edge=0.72×255 无 edge 削
    expect(d[headO]).toBeLessThanOrEqual(185);
  });

  it('uTime 相位活性：棋盘 s2 下 time=0 与 time=0.75 输出不同（preshader→c1.x→采样坐标链活）', () => {
    // ★Δtime=0.75 → Δu=0.75×(−2.8)=−2.1 → Δx=4.2 texel——2×2 棋盘周期=2 texel,
    //  4.2 非整周期（整数差会踩同相位陷阱,首版 1.5/1.25 差值即此翻车）。
    //  ★set=MagicMissile（s2=Extra_193）：FlameLash 的 Extra_190 已被前两个 it 的
    //  extraData imgCache 缓存成常值版——pattern 传入会被缓存挡掉（跨 it 污染）,
    //  必须用尚未采样过的贴图 path 域。
    const a = runTrail('MagicMissile', 2, 0, sm2Atlas(204, 153, 230, [90, 200]));
    const b = runTrail('MagicMissile', 2, 0.75, sm2Atlas(204, 153, 230, [90, 200]));
    let diff = 0;
    for (let i = 0; i < a!.data.length; i += 4) {
      if (Math.abs(a!.data[i] - b!.data[i]) > 0) diff++;
    }
    expect(diff).toBeGreaterThan(4);                       // 相位滚动改变 gate 面
  });

  it('uSaturation 钉值活性：FlameLash(-2) vs MagicMissile(-2.8) 同参数贴图 → 输出不同', () => {
    // ★sm2Atlas 已把 MagicMissile 域（192/194/193）与 FlameLash 域（191/189/190）
    //  映射成同值常量/同参棋盘——两 set 唯一差异 = EXTRA_SETS.sm2 钉值。
    //  ★time=1.5 → Δu=(−2−(−2.8))×1.5=1.2 → Δx=2.4 texel（非整周期）
    const a = runTrail('FlameLash', 2, 1.5, sm2Atlas(204, 153, 230, [90, 200]));
    const b = runTrail('MagicMissile', 2, 1.5, sm2Atlas(204, 153, 230, [90, 200]));
    let diff = 0;
    for (let i = 0; i < a!.data.length; i += 4) {
      if (Math.abs(a!.data[i] - b!.data[i]) > 0) diff++;
    }
    expect(diff).toBeGreaterThan(4);
  });

  it('顶点 a=0 → 输出全零（★锁 CPU ca<=0.004 门,TrailShader.ts:309——instr#15 仅 alpha lane 消费 V[3],v0.a 不进 rgb;原版输出 alpha 面由 rgb 门/加算语义吸收）', () => {
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    const target = dom.document.createElement('canvas');
    target.width = 128; target.height = 64;
    target.getContext('2d');
    const pts = PTS(10).map((q) => ({ ...q, a: 0 }));
    const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
      { atlas: sm2Atlas(204, 153, 230) } as never,
      { set: 'FlameLash', pts, opacity: 2, time: 1.25 });
    expect(ok).toBe(true);
    const d = target._ctx.buf!.data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 0 || d[i + 1] > 0 || d[i + 2] > 0) lit++;
    }
    expect(lit).toBe(0);
  });
});

describe('TrailShader obj55 极性/接线/写域闸门（红队 F1/F5 2026-09-03）', () => {
  beforeAll(() => installFakeDom());

  it('across 极性决定性测：s1 v 向梯度 LUT 下【带上暗、带下亮】（左移带,红队 F1 回退锚）', () => {
    // 几何：pts x 递增 = pts[0](x=10) 最新在左 = 弹向左飞、尾向 +x。原版 A 侧 =
    // (rot−π/2) 向,rot=指向邻新点=−π/2·? ——左移 rot=π → widthDir=(π/2)向=(0,1)=下
    // → across=1 在【下】侧。CPU uN：上侧 ddy<0、ex>0 → bestU=ddy·ex<0 → uN→0
    // ⇒ across=uN 下侧→1。梯度 LUT（top=50/bottom=220,v=1=底=亮）⇒ 下侧亮。
    const buf = runTrail('FlameLash', 2, 1.25, sm2Atlas(204, 153, 230, undefined, true));
    expect(buf).not.toBeNull();
    const bw = buf!.width;
    const d = buf!.data;
    // 列 pxi=20（带内、edge=1 前段）；行 pyi=5（wy=26.5 上）vs pyi=17（wy=38.5 下）
    const rowAvg = (pyi: number): number => {
      let sum = 0;
      for (let px = 16; px <= 24; px++) sum += d[(pyi * bw + px) * 4];
      return sum / 9;
    };
    const up = rowAvg(5), down = rowAvg(17);
    expect(down).toBeGreaterThan(up + 20);   // 下侧（across→1=v=1=亮）显著亮于上侧
  });

  it('tex[2] 接线活性：s1 梯度 LUT 下带内输出垂直非均匀（across 进采样,断链→NaN 吸收恒值判红）', () => {
    const buf = runTrail('FlameLash', 2, 1.25, sm2Atlas(204, 153, 230, undefined, true));
    const bw = buf!.width;
    const d = buf!.data;
    // 同列（pxi=20）跨行采样值集合≥3 档（v 梯度连续覆盖;若 tex[2] 断链,
    // across=T[1]/NaN=NaN → sampler 吸收至 texel(0,0)=恒 50 → 全列同值）
    const vals = new Set<number>();
    for (let pyi = 4; pyi <= 18; pyi++) {
      const v = d[(pyi * bw + 20) * 4];
      if (v > 0) vals.add(v);
    }
    expect(vals.size).toBeGreaterThanOrEqual(3);
  });

  it('带外像素不写（a=0）——premul 黑 texel 修复的写域面（红队 F5-1）', () => {
    const buf = runTrail('FlameLash', 2, 1.25, sm2Atlas(204, 153, 230));
    const d = buf!.data;
    // scratch 左上角（bbox 角,带 hw=8 外）与右下角恒带外
    expect(d[3]).toBe(0);
    const bw = buf!.width, bh = buf!.height;
    expect(d[((bh - 1) * bw + (bw - 1)) * 4 + 3]).toBe(0);
    // 全图统计：a>0 的像素必有 rgb>0（黑 texel 零写入）
    let badBlack = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] === 0) badBlack++;
    }
    expect(badBlack).toBe(0);
  });
});
