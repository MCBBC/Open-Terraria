// ★C9 光照引擎 Worker（2026-09-23;?lightworker=1,缺省关）——光照 scan→blur→export
// 整体移出主线程（主线程占比 blurLine+exportTo+compositeLight ≈7-12%,macOS/Windows
// trace 双证）。内核零转录：本 worker 导入 LightingEngine 模块本体（同一份类）,在
// 「快照 store」（LightWorkerProtocol.SnapshotTileStore,窗口 rebase 方案）上跑周期。
//
// 协议（LightWorkerProtocol.ts 头注为权威）：
//   main→worker: {op:'frame', ...快照（tile 窗口切片 + 相机/天空/时钟/点光参数）}
//              ★C9d2 二期增 enc 形态:undefined=legacy 全量（transferable 进,
//                compute 后 tile 缓冲 'pool' 回传复用）/'full'=灰度全量锚帧
//                （结构克隆进,即新影子）/'delta'=差量帧（解码器自影子重建）
//              {op:'resync'}（★C9d2 防御:delta 而影子缺失/尺寸失配 → 请求全量）
//   worker→main: {op:'light', seq, rx,ry,rw,rh, R/G/B(transferable)}
//              | {op:'error', message}（帧内异常→主线程立即回落,不等 2s 看门狗）
//              | {op:'pool', seq, tiles(transferable)}（★C9d2 仅 legacy 形态回传,
//                主线程切片池复用=稳态零分配）
// 注意：module worker 的 self.location 是脚本 URL（无查询串）→ lightWorkerFlag 在
// worker 内恒 false → 镜像引擎 _lw=null 走本地路径,无递归。
import { assertWorkerBootGate } from './workerBootGate';   // ★首导入 boot 闸（必须保持第一位;见该文件头注,x-ray 定谳防线）
import { LightingEngine, type LightingWorld } from '../lighting/LightingEngine';
import type { TileStore } from '../world/TileStore';
import {
  SnapshotTileStore, createWorkerDriveState, runSnapshotOnEngine,
  TILE_CHAN_KEYS,
  type LightPoolMsg, type LightResyncMsg, type LightSnapshotMsg, type LightResultMsg,
} from '../lighting/LightWorkerProtocol';

assertWorkerBootGate('LightWorker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

const store = new SnapshotTileStore();
const world = { store: store as unknown as TileStore, groundLevel: 0, lavaLine: 0, clock: { timeOfDay: 0.5, dayCount: 1 } };
const engine = new LightingEngine(world as unknown as LightingWorld);
const drive = createWorkerDriveState();

self.onmessage = (e: MessageEvent) => {
  const m = e.data as LightSnapshotMsg;
  if (m.op !== 'frame') return;
  try {
    // ★C9d2 差量防御门:delta 帧而影子缺失/尺寸失配（正常由主线程 planFull 保证
    // 不触发）→ resync 请求全量,不烧帧
    if (!drive.deltaDec.readyFor(m)) {
      const rs: LightResyncMsg = { op: 'resync' };
      self.postMessage(rs);
      return;
    }
    const out = runSnapshotOnEngine(engine, m, drive);
    const reply: LightResultMsg = { op: 'light', seq: m.seq, rx: out.rx, ry: out.ry, rw: out.rw, rh: out.rh, R: out.R, G: out.G, B: out.B };
    self.postMessage(reply, [out.R.buffer, out.G.buffer, out.B.buffer]);
    // ★C9d2 Layer 1:legacy 全量帧 tile 缓冲回池（transfer 往返,主线程 buildSlice
    // 稳态零重分配）。compute 完毕后 store 通道引用随 adopt 下帧整体替换,回传安全。
    // 灰度形态（'full'/'delta'）不回传:'full' 数组即解码器影子,'delta' 无全量缓冲。
    if (m.enc === undefined) {
      const t = m.tiles;
      const bufs = TILE_CHAN_KEYS.map((k) => (t[k] as Uint16Array | Uint8Array).buffer).filter((b) => b.byteLength > 0);
      const pool: LightPoolMsg = { op: 'pool', seq: m.seq, tiles: t };
      self.postMessage(pool, bufs);
    }
  } catch (err) {
    self.postMessage({ op: 'error', message: String(err).slice(0, 200) });
  }
};
