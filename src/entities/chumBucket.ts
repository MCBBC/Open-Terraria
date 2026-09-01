// ChumBucketProjectileHelper.cs（1458 同名文件）双缓冲帧注册面 1:1。
// 数据源 = 弹体 820（Chum Bucket 投掷物，AI_163_Chum Projectile.cs:54413-54547）：
// 每 tick 在 `ai[0] < 10 && timeLeft > 60` 门内（:54539-54546）上报落点
// spot = Center + UnitY*16 → AddChumLocation(spot)（按 tile 计数）。
// vanilla 消费端两处：
//   ① GetFishingPondState（Projectile.cs:21722）：池扫逐水格累计 GetChumsInLocation
//      → 渔力累进加成 +11/+6/+3（:20759-20770）——Bobber.getFishingPondState 接线；
//   ② SharkSpawnChance（NPC.cs:5558-5576）：水面点 Collision.CanHit(活体 820 矩形)
//      命中即 1/2 否则 1/10——VanillaSpawner 海洋支接线（vanilla 直扫 Main.projectile，
//      本仓以同帧矩形表等价，数据流同源）。
// ★R25-E10 登记销核（2026-09-01 终零波核对）：弹体 820 实体（ChumBucketProj,
//   AI_163 干抛→湿身钉液面物理链）与 Item4608 use→shoot 专支（Game.throwChumBucket,
//   ORPHAN_THROW_VIDS A 波工单3）均已实装——生产端每 tick 在 AI 内调 chumReport、
//   Game 主循环实体更新前调 chumOnPreUpdateAll(:6712)。消费端两条接线在位：
//   Bobber.getFishingPondState→chumsInTile 与 VanillaSpawner SharkSpawnChance→chumSpots。
//   空表态 = 无渔力加成/鲨鱼 1/10，与 vanilla 无 chum 投掷时完全同态（已替换旧
//   "扫地面掉落物 4608"的反向错误路径）。

export interface ChumSpot {
  /** 弹体矩形左上角（世界 px；SharkSpawnChance 的 CanHit 面） */
  x: number; y: number; w: number; h: number;
}

/** pending 帧（chumReport 写入） */
const countsPending = new Map<string, number>();
/** last 帧（chumsInTile 读取——GetChumsInLocation 语义） */
const countsLive = new Map<string, number>();
/** 本帧存活 820 矩形表（chumSpots 读取——SharkSpawnChance 扫描面） */
let spotsLive: ChumSpot[] = [];

const keyOf = (tx: number, ty: number): string => `${tx},${ty}`;

/**
 * OnPreUpdateAllProjectiles（ChumBucketProjectileHelper.cs:14-19）：
 * live ← 上帧 pending；pending 清空（vanilla 为引用互换后 Clear 新 pending，
 * 此处按拷贝实现——读侧引用稳定，可观察语义与 vanilla 全等：last 帧=上一帧
 * 各 820 的注册计数）。spots 表同步清空重建。
 * 弹体 820 实体批落地时须在全体弹幕更新前每帧调用。
 */
export function chumOnPreUpdateAll(): void {
  countsLive.clear();
  if (countsPending.size > 0) {
    for (const [k, v] of countsPending) countsLive.set(k, v);
    countsPending.clear();
  }
  if (spotsLive.length > 0) spotsLive = [];
}

/**
 * AddChumLocation（ChumBucketProjectileHelper.cs:22-28）+ 弹体矩形上报合一体：
 * wx/wy = 落点（弹体 Center+UnitY*16，世界 px，AI_163 :54538/:54546）；
 * rx/ry/rw/rh = 弹体矩形（SharkSpawnChance 的 Collision.CanHit 面，NPC.cs:5569-5572）。
 */
export function chumReport(wx: number, wy: number,
  rx: number, ry: number, rw: number, rh: number): void {
  const k = keyOf(Math.floor(wx / 16), Math.floor(wy / 16));
  countsPending.set(k, (countsPending.get(k) ?? 0) + 1);
  spotsLive.push({ x: rx, y: ry, w: rw, h: rh });
}

/** GetChumsInLocation（:32-37）：读 last 帧该 tile 的 chum 计数 */
export function chumsInTile(tx: number, ty: number): number {
  return countsLive.get(keyOf(tx, ty)) ?? 0;
}

/** SharkSpawnChance 扫描面：本帧存活 820 弹体矩形表 */
export function chumSpots(): readonly ChumSpot[] {
  return spotsLive;
}
