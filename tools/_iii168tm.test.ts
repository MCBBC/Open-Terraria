// IIII168 一次性：采神庙 pather 调用序列(__swTmPath)+stages(__swTmMark)+rooms
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const OUT = process.env.SW_I168_OUT ?? '/tmp/iii168-out';
it('capture temple pather trace', async () => {
  const g = globalThis as { __swTmPath?: (s: string) => void; __swTmMark?: (s: string) => void };
  const paths: string[] = []; const marks: string[] = [];
  g.__swTmPath = (s) => paths.push(s);
  g.__swTmMark = (s) => marks.push(s);
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true }, onWorldPartial: () => {},
    });
  } finally { delete g.__swTmPath; delete g.__swTmMark; }
  writeFileSync(`${OUT}/tm-path.json`, JSON.stringify({ paths, marks }));
  console.log(`[i168] pather calls=${paths.length} marks=${marks.length} -> ${OUT}/tm-path.json`);
}, 600_000);
