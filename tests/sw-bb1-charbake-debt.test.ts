// SW-BB1 2026-09-06 烘焙管线域备案项清偿回归锚（D1 落地账/D4a 批硬顶/D2a 预抢重武装/
// D4b 调用侧超时/D3 重试计数清零;逐项定谳与改动面见批报告）。
// 语义自查表(D1 主项,任务书钉死)——
//   hair 页改 hair        → hair 在 bakeStateKey 内 → 键变 → 重烘(保守正确)
//   理发窗同色随机同发型   → 键不变 ∧ 上次落地洁净 → 跳过(D1 主收益,免全量重烘+重编码)
//   色板拖动              → 色变 → 键变 → 烘(251ms 防抖语义不变)
//   全透明自愈/retry 链    → dirty 记账 + bakeForceNext → forceRequest 全通(死 sheet 必有路重烘)
//   自愈失效账:重烘请求同键被跳过 → 死 sheet 永不自愈(2026-08-25 链)由「clean 才跳过」防回写
// 纯逻辑用例跑 SingleFlightBake/bakeCells 真身;CharCreation 接线走源码锚(同 AX1 文件范式)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bakeCells, SingleFlightBake, BAKE_BATCH_HARD_CAP_MS } from '../src/ui/charBake';
import type { BakeOutcome } from '../src/ui/charBake';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

// ---------- D1: SingleFlightBake 落地账(键同∧洁净=跳过) ----------
describe('SW-BB1 D1 SingleFlightBake 落地账', () => {
  it('同键洁净落地 → 再 request 复用现值不重烘(理发窗同色随机同发型主收益)', async () => {
    let runs = 0;
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return 'clean'; }, () => 'K1');
    await sf.request();
    expect(runs).toBe(1);
    await sf.request();          // 键同∧洁净 → 跳过
    await sf.request();
    expect(runs).toBe(1);
    expect(sf.inFlight).toBe(false);
  });

  it('同键不洁落地(dirty) → 同键重烘不被跳过(2026-08-25 全透明自愈链通路)', async () => {
    let runs = 0;
    let outcome: BakeOutcome = 'dirty';   // 全透明自检失败形态
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return outcome; }, () => 'K1');
    await sf.request();
    expect(runs).toBe(1);
    await sf.request();          // 不洁 → 必须重烘(死 sheet 不被同键跳过)
    expect(runs).toBe(2);
    outcome = 'clean';           // 自愈成功后 → 恢复跳过资格
    await sf.request();
    expect(runs).toBe(3);
    await sf.request();
    expect(runs).toBe(3);
  });

  it("noop 不动落地账:信息/颜色页跑空后,先前洁净账保留 → 同键仍跳过", async () => {
    let runs = 0;
    let key = 'hair';
    const outcomes: BakeOutcome[] = ['clean', 'noop', 'noop'];
    let i = 0;
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return outcomes[i++] ?? 'noop'; }, () => key);
    await sf.request();          // hair 页烘成,账=K(hair)
    expect(runs).toBe(1);
    key = 'shirt';               // 切颜色页:只跑 ensure → noop
    await sf.request();
    expect(runs).toBe(2);
    key = 'hair';                // 切回发型页:键同 → 跳过(不因颜色页空跑抹账)
    await sf.request();
    expect(runs).toBe(2);
  });

  it('forceRequest 绕过落地账跳过,烘后按洁净度更新账(自愈强制通道)', async () => {
    let runs = 0;
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return 'clean'; }, () => 'K1');
    await sf.request();
    expect(runs).toBe(1);
    await sf.forceRequest();     // 同键也强制起飞
    expect(runs).toBe(2);
    await sf.request();          // 强制烘仍洁净 → 账更新 → 恢复跳过
    expect(runs).toBe(2);
  });

  it('飞行中 forceRequest → 强制尾随(键相同也重烘;普通尾随语义不混用)', async () => {
    const d = deferred();
    let runs = 0;
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => {
      runs++;
      if (runs === 1) await d.promise;
      return 'clean';
    }, () => 'K1');
    void sf.request();
    expect(sf.inFlight).toBe(true);
    void sf.forceRequest();      // 飞行中强制 → 登记【强制】尾随
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(2);        // 键相同也尾随(force 语义)
    expect(sf.inFlight).toBe(false);
  });

  it('run 异常 → 账记不洁 → 同键下次重烘(前单飞语义不回退)', async () => {
    let runs = 0;
    const sf = new SingleFlightBake((): Promise<BakeOutcome> => {
      runs++;
      return runs === 1 ? Promise.reject(new Error('bake fail')) : Promise.resolve<BakeOutcome>('clean');
    }, () => 'K1');
    await sf.request().catch(() => { /* 单飞不放大 */ });
    expect(runs).toBe(1);
    await sf.request();          // 异常=不洁 → 重烘
    expect(runs).toBe(2);
  });

  it('cancel 吞强制尾随(面板关闭形态)', async () => {
    const d = deferred();
    let runs = 0;
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => {
      runs++;
      if (runs === 1) await d.promise;
      return 'clean';
    }, () => 'K1');
    void sf.request();
    void sf.forceRequest();
    sf.cancel();
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);
  });

  it('语义自查表:hair 改 hair/色板拖动=键变→重烘;自愈链 force 全通', async () => {
    let runs = 0;
    let key = 'hair|1|0,0,0';
    const outcomes: BakeOutcome[] = [];
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return outcomes[runs - 1] ?? 'clean'; }, () => key);
    outcomes.push('clean');
    await sf.request();
    key = 'hair|2|0,0,0';        // hair 页改 hair:hair 在键内 → 键变 → 重烘
    await sf.request();
    expect(runs).toBe(2);
    key = 'hair|2|255,0,0';      // 色板拖动:色在键内 → 键变 → 烘
    await sf.request();
    expect(runs).toBe(3);
    await sf.forceRequest();     // 自愈链:强制通道无视账
    expect(runs).toBe(4);
  });

  it('AX1 备案「尾随快照键极端重复」自动划账:飞行中键 A→B→A,尾随被落地账跳过', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'A';
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return runs === 1 ? (await d.promise, 'clean') : 'clean'; }, () => key);
    void sf.request();           // 起飞 A
    key = 'B';
    void sf.request();           // 飞行中改键 → 登记尾随
    key = 'A';                   // 落地前改回 A(极端重复形态)
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(1);        // 尾随请求键=落地键∧洁净 → 跳过(AX1 ~10-20ms 债收敛)
    expect(sf.inFlight).toBe(false);
  });

  it('251ms 拖色防抖×单飞互作回归:飞行中连发多键只尾随一次,落地后同键复用', async () => {
    const d = deferred();
    let runs = 0;
    let key = 'c0';
    const sf = new SingleFlightBake(async (): Promise<BakeOutcome> => { runs++; return 'clean'; }, () => key);
    void sf.request();           // 防抖到点第 1 烘
    for (const k of ['c1', 'c2', 'c3', 'c4']) { key = k; void sf.request(); }   // 拖色连发
    d.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(2);        // 一次飞行+一次尾随(最后键 c4)
    key = 'c4';
    await sf.request();
    expect(runs).toBe(2);        // 落地账命中 → 拖色停手后的重复请求不再重烘
  });
});

// ---------- D4a: bakeCells 批级硬顶 ----------
describe('SW-BB1 D4a bakeCells 批级硬顶', () => {
  const spin = (ms: number) => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } };

  it(`病态慢源(每格 ~6ms):规划批被钳在 ${BAKE_BATCH_HARD_CAP_MS}ms 量级,批数放大且每批界必让出`, async () => {
    const drawn: number[] = [];
    const res = await bakeCells(
      Array.from({ length: 48 }, (_, i) => i),
      (item) => { drawn.push(item); spin(6); },   // 每格 ~6ms:规划器 min 6 格 × 6ms = 36ms > 顶
      { budgetMs: 7 },
    );
    expect(drawn).toHaveLength(48);              // 零跳格(钳制不吞格)
    expect([...drawn].sort((a, b) => a - b)).toEqual(drawn);
    expect(res.yields).toBe(res.batches - 1);    // 每批界必让出
    // 规划器单独只会给 ~48/6=8 批;硬顶把批压小 → 批数显著放大
    expect(res.batches).toBeGreaterThanOrEqual(12);
  });

  it('EWMA 语义不变:健康负载硬顶不触发,自适应扩批照常(预算内批形不被钳)', async () => {
    const res = await bakeCells(
      Array.from({ length: 64 }, () => 0),
      () => spin(0.3),
      { budgetMs: 30 },   // 宽预算:机器时钟抖动下扩批路径也稳定,钳制分支(24ms 顶)恒不绑定
    );
    expect(res.yields).toBe(res.batches - 1);
    expect(res.batches).toBeLessThanOrEqual(8);
  });

  it('零耗批(lastMs=0)不钳:213 格形态与 AX1 锚一致(批数 ≤10,全让出)', async () => {
    const res = await bakeCells(
      Array.from({ length: 213 }, (_, i) => i),
      () => { /* 零耗 */ },
    );
    expect(res.yields).toBe(res.batches - 1);
    expect(res.batches).toBeLessThanOrEqual(10);
  });
});

// ---------- CharCreation 接线源码锚(纯逻辑域无法 import UI,同 AX1 文件范式) ----------
describe('SW-BB1 CharCreation 源码锚(接线不回写)', () => {
  const src = readFileSync(new URL('../src/ui/CharCreation.ts', import.meta.url), 'utf8');
  const bakeSrc = readFileSync(new URL('../src/ui/charBake.ts', import.meta.url), 'utf8');

  it('D1: runBakeSheets 回传 BakeOutcome,dirty×2(全透明)/clean×2(洁净落地)记账', () => {
    expect(src).toContain('private async runBakeSheets(): Promise<BakeOutcome>');
    expect(src.match(/return 'dirty';/g)?.length).toBe(2);
    expect(src.match(/outcome = 'clean';/g)?.length).toBe(2);
    expect(src.match(/outcome = 'dirty';/g)?.length).toBe(2);
    expect(src.match(/return 'noop';/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('type BakeOutcome');
  });

  it('D1: 自愈强制通道——retry 链挂 bakeForceNext,scheduleSheetBake 消费走 forceRequest', () => {
    expect(src).toContain('private bakeForceNext = false;');
    expect(src).toContain('this.bakeForceNext = true;');            // scheduleThumbRetry 挂
    expect(src).toContain('void this.bakeRunner.forceRequest();');  // scheduleSheetBake 消费
    const arm = src.indexOf('this.bakeForceNext = true;');
    const consume = src.indexOf('void this.bakeRunner.forceRequest();');
    expect(arm).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(arm);   // 挂点在前,消费点在后(顺序不可回写)
  });

  it('D1: 跳过门在单飞侧(键同∧洁净),force 通道无视之(charBake 结构锁)', () => {
    const req = bakeSrc.indexOf('request(): Promise<void>');
    const skip = bakeSrc.indexOf('if (key === this.lastLandedKey && this.lastLandedClean) return Promise.resolve();');
    const force = bakeSrc.indexOf('forceRequest(): Promise<void>');
    expect(req).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(req);       // 跳过门在 request() 体内
    expect(force).toBeGreaterThan(skip);     // 强制通道独立于 request(直通 launch)
    expect(bakeSrc).toContain('lastLandedClean = true');
    expect(bakeSrc).toContain('lastLandedClean = false');
  });

  it('D3: 洁净落地清重试计数(防累计 6 次失败永久停),失败不清(有界降级保语义)', () => {
    expect(src.match(/this\.thumbRetry = 0;/g)?.length).toBe(2);   // hair+look 双支
    expect(src).toContain("if (!missed) { this.thumbRetry = 0; outcome = 'clean'; }");
  });

  it('D2a: 预抢被后台切走不再永久跳过——visibilitychange 回 visible 重武装,close 摘钩', () => {
    expect(src).toContain('armVariantPrefetchOnVisible');
    expect(src).toContain("if (document.hidden) { this.armVariantPrefetchOnVisible(); return; }");
    expect(src).toContain("document.addEventListener('visibilitychange', h)");
    expect(src).toContain("document.removeEventListener('visibilitychange', this.prefetchVisHandler)");
    expect(src).toContain("document.removeEventListener('visibilitychange', h)");   // 触发自摘
    // RB3 内存常驻面不动(RB3 量化 28MB 可接受;LRU 驱逐会伤 uiimages 共享 Map)——注释钉
    expect(src).toContain('28MB 可接受');
    expect(src).toContain('明确不做');
  });

  it('D4b: ensure 调用侧 10s 超时,共享核心不动(消费面清单注释钉)', () => {
    expect(src).toContain('const BAKE_SOURCE_TIMEOUT_MS = 10_000;');
    expect(src).toContain('Promise.race([');
    expect(src).toContain('UITextures.ensure([...names])');
    expect(src).toContain('clearTimeout(ensureTimer)');
    expect(src).toContain('消费面仅本文件两处');   // 消费面清单锚
    // SpriteAtlas.waitUi/ensureUiBatch 无超时注入(共享核心零改动)——切出两法一段验
    const atlas = readFileSync(new URL('../src/assets/SpriteAtlas.ts', import.meta.url), 'utf8');
    const core = atlas.slice(
      atlas.indexOf('waitUi(file: string)'),
      atlas.indexOf('vicon(itemId: number)'),
    );
    expect(core).toContain('ensureUiBatch');
    expect(core).not.toContain('setTimeout');    // 共享核心不注入超时(超时只在调用侧)
    expect(core).not.toContain('race(');
  });

  it('D4a: 硬顶常量在 charBake,钳制只在规划器输出上(向下,EWMA 公式零改动)', () => {
    expect(bakeSrc).toContain('export const BAKE_BATCH_HARD_CAP_MS = 24;');
    expect(bakeSrc).toContain('ewma = ewma ? ewma * 0.6 + dur * 0.4 : dur;');   // EWMA 公式原样
    expect(bakeSrc).toMatch(/batch = Math\.min\(batch, Math\.max\(1, Math\.floor\(BAKE_BATCH_HARD_CAP_MS \/ perCellMs\)\)\)/);
    expect(bakeSrc).toContain('i += end - i;');   // ★按实耗推进不回写(RB3 判例)
  });
});
