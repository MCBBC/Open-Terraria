// WWW 附带任务·underworld 检查点红差仲裁（SW_ARB=1）：
// JS 链 underworld 检查点 vs ①陈旧金标 tests/golden（8/17 17:02，早于 KKK 8/18 float32 修复）
// vs ②新鲜 oracle（RRR 干跑 /tmp/caves-dry-9293480.json，8/18 11:24）。
// 若 vs② 也红 = 真债；若仅 vs① 红 = 金标陈旧伪红（备案终局再生，勿动金标）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const RUN = process.env.SW_ARB === '1';

(RUN ? it : it.skip)('underworld checkpoint arbitration', () => {
  const parse = (f: string) => {
    const j = JSON.parse(readFileSync(f, 'utf8')) as { checkpoints: string[] };
    const m = new Map<string, string>();
    for (const line of j.checkpoints) {
      const [name, typ, act, wal, liq] = line.split(/[| ]+/);
      m.set(name, `${typ} ${act} ${liq}`);
    }
    return m;
  };
  const stale = parse(fileURLToPath(new URL('../tests/golden/caves-chain-9293480.json', import.meta.url)));
  const fresh = parse('/tmp/caves-dry-9293480.json');
  const ours = chainCheckpoints('9293480', 0).grids;
  const names = ['webs', 'underworld', 'corruption', 'lakes', 'slush', 'mcopenings', 'beaches',
    'gems', 'gravitatingsand', 'oceancaves', 'shimmer', 'dirtwallcleanup'];
  for (const n of names) {
    const jsv = ours.get(n);
    const vsStale = jsv === stale.get(n) ? '✓' : '✗';
    const vsFresh = jsv === fresh.get(n) ? '✓' : '✗';
    console.log(`${n.padEnd(16)} vs陈旧=${vsStale} vs新鲜=${vsFresh}  js=${jsv}`);
    if (vsStale !== vsFresh) console.log(`   stale=${stale.get(n)} fresh=${fresh.get(n)}`);
  }
}, 400_000);
