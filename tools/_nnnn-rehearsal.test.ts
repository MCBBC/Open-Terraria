// NNNN 批彩排（用毕即删）：caves-checkpoint 口径 vs /tmp 新跑 oracle（tests/golden 零写）。
// 名称表=tests/caves-checkpoint.test.ts :365-383 原样（dirtlayer/rocklayer 不在表）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const run = process.env.SW_PARITY === '1';
const describeOrSkip = run ? describe : describe.skip;

const cases = [
  { file: '/tmp/caves-sync-9293480.json', seedText: '9293480', evil: 0 as const },
  { file: '/tmp/caves-sync-1511931452.json', seedText: '1511931452', evil: 1 as const },
];

describeOrSkip('NNNN 彩排：caves-checkpoint 口径 vs /tmp 新 oracle', () => {
  for (const c of cases) {
    it(`种子 ${c.seedText}`, () => {
      const golden = JSON.parse(readFileSync(c.file, 'utf8')) as { checkpoints: string[] };
      const gold = new Map<string, string>();
      const goldWall = new Map<string, string>();
      for (const line of golden.checkpoints) {
        const [name, typ, act, wal, liq] = line.split(/[| ]+/);
        gold.set(name, `${typ} ${act} ${liq}`);
        goldWall.set(name, wal);
      }
      const res = chainCheckpoints(c.seedText, c.evil);
      const names = ['terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels',
        'mountaincaves', 'dirtwallbg', 'rocksclay', 'smallholes', 'surfacecaves',
        'icebiome', 'grass', 'jungle', 'mudcaves', 'desertmound',
        'desertentrance', 'deserthive', 'desertdone',
        'mushroom', 'marble', 'granite', 'islands', 'dirttomud', 'silt', 'ores',
        'webs', 'underworld', 'corruption', 'lakes', 'slush',
        'dungeonL', 'dungeonE', 'dungeonPD', 'dungeonPi', 'dungeonS', 'dungeonD',
        'dungeonW', 'dungeonP', 'dungeonC', 'dungeonB', 'dungeonG', 'dungeonI',
        'dungeonT', 'dungeonF', 'dungeonPa', 'dungeonBa', 'dungeon',
        'mcopenings', 'beaches',
        'gems', 'gravitatingsand', 'oceancaves',
        'shimmershell', 'shimmerpillars', 'shimmeropen', 'shimmer',
        'dirtwallcleanup', 'pyramids', 'dirtrockwallrunner',
        'livingtrees', 'livingtreewalls', 'altars', 'surfacewaterinjungle',
        'statues', 'cavewalls', 'undergroundjungletrees', 'quickcleanup',
        'beehives', 'piles', 'trees', 'settle2', 'cactus', 'microbiomes'];
      let firstBad = '';
      for (const n of names) {
        if (res.grids.get(n) !== gold.get(n) && !firstBad) firstBad = n;
        console.log(`${n.padEnd(14)} ${res.grids.get(n)} vs ${gold.get(n)} ${res.grids.get(n) === gold.get(n) ? '✓' : '✗'}`);
      }
      for (const n of ['desertentrance', 'deserthive', 'desertdone']) {
        const ok = res.walls.get(n) === goldWall.get(n);
        if (!ok && !firstBad) firstBad = `${n}:wall`;
        console.log(`${`${n}:wall`.padEnd(14)} ${res.walls.get(n)} vs ${goldWall.get(n)} ${ok ? '✓' : '✗'}`);
      }
      console.log(`== rehearsal seed ${c.seedText}: firstBad=${firstBad || '(none)'}`);
    }, 600000);
  }
});
