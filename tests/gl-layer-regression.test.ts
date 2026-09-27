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

  it('★rot 双轴修复(2026-09-25 用户实报全武器/弹幕旋转失效):vUv 取未旋转 aPos+位置先展开后旋转', () => {
    // 断言域=VERT_SRC 块(CLOUD_VERT_SRC 是 obj62 1:1 移植锁,vUv-from-p 为其
    //   移植形态——本案不动,同构剪切为登记债,见 GLSpriteLayer 修复注)
    const vs = SRC.split('const VERT_SRC =')[1]?.split('const FRAG_SRC =')[0] ?? '';
    expect(vs.length).toBeGreaterThan(100);
    // 【轴1】vUv 用未旋转 aPos——旧码用旋转后 p ⇒ uv=dst 归一化坐标逐轴仿射
    //   (与 uRot 无关)=内容恒不转,只有 outline 转(武器/弹幕固定朝向的根因)。
    //   丢此行 = 旋转内容退化为未旋转内容+CLAMP 边拖影。
    expect(vs).toContain('vUv = vec2(uSrc.x + aPos.x * uSrc.z, uSrc.y + aPos.y * uSrc.w);');
    expect(vs).not.toContain('p.x * uSrc.z');
    // 【轴2】位置先按 dst 尺寸展开像素域后旋转——旧码先旋转归一化坐标再逐轴
    //   乘 dst.zw:非方形 dst(w≠h)下 scale∘rotate≠rotate∘scale=剪切畸变
    //   (32×48@45° 纵弦 45→68px 实锤)。像素域展开必须先于旋转。
    expect(vs).toContain('vec2 d = (aPos - vec2(0.5)) * uDst.zw;');
    expect(vs).toContain('vec2 screen = uDst.xy + uDst.zw * 0.5 + vec2(d.x * co - d.y * s, d.x * s + d.y * co);');
    // 像素判谳面:scripts/_rot-shader-micro.mjs 六场景(纯旋转/镜像/持枪档/-90°/
    // 小角度)pinDist≤0.22px+象限色锚全对(2026-09-25 修复后全绿)
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
    // 窗 2400:容注释/插段间隔(2026-08-30 拖尾 pass 资源清理插入把 600 窗撑爆;
    // 2026-09-27 R1b-5 dispose 表补全再撑 1200 窗),守卫意图是防【bytes 归零调用被删】不防排版
    expect(SRC).toMatch(/dispose[\s\S]{0,2400}bytes = 0/);
  });

  it('WebGL2 DOM 源子区上传走 8 参重载(9 参曾把画布左上角贴进目标区 = #362CFF 退化块)', () => {
    // texSubUpdate 内不得出现带 w/h 的 9 参形式
    const sub = SRC.split('texSubUpdate(')[1] ?? '';
    expect(sub).not.toMatch(/texSubImage2D\([^)]*,\s*x,\s*y,\s*w,\s*h,/);
    expect(sub).toContain('texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch)');
  });
});
