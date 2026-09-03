// IIII203 批一次性取证仪②：placeLavaTrap 受理面探针（#97 轨域尾差 −9,279 定位）。
// 消费 MicroBiomesPass 既有 segProbe：lavaJ(j)/tAtt([x,y,v])/lavaOk([x,y])/mbEnd。
// 记录全 pass 尝试序列 + 最终受理 (x,y)，并在「微群系」槽末 dump 该点邻域快照。
// 用法：cd game && SW_I203LT=1 npx vitest run tools/_iii203lt.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I203LT === '1';
const OUT = process.env.SW_I203_OUT ?? '/tmp/iii203-out';

(RUN ? it : it.skip)('iii203 lava trap acceptance probe', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  mkdirSync(OUT, { recursive: true });
  const jAtts: Array<{ j: number; x: number; y: number; v: number }> = [];
  const oks: Array<{ x: number; y: number }> = [];
  let curJ = -1;
  let dumpAt: { x: number; y: number } | null = null;
  const oSeg = g.__swSeg as ((n: string, d?: unknown) => void) | undefined;
  g.__swSeg = (n: string, d?: unknown) => {
    if (n === 'lavaJ') curJ = d as number;
    else if (n === 'tAtt') {
      const [x, y, v] = d as [number, number, number];
      jAtts.push({ j: curJ, x, y, v });
    } else if (n === 'lavaOk') {
      const [x, y] = d as [number, number];
      oks.push({ x, y });
    }
    oSeg?.(n, d);
  };
  let storeDump: unknown = null;
  let lavaLine = -1;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1138154190', evil: 0,
    seedFlags: { remix: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn === '微群系' && !storeDump) {
        storeDump = w.store;
        lavaLine = (w as unknown as { lavaLine?: number }).lavaLine ?? -1;
        if (oks.length) dumpAt = oks[oks.length - 1]!;
        const st = w.store as unknown as Record<string, Uint8Array | Uint16Array | Int16Array>;
        const bx = dumpAt?.x ?? 0, by = dumpAt?.y ?? 0;
        const R = 30;
        const out: Record<string, unknown> = { x: bx, y: by, lavaLine, oks: oks.length };
        for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire']) {
          const a = st[c] as Int16Array | Uint16Array | Uint8Array;
          const rows: number[][] = [];
          for (let yy = by - 45; yy <= by + 45; yy++) {
            const row: number[] = [];
            for (let xx = bx - R; xx <= bx + R; xx++) {
              row.push(yy >= 0 && yy < 1200 && xx >= 0 && xx < 4200 ? a[yy * 4200 + xx]! : -1);
            }
            rows.push(row);
          }
          out[c] = rows;
        }
        writeFileSync(`${OUT}/lt-final-region.json`, JSON.stringify(out));
      }
    },
  });
  const last = jAtts.slice(-40);
  const summary = {
    totalAttempts: jAtts.length,
    totalOk: oks.length,
    lastOk: oks[oks.length - 1] ?? null,
    perJ: (() => {
      const m = new Map<number, number>();
      for (const a of jAtts) m.set(a.j, (m.get(a.j) ?? 0) + 1);
      return [...m.entries()];
    })(),
    last: last,
  };
  writeFileSync(`${OUT}/lt-summary.json`, JSON.stringify(summary, null, 1));
  console.log(`[i203lt] attempts=${jAtts.length} oks=${oks.length} lastOk=${JSON.stringify(oks[oks.length - 1] ?? null)}`);
});
