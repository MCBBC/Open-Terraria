// 孢子囊 3336 配饰弹族（★SW-FX1 2026-09-09,item-audit 配饰节 ❌ 清偿）：
//   · 孢子云 567/568（aiStyle 105 = AI_105_SporeSac）
//   · 云消亡迸气 569-571（aiStyle 106）
// 原版真值 = Terarria1457/Terraria（1457 终值；掷定扫描链在 Game.updateSporeSacTick）：
//   · 云 SetDefaults（:6187-6202）: 567=14×14、568=16×16（提取器漏嵌套 if,json 缺差
//     由 vanillaProjectiles DATA_PATCH 补）、aiStyle 105、friendly、penetrate 1、
//     alpha 255、timeLeft 3600、tileCollide false、ignoreWater true、
//     UseGroupStaticImmunity(567)（:6201 → :10678-10683 = IDStatic 10t 组键 567,
//     双型共用一张组表。★红蓝-J3 勘误（2026-09-18）：Damage 免疫梯首支内层条件
//     `penetrate != 1 || appliesImmunityTimeOnSingleHits`（:14032）对云恒假
//     （penetrate=1 :6194 + appliesImmunityTimeOnSingleHits 缺省 false :719）→
//     perIDStaticNPCImmunity[567,*] 全仓无写入点（:13822=546 掷 1134 专用,
//     :14036 内层不可达）→ 外环组门 IsNPCIndexImmuneToProjectileType(:606-611)
//     恒开=多云同拍连击同敌本相;内环 :12636 `immune[owner]==0`（flag3=false）照走,
//     命中面三不写（组行/全局窗/尾档 :14175-14183 else 链不可达）=云不开全局窗,
//     其它 pierce=0 兵器 10t 内不被云开窗挡。曾自造 10t 组窗+hurt 写帧双重节流
//     =拍板#1A 摘除）。
//   · AI_105（:40768-40905）逐拍：
//       光 0.2/0.275/0.075 × num（num=(1−α/255)×scale,:40770-40772,本仓 lightRGB 位）
//       localAI[0] ±90 振荡、≥0 拍 scale+0.003 否则 −0.003（:40774-40783）
//       rotation += 0.0025×scale（:40784）
//       IndexForVisuals%6 漂移向表 num2/num3（:40786-40801）
//       localAI[1] >60 → 重置 −180;≥−60 拍 v += 0.002×dir 否则 −（:40803-40814）
//       ai[0]++;>5400 → damage=0、ai[1]=1、α+5 至 255 拍 Kill（:40815-40830）
//       否则 num4=dist(玩家)/100 且 >4..10 逐档 ×1.1..×1.7（:40832-40863）;
//         owner 无 sporeSac 旗 → num4 += 100（:40874-40876,卸饰加速消散）;
//         ai[0] += num4;α>50 → α−10 钳 50（:40882-40889 渐显,α 起 255）
//       索敌：曼哈顿 <340 最近 CanBeChasedBy → v=(v×40+dir×4)/41（:40891-40905）;
//         无目标且 |v|>0.2 → v×0.98（:40906-40908）
//   · GetAlpha（:80862-80864）(255−α,255−α,255−α,255−α) → 画布 globalAlpha
//     = (255−α)/255（预乘等价,ChloroSporeCloud 同惯例）。
//   · Kill（:74317-74323）owner 本地 && ai[1]==0（非寿终,即命中耗穿透）→
//     迸 569+Next(3) 同伤气团（vel = 随机单位向量×0.3,position=云心）。
//   · 气团 SetDefaults（:6204-6213,569-571）: 32×32、aiStyle 106、friendly、
//     penetrate −1、alpha 255、timeLeft 3600、tileCollide false、ignoreWater true。
//     AI_106（:34144-34168）: rotation += vx×0.02,vx<0 再 −|vy|×0.02 否则 +
//     |vy|×0.02;v×0.98;ai[0]++ ≥60 → α+5 至 255 拍消亡;否则 α>80 → α−30 钳 80
//     （稳态 (255−80)/255≈0.686 不透明度）。penetrate −1 = 免疫梯首支内层真
//     （:14033-14037）→ 命中写 immune[owner]=0（清窗,非 10——旧注「immune[owner]=10」
//     假命题勘误 2026-09-18）+ 组行 :14036 → HitCdImpl 冷却 10t。
//   · 无 Kill 尘/音分支（Kill :74317 前后无 567/568 专属支）→ 静默消亡。
// 联机面：玩家本地自持实体（远端代理不跑 fixedUpdate）,可见面偏差登记同 ChloroSporeCloud。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { dealContacts, HitCdImpl } from './proj1457';
import { canBeChasedBy } from './projTargets';
import { projSprite } from './Arrow';

/** 孢子云双型（567 绿 / 568 变体,567 盒 14×14、568 盒 16×16） */
export const SPORE_CLOUD_A = 567;
export const SPORE_CLOUD_B = 568;
/** 迸气团三变体（NewProjectile rand.Next(569, 572)） */
export const SPORE_GAS_IDS = [569, 570, 571] as const;

/** 云消亡迸气回调（Game 侧注入：NewProjectile(云心, 569+Next(3), 同伤) 出射口） */
export type SporeGasSpawn = (x: number, y: number, vx: number, vy: number, dmg: number) => void;

/** 组共享 IDStatic 免疫账（时间驱动衰减,WeaponProj.RainDropSharedImmunity 同构——
 *  tick 空转免「N 实例 × dealContacts 循环头 = N 拍/帧」多例快放失真,窗口恒 10t）。
 *  ★红蓝-J1 运行时消费面审计（2026-09-18）：原版 UseGroupStaticImmunity(:10678-10683)
 *  = perIDStaticNPCImmunity[immunityIdentity] 行共享（组键 567=567/568 双云、组键
 *  569=569/570/571 三气团——行号 :6201/:6219,1457/1458 两树全等）。曾:气团 per-
 *  instance HitCdImpl（门位偏离原版组行语义——伤害总量当时被 Enemy.hurt iframes
 *  全局窗掩蔽未溢出,见 dealContacts 调用位注）;云表 static HitCdImpl 有账但窗口按
 *  在场实例数 N 倍速衰减（dealContacts 循环头逐调用 tick）。两账同构勘正=time 驱动
 *  组行,门位回归原版。
 *  ★红蓝-J3 勘误（2026-09-18,拍板#1A）：组行共享语义只对【写行】的弹型成立——
 *  云 567/568 侧 Damage 梯首支内层条件恒假（:14032）→ 原版组行【从不写】=组门
 *  恒开,本类实例化出的云组表（SPORE_CLOUD_IMMUNE）属自造节流窗已摘除（组表实体
 *  仅气团 569-571 侧保留——气团 penetrate=−1 → 内层真,组行照写+immune[owner]=0
 *  清窗 :14033-14037）。 */
class SporeIdStaticGroup extends HitCdImpl {
  private sm = new Map<number, number>();
  private readonly cdMs = Math.round(10 * 1000 / 60);    // idStaticNPCHitCooldown 10t ≈167ms(60fps 基数)
  override tick(): void { /* 时间驱动,无逐拍衰减（dealContacts 循环头调用位） */ }
  override ready(id: number, _cooldown: number): boolean {
    const now = Date.now();
    if ((this.sm.get(id) ?? 0) > now) return false;
    this.sm.set(id, now + this.cdMs);
    if (this.sm.size > 512) {
      for (const [k, v] of this.sm) if (v <= now) this.sm.delete(k);
    }
    return true;
  }
}
/** 云组门恒真过路表（拍板#1A）：perIDStaticNPCImmunity[567,*] 原版无写入点（见
 *  头注 J3 勘误）→ IsNPCIndexImmuneToProjectileType(:606-611) 恒 true=外环组门
 *  恒开。占位达成 dealContacts cd 形参——ready 恒真不落账（曾 10t 组窗=自造节流,
 *  复辟即被 tests/sw-fx1 多云同拍连击判别面爆红）。 */
class PassThroughCD extends HitCdImpl {
  override ready(_id: number, _cooldown: number): boolean { return true; }
}
const SPORE_CLOUD_PASS = new PassThroughCD();
/** 气团组表：immunityIdentity=569（569/570/571 三变体共行,:6219）——penetrate=−1
 *  → 内层条件真=组行照写（:14033-14037）,10t 组窗=原版本相（红蓝-J1 保留） */
const SPORE_GAS_IMMUNE = new SporeIdStaticGroup();

/** 孢子云 567/568（AI_105）——玩家装备 3336 周期掷定的驻场云,命中即消亡并迸气团 */
export class SporeSacCloud extends Entity {
  damage: number;
  knockback: number;
  critChance = 0;          // SetDefaults 无 melee/ranged/magic 类别旗 ⇒ 暴击掷不触发
  armorPen = 0;
  dead = false;
  readonly projId: number;
  /** 弹体点光（AI_105 :40770-40772,Game 实体光扫读 lightRGB——同 Enemy/Arrow 约定） */
  lightRGB: [number, number, number] | null = null;
  /** SetDefaults alpha=255 → AI 淡入钳 50（:40882-40889） */
  private alpha = 255;
  /** AI_105 scale 振荡（±0.003/拍,基准 1） */
  private scale = 1;
  private rotation = 0;
  /** localAI[0]（:40774 ±90 振荡相位） */
  private osc = 0;
  /** localAI[1]（:40803 漂移相位 −180..>60） */
  private drift = 0;
  /** ai[0]（寿命计数,近玩家加速/远玩家加速更猛） */
  private life = 0;
  /** ai[1]（0=活跃 1=寿终淡出——寿终不迸气不结算） */
  private dying = false;
  /** IndexForVisuals = key.Index（:554）——实体自增 id 近似出生序,漂移向 6 档取模 */
  private readonly visualIndex: number;
  private readonly spawnGasCb: SporeGasSpawn | null;

  constructor(x: number, y: number, type: number, damage: number, knockback: number,
    visualIndex: number, spawnGas?: SporeGasSpawn) {
    super();
    this.projId = type;
    this.w = type === SPORE_CLOUD_A ? 14 : 16;   // :6189-6196
    this.h = this.w;
    this.x = x; this.y = y;                       // 原版传 center 进 NewProjectile 位置形参=盒左上（quirk 保留）
    this.vx = 0; this.vy = 0;
    this.damage = damage;                         // NewProjectile 字面 70（:42739）
    this.knockback = knockback;                   // 1.5（:42740）
    this.visualIndex = visualIndex;
    this.spawnGasCb = spawnGas ?? null;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    const tw = st.w * 16, th = st.h * 16;
    // ---- AI_105（:40768-40905）----
    {
      const n = (1 - this.alpha / 255) * this.scale;              // :40770-40772 光强因子
      this.lightRGB = [0.2 * n, 0.275 * n, 0.075 * n];            // 光 0.2/0.275/0.075 × num
    }
    this.osc += 1;                                                // :40774
    if (this.osc >= 90) this.osc *= -1;                           // :40776-40778
    if (this.osc >= 0) this.scale += 0.003;                       // :40780-40782
    else this.scale -= 0.003;
    this.rotation += 0.0025 * this.scale;                         // :40784
    {                                                             // IndexForVisuals%6 漂移向（:40786-40801）
      let num2 = 1, num3 = 1;
      const m = ((this.visualIndex % 6) + 6) % 6;
      if (m === 0) num3 *= -1;
      else if (m === 1) num2 *= -1;
      else if (m === 2) { num3 *= -1; num2 *= -1; }
      else if (m === 3) num3 = 0;
      else if (m === 4) num2 = 0;
      this.drift += 1;                                            // :40803
      if (this.drift > 60) this.drift = -180;                     // :40805-40807
      if (this.drift >= -60) {                                    // :40809-40814
        this.vx += 0.002 * num3; this.vy += 0.002 * num2;
      } else {
        this.vx -= 0.002 * num3; this.vy -= 0.002 * num2;
      }
    }
    this.life += 1;                                               // :40816
    if (this.life > 5400) {                                       // :40817-40830 寿终段
      this.damage = 0;
      this.dying = true;
      if (this.alpha < 255) {
        this.alpha = Math.min(255, this.alpha + 5);
      } else {
        this.dead = true;                                          // :40828 Kill()（ai1==1 → 不迸气）
        return;
      }
    } else {                                                      // :40831-40889 活跃段
      const p = game.player;
      let num4 = Math.hypot(this.cx - p.cx, this.cy - p.cy) / 100;   // :40832
      if (num4 > 4) num4 *= 1.1;                                     // :40834-40863 逐档乘
      if (num4 > 5) num4 *= 1.2;
      if (num4 > 6) num4 *= 1.3;
      if (num4 > 7) num4 *= 1.4;
      if (num4 > 8) num4 *= 1.5;
      if (num4 > 9) num4 *= 1.6;
      if (num4 > 10) num4 *= 1.7;
      if (!p.equipStats.sporeSac) num4 += 100;                       // :40874-40876 卸饰加速消散
      this.life += num4;                                             // :40878
      if (this.alpha > 50) this.alpha = Math.max(50, this.alpha - 10);   // :40882-40889 渐显
    }
    // ---- 索敌（:40891-40905：曼哈顿 <340 最近 CanBeChasedBy,无 LOS 门）----
    let found = false, tx = 0, ty = 0, best = 340;
    for (const ent of game.enemies()) {
      const e = ent as { x: number; y: number; w: number; h: number; dead?: boolean };
      if (!e || e.dead || !canBeChasedBy(ent)) continue;
      const dx = Math.abs((this.x + this.w / 2) - (e.x + e.w / 2));
      const dy = Math.abs((this.y + this.h / 2) - (e.y + e.h / 2));
      const d = dx + dy;
      if (d < best) { best = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2; found = true; }
    }
    if (found) {                                                    // :40906-40912
      const vx0 = tx - this.cx, vy0 = ty - this.cy;
      const l = Math.hypot(vx0, vy0) || 1;
      this.vx = (this.vx * 40 + (vx0 / l) * 4) / 41;
      this.vy = (this.vy * 40 + (vy0 / l) * 4) / 41;
    } else if (Math.hypot(this.vx, this.vy) > 0.2) {                // :40913-40915
      this.vx *= 0.98; this.vy *= 0.98;
    }
    // 位移（tileCollide=false 直推,:6188 块）;出界静默消亡（:16787 同式）
    this.x += this.vx; this.y += this.vy;
    if (this.x <= 0 || this.y <= 0 || this.x + this.w >= tw || this.y + this.h >= th) {
      this.dead = true;
      return;
    }
    // ---- Damage（penetrate 1 → 首命中即 Kill;寿终段 damage=0 不结算）----
    //  免疫面三不写（Projectile.cs:14031-14038 首支内层条件假——★红蓝-J3,拍板#1A）：
    //  · 外环组门（:12596 flag2）= SPORE_CLOUD_PASS 恒真过路（原版组行恒 0 恒开;
    //    曾自造 10t 组窗=双重保守节流第一重,已摘——复辟=tests/sw-fx1 多云同拍连击红）;
    //  · 内环 immune[owner]==0 门（:12636,flag3=false 因 usesIDStaticNPCImmunity）
    //    = Enemy.hurt iframes 门承载（pierce=-2=IDStatic 单发档:门照走、命中不写帧）;
    //  · 尾档 :14175-14183 else 链不可达=不写 immune[owner]=10（云不开全局窗,
    //    其它 pierce=0 兵器 10t 内不被云开窗挡——第二重节流同步摘）。
    //  keepIterating 截断（:14186-14201 penetrate 1→0 → false）= stopAfterFirstHit
    //  （同拍重叠多怪只伤桶序首个——δA bug② 同款映射,叶弹 227 先例）。
    if (!this.dying) {
      let hit = false;
      dealContacts(this, game, SPORE_CLOUD_PASS, 0, () => { hit = true; }, undefined, -2, true);
      if (hit) { this.burst(); return; }                            // Kill :74317（ai1==0 → 迸气）
    }
  }

  /** Kill 迸气支（:74317-74323）：569+Next(3) 同伤,vel=随机单位向量×0.3,position=云心 */
  private burst(): void {
    this.dead = true;
    if (!this.spawnGasCb) return;
    const a = Math.random() * Math.PI * 2;
    this.spawnGasCb(this.cx, this.cy, Math.cos(a) * 0.3, Math.sin(a) * 0.3, this.damage);
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    const opacity = (255 - this.alpha) / 255;           // GetAlpha :80862-80864 预乘等价
    if (opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      ctx.fillStyle = '#7A8F3A';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

/** 迸气团 569-571（aiStyle 106）——云消亡时同伤气团,驻场 ~1s 渐显渐隐 */
export class SporeGasCloud extends Entity {
  damage: number;
  knockback = 0;           // NewProjectile kb=0（:74321）
  critChance = 0;
  armorPen = 0;
  dead = false;
  readonly projId: number;
  /** SetDefaults alpha=255 → AI 渐显钳 80（:34158-34164） */
  private alpha = 255;
  private rotation = 0;
  /** ai[0]（:34153 ≥60 转淡出） */
  private t = 0;

  constructor(x: number, y: number, vx: number, vy: number, type: number, damage: number) {
    super();
    this.projId = type;
    this.w = 32; this.h = 32;                    // :6204-6213
    this.x = x; this.y = y;                      // 原版传云心进位置形参=盒左上（quirk 保留）
    this.vx = vx; this.vy = vy;
    this.damage = damage;                        // 同伤透传
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // AI_106（:34144-34168）
    this.rotation += this.vx * 0.02;
    if (this.vx < 0) this.rotation -= Math.abs(this.vy) * 0.02;
    else this.rotation += Math.abs(this.vy) * 0.02;
    this.vx *= 0.98; this.vy *= 0.98;            // :34151
    this.t += 1;                                 // :34152
    const fading = this.t >= 60;                 // :34153-34168
    if (fading) {
      if (this.alpha < 255) this.alpha = Math.min(255, this.alpha + 5);
      else { this.dead = true; return; }         // :34159-34163（owner==myPlayer 单机恒真）
    } else if (this.alpha > 80) {
      this.alpha = Math.max(80, this.alpha - 30);
    }
    // 位移（tileCollide=false）;出界静默消亡
    this.x += this.vx; this.y += this.vy;
    const tw = game.world.store.w * 16, th = game.world.store.h * 16;
    if (this.x <= 0 || this.y <= 0 || this.x + this.w >= tw || this.y + this.h >= th) {
      this.dead = true;
      return;
    }
    // penetrate −1 = 免疫梯首支内层真（:14033-14037）→ 命中写 immune[owner]=0（清窗）
    // +组行 :14036;淡出段 damage 未清
    //（原版 AI_106 无 damage=0 支）→ 保持结算。节流=组表 SPORE_GAS_IMMUNE
    //（UseGroupStaticImmunity(569) :6219——三变体共行,idStaticNPCHitCooldown=10
    // :10678-10683）。★红蓝-J1 审计（2026-09-18）
    // 勘正:曾 per-instance hitCd——伤害总量被 Enemy.hurt 内 iframes 全局窗掩蔽未溢出,
    // 但门位偏离原版（原版=immune[owner] 清零+组行 :14031-14037 独扛节流）;归组行
    // 语义后判别面=tests/sw-fx1-accessories「组共享 IDStatic」
    // （组表=1 次 hurt 调用,per-instance 变异面=15）。
    // ★红蓝-L1②（2026-09-18,拍板#1A 备案债清偿）：hitPierce=−2（BJ140 档）——免疫门
    // 照走（:12636 内环,iframes>0 拒收）+命中【不写帧】（Enemy.hurt pierce!==−2 才写
    // :14187 通用档）=净等价原版 immune[owner]=0 清窗（:14035——门已保证进此路径时
    // iframes==0,不写≡写 0）。曾缺省 0 写 iframes=10=对其它 pierce=0 兵器多开 10t
    // 全局窗（GC1 域近似偏差）——变异面=tests/sw-fx1-accessories「气团命中不开全局窗」。
    dealContacts(this, game, SPORE_GAS_IMMUNE, 10, undefined, undefined, -2);
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    const opacity = (255 - this.alpha) / 255;
    if (opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.imageSmoothingEnabled = false;
    if (img && img.width > 0) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      ctx.fillStyle = '#6F8F49';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}
