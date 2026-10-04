// ★K1-2 屏栈 FBO 直入滤镜链——结构纪律锁（2026-10-02,docs/c10e-design.md §八f 二期债）
//
// drawChainPipeStack：链输入组装全 GPU 侧（sky2D 单腿上传 G 朝向 → sfxA 基底 →
// screenStack 逐层 present 程序 premul-over 重放 flipY=1 恒等 texel 映射 → HUD
// 单腿上传 over → sfx:flip 直通 blit 归还恒等布局 → 共用 pipeRunPasses）。本文件锁：
//   ①GLPipeline 最小暴露面（presentTexTo 不入栈/screenStackView 只读）
//   ②组装序与朝向账（基底→栈层→HUD→flip;UNPACK_FLIP_Y=true 纯行重排;
//     premultiply=true 预乘背板恒等拷贝）
//   ③共用面单源（pipePrepareChain/pipeRunPasses/pipeFlipTo 与 drawChainPipe
//     共用,禁转录——计数锁）
//   ④Renderer 三档路由与 P1/P2 合成门收窄（c10ek1=0 回 K1-前全旧行为）
// 运行时像素等价由 scripts/_k12-stack-ab.mjs 单页翻面冻结态整帧逐字节兜底;
// 本文件=源文本纪律锁。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SFX = readFileSync(resolve(__dirname, '../src/render/GLScreenFilters.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');

describe('K1-2 GLPipeline 暴露面', () => {
  it('presentTexTo:present 同款语义落指定目标——blend premul/off 透传+flipY 透传+uniform-in-useProgram 纪律（2026-09-23 全黑案判例）;【不入屏栈】', () => {
    expect(PIPE).toMatch(/presentTexTo\(target: PipelineFbo \| null, tex: WebGLTexture, over: boolean, flipY: number\): void \{\s*\n\s*const gl = this\.gll\(\);\s*\n\s*if \(!gl \|\| !this\.presentProg\?\.prog\) return;\s*\n\s*this\.bindTarget\(target\);\s*\n\s*this\.setBlend\(over \? 'premul' : 'off'\);\s*\n\s*gl\.useProgram\(this\.presentProg\.prog\);\s*\n\s*gl\.activeTexture\(gl\.TEXTURE0\);\s*\n\s*gl\.bindTexture\(gl\.TEXTURE_2D, tex\);\s*\n\s*gl\.uniform1i\(this\.uni\(this\.presentProg, 'uTex'\), 0\);\s*\n\s*this\.drawQuad\(this\.presentProg, \[0, 0, this\.frameW, this\.frameH\], flipY\);\s*\n\s*registerFence\(this\.statName, gl\);\s*\n\s*\}/);
    // 入栈唯一写点仍只在 present（presentTexTo/presentTo 零 push——「glCanvas=屏栈」不变式）
    expect(PIPE.match(/screenStack\.push\(/g)?.length).toBe(1);
  });

  it('present 委托保持原语义:premul+入栈仅 over∧screenStackMode;栈关 over=blend off 直写（revive 窗/旗关字节路径零变化）', () => {
    expect(PIPE).toMatch(/present\(src: PipelineFbo, over = false\): void \{\s*\n\s*const gl = this\.gll\(\);\s*\n\s*if \(!gl \|\| !src\.tex \|\| !this\.presentProg\?\.prog\) return;\s*\n\s*\/\/ 语义逐位保持原实现:premul\+入栈【仅】over∧screenStackMode[\s\S]{0,200}const stackOver = over && this\.screenStackMode;/);
  });

  it('screenStackView 只读暴露（消费方禁改栈;getter 返私有表引用,写点唯一性由 push/clear 两处守）', () => {
    expect(PIPE).toMatch(/\/\*\* ★K1-2：屏栈只读暴露[\s\S]{0,200}get screenStackView\(\): readonly PipelineFbo\[\] \{\s*\n\s*return this\.screenStack;\s*\n\s*\}/);
    // 栈清零唯一写点=clearScreenForStack
    expect(PIPE.match(/screenStack\.length = 0;/g)?.length).toBe(1);
  });
});

describe('K1-2 GLScreenFilters 组装面（drawChainPipeStack）', () => {
  it('共用面单源（禁转录）:pipePrepareChain/pipeRunPasses/pipeFlipTo 各恰一份定义,drawChainPipe 与 Stack 变体各调一次', () => {
    expect(SFX.match(/private pipePrepareChain\(/g)?.length).toBe(1);
    expect(SFX.match(/private pipeRunPasses\(/g)?.length).toBe(1);
    expect(SFX.match(/private pipeFlipTo\(/g)?.length).toBe(1);
    expect(SFX.match(/this\.pipePrepareChain\(pipe, gl, passes\)/g)?.length).toBe(2);
    expect(SFX.match(/this\.pipeRunPasses\(gl, pipe, w, h, chain, tint,/g)?.length).toBe(2);
  });

  it('组装序锁:①sky 基底上传（★K1-2b 持久槽 pipeStackLegUpload 单源;premultiply=true+UNPACK_FLIP_Y=true=G 朝向纯行重排）→ blend-off 直写 sfxA → ②屏栈逐层 presentTexTo premul-over flipY=1（栈序=折叠序）→ ③HUD 上传 over（useHud 门）→ ④pipeFlipTo 归还恒等布局 → ⑤共用 pipeRunPasses 输入 sfxB', () => {
    expect(SFX).toMatch(/this\.pipeStackLegUpload\(gl, pipe\.statName, 'sky', src\.sky\);\s*\n\s*\/\/ 基底 blend off 直写 sfxA（全幅替换陈旧帧内容;flipY=1 恒等 texel 映射）\s*\n\s*(\/\/[^\n]*\n\s*)?pipe\.presentTexTo\(fboA, this\.pipeTexStackSky!, false, 1\);/);
    expect(SFX).toMatch(/pipe\.presentTexTo\(fboA, this\.pipeTexStackSky!, false, 1\);\s*\n\s*\/\/ ---- ② 屏栈逐层 premul-over 重放[\s\S]{0,200}for \(const layer of pipe\.screenStackView\) \{\s*\n\s*if \(!layer\.tex\) continue;\s*\n\s*pipe\.presentTexTo\(fboA, layer\.tex, true, 1\);\s*\n\s*\}/);
    expect(SFX).toMatch(/this\.pipeStackLegUpload\(gl, pipe\.statName, 'hud', src\.hud\);\s*\n\s*(\/\/[^\n]*\n\s*)?pipe\.presentTexTo\(fboA, this\.pipeTexHud!, true, 1\);/);
    expect(SFX).toMatch(/if \(!this\.pipeFlipTo\(gl, pipe, w, h, fboA, fboB\)\) return false;\s*\n\s*ok = this\.pipeRunPasses\(gl, pipe, w, h, chain, tint, fboB\.tex!, fboA, fboB\);/);
  });

  it('HUD 腿独立上传槽 pipeTexHud（★K1-2b 持久化:同参 LINEAR+CLAMP+尺寸账;pipeDrop 随指纹重生齐清）;useHud=false 免腿（预留位）', () => {
    expect(SFX).toContain('private pipeTexHud: WebGLTexture | null = null;');
    expect(SFX).toMatch(/if \(src\.useHud\) \{[\s\S]{0,1200}pipe\.presentTexTo\(fboA, this\.pipeTexHud!, true, 1\);\s*\n\s*\}/);
    expect(SFX).toMatch(/private pipeDrop\(\): void \{[\s\S]{0,400}this\.pipeTexHud = null;/);
  });

  it('守卫面:hud 界为零/sky 界不等/screenStackMode 关/空链→返 false 落折叠（宁回退不产错帧）;finally 还原 premul+FLIP_Y 收口', () => {
    expect(SFX).toMatch(/if \(w === 0 \|\| h === 0\) return false;\s*\n\s*if \(src\.sky\.width !== w \|\| src\.sky\.height !== h\) return false;[\s\S]{0,120}if \(!pipe\.screenStackMode\) return false;/);
    expect(SFX).toMatch(/drawChainPipeStack\(pipe: GLPipeline, src: \{ sky: HTMLCanvasElement; hud: HTMLCanvasElement; useHud: boolean \},\s*\n\s*passes: readonly ScreenFxPass\[\], tint: readonly \[number, number, number\]\): boolean \{/);
    expect(SFX).toMatch(/\} finally \{\s*\n\s*\/\/ 预乘\/翻转态还原（GLPipeline init 收口缺省 premul=true\+FLIP_Y=false——[\s\S]{0,120}gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\);\s*\n\s*gl\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, false\);\s*\n\s*\}\s*\n\s*return ok;\s*\n\s*\}\s*\n\}/);
  });

  it('pass 执行面朝向契约零改动（原版 VERT 单源/逐 pass setBlend off/末 pass present(fboA);直通 blit 抽取后环内行为逐位同）', () => {
    expect(SFX).toContain("h = pipe.program(`sfxF:${kind}`, VERT, FRAGS[kind]);");
    expect(SFX).toContain("h = pipe.program('sfx:flip', VERT, FRAG_PASSTHRU);");
    expect(SFX.match(/pipe\.setBlend\('off'\);/g)?.length).toBe(2);   // pipeRunPasses pass 直写×1+pipeFlipTo 直通 blit×1（drawChainPipe 环内 flip 位已并入抽取）
    expect(SFX).toContain('pipe.present(fboA);');
  });
});

describe('K1-2 Renderer 路由与合成门', () => {
  it('三档路由次序:?c10ek1=0（K1-前折叠）→ 合成帧 HUD 直取 → 屏栈 Stack（c10e∧sky∧栈模式）→ 防御窗折叠;Stack 档诊断面 sfxPathUsed=\'pipe-stack\'', () => {
    expect(RDR).toMatch(/if \(!Renderer\.c10eK1\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.c10eChainSource\(\), passes,/);
    expect(RDR).toMatch(/\} else if \(this\._c10eFrame && this\._c10eComposited\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.canvas, passes,/);
    expect(RDR).toMatch(/\} else if \(this\._c10eFrame && this\.skyCanvas && pipe\.screenStackMode\) \{\s*\n\s*stackPath = true;\s*\n\s*chainOk = gl\.drawChainPipeStack\(pipe, \{ sky: this\.skyCanvas, hud: this\.canvas, useHud: true \}, passes,/);
    expect(RDR).toContain("this.sfxPathStats['pipe-stack']");
    // 档位落账按本帧实际分支（stackPath 局部量——防陈旧 sfxPathUsed Sticky 错归因）
    expect(RDR).toMatch(/if \(stackPath\) \{\s*\n\s*this\.sfxPathUsed = 'pipe-stack';/);
  });

  it('P1/P2 合成门收窄（滤镜待发臂摘除——pending 旗保留为诊断面;误留=滤镜帧重付全帧合成+Stack 档永不可达）', () => {
    expect(RDR.match(/c10eFullXformCond\(player, world\) \|\| this\._c10eFilterPending/g)?.length ?? 0).toBe(0);
    expect(RDR).toMatch(/this\._c10eFilterPending = this\._c10eFrame\s*\n\s*&& this\.c10eFilterPending\(world, player\);/);
  });

  it('K1-1 收益保留:xform 合成帧 HUD 直取（消「sky+gl 二次叠 ±1LSB」登记债）;c10ek1=0 档原样回放旧折叠（含二次叠债——旧行为定义）', () => {
    expect(RDR).toMatch(/\} else if \(this\._c10eFrame && this\._c10eComposited\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.canvas, passes,/);
    expect(RDR).toMatch(/if \(!Renderer\.c10eK1\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.c10eChainSource\(\), passes,/);
  });
});
