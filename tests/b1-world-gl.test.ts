// ★B1 世界层翻面第一役 结构锁（2026-09-24）。
// 锁面：FBO 租名 'world' / revive 链挂点 / 逃生门双路 / worldTex 退役断言
// （A 线句柄面本役零改动——退役=B2 入口,见报告定谳）/ 页纹理生命周期 /
// quadExact 判例（全跨度 uv+NEAREST,quad() 半像素内缩判例不回归）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SRC = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const CHK = readFileSync(join(__dirname, '../src/render/ChunkCache.ts'), 'utf8');
const COMP = readFileSync(join(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');

describe('B1 旗面与逃生门', () => {
  it('?bgl 灰度缺省关（?bgl=1 显式激活）+运行时翻面钩（wfbo 同款）', () => {
    expect(RDR).toContain("new URLSearchParams(location.search).get('bgl') === '1'");
    expect(RDR).toContain('static get bgl() { return this._bgl; }');
    expect(RDR).toContain('static bglSetForTest(v: boolean): void {');
    expect(RDR).toContain('ChunkCache.PAGE_WRF = v;   // 页画布背板随旗面');
  });

  it('逃生门双路:GL 段失败整格回落 2D drawChunkGrid(路径记账面)', () => {
    expect(RDR).toContain("if (!bglStageGrid('wall')) {");
    expect(RDR).toContain("if (!bglStageGrid('tile')) {");
    expect(RDR).toContain("this.bglPathUsed = 'world-2d-wall'");
    expect(RDR).toContain("this.bglPathUsed = 'world-2d-tile'");
    expect(RDR).toContain("if (!Renderer.bgl || this.isCpuRender() || !this.worldLayerActive) return false;");
  });

  it('CPU 渲染/worldLayer 关闭不进 GL 段(2D 全链保留)', () => {
    // bglStageGrid 首门四判:旗+CPU+worldLayerActive+GL 可用
    expect(RDR).toMatch(/const bglStageGrid = \(layer: 'wall' \| 'tile'\): boolean => \{\s*\n\s*if \(!Renderer\.bgl \|\| this\.isCpuRender\(\) \|\| !this\.worldLayerActive\) return false;\s*\n\s*const glw = this\.acquireWorldGl\(\);/);
  });
});

describe('B1 共管管线租用与 revive 链', () => {
  it('FBO 租名 world(两段串行复用,无乒乓)——命名空间 clouds/bg/lit/warped/light2/world 各归各', () => {
    expect(RDR).toContain("glw.begin('world')");
    expect(SRC).toContain("begin(fboName = 'clouds')");
    expect(COMP).toContain("pipeline.fbo('lit', w, h)");
    expect(COMP).toContain("pipeline.fbo('warped', w, h)");
    expect(COMP).toContain("pipeline.fbo('light2', rawLight.w2, rawLight.h2)");
  });

  it('revive 链挂点:dropSwPipe 含 dropWorldPipe(第四消费方);acquireWorldGl 哨兵族', () => {
    expect(RDR).toMatch(/private dropSwPipe\(\): void \{\s*\n\s*this\.dropCloudPipe\(\);\s*\n\s*this\.dropWorldPipe\(\);/);
    expect(RDR).toMatch(/private acquireWorldGl\(\): GLSpriteLayer \| null \{/);
    expect(RDR).toContain('const inst = new GLSpriteLayer(pipe, false);');   // 共管注入 ownsPipe=false
    expect(RDR).toContain('private worldPipeLayer: GLSpriteLayer | null = null;');
  });

  it('页纹理计数随层释放归零(新页不得撞陈旧键)', () => {
    expect(RDR).toMatch(/private dropWorldPipe\(\): void \{\s*\n\s*if \(this\.worldPipeLayer\) \{ this\.worldPipeLayer\.dispose\(\); this\.worldPipeLayer = null; \}\s*\n\s*this\._bglPageUploaded\.w = 0;\s*\n\s*this\._bglPageUploaded\.t = 0;/);
  });
});

describe('B1 chunk 页纹理 GPU 驻留', () => {
  it('页纹理键 wpg:/tpg: + 全量上传(noMip) + 脏 slot 增量 texSubUpdate(禁每帧全量重传)', () => {
    expect(RDR).toContain("const key = `${kind}pg:${idx}`;");
    expect(RDR).toContain('glw.dropTexture(key);');
    expect(RDR).toContain('glw.texFromImage(key, page, false, true)');   // noMip=true
    expect(RDR).toContain('glw.texSubUpdate(key, page, (slot % ChunkCache.PAGE_COLS) * 256,');
    // 收缩同步(trim 尾裁后同 idx 复用防串味)
    expect(RDR).toContain('if (uploaded() > chunks.pageCount) {');
  });

  it('ChunkCache 侧:glDirtyPages 烘焙登记/页访问器/trim-dispose 清账/PAGE_WRF', () => {
    expect(CHK).toContain('readonly glDirtyPages = new Map<number, Set<number>>();');
    expect(CHK).toContain('if (cell >= 0) this.glMarkPageDirty(cell);');
    expect(CHK).toContain("pageCanvas(layer: 'wall' | 'tile', idx: number)");
    expect(CHK).toContain('this.glDirtyPages.delete(idx);   // ★B1:页销毁同页清脏标');
    expect(CHK).toContain('this.glDirtyPages.clear();   // ★B1:页纹理账随世界整弃');
    expect(CHK).toContain('static PAGE_WRF = false;');
    expect(CHK).toContain('if (ChunkCache.CPU_RENDER || ChunkCache.PAGE_WRF)');
  });
});

describe('B1 quadExact 判例', () => {
  it('全跨度 uv+NEAREST(2D smoothing-off 最近邻逐式复刻);quad() 半像素内缩判例不回归', () => {
    expect(SRC).toContain('quadExact(');
    // quadExact 体:全跨度(无 0.5 内缩)+恒 NEAREST 采样器
    expect(SRC).toMatch(/quadExact\([\s\S]{0,1200}?gl\.bindSampler\(0, this\.samp\.nearest!\);[\s\S]{0,400}?gl\.uniform4f\(this\.uni\.uSrc, sx \/ e\.w, sy \/ e\.h, sw \/ e\.w, sh \/ e\.h\);/);
    // 原 quad() 内缩判例原样(既有消费方零变化)
    expect(SRC).toContain('const px = 0.5 / e.w, py = 0.5 / e.h;');
  });
});

describe('B1 A 线零改动(worldTex 退役=B2 入口,本役句柄面不动)', () => {
  it('GLWorldCompose pass1 仍直传 worldCanvas(上传链/A 线结构零触碰)', () => {
    expect(COMP).toContain('gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, world);');
    expect(COMP).toContain("pipeline.fbo('lit', w, h)");
  });
  it('Renderer compositeLight 仍以 worldCanvas 为 worldTex 源(2D 回退路径全保留)', () => {
    expect(RDR).toContain('wc.compose(\n            this.worldCanvas!,');
    expect(RDR).toContain('gl.composite(this.worldCanvas!, this.lightCanvas,');
  });
});
