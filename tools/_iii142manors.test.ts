// ★IIIII110b 一次性取证仪：manors builder 分相掷耗单窗反演（JS 侧）。
// 捕获面：①房屋 attempt 台账 H|x|y|res|tag|genCount（与 x86 SW_HOUSELOG 同構）
//         ②builder 分相台账 S|tag|a|b|c|d|genCount（__swHouseStage）
//         ③房屋 pass 窗内 genRand 掷值流 R|seq|value（genRand 单实例过滤）
// 用法：SW142_MSEED='abandonedmanors|20260904' SW142_MFLAGS=biggerAbandonedHouses \
//   SW142_MOUT=/tmp/iii142-out/manors-js npx vitest run tools/_iii142manors.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const SEED = process.env.SW142_MSEED ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW142_MFLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW142_MOUT ?? '/tmp/iii142-out/manors-js';

(!!SEED ? it : it.skip)('III142 manors builder window', { timeout: 900_000 }, async () => {
  const g = globalThis as unknown as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swHouseEv?: (phase: string, x: number, y: number) => void;
    __swHouseStage?: (tag: string, a: number, b: number, c: number, d: number) => void;
    __swRollN?: number;
  };
  const hRows: string[] = [];
  const sRows: string[] = [];
  const pcRows: string[] = [];
  const vals: number[] = [];
  let genCount = 0;
  let captureInst: object | null = null;
  let pendingAnchor = false;
  let capturing = false;
  g.__swOnRoll = (v: number, inst: object) => {
    if (pendingAnchor && !captureInst) { captureInst = inst; pendingAnchor = false; }
    if (!captureInst || inst !== captureInst) return;
    genCount++;
    if (capturing) vals.push(v | 0);
  };
  g.__swHouseEv = (phase: string, x: number, y: number) => {
    if (phase === 'try' && !capturing) { capturing = true; pendingAnchor = true; }   // 首尝试起锚定主流实例并开值捕获
    if (phase === 'ok' || phase === 'no') {
      hRows.push(`H|${x}|${y}|${phase === 'ok' ? 1 : 0}|pl|${hRows.length + 1}|${genCount}`);
    }
  };
  g.__swHouseStage = (tag: string, a: number, b: number, c: number, d: number) => {
    sRows.push(`S|${tag}|${a}|${b}|${c}|${d}|${genCount}`);
  };
  (g as { __swPcEv?: (row: string) => void }).__swPcEv = (row: string) => {
    pcRows.push(`${row}|${genCount}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    });
  } finally {
    g.__swOnRoll = undefined; g.__swHouseEv = undefined; g.__swHouseStage = undefined;
  }
  writeFileSync(OUT + '-houses.txt', hRows.join('\n') + '\n');
  writeFileSync(OUT + '-stages.txt', sRows.join('\n') + '\n');
  writeFileSync(OUT + '-pc.txt', pcRows.join('\n') + '\n');
  writeFileSync(OUT + '-rolls.txt', vals.map((v, i) => `R|${i + 1}|${v}`).join('\n') + '\n');
  const ok = hRows.filter((h) => h.includes('|1|pl')).length;
  console.log(`JS manors attempts=${hRows.length} accepts=${ok} rollsInWindow=${vals.length}`);
});
