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
  done = true;                            // SW status 回包证实全就位
  await sleep(400);
  expect(released).toBe(true);
});

it('有下载 → minMs 后仍等,complete 才放行;sinceMs 计入已显示时长', async () => {
  let done = false;
  let released = false;
  void holdForAssetsReady({ minMs: 120, sinceMs: 2000, deps: mkDeps({ complete: () => done }) })
    .then(() => { released = true; });
  await sleep(400);                       // sinceMs 已超 minMs,但下载未完仍等
  expect(released).toBe(false);
  done = true;
  await sleep(400);
  expect(released).toBe(true);
});

it('失败终态(failed>0)放行(徽标在菜单继续示警,不卡死启动)', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 120, deps: mkDeps({ state: () => mkState({ failed: 3, warming: false }) }) })
    .then(() => { released = true; });
  await sleep(500);
  expect(released).toBe(true);
});

it('进度停滞超 stallMs → 兜底放行(挂死链)', async () => {
  let released = false;
  // state 全静止(下载链挂死)→ stallMs 到即放行
  void holdForAssetsReady({ minMs: 120, stallMs: 300, deps: mkDeps() })
    .then(() => { released = true; });
  await sleep(1100);                      // 300ms 停滞窗 + 轮询粒度余量
  expect(released).toBe(true);
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
  void holdForAssetsReady({ minMs: 600, deps: mkDeps({ complete: () => done }) })
    .then(() => { released = true; });
  await sleep(300);
  done = true;                            // 0.3s 就下完了
  await sleep(200);                       // 累计 0.5s < minMs
  expect(released).toBe(false);
  await sleep(500);                       // 累计 ≥ minMs
  expect(released).toBe(true);
});
