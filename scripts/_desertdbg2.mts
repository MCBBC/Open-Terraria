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
// 直接驱动 setFlags(200,223) 2000 次,统计沙漠旗标
let flagged = 0;
for (let i = 0; i < 2000; i++) {
  (sp['setFlagsForChosenTile'] as (a: number, b: number, c: number, r: RNG) => void).call(sp, 200, 223, 1, new RNG(i * 31 + 7));
  if (sp['spawnUndergroundDesert']) flagged++;
  sp['spawnUndergroundDesert'] = false;
}
console.log('direct setFlags(200,223) flag rate:', flagged, '/2000');
// 墙抽查
console.log('wall(200,226)=', st.wall[st.idx(200, 226)], 'wall(210,240)=', st.wall[st.idx(210, 240)]);
process.exit(0);
