// KKKKKKK：caverer 带几何日志（JS 侧 __swLL col 相）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const RUN = process.env.SW_K7 === '1';
(RUN ? it : it.skip)('band log', async () => {
  const lines: string[] = [];
  (globalThis as { __swLL?: unknown }).__swLL = (kind: string, x: number, t: number, b: number, c: number) => {
    if (kind === 'col') lines.push(`BAND|${x}|${t}|${b}|${c}`);
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1321365005', evil: 0, seedFlags: { theConstant: true } });
  } finally {
    (globalThis as { __swLL?: unknown }).__swLL = undefined;
  }
  writeFileSync('/tmp/kkk-out/jband.txt', lines.join('\n') + '\n');
  console.log(`[k7] ${lines.length} → /tmp/kkk-out/jband.txt`);
}, 600_000);
