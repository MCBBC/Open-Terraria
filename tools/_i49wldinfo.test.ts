import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用
(RUN ? it : it.skip)('i49 wld info', () => {
  const w = parseWld(Uint8Array.from(readFileSync('/tmp/iii48-out/x86-celeb-clean/w.wld')));
  console.log('I49WLD', JSON.stringify({
    v: w.version, w: w.tilesWide, h: w.tilesHigh, gl: w.groundLevel, rl: w.rockLevel,
    dx: w.dungeonX, dy: w.dungeonY, seedText: w.seed,
    nchests: w.chests.length,
    chestFirst: w.chests.slice(0, 8).map((c) => [c.x, c.y]),
  }));
});
