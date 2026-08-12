// 提取机 1:1 移植（tile 219 普通版 / 642 叶绿版）。
// 权威源码：
//   - Terraria.GameContent/ExtractinatorHelper.cs:5-525  RollExtractinatorDrop（转化主逻辑）
//   - Terraria.ID/ItemID.cs:1104                        ItemID.Sets.ExtractinatorMode（输入→模式）
//   - Terraria.GameContent/ItemTrader.cs:82-108         叶绿版矿物兑换表（CreateChlorophyteExtractinator）
//   - Terraria/Player.cs:41008-41049                    PlaceThing_ItemInExtractinator（对准使用）
//   - Terraria/Wiring.cs:2563-2622                      通电触发（邻域箱子消耗）
// 产出/输入一律用原版 item id，由调用方（Game.ts）映射回内部 key。

/** Main.rand.Next 语义封装（next(n)=0..n-1；nextRange(a,b)=a..b-1） */
export interface ExtractinatorRand {
  next(maxExclusive: number): number;
  nextRange(minInclusive: number, maxExclusive: number): number;
}

export function mathRand(): ExtractinatorRand {
  return {
    next: (n) => Math.floor(Math.random() * n),
    nextRange: (a, b) => a + Math.floor(Math.random() * (b - a)),
  };
}

export interface ExtractDrop {
  /** 原版 item id；-1 = 该输入不可转化（模式 -1） */
  itemType: number;
  stack: number;
}

/**
 * ItemID.Sets.ExtractinatorMode（ItemID.cs:1104，Factory.CreateIntSet(-1, ...)）。
 * 原版 item id → 提取模式；未列入 = -1（不可转化）。
 *  mode0 泥沙/雪泥  mode1 沙漠化石  mode2 垃圾(锡罐/海藻/旧鞋)  mode3 苔藓
 *  mode4 粪块  mode5 蜂巢块  mode6 贝壳堆/黑曜石
 */
export const EXTRACTINATOR_MODE: Readonly<Record<number, number>> = {
  424: 0,    // SiltBlock 泥沙
  1103: 0,   // SlushBlock 雪泥
  3347: 1,   // DesertFossil 沙漠化石
  2339: 2,   // TinCan 锡罐
  2338: 2,   // FishingSeaweed 海藻
  2337: 2,   // OldShoe 旧鞋
  4354: 3,   // LavaMoss 熔岩苔
  4389: 3,   // ArgonMoss 氩苔
  4377: 3,   // KryptonMoss 氪苔
  4378: 3,   // XenonMoss 氙苔
  5127: 3,   // VioletMoss 紫苔
  5128: 3,   // RainbowMoss 彩虹苔
  5395: 4,   // PoopBlock 粪块
  1124: 5,   // Hive 蜂巢块
  4090: 6,   // ShellPileBlock 贝壳堆
  173: 6,    // Obsidian 黑曜石
};

export function extractinatorMode(vanillaItemId: number): number {
  return EXTRACTINATOR_MODE[vanillaItemId] ?? -1;
}

/** 六宝石均匀池（ExtractinatorHelper.cs:299-323，181 紫晶/180 黄玉/177 蓝宝/179 翡翠/178 红宝/182 钻石） */
const GEM_POOL = [181, 180, 177, 179, 178, 182] as const;
/** 普通苔藓池（:222-242 与 :247-267，4349 绿/4350 棕/4351 红/4352 蓝/4353 紫） */
const MOSS_COMMON = [4349, 4350, 4351, 4352, 4353] as const;
/** 稀有苔藓池（:198-218，仅叶绿版 642 有 1/10 机会；4354 熔岩/4389 氩/4377 氪/5127 紫/4378 氙） */
const MOSS_RARE = [4354, 4389, 4377, 5127, 4378] as const;
/** 前困难矿石（RollOreEarlymode :511-523：12 铜/11 铁/14 银/13 金/699 锡/700 铅/701 钨/702 铂） */
const ORE_PREHM = [12, 11, 14, 13, 699, 700, 701, 702] as const;
/** 困难矿石（RollOreHardmode :490-509，仅 642 且 Main.hardMode：
 *  12/11/14/13/699/700/701/702 + 364 钴/1104 钯/365 秘银/1105 山铜/366 精金/1106 钛金） */
const ORE_HM = [12, 11, 14, 13, 699, 700, 701, 702, 364, 1104, 365, 1105, 366, 1106] as const;

// 钱币(71-74)→本地 coin key 表已随本地物品退役移除:Game 侧直接 VANILLA_ITEM_KEY_BY_ID

/**
 * RollExtractinatorDrop（ExtractinatorHelper.cs:5-488）1:1。
 * 判定链顺序不可调换（原版 if/else-if 短路即概率表）：
 *   num4 坚固化石(仅 mode1) → num7 钱币大表 → num 琥珀蚊 → num5 垃圾 → num6 苔藓
 *   → num9 草种(仅 mode4) → num8 泥土 → num11 蜂蜜块 → num10 沙 → num2 宝石
 *   → num3 琥珀 → 1/3 钱币小表 → 兜底矿石
 */
export function rollExtractinatorDrop(
  extractionMode: number,
  extractinatorBlockType: number,
  rand: ExtractinatorRand,
  hardMode: boolean,
): ExtractDrop {
  let num = 5000;   // :7  琥珀蚊(AmberMosquito 1242) 分母
  let num2 = 25;    // :8  宝石分母
  let num3 = 50;    // :9  琥珀(Amber 999) 分母
  let num4 = -1;    // :10 坚固化石(FossilOre 3380) 分母（mode1=10）
  let num5 = -1;    // :11 垃圾分支开关（mode2）
  let num6 = -1;    // :12 苔藓分支开关（mode3）
  let num7 = 1;     // :13 钱币大表开关（-1 关闭）
  let num8 = -1;    // :14 → 泥土块 2（mode4）
  let num9 = -1;    // :15 草种分母（mode4=50）
  let num10 = -1;   // :16 → 沙块 169（mode6）
  let num11 = -1;   // :17 → 蜂蜜块 1125（mode5）
  switch (extractionMode) {
    case -1:
      return { itemType: -1, stack: 1 };                                   // :20-23
    case 1:                                                                // 沙漠化石（:24-29）
      num = (num / 3) | 0;  // C# int /= 3 → 1666
      num2 *= 2;
      num3 = 20;
      num4 = 10;
      break;
    case 2:                                                                // 垃圾（:30-37）
      num = -1; num2 = -1; num3 = -1; num4 = -1; num5 = 1; num7 = -1;
      break;
    case 3:                                                                // 苔藓（:38-46）
      num = -1; num2 = -1; num3 = -1; num4 = -1; num5 = -1; num7 = -1; num6 = 1;
      break;
    case 4:                                                                // 粪块（:47-54）
      num = -1; num2 = -1; num3 = -1; num7 = -1; num9 = 50; num8 = 1;
      break;
    case 5:                                                                // 蜂巢块（:55-61）
      num = -1; num2 = -1; num3 = -1; num7 = -1; num11 = 1;
      break;
    case 6:                                                                // 贝壳堆/黑曜石（:62-68）
      num = -1; num2 = -1; num3 = -1; num7 = -1; num10 = 1;
      break;
  }
  let itemType = -1;                                                        // :70
  let stack = 1;                                                            // :71

  // num4：坚固化石（:72-87，仅 mode1，1/10）
  if (num4 !== -1 && rand.next(num4) === 0) {
    itemType = 3380;                                                        // :74 FossilOre
    if (rand.next(5) === 0) stack += rand.next(2);                          // :75-78
    if (rand.next(10) === 0) stack += rand.next(3);                         // :79-82
    if (rand.next(15) === 0) stack += rand.next(4);                         // :83-86
  }
  // num7：钱币大表（:88-170，1/2 触发）
  else if (num7 !== -1 && rand.next(2) === 0) {
    if (rand.next(12000) === 0) {                                           // :90 铂 1/12000
      itemType = 74;
      for (let k = 0; k < 3; k++) if (rand.next(14) === 0) stack += rand.nextRange(0, 2); // :93-104
    } else if (rand.next(800) === 0) {                                      // :106 金 1/800
      itemType = 73;
      for (let k = 0; k < 4; k++) if (rand.next(6) === 0) stack += rand.nextRange(1, 21); // :109-124
      if (rand.next(6) === 0) stack += rand.nextRange(1, 20);               // :125-128
    } else if (rand.next(60) === 0) {                                       // :130 银 1/60
      itemType = 72;
      for (let k = 0; k < 3; k++) if (rand.next(4) === 0) stack += rand.nextRange(5, 26); // :133-144
      if (rand.next(4) === 0) stack += rand.nextRange(5, 25);               // :145-148
    } else {                                                                // :151 铜 兜底
      itemType = 71;
      for (let k = 0; k < 3; k++) if (rand.next(3) === 0) stack += rand.nextRange(10, 26); // :153-164
      if (rand.next(3) === 0) stack += rand.nextRange(10, 25);              // :165-168
    }
  }
  // num：琥珀蚊（:171-174，mode0 1/5000 / mode1 1/1666）
  else if (num !== -1 && rand.next(num) === 0) {
    itemType = 1242;                                                        // AmberMosquito
  }
  // num5：垃圾（:175-193，mode2）学徒饵 3/4 / 蜗牛 / 蠕虫 / 老手饵
  else if (num5 !== -1) {
    if (rand.next(4) !== 1) itemType = 2674;                                // :177-180 ApprenticeBait
    else if (rand.next(3) !== 1) itemType = 2006;                           // :181-184 Snail
    else if (rand.next(3) !== 1) itemType = 2002;                           // :185-188 Worm
    else itemType = 2675;                                                   // :189-192 JourneymanBait
  }
  // num6：苔藓（:194-268，mode3）——叶绿版 642 有 1/10 机会改掷稀有苔藓池
  else if (num6 !== -1 && extractinatorBlockType === 642) {
    if (rand.next(10) === 1) itemType = MOSS_RARE[rand.next(5)]!;           // :196-218（注意 ==1 非 ==0）
    else itemType = MOSS_COMMON[rand.next(5)]!;                             // :220-242
  } else if (num6 !== -1) {
    itemType = MOSS_COMMON[rand.next(5)]!;                                  // :245-267
  }
  // num9：草种（:269-284，mode4，1/50：62 草/195 丛林草/194 蘑菇草）
  else if (num9 !== -1 && rand.next(num9) === 0) {
    itemType = [62, 195, 194][rand.next(3)]!;                               // :271-283
  }
  // num8：泥土块（:285-288，mode4 兜底）
  else if (num8 > 0) {
    itemType = 2;                                                           // DirtBlock
  }
  // num11：蜂蜜块（:289-292，mode5 唯一产出）
  else if (num11 > 0) {
    itemType = 1125;                                                        // HoneyBlock
  }
  // num10：沙块（:293-296，mode6 唯一产出）
  else if (num10 > 0) {
    itemType = 169;                                                         // SandBlock
  }
  // num2：宝石（:297-344，mode0 1/25 / mode1 1/50）
  else if (num2 !== -1 && rand.next(num2) === 0) {
    itemType = GEM_POOL[rand.next(6)]!;                                     // :299-323
    stackBonus(rand, (s) => { stack += s; });                               // :324-343
  }
  // num3：琥珀（:345-368，mode0 1/50 / mode1 1/20）
  else if (num3 !== -1 && rand.next(num3) === 0) {
    itemType = 999;                                                         // Amber
    stackBonus(rand, (s) => { stack += s; });                               // :348-367
  }
  // 1/3 钱币小表（:369-459）
  else if (rand.next(3) === 0) {
    if (rand.next(5000) === 0) {                                            // :371 铂 1/5000
      itemType = 74;
      for (let k = 0; k < 5; k++) if (rand.next(10) === 0) stack += rand.nextRange(0, 3); // :374-393
    } else if (rand.next(400) === 0) {                                      // :395 金 1/400
      itemType = 73;
      for (let k = 0; k < 4; k++) if (rand.next(5) === 0) stack += rand.nextRange(1, 21); // :398-413
      if (rand.next(5) === 0) stack += rand.nextRange(1, 20);               // :414-417
    } else if (rand.next(30) === 0) {                                       // :419 银 1/30
      itemType = 72;
      for (let k = 0; k < 3; k++) if (rand.next(3) === 0) stack += rand.nextRange(5, 26); // :422-433
      if (rand.next(3) === 0) stack += rand.nextRange(5, 25);               // :434-437
    } else {                                                                // :440 铜 兜底
      itemType = 71;
      for (let k = 0; k < 4; k++) if (rand.next(2) === 0) stack += rand.nextRange(10, 26); // :442-453
      if (rand.next(2) === 0) stack += rand.nextRange(10, 25);              // :454-457
    }
  }
  // 兜底矿石（:460-487）
  else {
    itemType = ORE_PREHM[rand.next(8)]!;                                    // :462 / RollOreEarlymode :511-523
    if (extractinatorBlockType === 642 && hardMode) {                       // :463-466
      itemType = ORE_HM[rand.next(14)]!;                                    // RollOreHardmode :490-509
    }
    stackBonus(rand, (s) => { stack += s; });                               // :467-486
  }
  return { itemType, stack };
}

/** 矿石/宝石/琥珀的叠加阶梯（:324-343、:348-367、:467-486 三处同构） */
function stackBonus(rand: ExtractinatorRand, add: (n: number) => void): void {
  if (rand.next(20) === 0) add(rand.nextRange(0, 2));
  if (rand.next(30) === 0) add(rand.nextRange(0, 3));
  if (rand.next(40) === 0) add(rand.nextRange(0, 4));
  if (rand.next(50) === 0) add(rand.nextRange(0, 5));
  if (rand.next(60) === 0) add(rand.nextRange(0, 6));
}

/**
 * 叶绿版矿物兑换表（ItemTrader.cs:82-108 CreateChlorophyteExtractinator）。
 * AddOption_Interchangable 双向；AddOption_CyclicLoop(134,137,139) 地牢砖循环
 * 134→137→139→134；AddOption_FromAny(giving, takings) 每个 taking → giving。
 * 原版 item id → 兑换产物 id；未列入 = 不可兑换。
 */
export const CHLOROPHYTE_TRADES: Readonly<Record<number, number>> = {
  // Interchangable（:85-102）
  12: 699, 699: 12,     // 铜矿↔锡矿
  11: 700, 700: 11,     // 铁矿↔铅矿
  14: 701, 701: 14,     // 银矿↔钨矿
  13: 702, 702: 13,     // 金矿↔铂矿
  56: 880, 880: 56,     // 魔矿↔猩红矿
  364: 1104, 1104: 364, // 钴↔钯
  365: 1105, 1105: 365, // 秘银↔山铜
  366: 1106, 1106: 366, // 精金↔钛金
  20: 703, 703: 20,     // 铜锭↔锡锭
  22: 704, 704: 22,     // 铁锭↔铅锭
  21: 705, 705: 21,     // 银锭↔钨锭
  19: 706, 706: 19,     // 金锭↔铂锭
  57: 1257, 1257: 57,   // 魔锭↔猩红锭
  381: 1184, 1184: 381, // 钴锭↔钯锭
  382: 1191, 1191: 382, // 秘银锭↔山铜锭
  391: 1198, 1198: 391, // 精金锭↔钛金锭
  86: 1329, 1329: 86,   // 暗影鳞↔椎骨组织
  // CyclicLoop（:93）地牢砖 蓝→绿→粉→蓝
  134: 137, 137: 139, 139: 134,
  // FromAny（:103-107）多对一
  61: 3, 836: 3, 409: 3,               // 黑檀/猩红/珍珠石 → 石头
  370: 169, 1246: 169, 408: 169,       // 黑檀/猩红/珍珠沙 → 沙
  833: 664, 835: 664, 834: 664,        // 紫/红/粉冰 → 冰
  3276: 3271, 3277: 3271, 3339: 3271,  // 腐化/猩红/神圣沙岩 → 沙岩
  3274: 3272, 3275: 3272, 3338: 3272,  // 腐化/猩红/神圣硬化沙 → 硬化沙
};

/**
 * 642 使用间隔倍率（Player.cs:41018-41020：num=1，tile 642 时 ×0.33）。
 * ApplyItemTime（Player.cs:4221-4233）：val=(int)(useTime×mult)，≥1——10×0.33=3。
 */
export function extractinatorUseTime(useTime: number, blockType: number): number {
  let mult = 1;
  if (blockType === 642) mult *= 0.33;
  const val = Math.trunc(useTime * mult);
  return useTime > 0 ? Math.max(val, 1) : 0;
}

// ============ 通电触发（Wiring.cs:2563-2622）============
// 通电语义：提取机本身无库存——消耗源是锚点邻域内的箱子（非上方/内部方块）。
// devices.ts 负责锚点回算 + checkMech(60) 冷却，箱子查找/消耗在这里（纯函数，可单测）。

/** 箱子占位抽象（Game 侧 ChestData 的窄视图；items 的 id 为原版 item id） */
export interface ExtractChest {
  /** 2×2 锚点（左上格） */
  x: number;
  y: number;
  locked?: boolean;
  items: Array<{ id: number; stack: number } | null>;
}

/**
 * TryFindChestForExtractinator（Wiring.cs:2596-2622）1:1：行扫描锚点邻域
 * (ax-2..ax+5)×(ay-2..ay+5)（:2603-2606 num=3/num2=3/num3=2），Chest.FindChest
 * 为 2×2 占位判定（命中占位内任意格都算）；上锁箱跳过（:2613）。
 */
export function findExtractinatorChest<C extends ExtractChest>(
  chests: readonly C[], ax: number, ay: number,
): C | undefined {
  for (let cy = ay - 2; cy <= ay + 5; cy++) {
    for (let cx = ax - 2; cx <= ax + 5; cx++) {
      const c = chests.find((ch) =>
        !ch.locked && cx >= ch.x && cx <= ch.x + 1 && cy >= ch.y && cy <= ch.y + 1);
      if (c) return c;
    }
  }
  return undefined;
}

/**
 * 箱内消耗（Wiring.cs:2575-2592）：items 自后向前（num3=maxItems-1..0）找首个非空格，
 * 每格只 roll 一次；itemType>0 才扣 1（:2584-2587）并停止，否则继续找下一格。
 * idToVanilla：items 的 id → 原版 item id（引擎侧内部 id 时由调用方传入，默认恒等）。
 */
export function extractinatorConsumeFromChest(
  chest: ExtractChest,
  blockType: number,
  rand: ExtractinatorRand,
  hardMode: boolean,
  idToVanilla: (id: number) => number = (id) => id,
): ExtractDrop | null {
  for (let k = chest.items.length - 1; k >= 0; k--) {
    const it = chest.items[k];
    if (!it) continue;
    const mode = extractinatorMode(idToVanilla(it.id));
    const roll = rollExtractinatorDrop(mode, blockType, rand, hardMode);
    if (roll.itemType > 0) {
      it.stack -= 1;
      if (it.stack <= 0) chest.items[k] = null;
      return roll;
    }
  }
  return null;
}
