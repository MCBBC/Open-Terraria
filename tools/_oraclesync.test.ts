// oracle 同步批（2026-08-17）对拍 rig：JS chainCheckpoints vs 新跑 caves-oracle 输出
//（/tmp/caves-sync-*.json——金标零写入纪律下以 /tmp 产物裁决）。SW_PARITY 门控。
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const run = process.env.SW_PARITY === '1';
const describeOrSkip = run ? describe : describe.skip;

const cases = [
  { file: '/tmp/caves-sync-9293480.json', seedText: '9293480', evil: 0 as const },
  { file: '/tmp/caves-sync-1511931452.json', seedText: '1511931452', evil: 1 as const },
];

describeOrSkip('oracle 同步批 JS↔新 oracle 对拍', () => {
  for (const c of cases) {
    it(`种子 ${c.seedText}：逐检查点 typ/act/liq 对拍`, async () => {
      const golden = JSON.parse(readFileSync(c.file, 'utf8')) as { checkpoints: string[] };
      const gold = new Map<string, string>();
      const goldWall = new Map<string, string>();
      for (const line of golden.checkpoints) {
        const [name, typ, act, wal, liq] = line.split(/[| ]+/);
        gold.set(name, `${typ} ${act} ${liq}`);
        goldWall.set(name, wal);
      }
      const res = chainCheckpoints(c.seedText, c.evil);
      const names = [...gold.keys()];
      let firstBad = '';
      let green = 0, red = 0;
      for (const n of names) {
        const ok = res.grids.get(n) === gold.get(n);
        if (ok) green++; else { red++; if (!firstBad) firstBad = n; }
        console.log(`${n.padEnd(20)} ${ok ? '✓' : '✗'} ${res.grids.get(n)} vs ${gold.get(n)}`);
      }
      for (const n of ['desertentrance', 'deserthive', 'desertdone']) {
        const ok = res.walls.get(n) === goldWall.get(n);
        if (ok) green++; else { red++; if (!firstBad) firstBad = `${n}:wall`; }
        console.log(`${`${n}:wall`.padEnd(20)} ${ok ? '✓' : '✗'}`);
      }
      console.log(`== seed ${c.seedText}: green=${green} red=${red} firstBad=${firstBad || '(none)'}`);
    }, 600000);
  }
});
