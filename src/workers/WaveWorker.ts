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
//   worker→main: {op:'field', R:Float32Array(transferable), gW, gH, progress,
//                 intensity, waveOff:[x,y], cam:[x,y,zoom]}——R/G buffer 走
//                 transfer list（★R3-F2 零拷贝;worker 侧副本 detach 即弃）
// 同步纪律：主线程零阻塞（全异步 postMessage）；场快照原子替换；注入锚=F_prev
//   （注入批先于 frame 应用=天然 F_prev 语义,与主线程版时序同构）。
// 本 worker 导入 WaterWaves 模块本体=内核逐式同源（零转录）；模块级 DOM 触点
//   （ensureWaveTextures 的 canvas）在 worker 内永不调用。
import { waterWaves, queueRippleRaw, setWaveTextures, type RippleShape } from '../render/WaterWaves';

type Inj =
  | { k: 'wash'; a: number[] }
  | { k: 'rippleRaw'; a: number[] }
  | { k: 'camera'; a: number[] };

self.onmessage = (e: MessageEvent) => {
  const m = e.data as
    | { op: 'quality'; q: number }
    | { op: 'tex'; ripple: Uint8ClampedArray }
    | { op: 'frame'; inp: unknown; inj: Inj[] };
  if (m.op === 'quality') {
    waterWaves.setQuality(m.q);
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
    // 场快照回传。★R3-F2（2026-09-25 红蓝批 B）：transferable 零拷贝——slice 产
    //  独立 buffer 副本（本体 _R/_G 留 worker 继续步进,不受 detach 影响）,buffer
    //  转移主线程=旧结构克隆 125-180MB/s churn 清零;量化收益注释见 exportFieldSnapshot。
    //  所有权单向:postMessage 后 worker 侧副本 detach 即弃（本 handler 立即返回,
    //  无再引用面）——capture-protocol 判例「主线程收达数组不得再被 worker 引用」。
    const snap = waterWaves.exportFieldSnapshot();
    self.postMessage({ op: 'field', ...snap }, [snap.R.buffer, snap.G.buffer]);
  }
};
