// 小动物笼族 tile 渲染 + 动画 1:1（1.4.5.6 反编译 = Terarria1456）：
//   - TileID.Sets.CritterCageLidStyle（TileID.cs:199）：tile → CageTop_{n} 顶盖样式，
//     -1 = 非笼族/无顶盖。0-2 = 6×3 大笼（帧带 54px），3-4 = 3×2 小笼（36px）；
//     鱼缸/妖精罐/蜻蜓罐/水母罐/蝴蝶罐族无顶盖（走 GetWaterAnimalCageFrame /
//     GetSmallAnimalCageFrame 槽位，TileDrawing.cs:5925-6001）
//   - GetTileDrawData（TileDrawing.cs:5730-6001）：笼族 tileTop 恒 2；addFrY =
//     动画帧 × 帧带高（54/36），710 河豚笼另有 addFrX 横带（帧/33 × 108，
//     TileDrawing.cs:5840-5843；素材 324×1782 = 3 列 × 33 行实测吻合）
//   - 槽位哈希（TileDrawing.cs:6636-6653）：big = 物体锚 (x-fx/18)/6 × (y-fy/18)/4、
//     small = /3 × /3、water = /2 × /3，全部 mod Main.cageFrames(=25, Main.cs:1499)
//     ——同槽笼子共用一套帧态机（Main.*CageFrame[25] 数组）
//   - DrawSingleTile 顶盖段（TileDrawing.cs:1670-1716）：当前帧行的首行格
//     （(frameY+addFrY) % 帧带高 == 0）= 本体下移 8px（源裁去顶 8px）+ CageTop
//     顶盖画在 tileTop-2 处（源 16×10，style0 时 X 取 %108 剥河豚横带）；非首行整格画
// ★ 逐族状态机（AnimateTiles_CritterCages Main.cs:13452-16536 + UpdateOwlCageFrame
//   :16557-16611 + UpdateDragonflyJarFrame :16612-16666）1:1 见 CAGE_ANIM 表。
//   原版为每族独立 {frame, counter, mode} 三元组逐 tick 演进 + 全局 rand；本仓以
//   (族,样式,槽位) 种子化的确定性 RNG 复刻同一状态机（联机/测试可重放），转移结构
//   （段帧域/持帧时长/概率分支/回卷）与原版逐行对应。
// GAP 登记：
//   ① 放置链（已闭环）：原版无"捕获"机制——笼=普通家具放置（Player.cs
//      PlaceThing_Tiles → TileObject.CanPlace/Place），物种身份 = tile type 本身
//      （每物种独立 tile id），placeStyle 恒 0，frameX/frameY 只存物体列/行偏移
//      （TileObjectData.cs:2690-2710 Style6x3/Style3x2 + :3658-3710 Style2x2 罐缸族），
//      动画纯渲染侧。笼/缸物品 tile: 链接 92 条全量已接（items.ts CAGE_ITEM_SHEET
//      表，Item.cs createTile 赋值段提取 + TEdit items.json createTile 列 92/92
//      交叉吻合；itemfunc 只覆盖 5 条直赋），放置走 tryPlace vanilla-style 通用
//      分支（单格帧合成 = world/FurnitureStyle.ts framedCellFrame）。
//      ★注意：坊间"空笼右键野生小动物入笼"机制不存在于原版——笼由捕获小动物
//      物品 + 玻璃水族箱合成（Recipe 链），放置前物种身份已在物品侧确定。
//   ② Main.squirrelCageFrameOrange（Main.cs:13692-13825）有独立状态机但
//      TileDrawing 全部 10 张松鼠笼（276/413/414/606-612）只读 squirrelCageFrame
//      （TileDrawing.cs:5793-5803）——Orange 机无消费方，不实装。
//   ③ tile 724 CritterAnchor（1.4.4+ 捕获小动物锚桩）：放置链 + 拴绳本体均已实装——
//      原版 = DefaultToCapturedCritter（Item.cs:47613-47626，93 件 createTile=724 +
//      makeNPC）右键放置（ItemID.Sets.PlaceTileOnAltUse ItemID.cs:155；左键 = 放生
//      ItemCheck_ReleaseCritter Player.cs:43377）→ TECritterAnchor（TileEntity）存
//      物品 id → LeashedEntity 系统在锚桩周遭生成拴绳小动物（Main.cs:17895
//      UpdateEntities / :22163 DrawEntities；LeashedCritter + 20 个 *LeashedCritter
//      AI 类，anchorStyle 0-4 = 放置帧档）。本仓等价：93 件物品 → tile 724 +
//      placeStyle=anchorStyle（items.ts CRITTER_ANCHOR_* 表）；TE 存储以
//      world/FurnitureItems.ts 'critter_anchor' 单槽记录近似（随世界存档持久化），
//      放置/破坏链见 Game.ts tryPlace/breakTile 专用分支；拴绳小动物本体（19 原型
//      注册表 + walker/flyer/jumper 三引擎 + 拈绳风筝族）= entities/LeashedCritter.ts。
//      残余 GAP（KiteLogic/DrawKite 近似、DrawBubble、逐型 FindFrame）登记在该文件尾。
import { tileAnim } from './TileAnim';

/** Main.cageFrames（Main.cs:1499）：每族 25 个独立槽位帧态 */
export const CAGE_FRAMES = 25;

export type CageSlotKind = 'big' | 'small' | 'water';

export interface CageFamily {
  /** CAGE_ANIM 状态机键（= Main.{family}CageFrame 数组名） */
  family: string;
  /** 槽位 RNG 种子（跨会话稳定，勿改动已分配值） */
  idx: number;
  /** 多维族的样式档（= Main.xxxFrame[style, slot] 首维；单维族恒 0） */
  style: number;
  /** 帧带高：54 = 6×3 大笼 / 36 = 3×2 小笼与罐缸族（TileDrawing addFrY 步长） */
  step: 54 | 36;
  /** 槽位哈希族（TileDrawing.cs:6636-6653） */
  slot: CageSlotKind;
  /** TileID.Sets.CritterCageLidStyle（-1 = 无顶盖） */
  lid: number;
  /** 重烘焙节奏：本族相邻帧变化的最小 tick 间隔（ChunkCache.advanceAnim 用） */
  rate: number;
  /** 横带分帧（710 河豚：addFrX = floor(frame/33)*108，行 = frame%33，TileDrawing:5840） */
  xband?: { rows: number; stride: number };
  /** 派生槽位族（妖精罐：槽 1..24 由槽 0 帧级联导出，Main.cs:16147-16167） */
  derive?: boolean;
}

/** GetTileDrawData 笼族帧带映射（TileDrawing.cs:5730-6001）——sheet → 动画族。
 *  大笼 :5765-5843（big 槽 54px）、小笼 :5873-5924（small 槽 36px）、
 *  罐缸族 :5925-6001（water 槽 36px；水母走 small 槽 :5990-6000） */
export const CAGE_FAMILY: Record<number, CageFamily> = {
  // ---- bunny（:5777；358/359 金兔 + 599-605 gem bunny 族共用 bunnyCageFrame）----
  275: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  359: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 1, rate: 5 },
  599: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  600: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  601: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  602: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  603: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  604: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  605: { family: 'bunny', idx: 0, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  // ---- turtle（:5771）----
  550: { family: 'turtle', idx: 1, style: 0, step: 54, slot: 'big', lid: 0, rate: 8 },
  551: { family: 'turtle', idx: 1, style: 0, step: 54, slot: 'big', lid: 0, rate: 8 },
  // ---- owl（:5774；UpdateOwlCageFrame 计数器派生帧）----
  542: { family: 'owl', idx: 2, style: 0, step: 54, slot: 'big', lid: 0, rate: 10 },
  // ---- squirrel（:5793-5803：276/413/414/606-612 十张全读 squirrelCageFrame）----
  276: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  413: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  414: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 1, rate: 5 },
  606: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  607: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  608: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  609: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  610: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  611: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  612: { family: 'squirrel', idx: 3, style: 0, step: 54, slot: 'big', lid: 2, rate: 5 },
  // ---- mallard（:5806）/ duck（:5809）：同构状态机（:13826/:13954）----
  277: { family: 'mallard', idx: 4, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  278: { family: 'duck', idx: 5, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  // ---- grebe（:5812）/ seagull（:5815）----
  553: { family: 'grebe', idx: 6, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  554: { family: 'seagull', idx: 7, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  // ---- bird 族（:5819-5831：bird/blueBird/redBird 三机同构，:14312/:14448/:14584）----
  279: { family: 'bird', idx: 8, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  358: { family: 'bird', idx: 8, style: 0, step: 54, slot: 'big', lid: 1, rate: 5 },
  280: { family: 'blueBird', idx: 9, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  281: { family: 'redBird', idx: 10, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  // ---- macaw（:5835：632/640/643-645 五色鹦鹉）----
  632: { family: 'macaw', idx: 11, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  640: { family: 'macaw', idx: 11, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  643: { family: 'macaw', idx: 11, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  644: { family: 'macaw', idx: 11, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  645: { family: 'macaw', idx: 11, style: 0, step: 54, slot: 'big', lid: 0, rate: 6 },
  // ---- scorpion（:5839：296/297 都读 [0,slot]）/ penguin（:5846）/ seahorse（:5849）/
  //      pufferfish（:5852-5857 唯一 addFrX 横带族）----
  296: { family: 'scorpion', idx: 12, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  297: { family: 'scorpion', idx: 12, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  309: { family: 'penguin', idx: 13, style: 0, step: 54, slot: 'big', lid: 0, rate: 5 },
  558: { family: 'seahorse', idx: 14, style: 0, step: 54, slot: 'big', lid: 1, rate: 6 },
  559: { family: 'seahorse', idx: 14, style: 0, step: 54, slot: 'big', lid: 1, rate: 6 },
  710: {
    family: 'pufferfish', idx: 15, style: 0, step: 54, slot: 'big', lid: 0, rate: 7,
    xband: { rows: 33, stride: 108 },
  },
  // ---- 小笼（36px，:5873-5924 small 槽）----
  285: { family: 'snail', idx: 16, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },       // :5878
  286: { family: 'snail2', idx: 17, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },      // :5882（582 共用）
  582: { family: 'snail2', idx: 17, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },
  298: { family: 'frog', idx: 18, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },        // :5886（361 共用）
  361: { family: 'frog', idx: 18, style: 0, step: 36, slot: 'small', lid: 4, rate: 5 },
  339: { family: 'grasshopper', idx: 19, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 }, // :5890（362 共用）
  362: { family: 'grasshopper', idx: 19, style: 0, step: 36, slot: 'small', lid: 4, rate: 5 },
  299: { family: 'mouse', idx: 20, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },        // :5894（363 共用）
  363: { family: 'mouse', idx: 20, style: 0, step: 36, slot: 'small', lid: 4, rate: 5 },
  310: { family: 'worm', idx: 21, style: 0, step: 36, slot: 'small', lid: 3, rate: 30 },       // :5900 族
  364: { family: 'worm', idx: 21, style: 0, step: 36, slot: 'small', lid: 4, rate: 30 },
  391: { family: 'worm', idx: 21, style: 0, step: 36, slot: 'small', lid: 3, rate: 30 },
  619: { family: 'worm', idx: 21, style: 0, step: 36, slot: 'small', lid: 3, rate: 30 },
  392: { family: 'slug', idx: 22, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },         // :5905 [type-392] 帧数 24
  393: { family: 'slug', idx: 22, style: 1, step: 36, slot: 'small', lid: 3, rate: 5 },         // 帧数 31
  394: { family: 'slug', idx: 22, style: 2, step: 36, slot: 'small', lid: 3, rate: 5 },         // 帧数 34
  532: { family: 'maggot', idx: 23, style: 0, step: 36, slot: 'small', lid: 3, rate: 8 },       // :5908
  533: { family: 'rat', idx: 24, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },          // :5911
  538: { family: 'ladybug', idx: 25, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },      // :5916 族
  544: { family: 'ladybug', idx: 25, style: 0, step: 36, slot: 'small', lid: 4, rate: 5 },
  629: { family: 'ladybug', idx: 25, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 },
  555: { family: 'waterStrider', idx: 26, style: 0, step: 36, slot: 'small', lid: 3, rate: 5 }, // :5920 族
  556: { family: 'waterStrider', idx: 26, style: 0, step: 36, slot: 'small', lid: 4, rate: 5 },
  // ---- 蝴蝶罐（:5949-5961：butterflyCageFrame[9,slot] × 36，water 槽；无顶盖；
  //      样式档 = type-288，360/580/620 强制 8，Main.cs:1549 [9,cageFrames]）----
  288: { family: 'butterfly', idx: 27, style: 0, step: 36, slot: 'water', lid: -1, rate: 3 },
  289: { family: 'butterfly', idx: 27, style: 1, step: 36, slot: 'water', lid: -1, rate: 3 },
  290: { family: 'butterfly', idx: 27, style: 2, step: 36, slot: 'water', lid: -1, rate: 3 },
  291: { family: 'butterfly', idx: 27, style: 3, step: 36, slot: 'water', lid: -1, rate: 3 },
  292: { family: 'butterfly', idx: 27, style: 4, step: 36, slot: 'water', lid: -1, rate: 3 },
  293: { family: 'butterfly', idx: 27, style: 5, step: 36, slot: 'water', lid: -1, rate: 3 },
  294: { family: 'butterfly', idx: 27, style: 6, step: 36, slot: 'water', lid: -1, rate: 3 },
  295: { family: 'butterfly', idx: 27, style: 7, step: 36, slot: 'water', lid: -1, rate: 3 },
  360: { family: 'butterfly', idx: 27, style: 8, step: 36, slot: 'water', lid: -1, rate: 3 },
  580: { family: 'butterfly', idx: 27, style: 8, step: 36, slot: 'water', lid: -1, rate: 3 },
  620: { family: 'butterfly', idx: 27, style: 8, step: 36, slot: 'water', lid: -1, rate: 3 },
  // ---- 鱼缸（:5925-5935：fishBowlFrame[slot] × 36；282/505/543 共用）----
  282: { family: 'fishBowl', idx: 28, style: 0, step: 36, slot: 'water', lid: -1, rate: 5 },
  505: { family: 'fishBowl', idx: 28, style: 0, step: 36, slot: 'water', lid: -1, rate: 5 },
  543: { family: 'fishBowl', idx: 28, style: 0, step: 36, slot: 'water', lid: -1, rate: 5 },
  // ---- 熔岩鱼缸（:5936-5944）----
  598: { family: 'lavaFishBowl', idx: 29, style: 0, step: 36, slot: 'water', lid: -1, rate: 5 },
  // ---- 妖精罐（:5945-5953：fairyJarFrame[25]；槽 1..24 由槽 0 级联派生）----
  568: { family: 'fairyJar', idx: 30, style: 0, step: 36, slot: 'water', lid: -1, rate: 6, derive: true },
  569: { family: 'fairyJar', idx: 30, style: 0, step: 36, slot: 'water', lid: -1, rate: 6, derive: true },
  570: { family: 'fairyJar', idx: 30, style: 0, step: 36, slot: 'water', lid: -1, rate: 6, derive: true },
  // ---- 蜻蜓罐（:5976-5989：dragonflyJarFrame[type-521,slot]，7 样式，Main.cs:1555）----
  521: { family: 'dragonfly', idx: 31, style: 0, step: 36, slot: 'water', lid: -1, rate: 4 },
  522: { family: 'dragonfly', idx: 31, style: 1, step: 36, slot: 'water', lid: -1, rate: 4 },
  523: { family: 'dragonfly', idx: 31, style: 2, step: 36, slot: 'water', lid: -1, rate: 4 },
  524: { family: 'dragonfly', idx: 31, style: 3, step: 36, slot: 'water', lid: -1, rate: 4 },
  525: { family: 'dragonfly', idx: 31, style: 4, step: 36, slot: 'water', lid: -1, rate: 4 },
  526: { family: 'dragonfly', idx: 31, style: 5, step: 36, slot: 'water', lid: -1, rate: 4 },
  527: { family: 'dragonfly', idx: 31, style: 6, step: 36, slot: 'water', lid: -1, rate: 4 },
  // ---- 水母罐（:5990-6000：jellyfishCageFrame[type-316,slot]，★small 槽非 water）----
  316: { family: 'jellyfish', idx: 32, style: 0, step: 36, slot: 'small', lid: -1, rate: 4 },
  317: { family: 'jellyfish', idx: 32, style: 1, step: 36, slot: 'small', lid: -1, rate: 4 },
  318: { family: 'jellyfish', idx: 32, style: 2, step: 36, slot: 'small', lid: -1, rate: 4 },
};

/** 是否笼族 sheet（CAGE_FAMILY 在库即笼族） */
export function cageFamilyOf(sheet: number): CageFamily | null {
  return CAGE_FAMILY[sheet] ?? null;
}

/** 顶盖样式（TileID.cs:199；非笼族 -1） */
export function cageLidStyle(sheet: number): number {
  return CAGE_FAMILY[sheet]?.lid ?? -1;
}

/** 槽位哈希（TileDrawing.cs:6636-6653 1:1；x/y = 本格坐标，fx/fy = tile 帧偏移）。
 *  物体锚 = (x - fx/18, y - fy/18)；big 除 6×4、small 除 3×3、water 除 2×3，
 *  积 mod cageFrames(25)。JS 负数取模已归正（锚不可能为负，防御性） */
export function cageSlot(kind: CageSlotKind, x: number, y: number, fx: number, fy: number): number {
  const ox = x - Math.floor(fx / 18);
  const oy = y - Math.floor(fy / 18);
  const [dx, dy] = kind === 'big' ? [6, 4] : kind === 'small' ? [3, 3] : [2, 3];
  return (((Math.floor(ox / dx) * Math.floor(oy / dy)) % CAGE_FRAMES) + CAGE_FRAMES) % CAGE_FRAMES;
}

// ============================================================================
// 逐族状态机（AnimateTiles_CritterCages，Main.cs:13452-16536）
// ============================================================================

/** 槽位帧态（= 原版 Main.{f}CageFrame / {f}CageFrameCounter / {f}CageMode 三数组） */
export interface CageState { f: number; c: number; m: number }

/** 确定性 RNG（rand.Next 语义；种子 = (族,样式,槽位)，序列可重放） */
export interface CageRng { next: (a: number, b?: number) => number }

/** 一族状态机：推进一个 tick（对应原版 for 循环体内的一次分支求值）；
 *  style = 多维族的首维档（slug 392/393/394 帧数 24/31/34 用） */
export type CageMachine = (s: CageState, r: CageRng, style?: number) => void;

/** 确定性 32 位哈希（槽位种子化用；非密码学，只求均匀） */
function hash32(a: number, b: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 逐族状态机表。每条 = Main.AnimateTiles_CritterCages 对应族 for 循环体的直译，
 * 注释标注原版行号 + 段结构（帧域 / 持帧时长 / 概率分支 / 回卷）。
 * ★ rand.Next(a,b) 每 tick 重掷（如 `counter <= rand.Next(30,900) continue`）——
 *   空闲时长是逐 tick 竞速的首达时（多在 ~100t 内触发），非均匀采样，勿"优化"成定长。
 */
export const CAGE_ANIM: Record<string, CageMachine> = {
  /** 兔（:13457-13512）：双空闲帧 0/11；0 → {嗅探 2-3(10t) | 耳动 4-10(5t) | 独帧 1(10t)}；
   *  11 → {12(10t) | 13-21(5t)→回 0}；分支权重 rand(7)：0→4 / 1-2→2 / 3-6→1 */
  bunny(s, r) {
    if (s.f === 0) {
      s.c++;
      if (s.c <= r.next(30, 900)) return;
      if (r.next(3) !== 0) {
        const n = r.next(7);
        s.f = n === 0 ? 4 : n <= 2 ? 2 : 1;
      }
      s.c = 0;
    } else if (s.f === 1) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 0; }
    } else if (s.f >= 2 && s.f <= 3) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; }
      if (s.f > 3) s.f = 0;
    } else if (s.f >= 4 && s.f <= 10) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
    } else if (s.f === 11) {
      s.c++;
      if (s.c <= r.next(30, 900)) return;
      if (r.next(3) !== 0) s.f = r.next(7) === 0 ? 13 : 12;
      s.c = 0;
    } else if (s.f === 12) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 11; }
    } else if (s.f >= 13) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 21) s.f = 0;
    }
  },

  /** 松鼠（:13558-13655）：双空闲帧 0/9；嗅探 2-3 可循环（回卷 4/5 概率回 2）；
   *  尾动 11-12 回卷 4/5 回 11；跳跃 13-17(5t)→0 */
  squirrel(s, r) {
    if (s.f === 0) {
      s.c++;
      if (s.c <= r.next(30, 900)) return;
      if (r.next(3) !== 0) {
        const n = r.next(7);
        s.f = n === 0 ? 4 : n <= 2 ? 2 : 1;
      }
      s.c = 0;
    } else if (s.f === 1) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 0; }
    } else if (s.f >= 2 && s.f <= 3) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 3) s.f = r.next(5) === 0 ? 0 : 2;
    } else if (s.f >= 4 && s.f <= 8) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
    } else if (s.f === 9) {
      s.c++;
      if (s.c <= r.next(30, 900)) return;
      if (r.next(3) !== 0) {
        const n = r.next(7);
        s.f = n === 0 ? 13 : n <= 2 ? 11 : 10;
      }
      s.c = 0;
    } else if (s.f === 10) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 9; }
    } else if (s.f === 11 || s.f === 12) {
      s.c++;
      if (s.c < 5) return;
      s.f++;
      if (s.f > 12) s.f = r.next(5) !== 0 ? 11 : 9;
      s.c = 0;
    } else if (s.f >= 13) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 17) s.f = 0;
    }
  },

  /** 绿头鸭（:13826-13953）与 鸭（:13954-14081）同构：四空闲帧 0/4/12/16；
   *  0↔4 互切门 rand(3)!=0 / rand(5)==0；理毛 1-3 与 13-15 各自循环；振翅 5-11/17-23 直通 */
  mallard(s, r) { mallardDuck(s, r); },
  duck(s, r) { mallardDuck(s, r); },

  /** 蹲鸊鷉（:14082-14151）：连续 ++ 主链 + 三组循环段（22-24 / 25-27）与
   *  空闲门（0/7 各 rand(3)==0 出招：22|14 / 25|18） */
  grebe(s, r) {
    s.c++;
    const idle = s.f === 0 || s.f === 7;
    const hold = s.f === 16 || s.f === 20;
    let n = 5;
    if (idle) n = r.next(300, 400);
    if (hold) n = r.next(480, 600);
    if (s.c < n) return;
    s.c = 0;
    if (s.f >= 25 && s.f <= 27) {
      s.f++;
      if (s.f > 27) s.f = r.next(5) === 0 ? 7 : 25;
    } else if (s.f >= 22 && s.f <= 24) {
      s.f++;
      if (s.f > 24) s.f = r.next(5) === 0 ? 0 : 22;
    } else if (s.f === 0 && r.next(3) === 0) {
      s.f = r.next(2) === 0 ? 22 : 14;
    } else if (s.f === 7 && r.next(3) === 0) {
      s.f = r.next(2) === 0 ? 25 : 18;
    } else if (s.f === 13 || s.f === 17) {
      s.f = 0;
    } else if (s.f === 21) {
      s.f = 7;
    } else {
      s.f++;
    }
  },

  /** 海鸥（:14152-14311）：等待期两段 %66/%78 摆头舞（15-18 / 9-13 帧随 counter 相位
   *  锯齿往返）；出招门 0→9（rand(3)）、14→15|19（rand(2)）、9→0、8/15→14 */
  seagull(s, r) {
    s.c++;
    const idle = s.f === 0 || s.f === 14;
    const dance = s.f >= 15 && s.f <= 18;
    const hunt = s.f >= 9 && s.f <= 13;
    let n = 6;
    if (idle) n = r.next(180, 250);
    if (dance) n = 66;
    if (hunt) n = 78;
    if (s.c >= n) {
      s.c = 0;
      if (s.f === 0 && r.next(3) === 0) { s.f = 9; return; }
      if (s.f === 14) { s.f = r.next(2) === 0 ? 15 : 19; return; }
      if (s.f === 9) { s.f = 0; return; }
      if (s.f === 8 || s.f === 15) { s.f = 14; return; }
      s.f++;
      if (s.f > 26) s.f = 0;
    } else if (dance) {
      const p = s.c % 66;
      s.f = p > 60 ? 15 : p > 54 ? 16 : p > 48 ? 17 : p > 42 ? 18 : p > 36 ? 17
        : p > 30 ? 16 : p > 24 ? 17 : p > 18 ? 18 : p > 12 ? 17 : p > 6 ? 16 : 15;
    } else if (hunt) {
      const p = s.c % 78;
      s.f = p > 72 ? 9 : p > 66 ? 10 : p > 60 ? 11 : p > 54 ? 12 : p > 48 ? 13
        : p > 42 ? 12 : p > 36 ? 11 : p > 30 ? 12 : p > 24 ? 13 : p > 18 ? 12
        : p > 12 ? 11 : p > 6 ? 10 : 9;
    }
  },

  /** 鸟族（bird :14312 / blueBird :14448 / redBird :14584 三机同构）：
   *  空闲 0 → 蹦跳 2-5（帧 3 有 1/3 折跃 13）/ 静帧 1（长待 rand(900,18000)）；
   *  二段空闲 6 → 7-10（回 0）/ 11-13；14 → {16-18 → 0 | 4 | 15(10t)↔14} */
  bird(s, r) { birdFamily(s, r); },
  blueBird(s, r) { birdFamily(s, r); },
  redBird(s, r) { birdFamily(s, r); },

  /** 鹦鹉（:14720-14818）：空闲 0/6（rand(300,2700)）；理羽 1-5(6t)→6；
   *  摇摆 16-19(7t) 回卷 rand(3)!=0 回 16；7-10(7t) 回卷 rand(3)==0 回 6；11-15(6t)→0 */
  macaw(s, r) {
    if (s.f === 0) {
      s.c++;
      if (s.c <= r.next(300, 2700)) return;
      if (r.next(3) !== 0) s.f = r.next(3) !== 0 ? 16 : 1;
      s.c = 0;
    } else if (s.f >= 1 && s.f <= 5) {
      s.c++;
      if (s.c > 5) { s.c = 0; s.f++; if (s.f > 5) s.f = 6; }
    } else if (s.f >= 16 && s.f <= 19) {
      s.c++;
      if (s.c > 6) {
        s.c = 0; s.f++;
        if (s.f > 19) s.f = r.next(3) !== 0 ? 16 : 0;
      }
    } else if (s.f === 6) {
      s.c++;
      if (s.c <= r.next(300, 2700)) return;
      if (r.next(3) !== 0) s.f = r.next(3) !== 0 ? 7 : 11;
      s.c = 0;
    } else if (s.f >= 11 && s.f <= 15) {
      s.c++;
      if (s.c > 5) { s.c = 0; s.f++; if (s.f > 15) s.f = 0; }
    } else if (s.f >= 7 && s.f <= 10) {
      s.c++;
      if (s.c > 6) {
        s.c = 0; s.f++;
        if (s.f > 10) s.f = r.next(3) === 0 ? 6 : 7;
      }
    }
  },

  /** 蝎子（:14819-14978，[2,25] 但 TileDrawing 只读 [0,slot]）：
   *  空闲 0/7（rand(30,3600)）出招链 rand(7)/rand(4)/rand(3) → 1/8/7/14；
   *  摆尾 14-15(5t) 循环 + rand(5) 出逃 0；16-17(5t) 循环 + rand(5) 出逃 4 */
  scorpion(s, r) {
    if (s.f === 0 || s.f === 7) {
      s.c++;
      if (s.c <= r.next(30, 3600)) return;
      if (s.f === 7) s.f = 0;
      else if (r.next(3) === 0) {
        if (r.next(7) === 0) s.f = 1;
        else if (r.next(4) === 0) s.f = 8;
        else if (r.next(3) === 0) s.f = 7;
        else s.f = 14;
      }
      s.c = 0;
    } else if (s.f >= 1 && s.f <= 2) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; }
    } else if (s.f >= 8 && s.f <= 10) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; }
    } else if (s.f === 11) {
      s.c++;
      if (s.c > r.next(45, 5400)) {
        if (r.next(6) === 0) s.f = 12;
        s.c = 0;
      }
    } else if (s.f >= 12 && s.f <= 13) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; if (s.f > 13) s.f = 0; }
    } else if (s.f >= 14 && s.f <= 15) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 15) s.f = 14;
        if (r.next(5) === 0) s.f = 0;
      }
    } else if (s.f === 3 || s.f === 4) {
      s.c++;
      if (s.c <= r.next(30, 3600)) return;
      if (s.f === 3) s.f = 4;
      else if (r.next(3) === 0) {
        if (r.next(5) === 0) s.f = 5;
        else if (r.next(3) === 0) s.f = 3;
        else s.f = 16;
      }
      s.c = 0;
    } else if (s.f >= 5 && s.f <= 6) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; if (s.f > 7) s.f = 0; }
    } else if (s.f >= 16 && s.f <= 17) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 17) s.f = 16;
        if (r.next(5) === 0) s.f = 4;
      }
    }
  },

  /** 企鹅（:14979-15143）：镜像双链——空闲 0（rand(30,1800)，rand(2) 门）出
   *  {4-6 | 15 | 2-3 | 1}；二段空闲 8（rand(30,3600)）出 {12-14 | 7 | 10-11 | 9}；
   *  静帧 15/7 rand(2) 互回；2-3/10-11(5t) 循环段回卷 rand(3) 出逃 */
  penguin(s, r) {
    if (s.f === 0) {
      s.c++;
      if (s.c <= r.next(30, 1800)) return;
      if (r.next(2) === 0) {
        if (r.next(10) === 0) s.f = 4;
        else if (r.next(7) === 0) s.f = 15;
        else if (r.next(3) === 0) s.f = 2;
        else s.f = 1;
      }
      s.c = 0;
    } else if (s.f === 1) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 0; }
    } else if (s.f >= 2 && s.f <= 3) {
      s.c++;
      if (s.c < 5) return;
      s.c = 0; s.f++;
      if (s.f > 3) s.f = r.next(3) === 0 ? 0 : 2;
    } else if (s.f >= 4 && s.f <= 6) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; }
    } else if (s.f === 15) {
      s.c++;
      if (s.c > r.next(10, 1800)) {
        if (r.next(2) === 0) s.f = 0;
        s.c = 0;
      }
    } else if (s.f === 8) {
      s.c++;
      if (s.c <= r.next(30, 3600)) return;
      if (r.next(2) === 0) {
        if (r.next(10) === 0) s.f = 12;
        else if (r.next(7) === 0) s.f = 7;
        else if (r.next(3) === 0) s.f = 10;
        else s.f = 9;
      }
      s.c = 0;
    } else if (s.f === 9) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f = 8; }
    } else if (s.f >= 10 && s.f <= 11) {
      s.c++;
      if (s.c < 5) return;
      s.c = 0; s.f++;
      if (s.f > 3) s.f = r.next(3) === 0 ? 8 : 10;
    } else if (s.f >= 12 && s.f <= 14) {
      s.c++;
      if (s.c >= 10) { s.c = 0; s.f++; }
    } else if (s.f === 7) {
      s.c++;
      if (s.c > r.next(10, 3600)) {
        if (r.next(2) === 0) s.f = 8;
        s.c = 0;
      }
    }
  },

  /** 龟（:15144-15173）：主链 ++（8t）；空闲帧 0/15/31 放慢 rand(180,250)；
   *  29 → 0；15 有 1/3 折跃 30；越 32 回 15 */
  turtle(s, r) {
    s.c++;
    const n = (s.f === 0 || s.f === 15 || s.f === 31) ? r.next(180, 250) : 8;
    if (s.c < n) return;
    s.c = 0;
    if (s.f === 29) { s.f = 0; return; }
    if (s.f === 15 && r.next(3) === 0) { s.f = 30; return; }
    s.f++;
    if (s.f > 32) s.f = 15;
  },

  /** 海马（:15174-15214）：主链 ++；空闲 0/13 rand(220,340)、快帧 4/9/17/22(10t)、
   *  尾段 ≥25(6t)；0 有 1/2 折跃 25；24 → 0；越 33 回 0 */
  seahorse(s, r) {
    s.c++;
    const idle = s.f === 0 || s.f === 13;
    const mid = s.f === 4 || s.f === 9 || s.f === 17 || s.f === 22;
    let n = 7;
    if (idle) n = r.next(220, 340);
    if (mid) n = 10;
    if (s.f >= 25) n = 6;
    if (s.c < n) return;
    s.c = 0;
    if (s.f === 0 && r.next(2) === 0) { s.f = 25; return; }
    if (s.f === 24) { s.f = 0; return; }
    s.f++;
    if (s.f > 33) s.f = 0;
  },

  /** 河豚（:15215-15415，帧 0-70，横带 33 行/列）：常态 0-40 主链 7t，每步 1/75
   *  概率按所在相位折跃到充气段起点（41/46/51/56/61/66）；充气段 41-70 以
   *  counter/7 相位摆动，175t 后持满帧（45/50/55/60/65/70），183t 放气回
   *  {1/9/18/21/31/38}（TileDrawing:5840 addFrX=floor(f/33)*108 行=f%33） */
  pufferfish(s, r) {
    const cruise = 40;
    if (s.f >= 0 && s.f <= cruise) {
      s.c++;
      if (s.c < 7) return;
      s.c = 0;
      s.f++;
      if (s.f > cruise) s.f = 0;
      if (r.next(75) === 0) {
        if (s.f <= 2) s.f = 41;
        else if (s.f >= 8 && s.f <= 10) s.f = 46;
        else if (s.f >= 17 && s.f <= 19) s.f = 51;
        else if (s.f >= 20 && s.f <= 22) s.f = 56;
        else if (s.f >= 30 && s.f <= 32) s.f = 61;
        else if (s.f >= 37 && s.f <= 40) s.f = 66;
      }
      return;
    }
    const fullAt = 5 * 7 * 5 + 8;   // 183
    const holdAt = fullAt - 8;      // 175
    s.c++;
    if (s.c < holdAt) {
      let ph = Math.floor(s.c / 7);
      if (ph > 3) ph = 3;
      const base = s.f >= 46 && s.f <= 50 ? 46 : s.f >= 51 && s.f <= 55 ? 51
        : s.f >= 56 && s.f <= 60 ? 56 : s.f >= 61 && s.f <= 65 ? 61
          : s.f >= 66 && s.f <= 70 ? 66 : 41;
      s.f = base + ph;
    } else if (s.c >= holdAt) {
      s.f = s.f >= 46 && s.f <= 50 ? 50 : s.f >= 51 && s.f <= 55 ? 55
        : s.f >= 56 && s.f <= 60 ? 60 : s.f >= 61 && s.f <= 65 ? 65
          : s.f >= 66 && s.f <= 70 ? 70 : 45;
    }
    if (s.c >= fullAt) {
      s.c = 0;
      s.f = s.f <= 45 ? 1 : s.f <= 50 ? 9 : s.f <= 55 ? 18
        : s.f <= 60 ? 21 : s.f <= 65 ? 31 : 38;
    }
  },

  /** 蜗牛（:15417-15438）：主链 0-13 慢爬 rand(45,3600)；帧 8 有 1/2 折跃 14-18(5t)
   *  → 20；帧 1 双重 rand(3) 折跃 19/20；19/20 长待 rand(60,7200) 后 rand(4) 门
   *  （1/3 → 2，否则互切） */
  snail(s, r) { snailFamily(s, r, 45, 3600, 60, 7200); },
  /** 发光蜗牛（:15490-15562）：同构，慢爬 rand(30,2700)、静帧长待 rand(45,5400) */
  snail2(s, r) { snailFamily(s, r, 30, 2700, 45, 5400); },

  /** 青蛙（:15563-15663）：双空闲帧 0/6 各带独立动作链——0 → {跳 1-5(5t)→6 |
   *  吞食 12-17(5t) 循环回卷 rand(3) 出逃}；6 → {跳 7-11(5t)→0 | 吞食 18-23(5t)
   *  循环回卷 rand(3) 出逃}；出招门 rand(10)（10% 跳 / 90% 吞） */
  frog(s, r) {
    if (s.f === 0 || s.f === 6) {
      s.c++;
      if (s.c > r.next(45, 3600)) {
        s.f = r.next(10) === 0 ? s.f + 1 : s.f + 12;
        s.c = 0;
      }
    } else if (s.f >= 1 && s.f <= 5) {
      s.c++;
      if (s.c >= 5) { s.f++; s.c = 0; }
    } else if (s.f >= 12 && s.f <= 17) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 17) s.f = r.next(3) === 0 ? 0 : 12;
      }
    } else if (s.f >= 7 && s.f <= 11) {
      s.c++;
      if (s.c >= 5) {
        s.f++; s.c = 0;
        if (s.f > 11) s.f = 0;
      }
    } else if (s.f >= 18 && s.f <= 23) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 17) s.f = r.next(3) === 0 ? 6 : 18;
      }
    }
  },

  /** 蝗虫（:15826-15888）：双徘徊段 0-1 / 6-7（5t 互切，各 1/15 折跃进食 2-5 /
   *  8-11(5t)→0）；2-5 尾段 → 6 */
  grasshopper(s, r) {
    if (s.f >= 0 && s.f <= 1) {
      s.c++;
      if (s.c >= 5) {
        s.f++;
        if (s.f > 1) s.f = 0;
        s.c = 0;
        if (r.next(15) === 0) s.f = 2;
      }
    } else if (s.f >= 2 && s.f <= 5) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 5) s.f = 6;
    } else if (s.f >= 6 && s.f <= 7) {
      s.c++;
      if (s.c >= 5) {
        s.f++;
        if (s.f > 7) s.f = 6;
        s.c = 0;
        if (r.next(15) === 0) s.f = 8;
      }
    } else if (s.f >= 8 && s.f <= 11) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 11) s.f = 0;
    }
  },

  /** 老鼠（:15664-15769）：徘徊 0-1(5t) 各 1/15 折跃 {洗脸 4-7→2 | 8-11→0}；
   *  2-3(5t) 双 1/15 门折跃 8/12；后腿 12-13 → 直立 14-17(5t) 循环（1/20 出逃）；
   *  嗅探 18-19(5t)→0 */
  mouse(s, r) {
    if (s.f >= 0 && s.f <= 1) {
      s.c++;
      if (s.c >= 5) {
        s.f++;
        if (s.f > 1) s.f = 0;
        s.c = 0;
        if (r.next(15) === 0) s.f = 4;
      }
    } else if (s.f >= 4 && s.f <= 7) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 7) s.f = 2;
    } else if (s.f >= 2 && s.f <= 3) {
      s.c++;
      if (s.c >= 5) {
        s.f++;
        if (s.f > 3) s.f = 2;
        s.c = 0;
        if (r.next(15) === 0) s.f = 8;
        else if (r.next(15) === 0) s.f = 12;
      }
    } else if (s.f >= 8 && s.f <= 11) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
      if (s.f > 11) s.f = 0;
    } else if (s.f >= 12 && s.f <= 13) {
      s.c++;
      if (s.c >= 5) { s.c = 0; s.f++; }
    } else if (s.f >= 14 && s.f <= 17) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 17 && r.next(20) !== 0) s.f = 14;
      }
    } else if (s.f >= 18 && s.f <= 19) {
      s.c++;
      if (s.c >= 5) {
        s.c = 0; s.f++;
        if (s.f > 19) s.f = 0;
      }
    }
  },

  /** 蠕虫（:15770-15799）：rand(30,91) 节拍 + rand(4) 门才 ++；帧 9 有 1/2 早回；
   *  越 18 回 {9 | 0}（1/2） */
  worm(s, r) {
    s.c++;
    if (s.c < r.next(30, 91)) return;
    s.c = 0;
    if (r.next(4) !== 0) return;
    s.f++;
    if (s.f === 9 && r.next(2) === 0) s.f = 0;
    if (s.f > 18) s.f = r.next(2) === 0 ? 9 : 0;
  },

  /** 鼻涕虫（:15800-15825，[3,25]：392/393/394 三档帧数 24/31/34）：
   *  rand(5,15) 节拍匀速爬，越顶回 0 */
  slug(s, r, style = 0) {
    const max = [24, 31, 34][style] ?? 24;
    if (++s.c >= r.next(5, 15)) {
      s.c = 0;
      if (++s.f >= max) s.f = 0;
    }
  },

  /** 蛆（:15889-15925）：慢帧 {0,6,18} rand(100,140)，余 8t；0 出 {蛆动 13 | 1}；
   *  12 → 0；主链 ++ 越 23 回 6 */
  maggot(s, r) {
    s.c++;
    const slow = s.f === 0 || s.f === 6 || s.f === 18;
    const n = slow ? r.next(100, 140) : 8;
    if (s.c < n) return;
    s.c = 0;
    if (s.f === 0) {
      s.f = r.next(3) === 0 ? 13 : 1;
      return;
    }
    if (s.f === 12) { s.f = 0; return; }
    s.f++;
    if (s.f > 23) s.f = 6;
  },

  /** 瓢虫（:15926-15989）：持帧分级（动 5t / 慢 rand(198,206) / 静 18 rand(160,241) /
   *  默认 rand(10,12)）；折跃：2|5 → 17、3|12 → {4(2/3)|13}、7|16 → {0(2/3)|8}、
   *  ≥18 → {13|4} */
  ladybug(s, r) {
    s.c++;
    const slow = s.f === 3 || s.f === 7 || s.f >= 17;
    let n = r.next(10, 12);
    if (s.f === 18) n = r.next(160, 241);
    else if (slow) n = r.next(198, 206);
    else if (s.f >= 8 && s.f <= 16) n = 5;
    if (s.c < n) return;
    s.c = 0;
    if (s.f < 18) {
      if ((s.f === 2 || s.f === 5) && r.next(3) === 0) s.f = 17;
      else if (s.f === 3 || s.f === 12) s.f = r.next(3) === 2 ? 13 : 4;
      else if (s.f === 7 || s.f === 16) s.f = r.next(3) === 2 ? 8 : 0;
      else s.f++;
    } else {
      s.f = r.next(2) === 0 ? 13 : 4;
    }
  },

  /** 老鼠笼大鼠（:15990-16096，帧 0-16）：持帧分级（5 / rand(40,70) / rand(70,110) /
   *  180）；等待期两段相位舞——>11 直立段随 counter%90 锯齿（12-16 往返）、
   *  8-11 洗脸段 counter%10 抖动；出招门：0 → {12(2/3)|8}、4 → 10、7/9/12 → 0、
   *  11 → 4、主链 ++ 越 16 回 0 */
  rat(s, r) {
    s.c++;
    const idle = s.f === 0 || s.f === 4;
    const wash = s.f >= 8 && s.f <= 11;
    const stand = s.f > 11;
    let n = 5;
    if (idle) n = r.next(40, 70);
    if (wash) n = r.next(70, 110);
    if (stand) n = 180;
    if (s.c >= n) {
      s.c = 0;
      if (s.f === 0 && r.next(2) === 0) { s.f = r.next(3) !== 0 ? 12 : 8; return; }
      if (s.f === 4 && r.next(2) === 0) { s.f = 10; return; }
      if (s.f === 7 || s.f === 9 || s.f === 12) { s.f = 0; return; }
      if (s.f === 11) { s.f = 4; return; }
      s.f++;
      if (s.f > 16) s.f = 0;
    } else if (stand) {
      const p = s.c % 90;
      s.f = p > 80 ? 12 : p > 70 ? 13 : p > 60 ? 14 : p > 50 ? 15 : p > 40 ? 16
        : p > 30 ? 15 : p > 20 ? 14 : p > 10 ? 13 : 12;
    } else if (s.c % 10 === 0) {
      if (s.f === 8 || s.f === 10) s.f++;
      else if (s.f === 9 || s.f === 11) s.f--;
    }
  },

  /** 水黾（:16097-16146，帧 0-21）：持帧分级（5 / rand(110,210) / rand(150,260)）；
   *  出招门 0 → 16(1/2)、8 → 19(1/2)；15/18 → 0；主链 ++ 越 21 回 8 */
  waterStrider(s, r) {
    s.c++;
    const idle = s.f === 0 || s.f === 8;
    const hold = s.f === 17 || s.f === 20;
    let n = 5;
    if (idle) n = r.next(110, 210);
    if (hold) n = r.next(150, 260);
    if (s.c < n) return;
    s.c = 0;
    if (s.f === 0 && r.next(2) === 0) { s.f = 16; return; }
    if (s.f === 8 && r.next(2) === 0) { s.f = 19; return; }
    if (s.f === 15 || s.f === 18) { s.f = 0; return; }
    s.f++;
    if (s.f > 21) s.f = 8;
  },

  /** 妖精罐（:16147-16167）：只推进槽 0（counter>5 → ++，越 11 回 0）；
   *  槽 1..24 由槽 0 级联派生（见 deriveFairyJar）——569/570 三张罐共用同一数组 */
  fairyJar(s) {
    s.c++;
    if (s.c > 5) {
      s.c = 0;
      s.f++;
      if (s.f > 11) s.f = 0;
    }
  },

  /** 鱼缸（:16168-16324，帧 0-16 + 模式 m 0-4）：模式机——m1(5t)/m2(20t)/
   *  m3(rand(5,3600)) 泳姿，各 rand(900|3600) 概率重掷模式；m0 主链 10t，帧 10 处
   *  1/12 折跃 11；11 → 静置 12-13(10t) 循环（1/20 出 14）→ 14-16(10t) 回 4 */
  fishBowl(s, r) {
    /** 泳姿推进（m1/2/3 共用帧逻辑，仅节拍不同；帧 10 处 1/20 折跃静置 11 并回 m0） */
    const swim = (gate: number) => {
      s.c++;
      if (s.c < gate) return;
      s.c = 0;
      if (s.f === 10) {
        if (r.next(20) === 0) { s.f = 11; s.m = 0; } else s.f = 1;
      } else {
        s.f++;
      }
    };
    if (s.m === 1) {
      if (r.next(900) === 0) s.m = r.next(5);   // 模式重掷与推进互斥（原版 else-if 链）
      swim(5);
    } else if (s.m === 2) {
      if (r.next(3600) === 0) s.m = r.next(5);
      swim(20);
    } else if (s.m === 3) {
      if (r.next(3600) === 0) s.m = r.next(5);
      swim(r.next(5, 3600));
    } else if (s.f <= 10) {
      if (r.next(3600) === 0) s.m = r.next(5);
      s.c++;
      if (s.c < 10) return;
      s.c = 0;
      if (s.f === 10) {
        if (r.next(12) === 0) s.f = 11;
        else s.f = 1;
      } else {
        s.f++;
      }
    } else if (s.f === 12 || s.f === 13) {
      s.c++;
      if (s.c < 10) return;
      s.c = 0;
      s.f++;
      if (s.f > 13) s.f = r.next(20) === 0 ? 14 : 12;
    } else if (s.f >= 11) {
      s.c++;
      if (s.c >= 10) {
        s.c = 0;
        s.f++;
        if (s.f > 16) s.f = 4;
      }
    }
  },

  /** 熔岩鱼缸（:16325-16337，帧 0-26）：4+rand(3) 节拍匀速游，越 26 回 0 */
  lavaFishBowl(s, r) {
    s.c++;
    if (s.c > 4 + r.next(3)) {
      s.c = 0;
      s.f++;
      if (s.f > 26) s.f = 0;
    }
  },

  /** 蝴蝶（:16338-16466，[9,25] 帧域 0-15 + 模式 m 0-14）：模式 = 速度档（0=默认
   *  rand(3,16) / 1=3t / 2=5t / 3=10t / 4=15t）+ 10 档倒飞；每 tick 1/3600 重掷；
   *  上下两半帧域（0-7 翅合 / 8-15 翅展）各自循环，1/4/6 与 9/12/14 处 1/10 穿域，
   *  倒飞段再叠 1/20 穿域 + 1/6 转向 */
  butterfly(s, r) {
    s.c++;
    if (r.next(3600) === 0) {
      s.m = r.next(5);
      if (r.next(2) === 0) s.m += 10;
    }
    let n = r.next(3, 16);
    if (s.m === 1 || s.m === 11) n = 3;
    else if (s.m === 2 || s.m === 12) n = 5;
    else if (s.m === 3 || s.m === 13) n = 10;
    else if (s.m === 4 || s.m === 14) n = 15;
    if (s.c < n) return;
    s.c = 0;
    const low = s.f <= 7;               // 帧域判定取【推进前】值（原版先判域再 --/++）
    const gate = low ? [1, 4, 6] : [9, 12, 14];
    if (s.m >= 10) {
      s.f--;
      if (low) { if (s.f < 0) s.f = 7; } else { if (s.f < 8) s.f = 14; }
      if (!gate.includes(s.f)) return;
      if (r.next(20) === 0) s.f += low ? 8 : -8;
      else if (r.next(6) === 0) s.m = s.m >= 10 ? s.m - 10 : s.m + 10;
    } else {
      s.f++;
      if (low) { if (s.f > 7) s.f = 0; } else { if (s.f > 15) s.f = 8; }
      if (gate.includes(s.f) && r.next(10) === 0) s.f += low ? 8 : -8;
    }
  },

  /** 蜻蜓（UpdateDragonflyJarFrame :16612-16666，[7,25] 帧域 0-12）：停驻 0（300t 后
   *  1/60 起飞 → 1|5|9）；起飞三态 1/5/9（100t 后选向：1 → {0|5|5|9|9}，5/9 → 1）；
   *  折返摆动段（2-4/6-8/10-12）以 counter/4 相位在 4 帧窗内往返，40t 后 1/30 收翅 */
  dragonfly(s, r) {
    s.c++;
    switch (s.f) {
      case 0:
        if (s.c >= 300 && r.next(60) === 0) {
          s.c = 0;
          s.f = [1, 5, 9][r.next(3)];
        }
        break;
      case 1:
      case 5:
      case 9:
        if (s.c >= 100) {
          s.c = 0;
          s.f = s.f === 1 ? [0, 5, 5, 9, 9][r.next(5)] : 1;
        } else if (s.c >= 6) {
          s.c = 0;
          s.f++;
        }
        break;
      default: {
        // 摆动段：帧窗 [base, base+3]，相位 = counter/4 %4 折返（0,1,2,1）
        const num = s.f - 1;
        const rel = (num % 4) - 1;
        let ph = Math.floor(s.c / 4) % 4;
        if (ph > 2) ph = 4 - ph;
        s.f = num - rel + 1 + ph;
        if (s.c >= 40 && r.next(30) === 0) {
          s.c = 100;
          s.f = num - rel;   // 收翅回落到本窗首帧-1（= 起飞态 1/5/9）
        }
        break;
      }
    }
  },

  /** 水母（:16467-16536，[3,25] 帧域 0-9 + 模式 m 0-3）：模式链 0(脉冲 rand(10,20),
   *  帧 0-3 循环) →1(收缩 rand(15,25) 爬到 7)→2(快摆 rand(4,9) 绕 7-9 循环，1/60)→
   *  3(舒张 rand(15,25) 爬到 10 → 回 3 进 0)；0→1 门 1/1800 */
  jellyfish(s, r) {
    s.c++;
    if (s.m === 0 && r.next(1800) === 0) s.m = 1;
    if (s.m === 2 && r.next(60) === 0) s.m = 3;
    const n = s.m === 0 ? r.next(10, 20) : s.m === 1 ? r.next(15, 25)
      : s.m === 2 ? r.next(4, 9) : r.next(15, 25);
    if (s.m === 0 && s.f <= 3 && s.c >= n) {
      s.c = 0;
      s.f++;
      if (s.f >= 4) s.f = 0;
    }
    if (s.m === 1 && s.f <= 7 && s.c >= n) {
      s.c = 0;
      s.f++;
      if (s.f >= 7) s.m = 2;
    }
    if (s.m === 2 && s.f <= 9 && s.c >= n) {
      s.c = 0;
      s.f++;
      if (s.f >= 9) s.f = 7;
    }
    if (s.m === 3 && s.f <= 10 && s.c >= n) {
      s.c = 0;
      s.f++;
      if (s.f >= 10) { s.f = 3; s.m = 0; }
    }
  },

  /** 猫头鹰（UpdateOwlCageFrame :16557-16611）：无独立帧计数器语义——帧由
   *  counter 直接派生：每 tick counter++（1/80 概率停拍），临近 40 边界重掷
   *  40*rand(4) 错相；段 = counter/40（0 头部四态 / 1 理羽 8-7 / 2 转身 7+ /
   *  3 蓄势 11+），段内相位 = counter%40/10（3 钳到 1） */
  owl(s, r) {
    if (s.c % 40 !== 0 || r.next(80) === 0) s.c++;
    if ((s.c + 1) % 40 === 39) s.c = 40 * r.next(4);
    const ph = Math.floor((s.c % 40) / 10);
    const seg = Math.floor(s.c / 40);
    let p = ph;
    if (seg === 0) {
      if (p === 3) p = 1;
      s.f = p;
    } else if (seg === 1) {
      if (p === 3) p = 1;
      s.f = p === 0 ? 0 : 8 - p;
    } else if (seg === 2) {
      s.f = p === 0 ? 0 : 7 + p;
    } else if (seg === 3) {
      s.f = p === 0 ? 0 : 11 + p;
    } else {
      s.f = 0;   // switch 无 default：越段兜底 0（常态不可达，c ≤ 158）
    }
  },
};

/** mallard/duck 共用体（:13826-13953 / :13954-14081 两段逐字同构） */
function mallardDuck(s: CageState, r: CageRng): void {
  if (s.f === 0 || s.f === 4) {
    s.c++;
    if (s.c <= r.next(45, 2700)) return;
    if ((s.f === 0 && r.next(3) !== 0) || (s.f === 4 && r.next(5) === 0)) {
      if (r.next(6) === 0) s.f = 5;
      else if (r.next(3) === 0) s.f = s.f === 4 ? 0 : 4;
      else s.f = 1;
    }
    s.c = 0;
  } else if (s.f >= 1 && s.f <= 3) {
    s.c++;
    if (s.c >= 5) { s.c = 0; s.f++; }
    if (s.f > 3) s.f = r.next(5) === 0 ? 0 : 1;
  } else if (s.f >= 5 && s.f <= 11) {
    s.c++;
    if (s.c >= 5) { s.c = 0; s.f++; }
  } else if (s.f === 12 || s.f === 16) {
    s.c++;
    if (s.c <= r.next(45, 2700)) return;
    if ((s.f === 12 && r.next(3) !== 0) || (s.f === 16 && r.next(5) === 0)) {
      if (r.next(6) === 0) s.f = 17;
      else if (r.next(3) === 0) s.f = s.f === 16 ? 12 : 16;
      else s.f = 13;
    }
    s.c = 0;
  } else if (s.f >= 13 && s.f <= 15) {
    s.c++;
    if (s.c < 5) return;
    s.f++;
    if (s.f > 15) s.f = r.next(5) !== 0 ? 12 : 13;
    s.c = 0;
  } else if (s.f >= 17) {
    s.c++;
    if (s.c >= 5) { s.c = 0; s.f++; }
    if (s.f > 23) s.f = 0;
  }
}

/** bird/blueBird/redBird 共用体（:14312 / :14448 / :14584 三段逐字同构） */
function birdFamily(s: CageState, r: CageRng): void {
  if (s.f === 0) {
    s.c++;
    if (s.c <= r.next(30, 2700)) return;
    if (r.next(3) !== 0) s.f = r.next(3) !== 0 ? 2 : 1;
    s.c = 0;
  } else if (s.f === 1) {
    s.c++;
    if (s.c > r.next(900, 18000) && r.next(3) === 0) {
      s.c = 0;
      s.f = 0;
    }
  } else if (s.f >= 2 && s.f <= 5) {
    s.c++;
    if (s.c >= 5) {
      s.c = 0;
      if (s.f === 3 && r.next(3) === 0) s.f = 13;
      else s.f++;
    }
  } else if (s.f === 6) {
    s.c++;
    if (s.c <= r.next(45, 2700)) return;
    if (r.next(3) !== 0) {
      if (r.next(6) === 0) s.f = 7;
      else if (r.next(6) === 0) s.f = 11;
    }
    s.c = 0;
  } else if (s.f >= 7 && s.f <= 10) {
    s.c++;
    if (s.c >= 5) {
      s.f++;
      if (s.f > 10) s.f = 0;
      s.c = 0;
    }
  } else if (s.f >= 11 && s.f <= 13) {
    s.c++;
    if (s.c >= 5) { s.f++; s.c = 0; }
  } else if (s.f === 14) {
    s.c++;
    if (s.c > r.next(5, 600)) {
      if (r.next(20) === 0) s.f = 16;
      else if (r.next(20) === 0) s.f = 4;
      else s.f = 15;
      s.c = 0;
    }
  } else if (s.f === 15) {
    s.c++;
    if (s.c >= 10) { s.c = 0; s.f = 14; }
  } else if (s.f >= 16 && s.f <= 18) {
    s.c++;
    if (s.c >= 5) {
      s.f++;
      if (s.f > 18) s.f = 0;
      s.c = 0;
    }
  }
}

/** 蜗牛族共用体（snail :15417 / snail2 :15490，仅持帧参数不同） */
function snailFamily(s: CageState, r: CageRng, crawlA: number, crawlB: number, restA: number, restB: number): void {
  if (s.f >= 0 && s.f <= 13) {
    s.c++;
    if (s.c <= r.next(crawlA, crawlB)) return;
    if (s.f === 8 && r.next(2) === 0) s.f = 14;
    else if (s.f === 1 && r.next(3) === 0) s.f = 19;
    else if (s.f === 1 && r.next(3) === 0) s.f = 20;
    else {
      s.f++;
      if (s.f > 13) s.f = 0;
    }
    s.c = 0;
  } else if (s.f >= 14 && s.f <= 18) {
    s.c++;
    if (s.c >= 5) { s.c = 0; s.f++; }
    if (s.f > 18) s.f = 20;
  } else if (s.f === 19 || s.f === 20) {
    s.c++;
    if (s.c <= r.next(restA, restB)) return;
    s.c = 0;
    if (r.next(4) === 0) {
      if (r.next(3) === 0) s.f = 2;
      else if (s.f === 19) s.f = 20;
      else s.f = 19;
    }
  }
}

// ============================================================================
// 槽位帧态存储 + 惰性推进
// ============================================================================

interface SlotEntry { s: CageState; tick: number; rng: SlotRngImpl }

/** 单槽位确定性 RNG：序列 = hash(种子, 序号)，跨调用可续（重放稳定） */
class SlotRngImpl implements CageRng {
  private seq = 0;
  constructor(private readonly seed: number) {}
  next(a: number, b?: number): number {
    const v = hash32(this.seed, this.seq++);
    return b === undefined ? v % a : a + (v % (b - a));
  }
}

const slotStore = new Map<string, SlotEntry>();

/** 单次调用最多追赶的 tick 数（防首次大 tick 直查卡顿；生产路径每帧 +1 不会触及） */
const MAX_CATCHUP = 200_000;

function slotKey(fam: CageFamily): string {
  return `${fam.family}:${fam.idx}:${fam.style}:${fam.slot}`;
}

function entryOf(fam: CageFamily, slot: number): SlotEntry {
  const key = `${slotKey(fam)}:${slot}`;
  let e = slotStore.get(key);
  if (!e) {
    e = { s: { f: 0, c: 0, m: 0 }, tick: 0, rng: new SlotRngImpl(hash32(fam.idx * 131 + slot, fam.style)) };
    slotStore.set(key, e);
  }
  return e;
}

/** 派生槽位（妖精罐 Main.cs:16152-16167：槽 1..24 帧 = (槽0帧 + k%12 + k%2==0 +
 *  k%5==0 + k%8==0) mod 12；槽 0 是主槽本身不派生） */
function deriveFairyJar(master: number, slot: number): number {
  let v = master + (slot % 12);
  if (slot % 2 === 0) v++;
  if (slot % 5 === 0) v++;
  if (slot % 8 === 0) v++;
  return v % 12;
}

/** 世界重载/tick 回卷时清空帧态（原版数组随 Main 静态重置） */
export function resetCageAnim(): void {
  slotStore.clear();
}

/**
 * 槽位当前动画帧（≈ AnimateTiles_CritterCages Main.cs:13452-16536）。
 * 帧态按 (族,样式,槽位) 独立存储、随全局 tick 惰性推进（同族同槽同相位）。
 * @param frames 可用帧行数（floor(表高/step)）；帧值防御性钳到 [0, frames-1]
 */
export function cageFrameOf(fam: CageFamily, slot: number, tick: number, frames?: number): number {
  const machine = CAGE_ANIM[fam.family];
  if (!machine) return 0;
  // 派生族：只推进槽 0（entryOf 内已归一），其余槽由主槽帧级联导出
  const e = entryOf(fam, fam.derive ? 0 : slot);
  if (tick < e.tick) {
    e.s = { f: 0, c: 0, m: 0 };
    e.tick = 0;
    e.rng = new SlotRngImpl(hash32(fam.idx * 131 + (fam.derive ? 0 : slot), fam.style));
  }
  let guard = MAX_CATCHUP;
  while (e.tick < tick && guard-- > 0) {
    e.tick++;
    machine(e.s, e.rng, fam.style);
  }
  const f = fam.derive && slot > 0 ? deriveFairyJar(e.s.f, slot) : e.s.f;
  return frames === undefined ? f : Math.min(f, Math.max(0, frames - 1));
}

/** idx → 族档案反查表（cageFrameRow 兼容签名用；懒建） */
let familyByIdx: Map<number, CageFamily> | null = null;

/** 兼容旧签名（按族 idx + style 0）的帧行查询 */
export function cageFrameRow(family: number, slot: number, tick: number, frames: number): number {
  if (!familyByIdx) {
    familyByIdx = new Map();
    for (const fam of Object.values(CAGE_FAMILY)) {
      if (!familyByIdx.has(fam.idx)) familyByIdx.set(fam.idx, fam);
    }
  }
  const fam = familyByIdx.get(family);
  if (!fam) return 0;
  return cageFrameOf(fam, slot, tick, frames);
}

/** 重烘焙节奏（ChunkCache.advanceAnim 用）：各族相邻帧变化的最小 tick 间隔 */
export function cageAnimRate(sheet?: number): number {
  if (sheet === undefined) return 5;
  return CAGE_FAMILY[sheet]?.rate ?? 5;
}

/** 横带分帧（TileDrawing.cs:5840-5843）：addFrX = floor(frame/rows)*stride、行 = frame%rows
 *  （仅 710 河豚：素材 324×1782 = 3 列×108 × 33 行×54） */
export function cageBandOffset(fam: CageFamily, frame: number): { dx: number; row: number } {
  if (!fam.xband) return { dx: 0, row: frame };
  return { dx: Math.floor(frame / fam.xband.rows) * fam.xband.stride, row: frame % fam.xband.rows };
}

export interface DrawSource { img: HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number }

/**
 * 笼族一格绘制（TileDrawing.cs:1670-1716 顶盖段 1:1）。
 * @param r       drawVanillaCell 已取的本格帧（vframeAt 结果，含 18px 步长源坐标）
 * @param sheetH  笼表总像素高（算帧行数）
 * @param tileTop 本格 tileTop（DRAW_Y_OFFSET 恒 2）
 */
export function drawCageCell(
  ctx: CanvasRenderingContext2D, atlas: { ensureVImage: (f: string) => HTMLImageElement | null },
  fam: CageFamily, r: DrawSource, x: number, y: number, fx: number, fy: number,
  px: number, py: number, tileTop: number, sheetH: number,
): void {
  const rows = Math.max(1, Math.floor(sheetH / fam.step));
  // 槽位哈希用【存储帧】（物体锚还原，TileDrawing.cs:6646-6652 同式）
  const slot = cageSlot(fam.slot, x, y, fx, fy);
  // 横带族（710）帧域 = 单帧行数 × 横带列数（帧 41-70 在第 2/3 列），
  // 钳制须按总帧数——按 rows 钳会把充气段压平到末行
  const frameCap = fam.xband
    ? rows * Math.max(1, Math.floor(r.img.width / fam.xband.stride))
    : rows;
  const frame = cageFrameOf(fam, slot, tileAnim.tick, frameCap);
  // 710 河豚横带（TileDrawing.cs:5840-5843）
  const band = cageBandOffset(fam, frame);
  const asx = r.sx + band.dx;
  const asy = r.sy + band.row * fam.step;
  if (asy + r.sh > r.img.height) return;  // 帧行越界（表残缺）：整格跳过防画出邻带
  const baseY = py + tileTop;
  const isTopRow = asy % fam.step === 0;  // 当前帧行首行格（:1673/:1675 的 %54/%36）
  if (!isTopRow || fam.lid < 0) {
    ctx.drawImage(r.img, asx, asy, r.sw, r.sh, px, baseY, r.sw, r.sh);
    return;
  }
  // 首行格：本体下移 8px（源裁顶 8px，:1679-1686）+ 顶盖画在 tileTop-2（:1687-1694）
  ctx.drawImage(r.img, asx, asy + 8, r.sw, r.sh - 8, px, baseY + 8, r.sw, r.sh - 8);
  const lid = atlas.ensureVImage(`vanilla/CageTop_${fam.lid}.png`);
  if (!lid) return;
  // style 0 顶盖 X 取源 X %108（剥河豚横带；:1690-1693）；宽 16 高 10（:1694-1696）
  const lidX = fam.lid === 0 ? asx % 108 : asx;
  if (lidX + 16 > lid.width) return;
  ctx.drawImage(lid, lidX, 0, 16, 10, px, baseY - 2, 16, 10);
}
