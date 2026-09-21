// 实体基类与分桶管理器
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { beginDropScanCtx } from './dropScanCtx';
import { beginProjScanCtx, endProjScanCtx } from './projScanCtx';
import { cutTilesBox } from './ProjCutTiles';

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
 *  族以 vanillaId 近似过滤——中央收口误砍的最小化护栏 */
const CUT_EXCLUDE_VIDS = new Set([463, 69, 70, 621, 10, 11, 379, 407, 476, 623, 625, 626, 627, 628, 833, 834, 835, 818, 831, 820, 864, 970, 995, 908, 1020, 1105, 1040]);

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
        // ★中央 CutTiles 收口（2026-09-01 清零审计）：原版 Projectile.cs:11824 对
        //   全部 friendly 弹每 tick 弹盒(+1 外沿)砍 Main.tileCut 物（瓦罐/杂草/盆栽）。
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
            cutExtraTreeCactus?: boolean };
          const vid = m.vanillaId ?? m.projId ?? 0;
          // ★BJ232（2026-09-21）死弹 1-tick 过割窗：原版 Update 在 HandleMovement
          //   （AI/Kill 可达）后、Damage/CutTiles 前有 `if (!active) return` 门
          //   （P.cs:17132-135;1458 同构 :17121/:17132/:17185——Kill :71752 置
          //   active=false :72086）——被杀弹当拍即不再 Damage/CutTiles（割面在
          //   Damage 内 :12517）。本仓 fixedUpdate 后收口原无 dead 门 → 被杀弹
          //   当拍多割一拍（症状向=多割非漏割,弹 Kill 与收口同拍窗口）。
          //   dead=compact 唯一移除通道,与 active 一一对应;门位语义同构
          //   （AI 后、割前）——当拍跳过,无一拍延迟。
          if (!e.dead && !m.minion && m.npcProj !== true && !CUT_EXCLUDE_VIDS.has(vid)) {
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

  all(): Entity[] {
    return [...this.enemies, ...this.drops, ...this.npcs, ...this.projectiles, ...this.props, ...this.critters];
  }
}
