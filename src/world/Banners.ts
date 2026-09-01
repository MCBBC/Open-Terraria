// 旗帜系统（Terraria.GameContent/BannerSystem.cs + ItemID.Sets 1:1）
// 数据 = tools/extract-banners.mjs 提取（NPCtoBanner 447 怪 / BannerToItem 特例+级联区间 /
// KillsToBanner 门槛表,默认 50）。击杀计数→达标公告+授予;屏内旗 tile 91 解码→
// bannerId→npc 集（buff 乘区在 Game/Enemy 消费）。
import bannersJson from '../data/vanilla-banners.json';
import { TILE } from '../core/constants';
import { TILE_BY_KEY } from '../data/tiles';

const D = bannersJson as unknown as {
  npcToBanner: Record<string, number>;
  bannerToItem: Record<string, number>;
  bannerRanges: Array<{ gt: boolean; min: number; base: number; off: number }>;
  killsToBanner: Record<string, number>;
};

export const NPC_TO_BANNER = D.npcToBanner;
/** banner→npcs 反查（一次性反转） */
const BANNER_TO_NPCS = (() => {
  const m = new Map<number, Set<number>>();
  for (const [npcS, banner] of Object.entries(D.npcToBanner)) {
    const npc = +npcS;
    let s = m.get(banner);
    if (!s) { s = new Set(); m.set(banner, s); }
    s.add(npc);
  }
  return m;
})();

/** 物品 → 旗帜对应 NPC id（tooltip 显示名注入用;非旗帜物品 -1）。
 *  itemToBanner 满表在 ItemID.Sets（Main.cs 同源）——此处由 npcToBanner 全表
 *  反查构建（一次性,290 条）;bannerToItem 仅 6 条显式项（多 banner 共享 item 的
 *  特例,反查自然覆盖）。 */
const ITEM_TO_NPC: Map<number, number> = (() => {
  const m = new Map<number, number>();
  for (const [npc, banner] of Object.entries(NPC_TO_BANNER)) {
    const item = bannerItemId(Number(banner));
    if (item > 0 && !m.has(item)) m.set(item, Number(npc));
  }
  // 共享 item 的家族取最小 npc id（如 104 族共用一旗——名取家族首位）
  return m;
})();

export function bannerNpcOfItem(itemId: number): number {
  return ITEM_TO_NPC.get(itemId) ?? -1;
}

export function bannerOfNpc(npcId: number): number {
  return D.npcToBanner[String(npcId)] ?? D.npcToBanner[npcId] ?? 0;
}

/** BannerToItem（:282-362 特例+级联;末段无条件 1615+banner-1 兜底 1..87） */
export function bannerItemId(banner: number): number {
  const special = D.bannerToItem[String(banner)] ?? D.bannerToItem[banner];
  if (special !== undefined) return special;
  for (const r of D.bannerRanges) {
    if (r.gt ? banner > r.min : banner >= r.min) return r.base + banner - r.off;
  }
  return 0;
}

/** ItemID.Sets.KillsToBanner（默认 50,DD2 族 10/100/1000 等 43 特例） */
export function killsNeededForBanner(itemId: number): number {
  return D.killsToBanner[String(itemId)] ?? D.killsToBanner[itemId] ?? D.killsToBanner['*'] ?? 50;
}

/**
 * 击杀记账（BannerSystem.AddNPCKillBy :193-216 语义简化版——原版 claimable+UI 领取,
 * 本仓达标即返 true 由调用方公告+掉旗）。返回 true = 恰跨过整数倍门槛（应授予一面旗）。
 */
export function recordBannerKill(kills: Record<number, number>, npcId: number): boolean {
  const banner = bannerOfNpc(npcId);
  if (banner <= 0) return false;
  kills[banner] = (kills[banner] ?? 0) + 1;
  const itemId = bannerItemId(banner);
  const need = killsNeededForBanner(itemId);
  return need > 0 && kills[banner] % need === 0;
}

/**
 * 屏内旗扫描（SceneMetrics.cs:419-447 解码 1:1）：
 *   num = frameX/18 + frameY 每降一行 +111（旗 sheet 横排 111 列/带换行）；
 *   跳过 = (frameX<396 && frameY<54)（首带前 22 列=非敌旗区）|| num==311 || num==312
 *   （原版空帧占位样式）；banner = frameX/18 − 21 + 行×111，num≥311 再 −1、≥312 再 −1
 *   （311/312 两格被抽掉后的整体前移校正）。
 * ★tile id：原版比较 tile.type==91（原版 id 空间）；本仓内部 id 空间下旗
 *   v_91_banners 的内部 id 是动态注册序（当前=164；字面量 91 实为
 *   v_189_cloud_block）——曾写字面量 91 → `_bannerNpcs` 恒空集，受击减伤/
 *   敌怪增伤/敌弹增伤三条旗 buff 链全族静默失效（R21-7.5）。故必须经
 *   TILE_BY_KEY 反查内部 id，禁止钉死数字。
 * 返回 npcId 集（buff 消费侧用）。
 */
export function scanBannerNpcs(
  store: import('./TileStore').TileStore,
  x0: number, y0: number, x1: number, y1: number,
): Set<number> {
  const npcs = new Set<number>();
  const bannerTileId = TILE_BY_KEY['v_91_banners'];
  if (bannerTileId === undefined) return npcs;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (!store.isActive(x, y)) continue;
      const i = store.idx(x, y);
      if (store.type[i] !== bannerTileId) continue;
      const fx = Math.floor(store.frameX[i] / 18), fyRaw = store.frameY[i];
      let rows = 0;
      for (let fy = fyRaw; fy >= 54; fy -= 54) rows++;
      const num = fx + rows * 111;
      // 首带前 22 列（fx<396）且首行 = 特殊旗区非敌旗；311/312 = 原版空帧跳过
      if ((store.frameX[i] < 396 && fyRaw < 54) || num === 311 || num === 312) continue;
      let banner = fx - 21 + rows * 111;
      if (num >= 311) banner--;
      if (num >= 312) banner--;
      const set = BANNER_TO_NPCS.get(banner);
      if (set) for (const n of set) npcs.add(n);
    }
  }
  return npcs;
}

/** 屏内旗的【代表 NPC】集（旗 buff tooltip 名单用，Main.cs:21558-21612
 *  bannerMouseOver 1:1：循环按 BannerSystem 旗种枚举，每面旗经 BannerToNPC(i)
 *  取一个代表 NPC 名 = 一旗一行。同种多面旗去重（Set）；多 NPC 旗（僵尸旗覆盖
 *  全僵尸族变体）只出一行代表名，不逐变体罗列——2026-09-01 用户实报名单重复根因。
 *  代表取该旗 NPC 集最小 id（原版注册序 ≈ id 升序的确定性等价物） */
export function scanBannerReps(
  store: import('./TileStore').TileStore,
  x0: number, y0: number, x1: number, y1: number,
): Set<number> {
  const reps = new Set<number>();
  const bannerTileId = TILE_BY_KEY['v_91_banners'];
  if (bannerTileId === undefined) return reps;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (!store.isActive(x, y)) continue;
      const i = store.idx(x, y);
      if (store.type[i] !== bannerTileId) continue;
      const fx = Math.floor(store.frameX[i] / 18), fyRaw = store.frameY[i];
      let rows = 0;
      for (let fy = fyRaw; fy >= 54; fy -= 54) rows++;
      const num = fx + rows * 111;
      if ((store.frameX[i] < 396 && fyRaw < 54) || num === 311 || num === 312) continue;
      let banner = fx - 21 + rows * 111;
      if (num >= 311) banner--;
      if (num >= 312) banner--;
      const set = BANNER_TO_NPCS.get(banner);
      if (set) {
        let min = Infinity;
        for (const n of set) if (n < min) min = n;
        reps.add(min);
      }
    }
  }
  return reps;
}

/** 旗 buff 乘区（ItemID.Sets.BannerStrength:普通族 1.0 → 伤 ×1.5/受伤 ×0.75,
 *  专家 ×2/×0.5;DD2 族(itemId 3837-3846)0.2 档 → ×1.1/×0.917,专家 ×1.2/×0.833
 *  ——2026-08-13 区分,itemId 参数=旗的对应物品 id） */
const DD2_BANNER_ITEMS = new Set([3837, 3838, 3839, 3840, 3841, 3842, 3843, 3844, 3845, 3846]);
export function bannerDamageMult(expert: boolean, itemId = 0): number {
  const dd2 = DD2_BANNER_ITEMS.has(itemId);
  if (dd2) return expert ? 1.2 : 1.1;
  return expert ? 2 : 1.5;
}
export function bannerReceivedMult(expert: boolean, itemId = 0): number {
  const dd2 = DD2_BANNER_ITEMS.has(itemId);
  if (dd2) return expert ? 0.833 : 0.917;
  return expert ? 0.5 : 0.75;
}
