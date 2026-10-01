// ★K2 力场泡栅格化成本削减守卫（2026-10-01）:
// ①GLSL 转录锁——FFIELD_FS_SRC 活跃常量逐字钉值（px_ForceField 生成体/反汇编直读,
//   BJ378「金标=反编译直读」判例;转录漂移=离线场值闸之外的第二道静态闸）;
// ②GL 发射面——stride 9 场 quad 顶点数学（CTM 折算/uv/col/time）+ring annulus
//   （ADD 批 vCol='lighter' 预乘贡献）+发射计数;
// ③降级 replay 闭包（设备空间直画+同桶缓存产物）;
// ④2D 全量回退（无发射中介→sm2Runs 走原链,glEmits=0）;
// ⑤形状分派判别值源码锁（54/quad 唯一,48/66 零交集）。
// 场值逐像素验收（GLSL vs SM2 解释器,maxd≤2/255）=浏览器探针 scripts/_k2-fieldgate.mjs
// （node 无 WebGL;LIQSHIM c13c 同款分工）。
import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach } from 'vitest';
import {
  drawForceFieldBubble, __resetForceFieldBubbleForTest, __forceFieldBubbleStats,
} from '../src/fx/ForceFieldBubble';
import { FFIELD_VS_SRC, FFIELD_FS_SRC } from '../src/render/GLSpriteLayer';
import { getPass, runPassOnImageData, defaultUniforms } from '../src/fx/SM2Effect';
import type { Renderer } from '../src/render/Renderer';

// ---- 最小 fake DOM/ctx（bj112b-forcefield-coldstart 同款 stub 扩展） ----
interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
class FakeCtx2d {
  createImageData(w: number, h: number): FakeBuf {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(_im: FakeBuf): void {}
  getImageData(_x: number, _y: number, w: number, h: number): FakeBuf {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;   // α 恒 255（原版 Perlin 实测）
    return { data, width: w, height: h };
  }
  drawImage(): void {}
  fillRect(): void {}
  save(): void {}
  restore(): void {}
  setTransform(): void {}
  translate(): void {}
  rotate(): void {}
  beginPath(): void {}
  arc(): void {}
  ellipse(): void {}
  stroke(): void {}
  globalAlpha = 1;
  globalCompositeOperation: string = 'source-over';
  imageSmoothingEnabled = false;
}
function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): unknown {
      return { width: 0, height: 0, getContext: (_k: string) => new FakeCtx2d() };
    },
  };
}
installFakeDom();

type Opts = Parameters<typeof drawForceFieldBubble>[2];
const ID_M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function fakeCtx(m: Record<string, number> = ID_M): CanvasRenderingContext2D {
  const c = new FakeCtx2d() as unknown as Record<string, unknown>;
  c.getTransform = () => ({ ...m }) as unknown as DOMMatrix;
  return c as unknown as CanvasRenderingContext2D;
}
function opts(o: Partial<Opts> = {}): Opts {
  return { cx: 100, cy: 100, radius: 300, tint: [255, 120, 60], frac: 1, breakT: -1, reformT: -1, time: 0.5, ...o };
}

interface Emitted { img: CanvasImageSource; key: string; data: Float32Array; quads: number }
function fakeRendererGL(): { renderer: Renderer; emitted: Emitted[]; replays: Array<(c: CanvasRenderingContext2D) => void> } {
  const emitted: Emitted[] = [];
  const replays: Array<(c: CanvasRenderingContext2D) => void> = [];
  const renderer = {
    atlas: { ensureVImage: () => ({ width: 128, height: 128 }) },
    emitPrecipQuadBatch: (img: CanvasImageSource, key: string, data: Float32Array, quads: number,
      replay: (c: CanvasRenderingContext2D) => void): boolean => {
      emitted.push({ img, key, data, quads }); replays.push(replay); return true;
    },
    emitLiquidAddQuadBatch: (img: CanvasImageSource, key: string, data: Float32Array, quads: number,
      replay: (c: CanvasRenderingContext2D) => void): boolean => {
      emitted.push({ img, key, data, quads }); replays.push(replay); return true;
    },
  } as unknown as Renderer;
  return { renderer, emitted, replays };
}
function fakeRenderer2D(): Renderer {
  return {
    atlas: { ensureVImage: () => ({ width: 128, height: 128 }) },
  } as unknown as Renderer;
}

afterEach(() => {
  __resetForceFieldBubbleForTest();
});

describe('★K2 ①GLSL 转录锁（px_ForceField 反汇编活跃常量逐字）', () => {
  it('FS 活跃 def/preshader 常量逐字在场（c8.x/c8.y=cmp 条件源,场值闸证伪死码初判）', () => {
    // c9.z=1/(4π)、c9.w、c8.x、c8.y、c8.z、c10.x、c10.y、c6.x、c6.z、c7.x、c7.y、c5.y、c6.w、c3.x=+5
    for (const pin of [
      '0.0795774906873703', '-0.0000014980281548560015', '1.9999996423721313',
      '12.566368103027344', '- 6.283184051513672',
      '6.2831854820251465', '3.1415927410125732', '2.799999952316284',
      '- 0.3', '0.75', '* 1.5', '30.0', '* 5.0', '-0.5',
    ]) {
      expect(FFIELD_FS_SRC).toContain(pin);
    }
    // dp2add=真 x²+y²（gen 体 inst14;VM x²-only 是登记偏差,运行时恒走生成体）
    expect(FFIELD_FS_SRC).toContain('x * x + y * y');
    // NaN 钳 0 语义复刻（inst41 1/pr=Inf 支）
    expect(FFIELD_FS_SRC).toContain('pr <= 0.0');
    // 预乘输出式（2D 产物 source-over 直 alpha 等价+8bit 钳制复刻）
    expect(FFIELD_FS_SRC).toContain('min(vCol.rgb * w, vec3(1.0))');
    expect(FFIELD_FS_SRC).toContain('straight * w * vCol.a');
    expect(FFIELD_FS_SRC).toContain('precision highp float');   // c13c §5-2 mediump 漏入闸
  });
  it('VS 四属性面+源码锁:形状分派 54/quad 唯一判别（48/66 零交集）', () => {
    expect(FFIELD_VS_SRC).toContain('aTime');
    expect(FFIELD_VS_SRC).toContain('uCanvas');
    const gl = readFileSync(new URL('../src/render/GLSpriteLayer.ts', import.meta.url), 'utf8');
    expect(gl).toContain('data.length === quads * 54');
    expect(gl).toContain('quadBatchForceField');
    expect(gl).toContain("pipe.program('sprite:forcefield'");
  });
});

describe('★K2 ②GL 发射面（stride 9 场 quad+ring annulus）', () => {
  it('发射两笔:ff:perlin 场 quad（54 float,CTM 折算角点/uv/col/time）+ff:white ring（96 段 ADD）', () => {
    const { renderer, emitted } = fakeRendererGL();
    const ok = drawForceFieldBubble(fakeCtx(), renderer, opts());
    expect(ok).toBe(true);
    expect(emitted.length).toBe(2);
    expect(__forceFieldBubbleStats.glEmits).toBe(1);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(0);   // GL 帧零解释器冷跑
    // 场 quad
    const [field, ring] = emitted;
    expect(field.key).toBe('ff:perlin');
    expect(field.quads).toBe(1);
    expect(field.data.length).toBe(54);
    // 恒等 CTM:radius=300,grow=1 → r=600,dst=(−200,−200,600,600)
    const d = field.data;
    expect(d[0]).toBeCloseTo(-200, 5); expect(d[1]).toBeCloseTo(-200, 5);   // TL
    expect(d[9]).toBeCloseTo(400, 5); expect(d[10]).toBeCloseTo(-200, 5);   // TR
    expect(d[18]).toBeCloseTo(400, 5); expect(d[19]).toBeCloseTo(400, 5);   // BR
    expect(d[45]).toBeCloseTo(-200, 5); expect(d[46]).toBeCloseTo(400, 5);  // BL
    // uv 两三角 (0,0)(1,0)(1,1)/(0,0)(1,1)(0,1)——v 向下=2D 产物行序
    expect(d[2]).toBe(0); expect(d[3]).toBe(0);
    expect(d[11]).toBe(1); expect(d[12]).toBe(0);
    expect(d[20]).toBe(1); expect(d[21]).toBe(1);
    expect(d[47]).toBe(0); expect(d[48]).toBe(1);
    // col=uColor(稳态 1,1,1)+ga(frac=1 → α=1);time 逐顶点
    for (let v = 0; v < 6; v++) {
      expect(d[v * 9 + 4]).toBe(1); expect(d[v * 9 + 5]).toBe(1); expect(d[v * 9 + 6]).toBe(1);
      expect(d[v * 9 + 7]).toBe(1);
      expect(d[v * 9 + 8]).toBe(0.5);
    }
    // ring annulus:96 段 stride 8,vCol=(tint·ga35, ga35)
    expect(ring.key).toBe('ff:white');
    expect(ring.quads).toBe(96);
    expect(ring.data.length).toBe(96 * 48);
    const rd = ring.data;
    const ga35 = 0.35;
    expect(rd[4]).toBeCloseTo(ga35, 6);            // tintR=255/255·0.35
    expect(rd[5]).toBeCloseTo(120 / 255 * ga35, 6);
    expect(rd[7]).toBeCloseTo(ga35, 6);
    // 环面半径:全部顶点落内沿 286.5(=288−1.5)或外沿 289.5(=288+1.5)（恒等 CTM）
    const radii = new Set<number>();
    for (let i = 0; i < 96 * 6; i++) {
      radii.add(Math.round(Math.hypot(rd[i * 8] - 100, rd[i * 8 + 1] - 100) * 1000) / 1000);
    }
    expect([...radii].sort((x, y) => x - y)).toEqual([286.5, 289.5]);
  });

  it('破盾支:uColor=(2,2,2) 走顶点色,grow=1+breakT 折算角点', () => {
    const { renderer, emitted } = fakeRendererGL();
    const ok = drawForceFieldBubble(fakeCtx(), renderer, opts({ breakT: 0.5, frac: 0 }));
    expect(ok).toBe(true);
    const d = emitted[0].data;
    for (let v = 0; v < 6; v++) {
      expect(d[v * 9 + 4]).toBe(2); expect(d[v * 9 + 5]).toBe(2); expect(d[v * 9 + 6]).toBe(2);
    }
    // grow=1.5 → r=900 → TL=(100−450,100−450)
    expect(d[0]).toBeCloseTo(-350, 5); expect(d[1]).toBeCloseTo(-350, 5);
  });

  it('环境态预检镜像执行器门:ga≠1/gco≠source-over 整笔走 2D（glFails 零增）', () => {
    const { renderer, emitted } = fakeRendererGL();
    const c = fakeCtx() as unknown as Record<string, unknown>;
    c.globalAlpha = 0.5;
    const ok = drawForceFieldBubble(c as unknown as CanvasRenderingContext2D, renderer, opts());
    expect(ok).toBe(true);                       // 2D 原链接手（save+覆写语义）
    expect(emitted.length).toBe(0);
    expect(__forceFieldBubbleStats.glEmits).toBe(0);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);   // 2D 链产物冷跑照旧
  });
});

describe('★K2 ③降级 replay 闭包（设备空间直画+同桶缓存）', () => {
  it('replay 在 fake ctx 上可执行（save/setTransform/drawImage/restore 序）', () => {
    const { renderer, replays } = fakeRendererGL();
    drawForceFieldBubble(fakeCtx(), renderer, opts());
    expect(replays.length).toBe(2);
    const rc = new FakeCtx2d() as unknown as CanvasRenderingContext2D;
    expect(() => replays[0](rc)).not.toThrow();   // 场=产物 blit（productFor 走真解释器）
    expect(() => replays[1](rc)).not.toThrow();   // ring=ellipse stroke
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);   // 降级帧冷跑一次（灾难路径可接受）
  });
});

describe('★K2 ④2D 全量回退（无发射中介）', () => {
  it('fake renderer 无 emit 方法 → 2D 原链（glEmits=0,产物链照旧）', () => {
    const renderer = fakeRenderer2D();
    const ok = drawForceFieldBubble(fakeCtx(), renderer, opts());
    expect(ok).toBe(true);
    expect(__forceFieldBubbleStats.glEmits).toBe(0);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);
    expect(__forceFieldBubbleStats.glFails).toBe(0);   // 中介缺失=静默 2D,非失败
  });
});

describe('★K2 ⑤场值 JS 锚（SM2 解释器=GLSL 离线闸的 oracle 可达性）', () => {
  it('runPassOnImageData(ForceField) 产物纯函数:同 (uTime,uColor) 逐位可复现', () => {
    const pass = getPass('ForceField');
    expect(pass).not.toBeNull();
    const mk = (): Uint8ClampedArray => {
      const data = new Uint8ClampedArray(128 * 128 * 4);
      for (let i = 0; i < 128 * 128; i++) { data[i * 4] = 200; data[i * 4 + 3] = 255; }
      const u = defaultUniforms();
      u.uColor = [1, 1, 1]; u.uTime = 3.4;
      u.uSourceRect = [0, 0, 128, 128]; u.uImageSize0 = [128, 128];
      runPassOnImageData(pass!, data, 128, 128, u);
      return data;
    };
    const a = mk(), b = mk();
    for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i]);
  });
});
