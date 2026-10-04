// 原版 1.4.0.5 全量 NPC 数据（tools/extract-npcs.mjs 从 Terarria1405/NPC.cs SetDefaults 提取）。
// 增量补齐（2026-08-11）：473-476/590/591/594/628/629/631/634/635/692 十三条取自
// Terarria1456/NPC.cs SetDefaults + Main.cs npcFrameCount（★1456/1457 零差异——
// recon-npc 闸门 CLASS B 钉死 SetDefaults/npcFrameCount 双零漂移,树基准 1457）。
// 弹跳球族增量（2026-08-11）：665 ChaosBallTim / 666 VileSpitEaterOfWorlds 两条取自
// Terarria1456/NPC.cs SetDefaults :17338-17367（aiStyle 9，字段对齐 30/112 同族；贴图
// NPC_665/666.png 已在 sprites，此前纯数据缺口）。
// 星璇塔增量（2026-08-11）：403/404（星尘蠕虫身/尾，字段复制 402 改宽高——1456 无独立
// SetDefaults，原版由 DrawNPC case 402 自绘 trail；本仓蠕虫链 spawnWormChain 需要
// 头+1/头+2 条目）、408（小水流入侵者，复制 407 缩小——1456 无独立 SetDefaults）。
// 城镇宠物声音增量（2026-08-18）：637/638/656 补 HitSound/DeathSound（1456
// SetDefaults :17142-17180/:17230-17244，提取器漏——637 猫 Hit1/Death6、
// 638 狗 Hit1/Death1、656 兔 Hit1/Death6；消费端 TownNPC.hurt/checkDead 数据驱动）。
// 血鳗鱼/Palworld 双宠增量（2026-08-20）：622/623（血鳗鱼身/尾，1456 SetDefaults
// :16922-16960——血月夜钓鱼怪 621 的 15 身+1 尾 worm 链段，1405 无此族）、696
// （Foxsparks，:17701-17714）手补；695 HitSound/DeathSound 勘误为 PalCattivaPain
// （:17696-17697，原提取器兜底 NPCHit1）。
// aiStyle 与 AI_XXX 方法的对应见 NPC.cs AI() 分发；此处先覆盖高频家族，
// 未移植 AI 家族的 aiStyle 回退到最接近的已移植行为（注释标注）。
import vanillaNpcsJson from '../../public/sprites/vanilla-npcs.json';
import vanillaDataJson from '../../public/sprites/vanilla.json';
import soundTracksJson from './vanilla-soundtracks.json';
import { ITEM_BY_KEY, ITEM_DEFS } from './items';
import { TILE_DEFS } from './tiles';

/** tile id → key 反查（biomeAt 群系判定用） */
const TILE_KEY_NAME: string[] = TILE_DEFS.map((d) => d.key);

// （旧掉落表已退役：掉落走 src/drops/NpcDrops.ts 规则树——
//  tools/extract-npcdrops.mjs 结构化提取 ItemDropDatabase.cs，含专家/大师/条件/链语义）

/** 原版物品 id → 本仓库 item key（vanilla.json 的 key 是 PascalCase，ITEM_BY_KEY 多为 snake_case；
 *  未注册的返回 null 跳过）。
 *  ★2026-10-04 mod 段回退：vid≥30000 时 ITEM_DEFS[vid].key 直取（internal≡stable≡vid
 *  恒等域,registerModItem 已落表）——配方管线（vanillaItemKey→invIndexOfVanilla）对
 *  mod 物品原样贯通。仅回退 mod_ 键,原版 id 缺 vanilla.json 行为不变（零扰动）。 */
export const vanillaItemKey = (() => {
  const map = new Map<number, string | null>();
  const items = (vanillaDataJson as unknown as { items: Record<string, { key?: string }> }).items ?? {};
  return (itemId: number): string | null => {
    if (map.has(itemId)) return map.get(itemId)!;
    const meta = items[String(itemId)];
    let key: string | null = null;
    if (meta?.key) {
      const snake = meta.key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (ITEM_BY_KEY[snake] != null) key = snake;
      else if (ITEM_BY_KEY[meta.key] != null) key = meta.key;
      // vi_NNN 导入物品（items.ts 的全量原版物品命名）：vi_<id> 或 vi_<id>_<snake>
      else if (ITEM_BY_KEY[`vi_${itemId}`] != null) key = `vi_${itemId}`;
      else if (ITEM_BY_KEY[`vi_${itemId}_${snake}`] != null) key = `vi_${itemId}_${snake}`;
    } else if (itemId >= 30000) {
      const d = ITEM_DEFS[itemId];
      if (d?.key.startsWith('mod_')) key = d.key;
    }
    map.set(itemId, key);
    return key;
  };
})();

export interface VanillaNpc {
  id: number;
  name: string;
  frames: number;
  lifeMax: number;
  damage: number;
  defense: number;
  knockBackResist: number;
  aiStyle: number;
  width: number;
  height: number;
  npcSlots: number;
  noGravity: boolean;
  noTileCollide: boolean;
  friendly: boolean;
  townNPC: boolean;
  hide?: boolean;   // NPC.hide(Main.cs:22172 常规绘制跳过;401 水蛭块=纯拖尾体)
  HitSound: string;   // SoundID 名（NPCHitN / NPCDeathN）
  DeathSound: string | null;   // null=原版显式无声(246 头:血尽转 249,标准死零死音);缺省(无键)=提取漏,fallback 通用档
  scale: number;
  /** SetDefaults alpha：每类型静态不透明度基线（渲染 1-alpha/255，NPC.Opacity；无通用渐隐） */
  alpha?: number;
  /** SetDefaults behindTiles：绘制在 tile 层之下（钻地族被前景方块遮挡，
   *  Main.cs:56457 DrawNPCs(behindTiles:true) 在实心 tile 之前绘制）。
   *  全表 46 id 取自 1456 SetDefaults（7-15/39-41/69/72/95-101/113-115/117-119/
   *  134-136/375/398/510-515/542-545/549/621-623）——飞龙 87/88 同为 aiStyle6 但
   *  非钻地不在表内 */
  behindTiles?: boolean;
  /** SetDefaults color：非 default 时 Main.DrawNPC 二次绘制同贴图（GetColor 逐像素乘法贴轮廓） */
  color?: number[];  // [r, g, b, a]
  critter?: boolean;  // NPCID.Sets.CountsAsCritter 小动物（tools/extract-critters.mjs 提取）
}

export const VANILLA_NPCS = vanillaNpcsJson as unknown as Record<string, VanillaNpc>;

/** SetDefaults 静态 alpha 全表（Terarria1456/Terraria/NPC.cs 逐 if(type) 块解析，
 *  2026-08-20 史莱姆"浊暗"根因补全——alpha 字段在 def 类型里声明过但数据侧零条目，
 *  Enemy.fromVanilla 的 v.alpha 恒 undefined → spawnAlpha 恒 0：史莱姆 175 的
 *  半透明果冻基底丢失=灰底全不透明+39% 色层=浊暗沉；世吞 13-15 等出生渐显链也死）。
 *  alpha=255 族=出生全透明渐显标记（fromVanlla :975 起的特殊族分支接管）。
 *  行号=原版 if(type==N) 块内 alpha 赋值行 */
export const NPC_STATIC_ALPHA: Record<number, number> = {
  1: 175,          // :8514 绿史莱姆（果冻半透明基底）
  13: 255, 14: 255, 15: 255,   // :8853/:8873/:8893 世吞族（AI_006 移动门渐显）
  16: 120,         // :8906
  25: 100,         // :9038
  30: 100,         // :15642
  33: 255,         // :9079
  50: 30,          // :9331 史莱姆王（微透）
  59: 50,          // :9459 岩浆史莱姆
  63: 20, 64: 20,  // :9526/:9540
  71: 60,          // :9640 地牢史莱姆
  72: 100,         // :9655 刺球
  81: 55, 82: 100, // :9780/:9796
  103: 20,         // :10160
  112: 80,         // :10272
  121: 55,         // :10407
  134: 255, 135: 255, 136: 255, // :10610-10650 毁灭者（AI_037 链门淡入）
  138: 100,        // :10690
  141: 55,         // :10718
  147: 50,         // :10789 棘刺史莱姆
  182: 100, 183: 55, 184: 50,  // :11260-11289
  204: 50,         // :11554
  221: 20, 242: 20,// :11784/:12063
  244: 175,        // :12090 彩虹史莱姆（与 1 同款果冻）
  245: 255, 246: 255, // :12107/:12123
  253: 100,        // :15393
  256: 20,         // :12233
  316: 100, 330: 100, // :12935/:13132
  371: 255, 372: 255, 373: 255, // :13664-13692
  454: 255, 459: 255, // :14363/:14381
  523: 255,        // :15741（前值 0 被 255 覆盖——出生态）
  537: 50,         // :15799
  586: 255,        // :16551 僵尸人鱼（fighterAI 出水演出渐显）
  587: 255,        // :16566
  619: 255, 620: 255, // :16882/:16900
  621: 255, 622: 255, 623: 255, // :16919-16958 血鳗鱼（AI_006 链门渐显）
  665: 100, 666: 80,   // :17350/:17367
};

/** GetGemSquirrelToSpawn（NPC.cs:5611-5623）/ GetGemBunnyToSpawn（:5591-5603）：
 *  纯加权随机表（Diamond 5%/Amber 8%/Ruby 10%/Emerald 12%/Sapphire 16%/Topaz 21%/Amethyst 28%）
 *  ——与就近宝石 tile、世界档位完全无关 */
export function getGemSquirrelToSpawn(rand: () => number): number {
  const num = Math.floor(rand() * 100);
  if (num < 5) return 644;
  if (num < 13) return 645;
  if (num < 23) return 643;
  if (num < 35) return 642;
  if (num < 51) return 641;
  if (num < 72) return 640;
  return 639;
}
export function getGemBunnyToSpawn(rand: () => number): number {
  const num = Math.floor(rand() * 100);
  if (num < 5) return 651;
  if (num < 13) return 652;
  if (num < 23) return 650;
  if (num < 35) return 649;
  if (num < 51) return 648;
  if (num < 72) return 647;
  return 646;
}

export function vanillaNpc(id: number): VanillaNpc | null {
  return VANILLA_NPCS[String(id)] ?? null;
}

/** ★Mod NPC 注册面(2026-10-04):id 走 800+ 段(原版 Count=697,成就门 vanillaId<697
 *  即原版域边界——mod id 天然落成就门外)。写注册表对象本体=零改访问器/消费面
 *  （Enemy.fromVanilla→vanillaNpc(id) 全链白嫖原版 AI 派发）。重复/越段 fail-fast。 */
export function registerModNpc(npcId: number, def: VanillaNpc): void {
  if (!(npcId >= 800 && npcId <= 4095)) throw new Error(`[mod-npc] id 越段: ${npcId}`);
  const k = String(npcId);
  if (VANILLA_NPCS[k] !== undefined) throw new Error(`[mod-npc] id 冲突: ${npcId}`);
  VANILLA_NPCS[k] = def;
}

// ================= 城镇 NPC（TownNPC 实体用） =================
// key → 原版 NPCID（Terarria1456/Terraria.ID/NPCID.cs:11099+）；
// extra = NPCID.Sets.ExtraFramesCount（NPCID.cs:4831）——
// 行走帧循环区间的回卷上界：帧 >= frames-extra 时回帧 2（NPC.cs FindFrame L70244）
export const TOWN_NPC_IDS: Record<string, { id: number; extra: number }> = {
  guide: { id: 22, extra: 10 },
  old_man: { id: 37, extra: 2 },   // 守卫老人(地牢门口;夜晚诅咒召唤骷髅王)
  merchant: { id: 17, extra: 9 },
  nurse: { id: 18, extra: 9 },
  arms_dealer: { id: 19, extra: 9 },
  dryad: { id: 20, extra: 7 },
  demolitionist: { id: 38, extra: 9 },
  clothier: { id: 54, extra: 7 },
  goblin_tinkerer: { id: 107, extra: 9 },
  wizard: { id: 108, extra: 7 },
  mechanic: { id: 124, extra: 9 },
  santa_claus: { id: 142, extra: 9 },
  truffle: { id: 160, extra: 7 },
  steampunker: { id: 178, extra: 9 },
  dyer: { id: 207, extra: 9 },
  party_girl: { id: 208, extra: 9 },
  cyborg: { id: 209, extra: 10 },
  painter: { id: 227, extra: 9 },
  witch_doctor: { id: 228, extra: 10 },
  pirate: { id: 229, extra: 10 },
  stylist: { id: 353, extra: 9 },
  tax_collector: { id: 441, extra: 9 },
  golfer: { id: 588, extra: 9 },
  angler: { id: 369, extra: 9 },      // 渔夫（海滩 376 睡渔夫解救后城镇化；ExtraFramesCount 9）
  tavernkeep: { id: 550, extra: 9 },  // 酒保（击败一次旧日军团后入驻；ExtraFramesCount 9）
  town_slime_red: { id: 682, extra: 6 }, // 红色城镇史莱姆（血月钓鱼一次性获得，Player.cs:51591；无对话/商店/入住表）
  town_slime_yellow: { id: 683, extra: 6 }, // 神秘史莱姆（净化粉命中神秘青蛙 687 → Transform :13677-13684；无对话/商店/入住表）
  town_slime_blue: { id: 670, extra: 6 },    // 书呆子史莱姆（蓝；史莱姆王死亡砸出 NPC.cs:80206-80222）
  // 城镇史莱姆家族其余四只（SetDefaults :17529-17543 同族块 townNPC/aiStyle7/housingCategory 1）
  town_slime_cool: { id: 678, extra: 6 },    // 酷酷史莱姆（绿）
  town_slime_clumsy: { id: 680, extra: 6 },  // 笨笨史莱姆（紫；绑缚 686 气球态触碰解救）
  town_slime_diva: { id: 681, extra: 6 },    // 巨星史莱姆（彩虹）
  town_slime_squire: { id: 684, extra: 6 },  // 侍从史莱姆（铜）
  town_slime_old: { id: 679, extra: 6 }, // 老城镇史莱姆（绑缚态 685 BoundTownSlimeOld 经 SpawnAnNPC
                                        //  三人组链刷出，NPC.cs:2002；解救 = TransformElderSlime
                                        //  :19077-19091 → 679 + unlockedSlimeOldSpawn 置位 WF:1410）
  zoologist: { id: 633, extra: 9 },   // BestiaryGirl
  princess: { id: 663, extra: 7 },
  // 城镇宠物三只（NPCID.Sets.IsTownPet 含本三只+全部城镇史莱姆；帧数取自
  // Main.cs:65994 npcFrameCount 权威表：637 猫 28 / 638 狗 28 / 656 兔 27）
  town_cat: { id: 637, extra: 0 },
  town_dog: { id: 638, extra: 0 },
  town_bunny: { id: 656, extra: 0 },
  travelling_merchant: { id: 368, extra: 10 },  // 旅行商人（上午随机到访，黄昏离场）
  skeleton_merchant: { id: 453, extra: 9 },     // 骷髅商（洞穴随机出现，随 timeLeft 消失）
};

const TOWN_EXTRA_BY_ID = new Map(Object.values(TOWN_NPC_IDS).map((t) => [t.id, t.extra]));

/** NPC id → 头像贴图索引（原版 NPC.cs:7489 TypeToDefaultHeadIndex 全表——
 *  head 索引 ≠ NPC id！旗帜头像 NPC_Head_{headIndex}） */
export const TOWN_NPC_HEAD_INDEX: Record<number, number> = {
  17: 2, 18: 3, 19: 6, 20: 5, 22: 1, 38: 4, 54: 7, 107: 9, 108: 10, 124: 8,
  142: 11, 160: 12, 178: 13, 207: 14, 208: 15, 209: 16, 227: 17, 228: 18, 229: 19,
  353: 20, 368: 21, 369: 22, 441: 23, 550: 24, 588: 25, 633: 26, 663: 45,
  637: 27, 638: 33, 656: 39, 670: 46, 678: 47, 679: 48, 680: 49, 681: 50,
  682: 51, 683: 52, 684: 53,
};

/** Boss 头像贴图索引(NPCID.Sets.BossHeadTextures,NPCID.cs:4861;默认 -1 = 无地图头像)。
 *  地图绘制(Main.cs DrawNPCMapIcons3/2)+ 顶部 Boss 血条(BigProgressBar)共用;
 *  NPC_Head_Boss_{idx}.png。GetBossHeadTextureIndex 特判(Plantera 266 隐藏/世吞 4 二段/
 *  石巨人 262 半血换头)未接,取基础表 */
export const BOSS_HEAD_INDEX: Record<number, number> = {
  4: 0, 13: 2, 344: 3, 370: 4, 245: 5, 246: 5, 249: 5, 345: 6, 50: 7, 396: 8, 395: 9,
  325: 10, 262: 11, 327: 13, 222: 14, 125: 15, 126: 20, 346: 17, 127: 18, 35: 19,
  68: 19, 113: 22, 266: 23, 439: 24, 440: 24, 134: 25, 491: 26, 517: 27, 422: 28,
  507: 29, 493: 30, 549: 35, 564: 32, 565: 32, 576: 33, 577: 33, 551: 34, 548: 36,
  636: 37, 657: 38, 668: 39,
};

/** NPC.rarity（tools/recon-npc-rarity-1457.mjs 程序化直读 Terarria1457 SetDefaults
 *  :8454-17890 全段重提,79 条;默认 0=普通）。★红蓝-H① 2026-09-18 定谳：旧表 335 条
 *  自称 "SetDefaults if-chain 提取" 而无生成器痕迹——真值 79 条全对,余 256 条为手维护
 *  捏造（全部城镇 NPC 107/108/124/353/550/588/369/441/678-684/637/656/663/368 与
 *  26 Demon 等普通敌怪 rarity 恒 0,原版即"分析仪不显"）,整表重提清洗。
 *  语义注记：rarity 是【实体型】静态值——原版被缚族=独立非 townNPC 型且全员 rarity>0
 *  （105/106/123/354/376/579/589=1、534 痛苦亡魂/685/686/687=2）,城镇型全员 0;
 *  区间 if 块（595-601 嵌 num2==601 等四嵌套）已按交集归型。源码序后者覆盖先写,
 *  世界态条件帧（remixWorld/zenithWorld 等）之下的赋值不入金标（wild=0 处）。
 *  消费:生命体分析仪行(Main.cs:47777 全表扫描 1300px 内 rarity 择优 :46352-46382) */
export const NPC_RARITY: Record<number, number> = {"44": 1, "45": 4, "52": 2, "53": 2, "66": 1, "71": 1, "73": 1, "85": 4, "105": 1, "106": 1, "109": 1, "123": 1, "172": 4, "195": 2, "196": 2, "205": 2, "216": 1, "217": 1, "218": 1, "219": 1, "220": 2, "221": 1, "243": 2, "244": 1, "251": 2, "287": 1, "290": 2, "291": 1, "292": 1, "293": 1, "354": 1, "374": 4, "375": 4, "376": 1, "399": 1, "442": 3, "443": 3, "444": 3, "445": 3, "446": 3, "447": 3, "448": 3, "453": 1, "471": 1, "473": 5, "474": 5, "475": 5, "476": 5, "477": 1, "480": 1, "534": 2, "536": 2, "539": 3, "541": 2, "579": 1, "583": 2, "584": 2, "585": 2, "586": 1, "587": 1, "589": 1, "592": 3, "593": 3, "601": 3, "605": 3, "613": 3, "618": 1, "620": 1, "621": 1, "624": 1, "627": 3, "629": 4, "661": 4, "667": 2, "685": 2, "686": 2, "687": 2, "695": 1, "696": 1};

/** rarity 查询(未登记=0;供 InfoAccsLayer 稀有生物行) */
export function npcRarityOf(vanillaId: number | null): number {
  if (vanillaId == null) return 0;
  return NPC_RARITY[vanillaId] ?? 0;
}

/** Boss 头像旋转(NPC.GetBossHeadRotation NPC.cs:7636-7650):68/262 → npc.rotation;
 *  35/127 仅 ai[1]∈{1,2}(旋冲/白天狂暴态,悬浮态 tilt 不上头) / 345(冰雪女王)
 *  仅 ai[0]==2(自旋环射态,NPC.cs:33920-33935 rotation+=0.2) 取 rotation;其余 0。
 *  ★BJ68 2026-09-14 接门(RB16 遗留):此前 35/127/345 输入无感恒 0——ai 态由调用侧
 *  传入(渲染层经实体字段直读,见 Renderer.ts drawMapHeads boss 头块)。 */
export function bossHeadRotation(id: number, rotation: number, ai1 = 0, ai0 = 0): number {
  if (id === 68 || id === 262) return rotation;
  if (id === 35 || id === 127) return ai1 === 1 || ai1 === 2 ? rotation : 0;
  if (id === 345) return ai0 === 2 ? rotation : 0;
  return 0;
}

/** ★BJ459（2026-10-03）Boss 头像朝向翻转（NPC.GetBossHeadSpriteEffects
 *  NPC.cs:7661-7669 1:1——全族唯一例:仅 491(飞翔荷兰人) && spriteDirection==1 →
 *  FlipHorizontally,其余恒 SpriteEffects.None）。facing 入参=本仓 spriteDirection
 *  载体:491 的 AI 逐 t 末写 `facing = -sign(vx)`（flyingDutchmanAI
 *  bossAI_dd2.ts:685 ←原版 AI_93 `spriteDirection = -Math.Sign(velocity.X)`
 *  NPC.cs:39340 同构），与本体绘制 drawDutchman 的 `e.facing === 1` 消费同源
 *  （Renderer.ts,头体恒同相）。返回 true=该翻(消费侧 ctx.scale(-1,1))。 */
export function bossHeadSpriteEffects(vanillaId: number | null | undefined, facing: number): boolean {
  return vanillaId === 491 && facing === 1;
}

/** ★BJ459（2026-10-03）Boss 头像悬停命中矩形（小地图 DrawNPCMapIcons2
 *  Main.cs:57043-57058 / 全屏 DrawNPCMapIcons :57121-57127 双路同构 1:1）：
 *  num11..14 = 绘制锚(num9/num10) ± 贴图实尺(Width/Height)×headScale 的一半,
 *  鼠标 ∈ [num11,num13]×[num12,num14] 即命中。旋转(GetBossHeadRotation)与翻转
 *  (SpriteEffects)不参与原版命中形——矩形按未旋转贴图实尺算。mouse=null=不检测
 *  （本仓覆盖式地图路径不喂 mouse,与 BJ1 城镇面两路喂点同构）。 */
export function bossHeadHoverHit(
  mouse: { x: number; y: number } | null, hx: number, hy: number,
  texW: number, texH: number, headScale: number,
): boolean {
  if (!mouse) return false;
  const hw = (texW / 2) * headScale;
  const hh = (texH / 2) * headScale;
  return mouse.x >= hx - hw && mouse.x <= hx + hw && mouse.y >= hy - hh && mouse.y <= hy + hh;
}

/** NPC id → ExtraFramesCount（TOWN_NPC_IDS 反查；未登记的默认 2） */
export function townExtraFrames(id: number): number {
  return TOWN_EXTRA_BY_ID.get(id) ?? 2;
}

/** SoundID 名 → public/sounds 文件名（NPCHit37 → NPC_Hit_37；NPCDeath40 → NPC_Killed_40） */
export function vanillaSoundName(soundIdName: string | undefined): string | null {
  if (!soundIdName) return null;
  const m = soundIdName.match(/^(?:NPCHit|NPCKilled|NPCDeath)(\d+)$/);
  if (!m) return null;
  return soundIdName.startsWith('NPCHit') ? `NPC_Hit_${m[1]}` : `NPC_Killed_${m[1]}`;
}

// ---- 命名轨（SoundID CreateTrackable 族）→ wav 变体列表 ----
// 数据源 src/data/vanilla-soundtracks.json：SoundID.cs 全部 160 条 CreateTrackable
// 声轨（SoundID.cs:817-1153）× public/sounds 实际文件（变体数=声明数，逐条核对过）。
// 消费点：Enemy per-NPC HitSound/DeathSound（DD2_*/Deerclops* 族）、itemUseSound 命名轨。
const SOUND_TRACKS = soundTracksJson as unknown as Record<string, string[]>;

/** 常量名与声轨名不一致的特例（SoundID.cs:971/973 别名 + 非 snake 惯例三件） */
const SOUND_NAME_ALIASES: Record<string, string> = {
  DD2_BetsysWrathShot: 'dd2_betsy_fireball_shot',        // = DD2_BetsyFireballShot.WithVolume(0.4)（:971）
  DD2_BetsysWrathImpact: 'dd2_betsy_fireball_impact',    // = DD2_BetsyFireballImpact.WithVolume(0.4)（:973）
  DeadCellsMushroomSummon: 'deadcells_mushroom_summon',
  DeadCellsBarrelLauncherFire: 'deadcells_barrel_launcher_fire',
  JimsDrone: 'Drone',
  RCCar: 'rccar',
  LeafBlower: '',   // LegacySoundStyle(2,34)=Item_34（:1075），由调用方按 Item 轨处理
};

/** SoundID 常量名 → 声轨名（DeerclopsHit → deerclops_hit；DD2_BetsyHurt → dd2_betsy_hurt） */
export function soundTrackName(soundIdName: string): string | null {
  if (SOUND_NAME_ALIASES.hasOwnProperty(soundIdName)) return SOUND_NAME_ALIASES[soundIdName] || null;
  const track = soundIdName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return SOUND_TRACKS.hasOwnProperty(track) ? track : null;
}

/** SoundID 常量名 → wav 变体列表（多变体整组返回，playSfxFiles 内部随机取一；
 *  单变体/未知名返回单元素数组或 null）。原版 LegacySoundStyle 播放时在变体组内
 *  随机取一（SoundEngine.PlaySound → SoundStyle.PlayVariations），不是恒取 _0 */
export function vanillaSoundFiles(soundIdName: string | null | undefined): string[] | null {
  if (!soundIdName) return null;
  const legacy = vanillaSoundName(soundIdName);
  if (legacy) return [legacy];
  // 已是文件名形（NPC_Hit_1/NPC_Killed_6——json 提取器混入的直接名）
  if (/^NPC_(?:Hit|Killed)_\d+$/.test(soundIdName)) return [soundIdName];
  const track = soundTrackName(soundIdName);
  if (!track) return null;
  const files = SOUND_TRACKS[track];
  return files && files.length ? files : null;
}

/** 声轨名（snake 形，如 'dd2_betsy_wind_attack'）→ 变体组 wav。
 *  AI 侧状态机播音用：playSfxFiles(soundTrackFiles(轨名), vol, x, y) */
export function soundTrackFiles(track: string): string[] {
  const files = SOUND_TRACKS[track];
  return files && files.length ? files : [track];
}

// ================= 生成池（原版生成规则的分期近似，task #13 细化） =================
// 按环境分组：白天地表 / 夜间地表 / 洞穴 / 地狱；肉前常用怪优先
export const VANILLA_SPAWN_POOLS = {
  // 肉前地表白天：蓝/母史莱姆（绿史莱姆走 legacy 50% 路径出）
  daySurface: [1, 16].filter((n) => n > 0),
  // 肉前夜晚地表：僵尸/恶魔眼（噬魂怪只在腐化群系池出）
  nightSurface: [3, 2].filter((n) => n > 0),
  // 肉前洞穴：蝙蝠/骷髅/巨蠕虫/黑暗法师/爬墙蜘蛛——巨蝠93/孢子僵尸254/褴褛法师281 是困难模式，已移除
  underground: [49, 21, 10, 32, 159].filter((n) => n > 0),
  // 地狱：恶魔(62)/巫毒恶魔(66)/火妖(24)；蟹 67 已移到海洋
  hell: [62, 66, 24].filter((n) => n > 0),
  // ---- 群系池（对照原版 SpawnNPC zone 规则的肉前常用怪，AI 家族均已移植） ----
  corruption: [6, 7].filter((n) => n > 0),                                  // 噬魂怪(蜂群5)/吞噬怪(蠕虫6)
  crimson: [173, 223].filter((n) => n > 0),                                // 血蝙蝠(蜂群5)/血腥怪(战士3)
  jungle: [51, 158].filter((n) => n > 0),                                  // 丛林蝙蝠(14)/巨蝠(14)
  snow: [147, 152].filter((n) => n > 0),                                   // 冰史莱姆(1)
  desert: [73, 335].filter((n) => n > 0),                                  // 蚁狮(战士3)/沙史莱姆(1)
  // 水域（仅地表湖泊/海洋；地底水不出怪）：水母/食人鱼/琵琶鱼；海洋追加鲨鱼/蟹
  water: [63, 64, 58, 102, 221].filter((n) => n > 0),
  ocean: [65, 67, 63, 64].filter((n) => n > 0),                            // 鲨鱼(16)/蟹(3)
  // ---- 小动物（CountsAsCritter，白天地表） ----
  critters: [46, 303, 74, 299, 300, 377, 357, 356].filter((n) => n > 0),   // 兔/鸟/松鼠/鼠/蚱蜢/蚯蚓/萤火虫变体
};

/** 探针调试用：非空时 poolFor 恒返回此池（确定性验证生成路径） */
export let debugPoolOverride: number[] | null = null;
export function setDebugPool(pool: number[] | null) { debugPoolOverride = pool; }

/** 按玩家环境取生成池 id 列表。biome：spawn 点地面 tile 判定的群系（Game 传入） */
export function poolFor(groundLevel: number, lavaLine: number, ty: number, isDay: boolean, biome?: string): number[] {
  if (debugPoolOverride) return debugPoolOverride;
  if (ty > lavaLine) return VANILLA_SPAWN_POOLS.hell;
  if (ty > groundLevel + 15) return VANILLA_SPAWN_POOLS.underground;
  if (biome && VANILLA_SPAWN_POOLS[biome as keyof typeof VANILLA_SPAWN_POOLS]) {
    return VANILLA_SPAWN_POOLS[biome as keyof typeof VANILLA_SPAWN_POOLS] as number[];
  }
  return isDay ? VANILLA_SPAWN_POOLS.daySurface : VANILLA_SPAWN_POOLS.nightSurface;
}

/** 按生成点地面 tile 判群系（原版 zone 判定的 tile 采样近似） */
export function biomeAt(st: { type: Uint16Array; idx(x: number, y: number): number; w: number; h: number }, tx: number, ty: number): string | null {
  // 从 ty 向下找第一个实心格
  for (let y = Math.max(2, ty); y < Math.min(st.h - 2, ty + 60); y++) {
    const t = st.type[st.idx(tx, y)];
    if (t === 0) continue;
    const key = TILE_KEY_NAME[t];
    if (!key) return null;
    if (key.includes('corrupt') || key === 'ebonstone_block' || key.includes('ebonsand')) return 'corruption';
    if (key.includes('crimson') || key.includes('crimsand') || key === 'crimstone') return 'crimson';
    if (key === 'mud') return 'jungle';
    if (key === 'ice' || key === 'snow') return 'snow';
    if (key === 'sand' || key === 'sandstone' || key === 'hardened_sand') return 'desert';
    return null;
  }
  return null;
}
