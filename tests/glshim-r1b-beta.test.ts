// ★红蓝批 β GLShimExecutor 四案行为锁（2026-09-27）：
//   R1b-3 acc 中途失败前缀双画——失败支弃已发射前缀,降级重放只补未发射尾段
//        （旧码 replay 全队列=SO 变浓/ADD 双亮）。
//   R1b-6 preTex 重放错拿末次字节——preTex rec 携带 bake 期字节快照,重放按
//        各自 bake 内容逐位还原（旧码直画共享 scratch=末次烘焙内容）。
//   R1b-7 bakedTexPending 跨帧卫生——frameReset/attachAcc 双点清单槽 pending
//        （旧码只清 multi,bridge 窗残留跨帧错配本帧首笔同 img 绘制）。
//   R3b-4 shineCell 键退休——触帧账+帽,600 帧未触键 dropTexture（键空间不随
//        相机漫游无界增长,不顶替 chunk 页等活纹理）。
// node 可跑面：FakeCtx + 有状态层桩（b2-shim-executor 判例同款）;document 桩
// 仅供 snapBakeBytes（R1b-6 快照面）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

interface DrawRec { img: unknown; args: unknown[]; gco: string }
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  log: DrawRec[] = [];
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { /* 桩 */ }
  restore() { /* 桩 */ }
  translate() { /* 桩 */ }
  scale() { /* 桩 */ }
  rotate() { /* 桩 */ }
  drawImage(img: unknown, ...args: unknown[]) { this.log.push({ img, args, gco: this.globalCompositeOperation }); }
  fillRect() { /* 桩 */ }
}

/** acc 态 host 桩（可观测 FBO/present/drop 面+可注入发射失败;degradeAcc 镜像
 *  Renderer.degradeAcc 的 endAccumulate+bridge 双步——否则 acc 重放面 raw=null） */
function mkAccHost(opts: { texRefresh: (k: string) => unknown } = { texRefresh: () => null }) {
  const layer = {
    unavailable: false,
    open: false,
    beginCalls: [] as Array<[string, boolean]>,
    endAccumCalls: 0,
    dropLog: [] as string[],
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin(name: string, clear: boolean) { this.beginCalls.push([name, clear]); this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.endAccumCalls++; this.open = false; return null; },
    blendAdditive() { /* no-op */ },
    blendErase() { /* no-op */ },
    blendMult() { /* no-op */ },
    quadSprite() { /* no-op */ },
    texFromRegion() { return { tex: {}, w: 8, h: 8, key: 'stub' }; },
    texFromData() { return null; },
    texRefresh: opts.texRefresh,
    texFromImage() { return null; },
    texAlive() { return true; },
    dropTexture(k: string) { this.dropLog.push(k); },
  };
  const replayCtx = new FakeCtx();
  let shim: GLShimExecutor | null = null;
  const host = {
    acquireGl: () => (layer.unavailable ? null : (layer as never)),
    worldCtx: () => replayCtx as unknown as CanvasRenderingContext2D,
    worldW: () => 128, worldH: () => 72,
    degradeAcc: () => {
      layer.endAccumulate();
      shim?.bridge(replayCtx as unknown as CanvasRenderingContext2D);   // Renderer.degradeAcc 尾步
      return true;
    },
  };
  return {
    layer, replayCtx, host,
    setShim(s: GLShimExecutor): void { shim = s; },
  };
}

function mkImg(id: number): CanvasImageSource {
  return { width: 64, height: 64, __id: id } as unknown as CanvasImageSource;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('R1b-3 acc 中途失败:前缀弃发,重放只补尾段', () => {
  it('static+dynamic(失败)+static → 降级重放仅 rec2/rec3,rec1 不二次落画', () => {
    const { layer, replayCtx, host, setShim } = mkAccHost();   // texRefresh 恒 null=dynamic 解析失败
    const ex = new GLShimExecutor(host as never);
    setShim(ex);
    const w = ex.attachAcc();
    expect(w).not.toBeNull();
    const img1 = mkImg(1);
    const scratch = mkImg(2);
    const img3 = mkImg(3);
    const wrap = w!;
    wrap.drawImage(img1, 0, 0);          // rec1:static（预解析门过,已进 FBO=前缀）
    ex.markDynamic(scratch);
    wrap.drawImage(scratch, 10, 10);     // rec2:dynamic——mid-loop resolveTex 失败点
    wrap.drawImage(img3, 20, 20);        // rec3:static（未发射尾段）
    ex.flush();
    // 绿判据:重放只含未发射尾段（rec2/rec3）;rec1 已进 FBO=前缀弃发不重放
    const imgs = replayCtx.log.map((r) => r.img);
    expect(imgs).toEqual([scratch, img3]);
    expect(imgs).not.toContain(img1);
    expect(ex.stats.replays).toBe(2);
    expect(layer.endAccumCalls).toBe(1);   // 降级 present 走了一次
  });
  it('入口失败（队列未发射）全队列重放语义不变', () => {
    const { replayCtx, host } = mkAccHost();
    const ex = new GLShimExecutor(host as never);
    const raw = new FakeCtx();
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
    expect(wrap).not.toBeNull();
    wrap!.drawImage(mkImg(1), 0, 0);
    wrap!.drawImage(mkImg(2), 5, 5);
    (host as { acquireGl: () => unknown }).acquireGl = () => null;   // GL 全灭
    (ex as unknown as { glw: { unavailable: boolean } | null }).glw!.unavailable = true;
    ex.flush();
    expect(replayCtx.log.length).toBe(0);            // bridge 态重放走 raw（非 worldCtx）
    expect(raw.log.length).toBe(2);                  // 全队列（无前缀可弃）
  });
});

describe('R1b-6 preTex 重放吃 bake 字节快照', () => {
  it('两次 bake 同一 scratch → 重放源=各自快照（非共享 scratch 末次字节）', () => {
    // document 桩:snapBakeBytes 的 canvas 拷贝面（node 无 DOM）
    let tag = 0;
    vi.stubGlobal('document', {
      createElement: (_t: string) => ({
        width: 0, height: 0, tag: ++tag,
        getContext: () => ({ drawImage() { /* 桩 */ } }),
      }),
    });
    const { layer, replayCtx, host } = mkAccHost({
      texRefresh: () => ({ tex: {}, w: 64, h: 64, key: 'bake' }),   // 上传成功
    });
    const ex = new GLShimExecutor(host as never);
    const raw = new FakeCtx();
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
    expect(wrap).not.toBeNull();
    const imgA = mkImg(7);                 // 共享 scratch（同 img 多次 bake）
    ex.uploadScratchNow(imgA as HTMLCanvasElement, 'bake:1');   // bake A
    const snapA = (ex as unknown as { bakedTexMulti: Map<object, { snap: HTMLCanvasElement | null }> }).bakedTexMulti.get(imgA)!.snap;
    wrap!.drawImage(imgA, 0, 0);           // rec1 消费 pending（preSnap=snapA）
    ex.uploadScratchNow(imgA as HTMLCanvasElement, 'bake:2');   // bake B（共享面已被覆写）
    const snapB = (ex as unknown as { bakedTexMulti: Map<object, { snap: HTMLCanvasElement | null }> }).bakedTexMulti.get(imgA)!.snap;
    wrap!.drawImage(imgA, 20, 20);         // rec2 消费 pending（preSnap=snapB）
    expect(snapA).toBeTruthy();
    expect(snapB).toBeTruthy();
    expect(snapA).not.toBe(snapB);         // 每 bake 独立快照
    // GL 中帧死亡:flush 走 2D 重放——绿判据=重放源为各自 bake 快照
    layer.unavailable = true;
    ex.flush();
    expect(replayCtx.log.length).toBe(0);          // bridge 重放走 raw
    expect(raw.log.length).toBe(2);
    expect(raw.log[0].img).toBe(snapA);            // 旧码=imgA（共享 scratch 末次字节）
    expect(raw.log[1].img).toBe(snapB);
  });
});

describe('R1b-7 bakedTexPending 跨帧卫生', () => {
  it('frameReset 清单槽 pending（旧码只清 multi）', () => {
    const { host } = mkAccHost({ texRefresh: () => ({ tex: {}, w: 8, h: 8, key: 'k' }) });
    const ex = new GLShimExecutor(host as never);
    ex.attachAcc();
    const img = mkImg(9);
    ex.uploadScratchNow(img as HTMLCanvasElement, 'k');
    const state = ex as unknown as { bakedTexPending: unknown; bakedTexMulti: Map<object, unknown> };
    expect(state.bakedTexPending).not.toBeNull();
    ex.frameReset();
    expect(state.bakedTexPending).toBeNull();   // ★R1b-7
    expect(state.bakedTexMulti.size).toBe(0);
  });
  it('attachAcc 清残 pending（acc 窗孪生守卫）', () => {
    const { host } = mkAccHost();
    const ex = new GLShimExecutor(host as never);
    const st = ex as unknown as { bakedTexPending: unknown };
    st.bakedTexPending = { img: {}, tex: {}, snap: null };   // 残留注入
    ex.attachAcc();
    expect(st.bakedTexPending).toBeNull();
  });
});

describe('R3b-4 shineCell 键触帧账+退休', () => {
  it('超帽清扫 600 帧未触键 dropTexture;活跃键保留', () => {
    const { layer, host } = mkAccHost({ texRefresh: () => ({ tex: {}, w: 8, h: 8, key: 's' }) });
    const ex = new GLShimExecutor(host as never);
    ex.attachAcc();
    const img = mkImg(11);
    for (let i = 0; i < 1024; i++) ex.uploadScratchNow(img as HTMLCanvasElement, `shineCell:${i}`);   // 满帽
    expect(layer.dropLog.length).toBe(0);
    for (let i = 0; i < 601; i++) ex.frameReset();                                // 601 帧未触
    ex.uploadScratchNow(img as HTMLCanvasElement, 'shineCell:fresh');
    // 1024 旧键全退休,fresh 保留
    expect(layer.dropLog.length).toBe(1024);
    expect(layer.dropLog).not.toContain('shineCell:fresh');
  });
});
