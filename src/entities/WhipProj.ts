// 鞭投射物（原版 AI_165_Whip Projectile.cs:45006-45117 + FillWhipControlPoints
//  :45618-45681 + GetWhipSettings :45683-45761 1:1）：
//  生存期 ai[0] 0→timeToFlyOut（=itemAnimationMax×MaxUpdates :45685，每 tick 递增
//  MaxUpdates=extraUpdates+1；DefaultToWhip :10093-10105 宽高 18、localNPCHitCooldown=-1
//  →同敌每次挥动仅命中一次）。鞭形 = 固定锚点（玩家手部 GetPlayerArmPosition :37071）
//  出发的多段链：每段按 num4 相位角旋转累积（num5 伸展/收回包络 = 2/3 伸展 + 1/3 收回，
//  收回期整体绕锚点旋绕），命中 = 沿实际曲线每个控制点放 18×18 盒（Colliding
//  :14482-14494，getActualCollisionPoints 冻结随机相位 num13=1 :45654-45657）。
//  多目标伤害衰减 = 鞭自身 damage 字段在每次命中后 ×falloff（1457 Projectile.cs
//  :13453-13550 switch，第 n 个敌 ×falloff^(n-1)）；命中施加 tag（TagEffectState.
//  TryApplyTagToNPC TagEffectState.cs:87-93 + WhipTagEffect.cs:34-46）并启用 proc
//  （:13968-14013）。
// 渲染层（2026-08-23 重做,1457 Main.cs:36656-37670 DrawWhip 族 1:1）：鞭身 =
// FishingLine 染色线体沿控制点链逐段旋贴（:36756-36768,per-whip 色表 :36675-36748;
// 1028-1035 flag 末段少画 1 节 :36734-36736;1035 flag2 整条不画 :36726）,鞭尖 =
// 16 个专署 tip 函数（:36818-37669）竖向帧切片沿控制点排布（WHIP_TIPS 分发表）——
// 此前误用鞭贴图整条切片近似。光照色一律原色直画（实体层画在全屏光照合成前 =
// 合成自动乘光,StringLine 渔线段链既有口径）。
import { Entity } from './Entity';
import { applyProjStatus, applyMeleeImbue } from './projStatus';
import { hitTownNpcs, playerCanHitEnemy } from './projTargets';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { projSprite } from './Arrow';
import { MinionProj } from './MinionProj';
import { Arrow } from './Arrow';
import { tintedTex } from '../render/StringLine';
import { prettyStarSparkle } from '../render/Renderer';
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
  /** 星座星每挥动一次门（case 1034 localAI[0]==0 :14001-14007） */
  private localAI0 = 0;
  /** localAI[1]（AI_165 :48541-48543：1035 首次更新 1+Main.rand.Next(3)——月主鞭
   *  尾帧行号,消费点 DrawWhip_MoonLordWhip :37067;其余鞭恒 0。原版在首次 AI 更新
   *  掷,本仓提前到 ctor——纯视觉帧档,等价） */
  private lai1: number;
  /** 蛇环补挥标记（补挥不再级联补挥;原版经 withAudioVisualFeedback=false 分支无动画自然不触发） */
  isEcho = false;
  /** proc 启用门（case 913/1031/1032 localAI[0]==0 :13970-13977；847/1033/1035 无门） */
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
    this.lai1 = projId === 1035 ? 1 + Math.floor(Math.random() * 3) : 0; // :48541-48543
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
        // 衰减链（:13453-13550）：每次命中后鞭 damage 字段 ×falloff
        this.dmgNow = Math.max(1, Math.round(this.dmgNow * (WHIP_FALLOFF[this.projId] ?? 1)));
        // tag（TryApplyTagToNPC :13635-13638 → TagEffectStack :80-87）：tag 态入玩家
        // MRU 栈（时长 = TagDuration × tagEffectDuration,1457 表 5479=480 其余 240;
        // ImmuneToWhips 11 种敌门内跳过）;自 buff（AddTheBuff :53-60）随 tag 施加,
        // 非 manual 档 ×时长
        const enVan = (e as unknown as { vanillaId?: number }).vanillaId ?? 0;
        owner?.tagEffectStack.tryApplyTagToNPC(this.itemId, e.id, enVan, this.bonusTagDmg);
        // proc 启用（TryDoingOnHitEffects :13968-14013）：{913,1031,1032} 首鞭门
        //  localAI[0]==0（:13970-13977）；{847,1033,1035} 每鞭无条件（:14009-14013）
        if (WHIP_PROC_ITEMS.has(this.itemId) && (WHIP_PROC_ONCE_ITEMS.has(this.itemId) ? !this.procEnabled : true)) {
          this.procEnabled = true;
          owner?.tagEffectStack.tryEnableProcOnNPC(this.itemId, e.id);
        }
        // 5479（proj 1034）星座星雨——1457 语义（Projectile.cs:14001-14007 case 1034：
        //  localAI[0]==0 且 CanProcOnNPC(5479,敌) 才撒星 → localAI[0]=1 + RemoveAllProcs；
        //  proc 窗由随从命中经 WhipTagEffect_Constellation.OnTaggedHit :6-10 启用）。
        //  ConstellationWhip_SpawnConstellationStarsTowards（:15013-15036）伤 =
        //  (int)((int)(damage×2)×0.22)/颗（:14005 传 damage×2 → :15016-15017 num=0.22），
        //  damage = 衰减后的鞭伤（falloff :13453 先于 TryDoingOnHitEffects :13641）。
        //  沿鞭每 3 控制点一颗、垂直曲线方向飞出
        if (this.projId === 1034 && this.localAI0 === 0 && owner
          && owner.tagEffectStack.canProcOnNPC(5479, e.id)) {
          this.localAI0 = 1;
          owner.tagEffectStack.removeAllProcs(5479);                          // :14006
          const starDmg = Math.max(1, Math.trunc(this.dmgNow * 2 * 0.22));    // :14005 + :15016-15017
          const add = (el: unknown, b: string) =>
            (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(el, b);
          for (let i = 2; i < pts.length - 1; i += 3) {
            const a = pts[i], b = pts[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            // 垂直方向（:15023-15025）：(dx,dy) 旋转 -π/2×player.direction×gravDir
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
    // 视觉曲线（带随机相位卷曲 :45653）
    const pts = this.controlPoints(false);
    const img = projSprite(this.projId);
    const lineTex = r.atlas?.ensureVImage?.('vanilla/FishingLine.png') ?? null;
    if (!img && !lineTex) {
      // 双贴图未就绪（懒加载首帧）→ 折线兜底,下帧自愈
      ctx.strokeStyle = '#D8B060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // ① 鞭身渔线（DrawWhip :36732-36756）;1034 flag3（:36747-36749 color2=color
    //    免逐段取光）→ 线体收集进 Renderer 全亮队列、compositeLight 后固定色直画
    if (lineTex && this.projId === 1034 && r.whipFullbrightQueue) {
      r.whipFullbrightQueue.push({
        pts: pts.map((p) => ({ x: p.x, y: p.y })),
        tex: lineTex as never,
        color: [...WHIP_1034_LINE] as [number, number, number, number],
      });
    } else if (lineTex) drawWhipLineBody(ctx, lineTex, this.projId, pts);
    // ② 鞭尖（DrawWhip switch :36759-36815 → WHIP_TIPS 分发表）
    const tip = WHIP_TIPS[this.projId];
    if (tip && img) {
      tip({
        ctx, tex: img,
        // GlowMask[358]（DrawWhip_EelWhip :37206-37207 加色辉光,仅电鳗鞭消费）
        glow: this.projId === 1033 ? r.atlas?.ensureVImage?.('vanilla/Glow_358.png') ?? null : null,
        pts, n: pts.length - 1, prog: this.progress, dir: this.spriteDir,
        lai1: this.lai1, hue: whipHueClock(), opacity: 1, // proj.Opacity :542-547 = 1-alpha/255,鞭 alpha 恒 0
      });
    }
    ctx.restore();
  }
}

// ===================== 鞭渲染（1457 Main.cs:36656-37670 DrawWhip 族 1:1） =====================
// DrawWhip（:36656-36816）两层：
//  ① 鞭身 = TextureAssets.FishingLine（12×12）染色线体,沿控制点链逐段旋贴
//    （:36740-36756）：段色 = Lighting.GetColor(段位,per-whip 色表 :36669-36729)——
//    本仓实体层画在全屏光照合成【前】= 合成自动乘光（StringLine 渔线段链同口径,
//    逐像素乘光 ≈ 逐段取光）;scale=(1,(段长+2)/12)、origin=(W/2,2)（:36662/
//    :36746）。flag（1028-1035 :36694-36726）→ num-- 末段少画 1 节（:36734-36736,
//    鞭尖贴图占位）;flag2（仅 1035 false :36726）→ 整条不画线体;flag3（1034 :36721）
//    → 免逐段取光（本仓合成乘光近似,登记偏差）。
//  ② 鞭尖 = 16 个专署 tip 函数（:36818-37669）把 Projectile_*.png 竖向帧切片
//    （Texture2D.Frame(cols,rows) :36822 后 Height-=2 :36824、origin=Size/2 :36825 等）,
//    部分档 origin.Y-4/-8）沿控制点排布;段色 = Lighting.GetColor → 本仓 White 直画。
//  【累计位形等价】SlimeWhip/MeteorWhip/MoonLordWhip/EelWhip/BoneWhip/CoolWhip/
//  FireWhip/RainbowWhip/ThornWhip/WhipSword 的 vector2 从 controlPoints[0] 起每段
//  累加段矢量（:36826/:36861 等）——累计和 ≡ controlPoints[i],统一按 pts[i] 取位。
//  【预乘混合】XNA AlphaBlend = 预乘（One/InvSrcAlpha）：画色 C 实效 =
//  tex.rgb×C.rgb + 背景×(1−C.A) —— A=0 纯加色（'lighter'+摊平染色）、A≥255 纯替换
//  （保形染色 source-over）、中间档两笔（StringLine.drawSegment 同款三档）。

type Tex = ImageBitmap | HTMLImageElement;
type RGBA = readonly [number, number, number, number];
/** 不透明白（各 tip 的 Lighting.GetColor 档——本仓合成乘光,原色直画） */
const TIP_WHITE: RGBA = [255, 255, 255, 255];
const scalarLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** miscCounterNormalized 等价（Player.cs:3373 = miscCounter/300;miscCounter 每
 *  tick +1、wrap 300 :29529-29531 → 5s 一循环;performance.now 秒/5 同率同域）。
 *  消费点 = DrawWhip_RainbowWhip :37361（晨星鞭彩虹相） */
function whipHueClock(): number {
  return typeof performance !== 'undefined' ? (performance.now() / 5000) % 1 : 0;
}

/** Main.hslToRgb（:48689-48728,hue2rgb :48730-48748）——Math.Round 后 (byte) */
function hue2rgb(c: number, t1: number, t2: number): number {
  if (c < 0) c++;
  if (c > 1) c--;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}
function hslToRgb255(h: number, s: number, l: number, a: number): RGBA {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = Math.round(l * 255); }
  else {
    const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const t1 = 2 * l - t2;
    r = Math.round(hue2rgb(h + 1 / 3, t1, t2) * 255);
    g = Math.round(hue2rgb(h, t1, t2) * 255);
    b = Math.round(hue2rgb(h - 1 / 3, t1, t2) * 255);
  }
  return [(r & 0xff), (g & 0xff), (b & 0xff), (a & 0xff)];
}

/** 1034 线色 = hslToRgb(0.6,1,0.5,20)×0.6（:36720,XNA Color*float 截断）
 *  = (0,102,255,20)×0.6 → (0,61,153,12)——A=12 中间档（近纯加色） */
const WHIP_1034_LINE: RGBA = (() => {
  const c = hslToRgb255(0.6, 1, 0.5, 20);
  const t = (v: number) => Math.trunc(v * 0.6) & 0xff;
  return [t(c[0]), t(c[1]), t(c[2]), t(c[3])];
})();

/** 鞭身线色表（DrawWhip switch :36669-36729;表外 = 缺省 White :36663） */
export const WHIP_LINE_COLORS: Record<number, RGBA> = {
  847: [255, 69, 0, 255],      // OrangeRed :36669-36670
  849: [0, 0, 0, 255],         // SlateBlue→Black（:36672-36674 死赋值,落终态 Black）
  848: [0, 0, 139, 255],       // DarkBlue :36676-36677
  912: [173, 216, 230, 255],   // LightBlue :36679-36680
  913: [178, 34, 34, 255],     // Firebrick :36682-36683
  914: [34, 139, 34, 255],     // ForestGreen :36685-36686
  915: [255, 255, 255, 255],   // White :36688-36689
  952: [210, 180, 140, 255],   // Tan :36691-36692
  1028: [128, 128, 128, 255],  // Gray :36694-36696
  1029: [128, 0, 128, 255],    // Purple :36698-36700
  1030: [255, 0, 0, 255],      // Red :36702-36704
  1031: [88, 85, 155, 255],    // new Color(88,85,155) :36706-36708
  1032: [143, 215, 29, 255],   // new Color(143,215,29) :36710-36712
  1033: [0, 0, 255, 255],      // Blue :36714-36716
  1034: WHIP_1034_LINE,        // hslToRgb(0.6,1,0.5,20)×0.6 :36718-36721
  1035: [0, 255, 0, 255],      // Lime :36723-36725
  1104: [78, 136, 255, 255],   // new Color(78,136,255) :36728-36729（画时再 ×0.5 :36751-36753）
};

/** flag（:36694-36726 置位的 1028-1035）→ 鞭身末段少画 1 节（:36734-36736） */
const WHIP_TAIL_SHORT = new Set([1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035]);

/** 鞭身线体段数（:36732-36740）：num = list.Count-1（= segments）,flag 再 -1;
 *  1035 flag2=false 整条不画（:36726/:36738）。测试/调试用纯函数 */
export function whipLineSegmentCount(projId: number, segments: number): number {
  if (projId === 1035) return 0;
  return WHIP_TAIL_SHORT.has(projId) ? segments - 1 : segments;
}

/** 预乘三档染色帧绘制（XNA spriteBatch.Draw 等价;StringLine.drawSegment 同款语义
 *  泛化到任意源/宿矩形+翻转）：pos=落点、ang=旋转、origin=(ox,oy) 贴图内锚点、
 *  sc=(sx,sy) 缩放。白 A=255 免染色直画（node 测试无 canvas 也走此档）。 */
function drawWhipFrame(
  ctx: CanvasRenderingContext2D, tex: Tex,
  sx: number, sy: number, sw: number, sh: number,
  px: number, py: number, ang: number,
  ox: number, oy: number, scx: number, scy: number,
  color: RGBA, flip = false,
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  if (flip) ctx.scale(-1, 1);   // XNA FlipHorizontally（origin 恒水平中点,翻转等价）
  ctx.imageSmoothingEnabled = false;
  const dx = -ox * scx, dy = -oy * scy;
  const dw = sw * scx, dh = sh * scy;
  const [r, g, b, a] = color;
  if (r === 255 && g === 255 && b === 255 && a === 255) {
    ctx.drawImage(tex, sx, sy, sw, sh, dx, dy, dw, dh);
  } else if (a === 0) {
    // 纯加色：摊平染色 + 'lighter'（A=0 预乘 = 背景零衰减）
    const t = tintedTex(tex, [r, g, b], true);
    if (t) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(t, sx, sy, sw, sh, dx, dy, dw, dh); }
  } else if (a >= 255) {
    // 纯替换：保形染色 source-over
    const t = tintedTex(tex, [r, g, b], false);
    if (t) ctx.drawImage(t, sx, sy, sw, sh, dx, dy, dw, dh);
  } else {
    // 中间档两笔：黑形压暗背景(×(1−A/255)) + 摊平染色 'lighter' 补贡献
    const black = tintedTex(tex, [0, 0, 0], false);
    const t = tintedTex(tex, [r, g, b], true);
    if (black && t) {
      ctx.globalAlpha = a / 255;
      ctx.drawImage(black, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(t, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }
  ctx.restore();
}

/** 竖向帧切片（Texture2D.Frame(cols,rows)[row] 再 Height-=2,各 DrawWhip_* 同款：
 *  :36822-36825/:36869-36872/:37356-37359 等;MoonLordWhip :37058-37060 为 4×7） */
function whipFrameRect(tex: Tex, cols: number, rows: number, row: number): {
  sx: number; sy: number; sw: number; sh: number;
} {
  const fw = tex.width / cols, fh = tex.height / rows;
  return { sx: 0, sy: row * fh, sw: fw, sh: fh - 2 };
}

/** DrawWhip_* 共享上下文（proj 字段 + 视觉控制点） */
export interface WhipTipCtx {
  ctx: CanvasRenderingContext2D;
  /** TextureAssets.Projectile[proj.type]（各 tip 的帧切片源） */
  tex: Tex;
  /** TextureAssets.GlowMask[358]（仅 DrawWhip_EelWhip :37206-37207 加色辉光） */
  glow: Tex | null;
  /** FillWhipControlPoints 视觉曲线（:36658） */
  pts: V2[];
  /** controlPoints.Count - 1（各函数 num3/num4 = 段数） */
  n: number;
  /** GetWhipAnimationPercent（:45763-45768）= ai[0]/timeToFlyOut */
  prog: number;
  /** spriteDirection（:45018） */
  dir: number;
  /** localAI[1]（1035 尾帧行,AI_165 :48541-48543） */
  lai1: number;
  /** miscCounterNormalized（Player.cs:3373;DrawWhip_RainbowWhip :37361） */
  hue: number;
  /** proj.Opacity（Projectile.cs:542-547 = 1-alpha/255,鞭恒 1） */
  opacity: number;
}

/** 段绘制共用（各 tip 循环体同构）：第 i 段 = pts[i]→pts[i+1] 切向,帧 row
 *  （竖向 rows 行、cols 列）,oyShift = origin.Y 偏移（-4/-8 档）,sc=(sx,sy)。 */
function whipSeg(
  c: WhipTipCtx, i: number, rows: number, cols: number, row: number,
  oyShift: number, sx: number, sy: number, flip: boolean, color: RGBA = TIP_WHITE,
): void {
  const a = c.pts[i], b = c.pts[i + 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const fr = whipFrameRect(c.tex, cols, rows, row);
  drawWhipFrame(c.ctx, c.tex, fr.sx, fr.sy, fr.sw, fr.sh,
    a.x, a.y, Math.atan2(dy, dx) - Math.PI / 2,
    fr.sw / 2, fr.sh / 2 - oyShift, sx, sy, color, flip);
}

/** Utils.GetLerpValue(from,to,t,clamped:true)（Utils.cs:315-334,含 from>to 反向档） */
function getLerpValue(from: number, to: number, t: number): number {
  if (from < to) { if (t < from) return 0; if (t > to) return 1; }
  else { if (t < to) return 1; if (t > from) return 0; }
  return (t - from) / (to - from);
}

/** 挥动包络（:37541-37542/:37601-37602/:37661-37662 同式）：
 *  GetLerpValue(0.1,0.7,t)×GetLerpValue(0.9,0.7,t) —— 伸展期升、0.7 峰值、收回期降 */
function whipSwingEnvelope(t: number): number {
  return getLerpValue(0.1, 0.7, t) * getLerpValue(0.9, 0.7, t);
}

/** Utils.MultiLerp(percent,0,1,0)（Utils.cs:279-290）——电鳗鞭 i==1 段 X 抖动包络
 *  （:37183） */
function multiLerp010(p: number): number {
  const f = [0, 1, 0];
  const step = 1 / (f.length - 1);
  let acc = step, idx = 0;
  while (p / acc > 1 && idx < f.length - 2) { acc += step; idx++; }
  return f[idx] + (f[idx + 1] - f[idx]) * ((p - step * idx) / step);
}

// -------------------- 16 个专署鞭尖函数（:36818-37669 全量 1:1） --------------------

/** DrawWhip_WhipSword（:37446-37495,847 剑鞭）：帧档 switch :37458-37482——
 *  {0}→0(Y-4)/{3,5,7}→1/{9,11,13}→2/{15,17}→3/{19}→4,其余跳笔（:37480-37482）;
 *  scale 1、无翻转 */
function whipTipSword(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row = -1, oy = 0;
    if (i === 0) { oy = 4; row = 0; }
    else if (i === 3 || i === 5 || i === 7) row = 1;        // switch :37458-37482
    else if (i === 9 || i === 11 || i === 13) row = 2;
    else if (i === 15 || i === 17) row = 3;
    else if (i === 19) row = 4;
    if (row < 0) continue;                                   // default flag=false :37480-37482
    whipSeg(c, i, 5, 1, row, oy, 1, 1, false);
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_WhipBland（:37617-37669,841 皮鞭）：每段都画,行 = 1/2/3 按 i>10/i>20
 *  分档（:37643-37652）,尾段 row4 + scale=lerp(0.5,1.5,包络)（:37654-37662——
 *  先赋 1.3 再被覆写,净效果只余 lerp）;spriteDirection==1 水平翻转 */
function whipTipBland(c: WhipTipCtx): V2 {
  const flip = c.dir === 1;                                  // :37619-37622
  for (let i = 0; i < c.n; i++) {
    let row = 0, oy = 0, sc = 1;
    if (i === 0) oy = 4;                                     // :37637
    else row = i > 20 ? 3 : i > 10 ? 2 : 1;                  // :37643-37652
    if (i === c.n - 1) {                                     // i == Count-2 :37654-37662
      row = 4;
      sc = scalarLerp(0.5, 1.5, whipSwingEnvelope(c.prog));
    }
    whipSeg(c, i, 5, 1, row, oy, sc, sc, flip);              // float scale → 双轴
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_WhipMace（:37497-37555,848 晨星鞭）：偶数段画（i%2==0,行 1/2/3 按
 *  i>10/i>20 分档 :37520-37532）,尾段 row4 + scale=lerp(0.5,2,包络)（:37534-37542） */
function whipTipMace(c: WhipTipCtx): V2 {
  const flip = c.dir === 1;                                  // :37499-37502
  for (let i = 0; i < c.n; i++) {
    let draw = false, row = 0, oy = 0, sc = 1;
    if (i === 0) { oy = 4; draw = true; }                    // :37517-37518
    else if (i % 2 === 0) { draw = true; row = i > 20 ? 3 : i > 10 ? 2 : 1; }
    if (i === c.n - 1) {                                     // i == Count-2 :37534-37542
      draw = true; row = 4;
      sc = scalarLerp(0.5, 2, whipSwingEnvelope(c.prog));
    }
    if (!draw) continue;
    whipSeg(c, i, 5, 1, row, oy, sc, sc, flip);              // float scale → 双轴
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_WhipScythe（:37557-37615,849 黑收成）：与 Mace 全同,尾段 scale 改
 *  lerp(0.5,1.5,包络)（:37594-37602） */
function whipTipScythe(c: WhipTipCtx): V2 {
  const flip = c.dir === 1;                                  // :37559-37562
  for (let i = 0; i < c.n; i++) {
    let draw = false, row = 0, oy = 0, sc = 1;
    if (i === 0) { oy = 4; draw = true; }
    else if (i % 2 === 0) { draw = true; row = i > 20 ? 3 : i > 10 ? 2 : 1; }
    if (i === c.n - 1) {                                     // i == Count-2 :37594-37602
      draw = true; row = 4;
      sc = scalarLerp(0.5, 1.5, whipSwingEnvelope(c.prog));
    }
    if (!draw) continue;
    whipSeg(c, i, 5, 1, row, oy, sc, sc, flip);              // float scale → 双轴
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_CoolWhip（:37251-37300,912 酷鞭）≡ DrawWhip_FireWhip（:37302-37351,
 *  913 火鞭）——帧表/色/缩放逐行相同,同体共享。帧档 {0}→0(Y-4)/{3,5,7}→1/
 *  {9,11,13}→2/{15,17}→3/{19}→4,其余跳笔;色 = GetAlpha(Lighting)（alpha=0 → 原色） */
function whipTipCoolWhip(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row = -1, oy = 0;
    if (i === 0) { oy = 4; row = 0; }
    else if (i === 3 || i === 5 || i === 7) row = 1;        // switch :37263-37286
    else if (i === 9 || i === 11 || i === 13) row = 2;
    else if (i === 15 || i === 17) row = 3;
    else if (i === 19) row = 4;
    if (row < 0) continue;
    whipSeg(c, i, 5, 1, row, oy, 1, 1, false);
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_ThornWhip（:37406-37444,914 荆棘鞭）：每段都画,尾段 row4 scale1.1、
 *  其余 row=1+i%3 scale0.8（switch :37419-37430） */
function whipTipThorn(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row = 0, oy = 0, sc = 1;
    if (i === 0) oy = 4;
    else if (i === 19) { row = 4; sc = 1.1; }
    else { row = 1 + (i % 3); sc = 0.8; }
    whipSeg(c, i, 5, 1, row, oy, sc, sc, false);            // float scale → 双轴 :37433
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_RainbowWhip（:37353-37404,915 晨星）：彩虹相 hue=(miscCounterNorm×5+
 *  i×0.05)%1（:37383）;i==0(Y-4)/i==39(row4) 恒画,其余 i%2==0 才画（:37369-37377）。
 *  三笔：①Lerp(光色,彩虹色×A127×lerpValue,0.5)（:37391） ②彩虹×0.1 加色 ×1.2
 *  （:37392-37393） ③i==39 彩虹×0.3(A127) ×1.4（:37396-37398） */
function whipTipRainbow(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let draw = true, row = 0, oy = 0;
    if (i === 0) { oy = 4; row = 0; }
    else if (i === 39) row = 4;
    else { draw = i % 2 === 0; row = 1 + (i % 3); }           // :37371-37376
    if (!draw) continue;
    const hue = (((c.hue * 5 + i * 0.05) % 1) + 1) % 1;      // :37383
    const col = hslToRgb255(hue, 1, 0.5, 255);
    const lv = getLerpValue(c.n - 10, c.n - 2, i);            // :37385
    const a1 = Math.trunc(127 * lv) & 0xff;                   // A/=2 再 ×lv（:37387-37388）
    const a = c.pts[i], b = c.pts[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    const fr = whipFrameRect(c.tex, 1, 5, row);
    const ox = fr.sw / 2, oy2 = fr.sh / 2 - oy;
    // ①Lerp(Lighting, color2, 0.5)（:37391）——光色本仓取 White（合成乘光）
    const c1: RGBA = [
      Math.trunc(255 + (col[0] - 255) * 0.5) & 0xff,
      Math.trunc(255 + (col[1] - 255) * 0.5) & 0xff,
      Math.trunc(255 + (col[2] - 255) * 0.5) & 0xff, a1,
    ];
    drawWhipFrame(c.ctx, c.tex, fr.sx, fr.sy, fr.sw, fr.sh, a.x, a.y, ang, ox, oy2, 1, 1, c1);
    // ②color2.A=0 → ×0.1,scale ×1.2（:37392-37393,加色）
    drawWhipFrame(c.ctx, c.tex, fr.sx, fr.sy, fr.sw, fr.sh, a.x, a.y, ang, ox, oy2, 1.2, 1.2,
      [Math.trunc(col[0] * 0.1) & 0xff, Math.trunc(col[1] * 0.1) & 0xff, Math.trunc(col[2] * 0.1) & 0xff, 0]);
    if (i === 39) {
      // ③color2=color,A=127 → ×0.3,scale ×1.4（:37396-37398）
      drawWhipFrame(c.ctx, c.tex, fr.sx, fr.sy, fr.sw, fr.sh, a.x, a.y, ang, ox, oy2, 1.4, 1.4,
        [Math.trunc(col[0] * 0.3) & 0xff, Math.trunc(col[1] * 0.3) & 0xff, Math.trunc(col[2] * 0.3) & 0xff, 127]);
    }
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_BoneWhip（:37214-37249,952 骨鞭）：每段都画,i==0(Y-4)/i==19(row4)/
 *  其余 row=1+i%3（switch :37226-37236） */
function whipTipBone(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row = 0, oy = 0;
    if (i === 0) oy = 4;
    else if (i === 19) row = 4;
    else row = 1 + (i % 3);
    whipSeg(c, i, 5, 1, row, oy, 1, 1, false);
  }
  return c.pts[c.n - 1];
}

/** DrawWhip_SlimeWhip（:36818-36864,1104 史莱姆鞭）：i==0(row0 :36836)/尾段
 *  (row4 :36840)/其中 row=round(lerp(1,3,(i-1)/(n-2)))（:36845-36846）且仅 i%3==0
 *  画（:36847）;色 = Lighting×0.5 → White×0.5 = (127,127,127,127) 截断（:36858） */
function whipTipSlime(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row: number, draw = true;
    if (i === 0) row = 0;
    else if (i === c.n - 1) row = 4;                            // i == num4-1 :36840
    else {
      row = Math.round(scalarLerp(1, 3, (i - 1) / (c.n - 2)));  // num3 = max(1, num-2) = 3 :36828
      if (i % 3 !== 0) draw = false;                            // :36847-36849
    }
    if (!draw) continue;
    whipSeg(c, i, 5, 1, row, 0, 1, 1, false, [127, 127, 127, 127]);
  }
  return c.pts[c.n];   // 累计位形走完 = 末控制点（:36863）
}

/** DrawWhip_GenericWhip（:36866-36921,1028 麻线鞭 seg6 w1 / 1029 恶魔鞭 1030 血鞭
 *  seg6 w0.5）：跳 i==1（:36882）,i==0(Y-4 :36893-36895)/尾段(row=segmentCount-1
 *  :36897-36899)/其余 row=1+num4%(segmentCount-2)（:36903-36904）;
 *  sx=Remap(num4,5,n×0.75,startW,endW)（:36912-36915,num4==0 → 1） */
function whipTipGeneric(c: WhipTipCtx, segmentCount: number, startWidth: number, endWidth: number): V2 {
  const num2 = Math.max(1, segmentCount - 1);                 // :36874
  const num3 = c.n;                                            // controlPoints.Count-1 :36875
  for (let i = 0; i < num3; i++) {
    if (i === 1) continue;                                      // :36882
    let row: number, oy = 0;
    if (i === 0) { oy = 4; row = 0; }                           // :36893-36895
    else if (i === num3 - 1) row = segmentCount - 1;           // :36897-36899
    else row = 1 + (i % (num2 - 1));                           // num5 = num4 % (num2-num) :36903-36904
    let sx = remap(i, 5, num3 * 0.75, startWidth, endWidth);   // :36912
    if (i === 0) sx = 1;                                        // :36913-36915
    whipSeg(c, i, segmentCount, 1, row, oy, sx, 1, false);
  }
  return c.pts[num3 - 1];
}

/** DrawWhip_FlowerWhip（:36923-36980,1032 花鞭 seg5 w0.5）：同 GenericWhip,但
 *  中段仅 i%2==0 画（:36962）,尾段 origin.Y-8（:36951-36954） */
function whipTipFlower(c: WhipTipCtx, segmentCount: number, startWidth: number, endWidth: number): V2 {
  const num2 = Math.max(1, segmentCount - 1);                 // :36931
  const num3 = c.n;                                              // :36932
  for (let i = 0; i < num3; i++) {
    let row: number, oy = 0;
    if (i === 0) { oy = 4; row = 0; }                           // :36947-36949
    else if (i === num3 - 1) { row = segmentCount - 1; oy = 8; } // :36951-36954
    else {
      row = 1 + (i % (num2 - 1));                               // :36958-36959
      if (i % 2 !== 0) continue;                                // :36962
    }
    let sx = remap(i, 5, num3 * 0.75, startWidth, endWidth);   // :36971
    if (i === 0) sx = 1;                                        // :36972-36974
    whipSeg(c, i, segmentCount, 1, row, oy, sx, 1, false);
  }
  return c.pts[num3 - 1];
}

/** DrawWhip_Constellation（:36982-37054,1034 星座鞭 seg6）：GenericWhip 同构 + 星芒
 *  ——跳 i==1（:37000）;i==0(Y-4,fatness0 :37012-37015)/尾段(row5,fatness×2
 *  :37017-37020);中段色 (255,255,255,50) 且 sx×0.5（:37040-37043）;
 *  fatness×=1+i×0.03（:37033）;(i+1)%3==0 → DrawPrettyStarSparkle（:37047-37049,
 *  shine=hsl(0.6,1,0.5) :37034、draw=White×0.5、flare=挥动进度 :36992、rot=π/2、
 *  scale=(Remap(p,0,1,2,0),Remap(p,0,1,4,0))） */
function whipTipConstellation(c: WhipTipCtx, segmentCount: number): V2 {
  const num2 = Math.max(1, segmentCount - 1);                 // :36990
  const num4 = c.n;                                              // :36993
  for (let i = 0; i < num4; i++) {
    if (i === 1) continue;                                      // :37000
    let fat = 1;                                                // fatness = Vector2.One :37002
    let row: number, oy = 0;
    if (i === 0) { oy = 4; row = 0; fat = 0; }                 // :37012-37015
    else if (i === num4 - 1) { row = segmentCount - 1; fat = 2; } // :37017-37020
    else row = 1 + (i % (num2 - 1));                           // num6 = num5 % (num2-num) :37024-37025
    let sx = remap(i, 5, num4 * 0.75, 1, 1);                   // :37035
    if (i === 0) sx = 1;                                        // :37036-37038
    fat *= 1 + i * 0.03;                                        // :37033
    let color: RGBA = TIP_WHITE;
    if (i !== 0 && i !== num4 - 1) { color = [255, 255, 255, 50]; sx *= 0.5; } // :37040-37043
    whipSeg(c, i, segmentCount, 1, row, oy, sx, 1, false, color);
    if ((i + 1) % 3 === 0) {                                    // :37047
      const p = c.pts[i];
      const shine = hslToRgb255(0.6, 1, 0.5, 255);              // hslToRgb(0.6,1,0.5) = (0,102,255)
      prettyStarSparkle(c.ctx, c.opacity, p.x, p.y,
        [255, 255, 255], [shine[0], shine[1], shine[2]],
        c.prog, 0, 0.5, 0.5, 1, Math.PI / 2,
        [remap(c.prog, 0, 1, 2, 0), remap(c.prog, 0, 1, 4, 0)], [fat, fat],
        0.5, 1);                                                // drawColor=White×0.5 → drawDim 0.5
    }
  }
  return c.pts[num4 - 1];
}

/** DrawWhip_MoonLordWhip（:37056-37106,1035 月主鞭）：Frame(4,7)（:37060）列 0、
 *  scale (1,1.25)（:37091）,尾帧行 = 4+(localAI[1]-1)（:37067,lai1∈1..3 → row4..6）;
 *  i==0(Y-4 :37075)/尾段（:37079）/其余 row=1+i%3（:37083）。1457 的尾彩
 *  rectangle2/color2（:37093-37098）算后未画 = 死代码,不录（1456 曾有第二笔彩虹
 *  描,1457 终态已删）;子鞭 flag=ai[2]>=10（:37068）在 1457 无视觉差 */
function whipTipMoonLord(c: WhipTipCtx): V2 {
  const tailRow = 4 + (c.lai1 - 1);                            // :37067
  for (let i = 0; i < c.n; i++) {
    let row: number, oy = 0;
    if (i === 0) { oy = 4; row = 0; }
    else if (i === c.n - 1) row = tailRow;                      // i == num4-1 :37079
    else row = 1 + (i % 3);                                     // num5 = i % (num2-num) = i%3 :37083
    whipSeg(c, i, 7, 4, row, oy, 1, 1.25, false);
  }
  return c.pts[c.n];
}

/** DrawWhip_MeteorWhip（:37108-37153,1031 星陨鞭 seg6）：i==0(row0)/尾段(row5)/
 *  其余 row=round(lerp(1,4,(i-1)/(n-2)))（:37135-37136）且仅 i%3==0 画（:37137）;
 *  色 = 恒 White 不取光（:37147,本仓同直画） */
function whipTipMeteor(c: WhipTipCtx): V2 {
  for (let i = 0; i < c.n; i++) {
    let row: number, draw = true;
    if (i === 0) row = 0;
    else if (i === c.n - 1) row = 5;                            // i == num4-1 :37130
    else {
      row = Math.round(scalarLerp(1, 4, (i - 1) / (c.n - 2)));  // num3 = max(1, num-2) = 4 :37118
      if (i % 3 !== 0) draw = false;                            // :37137-37139
    }
    if (!draw) continue;
    whipSeg(c, i, 6, 1, row, 0, 1, 1, false, TIP_WHITE);
  }
  return c.pts[c.n];
}

/** DrawWhip_EelWhip（:37155-37212,1033 电鳗鞭 seg5）：i==0 跳笔（:37178-37179）;
 *  i==1(row0,X 抖动 = -6×MultiLerp(prog,0,1,0) 随段角旋转 :37181-37183);尾段
 *  row4（:37189）;其余 row 按 i<25/i<35 分 1/2/3（:37192-37193）;
 *  sx=Remap(i,2,n-5,0.5,1)（:37203）;本体（:37205）+ GlowMask[358] 同矩形加色辉光
 *  （:37206-37207,A=0 纯加色）;dir==1 水平翻转（:37158-37161） */
function whipTipEel(c: WhipTipCtx): V2 {
  const flip = c.dir === 1;                                     // :37158-37161
  for (let i = 0; i < c.n; i++) {
    let draw = true, row = 0, spX = 0;
    if (i === 0) draw = false;                                  // :37178-37179
    else if (i === 1) { row = 0; spX = -6 * multiLerp010(c.prog); } // :37181-37183
    else if (i === c.n - 1) row = 4;                            // i == num2-1 :37189
    else row = i < 25 ? 1 : i < 35 ? 2 : 3;                     // :37192-37193
    if (!draw) continue;
    const a = c.pts[i], b = c.pts[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);               // num4 原始角（未 -π/2）
    const px = a.x + Math.cos(ang) * spX, py = a.y + Math.sin(ang) * spX; // spinningpoint.RotatedBy :37205
    const fr = whipFrameRect(c.tex, 1, 5, row);
    const sx = remap(i, 2, c.n - 5, 0.5, 1);                    // :37203 ×proj.scale(=1)
    drawWhipFrame(c.ctx, c.tex, fr.sx, fr.sy, fr.sw, fr.sh,
      px, py, ang - Math.PI / 2, fr.sw / 2, fr.sh / 2, sx, 1, TIP_WHITE, flip);
    if (c.glow) {
      drawWhipFrame(c.ctx, c.glow, fr.sx, fr.sy, fr.sw, fr.sh,
        px, py, ang - Math.PI / 2, fr.sw / 2, fr.sh / 2, sx, 1, [255, 255, 255, 0], flip);
    }
  }
  return c.pts[c.n];
}

/** GenericWhip 1029/1030 共用包装（原版两 case 同函数同参 :36791-36795） */
const whipTipGeneric6Half = (c: WhipTipCtx): V2 => whipTipGeneric(c, 6, 0.5, 0.5);

/** 鞭尖分发表（DrawWhip switch :36759-36815 全 18 条 → 16 个专署函数;
 *  913≡912 同体、1029/1030 同体） */
export const WHIP_TIPS: Record<number, (c: WhipTipCtx) => V2> = {
  847: whipTipSword,                                          // case :36761-36762
  841: whipTipBland,                                          // case :36764-36765
  848: whipTipMace,                                           // case :36767-36768
  849: whipTipScythe,                                         // case :36770-36771
  912: whipTipCoolWhip,                                       // case :36773-36774
  913: whipTipCoolWhip,                                       // case :36776-36777（FireWhip 全同体）
  914: whipTipThorn,                                          // case :36779-36780
  915: whipTipRainbow,                                        // case :36782-36783
  952: whipTipBone,                                           // case :36785-36786
  1028: (c) => whipTipGeneric(c, 6, 1, 1),                    // case :36788-36789
  1029: whipTipGeneric6Half,                                  // case :36791-36792
  1030: whipTipGeneric6Half,                                  // case :36794-36795
  1031: whipTipMeteor,                                        // case :36797-36798
  1032: (c) => whipTipFlower(c, 5, 0.5, 0.5),                 // case :36800-36801
  1033: whipTipEel,                                           // case :36803-36804
  1034: (c) => whipTipConstellation(c, 6),                    // case :36806-36807
  1035: whipTipMoonLord,                                      // case :36809-36810
  1104: whipTipSlime,                                         // case :36812-36813
};

/** 鞭身渔线体（DrawWhip :36732-36756）：FishingLine 染色线体沿控制点链逐段旋贴——
 *  scale=(1,(段长+2)/12)、origin=(W/2,2)（:36662-36663/:36743）;段数见
 *  whipLineSegmentCount（flag 末段少 1 节/1035 整条不画）;1034 flag3 免取光、
 *  1104 色 ×0.5（:36750-36752）——色表落终态后直画 */
function drawWhipLineBody(
  ctx: CanvasRenderingContext2D, tex: Tex, projId: number, pts: V2[],
): void {
  if (projId === 1035) return;                                  // flag2=false :36726/:36738
  const color0 = WHIP_LINE_COLORS[projId] ?? TIP_WHITE;         // 缺省 White :36668
  let color = color0;
  if (projId === 1104) {                                        // :36751-36753 color2 ×= 0.5f
    color = [
      Math.trunc(color0[0] * 0.5) & 0xff, Math.trunc(color0[1] * 0.5) & 0xff,
      Math.trunc(color0[2] * 0.5) & 0xff, Math.trunc(color0[3] * 0.5) & 0xff,
    ];
  }
  // 1034 flag3（:36721/:36747-36749）= 免逐段取光——本仓光照由合成统一乘,无分支
  const num = whipLineSegmentCount(projId, pts.length - 1);     // :36733-36736
  for (let i = 0; i < num; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    // value2 = value.Frame() 整图（:36661,无 Height-=2——与鞭尖帧切片不同档）
    drawWhipFrame(ctx, tex, 0, 0, tex.width, tex.height,
      a.x, a.y, Math.atan2(dy, dx) - Math.PI / 2,
      tex.width / 2, 2, 1, (len + 2) / tex.height, color);      // origin(W/2,2)/scale(:36662/:36746)
  }
}
