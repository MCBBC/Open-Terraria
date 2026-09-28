// ★shineslice（?shineslice=1 缺省关）结构锁+行为锁（2026-09-28 登记债清算刀）。
// 病灶=TileShine 动态支逐格 6.4KB/格/帧上传+同量 getImageData 读回（叶绿素农场
// 数百格在视=MB 级/帧）。本刀=逐 (格内容,动画相位) 稳定键切片上 GPU：首见
// texFromRegion 上传+快照,稳态零上传零读回;delta 走消费 rec 顶点色（quadSprite
// uTint）。node 可跑面=键稳定性/uploadShineSlice 行为/tint→rec→发射链/帽清扫+
// 源级锁;像素对拍=scripts/_shine-slice-ab.mjs（node 无 GL/canvas,该面探针锁）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { shineSliceCellKey, shineSliceGl, shineSliceGlSetForTest } from '../src/render/TileShine';
import { tileAnim } from '../src/render/TileAnim';

const TS = readFileSync(join(__dirname, '../src/render/TileShine.ts'), 'utf8');
const RD = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GE = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

/** TileStore 最小桩（shineSliceCellKey 只消费 type/flags/half/slope/frameX/frameY/paint） */
function mkStore(w: number, h: number) {
  const N = w * h;
  const type = new Uint16Array(N);
  const flags = new Uint8Array(N);
  const half = new Uint8Array(N);
  const slope = new Uint8Array(N);
  const frameX = new Uint16Array(N);
  const frameY = new Uint16Array(N);
  const paint = new Uint8Array(N);
  return {
    w, h, type, flags, half, slope, frameX, frameY, paint,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
  };
}
const mkWorld = (st: ReturnType<typeof mkStore>) => ({ store: st }) as never;

describe('★shineslice 内容指纹键', () => {
  it('位键+指纹:同格同内容同键（跨帧稳定=零重传）;异格异键（零碰撞）;邻格帧变/漆变/动画相位变 → 新键', () => {
    tileAnim.tick = 0;
    const st = mkStore(16, 16);
    st.type[st.idx(8, 8)] = 211;          // 中心=叶绿素脉动矿
    st.type[st.idx(9, 8)] = 211;          // 邻格同矿（blend 框架依赖）
    const k1 = shineSliceCellKey(mkWorld(st), 8, 8, 211, 211);
    const k2 = shineSliceCellKey(mkWorld(st), 8, 8, 211, 211);
    const kOtherCell = shineSliceCellKey(mkWorld(st), 9, 8, 211, 211);
    expect(k1).toBe(k2);                   // 跨帧幂等（稳态零上传的机制面）
    expect(k1).toMatch(/^shineSlice:211:8:8:[0-9a-f]+$/);
    expect(kOtherCell).not.toBe(k1);       // ★位键:异格恒异键（211 2×2 组 auto 框架
                                           //   按绝对奇偶取组位——纯内容键曾碰撞错帧）
    // 邻格 frameX 变（blend 取帧读邻格）→ 键变（内容变化失效面）
    st.frameX[st.idx(9, 8)] = 18;
    expect(shineSliceCellKey(mkWorld(st), 8, 8, 211, 211)).not.toBe(k1);
    // 漆变 → 键变
    st.frameX[st.idx(9, 8)] = 0;
    const kNoPaint = shineSliceCellKey(mkWorld(st), 8, 8, 211, 211);
    st.paint[st.idx(8, 8)] = 5;
    expect(shineSliceCellKey(mkWorld(st), 8, 8, 211, 211)).not.toBe(kNoPaint);
    // 动画相位变（sheet 12 rate=6:tick 0→6=帧推进）→ 键变
    const st2 = mkStore(8, 8);
    st2.type[st2.idx(4, 4)] = 12;
    tileAnim.tick = 0;
    const ka = shineSliceCellKey(mkWorld(st2), 4, 4, 12, 12);
    tileAnim.tick = 6;
    const kb = shineSliceCellKey(mkWorld(st2), 4, 4, 12, 12);
    expect(ka).not.toBe(kb);
    tileAnim.tick = 0;
  });
});

// ---- uploadShineSlice 行为锁 ----
function mkSliceHost() {
  const layers = {
    unavailable: false, open: false,
    regionKeys: [] as string[],
    entries: new Map<string, { key: string }>(),
    dropped: [] as string[],
    spriteCalls: [] as Array<{ key: string; tint: readonly [number, number, number] | null; alpha: number }>,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin() { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive() { /* no-op */ }, blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
    quadSprite(e: { key: string }, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number,
      o?: { tint?: readonly [number, number, number] | null; alpha?: number }) {
      // tint 快照（真实 quadSprite 同步读入 uniform;TINT3 共享槽引用后读会全显末值）
      this.spriteCalls.push({ key: e.key, tint: o?.tint ? [...o.tint] : null, alpha: o?.alpha ?? 1 });
    },
    texFromRegion(key: string) {
      this.regionKeys.push(key);
      let e = this.entries.get(key);
      if (!e) { e = { key }; this.entries.set(key, e); }   // 幂等键:同键恒同条目（真实语义）
      return e;
    },
    texFromImage() { return null; }, texFromData() { return null; }, texRefresh() { return null; },
    texAlive() { return true; },
    dropTexture(key: string) { this.dropped.push(key); this.entries.delete(key); },
    end() { /* no-op */ },
  };
  return {
    layers,
    host: {
      acquireGl: () => (layers.unavailable ? null : layers),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    },
  };
}
const mkScratch = () => ({ width: 40, height: 40 }) as unknown as HTMLCanvasElement;
const TINT: [number, number, number] = [0.6, 0.5, 0.4];

describe('★shineslice uploadShineSlice 行为锁', () => {
  it('首见=region 键建纹理;稳态命中零新条目;每笔挂 pending 由下一笔同 img drawImage 消费', () => {
    const { layers, host } = mkSliceHost();
    const exec = new GLShimExecutor(host as never);
    const ctx = exec.attachAcc();
    expect(ctx).toBeTruthy();
    const sc = mkScratch();
    expect(exec.uploadShineSlice(sc, 'shineSlice:211:7', TINT)).toBe(true);
    expect(layers.regionKeys).toEqual(['shineSlice:211:7']);
    // 稳态:同键再钩（下帧）→ texFromRegion 幂等命中（零新上传面,条目数不涨）
    expect(exec.uploadShineSlice(sc, 'shineSlice:211:7', TINT)).toBe(true);
    expect(layers.regionKeys.length).toBe(2);
    expect(layers.entries.size).toBe(1);
    // 消费链:hook→drawImage（pending 1:1）→ rec 持 tint
    ctx!.drawImage(sc, 100, 200, 40, 40);
    exec.flush();
    expect(layers.spriteCalls.length).toBe(1);
    expect(layers.spriteCalls[0].key).toBe('shineSlice:211:7');
    expect(layers.spriteCalls[0].tint).toEqual(TINT);   // delta 走 quad tint（本刀正解面）
    expect(layers.spriteCalls[0].alpha).toBe(1);
  });

  it('异 tint 同键（呼吸扫频）:纹理不重传,tint 逐帧跟 quad——MB/帧→KB 级的机制面', () => {
    const { layers, host } = mkSliceHost();
    const exec = new GLShimExecutor(host as never);
    const ctx = exec.attachAcc()!;
    const sc = mkScratch();
    const q = (t: [number, number, number]) => {
      expect(exec.uploadShineSlice(sc, 'shineSlice:211:9', t)).toBe(true);
      ctx.drawImage(sc, 0, 0, 40, 40);
    };
    q([0.6, 0.5, 0.4]);
    q([0.6, 0.51, 0.4]);
    q([0.6, 0.52, 0.4]);
    exec.flush();
    expect(layers.entries.size).toBe(1);                 // 同键=同纹理（delta 不烘进纹理）
    expect(layers.spriteCalls.map((s) => s.tint![1])).toEqual([0.5, 0.51, 0.52]);
  });

  it('非活跃窗/GL 死 → false=调用方落回 2D 乘法烘焙原链', () => {
    const { host } = mkSliceHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.uploadShineSlice(mkScratch(), 'shineSlice:12:1', TINT)).toBe(false);
    const { layers, host: h2 } = mkSliceHost();
    layers.unavailable = true;
    const exec2 = new GLShimExecutor(h2 as never);
    expect(exec2.attachAcc()).toBeNull();
    expect(exec2.uploadShineSlice(mkScratch(), 'shineSlice:12:1', TINT)).toBe(false);
  });

  it('帽账:shineKeySeen 超 1024 清扫 600 帧未触键（纹理+快照同摘;与新键空间共账）', () => {
    const { layers, host } = mkSliceHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    const ex = exec as unknown as { _frameSeq: number; shineKeySeen: Map<string, number>;
      sliceSnaps: Map<string, unknown>; uploadShineSlice: (i: HTMLCanvasElement, k: string,
        t: [number, number, number]) => boolean };
    // 填满 1024 触发清扫窗
    for (let i = 0; i < 1030; i++) ex.uploadShineSlice(mkScratch(), `shineSlice:x:${i}`, TINT);
    expect(ex.shineKeySeen.size).toBeLessThanOrEqual(1030);
    // 老键触帧停格+帧推进 → 闲置清扫（dropTexture 到位）
    ex._frameSeq += 601;
    ex.uploadShineSlice(mkScratch(), 'shineSlice:fresh:1', TINT);
    expect(layers.dropped.length).toBeGreaterThan(0);
    expect(ex.shineKeySeen.has('shineSlice:x:0')).toBe(false);
  });

  it('GLShimExecutor.drawRec2D tinted 支在源码中在位（降级帧 sprite×delta 重放面）', () => {
    expect(GE).toContain("'multiply'");
    expect(GE).toContain("tg.globalCompositeOperation = 'destination-in';");
    expect(GE).toContain('tintReplayScratch(w, h)');
  });
});

// ---- 结构锁（源码锚;防并行会话漂移+prelock 旧链共存面） ----
describe('★shineslice 结构锁', () => {
  it('TileShine:旗转正缺省开(node 判死 false)+切片钩+先钩后乘支+旧乘法链原样（prelock 锚共存）', () => {
    expect(TS).toContain("new URLSearchParams(location.search).get('shineslice') !== '0'");
    expect(TS).toContain('export function shineSliceGlSetForTest(');
    expect(TS).toContain('export function setShineScratchSliceHook(');
    expect(TS).toContain('export function shineSliceCellKey(');
    // 切片支:接管成功 → 跳过 multiply（sprite-only 面直出,乘法由 GL tint 承担）
    expect(TS).toContain('if (dynamicDest && shineSliceGl) {');
    expect(TS).toContain('shineSliceCellKey(world, x, y, sheet, type)');
    // 旧链逐位保留（旗关/2D 会话/GL 未接管的唯一路径;prelock 源锚共存）
    expect(TS).toContain('if (dynamicDest) shineScratchBakeHook?.(sc, `shineCell:${x},${y}`);');
    expect(TS).toContain("let shineScratchBakeHook: ((c: HTMLCanvasElement, key: string) => void) | null = null;");
    expect(TS).toContain("s.globalCompositeOperation = 'multiply';");
    expect(TS).toContain("s.globalCompositeOperation = 'destination-in';");
  });

  it('Renderer:markWorldDynamicScratch 第三形态 (key,tint)+双钩注册', () => {
    expect(RD).toContain('markWorldDynamicScratch(img: HTMLCanvasElement, key?: string,\n    tint?: readonly [number, number, number]): boolean {');
    expect(RD).toContain('if (shineSliceGl) return this.bglShimReg().uploadShineSlice(img, key, tint);');
    expect(RD).toContain('setShineScratchSliceHook((c, key, tint) => this.markWorldDynamicScratch(c, key, tint));');
  });

  it('GLShimExecutor:uploadShineSlice+帽常量复用（与 shineCell 既有锁兼容）', () => {
    expect(GE).toContain('uploadShineSlice(img: HTMLCanvasElement, key: string,');
    expect(GE).toContain('private static SHINE_KEY_CAP = 1024;');
    expect(GE).toContain('private static SHINE_KEY_IDLE = 600;');
    expect(GE).toContain('this.sliceSnaps.delete(k);');
  });

  it('旗快照:node 环境判死 false（浏览器缺省开由源锚锁定;转正语义 2026-09-29）', () => {
    expect(shineSliceGl).toBe(false);
    shineSliceGlSetForTest(true);
    expect(shineSliceGl).toBe(true);
    shineSliceGlSetForTest(false);
    expect(shineSliceGl).toBe(false);
  });
});
