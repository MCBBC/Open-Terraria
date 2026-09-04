// IIII171 批一次性：沙漠 30 幽灵格的 JS 写臂归因（消费 DesertPass __swDsw 取证钩）。
// 用法：cd game && SW_I171WHO=1 npx vitest run tools/_iii171who.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const OUT = process.env.SW_I171_OUT ?? '/tmp/iii171-out';
const W = 4200;

(RUN() ? it : it.skip)('attribute desert ghost wall writers', async () => {
  const diff = JSON.parse(readFileSync(`${OUT}/shape-diff.json`, 'utf8')) as Record<string, { missed: number[][] }>;
  const watch = new Set<string>();
  for (const m of diff['desert']!.missed) watch.add(`${m[0]},${m[1]}`);
  const hits: Array<{ tag: string; x: number; y: number }> = [];
  const region: Array<string> = [];
  let inEntrance = false;
  (globalThis as { __swD56?: (s: string) => void }).__swD56 = (st) => {
    if (st === 'entrance-begin') inEntrance = true;
    else if (st === 'entrance-end') inEntrance = false;
  };
  (globalThis as { __swDsw?: (t: string, x: number, y: number) => void }).__swDsw = (t, x, y) => {
    if (watch.has(`${x},${y}`)) hits.push({ tag: t, x, y });
    if (t.startsWith('h') || t === 'pit' || t.startsWith('kind') || t === 'entgate' || t.startsWith('F') || t.startsWith('G')) region.push(`${t} ${x} ${y}`);
    if (inEntrance && t === 'ce') region.push(`ent ${x} ${y}`);
  };
  try {
    await generateWorld({
      width: W, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true },
    });
  } finally {
    delete (globalThis as { __swDsw?: unknown }).__swDsw;
  }
  const byTag: Record<string, number> = {};
  for (const h of hits) byTag[h.tag] = (byTag[h.tag] ?? 0) + 1;
  console.log(`[i171who] watch=${watch.size} hits=${hits.length} byTag=${JSON.stringify(byTag)}`);
  // 每个 watch 格的 hit 序列
  const per = new Map<string, string[]>();
  for (const h of hits) {
    const k = `${h.x},${h.y}`;
    (per.get(k) ?? per.set(k, []).get(k)!).push(h.tag);
  }
  const lines: string[] = [];
  for (const k of [...per.keys()].sort()) lines.push(`${k}: ${per.get(k)!.join(',')}`);
  writeFileSync(`${OUT}/who-desert.txt`, lines.join('\n'));
  writeFileSync(`${OUT}/who-region.txt`, region.join('\n'));
  console.log(`[i171who] -> ${OUT}/who-desert.txt (${lines.length} cells hit)`);
}, 600_000);

function RUN(): boolean { return process.env.SW_I171WHO === '1'; }
