import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { exportWld } from '../src/wld/WldExport';
import { rleTiles, rlePairs, bytesToB64 } from '../src/save/SaveFile';
import { combineHalfSlope } from '../src/wld/WldImport';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';
const W = 40, H = 30;
it('gen', () => {
  const n = W * H;
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) { type[y * W + x] = 1; frameX[y * W + x] = 18; }
  const save = {
    format: 'sandboxworld.save', version: 5,
    header: { name: '红队E2E世界', seed: 999, width: W, height: H, spawn: [20, 14], groundLevel: 15, rockLevel: 20,
      created: 1700000000000, playTimeMs: 0, dungeonX: 5, dungeonY: 5, crimson: false, difficulty: 0,
      treeX: [10, 20, 30], treeStyle: [0, 0, 0, 0], bgStyles: { cave: [0, 0, 0, 0], ice: 0, jungle: 0, hell: 0 } },
    clock: { timeOfDay: 0.3, dayCount: 1, moonPhase: 0 },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(new Uint16Array(n))),
    liquid: bytesToB64(rlePairs(new Uint16Array(n))),
    liquidType: bytesToB64(rlePairs(new Uint16Array(n))),
    wire: bytesToB64(rlePairs(new Uint16Array(n))),
    blocks: bytesToB64(rlePairs(combineHalfSlope(new Uint8Array(n), new Uint8Array(n)))),
    paint: bytesToB64(rlePairs(new Uint8Array(n))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(n))),
    coat: bytesToB64(rlePairs(new Uint8Array(n))),
    chests: [], npcs: [], flags: {},
  };
  writeFileSync('/tmp/red-team.wld', exportWld(save as never));
  console.log('WLDGEN done');
});
