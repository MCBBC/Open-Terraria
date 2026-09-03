// 智能选取（Smart Select）回归：Player.cs:17283-17562 + SelectedItemState(:383-517) 1:1。
// 覆盖：Shift 指向镐族/斧族/锤族/提取机（普通+叶绿兑换）/大炮 自动换持、
// 超 200px 策略 5 修正、湿格策略 4 与湿身兜底、信号枪弹药门、粘滞还原、
// 无匹配不切、换选门（使用中不切）、目标格换算、wetCollision。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_BY_KEY } from '../src/data/tiles';
import {
  SmartSelect, EMPTY_SLOT, wetCollision, flareAmmoOf, flareUseAmmoOf,
  STRATEGY, type SmartSelectEnv, type SmartSelectSlot, type SmartSelectHost,
} from '../src/player/SmartSelect';

// ---------- 世界/玩家基准 ----------
const W = 120, H = 300;   // H≥py/16+41+40：wetCollision 原版扫描界钳 maxTilesY−40（Collision.cs:1591-1594）
                          // 需要水体行 < h−40 才可扫到——曾用 80 使 row41 落在钳外（与旧浮点宽松版偶合通过）
const PTX = 60, PTY = 40;                 // 玩家所在格
const PX = PTX * 16, PY = PTY * 16;       // position（px）
const PW = 20, PH = 42;                   // width / height
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const EXTRACT = TILE_BY_KEY['v_219_extractinator']!;
const CHLORO = TILE_BY_KEY['v_642_chlorophyte_extractinator']!;
const CANNON = TILE_BY_KEY['v_209_cannon']!;
const MOSS = TILE_BY_KEY['v_184_moss_plants']!;

/** IsInTileInteractionRange 1:1（Player.cs:31548 + TileReachCheckSettings.cs:53-62，
 *  Simple 档 tileRangeX=5/tileRangeY=3 上限 20；TB=-10 时区域反转恒 false） */
function inRange(st: TileStore, tx: number, ty: number, tb: number): boolean {
  void st;
  const x = Math.min(20, 5) + tb, y = Math.min(20, 3) + tb;
  const LX = Math.floor(PX / 16) - x;
  const HX = Math.ceil((PX + PW) / 16) - 1 + x;
  const LY = Math.floor(PY / 16) - y;
  const HY = Math.ceil((PY + PH) / 16) - 1 + y;
  return tx >= LX && tx <= HX && ty >= LY && ty <= HY;
}

const slot = (vid: number, over: Partial<SmartSelectSlot> = {}): SmartSelectSlot => ({
  vid, stack: 1, pick: 0, axe: 0, hammer: 0, ammo: 0, useAmmo: 0, tileBoost: 0, ...over,
});
const pick = (vid = 1) => slot(vid, { pick: 40 });
const axe = (vid = 10) => slot(vid, { axe: 9 });
const hammer = (vid = 2) => slot(vid, { hammer: 35 });
const torch = (vid = 8) => slot(vid);
const glowstick = (vid = 282) => slot(vid);

/** 58 槽（0-49 背包 + 50-53 钱币 + 54-57 弹药），默认全空 */
function mkSlots(...placed: Array<[number, SmartSelectSlot]>): SmartSelectSlot[] {
  const s: SmartSelectSlot[] = new Array(58).fill(null).map(() => ({ ...EMPTY_SLOT }));
  for (const [i, v] of placed) s[i] = v;
  return s;
}

function mkEnv(
  st: TileStore,
  over: Partial<SmartSelectEnv> & { slots?: SmartSelectSlot[]; selectedItem?: number },
): SmartSelectEnv {
  return {
    controlTorch: true,
    usingGamepad: false,
    st,
    mouseX: 0, mouseY: 0,
    screenTopY: 0, screenHeight: 480,
    player: { x: PX, y: PY, w: PW, h: PH, wet: false, gravDir: 1 },
    slots: over.slots ?? mkSlots(),
    selectedItem: over.selectedItem ?? 0,
    inRange: (tx, ty, tb) => inRange(st, tx, ty, tb),
    ...over,
  } as SmartSelectEnv;
}

/** 宿主（SelectedItemState 窄视图）：selected 落在本地对象上，便于断言 */
function mkHost(selected = 0, slots: SmartSelectSlot[] = mkSlots(), over: Partial<SmartSelectHost> = {}): SmartSelectHost & { changed: number } {
  const host = {
    selected,
    hotbar: Math.min(selected, 9),
    canChangeImmediately: true,
    isSlotEmpty: (i: number) => (slots[i]?.stack ?? 0) <= 0,
    changed: 0,
    onSelectionChanged: () => { host.changed++; },
    ...over,
  } as SmartSelectHost & { changed: number };
  return host;
}

const mouseAt = (tx: number, ty: number) => ({ mouseX: tx * 16 + 8, mouseY: ty * 16 + 8 });
const mkSt = () => new TileStore(W, H);

describe('SmartSelect_GetToolStrategy（Player.cs:17472-17528 策略优先级）', () => {
  it('指向镐族方块 → 策略 3 → 自动换镐', () => {
    const st = mkSt();
    st.setTile(62, 41, T.DIRT);
    const slots = mkSlots([0, torch()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    expect(ss.lookup(env)).toBe(3);            // 换到槽 3 的镐
    expect(ss.strategy).toBe(STRATEGY.PICK);
  });

  it('指向树（sheet 5，Main.tileAxe Main.cs:7157）→ 策略 2 → 自动换斧', () => {
    const st = mkSt();
    st.setTile(63, 40, T.TREE);
    const slots = mkSlots([0, torch()], [2, axe()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(63, 40) });
    expect(ss.lookup(env)).toBe(2);
    expect(ss.strategy).toBe(STRATEGY.AXE);
  });

  it('指向祭坛（sheet 26，Main.tileHammer Main.cs:7153）→ 策略 1 → 自动换锤', () => {
    const st = mkSt();
    st.setTile(64, 40, ALTAR);
    const slots = mkSlots([0, torch()], [1, hammer()], [2, axe()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(64, 40) });
    expect(ss.lookup(env)).toBe(1);
    expect(ss.strategy).toBe(STRATEGY.HAMMER);
  });

  it('指向提取机 219 → 策略 7 → 换可投入物（泥沙 424）', () => {
    const st = mkSt();
    st.setTile(66, 40, EXTRACT);
    const slots = mkSlots([0, torch()], [5, slot(424)]);   // 泥沙：ExtractinatorMode=0（ItemID.cs:1104）
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(66, 40) });
    expect(ss.lookup(env)).toBe(5);
    expect(ss.strategy).toBe(STRATEGY.EXTRACT);
  });

  it('指向叶绿提取机 642 → 策略 7 经 ItemTrader 兑换表命中（铜矿 12→锡矿 699）', () => {
    const st = mkSt();
    st.setTile(66, 40, CHLORO);
    // 注意：策略 7 的可达门 extractItemRange 只扫 ExtractinatorMode 物品
    //（Player.cs:17560-17562），故需另带一件可提取物（泥沙 424 在槽 8）；
    // 兑换命中物铜矿 12 在槽 5——case 7 先试 trader（:17437-17441）命中即定
    const slots = mkSlots([0, torch()], [5, slot(12)], [8, slot(424)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(66, 40) });
    expect(ss.lookup(env)).toBe(5);
    expect(ss.strategy).toBe(STRATEGY.EXTRACT);
  });

  it('叶绿提取机：非兑换表物品被跳过，落后面的可提取物（扫描序 :17324）', () => {
    const st = mkSt();
    st.setTile(66, 40, CHLORO);
    const slots = mkSlots([0, torch()], [5, slot(9999)], [8, slot(424)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(66, 40) });
    expect(ss.lookup(env)).toBe(8);             // 槽 5 不过 trader 也非可提取物 → 落槽 8 泥沙
    expect(ss.strategy).toBe(STRATEGY.EXTRACT);
  });

  it('指向大炮 209（frameX/72<3）→ 策略 6 → 换火把点火', () => {
    const st = mkSt();
    st.setTile(65, 41, CANNON, 0, 0);           // frameX=0 → 样式 0
    const slots = mkSlots([0, pick()], [4, torch()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(65, 41) });
    expect(ss.lookup(env)).toBe(4);
    expect(ss.strategy).toBe(STRATEGY.CANNON);
  });

  it('大炮样式 ≥3（frameX≥216）不触发策略 6（Player.cs:17490 frameX/72<3 门）', () => {
    const st = mkSt();
    st.setTile(65, 41, CANNON, 216, 0);         // 216/72=3 → 不可点火样式
    const slots = mkSlots([0, pick()], [4, torch()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(65, 41) });
    expect(ss.lookup(env)).toBe(0);             // 无镐? 槽 0 是镐 → 策略 3 选槽 0 自身
    expect(ss.strategy).toBe(STRATEGY.PICK);    // 落镐策略（大炮格可挖）
  });

  it('指向长苔藓 184 → 策略 8 → 换刮漆器（1100）', () => {
    const st = mkSt();
    st.setTile(62, 42, MOSS);
    const slots = mkSlots([0, torch()], [6, slot(1100)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 42) });
    expect(ss.lookup(env)).toBe(6);
    expect(ss.strategy).toBe(STRATEGY.PAINT_SCRAPER);
  });

  it('策略优先级：提取机 7 > 大炮 6 > 锤 1 > 斧 2 > 刮漆 8 > 镐 3（祭坛格不落斧/镐）', () => {
    const st = mkSt();
    st.setTile(64, 40, ALTAR);
    const slots = mkSlots([0, torch()], [1, pick()], [2, axe()], [3, hammer()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(64, 40) });
    expect(ss.lookup(env)).toBe(3);             // 策略 1 只认 hammer>0 → 槽 3
    expect(ss.strategy).toBe(STRATEGY.HAMMER);
  });

  // ★2026-09-03 回归（快捷挖掘误切根因）：active() 门（Player.cs:17748）= sTileHeader
  // HasTile 位（Tile.cs:591），不是 type≠0——幽灵格（flags=0,type≠0，生成期
  // active(false) 残型，TileCleanupPass/ShimmerPass 同款）必须按空格处理。
  // 曾以 type≠0 代读：地下隐形残型格在射程内误出镐策略 3（"光标旁没方块却切镐"）。
  describe('幽灵格/致动格的 active() 位门（Player.cs:17481 + Tile.cs:591）', () => {
    it('光标下幽灵格（type 残留 flags=0）→ 不出镐策略，按空格走火把', () => {
      const st = mkSt();
      st.setTile(62, 41, T.DIRT);
      st.flags[st.idx(62, 41)] = 0;             // 原版 active(false) 残型
      const slots = mkSlots([0, torch()], [3, pick()]);
      const ss = new SmartSelect();
      const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
      expect(ss.lookup(env)).toBe(0);           // 切火把，不切镐
      expect(ss.strategy).toBe(STRATEGY.TORCH);
    });

    it('光标下幽灵格且无火把 → 无匹配保持原槽（不误切镐）', () => {
      const st = mkSt();
      st.setTile(62, 41, T.DIRT);
      st.flags[st.idx(62, 41)] = 0;
      const slots = mkSlots([0, slot(1)], [3, pick()]);   // 槽 0 空手持（vid 随意非火把）
      const ss = new SmartSelect();
      const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
      expect(ss.lookup(env)).toBe(0);           // result=selectedItem 原槽
      expect(ss.strategy).toBe(STRATEGY.TORCH);
    });

    it('已致动格（active 位在 + WIRE_ACTUATED）仍参与策略（active() 含致动格）', () => {
      const st = mkSt();
      st.setTile(62, 41, T.DIRT);
      st.wire[st.idx(62, 41)] |= TileStore.WIRE_ACTUATED;
      const slots = mkSlots([0, torch()], [3, pick()]);
      const ss = new SmartSelect();
      const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
      expect(ss.lookup(env)).toBe(3);
      expect(ss.strategy).toBe(STRATEGY.PICK);
    });
  });
});

describe('SmartSelectLookup 超 200px 修正（Player.cs:17297-17305）', () => {
  it('空格远于 200px → 策略 0 修正为 5 → 荧光棒优先于火把', () => {
    const st = mkSt();
    const slots = mkSlots([0, torch()], [1, glowstick()]);
    const ss = new SmartSelect();
    // 玩家中心 x = 960+10=970；格 (78,40) 中心 x=1256 → dx=286 > 200
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(78, 40) });
    expect(ss.lookup(env)).toBe(1);             // 荧光棒（火把候选被 continue 留给荧光棒 :17397-17401）
    expect(ss.strategy).toBe(STRATEGY.FAR_LIGHT);
  });

  it('空格近于 200px → 策略 0 → 火把命中即定（后扫不换 :17340-17344）', () => {
    const st = mkSt();
    const slots = mkSlots([0, glowstick()], [1, torch()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(63, 41) });
    expect(ss.lookup(env)).toBe(1);
    expect(ss.strategy).toBe(STRATEGY.TORCH);
  });

  it('策略 3 不受 200px 修正影响（仅 0/4 修正，:17298）', () => {
    const st = mkSt();
    st.setTile(64, 41, T.STONE);
    const slots = mkSlots([0, torch()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(64, 41) });
    expect(ss.lookup(env)).toBe(3);
    expect(ss.strategy).toBe(STRATEGY.PICK);
  });
});

describe('SmartSelect_PickToolForStrategy case 4/5 细节（Player.cs:17369-17423）', () => {
  it('湿格 + 自身湿 → 策略 4：case4 无整体优先级，按背包扫描序取首个命中（:17324/:17369-17395）', () => {
    const st = mkSt();
    st.liquid[st.idx(62, 41)] = 128;            // 目标格有液体（Tile.liquid>0 :17480）
    // 手持槽 0 普通火把（首分支 continue）→ 槽 1 荧光棒命中即定 → 槽 2 水火把扫不到
    const slots = mkSlots([0, torch()], [1, glowstick()], [2, slot(523)]); // 523 水火把
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    env.player.wet = true;
    expect(ss.lookup(env)).toBe(1);             // 荧光棒在前 → 先命中（:17377-17379）
    expect(ss.strategy).toBe(STRATEGY.WET_LIGHT);
    // 换序：水火把在前 → 取水火把（else 分支 :17390-17394）
    const slots2 = mkSlots([0, torch()], [1, slot(523)], [2, glowstick()]);
    const ss2 = new SmartSelect();
    const env2 = mkEnv(st, { slots: slots2, selectedItem: 0, ...mouseAt(62, 41) });
    env2.player.wet = true;
    expect(ss2.lookup(env2)).toBe(1);
    expect(ss2.strategy).toBe(STRATEGY.WET_LIGHT);
  });

  it('湿格但自身不湿 → 不出策略 4（:17506 要求 wetTile && wet）', () => {
    const st = mkSt();
    st.liquid[st.idx(62, 41)] = 128;
    const slots = mkSlots([0, torch()], [1, glowstick()], [2, slot(523)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    env.player.wet = false;
    expect(ss.lookup(env)).toBe(0);             // 湿格+干身：火把候选被 continue 后无匹配 → 保持
    expect(ss.strategy).not.toBe(STRATEGY.WET_LIGHT);
  });

  it('自身湿兜底（:17524-17527）：目标无策略时也出策略 4', () => {
    const st = mkSt();
    const slots = mkSlots([0, glowstick(286)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(63, 41) });
    env.player.wet = true;
    expect(ss.lookup(env)).toBe(0);
    expect(ss.strategy).toBe(STRATEGY.WET_LIGHT);
  });

  it('信号枪 930 无荧光弹 → 弹药门挡下（:17373-17384）；弹药槽 54 有 931 → 放行', () => {
    const st = mkSt();
    st.liquid[st.idx(62, 41)] = 128;
    // 手持普通火把（槽 0）→ case4 首分支"手持已是火把"不记候选并 continue（:17369-17376）；
    // 信号枪在槽 2；荧光棒缺失
    expect(flareUseAmmoOf(slot(930))).toBe(931);          // Item.cs:12108 补正
    expect(flareAmmoOf(slot(931))).toBe(931);             // Item.cs:12121 补正
    const noAmmo = mkSlots([0, torch()], [2, slot(930)]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots: noAmmo, selectedItem: 0, ...mouseAt(62, 41) });
    env.player.wet = true;
    expect(ss.lookup(env)).toBe(0);                       // 无弹药 → 不切，保持火把

    const withAmmo = mkSlots([0, torch()], [2, slot(930)], [54, slot(931)]);
    const ss2 = new SmartSelect();
    const env2 = mkEnv(st, { slots: withAmmo, selectedItem: 0, ...mouseAt(62, 41) });
    env2.player.wet = true;
    expect(ss2.lookup(env2)).toBe(2);                     // 弹药扫 57→0 命中槽 54 → 换信号枪
  });
});

describe('SelectedItemState 覆盖/还原（Player.cs:383-517 粘滞语义）', () => {
  it('Shift 按住换工具、松开还原原槽（overridden :427-429 / 还原 :491-494）', () => {
    const st = mkSt();
    st.setTile(62, 41, T.DIRT);
    const slots = mkSlots([0, torch()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    const host = mkHost(0, slots);
    ss.update(env, host);
    expect(host.selected).toBe(3);              // 换镐
    expect(host.changed).toBe(1);
    // 下一帧仍按住：先还原 0 再覆盖回 3（selected 不变 → 不触发 onChanged）
    ss.update(env, host);
    expect(host.selected).toBe(3);
    expect(host.changed).toBe(1);
    // 松开 Shift（controlTorch=false → 无覆盖 → 还原原槽）
    const envOff = { ...env, controlTorch: false };
    ss.update(envOff, host);
    expect(host.selected).toBe(0);
    expect(host.changed).toBe(2);
    expect(ss.lastStrategy).toBe(-1);           // :17286 松键清粘滞
  });

  it('换到背包槽(≥10)后物品耗尽 → 回退 hotbar（:499-501）', () => {
    const st = mkSt();
    st.setTile(62, 41, T.DIRT);
    const slots = mkSlots([0, torch()], [12, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    const host = mkHost(0, slots, { hotbar: 0 });
    ss.update(env, host);
    expect(host.selected).toBe(12);             // 可以选背包槽（0-49，原版同）
    // 镐被耗尽（stack 0）→ 覆盖仍指向 12（覆盖发生在回退之后 :503-505）
    slots[12].stack = 0;
    ss.update(env, host);
    expect(host.selected).toBe(12);
    const envOff = { ...env, controlTorch: false };
    ss.update(envOff, host);
    expect(host.selected).toBe(0);              // 还原 12 → 空手 → hotbar 0
  });

  it('使用中（CanChangeSelectedItemImmediately=false）不换不还原（:484 门）', () => {
    const st = mkSt();
    st.setTile(62, 41, T.DIRT);
    const slots = mkSlots([0, torch()], [3, pick()]);
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    const host = mkHost(0, slots, { canChangeImmediately: false });
    ss.update(env, host);
    expect(host.selected).toBe(0);
    expect(host.changed).toBe(0);
  });

  it('无匹配不切：背包没有任何可换物 → 保持原槽（:17469 返回 selectedItem）', () => {
    const st = mkSt();
    st.setTile(62, 41, T.DIRT);
    const slots = mkSlots();                    // 全空（连火把都没有）
    const ss = new SmartSelect();
    const env = mkEnv(st, { slots, selectedItem: 0, ...mouseAt(62, 41) });
    const host = mkHost(0, slots);
    ss.update(env, host);
    expect(host.selected).toBe(0);
    expect(host.changed).toBe(0);
  });

  it('目标格越界按空 Tile 处理（原版 try/catch 吞越界 :17478/:17526）', () => {
    const st = mkSt();
    const slots = mkSlots([0, torch()], [1, glowstick()]);
    const ss = new SmartSelect();
    // 格 (-3,0)：越界 = 空 Tile → 策略 0；但鼠标离玩家中心 1010px > 200 → 修正策略 5
    //（:17297-17305）→ case 5 手持已是火把则留候选给荧光棒（:17397-17401）→ 槽 1
    const env = mkEnv(st, { slots, selectedItem: 0, mouseX: -40, mouseY: 8 });
    expect(ss.lookup(env)).toBe(1);
    expect(ss.strategy).toBe(STRATEGY.FAR_LIGHT);
  });
});

describe('SmartSelectLookup_GetTargetTile（SmartSelectGamepadPointer.cs:23-38）', () => {
  it('鼠标世界坐标 /16 取格', () => {
    const st = mkSt();
    const slots = mkSlots([0, torch()], [3, pick()]);
    const ss = new SmartSelect();
    const mouse = mouseAt(62, 41);
    let env = mkEnv(st, { slots, selectedItem: 0, ...mouse });
    ss.lookup(env);
    expect(ss.strategy).toBe(STRATEGY.TORCH);   // (62,41) 是空气
    st.setTile(62, 41, T.DIRT);
    env = mkEnv(st, { slots, selectedItem: 0, ...mouse });
    ss.lookup(env);
    expect(ss.strategy).toBe(STRATEGY.PICK);    // 同一鼠标位置现在指着泥土
  });
});

describe('wetCollision（Collision.cs:1575-1656）', () => {
  it('命中盒中心盒与液面求交：格内液量即可浸湿下半身', () => {
    const st = mkSt();
    // 玩家 y 640..682 → 原版中心盒 y 651..672（Height/2=21 整除,num2/2=10——
    // ★2026-08-31 整除 parity 修正:曾浮点算成 650.5..671.5 整体上移半像素）
    st.liquid[st.idx(60, 41)] = 200;            // 格 (60,41) y 656..672，液面下移 (256-200)/32*2=3.5
    expect(wetCollision(st, PX, PY, PW, PH)).toBe(true);
    st.liquid[st.idx(60, 41)] = 0;
    expect(wetCollision(st, PX, PY, PW, PH)).toBe(false);
  });

  it('液量极低：膜水顶恰在原版盒底上方 0.5px 内 → 腿尖沾水仍湿（C# 截断 effH=16−⌊15.5⌋=1）', () => {
    // 旧断言"不湿"钉的是浮点错版盒 [650.5,671.5] 恰触不到膜带的现象——原版盒
    // [651,672] 盒底 672 已越过膜顶 671.5(严格 >)且膜带宽 trunc 后仍有 1px → wet。
    // l=8: surfY=671.5、effH=1 → 带 [671.5,672.5)
    const st = mkSt();
    st.liquid[st.idx(60, 41)] = 8;
    expect(wetCollision(st, PX, PY, PW, PH)).toBe(true);
    // 对照：液量归零必然干
    st.liquid[st.idx(60, 41)] = 0;
    expect(wetCollision(st, PX, PY, PW, PH)).toBe(false);
    // 对照：膜带降到盒底之下（行43 surfY=688.5 > 盒底672）→ 不湿
    st.liquid[st.idx(60, 43)] = 248;
    expect(wetCollision(st, PX, PY, PW, PH)).toBe(false);
    st.liquid[st.idx(60, 43)] = 0;
  });

  it('坡面格+上方液体支（:1631-1654）：斜坡干格上邻有液 ⇒ 整格判湿', () => {
    // 自定小盒隔离三态：body(x,y,22,28) → 中心盒 = [tx*16, tx*16+10) × [ct+1, ct+15)
    // （w=22:num=10/vx 偏移=w/2−num/2=6；h=28:num2=14/vy 偏移=h/2−num2/2=7）。
    // 目标格 = 斜坡干格 (50,50)；其上一行 (50,49) 的液体带约在 [784.06,800)
    // ——盒顶 ct+1=801 恰好够不到 ⇒ 正判只能来自本坡面支，与普通液面支正交。
    const CT = 50 * 16;
    const mkCase = (withSlope: boolean, withWaterAbove: boolean) => {
      const st = mkSt();
      st.setTile(50, 50, T.DIRT);
      if (withSlope) st.setSlope(50, 50, 1);
      if (withWaterAbove) st.liquid[st.idx(50, 49)] = 255;
      return st;
    };
    const X = 50 * 16 - 6, Y = CT - 6;
    expect(wetCollision(mkCase(true, true), X, Y, 22, 28)).toBe(true);

    // 上方无液 ⇒ 干
    expect(wetCollision(mkCase(true, false), X, Y, 22, 28)).toBe(false);

    // 非斜坡格即便上方有液：普通液面支因盒顶差 1px 触不到、坡面支被 slope==0 拦 ⇒ 干
    expect(wetCollision(mkCase(false, true), X, Y, 22, 28)).toBe(false);
  });
});
