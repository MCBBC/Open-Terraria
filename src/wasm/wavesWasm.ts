// WASM 加载器与回退架构 —— 水波网格推进核(2026-10-03 第三刀;lightWasm.ts 同构复制面)。
// 架构总纲见 src/wasm/README.md;四约定:
// ①特性检测:typeof WebAssembly==='object' + 异步实例化失败 → JS 回退(本文件所有
//   出口 false/拒=回退信号,调用方必须实现 JS 原路径——WaterWaves._step 下方三
//   路径逐字保留);
// ②每模块独立 flag:本次 ?wavewasm=1(缺省关,审查通过才转正);测试钩
//   __setWavesWasmFlagForTest。★旗通道双域:主线程读页面 URL;worker 域(document
//   缺席)读 Worker options.name(WaterWaves._wwSpawnWorker 双静态分支注入
//   'sw-wavewasm=1'——worker 无页面 URL;LightWorkerLink 判例同款)。
// ③调用点模式:`wasm可用∧旗开 ? wasmPath() : jsPath()` —— JS 路径零改动逐位保留
//   (_step 三路径 W3/内域/泛形已由 tests/bj78、tests/bj270 锁逐位同值,WASM 核
//   单一实现即可复刻全部;失败/拒 → 静默落回,不落半态)。
// ④线性内存布局/入参出参约定:见 README「ABI §9」节(wavesVersion era guard=1)。
//
// 本模块零运行时依赖 WaterWaves(不构成回环);wavesWasmStep 失败/不支持一律
// false → 调用方落回 JS 原链(fail-closed:绝不半途抛错,数据不落半态——所有
// WASM 写入只发生在线性内存,JS 侧 _R/_G 只在拷入、_R2/_G2 只在成功路径拷回)。
import wasmUrl from './gen/waves.wasm?url';

// ---------------- ABI 常量(与 waves.as.ts / README 对齐) ----------------
const ABI_VERSION = 1;
/** 格容量:2^20=1,048,576 格。覆盖口径:1080p css 全屏 480×270=129,600、5K css
 *  640×360=230,400、4K@1× 960×540=518,400 全收;栅格=ceil(css/4)² 只随显示分辨率
 *  变(与 zoom 无关),超容量(>8K 级)→ wavesStep 拒 → JS 回退(fail-closed)。 */
const CAP_CELLS = 1 << 20;

interface WavesExports {
  memory: WebAssembly.Memory;
  wavesVersion(): number;
  wavesInit(cells: number): number;
  wavesRBuf(): number;
  wavesGBuf(): number;
  wavesR2Buf(): number;
  wavesG2Buf(): number;
  wavesCaps(): bigint;
  wavesStep(w: number, h: number, dx: number, dy: number, damp: number): number;
}

// ---------------- 加载状态(①约定:fail-closed,任何失败=永久 JS 回退) ----------------
type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
let loadState: LoadState = 'idle';
let loadPromise: Promise<boolean> | null = null;
let ex: WavesExports | null = null;
let rView: Float32Array | null = null;
let gView: Float32Array | null = null;
let r2View: Float32Array | null = null;
let g2View: Float32Array | null = null;

/** 测试/探针计数面:runs=WASM 产物成功数,refusals=能力面拒(容量/几何/形参),
 *  loadFail=加载失败(特性缺失/实例化失败/ABI 错代)。 */
export const __wavesWasmStats = { runs: 0, refusals: 0, loadFail: 0 };

// ---------------- flag(②约定:缺省关,审查通过才转正) ----------------
// ★混合读取:import 期快照 + 每次调用现读(BJ95 gotoApp 洗参后现读会漏,快照兜底)。
// ★热路径纪律:enabled() 被 _step 每步调用——主线程 URL 现读走 **缓存读取面**
//   (★BJ78 W1 waveAmpParam 判例同款:location.search 每页恒定,按 search 串键控,
//   命中零 URLSearchParams 构造;值语义与逐调用解析逐位同)。worker 域 name 读
//   本就是字符串 includes,零构造。
function readFlagUncached(): boolean {
  try {
    if (typeof document !== 'undefined' && typeof location !== 'undefined') {
      return new URLSearchParams(location.search).get('wavewasm') === '1';
    }
    if (typeof document === 'undefined') {
      const n = (globalThis as { name?: string }).name ?? '';
      return n.includes('wavewasm=1');
    }
  } catch { /* fallthrough */ }
  return false;
}
let _flagSearchKey: string | null = null;
let _flagVal = false;
function readFlag(): boolean {
  if (typeof document === 'undefined') return readFlagUncached();   // worker 域零缓存面
  let q: string;
  try { q = location.search; } catch { return readFlagUncached(); }
  if (q !== _flagSearchKey) {
    _flagSearchKey = q;
    try { _flagVal = new URLSearchParams(q).get('wavewasm') === '1'; } catch { _flagVal = false; }
  }
  return _flagVal;
}
const QUERY_FLAG_AT_IMPORT = readFlagUncached();
let flagOverride: boolean | null = null;
export function wavesWasmEnabled(): boolean {
  if (flagOverride != null) return flagOverride;
  return readFlag() || QUERY_FLAG_AT_IMPORT;
}
/** 测试钩:null=回归 URL 缺省 */
export function __setWavesWasmFlagForTest(v: boolean | null): void { flagOverride = v; }

/** 测试钩:强置「不可用」面(ready()=false)模拟运行期降级;null=恢复真态 */
let unavailableOverride: boolean | null = null;
export function __setWavesWasmUnavailableForTest(v: boolean | null): void { unavailableOverride = v; }

/** 测试钩:重置加载状态机(node 无 wasm 环境回退锁用;卸载实例视图) */
export function __resetWavesWasmForTest(): void {
  loadState = 'idle';
  loadPromise = null;
  ex = null;
  rView = gView = r2View = g2View = null;
}

/** 同步就绪检查(调用点模式 ③ 的「wasm可用」半边;未就绪=JS 原路径) */
export function wavesWasmReady(): boolean {
  return unavailableOverride == null && loadState === 'ready' && ex != null;
}

// ---------------- 字节获取(浏览器 fetch / node fs;?url 由 vite 双端解析) ----------------
async function loadBytes(): Promise<Uint8Array | null> {
  // node(vitest/CI):?url 在 vitest 解析为 dev 风格 web 路径(/src/...),非文件系统
  // 真值 → 按 loader 模块自身 URL 定位 gen/waves.wasm(vite-node 的 import.meta.url=file://)
  const proc = (globalThis as Record<string, unknown>).process as
    { versions?: { node?: string } } | undefined;
  if (proc && proc.versions && proc.versions.node) {
    const spec = 'node:fs';   // 变量指定符+@vite-ignore:浏览器构建零静态引用
    const fs = await import(/* @vite-ignore */ spec) as typeof import('node:fs');
    const nodeUrlMod = 'node:url';
    const url = await import(/* @vite-ignore */ nodeUrlMod) as typeof import('node:url');
    const buf = fs.readFileSync(url.fileURLToPath(new URL('./gen/waves.wasm', import.meta.url)));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // 浏览器:dev=?url 源树路径;build=哈希资产路径(worker 域同源 fetch)
  const r = await fetch(wasmUrl);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

/** 幂等加载+实例化(③约定「wasm可用」的异步半边;调用点同步路径可只看 ready())。
 *  失败(fail-closed):state=failed 永久回退,loadFail 计数。 */
export function ensureWavesWasm(): Promise<boolean> {
  if (loadState === 'ready') return Promise.resolve(true);
  if (loadState === 'failed') return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  loadPromise = (async (): Promise<boolean> => {
    let e: WavesExports | null = null;
    try {
      if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');
      const bytes = await loadBytes();
      if (!bytes) throw new Error('no bytes');
      // 零 import 模块(构建脚本自检背书)→ 空导入对象任意环境可实例化
      const res = await (WebAssembly.instantiate(bytes, {}) as unknown as
        Promise<WebAssembly.WebAssemblyInstantiatedSource>);
      e = res.instance.exports as unknown as WavesExports;
      if (e.wavesVersion() !== ABI_VERSION) throw new Error('ABI mismatch');
      if (e.wavesInit(CAP_CELLS) !== 1) throw new Error('init fail');
      const mem = e.memory;
      const cap = CAP_CELLS;
      rView = new Float32Array(mem.buffer, e.wavesRBuf(), cap);
      gView = new Float32Array(mem.buffer, e.wavesGBuf(), cap);
      r2View = new Float32Array(mem.buffer, e.wavesR2Buf(), cap);
      g2View = new Float32Array(mem.buffer, e.wavesG2Buf(), cap);
      ex = e;
      loadState = 'ready';
      // worker 域一次性激活日志(探针/活机对账用;仅旗开时 ensure 被触达,主线程域不刷屏)
      if (typeof document === 'undefined') {
        console.log('[wavesWasm] worker core active (ABI ' + ABI_VERSION + ', cap ' + CAP_CELLS + ' cells)');
      }
      return true;
    } catch {
      __wavesWasmStats.loadFail++;
      loadState = 'failed';          // fail-closed:本次页面生命永久 JS 回退
      ex = null;
      return false;
    }
  })();
  return loadPromise;
}

/** WASM 推进核产物路径(与 WaterWaves._step JS 支同语义):
 *  r/g(本步读场 _R/_G)拷入 → wavesStep → r2/g2(写场 _R2/_G2)拷回——调用方
 *  随后执行与 JS 路径相同的 ping-pong swap。返回 false=拒/不可用 → 调用方必须
 *  落回 JS 原链(fail-closed:本函数绝不半途抛错;失败时 JS 数组未被触碰——
 *  r/g 只读拷入、r2/g2 只在成功路径覆写)。damp=f64 形参(JS 侧 WATER_DAMP
 *  模块级常量传入,禁 AS 侧 Math.pow 内嵌——libm 1ulp 差,见 waves.as.ts 头注)。 */
export function wavesWasmStep(r: Float32Array, g: Float32Array,
  r2: Float32Array, g2: Float32Array,
  w: number, h: number, dx: number, dy: number, damp: number): boolean {
  if (!wavesWasmReady()) return false;
  try {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return false;
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return false;
    if (!Number.isFinite(damp)) return false;
    const n = w * h;
    if (n > CAP_CELLS) { __wavesWasmStats.refusals++; return false; }
    if (r.length < n || g.length < n || r2.length < n || g2.length < n) return false;
    const rv = rView!, gv = gView!, r2v = r2View!, g2v = g2View!;
    rv.set(r.subarray(0, n));
    gv.set(g.subarray(0, n));
    const rc = ex!.wavesStep(w, h, dx, dy, damp);
    if (rc !== 1) { __wavesWasmStats.refusals++; return false; }
    r2.set(r2v.subarray(0, n));
    g2.set(g2v.subarray(0, n));
    __wavesWasmStats.runs++;
    return true;
  } catch {
    return false;                    // 任何异常 → JS 原链(JS 写场未动,调用方整步重跑)
  }
}
