// 山铜（奥利哈刚）套装 on-hit 花瓣弹 221（终零波 Player.ts 域批,2026-09-01）。
//
// 原版真值 = Terarria1458（1457 同值；双版本锚）：
//   · 来源链：ArmorSetBonuses.cs :455-456 Orichalcum 全套三头变体
//     （1210/1211/1212=hs86/87/88 × 胸 1213=bs55 × 腿 1214=ls50）→ :217-220
//     Effect=player.onHitPetal=true → Player.OnHit（Player.cs:6963-6985）
//     `if (onHitPetal && petalTimer == 0) { petalTimer = 20; NewProjectile(...221,36,0f); }`
//     ——petalTimer 与叶绿引援叶共享共享窗（叶绿支 petalTimer=50,:7009），
//      每 tick 递减位 :25652-25655。伤值/kb 为 NewProjectile 字面量直传
//      （36/0——不吃任何玩家面板乘区，同钛金碎片 908 dmg50 先例 Game.ts「α-H1」注）。
//   · SetDefaults（Projectile.cs:3068-3080）：20×20、aiStyle=41、friendly=true、
//     tileCollide=false、ignoreWater=true、timeLeft=120、penetrate=-1（无限穿）、
//     scale = 1 + rand(30)*0.01 ∈ [1.00,1.29)、extraUpdates=2。
//   · AI_041（Projectile.cs:28179-28189）：localAI[0]==0 → frame=rand(3);
//     rotation += velocity.X * 0.01f（【每子步】——AI 在 Update 主循环子步内）。
//   · 子步语义：extraUpdates=2 ⇒ while(numUpdates>=0) 每拍展开 3 子步
//     （Projectile.cs:16781-17346），timeLeft--(:17308)/移动/AI 均在子步内 ⇒
//     实际寿命 120/3=40 拍、位移 ×3/拍（速度 24px/子步 ⇒ 有效 72px/t）、旋转增量 ×3。
//   · 光照：ProjLight（Projectile.cs:16249）头部 `light > 0f` 门——221 的 SetDefaults/
//     AI_041 均不写 light ⇒ early return，零光照贡献（实装=不加 addLightAt）。
//   · 绘制染色 GetAlpha :81338 `type==221 || 729 || 977 → Color(255,255,255,200)`——
//     本仓 globalAlpha=(200/255)。贴图 Projectile_221.png 20×60=三帧竖排（frame%3）。
//   · TryDoingOnHitEffects 排除表（Projectile.cs:15210-15220）：type 221 ∈
//     ON_HIT_EXCLUDED_PROJS —— 花瓣自身命中不再触发 OnHit 族（自续断链），
//     弹侧只需 projId=221 即自动被 Enemy.hurt 现有闸门拒绝。
//   · 无 Kill 特效段（Kill_DirtAndFluidProjectiles/编排粒均无 221 分支）→ 寿命尽/
//     出界静默消亡（aiStyle41 无死亡尘）。
//
// 联机面：与 ChloroLeafShot 同口径——玩家本地自持实体（远端代理不跑 fixedUpdate），
// 不进弹幕快照同步；远端可见面偏差登记于台账。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { dealContacts, HitCdImpl } from './proj1457';
import { hitCritters } from './projTargets';
import { projSprite } from './Arrow';

/** extraUpdates=2 的子步折叠数（Update 主循环每拍子步数 = EU+1） */
export const PETAL_SUBSTEPS = 3;

const SPRITE_FRAMES = 3;

/** 山铜花瓣弹 221（AI_041）：
 *  - 直线飞行无重力无索敌（tileCollide=false 贴图穿透;命中判定走 dealContacts,
 *    per-target 免疫窗缺省 10t,pierce=-1 不死于命中）
 *  - 出生帧 frame=rand(3)、scale=1+rand(30)*0.01、rotation=rand(0..2π)
 *    （SetDefaults scale + AI_041 localAI[0] 首拍块——原版 rotation 初始 0 但首子步
 *    即 += vx*0.01,差异 ≤0.24rad 视觉登记）;spriteDirection=±velocity.X 符号
 *  - 寿命 timeLeft=120 按子步消耗制折叠为逐子步递减 */
export class OrichalcumPetal extends Entity {
  w = 20; h = 20;
  readonly projId = 221;
  damage: number;
  knockback: number;
  // SetDefaults 无 melee/ranged/magic 类别旗 ⇒ Damage 暴击掷不触发（δA bug① 同款先例:
  // ChloroLeafShot 227 / TitaniumStormShard 908,Game.ts「α-H1」注）
  critChance = 0;
  armorPen = 0;
  meleeProj = false;
  dead = false;
  readonly scaleMul: number;               // 1 + rand(30)*0.01（绘制缩放档）
  private rotation = Math.random() * Math.PI * 2;
  private spriteDirection: number;
  private frame = 0;
  private timeLeft = 120;                  // SetDefaults timeLeft（子步消耗制）
  private readonly hitCd = new HitCdImpl();

  /** 入参=NewProjectile 形参 position(top-left)+速度向量（Player.OnHit :6963-6985
   *  屏幕边出生点直传;Game.spawnOnHitPetals 单点换算） */
  constructor(px: number, py: number, vx: number, vy: number) {
    super();
    this.x = px;
    this.y = py;
    this.vx = vx;
    this.vy = vy;
    this.damage = 36;                      // NewProjectile 字面量（Player.cs:6984）
    this.knockback = 0;                    // kb=0f（:6984）
    this.scaleMul = 1 + Math.floor(Math.random() * 30) * 0.01;   // Next(30) 上界不含
    this.spriteDirection = vx < 0 ? -1 : 1;                     // AI_041 首拍块
    this.frame = Math.floor(Math.random() * SPRITE_FRAMES);     // rand(3)
  }

  get rot(): number { return this.rotation; }
  get dir(): number { return this.spriteDirection; }
  get lifeT(): number { return this.timeLeft; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    const tw = st.w * 16;                  // Main.rightWorld ≡ tiles×16（Main.cs:1080-1086）
    const th = st.h * 16;
    for (let u = 0; u < PETAL_SUBSTEPS && !this.dead; u++) {
      // 世界边界原值判定（Projectile.cs:16787,P.cs 同式）——出界静默消亡
      if (this.x <= 0 || this.y <= 0 || this.x + this.w >= tw || this.y + this.h >= th) {
        this.dead = true;
        return;
      }
      this.rotation += this.vx * 0.01;     // AI_041 :28186（每子步）
      this.x += this.vx;                   // HandleMovement（tileCollide=false 直推进）
      this.y += this.vy;
      // ★BJ384 小动物命中面（BJ383 件2 补齐）：221 friendly penetrate=−1（SetDefaults
      //  :3068-3080）→ critter 照伤弹不亡（:12618 flag=!friendly 恒真;:14184
      //  penetrate>0 才递减）。几何=本体盒 AABB（hitCritters 缺省面;无 minion/sentry/
      //  trap 位 → 仅受 dontHurtCritters 饰品门）。非 magic（无类别旗）→ 无幽灵兜帽
      //  吸血 proc;TryDoingOnHitEffects 排除表（:15210-15220 type 221∈ON_HIT_EXCLUDED_
      //  PROJS）只断 OnHit 自续链,不涉 Damage_PVE critter 面。
      hitCritters(this, game);
      // Damage()（每子步结算面;pierce=-1=无限穿,dealContacts 缺省冷却窗 10t 且
      // onHit 未挂钩——命中不置弹亡）
      dealContacts(this, game, this.hitCd, 10);
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.dead = true;                  // :17308-17313 寿命尽静默 Kill（无死亡尘/音）
        return;
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(221);
    ctx.save();
    ctx.globalAlpha = 200 / 255;                 // GetAlpha Color(255,255,255,200)（:81338）
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.scale(this.scaleMul * this.spriteDirection, this.scaleMul);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      const fw = img.width / SPRITE_FRAMES;                    // 20px/帧（竖排 3 帧）
      ctx.drawImage(img, this.frame * fw, 0, fw, img.height,
        -fw / 2, -img.height / 2, fw, img.height);
    } else {
      // 资产懒加载窗占位色块兜底（只读直绘,不写缓存——平涂拒烘七入口原则）
      ctx.fillStyle = '#E7B4E0';
      ctx.fillRect(-9, -9, 18, 18);
    }
    ctx.restore();
  }
}
