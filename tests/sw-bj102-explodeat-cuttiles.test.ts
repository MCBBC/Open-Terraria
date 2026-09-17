// ★SW-BJ102 债①（2026-09-16）explodeAt 爆炸面 CutTiles 守卫。
// 金标（1457）：
//   · Projectile.Kill aiStyle16 支（P.cs:71785-71795）PrepareBombToBlow（Resize 爆炸盒,
//     :47629-47720）→ Damage() → Damage() 门内 CutTiles()（:12515-12518,friendly &&
//     owner==myPlayer && !npcProj && !minion && type!=1054）→ CutTilesAt(position,
//     width, height)（:15349 flag 缺省支/:15354-15405）——爆炸拍以【Resize 后爆炸盒】
//     割 Main.tileCut 族,盒=实体伤害盒（本仓 hurtBox 半宽语义,爆心 cx/cy）。
//   · 割除序：CutTiles 在 Damage_PVE 前（:12516→:12523）,本仓刀位=实体伤害段前。
//   · 扫描盒：CutTilesAt num=floor(x/16)..num2=floor((x+w)/16)+1【排除界】（:15356-15359,
//     SW-BJ88 债4② 同款）,右/下 +1 是排除界非含端;钳制由 Game.cutTile 界外零操作承载。
//   · vid 穿线（SW-BJ67）：cutTilesBox(game,…,vid) → Game.cutTile 1047×231 豁免单点。
// 变异证红（开发期实测）：M1 摘 explodeAt 割支 → E1/E2 红;M2 盒改整格中心半径盒
//   （cx−R*TILE）→ E1 盒断言红;M3 摘 projId>0 门 → E3 红。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Inventory } from '../src/items/Inventory';

/** explodeAt 运行时台：仅落 cutTile 记账（割面单刀位）;伤害/视觉域全部空表避开 */
function cutShell(w: World, cuts: Array<[number, number, number | undefined]>) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    explodeAt: Game['explodeAt'];
    cutTile: (x: number, y: number, vid?: number) => void;
  };
  g.world = w;
  g.recLog = () => {};
  g.cutTile = (x: number, y: number, vid?: number) => { cuts.push([x, y, vid]); };
  g.entities = { enemies: [], critters: [], npcs: [], projectiles: [] };
  // ★BJ108 债②（2026-09-17）：cutTile tileCutIgnorance 面读配饰谓词
  //  （accessoryVanillaIds ∋ 5309/5323,GetTileCutIgnorance :45003 nature 支）——
  //  E4 真 cutTile 台挂真 Inventory（空配饰=armor 全空,natureGuard 恒 false）
  g.player = { cx: -99999, cy: -99999, w: 20, h: 42, luck: 0, hostile: false, team: 0, equipStats: {},
    inv: new Inventory() };
  g.rangedCritPct = () => 4;
  g.damagePlayer = () => 0;
  g.reportPlayerHurt = () => {};
  g.spawnDrop = () => null;
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.chunks = { markDirtyArea: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.net = undefined;
  return g as unknown as { explodeAt: Game['explodeAt'] };
}

// 炸弹 28：PrepareBombToBlow Resize(128,128) → 爆炸盒半宽 hb=64px（本仓 hurtBox 语义）
describe('SW-BJ102 债① explodeAt 爆炸面 CutTiles（P.cs:12515-12518/:15349）', () => {
  it('E1 割盒=实体伤害盒（爆心±hb,排除界右/下 +1）且逐格带 vid——炸弹 28 @hb64', () => {
    const w = new World(120, 120, 30, 'open');
    const cuts: Array<[number, number, number | undefined]> = [];
    const g = cutShell(w, cuts);
    g.explodeAt(30, 30, 100, 3, false, 64, 0, 28);   // destroyTiles=false 割面单刀位
    // 爆心=格中心 30*16+8=488 → 盒 [424,552) → x0=floor(424/16)=26, x1=floor(552/16)+1=34+1=35（排除界）
    const x0 = Math.floor((30 * TILE + 8 - 64) / TILE);
    const x1 = Math.floor((30 * TILE + 8 + 64) / TILE) + 1;
    const expected: Array<[number, number]> = [];
    for (let ix = x0; ix < x1; ix++) for (let iy = x0; iy < x1; iy++) expected.push([ix, iy]);
    expect(cuts.length).toBe(expected.length);
    const got = new Set(cuts.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of expected) expect(got.has(`${x},${y}`), `${x},${y}`).toBe(true);
    expect(cuts.every(([, , vid]) => vid === 28)).toBe(true);   // vid 穿线（SW-BJ67 豁免面入口）
  });

  it('E2 盒随 hurtBox 缩放（手雷族 hb=11 → 2×2 格窗）——盒语义=实体伤害盒非地形半径', () => {
    const w = new World(120, 120, 30, 'open');
    const cuts: Array<[number, number, number | undefined]> = [];
    const g = cutShell(w, cuts);
    g.explodeAt(40, 40, 60, 3, false, 11, 0, 30);    // 手雷 30：Resize(22,22)→hb 11
    const cxPx = 40 * TILE + 8;
    const x0 = Math.floor((cxPx - 11) / TILE), x1 = Math.floor((cxPx + 11) / TILE) + 1;
    expect(cuts.length).toBe((x1 - x0) * (x1 - x0));  // 40*16+8=648 → floor(637/16)=39..floor(659/16)+1=42 → 3×3
    expect(x1 - x0).toBe(3);
  });

  it('E3 projId=0（无弹型纯格调用面）与 hurtBox=-1e9（无实体盒 sentinel）不割', () => {
    const w = new World(120, 120, 30, 'open');
    const cuts: Array<[number, number, number | undefined]> = [];
    const g = cutShell(w, cuts);
    g.explodeAt(30, 30, 0, 3, false, 64, 0, 0);       // projId 0
    expect(cuts.length).toBe(0);
    g.explodeAt(30, 30, 0, 10, true, -1e9, 0, 102);   // 1002/wiring 纯地形 face
    expect(cuts.length).toBe(0);
  });

  it('E4 真消费面：盒内 tileCut 草族经 Game.cutTile→breakTile 破除（单源复用零二套）', () => {
    const w = new World(120, 120, 30, 'open');
    const st = w.store;
    const GRASS = TILE_BY_KEY['v_3_forest_short_plants'];   // Main.tileCut 族（TILE_CUT_SHEETS 含 sheet 3）
    expect(TILE_DEFS[GRASS]?.vanilla?.sheet).toBe(3);
    st.setTileSilent(31, 30, GRASS, 0, 0);
    st.setTileSilent(31, 31, GRASS, 0, 0);
    const g = cutShell(w, []);
    // 真 cutTile（删桩）：草非 POT → TILE_CUT.has → breakTile 落;替代 stub 逐格记账
    (g as unknown as { cutTile: Game['cutTile'] }).cutTile = Game.prototype.cutTile;
    g.explodeAt(30, 30, 100, 3, false, 64, 0, 28);
    expect(st.get(31, 30)).toBe(0);                    // 盘外盒内草被割
    expect(st.get(31, 31)).toBe(0);
  });
});
