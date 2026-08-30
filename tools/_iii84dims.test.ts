// IIII84 迷你探针：批量打印 .wld 头部元数据（version/尺寸/seed/dungeon/gl）。
// 用法：cd game && SW84_WLD='/p1/w.wld:/p2/w.wld' npx vitest run tools/_iii84dims.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW84_WLD;

(RUN ? it : it.skip)('III84 wld dims', () => {
  for (const p of process.env.SW84_WLD!.split(':')) {
    if (!p || !exists(p)) continue;
    try {
      const buf = readFileSync(p);
      const w = parseWld(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      console.log(`WLD ${p} v=${w.version} ${w.tilesWide}x${w.tilesHigh} seed="${w.seed}" dun=${w.dungeonX},${w.dungeonY} spawn=${w.spawnX},${w.spawnY} gl=${w.groundLevel} rock=${w.rockLevel} crimson=${w.isCrimson} id=${w.worldId}`);
    } catch (e) {
      console.log(`WLD ${p} ERROR ${e}`);
    }
  }
});

function exists(p: string): boolean {
  try { return readFileSync(p).length > 0; } catch { return false; }
}
