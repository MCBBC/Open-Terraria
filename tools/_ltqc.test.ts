// IIII108d 一次性仪：planetoids 快清理槽末(#70) 区域三方对拍（gold #069/#070 vs JS）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
(it as never)('qc slot-end region dump', async () => {
  const W = 4200, H = 1200;
  let st: Record<string, Uint8Array | Uint16Array> | null = null;
  await generateWorld({
    width: W, height: H, seedText: 'planetoids|20260908', evil: 0,
    seedFlags: { roundLandmasses: true },
    onWorldPartial: (w, i) => { if (i === 25) st = w.store as never; },
  });
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const X0 = 300, X1 = 345, Y0 = 220, Y1 = 265;
  const out: string[] = [];
  for (let y = Y0; y <= Y1; y++) {
    const cells: string[] = [];
    for (let x = X0; x <= X1; x++) {
      const k = y * W + x;
      cells.push(`${rec.flags[k]! & 1 ? 'A' : '.'}${rec.type[k]}`);
    }
    out.push(`${y}: ${cells.join(' ')}`);
  }
  writeFileSync('/tmp/iii148-out/js-qc-region.txt', out.join('\n') + '\n');
  console.log('QC-REGION written');
}, 600_000);
