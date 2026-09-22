// ★A0 GLPipeline 管线壳结构锁（2026-09-22）
//
// 单上下文 GL 管线门面（渲染改造方案 §三 A0）：FBO 池+程序登记+blend 档位表+
// present blit。**本刀零消费方=零输出变化**——「无 import 方」结构锁是本刀的
// 核心语义保证（任何模块接线前不得存在 src 内 import;A1 接入时同步摘锁并
// 补该刀自己的像素对拍）。
// 运行时 GL 行为无法在 node vitest 验证（无 WebGL 上下文）——由接入刀的实机
// pixel-ab（_bj77 范式）兜底;本文件=源文本纪律锁。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLPipeline } from '../src/render/GLPipeline';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const pipelineSrc = src('../src/render/GLPipeline.ts');

/** 递归枚举 src 树全部 .ts（跳过 GLPipeline.ts 自身与 .test.ts） */
function* walkTs(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkTs(full);
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) yield full;
  }
}

describe('A0 GLPipeline 管线壳', () => {
  it('模块可导入,导出面齐备（类+FBO/程序/blend/present API）', () => {
    expect(typeof GLPipeline).toBe('function');
    expect(pipelineSrc).toContain('fbo(name: string, w: number, h: number)');
    expect(pipelineSrc).toContain('program(name: string, vs: string, fs: string)');
    expect(pipelineSrc).toContain('setBlend(mode: BlendMode)');
    expect(pipelineSrc).toContain('present(src: PipelineFbo)');
    expect(pipelineSrc).toContain('uploadCanvas(tex: WebGLTexture, src: TexImageSource, w: number, h: number)');
    expect(pipelineSrc).toContain('beginFrame(w: number, h: number)');
    expect(pipelineSrc).toContain('recreate(): boolean');
    expect(pipelineSrc).toContain('dispose(): void');
  });

  it('★零消费方锁：src 内无任何模块 import GLPipeline（零输出变化保证）', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const offenders: string[] = [];
    for (const f of walkTs(root)) {
      if (f.endsWith('GLPipeline.ts')) continue;
      const s = readFileSync(f, 'utf8');
      if (/from\s+['"].*GLPipeline['"]/.test(s)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('纪律锁：预乘收口/preserveDrawingBuffer/软渲染判死/退避', () => {
    expect(pipelineSrc).toContain("gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)");
    expect(pipelineSrc).toContain('preserveDrawingBuffer: true');
    expect(pipelineSrc).toContain('/swiftshader|software|llvmpipe|basic render/i');
    expect(pipelineSrc).toContain('this.diedAt = performance.now()');
    expect(pipelineSrc).toContain("addEventListener('webglcontextlost'");
  });

  it('blend 档位表逐字（premul/add/erase=固定功能三档+off）', () => {
    expect(pipelineSrc).toContain("gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)");   // premul
    expect(pipelineSrc).toContain("gl.blendFunc(gl.ONE, gl.ONE)");                    // add
    expect(pipelineSrc).toContain("gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)");   // erase
    expect(pipelineSrc).toContain("gl.disable(gl.BLEND)");                            // off
  });

  it('字节账埋点齐备（GLStats 带宽/驻留双口径）', () => {
    expect(pipelineSrc).toContain('glStatUpload(this.statName, w * h * 4)');
    expect(pipelineSrc).toContain('glStatTexCreate(this.statName, texBytes');
    expect(pipelineSrc).toContain('glStatDelete(this.statName, texBytes');
    expect(pipelineSrc).toContain('glStatDraw(this.statName, 4)');
    expect(pipelineSrc).toContain('registerFence(this.statName, gl)');
  });

  it('FBO=RGBA8（中间产物字节语义=2D 画布背板——A1/A2 等价性前提）', () => {
    expect(pipelineSrc).toContain('gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null');
  });
});
