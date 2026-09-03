// WorldGen.CanCutTile 门在近战挥击砍切循环的行为锁定（红队 R2-F5,2026-09-03）。
// 原版链（Terarria1457）：Player.ItemCheck_CutTiles（Player.cs:45020-45032）扫描域
// 循环的 continue 条件末项 `!WorldGen.CanCutTile(i, j, TileCuttingContext.AttackMelee)`
// ——拒切三族（WorldGen.cs:88111-88124）：
//   · wall==350（双地牢标记墙）；
//   · 下格 type∈{78 ClayPot 陶盆, 380 PlanterBox 播种箱, 579 RockGolemHead 石傀儡头}
//     （种植基座上的植物/基座上方格不可近战割）；
//   · type==254 且 frameX<144（未熟南瓜——成熟段 frameX≥144,GrowPumpkin 每阶 +36）。
// 仓内谓词单源 = src/world/CanCutTile.ts；本测经 Game.updateSwingHits 挥击砍切循环
// 驱动（net-cutextratiles 同构桩）——mowCutTiles（割草机矩形版）与裂砖扫掠链共用谓词。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_INTERNAL_BY_SHEET, TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

afterEach(() => { vi.restoreAllMocks(); });

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

const HERB = TILE_INTERNAL_BY_SHEET.get(82)!;        // 成熟药草（tileCut 表,普通砍面）
const GRASS_TUFT = TILE_INTERNAL_BY_SHEET.get(3)!;   // tileCut 草（对照/门测通用）
const CLAY_POT = TILE_INTERNAL_BY_SHEET.get(78)!;    // 陶盆（CanCutTile 下格门成员）
const PUMPKIN = TILE_INTERNAL_BY_SHEET.get(254)!;    // 南瓜（254 frameX 门本体）

/** updateSwingHits 直驱桩（net-cutextratiles swingGame 同构,敌怪/小动物/NPC 全空——
 *  本测只锁砍切面）。判定盒缺省几何（16×16 贴图 head 段 ×2 扩展）扫描域 ≈
 *  列 50..52 × 行 90..91（右缘压半格:X+W=840 ≡8 (mod 16)）→ band 46..56×87..94 覆盖 */
function swingGame(heldVid: number) {
  const world = new World(120, 120, 30, 'cancutile-gate');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iid(heldVid), 1);
  g.swing = { t: 20, dur: 25, dmg: 50, kb: 3, item: iid(heldVid), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies: [] };
  g.player = player;
  g.world = world;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.spawnDust = vi.fn();
  g.spawnFriendlyProj = vi.fn();
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  g.dropContext = () => undefined;
  g.onEnemyKilled = () => {};
  g.achievements = { notifyProgressionEvent: vi.fn() };
  const cut: Array<[number, number]> = [];
  g.breakTile = (x: number, y: number) => { cut.push([x, y]); };
  g.smashPot = vi.fn();
  g.netCatchCritter = vi.fn();
  g.mowTheLawnTick = vi.fn();
  const st = world.store;
  for (let x = 46; x <= 56; x++) {
    for (let y = 87; y <= 94; y++) {
      if (st.get(x, y) === 0) st.setTileSilent(x, y, GRASS_TUFT);   // 缺省铺草(对照面)
    }
  }
  return { g, player, world, st, cut };
}

const run = (g: Record<string, unknown>) =>
  (g as unknown as { updateSwingHits: () => void }).updateSwingHits();

const wasCut = (cut: Array<[number, number]>, x: number, y: number) =>
  cut.some(([cx, cy]) => cx === x && cy === y);

describe('① WorldGen.CanCutTile 门（近战挥击砍切循环,AttackMelee :45032）', () => {
  it('陶盆上的香草不割（下格 78 门,WorldGen.cs:88113）——盆旁对照香草照割', () => {
    const { g, st, cut } = swingGame(3013);
    st.setTileSilent(50, 90, HERB);          // 陶盆上的香草
    st.setTileSilent(50, 91, CLAY_POT);      // 基座（非 tileCut,自身不会被砍切循环受理）
    st.setTileSilent(52, 90, HERB);          // 对照：无基座香草（下格草）
    run(g);
    expect(wasCut(cut, 50, 90)).toBe(false); // 下格=陶盆 → CanCutTile false → 不割
    expect(wasCut(cut, 52, 90)).toBe(true);  // 同物无基座 → 照割（门非一刀切）
  });

  it('wall 350（双地牢标记墙）拒割（WorldGen.cs:88113）——无墙对照照割', () => {
    const { g, st, cut } = swingGame(3013);
    st.setTileSilent(50, 90, GRASS_TUFT);
    st.wall[st.idx(50, 90)] = 350;           // 原版 wall id 直存（TileStore.ts:25）
    st.setTileSilent(52, 90, GRASS_TUFT);    // 对照：同格无 350 墙
    run(g);
    expect(wasCut(cut, 50, 90)).toBe(false);
    expect(wasCut(cut, 52, 90)).toBe(true);
  });

  it('未熟南瓜(254 frameX<144)不割、成熟南瓜(frameX≥144)可割（WorldGen.cs:88117-88120）', () => {
    const { g, st, cut } = swingGame(3013);
    st.setTileSilent(50, 90, PUMPKIN);
    st.frameX[st.idx(50, 90)] = 18;          // 末熟段（GrowPumpkin 每阶 +36;144 起成熟）
    st.setTileSilent(52, 90, PUMPKIN);
    st.frameX[st.idx(52, 90)] = 144;         // 成熟段（掉落带 ≥144 同阈值）
    run(g);
    expect(wasCut(cut, 50, 90)).toBe(false); // frameX 18 < 144 → 门拒
    expect(wasCut(cut, 52, 90)).toBe(true);  // frameX 144 ≥ 144 → 门放行
  });
});
