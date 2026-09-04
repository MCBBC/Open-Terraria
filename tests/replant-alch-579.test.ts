// ★③（2026-09-05 579 拒种批）：法杖补种走 PlaceAlch 门回归。
//
// 原版链：药草采收（Player.cs:41583-41612：KillTile 后 TryReplantingHerbs(herbStyle)）
// → TryReplantingHerbs（Player.cs:46213-46218）：下格 active 且 type∈{78 陶盆,380 种植箱,
// 579 石魔像头} → WorldGen.PlaceTile(x,y,82,...,herbStyle) → PlaceTile default 支
// （WorldGen.cs:60666-60670）→ Main.tileAlch → PlaceAlch（WorldGen.cs:45776-45867）。
// PlaceAlch 基座白名单按 style 逐表（0:{2,477,492,78,380,109}/1:{60,78,380}/2:{0,59,78,
// 380}/3:{661,662,203,199,23,25,78,380}/4:{53,78,380,116}/5:{57,633,78,380}/6:{78,380,
// 147,161,163,164,200}）——**579 不在任何 style 白名单** → PlaceTile false → 静默无补种。
// 本仓 placeAlchRuntime（Game.ts,种子放置批落）=PlaceAlch 1:1；此前采收补种直写
// st.setTile(82) 绕门 → 579 基座上"补种成功"=偏差,本批改走 placeAlchRuntime。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';

const staffIdx = ITEM_DEFS.findIndex((d) => /^vi_213_/.test(d.key));   // 再生法杖 213
const HERB = TILE_BY_KEY['v_83_herbs_mature'];
const BLOOM = TILE_BY_KEY['v_84_herbs_bloom'];
const SPROUT = TILE_BY_KEY['v_82_herbs_sprout'];
const POT = TILE_BY_KEY['clay_pot'];                 // tile 78 陶盆
const HEAD = TILE_BY_KEY['v_579_rock_golem_head'];   // tile 579 石魔像头

interface Shell {
  interactAt(tx: number, ty: number): void;
  placeAlchRuntime(x: number, y: number, style: number): boolean;
}

function shell(w: World, drops: Array<[string, number]>): Shell {
  const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
  g.world = w;
  g.input = { rightDown: true };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, stack: number) => { drops.push([key, stack]); };
  g.player = { inv: { heldItem: () => ({ id: staffIdx }) } };
  g.inTileRange = () => true;
  g.netCanEditTile = () => true;
  g.isAlchemyPlantHarvestable = () => true;    // style0 成熟株可采收（谓词本体非本批对象）
  g.wiring = undefined;
  return g;
}

describe('③ 法杖补种 = PlaceTile(82)→PlaceAlch 门（579 拒/380 纳）', () => {
  it('579 石魔像头基座：采收后不回种（PlaceAlch 白名单拒置,原版静默）', () => {
    const w = new World(40, 40, 7, 'replant-579');
    const st = w.store;
    st.setTileSilent(20, 31, HEAD, 0, 0);
    st.setTileSilent(20, 30, HERB, 0, 0);           // style0 成熟药草
    const drops: Array<[string, number]> = [];
    shell(w, drops).interactAt(20, 30);
    expect(st.type[st.idx(20, 30)]).toBe(0);        // 采收照常
    expect(st.type[st.idx(20, 31)]).toBe(HEAD);
    expect(drops.length).toBe(2);                   // 草 + 种子照掉
    // ★拒种：placeAlchRuntime 直接核门（579 不在 style0 白名单 {2,477,492,78,380,109}）
    const g2 = shell(w, []);
    expect(g2.placeAlchRuntime(20, 30, 0)).toBe(false);
    expect(st.type[st.idx(20, 30)]).toBe(0);
  });

  it('380 种植箱基座：采收后原地回种 82 苗（frameX=style×18）', () => {
    const w = new World(40, 40, 7, 'replant-380');
    const st = w.store;
    st.setTileSilent(20, 31, POT, 0, 0);
    st.setTileSilent(20, 30, BLOOM, 5 * 18, 0);     // style5 开花株
    const drops: Array<[string, number]> = [];
    shell(w, drops).interactAt(20, 30);
    expect(st.type[st.idx(20, 30)]).toBe(SPROUT);   // ★回种
    expect(st.frameX[st.idx(20, 30)]).toBe(5 * 18); // PlaceAlch frameX=18*style（:45866）
    expect(st.frameY[st.idx(20, 30)]).toBe(0);
    expect(drops.length).toBe(2);
  });

  it('placeAlchRuntime 白名单边界：78/380 纳入;579 全 style 拒', () => {
    const w = new World(40, 40, 7, 'replant-gate');
    const st = w.store;
    const g = shell(w, []);
    st.setTileSilent(10, 11, POT, 0, 0);
    expect(g.placeAlchRuntime(10, 10, 0)).toBe(true);
    st.setTileSilent(12, 11, POT, 0, 0);
    expect(g.placeAlchRuntime(12, 10, 5)).toBe(true);      // 78 ∈ 全部 style 白名单
    st.setTileSilent(14, 11, HEAD, 0, 0);
    for (let style = 0; style <= 6; style++) {
      st.setTileSilent(14, 10, 0, 0, 0);
      expect(g.placeAlchRuntime(14, 10, style)).toBe(false);   // ★579 全 style 拒
    }
  });
});
