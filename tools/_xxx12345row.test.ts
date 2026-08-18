// XXX 批副产物：s12345 基线锚点行生成（matrix-anchors.tsv 补行用）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { translateSeed } from '../src/core/rng';

const RUN = !!process.env.SW_X12345;

(RUN ? it : it.skip)('s12345 anchors row', () => {
  const w = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
  console.log([
    's12345.wld', 's', '12345', w.isCrimson ? 1 : 0,
    w.groundLevel, w.rockLevel, w.worldId, w.moonType, w.dungeonX, w.dungeonY, w.spawnX,
    translateSeed('12345'), 18,
  ].join('\t'));
});
