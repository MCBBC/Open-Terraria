// RECON-CONST 一次性对拍（用完即删）：
// 原版 The Constant 小世界(/tmp/sw-const-recon/const_s.wld, 7904 基线)
// vs JS generateWorld(seedText:'constant')。
// 产出：头锚四通道差异 + Constant 特征对象计数（双方）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = !!process.env.SW_CONSTRECON;

const countTiles = (type: Uint16Array, active: Uint8Array, id: number, n: number) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (active[i] === 1 && type[i] === id) c++;
  return c;
};
const countWall = (wall: Uint16Array, id: number, n: number) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (wall[i] === id) c++;
  return c;
};

(RUN ? it : it.skip)('constant recon', async () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/sw-const-recon/const_s.wld')));
  console.log('[WLD header]', JSON.stringify({
    v: wld.version, w: wld.tilesWide, h: wld.tilesHigh, seed: wld.seed,
    isCrimson: wld.isCrimson, gameMode: wld.gameMode,
    spawn: [wld.spawnX, wld.spawnY], dungeon: [wld.dungeonX, wld.dungeonY],
    groundLevel: wld.groundLevel, rockLevel: wld.rockLevel,
    moonType: wld.moonType, worldId: wld.worldId,
    treeX: wld.treeX, treeStyle: wld.treeStyle, caveBackX: wld.caveBackX, caveBackStyle: wld.caveBackStyle,
  }));

  const world = await generateWorld({ size: 0, seedText: 'constant', name: 'const' });
  const st = world.store;
  const W = wld.tilesWide, H = wld.tilesHigh, n = W * H;
  console.log('[JS ]', st.w, 'x', st.h, 'spawn', world.spawnX, world.spawnY,
    'flags', JSON.stringify(world.seedFlags), 'crimson', world.crimson);

  // ---- 四通道 ----
  let act = 0, typ = 0, wal = 0, liq = 0, firstAct = -1, firstTyp = -1, firstWal = -1;
  const pairs: Record<string, number> = {};
  const a = wld.tiles.active, t = wld.tiles.type, wa = wld.tiles.wall, l = wld.tiles.liquid;
  for (let i = 0; i < n; i++) {
    const va = a[i] === 1, vb = (st.flags[i] & 1) === 1;
    if (va !== vb) { act++; if (firstAct < 0) firstAct = i; }
    if (va && vb && t[i] !== st.type[i]) {
      typ++;
      const k = `${t[i]}>${st.type[i]}`; pairs[k] = (pairs[k] ?? 0) + 1;
      if (firstTyp < 0) firstTyp = i;
    }
    if (wa[i] !== st.wall[i]) { wal++; if (firstWal < 0) firstWal = i; }
    if (l[i] !== st.liquid[i]) liq++;
  }
  const fx = (i: number) => i < 0 ? -1 : i % W;
  const fy = (i: number) => i < 0 ? -1 : (i / W) | 0;
  console.log('[4ch] actDiff=%d(first %d,%d) typeDiff=%d(first %d,%d) wallDiff=%d(first %d,%d) liqDiff=%d',
    act, fx(firstAct), fy(firstAct), typ, fx(firstTyp), fy(firstTyp), wal, fx(firstWal), fy(firstWal), liq);
  console.log('[type pairs top10]', Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 10));

  // ---- Constant 特征对象计数（vanilla vs JS）----
  const jAct = new Uint8Array(n);
  for (let i = 0; i < n; i++) jAct[i] = st.flags[i] & 1;
  const feats: Array<[string, number, number]> = [
    ['tile367_marble', countTiles(t, a, 367, n), countTiles(st.type, jAct, 367, n)],
    ['tile191_granite', countTiles(t, a, 191, n), countTiles(st.type, jAct, 191, n)],
    ['wall62_spider', countWall(wa, 62, n), countWall(st.wall, 62, n)],
    ['wall63_grassUnsafe', countWall(wa, 63, n), countWall(st.wall, 63, n)],
    ['tile48_spikes', countTiles(t, a, 48, n), countTiles(st.type, jAct, 48, n)],
    ['tile232_woodenSpikes', countTiles(t, a, 232, n), countTiles(st.type, jAct, 232, n)],
    ['tile85_tombstone', countTiles(t, a, 85, n), countTiles(st.type, jAct, 85, n)],
    ['tile6_iron', countTiles(t, a, 6, n), countTiles(st.type, jAct, 6, n)],
    ['tile167_lead', countTiles(t, a, 167, n), countTiles(st.type, jAct, 167, n)],
    ['tile8_gold', countTiles(t, a, 8, n), countTiles(st.type, jAct, 8, n)],
    ['tile169_platinum', countTiles(t, a, 169, n), countTiles(st.type, jAct, 169, n)],
    ['tile7_copper', countTiles(t, a, 7, n), countTiles(st.type, jAct, 7, n)],
    ['tile166_tin', countTiles(t, a, 166, n), countTiles(st.type, jAct, 166, n)],
  ];
  for (const [k, v, j] of feats) console.log('[feat]', k, 'vanilla=', v, ' js=', j);

  // ---- 对象计数 ----
  console.log('[obj] wld chests=', wld.chests.length, ' npcs=', wld.npcs.length,
    JSON.stringify(wld.npcs.map((x: any) => x.spriteId)));
  const jsChests = (world as any).chests?.length ?? 0;
  console.log('[obj] js chests=', jsChests, ' npcs=', (world as any).npcs?.length ?? 'n/a');
}, 600_000);
