// IIII109 房屋 attempt 台账（JS 侧）：挂 __swHouseEv 收集 UndergroundHouses 逐 attempt
// （x,y,ok），与 x86 SW_HOUSELOG 台账（H|x|y|res|rc）逐行对拍。
// 用法：SW109_HSEED='abandonedmanors|20260904' SW109_HFLAGS=biggerAbandonedHouses \
//   npx vitest run tools/_iii109houses.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const SEED = process.env.SW109_HSEED ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW109_HFLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const XPATH = process.env.SW109_HX ?? '';
const OUT = process.env.SW109_HOUT ?? '/tmp/iii109-out/houselog-js.txt';

(SEED ? it : it.skip)('III109 house attempt ledger (JS)', { timeout: 900_000 }, async () => {
  const ev: Array<[number, number, number]> = [];
  (globalThis as unknown as { __swHouseEv?: (phase: string, x: number, y: number) => void }).__swHouseEv =
    (phase: string, x: number, y: number) => {
      if (phase === 'ok') ev.push([x, y, 1]);
      else if (phase === 'no') ev.push([x, y, 0]);
    };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: 0,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
  });
  (globalThis as unknown as { __swHouseEv?: unknown }).__swHouseEv = undefined;
  const lines = ev.map(([x, y, r], i) => `H|${x}|${y}|${r}|${i + 1}`);
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`JS house attempts=${ev.length} ok=${ev.filter((e) => e[2] === 1).length} -> ${OUT}`);
  if (XPATH) {
    const xs = readFileSync(XPATH, 'utf8').split('\n').filter((l) => l.startsWith('H|'));
    const cmpN = Math.min(xs.length, lines.length);
    let bad = -1;
    for (let i = 0; i < cmpN; i++) {
      if (xs[i] !== lines[i]) { bad = i; break; }
    }
    console.log(`x86 attempts=${xs.length} js attempts=${lines.length} first-divergent=${bad < 0 ? 'NONE(前' + cmpN + '行全等)' : bad + 1}`);
    if (bad >= 0) {
      for (let i = Math.max(0, bad - 2); i < Math.min(cmpN, bad + 4); i++) {
        console.log(`  #${i + 1} x86=${xs[i]} js=${lines[i]}`);
      }
    }
    const okX = xs.filter((l) => l.endsWith('|1')).length;
    const okJ = lines.filter((l) => l.endsWith('|1')).length;
    console.log(`accepts: x86=${okX} js=${okJ}`);
  }
});
