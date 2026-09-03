// 金网/防火网 cutExtraTiles 砍草面行为锁定（2026-09-03 清偿批②）。
// 原版链（Terarria1457 Player.cs:43984-44008）：三网 1991/3183/4821 SetDefaults 全程
// 无 damage 写面（Item.cs:21306/29542/39481）→ ①进近战判定盒流（:43984 或支特判）；
// ②CatchCritters（:43992）；③金网 3183/防火网 4821 独立砍支 CutTiles(cutExtra
// Tiles:true)（:43994-43998，早于 damage>0 门 :43999）——Main.tileCut ∪ bonusCutTiles{233}
// （TileID.cs:307）一并受理；④damage>0 段（普通砍+MeleeHitNPCs :43999-44019）对网
// 恒不运行 → 只砍不打。普通虫网 1991 无砍支。
// 本测锁：金网砍 tileCut 草 + bonusCutTiles 233、普通虫网不砍、网不伤敌怪、网捕小动
// 物照旧、对照近战武器伤敌怪（证"不打"非桩缺失）。扫描域 +1 外沿（:45023-45026）
// 由 band 铺格吸收 ±1 格漂移。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

afterEach(() => { vi.restoreAllMocks(); });

const GRASS_TUFT = TILE_INTERNAL_BY_SHEET.get(3)!;    // Main.tileCut 表（普通砍草面）
const DETRITUS = TILE_INTERNAL_BY_SHEET.get(233)!;    // bonusCutTiles{233}（cutExtraTiles 加砍面）
const STONE = TILE_INTERNAL_BY_SHEET.get(1)!;         // 非可砍实心（盒外对照格用）

/** updateSwingHits 直驱桩（weapon-melee-leftover 同构） */
function swingGame(heldVid: number, opts: { tiles?: boolean; critter?: boolean } = {}) {
  const world = new World(120, 120, 30, 'net-cut');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iid(heldVid), 1);
  g.swing = { t: 20, dur: 25, dmg: 50, kb: 3, item: iid(heldVid), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  const enemies = [Enemy.fromVanilla(1, player.cx + 8, player.y)!];
  const critters = opts.critter
    ? [{ id: 901, x: player.cx - 8, y: player.y, w: 16, h: 16, dead: false, vanillaId: 1,
         hurt: vi.fn(() => true) }]
    : [];
  g.entities = { critters, npcs: [], enemies };
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
  // 砍/捕/割草面直录（本测锁路由,不锁 breakTile 内部）
  const cut: Array<[number, number]> = [];
  g.breakTile = (x: number, y: number) => { cut.push([x, y]); };
  g.smashPot = vi.fn();
  g.netCatchCritter = vi.fn();
  g.mowTheLawnTick = vi.fn();   // 行走割草面独立（干扰本测判定盒）
  if (opts.tiles) {
    // 判定盒 band（缺省 16×16 贴图 head 段:列 49-51 × 行 89-90 ± 1 外沿）铺满
    for (let x = 47; x <= 53; x++) {
      for (let y = 88; y <= 92; y++) {
        world.store.setTileSilent(x, y, (x + y) % 2 === 0 ? GRASS_TUFT : DETRITUS);
      }
    }
  }
  world.store.setTileSilent(60, 60, STONE);      // 盒外对照格（不可砍实心,任何武器都不该砍到）
  const cutTypes = () => cut.map(([x, y]) => world.store.get(x, y));
  return { g, player, world, enemies, critters, cut, cutTypes };
}

const run = (g: Record<string, unknown>) =>
  (g as unknown as { updateSwingHits: () => void }).updateSwingHits();

describe('金网 3183（cutExtraTiles 砍草面）', () => {
  it('砍 tileCut 草 + bonusCutTiles{233} 败叶,盒外格不砍', () => {
    const { g, cutTypes, cut } = swingGame(3183, { tiles: true });
    run(g);
    const types = cutTypes();
    expect(types).toContain(GRASS_TUFT);
    expect(types).toContain(DETRITUS);
    expect(types).not.toContain(STONE);                       // 盒外实心对照格
    expect(cut.every(([x, y]) => x >= 47 && x <= 53 && y >= 88 && y <= 92)).toBe(true);
    expect(types.filter((t) => t === GRASS_TUFT).length).toBeGreaterThanOrEqual(3);
    expect(types.filter((t) => t === DETRITUS).length).toBeGreaterThanOrEqual(3);
  });

  it('只砍不打：盒内敌怪不受击', () => {
    const { g, enemies } = swingGame(3183);
    const hurt = vi.spyOn(enemies[0]!, 'hurt');
    run(g);
    expect(hurt).not.toHaveBeenCalled();
  });

  it('捕小动物面保持（ItemCheck_CatchCritters :43992）', () => {
    const { g, critters } = swingGame(3183, { critter: true });
    run(g);
    expect((g.netCatchCritter as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(critters[0]);
  });
});

describe('普通虫网 1991（无砍支）', () => {
  it('不砍 tileCut 草、不砍 bonusCutTiles 233', () => {
    const { g, cut } = swingGame(1991, { tiles: true });
    run(g);
    expect(cut).toHaveLength(0);
  });

  it('只砍不打差分同样成立（damage=0 无命中段）', () => {
    const { g, enemies } = swingGame(1991);
    const hurt = vi.spyOn(enemies[0]!, 'hurt');
    run(g);
    expect(hurt).not.toHaveBeenCalled();
  });
});

describe('防火网 4821（cutExtraTiles 同支）+ 对照近战', () => {
  it('防火网砍草+败叶（与金网同款独立支 :43994-43998）', () => {
    const { g, cutTypes } = swingGame(4821, { tiles: true });
    run(g);
    const types = cutTypes();
    expect(types).toContain(GRASS_TUFT);
    expect(types).toContain(DETRITUS);
  });

  it('对照：普通近战武器走敌怪命中（证"网不打"非桩缺失）', () => {
    const { g, enemies } = swingGame(3013);   // 臭臭爪（melee,非 noMelee）
    const hurt = vi.spyOn(enemies[0]!, 'hurt');
    run(g);
    expect(hurt).toHaveBeenCalledTimes(1);
  });
});
