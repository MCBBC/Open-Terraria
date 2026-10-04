// WASM 加载器与回退架构 —— 光照 blur 核(2026-10-03 第二刀;sm2Wasm.ts 同构复制面)。
// 架构总纲见 src/wasm/README.md;四约定:
// ①特性检测:typeof WebAssembly==='object' + 异步实例化失败 → JS 回退(本文件所有
//   出口 false/拒=回退信号,调用方必须实现 JS 原路径——LightMap.blur() 下方 JS 支);
// ②每模块独立 flag:★转正(2026-10-04 用户令「前两个先转正」)——缺省开,?lightwasm=0 逃生门(灰度期 ?lightwasm=1 显式开;worker 域经 options.name 注入,转正后=禁用标记反转:worker 读 !includes('lightwasm=0'));测试钩
//   __setLightWasmFlagForTest。★旗通道双域:主线程读页面 URL;worker 域(document
//   缺席)读 Worker options.name(LightWorkerLink spawn 时注入 'lightwasm=1'——
//   worker 无页面 URL,快照协议不动,name 通道对 vite dev/build 均零特化处理)。
// ③调用点模式:`wasm可用∧旗开 ? wasmPath() : jsPath()` —— JS 路径零改动逐位保留;
// ④线性内存布局/入参出参约定:见 README「ABI」节(lightVersion era guard=1)。
//
// 本模块零运行时依赖 lighting(不构成回环);lightWasmBlur 失败/不支持一律
// false → 调用方落回 JS 原链(fail-closed:绝不半途抛错,数据不落半态——所有
// WASM 写入只发生在线性内存,JS 侧数组只在成功路径被拷回覆写)。
import wasmUrl from './gen/light.wasm?url';

// ---------------- ABI 常量(与 light.as.ts / README 对齐) ----------------
// ★v2(2026-10-04):scan 核扩入(lightExport/通道窗口/表区),旧 v1 模块拒载。
const ABI_VERSION = 2;
/** 格容量:2^18=262144 格。覆盖口径:4K 全屏 zoom1 region ≈57.5k、2× zoom-out
 *  ≈61k;超容量(极 zoom-out/超巨视口)→ lightBlur/lightExport 拒 → JS 回退。 */
const CAP_CELLS = 1 << 18;
/** per-type 表全域(u16 type 域;wall 表 512 与 TileLightScanner WN 同域) */
const TBL_TYPE_N = 65536;
const TBL_WALL_N = 512;

interface LightExports {
  memory: WebAssembly.Memory;
  lightVersion(): number;
  lightInit(cells: number): number;
  lightRBuf(): number;
  lightGBuf(): number;
  lightBBuf(): number;
  lightMaskBuf(): number;
  lightLutBuf(): number;
  lightCaps(): bigint;
  lightBlur(w: number, h: number, pad: number,
    air: number, solid: number, cracked: number,
    dwr: number, dwg: number, dwb: number,
    dh0: number, dh1: number, dh2: number): number;
  // ---- scan 核(v2) ----
  lightTypeBuf(): number;
  lightFlagsBuf(): number;
  lightFxBuf(): number;
  lightFyBuf(): number;
  lightWallBuf(): number;
  lightLiqBuf(): number;
  lightLiqTBuf(): number;
  lightHalfBuf(): number;
  lightSlopeBuf(): number;
  lightWireBuf(): number;
  lightPaintBuf(): number;
  lightPaintWallBuf(): number;
  lightCoatBuf(): number;
  lightSpListBuf(): number;
  lightTblBlocks(): number;
  lightTblNoSun(): number;
  lightTblCracked(): number;
  lightTblAllowWater(): number;
  lightTblMush(): number;
  lightTblFlicker(): number;
  lightTblHasLight(): number;
  lightTblSpecial(): number;
  lightTblSheet(): number;
  lightTblLightR(): number;
  lightTblLightG(): number;
  lightTblLightB(): number;
  lightTblWallLight(): number;
  lightTblWallEmHas(): number;
  lightTblWallEmGated(): number;
  lightTblWallEmR(): number;
  lightTblWallEmG(): number;
  lightTblWallEmB(): number;
  lightTblTorch(): number;
  lightTblGlass(): number;
  lightTblPaint(): number;
  lightTblTogAxis(): number;
  lightTblTogDelta(): number;
  lightTablesReady(): number;
  lightMarkTablesReady(): void;
  lightSetPixelBlock(id: number): void;
  lightExport(ww: number, wh: number, px: number, py: number, mw: number, mh: number,
    glWin: number, lavaWin: number, hashX0: number, hashY0: number,
    seed: number, skyR: number, skyG: number, skyB: number,
    dk: number, swa: number,
    hellR: number, hellG: number, hellB: number,
    lavaV: number, osc: number,
    dr: number, dg: number, db: number, demon: number,
    cloudType: number, cloudDay: number, showInv: number): number;
}

// ---------------- 加载状态(②约定:fail-closed,任何失败=永久 JS 回退) ----------------
type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
let loadState: LoadState = 'idle';
let loadPromise: Promise<boolean> | null = null;
let ex: LightExports | null = null;
let rView: Float32Array | null = null;
let gView: Float32Array | null = null;
let bView: Float32Array | null = null;
let maskView: Uint8Array | null = null;
let lutView: Uint8Array | null = null;
// ---- scan 核视图(v2) ----
let typeView: Uint16Array | null = null;
let flagsView: Uint8Array | null = null;
let fxView: Uint16Array | null = null;
let fyView: Uint16Array | null = null;
let wallView: Uint16Array | null = null;
let liqView: Uint8Array | null = null;
let liqTView: Uint8Array | null = null;
let halfView: Uint8Array | null = null;
let slopeView: Uint8Array | null = null;
let wireView: Uint8Array | null = null;
let paintView: Uint8Array | null = null;
let paintWallView: Uint8Array | null = null;
let coatView: Uint8Array | null = null;
let spView: Uint32Array | null = null;

/** 测试/探针计数面:runs=WASM blur 成功数,refusals=blur 能力面拒;
 *  scanRuns/scanRefusals=scan 核同口径;loadFail=加载失败。 */
export const __lightWasmStats = { runs: 0, refusals: 0, loadFail: 0, scanRuns: 0, scanRefusals: 0 };

// ---------------- flag(★转正 2026-10-04:缺省开,?lightwasm=0 逃生门) ----------------
// ★转正注:灰度期的「import 期快照 || 现读」混合式随转正退役——快照 OR 会击穿
//   禁用标记(worker name 'sw-lightwasm=0' 时快照恒 true=逃生门失效,实测抓到);
//   现读双域已覆盖洗参面(主线程=location.search 现读;worker=name 注入串)。
// ★双域通道:主线程=location.search;worker 域(document 缺席)=Worker options.name
//   (LightWorkerLink spawn 注入;worker location 是脚本 URL 无页面查询串,fork bomb
//   判例家族禁 URL 探测——name 是 Worker 构造选项,dev/build 双态零特化)。
function readFlag(): boolean {
  try {
    if (typeof document !== 'undefined' && typeof location !== 'undefined') {
      return new URLSearchParams(location.search).get('lightwasm') !== '0';
    }
    if (typeof document === 'undefined') {
      const n = (globalThis as { name?: string }).name ?? '';
      return !n.includes('lightwasm=0');   // ★转正:禁用标记反转(缺省开)
    }
  } catch { /* fallthrough */ }
  return false;
}
let flagOverride: boolean | null = null;
export function lightWasmEnabled(): boolean {
  if (flagOverride != null) return flagOverride;
  return readFlag();   // ★转正:纯现读(禁用标记语义不可被快照 OR 击穿)
}
/** 测试钩:null=回归 URL 缺省 */
export function __setLightWasmFlagForTest(v: boolean | null): void { flagOverride = v; }

/** 测试钩:强置「不可用」面(ready()=false)模拟运行期降级;null=恢复真态 */
let unavailableOverride: boolean | null = null;
export function __setLightWasmUnavailableForTest(v: boolean | null): void { unavailableOverride = v; }

/** 测试钩:重置加载状态机(node 无 wasm 环境回退锁用;卸载实例视图) */
export function __resetLightWasmForTest(): void {
  loadState = 'idle';
  loadPromise = null;
  ex = null;
  rView = gView = bView = maskView = lutView = null;
  typeView = flagsView = fxView = fyView = wallView = liqView = liqTView = null;
  halfView = slopeView = wireView = paintView = paintWallView = coatView = spView = null;
  tablesUploaded = false;
}

/** 同步就绪检查(调用点模式 ③ 的「wasm可用」半边;未就绪=JS 原路径) */
export function lightWasmReady(): boolean {
  return unavailableOverride == null && loadState === 'ready' && ex != null;
}

// ---------------- 字节获取(浏览器 fetch / node fs;?url 由 vite 双端解析) ----------------
async function loadBytes(): Promise<Uint8Array | null> {
  // node(vitest/CI):?url 在 vitest 解析为 dev 风格 web 路径(/src/...),非文件系统
  // 真值 → 按 loader 模块自身 URL 定位 gen/light.wasm(vite-node 的 import.meta.url=file://)
  const proc = (globalThis as Record<string, unknown>).process as
    { versions?: { node?: string } } | undefined;
  if (proc && proc.versions && proc.versions.node) {
    const spec = 'node:fs';   // 变量指定符+@vite-ignore:浏览器构建零静态引用
    const fs = await import(/* @vite-ignore */ spec) as typeof import('node:fs');
    const nodeUrlMod = 'node:url';
    const url = await import(/* @vite-ignore */ nodeUrlMod) as typeof import('node:url');
    const buf = fs.readFileSync(url.fileURLToPath(new URL('./gen/light.wasm', import.meta.url)));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // 浏览器:dev=?url 源树路径;build=哈希资产路径(worker 域同源 fetch)
  const r = await fetch(wasmUrl);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

/** 幂等加载+实例化(③约定「wasm可用」的异步半边;调用点同步路径可只看 ready())。
 *  失败(fail-closed):state=failed 永久回退,loadFail 计数。 */
export function ensureLightWasm(): Promise<boolean> {
  if (loadState === 'ready') return Promise.resolve(true);
  if (loadState === 'failed') return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  loadPromise = (async (): Promise<boolean> => {
    let e: LightExports | null = null;
    try {
      if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');
      const bytes = await loadBytes();
      if (!bytes) throw new Error('no bytes');
      // 零 import 模块(构建脚本自检背书)→ 空导入对象任意环境可实例化
      const res = await (WebAssembly.instantiate(bytes, {}) as unknown as
        Promise<WebAssembly.WebAssemblyInstantiatedSource>);
      e = res.instance.exports as unknown as LightExports;
      if (e.lightVersion() !== ABI_VERSION) throw new Error('ABI mismatch');
      if (e.lightInit(CAP_CELLS) !== 1) throw new Error('init fail');
      const mem = e.memory;
      const cap = CAP_CELLS;
      rView = new Float32Array(mem.buffer, e.lightRBuf(), cap);
      gView = new Float32Array(mem.buffer, e.lightGBuf(), cap);
      bView = new Float32Array(mem.buffer, e.lightBBuf(), cap);
      maskView = new Uint8Array(mem.buffer, e.lightMaskBuf(), cap);
      lutView = new Uint8Array(mem.buffer, e.lightLutBuf(), cap);
      typeView = new Uint16Array(mem.buffer, e.lightTypeBuf(), cap);
      flagsView = new Uint8Array(mem.buffer, e.lightFlagsBuf(), cap);
      fxView = new Uint16Array(mem.buffer, e.lightFxBuf(), cap);
      fyView = new Uint16Array(mem.buffer, e.lightFyBuf(), cap);
      wallView = new Uint16Array(mem.buffer, e.lightWallBuf(), cap);
      liqView = new Uint8Array(mem.buffer, e.lightLiqBuf(), cap);
      liqTView = new Uint8Array(mem.buffer, e.lightLiqTBuf(), cap);
      halfView = new Uint8Array(mem.buffer, e.lightHalfBuf(), cap);
      slopeView = new Uint8Array(mem.buffer, e.lightSlopeBuf(), cap);
      wireView = new Uint8Array(mem.buffer, e.lightWireBuf(), cap);
      paintView = new Uint8Array(mem.buffer, e.lightPaintBuf(), cap);
      paintWallView = new Uint8Array(mem.buffer, e.lightPaintWallBuf(), cap);
      coatView = new Uint8Array(mem.buffer, e.lightCoatBuf(), cap);
      spView = new Uint32Array(mem.buffer, e.lightSpListBuf(), cap);
      ex = e;
      loadState = 'ready';
      // worker 域一次性激活日志(探针/活机对账用;仅旗开时 ensure 被触达,主线程域不刷屏)
      if (typeof document === 'undefined') {
        console.log('[lightWasm] worker core active (ABI ' + ABI_VERSION + ', cap ' + CAP_CELLS + ' cells)');
      }
      return true;
    } catch {
      __lightWasmStats.loadFail++;
      loadState = 'failed';          // fail-closed:本次页面生命永久 JS 回退
      ex = null;
      return false;
    }
  })();
  return loadPromise;
}

/** WASM blur 产物路径(与 LightMap.blur JS 支同语义;LightMap.ts:55-60 对应):
 *  r/g/b(Float32Array)/mask/lut(Uint8Array)按前 n=w*h 格拷入线性内存 → lightBlur
 *  双 pass 原位运算 → f32 拷回。返回 false=拒/不可用 → 调用方必须落回 JS 原链
 *  (fail-closed:本函数绝不半途抛错;失败时 JS 数组未被触碰,WASM 内存可弃)。
 *  衰减常数=f64 形参(JS 侧读 lightTables live binding 当前值传入,见 light.as.ts 头注)。 */
export function lightWasmBlur(r: Float32Array, g: Float32Array, b: Float32Array,
  mask: Uint8Array, lut: Uint8Array, w: number, h: number, pad: number,
  air: number, solid: number, cracked: number,
  dwr: number, dwg: number, dwb: number,
  dh0: number, dh1: number, dh2: number): boolean {
  if (!lightWasmReady()) return false;
  try {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return false;
    const n = w * h;
    if (n > CAP_CELLS) { __lightWasmStats.refusals++; return false; }
    if (r.length < n || g.length < n || b.length < n || mask.length < n || lut.length < n) return false;
    const rv = rView!, gv = gView!, bv = bView!, mv = maskView!, lv = lutView!;
    rv.set(r.subarray(0, n));
    gv.set(g.subarray(0, n));
    bv.set(b.subarray(0, n));
    mv.set(mask.subarray(0, n));
    lv.set(lut.subarray(0, n));
    const rc = ex!.lightBlur(w, h, pad, air, solid, cracked, dwr, dwg, dwb, dh0, dh1, dh2);
    if (rc !== 1) { __lightWasmStats.refusals++; return false; }
    r.set(rv.subarray(0, n));
    g.set(gv.subarray(0, n));
    b.set(bv.subarray(0, n));
    __lightWasmStats.runs++;
    return true;
  } catch {
    return false;                    // 任何异常 → JS 原链(JS 数组未动,调用方整图重跑)
  }
}

// ====================================================================
// scan 核(v2;2026-10-04 第四刀)——exportTo 播种扫描主循环 WASM 产物路径
// ====================================================================
// 调用点=TileLightScanner.exportTo 头部(旗开∧就绪):窗口行拷贝上传 → lightExport
// → r/g/b/mask 读回 + 特例格列表回传 → JS 尾段(specialTileLight ③b→④→⑤,位级
// 1:1 留 TS)。拒/失败/未就绪 → null → 调用方落 JS 原路径(fail-closed,位级同源)。
// 拆分定谳/FlickerClock/RNG 链三问见 light.as.ts 头注;ABI 全表见 README §7b。

/** per-type/wall 表上传载荷(TileLightScanner 构造器同源烘焙;进程级缓存一份)。
 *  ★lightR/G/B 与 wallEmR/G/B 必须 Float32Array(JS 构造器同式 f32 舍入值域)。 */
export interface LightScanTables {
  pixelBlockId: number;
  sheet: Int16Array;            // 65536
  blocks: Uint8Array;           // 65536(静态表;718 动态经 lightExport 形参)
  noSun: Uint8Array;            // 65536
  cracked: Uint8Array;          // 65536
  allowWater: Uint8Array;       // 65536
  mushroom: Uint8Array;         // 65536
  flicker: Uint8Array;          // 65536
  hasLight: Uint8Array;         // 65536
  special: Uint8Array;          // 65536
  lightR: Float32Array;         // 65536
  lightG: Float32Array;         // 65536
  lightB: Float32Array;         // 65536
  wallLight: Uint8Array;        // 512
  wallEmHas: Uint8Array;        // 512
  wallEmGated: Uint8Array;      // 512
  wallEmR: Float32Array;        // 512
  wallEmG: Float32Array;        // 512
  wallEmB: Float32Array;        // 512
  torch: Float64Array;          // 72(24×3)
  glass: Float64Array;          // 21(7×3)
  paint: Float64Array;          // 768(256×3;尾=White)
  togAxis: Uint8Array;          // 65536(0=x,1=y)
  togDelta: Uint16Array;        // 65536(0=非灯器件)
}

/** scan 调用入参(store 窗口源 + map 读回目标 + 帧标量;见 light.as.ts lightExport 头注) */
export interface LightScanCall {
  st: {
    w: number; h: number; showInvisibleBlocks: boolean;
    type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
    wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array;
    half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
    paint: Uint8Array; paintWall: Uint8Array; coat: Uint8Array;
  };
  map: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array; mask: Uint8Array };
  rx: number; ry: number;
  /** store(0,0) 的绝对世界坐标(worker 切片=slice.sx/sy;主线程世界 store=0,0)——
   *  RNG 哈希锚(与 JS 尾段 localRandom shim 同源) */
  hashOriginX: number; hashOriginY: number;
  groundLevel: number; lavaLine: number;   // store 系(窗口 rebase 在本函数内做)
  seed: number;                            // master 种子(reseed 后;TS 侧持有链)
  skyR: number; skyG: number; skyB: number;
  dk: number; swa: number;
  hellR: number; hellG: number; hellB: number;
  lavaV: number; osc: number;
  dr: number; dg: number; db: number; demon: number;
  cloudType: number; cloudDay: number;
  tables: LightScanTables;
}

export interface LightScanResult { count: number; list: Uint32Array }

let tablesUploaded = false;

function uploadTables(t: LightScanTables, e: LightExports): void {
  new Uint8Array(e.memory.buffer, e.lightTblBlocks(), TBL_TYPE_N).set(t.blocks);
  new Uint8Array(e.memory.buffer, e.lightTblNoSun(), TBL_TYPE_N).set(t.noSun);
  new Uint8Array(e.memory.buffer, e.lightTblCracked(), TBL_TYPE_N).set(t.cracked);
  new Uint8Array(e.memory.buffer, e.lightTblAllowWater(), TBL_TYPE_N).set(t.allowWater);
  new Uint8Array(e.memory.buffer, e.lightTblMush(), TBL_TYPE_N).set(t.mushroom);
  new Uint8Array(e.memory.buffer, e.lightTblFlicker(), TBL_TYPE_N).set(t.flicker);
  new Uint8Array(e.memory.buffer, e.lightTblHasLight(), TBL_TYPE_N).set(t.hasLight);
  new Uint8Array(e.memory.buffer, e.lightTblSpecial(), TBL_TYPE_N).set(t.special);
  new Int16Array(e.memory.buffer, e.lightTblSheet(), TBL_TYPE_N).set(t.sheet);
  new Float32Array(e.memory.buffer, e.lightTblLightR(), TBL_TYPE_N).set(t.lightR);
  new Float32Array(e.memory.buffer, e.lightTblLightG(), TBL_TYPE_N).set(t.lightG);
  new Float32Array(e.memory.buffer, e.lightTblLightB(), TBL_TYPE_N).set(t.lightB);
  new Uint8Array(e.memory.buffer, e.lightTblWallLight(), TBL_WALL_N).set(t.wallLight);
  new Uint8Array(e.memory.buffer, e.lightTblWallEmHas(), TBL_WALL_N).set(t.wallEmHas);
  new Uint8Array(e.memory.buffer, e.lightTblWallEmGated(), TBL_WALL_N).set(t.wallEmGated);
  new Float32Array(e.memory.buffer, e.lightTblWallEmR(), TBL_WALL_N).set(t.wallEmR);
  new Float32Array(e.memory.buffer, e.lightTblWallEmG(), TBL_WALL_N).set(t.wallEmG);
  new Float32Array(e.memory.buffer, e.lightTblWallEmB(), TBL_WALL_N).set(t.wallEmB);
  new Float64Array(e.memory.buffer, e.lightTblTorch(), 72).set(t.torch);
  new Float64Array(e.memory.buffer, e.lightTblGlass(), 21).set(t.glass);
  new Float64Array(e.memory.buffer, e.lightTblPaint(), 768).set(t.paint);
  new Uint8Array(e.memory.buffer, e.lightTblTogAxis(), TBL_TYPE_N).set(t.togAxis);
  new Uint16Array(e.memory.buffer, e.lightTblTogDelta(), TBL_TYPE_N).set(t.togDelta);
  e.lightSetPixelBlock(t.pixelBlockId);
  e.lightMarkTablesReady();
  tablesUploaded = true;
}

/** scan WASM 产物路径。返回 null=拒/不可用 → 调用方必须落 JS 原路径(fail-closed:
 *  本函数不抛错、JS map 数组在失败路径未被触碰)。成功:map.r/g/b/mask 已被
 *  WASM 产物覆写(前 n 格),list=特例格索引(map 系 li,扫描序)。 */
export function lightWasmExportScan(c: LightScanCall): LightScanResult | null {
  if (!lightWasmReady()) return null;
  try {
    const e = ex!;
    const mw = c.map.w, mh = c.map.h;
    // 窗口=store 内 [max(0,rx-1), min(st.w, rx+mw+1)) × y 同式(区域 ±1 邻格读域;
    // 折叠等价性证明见 LightWorkerProtocol 头注/README §7b)
    const wx0 = Math.max(0, c.rx - 1), wy0 = Math.max(0, c.ry - 1);
    const ww = Math.min(c.st.w, c.rx + mw + 1) - wx0;
    const wh = Math.min(c.st.h, c.ry + mh + 1) - wy0;
    if (ww <= 0 || wh <= 0 || mw <= 0 || mh <= 0) { __lightWasmStats.scanRefusals++; return null; }
    const nWin = ww * wh, nMap = mw * mh;
    if (nWin > CAP_CELLS || nMap > CAP_CELLS) { __lightWasmStats.scanRefusals++; return null; }
    if (!tablesUploaded) uploadTables(c.tables, e);
    // 窗口行拷贝上传(13 通道;主线程全量 store/worker 切片 store 同一条路径)
    const rows = [ww, wh];
    void rows;
    const chans: Array<[Uint16Array | Uint8Array, Uint16Array | Uint8Array]> = [
      [c.st.type, typeView!], [c.st.flags, flagsView!], [c.st.frameX, fxView!],
      [c.st.frameY, fyView!], [c.st.wall, wallView!], [c.st.liquid, liqView!],
      [c.st.liquidType, liqTView!], [c.st.half, halfView!], [c.st.slope, slopeView!],
      [c.st.wire, wireView!], [c.st.paint, paintView!], [c.st.paintWall, paintWallView!],
      [c.st.coat, coatView!],
    ];
    for (let ci = 0; ci < chans.length; ci++) {
      const src = chans[ci][0], dst = chans[ci][1];
      for (let y = 0; y < wh; y++) {
        const s = (wy0 + y) * c.st.w + wx0;
        dst.set(src.subarray(s, s + ww), y * ww);
      }
    }
    const rc = e.lightExport(
      ww, wh, c.rx - wx0, c.ry - wy0, mw, mh,
      c.groundLevel - wy0, c.lavaLine - wy0,
      wx0 + c.hashOriginX, wy0 + c.hashOriginY,
      c.seed, c.skyR, c.skyG, c.skyB, c.dk, c.swa,
      c.hellR, c.hellG, c.hellB, c.lavaV, c.osc,
      c.dr, c.dg, c.db, c.demon,
      c.cloudType, c.cloudDay, c.st.showInvisibleBlocks ? 1 : 0);
    if (rc < 0) { __lightWasmStats.scanRefusals++; return null; }
    // 读回 r/g/b/mask(JS 尾段/后续 blur/present 全在 JS 数组上消费)
    c.map.r.set(rView!.subarray(0, nMap));
    c.map.g.set(gView!.subarray(0, nMap));
    c.map.b.set(bView!.subarray(0, nMap));
    c.map.mask.set(maskView!.subarray(0, nMap));
    __lightWasmStats.scanRuns++;
    return { count: rc, list: spView!.slice(0, rc) };
  } catch {
    return null;   // 任何异常 → JS 原链(JS 数组未动,调用方整图重跑)
  }
}
