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
let flagged = 0, total = 0;
for (let i = 0; i < 2000; i++) {
  const e = (sp.spawn as (a: number, b: number, c: RNG, d: number, f: number) => unknown).call(sp, 200 * 16 + 8, 223 * 16 + 8, new RNG(i * 7919 + 101), 40, 25);
  total++;
  if (sp['spawnUndergroundDesert']) flagged++;
  if (i < 5) console.log(i, 'tile', sp['spawnTileX'], sp['spawnTileY'], 'flag', sp['spawnUndergroundDesert'], 'npc', (e as { vanillaId?: number } | null)?.vanillaId ?? null);
}
console.log({ total, flagged });
process.exit(0);
