// ★C9 光照引擎 Worker（2026-09-23;?lightworker=1,缺省关）——光照 scan→blur→export
// 整体移出主线程（主线程占比 blurLine+exportTo+compositeLight ≈7-12%,macOS/Windows
// trace 双证）。内核零转录：本 worker 导入 LightingEngine 模块本体（同一份类）,在
// 「快照 store」（LightWorkerProtocol.SnapshotTileStore,窗口 rebase 方案）上跑周期。
//
// 协议（LightWorkerProtocol.ts 头注为权威）：
//   main→worker: {op:'frame', ...快照（tile 窗口切片 + 相机/天空/时钟/点光参数）}
//   worker→main: {op:'light', seq, rx,ry,rw,rh, R/G/B(transferable)}
//              | {op:'error', message}（帧内异常→主线程立即回落,不等 2s 看门狗）
// 注意：module worker 的 self.location 是脚本 URL（无查询串）→ lightWorkerFlag 在
// worker 内恒 false → 镜像引擎 _lw=null 走本地路径,无递归。
import { LightingEngine, type LightingWorld } from '../lighting/LightingEngine';
import type { TileStore } from '../world/TileStore';
import {
  SnapshotTileStore, createWorkerDriveState, runSnapshotOnEngine,
  type LightSnapshotMsg, type LightResultMsg,
} from '../lighting/LightWorkerProtocol';

const store = new SnapshotTileStore();
const world = { store: store as unknown as TileStore, groundLevel: 0, lavaLine: 0, clock: { timeOfDay: 0.5, dayCount: 1 } };
const engine = new LightingEngine(world as unknown as LightingWorld);
const drive = createWorkerDriveState();

self.onmessage = (e: MessageEvent) => {
  const m = e.data as LightSnapshotMsg;
  if (m.op !== 'frame') return;
  try {
    const out = runSnapshotOnEngine(engine, m, drive);
    const reply: LightResultMsg = { op: 'light', seq: m.seq, rx: out.rx, ry: out.ry, rw: out.rw, rh: out.rh, R: out.R, G: out.G, B: out.B };
    self.postMessage(reply, [out.R.buffer, out.G.buffer, out.B.buffer]);
  } catch (err) {
    self.postMessage({ op: 'error', message: String(err).slice(0, 200) });
  }
};
