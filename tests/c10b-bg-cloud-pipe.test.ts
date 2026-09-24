// ★C10b bg 会话迁入共管管线 + 云/背景 blit 合并 + 管线实例共管 + 转正——源码纪律锁（2026-09-24）
//
// 一期（C10a）只迁云;本刀:①群系背景 GL 会话同迁共管管线（glfx 保留为回退路径）
// ②层序定谳后 bg+云合并单会话单 present 单 blit（夹层内容在场=分回合回退,禁破坏
// 层序语义）③Renderer 持有单一 GLPipeline（云+bg+worldCompose 三消费方共管,
// 总上下文目标=swpipe 1+glfx 1=2）④?cloudpipe 转正缺省开（=0 逃生门=云+bg 整体回 glfx）。
// 运行时像素等价由 scripts/_c10b-bg-cloud-ab.mjs 页内翻面对拍兜底（多群系×天气×
// 缩放/相机矩阵）;本文件锁「接线不漂移」。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SKY = readFileSync(resolve(__dirname, '../src/render/SkyRenderer.ts'), 'utf8');
const COMP = readFileSync(resolve(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');
const REP = readFileSync(resolve(__dirname, '../src/debug/DebugReport.ts'), 'utf8');

describe('C10b 转正旗面与 bg 注入点', () => {
  it('?cloudpipe 缺省开（C10b 转正）,?cloudpipe=0 逃生门=云+bg 整体回 glfx', () => {
    expect(RDR).toContain("get('cloudpipe') !== '0'");
    // bg 注入点同旗:cloudpipe 开=acquireCloudPipe（共管管线）;关=acquireGL(glfx)
    expect(RDR).toMatch(/const glbg = Renderer\.cloudPipe \? this\.acquireCloudPipe\(\) : this\.acquireGL\(\)/);
    // 云注入点保持 C10a 分支形态（逃生门两路同门:useGLClouds/cpuRender 先判）
    expect(RDR).toMatch(/Renderer\.cloudPipe \? this\.acquireCloudPipe\(\) : this\.acquireGL\(\)/);
    expect(RDR.match(/Renderer\.cloudPipe \? this\.acquireCloudPipe\(\) : this\.acquireGL\(\)/g)?.length).toBe(2);
  });

  it('bg 会话 FBO=\'bg\'（纯 bg 与合并会话同 FBO 名=开会方）;云会话缺省 \'clouds\'——命名空间防撞', () => {
    expect(RDR).toContain("glbg.begin('bg')");
    expect(SRC).toContain("begin(fboName = 'clouds')");
    // 管线 FBO 面:云/bg/lit/warped/light2 各归各（worldCompose 三名不与天空面撞）
    expect(COMP).toContain("pipeline.fbo('lit', w, h)");
    expect(COMP).toContain("pipeline.fbo('warped', w, h)");
    expect(COMP).toContain("pipeline.fbo('light2', rawLight.w2, rawLight.h2)");
    expect(SKY).toContain("ctx.drawImage(shared.canvas, 0, 0)");   // 合并收口全幅 blit
  });
});

describe('C10b 层序定谳→合并判定（先定谳再动刀）', () => {
  it('合并判定四门齐:bg 走 pipe+非 remix 跳过层+云 GL 总门+无 2D 夹层内容', () => {
    expect(RDR).toContain('const skyMergeable = Renderer.cloudPipe && !remixSkipSurfaceBg');
    expect(RDR).toMatch(/skyMergeable = Renderer\.cloudPipe && !remixSkipSurfaceBg\s*\n\s*&& this\.sky\.useGLClouds && !this\.sky\.hasSkyWeatherTint\(\) && !this\.hasBgFlash\(\)/);
  });

  it('夹层内容判定面:天气色罩（weatherTintPasses 同判,零分配）+切换黑闪（同阈 0.01）', () => {
    expect(SKY).toMatch(/hasSkyWeatherTint\(\): boolean \{\s*\n\s*if \(!this\.cots\) return false;\s*\n\s*return this\.sandTintState\.opacity > 0\.001 \|\| this\.blizzTintState\.opacity > 0\.001;/);
    expect(RDR).toMatch(/private hasBgFlash\(\): boolean \{\s*\n\s*for \(let a = 0; a < 13; a\+\+\) \{\s*\n\s*if \(this\.biomeBg\.bgFlash\[a\] > 0\.01\) return true;/);
  });

  it('合并会话:bg begin 后保开放续交云 quads;drawCloudsNear 恒收口（早退路径含——防 bg 丢）', () => {
    // bg 侧:合并分支 begin('bg') 后无 end/blit（延迟到云后单次）
    expect(RDR).toMatch(/if \(skyMergeable\) \{[\s\S]{0,600}glbg\.begin\('bg'\);[\s\S]{0,400}biomeBg\.draw\(new GLBgBlit\(glbg\)[\s\S]{0,200}mergedSession = glbg;/);
    // 消费侧:早退路径也收口（merged.end()+全幅 blit+globalAlpha 归位）
    expect(SKY).toMatch(/if \(camTop >= this\.fx\.surfaceY \+ 16\) \{\s*\n\s*if \(merged\) \{ merged\.end\(\); ctx\.drawImage\(merged\.canvas, 0, 0\); ctx\.globalAlpha = 1; \}\s*\n\s*return;/);
    // 正常路径:合并会话禁再 begin（begin=清屏会抹掉已交 bg quads）
    expect(SKY).toContain('let batchBegun = mergedMode;');
    // 收口后 Renderer 清引用（每帧独立判定,无跨帧残留）
    expect(RDR).toMatch(/this\.sky\.drawCloudsNear\(ctx, viewW, viewH, cam\.y, 'both', mergedSession\);\s*\n\s*const wasMerged = mergedSession !== null;\s*\n\s*mergedSession = null;/);
  });

  it('分回合回退=双会话双 blit（夹层内容在场;bg 全幅 blit 结构与 C10a/glfx 同）', () => {
    // else 分支:bg begin→draw→end→全幅 blit（1:1 旧结构,夹层矩形仍画主画布）
    expect(RDR).toMatch(/glbg\.begin\('bg'\);\s*\n\s*if \(!remixSkipSurfaceBg\) \{[\s\S]{0,300}glbg\.end\(\);\s*\n\s*ctx\.drawImage\(glbg\.canvas, 0, 0\);/);
    // 天气色罩/黑闪绘制段保持原位（层序语义零改动）
    expect(RDR).toContain('this.sky.drawWeatherTint2D(ctx, viewW, viewH);');
    expect(RDR).toContain("ctx.fillStyle = '#000';");
  });

  it('合并收口=全幅 blit（bg 覆盖面不以云 bbox 为界——cloudBlitRect bbox 收口不适用）', () => {
    expect(SKY).toMatch(/if \(mergedMode\) \{[\s\S]{0,400}ctx\.drawImage\(shared\.canvas, 0, 0\);[\s\S]{0,120}\} else \{\s*\n\s*this\.cloudBlitRect\(ctx, shared\);/);
  });

  it('诊断面:cloudMergeUsed/cloudMergeStats（merged/split/- 三态;DebugReport cloudPath 段）', () => {
    expect(RDR).toContain('cloudMergeUsed');
    expect(RDR).toContain('cloudMergeStats');
    expect(REP).toMatch(/cloudPath: \{\s*\n\s*used: g\.renderer\?\.cloudPathUsed \?\? null,\s*\n\s*stats: g\.renderer\?\.cloudPathStats \?\? null,\s*\n\s*merge: g\.renderer\?\.cloudMergeUsed \?\? null,\s*\n\s*mergeStats: g\.renderer\?\.cloudMergeStats \?\? null,\s*\n\s*\}/);
  });
});

describe('C10b 管线实例共管（三消费方单实例）', () => {
  it('Renderer 持有单一 GLPipeline（swPipe 懒建,statName=swpipe 账页）;总上下文=swpipe 1+glfx 1', () => {
    expect(RDR).toContain('private swPipe: GLPipeline | null = null;');
    expect(RDR).toContain("private static readonly SWPIPE_STAT = 'swpipe';");
    expect(RDR).toMatch(/private acquireSwPipe\(\): GLPipeline \| null \{/);
    // 层以非拥有注入（dispose 不级联管线——共管所有权语义）
    expect(RDR).toContain('const inst = new GLSpriteLayer(pipe, false);');
    // 工厂（自建管线 1:1 持有）不再被 Renderer 使用
    expect(RDR).not.toContain('createPipelineBacked(');
  });

  it('worldCompose 注入共管管线（cloudpipe 开）;逃生门（=0）回自建=全量旧行为', () => {
    expect(RDR).toMatch(/private newWorldCompose\(\): GLWorldCompose \{\s*\n\s*return new GLWorldCompose\('worldCompose', Renderer\.cloudPipe \? this\.acquireSwPipe\(\) : null\);/);
    expect(COMP).toContain("constructor(statName = 'worldCompose', pipe?: GLPipeline | null)");
    expect(COMP).toContain('this.ownsPipe = !pipe;');
    expect(COMP).toContain('this.pipeline = pipe ?? new GLPipeline(statName);');
    // 非拥有模式:dispose 不级联管线;acquire 不自行重生（重生归 Renderer 治理）
    expect(COMP).toMatch(/dispose\(\): void \{\s*\n\s*\/\/ ★C10b:仅自建管线时级联 dispose[^]*?if \(this\.ownsPipe\) this\.pipeline\.dispose\(\);/);
    expect(COMP).toMatch(/acquire\(\): GLWorldCompose \| null \{[\s\S]{0,300}if \(!this\.ownsPipe\) return null;/);
    // recreate:非拥有模式不 recreate 管线本体（防毒化云/bg 层已登记句柄）
    expect(COMP).toContain('const ok = this.ownsPipe ? this.pipeline.recreate() : !this.pipeline.unavailable;');
  });

  it('★熔断链全覆盖:reviveSwPipe=整链 dispose+全新实例（recreate 清程序表=A3 判例,全消费方重注册）', () => {
    expect(RDR).toMatch(/private reviveSwPipe\(\): boolean \{\s*\n\s*this\.dropSwPipe\(\);/);
    // 整链三件:云/bg 层+worldCompose+管线本体
    expect(RDR).toMatch(/private dropSwPipe\(\): void \{\s*\n\s*this\.dropCloudPipe\(\);\s*\n\s*if \(this\.worldCompose\) \{ this\.worldCompose\.dispose\(\); this\.worldCompose = null; \}\s*\n\s*if \(this\.swPipe\) \{ this\.swPipe\.dispose\(\); this\.swPipe = null; \}/);
    // 治理面唯一走 dispose+全新（不走 GLPipeline.recreate 同画布复活——lost 未恢复
    // 上下文 getContext 返回同一死上下文,recreate 半残态在多消费方面被放大）
    expect(RDR).not.toContain('this.swPipe.recreate()');
    expect(RDR).not.toContain('swPipe?.recreate()');
  });

  it('释放面三挂点齐:熔断硬释放/CPU 切换/销毁链全走 dropSwPipe', () => {
    expect(RDR.match(/this\.dropSwPipe\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);   // 定义外 3 挂点+revive 内 1
    expect(RDR).toContain('this.dropSwPipe();   // ★C10b:共管管线整体硬释放');
    expect(RDR).toContain('this.dropSwPipe();   // ★C10b:CPU 软渲染零 GPU 预算');
    expect(RDR).toContain('this.dropSwPipe();   // ★C10b:共管管线(云/bg 层+worldCompose+本体,纹理 LRU 同链——不跨世界持有)');
  });

  it('GLSpriteLayer ownsPipe:工厂/独占构造=true（dispose 级联管线）;注入=false', () => {
    expect(SRC).toContain('constructor(pipe?: GLPipeline, ownsPipe = true)');
    expect(SRC).toContain('private ownsPipe = true;');
    expect(SRC).toContain('this.ownsPipe = ownsPipe;');
    expect(SRC).toContain('if (this.ownsPipe) this.pipe?.dispose();');
  });
});

describe('C10b 周边结构保留', () => {
  it('glfx 回退路径完整保留（bg 逃生门走 acquireGL;地图/拖尾消费方零变化）', () => {
    expect(RDR).toMatch(/acquireGL\(\): GLSpriteLayer \| null \{/);
    expect(RDR).toContain('inst.statName = \'glfx\';');
  });

  it('GLPipeline A0 面零改动（FBO RGBA8/present flipY/程序表）——共管不修门面', () => {
    expect(PIPE).toContain('gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null');
    expect(PIPE).toContain('present(src: PipelineFbo)');
    expect(PIPE).toContain('recreate(): boolean');
  });

  it('云提交面零改动（drawCloudPass quad/cloudQuad 后端透明;C10a 锁面保持）', () => {
    expect(SKY).toContain('gl.cloudQuad(gtex, 0, 0, gtex.w, gtex.h, c.x, yOf(c), w, h, c.rot, !!c.flip, {');
    expect(SKY).toContain("gl.texFromImage(`cloud:${c.type}`, tex)");
    expect(SKY).toContain('ctx.drawImage(layer.canvas, sx, sy, sw, sh, sx, sy, sw, sh)');   // bbox 收口保留（分回合云会话）
  });
});
