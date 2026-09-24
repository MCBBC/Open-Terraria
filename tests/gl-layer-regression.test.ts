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

  it('LINEAR/REPEAT 采样器 MIN 带 mipmap,MAG 恒 LINEAR(MAG 只收 NEAREST|LINEAR)', () => {
    expect(SRC).toContain('mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE)');
    expect(SRC).toContain('mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.REPEAT)');
    // MAG_FILTER 不得收到 mip 档参数(INVALID_ENUM)
    expect(SRC).not.toMatch(/TEXTURE_MAG_FILTER,\s*\w*MIPMAP/);
  });

  it('纹理上传后生成 mip 链(无链时 MIPMAP_LINEAR 采样器采样不完整 mip = 花屏)', () => {
    // 窗 500:两调用间可隔注释(2026-08-28 并行会话插注把 200 窗撑爆;守卫意图是
    // 防【调用被删】而非锁定排版——删调用则两词相距超窗立即红)
    expect(SRC).toMatch(/texImage2D[\s\S]{0,500}generateMipmap/);
  });

  it('预乘上传(mip 平均预乘像素能量正确;直 Alpha 边缘发暗)', () => {
    expect(SRC.match(/UNPACK_PREMULTIPLY_ALPHA_WEBGL, true/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // ★B2 唯一豁免点:texFromData 尘对合并面——字节【已是预乘】(dustPremulBake.gl),
    //  再开预乘标志=二次预乘 rgb×a 错一档;豁免必须带锚注释防扩散
    expect(SRC.match(/UNPACK_PREMULTIPLY_ALPHA_WEBGL, false/g)?.length ?? 0).toBe(1);
    expect(SRC).toMatch(/禁 UNPACK_PREMULTIPLY[\s\S]{0,500}texFromData\(/);
  });

  it('纹理缓存按字节预算(曾按条数 96:多 MB 纹理×96=GB 级打爆 GPU)', () => {
    expect(SRC).toContain('MAX_BYTES = 192 * 1024 * 1024');
    expect(SRC).not.toContain('MAX_TEXTURES');
  });

  it('dispose 字节归零(防跨世界累积)', () => {
    // 窗 1200:容注释/插段间隔(2026-08-30 拖尾 pass 资源清理插入把 600 窗撑爆),
    // 守卫意图是防【bytes 归零调用被删】不防排版
    expect(SRC).toMatch(/dispose[\s\S]{0,1200}bytes = 0/);
  });

  it('WebGL2 DOM 源子区上传走 8 参重载(9 参曾把画布左上角贴进目标区 = #362CFF 退化块)', () => {
    // texSubUpdate 内不得出现带 w/h 的 9 参形式
    const sub = SRC.split('texSubUpdate(')[1] ?? '';
    expect(sub).not.toMatch(/texSubImage2D\([^)]*,\s*x,\s*y,\s*w,\s*h,/);
    expect(sub).toContain('texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch)');
  });
});
