// 主渲染器：天空 → chunk → 液体 → 实体 → 粒子/飘字 → 光照合成 → 小地图
import { TILE, CHUNK } from '../core/constants';
import type { Camera } from './Camera';
import { SkyRenderer } from './SkyRenderer';
import { ChunkCache } from './ChunkCache';
import type { World, Clock } from '../world/World';
import type { AssetBundle } from '../assets/AssetGen';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import { atlasIconForKey, VANILLA_ITEM_ICON_MAP } from '../assets/SpriteAtlas';
import { TOOL_CUTTER } from '../world/Wiring';
import { compositePaperDoll, dollFrame } from '../player/PaperDoll';
import type { Inventory } from '../items/Inventory';
import { VanillaResourceBars } from './ResourceBars';
import type { FlickerClock } from '../lighting/SkyColor';
import { SMART_CURSOR_DIRECTION_LOCKS } from '../player/SmartCursor';

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
import { WaterfallRenderer } from './WaterfallRenderer';
import { BiomeBackground } from './BiomeBackground';
import type { SceneFlags } from '../world/SceneMetrics';
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { drawEmotes } from './EmoteBubble';

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

/** OffsetsPlayerHeadgear（Main.cs:504-525，按 bodyFrame.Y/56 行索引）：
 *  行 0-6→y2 / 7-9→y0 / 10-13→y2 / 14-16→y0 / 17-19→y2（X 恒 0）。
 *  useStyle 14/15（头侧持）与 holdStyle 5/6/8 的 itemLocation 都要加此偏移 */
const HEADGEAR_OFFSET_Y = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
import { Lang } from '../i18n/Lang';
import { ITEM_DEFS } from '../data/items';
import { townExtraFrames, TOWN_NPC_HEAD_INDEX } from '../data/vanillaNpcs';
import type { Player } from '../entities/Player';
import { BuffType } from '../stats/Buffs';
import { vanillaTileMapColor, vanillaWallMapColor, vanillaLiquidColor, vanillaSkyColor, VANILLA_DIRT_BG, VANILLA_ROCK_BG } from '../data/vanillaMapColors';
import { Enemy } from '../entities/Enemy';
import { TOWER_KEY, TOWER_SHIELD_COLOR, isTowerId, shieldMax } from '../world/LunarEvent';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { Tombstone, getTombstoneCanvas } from '../entities/Tombstone';
import { Critter } from '../entities/Critter';
import type { Entity } from '../entities/Entity';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; damp?: number; grav?: number; }

// 光照合成 4-tap 标量缓冲(替代每像素 [r,g,b] 元组,2026-08 审计 G2)
const _lightTap = new Uint8Array(12);

// ============ 原版 FindFrame 分族帧引擎（1.4.5.6 Terarria1456/Terraria/NPC.cs:67295+） ============
// 僵尸族 case 3（L77026）：腾空/逆向→帧2；站定→帧0；行走 counter+=|vx| 按 8/16/24/32 → 0,1,2,1 往复
const ZOMBIE_FRAME_TYPES = new Set([3, 52, 53, 132, 161, 186, 187, 188, 189, 200, 223, 251, 254, 255, 319, 320, 321, 331, 332, 342, 536, 590, 691]);
// 蝙蝠族 case 49（L75523→148 块 L75585）：每 6 tick 推进；49/51/60/634 循环到倒数第 2 帧（末帧=挂机姿势）
const BAT_SKIP_LAST = new Set([49, 51, 60, 634]);
// 旋转族 NPC（原版 npc.rotation 驱动绘制朝向；FindFrame 不做朝向翻转）：
// 35/68=骷髅王头/守卫、113-115=血肉墙/之眼/饥饿者、125/126=双子、127-131=Prime 头+四部件、
// 134-136=毁灭者链、261-265=世花族(孢子/本体/钩蔓/触须)、370=猪鲨、396/397=月总头/手、657=史莱姆皇后(飞行倾斜)
const ROTATION_NPC = new Set([35, 68, 113, 114, 115, 125, 126, 127, 128, 129, 130, 131, 134, 135, 136, 246, 247, 248, 249, 261, 262, 263, 264, 265, 370, 396, 397, 657]);

/** 按原版 FindFrame 分族规则算当前帧 index */
function vanillaFrameIdx(e: Enemy, frames: number): number {
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
    if ((e as Enemy & { ai0: number }).ai0 === 0) return 0;
    return frames > 1 ? 1 + Math.floor(t / 8) % (frames - 1) : 0;
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
  // 蝙蝠族（L75585）：每 6 tick 推进，全循环（部分类型不含末帧）
  if (ai === 14) {
    const cap = BAT_SKIP_LAST.has(id) ? frames - 1 : frames;
    return Math.max(1, Math.min(frames - 1, Math.floor(t / 6) % Math.max(1, cap)));
  }
  // 史莱姆（case 1, L71506）：每 8 tick 推进，全循环
  if (ai === 1) return Math.floor(t / 8) % frames;
  // 骷髅王头/手（case 35/36, L67378+）：仅 RedHatSkeletron（ai[3]==1 红帽变种）才切帧；
  // 常规骷髅王恒帧 0——此前走通用全循环会闪到表内"红帽骷髅"帧
  if (ai === 11 || ai === 12) return 0;
  // 城镇 NPC（aiStyle 7，FindFrame 城镇分支 L70172-70262）：腾空=1；站定=0；
  // 行走帧 2..frames-extra-1 循环（frameCounter += |vx|*2+1、>6 推进、越界回卷帧2）
  if (ai === 7) {
    if (!e.onGround) return 1;
    if (!walking) return 0;
    const extra = townExtraFrames(id);
    const len = Math.max(1, frames - extra - 2);
    return 2 + (Math.floor((e.walkCycleT * 2 + t) / 6) % len);
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
  // ai[0]>1(二阶段)帧偏移 +3(张嘴形态)
  if (id === 4) {
    const blink = Math.floor(t / 7) % 3;
    return Math.min(frames - 1, blink + (e.phase > 1 ? 3 : 0));
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
  // 其余（眼/蜂群/幽灵/蠕虫段等）：每 6 tick 全循环
  return Math.floor(t / 6) % frames;
}
export interface DamageNumber { x: number; y: number; vy: number; value: number; crit: boolean; color: string; life: number; label?: string; }

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
    const hex = (c: number[]): string => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
    if (st.flags[i] && st.type[i] !== 0) {
      const d = TILE_DEFS[st.type[i]];
      if (d?.vanilla?.sheet !== undefined) {
        const vc = vanillaTileMapColor(d.vanilla.sheet);
        if (vc) return hex(vc);
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
      if (vc) return hex(vc);
      return WALL_DEFS[st.wall[i]]?.mapColor ?? '#2E2E2E';
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
    const { type, wall, liquid, liquidType } = st;
    const surf = Math.max(1, world.groundLevel), rock = Math.max(surf + 1, world.rockLevel);
    for (let y = 0; y < world.h; y++) {
      // 背景（无 tile/液体/墙）：天空渐变（y<世界面，CalcSkyGradient lerp）/ 土层底 / 石层底
      const skyC = vanillaSkyColor(y, surf);
      const bg = y < surf ? (0xff000000 | ((skyC[2] & 255) << 16) | ((skyC[1] & 255) << 8) | (skyC[0] & 255))
        : y < rock ? lut.dirtBg : lut.rockBg;
      for (let x = 0; x < world.w; x++) {
        const i = y * world.w + x;
        const t = type[i];
        if (t !== 0) { buf[i] = lut.tiles[t] ?? lut.tiles[0]; continue; }
        if (liquid[i] > 32) {
          const lt = liquidType[i];
          buf[i] = lut.liq[lt >= 1 && lt <= 4 ? lt : 1];
          continue;
        }
        const wl = wall[i];
        buf[i] = wl !== 0 ? (lut.walls[wl] ?? lut.walls[0]) : bg;
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
  /** 原版群系/地下背景（DrawBG/DrawBackground 移植）；场景数据由 Game 每帧注入 */
  biomeBg = new BiomeBackground();
  /** 原版生命/魔力资源条（ClassicPlayerResourcesDisplaySet 移植） */
  resourceBars = new VanillaResourceBars();
  scene: SceneFlags | null = null;

  // 全屏地图查看器状态（zoom 向 zoomTarget 缓动；缓动期间按锚点补偿 pan）
  fullMap = {
    open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0,
    anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0,
  };

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

  /** Maples 图标绘制矩形（找不到返回 null） */
  atlasIcon(id: number) {
    if (!this.atlas) return null;
    const def = ITEM_DEFS[id];
    if (!def) return null;
    return atlasIconForKey(this.atlas, def.key);
  }

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
    invasion: { name: string; pct: number } | null = null,
  ) {
    this._mouseX = mouseX;
    this.remotePlayers = remotePlayers;
    this._mouseY = mouseY;
    this._mouseDown = mouseDown;
    this._liquidNow = performance.now(); // 帧 first thing 采样：背景水/瀑布/前景水共用同一时刻
    this.updateWaterStyle(world, cam);
    this.easeFullMap();
    const ctx = this.ctx;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    cam.viewW = viewW; cam.viewH = viewH;
    const z = cam.zoom;

    // 1. 天空（器件态注入：天塔柱滤镜类型 / 派对气球门 / 地表线）
    this.sky.fx = {
      monolith: this.scene?.monolithType ?? -1,
      party: !!this.scene?.partyUp,
      surfaceY: world.groundLevel * TILE,
    };
    this.sky.draw(ctx, clock, viewW, viewH, cam.x);

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
    // 1.6 天塔柱滤镜（SceneState → Filters.Scene["Monolith*"]；后处理层的背景子集近似）
    this.sky.drawMonolithFilter(ctx, viewW, viewH);

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

    // 2c. 前景 tile/物体层(同款保险重叠)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).tile, cx * CHUNK * ts, cy * CHUNK * ts, CHUNK * ts + over, CHUNK * ts + over);
      }
    }

    // 2c'. 导线覆盖层(原版画在水之上实体之下,Main.cs:46721;手持电路工具或 F7 时可见)
    this.drawWires(world, cam, viewW, viewH, z);
    // 2c''. 宏伟蓝图拖拽预览(锚点→悬停格的 L 路径,与 massWireOperation 同构:先纵后横+端点)
    this.drawGrandPreview();

    // 2d. 瀑布贴图（原版画在 tile 层后、实体前，Main.cs:47460，被地形遮挡）
    this.drawWaterfalls(world, cam, viewW, viewH, z);

    // 2d'. 天气层（雨滴池更新+绘制；沙尘粒子发射——Game 每帧已 attach 状态与 hooks）
    if (this.weatherFxActive) {
      this.weatherFx.update(world, viewW, cam.x - viewW / 2, cam.y - viewH / 2, player.vx, player.vy);
      this.weatherFx.draw(this, world);
    }

    // 3.5 入驻旗帜（Main.cs:40152 DrawNPCHousesInWorld：有家 NPC 在家坐标上方
    // 挂 House_Banner 旗布 + 叠画 NPC 头像；实体层之前画，让 NPC 从旗前走过）
    this.drawHouseBanners(entities, world, cam);

    // 4. 实体（按 y 排序）
    const sorted = [...entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e instanceof Enemy) { this.drawEnemy(e, world, entities); this.drawHealthBar(e); }
      else if (e instanceof ItemDrop) this.drawDrop(e);
      else if (e instanceof TownNPC) { this.drawTownNPC(e); this.drawHealthBar(e); }
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
    for (const rp of this.remotePlayers) this.drawPlayer(rp, world, rp.swingNet);

    // 4.5 液体前景 pass（原版 waterTarget 在玩家/掉落物之后合成，Main.cs:46720）：
    //     水 0.6 半透明盖在实体上——水中角色带水色
    this.drawLiquids(world, cam, viewW, viewH, z, false);

    // 5. 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
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

    // 8. 飘字（受光照影响后画）
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const d of dmgNumbers) {
      ctx.globalAlpha = Math.min(1, d.life / 30);
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      // 物品名飘字：带阴影浅白文本
      if (d.label) {
        ctx.font = '13px sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(d.label, sx, sy);
        ctx.fillStyle = '#F0F0F0';
        ctx.fillText(d.label, sx, sy);
        continue;
      }
      ctx.fillStyle = d.color;
      ctx.font = d.crit ? 'bold 18px monospace' : 'bold 14px monospace';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(String(d.value), sx, sy);
      ctx.fillText(String(d.value), sx, sy);
    }
    ctx.restore();

    this._lastPlayer = player;
    // 9. 小地图
    this.drawMinimap(ctx, cam, world, player, clock);
    // 9.5 全屏地图
    if (this.fullMap.open && this.minimap) {
      this.drawFullMap(ctx, world, this._mouseX, this._mouseY, this._mouseDown);
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
    }
    // 入侵进度条（DrawInvasionProgress Main.cs:47071 语义；布局与 Boss 条并列居中，
    // 原版右下角黄条——偏差记录）
    if (invasion) this.drawInvasionBar(ctx, viewW, invasion);

    // 11. 生命/魔力资源条（原版 ClassicPlayerResourcesDisplaySet：右上红心排 + 右缘魔力星）
    this.resourceBars.draw(ctx, player, viewW, flicker);

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
      const coins = Lang.text('Game.DroppedCoins', String(lost));
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
    this.waterfalls.draw(this.ctx, this.atlas, world.store, world.groundLevel, now, this.waterStyle);
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
    // CalculateWaterStyle 的血月分支读 Main.bloodMoon——柱激活时同色 9，白夜也生效）
    const bloodMoon = (!!world.clock?.bloodMoon || !!f.bloodMoonMonolith);
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

  /** 小动物：原版 NPC 纵向帧条动画（移动时循环全帧，静止首帧；贴图默认朝左镜像） */
  /** 大血条比例 1.5 的类型（Main.cs:45228-45298：Boss 与大型怪） */
  private static readonly HB_BIG_SCALE = new Set([
    4, 35, 36, 50, 113, 114, 125, 126, 127, 128, 129, 130, 131, 222, 262, 266,
    245, 246, 247, 248, 249, 564, 565, 551, 576, 577, 87, 510, 454, 621, 439, 370,
  ]);
  /** NPCAddHeight（Main.cs:21852-21977）：血条在脚底 +10 之上的额外下沉（视觉修正） */
  private static readonly HB_ADD_H: Record<number, number> = {
    125: 30, 126: 30, 54: 2, 205: 8, 182: 24, 178: 2, 6: 26, 173: 26, 94: 14,
    7: 13, 8: 13, 9: 13, 98: 13, 99: 13, 100: 13, 95: 13, 96: 13, 97: 13,
    10: 8, 11: 8, 12: 8, 13: 26, 14: 26, 15: 26, 175: 4, 520: 2,
    412: 18, 413: 18, 414: 18, 48: 32, 49: 4, 51: 4, 60: 10,
    62: 14, 66: 14, 156: 14, 63: 4, 64: 4, 103: 4, 65: 5, 69: 4, 70: -4, 72: -2,
    83: 20, 84: 20, 150: 10, 151: 10, 158: 10, 152: 6, 153: 2, 154: 2,
    165: 10, 237: 10, 238: 10, 240: 10, 531: 10, 39: 26, 40: 26, 41: 26,
    87: 56, 88: 56, 89: 56, 90: 56, 91: 56, 92: 56, 134: 30, 135: 30, 136: 30, 169: 8,
  };

  /** 受伤实体血条（DrawInterface_14_EntityHealthBars Main.cs:45203 + DrawHealthBar :21748）：
   *  life != lifeMax 即显示（无时间衰减——原版打到没满血就一直显示）；画在脚底
   *  +10+NPCAddHeight；填充 36px×比例；绿→黄→红渐变（:21766-21778）；光照亮度调
   *  alpha（:45417 Brightness）。蠕虫段不画（头部血条代表全链）；毁灭者原版为
   *  全链共享一条（destroyerHB 平滑），此处近似画在头下。 */
  private drawHealthBar(e: { cx: number; cy: number; y: number; h: number; hp: number; maxHp: number; vanillaId: number | null; wormFollow?: Enemy['wormFollow'] }) {
    const hp = e.hp, maxHp = e.maxHp;
    if (hp <= 0 || hp >= maxHp) return;
    if (e.wormFollow) return;
    if (!this.atlas) return;
    const hb1 = this.atlas.ensureVImage('vanilla/HealthBar1.png');
    const hb2 = this.atlas.ensureVImage('vanilla/HealthBar2.png');
    if (!hb1 || !hb2) return;
    const vid = e.vanillaId ?? 0;
    const scale = Renderer.HB_BIG_SCALE.has(vid) ? 1.5 : 1;
    const x = e.cx - 18 * scale;
    const y = e.y + e.h + 10 + (Renderer.HB_ADD_H[vid] ?? 0);
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
      // 月总族独占分支（Main.cs:24325-24504 case 396/397/398）：头/手/核心各自
      // 带独立锚点与叠层（上臂/前臂/躯干/胸甲/眼/破体帧），通用路径锚点不对
      if (e.vanillaId === 398) { this.drawMoonLordCore(e, entities); return; }
      if (e.vanillaId === 397) { this.drawMoonLordHand(e, entities); return; }
      if (e.vanillaId === 396) { this.drawMoonLordHead(e); return; }
      // 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554）：翅膀/双臂/
      // 二阶段覆层独占——通用路径只画本体，缺背后大翼与攻击态手臂帧
      if (e.vanillaId === 636) { this.drawEmpress(e); return; }
      const frames = Math.max(1, e.vanilla?.frames ?? 1);
      const frameIdx = vanillaFrameIdx(e, frames);
      const r = this.atlas.vnpc(e.vanillaId, frameIdx);
      if (r) {
        const flying = !!e.vanilla?.noGravity; void flying; // 中心锚后地面/飞行统一,仅保留语义注释
        // 原版 NPC.scale（SetDefaults base × netID scale）——作用于碰撞盒与渲染
        const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
        ctx.save();
        // 锚点:飞行型=帧中心(原版默认分支 Main.cs:23635 语义);地面型=底锚+逐帧
        // 实测底部透明行数补偿(spriteBottomPad)——NPC 帧底普遍 ~2px 透明边距,
        // 裸底锚会悬空 2px、中心锚会入地 2px(实测反馈),pad 补偿数学上保证贴地。
        // 与纸娃娃(:1266)/legacy(:1301)/小动物(:763)四路统一
        const grounded = !flying;
        ctx.translate(e.cx, grounded ? e.y + e.h : e.cy);
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
        else if (e.vanilla?.aiStyle === 5) {
          // AI_005 旋转按族分流（cs:51045-51054 + FindFrame 蜜蜂覆盖 L75553）：
          // 黄蜂 42/231-235、孢子蝠 176、205 仅倾斜 vx*0.1（不随飞行方向转头）；
          // 蜜蜂 210/211 倾斜 vx*0.2；其余（噬魂怪族等）朝目标/速度方向转头。
          // 全族统一转头会让黄蜂蜜蜂飞行中整只倒转=贴图翻转观感
          const id5 = e.vanillaId;
          if (id5 === 42 || id5 === 176 || id5 === 205 || (id5 >= 231 && id5 <= 235)) ctx.rotate(e.vx * 0.1);
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
        else if (stR === 108 || stR === 110) ctx.rotate(e.visAngle); // AI_108 俯冲飞行族(cs:66120 速度角±π折叠)/AI_110 Betsy(cs:62714 AngleTowards):均保留 spriteDirection 镜像
        else if (rotId) ctx.rotate(e.spin);
        ctx.scale(scale, scale);
        if (!rotationDriven && e.facing > 0) ctx.scale(-1, 1); // 原版默认朝左；旋转族（rotationDriven）禁镜像
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
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY + eocOff, r.sw, r.sh);
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
        this.drawNpcGlow(e, r);
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
        this.drawEnemyHpBar(e);
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
    this.drawEnemyHpBar(e);
    void world;
  }

  /** Arm_Bone.png 懒加载（骷髅王臂骨；vanilla 独立贴图，非 NPC 表） */
  private armBoneImg: HTMLImageElement | null | undefined;

  // ===================== NPC GlowMask 体系（Main.cs DrawNPC 硬编码发光层） =====================
  // 原版 NPC 无通用 glowMask 字段（与 Projectile/Item 不同）：发光层是 DrawNPC 里
  // 逐类型硬编码的 TextureAssets.GlowMask[N] 二次 Draw。下表为全量对照（1.4.5.6
  // Main.cs:23099/23480/23594/23746-23776/23878-23886/24218-24226/24531-24535）：
  //   mode 'frame'   同帧整图叠加（火星飞碟族/Betsy/暗黑魔法师/永恒水晶/银河织带）
  //   mode 'vel4'    以速度向量四向旋转偏移画 4 份灰 A=64 拷贝（四塔 + 火星飞骑 416）
  // 未接（登记）：Glow_100/101（case 94 前）、Glow_154（case 384 拖尾）、Glow_146
  // （case 662 族）、Glow_156（火星飞骑 416 :24531-24535，同 vel4 模式但锚点是
  // 底心 +4px 特例）——前三处依赖 oldPos 拖尾链，本渲染层无逐 NPC 历史缓冲；
  // Projectile glowMask（:34327-34378）与 Item glowMask（:38072-38213）不在本批。
  private static readonly NPC_GLOW: Record<number, { tex: string; mode: 'frame' | 'vel4' }> = {
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
  };

  /** GlowMask 叠画：与基础精灵同一变换（调用点在 drawEnemy 的 save 块内，
   *  原点=精灵锚点），按表内 mode 分流。additive（XNA 默认 AlphaBlend + 贴图
   *  自带发光色的语义，用 lighter 还原"叠加提亮"观感） */
  private drawNpcGlow(e: Enemy, r: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }) {
    if (!this.atlas) return;
    const g = Renderer.NPC_GLOW[e.vanillaId ?? -1];
    if (!g) return;
    const gr = this.atlas.vmisc(g.tex);
    if (!gr) return;
    const ctx = this.ctx;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (g.mode === 'frame') {
      // 同帧整图叠加：源矩形取 Glow_N 的对应帧带（Glow 表帧高 = 表高/帧数；
      // 与 NPC 表帧高的逐像素对齐未逐一校验——登记，观感为发光罩层）
      const gh = Math.max(1, Math.floor(gr.sh / Math.max(1, e.vanilla?.frames ?? 1)));
      const idx = Math.min((e.vanilla?.frames ?? 1) - 1, Math.floor(r.sy / Math.max(1, r.sh)));
      let alpha = 0.8;
      let flashPulse = 1;
      if (e.vanillaId === 551) { alpha = (66 / 255) * 1.3; }              // :23099 A=66 ×(0.7+0.3*lerp)
      else if (e.vanillaId === 564 || e.vanillaId === 565) { alpha = 0.5 * opacity; } // :23484 white.A/2×Opacity
      else if (e.vanillaId === 548) {
        // :23590-23596 num63/65 三秒呼吸三角波 ×0.6 紫底（(140,50,255)）
        const t3 = (performance.now() / 1000) % 3 / 3;
        flashPulse = t3 > 0.5 ? 1 - t3 : t3;
        alpha = 0.6 * Math.max(0, flashPulse);
      } else alpha = 0.78;                                                  // Color(200,200,200,0)/白色系通用
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(gr.img, gr.sx, Math.min(gr.sh - gh, idx * gh), gr.sw, gh,
        -r.sw / 2, -r.sh / 2, r.sw, r.sh);
    } else {
      // vel4：velocity.RotatedBy(k*π/2) × num 偏移画 4 份（:23750/:23850 Color(64,64,64,0)）
      // ——原版在世界坐标偏移，此处转回本变换局部坐标（当前原点=精灵锚点，需平移 (cx,cy)-锚）
      const num = 4 + 0 * 4; // (GetAlpha-0.5).Length()*4 光照项恒 0（我们无逐 NPC 光照）
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        // 世界坐标偏移 → 本变换局部（当前原点=精灵锚点，除 scale 还原）
        const dx = ((e.vx * Math.cos(a) - e.vy * Math.sin(a)) * num) / scale;
        const dy = ((e.vx * Math.sin(a) + e.vy * Math.cos(a)) * num) / scale
          + (e.vanillaId === 517 ? 2 : 0);
        ctx.drawImage(gr.img, gr.sx, gr.sy, gr.sw, gr.sh, -r.sw / 2 + dx, -r.sh / 2 + dy, r.sw, r.sh);
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
  private drawEnemyHpBar(e: { hp: number; maxHp: number; cx: number; y: number; h: number }) {
    if (e.hp <= 0 || e.hp >= e.maxHp) return;
    const ctx = this.ctx;
    let r = e.hp / e.maxHp;
    if (r > 1) r = 1;
    const fill = Math.min(36, Math.max(3, Math.floor(36 * r)));  // num2：填充宽（min 3）
    const x = Math.round(e.cx - 18);                             // num3 = X - 18*scale
    const y = Math.round(e.y + e.h);                             // 实体脚下（经典锚点）
    const n = r - 0.1;                                           // ratio 偏移（:21771）
    const cr = n > 0.5 ? Math.round(255 * (1 - n) * 2) : 255;
    const cg = n > 0.5 ? 255 : Math.round(255 * n * 2);
    const rgb = (mul: number) => `rgb(${Math.min(255, Math.round(cr * mul))},${Math.min(255, Math.round(cg * mul))},0)`;
    ctx.globalAlpha = 0.95;                                      // alpha×0.95（光照亮度并入常量）
    // 背景空槽（Hb2 等价：暗框+同色调暗填充）
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, 38, 5);
    ctx.fillStyle = rgb(0.45);
    ctx.fillRect(x, y, 36, 3);
    // 前景填充（Hb1 等价：全亮同色 tint）
    ctx.fillStyle = rgb(1);
    ctx.fillRect(x, y, fill, 3);
    ctx.globalAlpha = 1;
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

  private drawTownNPC(n: TownNPC) {
    const ctx = this.ctx;
    // 血条与怪物同规（原版 DrawInterface_14 对 friendly NPC 同函数绘制：
    // life != lifeMax 即常驻显示——城镇 NPC 受伤掉血后可见；贴图条加载未就绪也照画）
    this.drawEnemyHpBar(n);
    // ---- 原版贴图条（Images/NPC_{id}，40×56 帧、默认朝左）：帧语义见 TownNPC.fixedUpdate ----
    // 注意：不再回退 Maples 角色/NPC_1.png——那是原版绿史莱姆贴图（Maples 沿用原版命名），
    // 曾导致全部城镇 NPC 显示为史莱姆
    if (this.atlas) {
      const r = this.atlas.vnpc(n.vanillaId, n.frame);
      if (r) {
        ctx.save();
        // 底锚 + 逐帧实测底部透明行数补偿(spriteBottomPad):帧底 ~2px 透明边距
        // 裸底锚悬空 2px、中心锚入地 2px(实测反馈)——pad 补偿保证贴地,
        // 与怪物(:854)/纸娃娃(:1266)/legacy(:1301)统一
        const pad = this.spriteBottomPad(r, `npc${n.vanillaId}:f${n.frame}`);
        ctx.translate(n.cx, n.y + n.h); // 脚底中心
        if (n.facing > 0) ctx.scale(-1, 1); // 原版贴图默认朝左，向右镜像
        if (n.iframes > 0 && n.iframes % 4 < 2) ctx.filter = 'brightness(2.5)'; // 受击闪白
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh + pad, r.sw, r.sh);
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
  private drawPlayer(p: Player, world: World, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number } | null) {
    const ctx = this.ctx;
    if (p.dead) return;
    // ---- 手持物（PlayerDrawLayers.cs:3857 门槛）：itemAnimation>0 || (holdStyle!=0) ----
    // 武器/工具 holdStyle=0 → 仅使用中渲染（下方挥舞动画）；火把/荧光棒族 holdStyle=1、
    // 雨伞族 holdStyle=2 等静持时也渲染（ItemCheck_ApplyHoldStyle :49496 逐值持位）；
    // noWet（火把 noWet=true）→ 水下不显示（与手持光源熄灭同步）。
    // holdStyle 数据源 = vanilla-itemfunc（40 件）∪ DefaultToTorch 批量族（提取漏，
    // HOLD_STYLE_ITEMS 手工补）；7 无持位分支（仅 bodyFrame 行 11）不画
    let staticHoldStyle = 0;
    if (!swing) {
      const held = p.inv.heldItem();
      const def = held ? ITEM_DEFS[held.id] : undefined;
      if (held && def && !p.inWater) {
        const vid = def.key === 'torch' ? 8 : viIdFromKey(def.key);
        const hs = vid >= 0 ? itemFuncOfVid(vid)?.holdStyle ?? (HOLD_STYLE_ITEMS.has(vid) ? 1 : 0) : 0;
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
    if (p.iframes > 0 && p.iframes % 6 < 2) ctx.globalAlpha = 0.45;
    // 跨台阶时用渲染补偿高度（从旧高度缓升），消除物理瞬移的顿挫感；
    // 联机远端叠加 netOffset（原版 Player.netOffset 平滑收敛，本地玩家恒 0）
    ctx.translate(p.cx - p.facing * 2.5 + p.netOffX, p.y + p.h + p.stepRenderY + p.netOffY); // 脚底中心（精灵后移2.5px = 碰撞盒微前移）
    ctx.scale(p.facing, 1);

    // ---- 纸娃娃帧（捏人外观优先，M7；20 帧表默认朝右，与 NPC 相反不做内层翻转） ----
    // use 期间 bodyFrame 行（Player.cs:35874-35990 itemAnimation>0 分支逐 useStyle）：
    // 返回 -1 = 该族不改 bodyFrame（useStyle 10/14/15 与无匹配分支的 16），走常规动画行
    const useRow = swing ? this.useStyleBodyRow(swing, p) : -1;
    let drawn = false;
    if (p.appearance) {
      const doll = compositePaperDoll(p.appearance, dollEquipFromInv(p.inv, this.atlas));
      if (doll) {
        let row = 0; // 0 站立
        if (useRow >= 0) row = useRow;
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
    // 使用类物品（托举：药水/方块等非工具）：身体前方图层，避免被身体挡住
    if (swing && swing.item >= 0 && !ITEM_DEFS[swing.item]?.tool) {
      this.drawUseItem(ctx, p, swing);
    }

    // 气口气泡：头部浸水时显示（在朝向变换外绘制——左右移动不镜像），
    // 随气量消散；整体更透明
    if (p.headUnderwater || p.breath < 5 || p.refillT >= 0) {
      const gap = 12.5; // 间距 12.5px，气泡直径 11px，留 ~1.5px 视觉分隔
      const baseX = p.cx - (5 * gap) / 2 + gap / 2, baseY = p.y - p.h * 0.4 - 14;
      // 优先原版 Bubble.png（22×22，不透明），程序化圆仅兜底
      const bub = this.atlas ? this.atlas.vmisc('vanilla/Bubble.png') : null;
      // 平滑气量 = (气口-1) + 当前正在消耗那颗的剩余比例 → 逐个渐隐（不画已耗尽的）。
      // 直接 breath+drain 会在扣气瞬间把气泡重新顶满一格
      // 水下：平滑消耗（当前颗渐隐）；出水：0.8s 快速补满动画
      let display: number;
      if (p.refillT >= 0) {
        // 从余量处起填：refillFrom + 缺口 × 进度（不从第一颗重新冒）
        display = p.refillFrom + (5 - p.refillFrom) * p.refill01;
      } else {
        const drain = p.headUnderwater && p.breath > 0 ? p.breathDrain01 : 1;
        display = p.breath - 1 + drain;
      }
      // 5 个槽位固定占位（消耗时槽位不挪动，只是该槽的气泡渐隐消失）
      for (let b = 0; b < 5; b++) {
        const v = display - b; // 该颗的可见度：≥1 满，0..1 渐隐，≤0 跳过
        if (v <= 0) continue;
        const bx = baseX + b * gap;
        const by = baseY;
        ctx.globalAlpha = Math.min(1, v);
        if (bub) {
          ctx.drawImage(bub.img, bub.sx, bub.sy, bub.sw, bub.sh, bx - 5.5, by - 5.5, 11, 11);
        } else {
          ctx.fillStyle = '#BFE3FF';
          ctx.beginPath();
          ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(bx - 1.5, by - 1.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    void world;
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
        // :35986-36005：默认行3；itemRotation*dir < -0.75 → 行2、> 0.6 → 行4
        const n21 = (swing.aim ?? 0) * p.facing;
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
  private drawUseItem(ctx: CanvasRenderingContext2D, p: Player, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number }) {
    const ar = this.atlasIcon(swing.item);
    const icon = ar ? null : this.itemIcon(swing.item);
    const pAnim = Math.min(1, Math.max(0, swing.t / swing.dur));
    const fw = ar ? ar.sw : 14, fh = ar ? ar.sh : 14;
    const us = swing.useStyle ?? 1;
    // → { rot, offX, offY }（dir=1 空间）；hide = 原版把 itemLocation 挪到 -1000（不画）
    let rot = 0, offX = 0, offY = 0, hide = false;
    switch (us) {
      case 1: {
        // useStyle=1（:49939-50108）1:1：约 200° 线性挥砍弧 + 三段持位
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        const xTier = (w: number, phase: 0 | 1 | 2) => phase === 0
          ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 14 : 10
          : phase === 1
            ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 18 : 10
            : w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w >= 48 ? 18 : w > 32 ? 14 : 6;
        const yTier = (h: number, phase: 0 | 1 | 2) => phase === 0 ? 24
          : h > 64 ? 14 : h > 52 ? 12 : phase === 1 && h > 32 ? 8 : 10;
        if (pAnim > 2 / 3) { offX = fw * 0.5 - xTier(fw, 0); offY = yTier(fh, 0); }
        else if (pAnim > 1 / 3) { offX = fw * 0.5 - xTier(fw, 1); offY = yTier(fh, 1); }
        else { offX = -(fw * 0.5 - xTier(fw, 2)); offY = yTier(fh, 2); }
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
        // 雨伞（:50279-50312）：收势段（pAnim>0.666）itemLocation=-1000 不画
        if (pAnim > 0.666) { hide = true; break; }
        rot = 0.8;
        offX = fw * 0.5 - 4 - Math.max(pAnim * fw * 1.2 - 10, 8);
        offY = 24;
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
        rot = swing.aim ?? 0;
        const vid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid === 3779) { offX = 6; offY = p.h * 0.5 + 6; }          // :50343
        else if (vid === 4262) { offX = -6; offY = p.h * 0.5 - 6; }    // :50349
        else if (vid >= 0 && STAFF_ITEMS.has(vid)) {
          offX = Math.cos(rot) * 6;
          offY = p.h * 0.5 + Math.sin(rot) * 6;
        } else {
          offX = -2;
          offY = p.h * 0.5 - fh * 0.5;
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
        break;
      }
      case 13: {
        // 短剑突刺（:50423-50446）：复合手臂持位 GetFrontHandPosition(stretch, aim-π/2)，
        // stretch 按 1-pAnim 档 Quarter(6)/ThreeQuarters(8)/Full(10)；绘制旋转 = aim
        const n24 = 1 - pAnim;
        const mult = n24 <= 0.33 ? 6 : n24 <= 0.66 ? 8 : 10;
        rot = swing.aim ?? 0;
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
        // 7/8/10/11/12 等未入表族（本批物品无）回退 useStyle 1 挥砍
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        offX = fw * 0.5 - 10;
        offY = 24;
        break;
      }
    }
    if (hide) return;
    ctx.save();
    ctx.translate(p.cx + p.facing * offX, p.y + offY);
    if (p.facing === -1) ctx.scale(-1, 1); // 镜像空间：旋转自动随镜像取反（与原版 -direction 因子等价）
    ctx.rotate(rot);
    if (ar) {
      // 原版 origin = (W*0.5 − W*0.5*dir, H)（PlayerDrawLayers.cs:3260）：
      // dir=1 → 底左角 / dir=−1 → 底右角钉在 itemLocation（握点）旋转——
      // 镜像空间里统一画在 (0,−fh) 即底左角=握点，镜像自动翻成底右角
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, -fh, ar.sw, ar.sh);
    } else if (icon) {
      ctx.drawImage(icon, 0, -14, 14, 14);
    }
    ctx.restore();
  }

  private runFramesCache: ReturnType<SpriteAtlas['animFrames']> | null = null;
  private actionFramesCache: Record<string, ReturnType<SpriteAtlas['rect']>> | null = null;

  /** Extra_48 表情总表（272×1092）懒加载——原版 TextureAssets.Extra[48] */
  private emoteSheetImg: HTMLImageElement | null = null;
  private emoteSheet(): HTMLImageElement | null {
    if (!this.emoteSheetImg) {
      const im = new Image();
      im.onload = () => { /* 就绪 */ };
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

  // ---- 原版小地图框（MinimapFrame/MinimapFrameManager 1:1，Default 皮肤） ----
  // DrawBackground: MinimapPosition-6 处 244×244 黑底；DrawForeground: 框贴图(256×264)
  // 画在 MinimapPosition+frameOffset(-8,-15)；按钮(18×18)仅悬停时显示（IsHighlighted）
  private minimapFrameTex = this.loadUiTex('UI_Minimap_Default_MinimapFrame');
  private minimapBtnReset = this.loadUiTex('UI_Minimap_Default_MinimapButton_Reset');
  private minimapBtnZoomIn = this.loadUiTex('UI_Minimap_Default_MinimapButton_ZoomIn');
  private minimapBtnZoomOut = this.loadUiTex('UI_Minimap_Default_MinimapButton_ZoomOut');
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

  /** Default 皮肤按钮位（MinimapFrameManager.CreateAndAdd "Default"：+num 2/6 修正） */
  private static readonly MINIMAP_BTN_POS = {
    reset: [150, 240], zoomIn: [202, 240], zoomOut: [176, 240],
  } as const;

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

  private drawMinimap(ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player, clock: Clock) {
    if (!this.minimap) return;
    this.minimap.flushDirty();
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
    // 玩家图标
    this.drawPlayerMarker(ctx,
      ox + (px - sx) / viewTiles * size, oy + (py - sy) / viewTiles * size, 10);
    // 框前景（MinimapFrame.DrawForeground：FramePosition = MinimapPosition + frameOffset(-8,-15)）
    const fx = ox + 4 - 8, fy = oy + 4 - 15;
    if (this.minimapFrameTex.complete) ctx.drawImage(this.minimapFrameTex, fx, fy);
    // 按钮：悬停高亮 + 按住生效（MinimapFrame.Update/Click：mouseLeft 持续，×1.025/0.975 步进）
    this.minimapUiHover = false;
    const btns: Array<[HTMLImageElement, readonly [number, number], 'in' | 'out' | 'reset']> = [
      [this.minimapBtnZoomIn, Renderer.MINIMAP_BTN_POS.zoomIn, 'in'],
      [this.minimapBtnZoomOut, Renderer.MINIMAP_BTN_POS.zoomOut, 'out'],
      [this.minimapBtnReset, Renderer.MINIMAP_BTN_POS.reset, 'reset'],
    ];
    for (const [tex, [bx, by], kind] of btns) {
      const cx = fx + bx + 9, cy = fy + by + 9; // 中心；命中盒 22×22（IsTouchingPoint 取 max(size,22)）
      const hovering = Math.abs(this._mouseX - cx) < 11 && Math.abs(this._mouseY - cy) < 11;
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
    this.minimapRect = { x: ox - 2, y: oy - 2, w: size + 4, h: size + 4 };
    // 时间显示
    const hFloat = clock.hourFloat;
    const hh = String(Math.floor(hFloat)).padStart(2, '0');
    const mm2 = String(Math.floor((hFloat % 1) * 60)).padStart(2, '0');
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    const timeText = `\u65f6\u95f4 ${hh}:${mm2}`;
    ctx.strokeText(timeText, ox + size / 2, oy + 253 + 14);
    ctx.fillText(timeText, ox + size / 2, oy + 253 + 14);
    // \u5929\u6c14\u6587\u672c\uff08\u539f\u7248 DrawInfoAccs 46236 \u516b\u6863\u94fe\uff1a\u5c0f\u5730\u56fe\u4e0b\u65b9 InfoAccs \u56fe\u6807\u5217\u65c1\u7684\u6587\u672c\uff0c
    // GameUI.Storm/HeavyRain/.../Clear + \u98ce\u5411\uff08EastWind/WestWind = windSpeedCurrent\u00d750 \u53d6\u6574\uff09
    // + \u6c99\u5c18\u66b4\u95ea\u70c1"Sandstorm +"\u3002\u5e03\u5c40\u5bf9\u9f50\uff1a\u65f6\u95f4\u884c\u4e0b\u65b9\u4e00\u884c\u5c45\u4e2d\uff08\u539f\u7248\u540c\u4e3a minimap \u4e0b\u533a\uff09
    if (world.weather) {
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
    const mx = this._mouseX, my = this._mouseY;
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
  private drawPlayerMarker(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    let fw: number, fh: number, img: CanvasImageSource;
    const atlasFrame = this.atlas ? this.atlas.rect('角色/Player.png', 'Player_0') : null;
    if (atlasFrame) {
      img = atlasFrame.img; fw = atlasFrame.sw; fh = atlasFrame.sh;
    } else {
      const sheet = this.assets.playerSheet;
      img = sheet; fw = this.assets.playerFrameW; fh = this.assets.playerFrameH;
    }
    const aspect = fw / fh;
    const h = size, w = size * aspect;
    ctx.drawImage(img, 0, 0, fw, fh, x - w / 2, y - h / 2, w, h);
  }

  /** 全屏地图：半透明背景 + 完整世界图 + 边框 + 操作提示；支持拖动/缩放 */
  drawFullMap(ctx: CanvasRenderingContext2D, world: World, mouseX: number, mouseY: number, mouseDown: boolean) {
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
    // 与玩家 zone 选表；贴图 vui() 懒加载首帧 null → 次帧补上（兜底深色）
    const bgTex = this.atlas ? this.atlas.vui(`MapBG${this.fullMapBgIndex(world) + 1}`) : null;
    if (bgTex) {
      ctx.drawImage(bgTex.img, bgTex.sx, bgTex.sy, bgTex.sw, bgTex.sh, 0, 0, viewW, viewH);
    } else {
      ctx.fillStyle = 'rgba(8,6,16,0.92)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // 卷轴底图（原版 Images/Map.png 928×248 羊皮纸，Main.cs:54923：地图内容【之下】
    // 整幅绘制——destRect 与地图区同位同缩放，羊皮纸边缘饰纹在地图缩放留边处露出；
    // 地图探索未达区域在卷轴上呈现纸张色而非纯蓝）
    const scroll = this.atlas ? this.atlas.vui('Map') : null;
    if (scroll && scroll.img instanceof HTMLImageElement && scroll.img.complete && scroll.img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true; // 卷轴是美术图，平滑缩放防像素锯齿
      ctx.drawImage(scroll.img, scroll.sx, scroll.sy, scroll.sw, scroll.sh, cx0, cy0, mapW, mapH);
    }
    ctx.imageSmoothingEnabled = fm.zoom >= 1;
    ctx.drawImage(this.minimap!.canvas, cx0, cy0, mapW, mapH);
    ctx.imageSmoothingEnabled = false;
    // 迷雾
    this.drawFog(ctx, world, cx0, cy0, fm.zoom, 2 * fm.zoom);
    // 玩家位置标记（醒目：脉冲圆环 + 白箭头 + 文字）
    const p = this._lastPlayer;
    if (p) {
      this.drawFullMapPlayerMarker(ctx, cx0 + p.cx / TILE * fm.zoom, cy0 + p.cy / TILE * fm.zoom);
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
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#C8C0D8';
    ctx.textAlign = 'center';
    ctx.fillText(Lang.text('Mods.SandboxWorld.Map.Hint'), viewW / 2, viewH - 16);
  }
  private _mapInit = false;

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
  private drawFullMapPlayerMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const t = performance.now() * 0.004;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    // 外圈脉冲环（由内向外扩散渐隐）
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pulse)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 16 + 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    // 常驻细环
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    // 原版风格向下箭头（黑描边白填充，指示"我在这里"）
    const s = 9;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 1.6);
    ctx.lineTo(x - s * 0.85, y - s * 0.5);
    ctx.lineTo(x + s * 0.85, y - s * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.fill();
    // 文字标注（黑描边保证任何底色上可读）
    const label = Lang.text('Mods.SandboxWorld.Map.PlayerLabel');
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(label, x, y - 22);
    ctx.fillStyle = '#FFF';
    ctx.fillText(label, x, y - 22);
  }
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

  /** 入侵进度条（原版进度已完成的百分比；Boss 条下方 30px） */
  private drawInvasionBar(ctx: CanvasRenderingContext2D, viewW: number, invasion: { name: string; pct: number }) {
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
    ctx.fillText(`${invasion.name}  ${Math.floor(Math.max(0, Math.min(1, invasion.pct)) * 100)}%`, viewW / 2, y + 15);
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
