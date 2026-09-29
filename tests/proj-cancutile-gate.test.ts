// 红蓝-C 债三清偿守卫（2026-09-17）：弹域 WorldGen.CanCutTile 门在 Game.cutTile
// 中央收口落位。vanilla 链（Terarria1457）：
//   Projectile.CutTilesAt :15395 `flag && WorldGen.CanCutTile(i, j,
//   TileCuttingContext.AttackProjectile)` → KillTile（1458 :15396 同文）；弹线面
//   DelegateMethods.CutTiles :889 `CanCutTile(x, y, tilecut_0)`，tilecut_0 由
//   Projectile.cs:15285 置 AttackProjectile——弹域盒割/线割两路同一判定子。
// 门位=KillTile 前末门：上方 1047 豁免（cutTilesTypeExempt）即 vanilla flag=false
//   短路；候选面（POT 28∪TILE_CUT∪1052 加砍）之外零求值=`flag &&` 短路同相。
// 拒切三族（WorldGen.cs:88111-88124，1458 :88119 同体）：
//   · wall==350（双地牢标记墙）；
//   · 下格 type∈{78 ClayPot, 380 PlanterBox, 579 RockGolemHead}——盆上植物不割
//     （1.0.5 起原版铁则 "Plants growing out of a Clay Pot can no longer be cut
//     with a weapon"；盆栽采收走镐/法杖矿道非割道，Herbs.md:179）；
//   · type==254 且 frameX<144（未熟南瓜）。
//   · 下格出界（Main.tile[x,y+1]==null 原文首支；仓内映射=inBounds，单源注 :29-32）。
// context 形参原文未消费（三档恒同体）——按调用位自述 AttackProjectile；
//   近战/放置同款行为测=melee-cancutile-gate.test.ts（AttackMelee/TilePlacement）。
// 变异证红（开发期实测）：摘 Game.cutTile 收口门 → ①②③④组全红、对照组仍绿。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

afterEach(() => { vi.restoreAllMocks(); });

const HERB = TILE_INTERNAL_BY_SHEET.get(82)!;        // 成熟药草（tileCut 表）
const GRASS_TUFT = TILE_INTERNAL_BY_SHEET.get(3)!;   // tileCut 草（对照组通用）
const CLAY_POT = TILE_INTERNAL_BY_SHEET.get(78)!;    // ClayPot（下格拒表成员）
const PLANTER = TILE_INTERNAL_BY_SHEET.get(380)!;    // PlanterBox（下格拒表成员）
const GOLEM_HEAD = TILE_INTERNAL_BY_SHEET.get(579)!; // RockGolemHead（下格拒表成员）
const PUMPKIN = TILE_INTERNAL_BY_SHEET.get(254)!;    // 南瓜（254 frameX 门本体）
const POT28 = TILE_INTERNAL_BY_SHEET.get(28)!;       // Pots 瓦罐（smashPot 支,自身可割）

/** Game 原型台：真 World store + 真 Game.cutTile,breakTile/smashPot 观察桩。
 *  player 桩形状 = bj108 cutHarness 同构（armor 空=配饰空,natureGuard 恒 false;
 *  heldItem null=药草加成支安全短路）。 */
function projGame() {
  const world = new World(120, 120, 30, 'proj-cancutile');
  const g = Object.create(Game.prototype) as unknown as {
    world: World;
    player: unknown;
    breakTile: ReturnType<typeof vi.fn>;
    smashPot: ReturnType<typeof vi.fn>;
    cutTile: (x: number, y: number, vid?: number, extraCut?: boolean) => void;
    _staffHarvestBonus: boolean;
  };
  g.world = world;
  g.player = { inv: { armor: {}, accSlotMax: 8, isItemSlotUnlockedAndUsable: () => true, heldItem: () => null } };   // ★刀I补桩(9545b31c):armor 空表语义不变
  g.breakTile = vi.fn();
  g.smashPot = vi.fn();
  g._staffHarvestBonus = false;
  return { g, st: world.store };
}

const cutArgs = (fn: ReturnType<typeof vi.fn>, x: number, y: number) =>
  fn.mock.calls.some((c) => c[0] === x && c[1] === y);

describe('红蓝-C：弹域 CanCutTile 门（Game.cutTile 中央收口,AttackProjectile :15395）', () => {
  it('① 未熟南瓜(254 frameX<144)弹割拒、成熟(frameX≥144)照割（WorldGen.cs:88117-88120）', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 90, PUMPKIN, 18, 0);   // 末熟段（GrowPumpkin 每阶 +36）
    st.setTileSilent(52, 90, PUMPKIN, 144, 0);  // 成熟段（掉落带同阈值）
    g.cutTile(50, 90);
    g.cutTile(52, 90);
    expect(cutArgs(g.breakTile, 50, 90)).toBe(false);  // frameX 18 < 144 → 门拒
    expect(cutArgs(g.breakTile, 52, 90)).toBe(true);   // frameX 144 ≥ 144 → 门放行
  });

  it('② 下格∈{78,380,579} 三族逐一弹割拒——盆旁对照香草照割（WorldGen.cs:88113-88115）', () => {
    for (const [sheet, base, below] of [
      [78, 50, CLAY_POT], [380, 54, PLANTER], [579, 58, GOLEM_HEAD],
    ] as Array<[number, number, number]>) {
      const { g, st } = projGame();
      st.setTileSilent(base, 90, HERB, 0, 0);      // 基座上的香草（扫描域内候选）
      st.setTileSilent(base, 91, below, 0, 0);     // 拒表基座
      st.setTileSilent(base + 2, 90, HERB, 0, 0);  // 对照：无基座香草（下格=空气 0∉拒表）
      g.cutTile(base, 90);
      g.cutTile(base + 2, 90);
      expect(cutArgs(g.breakTile, base, 90)).toBe(false);   // sheet=sheet 拒切
      expect(cutArgs(g.breakTile, base + 2, 90)).toBe(true); // 同物无基座 → 照割
    }
  });

  it('③ 正常草割通（tileCut 候选×下格空气 → 门放行,breakTile 落）', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 90, GRASS_TUFT, 0, 0);
    g.cutTile(50, 90);
    expect(cutArgs(g.breakTile, 50, 90)).toBe(true);
  });

  it('④ wall 350（双地牢标记墙）弹割拒——同排无墙对照照割（WorldGen.cs:88113）', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 90, GRASS_TUFT, 0, 0);
    st.wall[st.idx(50, 90)] = 350;               // 原版 wall id 直存（TileStore.ts:25）
    st.setTileSilent(52, 90, GRASS_TUFT, 0, 0);
    g.cutTile(50, 90);
    g.cutTile(52, 90);
    expect(cutArgs(g.breakTile, 50, 90)).toBe(false);
    expect(cutArgs(g.breakTile, 52, 90)).toBe(true);
  });

  it('⑤ 世界底缘（下格出界=原文 Main.tile[x,y+1]==null 支）弹割拒——上移一格对照照割', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 119, GRASS_TUFT, 0, 0);  // 底行（h=120,y+1=120 出界）
    st.setTileSilent(52, 118, GRASS_TUFT, 0, 0);  // 对照：下格 119 在界内
    g.cutTile(50, 119);
    g.cutTile(52, 118);
    expect(cutArgs(g.breakTile, 50, 119)).toBe(false);
    expect(cutArgs(g.breakTile, 52, 118)).toBe(true);
  });

  it('⑥ 瓦罐(28)面回归：无拒基座 → smashPot 照走（门不误伤罐面;下格 28∉拒表）', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 90, POT28, 0, 0);
    g.cutTile(50, 90);
    expect(g.smashPot).toHaveBeenCalledTimes(1);
    expect(cutArgs(g.breakTile, 50, 90)).toBe(false);   // 罐走 smashPot 支非 breakTile
  });

  it('⑦ 候选面之外零求值（flag&& 短路同相）：非 tileCut 格零观察面', () => {
    const { g, st } = projGame();
    st.setTileSilent(50, 90, TILE_INTERNAL_BY_SHEET.get(1)!, 0, 0);  // 石头（非候选）
    g.cutTile(50, 90);
    expect(g.breakTile).not.toHaveBeenCalled();
    expect(g.smashPot).not.toHaveBeenCalled();
  });
});
