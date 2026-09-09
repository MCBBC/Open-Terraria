// ============================================================================
// EmoteBubble.PickNPCEmote 全量 1:1 —— Terraria.GameContent.UI/EmoteBubble.cs
//   :295-355  主入口（无 boss → 九池按概率并集；有 boss → ProbeCombat 整池替换）
//   :357-366  ProbeCombat     战斗表情固定池
//   :368-398  ProbeWeather    天气（cloudBGActive/cloudAlpha/雨中昼夜/雪原/海岸/圣所）
//   :400-430  ProbeEvents     事件（派对/血月/日食/流星/南瓜月/霜月/旧日军团）
//   :432-450  ProbeDebuffs    减益（燃烧×2 域/沉默/中毒/诅咒+手持 215）
//   :452-464  ProbeItems      物品（固定 6 项 + 半血墓碑 84）
//   :466-487  ProbeTownNPCs   在场城镇 NPC（NPCID.Sets.FaceEmote 表 :4835 映射）
//   :489-535  ProbeBiomes     群系梯（天空→岩浆层→洞穴→神圣/腐化/猩红/丛林/雪原/
//                             海岸→沙漠→其他世界）
//   :537-592  ProbeCritters   小动物（地上/地下权重 0.2 抽取带；goblin/frost/
//                             pirates/martians 战胜解锁；猩红蜘蛛）
//   :594-618  ProbeEmotions   情绪基池 15 项（血月夜 16/1/138 ×4 份）
//   :620-758  ProbeBosses     Boss 池（num 进度门 + rand(maxValue) 滚动提前解锁）
//   :760-1065 ProbeExceptions  NPC 专属池（17/18/19/20/22/37/38/54/107/108/124/
//                             142/160/178/207/208/209/227/228/229/353/368/369/
//                             453/441；19↔22/107↔124 对话 other 特判）
// 随机源 = 注入 rand（原版 Main.rand；本仓 TownNPC 用实例种子 rng 保持可复现）。
// ★空池语义（:351-354）：list.Count==0 → emote 保持 NewBubbleNPC 构造值 0（爱心）。
// ★原版 quirk 照录（勿"修复"）：ProbeWeather 海岸风暴支 `plr.position.Y <
//   Main.worldSurface / 16.0`（px 与 tile/16 异纲比较→几乎恒假）；ProbeExceptions
//   369 `nPC.position.Y < Main.worldSurface`（同上异纲）；ProbeBiomes 是
//   position.Y/16（同纲，正常）。见各处注。
// ============================================================================

/** NPCID.Sets.FaceEmote（Terraria.ID/NPCID.cs:4835）——城镇 NPC vanilla id → 表情 id。
 *  键值对逐字解析（(键,值) 交错）：17→101 商人、107→109 哥布林工匠、453→124 骷髅商人、
 *  441→125 税收官、588→140 高尔夫球手、633→141 动物学家、663→145 公主 */
export const FACE_EMOTE: Readonly<Record<number, number>> = {
  17: 101, 18: 102, 19: 103, 20: 104, 22: 105, 37: 106, 38: 107, 54: 108,
  107: 109, 108: 110, 124: 111, 142: 112, 160: 113, 178: 114, 207: 115,
  208: 116, 209: 117, 227: 118, 228: 119, 229: 120, 353: 121, 368: 122,
  369: 123, 453: 124, 441: 125, 588: 140, 633: 141, 663: 145,
};

/** 最近的活跃玩家（Main.player[Player.FindClosest(...)] 快照） */
export interface EmotePickPlayer {
  /** position（Entity 左上角,px） */
  x: number; y: number;
  /** Center（px） */
  cx: number; cy: number;
  zoneSnow: boolean; zoneHallow: boolean; zoneCorrupt: boolean;
  zoneCrimson: boolean; zoneJungle: boolean; zoneDesert: boolean;
  /** Player.onFire / onFire2 / poisoned（buff 24 / 39 / 20 运行时位） */
  onFire: boolean; onFire2: boolean; poisoned: boolean;
  /** statLife / statLifeMax2 */
  statLife: number; statLifeMax2: number;
  /** inventory[selectedItem].type（原版物品 id；ProbeDebuffs 手持 215 判定用） */
  heldVanillaItemId: number;
}

/** 气泡锚 NPC（= PickNPCEmote 的 (NPC)anchor.entity） */
export interface EmotePickNpc {
  vanillaId: number;
  /** position.Y / Center.Y（px） */
  y: number; cy: number;
  onFire: boolean;
  poisoned: boolean;
}

/** 世界/世界物语境快照（Game 装配） */
export interface EmotePickContext {
  /** world.flags（downed_* / downedXxx / hardMode 等击杀链键） */
  flags: Record<string, boolean | undefined>;
  dayTime: boolean;
  /** 分段 Main.time（Clock.vanillaMainTime——ProbeCritters 的 <5400/>48600 域） */
  mainTime: number;
  bloodMoon: boolean;
  eclipse: boolean;
  pumpkinMoon: boolean;
  snowMoon: boolean;
  spawnMeteor: boolean;
  /** IsItRaining = cloudAlpha > 0（Main.cs:2659） */
  raining: boolean;
  cloudBGActive: number;
  worldSurface: number;   // tile 单位（w.groundLevel）
  rockLayer: number;      // tile 单位（w.rockLevel）
  maxTilesX: number;
  maxTilesY: number;
  expertMode: boolean;
  /** WorldGen.crimson（true=猩红世界 false=腐化世界） */
  crimson: boolean;
  partyIsUp: boolean;
  /** DD2Event.Ongoing || DownedInvasionAnyDifficulty */
  dd2Active: boolean;
  /** 活跃 NPC 计数（Main.npc 全体,ProbeTownNPCs 用） */
  census: (vanillaNpcId: number) => number;
  anyBossActive: boolean;
  plr: EmotePickPlayer;
}

const clampCount = (n: number): number => (n > 0 ? n : 0);

/** 池构建（:298-350 主体）——测试消费：九 Probe 按概率并集 + ProbeExceptions */
export function buildEmotePool(
  ctx: EmotePickContext,
  rand: () => number,
  self: EmotePickNpc,
  otherId?: number,
): number[] {
  const list: number[] = [];
  if (!ctx.anyBossActive) {
    if (nextInt(rand, 3) === 0) probeTownNPCs(ctx, list, self.vanillaId);
    if (nextInt(rand, 3) === 0) probeEmotions(ctx, rand, list);
    if (nextInt(rand, 3) === 0) probeBiomes(ctx, list);
    if (nextInt(rand, 2) === 0) probeCritters(ctx, rand, list, self);
    if (nextInt(rand, 2) === 0) probeItems(ctx, list);
    if (nextInt(rand, 5) === 0) probeBosses(ctx, rand, list);
    if (nextInt(rand, 2) === 0) probeDebuffs(ctx, rand, list, self);
    if (nextInt(rand, 2) === 0) probeEvents(ctx, rand, list);
    if (nextInt(rand, 2) === 0) probeWeather(ctx, list);
    probeExceptions(ctx, list, self, otherId);
  } else {
    probeCombat(list);
  }
  return list;
}

/** 主入口（EmoteBubble.cs:295-355）。返回表情感 id（池空 → 0） */
export function pickNpcEmote(
  ctx: EmotePickContext,
  rand: () => number,
  self: EmotePickNpc,
  otherId?: number,
): number {
  const list = buildEmotePool(ctx, rand, self, otherId);
  if (list.length > 0) return list[Math.floor(rand() * list.length) % list.length];
  return 0;                                   // :351-354 空池回退（NewBubbleNPC 初值 0）
}

/** Main.rand.Next(max) 整数等价（[0,max)） */
function nextInt(rand: () => number, max: number): number {
  return Math.floor(rand() * max) % max;
}

/** Utils.SelectRandom(rand, ...items) 均匀抽一 */
function selectRandom<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

// ---------------------------------------------------------------------------
// ProbeCombat（:357-366）
// ---------------------------------------------------------------------------
function probeCombat(list: number[]): void {
  list.push(16, 1, 2, 91, 93, 84, 84);
}

// ---------------------------------------------------------------------------
// ProbeWeather（:368-398）
// ---------------------------------------------------------------------------
function probeWeather(ctx: EmotePickContext, list: number[]): void {
  const plr = ctx.plr;
  if (ctx.cloudBGActive > 0) list.push(96);                       // 云量背景（:370）
  if (ctx.raining) {                                              // cloudAlpha>0（:374）
    if (!ctx.dayTime) list.push(5);                               // 雷电（:376-379）
    list.push(4);                                                 // 雨（:380）
    if (plr.zoneSnow) list.push(98);                              // 暴风雪（:381-383）
    // ★原版异纲 quirk：position.Y(px) < worldSurface(tile)/16 —— 几乎恒假（:385）
    if (plr.x < 4000
      || (plr.x > ctx.maxTilesX * 16 - 4000 && plr.y < ctx.worldSurface / 16.0)) {
      list.push(97);                                              // 风暴（:387）
    }
  } else {
    list.push(95);                                                // 晴（:392）
  }
  if (plr.zoneHallow) list.push(6);                               // 彩虹（:394-396）
}

// ---------------------------------------------------------------------------
// ProbeEvents（:400-430）
// ---------------------------------------------------------------------------
function probeEvents(ctx: EmotePickContext, rand: () => number, list: number[]): void {
  if (ctx.partyIsUp && nextInt(rand, 3) === 0) {
    list.push(selectRandom(rand, [127, 128, 129, 126]));          // 派对（:402-405）
  }
  if (ctx.bloodMoon || (!ctx.dayTime && nextInt(rand, 4) === 0)) {
    list.push(18);                                                // 血月（:406-409）
  }
  if (ctx.eclipse || (ctx.flags['hardMode'] && nextInt(rand, 4) === 0)) {
    list.push(19);                                                // 日食（:410-413）
  }
  if ((!ctx.dayTime || ctx.spawnMeteor) && downedBoss2(ctx)) {
    list.push(99);                                                // 流星（:414-417）
  }
  if (ctx.pumpkinMoon
    || ((!!ctx.flags['downed_327'] || !!ctx.flags['downed_325']) && !ctx.dayTime)) {
    list.push(20);                                                // 南瓜月（:418-421）
  }
  if (ctx.snowMoon
    || ((!!ctx.flags['downed_345'] || !!ctx.flags['downed_346'] || !!ctx.flags['downed_344'])
      && !ctx.dayTime)) {
    list.push(21);                                                // 霜月（:422-425）
  }
  if (ctx.dd2Active) list.push(133);                              // 旧日军团（:426-429）
}

/** NPC.downedBoss2（EoW|BoC 双键并集,本仓击杀链 downed_13/downed_266） */
function downedBoss2(ctx: EmotePickContext): boolean {
  return !!ctx.flags['downed_13'] || !!ctx.flags['downed_266'];
}

// ---------------------------------------------------------------------------
// ProbeDebuffs（:432-450）
// ---------------------------------------------------------------------------
function probeDebuffs(ctx: EmotePickContext, rand: () => number, list: number[],
  self: EmotePickNpc): void {
  const plr = ctx.plr;
  // :434 plr.Center.Y>地狱带 || plr.onFire || 锚 NPC.onFire || plr.onFire2
  if (plr.cy > ctx.maxTilesY * 16 - 3200 || plr.onFire || self.onFire || plr.onFire2) {
    list.push(9);                                                 // 燃烧（:434-437）
  }
  if (nextInt(rand, 2) === 0) list.push(11);                      // 诅咒（:438-441）
  // :442 plr.poisoned || 锚 NPC.poisoned || plr.ZoneJungle
  if (plr.poisoned || self.poisoned || plr.zoneJungle) {
    list.push(8);                                                 // 中毒（:442-445）
  }
  if (plr.heldVanillaItemId === 215 || nextInt(rand, 3) === 0) {
    list.push(10);                                                // 沉默（:446-449）
  }
}

// ---------------------------------------------------------------------------
// ProbeItems（:452-464）
// ---------------------------------------------------------------------------
function probeItems(ctx: EmotePickContext, list: number[]): void {
  list.push(7, 73, 74, 75, 78, 90);                               // :454-459
  if (ctx.plr.statLife < ctx.plr.statLifeMax2 / 2) list.push(84); // 半血墓碑（:460-463）
}

// ---------------------------------------------------------------------------
// ProbeTownNPCs（:466-487）——在场 NPC 普查 × FaceEmote 表
// ---------------------------------------------------------------------------
function probeTownNPCs(ctx: EmotePickContext, list: number[], selfType: number): void {
  for (const k of Object.keys(FACE_EMOTE)) {
    const type = +k;
    if (type !== selfType && ctx.census(type) > 0) {
      list.push(FACE_EMOTE[type]);                                // :482-486
    }
  }
}

// ---------------------------------------------------------------------------
// ProbeBiomes（:489-535）
// ---------------------------------------------------------------------------
function probeBiomes(ctx: EmotePickContext, list: number[]): void {
  const plr = ctx.plr;
  const pyTiles = plr.y / 16;                                     // position.Y/16（:491）
  if (pyTiles < ctx.worldSurface * 0.45) {
    list.push(22);                                                // 天空（:493）
  } else if (pyTiles > ctx.rockLayer + Math.floor(ctx.maxTilesY / 2) - 100) {
    list.push(31);                                                // 岩浆层（:497）
  } else if (pyTiles > ctx.rockLayer) {
    list.push(30);                                                // 洞穴（:499）
  } else if (plr.zoneHallow) {
    list.push(27);
  } else if (plr.zoneCorrupt) {
    list.push(26);
  } else if (plr.zoneCrimson) {
    list.push(25);
  } else if (plr.zoneJungle) {
    list.push(24);
  } else if (plr.zoneSnow) {
    list.push(32);
  } else if (pyTiles < ctx.worldSurface
    && (plr.x < 4000 || plr.x > 16 * (ctx.maxTilesX - 250))) {
    list.push(29);                                                // 海滩（:523-526）
  } else if (plr.zoneDesert) {
    list.push(28);
  } else {
    list.push(23);                                                // 其他世界（:533）
  }
}

// ---------------------------------------------------------------------------
// ProbeCritters（:537-592）——权重取锚 NPC 的 Center（anchor.entity.Center,:539）
// ---------------------------------------------------------------------------
function probeCritters(ctx: EmotePickContext, rand: () => number, list: number[],
  self: EmotePickNpc): void {
  // num（地上权重）/num2（地下权重）（:540-549）
  let surfaceW = 1;
  let caveW = 1;
  if (self.cy < ctx.rockLayer * 16.0) caveW = 0.2;
  else surfaceW = 0.2;
  if (rand() <= surfaceW) {                                       // :550
    if (ctx.dayTime) {
      list.push(13, 12, 68, 62, 63, 69, 70);                      // :554-560
    }
    // 61 僵尸：非白天，或白天晨昏带（Main.time<5400=6:00AM 前 / >48600=6:00PM 后）
    if (!ctx.dayTime || (ctx.dayTime && (ctx.mainTime < 5400.0 || ctx.mainTime > 48600.0))) {
      list.push(61);                                              // :562-565
    }
    if (ctx.flags['downedGoblins']) list.push(64);
    if (ctx.flags['downedFrost']) list.push(66);
    if (ctx.flags['downedPirates']) list.push(65);
    if (ctx.flags['downedMartians']) list.push(71);
    if (ctx.crimson) list.push(67);                               // WorldGen.crimson（:582）
  }
  if (rand() <= caveW) {
    list.push(72, 69);                                            // :587-591
  }
}

// ---------------------------------------------------------------------------
// ProbeEmotions（:594-618）
// ---------------------------------------------------------------------------
function probeEmotions(ctx: EmotePickContext, rand: () => number, list: number[]): void {
  list.push(0, 1, 2, 3, 15, 16, 17, 87, 91, 136, 134, 135, 137, 138, 139);  // :596-610
  if (ctx.bloodMoon && !ctx.dayTime) {
    const item = selectRandom(rand, [16, 1, 138]);
    list.push(item, item, item);                                  // 三连份（:613-616）
  }
}

// ---------------------------------------------------------------------------
// ProbeBosses（:620-758）——num = 击杀进度档（1..8），maxValue 滚动解锁窗
// ---------------------------------------------------------------------------
function probeBosses(ctx: EmotePickContext, rand: () => number, list: number[]): void {
  const f = ctx.flags;
  const downedBoss1 = !!f['downed_4'] || !!f['downedEyeOfCthulhu'];
  let num = 0;
  // :623 `(!downedBoss1 && !Main.dayTime) || downedBoss1` —— 未击败且白天才归 0
  if ((!downedBoss1 && !ctx.dayTime) || downedBoss1) num = 1;
  if (downedBoss2(ctx)) num = 2;                                                  // downedBoss2
  if (!!f['downed_222'] || !!f['downed_35'] || !!f['downedSkeletron']) num = 3;   // 蜂王|骷髅王
  if (!!f['hardMode']) num = 4;                                                   // Main.hardMode
  if (!!f['downedMechBossAny'] || !!f['downed_134'] || !!f['downed_125'] || !!f['downed_126']
    || !!f['downed_127']) num = 5;                                                // downedMechBossAny
  if (!!f['downed_262']) num = 6;                                                 // downedPlantBoss
  if (!!f['downed_245']) num = 7;                                                 // downedGolemBoss
  if (!!f['downed_439']) num = 8;                                                 // downedAncientCultist
  let maxValue = 10;
  if (!!f['downed_398']) maxValue = 1;                                            // downedMoonlord

  // :660-672 num1-2 必出（克眼/克脑世界吞噬/骷髅王），或 rand(maxValue)==0 提前滚出
  if ((num >= 1 && num <= 2) || (num >= 1 && nextInt(rand, maxValue) === 0)) {
    list.push(39);
    list.push(ctx.crimson ? 41 : 40);                             // WorldGen.crimson（:663）
    list.push(51);
  }
  if ((num >= 2 && num <= 3) || (num >= 2 && nextInt(rand, maxValue) === 0)) {
    list.push(43, 42);                                            // :673-677
  }
  if ((num >= 4 && num <= 5) || (num >= 4 && nextInt(rand, maxValue) === 0)) {
    list.push(44, 47, 45, 46);                                    // :678-684
  }
  if ((num >= 5 && num <= 6) || (num >= 5 && nextInt(rand, maxValue) === 0)) {
    if (!f['downed_134']) list.push(47);                          // !downedMechBoss1（:687）
    if (!f['downed_125'] && !f['downed_126']) list.push(45);      // !downedMechBoss2（:691）
    if (!f['downed_127']) list.push(46);                          // !downedMechBoss3（:695）
    list.push(48);
  }
  if (num === 6 || (num >= 6 && nextInt(rand, maxValue) === 0)) {
    list.push(48, 49, 50);                                        // :701-706
  }
  if (num === 7 || (num >= 7 && nextInt(rand, maxValue) === 0)) {
    list.push(49, 50, 52);                                        // :707-712
  }
  if (num === 8 || (num >= 8 && nextInt(rand, maxValue) === 0)) {
    list.push(52, 53);                                            // :713-717
  }
  if (ctx.flags['downedPirates'] && ctx.expertMode) list.push(59);            // :718-721
  if (ctx.flags['downedMartians']) list.push(60);                             // :722-725
  if (ctx.flags['downed_345']) list.push(57);                     // downedChristmasIceQueen
  if (ctx.flags['downed_346']) list.push(58);                     // downedChristmasSantank
  if (ctx.flags['downed_344']) list.push(56);                     // downedChristmasTree
  if (ctx.flags['downed_327']) list.push(55);                     // downedHalloweenKing
  if (ctx.flags['downed_325']) list.push(54);                     // downedHalloweenTree
  if (ctx.flags['downed_636']) list.push(143);                    // downedEmpressOfLight
  if (ctx.flags['downed_657']) list.push(144);                    // downedQueenSlime
  if (ctx.flags['downed_668']) list.push(150);                    // downedDeerclops
}

// ---------------------------------------------------------------------------
// ProbeExceptions（:760-1065）——NPC 专属池 + 对话 other 特判
// ---------------------------------------------------------------------------
function probeExceptions(
  ctx: EmotePickContext, list: number[], self: EmotePickNpc, otherId?: number,
): void {
  const t = self.vanillaId;
  const f = ctx.flags;
  const has = (id: number): boolean => list.includes(id);
  const removeOne = (id: number): void => {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
  };
  if (t === 17) {                                                 // 商人（:763-770）
    list.push(80, 85, 85, 85, 85);
  } else if (t === 18) {                                          // 护士（:771-777）
    list.push(73, 73, 84, 75);
  } else if (t === 19) {                                          // 军火商（:778-803）
    // ★原版 if/else-if 两支条件相同（:780-793 反编译死码）——等价一支
    if (otherId != null && otherId === 22) {
      list.push(1, 1, 93, 92);
    } else {
      list.push(82, 82, 85, 85, 77, 93);
    }
  } else if (t === 20) {                                          // 树妖（:804-813）
    if (has(121)) { list.push(121, 121); }
    list.push(14, 14);
  } else if (t === 22) {                                          // 向导（:814-836）
    if (!ctx.bloodMoon) {
      if (otherId != null && otherId === 19) {
        list.push(1, 1, 93, 92);
      } else {
        list.push(79);
      }
    }
    if (!ctx.dayTime) {
      list.push(16, 16, 16);
    }
  } else if (t === 37) {                                          // 老人 OldMan（:837-844）
    list.push(43, 43, 43, 72, 72);
  } else if (t === 38) {                                          // 爆破专家 Demolitionist（:845-864）
    if (ctx.bloodMoon) {
      list.push(77, 77, 77, 81);
    } else {
      list.push(77, 77, 81, 81, 81, 90, 90);
    }
  } else if (t === 54) {                                          // 裁缝 Clothier（:865-881）
    if (ctx.bloodMoon) {
      list.push(43, 72, 1);
    } else {
      if (has(111)) list.push(111);
      list.push(17);
    }
  } else if (t === 107) {                                         // 哥布林工匠 GoblinTinkerer（:882-909）
    if (otherId != null && otherId === 124) {
      removeOne(111);
      list.push(0, 0, 0, 17, 17, 86, 88, 88);
    } else {
      if (has(111)) { list.push(111, 111, 111); }
      list.push(91, 92, 91, 92);
    }
  } else if (t === 108) {                                         // 巫师 Wizard（:910-915）
    list.push(100, 89, 11);
  }
  // ★原版此处是独立 if（非 else-if 链）——124 不在前面链中，行为等价并入
  if (t === 124) {                                                // 机械师 Mechanic（:916-952）
    if (otherId != null && otherId === 107) {
      removeOne(111);
      list.push(0, 0, 0, 17, 17, 88, 88);
      return;                                                     // :928 原版提前 return
    }
    if (has(109)) { list.push(109, 109, 109); }
    if (has(108)) {
      removeOne(108);
      if (ctx.flags['hardMode']) {
        list.push(108, 108);
      } else {
        list.push(106, 106);
      }
    }
    list.push(43, 2);
  } else if (t === 142) {                                         // 圣诞老人 SantaClaus（:953-960）
    list.push(32, 66, 17, 15, 15);
  } else if (t === 160) {                                         // 松露人 Truffle（:961-967）
    list.push(10, 89, 94, 8);
  } else if (t === 178) {                                         // 蒸汽朋克人 Steampunker（:968-972）
    list.push(83, 83);
  } else if (t === 207) {                                         // 染料商 DyeTrader（:973-978）
    list.push(28, 95, 93);
  } else if (t === 208) {                                         // 派对女孩 PartyGirl（:979-985）
    list.push(94, 17, 3, 77);
  } else if (t === 209) {                                         // 机器人 Cyborg（:986-992）
    list.push(48, 83, 5, 5);
  } else if (t === 227) {                                         // 画家 Painter（:993-997）
    list.push(63, 68);
  } else if (t === 228) {                                         // 巫医 WitchDoctor（:998-1004）
    list.push(24, 24, 95, 8);
  } else if (t === 229) {                                         // 海盗 Pirate（:1005-1012）
    list.push(93, 9, 65, 120, 59);
  } else if (t === 353) {                                         // 理发师 Stylist（:1013-1026）
    if (has(104)) { list.push(104, 104); }
    if (has(111)) { list.push(111, 111); }
    list.push(67);
  } else if (t === 368) {                                         // 旅行商人 TravellingMerchant（:1027-1032）
    list.push(85, 7, 79);
  } else if (t === 369) {                                         // 渔夫 Angler（:1033-1048）
    if (!ctx.bloodMoon) {
      list.push(70, 70, 76, 76, 79, 79);
      // ★原版异纲 quirk：position.Y(px) < worldSurface(tile)（:1043）
      if (self.y < ctx.worldSurface) {
        list.push(29);
      }
    }
  } else if (t === 453) {                                         // 骷髅商人 SkeletonMerchant（:1049-1055）
    list.push(72, 69, 87, 3);
  } else if (t === 441) {                                         // 税收官 TaxCollector（:1056-1064）
    list.push(100, 100, 1, 1, 1, 87);
  }
}

// ---------------------------------------------------------------------------
// 计数/玩家快照装配助手（Game 侧注入用）
// ---------------------------------------------------------------------------
export function newCensusCounter(
  activeNpcVanillaIds: readonly number[],
): (vanillaNpcId: number) => number {
  const counts: Record<number, number> = {};
  for (const id of activeNpcVanillaIds) {
    counts[id] = clampCount((counts[id] ?? 0) + 1);
  }
  return (id) => counts[id] ?? 0;
}
