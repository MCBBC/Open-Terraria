// ★BJ108 登记债清偿双刀（2026-09-17）守卫：
//  债① 微光脱困传送（Player.shimmerUnstuck,Teleport style12 Player.cs:29095;1458
//      :29093）+ 皇后钩挂墙瞬移（Player.doQueenSlimeHookTeleport,Teleport(vector,10)
//      :22924-22938;1458 :22922）接 startCameraTransitionForPlayerTeleport——vanilla
//      两面均经 Player.Teleport :37747（1458 :37745）全 style 汇聚进 Main.
//      StartCameraTransitionForPlayerTeleport（Main.cs:63526-63542/1458 :63532-63548,
//      style 逐字 diff 实证两版同文）：delay 仅 Style==1 为 10（:37744-37746）,style
//      12/10 均 0;style12/10 无绕行特判（定谳=必须接,如实接通用面）。
//      本仓单源 = Game.startCameraTransitionForPlayerTeleport（BJ103-A1b）,经
//      GameHooks.startCameraTransitionForPlayerTeleport 可选钩实体侧消费。
//  债② Game.cutTile tileCutIgnorance 排除面——CutTilesAt :15376-15383（1458 :15377
//      同）/弹线 CutTiles :15284 → Player.GetTileCutIgnorance(allowRegrowth:false,
//      trap)（Player.cs:45003-45014）：dontHurtNature（配饰 5309/5323）→ IgnoreDont
//      HurtNature（TileID.cs:87 default true,唯 13 例外 {654,444,485,231,484,32,352,
//      655,69,51,481,482,483} 可割）;trap 弹（Projectile.trap=true 型录,SetDefaults
//      20 站 1456/1457 同表）fromTrap=true → None 全割。近战双面（mowCutTiles/挥击
//      CutTiles）已建此表——本刀补齐弹域单源（弹域 cutTilesBox + explodeAt 爆炸面
//      自动同享）。ignore 判位次照抄：active 门后、1047×231 逐型 flag 前。
// 变异证红（开发期实测）：
//  M1 shimmerUnstuck 摘 game.startCameraTransitionForPlayerTeleport?.(...) → 债①
//     shimmer 组红；M2 doQueenSlimeHookTeleport 摘同钩 → 债① 钩爪组红；
//  M3 cutTile 摘 natureGuard 门 → 债② book 保护/瓦罐保护两组红；
//  M4 TRAP_PROJ_VIDS 摘 99 → 债② 陷阱豁免组红；M5 门谓词摘候选收窄
//     （t===POT||TILE_CUT 判去掉）→ 行为等价（非候选原路径零操作）无红=确证等价。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY } from '../src/data/items';   // ★方案 A:装备 id 一律运行时反查（旧硬编码 6015=重排前内部号,已失效）
import { TILE } from '../src/core/constants';
import { GrappleProj, GRAPPLE_LATCH } from '../src/entities/GrappleProj';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

// ============================================================
// 债① 微光脱困传送（style12）→ 相机过渡
// ============================================================
// 高度 256：UnderworldLayer = h-200 = 56 须在池（行 33-40）之下（shimmer.test 同构,
// 60 高小世界全域被判地狱层、buff 353 永不生效）
const W = 60, H = 256;

function shimmerWorld(): World {
  const w = new World(W, H, 11, 'bj108-debt');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);                                    // 池底
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4); // 微光满格
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1);        // 池外实地（脱困落点候选）
  return w;
}

function shimmerHooks(w: World, p: Player, transition: (...a: number[]) => void): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    startCameraTransitionForPlayerTeleport: transition,
  } as unknown as GameHooks;
}

describe('BJ108 债① 微光脱困传送接相机过渡（Teleport(pos,12)→Main.cs:63526 汇聚）', () => {
  it('脱困传送拍触发过渡钩一次：旧位=传送前位（池内）、新位≠旧位、delay 位缺省=0', () => {
    const w = shimmerWorld();
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const spy = vi.fn();
    const h = shimmerHooks(w, p, spy);
    p.fixedUpdate(1 / 60, h);
    expect(p.shimmering).toBe(true);           // 入微光（shimmer.test 同款前置）
    const beforeY = p.y;
    p.timeShimmering = 1200;                   // ≥1200 且有输入 → ShimmerUnstuck
    p.inputX = 1;
    p.fixedUpdate(1 / 60, h);
    expect(p.shimmering).toBe(false);          // 传送完成、微光化解除
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0] as unknown as number[];
    expect(call.length).toBe(2);               // delay 缺省=0——style12 无 :37744 特支
    const [ox, oy] = call;
    expect(oy).toBeGreaterThanOrEqual(beforeY);    // 旧位=传送拍（下沉后）位,位移前捕获
    expect(oy).toBeLessThan(41 * TILE);            // 仍在池内（未传送前）
    expect(Math.hypot(p.x - ox, p.y - oy)).toBeGreaterThan(10);   // 传送确已发生
    // 落点无微光（shimmer.test :327 同款池外判定）
    const st = w.store;
    const i = st.idx(Math.floor(p.cx / TILE), Math.floor((p.y + p.h - 4) / TILE));
    expect(st.liquid[i] === 0 || st.liquidType[i] !== 4).toBe(true);
  });

  it('无位支（spot=null）不传送 → 过渡钩不触发（原版无 Teleport 调用,Player.cs:29105）', () => {
    // 全程无实心格（groundBelow 恒 false）→ findShimmerFreeSpot 玩家层+兜底层全空
    const w = new World(W, H, 11, 'bj108-debt-nospot');
    const st = w.store;
    for (let x = 10; x < 30; x++) for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4);
    const p = new Player(20 * TILE, 36 * TILE, new Inventory());
    const spy = vi.fn();
    const h = shimmerHooks(w, p, spy);
    const x0 = p.x, y0 = p.y;
    // 私有面直调（绕 TryToShimmerUnstuck 门,聚焦 spot=null 分支本身）
    (p as unknown as { shimmerUnstuck: (g: GameHooks, w: World) => void }).shimmerUnstuck(h, w);
    expect(spy).not.toHaveBeenCalled();        // 无传送无过渡
    expect(p.x).toBe(x0);
    expect(p.y).toBe(y0);                      // 原地未动（保持浸没等下一轮）
  });
});

// ============================================================
// 债① 皇后钩挂墙瞬移（style10）→ 相机过渡
// ============================================================
function grappleHarness(transition: (...a: number[]) => void) {
  const w = new World(60, 60, 42, 'bj108-debt-hook');
  const st = w.store;
  const p = new Player(30 * TILE, 40 * TILE, new Inventory());
  const hooks = {
    world: w, player: p,
    spawnDrop: () => null, addDamageNumber: () => {},
    playSfx: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
    onInventoryChanged: () => {},
    enemies: () => [], critters: () => [], spawnEnemy: () => {},
    damagePlayer: (): number => 0,
    startCameraTransitionForPlayerTeleport: transition,
  } as never;
  return { st, p, hooks };
}

describe('BJ108 债① 皇后钩挂墙瞬移接相机过渡（Teleport(vector,10)→Main.cs:63526 汇聚）', () => {
  it('瞬移拍触发过渡钩一次：旧位=原地（钩爪挂墙拍玩家未步进）、delay 位缺省=0', () => {
    const { st, p, hooks } = grappleHarness(vi.fn());
    const spy = (hooks as { startCameraTransitionForPlayerTeleport: ReturnType<typeof vi.fn> })
      .startCameraTransitionForPlayerTeleport;
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, TILE_BY_KEY['dirt']!);   // 天花板
    const beforeY = p.y;
    // 发射 935（shootSpeed 4,grapple.test 皇后钩同款）并跑到挂墙
    const d = Math.hypot(0, -1);
    const g = new GrappleProj(p.cx - 8, p.y + 8, (0 / d) * 4, (-1 / d) * 4, 935,
      () => (p.dead ? null : p));
    p.registerGrappleProj(g);
    for (let t = 0; t < 4000 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    expect(p.y).toBeLessThan(beforeY - 100);   // 玩家已被瞬移到锚点附近
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0] as unknown as number[];
    expect(call.length).toBe(2);               // delay 缺省=0——style10 无 :37744 特支
    const [ox, oy] = call;
    expect(ox).toBe(30 * TILE);                // 旧位=原地（挂墙拍玩家未步进,字面相等）
    expect(oy).toBe(40 * TILE);
  });
});

// ============================================================
// 债② cutTile tileCutIgnorance（CutTilesAt :15376 / GetTileCutIgnorance :45003）
// ============================================================
/** Game 原型台（bj103 harness 同构）：world.store/player/breakTile/smashPot 桩注入。
 *  acc5309=true → 配饰槽 3 挂 vi_5309_DontHurtNatureBook（★方案 A 恒等域 iid=5309;运行时反查防漂移）。 */
const BOOK_IID = ITEM_BY_KEY['vi_5309_DontHurtNatureBook']
  ?? ITEM_BY_KEY['vi_5309_DontHurtNature'] ?? -1;
function cutHarness(tiles: Map<number, number>, acc5309: boolean) {
  const game = Object.create(Game.prototype) as unknown as {
    world: { store: unknown };
    player: unknown;
    breakTile: ReturnType<typeof vi.fn>;
    smashPot: ReturnType<typeof vi.fn>;
    cutTile: (x: number, y: number, vid?: number) => void;
    _staffHarvestBonus: boolean;
  };
  game.world = {
    store: {
      inBounds: () => true,
      get: (_x: number, _y: number) => 0,
      hasTile: () => true,
      // ★红蓝-C 门配套（2026-09-17）：Game.cutTile 候选格现求值 canCutTile——
      //  谓词读 idx/wall/frameX（wall 350 / 254 frameX 面）。本测候选格恒
      //  零墙/零帧，全零表即可（idx 只需落表内，坐标个位数无混叠）。
      idx: (x: number, y: number) => (x & 255) * 256 + (y & 255),
      wall: new Uint16Array(256 * 256),
      frameX: new Uint16Array(256 * 256),
    },
  };
  // 逐格表（key = x*100000+y,与 mowCutTiles swingTileCutSet 同式）
  const map = tiles;
  (game.world.store as { get: (x: number, y: number) => number }).get = (x: number, y: number) =>
    map.get(x * 100000 + y) ?? 0;
  game.player = {
    inv: {
      armor: acc5309 ? { 3: { id: BOOK_IID } } : {},   // armor[3]=配饰首槽（ACC_ARMOR_START;★方案 A:运行时反查）
      accSlotMax: 8,
      heldItem: () => null,
    },
  };
  game.breakTile = vi.fn();
  game.smashPot = vi.fn();
  game._staffHarvestBonus = false;
  return game;
}

const WEED = TILE_BY_KEY['tallgrass']!;          // sheet 3∈TILE_CUT,不在 13 例外表
const TNT = TILE_BY_KEY['v_654_tnt_barrel']!;    // sheet 654∈TILE_CUT ∩ 13 例外表
const POT = TILE_BY_KEY['pot']!;                 // sheet 28∈TILE_CUT,不在例外表

describe('BJ108 债② cutTile tileCutIgnorance（GetTileCutIgnorance :45003 nature 支）', () => {
  it('无书基线：候选格照割（既有行为零变化）', () => {
    const g = cutHarness(new Map([[5 * 100000 + 5, WEED]]), false);
    g.cutTile(5, 5);
    expect(g.breakTile).toHaveBeenCalledTimes(1);
  });

  it('book（5309）佩戴：表外 tileCut 格被忽略（ignore=true → continue,CutTilesAt :15376）', () => {
    const g = cutHarness(new Map([[5 * 100000 + 5, WEED]]), true);
    g.cutTile(5, 5);
    expect(g.breakTile).not.toHaveBeenCalled();
    // 无 vid 直调（WeaponProj 等直调面）与显式非陷阱 vid 同受保护
    const g2 = cutHarness(new Map([[5 * 100000 + 5, WEED]]), true);
    g2.cutTile(5, 5, 2);
    expect(g2.breakTile).not.toHaveBeenCalled();
  });

  it('book 佩戴：13 例外表内格仍可割（TileID.cs:87 例外支——654 TNT 桶）', () => {
    const g = cutHarness(new Map([[5 * 100000 + 5, TNT]]), true);
    g.cutTile(5, 5);
    expect(g.breakTile).toHaveBeenCalledTimes(1);
  });

  it('book 佩戴：瓦罐同受保护（smashPot 不触发）；无书照碎', () => {
    const g = cutHarness(new Map([[5 * 100000 + 5, POT]]), true);
    g.cutTile(5, 5);
    expect(g.smashPot).not.toHaveBeenCalled();
    const g2 = cutHarness(new Map([[5 * 100000 + 5, POT]]), false);
    g2.cutTile(5, 5);
    expect(g2.smashPot).toHaveBeenCalledTimes(1);
  });

  it('陷阱弹免保护：vid∈TRAP_PROJ_VIDS（99 巨石）book 下照割（fromTrap=true→None）', () => {
    const g = cutHarness(new Map([[5 * 100000 + 5, WEED]]), true);
    g.cutTile(5, 5, 99);
    expect(g.breakTile).toHaveBeenCalledTimes(1);
    // 1002 TNTBarrel 爆炸面（explodeAt cutTilesBox 穿 projId）同享
    const g2 = cutHarness(new Map([[5 * 100000 + 5, WEED]]), true);
    g2.cutTile(5, 5, 1002);
    expect(g2.breakTile).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 结构锁：两面钩点在源（防回归=摘钩静默）
// ============================================================
describe('BJ108 债① 调用点结构锁', () => {
  it('Player.ts 两传送面均含 startCameraTransitionForPlayerTeleport 可选钩调用', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'src/entities/Player.ts'), 'utf8');
    for (const fn of ['shimmerUnstuck(game: GameHooks', 'doQueenSlimeHookTeleport(targetX: number']) {
      const i = src.indexOf(fn);
      expect(i, fn).toBeGreaterThan(0);
      const body = src.slice(i, i + 3500);
      expect(/game\.startCameraTransitionForPlayerTeleport\?\.\(/.test(body), `${fn} 未接过渡`).toBe(true);
    }
  });
});
