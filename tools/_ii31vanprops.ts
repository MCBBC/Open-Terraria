// IIII30 批一次性：导出 vanilla tile 性质表（solid/platform）给 python 模拟器
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const out: Record<string, { solid: boolean; top: boolean }> = {};
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { solid?: boolean; platform?: boolean; vanilla?: { sheet?: number } } | undefined;
  const s = d?.vanilla?.sheet;
  if (typeof s !== 'number' || s < 0) continue;
  out[s] = { solid: !!d!.solid, top: !!d!.platform };
}
writeFileSync('/tmp/iii31-out/vanprops.json', JSON.stringify(out));
console.log('sheets', Object.keys(out).length);
