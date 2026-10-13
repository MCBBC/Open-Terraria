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
import vanillaNpcsJson from '../../public/sprites/vanilla-npcs.json';
import vanillaUiJson from '../../public/sprites/vanilla-ui.json';
import assetsIndexJson from '../../public/assets-index.json';
import { MUSIC } from '../data/Music';
import { unzipSync } from 'fflate';   // zip 快路径页面直给解压(SW 不参与 warming)
import { VANILLA_MISC } from '../assets/SpriteAtlas';
import { mimeOf } from './assetMime';   // ★落库 CT 单源(2026-09-16 根修,见 assetMime.ts 头注)
import { prefGet, prefRemove, prefSet } from '../save/PrefsStore';   // ★BJ627 trace/完成旗/hash 键迁 IDB 单写
import { demoteSuspicious, type PartCandidate } from './partFetcher';   // ★CDN 化候选(2026-10-13;demote=黑洞降级)

/** 手动版本闸:仅 sounds/audios/fonts/l10n 内容变更时 +1(贴图走 JSON 内容 hash 自动)。
 *  ★2(2026-08-21):public/sprites/vanilla/*.png 字节被并行会话 remaster 测试替换又
 *  恢复(JSON 清单未变 → 版本未变),SW 缓存持续回供错位旧字节——月总 NPC_396 内容
 *  在画布内偏移,眼窝/嘴覆层(锚点正确)相对错位帧全部"偏移"。版本不含 PNG 字节,
 *  此类资产字节中毒只能 bump 本闸强制整批重建。 */
export const CACHE_BUSTER = 2;

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

// ---- 分片 CDN 多源(2026-10-13,preview 切源;生产无 cdn.json=纯同源零改动) ----
// cdn.json 由 scripts/publish-assets-cdn.mjs 发布分片到 npm(@sandboxworld/assets-p<i>,
// 版本=内容哈希 0.0.0-<hash8>)后产出并验活,只写进 dist-release 部署工件:
//   { v:1, generatedAt, parts: { 'p1-d3b56b63.zip': {
//       pkg, version,
//       urls:    [jsDelivr zip 直链…],            // 全球源(内容寻址,immutable)
//       tgzUrls: [{url, bytes}…],                 // ★npmmirror tarball(国内快车道)
//   } } }
// ★npmmirror unpkg files API 有白名单(新 scope 拒绝,cnpm/unpkg-white-list)→ 国内
//   源走 tarball(tgz 包着 zip,registry 核心功能无白名单);客户端 gunzip+tar 取 zip。
// ★候选序(纯函数):tgzUrls(国内)→ urls(全球)→ 末位恒同源兜底——CDN 全灭=旧版行为。
// ★缓存键全是 zip 内相对路径,与分片来源无关:换源不换版本,存量缓存零重拉。

export interface ZipCdnTgz { url: string; bytes: number }
export interface ZipCdnMap {
  v: number;
  parts: Record<string, { urls?: string[]; tgzUrls?: ZipCdnTgz[]; pkg?: string; version?: string }>;
}

/** cdn.json 受理门(纯函数):v=1 + parts 对象;单条 urls/tgzUrls 在
 *  buildPartCandidates 处再消毒(https-only/上限 4/bytes 正数),此处只拦结构性垃圾 */
export function acceptsCdnMap(m: unknown): m is ZipCdnMap {
  if (!m || typeof m !== 'object') return false;
  const o = m as { v?: unknown; parts?: unknown };
  if (o.v !== 1 || !o.parts || typeof o.parts !== 'object' || Array.isArray(o.parts)) return false;
  const entries = Object.values(o.parts as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 256) return false;
  return entries.every((e) => !!e && typeof e === 'object'
    && ((e as { urls?: unknown }).urls === undefined || Array.isArray((e as { urls?: unknown }).urls))
    && ((e as { tgzUrls?: unknown }).tgzUrls === undefined || Array.isArray((e as { tgzUrls?: unknown }).tgzUrls))
    && ((e as { urls?: unknown }).urls !== undefined || (e as { tgzUrls?: unknown }).tgzUrls !== undefined));
}

/** 分片下载候选序(纯函数):tgzUrls(国内快车道,优先)→ urls(全球 zip)→ 末位恒同源。
 *  消毒:https-only / ≤4 / tgz.bytes 须正数(长度校验锚)。
 *  ★根相对:worker 自身 URL 在 /assets/ 下,裸相对会解析成 /assets/assets-zip/ */
export function buildPartCandidates(file: string, zipBytes: number, cdn: ZipCdnMap | null | undefined): PartCandidate[] {
  const out: PartCandidate[] = [];
  const e = cdn?.parts?.[file];
  if (e) {
    for (const t of Array.isArray(e.tgzUrls) ? e.tgzUrls : []) {
      if (out.length >= 4) break;
      if (t && typeof t.url === 'string' && /^https:\/\//.test(t.url) && Number.isFinite(t.bytes) && t.bytes > 0) {
        out.push({ url: t.url, bytes: t.bytes, kind: 'tgz' });
      }
    }
    for (const u of Array.isArray(e.urls) ? e.urls : []) {
      if (out.length >= 4) break;
      if (typeof u === 'string' && /^https:\/\//.test(u)) out.push({ url: u, bytes: zipBytes, kind: 'zip' });
    }
  }
  out.push({ url: '/assets-zip/' + file, bytes: zipBytes, kind: 'zip' });
  return out;
}

// ---- 诊断 trace(2026-08-27 手机无 Console 方案)----
// 环形日志:内存(本轮)+ 持久份(★BJ627 迁 IDB 经 PrefsStore,pagehide 节流刷盘)。
// 手机端经主菜单 logo 连点 5 次弹出 textarea 复制(readSwTrace)。
// 登记注：pagehide 硬关闭(无 bfcache)窗口 IDB 事务可能不提交=末批 ≤120 条可能丢
// ——诊断环可接受(导航/bfcache 路径正常提交;真机取证以 mid-session 刷盘批为主)。
const TRACE_KEY = 'swAssetTrace';
const TRACE_MAX = 300;
let traceMem: string[] = [];
let traceLastFlush = 0;
export function swTrace(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  traceMem.push(line);
  if (traceMem.length > 120) flushTrace();
}
function flushTrace(): void {
  if (!traceMem.length) { traceMem = []; return; }
  try {
    const prev = JSON.parse(prefGet(TRACE_KEY) ?? '[]') as string[];
    prefSet(TRACE_KEY, JSON.stringify([...prev, ...traceMem].slice(-TRACE_MAX)));
  } catch { /* 配额/隐私模式:丢持久份,内存份仍在 */ }
  traceMem = [];
  traceLastFlush = Date.now();
}
export function readSwTrace(): string[] {
  let persisted: string[] = [];
  try { persisted = JSON.parse(prefGet(TRACE_KEY) ?? '[]') as string[]; } catch { /* */ }
  return [...persisted, ...traceMem].slice(-TRACE_MAX);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (traceMem.length && Date.now() - traceLastFlush > 2000) flushTrace();
  });
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

/** P1 游戏贴图:全部图块/墙表 + NPC 表(登记 20 张 + ★BJ636 散件全集) + VANILLA_MISC
 *  (烘焙族/门对/液体) + 物品图标图集。
 *  ★BJ636(2026-10-11):NPC 主表散件全集(vanilla-npcs.json 696 键)补进 P1——
 *  旧清单只有 vanilla.json npcs 登记的 20 张,普通怪散件不暖存;legacy 逐文件
 *  warm 回退会话(manifest 缺失/SW 无 fflate)下 Cache API 缺件 + 发布形态散件
 *  被 prune → cache-first miss 网络回源 404 = 进游戏全体怪物透明(与
 *  SpriteAtlas.preloadMiscAndNpcs 同源双修)。zip 模式本就覆盖(pack 扫盘全集),
 *  清单加项不换缓存版本(版本=JSON 内容 hash 面,vanilla-npcs.json 不在其内),
 *  存量缓存由冷启 warmAllAssets have-set 差集对账自动补下。 */
export function worldWarmUrls(vanilla: VanillaData = vanillaJson): string[] {
  const out = new Set<string>();
  for (const m of Object.values(vanilla.tiles ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const m of Object.values(vanilla.walls ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const m of Object.values(vanilla.npcs ?? {})) if (m.sheet) out.add(`sprites/${m.sheet}`);
  for (const id of Object.keys(vanillaNpcsJson as Record<string, unknown>)) out.add(`sprites/vanilla/NPC_${id}.png`);
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
  /** ★存储不可用(2026-09-04 用户立项"降级显式化"):Cache Storage open/访问
   *  失败(隐私模式禁用/损坏/策略)——资源走网络直载(每次启动需下载 364MB),
   *  UI 须显式提示而非静默劣化。 */
  storageUnavailable?: boolean;
  /** ★管线未启用原因(notePipelineDown 落账;非空=SW 管线关闭,含降级环境说明) */
  pipelineDown?: string;
  pipelineDownTransient?: boolean;
  version: string;
  total: number;
  done: number;
  failed: number;
  phase: AssetPhase | 'done' | 'idle';
  warming: boolean;
  /** 下载字节账(zip 模式;bytesTotal=0 → 无字节信息,UI 回退文件数口径) */
  bytesDone: number;
  bytesTotal: number;
  /** ★已校准(2026-08-28 用户报"暖缓存也闪 0%"):首个 status 回包/warm 进度到达
   *  前.done/total 只是计划值,徽标若照渲染必闪"0%"——UI 在校准前只出骨架文案
   *  (无百分比),校准后若 done>=total 直接走完成淡出=全缓存命中时徽标全程无百分比 */
  calibrated: boolean;
  /** ★缓存覆盖度(2026-08-28 用户要求"本地扫描/预热有进度也亮出来,有盼头"):
   *  status 回包 cached/total 的百分比——本地校验阶段徽标显示它;【仅显示用】,
   *  永不驱动 done/phase/completeFlag(zip 模式 cached 与 plan 不同源,
   *  2026-08-27 假满防线不动)。undefined=尚无回包 */
  coveragePct?: number;
}

const state: AssetCacheState = {
  enabled: false, version: '', total: 0, done: 0, failed: 0, phase: 'idle', warming: false,
  bytesDone: 0, bytesTotal: 0, calibrated: false, coveragePct: undefined,
  storageUnavailable: false,
};

let plan = priorityPlan();
state.total = plan.urls.length;
/** zip 分片计划(InitAssetCache 拉到 manifest 才置;null=legacy 逐文件模式) */
let zipPlan: ZipManifest | null = null;
/** 分片 CDN 候选(拉到 cdn.json 才置;null=纯同源。?cdn=0 显式关闭) */
let zipCdn: ZipCdnMap | null = null;
/** 候选嫌疑账(页面级,跨 worker 重启/force 重warm 生效;★黑洞防护另一半):
 *  worker 'candFail' 逐候选失败上报 → 此处记账;startZipWarm 构造 jobs 时按嫌疑
 *  重排(坏源踢到队尾,origin 恒末位)——没有它,首选源挂起会被 45s 看门狗
 *  反复 force 重启且每次都先撞同一个挂起源 = 活锁,永远走不到回退通道 */
const zipCandSuspicion = new Map<string, number>();
let zipRun = 0;                 // 直给循环代次号(force 重启 → 旧循环在下个检查点自行退出)
let dlCommitted = 0;            // 已完成片累计字节(页面侧 MB 账)
let dlPartGot = 0;              // 当前片最近上报的片内累计
let zipFailedAcc = 0;           // 失败总数(终态>0 → 停机等"重新下载";不自动回卷)
const progressCbs = new Set<(s: AssetCacheState) => void>();

export function assetCacheState(): AssetCacheState {
  // done 钳制:files 批与 done 消息异步交错时内部计数可能超 total(straggler 批),
  // 对外(UI 百分比/门槛)恒 ≤ total
  return { ...state, done: Math.min(state.done, state.total), pipelineDown, pipelineDownTransient };
}

export function onAssetProgress(cb: (s: AssetCacheState) => void): () => void {
  progressCbs.add(cb);
  return () => progressCbs.delete(cb);
}

/** warm 窗口旗上次发送值(null=未发;controllerchange 后重置补发) */
let lastWarmFlagSent: boolean | null = null;
function emit(): void {
  // ★warming 翻转同步到 SW(2026-09-04):SW 据此在 warm 窗口内把图片 miss 的
  //  404 改应 204 静默(DevTools 不再冷启动满屏红;消费方 onerror/重试链不变),
  //  终态后 miss 仍真 404 直通。postToSw 无 controller 时静默丢弃,故换控处
  //  重置 lastWarmFlagSent 保证补发
  if (lastWarmFlagSent !== state.warming) {
    lastWarmFlagSent = state.warming;
    postToSw({ type: 'zip-warm', on: state.warming });
  }
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

/** 自动补拉轮耗尽(2026-08-27):holdForAssetsReady 失败放行的前置门——
 *  失败终态停机后 15s/online 自动补拉最多 5 轮,轮内不得揭幕缺图菜单 */
export function assetsRetriesExhausted(): boolean {
  return zipAutoRetries >= 5;
}

/** 资源下载空闲谓词(2026-08-25 splash 跳过门用):资产系统未启用(dev/?nosw/http)
 *  视为空闲(无可等待)。★2026-08-27 改实测:原 assetsCompleteFast 读上轮
 *  localStorage 标志——清缓存未清站点数据的设备上 flag 残留,splash 期任意
 *  触摸即跳过=缺图进菜单(用户手机实测"80% 跳过过渡图");现只认 SW 实测
 *  complete,底部指示器工作期间为 false */
export function assetsDownloadIdle(): boolean {
  if (!state.enabled) return true;
  return assetsComplete();
}

/** 完成态本地标志(★2026-08-18 用户报"每次 build 后进单人游戏卡下载门槛"):
 *  门槛真正在等的是 SW status 回包——SW 冷启动 + cache.keys() 枚举万条缓存
 *  要 1-2s,期间 done=0 → 门槛误显示"正在下载 0%"(实际零下载,trace 实证
 *  仅 133 条正常懒载)。完成态落持久存储(★BJ627 迁 IDB 经 PrefsStore;同步读
 *  走内存缓存):门槛先查标志秒开;SW 回包到达后若实测缓存被清,撤销标志回到
 *  真实门槛。版本随 key 走,新资产自然失效 */
const COMPLETE_FLAG = 'swAssetsComplete:';
/** manifest contentHash 记忆(2026-08-27):成功会话落盘,失败会话沿用拼版本——
 *  保证缓存名跨会话稳定(否则失败会话换名触发 gc 误清成功会话的暖存) */
const CONTENT_HASH_KEY = 'swContentHash:';
function writeCompleteFlag(v: boolean): void {
  try {
    if (v) prefSet(COMPLETE_FLAG + state.version, '1');
    else prefRemove(COMPLETE_FLAG + state.version);
  } catch { /* 隐私模式等 */
  }
}
/** 快速判定:SW 回包未达前也能凭上轮完成记录放行(代价:缓存被系统清理的
 *  罕见窗口里,懒载会走网络并由 SW 边下边补——自愈,可接受) */
export function assetsCompleteFast(): boolean {
  if (assetsComplete()) return true;
  try { return !!prefGet(COMPLETE_FLAG + state.version); } catch { return false; }
}

/** 与 public/sw.js 的 CACHE_PREFIX 手工同步(缓存名前缀;改须双侧) */
export const CACHE_PREFIX = 'sw-assets-v';   // ★三百十一:导出(mod 资源暖存同缓存名)

/** 懒加载 worker 预取钩子(2026-08-25):由 main 注入(main 持有两个客户端的
 *  prefetchWorker——spawn 点的 new Worker(new URL) 才会被 vite 构建,此处若用
 *  裸 new URL 引 .ts 会被当静态资产原样拷贝进发布包=源码泄漏,实测踩坑)。 */
let lazyWorkerPrefetch: (() => void) | null = null;
export function setLazyWorkerPrefetch(fn: () => void): void {
  lazyWorkerPrefetch = fn;
}

function postToSw(msg: Record<string, unknown>): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : undefined;
  // version 随消息走:SW 被浏览器击杀重启后内存版本丢失,靠消息里的 version 选对缓存
  sw?.postMessage({ version: state.version, ...msg });
}

/** 启动关键资产前置等待(2026-08-25 用户要求):音频门出现前确保标题曲已入分片缓存。
 *  Music_50/51 位于 p0 清单最前(BOOT_FIRST),到位即代表同片的过渡图族也已就位。
 *  内部自起 initAssetCache+warm;不满足运行条件(dev/?nosw/非安全上下文/无 caches)
 *  立即返回 false;超时返回 false(降级放行,不卡死启动)。 */
export async function primeBootAssets(timeoutMs = 30_000): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.has('nosw')) return false;
  if (!import.meta.env.PROD) return false;
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return false;
  if (typeof caches === 'undefined') return false;
  void initAssetCache().then(() => warmAllAssets());
  const want = ['audios/music/Music_50.mp3', 'audios/music/Music_51.mp3'];
  const t0 = Date.now();
  let sent = -1;
  for (;;) {
    try {
      const ms = await Promise.all(want.map((u) => caches.match(u)));
      const n = ms.filter(Boolean).length;
      if (n !== sent) { swTrace(`primeBoot 哨兵 ${n}/${want.length}(p0 过渡图+标题曲)`); sent = n; }
      if (ms.every(Boolean)) { swTrace(`primeBoot 就绪(${Date.now() - t0}ms)`); break; }
    } catch { swTrace('primeBoot 哨兵 match 异常'); break; }
    if (Date.now() - t0 >= timeoutMs) { swTrace(`primeBoot ${timeoutMs}ms 超时降级(此后向日葵窗=等 p0,非故障)`); break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  // 哨兵就位(或超时降级)后:利用音频门等待窗口预取两个懒加载 worker
  lazyWorkerPrefetch?.();
  try {
    const ms = await Promise.all(want.map((u) => caches.match(u)));
    return ms.every(Boolean);
  } catch { return false; }
}

/** 注册 SW 并启动(仅生产构建;?sw=1 强制开、?nosw 关)。幂等。 */
/** manifest 受理门(纯函数,可单测):algoVersion ≥1 且形状完整。
 *  ★曾硬编码 ===1——pack-assets ALGO_VERSION 升到 2 后新 manifest 在此被整份
 *  丢弃:zipPlan=null → startZipWarm 静默 return → p0 启动小片全缺、零分片下载、
 *  页面海量散件 404(2026-08-26 线上实锤)。manifest 形状自 v1 未变;将来结构
 *  不兼容的新大版本应另开字段区分,不得复用本数做排他。 */
/** cache 键归一(2026-08-27 ★decode 修复):keys() 的 pathname 保留 URL 编码
 *  (空格=%20),而 manifest/zip 条目名是原始空格——曾致带空格文件名
 *  (Backgrounds_Underworld、Underworld、StarDustSky 等族,恰聚于 p2-p4 共 58MB)
 *  每轮对账恒判缺失 → 每次启动固定重下 58MB(微实验实锤 haveSetHasRaw=false)。
 *  运行时 cache.match 浏览器自会归一,不受影响;仅对账口径需此解码。
 *  ★改须与 public/sw.js warm 内归一化双侧同步。 */
export function normCacheKey(url: string): string {
  const p = new URL(url).pathname.replace(/^\//, '');
  try { return decodeURIComponent(p); } catch { return p; }   // 非法 % 序列回退原值
}

export function acceptsZipManifest(m: ZipManifest | null): boolean {
  return !!m && typeof m.algoVersion === 'number' && m.algoVersion >= 1
    && Array.isArray((m as ZipManifest).parts) && (m as ZipManifest).parts.length > 0;
}

/** 拉取 manifest 并落 zipPlan/版本/total(成功 true)。budgets=逐次超时表(ms)。 */
async function fetchManifestInto(budgets: number[]): Promise<boolean> {
  for (let a = 0; a < budgets.length; a++) {
    const tA = Date.now();
    try {
      const ctrl: RequestInit = { cache: 'reload' };
      if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        ctrl.signal = AbortSignal.timeout(budgets[a]);
      }
      const res = await fetch('assets-zip/manifest.json', ctrl);
      if (res.ok) {
        const m = (await res.json()) as ZipManifest;
        if (acceptsZipManifest(m)) {
          // ★compose 幂等门(2026-08-27):重复拉取(单例前的双发遗留/重试路径)
          //  不得对【已 composed】的 version 再 compose——叠哈希=版本漂移复辟
          const first = !zipPlan;
          zipPlan = m;
          if (first) {
            const prevVer = state.version;
            state.version = composeVersion(state.version, m.contentHash);
            state.total = m.totalFiles;
            try { prefSet(CONTENT_HASH_KEY, m.contentHash); } catch { /* */ }   // ★BJ627 IDB 单写
            swTrace(`manifest 试${a + 1} ok ${m.totalFiles}条 hash=${m.contentHash.slice(0, 8)} ${Date.now() - tA}ms ver ${prevVer}→${state.version}`);
          } else {
            state.total = m.totalFiles;
            swTrace(`manifest 试${a + 1} ok(重复拉取,version 保持 ${state.version})`);
          }
          return true;
        }
        swTrace(`manifest 试${a + 1} 形状不符(${Date.now() - tA}ms)`);
      } else {
        swTrace(`manifest 试${a + 1} http ${res.status}(${Date.now() - tA}ms)`);
      }
    } catch (e) {
      swTrace(`manifest 试${a + 1} 异常/超时 ${Date.now() - tA}ms ${String(e).slice(0, 60)}`);
    }
    if (a < budgets.length - 1) await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** manifest 周期重试(2026-08-27 手机实测"卡 0%"):init 内 3 连败的会话此前
 *  永久躺平(zipPlan=null 不 warm=死等),现每 20s 重拉直至到手 → 到手即发
 *  gc 授权+warmAllAssets 对账启动,hold 继续等 phase 终态,全程无感恢复。 */
let manifestRetryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleManifestRetry(): void {
  if (manifestRetryTimer || typeof window === 'undefined') return;
  manifestRetryTimer = setTimeout(async () => {
    manifestRetryTimer = null;
    if (zipPlan || !state.enabled) { swTrace('manifestRetry 跳过(已到手/未启用)'); return; }
    swTrace('manifestRetry 20s 到期,重拉');
    const ok = await fetchManifestInto([10000, 15000]);
    if (ok) {
      postToSw({ type: 'gc' });
      swTrace(`manifestRetry 成功 → gc+warm(ver=${state.version})`);
      if (!state.warming) warmAllAssets(true);
    } else {
      swTrace('manifestRetry 再败 → 续排');
      scheduleManifestRetry();
    }
  }, 20_000);
}

/** cdn.json 拉取(可选加速器,失败/缺失一律静默回同源;单次尝试不重试):
 *  与 manifest 并行发起,5s 超时;404=未发布 CDN(生产常态)→ trace 一笔即止。
 *  ?cdn=0 显式关闭(A/B 与诊断用);cache:'reload' 与 manifest 同款防旧。 */
async function fetchCdnMapInto(): Promise<void> {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.get('cdn') === '0') { swTrace('cdn.json ?cdn=0 显式关闭'); return; }
  const t0 = Date.now();
  try {
    const ctrl: RequestInit = { cache: 'reload' };
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      ctrl.signal = AbortSignal.timeout(5000);
    }
    const res = await fetch('assets-zip/cdn.json', ctrl);
    if (!res.ok) { swTrace(`cdn.json http ${res.status}(未发布=同源直连,常态)`); return; }
    const m = (await res.json()) as unknown;
    if (acceptsCdnMap(m)) {
      zipCdn = m;
      swTrace(`cdn.json ok ${Object.keys(m.parts).length}片(${Date.now() - t0}ms)`);
    } else {
      swTrace(`cdn.json 形状不符 → 忽略(${Date.now() - t0}ms)`);
    }
  } catch (e) {
    swTrace(`cdn.json 拉取异常(忽略,同源直连) ${String(e).slice(0, 60)}`);
  }
}

let initInFlight: Promise<void> | null = null;
/** 管线未启用原因(2026-09-03 用户要求"SW 没起来弹窗警告而非静默失败"):
 *  doInitAssetCache 每个 early-return 出口落一笔;''=无失败(enabled/预期关闭)。
 *  transient=值得重试(注册失败/激活超时);env 类(无 SW API/http)重试无意义。 */
let pipelineDown = '';
let pipelineDownTransient = false;
/** SW 页面级监听已绑定(retryAssetCacheInit 重入时防重复注册→消息双跑) */
let swListenersBound = false;
function notePipelineDown(reason: string, transient: boolean): void {
  pipelineDown = reason;
  pipelineDownTransient = transient;
  swTrace(`管线未启用: ${reason}`);
}
/** 环境性关断判定(与 doInitAssetCache 的门严格同式):dev 默认关(!PROD,除非 ?sw
 *  强制)/?nosw/非安全上下文/无 caches API。★资源徽标在关断环境下无意义——
 *  无 SW 即无下载管线,骨架会永久滞留(2026-08-28 用户报 npm run dev 徽标永挂) */
export function assetCacheEnvOff(): boolean {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return true;
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.has('nosw')) return true;
  if (!q.has('sw') && !import.meta.env.PROD) return true;
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return true;
  if (typeof caches === 'undefined') return true;
  return false;
}

export function initAssetCache(): Promise<void> {
  if (!initInFlight) initInFlight = doInitAssetCache();
  return initInFlight;
}

async function doInitAssetCache(): Promise<void> {
  if (state.enabled) { pipelineDown = ''; return; }
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    notePipelineDown('浏览器不支持 ServiceWorker(API 缺失:WebView/内核过旧)', false);
    return;
  }
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const force = q.has('sw');
  // ★调试旗 ?swfail=1(2026-09-03 用户要求):模拟"SW 不可用"走完整失败链路
  //  (管线原因落账+启动弹窗+诊断复制),dev 也可触发(置于 PROD 门之前)。
  if (q.has('swfail')) {
    notePipelineDown('调试旗 ?swfail 模拟:SW 管线不可用', true);
    return;
  }
  if (q.has('nosw')) { pipelineDown = ''; return; }          // 显式关闭=用户意图,不算失败
  if (!force && !import.meta.env.PROD) { pipelineDown = ''; return; }  // dev 默认关(探针/HMR 零干扰)
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
    notePipelineDown('非安全上下文(HTTP)——浏览器禁用 ServiceWorker', false);
    return; // 纯 http 非 localhost 降级
  }
  if (typeof caches === 'undefined') {
    notePipelineDown('无 CacheStorage API(隐私模式/站点存储被禁)', false);
    return;
  }
  // ★open 探测(2026-09-04 用户立项"存储不可用显式化"):API 存在但 open 失败
  //  (隐私模式禁用/存储损坏/配额策略)——此前静默走网络直载,用户只看到
  //  无反馈的等待(364MB 每次启动)。显式落账+启动警示。
  try {
    await caches.open('sw-assets-probe');
    await caches.delete('sw-assets-probe');   // 幂等探测名,清掉不累积
  } catch (e) {
    notePipelineDown(`CacheStorage 不可用(${String(e).slice(0, 60)})——资源走网络直载,每次启动需重新下载`, false);
    return;
  }
  try {
    state.version = assetVersion();
    // ★cdn.json 与 manifest 并行拉(同为同源小文件;只在 zipPlan 到手后才有意义,
    //  warm 前 await 定案,避免 jobs 构造读到 null 的竞态)
    const cdnP = fetchCdnMapInto();
    // zip manifest 拉取(3s 超时;路径不匹配 ASSET_RE → SW 天然放行不缓存;
    // cache:'reload' 防部署后读到旧 manifest)。失败=legacy 逐文件(dev/旧部署)
    // ★manifest 拉取(2026-08-26 引入重试;2026-08-27 抽 fetchManifestInto):
    // 3 次 [4s,4s,8s],全败走版本锚定+周期重试(scheduleManifestRetry,每 20s
    // 重拉直至到手→gc+warm 对账启动),不再永久躺平。
    if (!(await fetchManifestInto([8000, 8000, 12000]))) {
      swTrace('manifest 3连败 → 周期重试+版本锚定');
      scheduleManifestRetry();
    }
    // ★失败会话版本锚定(2026-08-27):3 连败时 zipPlan=null,version 若停在
    // base 形态,SW init 消息将以此版本触发 gcOldCaches——把上次【成功】会话
    // (composed 形态)暖满的缓存整批误清(线上实锤:同 profile 跨会话缓存名
    // 1gl9bw6↔1r403ge 漂移,暖存反复蒸发)。沿用 localStorage 记忆的 contentHash
    // 拼版本 ⇒ 版本号恒定;本会话不 warm(下方门),缓存只读保命。
    if (!zipPlan) {
      try {
        const prev = prefGet(CONTENT_HASH_KEY);   // ★BJ627:IDB(内存缓存)锚
        if (prev) {
          state.version = composeVersion(state.version, prev);
          swTrace(`manifest失败锚定 IDB hash=${prev.slice(0, 8)} → ver=${state.version}`);
        } else swTrace('manifest失败且无锚定 → ver=base');
      } catch { /* 隐私模式等:保底 base 形态 */ }
    }
    // updateViaCache:'none':SW 脚本本身绕过 HTTP 缓存——否则部署新版 sw.js 后
    // 浏览器最长 24h 仍跑旧 SW(标准坑,2026-08-13)
    // ★register 重试(2026-08-27):手机切网/弱网下 register/ready 偶发抛错或
    //   挂起,原单发失败即静默降级(enabled=false)→ hold 秒放+warm 不跑+SW 裸奔
    //   =菜单背景全 404(用户手机实测第四刷)。3 次退避重试+ready 10s 竞速。
    // ★TWA 分流(2026-08-30):start_url 带 ?twasw=1 时注册 sw-twa.js——TWA 形态
    //   需要文档缓存优先(离线冷启动),桌面浏览器保持 sw.js 文档网络优先语义。
    //   两者唯一差异在文档策略与 boot precache,资产层行为完全同构(生成器见
    //   scripts/gen-sw-twa.mjs,由 public/sw.js 打补丁产出,fail-loud marker)。
    const swQ = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const swFile = swQ.has('twasw') ? 'sw-twa.js' : 'sw.js';
    let reg: ServiceWorkerRegistration | null = null;
    let regErr = '';
    for (let a = 0; a < 3 && !reg; a++) {
      try {
        reg = await navigator.serviceWorker.register(swFile, { updateViaCache: 'none' });
      } catch (e) {
        regErr = String(e instanceof Error ? e.message : e).slice(0, 120);
        swTrace(`register 试${a + 1} 失败: ${regErr}`);
        await new Promise((r) => setTimeout(r, 1000 * (a + 1)));
      }
    }
    if (!reg) {
      // ★404 也是这里(部署缺 sw-twa.js/sw.js 时 register 抛 NotFoundError)
      notePipelineDown(`SW 注册连续 3 次失败(${swFile}): ${regErr || '未知错误'}`, true);
      return;
    }
    const readyRace = await Promise.race([
      navigator.serviceWorker.ready.then(() => 'ok' as const),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 10_000)),
    ]);
    if (readyRace === 'timeout') {
      notePipelineDown('SW 已注册但 10s 未激活(ready 竞速超时)', true);
      // 不 return:继续走下方 controller 检查——ready 慢不代表最终不激活,
      // controller 到位仍可正常启用(原行为保留,仅补告警原因)
    }
    // ★硬刷检测(2026-09-09 修正):controller=null = 页面未被 SW 控制(硬刷绕过)。
    //  不看 reg.active——即使 SW 进程活着,controller=null 就意味着 SW 不服务此页面。
    //  reg.active 有值只说明 SW 进程在,但 fetch handler 被绕过 = 等同无 SW。
    // ★每次硬刷都需要一次 reload 让 SW 重新接管(Cmd+Shift+R 绕过 SW 是
    //  Chrome 设计行为,每次都会发生)。不做防循环守卫——普通 reload 后 SW
    //  必然接管,不会死循环。
    if (!navigator.serviceWorker.controller && !!reg.active) {
      console.warn('[AssetCache] 硬刷绕过 SW(controller=null) → 自动刷新恢复控制');
      location.reload();
      return;
    }
    state.enabled = true;
    pipelineDown = '';   // 翻真即清失败原因(弹窗判定以 enabled 为准)
    // ★首访主壳补登记(2026-08-25):首次加载早于 SW 控制权(claim 传播有竞态),
    //   主 chunk 未经 SW 缓存 → 第二次访问仍回源一次。此处直写版本缓存
    //   (http 缓存吸收重复字节);dev 下 import.meta.url 为 /src/*.ts,
    //   由上方 PROD 门天然排除
    try {
      if (import.meta.url.endsWith('.js')) {
        const shellCache = await caches.open(CACHE_PREFIX + state.version);
        if (!(await shellCache.match(import.meta.url))) {
          const res = await fetch(import.meta.url);
          if (res && res.ok) await shellCache.put(import.meta.url, res.clone());
        }
      }
    } catch { /* 非关键路径 */ }
    (globalThis as unknown as { __swAssetCache?: unknown }).__swAssetCache = {
      state: assetCacheState, warm: warmAllAssets, complete: assetsComplete,
    }; // 调试/探针句柄
    (reg.active ?? reg.installing ?? reg.waiting)?.postMessage({ type: 'init', version: state.version });
    // warm 窗口旗显式补发(2026-09-04):纠偏上会话崩溃遗留的 stale true——
    // 页面启动即声明"当前未在 warm",之后 warming 翻转由 emit() 跟随同步
    lastWarmFlagSent = state.warming;
    postToSw({ type: 'zip-warm', on: state.warming });
    // ★gc 显式授权(2026-08-27):仅清单在手的会话允许 SW 清理旧版本缓存——
    // manifest 失败会话不发本消息,version 即便回退 base 形态也无破坏权
    // (localStorage 锚定失效的极端情况[崩溃丢盘]下缓存照样安全)。
    if (zipPlan) (reg.active ?? reg.installing ?? reg.waiting)?.postMessage({ type: 'gc', version: state.version });
    postToSw({ type: 'status' });
    // ★监听只绑一次(2026-09-03 retryAssetCacheInit 重入保护):重试成功会二进
    //   doInitAssetCache,重复 addEventListener 会让 onSwMessage 双跑(legacy
    //   块失败计数 chunkFailedAcc += 会翻倍)。controllerchange/online 同理。
    if (!swListenersBound) {
      swListenersBound = true;
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      // SW 被击杀重启后 controller 会换新实例——重新对齐版本并触发看门狗续传
      navigator.serviceWorker.addEventListener('controllerchange', () => {
      lastWarmFlagSent = null;   // 换控(含 SW 重启)后由 emit 补发 warming 旗
      postToSw({ type: 'status' });
      // ★首访竞态(2026-08-24 OSS 部署实锤,本地 dist-release 复现):SW activate 的
      //   clients.claim() 触发的换控事件可能【晚于】zip 暖缓存启动落地——此处盲目
      //   清 warming 会让后续所有 files 批次被 (!state.warming) 门整批丢弃,
      //   'done' 又免检盖章 done=total → 假完成、真丢件、页面海量 404。
      //   暖缓存进行中改为整体重启(startZipWarm 的 have-set 只补缺,幂等续传);
      //   空闲态维持旧语义。
      if (state.enabled && zipPlan && state.warming) {
        warmAllAssets(true);
        return;
      }
      state.warming = false;
      });
      startWatchdog();
      // ★持久化存储申请(2026-08-27 手机实测"每次刷新全量重下"):移动浏览器
      //  (尤其国产壳)对非持久化站点的 Cache API 驱逐极激进,暖存可被整批清空。
      //  persist() 把站点标记为长期存储(best-effort,可能弹权限/静默拒绝);
      //  拒绝也不影响功能,驱逐后由 have-set 对账增量补下兜底。
      try {
        const st = navigator.storage as { persist?: () => Promise<boolean>; estimate?: () => Promise<StorageEstimate> };
        void st?.persist?.()?.then((granted) => {
          if (granted) console.log('[assets] 持久化存储已授予');
        }).catch(() => { /* */ });
      } catch { /* 老浏览器 */ }
      // ★网络恢复即补拉(2026-08-27):WiFi↔蜂窝切换/断网恢复的 online 事件,
      //   失败终态立即重扫(不等 15s 迟滞)
      addEventListener('online', () => {
        swTrace('online 事件');
        if (state.enabled && state.failed > 0 && !state.warming) scheduleZipAutoRetry(true);
      });
    }   // ★swListenersBound 绑一次块收口(重试重入保护)
    // ★showTitle 的 warmAllAssets 可能抢在 manifest 拉取前到达(enabled=false
    //   被 return 吞掉,之后再无人补调 → 永久 idle;此处自补一脚)
    // ★force 对账(2026-08-26):status 回报的 done 口径含壳/散件噪声,缓存总数
    //   曾虚高越线被误盖 'done' 章、幂等门据此短路 → 缺片无人补、主菜单裸缺
    //   (world.har 实报)。force 只丢弃 UI 进度态重启流程;startZipWarm 按
    //   have-set×manifest 差集下载,无缺失秒退,代价 ≈ 一次 keys() 扫描。
    // ★manifest 失败会话不 warm(2026-08-27):zipPlan=null 时 legacy 逐文件在
    //   prune 形态下注定全 404(熔断兜底前也白烧请求),且本会话缓存只读保命。
    if (zipPlan) {
      await cdnP;   // 定案 CDN 候选(失败/缺失已在 fetchCdnMapInto 内落 trace,静默回同源)
      warmAllAssets(true);
    }
  } catch (e) {
    // 注册失败(老浏览器/隐私模式)→ 降级现状;原因落账供弹窗/诊断(行为不变)
    notePipelineDown(`初始化异常: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`, true);
  }
}

// ---- 管线失败可见化(2026-09-03 用户要求"SW 没起来弹窗警告+可复制诊断") ----

export interface AssetPipelineFailure { down: boolean; reason: string; transient: boolean; }

/** 管线失败态(initAssetCache await 完成后查询)。down=true ⇒ prune 发布形态下
 *  本会话 vanilla 全家族贴图必然 404,UI 层应弹窗告知而非静默放行进世界。 */
export function assetPipelineFailure(): AssetPipelineFailure {
  return { down: !state.enabled && pipelineDown !== '', reason: pipelineDown, transient: pipelineDownTransient };
}

/** 弹窗"重试"入口:重跑 initAssetCache 单例(注册失败/激活超时多为瞬态——
 *  弱网/首次安装慢/部署刚换 sw 文件)。返回重试后是否 enabled。 */
export async function retryAssetCacheInit(): Promise<boolean> {
  initInFlight = null;
  pipelineDown = '';
  await initAssetCache();
  return state.enabled;
}

const DIAG_MB = (b: number): string => `${(b / 1048576).toFixed(1)}MB`;

/** 全量诊断报告(弹窗"复制诊断信息"/logo×5 诊断面板共用):环境+失败原因+
 *  资产状态账+SW 注册态+CacheStorage 清点+存储配额+完成旗,尾接 swTrace 300 条。
 *  全程可选 API try/catch——诊断器自身在任何残缺环境都不能抛。 */
export async function buildAssetDiagReport(): Promise<string> {
  const L: string[] = [];
  const line = (s: string): void => { L.push(s); };
  line('[SandboxWorld 资产管线诊断]');
  try {
    line(`时间: ${new Date().toISOString()}`);
    line(`页面: ${location.href}`);
    line(`UA: ${navigator.userAgent}`);
    line(`语言: ${navigator.language}  平台: ${(navigator as { platform?: string }).platform ?? '?'}`);
    line(`安全上下文: ${(typeof isSecureContext !== 'undefined' ? isSecureContext : '?')}  协议: ${location.protocol}  线程并发: ${navigator.hardwareConcurrency ?? '?'}`);
  } catch { /* 环境 API 缺失逐段跳过 */ }
  const st = assetCacheState();
  const fail = assetPipelineFailure();
  line(`管线: ${st.enabled ? '已启用' : `未启用${fail.reason ? `(原因: ${fail.reason})` : ''}`}`);
  line(`状态账: version=${st.version} done=${st.done}/${st.total} failed=${st.failed} phase=${st.phase} warming=${st.warming} calibrated=${st.calibrated} 字节=${DIAG_MB(st.bytesDone)}/${DIAG_MB(st.bytesTotal)} 补拉轮=${zipAutoRetries}/5`);
  try {
    const swm = navigator.serviceWorker;
    line(`SW: ${swm ? (swm.controller ? '已控制页面' : '已注册,无 controller') : 'API 不可用'}`);
    const regs = await swm.getRegistrations();
    line(`SW 注册: ${regs.length ? regs.map((r) => `${r.scope}${r.active ? ' [active]' : r.installing ? ' [installing]' : r.waiting ? ' [waiting]' : ''}`).join(' ; ') : '无'}`);
  } catch { line('SW 注册: 查询异常/API 缺失'); }
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      const parts: string[] = [];
      for (const n of names) {
        if (!n.startsWith('sw-assets-v')) { parts.push(n); continue; }
        try {
          const cnt = (await (await caches.open(n)).keys()).length;
          parts.push(`${n}(${cnt}条)`);
        } catch { parts.push(n); }
      }
      line(`CacheStorage: ${parts.join(' , ') || '无'}`);
    } else line('CacheStorage: API 不可用');
  } catch { line('CacheStorage: 查询异常'); }
  try {
    const sto = navigator.storage;
    const est = await sto?.estimate?.();
    let persisted = '';
    try { persisted = sto?.persisted ? `  persisted=${await sto.persisted()}` : ''; } catch { /* */ }
    if (est) line(`存储: 已用 ${DIAG_MB(est.usage ?? 0)}/配额 ${est.quota != null ? DIAG_MB(est.quota) : '?'}${persisted}`);
  } catch { /* */ }
  try {
    const flag = prefGet(COMPLETE_FLAG + state.version);   // ★BJ627:IDB(内存缓存)口径
    const hash = prefGet(CONTENT_HASH_KEY);
    line(`本地旗: 完成旗@${state.version}=${flag ? '在' : '无'}  contentHash=${hash ? hash.slice(0, 8) : '无'}`);
  } catch { line('本地旗: 存储不可用'); }
  line('');
  line('—— swTrace 最近 300 条 ——');
  for (const t of readSwTrace()) L.push(t);
  return L.join('\n');
}

function onSwMessage(e: MessageEvent): void {
  const d = e.data || {};
  if (d.type === 'status') {
    state.calibrated = true;   // status 回包=缓存实测账到手(校准位)
    if (typeof d.cached === 'number' && d.version === state.version) {
      // 覆盖度仅显示用(徽标"资源校验·N%"),不参与 done/completeFlag 假满防线
      if (state.total > 0) state.coveragePct = Math.min(100, Math.round((d.cached / state.total) * 100));
      // ★zip 模式禁止用 cached 回写 done(2026-08-27 根修):cached=【全缓存】
      // 条目数(含壳 JS/l10n/上轮遗留),与 zip totalFiles 不同源。上轮暖满的
      // 设备 cached≥total → done 假满 → complete() 假阳秒放行(用户手机实测
      // "34% 字节进度 30s 内揭幕缺图菜单")+后续 put 计数自假满继续 ++ →
      // done>=total 恒真 → phase 假 'done' → badge 淡出/hold 全线失守。
      // done 唯一权威=startZipWarm 的 put 计数与 worker 终态消息;「缓存被
      // 系统驱逐→补下」的对账已由冷启 warmAllAssets(true) 的 have-set 差集
      // 承担,不依赖本回包。legacy 逐文件模式(dev/降级)保留原校准口径。
      if (!zipPlan) {
        state.done = Math.min(d.cached, state.total);
        // ★total>0 门(2026-08-27 手机实测"0% 卡死+秒揭幕"):zipPlan=null 的
        //   降级会话 total=0,`done(0)>=total(0)` 恒真 → 立即盖 'done' 章+
        //   毒写完成标志 → 秒揭幕缺图菜单+后续会话被假 flag 干扰。
        if (state.total > 0 && state.done >= state.total && !state.warming) {
          chunkCursor = plan.urls.length;
          state.warming = false;
          state.phase = 'done';
        }
        if (state.total > 0) writeCompleteFlag(state.done >= state.total);   // 实测校准:满=落标志,被清理=撤销
      }
      lastProgressAt = Date.now();
      emit();
    }
  } else if (d.type === 'warm-progress') {
    state.calibrated = true;   // 实际下载进度到达=必然有真实账
    // done 为绝对值(SW 侧 base 偏移);failed 为当前块/片计数,跨批累计
    state.done = Math.min(d.done ?? 0, state.total);
    state.failed = (zipPlan ? zipFailedAcc : chunkFailedAcc) + (d.failed ?? 0);
    state.warming = true;
    state.phase = state.done >= state.total ? 'done'
      : (d.tag === 'zip' && zipPlan ? zipPhaseAt(zipPlan.parts, state.done) : phaseAt(state.done));
    lastProgressAt = Date.now();
    emit();
  } else if (d.type === 'warm-done') {
    state.calibrated = true;
    // legacy 逐文件分块通道(zip 模式页面直给,不经本消息)
    chunkFailedAcc += d.failed ?? 0;
    state.failed = chunkFailedAcc;
    // ★风暴熔断:发布形态下 prune 散件全 404,单块失败率 ≥60% = 「清单缺失」
    //  形态,继续接力/自动重试纯属烧请求(见 legacyCircuitBroken 注)。停机待
    //  zip 主路接管;"重新下载"按钮经 warmAllAssets(force) 复位本旗。
    if (!zipPlan && lastChunkLen > 0 && (d.failed ?? 0) >= lastChunkLen * 0.6) {
      legacyCircuitBroken = true;
      state.warming = false;
      state.phase = 'done';   // 压住 watchdog 的停滞补发
      emit();
      return;
    }
    if ((d.done ?? 0) > chunkCursor) chunkCursor = d.done;  // 块完成→接力下一块
    sendChunkLegacy();
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
/** legacy 风暴熔断旗(2026-08-26):manifest 拉取失败降级 legacy 后,发布形态
 *  (prune)的 vanilla/sounds/music 散件 100% 404,块失败率→1,3 轮自动重试 =
 *  12000×3 次注定失败的请求 ~70 分钟(线上实锤:7245 req / 20min / 卡 8%)。
 *  单块失败率 ≥60% 即置位停机;zip 修复(manifest 重试)自会接管主路。 */
let legacyCircuitBroken = false;
/** 当前在途块大小(warm-done 熔断判失败率用) */
let lastChunkLen = 0;

/** 分批发送 dispatcher:zip 模式起 worker 直给,legacy 走分块 */
function sendChunk(): void {
  if (zipPlan) { void startZipWarm(); return; }
  sendChunkLegacy();
}

/** zip 直给驱动(2026-08-19 定稿,用户口径"循环下载+更新进度"):
 *  页面预计算每片缺失清单(cache.keys 一次)→ worker 循环 fetch+unzipSync
 *  (重活全在 worker 线程)→ 分批 postMessage 转移回页面 → 页面 cache.put
 *  (★Cache API 仅 Window/SW 可用)+进度 emit。终态:failed>0 停机等门槛
 *  "重新下载"(重建 worker 重扫,have-set 只补缺)——无轮次回卷/看门狗/消息重发。 */
let zipWorker: Worker | null = null;

/** 失败终态自动补拉调度(2026-08-27):failed>0 停机后 15s 迟滞重扫(online 事件
 *  可即时触发);5 轮上限防风暴——每轮 have-set 只补真实缺失,重下零浪费。
 *  轮次不因 warmAllAssets(force) 重置(手动"重新下载"与自动共用 force 通道,
 *  手动后再失败仍保留剩余自动轮)。 */
let zipAutoRetries = 0;
function scheduleZipAutoRetry(immediate = false): void {
  if (zipAutoRetries >= 5) {
    swTrace(`zip自动补拉:5轮耗尽不再自动(${immediate ? 'online' : '定时'}触发)`);
    return;
  }
  zipAutoRetries++;
  swTrace(`zip自动补拉排定 第${zipAutoRetries}/5轮(${immediate ? 'online即时' : '15s后'})`);
  const run = () => {
    // 失败或未完整都要补拉;状态已自愈(缺0)则跳过(不叠跑)
    if (!state.warming && (state.failed > 0 || state.phase !== 'done')) {
      swTrace(`zip自动补拉 第${zipAutoRetries}轮执行(failed=${state.failed})`);
      warmAllAssets(true);
    }
  };
  if (immediate) run();
  else setTimeout(run, 15_000);
}

async function startZipWarm(): Promise<void> {

  if (!zipPlan || state.warming) return;
  state.warming = true;
  state.phase = zipPhaseAt(zipPlan.parts, state.done);
  emit();
  try {
    // have-set:与 SW fetch 拦截/legacy warm 同款归一化(相对路径+decode,见 normCacheKey 注)
    // ★驱逐自愈(2026-09-09 用户实报「have 满 12927 但预载连续 MISS」):浏览器存储
    //  压力下 Cache Storage 会**保留 keys 条目但驱逐 response body**(部分驱逐)——
    //  keys() 只对账「条目存在」,被逐 body 的条目 match 永远 MISS 且 warm 永不补
    //  → 强刷风暴下反复炸。对账改**逐条 match 实测**(body 在才算 have),驱逐条目
    //  被识别为缺 → 本轮补拉 put 新 body 自愈。成本:12897 次 match ≈ 1-2s(warm 启动一次)
    const cache = await caches.open('sw-assets-v' + state.version);
    const have = new Set<string>();
    for (const r of await cache.keys()) {
      const hit = await cache.match(r, { ignoreVary: true }).catch(() => null);
      if (hit) have.add(normCacheKey(r.url));
    }
    let base = 0;
    const jobs = zipPlan.parts.map((p) => {
      const missing = p.entries.filter((n) => !have.has(n));
      base += p.entries.length - missing.length;
      // ★页面级嫌疑重排(跨 worker 重启生效):坏源(黑洞挂起/连续失败)踢到队尾,
      //  origin 恒末位——与 worker 同 run 内的 suspect 账互补,合起来堵死活锁
      const cands = demoteSuspicious(buildPartCandidates(p.file, p.zipBytes, zipCdn), zipCandSuspicion);
      return { file: p.file, zipBytes: p.zipBytes, missing, cands };
    });
    state.done = Math.min(base, state.total);
    {
      const missAll = jobs.flatMap((j) => j.missing);
      swTrace(`warm启动 have=${have.size} jobs=${jobs.filter((j) => j.missing.length).length}片 缺${missAll.length}条 ver=${state.version} cache="${'sw-assets-v' + state.version}"` +
        (missAll.length ? ` 缺失样本:${missAll.slice(0, 20).join(', ')}` : ' (零缺失)'));
    }
    state.bytesDone = 0;
    state.bytesTotal = jobs.reduce((a, j) => a + (j.missing.length ? j.zipBytes : 0), 0);
    if (state.done >= state.total) {   // 已全就位(被清后自愈完成/重复调用)
      state.warming = false;
      state.phase = 'done';
      // ★全就位即清失败账(2026-09-16 无痕首装死锁修):放行条件 assetsComplete()
      //  含 failed===0,残留失败账=phase done+failed>0 自锁态(门槛永挂+重下按钮常亮)
      state.failed = 0;
      zipFailedAcc = 0;
      writeCompleteFlag(true);
      emit();
      return;
    }
    emit();
    zipWorker?.terminate();
    zipWorker = new Worker(new URL('./asset-warm.worker.ts', import.meta.url), { type: 'module' });
    const myRun = ++zipRun;
    // ★消息串行化(2026-09-16):async 处理器在首个 await 处让出控制权,'done' 终验
    //  可与末批 'files' 的 cache.put 并发——终验快照把在途条目误判缺失。链式排队
    //  保序,'done' 必然看到全部批次落库后的真实缓存态。
    let msgTail: Promise<void> = Promise.resolve();
    // 命中源标签(遥测):候选下标 → 'origin' | CDN hostname(自证式 trace)
    const jobCands = new Map<string, PartCandidate[]>();
    for (const j of jobs) jobCands.set(j.file, j.cands);
    const viaLabel = (file: string, via: number): string => {
      const cands = jobCands.get(file);
      if (!cands || via < 0 || via >= cands.length) return 'none';
      if (via === cands.length - 1) return 'origin';
      const c = cands[via]!;
      try { return `${new URL(c.url).hostname}${c.kind === 'tgz' ? '(tgz)' : ''}`; } catch { return `cdn${via}`; }
    };
    const viaCount = new Map<string, number>();
    let viaFirstLogged = false;
    const handleZipMsg = async (d: {
      type: string; names?: string[]; bufs?: ArrayBuffer[];
      mime?: string[]; failed?: number; done?: number; got?: number; via?: number; file?: string;
    }): Promise<void> => {
      if (myRun !== zipRun) return;   // 已被 force 重启取代,丢弃旧 worker 消息
      if (d.type === 'dl' && d.got) {
        // ★全局字节直通(2026-09-04 worker 并发化):worker 内部统一全局计数
        //  (片重试回卷由 worker 修正),页面直用不再分账(dlPartGot/dlCommitted 废止)
        state.bytesDone = Math.min(d.got, state.bytesTotal);
        lastProgressAt = Date.now();   // 喂 zip 停滞看门狗(45s 无消息=挂死)
        emit();
        return;
      }
      if (d.type === 'files' && d.names && d.bufs) {
        if (!state.warming) return;   // 终态后残留批次('done' 与 files 处理异步交错)不回计
        lastProgressAt = Date.now();
        for (let i = 0; i < d.names.length; i++) {
          try {
            // ★CT 页面侧重算(2026-09-16 根修):不信任 worker 消息里的 mime(旧表
            //  漏 opus 曾致 863 条音效以 octet-stream 落库,被 sw.js 会话清扫整批
            //  删除=40MB/会话重下循环)。与 worker 同引 assetMime 单源,漂移即同错。
            await cache.put(d.names[i], new Response(d.bufs[i], { headers: { 'Content-Type': mimeOf(d.names[i]) } }));
            state.done++;
          } catch { zipFailedAcc++; }
        }
        state.phase = state.done >= state.total ? 'done' : zipPhaseAt(zipPlan!.parts, state.done);
        emit();
      } else if (d.type === 'candFail') {
        // ★黑洞防护记账:候选失败(含超时)→ 页面嫌疑账 +1;下次 warm 构造 jobs 时
        //  该候选被排到队尾(see startZipWarm demoteSuspicious)。黑洞挂起场景
        //  partDone 永不到达,唯有本消息能把"这源坏了"带出 worker
        if (typeof d.via === 'number' && d.file) {
          const url = jobCands.get(d.file)?.[d.via]?.url;
          if (url) zipCandSuspicion.set(url, (zipCandSuspicion.get(url) ?? 0) + 1);
        }
      } else if (d.type === 'partDone') {
        zipFailedAcc += d.failed ?? 0;   // 字节账已由 'dl' 全局直通,无需分片入账
        state.failed = zipFailedAcc;
        lastProgressAt = Date.now();
        if (typeof d.via === 'number' && d.file) {
          const tag = viaLabel(d.file, d.via);
          viaCount.set(tag, (viaCount.get(tag) ?? 0) + 1);
          if (!viaFirstLogged) {
            viaFirstLogged = true;
            swTrace(`首片源=${tag}(via=${d.via})${d.failed ? ` 失败${d.failed}条` : ' ok'}`);
          }
        }
        emit();
      } else if (d.type === 'done') {
        zipFailedAcc += 0;   // 条目级已实时累计
        // ★终局完整性验证(2026-09-16 无痕首装死锁修,两层):
        //  ①【精确差集】缓存混有壳 JS/文档/l10n/__sw_meta__ 等非清单条目,曾按
        //    have.size >= manifestTotal 计数——个位数真缺失被额外条目掩码成假
        //    "完整✓";改逐条比对清单,缺 0 条才算完整。
        //  ②【verified 必清 failed】旧 verified 分支只清 zipFailedAcc 不清
        //    state.failed(worker 条目级失败残留)→ phase='done'+failed>0:
        //    assetsComplete() 恒 false,单人门槛永久拦截(99%·完成·重新下载 态),
        //    且此分支不排补拉=永远自锁。
        //  真缺 → 不标 done,failed=缺失数 → scheduleZipAutoRetry 15s 后只补缺,
        //  补完再进此分支重验,直至完整或 5 轮耗尽。
        const keys = await cache.keys();
        const have = new Set<string>();
        for (const k of keys) {
          const hit = await cache.match(k, { ignoreVary: true }).catch(() => null);
          if (hit) have.add(normCacheKey(k.url));
        }
        const missing: string[] = [];
        for (const p of zipPlan!.parts) {
          for (const n of p.entries) if (!have.has(n)) missing.push(n);
        }
        const verified = missing.length === 0;
        const viaLine = viaCount.size
          ? ` 源分布:${[...viaCount.entries()].map(([k, n]) => `${k}×${n}`).join(' ')}`
          : '';
        swTrace(`warm终态 keys=${keys.length} 缺${missing.length}条${missing.length ? ` 样本:${missing.slice(0, 12).join(', ')}` : ''} failed=${zipFailedAcc} bytes=${Math.round(state.bytesDone / 1048576)}MB${viaLine}`);
        if (verified) {
          state.warming = false;
          state.done = state.total;
          state.failed = 0;                    // ★门槛放行条件含 failed===0,必清
          zipFailedAcc = 0;
          state.bytesDone = state.bytesTotal;  // 'dl' 512KB 节流尾差补齐(99%→100%)
          state.phase = 'done';
          writeCompleteFlag(true);
        } else {
          // 缺:不标 done → hold 不放行;failed 必须非零让补拉轮条件满足
          state.warming = false;
          state.failed = Math.max(1, missing.length);
          state.phase = zipPhaseAt(zipPlan!.parts, state.done);
        }
        emit();
        zipWorker?.terminate();
        zipWorker = null;
        if (!verified) scheduleZipAutoRetry();
      }
    };
    zipWorker.onmessage = (ev: MessageEvent) => {
      msgTail = msgTail
        .then(() => handleZipMsg(ev.data as Parameters<typeof handleZipMsg>[0]))
        .catch((e) => swTrace(`zip 消息处理异常 ${String(e instanceof Error ? e.message : e).slice(0, 80)}`));
    };
    zipWorker.onerror = () => {   // worker 崩溃:按当前失败态停机(重新下载可重启)
      if (myRun !== zipRun) return;
      swTrace(`worker 崩溃 done=${state.done} failed=${zipFailedAcc} warming→false`);
      state.warming = false;
      state.failed = Math.max(1, zipFailedAcc);
      emit();
      zipWorker?.terminate();
      zipWorker = null;
    };
    zipWorker.postMessage({ type: 'run', jobs });
  } catch {
    state.warming = false;
    emit();
  }
}

function sendChunkLegacy(): void {
  if (legacyCircuitBroken) return;
  const slice = plan.urls.slice(chunkCursor, chunkCursor + CHUNK);
  lastChunkLen = slice.length;
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
    if (zipPlan) {
      // ★zip 停滞自愈(2026-08-27 手机实测"卡 0% 不动弹"):worker 挂死/半断网
      //   下 45s 无任何下载消息 → force 重扫(have-set 只补缺,幂等)。慢网不误触:
      //   'dl' 消息 200ms/512KB 心跳,只要有字节流动就 <45s。
      if (state.warming && Date.now() - lastProgressAt > 45_000) warmAllAssets(true);
      return;
    }
    // 停滞补发(SW 死亡/切后台 throttling):重发当前块,keys() 过滤只补缺
    if (!state.warming || Date.now() - lastProgressAt > 15_000) sendChunk();
  }, 5_000) as unknown as ReturnType<typeof setInterval>;
}

/** 全量后台下载(进菜单即调;分块接力+断点续传,已下载跳过/被清理只补缺)。
 *  force=true:门槛弹窗"重新下载"按钮用——**绕过已完成早退守卫**(3 轮自动
 *  重试耗尽后 done>=total 恒真,不绕过则按钮点了没反应=用户永久卡死,2026-08-13) */
export function warmAllAssets(force = false): void {
  if (!state.enabled) return;
  // ★force 必须能打断进行中的暖(controllerchange 重启路径依赖此语义),
  //   否则换控重启被 warming 守卫吞掉 = 修复失效
  if (!force && state.warming) return;
  const finished = zipPlan ? state.phase === 'done' : chunkCursor >= plan.urls.length;
  // ★幂等守卫修正(2026-09-09 硬刷复现):state.done/state.phase 是内存状态,
  //  硬刷/换代后 SW 缓存可能已被浏览器部分清除——keys() 实测才是唯一可信源。
  //  旧幂等守卫 `state.done >= state.total && finished` 信任内存状态 → 硬刷后
  //  内存仍记 done → 守卫短路 → warm 不跑 → 贴图/声音全丢+badge 永久卡。
  if (!force && state.done >= state.total && finished) {
    // 实测对账:keys 数 < manifest totalFiles → 有丢失,不短路(继续 warm)
    const zp = zipPlan;
    if (zp) {
      void caches.open('sw-assets-v' + state.version).then(async (c) => {
        const keyCount = (await c.keys()).length;
        const manifestTotal = zp.parts.reduce((a, p) => a + p.files, 0);
        if (keyCount < manifestTotal) {
          swTrace(`幂等守卫: 实测 keys=${keyCount} < ${manifestTotal} → 强制重warm`);
          state.done = keyCount;   // 校准到实况
          state.phase = zipPhaseAt(zp.parts, keyCount);
          warmAllAssets(true);     // force 重跑(have-set 实测只补缺)
        }
      }).catch(() => {});
    }
    return;
  }
  if (force) {
    zipRun++;                  // 旧 worker 消息作废
    zipWorker?.terminate();
    zipWorker = null;
    zipFailedAcc = 0;
    legacyCircuitBroken = false;   // 人工"重新下载"绕过熔断
    chunkCursor = 0;
    state.done = 0;
    state.failed = 0;
    state.bytesDone = 0;
    state.bytesTotal = 0;
    dlCommitted = 0;
    dlPartGot = 0;
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
  zipRun++;
  zipFailedAcc = 0;
  chunkCursor = 0;
  state.total = m ? m.totalFiles : plan.urls.length;
  state.done = 0;
  state.failed = 0;
  state.warming = false;
}
