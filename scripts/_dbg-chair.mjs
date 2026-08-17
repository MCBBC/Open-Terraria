// 诊断：白天坐椅场景 NPC 轨迹
import { World } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/World.ts';
import { TownNPC } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/TownNPC.ts';
import { TILE_BY_KEY } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles.ts';

const DIRT = TILE_BY_KEY['dirt'];
const CHAIR = TILE_BY_KEY['chair'];
const F = 100;
const world = new World(200, 200, 100, 'dbg');
for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, F, DIRT);
world.clock.timeOfDay = 0.5;
world.store.setTileSilent(110, F - 2, CHAIR, 0, 0);
world.store.setTileSilent(110, F - 1, CHAIR, 0, 18);
const npc = new TownNPC('guide', 104 * 16, F * 16);
const game = {
  world, player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, sitting: false },
  enemies: () => [], npcs: () => [npc], critters: () => [],
  spawnTownShot: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
  playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
  achievements: { notifyProgressionEvent: () => {} },
};
const seq = [0.9, 0.9, 0];
let i = 0;
npc.rng = () => seq[i++ % 3];
let n = 0;
for (let t = 0; t < 600 && !npc.sitting; t++) {
  npc.fixedUpdate(1 / 60, game);
  if (t % 40 === 0) console.log(`t=${t} col=${(npc.cx / 16).toFixed(1)} vx=${npc.vx.toFixed(2)} facing=${npc.facing} walking=${npc.walking} social=${npc.socialKind} frame=${npc.frame}`);
  n++;
}
console.log('sitting =', npc.sitting, 'col=', (npc.cx / 16).toFixed(2), 'ticks=', n, 'anchorCol=', npc.home ? 'home' : 'anchor?');
