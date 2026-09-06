// SW-AX1 2026-09-06 角色创建"随机外观"列表更新延迟 收口回归锚。
// 定谳(scripts/_cc-ax1-latency.mjs,SW_ORIGIN 私有实例实测):
//   look 随机 38-50ms = ensure 缺口(新变体懒载 13-16ms) + 整表 20 帧白烘(9-14ms)
//     + toDataURL 同步编码(10-14ms) + 双烘第二轮余波;
//   hair 重烘 626ms = 213 格整表合成 ~400ms + setTimeout(0) 钳制税 27ms
//     + toDataURL(440×968) 同步编码 85ms。
// 本文件锚定四类收口,防回写:
//   ① 单飞(直调+scheduleSheetBake(0) 双入口折叠;连点/拖色防抖期间只一次烘在飞)
//   ② 双烘消除+sheet 异步编码+单帧行模式(源码锚)
//   ③ 让出策略不回退(MessageChannel 零钳制+时间预算自适应批,213 格每批界必让出)
//   ④ loading 态挂/摘时序(DelayedMask:首访立即、重烘延迟 120ms、快烘不闪)
// 纯逻辑(node 环境),无 DOM 依赖。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  yieldTask, nextBatchSize, bakeCells, SingleFlightBake, DelayedMask,
  canvasToUrl, isObjectUrl, BAKE_MASK_DELAY_MS,
} from '../src/ui/charBake';

// ---------- ① yieldTask:零钳制让出(setTimeout(0) 嵌套 ≥5 层 4ms/次的解药) ----------
describe('yieldTask(MessageChannel 零钳制让出)', () => {
  it('40 次串行让出远快于 setTimeout(0) 嵌套钳制链(钳制下 ≥35×4=140ms)', async () => {
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) await yieldTask();
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(80);
  });

  it('返回独立 Promise,可并发等待', async () => {
    let done = 0;
    await Promise.all([yieldTask().then(() => done++), yieldTask().then(() => done++)]);
    expect(done).toBe(2);
  });
});

// ---------- ② nextBatchSize:时间预算自适应批规划 ----------
describe('nextBatchSize(批大小规划器)', () => {
  it('超预算按比例缩(24 格耗 48ms、预算 7 → 24×7/48=3.5→min)', () => {
    expect(nextBatchSize(24, 48, 7, 6, 32)).toBe(6);
  });

  it('富余 ×1.5 扩,双端钳制', () => {
    expect(nextBatchSize(8, 1, 7, 6, 32)).toBe(12);   // 1ms 批=大幅富余 → 8×1.5
    expect(nextBatchSize(24, 1, 7, 6, 32)).toBe(32);  // 扩到 max
    expect(nextBatchSize(40, 100, 7, 6, 32)).toBe(6); // 缩到 min
  });

  it('非正耗时/非正批 → 原样返回(除零守卫)', () => {
    expect(nextBatchSize(24, 0, 7, 6, 32)).toBe(24);
    expect(nextBatchSize(0, 10, 7, 6, 32)).toBe(0);
  });
});

// ---------- ③ bakeCells:213 格在 N 批内完成且每批界必让出 ----------
describe('bakeCells(213 格分批+每批界让出)', () => {
  it('213 格(2026-08-27 发型页格数)全数绘制、保序、批间全让出', async () => {
    const drawn: number[] = [];
    const batchStarts: number[] = [];
    let cursor = -1;
    const res = await bakeCells(
      Array.from({ length: 213 }, (_, i) => i),
      (item, index) => {
        if (index !== cursor + 1) batchStarts.push(index);   // 新批起点
        cursor = index;
        drawn.push(index);
      },
    );
    expect(drawn).toHaveLength(213);
    expect(drawn[0]).toBe(0);
    expect(drawn[212]).toBe(212);
    // 每批界必让出:yields === batches-1(让出策略不回退的核心不变量)
    expect(res.yields).toBe(res.batches - 1);
    expect(batchStarts.length).toBe(res.batches - 1);
    // 零耗绘制下自适应批迅速到顶,总批数有限(曾固定 24/批 → 9 批)
    expect(res.batches).toBeLessThanOrEqual(10);
  });

  it('重绘制(≈1ms/格)下批大小收敛到预算量级,任务不退化为整段阻塞', async () => {
    const spin = (ms: number) => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } };
    const batchDur: number[] = [];
    let last = performance.now();
    const res = await bakeCells(
      Array.from({ length: 64 }, (_, i) => i),
      () => spin(1),
      { budgetMs: 7 },
      // 批界由 yields 反映;批耗时在本测试侧用时间戳差近似
    ).then(async (r) => {
      void batchDur; void last;
      return r;
    });
    expect(res.yields).toBe(res.batches - 1);
    // 64 格 × 1ms、预算 7ms → 批均 ≥ 5 格(批数 ≤ 13);且不让出批数=0
    expect(res.batches).toBeLessThanOrEqual(13);
    expect(res.batches).toBeGreaterThanOrEqual(3);
  });

  it('shouldAbort 中止门:面板关闭形态下提前返回,不再绘制', async () => {
    let drawn = 0;
    let batches = 0;
    const res = await bakeCells(
      Array.from({ length: 100 }, (_, i) => i),
      () => { drawn++; },
      { shouldAbort: () => batches >= 2 },
    );
    // bakeCells 内批计数先于 abort 检查递增——用返回值旁证中止
    batches = res.batches;
    expect(res.batches).toBeLessThan(100);
    expect(drawn).toBeLessThan(100);
    expect(drawn).toBeGreaterThan(0);
  });

  it('空列表零批零让出', async () => {
    const res = await bakeCells([], () => { /* 无 */ });
    expect(res).toEqual({ batches: 0, yields: 0 });
  });
});

// ---------- ④ SingleFlightBake:单飞折叠 + 快照键尾随重烘 ----------
describe('SingleFlightBake(双烘消除)', () => {
  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it('飞行中的重复请求折叠为同一 Promise(run 只跑一次)', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'A';
    const sf = new SingleFlightBake(() => { runs++; return runs === 1 ? d.promise : Promise.resolve(); }, () => key);
    const p1 = sf.request();
    const p2 = sf.request();
    const p3 = sf.request();
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);
    expect(runs).toBe(1);
    d.resolve();
    await p1;
    expect(runs).toBe(1);   // 同态快照键:不尾随重烘(直调+schedule(0) 双入口折叠)
  });

  it('飞行中快照键变化 → 落地后自动尾随重烘(连点随机语义)', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'A';
    const sf = new SingleFlightBake(() => { runs++; return runs === 1 ? d.promise : Promise.resolve(); }, () => key);
    void sf.request();
    key = 'B';                       // 飞行中外观被第二次随机改写
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(2);            // 尾随重烘自动起飞
    expect(sf.inFlight).toBe(false);
  });

  it('cancel 吞尾随重烘(面板关闭形态)', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'A';
    const sf = new SingleFlightBake(() => { runs++; return runs === 1 ? d.promise : Promise.resolve(); }, () => key);
    void sf.request();
    key = 'B';
    sf.cancel();
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);
  });

  it('alive()=false 不尾随(runBakeSheets 传入 isConnected)', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'A';
    let alive = true;
    const sf = new SingleFlightBake(() => { runs++; return runs === 1 ? d.promise : Promise.resolve(); }, () => key, () => alive);
    void sf.request();
    key = 'B';
    alive = false;
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);
  });

  it('run 抛错不放大:落地后按快照键判定尾随', async () => {
    let runs = 0;
    let key = 'A';
    const sf = new SingleFlightBake(() => {
      runs++;
      return runs === 1 ? Promise.reject(new Error('bake fail')) : Promise.resolve();
    }, () => key);
    void sf.request();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);            // 同态不尾随;异常被单飞吞掉(retry 链兜底)
  });
});

// ---------- ⑤ DelayedMask:loading 态挂/摘时序 ----------
describe('DelayedMask(loading 态)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('首访(无旧图)立即挂载', () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const m = new DelayedMask(BAKE_MASK_DELAY_MS, (on) => seen.push(on));
    m.arm(true);
    expect(seen).toEqual([true]);
    m.disarm();
    expect(seen).toEqual([true, false]);
  });

  it(`重烘延迟挂载:快烘(<${BAKE_MASK_DELAY_MS}ms)不闪,慢烘可见`, () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const m = new DelayedMask(BAKE_MASK_DELAY_MS, (on) => seen.push(on));
    m.arm(false);
    vi.advanceTimersByTime(BAKE_MASK_DELAY_MS - 1);
    expect(seen).toEqual([]);            // 快烘在延迟窗内完成 → 全程无遮罩
    m.disarm();
    expect(seen).toEqual([]);
    // 慢烘:越窗才挂
    m.arm(false);
    vi.advanceTimersByTime(BAKE_MASK_DELAY_MS);
    expect(seen).toEqual([true]);
    m.disarm();
    expect(seen).toEqual([true, false]);
  });

  it('等待期重复 arm 幂等;shown 后重复 arm 不再发 apply', () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const m = new DelayedMask(BAKE_MASK_DELAY_MS, (on) => seen.push(on));
    m.arm(false);
    m.arm(false);
    m.arm(false);
    vi.advanceTimersByTime(BAKE_MASK_DELAY_MS);
    expect(seen).toEqual([true]);
    m.arm(false);
    m.arm(true);
    expect(seen).toEqual([true]);
  });

  it('disarm 在等待期取消定时(烘完不残留迟挂)', () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const m = new DelayedMask(BAKE_MASK_DELAY_MS, (on) => seen.push(on));
    m.arm(false);
    m.disarm();
    vi.advanceTimersByTime(BAKE_MASK_DELAY_MS * 3);
    expect(seen).toEqual([]);
  });
});

// ---------- ⑥ canvasToUrl / isObjectUrl ----------
describe('canvasToUrl(toBlob 异步编码优先,toDataURL 兜底)', () => {
  it('toBlob 可用 → objectURL;isObjectUrl 识别', async () => {
    let invoked = false;
    const fake = {
      toBlob: (cb: (b: Blob | null) => void, type?: string) => {
        invoked = true;
        expect(type).toBe('image/png');
        cb(new Blob(['x'], { type: 'image/png' }));
      },
    } as unknown as HTMLCanvasElement;
    const url = await canvasToUrl(fake);
    expect(invoked).toBe(true);
    expect(isObjectUrl(url)).toBe(true);
    URL.revokeObjectURL(url);
  });

  it('toBlob 缺失(jsdom/node 形态) → toDataURL 兜底', async () => {
    const fake = { toDataURL: () => 'data:image/png;base64,AA==' } as unknown as HTMLCanvasElement;
    const url = await canvasToUrl(fake);
    expect(url.startsWith('data:')).toBe(true);
    expect(isObjectUrl(url)).toBe(false);
  });

  it('toBlob 回调 null(编码失败) → 兜底 dataURL', async () => {
    const fake = {
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
      toDataURL: () => 'data:image/png;base64,BB==',
    } as unknown as HTMLCanvasElement;
    expect(await canvasToUrl(fake)).toBe('data:image/png;base64,BB==');
  });
});

// ---------- ⑦ 源码回归锚(CharCreation.ts 收口不回写) ----------
describe('CharCreation 源码锚(SW-AX1 收口点)', () => {
  const src = readFileSync(new URL('../src/ui/CharCreation.ts', import.meta.url), 'utf8');

  it('单飞:bakeSheets 唯一入口=bakeRunner.request()(直调+schedule(0) 双入口折叠)', () => {
    expect(src).toContain('private bakeSheets(): Promise<void>');
    expect(src).toContain('return this.bakeRunner.request();');
    expect(src).toContain('void this.bakeSheets()');   // randomize 直调路径保留(即时起烘)
  });

  it('双烘消除:sheet URL 不再走同步 toDataURL', () => {
    expect(src).not.toMatch(/=\s*cv\.toDataURL\(\)/);          // 旧: this.hairSheetUrl = cv.toDataURL()
    expect(src).toContain('canvasToUrl(cv)');                  // 新: toBlob+objectURL
    expect(src).toContain('URL.revokeObjectURL');              // blob 生命周期管理
  });

  it('让出策略不回退:分帧循环走 bakeCells(批间 yieldTask),无裸 setTimeout(0) 让出', () => {
    expect(src).toContain('await bakeCells(CHAR_CREATION_HAIRS');
    expect(src).toContain('await bakeCells(VALID_CLOTH_STYLES');
    expect(src).not.toContain('await new Promise((r) => setTimeout(r, 0))');   // 旧让出写法
    expect(src).toContain("{ rows: { body: 0, legs: 0 } }");                    // 单帧行模式(20 帧白烘退场)
  });

  it('全透明自检前移到编码前(空 sheet 不再短暂挂格)', () => {
    const t1 = src.indexOf('sheetAllTransparent(cv)');
    const e1 = src.indexOf('canvasToUrl(cv)');
    const t2 = src.lastIndexOf('sheetAllTransparent(cv)');
    const e2 = src.lastIndexOf('canvasToUrl(cv)');
    expect(t1).toBeGreaterThan(-1);
    expect(t1).toBeLessThan(e1);       // hair 支:检 → 编码
    expect(t2).toBeLessThan(e2);       // look 支:检 → 编码
  });

  it('loading 态:双页接遮罩——look 首访立即挂 + 统一 arm/disarm', () => {
    expect(src).toContain("if (!this.lookSheetUrl) box.classList.add('baking')");   // look 首访(同 hair)
    expect(src).toContain('this.bakeMask.arm(');
    expect(src).toContain('this.bakeMask.disarm()');
    expect(src).toContain('.sw-cc-look.baking::before');                            // CSS 落地
  });

  it('变体域预抢在位(随机换变体的 ensure stall 收口)', () => {
    expect(src).toContain('scheduleVariantPrefetch');
    expect(src).toContain('MALE_VARIANTS');
    expect(src).toContain('FEMALE_VARIANTS');
  });
});
