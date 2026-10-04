// ★K1-2b Stack 腿上传持久纹理化——结构+运行时双锁（2026-10-04）
//
// drawChainPipeStack 的 sky/HUD 两腿原每帧 texImage2D 全幅重分配（exit trace
// texImage2D 主线程自耗 top1）。本刀改两专用持久槽（sky=pipeTexStackSky 专槽/
// hud=pipeTexHud 判例槽）+尺寸账：稳态帧 texSubImage2D 原位更新（同源同参数=
// 字节逐位同），首用/resize/pipeDrop 重建=texImage2D 逐字面。本文件锁：
//   ①源文本纪律：两槽声明/pipeDrop 齐清/helper 单源/分配·稳态双支/GLStats 双口径
//   ②运行时行为（伪 GL+伪管线）：分配帧/稳态帧/resize 重建帧/pipeDrop 重建帧的
//     texImage2D·texSubImage2D·createTexture 计数与参数逐项;槽身份/朝向/预乘态
// 运行时像素等价由 scripts/_k12-persist-ab.mjs（纹理读回逐位）+scripts/_k12-stack-ab.mjs
// （整帧 A/B 逐字节）活机兜底;本文件=无头纪律锁。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GLPipeline, PipelineProgram } from '../src/render/GLPipeline';
import type { ScreenFxPass } from '../src/render/GLScreenFilters';
import { GLScreenFilters } from '../src/render/GLScreenFilters';

const SFX = readFileSync(resolve(__dirname, '../src/render/GLScreenFilters.ts'), 'utf8');

// ---- 伪 GL（记录账本;常量按 WebGL 规范值,代码经 gl.X 属性取用）----
interface OpRec { op: string; args: unknown[]; pix: Map<number, number | boolean> }
interface FakeGl {
  TEXTURE0: number; TEXTURE_2D: number;
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: number; UNPACK_FLIP_Y_WEBGL: number;
  TEXTURE_MIN_FILTER: number; TEXTURE_MAG_FILTER: number;
  TEXTURE_WRAP_S: number; TEXTURE_WRAP_T: number;
  LINEAR: number; CLAMP_TO_EDGE: number; RGBA: number; UNSIGNED_BYTE: number;
  ops: OpRec[];
  pix: Map<number, number | boolean>;
  texN: number;
  createTexture(): Record<string, number>;
  bindTexture(t: number, tex: unknown): void;
  activeTexture(u: number): void;
  texParameteri(...a: unknown[]): void;
  texImage2D(...a: unknown[]): void;
  texSubImage2D(...a: unknown[]): void;
  pixelStorei(k: number, v: number | boolean): void;
  useProgram(p: unknown): void;
  uniform1i(...a: unknown[]): void;
  uniform1f(...a: unknown[]): void;
  uniform2f(...a: unknown[]): void;
  uniform3f(...a: unknown[]): void;
  viewport(...a: unknown[]): void;
  isContextLost(): boolean;
}
function makeFakeGl(): FakeGl {
  const gl: FakeGl = {
    TEXTURE0: 33984, TEXTURE_2D: 3553,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37444, UNPACK_FLIP_Y_WEBGL: 37440,
    TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
    LINEAR: 9729, CLAMP_TO_EDGE: 33071, RGBA: 6408, UNSIGNED_BYTE: 5121,
    ops: [], pix: new Map(), texN: 0,
    createTexture() { const t = { id: ++gl.texN }; gl.ops.push({ op: 'createTexture', args: [], pix: new Map() }); return t; },
    bindTexture(t, tex) { gl.ops.push({ op: 'bindTexture', args: [t, tex], pix: new Map() }); },
    activeTexture(u) { gl.ops.push({ op: 'activeTexture', args: [u], pix: new Map() }); },
    texParameteri(...a) { gl.ops.push({ op: 'texParameteri', args: a, pix: new Map() }); },
    texImage2D(...a) { gl.ops.push({ op: 'texImage2D', args: a, pix: new Map(gl.pix) }); },
    texSubImage2D(...a) { gl.ops.push({ op: 'texSubImage2D', args: a, pix: new Map(gl.pix) }); },
    pixelStorei(k, v) { gl.pix.set(k, v); gl.ops.push({ op: 'pixelStorei', args: [k, v], pix: new Map() }); },
    useProgram(p) { gl.ops.push({ op: 'useProgram', args: [p], pix: new Map() }); },
    uniform1i(...a) { gl.ops.push({ op: 'uniform1i', args: a, pix: new Map() }); },
    uniform1f(...a) { gl.ops.push({ op: 'uniform1f', args: a, pix: new Map() }); },
    uniform2f(...a) { gl.ops.push({ op: 'uniform2f', args: a, pix: new Map() }); },
    uniform3f(...a) { gl.ops.push({ op: 'uniform3f', args: a, pix: new Map() }); },
    viewport(...a) { gl.ops.push({ op: 'viewport', args: a, pix: new Map() }); },
    isContextLost() { return false; },
  };
  return gl;
}

// ---- 伪管线（GLPipeline 门面最小面;present 记独立账——组装序锁只看 presentTexTo）----
interface PresentRec { target: string; tex: unknown; over: boolean; flipY: number }
function makeFakePipe(gl: FakeGl, stackLayers = 1): { pipe: GLPipeline; presentCalls: PresentRec[] } {
  const fbos = new Map<string, { name: string; tex: object; fbo: object; w: number; h: number }>();
  const presentCalls: PresentRec[] = [];
  const pipe = {
    glx: gl as unknown as WebGL2RenderingContext,
    unavailable: false,
    screenStackMode: true,
    statName: 'pipeline-test',
    beginFrame: () => true,
    fbo(name: string, w: number, h: number) {
      let f = fbos.get(name);
      if (!f) { f = { name, tex: { id: name }, fbo: {}, w, h }; fbos.set(name, f); }
      return f;
    },
    get screenStackView() {
      return Array.from({ length: stackLayers }, (_, i) => ({ name: `L${i}`, tex: { layer: i }, fbo: {}, w: 1, h: 1 }));
    },
    presentTexTo(target: { name: string } | null, tex: unknown, over: boolean, flipY: number) {
      presentCalls.push({ target: target?.name ?? 'canvas', tex, over, flipY });
    },
    present(_f: { tex: unknown }) { /* 末 pass 出口——a1 锁面,此处不计 */ },
    program(name: string): PipelineProgram { return { name, prog: { p: name }, private_: { uniCache: new Map() } }; },
    uni: (_p: PipelineProgram, _n: string) => null,
    setBlend: () => {},
    drawQuad: () => {},
    bindTarget: () => {},
  };
  return { pipe: pipe as unknown as GLPipeline, presentCalls };
}

const SKY_W = 1280, SKY_H = 720;
const mkCanvas = (w: number, h: number) => ({ width: w, height: h }) as HTMLCanvasElement;
const PASSES: ScreenFxPass[] = [{ kind: 'FilterMiniTower', color: [1, 0, 0], opacity: 1 }];
const count = (gl: FakeGl, op: string) => gl.ops.filter((e) => e.op === op).length;
const since = (gl: FakeGl, op: string, from: number) => gl.ops.slice(from).filter((e) => e.op === op).length;

describe('K1-2b 源文本纪律锁（GLScreenFilters）', () => {
  it('两专用持久槽+尺寸账声明（sky 专槽不与 pipeTexScreen 共率;hud=pipeTexHud 判例槽续用）', () => {
    expect(SFX).toContain('private pipeTexStackSky: WebGLTexture | null = null;');
    expect(SFX).toContain('private pipeTexStackSkyW = 0;');
    expect(SFX).toContain('private pipeTexStackSkyH = 0;');
    expect(SFX).toContain('private pipeTexHud: WebGLTexture | null = null;');
    expect(SFX).toContain('private pipeTexHudW = 0;');
    expect(SFX).toContain('private pipeTexHudH = 0;');
    // Stack 组装面不再借 pipeTexScreen（A1 drawChainPipe 专属）;两腿槽身份互异
    expect(SFX).not.toMatch(/presentTexTo\(fboA, this\.pipeTexScreen/);
    expect(SFX).toContain('pipe.presentTexTo(fboA, this.pipeTexStackSky!, false, 1);');
    expect(SFX).toContain('pipe.presentTexTo(fboA, this.pipeTexHud!, true, 1);');
  });

  it('pipeDrop 齐清两槽+尺寸账（pipeTexHud 判例面扩展——清后首用走 texImage2D 重建）', () => {
    expect(SFX).toMatch(/private pipeDrop\(\): void \{[\s\S]{0,300}this\.pipeTexStackSky = null;\s*\n\s*this\.pipeTexStackSkyW = 0;\s*\n\s*this\.pipeTexStackSkyH = 0;\s*\n\s*this\.pipeTexHud = null;\s*\n\s*this\.pipeTexHudW = 0;\s*\n\s*this\.pipeTexHudH = 0;/);
  });

  it('上传单源 pipeStackLegUpload（定义恰一,调用恰二=sky/hud 各一——防双腿漂移）;分配/稳态双支', () => {
    expect(SFX.match(/private pipeStackLegUpload\(/g)?.length).toBe(1);
    expect(SFX.match(/this\.pipeStackLegUpload\(gl, pipe\.statName, 'sky', src\.sky\)/g)?.length).toBe(1);
    expect(SFX.match(/this\.pipeStackLegUpload\(gl, pipe\.statName, 'hud', src\.hud\)/g)?.length).toBe(1);
    // 双支:尺寸失配/首用=texImage2D 全量重分配（旧路径逐字面）;稳态=texSubImage2D 原位
    expect(SFX).toMatch(/if \(tw !== w \|\| th !== h\) \{\s*\n\s*\/\/ 分配\/重分配（=旧路径 texImage2D 全幅上传逐字面）\s*\n\s*gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, src\);\s*\n\s*\} else \{\s*\n\s*\/\/ 稳态：原位更新（同源同参数=字节逐位同）\s*\n\s*gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, src\);\s*\n\s*\}/);
    // pixelStorei 同态逐笔显式（premul+FLIP_Y=true——texSubImage2D 同受两态约束）
    expect(SFX).toMatch(/gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_WRAP_T, gl\.CLAMP_TO_EDGE\);\s*\n\s*glStatTexCreate\(stat, w \* h \* 4\);\s*\n\s*\}\s*\n\s*(\/\/[^\n]*\n\s*)?gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\);\s*\n\s*(\/\/[^\n]*\n\s*)?gl\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, true\);/);
    // GLStats 双口径:驻留账仅首用分支（t1036 判例）;带宽账两支同记
    expect(SFX.match(/glStatTexCreate\(stat, w \* h \* 4\);/g)?.length).toBe(1);
    expect(SFX).toMatch(/glStatUpload\(stat, w \* h \* 4\);\s*\n\s*\/\/ 尺寸账回写/);
  });
});

describe('K1-2b 运行时行为锁（伪 GL+伪管线）', () => {
  beforeAll(() => {
    // node 环境最小 DOM（构造器 createElement;GLScreenFilters 模块顶层零 DOM）
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });

  it('分配帧:两腿各 createTexture+texImage2D（=旧路径逐字面）;稳态帧:零分配零 texImage2D,两腿各 texSubImage2D 原位+同源同 pixelStorei 态', () => {
    const sfx = new GLScreenFilters();
    const gl = makeFakeGl();
    const { pipe, presentCalls } = makeFakePipe(gl);
    const sky = mkCanvas(SKY_W, SKY_H), hud = mkCanvas(SKY_W, SKY_H);
    expect(sfx.drawChainPipeStack(pipe, { sky, hud, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    // 分配帧计数:createTexture×2（sky+hud 槽;pipeTexScreen 不在 Stack 路径）、texImage2D×2、texSubImage2D×0、参数×8
    expect(count(gl, 'createTexture')).toBe(2);
    expect(count(gl, 'texImage2D')).toBe(2);
    expect(count(gl, 'texSubImage2D')).toBe(0);
    expect(count(gl, 'texParameteri')).toBe(8);
    // Stack 路径不建 pipeTexScreen（专用槽判据）
    expect((sfx as unknown as { pipeTexScreen: unknown }).pipeTexScreen).toBeNull();
    const skySlot = (sfx as unknown as { pipeTexStackSky: { id: number } }).pipeTexStackSky;
    const hudSlot = (sfx as unknown as { pipeTexHud: { id: number } }).pipeTexHud;
    expect(skySlot).toBeTruthy(); expect(hudSlot).toBeTruthy();
    expect(skySlot!.id).not.toBe(hudSlot!.id);
    // 组装序 presentTexTo:sA 基底(over=false)→栈层(over=true)→HUD(over=true);纹理=两槽（≠FBO tex）
    expect(presentCalls.length).toBe(3);
    expect(presentCalls[0]).toMatchObject({ target: 'sfxA', tex: skySlot, over: false, flipY: 1 });
    expect(presentCalls[1]).toMatchObject({ target: 'sfxA', over: true, flipY: 1 });
    expect(presentCalls[2]).toMatchObject({ target: 'sfxA', tex: hudSlot, over: true, flipY: 1 });

    // ---- 稳态帧（同尺寸）:零 createTexture/零 texImage2D;两腿 texSubImage2D 原位 ----
    const mark = gl.ops.length;
    expect(sfx.drawChainPipeStack(pipe, { sky, hud, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    expect(since(gl, 'createTexture', mark)).toBe(0);
    expect(since(gl, 'texImage2D', mark)).toBe(0);
    expect(since(gl, 'texParameteri', mark)).toBe(0);
    expect(since(gl, 'texSubImage2D', mark)).toBe(2);
    // 槽身份跨帧驻留（同纹理对象原位更新）
    expect((sfx as unknown as { pipeTexStackSky: unknown }).pipeTexStackSky).toBe(skySlot);
    expect((sfx as unknown as { pipeTexHud: unknown }).pipeTexHud).toBe(hudSlot);
    // 两腿 texSubImage2D:target/level/x/y/format/type 同构+src 恒等+pixelStorei(premul=true,flipY=true) 同态
    const subs = gl.ops.slice(mark).filter((e) => e.op === 'texSubImage2D');
    expect(subs[0].args).toEqual([3553, 0, 0, 0, 6408, 5121, sky]);
    expect(subs[1].args).toEqual([3553, 0, 0, 0, 6408, 5121, hud]);
    expect(subs[0].pix.get(37444)).toBe(true);
    expect(subs[0].pix.get(37440)).toBe(true);
    // 分配帧 texImage2D 与稳态帧 texSubImage2D 的 pixelStorei 态逐项相等（字节逐位同前提）
    const imgs = gl.ops.filter((e) => e.op === 'texImage2D');
    expect(imgs[0].pix.get(37444)).toBe(subs[0].pix.get(37444));
    expect(imgs[0].pix.get(37440)).toBe(subs[0].pix.get(37440));
  });

  it('resize 帧:尺寸账失配→texImage2D 重分配（非 createTexture,采样参数不重设）;pipeDrop→尺寸账归零→下帧重建', () => {
    const sfx = new GLScreenFilters();
    const gl = makeFakeGl();
    const { pipe } = makeFakePipe(gl);
    const sky = mkCanvas(SKY_W, SKY_H), hud = mkCanvas(SKY_W, SKY_H);
    expect(sfx.drawChainPipeStack(pipe, { sky, hud, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    // resize（两腿同界——守卫要求 sky/hud 同界）
    const sky2 = mkCanvas(960, 540), hud2 = mkCanvas(960, 540);
    const mark = gl.ops.length;
    expect(sfx.drawChainPipeStack(pipe, { sky: sky2, hud: hud2, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    expect(since(gl, 'createTexture', mark)).toBe(0);          // 槽复用
    expect(since(gl, 'texParameteri', mark)).toBe(0);          // 参数不重设
    expect(since(gl, 'texImage2D', mark)).toBe(2);             // 两腿重分配
    expect(since(gl, 'texSubImage2D', mark)).toBe(0);
    // pipeDrop（指纹变更触发面同款清点）→ 槽+尺寸账归零
    (sfx as unknown as { pipeDrop(): void }).pipeDrop();
    const s = sfx as unknown as Record<string, unknown>;
    expect(s.pipeTexStackSky).toBeNull(); expect(s.pipeTexStackSkyW).toBe(0); expect(s.pipeTexStackSkyH).toBe(0);
    expect(s.pipeTexHud).toBeNull(); expect(s.pipeTexHudW).toBe(0); expect(s.pipeTexHudH).toBe(0);
    const mark2 = gl.ops.length;
    expect(sfx.drawChainPipeStack(pipe, { sky: sky2, hud: hud2, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    expect(since(gl, 'createTexture', mark2)).toBe(2);         // 重建
    expect(since(gl, 'texImage2D', mark2)).toBe(2);
    expect(since(gl, 'texParameteri', mark2)).toBe(8);         // 参数重设（=首用）
  });

  it('上下文指纹变更（pipeGlId≠gl）→pipeDrop 齐清→新上下文重建;旧上下文零新增调用;useHud=false 免 HUD 腿', () => {
    const sfx = new GLScreenFilters();
    const gl1 = makeFakeGl();
    const pipe1 = makeFakePipe(gl1).pipe;
    const sky = mkCanvas(SKY_W, SKY_H), hud = mkCanvas(SKY_W, SKY_H);
    expect(sfx.drawChainPipeStack(pipe1, { sky, hud, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    const gl2 = makeFakeGl();
    const pipe2 = makeFakePipe(gl2).pipe;
    expect(sfx.drawChainPipeStack(pipe2, { sky, hud, useHud: true }, PASSES, [1, 1, 1])).toBe(true);
    expect(count(gl2, 'createTexture')).toBe(2);               // 新上下文重建两腿
    expect(count(gl1, 'createTexture')).toBe(2);               // 旧上下文无新增
    // useHud=false:零 HUD 腿（上传/present 均免）;sky 腿照常
    const gl3 = makeFakeGl();
    const pipe3 = makeFakePipe(gl3).pipe;
    expect(sfx.drawChainPipeStack(pipe3, { sky, hud, useHud: false }, PASSES, [1, 1, 1])).toBe(true);
    expect(count(gl3, 'texImage2D')).toBe(1);
    expect(count(gl3, 'texSubImage2D')).toBe(0);
  });
});
