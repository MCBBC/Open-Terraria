// IIII198: __swKill190 全域击杀台账——捕 (1435,521) 的凶手
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii198 kill ledger', async () => {
  const g = globalThis as unknown as { __swKill190?: (d: number, x: number, y: number, s: number, fx: number, fy: number) => void };
  const rows: string[] = [];
  g.__swKill190 = (d, x, y, s, fx, fy) => {
    if (x >= 1433 && x <= 1438 && y >= 518 && y <= 524) rows.push(`K ${x},${y} sheet=${s} fx=${fx} fy=${fy}`);
  };
  (g as Record<string, unknown>).__sw118Kt = (tag: string, x: number, y: number) => {
    if (x >= 1433 && x <= 1438 && y >= 518 && y <= 524) rows.push(`${tag} ${x},${y}`);
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1 });
  } finally {
    g.__swKill190 = undefined; delete (g as Record<string, unknown>).__sw118Kt;
  }
  // 终态核查：拿全局 world 壳不可达，改由再次 SW_I81_SAVE 管线落盘——此处仅打印台账结论
  writeFileSync('/tmp/iii198-out/kill-s2.txt', rows.join('\n'));
  console.log(`[kill190] ${rows.length} rows`);
  console.log(rows.join('\n'));
}, 900_000);
