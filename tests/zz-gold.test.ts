import { it } from 'vitest';
import { parseWld } from '../src/wld/WldParser';
import { readLocalFixture, localFixtureMissing } from './fixturePath';
// ★C档收编:原本机 Terraria 存档目录 GoldTest.wld → tests/fixtures/local(zz-gold-test.wld)
it.skipIf(localFixtureMissing('zz-gold-test.wld'))('gold-trace', () => {
  const b = readLocalFixture('zz-gold-test.wld');
  try { parseWld(new Uint8Array(b)); } catch (e) {
    const m = String(e).match(/WHDR .*/);
    if (m) throw new Error(m[0]); throw e;
  }
});
