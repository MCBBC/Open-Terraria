// 滚石弹（原版 Projectile 99 aiStyle=25 RollingBall 家族）：Check2x2 摧毁巨石
// 贴图时生成（WorldGen.cs:49171-49235 各 sheet 一张 NewProjectile 表，表值经
// BoulderMech.BOULDER_CONVERT_TABLE 查询）。
// AI 常量（Projectile.cs aiStyle==25 主链 26358-26734 的非 1055/1021 通用支）：
//   重力 +0.3/t、vy 帽 16；vy<=6 时横向加速 ±0.05 至 |vx|>=7（无地面摩擦——
//   原版滚动不停站）；rotation += vx*0.06；宽高 31、penetrate=-1、
//   friendly+hostile 双面命中、每目标免疫 10t（usesLocalNPCImmunity +
//   localNPCHitCooldown，Projectile.cs:10755-10762）。贴墙 X 碰撞无独立碎裂规则
//   （TileCollision 清 vx 后仍被 accel 推进；getgood 才 BoulderExplosion）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { moveAndCollide } from '../physics/TileCollision';
import { BOULDER_CONVERT_TABLE } from '../world/BoulderMech';
import { projSprite } from './Arrow';
import { beeWallPushDir } from './WeaponProj';   // SW-AF1 2026-09-04（F-3）：1047 滚石踢墙门单源化（与 655/99 同摄取器）
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE_DEFS } from '../data/tiles';
import { shimmerBlockFx } from '../fx/orchestraFx';

const KB_X = 10;               // 出生 kb 第二参 = 10f

/** Main.hslToRgb(h,s,l)（Main.cs:48689-48717 + hue2rgb :48737-48757 直译,浮点 0..1 出）。
 *  ★SW-BJ64b：仅 1047 彩虹光消费（s=1,l=0.6 → 每通道 0.2..1.0 浮点,addLight 端 >1 合法,
 *  原版 Lighting.AddLight 即收 >1 值,出口钳 255=LightingEngine present 截断同向）。 */
function hslToRgb1457(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    if (c < 0) c += 1;
    if (c > 1) c -= 1;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  if (s === 0) return [l, l, l];
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t1 = 2 * l - t2;
  return [hue2rgb(h + 1 / 3, t1, t2), hue2rgb(h, t1, t2), hue2rgb(h - 1 / 3, t1, t2)];
}

/** ★SW-BJ64b 切片金标（Main.cs:33209 `Frame(5,20, proj.frame/20, proj.frame%20)`——
 *  Utils.cs:1389 Frame 直译：cell = (W/5×frameX, H/20×frameY, W/5, H/20)。1458 :33215
 *  同值）。Projectile_1047.png 95×380 → 19×19 壳 ×(5 列色相带 × 20 行微光相)。
 *  导出=金标测试消费（tests/sw-bj64b-frames.test.ts），draw() 同源调用=测的就是跑的。 */
export function rainbowBoulderCell(
  frame: number, texW = 95, texH = 380,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = texW / 5, sh = texH / 20;
  const f = ((frame % 100) + 100) % 100;
  return { sx: sw * Math.floor(f / 20), sy: sh * (f % 20), sw, sh };
}

/** ★SW-BJ64b 拖尾光金标（P.cs:26420-26435;1458 :26421 同值）：hue =
 *  ((GlobalTimeWrappedHourly×120)%300)/300 → hsl(hue,1,0.6) 基色 ×1.4（vector23）×
 *  (1−i/10)（num208=Utils.Remap(i/len,0,1,1,0) 线性 × num207²≡1）。gtw=运行秒%3600。
 *  导出=金标测试+fixedUpdate/draw 同源。 */
export function rainbowBoulderLight(
  gtw: number, i: number, trailLen = 10,
): [number, number, number] {
  const [r, g, b] = hslToRgb1457(((gtw * 120) % 300) / 300, 1, 0.6);
  const f = 1.4 * (1 - i / trailLen);
  return [r * f, g * f, b * f];
}

export class RollingBoulder extends Entity {
  w = 31; h = 31;
  /** 原版弹 id（Atlas: vanilla/Projectile_{id}.png） */
  readonly projId: number;
  /** timeLeft 基线（vanilla-projectiles.json 无覆盖 → 引擎通用 life 兜底同位） */
  life = 3600;
  /** 出生表伤害 */
  readonly dmg: number;
  rotation = 0;
  /** 每目标命中免疫：目标 id → 剩余 tick（localNPCHitCooldown=10 镜像） */
  private immunities = new Map<number, number>();

  // ---- ★通用湿段（Projectile.cs:16903-17113 全体弹共用段,2026-09-04 溅花缺口批
  //  → projWetSection 共享体接入;豁免核对（SetDefaults 逐 id,ignoreWater=缺行）：
  //  · :1835-1852 共块 {99,727,1013,1014,1053,1054,1055,1057} 无 ignoreWater 行 → 受段
  //  · 1048 :9930-9939 无行 → 受段;1047 :9920-9929 `ignoreWater=true`@:9928 → 豁免
  //    （共享体整段门早退,四旗恒 false,溅花/阻尼零触发——与原版 :16903 同向）
  //  · 1002（sheet 654 大石柱仙人掌球）:9525-9539 无行 → 受段（注：原版 1002 是
  //    aiStyle 16 弹,本类按既有模型同跑 AI_025——湿段仍按真 id 1002 传参接线）----
  //  位序口径：AI_025（踢门/滚转/滚地加速/重力/:26748 AnyWet 消费）→ 湿段(:16903)
  //  → moveAndCollide（HandleMovement :17721-17764 湿阻尼读【本拍刷新后】旗,乘进
  //  dx/dy 入参、采纳处原样回读）。99 系 aiStyle 25 不在 UpdatePosition 跳过表
  //  （:20551）→ 阻尼适用。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐 update −1） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调用执行） */
  presetDone = false;

  // ---- ★SW-BJ64b（2026-09-13）1047 彩虹壳帧账/拖尾（P.cs:26411-26471 / Main.cs:33205-33210;
  //  1458 :26412/:33211 同域逐字=1457,零变更）----
  /** 弹帧 0..99：Projectile_1047.png 95×380 = 5 列×20 行 19×19 壳表（列=frame/20 色相带、
   *  行=frame%20 微光相,100 帧环 200t）;AI 每 2t 前进（P.cs:26414-26418）。 */
  frame = 0;
  private frameCounter = 0;
  /** TrailingMode[1047]=0（ProjectileID.cs:385 表尾）旧位环 10 段——P.cs:17199-17203
   *  每拍【位移后】shift+头插 [0]=position;trailN = 非 Zero 段数（消费端与原版
   *  Vector2.Zero 哨兵截断同义）。 */
  private readonly trailX = new Array<number>(10).fill(0);
  private readonly trailY = new Array<number>(10).fill(0);
  private trailN = 0;

  constructor(x: number, y: number, sheet: number) {
    super();
    this.x = x; this.y = y;
    const row = BOULDER_CONVERT_TABLE[sheet];
    this.projId = row?.proj ?? 99;
    this.dmg = row?.dmg ?? 70;
  }

  /** ai[0]：首 tick 后恒 1（cs:26682）；静止自启支的前置门 */
  private ai0 = false;

  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    // ---- 静止自启（cs:26684-26711 verbatim 门：ai[0]!=0 && vy<=0 && vx==0）——
    // 落入柱龛停稳后朝开阔侧踢 ±0.5，三级探柱(0/16/32px 外扩)都堵则按 cx 奇偶定边
    // SW-AF1 2026-09-04（F-3 收敛）：踢墙摄取器单源化 → WeaponProj.beeWallPushDir
    //  （655 蜂巢支/99 巨石支同一摄取器：三级递宽 ±8/24/40px 扫窗、左实优先、
    //  Center.X 奇偶兜底、SolidTile 全语义摄取 = active && tileSolid && !tileSolidTop
    //  && !halfBrick && slope==0（W.cs:70642-70655））。原第二实现 solidAt 用
    //  st.isSolid()（缺 halfBrick/slope/platform 排除→斜坡/半砖/平台格误判实心墙起踢）
    //  且 Math.floor 负商分叉,一并随 trunc(C# (int)) 修正。行为变更=1:1 目标。
    //  ★OOB 语义（SW-AL1 2026-09-05 定谳,纠正旧备案"越界=null→true"）：
    //  vanilla Main.tile 是裸 Tile[,]（Main.cs:1690）,OOB 下标抛异常被 SolidTile
    //  catch 吞掉【返 false】——beeWallPushDir OOB=false ≡ 原版,非差项
    //  （详证见 WeaponProj.ts beeWallPushDir 注）。※欠账备案：原版弹幕触世界界
    //  active=false 消散（P.cs:16789-16802）,本实体未接出界杀（655/949 已接）。
    if (this.ai0 && this.vy <= 0 && this.vx === 0) {
      this.vx = beeWallPushDir(game.world.store, this.x, this.y, this.w, this.cx);
    }
    this.ai0 = true;
    // ---- ★SW-BJ64b 1047 专支（P.cs:26411-26471;1458 :26412 逐字同）----
    //  ① 帧动画（:26414-26418）：frameCounter 每 2t 一帧、frame 环 0..99。
    //  ② 彩虹拖尾光（:26420-26435）：基色 = hsl(((GlobalTimeWrappedHourly×120)%300)/300,
    //    1, 0.6)×1.4（vector22/23）;沿 oldPos 逐点 ×(1−i/10)（num208 Remap 线性,
    //    num207≡1 平方不变）,经 DelegateMethods.CastLightOpen（DelegateMethods.cs:729-742）
    //    ——【实心体格不吃光】门:active() && !inActive() && !tileSolidTop && tileSolid
    //    → 跳过（本仓映射:hasTile=原版 active() 裸位 / isActuated=inActive /
    //    TILE_DEFS.solid=tileSolid / .platform=tileSolidTop）。
    //    GlobalTimeWrappedHourly = 运行秒 %3600（Main.cs:16777;FlickerClock 同源公式）。
    //  ③ 微光星屑（:26466-26471）：ShimmerBlock clientOnly 每拍一粒,位 = Center+
    //    圆缘随机(w/2,h/2)、move = velocity×0.05（本地直驱 shimmerBlockFx,
    //    PetFollower 1090 判例同款;原版无 UniqueInfoPiece → 0）。
    if (this.projId === 1047) {
      if (++this.frameCounter >= 2) {
        this.frameCounter = 0;
        if (++this.frame >= 100) this.frame = 0;
      }
      const gtw = typeof performance !== 'undefined' ? (performance.now() / 1000) % 3600 : 0;
      const st = game.world.store;
      for (let i = 0; i < this.trailN; i++) {
        const tx = Math.floor((this.trailX[i] + this.w / 2) / 16);
        const ty = Math.floor((this.trailY[i] + this.h / 2) / 16);
        if (st.inBounds(tx, ty) && st.hasTile(tx, ty) && !st.isActuated(tx, ty)) {
          const d = TILE_DEFS[st.get(tx, ty)];
          if (d && d.solid && !d.platform) continue;
        }
        const [lr, lg, lb] = rainbowBoulderLight(gtw, i);
        game.addLightAt?.(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2, lr, lg, lb);
      }
      const ang = Math.random() * Math.PI * 2;
      shimmerBlockFx(game,
        this.cx + Math.cos(ang) * this.w / 2, this.cy + Math.sin(ang) * this.h / 2,
        this.vx * 0.05, this.vy * 0.05);
    }
    // ---- AI_025 运动核 ----
    if (this.vy <= 6) {
      if (this.vx > 0 && this.vx < 7) this.vx += 0.05;
      if (this.vx < 0 && this.vx > -7) this.vx -= 0.05;
    }
    this.vy = Math.min(this.vy + 0.3, 16);
    // ---- AI_025 AnyWet 消费（:26748-26762,原版 AI 段尾——读【上拍】湿旗字段）----
    //  `if (AnyWet && netMode != 1)`: 1053 → Kill(任一液) / wet∧655 → Kill(蜂巢,
    //  WeaponProj GrenadeProj 域已接) / lavaWet∧(727|1054) → Kill。99/1013/1014/
    //  1047/1048/1055/1057 无湿杀面;1002 原版 aiStyle 16 无此块 → 显式排除。
    //  1047 豁免湿段 → 四旗恒 false → 恒不触发（与原版同向）。
    if (this.projId !== 1002
      && (this.wet || this.lavaWet || this.honeyWet || this.shimmerWet)) {
      if (this.projId === 1053) this.dead = true;                     // :26750-26752
      else if (this.lavaWet && (this.projId === 727 || this.projId === 1054)) {
        this.dead = true;                                             // :26758-26760
      }
    }
    if (this.dead) return;
    // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- 碰撞响应（Projectile.cs:19055-19101 巨石族分支 verbatim）----
    const lastVX = this.vx, lastVY = this.vy;
    // 碰撞位移（Body 旗由 lib 维护：onGround/collideY/hitWall）
    // ★水中位移阻尼（HandleMovement :17721-17764,湿段批）——速度【场】不减只削
    // 位移：阻尼乘进 dx/dy 入参,b.vx/vy=碰撞调整字段采纳处原样回读（勿除回,
    // 原版碰撞响应式读的也是未阻尼 velocity 场,lastVelocity 档不掺阻尼）
    const df = projWaterDragFactor(this);
    // SW-AQ1 2026-09-05：oldPosition 上报（Update :17118 AI 后/位移前置位）——
    //  99 ∈ OBJTYPE3 白名单（:17195）,objType 3 扫描新旧位判定
    //  （Collision.cs:3346-3353/:3356）消费;滚石撞墙碎裂拍 dead=true,
    //  旧位=本拍位移前真实值,碎裂拍扫描按原版 :19966 后位序照跑
    this.oldX = this.x; this.oldY = this.y;
    moveAndCollide(this, game.world, this.vx * df, this.vy * df);
    // ★SW-BJ64b：旧位环捕获（P.cs:17199-17203——TrailingMode=0 每拍无条件 shift+头插,
    //  [0] = HandleMovement 后 position（即本拍碰撞调整位）;置于碰撞响应分支前,
    //  撞墙碎裂拍旧位也照原版落账 = Kill 拖尾尘消费位）
    if (this.projId === 1047) {
      for (let i = 9; i > 0; i--) {
        this.trailX[i] = this.trailX[i - 1];
        this.trailY[i] = this.trailY[i - 1];
      }
      this.trailX[0] = this.x;
      this.trailY[0] = this.y;
      if (this.trailN < 10) this.trailN++;
    }
    this.rotation += this.vx * 0.06;
    // ① 高速落地（lastVy>5）：弹回 20% + 落地尘/声（SoundID 0 = dig 系）
    if (this.vy !== lastVY && lastVY > 5) {
      this.vy = -lastVY * 0.2;
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
      game.playSfx?.('dig', 0.8);
      if (this.projId === 1057) { this.dead = true; return; }   // 1057 落地即碎
    }
    // ② 横向撞墙：**Kill()（碎裂）**——不是反弹！ping-pong 根因即漏了这条
    // （cs:19097-19100 else 支；1055 荧光石球例外不碎走追踪切换）
    if (this.vx !== lastVX) {
      if (this.projId !== 1055) {
        game.spawnParticles?.(this.cx, this.cy, '#9A9A9A', 10, 1.6, { life: 18 });
        this.dead = true;
        return;
      }
    }

    // ---- 生命周期 ----
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }

    // ---- 双面接触伤害（friendly+hostile → NPC 与玩家都结算）----
    for (const raw of game.enemies() as Array<Record<string, unknown>>) {
      const e = raw as unknown as {
        id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
        x: number; y: number; w: number; h: number; cx: number; cy: number;
        hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
      };
      if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
      if ((this.immunities.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.immunities.set(e.id, 10);
      const dir = e.cx >= this.cx ? 1 : -1;
      e.hurt?.(this.dmg, dir * KB_X, 0, game);
    }
    const p = game.player as { dead: boolean; iframes: number; x: number; y: number; w: number; h: number };
    if (!p.dead && p.iframes <= 0 && !(this.immunities.get(-1) ?? 0)) {
      if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
        this.immunities.set(-1, 10);
        // ★SW-BI1 2026-09-06（用户崩溃报告定谳）：不传 this 作 attacker——attacker 槽是
        //  Enemy 受击反击面（荆棘/仙人掌套/日曜爆闪 → attacker.hurt(...)），弹体无 hurt
        //  方法，把滚石自身送进反击槽 → `k.hurt is not a function` → 帧循环守卫停机
        //  （沙漠滚仙人掌球实报，2026-09-06 报告 SW-BI1）。与全弹族调用约定对齐
        //  （FallingBlock:275/MeteorChunk:126/Dart 系/bossAI_* 均不传 attacker）：
        //  原版弹侧命中无 NPC 可反（PlayerDeathReason.ByProjectile），本无攻击者槽语义。
        game.damagePlayer(this.dmg, this.cx, this.cy);
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (this.projId === 1047) {
      // ★SW-BJ64b 1047 彩虹壳三叠画。原版序：拖尾块（Main.cs:33351-33385）先画=垫底，
      //  本体（:33571）后画=压顶。帧账 = Frame(5,20, frame/20, frame%20)（:33209）——
      //  源矩形 19×19、origin=帧心（:33210）、scale=vector82×2（:33208,SetDefaults
      //  scale=1）、color87 = GetAlpha 全亮白（:80967 `type==488||1047 → (255,255,255,255)`,
      //  即本体不受环境光暗化=黑暗里也发光）、num340 = rotation（:33167/:33229 尾
      //  `type!=1055 → rotation += vx*0.06`）。
      //  ★反伪影自证：实拍逐点直读 drawImage 源矩形对拍本式（scripts/_bj64b.mjs）。
      const cw = img.width / 5, ch = img.height / 20;
      const cell = rainbowBoulderCell(this.frame, img.width, img.height);
      // ① 250 微光拖尾（:33351-33367,Projectile_250 14×32,origin=(w/2,0),沿段拉伸）：
      //    num350=0.5/num351=1 → scaleX=2.2×0.5=1.1、scaleY=段长/32、rot=段向−π/2、
      //    alpha=(127/255)×(1−i/10)²（white4.A=127 × (1−num355)²,i=旧位序 0..9）
      const streak = projSprite(250);
      if (streak && streak.width > 0) {
        for (let i = 9; i > 0; i--) {
          if (i >= this.trailN) continue;                     // 原版 Zero 哨兵截断
          const x1 = this.trailX[i] + this.w / 2, y1 = this.trailY[i] + this.h / 2;
          const x0 = this.trailX[i - 1] + this.w / 2, y0 = this.trailY[i - 1] + this.h / 2;
          const seg = Math.hypot(x0 - x1, y0 - y1);
          if (seg < 0.01) continue;
          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(Math.atan2(y0 - y1, x0 - x1) - Math.PI / 2);
          ctx.globalAlpha = (127 / 255) * (1 - i / 10) * (1 - i / 10);
          ctx.drawImage(streak, -streak.width * 1.1 / 2, 0, streak.width * 1.1, Math.max(1, seg));
          ctx.restore();
        }
      }
      // ② Extra_55 星屑（:33368-33385）：68×384 竖 4 帧（68×96/帧）,origin=(w/2,h/8+14),
      //    rot=velocity.ToRotation()−π/2、scale=Lerp(0.1,0.8,(10−i)/10)×0.5、
      //    白×(1−i/3) 且 A=0 = 纯加法惯用法（memory:XNA α=0 → canvas 'lighter'）
      const spark = r.atlas?.ensureVImage('vanilla/Extra_55.png');
      if (spark) {
        const sh = spark.height / 4;
        const ox = spark.width / 2, oy = spark.height / 8 + 14;
        const rot = Math.atan2(this.vy, this.vx) - Math.PI / 2;
        const f4 = this.frame % 4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 3; i >= 0; i--) {
          if (i >= this.trailN) continue;
          let fi = (f4 - i) % 4;
          if (fi < 0) fi += 4;                                // num358（:33379-33382）
          const a = 1 - i / 3;                                // white5 × (1−i/3)×num351
          if (a <= 0) continue;
          const sc = (0.1 + 0.7 * (10 - i) / 10) * 0.5;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2);
          ctx.rotate(rot);
          ctx.drawImage(spark, 0, fi * sh, spark.width, sh,
            -ox * sc, -oy * sc, spark.width * sc, sh * sc);
          ctx.restore();
        }
        ctx.restore();
      }
      // ③ 本体单帧切片（:33571 缺省支 sourceRectangle2 非 null）——源矩形走
      //  rainbowBoulderCell 金标同源,绘制尺寸 = 帧心 origin × scale2 → 38×38
      ctx.globalAlpha = 1;
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh,
        -cw, -ch, cw * 2, ch * 2);
    } else {
      // 余族（99/727/1013/1048/1053/1054/1055/1057/1002）整图单帧：DrawProjDirect
      //  sourceRectangle2=null 缺省支（Main.cs:33169/:33571）——1055 竖条 10 帧走
      //  Main.cs:30618 家族块专支、1014 整图即原版本相（DrawProjDirect 全域无 1014
      //  切片支,projFrames[1014]=11 仅供 AI 消费）——1:1 维持勿"顺手修"。
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
