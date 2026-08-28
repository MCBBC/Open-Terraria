// 一次性调试输出（跑完即删）
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ensureExtraSpawnPoints } from '../src/world/spawn/ExtraSpawnsRoyale';
import { scanZonesForDualDungeon, emptyDualZoneScan, solidTile3DD } from '../src/world/DungeonDualZones';

function mk(dd: boolean, royale = false) {
  const W = 1200, H = 900;
  const st = new TileStore(W, H);
  const w = new World(W, H, 424242, 't');
  w.store = st;
  w.groundLevel = 548; w.rockLevel = 760;
  w.spawnX = 600; w.spawnY = 560; w.spawnX0 = 600; w.spawnY0 = 560;
  const flags: Record<string, boolean> = {};
  if (royale) flags.teamBasedSpawns = true;
  if (dd) flags.dualDungeons = true;
  w.seedFlags = flags as typeof w.seedFlags;
  const dirt = TILE_BY_KEY['dirt'];
  for (let x = 0; x < W; x++) for (let y = 500; y < H - 5; y++) st.setTileSilent(x, y, dirt);
  return { w, st };
}

describe('III23 debug', () => {
  it('print royale points', () => {
    const { w } = mk(false, true);
    const pts = ensureExtraSpawnPoints(w);
    console.log('POINTS', JSON.stringify(pts));
    const G=(globalThis as unknown as{__iiilog?:unknown[],__iii23dbg?:boolean}); G.__iii23dbg=true;
    const pts2 = (()=>{ // 重跑一次带钩子（新 world 同种子）
      const w2m=(()=>{const W=1200,H=900;const st=new TileStore(W,H);const w=new World(W,H,424242,'t');w.store=st;
        w.groundLevel=548;w.rockLevel=760;w.spawnX=600;w.spawnY=560;w.spawnX0=600;w.spawnY0=560;
        (w.seedFlags as Record<string,boolean>)={teamBasedSpawns:true};
        const d=TILE_BY_KEY['dirt'];for(let x=0;x<W;x++)for(let y=500;y<H-5;y++)st.setTileSilent(x,y,d);
        return w;})();
      return require('../src/world/spawn/ExtraSpawnsRoyale').ensureExtraSpawnPoints(w2m);})();
    console.log('HOOKS', JSON.stringify(G.__iiilog));
    // 直接复算 acceptance 分离判定：两点间距（用于对拍测试哨兵）
    for (let i=1;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
      const dx=Math.abs(pts[i].x-pts[j].x), dy=Math.abs(pts[i].y-pts[j].y);
      console.log(`sep ${i}-${j} dx=${dx} dy=${dy} viol=${(dx<250&&dy<250)?'YES':'no'}`);
    }
    console.log('ground', w.groundLevel, 'seed', w.seed);
    expect(pts.length).toBe(6);
  });

  it('print dd cell results', () => {
    const { w, st } = mk(true);
    const put = (key: string, x: number) => {
      const tid = TILE_BY_KEY[key];
      for (let y = 820; y <= 850; y++) st.setTileSilent(x, y, tid);
    };
    put('v_41_blue_brick', 100);
    put('mud', 600); for (let y = 819; y <= 851; y++) st.wall[st.idx(600, y)] = 204;
    put('sandstone', 700); for (let y = 819; y <= 851; y++) st.wall[st.idx(700, y)] = 216;
    console.log('solid100', solidTile3DD(st, 100, 840));
    console.log('sheetMud', TILE_DEFS[TILE_BY_KEY['mud']].vanilla?.sheet,
      'sheet41', TILE_DEFS[TILE_BY_KEY['v_41_blue_brick']].vanilla?.sheet,
      'sheetSand', TILE_DEFS[TILE_BY_KEY['sandstone']].vanilla?.sheet,
      'wall600@839', st.wall[st.idx(600, 839)],
      'wall700@839', st.wall[st.idx(700, 839)]);
    let s = emptyDualZoneScan();
    console.log('jungleHit', scanZonesForDualDungeon(st, 600, 840, 760, s), JSON.stringify(s));
    s = emptyDualZoneScan();
    console.log('desertHit', scanZonesForDualDungeon(st, 700, 840, 760, s), JSON.stringify(s));
    expect(true).toBe(true);
  });
});
