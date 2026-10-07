// ★ghostblur 源锚锁（2026-10-07）——旗面/调用位/fail-closed 门/管线门面纪律。
// 运行时 GL 行为 node 不可验证（C10e 源锚锁判例同构）——像素 A/B 双臂对拍由
// scripts/_ghostblur-ab.mjs 兜底;决策核行为判别在 ghostblur-core.test.ts。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GAME = readFileSync(resolve(__dirname, '../src/core/Game.ts'), 'utf8');
const GB = readFileSync(resolve(__dirname, '../src/render/GhostBlur.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');

describe('ghostblur 旗面（灰度缺省关）', () => {
  it('?ghostblur=1 显式开,缺省关（=== 门——缺省/0/他值全关）', () => {
    expect(RDR).toContain("get('ghostblur') === '1'");
    expect(RDR).toContain('static get ghostBlur()');
    expect(RDR).toContain('static ghostBlurSetForTest(v: boolean): void');
  });
});

describe('ghostblur 挂接点（Game 帧 tick 尾=全路径唯一必经收口）', () => {
  it('调用位=renderer.render(...) 完整返回之后、glStatFrame 之前（glCanvas 本帧 GL 写入全落定）', () => {
    const i = GAME.indexOf('this.renderer.ghostFrameEnd(cam);');
    expect(i).toBeGreaterThan(0);
    const iRender = GAME.indexOf('this.renderer.render(');
    const iStat = GAME.indexOf('glStatFrame();   // #perf-gpulog');
    expect(iRender).toBeGreaterThan(0);
    expect(iStat).toBeGreaterThan(i);
    expect(i).toBeGreaterThan(iRender);
  });

  it('Renderer 侧双门 fail-closed:Renderer.ghostBlur ∧ _c10eFrame（旗关/非分体帧=完全旁路）', () => {
    expect(RDR).toContain('ghostFrameEnd(this.swPipe, cam.x, cam.y, Renderer.ghostBlur && this._c10eFrame)');
  });
});

describe('ghostblur GL 执行纪律（GLPipeline 门面消费,零本体改动）', () => {
  it('GLPipeline 本体无 ghost 侵入（ghostmix 程序经 pipe.program 门面注册）', () => {
    expect(PIPE).not.toContain('ghost');
    expect(GB).toContain("pipe.program('ghostmix', GHOST_VERT, GHOST_FRAG)");
  });

  it('三 FBO 管线 fbos 命名空间租名（ghostCur+ghostA/ghostB ping-pong）', () => {
    expect(GB).toContain("pipe.fbo(core.phase === 0 ? 'ghostA' : 'ghostB'");
    expect(GB).toContain("pipe.fbo(core.phase === 0 ? 'ghostB' : 'ghostA'");
    expect(GB).toContain("pipe.fbo('ghostCur', W, H)");
  });

  it('★旁路门先于一切 GL 写入（bypass → 零 blit/零 mix/零 present=静止帧逐位恒等）', () => {
    expect(GB).toMatch(/const d = core\.decide\(camX, camY, performance\.now\(\), W, H, true\);\s*\n\s*if \(d\.action === 'bypass'\) return;/);
  });

  it('★混入结果 present over=false（blend off 直写,不入屏栈——屏栈保留到帧头清零;\nglCanvas≠栈折叠的违例窗内无 GL/2D 读取面）', () => {
    expect(GB).toMatch(/pipe\.present\(write\);\s*\n\s*core\.commitMix\(\);/);
    expect(GB).toContain('blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST)');
  });

  it('uniform-in-useProgram 纪律（2026-09-23 全黑案判例——useProgram 先于 uniform1i）', () => {
    const iUse = GB.indexOf('gl.useProgram(prog.prog)');
    const iUni = GB.indexOf("gl.uniform1i(pipe.uni(prog, 'uPrev'), 0)");
    expect(iUse).toBeGreaterThan(0);
    expect(iUni).toBeGreaterThan(iUse);
  });

  it('预乘域 mix（rgb/α 同权重 lerp——texA×α+texB×(1−α)）+失败复位 fail-closed', () => {
    expect(GB).toContain('outColor = vec4(mix(c.rgb, p.rgb, uAlpha), mix(c.a, p.a, uAlpha));');
    expect(GB.match(/core\.reset\(\); return;/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
