// ★E51b（2026-10-07）2D fallback 键域收界守卫——E51 诚实边界登记债清偿:
//  旧 ghostAdd fallback 的 fbKey 键带未量化 tq（ai1 相位真值,逐帧漂移）→ 键域无界
//  （2D 会话实测 600 帧 9277 新键/15.5 每帧、emp 族 3766 distinct、4 页图集≈17-28 槽
//  99.7% 回收率整体冲刷,稳定键 empW/empG/hb 级联重烘=35% 级联税,880MB 烘焙字节）。
//  修=逐调私有 scratch 现烘现画（empGhostTinted,tintedSprite 同配方同字节）→ 零键
//  零图集零 LRU 压力;GL 在场帧 uploadScratchBake 环窗直传（bolt/尘族判例,环 64≥
//  帧内上限）。修案证伪史:加色主部分解（Σw≠1 凸分解）被同帧 A/B 证伪——'lighter'
//  连 α 通道一起累加,α 过冲 maxCh=49（45025px 差）→ 单 draw 语义不可分解。
//  锁:①empGhostTinted 行为面（op 序=sprite→multiply fill→destination-in sprite,
//  状态复位/grow-only 16 对齐/256 上限=旧 MAX_ENTRY 同界）②fallback 接线+环窗直传
//  ③twoPass scratch 消费面（只取 (0,0,w,h) 区）④默认路径无 tq 键+逃生门链保留。
//  像素级对拍=node 无 canvas 不入本锁,探针活机覆盖（scripts/_e51b-ab.mjs + xray7）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Renderer } from '../src/render/Renderer';

const RENDERER = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');

/** 录制型 2D ctx 桩（op 序取证）。 */
function recordingCtx() {
  const ops: string[] = [];
  let gco = 'source-over';
  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    drawImage: (...a: unknown[]) => ops.push(`draw:${gco}:${a.length}`),
    fillRect: (_x: number, _y: number, w: number, h: number) => ops.push(`fill:${gco}:${w}x${h}`),
    clearRect: (_x: number, _y: number, w: number, h: number) => ops.push(`clear:${w}x${h}`),
    setTransform: () => ops.push('xform'),
    get globalCompositeOperation() { return gco; },
    set globalCompositeOperation(v: string) { gco = v; ops.push(`gco:${v}`); },
    get globalAlpha() { return 1; },
    set globalAlpha(_v: number) { ops.push('alpha'); },
    get imageSmoothingEnabled() { return false; },
    set imageSmoothingEnabled(_v: boolean) { ops.push('smooth'); },
    set fillStyle(_v: string) { ops.push('style'); },
  };
  return { ctx, ops };
}

describe('★E51b empGhostTinted 逐调 scratch 烘焙（行为面）', () => {
  it('op 序=tintedSprite 同配方:clear→draw→multiply fill→destination-in draw（字节恒等根据）', () => {
    const { ctx, ops } = recordingCtx();
    const fakeDoc = {
      createElement: () => {
        const cv: { width: number; height: number; getContext: () => unknown } = {
          width: 0, height: 0, getContext: () => { (ctx as { canvas: unknown }).canvas = cv; return ctx; },
        };
        return cv;
      },
    };
    const prev = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = fakeDoc;
    try {
      const r = Object.create(Renderer.prototype) as unknown as {
        empGhostTinted: (i: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, t: readonly [number, number, number]) => HTMLCanvasElement | null;
      };
      const img = { tag: 'sheet' } as unknown as CanvasImageSource;
      const cv = r.empGhostTinted(img, 10, 20, 195, 111, [128, 255, 106]);
      expect(cv).toBeTruthy();
      // op 序:状态复位(xform)→clear→smooth→draw(SO)→gco multiply→style→fill→
      //       gco destination-in→draw→gco source-over（与 tintedSprite paint 逐行同配方）
      expect(ops).toEqual([
        'xform', 'gco:source-over', 'alpha', 'clear:195x111', 'smooth',
        'draw:source-over:9', 'gco:multiply', 'style', 'fill:multiply:195x111',
        'gco:destination-in', 'draw:destination-in:9', 'gco:source-over',
      ]);
      expect(cv!.width).toBe(208);   // ceil(195/16)*16=208,grow-only 16 对齐
      expect(cv!.height).toBe(112);  // ceil(111/16)*16=112
    } finally {
      if (prev === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prev;
    }
  });

  it('grow-only:小区域不缩已扩画布;256 上限=旧 tintedSprite MAX_ENTRY 同界(超界=旧链 null→none 同语义)', () => {
    const sizes: Array<[number, number]> = [];
    const fakeDoc = {
      createElement: () => {
        const cv: { width: number; height: number; getContext: () => unknown } = {
          width: 0, height: 0, getContext: () => ctxR,
        };
        return cv;
      },
    };
    const { ctx: ctxR } = recordingCtx();
    const prev = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = fakeDoc;
    try {
      const r = Object.create(Renderer.prototype) as unknown as {
        empGhostTinted: (i: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, t: readonly [number, number, number]) => HTMLCanvasElement | null;
      };
      const img = {} as unknown as CanvasImageSource;
      r.empGhostTinted(img, 0, 0, 32, 32, [1, 2, 3]);
      sizes.push([32, 32]);
      r.empGhostTinted(img, 0, 0, 20, 16, [1, 2, 3]);   // 更小:不缩（grow-only）
      sizes.push([32, 32]);
      const big = r.empGhostTinted(img, 0, 0, 300, 300, [1, 2, 3]);  // >256 仍建面（无 bake 上限概念,draw 区外不取）
      sizes.push([big!.width, big!.height]);
      expect(sizes[0]).toEqual([32, 32]);
      expect(sizes[1]).toEqual([32, 32]);
      expect(sizes[2][0]).toBeLessThanOrEqual(256);
      expect(sizes[2][1]).toBeLessThanOrEqual(256);
    } finally {
      if (prev === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prev;
    }
  });
});

describe('★E51b fallback 接线（结构锁）', () => {
  it('empGhostScratchOff 旗（?empscratch=0）+ 逐调 scratch 支 + uploadScratchBake 环窗直传', () => {
    expect(RENDERER).toContain('static empGhostScratchOff');
    expect(RENDERER).toMatch(/empGhostScratchOff = typeof location !== 'undefined'\s*\?\s*new URLSearchParams\(location\.search\)\.get\('empscratch'\) === '0' : false/);
    expect(RENDERER).toMatch(/if \(!Renderer\.empGhostScratchOff\) \{\s*\n\s*const cv = this\.empGhostTinted\(img, sx, sy, sw, sh, tint\);\s*\n\s*if \(!cv\) return \{ kind: 'none' \};\s*\n\s*this\.uploadScratchBake\(cv, 'empGhostTint', 64, sw, sh\);\s*\n\s*return \{ kind: 'scratch', cv, w: sw, h: sh \};/);
  });

  it('twoPass scratch 消费面:单笔绘制(α=旧链恒等),只取 (0,0,w,h) 区(区外陈旧像素不取)', () => {
    expect(RENDERER).toMatch(/else if \(add\.kind === 'scratch'\) \{[^}]*globalAlpha = Math\.max\(0, Math\.min\(1, addA\)\);[^}]*drawImage\(add\.cv, 0, 0, add\.w, add\.h, dx, dy, dw, dh\);/s);
    expect(RENDERER).toContain("else if (add.kind === 'tinted')");
  });

  it('★键漂移面根治:调用点不再传 fbKey,默认路径无 tq 键构造;旧链仅存于逃生门后', () => {
    expect(RENDERER).toMatch(/ghostAdd\(L\.src\.img, L\.src\.sx, L\.idx \* fh, L\.src\.sw, fh,\s*\n\s*`empGhostCut\|\$\{L\.src\.sx\}x\$\{L\.src\.sw\}x\$\{L\.src\.sh\}\|\$\{L\.idx \* fh\}`\)\)/);
    expect(RENDERER).not.toContain('const tq = `${tint[0]},${tint[1]},${tint[2]}`');
    const gate = RENDERER.indexOf('if (!Renderer.empGhostScratchOff) {');
    const fbLine = RENDERER.indexOf('const fbKey = `emp|${cutKey.replace');
    expect(gate).toBeGreaterThan(0);
    expect(fbLine).toBeGreaterThan(gate);
  });

  it('默认路径零 TintAtlas 新键:scratch 支不触 tintedSprite;环 64 ≥ 帧内上限(实测 max 36)+余量', () => {
    const scratchBlock = RENDERER.slice(
      RENDERER.indexOf('if (!Renderer.empGhostScratchOff) {'),
      RENDERER.indexOf('const fbKey = `emp|${cutKey.replace'),
    );
    expect(scratchBlock).not.toContain('tintedSprite');
    expect(scratchBlock).toContain("uploadScratchBake(cv, 'empGhostTint', 64, sw, sh)");
  });
});
