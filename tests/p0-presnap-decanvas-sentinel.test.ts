// ★P0 preSnap 去画布化哨兵（2026-09-28 灾难链定谳刃;用户明令「越优化越糟糕」
//  验收=负载模拟下零恶化硬指标）：
//   定谳链:R1b-6 快照面 snapBakeBytes 每 bake createElement 一张新画布→霜月
//   A=0 加性族尘（rgbv 彩色档逐尘 tint 烘焙）帧数千 bake=canvas 出生风暴
//   （探针 _presnap-storm-probe 实测旧码 2441.7/s;用户实报 531-2376/s）→GC
//   432-580MB 锯齿→CONTEXT_LOST×N→GPU 压力熔断（3 次/10s）→chunk 192→96→64
//   →主画布重建→波场看门狗回落（8235ms 无场回传）→全 2D。
//   修=快照去画布化:区域字节 ImageData（烘焙点现成者直挂=零拷贝）,重放经
//   preSnapScratch 共享面 putImageData 中转——稳态零画布出生,R1b-6 语义原样
//   （每 bake 独立字节,无池化无容量=溢出支不存在）。
//   旧码判别力:负载模拟 30000 bake → 本哨兵出生计数=30000（红）;新码=0（绿）。
// node 可跑面：FakeCtx+有状态层桩（glshim-r1b-beta 判例同款）;document 桩带
//  createElement 出生计数（哨兵本体）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

interface DrawRec { img: unknown; args: unknown[]; gco: string }
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  log: DrawRec[] = [];
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { /* 桩 */ }
  restore() { /* 桩 */ }
  drawImage(img: unknown, ...args: unknown[]) { this.log.push({ img, args, gco: this.globalCompositeOperation }); }
}

/** acc 态 host 桩（可注入 GL 死亡;degradeAcc 镜像 Renderer 双步——否则重放 raw=null） */
function mkAccHost() {
  const layer = {
    unavailable: false, open: false,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin(_name: string, _clear: boolean) { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive() { /* no-op */ }, blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
    quadSprite() { /* no-op */ },
    texRefresh() { return { tex: {}, w: 8, h: 8, key: 'bake' }; },
    texRefreshRegion() { return { tex: {}, w: 8, h: 8, key: 'bake' }; },
    texAlive() { return true; },
    dropTexture() { /* no-op */ },
  };
  const replayCtx = new FakeCtx();
  let shim: GLShimExecutor | null = null;
  const host = {
    acquireGl: () => (layer.unavailable ? null : (layer as never)),
    worldCtx: () => replayCtx as unknown as CanvasRenderingContext2D,
    worldW: () => 128, worldH: () => 72,
    degradeAcc: () => {
      layer.endAccumulate();
      shim?.bridge(replayCtx as unknown as CanvasRenderingContext2D);
      return true;
    },
  };
  return { layer, replayCtx, host, setShim: (s: GLShimExecutor) => { shim = s; } };
}

/** 共享尘 scratch 桩（8×8=尘族真形;getImageData 产出按标记填充的可辨 ImageData）。
 *  回调抓取最新快照字节=消费 rec 侧期望值（R1b-6 语义对账源）。 */
function mkDustScratch(marker: () => number): HTMLCanvasElement {
  return {
    width: 8, height: 8,
    getContext: () => ({
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w, height: h,
        data: new Uint8ClampedArray(w * h * 4).fill(marker() & 0xff),
      }),
    }),
  } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('★P0 哨兵:负载模拟 canvas 出生率（旧码 30000 红/新码 0 绿）', () => {
  it('霜月尘负载:10 帧×3000 逐尘烘焙+bolt 式子区烘焙 → document.createElement(canvas)=0', () => {
    let born = 0;
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (String(tag).toLowerCase() === 'canvas') born++;
        return { width: 0, height: 0, getContext: () => ({}) };
      },
    });
    const { host, setShim } = mkAccHost();
    const ex = new GLShimExecutor(host as never);
    setShim(ex);
    const ctx = ex.attachAcc();
    expect(ctx).not.toBeNull();
    const s1 = mkDustScratch(() => 7);   // 内容恒定尘（哨兵只称出生,内容对账归下组）
    const FRAMES = 10, PER_FRAME = 3000;
    for (let f = 0; f < FRAMES; f++) {
      ex.frameReset();
      for (let i = 0; i < PER_FRAME; i++) {
        ex.uploadScratchNow(s1, `dustTint:${i % 6000}`);
        ctx!.drawImage(s1, 0, 0);        // 消费 pending（acc rec 入队）
      }
      // bolt 式子区烘焙（P1-B 形状:rw/rh=烘焙 bbox）
      ex.uploadScratchNow(s1, `boltBake:${f}`, 6, 5, undefined);
      ctx!.drawImage(s1, 0, 0, 6, 5, 0, 0, 6, 5);
      ex.flush();                        // GL 活:发射进桩 FBO,队列清空
    }
    // 哨兵判别力自证:计数器本身是活的（防桩死=假绿）
    document.createElement('canvas');
    expect(born).toBe(1);
    // stats 帧界复位:末帧 draws=3000 尘+1 bolt（负载真实跑过的证物）
    expect(ex.stats.draws).toBe(PER_FRAME + 1);
    // ★P0 绿判据:全程 30039 次 bake 零画布出生（旧码此值=30039）
    expect(born).toBe(1);
    ex.detach();
  });
});

describe('★P0 回归锁:R1b-6 语义在负载下逐位保持（重放=各自 bake 字节）', () => {
  it('3000 尘/帧负载后 GL 死亡整帧重放 → 逐 rec 字节按 bake 序还原+零逐 rec 画布', () => {
    const putLog: unknown[] = [];
    let born = 0;
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (String(tag).toLowerCase() === 'canvas') born++;
        return {
          width: 0, height: 0,
          getContext: () => ({ putImageData: (d: unknown) => putLog.push(d), drawImage() { /* 桩 */ } }),
        };
      },
    });
    const { layer, replayCtx, host, setShim } = mkAccHost();
    const ex = new GLShimExecutor(host as never);
    setShim(ex);
    const ctx = ex.attachAcc();
    // 每尘字节不同（桩标记按 bake 序递增）——重放对账源
    let seq = 0;
    const s1 = mkDustScratch(() => ++seq);
    const PER_FRAME = 3000;
    ex.frameReset();
    for (let i = 0; i < PER_FRAME; i++) {
      ex.uploadScratchNow(s1, `dustTint:${i % 6000}`);
      ctx!.drawImage(s1, 0, 0);
    }
    const bornAtBakeEnd = born;
    expect(bornAtBakeEnd).toBe(0);       // 烘焙期零画布出生
    layer.unavailable = true;            // GL 中帧死亡 → accFail → degradeAcc+重放
    ex.flush();
    expect(born).toBe(1);                // 仅共享回放 scratch 一张（模块级单例,非逐 rec）
    // acc 态降级:重放落 worldCtx（replayCtx,attachAcc 桥语义）;逐 rec 都重放
    expect(replayCtx.log.length).toBe(PER_FRAME);
    expect(putLog.length).toBe(PER_FRAME);       // 逐 rec 都吃快照字节
    // R1b-6 原病回归锁:重放字节=各自 bake 内容（首/中/尾三采样,旧码=全部末次字节;
    // 桩标记=bake 序,putLog 序=重放序=发射序）
    const dataOf = (i: number): number => (putLog[i] as unknown as { data: Uint8ClampedArray }).data[0];
    expect(dataOf(0)).toBe(1);
    expect(dataOf(1500)).toBe(1501 & 0xff);
    expect(dataOf(PER_FRAME - 1)).toBe(PER_FRAME & 0xff);
    // 帧界账清（GC 界面:字节驻留上界=单帧 bake 数,跨帧零驻留）
    ex.frameReset();
    expect((ex as unknown as { bakedTexMulti: Map<object, unknown> }).bakedTexMulti.size).toBe(0);
    ex.detach();
  });
});

describe('★P0 子区快照（bolt 形状）:区域字节域=实采域+越界防御支', () => {
  it('(rw,rh)=烘焙 bbox 快照;src 矩形越快照域 → 防御退 p.img 旧链', () => {
    let born = 0;
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (String(tag).toLowerCase() === 'canvas') born++;
        return {
          width: 0, height: 0,
          getContext: () => ({ drawImage() { /* 桩 */ } }),
        };
      },
    });
    const { layer, replayCtx, host, setShim } = mkAccHost();
    const ex = new GLShimExecutor(host as never);
    setShim(ex);
    const ctx = ex.attachAcc();
    const big = {
      width: 512, height: 512,
      getContext: () => ({
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          width: w, height: h, data: new Uint8ClampedArray(w * h * 4),
        }),
      }),
    } as unknown as HTMLCanvasElement;
    // ① 域内:bolt blit 实采 (0,0,sx,sy) ⊆ 快照域 (0,0,300,200) → 吃快照
    ex.uploadScratchNow(big, 'boltBake:1', 300, 200);
    ctx!.drawImage(big, 0, 0, 300, 200, 40, 40, 300, 200);
    // ② 越界:src 矩形 (0,0,400,400) ⊄ 快照域 → 防御支退 p.img（不读越界字节）
    ex.uploadScratchNow(big, 'boltBake:2', 300, 200);
    ctx!.drawImage(big, 0, 0, 400, 400, 10, 10, 400, 400);
    layer.unavailable = true;
    ex.flush();
    expect(replayCtx.log.length).toBe(2);          // acc 降级重放=2 rec 全落 worldCtx
    // 域内 rec 取样源=共享回放 scratch（≠big）;越界 rec 防御退 p.img（=big 本体）
    // （注:putImageData 落模块级单例 scratch——其 ctx 属先建测试的桩,故本测试
    //  不数 putLog,以取样源身份断言两支）
    expect(replayCtx.log[0].img).not.toBe(big);
    expect(replayCtx.log[1].img).toBe(big);
    expect(born).toBeLessThanOrEqual(1);           // 回放 scratch 单例（同文件先建则 0）
  });
});
