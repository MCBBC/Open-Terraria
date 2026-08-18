// AAAA 批：s12345（evil=1）逐检查点 JS↔C# caves-oracle 首分歧定位。
// 金标链：/tmp/aaaa-oracle/s12345-chain.json（dotnet caves-oracle.cs 12345 1）。
// 输出：每检查点 typ/act/liq 三元组 + wall（desertmound 起）是否相等；
//       首个不等段及其后 5 段；SW_STREAM_PROBE=1 时附流指纹（与 oracle STREAM_PRINT 对拍）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const RUN = process.env.SW_AAAACHAIN === '1';
const CHAIN = process.env.SW_AAAACHAIN_JSON ?? '/tmp/aaaa-oracle/s12345-chain.json';
const NAMES = ['terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels',
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

(RUN ? it : it.skip)('s12345 chain first-divergence', async () => {
  const golden = JSON.parse(readFileSync(CHAIN, 'utf8')) as { checkpoints: string[] };
  const gold = new Map<string, string>();
  const goldWall = new Map<string, string>();
  for (const line of golden.checkpoints) {
    const [name, typ, act, wal, liq] = line.split(/[| ]+/);
    gold.set(name, `${typ} ${act} ${liq}`);
    goldWall.set(name, wal);
  }
  const t0 = Date.now();
  const res = chainCheckpoints('12345', 1);
  console.log(`chainCheckpoints 耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  let firstBad = '';
  for (const name of NAMES) {
    const g = gold.get(name), j = res.grids.get(name);
    const gw = goldWall.get(name), jw = res.walls.get(name);
    if (g === undefined || j === undefined) { console.log(`? ${name}: missing g=${!!g} j=${!!j}`); continue; }
    const gridEq = g === j;
    const wallEq = gw === jw;
    if (!gridEq || !wallEq) {
      console.log(`✗ ${name}: grids ${gridEq ? '=' : '≠'} (g=${g} j=${j}) wall ${wallEq ? '=' : `≠(g=${gw} j=${jw})`}`);
      if (!firstBad) firstBad = name;
    } else {
      console.log(`✓ ${name}`);
    }
  }
  console.log(`\n===== 首分歧段: ${firstBad || '（全绿）'} =====`);
}, 3_600_000);
