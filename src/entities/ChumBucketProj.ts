// 打窝桶投掷物(Projectile 820,AI_163_Chum Projectile.cs:54413-54547)。
// Item 4608（Item.cs:38234-38246 useStyle1/shootSpeed7/shoot820/18×20/consumable/
// UseSound Item1/useTime=useAnimation19/noMelee）；弹 SetDefaults :8021-8031
// ——12×12/friendly/aiStyle163/tileCollide true/netImportant/penetrate −1/timeLeft 86400。
//
// 生产者接线（本文件 = chumBucket.ts 注册面的【活数据源】）：
//   每 tick `if (ai[0] < 10 && timeLeft > 60)` 门内 :54538-54546
//   spot = Center + UnitY*16 → chumReport(spot)；rx..rh 上报本弹矩形
//   （NPC.SharkSpawnChance 的 Collision.CanHit 面，消费端 world/spawn/VanillaSpawner.ts;
//    GetFishingPondState 渔力累进 +11/+6/+3 消费端 Bobber.getFishingPondState→chumsInTile）
//   ——chumOnPreUpdateAll 双缓冲翻转由 Game 每 tick 在实体更新前调用
//   （Main.cs:17721 OnPreUpdateAllProjectiles 同位次）。
// 物理（AI_163 :54413-54503）：
//   · 同型互斥：1000 内同 type 弹心差 |dx|+|dy| < width/2 时按方向 ±0.05 推开
//   · wet 分支：vx×0.9、vy>0 时 vy×0.5；Center 钉 GetWaterLine 液面（低于液面 →
//     vy−0.1 下限 −8,快到线则收敛 vy=line−cy；高于液面(含 vy≤0)→ 直接 vy=line−cy）
//   · dry 分支：vy==0 时 vx×0.95;恒 vx×0.98；vy+0.3 终端 15.9
//   · scale = lerp(timeLeft,60,0)（最后 1s 缩没）;rotation += vx×0.14
//   · frame 出生 rand(4)（AI_163 :54531-54534 frameCounter==0 首拍门）——贴图资产
//     Projectile_820.png 为 12×56 竖排 4 帧格（12×14/格,Main.cs:8591 projFrames[820]=4）
//   · 出生动量出自射速 7 朝鼠标(ItemCheck_Shoot 向量式)
//
// ★2026-08-30 红队 A-5 复核【驳回】——"撞实心即 Kill"不成立,驻留才是原版真态：
//   HandleMovement 碰撞响应 if(flag) 链 :18097..:18509 共 19 支,末支条件显式
//   `type != 1036 && type != 500 && type != 820 && aiStyle != 160 && …`(:18509-18510,
//   1456 同构 :16986)——排除后对 820 【无一分支可达】,链内最深层的通用
//   `else { position += velocity; Kill(); }`(:19964-19967,位于 :18747
//   `type!=308&&type!=377&&type!=966` 支的内层子链,红队误引为 :19952-19955 且误判其
//   可达性)对 820 同样死路。碰撞的实际效果只剩 TileCollision 把撞面速度分量清零
//   → 弹体贴面驻留;Kill 仅由 timeLeft 自然衰减收口(SetDefaults timeLeft=86400,
//   AI_163 自身无 Kill;ai[0]>=10 时才经 ReduceRemainingChumsInPool :54652 钳
//   timeLeft=60 缩没)。岸上桶 spot=Center+UnitY*16 恰落在承托【实心格】→ 消费端
//   GetFishingPondState 只逐液格累计(:21722)/SharkSpawnChance 只扫液柱水面点
//   (NPC.cs:5567-5572)→ "岸上一格水边白吃渔力"不成立——AI_163 的上报本身无 wet 门
//   (:54539-54546 直呼 AddChumLocation),过滤全在消费侧,本仓同构(chumReport 无门,
//   Bobber/VanillaSpawner 两侧各自带原版过滤)。
// 登记偏差：泡沫 gore(1201/1208)与浮泡粒子未接 GorePiece 表——以 spawnParticles 最小
//   视觉近似;同型互斥扫描按 game.projectiles() 只读桶等价(原版 Main.projectile 全扫)。
//
// ★通用湿段接入（2026-09-04 弹幕湿段缺口批,projWetSection.ts 共享体 1:1）：
//   820 非 ignoreWater 豁免(SetDefaults :8021-8031 逐块无 ignoreWater 行=原版缺省
//   false;数据面 PROJ_IGNORE_WATER 262 id 集缺 820 行,运行时
//   !!projectileData(820)?.ignoreWater 复核)。位序 = 原版 Update:AI_163(读【上拍】
//   旗)→ 湿段 :16903-17113 → HandleMovement(湿阻尼 :17721-17764 只削位移——本类
//   直积分宿主,阻尼乘进 x+=/y+= 位移行)。★AI_163 自身入水物理(:54439-54494)与
//   通用湿段溅花【两支都跑,一支不裁】:AI 分支消费上拍 wet 字段做 vx×0.9/vy×0.5/
//   液面收敛;湿段在 AI 后当拍采样做入/出水溅花(10 粒)+四旗维护——首拍 AI 读的
//   字段 = NewProjectile :10886-10892 出生预置(spawnPresetWet 在 AI 前补做)。
//   原"弹心格 liquid"内联湿判定退役(原版 wet=盒 WetCollision,Collision.cs:1578
//   缩减盒 10×h/2 中心带,且为逐拍维护字段非当拍重测);液面线同步换 AI_061_
//   FishingBobber_GetWaterLine(:54805-54830)逐值 1:1——三档窗 [Y-1,Y,Y+1] 同式
//   line=(行+1)*16−trunc(liquid/16)+全空档回退 num6=position.Y+height(盒底);
//   ★共享 getWaterLine 的 found=false 门(深处 tx,ty-2 有液/边缘/超浅)原版无此
//   分支——深桶原版照拉收敛线上浮至液面(逐相阶梯收敛),旧版放任下沉=偏差,随
//   本批复位。AI_163 wet 分支头部的 direction/tile 空守卫块(:54444-54457)为死码
//   (num3/num4 重赋值前无读),不移植。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { wetCollision } from './npcLiquid';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { chumReport } from './chumBucket';

export class ChumBucketProj extends Entity {
  w = 12; h = 12;
  dead = false;
  readonly projId = 820;
  /** 原版 timeLeft 86400t（一整天）——中文面打一次窝几乎不自然消散,Kill 主靠移出界 */
  life = 86_400;
  rot = 0;
  frame = 0;

  // ---- ★通用湿段旗（ProjWetFlags 同名承载面,projWetSection.ts 共享体消费;
  //      Projectile 同名字段——820 无 ignoreWater 豁免,全员受段）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步 −1） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10892） */
  presetDone = false;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.frame = (Math.random() * 4) | 0;
  }

  /** NewProjectile 出生预置（Projectile.cs:10886-10892 逐值 1:1）：出生盒
   *  WetCollision 首测 + honey/shimmer 静态旗;★原版此点【不设】lavaWet（粘滞
   *  首档由首拍 Update 湿段 :16906 并入——共享体常规段承接）;ignoreWater 仅清
   *  wet（:10888-10890）,honey/shimmer 不随豁免清（原文字面,820 恒走 r.wet 支）。
   *  时点 = 首拍 AI【前】（AI_163 首拍即消费 wet 旗）;出生位 = 构造位（首拍
   *  位移前同位 ✔ = 原版 NewProjectile 采样时点）。 */
  private spawnPresetWet(st: TileStore): void {
    if (this.presetDone) return;
    this.presetDone = true;
    const r = wetCollision(st, this.x, this.y, this.w, this.h);
    this.wet = !!projectileData(this.projId)?.ignoreWater ? false : r.wet;   // :10887-10890
    this.honeyWet = r.honey;                                                 // :10891
    this.shimmerWet = r.shimmer;                                             // :10892
  }

  /** AI_061_FishingBobber_GetWaterLine（Projectile.cs:54805-54830,逐值 1:1）：
   *  三档窗 [Y-1,Y,Y+1]（Y=(int)Center.Y/16,X=(int)Center.X/16）同式
   *  line=(液体行+1)*16 − trunc(liquid/16)（C# int 除）;三档全空回退
   *  num6 = position.Y + height（盒底）。★原版无"found"门——深处/边缘照拉
   *  收敛线（深桶逐相阶梯上浮至液面 = 原版本相,旧 getWaterLine found 门退役）。 */
  private waterLine(st: TileStore): number {
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    const liq = (x: number, y: number): number => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0);
    const lAbove = liq(tx, ty - 1);
    if (lAbove > 0) return ty * TILE - Math.trunc(lAbove / 16);          // :54820-54824
    const lHere = liq(tx, ty);
    if (lHere > 0) return (ty + 1) * TILE - Math.trunc(lHere / 16);      // :54825-54828
    const lBelow = liq(tx, ty + 1);
    if (lBelow > 0) return (ty + 2) * TILE - Math.trunc(lBelow / 16);    // :54829-54832
    return this.y + this.h;                                              // :54807 回退=盒底
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    // ---- 出界防巡游（tile 越界即杀;原版由世界边缘 Kill 兜底）----
    const cxT = Math.floor(this.cx / TILE), cyT = Math.floor(this.cy / TILE);
    if (!st.inBounds(cxT, cyT)) { this.dead = true; return; }   // 原版界外 :16793-16802 早退,湿段同跳=原版同态
    if (--this.life <= 0) {
      // ★⑥杀拍口径（2026-09-06 湿段配方推广）：原版 timeLeft--/Kill 在子步【末尾】
      //  （:17307-17311,AI(:16880)→湿段(:16895)→位移→Damage 之后）→ 寿命尽当拍湿段
      //  照跑（`!active` 门 :17132 只拦 Damage/尾尘）。本仓递减杀在拍头曾整体跳过
      //  湿段;现补跑,测位=存储位：AI_163 只写 velocity/rotation 不写 position →
      //  原版杀拍湿段测位=上拍位移末位=存储位,逐值等价。杀支与 AI 尾活拍调用点
      //  同拍互斥（早退）→ 无需 wetSectionRan 旗;820 ∉ IsDestroyedByWater 六型/
      //  非 80 → 段内无补 Kill 面。
      projectileWetSection(this, game, st, this.x, this.y, this.w, this.h,
        this.projId, !!projectileData(this.projId)?.ignoreWater);
      this.dead = true;
      return;
    }
    // ---- 出生预置（NewProjectile :10886-10892,首拍 AI 前同位首测——AI_163 首拍即消费 wet 旗）----
    this.spawnPresetWet(st);
    // ---- 同型互斥推挤（AI_163 :54415-54437）：|dx|+|dy| < w/2 → 按相对方位 ±0.05 ----
    const others = game.projectiles?.() ?? [];
    for (const o of others) {
      const ob = o as unknown as { projId?: number; x?: number; y?: number; dead?: boolean };
      if (!ob || ob === (this as unknown) || ob.dead || ob.projId !== 820) continue;
      const dx = this.x - (ob.x ?? 0), dy = this.y - (ob.y ?? 0);
      if (Math.abs(dx) + Math.abs(dy) >= this.w / 2) continue;
      if (dx < 0) this.vx -= 0.05; else this.vx += 0.05;
      if (dy < 0) this.vy -= 0.05; else this.vy += 0.05;
    }
    // ---- 湿身悬浮 vs 干抛物理（:54439-54502,AI_163 消费【上拍】wet 字段）----
    // ★wet = 原版逐拍维护字段（上拍湿段终值/出生预置）非当拍重测——本仓旧
    //   "弹心格 liquid" 内联近似退役（WetCollision=盒 10×h/2 中心带,非弹心单格）
    if (this.wet) {
      this.vx *= 0.9;                                    // :54440
      if (this.vy > 0) this.vy *= 0.5;                   // :54460-54462
      const wl = this.waterLine(st);                     // num6（:54805 三档+回退,无 found 门）
      if (this.cy > wl) {                                // :54472-54481
        this.vy -= 0.1;
        if (this.vy < -8) this.vy = -8;
        if (this.cy + this.vy < wl) this.vy = wl - this.cy;
      } else {
        this.vy = wl - this.cy;                          // :54482-54485 else 直拉
      }
    } else {
      if (this.vy === 0) this.vx *= 0.95;                // :54487-54497
      this.vx *= 0.98;
      this.vy += 0.3;
      if (this.vy > 15.9) this.vy = 15.9;
    }
    // ---- 自旋（:54522 rotation += vx*0.14）----
    this.rot += this.vx * 0.14;
    // ---- 入水泡沫最小视觉（gore 1201/1208 未建表——spawnParticles 近似,登记偏差;
    //      湿源随本批从 liqHere 换 this.wet 同步退役）----
    if (this.wet && Math.random() < 0.05) {
      game.spawnParticles?.(this.x + 6, this.y + this.h,
        'rgba(220,240,255,0.55)', 1, 0.7,
        { life: 20, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random(), damp: 0.96 });
    }
    // ---- chum 注册（AI_163 :54536-54546）----
    // ai[0]<10 && timeLeft>60 门内 AddChumLocation(spot)：spot=Center+UnitY*16。
    // 原版 ai[0] 出生 0 且 AI 内无人递增（NewProjectile default 全零）→ 门恒真,
    // 与 vanilla 同态=timeLeft 降过 60 前（本体后半段缩小窗）每 tick 上报。
    const timeLeftV = this.life;           // 原版 timeLeft（双缓冲读侧拿到的是上帧计数）
    if (timeLeftV > 60) {
      chumReport(this.cx, this.cy + 16, this.x, this.y, this.w, this.h);
    }
    // ---- ★通用湿段（:16903-17113 全体弹共用段,projWetSection.ts 共享体 1:1）----
    // 位序 = 原版 Update:AI_163（读上拍旗）→ 本段 → HandleMovement（阻尼在下方
    // 位移行）。★AI_163 自身入水物理与通用湿段溅花两支都跑（原版同构,一支不裁）：
    // AI 分支上面已跑（上拍旗）;本段当拍采样做入/出水溅花（10 粒,wetCount==0 门）
    // + 四旗置位/三清 + wetCount 冷却窗——溅花尘/音由共享体 wetSplashStepShared
    // 承载,本类不自写。820 无 SetDefaults 特支、不在 IsDestroyedByWater 六型 →
    // 各钩缺省。采样位 = AI 后位移前 = 上拍移动结算位 ✔ 原版湿段同位。
    projectileWetSection(this, game, st, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // scale 缩没段仅视觉（lerp(timeLeft,60)）——画侧 s 由 drawScale 承载
    // ---- 位移（撞实心贴面驻留=原版真态,无 Kill——见文件头 ★A-5 裁决）----
    // 竖撞以【底缘】跨行探测钉合块面（原版 TileCollision 以整盒对格面 clamp 并清零
    // 撞面分量——探测用【全场速度】,原版 TileCollision 同）;曾用"下一中心格"探测
    // ——快落下坠时半身沉入块内 1-2 帧、慢落末段每 ~20 拍回跳一次的锯齿抖动。
    if (this.vy > 0) {
      const fx = Math.floor(this.cx / TILE);
      const feet = Math.floor((this.cy + this.vy + this.h / 2) / TILE);
      if (st.inBounds(fx, feet) && st.isActive(fx, feet)) {
        this.y = feet * TILE - this.h;                      // 底缘(=y+h)恰贴格顶,零间隙静置
        this.vy = 0;
      }
    } else {
      const nx = this.cx + this.vx, ny = this.cy + this.vy;
      const tnx = Math.floor(nx / TILE), tny = Math.floor(ny / TILE);
      if (st.inBounds(tnx, tny) && st.isActive(tnx, tny)) { // 顶壁/侧壁推进:分量归零停摆
        this.vx = 0;
        this.vy = 0;
      }
    }
    // ★水中位移阻尼（HandleMovement :17721-17764 wetVelocity = velocity×档位
    //   0.5 水/0.25 蜂蜜/0.375 微光/1 干——速度【场】不减、只削当拍位移;读【本拍
    //   刷新后】旗 = 湿段 :16903 已先于本位跑）。直积分宿主：阻尼乘进 x+=/y+=
    //   位移行（速度场原样,无除回）。
    const drag = projWaterDragFactor(this);
    this.x += this.vx * drag;
    this.y += this.vy * drag;
  }

  get drawScale(): number {
    return Math.max(0, Math.min(1, this.life / 60));
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    // 懒加载通道(lazyload-guards):ensureVImage miss 返 null→本帧早退,下帧自愈;禁直取贴图表
    const img = r.atlas.ensureVImage?.('vanilla/Projectile_820.png') ?? null;
    if (!img || !img.width) return;
    // 竖排 4 帧（Main.cs:8591 projFrames[820]=4;真资产 12×56 → 帧格 12×14）。原版
    // 弹体绘制 = 帧矩形 Rectangle(0, fh*frame, texW, fh) + 帧心原点(EntitySpriteDraw
    // origin=(w/2,fh/2))绕 Center 旋转缩放——此前整图压进 12×12 盒(A-6)
    const fh = img.height / 4;
    const fr = Math.max(0, Math.min(3, this.frame));
    const s = Math.max(0.02, this.drawScale);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.drawImage(img, 0, fr * fh, img.width, fh,
      (-this.w / 2) * s, (-fh / 2) * s, this.w * s, fh * s);
    ctx.restore();
  }
}
