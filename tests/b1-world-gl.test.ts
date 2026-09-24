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
  it('?bgl 转正缺省开（?bgl=0 逃生门;2026-09-24 用户实测裁决）+worker 恒关+运行时翻面钩', () => {
    expect(RDR).toContain("new URLSearchParams(location.search).get('bgl') !== '0'");
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

  it('ChunkCache 侧:页脏账按层分账(W/T 双记)/页访问器/trim-dispose 双层清账/PAGE_WRF', () => {
    // ★bgl-tile-starve 定谳:单账共享被墙段先删 → tpg 永缺增量格;锁双层分账结构
    expect(CHK).toContain('readonly glDirtyPagesW = new Map<number, Set<number>>();');
    expect(CHK).toContain('readonly glDirtyPagesT = new Map<number, Set<number>>();');
    expect(CHK).toContain('for (const m of [this.glDirtyPagesW, this.glDirtyPagesT]) {');
    expect(CHK).toContain("glDirtySlots(layer: 'wall' | 'tile', idx: number)");
    expect(CHK).toContain("glDirtyClear(layer: 'wall' | 'tile', idx: number)");
    expect(CHK).toContain('if (cell >= 0) this.glMarkPageDirty(cell);');
    expect(CHK).toContain("pageCanvas(layer: 'wall' | 'tile', idx: number)");
    expect(CHK).toContain('this.glDirtyPagesW.delete(idx);   // ★B1:页销毁双层同清脏标');
    expect(CHK).toContain('this.glDirtyPagesW.clear();   // ★B1:页纹理账随世界整弃（双层）');
    expect(CHK).toContain('static PAGE_WRF = false;');
    expect(CHK).toContain('if (ChunkCache.CPU_RENDER || ChunkCache.PAGE_WRF)');
    // 旧单账禁回流(回归哨兵:任何 glDirtyPages 裸引用=单账复辟)
    expect(CHK).not.toMatch(/[^WT]\bglDirtyPages\./);
    expect(RDR).not.toMatch(/chunks\.glDirtyPages\./);
  });

  it('Renderer 侧:worldPageTex 消费按层走 glDirtySlots/glDirtyClear(墙段清账不殃及 tile)', () => {
    expect(RDR).toContain('chunks.glDirtyClear(layer, idx);');
    expect(RDR).toContain('const dirty = chunks.glDirtySlots(layer, idx);');
    // state② 增量对位:slot→页内 256² 矩形(slot%4, ⌊slot/4⌋)
    expect(RDR).toContain('glw.texSubUpdate(key, page, (slot % ChunkCache.PAGE_COLS) * 256,');
  });
});

describe('B1 quadTile/quadExact 判例', () => {
  it('Renderer 用 quadTile(gl_FragCoord texelFetch);quadExact 全跨度+NEAREST 备用;quad() 半像素内缩判例不回归', () => {
    expect(SRC).toContain('quadTile(');
    expect(SRC).toContain('quadExact(');
    // quadTile 体:texelFetch 直取(不经采样器)+程序态还原
    expect(SRC).toMatch(/quadTile\([\s\S]{0,900}?gl\.bindSampler\(0, null\);[\s\S]{0,600}?gl\.useProgram\(this\.prog\);/);
    // tile 面 shader:gl_FragCoord→texel 索引,tie 补正 2^-12
    expect(SRC).toContain('vec2 t = uSrcT.xy + floor(local / uDst.zw * uSrcT.zw - 1.0 / 4096.0);');
    expect(SRC).toContain('outColor = texelFetch(uTex, ivec2(t), 0);');
    // quadExact 体:全跨度(无 0.5 内缩)+恒 NEAREST 采样器+tie ε
    expect(SRC).toMatch(/quadExact\([\s\S]{0,1400}?gl\.bindSampler\(0, this\.samp\.nearest!\);[\s\S]{0,400}?gl\.uniform4f\(this\.uni\.uSrc, \(sx - QUAD_TIE_EPS\) \/ e\.w/);
    // 原 quad() 内缩判例原样(既有消费方零变化)
    expect(SRC).toContain('const px = 0.5 / e.w, py = 0.5 / e.h;');
  });
  it('Renderer bgl 段调 quadTile(失败回落 2D)', () => {
    expect(RDR).toMatch(/if \(!glw\.quadTile\(e, p\.sx, p\.sy, CHUNK \* ts, CHUNK \* ts, xd0, yd0, xd1 - xd0, yd1 - yd0\)\) return false;/);
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

// ---- ★渐进烘焙页完整性（bgl-tile-starve 定谳回归锁;运行时行为面）----
// 场景=用户实报:?bgl=1 页驻留后的增量烘焙(移动/建造/传送)只在墙纹理生效,
// tile 纹理永缺 → 物块整片透明洞。根因=页脏账单账共享被墙段消费即删。
// 锁:①烘焙双记 W+T;②墙段消费不清 tile 账(单账复辟在此爆红);
//    ③trim 尾裁双层同清;④dispose 双层同清。
import { ChunkCache as ChunkCacheClass } from '../src/render/ChunkCache';
import type { World as WorldT } from '../src/world/World';

/** 私有字段面(纯结构视图——交叉类型会因私有字段坍缩 never,同
 *  chunk-cache-precise-invalidate.test.ts 判例走 as unknown as) */
type LedgerCache = {
  glMarkPageDirty(cell: number): void;
  glDirtySlots(layer: 'wall' | 'tile', idx: number): Set<number> | undefined;
  glDirtyClear(layer: 'wall' | 'tile', idx: number): void;
  wallPages: { width: number; height: number }[];
  tilePages: { width: number; height: number }[];
  pageUsed: number[];
  cellFree: number[];
  trimFreePages(): void;
  dispose(): void;
};

function makeLedgerCache(): LedgerCache {
  const world = { store: { onTileChanged: () => {} } } as unknown as WorldT;
  const cc = new ChunkCacheClass(world, new Map(), null, null, null) as unknown as LedgerCache;
  return cc;
}

describe('B1 渐进烘焙页完整性(页脏账按层分账——tile 饥饿回归锁)', () => {
  it('I1 记账完备:glMarkPageDirty 同记 W+T 双账(同 cell)', () => {
    const cc = makeLedgerCache();
    cc.glMarkPageDirty(17);   // page 1, slot 1
    expect(cc.glDirtySlots('wall', 1)).toEqual(new Set([1]));
    expect(cc.glDirtySlots('tile', 1)).toEqual(new Set([1]));
    cc.glMarkPageDirty(16);   // page 1, slot 0
    expect(cc.glDirtySlots('wall', 1)).toEqual(new Set([0, 1]));
    expect(cc.glDirtySlots('tile', 1)).toEqual(new Set([0, 1]));
  });
  it('I1 消费隔离:墙段清账后 tile 账必须原样(单账复辟=此处爆红)', () => {
    const cc = makeLedgerCache();
    cc.glMarkPageDirty(17);
    // 墙段 worldPageTex 消费序列:读→texSubUpdate→清
    const wallDirty = cc.glDirtySlots('wall', 1);
    expect(wallDirty).toEqual(new Set([1]));
    cc.glDirtyClear('wall', 1);
    // ★tile 段随后消费:账必须仍在(修复前:undefined=tile 纹理永缺增量格)
    expect(cc.glDirtySlots('tile', 1)).toEqual(new Set([1]));
    cc.glDirtyClear('tile', 1);
    expect(cc.glDirtySlots('wall', 1)).toBeUndefined();
    expect(cc.glDirtySlots('tile', 1)).toBeUndefined();
  });
  it('I3 trim 尾裁:双层账同清(页号复用防陈旧增量)', () => {
    const cc = makeLedgerCache();
    cc.glMarkPageDirty(31);   // page 1(尾页) slot 15
    // 构造尾页全空:pageUsed[1]=0 + 尾页画布占位(trim 只从尾部收缩)
    cc.wallPages.push({ width: 1024, height: 1024 }, { width: 1024, height: 1024 });
    cc.tilePages.push({ width: 1024, height: 1024 }, { width: 1024, height: 1024 });
    cc.pageUsed.push(16, 0);
    cc.cellFree.push(31);
    cc.trimFreePages();
    expect(cc.glDirtySlots('wall', 1)).toBeUndefined();
    expect(cc.glDirtySlots('tile', 1)).toBeUndefined();
  });
  it('I3/I4 dispose:双层账随世界整弃', () => {
    const cc = makeLedgerCache();
    cc.glMarkPageDirty(5);
    cc.dispose();
    expect(cc.glDirtySlots('wall', 0)).toBeUndefined();
    expect(cc.glDirtySlots('tile', 0)).toBeUndefined();
  });
});
