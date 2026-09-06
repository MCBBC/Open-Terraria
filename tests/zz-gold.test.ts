import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
it('gold-trace', () => {
  const b = readFileSync('/Users/vinlic/Library/Application Support/Terraria/Worlds/GoldTest.wld');
  try { parseWld(new Uint8Array(b)); } catch (e) {
    const m = String(e).match(/WHDR .*/);
    if (m) throw new Error(m[0]); throw e;
  }
});
