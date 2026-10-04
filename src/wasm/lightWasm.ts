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
const ABI_VERSION = 1;
/** 格容量:2^18=262144 格。覆盖口径:4K 全屏 zoom1 region ≈57.5k、2× zoom-out
 *  ≈61k;超容量(极 zoom-out/超巨视口)→ lightBlur 拒 → JS 回退(fail-closed)。 */
const CAP_CELLS = 1 << 18;

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

/** 测试/探针计数面:runs=WASM 产物成功数,refusals=能力面拒(容量/几何),
 *  loadFail=加载失败(特性缺失/实例化失败/ABI 错代)。 */
export const __lightWasmStats = { runs: 0, refusals: 0, loadFail: 0 };

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
