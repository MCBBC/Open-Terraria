// 原版随机文本体系 1:1 移植（数据全部来自 l10n/zh-Hans.json 分节，零硬编码文案）。
//   世界随机名   UIWorldCreation.AssignRandomWorldName (UIWorldCreation.cs:1004-1021)
//   NPC 随机名   NPC.getNewNPCNameInner (NPC.cs:7260-7302：类型→名字池分节表)
//   死亡文本     Lang.CreateDeathMessage (Lang.cs:1010-1132：Generic + DeathSource + DeathText.*)
//   墓志铭       WorldGen 墓地装饰 (WorldGen.cs:25161 Epitaph 分节)——墓地 pass 未移植，先数据就绪
//   玩家随机名   ★原版无玩家名字池（角色名只能手输）——取全部人类城镇 NPC 名字池并集，记录为偏差
import { Lang } from './Lang';

// ===================== 世界随机名（UIWorldCreation.cs:1004-1021） =====================

/** 随机世界名：组合模板 {Adjective}/{Noun}/{Location}；1/10000 概率「永恒领域」；>27 字重掷 */
export function randomWorldName(): string {
  let name = '';
  do {
    const tpl = Lang.randomFrom('RandomWorldName_Composition', '{Adjective}的{Noun}{Location}');
    name = tpl
      .replace('{Adjective}', Lang.randomFrom('RandomWorldName_Adjective'))
      .replace('{Noun}', Lang.randomFrom('RandomWorldName_Noun'))
      .replace('{Location}', Lang.randomFrom('RandomWorldName_Location'));
    if (Math.floor(Math.random() * 10000) === 0) {
      name = Lang.text('SpecialWorldName.TheConstant');
    }
  } while (name.length > 27);
  return name;
}

// ===================== NPC 随机名（NPC.cs:7260-7302 名字池映射表） =====================

/** 原版 npcType → 名字池分节（getNewNPCNameInner switch 原表；无池类型不在表中） */
const NPC_NAME_CATEGORY: Record<number, string> = {
  17: 'MerchantNames', 18: 'NurseNames', 19: 'ArmsDealerNames', 20: 'DryadNames',
  22: 'GuideNames', 38: 'DemolitionistNames', 54: 'ClothierNames', 107: 'GoblinTinkererNames',
  108: 'WizardNames', 124: 'MechanicNames', 160: 'TruffleNames', 178: 'SteampunkerNames',
  207: 'DyeTraderNames', 208: 'PartyGirlNames', 209: 'CyborgNames', 227: 'PainterNames',
  228: 'WitchDoctorNames', 229: 'PirateNames', 353: 'StylistNames', 368: 'TravelingMerchantNames',
  369: 'AnglerNames', 453: 'SkeletonMerchantNames', 441: 'TaxCollectorNames', 550: 'BartenderNames',
  588: 'GolferNames', 633: 'BestiaryGirlNames', 663: 'PrincessNames',
  // 宠物/史莱姆城 NPC（城 NPC 系统未移植，数据先就绪）
  637: 'CatNames_Siamese', 638: 'DogNames_Labrador', 656: 'BunnyNames_White',
  670: 'SlimeNames_Blue', 678: 'SlimeNames_Green', 679: 'SlimeNames_Old', 680: 'SlimeNames_Purple',
  681: 'SlimeNames_Rainbow', 682: 'SlimeNames_Red', 683: 'SlimeNames_Yellow', 684: 'SlimeNames_Copper',
};

/** NPC.getNewNPCName：按原版 npcType 从对应名字池随机取名；无池类型返回 '' */
export function newNpcName(vanillaNpcType: number): string {
  const cat = NPC_NAME_CATEGORY[vanillaNpcType];
  return cat ? Lang.randomFrom(cat) : '';
}

/** 玩家角色随机名：人类城镇 NPC 名字池并集随机（★原版无玩家名字池——记录为偏差） */
export function randomPlayerName(): string {
  const pools = [
    'GuideNames', 'MerchantNames', 'NurseNames', 'ArmsDealerNames', 'DryadNames',
    'DemolitionistNames', 'ClothierNames', 'GoblinTinkererNames', 'WizardNames', 'MechanicNames',
    'SteampunkerNames', 'DyeTraderNames', 'PartyGirlNames', 'CyborgNames', 'PainterNames',
    'WitchDoctorNames', 'PirateNames', 'StylistNames', 'StylistNames', 'TaxCollectorNames',
    'GolferNames', 'PrincessNames',
  ];
  return Lang.randomFrom(pools[Math.floor(Math.random() * pools.length)], Lang.text('Mods.SandboxWorld.DefaultPlayerName'));
}

// ===================== 死亡文本（Lang.cs:1010-1132 CreateDeathMessage） =====================

/** 死因（PlayerDeathReason._sourceOtherIndex 语义子集） */
export type DeathCause =
  | { kind: 'npc'; name: string }   // 敌怪击杀 → DeathSource.NPC
  | { kind: 'fell' }                // other=0  Fell_1..9
  | { kind: 'drowned' }             // other=1  Drowned_1..7
  | { kind: 'lava' }                // other=2  Lava_1..5
  | { kind: 'default' }             // other=3/255 → Default 包裹 / Slain
  ;

const rand1 = (n: number) => 1 + Math.floor(Math.random() * n);

/** Lang.CreateDeathMessage 1:1（我们可触发的死因子集 + 全表保留） */
export function createDeathText(playerName: string, cause: DeathCause): string {
  const generic = Lang.randomFrom('DeathTextGeneric', '{0}被杀死了').replace('{0}', playerName);
  switch (cause.kind) {
    case 'npc':
      // DeathSource.NPC："{generic}，凶手是{npc}。"
      return Lang.text('DeathSource.NPC').replace('{0}', generic).replace('{1}', cause.name);
    case 'fell':
      return Lang.text(`DeathText.Fell_${rand1(9)}`).replace('{0}', playerName);
    case 'drowned':
      return Lang.text(`DeathText.Drowned_${rand1(7)}`).replace('{0}', playerName);
    case 'lava':
      return Lang.text(`DeathText.Lava_${rand1(5)}`).replace('{0}', playerName);
    case 'default':
    default:
      // other=255 → Slain（与 generic 同义，取原版键）
      return Lang.text('DeathText.Slain').replace('{0}', playerName);
  }
}

// ===================== 墓志铭（WorldGen.cs:25161） =====================

/** 随机墓志铭（原版墓地装饰用；墓地 pass 未移植——数据就绪供后续/调试使用） */
export function randomEpitaph(): string {
  return Lang.randomFrom('Epitaph');
}
