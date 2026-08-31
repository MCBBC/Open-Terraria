// 掉落扫描帧上下文（腐化地掉落潮性能修复，2026-08-31 trace 定罪）：
// 病灶链 = ItemDrop.fixedUpdate 内两个 per-drop 访问（get grabRangeBonus +
// canAcceptItemIntoInventory）各自触发 Player.equipStats 的【内容键全量重建】
// （O(甲 20+染 10+可视段+两遍背包扫+buffs 键迭代)）。Trace 实测（index-BvvpFLH8,
// 28.2s/282k 样本）：equipStatsKey 自耗时 32.13% + get equipStats 22.28% = **54.4%
// 主线程时间**；inclusive 归因 grabRangeBonus 占热点 63.6%、canAccept 31.1%。
// 腐化之地/Boss 战掉落潮把 N(掉落物)×120fps×O(键) 乘到破帧预算。
//
// 一帧内恒定性论证（快照严格等价于逐次计算）：
//   · grab/heart/star 三项的输入域 = armor/dye/配饰可视位/extraAccessory/gummy/
//     太阳烧灼态/夜相位/buffs 键集合（equipStatsKey 输入清单）＋ buffs.has(Heartreach)
//     ——世界掉落的拾取写面只进 inv.slots 与 hp/mana，不触及上述任何一项；
//   · buff 时长衰减、panicTime 衰减发生在玩家自己的 fixedUpdate 段（drops 桶之外，
//     桶序 enemies→drops）；
//   · 故「enter drops 桶前一次快照」与「每物逐次读」在一切可达状态下逐值相同。
// 快照缺席（单测/探针直调 ItemDrop.fixedUpdate 不经 Entities.update）＝消费端回退
// 旧的逐次计算路径，行为不变。

export interface DropScanCtx {
  /** 原 get grabRangeBonus（getItemGrabRangeBonus(-1)：treasureMagnet 全类聚合） */
  grab: number;
  /** 原 get heartGrabBonus（buff105 Heartreach→250/0） */
  heart: number;
  /** 原 get manaMagnetBonus（equipStats.manaMagnet→300/0） */
  star: number;
  /** 原 equipStats.preventAllItemPickups（4346 拖累石机械族三路聚合位） */
  preventAll: boolean;
}

const scanByHost = new WeakMap<object, DropScanCtx>();

/** 只应由 Entities.update 在步进 drops 桶前调用（每帧至多一次）。
 *  这三次访问即整帧对 equipStats 记忆化链的全部读取。 */
export function beginDropScanCtx(host: unknown): void {
  if (!host || typeof host !== 'object') return;
  const h = host as {
    grabRangeBonus?: number;
    heartGrabBonus?: number;
    manaMagnetBonus?: number;
    equipStats?: { preventAllItemPickups?: boolean };
  };
  scanByHost.set(h as object, {
    grab: h.grabRangeBonus ?? 0,
    heart: h.heartGrabBonus ?? 0,
    star: h.manaMagnetBonus ?? 0,
    preventAll: !!h.equipStats?.preventAllItemPickups,
  });
}

export function getDropScanCtx(host: unknown): DropScanCtx | null {
  if (!host || typeof host !== 'object') return null;
  return scanByHost.get(host as object) ?? null;
}
