// 实体基类与分桶管理器
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { beginDropScanCtx } from './dropScanCtx';
import { beginProjScanCtx, endProjScanCtx } from './projScanCtx';
import { cutTilesBox } from './ProjCutTiles';
import { projectileData } from '../data/vanillaProjectiles';   // ★BJ293 friendly 型录位

export abstract class Entity {
  id = 0;
  x = 0; y = 0;          // 左上角 px
  w = 16; h = 16;
  vx = 0; vy = 0;
  dead = false;
  onGround = false;
  hitWall = false;
  hitHead = false;
  /** 原版 collideY（NPC.cs:93804）：本轴 tile 碰撞改写 vy（TileCollision 层、
   *  slopeCollide 之前——坡面贴合清零不置位）。moveAndCollide 逐 tick 写/复位；
   *  消费点 Enemy.slimeAI 携物梯（:61309 气球弹跳 / :61932/:62124 落地嵌固回退） */
  collideY = false;
  dropThrough = false;
  /** ★BJ609（2026-10-10）：fallThrough 慢放行/快承接半边（TileCollision.Body.platFallThrough
   *  注——Collision.cs:2391 vy≤1 放行/vy>1 承接;Player.cs:28296 fallThrough=controlDown）。
   *  仅玩家侧每拍写（Player.ts inputDown 源,gravDir=-1 原版强 fall2 不置）;
   *  弹体/NPC/随从等 dropThrough 单旗源保持「平台永不承接」语义零变。 */
  platFallThrough = false;
  /** ★BJ608（2026-10-10）：平台嵌入驻留承接 opt-in（TileCollision.ts 越行块嵌入支
   *  消费旗）。原版 TileCollision 平台承接唯一门=旧脚≤平台顶（Collision.cs:2364,
   *  else 链其余三支 `!tileSolidTop` 排除平台）——嵌入盒永不承接=玩家下落穿平台后
   *  绝不被抬回。唯一合法消费者=哨兵 spawn 嵌入驻留（Player.cs:50045-50063
   *  PickSentryLandingSpot spawnY=(首实心行−1)×16−24,h=50 盒底嵌 10px;BJ-C9-SP
   *  用户基准「平台可驻」=登记在案的故意分歧）——仅哨兵弹体置 true（MinionProj）。 */
  embedPlatSnap = false;
  /** 液体位移减速因子（原版 waterMovementSpeed 族，NPC.cs:5946 默认 水/岩浆 .5、
   *  蜂蜜 .25、微光 .375）。1=dry 不减速；Enemy 侧 npcLiquid.updateNpcLiquid 每 tick 写，
   *  moveAndCollide 入口缩 dx/dy（velocity 不变——同 Collision_MoveWhileWet :93986） */
  liqFactor = 1;
  /** GetTileCollisionParameters 底对齐缩盒（NPC.cs:93950-93983,IIIII235）：逐类型
   *  cHeight 缩减量 px（290 圣骑士=62−40=22）。moveAndCollide 内承载,语义详
   *  TileCollision.Body.collTopInset 注 */
  collTopInset?: number;
  // ---- 联机傀儡标记（v3 实体同步）：快照驱动实体，本地不跑 AI/命中判定 ----
  netPuppet = false;
  /** 联机实体号（拥有者 slot 高 8 位 + 本地 id 低 24 位；见 net/entitySyncHooks） */
  netId = 0;
  // ---- P3.2 傀儡插值缓冲（15Hz 快照 × 60TPS 渲染的平滑桥）----
  /** 最新权威快照位（NPC 接触判定用；弹幕侧判定用渲染位——见 Game 两处接触注释） */
  netAx = 0; netAy = 0;
  /** 插值起点（快照到达时的渲染位）与进度（1=已到目标，纯外推） */
  netIx = 0; netIy = 0; netIt = 1;
  private netSnapIvt = 4;
  // ---- SW-AQ1 2026-09-05：本拍位移前位（原版 Projectile.oldPosition 同名语义）----
  /** 弹幕类在位移段前写（原版 Update :17118 `oldPosition = position` 位序 = AI 后/
   *  HandleMovement 前；extraUpdates 子步型每子步刷新）。消费点 = Game.switchTilesScan
   *  弹幕路由（objType 3/4）：原版 SwitchTiles 内部新旧位判定（Collision.cs:3314
   *  442 子矩形新入旧出 / :3323 旧位排除带跳过,SW-AM2 2026-09-05 引注校准——
   *  旧 :3346-3353/:3356 系 1456 行号;1457 主门在 :3323,Y 排除带 +12 偏移）
   *  与 :19974 `position != oldPosition`
   *  门——碰撞帧（挡停/静置/已在板格内）不触发。undefined = 未上报 → 回退既有
   *  latch 口径（玩家/NPC/小动物面与未改造弹幕类零变化） */
  oldX?: number;
  oldY?: number;

  abstract fixedUpdate(dt: number, game: GameHooks): void;
  abstract draw(r: Renderer, cam: Camera): void;

  /** 快照到达（Game.netApplyNpcSnaps / netApplyProjSnaps 调用）：设插值目标。
   *  从当前渲染位连续出发（中途到包不跳变）；intervalTicks = 快照周期（15Hz=4 tick） */
  netSnapTo(x: number, y: number, intervalTicks = 4) {
    this.netIx = this.x; this.netIy = this.y;
    this.netAx = x; this.netAy = y;
    this.netIt = 0;
    this.netSnapIvt = Math.max(1, intervalTicks);
  }

  /** 傀儡每 tick 推进：未到目标走 smoothstep 插值（一个快照周期到达），到后纯速度外推 */
  netPuppetStep() {
    if (this.netIt < 1) {
      this.netIt = Math.min(1, this.netIt + 1 / this.netSnapIvt);
      const t = this.netIt * this.netIt * (3 - 2 * this.netIt); // smoothstep
      this.x = this.netIx + (this.netAx - this.netIx) * t;
      this.y = this.netIy + (this.netAy - this.netIy) * t;
      return;
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  aabbOverlaps(o: Entity): boolean {
    return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y;
  }
}

/** 就地剔除 dead 实体(保持顺序,零分配)。带 destroy() 的实体(如 GrenadeProj
 *  的引信循环音句柄)在剔除时清理——fixedUpdate 早退分支已自行调用,此处兜底 */
function compact(list: Entity[]): void {
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const e = list[r];
    if (!e.dead) { list[w++] = e; continue; }
    (e as { destroy?: () => void }).destroy?.();
  }
  list.length = w;
}

/** CanCutTiles 排除型（Projectile.cs:15407 尾支排除表）+ aiStyle 45/137/92/105/106
 *  族以 vanillaId 近似过滤——中央收口误砍的最小化护栏。
 *  ★BJ606-R（2026-10-10 用户实报「放置大范围破坏杂草」定谳）：137 闪电光环族
 *  688/689/690 此前缺位——sentry=true/minion=false 弹不被 !m.minion 门拦，
 *  CanCutTiles :15407 头支 `aiStyle != 137 …` 对 137 恒 false=原版零割；
 *  旧 16×16 出生盒期割面每拍 ≤2 格无感，BJ606 场盒化（320×320）后=整盒
 *  割草机（behavior-log 4464 拍 19 格药草带+6006 拍 27 格藤簇、EntityManager
 *  探针 30 拍 13230 次上报/441 格=实锤）。
 *  ★R15-F7（2026-10-11 C15 清偿,R15-UNVERIFIED #3 逐 vid 回放定谳）：旧注
 *  「45/92/105/106 族成员（237-239/243-245/511-513/567/568/1007/1128）全系
 *  minion 旗,上游 !m.minion 门已拦=不入本表」系判谳级误读——SetDefaults 亲读：
 *  239/245 雨滴（aiStyle 45,friendly=true）、511-513 毒雾（92,friendly）、
 *  567/568 孢子陷阱（105,friendly）、1007 毒气陷阱（92,friendly+hostile+trap）、
 *  1128 叶绿锭剑孢子云（92,friendly）【无一 minion】；已实装面回放=239/245
 *  （WeaponProj 雨云族,雨滴 4×40 盒落地即割草=实害）、1128（proj1457 孢子云,
 *  friendly=true 非随从=实害）——aiStyle 45/92/105/106 级排除落本门（projectileData
 *  .aiStyle 直判,:15407 原式 1:1,免逐 vid 维护）。IsAGolfBall 族 715-718
 *  （aiStyle 147,friendly）与 1091 风暴闪电（aiStyle 203 双旗 trap,尾支
 *  `return type != 1091`=排除）同谳同落。未实装 vid（511-513/567/568/1007）
 *  无割面=销案;237/238/243/244 无 friendly 行=friendly 门已拦（双保险）。 */
const CUT_EXCLUDE_VIDS = new Set([463, 69, 70, 621, 10, 11, 379, 407, 476, 623, 625, 626, 627, 628, 833, 834, 835, 818, 831, 820, 864, 970, 995, 908, 1020, 1105, 1040, 688, 689, 690]);
/** aiStyle 级排除（:15407 头支 `aiStyle != 45 && != 137 && != 92 && != 105 && != 106`
 *  ——137 已由 BJ606-R 收 CUT_EXCLUDE_VIDS 成员式,此处补 45/92/105/106 家族级）；
 *  尾支 `return type != 1091`（:15418-15420）单型落 vid 集。 */
const CUT_EXCLUDE_AISTYLES = new Set([45, 92, 105, 106, 147]);   // 147=IsAGolfBall(715-718) aiStyle
const CUT_EXCLUDE_VIDS_TAIL = new Set([1091]);

export class EntityManager {
  nextId = 1;
  enemies: Entity[] = [];
  drops: Entity[] = [];
  npcs: Entity[] = [];
  projectiles: Entity[] = [];
  props: Entity[] = [];   // 场景物件（墓碑等不可拾取物理实体）
  critters: Entity[] = []; // 小动物（无害被动生物）
  /** 出生观察口（行为录制：Game 构造接 recLog('spawn')；缺省 undefined 零开销）。
   *  player 不经 EntityManager（独立字段），天然不录 */
  onAdd?: (e: Entity, bucket: string) => void;

  add(e: Entity, bucket: 'enemies' | 'drops' | 'npcs' | 'projectiles' | 'props' | 'critters') {
    e.id = this.nextId++;
    this[bucket].push(e);
    if (this.onAdd) this.onAdd(e, bucket);   // 行为录制：实体生成
  }

  update(dt: number, game: GameHooks) {
    // 就地压缩替代 6×filter(2026-08 审计 G9:每 tick 6 个新数组,60Hz 恒定分配)
    for (const list of [this.enemies, this.drops, this.npcs, this.projectiles, this.props, this.critters]) {
      if (list === this.drops) {
        // ★掉落扫描帧上下文（见 dropScanCtx.ts 头注；trace 实测 equip 热点 54.4%
        //   主线程自耗时——ItemDrop 每帧每物触发 equipStats 内容键全量重建）。
        //   enter drops 桶前一次快照 ⇒ 帧内逐物访问与逐次计算严格同值
        beginDropScanCtx((game as { player?: unknown }).player);
      }
      if (list === this.projectiles) {
        // ★弹幕命中扫描帧上下文（IIIII248,见 projScanCtx.ts 头注）：projTargets
        //   五出口每弹×每 subStepAI×每目标读 equipStats——内容键全量重建放大器。
        //   enter projectiles 桶前一次快照 ⇒ 窗内六布尔字段逐值恒等(证明见头注)。
        beginProjScanCtx((game as { player?: unknown }).player);
      }
      for (const e of list) {
        e.fixedUpdate(dt, game);
        // ★中央 CutTiles 收口（2026-09-01 清零审计）：原版 Projectile.cs:12516-12517 对
        //   全部 friendly 弹每 tick 弹盒(+1 外沿)砍 Main.tileCut 物（瓦罐/杂草/盆栽）。
        //   （★S6 勘误 BJ263 2026-09-22：旧注 :11824 系行号漂移——该行=383 药水支;
        //   CutTiles 调用真锚=:12517,门 friendly&&owner==myPlayer&&!npcProj&&!minion&&type!=1054）
        //   此前按弹型分散接入（Arrow 撞格路径/cutTilesBox 手动）漏网一批——天顶剑、
        //   真刃弧族等（2026-08-31 审计）。收口到此单点：projectiles 桶统一弹盒上报。
        //   · 幂等：已自砍弹型（Arrow 等）重复上报在 Game.cutTile 内零操作
        //   · CanCutTiles 排除表按 vanillaId/projId 近似过滤；minion 不砍（原版门）
        //   · ★SW-BJ33 2026-09-08 补 npcProj 半边门：原版 CutTiles 调用点
        //     `friendly && owner==Main.myPlayer && !npcProj && !minion`
        //     （Projectile.cs:12516）——城镇自卫弹出膛全带 npcProj=true
        //     （NPC.cs:54903/:55175/:55325/:55490 族）不割草;TownShot.npcProj
        //     承载（玩家弹无此位=行为不变）
        if (list === this.projectiles) {
          const m = e as { vanillaId?: number; projId?: number; minion?: boolean; npcProj?: boolean;
            cutExtraTreeCactus?: boolean; reflected?: boolean; noVanillaCut?: boolean };
          const vid = m.vanillaId ?? m.projId ?? 0;
          // ★BJ232（2026-09-21）死弹 1-tick 过割窗：原版 Update 在 HandleMovement
          //   （AI/Kill 可达）后、Damage/CutTiles 前有 `if (!active) return` 门
          //   （P.cs:17132-135;1458 同构 :17121/:17132/:17185——Kill :71752 置
          //   active=false :72086）——被杀弹当拍即不再 Damage/CutTiles（割面在
          //   Damage 内 :12517）。本仓 fixedUpdate 后收口原无 dead 门 → 被杀弹
          //   当拍多割一拍（症状向=多割非漏割,弹 Kill 与收口同拍窗口）。
          //   dead=compact 唯一移除通道,与 active 一一对应;门位语义同构
          //   （AI 后、割前）——当拍跳过,无一拍延迟。
          // ★BJ293（2026-09-23）friendly 投影门（敌对弹越权割收口）：原版 CutTiles
          //   调用点在 Damage() 内（P.cs:12515-12518;1458 :12516-12519 同文）——
          //   `friendly && owner == Main.myPlayer && !npcProj && !minion && type != 1054`
          //   外层再套 Damage_CanDealDamage()（:12461/:12512）。此前中央门只承接
          //   minion/npcProj/CanCutTiles 三支,vanilla friendly=false 的弹照走收口
          //   =越权割瓦罐/草药（红蓝-U2 探针实锤：敌对弹如 84 PinkLaser P.cs:1653
          //   hostile-only,Enemy.ts:8038 出膛活拍每拍上报 cutTile）。
          //   · ★域辨析：repo hostile ≠ vanilla friendly——机关/陷阱弹 vanilla
          //     friendly+hostile 双旗（98 :1830-31/99 族 :1840-41/31 :1139-40/
          //     40 :1235-36/763 :19217）照样割（trap 出膛 owner=Main.myPlayer,
          //     Wiring.cs:1965/:72267）;TrapShot.hostile=原版!friendly（Dart.ts:366）、
          //     Arrow.hostile=结算方向位（Damage_EVP）——两域都不可取反,门走数据面
          //     vanillaFriendly 投影：projectileData(vid)?.friendly（SetDefaults 型录,
          //     1457 提取 recon 闸门;RollingBoulder.ts:920 同款先例）。敌对弹漏斗
          //     全普查（shoot/shootM/shootD/shootD2/shootE/shootL,43 vid+VAR 组）唯
          //     一双标例=763 RollingCactusSpike（727 亲射 :19217 owner=myPlayer 不翻
          //     旗）→ 照割,与原版同相。
          //   · vid=0（SW 自造弹无型录行）无 vanilla 真值 → BJ293 现状=缺省照报
          //     （FirstFractalSlash(857) 等未挂 projId 的玩家弹割面零回退）;BJ294
          //     在此之上加敌射侧 `noVanillaCut` 拒割位（见下块）。
          //   · !e.netPuppet = owner==Main.myPlayer 投影：联机傀儡弹本地不割
          //     （原版切割归 owner 端;单机恒 false=零开销）。
          //   · m.reflected !== true：反射支 friendly=false（NPC.cs:67197-67199
          //     三联写是全 vanilla 唯一置位点;projTargets.reflectProjectile 同置
          //     reflected/hostile——双标拒切同相）。
          //   · vid !== 1054（:12515 原文第五因;1054 型录 friendly=true 双标,不在
          //     :15407 CanCutTiles 表=CUT_EXCLUDE_VIDS——两门不同锚,不可并集）。
          // ★BJ294（2026-09-23）敌射侧拒割正一位 `noVanillaCut`（缺省策略定谳=保守）：
          //   vid=0 缺省照报（BJ293 定谳现状,玩家侧零回退）+ 敌射/环境侧「vanilla 无
          //   割面」弹在类级显式标 `noVanillaCut = true` 拒割。位语义=「vanilla 本弹
          //   （或本相）无 CutTiles 调用」——独立正一位,【不】征用 projId（联机快照
          //   `projId !== undefined` 归 kind1 的架构约束,InfernoHostileBlast.ts:40/
          //   bossAI_duke_moonlord.ts:789 注）也【不】复用 repo hostile 位（域警告:
          //   TrapShot.hostile=原版!friendly 取反先例,Dart.ts:366）。字段可被运行时
          //   getter 覆写=型录弹的相位覆写口（件 2：443 电球/1110 星圈回收期拒割——
          //   ElectroSphereProj/SkyDragonCircle getter;FallingStar 双相同款）。
          //   · 定谳理由（保守 vs 激进）＝失败不对称（★F5 勘误,缺省向真依据）：保守
          //     漏网=敌弹过割草/罐（外观级,U2/U3 探针族可查）;激进漏网=玩家弹静默
          //     失割（玩法损失,更劣）→ 取其轻=缺省保守。旧注「桶成员不可静态穷举→
          //     激进缺省风险不可被 tripwire 完全覆盖」系误证已撤——tripwire 锁类面
          //     定性本可结构性穷举（间接继承链普查缺口另见 bj294 测试头 F4 登记注）。
          //     普查全表+tripwire（vid=0 能力类逐类登记定性,结构性锁）=
          //     tests/bj294-vid0-cut-facing.test.ts。
          //   · 逐类锚：292 P.cs:3822 hostile;455 :5277;456 :5288;385 :4682;
          //     384/386 :4670/:4692（★F3 勘误 2026-09-23:455/456/385/384/386 hostile
          //     行号按 1457 反编译亲读重钉,旧 :5281/:5292/:4684/:4672/:4694 系误记——
          //     两基线该处均非 hostile 行）;687 :7324 friendly=false+hostile;
          //     629 :6756;961/962/965 敌对;526 :5964-72 无 friendly 行;
          //     1078 :10069-10078（★F1 勘误:旧 :9783-93 系 1456 行号,两基线双旗
          //     同值仅行号漂）双旗但 vanilla 出生 NewProjectile 8 参 owner 缺省=255
          //     （W.cs:72337,★F3:旧 :72335 系误记→P.cs:10866-69）≠myPlayer → 不割;
          //     813 血云双旗但 vanilla 出生显式
          //     owner=Main.myPlayer（NPC.cs:48026）→ vanilla 照割,不标=同相。
          //   · 玩家侧登记债（本刀不修,照报=零回退豁免）：250/298/305/254 型录无
          //     friendly 行（254 磁球=★清偿刀 V 2026-09-29 补登记:BJ345 独立实体化
          //     后入族——P.cs:3369-3377 SetDefaults 无 friendly/hostile 行 → 割门
          //     P.cs:18021 `(friendly||hostile)` 不落=vanilla 零割;本仓 vid=0 缺省
          //     照报=照割,tripwire REGISTRY 同日定性 playerSide,
          //     tests/bj294-vid0-cut-facing.test.ts）;
          //     444/460/633/971·975（钉扎态 ai0==1,Player.cs:44518 出生
          //     即 1）/818 落 vanilla Damage_CanDealDamage（:12461）豁免表 → vanilla
          //     实际不割、本仓照割=多割相位差家族（SW 自造玩家弹侧,登记待刀）。
          //   · ★R15-F8 登记债（2026-10-11 C15）：原版第二割面=HandleMovement 碰撞支
          //     （Projectile.cs:18021-18026 `owner==myPlayer && CanCutTiles() &&
          //     (friendly||hostile) && damage>0`——【撞格拍】以速度外延盒（±velocity）
          //     CutTiles,滚石/巨石族贴地滚动每拍碰撞触发）;本仓中央收口=每拍 AI 后
          //     弹盒上报（单面）——两面并集差=撞格拍速度外延边带 1-2px 边缘格割草
          //     时序差（敌对滚地弹贴地磨草相位差,面宽待逐型回放定谳,登记不落）。
          //   · ★307 防回潮锚（件 4 零修刀）：vanilla 306 尖球 Kill 原位派生 307
          //     （P.cs:78055）→ AI_036 锁敌支 `friendly = true`（P.cs:27789-27792,
          //     全 vanilla 唯一置位;型录 307 无 friendly 行）→ 锁敌后每 tick 割。
          //     本仓无 306 分裂链 → 307 零生成=当前零影响;【306 链移植时须同步补
          //     307 运行时翻旗割草面】（锁敌态 noVanillaCut getter 翻 false,型录
          //     投影无 friendly 字段会照拦/照放两不知——以此注为锁）。
          const cutFriendly = m.noVanillaCut !== true
            && (vid === 0 ? true : projectileData(vid)?.friendly === true);
          if (!e.dead && cutFriendly && m.reflected !== true && !e.netPuppet
            && m.npcProj !== true && !m.minion && vid !== 1054
            && !CUT_EXCLUDE_VIDS.has(vid) && !CUT_EXCLUDE_VIDS_TAIL.has(vid)
            && !CUT_EXCLUDE_AISTYLES.has(projectileData(vid)?.aiStyle ?? -1)) {
            // ★SW-BJ67（2026-09-14）：vid 随盒穿线——CutTiles 逐型豁免面
            //   （P.cs:15391-15393 1047 滚过幼虫 231 不割,详 ProjCutTiles.ts 注）
            // ★债刀-4 ②（2026-09-17）：出程旗随盒穿线——CutTilesAt :15384-86
            //   `type==1052 && ai[0]==0` 加砍面,ai[0] 位由载体（Boomerang getter）
            //   自报,vid==1052 重验在 Game.cutTile 收口处（详 ProjCutTiles.ts 注）
            cutTilesBox(game, e.x, e.y, e.w, e.h, vid, m.cutExtraTreeCactus === true);
          }
        }
      }
      compact(list);
      if (list === this.projectiles) {
        endProjScanCtx((game as { player?: unknown }).player);   // 窗对称收口(窗外回退活路径)
      }
    }
  }

  clear() {
    this.enemies.length = 0;
    this.drops.length = 0;
    this.npcs.length = 0;
    this.projectiles.length = 0;
    this.props.length = 0;
    this.critters.length = 0;
  }

  /** ★C1 帧零分配（2026-09-22）：all() 复用持久缓冲（原每次 6-spread 新数组——
   *  渲染帧热路径 Game.ts:47797 每帧一分配）。返回值=【同帧只读 scratch】：
   *  消费方禁止跨帧保留引用、禁止原地排序/改写（Renderer 排序前自拷贝到
   *  自己的持久 scratch）；其余消费点（Game.ts:6401/:6432）只读 length。
   *  拷贝序 = 原 spread 序（enemies,drops,npcs,projectiles,props,critters）
   *  逐位同；稳态同实体数时零分配零长度变更。 */
  private _allBuf: Entity[] = [];
  all(): Entity[] {
    const buf = this._allBuf;
    let i = 0;
    const a1 = this.enemies; for (let j = 0; j < a1.length; j++) buf[i++] = a1[j];
    const a2 = this.drops; for (let j = 0; j < a2.length; j++) buf[i++] = a2[j];
    const a3 = this.npcs; for (let j = 0; j < a3.length; j++) buf[i++] = a3[j];
    const a4 = this.projectiles; for (let j = 0; j < a4.length; j++) buf[i++] = a4[j];
    const a5 = this.props; for (let j = 0; j < a5.length; j++) buf[i++] = a5[j];
    const a6 = this.critters; for (let j = 0; j < a6.length; j++) buf[i++] = a6[j];
    if (buf.length > i) buf.length = i;
    return buf;
  }
}
