// IIII175 批内容级取证（离线,零 worldgen）：UHBC/全域 箱内容 x86 真值 vs JS 对表。
//   x86 真值 = ~/GoldenChains/golden-remix/w.wld（认证链）;JS 侧 = IIII175 窗仪已产出的
//   /tmp/iii175-out/js/js-chests-final.txt（同 seed 全链生成）。输出:
//   ①同位 loot 差（逐件 vanilla id×stack 对表）②onlyX86/onlyJS 清单③带内计数。
// 用法：cd game && SW_I175CH=1 npx vitest run tools/_iii175chest.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const RUN = process.env.SW_I175CH === '1';
const X86WLD = process.env.SW_I175_WLD ?? `${process.env.HOME}/GoldenChains/golden-remix/w.wld`;
const JS_LIST = process.env.SW_I175_JSLIST ?? '/tmp/iii175-out/js/js-chests-final.txt';

type C = { x: number; y: number; items: Array<{ id: number; stack: number } | null>; name?: string };
let VID: Map<number, number> | null = null;
const toVan = (id: number): number => {
  if (!VID) {
    VID = new Map<number, number>();
    for (const [vidStr, key] of Object.entries(VANILLA_ITEM_KEY_BY_ID)) {
      const iid = ITEM_BY_KEY[key as string];
      if (typeof iid === 'number') VID.set(iid, Number(vidStr));
    }
  }
  return VID.get(id) ?? -1;
};
const lootOf = (c: C, toVanMode = false): string =>
  JSON.stringify(c.items.filter(Boolean).map((i) => `${toVanMode ? toVan(i!.id) : i!.id}x${i!.stack}`));

(RUN ? it : it.skip)('iii175 chest content forensics (offline)', { timeout: 300_000 }, async () => {
  const xw = parseWld(Uint8Array.from(readFileSync(X86WLD)));
  console.log(`I175CH x86 wld chests total=${xw.chests.length}`);
  const jsRaw = readFileSync(JS_LIST, 'utf8').split('\n').filter(Boolean);
  const js: C[] = jsRaw.map((l) => {
    const [pos, loot] = l.split('|');
    const [x, y] = pos!.split(',').map(Number);
    const items = JSON.parse(loot!) as string[];
    return {
      x: x!, y: y!,
      items: items.map((s2) => {
        const m = /^(-?\d+)x(-?\d+)$/.exec(s2)!;
        return { id: Number(m![1]), stack: Number(m![2]) };
      }),
    };
  });
  console.log(`I175CH js chests total=${js.length}`);
  const xk = new Map<string, C>(xw.chests.map((c) => [`${c.x},${c.y}`, c]));
  const jk = new Map<string, C>(js.map((c) => [`${c.x},${c.y}`, c]));
  const onlyX = xw.chests.filter((c) => !jk.has(`${c.x},${c.y}`));
  const onlyJ = js.filter((c) => !xk.has(`${c.x},${c.y}`));
  const both = xw.chests.filter((c) => jk.has(`${c.x},${c.y}`));
  const diff = both.filter((c) => lootOf(c) !== lootOf(jk.get(`${c.x},${c.y}`)!, true));
  console.log(`I175CH both=${both.length} lootDiff=${diff.length} onlyX86=${onlyX.length} onlyJS=${onlyJ.length}`);
  console.log('--- I175CH lootDiff (same pos) ---');
  for (const c of diff) console.log(`I175CH D @(${c.x},${c.y})\n  x86=${lootOf(c)}\n  js =${lootOf(jk.get(`${c.x},${c.y}`)!, true)}`);
  console.log('--- I175CH onlyX86 ---');
  for (const c of onlyX) console.log(`I175CH X @(${c.x},${c.y}) loot=${lootOf(c)}`);
  console.log('--- I175CH onlyJS ---');
  for (const c of onlyJ) console.log(`I175CH J @(${c.x},${c.y}) lootVan=${lootOf(c, true)}`);
});
