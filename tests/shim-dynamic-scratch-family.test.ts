// ★变体①「画布身份缓存×内容后变」终扫修复锁（2026-09-27 生命水晶案根病完整变体面）。
// 机制定谳：acc shim 链下画布源按 (texId,矩形) 身份缓存区域纹理——
//   A. 共享 scratch 同帧多次烘焙（尘 s1/s2、飞灵 sil/tint、亮度藤、月总光地板、
//      wingTintScratch、女皇剑 HUE_TINT）→ markDynamic 静态路径/flush 期刷新全读
//      【末次烘焙】字节=先行 rec 内容全错（I类 bolt 同病;1:N 消费还需帧内粘滞账）;
//   B. 长命画布矩形回收再烘焙（TintAtlas 页 free-list 复用）→ er: 键不变=
//      首帧内容永久冻结（生命水晶 tileShine 同族）。
// 修复三件：①GLShimExecutor.uploadScratchNow 挂 bakedTexMulti 帧内粘滞账（1:N）
//   +frameReset 清账;②resolveTex er: 键携带 texEpoch 且 epoch 参与 JS 侧命中判定;
//   ③TintAtlas 回收矩形 blit 后 bumpTexEpoch(page.cv);Renderer/MinionProj 各
//   烘焙点 uploadScratchBake/markWorldDynamicScratch 逐次上传。
// 本文件锁两面：行为锁（acc shim 桩,glw 行为面 node 不可跑=b0 判例沿袭）+源级锁。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { TintAtlas } from '../src/render/TintAtlas';
import { bumpTexEpoch, texEpoch, texId } from '../src/render/texId';

const SHIM = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const TATLAS = readFileSync(join(__dirname, '../src/render/TintAtlas.ts'), 'utf8');
const MINION = readFileSync(join(__dirname, '../src/entities/MinionProj.ts'), 'utf8');

interface QuadRec { key: string; dx: number; dy: number }

/** acc 态 host 桩（b2-shine-scratch-prelock 判例同款,扩 texFromRegion 记账）：
 *  texRefresh/texFromRegion 按 key 发【独立条目】并记录调用时机（pre/post flush）。 */
function mkAccHost() {
  const quads: QuadRec[] = [];
  const refreshKeys: string[] = [];
  const regionKeys: string[] = [];
  const entries = new Map<string, { key: string }>();
  let flushed = false;
  const entryOf = (key: string): { key: string } => {
    let e = entries.get(key);
    if (!e) { e = { key }; entries.set(key, e); }
    return e;
  };
  const layer = {
    unavailable: false,
    open: false,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin() { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; },
    blendAdditive() { /* no-op */ },
    blendErase() { /* no-op */ },
    blendMult() { /* no-op */ },
    quadSprite(e: { key: string }, _sx: number, _sy: number, _sw: number, _sh: number,
      dx: number, dy: number) {
      quads.push({ key: e.key, dx, dy });
    },
    texFromRegion(key: string) {
      regionKeys.push(`${flushed ? 'post:' : 'pre:'}${key}`);
      return entryOf(key);
    },
    texFromData() { return null; },
    texRefresh(key: string) {
      refreshKeys.push(`${flushed ? 'post:' : 'pre:'}${key}`);
      return entryOf(key);
    },
    texFromImage() { return null; },
    texAlive() { return true; },
  };
  return {
    quads, refreshKeys, regionKeys, entries,
    markFlushed: () => { flushed = true; },
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    },
  };
}

function mkScratch(w = 8, h = 8): HTMLCanvasElement {
  return { width: w, height: h } as unknown as HTMLCanvasElement;
}

describe('★变体①修复锁 N类:共享 scratch 1:N 消费（bakedTexMulti 帧内粘滞）', () => {
  it('一次 bake 十层消费:纹理上传在 bake 期（flush 前零 texRefresh）,各 rec 同键', () => {
    const { quads, refreshKeys, markFlushed, host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const ctx = ex.attachAcc();
    expect(ctx).toBeTruthy();
    const sc = mkScratch();
    // 女皇剑形态:一染 → 幻影 6 层 + 环晕 4 层同帧消费
    ex.uploadScratchNow(sc, 'empressTint:7');
    for (let i = 0; i < 10; i++) ctx!.drawImage(sc, i * 8, 0, 8, 8);
    expect(refreshKeys, 'bake 期 1 次 texRefresh,全部发生在 flush 前').toEqual(['pre:empressTint:7']);
    markFlushed();
    ex.flush();
    expect(quads.length, '十层全部发射').toBe(10);
    expect(new Set(quads.map((q) => q.key)).size, '十层共享同一次 bake 纹理（1:N 粘滞）').toBe(1);
    expect(refreshKeys.filter((k) => k.startsWith('post:')).length, 'flush 期零重传（preTex 直取）').toBe(0);
    ex.detach();
  });

  it('同帧多次异内容烘焙:键逐次异,各 rec 持各自 bake 纹理（单键回归=在此爆红）', () => {
    const { quads, refreshKeys, host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const ctx = ex.attachAcc();
    const sc = mkScratch();
    for (let i = 0; i < 4; i++) {
      ex.uploadScratchNow(sc, `dustTint:${i}`);
      ctx!.drawImage(sc, i * 8, 0, 8, 8);
    }
    ex.flush();
    expect(refreshKeys).toEqual(['pre:dustTint:0', 'pre:dustTint:1', 'pre:dustTint:2', 'pre:dustTint:3']);
    expect(new Set(quads.map((q) => q.key)).size, '四 rec 纹理互异（同键=先行 quad 被改写）').toBe(4);
    ex.detach();
  });

  it('跨帧账清零:frameReset 后无 bake 的 draw 不再挂上一帧 preTex', () => {
    const { quads, host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const ctx = ex.attachAcc();
    const sc = mkScratch();
    ex.uploadScratchNow(sc, 'dustTint:0');
    ctx!.drawImage(sc, 0, 0, 8, 8);
    ex.flush();
    // 次帧:frameReset（Renderer 窗口开时调）清粘滞账;无 bake 的 draw 走 dynamic/静态支
    ex.frameReset();
    const quads0 = quads.length;
    ctx!.drawImage(sc, 8, 0, 8, 8);
    ex.flush();
    const newQuad = quads[quads0];
    expect(newQuad).toBeTruthy();
    expect(newQuad.key, '跨帧残留账=陈旧 preTex 直取（必须落 dynamic 刷新支）').not.toBe('dustTint:0');
    ex.detach();
  });
});

describe('★变体①修复锁 纪元键:矩形回收覆写后 er: 键换代', () => {
  it('epoch 参与 JS 侧命中判定+GL 键:bump 后同矩形重传新键,未 bump 静态源键零变化', () => {
    const { regionKeys, quads, host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const ctx = ex.attachAcc();
    const page = mkScratch(64, 64);
    const id = texId(page);
    // 首绘矩形 (0,0,32,32)——epoch 0 键与旧版逐字同（零回归面）
    ctx!.drawImage(page, 0, 0, 32, 32, 0, 0, 32, 32);
    ex.flush();
    expect(regionKeys[0]).toBe(`pre:er:${id}:0:0,0,32,32`);
    expect(quads.length).toBe(1);
    // 未 bump 重绘（静态源常态）:JS 侧命中,零重传零新键
    const rk0 = regionKeys.length;
    ctx!.drawImage(page, 0, 0, 32, 32, 8, 0, 32, 32);
    ex.flush();
    expect(regionKeys.length, '静态源命中不重传').toBe(rk0);
    // bump（=TintAtlas 回收矩形覆写后）:同矩形换键重传
    bumpTexEpoch(page);
    expect(texEpoch(page)).toBe(1);
    ctx!.drawImage(page, 0, 0, 32, 32, 16, 0, 32, 32);
    ex.flush();
    expect(regionKeys[regionKeys.length - 1]).toBe(`pre:er:${id}:1:0,0,32,32`);
    ex.detach();
  });
});

describe('★变体①修复锁 TintAtlas:回收矩形 bump 页纪元', () => {
  it('fresh 分配（shelf/新页）不 bump;free-list 回收分配 blit 后 bump', () => {
    // node 无 DOM——最小 canvas 桩仅本测试窗（b2b-worldcanvas-retire 判例同式）
    const ctxStub = () => ({
      clearRect: () => {}, drawImage: () => {}, fillRect: () => {},
      globalCompositeOperation: 'source-over', fillStyle: '#000',
    });
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() }),
    };
    try {
      const ta = new TintAtlas();
      const paint = (cx: CanvasRenderingContext2D): void => { cx.fillRect(0, 0, 4, 4); };
      const a = ta.bake('A', 16, 16, paint);
      expect(a).toBeTruthy();
      expect(texEpoch(a!.c), 'shelf 新区=纯分配,零 bump').toBe(0);
      // drop → free-list → 同尺寸再分配 = 回收覆写
      ta.drop('A');
      const b = ta.bake('B', 16, 16, paint);
      expect(b).toBeTruthy();
      expect(b!.c).toBe(a!.c);
      expect(texEpoch(b!.c), '回收矩形=原地覆写,必须 bump 页纪元（否则 GL 缓存首帧冻结）').toBe(1);
      // 二次回收继续递增
      ta.drop('B');
      ta.bake('C', 16, 16, paint);
      expect(texEpoch(b!.c)).toBe(2);
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  });
});

describe('★变体①修复锁 源级锁:各共享 scratch 烘焙点逐次上传接线在位', () => {
  it('Renderer.uploadScratchBake 助手（家族独立环形序号;★R3b-6 帧界重置+触帧账;★P1-B 子区参透传）在位', () => {
    // ★2026-09-28 锚重产:签 名扩可选子区参 (rw,rh)（bolt 链携 bbox 走 p1bRegionGate
    //  分档;不带参的家族调用点语义零变化）
    expect(RDR).toContain('uploadScratchBake(img: HTMLCanvasElement, fam: string, ring: number, rw?: number, rh?: number,\n    preBytes?: ImageData): void {');   // ★P0 去画布化:preBytes 直挂
    expect(RDR).toContain('this.scratchBakeSeqs.set(fam, { n, f });');
    expect(RDR).toContain('sh.uploadScratchNow(img, `${fam}:${n % ring}`, rw, rh, preBytes);');
  });

  it('尘族 s1/s2 三烘焙点（dustTint/dustColor/dustDye）逐尘即刻上传;★R3b-1:环=池上界 6000', () => {
    expect(RDR).toContain("this.uploadScratchBake(s1, 'dustTint', Renderer.DUST_BAKE_RING, undefined, undefined, ida)");   // ★P0:ida 直挂零拷贝
    expect(RDR).toContain("this.uploadScratchBake(s2, 'dustColor', Renderer.DUST_BAKE_RING, undefined, undefined, idc)");   // ★P0:idc 直挂零拷贝
    expect(RDR).toContain("this.uploadScratchBake(s2, 'dustDye', Renderer.DUST_BAKE_RING, undefined, undefined, idd)");   // ★P0:idd 直挂零拷贝
    expect(RDR).toContain('private static readonly DUST_BAKE_RING = 6000;');
  });

  it('飞灵 sil/tint 双面逐层上传（drawLeashedFaeling/drawFaeling 共用层函数）', () => {
    expect(RDR).toContain("this.uploadScratchBake(silC, 'faelingSil', 256);");
    expect(RDR).toContain("this.uploadScratchBake(tintC, 'faelingTint', 256);");
  });

  it('月总光地板/亮度藤逐部件逐段上传', () => {
    expect(RDR).toContain("this.uploadScratchBake(scratch, 'mlfloor', 16);");
    expect(RDR).toContain("this.uploadScratchBake(scratch, `bv:${e.id}`, 512);");
  });

  it('wingTintScratch 四烘焙口（dyeScratch/addScratch/extra38/arkhalis）终内容上传', () => {
    expect(RDR.match(/this\.uploadScratchBake\(sc, 'wingTint', 128\);/g)?.length).toBe(4);
  });

  it('mountTintScratch 三烘焙口（猪鲨崽液染/61增亮/61辉层）终内容上传', () => {
    expect(RDR.match(/this\.uploadScratchBake\(c, 'mountTint', 64\);/g)?.length).toBe(3);
  });

  it('女皇剑 HUE_TINT 逐剑上传（1:N 消费+环形键）', () => {
    expect(MINION).toContain('r.markWorldDynamicScratch?.(tinted, `empressTint:${empressTintSeq++ % 64}`);');
  });

  it('shim:frameReset 清粘滞账+resolveTex 纪元命中判定+纪元键在位', () => {
    expect(SHIM).toContain('this.bakedTexMulti.clear();');
    expect(SHIM).toContain('if (hit && hit.ep === ep && glw.texAlive(hit.e)) {');
    expect(SHIM).toContain('const key = `er:${id}:${ep}:${p.sx},${p.sy},${p.sw},${p.sh}`;');
  });

  it('TintAtlas:回收矩形 blit 后 bumpTexEpoch 在位', () => {
    expect(TATLAS).toContain('if (recycled) bumpTexEpoch(page.cv);');
    expect(TATLAS).toContain('private alloc(w: number, h: number): [Page, number, number, boolean] | null {');
  });
});
