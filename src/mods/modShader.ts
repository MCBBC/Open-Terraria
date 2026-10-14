// mod GLSL 屏幕后处理声明面(★Tier1-b,2026-10-14;sw.shader)。
// 建于 ModScreenFx 既有链(hooks.registerModScreenFx/GLScreenFilters 'ModScreenFx'
// 分支)——mod 只声明 GLSL 片元源+uniforms 表,引擎负责编译/纹理绑定/链入 7d 滤镜
// 链最前(tML FilterManager.EndCapture 同位)。
// 安全纪律:
//   ①编译校验——gl.compileShader 失败=fail-loud warn+恒等 pass(不炸帧循环;
//     GL contextlost 家族纪律沿用——isContextLost 执行机兜底)
//   ②uniform 白名单——float/vec2/vec3/vec4(常用调色族);sampler 不开放
//     (inputTex 即 mod 采样面,uTexture 名固定注入)
//   ③着色器源审查——#version/#extension/#include 拒(glsl1 基线,防版本逃逸)
//   ④出口契约文档化——gl_FragColor 写出(链式接 fboA)
//   ⑤per-mod 单 pass(重复注册 fail-fast——多效果=mod 合并到单 src)
import { registerModScreenFx, type ModScreenFxState } from './hooks';
import type { GLPipeline, PipelineFbo } from '../render/GLPipeline';

export interface ModShaderSpec {
  /** GLSL 片元源(glsl1;禁 #version/#extension;采样器固定 uTexture) */
  src: string;
  /** uniforms 表(float/vec2/vec3/vec4;mod 侧可运行期改引用对象值) */
  uniforms?: Record<string, number | readonly number[]>;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

/** 禁令令检查(#version/#extension/#include 拒) */
function validateSrc(src: string): string | null {
  if (/#\s*version/i.test(src)) return '#version 拒(glsl1 基线)';
  if (/#\s*extension/i.test(src)) return '#extension 拒';
  if (/#\s*include/i.test(src)) return '#include 拒';
  if (src.length > 64 * 1024) return 'src 超 64KB';
  return null;
}

interface ShaderRuntime {
  prog: WebGLProgram | null;
  aPos: number;
  uni: Map<string, WebGLUniformLocation | null>;
  failed: boolean;
}

const runtimes = new Map<string, ShaderRuntime>();

/** 恒等 blit(编译失败兜底;模块级单程序缓存) */
let blitProg: WebGLProgram | null = null;
let blitAPos = -1;
let blitUTex: WebGLUniformLocation | null = null;
const BLIT_FRAG = `
precision mediump float;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTexture, vUv); }`;
function modShaderBlit(gl: WebGL2RenderingContext, pipe: import('../render/GLPipeline').GLPipeline,
  inputTex: WebGLTexture, outFbo: PipelineFbo, w: number, h: number): void {
  try {
    if (blitProg === null) {
      const mk = (type: number, src: string): WebGLShader => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        return sh;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, BLIT_FRAG));
      gl.linkProgram(prog);
      blitProg = prog;
      blitAPos = gl.getAttribLocation(prog, 'aPos');
      blitUTex = gl.getUniformLocation(prog, 'uTexture');
    }
    gl.useProgram(blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    if (blitUTex) gl.uniform1i(blitUTex, 0);
    pipe.bindTarget(outFbo);
    gl.viewport(0, 0, w, h);
    const vao = pipe.quadVao;
    if (vao) {
      gl.bindVertexArray(vao);
      if (blitAPos >= 0) {
        gl.enableVertexAttribArray(blitAPos);
        gl.vertexAttribPointer(blitAPos, 2, gl.FLOAT, false, 0, 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  } catch { /* 兜底兜底:出口已 bind outFbo(空 pass) */ }
}

/** uniform 值类型 → setUniform 调度 */
function applyUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation, v: number | readonly number[]): void {
  if (typeof v === 'number') { gl.uniform1f(loc, v); return; }
  if (v.length === 2) gl.uniform2f(loc, v[0]!, v[1]!);
  else if (v.length === 3) gl.uniform3f(loc, v[0]!, v[1]!, v[2]!);
  else if (v.length === 4) gl.uniform4f(loc, v[0]!, v[1]!, v[2]!, v[3]!);
}

/** 注册(compile 惰性首帧;fail=恒等 pass) */
export function registerModShader(modId: string, spec: ModShaderSpec): void {
  const err = validateSrc(spec.src);
  if (err) throw new Error(`[mod-shader] ${modId} GLSL 源审查失败: ${err}`);
  const rt: ShaderRuntime = { prog: null, aPos: -1, uni: new Map(), failed: false };
  runtimes.set(modId, rt);
  registerModScreenFx({
    id: `shader:${modId}`,
    exec: (gl, pipe: GLPipeline, inputTex, outFbo: PipelineFbo, w, h, state: ModScreenFxState) => {
      // 惰性编译(首帧;失败一次=恒等直通 blit 兜底)
      if (rt.prog === null && !rt.failed) {
        try {
          const vs = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(vs, VERT);
          gl.compileShader(vs);
          if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            throw new Error(`VERT: ${gl.getShaderInfoLog(vs) ?? '?'}`);
          }
          const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(fs, spec.src);
          gl.compileShader(fs);
          if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            throw new Error(`FRAG: ${(gl.getShaderInfoLog(fs) ?? '?').slice(0, 300)}`);
          }
          const prog = gl.createProgram()!;
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(`LINK: ${gl.getProgramInfoLog(prog) ?? '?'}`);
          }
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          rt.prog = prog;
          rt.aPos = gl.getAttribLocation(prog, 'aPos');
          rt.uni.set('uTexture', gl.getUniformLocation(prog, 'uTexture'));
          for (const k of Object.keys(spec.uniforms ?? {})) {
            rt.uni.set(k, gl.getUniformLocation(prog, k));
          }
        } catch (e) {
          rt.failed = true;
          console.warn(`[mod-shader] ${modId} 编译失败——恒等直通:`, (e as Error).message);
        }
      }
      // 恒等直通(自有 blit 程序;编译失败/未就绪=零视觉差异,链闭合)
      if (rt.failed || rt.prog === null) {
        modShaderBlit(gl, pipe, inputTex, outFbo, w, h);
        return;
      }
      const prog = rt.prog;
      gl.useProgram(prog);
      // 输入纹理(tex0)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      const texLoc = rt.uni.get('uTexture');
      if (texLoc) gl.uniform1i(texLoc, 0);
      // mod uniforms(引用对象现值=运行期可变)
      for (const [k, v] of Object.entries(spec.uniforms ?? {})) {
        const loc = rt.uni.get(k);
        if (loc) applyUniform(gl, loc, v);
      }
      // 出口写 outFbo(链契约)
      pipe.bindTarget(outFbo);
      gl.viewport(0, 0, w, h);
      // 单位 quad(pipe.drawQuad 需 PipelineProgram[uCanvas/uDst 形]——mod 程序
      // 无该 uniform 面,直接 VAO 绘制)
      const vao = pipe.quadVao;
      if (vao) {
        gl.bindVertexArray(vao);
        if (rt.aPos >= 0) {
          gl.enableVertexAttribArray(rt.aPos);
          gl.vertexAttribPointer(rt.aPos, 2, gl.FLOAT, false, 0, 0);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      void state;
    },
  });
}

/** 测试清账 */
export function _resetModShadersForTests(): void {
  runtimes.clear();
}
