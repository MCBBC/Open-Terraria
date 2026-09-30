// 彩虹枪（Rainbow Gun 1260）弹链 1:1：
//   250 彩虹头（SetDefaults :3054）：12×12 aiStyle46 magic alpha255【隐形】
//     （GetAlpha :76643 return Transparent——本体从不显示）penetrate-1 ignoreWater。
//     AI_046（:26685-26742）：每 2t（localAI[0]>4→重置 3）铺一片 251 段；
//     ai[0] 计数（上升时 ×(1−vy/3) 加速计）>30 后 vy+=0.5 重力 + vx 按升降
//     ×0.95/×1.05——彩虹头呈抛物拱弧；速度恒归一到 15.95；rotation=atan2−π/2；
//     timeLeft 钳 2400；撞块即亡（tileCollide 默认 true）。
//   251 彩虹段（SetDefaults :3067）：14×14 aiStyle46 friendly magic penetrate-1
//     scale1.25 light0.3 tileCollide=false ignoreWater=true（:3348——★湿段定谳
//     2026-09-06：250 :3332 / 251 :3348 双双豁免,P.cs:16903 湿段整段门不开,
//     不接 projectileWetSection）；首帧锁 rotation=弹头方向、timeLeft=2400
//     （≈40s 持续）；alpha 生命周期（:26758-26770）：首 10t 淡入（255→0）、
//     中段恒 0（全显）、末 10t 淡出（GetAlpha :76647 亮度=255−alpha）；
//     命中 usesIDStaticNPCImmunity + idStaticNPCHitCooldown 10——【全段共享】
//     同一敌每 10t 至多吃一段伤害（静态按弹型免疫表，非每段独立）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playerCanHitEnemy, applyBannerDamageDealt, hitCrittersAll, noteVanillaProjImmune } from './projTargets';
import { ghostHealProc, snapshotVanillaGate, vanillaGateRejected } from './SpectreSoulProj';   // ★X2-D2 251 彩虹段 proc 单源（★清偿刀 T 门位快照单源）

/** 251 静态免疫表（原版 usesIDStaticNPCImmunity：按弹型共享，非每段独立）。
 *  表项 = 敌 id → 到期时刻（共享钟，多段同 tick 不会重复衰减冷却——
 *  每段自衰减会让 N 段把 10t 压缩成 10/N t，实测踩坑）。 */
const segImmuneUntil = new Map<number, number>();
/** 共享钟（60tps → 1t=16.67ms；测试经 _setRainbowClock 注入假钟） */
let nowMs: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const IMMUNE_MS = 10 * (1000 / 60);

/** 测试钩子：替换共享钟（彩虹段静态免疫表用） */
export function _setRainbowClock(fn: (() => number) | null): void {
  nowMs = fn ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
}

export class RainbowSegment extends Entity {
  w = 14; h = 14;
  /** 原版弹 id（SetDefaults :3337-3351——ghostHealProc magic 数据面/湿段消费） */
  readonly projId = 251;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** GetAlpha 亮度源（255=隐 … 0=全显） */
  alpha = 255;
  /** 剩余寿命（原版 timeLeft，首帧钳 2400） */
  private life = 3600;
  /** 首帧初始化标记（localAI[0]==0 分支） */
  private init = false;
  private rot: number;
  dead = false;
  /** 弹体点光（SetDefaults light 0.3） */
  lightRGB: [number, number, number] | null = [0.3, 0.3, 0.3];
  /** ★X2-D2：PVE 受理命中计数（原版 Projectile.numHits——:14263 受理后自增 ⇒ proc
   *  （:13877-79）读自增前值;251 penetrate=-1+IDStatic 10t 共享窗 → 同敌 10t 至多一跳,
   *  单段无同拍多靶 ⇒ 每跳前值恒 0 档率 0.20。字段名对齐 projPveNumHits PVP 读口） */
  pveNumHits = 0;

  constructor(x: number, y: number, dirX: number, dirY: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.damage = damage;
    this.knockback = knockback;
    this.rot = Math.atan2(dirY, dirX) - Math.PI / 2;   // 首帧锁（:26748-26754）
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 首帧 timeLeft=2400（AI_046 :26755 localAI[0]==0 分支）
    if (!this.init) { this.init = true; this.life = 2400; }
    this.life--;
    if (this.life <= 0) { this.dead = true; return; }
    // alpha 生命周期（:26758-26770）
    if (this.life < 10) this.alpha = 255 - Math.floor(255 * this.life / 10);       // 淡出
    else if (this.life > 2390) this.alpha = 255 - Math.floor(255 * (2400 - this.life) / 10); // 淡入
    else this.alpha = 0;                                                            // 中段全显
    // 命中（穿透 -1 + 同型静态 10t 冷却；免疫表按需扩容清理过期项防无界增长）
    if (segImmuneUntil.size > 512) {
      const t0 = nowMs();
      for (const [k, v] of segImmuneUntil) if (v <= t0) segImmuneUntil.delete(k);
    }
    // ★X2-D3（2026-09-29）critter 面：251 penetrate=-1（SetDefaults :3341）不耗穿不亡,
    //  Damage() victim 循环（:12618）critter 恒在内——盒 14×14 重叠全结算入账
    //  （hitCrittersAll 全结算变体）。IDStatic 10t 共享窗（:12598-12600 flag2 per-NPC
    //  index）对 critter 由一击即死承载（life=5,单源 dead 门天然去重）;critter
    //  lifeMax≤5 → flag10 lifeMax>5 段（:13712）恒不吸血 → 只入账不 proc。
    this.pveNumHits += hitCrittersAll(this, game);
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; iframes?: number; dontTakeDamage?: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const until = segImmuneUntil.get(e.id) ?? 0;
      if (until > nowMs()) continue;
      // ★清偿刀 P1（C5 定谳#4）：perIDStatic 写（:14033-14036 perIDStaticNPCImmunity[
      //  identity,victim]=UpdateCount+cd）在【受理支】内——免疫门 :12635-12637 拒收
      //  （他源 iframes 残窗）发生在任何写尾之前,门拒敌不落静态标 → 残窗期满后本段
      //  照吃;旧档 set 前置=残窗敌被整段 10t 静态窗吞（set 移入下方 !vanillaGated 支）。
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★清偿刀 T（X4-债12,2026-09-29）：门位读【前置快照】（读侧单源
      //  snapshotVanillaGate,判据=「进 hurt 前状态」=原版免疫门 :12634-12637/:12686
      //  读 StrikeNPC 前的受害者态）。旧后置读两源污染：①受理写支（Enemy.ts:14297
      //  pierce=0 写 10t）→ 受理拍读恒真 → proc/numHits 恒跳（吸血域断供——同刀 R 对
      //  634 AoE「旧 pierce=0 受理写 10」判谳;251 真机面 proc 全灭,测试 mock hurt 无
      //  写支故绿,本刀修复）；②死亡转换写支（Enemy.ts:14421 四塔血尽转演出写
      //  iframes=2,写支 1:1 禁改）→ 致死命中拍误判门拒。快照双源同治。
      const gate = snapshotVanillaGate(e);
      e.hurt(applyBannerDamageDealt(game, e, dmg), Math.sign(this.x - e.x) * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      // ★X2-D2（2026-09-29）：251 幽灵兜帽吸血 proc 接线——原版 Damage() 通用 on-hit
      //  段 :13712 flag10（251 magic/friendly/aiStyle46≠59）→ :13875 canGhostHeal 门 →
      //  :13877-79 ghostHeal(num41, victimCenter)。本弹自有 hurt 面此前无接线=漏。
      //  ★X2-D1（BJ393 判据推广）：受理面谓词 !vanillaGated——门拒（iframes>0
      //  :13972/dontTakeDamage :13978,dead 已上方前置）不 proc 不计数;血尽级联
      //  （:14369 族）/普通未致命尾档（:15037）返假照 proc 照计数（251
      //  usesIDStaticNPCImmunity → flag3 假 :12635 免疫门照适用=pierce 0 承载）。
      const vanillaGated = vanillaGateRejected(gate);
      if (!vanillaGated) {
        segImmuneUntil.set(e.id, nowMs() + IMMUNE_MS);   // ★清偿刀 P1：:14033-14036 静态表写=受理支内
        // ★清偿刀 W（X4-债13①,2026-09-29）：写面对齐 :14032-14037 IDStatic 支——
        //  受理尾 immune[owner]=0（全局窗显式清零,251 节流归 segImmuneUntil 10t
        //  共享表）。旧 pierce=0 通用尾档写 10t=残窗误拦他型弹 10t（缺 Arrow B6D
        //  式清窗补偿,Arrow.ts:9445 同范式）;近战域表由桥写（251 face=idStatic→0
        //  出表;显参 penetrate=-1〔:3341〕/idStaticFace 防 json 数据面漂移）。
        (e as unknown as { iframes?: number }).iframes = 0;
        noteVanillaProjImmune(game, this.projId, e.id, { penetrate: -1, idStaticFace: true });
        ghostHealProc(game, this.projId, this.pveNumHits,
          e as never as Parameters<typeof ghostHealProc>[3]);
        this.pveNumHits++;
      }
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(251);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const a = Math.max(0, Math.min(1, (255 - this.alpha) / 255));   // GetAlpha 亮度=255−alpha
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    // 绘制锚（Main.cs:29886 num143=18/num144=−10：贴图中心 = 盒中心 + (−10,−18)
    // ——段贴图骑在弹道上方而非盒心，2026-08-13 复查修正）
    ctx.translate(this.cx - 10, this.cy - 18);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    // scale 1.25（SetDefaults）——32×32 贴图 → 40×40
    ctx.drawImage(img, -20, -20, 40, 40);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export class RainbowBolt extends Entity {
  w = 12; h = 12;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** ai[0] 拱弧计时（>30 起重力） */
  private ai0 = 0;
  /** localAI[0] 铺段节拍（>4 → 铺并重置 3 = 每 2t） */
  private lai0 = 0;
  private life = 3600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.life > 2400) this.life = 2400;            // timeLeft 钳（:26703-26706）
    // 铺段（:26698-26702：localAI[0]>4 → 重置 3 = 每 2t 一片）
    this.lai0 += 1;
    if (this.lai0 > 4) {
      this.lai0 = 3;
      const seg = new RainbowSegment(this.cx, this.cy, this.vx, this.vy, this.damage, this.knockback);
      seg.critChance = this.critChance;
      seg.armorPen = this.armorPen;
      (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(seg, 'projectiles');
    }
    // 拱弧物理（:26708-26721）：ai[0] += 1（上升 vy<0 时更快）；>30 后 vy+=0.5
    // + vx×(0.95|1.05)（下落阻/升加速）——彩虹头走拱形
    let step = 1;
    if (this.vy < 0) step -= this.vy / 3;
    this.ai0 += step;
    if (this.ai0 > 30) {
      this.vy += 0.5;
      this.vx *= this.vy > 0 ? 0.95 : 1.05;
    }
    // 速度恒归一 15.95（:26723-26731）
    const sp = Math.hypot(this.vx, this.vy) || 1;
    this.vx = this.vx / sp * 15.95;
    this.vy = this.vy / sp * 15.95;
    this.x += this.vx;
    this.y += this.vy;
    // 撞块即亡（tileCollide 默认 true）——出界同亡
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) this.dead = true;
  }

  draw(_r: unknown): void {
    /* 本体恒隐形（GetAlpha :76643 return Transparent）——只铺段不显示 */
  }
}
