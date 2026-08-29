import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
it('i49 wld info', () => {
  const w = parseWld(Uint8Array.from(readFileSync('/tmp/iii48-out/x86-celeb-clean/w.wld')));
  console.log('I49WLD', JSON.stringify({
    v: w.version, w: w.tilesWide, h: w.tilesHigh, gl: w.groundLevel, rl: w.rockLevel,
    dx: w.dungeonX, dy: w.dungeonY, seedText: w.seed,
    nchests: w.chests.length,
    chestFirst: w.chests.slice(0, 8).map((c) => [c.x, c.y]),
  }));
});
