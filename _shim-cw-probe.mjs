import { World } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/World.ts';
import { TILE } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/core/constants.ts';
import { Player } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/Player.ts';
import { Inventory } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/items/Inventory.ts';
import { CounterweightProj } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/WeaponProj.ts';

const w = new World(120, 160, 30, 'open');
for (let x = 30; x <= 40; x++) for (let y = 60; y <= 70; y++) {
  const i = w.store.idx(x, y); w.store.liquid[i] = 100; w.store.liquidType[i] = 4;
}
const pl = new Player(508, 1010, new Inventory());
const g = {
  world: w, player: pl,
  enemies: () => [], critters: () => [], npcs: () => [],
  spawnDust: () => ({ vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null }),
  playSfxWav: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
  spawnParticles: () => {}, cutTile: () => {}, spawnDrop: () => null, damagePlayer: () => 0,
  addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  notifyInventoryChanged: () => {}, mapFullscreen: () => false,
  spawnFriendlyProj: () => {}, addLightAt: () => {},
};
const cw = new CounterweightProj(520, 1024, 10, 1, 556, 0, {
  owner: () => pl, channel: () => true, yoyoInPlay: () => true, mouseDelta: () => ({ dx: 0, dy: 0 }),
});
cw.ai0 = -2; cw.vy = 10;
cw.fixedUpdate(1 / 60, g);
console.log('ai0=', cw.ai0, 'vy=', cw.vy, 'dead=', cw.dead, 'wet=', cw.wet, 'shimmerWet=', cw.shimmerWet, 'x=', cw.x, 'y=', cw.y);
