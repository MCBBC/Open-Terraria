// ★C9d2 二期快照差量化单测（2026-09-28;?lightdelta=1 灰度面）:
//   ① TileStore 写日志记账面——16 变更原语全部推送、无变化不推送、silent 族照推;
//   ② 编码器 plan 决策——首帧/区域跳变>48 格/尺寸变/日志溢出/内容脏门 → 全量;
//   ③ 编码-解码往返位等价——多帧演化（移动/写/暴露带）重建 ≡ fresh buildSlice;
//   ④ 解码器防御面——影子缺失 readyFor=false（resync 门）/dv 版本拒收。
// 多帧光照输出位等价（本地 ≡ worker 差量路径,R/G/B 逐位）在 tests/light-worker-parity。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import {
  LightDeltaEncoder, LightDeltaDecoder, sliceGeometry, allocSliceChannels,
  LIGHT_DELTA_JUMP_TILES, LIGHT_DELTA_LOG_CAP, LIGHT_DELTA_VERSION,
  type TileSlicePack,
} from '../src/lighting/LightWorkerProtocol';
import { LightWorkerLink, lightWorkerStats } from '../src/lighting/LightWorkerLink';

const W = 48, H = 40;

function buildStore(): TileStore {
  const st = new TileStore(W, H);
  for (let x = 0; x < W; x++) st.setTile(x, 20, 1);        // 地板（走原语=入日志,首帧前清即可）
  for (let y = 0; y < 20; y++) st.setWall(10, y, 1);
  return st;
}

/** 全通道逐位比对（首差报通道+索引） */
function expectChannelsEqual(a: TileSlicePack, b: TileSlicePack, tag: string): void {
  expect(b.sw).toBe(a.sw); expect(b.sh).toBe(a.sh);
  for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const va = a[k], vb = b[k];
    for (let i = 0; i < va.length; i++) {
      if (va[i] !== vb[i]) throw new Error(`${tag} ${k}[${i}] 分歧: expect=${va[i]} got=${vb[i]}`);
    }
  }
}

describe('C9d2 ① TileStore 写日志记账面', () => {
  it('16 变更原语推送;同值写/液面不推送;silent 族照推', () => {
    const st = buildStore();
    const log: number[] = [];
    st.tileWriteLog = log;
    // 有变化原语（各通道族）
    st.setTile(1, 1, 5); st.setTileSilent(2, 1, 6);
    st.setHalfBrick(3, 1, true); st.setSlope(4, 1, 2);
    st.deactivateTile(5, 1);
    st.setWall(6, 1, 3); st.setWallSilent(7, 1, 4);
    st.setPaint(8, 1, 5); st.setPaintSilent(9, 1, 6);
    st.setPaintWall(11, 1, 7); st.setPaintWallSilent(12, 1, 8);
    st.setCoat(13, 1, 2, 2); st.setCoatSilent(14, 1, 4, 4);
    st.setWire(15, 1, 1); st.setActuated(16, 1, true);
    st.setLiquid(17, 1, 128, 1);
    expect(log.length).toBe(16);
    const expectIdx = (x: number, y: number) => y * W + x;
    expect(log[0]).toBe(expectIdx(1, 1));
    expect(log).toContain(expectIdx(2, 1));      // setTileSilent 照推
    expect(log).toContain(expectIdx(14, 1));     // setCoatSilent 照推
    // 同值写不推送（setLiquid/setPaint/setWall/setCoat/setActuated 早退支）
    log.length = 0;
    st.setLiquid(17, 1, 128, 1);                  // 同值
    st.setPaint(8, 1, 5); st.setWall(6, 1, 3); st.setCoat(13, 1, 2, 2);
    st.setActuated(16, 1, true); st.setPaintWall(11, 1, 7);
    expect(log.length).toBe(0);
    // setTile 恒推送（无同值早退——保守方向）
    st.setTile(1, 1, 5);
    expect(log.length).toBe(1);
  });
});

describe('C9d2 ② 编码器 plan 决策', () => {
  const g = (sx: number, sy: number, sw = 40, sh = 30) => ({ sx, sy, sw, sh });
  it('首帧/跳变>48/尺寸变/日志溢出/内容脏门 → 全量;静置同窗 → delta', () => {
    const enc = new LightDeltaEncoder();
    expect(enc.planFull(g(10, 10), 0, false)).toBe(true);          // 无影子（首帧）
    enc.adoptFull({ ...allocSliceChannels(40, 30), sx: 10, sy: 10 });   // 影子几何钉 (10,10)
    expect(enc.planFull(g(10, 10), 0, false)).toBe(false);         // 同窗同尺
    expect(enc.planFull(g(10 + LIGHT_DELTA_JUMP_TILES + 1, 10), 0, false)).toBe(true);   // |59-10|=49 跳变
    expect(enc.planFull(g(10 + LIGHT_DELTA_JUMP_TILES, 10), 0, false)).toBe(false);      // |58-10|=48 阈内
    expect(enc.planFull(g(10, 10, 41, 30), 0, false)).toBe(true);  // 尺寸变
    expect(enc.planFull(g(10, 10), LIGHT_DELTA_LOG_CAP + 1, false)).toBe(true);          // 日志溢出
    expect(enc.planFull(g(10, 10), 0, true)).toBe(true);           // 内容脏门（日志空）
    expect(enc.planFull(g(10, 10), 3, true)).toBe(false);          // 日志非空:脏来自已记账原语写
    enc.noteResync();
    expect(enc.planFull(g(10, 10), 0, false)).toBe(true);          // resync 请求
  });
  it('120 tick 周期锚', () => {
    const enc = new LightDeltaEncoder();
    enc.adoptFull(allocSliceChannels(40, 30));
    const reg = g(10, 10);
    const emptySt = { w: W, type: new Uint16Array(0), flags: new Uint8Array(0), frameX: new Uint16Array(0), frameY: new Uint16Array(0), wall: new Uint16Array(0), liquid: new Uint8Array(0), liquidType: new Uint8Array(0), half: new Uint8Array(0), slope: new Uint8Array(0), wire: new Uint8Array(0), paint: new Uint8Array(0), paintWall: new Uint8Array(0), coat: new Uint8Array(0) };
    for (let i = 0; i < 120; i++) {   // 第 120 拍 plan 期触发（帧计数 120 ≥ ANCHOR_EVERY）
      expect(enc.planFull(reg, 0, false)).toBe(false);
      enc.encodeDelta(emptySt, { ...allocSliceChannels(40, 30), sx: 10, sy: 10, px: 0, py: 0, showInvisibleBlocks: false }, []);
    }
    expect(enc.planFull(reg, 0, false)).toBe(true);   // 周期锚
  });
});

describe('C9d2 ③ 编码-解码往返位等价（多帧演化）', () => {
  it('移动暴露带+写帧混合演化,重建 ≡ fresh buildSlice', () => {
    const st = buildStore();
    const log: number[] = [];
    st.tileWriteLog = log;    // 写面记账（生产 bindStore 同款）
    const enc = new LightDeltaEncoder();
    const dec = new LightDeltaDecoder();
    const link = new LightWorkerLink(enc);
    const stone = 5, torch = 4;
    let fulls = 0;

    // 帧脚本:[区域, 写面];窗口 rw=20,rh=14（plan 决策随行——世界 48 宽,近边窗口收窄触发重锚）
    const script: Array<{ rx: number; ry: number; write?: () => void; expectEmpty?: boolean }> = [
      { rx: 14, ry: 12 },
      { rx: 16, ry: 12 },                                                       // 右移 2（右暴露带）
      { rx: 16, ry: 12, write: () => { st.setTile(20, 15, torch); st.setLiquid(22, 16, 200, 1); } },
      { rx: 18, ry: 13, write: () => { st.setTile(24, 18, stone); st.setWall(25, 18, 9); st.setPaint(24, 18, 3); } },
      { rx: 18, ry: 13, expectEmpty: true },                                    // 静置
      { rx: 12, ry: 10 },                                                       // 左上移（双暴露带）
      { rx: 12, ry: 10, write: () => { st.setHalfBrick(20, 19, true); st.setSlope(21, 19, 1); st.setWire(22, 19, 3); } },
      { rx: 1, ry: 1 },                                                         // 近世界边缘（窗口钳制→重锚）
      { rx: 0, ry: 0 },                                                         // px=py=0 折叠带
      { rx: 0, ry: 0, write: () => { st.setCoat(5, 5, 2, 2); st.setActuated(6, 5, true); } },
      { rx: 0, ry: 0, expectEmpty: true },
    ];
    for (let f = 0; f < script.length; f++) {
      const fr = script[f];
      if (fr.write) fr.write();
      const reg = sliceGeometry(st, fr.rx, fr.ry, 20, 14);
      const fresh = link.buildSlice(st, fr.rx, fr.ry, 20, 14);
      let decoded: TileSlicePack;
      if (enc.planFull(reg, log.length, false)) {
        // 全量锚帧（首帧/尺寸变——生产 send() 语义:数组移交影子+克隆发送+清日志）
        enc.adoptFull(fresh);
        log.length = 0;
        decoded = dec.decode({ op: 'frame', seq: f, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0,
          tiles: fresh } as unknown as Parameters<typeof dec.decode>[0]);
        fulls++;
      } else {
        const out = enc.encodeDelta(st, reg, log);
        log.length = 0;                                    // 生产 send() 清空语义
        if (fr.expectEmpty) expect(out.meta[0]).toBe(0);
        decoded = dec.decode({ op: 'frame', seq: f, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
          tiles: reg, delta: { dv: LIGHT_DELTA_VERSION, meta: out.meta, data: out.data } } as unknown as Parameters<typeof dec.decode>[0]);
      }
      expectChannelsEqual(fresh, decoded, `f${f}`);
    }
    expect(fulls).toBe(5);   // f0 锚 + f3/f5/f7/f8 窗口尺寸变化重锚（近边窗钳制使 sw 随 rx 变化）
  });

  it('未记账变更（直写面）+ 锚帧自愈', () => {
    const st = buildStore();
    const log: number[] = [];
    st.tileWriteLog = log;
    const enc = new LightDeltaEncoder();
    const dec = new LightDeltaDecoder();
    const link = new LightWorkerLink(enc);
    // f0 全量
    const full0 = link.buildSlice(st, 14, 12, 20, 14);
    enc.adoptFull(full0);
    dec.decode({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: full0 } as never);
    // f1 直写面变更（绕过原语=漏记模拟）:delta 空 → 重建保持影子旧值,与世界分歧
    const wi = 16 * W + 15;                       // 世界格 (15,16)
    st.type[wi] = 8;
    const g1 = sliceGeometry(st, 14, 12, 20, 14);
    const out1 = enc.encodeDelta(st, g1, []);
    const dec1 = dec.decode({ op: 'frame', seq: 1, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
      tiles: g1, delta: { dv: 1, meta: out1.meta, data: out1.data } } as never);
    const idx1 = 16 * g1.sw + 15;                 // 局部格 (15,16) = 世界 (15,16)（窗原点 (0,0):ry=12<16 钳制）
    expect(dec1.type[idx1]).toBe(0);              // 重建=影子旧值（空气）
    expect(dec1.type[idx1]).not.toBe(8);          // 与世界分歧（漏记面,登记债语义）
    // 锚帧拉平（resync/周期锚语义=全量重锚）
    enc.noteResync();
    const full2 = link.buildSlice(st, 14, 12, 20, 14);
    enc.adoptFull(full2);
    const dec2 = dec.decode({ op: 'frame', seq: 2, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: full2 } as never);
    expectChannelsEqual(full2, dec2, 'anchor');
    expect(dec2.type[idx1]).toBe(8);              // 锚帧后自愈
  });
});

describe('C9d2 ④ 解码器防御面 + link plan 接线', () => {
  it('delta 无影子 → readyFor=false（resync 门）;dv 版本拒收', () => {
    const dec = new LightDeltaDecoder();
    const g = sliceGeometry({ w: W, h: H, showInvisibleBlocks: false }, 14, 12, 20, 14);
    const msg = { op: 'frame', seq: 0, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0, tiles: g,
      delta: { dv: 1, meta: new Uint32Array([0]), data: new Uint8Array(0) } } as never;
    expect(dec.readyFor(msg)).toBe(false);      // 无影子 → resync
    expect(dec.readyFor({ op: 'frame', seq: 0, enc: 'full', tiles: g } as never)).toBe(true);
    expect(() => dec.decode(msg)).toThrow();
    // dv 版本拒收（有影子）
    dec.decode({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: g } as never);
    const bad = { op: 'frame', seq: 1, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0, tiles: g,
      delta: { dv: LIGHT_DELTA_VERSION + 1, meta: new Uint32Array([0]), data: new Uint8Array(0) } } as never;
    expect(() => dec.decode(bad)).toThrow(/version/);
  });

  it('link.buildWorkerTiles:注入编码器后 全量→delta 帧免切片;内容脏门→全量', () => {
    const st = buildStore();
    const enc = new LightDeltaEncoder();
    const link = new LightWorkerLink(enc);
    link.bindStore(st);
    link.contentDirtyGate = () => false;
    const t0 = link.buildWorkerTiles(14, 12, 20, 14);       // 首帧 → 全量切片
    expect(t0.type.length).toBeGreaterThan(0);
    (link as unknown as { _enc: LightDeltaEncoder })._enc.adoptFull(t0);
    const t1 = link.buildWorkerTiles(14, 12, 20, 14);       // 静置同窗 → 几何帧（免切片）
    expect(t1.type.length).toBe(0);
    expect(t1.sw).toBe(t0.sw); expect(t1.sh).toBe(t0.sh); expect(t1.px).toBe(t0.px);
    link.contentDirtyGate = () => true;                     // 内容脏门（日志空）→ 全量
    const t2 = link.buildWorkerTiles(14, 12, 20, 14);
    expect(t2.type.length).toBeGreaterThan(0);
    // 写日志挂载验证:bindStore 后原语写进入 link 日志
    expect(st.tileWriteLog).not.toBeNull();
    st.setTile(3, 3, 7);
    expect(st.tileWriteLog!.length).toBe(1);
  });
});

// ★transferable 化（2026-10-04）:全量锚帧 13 通道 transfer 发送（结构克隆退役）+
// 解码器退役缓冲 'pool' 回池闭环。锁三面:
//   ① 解码器退役队列（被换下旧 spare / 失配旧影子;drain 清空幂等）;
//   ② link 'pool' 回传 → 池命中（poolHits++,同引用弹出=稳态零重分配）;
//   ③ 编码器影子=纯几何记账（通道 detach 后 plan/编码行为不变——主线程 send 后
//      弃权内容面是 transfer 的前提不变式）。
describe('C9d2 ⑤ transferable 回池闭环', () => {
  const KEYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  const fullMsg = (t: TileSlicePack): Parameters<LightDeltaDecoder['decode']>[0] =>
    ({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: t } as never);

  it('① 解码器退役队列:首锚无退役;第 3 锚起旧 spare 退役;drain 清空', () => {
    const dec = new LightDeltaDecoder();
    const p1 = allocSliceChannels(40, 30), p2 = allocSliceChannels(40, 30), p3 = allocSliceChannels(40, 30);
    dec.decode(fullMsg(p1));
    expect(dec.drainRetired()).toEqual([]);              // 首锚:无退役
    dec.decode(fullMsg(p2));
    expect(dec.drainRetired()).toEqual([]);              // p1 → spare(下帧解码目标),无退役
    dec.decode(fullMsg(p3));
    const r = dec.drainRetired();
    expect(r.length).toBe(1);
    expect(r[0]).toBe(p1);                               // 旧 spare 退役（非 store 内容）
    expect(dec.drainRetired()).toEqual([]);              // drain 幂等清空
    // 尺寸失配 'full':旧影子同帧退役
    const q = allocSliceChannels(20, 14);
    const old = allocSliceChannels(40, 30);
    dec.decode(fullMsg(old));
    dec.decode(fullMsg(q));                              // 40×30 影子 ≠ 20×14 收包
    const r2 = dec.drainRetired();
    expect(r2.some((t) => t === old)).toBe(true);
  });

  it('② link 池闭环:worker 回传包入池 → buildSlice 同引用弹出命中（poolHits++）', () => {
    const st = buildStore();
    const link = new LightWorkerLink(new LightDeltaEncoder());
    link.bindStore(st);
    const s0 = lightWorkerStats();
    const a = link.buildSlice(st, 14, 12, 20, 14);       // 池空 → miss
    const s1 = lightWorkerStats();
    expect(s1.poolMisses - s0.poolMisses).toBe(1);
    // 模拟 worker 'pool' 回传（退役包/legacy 直回统一走 recycleSlice）
    (link as unknown as { recycleSlice(t: TileSlicePack): void }).recycleSlice(a);
    const b = link.buildSlice(st, 14, 12, 20, 14);       // 命中:同引用弹出
    const s2 = lightWorkerStats();
    expect(b).toBe(a);
    expect(s2.poolHits - s1.poolHits).toBe(1);
    expect(s2.poolMisses - s1.poolMisses).toBe(0);
  });

  it('③ 编码器影子=纯几何:通道 detach（transfer 语义）后 plan/编码不变', () => {
    const st = new TileStore(120, 120);                  // 大世界:容纳同尺寸窗平移
    const enc = new LightDeltaEncoder();
    const link = new LightWorkerLink(enc);
    link.bindStore(st);
    const t0 = link.buildSlice(st, 30, 30, 20, 14);
    enc.adoptFull(t0);
    // 模拟 postMessage(transfer):通道 buffer 移交 worker → 主线程视图 detach(长度 0)
    for (const k of KEYS) {
      const Ctor = (t0[k] as Uint16Array).constructor as new (n: number) => Uint16Array;
      (t0 as unknown as Record<string, Uint16Array | Uint8Array>)[k] = new Ctor(0);
    }
    expect(enc.hasShadow(t0.sw, t0.sh)).toBe(true);
    // 平移 4 格同尺寸窗 → 不触发全量（几何记账唯一依据）;空日志 → 暴露带跨度照常发射
    const g1 = sliceGeometry(st, 34, 30, 20, 14);
    expect(g1.sw).toBe(t0.sw); expect(g1.sh).toBe(t0.sh);
    expect(enc.planFull(g1, 0, false)).toBe(false);
    const out = enc.encodeDelta(st, g1, []);
    expect(out.meta[0]).toBeGreaterThan(0);              // 暴露带跨度发射（值读世界真值,不读影子）
  });
});
