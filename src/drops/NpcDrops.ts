// 原版 1.4.5.6 怪物击杀掉落求值运行时（1:1 对照）
// - 规则树数据：src/data/vanilla-npcdrops.json（tools/extract-npcdrops.mjs 从
//   ItemDropDatabase.cs 结构化提取；626 条注册、规则独立按注册序求值）
// - 求值语义：ItemDropResolver.cs:23-58（CanDrop 失败=DoesntFillConditions、
//   掷骰失败=FailedRandomRoll、成功=Success；链按父状态门控）
// - 钱币管线：NPC.cs NPCLoot_DropMoney(:80412) luck=0 单掷 + 8 层随机放大 + 贪心拆币
// - 心/星：NPC.cs NPCLoot_DropCommonLifeAndMana(:80332)
// - Boss 药水+心：DoDeathEvents_DropBossPotionsAndHearts(:79790)
// - 初速度：Item.cs:49325-49337 vx∈[-3,3] vy∈[-4,-1.5]
// 偏差（记录）：luck 恒 0（RollLuck ≡ rng.Next(denom)）；NotFromStatue 恒 true；
// 天空盒/DST 联动条件恒 false；月事件四条件已实现（ctx.moonEvent 注入，见 evalCond）。
// RedHatSkeletron/MissingTwin/EmpressOfLightIsGenuinelyEnraged 经 ctx.ai3/
// anyNpcOfType 接通（Enemy 注入）；MechdusaKill/NamedNPC/
// EyeOfCthulhuDefeatedAndNoAltarsInWorld 缺子系统恒 false（注释见 evalCond）。
import dropData from '../data/vanilla-npcdrops.json';
import npcValueJson from '../data/vanilla-npcvalue.json';
import type { RNG } from '../core/rng';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rule = any;
const ENTRIES: Array<{ npcs?: number[]; global?: boolean; rule: Rule }> = (dropData as any).entries;
const SLIME_BODY: Record<string, [number, number]> = (dropData as any).slimeBody;
const NPC_VALUE: Record<string, number> = npcValueJson as any;

/** netID → 规则列表（注册序）；原版 _entriesByNpcNetId */
const rulesByNpc = new Map<number, Rule[]>();
const globalRules: Rule[] = [];
for (const e of ENTRIES) {
  if (e.global) { globalRules.push(e.rule); continue; }
  for (const n of e.npcs ?? []) {
    let l = rulesByNpc.get(n);
    if (!l) rulesByNpc.set(n, l = []);
    l.push(e.rule);
  }
}

/** NPC.value（铜币）。传 netId：负 id 变体（史莱姆 -1..-10 等）有自己的 value 表，
 *  正 netID/无变体传 type 即可 */
export function npcValueOf(netIdOrType: number): number {
  return NPC_VALUE[String(netIdOrType)] ?? 0;
}

/** 条件求值补充上下文（玩家 zone/季节/风——Game 侧提供） */
export interface DropExtras {
  zoneHallow: boolean; zoneCorrupt: boolean; zoneCrimson: boolean;
  zoneJungle: boolean; zoneSnow: boolean; zoneDesert: boolean; zoneDungeon: boolean;
  /** 玩家 zoneBeach（SceneMetrics.zoneBeach：DesertKeyCondition 需 !zoneBeach，Conditions.cs:1096） */
  zoneBeach: boolean;
  bloodMoon: boolean; halloween: boolean; xmas: boolean; windy: boolean;
}

export interface NpcDropCtx {
  rng: RNG;
  /** 原版规则按 netID 索引；变体（-5 等负 id）有则先查，否则回退 type */
  netId: number;
  type: number;
  /** Main.expertMode（大师模式也算，Main.cs:2762） */
  isExpert: boolean;
  isMaster: boolean;
  hardMode: boolean;
  crimson: boolean;
  /** world.flags（downedEyeOfCthulhu/downed_134 等） */
  flags: Record<string, boolean>;
  /** 击杀位置 px */
  x: number; y: number;
  /** 层界 px / tile（灵魂/海盗地图等位置条件） */
  worldSurfaceTile: number; rockLayerTile: number; underworldTileY: number;
  maxTilesX: number; maxTilesY: number;
  lifeMax: number; friendly: boolean; boss: boolean; damage: number; value: number;
  /** 雕像产怪（SpawnedFromStatue）：NotFromStatue 类条件为 false */
  statueSpawned?: boolean;
  /** 玩家血蓝（心/星条件 statLife<statLifeMax2 等） */
  hp: number; hpMax: number; mana: number; manaMax: number;
  /** 月事件（南瓜月/霜月）上下文：kind 1=霜月 2=南瓜月；wave=当前波（无事件缺省 0）。
   *  四个 wave-gate 掉落条件的数据源（Conditions.cs:55-229），Game 击杀掉落处注入 */
  moonEvent?: { kind: 1 | 2; wave: number };
  /** NPC ai[3]（Enemy 注入；RedHatSkeletron / 光之女皇暴怒条件数据源） */
  ai3?: number;
  /** NPC localAI[3]（引擎未承载，恒 undefined → 依赖它的分支恒 false） */
  localAi3?: number;
  /** NPC.AnyNPCs(type)（Enemy 注入存活同型扫描；MissingTwin 条件数据源） */
  anyNpcOfType?: (type: number) => boolean;
  extras?: DropExtras;
}

export interface ResolvedDrop { id: number; n: number; }
export interface NpcDropOutcome {
  drops: ResolvedDrop[];
  /** 规则内 BossBag/local/perPlayer 清零 → 钱币管线跳过 */
  zeroValue: boolean;
}

type State = 'success' | 'failedRoll' | 'failedCond';

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[NpcDrops] ${msg}`);
}

// ============ 条件求值（Conditions.cs 1:1；未知 → false+warn） ============
function downed(ctx: NpcDropCtx, ...ids: number[]): boolean {
  return ids.every((id) => !!ctx.flags[`downed_${id}`]);
}
export function evalCond(name: string, args: unknown[], ctx: NpcDropCtx): boolean {
  const ex = ctx.extras;
  switch (name) {
    case 'NotExpert': return !ctx.isExpert;
    case 'IsExpert': return ctx.isExpert;
    case 'LegacyHack_IsBossAndExpert': return ctx.isExpert;
    case 'LegacyHack_IsBossAndNotExpert': return !ctx.isExpert;
    case 'LegacyHack_IsABoss': return true; // 挂在 boss 自身注册上，击杀即 boss
    case 'Easymode': return !ctx.hardMode;
    case 'IsHardmode': return ctx.hardMode;
    case 'NotRemixSeedHardmode': return ctx.hardMode;
    case 'RemixSeedHardmode': return false;
    case 'RemixSeed': return false;
    case 'NotRemixSeed': return true;
    case 'NeverTrue': return false;
    case 'NotFromStatue': return !ctx.statueSpawned; // Conditions.NotFromStatue
    case 'IsBloodMoonAndNotFromStatue': return !!ex?.bloodMoon && !ctx.statueSpawned;
    case 'IsCrimsonAndNotExpert': return ctx.crimson && !ctx.isExpert;
    case 'IsCorruptionAndNotExpert': return !ctx.crimson && !ctx.isExpert;
    case 'IsChristmas': return !!ex?.xmas;
    case 'HalloweenWeapons':
    case 'HalloweenGoodieBagDrop': return !!ex?.halloween;
    case 'XmasPresentDrop': return !!ex?.xmas;
    case 'DontStarveIsUp': return false;
    case 'TenthAnniversaryIsUp': return false;
    case 'DontStarveIsNotUp': case 'TenthAnniversaryIsNotUp': return true;
    case 'DownedPlantera': return downed(ctx, 262);
    case 'FirstTimeKillingPlantera': return !downed(ctx, 262); // 掉落先于 downed 写入 → 首杀语义
    case 'DownedAllMechBosses': return downed(ctx, 134, 125, 127);
    case 'BeatAnyMechBoss': return downed(ctx, 134) || downed(ctx, 125) || downed(ctx, 127);
    case 'MechdusaKill':
      // Conditions.cs:579：首需 SpecialSeedFeatures.Mechdusa（Mekdusa 秘密种子），
      // 再需三王一眼 AnyNPCs 扫描。秘密种子系统未实装 → 恒 false
      return false;
    case 'FromCertainWaveAndAbove': {
      // Conditions.cs:249-261：NPC.waveNumber >= neededWave（不查事件——无事件时
      // waveNumber=0 恒不满足；注册仅在冰女王专属掉落 1914 上，neededWave=15）
      return (ctx.moonEvent?.wave ?? 0) >= Number(args[0] ?? 0);
    }
    case 'PumpkinMoonDropGatingChance': case 'FrostMoonDropGatingChance': {
      // 稀有掉落总门（Conditions.cs:55-121）：霜月基数 28 / 南瓜月 24；
      // 专家 wave+5；denom = ⌊(base-wave)/2.5⌋，专家再 -2(霜)/-1(南瓜)；下限 1；
      // RollLuck(denom)==0 才放行（luck=0 ≡ rng.Next(denom)==0）
      const me = ctx.moonEvent;
      const frost = name === 'FrostMoonDropGatingChance';
      if (!me || me.kind !== (frost ? 1 : 2)) return false;
      let wave = me.wave;
      if (ctx.isExpert) wave += 5;
      let denom = Math.trunc(((frost ? 28 : 24) - wave) / 2.5);
      if (ctx.isExpert) denom -= frost ? 2 : 1;
      if (denom < 1) denom = 1;
      return rollLuck(ctx, denom, 1);
    }
    case 'PumpkinMoonDropGateForTrophies': case 'FrostMoonDropGateForTrophies': {
      // 纪念碑门（Conditions.cs:123-229）：wave≥15；denom = 4(15/16)/3(17/18)/2(19/20+)，
      // 专家 1/3 概率再 -1；info.rng.Next(denom)==0
      const me = ctx.moonEvent;
      const frost = name === 'FrostMoonDropGateForTrophies';
      if (!me || me.kind !== (frost ? 1 : 2) || me.wave < 15) return false;
      let denom = me.wave >= 19 ? 2 : me.wave >= 17 ? 3 : 4;
      if (ctx.isExpert && ctx.rng.int(0, 2) === 0) denom--;
      return ctx.rng.int(0, Math.max(1, denom) - 1) === 0;
    }
    case 'EmpressOfLightIsGenuinelyEnraged':
      // Conditions.cs:525 → NPC.cs AI_120_HallowBoss_IsGenuinelyEnraged(:46169)：
      // ai[3]∈{2,3}（白天暴怒/二阶段白天）。本作 ai3 与原版 ai[3] 同义
      // （bossAI_lategame.ts:370 IsInPhase2=ai3∈{1,3}），但白天暴怒分支未实现
      // （:554 仅置 1）→ 运行时恒 false，语义已 1:1 接通
      return ctx.type === 636 && (ctx.ai3 === 2 || ctx.ai3 === 3);
    case 'MissingTwin':
      // Conditions.cs:502：另一只眼（125↔126）不在场才放行——先死者不掉（NPC.AnyNPCs）
      return !!ctx.anyNpcOfType && !ctx.anyNpcOfType(ctx.type === 125 ? 126 : 125);
    case 'RedHatSkeletron':
      // Conditions.cs:543 → NPC.cs RedHatSkeletronAdjustmentsEnabled(:67282)：
      // 35/33 看 ai[3]==1（持有裁缝巫毒娃娃击杀裁缝召出的红帽骷髅王，NPC.cs:81203-81264），
      // 36/32 看 localAI[3]==1（引擎未承载 localAI[3] → 恒 false，均为不可达内容）
      return (ctx.type === 35 || ctx.type === 33) ? ctx.ai3 === 1
        : (ctx.type === 36 || ctx.type === 32) ? ctx.localAi3 === 1 : false;
    case 'SkyblockIsUp': case 'SkyblockIsUpNoSickle': return false;
    case 'WindyEnoughForKiteDrops': return !!ex?.windy;
    case 'EyeOfCthulhuDefeatedAndNoAltarsInWorld':
      // Conditions.cs:1422：NPC.downedBoss1 && WorldGen.Skyblock.noAltars。
      // flags.downedBoss1（downed_4? 否——Boss1=克眼）已有，但 noAltars 是天空盒世界
      // 专属字段、本作无天空盒世界 → 恒 false
      return false;
    case 'NamedNPC': return false; // 需 NPC.HasGivenName/GivenName 具名城镇 NPC
      // （Andrew/Whitney/Jim，ItemDropDatabase.cs:732-734）——具名系统未实装 → 恒 false
    case 'LivingFlames':
      // Conditions.cs:939 lifeMax>5 && value>0 && !friendly && hardMode && y>UnderworldLayer
      // && !IsInSimulation（后者仅图鉴模拟，运行时恒 false）——语义已 1:1
      return ctx.lifeMax > 5 && ctx.value > 0 && !ctx.friendly && ctx.hardMode
        && ctx.y / 16 > ctx.underworldTileY;
    case 'SoulOfLight': case 'SoulOfNight': {
      // SoulOfWhateverConditionCanDrop(Conditions.cs:1574)：hardMode && lifeMax>1 &&
      // !friendly && !boss && y>rockLayer && value>=1，排除史莱姆/鸟妖族等
      if (!ctx.hardMode || ctx.lifeMax <= 1 || ctx.friendly || ctx.boss || ctx.value < 1) return false;
      if (ctx.y / 16 <= ctx.rockLayerTile) return false;
      if ([1, 13, 14, 15, 121, 535].includes(ctx.type)) return false;
      return name === 'SoulOfLight' ? !!ex?.zoneHallow
        : !!(ex?.zoneCorrupt || ex?.zoneCrimson);
    }
    case 'PirateMap':
      // Conditions.cs:391 value>0 && hardMode && y<worldSurface+10 && 近海（x<380 或 >maxTilesX-380）
      return ctx.value > 0 && ctx.hardMode && ctx.y / 16 < ctx.worldSurfaceTile + 10
        && (ctx.x / 16 < 380 || ctx.x / 16 > ctx.maxTilesX - 380);
    case 'JungleKeyCondition': case 'CorruptKeyCondition': case 'CrimsonKeyCondition':
    case 'HallowKeyCondition': case 'FrozenKeyCondition': case 'DesertKeyCondition': {
      // Conditions.cs:986-1120：value>0 && hardMode && 玩家在对应 zone（Desert 还需非海滩）
      if (ctx.value <= 0 || !ctx.hardMode) return false;
      switch (name) {
        case 'JungleKeyCondition': return !!ex?.zoneJungle;
        case 'HallowKeyCondition': return !!ex?.zoneHallow;
        case 'CorruptKeyCondition': return !!ex?.zoneCorrupt;
        case 'CrimsonKeyCondition': return !!ex?.zoneCrimson;
        case 'FrozenKeyCondition': return !!ex?.zoneSnow;
        case 'DesertKeyCondition': return !!ex?.zoneDesert && !ex?.zoneBeach;
      }
      return false;
    }
    case 'YoyoCascade': // Conditions.cs:1136 !hardMode && lifeMax>5 && !friendly && value>0 && y>maxTilesY-350 && downedBoss3
      return !ctx.hardMode && ctx.lifeMax > 5 && !ctx.friendly && ctx.value > 0
        && ctx.y / 16 > ctx.maxTilesY - 350 && downed(ctx, 35);
    case 'YoyosAmarok': // hardMode && ZoneSnow && lifeMax>5 && !friendly && value>0
      return ctx.hardMode && !!ex?.zoneSnow && ctx.lifeMax > 5 && !ctx.friendly && ctx.value > 0;
    case 'YoyosYelets': // hardMode && ZoneJungle && downedMechAny && …
      return ctx.hardMode && !!ex?.zoneJungle && (downed(ctx, 134) || downed(ctx, 125) || downed(ctx, 127))
        && ctx.lifeMax > 5 && !ctx.friendly && ctx.value > 0;
    case 'YoyosKraken': // hardMode && ZoneDungeon && downedPlantera && …
      return ctx.hardMode && !!ex?.zoneDungeon && downed(ctx, 262)
        && ctx.lifeMax > 5 && !ctx.friendly && ctx.value > 0;
    case 'YoyosHelFire': // hardMode && !ZoneDungeon && y>(rockLayer+maxTilesY*2)/3 && …
      return ctx.hardMode && !ex?.zoneDungeon
        && ctx.y / 16 > (ctx.rockLayerTile + ctx.maxTilesY * 2) / 3
        && ctx.lifeMax > 5 && !ctx.friendly && ctx.value > 0;
    default:
      warnOnce(`cond:${name}`, `未知掉落条件 ${name}（按 false 处理）`);
      return false;
  }
}

// ============ 规则求值（ItemDropResolver.cs 语义） ============
/** Player.RollLuck(denom, luck=0) ≡ rng.Next(denom) */
function rollLuck(ctx: NpcDropCtx, denom: number, num: number): boolean {
  if (denom <= 1) return true;
  return ctx.rng.int(0, denom - 1) < num;
}

function pushDrop(out: NpcDropOutcome, id: number, n: number) {
  if (n > 0) out.drops.push({ id, n });
}

function condPass(rule: Rule, ctx: NpcDropCtx): boolean | null {
  if (!rule.cond) return true;
  const pass = evalCond(rule.cond.name, rule.cond.args ?? [], ctx);
  return pass;
}

function evalRule(rule: Rule, ctx: NpcDropCtx, out: NpcDropOutcome): State {
  let state: State;
  switch (rule.k) {
    case 'common': {
      if (rollLuck(ctx, rule.denom, rule.num ?? 1)) {
        pushDrop(out, rule.item, ctx.rng.int(rule.min ?? 1, rule.max ?? 1));
        state = 'success';
      } else state = 'failedRoll';
      break;
    }
    case 'rerolls': {
      // CommonDropWithRerolls：rerolls+1 次掷骰任一成功
      let hit = false;
      for (let i = 0; i <= (rule.rerolls ?? 0); i++) hit = hit || rollLuck(ctx, rule.denom, rule.num ?? 1);
      if (hit) { pushDrop(out, rule.item, ctx.rng.int(rule.min ?? 1, rule.max ?? 1)); state = 'success'; }
      else state = 'failedRoll';
      break;
    }
    case 'cond': {
      // ItemDropWithConditionRule：条件不过 = DoesntFillConditions（failedRoll 链不进）
      if (!condPass(rule, ctx)) { state = 'failedCond'; break; }
      if (rollLuck(ctx, rule.denom, rule.num ?? 1)) {
        pushDrop(out, rule.item, ctx.rng.int(rule.min ?? 1, rule.max ?? 1));
        state = 'success';
      } else state = 'failedRoll';
      break;
    }
    case 'oneOf': {
      // OneFromOptionsDropRule：过掷后等权取一
      if (rollLuck(ctx, rule.denom, rule.num ?? 1)) {
        pushDrop(out, rule.ids[ctx.rng.int(0, rule.ids.length - 1)], 1);
        state = 'success';
      } else state = 'failedRoll';
      break;
    }
    case 'expert': { // DropBasedOnExpertMode：normal/expert 二选一委托
      state = evalRule(ctx.isExpert ? rule.expert : rule.normal, ctx, out);
      break;
    }
    case 'master': { // DropBasedOnMasterMode
      state = evalRule(ctx.isMaster ? rule.master : rule.def, ctx, out);
      break;
    }
    case 'masterExpert': { // DropBasedOnMasterAndExpertMode：master>expert>def
      state = evalRule(ctx.isMaster ? rule.master : ctx.isExpert ? rule.expert : rule.def, ctx, out);
      break;
    }
    case 'bossBag': {
      // BossBag = DropBasedOnExpertMode(DropNothing, local(bag)+value=0)；
      // DropNothing 状态 = DoesntFillConditions（非专家分支不进 OnSuccess 链）
      if (rule.cond && !evalCond(rule.cond.name, rule.cond.args ?? [], ctx)) { state = 'failedCond'; break; }
      if (ctx.isExpert) {
        // local 规则 rng.Next(1)<1 恒过 → 掉袋 + 清 value
        pushDrop(out, rule.item, 1);
        out.zeroValue = true;
        state = 'success';
      } else state = 'failedCond';
      break;
    }
    case 'masterCommon': { // ByCondition(IsMasterMode, item)（非 master = DoesntFillConditions）
      if (ctx.isMaster) { pushDrop(out, rule.item, 1); state = 'success'; }
      else state = 'failedCond';
      break;
    }
    case 'masterAll': { // DropBasedOnMasterMode(DropNothing, perPlayer(item, denom, IsMasterMode))
      if (ctx.isMaster) {
        // perPlayer 规则 TryDropping 恒 Success，掷骰在掉落内部决定
        if (rollLuck(ctx, rule.denom ?? 1, 1)) pushDrop(out, rule.item, 1);
        state = 'success';
      } else state = 'failedCond';
      break;
    }
    case 'local': case 'perPlayer': {
      // DropLocalPerClientAndResetsNPCMoneyTo0：rng.Next 掷骰 + value 清零（单人化=直接掉）
      if (rule.cond && !evalCond(rule.cond.name, rule.cond.args ?? [], ctx)) { state = 'failedCond'; break; }
      if (ctx.rng.int(0, Math.max(1, rule.denom ?? 1) - 1) < 1) {
        pushDrop(out, rule.item, ctx.rng.int(rule.min ?? 1, rule.max ?? 1));
        out.zeroValue = true;
        state = 'success';
      } else state = 'failedRoll';
      break;
    }
    case 'gate': {
      // LeadingConditionRule：CanDrop=cond、DropAttempt 恒 success → 放行 OnSuccess 链
      state = condPass(rule, ctx) ? 'success' : 'failedCond';
      break;
    }
    case 'nothing': state = 'failedCond'; break; // DropNothing 状态 = DoesntFillConditions
    case 'mechSpawn': {
      // MechBossSpawnersDropRule：value>0 && hardMode && 未三王齐灭 → 各 1/2500
      const can = ctx.value > 0 && ctx.hardMode && !downed(ctx, 134, 125, 127);
      if (!can) { state = 'failedCond'; break; }
      if (!downed(ctx, 134) && rollLuck(ctx, 2500, 1)) { pushDrop(out, 556, 1); state = 'success'; break; }
      if (!downed(ctx, 125) && rollLuck(ctx, 2500, 1)) { pushDrop(out, 544, 1); state = 'success'; break; }
      if (!downed(ctx, 127) && rollLuck(ctx, 2500, 1)) { pushDrop(out, 557, 1); state = 'success'; break; }
      state = 'failedRoll';
      break;
    }
    case 'slimeBody': case 'statueMimic': {
      // SlimeBodyItemDropRule/StatueMimicItemDropRule：依赖 npc.ai[1]（雕像携带物品）
      // 我们无雕像产怪 → 恒不触发
      state = 'failedCond';
      break;
    }
    case 'dropOneByOne': {
      // DropOneByOne（DropOneByOne.cs TryDroppingItem 1:1）。注册仅四塔碎片
      // （ItemDropDatabase.cs RegisterBoss_LunarTowers :610-629），参数 json 未数值化、
      // 按 :611-627 硬编码：普通 12-20 块 × 每块 1-3；专家块数同、每块基数 ×1.5
      // （min=(int)1.5=1 / max=(int)4.5=4）+ 每活跃玩家 +1/块。
      // ChanceNumerator/Denominator=1 → RollLuck(1) 恒过
      {
        const expert = ctx.isExpert;
        const chunks = ctx.rng.int(12, 20);                    // Next(12, 21)
        const players = 1;                                     // Main.CurrentFrameFlags.ActivePlayersCount（单人）
        const minStack = (expert ? 1 : 1) + players * (expert ? 1 : 0);
        const maxStack = (expert ? 4 : 3) + players * (expert ? 1 : 0);
        for (let i = 0; i < chunks; i++) {
          pushDrop(out, rule.item, ctx.rng.int(minStack, maxStack));
        }
        state = 'success';
      }
      break;
    }
    case 'oneOfRules': { // OneFromRulesRule：rng.Next(denom) 过后等权取一，
      // 被选中的 option 走完整子求值（含其自身链）；规则状态恒以掷骰为准
      // （OneFromRulesRule.cs TryDroppingItem(info, resolveAction)）
      if (rollLuck(ctx, rule.denom ?? 1, 1)) {
        evalRule(rule.rules[ctx.rng.int(0, rule.rules.length - 1)], ctx, out);
        state = 'success';
      } else state = 'failedRoll';
      break;
    }
    case 'listRef': { // List<IItemDropRule>{…}（OneFromRulesRule 参数）
      state = 'success';
      break;
    }
    case 'noRepeat': { // FromOptionsWithoutRepeatsDropRule.cs:27-45：
      // CanDrop 恒 true；dropCount 次不放回抽样（每件 rng.Next(len) 取一后移除），
      // 每件数量恒 1；规则状态恒 Success（无掷骰）
      {
        const pool = [...(rule.ids as number[])];
        for (let i = 0; i < (rule.count ?? 0); i++) {
          if (pool.length <= 0) break;
          const idx = ctx.rng.int(0, pool.length - 1);
          pushDrop(out, pool[idx], 1);
          pool.splice(idx, 1);
        }
        state = 'success';
      }
      break;
    }
    default:
      warnOnce(`rule:${rule.k}`, `未实现的规则 kind ${rule.k}（跳过）`);
      state = 'success';
      break;
  }
  // 链：按父状态门控（Chains.cs TryIfSucceeded/TryIfFailedRandomRoll/TryIfDoesntFillConditions）
  for (const c of rule.chain ?? []) {
    if ((c.on === 'success' && state === 'success')
      || (c.on === 'failedRoll' && state === 'failedRoll')
      || (c.on === 'failedConditions' && state === 'failedCond')) {
      evalRule(c.rule, ctx, out);
    }
  }
  return state;
}

/**
 * 规则掉落主入口（ItemDropSolver.TryDropping 语义）：
 * 全局规则 + 该 netID（回退 type）规则按注册序独立求值。
 */
export function resolveDrops(ctx: NpcDropCtx): NpcDropOutcome {
  const out: NpcDropOutcome = { drops: [], zeroValue: false };
  const rules = [
    ...globalRules,
    ...(rulesByNpc.get(ctx.netId) ?? rulesByNpc.get(ctx.type) ?? []),
  ];
  for (const r of rules) evalRule(r, ctx, out);
  return out;
}

// ============ 钱币管线（NPCLoot_DropMoney :80412 1:1，luck=0 → 单掷） ============
export function rollCoins(value: number, ctx: NpcDropCtx, bloodMoon: boolean): ResolvedDrop[] {
  const rng = ctx.rng;
  let num = value * (1 + rng.int(-20, 75) * 0.01); // Next(-20,76) → [-20,75]
  if (rng.int(0, 1) === 0) num *= 1 + rng.int(5, 10) * 0.01;    // 1/2 ×(1.05-1.10)
  if (rng.int(0, 3) === 0) num *= 1 + rng.int(10, 20) * 0.01;   // 1/4 ×(1.10-1.20)
  if (rng.int(0, 7) === 0) num *= 1 + rng.int(15, 30) * 0.01;   // 1/8 ×(1.15-1.30)
  if (rng.int(0, 15) === 0) num *= 1 + rng.int(20, 40) * 0.01;  // 1/16 ×(1.20-1.40)
  if (rng.int(0, 31) === 0) num *= 1 + rng.int(25, 50) * 0.01;  // 1/32 ×(1.25-1.50)
  if (rng.int(0, 63) === 0) num *= 1 + rng.int(50, 100) * 0.01; // 1/64 ×(1.50-2.00)
  if (bloodMoon) num *= 1 + rng.int(0, 100) * 0.01;
  const drops: ResolvedDrop[] = [];
  while (Math.floor(num) > 0) {
    if (num > 1000000) {
      let n = Math.floor(num / 1000000);
      if (n > 50 && rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      if (rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      let rest = n;
      while (rest > 999) { rest -= 999; drops.push({ id: 74, n: 999 }); }
      num -= 1000000 * n;
      if (rest > 0) drops.push({ id: 74, n: rest });
    } else if (num > 10000) {
      let n = Math.floor(num / 10000);
      if (n > 50 && rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      if (rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      num -= 10000 * n;
      if (n > 0) drops.push({ id: 73, n });
    } else if (num > 100) {
      let n = Math.floor(num / 100);
      if (n > 50 && rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      if (rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      num -= 100 * n;
      if (n > 0) drops.push({ id: 72, n });
    } else {
      let n = Math.floor(num);
      if (n > 50 && rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 2) + 1));
      if (rng.int(0, 4) === 0) n = Math.floor(n / (rng.int(0, 3) + 1));
      n = Math.max(1, n);
      num -= n;
      drops.push({ id: 71, n });
    }
  }
  return drops;
}

// ============ 心/星（NPCLoot_DropCommonLifeAndMana :80332 1:1） ============
export function rollHeartsAndStars(ctx: NpcDropCtx): ResolvedDrop[] {
  const drops: ResolvedDrop[] = [];
  if (ctx.type !== 16 && ctx.type !== 81 && ctx.type !== 121
    && ctx.lifeMax > 1 && ctx.damage > 0) {
    if (ctx.rng.int(0, 5) === 0) { // RollLuck(6)==0
      if (ctx.rng.int(0, 1) === 0 && ctx.mana < ctx.manaMax) drops.push({ id: 184, n: 1 });
      else if (ctx.rng.int(0, 1) === 0 && ctx.hp < ctx.hpMax) drops.push({ id: 58, n: 1 });
    }
    if (ctx.rng.int(0, 1) === 0 && ctx.mana < ctx.manaMax) drops.push({ id: 184, n: 1 }); // RollLuck(2)==0
  }
  return drops;
}

// ============ Boss 药水+心（DoDeathEvents_DropBossPotionsAndHearts :79790） ============
export function rollBossPotionsAndHearts(ctx: NpcDropCtx): ResolvedDrop[] {
  const drops: ResolvedDrop[] = [];
  const stack = ctx.rng.int(5, 15); // Next(5,16)
  let potion = 28; // 弱效治疗药水
  if (ctx.type === 113 || ctx.type === 35 || ctx.type === 668) potion = 188; // 治疗药水
  else if (ctx.type === 222) potion = 1134;
  else if (ctx.type === 657) potion = 499;
  else if (ctx.type > 113 && ctx.type < 222) potion = 499; // 强效治疗
  else if (ctx.type === 636 || ctx.type === 245 || ctx.type === 262 || ctx.type === 370
    || ctx.type === 395 || ctx.type === 439) potion = 499;
  else if (ctx.type === 398) potion = 3544;
  drops.push({ id: potion, n: stack });
  const hearts = ctx.rng.int(5, 9); // Next(5)+5 → 5..9? 原版 Next(5)+5 = 5..9
  for (let i = 0; i < hearts; i++) drops.push({ id: 58, n: 1 });
  return drops;
}

// ============ 掉落初速度（Item.cs:49325-49337） ============
export function dropVelocity(rng: RNG): { vx: number; vy: number } {
  return { vx: rng.int(-30, 30) * 0.1, vy: rng.int(-40, -15) * 0.1 };
}

export { SLIME_BODY };
