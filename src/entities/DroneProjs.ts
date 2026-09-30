// 帕鲁机件双弹 1:1（Terarria1457 反编译为唯一标杆；行号均指该树）：
//   JimsDroneProj      弹 1020  aiStyle 195  AI_195_JimsDrone（Projectile.cs:41652-41804）
//   RemoteControlCar   弹 1105  aiStyle 205  AI_205_RemoteControlCar（Projectile.cs:38768-39169）
//   SetDefaults        1020 → :9661-9667（12×12/195/friendly/penetrate −1）
//                      1105 → :10296-10304（26×26/205/friendly/tileCollide/correctSlopeCollision）
//   Kill 面            :71979-72030（1020 成就 TO_INFINITY_AND_BEYOND"Do" :71981-71985 +
//                      循环音停 :71986；两弹 Item62 + 尘 31×15/228×10/226×3 + gore 61-63
//                      ——视觉面单口 Game.onProjectileDeath 1020/1105 支）
//   碰撞尾链           HandleMovement :17578：lastVelocity :17696 → TileCollision(fallThrough=
//                      flag6,非宠物恒 true :17586-17600)=平台穿透 → 1020 反弹支
//                      :18167-18178（correctSlopeCollision=false,|last|>1 → −last×0.25）→
//                      1105 无反弹（:18509 门排除）;BreaksFromToyBreaker 两弹在表
//                      （ProjectileID.cs:27,BreaksToys={740} 气球）→ :18017-18019 撞格 Kill
//   绘制               1020: DrawContinuousTrail（Main.cs:28508→:28301-28328 双尾迹）+ 通用支
//                      origin(16,14)（:33178-33180）;1105: 七帧竖带（projFrames=7
//                      Main.cs:8864）+ 位移门 :33775-33784 + 通用宠物支 :34210
//   物品面             5451（Item.cs:42967-42980 shoot 1020/speed 9/useStyle 1/holdStyle 7）
//                      5738（:44983-44997 shoot 1105/speed 1/useStyle 5/holdStyle 7）；
//                      ItemCheck_UseItem flag 门（Player.cs:43852-43858 场内有同型弹禁再射）
//                      + ItemCheck_TryDestroyingDrones（:45630-45655 点击收回,releaseUseItem=
//                      false）+ ItemCheck_Shoot 先清后生（:49513-49522）——发射支在 Game.updateUse
//   Track 归位         原版 Track 调用点在 AI owner==myPlayer 支（:41688/:38825）——本仓
//                      Game.droneCameraTrack 钩子承载（清偿刀 A：I 刀出膛位代行退役）
//   MP 门              owner==Main.myPlayer 支包住全部输入/Track 面；AI 本体两主共跑
//   MP 快照面          ★清偿刀 G（2026-09-29）：msg27 kind=11（原版 Msg27 ai[0]/ai[1]
//                      携带语义 1:1——Projectile.cs:41679-41687/:38794-38824 输入字节
//                      netUpdate=true + :777-828 writer ai[0]/ai[1] + MessageBuffer.cs
//                      :1701-1744 读面 ai[] 直赋）。owner 端打包输入入 ai0、全端 AI 照跑
//                      （非 owner 端不等快照逐拍模拟,快照重锚——同 vanilla 分布式物理）；
//                      localAI[0..2] 不同步（:41698/:41703/:38835 计时器/音档/音槽各端
//                      自持）。Game.netProjBroadcast kind11 支 ↔ 本类 netTag/netAux ↔
//                      Game.netMakeProj case 11 三点共表
import { Entity } from './Entity';
import { projSprite } from './Arrow';
import { projectileData } from '../data/vanillaProjectiles';
import { dyeChannelsOf, getProjDesiredDyeVid, dyedProjCanvas, dyedSolidBand, type DyeInvSource } from '../data/projDye';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { moveAndCollide, tileCollisionProbeBlocked, walkDownSlopePre } from '../physics/TileCollision';
import { remap } from '../stats/ScaleStats';
import { ITEM_DEFS } from '../data/items';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import type { World } from '../world/World';

/** MathHelper.WrapAngle（XNA：wrap 到 [−π,π)） */
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Utils.NextVector2CircularEdge（Utils.cs:1307-1309：角均匀椭圆边——无半径掷） */
function circularEdge(w: number, h: number): { x: number; y: number } {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * w, y: Math.sin(a) * h };
}

/** Utils.NextVector2Circular（Utils.cs:1301-1304：角均匀单位向量 × (w,h) × NextFloat()） */
function circular(w: number, h: number): { x: number; y: number } {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random();
  return { x: Math.cos(a) * w * r, y: Math.sin(a) * h * r };
}

/** (rotation − π/2).ToRotationVector2()（:41718/:41729/:39015 姿态推力向量） */
function rotDirVec(rotation: number): { x: number; y: number } {
  const a = rotation - Math.PI / 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** 跟踪循环音句柄（GameHooks.startTrackedLoop 面 + setPitch 扩展位） */
type DroneLoop = {
  stop(): void;
  setPos(px: number, py: number): void;
  setVolume?(v: number): void;
  setPitch?(p: number): void;
};

/** AI 落地尘探针净距（AI_195 :41774-41791 / AI_205 :39096-39146 同构三段 16px 下探）：
 *  vanilla 逐段 `vector5 = Collision.TileCollision(pos+(0,16i), (0,16), w, h)`——
 *  【缺省参】fallThrough=false（平台阻挡,与 HandleMovement 的 flag6=true 相反）,
 *  blocked 段提前 break 累计净距 ⇒ 等价单次下探 total 的最大净距（扫掠盒包含单调）。
 *  本仓 tileCollisionProbeBlocked（moveAxis 同核,无 dropThrough Body=平台照挡）二分。 */
function probeGroundGapPx(world: World, x: number, y: number, w: number, h: number, total: number): number {
  if (!tileCollisionProbeBlocked(world, x, y, w, h, 0, total, 1)) return total;
  let lo = 0;
  let hi = total;
  for (let k = 0; k < 10; k++) {
    const mid = (lo + hi) / 2;
    if (tileCollisionProbeBlocked(world, x, y, w, h, 0, mid, 1)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** 原版 heldItem vid 解析（Projectile.cs:41672 `player.HeldItem.type != 5451` 面） */
function heldItemVid(game: GameHooks): number {
  const held = game.player.inv?.heldItem?.();
  if (!held) return -1;
  return ITEM_DEFS[held.id]?.vid ?? -1;
}

/** 弹幕染料通道 vid（清偿刀 N 2026-09-30;★Q3 2026-09-30 MP 面清偿）——
 *  GetProjectileDesiredShader 1:1：1020/1105 均走 switch 覆写 → cPet（owner!=255
 *  面由本函数承载：本地弹读属主 inv.miscDyes[0];傀儡经 dyeInvProbe 读拥有端代理
 *  inv——msg5 ItemContainer.MiscDyes=3 段同步后与本地同源;probe 缺/段缺=通道 0
 *  fail-open 同相）。damage 传弹实值（switch 覆写无 damage 门,projPet 支 1020
 *  本就 damage==0）、aiStyle 数据面。 */
function droneDyeVid(d: DroneBase): number {
  const inv = d.ownerPlayer !== undefined
    ? (d.ownerPlayer as unknown as { inv?: DyeInvSource } | undefined)?.inv
    : (d.dyeInvProbe && d.netOwnerSlot !== undefined
      ? (d.dyeInvProbe(d.netOwnerSlot) as { inv?: DyeInvSource } | null | undefined)?.inv
      : undefined);
  if (!inv) return 0;
  const ch = dyeChannelsOf(inv);
  if (!(ch.cPet > 0)) return 0;
  return getProjDesiredDyeVid(
    { vid: d.projId, minion: false, damage: d.damage, aiStyle: projectileData(d.projId)?.aiStyle },
    ch,
  );
}

/** 共享基类：SetDefaults/输入字节/自毁链/Track/循环音/Kill 单口。
 *  ai 字段语义：ai0 ≙ Projectile.ai[0]（输入字节 float）、rotation ≙ ai[1]（姿态角
 *  跨拍存储,vanilla AI 头 `rotation = ai[1]` 尾 `ai[1] = rotation`——本仓字段自持）；
 *  local0/local1 ≙ localAI[0]/[1]。 */
export abstract class DroneBase extends Entity {
  projId: 1020 | 1105;
  damage = 0;
  knockback = 0;
  /** 发射者玩家引用（owner==Main.myPlayer 判定;本仓仅本地使用点生成=恒本地；
   *  联机傀儡不置此引用=isMine false→AI 走快照输入面） */
  ownerPlayer?: object;
  /** ★刀G MP 镜像面：傀儡专用——拥有端槽位（快照 netId 高 8 位）+ 远端死亡镜像读口
   *  （原版 AI 头 `player.dead` 读的是 Main.player[owner],傀儡端等价体=msg13 ghost 位
   *  镜像,Game.netMakeProj case 11 接线;本地弹恒 undefined 走 game.player） */
  netOwnerSlot?: number;
  ownerDeadProbe?: (slot: number) => boolean;
  /** ★清偿刀 Q3（2026-09-30）：傀儡染料槽读口——拥有端代理 inv（msg5 miscDyes 段
   *  已同步,proxy.inv 即 DyeInvSource）。Game.netMakeProj case 11 接线;本地弹恒
   *  undefined（ownerPlayer.inv 直读）。旧端降级=probe 缺/miscDyes 全 null → 通道 0。 */
  dyeInvProbe?: (slot: number) => unknown;
  /** Projectile.ai[0]：输入位包（0=left 1=right 2=up 3=down,1105 加 4=jump 5=mode） */
  ai0 = 0;
  /** Projectile.ai[1]：姿态角（AI 头 rotation=ai[1]、尾 ai[1]=rotation） */
  rotation = 0;
  /** localAI[0]：转向/俯仰输入持续计数（松键归零——1020 按左右,1105 按上下） */
  protected local0 = 0;
  /** localAI[1]：引擎推力档（Lerp 0.2 跟随） */
  protected local1 = 0;
  /** localAI[2]：循环音句柄（vanilla=SlotId float 经 GetActiveSound 回取） */
  protected loop: DroneLoop | null = null;
  /** Projectile.timeLeft（AI 每 tick 钉 2,Update 尾 −1 :17305——AI 停跑 2 拍后自灭） */
  protected timeLeft = 2;
  /** 1105 专属：frame/frameCounter（AI 直驱;1020 无帧消费） */
  frame = 0;
  protected frameCounter = 0;
  /** Projectile.direction / spriteDirection（1105 车头向;1020 AI 不写=恒 0 无翻转） */
  dir = 0;
  spriteDir = 0;
  // ---- 通用湿段旗（ProjWetFlags 同形;GolfBall 同款共享体）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  wetCount = 0;
  presetDone = false;

  constructor(projId: 1020 | 1105, cx: number, cy: number, vx: number, vy: number) {
    super();
    // NewProjectile 语义：入参中心 → position = center − size/2（Projectile.cs:15162 一带）
    const pd = projectileData(projId);
    this.w = pd?.width ?? (projId === 1020 ? 12 : 26);
    this.h = pd?.height ?? (projId === 1020 ? 12 : 26);
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.vx = vx;
    this.vy = vy;
    this.projId = projId;
  }

  /** owner == Main.myPlayer（本仓发射支只本地生成 → 引用存在即本地弹） */
  protected get isMine(): boolean {
    return this.ownerPlayer !== undefined;
  }

  /** 循环音逐帧跟随（ActiveSound.Volume/Position/Pitch :41707-41711 / :38997-39001）：
   *  baseVol = SoundID WithVolume（JimsDrone 0.1 :1060 / RCCar 0.015 :1062）；
   *  thrust = num4 原值透传（原版乘区=atten×Style.Volume×Volume 终钳 [0,1]——本仓
   *  applyAt 终钳 + setVolume 宽钳到 10 等价,详见 Sfx.startTrackedLoop 注）。 */
  protected updateLoop(game: GameHooks, sound: 'jimsDrone' | 'rcCar', baseVol: number,
    thrust: number, pitch: number): void {
    if (this.loop === null && thrust !== 0) {
      this.loop = game.startTrackedLoop?.(sound, baseVol, this.cx, this.cy) ?? null;
    }
    const h = this.loop;
    if (h) {
      h.setVolume?.(thrust);
      h.setPos(this.cx, this.cy);
      h.setPitch?.(Math.max(-1, Math.min(1, pitch)));
    }
  }

  /** 引擎推力包络（两 AI 同构段 :41703-41705 / :38992-38994）：
   *  bump = Remap(localAI[0],0,5,0,1)×Remap(localAI[0],5,15,1,0)（起步 bump）；
   *  vol = Clamp(Max(Remap(localAI[1],0,100,0,25), bump×12), 0, 100)。 */
  protected thrustEnvelope(): { bump: number; vol: number } {
    const bump = remap(this.local0, 0, 5, 0, 1) * remap(this.local0, 5, 15, 1, 0);
    const vol = Math.max(0, Math.min(100, Math.max(remap(this.local1, 0, 100, 0, 25), bump * 12)));
    return { bump, vol };
  }

  /** 公共尾段（:41739-41743 / :39150-39168）：|v|>16 钳、灯 0.3 白、timeLeft 钉 2 */
  protected commonTail(game: GameHooks): void {
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 16) {
      const k = 16 / sp;
      this.vx *= k;
      this.vy *= k;
    }
    game.addLightAt?.(this.cx, this.cy, 0.3, 0.3, 0.3);   // Lighting.AddLight(Center, One×0.3)
    this.timeLeft = 2;
    // CheckSectionsInCaseOwnerIsWatching（:41803/:39168）——本仓等价面已收口：
    // 弹幕流送 AOI=room.ts msg27 逐接收端过滤（bbox 滞回,原版 section 语义的仓库
    // 等价模型）+ 相机目标随刀D msg13 camTarget 上行（无人机跟拍位=AOI 过滤中心,
    // Game.updateCameraPan droneCam 支）——原版 per-client ActiveSections 重补发面
    // （RecheckSectionsForSkippedUpdates :17436）由仓库「差分快照+60t 兜底+TTL」
    // 自然覆盖,无独立建模面。
  }

  /** 消亡单口（Projectile.Kill → Game.onProjectileDeath 单口;循环音停 = Kill :71986
   *  1020 显式支 + 1105 LoopedPlayCondition 失活停轨——本仓两弹同口同相）。
   *  ★刀G：ownerLocal 随口携带（Kill :71981-71985 成就门 `owner == Main.myPlayer` 的
   *  等价投影——傀儡消亡不触发本端成就;单机恒 true 零影响）。 */
  killNow(game: GameHooks): void {
    if (this.dead) return;
    this.dead = true;
    this.loop?.stop();
    this.loop = null;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h, 0, 0, 0,
      { ownerLocal: this.isMine });
  }

  /** 傀儡移除背板（netRemoveProjPuppets 置 dead 不走 killNow——EntityManager.compact
   *  兜底停循环音,防傀儡被 msg28 移除后引擎音泄漏;killNow 已停=幂等） */
  destroy(): void {
    this.loop?.stop();
    this.loop = null;
  }

  /** ★刀G 快照应用（收端 netApplyProjSnaps kind11 支唯一入口）：ai0/rotation 硬写 +
   *  位置重锚（原版 Msg27 接收面 1:1——MessageBuffer.cs:1735-1744 `proj2.ai[num155] =
   *  array[num155]; proj2.position = position4` 直赋语义,非插值）。非有限值拒收
   *  （S6 NaN 清洗,同 readPlayerHurt 惯例）。 */
  netDroneSync(ai0: number, rotation: number, x: number, y: number): void {
    if (Number.isFinite(ai0)) this.ai0 = ai0 & 63;
    if (Number.isFinite(rotation)) this.rotation = rotation;
    if (Number.isFinite(x) && Number.isFinite(y)) { this.x = x; this.y = y; }
  }

  /** ★刀G 快照打包（Game.netProjBroadcast kind11 支消费,与 netMakeProj case 11 互逆）：
   *  tag=`projId,rotMilli`（rotation ≙ ai[1] 千分位量化,±3142 i16 值域安全,误差
   *  ≤0.0005 rad 视觉不可辨）;aux=ai0 输入字节（≙ ai[0],0..63） */
  get netTag(): string {
    return `${this.projId},${Math.round(this.rotation * 1000)}`;
  }
  get netAux(): number {
    return this.ai0 & 63;
  }

  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    const p = game.player;
    let flag = false;
    // :41660-41663 / :38776-38779——原版读口=Main.player[owner].dead：本地弹=本机玩家;
    // 傀儡=拥有端死亡镜像（netOwnerSlot→msg13 flagBits[6] ghost 位,ownerDeadProbe
    // 接线;探针缺线时保守视为未亡=只丢「主人死亡即坠毁」面,不误杀）
    const ownerDead = this.netPuppet && this.ownerDeadProbe && this.netOwnerSlot !== undefined
      ? this.ownerDeadProbe(this.netOwnerSlot)
      : p.dead;
    if (ownerDead) flag = true;
    if (this.isMine) {
      // ---- owner==Main.myPlayer 支（:41665-41689 / :38781-38826）----
      if (this.y - this.h <= 640) {                       // :41667-41670 / :38783-38786
        this.killNow(game);
        return;
      }
      if (heldItemVid(game) !== this.heldVid) flag = true; // :41671-41673 / :38787-38789
      this.ai0 = this.assembleInput(game);                 // 输入字节（子类装配）
      game.droneCameraTrack?.(this);                       // Track（:41688 / :38825）
    }
    if (flag) {
      this.killNow(game);
      return;
    }
    this.aiBody(game);
    // ---- 湿段（Update :16901-17113 在 AI 后/位移前;两弹无 ignoreWater 行=受段）----
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- oldPosition（Update :17118 位序=AI 后/HandleMovement 前;AI_205 flag12 读）----
    this.oldX = this.x;
    this.oldY = this.y;
    // ---- HandleMovement（:17578：lastVelocity :17696 → TileCollision 平台穿透）----
    const lvx = this.vx;
    const lvy = this.vy;
    const drag = projWaterDragFactor(this);
    const body = {
      x: this.x, y: this.y, w: this.w, h: this.h,
      vx: this.vx, vy: this.vy,
      onGround: false, hitWall: false, hitHead: false, collideY: false,
      hoik: true,                    // 弹幕全路径 hoik=true（Body.hoik 注;FX34c）
      dropThrough: true,             // 非宠物 flag6 恒 true（:17586-17600）=平台/家具顶穿透
    };
    moveAndCollide(body, game.world, this.vx * drag, this.vy * drag);
    this.x = body.x;
    this.y = body.y;
    this.vx = body.vx;
    this.vy = body.vy;
    // ---- 尾链：1020 反弹支（:18167-18178）——TileCollision 改轴且 |last|>1 → −last×0.25;
    //      1105 correctSlopeCollision=true（:18509 门）无反弹;BreaksFromToyBreaker
    //      撞气球 740 → Kill（:18017-18019）----
    if (this.projId === 1020) {
      if (this.vx !== lvx && Math.abs(lvx) > 1) this.vx = -lvx * 0.25;
      if (this.vy !== lvy && Math.abs(lvy) > 1) this.vy = -lvy * 0.25;
    }
    if (this.hitsBreaksToy(game)) {
      this.killNow(game);
      return;
    }
    // ---- oldPos 环（TrailingMode[1020]=2 + TrailCacheLength=20 ProjectileID.cs:385/387;
    //      1105 不在表=−1 无环）----
    this.pushTrail();
    // ---- timeLeft--（Update :17305-17309）----
    if (--this.timeLeft <= 0) {
      this.killNow(game);
    }
  }

  /** BreaksFromToyBreaker 面（Projectile.cs:18017-18019：AnyCollisionWithSpecificTiles
   *  (position+lastVelocity 扫掠盒, BreaksToys={740})——气球格接触即 Kill。落位盒扫掠
   *  近似（碰撞后弹体触格即原文本轮 Kill 同相;反弹支先改速不影响盒） */
  private hitsBreaksToy(game: GameHooks): boolean {
    const st = game.world.store;
    const x0 = Math.floor(this.x / TILE);
    const x1 = Math.floor((this.x + this.w) / TILE);
    const y0 = Math.floor(this.y / TILE);
    const y1 = Math.floor((this.y + this.h) / TILE);
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) {
        if (!st.inBounds(i, j)) continue;
        if (st.get(i, j) === 740 && st.isActive(i, j)) return true;
      }
    }
    return false;
  }

  /** 输入位包装配（owner 支;子类实现——原版 LocalInputCache 读面 :41674-41682 /
   *  :38791-38824,^gravDir 翻转、1105 跳边沿翻 mode+音 22+尘 226） */
  protected abstract assembleInput(game: GameHooks): number;
  /** AI 本体（owner 门后;子类实现——:41692-41804 / :38828-39169） */
  protected abstract aiBody(game: GameHooks): void;
  /** oldPos 环推进（1020 mode2 / 1105 无环） */
  protected abstract pushTrail(): void;
  /** 持机件 vid 门（1020↔5451 / 1105↔5738） */
  protected abstract get heldVid(): number;
}

// ============================================================================
// 弹 1020 JimsDrone（AI_195_JimsDrone Projectile.cs:41652-41804）
// ============================================================================
export class JimsDroneProj extends DroneBase {
  /** oldPos 环（TrailingMode 2:pos+rot 并推 :17252-17264;TrailCacheLength=20
   *  ProjectileID.cs:387;Zero 哨兵=原版 Vector2.Zero 同相——未满槽不画段） */
  private posRing: Array<{ x: number; y: number }> = [];
  private rotRing: number[] = [];
  private static readonly RING = 20;

  constructor(cx: number, cy: number, vx: number, vy: number) {
    super(1020, cx, cy, vx, vy);
  }

  protected get heldVid(): number {
    return 5451;
  }

  /** 输入字节（:41674-41682）：bit0=controlLeft^flip bit1=controlRight^flip
   *  bit2=controlUp bit3=controlDown（down 读而未用 :41686 丢弃,包内保位）。 */
  protected assembleInput(game: GameHooks): number {
    const p = game.player;
    const flip = p.gravDir === -1;
    const left = (!!p.inputLeft) !== flip;
    const right = (!!p.inputRight) !== flip;
    return (left ? 1 : 0) | (right ? 2 : 0) | (p.inputUp ? 4 : 0) | (p.inputDown ? 8 : 0);
  }

  /** AI_195 本体（:41692-41804 逐行） */
  protected aiBody(game: GameHooks): void {
    const bits = this.ai0;
    const left = (bits & 1) !== 0;                        // flag3 :41695
    const right = (bits & 2) !== 0;                       // flag4 :41696
    const up = (bits & 4) !== 0;                          // flag5 :41697
    this.local0++;                                        // :41698
    if (!left && !right) this.local0 = 0;                 // :41699-41701
    const landed = this.vy === 0;                         // flag6 = velocity.Y == 0（:41702）
    let num2 = 0;                                         // :41703-41708
    if (!landed) num2 = 10;
    if (up) num2 = 100;
    this.local1 += (num2 - this.local1) * 0.2;            // Lerp(localAI[1],num2,0.2) :41709
    const { bump, vol } = this.thrustEnvelope();          // num3/num4 :41710-41711
    this.updateLoop(game, 'jimsDrone', 0.1, vol,
      remap(this.local1, 0, 100, -1, 1) + bump);          // Pitch :41711 后段
    let num5 = 0.15;                                      // :41713
    if (landed) {
      this.rotation = wrapAngle(this.rotation) * 0.7;     // :41716
      this.vx *= 0.97;                                    // :41717
      if (up) {
        const tv = rotDirVec(this.rotation);              // :41718-41721
        this.vx += tv.x * 0.5;
        this.vy += tv.y * 0.5;
        num5 = 0.05;
      }
    } else {
      const num6 = remap(this.local0, 0, 10, (Math.PI / 15) * 0.1, Math.PI / 15);   // :41722-41724
      const num7 = (right ? 1 : 0) - (left ? 1 : 0);      // :41725
      this.rotation += num7 * num6;                       // :41726
      if (up) {
        const tv = rotDirVec(this.rotation);              // :41728-41732
        this.vx *= 0.97;
        this.vx += tv.x * 0.5;
        this.vy += tv.y * 0.5;
      }
    }
    this.vy += num5;                                      // :41734
    if (!up && this.vy > 12) this.vy *= 0.95;             // :41737-41739
    this.commonTail(game);                                // 钳16/灯/timeLeft（:41740-41743）
    if (!landed) {
      // ---- 落地尘（:41744-41765）：三段 16px 下探净距 ≠48 → 底缘 2×34% 掷
      //      NewDustPerfect(Next(2)==0?31:16, CircularEdge(2.5,1)×0.5 后 Y>0 反号, α127) ----
      const gap = probeGroundGapPx(game.world, this.x, this.y, this.w, this.h, 48);
      if (gap !== 48) {
        for (let j = 0; j < 2; j++) {
          if (Math.random() < 0.66) continue;             // !(NextFloat() < 0.66)
          const edge = circularEdge(2.5, 1);
          let evx = edge.x * 0.5;
          let evy = edge.y * 0.5;
          if (evy > 0) evy *= -1;                         // :41759-41761
          game.spawnDust?.(this.x + this.w / 2, this.y + gap + this.h, 0, 0,
            Math.floor(Math.random() * 2) === 0 ? 31 : 16, evx, evy, 127, null, 1, false, true);
        }
      }
    }
  }

  protected pushTrail(): void {
    this.posRing.push({ x: this.x, y: this.y });
    this.rotRing.push(this.rotation);
    if (this.posRing.length > JimsDroneProj.RING) this.posRing.shift();
    if (this.rotRing.length > JimsDroneProj.RING) this.rotRing.shift();
  }

  /** 绘制（Main.cs:28508 DrawContinuousTrail → :28301-28328 双尾迹 + :33178 通用支
   *  origin(16,14) 旋转画）：
   *  尾迹 = MagicPixel 1×1 段带（宽 4、沿 oldPos 环、×Remap(num2,0,20,1,0) 渐隐;偏移
   *  (10,2)/(−10,2) 按各槽 oldRot 旋）;本体 = Center 旋转 rotation,origin(16,14)。
   *  ★清偿刀 N（2026-09-30）cPet 染料门（Main.cs:28300-28303 逐式）：cPet==0 →
   *  绿带 (177,255,32,127);cPet!=0 → 白带 (255,255,255,255) 过整弹染料 pass——
   *  本仓 = projDye.dyedSolidBand（1×1 白像素过 SM2 pass,MagicPixel 同 UV 恒同
   *  输出=每拍一色 1:1）+ fade 顶点色后乘（v0 可交换域,A2 架构账同尘/翼面;
   *  V0_MID_PASSES 族 fade 相位近似,登记债）;本体经 dyedProjCanvas 逐贴图染
   *  （EntitySpriteDraw×Armor.Apply 等价,compositeLight 全屏乘光=「白烘×染后
   *  光乘」可交换域）。
   *  ★清偿刀 P3-F3（2026-09-30）：fade 序对齐——vanilla oldPos[0]=最新
   *  （Projectile.cs:17252-17264 逐槽下移+[0]=当前）,num4=Remap(num2,0,num,1,0)
   *  （Main.cs:28324）键在段旧端索引 num2=段龄;本环 push 序=尾→头（ring[0] 最旧
   *  反向）⇒ 段龄 = ring.length−i（旧端=ring[i−1]）——旧码 remap(i) 沿尾迹倒置
   *  （机身最暗/尾端最亮,原版相反）。逐段点亮旧码已同相（段数 0,1,…,19 与原版
   *  逐帧全等,Zero 门只跳未填槽）,非独立缺陷。
   *  ★清偿刀 P3-F4：fade 曲线补四通道乘——vanilla baseColor*num4（:28325）rgba
   *  四通道全乘后 (SrcAlpha,InvSrcAlpha)（Main.cs:38678 PrepareDrawnEntityDrawing
   *  BlendState.AlphaBlend）⇒ rgb 有效贡献 ∝ fade²、遮蔽 src.a ∝ fade¹;旧码仅
   *  globalAlpha 乘（贡献 ∝ fade¹,中段 ~2× 偏亮）。本仓取【顶点色×fade 四通道
   *  直乘 fillStyle、globalAlpha 恒 1】= 原版语义逐式对齐（ga=fade·fade 只对齐
   *  rgb 贡献,src.a 会过遮蔽 1−fade² vs 1−fade,弃）。
   *  ★清偿刀 P3-F7：uDirection=entity.direction（ArmorShaderData.cs:109 Apply 尾
   *  entity 覆写,带/体同源）——Projectile.direction 每拍按 AutomaticallyChanges
   *  Direction（Projectile.cs:17387-17401,aiStyle 195 不在豁免表）由 velocity.X
   *  符号重导（:17121-17132,0→+1）;旧码 dir/spriteDir 恒 0→||1 恒 1,向左发射时
   *  渐变族染料方向反。 */
  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(1020);
    const dyeVid = droneDyeVid(this);
    const facing = this.vx < 0 ? -1 : 1;      // ★P3-F7 direction（:17125-17131 逐拍重导）
    const ring = this.posRing;
    if (ring.length > 1) {
      const n = JimsDroneProj.RING;
      const band = dyeVid > 0 ? dyedSolidBand(dyeVid, facing) : null;
      for (const off of [{ x: 10, y: 2 }, { x: -10, y: 2 }]) {
        for (let i = n - 1; i > 0; i--) {
          const a = ring[i];
          const b = ring[i - 1];
          if (!a || !b || (a.x === 0 && a.y === 0)) continue;   // oldPos[i] == Zero 门 :28319
          const ra = this.rotRing[i] ?? 0;
          const rb = this.rotRing[i - 1] ?? 0;
          const ax = a.x + this.w / 2 + (off.x * Math.cos(ra) - off.y * Math.sin(ra));
          const ay = a.y + this.h / 2 + (off.x * Math.sin(ra) + off.y * Math.cos(ra));
          const bx = b.x + this.w / 2 + (off.x * Math.cos(rb) - off.y * Math.sin(rb));
          const by = b.y + this.h / 2 + (off.x * Math.sin(rb) + off.y * Math.cos(rb));
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) continue;
          const rot = Math.atan2(dy, dx) + Math.PI / 2;   // num3 + π/2 :28325
          const fade = remap(ring.length - i, 0, n, 1, 0);   // ★P3-F3 num4=num2 段龄 :28324
          const f = Math.max(0, Math.min(1, fade));
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(rot);
          if (band) {
            // 白带×pass 输出 ×顶点色 fade 四通道（baseColor*num4 :28325,v0 可交换域）
            ctx.fillStyle = `rgba(${Math.round(band[0] * f)},${Math.round(band[1] * f)},${Math.round(band[2] * f)},${((band[3] / 255) * f).toFixed(4)})`;
          } else {
            ctx.fillStyle = `rgba(${Math.round(177 * f)},${Math.round(255 * f)},${Math.round(32 * f)},${((127 / 255) * f).toFixed(4)})`;
          }
          ctx.fillRect(-2, -len, 4, len);                 // origin(0.5,1) scale(4,y) :28327
          ctx.restore();
        }
      }
    }
    if (!img || !(img.width > 0)) return;
    const bodyTex = dyeVid > 0
      ? (dyedProjCanvas(img, 0, 0, img.width, img.height, dyeVid,
        { facing, box: { x: this.x, y: this.y, w: this.w, h: this.h } }) ?? img)
      : img;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    // origin(16,14)：:33178-33180 显式 origin24.Y=14f（32×20 贴图,锚点低于几何心 4px）
    ctx.drawImage(bodyTex as CanvasImageSource, -img.width / 2, -14);
    ctx.restore();
  }
}

// ============================================================================
// 弹 1105 RemoteControlCar（AI_205_RemoteControlCar Projectile.cs:38768-39169）
// ============================================================================
export class RemoteControlCarProj extends DroneBase {
  /** 上拍跳键（ai[0] bit4 的 AI 头回读 :38791-38792——本仓直接持上一拍输入） */
  private prevJump = false;
  /** 墙爬模式（ai[0] bit5 :38793/:38822——跳边沿翻转） */
  private wallMode = false;

  constructor(cx: number, cy: number, vx: number, vy: number) {
    super(1105, cx, cy, vx, vy);
  }

  protected get heldVid(): number {
    return 5738;
  }

  /** 输入字节（:38791-38824）：bit0..3 同无人机（^gravDir）+ bit4=controlJump +
   *  bit5=墙爬 mode。跳边沿（:38795-38809）：!prev && jump && velocity.Y != 0（AI
   *  入口速度=上拍碰后）→ 音 22（case22=Unlock,LegacySoundPlayer.cs:940-949）+
   *  尘 226×2（noLightEmittance/scale 0.6/noGravity）+ mode 翻转。 */
  protected assembleInput(game: GameHooks): number {
    const p = game.player;
    // 跳边沿（:38795-38809）：!prev && jump && velocity.Y != 0（AI 入口速度=上拍
    // 碰后）→ 音 22 + mode 翻转 + 尘 226×2——原版 flag3 翻转【先】于 bitsByte2[5]
    // 装配（:38798 → :38822）,本拍字节带新值
    if (!this.prevJump && p.inputJump && this.vy !== 0) {
      game.playSfx?.('unlock');                           // SoundEngine.PlaySound(22) :38797
      this.wallMode = !this.wallMode;                     // flag3 = !flag3 :38798
      for (let i = 0; i < 2; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 226, 0, 0, 0, null, 0.6, true);
        if (d) d.noLightEmittance = true;                 // :38800-38805
      }
    }
    this.prevJump = p.inputJump;
    const flip = p.gravDir === -1;
    const left = (!!p.inputLeft) !== flip;
    const right = (!!p.inputRight) !== flip;
    return (left ? 1 : 0) | (right ? 2 : 0) | (p.inputUp ? 4 : 0) | (p.inputDown ? 8 : 0)
      | (p.inputJump ? 16 : 0) | (this.wallMode ? 32 : 0);
  }

  /** 原版 blockType()（Tile.cs:204-214）：halfBrick→1,slope s>0→s+1,否则 0 */
  private blockTypeAt(game: GameHooks, px: number, py: number): number {
    const st = game.world.store;
    const i = Math.floor(px / TILE);
    const j = Math.floor(py / TILE);
    if (!st.inBounds(i, j)) return 0;
    const k = st.idx(i, j);
    if (st.half[k]) return 1;
    const s = st.slope[k];
    return s > 0 ? s + 1 : 0;
  }

  /** Framing.GetTileSafely(...).wall > 0（:38839-38841 墙态采样） */
  private wallAt(game: GameHooks, px: number, py: number): boolean {
    const st = game.world.store;
    const i = Math.floor(px / TILE);
    const j = Math.floor(py / TILE);
    if (!st.inBounds(i, j)) return false;
    return st.wall[st.idx(i, j)] > 0;
  }

  /** AI_205 本体（:38828-39169 逐行）。位语义：flag5=left flag6=right flag7=up
   *  flag8=down flag9=jump flag10=mode;flag11=四向任一 :38834。 */
  protected aiBody(game: GameHooks): void {
    const bits = this.ai0;
    const left = (bits & 1) !== 0;
    const right = (bits & 2) !== 0;
    const up = (bits & 4) !== 0;
    const down = (bits & 8) !== 0;
    const jump = (bits & 16) !== 0;
    const mode = (bits & 32) !== 0;
    const anyDir = left || right || up || down;           // flag11 :38834
    this.local0++;                                        // :38835
    if (!up && !down) this.local0 = 0;                    // :38836-38838（车=俯仰键计数）
    // ---- 墙态采样（:38839-38841）：flag12=oldPosition 中心墙&mode;flag13=Center 墙&mode ----
    const ox = this.oldX ?? this.x;
    const oy = this.oldY ?? this.y;
    const oldWall = this.wallAt(game, ox + this.w / 2, oy + this.h / 2) && mode;
    const ctrWall = this.wallAt(game, this.cx, this.cy) && mode;
    const floorBranch = !ctrWall;                         // num2 = !flag13 :38842
    if (ctrWall) {
      // ---- 墙爬支（:38844-39008）----
      const turnRate = (up || down) ? 0.037699115 : 0.07539823;   // num3 :38847
      const thrust = ((up ? 1 : 0) - (down ? 1 : 0)) * 0.275;     // num4 :38848
      this.rotation += ((right ? 1 : 0) - (left ? 1 : 0)) * turnRate;   // :38849
      const tv = { x: Math.cos(this.rotation), y: Math.sin(this.rotation) };
      this.vx += tv.x * thrust;                           // :38850
      this.vy += tv.y * thrust;
      this.vx *= 0.96;                                    // :38851
      this.vy *= 0.96;
      if (this.frame < 4) {                               // :38852-38861 落墙过渡
        this.vx *= 0.5;
        this.vy *= 0.5;
        this.frame = 4;
        if (this.dir === -1) this.rotation += Math.PI;
        this.dir = 1;
        this.spriteDir = 1;
      }
      let frameTick = 999999;                             // num5 :38863（|v| 分档）
      const spd = Math.hypot(this.vx, this.vy);           // num6 :38864
      if (spd >= 0.02) frameTick = 16;
      if (spd >= 0.2) frameTick = 12;
      if (spd >= 0.5) frameTick = 10;
      if (spd >= 0.8) frameTick = 8;
      if (spd >= 1.5) frameTick = 6;
      if (spd >= 3) frameTick = 3;
      if (spd >= 6) frameTick = 2;
      if (spd >= 9) frameTick = 1;
      if (anyDir) frameTick = 1;
      if (++this.frameCounter >= frameTick) {             // :38898-38905 螺旋桨帧 4..6
        this.frameCounter = 0;
        if (++this.frame >= 7) this.frame = 4;
      }
      this.spriteDir = 1;                                 // :38906
      this.dir = 1;
      let dustP = 0;                                      // num7 :38907
      if (thrust !== 0) dustP = 3;
      else if (spd > 0.2) dustP = 6;
      else if (anyDir) dustP = 2;
      if (dustP !== 0) {                                  // :38915-38928 侧缘尘
        let vec = { x: this.vx, y: this.vy };
        if (spd < 0.2) vec = { x: tv.x * -4, y: tv.y * -4 };        // :38921-38923
        const jit = () => circular(0.3, 0.3);
        if (Math.floor(Math.random() * dustP) === 0) {
          const ox2 = -15 * Math.cos(this.rotation) - (-10) * Math.sin(this.rotation);
          const oy2 = -15 * Math.sin(this.rotation) + (-10) * Math.cos(this.rotation);
          const j = jit();
          game.spawnDust?.(this.cx + ox2, this.cy + oy2, 0, 0, 31,
            vec.x * 0.2 + j.x, vec.y * 0.2 + j.y, 127, null, 1, false, true);
        }
        if (Math.floor(Math.random() * dustP) === 0) {
          const ox2 = -15 * Math.cos(this.rotation) - 10 * Math.sin(this.rotation);
          const oy2 = -15 * Math.sin(this.rotation) + 10 * Math.cos(this.rotation);
          const j = jit();
          game.spawnDust?.(this.cx + ox2, this.cy + oy2, 0, 0, 31,
            vec.x * 0.2 + j.x, vec.y * 0.2 + j.y, 127, null, 1, false, true);
        }
      }
      this.local1 += ((anyDir ? 100 : 0) - this.local1) * 0.2;     // :38930-38933
      const { bump, vol } = this.thrustEnvelope();        // num11/num12 :38934-38935
      this.updateLoop(game, 'rcCar', 0.015, vol,
        remap(this.local1, 0, 100, -1, 1) + bump);
      if (this.vy === 0) this.vy = 0.0001;                // :39005-39007（防贴墙滞速归零）
    }
    if (floorBranch) {
      // ---- 地面支（:39009-39147）----
      const grounded = this.vy === 0;                     // flag15 :39010
      let thrustLvl = 0;                                  // num13 :39011-39017
      if (anyDir) {
        thrustLvl = 100;
        if (!grounded) thrustLvl = 10;
      }
      this.local1 += (thrustLvl - this.local1) * 0.2;     // :39019
      const { bump, vol } = this.thrustEnvelope();        // num14/num15 :39020-39021
      this.updateLoop(game, 'rcCar', 0.015, vol,
        remap(this.local1, 0, 100, -1, 1) + bump);
      let grav = 0.3;                                     // num16 :39033
      if (grounded) {
        let slopeRot = 0;                                 // value3 :39035
        const btL = this.blockTypeAt(game, this.x, this.y + this.h + 0.02);   // :39036-39037
        const btR = this.blockTypeAt(game, this.x + this.w, this.y + this.h + 0.02);
        if (btL === 2) slopeRot = Math.PI / 4;            // slope1 :39038-39040
        if (btR === 3) slopeRot = -Math.PI / 4;           // slope2 :39041-39043
        // rotation = Lerp(WrapAngle(rotation), value3, 0.3)（:39044）
        const wr = wrapAngle(this.rotation);
        this.rotation = wr + (slopeRot - wr) * 0.3;
        this.vx *= 0.97;                                  // :39045
        let dirIn = 0;                                    // num17 :39046-39051
        if (left) dirIn = -1;
        if (right) dirIn = 1;
        if (dirIn !== 0) {
          if (this.spriteDir !== dirIn) this.local1 = 0;  // :39052-39053（转头推力档清零）
          this.spriteDir = dirIn;
          this.dir = dirIn;                               // :39054
        }
        if (jump) {                                       // :39055-39059
          const jv = rotDirVec(this.rotation);
          this.vx += jv.x * 6;
          this.vy += jv.y * 6;
          grav = 0;
        }
      } else if (!mode) {
        // 空中俯仰（:39060-39067）：up/down 差 × π/15（ramp 按 local0）× spriteDirection
        const num18 = remap(this.local0, 0, 10, (Math.PI / 15) * 0.1, Math.PI / 15);
        const num19 = (up ? 1 : 0) - (down ? 1 : 0);
        this.rotation += num19 * num18 * this.spriteDir;
      }
      if (oldWall && !ctrWall) {                          // flag12 && !flag13 :39068-39071
        this.vx *= 1.5;
        this.vy *= 1.5;
        this.rotation = wrapAngle(this.rotation);
      }
      const flag16 = (!grounded && this.frame >= 4) && mode;   // :39072
      if ((grounded || !mode) && this.frame >= 4) {       // :39073-39081 轮档复位
        if (!grounded && this.vx < 0) {
          this.spriteDir = -1;
          this.dir = -1;
          this.rotation += Math.PI;
        }
        this.frame = 0;
      }
      const avx = Math.abs(this.vx);                      // num20 :39082
      let frameTick = 99999999;                           // num21 :39083-39115
      if (avx >= 0.02) frameTick = 16;
      if (avx >= 0.2) frameTick = 12;
      if (avx >= 0.5) frameTick = 10;
      if (avx >= 0.8) frameTick = 8;
      if (avx >= 1.5) frameTick = 6;
      if (avx >= 3) frameTick = 3;
      if (avx >= 6) frameTick = 2;
      if (avx >= 9) frameTick = 1;
      if (anyDir) frameTick = 1;
      if (!flag16 && ++this.frameCounter >= frameTick) {  // :39117-39124 轮帧 0..3
        this.frameCounter = 0;
        if (++this.frame >= 4) this.frame = 0;
      }
      this.vy += grav;                                    // :39125
      const accel = grounded ? 0.3 : 0.1;                 // num22 :39126
      if (left) this.vx -= accel;                         // :39127-39132
      if (right) this.vx += accel;
      // WalkDownSlope（:39133-39136,活性门=velocity.Y===gravity 原文字面）——本仓
      //  walkDownSlopePre 'gravity' 档（gField=num16 字面门同相）;shim Body 只承载
      //  vy 编辑,stepUp=true 仅为过 walkDownSlopePre 的 stepUp 门（真实 moveAndCollide
      //  走 fixedUpdate 独立 body,stepUp 缺省=无 StepUp/StepDown）
      const shim = {
        x: this.x, y: this.y, w: this.w, h: this.h,
        vx: this.vx, vy: this.vy,
        onGround: false, hitWall: false, hitHead: false,
        stepUp: true, stepDownGate: 'gravity' as const, gField: grav,
      };
      walkDownSlopePre(shim, game.world, false);
      this.vy = shim.vy;
      if (grounded && anyDir) {                           // :39138-39167 轮后尘
        const gap = probeGroundGapPx(game.world, this.x, this.y, this.w, this.h, 48);
        if (gap !== 48) {
          for (let k = 0; k < 2; k++) {
            if (Math.random() < 0.66) continue;
            const edge = circularEdge(2.5, 1);
            let evx = edge.x * 0.5;
            let evy = edge.y * 0.5;
            if (evy > 0) evy *= -1;                       // :39156-39158
            game.spawnDust?.(this.x + this.w / 2 - 11 * this.spriteDir, this.y + gap + this.h,
              0, 0, 31, evx, evy, 127, null, 1, false, true);
          }
        }
      }
    }
    this.commonTail(game);                                // :39150-39169（钳16/灯/timeLeft）
  }

  protected pushTrail(): void {
    // TrailingMode[1105] = −1（ProjectileID.cs:385 不在表）→ oldPos 环不推进
  }

  /** 绘制（宠物帧支 Main.cs:33697-33698 → :33775-33784 位移门 → :34210 通用画）：
   *  帧 = 七帧竖带 Frame(1,7,0,frame)（56×266 → 每帧 56×38）;位 = Center + (0,
   *  −2 + (ground ? 4×GetLerpValue(0,π/4,|rot|) : 4));旋转 = rotation;origin(28,19);
   *  dir=FlipHorizontally ⇔ spriteDirection==−1（:30529-30532）。
   *  ★清偿刀 N：switch 覆写 1105 → cPet（Main.cs:22457-22464 无 damage/minion 门）
   *  ——本体帧逐贴图过染料 pass（EntitySpriteDraw×Armor.Apply 等价,t0Rect=帧行
   *  源矩形）;TrailingMode[1105]=−1 无尾迹面。 */
  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(1105);
    if (!img || !(img.width > 0)) return;
    const fw = img.width;                                 // 56
    const fh = img.height / 7;                            // 38
    const dyeVid = droneDyeVid(this);
    const frameTex = dyeVid > 0
      ? (dyedProjCanvas(img, 0, this.frame * fh, fw, fh, dyeVid,
        { facing: this.spriteDir || 1, box: { x: this.x, y: this.y, w: this.w, h: this.h } }) ?? img)
      : img;
    const grounded = this.vy === 0;
    const yOff = -2 + (grounded
      ? 4 * Math.max(0, Math.min(1, Math.abs(this.rotation) / (Math.PI / 4)))
      : 4);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.cx, this.cy + yOff);
    ctx.rotate(this.rotation);
    if (this.spriteDir === -1) ctx.scale(-1, 1);
    if (frameTex !== img) ctx.drawImage(frameTex as CanvasImageSource, 0, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
    else ctx.drawImage(img, 0, this.frame * fh, fw, fh, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }
}
