// 起始镇民播种（原版 SpawnStarterNPCs genpass，1458 WorldGen.cs:19848-20068 注册+实现；
// 支撑函数 GetAdjustedFloorPosition :24441-24459 / Scan3By3 :24461-24484）。
// ★IIIIIII6 批（CELEB 第二批）：整 pass 此前缺失、WorldGen.ts 备案跳过，本批落地。
//
// 决策链考证（1458 权威；1456 cs:19830 / 1457 :19848 同构——三基线该 pass 正文逐字节一致）：
//   ① Reset 域（cs:11156-11163）：tenthAnniversary && !skyblock → BirthdayParty.GenuineParty=true
//     + PartyDaysOnCooldown=5（getGoodWorld 时另置 afterPartyOfDoom，非本批）——运行时基态在
//     Game 消费端补齐（partyState 属运行时对象，生成器不持有；语义见 wiring/party.ts）。
//   ② 十周年主支（cs:19852-19987），纯 celebrationmk10 路径：向导 22 @spawn 列调整点
//     （home=(spawnTileX,spawnTileY)，硬编码名 "Andrew"）→ 蒸汽朋克人 178 @+2（"Whitney"）
//     → 公主 663 @−2（"Yorai"，置 unlockedPrincessSpawn）→ 派对女孩 208 @+4（"Amanda"，置
//     unlockedPartyGirlSpawn）→ 白兔 656 @−4（boughtBunny + townNpcVariationIndex=1，
//     名字走真实掷骰池）。五者 homeless、direction ±1、全部进 BirthdayParty.CelebratingNPCs
//     （开局即派对）。dontStarve/notTheBees/drunk 组合各自换人（分支注释随行标锚点）。
//   ③ RNG 掷流：NPC.NewNPC → GiveTownUniqueDataToNPCsThatNeedIt（NPC.cs:81665-81679）对
//     命名镇民每次 NewNPC 消费【两】个 genRand 名字掷——GivenName=getNewNPCName(Type)
//     （RandomFromCategory → Next(类目键数)，LanguageManager.cs:426-433）与 GetNameForVariant
//     再掷一次（LegacyNPCProfile.RollVariation 恒 0 零掷，Profiles.cs:83-86）；两掷结果随即被
//     硬编码名覆写。类目宽度取 en-US Town.json 键数（zh-Hans 键集全等 = 跨语言不变量）：
//     GuideNames 36 / SteampunkerNames 20 / PrincessNames 22 / PartyGirlNames 18 /
//     MechanicNames 24 / MerchantNames 23 / PainterNames 19 / WitchDoctorNames 10 /
//     SlimeNames_Rainbow 29 / SlimeNames_Purple 25。
//     白兔 656 是 VariantNPCProfile（Profiles.cs:186-206）：A 掷 Next(15)（BunnyNames_White）
//     + 变体掷 Next(6)（生成期 genRand≡Main.rand 单流，WorldGen.cs:4362 别名）
//     → B 掷 Next(BunnyNames_{variants[v]} 键数)。B 掷【不被覆写】即兔子的最终名字；
//     变体位随后被 pass 置 1（Angora 贴图档）。★RunPass 每 pass 头重播种子
//     （WorldGenerator.cs:488-502 `Main.rand=new UnifiedRandom(_seed)`），本 pass 掷骰不外溢
//     下游 pass，但掷数/宽度/顺序仍 1:1——白兔终名对 x86 w.wld 可观测（实证
//     seed=1999040562 → variant roll=4(Lop)、B 掷=11 → 'Boof' 与 x86 存档全等）。
//   ④ 非十周年 else 链（cs:19986-20059：infectedSeed→20 德鲁伊 var1「Lilith」族 /
//     vampireSeed→633 动物学家 / remix→441 税务员(savedTaxCollector) / drunk×dontStarve→
//     124 机械师(savedMech) / notTheBees&&!dontStarve→17 商人(unlockedMerchantSpawn) /
//     getGoodWorld→38 爆破匠(unlockedDemolitionistSpawn) / drunk→208 派对女孩
//     (unlockedPartyGirlSpawn) / 否则 22 向导兜底）。
//   ★IIIII20 换人支收齐：else 链全支落地（链序照抄反编译 19986→20054）；十周年首 NPC 的
//     worldIsInfected 臂(:19855-19861,名 "Lilith"+var1)与 remix 臂(:19868-19871,
//     税务员+savedTaxCollector、名字仍走 :19887 "Andrew"——类型臂与命名臂是两条独立链)
//     一并补齐(zenith=八旗组合含 tenth∧remix∧infected 三面)。普通种子（无任何相关旗标）
//     维持零掷骰零记录早退（Game.ts 历史口径承接域，_iii6 金标锚定）；裸 skyblock 世界
//     无独立支（原版落向导兜底）——SW 侧维持整域早退的历史口径（登记债）。
//     命名语义细化：非十周年链【无】硬编码名覆盖 → GivenName 终态 = 第二掷落池名
//     （GiveTownUniqueDataToNPCsThatNeedIt：Legacy 变体掷恒 0 零骰、GetNameForVariant=
//     getNewNPCName(Type) 再抽一次且覆写第一掷），本批照 D 批白兔先例把 en-US 名池
//     硬编码入库（NAME_POOLS），记录终名可与 x86 en-US 客户端 w.wld NPC 段对拍；
//     IIIIII14 已落的两支（机械师/派对女孩）保持 '' 口径不动（M 车道产物）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { World } from '../../World';
import { genSolidType } from './GenSolid';

/** 存入 world.starterTownNpcs 的单条记录（消费端 Game.afterWorldLoad 新世界分支实例化） */
export interface StarterTownNpc {
  key: string;          // TOWN_NPC_IDS 键
  givenName: string;
  /** bottom-anchor 展开像素（原版 nPC.Bottom=(X*16,Y*16)：top-left.x=X*16−9、
   *  top-left.y=Y*16−原生高度——x86 g1458-celeb w.wld princess y=3592=227*16−40 实证） */
  x: number;
  y: number;
  /** homeless 锚（原版 homeTileX/Y；向导分支锚=spawn 本格，其余=调整点）。本仓 homeless
   *  NPC 不设 home（home=null 表无家，游走锚由 AI 首落地等价近似——TownNPC.anchorTile
   *  注释口径），锚值保留供探针对拍 x86 w.wld homeTile */
  anchor: [number, number];
  dir: -1 | 1;
  variationIndex?: number;
}

/** 命名镇民的名字掷宽度表（en-US Town.json 类目键数；仅宽度参与掷流——结果全被覆写） */
const NAME_ROLL_WIDTH: Record<number, number> = {
  20: 21,    // DryadNames      ★IIIII20（infected 支德鲁伊）
  22: 36,    // GuideNames
  38: 22,    // DemolitionistNames ★IIIII20（getGoodWorld 支爆破匠）
  178: 20,   // SteampunkerNames
  441: 19,   // TaxCollectorNames ★IIIII20（remix 支税务员）
  633: 21,   // BestiaryGirlNames ★IIIII20（vampireSeed 支动物学家）
  663: 22,   // PrincessNames
  208: 18,   // PartyGirlNames
  124: 24,   // MechanicNames
  17: 23,    // MerchantNames
  227: 19,   // PainterNames
  228: 10,   // WitchDoctorNames
};

/**
 * ★IIIII20：非十周年链名字池（en-US Town.json 提取序，宽度与上表一致——zh-Hans 键集
 * 全等=跨语言不变量；数组序 = LanguageManager._categoryGroupedKeys 插入序）。
 * 非十周年链各支的 GivenName 无硬编码覆盖 → 第二掷落池名即终名（与 x86 en-US
 * 客户端 w.wld NPC 段 given-name 字段同构可对拍）。 */
const NPC_NAME_POOLS: Record<number, readonly string[]> = {
  20: ['Alalia', 'Alura', 'Ariella', 'Caelia', 'Calista', 'Chryseis', 'Emerenta', 'Elysia',
    'Evvie', 'Faye', 'Felicitae', 'Lunette', 'Nata', 'Nissa', 'Tatiana', 'Rosalva', 'Shea',
    'Tania', 'Isis', 'Celestia', 'Xylia'],                                    // DryadNames
  17: ['Alfred', 'Barney', 'Calvin', 'Edmund', 'Edwin', 'Eugene', 'Frank', 'Frederick',
    'Gilbert', 'Gus', 'Wilbur', 'Seymour', 'Louis', 'Humphrey', 'Harold', 'Milton',
    'Mortimer', 'Howard', 'Walter', 'Isaac', 'Joseph', 'Kristian', 'Ralph'],  // MerchantNames
  38: ['Dolbere', 'Bazdin', 'Durim', 'Tordak', 'Garval', 'Morthal', 'Oten', 'Dolgen',
    'Gimli', 'Gimut', 'Duerthen', 'Beldin', 'Jarut', 'Ovbere', 'Norkas', 'Dolgrim',
    'Boften', 'Norsun', 'Dias', 'Fikod', 'Urist', 'Darur'],                   // DemolitionistNames
  441: ['McKinly', 'Millard', 'Fillmore', 'Rutherford', 'Chester', 'Grover', 'Cleveland',
    'Theodore', 'Herbert', 'Warren', 'Lyndon', 'Ronald', 'Harrison', 'Woodrow', 'Tweed',
    'Blanton', 'Dwyer', 'Carroll', 'Agnew'],                                  // TaxCollectorNames
  633: ['Maria', 'MacKenzie', 'Azaria', 'Juanita', 'Astra', 'Hayley', 'Becca', 'Veronica',
    'Tia', 'Robyn', 'Arien', 'Jane', 'Bindi', 'Dian', 'Lori', 'Mardy', 'Mollie', 'Lizzy',
    'Daphne', 'Ellen', 'Lilith'],                                             // BestiaryGirlNames
};

/** 非十周年链命名双掷：第一掷落池（Legacy 变体掷恒 0 零骰）、第二掷覆写为终名。 */
function rollStarterName(rng: RNG, type: number): string {
  rng.nextInt(NAME_ROLL_WIDTH[type] ?? NPC_NAME_POOLS[type]?.length ?? 1);
  const second = rng.nextInt(NAME_ROLL_WIDTH[type] ?? NPC_NAME_POOLS[type]?.length ?? 1);
  return NPC_NAME_POOLS[type]?.[second] ?? '';
}

/** VariantNPCProfile 变体表（Profiles.cs ctor 参序 White…Silver；index=townNpcVariationIndex） */
const BUNNY_VARIANTS = ['White', 'Angora', 'Dutch', 'Flemish', 'Lop', 'Silver'] as const;
/** BunnyNames_{variant} 插入序名池（LanguageManager.RandomFromCategory 取第 Next(N) 个键；
 *  白兔 B 掷不被覆写 → 名池须保序才可与 x86 全等）。宽度即数组长度。 */
const BUNNY_NAME_POOLS: Record<(typeof BUNNY_VARIANTS)[number], readonly string[]> = {
  White: ['Bunnicula', 'Ben', 'Roger', 'Skippy', 'Donnie', 'Alice', 'Presto', 'Shion',
    'Lisette', 'Lily', 'Inaba', 'Shirayuki', 'Lilia', 'Ears', 'Jimothy'],
  Angora: ['Breadbuns', 'Loaf', 'Babs', 'BigB', 'Greg', 'Fluffy', 'Pom', 'Muffin',
    'Maximus', 'Donald'],
  Dutch: ['Oreo', 'Olaf', 'Domino', 'Oz', 'Yin', 'Yang', 'Pow', 'Kaguya', 'Mono',
    'Panda', 'Orin'],
  Flemish: ['Thumper', 'Cinnabun', 'Peter', 'Hazel', 'Loki', 'Sunflower', 'Toby',
    'Daisy', 'Dusty', 'Jazz', 'Russell', 'Honeycomb'],
  Lop: ['Bunbun', 'Lola', 'Max', 'Tyler', 'Flops', 'Flappie', 'Caerbannog', 'Mochi',
    'Dandy', 'Puff', 'Youp', 'Boof', 'Veidra'],
  Silver: ['Bugz', 'Buster', 'Silvine', 'Bunstar', 'Lord', 'Bunnykins', 'Crystal',
    'Chrome', 'Vincent', 'Zach', 'Joshua', 'Dustbunny', 'Dusty'],
};
const BUNNY_NAME_COUNT: Record<string, number> =
  Object.fromEntries(Object.entries(BUNNY_NAME_POOLS).map(([k, v]) => [k, v.length]));

/** 原版 SetDefaults 高度（top-left 展开用）：aiStyle7 人形 width18 height40、656 兔 height20 */
const VAN_H = { human: 40, bunny: 20 };

/** WorldGen.SolidTile（active && tileSolid，cs:70037 区；生成期无 inActive 维度） */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  return genSolidType(st.type[i]);
}

/** Scan3By3（cs:24461-24484）：3×3 窗无实心（isEmpty）/ 窗底下一行有实心（hasFloor） */
function scan3By3(st: TileStore, topLeftX: number, topLeftY: number): { isEmpty: boolean; hasFloor: boolean } {
  let isEmpty = true;
  let hasFloor = false;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (solidTile(st, topLeftX + i, topLeftY + j)) {
        isEmpty = false;
        break;
      }
    }
    if (!isEmpty) break;
  }
  for (let k = 0; k < 3; k++) {
    if (solidTile(st, topLeftX + k, topLeftY + 3)) {
      hasFloor = true;
      break;
    }
  }
  return { isEmpty, hasFloor };
}

/** GetAdjustedFloorPosition（cs:24441-24459）：(x−1,y−2) 左上锚向上找空窗再向下找落地行，
 *  返回 Point(num+1, num2+2) */
function getAdjustedFloorPosition(st: TileStore, x: number, y: number, spawnTileY: number): [number, number] {
  const tx = x - 1;
  let ty = y - 2;
  let isEmpty = false;
  let hasFloor = false;
  while (!isEmpty && ty > spawnTileY - 10) {
    ({ isEmpty } = scan3By3(st, tx, ty));
    if (!isEmpty) ty--;
  }
  while (!hasFloor && ty < spawnTileY + 10) {
    ({ hasFloor } = scan3By3(st, tx, ty));
    if (!hasFloor) ty++;
  }
  return [tx + 1, ty + 2];
}

function pushStarter(
  list: StarterTownNpc[],
  key: string,
  givenName: string,
  ax: number,
  ay: number,
  dir: -1 | 1,
  h: number,
  variationIndex?: number,
  /** 向导支特有：homeless 锚 = spawn 本格（cs:19886-19887 homeTile=spawnTileX/Y），
   *  出生像素锚仍取调整点 */
  anchorOverride?: [number, number],
): void {
  // Bottom=(ax*16, ay*16)；top-left = (ax*16−9, ay*16−vanillaH)
  list.push({
    key, givenName,
    x: ax * 16 - 9,
    y: ay * 16 - h,
    anchor: anchorOverride ?? [ax, ay],
    dir,
    ...(variationIndex !== undefined ? { variationIndex } : {}),
  });
}

/**
 * SpawnStarterNPCs 主口（槽位注册序 GrassWall(19734) < 本 pass < SunflowersPart2(20043)；
 * WorldGen.ts 中挂在「草墙」与「向日葵」之间）。★IIIII20 后的受理面：十周年主支 +
 * 非十周年 else 链七臂全支（见函数体内 ★IIIII20 注）；未被任何臂受理的世界
 * （普通种子/dontStarve 单开/notTheBees×theConstant 等——原版落 :20052 向导兜底）
 * 维持零掷骰零记录早退（NPC 命名掷的 ROLL 也一并消失——与原版普通种子 run 该 pass
 * 的 NewNPC(22) 分支【有】名字掷不同,该差额由 Game.ts 承接域的历史口径吸收,头注④）。
 */
export function starterNpcsPass(ctx: { store: TileStore; rng: RNG; world: World }): void {
  const { store, rng, world } = ctx;
  const f = world.seedFlags ?? {};
  // cs:19852 外门 tenthAnniversary。skyblock 组合按 cs:19892 `if (!skyblockWorldGen)`
  // 门语义整段跳过。
  // ★IIIII20（换人支收齐）：非十周年 else 链 cs:19986-20059 全支落地。原版是一棵
  //   if/else-if 决策树（infected > vampire > remix > drunk×const > notBees(!const) >
  //   getGoodWorld > 裸 drunk > 否则向导兜底）；SW 侧按 §0 外门把十周年主支留在本函数
  //   尾部原位，各链臂以「上游全否 + 首个命中的 else-if 语义」展开为带 return 的独立臂，
  //   命中即记录一条 starter 并返回——组合旗标世界的受理结果与反编译逐行同构。
  //   未被任何臂受理的形态（普通种子/dontStarve 单开/notTheBees×theConstant 等，原版
  //   落 ：20052 最终 else 向导兜底）→ 零掷骰零记录早退（Game.ts 历史口径承接域，
  //   _iii6 金标「非十周年世界零副作用」继续锚定普通种子路径）。skyblock 在链树中无
  //   独立支，但读档侧/入住域依赖既有口径 → 维持整域早退（登记债）。
  //   臂位置锚（IIIII14 口径延续）：x=spawnTileX*16+8、y=(spawnTileY−2)*16
  //   （消费端 TownNPC 底锚约定；原版字面像素为 NewNPC(spawnX*16, spawnY*16) 中心式
  //   展开 top-left=(X−9,Y−20)，两口径只差出生那 1 帧的摆放位,AI 重力立刻抹平）；
  //   home 锚=spawn 本格(homeless)、direction=1、townNpcVariationIndex 不设（除 infected 臂=1）。
  const sx = world.spawnX;
  const sy = world.spawnY;

  if (f.skyblock) return;   // skyblock：换人链无独立支，维持整域早退的历史口径（登记债）

  // ── 臂① infectedSeed → 德鲁伊 20 变体 1（「purify this」：世界全感染起始小队）──
  //    cs:19986-19997：NewNPC(spawnPx, 20) → homeless/direction=1 → variationIndex=1；
  //    remix 同时置 savedTaxCollector（:19994-19996）。NewNPC(20) 经
  //    GiveTownUniqueDataToNPCsThatNeedIt 吃 DryadNames 双掷且【无】硬编码覆写
  //    → 终名=第二掷落池名（DryadNames 不含 "Lilith" 覆写语义——那是十周年内嵌臂专属）。
  if (!f.tenthAnniversary && f.infectedSeed) {
    const givenName = rollStarterName(rng, 20);
    if (f.remix) world.flags.savedTaxCollector = true;
    world.starterTownNpcs = [{
      key: 'dryad', givenName,
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
      variationIndex: 1,                                // townNpcVariationIndex（cs:19993）
    }];
    return;
  }
  // ── 臂② vampireSeed → 动物学家 633（「what a horrible night to have a curse」）──
  //    cs:19999-20005：Raw spawn 像素/homeless/direction=1，无附加旗标。633 是
  //    TransformableNPCProfile（RollVariation 恒 0 零骰）+ Legacy 命名 → BestiaryGirlNames
  //    双掷、第二掷=终名（"Lilith" 即该池第 21 位——池表见 NPC_NAME_POOLS 注）。
  if (!f.tenthAnniversary && f.vampireSeed && !f.infectedSeed) {
    const givenName = rollStarterName(rng, 633);
    world.starterTownNpcs = [{
      key: 'zoologist', givenName,
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 臂③ remix → 税务员 441（「don't dig up」，savedTaxCollector）──
  //    cs:20007-20015：NewNPC(441)+savedTaxCollector=true（:20014）；TaxCollectorNames
  //    双掷第二掷=终名。优先级在 drunk 双支之前（don't dig up 世界出生在地底,
  //    出生点值由 SpawnPoint 域决定,本 pass 只忠实引用）。
  if (!f.tenthAnniversary && f.remix && !f.vampireSeed && !f.infectedSeed) {
    const givenName = rollStarterName(rng, 441);
    world.flags.savedTaxCollector = true;
    world.starterTownNpcs = [{
      key: 'tax_collector', givenName,
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 臂④ drunk×theConstant → 机械师 124（cs:20018/:20023 savedMech）——
  //    ★IIIII14 已落地,本批原样迁入链条位（表达式逐字节不变）。
  if (!f.tenthAnniversary && f.drunkWorld && f.theConstant
    && !f.remix && !f.vampireSeed && !f.infectedSeed) {
    // drunk×dontStarve → 机械师 124（cs:20016-20025）
    rng.nextInt(NAME_ROLL_WIDTH[124]!);   // getNewNPCName(124)——结果保留（运行期近似 ''）
    rng.nextInt(NAME_ROLL_WIDTH[124]!);   // GetNameForVariant 重掷（Legacy 恒 0）
    world.flags.savedMech = true;         // NPC.savedMech（cs:20023）
    world.starterTownNpcs = [{
      key: 'mechanic', givenName: '',
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 臂⑤ notTheBees&&!theConstant → 商人 17（cs:20025-20032：NewNPC/:20032）──
  //    MerchantNames 双掷第二掷=终名。上游唯一相关否定 = 驳回的④(drunk&&const)——
  //    裸 drunk（无 const）世界【不】挡本臂（else 树语义：④条件已含 const）。
  //    （notTheBees×theConstant 同开时按原版落向导兜底——此处显式展开。）
  if (!f.tenthAnniversary && f.notTheBees && !f.theConstant
    && !f.remix && !f.vampireSeed && !f.infectedSeed) {
    const givenName = rollStarterName(rng, 17);
    world.flags.unlockedMerchantSpawn = true;
    world.starterTownNpcs = [{
      key: 'merchant', givenName,
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 臂⑥ getGoodWorld(for the worthy) → 爆破匠 38
  //    （cs:20036/:20041 unlockedDemolitionistSpawn）──DemolitionistNames 双掷第二掷=终名。
  if (!f.tenthAnniversary && f.getGoodWorld && !f.remix && !f.vampireSeed
    && !f.infectedSeed && !(f.drunkWorld && f.theConstant) && !(f.notTheBees && !f.theConstant)) {
    const givenName = rollStarterName(rng, 38);
    world.flags.unlockedDemolitionistSpawn = true;
    world.starterTownNpcs = [{
      key: 'demolitionist', givenName,
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 臂⑦ 裸 drunk → 派对女孩 208（cs:20045/:20050 unlockedPartyGirlSpawn）——
  //    ★IIIII14 已落地,本批原样迁入链条位并补齐上游否定了 notBees/getGood 两臂
  //    （旧门漏排的组合世界此前误接本臂）。
  if (!f.tenthAnniversary && f.drunkWorld && !f.getGoodWorld && !f.notTheBees && !f.theConstant
    && !f.remix && !f.vampireSeed && !f.infectedSeed) {
    // 裸 drunk → 派对女孩 208（cs:20045-20054）
    rng.nextInt(NAME_ROLL_WIDTH[208]!);
    rng.nextInt(NAME_ROLL_WIDTH[208]!);
    world.flags.unlockedPartyGirlSpawn = true;   // NPC.unlockedPartyGirlSpawn（cs:20050）
    world.starterTownNpcs = [{
      key: 'party_girl', givenName: '',
      x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
    }];
    return;
  }
  // ── 最终 else（cs:20052-20058 向导兜底）：未被以上任一臂受理的形态 → 零掷骰零记录
  //    早退（Game.ts 历史口径承接域;①-⑦ 各臂都提前 return,走到的只有兜底集合）。

  if (!f.tenthAnniversary) return;
  const starters: StarterTownNpc[] = [];

  // ---- 首 NPC 三臂（★IIIII20 补齐 :19855-19888 的 worldIsInfected/remix 两臂）----
  //   类型臂与命名臂在原版是两条【独立】if 链，逐一照抄：
  //   类型（cs:19855-19871）：worldIsInfected→德鲁伊 20 / else-if !remix→(notBees?
  //     骨架商 228 : 向导 22) / else→税务员 441 + savedTaxCollector=true；
  //   命名（cs:19876-19888）：worldIsInfected→"Lilith"+townNpcVariationIndex=1 /
  //     notTheBees&&!remix→"Victor"(SkeletonMerchantNames.Victor) / else→"Andrew"
  //     （GuideNames.Andrew——remix 臂换成的税务员也取 "Andrew"！类型臂≠命名臂）。
  //   命名双掷宽度随【类型】（getNewNPCName(Type)），两掷结果全部被硬编码名覆写。
  //   zenith(getfixedboi)=tenth∧remix∧notBees∧drunk∧const 八旗组合 → 命中 remix 臂。
  //   worldIsInfected 单独或与十周年叠加仅 serverconfig/多段串可达（parseSeed 单段
  //   不产该组合面）；tenth+infected 在此臂落地后 Party celebrating 名单照常收编。
  // 出生像素锚 = spawn 列的调整点（注意 Y 同取调整点），homeless 锚 = spawn 本格
  {
    const [adjX, adjY] = getAdjustedFloorPosition(store, sx, sy, sy);
    const notBeesBranch = !!f.notTheBees && !f.remix;
    let t = 22;                        // 默认向导 22（cs:19865 NewNPC 短式）
    let key: string = 'guide';
    let givenName = 'Andrew';          // cs:19887 GuideNames.Andrew
    let varIdx: number | undefined;
    if (f.infectedSeed) {
      t = 20; key = 'dryad';           // cs:19857 NewNPC(20)
      givenName = 'Lilith';            // cs:19878 GetTextValue("Lilith")
      varIdx = 1;                      // cs:19879 townNpcVariationIndex=1
    } else if (!f.remix) {
      if (notBeesBranch) {
        t = 228; key = 'witch_doctor'; // cs:19865 三目后臂 NewNPC(228)
        givenName = 'Victor';          // cs:19883 SkeletonMerchantNames.Victor
      }
      // 否则保持向导 22/"Andrew"（cs:19865 前臂/:19887）
    } else {
      t = 441; key = 'tax_collector';  // cs:19869 NewNPC(441)
      world.flags.savedTaxCollector = true;  // cs:19870 NPC.savedTaxCollector（zenith 主线！）
      givenName = 'Andrew';            // cs:19887 else 臂——税务员也姓 Andrew
    }
    rng.nextInt(NAME_ROLL_WIDTH[t]);  // GivenName=getNewNPCName(Type)（被硬编码名覆写）
    rng.nextInt(NAME_ROLL_WIDTH[t]);  // GetNameForVariant 重掷（Legacy 变体掷恒 0）
    pushStarter(starters, key, givenName, adjX, adjY, 1, VAN_H.human, varIdx, [sx, sy]);
  }

  // ---- @+2：theConstant&&&!remix → 机械师 Korrie，否则蒸汽朋克人 Whitney（cs:19893-19914）----
  {
    const [px, py] = getAdjustedFloorPosition(store, sx + 2, sy, sy);
    if (f.theConstant && !f.remix) {
      rng.nextInt(NAME_ROLL_WIDTH[124]);
      rng.nextInt(NAME_ROLL_WIDTH[124]);
      pushStarter(starters, 'mechanic', 'Korrie', px, py, -1, VAN_H.human);
    } else {
      rng.nextInt(NAME_ROLL_WIDTH[178]);
      rng.nextInt(NAME_ROLL_WIDTH[178]);
      pushStarter(starters, 'steampunker', 'Whitney', px, py, -1, VAN_H.human);
    }
  }

  // ---- @−2：notTheBees&&&!remix → 商人 Charles(+unlockedMerchantSpawn)，否则公主 Yorai
  //      (+unlockedPrincessSpawn)（cs:19915-19938）----
  {
    const [px, py] = getAdjustedFloorPosition(store, sx - 2, sy, sy);
    if (f.notTheBees && !f.remix) {
      rng.nextInt(NAME_ROLL_WIDTH[17]);
      rng.nextInt(NAME_ROLL_WIDTH[17]);
      pushStarter(starters, 'merchant', 'Charles', px, py, 1, VAN_H.human);
      world.flags.unlockedMerchantSpawn = true;        // NPC.unlockedMerchantSpawn（cs:19935）
    } else {
      rng.nextInt(NAME_ROLL_WIDTH[663]);
      rng.nextInt(NAME_ROLL_WIDTH[663]);
      pushStarter(starters, 'princess', 'Yorai', px, py, 1, VAN_H.human);
      world.flags.unlockedPrincessSpawn = true;        // NPC.unlockedPrincessSpawn（cs:19937）
    }
  }

  // ---- @+4：drunk → 画家 Jim，否则派对女孩 Amanda(+unlockedPartyGirlSpawn)（cs:19939-19959）----
  {
    const [px, py] = getAdjustedFloorPosition(store, sx + 4, sy, sy);
    if (f.drunkWorld) {
      rng.nextInt(19);                                 // PainterNames（硬编码 "Jim" 覆写）
      rng.nextInt(19);
      pushStarter(starters, 'painter', 'Jim', px, py, -1, VAN_H.human);
    } else {
      rng.nextInt(NAME_ROLL_WIDTH[208]);
      rng.nextInt(NAME_ROLL_WIDTH[208]);
      pushStarter(starters, 'party_girl', 'Amanda', px, py, -1, VAN_H.human);
      world.flags.unlockedPartyGirlSpawn = true;       // NPC.unlockedPartyGirlSpawn（cs:19957）
    }
  }

  // ---- @−4 终末位（cs:19960-19987）：remix → 彩虹史莱姆 681 "Slimestar"；drunk → 紫
  //      史莱姆 680 "Slimefors"；否则白兔 656（boughtBunny + variationIndex=1，终名=B 掷落池名）----
  {
    const [px, py] = getAdjustedFloorPosition(store, sx - 4, sy, sy);
    if (f.remix) {
      rng.nextInt(29);                                 // SlimeNames_Rainbow ×2（均被 "Slimestar" 覆写）
      rng.nextInt(29);
      pushStarter(starters, 'town_slime_diva', 'Slimestar', px, py, 1, VAN_H.human, 1);
      world.flags.unlockedSlimeRainbowSpawn = true;    // NPC.unlockedSlimeRainbowSpawn（cs:19968）
    } else if (f.drunkWorld) {
      rng.nextInt(25);                                 // SlimeNames_Purple ×2（均被 "Slimefors" 覆写）
      rng.nextInt(25);
      pushStarter(starters, 'town_slime_clumsy', 'Slimefors', px, py, 1, VAN_H.human, 1);
      world.flags.unlockedSlimePurpleSpawn = true;     // NPC.unlockedSlimePurpleSpawn（cs:19976）
    } else {
      // 白兔（VariantNPCProfile）：A 掷 BunnyNames_White(15) → 变体掷 Next(6) → B 掷落
      // variants[v] 名池 = 终名（GiveTownUniqueData 命名链 NPC.cs:81678-81680）
      const aRoll = rng.nextInt(BUNNY_NAME_COUNT.White);  // 覆写链上段 GivenName=getNewNPCName(656)
      void aRoll;
      const vRoll = rng.nextInt(BUNNY_VARIANTS.length);   // VariantNPCProfile.RollVariation
      const variant = BUNNY_VARIANTS[vRoll];
      const bRoll = rng.nextInt(BUNNY_NAME_COUNT[variant]);
      const givenName = BUNNY_NAME_POOLS[variant][bRoll] ?? '';
      pushStarter(starters, 'town_bunny', givenName, px, py, 1, VAN_H.bunny, 1);
      world.flags.boughtBunny = true;                  // NPC.boughtBunny（cs:19982）
    }
  }

  // BirthdayParty.CelebratingNPCs 追加（每名后 Add(num)，cs:19891/:19912/:19934/:19958/:19985）
  world.starterTownNpcs = starters;
  // ★IIIII20：十周年主支到此收束（其下为非十周年 else 链臂域，tenth 世界不可达——
  // 链臂条件全部携带 !f.tenthAnniversary，与原版外层 if/else-if 树同构）。
  return;
}
