// IIII198: 差集箱定位——JS 192 箱 vs wld 191 箱,按 (x,y) 差集
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

it('iii198 chest diff', async () => {
  const buf = readFileSync('/Users/vinlic/GoldenChains/i106/x86-iamerror/w.wld');
  const wld = parseWld(new Uint8Array(buf.buffer, buf.byteOffset));
  const vset = new Set(wld.chests.map((c) => `${c.x},${c.y}`));
  const jsChests = (wld as unknown as Record<string, never>) && (await import('../src/world/gen/WorldGen'));
  // 复用 stage 钩:在 slot57 末抓 JS 箱表
  const g = globalThis as unknown as { __swI198Chests?: (c: Array<{ x: number; y: number }>) => void };
  let jsList: Array<{ x: number; y: number }> = [];
  g.__swI198Chests = (c) => { jsList = c; };
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i) => {
      if (i !== 57) return;
      const chests = (w as unknown as { chests: Array<{ x: number; y: number } | null> }).chests;
      g.__swI198Chests?.(chests.filter(Boolean).map((c) => ({ x: c.x, y: c.y })));
    },
  });
  const jset = new Set(jsList.map((c) => `${c.x},${c.y}`));
  const jsOnly = jsList.filter((c) => !vset.has(`${c.x},${c.y}`));
  const vOnly = wld.chests.filter((c) => !jset.has(`${c.x},${c.y}`));
  console.log(`[cx2] js=${jsList.length} wld=${wld.chests.length} JS独有=${jsOnly.length} wld独有=${vOnly.length}`);
  for (const c of jsOnly.slice(0, 8)) console.log('  JS-only:', c.x, c.y);
  for (const c of vOnly.slice(0, 8)) console.log('  WLD-only:', c.x, c.y);
}, 900_000);
