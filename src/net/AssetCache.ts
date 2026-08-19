// SW 资产预载驱动器(2026-08-13,弱网/首进体验)。
// 设计见 plans/gleaming-singing-biscuit.md:进主菜单即按优先级全量下载到
// Cache API 磁盘缓存(public/sw.js 拦截服务);右下角悬浮进度 + 单人游戏门槛
// 弹窗在 src/ui/AssetDownloadUI.ts。本模块只做:门控/版本/优先级清单枚举/
// SW 消息协议/进度状态。
//
// ★版本 = fnv1a32(vanilla.json + vanilla-ui.json 内容 + CACHE_BUSTER
//   [+ zip manifest contentHash,2026-08-19])。贴图清单变了 → JSON 变 → bundle 变
//   → version 变 → 新缓存整批重建;zip 模式下 contentHash 覆盖全部打包输入
//   (sounds/audios/fonts 内容变更自动换版本,根治"手动 bump CACHE_BUSTER"痛点)。
//   l10n 已豁免(2026-08-16 裸键事故):sw.js 对 /l10n/ 走网络优先+离线回退,
//   重建语言包即时生效,不再依赖版本号/CACHE_BUSTER。
// ★zip 快路径(2026-08-19):public/assets-zip/manifest.json 存在 → 分片
//   warm-zip(SW 内 fflate 解压直写缓存,12003 请求→~10);manifest 缺失/dev/
//   SW 无 fflate(warm-zip-unavailable)→ 整会话回退逐文件 legacy warm。
import vanillaJson from '../../public/sprites/vanilla.json';
import vanillaUiJson from '../../public/sprites/vanilla-ui.json';
import assetsIndexJson from '../../public/assets-index.json';
import { MUSIC } from '../data/Music';
import { VANILLA_MISC } from '../assets/SpriteAtlas';

/** 手动版本闸:仅 sounds/audios/fonts/l10n 内容变更时 +1(贴图走 JSON 内容 hash 自动) */
export const CACHE_BUSTER = 1;

type VanillaMeta = { sheet?: string; icon?: string };
type VanillaData = {
  tiles?: Record<string, VanillaMeta>;
  walls?: Record<string, VanillaMeta>;
  npcs?: Record<string, VanillaMeta>;
  items?: Record<string, VanillaMeta>;
};
type UiFiles = Record<string, string>;
type AssetsIndex = { sounds?: string[]; fonts?: string[]; l10n?: string[]; miscVanilla?: string[]; miscUi?: string[] };

// ---- 版本(纯函数,可测) ----

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function assetVersion(
  vanilla: unknown = vanillaJson,
  ui: unknown = vanillaUiJson,
  buster = CACHE_BUSTER,
): string {
  return fnv1a32(JSON.stringify(vanilla) + '|' + JSON.stringify(ui) + '|' + buster).toString(36);
}

// ---- zip 分片计划(纯函数,可测) ----

/** pack-assets.mjs 产物 manifest.json 形状(条目名 = SW cache key 相对路径) */
export interface ZipManifestPart {
  file: string;         // p<i>-<hash8>.zip(内容寻址)
  phase: string;        // menu / game-sprites / sounds / music
  files: number; bytes: number; zipBytes: number;
  entries: string[];
  inputHash: string;
}
export interface ZipManifest {
  algoVersion: number; contentHash: string; totalFiles: number; totalBytes: number;
  parts: ZipManifestPart[];
}

/** zip 模式缓存版本 = fnv1a32(基础版本 | manifest contentHash)——zip 内容变即
 *  换缓存名,旧缓存由 SW activate/init gc 清除 */
export function composeVersion(base: string, contentHash: string): string {
  return fnv1a32(base + '|' + contentHash).toString(36);
}

const PART_PHASE_MAP: Record<string, AssetPhase> = {
  menu: 'menu', 'game-sprites': 'game-sprites', sounds: 'sounds', music: 'music',
};
/** zip 模式相位(按各片 files 累计映射;片 phase 由 pack 按首条目目录写) */
export function zipPhaseAt(parts: ZipManifestPart[], done: number): AssetPhase | 'done' {
  let acc = 0;
  for (const p of parts) {
    acc += p.files;
    if (done < acc) return PART_PHASE_MAP[p.phase] ?? 'misc-sprites';
  }
  return 'done';
}

// ---- 优先级清单枚举(纯函数,可测;顺序即下载优先级 P0→P4) ----

/** P0 菜单壳:与 main.ts 菜单预载同款前缀集(减面板专属子族)+ 字体 + 语言包 */
export function menuWarmUrls(uiFiles: UiFiles, index: AssetsIndex = assetsIndexJson, lang = 'zh-Hans'): string[] {
  const prefixes = ['UI_', 'Inventory_', 'logo', 'Logo'];
  const exclude = ['UI_Bestiary', 'UI_Minimap', 'UI_WorldCreation', 'UI_CharCreation',
    'UI_PlayerResourceSets', 'UI_Workshop', 'UI_Creative', 'UI_Wires',
    'UI_DisplaySlots', 'UI_Achievement', 'UI_Craft', 'UI_InfoIcon', 'UI_Settings', 'UI_Camera'];
  const out: string[] = [];
  for (const [k, v] of Object.entries(uiFiles)) {
    if (!prefixes.some((p) => k.startsWith(p))) continue;
    if (exclude.some((e) => k.startsWith(e))) continue;
    out.push(`sprites/${v}`);
  }
  out.push(...(index.fonts ?? []).map((f) => f));
  out.push('l10n/index.json', `l10n/${lang}.json`);
  return out;
}

/** P1 游戏贴图:全部图块/墙表 + NPC 表 + VANILLA_MISC(烘焙族/门对/液体) + 物品图标图集 */
export function worldWarmUrls(vanilla: VanillaData = vanillaJson): string[] {
  const out = new Set<string>();
  for (const m of Object.values(vanilla.tiles ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const m of Object.values(vanilla.walls ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const m of Object.values(vanilla.npcs ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const m of Object.values(vanilla.items ?? {})) if (m.icon) out.add(`sprites/${m.icon}`);
  for (const f of VANILLA_MISC) out.add(`sprites/${f}`);
  return [...out];
}

/** P2 其余贴图:assets-index 的 miscVanilla/miscUi(已剔除 P1 的表族,构建期扫盘生成) */
export function miscWarmUrls(index: AssetsIndex = assetsIndexJson): string[] {
  return [...(index.miscVanilla ?? []), ...(index.miscUi ?? [])];
}

/** P3 音效全量 / P4 音乐(MUSIC 表枚举,0=None 跳过) */
export function soundsWarmUrls(index: AssetsIndex = assetsIndexJson): string[] {
  return [...(index.sounds ?? [])];
}
export function musicWarmUrls(): string[] {
  const ids = new Set<number>();
  for (const id of Object.values(MUSIC)) if (id > 0) ids.add(id);
  return [...ids].sort((a, b) => a - b).map((id) => `audios/music/Music_${id}.mp3`);
}

export type AssetPhase = 'menu' | 'game-sprites' | 'misc-sprites' | 'sounds' | 'music';
export const PHASE_LABEL: Record<AssetPhase, string> = {
  // 展示文案由消费端走 l10n(Mods.SandboxWorld.AssetDl.Phase_*);此处仅相位键
  menu: 'menu', 'game-sprites': 'game-sprites', 'misc-sprites': 'misc-sprites',
  sounds: 'sounds', music: 'music',
};

/** 全量优先级清单 + 分段边界(进度阶段名用) */
export function priorityPlan(): { urls: string[]; phases: Array<{ phase: AssetPhase; start: number; end: number }> } {
  const phases: Array<{ phase: AssetPhase; urls: string[] }> = [
    { phase: 'menu', urls: menuWarmUrls((vanillaUiJson as { files: UiFiles }).files) },
    { phase: 'game-sprites', urls: worldWarmUrls() },
    { phase: 'misc-sprites', urls: miscWarmUrls() },
    { phase: 'sounds', urls: soundsWarmUrls() },
    { phase: 'music', urls: musicWarmUrls() },
  ];
  const seen = new Set<string>();
  const urls: string[] = [];
  const bounds: Array<{ phase: AssetPhase; start: number; end: number }> = [];
  for (const p of phases) {
    const start = urls.length;
    for (const u of p.urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      urls.push(u);
    }
    bounds.push({ phase: p.phase, start, end: urls.length });
  }
  return { urls, phases: bounds };
}

// ---- 运行时状态与 SW 协议(浏览器侧;vitest 环境下均短路) ----

export interface AssetCacheState {
  enabled: boolean;
  version: string;
  total: number;
  done: number;
  failed: number;
  phase: AssetPhase | 'done' | 'idle';
  warming: boolean;
}

const state: AssetCacheState = {
  enabled: false, version: '', total: 0, done: 0, failed: 0, phase: 'idle', warming: false,
};

let plan = priorityPlan();
state.total = plan.urls.length;
/** zip 分片计划(InitAssetCache 拉到 manifest 才置;null=legacy 逐文件模式) */
let zipPlan: ZipManifest | null = null;
let partCursor = 0;             // 下一片下标(zip 模式;对应 legacy 的 chunkCursor)
const progressCbs = new Set<(s: AssetCacheState) => void>();

export function assetCacheState(): AssetCacheState { return { ...state }; }

export function onAssetProgress(cb: (s: AssetCacheState) => void): () => void {
  progressCbs.add(cb);
  return () => progressCbs.delete(cb);
}

function emit(): void {
  for (const cb of progressCbs) cb(assetCacheState());
}

function phaseAt(done: number): AssetPhase | 'done' {
  for (const p of plan.phases) {
    if (done < p.end) return p.phase;
  }
  return 'done';
}

export function assetCacheEnabled(): boolean { return state.enabled; }

/** 全部资产就绪?(门槛判定) */
export function assetsComplete(): boolean {
  return state.enabled && state.total > 0 && state.done >= state.total && state.failed === 0;
}

/** 完成态本地标志(★2026-08-18 用户报"每次 build 后进单人游戏卡下载门槛"):
 *  门槛真正在等的是 SW status 回包——SW 冷启动 + cache.keys() 枚举万条缓存
 *  要 1-2s,期间 done=0 → 门槛误显示"正在下载 0%"(实际零下载,trace 实证
 *  仅 133 条正常懒载)。完成态落 localStorage:门槛先查标志秒开;SW 回包
 *  到达后若实测缓存被清,撤销标志回到真实门槛。版本随 key 走,新资产自然失效 */
const COMPLETE_FLAG = 'swAssetsComplete:';
function writeCompleteFlag(v: boolean): void {
  try {
    if (v) localStorage.setItem(COMPLETE_FLAG + state.version, '1');
    else localStorage.removeItem(COMPLETE_FLAG + state.version);
  } catch { /* 隐私模式等 */
  }
}
/** 快速判定:SW 回包未达前也能凭上轮完成记录放行(代价:缓存被系统清理的
 *  罕见窗口里,懒载会走网络并由 SW 边下边补——自愈,可接受) */
export function assetsCompleteFast(): boolean {
  if (assetsComplete()) return true;
  try { return !!localStorage.getItem(COMPLETE_FLAG + state.version); } catch { return false; }
}

function postToSw(msg: Record<string, unknown>): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : undefined;
  // version 随消息走:SW 被浏览器击杀重启后内存版本丢失,靠消息里的 version 选对缓存
  sw?.postMessage({ version: state.version, ...msg });
}

/** 注册 SW 并启动(仅生产构建;?sw=1 强制开、?nosw 关)。幂等。 */
export async function initAssetCache(): Promise<void> {
  if (state.enabled || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const force = q.has('sw');
  if (q.has('nosw')) return;
  if (!force && !import.meta.env.PROD) return;               // dev 默认关(探针/HMR 零干扰)
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return; // 纯 http 非 localhost 降级
  try {
    state.version = assetVersion();
    // zip manifest 拉取(3s 超时;路径不匹配 ASSET_RE → SW 天然放行不缓存;
    // cache:'reload' 防部署后读到旧 manifest)。失败=legacy 逐文件(dev/旧部署)
    try {
      const ctrl: RequestInit = { cache: 'reload' };
      if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        ctrl.signal = AbortSignal.timeout(3000);
      }
      const res = await fetch('assets-zip/manifest.json', ctrl);
      if (res.ok) {
        const m = (await res.json()) as ZipManifest;
        if (m && m.algoVersion === 1 && Array.isArray(m.parts) && m.parts.length > 0) {
          zipPlan = m;
          state.version = composeVersion(state.version, m.contentHash);
          state.total = m.totalFiles;
        }
      }
    } catch { /* legacy */ }
    // updateViaCache:'none':SW 脚本本身绕过 HTTP 缓存——否则部署新版 sw.js 后
    // 浏览器最长 24h 仍跑旧 SW(标准坑,2026-08-13)
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? reg.active ?? null;
    if (!sw) return;
    state.enabled = true;
    (globalThis as unknown as { __swAssetCache?: unknown }).__swAssetCache = {
      state: assetCacheState, warm: warmAllAssets, complete: assetsComplete,
    }; // 调试/探针句柄
    sw.postMessage({ type: 'init', version: state.version });
    postToSw({ type: 'status' });
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    // SW 被击杀重启后 controller 会换新实例——重新对齐版本并触发看门狗续传
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      postToSw({ type: 'status' });
      state.warming = false;
    });
    startWatchdog();
  } catch { /* 注册失败(老浏览器/隐私模式)→ 降级现状,零影响 */ }
}

function onSwMessage(e: MessageEvent): void {
  const d = e.data || {};
  if (d.type === 'status') {
    // 初始判定:以 SW 实测缓存数对齐进度(被系统清理→cached 变小→重新补下)
    if (typeof d.cached === 'number' && d.version === state.version) {
      state.done = Math.min(d.cached, state.total);
      // 满缓存直接判定完成——免得每次进菜单空跑 23 个块(SW keys() 扫一遍×23)
      if (state.done >= state.total && (zipPlan ? partCursor === 0 : chunkCursor === 0)) {
        chunkCursor = plan.urls.length;
        partCursor = zipPlan ? zipPlan.parts.length : 0;
        state.warming = false;
        state.phase = 'done';
      }
      writeCompleteFlag(state.done >= state.total);   // 实测校准:满=落标志,被清理=撤销
      lastProgressAt = Date.now();
      emit();
    }
  } else if (d.type === 'warm-progress') {
    // done 为绝对值(SW 侧 base 偏移);failed 为当前块/片计数,跨批累计
    state.done = Math.min(d.done ?? 0, state.total);
    state.failed = chunkFailedAcc + (d.failed ?? 0);
    state.warming = true;
    state.phase = state.done >= state.total ? 'done'
      : (d.tag === 'zip' && zipPlan ? zipPhaseAt(zipPlan.parts, state.done) : phaseAt(state.done));
    lastProgressAt = Date.now();
    emit();
  } else if (d.type === 'warm-done') {
    chunkFailedAcc += d.failed ?? 0;
    state.failed = chunkFailedAcc;
    if (d.tag === 'zip' && zipPlan) {
      // 片完成→按绝对 done 推进片游标(乱序/重复回包幂等)
      let acc = 0;
      partCursor = 0;
      for (const p of zipPlan.parts) {
        acc += p.files;
        if ((d.done ?? 0) >= acc) partCursor++;
        else break;
      }
    } else if ((d.done ?? 0) > chunkCursor) chunkCursor = d.done;  // 块完成→接力下一块
    sendChunk();
  } else if (d.type === 'warm-zip-unavailable') {
    // SW 侧无 fflate(旧部署 vendor 缺失)→ 整会话回退逐文件;版本退回基础版
    // (缓存名随之换——zip 版缓存里已有条目作废重下,罕见路径可接受)
    zipPlan = null;
    partCursor = 0;
    chunkCursor = 0;
    chunkFailedAcc = 0;
    autoRetries = 0;
    state.version = assetVersion();
    state.total = plan.urls.length;
    state.done = 0;
    state.warming = true;
    sendChunk();
  }
}

let lastProgressAt = 0;
let watchdogTimer: ReturnType<typeof setInterval> | 0 = 0;
/** 分块接力(2026-08-13 实测 SW 会被浏览器 ~3min 击杀,单发全量 11k 无法跑完):
 *  页面按 CHUNK 个文件一批发给 SW,块完成(done 消息)自动发下一块;看门狗对
 *  当前块停滞 >15s 补发(SW keys() 过滤=断点续传)。块粒度 500 → 单块 ~15-30s,
 *  远低于 SW 死亡窗口;即使整块死亡也只损失当前块,接力自愈 */
const CHUNK = 500;
let chunkCursor = 0;      // 下一块在 plan.urls 的起始下标
let chunkFailedAcc = 0;   // 跨块累计失败
let autoRetries = 0;      // 全量跑完仍有失败时的自动补拉轮数(限速期偶发失败自愈)

/** 分批发送 dispatcher:zip 模式走分片,legacy 走分块 */
function sendChunk(): void {
  if (zipPlan) { sendPart(); return; }
  sendChunkLegacy();
}

/** zip 模式:单片下发(SW 下载+解压+逐条落缓存;片内 have-set 断点续传) */
function sendPart(): void {
  const parts = zipPlan!.parts;
  if (partCursor >= parts.length) {
    // 全片完成仍有失败 → 自动补拉轮(同 legacy:重扫只补失败)
    if (chunkFailedAcc > 0 && autoRetries < 3) {
      autoRetries++;
      chunkFailedAcc = 0;
      state.failed = 0;
      partCursor = 0;
      sendPart();
      return;
    }
    state.warming = false;
    state.phase = 'done';
    state.done = state.total;
    emit();
    return;
  }
  const part = parts[partCursor];
  const base = parts.slice(0, partCursor).reduce((a, p) => a + p.files, 0);
  state.warming = true;
  state.phase = zipPhaseAt(parts, state.done);
  lastProgressAt = Date.now();
  postToSw({
    type: 'warm-zip',
    part: { file: part.file, files: part.files, entries: part.entries },
    base,
    total: state.total,
  });
}

function sendChunkLegacy(): void {
  const slice = plan.urls.slice(chunkCursor, chunkCursor + CHUNK);
  if (!slice.length) {
    // 全量跑完仍有失败 → 自动重拉一轮(keys() 过滤=只补失败项,极快);
    // 3 轮后放弃,交人工(门槛弹窗的"重新下载"按钮)
    if (chunkFailedAcc > 0 && autoRetries < 3) {
      autoRetries++;
      chunkFailedAcc = 0;
      state.failed = 0;
      chunkCursor = 0;
      sendChunk();
      return;
    }
    state.warming = false;
    state.phase = 'done';
    state.done = plan.urls.length;
    emit();
    return;
  }
  state.warming = true;
  state.phase = phaseAt(state.done);
  lastProgressAt = Date.now();
  postToSw({ type: 'warm', tag: 'chunk', urls: slice, base: chunkCursor });
}

function startWatchdog(): void {
  if (watchdogTimer || typeof setInterval === 'undefined') return;
  watchdogTimer = setInterval(() => {
    if (!state.enabled || state.phase === 'done') return;
    // 停滞补发(SW 死亡/切后台 throttling):重发当前块,keys() 过滤只补缺
    if (!state.warming || Date.now() - lastProgressAt > 15_000) sendChunk();
  }, 5_000) as unknown as ReturnType<typeof setInterval>;
}

/** 全量后台下载(进菜单即调;分块接力+断点续传,已下载跳过/被清理只补缺)。
 *  force=true:门槛弹窗"重新下载"按钮用——**绕过已完成早退守卫**(3 轮自动
 *  重试耗尽后 done>=total 恒真,不绕过则按钮点了没反应=用户永久卡死,2026-08-13) */
export function warmAllAssets(force = false): void {
  if (!state.enabled) return;
  if (state.warming) return;
  const finished = zipPlan ? partCursor >= zipPlan.parts.length : chunkCursor >= plan.urls.length;
  if (!force && state.done >= state.total && finished) return; // 已完成(幂等)
  if (force) {
    chunkCursor = 0;
    partCursor = 0;
    state.done = 0;
    state.phase = zipPlan ? zipPhaseAt(zipPlan.parts, 0) : phaseAt(0);
  }
  chunkFailedAcc = 0;
  autoRetries = 0;
  sendChunk();
}

/** DebugReport/探针用:刷新计划(测试注入) */
export function __setPlanForTest(urls: string[], phases: Array<{ phase: AssetPhase; start: number; end: number }>): void {
  plan = { urls, phases };
  state.total = urls.length;
}

/** 测试注入 zip 分片计划(null = 回 legacy) */
export function __setZipPlanForTest(m: ZipManifest | null): void {
  zipPlan = m;
  partCursor = 0;
  chunkCursor = 0;
  state.total = m ? m.totalFiles : plan.urls.length;
  state.done = 0;
  state.failed = 0;
}
