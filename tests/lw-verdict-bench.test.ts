// 临时定谳 bench(二期驻留管线):exportTo-WASM/blur 的拷入拷出分段分解。
// 跑完即删(结论归档案);数字口径=min-of-40,node 域 M 系列。
import { describe, it, expect } from 'vitest';
import { LightMap } from '../src/lighting/LightMap';
import { TileLightScanner, getScanTablesPayload, type ScannerWorld } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { FastRandom } from '../src/lighting/FastRandom';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { updateLightDecay, DECAY_AIR, DECAY_SOLID, DECAY_CRACKED, DECAY_WATER, DECAY_HONEY } from '../src/lighting/lightTables';
import {
  ensureLightWasm, lightWasmEnabled, lightWasmReady, __setLightWasmFlagForTest,
  __lightWasmExportsForTest, __resetLightWasmForTest, lightWasmExportScan,
} from '../src/wasm/lightWasm';

function bySheet(s: number): number {
  return TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
}

function buildGameWorld(W: number, H: number, GROUND: number, LAVA: number): TileStore {
  const st = new TileStore(W, H);
  const dirt = bySheet(0), stone = bySheet(1), torch = bySheet(4), glass = bySheet(54);
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y <= GROUND + 4; y++) st.setTile(x, y, dirt);
    for (let y = GROUND + 40; y <= GROUND + 52; y++) st.setTile(x, y, stone);
    for (let y = LAVA + 2; y < H; y++) st.setTile(x, y, stone);
  }
  for (let x = 4; x < W; x += 16) st.setTile(x, GROUND - 1, torch, 0, (x % 6) * 22);
  for (let x = 10; x < Math.min(30, W); x++) st.setTile(x, GROUND - 2, glass);
  for (let x = 40; x < Math.min(150, W); x++) for (let y = GROUND - 3; y < GROUND; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 1;
  }
  for (let x = 0; x < W; x++) for (let y = LAVA; y < LAVA + 2; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 2;
  }
  for (let x = 0; x < W; x++) for (let y = GROUND + 6; y < H; y++) st.wall[st.idx(x, y)] = 1;
  return st;
}

function makeFlicker(): FlickerClock {
  const f = new FlickerClock();
  f.mouseTextColor = 210; f.demonTorch = 0.37;
  f.discoR = 200; f.discoG = 80; f.discoB = 40;
  Object.defineProperty(f, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  return f;
}

function makeWorld(st: TileStore, GROUND: number, LAVA: number): ScannerWorld {
  return {
    store: st, groundLevel: GROUND, lavaLine: LAVA,
    clock: { timeOfDay: 0.85, dayCount: 7, eclipse: false, bloodMoon: true, moonPhase: 4, isDay: false },
    hashOrigin: { x: 0, y: 0 },
  } as unknown as ScannerWorld;
}

const best = (n: number, f: () => void): number => {
  let b = Infinity;
  for (let k = 0; k < n; k++) {
    const t = performance.now();
    f();
    const dt = performance.now() - t;
    if (dt < b) b = dt;
  }
  return b;
};
/** 预热(强置 WASM TurboFan/JS 工具层级——产线稳态=数千帧老码,40 次调用停留
 *  Liftoff 会高估内核 2×;先轰 3000 次再量) */
const warm = (f: () => void): void => { for (let k = 0; k < 3000; k++) f(); };

describe('lw resident verdict bench', () => {
  it('segment ledger', async () => {
    __resetLightWasmForTest();
    __setLightWasmFlagForTest(true);
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    expect(await ensureLightWasm()).toBe(true);
    void getScanTablesPayload;
    const ex = __lightWasmExportsForTest()!;
    console.log('[verdict] enabled=' + lightWasmEnabled() + ' ready=' + lightWasmReady());

    const bench = (tag: string, W: number, H: number, GROUND: number, LAVA: number): void => {
      const mw = W, mh = H;
      // worker 形切片 store(区域 ±16):主核热路径口径
      const sw = W + 28, sh = H + 32;
      const rx = 14, ry = 16;
      const st = buildGameWorld(sw, sh, GROUND + 16, LAVA + 16);
      const world = makeWorld(st, GROUND + 16, LAVA + 16);
      const sc = new TileLightScanner(makeFlicker());
      (sc as unknown as { random: FastRandom }).random = new FastRandom(0x9e3779b9);
      const map = new LightMap(); map.setSize(mw, mh); map.nonVisiblePadding = 18;

      // 真实 exportTo(WASM 全含)预热 + 总账
      for (let k = 0; k < 300; k++) sc.exportTo(world, map, rx, ry, []);
      const total = best(40, () => sc.exportTo(world, map, rx, ry, []));
      // ⑪ 加载器函数直呼(lightWasmExportScan:上传+内核+读回+list;构建调用对象不计时)
      const call = {
        st, map: { w: mw, h: mh, r: map.r, g: map.g, b: map.b, mask: map.mask },
        rx, ry, hashOriginX: 0, hashOriginY: 0,
        groundLevel: GROUND + 16, lavaLine: LAVA + 16,
        seed: 0x9e3779b9, skyR: 0.3, skyG: 0.25, skyB: 0.4, dk: 0.9, swa: 0.5,
        hellR: 0.6, hellG: 0.36, hellB: 0.12, lavaV: 0.61, osc: 210,
        dr: 0.3, dg: 0.5, db: 0.2, demon: 0.37,
        cloudType: -1, cloudDay: 0,
        tables: getScanTablesPayload(),
      };
      warm(() => { lightWasmExportScan(call); });
      const loader = best(40, () => { lightWasmExportScan(call); });
      // ⑫ 加载器每调固定开销(1×1 微图;拒面之前的几何/通道装配/try 面)
      const tinyMap = { w: 1, h: 1, r: new Float32Array(1), g: new Float32Array(1), b: new Float32Array(1), mask: new Uint8Array(1) };
      const tinyCall = { ...call, map: tinyMap, rx: rx, ry: ry };
      warm(() => { lightWasmExportScan(tinyCall); });
      const loaderOverhead = best(40, () => { lightWasmExportScan(tinyCall); });

      // 分解:窗口几何(与 lightWasmExportScan 同式)
      const wx0 = Math.max(0, rx - 1), wy0 = Math.max(0, ry - 1);
      const ww = Math.min(st.w, rx + mw + 1) - wx0;
      const wh = Math.min(st.h, ry + mh + 1) - wy0;
      const nWin = ww * wh, nMap = mw * mh;
      // 真实视图(从 exports 指针构造,与加载器同式)
      const mem = ex.memory;
      const cap = 1 << 18;
      const typeV = new Uint16Array(mem.buffer, ex.lightTypeBuf(), cap);
      const flagsV = new Uint8Array(mem.buffer, ex.lightFlagsBuf(), cap);
      const fxV = new Uint16Array(mem.buffer, ex.lightFxBuf(), cap);
      const fyV = new Uint16Array(mem.buffer, ex.lightFyBuf(), cap);
      const wallV = new Uint16Array(mem.buffer, ex.lightWallBuf(), cap);
      const liqV = new Uint8Array(mem.buffer, ex.lightLiqBuf(), cap);
      const liqTV = new Uint8Array(mem.buffer, ex.lightLiqTBuf(), cap);
      const halfV = new Uint8Array(mem.buffer, ex.lightHalfBuf(), cap);
      const slopeV = new Uint8Array(mem.buffer, ex.lightSlopeBuf(), cap);
      const wireV = new Uint8Array(mem.buffer, ex.lightWireBuf(), cap);
      const paintV = new Uint8Array(mem.buffer, ex.lightPaintBuf(), cap);
      const paintWallV = new Uint8Array(mem.buffer, ex.lightPaintWallBuf(), cap);
      const coatV = new Uint8Array(mem.buffer, ex.lightCoatBuf(), cap);
      const spV = new Uint32Array(mem.buffer, ex.lightSpListBuf(), cap);
      const rV = new Float32Array(mem.buffer, ex.lightRBuf(), cap);
      const gV = new Float32Array(mem.buffer, ex.lightGBuf(), cap);
      const bV = new Float32Array(mem.buffer, ex.lightBBuf(), cap);
      const maskV = new Uint8Array(mem.buffer, ex.lightMaskBuf(), cap);
      const lutV = new Uint8Array(mem.buffer, ex.lightLutBuf(), cap);
      const chans: Array<[Uint16Array | Uint8Array, Uint16Array | Uint8Array]> = [
        [st.type, typeV], [st.flags, flagsV], [st.frameX, fxV],
        [st.frameY, fyV], [st.wall, wallV], [st.liquid, liqV],
        [st.liquidType, liqTV], [st.half, halfV], [st.slope, slopeV],
        [st.wire, wireV], [st.paint, paintV], [st.paintWall, paintWallV],
        [st.coat, coatV],
      ];

      // ① upload 行拷贝(现行产线形态)
      warm(() => {
        for (let ci = 0; ci < 13; ci++) {
          const src = chans[ci][0], dst = chans[ci][1];
          for (let y = 0; y < wh; y++) {
            const s = (wy0 + y) * st.w + wx0;
            dst.set(src.subarray(s, s + ww), y * ww);
          }
        }
      });
      const uploadRows = best(40, () => {
        for (let ci = 0; ci < 13; ci++) {
          const src = chans[ci][0], dst = chans[ci][1];
          for (let y = 0; y < wh; y++) {
            const s = (wy0 + y) * st.w + wx0;
            dst.set(src.subarray(s, s + ww), y * ww);
          }
        }
      });
      // ② 内核(窗口形参=现行;★须紧随 uploadRows 之后量——视图此刻持窗口布局真数据)
      const args = [ww, wh, rx - wx0, ry - wy0, mw, mh,
        (GROUND + 16) - wy0, (LAVA + 16) - wy0, wx0, wy0,
        0x9e3779b9, 0.3, 0.25, 0.4, 0.9, 0.5, 0.6, 0.36, 0.12, 0.61, 210, 0.3, 0.5, 0.2, 0.37, -1, 0, 0] as unknown as Parameters<typeof ex.lightExport>;
      warm(() => { ex.lightExport(...args); });
      const kernel = best(40, () => { ex.lightExport(...args); });
      // ③ upload 整片 bulk(13 次 set,无 subarray;窗口=全切片语义)
      warm(() => { for (let ci = 0; ci < 13; ci++) (chans[ci][1] as Uint16Array).set(chans[ci][0]); });
      const uploadBulk = best(40, () => {
        for (let ci = 0; ci < 13; ci++) (chans[ci][1] as Uint16Array).set(chans[ci][0]);
      });
      // ④ bulk 形参内核(stride=sw 原点=rx;★紧随 uploadBulk——视图持全切片真数据)
      const argsBulk = [st.w, st.h, rx, ry, mw, mh,
        (GROUND + 16), (LAVA + 16), 0, 0,
        0x9e3779b9, 0.3, 0.25, 0.4, 0.9, 0.5, 0.6, 0.36, 0.12, 0.61, 210, 0.3, 0.5, 0.2, 0.37, -1, 0, 0] as unknown as Parameters<typeof ex.lightExport>;
      warm(() => { ex.lightExport(...argsBulk); });
      const kernelBulk = best(40, () => { ex.lightExport(...argsBulk); });
      // 产线时序账(上传→内核紧邻,数据新鲜度=产线态;隔离热循环账低估新鲜数据成本)
      const upRowsFn = (): void => {
        for (let ci = 0; ci < 13; ci++) {
          const src = chans[ci][0], dst = chans[ci][1];
          for (let y = 0; y < wh; y++) {
            const s = (wy0 + y) * st.w + wx0;
            dst.set(src.subarray(s, s + ww), y * ww);
          }
        }
      };
      const upBulkFn = (): void => { for (let ci = 0; ci < 13; ci++) (chans[ci][1] as Uint16Array).set(chans[ci][0]); };
      warm(() => { upRowsFn(); ex.lightExport(...args); });
      const flowWin = best(40, () => { upRowsFn(); ex.lightExport(...args); });
      warm(() => { upBulkFn(); ex.lightExport(...argsBulk); });
      const flowBulk = best(40, () => { upBulkFn(); ex.lightExport(...argsBulk); });
      // ⑤ readback r/g/b/mask(现行)
      const rA = new Float32Array(nMap), gA = new Float32Array(nMap), bA = new Float32Array(nMap), mkA = new Uint8Array(nMap);
      warm(() => {
        rA.set(rV.subarray(0, nMap)); gA.set(gV.subarray(0, nMap));
        bA.set(bV.subarray(0, nMap)); mkA.set(maskV.subarray(0, nMap));
      });
      const readback = best(40, () => {
        rA.set(rV.subarray(0, nMap)); gA.set(gV.subarray(0, nMap));
        bA.set(bV.subarray(0, nMap)); mkA.set(maskV.subarray(0, nMap));
      });
      // ⑥ list slice
      const rc = ex.lightExport(...args);
      const listSlice = best(40, () => { spV.slice(0, Math.max(rc, 1)); });
      // ⑦ blur 拷入(现行 r/g/b/mask/lut)+内核+拷出
      const lut = new Uint8Array(nMap);
      warm(() => {
        rV.set(rA.subarray(0, nMap)); gV.set(gA.subarray(0, nMap)); bV.set(bA.subarray(0, nMap));
        maskV.set(mkA.subarray(0, nMap)); lutV.set(lut.subarray(0, nMap));
      });
      const blurIn = best(40, () => {
        rV.set(rA.subarray(0, nMap)); gV.set(gA.subarray(0, nMap)); bV.set(bA.subarray(0, nMap));
        maskV.set(mkA.subarray(0, nMap)); lutV.set(lut.subarray(0, nMap));
      });
      warm(() => {
        ex.lightBlur(mw, mh, 4, DECAY_AIR, DECAY_SOLID, DECAY_CRACKED,
          DECAY_WATER[0], DECAY_WATER[1], DECAY_WATER[2],
          DECAY_HONEY[0], DECAY_HONEY[1], DECAY_HONEY[2]);
      });
      const blurKernel = best(40, () => {
        ex.lightBlur(mw, mh, 4, DECAY_AIR, DECAY_SOLID, DECAY_CRACKED,
          DECAY_WATER[0], DECAY_WATER[1], DECAY_WATER[2],
          DECAY_HONEY[0], DECAY_HONEY[1], DECAY_HONEY[2]);
      });
      warm(() => {
        rA.set(rV.subarray(0, nMap)); gA.set(gV.subarray(0, nMap)); bA.set(bV.subarray(0, nMap));
      });
      const blurOut = best(40, () => {
        rA.set(rV.subarray(0, nMap)); gA.set(gV.subarray(0, nMap)); bA.set(bV.subarray(0, nMap));
      });
      // ⑧ mask 单通道拷出(驻留方案 scan 段新成本)
      const maskOut = best(40, () => { mkA.set(maskV.subarray(0, nMap)); });
      // ⑨ lut 拷入(驻留方案 blur 段新成本)
      const lutIn = best(40, () => { lutV.set(lut.subarray(0, nMap)); });
      // ⑩ present 导出环
      const pub = new Uint8Array(nMap);
      warm(() => {
        const scale = 1.2 * 255;
        for (let i = 0; i < nMap; i++) {
          const vr = rA[i] * scale;
          pub[i] = vr >= 255 ? 255 : vr | 0;
        }
      });
      const present = best(40, () => {
        const scale = 1.2 * 255;
        for (let i = 0; i < nMap; i++) {
          const vr = rA[i] * scale;
          pub[i] = vr >= 255 ? 255 : vr | 0;
        }
      });
      void pub;
      const bytesUpRows = 8 * nWin + 9 * nWin;
      console.log(`[verdict] ${tag}: nMap=${nMap} nWin=${nWin} rc=${rc}
  uploadRows=${uploadRows.toFixed(4)}ms (${(bytesUpRows / 1e3 | 0)}KB, ${13 * wh} 段小拷贝)
  uploadBulk=${uploadBulk.toFixed(4)}ms (${(st.w * st.h * 17 / 1e3 | 0)}KB, 13 段整拷)
  kernel(win)=${kernel.toFixed(4)}ms  kernel(bulk)=${kernelBulk.toFixed(4)}ms
  flowWin(行拷+内核,产线时序)=${flowWin.toFixed(4)}ms  flowBulk(整片+内核)=${flowBulk.toFixed(4)}ms  净差=${(flowWin - flowBulk).toFixed(4)}ms
  readback=${readback.toFixed(4)}ms (${((nMap * 13 / 1e3) | 0)}KB)
  listSlice=${listSlice.toFixed(4)}ms
  exportTo(WASM 全含)=${total.toFixed(4)}ms → JS 壳+标量+尾段≈${(total - loader).toFixed(4)}ms (loader=${loader.toFixed(4)}, 其中每调固定开销≈${loaderOverhead.toFixed(4)}, 分解和=${(uploadRows + kernel + readback + listSlice).toFixed(4)})
  blurIn=${blurIn.toFixed(4)}ms (${((nMap * 14 / 1e3) | 0)}KB)  blurKernel=${blurKernel.toFixed(4)}ms  blurOut=${blurOut.toFixed(4)}ms (${((nMap * 12 / 1e3) | 0)}KB)
  maskOut(驻留新)=${maskOut.toFixed(4)}ms  lutIn(驻留新)=${lutIn.toFixed(4)}ms
  present=${present.toFixed(4)}ms
  ---- 上界:CutA(免读回+list)=${(readback + listSlice).toFixed(4)}  CutB(blur 免拷入,留 lut)=${(blurIn - lutIn).toFixed(4)}  CutD(rows→bulk)=${(uploadRows - uploadBulk).toFixed(4)}`);
    };
    bench('1080p 181x129', 181, 129, 60, 100);
    bench('zoom-out 303x201', 303, 201, 80, 140);
    __setLightWasmFlagForTest(null);
  });
});
