// worker 条目 URL 单源（2026-09-28 看门狗治理批）：prefetch 与生产 spawn 必须解析到
// 同一 worker chunk（vite 按【条目模块】发 chunk——LightWorkerLink 的
// `new URL('../workers/LightWorker.ts', import.meta.url)` 与本文件的
// `new URL('./LightWorker.ts', import.meta.url)` 同一模块 → 同一产物 asset,
// 预热即暖生产链路）。模块级 new URL 在 node/vitest 亦可安全求值（纯路径解析）。
export const LIGHT_WORKER_ENTRY_URL = new URL('./LightWorker.ts', import.meta.url);
export const WAVE_WORKER_ENTRY_URL = new URL('./WaveWorker.ts', import.meta.url);
