// 启动 splash 保持期(holdForAssetsReady)回归:
//  p0-p8 全部落盘才放行(2026-08-26 用户定案):SW 未启用→补满 minMs;有下载→
//  等 complete() 或失败终态;进度停滞 stallMs 兜底放行(原 absolute timeout 30s
//  与 completeFast 免检已删——慢网过半放行/驱逐后标志假完成,均=缺资产揭幕)。
//  真实短定时器(轮询粒度 250ms)。
import { it, expect } from 'vitest';
import { holdForAssetsReady, type HoldDeps } from '../src/ui/AssetDownloadUI';
import type { AssetCacheState } from '../src/net/AssetCache';

function mkState(p: Partial<AssetCacheState>): AssetCacheState {
  return {
    enabled: true, version: 'v', total: 100, done: 0, failed: 0,
    phase: 'misc-sprites', warming: true, bytesDone: 0, bytesTotal: 0,
    ...p,
  } as AssetCacheState;
}

function mkDeps(over: Partial<HoldDeps> = {}): HoldDeps {
  return {
    now: () => performance.now(),
    state: () => mkState({}),
    completeFast: () => false,
    complete: () => false,
    ...over,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it('无下载概念(SW 未启用)→ 补满 minMs 即放行', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 120, deps: mkDeps({ state: () => mkState({ enabled: false }) }) })
    .then(() => { released = true; });
  await sleep(100);                       // < minMs 且未到首个轮询点
  expect(released).toBe(false);
  await sleep(400);                       // 轮询点 250ms ≥ minMs
  expect(released).toBe(true);
});

it('完成标志在但 SW 未证实(complete=false)→ 仍等待,实测 complete 才放行', async () => {
  // 2026-08-26 用户定案:localStorage 上轮标志 ≠ 本轮缓存实况(驱逐后假完成),
  // 放行只认 complete() 实测——标志在+缓存被清时放行=菜单开在缺资产态+404 风暴
  let done = false;
  let released = false;
  void holdForAssetsReady({ minMs: 120, deps: mkDeps({ completeFast: () => true, complete: () => done }) })
    .then(() => { released = true; });
  await sleep(600);                       // 标志在但未证实:必须继续等
  expect(released).toBe(false);
  void holdForAssetsReady;
  done = true;                            // complete 假阳(口径污染)也不放行——只认 phase 终态
  await sleep(400);
  expect(released).toBe(false);
});

it('worker 真完成终态(phase=done,failed=0,done≥total)→ 放行', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 120, sinceMs: 2000, deps: mkDeps({ state: () => mkState({ phase: 'done', failed: 0, done: 100 }) }) })
    .then(() => { released = true; });
  await sleep(400);                       // sinceMs 已超 minMs
  expect(released).toBe(true);
});

it('★口径污染回归:done≥total 但 phase≠done(假满)→ 不放行(2026-08-27 手机 34% 揭幕)', async () => {
  let released = false;
  // status 回包曾把 cached(含壳噪声)回写 done → done=total 假满,phase 仍是
  // 进行中相位——放行只认 phase 终态,口径假满不得揭幕
  void holdForAssetsReady({ minMs: 0, deps: mkDeps({ state: () => mkState({ done: 100, phase: 'game-sprites', warming: true }), complete: () => true }) })
    .then(() => { released = true; });
  await sleep(800);
  expect(released).toBe(false);
});

it('失败终态(failed>0,自动补拉轮耗尽)放行(徽标在菜单继续示警,不卡死启动)', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 120, deps: mkDeps({ state: () => mkState({ failed: 3, warming: false }), retriesExhausted: () => true }) })
    .then(() => { released = true; });
  await sleep(500);
  expect(released).toBe(true);
});

it('失败停机但自动补拉轮未耗尽 → 不放行(等 15s/online 自动重扫,2026-08-27)', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 0, deps: mkDeps({ state: () => mkState({ failed: 3, warming: false }), retriesExhausted: () => false }) })
    .then(() => { released = true; });
  await sleep(800);
  expect(released).toBe(false);
});

it('进行中瞬时失败(warming=true, failed>0)→ 不放行(2026-08-27 手机弱网回归:片重试中不得提前揭幕)', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 0, deps: mkDeps({ state: () => mkState({ failed: 2, warming: true, phase: 'sounds' }) }) })
    .then(() => { released = true; });
  await sleep(800);                       // 远超轮询粒度,若误放行早已 released
  expect(released).toBe(false);
});

it('进度停滞超 stallMs 且无活动(warming=false)→ 兜底放行(挂死链)', async () => {
  let released = false;
  let warmed = false;
  // state 全静止且无活动 → stallMs 到即放行
  void holdForAssetsReady({ minMs: 120, stallMs: 300, deps: mkDeps({ state: () => mkState({ warming: false }), warm: () => { warmed = true; } }) })
    .then(() => { released = true; });
  await sleep(1100);                      // 300ms 停滞窗 + 轮询粒度余量
  expect(released).toBe(true);
  expect(warmed).toBe(false);
});

it('进度停滞但 warming=true → force 重启对账续传,不放行(2026-08-27 手机锁屏回归)', async () => {
  let released = false;
  let warmed = 0;
  void holdForAssetsReady({ minMs: 120, stallMs: 300, deps: mkDeps({ state: () => mkState({ warming: true }), warm: () => { warmed++; } }) })
    .then(() => { released = true; });
  await sleep(1100);
  expect(released).toBe(false);
  expect(warmed).toBeGreaterThanOrEqual(1);
});

it('健康下载(进度持续)→ 不误触停滞放行', async () => {
  let released = false;
  let tick = 0;
  void holdForAssetsReady({
    minMs: 120, stallMs: 300,
    deps: mkDeps({ state: () => mkState({ done: ++tick, bytesDone: tick * 1024 }) }),
  }).then(() => { released = true; });
  await sleep(1400);                      // 300ms 窗的 4 倍,进度持续 → 仍等
  expect(released).toBe(false);
});

it('下载在 minMs 内完成 → 仍补满 minMs(不提前放行)', async () => {
  let done = false;
  let released = false;
  void holdForAssetsReady({ minMs: 600, deps: mkDeps({ state: () => mkState(done
    ? { phase: 'done' as const, failed: 0, done: 100, warming: false }
    : { phase: 'menu' as const, warming: true }) }) })
    .then(() => { released = true; });
  await sleep(300);
  done = true;                            // 0.3s 就下完了
  await sleep(200);                       // 累计 0.5s < minMs
  expect(released).toBe(false);
  await sleep(500);                       // 累计 ≥ minMs
  expect(released).toBe(true);
});
