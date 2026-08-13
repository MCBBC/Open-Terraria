// 旗帜系统（Terraria.GameContent/BannerSystem.cs + ItemID.Sets 1:1）
// 数据 = tools/extract-banners.mjs 提取（NPCtoBanner 447 怪 / BannerToItem 特例+级联区间 /
// KillsToBanner 门槛表,默认 50）。击杀计数→达标公告+授予;屏内旗 tile 91 解码→
// bannerId→npc 集（buff 乘区在 Game/Enemy 消费）。
import bannersJson from '../data/vanilla-banners.json';
import { TILE } from '../core/constants';

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
 * 屏内旗扫描（SceneMetrics.cs:420-443 解码 1:1,tile 91 恒 <311 故 311/312 修正不触发）：
 * bannerId = frameX/18 − 21 +（frameY 每降一行 +111）。返回 npcId 集（buff 消费侧用）。
 */
export function scanBannerNpcs(
  store: import('./TileStore').TileStore,
  x0: number, y0: number, x1: number, y1: number,
): Set<number> {
  const npcs = new Set<number>();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (!store.isActive(x, y)) continue;
      const i = store.idx(x, y);
      // 旗 tile sheet=91（place_v_91_banners）
      if (store.type[i] !== 91) continue;
      let banner = store.frameX[i] / 18 - 21;
      for (let fy = store.frameY[i]; fy >= 54; fy -= 54) banner += 90 + 21;
      banner = Math.floor(banner);
      const set = BANNER_TO_NPCS.get(banner);
      if (set) for (const n of set) npcs.add(n);
    }
  }
  return npcs;
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
