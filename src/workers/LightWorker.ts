// ★C9 光照引擎 Worker（2026-09-23;?lightworker=1,缺省关）——光照 scan→blur→export
// 整体移出主线程（主线程占比 blurLine+exportTo+compositeLight ≈7-12%,macOS/Windows
// trace 双证）。内核零转录：本 worker 导入 LightingEngine 模块本体（同一份类）,在
// 「快照 store」（LightWorkerProtocol.SnapshotTileStore,窗口 rebase 方案）上跑周期。
//
// 协议（LightWorkerProtocol.ts 头注为权威）：
//   main→worker: {op:'frame', ...快照（tile 窗口切片 + 相机/天空/时钟/点光参数）}
//              ★C9d2 二期增 enc 形态:undefined=legacy 全量（transferable 进,
//                compute 后 tile 缓冲 'pool' 回传复用）/'full'=灰度全量锚帧
//                （★2026-10-04 transferable 化——收包即解码器新影子,被换下缓冲
//                'pool' 回传;旧「结构克隆进」退役）/'delta'=差量帧（解码器自影子重建）
//              ★债3 池化（2026-10-04）增 ret=退役结果数组（transfer 回送 → 结果池,
//                发布面 pubPool 取用——稳态双端零分配）
//              {op:'resync'}（★C9d2 防御:delta 而影子缺失/尺寸失配 → 请求全量）
//   worker→main: {op:'light', seq, rx,ry,rw,rh, R/G/B(transferable)}
//              ★债2/债3 池化增 retDelta=delta 解码完毕缓冲回送（编码器 scratch 池）/
//                rp=结果池对账计数
//              | {op:'error', message}（帧内异常→主线程立即回落,不等 2s 看门狗）
//              | {op:'pool', seq, tiles(transferable)}（legacy 帧直回 /
//                ★'full' 解码器退役缓冲回传——主线程切片池复用=稳态零分配）
// 注意：module worker 的 self.location 是脚本 URL（无查询串）→ lightWorkerFlag 在
// worker 内恒 false → 镜像引擎 _lw=null 走本地路径,无递归。
import { assertWorkerBootGate } from './workerBootGate';   // ★首导入 boot 闸（必须保持第一位;见该文件头注,x-ray 定谳防线）
import { LightingEngine, type LightingWorld } from '../lighting/LightingEngine';
import type { TileStore } from '../world/TileStore';
import {
  SnapshotTileStore, createWorkerDriveState, runSnapshotOnEngine,
  TILE_CHAN_KEYS,
  type LightPoolMsg, type LightResyncMsg, type LightSnapshotMsg, type LightResultMsg, type ResultTriple,
} from '../lighting/LightWorkerProtocol';

assertWorkerBootGate('LightWorker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

const store = new SnapshotTileStore();
const world = { store: store as unknown as TileStore, groundLevel: 0, lavaLine: 0, clock: { timeOfDay: 0.5, dayCount: 1 } };
const engine = new LightingEngine(world as unknown as LightingWorld);
const drive = createWorkerDriveState();

// ---- ★债3 池化（2026-10-04）:结果数组池 ----
// 主线程把「被替换下方的 worker 产结果数组」随下帧快照 ret 字段 transfer 回来;
// 发布面（processBlurAndPresent 尺寸失配分支,上帧数组已 transfer detached →
// length=0 恒失配）先池取,池空/尺寸失配才 new——稳态双端零分配闭环（~83KB/帧
// 的外部内存 malloc/free churn 归零）。退役队列范式扩展:池内三元组恒非
// store/发布面当前内容（收包点在 runSnapshotOnEngine 之前,取用点在其发布面）。
const resultPool: ResultTriple[] = [];
let resPoolTakes = 0;
let resPoolMisses = 0;
engine.pubPool = (need: number): [Uint8Array, Uint8Array, Uint8Array] | null => {
  for (let i = 0; i < resultPool.length; i++) {
    const t = resultPool[i];
    if (t.R.length === need && t.G.length === need && t.B.length === need) {
      resultPool.splice(i, 1);
      resPoolTakes++;
      return [t.R, t.G, t.B];
    }
  }
  resPoolMisses++;
  return null;
};

self.onmessage = (e: MessageEvent) => {
  const m = e.data as LightSnapshotMsg;
  if (m.op !== 'frame') return;
  try {
    // ★债3:主线程回送的退役结果数组入池（compute 前入池=本帧发布面即可取用;
    // 深度 4 封顶,溢出弃=仅失回收）
    if (m.ret !== undefined) {
      for (const t of m.ret) {
        if (t.R.length === 0 || t.R.buffer.byteLength === 0) continue;
        if (resultPool.length >= 4) resultPool.shift();
        resultPool.push(t);
      }
    }
    // ★C9d2 差量防御门:delta 帧而影子缺失/尺寸失配（正常由主线程 planFull 保证
    // 不触发）→ resync 请求全量,不烧帧
    if (!drive.deltaDec.readyFor(m)) {
      const rs: LightResyncMsg = { op: 'resync' };
      self.postMessage(rs);
      return;
    }
    const out = runSnapshotOnEngine(engine, m, drive);
    const reply: LightResultMsg = { op: 'light', seq: m.seq, rx: out.rx, ry: out.ry, rw: out.rw, rh: out.rh, R: out.R, G: out.G, B: out.B };
    // ★债3 对账:结果池取/未中累计随结果回传（主线程 lwStat 镜像）
    reply.rp = { t: resPoolTakes, m: resPoolMisses };
    const transfer: ArrayBuffer[] = [out.R.buffer as ArrayBuffer, out.G.buffer as ArrayBuffer, out.B.buffer as ArrayBuffer];
    // ★债2 池化:delta 帧解码完毕的 meta/data 缓冲原样回送（transfer——编码器
    // scratch 池复用;decode 只读不写,compute 后无消费点,回送安全）
    if (m.enc === 'delta' && m.delta !== undefined) {
      reply.retDelta = { meta: m.delta.meta, data: m.delta.data };
      transfer.push(m.delta.meta.buffer as ArrayBuffer, m.delta.data.buffer as ArrayBuffer);
    }
    self.postMessage(reply, transfer);
    // ★C9d2 Layer 1:legacy 全量帧 tile 缓冲回池（transfer 往返,主线程 buildSlice
    // 稳态零重分配）。compute 完毕后 store 通道引用随 adopt 下帧整体替换,回传安全。
    if (m.enc === undefined) {
      const t = m.tiles;
      const bufs = TILE_CHAN_KEYS.map((k) => (t[k] as Uint16Array | Uint8Array).buffer).filter((b) => b.byteLength > 0);
      const pool: LightPoolMsg = { op: 'pool', seq: m.seq, tiles: t };
      self.postMessage(pool, bufs);
    } else {
      // ★transferable 化（2026-10-04）:'full' 锚帧数组 transfer 进场即解码器新影子,
      // 被换下的旧 spare/失配旧影子经退役队列 'pool' 回传主线程入池（与 legacy
      // 同通道;退役包恒非 store 当前内容,回传安全）——稳态全量帧零分配闭环。
      for (const rt of drive.deltaDec.drainRetired()) {
        const bufs = TILE_CHAN_KEYS.map((k) => (rt[k] as Uint16Array | Uint8Array).buffer).filter((b) => b.byteLength > 0);
        if (bufs.length > 0) {
          const pool: LightPoolMsg = { op: 'pool', seq: m.seq, tiles: rt };
          self.postMessage(pool, bufs);
        }
      }
    }
  } catch (err) {
    self.postMessage({ op: 'error', message: String(err).slice(0, 200) });
  }
};
