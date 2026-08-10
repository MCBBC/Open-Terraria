import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner.ts';
import { RNG } from '../src/core/rng.ts';

const st = new TileStore(400, 400);
const world = new World(400, 400, 1, 't');
world.store = st;
world.groundLevel = 80;
world.rockLevel = 300;
for (let x = 0; x < 400; x++) for (let y = 0; y < 400; y++) { st.setTileSilent(x, y, 1); st.wall[st.idx(x, y)] = 2; }
for (let x = 150; x <= 260; x++) for (let y = 220; y <= 222; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 0; }
for (let x = 190; x < 230; x++) for (let y = 226; y < 246; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 216; }
const sp = new VanillaSpawner(world) as unknown as Record<string, unknown>;
const txHist = new Map<number, number>();
const tyHist = new Map<number, number>();
let flagged = 0, okCount = 0;
for (let i = 0; i < 2000; i++) {
  const e = (sp.spawn as (a: number, b: number, c: RNG, d: number, f: number) => unknown).call(sp, 200 * 16 + 8, 223 * 16 + 8, new RNG(i * 7919 + 101), 40, 25);
  const tx = sp['spawnTileX'] as number, ty = sp['spawnTileY'] as number;
  if (tx === 0 && ty === 0) continue;
  okCount++;
  txHist.set(tx, (txHist.get(tx) ?? 0) + 1);
  tyHist.set(ty, (tyHist.get(ty) ?? 0) + 1);
  if (sp['spawnUndergroundDesert']) flagged++;
}
const txArr = [...txHist.entries()].sort((a, b) => a[0] - b[0]);
console.log('ok:', okCount, 'flagged:', flagged);
console.log('tx hist:', txArr.map(([x, n]) => `${x}:${n}`).join(' '));
console.log('ty hist:', [...tyHist.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}:${n}`).join(' '));
process.exit(0);
