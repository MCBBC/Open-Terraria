// 启动 splash 保持期(holdForAssetsReady)回归:
//  无下载概念(SW 未启用/完成标志在)→ 补满 minMs;有下载 → 等完或失败终态放行;
//  timeout 兜底;sinceMs 计入 splash 已显示时长。真实短定时器(轮询粒度 250ms)。
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

it('完成标志在(completeFast)→ 同样只补 minMs', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 120, deps: mkDeps({ completeFast: () => true }) })
    .then(() => { released = true; });
  await sleep(500);
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

it('下载链挂死 → timeout 兜底放行', async () => {
  let released = false;
  void holdForAssetsReady({ minMs: 60000, timeoutMs: 300, deps: mkDeps() }) // min 永不满足
    .then(() => { released = true; });
  await sleep(700);
  expect(released).toBe(true);
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
