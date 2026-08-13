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

/** 死因（PlayerDeathReason._sourceOtherIndex 全表，Lang.cs:1055-1128） */
export type DeathCause =
  | { kind: 'npc'; name: string }   // 凶手 NPC（proj/player 杀手未实现→归 npc）
  | { kind: 'fell' }                // other=0  Fell_1..9（:25085 摔落）
  | { kind: 'drowned' }             // other=1  Drowned_1..7（:22989）
  | { kind: 'lava' }                // other=2  Lava_1..5（:27392）
  | { kind: 'defaultWrap' }         // other=3  DeathText.Default 包裹 generic（:28514 地块接触伤害）
  | { kind: 'slain' }               // other=4/255 → Slain
  | { kind: 'petrified' }           // other=5  Petrified_1..4（:24929/:25067 石化摔落）
  | { kind: 'stabbed' }             // other=6  Stabbed
  | { kind: 'suffocated' }          // other=7  Suffocated_1..2（:19146 沙埋）
  | { kind: 'burned' }              // other=8  Burned_1..4（:19154/:19201 灼烧/着火 DoT——含炽热狱石/陨石）
  | { kind: 'poisoned' }            // other=9  Poisoned（:19193）
  | { kind: 'electrocuted' }        // other=10 Electrocuted_1..4（:19197）
  | { kind: 'triedToEscape' }       // other=11 TriedToEscape（:22050 WoF 舌距>3000px）
  | { kind: 'tongued' }             // other=12 WasLicked_1..2（:19150 舌锁 DoT / :22054 墙抵世界缘）
  | { kind: 'teleportFail' }        // other=13 Teleport_1（混沌传送杖）
  | { kind: 'inferno' }             // other=16 Inferno（:9938 狱火药水）
  | { kind: 'diedInTheDark' }       // other=17 DiedInTheDark
  | { kind: 'starved' }             // other=18 Starved_1..3（:19175 饥荒种子）
  | { kind: 'space' }               // other=19 Space_1..5（:23799，{1}=世界名）
  | { kind: 'teamTank' }            // other=20 TeamTank（:37751 圣骑士盾伤害转移）
  | { kind: 'underground' }         // other=21 Underground_1..5（:23831，{1}=世界名）
  | { kind: 'vampire' };            // other=22 VampireBurningInDaylight_1..6（:19189，{1}=世界名）

const rand1 = (n: number) => 1 + Math.floor(Math.random() * n);

/** Lang.CreateDeathMessage 1:1（Lang.cs:1010-1132 全分支；generic {0}=玩家 {1}=世界名） */
export function createDeathText(playerName: string, cause: DeathCause, worldName = ''): string {
  const generic = Lang.randomFrom('DeathTextGeneric', '{0}被杀死了')
    .replace('{0}', playerName).replace('{1}', worldName);
  const one = (key: string, vars: string[] = [playerName, worldName]) =>
    Lang.text(key).replace(/\{(\d)\}/g, (_, i) => vars[+i] ?? '');
  switch (cause.kind) {
    case 'npc':
      return Lang.text('DeathSource.NPC').replace('{0}', generic).replace('{1}', cause.name);
    case 'fell': return one(`DeathText.Fell_${rand1(9)}`);
    case 'drowned': return one(`DeathText.Drowned_${rand1(7)}`);
    case 'lava': return one(`DeathText.Lava_${rand1(5)}`);
    case 'defaultWrap': return one('DeathText.Default', [generic]);
    case 'slain': return one('DeathText.Slain');
    case 'petrified': return one(`DeathText.Petrified_${rand1(4)}`);
    case 'stabbed': return one('DeathText.Stabbed');
    case 'suffocated': return one(`DeathText.Suffocated_${rand1(2)}`);
    case 'burned': return one(`DeathText.Burned_${rand1(4)}`);
    case 'poisoned': return one('DeathText.Poisoned');
    case 'electrocuted': return one(`DeathText.Electrocuted_${rand1(4)}`);
    case 'triedToEscape': return one('DeathText.TriedToEscape');
    case 'tongued': return one(`DeathText.WasLicked_${rand1(2)}`);
    case 'teleportFail': return one('DeathText.Teleport_1');
    case 'inferno': return one('DeathText.Inferno');
    case 'diedInTheDark': return one('DeathText.DiedInTheDark');
    case 'starved': return one(`DeathText.Starved_${rand1(3)}`);
    case 'space': return one(`DeathText.Space_${rand1(5)}`);
    case 'teamTank': return one('DeathText.TeamTank');
    case 'underground': return one(`DeathText.Underground_${rand1(5)}`);
    case 'vampire': return one(`DeathText.VampireBurningInDaylight_${rand1(6)}`);
  }
}

// ===================== 墓志铭（WorldGen.cs:25161） =====================

/** 随机墓志铭（原版墓地装饰用；墓地 pass 未移植——数据就绪供后续/调试使用） */
export function randomEpitaph(): string {
  return Lang.randomFrom('Epitaph');
}
