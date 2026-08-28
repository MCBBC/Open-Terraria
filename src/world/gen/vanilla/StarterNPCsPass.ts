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
//   ④ 非十周年 else 链（cs:19963-20066：infectedSeed→20 Lilith / vampireSeed→633 动物学家 /
//     remix→441 税务员 / drunk×dontStarve→124 机械师 / notTheBees&&!dontStarve→17 商人 /
//     getGoodWorld→38 爆破匠 / drunk→208 派对女孩 / 否则 22 向导）——Game.ts 新世界分支已
//     承接 guide/zoologist/merchant 三支（历史口径），其余为组合种子域登记未移植；本 pass
//     对非十周年世界零掷骰零记录早退。十周年内部的 worldIsInfected 组合支（cs:19856-19862，
//     仅 serverconfig 可达）同属登记未移植（infectedSeed 世界在本 pass 零副作用）。
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
  22: 36,    // GuideNames
  178: 20,   // SteampunkerNames
  663: 22,   // PrincessNames
  208: 18,   // PartyGirlNames
  124: 24,   // MechanicNames
  17: 23,    // MerchantNames
  227: 19,   // PainterNames
  228: 10,   // WitchDoctorNames
};

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
 * WorldGen.ts 中挂在「草墙」与「向日葵」之间）。非十周年世界零副作用早退（NPC 命名掷的
 * ROLL 也一并消失——与原版普通种子 run 该 pass 的 NewNPC(22) 分支【有】名字掷不同，
 * 该差额由 Game.ts 承接域的历史口径吸收，见文件头 ④）。
 */
export function starterNpcsPass(ctx: { store: TileStore; rng: RNG; world: World }): void {
  const { store, rng, world } = ctx;
  const f = world.seedFlags ?? {};
  // cs:19852 外门 tenthAnniversary。skyblock 组合按 cs:19892 `if (!skyblockWorldGen)`
  // 门语义整段跳过。
  // ★IIIII14（非十周年 else 链，cs:19963-20065——接 D 批登记）：
  //   infectedSeed→20 / vampireSeed→633 / remix→441 / drunk×dontStarve→124 机械师
  //   (savedMech) / notTheBees&&!dontStarve→17 商人 / getGood→38 爆破匠 /
  //   **drunk→208 派对女孩(unlockedPartyGirlSpawn)** / 否则 22 向导。
  //   本批接线纯 drunk 可达的两支：drunk×theConstant 与裸 drunk；其余组合仍由
  //   Game.ts 历史口径承接/登记。链序照抄反编译（vampire 在 remix 后、notBees 在
  //   drunk×const 后、getGood 在 notBees 后）。位置锚=spawn 像素原值（NewNPC 直投,
  //   非调整点）、home 锚=spawn 本格、direction=1、homeless。命名掷 ×2 同③注
  //   （GivenName 池抽中被**保留**——非十周年链无硬编码名覆盖,名字终态运行期补齐）。
  if (!f.tenthAnniversary && !f.infectedSeed && !f.skyblock && !f.vampireSeed && !f.remix && f.drunkWorld) {
    const sx = world.spawnX, sy = world.spawnY;
    if (f.theConstant) {
      // drunk×dontStarve → 机械师 124（cs:20016-20025）
      rng.nextInt(NAME_ROLL_WIDTH[124]!);   // getNewNPCName(124)——结果保留（运行期近似 ''）
      rng.nextInt(NAME_ROLL_WIDTH[124]!);   // GetNameForVariant 重掷（Legacy 恒 0）
      world.flags.savedMech = true;         // NPC.savedMech（cs:20023）
      world.starterTownNpcs = [{
        key: 'mechanic', givenName: '',
        x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
      }];
    } else {
      // 裸 drunk → 派对女孩 208（cs:20045-20054）
      rng.nextInt(NAME_ROLL_WIDTH[208]!);
      rng.nextInt(NAME_ROLL_WIDTH[208]!);
      world.flags.unlockedPartyGirlSpawn = true;   // NPC.unlockedPartyGirlSpawn（cs:20052）
      world.starterTownNpcs = [{
        key: 'party_girl', givenName: '',
        x: sx * 16 + 8, y: (sy - 2) * 16, anchor: [sx, sy], dir: 1,
      }];
    }
    return;
  }
  // infectedSeed 组合支登记未移植（不可达面）。
  if (!f.tenthAnniversary || f.infectedSeed || f.skyblock) return;

  const sx = world.spawnX;
  const sy = world.spawnY;
  const starters: StarterTownNpc[] = [];

  // ---- 向导支（cs:19853-19891；notTheBees&&&!remix 时换巫医 228 "Victor"）----
  // 出生像素锚 = spawn 列的调整点（注意 Y 同取调整点），homeless 锚 = spawn 本格
  {
    const [adjX, adjY] = getAdjustedFloorPosition(store, sx, sy, sy);
    const notBeesBranch = !!f.notTheBees && !f.remix;
    const t = notBeesBranch ? 228 : 22;
    rng.nextInt(NAME_ROLL_WIDTH[t]);  // GivenName=getNewNPCName(Type)（被硬编码名覆写）
    rng.nextInt(NAME_ROLL_WIDTH[t]);  // GetNameForVariant 重掷（Legacy 变体掷恒 0）
    if (notBeesBranch) pushStarter(starters, 'witch_doctor', 'Victor', adjX, adjY, 1, VAN_H.human, undefined, [sx, sy]);
    else pushStarter(starters, 'guide', 'Andrew', adjX, adjY, 1, VAN_H.human, undefined, [sx, sy]);
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
}
