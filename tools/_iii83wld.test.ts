// IIII83：真值 w.wld 头部读取（dungeonX/Y = 沙漠对侧定罪用）
import { it } from 'vitest';
const RUN = process.env.SW_III83_WLD === '1';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

(RUN ? it : it.skip)('w.wld header oracle', () => {
  for (const p of ['/tmp/iii82-out/x86-gfb-a/w.wld', '/tmp/rrrr-out/x86-g/w.wld']) {
    const w = parseWld(new Uint8Array(readFileSync(p)));
    console.log(`${p.split('/').slice(-2, -1)[0]}: dungeon=(${w.dungeonX},${w.dungeonY}) spawn=(${w.spawnX},${w.spawnY}) ground=${w.groundLevel} rock=${w.rockLevel} seed=${w.seed} flags=${JSON.stringify(w.seedFlags)}`);
  }
});
