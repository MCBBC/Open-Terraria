// 图鉴 UI 面板（DOM，M-补齐清单 #2）——对照 Terraria.GameContent.UI.States/
// UIBestiaryTest.cs（1.4.5.6）+ UI.Elements/UIBestiaryEntryGrid.cs：
//   网格 72×72 单元（GetEntriesToShow：cols=floor(w/72) rows=floor(h/72)，分页按页偏移）
//   范围文本 "{first}-{last} ({total})"（GetRangeText）；FixBestiaryRange 钳制
//   顶栏：◀ ▶ + 范围 + 排序 + 筛选 + 搜索（UIWrappedSearchBar）
//   底栏：完成度百分比 + 进度条（FillPercent；填充 rgb(51,137,255) 底 rgb(35,43,81)）
//   面板底色 rgb(33,43,79)*0.8（BuildPage UIPanel.BackgroundColor）
//   条目卡：头像（NPC 表首帧）+ 名字；未解锁剪影（UnlockableNPCEntryIcon 语义）
//   详情栏（右侧，UIBestiaryEntryInfoPage 位置）：
//     解锁档 UnlockState 1 头像/2 +属性/3 +掉落/4 +掉落率（Bestiary.ts unlockState）
//     掉落表 = vanilla-npcdrops.json 规则树展平（ItemDropBestiaryInfoElement 近似）
// 打开入口：背包面板图鉴按钮（原版 BestiaryMenuButton Main.cs:41905）+ 暂停菜单。
// 键位：Inventory 键位表动作关闭（默认 Esc+E；capture 阶段拦截防 main.ts 暂停键二次消费）。
// 已闭合登记（数据层 → UI 消费）：
//   - 排序：Sort_BestiaryID（ContentSamples.NpcBestiarySortingId 九键链全键提取，
//     含 GetLowestBiomeGroupIndex）/ Sort_Rarity（NpcBestiaryRarityStars，npcStats 投影）
//   - 头像背景：IBestiaryBackgroundImagePathAndColorProvider（MapBG1-42 按出没环境
//     推导，偏好 AddTags/世界恶双路/月总特例；网格=首个带图条件，详情=末个+bgColor 着色）
// 登记缺口（后续批次）：
//   - Visuals.* 装饰叠层（MapBGOverlay1-9：Rain/Blizzard/Sun/Moon/Meteor 等）——
//     提取数据已含 derivations 推导规则，DOM 头像暂只铺底图不叠装饰层
//   - 筛选：稀有生物（RareSpawnBestiaryInfoElement）/ 群系 / 事件标签
import { upgradeToBitmap, USE_BITMAP } from '../assets/SpriteAtlas';
import { Lang } from '../i18n/Lang';
import { NPC_NAME_BY_ID } from '../i18n/idNames.generated';
import { BESTIARY_CREDIT_REDIRECT } from '../data/bestiaryStatics.generated';
import { VANILLA_NPCS } from '../data/vanillaNpcs';
// 负 netID 变体的 color/scale/alpha（SetDefaultsFromNetId L7633-7820；
// public/sprites/vanilla-npcnetid.json，与 VanillaSpawner 同源数据）
import vanillaNetIdJson from '../data/vanilla-npcnetid.json';
const NETID_OV: Record<string, { scale?: number; color?: number[]; alpha?: number }> = vanillaNetIdJson;
// NPCBestiaryDrawOffset 全表（tools/extract-npcbestiaryoffset.mjs ← NPCID.cs 三段合并
// 665 条）：图鉴头像逐 NPC 手调（Boss/巨怪 Scale 缩小 / Position 挪位 / Frame 静态帧 /
// Rotation / CustomTexture 手绘替换图；PortraitScale 仅详情档）。Hide 条目已在
// BESTIARY_HIDE_IDS 排除（GetExclusions 不建条目）
import bstDrawOffsetJson from '../data/vanilla-npcbestiaryoffset.json';
const BST_DRAW_OFFSET: Record<string, {
  scale?: number; portraitScale?: number; position?: number[];
  portraitX?: number; portraitY?: number; rotation?: number; frame?: number; customTexture?: string;
}> = bstDrawOffsetJson as Record<string, {
  scale?: number; portraitScale?: number; position?: number[];
  portraitX?: number; portraitY?: number; rotation?: number; frame?: number; customTexture?: string;
}>;

/** 图鉴 NPC 染色帧缓存（key = sheet|npcId|帧高——负 id 变体各自成键） */
const bstTintCache = new Map<string, HTMLCanvasElement>();
// 热补丁重烘(2026-08-19 素材重制):染色缓存键 `sheetId|…` 不含贴图身份,
// 替换 NPC sheet 后旧染色帧钉死 → 监听应用事件全清(面板重开即新,量小无压力)
if (typeof document !== 'undefined') {
  document.addEventListener('sw:remaster-applied', () => bstTintCache.clear());
}
/** base 帧 + color 二次绘制（Main.cs:24527 + NPC.GetColor 逐像素乘；XNA AlphaBlend
 *  预乘语义 = destination-out 按 colorA 削弱 base + lighter 全量加染色帧——
 *  在离屏合成完再贴回，destination-out 不挖主画布的 MapBG 底图） */
function bstTintedFrame(
  img: ImageBitmap | HTMLImageElement, sheetId: number, npcId: number, fh: number, colorRGBA: number[],
  frameIdx = 0,
): HTMLCanvasElement | null {
  const key = `${sheetId}|${npcId}|${fh}|${frameIdx}|${colorRGBA.join(',')}`;
  const hit = bstTintCache.get(key);
  if (hit) return hit;
  const w = (img as HTMLImageElement).width ?? (img as ImageBitmap).width;
  if (!w) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = fh;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  // ① base 帧（白剪影原样）
  cx.drawImage(img, 0, frameIdx * fh, w, fh, 0, 0, w, fh);
  // ② 染色帧：逐像素乘 colorRGB（alpha 保留）——同 Renderer.tintedSprite
  const t = document.createElement('canvas');
  t.width = w; t.height = fh;
  const tx = t.getContext('2d')!;
  tx.drawImage(img, 0, frameIdx * fh, w, fh, 0, 0, w, fh);
  const d = tx.getImageData(0, 0, w, fh);
  const [r, g, b] = colorRGBA;
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = (d.data[i] * r / 255) | 0;
    d.data[i + 1] = (d.data[i + 1] * g / 255) | 0;
    d.data[i + 2] = (d.data[i + 2] * b / 255) | 0;
  }
  tx.putImageData(d, 0, 0);
  // ③ 两步混合：destination-out 削 base × colorA + lighter 加染色帧
  cx.globalCompositeOperation = 'destination-out';
  cx.globalAlpha = (colorRGBA[3] ?? 255) / 255;
  cx.drawImage(img, 0, frameIdx * fh, w, fh, 0, 0, w, fh);
  cx.globalCompositeOperation = 'lighter';
  cx.globalAlpha = 1;
  cx.drawImage(t, 0, 0);
  cx.globalCompositeOperation = 'source-over';
  if (bstTintCache.size > 800) bstTintCache.clear();   // 有界（负 id 变体×色键）
  bstTintCache.set(key, c);
  return c;
}
import { npcValueOf } from '../drops/NpcDrops';
import dropData from '../data/vanilla-npcdrops.json';
import spawnData from '../data/vanilla-bestiary-spawn.json';
import { UISfx } from '../vui/UISfx';
import { isBound } from '../core/Keybinds';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import {
  bestiaryEntries, bestiaryCreditId, UnlockState,
  bestiaryRarityStars, bestiarySortingId, isBossForBestiary,
  type BestiaryEntryDef, type BestiaryTracker,
} from '../data/Bestiary';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rule = any;

// ============ 纯逻辑（Node 可单测；DOM 渲染只是其消费方） ============

/** UIBestiaryEntryGrid.GetEntriesToShow：单元 72×72（UIBestiaryEntryButton 尺寸） */
export const BST_CELL = 72;

export function bestiaryGridSize(w: number, h: number): { cols: number; rows: number; perPage: number } {
  const cols = Math.max(1, Math.floor(w / BST_CELL));
  const rows = Math.max(1, Math.floor(h / BST_CELL));
  return { cols, rows, perPage: cols * rows };
}

/** UIBestiaryEntryGrid.GetRangeText："{first}-{last} ({total})"，空集 "0-0 (0)" */
export function bestiaryRangeText(atIndex: number, last: number, perPage: number): string {
  const end = Math.min(last, atIndex + perPage);
  const first = Math.min(atIndex + 1, end);
  return `${first}-${end} (${last})`;
}

/** FixBestiaryRange：偏移钳制到 [0, max(0, last - perPage)] */
export function clampBestiaryOffset(atIndex: number, offset: number, last: number, perPage: number): number {
  const max = Math.max(0, last - perPage);
  return Math.min(Math.max(atIndex + offset, 0), max);
}

/** 分页数（探针口径：546 条 / 每页条数 → 页数） */
export function bestiaryPageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 0;
  return Math.ceil(total / perPage);
}

export type BestiarySortKey = 'unlocks' | 'id' | 'bestiaryId' | 'alpha' | 'rarity' | 'attack' | 'defense' | 'coins' | 'hp';
/** SortingSteps 注册序（UIBestiaryEntry.SortingSteps RegisterSortSteps：Unlocks → ID →
 *  BestiaryID → Alphabetical → Rarity → Attack → Defense → Coins → HitPoints） */
export const BESTIARY_SORT_KEYS: BestiarySortKey[] = ['unlocks', 'id', 'bestiaryId', 'alpha', 'rarity', 'attack', 'defense', 'coins', 'hp'];

export function sortLabel(key: BestiarySortKey): string {
  switch (key) {
    case 'unlocks': return Lang.text('BestiaryInfo.Sort_Unlocks');
    case 'id': return Lang.text('BestiaryInfo.Sort_ID');
    case 'bestiaryId': return Lang.text('BestiaryInfo.Sort_BestiaryID');
    case 'rarity': return Lang.text('BestiaryInfo.Sort_Rarity');
    case 'alpha': return Lang.text('BestiaryInfo.Sort_Alphabetical');
    case 'attack': return Lang.text('BestiaryInfo.Sort_Attack');
    case 'defense': return Lang.text('BestiaryInfo.Sort_Defense');
    case 'coins': return Lang.text('BestiaryInfo.Sort_Coins');
    case 'hp': return Lang.text('BestiaryInfo.Sort_HitPoints');
  }
}

export interface BestiaryFilter {
  search: string;
  /** 条目类别（本仓自有维度，无原版键） */
  kind: 'all' | 'enemy' | 'town' | 'critter';
  /** Filters.ByBoss（BestiaryInfo.IsBoss） */
  boss: boolean;
  /** Filters.ByUnlockState（BestiaryInfo.IfUnlocked）；'no' 为反向（本仓补充） */
  unlocked: 'all' | 'yes' | 'no';
}

export const DEFAULT_BESTIARY_FILTER: BestiaryFilter = { search: '', kind: 'all', boss: false, unlocked: 'all' };

export interface BestiaryRow {
  entry: BestiaryEntryDef;
  /** 条目代表 NPC id（图标/属性取自它；归并族取母体） */
  npcId: number;
  state: UnlockState;
  name: string;
  /** 击杀数（kill 来源 creditId 的计数；非击杀条目 0） */
  kills: number;
}

/** creditId → 母体 NPC id（BESTIARY_CREDIT_REDIRECT 归并族取未被重定向者，正 id 优先） */
let repIdCache: Map<string, number> | null = null;
export function bestiaryRepNpcId(creditId: string): number {
  if (!repIdCache) {
    repIdCache = new Map();
    const R = BESTIARY_CREDIT_REDIRECT as Record<number, number>;
    const put = (id: number) => {
      const cid = NPC_NAME_BY_ID[id] ?? String(id);
      if (!repIdCache!.has(cid)) repIdCache!.set(cid, id);
    };
    for (const key of Object.keys(NPC_NAME_BY_ID)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id === 0) continue;
      if (R[id] === undefined && id > 0) put(id);   // 母体（正 id）
    }
    for (const key of Object.keys(NPC_NAME_BY_ID)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id === 0) continue;
      if (R[id] !== undefined) put(R[id]);           // 变体族回填母体
    }
    for (const key of Object.keys(NPC_NAME_BY_ID)) {
      const id = Number(key);
      // 负 netID 变体（史莱姆配色 -1..-10 / 世吞段 -11..-13）代表自身
      if (Number.isInteger(id) && id !== 0) put(id);
    }
  }
  const fallback = Number(creditId);
  return repIdCache.get(creditId) ?? (Number.isFinite(fallback) ? fallback : 0);
}

/** BossBestiaryInfoElement 挂载集（BestiaryEntry.Enemy :37：npc.boss ∨
 *  ShouldBeCountedAsBossForBestiary → Filters.ByBoss）的 creditId 化 */
const BOSS_CREDITS = new Set(
  Object.keys(NPC_NAME_BY_ID)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id !== 0 && isBossForBestiary(id))
    .map(bestiaryCreditId),
);

export function isBossCredit(creditId: string): boolean {
  return BOSS_CREDITS.has(creditId);
}

/** 全条目行化（bestiaryEntries × tracker.unlockState × 名字解析） */
export function bestiaryRows(tracker: BestiaryTracker): BestiaryRow[] {
  const out: BestiaryRow[] = [];
  for (const entry of bestiaryEntries()) {
    let kills = 0;
    for (const s of entry.sources) {
      if (s.t === 'kill') kills = Math.max(kills, tracker.kills.get(s.credit) ?? 0);
    }
    const npcId = bestiaryRepNpcId(entry.creditId);
    const state = tracker.unlockState(entry);
    out.push({
      entry, npcId, kills, state,
      // 未解锁不显示名（原版图标 hover "???"）
      name: state > UnlockState.NotKnown ? npcDisplayName(npcId, entry.creditId) : '???',
    });
  }
  return out;
}

/** 条目显示名：正 id 走 Lang.npcName；负 netID（史莱姆/世吞段变体）Lang.npcName
 *  会取 abs 误命中他者，改按内部名直查；都缺回退 creditId */
export function npcDisplayName(npcId: number, fallback: string): string {
  if (npcId > 0) return Lang.npcName(npcId) ?? fallback;
  const internal = NPC_NAME_BY_ID[npcId];
  if (internal && Lang.has(`NPCName.${internal}`)) return Lang.text(`NPCName.${internal}`);
  return fallback;
}

/** 排序（SortingSteps 各 Compare 的数据层等价；无数据步缺省，平手按 npcId 升序） */
export function sortBestiaryRows(rows: BestiaryRow[], key: BestiarySortKey): void {
  const stat = (r: BestiaryRow, f: 'lifeMax' | 'damage' | 'defense'): number =>
    VANILLA_NPCS[String(r.npcId)]?.[f] ?? -1;
  const cmp: Record<BestiarySortKey, (a: BestiaryRow, b: BestiaryRow) => number> = {
    // ByUnlockState：解锁档降序（已解锁在前）
    unlocks: (a, b) => b.state - a.state || a.npcId - b.npcId,
    // ByNetId 升序
    id: (a, b) => a.npcId - b.npcId,
    // ByBestiaryId：ContentSamples.NpcBestiarySortingId（九键 orderby 链序号）升序
    bestiaryId: (a, b) => bestiarySortingId(a.npcId) - bestiarySortingId(b.npcId),
    // ByRarity：NpcBestiaryRarityStars 降序
    rarity: (a, b) => bestiaryRarityStars(b.npcId) - bestiaryRarityStars(a.npcId) || a.npcId - b.npcId,
    // Alphabetical：显示名升序
    alpha: (a, b) => a.name.localeCompare(b.name, 'zh') || a.npcId - b.npcId,
    // ByStat 族：降序（无数据条目沉底）
    attack: (a, b) => stat(b, 'damage') - stat(a, 'damage') || a.npcId - b.npcId,
    defense: (a, b) => stat(b, 'defense') - stat(a, 'defense') || a.npcId - b.npcId,
    coins: (a, b) => npcValueOf(b.npcId) - npcValueOf(a.npcId) || a.npcId - b.npcId,
    hp: (a, b) => stat(b, 'lifeMax') - stat(a, 'lifeMax') || a.npcId - b.npcId,
  };
  rows.sort(cmp[key]);
}

/** 筛选（Filters.BySearch/ByUnlockState/ByBoss + 本仓 kind 维度） */
export function filterBestiaryRows(rows: BestiaryRow[], f: BestiaryFilter): BestiaryRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.kind !== 'all' && r.entry.kind !== f.kind) return false;
    if (f.boss && !isBossCredit(r.entry.creditId)) return false;
    if (f.unlocked === 'yes' && r.state === UnlockState.NotKnown) return false;
    if (f.unlocked === 'no' && r.state > UnlockState.NotKnown) return false;
    // BySearch：未解锁条目不提供搜索串（原版 NamePlate 隐藏）
    if (q && (r.state === UnlockState.NotKnown || !r.name.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** chip 组合语义（2026-08-13 用户报：小动物 × 敌方Boss 可同时选中 → 矛盾组合恒空）。
 *  boss 隶属敌怪维度——与 critter/town 互斥：
 *  - 选 boss 时 kind 归一到 enemy（从 小动物/城镇 切入即自动跳敌怪）
 *  - 选 小动物/城镇 时清 boss（不存在 boss 城镇/boss 小动物）
 *  kind all/enemy 与 boss 自由组合（结果集非空：全部→boss 25 条 / 敌怪→boss 25 条） */
export function applyBestiaryChip(
  f: BestiaryFilter,
  chip: 'kind' | 'boss' | 'unlocked' | 'unlockedNo',
  kind?: BestiaryFilter['kind'],
): BestiaryFilter {
  const nf: BestiaryFilter = { ...f };
  if (chip === 'kind' && kind) {
    nf.kind = kind;
    if (kind !== 'all' && kind !== 'enemy') nf.boss = false;
  } else if (chip === 'boss') {
    nf.boss = !nf.boss;
    if (nf.boss && nf.kind !== 'all' && nf.kind !== 'enemy') nf.kind = 'enemy';
  } else if (chip === 'unlocked') {
    nf.unlocked = nf.unlocked === 'yes' ? 'all' : 'yes';
  } else {
    nf.unlocked = nf.unlocked === 'no' ? 'all' : 'no';
  }
  return nf;
}

// ============ 掉落表展平（ItemDropBestiaryInfoElement 近似） ============

export interface DropLine {
  item: number;
  /** 掉率（0-1；null = 非概率掉落如 noRepeat 池/事件掉落） */
  chance: number | null;
  min: number;
  max: number;
  /** 条件名（Bestiary.ItemDropConditions.<name> 取文案） */
  cond: string | null;
  /** 专家/大师分支标签 */
  tag: string | null;
}

const DROP_ENTRIES: Array<{ npcs?: number[]; global?: boolean; rule: Rule }> = (dropData as any).entries;
const dropRulesByNpc = new Map<number, Rule[]>();
for (const e of DROP_ENTRIES) {
  if (e.global) continue; // 全局规则不计入条目掉落表（原版按条目注册展示）
  for (const n of e.npcs ?? []) {
    let l = dropRulesByNpc.get(n);
    if (!l) dropRulesByNpc.set(n, l = []);
    l.push(e.rule);
  }
}

function pushDrop(out: DropLine[], item: number, chance: number | null, min: number, max: number, cond: string | null, tag: string | null) {
  if (!item) return;
  out.push({ item, chance: chance === null ? null : Math.min(1, chance), min, max, cond, tag });
}

function walkDrop(rule: Rule, out: DropLine[], gate: number, tag: string | null, cond: string | null): void {
  if (!rule || typeof rule !== 'object') return;
  const c = rule.cond?.name ?? cond;
  const num = rule.num ?? 1;
  switch (rule.k) {
    case 'common': case 'rerolls': case 'cond':
    case 'local': case 'perPlayer':
      pushDrop(out, rule.item, gate * (num / (rule.denom ?? 1)), rule.min ?? 1, rule.max ?? 1, c, tag);
      break;
    case 'oneOf':
      for (const id of rule.ids ?? []) pushDrop(out, id, gate * (num / (rule.denom ?? 1)), 1, 1, c, tag);
      break;
    case 'expert': // DropBasedOnExpertMode：normal/expert 双列展示
      walkDrop(rule.normal, out, gate, tag, cond);
      walkDrop(rule.expert, out, gate, 'IsExpert', cond);
      return;
    case 'master':
      walkDrop(rule.def, out, gate, tag, cond);
      walkDrop(rule.master, out, gate, 'IsMasterMode', cond);
      return;
    case 'masterExpert': // master > expert > def
      walkDrop(rule.def, out, gate, tag, cond);
      walkDrop(rule.expert, out, gate, 'IsExpert', cond);
      walkDrop(rule.master, out, gate, 'IsMasterMode', cond);
      return;
    case 'masterCommon':
      pushDrop(out, rule.item, gate, 1, 1, c, 'IsMasterMode');
      break;
    case 'masterAll':
      pushDrop(out, rule.item, gate / (rule.denom ?? 1), 1, 1, c, 'IsMasterMode');
      break;
    case 'bossBag': // 非专家分支 = DropNothing
      pushDrop(out, rule.item, gate, 1, 1, c, 'IsExpert');
      break;
    case 'oneOfRules': // OneFromRulesRule：过 1/denom 后等权取一子树
      for (const r of rule.rules ?? []) walkDrop(r, out, gate / (rule.denom ?? 1), tag, cond);
      return;
    case 'noRepeat': // 不放回抽样池：恒掉 count 件（概率由池构成）
      for (const id of rule.ids ?? []) pushDrop(out, id, null, 1, 1, c, tag);
      break;
    case 'dropOneByOne': // 四塔碎片：12-20 块（参数未数值化，见 NpcDrops.dropOneByOne）
      pushDrop(out, rule.item, gate, 12, 20, c, tag);
      break;
    case 'mechSpawn': // 三王召唤物各 1/2500
      pushDrop(out, 556, gate / 2500, 1, 1, c, tag);
      pushDrop(out, 544, gate / 2500, 1, 1, c, tag);
      pushDrop(out, 557, gate / 2500, 1, 1, c, tag);
      break;
    case 'gate': { // LeadingConditionRule：条件沿 OnSuccess 链下传
      for (const ch of rule.chain ?? []) walkDrop(ch.rule, out, gate, tag, c);
      return;
    }
    case 'nothing': case 'listRef': case 'slimeBody': case 'statueMimic':
      return;
    default:
      return; // 未知 kind 静默跳过（掉落求值运行时另有 warnOnce 兜底）
  }
  for (const ch of rule.chain ?? []) walkDrop(ch.rule, out, gate, tag, cond);
}

/** 展平某 NPC 的掉落规则树 → 展示行（去重 + 按掉率降序） */
export function flattenDropsForNpc(npcId: number): DropLine[] {
  const rules = dropRulesByNpc.get(npcId);
  if (!rules) return [];
  const out: DropLine[] = [];
  for (const r of rules) walkDrop(r, out, 1, null, null);
  const seen = new Set<string>();
  const deduped = out.filter((d) => {
    const k = `${d.item}|${d.chance}|${d.min}|${d.max}|${d.cond}|${d.tag}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  deduped.sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1) || a.item - b.item);
  return deduped;
}

export function dropRateText(chance: number): string {
  const pct = chance * 100;
  const s = pct >= 100 ? '100' : String(Math.round(pct * 100) / 100);
  return `${s}%`;
}

function dropTagText(tag: string): string {
  const key = `Bestiary.ItemDropConditions.${tag}`;
  const t = Lang.has(key) ? Lang.text(key) : '';
  return t || tag;
}
function dropCondText(cond: string): string {
  const key = `Bestiary.ItemDropConditions.${cond}`;
  const t = Lang.has(key) ? Lang.text(key) : '';
  return t; // 原版空串条件（NotExpert 等）不显示
}

// ============ 出没环境 + 风味文本 + 头像背景（BestiaryDatabaseNPCsPopulator + BestiaryEntry） ============

type SpawnJson = typeof spawnData;
/** SpawnCondition 静态声明（populator :14-302）。priority = filterIconFrame（标签图标帧，
 *  FilterProviderInfoElement :24-29）；text = DisplayTextPriority（风味回退权重）；
 *  bg/bgColor = 条目头像背景 MapBG 与着色（IBestiaryBackgroundImagePathAndColorProvider） */
interface SpawnConditionDef {
  key?: string;
  priority: number;
  text?: number;
  bg?: string;
  bgColor?: number[];
  overlay?: string;
  overlayColor?: number[];
  hideInPortrait?: boolean;
}
const SPAWN_CONDITIONS = (spawnData as unknown as SpawnJson).conditions as unknown as Record<string, SpawnConditionDef>;
/** FindEntryByNPCID(id).Info.AddRange 注册序（populator :802/:1661，×732） */
export const SPAWN_BY_NPC = (spawnData as unknown as SpawnJson).byNpc as Record<string, string[]>;
/** AddTags 头像背景偏好（populator :515-548）：单条件路径或腐化/猩红双路 */
const BG_PREFERENCE = (spawnData as unknown as SpawnJson).bgPreference as Record<
  string, Array<string | { corrupt: string; crimson: string }>
>;
/** MoonLordPortraitBackgroundProviderBestiaryInfoElement（populator :550-551） */
const MOONLORD_BG_NPC = new Set<number>(
  ((spawnData as unknown as SpawnJson).moonLordBg as number[] | undefined) ?? [],
);

export interface SpawnConditionLine { key: string; label: string; priority: number }

/** 出没环境条目（UIBestiaryEntryInfoPage 按注册序呈现；解锁门 NotKnown 之外恒显，
 *  FilterProviderInfoElement.cs:47-50）。netId 变种（-1..-13）按负 id 直查原表 */
export function bestiarySpawnConditions(npcId: number): SpawnConditionLine[] {
  const paths = SPAWN_BY_NPC[String(npcId)];
  if (!paths) return [];
  return paths.map((p) => {
    const c = SPAWN_CONDITIONS[p];
    const key = c.key ?? '';
    return { key, label: key && Lang.has(key) ? Lang.text(key) : key, priority: c.priority };
  });
}

/** 条目背景偏好路径（BestiaryPortraitBackgroundBasedOnWorldEvil 按 WorldGen.crimson 二选一） */
export function bestiaryBgPreferencePaths(npcId: number, crimson = false): string[] {
  const prefs = BG_PREFERENCE[String(npcId)];
  if (!prefs) return [];
  return prefs.map((p) => (typeof p === 'string' ? p : (crimson ? p.crimson : p.corrupt)));
}

/** 风味文本（BestiaryEntry.cs:42-47 Enemy/TownNPC/Critter 三工厂同构）：
 *  `Bestiary_FlavorText.npc_<NPCName 内部名>`（Language.Exists 门，564 键）；
 *  缺失回退 TryGivingEntryFlavorTextIfItIsMissing（populator:685-714）——头像背景
 *  偏好条件绝对优先（Info 序首个），其余取 DisplayTextPriority 最高者（并列取注册序
 *  后者），映射 `Bestiary_BiomeText.biome_<键名去类别>`。两路都无 → null */
export function bestiaryFlavorText(npcId: number, crimson = false): string | null {
  const internal = NPC_NAME_BY_ID[npcId > 0 ? npcId : -npcId];
  const key = internal ? `Bestiary_FlavorText.npc_${internal}` : '';
  if (key && Lang.has(key)) return Lang.text(key);
  const paths = SPAWN_BY_NPC[String(npcId)] ?? [];
  if (paths.length === 0) return null;
  const pref = bestiaryBgPreferencePaths(npcId, crimson);
  let bestPath: string | null = null;
  if (pref.length) {
    bestPath = paths.find((p) => pref.includes(p)) ?? null;   // Info 序首个命中即 break
  }
  if (!bestPath) {
    let bestPri = -Infinity;
    for (const p of paths) {
      const pri = SPAWN_CONDITIONS[p]?.text ?? 0;   // DisplayTextPriority 默认 0
      if (pri >= bestPri) { bestPri = pri; bestPath = p; }
    }
  }
  const cond = bestPath ? SPAWN_CONDITIONS[bestPath] : null;
  if (!cond?.key) return null;
  const fb = `Bestiary_BiomeText.biome_${cond.key.slice(cond.key.indexOf('.') + 1)}`;
  return Lang.has(fb) ? Lang.text(fb) : null;
}

// ============ 头像背景（MapBG 按出没环境推导） ============

export interface BestiaryPortraitBg {
  /** MapBG 贴图名（public/sprites/vanilla/<name>.png；无出没环境时 null） */
  image: string | null;
  /** 着色 rgba（NPCPortraitInfoElement：有图条件中最后一个带色者胜出） */
  color: [number, number, number, number];
}

/** 条目 Info 中带背景图的提供者（注册序；月总元素由 populator :551 追加在末位） */
interface BgProvider { path: string | null; bg: string; bgColor?: number[] }
function bgProviders(npcId: number): BgProvider[] {
  const out: BgProvider[] = [];
  for (const p of SPAWN_BY_NPC[String(npcId)] ?? []) {
    const c = SPAWN_CONDITIONS[p];
    if (c?.bg) out.push({ path: p, bg: c.bg, bgColor: c.bgColor });
  }
  if (MOONLORD_BG_NPC.has(npcId)) out.push({ path: null, bg: 'MapBG1', bgColor: [0, 0, 0, 255] });
  return out;
}

/** 详情页大头像背景（NPCPortraitInfoElement.cs:38-81）：偏好条件（AddTags，
 *  世界恶双路按 crimson 取一）命中则锁定其贴图；否则每轮覆写 → 注册序**最后一个**
 *  带图条件。着色 = 有图提供者中最后一个声明 bgColor 者（偏好命中后仍生效） */
export function bestiaryPortraitBackground(npcId: number, crimson = false): BestiaryPortraitBg {
  const providers = bgProviders(npcId);
  let image: string | null = null;
  let color: [number, number, number, number] = [255, 255, 255, 255];
  const pref = bestiaryBgPreferencePaths(npcId, crimson);
  const prefHit = pref.length ? providers.find((p) => p.path !== null && pref.includes(p.path)) : undefined;
  if (prefHit) image = prefHit.bg;                       // flag2：偏好锁定
  for (const p of providers) {
    if (!prefHit) image = p.bg;                          // 无偏好：末个胜出
    if (p.bgColor) color = [p.bgColor[0], p.bgColor[1], p.bgColor[2], p.bgColor[3] ?? 255];
  }
  return { image, color };
}

/** 网格条目底图（UIBestiaryEntryButton.TryGettingBackgroundImageProvider :105-127）：
 *  偏好条件优先，否则注册序**首个**带图条件（与大头像的"最后一个"不同）；无着色 */
export function bestiaryGridBackground(npcId: number, crimson = false): string | null {
  const providers = bgProviders(npcId);
  if (!providers.length) return null;
  const pref = bestiaryBgPreferencePaths(npcId, crimson);
  const hit = pref.length ? providers.find((p) => p.path !== null && pref.includes(p.path)) : undefined;
  return (hit ?? providers[0]).bg;
}

// ============ DOM 面板 ============

/** 图鉴贴图缓存(2026-08-13,用户报"滚动翻页崩溃"的核心修复):
 *  此前每个格子每次 refresh 都 new Image() 自取 NPC 表/背景图且【结果不回写】
 *  ——trackpad 滚轮风暴下同一张多帧行大表被反复解码,渲染进程压崩。本缓存:
 *  ①命中直回 ②atlas.vimages 已有的直接借 ③在途去重(并发 refresh 共享一次
 *  fetch+decode) ④onerror 负终结(404 也回调,防等待队列无限堆积) ⑤容量上限
 *  LRU 淘汰(引用即成本)。 */
const bstSheetCache = new Map<string, ImageBitmap | HTMLImageElement>();
const bstSheetPending = new Map<string, Array<(img: ImageBitmap | HTMLImageElement | null) => void>>();
/** 404 负缓存(2026-08-13 泄露 review):缺表时此前每次 refresh 都重新 fetch+
 * 解码(pending 去重只挡并发不挡串行)——登记终态,不再重发 */
const bstSheetFailed = new Set<string>();
const BST_SHEET_CACHE_MAX = 160;

function bstLoadSheet(atlas: SpriteAtlas | null, file: string, cb: (img: ImageBitmap | HTMLImageElement | null) => void): void {
  const hit = bstSheetCache.get(file);
  if (hit) { cb(hit); return; }
  const atlasHit = atlas?.vimages.get(file) ?? null;
  if (atlasHit) {
    if (bstSheetCache.size >= BST_SHEET_CACHE_MAX) bstSheetCache.delete(bstSheetCache.keys().next().value as string);
    bstSheetCache.set(file, atlasHit);
    cb(atlasHit);
    return;
  }
  if (bstSheetFailed.has(file)) { cb(null); return; }  // 已知 404:不重发
  let q = bstSheetPending.get(file);
  if (q) { q.push(cb); return; }  // 在途去重:同一张表并发只取一次
  q = [cb];
  bstSheetPending.set(file, q);
  const im = new Image();
  im.onload = () => {
    bstSheetPending.delete(file);
    if (bstSheetCache.size >= BST_SHEET_CACHE_MAX) bstSheetCache.delete(bstSheetCache.keys().next().value as string);
    // bitmap 就绪才入缓存+回调(Image 窗口期每格每帧发 LazyPixelRef,trace⑨)
    const land = (x: ImageBitmap | HTMLImageElement) => {
      if (bstSheetFailed.has(file)) return;
      if (bstSheetCache.size >= BST_SHEET_CACHE_MAX) bstSheetCache.delete(bstSheetCache.keys().next().value as string);
      bstSheetCache.set(file, x);
      for (const c of q!) c(x);
    };
    upgradeToBitmap(im, (b) => land(b), () => land(im));  // 失败回退 Image=永不缺图
    if (!USE_BITMAP) land(im);
  };
  im.onerror = () => {
    bstSheetPending.delete(file);
    bstSheetFailed.add(file);
    for (const c of q!) c(null);   // 负终结:失败也回调(画底色),队列不积压
  };
  im.src = `sprites/${file}`;
}

const CSS = `
.sw-bst { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(1040px,96vw); height:min(740px,92vh); z-index:30; cursor:auto;
  display:flex; flex-direction:column;
  background:rgba(33,43,79,0.9); border:2px solid #7d92d6; border-radius:6px;
  color:#e8ecf8; font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif;
  box-shadow:0 8px 40px rgba(0,0,0,.6); }
.sw-bst-top { display:flex; align-items:center; gap:6px; padding:8px 10px 6px; flex:none; }
.sw-bst-nav { width:30px; height:26px; flex:none; padding:0; margin:0; font-size:13px;
  background:#3a4680; color:#e8e8f4; border:1px solid #7d92d6; border-radius:4px; cursor:pointer; }
.sw-bst-nav:hover { background:#4a5aa0; }
.sw-bst-range { min-width:118px; text-align:center; background:rgb(35,40,83); color:#cfd6f2;
  border-radius:4px; padding:4px 8px; font-size:12px; flex:none; }
.sw-bst-sel, .sw-bst-search { background:#232c52; color:#e8e8f4; border:1px solid #3a4680;
  border-radius:4px; padding:4px 6px; font-family:inherit; font-size:12px; }
.sw-bst-search { width:110px; flex:none; }
.sw-bst-chips { display:flex; gap:4px; flex:1; flex-wrap:wrap; }
.sw-bst-chip { padding:4px 8px; font-size:11px; background:#232c52; border:1px solid #3a4680;
  border-radius:4px; cursor:pointer; color:#cfd6f2; font-family:inherit; }
.sw-bst-chip.active { background:#5a6ac0; color:#fff; outline:1px solid #ffd76e; }
.sw-bst-back { flex:none; padding:5px 14px; font-size:12px; }
.sw-bst-main { flex:1; display:flex; gap:8px; padding:0 10px; min-height:0; }
.sw-bst-gridwrap { flex:1; min-width:0; position:relative; overflow:hidden; }
.sw-bst-grid { display:grid; }
.sw-bst-cell { width:72px; height:72px; position:relative; flex:none;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
  cursor:pointer; background:rgba(20,25,50,0.85); border-radius:3px; }
.sw-bst-cell:hover { background:rgba(42,52,100,1); outline:1px solid #8fa0e0; }
.sw-bst-cell.sel { outline:2px solid #ffd76e; }
.sw-bst-cell canvas { width:44px; height:44px; image-rendering:pixelated; }
.sw-bst-cell.sw-bst-lock canvas { filter:brightness(0) opacity(0.55); }
.sw-bst-name { font-size:10px; line-height:1.1; max-width:68px; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; color:#cfd6f2; }
.sw-bst-cell.sw-bst-lock .sw-bst-name { color:#586088; }
.sw-bst-kills { position:absolute; right:3px; top:2px; font-size:9px; color:#ffe8a0; }
.sw-bst-empty { position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; color:#8a90b8; font-size:13px; }
.sw-bst-info { width:296px; flex:none; overflow-y:auto; background:rgba(20,25,50,0.8);
  border:1px solid #3a4680; border-radius:4px; padding:10px; font-size:12px; }
.sw-bst-info h3 { margin:0 0 4px; font-size:15px; color:#ffe8a0; font-weight:normal;
  text-shadow:1px 1px 0 #000; word-break:break-all; }
.sw-bst-tags { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px; }
.sw-bst-tag { font-size:10px; padding:1px 6px; border-radius:3px; background:#3a4680; color:#cfd6f2; }
.sw-bst-tag.boss { background:#7a3a3a; }
.sw-bst-info .row { display:flex; justify-content:space-between; gap:8px;
  padding:2px 0; border-bottom:1px solid rgba(90,106,160,0.25); }
.sw-bst-info .row span:first-child { color:#8a90b8; }
.sw-bst-info .row span:last-child { color:#e8ecf8; }
.sw-bst-sec { margin:8px 0 4px; color:#ffe8a0; font-size:12px; }
.sw-bst-drop { display:flex; align-items:center; gap:6px; padding:2px 0; }
.sw-bst-drop canvas { width:22px; height:22px; flex:none; image-rendering:pixelated; }
.sw-bst-drop .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sw-bst-drop .rt { color:#9adf9a; flex:none; }
.sw-bst-drop .cd { display:block; font-size:10px; color:#8a90b8; }
.sw-bst-bottom { display:flex; align-items:center; gap:10px; padding:6px 10px 10px; flex:none; }
.sw-bst-pct { flex:none; font-size:12px; color:#cfd6f2; }
.sw-bst-bar { flex:1; height:15px; background:rgb(35,43,81); border-radius:3px; overflow:hidden; }
.sw-bst-bar i { display:block; height:100%; background:rgb(51,137,255); }
`;

export interface BestiaryPanelFlow {
  getTracker(): BestiaryTracker;
  atlas?: SpriteAtlas | null;
  /** 世界恶取向（BestiaryPortraitBackgroundBasedOnWorldEvil：crimson=true 取猩红路） */
  isCrimson?(): boolean;
  onBack(): void;
}

export class BestiaryPanel {
  private panel: HTMLElement;
  private gridWrap!: HTMLElement;
  private gridEl!: HTMLElement;
  private rangeEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private pctEl!: HTMLElement;
  private barEl!: HTMLElement;
  private searchEl!: HTMLInputElement;
  private chipsEl!: HTMLElement;
  private ro: ResizeObserver | null = null;
  /** RO 稳定居抖定时器(close 时清,防面板关后补刷) */
  private roTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** 关闭键走键位表（Inventory 动作,与 main.ts 主链 isBound('Inventory') 同源;
   *  原版图鉴在物品栏 UI 链内,随 Inventory 键开合——重绑后跟随）。capture 阶段
   *  拦截防 main.ts 暂停键二次消费。 */
  private escHandler = (e: KeyboardEvent) => {
    if (isBound('Inventory', e.code)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.close();
    }
  };
  private filter: BestiaryFilter = { ...DEFAULT_BESTIARY_FILTER };
  private sortKey: BestiarySortKey = 'unlocks';
  private offset = 0;
  private perPage = 40;
  private working: BestiaryRow[] = [];
  private selected: BestiaryRow | null = null;
  private sortSel: HTMLSelectElement | null = null;
  /** 滚轮换页（UIBestiaryEntryGrid 同款交互）：下滚下一页/上滚上一页。
   *  passive:false + preventDefault——面板打开时吞掉滚轮防页面背后滚动。
   *  ★阈值门(2026-08-13,用户报"滚动翻两页就崩"):trackpad 惯性一滚=几十个
   *  wheel 事件,每个全量 refresh 曾致贴图解码风暴;≥40 才翻页+refresh 已 rAF 合并 */
  private wheelAcc = 0;
  private wheelHandler = (e: WheelEvent) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) < 40) return;
    const dir = this.wheelAcc > 0 ? 1 : -1;
    this.wheelAcc = 0;
    this.page(dir);
  };

  constructor(private parent: HTMLElement, private flow: BestiaryPanelFlow) {
    if (!document.getElementById('sw-bst-style')) {
      const style = document.createElement('style');
      style.id = 'sw-bst-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.panel = document.createElement('div');
    this.panel.className = 'sw-bst';
    this.panel.innerHTML = `
      <div class="sw-bst-top">
        <button class="sw-bst-nav" data-nav="-1">◀</button>
        <button class="sw-bst-nav" data-nav="1">▶</button>
        <div class="sw-bst-range">0-0 (0)</div>
        <select class="sw-bst-sel" data-sort></select>
        <div class="sw-bst-chips"></div>
        <input class="sw-bst-search" type="text" placeholder="${Lang.text('Mods.SandboxWorld.Bestiary.Search')}" data-search />
        <button class="sw-bst-nav sw-bst-back" data-close></button>
      </div>
      <div class="sw-bst-main">
        <div class="sw-bst-gridwrap"><div class="sw-bst-grid"></div><div class="sw-bst-empty" hidden></div></div>
        <div class="sw-bst-info"></div>
      </div>
      <div class="sw-bst-bottom">
        <div class="sw-bst-pct"></div>
        <div class="sw-bst-bar"><i style="width:0%"></i></div>
      </div>
    `;
    this.gridWrap = this.panel.querySelector('.sw-bst-gridwrap')!;
    this.gridEl = this.panel.querySelector('.sw-bst-grid')!;
    this.rangeEl = this.panel.querySelector('.sw-bst-range')!;
    this.infoEl = this.panel.querySelector('.sw-bst-info')!;
    this.pctEl = this.panel.querySelector('.sw-bst-pct')!;
    this.barEl = this.panel.querySelector('.sw-bst-bar i') as HTMLElement;
    this.searchEl = this.panel.querySelector('[data-search]') as HTMLInputElement;
    this.chipsEl = this.panel.querySelector('.sw-bst-chips')!;
    this.sortSel = this.panel.querySelector('[data-sort]') as HTMLSelectElement;
    this.buildSortSel();
    this.buildChips();
    this.panel.querySelector('[data-close]')!.textContent = Lang.text('UI.Back');
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.panel.querySelectorAll('[data-nav]').forEach((b) => {
      (b as HTMLElement).addEventListener('click', () => this.page(Number((b as HTMLElement).dataset.nav)));
    });
    this.gridWrap.addEventListener('wheel', this.wheelHandler, { passive: false });
    this.searchEl.addEventListener('input', () => { this.filter.search = this.searchEl.value; this.offset = 0; this.refresh(); });
    this.sortSel.addEventListener('change', () => {
      this.sortKey = (this.sortSel!.value || 'unlocks') as BestiarySortKey;
      this.offset = 0;
      this.refresh();
    });
    // capture 阶段拦截：防 main.ts 全局 Esc/E 处理器同时关暂停菜单/背包
    window.addEventListener('keydown', this.escHandler, true);
    if (typeof ResizeObserver !== 'undefined') {
      // ★resize 稳定居抖(2026-08-14,用户报"resize 后头像全消失"):拖拽窗口
      // = 每帧 RO→refresh→replaceChildren+~81 张新 canvas=画布创建风暴→GPU
      // 压力致 context 丢失(canvas 2D 内容不自动恢复)→全透明。150ms 稳定后
      // 只刷一次;rAF 合并保留给滚轮/点击等高频源
      let lastW = -1, lastH = -1;
      this.ro = new ResizeObserver(() => {
        const w = this.gridWrap.clientWidth, h = this.gridWrap.clientHeight;
        if (w === lastW && h === lastH) return;
        if (this.roTimer) clearTimeout(this.roTimer);
        this.roTimer = setTimeout(() => {
          this.roTimer = 0;
          if (w === lastW && h === lastH) return;
          lastW = w; lastH = h;
          this.refresh();
        }, 150) as unknown as ReturnType<typeof setTimeout>;
      });
      this.ro.observe(this.gridWrap);
    }
    parent.appendChild(this.panel);
    this.refresh();
    UISfx.click();
  }

  private buildSortSel() {
    if (!this.sortSel) return;
    for (const k of BESTIARY_SORT_KEYS) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = sortLabel(k);
      this.sortSel.appendChild(o);
    }
    this.sortSel.value = this.sortKey;
  }

  private chip(label: string, active: boolean, fn: () => void): HTMLElement {
    const b = document.createElement('button');
    b.className = 'sw-bst-chip' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { fn(); this.offset = 0; this.refresh(); });
    return b;
  }

  private buildChips() {
    const f = this.filter;
    const kinds: Array<BestiaryFilter['kind']> = ['all', 'enemy', 'town', 'critter'];
    const kindLabel: Record<string, string> = {
      all: Lang.text('Mods.SandboxWorld.Bestiary.FilterAll'),
      enemy: Lang.text('Mods.SandboxWorld.Bestiary.FilterEnemy'),
      town: Lang.text('Mods.SandboxWorld.Bestiary.FilterTown'),
      critter: Lang.text('Mods.SandboxWorld.Bestiary.FilterCritter'),
    };
    this.chipsEl.replaceChildren();
    for (const k of kinds) {
      this.chipsEl.appendChild(this.chip(kindLabel[k], f.kind === k, () => {
        this.filter = applyBestiaryChip(f, 'kind', k);
        this.buildChips();
      }));
    }
    this.chipsEl.appendChild(this.chip(
      Lang.text('BestiaryInfo.IsBoss'), f.boss, () => {
        this.filter = applyBestiaryChip(f, 'boss');
        this.buildChips();
      }));
    const ul = f.unlocked;
    this.chipsEl.appendChild(this.chip(
      Lang.text('BestiaryInfo.IfUnlocked'), ul === 'yes', () => {
        this.filter = applyBestiaryChip(f, 'unlocked');
        this.buildChips();
      }));
    this.chipsEl.appendChild(this.chip(
      Lang.text('Mods.SandboxWorld.Bestiary.Locked'), ul === 'no', () => {
        this.filter = applyBestiaryChip(f, 'unlockedNo');
        this.buildChips();
      }));
  }

  /** OnOpenPage → UpdateBestiaryContents（FilterEntries → SortEntries → Fill + 进度）。
   *  ★rAF 合并(2026-08-13):滚轮/RO/点击风暴每帧至多重建一次——此前每个 wheel
   *  tick 一次全量重建×每格自取解码 = 渲染进程崩溃(用户报"滚动翻两页就崩") */
  private refreshQueued = false;
  refresh() {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.refreshNow();
    });
  }

  private refreshNow() {
    const rows = bestiaryRows(this.flow.getTracker());
    sortBestiaryRows(rows, this.sortKey);
    this.working = filterBestiaryRows(rows, this.filter);
    const { cols, rows: gridRows, perPage } = bestiaryGridSize(this.gridWrap.clientWidth, this.gridWrap.clientHeight);
    this.perPage = perPage;
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 72px)`;
    this.offset = clampBestiaryOffset(this.offset, 0, this.working.length, perPage);
    this.rangeEl.textContent = bestiaryRangeText(this.offset, this.working.length, perPage);
    void gridRows;
    this.fillGrid();
    this.updateProgress();
    this.renderInfo();
    this.scheduleBlankSweep();
  }

  /** 自愈补画扫描(2026-08-14,用户报"resize 后头像全消失"):
   *  context 丢失可发生在 contextrestored 监听挂上之前的窗口期,内容丢了没人补。
   *  每次 refresh 后 400ms 扫描可见画布,空白的按原参数重画(bstLoadSheet 缓存
   *  命中=同步,开销可忽略)。兜住 resize 风暴/加载竞态一切丢失窗口 */
  private sweepTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** renderInfo 的大头像参数(sweep 补画用) */
  private infoDraw: { canvas: HTMLCanvasElement; npcId: number; st: number } | null = null;
  private scheduleBlankSweep(): void {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = 0;
      if (!this.panel.isConnected) return;
      const isBlank = (c: HTMLCanvasElement) => {
        try {
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 16) { if (d[i] > 10) return false; }
          return true;
        } catch { return false; }
      };
      // 网格:cell.dataset.credit 反查行
      for (const cell of this.gridEl.querySelectorAll('.sw-bst-cell')) {
        const canvas = cell.querySelector('canvas');
        if (!canvas || !isBlank(canvas)) continue;
        const r = this.working.find((w) => w.entry.creditId === (cell as HTMLElement).dataset.credit);
        if (r) this.drawPortrait(canvas as HTMLCanvasElement, r.npcId, 'grid', r.state > UnlockState.NotKnown);
      }
      // 大头像
      if (this.infoDraw && isBlank(this.infoDraw.canvas)) {
        this.drawPortrait(this.infoDraw.canvas, this.infoDraw.npcId, 'portrait', this.infoDraw.st > UnlockState.NotKnown);
      }
    }, 400) as unknown as ReturnType<typeof setTimeout>;
  }

  private page(dir: number) {
    const next = clampBestiaryOffset(this.offset, dir * this.perPage, this.working.length, this.perPage);
    if (next === this.offset) return;  // 边界空滚:offset 不变不重建(防滚轮风暴)
    this.offset = next;
    this.refresh();
  }

  private fillGrid() {
    this.gridEl.replaceChildren();
    const empty = this.gridWrap.querySelector('.sw-bst-empty') as HTMLElement;
    if (this.working.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const end = Math.min(this.working.length, this.offset + this.perPage);
    for (let i = this.offset; i < end; i++) {
      const r = this.working[i];
      const cell = document.createElement('div');
      cell.className = 'sw-bst-cell' + (r.state === UnlockState.NotKnown ? ' sw-bst-lock' : '');
      if (this.selected && this.selected.entry.creditId === r.entry.creditId) cell.classList.add('sel');
      cell.dataset.credit = r.entry.creditId;
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      // contextlost 韧性(2026-08-14,用户报"resize 后头像全消失"):canvas 2D
      // 内容在 context 丢失后不自动恢复,而本面板只在创建时画一次——preventDefault
      // 允许恢复,restored 时按原参数重画
      canvas.addEventListener('contextlost', (e) => e.preventDefault());
      canvas.addEventListener('contextrestored', () => {
        this.drawPortrait(canvas, r.npcId, 'grid', r.state > UnlockState.NotKnown);
      });
      cell.appendChild(canvas);
      const name = document.createElement('div');
      name.className = 'sw-bst-name';
      name.textContent = r.name;
      cell.appendChild(name);
      if (r.kills > 0 && r.state >= UnlockState.PortraitOnly) {
        const kills = document.createElement('div');
        kills.className = 'sw-bst-kills';
        kills.textContent = String(r.kills);
        cell.appendChild(kills);
      }
      cell.addEventListener('click', () => { this.selected = r; this.refresh(); });
      this.drawPortrait(canvas, r.npcId, 'grid', r.state > UnlockState.NotKnown);
      this.gridEl.appendChild(cell);
    }
  }

  /** 头像 = NPC 表首帧（UnlockableNPCEntryIcon 用整表绘制；DOM 取 frame0 缩放）。
   *  负 netID 变体（史莱姆配色 -1..-10 / 世吞段 -11..-13）无独立贴图文件，
   *  原版共用母体表 → 分别回落 NPC_1 / NPC_14。
   *  已解锁条目先铺 MapBG 出没环境底图（UIBestiaryEntryButton 网格 / NPCPortraitInfoElement
   *  详情各取一套推导），着色按原版 bgColor 乘算（multiply）。 */
  private drawPortrait(canvas: HTMLCanvasElement, npcId: number, bgMode: 'grid' | 'portrait', unlocked: boolean) {
    const sheetId = npcId > 0 ? npcId : (npcId >= -10 ? 1 : 14);
    const crimson = this.flow.isCrimson?.() ?? false;
    const bg = unlocked
      ? (bgMode === 'grid'
        ? { image: bestiaryGridBackground(npcId, crimson), color: [255, 255, 255, 255] as number[] }
        : bestiaryPortraitBackground(npcId, crimson))
      : { image: null as string | null, color: [255, 255, 255, 255] };
    const size = canvas.width;
    const paint = (img: ImageBitmap | HTMLImageElement) => {
      if (!canvas.isConnected) return;  // 上代 refresh 已销毁的画布不画(解码风暴浪费源)
      const ov = BST_DRAW_OFFSET[String(npcId)];
      // ★ frames 查【母体 sheetId】——负 netID 变体（-1..-10 史莱姆配色等）在
      //   vanilla-npcs.json 无独立条目，查 npcId 会缺帧数→整条多帧行当一帧画；
      //   CustomTexture 是单张手绘图（UnlockableNPCEntryIcon :199 原样画、无帧无染色）
      const frames = ov?.customTexture ? 1 : VANILLA_NPCS[String(sheetId)]?.frames ?? 1;
      const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width;
      const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height;
      const fh = Math.max(1, Math.floor(ih / frames));
      // 负 id 变体：netid 表 color/scale/alpha（绿史莱姆 -3=(0,220,40,100) 等）；
      // 正 id：NPC 表自身 color（16 僵尸色等个别非 default）
      const netOv = npcId < 0 ? NETID_OV[String(npcId)] : undefined;
      const colorRGBA = ov?.customTexture ? undefined   // 手绘图不染色（原版 Color.White :199）
        : netOv?.color ?? (npcId > 0 ? VANILLA_NPCS[String(npcId)]?.color : undefined);
      // scale 链（:55-58）：DrawOffset.Scale 覆盖 NPC 自身 → portrait 档 PortraitScale 再覆盖
      let scale = netOv?.scale ?? 1;
      if (ov?.scale != null) scale = ov.scale;
      if (bgMode === 'portrait' && ov?.portraitScale != null) scale = ov.portraitScale;
      const alphaBase = netOv?.alpha ?? 255;
      const frameIdx = ov?.frame ?? 0;
      const cx = canvas.getContext('2d');
      if (!cx || !iw) return;
      cx.imageSmoothingEnabled = false;
      cx.clearRect(0, 0, canvas.width, canvas.height);
      // 原版图鉴（UnlockableNPCEntryIcon → DrawNPCDirect）按 NPC 原生帧尺寸×scale
      // 直接画、不放大填框（僵尸帧 36×56 就是比绿史莱姆 40×48×0.9 高；巨怪靠
      // NPCBestiaryDrawOffset 表逐个调）。只缩不放：超画布才等比缩（防溢出）
      const s = Math.min(1, size / (iw * scale), size / (fh * scale));
      const w = iw * s * scale, h = fh * s * scale;
      let dx = (size - w) / 2, dy = (size - h) / 2;
      // Position 偏移（原版 72px iconbox 口径，按画布比例换算；portrait 档 X/Y Override
      // 覆盖对应分量 :66-72——Boss 巨怪下移出框/贴边修正靠它）
      if (ov?.position || ov?.portraitX != null || ov?.portraitY != null) {
        const k = size / 72;
        const px = bgMode === 'portrait' && ov?.portraitX != null ? ov.portraitX : (ov?.position?.[0] ?? 0);
        const py = bgMode === 'portrait' && ov?.portraitY != null ? ov.portraitY : (ov?.position?.[1] ?? 0);
        dx += px * k; dy += py * k;
        dx = Math.max(-w * 0.45, Math.min(size - w * 0.55, dx));   // 防整图移出画布
        dy = Math.max(-h * 0.45, Math.min(size - h * 0.55, dy));
      }
      cx.globalAlpha = alphaBase / 255;                // 负 id alpha 变体（-5 黑史莱姆 120）
      const composed = colorRGBA && (colorRGBA[3] ?? 255) > 0
        ? bstTintedFrame(img, sheetId, npcId, fh, colorRGBA, frameIdx)
        : null;
      if (ov?.rotation) {
        cx.save();
        cx.translate(dx + w / 2, dy + h / 2);
        cx.rotate(ov.rotation);
        if (composed) cx.drawImage(composed, -w / 2, -h / 2, w, h);
        else cx.drawImage(img, 0, frameIdx * fh, iw, fh, -w / 2, -h / 2, w, h);
        cx.restore();
      } else if (composed) cx.drawImage(composed, dx, dy, w, h);   // base+染色离屏合成
      else cx.drawImage(img, 0, frameIdx * fh, iw, fh, dx, dy, w, h);
      cx.globalAlpha = 1;
    };
    const atlas = this.flow.atlas ?? null;
    // 统一走 bstLoadSheet 缓存(同表并发只取一次/结果回写/失败负终结;
    // 此前 loadBg 每格每次 refresh new Image 且不回写=滚轮风暴解码源)
    const paintWithBg = (bgImg: ImageBitmap | HTMLImageElement | null) => {
      const cx = canvas.getContext('2d');
      if (!cx) return;
      cx.imageSmoothingEnabled = false;
      cx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgImg) {
        const bs = Math.max(size / bgImg.width, size / bgImg.height);
        const bw = bgImg.width * bs, bh = bgImg.height * bs;
        cx.drawImage(bgImg, (size - bw) / 2, (size - bh) / 2, bw, bh);
        const [r, g, b, a] = bg.color;
        if (r !== 255 || g !== 255 || b !== 255) {
          cx.globalCompositeOperation = 'multiply';
          cx.fillStyle = `rgb(${r},${g},${b})`;
          cx.fillRect(0, 0, size, size);
          cx.globalCompositeOperation = 'source-over';
          void a;
        }
      }
    };
    // 贴图源：CustomTexturePath 手绘图（Images/UI/Bestiary/NPCs/* 扁平化 basename）
    // 替换母体表（UnlockableNPCEntryIcon :74-81/:199——原样画、无帧无染色）
    const ovTex = BST_DRAW_OFFSET[String(npcId)]?.customTexture;
    const texPath = ovTex ? `vanilla/${ovTex}.png` : `vanilla/NPC_${sheetId}.png`;
    if (bg.image) {
      bstLoadSheet(atlas, `vanilla/${bg.image}.png`, (bgImg) => {
        if (!canvas.isConnected || !bgImg) return;
        paintWithBg(bgImg);
        // NPC 表到位后叠画（晚到重绘底图再叠;统一走缓存=同表并发只解码一次）
        bstLoadSheet(atlas, texPath, (img) => {
          if (!img || !canvas.isConnected) return;
          paintWithBg(bgImg); paint(img);
        });
      });
      return;
    }
    bstLoadSheet(atlas, texPath, (img) => {
      if (img) paint(img);
    });
  }

  /** 掉落行物品小图标（atlas.vicon 懒载未就绪时仅文字） */
  private itemIcon(itemId: number): HTMLCanvasElement | null {
    const atlas = this.flow.atlas ?? null;
    if (!atlas) return null;
    const ar = atlas.vicon(itemId);
    if (!ar) return null;
    const c = document.createElement('canvas');
    c.width = 22; c.height = 22;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    const s = Math.min(22 / ar.sw, 22 / ar.sh);
    const w = ar.sw * s, h = ar.sh * s;
    cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, (22 - w) / 2, (22 - h) / 2, w, h);
    return c;
  }

  private updateProgress() {
    const c = this.flow.getTracker().completion();
    const pct = Math.round(c.percent * 10000) / 100;
    const txt = Lang.text('BestiaryInfo.PercentCollected').replace('{Percent}', `${pct}%`);
    this.pctEl.textContent = txt;
    this.pctEl.title = `${c.unlocked}/${c.total}`;
    this.barEl.style.width = `${c.percent * 100}%`;
  }

  /** 右侧详情栏（UIBestiaryEntryInfoPage.FillInfoForEntry；未选时空白态） */
  private renderInfo() {
    const r = this.selected;
    if (!r) {
      this.infoEl.replaceChildren();
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8a90b8;text-align:center;margin-top:24px;';
      hint.textContent = Lang.text('Mods.SandboxWorld.Bestiary.ClickHint');
      this.infoEl.appendChild(hint);
      return;
    }
    const st = r.state;
    this.infoEl.replaceChildren();
    const h3 = document.createElement('h3');
    h3.textContent = st > UnlockState.NotKnown ? r.name : '???';
    this.infoEl.appendChild(h3);
    const tags = document.createElement('div');
    tags.className = 'sw-bst-tags';
    const mkTag = (label: string, boss = false) => {
      const t = document.createElement('span');
      t.className = 'sw-bst-tag' + (boss ? ' boss' : '');
      t.textContent = label;
      tags.appendChild(t);
    };
    mkTag(st > UnlockState.NotKnown ? Lang.text('BestiaryInfo.IfUnlocked') : Lang.text('Mods.SandboxWorld.Bestiary.Locked'));
    if (isBossCredit(r.entry.creditId)) mkTag(Lang.text('BestiaryInfo.IsBoss'), true);
    if (r.entry.kind === 'critter') mkTag(Lang.text('Mods.SandboxWorld.Bestiary.FilterCritter'));
    if (r.entry.goldGate) mkTag(Lang.text('Mods.SandboxWorld.Bestiary.GoldCritter'));
    this.infoEl.appendChild(tags);
    // 出没环境（SpawnConditionBestiaryInfoElement 族，populator :802/:1661 注册序；
    // 解锁门 = 非 NotKnown，FilterProviderInfoElement.cs:47-50——比属性更早可见）
    if (st > UnlockState.NotKnown) {
      const conds = bestiarySpawnConditions(r.npcId);
      if (conds.length) {
        const sec = document.createElement('div');
        sec.className = 'sw-bst-sec';
        sec.textContent = Lang.text('Mods.SandboxWorld.Bestiary.Environment'); // 原版信息页分区无独立 lang 键（与"掉落"同处理）
        this.infoEl.appendChild(sec);
        const wrap = document.createElement('div');
        wrap.className = 'sw-bst-tags';
        for (const c of conds) {
          const t = document.createElement('span');
          t.className = 'sw-bst-tag';
          t.textContent = c.label;
          wrap.appendChild(t);
        }
        this.infoEl.appendChild(wrap);
      }
    }
    // 大头像(NotKnown = 原版黑影语义:brightness 0 opacity 0.55)
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    canvas.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;display:block;margin:0 auto 6px;';
    if (st === UnlockState.NotKnown) canvas.style.filter = 'brightness(0) opacity(0.55)';
    canvas.addEventListener('contextlost', (e) => e.preventDefault());
    canvas.addEventListener('contextrestored', () => {
      this.drawPortrait(canvas, r.npcId, 'portrait', st > UnlockState.NotKnown);
    });
    this.infoDraw = { canvas, npcId: r.npcId, st };
    this.infoEl.appendChild(canvas);
    this.drawPortrait(canvas, r.npcId, 'portrait', st > UnlockState.NotKnown);
    // 击杀数（NPCKillCounterInfoElement）
    if (r.kills > 0 && st >= UnlockState.PortraitOnly) {
      const row = this.infoRow(Lang.text('BestiaryInfo.Slain'), String(r.kills));
      this.infoEl.appendChild(row);
    }
    // 风味文本（FlavorTextBestiaryInfoElement：解锁 ≥ Stats 才呈现，:21-24）：
    // `Bestiary_FlavorText.npc_<名>` 直取，缺失回退最高优先出没环境的 biome 文本
    if (st >= UnlockState.Stats) {
      const flavor = bestiaryFlavorText(r.npcId, this.flow.isCrimson?.() ?? false);
      if (flavor) {
        const p = document.createElement('p');
        p.style.cssText = 'margin:6px 0 2px;font-size:11px;line-height:1.5;color:#cfd6f2;'
          + 'background:rgba(43,56,101,0.55);border-radius:4px;padding:6px;';
        p.textContent = flavor;
        this.infoEl.appendChild(p);
      }
    }
    // 属性（NPCStatsReportInfoElement：UnlockState ≥ Stats 才可见）
    if (st >= UnlockState.Stats) {
      // 稀有度星（ContentSamples.NpcBestiaryRarityStars：0-5；原版以星形图标列呈现，
      // 此处以文本星近似并按星数着色 1-5 灰→金）
      const stars = bestiaryRarityStars(r.npcId);
      if (stars > 0) {
        const starRow = this.infoRow(Lang.text('Mods.SandboxWorld.Bestiary.Rarity'), '★'.repeat(stars));
        starRow.style.color = stars >= 4 ? '#e8c05a' : stars >= 2 ? '#b8c0d8' : '#8a90b8';
        this.infoEl.appendChild(starRow);
      }
      const v = VANILLA_NPCS[String(r.npcId)];
      if (v) {
        this.infoEl.appendChild(this.infoRow(Lang.text('BestiaryInfo.Life'), String(v.lifeMax)));
        this.infoEl.appendChild(this.infoRow(Lang.text('BestiaryInfo.Attack'), String(v.damage)));
        this.infoEl.appendChild(this.infoRow(Lang.text('BestiaryInfo.Defense'), String(v.defense)));
        const kb = Math.round(v.knockBackResist * 100);
        this.infoEl.appendChild(this.infoRow(Lang.text('BestiaryInfo.Knockback'), `${kb}%`));
      }
    }
    // 掉落表（ItemDropBestiaryInfoElement：≥ DropsNoRates 列表，≥ DropsWithRates 带掉率）
    if (st >= UnlockState.DropsNoRates) {
      const sec = document.createElement('div');
      sec.className = 'sw-bst-sec';
      sec.textContent = Lang.text('Mods.SandboxWorld.Bestiary.Drops');
      this.infoEl.appendChild(sec);
      const drops = flattenDropsForNpc(r.npcId);
      if (drops.length === 0) {
        const none = document.createElement('div');
        none.style.cssText = 'color:#8a90b8;';
        none.textContent = Lang.text('Mods.SandboxWorld.Bestiary.NoDrops');
        this.infoEl.appendChild(none);
      }
      const shown = drops.slice(0, 30);
      for (const d of shown) {
        const line = document.createElement('div');
        line.className = 'sw-bst-drop';
        const icon = this.itemIcon(d.item);
        if (icon) line.appendChild(icon);
        const nm = document.createElement('span');
        nm.className = 'nm';
        const iname = Lang.itemName(d.item) ?? String(d.item);
        nm.textContent = iname + (d.min !== d.max ? ` ×${d.min}-${d.max}` : d.min > 1 ? ` ×${d.min}` : '');
        const notes = [d.cond ? dropCondText(d.cond) : '', d.tag ? dropTagText(d.tag) : ''].filter(Boolean);
        if (notes.length) {
          const cd = document.createElement('span');
          cd.className = 'cd';
          cd.textContent = notes.join(' · ');
          nm.appendChild(cd);
        }
        line.appendChild(nm);
        if (st >= UnlockState.DropsWithRates && d.chance !== null) {
          const rt = document.createElement('span');
          rt.className = 'rt';
          rt.textContent = dropRateText(d.chance);
          line.appendChild(rt);
        }
        this.infoEl.appendChild(line);
      }
      if (drops.length > shown.length) {
        const more = document.createElement('div');
        more.style.cssText = 'color:#8a90b8;';
        more.textContent = Lang.text('Mods.SandboxWorld.Bestiary.MoreDrops', drops.length - shown.length);
        this.infoEl.appendChild(more);
      }
    } else if (st === UnlockState.PortraitOnly) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8a90b8;margin-top:8px;';
      hint.textContent = r.entry.kind === 'town'
        ? Lang.text('Mods.SandboxWorld.Bestiary.TalkToRecordMore')
        : Lang.text('Mods.SandboxWorld.Bestiary.KillToRecordMore');
      this.infoEl.appendChild(hint);
    } else {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8a90b8;margin-top:8px;';
      hint.textContent = r.entry.kind === 'town'
        ? Lang.text('Mods.SandboxWorld.Bestiary.TalkToRecord')
        : r.entry.kind === 'critter' ? Lang.text('Mods.SandboxWorld.Bestiary.DiscoverToRecord') : Lang.text('Mods.SandboxWorld.Bestiary.DefeatToRecord');
      this.infoEl.appendChild(hint);
    }
  }

  private infoRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const a = document.createElement('span');
    a.textContent = label;
    const b = document.createElement('span');
    b.textContent = value;
    row.append(a, b);
    return row;
  }

  close() {
    window.removeEventListener('keydown', this.escHandler, true);
    this.gridWrap?.removeEventListener('wheel', this.wheelHandler);
    if (this.roTimer) { clearTimeout(this.roTimer); this.roTimer = 0; }
    this.ro?.disconnect();
    this.ro = null;
    this.selected = null;
    this.panel.remove();
    this.flow.onBack();
  }
}
