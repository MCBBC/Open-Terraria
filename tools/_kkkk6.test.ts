// KKKKKKK：killTile 尝试日志（caverer 窗对拍）+ 段内局部态
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_K6 === '1';
(RUN ? it : it.skip)('kill attempt log', async () => {
  const lines: string[] = [];
  (globalThis as { __kkkKT?: unknown }).__kkkKT = (x: number, y: number) => {
    if ((x >= 3255 && x <= 3305 && y >= 730 && y <= 780) || (x >= 3625 && x <= 3670 && y >= 735 && y <= 785)) {
      lines.push(`KT|${x}|${y}`);
    }
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1321365005', evil: 0, seedFlags: { theConstant: true } });
  } finally {
    (globalThis as { __kkkKT?: unknown }).__kkkKT = undefined;
  }
  writeFileSync('/tmp/kkk-out/jkt.txt', lines.join('\n') + '\n');
  console.log(`[k6] ${lines.length} kill attempts → /tmp/kkk-out/jkt.txt`);
}, 600_000);
