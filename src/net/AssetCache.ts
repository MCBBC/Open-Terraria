// SW 资产预载驱动器(2026-08-13,弱网/首进体验)。
// 设计见 plans/gleaming-singing-biscuit.md:进主菜单即按优先级全量下载到
// Cache API 磁盘缓存(public/sw.js 拦截服务);右下角悬浮进度 + 单人游戏门槛
// 弹窗在 src/ui/AssetDownloadUI.ts。本模块只做:门控/版本/优先级清单枚举/
// SW 消息协议/进度状态。
//
// ★版本 = fnv1a32(vanilla.json + vanilla-ui.json 内容 + CACHE_BUSTER)。
//   贴图清单变了 → JSON 变 → bundle 变 → version 变 → 新缓存整批重建。
//   只改 sounds/fonts/l10n 内容时 JSON 不变 → 需手动 bump CACHE_BUSTER。
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
  menu: '菜单', 'game-sprites': '游戏贴图', 'misc-sprites': '其余贴图',
  sounds: '音效', music: '音乐',
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

function postToSw(msg: Record<string, unknown>): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : undefined;
  sw?.postMessage(msg);
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
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? reg.active ?? null;
    if (!sw) return;
    state.enabled = true;
    sw.postMessage({ type: 'init', version: state.version });
    sw.postMessage({ type: 'status' });
    navigator.serviceWorker.addEventListener('message', onSwMessage);
  } catch { /* 注册失败(老浏览器/隐私模式)→ 降级现状,零影响 */ }
}

function onSwMessage(e: MessageEvent): void {
  const d = e.data || {};
  if (d.type === 'status') {
    // 初始判定:以 SW 实测缓存数对齐进度(被系统清理→cached 变小→重新补下)
    if (typeof d.cached === 'number' && d.version === state.version) {
      state.done = Math.min(d.cached, state.total);
      emit();
    }
  } else if (d.type === 'warm-progress' || d.type === 'warm-done') {
    state.done = Math.min(d.done ?? 0, state.total);
    state.failed = d.failed ?? 0;
    state.warming = d.type === 'warm-progress';
    state.phase = state.done >= state.total ? 'done' : phaseAt(state.done);
    emit();
  }
}

/** 全量后台下载(进菜单即调;SW 侧 keys() 过滤→已下载跳过/清理只补缺) */
export function warmAllAssets(): void {
  if (!state.enabled) return;
  if (state.warming) return;
  state.warming = true;
  state.phase = phaseAt(state.done);
  postToSw({ type: 'warm', tag: 'all', urls: plan.urls });
}

/** DebugReport/探针用:刷新计划(测试注入) */
export function __setPlanForTest(urls: string[], phases: Array<{ phase: AssetPhase; start: number; end: number }>): void {
  plan = { urls, phases };
  state.total = urls.length;
}
