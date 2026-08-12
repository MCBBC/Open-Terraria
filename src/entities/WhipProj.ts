// 鞭投射物（原版 AI_165_Whip Projectile.cs:45006-45117 + FillWhipControlPoints
//  :45618-45681 + GetWhipSettings :45683-45761 1:1）：
//  生存期 ai[0] 0→timeToFlyOut（=itemAnimationMax×MaxUpdates :45685，每 tick 递增
//  MaxUpdates=extraUpdates+1；DefaultToWhip :10093-10105 宽高 18、localNPCHitCooldown=-1
//  →同敌每次挥动仅命中一次）。鞭形 = 固定锚点（玩家手部 GetPlayerArmPosition :37071）
//  出发的多段链：每段按 num4 相位角旋转累积（num5 伸展/收回包络 = 2/3 伸展 + 1/3 收回，
//  收回期整体绕锚点旋绕），命中 = 沿实际曲线每个控制点放 18×18 盒（Colliding
//  :14482-14494，getActualCollisionPoints 冻结随机相位 num13=1 :45654-45657）。
//  多目标伤害衰减 = 鞭自身 damage 字段在每次命中后 ×falloff（:12604-12678 switch，
//  第 n 个敌 ×falloff^(n-1)）；命中施加 tag（TagEffectState.TryApplyTagToNPC
//  TagEffectState.cs:178-186 + WhipTagEffect.cs:58-70）并启用 proc（:12936-12981）。
import { Entity } from './Entity';
import { applyProjStatus, applyMeleeImbue } from './projStatus';
import { hitTownNpcs } from './projTargets';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { projFrameImg, projFrameCount } from './Arrow';
import { MinionProj } from './MinionProj';
import { Arrow } from './Arrow';
import {
  WHIP_TAG, WHIP_TAG_CRIT, WHIP_TAG_BUFF, WHIP_HIT_BUFF, WHIP_HIT_SIDEKICK,
  WHIP_SEGMENTS, WHIP_RANGE, WHIP_FALLOFF, WHIP_PROC_ITEMS, WHIP_EXTRA_UPDATES,
} from './WhipTag';

export {
  WHIP_TAG, WHIP_TAG_CRIT, WHIP_TAG_BUFF, WHIP_HIT_BUFF, WHIP_HIT_SIDEKICK,
  WHIP_SEGMENTS, WHIP_RANGE, WHIP_FALLOFF, WHIP_PROC_ITEMS,
} from './WhipTag';
export { whipTagDamageOf, resolveWhipTagHit } from './WhipTag';
export type { WhipTagged } from './WhipTag';

/** 2D 向量最小形状 */
interface V2 { x: number; y: number }
const v2 = (x: number, y: number): V2 => ({ x, y });
const lerpV = (a: V2, b: V2, t: number): V2 => v2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const rotV = (ang: number): V2 => v2(Math.cos(ang), Math.sin(ang));
/** Vector2.RotatedBy(angle, origin) */
const rotAround = (p: V2, origin: V2, ang: number): V2 => {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = p.x - origin.x, dy = p.y - origin.y;
  return v2(origin.x + dx * c - dy * s, origin.y + dx * s + dy * c);
};
/** Utils.Remap（value∈[from1..to1] → 线性映射到 from2..to2，区间外截断） */
const remap = (value: number, from1: number, to1: number, from2: number, to2: number): number => {
  if (value <= from1) return from2;
  if (value >= to1) return to2;
  return from2 + (to2 - from2) * (value - from1) / (to1 - from1);
};

export class WhipProj extends Entity {
  w = 18; h = 18; // DefaultToWhip :10096-10097
  dead = false;
  /** 原版鞭投射物 id */
  projId: number;
  /** 鞭物品 id（tag 查表） */
  itemId: number;
  damage: number;
  knockback: number;
  /** useAnimation（鞭 JSON anim；SetItemAnimation 攻速 buff 后的有效值） */
  anim: number;
  /** shootSpeed（=velocity.Length()，曲线长度基数 :45643） */
  speed: number;
  /** ai[0]：update 计数（每 tick +MaxUpdates，:45014 每 update +1） */
  private ai0 = 0;
  /** ai[1]：每次挥动随机相位 -1..1（:45015；子鞭生成处重掷 :45047） */
  private ai1: number;
  /** ai[2]：月主鞭补鞭计数（≥10 = 补出的子鞭 :45025/:45047） */
  ai2 = 0;
  /** MaxUpdates = extraUpdates+1（:45685 timeToFlyOut 乘子；847/849 extraUpdates=2
   *  :7862-7885，其余 DefaultToWhip extraUpdates=1 :10103） */
  private maxUpdates: number;
  /** rotation = velocity.ToRotation()+PI/2（:45013，生存期内恒定） */
  private rotation: number;
  /** spriteDirection（:45018：velocity.X≥0 → 1） */
  private spriteDir: number;
  /** 鞭当前伤害（衰减链直接乘此字段 :12604-12678） */
  private dmgNow: number;
  /** 本挥动已命中敌（localNPCHitCooldown=-1 → 每敌一次 :10104） */
  private hitSet = new Set<number>();
  /** 星座星每挥动一次门（case 1034 localAI[0]==0 :12966-12970） */
  private localAI0 = 0;
  /** proc 启用门（case 913/1031/1032 localAI[0]==0 :12936-12940；1035 无门） */
  private procEnabled = false;
  private ownerRef: () => Player | null;
  /** 月主鞭补鞭瞄准（Game 注入鼠标方向；缺省沿用初始朝向 :45045-45046） */
  private aimAng: () => number;

  constructor(
    x: number, y: number, ang: number, projId: number, itemId: number,
    damage: number, knockback: number, anim: number, speed: number,
    owner: () => Player | null,
    aimAng?: () => number,
  ) {
    super();
    this.x = x; this.y = y;
    this.projId = projId;
    this.itemId = itemId;
    this.knockback = knockback;
    this.speed = speed;
    this.aimAng = aimAng ?? (() => ang);
    this.rotation = ang + Math.PI / 2; // :45013
    this.spriteDir = Math.cos(ang) >= 0 ? 1 : -1; // :45018
    this.ai1 = Math.random() * 2 - 1; // ai[1] = Main.rand.NextFloatDirection()
    this.maxUpdates = (WHIP_EXTRA_UPDATES.has(projId) ? 2 : 1) + 1;
    this.ownerRef = owner;
    // 鞭攻速（SetItemAnimation：summonerWeaponSpeedBonus × whipUseTimeMultiplier 封顶
    //  3×——buff 311/308/314 来源，与 Game.ts useTime 同式）
    const o = owner();
    const swb = o ? (o.whipBuffs[311] ? 0.35 : 0) + (o.whipBuffs[308] ? 0.25 : 0)
      + (o.whipBuffs[314] ? 0.12 : 0) : 0;
    const whipAtk = Math.min(3, 1 + swb * (o?.equipStats.whipSpd ?? 1));
    this.anim = Math.max(1, Math.round(anim / whipAtk));
    this.damage = damage;
    this.dmgNow = Math.max(1, Math.round(damage * (o ? o.summonDamageMult : 1))
      + (o ? o.equipStats.armorPen : 0));
  }

  /** GetWhipSettings（:45683-45761） */
  get segments(): number { return WHIP_SEGMENTS[this.projId] ?? 20; }
  get rangeMultiplier(): number { return WHIP_RANGE[this.projId] ?? 1; }
  /** timeToFlyOut = itemAnimationMax × MaxUpdates（:45685；月主子鞭固定 30 :45755-45758） */
  get timeToFlyOut(): number {
    return (this.ai2 >= 10 && this.projId === 1035 ? 30 : this.anim) * this.maxUpdates;
  }
  /** 锚点 = 玩家手部（GetPlayerArmPosition :37071 按持械帧偏移，此处取玩家中心近似） */
  private armPos(): V2 {
    const o = this.ownerRef();
    return o ? v2(o.cx, o.cy) : v2(this.x, this.y);
  }
  /** owner.whipRangeMultiplier（:45642；提基/星尘/黑曜来源） */
  private get whipRangeMultiplier(): number {
    const o = this.ownerRef();
    return o ? 1 + o.equipStats.whipRange : 1;
  }
  /** 当前挥动进度 ai[0]/timeToFlyOut（:45625） */
  get progress(): number { return this.ai0 / this.timeToFlyOut; }

  /**
   * FillWhipControlPoints 1:1（:45618-45681）：锚点出发 segments 段链。
   *  getActualCollisionPoints=true 时随机相位 ai[1] 冻结为 1（:45654-45657）——
   *  命中曲线与视觉曲线（带随机卷曲）分离，与原版一致。
   *  ai0Override 供逐 update 碰撞插值（原版每 update 跑一次 AI+Damage :15336-15340）。
   */
  pointsAt(ai0Override: number, getActualCollisionPoints: boolean): V2[] {
    const ai0 = ai0Override;
    const segments = this.segments;
    const rangeMul = this.rangeMultiplier;
    let num = ai0 / this.timeToFlyOut; // :45625
    if (this.projId === 1028) num = remap(num, 0, 1, 0.3, 0.95); // :45626-45629
    const num2 = 0.5;               // :45630
    const num3 = 1 + num2;          // :45631（Y 压扁系数 + 收回门）
    // :45632 每段相位角步进（伸展期正向、收回期反向卷绕）
    const num4 = Math.PI * 10 * (1 - num * num3) * -this.spriteDir / segments;
    let num5 = num * num3;          // :45633 伸展量
    let num6 = 0;                   // :45634 收回进度
    if (num5 > 1) {                 // :45635-45639（num>2/3 起收回）
      num6 = (num5 - 1) / num2;
      num5 = 1 - num6;
    }
    // :45640-45642 num7 = useAnimation×2 × num × whipRangeMultiplier
    const num7 = this.anim * 2 * num * this.whipRangeMultiplier;
    // :45643 每段步长（velocity.Length() = shootSpeed）
    const num8 = this.speed * num7 * num5 * rangeMul / segments;
    const arm = this.armPos();
    // :45647-45651 三条链尾初始角
    let num10 = -Math.PI / 2;
    let num12 = Math.PI / 2;
    let num11 = Math.PI / 2 + Math.PI / 2 * this.spriteDir;
    let vec = arm;      // vector（:45646）
    let vec3 = arm;     // vector3（:45650）
    let vec2 = arm;     // vector2（:45648）
    const pts: V2[] = [arm]; // :45652
    const num13 = getActualCollisionPoints ? 1 : this.ai1; // :45653-45657
    for (let i = 0; i < segments; i++) {
      const num14 = i / segments;   // :45660
      const num15 = num4 * num14 * 1 * num13; // :45661（num9 恒 1）
      const vector4 = v2(vec.x + rotV(num10).x * num8, vec.y + rotV(num10).y * num8);   // :45662
      const vector5 = v2(vec3.x + rotV(num12).x * num8 * 2, vec3.y + rotV(num12).y * num8 * 2); // :45663
      const vector6 = v2(vec2.x + rotV(num11).x * num8 * 2, vec2.y + rotV(num11).y * num8 * 2); // :45664
      const num16 = 1 - num5;       // :45665
      const num17 = 1 - num16 * num16; // :45666
      const value = lerpV(vector5, vector4, num17 * 0.9 + 0.1);  // :45667
      const vector7 = lerpV(vector6, value, num17 * 0.7 + 0.3);  // :45668
      // :45669 相对锚点缩放（Y×num3）
      const spin = v2(arm.x + (vector7.x - arm.x), arm.y + (vector7.y - arm.y) * num3);
      const num18 = num6 * num6;    // :45670-45671 收回旋绕量
      // :45672 收回期整体绕锚点旋绕（4.712389 = 3π/2）
      pts.push(rotAround(spin, arm, this.rotation + 4.712389 * num18 * this.spriteDir));
      num10 += num15; num12 += num15; num11 += num15; // :45674-45676
      vec = vector4; vec3 = vector5; vec2 = vector6;  // :45677-45679
    }
    return pts;
  }

  /** 当前控制点（命中曲线 / 视觉曲线） */
  controlPoints(getActualCollisionPoints: boolean): V2[] {
    return this.pointsAt(this.ai0, getActualCollisionPoints);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    const owner = this.ownerRef();
    const prevAi0 = this.ai0;
    this.ai0 += this.maxUpdates; // 每 update ai[0]+1（:45014）
    if (this.ai0 >= this.timeToFlyOut) { this.dead = true; return; } // :45019-45022
    // 锚点载体钉在玩家身上（锚点=手部位置，见 armPos；proj 本体随 velocity 前漂
    //  :45017 由曲线相对锚点表达）
    if (owner) { this.x = owner.cx; this.y = owner.cy; }
    // ---- 命中：每 update 沿实际曲线逐控制点放 18×18 盒（Colliding :14482-14494；
    //  Damage 每 update 跑一次 :15336-15340，此处按 MaxUpdates 插值等价）----
    for (let s = 1; s <= this.maxUpdates; s++) {
      const pts = this.pointsAt(prevAi0 + s, true);
      this.tryHit(game, owner, pts);
    }
    // ---- 月主鞭 1035 多重补鞭（:45038-45048：ai[2] < ai[0]/timeToFlyOut×3 时补一鞭
    //  并 ai[2]+1——全程累计补 3 鞭；子鞭 ai[2]≥10 不再补且固定 30t 寿命 :45755-45758）----
    if (this.projId === 1035 && this.ai2 < 10 && owner) {
      const num2 = this.progress * 3; // :45041
      if (this.ai2 < num2) {
        this.ai2 += 1; // :45044
        const lash = new WhipProj(owner.cx, owner.cy, this.aimAng(), this.projId, this.itemId,
          this.damage, this.knockback, 30, this.speed,
          () => owner, this.aimAng);
        lash.ai2 = 10 + this.ai2; // :45047（≥10 = 子鞭标记）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(lash, 'projectiles');
      }
    }
  }

  /** 单次曲线快照的命中结算（tag/proc/debuff/buff 语义见各段注释） */
  private tryHit(game: GameHooks, owner: Player | null, pts: V2[]): void {
    for (const p of pts) {
      // 城镇 NPC:巫毒窄门(原版鞭=friendly 弹,同 Damage_PVE_Inner :11970-11972——
      // 仅向导 22/裁缝师 54 装备对应巫毒娃娃时可伤;18×18 控制点盒同敌怪判定)
      hitTownNpcs({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 }, game, this.dmgNow,
        Math.sign(p.x - this.x) * 2, 'playerProj');
      for (const ent of game.enemies()) {
        const e = ent as unknown as { id: number; dead: boolean; x: number; y: number; w: number; h: number;
          hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean } & import('./WhipTag').WhipTagged;
        if (e.dead || this.hitSet.has(e.id)) continue; // localNPCHitCooldown=-1 每敌一次
        // myRect 置于控制点中心后与敌 AABB 求交（:14487-14493；18×18 → 半宽 9）
        if (p.x - 9 >= e.x + e.w || p.x + 9 <= e.x || p.y - 9 >= e.y + e.h || p.y + 9 <= e.y) continue;
        this.hitSet.add(e.id);
        const dmg = this.dmgNow; // 当前鞭伤（已含召唤乘区+护穿；衰减链前）
        e.hurt(dmg, Math.sign(p.x - this.x) * this.knockback, -1, game);
        // 命中 debuff（StatusNPC:10555——鞭型按 projId 查表,1104 火鞭等）
        applyProjStatus(this.projId, e as unknown as Record<string, number>);
        // 武器浸剂(StatusNPC:10559 门含 whip:IsAWhip)——鞭命中同享药剂 debuff
        applyMeleeImbue((game.player as unknown as { buffs: { has: (b: never) => boolean } }).buffs,
          e as unknown as Record<string, number>,
          () => game.spawnParticles(e.x + e.w / 2, e.y + e.h / 2,
            ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 }));
        // 衰减链（:12604-12678）：每次命中后鞭 damage 字段 ×falloff
        this.dmgNow = Math.max(1, Math.round(this.dmgNow * (WHIP_FALLOFF[this.projId] ?? 1)));
        // tag（TagEffectState.TryApplyTagToNPC :12758-12760 → ApplyTagToNPC :178-186）
        e.whipTagT = 240; // WhipTagEffect TagDuration（WhipTagEffect.cs:15-18）
        e.whipTagDmg = WHIP_TAG[this.itemId] ?? 0;
        e.whipTagCrit = WHIP_TAG_CRIT[this.itemId] ?? 0;
        e.whipTagItem = this.itemId;
        // proc 启用（TryDoingOnHitEffects :12936-12940 case 913/1031/1032 首命中门；
        //  :12971-12974 case 1035 无门）——TryEnableProcOnNPC 要求当前激活 tag 效果
        //  与期望一致（TagEffectState.cs:170-176），本次命中刚写入 → 恒真
        if (WHIP_PROC_ITEMS.has(this.itemId) && (this.itemId === 5480 || !this.procEnabled)) {
          this.procEnabled = true;
          e.whipProcT = 240;
          e.whipProcItem = this.itemId;
        }
        // 5479（proj 1034）星座星：鞭命中即沿曲线撒星（:12966-12970 localAI[0]==0 门
        //  + SpawnConstellationStarsTowards :13869-13881）——伤 = 本次命中伤×0.33，
        //  沿鞭每 3 个控制点一颗、垂直曲线方向飞出
        if (this.projId === 1034 && this.localAI0 === 0) {
          this.localAI0 = 1;
          const starDmg = Math.max(1, Math.round(dmg * 0.33));
          const add = (el: unknown, b: string) =>
            (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(el, b);
          for (let i = 2; i < pts.length - 1; i += 3) {
            const a = pts[i], b = pts[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            // 垂直方向（:13875-13878）：(dx,dy) 旋转 -π/2×player.direction×gravDir
            //  （gravDir 恒 1）——facing>0 → (dy,-dx)；facing<0 → (-dy,dx)，
            //  再乘 (1+NextFloatDirection×3) 随机速率（可负 → 反向）
            const f = owner ? owner.facing : 1;
            const s = (1 + (Math.random() * 2 - 1) * 3) * (f >= 0 ? 1 : -1);
            add(new Arrow(a.x, a.y, dy / d * s, -dx / d * s, starDmg, this.knockback, 1039, null,
              { grav: 0, life: 240 }), 'projectiles');
          }
        }
        // 鞭敌方直伤 debuff（ApplyWhipDebuffs :11067-11090）：913 火鞭→地狱火 323/240、
        //  912 酷鞭→霜燃 324/240（两者均为 DoT，本作复用 onFire 4s 近似）、914 荆棘鞭→
        //  1/5 中毒 180；1033 电鳗 362/240、849 黑收成 310/240 无对应 DoT 字段（标记）
        const deb = e as unknown as { onFireT?: number; poisonT?: number };
        if (this.projId === 913 || this.projId === 912) deb.onFireT = Math.max(deb.onFireT ?? 0, 4);
        if (this.projId === 914 && Math.random() < 0.2) deb.poisonT = Math.max(deb.poisonT ?? 0, 3);
        // 玩家 buff（tag 链 WhipTagEffect :42-51 与命中链 :12936-12951 两源，见表注释）
        const tb = WHIP_TAG_BUFF[this.itemId];
        const hb = WHIP_HIT_BUFF[this.itemId];
        if (tb && owner) owner.whipBuffs[tb] = 180;
        if (hb && owner) owner.whipBuffs[hb] = 180;
        if (WHIP_HIT_SIDEKICK[this.itemId] && owner) this.spawnSidekick(game, owner, this.itemId);
        game.addDamageNumber(p.x, p.y, dmg, false, '#FFD060');
      }
    }
  }

  /** 命中附属召唤（:12936-12951）：酷鞭 4911 → 雪花哨兵 917（伤 15，buff 312 维持）；
   *  麻线鞭 5473 → 小蜘蛛 1036（伤 2，buff 365 维持）——同类在场不重复生成
   *  （原版 coolWhipBuff/cobWhipBuff flag 在 buff 期内置位） */
  private spawnSidekick(game: GameHooks, owner: Player, itemId: number): void {
    const want = WHIP_HIT_SIDEKICK[itemId];
    if (!want) return;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[]; add: (e: unknown, b: string) => void } }).entities;
    if (projs.projectiles.some((m) => m instanceof MinionProj && !m.dead && m.projId === want.proj)) return;
    const m = new MinionProj(owner.cx, owner.cy - 30, want.proj, want.dmg, 1.5,
      false, 0, false, () => (owner.dead ? null : owner));
    m.noSlot = true;
    projs.add(m, 'projectiles');
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projFrameImg(this.projId, 0);
    // 视觉曲线（带随机相位卷曲 :45653）
    const pts = this.controlPoints(false);
    const arm = pts[0];
    if (!img) {
      ctx.strokeStyle = '#D8B060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arm.x, arm.y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 沿控制点排布贴图段（原版 DrawProj_Whip 以控制点切向切片绘制，此处以
    // projFrames 帧数对齐切向排布近似）
    const frames = projFrameCount(this.projId);
    const segs = frames > 1 ? Math.min(frames, pts.length - 1) : Math.min(pts.length - 1, 10);
    for (let s = 0; s < segs; s++) {
      const a = pts[Math.floor((s / segs) * (pts.length - 1))];
      const b = pts[Math.min(pts.length - 1, Math.floor(((s + 1) / segs) * (pts.length - 1)))];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang + Math.PI / 2);
      if (this.spriteDir < 0) ctx.scale(1, -1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
