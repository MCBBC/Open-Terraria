// 游戏主控制器：状态、主循环、挖掘/放置/战斗/生成/存档的总装
import { TILE, SPAWN_MIN_DIST, SPAWN_MAX_DIST } from './constants';
import { RNG } from './rng';
import { Input } from './Input';
import { buildAssets, AssetBundle } from '../assets/AssetGen';
import { World, ChestData } from '../world/World';
import { breakHiveBlock, larvaSummonInRange } from '../world/hive';
import { generateWorld } from '../world/gen/WorldGen';
import { openDoor, closeDoor, clearDoorAt, shiftTallGate } from '../world/Door';
import { torchAnchorFrame, torchStillAnchored } from '../world/Torch';
import { findFreeHouse } from '../world/Housing';
import { TileStore } from '../world/TileStore';
import { Wiring, TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR, TOOL_CUTTER } from '../world/Wiring';
import { attachDevices, geyserTrap } from '../world/wiring/devices';
import { ITEM_MAP } from '../wld/WldImport';
import { TILE_DEFS, T, TILE_BY_KEY } from '../data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { vanillaNpc, vanillaItemKey, TOWN_NPC_IDS } from '../data/vanillaNpcs';
import { itemCombat, AMMO_ARROW, combatWeapon, thrownCombat, viIdFromKey, projGravity, type CombatWeapon } from '../data/vanillaItemCombat';
import { projectileData } from '../data/vanillaProjectiles';
import { VanillaSpawner } from '../world/spawn/VanillaSpawner';
import { ENEMY_DEFS } from '../data/enemies';
import { RECIPES } from '../data/recipes';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { scanScene, type SceneFlags } from '../world/SceneMetrics';
import { pickMusic, newMusicState, bossMusicFor, type MusicState } from '../data/Music';
import { Tombstone } from '../entities/Tombstone';
import { Lang } from '../i18n/Lang';
import { clearPaperDollCache } from '../player/PaperDoll';
import { createDeathText } from '../i18n/RandomText';
import { Critter } from '../entities/Critter';
import { CRITTER_DEFS } from '../data/critters';
import { EntityManager, Entity } from '../entities/Entity';
import { Camera } from '../render/Camera';
import { ChunkCache } from '../render/ChunkCache';
import { Renderer, Particle, DamageNumber, Minimap } from '../render/Renderer';
import { LightingEngine } from '../lighting/LightingEngine';
import { Inventory, ACCESSORY_START, ARMOR_START } from '../items/Inventory';

// 导入的原版树族 tile（fellImportedTree 整棵砍伐）：普通树 + 宝石树 + 装饰树 + 灰烬树
const IMPORTED_TREE_TYPES = new Set<number>(
  ['v_5_trees',
    'v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree',
    'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree',
    'v_596_vanity_tree_sakura', 'v_616_vanity_tree_yellow_willow', 'v_634_ash_tree',
    'v_72_mushroom_tree', 'v_323_palm_trees']
    .map((k) => TILE_BY_KEY[k])
    .filter((v): v is number => v !== undefined),
);
import { LiquidSim } from '../world/liquid/LiquidSim';
import { settleWorldLiquids } from '../world/liquid/settle';
import { WorldGenClient, WorldGenUnavailable } from '../workers/WorldGenClient';
import { BuffType } from '../stats/Buffs';
import { SpriteAtlas, VANILLA_ITEM_ICON_MAP } from '../assets/SpriteAtlas';
import { AutoTiler } from '../render/AutoTiler';
import { VanillaWallTiler } from '../render/VanillaWallTiler';
import { Sfx, SfxName } from './Sfx';
import { HitTile } from './HitTile';
import type { GameHooks } from '../entities/types';
import { Dart } from '../entities/Dart';
import { TrapShot } from '../entities/Dart';
import { Arrow } from '../entities/Arrow';
import { Boomerang, SpearProj, YoyoProj, GrenadeProj } from '../entities/WeaponProj';
import { Minecart } from '../entities/Minecart';
import { MagicProj } from '../entities/MagicProj';

const FIXED_DT = 1 / 60;
/** 原版 AmmoID.Bullet（与 AMMO_ARROW=40 同源，AmmoID.cs） */
const AMMO_BULLET = 14;

// ---- 原版 Main.tileCut 可砍集合（Main.cs:7312-7754 全表 38 项，经 vanilla.sheet 反查内部 id） ----
// 挥击范围内命中即 KillTile：杂草/藤蔓/药草芽等直接碎，瓦罐(28)走整罐碎裂+掉落
const TILE_CUT_VANILLA = new Set([
  654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61, 62, 69, 655,
  71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638, 444, 485,
]);
const TILE_CUT = new Set<number>(
  TILE_DEFS.reduce<number[]>((acc, d, id) => {
    if (d.vanilla && TILE_CUT_VANILLA.has(d.vanilla.sheet)) acc.push(id);
    return acc;
  }, []),
);
const POT_TILE = TILE_BY_KEY['pot'] ?? -1;

/** 就地剔除 life<=0 的粒子/飘字(保序零分配,2026-08 审计 G9) */
function compactByLife<T extends { life: number }>(list: T[]): void {
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    if (list[r].life > 0) list[w++] = list[r];
  }
  list.length = w;
}

export interface GameCallbacks {
  onWorldReady: () => void;
  onInventoryChanged: () => void;
  onToast: (msg: string) => void;
  /** 原版 Main.NewText 消息列(Main.cs:64095 → LegacyChatMonitor;RGB 0-255) */
  onChat?: (text: string, r: number, g: number, b: number) => void;
  /** NPC 对话框(SetTalkNPC):name/chat/buttons → UI 渲染 */
  onNpcDialog?: (name: string, chat: string, buttons: Array<{ id: 'shop' | 'heal' | 'curse' | 'close'; label: string }>) => void;
  onNpcDialogClose?: () => void;
  /** 商店面板(SetupShop):条目(图标由 UI 按原版 id 补)+ 当前铜币 */
  onNpcShop?: (title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number }>, copper: number) => void;
  onBuffsChanged?: () => void;
  /** 读墓碑/告示牌（Sign 阅读界面） */
  onReadSign?: (text: string) => void;
  onDayNight?: (isDay: boolean) => void;
  /** 环境选曲变化（MusicID；0=静音）。原版 UpdateAudio_DecideOnNewMusic 驱动 */
  onMusic?: (musicId: number) => void;
}

export class Game implements GameHooks {
  assets: AssetBundle;
  atlas: SpriteAtlas | null = null;
  autotiler: AutoTiler | null = null;
  world!: World;
  player!: Player;
  camera!: Camera;
  renderer: Renderer;
  chunks!: ChunkCache;
  lighting!: LightingEngine;
  liquid!: LiquidSim;
  entities = new EntityManager();
  input: Input;
  cb: GameCallbacks;
  sfx = new Sfx();

  running = false;
  paused = false;
  private acc = 0;
  private lastTime = 0;
  private tickCount = 0;

  // 挖掘状态
  private mining: { x: number; y: number; progress: number } | null = null;
  /** 当前挖掘目标的硬度缓存（进度归一化用） */
  private hardnessCache = 1;
  /** 原版 HitTile 伤害积累（劈砍/挖掘通用，阈值 100） */
  private hitTiles = new HitTile();
  private lastMineHitTick = -999;
  swing: { t: number; dur: number; item: number; dmg?: number; kb?: number } | null = null;
  private swingHitSet = new Set<number>();
  /** 同一挥击内 tileCut 格只处理一次（与 swingHitSet 同生命周期） */
  private swingTileCutSet = new Set<number>();

  // 弹药
  particles: Particle[] = [];
  dmgNumbers: DamageNumber[] = [];

  // 敌人生成
  boss: Enemy | null = null;
  /** 本局世界是否新生成(NPC 入驻公告只在新世界播) */
  private freshlyCreated = false;
  /** 原版 Spawner 移植实例（VanillaSpawner.ts） */
  vanillaSpawner: VanillaSpawner | null = null;
  /** 世界生成 worker 客户端（懒建；不可用时 newWorld 走主线程 fallback） */
  private genClient: WorldGenClient | null = null;
  /** tile key → id 反查表（调试句柄/wld 导入映射用） */
  tileByKey = TILE_BY_KEY;

  /** 开发者模式：全部道具入包（溢出的落在展示区上方）+ 出生点右侧摆放所有可放置图块供检验 */
  setupDevMode() {
    const p = this.player;
    const st = this.world.store;
    // ---- 1) 全道具入包 ----
    const overflow: Array<[string, number]> = [];
    for (const def of ITEM_DEFS) {
      const n = def.maxStack === 1 ? 1 : Math.min(def.maxStack, 99);
      const left = p.inv.add(ITEM_BY_KEY[def.key], n);
      if (left > 0) overflow.push([def.key, left]);
    }
    // ---- 2) 展示区：出生点右侧清空并逐行摆放全部可放置图块 ----
    const sx = this.world.spawnX, sy = this.world.spawnY;
    const x0 = sx + 6, x1 = sx + 70, yBot = sy - 2, yTop = sy - 40;
    for (let x = x0; x <= x1; x++) {
      for (let y = yTop; y <= yBot; y++) {
        st.setTile(x, y, 0);
        st.setLiquid(x, y, 0, 0);
      }
      st.setTile(x, yBot, T.STONE);
      st.setTile(x, yBot + 1, T.STONE);
    }
    // 收集可放置 tile（有物品指向，去重）
    const placeable: number[] = [];
    const seen = new Set<number>();
    for (const def of ITEM_DEFS) {
      if (!def.tile) continue;
      const tid = TILE_BY_KEY[def.tile];
      if (tid === undefined || tid === 0 || seen.has(tid)) continue;
      seen.add(tid);
      placeable.push(tid);
    }
    // 逐行摆放：行高 7（最高家具 5 格 + 间隙），每行放满换行并铺新地板
    let cx = x0 + 1, cy = yBot - 1;
    const rowH = 7;
    for (const tid of placeable) {
      const td = TILE_DEFS[tid];
      const w = td.vanilla?.fw ?? td.w ?? 1;
      const h = td.vanilla?.fh ?? td.h ?? 1;
      if (cx + w > x1 - 1) {
        cx = x0 + 1;
        cy -= rowH;
        for (let x = x0; x <= x1; x++) st.setTile(x, cy, T.STONE);
      }
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          // 原版帧语义（TileObject.Place）：顶行 frameY=0，底行最大——
          // 此处 cy 是底部行，dy=0 是底行 → frameY = (h-1-dy)*18
          st.setTile(cx + dx, cy - dy, tid, td.vanilla ? dx * 18 : dx, td.vanilla ? (h - 1 - dy) * 18 : dy);
        }
      }
      cx += w + 1;
    }
    // ---- 3) 溢出道具以掉落物排在展示区上方（背包 40 格装不下的部分） ----
    let dxDrop = x0;
    let dyDrop = yTop + 3;
    for (const [key, n] of overflow) {
      this.spawnDrop(dxDrop * TILE + 8, dyDrop * TILE, key, n, 0, 0);
      dxDrop += 2;
      if (dxDrop > x1 - 1) { dxDrop = x0; dyDrop += 3; }
    }
    this.cb.onInventoryChanged();
    this.cb.onToast(`开发者模式：${overflow.length} 种道具背包装不下，已排在展示区上方；全部可放置图块在出生点右侧`);
  }

  // NPC 系统
  private housingCheckTimer = 0;
  guideSpawned = false;
  private lastWasDay: boolean | null = null;
  /** 环境采样结果（SceneMetrics；BGM/群系背景共用），每 15 tick 刷新 */
  scene: SceneFlags = { tileX: 0, tileY: 0, belowSurface: false, zoneSkyHeight: false, zoneOverworldHeight: false, zoneDirtLayerHeight: false, zoneRockLayerHeight: false, zoneUnderworldHeight: false, zoneCorrupt: false, zoneCrimson: false, zoneHallow: false, zoneJungle: false, zoneSnow: false, zoneDesert: false, zoneGlowshroom: false, zoneMeteor: false, zoneGraveyard: false, zoneDungeon: false, zoneTemple: false, zoneBeach: false, zoneUndergroundDesert: false, townNPCCount: 0 };
  private musicState: MusicState = newMusicState();
  private lastMusic = -1;
  private _mapClickLatch = false;
  private _mapClickLatch2 = false;
  /** 地图内按压起点（松开时与当前位置比对 <6px 判定为点击，否则是拖动） */
  private _mapPressX = 0;
  private _mapPressY = 0;
  private _tpTarget: { x: number; y: number } | null = null;
  // 方块标注模式（F5）：点击标记问题方块，导出标注+地图给开发者定位
  annotateMode = false;
  waterCandleNear = false;
  heldWaterCandle = false;
  trackTile = TILE_BY_KEY['v_314_minecart_track'] ?? 0;
  minecart: import('../entities/Minecart').Minecart | null = null;
  trapCooldown = new Map<string, number>();
  plateLatch = new Set<string>();
  /** 压板/测重板每 tick 复用缓冲(2026-08 审计 G9,清零复用) */
  private _platePressed = new Set<string>();
  private _weightedStanding = new Set<number>();
  private _entityPlatePressed = new Set<string>();
  /** 电路系统(Wiring.cs 移植) */
  wiring: Wiring | null = null;
  /** 多彩扳手/宏伟蓝图当前模式(TOOL_* 位组合;R 键循环) */
  wireToolMode = TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW;
  /** 宏伟蓝图拖拽锚点(tile 坐标) */
  grandAnchor: [number, number] | null = null;
  /** 测重板踩踏状态(原版 PressurePlateHelper 进/离双触发) */
  weightedLatch = new Set<number>();
  /** 触发源登记(idx):428 测重板 / 423 感应器 */
  triggerTiles428 = new Set<number>();
  /** 热喷泉 443 登记（原版岩浆流过自动喷发——Main 逐帧扫描上方格；此处 15 tick 采样近似） */
  private geyserTiles = new Set<number>();
  private geyserCd = new Map<number, number>();
  triggerTiles423 = new Set<number>();
  /** 实体踩板去重键(实体id|格):小动物触发压板 + 巨石触发压板/弹幕垫板 */
  private entityPlateLatch = new Set<string>();
  /** F7 强制显示导线 */
  forceShowWires = false;
  // 贴图纠错子模式：点击方块弹出该图块的完整原版贴图表供选帧
  fixTexMode = false;
  // 敌人生成开关（F8）：关闭后不再生成新怪物（已有的不受影响）
  enemySpawnEnabled = true;
  marks: Array<{ x: number; y: number }> = [];
  private _annoLatch = false;

  constructor(root: HTMLElement, cb: GameCallbacks, atlas?: SpriteAtlas | null) {
    this.assets = buildAssets();
    if (atlas) {
      this.atlas = atlas;
      this.autotiler = new AutoTiler(atlas);
    }
    this.renderer = new Renderer(this.assets, atlas);
    this.renderer.attach(root);
    // 音效按需加载（2026-08-10）：不在此预读——播放未命中时后台 fetch+decode、
    // 首播合成兜底；常用战斗/交互声在世界就绪后小集合预热（见 afterWorldLoad），
    // 怪物专属声效随首次受击懒加载
    this.input = new Input(this.renderer.canvas);
    this.cb = cb;
    // 快捷栏数字键：事件驱动（避免单帧内 down+up 被轮询漏掉）
    this.input.keydownHandlers.push((code) => {
      if (this.player && /^Digit[0-9]$/.test(code)) {
        this.player.inv.selected = code === 'Digit0' ? 9 : Number(code.slice(5)) - 1;
        this.cb.onInventoryChanged();
      }
      // 缩放调节
      if (code === 'Equal' || code === 'NumpadAdd') this.setZoom(this.camera?.zoomTarget + 0.15);
      if (code === 'Minus' || code === 'NumpadSubtract') this.setZoom(this.camera?.zoomTarget - 0.15);
      // R:五彩扳手/宏伟蓝图模式循环(红蓝绿黄→剪线→致动器→剪致动器)
      if (code === 'KeyR') {
        const held = this.player?.inv.heldItem();
        if (held && ITEM_DEFS[held.id]?.wireTool && (ITEM_DEFS[held.id]?.key === 'multicolor_wrench' || ITEM_DEFS[held.id]?.key === 'grand_design')) {
          const modes = [
            [TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW],
            [TOOL_CUTTER, TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW],
            [TOOL_ACTUATOR],
            [TOOL_CUTTER, TOOL_ACTUATOR],
          ];
          const cur = modes.findIndex((m) => m.reduce((a, b) => a | b, 0) === this.wireToolMode);
          const next = modes[(cur + 1) % modes.length].reduce((a, b) => a | b, 0);
          this.wireToolMode = next;
          const name = next & TOOL_CUTTER
            ? (next & TOOL_ACTUATOR ? Lang.text('Mods.SandboxWorld.Wire.CutActuator') : Lang.text('Mods.SandboxWorld.Wire.Cut'))
            : next & TOOL_ACTUATOR ? Lang.text('Mods.SandboxWorld.Wire.Actuator') : Lang.text('Mods.SandboxWorld.Wire.All');
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Wire.ToolMode', name));
        }
      }
    });
  }

  // ================= 生命周期 =================

  async newWorld(seedText: string, width: number, height: number, onProgress?: (label: string, p: number) => void, opts?: { name?: string; evil?: -1 | 0 | 1; onWorldPartial?: (world: import('../world/World').World, passIndex: number, passName: string) => void; /** worker 路径的降采样预览帧回调（位图模式） */ onPreview?: (f: import('../workers/WorldGenClient').PreviewFrame) => void }) {
    this.freshlyCreated = true; // NPC 入驻公告只在新生成的世界播(WorldGen 语义)
    const settleLabel = () => Lang.text('Mods.SandboxWorld.Progress.SettleLiquids');
    // ---- worker 路径（generate + settle 一条链在后台完成，UI 全程不卡） ----
    if (!this.genClient) this.genClient = new WorldGenClient();
    if (await this.genClient.probe()) {
      try {
        this.world = await this.genClient.generate(
          { width, height, seedText, name: opts?.name, evil: opts?.evil, preview: !!opts?.onPreview },
          {
            onPreview: opts?.onPreview,
            // 进度区间映射与主线程路径一致：generate 0–0.7、settle 0.72–0.87
            onProgress: (phase, label, p) => {
              if (phase === 'generate') onProgress?.(label, p * 0.7);
              else onProgress?.(settleLabel(), 0.72 + p * 0.15);
            },
          },
        );
        await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.87 + p * 0.13));
        onProgress?.(Lang.text('Mods.SandboxWorld.Progress.Done'), 1);
        this.afterWorldLoad();
        this.cb.onWorldReady();
        return;
      } catch (e) {
        if (!(e instanceof WorldGenUnavailable)) throw e; // 真实业务错误（如 OOM）不吞
        // worker 失败 → 落回主线程路径
      }
    }
    // ---- 主线程 fallback（原路径原样保留：worker 不可用 + 探针依赖） ----
    this.world = await generateWorld({ width, height, seedText, name: opts?.name, evil: opts?.evil, onWorldPartial: opts?.onWorldPartial }, (label, p) => onProgress?.(label, p * 0.7));
    // 水体预沉降：创建世界时全图激活+步进至稳定，带进度条
    onProgress?.(settleLabel(), 0.72);
    await this.settleLiquids((p) => onProgress?.(settleLabel(), 0.72 + p * 0.15));
    // 进图前贴图预载(用户要求:不进图后才动态加载)
    await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.87 + p * 0.13));
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.Done'), 1);
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  /** 进图前统一预载:onWorldReady 之前把首帧画面涉及的贴图全部就位。
   *  图块/墙表按【出生点区域类型扫描】精确预载(半径 240 实测仅 22/378 张表,
   *  而非全量 ~250MB)——远行遇到的类型走懒加载,onVImageLoaded 回调全量标脏
   *  chunk 自动重烘焙;物品图标全量(18MB);角色 = Player_ 全量 + 当前装备的
   *  3 张 Armor 表(换装走懒加载);出生点森林背景 */
  private async preloadSceneAssets(onProgress?: (label: string, p: number) => void): Promise<void> {
    const a = this.atlas;
    if (!a) return;
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadWorldTex'), 0.05);
    // 出生点半径类型扫描:只预载画面涉及的图块/墙表
    const st = this.world.store;
    const { tileSheets, wallIds } = this.collectSheetsAround(this.world.spawnX, this.world.spawnY, 240);
    await Promise.all([
      a.preloadTileSheetsFor(tileSheets, wallIds),
      a.preloadMiscAndNpcs(),
    ]);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadItemIcons'), 0.15);
    // 物品图标（6059 张/24MB）改为后台补齐——不再阻塞进图：渲染/道具栏走
    // vicon→ensureVImage 懒加载（未就绪回退程序化图标，paintSlot 每次刷新自愈升级）；
    // 补齐完成后触发一次背包刷新，把兜底图标原地替换为原版图标
    void a.preloadIcons().then(() => this.cb.onInventoryChanged?.());
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadCharTex'), 0.7);
    // Player_ 全量(纸娃娃全部身体通道) + 仅当前装备的 Armor 表;
    // 换装时 vui 懒加载 + PaperDoll 就绪预检自动兜住
    const armorFiles = new Set<string>();
    for (const id of this.playerPreviewArmor()) {
      if (id == null) continue;
      const def = ITEM_DEFS[id];
      if (!def) continue;
      const vid = VANILLA_ITEM_ICON_MAP[def.key] ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : NaN);
      const entry = Number.isFinite(vid) ? a.vanilla.armorIndex?.[String(vid)] : null;
      if (!entry) continue;
      if (entry.head) armorFiles.add(`Armor_Head_${entry.head}.png`);
      if (entry.body) armorFiles.add(`Armor_Armor_${entry.body}.png`);
      if (entry.legs) armorFiles.add(`Armor_Legs_${entry.legs}.png`);
    }
    await a.preloadUiPrefix(['Player_']);
    await a.preloadUiFiles(armorFiles);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadBg'), 0.9);
    await this.renderer.biomeBg.preloadInitial(this.world);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadBg'), 1);
  }

  /** 区域类型扫描:中心 ±R 内出现的图块 sheet id + 墙 id 集合(出生点预载/传送门共用) */
  private collectSheetsAround(cx: number, cy: number, R: number): { tileSheets: Set<number>; wallIds: Set<number> } {
    const st = this.world.store;
    const tileSheets = new Set<number>();
    const wallIds = new Set<number>();
    for (let x = Math.max(0, cx - R); x < Math.min(st.w, cx + R); x++) {
      for (let y = Math.max(0, cy - R); y < Math.min(st.h, cy + R); y++) {
        const i = st.idx(x, y);
        if (st.flags[i]) {
          const vs = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
          if (vs !== undefined) tileSheets.add(vs);
        }
        if (st.wall[i] > 0) wallIds.add(st.wall[i]);
      }
    }
    // 兜底常驻:草/泥/石表全时有(暴露地表转草、autotile 邻接)
    for (const k of ['dirt', 'stone', 'grass']) {
      const vs = TILE_DEFS[TILE_BY_KEY[k]]?.vanilla?.sheet;
      if (vs !== undefined) tileSheets.add(vs);
    }
    return { tileSheets, wallIds };
  }

  /** 预载期的装备槽位(此时 player 尚未创建,读初始装备常量:afterWorldLoad 同源) */
  private playerPreviewArmor(): Array<number | null> {
    // 与 afterWorldLoad 初始装备一致:铁三件(头/胸/腿)
    const ids: Array<number | null> = [null, null, null];
    const order = ['iron_helmet', 'iron_chainmail', 'iron_greaves'];
    for (let k = 0; k < 3; k++) {
      const id = ITEM_BY_KEY[order[k]];
      ids[k] = id !== undefined ? id : null;
    }
    return ids;
  }

  /** 全图液体沉降（薄封装 → settleWorldLiquids，主线程 fallback 与 worker 共用同一实现）。
   *  mode 语义见 src/world/liquid/settle.ts 头注释 */
  private settleLiquids(onProgress?: (p: number) => void, mode: 'gen' | 'load' = 'gen') {
    return settleWorldLiquids(this.world, mode, onProgress);
  }

  async loadWorld(world: World, onProgress?: (label: string, p: number) => void, opts?: { settled?: boolean }) {
    this.freshlyCreated = false;
    this.world = world;
    if (!opts?.settled) {
      onProgress?.(Lang.text('Mods.SandboxWorld.Progress.SettleLiquids'), 0.5);
      // 读档模式：原版 WorldFile 单轮语义（存档水体已静止，QuickWater+WaterCheck 后
      // 活水极少，单轮快速收敛；残留交给运行时——不再跑生成期的 10 轮全沉降）
      await this.settleLiquids((p) => onProgress?.(Lang.text('Mods.SandboxWorld.Progress.SettleLiquids'), p * 0.8), 'load');
    }
    await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.8 + p * 0.2));
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  private afterWorldLoad() {
    const w = this.world;
    // 常用声效小集合预热（按需加载体系下的目标预热，异步不阻塞：
    // 战斗/挖掘/拾取等开局即用的 ~20 个小 wav；怪物专属声仍随首次受击懒加载）
    this.sfx.preloadNames(['hit', 'hurt', 'killed', 'pkilled', 'pickup', 'dig', 'place',
      'chop', 'tink', 'shatter', 'coin', 'door_open', 'door_close', 'splash', 'bowShoot', 'throw', 'roar']);
    // 原版墙渲染器（TEdit WallFraming 移植；墙 id 直用 wld id，贴图 Wall_N.png）
    const wallTiler = this.atlas ? new VanillaWallTiler(this.atlas) : null;
    this.chunks = new ChunkCache(w, this.assets.tileSheets, this.autotiler, wallTiler);
    // 懒加载晚到的【图块/墙表】→ 全量标脏重烘焙:出生点子集预载后,远行遇到
    // 新类型时 vframe 先返回 null(fallback 烤进 chunk),表到位后此回调修正。
    // 必须按文件名过滤——图标/NPC/弹幕贴图不进 chunk，此前任何 vimage 晚到都
    // invalidateAll（后台补齐 6059 张图标 = 6059 次全图重烘焙标记，进图后持续帧尖峰）
    if (this.atlas) {
      this.atlas.onVImageLoaded = (file: string) => {
        if (file.startsWith('vanilla/Tiles_') || file.startsWith('vanilla/Wall_')) {
          this.chunks.invalidateAll();
        }
      };
    }
    // 电路系统(Wiring.cs 移植):器件表 + 触发源登记(测重板 428/感应器 423)
    this.wiring = new Wiring(w.store);
    this.wiring.worldSurface = w.groundLevel;
    attachDevices(this.wiring, this.makeDeviceCtx());
    this.scanTriggerTiles();
    this.lighting = new LightingEngine(w);
    this.liquid = new LiquidSim(w);
    // 1456 AddWater/WaterCheck 尾部 KillTile（液体冲毁火把等）：走 breakTile（掉落+音效+帧刷新）
    this.liquid.killTile = (x, y) => this.breakTile(x, y);
    this.liquid.waterCheck(); // 原版读档末尾的 WaterCheck：把沉降后仍可流动的少量格子交给运行时收敛
    this.camera = new Camera(w.w, w.h);
    this.renderer.minimap = new Minimap(w);
    // 火把锚定（TileObjectData tile4）：支撑被挖掉时火把掉落（WorldGen.TileFrame 火把语义）
    w.store.onTileChanged((x, y) => this.checkTorchDetach(x, y));
    this.entities.clear();
    this.player = new Player(w.spawnX * TILE + 8, (w.spawnY - 3) * TILE, new Inventory()); // 主角 3 格高，抬高出生点
    // 初始装备（铁器三件套与 Maples 素材对齐；含药水与配饰便于体验 Buff/配饰系统）
    this.player.inv.add(ITEM_BY_KEY['iron_pickaxe'], 1);
    this.player.inv.add(ITEM_BY_KEY['iron_axe'], 1);
    this.player.inv.add(ITEM_BY_KEY['iron_sword'], 1);
    // 铁弓 + 木箭（射击系统测试；PickAmmo 会自动按 ammoId 找背包任意箭）
    this.player.inv.add(ITEM_BY_KEY['iron_bow'], 1);
    this.player.inv.add(ITEM_BY_KEY['wooden_arrow'], 250);
    this.player.inv.add(ITEM_BY_KEY['torch'], 12);
    // 药水/召唤物放入背包格（10 起），不占快捷栏
    const bag: Array<[string, number]> = [
      ['heal_potion', 2], ['agility_potion', 2], ['ironskin_potion', 2],
      ['thorns_potion', 2], ['regen_potion', 2], ['suspicious_eye', 3], ['lens', 6],
      ['slime_crown', 3], // 史莱姆王冠（召唤史莱姆王 NPC 50）
      // 电路工具(Wiring 移植验证用):扳手/线/钳/致动器/魔杖/多彩/蓝图 + 常用器件
      ['red_wrench', 1], ['blue_wrench', 1], ['green_wrench', 1], ['yellow_wrench', 1],
      ['wire', 300], ['wire_cutter', 1], ['actuator_item', 30], ['actuation_rod', 1],
      ['multicolor_wrench', 1], ['grand_design', 1],
      ['place_v_132_lever', 10], ['place_v_136_switch', 10], ['place_v_144_timers', 5],
      ['place_v_135_pressure_plates', 5], ['place_v_137_traps', 5], ['place_v_105_statue', 3],
      ['place_v_419_logicgatelamp', 10], ['place_v_420_logicgate', 5],
      ['place_v_235_teleporter', 2], ['place_v_142_inletpump', 2], ['place_v_143_outletpump', 2],
    ];
    let bi = 10;
    for (const [key, n] of bag) {
      this.player.inv.slots[bi++] = { id: ITEM_BY_KEY[key], stack: n };
    }
    // 开局体验盔甲：铁三件套穿上
    this.player.inv.slots[ARMOR_START] = { id: ITEM_BY_KEY['iron_helmet'], stack: 1 };
    this.player.inv.slots[ARMOR_START + 1] = { id: ITEM_BY_KEY['iron_chainmail'], stack: 1 };
    this.player.inv.slots[ARMOR_START + 2] = { id: ITEM_BY_KEY['iron_greaves'], stack: 1 };
    // 配饰直接放入配饰栏（槽 40-44）
    this.player.inv.slots[ACCESSORY_START] = { id: ITEM_BY_KEY['lucky_horseshoe'], stack: 1 };
    this.player.inv.slots[ACCESSORY_START + 1] = { id: ITEM_BY_KEY['feral_claws'], stack: 1 };
    this.camera.x = this.player.cx;
    this.camera.y = this.player.cy;
    this.boss = null;
    // 向导(NPC 22)随世界出生(WorldGen.cs:20036 NewNPC(spawnTileX, spawnTileY, 22))——
    // 新世界的唯一初始城镇 NPC,无家(homeless)。商人/护士等不再开局直刷:
    // 由 checkTownArrival 按原版条件 + 房屋系统入住(见 updateTownNpcArrival)
    this.guideSpawned = true;
    if (!this.entities.npcs.some((n) => n instanceof TownNPC && n.npcKey === 'guide' && !n.dead)) {
      this.entities.add(new TownNPC('guide', this.world.spawnX * 16 + 8, (this.world.spawnY - 2) * 16), 'npcs');
    }
    // 守卫老人(NPC 37):地牢门口常驻;白天只对话,夜晚对话「诅咒」召唤骷髅王。
    // 原版：击败骷髅王（downedBoss3）后老人转为裁缝消失——不再生成
    if (this.world.dungeonX > 0 && !this.world.flags.downedSkeletron) {
      this.maybeRespawnOldMan();
    }
    // 救援 NPC（bound）：世界生成期放置（原版 WorldGen 放置 BoundGoblin/BoundMechanic/
    // WebbedStylist/Golfer，TaxCollector 为地狱酷刑者——此处近似为直接 bound 解救）
    this.placeBoundRescueNpcs();
    this.cb.onInventoryChanged();
  }

  /** 救援 NPC 放置（原版世界生成放置 bound NPC：哥布林/巫师=洞穴层、机械师=地牢内部、
   *  造型师=蜘蛛巢(墙62)、高尔夫球手=地下沙漠(墙216/217/187)、税务员=地狱；
   *  巫师仅困难模式。原版为独立类型 105/106/122/123，此处以 TownNPC.bound 近似） */
  private placeBoundRescueNpcs() {
    const st = this.world.store;
    // 机械师：地牢入口向下找地牢墙内空气落脚
    if (this.world.dungeonX > 0) {
      const DUNG_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
      const dx = this.world.dungeonX;
      const y0 = (this.world.dungeonY || Math.floor(this.world.groundLevel)) + 60;
      for (let y = y0; y < Math.min(st.h - 60, y0 + 300); y++) {
        if (st.isSolid(dx, y) || !DUNG_WALLS.has(st.wall[st.idx(dx, y)])) continue;
        if (st.isSolid(dx, y - 1) || st.isSolid(dx, y - 2)) continue;
        if (this.placeBoundNpc('mechanic', 'savedMech', dx, y - 1)) break;
      }
    }
    // 按墙类型扫描落脚（蜘蛛巢 62 / 地下沙漠 216/217/187）
    const findByWall = (walls: Set<number>, key: string, flag: string): boolean => {
      for (let x = 20; x < st.w - 20; x += 7) {
        for (let y = Math.floor(this.world.rockLevel) + 20; y < st.h - 260; y += 3) {
          if (st.isSolid(x, y) || !walls.has(st.wall[st.idx(x, y)])) continue;
          if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || !st.isSolid(x, y + 1)) continue;
          if (this.placeBoundNpc(key, flag, x, y - 1)) return true;
        }
      }
      return false;
    };
    findByWall(new Set([62]), 'stylist', 'savedStylist');
    findByWall(new Set([216, 217, 187]), 'golfer', 'savedGolfer');
    // 哥布林：洞穴层（岩石层下 60..h-350）随机列扫落脚
    const g = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
    if (g) this.placeBoundNpc('goblin_tinkerer', 'savedGoblin', g[0], g[1]);
    // 税务员：地狱层（h-170..h-60；原版为"酷刑者"NPC+净化粉转化，此处近似直接解救）
    const t = this.findBoundSpotByDepth(st.h - 170, st.h - 60);
    if (t) this.placeBoundNpc('tax_collector', 'savedTaxCollector', t[0], t[1]);
    // 巫师：仅困难模式（入驻轮里 hardMode 开启后补放）
    if (this.world.flags.hardMode) {
      const wz = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
      if (wz) this.placeBoundNpc('wizard', 'savedWizard', wz[0], wz[1]);
    }
  }

  /** 深度带内找 bound 落脚点（空气×2 + 下方实心），返回 [x, 脚底上一格y] */
  private findBoundSpotByDepth(yTop: number, yBot: number): [number, number] | null {
    const st = this.world.store;
    const x0 = Math.floor(st.w * 0.15), x1 = Math.floor(st.w * 0.85);
    for (let x = x0; x < x1; x += 5) {
      for (let y = yTop; y < yBot; y += 3) {
        if (st.isSolid(x, y) || st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;
        if (!st.isSolid(x, y + 1)) continue;
        return [x, y - 1];
      }
    }
    return null;
  }

  /** 放置一名 bound 救援 NPC（已解救/已在场/落点无效时跳过）。x,y = 脚底上一格 */
  private placeBoundNpc(key: string, savedFlag: string, x: number, y: number): boolean {
    const st = this.world.store;
    if (this.world.flags[savedFlag]) return false;
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === key)) return false;
    if (x < 3 || y < 3 || x > st.w - 4 || y > st.h - 4) return false;
    if (st.isSolid(x, y) || st.isSolid(x, y - 1)) return false;
    const npc = new TownNPC(key, x * TILE + 8, (y + 1) * TILE);
    npc.bound = true;
    this.entities.add(npc, 'npcs');
    return true;
  }

  /** 右键解救 bound NPC（原版 bound 类型右键 → 转正 + AI_007_UpdateSavedStates 置 saved 旗标） */
  private freeBoundNpc(npc: TownNPC): void {
    npc.bound = false;
    const flagByKey: Record<string, string> = {
      goblin_tinkerer: 'savedGoblin', wizard: 'savedWizard', mechanic: 'savedMech',
      stylist: 'savedStylist', tax_collector: 'savedTaxCollector', golfer: 'savedGolfer',
    };
    const flag = flagByKey[npc.npcKey];
    if (flag) this.world.flags[flag] = true;
    const name = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    this.newText(Lang.text('Mods.SandboxWorld.NPC.Rescued', name), 50, 125, 255);
    this.spawnParticles(npc.cx, npc.cy, '#9AE85A', 14, 2);
    this.playSfxFiles(['NPC_Hit_1'], 0.6);
  }

  /** 守卫老人(NPC 37)生成/重生（原版 dungeonX/Y = 入口站立点 cs L72510-72527）。
   *  诅咒召唤时被置 dead；骷髅王离场/被击败未记账时原版会让他重新出现——
   *  Boss 战斗结束块调用本方法（已在场/已击败时直接跳过） */
  private maybeRespawnOldMan() {
    if (this.world.dungeonX <= 0 || this.world.flags.downedSkeletron) return;
    if (this.entities.npcs.some((n) => n instanceof TownNPC && n.npcKey === 'old_man' && !n.dead)) return;
    const st = this.world.store;
    const dX = this.world.dungeonX;
    const dY = this.world.dungeonY || Math.floor(this.world.groundLevel);
    // 双侧由外向内扫门 tile(外廊门或塔基门),取最外侧一扇
    let doorX = -1, doorY = -1;
    for (let r = 70; r >= 3 && doorX < 0; r--) {
      for (const sd of [1, -1]) {
        const x = dX + sd * r;
        if (x < 3 || x > st.w - 4) continue;
        for (let y = Math.max(4, dY - 45); y < Math.min(st.h - 3, dY + 45); y++) {
          if (st.type[st.idx(x, y)] === T.DOOR_CLOSED) { doorX = x; doorY = y; break; }
        }
        if (doorX > 0) break;
      }
    }
    // 落位候选(按优先级):门外开阔侧 3 格 > 门内 1 格 > 门外 6/10 格 > 门内 4 格 >
    // 塔心入口扫描 > 裸兜底。每候选:向下 ≤10 格找地面 + 头顶 3 格净空(身高 40px)
    // + 3 宽地板(左右也实心,防站在竖井/悬崖边缘)
    const standSpot = (sx: number, syTop: number): { x: number; y: number } | null => {
      if (sx < 3 || sx > st.w - 4) return null;
      let yy = Math.max(4, syTop);
      const limit = Math.min(st.h - 3, syTop + 10);
      while (yy < limit && !st.isSolid(sx, yy)) yy++;
      if (yy >= limit) return null;
      if (!st.isSolid(sx - 1, yy) || !st.isSolid(sx + 1, yy)) return null;
      for (let k = 1; k <= 3; k++) if (st.isSolid(sx, yy - k)) return null;
      return { x: sx, y: yy - 3 };
    };
    const side = doorX >= dX ? 1 : -1; // 门相对塔心的方位,外侧 = 再往外
    const baseY = (doorY > 0 ? doorY : dY) - 2;
    // 首选 dungeonX/Y 本身(=门厅站立点);其余候选为门扫描兜底
    const cands: Array<[number, number]> = [[dX, dY - 3], [doorX + side * 3, baseY],
      [doorX - side, baseY], [doorX + side * 6, baseY],
      [doorX + side * 10, baseY], [doorX - side * 4, baseY], [dX, dY - 10]];
    let spot = cands.map(([cx0, cy0]) => standSpot(cx0, cy0)).find((s) => s) ?? null;
    if (!spot) {
      // 末级兜底①:门高平面 ±70 列扫任一有效落脚
      for (let r = 1; r <= 70 && !spot; r++) {
        for (const sd of [1, -1]) {
          spot = standSpot(dX + sd * r, baseY);
          if (spot) break;
        }
      }
    }
    if (!spot) {
      // 末级兜底②:门口悬空(地牢在陡坡上) → 塔外 20-70 列从天空向下扫地表,
      // 站到门外山坡(依然在门口视野内);再不行站塔顶
      for (let r = 20; r <= 70 && !spot; r++) {
        for (const sd of [1, -1]) {
          spot = standSpot(dX + sd * r, 8);
          if (spot) break;
        }
      }
    }
    if (!spot) spot = standSpot(dX, 8) ?? { x: dX, y: dY - 3 };
    const oldMan = new TownNPC('old_man', spot.x * 16 - 8, spot.y * 16);
    oldMan.home = { x: spot.x, y: spot.y }; // 锚定门口
    oldMan.leashHome = true; // 白天在门口走廊附近游走,不远离(原版老人不离地牢)
    oldMan.id = this.entities.nextId++;
    this.entities.add(oldMan, 'npcs');
  }

  /** 销毁：停止循环并移除画布（退出到主菜单时调用） */
  destroy() {
    this.running = false;
    // 资源释放链(缺一不可,见各 dispose 注释):连续多次读档曾因不释放
    // 累积数百 MB 显存 → contextlost/contextrestored 风暴卡死(2026-08-10 trace)
    this.input.destroy();
    this.chunks?.dispose();
    this.renderer.dispose();
    this.renderer.canvas.remove();
    // 纸娃娃合成缓存:contextlost 后缓存内容归零且不重画——不清则
    // "角色/装备/时装全部隐形"(选人界面与游戏内 alike)
    clearPaperDollCache();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(now: number) {
    const elapsed = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    if (!this.paused) {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.fixedUpdate(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
    }
    this.render();
  }

  // ================= 固定步逻辑 =================

  private fixedUpdate(dt: number) {
    this.tickCount++;
    // 对话距离保持:离开 NPC 超过 6 格自动关闭(原版 SetTalkNPC(-1) 语义)
    if (this.dialogNpc) {
      const dn = this.dialogNpc;
      if (dn.dead || Math.hypot(dn.cx - this.player.cx, dn.cy - this.player.cy) > TILE * 6) {
        this.closeNpcDialog();
      }
    }
    // 原版 HitTile 衰减（每 2 tick 一次——原版按帧衰减配原版 ~27 帧挥速；
    // 我们的挥击间隔更长，等比减半保持"连击可积累、停手会消退"）
    if (this.tickCount % 2 === 0) this.hitTiles.update();
    const w = this.world;
    w.clock.tick(dt * 1000);
    // 昼夜切换：提示 + BGM 变奏
    const isDay = w.clock.isDay;
    if (isDay !== this.lastWasDay) {
      if (this.lastWasDay !== null) {
        this.cb.onToast(isDay ? Lang.text('Mods.SandboxWorld.Toast.DayStart') : Lang.text('Mods.SandboxWorld.Toast.NightFall'));
        this.cb.onDayNight?.(isDay);
        // 昼/夜逻辑感应器(423)触发
        this.triggerDayNightSensors();
      }
      this.lastWasDay = isDay;
    }
    // ---- 热喷泉自动喷发（原版 Main 扫描：上方格岩浆流过即喷；15 tick 采样 + 120 tick 冷却） ----
    if (this.tickCount % 15 === 0 && this.geyserTiles.size) {
      const st2 = w.store;
      for (const gi of this.geyserTiles) {
        if ((this.geyserCd.get(gi) ?? 0) > 0) continue;
        const gx = gi % st2.w, gy = (gi / st2.w) | 0;
        const above = st2.idx(gx, gy - 1);
        if (st2.liquid[above] > 0 && st2.liquidType[above] === 2) {
          this.geyserCd.set(gi, 120);
          this.wiring?.hitSwitch(gx, gy);
        }
      }
    }
    if (this.tickCount % 15 === 0) {
      for (const [, v] of this.geyserCd) { /* 冷却递减在下一行统一 */ }
      for (const k of [...this.geyserCd.keys()]) {
        const v = this.geyserCd.get(k)! - 15;
        if (v <= 0) this.geyserCd.delete(k); else this.geyserCd.set(k, v);
      }
    }
    // ---- 原版环境采样 + BGM 选曲（SceneMetrics/UpdateAudio_DecideOnNewMusic；15 tick 刷新） ----
    if (this.tickCount % 15 === 0) {
      const townNPCCount = this.entities.npcs.filter((n) => !(n as TownNPC).dead).length;
      this.scene = scanScene(w, this.player.cx, this.player.cy, townNPCCount);
      // 群系背景预测性预热:进入新群系前把该群系视差贴图后台取齐
      // (否则跨群系旅行首帧背景闪空;仅 fire-and-forget,不阻塞主循环)
      this.renderer.biomeBg.warm(this.scene);
      // Boss 专属 BGM（Main.cs:12155-12312：屏幕±5000px 盒内最近 Boss 的专属曲；
      // 异教徒/光皇相位盒 1600 暂统一按 5000 近似）
      let bossMusic = 0;
      for (const e of this.entities.enemies) {
        const en = e as unknown as { x: number; y: number; def?: { boss?: boolean }; vanillaId?: number | null };
        if (en.def?.boss && Math.abs(en.x - this.player.cx) < 5000 && Math.abs(en.y - this.player.cy) < 5000) {
          bossMusic = bossMusicFor(en.vanillaId ?? 0);
          break;
        }
      }
      const music = pickMusic({
        scene: this.scene, isDay, bossMusic,
        worldSurface: w.groundLevel, rockLevel: w.rockLevel, lavaLine: w.lavaLine || w.store.h - 200,
        maxTilesX: w.store.w, centerX: this.player.cx, centerY: this.player.cy, ocean: this.scene.zoneBeach,
        state: this.musicState,
      });
      if (music !== this.lastMusic) {
        this.lastMusic = music;
        this.cb.onMusic?.(music);
      }
    }
    const player = this.player;

    // ---- 玩家输入 ----
    const inp = this.input;
    // 点击右上角小地图 → 开关全屏地图
    if (inp.mouseDown && !this._mapClickLatch) {
      const r = this.renderer.minimapRect;
      const fm = this.renderer.fullMap;
      const inMap = inp.mouseX >= r.x && inp.mouseX <= r.x + r.w && inp.mouseY >= r.y && inp.mouseY <= r.y + r.h;
      if (!fm.open && inMap && !inp.uiBlocking && !this.renderer.minimapUiHover) {
        fm.open = true;
        // 打开即放大到主角：锚点 = 主角 tile 坐标 → 屏幕中心，
        // zoom 从 0.5 缓动到 2，缓动期间 applyMapAnchor 每帧补偿 pan，主角始终居中
        fm.zoom = 0.5;
        fm.zoomTarget = 2;
        fm.anchorU = player.cx / TILE;
        fm.anchorV = player.cy / TILE;
        fm.anchorMX = this.renderer.canvas.width / 2;
        fm.anchorMY = this.renderer.canvas.height / 2;
        // 预置 pan（此时 _fmWorldW 可能还是 0，不能等 easeFullMap 反解，首帧会跳）
        fm.panX = (this.world.w * fm.zoom) / 2 - fm.anchorU * fm.zoom;
        fm.panY = (this.world.h * fm.zoom) / 2 - fm.anchorV * fm.zoom;
        this.renderer['_mapInit'] = false;
        // 打开地图的这次点击不算拖拽（否则按住期间 drawFullMap 会把锚点重设到点击处，飞向主角变飞向点击处）
        this.renderer['_mapOpenClick'] = true;
        this._mapClickLatch = true;
      }
    }
    if (!inp.mouseDown) this._mapClickLatch = false;
    // 全屏地图：点击传送（两次确认）——第一次预选标记，第二次传送。
    // 按下只记起点，松开时位移 < 6px 才算"点击"（拖动平移、打开地图的按压都不误触传送）
    if (this.renderer.fullMap.open && !inp.uiBlocking) {
      if (inp.mouseDown && !this._mapClickLatch2 && !this._mapClickLatch && !this.renderer['_mapOpenClick']) {
        this._mapClickLatch2 = true;
        this._mapPressX = inp.mouseX;
        this._mapPressY = inp.mouseY;
      }
      if (!inp.mouseDown && this._mapClickLatch2) {
        this._mapClickLatch2 = false;
        const moved = Math.hypot(inp.mouseX - this._mapPressX, inp.mouseY - this._mapPressY);
        if (moved < 6) {
          const fm = this.renderer.fullMap;
          // 屏幕坐标 → 地图源坐标（与 zoomFullMapAt 的逆变换一致）
          const viewW = this.renderer.canvas.width, viewH = this.renderer.canvas.height;
          const cx0 = viewW / 2 - (this.world.w * fm.zoom) / 2 + fm.panX;
          const cy0 = viewH / 2 - (this.world.h * fm.zoom) / 2 + fm.panY;
          // 地图绘制：mapW = world.w * zoom（1 tile = zoom 像素）——直接除 zoom 得 tile 坐标
          const tx = Math.floor((inp.mouseX - cx0) / fm.zoom);
          const ty = Math.floor((inp.mouseY - cy0) / fm.zoom);
          if (tx >= 0 && ty >= 0 && tx < this.world.w && ty < this.world.h) {
            if (this._tpTarget && this._tpTarget.x === tx && this._tpTarget.y === ty) {
              // 第二次点击同一点 → 先就位目标区域贴图再传送(落地即完美,
              // 不出现 fallback 色块闪烁);失败不关图、保留标记可重试
              void this.teleportWhenReady(tx, ty);
            } else {
              this._tpTarget = { x: tx, y: ty };
              this.renderer.tpMark = { x: tx, y: ty };
              this.cb.onToast(`已选传送点 (${tx}, ${ty})，再次点击确认`);
            }
          }
        }
      }
    } else {
      this._mapClickLatch2 = false;
    }
    // ---- 标注模式：点击标记方块（优先于挖掘/放置/使用） ----
    if (this.annotateMode && inp.mouseDown && !this._annoLatch && !inp.uiBlocking && !this.renderer.fullMap.open && !this.renderer.timeUiHover) {
      this._annoLatch = true;
      const [tx, ty] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
      if (this.fixTexMode) {
        // 贴图纠错子模式：点击弹出该图块的完整原版贴图表
        if (this.world.store.inBounds(tx, ty)) {
          (window as unknown as { __swUI?: { openTexPicker?: (x: number, y: number) => void } }).__swUI?.openTexPicker?.(tx, ty);
        }
      } else if (this.world.store.inBounds(tx, ty)) {
        const existed = this.marks.some((m) => m.x === tx && m.y === ty);
        this.marks = this.marks.filter((m) => m.x !== tx || m.y !== ty); // 同格重复点 = 取消
        if (!existed) this.marks.push({ x: tx, y: ty });
        this.cb.onToast(existed ? `已取消标记 (${tx}, ${ty})` : `已标记 (${tx}, ${ty})，再次点击取消`);
        (window as unknown as { __swUI?: { updateAnnotateCount: (n: number) => void } }).__swUI?.updateAnnotateCount(this.marks.length);
      }
    }
    if (!inp.mouseDown) this._annoLatch = false;
    player.inputX = (inp.down('KeyA') || inp.down('ArrowLeft') ? -1 : 0) + (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0);
    player.inputJump = inp.down('Space') || inp.down('KeyW') || inp.down('ArrowUp');
    player.inputDown = inp.down('KeyS') || inp.down('ArrowDown');
    player.inputUp = inp.down('KeyW') || inp.down('ArrowUp');

    // 滚轮：全屏地图打开时缩放地图，否则缩放游戏画面
    if (inp.wheelDelta !== 0) {
      if (this.renderer.fullMap.open) {
        // 以鼠标为锚点缩放（缩放不乱飞）
        this.renderer.zoomFullMapAt(
          this.renderer.fullMap.zoom * (inp.wheelDelta > 0 ? 0.85 : 1.18),
          inp.mouseX, inp.mouseY,
        );
      } else {
        this.setZoom(this.camera.zoomTarget * (inp.wheelDelta > 0 ? 0.94 : 1.064));
      }
    }

    player.fixedUpdate(dt, this);
    this.updateTallGateAuto();
    if (player.dead) {
      // 死亡瞬间：红色粉碎粒子 + 原地留墓碑（只处理一次）
      if (!this._deathHandled) {
        this._deathHandled = true;
        this.handlePlayerDeath();
      }
      // 重生计时
      player.respawnTimer++;
      if (player.respawnTimer > 180) this.respawnPlayer();
    } else {
      this._deathHandled = false;
    }

    // ---- 使用物品（鼠标） ----
    this.updateUse(dt);

    // ---- 实体 ----
    this.entities.update(dt, this);

    // ---- 液体（原版每 2 tick 一次 UpdateLiquid）----
    if (this.tickCount % 2 === 0) {
      this.liquid.step();
      // 液体直接写数组绕过 store 监听：有活动液体时手动通知光照衰减变化
      if (this.liquid.numLiquid > 0) this.lighting.liquidDirty = true;
    }

    // ---- 敌人生成（F8 可关闭；频率语义见 trySpawnEnemy，每帧概率门） ----
    // 水蜡烛(Main.waterCandle 语义):手持或 32 格内有放置态 → 刷怪率修正（getSpawnRate 内）
    const held2 = this.player.inv.heldItem();
    const heldWC = !!held2 && ITEM_DEFS[held2.id]?.key === 'water_candle';
    this.heldWaterCandle = heldWC;
    let nearWC = false;
    if (this.tickCount % 30 === 0) {
      nearWC = false;
      const st2 = this.world.store;
      const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
      const WCT = TILE_BY_KEY['water_candle'];
      for (let dx = -32; dx <= 32 && !nearWC; dx += 4) {
        for (let dy = -24; dy <= 24; dy += 4) {
          if (st2.get(ptx + dx, pty + dy) === WCT) { nearWC = true; break; }
        }
      }
      this.waterCandleNear = nearWC;
    }
    // 篝火/心灯光环:篝火 lifeRegen+1 = 0.5 HP/s;心灯(灯笼 tile42 frameY 324-358,
    // SceneMetrics.cs:207-208)lifeRegen+2 = 1 HP/s,两者独立
    if (this.tickCount % 20 === 0) {
      const ptx2 = Math.floor(this.player.cx / TILE), pty2 = Math.floor(this.player.cy / TILE);
      let fire = false, heart = false;
      const FIRE = TILE_BY_KEY['v_215_campfires'];
      const LANTERN = TILE_BY_KEY['lantern'];
      const st3 = this.world.store;
      for (let dx = -48; dx <= 48 && !(fire && heart); dx += 3) {
        for (let dy = -36; dy <= 36; dy += 3) {
          const lx = ptx2 + dx, ly = pty2 + dy;
          if (!st3.inBounds(lx, ly)) continue;
          const li = st3.idx(lx, ly);
          if (st3.type[li] === FIRE && st3.frameX[li] < 18) fire = true;
          if (st3.type[li] === LANTERN && st3.frameY[li] >= 324 && st3.frameY[li] <= 358) heart = true;
          if (fire && heart) break;
        }
      }
      if (fire) this.player.buffs.apply(BuffType.Campfire, 0.5);
      this.player.buffs.lanternHeal = heart ? 1 : 0;
    }
    // 原版 Main.SpawnNPC 每帧调用（Main.cs:17724），概率门在 TrySpawnAnNPC L30
    // （Next(spawnRate)==0；spawnRate 修正表见 VanillaSpawner.getSpawnRate）。
    // 水蜡烛（heldWaterCandle/waterCandleNear）在 getSpawnRate 内修正，不再改节流
    if (this.enemySpawnEnabled) {
      this.trySpawnEnemy();
    }

    // ---- 压力板触发 ----
    this.checkPressurePlates();

    // ---- 电路系统:冷却注册递减(计时器周期) + 测重板/感应器 ----
    this.wiring?.updateMech();
    this.updateTriggerTiles();
    this.updateEntityPlates();

    // ---- Boss 逻辑 ----
    if (this.boss) {
      // 原版无通用"日出剔除 Boss"机制：EoC 白天走 AI_004 自漂离、骷髅王族白天狂暴、
      // 其余 Boss（史莱姆王/世吞/克脑/蜂后/机械三王…）白天照常战斗——
      // 此前的通用 dayKill 会把白天召唤的史莱姆王秒删（史莱姆王冠原版任意时间可用）
      if (this.boss.dead) {
        // 通用记账:按 Boss 名写 downed 标志(原版 NPC.downedBoss 表)
        {
          // 注意:?? 与 || 混用必须加括号(esbuild 语法限制)
          const bname = ((this.boss.vanillaId != null ? Lang.npcName(this.boss.vanillaId) : null) ?? this.boss.def.name) || 'Boss';
          // NPC.cs:79833 BroadcastChatMessage("Announcement.HasBeenDefeated_Single", ChatColors.BossOrEvent)
          this.newText(Lang.text('Announcement.HasBeenDefeated_Single', bname), 175, 75, 255);
          const downedKey = `downed_${this.boss.vanillaId ?? 0}`;
          w.flags[downedKey] = true;
        }
        // 骷髅王战斗结束（无论胜负）且未击败 → 守卫老人次日重新出现在地牢门口
        // （原版：老人在诅咒时消失，骷髅王离场/未被击败后重新生成；击败后转为裁缝）
        if (this.boss.vanillaId === 35 && !w.flags.downedSkeletron) {
          this.maybeRespawnOldMan();
        }
        this.boss = null;
      }
    }

    // ---- 树苗生长（每 5 秒扫一次） ----
    if (this.tickCount % 300 === 0) this.growSaplings();
    // ---- 城镇 NPC 入驻评估（原版 Main.cs:65021 每 7200 tick 一轮；载入后 10s 首轮
    //      ≈ UpdateTime_SpawnTownNPCs(forceUpdate)） ----
    if (this.tickCount % 7200 === 600) this.updateTownNpcArrival();

    // ---- 战争迷雾：玩家周围探索标记（每 15 tick） ----
    if (this.tickCount % 15 === 0) {
      w.markExplored(Math.floor(player.cx / TILE), Math.floor(player.cy / TILE), 28);
    }

    // ---- Buff 状态栏刷新（每秒） ----
    if (this.tickCount % 60 === 0) this.cb.onBuffsChanged?.();

    // ---- 相机 / 光照 ----
    this.camera.follow(player.cx, player.cy);
    this.camera.easeZoom();
    this.camera.clamp();
    this.chunks.flushDirty();
    this.chunks.advanceAnim(); // 动画陈设（制冰机/固化机/篝火/熔炉等）：换帧 tick 重建含动画 chunk
    const viewTW = Math.ceil(this.camera.viewW / this.camera.zoom / TILE) + 2;
    const viewTH = Math.ceil(this.camera.viewH / this.camera.zoom / TILE) + 2;
    this.lighting.ensureRegion(player.cx, player.cy, viewTW, viewTH);
    // 手持火把照明：选中火把即点亮周围（#11）
    const heldDef = player.inv.heldDef();
    const torchOn = !!heldDef && heldDef.key === 'torch';
    const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
    const prevLight = this.lighting.heldLight;
    this.lighting.heldLight = torchOn ? { tx: ptx, ty: pty } : null;
    if (torchOn !== !!prevLight ||
      (torchOn && prevLight && (prevLight.tx !== ptx || prevLight.ty !== pty))) {
      this.lighting.dirty = true;
    }
    // 弹幕动态点光(原版 Lighting.AddLight + Projectile.light 数据):
    // 荧光棒/燃烧箭/火花/火焰镖等飞行中发光——Arrow/WeaponProj 系均暴露 projId
    for (const p of this.entities.projectiles) {
      const pid = (p as { projId?: number }).projId;
      if (pid == null) continue;
      const l = projectileData(pid)?.light;
      if (!l || l <= 0) continue;
      const pe = p as unknown as { x: number; y: number; w: number; h: number };
      this.lighting.addLight(
        Math.floor((pe.x + pe.w / 2) / TILE), Math.floor((pe.y + pe.h / 2) / TILE),
        l, l, l,
      );
    }
    this.lighting.compute(w.clock.dayFactor);

    // ---- 粒子与飘字 ----
    this.flushInvNotify();
    // 小动物环境生成：按昼夜在地表视野外生成，上限 8 只
    if (this.tickCount % 120 === 0 && this.entities.critters.length < 8) {
      this.spawnCritter();
    }
    // 怪物碾压小动物：任意敌人身体接触即杀死（不视为交战）
    if (this.tickCount % 4 === 0 && this.entities.critters.length) {
      for (const cent of this.entities.critters) {
        const c = cent as Critter;
        if (c.dead) continue;
        for (const eent of this.entities.enemies) {
          const e = eent as Enemy;
          if (c.x < e.x + e.w && c.x + c.w > e.x && c.y < e.y + e.h && c.y + c.h > e.y) {
            c.hurt(this);
            break;
          }
        }
      }
    }
    // 僵尸环境呻吟：附近有僵尸时偶发（每 ~4-8 秒）
    if (this.tickCount % 300 === 0) {
      for (const ent of this.entities.enemies) {
        const e = ent as Enemy;
        if (e.key !== 'zombie' && e.key !== 'magma_zombie') continue;
        if (Math.hypot(e.cx - this.player.cx, e.cy - this.player.cy) < TILE * 30) {
          this.sfx.playWav('zombie', 0.6);
          break;
        }
      }
    }
    // 火把火苗：视内点燃火把随机飘出火星（火点在格顶上方 20px 精灵的火焰处）
    this.emitTorchSparks();
    for (const p of this.particles) {
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; } // 空气阻力：喷溅后缓慢减速飘散
      // 地形碰撞：目标位置实心则反弹（冲击大）或停驻地表（冲击小，重力归零缓慢淡出）
      const st = this.world.store;
      const solidAt = (x: number, y: number) => {
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        return st.inBounds(tx, ty) && st.isSolid(tx, ty);
      };
      let nx = p.x + p.vx;
      if (solidAt(nx, p.y)) { p.vx *= -0.4; nx = p.x; }
      let ny = p.y + p.vy;
      if (solidAt(nx, ny)) {
        if (p.vy > 1.6) {
          p.vy = -p.vy * 0.35; // 溅落反弹
          p.vx *= 0.6;
        } else {
          p.vy = 0; p.vx *= 0.5; p.grav = 0; // 停驻地表
        }
        ny = p.y;
      }
      p.x = nx; p.y = ny;
    }
    // 就地压缩(2026-08 审计 G9:此前每 tick 两个 filter 新数组)
    compactByLife(this.particles);
    for (const d of this.dmgNumbers) {
      d.life--;
      d.y += d.vy;
      d.vy *= 0.94;
    }
    compactByLife(this.dmgNumbers);

    inp.endFrame();

    // 挥剑命中判定（实体更新后）
    this.postUpdate();
  }

  // ================= 物品使用：挖掘 / 放置 / 攻击 / 使用 =================

  private updateUse(dt: number) {
    const inp = this.input;
    // 矿车骑乘驱动:左右加速,跳车
    if (this.minecart) {
      const cart = this.minecart;
      const ix = this.player.inputX;
      if (ix !== 0) cart.vx = Math.max(-8, Math.min(8, cart.vx + ix * 0.15));
      if (inp.down('KeyR')) {
        // 跳车(原版 R 键下车;Space 与跳跃共用会误触)
        this.player.x = cart.x;
        this.player.y = cart.y - 24;
        this.player.vy = -4;
        cart.mounted = false;
        this.minecart = null;
        this.input.rightDown = false;
      }
      // 玩家跟随车位置
      this.player.x = cart.x;
      this.player.y = cart.y - 26;
      this.player.vx = cart.vx;
      this.player.vy = 0;
      if (cart.dead) { this.minecart = null; }
      return;
    }
    // 全屏地图打开时鼠标交给地图（拖动/缩放/传送），不触发挖掘/放置/攻击/使用。
    // 时间调整按钮/面板悬停同理（renderer.timeUiHover 渲染期写入）
    if (inp.uiBlocking || this.player.dead || this.renderer.fullMap.open || this.renderer.timeUiHover) {
      this.mining = null;
      return;
    }
    const held = this.player.inv.heldItem();
    const heldDef = held ? ITEM_DEFS[held.id] : null;
    const [tx, ty] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
    const tool = heldDef?.tool;
    const vw2 = this.renderer.canvas.width, vh2 = this.renderer.canvas.height;

    // 右键：手持矿车点轨道(最优先,防 NPC 交谈拦截)→ 附近宝箱 → NPC 交谈 → 交互
    const type = this.world.store.get(tx, ty);
    if (inp.rightDown && !this.minecart && type === this.trackTile && this.trackTile !== 0) {
      const h = this.player.inv.heldItem();
      if (h && ITEM_DEFS[h.id]?.key === 'minecart_item') {
        const cart = new Minecart();
        cart.x = tx * TILE; cart.y = (ty - 1) * TILE;
        this.entities.add(cart, 'props');
        this.minecart = cart;
        cart.mounted = true;
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.cb.onInventoryChanged();
        this.input.rightDown = false;
        return;
      }
    }
    if (inp.rightDown) {
      const nearChest = this.findChestNear(tx, ty);
      if (nearChest) {
        this.tryOpenChest(nearChest);
        this.input.rightDown = false;
      } else if (this.talkToNearbyNpc(tx, ty)) {
        this.input.rightDown = false;
      } else if (heldDef?.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.input.rightDown = false;
      } else {
        this.interactAt(tx, ty);
      }
    }

    if (!inp.mouseDown || this.annotateMode) {
      this.mining = null;
      return;
    }

    // 近战挥剑（vi_ 数据驱动近战武器同走挥击，数值取 combat 表；攻速配饰：猛爪手套 ×2）
    const cw = heldDef ? combatWeapon(heldDef) : null;
    if (tool?.type === 'sword' || cw?.kind === 'melee') {
      const spd = Math.max(12, Math.round((tool?.speed ?? (cw?.kind === 'melee' ? cw.useTime : 42)) / this.player.attackSpeedMult));
      if (!this.swing && this.player.useTime === 0) {
        this.swing = {
          t: spd, dur: spd, item: held!.id,
          dmg: cw?.kind === 'melee' ? cw.damage : undefined,
          kb: cw?.kind === 'melee' ? cw.knockback : undefined,
        };
        this.player.useTime = spd;
        this.swingHitSet.clear();
        this.swingTileCutSet.clear();
      }
      this.mining = null;
      return;
    }

    // 镐/斧/锤：挖掘（按住累计）+ 同时作为武器挥击（伤害低于剑）
    if (tool && (tool.type === 'pick' || tool.type === 'axe' || tool.type === 'hammer')) {
      const spd = Math.max(14, Math.round((tool.speed ?? 46) / this.player.attackSpeedMult));
      if (!this.swing && this.player.useTime === 0) {
        this.swing = { t: spd, dur: spd, item: held!.id };
        this.player.useTime = spd;
        this.swingHitSet.clear();
        this.swingTileCutSet.clear();
        // 每次挥砍一声：斧砍植物纤维、镐按材质区分土闷/石金（跟随挥砍节奏，不再密集连响）。
        // 没有生效对象（镐没对准可挖方块 / 斧没对准树）则不出声
        const hType = this.world.store.get(tx, ty);
        const hovered = TILE_DEFS[hType];
        const axeOnTarget = hType === T.TREE || (hovered?.decor ?? false);
        const pickOnTarget = hType !== 0 && this.toolCanBreak(hType, tool.power ?? 10, tool.type);
        if (tool.type === 'axe' ? axeOnTarget : pickOnTarget) {
          if (tool.type === 'axe') this.sfx.play('chop');
          else if (hovered && /stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(hovered.key)) this.sfx.play('tink');
          else this.sfx.play('dig');
        }
      }
      // HitTile 节流窗 = 实际挥击间隔（含攻速配饰加成），保证一挥一击
      this.tryMine(tx, ty, tool.power ?? 10, tool.type, spd);
      return;
    }

    // 电路工具(扳手/剪线钳/致动器/致动魔杖/五彩扳手/宏伟蓝图):左键,目标格可被占用
    if (heldDef?.wireTool && inp.mouseDown && !inp.rightDown) {
      this.useWireTool(tx, ty, heldDef);
      return;
    }

    // 可放置物品：左键放置
    if (heldDef?.tile && !inp.rightDown) {
      this.tryPlace(tx, ty, heldDef);
      return;
    }

    // 其它物品（方块/药水等）：左键使用并带挥砍动画
    if (heldDef && inp.mouseDown && this.player.useTime === 0 && !heldDef.tool) {
      const spd = 30;
      this.swing = { t: spd, dur: spd, item: held!.id };
      this.swingHitSet.clear();
        this.swingTileCutSet.clear();
      // 召唤道具（原版左键使用）
      if (heldDef.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.player.useTime = 30;
      }
    }
    // 药水饮用（移植自 Maples：点击饮用，治疗类受耐药性封锁）
    if (heldDef?.potion && inp.mouseDown && this.player.useTime === 0) {
      const p = heldDef.potion;
      const buffTypeMap: Record<string, BuffType> = {
        agility: BuffType.Agility, ironskin: BuffType.Ironskin,
        resistance: BuffType.Resistance, thorns: BuffType.Thorns, regen: BuffType.Regen,
      };
      if (p.isHealType && this.player.buffs.healBlocked) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.HealBlock'));
        this.player.useTime = 30;
      } else {
        const bt = buffTypeMap[p.buff];
        this.player.buffs.apply(bt, p.duration);
        if (heldDef.heal) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + heldDef.heal);
          this.addDamageNumber(this.player.cx, this.player.y, heldDef.heal, false, '#40E080');
        }
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
        this.cb.onToast(`${heldDef.name}：${p.duration} 秒`);
      }
    } else if (heldDef && (heldDef.key === 'life_crystal' || heldDef.key === 'vi_29_LifeCrystal')) {
      // 物品态生命水晶(Player.cs:29358:item 29,statLifeMax<400 → +20)
      if (this.player.baseMaxHp >= 400) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached'));
      } else {
        this.player.baseMaxHp += 20;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
        this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#40E080');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef?.key === 'vi_109_mana_crystal') {
      // 魔力水晶(Player.cs:44655:statManaMax<200 → +20 上限并回复)
      if (this.player.baseMaxMana >= 200) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ManaMaxReached'));
      } else {
        this.player.baseMaxMana += 20;
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + 20);
        this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#4080FF');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef?.key === 'vi_1291_life_fruit') {
      // 生命果(Player.cs:44665:statLifeMax≥400 且 <500 → +5)
      if (this.player.baseMaxHp < 400) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedLifeCrystalFirst'));
      } else if (this.player.baseMaxHp >= 500) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached500'));
      } else {
        this.player.baseMaxHp += 5;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 5);
        this.addDamageNumber(this.player.cx, this.player.y, 5, false, '#40E080');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef?.ranged && inp.mouseDown && this.player.useTime === 0) {
      // 远程武器（弓）：PickAmmo + ItemCheck_Shoot 1:1（Player.cs:52590+/46426）
      //   速度 = 弓 shootSpeed + 弹药 shootSpeed；伤害 = 弓 damage + 弹药 damage；
      //   击退 = 弓 kb + 弹药 kb；投射物类型 = 弹药 shoot；音效 = 弓 UseSound(Item5)
      //   弹药查找：原版先扫 54-57 弹药栏（我们无弹药栏），再扫背包 0-53 第一组
      const rg = heldDef.ranged;
      const bowC = rg.vid != null ? itemCombat(rg.vid) : null;
      const useAmmo = bowC?.useAmmo ?? AMMO_ARROW;
      // PickAmmo：背包顺序第一组 useAmmo 匹配的弹药物品
      let ammoSlot = -1;
      let ammoDef: (typeof ITEM_DEFS)[number] | null = null;
      for (let i = 0; i < this.player.inv.slots.length; i++) {
        const sl = this.player.inv.slots[i];
        if (!sl || sl.stack <= 0) continue;
        const d = ITEM_DEFS[sl.id];
        if (d?.ammoId === useAmmo) { ammoSlot = i; ammoDef = d; break; }
      }
      if (ammoSlot >= 0 && ammoDef) {
        const ammoC = ammoDef.vid != null ? itemCombat(ammoDef.vid) : null;
        const speed = (bowC?.shootSpeed ?? rg.projSpeed) + (ammoC?.shootSpeed ?? 0);
        const damage = (bowC?.damage ?? rg.damage) + (ammoC?.damage ?? 0);
        const knockback = (bowC?.knockBack ?? rg.knockback) + (ammoC?.knockBack ?? 0);
        const projId = ammoC?.shoot ?? 1; // PickAmmo：projToShoot = item.shoot（1 木箭 2 燃烧箭）
        const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
        const ax = this.player.cx + Math.cos(ang) * 14;
        const ay = this.player.cy - 4 + Math.sin(ang) * 14;
        // 回收掉落：仅非点燃弹（原版燃烧箭 Kill 不掉）
        const dropKey = projId === 1 ? ammoDef.key : null;
        this.entities.add(new Arrow(ax, ay, Math.cos(ang) * speed, Math.sin(ang) * speed,
          damage, knockback, projId, dropKey), 'projectiles');
        this.player.inv.removeAt(ammoSlot, 1);
        this.player.useTime = bowC?.useTime ?? rg.speed;
        this.sfx.play('bowShoot');
        this.cb.onInventoryChanged();
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && cw) {
      // vi_* 数据驱动武器（1456 aiStyle 家族）：回旋镖/长矛/悠悠球/连枷/手雷/魔法/直射兜底。
      // 必须排在 thrownCombat 之前——手雷(166 等)满足投掷判定但语义是 ai16 弹跳引信
      this.useCombatWeapon(cw, heldDef);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && thrownCombat(heldDef)) {
      // 消耗型投掷武器（手里剑/飞刀/毒刀等，Item.shoot + consumable + noMelee 且无 useAmmo）：
      // 朝鼠标投出 item.shoot 投射物，消耗 1 个，数值全取 vanilla-itemcombat.json；
      // 投射物复用 Arrow（重力 0.3/tick = 原版 aiStyle 2 抛物线同值；命中可回收）
      const tc = thrownCombat(heldDef)!;
      const vid = heldDef.vid ?? viIdFromKey(heldDef.key);
      const c = itemCombat(vid);
      const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
      const px = this.player.cx + Math.cos(ang) * 14;
      const py = this.player.cy - 4 + Math.sin(ang) * 14;
      // 穿透取原版 penetrate（手里剑 4；-1 无限上限 6）
      let pen = projectileData(tc.shoot)?.penetrate ?? 1;
      if (pen < 0) pen = 6;
      pen = Math.max(1, Math.min(pen, 6));
      this.entities.add(new Arrow(px, py,
        Math.cos(ang) * (c?.shootSpeed ?? 9), Math.sin(ang) * (c?.shootSpeed ?? 9),
        tc.damage, c?.knockBack ?? 0, tc.shoot, heldDef.key, { pierce: pen }), 'projectiles');
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = c?.useTime ?? 15;
      this.sfx.play('throw');
      this.cb.onInventoryChanged();
    } else if (heldDef && (heldDef.key === 'worm_food' || heldDef.key === 'bloody_spine' || heldDef.key === 'slime_crown')
      && inp.mouseDown && this.player.useTime === 0) {
      // Boss 召唤物(原版 worm food/bloody spine/slime crown)
      if (heldDef.key === 'worm_food') this.summonBoss('eater_of_worlds_head');
      else if (heldDef.key === 'bloody_spine') this.summonBoss('brain_of_cthulhu');
      else this.summonBoss('king_slime');
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = 60;
      this.cb.onInventoryChanged();
      this.input.mouseDown = false;
    } else if (heldDef && (heldDef.key === 'mechanical_worm' || heldDef.key === 'mechanical_eye' || heldDef.key === 'mechanical_skull')
      && inp.mouseDown && this.player.useTime === 0) {
      // 机械三王召唤物(原版 556/544/557:需困难模式+夜晚)
      if (!this.world.flags.hardMode) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.MechNotAwake'));
      } else if (this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      } else {
        if (heldDef.key === 'mechanical_worm') this.summonBoss('destroyer');
        else if (heldDef.key === 'mechanical_eye') this.summonBoss('twins');
        else this.summonBoss('skeletron_prime');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef?.magic && inp.mouseDown && this.player.useTime === 0) {
      // 魔法武器:消耗 mana → 发射魔法弹(Player.ItemCheck_Shoot 语义)
      const mg = heldDef.magic;
      if (this.player.mana < mg.manaCost) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NoMana'));
        this.input.mouseDown = false;
      } else {
        this.player.mana -= mg.manaCost;
        const ang = Math.atan2(inp.mouseY - vh2 / 2, inp.mouseX - vw2 / 2);
        const mx = this.player.cx + Math.cos(ang) * 14;
        const my = this.player.cy - 4 + Math.sin(ang) * 14;
        const color = mg.proj === 'bolt' ? '#A040FF' : '#FFB040';
        const proj = new MagicProj(mx, my, Math.cos(ang) * mg.projSpeed, Math.sin(ang) * mg.projSpeed, mg.damage, 45, color);
        this.entities.add(proj, 'projectiles');
        this.player.useTime = mg.speed;
        this.sfx.play('tink');
        this.input.mouseDown = false;
      }
    } else if (heldDef && (heldDef.key === 'empty_bucket' || heldDef.key === 'water_bucket'
      || heldDef.key === 'lava_bucket' || heldDef.key === 'honey_bucket')) {
      this.useBucket(heldDef.key, tx, ty);
    }
    this.mining = null;
  }

  /** vi_* 数据驱动武器使用派发（combatWeapon 解析出的 aiStyle 家族）。
   *  数值全部取 vanilla-itemcombat.json（damage/knockBack/useTime/shootSpeed/mana），
   *  行为取 1456 aiStyle 语义（WeaponProj.ts 各实体） */
  private useCombatWeapon(cw: Exclude<CombatWeapon, { kind: 'melee' }>, def: (typeof ITEM_DEFS)[number]) {
    const inp = this.input;
    const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
    const px = this.player.cx + Math.cos(ang) * 14;
    const py = this.player.cy - 4 + Math.sin(ang) * 14;
    const consume = () => {
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.cb.onInventoryChanged();
    };
    switch (cw.kind) {
      case 'grenade': {
        // AI_016：引信（原版 timeLeft：手雷 180 / 炸弹 150 / 炸药 135）弹跳后爆炸；
        // 伤害下限 60（手雷 item damage=0，威力在爆炸不在直击）
        const fuse = cw.shoot === 29 ? 150 : cw.shoot === 30 ? 135 : 180;
        const dmg = cw.shoot === 30 ? 250 : Math.max(cw.damage, 60);
        this.entities.add(new GrenadeProj(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          dmg, fuse, cw.shoot, (ex, ey, edmg) => this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE), edmg)), 'projectiles');
        consume();
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'boomerang': {
        // AI_003：飞出减速→返回主角（非消耗，回手即消失）
        this.entities.add(new Boomerang(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'spear': {
        // AI_019：随角色前刺（一个 useTime 周期伸缩一次）
        const reach = Math.min(170, 60 + cw.shootSpeed * 12);
        this.entities.add(new SpearProj(Math.cos(ang), Math.sin(ang), reach, cw.useTime,
          cw.damage, cw.knockback, cw.shoot), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'yoyo':
      case 'flail': {
        // AI_099 channel：同物品已有悠悠球在场则不重复掷出（原版每把悠悠球仅一个）
        const flail = cw.kind === 'flail';
        const itemId = ITEM_BY_KEY[def.key];
        for (const e of this.entities.projectiles) {
          const y = e as YoyoProj;
          if (y instanceof YoyoProj && y.projId === cw.shoot) return;
        }
        const stringLen = flail ? 200 + cw.shootSpeed * 10 : 220 + cw.shootSpeed * 10;
        this.entities.add(new YoyoProj(px, py, cw.damage, cw.knockback, cw.shoot, stringLen,
          () => this.input.mouseDown && !this.input.uiBlocking && this.player.inv.heldItem()?.id === itemId,
          () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
          flail), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        this.input.mouseDown = false; // 本击只负责掷出，滞留由 channel 回调判定
        break;
      }
      case 'magic': {
        // 魔法：消耗 mana（原版 mana 字段）→ 发射 item.shoot（贴图/穿透/寿命取投射物表）
        if (this.player.mana < (cw.mana ?? 0)) {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NoMana'));
          this.input.mouseDown = false;
          return;
        }
        this.player.mana -= cw.mana ?? 0;
        const pd = projectileData(cw.shoot);
        let pen = pd?.penetrate ?? 1;
        if (pen < 0) pen = 3;
        pen = Math.max(1, Math.min(pen, 3));
        this.entities.add(new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: projGravity(cw.shoot), life: pd?.timeLeft ?? 600, pierce: pen }), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('tink');
        this.input.mouseDown = false;
        break;
      }
      case 'shot': {
        // 兜底直射（附魔剑光束等 melee/ranged+shoot 未归族项）：重力按 aiStyle
        const pd = projectileData(cw.shoot);
        this.entities.add(new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: projGravity(cw.shoot), life: pd?.timeLeft ?? 600, pierce: 1 }), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('bowShoot');
        break;
      }
      default:
        return;
    }
    void def;
  }

  private toolCanBreak(type: number, power: number, toolType: string): boolean {
    const d = TILE_DEFS[type];
    if (!d) return false;
    if (toolType === 'pick') return d.pick >= 0 && power >= d.pick;
    if (toolType === 'axe') return d.axe >= 0;
    return false;
  }

  private tryMine(tx: number, ty: number, power: number, toolType: 'pick' | 'axe' | 'hammer', speed: number) {
    // 范围检查
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (Math.hypot(dx, dy) > 4.5) { this.mining = null; return; }
    const type = this.world.store.get(tx, ty);
    // 锤：敲除背景墙（无墙则无事发生；也可清装饰）
    if (toolType === 'hammer') {
      // 原版语义:锤子优先循环实心块状态(整块→半砖→整块;坡面渲染未实现暂两态)
      if (type !== 0 && this.world.store.isSolid(tx, ty) && this.tickCount - this.lastMineHitTick >= Math.max(8, speed)) {
        this.lastMineHitTick = this.tickCount;
        const i = this.world.store.idx(tx, ty);
        const cur = this.world.store.half[i];
        this.world.store.setHalfBrick(tx, ty, !cur);
        this.sfx.play('tink');
        this.mining = null;
        return;
      }
      const wall = this.world.store.get(tx, ty) === 0 ? this.world.store.wall[this.world.store.idx(tx, ty)] : 0;
      if (type !== 0 && TILE_DEFS[type]?.decor) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      if (!wall) { this.mining = null; return; }
      // HitTile 制（type 2 = 墙）：每挥一击，阈值 100
      if (this.tickCount - this.lastMineHitTick < Math.max(8, speed)) {
        this.hardnessCache = 100;
        this.mining = { x: tx, y: ty, progress: this.hitTiles.getDamage(tx, ty, 2) };
        return;
      }
      this.lastMineHitTick = this.tickCount;
      const total = this.hitTiles.addDamage(tx, ty, Math.round(power * 2), 2); // 锤墙：木 5 击 / 铜 2 击
      this.hardnessCache = 100;
      this.mining = { x: tx, y: ty, progress: total };
      this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 2, 1.2);
      if (total >= 100) {
        this.hitTiles.clear(tx, ty, 2);
        this.world.store.setWall(tx, ty, 0);
        this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 8, 1.8);
        this.sfx.play('chop');
        this.mining = null;
      }
      return;
    }
    if (type === 0 || !this.toolCanBreak(type, power, toolType)) {
      // 装饰物（杂草等）任意工具/武器一下清掉并掉落
      if (type !== 0 && TILE_DEFS[type]?.decor && (toolType === 'pick' || toolType === 'axe')) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      this.mining = null;
      return;
    }
    // ---- 原版 HitTile 制（Player.PickTile 移植）：每挥一击积累伤害，阈值 100 破坏 ----
    // 每挥一击（按工具速度节流），伤害 = 工具力 × 材质系数（GetPickaxeDamage 简化）
    if (this.tickCount - this.lastMineHitTick < Math.max(8, speed)) {
      // 节流窗内：只刷新裂缝显示，不积累
      this.hardnessCache = 100;
      this.mining = { x: tx, y: ty, progress: this.hitTiles.getDamage(tx, ty) };
      return;
    }
    this.lastMineHitTick = this.tickCount;
    const d = TILE_DEFS[type];
    // 原版 GetPickaxeDamage：普通块 = 镐力；泥土族（0/40/53/57/59/123/147/224/397）= 镐力×2。
    // 矿石无系数（只靠镐力门槛 gate）；家具软质 ×2 保持原版 tileNoFail 方向。
    // 斧 = 斧力×1.2（原版 Player.cs:29576）——绝对值配原版节奏需十击太多，
    // 按同比例放大（≈斧力×5.5）适配我们的挥击间隔+衰减：铜斧 7→39（3 击）/ 金斧 11→61（2 击）
    let dmg: number;
    if (type === T.TREE || IMPORTED_TREE_TYPES.has(type)) {
      dmg = toolType === 'axe' ? Math.round(power * 5.5) : power;
    } else if (toolType === 'axe') {
      dmg = Math.round(power * 5.5);
    } else if (d.decor || (d.framed && !d.solid)) {
      dmg = power * 2;
    } else {
      const dirtFamily = /^(dirt|grass|sand|snow|mud|silt|clay|ash|slush|ebonsand|crimsand|pearlsand|hardened_sand)/i.test(d.key)
        || d.key === 'v_123_silt' || d.key === 'v_224_slush_block' || d.key === 'v_397_hardened_sand' || d.key === 'v_112_ebonsand_block';
      dmg = power * (dirtFamily ? 2 : 1);
    }
    const total = this.hitTiles.addDamage(tx, ty, dmg);
    this.hardnessCache = 100;
    this.mining = { x: tx, y: ty, progress: total }; // 裂缝显示 = 积累进度
    this.spawnParticles(tx * TILE + 8, ty * TILE + 8, d.mapColor, 2, 1.2);
    if (total >= 100) {
      this.hitTiles.clear(tx, ty);
      this.breakTile(tx, ty);
      this.mining = null;
      // 破坏完成音：按材质区分
      if (toolType === 'axe') this.sfx.play('chop');
      else if (/stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(d.key)) this.sfx.play('tink');
      else this.sfx.play('dig');
    }
  }

  private tileHardness(type: number): number {
    const d = TILE_DEFS[type];
    // 铜镐基准（52/tick）：泥土 ~0.25s / 石 ~0.6s / 铜矿 ~0.8s / 金矿 ~1.6s
    // 树（斧）：木斧 ~2s / 铜斧 ~1s / 金斧 ~0.4s
    if (type === T.TREE) return 3400;
    if (type === T.LEAVES) return 40;
    if (d.decor) return 60;
    if (d.framed && !d.solid) return 300;               // 工作台/铁砧等
    switch (type) {
      case T.DIRT: case T.GRASS: case T.SAND: case T.SNOW: return 780;
      case T.STONE: return 1870;
      case T.WOOD: case T.PLATFORM: return 1250;
      case T.ORE_COPPER: return 2500;
      case T.ORE_IRON: return 3100;
      case T.ORE_SILVER: return 4100;
      case T.ORE_GOLD: return 5000;
      default: return 1000;
    }
  }

  /** 破坏 tile：处理树整体砍伐与 object 锚点 */
  private breakTile(x: number, y: number) {
    const st = this.world.store;
    const type = st.get(x, y);
    if (type === 0) return;
    const def = TILE_DEFS[type];

    // 树：砍树干 → 整棵树倒下（自有树 + 导入的原版树族）
    if (type === T.TREE) {
      this.fellTree(x, y);
      return;
    }
    // 暗影之球/恶魔之心：整体破碎（原版 WorldGen.CheckOrb 移植）
    if (type === TILE_BY_KEY['v_31_orb_heart']) {
      this.smashOrbHeart(x, y);
      return;
    }
    // 瓦罐：统一走 smashPot（整罐洪水填充 + loot）。
    // 不能落入下方 object 锚点分支——瓦罐帧编码是【底行 frameY=0、顶行 frameY=18】
    // （贴图表视觉 Y 偏移，与家具的"顶行 0"相反），锚点公式会按 gy 上移 →
    // 清掉罐底下一格的地面、罐体留在原地 → 可重复破坏刷战利品
    if (type === POT_TILE) {
      this.smashPot(x, y);
      return;
    }
    if (IMPORTED_TREE_TYPES.has(type)) {
      this.fellImportedTree(x, y, type);
      return;
    }
    // 幼虫（原版 KillTile case 231, WorldGen.cs:53254-53280）：整件破碎无掉落，
    // 300 格内召蜂后——须在 object 锚点分支前拦（否则按家具掉 place_ 物品）
    if (type === TILE_BY_KEY['v_231_larva']) {
      this.breakLarva(x, y);
      return;
    }
    // 蜂巢块（原版 KillTile case 225, WorldGen.cs:65524-65545）：1/3 变满蜂蜜
    // （打破流蜜），否则掉蜂巢物品 + 1/2 概率出 1-2 只蜜蜂
    if (type === TILE_BY_KEY['v_225_hive_block']) {
      this.breakHive(x, y);
      return;
    }
    // 门：竖排帧布局（Door.ts），通用锚点算法不适用，整扇移除
    const doorAnchor = clearDoorAt(st, x, y);
    if (doorAnchor) {
      this.spawnDrop(doorAnchor[0] * TILE + 8, doorAnchor[1] * TILE, def.drop ?? 'door', 1);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 8, 1.8);
      return;
    }
    // object：找锚点整体移除。锚点 = 命中格 (2w-1)×(2h-1) 邻域内同类型、帧相位为 (0,0)
    // （fv%(w*18)==0 且 fyv%(h*18)==0，兼容 style 偏移）、且 w×h 框包含命中格的候选中
    // 帧最小的格——两个同款物体紧邻时也能选对所属的那件（全局最小帧会误选隔壁那件）；
    // 候选落空回退帧最小格（约定无关：家具顶行锚/陶罐底行锚均可）
    if ((def.w ?? 1) > 1 || (def.h ?? 1) > 1) {
      const ow = def.w ?? 1, oh = def.h ?? 1;
      let ax = x, ay = y, best = Infinity, hasCandidate = false;
      for (let dx = -(ow - 1); dx <= ow - 1; dx++) {
        for (let dy = -(oh - 1); dy <= oh - 1; dy++) {
          const nx = x + dx, ny = y + dy;
          if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== type) continue;
          const ni = st.idx(nx, ny);
          const key = st.frameY[ni] * 4096 + st.frameX[ni];
          const phaseAnchor = st.frameX[ni] % (ow * 18) === 0 && st.frameY[ni] % (oh * 18) === 0;
          const boxContains = nx <= x && nx + ow > x && ny <= y && ny + oh > y;
          if (phaseAnchor && boxContains) {
            // 合格候选：相位 (0,0) 且框包含命中格
            if (!hasCandidate || key < best) { hasCandidate = true; best = key; ax = nx; ay = ny; }
          } else if (!hasCandidate && key < best) {
            best = key; ax = nx; ay = ny;
          }
        }
      }
      for (let dx = 0; dx < ow; dx++) {
        for (let dy = 0; dy < oh; dy++) {
          st.setTile(ax + dx, ay + dy, 0);
        }
      }
      // 掉落:drop:null = 显式无掉落(原版装饰类,如 165 冰凌/蛛网卵袋);仅 undefined
      // 才走 v_ 回收兜底(place_v_ 再放置)。曾用 ?? ——null 同样触发兜底,null 语义失效
      const dropKey = def.drop === undefined ? (def.key.startsWith('v_') ? 'place_' + def.key : '') : def.drop;
      if (dropKey) this.spawnDrop(ax * TILE + 8, ay * TILE, dropKey, 1);
      // 宝箱内容物掉出
      if (type === T.CHEST) this.dumpChest(ax, ay);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 8, 1.8);
      return;
    }
    // 可砍植物（Main.tileCut）：清格 + 拂草声（SoundID 6 = Grass.wav）。
    // 蘑菇类例外可采集（KillTile_GetItemDrops，WorldGen.cs:65041-65076）：
    //   tile 3 帧 144（蘑菇）→ item 5 / tile 24 帧 144（邪恶蘑菇）→ item 60
    //   tile 201 帧 270（血腥蘑菇）→ item 2887——其余 plant 类无掉落
    if (type !== POT_TILE && TILE_CUT.has(type)) {
      st.setTile(x, y, 0);
      this.sfx.play('chop');
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 5, 1.4);
      const sheet = def.vanilla?.sheet;
      const fx = st.frameX[st.idx(x, y)];
      const mushroomDrop =
        sheet === 3 && fx === 144 ? 'mushroom_item'
          : sheet === 24 && fx === 144 ? VANILLA_ITEM_KEY_BY_ID[60]
            : sheet === 201 && fx === 270 ? VANILLA_ITEM_KEY_BY_ID[2887]
              : null;
      if (mushroomDrop && ITEM_BY_KEY[mushroomDrop] !== undefined) {
        this.spawnDrop(x * TILE + 8, y * TILE + 8, mushroomDrop, 1);
      }
      return;
    }
    // 瓦罐分支已上移到函数顶部（smashPot 统一处理）；此处到达即防御性清格
    if (type === POT_TILE) {
      st.setTile(x, y, 0);
      return;
    }
    // 普通
    st.setTile(x, y, 0);
    // 破坏树木正下方的支撑方块 → 整棵树倒下（掉木材）
    const treeOnTop = this.world.trees.find((t) => t.x === x && t.y + t.h === y);
    if (treeOnTop) this.fellTree(x, y - 1);
    if (def.drop) this.spawnDrop(x * TILE + 8, y * TILE + 8, def.drop, 1);
    else if (def.key.startsWith('v_')) this.spawnDrop(x * TILE + 8, y * TILE + 8, 'place_' + def.key, 1);
    this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 6, 1.5);
  }

  /** 蜂巢块破坏（KillTile case 225 → world/hive.ts）：流蜜或掉物+出蜂 */
  private breakHive(x: number, y: number) {
    const st = this.world.store;
    const rng = new RNG((Math.random() * 1e9) | 0);
    const hive = TILE_BY_KEY['v_225_hive_block']!;
    breakHiveBlock(st, x, y, rng, {
      dropHiveItem: (px, py) => this.spawnDrop(px, py, 'place_v_225_hive_block', 1),
      spawnBee: (px, py, r) => {
        // type=Next(210,212)；初速 ±0.4（Next(-200,201)*0.002）
        const bee = Enemy.fromVanilla(r.next() < 0.5 ? 210 : 211, px, py);
        if (!bee) return;
        bee.vx = (r.next() - 0.5) * 0.8;
        bee.vy = (r.next() - 0.5) * 0.8;
        bee.id = this.entities.nextId++;
        this.entities.add(bee, 'enemies');
      },
    });
    this.spawnParticles(x * TILE + 8, y * TILE + 8, TILE_DEFS[hive].mapColor, 6, 1.5);
  }

  /** 幼虫破坏（KillTile case 231）：3×3 整件清除 + 300 格内召蜂后（无掉落） */
  private breakLarva(x: number, y: number) {
    const st = this.world.store;
    const larva = TILE_BY_KEY['v_231_larva']!;
    // 命中格 ±2 邻域内同类型全清（幼虫恒为单件 3×3，紧邻第二件的场景不存在）
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (st.inBounds(x + dx, y + dy) && st.get(x + dx, y + dy) === larva) st.setTile(x + dx, y + dy, 0);
      }
    }
    this.spawnParticles(x * TILE + 8, y * TILE + 8, '#E0C265', 10, 2);
    // 距离判定 + 蜂后召唤（原版 SpawnOnPlayer(222)；boss 流程复用 summonBoss）
    if (larvaSummonInRange(this.player.x, this.player.y, x, y)) {
      this.summonBoss('queen_bee');
    }
  }

  private fellTree(x: number, y: number) {
    // 向上找树顶（同列 TREE tile），向下到 Grass
    const st = this.world.store;
    let top = y;
    while (st.get(x, top - 1) === T.TREE) top--;
    let bottom = y;
    while (st.get(x, bottom + 1) === T.TREE) bottom++;
    const height = bottom - top + 1;
    // 树冠 80×80 以树顶为中心外扩 2-3 格：显式区域标脏，
    // 否则不含树干格的邻 chunk 不会重绘 → 树叶残留
    this.chunks.markDirtyArea(x - 4, top - 4, x + 4, bottom + 1);
    // 清除树干 + 两侧树枝（支干只在紧邻树干处生成，不会误伤邻树），并记录枝干位置
    const branchSpots: Array<{ x: number; y: number }> = [];
    for (let yy = top; yy <= bottom; yy++) {
      st.setTile(x, yy, 0);
      for (const s of [-1, 1]) {
        if (st.get(x + s, yy) === T.TREE) {
          branchSpots.push({ x: x + s, y: yy });
          st.setTile(x + s, yy, 0);
        }
      }
    }
    // 清除树冠（树顶周围半径 3 的 LEAVES）
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -4; dy <= 1; dy++) {
        if (st.get(x + dx, top + dy) === T.LEAVES) st.setTile(x + dx, top + dy, 0);
      }
    }
    // 掉木材：树干每段 1 个独立掉落物沿干散落；每根枝干也额外掉 1 份（掉在枝干处）
    const wood = Math.max(1, Math.floor(height * 0.8));
    for (let p = 0; p < wood; p++) {
      const dropY = (top + Math.floor((p + 0.5) * height / wood)) * TILE;
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    for (const b of branchSpots) {
      this.spawnDrop(b.x * TILE + 8, b.y * TILE + 8, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：较大概率（75%）掉 2-3 颗，沿树冠区域散落供补种
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'acorn', 1, (Math.random() - 0.5) * 3, -3 - Math.random());
      }
    }
    this.spawnParticles(x * TILE + 8, top * TILE + 8, '#2E8B3D', 14, 2.2);
    // 从登记表移除
    const t = this.world.trees.findIndex((tr) => tr.x === x && Math.abs(tr.y - top) <= 2);
    if (t >= 0) this.world.trees.splice(t, 1);
  }

  /** 砍导入的原版树（tile 5 / 宝石树 / 装饰树 / 灰烬树）：
   *  同列同类型连续段 = 整棵树（含顶部树冠标记格），整棵移除 + 掉木材。
   *  首击即倒（不做倒树动画——动画实体绑定自有树的登记表结构） */
  /** 暗影之球/恶魔之心整体破碎（原版 WorldGen.CheckOrb 移植，WorldGen.cs:31813-31960）：
   *  帧锚点定位（frameX∈{0,36} 是左列）→ 2×2 四格一起清除；
   *  战利品：首破固定（暗影之球:恶魔之心 + 凝胶100；恶魔之心:生命水晶 + 凝胶100），
   *  之后 5 选 1 随机；无原版物品的部分用现有道具近似 */
  private smashOrbHeart(x: number, y: number) {
    const st = this.world.store;
    const orbId = TILE_BY_KEY['v_31_orb_heart'];
    const i = st.idx(x, y);
    const fx = st.frameX[i];
    const isDemonHeart = fx >= 36; // 原版：frameX ≥ 36 = 恶魔之心（猩红世界）
    const ax = (fx === 0 || fx === 36) ? x : x - 1;
    const ay = st.frameY[i] !== 0 ? y - 1 : y;
    this.chunks.markDirtyArea(ax - 1, ay - 1, ax + 2, ay + 2);
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) st.setTile(ax + dx, ay + dy, 0);
    }
    // 战利品（近似：首破固定 + 之后随机）
    const drops: Array<[string, number]> = !this.world.flags.shadowOrbSmashed
      ? (isDemonHeart ? [['coin_gold', 1], ['gel', 100]] : [['suspicious_eye', 1], ['gel', 100]])
      : [['coin_silver', 5], ['gel', 60]];
    for (const [key, n] of drops) {
      this.spawnDrop(ax * TILE + 8, ay * TILE + 8, key, n, (Math.random() - 0.5) * 3, -3);
    }
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, isDemonHeart ? '#FF4060' : '#9A6AE0', 16, 2.5);
    this.sfx.play('tink');
    this.cb.onToast(isDemonHeart ? Lang.text('Mods.SandboxWorld.Toast.DemonHeartSmashed') : Lang.text('Mods.SandboxWorld.Toast.ShadowOrbSmashed'));
    if (!this.world.flags.shadowOrbSmashed) {
      this.world.flags.shadowOrbSmashed = true;
    }
  }

  private fellImportedTree(x: number, y: number, type: number) {
    const st = this.world.store;
    let top = y;
    while (st.get(x, top - 1) === type) top--;
    let bottom = y;
    while (st.get(x, bottom + 1) === type) bottom++;
    const height = bottom - top + 1;
    this.chunks.markDirtyArea(x - 6, top - 7, x + 6, bottom + 1);
    // 清树干列 + 紧邻的侧枝（同类型，仅 ±1 防 "格洞" 残留）
    for (let yy = top; yy <= bottom; yy++) {
      st.setTile(x, yy, 0);
      for (const s of [-1, 1]) {
        if (st.get(x + s, yy) === type) st.setTile(x + s, yy, 0);
      }
    }
    // 掉木材（与自有树同比例）+ 树顶枝条额外几份
    const wood = Math.max(1, Math.floor(height * 0.8));
    for (let p = 0; p < wood; p++) {
      const dropY = (top + Math.floor((p + 0.5) * height / wood)) * TILE;
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：与自有树同规则（75% 掉 2-3 颗，沿树冠区域散落供补种）
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'acorn', 1, (Math.random() - 0.5) * 3, -3 - Math.random());
      }
    }
    this.spawnParticles(x * TILE + 8, top * TILE + 8, '#2E8B3D', 14, 2.2);
  }

  /** 电路工具使用(原版 Player.cs:30289-30444 ItemCheck_UseWiringTools) */
  private useWireTool(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (Math.hypot(dx, dy) > 8.5) return; // 原版 tileBoost 20,放宽到 8.5 格
    if (this.player.useTime > 0) return;
    const wt = itemDef.wireTool!;
    const inv = this.player.inv;

    // 致动魔杖:手动翻转(useTime 防连按)
    if (wt.rod) {
      if (w.actuate(tx, ty)) {
        this.player.useTime = 15;
        this.sfx.play('tink');
      }
      return;
    }
    // 剪线钳:按优先级移除一件(致动器>黄>绿>蓝>红)
    if (wt.cutter) {
      const done =
        w.killActuator(tx, ty) ||
        w.killWire(tx, ty, TileStore.WIRE_YELLOW) ||
        w.killWire(tx, ty, TileStore.WIRE_GREEN) ||
        w.killWire(tx, ty, TileStore.WIRE_BLUE) ||
        w.killWire(tx, ty, TileStore.WIRE_RED);
      if (done) { this.player.useTime = 5; this.sfx.play('dig'); }
      return;
    }
    // 宏伟蓝图:按下记锚点,松开执行 L 形批量
    if (wt.grand) {
      if (!this.grandAnchor) { this.grandAnchor = [tx, ty]; return; }
      const a = this.grandAnchor;
      this.grandAnchor = null;
      const mode = this.wireToolMode;
      const wires = mode & TOOL_CUTTER ? 9999 : inv.countOf(ITEM_BY_KEY['wire'] ?? -1);
      const actuators = mode & TOOL_CUTTER ? 9999 : inv.countOf(ITEM_BY_KEY['actuator_item'] ?? -1);
      const res = w.massWireOperation(a, [tx, ty], mode, wires, actuators);
      if (!(mode & TOOL_CUTTER)) {
        if (res.wire > 0) inv.remove(ITEM_BY_KEY['wire'] ?? -1, res.wire);
        if (res.actuator > 0) inv.remove(ITEM_BY_KEY['actuator_item'] ?? -1, res.actuator);
      }
      this.player.useTime = 10;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
      return;
    }
    // 五彩扳手:单点,用当前模式
    const mode = itemDef.key === 'multicolor_wrench' ? this.wireToolMode : (wt.place ?? 0);
    if (mode & TOOL_CUTTER) {
      const done =
        (mode & TOOL_ACTUATOR ? w.killActuator(tx, ty) : false) ||
        (mode & TOOL_YELLOW ? w.killWire(tx, ty, TileStore.WIRE_YELLOW) : false) ||
        (mode & TOOL_GREEN ? w.killWire(tx, ty, TileStore.WIRE_GREEN) : false) ||
        (mode & TOOL_BLUE ? w.killWire(tx, ty, TileStore.WIRE_BLUE) : false) ||
        (mode & TOOL_RED ? w.killWire(tx, ty, TileStore.WIRE_RED) : false);
      if (done) { this.player.useTime = 5; this.sfx.play('dig'); }
      return;
    }
    // 扳手/致动器放置
    let needWire = 0, needActuator = 0;
    const colorBits: Array<[number, number]> = [
      [TOOL_RED, TileStore.WIRE_RED], [TOOL_GREEN, TileStore.WIRE_GREEN],
      [TOOL_BLUE, TileStore.WIRE_BLUE], [TOOL_YELLOW, TileStore.WIRE_YELLOW],
    ];
    for (const [m, bit] of colorBits) if (mode & m && !(st.wire[st.idx(tx, ty)] & bit)) needWire++;
    if (mode & TOOL_ACTUATOR && !(st.wire[st.idx(tx, ty)] & TileStore.WIRE_ACTUATOR)) needActuator++;
    const wireHave = inv.countOf(ITEM_BY_KEY['wire'] ?? -1);
    const actHave = inv.countOf(ITEM_BY_KEY['actuator_item'] ?? -1);
    if (needWire > wireHave || needActuator > actHave) {
      this.cb.onToast(needActuator > actHave ? Lang.text('Mods.SandboxWorld.Toast.NoActuator') : Lang.text('Mods.SandboxWorld.Toast.NoWire'));
      return;
    }
    let placed = false;
    for (const [m, bit] of colorBits) {
      if (mode & m && w.placeWire(tx, ty, bit)) placed = true;
    }
    if (mode & TOOL_ACTUATOR && w.placeActuator(tx, ty)) placed = true;
    if (placed) {
      if (needWire > 0) inv.remove(ITEM_BY_KEY['wire'] ?? -1, needWire);
      if (needActuator > 0) inv.remove(ITEM_BY_KEY['actuator_item'] ?? -1, needActuator);
      this.player.useTime = 5;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
    }
    void dy;
  }

  private tryPlace(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // 距离
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (Math.hypot(dx, dy) > 5.5) return;
    const tileId = TILE_BY_KEY[itemDef.tile!];
    const def = TILE_DEFS[tileId];
    // 橡实: 只能种在草块正上方
    if (itemDef.key === 'acorn' && st.get(tx, ty + 1) !== T.GRASS) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.AcornGrassOnly'));
      return;
    }
    const ow = def.w ?? 1, oh = def.h ?? 1;
    // 绳索(RopeCoil 语义):从放置点向下延伸至实心/最多 10 格
    if (itemDef.key === 'rope') {
      const ropeTile = TILE_BY_KEY['v_213_rope']!;
      let placed = 0;
      for (let y = ty; y < ty + 10; y++) {
        if (!st.inBounds(tx, y) || st.isActive(tx, y)) break;
        st.setTile(tx, y, ropeTile, 0, 0);
        placed++;
      }
      if (placed > 0) {
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 14;
        this.sfx.play('place');
        this.cb.onInventoryChanged();
      }
      return;
    }
    // 火把锚定（TileObjectData tile4 + TileObject.CanPlace 1:1）：
    // 底锚(0)→左锚(22)→右锚(44)→墙锚(0)；液体中拒绝（水炬样式 8/11/17 未实装）
    if (tileId === T.TORCH) {
      if (this.player.useTime > 0) return;
      if (st.isActive(tx, ty)) return;
      const frame = torchAnchorFrame(st, tx, ty);
      if (frame < 0 || st.liquid[st.idx(tx, ty)] > 0) return;
      st.setTile(tx, ty, tileId, frame, 0);
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = 14;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
      return;
    }
    // 放置空间检查
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        if (!st.inBounds(px, py)) return;
        if (st.isActive(px, py)) return;
        // 实心物不能与玩家重叠
        if (def.solid && this.overlapsEntity(px, py)) return;
      }
    }
    // 支撑检查：非漂浮（简化：需要任意相邻格有内容或墙）
    const needSupport = def.solid || def.platform || def.framed;
    if (needSupport && !this.hasSupport(tx, ty, ow, oh)) return;
    if (this.player.useTime > 0) return;

    // 放置
    const isVanillaStyle = !!def.vanilla && def.vanilla.frame === 'style';
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        // 原版多格家具：帧用 18px 步长偏移（与 .wld 原生一致，渲染端直用）。
        // 原版帧语义（TileObject.Place L74-102）：frameY 从【顶行 = 0】向下递增；
        // ty 是顶部行（放置时鼠标指向顶部锚点）→ dy2=0 即顶行，frameY = dy2*18 正确
        if (isVanillaStyle) {
          // placeStyle:样式索引 → X 偏移 style*fw*18(2 宽物件步长 36,3 宽 54)
          const strideX = (def.vanilla?.fw ?? 1) * 18;
          st.setTile(px, py, tileId, (itemDef.placeStyle ?? 0) * strideX + dx2 * 18, dy2 * 18);
        } else {
          st.setTile(px, py, tileId, dx2, dy2);
        }
        // 水被方块挤出：水量转移到相邻可容纳的格子（上/左/右），
        // 而不是被方块吞掉消失。封闭无处可去时才消失
        const pi = st.idx(px, py);
        const liq = st.liquid[pi];
        if (liq > 0) {
          const ltype = st.liquidType[pi];
          st.setLiquid(px, py, 0, 0);
          let remaining = liq;
          for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0]] as const) {
            if (remaining <= 0) break;
            const nx = px + ox, ny = py + oy;
            if (!st.inBounds(nx, ny)) continue;
            const nd = TILE_DEFS[st.type[st.idx(nx, ny)]];
            if (nd && nd.solid) continue;
            const ni = st.idx(nx, ny);
            const cap = 255 - st.liquid[ni];
            if (cap <= 0) continue;
            const t = Math.min(remaining, cap);
            st.setLiquid(nx, ny, st.liquid[ni] + t, ltype || st.liquidType[ni] || 1);
            remaining -= t;
          }
        }
      }
    }
    if (tileId === T.CHEST) {
      this.world.chests.push({ x: tx, y: ty, items: Array(10).fill(null) });
    }
    this.player.inv.removeAt(this.player.inv.selected, 1);
    this.player.useTime = 14;
    this.sfx.play('place');
    this.cb.onInventoryChanged();
  }

  private overlapsEntity(px: number, py: number): boolean {
    const rx = px * TILE, ry = py * TILE;
    if (this.player.x < rx + TILE && this.player.x + this.player.w > rx && this.player.y < ry + TILE && this.player.y + this.player.h > ry) return true;
    for (const e of this.entities.enemies) {
      if (e.x < rx + TILE && e.x + e.w > rx && e.y < ry + TILE && e.y + e.h > ry) return true;
    }
    return false;
  }

  private hasSupport(x: number, y: number, w: number, h: number): boolean {
    const st = this.world.store;
    // 下方
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y + h) || st.isSolid(x + dx, y + h) || st.wall[st.idx(x + dx, y + h)] !== 0) return true;
    }
    // 上方（火把等贴墙物）
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y - 1)) return true;
    }
    // 侧邻
    for (let dy = 0; dy < h; dy++) {
      if (st.isActive(x - 1, y + dy) || st.isActive(x + w, y + dy)) return true;
    }
    return false;
  }

  private interactAt(tx: number, ty: number) {
    const st = this.world.store;
    const type = st.get(tx, ty);
    if (type === T.DOOR_CLOSED) {
      this.toggleDoor(tx, ty, true);
    } else if (type === T.DOOR_OPEN) {
      this.toggleDoor(tx, ty, false);
    } else if (type === T.CHEST || this.wiring?.sheetOf(tx, ty) === 441 || this.wiring?.sheetOf(tx, ty) === 468) {
      // 陷阱箱 441/468 也走开箱流程(tryOpenChest 内触发电路+射镖)
      // 打开宝箱：精确命中或 3×3 容差（点击宝箱边缘也算）
      const chest = this.findChest(tx, ty) ?? this.findChestNear(tx, ty);
      if (chest) this.tryOpenChest(chest);
    } else if (type === TILE_BY_KEY['tombstone_v']) {
      // 墓碑：读碑文（原版 Sign 阅读；碑文在 2×2 锚点登记，点任意一格都能读到）
      const sign = this.world.signs.find((s) =>
        tx >= s.x && tx <= s.x + 1 && ty >= s.y && ty <= s.y + 1);
      if (sign) this.cb.onReadSign?.(sign.text);
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['crystal_heart']) {
      // 生命水晶(放置态):右键使用(Player.cs ItemCheck_UseLifeCrystal L29358)
      // statLifeMax<400 → +20 上限并回满该部分,放置物消耗
      this.usePlacedLifeCrystal(tx, ty);
    } else if (type === TILE_BY_KEY['bed']) {
      // 床:设重生点(vanilla Player.FindBed 语义;敌怪环绕检查略)
      this.world.spawnX = tx + 1;
      this.world.spawnY = ty - 1;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.SpawnSet'));
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_132_lever'] || type === TILE_BY_KEY['v_136_switch'] || type === TILE_BY_KEY['v_144_timers']) {
      // 拉杆/开关:切换通断(帧 +18 翻转),触发直线可见的陷阱(WorldGen Wiring 简化)
      this.toggleSwitch(tx, ty, type);
    } else if (type === TILE_BY_KEY['v_83_herbs_mature'] || type === TILE_BY_KEY['v_84_herbs_bloom']) {
      // 药草收获:成熟/开花态右键 → 掉种子(style = frameX/18,WorldGen.cs:38731)
      const i = st.idx(tx, ty);
      const style = Math.floor(st.frameX[i] / 18);
      st.setTile(tx, ty, 0);
      const seedKeys = ['vi_307_daybloom_seeds', 'vi_308_moonglow_seeds', 'vi_309_blinkroot_seeds',
        'vi_311_waterleaf_seeds', 'vi_310_deathweed_seeds', 'vi_312_fireblossom_seeds', 'vi_2357_shiverthorn_seeds'];
      const sk = seedKeys[style] ?? seedKeys[0];
      this.spawnDrop(tx * 16 + 8, ty * 16, sk, 1);
      this.input.rightDown = false;
    }
  }

  /** 放置态生命水晶使用(Player.cs:29358:statLifeMax≥400 拒绝,+20 上限+回复,消耗) */
  private usePlacedLifeCrystal(tx: number, ty: number): void {
    const st = this.world.store;
    const def = TILE_DEFS[st.get(tx, ty)];
    if (this.player.baseMaxHp >= 400) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached'));
      this.input.rightDown = false;
      return;
    }
    this.player.baseMaxHp += 20;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
    this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#40E080');
    // 消耗放置物(2×2)
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (st.get(tx + dx, ty + dy) === TILE_BY_KEY['crystal_heart']) st.setTile(tx + dx, ty + dy, 0);
      }
    }
    this.sfx.play('drink');
    this.input.rightDown = false;
    void def;
  }

  /** 开宝箱统一入口:锁定箱(原版 Chest.locked)需金钥匙,首次开启消耗 */
  private tryOpenChest(chest: { locked?: boolean }): void {
    if (chest.locked) {
      const keyId = ITEM_BY_KEY['vi_327_golden_key'];
      let keySlot = -1;
      for (let i = 0; i < this.player.inv.slots.length; i++) {
        const sl = this.player.inv.slots[i];
        if (sl && sl.id === keyId && sl.stack > 0) { keySlot = i; break; }
      }
      if (keySlot < 0) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestLocked')); this.input.rightDown = false; return; }
      this.player.inv.removeAt(keySlot, 1);
      chest.locked = false;
      this.sfx.play('tink');
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestUnlocked'));
      this.cb.onInventoryChanged();
    }
    // 陷阱箱 441/468(Player.cs:21303 语义):开启即触发电路 + 向玩家八方射镖
    const cxy = chest as { x?: number; y?: number };
    const csh = cxy.x !== undefined && cxy.y !== undefined ? this.wiring?.sheetOf(cxy.x, cxy.y) ?? -1 : -1;
    if ((csh === 441 || csh === 468) && cxy.x !== undefined && cxy.y !== undefined) {
      this.wiring?.hitSwitch(cxy.x, cxy.y);
      const cxp = cxy.x * TILE + 16, cyp = cxy.y * TILE + 16;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        this.entities.add(new TrapShot(cxp, cyp, Math.cos(ang) * 6, Math.sin(ang) * 6, 20, 'dart'), 'projectiles');
      }
      this.sfx.play('tink');
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestTrapped'));
    }
    this.openChest?.(chest as never);
    this.input.rightDown = false;
  }

  /** 拉杆/开关/计时器:右键 → Wiring.HitSwitch(Wiring.cs:163-252) */
  private toggleSwitch(x: number, y: number, type: number): void {
    void type;
    this.wiring?.hitSwitch(x, y);
    this.sfx.play('tink');
    this.input.rightDown = false;
  }

  /** 压力板 135:踩上瞬间 HitSwitch(Collision.SwitchTiles 玩家语义;敌人触发见 Enemy 侧) */
  private checkPressurePlates(): void {
    // 原版 Collision.SwitchTiles(Player.cs:18439):扫玩家 AABB 覆盖的全部格,
    // 命中压板 135 边沿触发(踩上/离开各一次,plateLatch 按格去重)
    const p = this.player;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 1) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
    // 复用 Set(2026-08 审计 G9:此前每 tick new Set + [...spread],60Hz 恒定分配)
    const pressed = this._platePressed; pressed.clear();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.wiring?.sheetOf(tx, ty) === 135) {
          const key = tx + ',' + ty;
          pressed.add(key);
          if (!this.plateLatch.has(key)) this.wiring?.hitSwitch(tx, ty);
        }
      }
    }
    for (const key of pressed) this.plateLatch.add(key);
    // Set 迭代中删除当前元素是安全的——省去 [...spread] 复制
    for (const key of this.plateLatch) {
      if (!pressed.has(key)) this.plateLatch.delete(key);
    }
  }

  /** 测重板 428(原版 PressurePlateHelper 进/离双触发)+ 感应器 423(玩家上方/昼夜)。
   *  触发源由 scanTriggerTiles 登记,onTileChanged 增量维护 */
  private updateTriggerTiles(): void {
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const p = this.player;
    // 测重板:玩家 AABB 覆盖格(原版 PressurePlateHelper 16×10 底部判定)
    const standing = this._weightedStanding; standing.clear();
    const px0 = Math.floor(p.x / TILE), px1 = Math.floor((p.x + p.w - 1) / TILE);
    const py0 = Math.floor(p.y / TILE), py1 = Math.floor((p.y + p.h - 1) / TILE);
    for (const idx of this.triggerTiles428) {
      const x = idx % st.w, y = (idx / st.w) | 0;
      if (x >= px0 && x <= px1 && y >= py0 && y <= py1) standing.add(idx);
    }
    for (const idx of standing) {
      if (!this.weightedLatch.has(idx)) {
        this.weightedLatch.add(idx);
        w.blockPlayerTeleportationForOneIteration = true; // 原版 MoveInto(:135-142)
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
    for (const idx of this.weightedLatch) {
      if (!standing.has(idx)) {
        this.weightedLatch.delete(idx);
        w.blockPlayerTeleportationForOneIteration = true; // 原版 MoveAwayFrom 双触发
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
    // 感应器 423:玩家上方(frameY 0=昼 36=夜 72=玩家出入上方,placeStyle 0-2 → frameY/18%3)
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor((p.y + p.h) / TILE);
    for (const idx of this.triggerTiles423) {
      const x = idx % st.w, y = (idx / st.w) | 0;
      const mode = Math.floor(st.frameY[idx] / 18) % 3;
      if (mode === 2 && x === ptx && pty > y && pty - y <= 8) {
        w.hitSwitch(x, y);
      }
      // 昼/夜感应由 onDayNight 回调驱动(见 triggerDayNightSensors)
    }
  }

  /** 昼/夜切换时触发全部对应感应器(原版逻辑在 Projectile.LogicSensor 驱动) */
  triggerDayNightSensors() {
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const isDay = this.world.clock.isDay;
    for (const idx of this.triggerTiles423) {
      const mode = Math.floor(st.frameY[idx] / 18) % 3;
      // mode 0=昼感应器:日出触发;1=夜:日落触发
      if ((mode === 0 && isDay) || (mode === 1 && !isDay)) {
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
  }

  /** 实体踩板(Collision.SwitchTiles objType 2/3 语义):
   *  小动物族触发压板 135(NPC.cs:47613 白名单由 critters 桶近似);
   *  巨石弹幕(原版 type 99,Projectile.cs:11833)触发 135 与弹幕垫板 442 */
  private updateEntityPlates(): void {
    const w = this.wiring;
    if (!w) return;
    const pressed = this._entityPlatePressed; pressed.clear();
    const scan = (e: Entity, checkPad: boolean) => {
      const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
      const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const sh = w.sheetOf(tx, ty);
          if (sh === 135 || (checkPad && sh === 442)) {
            const key = e.id + '|' + tx + ',' + ty;
            pressed.add(key);
            if (!this.entityPlateLatch.has(key)) w.hitSwitch(tx, ty);
          }
        }
      }
    };
    for (const c of this.entities.critters) scan(c, false);
    for (const e of this.entities.projectiles) {
      // duck-typing 判巨石(勿用 instanceof:跨模块实例会判失败)
      if ((e as TrapShot).kind === 'boulder') scan(e, true);
    }
    for (const key of pressed) this.entityPlateLatch.add(key);
    for (const key of this.entityPlateLatch) {
      if (!pressed.has(key)) this.entityPlateLatch.delete(key);
    }
  }

  /** 全图扫描测重板/感应器登记(读档/生成后一次);增量维护见 worldReadyListener */
  private scanTriggerTiles(): void {
    const st = this.world.store;
    this.triggerTiles428.clear();
    this.triggerTiles423.clear();
    const s428 = TILE_BY_KEY['v_428_weightedpressureplate'] ?? 0;
    const s423 = TILE_BY_KEY['v_423_logicsensor'] ?? 0;
    const s443 = TILE_BY_KEY['v_443_geyser'] ?? 0;
    for (let i = 0; i < st.type.length; i++) {
      if (s428 && st.type[i] === s428) this.triggerTiles428.add(i);
      else if (s423 && st.type[i] === s423) this.triggerTiles423.add(i);
      else if (s443 && st.type[i] === s443) this.geyserTiles.add(i);
    }
    st.onTileChanged((x, y) => {
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t === s428) this.triggerTiles428.add(i);
      else this.triggerTiles428.delete(i);
      if (t === s423) this.triggerTiles423.add(i);
      else this.triggerTiles423.delete(i);
    });
  }

  /** 位置感知音效(原版 SoundEngine.PlaySound(type,x,y) 语义):
   *  超过视野 1.5 倍即静音,范围内线性衰减——世界远处的机关不再全图可闻 */
  private sfxAt(name: SfxName, x: number, y: number): void {
    const R = Math.max(this.camera?.viewW ?? 1280, this.camera?.viewH ?? 800) * 1.5;
    const d = Math.hypot(x - this.player.cx, y - this.player.cy);
    if (d > R) return;
    this.sfx.play(name, Math.max(0, 1 - d / R));
  }

  /** DeviceCtx:器件表与引擎侧能力对接(devices.ts) */
  private makeDeviceCtx() {
    return {
      worldSurface: this.world.groundLevel,
      dropItem: (vanillaItemId: number, px: number, py: number) => {
        const key = ITEM_MAP[vanillaItemId];
        if (key) this.spawnDrop(px, py, key, 1);
      },
      spawnNpc: (vanillaNpcId: number, px: number, py: number) => {
        const e = Enemy.fromVanilla(vanillaNpcId, px, py);
        if (e) { this.entities.add(e, 'enemies'); return true; }
        return false;
      },
      mechSpawnOk: (px: number, py: number) => {
        // NPC.MechSpawn 近似:25 格半径内敌人 < 6
        let n = 0;
        for (const e of this.entities.enemies) {
          if (Math.abs(e.x - px) < 400 && Math.abs(e.y - py) < 400) n++;
        }
        return n < 6;
      },
      itemSpawnOk: (px: number, py: number) => {
        // Item.MechSpawn 近似:20 格半径内掉落物 < 20
        let n = 0;
        for (const d of this.entities.drops) {
          if (Math.abs(d.x - px) < 320 && Math.abs(d.y - py) < 320) n++;
        }
        return n < 20;
      },
      shootProjectile: (px: number, py: number, vx: number, vy: number, damage: number, kind: 'dart' | 'superdart' | 'flame' | 'spear' | 'spiky' | 'boulder' | 'geyser') => {
        this.entities.add(new TrapShot(px, py, vx, vy, damage, kind), 'projectiles');
        this.sfxAt('tink', px, py); // 陷阱发射:按距离衰减
      },
      countProjectiles: (kind: 'spiky', px: number, py: number, radius: number) => {
        let n = 0;
        for (const e of this.entities.projectiles) {
          if (e instanceof TrapShot && e.kind === kind && Math.hypot(e.x - px, e.y - py) < radius) n++;
        }
        return n;
      },
      doorOpen: (x: number, y: number) => {
        // 原版 HitWireSingle 10/11:随机方向 + 反向重试(WorldGen.OpenDoor)
        const dir = Math.random() < 0.5 ? 1 : -1;
        if (!openDoor(this.world.store, x, y, dir)) return openDoor(this.world.store, x, y, -dir) ;
        return true;
      },
      doorClose: (x: number, y: number) => closeDoor(this.world.store, x, y),
      teleportPair: (a: [number, number], b: [number, number]) => this.teleportPairImpl(a, b),
      relocateTownNpc: (group: 0 | 1, px: number, py: number) => {
        // 雕像 40/41 城镇 NPC 白名单(原版两组;此处按 NPC 图鉴顺序取前几个存在的)
        const groups: Array<Array<string>> = [
          ['guide', 'merchant', 'nurse', 'demolitionist', 'dyer', 'arms_dealer'],
          ['dryad', 'painter', 'golfer', 'zoologist', 'pirate', 'stylist'],
        ];
        for (const key of groups[group]) {
          const npc = this.entities.npcs.find((n) => (n as TownNPC).npcKey === key);
          if (npc) {
            npc.x = px - npc.w / 2;
            npc.y = py - npc.h - 1;
            return true;
          }
        }
        return false;
      },
      explode: (tx: number, ty: number, damage: number) => this.explodeAt(tx, ty, damage),
      toast: (m: string) => this.cb.onToast(m),
      sfx: (n: string, x?: number, y?: number) => {
        if (x !== undefined && y !== undefined) this.sfxAt(n as SfxName, x, y);
        else this.sfx.play(n as SfxName);
      },
    };
  }

  /** 传送器对(Wiring.cs:2314-2365):板上 48×48 判定框内实体双向搬迁 */
  private teleportPairImpl(a: [number, number], b: [number, number]) {
    // 太近的竖叠板拒绝(:2316)
    if (Math.abs(a[0] - b[0]) < 3 && a[1] > b[1] - 3 && a[1] < b[1]) return;
    const rect = (pad: [number, number]) => ({
      x: pad[0] * TILE, y: pad[1] * TILE - 48, w: 48, h: 48,
    });
    const hit = (r: { x: number; y: number; w: number; h: number }, e: { x: number; y: number; w: number; h: number }) =>
      e.x < r.x + r.w && e.x + e.w > r.x && e.y < r.y + r.h && e.y + e.h > r.y;
    const ra = rect(a), rb = rect(b);
    const dx = rb.x - ra.x, dy = rb.y - ra.y;
    if (!this.wiring?.blockPlayerTeleportationForOneIteration) {
      const p = this.player;
      if (!p.dead && hit(ra, p)) { p.x += dx; p.y += dy; p.vx = 0; p.vy = 0; this.sfx.play('tink'); }
      else if (!p.dead && hit(rb, p)) { p.x -= dx; p.y -= dy; p.vx = 0; p.vy = 0; this.sfx.play('tink'); }
    }
    for (const e of this.entities.enemies) {
      if (hit(ra, e)) { e.x += dx; e.y += dy; }
      else if (hit(rb, e)) { e.x -= dx; e.y -= dy; }
    }
  }

  /** 爆炸(炸药/地雷/巨石近似):半径 3 清软块 + 范围伤害 + 粒子 */
  private explodeAt(tx: number, ty: number, damage: number) {
    const st = this.world.store;
    const R = 3;
    // 半径内被炸的格：多格 framed 物体按整件清除（锚点邻域扫描，同 breakTile 语义），
    // 防半件残留可重复破坏；炸药(141/142)收集后链式引爆（原版连爆语义，上限 32 防递归）
    const chain: Array<[number, number]> = [];
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = tx + dx, y = ty + dy;
        if (!st.inBounds(x, y)) continue;
        const t = st.get(x, y);
        const d = TILE_DEFS[t];
        if (!d || d.pick < 0 || d.pick >= 200 || d.key.startsWith('v_75') || d.key.startsWith('v_76')) continue;
        if (t === TILE_BY_KEY['v_141_explosives']) { chain.push([x, y]); continue; }
        if ((d.w ?? 1) > 1 || (d.h ?? 1) > 1) {
          // 多格物体：找锚点整件清（无掉落——原版爆炸摧毁不掉物品）
          const ow = d.w ?? 1, oh = d.h ?? 1;
          let ax = x, ay = y;
          for (let sx = -(ow - 1); sx <= ow - 1 && st.inBounds(x, y); sx++) {
            for (let sy = -(oh - 1); sy <= oh - 1; sy++) {
              const nx = x + sx, ny = y + sy;
              if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== t) continue;
              const ni = st.idx(nx, ny);
              const phaseAnchor = st.frameX[ni] % (ow * 18) === 0 && st.frameY[ni] % (oh * 18) === 0;
              const boxContains = nx <= x && nx + ow > x && ny <= y && ny + oh > y;
              if (phaseAnchor && boxContains) { ax = nx; ay = ny; sx = ow; break; }
            }
          }
          for (let cdx = 0; cdx < ow; cdx++) {
            for (let cdy = 0; cdy < oh; cdy++) st.setTile(ax + cdx, ay + cdy, 0);
          }
        } else {
          st.setTile(x, y, 0);
        }
      }
    }
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    for (const e of this.entities.enemies) {
      if (Math.hypot(e.x - cx, e.y - cy) < R * TILE + 16) { const en = e as Enemy; if (en.hurt) en.hurt(damage, cx - (e.cx ?? cx), cy - (e.cy ?? cy), this); }
    }
    const p = this.player;
    if (Math.hypot(p.cx - cx, p.cy - cy) < R * TILE + 16) p.damage(damage, cx, cy);
    this.spawnParticles(cx, cy, '#FFA040', 26, 4);
    // 原版爆炸声 SoundID.Item14(Projectile.cs 手雷/炸弹/炸药等 20+ 处)——
    // 曾误用 roar(Boss 咆哮)
    this.sfxAt('explosion', cx, cy);
    // 链式引爆（延后到本爆结算后，防爆心递归；上限防炸药墙死循环）
    let chained = 0;
    while (chain.length && chained < 32) {
      const [ex, ey] = chain.pop()!;
      if (st.get(ex, ey) !== TILE_BY_KEY['v_141_explosives']) continue;
      st.setTile(ex, ey, 0);
      chained++;
      this.explodeAt(ex, ey, 500);
    }
  }

  /** 桶三态(Player.cs ItemCheck_Buckets L28137 语义):
   *  空桶点液体 → 舀成对应满桶;满桶点空格 → 放置液体变空桶 */
  private useBucket(key: string, tx: number, ty: number): void {
    const st = this.world.store;
    const liqTypeMap: Record<string, number> = { water_bucket: 1, lava_bucket: 2, honey_bucket: 3 };
    const swap = (toKey: string) => {
      // 原版语义:桶在手中原格替换(不跳格)
      this.player.inv.slots[this.player.inv.selected] = { id: ITEM_BY_KEY[toKey], stack: 1 };
      this.cb.onInventoryChanged();
      this.player.useTime = 30;
      this.input.rightDown = false;
    };
    if (key === 'empty_bucket') {
      const i = st.idx(tx, ty);
      if (st.liquid[i] > 0) {
        const t = st.liquidType[i] || 1;
        st.setLiquid(tx, ty, 0, 0);
        swap(t === 2 ? 'lava_bucket' : t === 3 ? 'honey_bucket' : 'water_bucket');
      }
    } else {
      // 满桶:目标格须空且(相邻可铺展/有底)——简化:空即可
      const i = st.idx(tx, ty);
      if (!st.flags[i]) {
        const lt = liqTypeMap[key];
        st.setLiquid(tx, ty, 255, lt);
        swap('empty_bucket');
      }
    }
  }

  /** 门交互：开门按玩家朝向、失败换反向（原版 Player.cs L20965-20974）；
   *  帧算法/样式保留/方向锚点见 world/Door.ts（原版 OpenDoor L22384 / CloseDoor L15901 语义） */
  private toggleDoor(x: number, y: number, open: boolean) {
    const st = this.world.store;
    if (open) {
      const dir = this.player.facing >= 0 ? 1 : -1;
      if (!openDoor(st, x, y, dir) && !openDoor(st, x, y, -dir)) return;
      this.sfx.play('door_open');
    } else {
      if (!closeDoor(st, x, y, Math.random, (bx, by) => this.overlapsEntity(bx, by))) return;
      this.sfx.play('door_close');
    }
    this.input.rightDown = false;
  }

  openChest: ((c: ChestData) => void) | null = null;

  private findChest(tx: number, ty: number): ChestData | null {
    for (const c of this.world.chests) {
      if ((c.x === tx || c.x + 1 === tx) && (c.y === ty || c.y + 1 === ty)) return c;
    }
    return null;
  }

  /** 3×3 邻域内找宝箱（点击容差） */
  private findChestNear(tx: number, ty: number): ChestData | null {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.findChest(tx + dx, ty + dy);
        if (c) return c;
      }
    }
    return null;
  }

  private dumpChest(x: number, y: number) {
    const c = this.findChest(x, y);
    if (!c) return;
    for (const item of c.items) {
      if (item) this.spawnDrop(x * TILE + 16, y * TILE, ITEM_DEFS[item.id].key, item.stack);
    }
    this.world.chests = this.world.chests.filter((cc) => cc !== c);
  }

  // ================= 战斗 =================

  /** 瓦罐碎裂（WorldGen.CheckPot L56807 + SpawnThingsFromPot L57100，肉前普通世界主干）：
   *  任意一格被打破 → 整罐碎裂 + 掉落表（稀有药水 / 蘑菇 / 火把 / 箭 / 凝胶 / 绳 / 钱币），只掉一次。
   *  原版瓦罐自身不掉（KillTile_GetItemDrops 无 case 28），掉落全在本表内。
   *  整罐格收集用相邻聚集（frame 布局方向无关——我们 potPass 的 frameY 上下排与原版相反，
   *  原版锚点公式会把上排漏清，残留格反复触发 = 无限刷 loot，故改为四邻洪水找齐） */
  private smashPot(x: number, y: number) {
    const st = this.world.store;
    if (!st.inBounds(x, y) || st.get(x, y) !== POT_TILE) return;
    const cells: Array<[number, number]> = [];
    const stack: Array<[number, number]> = [[x, y]];
    const seen = new Set<number>([x * 100000 + y]);
    let ax = x, ay = y, minFY = Infinity;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      cells.push([cx, cy]);
      const ci = st.idx(cx, cy);
      if (st.frameY[ci] < minFY) { minFY = st.frameY[ci]; ax = cx; ay = cy; }
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + ddx, ny = cy + ddy, k = nx * 100000 + ny;
        if (!seen.has(k) && st.inBounds(nx, ny) && st.get(nx, ny) === POT_TILE) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    const style = Math.floor(minFY / 36);
    // 直接逐格清除（不再回调 breakTile——那会落入 object 锚点分支清错位置；
    // 瓦罐 frameY=0 在底行，与家具顶行相反）。瓦罐不掉自身（原版 SpawnThingsFromPot 只掉内容物）
    for (const [cx, cy] of cells) st.setTile(cx, cy, 0);
    // CheckPot 音效（普通瓦罐 SoundID 13 = Shatter.wav）+ 陶瓷碎片粒子
    this.sfx.play('shatter');
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#9A6A5A', 10, 2.6, { life: 200, damp: 0.985, grav: 0.09 });
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#C4A48C', 6, 2.0, { life: 180, damp: 0.985, grav: 0.09 });
    this.potLoot(ax, ay, style);
  }

  /** 瓦罐掉落（SpawnThingsFromPot 肉前普通世界分支，WorldGen.cs:57100-57760） */
  private potLoot(x: number, y: number, style: number) {
    const w = this.world;
    const underworldY = w.store.h - 200; // UnderworldLayer ≈ maxTilesY-200
    const flag = y < w.rockLevel;         // 原版 flag：j < rockLayer（地表+泥土层）
    // item id → 我们 key：vanillaItemKey 解析 + 自研 key 覆盖（vi 表缺的 5 项）
    const drop = (itemId: number, n = 1) => {
      const override: Record<number, string> = { 58: 'mushroom_item', 8: 'torch', 73: 'coin_copper' };
      const key = override[itemId] ?? vanillaItemKey(itemId);
      if (key) this.spawnDrop(x * TILE + 8, y * TILE + 8, key, n, (Math.random() - 0.5) * 2.4, -2 - Math.random());
    };
    const R = (n: number) => (Math.random() * n) | 0;
    // L57213：1/45 稀有 → 按深度三张药水表
    if (R(45) === 0) {
      if (y < w.groundLevel) {
        const n = R(10);
        if (n <= 3) drop([292, 298, 299, 290][n]);
        else if (n === 4) drop(2322);
        else if (n === 5) drop(2324);
        else if (n === 6) drop(2325);
        else drop(2350, 1 + R(2));
      } else if (flag) {
        const n = R(11);
        if (n === 0) drop(289);
        else if (n <= 6) drop([298, 299, 290, 303, 291, 304][n - 1]);
        else if (n === 7) drop(2322);
        else if (n === 8) drop(2329);
        else drop(2350, 1 + R(2));
        if (R(15) === 0) drop(4870);
      } else {
        const n = R(15);
        if (n === 0) drop(296);
        else if (n === 1) drop(295);
        else if (n <= 13) drop([299, 302, 303, 305, 301, 302, 297, 304, 2322, 2323, 2327, 2329][n - 2]);
        else drop(2350, 1 + R(2));
        if (R(15) === 0) drop(4870);
      }
      return;
    }
    // L57505：num10 = rand(7)（expert 才 -1）
    const num10 = R(7);
    // 载入期液体收敛(waterCheck→killTile→breakTile→smashPot)可能砸水边瓦罐,
    // 此时 player 尚未创建(afterWorldLoad 尾部)——无主角视为"受伤"走蘑菇分支,
    // 掉落物随后被 entities.clear() 清掉,无泄漏
    const pl = this.player;
    if (num10 === 0 && (!pl || pl.hp < pl.maxHp)) {
      drop(58); // 蘑菇
      if (R(2) === 0) drop(58);
      return;
    }
    if (num10 === 1 || num10 === 0) {
      // 火把（原版 num10==0 时需背包火把<20，火把计数略；液体中→荧光棒 282）
      const inLiquid = w.store.liquid[w.store.idx(x, y)] > 0;
      drop(inLiquid ? 282 : 8, 2 + R(5));
      return;
    }
    switch (num10) {
      case 2: { // 箭 40×10-20；泥土层半数 42；地狱 265（L57617）
        let t = 40;
        if (flag && R(2) === 0) t = 42;
        if (y > underworldY) t = 265;
        drop(t, 10 + R(11));
        return;
      }
      case 3: // 凝胶 28（地狱→治疗药水 188）（L57653）
        drop(y > underworldY ? 188 : 28, 1);
        return;
      case 4:
      case 5: // 绳 965×20-40（仅非地狱肉前，L57683）
        if (y < underworldY) { drop(965, 20 + R(21)); return; }
        break;
    }
    // 默认：钱币 num16（L57688+：200±100 × 深度系数 × style 系数 × 多级随机加成）
    let coins = 200 + R(201) - 100;
    if (y < w.groundLevel) coins *= 0.5;
    else if (flag) coins *= 0.75;
    else if (y > w.store.h - 250) coins *= 1.25;
    for (const [den, lo, hi] of [[4, 5, 11], [8, 10, 21], [12, 20, 41], [16, 40, 81], [20, 50, 101]] as const) {
      if (R(den) === 0) coins *= 1 + (lo + R(hi - lo)) / 100;
    }
    // style 系数 num（L57113-57160）→ coins *= (num*2+1)/3
    let num = 1;
    if (style >= 4 && style <= 6) num = 1.25;
    else if (style >= 7 && style <= 9) num = 1.75;
    else if (style >= 10 && style <= 12) num = 1.9;
    else if (style >= 13 && style <= 15) num = 2.1;
    else if (style >= 16 && style <= 18) num = 1.6;
    else if (style >= 19 && style <= 21) num = 3.5;
    else if (style >= 22 && style <= 24) num = 1.6;
    else if (style >= 25 && style <= 27) num = 10;
    else if (style >= 28 && style <= 30) num = 4; // hardMode 才 ×4，肉前应为 1——此处取肉前
    else if (style >= 31 && style <= 33) num = 2;
    else if (style >= 34 && style <= 36) num = 1.25;
    coins *= (num * 2 + 1) / 3;
    if (coins > 1000) coins = 1000; // 防御性上限（原版由 Item.NewItem 内部面值转换）
    drop(73, Math.max(1, Math.round(coins)));
  }

  private updateSwingHits() {
    if (!this.swing) return;
    this.swing.t--;
    if (this.swing.t <= 0) { this.swing = null; return; }
    const held = this.player.inv.heldItem();
    if (!held) return;
    const tool = ITEM_DEFS[held.id].tool;
    // 近战判定范围因武器而异：剑用完整 reach；镐/斧/锤当武器不顺手（×0.8）；
    // 空手默认 3 格
    const reach = (tool?.reach ?? TILE * 3) * (tool?.type === 'sword' ? 1 : tool ? 0.8 : 1);
    // 原版 Player.ItemCheck_CutTiles（Player.cs:44002）：挥击覆盖矩形内所有 Main.tileCut
    // tile → KillTile（杂草/藤蔓/药草直接碎；瓦罐整罐碎裂掉 loot；同一挥击每格只处理一次）
    const arcX = this.player.cx + this.player.facing * reach * 0.35;
    {
      const half = Math.ceil(reach / TILE);
      const acx = Math.floor(arcX / TILE), acy = Math.floor(this.player.cy / TILE);
      for (let ty = acy - half; ty <= acy + half; ty++) {
        for (let tx = acx - half; tx <= acx + half; tx++) {
          const tk = tx * 100000 + ty;
          if (this.swingTileCutSet.has(tk)) continue;
          const t = this.world.store.get(tx, ty);
          if (t === POT_TILE) {
            this.swingTileCutSet.add(tk);
            this.smashPot(tx, ty);
          } else if (TILE_CUT.has(t)) {
            this.swingTileCutSet.add(tk);
            this.breakTile(tx, ty);
          }
        }
      }
    }
    // 弧线判定：圆心向朝向方向平移（身后不再被波及；小动物/怪物共用同一判定圆）
    const prog = 1 - this.swing.t / this.swing.dur;
    // 法杖系 noMelee = true（原版 Item.cs case 739/3069 等共 449 处 noMelee）：
    // 突刺动画不造成任何近战伤害——实体判定整体跳过（tileCut 砍草保留，原版 CutTiles 仍生效）
    if (ITEM_DEFS[held.id].magic) { void prog; return; }
    // 小动物：任何挥击一击致死
    for (const cent of this.entities.critters) {
      const c = cent as Critter;
      if (this.swingHitSet.has(c.id)) continue;
      const cdx = c.cx - arcX, cdy = c.cy - this.player.cy;
      if (Math.hypot(cdx, cdy) <= reach + c.w / 2) {
        this.swingHitSet.add(c.id);
        c.hurt(this);
      }
    }
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (this.swingHitSet.has(e.id)) continue;
      const dx = e.cx - arcX;
      const dy = e.cy - this.player.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + e.w / 2) continue;
      // 朝向检查（挥舞半程后命中判定放宽）
      if (Math.sign(dx) !== this.player.facing && Math.abs(dx) > e.w / 2) continue;
      this.swingHitSet.add(e.id);
      // 怪物专属受击声（各家族不同）；播放失败回退通用 hit
      if (!this.sfx.playFiles(e.def.hitSound)) this.sfx.play('hit');
      const crit = Math.random() < 0.04; // 原版近战基础暴击 4%（Player.meleeCrit）
      // 工具（镐/斧）也有攻击力但远弱于剑：功率/16（铁镐 3 / 铁斧 4，铁剑 16）—— 仅应急；
      // vi_ 数据驱动近战武器优先取挥击时缓存的 combat 表伤害/击退（swing.dmg/kb）
      const baseDmg = this.swing.dmg ?? tool?.damage ?? Math.max(1, Math.ceil((tool?.power ?? 10) / 16));
      // 原版 Main.DamageVar：±15% 浮动（1 + rand(-15..15)/100）
      const dmg = Math.max(1, Math.round((baseDmg + this.player.meleeDamageBonus) * (crit ? 2 : 1) * (1 + (Math.random() * 30 - 15) / 100)));
      const kdir = Math.sign(dx) || this.player.facing;
      // 击退 = 官方击退值（原版 knockBack 2-5.5 → 速度系数 0.65）
      const kb = ((this.swing.kb ?? tool?.knockback ?? 3)) * 0.65;
      const killed = e.hurt(dmg, kdir * kb, -2.5, this);
      this.addDamageNumber(e.cx, e.y, dmg, crit, crit ? '#FFD040' : '#FF7060');
      if (killed && e.def.boss) { /* boss 死亡处理在 fixedUpdate */ }
    }
    void prog;
  }

  // ================= 生成 =================

  private trySpawnEnemy() {
    const w = this.world;
    const p = this.player;
    if (p.dead) return;
    if (this.boss) return;

    // 原版 Spawner 1:1（VanillaSpawner.ts）：选点+选怪全部按 SpawnAnNPC 链
    if (!this.vanillaSpawner) this.vanillaSpawner = new VanillaSpawner(w);
    // 原版 Spawner.SetSpawnFlags：地牢旗标取玩家 SceneMetrics（15 tick 刷新的 scene），
    // downedBoss3（杀过骷髅王）决定地牢出 守卫/常规池
    this.vanillaSpawner.setPlayerFlags(!!this.scene?.zoneDungeon, !!w.flags.downedSkeletron);
    // TrySpawnAnNPC L23：nearbyActiveNPCs >= maxSpawns 拒绝
    // （原版 nearbyActiveNPCs = 附近 NPC 的 npcSlots 加权和；我们的怪全部由 spawner 生成
    //  在玩家附近，直接全量求和。蠕虫段也是独立 NPC，原版同样计入）
    const nearby = this.entities.enemies.reduce((s, e) => {
      const en = e as Enemy;
      if (en.def.boss) return s;
      return s + (en.vanilla?.npcSlots ?? 1);
    }, 0);
    const sHeightPx = this.camera.viewH / (this.camera.zoom || 1);
    const { spawnRate, maxSpawns } = this.vanillaSpawner.getSpawnRate(
      p.cy, nearby, this.heldWaterCandle || this.waterCandleNear, sHeightPx);
    if (nearby >= maxSpawns) return;
    // TrySpawnAnNPC L30：Main.rand.Next(spawnRate) != 0 拒绝（每帧 1/spawnRate 概率）
    if (Math.floor(Math.random() * spawnRate) !== 0) return;
    const viewHalfW = Math.ceil(this.camera.viewW / (this.camera.zoom || 1) / 2 / TILE);
    const viewHalfH = Math.ceil(this.camera.viewH / (this.camera.zoom || 1) / 2 / TILE);
    const rng = new RNG((Math.random() * 1e9) | 0);
    const picked = this.vanillaSpawner.spawn(p.cx, p.cy, rng, viewHalfW, viewHalfH);
    if (!picked) return;
    // 放置：原版 SpawnNPC 直接落位；水生/蠕虫分支由链内返回的怪自带 AI 处理落脚
    const st = w.store;
    const ptx = this.vanillaSpawner.currentSpawnX;
    const pty = this.vanillaSpawner.currentSpawnY;
    if (ptx < 2 || pty < 2 || ptx > st.w - 3 || pty > st.h - 3) return;
    if (picked.vanilla?.aiStyle === 6) {
      // 蠕虫族：段链（AI_006 的 NewNPC 链）
      picked.x = ptx * TILE + 8 - picked.w / 2;
      picked.y = pty * TILE + 8 - picked.h / 2;
      picked.id = this.entities.nextId++;
      this.entities.enemies.push(picked);
      const segs = Enemy.spawnWormChain(picked, 5 + ((rng.next() * 4) | 0));
      for (const seg of segs) { seg.id = this.entities.nextId++; this.entities.enemies.push(seg); }
      return;
    }
    if (picked.vanilla?.aiStyle === 16 || picked.vanilla?.aiStyle === 18) {
      // 水生族：找水下格
      for (let dy = -8; dy <= 100; dy++) {
        const yy = pty + dy;
        if (yy < 2 || yy > st.h - 3) continue;
        if (st.liquid[st.idx(ptx, yy)] > 150 && !st.isSolid(ptx, yy)) {
          picked.x = ptx * TILE + 8 - picked.w / 2;
          picked.y = yy * TILE;
          picked.id = this.entities.nextId++;
          this.entities.enemies.push(picked);
          return;
        }
      }
      return;
    }
    if (picked.vanilla?.critter) {
      // 小动物进 critters 桶（不计怪上限）
      let groundY = pty;
      while (groundY > 2 && st.isSolid(ptx, groundY)) groundY--;
      picked.x = ptx * TILE + 8 - picked.w / 2;
      picked.y = groundY * TILE - picked.h;
      picked.id = this.entities.nextId++;
      this.entities.add(picked, 'critters');
      return;
    }
    // 普通怪：落脚位（原版 HasTileSpawnSpace：上方两格净空）
    let spawnY = -1;
    for (let dy = -4; dy <= 8; dy++) {
      const yy = pty + dy;
      if (yy < 2 || yy > st.h - 3) continue;
      const dry = st.liquid[st.idx(ptx, yy)] <= 40 && st.liquid[st.idx(ptx, yy - 1)] <= 40;
      const clear = !st.isSolid(ptx, yy) && !st.isSolid(ptx, yy - 1) && dry;
      const ground = st.isSolid(ptx, yy + 1) || st.isSolid(ptx, yy + 2);
      const flying = picked.def.flying;
      if (flying) {
        if (!st.isSolid(ptx, yy) && dry) { spawnY = yy; break; }
      } else if (clear && ground) {
        spawnY = yy; break;
      }
    }
    if (spawnY < 0) return;
    picked.x = ptx * TILE + 8 - picked.w / 2;
    picked.y = spawnY * TILE + TILE - picked.h;
    picked.id = this.entities.nextId++;
    this.entities.enemies.push(picked);
  }

  // ================= NPC =================

  // ================= 城镇 NPC 入驻系统（Main.UpdateTime_SpawnTownNPCs :65021 +
  // WorldGen.SpawnTownNPC :5345 / SpawnHomelessNPC :4992 语义；房屋判定 Housing.ts） =================

  /** 各 NPC 入驻条件（NPC.SpawnAllowed_* , NPC.cs:7046-7170 1:1） */
  private townNpcSpawnAllowed(key: string): boolean {
    const p = this.player;
    switch (key) {
      case 'guide':
        return true;
      case 'merchant': {
        // SpawnAllowed_Merchant：玩家硬币合计 ≥ 5000 铜（50 银；71铜/72银/73金/74铂）
        let copper = 0;
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          if (def.key === 'coin_copper') copper += s.stack;
          else if (def.key === 'coin_silver') copper += s.stack * 100;
          else if (def.key === 'coin_gold') copper += s.stack * 10000;
          if (copper >= 5000) return true;
        }
        return false;
      }
      case 'nurse':
        // SpawnAllowed_Nurse：statLifeMax/20 > 5（用过生命水晶，生命上限 >100）
        return Math.floor(p.maxHp / 20) > 5;
      case 'arms_dealer': {
        // SpawnAllowed_ArmsDealer：背包有子弹系物品（ammo/useAmmo == AmmoID.Bullet 14）
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          const vid = def.vid ?? viIdFromKey(def.key);
          const c = vid >= 0 ? itemCombat(vid) : null;
          if (c && (c.ammo === AMMO_BULLET || c.useAmmo === AMMO_BULLET)) return true;
        }
        return false;
      }
      case 'demolitionist': {
        // SpawnAllowed_Demolitionist：背包有炸弹系物品（ItemsThatCountAsBombs 表近似）
        const bombKeys = new Set(['bomb', 'vi_166_bomb', 'vi_167_dynamite', 'vi_168_grenade',
          'vi_4423_scarab_bomb', 'vi_4824_wet_bomb', 'vi_453_bomb_statue']);
        return p.inv.slots.some((s) => s && bombKeys.has(ITEM_DEFS[s.id]?.key ?? ''));
      }
      case 'dryad':
        // 任意邪恶 Boss 已败（vanilla downedBoss1/2/3 = EoC/世吞|克脑/骷髅王）
        return !!(this.world.flags['downed_4'] || this.world.flags['downed_13']
          || this.world.flags['downed_266'] || this.world.flags['downed_35']
          || this.world.flags.downedSkeletron || this.world.flags.downedEyeOfCthulhu);
      case 'clothier':
        // 裁缝(cs:65310)：骷髅王已败（击败后守卫老人消失，裁缝解锁）
        return !!(this.world.flags['downed_35'] || this.world.flags.downedSkeletron);
      case 'truffle':
        // 松露人(cs:65322)：困难模式（原版还要求发光蘑菇生物群系有空房，暂按全域找房）
        return !!this.world.flags.hardMode;
      case 'steampunker':
        // 蒸汽朋克(cs:65303)：任一机械 Boss 已败（双子 125/126 / 铁骷髅 127 / 毁灭者 134）
        return !!(this.world.flags['downed_125'] || this.world.flags['downed_126']
          || this.world.flags['downed_127'] || this.world.flags['downed_134']);
      case 'witch_doctor':
        // 巫医(cs:65298)：蜂后已败（NPC 222）
        return !!this.world.flags['downed_222'];
      case 'cyborg':
        // 电子人(cs:65319)：困难模式 + 世纪之花已败（262）
        return !!this.world.flags.hardMode && !!this.world.flags['downed_262'];
      case 'pirate':
        // 海盗(cs:65316)：海盗入侵已胜（入侵系统未移植 → 恒不可达，保留原版门）
        return !!this.world.flags['downedPirates'];
      case 'santa_claus':
        // 圣诞老人(cs:65277)：圣诞季（现实日期系统未移植 → 恒不可达，保留原版门）
        return !!this.world.flags['xMas'];
      case 'zoologist':
        // 动物学家(cs:65327)：图鉴完成度 ≥10%（图鉴系统未移植 → 恒不可达，保留原版门）
        return !!this.world.flags['bestiaryTenPercent'];
      case 'party_girl':
        // 派对女孩(cs:65249-65253)：每轮 1/40 重掷（另需在场 NPC ≥20，见优先级链）
        return Math.random() < 1 / 40;
      case 'dyer': {
        // SpawnAllowed_DyeTrader（cs:7096）：背包有染料/染料物（dye>0 或 1107-1120/3385-3388）
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          const vid = def.vid ?? viIdFromKey(def.key);
          if ((vid >= 1107 && vid <= 1120) || (vid >= 3385 && vid <= 3388)) return true;
        }
        return false;
      }
      case 'goblin_tinkerer':
        return !!this.world.flags['savedGoblin']; // 救援系统（bound NPC 解救）置位
      case 'wizard':
        return !!this.world.flags['savedWizard'];
      case 'mechanic':
        return !!this.world.flags['savedMech'];
      case 'stylist':
        return !!this.world.flags['savedStylist'];
      case 'tax_collector':
        return !!this.world.flags['savedTaxCollector'];
      case 'golfer':
        return !!this.world.flags['savedGolfer'];
      case 'princess': {
        // 公主(cs:65241 flag9)：下列全部在场才解锁
        const all = ['merchant', 'nurse', 'dryad', 'arms_dealer', 'guide', 'demolitionist',
          'clothier', 'steampunker', 'dyer', 'party_girl', 'cyborg', 'painter', 'witch_doctor',
          'pirate', 'stylist', 'goblin_tinkerer', 'wizard', 'mechanic', 'truffle',
          'tax_collector', 'golfer', 'zoologist'];
        return all.every((k) => this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === k));
      }
      default:
        return false;
    }
  }

  /** 入驻轮（每 7200 tick）：①无家 NPC 见空房入住（QuickFindHome）
   *  ②按优先级链选一名待入驻者 ③有房则入住房内、无房但有入住者则流浪生成 */
  private updateTownNpcArrival() {
    const npcs = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead) as TownNPC[];
    const has = (key: string) => npcs.some((n) => n.npcKey === key);
    const homes = npcs.filter((n) => n.home).map((n) => n.home!);
    const st = this.world.store;

    // ①' 困难模式开启后补放被绑巫师（原版仅困难世界放置）
    if (this.world.flags.hardMode) {
      const s = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
      if (s) this.placeBoundNpc('wizard', 'savedWizard', s[0], s[1]);
    }

    // ① QuickFindHome（Main.cs:65072：每轮对未安家 NPC 找房入住）
    for (const n of npcs) {
      if (n.home || n.npcKey === 'old_man') continue;
      const house = findFreeHouse(st, homes, this.world.spawnX, this.world.spawnY);
      if (!house) break;
      n.home = { x: house.standX, y: house.standY };
      n.leashHome = true; // 有家者白天在家附近游走
      homes.push(n.home);
      n.x = house.standX * TILE + 8 - n.w / 2;
      n.y = (house.standY + 1) * TILE - n.h;
    }

    // ② 优先级链（Main.cs num42 完整顺序；护士/爆破手要求商人在场，
    //    染料商 ≥4 人、油漆工 ≥8 人、派对女孩 ≥20 人且 1/40 重掷）
    const merchantHere = has('merchant');
    const allow = (key: string) => this.townNpcSpawnAllowed(key);
    const n = npcs.length; // num40：在场城镇 NPC 总数（含守卫老人，原版同）
    const prio: Array<[string, boolean]> = [
      ['guide', !has('guide')],
      ['merchant', !merchantHere && allow('merchant')],
      ['nurse', !has('nurse') && merchantHere && allow('nurse')],
      ['arms_dealer', !has('arms_dealer') && allow('arms_dealer')],
      ['goblin_tinkerer', !has('goblin_tinkerer') && allow('goblin_tinkerer')],
      ['wizard', !has('wizard') && allow('wizard')],
      ['dryad', !has('dryad') && allow('dryad')],
      ['demolitionist', !has('demolitionist') && merchantHere && allow('demolitionist')],
      ['witch_doctor', !has('witch_doctor') && allow('witch_doctor')],
      ['steampunker', !has('steampunker') && allow('steampunker')],
      ['mechanic', !has('mechanic') && allow('mechanic')],
      ['stylist', !has('stylist') && allow('stylist')],
      ['cyborg', !has('cyborg') && allow('cyborg')],
      ['pirate', !has('pirate') && allow('pirate')],
      ['clothier', !has('clothier') && allow('clothier')],
      ['dyer', !has('dyer') && n >= 4 && allow('dyer')],
      ['painter', !has('painter') && n >= 8],
      ['party_girl', !has('party_girl') && n >= 20 && allow('party_girl')],
      ['santa_claus', !has('santa_claus') && allow('santa_claus')],
      ['golfer', !has('golfer') && allow('golfer')],
      ['tax_collector', !has('tax_collector') && allow('tax_collector')],
      ['truffle', !has('truffle') && allow('truffle')],
      ['zoologist', !has('zoologist') && allow('zoologist')],
      ['princess', !has('princess') && allow('princess')],
    ];
    const pick = prio.find(([, ok]) => ok)?.[0];
    if (!pick) return;

    // ③ 入住 / 流浪生成
    const house = findFreeHouse(st, homes, this.world.spawnX, this.world.spawnY);
    const id = TOWN_NPC_IDS[pick].id;
    const name = Lang.npcName(id) ?? pick;
    if (house) {
      // SpawnTownNPC：房间合格且无人 → 生成在房内、安家（Announcement.HasArrived）
      const npc = new TownNPC(pick, house.standX * TILE + 8, (house.standY + 1) * TILE);
      npc.home = { x: house.standX, y: house.standY };
      npc.leashHome = true;
      this.entities.add(npc, 'npcs');
      this.newText(Lang.text('Announcement.HasArrived', name), 50, 125, 255);
    } else {
      // SpawnHomelessNPC（:4992）：白天且当前无流浪 NPC 时，在已入住者的家附近生成；
      // 无人入住（无锚点）则不生成——新世界只有向导（WorldGen.cs:20036 出生）
      if (!this.world.clock.isDay || homes.length === 0) return;
      if (npcs.some((n) => !n.home)) return;
      const anchor = homes[Math.floor(Math.random() * homes.length)];
      const ax = anchor.x + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 50));
      if (ax < 3 || ax > st.w - 4) return;
      let ay = Math.max(4, anchor.y - 20);
      const limit = Math.min(st.h - 3, anchor.y + 20);
      while (ay < limit && !st.isSolid(ax, ay)) ay++;
      if (ay >= limit) return;
      const npc = new TownNPC(pick, ax * TILE + 8, (ay + 1) * TILE);
      this.entities.add(npc, 'npcs');
      this.newText(Lang.text(`Announcement.HomelessArrived_${Math.floor(Math.random() * 6)}`, name), 50, 125, 255);
    }
  }

  /** 右键与附近 NPC 交谈(Player.SetTalkNPC Player.cs:4180 语义:
 *  光标命中 NPC 命中盒(±8px)+ 距离 3.5 格内)→ 打开原版对话框 */
  private talkToNearbyNpc(ctX: number, ctY: number): boolean {
    const p = this.player;
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (Math.hypot(npc.cx - p.cx, npc.cy - p.cy) > TILE * 3.5) continue;
      const mx = (ctX + 0.5) * TILE, my = (ctY + 0.5) * TILE;
      if (mx < npc.x - 8 || mx > npc.x + npc.w + 8 || my < npc.y - 8 || my > npc.y + npc.h + 8) continue;
      if (npc.bound) { this.freeBoundNpc(npc); return true; } // 救援 NPC：右键直接解救
      this.openNpcDialog(npc);
      return true;
    }
    return false;
  }

  // ================= NPC 对话系统(SetTalkNPC + NPC.GetChat NPC.cs:94974 1:1) =================

  private dialogNpc: TownNPC | null = null;

  /** 打开对话框:台词/按钮按 NPC 类型生成,UI 经 onNpcDialog 渲染 */
  private openNpcDialog(npc: TownNPC) {
    this.dialogNpc = npc;
    npc.talkCooldown = 30;
    const typeName = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    const name = npc.givenName ? `${npc.givenName} ${typeName}` : typeName;
    const buttons: Array<{ id: 'shop' | 'heal' | 'curse' | 'close'; label: string }> = [];
    if (npc.npcKey === 'merchant') buttons.push({ id: 'shop', label: Lang.inter(28) });   // 商店
    if (npc.npcKey === 'nurse') buttons.push({ id: 'heal', label: Lang.inter(54) });       // 治疗
    // 守卫老人:夜晚出现「诅咒」(白天只闲聊,原版 GetChat 语义)
    if (npc.npcKey === 'old_man' && !this.world.clock.isDay && !this.world.flags.hardMode) {
      buttons.push({ id: 'curse', label: Lang.inter(50) });                                 // 诅咒
    }
    buttons.push({ id: 'close', label: Lang.inter(52) });                                   // 关闭
    this.cb.onNpcDialog?.(name, this.formatDialogTags(this.townNpcChat(npc)), buttons);
  }

  /** 台词 = NPC.GetChat(NPC.cs:94974+) type 17/18/22/37/19/20/38 分支 1:1。
   *  事件系统未移植:血月/灯笼夜/日食/史莱姆雨/DD2/特殊事件段跳过,走常规池。
   *  曾把未覆盖类型全部落到守卫老人自建文案池——向导会说出"解除诅咒"台词,已修 */
  private townNpcChat(npc: TownNPC): string {
    const p = this.player;
    const w = this.world;
    const dialog = (n: number) => Lang.text(`LegacyDialog.${n}`);
    const rN = (n: number) => Math.floor(Math.random() * n);
    const r3 = () => rN(3);
    const r2 = () => (Math.random() < 0.5 ? 0 : 1);
    // GetChat 在场旗标(cs:94996-95046):其他城镇 NPC 是否在场
    const present = (id: number) =>
      this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.vanillaId === id);
    // downedBoss1/2/3(cs 全局):EoC / 世吞|克脑 / 骷髅王
    const boss1 = !!(w.flags['downed_4'] || w.flags.downedEyeOfCthulhu);
    const boss2 = !!(w.flags['downed_13'] || w.flags['downed_266']);
    const boss3 = !!(w.flags['downed_35'] || w.flags.downedSkeletron);
    if (npc.vanillaId === 17) {
      // 商人(NPC.cs:95077-95105)
      if (!boss1 && r3() === 0) {
        if (p.maxHp < 200) return dialog(1);
        if (p.defense > 10) return dialog(3);
        return dialog(2);
      }
      if (w.clock.isDay) {
        const f = (w.clock.timeOfDay - 0.25) / 0.5; // 昼内进度 0-1(原版 Main.time/43200)
        if (f < 16200 / 43200) return dialog(4 + r3());   // 清晨 4-6
        if (f > 37800 / 43200) return dialog(7 + r3());   // 傍晚 7-9
        return dialog(10 + r3());                          // 白昼 10-12
      }
      const nf = w.clock.timeOfDay < 0.25 ? w.clock.timeOfDay / 0.25 : (w.clock.timeOfDay - 0.75) / 0.25;
      if (nf < 9720 / 43200) return dialog(r2() ? 19 : 18);
      if (nf > 22680 / 43200) return dialog(r2() ? 21 : 20);
      return dialog(22 + r3());                            // 深夜 22-24
    }
    if (npc.vanillaId === 18) {
      // 护士(NPC.cs:95104-95190):三成概率提醒老人(!downedBoss3);按血量分档
      if (r3() === 0 && !boss3) return dialog(32);
      const ratio = p.hp / p.maxHp;
      if (ratio < 0.33) return dialog(36 + Math.floor(Math.random() * 5)); // 36-40
      if (ratio < 0.66) return dialog(41 + Math.floor(Math.random() * 7)); // 41-47
      return dialog(48 + Math.floor(Math.random() * 4));                   // 48-51
    }
    if (npc.vanillaId === 22) {
      // 向导(cs:95473):夜晚 173;白天 174-176(血月 170-172/灯笼夜/日食/史莱姆雨未实现)
      if (!w.clock.isDay) return dialog(173);
      return dialog(174 + r3());
    }
    if (npc.vanillaId === 37) {
      // 守卫老人(cs:95224-95240):白天 82-84;夜晚(生命<300 或防御<10)85-88,否则 89-92
      if (!w.clock.isDay) {
        return dialog(p.maxHp < 300 || p.defense < 10 ? 85 + Math.floor(Math.random() * 4) : 89 + Math.floor(Math.random() * 4));
      }
      return dialog(82 + r3());
    }
    if (npc.vanillaId === 19) {
      // 军火商(cs:95195-95203):向导在场+已败骷髅王+非困难 58;护士/树妖/爆破手在场随机互cue;
      // 常规池 66-68(血月 64/65 未实现)
      if (present(22) && boss3 && !w.flags.hardMode) return dialog(58);
      if (present(18) && Math.floor(Math.random() * 5) === 0) return dialog(59);
      if (present(18) && Math.floor(Math.random() * 5) === 0) return dialog(60);
      if (present(20) && Math.floor(Math.random() * 5) === 0) return dialog(61);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(62);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(63);
      return dialog(66 + r3());
    }
    if (npc.vanillaId === 20) {
      // 树妖(cs:95204-95245):未败邪恶 Boss 69/332(猩红);军火商/商人/老人在场互cue;
      // 常规池 77-81(非猩红 77 / 猩红 333 起手)
      if (!boss2 && r3() === 0) return dialog(w.crimson ? 332 : 69);
      if (present(19) && Math.floor(Math.random() * 6) === 0) return dialog(70);
      if (present(17) && Math.floor(Math.random() * 6) === 0) return dialog(71);
      if (present(37) && Math.floor(Math.random() * 6) === 0) return dialog(72);
      const r = Math.floor(Math.random() * 5); // 血月 73-76 未实现跳过
      return r === 0 ? dialog(w.crimson ? 333 : 77) : dialog(77 + r);
    }
    if (npc.vanillaId === 38) {
      // 爆破手(cs:95246-95266):未败邪恶 Boss 93;军火商/护士/树妖在场互cue;
      // 夜晚 101-104;白天 105-109
      if (!boss2 && r3() === 0) return dialog(93);
      if (present(19) && Math.floor(Math.random() * 5) === 0) return dialog(97);
      if (present(19) && Math.floor(Math.random() * 5) === 0) return dialog(98);
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(99);
      if (present(20) && Math.floor(Math.random() * 4) === 0) return dialog(100);
      if (!w.clock.isDay) return dialog(101 + Math.floor(Math.random() * 4));
      return dialog(105 + Math.floor(Math.random() * 5));
    }
    if (npc.vanillaId === 54) {
      // 裁缝(cs:95267-95282):无机械师在场 110;树妖在场 237;护士在场 112;常规 114-119
      // (血月 111 / 玩家头部时装 113 未实现跳过)
      if (!present(124) && Math.floor(Math.random() * 2) === 0) return dialog(110);
      if (present(160) && Math.floor(Math.random() * 6) === 0) return dialog(237);
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(112);
      return dialog(114 + rN(6));
    }
    if (npc.vanillaId === 107) {
      // 哥布林工匠(cs:95283-95323):流浪 121-125;机械师/造型师在场互cue;
      // 常规 夜 127-131 / 昼 132-136 + GoblinTinkererChatter 池
      if (!npc.home) return dialog(121 + rN(5));
      if (present(124) && Math.floor(Math.random() * 5) === 0) return dialog(126);
      if (present(353) && Math.floor(Math.random() * 5) === 0) return dialog(309);
      const r = rN(6); // 5 常规 + Chatter 池 1 条
      if (r >= 5) return Lang.chatter('GoblinTinkererChatter') ?? dialog(127);
      return dialog((w.clock.isDay ? 132 : 127) + r);
    }
    if (npc.vanillaId === 108) {
      // 巫师(cs:95324-95377):流浪 138-141(女性角色 139);互cue 142-147(按角色性别分档);
      // 夜 148-150 / 昼 151-155(幸运/DD2 文本未实现跳过)
      const male = (p.appearance?.skinVariant ?? 0) === 0;
      if (!npc.home) {
        const n5 = rN(3);
        return n5 === 0 ? dialog(138) : n5 === 1 && !male ? dialog(139) : dialog(138 + n5);
      }
      if (male && present(22) && Math.floor(Math.random() * 6) === 0) return dialog(142);
      if (male && present(38) && Math.floor(Math.random() * 6) === 0) return dialog(143);
      if (male && present(107) && Math.floor(Math.random() * 6) === 0) return dialog(144);
      if (!male && present(18) && Math.floor(Math.random() * 6) === 0) return dialog(145);
      if (!male && present(124) && Math.floor(Math.random() * 6) === 0) return dialog(146);
      if (!male && present(20) && Math.floor(Math.random() * 6) === 0) return dialog(147);
      if (w.clock.isDay) return dialog(151 + rN(5));
      return dialog(148 + rN(3));
    }
    if (npc.vanillaId === 124) {
      // 机械师(cs:95377-95420):流浪 157-160;哥布林/军火商互cue 165/166;常规 167-169 + Chatter 池
      if (!npc.home) return dialog(157 + rN(4));
      if (present(107) && Math.floor(Math.random() * 6) === 0) return dialog(165);
      if (present(19) && Math.floor(Math.random() * 6) === 0) return dialog(166);
      const r = rN(4); // 3 常规 + Chatter 池 1 条
      if (r >= 3) return Lang.chatter('MechanicChatter') ?? dialog(167);
      return dialog(167 + r);
    }
    if (npc.vanillaId === 142) {
      // 圣诞老人(cs:95490-95509):224-226
      return dialog(224 + rN(3));
    }
    if (npc.vanillaId === 160) {
      // 松露人(cs:95510-95543):树妖/裁缝在场互cue 238/236;常规池 231/233/234/235/240/241
      if (present(20) && Math.floor(Math.random() * 6) === 0) return dialog(238);
      if (present(54) && Math.floor(Math.random() * 6) === 0) return dialog(236);
      return dialog([231, 233, 234, 235, 240, 241][rN(6)]);
    }
    if (npc.vanillaId === 178) {
      // 蒸汽朋克(cs:95544-95567):电子人/海盗在场互cue 246/247;常规池 242-244/248/249
      if (present(209) && Math.floor(Math.random() * 6) === 0) return dialog(246);
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(247);
      return dialog([242, 243, 244, 248, 249][rN(5)]);
    }
    if (npc.vanillaId === 207) {
      // 染料商(cs:95568-95581):海盗在场 260;常规 257-259
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(260);
      return dialog(257 + rN(3));
    }
    if (npc.vanillaId === 208) {
      // 派对女孩(cs:95582-95606):男性角色 268;造型师在场 310;常规池 265-267/269-272
      if ((p.appearance?.skinVariant ?? 0) === 0 && Math.floor(Math.random() * 5) === 0) return dialog(268);
      if (present(353) && Math.floor(Math.random() * 5) === 0) return dialog(310);
      return dialog([265, 266, 267, 269, 270, 271, 272][rN(7)]);
    }
    if (npc.vanillaId === 209) {
      // 电子人(cs:95607-95637):海盗/蒸汽朋克在场互cue 284/283;常规池 280-282/285/286 + Chatter 池
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(284);
      if (present(178) && Math.floor(Math.random() * 6) === 0) return dialog(283);
      const r = rN(6); // 5 常规 + Chatter 池 1 条
      if (r >= 5) return Lang.chatter('CyborgChatter') ?? dialog(280);
      return dialog([280, 281, 282, 285, 286][r]);
    }
    if (npc.vanillaId === 227) {
      // 油漆工(cs:95638-95659):困难 250;派对女孩在场 251;常规 252-256
      if (w.flags.hardMode && Math.floor(Math.random() * 7) === 0) return dialog(250);
      if (present(208) && Math.floor(Math.random() * 6) === 0) return dialog(251);
      return dialog(252 + rN(5));
    }
    if (npc.vanillaId === 228) {
      // 巫医(cs:95660-95682):护士在场 263;常规 261/262/264(DD2 专项文本未实现,档位 3 回落 261)
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(263);
      const r = rN(4);
      return r === 3 ? dialog(261) : dialog([261, 262, 264][r]);
    }
    if (npc.vanillaId === 229) {
      // 海盗(cs:95683-95809):女性角色 276;常规池 273-275/277-279 + Chatter 池
      const r = rN(7); // 6 常规 + Chatter 池 1 条
      if (r >= 6) return Lang.chatter('PirateChatter') ?? dialog(273);
      if ((p.appearance?.skinVariant ?? 0) !== 0 && Math.floor(Math.random() * 5) === 0) return dialog(276);
      return dialog([273, 274, 275, 277, 278, 279][r]);
    }
    if (npc.vanillaId === 353) {
      // 造型师(cs:95810-95958):清晨 311;男性 293/300、女性 291/292/312;
      // 四人组(派对女孩+机械师+护士+军火商)307;派对女孩/爆破手/电子人互cue 302/303/308;
      // 月相常规池(287-290/294 | 295-298 | 299/301/313/314)+ StylistChatter 池(血月段未实现)
      if (w.clock.isDay && (w.clock.timeOfDay - 0.25) / 0.5 < 16200 / 43200 && r3() === 0) return dialog(311);
      const male = (p.appearance?.skinVariant ?? 0) === 0;
      if (male && r3() === 0) return dialog([293, 300][rN(2)]);
      if (!male && r3() === 0) return dialog([291, 292, 312][rN(3)]);
      if (present(208) && present(124) && present(18) && present(19) && Math.floor(Math.random() * 5) === 0) return dialog(307);
      if (present(208) && Math.floor(Math.random() * 5) === 0) return dialog(302);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(303);
      if (present(209) && Math.floor(Math.random() * 5) === 0) return dialog(308);
      const mp = (w.clock.dayCount - 1) % 8; // moonPhase 近似（无月相系统：8 天一轮）
      const pool = mp < 3 ? [287, 288, 289, 290, 294] : mp < 6 ? [295, 296, 297, 298] : [299, 301, 313, 314];
      const r = rN(pool.length + 1);
      if (r >= pool.length) return Lang.chatter('StylistChatter') ?? dialog(pool[0]);
      return dialog(pool[r]);
    }
    if (npc.vanillaId === 441) {
      // 税务员(cs:95980-95995):树妖/军火商/爆破手/商人在场互cue 371-374;常规 364-370
      if (Math.floor(Math.random() * 6) === 0 && present(20)) return dialog(371);
      if (Math.floor(Math.random() * 6) === 0 && present(19)) return dialog(372);
      if (Math.floor(Math.random() * 6) === 0 && present(38)) return dialog(373);
      if (Math.floor(Math.random() * 6) === 0 && present(17)) return dialog(374);
      return dialog(364 + rN(7));
    }
    if (npc.vanillaId === 588) {
      // 高尔夫球手(cs:95996-96004):1/3 任务分数档闲聊(分数系统未实现 → 初学者档),
      // 其余 GolferChatter 池
      if (r3() === 0) return Lang.chatter('GolferQuestsChatterBeginner') ?? Lang.chatter('GolferChatter') ?? '……';
      return Lang.chatter('GolferChatter') ?? '……';
    }
    if (npc.vanillaId === 633) {
      // 动物学家(cs:96005-96006):夜晚满月(moonPhase==0)变身狐狸用 Lycantrope 池
      // （血月未实现；8 天一轮的满月近似）
      const lycan = !w.clock.isDay && (w.clock.dayCount - 1) % 8 === 0;
      return Lang.chatter(lycan ? 'BestiaryGirlLycantropeChatter' : 'BestiaryGirlChatter') ?? '……';
    }
    if (npc.vanillaId === 663) {
      // 公主(cs:96007-96008):PrincessChatter 池
      return Lang.chatter('PrincessChatter') ?? '……';
    }
    // 其余类型(旅行商人368/骷髅商453/钓鱼娃369 等非房屋 NPC 未注册,不可达)
    return '……';
  }

  /** LegacyDialog 命名占位符替换（原版 LocalizedText 显示期 Format 语义）：
   *  {PlayerName}=主角名；{Guide} 等 = 对应城镇 NPC 当前名（在场实例带随机名，否则类型名）；
   *  {WorldEvilStone}=黑檀石/猩红石（按世界邪恶） */
  private formatDialogTags(s: string): string {
    const townName = (key: string): string => {
      const inst = this.entities.npcs.find(
        (n) => n instanceof TownNPC && !n.dead && (n as TownNPC).npcKey === key) as TownNPC | undefined;
      const base = Lang.npcName(TOWN_NPC_IDS[key]?.id ?? 0) ?? key;
      return inst?.givenName ? `${inst.givenName} ${base}` : base;
    };
    return s
      .replace(/\{PlayerName\}/g, this.player.appearance?.name || '泰拉瑞亚')
      .replace(/\{Guide\}/g, townName('guide'))
      .replace(/\{Nurse\}/g, townName('nurse'))
      .replace(/\{Dryad\}/g, townName('dryad'))
      .replace(/\{Demolitionist\}/g, townName('demolitionist'))
      .replace(/\{ArmsDealer\}/g, townName('arms_dealer'))
      .replace(/\{Merchant\}/g, townName('merchant'))
      .replace(/\{Bartender\}/g, Lang.npcName(550) ?? '酒馆老板') // 酒馆老板未实装,恒用类型名
      .replace(/\{WorldEvilStone\}/g,
        Lang.itemName(this.world.crimson ? 836 : 61)   // ItemID.cs:3211/1661：Crimstone/Ebonstone Block
        ?? (this.world.crimson ? '猩红石' : '黑檀石'));
  }

  /** 对话框按钮(SetTalkNPC 后 UI 回调) */
  npcDialogButton(id: 'shop' | 'heal' | 'curse' | 'close'): void {
    const npc = this.dialogNpc;
    if (id === 'close' || !npc) { this.closeNpcDialog(); return; }
    if (id === 'shop') { this.openMerchantShop(); return; }
    if (id === 'heal') { this.nurseHeal(); return; }
    if (id === 'curse' && npc.npcKey === 'old_man') {
      if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
      // 原版:释放诅咒时老人消失,击败骷髅王后转为裁缝
      npc.dead = true;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.OldManScream'));
      this.closeNpcDialog();
      this.summonBossAtTx('skeletron_head', Math.floor(npc.cx / TILE));
    }
  }

  closeNpcDialog(): void {
    this.dialogNpc = null;
    this.cb.onNpcDialogClose?.();
  }

  // ---- 商店(Chest.SetupShop case 1 = Merchant,Chest.cs:1325+) ----

  /** [原版物品 id, 铜币价(item.value)] 基础款;条件款(困难模式/夜晚/downedBoss3)建表时附加 */
  private static readonly MERCHANT_BASE: ReadonlyArray<readonly [number, number]> = [
    [88, 40000],  // 挖矿头盔 buyPrice(0,4)
    [87, 10000],  // 猪猪存钱罐
    [35, 5000],   // 铁砧
    [1991, 2500], // 虫网 buyPrice(0,0,25)
    [3509, 500],  // 铜镐
    [3506, 400],  // 铜斧
    [8, 50],      // 火把
    [28, 300],    // 弱效治疗药水
    [110, 100],   // 弱效魔力药水 buyPrice(0,0,1)
    [40, 5],      // 木箭
    [42, 15],     // 手里剑
    [965, 10],    // 绳
    [1786, 6000], // 镰刀 buyPrice(0,0,60)
  ];

  private merchantShopList(): Array<[number, number]> {
    const list: Array<[number, number]> = Game.MERCHANT_BASE.map((e) => [e[0], e[1]]);
    if (this.world.flags.hardMode) list.push([188, 1000], [189, 250]); // 治疗/魔力药水
    if (!this.world.clock.isDay) list.push([282, 10]);                 // 夜晚:荧光棒
    if (this.world.flags.downedSkeletron) list.push([346, 200000]);    // downedBoss3:保险箱
    return list;
  }

  private openMerchantShop() {
    const entries = this.merchantShopList().map(([vid, price]) => ({
      key: vanillaItemKey(vid) ?? '',
      vanillaId: vid,
      name: Lang.itemName(vid) ?? vanillaItemKey(vid) ?? String(vid),
      price,
    }));
    this.cb.onNpcShop?.(Lang.inter(28), entries, this.coinsOwned());
  }

  /** 商店购买:扣币 + 入包 + 刷新商店面板(可购态/余额) */
  npcShopBuy(vanillaId: number): void {
    const entry = this.merchantShopList().find(([id]) => id === vanillaId);
    if (!entry) return;
    const price = entry[1];
    if (this.coinsOwned() < price || !this.spendCopper(price)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      this.openMerchantShop();
      return;
    }
    const key = vanillaItemKey(vanillaId);
    if (key && ITEM_BY_KEY[key] !== undefined) this.player.inv.add(ITEM_BY_KEY[key], 1);
    this.sfx.play('coin');
    this.cb.onInventoryChanged();
    this.openMerchantShop();
  }

  /** 护士治疗:费用 = 缺失生命 × 0.75 铜(下限 3);满血拒绝 */
  private nurseHeal() {
    const p = this.player;
    if (p.hp >= p.maxHp) { this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealthy')); return; }
    const cost = Math.max(3, Math.round((p.maxHp - p.hp) * 0.75));
    if (this.coinsOwned() < cost || !this.spendCopper(cost)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      return;
    }
    p.hp = p.maxHp;
    this.sfx.play('drink');
    this.cb.onInventoryChanged();
    this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealed'));
  }

  /** 扣铜币:全背包三种币换算清点,整额清空后按面额找零(vanilla BuyItem 语义近似) */
  private spendCopper(n: number): boolean {
    const inv = this.player.inv;
    if (this.coinsOwned() < n) return false;
    const change = this.coinsOwned() - n;
    for (let i = 0; i < inv.slots.length; i++) {
      const sl = inv.slots[i];
      if (!sl) continue;
      if (sl.id === ITEM_BY_KEY['coin_copper'] || sl.id === ITEM_BY_KEY['coin_silver'] || sl.id === ITEM_BY_KEY['coin_gold']) {
        inv.slots[i] = null;
      }
    }
    // 按面额回流(金→银→铜,栈内合并)
    const gold = Math.floor(change / 10000);
    const silver = Math.floor((change % 10000) / 100);
    const copper = change % 100;
    if (gold) inv.add(ITEM_BY_KEY['coin_gold'], gold);
    if (silver) inv.add(ITEM_BY_KEY['coin_silver'], silver);
    if (copper) inv.add(ITEM_BY_KEY['coin_copper'], copper);
    return true;
  }

  // （旧 isValidHouse 启发式已删除——房屋判定移至 src/world/Housing.ts，
  //  泛洪填充 + 原版 wallHouse 墙表 + 桌椅灯需求，见 checkRoom/findFreeHouse）

  // ================= GameHooks 实现 =================

  enemies() {
    return this.entities.enemies;
  }

  /** 小动物列表:弹幕命中用(GameHooks.critters) */
  critters() {
    return this.entities.critters;
  }

  /** 弹幕砍 tileCut 物（Projectile.CutTiles 语义）：瓦罐→整罐碎裂，其余→breakTile */
  cutTile(x: number, y: number) {
    const st = this.world.store;
    if (!st.inBounds(x, y)) return;
    const t = st.get(x, y);
    if (t === POT_TILE) this.smashPot(x, y);
    else if (TILE_CUT.has(t)) this.breakTile(x, y);
  }

  spawnDrop(x: number, y: number, itemKey: string, count = 1, vx = 0, vy = -2): ItemDrop | null {
    const id = ITEM_BY_KEY[itemKey];
    if (id === undefined) return null;
    const drop = new ItemDrop(x - 6, y - 6, id, count, vx, vy);
    this.entities.add(drop, 'drops');
    // 原版 Main.item 槽位上限 400,超出移除最旧掉落(Main.UpdateItems 空 slot 回收)——
    // 此前无上限:dev 模式一次 ~500 实体/雕像农场线性堆积(2026-08 审计 #10)
    const drops = this.entities.drops;
    while (drops.length > 400) drops.shift();
    return drop;
  }

  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: Enemy) {
    const p = this.player;
    if (p.dead) return;
    if (attacker) p.lastDamageCause = { kind: 'npc', name: (attacker.vanillaId != null ? Lang.npcName(attacker.vanillaId) : null) ?? attacker.def.name };
    const ok = p.damage(dmg, srcX, srcY);
    if (ok) {
      // 致死一击：不播受击声，只播死亡声（保证最后听到的音效是死亡）
      if (p.hp <= 0) this.sfx.play('pkilled');
      else this.sfx.play('hurt');
      // 实际扣血 = max(1, dmg - defense*0.5)（在 Player.damage 内）
      const dealt = Math.max(1, dmg - p.defense * 0.5);
      this.addDamageNumber(p.cx, p.y, Math.round(dealt), false, '#FF5050');
      // 荆棘 Buff（1.4.5.6 Player.cs:30910-30944）：thorns=1 → 反弹接触伤害全额
      // （num4 × thorns，上限 1000；num4=接触伤害原值，取受伤前的 dmg 而非扣血后 dealt）
      if (p.thornsActive && attacker && !attacker.dead) {
        const reflect = Math.min(1000, Math.round(dmg));
        attacker.hurt(reflect, Math.sign(attacker.cx - p.cx) || 1, -1.5, this);
        this.addDamageNumber(attacker.cx, attacker.y, reflect, false, '#80FF80');
      }
      if (p.hp <= 0) {
        p.dead = true;
        p.respawnTimer = 0;
        // 死亡文本/墓碑由 handlePlayerDeath 统一处理（此处不再 toast「你死了」）
        // 掉一半铜币
        const coins = p.inv.countOf(ITEM_BY_KEY['coin_copper']);
        if (coins > 0) {
          p.inv.remove(ITEM_BY_KEY['coin_copper'], Math.floor(coins / 2));
        }
      }
    }
  }

  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color = '#FFF') {
    this.dmgNumbers.push({ x, y, vy: -1.6, value: amount, crit, color, life: 50 });
  }

  onEnemyKilled(key: string) {
    // Boss 击败记账已由 Boss 逻辑块通用化(downed_<vanillaId>);此处仅保留旧调用兼容
    void key;
  }

  /** 小动物生成：视野外地表，按昼夜 + 栖息生态筛选，权重抽取。
   *  地面种：脚底精确贴地表格顶（此前高度>1格的实体被埋进地里卡死）；
   *  飞行种：仅开阔天空（向上 30 格无实心）且地表无水（鸭子除外）；
   *  蝴蝶：低空（地表上 1-4 格），优先附近有花的列。
   *  地表限定（原版 surfaceSpawn 语义，NPC.cs L2277-2290 草丛小动物只在 worldSurface 上）：
   *  玩家在地下/洞穴/地狱时不生成——此前以玩家为中心找地面且无深度守卫，
   *  玩家下地狱后会在灰烬地面上刷出兔子/鸟（biome 兜底默认 forest） */
  private spawnCritter() {
    const st = this.world.store;
    const isDay = this.world.clock.isDay;
    const pty = Math.floor(this.player.cy / TILE);
    if (pty > this.world.groundLevel + 20) return; // 玩家不在地表（±20 容纳丘陵起伏）
    const halfView = Math.ceil((this.camera.viewW / (this.camera.zoom || 1)) / 2 / TILE) + 8;
    const side = Math.random() < 0.5 ? -1 : 1;
    // 找列：蝴蝶优先附近 8 格内有 FLOWER 的列
    let tx = Math.floor(this.player.cx / TILE) + side * (halfView + Math.floor(Math.random() * 18));
    const isButterflyTentative = isDay && Math.random() < 0.35;
    if (isButterflyTentative) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const fx = tx + Math.floor((Math.random() - 0.5) * 16);
        if (fx < 4 || fx >= st.w - 4) continue;
        let found = false;
        for (let dx = -4; dx <= 4 && !found; dx++) {
          for (let y = Math.max(4, Math.floor(this.player.cy / TILE) - 24); y < Math.min(st.h - 4, Math.floor(this.player.cy / TILE) + 30); y++) {
            if (st.type[st.idx(fx + dx, y)] === T.FLOWER) { found = true; break; }
          }
        }
        if (found) { tx = fx; break; }
      }
    }
    if (tx < 4 || tx >= st.w - 4) return;
    // 找地表
    const startY = Math.max(4, Math.floor(this.player.cy / TILE) - 24);
    let groundY = -1;
    for (let y = startY; y < Math.min(st.h - 4, startY + 70); y++) {
      if (st.isSolid(tx, y)) { groundY = y; break; }
    }
    if (groundY < 0) return;
    // 落点也必须在地表：扫描窗从玩家±24 起，玩家在洞口/悬崖时可能找到洞穴顶或
    // 深层地面——直接拒绝（地狱地面 groundY≈h-200 远超 groundLevel+20）
    if (groundY > this.world.groundLevel + 20) return;
    const surfaceWater = st.liquid[st.idx(tx, groundY - 1)] > 80;
    // 生态判定
    const gTile = st.type[st.idx(tx, groundY)];
    let biome: 'forest' | 'snow' | 'sand' = 'forest';
    if (gTile === T.SNOW) biome = 'snow';
    else if (gTile === T.SAND || gTile === TILE_BY_KEY['sandstone'] || gTile === TILE_BY_KEY['hardened_sand']) biome = 'sand';
    const nearWater = surfaceWater || (() => {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (st.liquid[st.idx(tx + dx, groundY + dy)] > 80) return true;
        }
      }
      return false;
    })();
    // 海洋带判定（地图外沿 8%——螃蟹/海鸥 oceanOnly 门，防止进沙漠）
    const inOceanBand = tx < st.w * 0.08 || tx > st.w * 0.92;
    // 按昼夜 + 栖息生态过滤（水面列只出 water 生态或飞行种）
    const pool = CRITTER_DEFS.filter((c) => {
      if (c.dayOnly && !isDay) return false;
      if (c.nightOnly && isDay) return false;
      // 鸭子是两栖：水面列可生成（落在岸边浅水/滩涂），其余地面种不能在水列
      if (surfaceWater && !c.water && c.kind !== 'fly' && c.key !== 'duck') return false;
      if (c.oceanOnly && !inOceanBand) return false;
      if (!c.biomes.includes(biome) && !(nearWater && c.biomes.includes('water'))) return false;
      return true;
    });
    if (!pool.length) return;
    // 小动物已由 VanillaSpawner 的 spawnFriendly 段（SpawnAnNPC L2006-2535）接管，
    // 此处仅保留自研 Critter 兜底（过渡期）
    const total = pool.reduce((s2, c) => s2 + c.weight, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const c of pool) { r -= c.weight; if (r <= 0) { pick = c; break; } }

    if (pick.kind === 'fly') {
      // 飞行种：地表不能是水（水面飞鸟/蝴蝶不合理，鸭子除外但鸭子不是 fly）
      if (surfaceWater) return;
      // 开阔天空检查（洞穴/地底不生成）
      for (let k = 2; k <= 30; k++) {
        if (groundY - k < 4) return;
        if (st.isSolid(tx, groundY - k)) return;
      }
      // 蝴蝶低空（1-4 格）、鸟/萤火虫中高空
      const lowFly = pick.key === 'butterfly' || pick.key === 'gold_butterfly';
      const flyY = lowFly ? (groundY - 1 - Math.random() * 3) * TILE : (groundY - 8 - Math.random() * 12) * TILE;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, flyY), 'critters');
    } else if (pick.water && surfaceWater) {
      // 水生种（鸭子）：落在水面上（自上而下第一个液体格），不是湖底
      let surfY = 4;
      while (surfY < st.h - 4 && st.liquid[st.idx(tx, surfY)] <= 80) surfY++;
      if (surfY >= st.h - 4) return;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, surfY * TILE), 'critters');
    } else {
      // 地面种：参数即脚底 y（构造器内减 h），精确站上地表格顶
      const c = new Critter(pick.key, tx * TILE + 8, groundY * TILE);
      // 安全兜底：身体中心在实心块内则放弃（防卡死）
      const ci = st.idx(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE));
      if (st.type[ci] !== 0 && st.isSolid(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE))) return;
      this.entities.add(c, 'critters');
    }
  }

  spawnEnemy(key: string, x: number, y: number) {
    const e = new Enemy(key, x, y);
    this.entities.add(e, 'enemies');
    if (e.def.boss) this.boss = e;
    return e;
  }

  /** 树苗生长成树 */
  private growSaplings() {
    const st = this.world.store;
    const grown: Array<[number, number]> = [];
    // 只扫玩家附近 60×40 区域
    const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -30; dx <= 30; dx++) {
        const x = ptx + dx, y = pty + dy;
        if (!st.inBounds(x, y) || st.get(x, y) !== T.SAPLING) continue;
        // 上方 2-3 格净空才长
        if (st.isActive(x, y - 1) || st.isActive(x, y - 2) || st.isActive(x, y - 3)) continue;
        if (Math.random() < 0.5) { // 每次一半概率，模拟时间流逝
          grown.push([x, y]);
        }
      }
    }
    for (const [x, y] of grown) {
      const groundY = y + 1;
      // 原版橡实生长走 WorldGen.GrowTree 全套检查(NPC.cs 之外,WorldGen.cs:29924-29969):
      // 基座整砖(!halfBrick&&slope==0)+ 草族适树 + 至少一侧邻格适树——缺侧根地面不长
      const gi = st.idx(x, groundY);
      const FIT_GRASS = new Set([T.GRASS, TILE_BY_KEY['v_23_corrupt_grass_block'], TILE_BY_KEY['v_199_crimson_grass_block'],
        TILE_BY_KEY['v_60_jungle_grass_block'], TILE_BY_KEY['v_70_mushroom_grass_block'], T.SNOW]);
      const fitTile = (xx: number, yy: number) => {
        if (!st.inBounds(xx, yy)) return false;
        const ii = st.idx(xx, yy);
        return !!st.flags[ii] && !st.half[ii] && st.slope[ii] === 0 && FIT_GRASS.has(st.type[ii]);
      };
      if (!fitTile(x, groundY)) continue;
      if (!fitTile(x - 1, groundY) && !fitTile(x + 1, groundY)) continue;
      const th = 5 + Math.floor(Math.random() * 4);
      st.setTile(x, y, 0);
      for (let dy2 = 1; dy2 <= th; dy2++) {
        if (!st.inBounds(x, groundY - dy2)) break;
        if (st.isActive(x, groundY - dy2)) break;
        st.setTile(x, groundY - dy2, T.TREE, dy2 === th ? 22 : 0, dy2 === th ? 198 : 0); // 原版帧：顶标记(22,198)+干身(0,0)
      }
      this.world.registerTree(x, groundY - th, th);
      this.chunks.markDirtyArea(x - 4, groundY - th - 4, x + 4, groundY);
    }
  }

  /** 拾取物品飘名（主角旁浅白文本）。同一时间只保留一个，
   * 新拾取直接替换旧的 —— 不产生拖影，不会误读为多个物品 */
  showPickupLabel(itemKey: string) {
    const def = ITEM_DEFS[ITEM_BY_KEY[itemKey]];
    if (!def) return;
    this.dmgNumbers = this.dmgNumbers.filter((d) => !d.label);
    this.dmgNumbers.push({
      x: this.player.cx, y: this.player.y - 8, vy: -0.7,
      value: 0, crit: false, color: '#F0F0F0', life: 55, label: Lang.itemNameByKey(def.key),
    });
  }

  playSfx(name: string, vol?: number) {
    this.sfx.play(name as SfxName, vol ?? 1);
  }

  playSfxFiles(files: string[], vol?: number) {
    if (!this.sfx.playFiles(files, vol ?? 1)) this.sfx.play('hit', vol ?? 1);
  }

  /** 拾取物品后刷新 UI（带轻量节流 + 尾包补发，最多延迟 ~166ms） */
  private invNotifyAt = -100;
  private invNotifyPending = false;
  /** 新物品入手飘名（主角旁浅白文本） */

  notifyInventoryChanged() {
    // 检测新物品：与上次快照比较，新增的种类在主角旁飘名
    const inv = this.player.inv;
    if (!this._invSnapshot) {
      this._invSnapshot = new Map<number, number>();
      for (const s2 of inv.slots) {
        if (s2) this._invSnapshot.set(s2.id, (this._invSnapshot.get(s2.id) ?? 0) + s2.stack);
      }
      return;
    }
    const now = new Map<number, number>();
    for (const s2 of inv.slots) {
      if (s2) now.set(s2.id, (now.get(s2.id) ?? 0) + s2.stack);
    }
    for (const [id, n] of now) {
      const before = this._invSnapshot.get(id) ?? 0;
      if (n > before && this.tickCount - this.lastNotifiedAt > 30) {
        this.lastNotifiedAt = this.tickCount;
        const def = ITEM_DEFS[id];
        if (def) {
          this.dmgNumbers.push({
            x: this.player.cx, y: this.player.y - 6, vy: -0.9,
            value: 0, crit: false, color: '#FFFFFF', life: 60, label: Lang.itemNameByKey(def.key),
          } as DamageNumber & { label: string });
        }
        break; // 每次 refresh 只飘一个
      }
    }
    this._invSnapshot = now;
    if (this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    } else {
      this.invNotifyPending = true;
    }
  }
  private _invSnapshot: Map<number, number> | null = null;
  private lastNotifiedAt = 0;

  private flushInvNotify() {
    if (this.invNotifyPending && this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    }
  }

  /** 火把火星：视区内点燃的火把按概率在火点处飘出上浮火粒 */
  private emitTorchSparks() {
    if (this.tickCount % 3 !== 0) return; // 20Hz 足够，省扫描
    const st = this.world.store;
    const cam = this.camera;
    const z = cam.zoom || 1;
    const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE));
    const tx1 = Math.min(this.world.w - 1, Math.ceil((cam.x + cam.viewW / 2 / z) / TILE));
    const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE));
    const ty1 = Math.min(this.world.h - 1, Math.ceil((cam.y + cam.viewH / 2 / z) / TILE));
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== T.TORCH) continue;
        if (Math.random() >= 0.075) continue; // 原版 1/40/帧@60Hz（TileDrawing:7220）≈ 每 3 tick 0.075
        // 火点位置按锚定帧（TileDrawing.cs:7227-7231）：左锚 22→+6、右锚 44→+2、底/墙→+4
        const fx = st.frameX[i];
        const sparkX = fx === 22 ? 6 : fx === 44 ? 2 : 4;
        this.particles.push({
          x: x * TILE + sparkX + Math.random() * 4,
          y: y * TILE + Math.random() * 4,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.35 - Math.random() * 0.4,   // 原版 velocity.Y -= 1.5（上飘）
          life: 16 + Math.random() * 12, maxLife: 28,
          color: Math.random() < 0.55 ? '#FFB642' : Math.random() < 0.5 ? '#FF8A2A' : '#FFD97A',
          size: 1 + Math.random() * 1.2,
          grav: -0.015,  // 微浮力：火星徐徐上飘
          damp: 0.985,
        });
      }
    }
  }

  // ================= 高门自动通行（DoorOpeningHelper.cs 1:1 简化） =================
  // 玩家 hitbox 与关闭高门(388)矩形 (16×96) 相交且垂直容纳 → 自动 ShiftTallGate 开门；
  // 离开门区（矩形外扩 1px）→ 自动关闭。仅玩家（NPC/敌怪不触发——原版同）。
  private openTallGates = new Map<number, number>(); // 锚点 idx → 开门时刻（tick）
  private updateTallGateAuto() {
    const st = this.world.store;
    const p = this.player;
    if (p.dead) return;
    const CLOSED = TILE_BY_KEY['v_388_tall_gate_closed'];
    const OPEN = TILE_BY_KEY['v_389_tall_gate_open'];
    if (!CLOSED || !OPEN) return;
    // 玩家覆盖格 ±1 扫关闭高门 → 自动开
    const tx0 = Math.floor((p.x - 2) / TILE), tx1 = Math.floor((p.x + p.w + 2) / TILE);
    const ty0 = Math.floor((p.y - 2) / TILE), ty1 = Math.floor((p.y + p.h + 2) / TILE);
    for (let x = tx0; x <= tx1; x++) {
      for (let y = ty0; y <= ty1; y++) {
        if (!st.inBounds(x, y) || st.type[st.idx(x, y)] !== CLOSED) continue;
        const anchor = shiftTallGate(st, x, y, false, (n: string) => this.sfx.play(n as SfxName));
        if (anchor) this.openTallGates.set(st.idx(anchor[0], anchor[1]), this.tickCount);
      }
    }
    // 已开门离开检测：门矩形（外扩 1px）与玩家 hitbox 不相交 → 关
    for (const ai of Array.from(this.openTallGates.keys())) {
      const ax = ai % st.w, ay = Math.floor(ai / st.w);
      if (st.get(ax, ay) !== OPEN) { this.openTallGates.delete(ai); continue; }
      const rect = { x: ax * TILE - 1, y: ay * TILE, w: TILE + 2, h: 5 * TILE };
      const overlap = p.x < rect.x + rect.w && p.x + p.w > rect.x && p.y < rect.y + rect.h && p.y + p.h > rect.y;
      if (!overlap) {
        if (shiftTallGate(st, ax, ay, true, (n: string) => this.sfx.play(n as SfxName))) this.openTallGates.delete(ai);
      }
    }
  }

  /** 火把锚定检查：格 (x,y) 变化后，检查其四邻与自身的火把是否失去支撑 → 掉落 */
  private checkTorchDetach(x: number, y: number) {
    const st = this.world.store;
    const TORCH_ID = T.TORCH;
    for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0]] as const) {
      const tx = x + dx, ty = y + dy;
      if (!st.inBounds(tx, ty)) continue;
      const i = st.idx(tx, ty);
      if (st.type[i] !== TORCH_ID) continue;
      if (torchStillAnchored(st, tx, ty, st.frameX[i])) continue;
      st.setTile(tx, ty, 0);
      this.spawnDrop(tx * TILE + 8, ty * TILE, 'torch', 1);
      this.sfx.play('dig');
    }
  }

  spawnParticles(
    x: number, y: number, color: string, count: number, speed = 2,
    opts: { life?: number; damp?: number; grav?: number } = {},
  ) {
    const base = opts.life ?? 40;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const life = Math.round(base * (0.6 + Math.random() * 0.4));
      this.particles.push({
        x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 1,
        life, maxLife: life, color, size: 2 + Math.random() * 2,
        damp: opts.damp, grav: opts.grav,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  setZoom(z: number) {
    if (!this.camera) return;
    this.camera.setZoomTarget(z);
  }

  // ================= 合成 =================

  itemId(key: string): number {
    return ITEM_BY_KEY[key];
  }

  stationsNearby(): Set<string> {
    const st = this.world.store;
    const px = Math.floor(this.player.cx / TILE), py = Math.floor(this.player.cy / TILE);
    const found = new Set<string>(['hand']);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const t = st.get(px + dx, py + dy);
        if (t === T.WORKBENCH) found.add('workbench');
        if (t === T.FURNACE) found.add('furnace');
        if (t === T.ANVIL) found.add('anvil');
      }
    }
    return found;
  }

  canCraft(r: (typeof RECIPES)[number]): boolean {
    if (!this.stationsNearby().has(r.station)) return false;
    return r.inputs.every(([key, n]) => this.player.inv.countOf(ITEM_BY_KEY[key]) >= n);
  }

  craft(r: (typeof RECIPES)[number]) {
    if (!this.canCraft(r)) return;
    for (const [key, n] of r.inputs) this.player.inv.remove(ITEM_BY_KEY[key], n);
    this.player.inv.add(ITEM_BY_KEY[r.out], r.count);
    this.cb.onInventoryChanged();
  }

  // ================= 召唤 Boss =================

  /** 通用 Boss 召唤:vanilla 数据路径(NPC 13=世吞头带体节链 / 50=史莱姆王 / 266=克脑) */
  summonBoss(key: string): void {
    if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    this.summonBossAtTx(key, tx);
  }

  /** 指定落点列召唤(summonBoss 的位置化变体;守卫老人诅咒在地牢上空召唤骷髅王) */
  private summonBossAtTx(key: string, tx: number): void {
    if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
    const st = this.world.store;
    tx = Math.max(2, Math.min(st.w - 3, tx));
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (st.type[st.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    const vanillaId = key === 'eater_of_worlds_head' ? 13 : key === 'king_slime' ? 50 : key === 'brain_of_cthulhu' ? 266
      : key === 'skeletron_head' ? 35 : key === 'queen_bee' ? 222 : key === 'skeletron_prime' ? 127
      : key === 'destroyer' ? 134 : key === 'twins' ? 125 : key === 'wall_of_flesh' ? 113
      : key === 'lunatic_cultist' ? 439 : key === 'empress_of_light' ? 636 : key === 'queen_slime' ? 657
      : key === 'plantera' ? 262 : key === 'duke_fishron' ? 370 : key === 'moon_lord' ? 398 : key === 'golem' ? 245 : -1;
    if (vanillaId >= 0 && Enemy.fromVanilla) {
      const head = Enemy.fromVanilla(vanillaId, tx * TILE + 8, spawnY);
      if (head) {
        this.entities.add(head, 'enemies');
        this.boss = head;
        if (vanillaId === 13) {
          // 世吞体节链(原版 15-30 段)
          const segs = Enemy.spawnWormChain(head, 15 + Math.floor(Math.random() * 16));
          for (const sg of segs) this.entities.add(sg, 'enemies');
        }
        if (vanillaId === 125) {
          // 双子:同场生成第二只 126(原版机械魔眼双召;击败记账以 125 为准)
          const twin = Enemy.fromVanilla(126, (tx + 4) * TILE + 8, spawnY);
          if (twin) { twin.id = this.entities.nextId++; this.entities.add(twin, 'enemies'); }
        }
        if (vanillaId === 134) {
          // 毁灭者:地下落位(原版 SpawnNPC 走地下生成;80 段链由 destroyerAI 首帧补)
          head.y = Math.min(st.h - 10, Math.floor(this.world.rockLevel) + 30) * TILE;
        }
        if (vanillaId === 113) {
          // 血肉墙:地狱层落位(原版向导巫毒娃娃入熔岩;2 眼+11 饥饿者由 AI 首帧补)
          head.y = Math.min(st.h - 30, Math.floor(this.world.lavaLine || st.h - 200) + 5) * TILE;
        }
        // 召唤公告+音效（每 Boss 独立，见 bossSummonAnnounce/注释）
        this.announceBossSummon(vanillaId);
        return;
      }
    }
    this.spawnEnemy(key, tx * TILE + 8, spawnY);
    this.sfx.playWav('roar');
    this.cb.onToast(Lang.misc(9));
  }

  /** Boss 召唤公告 + 音效（1.4.5.6 语义）：
   *  文本：SpawnOnPlayer 末尾 switch（NPC.cs:81495-81511）——default 走
   *  Announcement.HasAwoken（"{名}已苏醒！"）；双子 125 专项 Lang.misc[48]；
   *  126/398（部件/第二只）不播；月总 398 用 Enemies.MoonLord（"月亮领主"）。
   *  颜色 ChatColors.BossOrEvent = (175,75,255)（onChat 未接线时回退 toast）。
   *  音效：ItemCheck_UseBossSpawners（Player.cs:43083+）统一 SoundID 15 Roar；
   *  唯一例外 Abeemination(蜂后) → SoundID.Item173。 */
  private announceBossSummon(vanillaId: number): void {
    const announce = (text: string) => {
      if (this.cb.onChat) this.cb.onChat(text, 175, 75, 255);
      else this.cb.onToast(text);
    };
    if (vanillaId === 125) {
      announce(Lang.misc(48));                              // 双子魔眼已苏醒！
    } else if (vanillaId !== 126) {
      // 398 月总：原版播 Enemies.MoonLord（NPC.cs:81358-81360），不取 MoonLordCore 名
      const name = vanillaId === 398
        ? Lang.text('Enemies.MoonLord')
        : (Lang.npcName(vanillaId) ?? vanillaNpc(vanillaId)?.name ?? '???');
      announce(Lang.text('Announcement.HasAwoken', name));
    }
    this.sfx.playWav(vanillaId === 222 ? 'beeSummon' : 'roar');
  }

  useSuspiciousEye() {
    if (this.world.clock.isDay) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      return;
    }
    if (this.boss) return;
    // 从远处地表生成（离玩家 ~55 格），Boss 会自己飞过来
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (this.world.store.type[this.world.store.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    // fromVanilla(4) 取原版 NPC_4 贴图(6 帧)+rotation;数值与 ENEMY_DEFS 一致(2800/15/12/0)
    const e = Enemy.fromVanilla(4, tx * TILE + 8, spawnY);
    if (e) {
      e.id = this.entities.nextId++;
      this.entities.add(e, 'enemies');
      this.boss = e;
    }
    // 公告+音效与 summonBoss 同语义（EoC → "克苏鲁之眼已苏醒！" + Roar）
    this.announceBossSummon(4);
  }

  /** 地图传送：在目标点附近找可容纳主角的空间（2 格高净空 + 站立地面）。
   *  优先目标点自身，然后螺旋外扩到 24 格内就近安置 */
  /** 传送前贴图就位门:目标区域 ±160 类型扫描 → 预载 → 再落位。
   *  多数表已加载时扫描+命中检查 <10ms(无感);跨群系首传才真正等待加载 */
  private async teleportWhenReady(tx: number, ty: number): Promise<void> {
    const a = this.atlas;
    if (a) {
      const { tileSheets, wallIds } = this.collectSheetsAround(tx, ty, 160);
      // 全部已就位 → 零延迟直传;有缺 → 提示并等待(通常 <1s)
      const missing = [...tileSheets].some((id) => {
        const m = a.vanilla.tiles[String(id)];
        return m && !a.vimages.has(m.sheet);
      }) || [...wallIds].some((id) => {
        const m = a.vanilla.walls[String(id)];
        return m && !a.vimages.has(m.sheet);
      });
      if (missing) this.cb.onToast(Lang.text('Mods.SandboxWorld.Progress.LoadTeleportTex'));
      await a.preloadTileSheetsFor(tileSheets, wallIds);
    }
    if (this.teleportNear(tx, ty)) {
      this._tpTarget = null;
      this.renderer.tpMark = null;
      this.renderer.fullMap.open = false;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.Teleported'));
    }
  }

  private teleportNear(tx: number, ty: number): boolean {
    const st = this.world.store;
    const p = this.player;
    // 空中落点：2 格净空即可（无地面要求）
    const fitsAir = (x: number, y: number) => {
      for (let dy = 0; dy <= 1; dy++) {
        if (!st.inBounds(x, y - dy) || st.isSolid(x, y - dy)) return false;
      }
      return true;
    };
    const fits = (x: number, y: number) => {
      // (x, y-1..y) 两格净空（无实心/无液体），y+1 格实心站立
      for (let dy = 0; dy <= 1; dy++) {
        if (!st.inBounds(x, y - dy) || st.isSolid(x, y - dy)) return false;
        if (st.liquid[st.idx(x, y - dy)] > 100) return false;
      }
      return st.inBounds(x, y + 1) && st.isSolid(x, y + 1);
    };
    if (fits(tx, ty)) {
      p.x = tx * TILE + 1; p.y = (ty - 1) * TILE;
    } else {
      // 螺旋外扩找最近可站位置
      let found = false;
      for (let r = 1; r <= 24 && !found; r++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (fits(tx + dx, ty + dy)) {
              p.x = (tx + dx) * TILE + 1;
              p.y = (ty + dy - 1) * TILE;
              found = true;
            }
          }
        }
      }
      if (!found) {
        // 高空/无地面：允许落在空中（目标列上下找 2 格净空，重力会带下来）
        for (let dy = 0; dy <= 6; dy++) {
          for (const sy of [ty - dy, ty + dy]) {
            if (fitsAir(tx, sy)) {
              p.x = tx * TILE + 1; p.y = (sy - 1) * TILE;
              p.vx = 0; p.vy = 0;
              this.camera.x = p.cx; this.camera.y = p.cy;
              return true;
            }
          }
        }
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.TeleportSolid'));
        return false;
      }
    }
    p.vx = 0; p.vy = 0;
    this.camera.x = p.cx; this.camera.y = p.cy;
    return true;
  }

  /** Main.NewText(Main.cs:64095):左下角消息列。颜色 = ChatColors.cs 五色 */
  newText(text: string, r = 255, g = 255, b = 255): void {
    this.cb.onChat?.(text, r, g, b);
  }

  /** Announcement 类消息便捷封装(NPC.cs/WorldGen.cs BroadcastChatMessage 语义) */
  announce(key: string, who: string, r: number, g: number, b: number): void {
    this.newText(Lang.text(key, who), r, g, b);
  }

  // ================= 重生 =================

  /** 玩家死亡瞬间：原版死亡文本 + 红色粉碎粒子 + 掉落物理墓碑（Player.DropTombstone） */
  private _deathHandled = false;
  private handlePlayerDeath() {
    const p = this.player;
    // 死亡文本（Lang.CreateDeathMessage 1:1：generic/摔落/溺水/岩浆/凶手 NPC）
    const cause = p.lastDamageCause ?? { kind: 'default' } as const;
    const deathText = createDeathText(this.playerName(), cause);
    // 原版 Player.cs:38312-38313:死亡消息走消息列,色 (225,25,25)
    this.newText(deathText, 225, 25, 25);
    // 红色粉碎粒子：身体范围多层爆散，喷溅落地反弹/停驻后缓慢淡出（约 5 秒）
    this.spawnParticles(p.cx, p.y + 8, '#C02020', 22, 3.2, { life: 300, damp: 0.988, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy, '#8A1010', 16, 2.4, { life: 280, damp: 0.985, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy - 6, '#E85050', 10, 2.8, { life: 260, damp: 0.988, grav: 0.09 });
    // 墓碑（Player.DropTombstone 1:1）：按身家选款式，从死亡点抛射坠落，落格安放+碑文
    this.entities.add(new Tombstone(p.cx, p.cy, this.coinsOwned(), deathText, p.facing), 'props');
  }

  /** 身家（铜币计价）——DropTombstone 的金币门槛（>100000 → 金墓碑 527-531） */
  private coinsOwned(): number {
    const p = this.player;
    const n = (key: string, mult: number) => p.inv.countOf(ITEM_BY_KEY[key]) * mult;
    return n('coin_copper', 1) + n('coin_silver', 100) + n('coin_gold', 10000);
  }

  /** 角色名（死亡文本/墓碑碑文用；未命名回退） */
  playerName(): string {
    return this.player.appearance?.name?.trim() || Lang.text('Mods.SandboxWorld.DefaultPlayerName');
  }


  respawnPlayer() {
    const p = this.player;
    p.hp = p.maxHp;
    p.dead = false;
    p.iframes = 90;
    p.respawnTimer = 0;
    p.x = this.world.spawnX * TILE + 8;
    p.y = (this.world.spawnY - 3) * TILE;
    p.vx = 0; p.vy = 0;
  }

  // ================= 渲染 =================

  render() {
    const cam = this.camera;
    const L = this.lighting;
    this.renderer.scene = this.scene; // 群系背景（BiomeBackground）每帧注入最新环境采样
    this.renderer.annotateMarks = this.annotateMode ? this.marks : null;
    // 导线可见性:手持电路工具(mech)或 F7 强制(Main.cs:43548 DrawWires 开关语义)
    const held = this.player.inv.heldItem();
    this.renderer.showWires = this.forceShowWires || !!held && !!ITEM_DEFS[held.id]?.wireTool;
    const hover = (this.input.uiBlocking || this.renderer.timeUiHover) ? null : (() => {
      const [tx, ty] = cam.tileUnder(this.input.mouseX, this.input.mouseY);
      return this.world.store.inBounds(tx, ty) ? { x: tx, y: ty } : null;
    })();
    // 宏伟蓝图拖拽预览:锚点已按下且鼠标悬停有效格时,把 L 路径交给渲染器
    this.renderer.grandPreview = this.grandAnchor && hover
      ? { from: this.grandAnchor, to: [hover.x, hover.y], mode: this.wireToolMode }
      : null;
    this.renderer.render(
      cam, this.world, this.world.clock, this.chunks,
      L.r, L.g, L.b, L.rx, L.ry, L.rw, L.rh,
      this.player,
      this.entities.all(),
      this.particles, this.dmgNumbers,
      this.swing, hover,
      this.boss ? { name: this.boss.vanillaId != null ? Lang.npcName(this.boss.vanillaId) ?? this.boss.def.name : this.boss.def.name, hp: this.boss.hp, maxHp: this.boss.maxHp } : null,
      this.input.mouseX, this.input.mouseY, this.input.mouseDown,
      this.mining ? Math.min(1, this.mining.progress / this.hardnessCache) : 0,
      this.lighting.clock, // FlickerClock：资源条亮度/呼吸（mouseTextColor/cursorScale）
    );
  }

  /** 每逻辑帧后处理挥舞命中（在 fixedUpdate 实体更新后调用） */
  postUpdate() {
    this.updateSwingHits();
  }
}
