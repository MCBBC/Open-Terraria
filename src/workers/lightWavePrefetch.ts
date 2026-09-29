// light/wave worker 预热 + spawn 单源（2026-09-28 看门狗治理批；★2026-09-29 从
// WorkerGovernance 拆出独立成模块）。
//
// ★拆出原因(2026-09-29 定谳):本文件含 `new Worker(new URL(...))` 字面量=vite
//   worker-URL 边;原先挂在 WorkerGovernance 上,而 LightingEngine.ts:16 import
//   WorkerGovernance(ladderDelayMs/workerRetryEnabled) → LightWorker 的 bundle
//   闭包被接回 Wave/Light 入口 = vite「Circular worker imports」拒绝构建
//   (v0.1.43 的 .ts 泄漏正是为绕此环用裸 new URL 的副作用——资产 emit)。
//   独立成模块后 LightingEngine 闭包零 worker-URL 边,字面量可安全存在。
//
// ★进场时序补丁（2026-09-28 根因定谳的+1 刀）：light/wave worker 脚本经 SW 预热。
// prefetchWorldGenWorker/prefetchSaveWorker 既有判例——借音频门等待窗口 spawn+
// 3s terminate,脚本请求经 SW cache-first 落缓存,真正 ensureWorker 时秒开;
// light/wave 从未拿到同款预热=开局冷取>2s 被 warmup 看门狗误杀的触发链。
// 必须走 new Worker(new URL) 模式（vite 才会构建产物;同源条目与生产 spawn
// 解析到同一 chunk=同一 HTTP 资产,预热即暖生产链路）。⚠️ 不能用裸 new URL
// 常量/`?worker&url`(前者=资产 emit 泄漏 .ts,后者=循环 import 拒绝构建)。
// 主线程专用（Worker 内禁用）。与生产 spawn(LightWorkerLink:240/WaterWaves:503)
// 同一条目模块 → vite 发同一 chunk。
export function spawnLightWorker(): Worker {
  return new Worker(new URL('./LightWorker.ts', import.meta.url), { type: 'module' });
}

export function spawnWaveWorker(): Worker {
  return new Worker(new URL('./WaveWorker.ts', import.meta.url), { type: 'module' });
}

export function prefetchLightWaveWorkers(): void {
  try {
    if (typeof document === 'undefined') return;
    const w1 = spawnLightWorker();
    setTimeout(() => { try { w1.terminate(); } catch { /* 已死 */ } }, 3000);
    const w2 = spawnWaveWorker();
    setTimeout(() => { try { w2.terminate(); } catch { /* 已死 */ } }, 3000);
  } catch { /* 预热失败不阻断启动 */ }
}
