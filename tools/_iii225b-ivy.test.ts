// IIII225b：金标 ivy 箱(2951,694)/(1978,671) 与 JS sink 内容直读
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I225BI === '1';
(RUN ? it : it.skip)('ivy chest dump', { timeout: 600_000 }, async () => {
  const { parseWld } = await import('../src/wld/WldParser');
  const golden = parseWld(readFileSync(`${process.env.HOME}/GoldenChains/golden-gfb-c/w.wld`));
  const lines: string[] = [];
  const near = (c: { x: number; y: number }) =>
    (Math.abs(c.x - 2951) <= 14 && Math.abs(c.y - 694) <= 14) || (Math.abs(c.x - 1978) <= 14 && Math.abs(c.y - 672) <= 14);
  for (const c of golden.chests) {
    if (near(c)) lines.push(`GOLDEN ${c.x},${c.y}: ${c.items.map((it) => (it ? `${it.id}x${it.stack}` : '-')).join(',')}`);
  }
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { ITEM_DEFS } = await import('../src/data/items');
  const i2v = new Map<number, number>();
  for (let i = 0; i < ITEM_DEFS.length; i++) { const m = /^vi_(\d+)_/.exec((ITEM_DEFS[i] as unknown as { key?: string })?.key ?? ''); if (m) i2v.set(i, Number(m[1])); }
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: () => {},
  } as Parameters<typeof generateWorld>[0]);
  for (const c of ((world as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null> }).chests ?? [])) {
    if (!c) continue;
    if (near(c)) lines.push(`JS ${c.x},${c.y}: ${c.items.map((it) => (it && it.id ? `${i2v.get(it.id) ?? 'i' + it.id}x${it.stack}` : '-')).join(',')}`);
  }
  writeFileSync('/tmp/iii225b-out/ivy-dump.txt', lines.join('\n') + '\n');
});
