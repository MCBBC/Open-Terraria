// ★C10e 分体画布呈现架构 源锚锁（2026-10-01,docs/c10e-design.md）
//
// 三画布栈（sky2D 底 / glCanvas 中=GL 唯一呈现面 / HUD 顶）+ 屏直出栈（GLPipeline
// over present）+ 帧分类路由 + 逃生门。运行时 GL 行为无法在 node vitest 验证
// （无 WebGL/DOM 合成）——像素等价由 scripts/_c10e-ab.mjs 双页对拍兜底;本文件
// =源文本纪律锁（三画布脚手架/present 位/逃生门/旗门结构不漂移）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const SKY = readFileSync(resolve(__dirname, '../src/render/SkyRenderer.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');
const COMP = readFileSync(resolve(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');

describe('C10e 旗面与三画布脚手架', () => {
  it('?c10e=1 显式开启（缺省关=单画布零变化）;构造期旗（HUD alpha 属性定死约束）', () => {
    expect(RDR).toContain("get('c10e') === '1'");
    expect(RDR).toContain('static get c10e()');
    expect(RDR).toContain('static c10eSetForTest(v: boolean): void');
  });

  it('三画布创建:sky2D(2D)+glCanvas(元素工厂)+主画布=HUD;旗关=零创建', () => {
    expect(RDR).toMatch(/if \(Renderer\.c10e\) \{\s*\n\s*this\.skyCanvas = document\.createElement\('canvas'\);\s*\n\s*this\.skyCtx = this\.skyCanvas\.getContext\('2d'\)!;\s*\n\s*this\.glCanvasEl = this\.mkGlCanvasEl\(\);\s*\n\s*\}/);
    expect(RDR).toMatch(/mainCtxAttrs\(\): CanvasRenderingContext2DSettings \{[\s\S]{0,200}if \(Renderer\.c10e\) a\.alpha = true;\s*\n\s*else if \(Renderer\.opaqueMain\) a\.alpha = false;/);
  });

  it('attach 挂载序=DOM paint 序=层序（sky2D→glCanvas→HUD）;glCanvas 懒插补挂', () => {
    expect(RDR).toMatch(/attach\(parent: HTMLElement\) \{\s*\n\s*\/\/ ★C10e[\s\S]{0,200}if \(this\.skyCanvas\) parent\.appendChild\(this\.skyCanvas\);\s*\n\s*if \(this\.glCanvasEl && !this\.glCanvasEl\.isConnected\) parent\.appendChild\(this\.glCanvasEl\);\s*\n\s*parent\.appendChild\(this\.canvas\);\s*\n\s*\}/);
  });

  it('呈现面元素:takeGlCanvasEl 换元(replaceWith——死上下文同元素 getContext 判例);注入 GLPipeline', () => {
    expect(RDR).toMatch(/takeGlCanvasEl\(\): HTMLCanvasElement \{[\s\S]{0,600}replaceWith\(nu\);/);
    expect(RDR).toContain('new GLPipeline(Renderer.SWPIPE_STAT, Renderer.c10e ? this.takeGlCanvasEl() : undefined)');
    expect(RDR).toContain('new GLPipeline(Renderer.SWPIPE_STAT, Renderer.c10e ? this.takeGlCanvasEl() : undefined)');
  });

  it('resize 三画布同步;dispose 摘 DOM 节点（主画布由 Game.destroy 同责）', () => {
    expect(RDR).toMatch(/if \(this\.skyCanvas\) this\.c10eSyncCanvasSize\(this\.skyCanvas\);\s*\n\s*if \(this\.glCanvasEl\) this\.c10eSyncCanvasSize\(this\.glCanvasEl\);/);
    expect(RDR).toMatch(/this\.skyCanvas\?\.remove\(\);\s*\n\s*this\.skyCanvas = null; this\.skyCtx = null;\s*\n\s*this\.glCanvasEl\?\.remove\(\);/);
  });

  it('呈现窗开闭:acquire 健康=show;死/退避=hide(陈旧屏防鬼影)', () => {
    expect(RDR).toMatch(/private c10ePipeAlive\(pipe: GLPipeline\): void \{[\s\S]{0,300}this\.c10eSetGlCanvasVisible\(true\);/);
    expect(RDR).toMatch(/private c10ePipeDead\(\): void \{[\s\S]{0,200}this\.c10eSetGlCanvasVisible\(false\);/);
  });
});

describe('C10e 帧分类与路由（帧头定谳——状态全 settle）', () => {
  it('帧门=旗×非拍照×非cpu×worldLayer 在×wK===1×非远云夹层;旗外帧=整帧旗关行为', () => {
    expect(RDR).toMatch(/const c10eBase = Renderer\.c10e && !this\._capturePass && !this\.isCpuRender\(\)\s*\n\s*&& this\.worldLayerEnabled;/);
    expect(RDR).toMatch(/this\._c10eFrame = c10eBase && wKc === 1 && !this\.sky\.farInterlayerActive\(cam\.y\);/);
  });

  it('夹层路由（世界→HUD blit）=interlayer 谓词∨shimmer;读 sky.draw 后状态与 opresent 门同相', () => {
    expect(RDR).toMatch(/this\._c10eWorldToHud = this\._c10eFrame\s*\n\s*&& \(this\.sky\.opresentInterlayerPending\(\) \|\| this\.monoFilters\.shimmerAlpha > 0\);/);
  });

  it('sky.draw 目标画布分支:c10e 帧=sky2D;旗关/回退=原主 ctx;星直出同门 farDeferGate', () => {
    expect(RDR).toContain('this.sky.draw(this._c10eFrame ? (this.skyCtx ?? ctx) : ctx, clock, viewW, viewH, cam.x, 16.7, cam.y);');
    expect(RDR).toContain('this.sky.c10eStarDirect = this._c10eFrame && this.sky.farDeferGate;');
  });

  it('pipe 屏栈机制随帧分类启停（回退帧 present 全走原路径）;帧首清屏闩复位', () => {
    expect(RDR).toMatch(/if \(this\.swPipe\) \{\s*\n\s*this\.swPipe\.screenStackMode = this\._c10eFrame;\s*\n\s*this\.swPipe\.screenCleared = !this\._c10eFrame;\s*\n\s*\}/);
  });
});

describe('C10e GLPipeline 屏直出栈', () => {
  it('screenStackMode/screenCleared/屏栈 API 齐备;over=premul 叠合入栈,off=直写不入栈', () => {
    expect(PIPE).toContain('screenStackMode = false;');
    expect(PIPE).toContain('screenCleared = false;');
    expect(PIPE).toContain('clearScreenForStack(): void');
    expect(PIPE).toContain('restackScreen(): void');
    expect(PIPE).toMatch(/present\(src: PipelineFbo, over = false\): void \{[\s\S]{0,400}if \(over && this\.screenStackMode\) \{\s*\n\s*this\.setBlend\('premul'\);\s*\n\s*this\.screenStack\.push\(src\);\s*\n\s*\} else \{\s*\n\s*this\.setBlend\('off'\);\s*\n\s*\}/);
    // restack 先快照再清（clear 清栈——重放源须保序）
    expect(PIPE).toMatch(/restackScreen\(\): void \{[\s\S]{0,200}const stack = this\.screenStack\.slice\(\);[\s\S]{0,200}for \(const f of stack\) this\.present\(f, true\);/);
  });

  it('GLSpriteLayer.begin 帧首清屏代理（pipe 帧头可能未建——首会话闯入）;end over 缺省参', () => {
    expect(SRC).toMatch(/if \(this\.pipe\.screenStackMode && !this\.pipe\.screenCleared\) this\.pipe\.clearScreenForStack\(\);/);
    expect(SRC).toContain('end(present = true, over = false): void');
    expect(SRC).toContain('get pipeBackend(): GLPipeline | null');
  });

  it('GLWorldCompose compose 尾 present 透传 presentOver（双出口同透传）', () => {
    expect(COMP).toContain('pipeline.present(this.fboOpresent, presentOver);');
    expect(COMP).toContain('pipeline.present(this.fboWarped, presentOver);');
  });
});

describe('C10e present 位处置（设计文档 §二 P1-P14）', () => {
  it('P2 bg split 收口 over 直出 skip blit;bg 2D 回退路由 sky2D', () => {
    expect(RDR).toContain('if (!(this._c10eFrame && glbg.pipeBackend)) ctx.drawImage(glbg.canvas, 0, 0);');
    expect(RDR).toContain('const bg2dCtx = this._c10eFrame ? (this.skyCtx ?? ctx) : ctx;');
  });

  it('P5 自然星直出（end(over)+无 blit）;P6 人工星保留 blit→HUD+restack（veil 同层序）', () => {
    expect(SKY).toMatch(/if \(this\.c10eStarDirect && layer\.pipeBackend\) \{\s*\n\s*this\.emitStarBatchGL\(layer, batch, 'sstarn', viewW, viewH, true\);\s*\n\s*\} else \{/);
    expect(SKY).toMatch(/emitStarBatchGL\(layer, batch, 'sstars', viewW, viewH\);[\s\S]{0,700}ctx\.drawImage\(layer\.canvas, 0, 0\);[\s\S]{0,200}layer\.pipeBackend\?\.restackScreen\(\);/);
  });

  it('P7 世界合成:纯帧=compose 尾 over 直出无 blit;夹层帧=blit→HUD+restack（双支同构）', () => {
    expect(RDR.match(/if \(!\(this\._c10eFrame && !this\._c10eWorldToHud\)\) \{/g)?.length).toBe(2);
    expect(RDR.match(/if \(this\._c10eFrame\) wcL?\.pipeline\.restackScreen\(\);/g)?.length).toBe(2);
    expect(RDR).toContain('this._c10eFrame && !this._c10eWorldToHud,');
  });

  it('P9 fullbright/lightFast accFbo:纯帧 over 直出;夹层帧 blit+restack', () => {
    expect(RDR.match(/if \(this\._c10eFrame && !this\._c10eWorldToHud && this\.swPipe\.screenStackMode\) \{/g)?.length).toBe(2);
  });

  it('P10/P11 内部读回 present 后 restack（degradeAcc/bgl 桥——「glCanvas=屏栈」不变式）', () => {
    expect(RDR).toMatch(/this\.worldCtxLayer\.drawImage\(this\.swPipe\.canvas, 0, 0\);\s*\n\s*this\.worldCtxLayer\.restore\(\);\s*\n\s*\/\/ ★C10e[\s\S]{0,200}if \(this\._c10eFrame\) this\.swPipe\.restackScreen\(\);/);
    expect(RDR).toMatch(/wctx\.drawImage\(glw\.canvas, 0, 0, lw, lh\);\s*\n\s*wctx\.restore\(\);\s*\n\s*\/\/ ★C10e[\s\S]{0,200}if \(this\._c10eFrame && glw\.pipeBackend\) glw\.pipeBackend\.restackScreen\(\);/);
  });

  it('P14 滤镜链输入=全帧合成 scratch（三画布折叠;旗关=主画布原路径）', () => {
    expect(RDR).toContain('chainOk = gl.drawChainPipe(pipe, this.c10eChainSource(), passes, [');
    expect(RDR).toContain('if (!chainOk && gl.drawChain(this.c10eChainSource(), passes,');
    expect(RDR).toContain('private c10eChainSource(): HTMLCanvasElement {');
  });

  it('P1/P2 全帧合成（死亡灰化/重力翻转自拷消费者前置）;幂等闩', () => {
    expect(RDR).toMatch(/private c10eCompositeIntoHud\(\): void \{[\s\S]{0,200}if \(this\._c10eComposited \|\| !this\._c10eFrame\) return;\s*\n\s*this\._c10eComposited = true;/);
    expect(RDR).toMatch(/if \(this\._c10eFrame && this\._c10eWorldToHud && !this\._c10eComposited\s*\n\s*&& this\.c10eFullXformCond\(player, world\)\) \{\s*\n\s*this\.c10eCompositeIntoHud\(\);\s*\n\s*\}/);
    expect(RDR).toMatch(/if \(this\._c10eFrame && !this\._c10eComposited && this\.c10eFullXformCond\(player, world\)\) \{\s*\n\s*this\.c10eCompositeIntoHud\(\);\s*\n\s*\}/);
  });

  it('P15 天气色罩 GL quad mini-session（bg 后/近云前原层序位）;回退=fillRect 原路径', () => {
    expect(SKY).toMatch(/const glLayer = this\.c10eOver \? this\.cloudGlLayer : null;[\s\S]{0,600}glLayer\.begin\('wtint'\);\s*\n\s*glLayer\.fillQuad\(0, 0, viewW, viewH,/);
    expect(SKY).toContain("ctx.fillStyle = `rgb(${Math.round(p.color[0] * 255)},${Math.round(p.color[1] * 255)},${Math.round(p.color[2] * 255)})`;");
  });
});

describe('C10e 逃生门与登记边界', () => {
  it('cloudpipe=0 在 c10e 收窄（双注入点强制共管）;compose 同判据', () => {
    expect(RDR).toContain('(Renderer.cloudPipe || Renderer.c10e) ? this.acquireCloudPipe() : this.acquireGL()');
    expect(RDR).toContain('if (!Renderer.cloudPipe && !Renderer.c10e) return new GLWorldCompose(\'worldCompose\', null);');
    expect(RDR).toMatch(/if \(this\.worldCompose && this\.worldCompose\.ownsPipe !== !\(Renderer\.cloudPipe \|\| Renderer\.c10e\)\) \{/);
  });

  it('SkyRenderer 旗逐帧重置（菜单/非世界帧恒 false=零行为变化）', () => {
    expect(SKY).toContain('c10eOver = false;');
    expect(SKY).toContain('c10eStarDirect = false;');
    expect(SKY).toMatch(/farInterlayerActive\(camY: number\): boolean \{\s*\n\s*return this\.aurora\.tileColorState\(\) !== null\s*\n\s*\|\| \(this\.lanternOpacity > 0\.001 && camY <= this\.fx\.surfaceY\);\s*\n\s*\}/);
  });

  it('sky2D 上下文死亡重建（recreateAuxCanvases——replaceWith 保 DOM 位次）', () => {
    expect(RDR).toMatch(/if \(this\.skyCtx && \(this\.skyCtx as CanvasRenderingContext2D & \{ isContextLost\?: \(\) => boolean \}\)\.isContextLost\?\.\(\)\) \{\s*\n\s*const nu = document\.createElement\('canvas'\);\s*\n\s*this\.skyCanvas!\.replaceWith\(nu\);\s*\n\s*this\.skyCanvas = nu;\s*\n\s*this\.skyCtx = nu\.getContext\('2d'\)!;/);
  });
});
