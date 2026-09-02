// 智能选取（Smart Select）——原版 1.4.5.6 一比一移植。
//
// 与智能光标（SmartCursor.ts，Ctrl 选目标格）是相互独立的系统：
// Smart Select = 按住 Shift（键绑定 "SmartSelect"）时按鼠标所指方块自动换手持工具/光源。
//
// 权威源码对照（行号 = Terarria1456 反编译）：
//   - 键绑定 SmartSelect = "LeftShift"            PlayerInput.cs:1898 / :2011 / :2123 / :2235
//   - TriggersSet.CopyInto → p.controlTorch       TriggersSet.cs:782-795（mouseInterface 让位）
//   - 每帧驱动 SelectedItemState.Update           Player.cs:483-517（Player.Update :24923 调用）
//   - PickItemSelectionOverride                   Player.cs:17259-17280
//   - SmartSelectLookup                           Player.cs:17283-17309
//   - 目标格换算 SmartSelectLookup_GetTargetTile   SmartSelectGamepadPointer.cs:23-38
//     （Player.cs:17311-17319 还有一份同体私有副本，未被调用）
//   - SmartSelect_PickToolForStrategy             Player.cs:17321-17470
//   - SmartSelect_GetToolStrategy                 Player.cs:17472-17528
//   - SmartSelect_GetAvailableToolRanges          Player.cs:17530-17562
//   - 换选门 CanChangeSelectedItemImmediately     Player.cs:386-393
//   - 覆盖/还原 OverrideSelection                 Player.cs:424-434
//   - OnSelectionChanged                          Player.cs:519-533
//   - 物品集 ItemID.Sets.Torches/WaterTorches      ItemID.cs:1192 / :1194
//             Glowsticks                          ItemID.cs:1198
//             IsPaintScraper                      ItemID.cs:254
//             ExtractinatorMode                   ItemID.cs:1104
//   - 方块集 Main.tileHammer（4 条）              Main.cs:7153-7156
//             Main.tileAxe（16 条）               Main.cs:7157-7171
//   - 叶绿提取机兑换表                            ItemTrader.cs:82-108（TryGetTradeOption :66-80）
//   - 玩家湿身 Collision.WetCollision             Collision.cs:1575-1656（Player.cs:27540 置位）
//
// tile 桥接与 SmartCursor 共用 sheetOf / vanillaItemIdOf（src/player/SmartCursor.ts）。
import type { TileStore } from '../world/TileStore';
import { sheetOf, vanillaItemIdOf } from './SmartCursor';
import { CHLOROPHYTE_TRADES, EXTRACTINATOR_MODE } from '../world/Extractinator';
import type { ItemDef } from '../data/items';

// ===================== 原版 ItemID.Sets 集合 =====================

/** ItemID.cs:1192 Torches（CreateBoolSet 24 项） */
const TORCH_ITEMS: ReadonlySet<number> = new Set([8, 427, 3004, 523, 433, 429, 974, 1333, 1245, 3114,
  430, 3045, 428, 2274, 431, 432, 4383, 4384, 4385, 4386, 4387, 4388, 5293, 5353]);

/** ItemID.cs:1194 WaterTorches（水中不熄：诅咒 523 / 脓血 1333 / 珊瑚 4384） */
const WATER_TORCH_ITEMS: ReadonlySet<number> = new Set([523, 1333, 4384]);

/** ItemID.cs:1198 Glowsticks（荧光棒族 6 项） */
const GLOWSTICK_ITEMS: ReadonlySet<number> = new Set([282, 286, 3112, 3002, 4776, 5643]);

/** ItemID.cs:254 IsPaintScraper（油漆刮刀；本作油漆系统未建——集合保留，策略 8 可选中刮刀） */
const PAINT_SCRAPER_ITEMS: ReadonlySet<number> = new Set([1100, 1545]);

/** 信号枪 FlareGun（ItemID.cs:3399）——case 4/5 的特殊光源分支（Player.cs:17368/:17406） */
const FLARE_GUN = 930;
/** AmmoID.Flare = 931（AmmoID.cs:132） */
const AMMO_FLARE = 931;
/** 信号枪 useAmmo（Item.cs:12108 `useAmmo = AmmoID.Flare`）。
 *  vanilla-itemfunc.json 对 930 提取为 useAmmo:-1（tools/extract-itemfunc.mjs 缺该分支），
 *  此处按原版源码补正——case 4/5 的弹药门（Player.cs:17373-17384 / :17408-17420）依赖。 */
const FLARE_GUN_USE_AMMO: Readonly<Record<number, number>> = { 930: AMMO_FLARE };
/** 荧光弹族 ammo（Item.cs:12121 Flare / :19106 BlueFlare 均 `ammo = AmmoID.Flare`）。
 *  提取缺口同上（json 中均为 -1），按原版补正。 */
const FLARE_AMMO_ITEMS: ReadonlySet<number> = new Set([931, 1614]);

// ===================== 原版 Main.tileHammer / Main.tileAxe（以 sheet = 原版 tile id 表达） =====================

/** Main.cs:7153-7156 tileHammer 全表（26 祭坛 / 695 / 31 暗影珠（猩红心=frameX≥36 同格样式）/ 696） */
const TILE_HAMMER_SHEETS: ReadonlySet<number> = new Set([26, 31, 695, 696]);

/** Main.cs:7157-7171 tileAxe 全表（树 5 / 蘑菇树 72 / 仙人掌 80 / 倒木 488 / 倒木回响 704 /
 *  棕榈树 323 / 樱花树 596 / 黄柳树 616 / 灰烬树 634 / 宝石树 583-589） */
const TILE_AXE_SHEETS: ReadonlySet<number> = new Set([
  5, 72, 80, 488, 704, 323, 596, 616, 634, 589, 584, 588, 586, 587, 585, 583,
]);

/** 策略号语义（SmartSelect_GetToolStrategy 各分支的 toolStrategy 值） */
export const STRATEGY = {
  TORCH: 0,        // 默认：放火把/荧光棒
  HAMMER: 1,       // tileHammer 方块
  AXE: 2,          // tileAxe 方块
  PICK: 3,         // 其余实心方块
  WET_LIGHT: 4,    // 湿格/自身湿 → 水下光源
  FAR_LIGHT: 5,    // 超 200px：火把放不到 → 投掷光源
  CANNON: 6,       // tile 209 大炮 → 火把点火
  EXTRACT: 7,      // tile 219/642 提取机 → 可投入物
  PAINT_SCRAPER: 8,// tile 184 长苔藓 → 刮漆器
} as const;

// ===================== 输入上下文 =====================

/** inventory[0..57] 单槽语义（Player.inventory 的窄视图；0-49 背包 + 50-53 钱币 + 54-57 弹药） */
export interface SmartSelectSlot {
  /** Item.type（原版物品 id；空槽 0） */
  vid: number;
  /** Item.stack（空槽 0） */
  stack: number;
  /** Item.pick / Item.axe / Item.hammer（>0 = 该类工具） */
  pick: number;
  axe: number;
  hammer: number;
  /** Item.ammo（0 = AmmoID.None，AmmoID.cs:112） */
  ammo: number;
  /** Item.useAmmo（0 = AmmoID.None） */
  useAmmo: number;
  /** Item.tileBoost（Player.cs:17537-17560 取第一件对应工具的 reach 加成） */
  tileBoost: number;
}

/** 空槽（inventory[i].IsAir → type=0 / stack=0 / 三力 0） */
export const EMPTY_SLOT: SmartSelectSlot = {
  vid: 0, stack: 0, pick: 0, axe: 0, hammer: 0, ammo: 0, useAmmo: 0, tileBoost: 0,
};

/** 由 ItemDef + 三力画像构建槽语义（Game 每帧对 0-57 构建）。
 *  传 into 则原地填充（每帧复用缓冲，防分配热点）；legacy def.tool 画像只覆盖自身类型的
 *  主力（Game 工具判定同序 def.tool 优先），vi_ 双工具（Hamaxe 斧+锤 / Drax 镐+斧）
 *  其余副力保留 itemfunc 全量 */
export function smartSelectSlotOf(
  def: ItemDef | null | undefined,
  stack: number,
  itemFunc: { pick?: number; axe?: number; hammer?: number; ammo?: number; useAmmo?: number } | null | undefined,
  toolOverride?: { type: 'pick' | 'axe' | 'hammer'; power: number } | null,
  into?: SmartSelectSlot,
): SmartSelectSlot {
  const vid = vanillaItemIdOf(def) ?? 0;
  const pick = itemFunc?.pick ?? 0;
  const axe = itemFunc?.axe ?? 0;
  const hammer = itemFunc?.hammer ?? 0;
  const t = toolOverride;
  const out: SmartSelectSlot = into ?? {
    vid: 0, stack: 0, pick: 0, axe: 0, hammer: 0, ammo: 0, useAmmo: 0, tileBoost: 0,
  };
  out.vid = vid;
  out.stack = stack;
  out.pick = t?.type === 'pick' ? t.power : pick;
  out.axe = t?.type === 'axe' ? t.power : axe;
  out.hammer = t?.type === 'hammer' ? t.power : hammer;
  out.ammo = itemFunc?.ammo ?? 0;
  out.useAmmo = itemFunc?.useAmmo ?? 0;
  out.tileBoost = 0;
  return out;
}

export interface SmartSelectPlayer {
  /** Player.position（px） */
  x: number; y: number;
  /** Player.width / height（px） */
  w: number; h: number;
  /** Player.wet（Player.cs:27540，经 Collision.WetCollision Collision.cs:1575 判定） */
  wet: boolean;
  /** Player.gravDir（反重力未实装，恒 1；SmartSelectGamepadPointer.cs:28-30 的翻转分支保留） */
  gravDir: number;
}

export interface SmartSelectEnv {
  /** Player.controlTorch（TriggersSet.cs:794 = SmartSelect 键按住） */
  controlTorch: boolean;
  /** PlayerInput.UsingGamepad（本作恒 false——:17293-17296 手柄粘滞分支保留为死代码注释） */
  usingGamepad: boolean;
  st: TileStore;
  /** MouseWorld（Main.mouseX + screenPosition，px） */
  mouseX: number; mouseY: number;
  /** Main.screenPosition.Y（屏幕左上角世界 Y，px；gravDir=-1 翻转分支用） */
  screenTopY: number;
  /** Main.screenHeight（px，gravDir=-1 翻转分支用） */
  screenHeight: number;
  player: SmartSelectPlayer;
  /** inventory[0..57]（长度 58：0-49 背包 + 钱币 + 弹药；case 4/5 弹药门扫到 57，Player.cs:17374/:17410） */
  slots: SmartSelectSlot[];
  /** Player.selectedItem（SelectedItemState.Selected，Player.cs:3689） */
  selectedItem: number;
  /** IsInTileInteractionRange（Player.cs:31548，TileReachCheckSettings.Simple 档 + tileBoost） */
  inRange: (tx: number, ty: number, tileBoost: number) => boolean;
}

/** SelectedItemState（Player.cs:383-517）的宿主窄视图——换选/还原语义由 SmartSelect 代管 */
export interface SmartSelectHost {
  /** 当前选中槽（读写在宿主上落地） */
  selected: number;
  /** SelectedItemState.Hotbar（Player.cs:391）——selected≥10 且空手时回退（:499-501） */
  hotbar: number;
  /** CanChangeSelectedItemImmediately（Player.cs:386-393：itemAnimation/reuseDelay/channel/
   *  pendingItemReuse 全空 且 itemTime==0） */
  canChangeImmediately: boolean;
  /** inventory[i].IsAir */
  isSlotEmpty: (i: number) => boolean;
  /** OnSelectionChanged（Player.cs:519-533）——宿主刷新热栏/挥击态 */
  onSelectionChanged: () => void;
}

// ===================== 玩家湿身（Collision.WetCollision，Collision.cs:1575-1656） =====================

/**
 * 玩家是否浸在液体中——Collision.WetCollision 1:1（不含 honey/shimmer 位，Smart Select 只用 wet；
 * npcLiquid.wetCollision 同款 :73-84 含完整三态返回）。以命中盒中心的
 * (min(10,width) × height/2) 盒与液体面（液量换算的表面下移）求交。
 * ★2026-08-31 补缺：:1632-1654 坡面格+上方液体支曾整段漏移植(结构性缺口，
 *   由 ledger 线移交补齐)——斜坡贴水处 wet 低估影响 Smart Select 荧光棒/信号枪等策略。
 */
export function wetCollision(st: TileStore, x: number, y: number, w: number, h: number): boolean {
  // :1578-1592 盒中心 + num=10 / num2=Height/2（各自截到宽/高）。
  // ★整除陷阱×5：Width/2·Height/2(中心两项)+Height/2(num2 推导)+num/2·num2/2(偏移两项)
  //   全部为 C# int/int 截断——浮点除会整体偏 ≤0.5px。2026-08-31 鸭面跳切定罪后，
  //   本副本与 npcLiquid.wetCollision 同步修（曾漏整除+effH 漏 (int) 截断+环扫界闭区间）
  let num = 10;
  let num2 = Math.floor(h / 2);
  if (num > w) num = w;
  if (num2 > h) num2 = h;
  const vx = x + Math.floor(w / 2) - Math.floor(num / 2);
  const vy = y + Math.floor(h / 2) - Math.floor(num2 / 2);
  // :1591-1594 扫描区外扩（C# for(i=val;i<val2;i++) 半开区间——value2/value4 已 +2）
  const x0 = Math.max(0, Math.floor(x / 16) - 1);
  const x1 = Math.min(st.w - 1, Math.floor((x + w) / 16) + 2);
  const y0 = Math.max(0, Math.floor(y / 16) - 1);
  const y1 = Math.min(st.h - 40, Math.floor((y + h) / 16) + 2);
  for (let i = x0; i < x1; i++) {
    for (let j = y0; j < y1; j++) {
      const idx = st.idx(i, j);
      if (!st.inBounds(i, j)) continue;
      const liquid = st.liquid[idx];
      if (liquid > 0) {                                // :1607-1629
        // :1612-1617 液面下移：num5=(256-liquid)/32f，表面 y += num5*2；有效高 16 −=(int)(num5*2f)
        const drop = (256 - liquid) / 32;
        const surfY = j * 16 + drop * 2;
        const surfH = 16 - Math.trunc(drop * 2);       // ★C# int 强转截断（曾浮点直减）
        // :1618 与中心盒 AABB 求交
        if (vx + num > i * 16 && vx < i * 16 + 16 && vy + num2 > surfY && vy < surfY + surfH) {
          return true;
        }
      } else {
        // :1631-1654 坡面格+上方液体支——本格无液但为斜坡时，若上一行格有液，
        // 整格按满高 16 计判湿（水体沿坡面浸润；不做液面下移）。上方格只读
        // liquid>0，不查 active/nactive（原版即如此）；j<=0 为世界顶界守门。
        // honey/shimmer 位取上方液型——本副本不承（同 npcLiquid 版差异登记）。
        // ★L1（2026-09-01 NX3 遗留清偿）：原版 :1632 门 = tile.active()【纯在场位】
        //   （Tile.cs active()=HasTile，无 inActive 检查）⇒ 致动斜坡同样判湿。
        //   本仓 isActive 实为 nactive()（active && !inActuated），曾致接线致动
        //   斜坡漏判湿——与 npcLiquid/WeaponProj.inLiquid 三副本同步改纯在场
        //   type!==0（SC 线禁令解除，本副本属同函数族 WetCollision 移植体）。
if (st.type[idx] === 0 || st.slope[idx] === 0 || j <= 0) continue;
        const above = st.idx(i, j - 1);
        if (st.liquid[above] <= 0) continue;
        if (vx + num > i * 16 && vx < i * 16 + 16 && vy + num2 > j * 16 && vy < j * 16 + 16) {
          return true;
        }
      }
    }
  }
  return false;
}

// ===================== 状态机 =====================

export class SmartSelect {
  /** _lastSmartCursorToolStrategy（Player.cs:17286 清零 / :17306 写回；手柄粘滞 :17293-17296 用） */
  lastStrategy = -1;
  /** SelectedItemState.overridden（Player.cs:392）——行为选中前的原槽，松键还原用 */
  private overridden = -1;
  /** 本帧行为选中的槽（无行为选中 = -1；测试/调试观测用） */
  slot = -1;
  /** 本帧策略号与湿格（SmartSelectLookup 中间量，观测用） */
  strategy = 0;
  wetTile = false;

  /**
   * 每帧驱动 = SelectedItemState.Update（Player.cs:483-517）中与行为选中相关的全部语义：
   *   1. 换选门 :484（CanChangeSelectedItemImmediately）
   *   2. 还原上帧行为选中 :491-494（无 buffered 且 HasActiveOverride → selected = overridden）
   *      + :497 清 overridden（buffered 我们没有——数字键直写 selected，效果等价见 Game 注释）
   *   3. :499-501 selected≥10 且空手 → 回退 hotbar
   *   4. :503-505 PickItemSelectionOverride（Player.cs:17259-17280）
   *      → :17266 SmartSelectLookup → OverrideSelection（:424-434）
   *   5. :511-513 selected 变化 → OnSelectionChanged（Player.cs:519-533）
   */
  update(env: SmartSelectEnv, host: SmartSelectHost): void {
    this.slot = -1;
    if (!host.canChangeImmediately) return;                    // :484
    const prev = host.selected;
    if (this.overridden >= 0) host.selected = this.overridden; // :491-494
    this.overridden = -1;                                      // :497
    if (host.selected >= 10 && host.isSlotEmpty(host.selected)) host.selected = host.hotbar; // :499-501
    // PickItemSelectionOverride（Player.cs:17259-17265）：Main.mouseItem 非空 → 选中槽 58。
    // 本作鼠标携带物仅存在于背包 UI 拖拽中，而 UI 打开时 controlTorch 已被屏蔽（Input.down
    // 的 uiBlocking 门 = TriggersSet.cs:783 键盘 UI 模式让位的等价），故此处无可让位分支。
    const slot = this.lookup(env);                             // :17266
    this.slot = slot;
    if (this.lookupActive(env)) {                              // SmartSelectLookup 返回 true
      this.overrideSelection(slot, host);                      // :514-516
    }
    if (host.selected !== prev) host.onSelectionChanged();     // :511-513
  }

  /** 行为选中是否激活（SmartSelectLookup 返回值 :17308 = controlTorch） */
  private lookupActive(env: SmartSelectEnv): boolean {
    return env.controlTorch;
  }

  /**
   * SmartSelectLookup 1:1（Player.cs:17283-17309）。返回行为选中槽。
   */
  lookup(env: SmartSelectEnv): number {
    if (!env.controlTorch) {                                   // :17285-17289
      this.lastStrategy = -1;
      return -1;
    }
    const { tX, tY } = this.getTargetTile(env);                // :17291
    const got = this.getToolStrategy(tX, tY, env);             // :17292
    this.wetTile = got.wetTile;
    let strategy = got.toolStrategy;
    // :17293-17296 手柄粘滞：UsingGamepad 且上帧有策略 → 沿用。
    // 本作 usingGamepad 恒 false（键盘/鼠标输入），分支保留供对照。
    if (env.usingGamepad && this.lastStrategy !== -1) strategy = this.lastStrategy;
    // :17297-17305 超 200px 修正：策略 0/4（放火把/水下光源）超出放置距离 → 投掷光源策略 5
    if (strategy === STRATEGY.TORCH || strategy === STRATEGY.WET_LIGHT) {
      const num = Math.abs(env.mouseX - (env.player.x + env.player.w / 2));
      const num2 = Math.abs(env.mouseY - (env.player.y + env.player.h / 2)) * 1.3;
      if (Math.sqrt(num * num + num2 * num2) > 200) strategy = STRATEGY.FAR_LIGHT;
    }
    this.lastStrategy = strategy;                              // :17306
    this.strategy = strategy;
    return this.pickToolForStrategy(tX, tY, strategy, got.wetTile, env); // :17307
  }

  /**
   * SmartSelectLookup_GetTargetTile 1:1（SmartSelectGamepadPointer.cs:23-38）。
   * 手柄指针分支（ShouldBeUsed :8-16）本作不达（usingGamepad 恒 false）。
   */
  private getTargetTile(env: SmartSelectEnv): { tX: number; tY: number } {
    const tX = Math.floor(env.mouseX / 16);                     // :25
    let tY = Math.floor(env.mouseY / 16);                       // :26
    if (env.player.gravDir === -1) {                            // :27-30（反重力未实装，恒不达）
      // 原式 tY = (screenPosition.Y + screenHeight − mouseY) / 16（mouseY 为屏幕 px）
      const screenMouseY = env.mouseY - env.screenTopY;
      tY = Math.floor((env.screenTopY + env.screenHeight - screenMouseY) / 16);
    }
    return { tX, tY };
  }

  /**
   * SmartSelect_GetAvailableToolRanges 1:1（Player.cs:17530-17562）。
   * 每类工具取背包 0-49 中第一件的 tileBoost；没有该类工具 = -10（负 reach → 永不可达，
   * 即"没带镐就不会出镐策略"的门）。原版全物品中 tileBoost≠0 的仅 195/196/-1、509/510/+20、
   * 1305/+1、3505-3510/-1、5329/5330/+3（Item.cs:3787/:7425/:16116/:31370-31411/:42229），
   * 均不属于六类 → 本作槽画像 tileBoost 恒 0，行为与原版一致。
   */
  private getAvailableToolRanges(env: SmartSelectEnv): {
    pickRange: number; axeRange: number; hammerRange: number;
    cannonRange: number; extractItemRange: number; paintScraperRange: number;
  } {
    let pickRange = -10, axeRange = -10, hammerRange = -10;    // :17537-17542
    let cannonRange = -10, extractItemRange = -10, paintScraperRange = -10;
    for (let i = 0; i < 50; i++) {                             // :17543
      const s = env.slots[i] ?? EMPTY_SLOT;
      if (s.pick > 0 && pickRange === -10) pickRange = s.tileBoost;        // :17545-17547
      if (s.axe > 0 && axeRange === -10) axeRange = s.tileBoost;           // :17548-17550
      if (s.hammer > 0 && hammerRange === -10) hammerRange = s.tileBoost;  // :17551-17553
      if (TORCH_ITEMS.has(s.vid) && cannonRange === -10) cannonRange = s.tileBoost;            // :17554-17556
      if (PAINT_SCRAPER_ITEMS.has(s.vid) && paintScraperRange === -10) paintScraperRange = s.tileBoost; // :17557-17559
      if (extractinatorModeOf(s.vid) !== -1 && extractItemRange === -10) extractItemRange = s.tileBoost;  // :17560-17562
    }
    return { pickRange, axeRange, hammerRange, cannonRange, extractItemRange, paintScraperRange };
  }

  /**
   * SmartSelect_GetToolStrategy 1:1（Player.cs:17472-17528）。
   * 原版整段 try/catch 吞越界（:17478/:17526）；本作越界格按空 Tile 处理（TileStore OOB = 0），
   * 行为等价且无需异常控制流。
   */
  private getToolStrategy(tX: number, tY: number, env: SmartSelectEnv): { toolStrategy: number; wetTile: boolean } {
    let toolStrategy = 0;                                      // :17475
    let flag = false;                                          // :17476
    const st = env.st;
    const inB = st.inBounds(tX, tY);
    // :17480 wetTile：目标格有液体（Tile.liquid > 0；本作 liquid 通道 0-255 同义）
    const wetTile = inB ? st.liquid[st.idx(tX, tY)] > 0 : false;
    const tileType = inB ? st.get(tX, tY) : 0;
    if (tileType !== 0) {                                      // :17481 Main.tile.active()
      // 注意：active() = HasTile（含已致动格），不是 nactive()——TileStore.isActive 不可用
      const type = sheetOf(tileType);
      const r = this.getAvailableToolRanges(env);              // :17479
      if ((type === 219 || type === 642) && env.inRange(tX, tY, r.extractItemRange)) {
        toolStrategy = STRATEGY.EXTRACT;                       // :17486-17489
        flag = true;
      } else if (type === 209 && Math.floor(cannonFrameX(st, tX, tY) / 72) < 3
        && env.inRange(tX, tY, r.cannonRange)) {
        toolStrategy = STRATEGY.CANNON;                        // :17490-17492（frameX/72 整除 = 大炮样式 <3）
        flag = true;
      } else if (TILE_HAMMER_SHEETS.has(type) && env.inRange(tX, tY, r.hammerRange)) {
        toolStrategy = STRATEGY.HAMMER;                        // :17493-17495
        flag = true;
      } else if (TILE_AXE_SHEETS.has(type) && env.inRange(tX, tY, r.axeRange)) {
        toolStrategy = STRATEGY.AXE;                           // :17496-17498
        flag = true;
      } else if (type === 184 && env.inRange(tX, tY, r.paintScraperRange)) {
        toolStrategy = STRATEGY.PAINT_SCRAPER;                 // :17499-17501（长苔藓 → 刮漆）
        flag = true;
      } else if (env.inRange(tX, tY, r.pickRange)) {
        toolStrategy = STRATEGY.PICK;                          // :17502-17504
        flag = true;
      }
    } else if (wetTile && env.player.wet) {
      toolStrategy = STRATEGY.WET_LIGHT;                       // :17506-17508（湿格且自身湿 → 水下光源）
      flag = true;
    }
    if (!flag && env.player.wet) toolStrategy = STRATEGY.WET_LIGHT; // :17524-17527（兜底：湿身即水下光源）
    return { toolStrategy, wetTile };
  }

  /**
   * SmartSelect_PickToolForStrategy 1:1（Player.cs:17321-17470）。
   * 在 inventory 0-49 找策略对应工具；无匹配返回 selectedItem（即"不切"）。
   */
  private pickToolForStrategy(
    tX: number, tY: number, toolStrategy: number, wetTile: boolean, env: SmartSelectEnv,
  ): number {
    let result = env.selectedItem;                             // :17323
    const selectedVid = env.slots[env.selectedItem]?.vid ?? 0; // inventory[selectedItem].type
    slotLoop: for (let i = 0; i < 50; i++) {                   // :17324
      const s = env.slots[i] ?? EMPTY_SLOT;
      const type = s.vid;                                      // :17326 inventory[i].type
      switch (toolStrategy) {
        case STRATEGY.TORCH: {                                 // :17339-17349
          if (TORCH_ITEMS.has(type)) { result = i; break; }    // 火把命中即定（后扫不换）
          if (GLOWSTICK_ITEMS.has(type)) result = i;           // 荧光棒先记候选
          continue;                                            // 继续找火把（火把优先级更高）
        }
        case STRATEGY.HAMMER: {                                // :17351-17355
          if (s.hammer <= 0) continue;
          result = i;
          break;
        }
        case STRATEGY.AXE: {                                   // :17357-17361
          if (s.axe <= 0) continue;
          result = i;
          break;
        }
        case STRATEGY.PICK: {                                  // :17363-17367
          if (s.pick <= 0) continue;
          result = i;
          break;
        }
        case STRATEGY.WET_LIGHT: {                             // :17369-17395
          if (!GLOWSTICK_ITEMS.has(type) && type !== FLARE_GUN
            && TORCH_ITEMS.has(type) && !WATER_TORCH_ITEMS.has(type)) {
            // 普通火把：手持已是火把则不动，否则记候选继续扫（给后面的荧光棒/水火把留机会）
            if (!TORCH_ITEMS.has(selectedVid)) result = i;
            continue;
          }
          if (GLOWSTICK_ITEMS.has(type) && wetTile) {
            result = i;
          } else if (type === FLARE_GUN && wetTile) {
            if (!this.hasAmmoFor(env, i)) continue;            // :17373-17384 弹药门（扫 57→0）
            result = i;
          } else {
            if (!WATER_TORCH_ITEMS.has(type)) continue;
            result = i;
          }
          break;
        }
        case STRATEGY.FAR_LIGHT: {                             // :17397-17423
          if (TORCH_ITEMS.has(type)) {
            // 手持已是火把则不动（放不到也保持火把），否则记候选继续扫
            if (!TORCH_ITEMS.has(selectedVid)) result = i;
            continue;
          }
          if (type === FLARE_GUN) {
            if (!this.hasAmmoFor(env, i)) continue;            // :17408-17420 弹药门
            result = i;
          } else {
            if (!GLOWSTICK_ITEMS.has(type)) continue;
            result = i;
          }
          break;
        }
        case STRATEGY.CANNON: {                                // :17425-17429
          if (!TORCH_ITEMS.has(type)) continue;                // 大炮点火 = 火把（PlaceThing_CannonBall :41139）
          result = i;
          break;
        }
        case STRATEGY.EXTRACT: {                               // :17431-17446
          // TryGettingItemTraderFromBlock（Player.cs:41043-41052）：仅 tile 642 叶绿提取机
          if (isChlorophyteTraderBlock(env, tX, tY) && chlorophyteTradeAccepts(s)) {
            result = i;
            break;
          }
          if (extractinatorModeOf(type) < 0) continue;         // :17441-17444
          result = i;
          break;
        }
        case STRATEGY.PAINT_SCRAPER: {                         // :17448-17452
          if (!PAINT_SCRAPER_ITEMS.has(type)) continue;
          result = i;
          break;
        }
        default:
          continue;                                            // :17454-17455
      }
      break slotLoop;                                          // :17457（C# switch 后的 break = 跳出 for）
    }
    return result;                                             // :17469
  }

  /**
   * 信号枪弹药门 1:1（Player.cs:17374-17384 / :17410-17420）：
   * inventory[57..0] 中任一物品 ammo == 该槽 useAmmo 且 stack>0。
   * 荧光弹族的 useAmmo/ammo 提取缺口按原版源码补正（见 FLARE_GUN_USE_AMMO 注释）。
   */
  private hasAmmoFor(env: SmartSelectEnv, slotIndex: number): boolean {
    const useAmmo = flareUseAmmoOf(env.slots[slotIndex] ?? EMPTY_SLOT);
    for (let n = 57; n >= 0; n--) {
      const s = env.slots[n] ?? EMPTY_SLOT;
      if (flareAmmoOf(s) === useAmmo && s.stack > 0) return true;
    }
    return false;
  }

  /** OverrideSelection 1:1（Player.cs:424-434） */
  private overrideSelection(item: number, host: SmartSelectHost): void {
    if (!host.canChangeImmediately || item === host.selected) return;   // :425-426
    if (this.overridden === -1) this.overridden = host.selected;        // :427-429 记住原槽
    if (item === this.overridden) this.overridden = -1;                 // :430-432 切回原槽 = 覆盖结束
    host.selected = item;                                               // :433
  }
}

// ===================== 槽语义辅助（原版数据补正） =====================

/** Item.useAmmo（信号枪族按 Item.cs:12108 补正） */
export function flareUseAmmoOf(s: SmartSelectSlot): number {
  return FLARE_GUN_USE_AMMO[s.vid] ?? s.useAmmo;
}

/** Item.ammo（荧光弹族按 Item.cs:12121/:19106 补正） */
export function flareAmmoOf(s: SmartSelectSlot): number {
  return FLARE_AMMO_ITEMS.has(s.vid) ? AMMO_FLARE : s.ammo;
}

/** ItemID.Sets.ExtractinatorMode[type]（ItemID.cs:1104；EXTRACTINATOR_MODE = 全表直录） */
function extractinatorModeOf(vid: number): number {
  return EXTRACTINATOR_MODE[vid] ?? -1;
}

/** TryGettingItemTraderFromBlock（Player.cs:41043-41052）：tile 642 → ChlorophyteExtractinator */
function isChlorophyteTraderBlock(env: SmartSelectEnv, tX: number, tY: number): boolean {
  const st = env.st;
  if (!st.inBounds(tX, tY)) return false;
  return sheetOf(st.get(tX, tY)) === 642;
}

/**
 * ItemTrader.TryGetTradeOption 1:1（ItemTrader.cs:66-80）：
 * 逐条 TradeOption 比较 TakingItemType == item.type && item.stack >= TakingItemStack。
 * ChlorophyteExtractinator 的 33 条选项全部 TakingItemStack=1（ItemTrader.cs:82-108，
 * Interchangable/CyclicLoop/FromAny 都经 AddOption_OneWay(taking, 1, giving, 1)），
 * 因此等价于"CHLOROPHYTE_TRADES 命中且 stack≥1"。
 */
function chlorophyteTradeAccepts(s: SmartSelectSlot): boolean {
  return s.stack >= 1 && CHLOROPHYTE_TRADES[s.vid] !== undefined;
}

/** Tile.frameX（px；TileStore.frameX 通道与原版同单位——WldImport 直拷 wld 帧） */
function cannonFrameX(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? st.frameX[st.idx(x, y)] : 0;
}
