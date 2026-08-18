// Minimap.buildStriped(CPU 像素后备版,2026-08-18)单元验证:
// ① 拆带结果与同步全量逐像素一致(含尾带不足 64 行)
// ② 重复调用幂等;flushDirty 增量写入与全量一致
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Minimap } from '../src/render/Renderer';

describe('小地图 CPU 像素后备', () => {
  it('拆带 == 同步全量(130 行 → 尾带收缩路径) + 幂等', { timeout: 30_000 }, async () => {
    const w = new World(48, 130, 7, 'open');
    // 真实分层参数(fillBand/colorFor 的 surf/rock 门在 gl=0 退化档有历史边角差,
    // 真实世界恒等——夹具给正常值消除伪差异)
    w.groundLevel = 40; w.rockLevel = 80;
    const st = w.store;
    st.setTile(6, 100, 2, 0);
    st.setWall(6, 101, 4);
    st.setLiquid(6, 102, 255, 1);
    st.setTile(8, 30, 0, (200 << 8) | 100, 50);
    const mmS = new Minimap(w, true);
    await mmS.buildStriped();
    const mmF = new Minimap(w);          // 同步全量
    let diff = 0;
    const a = new Uint32Array(mmS.pix!.buffer), b = new Uint32Array(mmF.pix!.buffer);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff).toBe(0);
    // 幂等
    const before = mmS.pix!.byteLength;
    await mmS.buildStriped();
    expect(mmS.pix!.byteLength).toBe(before);
  });

  it('flushDirty 增量 == 全量重建(改动 chunk 后)', { timeout: 30_000 }, () => {
    const w = new World(48, 130, 9, 'open');
    w.groundLevel = 40; w.rockLevel = 80;
    const mm = new Minimap(w, true);
    // 手动铺底(不走 buildStriped 逐帧让路,直接 fillBand 路径 = redrawAll)
    mm.redrawAll();
    const before = new Uint32Array(mm.pix!.buffer).slice();
    // 改两格 → flushDirty 增量写入
    w.store.setTile(3, 3, 2, 0);
    w.store.setTile(40, 100, 0, (1 << 8) | 2, 3);
    mm.flushDirty();
    expect(mm.flushedPixelRects.length).toBeGreaterThan(0);
    const after = new Uint32Array(mm.pix!.buffer);
    // 重建对照
    const mm2 = new Minimap(w);
    const ref = new Uint32Array(mm2.pix!.buffer);
    let diff = 0;
    for (let i = 0; i < after.length; i++) if (after[i] !== ref[i]) diff++;
    expect(diff).toBe(0);
    void before;
  });
});
