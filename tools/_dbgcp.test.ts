// 一次性诊断：JS↔oracle 检查点对拍（任意种子）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
it('seed checkpoints vs oracle', async () => {
  for (const seed of ['4444', '6666']) {
    const golden = JSON.parse(readFileSync(`/tmp/chain_${seed}.json`, 'utf8'));
    const gold = new Map<string, string>();
    for (const line of golden.checkpoints) {
      const [name, typ, act, wal, liq] = line.split(/[| ]+/);
      gold.set(name, `${typ} ${act} ${liq}`);
    }
    const res = chainCheckpoints(seed, 0 as const);
    const ours = res.grids;
    let firstBad = '';
    let badCount = 0;
    for (const [name, g] of gold) {
      const o = ours.get(name);
      const ok = o === g;
      if (!ok) { badCount++; if (!firstBad) firstBad = name; }
      console.log(`${seed} ${name.padEnd(24)} ${ok ? '✓' : '✗'} ${o} vs ${g}`);
    }
    console.log(`${seed} FIRST_BAD=${firstBad} BAD=${badCount}/${gold.size}`);
  }
}, 300000);
