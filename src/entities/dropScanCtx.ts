// 掉落扫描帧上下文（腐化地掉落潮性能修复，2026-08-31 trace 定罪）：
// 病灶链 = ItemDrop.fixedUpdate 内两个 per-drop 访问（get grabRangeBonus +
// canAcceptItemIntoInventory）各自触发 Player.equipStats 的【内容键全量重建】
// （O(甲 20+染 10+可视段+两遍背包扫+buffs 键迭代)）。Trace 实测（index-BvvpFLH8,
// 28.2s/282k 样本）：equipStatsKey 自耗时 32.13% + get equipStats 22.28% = **54.4%
// 主线程时间**；inclusive 归因 grabRangeBonus 占热点 63.6%、canAccept 31.1%。
// 腐化之地/Boss 战掉落潮把 N(掉落物)×120fps×O(键) 乘到破帧预算。
//
// 一帧内恒定性论证（快照严格等价于逐次计算）：
//   · 拾取半径各旗的输入域 = armor/dye/配饰可视位/extraAccessory/gummy/
//     太阳烧灼态/夜相位/buffs 键集合（equipStatsKey 输入清单）＋ buffs.has(Heartreach)
//     ——世界掉落的拾取写面只进 inv.slots 与 hp/mana，不触及上述任何一项；
//   · buff 时长衰减、panicTime 衰减发生在玩家自己的 fixedUpdate 段（drops 桶之外，
//     桶序 enemies→drops）；
//   · 故「enter drops 桶前一次快照」与「每物逐次读」在一切可达状态下逐值相同。
// 快照缺席（单测/探针直调 ItemDrop.fixedUpdate 不经 Entities.update）＝消费端回退
// 旧的逐次计算路径，行为不变。
//
// ★终零波·GRAB_RANGE 逐 vid 化（2026-09-01）：快照从「三项数值」升级为「四旗输入」，
//   消费端经 grabRangeBonusFor(ctx, vid) 重建 Player.GetItemGrabRange 全表——
//   币族(71-74)+350 / 星族(184,1735,1868)+300 / 4143+300 / 心族(58,1734,1867)+250 /
//   3822+50 / NebulaPickup{3453,3454,3455}+100 / treasureMagnet 全类 +150。
//   legacy grab/heart/star 三字段保留为兼容面（值域不变）。
import { BuffType } from '../stats/Buffs';

export interface DropScanCtx {
  /** treasureMagnet 全类旗（equipStats.treasureMagnet）——getItemGrabRange(-1) 档 */
  treasureMagnet: boolean;
  /** 金戒指族旗（equipStats.goldRing）——币族 71-74 档 */
  goldRing: boolean;
  /** 魔力磁石装备旗（equipStats.manaMagnet）——星族档 */
  manaMagnetEquip: boolean;
  /** 拾心药水 buff105 电平（buffs.has(Heartreach)）——心族档 */
  heartreachBuff: boolean;
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
 *  这几次访问即整帧对 equipStats 记忆化链的全部读取。 */
export function beginDropScanCtx(host: unknown): void {
  if (!host || typeof host !== 'object') return;
  const h = host as {
    grabRangeBonus?: number;
    heartGrabBonus?: number;
    manaMagnetBonus?: number;
    buffs?: { has?: (t: number) => boolean };
    equipStats?: {
      preventAllItemPickups?: boolean; treasureMagnet?: boolean;
      goldRing?: boolean; manaMagnet?: boolean;
    };
  };
  const eq = h.equipStats ?? {};
  const heartreach = h.buffs?.has?.(BuffType.Heartreach) === true;
  scanByHost.set(h as object, {
    treasureMagnet: !!eq.treasureMagnet,
    goldRing: !!eq.goldRing,
    manaMagnetEquip: !!eq.manaMagnet,
    heartreachBuff: heartreach,
    grab: h.grabRangeBonus ?? 0,
    heart: h.heartGrabBonus ?? 0,
    star: h.manaMagnetBonus ?? 0,
    preventAll: !!eq.preventAllItemPickups,
  });
}

export function getDropScanCtx(host: unknown): DropScanCtx | null {
  if (!host || typeof host !== 'object') return null;
  return scanByHost.get(host as object) ?? null;
}

/** Player.GetItemGrabRange 的【加成段】（不含 base=42）按快照旗逐 vid 展开
 *  （原版全表：P.cs GetItemGrabRange :35405-35455 + Item.cs:43-49 常量；
 *  与 Player.getItemGrabRangeBonus 逐项同构——快照在帧界冻结，直算零 equip 访问）。 */
export function grabRangeBonusFor(ctx: DropScanCtx, vanillaVid: number): number {
  let num = ctx.treasureMagnet ? 150 : 0;                                   // 全类(:35429-35431)
  if (ctx.goldRing && vanillaVid >= 71 && vanillaVid <= 74) num += 350;     // IsACoin(:35412-35415)
  if (ctx.manaMagnetEquip
    && (vanillaVid === 184 || vanillaVid === 1735 || vanillaVid === 1868)) num += 300;  // 星族(:35417-35419)
  if (vanillaVid === 4143) num += 300;                                      // 法力斗篷之星恒真(:35421-35423)
  if (ctx.heartreachBuff
    && (vanillaVid === 58 || vanillaVid === 1734 || vanillaVid === 1867)) num += 250;   // 心族(:35425-35427)
  if (vanillaVid === 3822) num += 50;                                       // 埃特尼亚魔力(:35433-35434)
  if (vanillaVid === 3453 || vanillaVid === 3454 || vanillaVid === 3455) num += 100;  // NebulaPickup(:35436-35438)
  return num;
}
