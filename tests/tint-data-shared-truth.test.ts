// ★bakenoread 读回消除刀（2026-10-08）——tint 循环单源 + 快照行拷贝数学锚定。
// 背景：ChunkBake 油漆 pass 的 ?bakenoread=1 支路把「每漆格 16² 页 getImageData」
// 换成「每漆层 1 次 256² 整 cell 快照 + tintRegionData 行拷贝」。两条支路必须
// 逐位一致 → 本测试把两处共享单源（tintImageDataInPlace/copyRegionRows）钉死在
// applyPaintTint/Special 真值与手算 stride 上（node 无 canvas,页面级逐位对拍由
// scripts/_bake-noread-digest.mjs 双臂 md5 与 _paint-bake-truth.mjs ?bakenoread=1
// 重跑把门）。
// 变异证红锚：循环体改任何取整/跳过语义、行拷贝 stride/offset 偏 1 → 本测试必红。
import { describe, it, expect } from 'vitest';
import { tintImageDataInPlace, copyRegionRows } from '../src/render/TileTint';
import { applyPaintTint, applyPaintTintSpecial } from '../src/world/Paint';

// 确定性像素块：覆盖 α=0 跳过支 / 普通色 / 灰阶（提亮曲线敏感档）
function synthBlock(n: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    d[p * 4] = (p * 37) % 256;
    d[p * 4 + 1] = (p * 61 + 13) % 256;
    d[p * 4 + 2] = (p * 97 + 77) % 256;
    d[p * 4 + 3] = p % 9 === 0 ? 0 : (p * 29) % 256;   // 每 9 像素一个 α=0（跳过支）
  }
  return d;
}

describe('bakenoread tint 单源', () => {
  it('tintImageDataInPlace(普通组) = applyPaintTint 逐像素真值（α=0 跳过,α 不动）', () => {
    const d = synthBlock(256);
    const src = d.slice();
    tintImageDataInPlace(d, 26, false);
    for (let p = 0; p < 256; p++) {
      const i = p * 4;
      if (src[i + 3] === 0) {
        expect([d[i], d[i + 1], d[i + 2], d[i + 3]]).toEqual([src[i], src[i + 1], src[i + 2], 0]);
        continue;
      }
      const e = applyPaintTint(src[i], src[i + 1], src[i + 2], 26, false);
      expect([d[i], d[i + 1], d[i + 2]]).toEqual([e[0], e[1], e[2]]);
      expect(d[i + 3]).toBe(src[i + 3]);   // 只写 RGB 不动 alpha
    }
  });

  it('tintImageDataInPlace(墙档) = applyPaintTint isWall=true 真值（负相 30 档敏感）', () => {
    const d = synthBlock(256);
    const src = d.slice();
    tintImageDataInPlace(d, 30, true);
    for (let p = 0; p < 256; p++) {
      const i = p * 4;
      if (src[i + 3] === 0) continue;
      const e = applyPaintTint(src[i], src[i + 1], src[i + 2], 30, true);
      expect([d[i], d[i + 1], d[i + 2]]).toEqual([e[0], e[1], e[2]]);
    }
  });

  it('tintImageDataInPlace(特判组) = applyPaintTintSpecial 真值（DefaultDirt 手工设置,防同源假阳取自探针同款锚）', () => {
    // 与 scripts/_paint-bake-truth.mjs 相同的 DefaultDirt 硬编码设置
    const defaultDirt = { hueTestOffset: Math.fround(0), minHue: Math.fround(0.03), maxHue: Math.fround(0.08),
      minSat: Math.fround(0.38), maxSat: Math.fround(0.53), invert: true };
    const d = synthBlock(256);
    const src = d.slice();
    tintImageDataInPlace(d, 1, false, defaultDirt);
    for (let p = 0; p < 256; p++) {
      const i = p * 4;
      if (src[i + 3] === 0) continue;
      const e = applyPaintTintSpecial(src[i], src[i + 1], src[i + 2], 1, defaultDirt);
      expect([d[i], d[i + 1], d[i + 2]]).toEqual([e[0], e[1], e[2]]);
    }
  });

  it('copyRegionRows：256 宽快照中 (16,32) 处 16² 提取 = 手算 stride/offset', () => {
    // 32 行×256 宽伪快照,像素值 = 线性索引低 8 位（位置可追溯）
    const W = 256, H = 48;
    const sd = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      sd[i * 4] = i & 255; sd[i * 4 + 1] = (i >> 8) & 255; sd[i * 4 + 2] = 0xaa; sd[i * 4 + 3] = 0xbb;
    }
    const out = new Uint8ClampedArray(16 * 16 * 4);
    copyRegionRows({ data: sd, width: W }, 16, 32, out);
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const srcIdx = (32 + r) * W + (16 + c);
        const o = (r * 16 + c) * 4;
        expect([out[o], out[o + 1]]).toEqual([srcIdx & 255, (srcIdx >> 8) & 255]);
      }
    }
  });

  it('copyRegionRows：行尾邻界不串行（readX=240 = 256 宽快照最后一列 16² 块）', () => {
    const W = 256;
    const sd = new Uint8ClampedArray(W * 32 * 4);
    for (let i = 0; i < W * 32; i++) sd[i * 4] = i & 255;
    const out = new Uint8ClampedArray(16 * 16 * 4);
    copyRegionRows({ data: sd, width: W }, 240, 8, out);
    for (let r = 0; r < 16; r++) {
      const o = r * 16 * 4;
      expect(out[o]).toBe(((8 + r) * W + 240) & 255);      // 行首 = 本行 240 列
      expect(out[o + 15 * 4]).toBe(((8 + r) * W + 255) & 255); // 行尾 = 255 列
    }
  });
});
