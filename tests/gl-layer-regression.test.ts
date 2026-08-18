// GLSpriteLayer 回归守卫(2026-08-18):该文件曾两次被并行改动写回旧版,
// y 翻转/mip 链静默丢失 = 用户两报"背景/地图垂直颠倒"。此测试把三项修复
// 以源码断言锁定——任何一处丢失立即红,防第三次。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');

describe('GLSpriteLayer 回归守卫(源码级锁定)', () => {
  it('顶点着色器含 clip-space y 翻转(canvas 2D y 向下 vs GL y 向上)', () => {
    // 丢此行 = 整画布垂直颠倒(用户 2026-08-18 两次实报)
    expect(SRC).toContain('1.0 - screen.y / uCanvas.y * 2.0');
  });

  it('LINEAR/REPEAT 采样器带 mipmap(对齐 Skia 盒式降采样;直双线性偏锐)', () => {
    expect(SRC).toContain('mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.CLAMP_TO_EDGE)');
    expect(SRC).toContain('mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT)');
  });

  it('纹理上传后生成 mip 链(无链时 MIPMAP_LINEAR 采样器采样不完整 mip = 花屏)', () => {
    expect(SRC).toMatch(/texImage2D[\s\S]{0,200}generateMipmap/);
  });

  it('预乘上传(mip 平均预乘像素能量正确;直 Alpha 边缘发暗)', () => {
    expect(SRC.match(/UNPACK_PREMULTIPLY_ALPHA_WEBGL, true/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(SRC).not.toContain('UNPACK_PREMULTIPLY_ALPHA_WEBGL, false');
  });

  it('WebGL2 DOM 源子区上传走 8 参重载(9 参曾把画布左上角贴进目标区 = #362CFF 退化块)', () => {
    // texSubUpdate 内不得出现带 w/h 的 9 参形式
    const sub = SRC.split('texSubUpdate(')[1] ?? '';
    expect(sub).not.toMatch(/texSubImage2D\([^)]*,\s*x,\s*y,\s*w,\s*h,/);
    expect(sub).toContain('texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch)');
  });
});
