// BJ600 2026-10-10 花园侏儒放置即掉落（用户实报：花园侏儒似乎无法放置，每次放置会
// 直接掉落新的花园侏儒，可以获得无数个花园侏儒）
//
// 原版定谳链（Terarria1457 亲读）：
//   ① id 钉死：ItemID.GardenGnome = 4609（ItemID.cs:10764）、TileID.GardenGnome = 567
//      （TileID.cs:1571）；Item.cs:38230 `case 4609: DefaultToPlaceableTile(567, 0)`
//      （consumable=true :48494-48506）。
//   ② tile 形态：TileObjectData.cs:4222-4227 addTile(567)=Style1x2 横排——
//      CoordinateHeights{18,18}+CoordinateWidth 26+Padding 2 ⇒ frameX 步 28、
//      行帧 0/20（CheckGnome :54419 `frameY==0 && frameY2==20` 同域）。
//   ③ 放置链：FlexibleTileWand.GardenGnome（FlexibleTileWand.cs:50
//      CreateSingleTileWand(4609,567,[0,1,2,3,4]).WithoutAmmoConsumption）——
//      原版 ModifyFlexibleWandPlacementInfo（Player.cs:40105-40125）【只覆写】
//      tileType/tileStyle，放置本体仍走 TileObject.CanPlace/Place 全链
//      （PlaceIt :40426-40437）；1×2 写入=TileObject.Place :96-108（行帧 heights
//      +padding 累进 0/20）；TileFrame :87201-87204 case 567 → CheckGnome（:54400）
//      完整性+下方 SolidTileAllowBottomSlope/平台（:54424-54426）。
//   ④ 消耗链：ItemCheck（Player.cs:42921）consumable 消耗拍 :43612-43645——
//      SkipItemConsumption 全仓唯一写入点=提取机交易 :42003，放置物无豁免 ⇒
//      侏儒/珊瑚/贝壳/书等单件魔杖族放置【消耗 1】（PlaceIt_ConsumeFlexibleWandMaterial
//      :40492-40501 是 wand 弹药门（ConsumesAmmoItem=true 才走），非本门）。
//   ⑤ 掉落链：CheckGnome 失格 → destroyObject 窗 KillTile×2 + Item.NewItem 4609
//      （WorldGen.cs:54428-54435）；运行时等价=失撑/破坏经 breakTile object 支
//      multiTileDropKey → place_v_567_garden_gnome（用户行为日志 2026-10-09
//      Starter_World t=1821-1825 物证：每拍 wand 写→kill(cause other)→drop 循环）。
//
// 本仓病灶（Game.tryPlace wand 分支 1×1 裸写 vs 原版②③④）：
//   侏儒 567=1×2 被单格写入（frameX=18*style）→ 下一拍 CheckGnome 底格缺失判坏 →
//   整件杀+掉 place_v_567_garden_gnome → 拾取=无限刷；分支又零消耗=双重复制链。
//   南瓜灯 35（2×2,CheckMB :51649）/派对礼物 457（2×2）/沙堡桶 552（3×2）/
//   火烈鸟 545（2×3）同病（本测试对侏儒钉位,同族修正随刀）。
//
// 落刀：
//   A. Game.tryPlace wand 分支：单件族×多格 sheet（anchorRec 在册）注入 tile+style
//      回落通用链（=原版覆写语义,锚点/清格/写帧/消耗/级联由链承担）;1×1 sheet 与
//      multi 族原路;raw 路 1×1 族补 held 消耗（=原版④）。
//   B. FurnitureStyle.furnitureStyleBase case 567：frameX 步 28（原 default 18 在
//      placeStyle 恒 0 时代两端同值无感,style 注入后即错带）。
//   心情转换普查判据：placed tile 567 原版【无】运行时 style 变换面——5 姿态=
//      放置期 wand cycle 拾取（FlexibleTileWand.cs:50）;NPC 624 石化态=敌怪 AI 域
//      （AI_003_Gnomes_ShouldTurnToStone NPC.cs:56413→:56433）,落 tile 链在本仓
//      Enemy.ts 'gnome' 支（validateAnchors(567) 在轨）——本测试以「style 放置后
//      恒稳」锁 tile 侧无变换面（原版同相）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, multiTileDropKey } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID, vanillaPlaceableTileKeys } from '../src/data/items';
import { anchorSpecOf } from '../src/world/TileAnchorValidator';
import { Inventory } from '../src/items/Inventory';

const GNOME = TILE_BY_KEY['v_567_garden_gnome']!;
const STONE = TILE_BY_KEY['stone']!;
const GNOME_VID = 4609;                                  // ItemID.GardenGnome（ItemID.cs:10764）
const GNOME_KEY = VANILLA_ITEM_KEY_BY_ID[GNOME_VID];     // vi_4609_GardenGnome
const GNOME_IID = ITEM_BY_KEY[GNOME_KEY ?? '']!;
const DROP_KEY = multiTileDropKey(
  TILE_DEFS[GNOME], vanillaPlaceableTileKeys(),
);                                                       // place_v_567_garden_gnome

/** tryPlace 可驱动面最小桩（shell 形制同 tests/bj121-repeated-place-gates.test.ts,
 *  inv 用真 Inventory 使消耗断言走真栈） */
interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: (name: string, v?: number, x?: number, y?: number) => void };
  cb: { onInventoryChanged: () => void };
  entities: Record<string, unknown>;
  spawnParticles: (...a: unknown[]) => void;
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: (...a: unknown[]) => void;
  trackTile: number;
  flexWandCycle: number;
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  checkDecorSquareFrame: (x: number, y: number) => void;
}
function mkShell(stack = 3, cycle = 0): {
  g: GShell; w: World; inv: Inventory; drops: Array<{ key: string; n: number }>;
} {
  const w = new World(40, 40, 7, 'bj600-gnome');
  const inv = new Inventory();
  inv.slots[0] = { id: GNOME_IID, stack };
  const drops: Array<{ key: string; n: number }> = [];
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x, _y, key, n) => { drops.push({ key, n }); return null; };
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.flexWandCycle = cycle;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: 12 * 16 + 8, cy: 11 * 16 + 8, x: 12 * 16 + 2, y: 11 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false, dead: false, isGhostPhase: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv,
  };
  return { g, w, inv, drops };
}

describe('BJ600 数据面：id/锚/帧三表钉死', () => {
  it('item 4609 → tile 567 1×2;掉落键=place_v_567_garden_gnome（行为日志同键）', () => {
    expect(ITEM_DEFS[GNOME_IID].vid).toBe(4609);
    expect(TILE_DEFS[GNOME].vanilla?.sheet).toBe(567);
    expect(TILE_DEFS[GNOME].w).toBe(1);
    expect(TILE_DEFS[GNOME].h).toBe(2);
    expect(DROP_KEY).toBe('place_v_567_garden_gnome');
  });
});

describe('BJ600-① 放置成功锁（1×2 写入+零掉落+消耗 1）', () => {
  it('style0：点击格=底行（Origin oy=1）→ 顶 11/底 12,行帧 0/20,无掉落,stack 3→2', () => {
    const { g, w, inv, drops } = mkShell();
    const st = w.store;
    for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    // 整件两格写入（旧病=单格写入→CheckGnome 判坏→杀+掉）
    expect(st.get(12, 11)).toBe(GNOME);
    expect(st.get(12, 12)).toBe(GNOME);
    expect(st.get(12, 13)).toBe(STONE);
    // 行帧 0/20（CheckGnome :54419 完整性域;PLACE_ROW_FY[567]）
    const ti0 = st.idx(12, 11), ti1 = st.idx(12, 12);
    expect(st.frameY[ti0]).toBe(0);
    expect(st.frameY[ti1]).toBe(20);
    expect(st.frameX[ti0]).toBe(0);
    expect(st.frameX[ti1]).toBe(0);
    // 放置即掉落锁：成功放置【零】掉落（旧病=每拍 drop place_v_567 ×1）
    expect(drops).toEqual([]);
    // 消耗锁（原版④ ItemCheck consumable 消耗拍）:3 → 2
    expect(inv.slots[0]!.stack).toBe(2);
    // 完整性稳态：复跑级联（TileFrame case 567 → CheckGnome）不杀不掉
    g.checkDecorSquareFrame(12, 12);
    expect(st.get(12, 11)).toBe(GNOME);
    expect(st.get(12, 12)).toBe(GNOME);
    expect(drops).toEqual([]);
  });

  it('平台支撑可放（CheckGnome :54424-54426 平台臂=SolidWithTop 锚）', () => {
    const { g, w, drops } = mkShell();
    const st = w.store;
    const PLANK = TILE_BY_KEY['platform']!;
    for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, PLANK, 0, 0);
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    expect(st.get(12, 11)).toBe(GNOME);
    expect(st.get(12, 12)).toBe(GNOME);
    expect(drops).toEqual([]);
  });

  it('tileCut 目标（高草）：CanPlace tileCut 豁免 → 清格相吞草 → 整件落位（零侏儒掉落）', () => {
    const { g, w, drops } = mkShell();
    const st = w.store;
    for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
    const TALLGRASS = TILE_BY_KEY['tallgrass']!;
    st.setTileSilent(12, 12, TALLGRASS, 0, 0);
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    expect(st.get(12, 12)).toBe(GNOME);
    expect(st.get(12, 11)).toBe(GNOME);
    // 吞草可能掷种子掉落（killTileDropItems 283 面）;只锁无侏儒掉落
    expect(drops.filter((d) => d.key === DROP_KEY)).toEqual([]);
  });
});

describe('BJ600-② 帧表/placeStyle 锁（frameX 步 28,style 0-4 循环）', () => {
  it('cycle 0-4 → frameX = style*28（TileObjectData CoordinateWidth 26+pad2）,行帧 0/20 恒稳', () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      const { g, w, drops } = mkShell(3, cycle);
      const st = w.store;
      for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
      g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
      expect(st.get(12, 11), `cycle ${cycle}`).toBe(GNOME);
      const fx = cycle * 28;                 // 原版帧步（furnitureStyleBase case 567）
      expect(st.frameX[st.idx(12, 11)]).toBe(fx);
      expect(st.frameX[st.idx(12, 12)]).toBe(fx);
      expect(st.frameY[st.idx(12, 11)]).toBe(0);
      expect(st.frameY[st.idx(12, 12)]).toBe(20);
      expect(drops).toEqual([]);
      // tile 侧无"心情"变换面（原版同相）:复跑级联 style 恒稳
      g.checkDecorSquareFrame(12, 12);
      expect(st.frameX[st.idx(12, 11)]).toBe(fx);
    }
  });
});

describe('BJ600-③ 拒放面（无支撑/悬空 → 零写零消耗零掉落）', () => {
  it('下方无实心/平台 → 不落格不消耗（原版 CanPlace 锚门）', () => {
    const { g, w, inv, drops } = mkShell();
    const st = w.store;
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    expect(st.get(12, 11)).toBe(0);
    expect(st.get(12, 12)).toBe(0);
    expect(drops).toEqual([]);
    expect(inv.slots[0]!.stack).toBe(3);
  });
});

describe('BJ600-⑤ 同族多格件冒烟锁（南瓜灯 35/派对礼物 457/沙堡桶 552/火烈鸟 545）', () => {
  // 同一 raw 1×1 写病灶族（南瓜灯 2×2=CheckMB 会整件杀,沙堡 3×2/火烈鸟 2×3 残废渲染）
  // 足印左上 = 点击格 - Origin（TileObject.cs:846-848 xCoord=click-Origin 同式）
  const FAMILY: Array<[number, string, number]> = [
    [1813, 'v_35_jackolanterns', 35],
    [3749, 'v_457_party_presents', 457],
    [4460, 'v_552_sandcastle_bucket', 552],
    [4420, 'v_545_lawn_flamingo', 545],
  ];
  for (const [vid, tileKey, sheet] of FAMILY) {
    it(`vid ${vid} → ${tileKey} 整件落位+零掉落+消耗 1`, () => {
      const { g, w: world, inv, drops } = mkShell(2);
      const st = world.store;
      // ★C14-F3（2026-10-11）：沙堡桶 552 原版 AnchorValidTiles={53,112,234,116}
      //  （TileObjectData.cs:3315——沙/黑沙/猩红沙/……专锚）→ 地板按件给沙面;
      //  旧石地板对新成员表门=原版本相拒放。
      for (let dx = 8; dx < 18; dx++) {
        st.setTileSilent(dx, 13, sheet === 552 ? TILE_BY_KEY['sand']! : STONE, 0, 0);
      }
      const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? '']!;
      const tid = TILE_BY_KEY[tileKey]!;
      const td = TILE_DEFS[tid];
      const spec = anchorSpecOf(sheet)!;
      g.flexWandCycle = 0;
      // ★BJ604件1：沙堡桶原版放置门+消耗 = 背包沙块 169（FlexibleTileWand.cs:48 无
      // WithoutAmmoConsumption——TryGetPlacementOption 扫 _options[169],无沙块
      // canUse=false）→ 夹具补沙块（原版同需）;放置拍扣 1
      // （PlaceIt_ConsumeFlexibleWandMaterial Player.cs:40492-40501）
      if (vid === 4460) {
        const sandIid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[169] ?? '']!;
        inv.slots[1] = { id: sandIid, stack: 5 };
      }
      g.tryPlace(12, 12, ITEM_DEFS[iid]);
      expect(td.vanilla?.sheet).toBe(sheet);
      const ax = 12 - spec.ox, ay = 12 - spec.oy;
      for (let dx = 0; dx < spec.w; dx++) {
        for (let dy = 0; dy < spec.h; dy++) {
          expect(st.get(ax + dx, ay + dy), `${tileKey}@${ax + dx},${ay + dy}`).toBe(tid);
        }
      }
      expect(drops.filter((d) => d.key === multiTileDropKey(td, vanillaPlaceableTileKeys()))).toEqual([]);
      // 消耗面 per-item：4460 沙堡桶原版 consumable=false（Item.cs:37693,可复用
      // 放置工具）→ 不扣;1813/3749/4420 consumable=true → 扣 1
      expect(inv.slots[0]!.stack).toBe(vid === 4460 ? 2 : 1);
      // ★BJ604件1：沙块弹药扣 1（5→4）
      if (vid === 4460) expect(inv.slots[1]!.stack).toBe(4);
    });
  }
});

describe('BJ600-④ 挖取回收锁（放置后可挖=掉 1 个,非无限刷）', () => {
  it('破坏整件 → 两格清+单发 place_v_567_garden_gnome（BJ543 单掉语义）', () => {
    const { g, w, drops } = mkShell();
    const st = w.store;
    for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    expect(drops).toEqual([]);
    g.breakTile(12, 12, true);               // 玩家挖底格 → object 支整件清
    expect(st.get(12, 11)).toBe(0);
    expect(st.get(12, 12)).toBe(0);
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(DROP_KEY);
    expect(drops[0]!.n).toBe(1);
  });

  it('失撑杀臂（CheckGnome 支撑门）：底格被拆 → 整件掉 1（掉落链在轨=仅真损触发）', () => {
    const { g, w, drops } = mkShell();
    const st = w.store;
    for (let dx = 8; dx < 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, ITEM_DEFS[GNOME_IID]);
    st.setTileSilent(12, 13, 0, 0, 0);       // 拆支撑（静默,不走级联）
    g.checkDecorSquareFrame(12, 12);         // 下一拍 TileFrame→CheckGnome
    expect(st.get(12, 11)).toBe(0);
    expect(st.get(12, 12)).toBe(0);
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(DROP_KEY);
  });
});
