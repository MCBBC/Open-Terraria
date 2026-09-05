// IIII181 批：T226>300 家族坐标取证 v2（终态对拍；一次性诊断）。
// 用法：cd game && SW_I181F=1 npx vitest run tools/_iii181f.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I181F === '1';
const G2 = process.env.SW_I81_G2 ?? String(process.env.HOME) + '/GoldenChains/golden-ddual2';

(RUN ? it : it.skip)('i181 sheet300 forensics v2', { timeout: 900_000 }, async () => {
  const W = 4200, H = 1200, N = W * H;
  const gTyp = new Uint16Array(readFileSync(`${G2}/106_Final_Cleanup.typ`).buffer, 0, N);
  const gAct = new Uint8Array(readFileSync(`${G2}/106_Final_Cleanup.act`).buffer, 0, N);
  let storeRef: { type: Uint16Array; flags: Uint8Array } | null = null;
  await generateWorld({
    width: W, height: H, seedText: 'doubledaringdangers|20260831', evil: 0 as const,
    seedFlags: { dualDungeons: true },
    onWorldPartial: (w) => {
      storeRef = (w.store as unknown) as { type: Uint16Array; flags: Uint8Array };
    },
  } as Parameters<typeof generateWorld>[0]);
  if (!storeRef) throw new Error('store capture failed');
  const st = storeRef;
  const sheet = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheet[i] = s;
  }
  let count = 0;
  const coords: Array<[number, number]> = [];
  const sheetsJ = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const vt = gAct[i] ? gTyp[i]! : 0;
    const ja = st.flags[i]! & 1;
    const jt = ja ? (st.type[i] === 0 ? 0 : sheet[st.type[i]!] ?? 9999) : 0;
    if (vt === 226 && jt !== 226) {
      count++;
      sheetsJ.set(jt, (sheetsJ.get(jt) ?? 0) + 1);
      if (coords.length < 60) coords.push([i % W, (i / W) | 0]);
    }
  }
  console.log(`[i181f] vanilla226(final) cells=${count} js-side sheets=${JSON.stringify([...sheetsJ.entries()])}`);
  console.log(`[i181f] first coords=${JSON.stringify(coords.slice(0, 40))}`);
}, 900_000);
