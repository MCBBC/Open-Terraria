// WASM 加载器与回退架构 —— SM2 解释器试点(2026-10-03,三刀通用约定第 1/2 刀复用面)。
// 架构总纲见 src/wasm/README.md;四约定:
// ①特性检测:typeof WebAssembly==='object' + 异步实例化失败 → JS 回退(本文件所有
//   出口 false/拒=回退信号,调用方必须实现 JS 原路径);
// ②每模块独立 flag:本次 ?sm2wasm=1(缺省关,审查通过前不转正);测试钩
//   __setSm2WasmFlagForTest;
// ③调用点模式:`wasm可用∧旗开 ? wasmPath() : jsPath()` —— JS 路径零改动逐位保留;
// ④线性内存布局/入参出参约定:见 README「ABI」节(sm2Version era guard=1)。
//
// 本模块零运行时依赖 SM2Effect(仅 type import),不构成回环;
// 产物路径 wasmRunPassOnImageData 与 runPassOnImageData 同语义(无 t0Rect/
// extraSamplers 形态),失败/不支持一律 false → 调用方落回 JS 原链。
import wasmUrl from './gen/sm2.wasm?url';
import type { SM2Pass, SM2Uniforms } from '../fx/SM2Effect';
import { sat } from '../fx/sm2Runtime';

// ---------------- ABI 常量(与 sm2.as.ts / README 对齐) ----------------
const ABI_VERSION = 1;
const TOK_BYTES = 64 * 1024;        // u32 token 上传暂存(最大 pass=ArmorGel 332 token,余量×48)
const TEX_BYTES = 1024 * 1024;      // 源贴图容量(覆盖 ≤512²)
const OUT_BYTES = 1024 * 1024;      // 产物容量

interface Sm2Exports {
  memory: WebAssembly.Memory;
  sm2Version(): number;
  sm2Init(tokBytes: number, texBytes: number, outBytes: number): number;
  sm2TokenBuf(): number;
  sm2ConstBuf(): number;
  sm2TexBuf(): number;
  sm2OutBuf(): number;
  sm2Caps(): bigint;
  sm2UploadProgram(tokLen: number, modes: number): number;
  sm2RunImage(prog: number, w: number, h: number,
    v0x: number, v0y: number, v0z: number, v0a: number): number;
}

// ---------------- 加载状态(②约定:fail-closed,任何失败=永久 JS 回退) ----------------
type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
let loadState: LoadState = 'idle';
let loadPromise: Promise<boolean> | null = null;
let ex: Sm2Exports | null = null;
let cView: Float64Array | null = null;      // 256 f64 常量库(setupConstants 产物直写)
let tokView: Uint32Array | null = null;     // token 上传暂存
let texView: Uint8Array | null = null;      // 源贴图 RGBA
let outView: Uint8Array | null = null;      // 产物 RGBA
let texCap = 0, outCap = 0;

/** 测试/探针计数面:runs=WASM 产物成功数,refusals=能力面拒(形态不支持),
 *  loadFail=加载失败(特性缺失/实例化失败/ABI 错代)。 */
export const __sm2WasmStats = { runs: 0, refusals: 0, loadFail: 0 };

// ---------------- flag(②约定:缺省关,审查通过才转正) ----------------
// ★混合读取:import 期快照(真实游戏 boot 链在洗参前 import,FFGLOFF 判例同款)+
//   每次调用现读(探针/运行期带旗重载;BJ95 gotoApp 洗参后现读会漏,快照兜底)。
const QUERY_FLAG_AT_IMPORT = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('sm2wasm') === '1' : false;
let flagOverride: boolean | null = null;
export function sm2WasmEnabled(): boolean {
  if (flagOverride != null) return flagOverride;
  if (typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('sm2wasm') === '1') return true;
  return QUERY_FLAG_AT_IMPORT;
}
/** 测试钩:null=回归 URL 缺省 */
export function __setSm2WasmFlagForTest(v: boolean | null): void { flagOverride = v; }

/** 测试钩:强置「不可用」面(ready()=false)模拟运行期降级;null=恢复真态 */
let unavailableOverride: boolean | null = null;
export function __setSm2WasmUnavailableForTest(v: boolean | null): void { unavailableOverride = v; }

/** 测试钩:重置加载状态机(node 无 wasm 环境回退锁用;卸载实例视图) */
export function __resetSm2WasmForTest(): void {
  loadState = 'idle';
  loadPromise = null;
  ex = null;
  cView = tokView = texView = outView = null;
}

/** 同步就绪检查(调用点模式 ③ 的「wasm可用」半边;未就绪=JS 原路径) */
export function sm2WasmReady(): boolean {
  return unavailableOverride == null && loadState === 'ready' && ex != null;
}

// ---------------- 字节获取(浏览器 fetch / node fs;?vurl 由 vite 双端解析) ----------------
async function loadBytes(): Promise<Uint8Array | null> {
  // node(vitest/CI):?url 在 vitest 解析为 dev 风格 web 路径(/src/...),非文件系统
  // 真值 → 按 loader 模块自身 URL 定位 gen/sm2.wasm(vite-node 的 import.meta.url=file://)
  const proc = (globalThis as Record<string, unknown>).process as
    { versions?: { node?: string } } | undefined;
  if (proc && proc.versions && proc.versions.node) {
    const spec = 'node:fs';   // 变量指定符+@vite-ignore:浏览器构建零静态引用
    const fs = await import(/* @vite-ignore */ spec) as typeof import('node:fs');
    const nodeUrlMod = 'node:url';
    const url = await import(/* @vite-ignore */ nodeUrlMod) as typeof import('node:url');
    const buf = fs.readFileSync(url.fileURLToPath(new URL('./gen/sm2.wasm', import.meta.url)));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // 浏览器:dev=?url 源树路径;build=哈希资产路径
  const r = await fetch(wasmUrl);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

/** 幂等加载+实例化(③约定「wasm可用」的异步半边;调用点同步路径可只看 ready())。
 *  失败(fail-closed):state=failed 永久回退,loadFail 计数。 */
export function ensureSm2Wasm(): Promise<boolean> {
  if (loadState === 'ready') return Promise.resolve(true);
  if (loadState === 'failed') return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  loadPromise = (async (): Promise<boolean> => {
    let e: Sm2Exports | null = null;
    try {
      if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');
      const bytes = await loadBytes();
      if (!bytes) throw new Error('no bytes');
      // 零 import 模块(构建脚本自检背书)→ 空导入对象任意环境可实例化
      const res = await (WebAssembly.instantiate(bytes, {}) as unknown as
        Promise<WebAssembly.WebAssemblyInstantiatedSource>);
      e = res.instance.exports as unknown as Sm2Exports;
      if (e.sm2Version() !== ABI_VERSION) throw new Error('ABI mismatch');
      if (e.sm2Init(TOK_BYTES, TEX_BYTES, OUT_BYTES) !== 1) throw new Error('init fail');
      const mem = e.memory;
      cView = new Float64Array(mem.buffer, e.sm2ConstBuf(), 256);
      tokView = new Uint32Array(mem.buffer, e.sm2TokenBuf(), TOK_BYTES / 4);
      texView = new Uint8Array(mem.buffer, e.sm2TexBuf(), TEX_BYTES);
      outView = new Uint8Array(mem.buffer, e.sm2OutBuf(), OUT_BYTES);
      texCap = TEX_BYTES; outCap = OUT_BYTES;
      ex = e;
      loadState = 'ready';
      return true;
    } catch {
      __sm2WasmStats.loadFail++;
      loadState = 'failed';          // fail-closed:本次页面生命永久 JS 回退
      ex = null;
      return false;
    }
  })();
  return loadPromise;
}

// ---------------- 程序上传缓存(pass 单例;句柄 1-based) ----------------
const progHandles = new WeakMap<object, number>();
function uploadProgram(pass: SM2Pass): number {
  const toks = pass.rawTokens;
  const tv = tokView!;
  if (toks.length <= 0 || toks.length > tv.length) return 0;
  for (let i = 0; i < toks.length; i++) tv[i] = toks[i] >>> 0;
  const h = ex!.sm2UploadProgram(toks.length, 0);   // modes=0:全槽 clamp(s0 语义)
  return h;
}

/** WASM 产物路径(与 runPassOnImageData 同语义的受限形态):
 *  仅支持无 t0Rect、无 extraSamplers 的调用形态(ForceFieldBubble 桶缓存形态);
 *  v0Rgb 可选(缺省恒白)。返回 false=拒/不可用 → 调用方必须落回 JS 原链
 *  (fail-closed:本函数绝不半途抛错,数据不落半态)。 */
export function wasmRunPassOnImageData(pass: SM2Pass, data: Uint8ClampedArray,
  w: number, h: number, uniforms: SM2Uniforms,
  v0Rgb?: readonly [number, number, number]): boolean {
  if (!sm2WasmReady()) return false;
  try {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return false;
    const px4 = w * h * 4;
    if (px4 > texCap || px4 > outCap) return false;
    if (data.length < px4) return false;
    if (!pass.singleSamplerS0Only) { __sm2WasmStats.refusals++; return false; }   // s1/s2 pass → JS
    // uniform 预处理与 runPassOnImageData 逐字同式(SM2Effect.ts:520-528 无 t0Rect 支)
    const u = { ...uniforms };
    if (!u.uImageSize0[0] && !u.uImageSize0[1]) u.uImageSize0 = [w, h];
    if (!u.uSourceRect[2] && !u.uSourceRect[3]) u.uSourceRect = [0, 0, w, h];
    // 程序上传(每 pass 一次;句柄缓存)
    let handle = progHandles.get(pass) ?? 0;
    if (!handle) {
      handle = uploadProgram(pass);
      if (!handle) { __sm2WasmStats.refusals++; return false; }
      progHandles.set(pass, handle);
    }
    // 输入入线性内存:常量库(JS 装配)+ 源贴图(data 副本语义=srcData 防交叠)
    cView!.set(pass.setupConstants(u));
    texView!.set(data.subarray(0, px4));
    // v0:缺省恒白 / v0Rgb 钳制(SM2Effect.ts:534 同式 sat)
    const rc = ex!.sm2RunImage(handle, w, h,
      v0Rgb ? sat(v0Rgb[0]) : 1, v0Rgb ? sat(v0Rgb[1]) : 1, v0Rgb ? sat(v0Rgb[2]) : 1, 1);
    if (rc !== 1) { __sm2WasmStats.refusals++; return false; }
    data.set(outView!.subarray(0, px4));
    __sm2WasmStats.runs++;
    return true;
  } catch {
    return false;                    // 任何异常 → JS 原链(数据可能未动;调用方整图重跑)
  }
}
