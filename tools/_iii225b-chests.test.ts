// IIII225b 取证仪②：金标 w.wld 箱内物 ↔ JS chest sink 对账（action A：item 掷链
// 隐形掷差搜查——箱物不在八/十一通道内，写全同≠物全同）。
// 用法：cd game && SW_I225BC=1 npx vitest run tools/_iii225b-chests.test.ts
// 产物：/tmp/iii225b-out/chest-items.txt
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const RUN = process.env.SW_I225BC === '1';
const OUT = process.env.SW_I225B_OUT ?? '/tmp/iii225b-out';
const WLD = process.env.SW_I225B_WLD ?? `${process.env.HOME}/GoldenChains/golden-gfb-c/w.wld`;

(RUN ? it : it.skip)('iii225b chest item audit (GFB golden w.wld vs JS sink)', { timeout: 1_200_000 }, async () => {
  const { parseWld } = await import('../src/wld/WldParser');
  const golden = parseWld(readFileSync(WLD));
  const gMap = new Map<number, { items: Array<{ id: number; stack: number } | null> }>();
  for (const c of golden.chests) gMap.set(c.y * 4200 + c.x, { items: c.items });

  const { ITEM_DEFS } = await import('../src/data/items');
  const internalToVid = new Map<number, number>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const key = (ITEM_DEFS[i] as unknown as { key?: string })?.key ?? '';
    const m = /^vi_(\d+)_/.exec(key);
    if (m) internalToVid.set(i, Number(m[1]));
  }

  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const world = await generateWorld({
    width: 4200,
    height: 1200,
    seedText: '9293480',
    evil: 0,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: () => {},
  } as Parameters<typeof generateWorld>[0]);
  const jsChests = (world as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null> }).chests ?? [];
  const jMap = new Map<number, { items: Array<{ id: number; stack: number } | null> }>();
  for (const c of jsChests) { if (!c) continue; jMap.set(c.y * 4200 + c.x, { items: c.items }); }

  const lines: string[] = [];
  lines.push(`golden chests=${golden.chests.length} js chests=${jMap.size}`);
  const keys = new Set([...gMap.keys(), ...jMap.keys()]);
  let onlyG = 0, onlyJ = 0, itemMismatch = 0, itemMatch = 0;
  const norm = (arr: Array<{ id: number; stack: number } | null>, js: boolean) =>
    (arr ?? []).map((it) => {
      if (!it || !it.id) return '-';
      const vid = js ? (internalToVid.get(it.id) ?? `i${it.id}`) : it.id;
      return `${vid}x${it.stack}`;
    }).join(',').replace(/(,-)+$/, '');
  for (const k of keys) {
    const g = gMap.get(k), j = jMap.get(k);
    if (g && !j) { onlyG++; lines.push(`ONLY-GOLDEN ${k % 4200},${Math.trunc(k / 4200)} items=${norm(g.items, false)}`); continue; }
    if (!g && j) { onlyJ++; lines.push(`ONLY-JS ${k % 4200},${Math.trunc(k / 4200)} items=${norm(j.items, true)}`); continue; }
    const gs = norm(g!.items, false), js = norm(j!.items, true);
    if (gs !== js) { itemMismatch++; lines.push(`MISMATCH ${k % 4200},${Math.trunc(k / 4200)} G=[${gs}] J=[${js}]`); }
    else itemMatch++;
  }
  lines.push(`itemMatch=${itemMatch} itemMismatch=${itemMismatch} onlyGolden=${onlyG} onlyJs=${onlyJ}`);
  writeFileSync(`${OUT}/chest-items.txt`, lines.join('\n') + '\n');
});
