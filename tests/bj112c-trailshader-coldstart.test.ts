// BJ112-c TrailShader 同族死窗修复闸门（src/fx/TrailShader.ts extraData imgCache）。
// 旧实现：extraData 把 ensureVImage 的 null（【三义】=加载在途 _iconPending‖失败冷却
// _vImageFailed‖本拍刚发起,SpriteAtlas.ts:621-644）一律 imgCache.set(path,null)+
// 15s setTimeout 删除——"懒载未就绪"被钉成"失败"→贴图落地后仍被压在兜底近似公式下
// 最多 15s（重负载 createImageBitmap 升级排队数秒=SM2 真值面整段丢失窗口;P2 家族,
// ForceFieldBubble BJ112-① 同病）。修复=方案 a：摘时间负缓存+良性 miss 逐帧重查
// （SpriteAtlas.ts:360 "未就绪返回 null,消费方下帧自愈"既定契约）;真失败节流权归
// 图集 _vImageFailed 10s TTL（SpriteAtlas.ts:651-686 onerror 链）,正像（解码
// ImgData）永久缓存语义不变。
// ★变异判别：负缓存复辟（miss 缓存 null+15s 冷却窗）→ 两条 it 皆红。
// 无 jsdom——注入最小 fake DOM（trail-shader-sm2.test.ts 同款 stub）。
import { describe, it, expect, beforeEach } from 'vitest';
import { drawStripTrail, __resetTrailShaderForTest } from '../src/fx/TrailShader';

interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
interface FakeCanvas { width: number; height: number; _ctx: FakeCtx2d; getContext(k: string): FakeCtx2d | null }
class FakeCtx2d {
  buf: FakeBuf | null = null;
  gco = '';
  constructor(public cv: FakeCanvas) {}
  createImageData(w: number, h: number): FakeBuf { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData(im: FakeBuf): void { this.buf = im; }
  getImageData(_x: number, _y: number, w: number, h: number): FakeBuf {
    if (this.buf && this.buf.width === w) return this.buf;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  drawImage(src: FakeCanvas): void {
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
installFakeDom();

/** 常值 LUT 贴图（v=0..255 全 texel 同值——wrap/双线性采样恒 v/255,相位无感） */
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

/** FlameLash 三件套常值 LUT（与 trail-shader-sm2.test.ts 精确公式锚同参:
 *  s0=Extra_191=204 / s1=Extra_189=153 / s2=Extra_190=230） */
const LUTS: Record<string, number> = {
  'vanilla/Extra_191.png': 204,
  'vanilla/Extra_189.png': 153,
  'vanilla/Extra_190.png': 230,
};

/** pending 可控 fake atlas：setImage 前 ensureVImage 恒 null（懒载未就绪面）,
 *  setImage 后按路径返回常值 LUT;calls=ensureVImage 查询计数（节流权探针） */
function pendingAtlas(): { atlas: never; setImage: () => void; calls: () => number } {
  let img: FakeCanvas | null = null;
  let calls = 0;
  const cache = new Map<string, FakeCanvas>();
  const atlas = {
    ensureVImage(path: string) {
      calls++;
      if (!img) return null;
      if (!cache.has(path)) cache.set(path, mkConstImg(LUTS[path] ?? 128));
      return cache.get(path)!;
    },
  };
  return { atlas: atlas as never, setImage: () => { img = mkConstImg(255); }, calls: () => calls };
}

/** 顶点带：水平直线带（与 trail-shader-sm2.test.ts PTS 同参） */
const PTS = (n: number): Array<{ x: number; y: number; hw: number; r: number; g: number; b: number; a: number }> =>
  Array.from({ length: n }, (_, i) => ({
    x: 10 + i * 8, y: 32, hw: 8, r: 0.75, g: 0.5, b: 0.25, a: 0.5,
  }));

function runFlameLash(atlas: never): { ok: boolean; px: number[] } {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const target = dom.document.createElement('canvas');
  target.width = 128; target.height = 64;
  target.getContext('2d');
  const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
    { atlas } as never, { set: 'FlameLash', pts: PTS(10), opacity: 2, time: 1.25 });
  // 锚像素 (pyi=11,pxi=47)（bbox 94×22,同 trail-shader-sm2 精确锚位）
  const buf = target._ctx.buf!;
  const o = (11 * buf.width + 47) * 4;
  return { ok, px: [buf.data[o], buf.data[o + 1], buf.data[o + 2], buf.data[o + 3]] };
}

beforeEach(() => { __resetTrailShaderForTest(); });

describe('BJ112-c TrailShader extraData 良性 miss 不吃负缓存（P2 家族方案 a）', () => {
  it('pending 期逐帧重查:5 帧 ensureVImage=15 次（三贴图/帧;旧负缓存复辟=3 次后冻结=红）', () => {
    const { atlas, calls } = pendingAtlas();                       // 恒 null（pending 面）
    for (let i = 0; i < 5; i++) runFlameLash(atlas);
    expect(calls()).toBe(15);                                      // ★每帧 3 贴图全查
  });

  it('贴图到达次拍即走 SM2 精确像素锚 184/122/61（旧负缓存第二拍仍兜底 255=红）', () => {
    const { atlas, setImage } = pendingAtlas();
    const f1 = runFlameLash(atlas);
    expect(f1.ok).toBe(true);                                      // 兜底近似仍绘制（回退面不变）
    expect(f1.px[0]).toBe(255);                                    // 兜底锚:base=1×255×0.75×k=1×op=2→255
    setImage();                                                    // 图集懒载落地（下一帧）
    const f2 = runFlameLash(atlas);
    // SM2 精确公式锚（instr#1-16,s0=204/s1=153/s2=230 常值 LUT）:
    //   out.r=204/255×(153/255×1)×0.75×2=0.72→184  out.g→122  out.b→61  a=255
    expect(f2.px[0], '到达次拍 SM2 真值面（旧负缓存=仍 255）').toBeGreaterThanOrEqual(183);
    expect(f2.px[0]).toBeLessThanOrEqual(185);
    expect(f2.px[1]).toBeGreaterThanOrEqual(121);
    expect(f2.px[1]).toBeLessThanOrEqual(123);
    expect(f2.px[2]).toBeGreaterThanOrEqual(60);
    expect(f2.px[2]).toBeLessThanOrEqual(62);
    expect(f2.px[3]).toBe(255);
  });

  it('正像缓存仍在:解码到达后 ensureVImage 不再被查询（calls 冻结;永久缓存语义不变）', () => {
    const { atlas, setImage, calls } = pendingAtlas();
    runFlameLash(atlas);                                           // pending:3 次
    setImage();
    runFlameLash(atlas);                                           // 解码:3 次（imgCache 正像落位）
    runFlameLash(atlas);                                           // 正像命中:0 次
    runFlameLash(atlas);                                           // 正像命中:0 次
    expect(calls()).toBe(6);                                       // ★旧负缓存=3;无正像缓存=12
  });
});
