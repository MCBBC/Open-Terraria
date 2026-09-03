// __swMapDebug 自检 API 语义验证:flushDirty 增量结果 ≡ redrawAll 全量重绘(数据层收敛不变量)
import { it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Minimap } from '../src/render/Renderer';

const W = 1200, H = 400;

it('增量 flush == 全量 redraw(收敛不变量);部分 flush 可被 redrawAll 检出', () => {
  const w = new World(W, H, 7, 'mm-dbg');
  const st = w.store;
  for (let x = 20; x < W - 20; x++) for (let y = 100; y < H - 20; y++) st.setTile(x, y, 1);
  const mm = new Minimap(w);
  mm.flushDirty();
  const pixHash = (m: Minimap) => { let h = 0n; const u8 = new Uint8Array(m.pix!.buffer);
    for (let i = 0; i < u8.length; i += 131) h = ((h * 131n) + BigInt(u8[i])) & 0xffffffffffffn; return h.toString(36); };
  const base = pixHash(mm);
  // 批量改型(全 7 chunk 标脏) → 一次 flushDirty(上限 4)只消化 4/7 → 剩余未消化
  for (let x = 20; x < W - 20; x++) for (let y = 100; y < H - 20; y++) st.setTile(x, y, 25);
  mm.flushDirty();
  const partial = pixHash(mm);
  expect(partial).not.toBe(base);                      // 已消化部分入 p32
  // redrawAll 全量重绘:补齐未消化 chunk → 哈希再变(=检出差异的证明)
  mm.redrawAll();
  const afterFull = pixHash(mm);
  expect(afterFull).not.toBe(partial);
  // ★收敛不变量:消化完剩余脏区后,增量结果 == 全量重绘结果
  mm.flushDirty();
  const final = pixHash(mm);
  expect(final).toBe(afterFull);
});
