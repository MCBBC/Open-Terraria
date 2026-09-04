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

const KB_X = 10;               // 出生 kb 第二参 = 10f

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
    //  ★OOB 备案：vanilla Main.tile 越界=null → SolidTile 返 true（:70646-70649）,
    //  旧 solidAt 同返 true;beeWallPushDir 沿 store 惯例"世界外视为空"返 false——
    //  世界缘 8~40px 带内踢向可能差一档,与 655/99 三支同口径备案（beeWallPushDir 注）。
    if (this.ai0 && this.vy <= 0 && this.vx === 0) {
      this.vx = beeWallPushDir(game.world.store, this.x, this.y, this.w, this.cx);
    }
    this.ai0 = true;
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
    moveAndCollide(this, game.world, this.vx * df, this.vy * df);
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
        game.damagePlayer(this.dmg, this.cx, this.cy, this);
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
