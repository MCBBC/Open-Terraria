// IIII225b 取证仪⑤：mahogany 树内相位细账（mtag 全捕）+ LTRK 计数掷窗——
// 定位 pass97 内 Δ−18 的藏身点（树尾/AddBuriedChest 掷链 vs 边界）。
// 用法：cd game && SW_I225BM=1 npx vitest run tools/_iii225b-mahog.test.ts
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
const RUN = process.env.SW_I225BM === '1';
const OUT = process.env.SW_I225B_OUT ?? '/tmp/iii225b-out';
(RUN ? it : it.skip)('iii225b mahogany phase ledger', { timeout: 1_200_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  writeFileSync(`${OUT}/mahog-ledger.txt`, '');
  const log = (s: string) => appendFileSync(`${OUT}/mahog-ledger.txt`, s + '\n');
  let rollN = 0;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  const oSeg = g.__swSeg as ((name: string, d?: unknown) => void) | undefined;
  let inWindow = false;
  g.__swSeg = (name: string, d?: unknown) => {
    const n = String(name);
    if (n === 'mbTree') inWindow = true;
    if (n === 'mbTrack') { log(`ANCHOR mbTrack rc=${rollN}`); inWindow = false; }
    if (n === 'mbLavaS' || n === 'mbEnd' || n === 'longTrackCount' || n === 'stdTrackCount') log(`ANCHOR ${n} ${d ?? ''} rc=${rollN}`);
    if (inWindow && /^(m[A-Z]|roots|jitem|chest|Chest|wall|branch|leaf|shape)/i.test(n)) log(`TAG ${n} ${d ?? ''} rc=${rollN}`);
    oSeg?.(name, d);
  };
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
      onWorldPartial: () => {},
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    g.__swSeg = oSeg;
    g.__swOnRoll = oRoll;
  }
});
