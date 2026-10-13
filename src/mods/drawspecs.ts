// mod 绘制声明面(★刀2-C1,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀2 节)。
// 纯声明表(AI/绘制代码钩=C2 另批):①NPC 帧率(→vanillaFrameIdx 顶部早退,
// 缺省 6t=既有通用档)②NPC glowmask(→drawNpcGlow 查表,贴图 vanilla/NPC_Glow_<id>.png
// alias,与本体同布局帧表)③NPC fullbright(→npcWhiteLiftQueue 捕获 ga=1 全亮复绘)
// ④mod 物品 glowmask(→drawDrop 捕获;贴图 alias 到 vanilla/Glow_<伪 GlowMaskID>.png,
// 1000+vid-30000=原版 379 张 GlowMask 空间外;collectDropItemGlow 查表直通)。
// 弹幕三字段(additive/fullbright/overPlayers)住 ModProjSpec(hooks.ts)——spec 原样
// 入 Map,消费=ModProj.draw/Renderer 分派位直读,不落本表。
// 零注册恒等:全查表 miss→原链。

/** vid(stableId) → 声明帧率(t/帧;缺省 6) */
const npcFrameRate = new Map<number, number>();
/** vid → NPC glowmask 贴图(alias 键) */
const npcGlow = new Map<number, string>();
/** vid → NPC fullbright */
const npcFullbright = new Set<number>();
/** vid → 物品 glowmask 伪 GlowMaskID(1000+vid-30000;贴图经 alias 进 Glow_ 空间) */
const itemGlowMask = new Map<number, number>();

export function registerModNpcDrawSpec(
  vid: number, spec: { frameRate?: number; glowTex?: string; fullbright?: boolean },
): void {
  if (spec.frameRate !== undefined) {
    if (!(spec.frameRate >= 1) || !Number.isFinite(spec.frameRate)) {
      throw new Error(`[mod-draw] frameRate 须 ≥1: ${spec.frameRate}(vid ${vid})`);
    }
    npcFrameRate.set(vid, spec.frameRate);
  }
  if (spec.glowTex !== undefined) npcGlow.set(vid, spec.glowTex);
  if (spec.fullbright) npcFullbright.add(vid);
}

export function modNpcFrameRateOf(vid: number): number | null {
  return npcFrameRate.get(vid) ?? null;
}

export function modNpcGlowSpecOf(vid: number): { tex: string } | null {
  const tex = npcGlow.get(vid);
  return tex ? { tex } : null;
}

export function modNpcFullbright(vid: number): boolean {
  return npcFullbright.has(vid);
}

/** 物品 glowmask 伪 id 段(原版 GlowMask 实用 379 张;1000+=mod 域零碰撞) */
export const MOD_ITEM_GLOWMASK_BASE = 1000;
export function modItemGlowMaskId(vid: number): number {
  return MOD_ITEM_GLOWMASK_BASE + (vid - 30000);
}

export function registerModItemGlowmask(vid: number): number {
  const gm = modItemGlowMaskId(vid);
  if (!(vid >= 30000)) throw new Error(`[mod-draw] glowmask vid 须 ≥30000: ${vid}`);
  itemGlowMask.set(vid, gm);
  return gm;
}

export function modItemGlowMaskIdOf(vid: number): number | undefined {
  return itemGlowMask.get(vid);
}

/** glowmask 伪 id 反查(assets aliasJob 用:vid=1000+(vid-30000) 还原) */
export function modItemGlowMaskVidOf(gm: number): number | undefined {
  if (gm < MOD_ITEM_GLOWMASK_BASE) return undefined;
  const vid = 30000 + (gm - MOD_ITEM_GLOWMASK_BASE);
  return itemGlowMask.has(vid) ? vid : undefined;
}

export function _resetModDrawSpecsForTests(): void {
  npcFrameRate.clear();
  npcGlow.clear();
  npcFullbright.clear();
  itemGlowMask.clear();
}
