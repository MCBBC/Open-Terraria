// 弹幕命中扫描帧上下文（IIIII248,仿 dropScanCtx.ts 判例;2026-09-13）：
// 病灶链 = projTargets 五出口（hitTownNpcs/hitCritters/playerCanHitEnemy/
// pyroclastProjectileGate·snappingStoneProjectileGate/rollGolemSentryCrit）每弹×
// 每 subStepAI×每目标调一次 game.player.equipStats——getter 虽内容键记忆化,但
// equipStatsKey（甲 20+染 10+可视段+背包 I 档两遍扫+buffs 键迭代+串接）每次访问
// 全量重建（stress 弹幕域实测 get equipStats 1.65% + equipStatsKey 0.27%，
// analysis-iii247 "equipStats getter 弹幕命中扫描放大器 0.62%"）。
//
// 一窗内恒定性论证（快照严格等价于逐次计算）：
//   · 五出口消费面 = equipStats 六个布尔字段 {killGuide, killClothier,
//     dontHurtCritters, accPyroclast, accSnappingStone, accGolemSentryBackpack}
//     ——computeEquipStats 内全部由装备/背包【槽位 vid】派生（267/1307 巫毒、
//     4767/5323 机械族聚合、6167/6178/6176 配饰），不读 buffs/panicTime/世界态；
//   · 快照窗 = projectiles 桶步进窗（Entity.update 循环体内 begin/end 对称装定）
//     ——窗内无装备写入面：拾取写 inv.slots 在 drops 桶（projectiles 之前）、
//     弹药/鱼饵消耗写非 INV_EFFECTIVE_VIDS 槽（equipStatsKey 背包段只记命中格，
//     非命中格写不入键）；armor/dye 槽在 fixedUpdate 全程零写入（装备变更只在
//     输入处理/存档装载边界）；
//   · 故「projectiles 桶前一次快照」与「每弹逐次读」对六字段逐值相同 ⇒ 五出口
//     分支判定逐位相同。
// 快照缺席（单测/探针直调、其余桶）＝消费端回退旧的逐次计算路径,行为不变。
export interface ProjScanCtx {
  /** 巫毒娃娃 267（equipStats.killGuide） */
  killGuide: boolean;
  /** 裁缝师巫毒 1307（equipStats.killClothier） */
  killClothier: boolean;
  /** 4767/5323 善待小动物（equipStats.dontHurtCritters） */
  dontHurtCritters: boolean;
  /** 焰爆石 6178（equipStats.accPyroclast） */
  accPyroclast: boolean;
  /** 拍击石 6167（equipStats.accSnappingStone） */
  accSnappingStone: boolean;
  /** 圣殿骑士哨兵背包 6176（equipStats.accGolemSentryBackpack） */
  accGolemSentryBackpack: boolean;
}

const scanByHost = new WeakMap<object, ProjScanCtx>();

/** 只应由 Entity.update 在步进 projectiles 桶前调用（每 tick 至多一次）。
 *  一次 getter 访问即整窗对 equipStats 记忆化链的全部读取。 */
export function beginProjScanCtx(host: unknown): void {
  if (!host || typeof host !== 'object') return;
  const eq = (host as { equipStats?: Partial<Record<keyof ProjScanCtx, boolean>> }).equipStats;
  if (!eq) return;
  scanByHost.set(host as object, {
    killGuide: eq.killGuide === true,
    killClothier: eq.killClothier === true,
    dontHurtCritters: eq.dontHurtCritters === true,
    accPyroclast: eq.accPyroclast === true,
    accSnappingStone: eq.accSnappingStone === true,
    accGolemSentryBackpack: eq.accGolemSentryBackpack === true,
  });
}

export function endProjScanCtx(host: unknown): void {
  if (!host || typeof host !== 'object') return;
  scanByHost.delete(host as object);
}

/** 五出口统一取用：窗内=快照（字段名与 equipStats 同名同义）;窗外=null（回退活路径）。 */
export function getProjScanCtx(host: unknown): ProjScanCtx | null {
  if (!host || typeof host !== 'object') return null;
  return scanByHost.get(host as object) ?? null;
}
