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
import { hitTownNpcs, playerCanHitEnemy } from './projTargets';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { projFrameImg, projFrameCount } from './Arrow';
import { MinionProj } from './MinionProj';
import { Arrow } from './Arrow';
import { ITEM_DEFS } from '../data/items';
import { combatWeapon } from '../data/vanillaItemCombat';
import {
  WHIP_TAG, WHIP_HIT_BUFF, WHIP_HIT_SIDEKICK,
  WHIP_SEGMENTS, WHIP_RANGE, WHIP_FALLOFF, WHIP_PROC_ITEMS, WHIP_PROC_ONCE_ITEMS,
  WHIP_EXTRA_UPDATES,
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

/** Projectile.ApplyWhipDebuffs 1:1（Projectile.cs:11067-11090,StatusNPC :10670 逐命中调用）：
 *  913 火鞭 Firecracker → OnFire3(323) 240t=4s（NPC -30 lifeRegen=15HP/s）；
 *  912 酷鞭 Cool Whip → Frostburn2(324) 240t=4s（-50=25HP/s）——两者此前误并入
 *  OnFire(24) 4s 近似（-8=4HP/s）,2026-08-14 对齐分档；914 荆棘鞭 Snapthorn →
 *  1/5 AddBuff(20,180)；1033 电鳗鞭 5478 → 362/240（1457 重做：362=markedByEelWhip
 *  从"链电标记"改 DOT 表平铺 Add(100,50)=50 HP/s,NPC.cs:92781——链式缩放/标记
 *  玩家数/链电粒子全删,ApplyEelWhipDoT 成死代码）；849 黑收成 Dark Harvest →
 *  310/240 = markedByScytheWhip 仅视觉粒子（:92188,无数值效果）——不落本仓字段 */
export function applyWhipDebuffs(projId: number, enemy: Record<string, number>): void {
  if (projId === 913) enemy.onFire3T = Math.max(enemy.onFire3T ?? 0, 4);        // AddBuff(323,240)
  else if (projId === 912) enemy.frostburn2T = Math.max(enemy.frostburn2T ?? 0, 4); // AddBuff(324,240)
  else if (projId === 914 && Math.random() < 0.2) enemy.poisonT = Math.max(enemy.poisonT ?? 0, 3); // 1/5 AddBuff(20,180)
  // 1457 重做（NPC.cs:92781-92784）：电鳗鞭 1033 → 362 markedByEelWhip = DOT 表平铺
  //  Add(100,50)=50 HP/s（链式缩放/标记玩家数前置/链电粒子全删，ApplyEelWhipDoT 成
  //  死代码）——1456 的"标记无 DoT 语义"登记作废，落 eelWhipT（Enemy DOTTally 段消费）
  else if (projId === 1033) enemy.eelWhipT = Math.max(enemy.eelWhipT ?? 0, 4);  // AddBuff(362,240)
  // 849→310：markedByScytheWhip 仅视觉粒子（:92188 BlackLightningSmall,无数值效果,
  //  两版 Next(3) 均不变）——本仓无粒子管线,不写字段（登记）
}

export class WhipProj extends Entity {
  w = 18; h = 18; // DefaultToWhip :10096-10097
  dead = false;
  /** 原版鞭投射物 id */
  projId: number;
  /** 鞭物品 id（tag 查表） */
  itemId: number;
  damage: number;
  knockback: number;
  /** 词缀 bonusTagDamage（I:567——Game 侧注入；1457 管线本为命中弹自带字段,
   *  本仓挂 tag 态随 applyTagToNPC 传递（登记偏差,见 WhipTag.applyTagToNPC 注） */
  bonusTagDmg = 0;
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
  /** 蛇环补挥标记（补挥不再级联补挥;原版经 withAudioVisualFeedback=false 分支无动画自然不触发） */
  isEcho = false;
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
    // 邪恶臂镯族击退 +1（ItemCheck_Shoot :49159-49163：accWickedArmlet → KnockBack += 1;
    //  6159 本体/6163 TwilightGrasp/6179 ArmletOfRuin/6182 WickedClaws 经 SUMMON_GEAR
    //  旗聚合到 equipStats.accWickedArmlet——出鞭时刻定值,与原版 NewProjectile 前一致）
    if (o?.equipStats.accWickedArmlet) this.knockback += 1;
    const swb = o ? (o.whipBuffs[311] ? 0.35 : 0) + (o.whipBuffs[308] ? 0.25 : 0)
      + (o.whipBuffs[314] ? 0.12 : 0) : 0;
    const whipAtk = Math.min(3, 1 + swb * (o?.equipStats.whipSpd ?? 1));
    this.anim = Math.max(1, Math.round(anim / whipAtk));
    this.damage = damage;
    this.dmgNow = Math.max(1, Math.round(damage * (o ? o.summonDamageMult : 1))); // ⑥ pen 移 hurt 参
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
    // ---- 半程鞭尖音（AI_165 :45051-45070）：ai[0] 到达 (int)(timeToFlyOut/2f) 那一
    //  update,在鞭尖（FillWhipControlPoints 缺省视觉曲线 :45618 getActualCollisionPoints=
    //  false,控制点末位 = 鞭尖 :45052-45054）播音,按弹体 id 分档：1029→NPCDeath1
    //  （音量 ×0.6,PlaySound(style,pos,pitchOffset=0,volumeScale=0.6) :45057,Legacy
    //  形参序 SoundEngine.cs:88）、1030→NPCHit9（:45061）、1033→Item193（:45065）、
    //  其余全部→Item153（:45069）。本仓 ai0 每 tick 跳 maxUpdates（原版逐 update +1
    //  精确相等）→ 过半沿判定（与蛇环补挥同式 :267）;曲线取 half 时刻快照
    //  （原版 ai[0]==half 当拍求值,过沿 tick 最多滞后 maxUpdates-1 update）----
    const half = Math.floor(this.timeToFlyOut / 2); // (int)(timeToFlyOut/2f) :45051
    if (prevAi0 < half && this.ai0 >= half) {
      const pts = this.pointsAt(half, false);
      const tip = pts[pts.length - 1]; // :45054
      if (this.projId === 1029) game.playSfxFiles(['NPC_Killed_1'], 0.6, tip.x, tip.y);       // SoundID.NPCDeath1 :45057
      else if (this.projId === 1030) game.playSfxFiles(['NPC_Hit_9'], 1, tip.x, tip.y);       // SoundID.NPCHit9 :45061
      else if (this.projId === 1033) game.playSfxFiles(['Item_193'], 1, tip.x, tip.y);        // SoundID.Item193 :45065
      else game.playSfxFiles(['Item_153'], 1, tip.x, tip.y);                                  // SoundID.Item153 :45069
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
    // ---- 蛇环补挥（accSnakeBand,ItemCheck_ManageUsage :43041-43063）：真挥计数
    //  repeatWhipSwings % 3 == 0 且物品动画过半（本仓代理 = 鞭 ai0 过 timeToFlyOut/2,
    //  同一时刻）→ 补挥一鞭：maxTagEffects>1 时从手持+1 起扫背包取下一把 IsAWhip,
    //  否则同件;伤 = GetWeaponDamage×0.25（min 3）/击退 ×0.25/朝向散布 ±0.314rad
    //  （ItemCheck_Shoot !withAudioVisualFeedback 分支 :49168-49182）——无音效无动画。
    //  登记偏差：原版 GetWeaponDamage 含玩家伤害乘区+词缀,本仓取鞭表基伤
    //  （combatWeapon whip.dmg）×召唤乘区在 ctor 内,词缀不并入 ----
    if (owner?.equipStats.accSnakeBand && !this.isEcho && this.ai2 < 10
      && owner.repeatWhipSwings >= 0 && owner.repeatWhipSwings % 3 === 0
      && prevAi0 < this.timeToFlyOut / 2 && this.ai0 >= this.timeToFlyOut / 2) {
      let echoItem = this.itemId;
      let echoProj = this.projId;
      let echoDmg = this.damage;
      let echoKb = this.knockback;
      let echoAnim = this.anim;
      let echoSpeed = this.speed;
      if (owner.maxTagEffects > 1) {
        const from = owner.inv.selected + 1;
        for (let k = from; k < 50; k++) {
          const s = owner.inv.slots[k];
          if (!s) continue;
          const d = ITEM_DEFS[s.id];
          if (!d) continue;
          const cw2 = combatWeapon(d);
          if (cw2?.kind !== 'whip') continue;
          echoItem = cw2.itemId; echoProj = cw2.shoot;
          echoDmg = Math.max(1, Math.round(cw2.damage)); echoKb = cw2.knockback;
          echoAnim = cw2.useTime; echoSpeed = cw2.shootSpeed;
          break;
        }
      }
      const echo = new WhipProj(owner.cx, owner.cy,
        this.aimAng() + (Math.random() * 2 - 1) * 0.3141593, echoProj, echoItem,
        Math.max(3, Math.round(echoDmg * 0.25)), echoKb * 0.25, echoAnim, echoSpeed,
        () => owner, this.aimAng);
      echo.isEcho = true;
      (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(echo, 'projectiles');
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
        if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
        const e = ent as unknown as { id: number; dead: boolean; x: number; y: number; w: number; h: number;
          hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean } & import('./WhipTag').WhipTagged;
        if (e.dead || this.hitSet.has(e.id)) continue; // localNPCHitCooldown=-1 每敌一次
        // myRect 置于控制点中心后与敌 AABB 求交（:14487-14493；18×18 → 半宽 9）
        if (p.x - 9 >= e.x + e.w || p.x + 9 <= e.x || p.y - 9 >= e.y + e.h || p.y + 9 <= e.y) continue;
        this.hitSet.add(e.id);
        const dmg = this.dmgNow; // 当前鞭伤（已含召唤乘区+护穿；衰减链前）
        const wpOwner = this.ownerRef();
        e.hurt(dmg, Math.sign(p.x - this.x) * this.knockback, 0, game, wpOwner ? wpOwner.equipStats.armorPen : 0, false, 0, true); // kby=0 原版管线; ⑥ :12068
        // 命中 debuff（StatusNPC:10555——鞭型按 projId 查表,1104 火鞭等）
        applyProjStatus(this.projId, e as unknown as Record<string, number>);
        // 武器浸剂(StatusNPC:10559 门含 whip:IsAWhip)——鞭命中同享药剂 debuff
        applyMeleeImbue((game.player as unknown as { buffs: { has: (b: never) => boolean } }).buffs,
          e as unknown as Record<string, number>,
          () => game.spawnParticles(e.x + e.w / 2, e.y + e.h / 2,
            ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 }));
        // 衰减链（:12604-12678）：每次命中后鞭 damage 字段 ×falloff
        this.dmgNow = Math.max(1, Math.round(this.dmgNow * (WHIP_FALLOFF[this.projId] ?? 1)));
        // tag（TryApplyTagToNPC :13635-13638 → TagEffectStack :80-87）：1457 起入玩家
        // MRU 栈（时长 = TagDuration × tagEffectDuration,1456 全表 240;ImmuneToWhips
        // 11 种敌门内跳过）;自 buff（AddTheBuff :53-60）随 tag 施加,非 manual 档 ×时长
        const enVan = (e as unknown as { vanillaId?: number }).vanillaId ?? 0;
        owner?.tagEffectStack.tryApplyTagToNPC(this.itemId, e.id, enVan, this.bonusTagDmg);
        // proc 启用（TryDoingOnHitEffects :13968-14013）：{913,1031,1032} 首鞭门
        //  localAI[0]==0；{847,1033,1035} 每鞭（1457 新增 1033 电鳗鞭）
        if (WHIP_PROC_ITEMS.has(this.itemId) && (WHIP_PROC_ONCE_ITEMS.has(this.itemId) ? !this.procEnabled : true)) {
          this.procEnabled = true;
          owner?.tagEffectStack.tryEnableProcOnNPC(this.itemId, e.id);
        }
        // 5479（proj 1034）星座星雨——1456 语义（Projectile.cs:12965-12970 case 1034：
        //  localAI[0]==0 首鞭命中即 SpawnConstellationStarsTowards,无条件、无 proc 消费;
        //  :13868-13880 伤 = (int)damage×0.33/颗）。1457 的 CanProcOnNPC 门 +
        //  RemoveAllProcs + ×2×0.22 档退役。沿鞭每 3 控制点一颗、垂直曲线方向飞出
        if (this.projId === 1034 && this.localAI0 === 0 && owner) {
          this.localAI0 = 1;
          const starDmg = Math.max(1, Math.trunc(dmg * 0.33)); // :13870
          const add = (el: unknown, b: string) =>
            (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(el, b);
          for (let i = 2; i < pts.length - 1; i += 3) {
            const a = pts[i], b = pts[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            // 垂直方向（:13877）：(dx,dy) 旋转 -π/2×player.direction×gravDir
            //  （gravDir 恒 1）——facing>0 → (dy,-dx)；facing<0 → (-dy,dx)，
            //  再乘 (1+NextFloatDirection×3) 随机速率（可负 → 反向）
            const f = owner ? owner.facing : 1;
            const s = (1 + (Math.random() * 2 - 1) * 3) * (f >= 0 ? 1 : -1);
            add(new Arrow(a.x, a.y, dy / d * s, -dx / d * s, starDmg, this.knockback, 1039, null,
              { grav: 0, life: 240 }), 'projectiles');
          }
        }
        // 鞭敌方直伤 debuff（ApplyWhipDebuffs :11067-11090 表驱动 1:1）
        applyWhipDebuffs(this.projId, e as unknown as Record<string, number>);
        // 玩家 buff——tag 链已随 applyTagToNPC 入栈（AddTheBuff ×tagEffectDuration）;
        // 命中链（case 912/1028 :13981-13992）保持固定 180t 不缩放
        const hb = WHIP_HIT_BUFF[this.itemId];
        if (hb && owner) owner.whipBuffs[hb] = 180;
        // 伴生召唤出生点 = 被命中敌怪 Center（:12948/:12959 NewProjectile 位置参）
        if (WHIP_HIT_SIDEKICK[this.itemId] && owner) {
          this.spawnSidekick(game, owner, this.itemId, v2(e.x + e.w / 2, e.y + e.h / 2));
        }
        game.addDamageNumber(p.x, p.y, dmg, false, '#FFD060');
      }
    }
  }

  /** 命中附属召唤（:12943-12963）：酷鞭 4911 → 雪花哨兵 917（伤 15，buff 312 维持）；
   *  麻线鞭 5473 → 小蜘蛛 1036（伤 2，buff 365 维持）——同类在场不重复生成
   *  （原版 coolWhipBuff/cobWhipBuff flag 在 buff 期内置位）。
   *  出生点 = 被命中敌怪 Center、速度零矢量、击退 0（NewProjectile(
   *  GetProjectileSource_FromThis(), targetNPC.Center, Vector2.Zero, 917, 15, 0f,
   *  owner) :12948 / 1036, 2, 0f :12959——此前误出生玩家旁 + kb 1.5） */
  private spawnSidekick(game: GameHooks, owner: Player, itemId: number, at: V2): void {
    const want = WHIP_HIT_SIDEKICK[itemId];
    if (!want) return;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[]; add: (e: unknown, b: string) => void } }).entities;
    if (projs.projectiles.some((m) => m instanceof MinionProj && !m.dead && m.projId === want.proj)) return;
    const m = new MinionProj(at.x, at.y, want.proj, want.dmg, 0,
      false, 0, false, () => (owner.dead ? null : owner)); // kb=0f :12948/:12959
    m.noSlot = true;
    projs.add(m, 'projectiles');
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
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
