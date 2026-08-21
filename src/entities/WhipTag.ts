// 鞭 tag/proc 共享状态与命中结算 —— 1457 TagEffectStack 框架 1:1：
//  - TagEffectStack（TagEffectStack.cs:1-139）：每玩家 MRU 栈,容量 5
//    （MaxEffects :8;门控 = Player.maxTagEffects :1187,默认 1）
//  - TagEffectState（TagEffectState.cs:1-120）：每 tag 型一份,per-NPC
//    TimeLeftOnNPC/ProcTimeLeftOnNPC 双表（本作敌无槽位复用,用 Map<enemyId,n>）
//  - TagDamageChanges（TagDamageChanges.cs:1-21）：ModifyHit 记账聚合结构体
//  - UniqueTagEffect/WhipTagEffect 族（ItemID.cs:1313-1428 全表 + 10 个子类）
//  1456 的"单例 tag 挂敌实体"模型（whipTagT 单值字段）已退役：1457 多 tag 全值
//  叠加（Projectile.cs:12946-12962）+ proc 消费语义反转（OnProcHit 返 bool 才清,
//  TagEffectState.cs:113-118）。敌侧不再存 tag 态——查询一律走
//  owner.tagEffectStack（isNPCTagged/canProcOnNPC/anyTagged）。
//  tag/proc 时长 = TagDuration × Player.tagEffectDuration（:62-66/:68-71;
//  SilverBracer 6156 族 +2f → ×3）。
import { Arrow } from './Arrow';
import { playerCanHitEnemy } from './projTargets';
import type { GameHooks } from './types';
import type { Player } from './Player';

/** NPCID.Sets.DebuffImmunitySets.ImmuneToWhips（1457 NPCID.cs 全表解析,
 *  CanApplyTagToNPC 门 WhipTagEffect.cs:20-31）：11 种敌不吃鞭 tag */
export const TAG_IMMUNE_TO_WHIPS = new Set([68, 72, 392, 440, 491, 549, 583, 584, 585, 686, 687]);

/** UniqueTagEffect 子类行为档（Terraria.GameContent.Items/WhipTagEffect_*.cs） */
export type TagEffectKind =
  | 'base' | 'starcrash' | 'flower' | 'possession' | 'firecracker'
  | 'swordwhip' | 'eel' | 'darkharvest' | 'constellation' | 'kaleidoscope';

/** WhipTagEffect 单条（ItemID.cs:1313-1428 UniqueTagEffects 36 对全表）；
 *  TagDuration 缺省 240（WhipTagEffect ctor :15-18）,5479 星鞭覆写 480 */
export interface TagEffectDef {
  itemId: number;
  kind: TagEffectKind;
  tagDuration: number;
  tagDamage: number;
  critChance: number;
  /** PlayerBuffId/PlayerBuffTime（OnTagAppliedToNPC → AddTheBuff :53-60,时长 ×
   *  tagEffectDuration）；PlayerBuffAppliedManually=true 的 5473/4911 不走此链
   *  （由鞭命中分支 case 912/1028 授予,见 WHIP_HIT_BUFF） */
  playerBuffId: number;
  playerBuffTime: number;
  playerBuffAppliedManually: boolean;
}

const def = (itemId: number, tagDamage: number, extra: Partial<TagEffectDef> = {}): TagEffectDef => ({
  itemId, kind: 'base', tagDuration: 240, tagDamage, critChance: 0,
  playerBuffId: 0, playerBuffTime: 0, playerBuffAppliedManually: false, ...extra,
});

/** ItemID.Sets.UniqueTagEffects（1457 ItemID.cs:1313-1428） */
export const TAG_EFFECTS: Record<number, TagEffectDef> = {
  5688: def(5688, 3),
  5473: def(5473, 3, { playerBuffId: 365, playerBuffTime: 180, playerBuffAppliedManually: true }),
  4672: def(4672, 4),
  5474: def(5474, 5),
  5475: def(5475, 5),
  5476: def(5476, 2, { kind: 'starcrash' }),
  4913: def(4913, 6, { playerBuffId: 314, playerBuffTime: 180 }),
  5074: def(5074, 7),
  4911: def(4911, 6, { playerBuffId: 312, playerBuffTime: 180, playerBuffAppliedManually: true }),
  4678: def(4678, 9, { kind: 'swordwhip', playerBuffId: 308, playerBuffTime: 180 }),
  5477: def(5477, 9, { kind: 'flower' }),
  4680: def(4680, 15, { kind: 'darkharvest', playerBuffId: 311, playerBuffTime: 180 }),
  4679: def(4679, 8, { critChance: 10 }),
  5478: def(5478, 12, { kind: 'eel', critChance: 5 }),
  5479: def(5479, 15, { kind: 'constellation', tagDuration: 480, critChance: 15 }), // :1398-1402
  4914: def(4914, 20, { kind: 'kaleidoscope', critChance: 10 }),
  5480: def(5480, 25, { kind: 'possession', critChance: 10 }),
  4912: def(4912, 0, { kind: 'firecracker' }),
};

// ---- 兼容导出（旧单值表 → 新框架派生；消费方 WhipProj/测试沿用） ----
/** 鞭 → TagDamage（派生自 TAG_EFFECTS） */
export const WHIP_TAG: Record<number, number> = Object.fromEntries(
  Object.values(TAG_EFFECTS).map((d) => [d.itemId, d.tagDamage]),
);
/** 鞭 Tag 暴击率%（派生） */
export const WHIP_TAG_CRIT: Record<number, number> = Object.fromEntries(
  Object.values(TAG_EFFECTS).filter((d) => d.critChance > 0).map((d) => [d.itemId, d.critChance]),
);
/** tag 命中授予的玩家 buff（非 manual 档；施加点 = TagEffectState.applyTagToNPC） */
export const WHIP_TAG_BUFF: Record<number, number> = Object.fromEntries(
  Object.values(TAG_EFFECTS).filter((d) => d.playerBuffId > 0 && !d.playerBuffAppliedManually)
    .map((d) => [d.itemId, d.playerBuffId]),
);
/** 鞭命中分支授予的玩家 buff（TryDoingOnHitEffects case 912 → 312/180、case 1028 →
 *  365/180,Projectile.cs:13981-13992——manual 档,不 × tagEffectDuration） */
export const WHIP_HIT_BUFF: Record<number, number> = Object.fromEntries(
  Object.values(TAG_EFFECTS).filter((d) => d.playerBuffId > 0 && d.playerBuffAppliedManually)
    .map((d) => [d.itemId, d.playerBuffId]),
);
/** 鞭命中附属召唤（case 912 → 雪花哨兵 917 伤 15 / case 1028 → 小蜘蛛 1036 伤 2,
 *  :13981-13992；coolWhipBuff/cobWhipBuff 在场期不重复） */
export const WHIP_HIT_SIDEKICK: Record<number, { proj: number; dmg: number }> = {
  4911: { proj: 917, dmg: 15 }, 5473: { proj: 1036, dmg: 2 },
};
/** GetWhipSettings segments（Projectile.cs:45683-45761,默认 20） */
export const WHIP_SEGMENTS: Record<number, number> = {
  1104: 36, 1028: 12, 847: 20, 848: 40, 849: 30, 1033: 45, 915: 40, 1035: 30,
};
/** GetWhipSettings rangeMultiplier（:45692-45760）。晨星 848 是赋值 1.6（:45734-45736） */
export const WHIP_RANGE: Record<number, number> = {
  1104: 0.75, 1028: 0.75, 841: 0.75, 1029: 0.95, 1030: 0.85, 914: 1.0,
  1031: 1.1, 952: 0.95, 913: 1.4, 912: 1.5, 847: 1.75, 1032: 1.8,
  848: 1.6, 849: 2.15, 1033: 2.0, 915: 2.2, 1034: 2.2, 1035: 2.2,
};
/** 多目标伤害衰减（:12604-12678：命中后鞭 damage 字段 ×此倍率,键=projId） */
export const WHIP_FALLOFF: Record<number, number> = {
  1104: 0.40, 1028: 0.40, 841: 0.50, 1029: 0.60, 1030: 0.60, 914: 0.60,
  1031: 0.70, 952: 0.90, 913: 0.66, 912: 0.70, 847: 0.80, 1032: 0.85,
  848: 0.95, 849: 0.90, 1033: 0.95, 915: 0.80, 1034: 0.90, 1035: 0.95,
};
/** proc 启用鞭（TryDoingOnHitEffects :13968-14013）：
 *  {913,1031,1032} 首鞭门（localAI[0]==0）；{847,1033,1035} 每鞭（1457 新增 1033）；
 *  1034 星鞭走独立 case（CanProcOnNPC 门 + RemoveAllProcs,不吃本表）。
 *  键=物品 id（tagEffectType）：913→4912/1031→5476/1032→5477/847→4680/1033→5478/1035→5480 */
export const WHIP_PROC_ITEMS = new Set([4912, 5476, 5477, 4680, 5478, 5480]);
/** 首鞭门组（case 913/1031/1032 :13969-13975 localAI[0]==0 才 TryEnableProc） */
export const WHIP_PROC_ONCE_ITEMS = new Set([4912, 5476, 5477]);
/** extraUpdates 覆盖（SetDefaults :7862-7885：847/849 extraUpdates=2 → MaxUpdates=3；
 *  其余 DefaultToWhip extraUpdates=1 :10103 → MaxUpdates=2） */
export const WHIP_EXTRA_UPDATES = new Set([847, 849]);
/** ProjectileID.Sets.SummonTagDamageMultiplier（1457:37 整表 = 仅 Smolstar 864 = 0.669；
 *  1456 的 688/689/690=0.5 回落默认 1） */
export const SUMMON_TAG_MUL: Record<number, number> = { 864: 0.669 };
/** ProjectileID.Sets.MinionShot（ProjectileID.cs:197）——吃鞭 tag 的随从弹 */
export const MINION_SHOT_SET = new Set([374, 376, 389, 195, 408, 433, 614, 818, 1044, 1097, 1106]);
/** ProjectileID.Sets.SentryShot（ProjectileID.cs:199）——吃鞭 tag 的哨兵弹 */
export const SENTRY_SHOT_SET = new Set([680, 664, 666, 668, 694, 695, 696, 644, 642, 378, 379, 309, 967, 1026]);

export function whipTagDamageOf(itemId: number): number {
  return WHIP_TAG[itemId] ?? 0;
}

/** 敌侧命中通道（1457 起敌实体不再存 tag 态——只剩 OnTaggedHit 直伤回调挂载点
 *  916 黑闪电等价 + 敌 id 供栈查询） */
export interface WhipTagged {
  id: number;
  /** OnTaggedHit 直伤回调（黑收成 916 等价：伤害落在被命中敌身上,视觉走弹幕） */
  hurtFx?: (d: number) => void;
}

/** TagDamageChanges（TagDamageChanges.cs:1-21）；None = TotalDamageMultiplier 1 */
export interface TagDamageChanges {
  addProjectileTagDamage: boolean;
  addedBaseDamage: number;
  addedFlatDamage: number;
  totalDamageMultiplier: number;
  /** bool?——null = 无强制暴击档 */
  crit: boolean | null;
  highestAddedBaseDamage: number;
}
export const tagDamageChangesNone = (): TagDamageChanges => ({
  addProjectileTagDamage: false, addedBaseDamage: 0, addedFlatDamage: 0,
  totalDamageMultiplier: 1, crit: null, highestAddedBaseDamage: 0,
});

/** 命中结算上下文（resolveWhipTagHit 注入;等价原版把 Projectile/NPC 指针传进
 *  ModifyHit/OnHit——本作以 id+坐标+回调表达） */
export interface WhipHitCtx {
  /** 命中弹 projId（CanProcOnNPC 消费门 1034/SummonTagDamageMultiplier 表键） */
  projId: number;
  /** Projectile.bonusTagDamage（词缀 I:567;WhipProj 命中侧注入,合成 :12955 只加一次） */
  bonusTagDamage: number;
  /** 命中点（特效生成锚） */
  hx: number;
  hy: number;
  /** OnTaggedHit 直伤通道（4680 黑闪电 916 等价） */
  hurtFx?: (d: number) => void;
  /** 特效弹注册器 */
  add: (e: unknown, bucket?: string) => void;
  /** 被命中敌 id（栈查询键;等价 npcHit.whoAmI） */
  hurtNpcId: number;
  /** 被命中敌 realLife（-1 = 无;电鳗链电同 realLife 跳过 :38） */
  realLife: number;
  /** 被命中敌宽高（花瓣速度 max(w,h)/8、月主弹外扩盒） */
  hurtEnemyWH: { w: number; h: number };
}

/** 单个 tag 型的激活态（TagEffectState.cs:1-120 1:1;int[maxNPCs] 双表 → Map） */
export class TagEffectState {
  type = 0;
  /** TimeLeftOnNPC[npcId]（:14） */
  private time = new Map<number, number>();
  /** ProcTimeLeftOnNPC[npcId]（:15） */
  private procTime = new Map<number, number>();
  /** 本 tag 型打 tag 时携带的鞭词缀 bonusTagDamage（本仓登记偏差,见 applyTagToNPC） */
  appliedBonus = 0;
  constructor(private owner: Player) {}

  get def(): TagEffectDef | undefined { return TAG_EFFECTS[this.type]; }

  isNPCTagged(npcId: number): boolean { return (this.time.get(npcId) ?? 0) > 0; }        // :26-28
  canProcOnNPC(npcId: number): boolean { return (this.procTime.get(npcId) ?? 0) > 0; }   // :30-32
  clearProcOnNPC(npcId: number): void { this.procTime.set(npcId, 0); }                    // :34-36
  removeAllProcs(): void { this.procTime.clear(); }                                       // :38-41
  resetNPCSlotData(npcId: number): void { this.time.delete(npcId); this.procTime.delete(npcId); } // :43-47

  /** Activate（:49-54）：_effect = UniqueTagEffects[type] + OnSetToPlayer（基类空） */
  activate(tagType: number): void { this.type = tagType; }
  /** Deactivate（:56-60）：OnRemovedFromPlayer（WhipTagEffect :33-39 清玩家 buff）+ Clear */
  deactivate(): void {
    const d = this.def;
    if (d?.playerBuffId) delete this.owner.whipBuffs[d.playerBuffId]; // ClearBuff(PlayerBuffId)
    this.time.clear();
    this.procTime.clear();
    this.appliedBonus = 0;
  }

  /** ApplyTagToNPC（:62-66）：TimeLeft = (int)(TagDuration × tagEffectDuration) +
   *  OnTagAppliedToNPC → AddTheBuff（:53-60,非 manual 档,时长同缩放）。
   *  bonusTagDamage 形参 = 本仓登记偏差：1457 管线的 Projectile.bonusTagDamage 是
   *  【命中弹】自带（ApplyStatsFromSource :11129/:11140 按物品词缀继承,鞭本体不吃
   *  tag 故其词缀无消费点）;本仓延续 1456 近似——把鞭词缀 I:567 tagdmg 挂到 tag 态,
   *  随从命中被 tag 敌时并入（保词缀面板"召唤伤害 +N"可观察） */
  applyTagToNPC(npcId: number, bonusTagDamage = 0): void {
    const d = this.def;
    if (!d) return;
    this.time.set(npcId, Math.trunc(d.tagDuration * this.owner.tagEffectDuration));
    if (bonusTagDamage > this.appliedBonus) this.appliedBonus = bonusTagDamage;
    if (d.playerBuffId > 0 && !d.playerBuffAppliedManually) {
      this.owner.whipBuffs[d.playerBuffId] =
        Math.max(this.owner.whipBuffs[d.playerBuffId] ?? 0,
          Math.trunc(d.playerBuffTime * this.owner.tagEffectDuration));
    }
  }

  /** EnableProcOnNPC（:68-71）：ProcTimeLeft = (int)(TagDuration × tagEffectDuration) */
  enableProcOnNPC(npcId: number): void {
    const d = this.def;
    if (!d) return;
    this.procTime.set(npcId, Math.trunc(d.tagDuration * this.owner.tagEffectDuration));
  }

  /** Update（:100-112）：双表逐项递减（0 项摘除防 Map 无界生长——原版数组原地清零等价） */
  update(): void {
    for (const [k, v] of this.time) { if (v <= 1) this.time.delete(k); else this.time.set(k, v - 1); }
    for (const [k, v] of this.procTime) { if (v <= 1) this.procTime.delete(k); else this.procTime.set(k, v - 1); }
  }

  /** ModifyHit（:97-107）：IsNPCTagged && CanRunHitEffects（调用侧已门）→
   *  ModifyTaggedHit 记账 + CanProc → ModifyProcHit */
  modifyHit(ctx: WhipHitCtx, changes: TagDamageChanges, game: GameHooks): void {
    const d = this.def;
    if (!d || !this.isNPCTagged(ctx.hurtNpcId)) return;
    // WhipTagEffect.ModifyTaggedHit（:62-74）：AddProjectileTagDamage=true;
    // AddedBaseDamage += TagDamage;Highest 取 max;crit 掷 Next(100)<CritChance
    changes.addProjectileTagDamage = true;
    changes.addedBaseDamage += d.tagDamage;
    if (changes.highestAddedBaseDamage < d.tagDamage) changes.highestAddedBaseDamage = d.tagDamage;
    if (d.critChance > 0 && Math.random() * 100 < d.critChance) changes.crit = true;
    // 子类 ModifyProcHit（proc 窗口内一次性——消费在 onHit 侧,窗口判定此处）
    if (this.canProcOnNPC(ctx.hurtNpcId)) {
      switch (d.kind) {
        case 'firecracker':
          // WhipTagEffect_Firecracker :9-12（1457）：TotalDamageMultiplier *= 2.75
          //（1456 是 1.75 加算——1457 改乘区且乘在含 tag 总伤上）
          changes.totalDamageMultiplier *= 2.75;
          break;
        case 'swordwhip':
          // WhipTagEffect_SwordWhip.MegaSlash :18-27：+30 固定伤 + TrueExcalibur 粒子
          changes.addedFlatDamage += 30;
          ctx.add(new Arrow(ctx.hx - 6, ctx.hy - 6, 0, -0.5, 0, 0, 916, null, { grav: 0, life: 14, pierce: 99 }));
          break;
        case 'eel':
          // WhipTagEffect_ElectricEel.CreateLightningBlast :20-57：链电 5 目标 ×20 直伤
          // + AddedFlatDamage += 50 + 命中数×50（死代码 if(0==1) 勿照抄 :28-31）
          changes.addedFlatDamage += this.eelChainBlast(ctx, game);
          break;
        default:
          break;
      }
    }
  }

  /** ElectricEel 链电（:33-55）：命中盒 450px 内最近 5 个 CanBeChasedBy 目标,
   *  各吃 20 直伤（TryHittingNPC 5478 tag 源）,返回 flat 加成 50+50×n */
  private eelChainBlast(ctx: WhipHitCtx, g: GameHooks): number {
    let hits = 0;
    for (const ent of g.enemies()) {
      if (hits >= 5) break;                                   // num2 = 5
      const en2 = ent as unknown as {
        id: number; dead: boolean; x: number; y: number; w: number; h: number; realLife?: number | null;
        hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
      };
      if (en2.dead || en2.id === ctx.hurtNpcId) continue;      // i != npcHit.whoAmI
      if (ctx.realLife !== -1 && ctx.realLife === (en2.realLife ?? -1)) continue; // 同 realLife 跳过
      // npcHit.Distance(nPC.Hitbox.ClosestPointInRect(npcHit.Center)) > 450 → skip
      const px = Math.max(en2.x, Math.min(en2.x + en2.w, ctx.hx));
      const py = Math.max(en2.y, Math.min(en2.y + en2.h, ctx.hy));
      if (Math.hypot(px - ctx.hx, py - ctx.hy) > 450) continue;
      if (!playerCanHitEnemy(ent, g, ctx.projId || 5478)) continue; // CanBeChasedBy 门
      hits++;
      en2.hurt(20, 0, 0, g);                                  // TryHittingNPC(nPC, 20, 0, null, 5478)
      g.spawnParticles?.(px, py, '#60C8FF', 4, 2.2, { life: 16 }); // BlueLightningSmallLong 近似
    }
    if (hits > 0) g.playSfxFiles?.(['npc_hit34'], 0.6, ctx.hx, ctx.hy); // SoundID.NPCHit34 :54
    return 50 + hits * 50;                                    // :53 AddedFlatDamage
  }

  /** OnHit（:109-119）：OnTaggedHit + CanProc → OnProcHit 返 true 才 ClearProc
   *  （1457 消费语义反转——基类默认 false 不消耗 :41-44） */
  onHit(ctx: WhipHitCtx, calcDamage: number, game: GameHooks): void {
    const d = this.def;
    if (!d || !this.isNPCTagged(ctx.hurtNpcId)) return;
    const npcId = ctx.hurtNpcId;
    switch (d.kind) {
      case 'darkharvest':
        // WhipTagEffect_DarkHarvest :11-22（每次被 tag 敌被吃鞭 tag 的命中都触发）：
        // 916 黑闪电,伤 = TagDamage × SummonTagDamageMultiplier[projType]
        ctx.hurtFx?.(Math.max(1, Math.trunc(d.tagDamage * (SUMMON_TAG_MUL[ctx.projId] ?? 1))));
        ctx.add(new Arrow(ctx.hx, ctx.hy, 0, -1, 0, 0, 916, null, { grav: 0, life: 24, pierce: 99 }));
        break;
      case 'constellation':
        // WhipTagEffect_Constellation :8-11：随从命中被 tag 敌 → 启用 proc 窗口
        //（星鞭本体的星雨消耗走 WhipProj case 1034 侧,CanRunHitEffects 拦掉鞭本体）
        this.enableProcOnNPC(npcId);
        break;
      case 'kaleidoscope':
        // WhipTagEffect_Kaleidoscope :8-15：RainbowRodHit 粒子（本仓粒子管线近似）
        break;
      default:
        break;
    }
    if (!this.canProcOnNPC(npcId)) return;
    let consumed = false;
    switch (d.kind) {
      case 'firecracker': {
        // OnProcHit :14-18 → CreateExplosion :20-29：918 爆炸,伤 = calcDamage×2.75,
        //  localNPCImmunity=-1（本仓 AoE 直结,friendly 门同 Game.explodeAt）
        consumed = true;
        const boom = Math.max(1, Math.trunc(calcDamage * 2.75));
        const g = game;
        {
          for (const ent of g.enemies()) {
            const en2 = ent as unknown as {
              dead: boolean; cx: number; cy: number; w: number; h: number;
              hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
            };
            if (en2.dead || !playerCanHitEnemy(ent, g, 918)) continue;
            if (Math.abs(en2.cx - ctx.hx) > 48 + en2.w / 2 || Math.abs(en2.cy - ctx.hy) > 48 + en2.h / 2) continue;
            en2.hurt(boom, Math.sign(en2.cx - ctx.hx) * 2, -2, g);
          }
          g.spawnParticles?.(ctx.hx, ctx.hy, '#FF7A28', 16, 4, { life: 26 });
        }
        break;
      }
      case 'starcrash': {
        // WhipTagEffect_Starcrash :8-13 → SpawnMeteorWhipMeteorOn :15-31：
        // 目标上方 280px 落陨石 1037,伤 = calcDamage×1.33,速 8
        consumed = true;
        ctx.add(new Arrow(ctx.hx - 6, ctx.hy - 280, 0.4, 8,
          Math.max(1, Math.trunc(calcDamage * 1.33)), 2, 1037, null, { grav: 0 }));
        break;
      }
      case 'flower': {
        // WhipTagEffect_ViolentDisplayOfFlower :8-34（1457 重做）：花瓣伤基数 =
        // (calcDamage + bonusTagDamage) × 2.25,均分 3-6 瓣（3 + Next(0,4)）,
        // 每瓣 = ceil((int)总数 / 瓣数),速 = max(w,h)/8,localNPCImmunity=30
        consumed = true;
        const total = Math.trunc((calcDamage + ctx.bonusTagDamage) * 2.25);
        const petals = 3 + Math.floor(Math.random() * 4);
        const per = Math.max(1, Math.ceil(total / petals));
        const base = Math.random() * Math.PI * 2;
        const enwh = ctx.hurtEnemyWH;
        const spd = Math.max(1, Math.max(enwh.w, enwh.h) / 8);
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * Math.PI * 2 + base + (Math.random() * 2 - 1) * 0.3926991;
          ctx.add(new Arrow(ctx.hx, ctx.hy, Math.cos(a) * spd, Math.sin(a) * spd, per, 0, 1038, null,
            { grav: 0, life: 120, pierce: 99 }));
        }
        break;
      }
      case 'possession': {
        // WhipTagEffect_Possession :10-14 + SpawnMoonLordWhipProc :13832-13853：
        // 固定伤 20,三连 1045（case 1045 :14014-14018 链至 ai[1]>=2 停）
        consumed = true;
        const wh = ctx.hurtEnemyWH;
        for (let i = 0; i < 3; i++) {
          const px = ctx.hx - wh.w / 2 - 30 + Math.random() * (wh.w + 60);
          const py = ctx.hy - wh.h / 2 - 24 + Math.random() * (wh.h + 32);
          ctx.add(new Arrow(px, py, (Math.random() - 0.5) * 4, 6, 20, 1, 1045, null,
            { grav: 0, life: 60, pierce: 99 }));
        }
        break;
      }
      case 'eel':
      case 'swordwhip':
        // 两者的 OnProcHit 恒 return true（_ElectricEel :16-19 / _SwordWhip :21-24）——
        // 数值侧已在 modifyHit 记账
        consumed = true;
        break;
      default:
        break; // 基类/constellation/kaleidoscope/darkharvest：OnProcHit 默认 false 不消耗
    }
    if (consumed) this.clearProcOnNPC(npcId);   // :113-118 消费语义反转
  }
}

/** 每玩家鞭 tag 栈（TagEffectStack.cs:1-139 1:1） */
export class TagEffectStack {
  /** MaxEffects = 5（:8） */
  static readonly MAX_EFFECTS = 5;
  private states: (TagEffectState | null)[] = [null, null, null, null, null];
  private count = 0;

  constructor(private owner: Player) {}

  get activeCount(): number { return this.count; }

  /** 活跃 tag 型列表（MRU 序,调试/测试用） */
  activeTypes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.states[i]!.type);
    return out;
  }

  private indexOf(tagType: number): number {                       // :18-27
    for (let i = 0; i < this.count; i++) if (this.states[i]!.type === tagType) return i;
    return -1;
  }

  /** LimitActiveEffects（:29-36）：超限从栈尾淘汰（最久未用先驱逐）→ Deactivate */
  private limitActiveEffects(limit: number): void {
    limit = Math.min(limit, TagEffectStack.MAX_EFFECTS);
    while (this.count > limit) this.states[--this.count]!.deactivate();
  }

  /** TrySetActiveEffect（:42-58）：不存在 → 先 Limit(maxTagEffects-1) 腾位再激活;
   *  已存在仅提到栈顶（MRU swap 环） */
  private trySetActiveEffect(tagType: number): void {
    let i = this.indexOf(tagType);
    if (i < 0) {
      this.limitActiveEffects(this.owner.maxTagEffects - 1);
      i = this.count;
      const st = this.states[i] ?? new TagEffectState(this.owner);
      this.states[i] = st;
      this.count++;
      st.activate(tagType);
    }
    while (i > 0) {
      const tmp = this.states[i]!;
      this.states[i] = this.states[i - 1]!;
      this.states[i - 1] = tmp;
      i--;
    }
  }

  isNPCTagged(tagType: number, npcId: number): boolean {           // :60-67
    const i = this.indexOf(tagType);
    return i >= 0 && this.states[i]!.isNPCTagged(npcId);
  }

  /** 任一活跃 tag 标记该敌（随从索敌优先级用;原版逐 state 查 IsNPCTagged） */
  anyTagged(npcId: number): boolean {
    for (let i = 0; i < this.count; i++) if (this.states[i]!.isNPCTagged(npcId)) return true;
    return false;
  }

  canProcOnNPC(tagType: number, npcId: number): boolean {          // :69-76
    const i = this.indexOf(tagType);
    return i >= 0 && this.states[i]!.canProcOnNPC(npcId);
  }

  /** TryApplyTagToNPC（:80-87）：CanApplyTagToNPC（ImmuneToWhips 门）+ 激活 +
   *  对栈顶 [0] 打 tag。bonusTagDamage = 鞭词缀 tagdmg（本仓登记偏差,见 state 注） */
  tryApplyTagToNPC(tagType: number, npcId: number, npcVanillaId = 0, bonusTagDamage = 0): void {
    if (TAG_EFFECTS[tagType] === undefined) return;
    if (npcVanillaId > 0 && TAG_IMMUNE_TO_WHIPS.has(npcVanillaId)) return; // CanApplyTagToNPC
    this.trySetActiveEffect(tagType);
    this.states[0]!.applyTagToNPC(npcId, bonusTagDamage);
  }

  /** 栈上已标记该敌的各 tag 态携带的最大鞭词缀 tagdmg（管线 bonusTagDamage 单次
   *  合成 :12954——本仓把命中弹自带值与此取 max） */
  maxTagBonus(npcId: number): number {
    let m = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.states[i]!;
      if (s.isNPCTagged(npcId) && s.appliedBonus > m) m = s.appliedBonus;
    }
    return m;
  }

  tryEnableProcOnNPC(tagType: number, npcId: number): void {       // :89-95
    const i = this.indexOf(tagType);
    if (i >= 0) this.states[i]!.enableProcOnNPC(npcId);
  }

  removeAllProcs(tagType: number): void {                          // :77-82
    const i = this.indexOf(tagType);
    if (i >= 0) this.states[i]!.removeAllProcs();
  }

  resetNPCSlotData(npcId: number): void {                          // :124-128
    for (let i = 0; i < this.count; i++) this.states[i]!.resetNPCSlotData(npcId);
  }

  /** ModifyHit（:107-121）：遍历栈上全部活跃 tag 依次记账——多 tag 全值叠加的基础 */
  modifyHit(ctx: WhipHitCtx, changes: TagDamageChanges, game: GameHooks): void {
    for (let i = 0; i < this.count; i++) this.states[i]!.modifyHit(ctx, changes, game);
  }

  /** OnHit（:107-121）：同遍历;proc 消费由各 effect 返回值决定 */
  onHit(ctx: WhipHitCtx, calcDamage: number, game: GameHooks): void {
    for (let i = 0; i < this.count; i++) this.states[i]!.onHit(ctx, calcDamage, game);
  }

  /** Update（:131-138）：每帧 Limit(maxTagEffects) + 各 state 双表递减 */
  update(): void {
    this.limitActiveEffects(this.owner.maxTagEffects);
    for (let i = 0; i < this.count; i++) this.states[i]!.update();
  }
}

/**
 * 随从/哨兵命中侧统一结算鞭 tag + proc（TagEffectStack.ModifyHit/OnHit +
 * Projectile 伤害管线 :12946-12962;调用方须满足 WhipTagEffect.CanRunHitEffects
 * :76-87——随从本体 / MinionShot（MINION_SHOT_SET）/ 哨兵 / SentryShot）。
 * 管线（:12947-12962）：num15 = base;
 *   changes 聚合 → num15 += (int)((Σtag + bonusTagDamage) × SummonTagDamageMultiplier)
 *   → += AddedFlatDamage → num15 = (int)(num15 × TotalDamageMultiplier)
 *   → changes.Crit 有值即强制 crit;暴击 ×2 在本函数尾（原版在 Damage 外层）。
 * OnHit 阶段（:13711 → TagEffectState.OnHit）：黑收成 916 / 星鞭 proc 启用 /
 * proc 首跳（火鞭 918 爆炸 ×2.75 / 星陨 1037 ×1.33 / 花瓣 1038 / 月主 1045 三连 /
 * 剑鞭 +30 / 电鳗链电）——伤害基数 = calcDamage（原版传 num7 = tag 前基础伤）。
 * 返回最终伤害（含暴击 ×2）与是否暴击。
 * 兼容签名：前 7 参与旧版一致（Arrow.ts whipTagShot 路径未迁移仍走此形态,
 * owner 缺省 game.player——单机语义;MP 远端随从按本端玩家栈近似,与旧版一致）。
 */
export function resolveWhipTagHit(
  en: WhipTagged & { w?: number; h?: number; realLife?: number | null },
  baseDmg: number,
  game: GameHooks,
  add: (e: unknown) => void,
  tagMul = 1,
  hx = 0,
  hy = 0,
  owner?: Player | null,
  bonusTagDamage = 0,
  projId = 0,
): { dmg: number; crit: boolean } {
  const stack = (owner ?? (game as unknown as { player?: Player | null }).player)?.tagEffectStack;
  if (!stack || stack.activeCount === 0) return { dmg: Math.max(1, Math.round(baseDmg)), crit: false };
  const ctx: WhipHitCtx = {
    projId,
    bonusTagDamage,
    hx, hy,
    hurtFx: en.hurtFx,
    add: add as (e: unknown, b?: string) => void,
    hurtNpcId: en.id,
    realLife: en.realLife ?? -1,
    hurtEnemyWH: { w: en.w ?? 16, h: en.h ?? 16 },
  };
  const changes = tagDamageChangesNone();
  stack.modifyHit(ctx, changes, game);                             // :12947
  let dmg = baseDmg;
  let crit = false;
  if (changes.addProjectileTagDamage) {                            // :12949-12961
    const highest = changes.highestAddedBaseDamage;
    const rest = changes.addedBaseDamage - highest;
    const tagSum = highest + rest;                                 // num17 恒 1（:12952）
    const bonus = Math.max(ctx.bonusTagDamage, stack.maxTagBonus(en.id)); // 词缀 tagdmg 单次合成（本仓挂 tag 态,见 state 注）
    dmg += Math.trunc((tagSum + bonus) * tagMul);                  // SummonTagDamageMultiplier 只乘一次
    dmg += changes.addedFlatDamage;
    dmg = Math.trunc(dmg * changes.totalDamageMultiplier);
    if (changes.crit !== null) crit = changes.crit;
  }
  stack.onHit(ctx, baseDmg, game);                                 // :13711（calcDamage = num7）
  if (crit) dmg *= 2;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}
