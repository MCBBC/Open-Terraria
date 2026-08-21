import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from './caves-checkpoint.test';
it('hash', () => {
  const res = chainCheckpoints(process.env.SW_EE_SEED ?? '9293480', (process.env.SW_EE_EVIL ?? '0') as 0 | 1);
  const want = (process.env.SW_EE_HASH ?? 'corruption').split(',');
  for (const n of want) console.log(`HASH2 ${n} ${res.grids.get(n)}`);
  const golden = JSON.parse(readFileSync('/tmp/caves-sync-9293480.json', 'utf8')) as { checkpoints: string[] };
  for (const line of golden.checkpoints) {
    const [name, typ, act, , liq] = line.split(/[| ]+/);
    if (want.includes(name)) console.log(`ORAC ${name} ${typ} ${act} ${liq}`);
  }
}, 600000);
