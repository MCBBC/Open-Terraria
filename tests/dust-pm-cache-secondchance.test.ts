// ★dustrb 尘预乘缓存二次机会代际 LRU 守卫（2026-09-28 尘 premul 链性能刀）。
// 背景：海盗入侵 trace（trace-x-ray /tmp/trace-pirate.digest.json）dustPmCacheTouch
// self 1198.5ms/39.9s=主线程 2.91%——命中重插式 touch（delete+set）在尘量大时是纯
// 开销（构成定谳：~1450 尘负载 4170 pair/帧,旧臂 4164 次 Map 结构删/帧,真 miss 仅
// ~15/帧,cache 907«2048 上限=LRU 记账无逐出可服务）。?dustrb=1 灰度改二次机会：
// 命中=单属性写 gen=1;溢出走 dustPmCacheEvictGen（gen=1 降 0 保留一轮,gen=0 逐出）。
// 钉死四面：①evictGen 策略本体（最旧先出/热键幸存/二次机会过期/≤max 零操作/两圈界）
// ②旗面接线（开=命中零 Map 结构操作+entry.gen=1;关=旧 touch 逐位保留）
// ③结构锁（源码锚+旗面缺省关）④drawDustPremul 出口复位省略的旗面分支在位。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dustPmCacheEvictGen, dustPmCacheEvict, dustPmCacheTouch, DUST_PM_CACHE_MAX, DUST_PM_GEN_HOT,
} from '../src/fx/VanillaDust';
import { Renderer } from '../src/render/Renderer';

type Ent = { id: number; gen?: number };
const mk = (n: number): Map<string, Ent> => {
  const m = new Map<string, Ent>();
  for (let i = 0; i < n; i++) m.set(`k${i}`, { id: i });
  return m;
};

describe('dustPmCacheEvictGen 策略本体（二次机会代际 LRU）', () => {
  it('全冷（gen 空）=最旧先出,逐出量与旧 evict 同（1/4）', () => {
    const m = mk(2100);
    dustPmCacheEvictGen(m);
    expect(m.size).toBe(2100 - (2100 >> 2));            // 1575——与 dustPmCacheEvict 同量
    expect(m.has('k0')).toBe(false);                    // 最旧先出
    expect(m.has(`k${(2100 >> 2) - 1}`)).toBe(false);   // 逐出窗末
    expect(m.has(`k${2100 >> 2}`)).toBe(true);          // 窗后首个幸存
    expect(m.has('k2099')).toBe(true);                  // 最新档全保留
  });

  it('热键（gen=1）第一轮幸存（降 0 保留）,冷键先出', () => {
    const m = mk(DUST_PM_CACHE_MAX + 1);                // 2049>2048
    m.get('k0')!.gen = DUST_PM_GEN_HOT;                 // 最旧键标热（=命中 gen 写）
    dustPmCacheEvictGen(m);                             // 逐 512
    expect(m.has('k0')).toBe(true);                     // 热键幸存（金标不变式保持）
    expect(m.get('k0')!.gen).toBe(0);                   // 已降级（二次机会耗尽一轮）
    expect(m.has('k1')).toBe(false);                    // 未访问旧键先出
    expect(m.size).toBe(DUST_PM_CACHE_MAX + 1 - 512);
  });

  it('二次机会过期:降级后未再触,再溢出时首当其冲被逐（热键不永久豁免）', () => {
    const m = mk(DUST_PM_CACHE_MAX + 1);
    m.get('k0')!.gen = DUST_PM_GEN_HOT;
    dustPmCacheEvictGen(m);                             // 第一轮:k0 降 0 幸存
    expect(m.has('k0')).toBe(true);
    // 再溢出（≤max 时 evictGen 零操作——逐出只在溢出沿触发）
    for (let i = 0; i < 600; i++) m.set(`j${i}`, { id: 10000 + i });
    expect(m.size).toBeGreaterThan(DUST_PM_CACHE_MAX);
    dustPmCacheEvictGen(m);                             // k0 已冷且最旧 → 逐出窗首
    expect(m.has('k0')).toBe(false);
    expect(m.has('k1')).toBe(false);                    // 同窗冷键一并先出
  });

  it('全热场景两圈有界:第一圈全降级,第二圈逐满 target', () => {
    const m = mk(2100);
    for (const v of m.values()) v.gen = DUST_PM_GEN_HOT;
    dustPmCacheEvictGen(m);
    expect(m.size).toBe(2100 - (2100 >> 2));            // 必逐满 1/4（两圈内）
    expect(m.has('k0')).toBe(false);                    // 最旧先出（第二圈从头扫）
    // 幸存者全部已降级（无永久热位）
    for (const v of m.values()) expect(v.gen).toBe(0);
  });

  it('≤max 零操作且顺序不变', () => {
    const m = new Map<string, Ent>([['a', { id: 1 }], ['b', { id: 2 }]]);
    dustPmCacheEvictGen(m);
    expect([...m.keys()]).toEqual(['a', 'b']);
    expect(m.get('a')).toEqual({ id: 1 });              // gen 未被写入（零触碰）
  });

  it('旧策略仍在位可对照:touch 重插语义 + evict 同量逐出（旗关路径的本体不变）', () => {
    const m = mk(DUST_PM_CACHE_MAX + 1);
    dustPmCacheTouch(m, 'k0');
    dustPmCacheEvict(m);
    expect(m.has('k0')).toBe(true);                     // 旧 touch 热键幸存
    expect(m.size).toBe(DUST_PM_CACHE_MAX + 1 - 512);
  });
});

// ---------------------------------------------------------------------------
// 旗面接线（Renderer.dustPremulPair 命中支）——node 环境无 canvas,桩
// document.createElement（同 dust-premultiplied-blend.test.ts 接线测桩口径）,
// CountingMap 计 Map 结构操作:开=命中零 delete/set;关=旧 touch delete+set。
// ---------------------------------------------------------------------------
describe('dustrb 旗面接线（dustPremulPair 命中支 + evict 分派）', () => {
  afterEach(() => {
    Renderer.dustrbSetForTest(false);
    vi.unstubAllGlobals();
  });

  function stubDoc() {
    const px = new Uint8ClampedArray(8 * 8 * 4);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 8, height: 8,
        getContext: () => ({
          clearRect: () => {}, drawImage: () => {}, putImageData: () => {},
          getImageData: () => ({ data: px, width: 8, height: 8 }),
          createImageData: () => ({ data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 }),
        }),
      }),
    });
  }

  function countingSelf() {
    const ops = { get: 0, set: 0, freshSet: 0, del: 0 };
    class CM extends Map<string, unknown> {
      get(k: string) { ops.get++; return super.get(k); }
      set(k: string, v: unknown) { if (!super.has(k)) ops.freshSet++; ops.set++; return super.set(k, v); }
      delete(k: string) { const had = super.delete(k); if (had) ops.del++; return had; }
    }
    // 预装 CountingMap（dustPremulPair 的 ??= 只在 null 时新建——计数器必须在场）
    return { self: { dustPmCache: new CM() as Map<string, unknown>, dustPmBake: null }, ops };
  }

  const pairFn = (Renderer.prototype as unknown as {
    dustPremulPair: (this: unknown, img: CanvasImageSource, fx: number, fy: number,
      mr: number, mg: number, mb: number, ma: number) => { add: unknown; erase: unknown; gen?: number };
  }).dustPremulPair;
  const call = (self: unknown, fx: number) => pairFn.call(self, {} as CanvasImageSource, fx, 0, 0.5, 0.5, 0.5, 0.1);

  it('旗开:首次 miss 烘焙（freshSet=1,entry.gen=1）,再命中零 Map 结构操作（无 delete/set）', () => {
    stubDoc();
    Renderer.dustrbSetForTest(true);
    const { self, ops } = countingSelf();
    const first = call(self, 0);
    expect(ops.freshSet).toBe(1);
    expect(first.gen).toBe(DUST_PM_GEN_HOT);            // 新烘焙档=热
    ops.get = 0; ops.set = 0; ops.freshSet = 0; ops.del = 0;
    const second = call(self, 0);
    expect(second).toBe(first);                         // 命中同对象
    expect(ops.get).toBe(1);                            // 仅查表一次
    expect(ops.del).toBe(0);                            // ★无 touch 重插（旧臂=1）
    expect(ops.set).toBe(0);                            // ★零重插
    expect(second.gen).toBe(DUST_PM_GEN_HOT);           // 命中再标热
  });

  it('旗关:命中触发旧 touch（delete+set 各 1）,不写 gen', () => {
    stubDoc();
    Renderer.dustrbSetForTest(false);
    const { self, ops } = countingSelf();
    const first = call(self, 0);
    expect(ops.freshSet).toBe(1);
    expect(first.gen).toBe(DUST_PM_GEN_HOT);            // 形恒带 gen（旗关不读,零害）
    ops.get = 0; ops.set = 0; ops.freshSet = 0; ops.del = 0;
    call(self, 0);
    expect(ops.get).toBe(2);                            // pair 查 1 + touch 查 1
    expect(ops.del).toBe(1);                            // 旧 touch delete
    expect(ops.set).toBe(1);                            // 旧 touch set（重插）
  });

  it('旗开溢出:evictGen 分派在位（超限不整体清空,稳态有界）', () => {
    stubDoc();
    Renderer.dustrbSetForTest(true);
    const { self } = countingSelf();
    for (let i = 0; i < DUST_PM_CACHE_MAX + 300; i++) call(self, i);
    const size = (self.dustPmCache as Map<string, unknown>).size;
    expect(size).toBeGreaterThan(0);                    // 溢出不清空全部
    expect(size).toBeLessThanOrEqual(DUST_PM_CACHE_MAX + 2);   // 稳态有界
  });
});

// ---------------------------------------------------------------------------
// 结构锁：旗面缺省关 + 源码锚（dustrb 总闸/命中支/evict 分派/出口复位分支）
// ---------------------------------------------------------------------------
describe('dustrb 结构锁（缺省关=用户明令灰度,禁转正）', () => {
  const src = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
  const vdSrc = readFileSync(new URL('../src/fx/VanillaDust.ts', import.meta.url), 'utf8');

  it('旗面:转正缺省开（!==0 逃生门）+SetForTest 翻面钩在位（2026-09-29 用户拍板）', () => {
    expect(src).toContain("new URLSearchParams(location.search).get('dustrb') !== '0'");
    expect(src).toContain('static dustrbSetForTest(v: boolean): void');
    // 缺省开的负证:node/worker 判死仍在（document 判死家族）
    expect(src).toContain("?dustrb=0=逃生门");
  });

  it('命中支:gen 标记与旧 touch 双支并存（旗面分派）,evict 双分派在位', () => {
    expect(src).toContain('if (Renderer.dustrb) hit.gen = 1;');
    expect(src).toContain('else dustPmCacheTouch(this.dustPmCache, key);   // LRU 访问序');
    expect(src).toContain('if (Renderer.dustrb) dustPmCacheEvictGen(this.dustPmCache);');
    expect(src).toContain('else dustPmCacheEvict(this.dustPmCache);   // 分代 LRU:超 2048 逐最旧 1/4(非整体清空)');
  });

  it('entry 形恒带 gen（两态同构,命中支属性写不退化字典态）', () => {
    expect(src).toContain('const entry = { add: addC, erase: eraseC, glb: baked.gl, gen: 1 };');
    expect(src).toContain('private dustPmCache: Map<number, { add: HTMLCanvasElement; erase: HTMLCanvasElement; glb?: Uint8Array; gen?: number }> | null = null;');
  });

  it('drawDustPremul 出口复位旗面分支在位（关=旧出口复位逐位保留）', () => {
    expect(src).toContain('if (!Renderer.dustrb) {\n      ctx.globalCompositeOperation = \'source-over\';\n      ctx.globalAlpha = 1;\n    }');
  });

  it('策略本体导出与文档锚在位（evictGen/GEN_HOT/两圈界）', () => {
    expect(vdSrc).toContain('export function dustPmCacheEvictGen');
    expect(vdSrc).toContain('export const DUST_PM_GEN_HOT = 1;');
    expect(vdSrc).toContain('for (let lap = 0; lap < 2 && evicted < target; lap++)');
  });
});
