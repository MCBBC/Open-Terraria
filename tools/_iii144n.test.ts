// IIII110b(涂装链):neg Piles 窗派发探针——装 __swFntProbeI39 钩,捕获
// frameImportantDispatch 区域内 TI 事件(是否派发 CheckBanner/Check3x2/Check1x2)。
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('III144N neg piles dispatch probe', async () => {
  const OUT = process.env.SW_I144N_OUT ?? '/tmp/iii144p-out';
  const BOX = (process.env.SW_I144N_BOX ?? '2920,2945,105,125').split(',').map(Number);
  const rows: string[] = [];
  const g = globalThis as { __swFntProbeI39?: { emit?: (l: string) => void; rc?: () => number } | null };
  g.__swFntProbeI39 = {
    emit: (l: string) => {
      // l 形如 "TI|x,y|sheet" / "TF|x,y|rc"
      const parts = l.split('|');
      if (parts.length >= 2) {
        const coord = parts[1]!.split(',');
        const x = Number(coord[0]), y = Number(coord[1]);
        if (x >= BOX[0] && x <= BOX[1] && y >= BOX[2] && y <= BOX[3]) rows.push(l);
      }
    },
  };
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: `1.1.1.0.negativeinfinity|106109`,
      evil: -1,
    });
  } finally {
    writeFileSync(`${OUT}/neg-ti.txt`, rows.join('\n') + '\n');
    console.log(`[I144N] rows=${rows.length}`);
    console.log(rows.filter((r) => r.includes(',11') || r.includes(',12')).slice(0, 40).join('\n'));
    g.__swFntProbeI39 = undefined;
  }
}, 900_000);
