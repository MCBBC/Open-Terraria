// IIII61 一次性仪 v2：Dungeon pass 主流值流窗口（dungeonL..dungeonW）单实例捕获
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I61ROLLS === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';

(RUN ? it : it.skip)('iii61 roll-window', async () => {
  const g = globalThis as unknown as { __wvLines?: string[]; __swWvLog?: unknown };
  g.__wvLines = [];
  g.__swWvLog = '/tmp/iii61-out/wv-rolls-log.tmp';
  const ids = new Map<object, number>();
  const idOf = (o: object): number => {
    let v = ids.get(o);
    if (v === undefined) { v = ids.size + 1; ids.set(o, v); }
    return v;
  };
  let phase: 'pre' | 'open' | 'closed' = 'pre';
  let mainInstId = -1;
  let scanLen = 0;
  const arr: number[] = [];
  const marks: Array<[string, number]> = [];
  (globalThis as unknown as { __swOnRoll?: (value: number, inst: object) => void }).__swOnRoll =
    (value: number, inst: object) => {
      const L = g.__wvLines!;
      while (scanLen < L.length) {
        const ln = L[scanLen++];
        if (ln.startsWith('MARK|')) {
          if (phase === 'open') marks.push([ln.slice(5), arr.length]);
          if (ln.startsWith('MARK|dungeonL') && phase === 'pre') { phase = 'open'; marks.push(['OPEN', arr.length]); }
          else if (ln.startsWith('MARK|dungeonW') && phase === 'open') { phase = 'closed'; marks.push(['CLOSE', arr.length]); }
        }
      }
      if (phase !== 'open') return;
      const id = idOf(inst);
      if (mainInstId < 0) mainInstId = id;
      if (id !== mainInstId) return;
      arr.push(value >>> 0);
    };
  await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: -1, seedFlags: { drunkWorld: true } });
  console.log(`[i61rolls] len=${arr.length} mainId=${mainInstId}`);
  for (const [m, n] of marks) console.log(`[i61rollsmark] ${m} @${n}`);
  writeFileSync('/tmp/iii61-out/js-rolls32.txt', arr.join('\n') + '\n');
}, 900_000);
