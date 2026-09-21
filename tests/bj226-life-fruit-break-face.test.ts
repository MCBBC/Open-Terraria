// BJ226（2026-09-21 用户实报：生命果可无限打击掉落）——tile 236（LifeFruit）破面回归。
// 原版破面全谱（反编译锚，Terarria1457 亲读；1456/1458 交叉同文）：
//   · tileCut[236]=true（Main.cs:10388;1456 :10158 / 1458 :10388 同文）→ 武器近战
//     （ItemCheck_CutTiles P.cs:45017→KillTile :45044）与弹幕（DelegateMethods.CutTiles
//     D.cs:871-893→KillTile :889）都可割碎生命果——用户预期「只有镐能挖」与原版相悖
//     （原版同相，不落偏差刀，登记分歧）；238 花苞无 tileCut 赋值=武器不可割。
//   · 掉落唯一源=TileFrame→CheckJunglePlant（W.cs:86757 case 233/236/238/702 →
//     :48358；:48439-48441 type==236 → NewItem(1291) 恰一次）+ destroyObject=true
//     整组杀（:48446-48457）——KillTile_GetItemDrops（:64477）无 236 case=无第二掉落源。
//   · 锚=帧商 mod2（:48367-48381 `while(num>1){num-=2;num2++}`）；生命果 styleX∈{0,1,2}
//     （PlaceJunglePlant :48241-48242 num2=36*styleX；生长链 cs:75073 Next(3)）→
//     frameX∈{0,18,36,54,72,90}。238 花苞全部生成位恒 styleX=0（:74840/:74855/:75041）。
// 本仓断环（BJ226 症状②根因，单点）：Game.ts breakTileBody 236/238 特支锚漏 mod2 →
//   styleX≥1 果（2/3）锚左漂 2~5 格 → 清格循环 type 守卫全不中=本体残留+掉落位左漂 →
//   无限复掉。修=x-(floor(fx/18)%2)（238 同式归一，修前后同值）。
// 变异三发（均须红，还原后本文件复绿）：
//   M1 打击面误接红：把 238 加入 TILE_CUT_SHEETS（tiles.ts）→ 「武器割花苞不碎」爆红；
//   M2 锚缺失红：回退 breakTileBody 锚为 x-floor(fx/18) → styleX≥1 残留断言爆红；
//   M3 重复掉落红：摘除特支清格循环（只留掉落）→ 复挖仍掉 → 掉落计数断言爆红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game, TILE_CUT } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const FRUIT = TILE_BY_KEY['v_236_life_fruit_plant'];   // sheet 236
const BULB = TILE_BY_KEY['v_238_plantera_s_bulb'];     // sheet 238
const HERB_SPROUT = TILE_BY_KEY['v_82_herbs_sprout'];  // sheet 82
const HERB_MATURE = TILE_BY_KEY['v_83_herbs_mature'];  // sheet 83
const HERB_BLOOM = TILE_BY_KEY['v_84_herbs_bloom'];    // sheet 84
const GRASS = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 60);  // 丛林草 60（底承）
expect(FRUIT).toBeGreaterThan(0);
expect(BULB).toBeGreaterThan(0);
expect(GRASS).toBeGreaterThan(0);

function mkWorld(): World {
  return new World(60, 260, 11, 'bj226');
}

type Drop = [string, number];

/** breakTile/cutTile 可驱动面最小桩（shell 形制同 tests/killtile-tail-liquid.test.ts，
 *  补 spawnBossOnPlayer/inv——238 召王门与 cutTile 配饰免割面消费位） */
function shell(w: World, drops: Drop[]): Game & Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean): void;
    cutTile(x: number, y: number, vid?: number, extraCutTreeCactus?: boolean): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.spawnBossOnPlayer = vi.fn();
  g.player = {
    x: 5 * 16, y: 5 * 16,                  // 盒左上（BJ249 几何域:238 召王距离基准=玩家 position）
    cx: 5 * 16 + 8, cy: 5 * 16 + 8,        // 缺省远距（50 格召王门外）
    equipStats: {},
    inv: { accSlotMax: 0, armor: [], heldItem: () => null },
  } as never;
  return g;
}

/** PlaceJunglePlant 2×2 帧布局（W.cs:48256-48272）：frameX=36*styleX+col*18、
 *  frameY=0/18（236/238/702 帧基 num3=0）。 */
function placeJunglePlant2x2(
  st: World['store'], t: number, ax: number, ay: number, styleX: number,
): void {
  const fx0 = 36 * styleX;
  st.setTileSilent(ax, ay, t, fx0, 0);
  st.setTileSilent(ax + 1, ay, t, fx0 + 18, 0);
  st.setTileSilent(ax, ay + 1, t, fx0, 18);
  st.setTileSilent(ax + 1, ay + 1, t, fx0 + 18, 18);
}

function tilesLeft(st: World['store'], ax: number, ay: number, t: number): number {
  let n = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    if (st.get(ax + dx, ay + dy) === t) n++;
  }
  return n;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ226 生命果 236 破面（镐/武器/复挖 + 花苞 238 对照）', () => {
  it('tileCut 表对拍：236 ∈（武器可割=原版 Main.cs:10388）、238 ∉（武器不可割）、草药 82/83/84 ∈', () => {
    expect(TILE_CUT.has(FRUIT)).toBe(true);
    expect(TILE_CUT.has(BULB)).toBe(false);
    expect(TILE_CUT.has(HERB_SPROUT)).toBe(true);
    expect(TILE_CUT.has(HERB_MATURE)).toBe(true);
    expect(TILE_CUT.has(HERB_BLOOM)).toBe(true);
  });

  for (const styleX of [0, 1, 2]) {
    it(`镐挖 styleX=${styleX} 生命果（四角逐一格）→ 恰掉 1 件 1291 + 2×2 全清`, () => {
      for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const w = mkWorld();
        const st = w.store;
        st.setTileSilent(20, 20, GRASS);           // 底承（不影响破面,防上方保护误判）
        const ax = 20, ay = 18;
        placeJunglePlant2x2(st, FRUIT, ax, ay, styleX);
        const drops: Drop[] = [];
        const g = shell(w, drops);
        g.breakTile(ax + hx, ay + hy, true, false, true);   // byPlayer+pickHit=镐面
        expect(drops).toEqual([['vi_1291_life_fruit', 1]]); // 恰一次（CheckJunglePlant 单源）
        expect(tilesLeft(st, ax, ay, FRUIT)).toBe(0);       // 整件清除（destroyObject 面）
      }
    });
  }

  it('症状②回归：styleX=1 果挖碎后残留=0——复挖同格零掉落（无限刷断根）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(20, 20, GRASS);
    const ax = 20, ay = 18;
    placeJunglePlant2x2(st, FRUIT, ax, ay, 1);       // frameX=36/54（旧锚漂 2~3 格档）
    const drops: Drop[] = [];
    const g = shell(w, drops);
    g.breakTile(ax + 1, ay + 1, true, false, true);
    expect(drops.length).toBe(1);
    expect(tilesLeft(st, ax, ay, FRUIT)).toBe(0);
    // 复挖四格（原位已空+邻域已空）→ 零掉落
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      g.breakTile(ax + dx, ay + dy, true, false, true);
    }
    expect(drops.length).toBe(1);                    // 只有第一镐掉
  });

  it('弹幕 cutTile 面（DelegateMethods.CutTiles→KillTile 同相）：割 styleX=1 果 → 掉 1 + 全清', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(20, 20, GRASS);
    const ax = 20, ay = 18;
    placeJunglePlant2x2(st, FRUIT, ax, ay, 1);
    const drops: Drop[] = [];
    const g = shell(w, drops);
    g.cutTile(ax, ay);                               // 弹侧收口（vid 缺省=无型语义）
    expect(drops).toEqual([['vi_1291_life_fruit', 1]]);
    expect(tilesLeft(st, ax, ay, FRUIT)).toBe(0);
  });

  it('同族对照：武器割花苞 238 → 不割不碎不掉（tileCut 表外）;镐面直破 → 整件清除不掉物', () => {
    // 弹/近战割面（cutTile 收口=TILE_CUT.has 门,238 表外零操作）
    const w1 = mkWorld();
    const st1 = w1.store;
    st1.setTileSilent(20, 20, GRASS);
    placeJunglePlant2x2(st1, BULB, 20, 18, 0);
    const drops1: Drop[] = [];
    const g1 = shell(w1, drops1);
    g1.cutTile(20, 18);
    g1.cutTile(21, 19);
    expect(drops1).toEqual([]);
    expect(tilesLeft(st1, 20, 18, BULB)).toBe(4);    // 四格俱在

    // 镐面（KillTile 直破）：整件清除；玩家远距（>50 格曼哈顿）不召世花
    const w2 = mkWorld();
    const st2 = w2.store;
    st2.setTileSilent(20, 20, GRASS);
    placeJunglePlant2x2(st2, BULB, 20, 18, 0);
    const drops2: Drop[] = [];
    const g2 = shell(w2, drops2);
    const pp2 = g2.player as unknown as { x: number; y: number; cx: number; cy: number };
    pp2.x = 55 * 16; pp2.y = 200 * 16;       // ★BJ249:盒左上域同步
    pp2.cx = 55 * 16 + 8;
    pp2.cy = 200 * 16 + 8;
    g2.breakTile(20, 18, true, false, true);
    expect(drops2).toEqual([]);                     // 238 破坏不掉放置物（drop:null 同相）
    expect(tilesLeft(st2, 20, 18, BULB)).toBe(0);
    expect(g2.spawnBossOnPlayer).not.toHaveBeenCalled();
  });

  it('同族对照：花苞 238 召王门=50 格曼哈顿（近距破坏 → spawnBossOnPlayer(262) 一次）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(20, 20, GRASS);
    placeJunglePlant2x2(st, BULB, 20, 18, 0);
    const drops: Drop[] = [];
    const g = shell(w, drops);
    // 锚格中心（20.5,18.5 格 = px 328/296）±50 格内置玩家
    const pp = g.player as unknown as { x: number; y: number; cx: number; cy: number };
    pp.x = 20 * 16; pp.y = 18 * 16;          // ★BJ249:盒左上域同步（新基准=被击格左上 vs 盒左上）
    pp.cx = 20 * 16 + 8;
    pp.cy = 18 * 16 + 8;
    g.breakTile(21, 19, true, false, true);
    expect(tilesLeft(st, 20, 18, BULB)).toBe(0);
    expect(g.spawnBossOnPlayer).toHaveBeenCalledTimes(1);
    expect(g.spawnBossOnPlayer).toHaveBeenCalledWith(262);
    expect(drops).toEqual([]);
  });

  it('同族对照：草药 82/83/84 割面可扫（cutTile → 格清除,挥割即碎=原版 tileCut）', () => {
    for (const [t, fx] of [[HERB_SPROUT, 0], [HERB_MATURE, 18], [HERB_BLOOM, 0]] as const) {
      const w = mkWorld();
      const st = w.store;
      st.setTileSilent(20, 20, GRASS);
      st.setTileSilent(20, 19, t, fx, 0);
      const drops: Drop[] = [];
      const g = shell(w, drops);
      g.cutTile(20, 19);
      expect(st.get(20, 19)).toBe(0);                // 割碎（掉落账=独立域,不在本刀面）
      expect(drops.every(([k]) => k !== 'vi_1291_life_fruit')).toBe(true);
    }
  });
});
