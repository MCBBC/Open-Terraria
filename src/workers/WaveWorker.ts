// ★C8 波场模拟 Worker（2026-09-23；渲染改造方案追加刀——用户实测 Windows 弱机
//  _step 死亡螺旋：水体多 → 波场 11 万格弱 CPU 单线程 ~8ms → 帧超 18.75ms →
//  dt 补偿 2 步 → 成本 ×2 → 30fps 锁死 + GPU 35% 空转。Worker 化 = 模拟整体
//  移出主线程，核不动（同一模块实例=内核逐式同源），螺旋在 worker 线程无害化。
//
// 协议（主线程 WaterWaves 门面 capture 模式 ↔ 本 worker）：
//   main→worker: {op:'quality', q} | {op:'tex', ripple:Uint8ClampedArray}（一次性;
//                ★2026-09-23 修复案:worker 模块实例无 document,ensureWaveTextures
//                不可达,不喂则 _drawRipples 的 !_rippleData 门把涟漪整批清队）
//              | {op:'frame', inp, inj:[...]}（注入批量随帧）
//              | {op:'resync'}（★C8-D 主线程丢 delta 帧/网格失配 → 下场强制全量）
//   worker→main: {op:'field', ...场消息}——★C8-D（2026-09-25）三形态
//                 （fmt:'full' 字节全量 / 'delta' 脏区增量 / 'f32' 旧全量逃生,
//                 编码与保底锚帧判据见 WaterWaves.ts C8-D 段）,buffer 全走
//                 transfer list（★R3-F2 零拷贝语义沿用;回传后 worker 侧即弃,
//                 detach 即弃——capture-protocol 判例「主线程收达数组不得再被
//                 worker 引用」）。
// 同步纪律：主线程零阻塞（全异步 postMessage）；场消息原子应用；注入锚=F_prev
//   （注入批先于 frame 应用=天然 F_prev 语义,与主线程版时序同构）。
// 本 worker 导入 WaterWaves 模块本体=内核逐式同源（零转录）；模块级 DOM 触点
//   （ensureWaveTextures 的 canvas）在 worker 内永不调用。
import { assertWorkerBootGate } from './workerBootGate';   // ★首导入 boot 闸（必须保持第一位;见该文件头注,x-ray 定谳防线）
import { waterWaves, queueRippleRaw, setWaveTextures, wwCameraJumpForceFull,
  type RippleShape, type WWFieldMsg } from '../render/WaterWaves';

assertWorkerBootGate('WaveWorker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

type Inj =
  | { k: 'wash'; a: number[] }
  | { k: 'rippleRaw'; a: number[] }
  | { k: 'camera'; a: number[] };

// ★C8-D 全量锚帧状态：首场必全量（主线程影子未建）;换档/resync/相机大跳置位。
let forceFull = true;
/** 上帧滚动偏移 F（texel;大跳判据状态,wwCameraJumpForceFull 消费） */
let lastF: readonly [number, number] | null = null;

self.onmessage = (e: MessageEvent) => {
  const m = e.data as
    | { op: 'quality'; q: number }
    | { op: 'tex'; ripple: Uint8ClampedArray }
    | { op: 'resync' }
    | { op: 'frame'; inp: unknown; inj: Inj[] };
  if (m.op === 'quality') {
    waterWaves.setQuality(m.q);
    forceFull = true;   // ★C8-D：换档（主线程同帧本地清缓冲）→ 全量锚对齐两侧
    return;
  }
  if (m.op === 'resync') {
    forceFull = true;   // ★C8-D：主线程丢 delta 帧 → 下场全量重锚
    return;
  }
  if (m.op === 'tex') {
    // Ripples 64×128 灰度形状表（noise 不需要：sampleDisplace/sampleGlint 是
    // 主线程读侧;模拟内核 _step 与 injectWash 均无纹理依赖）
    setWaveTextures(null, { data: m.ripple });
    return;
  }
  if (m.op === 'frame') {
    for (const inj of m.inj) {
      if (inj.k === 'wash') {
        const [cx, cy, qw, qh, fx, fy, st] = inj.a;
        waterWaves.injectWash(cx, cy, qw, qh, fx, fy, st);
      } else if (inj.k === 'rippleRaw') {
        const [x, y, sx, sy, colR, colG, colA, shape, rot] = inj.a as [number, number, number, number, number, number, number, RippleShape, number];
        queueRippleRaw(x, y, sx, sy, colR, colG, colA, shape, rot);
      } else if (inj.k === 'camera') {
        const [x, y, z] = inj.a;
        waterWaves.setCamera(x, y, z);
      }
    }
    waterWaves.frame(m.inp as Parameters<typeof waterWaves.frame>[0]);
    // ★C8-D 相机大跳判据：F 位移 >8 texel（传送/respawn/大甩镜）→ 本场全量锚
    // （正常行走 ΔF∈{0,±1} 恒不触发;纯保底,delta 语义本身对大跳已精确）。
    const inp = m.inp as { camX: number; camY: number; zoom: number };
    const jump = wwCameraJumpForceFull(lastF, inp.camX, inp.camY, inp.zoom);
    lastF = jump[1];
    // 场消息回传。★R3-F2 transferable 零拷贝沿用 + ★C8-D 脏区增量：常规帧走
    // exportFieldDelta（静水 ~4B/帧 vs 旧全量 ~1MB/帧,收益账见 C8-D 段注释）;
    // 全量改 2B/格字节快照。所有权单向:postMessage 后 worker 侧副本 detach 即弃
    // （本 handler 立即返回,无再引用面;scratch 本体留 worker 复用）。
    const snap: WWFieldMsg = waterWaves.exportFieldDelta(forceFull || jump[0]);
    forceFull = false;
    const transfer: Transferable[] = snap.fmt === 'delta'
      ? [snap.meta.buffer, snap.data.buffer]
      : [snap.R.buffer, snap.G.buffer];
    self.postMessage({ op: 'field', ...snap }, transfer);
  }
};
