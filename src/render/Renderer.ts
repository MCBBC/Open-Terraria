// 主渲染器：天空 → chunk → 液体 → 实体 → 粒子/飘字 → 光照合成 → 小地图
import { TILE, CHUNK } from '../core/constants';
import type { Camera } from './Camera';
import { SkyRenderer } from './SkyRenderer';
import { ChunkCache } from './ChunkCache';
import type { World, Clock } from '../world/World';
import type { AssetBundle } from '../assets/AssetGen';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { DrawRect } from '../assets/SpriteAtlas';
import { atlasIconForKey, VANILLA_ITEM_ICON_MAP, sliceItemAnimFrame } from '../assets/SpriteAtlas';
import { TOOL_CUTTER } from '../world/Wiring';
import { compositePaperDoll, dollFrame } from '../player/PaperDoll';
import type { Inventory } from '../items/Inventory';
import { options } from '../core/Options';
import { VanillaResourceBars } from './ResourceBars';
import { FancyResourceBars } from './FancyResourceBars';
import { VanillaBreathMeter } from './BreathMeter';
import { MonolithFilters, emptyMonolithScene, visualScanRect, scanMonolithScene, type MonolithSceneState } from './MonolithFilters';
import type { FlickerClock } from '../lighting/SkyColor';
import { SMART_CURSOR_DIRECTION_LOCKS } from '../player/SmartCursor';
import { mobileUiScale } from '../ui/MobileControls';
import { TEAM_COLORS } from '../stats/Pvp';

/** 鼠标目标格（智能光标激活时 smart=true 并附方向锁 arrow） */
export interface HoverTarget {
  x: number; y: number;
  smart?: boolean;
  arrow?: { x: number; y: number } | null;
}

/** 装备 → 纸娃娃渲染参数。贴图索引 = item.head/body/legs 槽位序号（原版语义，
 *  非物品 id——铁甲三件的槽位序号都是 2）；原版物品 id 经 vanilla.json armorIndex 查表 */
function dollEquipFromInv(inv: Inventory, atlas: import('../assets/SpriteAtlas').SpriteAtlas | null): { head: number | null; body: number | null; legs: number | null } {
  const idx = (itemId: number | null | undefined): number | null => {
    if (itemId == null) return null;
    const def = ITEM_DEFS[itemId];
    if (!def?.armor) return null;
    const key = def.key;
    const vid = VANILLA_ITEM_ICON_MAP[key] ?? (key.startsWith('vi_') ? parseInt(key.slice(3), 10) : NaN);
    if (!Number.isFinite(vid)) return null;
    const entry = atlas?.vanilla.armorIndex?.[String(vid)];
    if (!entry) return null;
    const slot = def.armor.slot; // 0头 1胸 2腿
    return slot === 0 ? (entry.head || null) : slot === 1 ? (entry.body || null) : (entry.legs || null);
  };
  const disp = inv.displayArmor();
  return { head: idx(disp[0]), body: idx(disp[1]), legs: idx(disp[2]) };
}
import { WeatherRenderer } from './WeatherRenderer';
import { drawVanillaLiquids } from './VanillaLiquidRenderer';
import { renderEnv } from './VanillaTiler';
import { drawTileFlames } from './TileFlames';
import { drawWindSwayTiles, litNatureVisibility } from './WindSway';
import { natureParticles } from './NatureParticles';
import { WaterfallRenderer } from './WaterfallRenderer';
import { BiomeBackground } from './BiomeBackground';
import type { SceneFlags } from '../world/SceneMetrics';
import { TILE_DEFS, WALL_DEFS, TILE_BY_KEY } from '../data/tiles';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { VANILLA_IS_FOOD, type FurnitureKind } from '../world/FurnitureItems';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { drawEmotes } from './EmoteBubble';
import { combatFontReady, drawCombatText } from './CombatTextFont';
import { InfoAccsLayer } from './InfoAccsLayer';
import { buildInfoAccRows, type InfoAccCtx } from '../stats/InfoAccs';

/** 原版 holdStyle!=0 物品集（Item.cs SetDefaults holdStyle=1 实证 + TEdit 实名核对）：
 *  火把族（8/彩色 427-433/群系 523..5353）+ 荧光棒族 ItemID.Sets.Glowsticks(282,286,3112,3002,4776,5643)。
 *  PlayerDrawLayers.cs:3857：holdStyle!=0 → 静持也渲染（手臂抬起） */
const HOLD_STYLE_ITEMS = new Set([
  8, 427, 428, 429, 430, 431, 432, 433, 523, 974, 1245, 1333, 2274, 3004, 3045, 3114,
  4383, 4384, 4385, 4386, 4387, 4388, 5293, 5353,
  282, 286, 3112, 3002, 4776, 5643,
]);

/** useStyle 5 的"法杖持位"物品（Main.cs:6695-6740 Item.staff=true 全 34 件）：
 *  ApplyUseStyle 5 的 staff 分支（Player.cs:50374）把 itemLocation 钉在
 *  MountedCenter + 瞄准向量×6（贴图斜持指向鼠标），与默认持位不同 */
const STAFF_ITEMS = new Set([
  683, 723, 726, 739, 740, 741, 742, 743, 744, 788, 1296, 1308, 1326, 1444, 1445,
  1446, 1801, 1930, 1931, 2188, 2750, 3006, 3051, 3209, 3210, 3377, 3476, 3569,
  3571, 3787, 3852, 3870, 4062, 5065,
]);

/** Main.DrawPlayerItemPos（Main.cs:3305-3663）1:1：useStyle 5 非法杖（枪/弓）握把。
 *  值 = [num（origin.X = -num），dy（result.Y = H/2 + dy）]；缺省 [10, 0]。
 *  外层 switch 在前（95..1835）；default 内层 switch 只对未命中外层的 id 生效
 *  （内层 case 2626 num=-4 为不可达反编译残留，2624 以外层 num=4 为准） */
const ITEM_DRAW_POS_DEF: readonly [number, number] = [10, 0];
const ITEM_DRAW_POS: Record<number, readonly [number, number]> = {
  95: [6, 2], 5629: [4, -2], 1295: [4, 0], 5464: [2, 0], 3611: [2, 0], 5495: [-2, 0],
  3350: [2, 0], 2624: [4, 0], 3018: [2, 0], 3007: [4, -1], 3107: [4, 2], 3008: [-7, 2],
  1255: [6, 0], 2269: [2, 2], 1265: [-8, 4], 2272: [0, 4], 3029: [4, 0], 4381: [4, 0],
  2796: [-28, 2], 2797: [0, 0], 2610: [0, 0], 2623: [-30, -4], 3546: [-14, -6], 1835: [-2, 2],
  3859: [-2, 0], 2888: [6, 0], 2223: [2, -2], 1782: [0, 4], 1929: [0, 2], 2270: [-4, 0],
  1784: [0, 4], 1000: [6, 0], 1178: [4, 0], 1319: [0, 0], 1297: [-8, 0], 1121: [6, -2],
  1314: [2, 0], 1258: [2, -2], 1155: [-10, -2], 1156: [-2, 0], 4703: [-3, -2], 5117: [-1, 0],
  96: [-8, 2], 1870: [-8, 2], 1260: [-8, 2], 1254: [-6, 2], 98: [-5, -2], 534: [-2, 1],
  679: [0, 2], 964: [0, 0], 533: [-7, -2], 1553: [-10, -2], 506: [0, -2], 1910: [0, -2],
  494: [-2, 0], 508: [-2, 0], 434: [0, -2], 514: [0, 3],
  435: [-2, -2], 436: [-2, -2], 481: [-2, -2], 578: [-2, -2], 1187: [-2, -2],
  1194: [-2, -2], 1201: [-2, -2], 1229: [-2, -2],
  197: [-5, 4], 4060: [-2, 4], 126: [4, 4], 800: [4, 2], 127: [4, 2], 157: [6, 2],
  160: [-8, 0], 164: [0, 2], 219: [0, 2], 165: [4, 4], 272: [4, 4], 3870: [4, 4],
  266: [0, 2], 281: [6, -6], 986: [6, -10], 682: [4, 0], 4953: [-4, 0],
  758: [-10, 0], 759: [-8, 2], 5460: [0, -6], 760: [-2, 2], 1946: [-2, 2],
  779: [0, 2], 5134: [0, 2], 905: [-5, 0], 930: [4, 2], 3788: [2, 2], 5668: [-13, 0],
};

/** OffsetsPlayerHeadgear（Main.cs:504-525，按 bodyFrame.Y/56 行索引）：
 *  行 0-6→y2 / 7-9→y0 / 10-13→y2 / 14-16→y0 / 17-19→y2（X 恒 0）。
 *  useStyle 14/15（头侧持）与 holdStyle 5/6/8 的 itemLocation 都要加此偏移 */
const HEADGEAR_OFFSET_Y = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
import { Lang } from '../i18n/Lang';
import { pylonItemTypeFromStyle } from '../world/TeleportPylons';
import { ITEM_DEFS } from '../data/items';
import { townExtraFrames, TOWN_NPC_HEAD_INDEX, BOSS_HEAD_INDEX, bossHeadRotation, VANILLA_NPCS } from '../data/vanillaNpcs';
import type { Player } from '../entities/Player';
import { mountFallbackColor } from '../entities/Mounts';
import { BuffType } from '../stats/Buffs';
import { expertRenderScale } from '../stats/ScaleStats';
import { vanillaTileMapColor, vanillaWallMapColor, vanillaLiquidColor, vanillaSkyColor, VANILLA_DIRT_BG, VANILLA_ROCK_BG } from '../data/vanillaMapColors';
import { mapPaintColor, PAINT_RGB } from '../world/Paint';
import { Enemy } from '../entities/Enemy';
import { TOWER_KEY, TOWER_SHIELD_COLOR, isTowerId, shieldMax } from '../world/LunarEvent';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { Tombstone, getTombstoneCanvas } from '../entities/Tombstone';
import { liveGorePieces, type GorePiece } from '../entities/GorePiece';
import { Critter } from '../entities/Critter';
import { wofDrawArea } from '../entities/bossAI_wof';
import { dutchmanAnim } from '../entities/bossAI_dd2';
import type { Entity } from '../entities/Entity';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; damp?: number; grav?: number; }

const PIXEL_ART_TILE = TILE_BY_KEY['pixel_block'] ?? -1; // 自研像素方块（F2 图片导入，RGB 在 frameX/Y）

// 光照合成 4-tap 标量缓冲(替代每像素 [r,g,b] 元组,2026-08 审计 G2)
const _lightTap = new Uint8Array(12);

// ============ 原版 FindFrame 分族帧引擎（1.4.5.6 Terarria1456/Terraria/NPC.cs:67295+） ============

/** TownNPCs 档案贴图条帧数取值口径（2026-08-13 两轮修正教训）：
 *  帧高逐表可变（人形族 54-64px、城镇史莱姆 670/678-684 仅 34-44px）→ 高/56 反推
 *  对史莱姆必错；唯一权威 = vanilla-npcs.json frames（=Main.npcFrameCount）。
 *  atlas.vnpcMeta 只覆盖 vanilla.json npcs 的 20 条特殊条目（46/49/67/74/299…,
 *  城镇 NPC 均不在其中）→ 必须回退 json frames,勿再 ??1（整条贴图走路根因） */
export function townSheetFrameCount(npcId: number): number {
  return VANILLA_NPCS[String(npcId)]?.frames ?? 1;
}
// 僵尸族 case 3（L77026）：腾空/逆向→帧2；站定→帧0；行走 counter+=|vx| 按 8/16/24/32 → 0,1,2,1 往复
const ZOMBIE_FRAME_TYPES = new Set([3, 52, 53, 132, 161, 186, 187, 188, 189, 200, 223, 251, 254, 255, 319, 320, 321, 331, 332, 342, 536, 590, 691]);
// 蝙蝠族 case 49（L75523→148 块 L75585）：每 6 tick 推进；49/51/60/634 循环到倒数第 2 帧（末帧=挂机姿势）
const BAT_SKIP_LAST = new Set([49, 51, 60, 634]);
// 旋转族 NPC（原版 npc.rotation 驱动绘制朝向；FindFrame 不做朝向翻转）：
// 35/68=骷髅王头/守卫、113-115=血肉墙/之眼/饥饿者、116=饥饿者 II(FindFrame case 116
//   rotation=atan2(vy,vx)，vx>0 再 FlipHorizontally——drawEnemy 独占分支自带翻转，
//   登记进 rotationDriven 以禁用通用 facing 镜像)、125/126=双子、127-131=Prime 头+四部件、
// 134-136=毁灭者链、261-265=世花族(孢子/本体/钩蔓/触须)、370=猪鲨、396/397=月总头/手、657=史莱姆皇后(飞行倾斜)
const ROTATION_NPC = new Set([35, 68, 113, 114, 115, 116, 125, 126, 127, 128, 129, 130, 131, 134, 135, 136, 246, 247, 248, 249, 261, 262, 263, 264, 265, 370, 396, 397, 657]);

// Main.wofDrawFrameIndex（Main.cs:820 静态；同屏只有一只血肉墙，模块级等价）。
// 原版在 DrawWOFBody 内自增（:37861-37863），bossAI_wof 未维护 → 渲染侧持有。
// 18 步循环、/6 换帧 = 3 帧各 6 步；gamePaused 冻结语义本仓无暂停态，恒推进（差异登记）
let wofDrawFrameIndex = 0;

/** 按原版 FindFrame 分族规则算当前帧 index（导出供 DebugReport tiles.focus.frameEngine 复算） */
export function vanillaFrameIdx(e: Enemy, frames: number): number {
  const id = e.vanillaId ?? 0;
  const ai = e.vanilla?.aiStyle ?? 0;
  const t = e.animT; // tick 计数（≈原版 frameCounter 驱动源）
  const walking = Math.abs(e.vx) > 0.05;
  // 僵尸族（L77049-77085）：行走 0,1,2,1 按 |vx| 累加；腾空=2；站定=0
  if (ZOMBIE_FRAME_TYPES.has(id)) {
    if (!e.onGround) return Math.min(2, frames - 1);
    if (!walking) return 0;
    const phase = (e.walkCycleT + Math.abs(e.vx) * 8) % 32; // 每 tick +|vx|，32 一循环
    return phase < 8 ? 0 : phase < 16 ? 1 : phase < 24 ? 2 : 1;
  }
  // 栖息态 NPC（秃鹫 61 cs:24082 ai[0]=0 栖息 / 宝箱怪 85 族 cs:25645 ai[0]=0 伪装）：
  // 静止帧 0；激活后从帧 1 起循环
  if (ai === 17 || ai === 25) {
    // FindFrame case 61(:74235-74255):vx==vy==0 → 帧0(栖息);飞行帧每 5 tick 推进
    // (:74247 num148=5),原版用 frameCounter(栖息清零)——全局 t 连续循环视觉等价
    if (e.vx === 0 && e.vy === 0) return 0;
    return frames > 1 ? 1 + Math.floor(t / 5) % (frames - 1) : 0;
  }
  // 爬墙蜘蛛族（FindFrame case 165/237/238/240/531, cs:73795-73817）：
  // frameCounter += (|vx|+|vy|)×0.5（531 ×0.4），24 一循环 4 帧
  if (ai === 40) {
    return Math.floor(((e.crawlT ?? 0) / 6)) % frames;
  }
  // 蜘蛛地面形态（FindFrame case 164/236/239/530, cs:73766-73783）：
  // 腾空 vy<0=帧4 / vy>0=帧0；行走 |vx|×1.1 累加 6 步进 0..3 循环
  if (id === 164 || id === 236 || id === 239 || id === 530) {
    if (!e.onGround) return e.vy < 0 ? Math.min(4, frames - 1) : 0;
    if (!walking) return 0;
    return Math.floor((e.walkCycleT * 1.1) / 6) % 4;
  }
  // 黄蜂族（FindFrame case 42，cs:75607-75633）：counter 每 tick+1，2 tick 一换，
  // 序列 0→1→2→1→回卷（8 tick 一循环）——翅膀对称拍动
  if (id === 42 || (id >= 231 && id <= 235)) {
    return [0, 1, 2, 1][Math.floor(t / 2) % 4];
  }
  // 蝙蝠族（case 49 块 cs:75523-75585）：每 6 tick 推进、回卷含帧 0
  // （cs:75577-75584 `if (frame.Y >= num*num305) frame.Y = 0`——此前 max(1,…) 跳过帧 0）
  if (ai === 14) {
    const cap = BAT_SKIP_LAST.has(id) ? frames - 1 : frames;
    return Math.min(frames - 1, Math.floor(t / 6) % Math.max(1, cap));
  }
  // 史莱姆（case 1, L71506）：每 8 tick 推进，全循环
  if (ai === 1) return Math.floor(t / 8) % frames;
  // 骷髅王头/手（case 35/36, L67378+）：仅 RedHatSkeletron（ai[3]==1 红帽变种）才切帧；
  // 常规骷髅王恒帧 0——此前走通用全循环会闪到表内"红帽骷髅"帧
  if (ai === 11 || ai === 12) return 0;
  // 城镇 NPC（aiStyle 7，FindFrame 城镇分支 cs:70159-70240）：腾空=1；
  // 站定帧（cs:70163-70181）：638 是 0-7 待机循环（4t 推进）、140/489=帧1、其余=帧0；
  // 行走帧 2..frames-extra-1 循环（frameCounter += |vx|*2+1，阈值 num109：
  // 632/534/638/656=12（489=8 且 counter 加 |vx|*1+0.5）、其余 6）
  if (ai === 7) {
    if (!e.onGround) return 1;
    if (!walking) {
      if (id === 638) return Math.min(7, Math.floor(t / 4) % Math.min(8, frames));
      if (id === 140 || id === 489) return Math.min(1, frames - 1);
      return 0;
    }
    const extra = townExtraFrames(id);
    const len = Math.max(1, frames - extra - 2);
    if (id === 489) return 2 + (Math.floor((e.walkCycleT + t * 0.5) / 8) % len);
    const step = id === 632 || id === 534 || id === 638 || id === 656 ? 12 : 6;
    return 2 + (Math.floor((e.walkCycleT * 2 + t) / step) % len);
  }
  // 战士族/107（L70155-70252）：站定=0；行走从帧 2 起按 |vx|*2+1 累加、>6 推进、循环回 2
  if (ai === 3 || ai === 26 || ai === 107) {
    if (!e.onGround) return frames - 1; // 腾空取末帧（原版 ai[0]==2 在 0/末帧间交替）
    if (!walking) return 0;
    const cycLen = Math.max(1, frames - 2);
    const step = Math.floor((e.walkCycleT * (Math.abs(e.vx) * 2 + 1)) / 6);
    return 2 + (step % cycLen);
  }
  // 游泳族（case 65 鲨鱼 L75386+）：frame = (counter/4) % 4
  if (ai === 16) return frames > 3 ? Math.floor(t / 4) % Math.min(4, frames) : Math.floor(t / 6) % frames;
  // 水母（case 63 L74621+）：追击脉冲循环 [4..6]，漂移循环 [0..]
  if (ai === 18) {
    const active = t % 90 < 30; // 脉冲周期近似
    if (active && frames > 6) return 4 + (Math.floor(t / 5) % 3);
    return Math.floor(t / 8) % Math.min(4, frames);
  }
  // 克苏鲁之眼(FindFrame case 4, cs:77607-77631):0/1/2 三帧眨眼各 7 tick,
  // ai[0]>1 帧偏移 +3(张嘴形态)——门取真 ai[0](Enemy.ai0):变身段一(ai0==1)仍闭嘴帧,
  // 段二(ai0==2)起张嘴(此前挂 phase>1,变身一起手就张嘴,早了 100t)
  if (id === 4) {
    const blink = Math.floor(t / 7) % 3;
    return Math.min(frames - 1, blink + (e.ai0 > 1 ? 3 : 0));
  }
  // 克苏鲁之脑（FindFrame case 266，cs:73215-73237）：frameCounter>6 推进
  // （7t/帧，cs:73216-73221）；一相（ai[0]>=0 且 localAI[2]==0）循环 0..3，
  // 二相 4..7（低于 4 抬到 4、越 7 回卷 4）——此前走末尾通用档全 8 帧连播
  if (id === 266) {
    const idx = Math.floor(t / 7) % 8;
    const phase2 = e.ai0 < 0 || e.lai2 !== 0;
    return phase2 ? Math.max(4, idx) : Math.min(3, idx);
  }
  // 克眼仆从(FindFrame case 5, cs:77633-77643):frameCounter 每 8t 推进一帧、
  // 越界回卷帧 0（此前走末尾通用 6t 档,快了 1/3）
  if (id === 5) {
    return Math.floor(t / 8) % frames;
  }
  // 训练假人 488（FindFrame case 488，cs:71516-71544）：摇晃动画帧由受击强度驱动——
  // num140 = 方向==-1 ? 4 : 6；帧 = ceil(shake/num140)（dir==1 再 +5）；shake 每帧 -1
  if (id === 488) {
    const dir = e.dummyHitDir;
    const step = dir === -1 ? 4 : 6;
    let idx = Math.ceil(e.dummyShake / step);
    if (idx > 0 && dir === 1) idx += 5;
    return Math.min(frames - 1, idx);
  }
  // 血肉墙 113/之眼 114（FindFrame case 113/114，cs:74214-74233）：ai[2]==0 时
  // frameCounter 每 12t 推进一帧、越 npcFrameCount(均 2) 回卷；ai[2]!=0 → 锁帧 0
  // 且 frameCounter=-60（回合结束后需再攒 72t 才回动画——无状态引擎近似为立即恢复，
  // 差异登记：113 的 ai[2] 是 Leech 放虫轮(bossAI_wof)，放虫期间嘴部定帧=原版吐虫姿势）
  if (id === 113 || id === 114) {
    if (e.ai2 !== 0) return 0;
    return Math.floor(t / 12) % Math.max(1, Math.min(2, frames));
  }
  // 饥饿者 115（FindFrame case 115，cs:75695-75712）：counter 先 +1 再比阈值
  // （1..15）：1-2→0 / 3-5→1 / 6-11→2 / 12-14→1，15 回卷——0→1→2→1 乒乓嚼动
  if (id === 115) {
    const p = (Math.floor(t) % 15) + 1;
    return p < 3 ? 0 : p < 6 ? 1 : p < 12 ? 2 : 1;
  }
  // 饥饿者 II 116（FindFrame case 116，cs:74789-74808）：counter 每 5t 推进、
  // 越 npcFrameCount(6) 回卷全帧；rotation=atan2(vy,vx)（vx<0 再 +π，drawEnemy
  // 独占分支）——此前落通用 6t 档（节奏差 20%）
  if (id === 116) {
    return Math.floor(t / 5) % Math.max(1, frames);
  }
  // 腐化者 133（FindFrame case 133，cs:74761-74788）：counter 1-7→0 / 8-15→1 /
  // 16→0 并回卷；血 <50% 帧 +2（狂暴形态——floatEyeAI rage 档的视觉面）
  if (id === 133) {
    const p = (Math.floor(t) % 16) + 1;
    return Math.min(frames - 1, (p >= 8 && p < 16 ? 1 : 0) + (e.hp < e.maxHp * 0.5 ? 2 : 0));
  }
  // 其余（眼/蜂群/幽灵/蠕虫段等）：每 6 tick 全循环
  return Math.floor(t / 6) % frames;
}

// ============ 2D 网格贴图 NPC 帧引擎（FindFrame 大 switch 专属 case，NPC.cs:67295+） ============
// 这些 NPC 的贴图是【cols×rows 二维网格】而非纵向帧条，通用 vnpc 竖切会把整行画出来
// （画错成多倍宽）。帧索引状态机按原版 FindFrame 逐 case 1:1，供 drawNpcGrid 切格。
// 状态 {counter,idx} 由 Renderer 持 WeakMap（每 draw 调用 = 每 tick 推进一次，
// 等价原版 FindFrame 每 update 调一次）。
export interface NpcGridFrameState { counter: number; idx: number }

/** 657 史莱姆皇后（FindFrame case 657，NPC.cs:67503-67614）。
 *  flag13 = life≤lifeMax/2（二段）；noGravity 为 AI 侧动态位，渲染层以
 *  `half && ai0==0`（二段待机=飞行，bossAI_lategame queenSlimeAI flying 同款判定）近似。
 *  - 上升（(half&&飞行) || vy<0）：一段 4→7 每 4t（半血转 22 进二段循环）；
 *    二段 20→23 每 5t 循环
 *  - 下降（vy>0）：8→10 每 8t，停 10
 *  - 落地（vy==0）：ai0==5 → 13/14/15 按 ai1/3%3；ai0==4 → 12/11/10 按 ai1/15；
 *    否则 0→3 每 6t 循环（若从空中来先 10→12 每 6t 再回 0）
 */
export function queenSlimeNextFrame(
  s: NpcGridFrameState, o: { half: boolean; flying: boolean; vy: number; ai0: number; ai1: number },
): number {
  let idx = s.idx;
  const rising = (o.half && o.flying) || o.vy < 0;
  if (rising) {
    if (idx < 20 || idx > 23) {
      if (idx < 4 || idx > 7) { idx = 4; s.counter = -1; }
      if (++s.counter >= 4) { s.counter = 0; idx++; if (idx >= 7) idx = o.half ? 22 : 7; }
    } else if (++s.counter >= 5) { s.counter = 0; idx++; if (idx >= 24) idx = 20; }
  } else if (o.vy > 0) {
    if (idx < 8 || idx > 10) { idx = 8; s.counter = -1; }
    if (++s.counter >= 8) { s.counter = 0; idx++; if (idx >= 10) idx = 10; }
  } else {
    if (o.ai0 === 5) {
      s.counter = 0;
      idx = [13, 14, 15][Math.trunc(o.ai1 / 3) % 3] ?? 13;
    } else if (o.ai0 === 4) {
      s.counter = 0;
      const k = Math.trunc(o.ai1 / 15);
      idx = k === 1 ? 11 : (k === 2 || k === 3) ? 10 : 12;
    } else {
      const fromAir = idx >= 10 && idx <= 12;
      const step = fromAir ? 6 : 10;
      if (!fromAir && idx >= 4) { idx = 0; s.counter = -1; }
      if (++s.counter >= step) {
        s.counter = 0;
        idx++;
        if ((!fromAir || idx === 13) && idx >= 4) idx = 0;
      }
    }
  }
  s.idx = idx;
  return idx;
}

/** 576/577 DD2 食人魔（FindFrame case 576/577，NPC.cs:68241-68380）。
 *  frame.Y 存的是【索引】（0..47）：ai0>0&&ai1==0 走路 11→20（持 4；13/19=8、14/18=2）；
 *  ai1==2 攻击 37→47（持 5；42=6、45=8、46=4、47=26、37/38=7；46&&vy!=0 或 38 不推进）；
 *  ai1==1 施法 21→38 持 5；默认：腾空=43、站定=0、行走 1..10 按 |vx| 累加（60 循环） */
export function dd2OgreNextFrame(
  s: NpcGridFrameState, o: { ai0: number; ai1: number; vx: number; vy: number },
): number {
  let idx = s.idx;
  if (o.ai0 > 0 && o.ai1 === 0) {
    if (idx < 11 || idx > 20) { idx = 11; s.counter = 0; }
    let hold = 4;
    if (idx === 13 || idx === 19) hold = 8;
    if (idx === 14 || idx === 18) hold = 2;
    if (++s.counter >= hold && idx < 20) { s.counter = 0; idx++; }
  } else if (o.ai0 > 0 && o.ai1 === 2) {
    if (idx < 37 || idx > 47) { idx = 39; s.counter = 0; }
    let hold = 5;
    if (idx === 42) hold = 6;
    if (idx === 45) hold = 8;
    if (idx === 46) hold = 4;
    if (idx === 47) hold = 26;
    if (idx === 37 || idx === 38) hold = 7;
    // flag12：46 腾空悬停 / 38 起手不推进（帧冻结）
    let advance = true;
    if (idx === 46 && o.vy !== 0) advance = false;
    if (idx === 38) advance = false;
    if (advance) s.counter++;
    if (s.counter >= hold) {
      if (idx < 47) { s.counter = 0; idx++; }
      else { idx = 37; s.counter = 0; }
    }
  } else if (o.ai0 > 0 && o.ai1 === 1) {
    if (idx < 21 || idx > 38) { idx = 21; s.counter = 0; }
    if (++s.counter >= 5 && idx < 38) { s.counter = 0; idx++; }
  } else {
    if (o.vy !== 0) { s.counter = 0; idx = 43; }
    else if (o.vx === 0) { s.counter = 0; idx = 0; }
    else {
      s.counter += Math.abs(o.vx);
      if (s.counter >= 60 || s.counter < 0) s.counter = 0;
      idx = 1 + Math.floor(s.counter / 6);
    }
  }
  s.idx = idx;
  return idx;
}

/** 696（FindFrame case 696，NPC.cs:67332-67388）：ai0==1 → 0..8 每 4t 循环；
 *  ai0==2 → 45..53 每 4t 循环；默认 9..17 每 10t 循环 */
export function npc696NextFrame(s: NpcGridFrameState, o: { ai0: number }): number {
  let idx = s.idx;
  if (o.ai0 === 1) {
    if (idx < 0 || idx >= 8) idx = 0;
    if (++s.counter >= 4) { s.counter = 0; if (++idx >= 8) idx = 0; }
  } else if (o.ai0 === 2) {
    if (idx < 45 || idx >= 53) idx = 45;
    if (++s.counter >= 4) { s.counter = 0; if (++idx >= 53) idx = 45; }
  } else {
    if (idx < 9 || idx >= 17) idx = 9;
    if (++s.counter >= 10) { s.counter = 0; if (++idx >= 17) idx = 9; }
  }
  s.idx = idx;
  return idx;
}

/** 564/565 等离子灯/暗黑魔法师（FindFrame case 564/565，NPC.cs:68657-69085）。
 *  原版是一长串 `if (frameCounter >= step*n) y3 = 帧` 阈值链——等价于每帧 step tick
 *  的定长序列循环（序列尾清 counter）。循环长度与施法时长对齐（97/127/183 → 98/128/184t）。
 *  - ai0>0&&ai1==0 暗影矢：[5,6,7,5,6,7,5,6,7,8,9,10,11,12] 每 7t
 *  - ai0>0&&ai1==1 治疗：[13,14,15,16,17,18,19,20,18,19,20,21,22,23,24,25] 每 8t
 *  - ai0>0&&ai1==2 召骷髅：[26,27,28,29,26,27,28,29,26,27,28,29,30..40] 每 8t
 *  - 默认漂浮：counter += |v|*0.1+1（钳 0..40），帧 0..4 每 8t */
const DARK_MAGE_CAST_SEQ: Record<number, number[]> = {
  0: [5, 6, 7, 5, 6, 7, 5, 6, 7, 8, 9, 10, 11, 12],
  1: [13, 14, 15, 16, 17, 18, 19, 20, 18, 19, 20, 21, 22, 23, 24, 25],
  2: [26, 27, 28, 29, 26, 27, 28, 29, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
};
export function darkMageNextFrame(
  s: NpcGridFrameState, o: { ai0: number; ai1: number; speed: number },
): number {
  let idx = s.idx;
  const seq = o.ai0 > 0 ? DARK_MAGE_CAST_SEQ[o.ai1] : undefined;
  if (seq) {
    const per = o.ai1 === 0 ? 7 : 8;
    // 入段越界（idx 不在本招帧区）→ 清 counter 重放（原版 if (y3<min||y3>max) frameCounter=0）
    if (idx < seq[0] || idx > seq[seq.length - 1]) s.counter = 0;
    if (++s.counter >= per * seq.length) s.counter = 0;
    idx = seq[Math.min(seq.length - 1, Math.floor(s.counter / per))];
  } else {
    s.counter = s.counter + o.speed * 0.1 + 1;
    if (s.counter >= 40 || s.counter < 0) s.counter = 0;
    idx = Math.floor(s.counter / 8);
  }
  s.idx = idx;
  return idx;
}

/** 668 鹿角怪（FindFrame case 668，NPC.cs:67390-67501 + :6516-6534 序列表）。
 *  ai0==1/4 → 攻击 1 表（范围重置 12..17）；ai0==2 → 攻击 2 表（12..18）；
 *  ai0∈{3,5,7,8} → 攻击 3 表（19..24）；每 4t 走一格、FindFrame_FromSequence 钳末帧。
 *  默认：vy>0（或 localAI[0]==1，未移植略）→ 帧 1；vx==0 → 帧 0；
 *  行走 counter += |vx|（钳 150）、帧 = 2+counter/15（2..11） */
const DEERCLOPS_ATK1_FRAMES = [12, 13, 14, 13, 14, 13, 14, 13, 14, 15, 16, 17];
const DEERCLOPS_ATK2_FRAMES = [12, 15, 16, 17, 17, 17, 17, 13, 18, 18, 18, 18, 12];
const DEERCLOPS_ATK3_FRAMES = [19, 20, 21, 22, 21, 22, 21, 22, 23, 24, 23, 24, 23, 24, 20, 19];
export function deerclopsNextFrame(
  s: NpcGridFrameState, o: { ai0: number; vx: number; vy: number },
): number {
  let idx = s.idx;
  // 各攻击段入段越界范围（原版 num194/num195 等显式常量，非表尾值——攻击 2 表
  // 尾是 12、攻击 3 表尾是 19，按表尾判会误清 counter 造成 12,15,12,15 抖动）
  const atk = o.ai0 === 1 || o.ai0 === 4 ? { seq: DEERCLOPS_ATK1_FRAMES, lo: 12, hi: 17 }
    : o.ai0 === 2 ? { seq: DEERCLOPS_ATK2_FRAMES, lo: 12, hi: 18 }
      : o.ai0 === 3 || o.ai0 === 5 || o.ai0 === 7 || o.ai0 === 8 ? { seq: DEERCLOPS_ATK3_FRAMES, lo: 19, hi: 24 }
        : null;
  if (atk) {
    if (idx < atk.lo || idx > atk.hi) { idx = atk.lo; s.counter = 0; }
    s.counter++;
    idx = atk.seq[Math.min(atk.seq.length - 1, Math.floor(s.counter / 4))];
  } else if (o.vy > 0) {
    s.counter = 0;
    idx = 1;
  } else if (o.vx === 0) {
    s.counter = 0;
    idx = 0;
  } else {
    s.counter += Math.abs(o.vx);
    if (s.counter >= 150 || s.counter < 0) s.counter = 0;
    idx = 2 + Math.floor(s.counter / 15);
  }
  s.idx = idx;
  return idx;
}

/** 飘字。数字类 1:1 CombatText.cs（spawn: NewText:59-121 / update: Update:131-206）:
 *  vy 普通恒 -7/t、暴击 -14/t、dot -4/t;life 60/120/40;scale 从 0 每 t+0.1 长到 1
 *  （dot +0.5 封顶 0.8）;alpha 0.6~1 闪烁;寿命归零后 scale 收缩至 0.1 消亡。
 *  label 类（物品名）不走原版链,保持旧轨迹,新字段可缺省 */
export interface DamageNumber {
  x: number; y: number; vy: number; value: number; crit: boolean; color: string; life: number;
  label?: string;
  /** 水平漂移（暴击 NewText ±1.25）;缺省 0 */
  vx?: number;
  /** dot 飘字（HurtLifeRegen/中毒族 DoT:更小更短,带重力） */
  dot?: boolean;
  /** 字号缩放（NewText scale=0 起,Update 每 t+0.1/0.5）;缺省 1=恒定 */
  scale?: number;
  /** 闪烁 alpha 0.6~1（Update ±0.05/t）;缺省 1 */
  alpha?: number;
  alphaDir?: number;
  /** 暴击旋转（NewText 0.12rad 起,Update ±0.001/t 漂移） */
  rotation?: number;
}

/** 小地图恒忽略油漆的墙集（MapHelper.GetWallType :1993-2005：21/88-93/168/241）。
 *  这些是自带渐变/特殊贴图的墙（天然/地牢分段墙族），原版在地图上不吃漆 */
const MAP_WALL_NO_PAINT = new Set([21, 88, 89, 90, 91, 92, 93, 168, 241]);

/** 小地图恒忽略油漆的 tile sheet（MapHelper.GetTileType :1965-1968：num==160 → newColor=0） */
const MAP_TILE_NO_PAINT_SHEET = 160;

/** 内部 tile id → 原版 sheet（redrawAll 热循环直查；-1 = 无映射） */
const TILE_SHEET_OF: Readonly<Int16Array> = (() => {
  const a = new Int16Array(TILE_DEFS.length);
  for (let i = 0; i < TILE_DEFS.length; i++) a[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
  return a;
})();

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirtyChunks = new Set<number>();
  constructor(public world: World) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.w;
    this.canvas.height = world.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.redrawAll();
    world.store.onTileChanged((x, y) => {
      this.dirtyChunks.add(ChunkCache.key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    });
  }

  /** 释放全幅小地图画布(6400×1800 ≈ 46MB;退出世界时调用防累积) */
  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.dirtyChunks.clear();
  }

  colorFor(x: number, y: number): string | null {
    const st = this.world.store;
    const i = st.idx(x, y);
    const hex = (c: ReadonlyArray<number>): string => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
    // MapHelper.MapColor（:1812-1863）油漆换色：先取基础色，paint>0 时按漆调制。
    // 豁免表：tile sheet 160 恒忽略漆（:1965-1968）；墙 21/88-93/168/241 恒忽略（:1993-2005）
    const paintTile = (rgb: ReadonlyArray<number>): ReadonlyArray<number> => {
      const p = st.paint[i];
      const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
      if (p > 0 && sheet !== MAP_TILE_NO_PAINT_SHEET) return mapPaintColor(false, [rgb[0], rgb[1], rgb[2]], p);
      return rgb;
    };
    const paintWall = (rgb: ReadonlyArray<number>): ReadonlyArray<number> => {
      const p = st.paintWall[i];
      if (p > 0 && !MAP_WALL_NO_PAINT.has(st.wall[i])) return mapPaintColor(true, [rgb[0], rgb[1], rgb[2]], p);
      return rgb;
    };
    if (st.flags[i] && st.type[i] !== 0) {
      // 自研像素方块（F2 图片导入）：RGB 编码在 frameX/Y——与 redrawAll 的
      // PIXEL_ART_TILE 分支同公式。增量路径（flushDirty→colorFor）此前漏掉此分支，
      // 放置后小地图仍显泥土色，须存档重载走全量重建才恢复原色
      if (st.type[i] === PIXEL_ART_TILE) {
        const r = (st.frameX[i] >> 8) & 255, g = st.frameX[i] & 255, b = st.frameY[i] & 255;
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
      }
      const d = TILE_DEFS[st.type[i]];
      if (d?.vanilla?.sheet !== undefined) {
        const vc = vanillaTileMapColor(d.vanilla.sheet);
        if (vc) return hex(paintTile(vc));
      }
      return d ? d.mapColor : '#808080';
    }
    // 液体四色（原版 array3：水9,61,191/岩浆253,32,3/蜂蜜254,194,20/微光161,127,255）
    if (st.liquid[i] > 32) {
      const lt = st.liquidType[i];
      return hex(vanillaLiquidColor(lt >= 1 && lt <= 4 ? lt - 1 : 0));
    }
    if (st.wall[i] !== 0) {
      const vc = vanillaWallMapColor(st.wall[i]);
      if (vc) return hex(paintWall(vc));
      const mc = WALL_DEFS[st.wall[i]]?.mapColor;
      if (mc) {
        // 画布回落色 '#RRGGBB' → 数组过油漆（legacy 自定义墙，MapColor :1854 默认分支）
        const v = parseInt(mc.slice(1), 16);
        return hex(paintWall([(v >> 16) & 255, (v >> 8) & 255, v & 255]));
      }
      return '#2E2E2E';
    }
    // 背景：天空渐变（y<世界面）/ 土层底 / 石层底（MapHelper GetBackgroundType）
    if (y < Math.max(1, this.world.groundLevel)) return hex(vanillaSkyColor(y, Math.max(1, this.world.groundLevel)));
    if (y < Math.max(1, this.world.rockLevel)) return hex(VANILLA_DIRT_BG);
    return hex(VANILLA_ROCK_BG);
  }

  redrawAll() {
    // 性能（2026-08-10，trace 实测 redrawAll 占 1.7s CPU/次进世界）：旧版每格走
    // colorFor 字符串分配 + parseInt（1150 万格 ≈ 秒级冻结 + GC 压力）。改为
    // 类型/墙 id 数值 LUT + Uint32 直写（小端 ABGR 打包），纯数组循环 ~50ms 级
    const { world, ctx } = this;
    const st = world.store;
    if (!this._mapLUT || this._mapLUT.tiles.length < TILE_DEFS.length) {
      const parse = (hex: string): number => {
        const v = parseInt(hex.slice(1), 16);
        return 0xff000000 | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); // 小端 ABGR
      };
      const rgb = (c: number[]): number => 0xff000000 | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255); // 小端：bits16=B（同 parse）
      // 原版地图色全表（MapHelper.cs Initialize → vanilla-mapcolors.json）：
      // tile 按 vanilla.sheet 查原版色；legacy def 回落 mapColor
      const tiles = new Uint32Array(Math.max(64, TILE_DEFS.length));
      tiles.fill(parse('#808080'));
      for (let id = 0; id < TILE_DEFS.length; id++) {
        const d = TILE_DEFS[id];
        if (!d) continue;
        const sheet = d.vanilla?.sheet;
        if (sheet !== undefined) {
          const vc = vanillaTileMapColor(sheet);
          if (vc) { tiles[id] = rgb(vc); continue; }
        }
        if (d.mapColor) tiles[id] = parse(d.mapColor);
      }
      // 墙：vanilla id 直查原版表（墙注册表即原版 id 序）；回落 def.mapColor
      const walls = new Uint32Array(Math.max(64, WALL_DEFS.length));
      walls.fill(parse('#2E2E2E'));
      for (let id = 0; id < WALL_DEFS.length; id++) {
        const vc = vanillaWallMapColor(id);
        if (vc) { walls[id] = rgb(vc); continue; }
        if (WALL_DEFS[id]?.mapColor) walls[id] = parse(WALL_DEFS[id].mapColor);
      }
      // 液体四色（我们编码 1水2岩浆3蜂蜜4微光 → 原版索引 0/1/2/3）
      const liq = new Uint32Array(5);
      liq[0] = parse('#000000');
      liq[1] = rgb(vanillaLiquidColor(0)); liq[2] = rgb(vanillaLiquidColor(1));
      liq[3] = rgb(vanillaLiquidColor(2)); liq[4] = rgb(vanillaLiquidColor(3));
      this._mapLUT = { tiles, walls, liq, dirtBg: rgb(VANILLA_DIRT_BG), rockBg: rgb(VANILLA_ROCK_BG) };
    }
    const lut = this._mapLUT;
    const img = ctx.createImageData(world.w, world.h);
    const buf = new Uint32Array(img.data.buffer);
    const { type, wall, liquid, liquidType, frameX, frameY, paint, paintWall } = st;
    const surf = Math.max(1, world.groundLevel), rock = Math.max(surf + 1, world.rockLevel);
    // MapHelper.GetMapTileXnaColor（:1865-1882）：colorLookup[type] 后过 MapColor 换漆。
    // ABGR 打包直算（热循环零分配）：默认分支 = paintColor × max(r,g,b)（:1854-1861）
    const mapPaintPacked = (packed: number, colorType: number, isWall: boolean): number => {
      const r = packed & 255, g = (packed >>> 8) & 255, b = (packed >>> 16) & 255;
      if (colorType === 29) { // ShadowPaint :1832-1839（num3 = 两次交换后的中位通道）
        let n = r / 255, n2 = g / 255, n3 = b / 255;
        if (n2 > n) { const t = n; n = n2; n2 = t; }
        if (n3 > n) { const t = n; n = n3; n3 = t; }
        const sc = n3 * 0.3;
        const c = PAINT_RGB[colorType];
        const nr = (c[0] * sc) | 0, ng = (c[1] * sc) | 0, nb = (c[2] * sc) | 0;
        return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
      }
      if (colorType === 30) { // NegativePaint :1840-1853（墙半幅反转）
        if (isWall) {
          const nr = ((255 - r) * 0.5) | 0, ng = ((255 - g) * 0.5) | 0, nb = ((255 - b) * 0.5) | 0;
          return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
        }
        const nr = 255 - r, ng = 255 - g, nb = 255 - b;
        return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
      }
      const n6 = Math.max(r, g, b) / 255; // :1856 num = 最大通道
      const c = PAINT_RGB[colorType];
      const nr = (c[0] * n6) | 0, ng = (c[1] * n6) | 0, nb = (c[2] * n6) | 0;
      return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
    };
    for (let y = 0; y < world.h; y++) {
      // 背景（无 tile/液体/墙）：天空渐变（y<世界面，CalcSkyGradient lerp）/ 土层底 / 石层底
      const skyC = vanillaSkyColor(y, surf);
      const bg = y < surf ? (0xff000000 | ((skyC[2] & 255) << 16) | ((skyC[1] & 255) << 8) | (skyC[0] & 255))
        : y < rock ? lut.dirtBg : lut.rockBg;
      for (let x = 0; x < world.w; x++) {
        const i = y * world.w + x;
        const t = type[i];
        if (t !== 0) {
          // 自研像素方块（F2 图片导入）：RGB 编码在 frameX/Y（r<<8|g, b，0→1 兜底）——
          // 小地图按原像素色显示，此前走 sheet:0 泥土色恒为 #976B4B
          if (t === PIXEL_ART_TILE) {
            const r = frameX[i] >> 8, g = frameX[i] & 255, b = frameY[i];
            buf[i] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
            continue;
          }
          let c = lut.tiles[t] ?? lut.tiles[0];
          // GetTileType :1962-1972：sheet 160 恒 newColor=0（不吃漆）
          if (paint[i] > 0 && TILE_SHEET_OF[t] !== MAP_TILE_NO_PAINT_SHEET) {
            c = mapPaintPacked(c, paint[i], false);
          }
          buf[i] = c; continue;
        }
        if (liquid[i] > 32) {
          const lt = liquidType[i];
          buf[i] = lut.liq[lt >= 1 && lt <= 4 ? lt : 1];
          continue;
        }
        const wl = wall[i];
        if (wl !== 0) {
          let c = lut.walls[wl] ?? lut.walls[0];
          // GetWallType :1993-2005：墙 21/88-93/168/241 恒 newColor=0（不吃漆）
          if (paintWall[i] > 0 && !MAP_WALL_NO_PAINT.has(wl)) {
            c = mapPaintPacked(c, paintWall[i], true);
          }
          buf[i] = c;
        } else {
          buf[i] = bg;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dirtyChunks.clear();
  }
  /** redrawAll 用的颜色 LUT（tile/wall id → ABGR） */
  private _mapLUT: { tiles: Uint32Array; walls: Uint32Array; liq: Uint32Array; dirtBg: number; rockBg: number } | null = null;

  flushDirty() {
    if (this.dirtyChunks.size === 0) return;
    const st = this.world.store;
    let n = 0;
    for (const k of this.dirtyChunks) {
      if (n++ > 24) break;
      this.dirtyChunks.delete(k);
      const cx = (k & 0xffff) << 16 >> 16, cy = (k >> 16) << 16 >> 16;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      for (let y = y0; y < y0 + CHUNK; y++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          if (!st.inBounds(x, y)) continue;
          const c = this.colorFor(x, y);
          this.ctx.fillStyle = c ?? '#000';
          this.ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}

export class Renderer {
  /** 调试面板开关（F3 切换）：碰撞盒高亮等 */
  debugMode = false;
  /** 方块标注（F5 标注模式）：标记的问题方块，非空时叠加绘制 */
  annotateMarks: Array<{ x: number; y: number }> | null = null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sky = new SkyRenderer();
  /** 天气渲染器（雨/沙尘；Game.afterWorldLoad 时 attach，destroy 时 detach） */
  weatherFx = new WeatherRenderer();
  /** weatherFx 已 attach（避免每帧空调用开销） */
  weatherFxActive = false;
  /** MoonLordShake 滤镜态（Main.cs:64437-64447：月总倒计时>0 时激活，
   *  强度 num5 = clamp(sin(cd/60×0.5)×2,0,1) × (0.75−0.5×cd/Max)；Game 每帧注入，null=未激活）。
   *  原版为 FilterMoonLordShake 屏幕后处理（以激活点=玩家为靶心的红色扰动）；
   *  canvas 2D 以「靶心径向红晕 + 呼吸脉冲」近似（drawMoonLordShake） */
  moonLordShake: { t: number; x: number; y: number } | null = null;
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  minimap: Minimap | null = null;
  /** 原版瀑布贴图系统（WaterfallManager 移植）：液体倾泻的长条水流柱 */
  waterfalls = new WaterfallRenderer();
  /** 信息饰品显示列(DrawInfoAccs 移植;数据组装在 Game,绘制在此) */
  infoAccs = new InfoAccsLayer();
  /** Game 每帧注入的信息行数据(InfoAccCtx;null=未注入不画) */
  infoAccCtx: InfoAccCtx | null = null;
  /** 信息列悬停行(-1 无;交互在 Game) */
  infoAccHover = -1;
  /** 原版群系/地下背景（DrawBG/DrawBackground 移植）；场景数据由 Game 每帧注入 */
  biomeBg = new BiomeBackground();
  /** 原版生命/魔力资源条（ClassicPlayerResourcesDisplaySet 移植）——按当前样式
   *  懒构造二选一(此前两个实例同时构造 = 15 张 UI 贴图急载,另一套样式永远不用) */
  private _resourceBars: VanillaResourceBars | null = null;
  private _fancyBars: FancyResourceBars | null = null;
  get resourceBars(): VanillaResourceBars { return this._resourceBars ?? (this._resourceBars = new VanillaResourceBars()); }
  get fancyBars(): FancyResourceBars { return this._fancyBars ?? (this._fancyBars = new FancyResourceBars()); }
  /** 原版呼吸计（DrawInterface_Resources_Breath 移植：玩家头顶 10 气泡/火焰条） */
  breathMeter = new VanillaBreathMeter();
  /** 背包是否打开（Main.playerInventory 语义——Game.render 经 __swUI 注入） */
  playerInventory = false;
  /** 天塔柱族全屏滤镜（SceneMetrics 视区扫描 + SceneState/FilterManager 状态机；
   *  本帧器件态见 monoScan） */
  readonly monoFilters = new MonolithFilters();
  /** 本帧天塔柱扫描结果（SceneMetrics.ScanOnScreenTiles :524-583；render() 每帧刷新） */
  monoScan: MonolithSceneState = emptyMonolithScene();
  private _monoFrameMs = 0;
  scene: SceneFlags | null = null;

  // 全屏地图查看器状态（zoom 向 zoomTarget 缓动；缓动期间按锚点补偿 pan）
  fullMap = {
    open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0,
    anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0,
  };

  /** 已放置传送晶塔（Game.refreshPylons 写入；地图图标层 TeleportPylonsMapLayer） */
  pylons: Array<{ x: number; y: number; type: number }> = [];
  /** 右键晶塔时的"当前塔"锚点（Main.MapPylonTile，连线起点；null=非晶塔会话） */
  mapPylonTile: { x: number; y: number } | null = null;
  /** 地图悬停晶塔的物品名（本帧；null=未悬停）——原版地图层 text 提示位 */
  pylonHoverName: string | null = null;

  /** 全屏地图缩放：以鼠标位置为锚点（鼠标下的地图点不动，不乱飞） */
  zoomFullMapAt(newZoom: number, mouseX: number, mouseY: number) {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const clamped = Math.max(0.5, Math.min(6, newZoom));
    // 记录锚点：鼠标下的地图源坐标 + 鼠标屏幕位置。
    // 缓动期间每帧按公式 pan = anchorMX - viewW/2 + W*zoom/2 - u*zoom 重解，
    // 保证缓动全程锚点不动（否则缓动中 pan 固定会让地图"自己跑"）
    const cx0 = viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX;
    const cy0 = viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY;
    fm.anchorU = (mouseX - cx0) / fm.zoom;
    fm.anchorV = (mouseY - cy0) / fm.zoom;
    fm.anchorMX = mouseX;
    fm.anchorMY = mouseY;
    fm.zoomTarget = clamped;
    this.applyMapAnchor();
  }

  /** 按锚点反解 pan（当前 zoom 下鼠标处的地图点固定在鼠标下） */
  private applyMapAnchor() {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    fm.panX = fm.anchorMX - viewW / 2 + (this._fmWorldW * fm.zoom) / 2 - fm.anchorU * fm.zoom;
    fm.panY = fm.anchorMY - viewH / 2 + (this._fmWorldH * fm.zoom) / 2 - fm.anchorV * fm.zoom;
  }

  /** 每帧缓动 fullMap.zoom → zoomTarget；缓动期间同步按锚点补偿 pan */
  easeFullMap() {
    const fm = this.fullMap;
    const diff = fm.zoomTarget - fm.zoom;
    if (Math.abs(diff) < 0.002) { fm.zoom = fm.zoomTarget; return; }
    fm.zoom += diff * 0.16;
    this.applyMapAnchor();
  }
  private _fmWorldW = 0;
  private _fmWorldH = 0;
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  private mapDragging = false;
  private lastMouse = { x: 0, y: 0 };

  /** resize 监听句柄(destroy 必须移除——window 强引用曾把旧 Game 整图钉死不释放) */
  private onResize = () => this.resize();

  constructor(public assets: AssetBundle, public atlas: SpriteAtlas | null = null) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /** 释放本实例全部画布与全局监听(退出世界时 Game.destroy 调用)。
   *  主画布/lightCanvas/迷雾全幅画布立即清零背板;不移除 resize 监听则
   *  window 强引用导致整个旧 Game(含 ChunkCache 数百张 chunk 画布)无法回收,
   *  连续多次读档累积显存 → contextlost 风暴(2026-08-10 trace 实证) */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.canvas.width = 0; this.canvas.height = 0;
    this.lightCanvas.width = 0; this.lightCanvas.height = 0;
    if (this.fogCanvas) { this.fogCanvas.width = 0; this.fogCanvas.height = 0; this.fogCanvas = null; }
    this.minimap?.dispose();
    this.minimap = null;
  }

  /** 物品图标：优先 Maples 素材，缺省回退程序化 */
  itemIcon(id: number): HTMLCanvasElement | null {
    return this.assets.itemIcons.get(id) ?? null;
  }

  /** Maples 图标绘制矩形（找不到返回 null）。
   *  物品贴图动画(Main.InitializeItemAnimations :3685-3722):竖排多帧条
   *  按渲染时钟切片——坠星 75 等此前整条入画(22×208 九帧全画)即此修 */
  atlasIcon(id: number) {
    if (!this.atlas) return null;
    const def = ITEM_DEFS[id];
    if (!def) return null;
    const ar = atlasIconForKey(this.atlas, def.key);
    if (!ar) return null;
    const vid = /^vi_(\d+)_/.exec(def.key);
    if (vid) return sliceItemAnimFrame(Number(vid[1]), ar, this.animTick);
    return ar;
  }
  /** 渲染时钟(60t/s 等效,供物品动画取帧;Vanilla Star.NightSetup 无关) */
  animTick = 0;

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.canvas);
  }

  private _mouseX = 0;
  private _mouseY = 0;
  private _mouseDown = false;

  render(
    cam: Camera, world: World, clock: Clock,
    chunks: ChunkCache,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    lightRX: number, lightRY: number, lightRW: number, lightRH: number,
    player: Player, entities: Entity[],
    particles: Particle[], dmgNumbers: DamageNumber[],
    swing: { t: number; dur: number; item: number } | null,
    hover: HoverTarget | null,
    boss: { name: string; hp: number; maxHp: number; cx: number; cy: number } | null,
    mouseX = 0, mouseY = 0, mouseDown = false,
    mineProgress = 0,
    flicker: FlickerClock | null = null,
    remotePlayers: Player[] = [],
    invasion: { name: string; pct: number; label?: string } | null = null,
  ) {
    this.animTick++;
    this._mouseX = mouseX;
    this.remotePlayers = remotePlayers;
    this.mainPlayer = player;   // 克脑镜像（Main.cs:24799-24843 以玩家中心镜像）等取用
    this._mouseY = mouseY;
    this._mouseDown = mouseDown;
    this._liquidNow = performance.now(); // 帧 first thing 采样：背景水/瀑布/前景水共用同一时刻
    // 渲染共享态(chunk 烘焙的风摆/风门读取):风速 + worldSurface
    renderEnv.wind = world.weather?.windSpeedCurrent ?? 0;
    renderEnv.worldSurface = world.groundLevel;
    const ctx = this.ctx;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    cam.viewW = viewW; cam.viewH = viewH;
    cam.tickPunch();   // PunchCameraModifier 冲击位移衰减（鹿角怪等震屏源）
    const z = cam.zoom;

    // 0. 天塔柱族：视区扫描（Main.cs:61983-61990 GetAreaToLight+Inflate(28) →
    //    SceneMetrics.ScanOnScreenTiles :524-583）+ 滤镜状态机（SceneState.cs:105-128）
    const clock0 = world.clock;
    this.monoScan = scanMonolithScene(world.store, visualScanRect(
      cam.x, cam.y, viewW, viewH, z, world.store.w, world.store.h));
    this.monoFilters.update(this._liquidNow - (this._monoFrameMs || this._liquidNow), this.monoScan, {
      worldSurface: world.groundLevel,
      rockLevel: world.rockLevel,
      screenTileY: cam.y / TILE,
      dayTime: clock0 ? clock0.isDay : true,
      // 映射到原版 24h 表盘（Utils.GetDayTimeAs24FloatStartingFromMidnight :738-745）：
      // 我方黎明 timeOfDay=0.25 ↔ 4.5h；取模防午夜负值
      hour24: ((((clock0 ? clock0.timeOfDay : 0.5) - 0.25) % 1 + 1) % 1) * 24 + 4.5,
      nightElapsed01: (((clock0 ? clock0.timeOfDay : 0) - 0.8125) % 1 + 1) % 1,
      fullMoon: clock0?.moonPhase === 0,
      worldBloodMoon: !!clock0?.bloodMoon,
      cloudAlpha: world.weather?.cloudAlpha ?? 0,
      // Main.GraveyardVisualIntensity（SceneState.cs:124 墓地雾激活门）：Game 侧
      // updateWeather 每帧把平滑值写入 weather.graveyardVisual。
      // 注：原版 TileDrawing.cs:2752-2777 另有"墓碑灵魂火苗"块（typeCache==85 且
      // GraveyardVisualIntensity>0 → GetTileFlameData 火苗叠加），但 GetTileFlameData
      // （:1873-1925）switch 只覆盖 270/271/581，default 走 Main.tileFlame[type]——
      // Main.cs:9210-9222 的 tileFlame 表无 85 → flameCount=0，循环零次 = **原版死
      // 代码**（1.4.5.6 实测不渲染任何火苗），无物可移植，勿再登记
      graveyardIntensity: world.weather?.graveyardVisual ?? 0,
    });
    this._monoFrameMs = this._liquidNow;

    this.updateWaterStyle(world, cam);
    this.easeFullMap();

    // 1. 天空（器件态注入：天塔柱滤镜类型 / 派对气球门 / 地表线 / 世界尺寸 +
    //    AmbientSky 天空实体判定输入）
    this.sky.fx = {
      monolith: this.monoScan.activeMonolithType,
      party: !!this.scene?.partyUp,
      surfaceY: world.groundLevel * TILE,
      worldW: world.w,
      worldH: world.h,
      // 事件月亮(Main.cs:62400-62408):0 无 / 1 霜月 / 2 南瓜月
      moonEventKind: (world.moonEvent?.kind ?? 0) as 0 | 1 | 2,
    };
    // AmbientSky 选族输入（AmbienceServer.cs:30-55/190-193：晴天→鸟群 / 平静夜+神圣→腹足怪）
    this.sky.amb = {
      dayTime: clock.isDay,
      raining: (world.weather?.cloudAlpha ?? 0) > 0,   // Main.IsItRaining（Main.cs:2659）
      eclipse: clock.eclipse,
      bloodMoon: clock.bloodMoon,
      moonEventKind: (world.moonEvent?.kind ?? 0) as 0 | 1 | 2,
      zoneHallow: !!this.scene?.zoneHallow,
      playerX: player.cx,
      playerY: player.cy,
    };
    // 天空深化批帧数据挂点（月塔近距门/月总死亡戏剧/稀有云旗标/环境族 zone 门/涟漪采样）
    this.sky.frameCtx = { entities, world, scene: this.scene, player, clock, camX: cam.x, camY: cam.y, z, viewW, viewH };
    this.sky.draw(ctx, clock, viewW, viewH, cam.x, 16.7, cam.y);

    // 1.5 世界背景图（原版 DrawBG：地表群系视差层 + 地下分层；天空之后、tile 之前）
    if (this.scene) {
      // 昼夜色调（≈ColorOfTheSkies：白天白、夜晚压暗偏蓝、晨昏暖色）
      const df = clock.dayFactor;
      const t = clock.timeOfDay;
      let tr = 1, tg = 1, tb = 1;
      if (df < 1) {
        const dusk = t > 0.68 && t < 0.82 ? 1 - Math.abs(t - 0.75) / 0.07 : t > 0.18 && t < 0.32 ? 1 - Math.abs(t - 0.25) / 0.07 : 0;
        const night = 1 - df;
        tr = 1 - 0.70 * night + 0.10 * dusk;
        tg = 1 - 0.66 * night - 0.22 * dusk;
        tb = 1 - 0.50 * night - 0.40 * dusk;
      }
      this.biomeBg.draw(ctx, world, this.scene, cam, viewW, viewH, [tr, tg, tb], 16.7);
    }

    // 1.55 AmbientSky 天空实体（SkyManager「Ambience」层：群系背景之上、世界实体之下；
    //     鸟群/夜空腹足怪，调度 1:1 AmbienceServer——10-120s 一次尝试）
    this.sky.drawAmbience(ctx, viewW, viewH, cam.x, cam.y, 16.7);
    // 1.6 天塔柱滤镜：原"天空层子集近似"已上移为全屏后处理（步骤 7d，
    //     SceneState → Filters.Scene["Monolith*"] 整屏合成语义 1:1）

    ctx.save();
    // 世界变换：平移 + 缩放（以屏幕中心为相机中心）
    // 像素风关键：tile/实体用最近邻采样保持锐利（光照层单独用平滑）
    // ★像素吸附：相机坐标吸附到 1/zoom 网格——整数世界坐标(全部 chunk/tile 绘制位)
    // 变换后精确落在整数 canvas 像素。浮点相机 + 非整数 zoom(默认 1.25)下,相邻
    // chunk 各自独立光栅化会在接缝处产生 1px 缺口(每 256 世界 px 一条发丝缝,
    // 2026-08-10 实证);吸附后相机以 z 像素步进,像素风反而更稳
    ctx.imageSmoothingEnabled = false;
    const camRX = Math.round(cam.x * z) / z;
    const camRY = Math.round(cam.y * z) / z;
    ctx.translate(Math.round(viewW / 2), Math.round(viewH / 2));
    ctx.scale(z, z);
    ctx.translate(-camRX, -camRY);

    // 2. chunks 绘制序列（对照原版 Main.cs 帧序：背景水 → 墙 → 方块 → 瀑布 → 实体 → 前景水）
    const ts = TILE;
    const x0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * ts)) - 1;
    const x1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * ts)) + 1;
    const y0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * ts)) - 1;
    const y1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * ts)) + 1;
    const chunkVisible = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx * CHUNK < world.w && cy * CHUNK < world.h;
    // 2a. 液体背景 pass（原版 backWaterTarget 先于墙合成，Main.cs:46619）：
    //     不透明水画在墙/方块之前——方块贴图透明像素处露出这层水 = 浸润，
    //     有墙的水格由墙盖住、只留前景 0.6 层 → 墙在水中可见
    this.drawLiquids(world, cam, viewW, viewH, z, true);

    // 2b. 背景墙层(+1 canvas px 保险重叠:相邻 chunk 独立光栅化接缝的兜底,
    //      nearest 采样下重叠=复制边缘像素,视觉无感)
    const over = 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).wall, cx * CHUNK * ts, cy * CHUNK * ts, CHUNK * ts + over, CHUNK * ts + over);
      }
    }

    // 2b'. behindTiles 族实体（Main.cs:56457 DrawNPCs(behindTiles:true)：原版在
    //      非实心 tile(:56437/:56441) 之后、实心 tile(:56462/:56466) 之前绘制——钻地蠕虫族
    //      （aiStyle6 世吞 13-15/掘地虫 39-41/挖掘怪 95-100/水蛭 117-119/
    //      沙虫 510-515 等，数据源 vanilla-npcs.json behindTiles）被前景 tile 盖住。
    //      本仓 tile 是单一烘焙层（不拆 solid/non-solid）→ 等价画在 tile 层之前、
    //      墙/背景水之后。血条不随后移（原版血条独立 pass 恒在最上层，
    //      见 4. 段实体层）。血肉墙嘴/眼/饥饿者（113/114/115）虽同为 behindTiles=true，
    //      但墙身(3.7 DrawWoF)本仓画在 tile 之上，若随族前移会被墙身盖掉
    //      （原版墙身在 tile 之下无此冲突）→ 留在实体层，见 isBehindTilesEnemy
    const sorted = [...entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e instanceof Enemy && this.isBehindTilesEnemy(e)) this.drawEnemy(e, world, entities);
    }

    // 2c. 前景 tile/物体层(同款保险重叠)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).tile, cx * CHUNK * ts, cy * CHUNK * ts, CHUNK * ts + over, CHUNK * ts + over);
      }
    }

    // 2c'.0 火苗叠画（原版 DrawSingleTile_Flames，TileDrawing.cs:1746 在本体绘制之后
    //   调用）：火把/蜡烛/烛台/吊灯/篝火等 Flame_N 平行表逐帧种子化抖动——动态层
    //   不能进 ChunkCache 静态烘焙（TileFrameSeed 每 5 帧推进，Main.cs:61156-61159）。
    //   画在 tile 层后、前景水之前（原版火苗属 tile 批次，在前景水 pass 之下）。
    if (this.atlas) {
      const ftx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
      const ftx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
      const fty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
      const fty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
      drawTileFlames(ctx, this.atlas, world.store, ftx0, fty0, ftx1, fty1, flicker);
    }

    // 2c''.4 高尔夫蓄力显示：预测弹道点（FancyGolfPredictionLine 近似：同物理步进）+
    //   力度条（GolfSwingBarFill：宽 54×rel，玩家脚下）
    if (this.golfPower) {
      const gp = this.golfPower;
      // 预测线：从球心按当前物理模拟 20 步（重力 0.3、实心即停）
      let px = gp.ball.cx, py = gp.ball.cy;
      const sim = { vx: gp.ball.vx, vy: gp.ball.vy };
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 20; i++) {
        sim.vy = Math.min(sim.vy + 0.3, 12);
        px += sim.vx; py += sim.vy;
        const stx = Math.floor(px / TILE), sty = Math.floor(py / TILE);
        if (world.store.inBounds(stx, sty) && world.store.isSolid(stx, sty)) break;
        if (i % 2 === 0) ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      // 力度条（:42961：54×RelativeStrength）
      const [sx0, sy0] = cam.worldToScreen(gp.x, gp.y);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx0 - 27, sy0, 54, 6);
      ctx.fillStyle = '#7de08a';
      ctx.fillRect(sx0 - 27, sy0, Math.round(54 * gp.rel), 6);
    }
    // 2c''.5 风摆动图层（原版 TileDrawing 特殊绘制路径）：摆动图块已摘出烘焙，
    // 此处逐帧动态绘制（草/药草/藤蔓/吊挂植物/树冠树枝；世界变换内世界坐标，
    // 光照合成在后自动受光）——渲染共享态 renderEnv.wind 已在 render() 顶部注入
    if (this.atlas) {
      drawWindSwayTiles(ctx, this.atlas, world, cam, z, clock, this.waterStyle, {
        corrupt: !!this.scene?.zoneCorrupt,
        crimson: !!this.scene?.zoneCrimson,
        hallow: !!this.scene?.zoneHallow,
      });
      // 自然层粒子（原版 Gore：落叶/滴水——DrawGores 在 tile 层后实体前）
      natureParticles.draw(ctx, this.atlas);
    }

    // 2c'. 导线覆盖层(原版画在水之上实体之下,Main.cs:46721;手持电路工具或 F7 时可见)
    this.drawWires(world, cam, viewW, viewH, z);
    // 2c''. 宏伟蓝图拖拽预览(锚点→悬停格的 L 路径,与 massWireOperation 同构:先纵后横+端点)
    this.drawGrandPreview();

    // 2d. 瀑布贴图（原版画在 tile 层后、实体前，Main.cs:47460，被地形遮挡）
    this.drawWaterfalls(world, cam, viewW, viewH, z);

    // 2d'. 挂物族存放物叠画（原版 TE*.Draw / 模特走 PlayerRenderer——本作画物品图标）
    this.drawFurnitureItems(world, cam, viewW, viewH, z);

    // 2d'. 天气层（雨滴池更新+绘制；沙尘粒子发射——Game 每帧已 attach 状态与 hooks）
    if (this.weatherFxActive) {
      this.weatherFx.update(world, viewW, cam.x - viewW / 2, cam.y - viewH / 2, player.vx, player.vy);
      this.weatherFx.draw(this, world);
    }

    // 2d''.7 天空深化批世界内绘制：雨点落水涟漪（世界坐标）+ 月总死亡白闪/晨昏镜头光斑（全屏）
    this.sky.drawWorldFx(ctx, cam.x, cam.y, z, viewW, viewH);

    // 3.5 入驻旗帜（Main.cs:40152 DrawNPCHousesInWorld：有家 NPC 在家坐标上方
    // 挂 House_Banner 旗布 + 叠画 NPC 头像；实体层之前画，让 NPC 从旗前走过）
    this.drawHouseBanners(entities, world, cam);

    // 3.7 血肉墙墙身/肌腱链/舌头（Main.cs DrawWoF :37811-37966，DoDraw_WallsTilesNPCs
    //     :62709 在墙/方块之后、NPC 缓存之前调用 → 墙身垫在嘴(113)/眼(114)/饥饿者(115)
    //     精灵之下，本仓在实体层之前画等价；墙死透时的全屏血尘崩落近似也在此触发）
    this.drawWoF(player, entities, world, camRY, viewW, viewH, z);

    // 4. 实体（按 y 排序；behindTiles 族已在 2b' 画过，此处只补血条——
    //    原版 DrawNPCHealthBars 独立 pass 恒在最上层，钻地中血条仍可见）
    for (const e of sorted) {
      if (e instanceof Enemy) {
        if (this.isBehindTilesEnemy(e)) { this.drawHealthBar(e, world.isExpert); continue; }
        this.drawEnemy(e, world, entities); this.drawHealthBar(e, world.isExpert);
      }
      else if (e instanceof ItemDrop) this.drawDrop(e);
      else if (e instanceof TownNPC) { this.drawTownNPC(e, world); this.drawHealthBar(e); }
      else if (e instanceof Tombstone) this.drawTombstone(e);
      else if (e instanceof Critter) this.drawCritter(e);
      else if (typeof (e as { draw?: unknown }).draw === 'function') {
        // 投射物等自带 draw 的实体(飞镖/陷阱弹/箭/法弹):世界变换内绘制
        (e as unknown as { draw(r: Renderer, cam: Camera): void }).draw(this, cam);
      }
    }
    // 表情气泡（原版 EmoteBubble：实体层之上；本段在世界变换内，世界坐标绘制）
    {
      const eb = this.emoteSheet();
      if (eb) drawEmotes(this.ctx, eb);
    }
    this.drawPlayer(player, world, swing);
    // 远端玩家（联机；走同一 drawPlayer——纸娃娃/动画帧由位置派生，与本地一致）
    // 远端玩家（联机；走同一 drawPlayer——纸娃娃/动画帧由位置派生，与本地一致；
    // 挥舞动画 = msg13 useItem 位派生的 swingNet（对齐本地 swing 参数形状））
    for (const rp of this.remotePlayers) { this.drawPlayer(rp, world, rp.swingNet); }
    // PvP 头顶血条（备案偏差：原版无玩家头顶名/血条——仅悬停提示与地图头像边框；
    // 真联机 PvP 下"谁是可攻击目标"是核心信息，按计划以头顶条替代）。
    // 仅 hostile 目标显示（同队/非 hostile 玩家无条），队伍色描边 + 原版血条同款
    // 绿→黄→红渐变填充；受伤即显示（对齐 DrawHealthBar 的 life!=lifeMax 门）
    for (const rp of this.remotePlayers) {
      if (!rp.hostile || rp.hp >= rp.maxHp || rp.dead) continue;
      const tc = TEAM_COLORS[Math.max(0, Math.min(5, rp.team))];
      const x = rp.cx - 19, y = rp.y - 14;
      const fill = Math.max(0, Math.min(1, rp.hp / rp.maxHp));
      const r = Math.round(fill > 0.5 ? 255 * (1 - fill) * 2 : 255);
      const g = Math.round(fill > 0.5 ? 255 : 255 * fill * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, 40, 6);
      ctx.fillStyle = `rgb(${tc[0]},${tc[1]},${tc[2]})`;
      ctx.fillRect(x - 1, y - 1, 40, 2);
      ctx.fillStyle = `rgb(${r},${g},0)`;
      ctx.fillRect(x, y, 38 * fill, 4);
    }

    // 4.5 液体前景 pass（原版 waterTarget 在玩家/掉落物之后合成，Main.cs:46720）：
    //     水 0.6 半透明盖在实体上——水中角色带水色
    this.drawLiquids(world, cam, viewW, viewH, z, false);

    // 4.6 Gore 死亡碎块（原版 DrawGore Main.cs:21712-21742：DrawItems/Rain 之后、
    //     DrawDust 之前——实体与液体前景之后、尘粒之前；Main.DrawGore 帧路径 :21728-
    //     21737 多帧源矩形，非帧路径 :21741-21742 整张贴图，均中心锚 + rotation +
    //     scale，透明度 = (255-alpha)/255（Gore.GetAlpha :1486））
    this.drawGorePieces(ctx, cam, viewW, viewH);

    // 5. 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    // 5b. 渲染层自持瞬态粒子（血肉墙崩落血尘——Game 侧粒子池 600 上限内放不下
    //     原版 ~550 尘+110 gore，且死亡触发点只在渲染侧可得）
    this.stepWoFDeathFx();
    ctx.globalAlpha = 1;

    // 6. 挖掘/放置光标：挖掘中黄色填充随进度加深（半透明黄 → 破坏完成时最深）
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(hover.x * ts + 0.5, hover.y * ts + 0.5, ts - 1, ts - 1);
      if (mineProgress > 0) {
        // 进度 0→1，黄色 alpha 0.15→0.8 加深渐变（接近破坏时深黄）
        ctx.globalAlpha = 0.15 + Math.min(1, mineProgress) * 0.65;
        ctx.fillStyle = '#FFC419';
        ctx.fillRect(hover.x * ts + 1, hover.y * ts + 1, ts - 2, ts - 2);
        ctx.globalAlpha = 1;
      }
    }

    // 6b. 洞穴探险/危险感/狩猎/群系视觉高亮（Main.cs:49500 段 Spelunker/Dangersense 溢色近似：
    //     全屏 tile 扫描 + 呼吸 alpha；狩猎对小动物画框）
    this.drawBuffHighlights(ctx, world, player, cam, viewW, viewH, z, ts);

    ctx.restore();

    // 6c. LitNature 晨昏光晕（NextNatureRenderer :105-170：原版像素着色器，此处
    //     可见性公式 1:1 + 太阳位暖色加性光晕近似；vis=0 时零开销）
    const litVis = litNatureVisibility(clock);
    if (litVis > 0.003) {
      const ft = ((clock.timeOfDay - 0.25) / 0.5);
      const sunX = Math.max(0, Math.min(1, ft)) * viewW;
      const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
      const sunY = dip * 250 + 180;
      const r = viewW * 0.55;
      const grad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
      grad.addColorStop(0, `rgba(255,206,130,${(litVis * 0.85).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,206,130,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }

    // 7. 光照合成
    this.compositeLight(cam, viewW, viewH, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);

    // 7b. 智能光标黄框（Main.cs:46016-46066 DrawSmartCursor）：光照合成之后画，
    //     颜色手动乘该格光照（Lighting.GetColor 语义）
    if (hover?.smart) {
      this.drawSmartCursor(ctx, cam, hover, viewW, z,
        lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);
    }

    // 7c. MoonLordShake 屏幕后处理（Main.cs:64437-64447）：光照合成后、HUD 前叠红色靶心脉冲
    this.drawMoonLordShake(ctx, cam, viewW, viewH);

    // 7c-bis. ScreenObstruction 遮屏（ScreenObstruction.cs 1:1）：星云头蟹 421 头顶吸附
    // 授 Obstructed(163) → headcovered → 目标 0.95/步进 0.3 的黑幕逼近，玩家矩形开孔
    this.updateAndDrawScreenObstruction(ctx, cam, viewW, viewH, player);

    // 7d. 天塔柱族全屏滤镜（FilterManager.EndCapture :136-176：世界整屏合成、
    //     HUD 之前；EffectPriority 升序 → Medium 先 VeryHigh 后）。开关链：
    //     电路/右键 → SwitchMonolith 翻帧 → SceneMetrics 视区扫描（本帧 monoScan）
    //     → SceneState.cs:105-128 激活 → Filter.Opacity 1/s 斜坡
    if (this.monoFilters.anyInUse) {
      this.monoFilters.draw(ctx, this.canvas, viewW, viewH, {
        x: (player.cx - cam.x) * z + viewW / 2,
        y: (player.cy - cam.y) * z + viewH / 2,
      });
    }

    // 8. 飘字（受光照影响后画）。数字类 = 原版位图字体（Combat_Text/Combat_Crit
    //    xnb 提取,见 render/CombatTextFont）:5 层绘制（±targetScale 四向暗化影 +
    //    本体,影 = 本色调暗 ×0.3 而非黑——Main.cs:61805-61841）、锚点文字盒中心、
    //    crit 旋转漂移；字体未就绪(懒加载窗口)回退 monospace
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const d of dmgNumbers) {
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      // 物品名飘字：带阴影浅白文本（非原版链,保持旧样式）
      if (d.label) {
        ctx.globalAlpha = Math.min(1, d.life / 30);
        ctx.font = '13px sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(d.label, sx, sy);
        ctx.fillStyle = '#F0F0F0';
        ctx.fillText(d.label, sx, sy);
        continue;
      }
      const text = String(d.value);
      if (combatFontReady(d.crit)) {
        // 原版位图字体:颜色 #RRGGBB → rgb 三元组,锚点 (sx, sy)=文字盒中心
        const hex = d.color.replace('#', '');
        const rgb: [number, number, number] = [
          parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16),
        ];
        drawCombatText(ctx, text, sx, sy, rgb, d.alpha ?? 1, d.scale ?? 1, d.rotation ?? 0, d.crit);
        continue;
      }
      // 回退:monospace（字体纹理加载中,本帧少量帧窗）
      const scale = d.scale ?? 1;
      ctx.globalAlpha = d.alpha ?? 1;
      ctx.fillStyle = d.color;
      ctx.font = `bold ${Math.max(1, Math.round((d.crit ? 18 : 14) * scale))}px monospace`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const rot = d.rotation ?? 0;
      if (rot !== 0) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rot);
        ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      } else {
        ctx.strokeText(text, sx, sy);
        ctx.fillText(text, sx, sy);
      }
    }
    ctx.restore();

    this._lastPlayer = player;
    // 9. 小地图
    this.drawMinimap(ctx, cam, world, player, clock, entities);
    // 9.45 信息饰品列(DrawInfoAccs;main 系列资源文本,原版右上 X=W-280)
    if (this.infoAccCtx && this.infoAccs.canShow(
      !!((player as unknown as { talking?: boolean }).talking),
      !!((this as unknown as { chestOpen?: boolean }).chestOpen),
      false,
    )) {
      this.infoAccs.draw(ctx, viewW, viewH, this.infoAccCtx, player.hideInfo,
        this.playerInventory, !!this.fullMap.open && !!this.minimap,
        this.infoAccHover, this._mouseX, this._mouseY);
    }
    // 9.5 全屏地图
    if (this.fullMap.open && this.minimap) {
      this.drawFullMap(ctx, world, this._mouseX, this._mouseY, this._mouseDown, entities);
      return; // 全屏地图时跳过其余 HUD
    }

    // 9.8 调试面板：碰撞盒高亮（F3 切换）
    // 方块标注叠加（F5 标注模式）：红圈 + 序号
    if (this.annotateMarks && this.annotateMarks.length && !this.fullMap.open) {
      const z = cam.zoom;
      ctx.save();
      ctx.font = `bold ${Math.max(10, 12 * z)}px monospace`;
      ctx.textAlign = 'center';
      this.annotateMarks.forEach((m, idx) => {
        const [sx, sy] = cam.worldToScreen(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2);
        ctx.strokeStyle = '#FF3355';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 10 * z + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FF3355';
        ctx.fillText(String(idx + 1), sx, sy - 12 * z - 6);
      });
      ctx.restore();
    }
    if (this.debugMode) this.drawDebugOverlay(ctx, cam, viewW, viewH, player, entities, mouseX, mouseY, hover);

    // 10. Boss 血条（BigProgressBarSystem.TryFindingNPCToTrack：屏幕矩形外扩 5000px
    // 与 boss 命中盒相交才跟踪显示——远离重生点时不应残留血条）
    if (boss && Math.abs(boss.cx - cam.x) < viewW / 2 / z + 5000 && Math.abs(boss.cy - cam.y) < viewH / 2 / z + 5000) {
      this.drawBossBar(ctx, viewW, viewH, boss, entities);
    } else if (!boss) {
      // 491 荷兰飞盗船聚合血条（PirateShipBigProgressBar：总 = SetDefaults(492).lifeMax×4
      // = 8000 恒定；当前 = 4 炮 life 之和；BigProgressBarSystem 字典 {491,492} 驱动）
      const ship = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.vanillaId === 491);
      if (ship && Math.abs(ship.cx - cam.x) < viewW / 2 / z + 5000 && Math.abs(ship.cy - cam.y) < viewH / 2 / z + 5000) {
        const cannons = (entities as Enemy[]).filter((n) => n instanceof Enemy && !n.dead
          && n.vanillaId === 492 && n.ai0 === ship.id);
        const hp = cannons.reduce((sum, n) => sum + Math.max(0, n.hp), 0);
        this.drawBossBar(ctx, viewW, viewH, {
          name: Lang.npcName(491) ?? '荷兰飞盗船', hp, maxHp: 8000, cx: ship.cx, cy: ship.cy,
        }, entities);
      }
    }
    // 入侵进度条（DrawInvasionProgress Main.cs:47071 语义；布局与 Boss 条并列居中，
    // 原版右下角黄条——偏差记录）
    if (invasion) this.drawInvasionBar(ctx, viewW, invasion);

    // 11. 生命/魔力资源条（原版默认 "New"=FancyClassic 金框分格样式；Classic 为
    //     朴素心/星——PlayerResourceSetsManager2.cs:26-31 五样式，此处两主样式可切）
    //     移动端整体缩小（右锚缩放——两样式均以 viewW 右缘锚定；桌面恒等）
    {
      const barsUiS = mobileUiScale();
      if (barsUiS !== 1) {
        ctx.save();
        ctx.translate(viewW, 0);
        ctx.scale(barsUiS, barsUiS);
        ctx.translate(-viewW, 0);
      }
      if (options.data.resourceBarStyle === 'classic') this.resourceBars.draw(ctx, player, viewW, flicker);
      else this.fancyBars.draw(ctx, player, viewW, flicker);
      if (barsUiS !== 1) ctx.restore();
    }
    // 11b. 呼吸计（原版 DrawInterface_Resources_Breath Main.cs:42824：玩家头顶
    //      100px 屏幕 10 气泡；岩浆宽限耗损时换火焰条）
    this.breathMeter.draw(ctx, player, cam, viewH, this.atlas, this.playerInventory);

    // 12. 死亡画面（DrawInterface_35_YouDied Main.cs:44765 + 灰化遮罩）
    if (player.dead) this.drawDeathScreen(ctx, player, viewW, viewH);
  }

  /** 死亡 UI（原版 DrawInterface_35_YouDied :44765-44801 1:1 + 灰化遮罩）：
   *  - 中央文字「你被杀死了……」（Lang.inter[38]，DeathText 大字号）@ 屏中 -60
   *  - 掉钱行「掉了{0}」（Game.DroppedCoins，仅 lostCoins>0）@ 下一行
   *  - 重生倒计时（Game.RespawnInSuffix {0}=秒数，scale 0.7）@ 屏中 +10
   *  - 文字色 = GetDeathAlpha（Player.cs:53284：r=0.9α g=0.5α b=0.5α a=0.4α——
   *    immuneAlpha +2/tick 缓升，红黑渐显）
   *  - 灰化遮罩（原版无全局去饱和——视觉近似：随 immuneAlpha 渐深的中性灰罩） */
  private drawDeathScreen(ctx: CanvasRenderingContext2D, player: Player, viewW: number, viewH: number) {
    const a = player.immuneAlpha / 255; // 0→1 缓升（约 2.1s 走满）
    // 灰化遮罩
    ctx.fillStyle = `rgba(46, 40, 46, ${(a * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    // 文字色（GetDeathAlpha 公式）
    const col = `rgba(${Math.round(230 * 0.9 * a)},${Math.round(230 * 0.5 * a)},${Math.round(230 * 0.5 * a)},${(a * 0.4 + a * 0.6).toFixed(3)})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = viewW / 2;
    // 「你被杀死了……」@ 屏中 -60（原版 num=-60）
    ctx.font = 'bold 34px "Fusion Pixel 12px zh_hans", monospace';
    ctx.strokeStyle = `rgba(0,0,0,${(a * 0.85).toFixed(3)})`;
    ctx.lineWidth = 5;
    const died = Lang.text('LegacyInterface.38');
    ctx.strokeText(died, cx, viewH / 2 - 60);
    ctx.fillStyle = col;
    ctx.fillText(died, cx, viewH / 2 - 60);
    // 掉钱行（原版 num += 50 后写、再 -=26；效果即 Died 下方一行；lostCoins 由 Game 注入）
    const lost = this.deathLostCoins;
    if (lost > 0) {
      ctx.font = '16px "Fusion Pixel 12px zh_hans", monospace';
      // {0} = ValueToCoins 格式化（Main.cs:44777 传 lostCoinString=ValueToCoins(lostCoins)）
      const coins = Lang.text('Game.DroppedCoins', Lang.valueToCoins(lost));
      ctx.strokeText(coins, cx, viewH / 2 - 10);
      ctx.fillText(coins, cx, viewH / 2 - 10);
    }
    // 重生倒计时（原版 num=-60+70=+10，scale 0.7）
    const secs = 1 + Math.floor(player.respawnTimer / 60);
    ctx.font = 'bold 24px "Fusion Pixel 12px zh_hans", monospace';
    const cd = Lang.text('Game.RespawnInSuffix', String(secs));
    ctx.strokeText(cd, cx, viewH / 2 + 36);
    ctx.fillText(cd, cx, viewH / 2 + 36);
    ctx.textBaseline = 'alphabetic';
  }
  /** Game 每帧注入：本次死亡掉落钱数（LocalPlayer.lostCoins） */
  deathLostCoins = 0;

  private drawLiquids(world: World, cam: Camera, viewW: number, viewH: number, z: number, isBackground: boolean) {
    // 原版 1.4.0.5 LiquidRenderer 移植（多 pass 网格算法，见 VanillaLiquidRenderer）。
    // isBackground：背景 pass（墙层之前，不透明）或前景 pass（实体之后，0.6）
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    // 底边 +5 行（原版 Main.cs:42900-42908 屏下 +5/+4 边距）：P3 不处理窗口底部 10 行，
    // 外扩后未构建带落在屏幕外，防止视口底缘液体类型错画
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts) + 5);
    // 双 pass 共用同一时刻，避免动画帧错位（原版 PrepareDraw 每帧一次、两 pass 共享缓存）
    drawVanillaLiquids(this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this._liquidNow, isBackground,
      world.weather?.windSpeedCurrent ?? 0, this.waterStyle);
  }

  /** 导线覆盖层(Main.cs:43543-43954 DrawWires 移植:四色行/连接掩码/多色淡化/致动器覆盖) */
  showWires = false;
  /** 宏伟蓝图拖拽预览(Game.render 注入;世界坐标 tile) */
  grandPreview: { from: [number, number]; to: [number, number]; mode: number } | null = null;
  private drawWires(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.showWires || !this.atlas) return;
    const wires = this.atlas.ensureVImage('vanilla/WiresNew.png');
    const actuatorImg = this.atlas.ensureVImage('vanilla/Actuator.png');
    if (!wires) return;
    const st = world.store;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const ctx = this.ctx;
    const has = (x: number, y: number, bit: number) => st.inBounds(x, y) && (st.wire[st.idx(x, y)] & bit) !== 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        const b = st.wire[i];
        const colors = b & 15;
        if (!colors && !(b & 16)) continue;
        let n = 0;
        for (let c = 0; c < 4; c++) if (colors & (1 << c)) n++;
        let drawn = 0;
        for (let c = 0; c < 4; c++) {
          const bit = 1 << c; // 红0 蓝1 绿2 黄3(图集行序,Main.cs:43641 等)
          if (!(colors & bit)) continue;
          drawn++;
          // 行 Y = 色行*18;分线盒/像素盒额外行偏移(Main.cs:43596-43616)
          let rowY = c * 18;
          const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
          if (sh === 424) rowY += 72 + Math.floor(st.frameX[i] / 18) * 72;
          else if (sh === 445) rowY += 72;
          // 连接掩码(Main.cs:43621-43640):上+18 右+36 下+72 左+144
          let mask = 0;
          if (has(tx, ty - 1, bit)) mask += 18;
          if (has(tx + 1, ty, bit)) mask += 36;
          if (has(tx, ty + 1, bit)) mask += 72;
          if (has(tx - 1, ty, bit)) mask += 144;
          if (n > 1) ctx.globalAlpha = 1 / n; // 多色同格淡化(桥带略)
          ctx.drawImage(wires, mask, rowY, 16, 16, tx * ts, ty * ts, ts, ts);
          ctx.globalAlpha = 1;
        }
        if ((b & 16) && actuatorImg) {
          ctx.drawImage(actuatorImg, 0, 0, 16, 16, tx * ts, ty * ts, ts, ts);
        }
      }
    }
  }

  /** 宏伟蓝图 L 路径预览:先纵后横 + 端点(massWireOperation dir=true 同构);
   *  剪线=蓝、致动器=绿、四色铺线=红,半透明格覆盖 */
  private drawGrandPreview() {
    const gp = this.grandPreview;
    if (!gp) return;
    const ctx = this.ctx;
    const ts = TILE;
    const cells: Array<[number, number]> = [];
    const [fx, fy] = gp.from;
    const [tx, ty] = gp.to;
    const sy = Math.sign(ty - fy), sx = Math.sign(tx - fx);
    for (let y = fy; y !== ty; y += sy) cells.push([fx, y]);
    for (let x = fx; x !== tx; x += sx) cells.push([x, ty]);
    cells.push([tx, ty]);
    const color = gp.mode & TOOL_CUTTER
      ? 'rgba(140,160,255,0.30)'
      : (gp.mode & 15) === 0 ? 'rgba(80,220,120,0.30)' // 仅致动器
        : 'rgba(255,70,70,0.30)';
    ctx.fillStyle = color;
    for (const [x, y] of cells) ctx.fillRect(x * ts, y * ts, ts, ts);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
  }

  /** 瀑布贴图（tile 层后、实体前；扫描窗口外扩 100 格在内部，30 帧节流） */
  private drawWaterfalls(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.atlas) return;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const now = this._liquidNow; // 与液体双 pass 同帧同时刻
    this.waterfalls.findWaterfalls(world.store, tx0, ty0, tx1, ty1, Math.floor(now / 16.67));
    this.waterfalls.draw(this.ctx, this.atlas, world.store, world.groundLevel, now, this.waterStyle);  // 群系水色→瀑布贴图(通道表偏移)
    // 岩浆瀑布发光(AddLight :1075-1080:r≈0.55×0.4 脉动,g=r×0.3,b=r×0.1 橙光;
    // mouseTextColor 闪烁项取定值近似)——非岩浆瀑布 litCells 为空,零开销
    const lit = this.waterfalls.litCells;
    if (lit.length) {
      const r = 0.22;
      for (let k = 0; k < lit.length; k += 2) {
        this.lighting?.addLight(lit[k], lit[k + 1], r, r * 0.3, r * 0.1);
      }
    }
  }
  /** 本帧液体动画时刻（双 pass 共享） */
  private _liquidNow = 0;
  /** 群系水色（CalculateWaterStyle，Main.cs:56845；每帧由场景标志+昼夜+深度算出） */
  waterStyle = 0;
  /** 光照引擎引用(Game 创建后回填;岩浆瀑布 AddLight 消费) */
  lighting: import('../lighting/LightingEngine').LightingEngine | null = null;
  /** 切换迟滞（DrawBG_HandleBackgroundTransition :63508-63533 的 bgDelay 语义：
   *  原版水色本身硬切,但持续 30t(≈0.5s)偏好不变才提交切换,切后 60t 冷却不再响应——
   *  群系边界来回抖动时不闪切;森林族 60t 差异省略,统一 30t 近似） */
  private wsDelay = 0;
  /** 群系水色 1:1（Main.CalculateWaterStyle :56766-56824；喷泉/血月柱并入） */
  private updateWaterStyle(world: World, cam: { y: number }): void {
    const f = this.scene;
    if (!f) return;
    // 喷泉（:56766-56770）：ActiveFountainColor ≥ 0 直接短路返回——无 bgDelay 迟滞，
    // 立即生效立即失效；水色 id 与群系水色同一空间（0 普通 … 13 地狱）
    const fountain = f.fountainColor ?? -1;
    if (fountain >= 0) {
      this.waterStyle = fountain;
      this.wsDelay = 0;
      return;
    }
    // 血月柱（SceneMetrics.BloodMoonMonolith → Main.cs:61417 并入 BloodMoonActive；
    // CalculateWaterStyle 的血月分支读 Main.bloodMoon——柱激活时同色 9，白夜也生效。
    // 来源用本帧视区扫描 monoScan（ScanOnScreenTiles 语义）而非 169×124 窗口的近似值）
    const bloodMoon = (!!world.clock?.bloodMoon || !!f.bloodMoonMonolith || this.monoScan.bloodMoonMonolith);
    const dayTime = world.clock ? world.clock.isDay : true;
    let target = 0;
    if (bloodMoon && !dayTime) target = 9;
    else if (f.zoneCorrupt) target = 2;            // bgStyle 1/5
    else if (f.zoneJungle) target = 3;             // bgStyle 3
    else if (f.zoneCrimson) target = 10;           // bgStyle 8/14
    else if (f.zoneHallow) target = 4;             // bgStyle 6/13
    else if (f.zoneSnow) target = 5;               // bgStyle 7
    else if (f.zoneDesert) target = f.belowSurface ? 12 : 6;  // bgStyle 2（地下→地下沙漠）
    else if (f.zoneUnderworldHeight) target = 13;  // bgStyle 4（地狱）
    else {
      // default:岩层+40 以下 → 发光蘑菇区 7 / 洞穴 8;地下 → 7;地表 → 0
      // 深度取相机中心 tile Y（原版 SceneMetrics.TileCenter）
      const ty = Math.floor(cam.y / TILE);
      if (ty > world.rockLevel + 40) target = f.zoneGlowshroom ? 7 : 8;
      else target = f.belowSurface ? 7 : 0;
    }
    // bgDelay 迟滞（:63440-63449 + :63508）：冷却期只倒数;偏好持续 30t 才提交
    if (this.wsDelay < 0) {
      this.wsDelay++;
    } else if (target !== this.waterStyle) {
      this.wsDelay++;
      if (this.wsDelay > 30) {
        this.wsDelay = -60;      // 提交切换,进入 60t 冷却
        this.waterStyle = target;
      }
    } else {
      this.wsDelay = 0;          // 偏好与当前一致,计数清零
    }
  }
  /** 远端玩家（Game.render 每帧注入；单机空数组零开销） */
  remotePlayers: Player[] = [];
  /** 主角引用（Game.render 每帧注入；克脑四镜像 Main.cs:24799-24843 取玩家中心） */
  mainPlayer: Player | null = null;
  /** 高尔夫蓄力显示（Game 注入：力度条 + 预测线；Main.cs:30690-30721/:42933-42966） */
  golfPower: { x: number; y: number; rel: number; ball: import('../entities/GolfBall').GolfBall } | null = null;
  /** 光照合成 ImageData 复用(尺寸变化才重建) */
  private _lightImg: ImageData | null = null;

  /** 墓碑：以底部中心为支点按倾角旋转绘制（翻滚/侧躺/倒扣）。
   *  优先原版 Tiles_85 样式块——四格 16×16 无缝拼到离屏画布再绘制
   *  （直接取 34×34 矩形会把表内 2px 间隙画成十字缝），程序化仅兜底 */
  private tombstoneCache = new Map<number, HTMLCanvasElement>();
  private drawTombstone(t: Tombstone) {
    const ctx = this.ctx;
    ctx.save();
    // 投射物旋转原点 = 中心（Projectile.Draw 语义）
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.angle);
    const styleCol = t.style * 2; // Tiles_85 样式块起点列（style 0-10 → 偶数列 0-20）
    let img: CanvasImageSource | null = this.tombstoneCache.get(styleCol) ?? null;
    if (!img && this.atlas) {
      // 无缝拼接四格（表内 stride 18：格间有 2px 间隙需跳过）
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d')!;
      let ok = true;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const fr = this.atlas.vframeAt(85, (styleCol + dx) * 18, dy * 18);
          if (!fr) { ok = false; break; }
          cx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, dx * 16, dy * 16, 16, 16);
        }
      }
      if (ok) { this.tombstoneCache.set(styleCol, c); img = c; }
    }
    if (img) {
      ctx.drawImage(img, -16, -16, 32, 32);
    } else {
      const pc = getTombstoneCanvas();
      ctx.drawImage(pc, -8, -11, 16, 22);
    }
    ctx.restore();
  }

  /** Gore 死亡碎块（Main.DrawGore Main.cs:21712-21742）。世界变换内世界坐标绘制，
   *  光照合成在后自动受光（同 wind-sway/natureParticles 层）。贴图多帧行取
   *  GorePiece.frameRows（1217/1218 等竖条）；落地不归零 rotation（Gore.cs 无此步，
   *  翻滚随 vx 摩擦冻结）。 */
  private drawGorePieces(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
    if (!this.atlas) return;
    const pieces = liveGorePieces();
    if (!pieces.length) return;
    const z = cam.zoom;
    // 视区外剔除（扩半贴图防边缘闪断）
    const x0 = cam.x - viewW / 2 - 64, x1 = cam.x + viewW / 2 + 64;
    const y0 = cam.y - viewH / 2 - 64, y1 = cam.y + viewH / 2 + 64;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const p of pieces) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      this.drawGorePiece(ctx, p, z);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawGorePiece(ctx: CanvasRenderingContext2D, p: GorePiece, z: number) {
    const img = this.atlas!.ensureVImage(`vanilla/Gore_${p.goreId}.png`);
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const rows = p.frameRows;
    const fh = img.naturalHeight / rows;
    const sh = Math.floor(fh);
    const sw = img.naturalWidth;
    // Gore.GetAlpha（:1486）：opacity = (255 - alpha)/255
    ctx.globalAlpha = Math.max(0, (255 - p.alpha) / 255);
    if (p.rotation === 0 && p.scale === 1) {
      // 直绘路径（Main.cs:21706-21742 原点即贴图中心：落点 + 尺寸/2）
      ctx.drawImage(img, 0, p.row * sh, sw, sh, p.x, p.y, sw, sh);
      return;
    }
    ctx.save();
    ctx.translate(p.x + (sw * p.scale) / 2, p.y + (sh * p.scale) / 2);
    if (p.rotation) ctx.rotate(p.rotation);
    if (p.scale !== 1) ctx.scale(p.scale, p.scale);
    ctx.drawImage(img, 0, p.row * sh, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    void z;
  }

  /** 小动物：原版 NPC 纵向帧条动画（移动时循环全帧，静止首帧；贴图默认朝左镜像） */
  /** 大血条比例 1.5 的类型（Main.cs:45228-45298：Boss 与大型怪） */
  private static readonly HB_BIG_SCALE = new Set([
    4, 35, 36, 50, 113, 114, 125, 126, 127, 128, 129, 130, 131, 222, 262, 266,
    245, 246, 247, 248, 249, 564, 565, 551, 576, 577, 87, 510, 454, 621, 439, 370,
  ]);
  /** NPCAddHeight（Main.cs:21840-22005）：血条在脚底 +10 之上的额外下沉（视觉修正） */
  private static readonly HB_ADD_H: Record<number, number> = {
    125: 30, 126: 30, 54: 2, 205: 8, 182: 24, 178: 2, 6: 26, 173: 26, 94: 14,
    7: 13, 8: 13, 9: 13, 98: 13, 99: 13, 100: 13, 95: 13, 96: 13, 97: 13,
    10: 8, 11: 8, 12: 8, 13: 26, 14: 26, 15: 26, 175: 4, 520: 2,
    412: 18, 413: 18, 414: 18, 48: 32, 49: 4, 51: 4, 60: 10,
    62: 14, 66: 14, 156: 14, 63: 4, 64: 4, 103: 4, 65: 5, 69: 4, 70: -4, 72: -2,
    83: 20, 84: 20, 150: 10, 151: 10, 158: 10, 152: 6, 153: 2, 154: 2,
    165: 10, 237: 10, 238: 10, 240: 10, 531: 10, 39: 26, 40: 26, 41: 26,
    87: 56, 88: 56, 89: 56, 90: 56, 91: 56, 92: 56, 134: 30, 135: 30, 136: 30, 169: 8,
    174: 6, 369: 2, 376: 6, 579: -2, 612: 2, 613: 2,
    269: -2, 270: -2, 271: -2, 274: -2, 277: -2,
  };

  /** 受伤实体血条（DrawInterface_14_EntityHealthBars Main.cs:45203 + DrawHealthBar :21748）：
   *  life != lifeMax 即显示（无时间衰减——原版打到没满血就一直显示）；画在脚底
   *  +10+NPCAddHeight；填充 36px×比例；绿→黄→红渐变（:21766-21778）；光照亮度调
   *  alpha（:45417 Brightness）。蠕虫段不画（头部血条代表全链）；毁灭者原版为
   *  全链共享一条（destroyerHB 平滑），此处近似画在头下。专家档克脑 266 不画
   *  （Main.cs:45321 `(!expertMode || type != 266)` 门——有四镜像在,血条会穿帮）。 */
  private drawHealthBar(e: { cx: number; cy: number; y: number; h: number; hp: number; maxHp: number; vanillaId: number | null; wormFollow?: Enemy['wormFollow']; spriteBottomWorld?: number }, expert = false) {
    const hp = e.hp, maxHp = e.maxHp;
    if (hp <= 0 || hp >= maxHp) return;
    if (e.wormFollow) return;
    if (expert && e.vanillaId === 266) return;   // Main.cs:45321
    if (!this.atlas) return;
    const hb1 = this.atlas.ensureVImage('vanilla/HealthBar1.png');
    const hb2 = this.atlas.ensureVImage('vanilla/HealthBar2.png');
    if (!hb1 || !hb2) return;
    const vid = e.vanillaId ?? 0;
    const scale = Renderer.HB_BIG_SCALE.has(vid) ? 1.5 : 1;
    const x = e.cx - 18 * scale;
    // 原版条位 = 盒底+10+NPCAddHeight（其前提是贴图底≈盒底+4）。中心锚+显式
    // 下移的贴图（EoC +23/+30 等）底边远低于盒底 → 取 max(盒底基准, 贴图底+6)
    // 保持原版"条悬在贴图底下方 ~6px"的相对关系（2026-08-13 "血条在眼球内"修复）
    const y = Math.max(e.y + e.h + 10 + (Renderer.HB_ADD_H[vid] ?? 0),
      e.spriteBottomWorld ? e.spriteBottomWorld + 6 : -Infinity);
    const fill = Math.max(0, Math.min(36, Math.floor((36 * hp) / maxHp)));  // num2
    // 光照 alpha（Brightness = 中心格最大通道/255；8 档量化控 tint 缓存规模）
    let aQ = 1;
    if (this.lighting) {
      const [lr, lg, lb] = this.lighting.lightAt(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
      aQ = Math.round((Math.max(lr, lg, lb) / 255) * 7) / 7;
    }
    if (aQ <= 0) aQ = 0.15; // 全黑也留一点可见度（光照区外 lightAt=0 的兜底）
    // 颜色（:21766-21778）：n=hp%-0.1；>0.5 绿满红减，否则红满绿增
    let n = hp / maxHp - 0.1;
    n = Math.max(0, Math.min(1, n));
    const r = Math.round(n > 0.5 ? 255 * (1 - n) * 2 : 255);
    const g = Math.round(n > 0.5 ? 255 : 255 * n * 2);
    const tint = (img: CanvasImageSource, tex: string, sx: number, sw: number) =>
      this.tintedSprite(`hb${tex}|f${fill}|a${aQ}`, { img, sx, sy: 0, sw, sh: 12 }, [r, g, 0]);
    const ctx = this.ctx;
    ctx.globalAlpha = 0.95 * aQ;
    if (fill < 34) {
      // :21814-21828：背景两段（fill 处 2px 帽 + 余量）+ 填充两段（主体 + 末端 2px）
      ctx.drawImage(tint(hb2, '2', 2, 2), x + fill * scale, y, 2 * scale, 12 * scale);
      ctx.drawImage(tint(hb2, '2', fill + 2, 36 - fill - 2), x + (fill + 2) * scale, y, (36 - fill - 2) * scale, 12 * scale);
      if (fill > 2) ctx.drawImage(tint(hb1, '1', 0, fill - 2), x, y, (fill - 2) * scale, 12 * scale);
      ctx.drawImage(tint(hb1, '1', 32, 2), x + (fill - 2) * scale, y, 2 * scale, 12 * scale);
    } else {
      // :21830-21836：fill≥34 全长填充 + 尾部背景
      if (fill < 36) ctx.drawImage(tint(hb2, '2', fill, 36 - fill), x + fill * scale, y, (36 - fill) * scale, 12 * scale);
      ctx.drawImage(tint(hb1, '1', 0, fill), x, y, fill * scale, 12 * scale);
    }
    ctx.globalAlpha = 1;
  }

  private drawCritter(c: Critter) {
    if (!this.atlas) return;
    const meta = this.atlas.vnpcMeta(c.def.npc);
    if (!meta) return;
    // 帧选择优先级：分段动画（鸭子） > 鸟类栖息末帧 > 蝴蝶物种窗口 > 全表循环
    let frame: number;
    const anim = c.def.anim;
    if (anim) {
      // 状态选段（游水只认滞回锁：flying 后 inWater 冻结的历史 bug 不会再影响显示）
      const seg = c.swimLatch > 0 ? (anim.swim ?? anim.walk)
        : !c.onGround ? (anim.fly ?? anim.walk)
        : Math.abs(c.vx) > 0.15 ? (anim.walk ?? anim.idle) : (anim.idle ?? anim.walk);
      if (seg) {
        const active = Math.abs(c.vx) > 0.15 || !c.onGround || c.swimLatch > 0;
        frame = seg[0] + (active ? Math.floor(c.animT / 8) % seg[1] : 0);
      } else frame = 0;
    } else if (c.perchState === 1 && meta.count > 1) frame = meta.count - 1;
    else {
      const moving = Math.abs(c.vx) > 0.15 || !c.onGround;
      if (c.animLen > 0) frame = c.animBase + (moving ? Math.floor(c.animT / 8) % c.animLen : 0);
      else frame = moving ? Math.floor(c.animT / 8) % meta.count : 0;
    }
    const fr = this.atlas.vnpc(c.def.npc, frame);
    if (!fr) return;
    const ctx = this.ctx;
    // 缩放贴合碰撞盒；按帧最低不透明行对齐脚底（帧底透明内边距会导致悬浮）
    const h = c.h * 1.25;
    const w = (fr.sw / fr.sh) * h;
    const pad = this.spriteBottomPad(fr, `npc${c.def.npc}:f${frame}`); // 帧内底部透明行数（按 NPC+帧号稳定缓存）
    ctx.save();
    ctx.translate(c.cx, c.y + c.h); // 脚底中心
    ctx.scale(c.facing >= 0 ? -1 : 1, 1); // 贴图默认朝左
    if (c.def.glow) {
      ctx.shadowColor = 'rgba(220,255,140,0.9)';
      ctx.shadowBlur = 6; // 萤火虫发光
    }
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h + pad * (h / fr.sh), w, h);
    ctx.restore();
  }

  private drawDrop(d: ItemDrop) {
    const bob = Math.sin((d.age + d.bobPhase * 60) * 0.1) * 1.5;
    // 优先 Maples 图标
    const ar = this.atlasIcon(d.itemId);
    if (ar) {
      const ctx = this.ctx;
      const drawH = 14 * ar.sh / ar.sw;
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, d.x, d.y + bob, 14, drawH);
      // 原版 Item.color（彩色凝胶）：同贴图逐像素乘 color，XNA 预乘两步（同 NPC color pass）
      if (d.color && d.color[3] > 0) {
        const tinted = this.tintedSprite(`item${d.itemId}`, ar, d.color);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = d.color[3] / 255;
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, d.x, d.y + bob, 14, drawH);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        ctx.drawImage(tinted, d.x, d.y + bob, 14, drawH);
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    const icon = this.itemIcon(d.itemId);
    if (!icon) return;
    this.ctx.drawImage(icon, d.x, d.y + bob, 12, 12);
  }

  // 敌人 → Maples 动画映射
  private enemyAnimCache = new Map<string, ReturnType<SpriteAtlas['animFrames']>>();
  private enemyAnim(key: string): ReturnType<SpriteAtlas['animFrames']> {
    let f = this.enemyAnimCache.get(key);
    if (!f) {
      const map: Record<string, string> = {
        slime_green: 'Slime/Jump', slime_blue: 'Slime/Jump',
        zombie: 'Zombie/Walk',
      };
      f = this.atlas && map[key] ? this.atlas.animFrames(map[key]) : [];
      this.enemyAnimCache.set(key, f);
    }
    return f;
  }

  // ===================== 血肉墙墙身三件套（Main.cs DrawWoF :37811-37966 1:1） =====================
  // 原版 DrawWoF 顺序：舌头(:37818-37823) → 肌腱链(:37825-37829) → 墙身(:37831)，
  // 整体在 DoDraw_WallsTilesNPCs(:62709) 里墙/方块之后、NPC 缓存绘制之前调用——
  // 墙身垫底、嘴(113)/眼(114)/饥饿者(115) 精灵压在上面（behindTiles 族仍在墙身前）。
  // 本仓在实体层之前整段画，层序等价。
  //
  // 光照：原版逐 16px 横条 Lighting.GetColor / 逐链段 GetColor；本仓 compositeLight
  // 全屏 multiply 用同一光照缓冲做 2× 超采样双线性合成（比原版逐格采样更细）——
  // 此处不再逐条取 lightAt，否则与全屏 pass 双重相乘会过暗。

  /** 上帧血肉墙本体引用（死亡检测：实体被 compact 移除后对象仍可读 dead/bossFled） */
  private wofHeadSeen: Enemy | null = null;
  /** 墙身崩落血尘（渲染层自持瞬态，形状同 Particle） */
  private wofDeathFx: Particle[] = [];
  /** 墙身贴图（WallOfFlesh.png 190×420 = 3 帧×140px；懒加载经 ensureVImage） */
  private wofTex(): HTMLImageElement | null {
    return this.atlas ? this.atlas.ensureVImage('vanilla/WallOfFlesh.png') : null;
  }

  /** DrawWoF 总入口（:37811-37816 门：wofNPCIndex<0 / inactive / life<=0 不画） */
  private drawWoF(
    player: Player, entities: Entity[], world: World,
    camRY: number, viewW: number, viewH: number, z: number,
  ) {
    if (!this.atlas) return;
    const head = (entities as Enemy[]).find((e) => !e.dead && e.vanillaId === 113 && e.hp > 0) ?? null;
    if (head) {
      this.wofHeadSeen = head;
      const { top, bottom } = this.wofDrawAreaOf(head);
      // :37818-37823 狂卷之舌（tongued 玩家）
      if (!player.dead && player.buffs.has(BuffType.TheTongue)) this.drawWoFTongue(head, player);
      // :37825-37829 肌腱链（所有 aiStyle 29 饥饿者）
      for (const e of entities as Enemy[]) {
        if (!e.dead && e.vanilla?.aiStyle === 29) this.drawWoFRope(head, e, top, bottom);
      }
      // :37831 墙身
      this.drawWoFBody(head, top, camRY, viewH, z);
      return;
    }
    // 墙不在场：上帧还在 → 判死透（bossFled=逃逸/玩家死自毁，不播崩落）
    const gone = this.wofHeadSeen;
    this.wofHeadSeen = null;
    if (gone && gone.dead && !gone.bossFled && gone.hp <= 0) {
      this.spawnWoFDeathFx(gone, player, world, camRY, viewW, viewH, z);
    }
  }

  /** Main.wofDrawAreaTop/Bottom 权威值（bossAI_wof.wofDrawArea() 导出,AI 每 tick
   *  维护;2026-08-13 前靠"双眼间距"反解属近似,已消）。-1(墙未初始化/已消散)
   *  时回退头位 ±80 最小跨度——【本仓防御性自创回退】(原版无此路径,仅覆盖 debug
   *  生成头在首 tick 前的渲染窗;原版 160px 保底在 :25918-25925) */
  private wofDrawAreaOf(head: Enemy): { top: number; bottom: number } {
    const area = wofDrawArea();
    if (area.top >= 0 && area.bottom >= 0) return area;
    return { top: head.cy - 80, bottom: head.cy + 80 };
  }

  /** DrawWOFBody（Main.cs:37827-37875）：WallOfFlesh.png 以 16px 横条沿屏幕纵向平铺。
   *  平铺算法要点：
   *  - 帧高 num = 贴图高/3 = 140（:37829）；
   *  - num3 先取 wofDrawAreaBottom 随即被 screenPosition.Y+screenHeight 覆写（:37832-37833）
   *    → 纵向只画到【屏幕底】，与空腔下沿无关；
   *  - 行对齐：num4 = floor((top-screenY)/140)+1，top -= num4*140（:37836-37844）
   *    → 首行起点 ≡ top (mod 140)，后续行 +140 步进 = 世界坐标锚定的无缝平铺
   *    （相机平移时贴图不随屏游动）；num4>12（顶沿离屏顶 >12 行）整体跳过（:37838）；
   *  - 每行内 16px 一条横切（:37871-37873），末行按剩余高度截断；
   *  - X = 墙 hitbox 左沿，direction>0 时 -80（:37850-37852）；spriteDirection==1
   *    （AI :26041 spriteDirection=direction）水平翻转（:37856-37858）；
   *  - 动画帧行 = wofDrawFrameIndex/6*140，先取帧后自增、18 回卷（:37860-37863） */
  private drawWoFBody(
    head: Enemy, areaTop: number,
    camRY: number, viewH: number, z: number,
  ) {
    const img = this.wofTex();
    if (!img || !img.height) return;
    const num = Math.floor(img.height / 3);            // :37829 帧高 140
    const screenTop = camRY - viewH / (2 * z);         // Main.screenPosition.Y
    const screenBottom = camRY + viewH / (2 * z);      // :37833 screenPosition.Y+screenHeight
    let top = areaTop;                                 // wofDrawAreaTop(:37830)
    const rows = Math.floor((top - screenTop) / num) + 1;   // :37836
    if (rows > 12) return;                             // :37838
    const rewind = rows * num;
    if (rewind > 0) top -= rewind;                     // :37841-37844
    let x = head.x;                                    // :37850 npc.position.X
    if (head.facing > 0) x -= 80;                      // :37851-37852 direction>0
    const flip = head.facing === 1;                    // :37856-37858 spriteDirection==1
    const frameRow = Math.floor(wofDrawFrameIndex / 6) * num;  // :37860
    if (++wofDrawFrameIndex >= 18) wofDrawFrameIndex = 0;      // :37861-37863
    const ctx = this.ctx;
    const w = img.width;
    ctx.save();
    if (flip) { ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); } // 竖直中线 x+w/2 镜像
    for (let i = Math.floor(top); i < screenBottom; i += num) { // :37868
      let rowH = screenBottom - i;
      if (rowH > num) rowH = num;                      // :37869-37871
      for (let j = 0; j < rowH; j += 16) {             // :37873 16px 横条
        ctx.drawImage(img, 0, frameRow + j, w, 16, x, i + j, w, 16);
      }
    }
    ctx.restore();
  }

  /** DrawWOFRopeToTheHungry（Main.cs:37879-37928）：墙列上 Hungry 挂点
   *  （top + 跨度×ai[0]）→ 饥饿者位（Center.X, Bottom-h/2×scale）Chain12 肌腱链。
   *  段距 28×scale、终止距 40×scale（尾段高 = dist-40×scale+28）；rotation =
   *  atan2(dy,dx)-π/2 恒定；链段交替 FlipHorizontally（起始 = frameCounter>7，
   *  即 15t 嚼动周期后半）。原版源矩形/origin 用 Chain4 尺寸（16×28，与 Chain12
   *  同尺寸，数值无差）；netOffset 本地恒 0 不加 */
  private drawWoFRope(head: Enemy, h: Enemy, top: number, bottom: number) {
    const chain = this.atlas ? this.atlas.vmisc('vanilla/Chain12.png') : null;
    if (!chain) return;
    const ctx = this.ctx;
    const scale = (h.vanilla?.scale ?? 1) * h.vanillaScale;
    const mx = head.x + head.w / 2;                    // :37884 嘴中心 X
    const anchorY = top + (bottom - top) * h.ai0;      // :37890-37891 挂点
    // :37887 frameCounter>7（case 115 嚼动 counter 1..15 → 后半为真）
    let flip = ((Math.floor(h.animT) % 15) + 15) % 15 + 1 > 7;
    let px = h.cx;                                     // :37893 Center.X
    let py = h.y + h.h - h.h * 0.5 * scale;            // :37894 Bottom.Y - height*0.5*scale
    let dx = mx - px, dy = anchorY - py;
    if (dx === 0 && dy === 0) return;                  // dist=0 除零保护（原版无此态）
    const rot = Math.atan2(dy, dx) - Math.PI / 2;      // :37899
    const stop = Math.floor(40 * scale);               // :37906 num5
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      let seg = 28;                                    // :37905 段高（源矩形高）
      if (dist < stop) { seg = Math.floor(dist) - stop + 28; running = false; } // :37908-37910
      const k = (28 * scale) / dist;                   // :37912 段距 28×scale
      dx *= k; dy *= k;
      px += dx; py += dy;
      dx = mx - px; dy = anchorY - py;                 // :37914-37915
      if (seg > 0 && seg <= chain.sh) {                // 尾段 seg≤0 不画（canvas 0 高会抛）
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        if (flip) ctx.scale(-1, 1);                    // SpriteEffects.FlipHorizontally 交替
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, seg,
          -chain.sw / 2, -chain.sh / 2, chain.sw, seg);
        ctx.restore();
      }
      flip = !flip;
    }
  }

  /** DrawWOFTongueToPlayer（Main.cs:37929-37966）：嘴中心 → 舌上玩家中心 Chain12
   *  全段链，步进 = 贴图全高 28、距嘴 <40px 段不画直接收尾；恒不翻转、scale 1 */
  private drawWoFTongue(head: Enemy, p: Player) {
    const chain = this.atlas ? this.atlas.vmisc('vanilla/Chain12.png') : null;
    if (!chain) return;
    const ctx = this.ctx;
    const mx = head.x + head.w / 2;                    // :37936
    const my = head.y + head.h / 2;                    // :37937
    let px = p.x + p.w * 0.5, py = p.y + p.h * 0.5;    // :37938 玩家中心
    let dx = mx - px, dy = my - py;
    if (dx === 0 && dy === 0) return;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;      // :37942
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40) { running = false; continue; }    // :37947-37951
      const k = chain.sh / dist;                       // :37952 步进 28px
      dx *= k; dy *= k;
      px += dx; py += dy;
      dx = mx - px; dy = my - py;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        -chain.sw / 2, -chain.sh / 2, chain.sw, chain.sh);
      ctx.restore();
    }
  }

  /** 死亡崩落近似（NPC.cs:88277-88325）：无 gore 贴图机制——嘴部 gore 137-139 由
   *  Enemy.hurt 既有三色粒子爆发代位；此处补 :88296-88324 的墙列全屏血尘扫掠
   *  （门 = 玩家深于 maxTilesY-250；X = 墙左沿 direction>0 时 -80、宽 140；
   *  纵向从屏顶起 screenWidth px 高——原版用 screenWidth 当纵向跨度的怪癖照搬；
   *  46×50 网格每格原版 5 尘+1 gore → 尘降为 2、gore 0.5 概率，总量 ~150 粒
   *  （Game 粒子池 600 上限内放不下原版 ~660，故渲染层自持） */
  private spawnWoFDeathFx(
    head: Enemy, player: Player, world: World,
    camRY: number, viewW: number, viewH: number, z: number,
  ) {
    if (this.wofDeathFx.length) return;
    // :88296-88299 玩家深度门
    if (!(player.cy / TILE > world.store.h - 250)) return;
    let x0 = Math.floor(head.x);                       // :88300
    if (head.facing > 0) x0 -= 80;                     // :88301-88302
    const x1 = x0 + 140;                               // :88303
    const y0 = Math.floor(camRY - viewH / (2 * z));    // :88305 (int)screenPosition.Y
    const y1 = y0 + Math.floor(viewW / z);             // :88306 +screenWidth（原版怪癖）
    const list = this.wofDeathFx;
    for (let y = y0; y < y1; y += 50) {                // :88308
      for (let x = x0; x < x1; x += 46) {              // :88310
        for (let k = 0; k < 2; k++) {                  // 原 5 尘（Dust 5 血）
          const life = Math.round(60 + Math.random() * 40);
          list.push({
            x: x + Math.random() * 32, y: y + Math.random() * 32,
            vx: (Math.floor(Math.random() * 121) - 60) * 0.1,
            vy: (Math.floor(Math.random() * 121) - 60) * 0.1,
            life, maxLife: life, color: '#8A1A1A', size: 2 + Math.random() * 2,
            damp: 0.985, grav: 0.09,
          });
        }
        if (Math.random() < 0.5) {                     // gore 140-142 → 半数碎肉粒
          const life = Math.round(90 + Math.random() * 60);
          list.push({
            x: x + Math.random() * 32, y: y + Math.random() * 32,
            vx: (Math.floor(Math.random() * 161) - 80) * 0.1,
            vy: (Math.floor(Math.random() * 81) - 60) * 0.1,
            life, maxLife: life, color: '#5E0F0F', size: 3 + Math.random() * 3,
            damp: 0.988, grav: 0.12,
          });
        }
      }
    }
  }

  /** 崩落血尘推进+绘制（每 render 调用一步，物理与 Game.spawnParticles 同形简化） */
  private stepWoFDeathFx() {
    const list = this.wofDeathFx;
    if (!list.length) return;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.life <= 0) continue;
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; }
      p.x += p.vx; p.y += p.vy;
      list[n++] = p;
    }
    list.length = n;
    const ctx = this.ctx;
    for (const p of list) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  /** NPC.behindTiles 判定（SetDefaults 直读，Main.cs:22174 `npc[num].behindTiles == behindTiles`）：
   *  命中的实体画在 tile 层之下（钻地蠕虫族被前景方块遮挡）。血肉墙嘴/眼/饥饿者
   *  （113/114/115）SetDefaults 同为 behindTiles=true，但本仓墙身(3.7)画在 tile 之上，
   *  随族前移会被墙身盖掉——留在实体层保住"墙身垫底、精灵压上"的原版相对序
   *  （它们被前景 tile 遮挡的语义是单 tile 层下的既知折损，见 2b' 注释） */
  private isBehindTilesEnemy(e: Enemy): boolean {
    const id = e.vanillaId;
    if (id === 113 || id === 114 || id === 115) return false;
    return !!e.vanilla?.behindTiles;
  }

  private drawEnemy(e: Enemy, world: World, entities: unknown[] = []) {
    const ctx = this.ctx;
    const spr = this.assets.enemySprites.get(e.key);
    // 受击闪白
    const flash = e.iframes > 0 && e.iframes % 4 < 2;
    // 水下滤镜：与主角一致的蓝色调（检查怪物头部位置是否浸水）
    const headI = world.store.idx(Math.floor(e.cx / TILE), Math.floor((e.y + 2) / TILE));
    const underwater = world.store.liquid[headI] > 100;
    // 骷髅王手（36）的两节臂骨 IK（Main.cs:22543-22596 1:1）：从手部锚点向头
    // 中心做两段收缩（92/60 缩比），段间旋转 atan2-π/2——贴图 Arm_Bone.png
    if (e.vanillaId === 36 && e.master) this.drawSkeletronArm(e, e.master);
    // AI_013 食人怪族茎蔓（Main.cs:22433-22514 1:1）：头中心 → 锚点格(ai0/ai1)
    // 每 28px 一段 Chain 贴图步进，剩余 <40px 画一段收缩尾段对齐锚点
    if (e.vanilla?.aiStyle === 13) this.drawPlantVine(e);
    // 石巨人拳链（Main.cs:22593-22632）：拳 → 本体（AI 侧 master；本体死透锚自由头）
    if (e.vanilla?.aiStyle === 47 && e.master) this.drawGolemFistChain(e);
    // Prime 部件臂骨（Main.cs:22633-22675）：锯/激光/钳/炮 → 头 两段 IK
    if ((e.vanilla?.aiStyle ?? 0) >= 33 && (e.vanilla?.aiStyle ?? 0) <= 36 && e.master) this.drawPrimeArm(e);
    // 世纪之花钩蔓/触须链（Main.cs:22225-22285）：263/264 → 本体
    if ((e.vanillaId === 263 || e.vanillaId === 264) && e.master) this.drawPlanteraVine(e);
    // 双子互连链（Main.cs:22177-22224，1.4.5）：125 激活时单侧向 126 画一次
    if (e.vanillaId === 125) this.drawTwinsChain(e, entities);
    // ---- 原版 NPC 表精灵（数据驱动路径：纵向帧条 + 朝向翻转，原版贴图默认朝左） ----
    if (e.vanillaId != null && this.atlas) {
      // 风气球 594（Main.cs:23380-23406 独占）：贴图是 8 列变体【横条】(256×76 =
      // 32×76×8),变体索引 = ai[2]；携带史莱姆时先画帧 0 的 alpha+奴隶染色两遍
      // （气球壳随史莱姆染色）。通用竖切路径(json frames=1)会把整条横排 8 个气球
      // 全画出来——"完整逐帧贴图"(用户标注)
      if (e.vanillaId === 594) { this.drawWindyBalloon(e, entities); return; }
      // 雕像宝箱怪 690（Main.cs:23103-23134 独占）：恒以雕像形态显示——不画
      // NPC_690 贴图，而是按 ai[1] 样式从 Tiles_105 切 2×3 片 16×16 拼装
      // （direction==1 行 +3 镜像）；通用竖切路径会画错（json frames=1 单帧 28×38）
      if (e.vanillaId === 690) { this.drawStatueMimic(e); return; }
      // ---- 2D 网格贴图 NPC（原版 Main.cs DrawNPC 专属 case + FindFrame 专属 case）----
      // 这些表的动画帧是【cols×rows 网格】（Frame(cols,rows,fx,fy)），通用竖切路径
      // 会把整行/整条画出来——全部走 drawNpcGrid 切格 + 各自 FindFrame 帧状态机
      // 657 史莱姆皇后（Main.cs case 657 + FindFrame case 657）
      if (e.vanillaId === 657) { this.drawQueenSlimeGrid(e); return; }
      // 576/577 DD2 食人魔（Main.cs case 576/577 + FindFrame case 576/577）
      if (e.vanillaId === 576 || e.vanillaId === 577) { this.drawDd2OgreGrid(e); return; }
      // 696（Main.cs case 696 + FindFrame case 696）
      if (e.vanillaId === 696) { this.drawNpc696Grid(e); return; }
      // 564/565 暗黑魔法师 T1/T2（Main.cs case 564/565 + FindFrame case 564/565）
      if (e.vanillaId === 564 || e.vanillaId === 565) { this.drawDarkMageGrid(e); return; }
      // 668 鹿角怪（Main.cs DrawNPCDirect_Deerclops + FindFrame case 668）
      if (e.vanillaId === 668) { this.drawDeerclopsGrid(e); return; }
      // 月总族独占分支（Main.cs:24325-24504 case 396/397/398）：头/手/核心各自
      // 带独立锚点与叠层（上臂/前臂/躯干/胸甲/眼/破体帧），通用路径锚点不对
      if (e.vanillaId === 398) { this.drawMoonLordCore(e, entities); return; }
      if (e.vanillaId === 397) { this.drawMoonLordHand(e, entities); return; }
      if (e.vanillaId === 396) { this.drawMoonLordHead(e); return; }
      // 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554）：翅膀/双臂/
      // 二阶段覆层独占——通用路径只画本体，缺背后大翼与攻击态手臂帧
      if (e.vanillaId === 636) { this.drawEmpress(e); return; }
      // 402 星尘织带蠕虫（Main.cs:23848-23889 case 402 独占）：单 NPC 自绘
      // oldPos 拖尾（403/404 节段 + Glow_133/134 加色）+ 头本体与 Glow_135
      if (e.vanillaId === 402) { this.drawStardustWorm(e); return; }
      // 266 克苏鲁之脑（Main.cs:24799-24843 专家/FTW 四镜像 + :22949-22951 Y 偏移）
      if (e.vanillaId === 266) { this.drawBrainOfCthulhu(e, world); return; }
      // 491 荷兰飞盗船（Main.cs:24263-24324 case 491 独占）：船体 OriginFlip(208,460) 锚 +
      //  旗/桨/帆附加件叠绘 + 4 炮代画；492 炮 hide=true 由船代画（船在世时跳过独立绘制）
      if (e.vanillaId === 491) { this.drawDutchman(e, entities); return; }
      if (e.vanillaId === 492
        && (entities as Enemy[]).some((n) => n instanceof Enemy && !n.dead && n.vanillaId === 491)) {
        return;
      }
      const frames = Math.max(1, e.vanilla?.frames ?? 1);
      const frameIdx = vanillaFrameIdx(e, frames);
      const r = this.atlas.vnpc(e.vanillaId, frameIdx);
      if (r) {
        const flying = !!e.vanilla?.noGravity; void flying; // 中心锚后地面/飞行统一,仅保留语义注释
        // 原版 NPC.scale（SetDefaults base × netID scale × 专家档体型系数）——作用于渲染。
        // 专家系数（Tweaks :18187/:18198/:18300/:18309：世吞 13-15 ×1.2、克脑 266/
        // 爬行者 267/毁灭者 134-136/探针 139 ×1.05）只乘 npc.scale 不回写宽高
        // （NewNPC 的 width/height×scale 在 ScaleStats 之前，NPC.cs:17744-17747）——
        // 碰撞盒保持 base 盒（本仓 e.w/e.h 已按 base 乘，勿在此扩盒）
        const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale
          * expertRenderScale(e.vanillaId ?? 0);
        ctx.save();
        // 锚点:飞行型=帧中心(原版默认分支 Main.cs:23635 语义);地面型=底锚+逐帧
        // 实测底部透明行数补偿(spriteBottomPad)——NPC 帧底普遍 ~2px 透明边距,
        // 裸底锚会悬空 2px、中心锚会入地 2px(实测反馈),pad 补偿数学上保证贴地。
        // 与纸娃娃(:1266)/legacy(:1301)/小动物(:763)四路统一
        const grounded = !flying;
        // 416 日耀掠兽骑手（Main.cs:24508-24515 case 416 独占）：绘制位置吸附坐骑
        // 415 的 Bottom（AI 锚 Center+(-spriteDir*10,-30) 只喂碰撞盒——骑手视觉上
        // 双脚踩在掠兽脚平面，+4px 是帧底透明边距，与地面族 pad 同义）。
        // 其余 aiStyle 75 骑手（390）原版无此绘制覆写，仍用 AI 位
        const snapMount = e.vanillaId === 416 && e.master && !e.master.dead ? e.master : null;
        ctx.translate(snapMount ? snapMount.cx : e.cx,
          snapMount ? snapMount.y + snapMount.h : (grounded ? e.y + e.h : e.cy));
        // 旋转族:整体随自转角旋转(原版 npc.rotation;朝向翻转不适用)。
        // 4=克眼 visAngle;35/68=骷髅王头 spin;125/126=双子;127-131=Prime 头+部件;134-136=毁灭者链
        const rotId = ROTATION_NPC.has(e.vanillaId);
        // ★旋转驱动族总判定：朝向完全由 rotation 决定，原版这些家族不动 spriteDirection
        // （默认 -1 从不镜像）——渲染层禁止对其叠加 facing 镜像，否则"屁股朝前"
        // （噬魂怪 aiStyle5 实踩）。新增旋转族 AI 时必须登记在此，旋转与镜像共用本判定。
        // 例外：AI_005 内的"仅倾斜"成员（黄蜂 42/231-235、孢子蝠 176/205、蜜蜂 210/211）
        // 贴图横画、只 tilt 不转头——它们仍需镜像翻转朝向（原版同款 spriteDirection 翻转）。
        const idR = e.vanillaId ?? -1;
        const stR = e.vanilla?.aiStyle ?? 0;
        const tiltOnly5 = stR === 5 && (idR === 42 || idR === 176 || idR === 205 || idR === 210
          || idR === 211 || (idR >= 231 && idR <= 235));
        const rotationDriven = !tiltOnly5
          && (idR === 4 || rotId || stR === 5 || stR === 6 || stR === 23 || stR === 40 || stR === 56);
        if (e.vanillaId === 4) ctx.rotate(e.visAngle);
        else if (e.vanillaId === 116) {
          // 饥饿者 II（FindFrame case 116，cs:74789-74808）：rotation=atan2(vy,vx)，
          // vx<0 再 +π；spriteDirection=sign(vx)（vx>0 镜像——在下方通用镜像位补，
          // 本分支自带旋转故进 rotationDriven 禁用 facing 镜像，否则双翻）
          if (e.vx !== 0) ctx.rotate(Math.atan2(e.vy, e.vx) + (e.vx < 0 ? Math.PI : 0));
        }
        else if (e.vanilla?.aiStyle === 5) {
          // AI_005 旋转按族分流（cs:51045-51054 + FindFrame 蜜蜂覆盖 L75553）：
          // 黄蜂 42/231-235、孢子蝠 176、205 仅倾斜 vx*0.1（不随飞行方向转头）；
          // 蜜蜂 210/211 倾斜 vx*0.2；其余（噬魂怪族等）朝目标/速度方向转头。
          // 全族统一转头会让黄蜂蜜蜂飞行中整只倒转=贴图翻转观感
          const id5 = e.vanillaId;
          if (id5 === 42 || id5 === 176 || id5 === 205 || (id5 >= 231 && id5 <= 235) || id5 === 61) ctx.rotate(e.vx * 0.1);  // 61 秃鹫 FindFrame rotation=vx*0.1(:74240)
          else if (id5 === 210 || id5 === 211) ctx.rotate(e.vx * 0.2);
          else ctx.rotate(e.visAngle);
        }
        else if (e.vanilla?.aiStyle === 6) ctx.rotate(e.visAngle); // AI_006 蠕虫族:cs:51500 段随链方向旋转(贴图正面朝上,+π/2)
        else if (e.vanilla?.aiStyle === 40) ctx.rotate(e.visAngle); // AI_040 爬墙蜘蛛:npc.rotation 随移动/期望速度角(cs:29865/29919),531 +π/2
        else if (e.vanilla?.aiStyle === 23) ctx.rotate(e.visAngle); // AI_023 飞行武器:冲刺角 atan2+0.785 / 蓄转递增(cs:25336-25390)
        else if (e.vanilla?.aiStyle === 56) ctx.rotate(e.visAngle); // AI_056 地牢之魂:rotation=atan2(v)-π/2(cs:32927)
        else if (e.vanilla?.aiStyle === 13) ctx.rotate(e.visAngle); // AI_013 植物族:头随朝玩家伸展方向旋转(cs:22778-22794);spriteDirection 仍翻转→不进 rotationDriven
        else if (stR === 93) ctx.rotate(e.visAngle);   // AI_093 荷兰飞盗船:rotation=vx*0.025(cs:41011);spriteDirection=-sign(vx) 仍镜像
        else if (stR === 102 || stR === 109) ctx.rotate(e.visAngle); // AI_102/109 沙尘精/黑暗魔法师:rotation=vx*0.04(cs:42249/:66415)
        else if (stR === 103) ctx.rotate(e.visAngle);  // AI_103 沙鲨族:rotation=vy*dir*0.1 钳±0.2(cs:42765)
        else if (stR === 18) ctx.rotate(e.visAngle);   // AI_018 水母族:漂移形 rotation=vx*0.4 / 攻击形 atan2(v)+π/2 / 离水 vx*0.1(cs:24371/24422/24459)
        else if (stR === 108 || stR === 110) ctx.rotate(e.visAngle); // AI_108 俯冲飞行族(cs:66120 速度角±π折叠)/AI_110 Betsy(cs:62714 AngleTowards):均保留 spriteDirection 镜像
        else if (stR === 117) ctx.rotate(e.visAngle);  // AI_117 恐惧鹦鹉螺:rotation 状态机(AngleTowards/AngleLerp,cs:47615);spriteDirection 仍镜像
        else if (rotId) ctx.rotate(e.spin);
        ctx.scale(scale, scale);
        if (!rotationDriven && e.facing > 0) ctx.scale(-1, 1); // 原版默认朝左；旋转族（rotationDriven）禁镜像
        if (e.vanillaId === 116 && e.vx > 0) ctx.scale(-1, 1); // 116 spriteDirection=sign(vx)（FindFrame case 116 自带翻转）
        // 原版 alpha 语义（NPC.Opacity/GetAlpha）：不透明度 = 1 - alpha/255。
        // alpha 是 SetDefaults 每类型静态值（0=实体；史莱姆 175=半透明凝胶），无通用渐隐
        ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
        // EoC 锚点修正:NPC_4 每帧 110×166,眼球主体质心在帧内 y≈106(张嘴帧 113),
        // 帧中心 83——原版通用锚点(帧中心==碰撞盒中心)会让 100×110 的盒偏在
        // 血管尾/眼球上方。碰撞盒尺寸保持原版,绘制整体下移 (质心−帧中心)
        // 让眼球主体居中于盒(用户 2026-08-11 拍板;张嘴帧偏移略大)
        // 地面型:底锚 + pad(帧底透明行)贴地;飞行型:中心锚。EoC 额外 +23/+30 眼球修正
        const pad = grounded ? this.spriteBottomPad(r, `npc${e.vanillaId}:f${frameIdx}`) : 0;
        const anchorY = grounded ? -r.sh + pad : -r.sh / 2;
        const eocOff = e.vanillaId === 4 ? (frameIdx < 3 ? 23 : 30) : 0;
        // 回填实际贴图底边（世界 y），供 drawHealthBar 定位兜底（见 Enemy.spriteBottomWorld 注释）
        e.spriteBottomWorld = (grounded ? e.y + e.h : e.cy) + (anchorY + eocOff + r.sh);
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY + eocOff, r.sw, r.sh);
        // ---- EoC 冲刺残影（Main.cs:25469-25481 1:1）：门 = ai[0]==3 且 ai[1]≥4
        //      （P2 连冲态 4 / 悬下方回冲态 5）→ 沿 oldPos 画 9 层鬼影，每层 RGBA
        //      × 0.5×(10−i)/20（越旧越淡），同一帧/旋转，锚点同本体（中心+eocOff）。
        //      原版该分支在 DrawNPC 本体 Draw 之后求值 → 鬼影压在本体之上（越近越深）；
        //      此前近似门 dashing && phase≥2 把普通 3 连冲也画了鬼影且画在本体之前。
        //      仓内映射：ai0=ai[0]、state=ai[1]（见 Enemy.eocAI 头注）----
        if (e.vanillaId === 4 && e.ai0 === 3 && e.state >= 4) {
          for (let i = 1; i < 10; i++) {
            const depth = e.historyDepth();
            if (i >= depth) break;
            const ga = (10 - i) / 40;   // 0.5 × (10-i)/20
            if (ga <= 0.01) continue;
            ctx.save();
            ctx.translate(e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2);
            ctx.rotate(e.visAngle);
            ctx.scale(scale, scale);
            if (!rotationDriven && e.facing > 0) ctx.scale(-1, 1);
            ctx.globalAlpha = ga * (1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255);
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2 + eocOff, r.sw, r.sh);
            ctx.restore();
          }
          ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
        }
        // 原版 color 二次绘制（Main.cs:24527 + NPC.GetColor L94903）：color≠default 时用
        // 同贴图再画一遍、逐像素乘 color（XNA SpriteBatch 天生贴轮廓）；
        // color.A 决定该 pass 强度（史莱姆贴图是白剪影，颜色全靠这层）
        if (e.colorRGBA && e.colorRGBA[3] > 0) {
          // XNA 预乘混合等价（BlendState.AlphaBlend：out = texel×colorRGB + D×(1-colorA/255)）。
          // 普通 drawImage 会把染色 RGB 再乘 alpha（蓝色糊成灰绿）——改为两步：
          // ① 原始精灵 destination-out 按 colorA 削弱底下内容 ② lighter 全量加染色精灵
          const tinted = this.tintedSprite(`npc${e.vanillaId}`, r, e.colorRGBA);
          const anchorY2 = grounded ? -r.sh + pad : -r.sh / 2;
          const anchorY = anchorY2 + eocOff; // 与基础层同锚——曾残留旧底锚条件,
          // 基础/染色两层错位 → 史莱姆"彩色+灰影"双画
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = e.colorRGBA[3] / 255;
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY, r.sw, r.sh);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(tinted, -r.sw / 2, anchorY, r.sw, r.sh);
          ctx.globalCompositeOperation = 'source-over';
        }
        // 史莱姆王体内忍者（Main.cs:22798-22818 1:1）：独立贴图 Ninja.png 叠画在
        // KS 中心，随速度反向摆动（zero=-vy / -vx*2）+ rotation=vx*0.05，
        // 帧顶 120/360/480 的挤压帧 y 修正（+2/-2/-6）
        if (e.vanillaId === 50) {
          const ninja = this.atlas.vmisc('vanilla/Ninja.png');
          if (ninja) {
            const zeroY = -e.vy + (r.sy === 120 ? 2 : r.sy === 360 ? -2 : r.sy === 480 ? -6 : 0);
            const zeroX = -e.vx * 2;
            ctx.save();
            ctx.translate(zeroX, -e.h / 2 + zeroY);   // 当前原点=KS 底心 → 中心=(0,-h/2)
            ctx.rotate(e.vx * 0.05);
            ctx.drawImage(ninja.img, -ninja.sw / 2, -ninja.sh / 2, ninja.sw, ninja.sh);
            ctx.restore();
          }
          // 头顶金冠（Main.cs:25571-25595 case 50，1:1）：贴图 Extra_39（82×56，
          // wiki"the crown...separate image files...Extra_39 internally"）。锚点 =
          // KS Center 上移 (70-num223)×scale，num223 按帧序 [2,-6,2,10,2,0]；
          // 朝向翻转继承外层 facing scale。gfxOffY 恒 0（KS 无悬浮偏移）
          const crown = this.atlas.vmisc('vanilla/Extra_39.png');
          if (crown) {
            const frameIdx2 = Math.round(r.sy / r.sh);
            const num223 = [2, -6, 2, 10, 2, 0][frameIdx2] ?? 0;
            ctx.drawImage(crown.img, -crown.sw / 2, -e.h / 2 - (70 - num223) * scale - crown.sh / 2, crown.sw, crown.sh);
          }
        }
        // NPC GlowMask 发光叠画（Main.cs DrawNPC 内硬编码 switch，见 drawNpcGlow 表）
        // ——与基础精灵同变换叠加（原版同一 position/origin 二次 Draw）
        // bx/by = 基础精灵目标左上（地面型=底锚+pad / 飞行型=中心锚），发光层与本体同锚
        this.drawNpcGlow(e, r, -r.sw / 2, anchorY + eocOff);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // 星璇塔护盾半球（在精灵之后叠画，对齐原版 DrawNPC 尾段顺序）
        if (isTowerId(e.vanillaId)) this.drawTowerShield(e, world);
        return;
      }
      return; // 表未加载完成：本帧不画（下帧懒加载完成）
    }
    // ---- Maples 精灵优先 ----
    if (this.atlas) {
      let frames: ReturnType<SpriteAtlas['animFrames']> = [];
      let anchor: 'feet' | 'center' = 'feet';
      if (e.key.startsWith('slime')) { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'zombie') { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'cave_bat') {
        // 洞穴蝙蝠：原版 NPC_49（44x32×5 帧扑翼），逐帧动画
        if (!this.enemyAnimCache.has('bat49')) {
          const list: ReturnType<SpriteAtlas['animFrames']> = [];
          for (let k = 0; k < 5; k++) {
            const r = this.atlas!.vnpc(49, k);
            if (r) list.push(r);
          }
          this.enemyAnimCache.set('bat49', list);
        }
        frames = this.enemyAnimCache.get('bat49') ?? [];
        anchor = 'center';
      }
      else if (e.key === 'demon_eye') {
        // 恶魔之眼：NPC_2 双帧
        frames = this.enemyAnimCache.get('deye') ?? [];
        if (!frames.length) {
          const file = this.atlas.data.files['角色/NPC_2.png'];
          if (file) {
            frames = file.sprites.map((sp) => this.atlas!.rect('角色/NPC_2.png', sp.name)).filter(Boolean) as typeof frames;
          }
          this.enemyAnimCache.set('deye', frames);
        }
        anchor = 'center';
      }
      else if (e.key === 'eye_of_cthulhu') {
        // Boss 用 NPC_4：底部 3 帧 = 一阶段动画，顶部 3 帧 = 二阶段（实测对调）
        if (!this.enemyAnimCache.has('eoc_p1')) {
          const file = this.atlas.data.files['角色/NPC_4.png'];
          const toFrames = (arr: typeof file.sprites) =>
            arr.map((s) => this.atlas!.rect('角色/NPC_4.png', s.name)).filter(Boolean) as ReturnType<SpriteAtlas['animFrames']>;
          if (file) {
            const sorted = [...file.sprites].sort((a, b) => a.y - b.y); // 顶部在前
            this.enemyAnimCache.set('eoc_p1', toFrames(sorted.slice(3, 6)));
            this.enemyAnimCache.set('eoc_p2', toFrames(sorted.slice(0, 3)));
          } else {
            this.enemyAnimCache.set('eoc_p1', []);
            this.enemyAnimCache.set('eoc_p2', []);
          }
        }
        frames = e.phase === 2
          ? (this.enemyAnimCache.get('eoc_p2') ?? [])
          : (this.enemyAnimCache.get('eoc_p1') ?? []);
        anchor = 'center';
      }
      if (frames.length) {
        const rate = e.key === 'eye_of_cthulhu' ? (e.phase === 2 ? 6 : 10) : 12;
        const idx = Math.floor(e.animT / rate) % frames.length;
        const fr = frames[idx];
        ctx.save();
        if (flash) ctx.filter = 'brightness(2.5)';
        else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
        // 缩放贴合碰撞盒
        const h = anchor === 'feet' ? e.h * 1.25 : e.h;
        const w = (fr.sw / fr.sh) * h;
        if (anchor === 'feet') {
          ctx.translate(e.cx, e.y + e.h);
          // 素材默认朝左：向右移动时镜像（僵尸实测需要与其它怪一致的翻转）
          const flip = -e.facing;
          ctx.scale(flip, 1);
          // 贴底：按精灵最低不透明行对齐脚底（史莱姆贴图底部有透明留白会浮空）
          const pad = this.spriteBottomPad(fr);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h + pad * (h / fr.sh), w, h);
        } else if (e.key === 'demon_eye') {
          // 恶魔之眼：以眼球为原点按移动方向自由旋转（贴图默认朝左，与 NPC 系素材一致）
          const ang = Math.atan2(e.vy, e.vx) + Math.PI;
          ctx.translate(e.cx, e.cy);
          ctx.rotate(ang);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else if (e.key === 'eye_of_cthulhu') {
          // 朝向移动方向自由旋转（AI 端平滑追踪目标角度，变身时三圈自转叠加）
          ctx.translate(e.cx, e.cy);
          ctx.rotate(e.visAngle);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else {
          ctx.translate(e.cx, e.cy);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
        ctx.filter = 'none';
        return;
      }
    }
    // ---- 程序化兜底 ----
    if (e.key.startsWith('slime') && spr) {
      const sq = 1 + e.squash * 0.25;
      const w = e.w * 1.3 * sq, h = e.h * 1.25 / sq;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
      ctx.translate(e.cx, e.y + e.h);
      ctx.scale(e.facing, 1);
      ctx.drawImage(spr.canvas, -w / 2, -h, w, h);
      ctx.restore();
      ctx.filter = 'none';
    } else if (spr) {
      const fw = spr.fw;
      const frame = spr.canvas.width > fw ? Math.floor(e.animT / 12) % (spr.canvas.width / fw) : 0;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      if (e.key === 'eye_of_cthulhu') {
        ctx.translate(e.cx, e.cy);
        if (e.phase === 2) {
          const f = Math.floor(e.animT / 10) % 2;
          ctx.drawImage(spr.canvas, f * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        } else {
          ctx.scale(e.facing, 1);
          ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        }
      } else {
        ctx.translate(e.cx, e.cy);
        ctx.scale(e.facing, 1);
        ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
      }
      ctx.restore();
      ctx.filter = 'none';
    }
    void world;
  }

  /** Arm_Bone.png 懒加载（骷髅王臂骨；vanilla 独立贴图，非 NPC 表） */
  private armBoneImg: HTMLImageElement | null | undefined;

  // ===================== NPC GlowMask 体系（Main.cs DrawNPC 硬编码发光层） =====================
  // 原版 NPC 无通用 glowMask 字段（与 Projectile/Item 不同）：发光层是 DrawNPC 里
  // 逐类型硬编码的 TextureAssets.GlowMask[N] 二次 Draw。下表为全量对照（1.4.5.6
  // Main.cs:23099/23480/23594/23746-23776/23878-23886/24218-24226/24531-24535）：
  //   mode 'frame'   同帧整图叠加（火星飞碟族/Betsy/暗黑魔法师/永恒水晶/银河织带/探测器/吮脑怪）
  //   mode 'vel4'    以速度向量四向旋转偏移画 4 份灰 A=64 拷贝（四塔 + 火星飞骑 416）
  //   mode 'trail'   419 火月怪：本体罩 + vel4/UnitX4 + ai2<=-9 时 oldPos 0..6 拖尾
  //                  （:24610-24645，Enemy.historyDepth/histXAt 历史缓冲）
  // 第二批已接（原"未接登记"销核）：Glow_100/101+Extra_20（399 探测器 :24564-24575）、
  // Glow_156（416 火龙怪骑士 :24531-24535 底心 +4px 锚 + vel4×0.5）、Glow_154（419 :25677-25696
  // + 拖尾）、Glow_146（421 吮脑怪 :25618-25621 A=128-α/2）。
  // Projectile glowMask（:34327-34378）与 Item glowMask（:38072-38213）不在本批。
  //
  // ---- 第三批（通用化，2026-08-13）：DrawNPCDirect 尾部 "switch(type) → GlowMask[N]
  // 同帧整图叠加" 家族全量入库（Main.cs:25597-25787 月族/星族 + :25044-25545 散件）。
  // ★命名陷阱：Glow_{id}.png 是 GlowMaskID 空间（TextureAssets.GlowMask[N]，
  // AssetInitializer.cs:650-653，共 379 张），与 NPC id 无恒等关系（392→Glow_48、
  // 493→Glow_132）——禁止按 vanillaId 猜文件名，一切以 Main.cs 绘制点反查为准。
  //   mode 'frame4'  中心整图 + 四向偏移 4 份（月族 415/417/418/518/315/346 与 416）
  //   a 字段         中心层 alpha 表达式：'255a'=(255-α)/255、'128a2'=(128-α/2)/255、
  //                  'opacity'=NPC.Opacity、数字=常数（缺省走上方旧 id 链）
  // ---- 第四批（2026-08-13）：轨道族 + 运行时态特殊分支 ----
  //   mode 'orbit'   环绕轨道族 541/568/569/661（Main.cs:26086-26128）：碰撞盒中心 1 份
  //                  + 极角 i/count×2π 环绕的 Glow 拷贝（参数在 NPC_GLOW_ORBIT）
  //   dy             世界 px Y 锚微调（653 地狱蝴蝶 +3 vs 族内 +4 → -1，:25198/:25194）
  //   fadeA          Color.A 背景衰减（XNA AlphaBlend=src One：out = texel·RGB +
  //                  D·(1-texelA·A/255)）——非零时 lighter 前先 destination-out 削底
  //   full           437 教徒石板第二层整图罩（Glow_108 null 源矩形=全图，:25488）
  //   sparkle        425 星璇枪手枪口星芒（DrawPrettyStarSparkle :25631-25633/:34734-34750）
  //   spinner        520 火星行者旋转指示灯（Extra_56+Glow_165，:25425-25443）
  private static readonly NPC_GLOW: Record<number, {
    tex: string; mode: 'frame' | 'frame4' | 'vel4' | 'trail' | 'orbit';
    /** vel4 速度偏移倍率（四塔 4；416 骑手 :24538 为 0.5 + 光照项） */
    velMult?: number;
    /** frame4 固定四向偏移（UnitX.RotatedBy(k*π/2)×n，:25736/:25746）替代速度偏移 */
    fixed4?: number;
    /** frame4 绘制原点 X 平移（518 halfSize+(-10,0) :25722 → 图像右移 10px） */
    dx?: number;
    /** 世界 px Y 锚微调（orbit 族 568/569 的 num47=-3 在 NPC_GLOW_ORBIT.dy） */
    dy?: number;
    /** 中心层 alpha 表达式（见上；缺省 = 旧 id 链） */
    a?: number | '255a' | '128a2' | 'opacity';
    /** Color.A 背景衰减常数（运行时态 387/414 在 drawNpcGlow 内计算覆盖） */
    fadeA?: number;
    /** 399 探测器状态灯（:24571-24575）：Extra_20(ai0+1 行) 本体 + glow 罩，dy=+24px */
    lamp?: { tex: string; glow: string; dy: number };
    /** 437 第二层整图罩（:25488 null 源矩形） */
    full?: string;
    /** 425 枪口星芒（Extra_98；位置 = 帧中心 +dx 本地 X，:25632 的 27×-spriteDirection
     *  折进已镜像本地系恒为 +27） */
    sparkle?: { tex: string; dx: number };
    /** 520 旋转指示灯（Extra_56 source-over 本体 + Glow_165 lighter 光环） */
    spinner?: { tex: string; glow: string; dy: number };
  }> = {
    392: { tex: 'vanilla/Glow_48.png', mode: 'frame' },   // 火星飞碟主体（:24218 Color(200,200,200,0)）
    395: { tex: 'vanilla/Glow_49.png', mode: 'frame' },   // 飞碟核心（:24222）
    394: { tex: 'vanilla/Glow_50.png', mode: 'frame' },   // 飞碟炮塔（:24226）
    551: { tex: 'vanilla/Glow_226.png', mode: 'frame' },  // Betsy（:23099 Lerp(color,White,0.6) A=66）
    564: { tex: 'vanilla/Glow_225.png', mode: 'frame' },  // 暗黑魔法师 T1（:23480 white×Opacity A/2）
    565: { tex: 'vanilla/Glow_225.png', mode: 'frame' },  // 暗黑魔法师 T2
    548: { tex: 'vanilla/Glow_239.png', mode: 'frame' },  // 永恒水晶（:23594 呼吸脉冲底层）
    402: { tex: 'vanilla/Glow_135.png', mode: 'frame' },  // 银河织带头（:23886 白 A=255-num291）
    422: { tex: 'vanilla/Glow_149.png', mode: 'vel4' },   // 太阳塔（:23766）
    493: { tex: 'vanilla/Glow_132.png', mode: 'vel4' },   // 星尘塔（:23746）
    507: { tex: 'vanilla/Glow_143.png', mode: 'vel4' },   // 星云塔（:23756）
    517: { tex: 'vanilla/Glow_162.png', mode: 'vel4' },   // 星璇塔（:23776，+UnitX*2 偏移）
    // ---- 第二批（底锚/拖尾族）----
    399: { tex: 'vanilla/Glow_100.png', mode: 'frame',   // 火星探测器：本体罩 A=127-α/2（:24564）
      lamp: { tex: 'vanilla/Extra_20.png', glow: 'vanilla/Glow_101.png', dy: 24 } },
    416: { tex: 'vanilla/Glow_156.png', mode: 'frame4', velMult: 0.5, a: '255a' },  // 火龙怪骑士（:24531 中心 + :24533-24537 vel4×0.5）
    419: { tex: 'vanilla/Glow_154.png', mode: 'trail' }, // 火月怪（:25677-25696 + :24610-24645 拖尾）
    421: { tex: 'vanilla/Glow_146.png', mode: 'frame' }, // 吮脑怪：底锚 A=128-α/2（:25618-25621）
    // ---- 第三批 A：DrawNPC 尾段散件（单帧整图叠加，Main.cs:25044-25545）----
    24: { tex: 'vanilla/Glow_360.png', mode: 'frame', a: 'opacity' },    // 火焰小鬼（:25044-25047 GetAlpha(White)）
    383: { tex: 'vanilla/Glow_11.png', mode: 'frame', a: 1 },            // 火星军官（:25258-25260）
    386: { tex: 'vanilla/Glow_31.png', mode: 'frame', a: 1 },            // 火星工程师（:25445-25448）
    387: { tex: 'vanilla/Glow_32.png', mode: 'frame' },                  // 特斯拉炮塔（:25451-25459；亮度/A 随 ai0 充能链见 npcGlowTeslaFade）
    388: { tex: 'vanilla/Glow_33.png', mode: 'frame', a: 1 },            // 火星无人机（:25460-25463）
    389: { tex: 'vanilla/Glow_34.png', mode: 'frame', a: 1 },            // 电圈僵尸（:25464-25467）
    437: { tex: 'vanilla/Glow_109.png', mode: 'frame', a: 1, fadeA: 200 / 255,
      full: 'vanilla/Glow_108.png' },                                    // 教徒石板（:25484-25488；A=200 显著→fadeA+整图罩）
    472: { tex: 'vanilla/Glow_110.png', mode: 'frame', a: '255a' },      // 暗焰幻灵（:25542-25545）
    520: { tex: 'vanilla/Glow_164.png', mode: 'frame', a: 1,
      spinner: { tex: 'vanilla/Extra_56.png', glow: 'vanilla/Glow_165.png', dy: 20 } }, // 火星行者（:25422-25443 旋转指示灯）
    653: { tex: 'vanilla/Glow_288.png', mode: 'frame', a: 1, dy: -1 },   // 地狱蝴蝶（:25195-25198 锚 +3 vs 族内 +4 → dy=-1）
    654: { tex: 'vanilla/Glow_290.png', mode: 'frame', a: 1 },           // 熔岩萤火虫（:25191-25194）
    160: { tex: 'vanilla/Glow_166.png', mode: 'frame', a: '128a2' },     // 松露人（:25766-25778；微光变体 Glow_352 链见 npcGlowVariantTex）
    209: { tex: 'vanilla/Glow_167.png', mode: 'frame', a: '128a2' },     // 电子人（:25780-25784；变体 Glow_350/351 链见 npcGlowVariantTex）
    // 城镇宝石小动物 639-645 → Glow_286、646-652 → Glow_287（:25048-25055 GetAlpha(White)）
    639: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    640: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    641: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    642: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    643: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    644: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    645: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    646: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    647: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    648: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    649: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    650: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    651: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    652: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    // ---- 第三批 B：月柱事件族（Main.cs:25597-25637 的 case 逐条，底锚同帧整图）----
    411: { tex: 'vanilla/Glow_136.png', mode: 'frame', a: '128a2' },     // 观星者（:25597-25598）
    409: { tex: 'vanilla/Glow_138.png', mode: 'frame', a: '255a' },      // 闪耀喷射者（:25600-25601）
    410: { tex: 'vanilla/Glow_137.png', mode: 'frame', a: '255a' },      // 银河织带尾（:25603-25604）
    407: { tex: 'vanilla/Glow_139.png', mode: 'frame', a: '255a' },      // 流星入侵者（:25606-25607）
    405: { tex: 'vanilla/Glow_141.png', mode: 'frame', a: '128a2' },     // 星细胞（:25609-25610）
    406: { tex: 'vanilla/Glow_142.png', mode: 'frame', a: '128a2' },     // 小星细胞（:25612-25613）
    424: { tex: 'vanilla/Glow_144.png', mode: 'frame', a: '128a2' },     // 预言者（:25615-25616）
    423: { tex: 'vanilla/Glow_145.png', mode: 'frame', a: '128a2' },     // 进化兽（:25618-25619）
    420: { tex: 'vanilla/Glow_147.png', mode: 'frame', a: '128a2' },     // 星云浮怪（:25624-25625）
    425: { tex: 'vanilla/Glow_150.png', mode: 'frame', a: '128a2',
      sparkle: { tex: 'vanilla/Extra_98.png', dx: 27 } },                // 星璇枪手（:25627-25633；枪口星芒）
    429: { tex: 'vanilla/Glow_151.png', mode: 'frame', a: '128a2' },     // 旋涡怪（:25636-25637）
    412: { tex: 'vanilla/Glow_157.png', mode: 'frame', a: '255a' },      // 爬足虫头（:25645-25664）
    413: { tex: 'vanilla/Glow_158.png', mode: 'frame', a: '255a' },      // 爬足虫身
    414: { tex: 'vanilla/Glow_159.png', mode: 'frame', a: '255a' },      // 爬足虫尾（:25656-25663 localAI[2] 受击红闪见 npcGlowCrawltipedeFlash）
    525: { tex: 'vanilla/Glow_169.png', mode: 'frame', a: 200 / 255 },   // 邪恶食尸鬼（:25754-25755）
    526: { tex: 'vanilla/Glow_170.png', mode: 'frame', a: 200 / 255 },   // 污染食尸鬼（:25757-25758）
    527: { tex: 'vanilla/Glow_171.png', mode: 'frame', a: 200 / 255 },   // 梦游食尸鬼（:25760-25761）
    533: { tex: 'vanilla/Glow_172.png', mode: 'frame', a: 1 },           // 沙漠之魂（:25763-25764 Color(255,255,255,100)）
    426: { tex: 'vanilla/Glow_153.png', mode: 'frame', a: '128a2' },     // 外星蜂后（:26079-26081）
    427: { tex: 'vanilla/Glow_152.png', mode: 'frame', a: '255a' },      // 外星黄蜂（:26076-26078）
    // ---- 第三批 C：中心罩 + 四向偏移族（mode 'frame4'）----
    418: { tex: 'vanilla/Glow_161.png', mode: 'frame4', velMult: 0.25, a: '255a' }, // 陨石火怪（:25639-25649）
    415: { tex: 'vanilla/Glow_155.png', mode: 'frame4', velMult: 0.5, a: '255a' },  // 龙马（:25671-25681）
    417: { tex: 'vanilla/Glow_160.png', mode: 'frame4', velMult: 0.25, a: '255a' }, // 滚球蜥（:25700-25710）
    518: { tex: 'vanilla/Glow_163.png', mode: 'frame4', velMult: 0.5, dx: 10, a: '255a' }, // 太空入侵者飞行种（:25720-25731）
    344: { tex: 'vanilla/Glow_253.png', mode: 'frame', a: 0.39 },       // 常绿尖叫树（:25731-25733 Color(200,200,200,100)*0.5）
    346: { tex: 'vanilla/Glow_254.png', mode: 'frame4', fixed4: 4, a: 200 / 255 },  // 坐骑雪橇-NK1（:25734-25743）
    315: { tex: 'vanilla/Glow_255.png', mode: 'frame4', fixed4: 2, a: 1 },          // 无头骑士（:25744-25753）
    // ---- 第四批：环绕轨道族（Main.cs:26086-26128，参数表 NPC_GLOW_ORBIT）----
    541: { tex: 'vanilla/Glow_216.png', mode: 'orbit' },   // 沙元素（:26086-26096 Glow_216 ×4 Gold 轨道）
    568: { tex: 'vanilla/Glow_224.png', mode: 'orbit' },   // 枯萎兽 T2（:26116-26128 Glow_224 ×4 HotPink，出生门）
    569: { tex: 'vanilla/Glow_224.png', mode: 'orbit' },   // 枯萎兽 T3
    661: { tex: 'vanilla/NPC_661.png', mode: 'orbit' },    // 帝皇蝶（:26099-26113 自贴图 ×6 HSL 彩虹轨道——
    //                                                     原版画 value80=TextureAssets.Npc[661] 即本表 tex 同文件）
  };

  /** NPC_GLOW 表全量条目（[npcId, 贴图路径]）——供 tests/visual-extras.test.ts
   *  抽查素材存在性（表内每个 tex 都必须真实落在 public/sprites/vanilla/）。 */
  static npcGlowEntries(): Array<[number, string]> {
    return Object.entries(Renderer.NPC_GLOW).map(([id, g]) => [Number(id), g.tex]);
  }

  /** 表配置直读（tests 断言 full/sparkle/spinner/dy/fadeA 等特殊分支触发位） */
  static npcGlowConfig(id: number) {
    return Renderer.NPC_GLOW[id] ?? null;
  }

  // ===================== 轨道族参数 + 特殊分支纯函数（第四批） =====================
  // 全部无 DOM/无 this 依赖，tests/visual-extras.test.ts 直接断言。
  // 标杆：Main.cs:25805-26204（ghost 族绘制块）+ :26086-26128（轨道 Glow 段）。
  private static readonly NPC_GLOW_ORBIT: Record<number, {
    /** num299 环绕份数（:25892/:25902/:25911/:25918） */
    count: number;
    /** num300 呼吸周期 s（GlobalTimeWrappedHourly % period） */
    period: number;
    /** num300 包络：'half'=cos/2+0.5（0..1）；'sixth'=cos/6+0.75（0.583..0.917） */
    env: 'half' | 'sixth';
    /** 半径 num300 系数（541/568=4；661=2+ai[2]） */
    rBase: number;
    /** 半径常数项（恒 2，:26091/:26108/:26123 的 +2f） */
    rAdd: number;
    /** 661：rBase 项 = 2+ai[2]（:26106 num320 = 2f + ai[2]） */
    ai2Radius?: boolean;
    /** 661：num300 下限 = GetLerpValue(0,60,ai[2])（:25921） */
    ai2Gate?: boolean;
    /** 661：相位 num302 = Lerp(0,3,GetLerpValue(0,60,ai[2]))（:26100） */
    phaseAi2?: boolean;
    /** color43 染色（:25895 HotPink / :25914 Gold / :26105 HSL 彩虹） */
    tint: 'gold' | 'hotpink' | 'hsl';
    /** 拷贝亮度 ×(1-num300×k)（541/568=1；661=0.5 :26106） */
    copyFade: number;
    /** 中心层亮度系数（541/568=1 原色；661=0.1 :26113 White×0.1） */
    center: number;
    /** 568/569：localAI[3]≥60 出生门（:26116） */
    spawnGate?: boolean;
    /** num47 世界 px Y 偏移（568/569=-3 :25898） */
    dy?: number;
  }> = {
    // 541 沙元素（:25910-25914 num299=4/period 2.4/Gold；半径 4·num300+2 :26091）
    541: { count: 4, period: 2.4, env: 'half', rBase: 4, rAdd: 2, tint: 'gold', copyFade: 1, center: 1 },
    // 568/569 枯萎兽（:25892-25898 num299=4/period 1.5/HotPink(A=127)/num47=-3；出生门 :26116）
    568: { count: 4, period: 1.5, env: 'sixth', rBase: 4, rAdd: 2, tint: 'hotpink', copyFade: 1, center: 1, spawnGate: true, dy: -3 },
    569: { count: 4, period: 1.5, env: 'sixth', rBase: 4, rAdd: 2, tint: 'hotpink', copyFade: 1, center: 1, spawnGate: true, dy: -3 },
    // 661 帝皇蝶（:25917-25922 num299=6/period 2.4/ai2 门；相位/半径随 ai2 :26100/:26106）
    661: { count: 6, period: 2.4, env: 'half', rBase: 2, rAdd: 2, ai2Radius: true, ai2Gate: true, phaseAi2: true, tint: 'hsl', copyFade: 0.5, center: 0.1 },
  };

  /** Utils.GetLerpValue 1:1（Utils.cs:283-308，含 from>to 反向钳位） */
  private static glowLerpValue(from: number, to: number, t: number): number {
    if (from < to) { if (t < from) return 0; if (t > to) return 1; }
    else { if (t < to) return 1; if (t > from) return 0; }
    return (t - from) / (to - from);
  }

  /** 飞行型判定（与 drawEnemy 调用方同式：vanilla.noGravity）——轨道族/指示灯
   *  需要在 drawNpcGlow 内把"碰撞盒中心"换算进本地系（飞行型原点即中心、
   *  地面型原点在盒底需 -e.h/2） */
  private static glowFlying(e: Enemy): boolean {
    return !!e.vanilla?.noGravity;
  }

  /** 轨道族逐帧参数（Main.cs:25826-25829 num299/num300/num302 初值 + 各 case 覆写 +
   *  :26091/:26108/:26123 半径公式）。tSec=GlobalTimeWrappedHourly；lai3 供 568/569
   *  出生门（:26116 localAI[3]>=60，未过返回 null）。ai2 仅 661 消费，按原版
   *  Clamp(0,50)（NPC.cs:45253）钳界。
   *  【登记】本仓 AI_107(ImprovedWalkers) 未承载 localAI[3] 出生计时（lai3 恒 0），
   *  drawNpcGlow 对 568/569 按出生完成态 60 代入；出生 3 份紫雾收敛（:25899-25907）
   *  属本体绘制层，未接。 */
  static npcGlowOrbitParams(
    id: number, tSec: number, ai2: number, lai3 = 60,
  ): { count: number; num300: number; radius: number; phase: number } | null {
    const c = Renderer.NPC_GLOW_ORBIT[id];
    if (!c) return null;
    if (c.spawnGate && lai3 < 60) return null;
    const x = tSec % c.period / c.period * Math.PI * 2;
    let num300 = c.env === 'half' ? Math.cos(x) / 2 + 0.5 : Math.cos(x) / 6 + 0.75;
    const a2 = Math.max(0, Math.min(50, ai2));
    let phase = 0;
    if (c.ai2Gate) num300 = Math.max(num300, Renderer.glowLerpValue(0, 60, a2));
    if (c.phaseAi2) phase = 3 * Renderer.glowLerpValue(0, 60, a2);
    const base = c.ai2Radius ? c.rBase + a2 : c.rBase;
    return { count: c.count, num300, radius: base * num300 + c.rAdd, phase };
  }

  /** 轨道拷贝染色（color43 MultiplyRGBA，RGB 0..255）：
   *  - gold：Gold(255,215,0)（:26087/:25914）
   *  - hotpink：HotPink(255,105,180)，源色 A 通道为 0 → 乘后 A 恒 0（:25895-25896）
   *  - hsl：661 逐份 hslToRgb((GT+i/count)%1, 1, 0.5)（:26105，Main.cs:47266-47290），
   *    hue 量化 1/32 防逐帧打爆 tintCache */
  static npcGlowOrbitTint(id: number, i: number, tSec: number): [number, number, number] {
    const c = Renderer.NPC_GLOW_ORBIT[id];
    if (c?.tint === 'gold') return [255, 215, 0];
    if (c?.tint === 'hotpink') return [255, 105, 180];
    if (c?.tint === 'hsl' && c) {
      const hq = Math.round(((tSec + i / c.count) % 1) * 32) / 32;
      const [r, g, b] = Renderer.glowHslToRgb(hq % 1, 1, 0.5);
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    return [255, 255, 255];
  }

  /** Main.hslToRgb 1:1（Main.cs:47266-47290）→ RGB 0..1（s=0 灰阶捷径同源码） */
  private static glowHslToRgb(hue: number, sat: number, lum: number): [number, number, number] {
    if (sat === 0) return [lum, lum, lum];
    const v2 = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
    const v1 = 2 * lum - v2;
    const h2r = (h: number): number => {
      if (h < 0) h += 1;
      if (h > 1) h -= 1;
      if (6 * h < 1) return v1 + (v2 - v1) * 6 * h;
      if (2 * h < 1) return v2;
      if (3 * h < 1) return v1 + (v2 - v1) * (2 / 3 - h) * 6;
      return v1;
    };
    return [h2r(hue + 1 / 3), h2r(hue), h2r(hue - 1 / 3)];
  }

  /** 414 爬足虫尾受击红闪（Main.cs:25656-25663）：localAI[2]≠0 时 color38 覆写为
   *  (255-num219, num219, num219, 255-num219)；num219 = trunc(lai2)，负段 = 128+trunc。
   *  返回 null = 无闪（走基础 255a 白罩）。A = 255-num219 ∈ 127..255 → 显著，调用方
   *  需做 fadeA 背景衰减。localAI[2] 的递减驱动在 AI_006（NPC.cs:52026-52047：
   *  受击置 128，每 tick −16，过零翻 −128 后 +16 回升）——本仓 412-414 无 AI 承载。 */
  static npcGlowCrawltipedeFlash(lai2: number): { rgb: [number, number, number]; a: number } | null {
    if (lai2 === 0) return null;
    let n = Math.trunc(lai2);
    if (lai2 < 0) n = 128 + Math.trunc(lai2);
    const inv = 255 - n;
    return { rgb: [inv, n, n], a: inv };
  }

  /** 387 特斯拉炮塔充能白化（Main.cs:25451-25458）：color32 = White×0.75（RGB=A=191）；
   *  ai0>0 时 amount7=(ai0+1)/60 → RGB Lerp(0.75,1)、A Lerp(191,0)，再整体 ×Opacity。
   *  bright=加色亮度（RGB/255），fadeA=背景衰减（A/255，静止 191/255 显著）。
   *  本仓 teslaTurretAI 的 ai0 即充能计数（0→60，受击 -30）→ 分支实时触发。 */
  static npcGlowTeslaFade(ai0: number, alphaRaw: number): { bright: number; fadeA: number } {
    const opacity = (255 - Math.min(255, Math.max(alphaRaw, 0))) / 255;
    const amount7 = ai0 > 0 ? (ai0 + 1) / 60 : 0;
    const rgb = (191 + (255 - 191) * amount7) / 255;
    const a = 191 * (1 - amount7) / 255 * opacity;
    return { bright: rgb * opacity, fadeA: Math.max(0, Math.min(1, a)) };
  }

  /** 425 枪口星芒包络（Main.cs:25631-25633 + DrawPrettyStarSparkle :34741-34745）：
   *  opacity = Remap(ai3, 0, 15, 0, 1)（瞄准蓄力渐亮）；
   *  num = GetLerpValue(0,30,ai3) × GetLerpValue(36,30,ai3)（ai3≤0 冷却期恒 0，
   *  30 满蓄、30→40 放射后渐灭——与 NPC.cs:58986-59006 的 ai3 状态机同环）。 */
  static npcGlowSparkleEnvelope(ai3: number): { opacity: number; num: number } {
    const o = Math.max(0, Math.min(1, ai3 / 15));
    const num = Renderer.glowLerpValue(0, 30, ai3) * Renderer.glowLerpValue(36, 30, ai3);
    return { opacity: o, num: Math.max(0, Math.min(1, num)) };
  }

  /** 160/209 城镇 NPC 微光/派对变体贴图档（Main.cs:25769/:25783）：
   *  - 160 松露人：townNpcVariationIndex==1（微光态）→ Glow_352，否则 Glow_166
   *  - 209 电子人：常态 Glow_167；微光态按 altTexture 选 Glow_350（≠1）/Glow_351（==1）
   *  返回 null = 该 id 无变体链。【登记】城镇 NPC 走 drawTownNPC（TownNPC 类），
   *  不经过 drawNpcGlow → 本链当前仅作 1:1 备案，接通需 drawTownNPC 侧挂 glow 层
   *  （该函数非本批所有权范围）；160 的 shimmerTransparency RGB 衰减（:25771-25776）
   *  TownNPC 未承载该字段，亦登记。 */
  static npcGlowVariantTex(id: number, shimmered: boolean, altTexture: number): string | null {
    if (id === 160) return shimmered ? 'vanilla/Glow_352.png' : 'vanilla/Glow_166.png';
    if (id === 209) return shimmered ? (altTexture !== 1 ? 'vanilla/Glow_350.png' : 'vanilla/Glow_351.png') : 'vanilla/Glow_167.png';
    return null;
  }

  /** GlowMask 叠画：与基础精灵同一变换（调用点在 drawEnemy 的 save 块内）。
   *  bx/by = 基础精灵在本变换内的目标左上（与本体严格同锚——地面型底锚/飞行型
   *  中心锚由调用方传入，各层不再自行假设锚点）。
   *  additive（XNA 默认 AlphaBlend + 贴图自带发光色的语义，用 lighter 还原
   *  "叠加提亮"观感） */
  private drawNpcGlow(
    e: Enemy,
    r: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    bx: number, by: number,
  ) {
    if (!this.atlas) return;
    const g = Renderer.NPC_GLOW[e.vanillaId ?? -1];
    if (!g) return;
    const img = this.atlas.ensureVImage(g.tex);   // 懒加载（首帧 null，次帧生效）
    if (!img) return;
    const ctx = this.ctx;
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const alphaRaw = Math.min(255, Math.max(e.spawnAlpha, 0));
    const opacity = 1 - alphaRaw / 255; // NPC.Opacity
    // Glow 表与 NPC 表同布局（同宽 × 帧数行）；帧行 = 当前帧（原版一律 rCurrentNPC.frame）
    const gh = Math.max(1, Math.floor(img.height / frames));
    const row = Math.min(frames - 1, Math.max(0, Math.floor(r.sy / Math.max(1, r.sh))));
    const sy = Math.min(img.height - gh, row * gh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 第三批通用 alpha 表达式（g.a）：数字=常数 / '255a'=(255-α)/255 / '128a2'=(128-α/2)/255
    // / 'opacity'=GetAlpha(White)。缺省（旧两批）走下方 id 链。
    const aExpr = g.a;
    const resolveAlpha = (): number => {
      if (aExpr === undefined) return -1; // 哨兵：走旧链
      if (typeof aExpr === 'number') return aExpr;
      if (aExpr === '255a') return (255 - alphaRaw) / 255;
      if (aExpr === '128a2') return (128 - alphaRaw / 2) / 255;
      return opacity;
    };
    if (g.mode === 'frame4') {
      // frame4：中心整图（a 表达式）+ 四向偏移 4 份灰 A=64
      //（Main.cs:25639-25649/25671-25681/25700-25710/25720-25731；速度偏移 num =
      // k + 光照项（恒 k），或 UnitX.RotatedBy 固定 px :25736/:25746）
      const offX = (g.dx ?? 0) / scale;   // 518 halfSize+(-10,0) → 图像右移 10 世界 px
      ctx.globalAlpha = Math.max(0, Math.min(1, resolveAlpha()));
      ctx.drawImage(img, 0, sy, img.width, gh, bx + offX, by, r.sw, r.sh);
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      // 416 骑手速度恒 0（AI_075 吸附零速）——原版取坐骑 415 的速度
      // （Main.cs:24516 spinningpoint3 = npc[415].velocity；同 vel4 分支）
      const svx = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vx : e.vx;
      const svy = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vy : e.vy;
      const fixed = g.fixed4;
      const mult = g.velMult ?? 0.5;
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2;
        const dx = (fixed !== undefined
          ? Math.cos(ang) * fixed                       // UnitX.RotatedBy(k*π/2)×n
          : (svx * Math.cos(ang) - svy * Math.sin(ang)) * mult) / scale;
        const dy = (fixed !== undefined
          ? Math.sin(ang) * fixed
          : (svx * Math.sin(ang) + svy * Math.cos(ang)) * mult) / scale;
        ctx.drawImage(img, 0, sy, img.width, gh, bx + offX + dx, by + dy, r.sw, r.sh);
      }
    } else if (g.mode === 'orbit') {
      // 环绕轨道族（Main.cs:26086-26128）：碰撞盒中心 1 份 + 极角 i/count×2π+phase
      // 环绕 count 份拷贝。锚点 = Center（:26091/:26107/:26123）——与 frame 族
      // Bottom+4 不同源，故不沿用 bx/by，按 noGravity 自行换算盒心。
      const prm = Renderer.npcGlowOrbitParams(
        e.vanillaId ?? -1, performance.now() / 1000, e.ai2,
        (e.vanillaId === 568 || e.vanillaId === 569) ? 60 : e.lai3,
      );
      if (prm) {
        const cfg = Renderer.NPC_GLOW_ORBIT[e.vanillaId ?? -1]!;
        const dyo = (cfg.dy ?? 0) / scale;                     // num47（568/569=-3 :25898）
        const ocy = ((Renderer.glowFlying(e) ? 0 : -e.h / 2)) / scale + dyo;
        const ox = -r.sw / 2, oy = ocy - r.sh / 2;             // 帧左上（盒心 − 半帧）
        const base = (127 - alphaRaw) / 255;                   // Color(127-α,…,0) 基底
        const t = performance.now() / 1000;
        // 中心层：541/568 原色（无 GetAlpha/无 num300 衰减）；661 White×0.1（:26113）
        if (e.vanillaId === 661) {
          ctx.globalAlpha = Math.max(0, Math.min(1, 0.1));
          ctx.drawImage(img, 0, sy, img.width, gh, ox, oy, r.sw, r.sh);
        } else {
          const ct = Renderer.npcGlowOrbitTint(e.vanillaId ?? -1, 0, t);
          const cc = this.tintedSprite(`glow|${g.tex}|r${row}`,
            { img, sx: 0, sy, sw: img.width, sh: gh }, [ct[0], ct[1], ct[2]]);
          ctx.globalAlpha = Math.max(0, Math.min(1, base));
          ctx.drawImage(cc, 0, 0, cc.width, cc.height, ox, oy, r.sw, r.sh);
        }
        for (let i = 0; i < prm.count; i++) {
          const ang = i / prm.count * Math.PI * 2 + prm.phase;
          const dx = Math.cos(ang) * prm.radius / scale;
          const dy = Math.sin(ang) * prm.radius / scale;
          const fade = 1 - prm.num300 * cfg.copyFade;          // ×(1-num300·k)
          // 拷贝亮度 = GetAlpha(×Opacity) × fade（:26092-26093/:26105-26106）；
          // 中心层系数 cfg.center 只作用于 661 的 0.1 白罩（上方分支），不进拷贝
          const bright = base * opacity * fade;
          const tt = Renderer.npcGlowOrbitTint(e.vanillaId ?? -1, i, t);
          const tc = this.tintedSprite(`glow|${g.tex}|r${row}`,
            { img, sx: 0, sy, sw: img.width, sh: gh }, [tt[0], tt[1], tt[2]]);
          ctx.globalAlpha = Math.max(0, Math.min(1, bright));
          ctx.drawImage(tc, 0, 0, tc.width, tc.height, ox + dx, oy + dy, r.sw, r.sh);
        }
      }
    } else if (g.mode === 'frame') {
      let alpha = 0.8;
      let flashPulse = 1;
      if (e.vanillaId === 551) { alpha = (66 / 255) * 1.3; }              // :23099 A=66 ×(0.7+0.3*lerp)
      else if (e.vanillaId === 564 || e.vanillaId === 565) { alpha = 0.5 * opacity; } // :23484 white.A/2×Opacity
      else if (e.vanillaId === 548) {
        // :23590-23596 num63/65 三秒呼吸三角波 ×0.6 紫底（(140,50,255)）
        const t3 = (performance.now() / 1000) % 3 / 3;
        flashPulse = t3 > 0.5 ? 1 - t3 : t3;
        alpha = 0.6 * Math.max(0, flashPulse);
      } else if (e.vanillaId === 399) { alpha = (127 - alphaRaw / 2) / 255; }  // :24568 Color(127-α/2,…)
      else if (e.vanillaId === 421) { alpha = (128 - alphaRaw / 2) / 255; }    // :25622 Color(128-α/2,…)
      else alpha = 0.78;                                                  // Color(200,200,200,0)/白色系通用
      const ga = resolveAlpha();
      if (ga >= 0) alpha = ga;                                            // 第三批表项覆盖旧链
      // 653 地狱蝴蝶 Y 锚 +3（族内其余 +4，:25198/:25194）→ 本仓底锚惯例相对 -1
      const dyo = (g.dy ?? 0) / scale;
      // ---- 第四批运行时态/Color.A 分支 ----
      // Color.A 背景衰减（XNA AlphaBlend=src One：先 destination-out 削底再 lighter
      // 加色，与本体染色 pass :2307-2310 同式）。addA=加色亮度、fadeA=削底强度。
      let addA = alpha;
      let fadeA = g.fadeA ?? 0;
      let tint: [number, number, number] | null = null;
      if (e.vanillaId === 387) {
        // 特斯拉炮塔（:25451-25459）：White×0.75 起，ai0 充能 → RGB→255/A→0
        const f = Renderer.npcGlowTeslaFade(e.ai0, alphaRaw);
        addA = f.bright; fadeA = f.fadeA;
      } else if (e.vanillaId === 414) {
        // 爬足虫尾受击红闪（:25656-25663）：RGB=(255-n,n,n) 且 A=255-n（显著）
        const fl = Renderer.npcGlowCrawltipedeFlash(e.lai2);
        if (fl) { addA = 1; fadeA = fl.a / 255; tint = fl.rgb; }
      }
      // 染色源（tintedSprite 缓存画布，整幅即帧）——无 tint 时直取 glow 帧行
      let src: CanvasImageSource = img;
      let ssx = 0, ssy = sy, ssw = img.width, ssh = gh;
      if (tint) {
        const tc = this.tintedSprite(`glow|${g.tex}|r${row}`,
          { img, sx: 0, sy, sw: img.width, sh: gh }, [tint[0], tint[1], tint[2]]);
        src = tc; ssx = 0; ssy = 0; ssw = tc.width; ssh = tc.height;
      }
      if (fadeA > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = Math.max(0, Math.min(1, fadeA));
        ctx.drawImage(src, ssx, ssy, ssw, ssh, bx, by + dyo, r.sw, r.sh);
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, addA));
      ctx.drawImage(src, ssx, ssy, ssw, ssh, bx, by + dyo, r.sw, r.sh);
      // 437 教徒石板第二层整图罩（:25488 null 源矩形 = 全图，同 white5 A=200）
      if (g.full) {
        const fimg = this.atlas.ensureVImage(g.full);
        if (fimg) {
          if (fadeA > 0) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = Math.max(0, Math.min(1, fadeA));
            ctx.drawImage(fimg, 0, 0, fimg.width, fimg.height, bx, by + dyo, r.sw, r.sh);
            ctx.globalCompositeOperation = 'lighter';
          }
          ctx.globalAlpha = Math.max(0, Math.min(1, addA));
          ctx.drawImage(fimg, 0, 0, fimg.width, fimg.height, bx, by + dyo, r.sw, r.sh);
        }
      }
      // 425 星璇枪手枪口星芒（:25631-25633 → DrawPrettyStarSparkle :34734-34750）：
      // Extra_98 四笔十字（绿 shine 对 ×1.0 / 白 draw 对 ×0.6，旋转 0/π/2）。
      // 位置 = 帧中心 +27px 本地 X（:25632 的 27×-spriteDirection 世界向折进镜像系）。
      // 【登记】本仓 AI_003 无 425 ai3 瞄准蓄力（NPC.cs:58986-59006），ai3 撞的是
      // 通用卡墙计数——星芒可能误闪，AI 侧修复后自然归位。
      if (g.sparkle) {
        const env = Renderer.npcGlowSparkleEnvelope(e.ai3);
        const ex = this.atlas.ensureVImage(g.sparkle.tex);
        if (env.num > 0 && env.opacity > 0 && ex) {
          const n = env.num;
          const cx0 = bx + r.sw / 2 + g.sparkle.dx / scale;
          const cy0 = by + dyo + r.sh / 2;
          // 绿对：shineColor=Green×opacity×0.5（tint 乘法）；白对：White×0.5
          const green = this.tintedSprite('sparkle|green',
            { img: ex, sx: 0, sy: 0, sw: ex.width, sh: ex.height }, [0, 128, 0]);
          const pair = (image: CanvasImageSource, rot: number, sx: number, sy2: number, a: number) => {
            ctx.save();
            ctx.translate(cx0, cy0);
            ctx.rotate(rot);
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            ctx.drawImage(image, -ex.width / 2 * sx, -ex.height / 2 * sy2,
              ex.width * sx, ex.height * sy2);
            ctx.restore();
          };
          // vector =(fatness.X/2, scale.X)×num=(1,3)×n 旋 π/2；vector2=(fatness.Y/2, scale.Y)×n=(1,1.5)×n 旋 0
          pair(green, Math.PI / 2, 1 * n, 3 * n, 0.5 * env.opacity * n);
          pair(green, 0, 1 * n, 1.5 * n, 0.5 * env.opacity * n);
          pair(ex, Math.PI / 2, 0.6 * n, 1.8 * n, 0.5 * n);
          pair(ex, 0, 0.6 * n, 0.9 * n, 0.5 * n);
        }
      }
      // 520 火星行者旋转指示灯（:25425-25443）：Extra_56 画在 Top+(0,20)，
      // rotation=localAI[3]（镜像系折算 -num194-π、origin (4,4)），再叠 Glow_165 白罩。
      // Extra_56 是深色本体件 → source-over（lighter 会不可见）；Glow_165 走 lighter。
      // 【登记】AI_003 未写 lai3 → 旋转恒 0（原版为指示灯自旋角）。
      if (g.spinner) {
        const sp = this.atlas.ensureVImage(g.spinner.tex);
        const spGlow = this.atlas.ensureVImage(g.spinner.glow);
        if (sp && spGlow) {
          // zero6 = Top + (0,20)（:25434，Top=盒左上角而非中心；zero6.X*=−1 对零向量空操作）
          const sx0 = -e.w / 2 / scale;
          const sy0 = ((Renderer.glowFlying(e) ? 0 : -e.h) + g.spinner.dy) / scale;
          const rot = -(e.lai3) - Math.PI;               // 镜像系：mirror∘rot(θ+π) = rot(-θ-π)
          ctx.save();
          ctx.translate(sx0, sy0);
          ctx.rotate(rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = opacity;
          ctx.drawImage(sp, -4, -4, sp.width, sp.height);      // origin (4,4)（:25426/:25432）
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(spGlow, -4, -4, spGlow.width, spGlow.height);
          ctx.restore();
        }
      }
      // 399 探测器状态灯（:24571-24575）：Extra_20 按 ai0+1 取行，画在本体下方 +24px，
      // 再叠 Glow_101 同源矩形罩（A=127-α/2）
      if (g.lamp) {
        const lamp = this.atlas.ensureVImage(g.lamp.tex);
        const lampGlow = this.atlas.ensureVImage(g.lamp.glow);
        if (lamp && lampGlow) {
          const rows = 4, lh = lamp.height / rows;
          const lrow = Math.max(0, Math.min(rows - 1, Math.floor(e.ai0) + 1)); // Frame(1,4,0,ai0+1)
          const lx = -lamp.width / 2;                    // 水平居中（原版 X=本体 drawPos.X=中心）
          const ly = by + g.lamp.dy / scale;             // 世界 px +24 → 局部除 scale
          ctx.globalAlpha = opacity;                     // GetAlpha(npcColor)
          ctx.drawImage(lamp, 0, lrow * lh, lamp.width, lh, lx, ly, lamp.width, lh);
          ctx.globalAlpha = Math.max(0, Math.min(1, (127 - alphaRaw / 2) / 255));
          ctx.drawImage(lampGlow, 0, lrow * lh, lampGlow.width, lh, lx, ly, lamp.width, lh);
        }
      }
    } else if (g.mode === 'vel4') {
      // vel4：velocity.RotatedBy(k*π/2) × num 偏移画 4 份灰 A=64（:23750/:24535）
      const num = g.velMult ?? 4; // (GetAlpha-0.5).Length()*k 光照项恒 0（我们无逐 NPC 光照）
      // 416 骑手速度恒 0（AI_075 吸附零速）——原版此处取坐骑 415 的速度
      // （Main.cs:24516 spinningpoint3 = npc[415].velocity）
      const svx = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vx : e.vx;
      const svy = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vy : e.vy;
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        // 世界坐标偏移 → 本变换局部（当前原点=精灵锚点，除 scale 还原）
        const dx = ((svx * Math.cos(a) - svy * Math.sin(a)) * num) / scale;
        const dy = ((svx * Math.sin(a) + svy * Math.cos(a)) * num) / scale
          + (e.vanillaId === 517 ? 2 : 0);
        ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
      }
    } else {
      // trail：419 火月怪（:25677-25696 本体罩 + 分支四向残影；:24610-24645 拖尾）
      // 本体罩 Color(255-α,…) → 全亮白×Opacity
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.drawImage(img, 0, sy, img.width, gh, bx, by, r.sw, r.sh);
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      if (e.ai2 >= -6) {
        // vel4 ×0.5（:25681-25686 num208 = 0.5 + 光照项）
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          const dx = ((e.vx * Math.cos(a) - e.vy * Math.sin(a)) * 0.5) / scale;
          const dy = ((e.vx * Math.sin(a) + e.vy * Math.cos(a)) * 0.5) / scale;
          ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
        }
      } else {
        // UnitX.RotatedBy(k*π/2)×4：固定四向 4px（:25688-25697 num210=4）
        for (let k = 0; k < 4; k++) {
          const dx = (Math.cos(k * Math.PI / 2) * 4) / scale;
          const dy = (Math.sin(k * Math.PI / 2) * 4) / scale;
          ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
        }
      }
      // 旋刃冲刺拖尾（:24610-24645，ai2<=-9）：oldPos 0..6 七份，帧行 (curRow-3-i)%3+5
      // 循环、scale Lerp(0.75,1.2,(10-i)/10)、白度 (10-i)/20 渐隐。独立平移到历史
      // 位置（世界坐标）——bx/by 恰为"底锚相对偏移"，直接复用
      if (e.ai2 <= -9) {
        const depth = Math.min(7, e.historyDepth());
        for (let i = Math.min(6, depth - 1); i >= 0; i--) {
          let trow = (row - 3 - i) % 3;
          if (trow < 0) trow += 3;
          trow += 5;
          const tsy = Math.min(img.height - gh, trow * gh);
          const ts = 0.75 + 0.45 * ((10 - i) / 10);   // Lerp(0.75,1.2,(10-i)/10)
          ctx.save();
          ctx.translate(e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h);
          ctx.rotate(e.histRotAt(i));
          ctx.scale(ts, ts);
          ctx.globalAlpha = Math.max(0, Math.min(1, (10 - i) / 20)); // White×(10-i)/20, A=0
          ctx.drawImage(img, 0, tsy, img.width, gh, bx, by, r.sw, r.sh);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // ===================== 月总手-躯干连接（Main.cs:24325-24504） =====================
  /** 核心额外偏移：肩锚 (220,-60)×sign、手锚 +（0,76）、臂长 340、IK 折角 acos */
  private moonLordArmAngle(len: number, signX: number): number {
    return Math.acos(Math.max(-1, Math.min(1, len / 340))) * -signX;   // :24362/:24413
  }
  private moonLordSideSign(side: number): [number, number] {
    return side === 0 ? [-1, 1] : [1, 1];                              // vector25/vector41（:24352/:24403）
  }

  /** 月总核心 398（case 398 :24325-24388）：两侧上臂 Extra_14（肩=核心中心+(220,-60)×sign、
   *  肘向量=(手中心+(0,76)-肩)×0.5、折角 acos(|v|/340)×-signX）→ 躯干 Extra_13 左右半
   *  （镜像）→ 胸甲 Extra_16 → 核心 NPC_398 帧。手实体由实体表反查（原版按
   *  npc[whoAmI] 全表扫 ai[2]/ai[3]——我们用 master 链等价解析） */
  /** 风气球 594（Main.cs:23380-23406 + FindFrame case 594 :68652-68656 独占绘制）：
   *  - 贴图 NPC_594.png 为 8 列变体横条 32×76/帧；变体 = ai[2]（1-7 装饰随机）
   *  - 携带史莱姆（slave ai0=-999）时：帧 0 以 slave 的 alpha+color 两遍绘制
   *    （气球壳染成史莱姆色），scale 取 slave.scale；之后叠 ai[2] 变体帧
   *  - 锚点 = npc.Top + origin(0.5,0)（顶部居中）,随 rotation(visAngle) 倾斜 */
  /** 402 星尘织带蠕虫（Main.cs:23848-23889 case 402 独占自绘，1:1）：
   *  单 NPC 无段链——视觉节段 = oldPos 间隔 2 取样，每档两份（第二份向更旧帧
   *  lerp 0.5 补位），贴图 404/403 交替 + Glow_134/133 加色罩（A=0 白的 additive
   *  语义用 lighter 还原）。本体 alpha = Opacity×(0.8−0.14·i/2)、glow = 1−0.14·i/2，
   *  全乘生命末段渐隐 num291（ai[2] 0→600 计时，最后 5% 线性淡出 :23858-23861）。
   *  头 = NPC_402 + Glow_135×num291。锚点 = 碰撞盒中心（origin halfSize），旋转
   *  随 visAngle/oldRot。【未接登记】DrawPrettyStarSparkle（:23888 头部星尘闪光，
   *  独立 sparkle 绘制原语）未移植。 */
  /** 266 克苏鲁之脑（Main.cs:24799-24843 专家/FTW 四镜像 + :22949-22951 Y 下垂）：
   *  life<lifeMax 且（专家 || FTW）→ 以玩家中心镜像画 4 份：alpha 因子 =
   *  1-life/lifeMax（专家 ×2，FTW 置 1）平方后钳 0..1，乘进整体 alpha；
   *  镜像位 = 玩家中心 ±(|dx|,|dy|)（num145 0..3：X 取正 0/2、Y 取正 0/1）。
   *  本体照常最后画。全体绘制 Y 偏移 +50×scale（Main.cs:22950 case 266 num47）——
   *  贴图下垂出碰撞盒下缘（克脑主体在盒下半） */
  private drawBrainOfCthulhu(e: Enemy, world: World) {
    if (!this.atlas) return;
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const frameIdx = vanillaFrameIdx(e, frames);
    const r = this.atlas.vnpc(266, frameIdx);
    if (!r) return;
    const ctx = this.ctx;
    // 专家档 ×1.05（Tweaks :18198；266 克脑专属曲径，通用路径不经过这里）
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale * expertRenderScale(266);
    const yOff = 50 * scale;   // Main.cs:22950 num47 += 50*rCurrentNPC.scale
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    const mirrored = e.facing > 0;   // 同通用路径朝向镜像（贴图默认朝左）
    // 四镜像幻影（Main.cs:24802-24841）
    const pl = this.mainPlayer;
    const ftw = !!world.seedFlags?.getGoodWorld;
    if (pl && e.hp < e.maxHp && (world.isExpert || ftw)) {
      let k = 1 - e.hp / e.maxHp;
      if (world.isExpert) k *= 2;
      k *= k;
      if (ftw) k = 1;
      k = Math.max(0, Math.min(1, k));
      const dx = Math.abs(e.cx - pl.cx), dy = Math.abs(e.cy - pl.cy);
      for (let n = 0; n < 4; n++) {
        const sx = n === 0 || n === 2 ? 1 : -1;   // :24822-24829
        const sy = n === 0 || n === 1 ? 1 : -1;   // :24831-24838
        ctx.save();
        ctx.translate(pl.cx + sx * dx, pl.cy + sy * dy + yOff);
        ctx.scale(scale, scale);
        if (mirrored) ctx.scale(-1, 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity * k));
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // 本体（同通用路径中心锚 + 朝向镜像 + Y 偏移）
    ctx.save();
    ctx.translate(e.cx, e.cy + yOff);
    ctx.scale(scale, scale);
    if (mirrored) ctx.scale(-1, 1);
    ctx.globalAlpha = opacity;
    ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawStardustWorm(e: Enemy) {
    const ctx = this.ctx;
    if (!this.atlas) return;
    const head = this.atlas.ensureVImage('vanilla/NPC_402.png');
    const segA = this.atlas.ensureVImage('vanilla/NPC_403.png');
    const segB = this.atlas.ensureVImage('vanilla/NPC_404.png');
    const glowA = this.atlas.ensureVImage('vanilla/Glow_133.png');
    const glowB = this.atlas.ensureVImage('vanilla/Glow_134.png');
    const glowH = this.atlas.ensureVImage('vanilla/Glow_135.png');
    if (!head || !segA || !segB) return;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    // Utils.Remap（:23860-23861 渐隐曲线）
    const remap = (x: number, a: number, b: number, c: number, d: number): number =>
      x <= a ? c : x >= b ? d : c + ((d - c) * (x - a)) / (b - a);
    const LIFE = 600, LIFE_LAST = 570;                    // num288/num289（:23858-23859）
    const n290 = remap(e.ai2, 0, LIFE, 0, 1);
    const n291 = 1 - remap(n290, 0.5, LIFE_LAST / LIFE, 0, 1) * remap(n290, LIFE_LAST / LIFE, 1, 1, 0);
    const fade = Math.max(0, Math.min(1, n291));          // ai2 恒 0（计时未接）时 = 1
    const num287 = (2 / 10) * 0.7;                        // 2/oldPos.Length×0.7（:23857）
    const drawSeg = (
      img: HTMLImageElement, glow: HTMLImageElement | null,
      px: number, py: number, rot: number, aBody: number, aGlow: number,
    ) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.max(0, Math.min(1, aBody * opacity));
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      if (glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, aGlow));
        ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    };
    // 节段拖尾（:23862-23883）：oldPos 9→1 间隔 2；每档两份（第二份向 oldPos[i-1] lerp .5）
    const depth = e.historyDepth();
    let seg = 0;
    for (let i = Math.min(9, depth - 1); i >= 1; i -= 2) {
      for (let k = 0; k < 2; k++) {
        const tex = seg % 2 === 0 ? segB : segA;          // num286==0 → 404，交替
        const glow = seg % 2 === 0 ? glowB : glowA;
        let px = e.histXAt(i) + e.w / 2, py = e.histYAt(i) + e.h / 2;
        let rot = e.histRotAt(i);
        if (k === 1) {
          px += (e.histXAt(i - 1) - e.histXAt(i)) * 0.5;
          py += (e.histYAt(i - 1) - e.histYAt(i)) * 0.5;
          rot = e.histRotAt(i - 1) * 0.5 + e.histRotAt(i) * 0.5;
        }
        drawSeg(tex, glow, px, py, rot,
          (0.8 - (num287 * i) / 2) * fade, (1 - (num287 * i) / 2) * fade);
        seg++;
      }
    }
    // 头本体 + Glow_135×num291（:23884-23887）
    drawSeg(head, glowH, e.cx, e.cy, e.visAngle, 1, fade);
  }

  /** 690 雕像宝箱怪（Main.cs:23103-23134 case 690 独占）：本体贴图弃用，改按
   *  ai[1] 雕像样式从 Tiles_105 表切 2 列×3 行 16×16 片拼装——样式的表内步距
   *  36/54px（2×3 格 × 18px 含 1px 缝），direction==1 时行 +3（水平镜像区）；
   *  锚点 = Center+(0,-3)，逐片 origin (1-col, 1.5-row)×16（片内再内缩 1px 取整格） */
  private drawStatueMimic(e: Enemy) {
    const ctx = this.ctx;
    if (!this.atlas) return;
    const img = this.atlas.ensureVImage('vanilla/Tiles_105.png');
    if (!img || !img.width) return;
    const style = Math.max(0, Math.round(e.ai1));
    const colBase = style % 55;
    const rowBase = Math.floor(style / 55) + (e.facing > 0 ? 3 : 0);   // num77/num78（:23121-23125）
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    ctx.save();
    ctx.translate(e.cx, e.cy - 3);
    if (e.visAngle) ctx.rotate(e.visAngle);
    ctx.globalAlpha = opacity;
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 3; r++) {
        const sx = Math.min(img.width - 17, colBase * 36 + c * 18 + 1);   // 内缩 1px（Frame 语义）
        const sy = Math.min(img.height - 17, rowBase * 54 + r * 18 + 1);
        const ox = (c - 1) * 16, oy = (r - 1.5) * 16;                    // dest = anchor - origin
        ctx.drawImage(img, sx, sy, 16, 16, ox, oy, 16, 16);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawWindyBalloon(e: Enemy, entities: unknown[]) {
    const ctx = this.ctx;
    const img = this.atlas!.ensureVImage('vanilla/NPC_594.png');
    if (!img) return;
    const fw = 32, fh = img.height;
    const variant = Math.max(0, Math.min(7, Math.round(e.ai2)));
    const slave = (entities as Enemy[]).find(
      (n) => n.id === e.ai3 && !n.dead && n.vanillaId === 1 && n.ai0 === -999,
    ) ?? null;
    const scale = slave?.vanillaScale ?? e.vanillaScale ?? 1;
    ctx.save();
    ctx.translate(e.cx, e.y);
    ctx.rotate(e.visAngle);
    ctx.scale(scale, scale);
    if (slave && slave.colorRGBA && slave.colorRGBA[3] > 0) {
      // 气球壳染色（与史莱姆染色同款两步：destination-out 削弱 + lighter 加色）
      const tinted = this.tintedSprite('npc594shell', { img, sx: 0, sy: 0, sw: fw, sh: fh }, slave.colorRGBA);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = slave.colorRGBA[3] / 255;
      ctx.drawImage(img, 0, 0, fw, fh, -fw / 2, 0, fw, fh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(tinted, -fw / 2, 0, fw, fh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(img, variant * fw, 0, fw, fh, -fw / 2, 0, fw, fh);
    ctx.restore();
  }

  // ===================== 2D 网格贴图 NPC（drawNpcGrid 切格族） =====================
  /** 帧索引持久态（≈原版 NPC.frameCounter / NPC.frame.Y）：WeakMap 按 Enemy 持有，
   *  每 draw 调用推进一次（与原版 FindFrame 每 update 调一次 1:1） */
  private npcGridFrameState = new WeakMap<Enemy, NpcGridFrameState>();
  private npcGridFrame(e: Enemy): NpcGridFrameState {
    let s = this.npcGridFrameState.get(e);
    if (!s) { s = { counter: 0, idx: 0 }; this.npcGridFrameState.set(e, s); }
    return s;
  }

  /** 网格切格绘制：源格 = (col*cellW+padX, row*cellH+padY, cellW-2padX, cellH-2padY)，
   *  目标锚 Bottom（+yOff），col/row 由 idx 按 perRow 折算。镜像语义对齐原版
   *  `spriteEffects`（贴图朝左 → 朝右翻）/ `spriteEffects ^ FlipHorizontally`（贴图
   *  朝右 → 朝左翻）——canvas scale(-1,1)+originX 与 XNA FlipHorizontally+origin 数学
   *  等价（翻转均绕 origin 点），anchorPx 非对称锚按 spriteDirection 切换取值
   *  （Main.cs 各 case 的 `origin.X = anchor / width-anchor` 同款） */
  private drawNpcGrid(
    e: Enemy, img: HTMLImageElement, cols: number, rows: number, idx: number,
    cellW: number, cellH: number,
    opts: {
      perRow?: number;            // idx→(col,row) 除数；696 为 9（其 rows=27 但索引每 9 折行）
      yOff?: number;              // Bottom 附加偏移（657 = +2）
      anchorPx?: number;          // 非对称水平锚（576/577=94、564/565=52、668=106）；缺省水平居中
      originYOff?: number;        // origin.Y 自帧底上抬（576/577=4、696=4、564/565=10、668=4）
      padX?: number; padY?: number; // Frame 第 5/6 参 padding（668 各 2）
      inflateY?: number;          // Inflate(0,-n)：sy+=n/2、sh-=n（657 = 2）
      mirrorTexFaces?: 'left' | 'right'; // 贴图默认朝向：left=朝右翻、right=朝左翻
      rotate?: number;
      glowTex?: string;           // GlowMask 同布局网格切片（564/565 = Glow_225）
      echoRowShift?: number;      // 投影层：同列 row+n 再画一遍半透明（696 = +18）
    } = {},
  ) {
    const ctx = this.ctx;
    const perRow = opts.perRow ?? rows;
    const col = Math.floor(idx / perRow), row = idx % perRow;
    const padX = opts.padX ?? 0, padY = opts.padY ?? 0;
    let sx = col * cellW + padX, sy = row * cellH + padY;
    let sw = cellW - padX * 2, sh = cellH - padY * 2;
    if (opts.inflateY) { sy += opts.inflateY >> 1; sh -= opts.inflateY; }
    // 越界钳制（防御性：帧态漂移时不画到表外）
    sx = Math.max(0, Math.min(img.width - 1, sx));
    sy = Math.max(0, Math.min(img.height - 1, sy));
    sw = Math.max(1, Math.min(sw, img.width - sx));
    sh = Math.max(1, Math.min(sh, img.height - sy));
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    const facingRight = e.facing > 0;
    const mirrored = opts.mirrorTexFaces === 'right' ? !facingRight : facingRight;
    const originX = opts.anchorPx != null ? (facingRight ? opts.anchorPx : sw - opts.anchorPx) : sw / 2;
    const originY = sh - (opts.originYOff ?? 0);
    ctx.save();
    ctx.translate(e.cx, e.y + e.h + (opts.yOff ?? 0));
    if (opts.rotate) ctx.rotate(opts.rotate);
    ctx.scale(scale * (mirrored ? -1 : 1), scale);
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, sx, sy, sw, sh, -originX, -originY, sw, sh);
    // 原版 color 二次绘制（NPC.GetColor）：XNA 预乘混合两步还原（同通用路径）
    if (e.colorRGBA && e.colorRGBA[3] > 0) {
      const tinted = this.tintedSprite(`npc${e.vanillaId}`, { img, sx, sy, sw, sh }, e.colorRGBA);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = e.colorRGBA[3] / 255;
      ctx.drawImage(img, sx, sy, sw, sh, -originX, -originY, sw, sh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(tinted, -originX, -originY, sw, sh);
      ctx.globalCompositeOperation = 'source-over';
    }
    // GlowMask 同布局网格叠画（原版以同一 source rect 二次 Draw，Glow 表与 NPC 表等大）
    if (opts.glowTex && this.atlas) {
      const g = this.atlas.vmisc(opts.glowTex);
      if (g) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, 0.5 * opacity)); // :23484 white.A/2×Opacity
        ctx.drawImage(g.img, sx, sy, sw, sh, -originX, -originY, sw, sh);
      }
    }
    // 投影层（696 :23358-23367:同列 row+18 画【两遍】——第一遍精确、第二遍 ±1px 抖动,
    //  alpha 127×Opacity）
    if (opts.echoRowShift) {
      const esy = Math.min(img.height - sh, (row + opts.echoRowShift) * cellH + padY);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.max(0, Math.min(1, (127 / 255) * opacity));
      ctx.drawImage(img, sx, esy, sw, sh, -originX, -originY, sw, sh);
      const jx = (Math.floor(Math.random() * 3)) - 1;
      const jy = (Math.floor(Math.random() * 3)) - 1;
      ctx.drawImage(img, sx, esy, sw, sh, -originX + jx, -originY + jy, sw, sh);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return { sx, sy, sw, sh };
  }

  /** 657 史莱姆皇后（Main.cs case 657 :23134-23160 + FindFrame case 657 :67503-67614）：
   *  NPC_657.png 360×1952 = 2 列×16 行（180×122/格），Frame(2,16,idx/16,idx%16) 再
   *  Inflate(0,-2)；锚 Bottom+(0,2)、origin(w/2,帧高)、贴图朝右。
   *  旋转 = AI 侧 spin（飞行 vx*0.1 钳 ±0.5，同通用 ROTATION_NPC 段）。
   *  未实装（素材/系统缺）：QueenSlime shader 残影(ai0==4&&vy!=0)、Extra_186 水晶、
   *  Extra_177 王冠、二段翅膀 DrawNPCDirect_QueenSlimeWings（Extra 表未入素材白名单） */
  private drawQueenSlimeGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_657.png');
    if (!img) return;
    const half = e.hp <= e.maxHp / 2;
    const idx = queenSlimeNextFrame(this.npcGridFrame(e), {
      half,
      // 与 bossAI_lategame queenSlimeAI 的 noGravity 判定同式(:949)——
      // 渲染/AI 两处 flying 语义必须一致,否则半血 ai0∈{4,5} 飞行帧段走错
      flying: e.ai0 === 5 || (e.ai0 === 4 && e.ai2 === 0) || (half && e.ai0 === 0),
      vy: e.vy, ai0: e.ai0, ai1: e.ai1,
    });
    this.drawNpcGrid(e, img, 2, 16, idx, 180, 122, {
      perRow: 16, yOff: 2, inflateY: 2, mirrorTexFaces: 'right', rotate: e.spin,
    });
  }

  /** 576/577 DD2 食人魔（Main.cs case 576/577 :23301-23330 + FindFrame :68241-68380）：
   *  NPC_576/577.png 1162×1740 = 5 列×10 行（XNA 整除 232×174/格），
   *  Frame(5,10,idx/10,idx%10)；锚 Bottom、origin(94 或 232-94, 174-4)、贴图朝右。
   *  未实装：localAI[3]<60 出生紫雾 3 层叠画（事件出生特效，走 spawnAlpha 渐显替代） */
  private drawDd2OgreGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage(`vanilla/NPC_${e.vanillaId}.png`);
    if (!img) return;
    const idx = dd2OgreNextFrame(this.npcGridFrame(e), { ai0: e.ai0, ai1: e.ai1, vx: e.vx, vy: e.vy });
    this.drawNpcGrid(e, img, 5, 10, idx, 232, 174, {
      perRow: 10, anchorPx: 94, originYOff: 4, mirrorTexFaces: 'right',
    });
  }

  /** 696（Main.cs case 696 :23349-23375 + FindFrame case 696 :67332-67388）：
   *  NPC_696.png 384×1242 = 6 列×27 行（64×46/格），Frame(6,27,idx/9,idx%9)——
   *  注意索引每 9 折行（perRow=9 而非 27）；锚 Bottom、origin(w/2,46-4)、贴图朝左
   *  （本 case 用 spriteEffects 原样，无 ^FlipHorizontally）。
   *  投影层：同列 row+18 半透明重绘（:23359-23367）；ai0==2 表情气泡未实装 */
  private drawNpc696Grid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_696.png');
    if (!img) return;
    const idx = npc696NextFrame(this.npcGridFrame(e), { ai0: e.ai0 });
    this.drawNpcGrid(e, img, 6, 27, idx, 64, 46, {
      perRow: 9, originYOff: 4, mirrorTexFaces: 'left', echoRowShift: 18,
    });
  }

  /** 564/565 暗黑魔法师 T1/T2（Main.cs case 564/565 :23413-23490 + FindFrame :68657-69085）：
   *  NPC_564/565.png 600×972 = 5 列×9 行（120×108/格），Frame(5,9,idx/9,idx%9)；
   *  锚 Bottom、origin(52 或 120-52, 108-10)、贴图朝右。
   *  Glow_225 同布局（600×972）以同一格切片叠画（:23484 white.A/2×Opacity，
   *  原 drawNpcGlow 551/564/565 alpha 分支并入此处）。
   *  未实装：localAI[3]<60 出生旋转紫雾、四向呼吸 sway 叠层（spawnAlpha 渐显替代） */
  private drawDarkMageGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage(`vanilla/NPC_${e.vanillaId}.png`);
    if (!img) return;
    const idx = darkMageNextFrame(this.npcGridFrame(e), {
      ai0: e.ai0, ai1: e.ai1, speed: Math.hypot(e.vx, e.vy),
    });
    this.drawNpcGrid(e, img, 5, 9, idx, 120, 108, {
      perRow: 9, anchorPx: 52, originYOff: 10, mirrorTexFaces: 'right',
      glowTex: 'vanilla/Glow_225.png',
    });
  }

  /** 668 鹿角怪（Main.cs DrawNPCDirect_Deerclops :26211-26295 全层 + FindFrame case 668
   *  :67390-67501）：NPC_668.png 1090×1200 = 5 列×5 行（218×240/格），
   *  Frame(5,5,idx/5,idx%5,2,2) 2px padding；锚 Bottom、origin(106 或 214-106, 236-4)、
   *  贴图朝右（spriteDirection==1 → origin.X=106）。
   *  全层 1:1：①localAI[3]>0 出生红雾双环绕（半径 (lai3/36)²×20，角速 GT×10，
   *  色值 (80,0,0)×0.5、alpha×(1-r²/2)，:26235-26253）②本体（紫电 tint：
   *  Lerp(白,(50,0,160),Remap(lai3,0,20,0,1))，alpha×(1-r²)，:26255-26262）③ai0∈{7,8}
   *  消散：num7=Remap(ai1,20,60,0,2) 三角波再 lerp 紫 ×(1-num7)，5 层重影（双轨道
   *  80n² 与 80n²+30j·n²，角速 GT×6 / GT×3·j·0.5，色 ×0.5，:26263-26283）
   *  ④Extra_245 前层红雾（(255,30,30,66)×Opacity×num12×0.25×(1-num7)，环绕半径
   *  r²×4，:26285-26295）。GT=GlobalTimeWrappedHourly（进程秒%3600，Main.cs:16777） */
  private drawDeerclopsGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_668.png');
    if (!img) return;
    const idx = deerclopsNextFrame(this.npcGridFrame(e), { ai0: e.ai0, vx: e.vx, vy: e.vy });
    const col = Math.floor(idx / 5), row = idx % 5;
    const sx = col * 218 + 2, sy = row * 240 + 2, sw = 214, sh = 236;
    const frame = { img, sx, sy, sw, sh };
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;   // NPC.Opacity
    const facingRight = e.facing > 0;
    const mirrored = !facingRight;                                        // 贴图朝右
    const originX = facingRight ? 106 : sw - 106, originY = sh - 4;
    const GT = (performance.now() / 1000) % 3600;
    // ---- 状态量（:26227-26270）----
    const lai3 = e.lai3;
    const r = lai3 > 0 ? lai3 / 36 : 0;                 // num6（红雾进度）
    const r2 = r * r;                                   // num3
    const r1 = lai3 > 0 ? Math.max(0, Math.min(1, lai3 / 20)) : 0; // 紫电 Remap(lai3,0,20,0,1)
    let num7 = 0;
    if (e.ai0 === 7 || e.ai0 === 8) {
      // Remap(ai1,20,60,0,2)（:26265）区外钳制
      num7 = e.ai1 <= 20 ? 0 : e.ai1 >= 60 ? 2 : ((e.ai1 - 20) / 40) * 2;
      if (num7 > 1) num7 = 2 - num7;                    // 三角波 0→1→0
    }
    const bodyAlpha = opacity * (1 - r2) * (1 - num7);  // ①透明环 + ③消散衰减
    const tPurple = r1 + num7 - r1 * num7;              // 两段 Lerp 链的合成系数
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.cx, e.y + e.h);
    ctx.scale(scale * (mirrored ? -1 : 1), scale);
    const drawFrame = (c: HTMLCanvasElement, dx: number, dy: number, alpha: number) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(c, -originX + dx, -originY + dy, sw, sh);
    };
    // ① 出生红雾双环绕（:26245-26253）：num2=2 层,(0,1).Rot(i·π + GT·10) × r²·20
    //    → 偏移 = (-sinθ, cosθ)·R；色 value2=(80,0,0)×0.5,alpha×(1-r²/2)
    if (lai3 > 0) {
      const red = this.lerpSprite('deer-red', frame, [40, 0, 0], 1);
      const a = (128 / 255) * (1 - r2 * 0.5) * opacity;
      for (let i = 0; i < 2; i++) {
        const th = i * Math.PI + GT * 10;
        const R = r2 * 20;
        drawFrame(red, -Math.sin(th) * R, Math.cos(th) * R, a);
      }
    }
    // ② 本体（紫电 tint 链）:26284
    const body = this.lerpSprite('deer-body', frame, [50, 0, 160], tPurple);
    drawFrame(body, 0, 0, bodyAlpha);
    // ③ ai0∈{7,8} 五层重影（:26272-26282）：双轨道,角速 GT·6 / GT·3·(j·0.5)
    if (e.ai0 === 7 || e.ai0 === 8) {
      const n9 = num7 * num7;
      for (let j = 0; j < 5; j++) {
        const a1 = j * (Math.PI * 2) / 5 + GT * 6;
        const a2 = j * (Math.PI * 2) / 5 + GT * 3 * (j * 0.5);
        const R1 = 80 * n9, R2 = 80 * n9 + 30 * j * n9;
        const dx = Math.cos(a1) * R1 + Math.cos(a2) * R2;
        const dy = Math.sin(a1) * R1 + Math.sin(a2) * R2;
        drawFrame(body, dx, dy, bodyAlpha * 0.5);       // color2 × 0.5
      }
    }
    // ④ Extra_245 前层红雾（:26285-26295）：(255,30,30,66)×Opacity×num12×0.25×(1-num7),
    //    num2 层环绕半径 r²×4——原版以【本体帧 rect】画 Extra_245 贴图（整图按帧矩形缩放）
    if (lai3 > 0) {
      const fog = this.atlas!.ensureVImage('vanilla/Extra_245.png');
      if (fog) {
        const num12 = Math.max(0, Math.min(1, lai3 / 20));   // Remap(lai3,0,20,0,1)
        const fa = (66 / 255) * opacity * num12 * 0.25 * (1 - num7);
        const fogT = this.lerpSprite('deer-fog', { img: fog, sx: 0, sy: 0, sw: fog.width, sh: fog.height }, [255, 30, 30], 1);
        for (let k = 0; k < 2; k++) {
          const th = k * Math.PI + GT * 10;
          const R = r2 * 4;
          drawFrame(fogT, -Math.sin(th) * R, Math.cos(th) * R, fa);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 逐像素 Lerp 染色（DrawData Color.Lerp 语义）：白底向 targetRGB 按 t 偏移,
   *  保留源 alpha。缓存键 t 量化 1/64 防连续值打爆。与 tintedSprite(乘法)分职 */
  private lerpSprite(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    target: [number, number, number], t: number,
  ): HTMLCanvasElement {
    const tq = Math.round(t * 64) / 64;
    const k = `lerp|${key}|${frame.sx},${frame.sy}|${target.join(',')}|${tq}`;
    let c = this.tintCache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(1, frame.sw); c.height = Math.max(1, frame.sh);
    const cx = c.getContext('2d')!;
    cx.drawImage(frame.img as CanvasImageSource, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, c.width, c.height);
    const d = cx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      px[i] += (target[0] - px[i]) * tq;
      px[i + 1] += (target[1] - px[i + 1]) * tq;
      px[i + 2] += (target[2] - px[i + 2]) * tq;
    }
    cx.putImageData(d, 0, 0);
    if (this.tintCache.size > 1024) this.tintCache.clear();
    this.tintCache.set(k, c);
    return c;
  }

  private drawMoonLordCore(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const ex13 = this.atlas.vmisc('vanilla/Extra_13.png');
    const ex14 = this.atlas.vmisc('vanilla/Extra_14.png');
    const ex16 = this.atlas.vmisc('vanilla/Extra_16.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 两侧上臂（:24346-24375）
    if (ex14) {
      for (let side = 0; side < 2; side++) {
        // 原版按 npc[whoAmI] 全表扫 ai[2]==side && ai[3]==core.whoAmI（:24346-24353）——
        // 我们的 AI 侧 ai3 = 核心实体 id（bossAI_duke_moonlord.ts moonLordHandAI 同语义）
        const hand = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead
          && n.vanillaId === 397 && n.ai2 === side && n.ai3 === e.id)
          ?? (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead
            && n.vanillaId === 397 && n.ai2 === side && (!n.master || n.master === e));
        if (!hand) continue;
        const [sx] = this.moonLordSideSign(side);
        const shx = e.cx + 220 * sx, shy = e.cy - 60;            // vector26（vector25.Y 恒 1）
        const vx = (hand.cx + 0 - shx) * 0.5;
        const vy = (hand.cy + 76 - shy) * 0.5;                   // vector27
        const ang = this.moonLordArmAngle(Math.hypot(vx, vy), sx);
        let ox = 76; if (side !== 0) ox = ex14.sw - 76;           // origin14（:24360）
        const rot = Math.atan2(vy, vx) - ang - Math.PI / 2;
        ctx.save();
        ctx.translate(shx, shy);
        ctx.rotate(rot);
        if (side !== 0) ctx.scale(-1, 1);                        // FlipHorizontally
        ctx.drawImage(ex14.img, ex14.sx, ex14.sy, ex14.sw, ex14.sh, -ox, -66, ex14.sw, ex14.sh);
        ctx.restore();
      }
    }
    // 躯干左右半（:24378-24379：origin (W,278)/(0,278)，右侧 FlipHorizontally）
    if (ex13) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(ex13.img, ex13.sx, ex13.sy, ex13.sw, ex13.sh, -ex13.sw, -278, ex13.sw, ex13.sh);
      ctx.scale(-1, 1);
      ctx.drawImage(ex13.img, ex13.sx, ex13.sy, ex13.sw, ex13.sh, -ex13.sw, -278, ex13.sw, ex13.sh);
      ctx.restore();
    }
    // 胸甲（:24380 origin (112,101)）
    if (ex16) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(ex16.img, ex16.sx, ex16.sy, ex16.sw, ex16.sh, -112, -101, ex16.sw, ex16.sh);
      ctx.restore();
    }
    // 核心心脏帧（:24381 origin=帧中心）
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const r = this.atlas.vnpc(398, vanillaFrameIdx(e, frames));
    if (r) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 月总手 397（case 397 :24391-24447）：前臂 Extra_15（锚=手中心+(0,76)、折角同上臂）
   *  → 眼窝（ai0==-2 闲置帧 Extra_26 行 / 否则 Extra_17 + 椭圆轨道瞳孔 Extra_19）
   *  → 手本体帧（origin (120,180)）。瞳孔轨道用 lai0/lai1（原版 localAI[0]/[1]） */
  private drawMoonLordHand(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const core = ((entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.id === e.ai3 && n.vanillaId === 398)
      ?? (e.master && e.master.vanillaId === 398 ? e.master
        : (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.vanillaId === 398))) ?? null;
    const ex15 = this.atlas.vmisc('vanilla/Extra_15.png');
    const ex17 = this.atlas.vmisc('vanilla/Extra_17.png');
    const ex19 = this.atlas.vmisc('vanilla/Extra_19.png');
    const ex26 = this.atlas.vmisc('vanilla/Extra_26.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const side = e.ai2 === 0 ? 0 : 1;
    const [sx] = this.moonLordSideSign(side);
    ctx.save();
    ctx.globalAlpha = alpha;
    // 前臂（:24418-24431）
    if (ex15 && core) {
      const shx = core.cx + 220 * sx, shy = core.cy - 60;        // vector45
      const ax = e.cx, ay = e.cy + 76;                           // vector46（+(0,76)）
      let vx = shx - ax, vy = shy - ay;
      vx *= 0.5; vy *= 0.5;                                      // v *= 1-num118
      const ang = this.moonLordArmAngle(Math.hypot(vx, vy), sx);
      let ox = 60; if (side !== 0) ox = ex15.sw - 60;            // origin19
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(vy, vx) + ang - Math.PI / 2);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(ex15.img, ex15.sx, ex15.sy, ex15.sw, ex15.sh, -ox, -30, ex15.sw, ex15.sh);
      ctx.restore();
    }
    // 眼窝/瞳孔（:24432-24441）
    if (e.ai0 === -2 && ex26) {
      const fh = Math.floor(ex26.sh / 4);
      const row = Math.min(3, Math.floor(Math.max(0, e.ai1) / 8));
      let ox = 26; if (side !== 0) ox = ex26.sw - 26;
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(ex26.img, ex26.sx, row * fh, ex26.sw, fh, -ox + 4, -42 + 4, ex26.sw, fh);
      ctx.restore();
    } else {
      if (ex17) {
        let ox = 26; if (side !== 0) ox = ex17.sw - 26;          // vector42
        ctx.save();
        ctx.translate(e.cx, e.cy);
        if (side !== 0) ctx.scale(-1, 1);
        ctx.drawImage(ex17.img, ex17.sx, ex17.sy, ex17.sw, ex17.sh, -ox, -42, ex17.sw, ex17.sh);
        ctx.restore();
      }
      if (ex19) {
        // 椭圆轨道瞳孔：Vector2FromElipse(rot(localAI[0]), (30,66)×localAI[1]) + (−signX,3)。
        // AI 侧轨道角/开度存于 handOf 内部态（渲染层不可达）——lai0/lai1 为 0 时
        // 瞳孔静态居中（登记），容器 Extra_17/19 位置与镜像仍 1:1
        const th = e.lai0, k = e.lai1;
        const ex = Math.cos(th) * 30 * k, ey = Math.sin(th) * 66 * k;
        ctx.save();
        ctx.translate(e.cx - sx + ex, e.cy + 3 + ey);
        ctx.drawImage(ex19.img, ex19.sx, ex19.sy, ex19.sw, ex19.sh, -ex19.sw / 2, -ex19.sh / 2, ex19.sw, ex19.sh);
        ctx.restore();
      }
    }
    // 手本体帧（:24442-24443 origin (120,180)）
    const r = this.atlas.vnpc(397, vanillaFrameIdx(e, Math.max(1, e.vanilla?.frames ?? 1)));
    if (r) {
      let ox = 120; if (side !== 0) ox = r.sw - 120;             // origin18
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -ox, -180, r.sw, r.sh);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 月总头 396（case 396 :24449-24503）：眼窝（ai0<0 闲置 Extra_26 行 / 否则 Extra_18
   *  + 椭圆瞳孔 Extra_19）→ 头帧（NPC_396 为 3×3 网格、scale 2）→ 破体阶段覆层
   *  Extra_29（+(0,4)）/Extra_25（+(0,214) 旋转）。帧索引以 animT 循环近似（AI 侧
   *  未映射 frameCounter）；破体帧行缺 localAI[2]/[3]，取行 0（登记） */
  /** 491 荷兰飞盗船（Main.cs:24263-24324 case 491 独占 1:1）：
   *  船体 590×534 锚 OriginFlip(208,460)（翻转取 590-208）；vector37.X 随
   *  spriteDirection（vx<0→facing=-1→Flip）；附加件全部随 rotation 旋转：
   *  旗 Extra40 4f@(102,-384) 底中锚 / 桨 Extra41 8f×5@(-96+34i,40) /
   *  帆1 Extra42 4f×2@(158-106i,-302) / 帆2 Extra43 4f×2@(42-178i,-444) /
   *  帆3 Extra44 4f@(-134,-302) / 帆4 Extra45 4f(相位差 2+num112)@(-60,-330) /
   *  炮 NPC_492 九帧（行=ai2 瞄准帧）×4@(-122+68i,-20)。 */
  private drawDutchman(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const hull = this.atlas.ensureVImage('vanilla/NPC_491.png');
    if (!hull || !hull.width) return;
    const vimg = (p: string) => this.atlas!.ensureVImage(p);
    const ex40 = vimg('vanilla/Extra_40.png'), ex41 = vimg('vanilla/Extra_41.png');
    const ex42 = vimg('vanilla/Extra_42.png'), ex43 = vimg('vanilla/Extra_43.png');
    const ex44 = vimg('vanilla/Extra_44.png'), ex45 = vimg('vanilla/Extra_45.png');
    const canSheet = vimg('vanilla/NPC_492.png');
    const ctx = this.ctx;
    const num112 = Math.floor(dutchmanAnim(e) / 8);          // :24272 localAI[3]/8
    const flip = e.facing === -1;                            // spriteDirection==1→Flip（vx<0）
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.cx, e.cy);
    ctx.rotate(e.visAngle);                                  // rotation = vx*0.025
    if (flip) ctx.scale(-1, 1);
    // 船体（:24265-24271）
    ctx.drawImage(hull, -208, -460, hull.width, hull.height);
    // 旗（:24272-24276）：4 帧 56×44，底中锚 (28,176)
    if (ex40?.width) {
      const f = num112 % 4;
      ctx.drawImage(ex40, f * 56, 0, 56, 176, 102 - 28, -384 - 176, 56, 176);
    }
    // 桨（:24277-24283）：8 帧 60×88，循环 5 次
    if (ex41?.width) {
      const f = num112 % 8;
      for (let i = 0; i < 5; i++) {
        ctx.drawImage(ex41, f * 60, 0, 60, 88, -96 + 34 * i, 40, 60, 88);
      }
    }
    // 帆1/2（:24284-24297）×2；帆3（:24298-24301）；帆4（:24302-24305，相位差帧）
    const sail = (img: HTMLImageElement | null, fw: number, fh: number, dx: number, dy: number, frame: number) => {
      if (!img?.width) return;
      ctx.drawImage(img, (frame % 4) * fw, 0, fw, fh, dx, dy, fw, fh);
    };
    for (let i = 0; i < 2; i++) sail(ex42, 72, 160, 158 - 106 * i, -302, num112 % 4);
    for (let i = 0; i < 2; i++) sail(ex43, 48, 90, 42 - 178 * i, -444, num112 % 4);
    sail(ex44, 52, 112, -134, -302, num112 % 4);
    sail(ex45, 142, 152, -60, -330, 2 + num112);
    // 炮代画（:24306-24322）：船 ai[0..3]=炮实体 id；NPC_492 Frame(1,9)=48×48/帧
    if (canSheet?.width) {
      for (let i = 0; i < 4; i++) {
        const cid = [e.ai0, e.ai1, e.ai2, e.ai3][i];
        const c = (entities as Enemy[]).find((n) => n instanceof Enemy && n.id === cid && !n.dead);
        if (!c) continue;
        const row = Math.max(0, Math.min(8, Math.round(c.ai2)));
        ctx.drawImage(canSheet, 0, row * 48, 48, 48, -122 + 68 * i - 24, -20 - 10, 48, 48);
      }
    }
    ctx.restore();
  }

  private drawMoonLordHead(e: Enemy) {
    if (!this.atlas) return;
    const ex18 = this.atlas.vmisc('vanilla/Extra_18.png');
    const ex19 = this.atlas.vmisc('vanilla/Extra_19.png');
    const ex25 = this.atlas.vmisc('vanilla/Extra_25.png');
    const ex26 = this.atlas.vmisc('vanilla/Extra_26.png');
    const ex29 = this.atlas.vmisc('vanilla/Extra_29.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const flip = e.facing > 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (e.ai0 < 0 && ex26) {
      const fh = Math.floor(ex26.sh / 4);
      const row = Math.min(3, Math.floor(Math.max(0, e.ai1) / 8));
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex26.img, ex26.sx, row * fh, ex26.sw, fh, -(19 + 4), -(34 + 4), ex26.sw, fh);
      ctx.restore();
    } else {
      if (ex18) {
        ctx.save();
        ctx.translate(e.cx, e.cy);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(ex18.img, ex18.sx, ex18.sy, ex18.sw, ex18.sh, -19, -34, ex18.sw, ex18.sh);
        ctx.restore();
      }
      if (ex19) {
        const th = e.lai0, k = e.lai1;
        ctx.save();
        ctx.translate(e.cx + Math.cos(th) * 27 * k, e.cy + Math.sin(th) * 59 * k);
        ctx.drawImage(ex19.img, ex19.sx, ex19.sy, ex19.sw, ex19.sh, -ex19.sw / 2, -ex19.sh / 2, ex19.sw, ex19.sh);
        ctx.restore();
      }
    }
    // 头帧：NPC_396.png 573×804 = 3 列 × 3 行（Frame(3,3)），origin (95.5,65)、scale 2
    const head = this.atlas.ensureVImage('vanilla/NPC_396.png');
    if (head) {
      const fw = Math.floor(head.width / 3), fh2 = Math.floor(head.height / 3);
      const idx = Math.floor(e.animT / 6) % 9;
      const col = idx % 3, row = Math.floor(idx / 3);
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(head, col * fw, row * fh2, fw, fh2, -95.5, -65, fw * 2, fh2 * 2);
      ctx.restore();
    }
    // 破体覆层（:24499-24501；帧行 0 近似）
    if (ex29) {
      const fh = Math.floor(ex29.sh / 4);
      ctx.save();
      ctx.translate(e.cx, e.cy + 4);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex29.img, ex29.sx, ex29.sy, ex29.sw, fh, -ex29.sw / 2, -fh / 2, ex29.sw, fh);
      ctx.restore();
    }
    if (ex25) {
      const fh = Math.floor(ex25.sh / 3);
      const off = { x: 0, y: 214 };
      const c = Math.cos(e.spin), s = Math.sin(e.spin);
      ctx.save();
      ctx.translate(e.cx + (off.x * c - off.y * s), e.cy + (off.x * s + off.y * c));
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex25.img, ex25.sx, ex25.sy, ex25.sw, fh, -ex25.sw / 2, -fh / 2, ex25.sw, fh);
      ctx.restore();
    }
    ctx.restore();
  }

  // ===================== 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554） =====================
  /** 女皇手臂帧（GetHallowBossArmFrame :26554-26640）：攻击态 ai0 × 计时 ai1 → 帧 0..6
   *  （0 垂放/1 抬/2 举/3 蓄/4 施法/5 后摆/6 前刺） */
  private empressArmFrames(e: Enemy): [number, number] {
    const t = e.ai1;
    let left = 0, right = 0;
    switch (e.ai0) {
      case 6: left = right = t < 6 ? 3 : t < 174 ? 4 : t < 180 ? 0 : 3; break;
      case 0: left = right = t < 106 ? 1 : t < 110 ? 0 : 3; break;
      case 2: case 11: left = t < 5 ? 3 : t < 65 ? 4 : 3; break;
      case 5: right = t < 6 ? 3 : t < 54 ? 4 : 3; break;
      case 4: case 10: left = right = t < 6 ? 3 : t < 54 ? 4 : 3; break;
      case 8: case 9: {
        const base = t < 10 ? 3 : t < 20 ? 4 : t < 30 ? 6 : 3;
        left = right = base;
        break;
      }
      case 7: {
        const num10 = 60; const num11 = 0; const num12 = 5;
        if (t < num11 + num12) left = 3;
        else if (t < num11 + num10) left = 4;
        else if (t < num11 + num10 + num12) { left = 4; right = 3; }
        else if (t < num11 + 2 * num10) { left = 4; right = 4; }
        else if (t < num11 + 3 * num10) { left = 5; right = 4; }
        else if (t < num11 + 4 * num10) { left = 5; right = 5; }
        else left = 5;
        break;
      }
      default: break;
    }
    return [left, right];
  }

  /** 女皇绘制：背后大翼 Extra_159（1×11 帧按 localAI[0]/4 推进、scale×2）→ 着色器层
   *  Extra_157（原版 HallowBoss 像素着色器；此处直画贴图近似，登记）→ 本体 NPC_636
   *  帧（二阶段 ai3∈{1,3} → 帧 1，FindFrame cs:67678）→ 二阶段翅膀覆层 Extra_187
   *  （1×8 帧 + 4 向相位轨道残影）+ 头冠 Extra_188（4 向残影）→ 双臂 Extra_158/160。
   *  攻击态 8/9/10 的彩虹残影环（:26401-26478）依赖逐 NPC hsl 轨道，登记未接。
   *  原版 AI_120 不写 npc.rotation（grep 实证）——旋转项以 facing 镜像为准 */
  private drawEmpress(e: Enemy) {
    if (!this.atlas) return;
    const ctx = this.ctx;
    const phase2 = e.ai3 === 1 || e.ai3 === 3;                    // AI_120_HallowBoss_IsInPhase2 (NPC.cs:46160)
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const flip = e.facing > 0;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const wing = this.atlas.vmisc('vanilla/Extra_159.png');
    const shader = this.atlas.vmisc('vanilla/Extra_157.png');
    const armL = this.atlas.vmisc('vanilla/Extra_158.png');
    const armR = this.atlas.vmisc('vanilla/Extra_160.png');
    const wing2 = this.atlas.vmisc('vanilla/Extra_187.png');
    const crown = this.atlas.vmisc('vanilla/Extra_188.png');
    const body = this.atlas.vnpc(636, phase2 ? 1 : 0);
    const frameAt = (r: NonNullable<ReturnType<SpriteAtlas['vmisc']>>, rows: number, idx: number) => {
      const fh = Math.floor(r.sh / rows);
      return { r, fh, idx: Math.min(rows - 1, Math.max(0, idx)) };
    };
    // num14：正弦脉动 0..1（:26500），二阶段轨道半径 Lerp(2,8)
    const pulse = Math.sin((performance.now() / 1000) * Math.PI * 2 * 0.5) * 0.5 + 0.5;
    ctx.save();
    ctx.translate(e.cx, e.cy);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    // 背后大翼（:26481 scale×2）
    if (wing) {
      const f = frameAt(wing, 11, Math.floor(e.animT / 4) % 11);
      ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh,
        -f.r.sw, -f.fh, f.r.sw * 2, f.fh * 2);
    }
    if (shader) {
      const f = frameAt(shader, 11, Math.floor(e.animT / 4) % 11);
      ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh,
        -f.r.sw, -f.fh, f.r.sw * 2, f.fh * 2);
    }
    // 本体（FindFrame：二阶段帧 1）
    if (body) ctx.drawImage(body.img, body.sx, body.sy, body.sw, body.sh, -body.sw / 2, -body.sh / 2, body.sw, body.sh);
    // 二阶段：翅膀覆层 + 4 向轨道残影（:26509-26524）
    if (phase2 && wing2) {
      const f = frameAt(wing2, 8, Math.floor(e.animT / 4) % 8);
      const drawW2 = (dx: number, dy: number, a: number) => {
        ctx.save();
        ctx.globalAlpha = alpha * a;
        ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh,
          -f.r.sw / 2 + dx, -f.fh / 2 + dy, f.r.sw, f.fh);
        ctx.restore();
      };
      drawW2(0, 0, 1);
      const rad = 2 + 6 * pulse;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        drawW2(Math.cos(a) * rad, Math.sin(a) * rad, 0.6 * (0.4 + 0.6 * pulse));
      }
      if (crown) {
        const drawCr = (dx: number, dy: number, a: number) => {
          ctx.save();
          ctx.globalAlpha = alpha * a;
          ctx.drawImage(crown.img, crown.sx, crown.sy, crown.sw, crown.sh,
            -crown.sw / 2 + dx, -crown.sh / 2 + dy, crown.sw, crown.sh);
          ctx.restore();
        };
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          drawCr(Math.cos(a) * rad, Math.sin(a) * rad, 0.6 * (0.4 + 0.6 * pulse));
        }
      }
    }
    // 双臂（帧表按攻击态）
    const [lf, rf] = this.empressArmFrames(e);
    if (armL) {
      const f = frameAt(armL, 7, lf);
      ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh, -f.r.sw / 2, -f.fh / 2, f.r.sw, f.fh);
    }
    if (armR) {
      const f = frameAt(armR, 7, rf);
      ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh, -f.r.sw / 2, -f.fh / 2, f.r.sw, f.fh);
    }
    ctx.restore();
  }

  // ===================== 塔护盾 ForceField（Main.cs:23797-23846） =====================
  /** 分塔 Perlin 纹理缓存：原版 = Misc/Perlin（512×512）以 600×600 PointWrap 采样进
   *  ForceField 像素着色器（Filters.Scene[塔名] 分塔预设色 + UseColor(1+flash*0.5)）。
   *  Canvas 无着色器——预生成分塔着色 Perlin 纹理作近似载体（噪声本身 1:1 原版贴图，
   *  分塔色预设对齐 TOWER_SHIELD_COLOR；着色器的流动/边缘扫描线未还原，登记） */
  private towerShieldTexCache = new Map<string, HTMLCanvasElement>();
  private towerShieldTex(key: string, col: string, bright = 1): HTMLCanvasElement | null {
    if (!this.atlas) return null;
    const ck = `${key}|${bright.toFixed(2)}`;
    const hit = this.towerShieldTexCache.get(ck);
    if (hit) return hit;
    const perlin = this.atlas.ensureVImage('vanilla/Misc_Perlin.png');
    if (!perlin) return null;
    const c = document.createElement('canvas');
    c.width = 600; c.height = 600;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    // PointWrap 采样语义：源 512×512 → 目标 600×600 单次放大（右/下 88px 由 wrap 补，
    // 此处以源左上 88px 接续，观感与噪声连续性无差）
    cx.drawImage(perlin, 0, 0, 512, 512, 0, 0, 600, 600);
    const [r, g, b] = col.split(',').map((n) => Math.min(255, Math.round(Number(n) * bright)));
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, 600, 600);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(c, 0, 0);
    this.towerShieldTexCache.set(ck, c);
    if (this.towerShieldTexCache.size > 16) {
      const first = this.towerShieldTexCache.keys().next().value;
      if (first !== undefined) this.towerShieldTexCache.delete(first);
    }
    return c;
  }

  /** 塔护盾（Main.cs:23802-23831 盾存分支 + :23832-23846 盾破碎裂分支）：
   *  alpha = ratio*0.8+0.2、scale×(1+flash*0.05)、着色 UseColor(1+flash*0.5)；
   *  盾破（shield==0 且 ai3>0）：progress=ai3/120、color alpha=1-√(min(ai3/30,1))、
   *  scale×(1+num268)——膨胀渐隐的碎裂残罩 */
  private drawTowerShield(e: Enemy, world: World) {
    const key = TOWER_KEY[e.vanillaId ?? -1];
    if (!key) return;
    const ctx = this.ctx;
    const col = TOWER_SHIELD_COLOR[e.vanillaId!];
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const shield = world.lunarEvent.shield[key];
    let alpha: number, size: number, bright: number;
    if (shield > 0) {
      const ratio = shield / shieldMax(world);
      let flash = 0;
      if (e.ai3 > 0 && e.ai3 <= 30) flash = 1 - e.ai3 / 30;   // :23803-23806
      alpha = Math.min(1, ratio * 0.8 + 0.2);
      size = 600 * scale * (1 + flash * 0.05);
      bright = 1 + flash * 0.5;
    } else if (e.ai3 > 0) {
      // 盾破碎裂环（:23832-23845）
      const num267 = e.ai3 / 120;
      const num268 = Math.min(e.ai3 / 30, 1);
      alpha = 1 - Math.sqrt(num268);
      size = 600 * scale * (1 + num268);
      bright = 2;                                               // UseColor(new Vector3(2f))
      void num267;                                              // 着色器 progress（未还原，登记）
    } else return;
    if (alpha <= 0.01) return;
    const tex = this.towerShieldTex(key, col, bright);
    if (!tex) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tex, e.cx - size / 2, e.cy - size / 2 + 10 * scale, size, size);
    ctx.restore();
  }

  /** AI_013 植物/攀爬者族茎蔓（Main.cs:22433-22514 1:1）：从 NPC 中心向锚点格
   *  中心（ai0/ai1 各 ×16+8）逐段画 Chain 贴图——步长 28px、距锚 <40px 时尾段
   *  缩短对齐（259/260 真菌球为 12/20）；整链 rotation=atan2(dy,dx)-π/2（贴图
   *  正面向上）。贴图分流（:22480-22510）：56→Chain5、175→Chain14、259/260→
   *  Chain24/25，默认（43 食人怪）→Chain4。光照由 compositeLight 全屏合成，
   *  此处不逐段取光。
   *  邪恶触手 101 是独占分支（:22391-22432，先于 aiStyle 13 判定）：Chain10/
   *  Chain11 交替段、scale 0.75、步进 15px（20×0.75）、终止 21px（28×0.75）、
   *  尾段高 = dist-40+28（与终止阈值解耦，绘制高 28 恒定——段间有意重叠） */
  private drawPlantVine(e: Enemy) {
    if (!this.atlas || e.ai0 < 0 || e.ai1 < 0) return;
    const ctx = this.ctx;
    const ax = e.ai0 * 16 + 8, ay = e.ai1 * 16 + 8;
    let px = e.cx, py = e.cy;
    let dx = ax - px, dy = ay - py;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    // Clinger 101 独占分支（:22391-22432）
    if (e.vanillaId === 101) {
      const c10 = this.atlas.vmisc('vanilla/Chain10.png');
      const c11 = this.atlas.vmisc('vanilla/Chain11.png');
      if (!c10 || !c11) return;
      const s = 0.75;                                // num3
      let alt = true;                                // flag3：首段走 else → Chain11
      let running = true;
      let guard = 0;
      while (running && guard++ < 200) {
        let h = 28;                                  // 绘制高（恒 28，尾段除外）
        const dist = Math.hypot(dx, dy);
        if (dist < 28 * s) { h = dist - 40 + 28; running = false; }
        if (dist > 0 && h > 0) {
          const k = 20 * s / dist;                   // 步进 15px
          px += dx * k; py += dy * k;
          dx = ax - px; dy = ay - py;
          const c = alt ? c11 : c10; alt = !alt;
          const sh = Math.min(h, c.sh);              // 源矩形越界钳（XNA 同）
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          ctx.drawImage(c.img, c.sx, c.sy, c.sw, sh, -c.sw * s / 2, -c.sh * s / 2, c.sw * s, sh * s);
          ctx.restore();
        } else {
          running = false;
        }
      }
      return;
    }
    const id = e.vanillaId;
    // num7/num8：段长/终止距离（Main.cs:22442-22447）
    let step = 28, stop = 40;
    if (id === 259 || id === 260) { step = 12; stop = 20; }
    const chain = this.atlas.vmisc(
      id === 56 ? 'vanilla/Chain5.png'
        : id === 175 ? 'vanilla/Chain14.png'
          : id === 259 ? 'vanilla/Chain24.png'
            : id === 260 ? 'vanilla/Chain25.png'
              : 'vanilla/Chain4.png');
    if (!chain) return;
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {               // :22441-22512
      const dist = Math.hypot(dx, dy);
      let seg = step;
      if (dist < stop) { seg = dist - stop + step; running = false; }
      if (dist > 0 && seg > 0) {
        const k = seg / dist;
        px += dx * k; py += dy * k;                 // 段心向锚点步进（:22454-22455）
        dx = ax - px; dy = ay - py;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        // 源矩形取贴图顶部 seg 行，origin=贴图中心（:22504-22505 scale 1）
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, Math.min(seg, chain.sh),
          -chain.sw / 2, -chain.sh / 2, chain.sw, Math.min(seg, chain.sh));
        ctx.restore();
      } else {
        running = false;                            // 头贴锚点（dist≈0）不画段
      }
    }
  }

  /** 石巨人拳链（Main.cs:22593-22632 1:1）：拳 → golemBoss 本体中心（AI 侧
   *  master=本体，本体死透时锚自由头——与原版 golemBoss=-1 回退自身中心的
   *  差异已注释）；目标带肩偏移（247 左 -70×scale / 248 右 +66×scale，Y -7×scale），
   *  Chain21 全段 16×16、步长 16×scale、距锚 <16 无尾段直接停 */
  private drawGolemFistChain(e: Enemy) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc('vanilla/Chain21.png');
    if (!chain || !e.master) return;
    const ctx = this.ctx;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const offX = e.vanillaId !== 247 ? 66 : -70;    // :22605（type!=247 → +66）
    const ax = e.master.cx, ay = e.master.cy;
    let px = e.cx, py = e.cy;
    let dx = ax - px + offX * scale;
    let dy = ay - py - 7 * scale;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;   // :22607
    let guard = 0;
    while (guard++ < 200) {
      const dist = Math.hypot(dx, dy);
      if (dist < 16) break;                         // :22609-22612 无尾段
      const k = 16 * scale / dist;
      px += dx * k; py += dy * k;
      dx = ax - px + offX * scale;
      dy = ay - py - 7 * scale;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        -chain.sw / 2, -chain.sh / 2, chain.sw, chain.sh);
      ctx.restore();
    }
  }

  /** Prime 部件臂骨（Main.cs:22633-22675 1:1，与骷髅王手 36 同构的两段收缩
   *  IK）：锚点 = 部件 pos + w/2 - 5×ai[0], +20；朝头中心两段 92/60 归一化，
   *  段偏移（-200×ai[0], +130）/（-50×ai[0], +80），旋转 atan2-π/2，
   *  贴图 Arm_Bone_2（26×98，rect/origin 与 Arm_Bone 同尺寸） */
  private drawPrimeArm(e: Enemy) {
    if (!this.atlas) return;
    const arm = this.atlas.vmisc('vanilla/Arm_Bone_2.png');
    if (!arm || !e.master) return;
    const ctx = this.ctx;
    const head = e.master;
    const side = e.ai0 || 1;                        // ai[0] 侧别 ±1
    let vx = e.x + e.w * 0.5 - 5 * side;            // :22635
    let vy = e.y + 20;
    for (let k = 0; k < 2; k++) {
      let dx = head.cx - vx, dy = head.cy - vy;
      let n: number;
      if (k === 0) { dx -= 200 * side; dy += 130; const len = Math.hypot(dx, dy) || 1; n = 92 / len; }
      else { dx -= 50 * side; dy += 80; const len = Math.hypot(dx, dy) || 1; n = 60 / len; }
      vx += dx * n; vy += dy * n;
      const rot = Math.atan2(dy, dx) - Math.PI / 2; // :22662
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(rot);
      ctx.drawImage(arm.img, arm.sx, arm.sy, arm.sw, arm.sh, -arm.sw / 2, -arm.sh / 2, arm.sw, arm.sh);
      ctx.restore();
      if (k === 0) { vx += dx * n / 2; vy += dy * n / 2; }  // :22666 段间推进
    }
  }

  /** 世纪之花钩蔓/触须链（Main.cs:22225-22285 1:1）：263 钩蔓→Chain26、
   *  264 触须→Chain27，目标 = 本体中心（触须 ai[3]>0 时锚另一触须——AI 侧
   *  master 已按同语义解析）；步长 16、距锚 <32 尾段缩短（dist-32+16），
   *  origin=贴图全高中心、scale 1 */
  private drawPlanteraVine(e: Enemy) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc(e.vanillaId === 263 ? 'vanilla/Chain26.png' : 'vanilla/Chain27.png');
    if (!chain || !e.master) return;
    const ctx = this.ctx;
    const ax = e.master.cx, ay = e.master.cy;
    let px = e.cx, py = e.cy;
    let dx = ax - px, dy = ay - py;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      let seg = 16;                                 // num9/num15
      const dist = Math.hypot(dx, dy);
      if (dist < 32) { seg = dist - 32 + 16; running = false; }
      if (dist > 0 && seg > 0) {
        const k = seg / dist;
        px += dx * k; py += dy * k;
        dx = ax - px; dy = ay - py;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, Math.min(seg, chain.sh),
          -chain.sw / 2, -chain.sh / 2, chain.sw, Math.min(seg, chain.sh));
        ctx.restore();
      } else {
        running = false;
      }
    }
  }

  /** 双子互连链（Main.cs:22177-22224，1.4.5 新增）：Retinazer 125 激活时向
   *  场上的 Spazmatism 126 画 Chain12（原版双方各画一遍，几何相同——单侧画
   *  一次等价）。两端锚 = Bottom - h×0.5×scale，步长 28×scale、距锚
   *  <40×scale 无尾段停、相距 >2000px 不画 */
  private drawTwinsChain(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc('vanilla/Chain12.png');
    if (!chain) return;
    const other = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.vanillaId === 126);
    if (!other) return;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const ax = other.cx, ay = other.y + other.h - other.h * 0.5 * scale;
    let px = e.cx, py = e.y + e.h - e.h * 0.5 * scale;
    let dx = ax - px, dy = ay - py;
    if (Math.hypot(dx, dy) > 2000) return;          // :22196-22199
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    const step = 28 * scale, stop = 40 * scale;     // num6
    let guard = 0;
    while (guard++ < 200) {
      const dist = Math.hypot(dx, dy);
      if (dist < stop) break;                       // :22204-22208 无尾段
      const k = step / dist;
      px += dx * k; py += dy * k;
      dx = ax - px; dy = ay - py;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        -chain.sw / 2, -chain.sh / 2, chain.sw * scale, chain.sh * scale);
      ctx.restore();
    }
  }

  private drawSkeletronArm(hand: Enemy, head: Enemy) {
    if (this.armBoneImg === undefined) {
      this.armBoneImg = new Image();
      this.armBoneImg.src = 'sprites/vanilla/Arm_Bone.png';
    }
    const img = this.armBoneImg;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const ctx = this.ctx;
    const ai0 = hand.ai0 >= 0 ? 1 : -1; // ai[0]：-1 左手 / 1 右手
    // vector5 = 手部锚点（Main.cs:22545：position + width/2 - 5*ai[0], +20）
    let vx = hand.x + hand.w / 2 - 5 * ai0;
    let vy = hand.y + 20;
    for (let j = 0; j < 2; j++) {
      // num14/num15 = 头中心（position + w/2, +h/2）相对锚点的向量（Main.cs:22547-22548）
      let dx = head.x + head.w / 2 - vx;
      let dy = head.y + head.h / 2 - vy;
      let k: number;
      if (j === 0) { dx -= 200 * ai0; dy += 130; const len = Math.hypot(dx, dy) || 1; k = 92 / len; }
      else { dx -= 50 * ai0; dy += 80; const len = Math.hypot(dx, dy) || 1; k = 60 / len; }
      vx += dx * k; vy += dy * k;
      const rot = Math.atan2(dy, dx) - Math.PI / 2; // Main.cs:22572
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(rot);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();
      if (j === 0) { vx += dx * k / 2; vy += dy * k / 2; } // Main.cs:22587 段间推进
    }
  }

  /**
   * NPC 血条 1:1（Main.DrawHealthBar Main.cs:21748-21839 + 显示门
   * DrawInterface_14_EntityHealthBars :45223：life != lifeMax && !dontTakeDamage——
   * 掉血即常驻显示、满血隐藏；immortal 实体血量恒满自动排除）。
   * Hb1/Hb2 贴图未入素材管线——几何绘制同布局：总宽 36px（scale=1）、填充 min 3px、
   * Y=实体脚下（settings=1 经典锚点 position.Y+height+NPCAddHeight）、
   * 颜色公式 :21771-21810（ratio-0.1 → >0.5 绿 r=255*(1-n)*2 / 否则红 g=255*n*2，b=0，
   * ×0.95 alpha；前景/背景同色 tint 靠明度区分）
   */
  /**
   * 挂物族存放物叠画（原版 TE*.Draw：物品框/武器架/食物盘/展示罐把存放物图标画在
   * 框体上；模特/帽架走 PlayerRenderer 画穿戴件——本作无纸娃娃渲染链，等价为在
   * 锚点上叠画各槽位物品图标）。仅锚点画一次，视口外剔除；不进 ChunkCache 烘焙
   * （存放物是运行时可变状态，见 world/FurnitureItems.ts）。
   */
  private drawFurnitureItems(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    const list = world.furnitureItems;
    if (!list.length || !this.atlas) return;
    const ctx = this.ctx;
    // 视口剔除（与 drawWires 同式）
    const vx0 = cam.x - viewW / 2 / z - 64, vx1 = cam.x + viewW / 2 / z + 64;
    const vy0 = cam.y - viewH / 2 / z - 80, vy1 = cam.y + viewH / 2 / z + 64;
    for (const rec of list) {
      const bx = rec.x * TILE, by = rec.y * TILE;
      if (bx < vx0 || bx > vx1 || by < vy0 || by > vy1) continue;
      if (!rec.slots.some((s) => s !== null)) continue;
      const drawIcon = (itemId: number, cx: number, cy: number, maxSide: number) => {
        const ar = this.atlasIcon(itemId);
        if (!ar) return;
        const sc = Math.min(maxSide / Math.max(ar.sw, ar.sh), 1);
        const w = ar.sw * sc, h = ar.sh * sc;
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, cx - w / 2, cy - h / 2, w, h);
      };
      switch (rec.kind as FurnitureKind) {
        case 'item_frame':     // 2×2：图标居中
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 16, by + 16, 20);
          break;
        case 'weapon_rack':    // 3×3：图标居中
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 24, by + 24, 24);
          break;
        case 'food_platter':   // 1×1：盘上小图标
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 8, by + 6, 12);
          break;
        case 'display_jar':    // 1×2：罐心
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 8, by + 14, 12);
          break;
        case 'hat_rack':       // 3×4：两顶帽子并排挂钩位（TEHatRack.Draw 双 doll 锚）
          for (let i = 0; i < 2; i++) {
            const s = rec.slots[i];
            if (s) drawIcon(s.id, bx + 14 + i * 22, by + 22, 16);
          }
          for (let i = 0; i < 2; i++) {
            const s = rec.slots[2 + i];
            if (s) drawIcon(s.id, bx + 14 + i * 22, by + 40, 12);
          }
          break;
        case 'display_doll':   // 2×3：穿戴件自上而下叠画（头/身/腿/配饰/坐骑/持握）
          for (let i = 0, row = 0; i < rec.slots.length; i++) {
            const s = rec.slots[i];
            if (!s) continue;
            drawIcon(s.id, bx + 16, by + 8 + row * 13, 14);
            row++;
          }
          break;
      }
    }
  }

  /** 入驻旗帜（Main.cs:40152-40236 DrawNPCHousesInWorld 1:1）：
   *  有家非流浪城镇 NPC（bound/守卫老人除外）在家坐标上方挂 House_Banner_1
   *  （2×2 帧 16×20：X=单/双人旗、Y=housingCategory——城镇 NPC 全 0）+ 头像
   *  叠画（NPC_Head_{id} 24×24）。同房多 NPC 每面旗下移 26px。锚点=帧中心。
   *  位置 = home.x*16+8，y = 首个实心格下沿+18 */
  private drawHouseBanners(entities: unknown[], world: World, cam: Camera) {
    if (!this.atlas) return;
    const cloth = this.atlas.vmisc('vanilla/House_Banner_1.png');
    if (!cloth) return;
    const ctx = this.ctx;
    const st = world.store;
    const banners: TownNPC[] = [];
    for (const e of entities) {
      if (e instanceof TownNPC && !e.dead && !e.bound && e.home && e.npcKey !== 'old_man') banners.push(e);
    }
    // 同房重复偏移（原版 num4：同 home 的排序在后计数 ×26）
    for (const n of banners) {
      const dup = banners.filter((o) => o !== n && o.home!.x === n.home!.x && o.home!.y === n.home!.y
        && banners.indexOf(o) > banners.indexOf(n)).length;
      // 从 home.y-1 向上找第一个实心格（天花板/上表面）
      let cy = n.home!.y - 1;
      let found = false;
      while (cy >= 10) {
        if (st.isSolid(n.home!.x, cy)) { found = true; break; }
        cy--;
      }
      if (!found) continue;
      // 整面旗帜绘制（House_Banner_1 = 吊杆+垂布的完整旗，32×40 ≈ 2×2.5 格；
      // 用户对照官方原版实测旗帜约 4 格方形——此前按 Frame(2,2) 切 16×20 画小了）
      const bx = n.home!.x * 16 + 8;                    // 原版 num8=8 偏移
      // num9=18；实心格是平台（tile 19）时 -8（Main.cs:40212-40214）——
      // 平台只有半格厚，旗帜上移贴平台上表面
      const onPlatform = TILE_DEFS[st.type[st.idx(n.home!.x, cy)]]?.vanilla?.sheet === 19;
      const by = (cy + 1) * 16 + (onPlatform ? 10 : 18) + dup * 26;
      ctx.drawImage(cloth.img, cloth.sx, cloth.sy, cloth.sw, cloth.sh,
        bx - cloth.sw / 2, by - cloth.sh / 2, cloth.sw, cloth.sh);
      // 头像叠画（原版 TownNPCProfiles/TypeToDefaultHeadIndex NPC.cs:7489——head 索引≠NPC id）
      const headIdx = TOWN_NPC_HEAD_INDEX[n.vanillaId];
      const head = headIdx != null ? this.atlas.vmisc(`vanilla/NPC_Head_${headIdx}.png`) : null;
      if (head) {
        const hs = Math.min(1, 24 / Math.max(head.sw, head.sh));
        const hw = head.sw * hs, hh = head.sh * hs;
        ctx.drawImage(head.img, head.sx, head.sy, head.sw, head.sh,
          bx - hw / 2, by - hh / 2 + 2, hw, hh);
      }
      // 光照色调（原版 Lighting.GetColor(homeTileX, num3)：旗布头像受所在格光照染色。
      //  lightCanvas 为屏幕空间 2× 超采样光照图（合成在本层之后，此处取上一帧数据——
      //  光照变化平缓一帧滞后无感；首帧全黑跳过）
      const rectW = cloth.sw, rectH = cloth.sh + 4;
      const [lsx, lsy] = cam.worldToScreen(bx, by - 12);
      const lx = Math.round(lsx * 2), ly = Math.round(lsy * 2);
      if (lx >= 0 && ly >= 0 && lx < this.lightCanvas.width && ly < this.lightCanvas.height) {
        const ld = this.lightCtx.getImageData(lx, ly, 1, 1).data;
        if (ld[0] + ld[1] + ld[2] > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgb(${ld[0]},${ld[1]},${ld[2]})`;
          ctx.fillRect(bx - rectW / 2, by - rectH / 2, rectW, rectH);
          ctx.restore();
        }
      }
      // hover 名条（原版 40255+：鼠标悬停旗帜显示 NPC 名）
      if (this._mouseX >= 0) {
        const [mwx, mwy] = cam.screenToWorld(this._mouseX, this._mouseY);
        if (mwx >= bx - rectW / 2 && mwx <= bx + rectW / 2 && mwy >= by - rectH / 2 && mwy <= by + rectH / 2) {
          // FullName 语义（Lang.cs:416 GetNPCHouseBannerText → NPC.FullName:6657）：
          //  有个人名 → Game.NPCTitle（zh "{1}{0}"=类型名+个人名）；无 → 类型名
          const typeName = Lang.npcName(n.vanillaId) ?? n.npcKey;
          const label = n.givenName ? Lang.text('Game.NPCTitle', n.givenName, typeName) : typeName;
          ctx.font = '12px "Fusion Pixel 12px", sans-serif';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(20,16,28,0.85)';
          ctx.fillRect(bx - tw / 2 - 5, by - rectH / 2 - 20, tw + 10, 15);
          ctx.fillStyle = '#E8E4F0';
          ctx.textAlign = 'center';
          ctx.fillText(label, bx, by - rectH / 2 - 9);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  /** bound 姿态专属贴图表（原版 1:1：捆绑待救 NPC 是【独立 NPC 类型】而非 ai[0] 态——
   *  NPCID.cs:11275 BoundGoblin=105 / 11277 BoundWizard=106 / 11311 BoundMechanic=123 /
   *  11773 WebbedStylist=354 / 12243 GolferRescue=589；税务官则是地狱敌怪
   *  DemonTaxCollector(酷刑者)=534（净化粉命中 Transform 441，Projectile.cs:13651））。
   *  各表为单帧捆绑姿态（534 是 8 帧敌怪表、589 是 13 帧表），FindFrame 无专属 case → 恒帧 0 */
  private static readonly BOUND_NPC_SHEET: Record<string, number> = {
    goblin_tinkerer: 105, wizard: 106, mechanic: 123, stylist: 354, golfer: 589, tax_collector: 534,
    town_slime_old: 685, town_slime_clumsy: 686,   // 抖动的旧宝箱 / 笨笨气球史莱姆（绑缚态单帧）
  };

  /** bound NPC 姿态帧（各表帧 0）。589 在 vanilla-npcs.json 缺登记（json 缺口族，同 588/633/663）
   *  ——vnpc 懒加载会按 frames=1 把 62×624 整条画出，故此处显式帧数切片 */

  /** 派对变体贴图条 id 集（UpdateAltTexture NPC.cs:91250——441/453/633 永不 altTexture=1，
   *  对应 TownNPCs/{Name}_Default_Party 表已在 public/sprites/vanilla/NPC_{id}_Alt_1.png）
   *  ——2026-08-13 退役：派对/微光/狼人切表统一走 n.townSheet（TownNPCs 档案表，
   *  data/townNpcProfiles.ts），该表为 PARTY_ALT_IDS 严格超集（补 678-681/683/684
   *  史莱姆派对贴图与微光档） */

  // ---- 派对帽（Main.cs:26814-27089 DrawNPCExtras Extra[72] 1:1）----
  // NPCFramingGroup（NPCID.cs:4875：默认 0；18/20/208/178/124/353→1；369→2；160→3；城镇史莱姆 670/678-684→7）
  private static readonly HAT_FRAMING_GROUP: Record<number, number> = { 18: 1, 20: 1, 208: 1, 178: 1, 124: 1, 353: 1, 369: 2, 160: 3, 670: 7, 678: 7, 679: 7, 680: 7, 681: 7, 682: 7, 683: 7, 684: 7 };
  /** TownNPCsFramingGroups（NPCID.cs:4879-4928：8 组，值域 −6..+6——按帧行号的帽 Y 微调） */
  private static readonly HAT_FRAME_GROUPS: number[][] = [
    [0, 0, 0, -2, -2, -2, 0, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],          // 0（26）
    [0, 0, 0, -2, -2, -2, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],             // 1（25）
    [0, 0, 0, -2, -2, -2, 0, 0, -2, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],            // 2（25）
    [0, 0, -2, 0, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0],                       // 3（22）
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 4, 6, 4, 2, 2, -2, -4, -6, -4, -2, -4, -4, -6, -6, -6, -4],// 4（28）
    [0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, 0, 0, -2, -2, 0, 0, 4, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4],      // 5（28）
    [0, 0, -2, -4, -4, -2, 0, -2, 0, 0, 2, 4, 6, 4, 2, 0, -2, -4, -6, -6, -6, -6, -6, -6, -4, -2],  // 6（26）
    [0, -2, 0, -2, -4, -6, -4, -2, 0, 0, 2, 2, 4, 2],                                               // 7（14，城镇史莱姆）
  ];
  /** HatOffsetY（NPCID.cs:4827：默认 0 的例外表） */
  private static readonly HAT_OFFSET_Y: Record<number, number> = {
    227: 4, 107: 2, 108: 2, 229: 4, 17: 2, 38: 8, 160: -10, 208: 2, 142: 2, 124: 2,
    453: 2, 37: 4, 54: 4, 209: 4, 369: 6, 441: 6, 353: -2, 633: -2, 550: -2, 588: 2, 663: 2, 656: 4,
  };
  /** num7 逐 type 水平微调（Main.cs:27010-27062；default 0） */
  private static hatXOffset(id: number): number {
    if (id === 550) return -4;
    if (id === 588) return 0;
    if (id === 227) return -4;
    if (id === 228 || id === 678 || id === 681 || id === 682) return -2;
    if ([17, 18, 19, 20, 22, 124, 229, 353, 633, 637, 638, 656, 670, 679, 680, 683, 684].includes(id)) return -1;
    if ([37, 38, 54, 107, 108, 160, 207, 209].includes(id)) return -3;
    if (id === 178 || id === 208 || id === 369) return 1;
    return 0;
  }
  /** GetPartyHatColor（NPC.cs:67246-67269：name+whoAmI+moonPhase → 5 色格）；
   *  色格映射 Main.cs:26824-26838（1→0 蓝/2→16 粉/3→17 青/4→18 紫/5→19 白） */
  private static partyHatCell(name: string, whoAmI: number, moonPhase: number, isDay: boolean): number {
    if (!name) return 0;
    let num = name.length + name.charCodeAt(0);
    const m = isDay ? moonPhase - 1 : moonPhase;
    num += whoAmI;
    num += m * (whoAmI % 2 === 0 ? 1 : -1);
    if (num < 0) num += 5;
    num %= 5;
    if (num === 0) num++;
    return num === 1 ? 0 : num + 14; // 2→16 / 3→17 / 4→18 / 5→19
  }

  /** 派对帽叠画（UsesPartyHat NPC.cs:67221-67244：441/37/633 恒不戴；
   *  帽锚=脚底中心同体绘制块（bottom+vector，origin=帽底 12px），随 facing 镜像） */
  private drawPartyHat(ctx: CanvasRenderingContext2D, n: TownNPC, world: World) {
    // UsesPartyHat 排除（67223-67226）
    if (n.vanillaId === 441 || n.vanillaId === 37 || n.vanillaId === 633) return;
    const sheet = this.atlas ? this.atlas.ensureVImage('vanilla/Extra_72.png') : null;
    if (!sheet) return;
    const num = n.frame; // frame.Y / frame.Height
    const group = Renderer.HAT_FRAME_GROUPS[Renderer.HAT_FRAMING_GROUP[n.vanillaId] ?? 0]
      ?? Renderer.HAT_FRAME_GROUPS[0];
    const num3 = n.vanillaId === 663 ? 1 : 0; // 公主头部前伸（Main.cs:26845-26848）
    let num5 = n.facing; // spriteDirection（facing>0=朝右=镜像同体块）
    let num4 = 0;
    let hatNum3 = num3;
    if (n.vanillaId === 682) { num5 = -num5; hatNum3 = -1; num4 = 2; } // IsTownSlime（:26901-26928，仅 682 在库）
    const cell = Renderer.partyHatCell(n.givenName, n.id, world.clock.moonPhase ?? 0, world.clock.isDay);
    const W = 38, H = 34; // Extra_72 格 40×36 −2 边缘（:26840-26841）
    // vector 装配（:26961-27065）：-(0,h)+(-2*num5,0) → +num3*num5 → +array[num] → +HatOffsetY → +num7*num5 → +4*num5
    const vx = -2 * num5 + hatNum3 * num5 + Renderer.hatXOffset(n.vanillaId) * num5 + 4 * num5;
    const vy = -(n.h) + (group[num] ?? group[0]) + num4 + (Renderer.HAT_OFFSET_Y[n.vanillaId] ?? 0);
    // origin = (W/2, H-12)（:27009）→ drawImage 左上 = (vx − W/2, vy − (H−12))
    ctx.drawImage(sheet, cell * 40, 0, 40, 36, vx - W / 2, vy - (H - 12), W, H);
  }

  private boundNpcSheet(n: TownNPC): DrawRect | null {
    const id = Renderer.BOUND_NPC_SHEET[n.npcKey];
    if (!id || !this.atlas) return null;
    const img = this.atlas.ensureVImage(`vanilla/NPC_${id}.png`);
    if (!img) return null;
    const frames = id === 589 ? 13 : id === 534 ? 8 : 1;
    const fh = Math.max(1, Math.floor(img.height / frames));
    return { img, sx: 0, sy: 0, sw: img.width, sh: Math.min(fh, img.height) };
  }

  private drawTownNPC(n: TownNPC, world?: World) {
    const ctx = this.ctx;
    // 血条统一走实体循环的 drawHealthBar(原版 HealthBar1/2 贴图版,Main.cs:21721+;
    // 此前这里另画早期程序化矩形条 = 双血条,已移除)
    // 表情气泡统一走实体层的 EmoteBubble 模块(drawEmotes :1112,并行会话 1:1 版:
    // GetPosition 头顶锚/开合帧/8tick 图标帧)——本函数的内联气泡版已退役(双画,
    // 与双血条同病;review 2026-08-13)
    // ---- 原版贴图条（Images/NPC_{id}，40×56 帧、默认朝左）：帧语义见 TownNPC.fixedUpdate ----
    // 注意：不再回退 Maples 角色/NPC_1.png——那是原版绿史莱姆贴图（Maples 沿用原版命名），
    // 曾导致全部城镇 NPC 显示为史莱姆
    if (this.atlas) {
      // bound 态：走专属捆绑姿态表（原版是独立 NPC 类型，见 BOUND_NPC_SHEET 注释）
      // ---- TownNPCs 档案切表（DrawNPCCheckAlt Main.cs:22304-22309 → profile.
      //      GetTextureNPCShouldUse）：n.townSheet 按微光档（townNpcVariationIndex，
      //      = shimmered）+ altTexture（1 派对 / 2 狼人）选 {Name}_Default{,_Party,
      //      _Transformed} / Shimmered_{Name}_…；无档案类型（637/638/656 宠物）返回
      //      null → 落回 NPC_{id} 竖条 ----
      const sheetPath = n.bound ? null : n.townSheet;
      const profileImg = sheetPath ? this.atlas.ensureVImage(sheetPath) : null;
      let r: DrawRect | null;
      if (profileImg) {
        // 帧数 = vanilla-npcs.json frames（见 townSheetFrameCount 口径注）;
        // idx 钳位保证任何数据出入都界内
        const count = townSheetFrameCount(n.vanillaId);
        const fh = Math.floor(profileImg.height / count);
        const idx = Math.max(0, Math.min(count - 1, n.frame));
        r = { img: profileImg, sx: 0, sy: idx * fh, sw: profileImg.width, sh: fh };
      } else {
        r = n.bound ? this.boundNpcSheet(n) : this.atlas.vnpc(n.vanillaId, n.frame);
      }
      if (r) {
        ctx.save();
        // 底锚 + 逐帧实测底部透明行数补偿(spriteBottomPad):帧底 ~2px 透明边距
        // 裸底锚悬空 2px、中心锚入地 2px(实测反馈)——pad 补偿保证贴地,
        // 与怪物(:854)/纸娃娃(:1266)/legacy(:1301)统一
        const pad = this.spriteBottomPad(r, `npc${n.bound ? 'bound' : n.vanillaId}:f${n.frame}`);
        ctx.translate(n.cx, n.y + n.h); // 脚底中心
        if (n.facing > 0) ctx.scale(-1, 1); // 原版贴图默认朝左，向右镜像
        if (n.iframes > 0 && n.iframes % 4 < 2) ctx.filter = 'brightness(2.5)'; // 受击闪白
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh + pad, r.sw, r.sh);
        if (this.scene?.partyUp && world) this.drawPartyHat(ctx, n, world);
        ctx.filter = 'none';
        ctx.restore();
        return;
      }
      // 贴图条懒加载首帧未就绪：落入下方程序化兜底，本帧后懒加载完成
    }
    const spr = this.assets.enemySprites.get(n.npcKey);
    if (!spr) return;
    ctx.save();
    ctx.translate(n.cx, n.cy);
    ctx.scale(n.facing >= 0 ? 1 : -1, 1);
    ctx.drawImage(spr.canvas, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
    ctx.restore();
  }

  /** swing 形状（Game.swing / 远端 swingNet 同构）。
   *  useStyle 分族 + aim（useStyle 5/13 的瞄准角）由 Game.useSwing 写入 */
  private drawPlayer(p: Player, world: World, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number; noGraphic?: boolean } | null) {
    const ctx = this.ctx;
    if (p.dead) return;
    // ---- 手持物（PlayerDrawLayers.cs:3857 门槛）：itemAnimation>0 || (holdStyle!=0) ----
    // 武器/工具 holdStyle=0 → 仅使用中渲染（下方挥舞动画）；火把/荧光棒族 holdStyle=1、
    // 雨伞族 holdStyle=2 等静持时也渲染（ItemCheck_ApplyHoldStyle :49496 逐值持位）；
    // noWet（火把 noWet=true）→ 水下不显示（与手持光源熄灭同步）。
    // holdStyle 数据源 = vanilla-itemfunc（40 件）∪ DefaultToTorch 批量族（提取漏，
    // HOLD_STYLE_ITEMS 手工补）∪ IsFood 批量（Item.cs:48519 `if (Sets.IsFood) holdStyle=1`
    // 在 SetDefaults 公共尾部强制——在库食物 4023/4291/5275/5277/5278/1912/1919 等提取漏，
    // 此前静持不显示）；7 无持位分支（仅 bodyFrame 行 11）不画
    let staticHoldStyle = 0;
    if (!swing) {
      const held = p.inv.heldItem();
      const def = held ? ITEM_DEFS[held.id] : undefined;
      if (held && def && !p.inWater) {
        const vid = viIdFromKey(def.key); // vi_8_Torch 自动解析 8(本地特判已退役)
        // IsFood 门在最前：原版公共尾段无条件覆盖（即使 itemfunc 已录也以 1 为准）
        const hs = vid >= 0 && VANILLA_IS_FOOD.has(vid) ? 1
          : vid >= 0 ? itemFuncOfVid(vid)?.holdStyle ?? (HOLD_STYLE_ITEMS.has(vid) ? 1 : 0) : 0;
        staticHoldStyle = hs === 7 ? 0 : hs;
        if (staticHoldStyle) {
          const ar = this.atlasIcon(held.id);
          const icon = ar ? null : this.itemIcon(held.id);
          if (ar || icon) {
            const fw = ar ? ar.sw : 14, fh = ar ? ar.sh : 14;
            // 持位（ApplyHoldStyle dir=1 空间；offX 正=身前，offY 从 p.y 起算）：
            //  1 默认 = (fw/2+2, 24)（:49720）；2 雨伞 = (-16, 22)（:49764）、
            //  其余 = (6, 16) 旋 -0.79（:49777）；3 = (-2, 中心-fh/2)（:49790）；
            //  6 = (8, 38+头饰)（:49833）；8 = (6, 28+头饰)（:49851）。rot 恒 0（除 2 的 else）
            let offX = fw * 0.5 + 2, offY = 24, rot = 0;
            if (hs === 2) {
              if (vid === 946 || vid === 4707) { offX = -16; offY = 22; }
              else { offX = 6; offY = 16; rot = -0.79; }
            } else if (hs === 3) {
              offX = -2; offY = p.h * 0.5 - fh * 0.5;
            } else if (hs === 6) {
              offX = 8; offY = 38 + HEADGEAR_OFFSET_Y[2];
            } else if (hs === 8) {
              offX = 6; offY = 28 + HEADGEAR_OFFSET_Y[2];
            }
            ctx.save();
            ctx.translate(p.cx + p.facing * offX, p.y + offY);
            ctx.scale(p.facing, 1);
            ctx.rotate(rot);
            if (ar) {
              ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, -fh, ar.sw, ar.sh);
            } else if (icon) {
              ctx.drawImage(icon, 0, -icon.height * 0.6, icon.width * 0.6, icon.height * 0.6);
            }
            ctx.restore();
          }
        }
      }
    }
    // 挥舞动画（工具）：人物身后图层——挥砍弧大部分在身体轮廓外，身后不遮挡
    if (swing && swing.item >= 0 && ITEM_DEFS[swing.item]?.tool) {
      this.drawUseItem(ctx, p, swing);
    }

    // 无敌帧闪烁：半透明而非消失（主角本体永不全隐）
    ctx.save();
    // 水下滤镜：只作用于主角本体素材（蓝色调：去饱和 + 压暗 + 蓝移）
    if (p.headUnderwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
    let bodyAlpha = 1;
    if (p.iframes > 0 && p.iframes % 6 < 2) bodyAlpha = 0.45;
    // 微光化半透明（Player.cs:18147-18162 shimmerTransparency → GetImmuneAlpha
    // :53253-53256：(1-t) 连乘三次 = (1-t)³ 曲线（前段几乎不透明、后段急坠），
    // t≥0.8 直接 Color.Transparent 全隐——曾线性 1-t，深浸段偏亮）
    if (p.shimmerTransparency > 0) {
      bodyAlpha *= p.shimmerTransparency >= 0.8 ? 0 : (1 - p.shimmerTransparency) ** 3;
    }
    if (bodyAlpha < 1) ctx.globalAlpha = bodyAlpha;
    // 矿车骑乘：整体绕脚底中心旋转（Player.fullRotation/fullRotationOrigin=(w/2,h)，
    // Player.cs:27805-27806 TrackRotation 产出）+ gfxOffY 纵向贴轨补偿
    const cart = p.ridingCart ? p.cart : null;
    const gfxOff = cart ? cart.gfxOffY : 0;
    if (cart && cart.rotation !== 0) {
      ctx.translate(p.cx, p.y + p.h);
      ctx.rotate(cart.rotation);
      ctx.translate(-p.cx, -(p.y + p.h));
    }
    // ---- 坐骑身后层（Mount.Draw backTexture :5500：先于玩家本体绘制）----
    const mnt = p.ridingMount ? p.mount : null;
    if (mnt) this.drawMountLayer(ctx, p, mnt, 'back');
    // 跨台阶时用渲染补偿高度（从旧高度缓升），消除物理瞬移的顿挫感；
    // 联机远端叠加 netOffset（原版 Player.netOffset 平滑收敛，本地玩家恒 0）
    // 坐骑骑姿抬升（PlayerDrawSet :425-426 mountOffSet=HeightOffsetVisual →
    // Position.Y -= playerYOffsets[frame]：玩家精灵整体上移坐到坐骑背上）
    const mOff = mnt ? mnt.playerOffset : 0;
    ctx.translate(p.cx - p.facing * 2.5 + p.netOffX, p.y + p.h + p.stepRenderY + gfxOff + p.netOffY - mOff); // 脚底中心（精灵后移2.5px = 碰撞盒微前移）
    ctx.scale(p.facing, 1);

    // ---- 翅膀层（PlayerDrawLayers.cs:695/738：身后，先于身体绘制）----
    // 源矩形 = 全宽 × 高/帧数×wingFrame（7 帧族；hover 族 22/28/30/31/33/35/37/45 = 6 帧）；
    // origin = (宽/2, 帧高/2)；身体中心锚 + 朝向镜像；光照逐格取色（简化：整翅乘中心格光）
    {
      const wingSlot = p.equipStats.wing?.logic ?? 0;
      if (wingSlot > 0 && this.atlas) {
        const wt = this.atlas.ensureVImage(`vanilla/Wings_${wingSlot}.png`);
        if (wt) {
          const HOVER6 = new Set([22, 28, 30, 31, 33, 35, 37, 45]);
          const frames = HOVER6.has(wingSlot) ? 6 : 7;
          const fh = Math.floor(wt.naturalHeight / frames);
          const fr = Math.min(frames - 1, Math.max(0, p.wingFrame));
          // （光照染色待接：compositeLight 全屏 multiply 已覆盖翅膀——无独立 tint 需要）
          ctx.save();
          ctx.translate(p.cx, p.y + p.h * 0.45);   // 身体中心（PlayerDrawLayers 锚）
          ctx.scale(p.facing >= 0 ? 1 : -1, 1);
          ctx.drawImage(wt, 0, fr * fh, wt.naturalWidth, fh,
            -wt.naturalWidth / 2, -fh / 2, wt.naturalWidth, fh);
          ctx.restore();
        }
      }
    }
    // ---- 纸娃娃帧（捏人外观优先，M7；20 帧表默认朝右，与 NPC 相反不做内层翻转） ----
    // use 期间 bodyFrame 行（Player.cs:35874-35990 itemAnimation>0 分支逐 useStyle）：
    // 返回 -1 = 该族不改 bodyFrame（useStyle 10/14/15 与无匹配分支的 16），走常规动画行
    const useRow = swing ? this.useStyleBodyRow(swing, p) : -1;
    let drawn = false;
    if (p.appearance) {
      let dollEquip = dollEquipFromInv(p.inv, this.atlas);
      // ⑮ 狼人形态（PlayerFrame :35457-35484：wereWolf 时盔甲槽强制 38/21/20）
      if (p.buffs.has(BuffType.Werewolf)) dollEquip = { head: 38, body: 21, legs: 20 };
      const doll = compositePaperDoll(p.appearance, dollEquip);
      if (doll) {
        let row = 0; // 0 站立
        if (useRow >= 0) row = useRow;
        else if (cart || mnt) row = mnt ? mnt.bodyFrame : 3;  // 坐骑 BodyFrame（Player.cs:36059 bodyFrame=Height*mount.BodyFrame；全坐骑=3）
        else if (Math.abs(p.vx) > 0.3 && p.onGround) {
          // ★行走循环优先于静持行——原版 PlayerFrame（cs:36012 静持 vs :36178
          // velocity.X!=0 走路）静持行确实在前，但原版身体/腿是【分图层】：静持只钉
          // 身体行（手臂持物）、腿照常走 legFrame 循环；本项目纸娃娃是单层合成帧，
          // 钉行会把腿一起冻结=走路无动画。单层近似：走路时静持行让位（手持物
          // 仍按上方 holdStyle 持位渲染）
          row = 6 + Math.floor(p.animTime / 6) % 14;
        }
        else if (staticHoldStyle) {
          // 静持 bodyFrame 行（Player.cs:36007-36040）：1/3/5→行3、2→行2、
          // 4→站定行 0；6/8 无行分支（7 已在上方置 0 不画）
          if (staticHoldStyle === 2) row = 2;
          else if (staticHoldStyle === 4 && p.onGround) row = 0;
          else row = 3;
        }
        else if (!p.onGround) row = p.vy < 0 ? 1 : 4;
        const f = dollFrame(doll, row);
        // 贴底:纸娃娃帧底有 ~2px 透明边距(Player_0_10 全帧实测),底锚会悬空——
        // 与 legacy 路径(:1301)/小动物同一 spriteBottomPad 补偿
        const pad = this.spriteBottomPad(f, `doll:${row}`);
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -f.sw / 2, -f.sh + pad, f.sw, f.sh);
        drawn = true;
      }
    }
    if (!drawn && this.atlas) {
      const idle = this.atlas.rect('角色/Player.png', 'Player_0');
      const runFrames = this.runFramesCache ??= this.atlas.animFrames('Player/Run');
      // 动作帧池（Player.png 12-22 号帧）
      if (!this.actionFramesCache) {
        const pool: Record<string, ReturnType<SpriteAtlas['rect']>> = {};
        for (let k = 12; k <= 22; k++) {
          const fr = this.atlas!.rect('角色/Player.png', 'Player_' + k);
          if (fr) pool['Player_' + k] = fr;
        }
        this.actionFramesCache = pool;
      }
      const af = this.actionFramesCache;
      let frame: typeof idle = null;
      // use 期间：bodyFrame 行映射到动作帧池（行1→19 举 / 行2→20 挥 / 行3→21 收，
      // 行0→12 / 行4→14；Player.cs:35876-35990 逐 useStyle 行档）
      if (useRow >= 0) {
        const rowFrame = af['Player_' + (useRow === 0 ? 12 : useRow === 4 ? 14 : 19 + useRow)];
        frame = rowFrame ?? idle;
      } else if (cart || mnt) {
        frame = af['Player_21'] ?? idle;  // bodyFrame 行 3 → 动作帧池 21（收势/坐姿）
      } else if (Math.abs(p.vx) > 0.3 && p.onGround) {
        // ★行走循环优先于静持行（与纸娃娃路径同因：原版身体/腿分图层，静持只钉
        // 身体行、腿照常走 legFrame 循环（cs:36178）；单层帧近似下静持行让位）
        const idx = Math.floor(p.animTime / 6) % runFrames.length;
        frame = runFrames[idx] ?? idle;
      } else if (staticHoldStyle === 2) {
        frame = af['Player_20'] ?? idle; // holdStyle 2 → bodyFrame 行 2
      } else if (staticHoldStyle === 4 && p.onGround) {
        frame = idle;                    // holdStyle 4 → 站定行 0
      } else if (staticHoldStyle) {
        frame = af['Player_21'] ?? idle; // holdStyle 1/3/5 → bodyFrame 行 3
      } else if (!p.onGround) {
        // 空中：上升用 12（收腿）、下落用 14（张腿）
        frame = (p.vy < 0 ? af['Player_12'] : af['Player_14']) ?? runFrames[0] ?? idle;
      } else {
        frame = idle;
      }
      if (frame) {
        // 精灵视觉高度固定 56px（≈3.5 格）——与碰撞盒解耦，
        // 碰撞盒缩小只影响物理，贴图保持高大观感不变
        const h = 56;
        const w = (frame.sw / frame.sh) * h;
        // 脚踏实地：按精灵最低不透明行对齐脚底（消除底部透明留白导致的浮空）
        const pad = this.spriteBottomPad(frame);
        // Maples 精灵默认朝左 → 内层翻转，画完还原（否则手持物会被一起翻到背后）
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h + pad * (h / frame.sh), w, h);
        ctx.restore();
        drawn = true;
      }
    }
    if (!drawn) {
      // 程序化兜底（锚点同样为脚底中心）
      const sheet = this.assets.playerSheet;
      const fw = this.assets.playerFrameW, fh = this.assets.playerFrameH;
      const frame = p.frame;
      ctx.drawImage(sheet, frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
    }

    ctx.restore();
    // ---- 坐骑身前层（Mount.Draw frontTexture：玩家本体之后绘制）----
    if (mnt) this.drawMountLayer(ctx, p, mnt, 'front');
    // ---- 矿车车身（Mount.Draw frontTexture :5500/5826-5835 1:1）----
    // 锚点 = 玩家位 + (w/2 + XOffset*dir, h/2 + YOffset(13) + PlayerOffset(8))，
    // 源矩形 = (0, 帧高*frame, 50, 帧高)、origin = (25, 帧高/2)；轮组 3 帧×12t。
    // 旋转与玩家同轴（上方 fullRotation 变换），故此处再绕同一原点转一次
    if (cart && this.atlas) {
      const img = this.atlas.ensureVImage(cart.texture);
      if (img) {
        const frames = 3;
        const fh = Math.floor(img.height / frames);
        const fr = Math.min(frames - 1, Math.max(0, cart.animFrame));
        const anchorX = p.x + p.w / 2 + p.facing;         // width/2 + XOffset(1)*dir
        // height 用坐骑 hitbox（42 + heightBoost 10 = 52）：height/2 + YOffset(13) + PlayerOffset(8)
        const anchorY = p.y + cart.h / 2 + 13 + 8;
        ctx.save();
        if (cart.rotation !== 0) {
          ctx.translate(p.cx, p.y + p.h);
          ctx.rotate(cart.rotation);
          ctx.translate(-p.cx, -(p.y + p.h));
        }
        ctx.drawImage(img, 0, fr * fh, img.width, fh,
          anchorX - img.width / 2, anchorY + gfxOff - fh / 2, img.width, fh);
        ctx.restore();
      }
    }
    // 使用类物品（托举：药水/方块等非工具）：身体前方图层，避免被身体挡住。
    // noGraphic 族(短剑 noUseGraphic=true)不画物品贴图——投射物即本体,双画=两个贴图
    if (swing && swing.item >= 0 && !ITEM_DEFS[swing.item]?.tool && !swing.noGraphic) {
      this.drawUseItem(ctx, p, swing);
    }

    void world;
  }

  /** 坐骑贴图叠画（Mount.Draw :5500-6075 主体 1:1）。
   *  锚点 = 玩家底心 + (XOffset×dir, -(42+heightBoost)/2 + YOffset + PlayerOffset)
   *  （原版 Position + (width/2 + XOffset, height/2 + YOffset + PlayerOffset)，height 为
   *  mounted 盒 42+heightBoost、bottom 锚定——本仓玩家盒恒 42，按底心换算）；
   *  源矩形 = (0, 帧高×frame, 全宽, 帧高)，origin = (宽/2, 帧高/2)，朝向翻转随 facing。
   *  能力族特例：
   *   - 钻头 8（:5793-5796/:5831-5837/:6027-6063）：背层外环随 outerRingRotation 旋转；
   *     前层（座舱）面右水平翻转；眼前层（二极管）随 diodeRotation 旋转并射出两束
   *     挖掘激光（CornflowerBlue/LightGreen，宽 2px）至光束锁定格。
   *   - Scutlix 9（:5571-5576/:5729-5735）：前层/眼前层取 frameExtra（瞄准帧 6-10）；
   *     眼辉层按充能比渐显（charge==0 不画）。
   *   - 史后坐骑 50（:5838-5857/:5924-5948）：Extra_207（后翼）→ 主贴图 → Extra_205
   *     （前身）→ Extra_206（眼翼）四层；主贴图原版经 RenderTarget 叠 QueenSlime 着色器
   *     （PlayerQueenSlimeMountTextureContent——纯装饰，静态近似，登记）。
   *  贴图不可得坐骑（MOUNT_TEXTURE_OK=false：马匹/滚轴鞋/Chillet 等 Extra 表缺）→
   *  色块近似（胶囊体）并保留能力生效——登记于 vanilla-mounts.json textureOk */
  private drawMountLayer(ctx: CanvasRenderingContext2D, p: Player,
    mnt: import('../entities/Mounts').MountInstance, layer: 'back' | 'front') {
    const tex = mnt.textures;
    const main = layer === 'back' ? tex.back : tex.front;
    const extra = layer === 'back' ? tex.backExtra : tex.frontExtra;
    if (this.atlas && main) {
      const img = this.atlas.ensureVImage(main);
      if (img) {
        const d = mnt.data!;
        const frames = Math.max(1, d.totalFrames ?? 1);
        const fh = Math.floor(img.height / frames);
        // 帧索引（Mount.Draw :5565-5630）：Scutlix 前层取 frameExtra（瞄准帧），
        // 其余取主帧
        let fr = Math.min(frames - 1, Math.max(0, mnt.frame));
        if (mnt.type === 9 && layer === 'front') fr = Math.min(frames - 1, Math.max(0, mnt.frameExtra));
        const xOff = (d.xOffset ?? 0) * (p.facing < 0 ? -1 : 1);
        const anchorX = p.x + p.w / 2 + xOff;
        const anchorY = p.y + p.h - (42 + (d.heightBoost ?? 0)) / 2 + (d.yOffset ?? 0) + mnt.playerOffset;
        ctx.save();
        ctx.translate(anchorX, anchorY);
        // 朝向翻转（Mount.Draw :5831-5837）：type 8 仅前层（座舱）面右翻——环/二极管
        // 不翻（二极管靠 diodeRotation 覆盖全向）；其余坐骑面左翻
        const flip = mnt.type === 8
          ? (layer === 'front' ? p.facing > 0 : false)
          : p.facing < 0;
        if (flip) ctx.scale(-1, 1);
        // 层旋转（Mount.Draw :5793-5796）：钻头背层 = 外环角 / 钻头眼前层 = 二极管角
        if (mnt.type === 8) {
          ctx.rotate(layer === 'back' ? mnt.outerRingRotation : 0);
        }
        // ---- 史后坐骑（50）四层（:5838-5857/:5924-5948，均在背层） ----
        if (mnt.type === 50 && layer === 'back' && this.atlas) {
          const layerImg = (name: string) => this.atlas!.ensureVImage(`vanilla/${name}`);
          const drawLayer = (name: string, row: number, dy: number) => {
            const li = layerImg(name);
            if (!li) return;
            // 各 Extra 层行高与主贴图一致（70×576/8 与 70×288/4 均 72px），行数各异
            const rows = Math.max(1, Math.floor(li.height / fh));
            const r = Math.min(rows - 1, Math.max(0, row));
            ctx.drawImage(li, 0, r * fh, li.width, fh, -li.width / 2, dy - fh / 2, li.width, fh);
          };
          const dy = 8 - mnt.playerOffset + 20;          // 原版 (0, 8-PlayerOffset+20) 偏移
          drawLayer('Extra_207.png', mnt.frameExtra, dy); // 后翼（frameExtra 行）
          ctx.drawImage(img, 0, fr * fh, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
          drawLayer('Extra_205.png', mnt.frame, 0);       // 前身（主帧行）
          drawLayer('Extra_206.png', mnt.frameExtra, dy); // 眼翼（frameExtra 行）
          ctx.restore();
          return;
        }
        ctx.drawImage(img, 0, fr * fh, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
        // 副层（蜜蜂翅膀 Mount_BeeWings / Scutlix 眼族 / 钻头二极管）：
        //  - Scutlix 眼辉：充能比渐显，charge==0 整层跳过（:5729-5735）
        //  - 钻头二极管：diodeRotation 旋转（:5796）+ 两束激光（:6027-6063）
        if (extra) {
          const ex = this.atlas.ensureVImage(extra);
          if (ex) {
            const efh = Math.floor(ex.height / frames);
            const efr = layer === 'front' ? fr : Math.min(frames - 1, Math.max(0, mnt.frameExtra));
            if (mnt.type === 9 && layer === 'front') {
              const chargeMax = d.abilityChargeMax ?? 0;
              if (mnt.abilityCharge <= 0) { /* 眼辉未充能：不画 */ }
              else {
                ctx.save();
                ctx.globalAlpha *= Math.min(1, mnt.abilityCharge / Math.max(1, chargeMax));
                ctx.drawImage(ex, 0, Math.min(frames - 1, Math.max(0, mnt.frameExtra)) * efh,
                  ex.width, efh, -ex.width / 2 - 1, -efh / 2 - 1, ex.width, efh);
                ctx.restore();
              }
            } else if (mnt.type === 8 && layer === 'front') {
              // 二极管层（frontExtra）：不随 facing 翻（上面 flip 只对 front 主层）——
              // 此处在已翻转的坐标系里先翻回来，再按 diodeRotation 旋转
              ctx.save();
              if (flip) ctx.scale(-1, 1);
              ctx.rotate(mnt.diodeRotation);
              ctx.drawImage(ex, 0, 0, ex.width, ex.height, -ex.width / 2, -ex.height / 2, ex.width, ex.height);
              // 两束激光：二极管点 → 光束锁定格中心（MagicPixel scale(2, len) 近似）
              const rot = (v: { x: number; y: number }) => ({
                x: v.x * Math.cos(mnt.diodeRotation) - v.y * Math.sin(mnt.diodeRotation),
                y: v.x * Math.sin(mnt.diodeRotation) + v.y * Math.cos(mnt.diodeRotation),
              });
              const p1 = rot({ x: 36, y: -6 }), p2 = rot({ x: 36, y: 8 });
              for (let i = 0; i < mnt.beams.length; i++) {
                const b = mnt.beams[i];
                if (b.tx < 0) continue;
                const txp = b.tx * 16 + 8 - anchorX, typ = b.ty * 16 + 8 - anchorY;
                const origins = [p1, p2];
                const o = origins[i % 2];
                const dx = txp - o.x, dyL = typ - o.y;
                const len = Math.hypot(dx, dyL);
                if (len <= 0) continue;
                ctx.save();
                ctx.translate(o.x, o.y);
                ctx.rotate(Math.atan2(dyL, dx));
                ctx.globalAlpha *= 0.25;    // color.A=128 后 ×0.5（:6045-6047）
                ctx.fillStyle = i % 2 === 0 ? '#6495ED' : '#90EE90';  // CornflowerBlue/LightGreen
                ctx.fillRect(-1, 0, 2, len);
                ctx.restore();
              }
              ctx.restore();
            } else {
              ctx.drawImage(ex, 0, efr * efh, ex.width, efh, -ex.width / 2 - 1, -efh / 2 - 1, ex.width, efh);
            }
          }
        }
        ctx.restore();
        // 钻头激活时的光标十字（原版 = 投射物 453 贴图随鼠标；本仓无投射物，
        // 激活期直接叠画十字贴图于瞄准点）
        if (mnt.type === 8 && layer === 'front' && mnt.abilityActive && this.atlas) {
          const cross = this.atlas.ensureVImage('vanilla/Projectile_453.png');
          if (cross) {
            ctx.drawImage(cross, mnt.crosshairX - cross.width / 2, mnt.crosshairY - cross.height / 2);
          }
        }
        return;
      }
    }
    // 色块近似：贴图缺表的坐骑（约 32/64）——胶囊体 + 朝向头部
    if (layer === 'back') return;    // 近似体单层即可，避免双层叠深
    const d = mnt.data!;
    const bodyH = 42 + (d.heightBoost ?? 0) - 20;
    const bodyW = Math.max(24, Math.min(56, bodyH * 1.3));
    const cx = p.x + p.w / 2, cy = p.y + p.h - bodyH / 2 + mnt.playerOffset;
    ctx.save();
    ctx.fillStyle = mountFallbackColor(mnt.type);
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + p.facing * bodyW * 0.45, cy - bodyH * 0.25, bodyW * 0.16, bodyH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** use 期间 bodyFrame 行（Player.cs:35874-35990，itemAnimation>0 分支逐 useStyle）。
   *  -1 = 不改 bodyFrame（useStyle 10/14/15 被 flag6 排除在 :35716、16 无匹配分支），
   *  交给常规动画行（行走/跳跃）。aim 仅 useStyle 5 用（:35986 itemRotation*direction 档） */
  private useStyleBodyRow(swing: { t: number; dur: number; useStyle?: number; aim?: number }, p: Player): number {
    const us = swing.useStyle ?? 1;
    const pAnim = Math.min(1, Math.max(0, swing.t / swing.dur));
    switch (us) {
      case 1:
      case 13:
        // :35882-35890 / :35971-35985：三段 行1/2/3（13 与 1 同表）
        return pAnim > 2 / 3 ? 1 : pAnim > 1 / 3 ? 2 : 3;
      case 2:
      case 3:
        return 3; // :35908 / :35948（3 两段都是行3）
      case 4:
        return 2; // :35959 举过头
      case 9:
        return 0; // :35927 饮用
      case 6: {
        // :35931-35947：(1-pAnim)*6 截 1，≥0.5 → 行3 否则行2
        const n = Math.min((1 - pAnim) * 6, 1);
        return n >= 0.5 ? 3 : 2;
      }
      case 5: {
        // :35986-36005：默认行3；itemRotation*dir < -0.75 → 行2、> 0.6 → 行4。
        // itemRotation = Atan2(aimY*dir, aimX*dir)（:46730）——朝左时与裸 aim 相差 ±π，
        // 此前直接 aim*facing 同源错位
        const irot = Math.atan2(Math.sin(swing.aim ?? 0) * p.facing, Math.cos(swing.aim ?? 0) * p.facing);
        const n21 = irot * p.facing;
        if (n21 < -0.75) return 2;
        if (n21 > 0.6) return 4;
        return 3;
      }
      case 14:
      case 15:
      case 10:
      case 16:
        return -1;
      default:
        return pAnim > 2 / 3 ? 1 : pAnim > 1 / 3 ? 2 : 3;
    }
  }

  /** 使用/挥舞动画（与静持同尺寸：原始像素比例，不放大）。
   *  useStyle 1:1 分族（Player.cs:49916 ItemCheck_ApplyUseStyle switch）：
   *   1 挥砍三段（已验证）/ 2 咀嚼 / 3 雨伞 / 4 举过头 / 5 朝鼠标静持（法杖钉中心）
   *   6 饮用旋转 / 9 举杯（DefaultToHealingPotion）/ 13 短剑突刺（复合手臂）/
   *   14-15 头侧持 / 16 委托静持（holdStyle）。
   *  坐标约定：全部按 direction=+1 推导（offX 正=身前），朝左靠镜像空间翻转；
   *  offY 从 p.y（碰撞盒顶）起算；旋转 origin = 底角（PlayerDrawLayers.cs:3260）。
   *  图层：工具/武器挥砍在身体之前调用（身后），使用类托举在身体之后调用（身前） */
  private drawUseItem(ctx: CanvasRenderingContext2D, p: Player, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number; noGraphic?: boolean }) {
    const ar = this.atlasIcon(swing.item);
    const icon = ar ? null : this.itemIcon(swing.item);
    const pAnim = Math.min(1, Math.max(0, swing.t / swing.dur));
    const fw = ar ? ar.sw : 14, fh = ar ? ar.sh : 14;
    const us = swing.useStyle ?? 1;
    // ★aim 方向化（Player.cs:46730/46737：itemRotation = Atan2(aimY*dir, aimX*dir)——
    //  原版朝左时以翻转 sprite + 该角绘制；本项目是镜像空间，等价本地绘制角 = π-aim
    //  （镜像共轭 mirror∘rot(θ)=rot(−θ)∘mirror，模 2π 后世界指向与 aim 一致）。
    //  useStyle 5（法杖/枪弓）与 13（短剑）消费；aim 未传取 0（正前方）
    const aim = p.facing === -1 ? Math.PI - (swing.aim ?? 0) : (swing.aim ?? 0);
    // → { rot, offX, offY, drawOX, drawOY }（dir=1 空间）；hide = 原版把 itemLocation
    // 挪到 -1000（不画）。drawO* = itemLocation（握点）在精灵矩形内的锚定偏移，
    // 默认底左角 (0,-fh)（PlayerDrawLayers.cs:3260 origin=(W/2-W/2*dir, H)）
    let rot = 0, offX = 0, offY = 0, hide = false, drawOX = 0, drawOY = -fh;
    // useStyle 1 三段持位 tier（Player.cs:49957-50095）——case 1 与 default 共用
    const swingTier = (ph: 0 | 1 | 2): { x: number; y: number } => {
      const xT = (w: number) => ph === 0
        ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 14 : 10
        : ph === 1
          ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 18 : 10
          : w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w >= 48 ? 18 : w > 32 ? 14 : 6;
      const yT = (h: number) => ph === 0 ? 24
        : h > 64 ? 14 : h > 52 ? 12 : ph === 1 && h > 32 ? 8 : 10;
      // phase2（起手）持位在身后（:50071 `center - (w/2-num6)*dir`）
      return ph === 2
        ? { x: -(fw * 0.5 - xT(fw)), y: yT(fh) }
        : { x: fw * 0.5 - xT(fw), y: yT(fh) };
    };
    switch (us) {
      case 1: {
        // useStyle=1（:49939-50108）1:1：约 200° 线性挥砍弧 + 三段持位。
        // ★时段方向：pAnim ≡ itemAnimation/itemAnimationMax（随 t 递减，与 rot 公式同源）——
        //  末段(anim<0.333max ⟺ pAnim≤1/3)→前持位(phase0) / 中段→(phase1) /
        //  起手(anim≥0.666max ⟺ pAnim≥2/3)→后举位(phase2)。此前按"递增进度"整段接反
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        const seg = pAnim <= 1 / 3 ? swingTier(0) : pAnim < 2 / 3 ? swingTier(1) : swingTier(2);
        offX = seg.x; offY = seg.y;
        break;
      }
      case 2: {
        // 咀嚼（:50183-50224，DefaultToFood 非 gulp 族：蘑菇 5/蜂蜜鳍 2314）：
        // 手臂伸缩档 num15=8/6/4/2 → offX = num15+10-fw/2，Y = 中心 + fh/2-4；rot 不变
        const n14 = 1 - pAnim;
        const n15 = n14 <= 0.25 ? 8 : n14 <= 0.5 ? 6 : n14 <= 0.75 ? 4 : 2;
        offX = n15 + 10 - fw * 0.5;
        offY = p.h * 0.5 + fh * 0.5 - 4;
        break;
      }
      case 3: {
        // 雨伞（:50279-50312）：起手段（anim>0.666max ⟺ pAnim>0.666）itemLocation=-1000 不画
        if (pAnim > 0.666) { hide = true; break; }
        rot = 0.8;
        offX = fw * 0.5 - 4 - Math.max(pAnim * fw * 1.2 - 10, 8);
        offY = 24;
        // 946/4707 特判（Player.cs:50302-50305 itemLocation.X-=6*dir +
        // PlayerDrawLayers.cs:3314-3318 绘制位 Y-=22*gravDir、绘制角=-1.57*-direction）
        const vid3 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid3 === 946 || vid3 === 4707) { offX -= 6; offY -= 22; rot = 1.57; }
        break;
      }
      case 4: {
        // 举过头（:50313-50338）：rot=0；offX = fw/2-13（3601/5114/5120 再 -10）
        // offY = fh/2+4（5114 再 -2）——使用中身体行 2（双手举过头顶）
        const vid4 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        offX = fw * 0.5 - 13 - (vid4 === 3601 || vid4 === 5114 || vid4 === 5120 ? 10 : 0);
        offY = fh * 0.5 + 4 + (vid4 === 5114 ? -2 : 0);
        break;
      }
      case 5: {
        // 朝鼠标静持（:50339-50422 + :46708 itemRotation=瞄准角）：
        // 法杖族钉 MountedCenter+瞄准向量×6；默认 X=中心-2*dir、Y=中心-fh/2
        const vid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid === 3779) { offX = 6; offY = p.h * 0.5 + 6; rot = 0; }      // :50343（itemRotation=0）
        else if (vid === 4262) { offX = -6; offY = p.h * 0.5 - 6; rot = 0; } // :50349
        else if (vid >= 0 && STAFF_ITEMS.has(vid)) {
          // :50382-50383 itemLocation = MountedCenter + itemRotation 向量×6（3476 为 14）；
          // ★绘制角 = itemRotation + 0.785*direction（PlayerDrawLayers.cs:3370——法杖斜持
          // 45°，此前漏叠 → 34 件法杖全少转 45°）
          offX = Math.cos(aim) * 6;
          offY = p.h * 0.5 + Math.sin(aim) * 6;
          rot = aim + 0.785;
        } else {
          // 非法杖（枪/弓/悠悠球等）：X=中心-2*dir、Y=MountedCenter-fh/2（:50387），
          // 绘制角 = itemRotation（PlayerDrawLayers.cs:3444）
          offX = -2;
          offY = p.h * 0.5 - fh * 0.5;
          rot = aim;
          // ★握把 origin=(-num9,H/2)（PlayerDrawLayers.cs:3434-3443 + Main.cs:3305
          // DrawPlayerItemPos）：num9 默认 10、逐 id 修正；dir=-1 时原版取 (W+num9,H/2)，
          // 镜像空间等价 → 精灵左上角钉在握点 +（num9, dy）
          const dp = vid >= 0 ? ITEM_DRAW_POS[vid] ?? ITEM_DRAW_POS_DEF : ITEM_DRAW_POS_DEF;
          drawOX = dp[0]; drawOY = dp[1];
        }
        break;
      }
      case 6: {
        // 饮用旋转（:50158-50182，回归药水 2350/4870）：与 7 同构反向
        const n13 = Math.min((1 - pAnim) * 6, 1);
        rot = (1 - n13) * 2 - 1.4;
        if (n13 >= 0.5) { offX = fw * 0.5 - 9 - rot * 12; offY = 38 + rot * 4; }
        else { offX = fw * 0.5 - 9 - rot * 16; offY = 38 + rot; }
        break;
      }
      case 9: {
        // 举杯（:50127-50157，DefaultToHealingPotion/DefaultToFood gulp）：
        // t=clamp((1-pAnim)/0.7)；rot = -2t+0.7；
        // 持位 = GetFrontHandPosition(Full, num11-π/2) 再缩放 Lerp(1.5,1.2,t)+前移 Lerp(8,2,t)
        const t = Math.min(Math.max((1 - pAnim) / 0.7, 0), 1);
        rot = -2 * t + 0.7;
        const num11 = -(Math.PI * 2) / 5 * 0.5 + (1 - t) * ((Math.PI * 2) / 5) + Math.PI / 10;
        // GetFrontHandPosition(Full, num11-π/2)（:49887-49913，dir=1 展开）
        const hx = 10 * Math.cos(num11) - 4 - 3 * Math.sin(num11);
        const hy = 10 * Math.sin(num11) - 2 + 3 * Math.cos(num11);
        offX = hx + (8 + (2 - 8) * t);
        offY = p.h * 0.5 + hy;
        // ★轴心（PlayerDrawLayers.cs:3263-3275 useStyle 9）：origin = Size*(0.5,0.4)
        // （5009/5042/5645 为 (0.26,0.5)；朝左时原版取 X=1-X——镜像空间恒用 dir=1 值）
        const vid9 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid9 === 5009 || vid9 === 5042 || vid9 === 5645) { drawOX = -fw * 0.26; drawOY = -fh * 0.5; }
        else { drawOX = -fw * 0.5; drawOY = -fh * 0.4; }
        break;
      }
      case 13: {
        // 短剑突刺（:50423-50446）：复合手臂持位 GetFrontHandPosition(stretch, itemRotation-π/2)，
        // stretch 按 1-pAnim 档 Quarter(6)/ThreeQuarters(8)/Full(10)；绘制旋转 = itemRotation
        // （本地空间 = 方向化 aim，见函数头）
        const n24 = 1 - pAnim;
        const mult = n24 <= 0.33 ? 6 : n24 <= 0.66 ? 8 : 10;
        rot = aim;
        offX = mult * Math.cos(rot) - 4 - 3 * Math.sin(rot);
        offY = p.h * 0.5 + mult * Math.sin(rot) - 2 + 3 * Math.cos(rot);
        break;
      }
      case 14: {
        // 头侧持（:50604-50617，夜光 4952）：X=中心+6、Y=顶+32+头饰偏移；身体行不改
        offX = 6;
        offY = 32 + HEADGEAR_OFFSET_Y[2];
        break;
      }
      case 15: {
        // 头侧持（:50618-50628，占卜球 5644）：Y=顶+28+头饰偏移
        offX = 6;
        offY = 28 + HEADGEAR_OFFSET_Y[2];
        break;
      }
      case 16: {
        // 委托静持（:50629-50633，独角兽棒 856 = holdStyle 1 特例：X=中心+4、Y=顶+34）
        offX = 4;
        offY = 34;
        break;
      }
      default: {
        // 7/8/10/11/12 等未入表族回退 useStyle 1 挥砍（三段持位与 case 1 同款同步）
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        const seg = pAnim <= 1 / 3 ? swingTier(0) : pAnim < 2 / 3 ? swingTier(1) : swingTier(2);
        offX = seg.x; offY = seg.y;
        break;
      }
    }
    if (hide) return;
    ctx.save();
    ctx.translate(p.cx + p.facing * offX, p.y + offY);
    if (p.facing === -1) ctx.scale(-1, 1); // 镜像空间：旋转自动随镜像取反（与原版 -direction 因子等价）
    ctx.rotate(rot);
    if (ar) {
      // 默认 origin = (W*0.5 − W*0.5*dir, H)（PlayerDrawLayers.cs:3260）：
      // dir=1 → 底左角 / dir=−1 → 底右角钉在 itemLocation（握点）旋转——
      // 镜像空间里统一画在 (0,−fh) 即底左角=握点，镜像自动翻成底右角；
      // useStyle 5 非法杖（握把 (-num9,H/2)）与 9（Size*(0.5,0.4) 轴心）经 drawOX/drawOY 覆盖
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, drawOX, drawOY, ar.sw, ar.sh);
    } else if (icon) {
      ctx.drawImage(icon, drawOX, -14, 14, 14);
    }
    ctx.restore();
  }

  private runFramesCache: ReturnType<SpriteAtlas['animFrames']> | null = null;
  private actionFramesCache: Record<string, ReturnType<SpriteAtlas['rect']>> | null = null;

  /** Extra_48 表情总表（272×1092）懒加载——原版 TextureAssets.Extra[48] */
  private emoteSheetImg: HTMLImageElement | null = null;
  private emoteSheetFailed = false;
  private emoteSheet(): HTMLImageElement | null {
    if (this.emoteSheetFailed) return null; // 404 终态:不重发(2026-08-13 前无 onerror=坏图滞留永久)
    if (!this.emoteSheetImg) {
      const im = new Image();
      im.onload = () => { /* 就绪 */ };
      im.onerror = () => { this.emoteSheetFailed = true; this.emoteSheetImg = null; };
      im.src = 'sprites/vanilla/Extra_48.png';
      this.emoteSheetImg = im;
    }
    return this.emoteSheetImg;
  }

  /** 精灵底部透明留白行数（缓存）：用于脚底对齐 */
  private bottomPadCache = new Map<string, number>();

  /** 逐像素染色缓存（原版 XNA SpriteBatch 的 color 乘法等价实现）：
   *  ① multiply 把 RGB 乘上 color —— canvas multiply 会把精灵透明区也铺色（方形伪影）
   *  ② destination-in 重画精灵本体 → alpha 恢复为精灵轮廓，裁掉①的方形
   *  alpha 保持精灵原样（XNA 预乘混合的 RGB 贡献不随 color.A 缩减，见 drawEnemy color pass）
   *  （GetColor 二次绘制语义，Main.cs:24986 / NPC.cs:94903） */
  private tintCache = new Map<string, HTMLCanvasElement>();
  private tintedSprite(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }, color: number[],
  ): HTMLCanvasElement {
    const k = `${key}|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|${color.join(',')}`;
    let c = this.tintCache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(1, frame.sw);
    c.height = Math.max(1, frame.sh);
    const cx = c.getContext('2d')!;
    cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, c.width, c.height);
    // ① RGB 乘 color（multiply 的 alpha 取并集 → 透明区被铺色，下一步裁掉）
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    cx.fillRect(0, 0, c.width, c.height);
    // ② 用精灵本体当 destination-in 的源：alpha 恢复为轮廓形状
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'source-over';
    if (this.tintCache.size > 1024) this.tintCache.clear();
    this.tintCache.set(k, c);
    return c;
  }
  private spriteBottomPad(frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }, keyHint?: string): number {
    // keyHint：调用方已知的稳定标识（如 npc:帧号）。默认键只含类型+矩形，同尺寸
    // 不同精灵会碰撞（错值），且来源矩形不稳定时每帧未命中 → 逐帧 getImageData
    // 打满 CPU（trace2 实测 drawCritter 路径 100% 单核）
    const key = keyHint ?? `${frame.img instanceof HTMLCanvasElement ? 'c' : 'i'}:${frame.sx},${frame.sy},${frame.sw},${frame.sh}`;
    let pad = this.bottomPadCache.get(key);
    if (pad === undefined) {
      pad = 0;
      const c = document.createElement('canvas');
      c.width = frame.sw; c.height = frame.sh;
      const cx = c.getContext('2d')!;
      cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
      const d = cx.getImageData(0, 0, frame.sw, frame.sh).data;
      outer: for (let y = frame.sh - 1; y >= 0; y--) {
        for (let x = 0; x < frame.sw; x++) {
          if (d[(y * frame.sw + x) * 4 + 3] > 40) { pad = frame.sh - 1 - y; break outer; }
        }
      }
      this.bottomPadCache.set(key, pad);
    }
    return pad;
  }

  /** 全亮模式（F9）：跳过光照合成，画面无暗影 */
  fullbright = false;

  /**
   * 智能光标黄框（Main.cs:46016-46066 DrawSmartCursor 1:1）：
   * 目标格四象限各 8×8 块色 (1,0.9,0.1)×0.6 + 2px 外框十字 (1,0.95,0.3)，
   * 颜色乘该格光照（Lighting.GetColor）；有方向锁且下一格空 → 方向箭头
   * （SmartCursorArrow 贴图 8 帧；此处先用 canvas 三角形，沿方向 16/20px + 0.9s 正弦浮动）。
   */
  /** MoonLordShake 屏幕滤镜（Main.cs:64437-64447 + FilterMoonLordShake）：
   *  月总倒计时期间的红色震屏后处理。原版 shader 以激活点为靶心做径向扰动 + 红移，
   *  此处以靶心径向红晕近似；脉冲相位沿强度公式里的 sin(cd/60×0.5) 呼吸 */
  private drawMoonLordShake(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
    const m = this.moonLordShake;
    if (!m || m.t <= 0) return;
    const [sx, sy] = cam.worldToScreen(m.x, m.y);
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 90);
    const r = Math.max(viewW, viewH) * 0.75;
    const g = ctx.createRadialGradient(sx, sy, r * 0.12, sx, sy, r);
    g.addColorStop(0, 'rgba(255,32,32,0)');
    g.addColorStop(1, `rgba(190,10,10,${Math.min(0.7, 0.55 * m.t * pulse).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // ---- ScreenObstruction 遮屏（ScreenObstruction.cs 1:1，Obstructed buff 163 载体）----
  /** screenObstruction 当前黑幕强度（Update 的静态位；调试/探针可读） */
  screenObstruction = 0;
  private obstructionLastSpeed = 0.1;   // lastSpeed（:9）
  private obstructionTex: HTMLImageElement | null = null;

  /** Update（:12-41）+ Draw（:43-63）合并：headcovered（buff 163）→ 目标 0.95/步进
   *  0.3；解除后以 lastSpeed 回落。绘制 = 黑幕四象限围出玩家矩形孔（MagicPixel 四
   *  quad :57-60）+ Extra_49 洞沿羽化贴图（:61，100×100） */
  private updateAndDrawScreenObstruction(
    ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number, player: Player,
  ): void {
    const headcovered = player.buffs.obstructed;   // Player.cs:11421（buff 163 → headcovered）
    let target = 0;
    let amount = 0.1;
    if (headcovered) { target = 0.95; amount = 0.3; }   // :27-31
    if (target === 0 && this.screenObstruction !== 0) amount = this.obstructionLastSpeed;
    else this.obstructionLastSpeed = amount;            // :32-39
    // MoveTowards(amount/帧，60Hz 帧步进)
    const frames = 1;
    const step = amount * frames;
    if (this.screenObstruction < target) this.screenObstruction = Math.min(target, this.screenObstruction + step);
    else if (this.screenObstruction > target) this.screenObstruction = Math.max(target, this.screenObstruction - step);
    if (this.screenObstruction <= 0.001) return;
    // 玩家矩形孔（:50-52）：getRect 以 Extra_49 宽 100 为基准 Inflate，+10/2 竖偏
    const HOLE = 100, num2 = 10;
    const [px, py] = cam.worldToScreen(player.x, player.y);
    const rw = HOLE, rh = HOLE;   // Inflate 到 100×100（玩家 20×42 基准 + 均分补齐）
    const rect = {
      left: Math.round(px + player.w / 2 - rw / 2),
      top: Math.round(py + player.h / 2 - rh / 2 + num2 / 2 - num2),
      right: 0, bottom: 0,
    };
    rect.right = rect.left + rw;
    rect.bottom = rect.top + rh;
    const a = Math.min(0.95, this.screenObstruction);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, viewW, Math.max(0, rect.top));                                   // 上
    ctx.fillRect(rect.right, 0, Math.max(0, viewW - rect.right), viewH);                // 右
    ctx.fillRect(0, rect.bottom, viewW, Math.max(0, viewH - rect.bottom));              // 下
    ctx.fillRect(0, 0, Math.max(0, rect.left), viewH);                                  // 左
    if (!this.obstructionTex) {
      const im = new Image();
      im.src = 'sprites/vanilla/Extra_49.png';
      this.obstructionTex = im;
    }
    const tex = this.obstructionTex;
    if (tex && tex.complete && tex.naturalWidth > 0) {
      ctx.globalAlpha = a;
      ctx.drawImage(tex, rect.left, rect.top, rw, rh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawSmartCursor(
    ctx: CanvasRenderingContext2D, cam: Camera, hover: HoverTarget, viewH: number, z: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    void viewH;
    const ts = TILE * z;                       // 屏幕空间下的格尺寸
    const [sx, sy] = cam.worldToScreen(hover.x * TILE, hover.y * TILE);
    // 光照采样（越界/区域外按全亮，防洞穴边缘框消失）
    let lr = 255, lg = 255, lb = 255;
    if (hover.x >= rx && hover.y >= ry && hover.x < rx + rw && hover.y < ry + rh) {
      const li = (hover.y - ry) * rw + (hover.x - rx);
      lr = lightR[li]; lg = lightG[li]; lb = lightB[li];
    }
    const mul = (c: number, l: number): number => Math.round((c * l) / 255);
    // 四象限 8×8 块 (1,0.9,0.1) × 0.6
    ctx.fillStyle = `rgba(${mul(255, lr)},${mul(229, lg)},${mul(26, lb)},0.6)`;
    const q = ts / 2;
    ctx.fillRect(sx, sy, q, q);
    ctx.fillRect(sx + q, sy, q, q);
    ctx.fillRect(sx, sy + q, q, q);
    ctx.fillRect(sx + q, sy + q, q, q);
    // 2px 外框十字 (1,0.95,0.3)
    ctx.fillStyle = `rgb(${mul(255, lr)},${mul(242, lg)},${mul(77, lb)})`;
    const bw = 2 * z;
    ctx.fillRect(sx - bw, sy, bw, ts);
    ctx.fillRect(sx + ts, sy, bw, ts);
    ctx.fillRect(sx, sy - bw, ts, bw);
    ctx.fillRect(sx, sy + ts, ts, bw);
    // 方向锁箭头（Main.cs:46055-46065）
    const arrow = hover.arrow;
    if (arrow) {
      const idx = SMART_CURSOR_DIRECTION_LOCKS.findIndex(([ax, ay]) => ax === arrow.x && ay === arrow.y);
      if (idx >= 0) {
        const diagonal = idx % 2 === 1;
        const phase = (performance.now() / 1000 / 0.9) % 1;
        const bob = 2 - 2 * Math.sin(phase * Math.PI); // 0→2→0
        const cxp = sx + ts / 2 + arrow.x * (diagonal ? 16 : 20) * z + arrow.x * bob * z;
        const cyp = sy + ts / 2 + arrow.y * (diagonal ? 16 : 20) * z + arrow.y * bob * z;
        ctx.save();
        ctx.translate(cxp, cyp);
        ctx.rotate((idx * Math.PI) / 4); // SmartCursorDirectionLocks 上起顺时针（Main.cs:66188）
        ctx.fillStyle = `rgb(${mul(255, lr)},${mul(242, lg)},${mul(77, lb)})`;
        const r = 5 * z;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.7, r);
        ctx.lineTo(-r * 0.7, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private compositeLight(
    cam: Camera, viewW: number, viewH: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    if (this.fullbright) return; // 开灯：不做 multiply，全部原色
    const z = cam.zoom;
    const ts = TILE;
    const tilesX = Math.ceil(viewW / z / ts) + 2;
    const tilesY = Math.ceil(viewH / z / ts) + 2;
    const tx0 = Math.floor((cam.x - viewW / 2 / z) / ts);
    const ty0 = Math.floor((cam.y - viewH / 2 / z) / ts);
    // 2× 超采样：光照图每半格一个采样点，tile 中心间双线性插值，
    // 光斑梯度曲率更细腻（每格一采样时火把光斑有明显的马赛克棱面感）
    const SS = 2;
    const w2 = tilesX * SS, h2 = tilesY * SS;
    if (this.lightCanvas.width !== w2 || this.lightCanvas.height !== h2) {
      this.lightCanvas.width = w2;
      this.lightCanvas.height = h2;
    }
    const lc = this.lightCtx;
    // ImageData 复用(尺寸不变时)——此前每帧 createImageData ≈87KB 分配
    if (!this._lightImg || this._lightImg.width !== w2 || this._lightImg.height !== h2) {
      this._lightImg = lc.createImageData(w2, h2);
    }
    const img = this._lightImg;
    // 4 tap 双线性。此前 tap 每像素返回 4 个 [r,g,b] 元组 ≈ 5.3M 小对象/s
    // (2026-08 审计 G2);现采样写入模块级标量缓冲,运算顺序不变、结果逐位一致
    const tapBuf = _lightTap;
    for (let py = 0; py < h2; py++) {
      const gy = py / SS - 0.5;              // 亚格坐标（tile 中心在整数处）
      const y0 = Math.floor(gy), fy = gy - y0;
      const wy0 = 1 - fy, wy1 = fy;
      for (let px = 0; px < w2; px++) {
        const gx = px / SS - 0.5;
        const x0 = Math.floor(gx), fx = gx - x0;
        const wx0 = 1 - fx, wx1 = fx;
        const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
        // 4 tap:每 tap 3 通道写 tapBuf[k..k+2],区域外 0(由环境光下限兜底)
        for (let t = 0; t < 4; t++) {
          const sx = x0 + (t & 1), sy = y0 + (t >> 1);
          const tx = tx0 + sx, ty = ty0 + sy;
          const k = t * 3;
          if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) {
            const li = (ty - ry) * rw + (tx - rx);
            tapBuf[k] = lightR[li]; tapBuf[k + 1] = lightG[li]; tapBuf[k + 2] = lightB[li];
          } else {
            tapBuf[k] = 0; tapBuf[k + 1] = 0; tapBuf[k + 2] = 0;
          }
        }
        let r = tapBuf[0] * w00 + tapBuf[3] * w10 + tapBuf[6] * w01 + tapBuf[9] * w11;
        let g = tapBuf[1] * w00 + tapBuf[4] * w10 + tapBuf[7] * w01 + tapBuf[10] * w11;
        let b2 = tapBuf[2] * w00 + tapBuf[5] * w10 + tapBuf[8] * w01 + tapBuf[11] * w11;
        // 原版语义:无 gamma LUT、无环境光下限(原版光照输出直乘;
        // 夜晚亮度由天空种子+月相地板决定,洞穴真黑)
        const i = (py * w2 + px) * 4;
        img.data[i] = Math.min(255, Math.round(r));
        img.data[i + 1] = Math.min(255, Math.round(g));
        img.data[i + 2] = Math.min(255, Math.round(b2));
        img.data[i + 3] = 255;
      }
    }
    lc.putImageData(img, 0, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    const [sx, sy] = cam.worldToScreen(tx0 * ts, ty0 * ts);
    ctx.drawImage(this.lightCanvas, sx, sy, tilesX * ts * z, tilesY * ts * z);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 原版小地图框（MinimapFrame/MinimapFrameManager 1:1，9 皮肤） ----
  // DrawBackground: MinimapPosition-6 处 244×244 黑底（不随皮肤变）；DrawForeground: 整张
  // 框贴图（尺寸随皮肤 252×256..272×270）画在 MinimapPosition+frameOffset；按钮(18×18)
  // 仅悬停时显示（IsHighlighted）。皮肤=客户端选项 config.json "MinimapFrame"（:11-19），
  // 9 款皮肤零代码分支差异，只有 frameOffset + 按钮位（MinimapFrameManager.cs:32-42）。
  /** 皮肤元数据（frameOffset=框贴图左上相对 MinimapPosition 偏移；按钮位相对 FramePosition） */
  private static readonly MINIMAP_SKINS: Record<string, { fo: readonly [number, number]; reset: readonly [number, number]; zoomIn: readonly [number, number]; zoomOut: readonly [number, number] }> = {
    Default:  { fo: [-8, -15],  reset: [150, 240], zoomIn: [202, 240], zoomOut: [176, 240] },
    Golden:   { fo: [-10, -10], reset: [136, 248], zoomIn: [96, 248],  zoomOut: [116, 248] },
    Remix:    { fo: [-10, -10], reset: [200, 234], zoomIn: [148, 234], zoomOut: [174, 234] },
    Sticks:   { fo: [-10, -10], reset: [148, 234], zoomIn: [200, 234], zoomOut: [174, 234] },
    StoneGold:{ fo: [-15, -15], reset: [220, 244], zoomIn: [244, 188], zoomOut: [244, 216] },
    TwigLeaf: { fo: [-20, -20], reset: [206, 242], zoomIn: [162, 242], zoomOut: [184, 242] },
    Leaf:     { fo: [-20, -20], reset: [212, 244], zoomIn: [168, 246], zoomOut: [190, 246] },
    Retro:    { fo: [-10, -10], reset: [150, 236], zoomIn: [202, 236], zoomOut: [176, 236] },
    Valkyrie: { fo: [-10, -10], reset: [154, 242], zoomIn: [206, 240], zoomOut: [180, 244] },
  };
  /** 选中皮肤的 4 张贴图（懒加载缓存，切皮肤自动换批） */
  private minimapSkinTex = new Map<string, { frame: HTMLImageElement; reset: HTMLImageElement; zoomIn: HTMLImageElement; zoomOut: HTMLImageElement }>();
  private minimapSkinAssets(): { skin: typeof Renderer.MINIMAP_SKINS[string]; tex: { frame: HTMLImageElement; reset: HTMLImageElement; zoomIn: HTMLImageElement; zoomOut: HTMLImageElement } } {
    const name = Renderer.MINIMAP_SKINS[options.data.minimapFrame] ? options.data.minimapFrame : 'Default';
    let tex = this.minimapSkinTex.get(name);
    if (!tex) {
      tex = {
        frame: this.loadUiTex(`UI_Minimap_${name}_MinimapFrame`),
        reset: this.loadUiTex(`UI_Minimap_${name}_MinimapButton_Reset`),
        zoomIn: this.loadUiTex(`UI_Minimap_${name}_MinimapButton_ZoomIn`),
        zoomOut: this.loadUiTex(`UI_Minimap_${name}_MinimapButton_ZoomOut`),
      };
      this.minimapSkinTex.set(name, tex);
    }
    return { skin: Renderer.MINIMAP_SKINS[name], tex };
  }
  /** 小地图缩放（原版 mapMinimapScale，默认 1.05；钳 0.2..3，Main.cs:54953-54959） */
  minimapZoom = 1.05;
  /** 本帧鼠标悬停在小地图框按钮上（Game 据此拦下"点地图开全屏"）——原版 mouseInterface 语义 */
  minimapUiHover = false;
  /** 时间调整面板开关（时间文本旁 ± 按钮切换） */
  timePanelOpen = false;
  /** 天气面板开合 + 命中上报（同 timeUiHover 模式，Game 吞点击用） */
  weatherPanelOpen = false;
  weatherUiHover = false;
  /** 天气预设回调（Game.applyWeatherPreset 注入；name = clear/cloudy/.../random） */
  weatherPreset: ((name: string) => void) | null = null;
  /** 本帧指针位于时间按钮/面板上（渲染期写入、下帧 Game 消费：吞掉挖掘/放置/攻击点击） */
  timeUiHover = false;
  /** UI 点击边沿检测（render 存 _mouseDown，drawMinimap 末尾更新） */
  private _uiPrevMouseDown = false;

  private loadUiTex(name: string): HTMLImageElement {
    const img = new Image();
    img.src = `sprites/vanilla-ui/${name}.png`;
    return img;
  }

  /** 洞穴探险/危险感/狩猎/群系视觉 tile 高亮集（TILE_DEFS key 启发式，模块级缓存） */
  private static HIGHLIGHT_SETS = (() => {
    const spelunker = new Set<number>(), danger = new Set<number>(), biome = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const k = TILE_DEFS[i]?.key ?? '';
      if (/ore_|gem|fossil|v_\d+_.*gem|crystal/i.test(k)) spelunker.add(i);
      if (/spike|dart_trap|boulder|landmine|geyser|flame_trap|v_21[3-9]|v_137|v_138|v_139|v_140/i.test(k)) danger.add(i);
      if (/corrupt|crimson|ebon|crims|hallow|pearl/i.test(k)) biome.add(i);
    }
    return { spelunker, danger, biome };
  })();

  /** R3 视觉 Buff 高亮叠层：Spelunker(9)/Dangersense(111)/Hunter(17)/BiomeSight(343) */
  private drawBuffHighlights(
    ctx: CanvasRenderingContext2D, world: World, player: Player,
    cam: Camera, viewW: number, viewH: number, z: number, ts: number,
  ) {
    const buffs = player.buffs;
    const spel = buffs.has(BuffType.Spelunker);
    const dang = buffs.has(BuffType.Dangersense);
    const biomeS = buffs.has(BuffType.BiomeSight);
    if (!spel && !dang && !biomeS) return;
    const st = world.store;
    const pulse = 0.22 + 0.14 * Math.sin(performance.now() / 180);
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts) - 1);
    const tx1 = Math.min(st.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts) - 1);
    const ty1 = Math.min(st.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts) + 1);
    ctx.globalAlpha = pulse;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (spel && Renderer.HIGHLIGHT_SETS.spelunker.has(t)) {
          ctx.fillStyle = '#FFC419';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        } else if (dang && Renderer.HIGHLIGHT_SETS.danger.has(t)) {
          ctx.fillStyle = '#FF4040';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        } else if (biomeS && Renderer.HIGHLIGHT_SETS.biome.has(t)) {
          ctx.fillStyle = '#C060FF';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player, clock: Clock, entities: Entity[] = []) {
    if (!this.minimap) return;
    this.minimap.flushDirty();
    // 移动端整体缩小（右锚缩放变换：小地图+框+按钮+时间文字同尺度；
    // 桌面 uiS=1 → 与原实现逐像素一致）
    const uiS = mobileUiScale();
    ctx.save();
    if (uiS !== 1) {
      ctx.translate(ctx.canvas.width, 0);
      ctx.scale(uiS, uiS);
      ctx.translate(-ctx.canvas.width, 0);
    }
    // 屏幕鼠标 → 本变换局部坐标（右锚缩放逆变换；uiS=1 恒等——桌面零影响）
    const lmX = (sx: number) => (uiS === 1 ? sx : ctx.canvas.width - (ctx.canvas.width - sx) / uiS);
    const lmY = (sy: number) => (uiS === 1 ? sy : sy / uiS);
    const size = 240;                 // 放大
    // 原版锚点（Main.cs:54696-54706 UpdateMinimapAnchors + 54944-54949，MapScale=1）：
    // miniMapX = screenWidth - (52+240) = 屏宽-292，miniMapY = 90
    // —— 让位右上角生命/魔力资源条（心行 y≤80、星列 x≈屏宽-25）
    const ox = ctx.canvas.width - size - 52, oy = 90;
    // 原版取景：num14/15 = miniMapWidth/scale —— 正方形窗口（此前按世界纵横比压扁，非原版）
    const viewTiles = Math.max(40, Math.round(size / this.minimapZoom));
    const px = player.cx / TILE, py = player.cy / TILE;
    const sx = Math.max(0, Math.min(world.w - viewTiles, Math.floor(px - viewTiles / 2)));
    const sy = Math.max(0, Math.min(world.h - viewTiles, Math.floor(py - viewTiles / 2)));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 框底黑垫（MinimapFrame.DrawBackground：MinimapPosition=(ox+4,oy+4)，-6 → 244×244 黑 * mapMinimapAlpha）
    ctx.fillStyle = '#000';
    ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    // 地图内容（alpha=mapMinimapAlpha=1）
    ctx.drawImage(this.minimap.canvas, sx, sy, viewTiles, viewTiles, ox, oy, size, size);
    // 迷雾（缩略图 1 tile = size/viewTiles px；世界→屏幕偏移）
    this.drawFog(ctx, world,
      ox - sx * size / viewTiles, oy - sy * size / viewTiles,
      size / viewTiles, 2 * size / viewTiles,
      { x: ox, y: oy, w: size, h: size });
    // 头像层(原版 mapStyle1 支 :55140 + DrawNPCMapIcons2 :55602):玩家头/城镇 NPC 头/
    // Boss 头;headScale=min(1,(minimapZoom×0.5+1)/3)×UIScale(mapMinimapScale=1.05 :890;
    // 原写死 0.47 不随缩放且漏 UIScale≈1.1)。裁剪到小地图框内——窗口外实体头像不外溢
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, size, size);
    ctx.clip();
    this.drawMapHeads(ctx, player, Math.min(1, (this.minimapZoom * 0.25 * 2 + 1) / 3) * 1.1,
      (wx) => ox + (wx / TILE - sx) / viewTiles * size,
      (wy) => oy + (wy / TILE - sy) / viewTiles * size,
      entities.filter((e) => e instanceof TownNPC) as TownNPC[],
      entities.filter((e) => e instanceof Enemy) as Enemy[]);
    ctx.restore();
    // 框前景（MinimapFrame.DrawForeground：FramePosition = MinimapPosition + frameOffset——随皮肤）
    const { skin, tex } = this.minimapSkinAssets();
    const fx = ox + 4 + skin.fo[0], fy = oy + 4 + skin.fo[1];
    if (tex.frame.complete) ctx.drawImage(tex.frame, fx, fy);
    // 按钮：悬停高亮 + 按住生效（MinimapFrame.Update/Click：mouseLeft 持续，×1.025/0.975 步进）
    this.minimapUiHover = false;
    const btns: Array<[HTMLImageElement, readonly [number, number], 'in' | 'out' | 'reset']> = [
      [tex.zoomIn, skin.zoomIn, 'in'],
      [tex.zoomOut, skin.zoomOut, 'out'],
      [tex.reset, skin.reset, 'reset'],
    ];
    for (const [tex, [bx, by], kind] of btns) {
      const cx = fx + bx + 9, cy = fy + by + 9; // 中心；命中盒 22×22（IsTouchingPoint 取 max(size,22)）
      const hovering = Math.abs(lmX(this._mouseX) - cx) < 11 && Math.abs(lmY(this._mouseY) - cy) < 11;
      if (!hovering || !tex.complete) continue;
      this.minimapUiHover = true;
      ctx.drawImage(tex, fx + bx, fy + by);
      if (this._mouseDown) {
        if (kind === 'in') this.minimapZoom = Math.min(3, this.minimapZoom * 1.025);
        else if (kind === 'out') this.minimapZoom = Math.max(0.2, this.minimapZoom * 0.975);
        else this.minimapZoom = 1.05;
      }
    }
    // 记录小地图区域供点击检测（黑垫外沿）
    this.minimapRect = {
      x: uiS === 1 ? ox - 2 : ctx.canvas.width - (ctx.canvas.width - (ox - 2)) * uiS,
      y: uiS === 1 ? oy - 2 : (oy - 2) * uiS,
      w: (size + 4) * uiS, h: (size + 4) * uiS,
    };
    // 时间/天气显示【门禁化 2026-08-13】:原版语义 = InfoAccs 列(DrawInfoAccs),
    // 无表(accWatch)/无天气电台(accWeatherRadio)不显示——此前常显文本退役;
    // 完整 12 行信息列由 render/InfoAccsLayer 在 minimap 之后绘制(右侧列)。
    const gates = player.equipStats.infoAccs;
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    if (gates.accWatch > 0) {
      const hFloat = clock.hourFloat;
      const hh = String(Math.floor(hFloat)).padStart(2, '0');
      const mm2 = String(Math.floor((hFloat % 1) * 60)).padStart(2, '0');
      const timeText = `时间 ${hh}:${mm2}`;
      ctx.strokeText(timeText, ox + size / 2, oy + 253 + 14);
      ctx.fillText(timeText, ox + size / 2, oy + 253 + 14);
    }
    if (world.weather && gates.accWeatherRadio) {
      const ZH: Record<string, string> = {
        SlimeRain: '\u53f2\u83b1\u59c6\u96e8', Storm: '\u98ce\u66b4', HeavyRain: '\u5927\u96e8', Rain: '\u96e8', LightRain: '\u5c0f\u96e8',
        Overcast: '\u9634\u5929', MostlyCloudy: '\u591a\u4e91', Cloudy: '\u5c11\u4e91', Clear: '\u6674\u6717', PartlyCloudy: '\u5c40\u90e8\u591a\u4e91',
      };
      const w = world.weather;
      let wt = ZH[w.statusText()] ?? '';
      const wind = Math.round(w.windSpeedCurrent * 50);
      if (wind !== 0) wt += ` ${wind > 0 ? '\u897f\u98ce' : '\u4e1c\u98ce'}${Math.abs(wind)}`;
      const sand = w.sandstorm.happening ? (Math.floor(performance.now() / 500) % 2 === 0 ? ' +\u6c99\u5c18\u66b4' : ' +') : '';
      ctx.font = 'bold 12px sans-serif';
      const wtText = wt + sand;
      ctx.strokeText(wtText, ox + size / 2, oy + 253 + 32);
      ctx.fillText(wtText, ox + size / 2, oy + 253 + 32);
    }

    // ---- \u65f6\u95f4\u8c03\u6574\u6309\u94ae + \u9762\u677f\uff08\u00b1 \u5207\u6362\uff1b\u547d\u4e2d\u533a\u6574\u4f53\u4e0a\u62a5 timeUiHover \u4f9b Game \u541e\u70b9\u51fb\uff09 ----
    const mx = lmX(this._mouseX), my = lmY(this._mouseY);
    const clicked = this._mouseDown && !this._uiPrevMouseDown; // \u6309\u4e0b\u8fb9\u6cbf\uff08\u4e0e\u7f29\u653e\u6309\u94ae\u7684\u6301\u7eed\u6309\u4f4f\u533a\u5206\uff09
    const hit = (x: number, y: number, w: number, h: number) =>
      mx >= x && mx <= x + w && my >= y && my <= y + h;
    const btnX = ox + size - 22, btnY = oy + 252, btnS = 20;
    const btnHover = hit(btnX, btnY, btnS, btnS);
    this.timeUiHover = btnHover || (this.timePanelOpen && hit(ox, oy + 276, size, 64));
    ctx.fillStyle = btnHover ? 'rgba(90,110,180,0.95)' : 'rgba(20,26,60,0.85)';
    ctx.fillRect(btnX, btnY, btnS, btnS);
    ctx.strokeStyle = btnHover ? '#ffd76e' : '#4a5aa0';
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnS - 1, btnS - 1);
    ctx.fillStyle = '#e8e8f4';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('\u00b1', btnX + btnS / 2, btnY + 15);
    if (clicked && btnHover) this.timePanelOpen = !this.timePanelOpen;
    if (this.timePanelOpen) {
      const px = ox, py = oy + 276, pw = size, ph = 64;
      ctx.fillStyle = 'rgba(8,10,26,0.92)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#4a5aa0';
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      // \u5c0f\u6309\u94ae\u76d2\uff1a\u60ac\u505c\u9ad8\u4eae + \u70b9\u51fb\u52a8\u4f5c
      const box = (x: number, y: number, w: number, h: number, label: string, act: () => void) => {
        const hov = hit(x, y, w, h);
        ctx.fillStyle = hov ? '#3a4680' : '#232c52';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = hov ? '#ffd76e' : '#3a4680';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#e8e8f4';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, x + w / 2, y + h / 2 + 4);
        if (clicked && hov) act();
      };
      const setT = (t: number) => { clock.timeOfDay = ((t % 1) + 1) % 1; };
      box(px + 8, py + 8, 76, 22, '\u2212 1 \u5c0f\u65f6', () => setT(clock.timeOfDay - 1 / 24));
      ctx.fillStyle = '#9aa2cc';
      ctx.font = '12px sans-serif';
      ctx.fillText(`\u7b2c ${clock.dayCount} \u5929`, px + pw / 2, py + 23);
      box(px + pw - 84, py + 8, 76, 22, '+ 1 \u5c0f\u65f6', () => setT(clock.timeOfDay + 1 / 24));
      // \u5feb\u6377\u9884\u8bbe\uff08clock \u8bed\u4e49\uff1a0=\u5348\u591c 0.25=06:00 0.5=\u6b63\u5348 0.75=18:00\uff09
      const presets: Array<[string, number]> = [['\u6e05\u6668', 0.27], ['\u6b63\u5348', 0.5], ['\u9ec4\u660f', 0.73], ['\u5348\u591c', 0.0]];
      presets.forEach(([label, t], i) => {
        box(px + 10 + i * 56, py + 38, 52, 20, label, () => setT(t));
      });
    }

    // ---- 天气调整按钮 + 面板（同时间按钮模式；预设回调由 Game 注入 weatherPreset） ----
    const wBtnX = ox + size - 46, wBtnY = oy + 252;
    const wBtnHover = hit(wBtnX, wBtnY, btnS, btnS);
    const wPanelY = oy + 276 + (this.timePanelOpen ? 72 : 0);
    const wPanelH = 112;
    this.weatherUiHover = wBtnHover || (this.weatherPanelOpen && hit(ox, wPanelY, size, wPanelH));
    ctx.fillStyle = wBtnHover ? 'rgba(90,110,180,0.95)' : 'rgba(20,26,60,0.85)';
    ctx.fillRect(wBtnX, wBtnY, btnS, btnS);
    ctx.strokeStyle = wBtnHover ? '#ffd76e' : '#4a5aa0';
    ctx.strokeRect(wBtnX + 0.5, wBtnY + 0.5, btnS - 1, btnS - 1);
    ctx.fillStyle = '#e8e8f4';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('⛅', wBtnX + btnS / 2, wBtnY + 15);
    if (clicked && wBtnHover) this.weatherPanelOpen = !this.weatherPanelOpen;
    if (this.weatherPanelOpen) {
      const px2 = ox, py2 = wPanelY, pw2 = size;
      ctx.fillStyle = 'rgba(8,10,26,0.92)';
      ctx.fillRect(px2, py2, pw2, wPanelH);
      ctx.strokeStyle = '#4a5aa0';
      ctx.strokeRect(px2 + 0.5, py2 + 0.5, pw2 - 1, wPanelH - 1);
      const box2 = (x: number, y: number, w2: number, h2: number, label: string, act: () => void) => {
        const hov = hit(x, y, w2, h2);
        ctx.fillStyle = hov ? '#3a4680' : '#232c52';
        ctx.fillRect(x, y, w2, h2);
        ctx.strokeStyle = hov ? '#ffd76e' : '#3a4680';
        ctx.strokeRect(x + 0.5, y + 0.5, w2 - 1, h2 - 1);
        ctx.fillStyle = '#e8e8f4';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, x + w2 / 2, y + h2 / 2 + 4);
        if (clicked && hov) act();
      };
      const presetsW: Array<[string, string]> = [
        ['晴朗', 'clear'], ['多云', 'cloudy'], ['小雨', 'lightrain'], ['大雨', 'heavyrain'],
        ['风暴', 'storm'], ['沙尘暴', 'sandstorm'], ['史莱姆雨', 'slimerain'], ['随机', 'random'],
      ];
      presetsW.forEach(([label, name], i) => {
        const col = i % 4, row = Math.floor(i / 4);
        box2(px2 + 10 + col * 56, py2 + 10 + row * 26, 52, 22, label, () => this.weatherPreset?.(name));
      });
      // 风力调节（±0.2，钳 ±0.8）
      const wd = world.weather;
      if (wd) {
        box2(px2 + 10, py2 + 64, 100, 20, `风 ${Math.round(wd.windSpeedTarget * 100) / 100}`, () => {});
        box2(px2 + 8, py2 + 88, 52, 18, '− 风', () => { wd.windSpeedTarget = Math.max(-0.8, wd.windSpeedTarget - 0.2); });
        box2(px2 + pw2 - 60, py2 + 88, 52, 18, '+ 风', () => { wd.windSpeedTarget = Math.min(0.8, wd.windSpeedTarget + 0.2); });
      }
    }
    this._uiPrevMouseDown = this._mouseDown;
    ctx.restore();
    ctx.restore(); // 移动端缩放变换（uiS=1 时为空 save/restore，恒等）
  }

  /** 迷雾遮罩：未探索区域黑色覆盖（世界坐标 → 目标矩形） */
  // 迷雾缓存：探索版本号变化时才重绘半分辨率画布（避免每帧百万格循环卡顿）。
  // 增量更新（2026-08-10，修 wld 导入白屏崩溃）：markExplored 只 bump 真正点亮新格的
  // 版本并给出脏包围盒 → 此处仅对脏区（雾坐标 ~14×14 块）putImageData。
  // 旧版每 15 tick 无条件整幅重建 4200×1200（20MB createImageData + 500 万格循环 ≈
  // 672ms 长任务），首次导入大世界时每秒 4 次 × 20MB 垃圾 → GC 风暴 → 白屏闪烁 + OOM
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogVersion = -1;
  private fogWorld: World | null = null;

  private getFogCanvas(world: World): HTMLCanvasElement | null {
    const ex = world.explored;
    if (!ex) return null;
    // 世界实例切换（读档/导入另一世界）：版本号数值可能巧合相等，必须按实例强制重建
    if (this.fogWorld !== world) { this.fogWorld = world; this.fogVersion = -1; }
    if (this.fogCanvas && this.fogVersion === world.exploredVersion) return this.fogCanvas;
    const st = world.store;
    const w = Math.ceil(st.w / 2), h = Math.ceil(st.h / 2);
    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = w;
      this.fogCanvas.height = h;
    }
    const fc = this.fogCanvas.getContext('2d')!;
    // 脏矩形增量：有画布 + 有脏包围盒（markExplored 记录）→ 只更新受影响块；
    // 全图点亮（F4/devMode 手动 bump，无脏信息）或首帧 → 整幅重建
    const dirty = world.exploredDirty;
    if (this.fogVersion !== -1 && dirty) {
      const bx0 = Math.max(0, dirty.x0 >> 1), by0 = Math.max(0, dirty.y0 >> 1);
      const bx1 = Math.min(w - 1, dirty.x1 >> 1), by1 = Math.min(h - 1, dirty.y1 >> 1);
      const dw = bx1 - bx0 + 1, dh = by1 - by0 + 1;
      if (dw > 0 && dh > 0) {
        const img = fc.createImageData(dw, dh);
        for (let by = 0; by < dh; by++) {
          for (let bx = 0; bx < dw; bx++) {
            const x0 = (bx0 + bx) * 2, y0 = (by0 + by) * 2;
            let seen = false;
            for (let dy = 0; dy < 2 && !seen; dy++) for (let dx = 0; dx < 2; dx++) {
              const xx = x0 + dx, yy = y0 + dy;
              if (xx < st.w && yy < st.h && ex[yy * st.w + xx]) { seen = true; break; }
            }
            if (!seen) {
              const i = (by * dw + bx) * 4;
              img.data[i] = 5; img.data[i + 1] = 5; img.data[i + 2] = 8; img.data[i + 3] = 255;
            }
          }
        }
        fc.putImageData(img, bx0, by0);
        this.fogVersion = world.exploredVersion;
        return this.fogCanvas;
      }
    }
    // 整幅重建（首帧 / 全图点亮 / 版本跳跃无脏信息）
    if (this.fogCanvas.width !== w || this.fogCanvas.height !== h) {
      this.fogCanvas.width = w; this.fogCanvas.height = h;
    }
    fc.clearRect(0, 0, w, h);
    fc.fillStyle = '#050508';
    const img = fc.createImageData(w, h);
    for (let by = 0; by < h; by++) {
      for (let bx = 0; bx < w; bx++) {
        const x0 = bx * 2, y0 = by * 2;
        let seen = false;
        for (let dy = 0; dy < 2 && !seen; dy++) for (let dx = 0; dx < 2; dx++) {
          const xx = x0 + dx, yy = y0 + dy;
          if (xx < st.w && yy < st.h && ex[yy * st.w + xx]) { seen = true; break; }
        }
        if (!seen) {
          const i = (by * w + bx) * 4;
          img.data[i] = 5; img.data[i + 1] = 5; img.data[i + 2] = 8; img.data[i + 3] = 255;
        }
      }
    }
    fc.putImageData(img, 0, 0);
    this.fogVersion = world.exploredVersion;
    return this.fogCanvas;
  }

  private drawFog(ctx: CanvasRenderingContext2D, world: World, ox: number, oy: number, scale: number, blockPx: number, clip?: { x: number; y: number; w: number; h: number }) {
    const fc = this.getFogCanvas(world);
    if (!fc) return;
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
    }
    void blockPx;
    // 缓存画布 1 像素 = 2 tile；目标绘制按 scale×2 缩放
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fc, 0, 0, fc.width, fc.height, ox, oy, fc.width * 2 * scale, fc.height * 2 * scale);
    ctx.restore();
  }

  /** 地图玩家标记：优先 Maples 主角帧（与游戏内形象一致），程序化仅兜底 */


  /** 地图头像层(原版 Main.DrawMap 的 DrawNPCMapIcons3/2 :55546+/:55602+ +
   *  MapPlayerRenderer.DrawPlayerHead :55158+):小地图与全屏地图共用。
   *  - 玩家头:纸娃娃 0 帧顶部裁头(原版画的是角色头层含发型/头盔,MapPlayerRenderer)
   *  - 城镇 NPC 头:NPC_Head_{TOWN_NPC_HEAD_INDEX},恒显(CanBeSeen_Townie=true :55756),
   *    朝向翻转(direction>0 → FlipHorizontally :55555)
   *  - Boss 头:NPC_Head_Boss_{BOSS_HEAD_INDEX},68/262 带 rotation(GetBossHeadRotation);
   *    世吞 134 的多段质心平均(:55575-55589)未接,画头段位置
   *  headScale:原版 = min(1,(scale×0.2×2+1)/3)(小地图 :55059)/ min(1,(scale×0.5+1)/3)
   *  (全屏 :55140) ×UIScale;头贴图原生 24×22。mapX/mapY = 世界 px → 本图 px。
   *  alpha 恒 1(原版 b=mapMinimapAlpha=255);迷雾不遮头像(townie 门恒真)。 */
  private drawMapHeads(
    ctx: CanvasRenderingContext2D, player: Player,
    headScale: number,
    mapX: (wx: number) => number, mapY: (wy: number) => number,
    npcs: TownNPC[], enemies: Enemy[],
  ) {
    if (!this.atlas) return;
    const drawHead = (img: CanvasImageSource | null, wx: number, wy: number,
      flip: boolean, rotation = 0, extra = 0, sw = 24, sh = 22) => {
      if (!img) return;
      const x = mapX(wx), y = mapY(wy);
      ctx.save();
      ctx.translate(x, y);
      if (rotation) ctx.rotate(rotation);
      ctx.scale(headScale, headScale);
      if (flip) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      // 黑描边(原版 OutlinedTextureRenderer 近似:四向偏移暗影)
      if (extra) {
        ctx.globalAlpha = 0.35;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.drawImage(img as CanvasImageSource, 0, 0, sw, sh, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(img as CanvasImageSource, 0, 0, sw, sh, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    };
    // 玩家头(原版 PlayerHeadDrawRenderTargetContent:发型/头盔全层的组合头,中心锚)。
    // 纸娃娃帧 0 顶部 40×32 裁头带(整宽+发冠带,24×22 会削发型——用户报"绘制不完整");
    // 无外观回退头贴图 0
    if (player.appearance) {
      const doll = compositePaperDoll(player.appearance, dollEquipFromInv(player.inv, this.atlas) as never);
      if (doll) drawHead(doll as unknown as HTMLCanvasElement, player.cx, player.cy, player.facing < 0, 0, 1, 40, 32);
      else return; // 纸娃娃未就绪:头像层整体等下一帧(原版头层贴图驱动同理)
    } else {
      drawHead(this.atlas.ensureVImage('vanilla/NPC_Head_0.png'), player.cx, player.cy, false, 0, 1);
    }
    // 城镇 NPC 头(恒显,不含 bound 态)
    for (const n of npcs) {
      if (n.dead || n.bound) continue;
      const headIdx = TOWN_NPC_HEAD_INDEX[n.vanillaId];
      if (headIdx === undefined) continue;
      drawHead(this.atlas.ensureVImage(`vanilla/NPC_Head_${headIdx}.png`), n.cx, n.cy, n.facing > 0);
    }
    // Boss 头
    for (const e of enemies) {
      if (e.dead) continue;
      const vid = e.vanillaId;
      if (vid == null) continue;
      const idx = BOSS_HEAD_INDEX[vid];
      if (idx === undefined) continue;
      const rot = bossHeadRotation(vid, (e as unknown as { visAngle?: number }).visAngle ?? 0);
      drawHead(this.atlas.ensureVImage(`vanilla/NPC_Head_Boss_${idx}.png`), e.cx, e.cy, false, rot);
    }
  }

  /** 全屏地图：半透明背景 + 完整世界图 + 边框 + 操作提示；支持拖动/缩放 */
  drawFullMap(ctx: CanvasRenderingContext2D, world: World, mouseX: number, mouseY: number, mouseDown: boolean, entities: Entity[] = []) {
    const fm = this.fullMap;
    const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
    this._fmWorldW = world.w;
    this._fmWorldH = world.h;
    // 拖动平移：按下首帧只同步基准点不位移（防地图瞬移）
    // _mapOpenClick：打开地图的那次点击（Game 置位）不参与拖拽，松开后才允许拖
    if (mouseDown && !this._mapOpenClick) {
      if (!this.mapDragging) {
        this.mapDragging = true;
      } else {
        fm.panX += mouseX - this.lastMouse.x;
        fm.panY += mouseY - this.lastMouse.y;
        // 拖动改变 pan 后按当前鼠标重设锚点（缓动中的缩放继续稳定）
        const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
        fm.anchorU = (mouseX - (viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX)) / fm.zoom;
        fm.anchorV = (mouseY - (viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY)) / fm.zoom;
        fm.anchorMX = mouseX;
        fm.anchorMY = mouseY;
      }
    } else {
      if (!mouseDown) this._mapOpenClick = false; // 松开后恢复正常拖拽
      this.mapDragging = false;
    }
    this.lastMouse = { x: mouseX, y: mouseY };
    // 画布尺寸按世界比例
    const mapW = world.w * fm.zoom;
    const mapH = world.h * fm.zoom;
    // 初始居中玩家（首次打开）
    if (fm.panX === 0 && fm.panY === 0 && !this._mapInit) {
      this._mapInit = true;
      fm.panX = 0;
      fm.panY = 0;
    }
    const cx0 = viewW / 2 - mapW / 2 + fm.panX;
    const cy0 = viewH / 2 - mapH / 2 + fm.panY;
    // 背景：原版 DrawMapFullscreenBackground（Main.cs:55804）——全屏群系 MapBG 贴图
    // （TextureAssets.MapBGs[i] = MapBG{i+1}.png，AssetInitializer :641），按视区深度
    // 与玩家 zone 选表。★vui 键必须带 .png 后缀(2026-08-13 枚举 review 实锤:
    // 此前裸 'MapBG{n}'/'Map' 恒 null——键失配不是懒加载瞬态,背景/卷轴从未画过)
    const bgTex = this.atlas ? this.atlas.vui(`MapBG${this.fullMapBgIndex(world) + 1}.png`) : null;
    if (bgTex) {
      ctx.drawImage(bgTex.img, bgTex.sx, bgTex.sy, bgTex.sw, bgTex.sh, 0, 0, viewW, viewH);
    } else {
      ctx.fillStyle = 'rgba(8,6,16,0.92)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // 卷轴底图（原版 Images/Map.png 928×248 羊皮纸，Main.cs:54923：地图内容【之下】
    // 整幅绘制——destRect 与地图区同位同缩放，羊皮纸边缘饰纹在地图缩放留边处露出；
    // 地图探索未达区域在卷轴上呈现纸张色而非纯蓝）
    const scroll = this.atlas ? this.atlas.vui('Map.png') : null;
    if (scroll && scroll.img instanceof HTMLImageElement && scroll.img.complete && scroll.img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true; // 卷轴是美术图，平滑缩放防像素锯齿
      ctx.drawImage(scroll.img, scroll.sx, scroll.sy, scroll.sw, scroll.sh, cx0, cy0, mapW, mapH);
    }
    ctx.imageSmoothingEnabled = fm.zoom >= 1;
    ctx.drawImage(this.minimap!.canvas, cx0, cy0, mapW, mapH);
    ctx.imageSmoothingEnabled = false;
    // 迷雾
    this.drawFog(ctx, world, cx0, cy0, fm.zoom, 2 * fm.zoom);
    // 头像层(原版 DrawNPCMapIcons2 :55602 + MapPlayerRenderer:玩家头/城镇 NPC 头/
    // Boss 头;headScale=min(1,(zoom×0.5+1)/3)——Main.cs:55140)
    const p = this._lastPlayer;
    if (p) {
      this.drawMapHeads(ctx, p, Math.min(1, (fm.zoom * 0.2 * 2 + 1) / 3) * 1.1,
        (wx) => cx0 + wx / TILE * fm.zoom,
        (wy) => cy0 + wy / TILE * fm.zoom,
        entities.filter((e) => e instanceof TownNPC) as TownNPC[],
        entities.filter((e) => e instanceof Enemy) as Enemy[]);
    }
    // 传送预选标记（第一次点击的点，闪烁提示再次点击确认）
    const tp = this.tpMark;
    if (tp) {
      const blink = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = '#FF5050';
      ctx.lineWidth = 3;
      const mx = cx0 + (tp.x + 0.5) * fm.zoom, my = cy0 + (tp.y + 0.5) * fm.zoom;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(8, 10 * fm.zoom), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 14, my); ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my + 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 操作提示
    this.drawPylonMapLayer(ctx, cx0, cy0, mouseX, mouseY);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#C8C0D8';
    ctx.textAlign = 'center';
    ctx.fillText(Lang.text('Mods.SandboxWorld.Map.Hint'), viewW / 2, viewH - 16);
  }
  private _mapInit = false;

  /** 全屏地图晶塔图标层（TeleportPylonsMapLayer.cs 1:1）：
   *   - 连线（:52-75）：当前塔（MapPylonTile）→ 其余每座晶塔的黑 6px/白 2px 双线
   *   - 图标（:77-104）：Extra_182.png 11 帧横排（330×38，帧 30×38），帧号 = 塔型；
   *     玩家不在晶塔旁 → 半透明灰（color = Gray*0.5 :70-73）
   *   - 悬停提示（:97-99）：晶塔物品名
   *  击中判定（Game.tryPylonMapTeleport）：图标中心 = 锚点 + (1.5, 2) 格。 */
  private drawPylonMapLayer(
    ctx: CanvasRenderingContext2D, cx0: number, cy0: number,
    mouseX: number, mouseY: number,
  ) {
    if (!this.pylons.length) { this.pylonHoverName = null; return; }
    const fm = this.fullMap;
    const icon = this.atlas ? this.atlas.vui('Extra_182.png') : null;
    // 玩家 ±60 格内无晶塔 → 半透明（IsPlayerNearAPylon :70-73；近似取相机中心玩家位）
    const p = this._lastPlayer;
    const dim = p ? !this.pylons.some((py) =>
      Math.abs(py.x - p.cx / TILE) <= 62 && Math.abs(py.y - p.cy / TILE) <= 63) : true;
    // 连线（:52-75）
    if (this.mapPylonTile) {
      const o = this.mapPylonTile;
      const ox = cx0 + (o.x + 1.5) * fm.zoom, oy = cy0 + (o.y + 2) * fm.zoom;
      for (const py of this.pylons) {
        if (py.x === o.x && py.y === o.y) continue;
        const tx = cx0 + (py.x + 1.5) * fm.zoom, ty = cy0 + (py.y + 2) * fm.zoom;
        for (const [c, w] of [['#000000', 6], ['#FFFFFF', 2]] as const) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      }
    }
    // 图标 + 悬停
    this.pylonHoverName = null;
    const FW = 30, FH = 38;   // Extra_182：11 帧 × 30px（330×38）
    const scale = Math.max(1, Math.min(2, fm.zoom));   // scaleIfSelected 2× / 基线 1×
    for (const py of this.pylons) {
      const mx = cx0 + (py.x + 1.5) * fm.zoom, my = cy0 + (py.y + 2) * fm.zoom;
      const dw = FW * scale, dh = FH * scale;
      if (mx < -dw || mx > ctx.canvas.width + dw || my < -dh || my > ctx.canvas.height + dh) continue;
      ctx.globalAlpha = dim ? 0.35 : 1;
      if (icon) {
        ctx.drawImage(icon.img, icon.sx + py.type * FW, icon.sy, FW, FH,
          mx - dw / 2, my - dh / 2, dw, dh);
      } else {
        // 贴图未就绪兜底：白描边菱形占位（懒加载次帧补上真图标）
        ctx.strokeStyle = '#8CF5A9'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, my - dh / 2); ctx.lineTo(mx + dw / 2, my);
        ctx.lineTo(mx, my + dh / 2); ctx.lineTo(mx - dw / 2, my);
        ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (Math.abs(mouseX - mx) <= dw / 2 && Math.abs(mouseY - my) <= dh / 2) {
        this.pylonHoverName = Lang.itemName(pylonItemTypeFromStyle(py.type));
      }
    }
    if (this.pylonHoverName) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(this.pylonHoverName, mouseX, mouseY - 14);
    }
  }

  /** 全屏地图背景群系序号（DrawMapFullscreenBackground Main.cs:55804-55905 1:1）。
   *  深度以地图视区竖直中心（tile）近似原版 screenPosition；群系/墙取玩家所在格。
   *  返回值 = MapBGs 数组下标（贴图文件 MapBG{下标+1}.png）。 */
  fullMapBgIndex(world: World): number {
    const p = this._lastPlayer;
    const sc = this.scene;
    if (!p || !sc) return 0;
    // 视区竖直中心（tile）——用 pan 后地图的屏幕中心近似（原版 screenPosition.Y）
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const mapH = world.h * fm.zoom;
    const cy0 = viewH / 2 - mapH / 2 + fm.panY;
    const vy = Math.floor((cy0 + mapH / 2) / fm.zoom);
    const px = Math.floor(p.cx / TILE), py = Math.floor(p.cy / TILE);
    const st = world.store;
    const inB = st.inBounds(px, py);
    const wall = inB ? st.wall[st.idx(px, py)] : 0;
    // 地狱（视区深度）
    if (vy > world.store.h - 232) return 2;
    if (sc.zoneDungeon) return 4;
    if (wall === 87) return 13;
    if (py > world.groundLevel) {
      switch (wall) {
        case 86: case 108: return 15;
        case 180: case 184: return 16;
        case 178: case 183: return 17;
        case 62: case 263: return 18;
      }
      if (sc.zoneGlowshroom) return 20;
      if (sc.zoneCorrupt) return sc.zoneDesert ? 41 : sc.zoneSnow ? 35 : 21;
      if (sc.zoneCrimson) return sc.zoneDesert ? 40 : sc.zoneSnow ? 34 : 22;
      if (sc.zoneHallow) return sc.zoneDesert ? 39 : sc.zoneSnow ? 33 : 23;
      if (sc.zoneDesert) return 14;
      if (sc.zoneSnow) return 3;
      if (sc.zoneJungle) return 12;
      return sc.zoneRockLayerHeight ? 31 : 1;
    }
    // 地表
    if (sc.zoneSkyHeight) return 32;
    if (sc.zoneCorrupt) return sc.zoneDesert ? 36 : 5;
    if (sc.zoneCrimson) return sc.zoneDesert ? 37 : 6;
    if (sc.zoneHallow) return sc.zoneDesert ? 38 : 7;
    if (py <= world.groundLevel + 10 && (px < 380 || px > world.store.w - 380)) return 10;
    if (sc.zoneSnow) return 11;
    if (sc.zoneJungle) return 8;
    if (sc.zoneDesert) return 9;
    if (world.clock?.bloodMoon) return 25;
    if (sc.zoneGraveyard) return 26;
    return 0;
  }

  /** 全屏地图主角标记：脉冲圆环 + 原版风格白箭头（黑描边）+ 坐标文字 */
  /** 打开地图的那次点击不参与拖拽（Game 打开时置位，松开后清除） */
  _mapOpenClick = false;
  private _lastPlayer: Player | null = null;
  /** 传送预选标记（Game 写入） */
  tpMark: { x: number; y: number } | null = null;

  /** 调试叠加层：碰撞盒高亮 + 状态信息 */
  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number,
    player: Player, entities: Entity[], mouseX: number, mouseY: number,
    hover: HoverTarget | null,
  ) {
    const z = cam.zoom;
    const [mx, my] = cam.worldToScreen(mouseX, mouseY);
    const box = (e: { x: number; y: number; w: number; h: number; cx: number }, color: string, label?: string) => {
      const [sx, sy] = cam.worldToScreen(e.x, e.y);
      const sw = e.w * z, sh = e.h * z;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      if (label) {
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, sx + 2, sy - 3);
      }
    };
    // 主角碰撞盒（亮绿）
    box(player, '#00FF66', `player ${player.w}x${player.h} og:${player.onGround} vy:${player.vy.toFixed(1)}`);
    // 主角中心点
    const [pcx, pcy] = cam.worldToScreen(player.cx, player.cy);
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(pcx - 2, pcy - 2, 4, 4);
    // 手持工具/武器的范围显示（与 Game 判定一致）：
    // 1) 近战判定圆：剑 = 完整 reach，镐/斧/锤 ×0.8，空手 3 格；圆心向朝向平移 reach×0.35
    // 2) 挖掘圆（镐/锤）：4.5 格（tryMine 范围）
    // 3) 砍树圆（斧）：4.5 格（同一 tryMine 通路，斧作用对象为树）
    {
      const held = player.inv.heldItem();
      const tool = held ? ITEM_DEFS[held.id]?.tool : undefined;
      const reach = (tool?.reach ?? TILE * 3) * (tool?.type === 'sword' ? 1 : tool ? 0.8 : 1);
      const circle = (cx: number, r: number, color: string, label: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, pcy, r * z, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, cx + 6, pcy - 6);
      };
      // 近战判定圆（朝向前移）
      const acx = pcx + player.facing * reach * 0.35 * z;
      circle(acx, reach, tool ? 'rgba(0,255,200,0.55)' : 'rgba(120,120,160,0.4)',
        `attack ${(reach / TILE).toFixed(1)} tiles${tool ? '' : ' (no tool)'}`);
      // 挖掘范围（镐/锤）
      if (tool && (tool.type === 'pick' || tool.type === 'hammer')) {
        circle(pcx, TILE * 4.5, 'rgba(255,170,60,0.5)', 'mine 4.5 tiles');
      }
      // 砍树范围（斧）
      if (tool && tool.type === 'axe') {
        circle(pcx, TILE * 4.5, 'rgba(120,230,90,0.5)', 'chop 4.5 tiles');
      }
    }
    // 实体碰撞盒
    for (const e of entities) {
      const ent = e as Entity;
      if (ent instanceof Enemy) box(ent, '#FF4444', (ent as Enemy).key);
      else if (ent instanceof Critter) box(ent, '#44AAFF', ent.key);
      else if (ent instanceof ItemDrop) box(ent, '#FFAA00');
      else if (ent instanceof Tombstone) box(ent, '#AA88FF', 'tomb');
    }
    // 鼠标指向 tile
    const [htx, hty] = cam.tileUnder(mouseX, mouseY);
    const [hsx, hsy] = cam.worldToScreen(htx * TILE, hty * TILE);
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.strokeRect(hsx, hsy, TILE * z, TILE * z);
    // 信息面板
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(8, 8, 260, 130);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#00FF66';
    ctx.fillText(`pos: ${player.cx.toFixed(0)}, ${player.cy.toFixed(0)}  tile: ${Math.floor(player.cx / TILE)}, ${Math.floor(player.cy / TILE)}`, 14, 26);
    ctx.fillStyle = '#88FF88';
    ctx.fillText(`box: ${player.w}x${player.h}  onGround: ${player.onGround}  vy: ${player.vy.toFixed(2)}`, 14, 44);
    ctx.fillText(`mouse: ${mouseX}, ${mouseY}  tile: ${htx}, ${hty}`, 14, 62);
    ctx.fillStyle = '#AAA';
    ctx.fillText(`zoom: ${z.toFixed(2)}  entities: ${entities.length}`, 14, 80);
    ctx.fillText(`inWater: ${player.inWater}  headUnder: ${player.headUnderwater}`, 14, 98);
    ctx.fillStyle = '#FF6600';
    ctx.fillText('F3 关闭调试面板', 14, 118);
    // 图例
    ctx.fillStyle = '#666';
    ctx.fillText('绿=主角 橙=中心 红=怪物 蓝=动物 黄=鼠标', 14, 136);
  }

  /** 入侵进度条（原版进度已完成的百分比；Boss 条下方 30px）。
   *  label：整段文案覆盖（月事件 wave20 需求恒 0 → Main.cs:47163 用
   *  Game.InvasionPoints 代替百分比、进度条满格 :47167-47170） */
  private drawInvasionBar(ctx: CanvasRenderingContext2D, viewW: number, invasion: { name: string; pct: number; label?: string }) {
    const w = Math.min(560, viewW - 200);
    const x = (viewW - w) / 2, y = 28 + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, y - 3, w + 6, 26);
    ctx.fillStyle = '#10305A';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = '#D0A020';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, invasion.pct)), 20);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    const pctTxt = `${Math.floor(Math.max(0, Math.min(1, invasion.pct)) * 100)}%`;
    ctx.fillText(`${invasion.name}  ${invasion.label ?? pctTxt}`, viewW / 2, y + 15);
  }

  /** Boss 头像贴图索引（NPCID.Sets.BossHeadTextures，NPCID.cs:4861 全量对照）：
   *  npc type → NPC_Head_Boss_N。未列出的 boss（-1）原版不显示头像 */
  private static readonly BOSS_HEAD_INDEX: Record<number, number> = {
    4: 0, 13: 2, 344: 3, 370: 4, 246: 5, 249: 5, 345: 6, 50: 7, 396: 8, 395: 9,
    325: 10, 262: 11, 327: 13, 222: 14, 125: 15, 126: 20, 346: 17, 127: 18,
    35: 19, 68: 19, 113: 22, 266: 23, 439: 24, 440: 24, 134: 25, 491: 26, 517: 27,
    422: 28, 507: 29, 493: 30, 549: 35, 564: 32, 565: 32, 576: 33, 577: 33,
    551: 34, 548: 36, 636: 37, 657: 38, 668: 39,
  };

  /** Boss 血条 1:1（BigProgressBarHelper.DrawFancyBar，BigProgressBarHelper.cs:18-57）：
   *  UI_BossBar.png（516×348 = 1 列 × 6 行 58px 帧）——行3 背景（×0.2）→ 行2 填充
   *  2px 段横向拉伸（宽=456×ratio 取偶）→ 行1 填充端盖（x+num2-2）→ 行0 整框 →
   *  头像（NPC_Head_Boss_N，锚=框左上+(4,20)+图标半宽）→ 血量文本。
   *  布局：456×22 居中于 (W/2, H-50)——底部中央（原版语义；旧实现顶部自绘红条）。
   *  多 Boss 面板：原版 BigProgressBarSystem 同时只跟踪一个 NPC（TryFindingNPCToTrack
   *  单目标），我们也只收到单个 boss——单 Boss 路径即完整语义。盾量重载（行4/5，
   *  LunarPillar 等）按塔盾条另走，未在本条复用（登记） */
  private drawBossBar(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    boss: { name: string; hp: number; maxHp: number; cx: number; cy: number },
    entities: Entity[] = [],
  ) {
    if (!this.atlas) return;
    const bar = this.atlas.vui('UI_UI_BossBar.png');
    const FH = 58, BW = 456, BH = 22, IX = 32, IY = 24;
    const rect = { x: Math.round(viewW / 2 - BW / 2), y: Math.round(viewH - 50 - BH / 2), w: BW, h: BH };
    const vec = { x: rect.x - IX, y: rect.y - IY };
    let fill = Math.floor(BW * Math.max(0, Math.min(1, boss.hp / boss.maxHp)));
    fill -= fill % 2;                                            // num2 -= num2 % 2
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (bar) {
      // 行3 背景 ×0.2
      ctx.globalAlpha = 0.2;
      ctx.drawImage(bar.img, bar.sx, bar.sy + 3 * FH, bar.sw, FH, vec.x, vec.y, bar.sw, FH);
      ctx.globalAlpha = 1;
      // 行2 填充段（2px 源横向拉伸到 num2 宽）
      ctx.drawImage(bar.img, bar.sx + IX, bar.sy + 2 * FH + IY, 2, BH, rect.x, rect.y, Math.max(2, fill), BH);
      // 行1 端盖
      ctx.drawImage(bar.img, bar.sx + IX, bar.sy + 1 * FH + IY, 2, BH, rect.x + Math.max(0, fill - 2), rect.y, 2, BH);
      // 行0 整框（含头像背景槽）
      ctx.drawImage(bar.img, bar.sx, bar.sy, bar.sw, FH, vec.x, vec.y, bar.sw, FH);
    } else {
      // 贴图未就绪兜底：几何暗条（不闪断）
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(rect.x, rect.y, BW, BH);
      ctx.fillStyle = '#C03030';
      ctx.fillRect(rect.x, rect.y, Math.max(2, fill), BH);
    }
    // 头像：boss 参数无类型信息——从实体表反查同 hp/位置的 Enemy 取 vanillaId
    const src = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead
      && Math.abs(n.hp - boss.hp) < 1 && Math.abs(n.maxHp - boss.maxHp) < 1
      && Math.abs(n.cx - boss.cx) < 64 && Math.abs(n.cy - boss.cy) < 64);
    const headIdx = src?.vanillaId != null ? Renderer.BOSS_HEAD_INDEX[src.vanillaId] : undefined;
    if (headIdx !== undefined) {
      const head = this.atlas.vmisc(`vanilla/NPC_Head_Boss_${headIdx}.png`);
      if (head) {
        // vector2 = (4,20) + 图标半宽，origin = 图标半宽 → 净左上 = vec + (4,20)
        ctx.drawImage(head.img, head.sx, head.sy, head.sw, head.sh,
          vec.x + 4, vec.y + 20, head.sw, head.sh);
      }
    }
    // 血量文本（DrawHealthText :59-68：中缝 "/"、左当前右上限）
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    const cy2 = rect.y + rect.h / 2 + 5;
    ctx.strokeText('/', rect.x + rect.w / 2, cy2);
    ctx.fillStyle = '#FFF';
    ctx.fillText('/', rect.x + rect.w / 2, cy2);
    ctx.textAlign = 'right';
    ctx.strokeText(`${Math.ceil(boss.hp)}`, rect.x + rect.w / 2 - 5, cy2);
    ctx.fillText(`${Math.ceil(boss.hp)}`, rect.x + rect.w / 2 - 5, cy2);
    ctx.textAlign = 'left';
    ctx.strokeText(`${boss.maxHp}`, rect.x + rect.w / 2 + 5, cy2);
    ctx.fillText(`${boss.maxHp}`, rect.x + rect.w / 2 + 5, cy2);
    ctx.textAlign = 'start';
    ctx.restore();
    void boss.name;
  }

}
