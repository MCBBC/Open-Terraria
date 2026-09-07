// SW-BJ5 2026-09-07：世界列表游玩时间异常回归守卫。
// 用户实报：世界列表「游玩 109843 分钟」（≈76 天,不可能）。
// 根因（全链定谳见 src/save/PlayTime.ts 头注与 mainFlow.ts SW-BJ5 注）：
//   旧 cumulativePlayMs() = currentWorld?.playTimeMs + (Date.now() - playStart)，
//   而 worldStore.save 每存一次把槽位 meta.playTimeMs 写回「基线+整段会话已过时长」
//   （slotMeta === currentWorld === WorldStore.index 元素,同一对象），秒表仍从会话
//   起点走 → 第 k 次自动保存（间隔 A）后值 = S + A·k(k+1)/2,二次方膨胀。
//   以默认 10min 间隔挂机 ~147 发（≈24.6h）即 108,781 min——与实报 109,843 min 同量级。
// vanilla 权威：.plr 游玩时长 = PlayerFileData._playTime + _timer（GetPlayTime
//   PlayerFileData.cs:176-183）；存档只写 GetPlayTime().Ticks（Player.cs:55408），
//   绝不在会话中把秒表折回基线后仍让秒表从会话起点续走；世界文件/世界列表 UI
//   原版无游玩时长面（WorldFile.cs / UIWorldListItem.cs 零命中）=本仓自创显示，
//   语义按 .plr 定标：累计墙钟、会话内 ms 累加、存档持久化、读档续跑、绝不重复计费。
// 单位制：全链恒 ms（meta.playTimeMs / header.playTimeMs / totalMs），列表换算
//   floor(ms/60000)=分钟（WorldSelect.ts）——结构锁钉死,防 tick/ms 混写回潮。

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { PlayTimeTracker } = await import('../src/save/PlayTime');
const { WorldStore } = await import('../src/save/WorldStore');

const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('SW-BJ5 PlayTimeTracker（原版 PlayerFileData 语义）', () => {
  it('读档续跑：基线=上次存档累计,会话秒表从 0 起走', () => {
    const t = new PlayTimeTracker();
    expect(t.totalMs(1000)).toBe(0);            // idle：未进世界不计费
    t.start(60_000, 1000);                       // 槽位基线 60s,会话锚 t0=1000
    expect(t.totalMs(1000)).toBe(60_000);
    expect(t.totalMs(91_000)).toBe(150_000);     // 基线 + 会话 90s
    expect(t.totalMs(500)).toBe(60_000);         // 时钟回拨不多计
  });

  it('重复计费回归：自动保存写回 meta 不回流基线,线性增长（旧实现=二次方膨胀,定罪对照）', () => {
    const A = 600_000;            // 自动保存间隔 10min（Game.ts autoSaveIntervalMin 默认,原版恒值）
    const S = 60_000;             // 读档基线
    const k = 147;                // 自动保存发数（≈24.6h 长挂机）
    // 新语义：tracker 基线只在会话边界钉死；每次存档值 = S + i·A（线性）
    const t = new PlayTimeTracker();
    t.start(S, 0);
    let lastSaved = 0;
    for (let i = 1; i <= k; i++) {
      lastSaved = t.totalMs(i * A);   // worldStore.save(meta, json, playTimeMs) 只写 meta,基线不回流
      expect(lastSaved).toBe(S + i * A);
    }
    expect(lastSaved).toBe(S + k * A);
    // 旧实现仿真（基线每存一次被写回 totalMs,秒表仍从会话起点走）→ 二次方
    let oldBase = S;
    for (let i = 1; i <= k; i++) oldBase = oldBase + (i * A - 0);
    expect(oldBase).toBe(S + (A * k * (k + 1)) / 2);
    expect(Math.floor(oldBase / 60_000)).toBe(108_781);   // 实报 109,843 min 同量级（判别力锚）
    expect(lastSaved).not.toBe(oldBase);
    expect(lastSaved).toBeLessThan(oldBase / 50);         // 线性 vs 二次方,量级差可判
  });

  it('失焦不计费：visibilitychange 折算/续走（FocusHelper.cs:59 AllowCountingPlayerTime 语义）', () => {
    const t = new PlayTimeTracker();
    t.start(0, 0);
    expect(t.totalMs(60_000)).toBe(60_000);
    t.pause(60_000);                              // hidden：折算+停表
    expect(t.totalMs(3_600_000)).toBe(60_000);    // 后台 1h 不计费
    t.pause(3_600_000);                           // 幂等
    expect(t.totalMs(3_600_000)).toBe(60_000);
    t.resume(7_200_000);                          // visible：仅重锚
    expect(t.totalMs(7_260_000)).toBe(120_000);   // 只加回前台 60s,不重复计
    t.resume(7_300_000);                          // 未暂停时 resume no-op（锚不被重置）
    expect(t.totalMs(7_360_000)).toBe(220_000);   // 锚仍=7_200_000;若 no-op 失效被重锚,会错得 120_000
  });

  it('读档吸合 absorb：存档头>基线时以档为准,≤ 时不动（保本会话已计）', () => {
    const t = new PlayTimeTracker();
    t.start(60_000, 0);
    t.absorb(300_000, 5_000);                     // 副本/导入/quickLoad：槽位落后于存档头
    expect(t.totalMs(6_000)).toBe(301_000);       // 新基线 + 重锚后 1s（吸合重锚,不吃加载前秒表）
    t.absorb(999_999, 6_000);                     // 更大仍吸
    expect(t.totalMs(7_000)).toBe(1_000_999);
    t.absorb(Number.NaN, 8_000);                  // 坏值 no-op
    expect(t.totalMs(9_000)).toBe(1_002_999);
    t.absorb(10, 9_000);                          // 更小不夺走基线
    expect(t.totalMs(10_000)).toBe(1_003_999);
  });

  it('跨会话：quit 不写基线,下次 start 钉新基线（原版 StopPlayTimer 折算等价=存档持久化）', () => {
    const t = new PlayTimeTracker();
    t.start(0, 0);
    expect(t.totalMs(10 * 60_000)).toBe(600_000);   // 会话 1 玩 10min,存档写 600_000
    t.start(600_000, 1_000_000);                    // 会话 2 读档续跑
    expect(t.totalMs(1_000_000 + 60_000)).toBe(660_000);
  });
});

describe('SW-BJ5 WorldStore 槽位面', () => {
  beforeEach(() => mem.clear());

  it('新世界注册 playTimeMs=0（「新世界 0 分钟」正确面）', async () => {
    const s = new WorldStore();
    const m = await s.register({ name: '新世界', seed: '1', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    expect(m.playTimeMs).toBe(0);
  });

  it('副本继承源槽位累计（spread 透传,与副本数据 header.playTimeMs 一致）', async () => {
    const s = new WorldStore();
    const a = await s.register({ name: '家园', seed: '9', w: 4200, h: 1200, difficulty: 0, evil: 0 });
    await s.save(a, '{"header":{"playTimeMs":100}}', 100);
    const c = await s.duplicate(a);
    expect(c?.playTimeMs).toBe(100);   // 旧实现恒 0 → 列表显 0/读档丢累计
  });

  it('importSlot 透传存档头游玩时长,缺省 0（.wld 原版无此字段）', async () => {
    const s = new WorldStore();
    const a = await s.importSlot({ name: '导入A', seed: '2', w: 4200, h: 1200, difficulty: 0, evil: 0 }, '{}', 123_456);
    expect(a.playTimeMs).toBe(123_456);
    const b = await s.importSlot({ name: '导入B', seed: '3', w: 4200, h: 1200, difficulty: 0, evil: 0 }, '{}');
    expect(b.playTimeMs).toBe(0);
  });

  it('存储层 last-write-wins：两连写 meta=末次值,不做累加（累加语义在 tracker/调用方）', async () => {
    const s = new WorldStore();
    const m = await s.register({ name: 'w', seed: '4', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    await s.save(m, '{}', 60_000);
    await s.save(m, '{}', 120_000);
    expect(s.list()[0].playTimeMs).toBe(120_000);   // 若存储层自累加会得 180_000
  });
});

describe('SW-BJ5 结构锁（源文本锚,防静默回退）', () => {
  const mainFlow = src('../src/mainFlow.ts');
  const worker = src('../src/workers/worldGen.worker.ts');
  const wsel = src('../src/ui/WorldSelect.ts');
  const mainTs = src('../src/main.ts');

  it('cumulativePlayMs 只读 tracker（基线不可被存档回流）', () => {
    expect(mainFlow).toContain('function cumulativePlayMs(): number {\n    return play.totalMs(Date.now());\n  }');
    expect(mainFlow).not.toContain('currentWorld?.playTimeMs ?? 0) + Math.max(0, Date.now() - playStart)');   // 旧膨胀形态
    expect(mainFlow).toContain('play.start(currentWorld?.playTimeMs ?? 0, Date.now())');   // enterGame 计费锚
  });

  it('读档吸合三路径（quickLoad/槽位 worker/主线程回退）+ 后台折算监听', () => {
    expect(mainFlow.match(/absorbLoadedPlayMs\(/g)?.length).toBe(4);   // 1 定义 + 3 调用
    expect(mainFlow).toContain("document.addEventListener('visibilitychange'");
    expect(mainFlow).toContain('play.pause(Date.now())');
    expect(mainFlow).toContain('play.resume(Date.now())');
  });

  it('worker 读档回传头含 playTimeMs（吸合数据源）', () => {
    expect(worker).toContain('const savedPlayMs = data.header?.playTimeMs;');
    expect(worker).toContain('playTimeMs: savedPlayMs');
  });

  it('列表换算恒分钟=ms/60000（单一 ms 制）', () => {
    expect(wsel).toContain('Math.floor(meta.playTimeMs / 60000)');
  });

  it('F5 报告与导出档统一累计口径（会话/累计两口径混写根除）', () => {
    expect(mainTs).toContain('playTimeMs: flow.cumulativePlayMs');
    expect(mainTs).toContain('flow?.cumulativePlayMs ?? 0');
    expect(mainTs).not.toContain('playStartNow');   // 旧会话口径消费面清零
  });
});
