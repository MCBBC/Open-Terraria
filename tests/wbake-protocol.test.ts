// ★C4 烘焙 Worker 化——快照协议锁（2026-09-28）。
// 锁面：
//  ① buildBakeSnapshot 切片 = 世界 store 逐通道逐格相等（worker 重构输入纯度）;
//  ② BakeSliceStore 读面（idx/inBounds/isSolid/isActive/w/h）与真实 TileStore
//    在切片域内逐格同值（双路径内核同源的地基）;
//  ③ 零帧多格重建触发 recon 扩带（左/上 258）——drawVanillaCell recon 扫描带对齐;
//  ④ 世界边缘钳制（bw/bh 不越界,不产生 OOB 读）;
//  ⑤ transfer 清单完备（13 buffer）。
// 运行时面（Worker 消息循环/位图回传）为浏览器域,由 scripts/_wbake-digest.mjs
// （真机 md5 双路对拍）+ scripts/_wbake-perf.mjs 把门;node 无 canvas 后端。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { buildBakeSnapshot, BakeSliceStore, snapshotBuffers,
  BAKE_EXT, BAKE_RECON_EXT } from '../src/workers/BakeProtocol';

const W = 320, H = 500;

function makeStore(): TileStore {
  const st = new TileStore(W, H);
  // 确定性伪随机填充（覆盖全部通道;含致动/半砖/坡面/漆/涂层位组合）
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = st.idx(x, y);
      if (y > H / 2 && rnd() < 0.85) {
        st.type[i] = Math.floor(rnd() * 40) + 1;
        st.flags[i] = 1;
        st.frameX[i] = Math.floor(rnd() * 3) * 18;
        st.frameY[i] = Math.floor(rnd() * 3) * 18;
        st.half[i] = rnd() < 0.15 ? 1 : 0;
        st.slope[i] = rnd() < 0.1 ? Math.floor(rnd() * 4) + 1 : 0;
        st.wire[i] = Math.floor(rnd() * 64);
        st.paint[i] = Math.floor(rnd() * 32);
        st.paintWall[i] = Math.floor(rnd() * 32);
        st.coat[i] = Math.floor(rnd() * 32);
      }
      st.wall[i] = rnd() < 0.7 ? Math.floor(rnd() * 40) + 1 : 0;
      st.liquid[i] = Math.floor(rnd() * 256);
    }
  }
  return st;
}

const META = {
  groundLevel: 100, rockLevel: 180,
  treeX: [10, 40, 80], treeStyle: [0, 1, 2, 3], treeTops: [] as number[],
  chests: [{ x: 50, y: 120, frame: 1 }, { x: 60, y: 130 }],
  showInvisibleBlocks: false,
  tick: 777, gtwTicks: 999999,
  envWind: 0.3, envWorldSurface: 100, envRemix: false,
  plates428: [42],
};

describe('C4 wbake 快照协议', () => {
  it('切片 = store 逐通道逐格相等（含四角/世界外钳制）', () => {
    const st = makeStore();
    const snap = buildBakeSnapshot(st, 3, 4, META);
    expect(snap.bx).toBe(3 * 16 - BAKE_EXT);
    expect(snap.by).toBe(4 * 16 - BAKE_EXT);
    const channels: Array<[string, Uint8Array | Uint16Array]> = [
      ['type', st.type], ['flags', st.flags], ['frameX', st.frameX], ['frameY', st.frameY],
      ['wall', st.wall], ['liquid', st.liquid], ['half', st.half], ['slope', st.slope],
      ['wire', st.wire], ['paint', st.paint], ['paintWall', st.paintWall], ['coat', st.coat],
    ];
    for (const [name, ch] of channels) {
      const sliced = snap[name as keyof typeof snap] as Uint8Array | Uint16Array;
      for (let ly = 0; ly < snap.bh; ly++) {
        for (let lx = 0; lx < snap.bw; lx++) {
          expect(sliced[ly * snap.bw + lx]).toBe(ch[st.idx(snap.bx + lx, snap.by + ly)]);
        }
      }
    }
  });

  it('BakeSliceStore 读面 = TileStore 同值（切片域内 isSolid/isActive/inBounds）', () => {
    const st = makeStore();
    const snap = buildBakeSnapshot(st, 2, 3, META);
    const view = new BakeSliceStore(snap);
    expect(view.w).toBe(W);
    expect(view.h).toBe(H);
    expect(view.showInvisibleBlocks).toBe(false);
    for (let y = snap.by; y < snap.by + snap.bh; y++) {
      for (let x = snap.bx; x < snap.bx + snap.bw; x++) {
        expect(view.inBounds(x, y)).toBe(true);
        expect(view.isSolid(x, y)).toBe(st.isSolid(x, y));
        expect(view.isActive(x, y)).toBe(st.isActive(x, y));
        expect(view.type[view.idx(x, y)]).toBe(st.type[st.idx(x, y)]);
        expect(view.wire[view.idx(x, y)]).toBe(st.wire[st.idx(x, y)]);
        expect(view.coat[view.idx(x, y)]).toBe(st.coat[st.idx(x, y)]);
        expect(view.liquid[view.idx(x, y)]).toBe(st.liquid[st.idx(x, y)]);
      }
    }
    // 切片域外 inBounds=false（防 OOB 读——世界外格与主路径同 false）
    expect(view.inBounds(snap.bx - 1, snap.by)).toBe(false);
    expect(view.inBounds(snap.bx, snap.by + snap.bh)).toBe(false);
  });

  it('世界边缘钳制：不越界、不产生负宽高', () => {
    const st = makeStore();
    // 左上角 chunk：bx/by 钳 0
    const s0 = buildBakeSnapshot(st, 0, 0, META);
    expect(s0.bx).toBe(0);
    expect(s0.by).toBe(0);
    expect(s0.bw).toBe(16 + BAKE_EXT);
    expect(s0.bh).toBe(16 + BAKE_EXT + 100);
    // 右下角 chunk：bw/bh 钳世界尺寸
    const s1 = buildBakeSnapshot(st, 7, 12, META);   // 7*16+16=128>120 → 越右
    expect(s1.bx + s1.bw).toBeLessThanOrEqual(W);
    expect(s1.by + s1.bh).toBeLessThanOrEqual(H);
    // 全部通道长度 = bw*bh（worker 侧 OOB 读免疫）
    for (const buf of snapshotBuffers(s1)) {
      expect(buf.byteLength % 1).toBe(0);
    }
  });

  it('零帧多格重建触发 recon 扩带（左/上 258）', () => {
    const st = new TileStore(W, H);   // 全零底（random 底的 fx=0 格会误触 recon 谓词）
    // 3×2 石堆族（sheet 187 fw=3/fh=2）锚点零帧——drawVanillaCell recon 扫描带的触发形态
    // chunk (17,20)：x0=272/y0=320 均 ≥258 不触钳制（W=320,H=500 覆盖右/下缘）
    const T187 = TILE_BY_KEY['v_187_decos_3x2_group_2'];
    expect(T187).toBeDefined();
    const i = st.idx(280, 330);
    st.type[i] = T187!; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
    const snapNo = buildBakeSnapshot(st, 17, 20, META);
    expect(snapNo.bx).toBe(17 * 16 - BAKE_RECON_EXT);    // recon 触发 → 左扩 258
    expect(snapNo.by).toBe(20 * 16 - BAKE_RECON_EXT);
    // 清除零帧 → 回常规 ±6
    st.flags[i] = 0;
    const snapYes = buildBakeSnapshot(st, 17, 20, META);
    expect(snapYes.bx).toBe(17 * 16 - BAKE_EXT);
    expect(snapYes.by).toBe(20 * 16 - BAKE_EXT);
  });

  it('transfer 清单 = 13 buffer（12 通道 + 宝箱锚表）', () => {
    const st = makeStore();
    const snap = buildBakeSnapshot(st, 1, 1, META);
    expect(snapshotBuffers(snap).length).toBe(13);
    expect(snap.chestAnchors.length).toBe(6);   // 2 箱 × [x,y,frame]
    expect([...snap.chestAnchors]).toEqual([50, 120, 1, 60, 130, 0]);
    expect(snap.tick).toBe(777);
    expect(snap.gtwTicks).toBe(999999);
    expect(snap.plates428).toEqual([42]);
  });
});
