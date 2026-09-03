// IIII221 取证仪②：site1 (755,501) 墓碑杀级联路径追踪（__swSqfF/__swSeg/掷计数）
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I221T === '1';

(RUN ? it : it.skip)('iii221t sign cascade trace', { timeout: 600_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const lines: string[] = [];
  // 掷计数
  let gln = 0;
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;
  g.__swOnRoll = (v: number, inst?: object) => { gln++; (g as { __swRollN?: number }).__swRollN = gln; oRoll?.(v, inst); };
  // 级联环观察（TrapsPass cascade3x3T 分派前）
  g.__swSqfF = (x: number, y: number, t: number) => {
    if (x >= 753 && x <= 758 && y >= 499 && y <= 504) lines.push(`SQF ${x},${y} t${t} @${gln}`);
  };
  // 引擎分派观察（__swFnt39 → __swFntProbeI39.emit）
  g.__swFntProbeI39 = { emit: (l: string) => lines.push('FNT ' + l), rc: () => gln };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: 'nightofthelivingdead|20260903', evil: 0 as 0,
      seedFlags: { graveyardBloodmoonStart: true },
      onWorldPartial: () => {},
    });
  } finally {
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/iii221-out/trace-sqf.txt', lines.join('\n') + '\n');
    RNGp.reseed = RNGp.reseed;
    g.__swSqfF = undefined;
    g.__swSeg = undefined;
    g.__swOnRoll = oRoll;
  }
});
