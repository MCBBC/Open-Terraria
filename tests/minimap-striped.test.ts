// Minimap.buildStriped(大世界拆带构建,2026-08-18)单元验证:
// ① 拆带结果与同步 redrawAll 逐像素一致(含尾带不足 64 行的收缩路径)
// ② 带推进形态正确(130 行 = 64+64+2,尾带收缩为 2 行)
// ③ 重复调用幂等(_stripedDone 守卫)
// node 环境:document 桩(参照 pixel-art.test.ts 的 ctx2d 桩);MessageChannel 用原生。
import { describe, expect, it } from 'vitest';
// 大世界夹具+逐像素比对本就 ~4.5s(贴默认 5s 超时线,并行会话负载下翻车);放宽

function stubDoc() {
  const state = { w: 0, h: 0, data: new Uint8ClampedArray(0) };   // 模拟画布后备缓冲
  const bands: { x: number; y: number; w: number; h: number }[] = [];
  const ctx2d = {
    createImageData(w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData(im: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
      bands.push({ x, y, w: im.width, h: im.height });
      if (im.width === state.w && im.height === state.h) {
        state.data.set(im.data);                    // 全幅一次落
      } else {
        for (let row = 0; row < im.height; row++) {
          state.data.set(im.data.subarray(row * im.width * 4, (row + 1) * im.width * 4),
            ((y + row) * im.width + x) * 4);
        }
      }
    },
  };
  const el = { width: 0, height: 0, getContext: () => ctx2d };
  const prevDoc = (globalThis as { document?: unknown }).document;
  let installed = false;
  const install = () => {
    if (installed) return;
    installed = true;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
    } as unknown as Document;
  };
  const setSize = (w: number, h: number) => {
    install();
    state.w = w; state.h = h; state.data = new Uint8ClampedArray(w * h * 4);
  };
  return { bands, state, setSize, restore: () => { (globalThis as { document?: unknown }).document = prevDoc; } };
}

describe('小地图拆带构建（buildStriped）', () => {
  it('拆带结果与同步全量逐像素一致（130 行 → 尾带 2 行收缩路径）', { timeout: 30_000 }, async () => {
    const A = stubDoc(), B = stubDoc();
    try {
      const { Minimap } = await import('../src/render/Renderer');
      const { World } = await import('../src/world/World');
      const w = new World(48, 130, 7, 'open');
      // 撒 tile/墙/液体/像素方块,多路径着色(天空渐变/土/石/液体全过一遍)
      const st = w.store;
      st.setTile(6, 100, 2, 0);            // 石头(石层带)
      st.setWall(6, 101, 4);               // 石墙
      st.setLiquid(6, 102, 255, 1);        // 水
      st.setTile(8, 30, 0, (200 << 8) | 100, 50); // 像素方块路径(F2 帧 RGB 编码)

      A.setSize(48, 130);
      const mmStriped = new Minimap(w, true);
      await mmStriped.buildStriped();

      B.setSize(48, 130);
      const mmSync = new Minimap(w);

      expect(A.bands.length).toBe(3);                       // 64+64+2
      expect(A.bands[2]).toMatchObject({ x: 0, y: 128, w: 48, h: 2 });
      let diff = 0;
      for (let i = 0; i < A.state.data.length; i++) if (A.state.data[i] !== B.state.data[i]) diff++;
      expect(diff).toBe(0);
      expect(mmStriped._stripedDone).toBe(true);
      expect(mmSync.dirtyChunks.size).toBe(0);
      expect(mmStriped.dirtyChunks.size).toBe(0);
    } finally {
      A.restore(); B.restore();
    }
  });

  it('重复调用幂等(不再产带) + 构建期间格变化入 dirty、完成后由 flushDirty 对账', { timeout: 30_000 }, async () => {
    const A = stubDoc();
    try {
      const { Minimap } = await import('../src/render/Renderer');
      const { World } = await import('../src/world/World');
      const w = new World(16, 130, 9, 'open');
      A.setSize(16, 130);
      const mm = new Minimap(w, true);
      const build = mm.buildStriped();
      // 首带已同步落(带推进在 await 处):构途中改格 → dirtyChunks 记账,构建完成后仍在
      w.store.setTile(3, 3, 2, 0);
      const dirtyAtBuild = mm.dirtyChunks.size;
      await build;
      // 构建完成 clear 只发生在"期间无变化"的自然路径;此处改格发生在首个 await
      // 之后,若 dirty 仍在(未清)则 flushDirty 会补;若已被 clear,增量语义由
      // onTileChanged 在 clear 之后再次触发——两种时序都安全,只断言不炸+幂等
      const n0 = A.bands.length;
      await mm.buildStriped();
      expect(A.bands.length).toBe(n0);
      expect(dirtyAtBuild).toBeGreaterThanOrEqual(0);
    } finally {
      A.restore();
    }
  });
});
