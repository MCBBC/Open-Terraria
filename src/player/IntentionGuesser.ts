// BJ433（2026-10-02）捣蛋猫帮工意图推断——Terraria.DataStructures/PlayerIntentionGuesser.cs
// （1457 反编译逐行全量移植）+ GuessedPlayerIntention.cs 枚举。
//
// 消费面 = AI_067_FreakingPirates_TryAssigningHelp（Projectile.cs:52208-52268）：
// 1093 捣蛋猫 / 1112 可靠的捣蛋猫每拍窥探玩家意图，命中则入 ai[0]=3 帮工态寻格采掘。
// 触发侧 = 玩家挖掘分派（Player.cs:46102 斧支 Track(HarvestTrees) / :46162 镐支
// Track(HarvestTreasure)，:46142 斧破块 AllowTracking / :54412 PickTile 破块
// AllowTracking）。旧登记「IntentionGuesser 本仓无——勿造系统」
// （MinionProj.ts 2026-08 批注）前提失效：src/player/SmartCursor.ts 已全量移植
// Step_Axe / Step_Pickaxe_MineSolids，帮工链自此可以 1:1 闭合。
//
// 原版三件套语义（行号 = PlayerIntentionGuesser.cs）：
//   - Track（:30-43）：仅当 PlayerActiveActionTimeLeft != 0（AllowTracking :45-48
//     开 60t 窗）才记录陈值快照（LastX/LastY/LastPosition/LastCenter/LastDirection/
//     LastWidth/LastMouse=Main.MouseWorld + Intention）。
//   - Update（:50-96，Player.cs:24786 Player.Update 内每拍）：窗递减；意图失效六门
//     （离 LastCenter>80 / controlJump / 使用中但手持工具与意图族不符 / 480t 超时 /
//     死亡）→ Intention=None。whoAmI 门（:52-55）= 本仓本地权威模拟恒 myPlayer，豁免。
//   - PrepareUsageProxy（:98-123）：以陈值快照合成扫区——1×1 @(LastX,LastY)
//     inflate(w,h) ∩ 世界 [10,max-10]（C# Rectangle.Inflate/Intersect 语义）。

/** GuessedPlayerIntention.cs 全表（None/HarvestTreasure/HarvestTrees） */
export enum GuessedPlayerIntention {
  None = 0,
  HarvestTreasure = 1,
  HarvestTrees = 2,
}

/** Track 侧快照（:30-43 消费面——LastX/LastY/position/Center/direction/width/
 *  MouseWorld 五件陈值） */
export interface IntentTrackSnapshot {
  position: { x: number; y: number };
  center: { x: number; y: number };
  width: number;
  direction: number;
  /** Main.MouseWorld（世界 px） */
  mouse: { x: number; y: number };
}

/** 玩家每拍快照（原版直接读 Player 字段；本仓以结构体注入——Game 侧装配，
 *  测试可手工喂）。heldPick/heldAxe = HeldItem.pick/.axe（heldSemantics 同式：
 *  主工具类型取 power，副斧力 axePower 兜底——Drax 579 双力族同原版双 >0）。 */
export interface IntentPlayerSnapshot extends IntentTrackSnapshot {
  controlJump: boolean;
  /** Player.UsingOrReusingItem（:4052 itemAnimation>0 ∨ reuseDelay>0 ∨ channel ∨
   *  pendingReuse——本仓近似 = itemAnimTicks>0，通道工具复用窗口差异备案） */
  usingOrReusing: boolean;
  heldPick: number;
  heldAxe: number;
  dead: boolean;
}

/** PrepareUsageProxy 产出扫区（与 SmartCursor Region 同口径：x0..x1 闭区间）。 */
export interface IntentRegion { x0: number; y0: number; x1: number; y1: number }

export class IntentionGuesser {
  lastX = 0;
  lastY = 0;
  lastPosition = { x: 0, y: 0 };
  lastCenter = { x: 0, y: 0 };
  lastMouse = { x: 0, y: 0 };
  lastDirection = 1;
  lastWidth = 0;
  intention = GuessedPlayerIntention.None;
  timeWithIntention = 0;
  playerActiveActionTimeLeft = 0;

  /** :30-43 Track */
  track(snap: IntentTrackSnapshot, x: number, y: number, intention: GuessedPlayerIntention): void {
    if (this.playerActiveActionTimeLeft === 0) return;   // :32-42 窗门
    this.lastX = x;
    this.lastY = y;
    this.intention = intention;
    this.lastPosition = { x: snap.position.x, y: snap.position.y };
    this.lastCenter = { x: snap.center.x, y: snap.center.y };
    this.lastDirection = snap.direction;
    this.lastWidth = snap.width;
    this.lastMouse = { x: snap.mouse.x, y: snap.mouse.y };
  }

  /** :45-48 AllowTracking（缺省 60） */
  allowTracking(time = 60): void {
    this.playerActiveActionTimeLeft = time;
  }

  /** :50-96 Update（Game.fixedUpdate 玩家拍内每拍调） */
  update(snap: IntentPlayerSnapshot): void {
    // :52-55 `whoAmI != Main.myPlayer → return`——本仓随从/挖掘本地权威模拟恒真，豁免
    this.timeWithIntention++;
    if (this.playerActiveActionTimeLeft > 0) {
      this.playerActiveActionTimeLeft--;
    }
    if (this.intention === GuessedPlayerIntention.None) return;   // :61
    let flag = false;
    if (Math.hypot(snap.center.x - this.lastCenter.x, snap.center.y - this.lastCenter.y) > 80) flag = true;   // :63-68
    if (snap.controlJump) flag = true;   // :69-72
    if (snap.usingOrReusing && this.intention === GuessedPlayerIntention.HarvestTreasure && snap.heldPick <= 0) flag = true;   // :73-77
    if (snap.usingOrReusing && this.intention === GuessedPlayerIntention.HarvestTrees && snap.heldAxe <= 0) flag = true;       // :78-81
    if (this.timeWithIntention >= 480) flag = true;   // :82-85
    if (snap.dead) flag = true;   // :86-89
    if (flag) {
      this.intention = GuessedPlayerIntention.None;   // :90-94
      this.timeWithIntention = 0;
    }
  }

  /** :98-123 PrepareUsageProxy——1×1 @(LastX,LastY) inflate(w,h) ∩ 世界 [10,max-10]。
   *  C# Rectangle.Inflate((x,y,1,1),w,h) → Left=x-w / Top=y-h / Right=x+w+1 /
   *  Bottom=y+h+1（X+Width 语义——右/下比对称 inflate 多 1 格，原版逐字）；
   *  Intersect((10,10,maxX-10,maxY-10))（value2 = 全图 inflate(-10,-10)）。
   *  原版 itemType 形参（10 铁斧 / 1 铁镐）只喂 UsageProxy.item 供 Step 的 >0 门，
   *  本仓由调用方直给 sem 工具类型，形参免（快照区仍由本方法产出）。 */
  prepareUsageProxy(inflateW: number, inflateH: number, maxTilesX: number, maxTilesY: number): IntentRegion {
    const l = this.lastX - inflateW;
    const t = this.lastY - inflateH;
    const r = this.lastX + inflateW + 1;
    const b = this.lastY + inflateH + 1;
    return {
      x0: Math.max(l, 10),
      y0: Math.max(t, 10),
      x1: Math.min(r, maxTilesX - 10),
      y1: Math.min(b, maxTilesY - 10),
    };
  }
}
